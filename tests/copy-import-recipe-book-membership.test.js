/**
 * Issue #701 — copy-mode recipe-id regeneration + recipe-book membership remap.
 *
 * Copy-mode `prepareForImport` regenerates every recipe id (previously it merely
 * stripped them and let the downstream `Recipe` constructor mint fresh ones) and
 * atomically remaps each `recipeItemDefinitions[].recipeIds` membership array to the
 * regenerated ids, so a copy's books resolve to the copy's recipes. Without the
 * remap every book in an imported copy pointed at dead pre-import ids and rendered
 * empty, and a faithful copy import reported every membership entry as a broken
 * `RECIPE_ITEM` reference.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

let _idCounter = 0;
globalThis.foundry = {
  utils: { randomID: () => `rid-${++_idCounter}` },
};
globalThis.game = { user: { isGM: true }, packs: [] };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null;

const { prepareForImport } = await import('../src/systems/CraftingSystemExporter.js');
const { resolveImportReferences } = await import('../src/systems/importReferenceResolver.js');
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');

/**
 * Build a payload whose single book (`recipeItemDefinitions[0]`) is a member of two
 * of its three recipes, plus an optional deliberately-dangling membership id.
 */
function buildMembershipPayload({ danglingId = null } = {}) {
  const recipeIds = ['recipe-a', 'recipe-b'];
  if (danglingId) recipeIds.push(danglingId);
  return {
    schemaVersion: 2,
    fabricateVersion: '1.16.0',
    exportedAt: '2026-07-18T00:00:00.000Z',
    runtimeStateIncluded: false,
    system: {
      id: 'sys-books',
      name: 'Books System',
      enabled: true,
      components: [],
      recipeItemDefinitions: [{ id: 'book-1', name: 'Alchemist Journal', recipeIds }],
    },
    recipes: [
      { id: 'recipe-a', name: 'Recipe A', craftingSystemId: '__SYSTEM_ID__' },
      { id: 'recipe-b', name: 'Recipe B', craftingSystemId: '__SYSTEM_ID__' },
      { id: 'recipe-c', name: 'Recipe C', craftingSystemId: '__SYSTEM_ID__' },
    ],
    gatheringEnvironments: [],
    gatheringConfig: { system: {}, shared: {} },
  };
}

function makeMockSystemManager() {
  const systems = new Map();
  return {
    getSystems: () => [...systems.values()],
    getSystem: (id) => systems.get(id) || null,
    createSystem: async (data) => {
      const sys = structuredClone({ ...data, id: data.id || `sys-new-${systems.size + 1}` });
      systems.set(sys.id, sys);
      return structuredClone(sys);
    },
    updateSystem: async (id, data) => {
      const sys = structuredClone({ ...data, id });
      systems.set(id, sys);
      return structuredClone(sys);
    },
  };
}

function makeMockRecipeManager() {
  const recipes = new Map();
  return {
    getRecipe: (id) => recipes.get(id) || null,
    createRecipe: async (data) => {
      recipes.set(data.id, structuredClone(data));
      return data;
    },
    updateRecipe: async (id, data) => {
      recipes.set(id, structuredClone(data));
      return data;
    },
    notifyRecipesChanged: () => {},
    _recipes: recipes,
  };
}

test('#701 copy-mode regenerates recipe ids and remaps book membership to them', () => {
  const prepared = prepareForImport(buildMembershipPayload(), 'copy');

  const newIds = prepared.recipes.map((r) => r.id);
  // Every recipe id is fresh (regenerated, not stripped).
  for (const [i, id] of newIds.entries()) {
    assert.ok(id, `recipe ${i} has a regenerated id`);
    assert.ok(
      !['recipe-a', 'recipe-b', 'recipe-c'].includes(id),
      `recipe ${i} id is not a pre-import id`
    );
  }

  // Book membership now points at the copy's regenerated recipe ids (in order).
  const membership = prepared.system.recipeItemDefinitions[0].recipeIds;
  assert.deepEqual(
    membership,
    [newIds[0], newIds[1]],
    'membership remapped to the regenerated ids for recipe-a and recipe-b'
  );
  // recipe-c was never a member and is not added.
  assert.ok(!membership.includes(newIds[2]), 'a non-member recipe is not spuriously added');
});

test('#701 a faithful copy import reports zero broken RECIPE_ITEM references', async () => {
  const prepared = prepareForImport(buildMembershipPayload(), 'copy');
  const { unresolvedReferences } = await resolveImportReferences(
    {
      system: prepared.system,
      recipes: prepared.recipes,
      gatheringConfig: prepared.gatheringConfig,
    },
    { resolveUuid: async () => null }
  );

  const brokenMembership = unresolvedReferences.filter(
    (ref) => ref.kind === 'recipeItem' && ref.ownerType === 'recipeItem'
  );
  assert.equal(brokenMembership.length, 0, 'no membership entry dangles after the copy transform');
});

test('#701 end-to-end: an imported copy persists books whose recipeIds resolve to the copy', async () => {
  const prepared = prepareForImport(buildMembershipPayload(), 'copy');
  const systemManager = makeMockSystemManager();
  const recipeManager = makeMockRecipeManager();
  const importer = new CompendiumImporter(systemManager, recipeManager, { isGM: () => true });

  const summary = await importer.importFromPackData(prepared);

  // The created system's book membership resolves to recipes that were imported.
  const created = systemManager.getSystems()[0];
  const membership = created.recipeItemDefinitions[0].recipeIds;
  assert.equal(membership.length, 2, 'both memberships persisted');
  for (const rid of membership) {
    assert.ok(recipeManager.getRecipe(rid), `membership id ${rid} resolves to an imported recipe`);
  }

  const brokenMembership = summary.unresolvedReferences.filter(
    (ref) => ref.kind === 'recipeItem' && ref.ownerType === 'recipeItem'
  );
  assert.equal(brokenMembership.length, 0, 'the import report shows zero broken book memberships');
});

test('#701 a genuinely dangling membership entry is preserved verbatim and reported', async () => {
  const prepared = prepareForImport(buildMembershipPayload({ danglingId: 'recipe-ghost' }), 'copy');

  const membership = prepared.system.recipeItemDefinitions[0].recipeIds;
  assert.ok(
    membership.includes('recipe-ghost'),
    'a membership id naming no recipe in the payload survives verbatim'
  );

  const { unresolvedReferences } = await resolveImportReferences(
    {
      system: prepared.system,
      recipes: prepared.recipes,
      gatheringConfig: prepared.gatheringConfig,
    },
    { resolveUuid: async () => null }
  );
  const reported = unresolvedReferences.filter(
    (ref) => ref.kind === 'recipeItem' && ref.ownerType === 'recipeItem'
  );
  assert.equal(reported.length, 1, 'exactly the dangling membership entry is reported');
  assert.equal(reported[0].referenceValue, 'recipe-ghost');
});

test('#701 keep-mode preserves recipe ids and book membership verbatim', () => {
  const prepared = prepareForImport(buildMembershipPayload(), 'keep');

  assert.deepEqual(
    prepared.recipes.map((r) => r.id),
    ['recipe-a', 'recipe-b', 'recipe-c'],
    'keep-mode leaves recipe ids untouched'
  );
  assert.deepEqual(
    prepared.system.recipeItemDefinitions[0].recipeIds,
    ['recipe-a', 'recipe-b'],
    'keep-mode leaves book membership untouched'
  );
});
