/**
 * Issue 1055 — the check-modifier authority across export -> import.
 *
 * The world-side `1.20.0` migration cannot help a bundle: an import arrives as JSON and
 * never passes through the settings the runner reads. `migrateExportPayload` mirrors the
 * derivation for the import path, and this drives the whole chain a GM actually takes —
 * `buildExportPayload` -> `prepareForImport` -> `CompendiumImporter.importFromPackData`
 * — rather than the derivation in isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++idCounter}`,
    getProperty: (object, path) =>
      String(path)
        .split('.')
        .reduce((value, key) => (value == null ? undefined : value[key]), object),
  },
};
globalThis.game = { packs: [], fabricate: null, user: { isGM: true } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null;

const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');
const { buildExportPayload, prepareForImport, validateImportData } = await import(
  '../src/systems/CraftingSystemExporter.js'
);

const AUTHORITY = 'recipeModifierAuthority';

function exportedSystem(craftingCheck = {}) {
  return {
    id: 'sys-legacy',
    name: 'Legacy Herbalism',
    components: [],
    craftingCheck: {
      checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['med'],
      ...craftingCheck,
    },
  };
}

function exportedRecipe(craftingModifier, id = 'r-1') {
  return {
    id,
    name: 'Healing Salve',
    craftingSystemId: '__SYSTEM_ID__',
    ingredientSets: [],
    resultGroups: [],
    ...(craftingModifier === undefined ? {} : { craftingModifier }),
  };
}

/** A pre-1055 bundle: no authority key anywhere, a legacy delegating policy. */
function legacyBundle({ system = exportedSystem(), recipes = [] } = {}) {
  return { fabricateVersion: '1.5.0', system, recipes };
}

function makeSystemManager({ systems = [], created = [], updated = [] } = {}) {
  return {
    getSystems: () => systems,
    createSystem: async (data) => {
      const system = { ...data, id: data.id || 'new-system-id' };
      created.push(system);
      return system;
    },
    updateSystem: async (id, data) => {
      const system = { ...data, id };
      updated.push(system);
      return system;
    },
  };
}

function makeRecipeManager({ created = [], updated = [], persisted = [] } = {}) {
  const store = new Map(persisted.map((recipe) => [recipe.id, { ...recipe }]));
  return {
    getRecipe: (id) => store.get(id) ?? null,
    getRecipes: (filters = {}) =>
      [...store.values()].filter(
        (recipe) =>
          filters.craftingSystemId === undefined ||
          recipe.craftingSystemId === filters.craftingSystemId
      ),
    createRecipe: async (data) => {
      created.push(data);
      store.set(data.id, { ...data });
      return data;
    },
    updateRecipe: async (id, data) => {
      updated.push(data);
      store.set(id, { ...data });
      return data;
    },
    deleteRecipe: async (id) => store.delete(id),
    cleanupOrphanedRecipeFlags: async () => {},
    notifyRecipesChanged: () => {},
    save: async () => {},
  };
}

// ---------------------------------------------------------------------------
// prepareForImport derives the level before the importer ever sees the payload
// ---------------------------------------------------------------------------

test('prepareForImport derives setAndRule for a legacy bundle whose recipes carry overrides', () => {
  const packData = prepareForImport(
    legacyBundle({ recipes: [exportedRecipe({ policy: 'byRecipe', modifierIds: ['med'] })] })
  );
  assert.equal(packData.system.craftingCheck[AUTHORITY], 'setAndRule');
  assert.equal(
    packData.recipes[0].craftingModifier.policy,
    'addAll',
    'and the retired rule is rewritten on the way in'
  );
});

test('prepareForImport derives setAndRule from a legacy system-level byRecipe policy', () => {
  const packData = prepareForImport(
    legacyBundle({ system: exportedSystem({ defaultModifierPolicy: 'byRecipe' }) })
  );
  assert.equal(packData.system.craftingCheck.defaultModifierPolicy, 'addAll');
  assert.equal(packData.system.craftingCheck[AUTHORITY], 'setAndRule');
});

test('prepareForImport derives none for a bundle that never delegated', () => {
  const packData = prepareForImport(legacyBundle({ recipes: [exportedRecipe(undefined)] }));
  assert.equal(packData.system.craftingCheck[AUTHORITY], 'none');
});

test('validateImportData accepts a bundle carrying the new authority field', () => {
  const result = validateImportData(
    legacyBundle({ system: exportedSystem({ [AUTHORITY]: 'setOnly' }) })
  );
  assert.equal(result.valid, true, result.errors.join('; '));
});

// ---------------------------------------------------------------------------
// The importer itself
// ---------------------------------------------------------------------------

test('importing a legacy bundle creates a system carrying the derived authority', async () => {
  const created = [];
  const importer = new CompendiumImporter(
    makeSystemManager({ created }),
    makeRecipeManager({ created: [] })
  );

  const summary = await importer.importFromPackData(
    prepareForImport(
      legacyBundle({ recipes: [exportedRecipe({ policy: 'byRecipe', modifierIds: ['med'] })] })
    )
  );

  assert.equal(summary.system.created, true);
  assert.equal(created[0].craftingCheck[AUTHORITY], 'setAndRule');
});

test('importing a bundle that never delegated creates it undelegated', async () => {
  const created = [];
  const importer = new CompendiumImporter(makeSystemManager({ created }), makeRecipeManager());
  await importer.importFromPackData(
    prepareForImport(legacyBundle({ recipes: [exportedRecipe(undefined)] }))
  );
  assert.equal(created[0].craftingCheck[AUTHORITY], 'none');
});

test('an OVERWRITE import replaces the existing check block wholesale (issue 1055, accepted)', async () => {
  // `updateSystem` shallow-merges only the TOP level, so an incoming `craftingCheck`
  // replaces the existing one entirely. The incoming block always carries a derived
  // level, so the GM's local choice is superseded by the bundle's — accepted, because
  // the level is a property of the bundle's own recipes and is re-authorable in one
  // click. What must NOT happen is a silent drop to an unresolved key on a system that
  // had one, which would leave the authoring card showing a level nobody chose.
  const updated = [];
  const existing = {
    id: 'sys-legacy',
    name: 'Legacy Herbalism',
    craftingCheck: { [AUTHORITY]: 'none', defaultModifierPolicy: 'highest' },
  };
  const importer = new CompendiumImporter(
    makeSystemManager({ systems: [existing], updated }),
    makeRecipeManager()
  );

  const summary = await importer.importFromPackData(
    prepareForImport(
      legacyBundle({ recipes: [exportedRecipe({ modifierIds: ['med'] })] })
    ),
    { overwriteExisting: true }
  );

  assert.equal(summary.collisions[0].resolution, 'overwritten');
  assert.equal(
    updated[0].craftingCheck[AUTHORITY],
    'setAndRule',
    'the incoming block wins wholesale, and it carries a RESOLVED level'
  );
});

test('a non-overwrite import of an existing system writes nothing at all', async () => {
  const created = [];
  const updated = [];
  const existing = { id: 'sys-legacy', name: 'Legacy Herbalism', craftingCheck: {} };
  const importer = new CompendiumImporter(
    makeSystemManager({ systems: [existing], created, updated }),
    makeRecipeManager()
  );

  const summary = await importer.importFromPackData(prepareForImport(legacyBundle()));

  assert.equal(summary.system.skipped, true);
  assert.deepEqual([created.length, updated.length], [0, 0]);
});

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

test('export -> import round-trips the authored authority and every recipe override', async () => {
  const source = {
    id: 'sys-round',
    name: 'Round Trip',
    components: [],
    craftingCheck: {
      checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
      defaultModifierPolicy: 'highest',
      defaultModifierIds: ['med'],
      [AUTHORITY]: 'setOnly',
    },
  };
  const sourceRecipes = [
    { id: 'r-set', name: 'Subset', craftingSystemId: 'sys-round', craftingModifier: { modifierIds: ['med'] } },
    // The one shape a truthiness test silently loses.
    { id: 'r-empty', name: 'Empty', craftingSystemId: 'sys-round', craftingModifier: { modifierIds: [] } },
    { id: 'r-plain', name: 'Plain', craftingSystemId: 'sys-round', craftingModifier: null },
  ];

  const payload = buildExportPayload(source, sourceRecipes, '2.0.0');
  assert.equal(payload.system.craftingCheck[AUTHORITY], 'setOnly', 'the level is exported');

  const created = [];
  const createdRecipes = [];
  const importer = new CompendiumImporter(
    makeSystemManager({ created }),
    makeRecipeManager({ created: createdRecipes })
  );
  // Round-trip through JSON, which is what a real import reads.
  await importer.importFromPackData(prepareForImport(JSON.parse(JSON.stringify(payload))));

  assert.equal(
    created[0].craftingCheck[AUTHORITY],
    'setOnly',
    'an authored level survives the round trip — it is not re-derived as setAndRule'
  );
  const byId = new Map(createdRecipes.map((recipe) => [recipe.id, recipe]));
  assert.deepEqual(byId.get('r-set').craftingModifier, { modifierIds: ['med'] });
  assert.deepEqual(
    byId.get('r-empty').craftingModifier,
    { modifierIds: [] },
    'an authored EMPTY set survives as an override, not as an absence'
  );
  assert.equal(byId.get('r-plain').craftingModifier, null);
});
