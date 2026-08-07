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
 *    control for it is the ESSENCE-ONLY SET below — a real, unmocked instance of a
 *    persistence-level abort in this exact cascade, which is what a simulated one was
 *    standing in for.
 *  - **Criterion 16.** A bulk delete of 3 essences across 2 shared recipes issues a counted,
 *    bounded number of world writes, and the un-batched per-essence shape exceeds it.
 *    Pinned for a non-alchemy AND an alchemy system, because the alchemy reconciliation
 *    issues further `recipes` writes after the non-alchemy bound is measured.
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

/**
 * A recipe whose ONLY requirement is a first-class essence OPTION — the shape that
 * exposed the stale `set.ingredients` mirror (issue 1036). `IngredientSet` derives that
 * flat mirror from the first option of each group, so this set persists as
 * `ingredients: [<the essence option>]`, and a strip that rewrote only `ingredientGroups`
 * left the mirror naming an essence the delete had already removed from
 * `essenceDefinitions`.
 */
function recipeRequiringOnlyEssence(id, essenceId, overrides = {}) {
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
          {
            id: `${id}-grp`,
            name: 'Essence',
            options: [{ match: { type: 'essence', essenceId, amount: 2 } }],
          },
        ],
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...overrides,
  };
}

function makeFixture({ essenceDefinitions, recipes = [], resolutionMode = 'simple' } = {}) {
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
      resolutionMode,
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

// ---------------------------------------------------------------------------
// The essence-only ingredient set — the REAL persistence-level abort
//
// This is what the criterion-15 negative control used to SIMULATE by monkey-patching
// `_validateRecipeForPersistence`. It needs no simulation: a set whose only requirement
// is the deleted essence keeps a stale flat `ingredients` mirror (which `IngredientSet`
// derives from the first option of each group and `toJSON` emits alongside the groups),
// the retention filter reads that mirror and RETAINS the set, and the retained set names
// an essence `deleteEssence` has already removed from `essenceDefinitions` in memory.
// `_validateEssenceReferences` then raises at PERSISTENCE level and `updateRecipe` throws
// — with the definitions and the component essence maps already destroyed in memory and
// NOTHING written, so the next unrelated `save()` from any other GM action commits the
// destruction.
//
// Both tests below FAIL before the `set.ingredients` rewrite and pass after it.
// ---------------------------------------------------------------------------

test('1036/15: a set whose ONLY requirement is the deleted essence is DROPPED, not retained', async () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire' })],
    recipes: [recipeRequiringOnlyEssence('r1', 'fire', { enabled: true })],
  });
  settingWrites.length = 0;

  const removed = await manager.deleteEssence(SYSTEM_ID, 'fire');

  assert.equal(removed, true, 'the cascade completed instead of aborting at persistence');
  const rewritten = recipeManager.recipes.get('r1').toJSON();
  assert.deepEqual(rewritten.ingredientSets, [], 'the essence-only set was dropped');
  assert.equal(
    rewritten.enabled,
    false,
    'a recipe left with no ingredient sets is clamped to disabled (clause 5)'
  );
  assert.deepEqual(
    manager.getSystem(SYSTEM_ID).essenceDefinitions,
    [],
    'the definition really was removed'
  );
  assert.deepEqual(
    manager.getSystem(SYSTEM_ID).components.find((component) => component.id === 'comp-b')
      .essences,
    {},
    'and the carrying component was stripped'
  );
  assert.ok(countWrites('craftingSystems') >= 1, 'the system was PERSISTED, not left in memory only');
  assert.ok(countWrites('recipes') >= 1, 'and so was the rewritten recipe');
});

test('1036/15: the same input through the SET form completes and persists too', async () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire' }), makeEssence({ id: 'water' })],
    recipes: [
      recipeRequiringOnlyEssence('r1', 'fire', { enabled: true }),
      recipeRequiring('r2', { water: 1 }, { enabled: true }),
    ],
  });
  settingWrites.length = 0;

  const result = await manager.deleteEssences(SYSTEM_ID, ['fire', 'water']);

  assert.deepEqual(result, {
    deleted: 2,
    essenceIds: ['fire', 'water'],
    recipesUpdated: 2,
    // The set form multiplies the abort: one bad recipe took the whole selection with it.
  });
  assert.deepEqual(
    recipeManager.recipes.get('r1').toJSON().ingredientSets,
    [],
    'the essence-only set was dropped for the set form too'
  );
  assert.deepEqual(
    Object.keys(recipeManager.recipes.get('r2').toJSON().ingredientSets[0].essences),
    [],
    'and the ordinary per-set map recipe was rewritten in the same pass'
  );
  assert.equal(countWrites('craftingSystems'), 1);
  assert.equal(countWrites('recipes'), 1);
});

test('1036: a SURVIVING set does not RESURRECT the deleted essence through the stale mirror', async () => {
  // The second live instance of the same defect, and it survives the retention filter
  // for a different reason. This set keeps a legacy per-set map for `water`, so it is
  // retained however `ingredients` reads — and `IngredientSet`'s constructor rebuilds its
  // groups from `data.ingredients` whenever `ingredientGroups` is EMPTY
  // (`IngredientSet.js:33-36`). A stale mirror therefore re-materialises the stripped
  // `fire` option as a fresh group, and persistence validation raises on it.
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire' }), makeEssence({ id: 'water' })],
    recipes: [
      recipeRequiringOnlyEssence('r1', 'fire', {
        enabled: true,
        ingredientSets: [
          {
            id: 'r1-set',
            name: 'Primary',
            essences: { water: 1 },
            ingredientGroups: [
              {
                id: 'r1-grp',
                name: 'Essence',
                options: [{ match: { type: 'essence', essenceId: 'fire', amount: 2 } }],
              },
            ],
          },
        ],
      }),
    ],
  });

  await manager.deleteEssence(SYSTEM_ID, 'fire');

  const set = recipeManager.recipes.get('r1').toJSON().ingredientSets[0];
  assert.deepEqual(set.ingredientGroups, [], 'the essence-only group is gone and stays gone');
  assert.deepEqual(set.ingredients, [], 'the flat mirror went with it');
  assert.deepEqual(set.essences, { water: 1 }, 'and the set survives on its remaining requirement');
});

test('1036: the flat mirror is DERIVED from the stripped groups, never filtered in place', async () => {
  // A group whose essence option is stripped but which still carries a component option
  // must surface THAT option in `ingredients` — which is what `IngredientSet` itself
  // would derive. Asserted on `_stripEssenceFromSets` directly because the `Recipe`
  // round-trip re-derives the mirror whenever the groups are non-empty, and would
  // therefore hide a wrong answer here.
  const { manager } = makeFixture({ essenceDefinitions: [makeEssence({ id: 'fire' })] });

  const [stripped] = manager._stripEssenceFromSets(
    [
      {
        id: 'set-1',
        ingredientGroups: [
          {
            id: 'grp-1',
            options: [
              { match: { type: 'essence', essenceId: 'fire', amount: 2 } },
              { match: { type: 'component', componentId: 'comp-a' }, quantity: 1 },
            ],
          },
        ],
        ingredients: [{ match: { type: 'essence', essenceId: 'fire', amount: 2 } }],
      },
    ],
    'fire'
  );

  assert.deepEqual(
    stripped.ingredients.map((ingredient) => ingredient.match?.type),
    ['component'],
    'the mirror names the surviving component option, not the deleted essence and not nothing'
  );
});

test('1036: a LEGACY flat set with no groups at all is filtered in place, not emptied', async () => {
  // The one shape with no groups to mirror: its own array is the authority, so the strip
  // must remove the essence entry and KEEP the rest rather than deriving `[]` from the
  // absent groups and dropping a live requirement.
  const { manager } = makeFixture({ essenceDefinitions: [makeEssence({ id: 'fire' })] });

  const [stripped] = manager._stripEssenceFromSets(
    [
      {
        id: 'set-1',
        ingredients: [
          { match: { type: 'essence', essenceId: 'fire', amount: 2 } },
          { match: { type: 'component', componentId: 'comp-a' }, quantity: 1 },
        ],
      },
    ],
    'fire'
  );

  assert.deepEqual(
    stripped.ingredients.map((ingredient) => ingredient.match?.type),
    ['component'],
    'the legacy flat set kept its component requirement'
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

test('1036/16: a NON-ALCHEMY bulk delete of 3 essences across 2 shared recipes issues exactly 2 world writes', async () => {
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
  assert.equal(
    settingWrites.length,
    2,
    'and nothing else was written at all — for a NON-ALCHEMY system; the alchemy bound is below'
  );

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

// ---------------------------------------------------------------------------
// ALCHEMY MODE — the reason `deleteEssences` reconciles, and the reason
// `applyBulkEditToEssences` routes through `updateSystem` rather than `save()`
//
// Without an alchemy-mode fixture the whole alchemy half of both primitives is inert:
// `_reconcileAlchemySignaturesAfterDeletion` self-guards on `resolutionMode`, and
// `updateSystem`'s `_assertNoAlchemySignatureCollisions` does too.
// ---------------------------------------------------------------------------

/** A recipe whose groups are supplied verbatim, for signature-shaped fixtures. */
function recipeWithGroups(id, groups, overrides = {}) {
  return {
    id,
    name: `Recipe ${id}`,
    craftingSystemId: SYSTEM_ID,
    category: 'general',
    enabled: true,
    ingredientSets: [{ id: `${id}-set`, name: 'Primary', ingredientGroups: groups }],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...overrides,
  };
}

const IRON_GROUP = (id) => ({
  id,
  name: 'Metal',
  options: [{ match: { type: 'component', componentId: 'comp-a' }, quantity: 1 }],
});

/**
 * Two enabled alchemy recipes that DO NOT collide while `fire` exists — `r2` additionally
 * requires a fire essence, so its signature strictly dominates `r1`'s — and that collapse
 * onto one identical signature the moment `fire` is deleted and its now-optionless group
 * is dropped. This is exactly the hazard clause 10 exists for.
 */
function alchemyCollapseFixture() {
  return makeFixture({
    resolutionMode: 'alchemy',
    essenceDefinitions: [makeEssence({ id: 'fire' })],
    recipes: [
      recipeWithGroups('r1', [IRON_GROUP('r1-grp')]),
      recipeWithGroups('r2', [
        IRON_GROUP('r2-grp'),
        {
          id: 'r2-grp-essence',
          name: 'Essence',
          options: [{ match: { type: 'essence', essenceId: 'fire', amount: 1 } }],
        },
      ]),
    ],
  });
}

test('1036/10: an alchemy delete RECONCILES the signatures the strip collapsed', async () => {
  const { manager, recipeManager } = alchemyCollapseFixture();
  assert.equal(recipeManager.recipes.get('r1').enabled, true, 'sanity: no collision beforehand');
  assert.equal(recipeManager.recipes.get('r2').enabled, true);

  await manager.deleteEssences(SYSTEM_ID, ['fire']);

  assert.equal(
    recipeManager.recipes.get('r1').enabled,
    false,
    'stripping the essence collapsed r2 onto r1 and BOTH were disabled'
  );
  assert.equal(recipeManager.recipes.get('r2').enabled, false);
});

test('1036/10 negative control: the same delete on a SIMPLE system disables nothing', async () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire' })],
    recipes: [
      recipeWithGroups('r1', [IRON_GROUP('r1-grp')]),
      recipeWithGroups('r2', [
        IRON_GROUP('r2-grp'),
        {
          id: 'r2-grp-essence',
          name: 'Essence',
          options: [{ match: { type: 'essence', essenceId: 'fire', amount: 1 } }],
        },
      ]),
    ],
  });

  await manager.deleteEssences(SYSTEM_ID, ['fire']);

  assert.equal(
    recipeManager.recipes.get('r2').enabled,
    true,
    'signature uniqueness is an ALCHEMY invariant — the reconciliation self-guards'
  );
});

test('1036/16: the ALCHEMY write bound is 3, not 2 — reconciliation writes again after the batch', async () => {
  const { manager } = alchemyCollapseFixture();
  settingWrites.length = 0;

  await manager.deleteEssences(SYSTEM_ID, ['fire']);

  assert.equal(countWrites('craftingSystems'), 1, 'still ONE craftingSystems write');
  assert.equal(
    countWrites('recipes'),
    2,
    'the batched cascade write, PLUS the one disableSignatureConflicts issues after it'
  );
  assert.equal(settingWrites.length, 3, 'so "exactly 2" is a non-alchemy bound, not a universal one');
});

test('1036/5: a recipe left with no ingredient sets is clamped to DISABLED by the set form', async () => {
  const { manager, recipeManager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire' })],
    recipes: [recipeRequiringOnlyEssence('r1', 'fire', { enabled: true })],
  });

  await manager.deleteEssences(SYSTEM_ID, ['fire']);

  assert.equal(
    recipeManager.recipes.get('r1').enabled,
    false,
    'a recipe stripped of its only requirement is persisted as a disabled shell, never left craftable'
  );
});

test('1036: deleteEssences NOTIFIES the systems-changed subscribers', async () => {
  const { manager } = makeFixture({ essenceDefinitions: [makeEssence({ id: 'fire' })] });
  let notifications = 0;
  manager._notifySystemsChanged = () => {
    notifications += 1;
  };

  await manager.deleteEssences(SYSTEM_ID, ['fire']);

  assert.equal(notifications, 1, 'exactly one hook for the whole batch — and never zero');
});

// ---------------------------------------------------------------------------
// The GM gate on both new primitives
//
// "Test seams are omnipotent": no fake in this suite refuses a write, so a missing
// `_assertGM` on a world-setting writer is invisible to `npm test` unless it is
// enumerated. Both of these write `craftingSystems` (and `recipes`).
// ---------------------------------------------------------------------------

test('1036: both set-apply primitives are GM-gated, and a refused call writes NOTHING', async () => {
  const { manager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', colorToken: 'rose' })],
    recipes: [recipeRequiring('r1', { fire: 1 })],
  });
  settingWrites.length = 0;
  game.user.isGM = false;

  try {
    await assert.rejects(
      () => manager.applyBulkEditToEssences(SYSTEM_ID, ['fire'], { enabled: false }),
      /GM permissions required: apply a bulk edit to essences/,
      'applyBulkEditToEssences is gated'
    );
    await assert.rejects(
      () => manager.deleteEssences(SYSTEM_ID, ['fire']),
      /GM permissions required: delete essences/,
      'deleteEssences is gated'
    );
  } finally {
    game.user.isGM = true;
  }

  assert.equal(settingWrites.length, 0, 'neither refusal reached a world setting');
  assert.deepEqual(
    manager.getSystem(SYSTEM_ID).essenceDefinitions.map((def) => [def.id, def.enabled]),
    [['fire', true]],
    'and neither mutated the in-memory system either'
  );
});

test('1036 negative control: the SAME two calls succeed for a GM', async () => {
  const { manager } = makeFixture({
    essenceDefinitions: [makeEssence({ id: 'fire', colorToken: 'rose' })],
    recipes: [recipeRequiring('r1', { fire: 1 })],
  });

  await manager.applyBulkEditToEssences(SYSTEM_ID, ['fire'], { enabled: false });
  assert.equal(manager.getSystem(SYSTEM_ID).essenceDefinitions[0].enabled, false);
  assert.deepEqual((await manager.deleteEssences(SYSTEM_ID, ['fire'])).essenceIds, ['fire']);
});

// ---------------------------------------------------------------------------
// Criterion 5 (delta rule 5) — the `updateSystem` ROUTING is the alchemy guard
// ---------------------------------------------------------------------------

test('1036: a bulk essence edit is BLOCKED while the alchemy system carries a signature collision', async () => {
  // Spec 007 §Alchemy Uniqueness Revalidation: "Any detected collision blocks saves
  // globally until resolved, including saves from unrelated recipe edits." That block
  // lives in `updateSystem`, so it applies to this primitive ONLY because the primitive
  // routes through it. `system.essenceDefinitions = next; await this.save()` would issue
  // the identical single `craftingSystems` write and commit the edit regardless.
  const { manager } = makeFixture({
    resolutionMode: 'alchemy',
    essenceDefinitions: [makeEssence({ id: 'fire', colorToken: 'rose' })],
    recipes: [
      recipeWithGroups('r1', [IRON_GROUP('r1-grp')]),
      recipeWithGroups('r2', [IRON_GROUP('r2-grp')]),
    ],
  });
  settingWrites.length = 0;

  await assert.rejects(
    () => manager.applyBulkEditToEssences(SYSTEM_ID, ['fire'], { enabled: false }),
    /alchemy ingredient signature collision/,
    'the edit is refused, not silently applied'
  );

  assert.deepEqual(
    manager.getSystem(SYSTEM_ID).essenceDefinitions.map((def) => [def.id, def.enabled, def.colorToken]),
    [['fire', true, 'rose']],
    'and the stored definitions are untouched — nothing was half-applied'
  );
  assert.equal(settingWrites.length, 0, 'the block lands BEFORE the write, so there is nothing to revert');
});

test('1036 negative control: the same edit lands once the collision is resolved', async () => {
  const { manager } = makeFixture({
    resolutionMode: 'alchemy',
    essenceDefinitions: [makeEssence({ id: 'fire', colorToken: 'rose' })],
    recipes: [
      recipeWithGroups('r1', [IRON_GROUP('r1-grp')]),
      recipeWithGroups('r2', [IRON_GROUP('r2-grp')], { enabled: false }),
    ],
  });

  const result = await manager.applyBulkEditToEssences(SYSTEM_ID, ['fire'], { enabled: false });

  assert.equal(result.updated, 1, 'the fixture was not rejecting for some unrelated reason');
  assert.equal(manager.getSystem(SYSTEM_ID).essenceDefinitions[0].enabled, false);
});
