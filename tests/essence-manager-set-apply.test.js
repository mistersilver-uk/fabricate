/**
 * Issue 1036 — the essence set-apply write primitives and the activation blocker.
 *
 * `CraftingSystemManager.applyBulkEditToEssences` and `deleteEssences` are the manager-side
 * primitives behind the Essence Studio's bulk edit and bulk delete. Both managers are REAL
 * here, with only the world-setting write instrumented, so `updateRecipe`'s persistence
 * validation and activation gate run for real and the write counts are the counts a world
 * would actually see.
 *
 * The three facts with teeth:
 *
 *  - **Criterion 3.** A disabled essence BLOCKS ENABLING a recipe that requires it, does not
 *    retro-disable an already-enabled one, and the block is reported as a coded issue.
 *  - **Criterion 15.** Because that blocker is ACTIVATION-only and never persistence-level,
 *    deleting one of two disabled essences a recipe requires completes and persists. The
 *    negative control shows the cascade WOULD have thrown had the blocker been raised at
 *    persistence level.
 *  - **Criterion 16.** A bulk delete of 3 essences across 2 shared recipes issues a counted,
 *    bounded number of world writes, and the un-batched per-essence shape exceeds it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

let idSeq = 0;
let managerRef = null;
const settingWrites = [];

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${(idSeq += 1)}`,
    getProperty: (object, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], object),
  },
};
globalThis.game = {
  user: { isGM: true },
  actors: [],
  i18n: { localize: (key) => key, format: (key) => key },
  fabricate: { getCraftingSystemManager: () => managerRef },
  settings: {
    get: () => undefined,
    set: async (_namespace, key) => {
      settingWrites.push(key);
    },
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.Hooks = { callAll: () => {} };
console.debug = () => {};

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeActivationError } = await import('../src/systems/RecipeActivationError.js');
const { makeEssence } = await import('./helpers/essenceFixtures.js');

const SYSTEM_ID = 'sys-1036';

/** A complete, craftable recipe requiring the named essences through the per-set map. */
function recipeRequiring(id, essences, overrides = {}) {
  return {
    id,
    name: `Recipe ${id}`,
    craftingSystemId: SYSTEM_ID,
    category: 'general',
    enabled: false,
    ingredientSets: [
      {
        id: `${id}-set`,
        name: 'Primary',
        ingredientGroups: [
          { id: `${id}-grp`, name: 'Ingredients', options: [{ componentId: 'comp-a', quantity: 1 }] },
        ],
        essences,
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...overrides,
  };
}

function makeFixture({ essenceDefinitions, recipes = [] } = {}) {
  settingWrites.length = 0;
  const recipeManager = new RecipeManager();
  recipeManager.initialized = true;
  for (const data of recipes) recipeManager.recipes.set(data.id, new Recipe(data));

  const manager = new CraftingSystemManager(recipeManager);
  manager.initialized = true;
  manager.systems.set(
    SYSTEM_ID,
    manager._normalizeSystem({
      id: SYSTEM_ID,
      name: 'Alchemy',
      features: { essences: true },
      components: [
        { id: 'comp-a', name: 'Iron' },
        { id: 'comp-b', name: 'Wood', essences: { fire: 2 } },
      ],
      essenceDefinitions,
    })
  );
  managerRef = manager;
  return { manager, recipeManager };
}

function countWrites(key) {
  return settingWrites.filter((written) => written === key).length;
}

// ---------------------------------------------------------------------------
// Criterion 3 — the activation blocker
// ---------------------------------------------------------------------------

test('1036/3: a DISABLED essence blocks enabling a recipe that requires it', async () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', enabled: false })],
    recipes: [recipeRequiring('r1', { fire: 2 })],
  });
  assert.ok(manager.getSystem(SYSTEM_ID));

  await assert.rejects(
    () => recipeManager.updateRecipe('r1', { enabled: true }),
    RecipeActivationError,
    'the enable is refused'
  );
});

test('1036/3 negative control: the SAME recipe enables once the essence is enabled', async () => {
  const { recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', enabled: true })],
    recipes: [recipeRequiring('r1', { fire: 2 })],
  });

  const updated = await recipeManager.updateRecipe('r1', { enabled: true });
  assert.equal(updated.enabled, true, 'nothing else in the fixture was blocking the enable');
});

test('1036/3: the blocker is a CODED, id-free issue naming the essence', async () => {
  const { recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', name: 'Fire', enabled: false })],
    recipes: [recipeRequiring('r1', { fire: 2 })],
  });

  const activation = recipeManager._validateRecipeForActivation(
    Recipe.fromJSON({ ...recipeRequiring('r1', { fire: 2 }), enabled: true })
  );
  const issue = activation.issues.find((entry) => entry.code === 'ingredientSetDisabledEssence');
  assert.ok(issue, 'the coded issue is raised');
  assert.equal(issue.params.essence, 'Fire', 'it names the essence, not its id');
  assert.equal(issue.params.set, 'Primary', 'and the ingredient set by its authored name');
});

test('1036/3: a first-class essence OPTION is blocked too, and reported ONCE per set', () => {
  const { recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', name: 'Fire', enabled: false })],
  });
  const data = recipeRequiring('r1', { fire: 2 });
  data.ingredientSets[0].ingredientGroups[0].options.push({
    match: { type: 'essence', essenceId: 'fire', amount: 1 },
  });

  const validation = recipeManager._validateEnabledEssenceReferences(Recipe.fromJSON(data));
  const raised = validation.issues.filter(
    (issue) => issue.code === 'ingredientSetDisabledEssence'
  );
  assert.equal(raised.length, 1, 'one set naming one essence twice is ONE authoring fact');
});

test('1036/3: the blocker is subordinate to the features.essences master switch', () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', enabled: false })],
  });
  const system = manager.getSystem(SYSTEM_ID);
  system.features.essences = false;
  // `_resolveEssenceValidationSystem` honours the legacy `enableEssences` alias too, so a
  // half-off fixture would prove nothing about the master switch.
  system.enableEssences = false;

  const validation = recipeManager._validateEnabledEssenceReferences(
    Recipe.fromJSON(recipeRequiring('r1', { fire: 2 }))
  );
  assert.equal(validation.valid, true, 'essences off ⇒ nothing to block');
});

test('1036/3: disabling an essence does NOT retro-disable an already-enabled recipe', async () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', enabled: true })],
    recipes: [recipeRequiring('r1', { fire: 2 }, { enabled: true })],
  });

  await manager.applyBulkEditToEssences(SYSTEM_ID, ['fire'], { enabled: false });

  assert.equal(
    recipeManager.recipes.get('r1').enabled,
    true,
    'the activation gate fires only on a false -> true transition'
  );
  // ... and an ordinary edit to the still-enabled recipe still SAVES.
  const saved = await recipeManager.updateRecipe('r1', { name: 'Renamed' });
  assert.equal(saved.name, 'Renamed', 'a recipe may still be SAVED while requiring a disabled essence');
});

// ---------------------------------------------------------------------------
// applyBulkEditToEssences
// ---------------------------------------------------------------------------

test('1036: applyBulkEditToEssences applies icon, colour and status in ONE craftingSystems write', async () => {
  const { manager } = makeFixture({
    essenceDefinitions: [
      makeEssence({ id: 'fire', colorToken: 'rose' }),
      makeEssence({ id: 'water', colorToken: 'aqua' }),
      makeEssence({ id: 'air', colorToken: 'mist' }),
    ],
  });
  settingWrites.length = 0;

  const result = await manager.applyBulkEditToEssences(SYSTEM_ID, ['fire', 'water'], {
    icon: 'fas fa-star',
    colorToken: null,
    enabled: false,
  });

  const definitions = manager.getSystem(SYSTEM_ID).essenceDefinitions;
  assert.equal(result.updated, 2);
  assert.deepEqual(
    definitions.map((def) => [def.id, def.icon, def.colorToken, def.enabled]),
    [
      ['fire', 'fas fa-star', null, false],
      ['water', 'fas fa-star', null, false],
      ['air', 'fas fa-fire', 'mist', true],
    ],
    'the two selected essences changed on all three axes; the unselected one is untouched'
  );
  assert.equal(countWrites('craftingSystems'), 1, 'exactly one world write');
});

test('1036: applyBulkEditToEssences is presence-gated — an empty edit writes nothing', async () => {
  const { manager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', colorToken: 'rose' })],
  });
  settingWrites.length = 0;

  const result = await manager.applyBulkEditToEssences(SYSTEM_ID, ['fire'], {});

  assert.deepEqual(result, { updated: 0, essenceIds: [] });
  assert.equal(countWrites('craftingSystems'), 0, 'an unstaged apply issues no write at all');
  assert.equal(manager.getSystem(SYSTEM_ID).essenceDefinitions[0].colorToken, 'rose');
});

test('1036: a staged `enabled: false` and `colorToken: null` are FALSY BUT REAL', async () => {
  const { manager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', colorToken: 'rose', enabled: true })],
  });

  await manager.applyBulkEditToEssences(SYSTEM_ID, ['fire'], { colorToken: null });
  assert.equal(manager.getSystem(SYSTEM_ID).essenceDefinitions[0].colorToken, null, 'Clear colour landed');

  await manager.applyBulkEditToEssences(SYSTEM_ID, ['fire'], { enabled: false });
  assert.equal(manager.getSystem(SYSTEM_ID).essenceDefinitions[0].enabled, false, 'Disable landed');
});

// ---------------------------------------------------------------------------
// Criterion 15 — the delete cascade completes past a second disabled essence
// ---------------------------------------------------------------------------

test('1036/15: deleting one of TWO disabled essences a recipe requires completes and persists', async () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [
      makeEssence({ id: 'fire', enabled: false }),
      makeEssence({ id: 'water', enabled: false }),
    ],
    recipes: [recipeRequiring('r1', { fire: 2, water: 1 }, { enabled: true })],
  });
  settingWrites.length = 0;

  const removed = await manager.deleteEssence(SYSTEM_ID, 'fire');

  assert.equal(removed, true, 'the delete completed');
  assert.deepEqual(
    Object.keys(recipeManager.recipes.get('r1').toJSON().ingredientSets[0].essences),
    ['water'],
    'the recipe was rewritten and still names the SECOND disabled essence'
  );
  assert.ok(countWrites('craftingSystems') >= 1, 'the system was persisted');
});

test('1036/15 negative control: the same cascade WOULD throw with a persistence-level blocker', async () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [
      makeEssence({ id: 'fire', enabled: false }),
      makeEssence({ id: 'water', enabled: false }),
    ],
    recipes: [recipeRequiring('r1', { fire: 2, water: 1 }, { enabled: true })],
  });

  // Simulate the r2 placement the review rejected: raise the disabled-essence issue from
  // the PERSISTENCE validator instead of the activation one. `updateRecipe` throws on a
  // persistence issue regardless of `allowIncomplete`, so the cascade aborts mid-write.
  const persistenceValidator = recipeManager._validateRecipeForPersistence.bind(recipeManager);
  recipeManager._validateRecipeForPersistence = (recipe, options) => {
    const base = persistenceValidator(recipe, options);
    const disabled = recipeManager._validateEnabledEssenceReferences(recipe);
    const issues = [...base.issues, ...disabled.issues];
    return { valid: issues.length === 0, errors: issues.map((issue) => issue.message), issues };
  };

  await assert.rejects(
    () => manager.deleteEssence(SYSTEM_ID, 'fire'),
    /could not be saved|Recipe/i,
    'a persistence-level blocker aborts the cascade — which is why it lives in the activation validator'
  );
});

// ---------------------------------------------------------------------------
// Criterion 16 — the batched bulk delete
// ---------------------------------------------------------------------------

/** Three essences, two recipes, each recipe naming two of the three. */
function bulkDeleteFixture() {
  return makeFixture({
    essenceDefinitions: [
      makeEssence({ id: 'fire' }),
      makeEssence({ id: 'water' }),
      makeEssence({ id: 'air' }),
      makeEssence({ id: 'earth' }),
    ],
    recipes: [
      recipeRequiring('r1', { fire: 1, water: 1 }),
      recipeRequiring('r2', { water: 1, air: 1 }),
    ],
  });
}

test('1036/16: a bulk delete of 3 essences across 2 shared recipes issues exactly 2 world writes', async () => {
  const { manager, recipeManager } = bulkDeleteFixture();
  settingWrites.length = 0;

  const result = await manager.deleteEssences(SYSTEM_ID, ['fire', 'water', 'air']);

  assert.deepEqual(result, {
    deleted: 3,
    essenceIds: ['fire', 'water', 'air'],
    recipesUpdated: 2,
  });
  assert.equal(countWrites('craftingSystems'), 1, 'ONE craftingSystems write');
  assert.equal(countWrites('recipes'), 1, 'ONE recipes write — not one per rewritten recipe');
  assert.equal(settingWrites.length, 2, 'and nothing else was written at all');

  assert.deepEqual(
    manager.getSystem(SYSTEM_ID).essenceDefinitions.map((def) => def.id),
    ['earth'],
    'the unselected essence survives'
  );
  for (const id of ['r1', 'r2']) {
    assert.deepEqual(
      Object.keys(recipeManager.recipes.get(id).toJSON().ingredientSets[0].essences),
      [],
      `${id} was rewritten once and lost every deleted essence`
    );
  }
});

test('1036/16 negative control: the un-batched per-essence shape exceeds that bound', async () => {
  const { manager } = bulkDeleteFixture();
  settingWrites.length = 0;

  for (const essenceId of ['fire', 'water', 'air']) {
    await manager.deleteEssence(SYSTEM_ID, essenceId);
  }

  assert.ok(
    settingWrites.length > 2,
    `the naive loop issued ${settingWrites.length} world writes against the batch's 2`
  );
  assert.ok(
    countWrites('recipes') > 1,
    'and more than one recipes write, each a full replace plus a client-wide hook'
  );
});

test('1036: deleteEssences strips every deleted essence from carrying components', async () => {
  const { manager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire' }), makeEssence({ id: 'water' })],
  });
  const system = manager.getSystem(SYSTEM_ID);
  system.components.find((component) => component.id === 'comp-b').essences = { fire: 2, water: 1 };

  await manager.deleteEssences(SYSTEM_ID, ['fire']);

  assert.deepEqual(
    system.components.find((component) => component.id === 'comp-b').essences,
    { water: 1 },
    'the deleted essence is stripped and the surviving one is untouched'
  );
});

test('1036: deleteEssences ignores unknown ids and is a no-op for an empty selection', async () => {
  const { manager } = makeFixture({ essenceDefinitions: [makeEssence({ id: 'fire' })] });
  settingWrites.length = 0;

  assert.deepEqual(await manager.deleteEssences(SYSTEM_ID, ['ghost']), {
    deleted: 0,
    essenceIds: [],
    recipesUpdated: 0,
  });
  assert.deepEqual(await manager.deleteEssences(SYSTEM_ID, []), {
    deleted: 0,
    essenceIds: [],
    recipesUpdated: 0,
  });
  assert.equal(settingWrites.length, 0, 'neither issued a world write');
});
