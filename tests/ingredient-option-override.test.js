/**
 * Tests for issue 552: player-facing per-slot ingredient option overrides.
 *
 * Covers the ONE resolver seam (IngredientSet.resolveIngredientSelection) both
 * consumers route through, plus the RecipeManager display projection:
 *   - an override selects a satisfiable non-default option (it wins)
 *   - an override to a SHORT option reports THAT option's have/need (no fallback)
 *   - a tag-stack override consumes the chosen held item
 *   - a currency override routes to currencySpends (decision 3)
 *   - NO override is byte-for-byte the first-satisfiable default
 *   - an out-of-range override falls back to the default
 *   - evaluateCraftability display (ingredientStates + ingredientChoices) reflects
 *     the SAME option the resolver consumes (display == consumed, issue 553)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((v, k) => (v == null ? undefined : v[k]), object);
}

let _idCounter = 0;
globalThis.foundry = {
  utils: { randomID: () => `id-${++_idCounter}`, getProperty },
  applications: {
    api: {
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      ApplicationV2: class {
        async _prepareContext() {
          return {};
        }
        close() {}
      },
    },
  },
};
globalThis.game = { user: { isGM: true }, fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.ChatMessage = { create: () => {}, getSpeaker: () => ({}) };

const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

function makeItem(uuid, quantity = 1) {
  return { uuid, id: uuid, name: uuid, img: null, system: { quantity }, getFlag: () => undefined };
}
function makeTagItem(uuid, tags, quantity = 1) {
  return {
    uuid,
    id: uuid,
    name: uuid,
    img: `img/${uuid}.webp`,
    system: { quantity },
    getFlag: (_scope, key) => (key === 'fabricate.tags' ? tags : undefined),
  };
}
function makeComponentItem(uuid, registeredItemUuid, quantity = 1) {
  return {
    uuid,
    id: uuid,
    name: uuid,
    img: null,
    system: { quantity },
    flags: { core: { sourceId: registeredItemUuid } },
    getFlag: () => undefined,
  };
}
function group(options, id) {
  return { id: id || foundry.utils.randomID(), name: 'Herb slot', options };
}
function makeSet(groups) {
  return IngredientSet.fromJSON({ ingredientGroups: groups });
}
function makeActor(items) {
  const arr = [...items];
  return { items: arr };
}

function makeSystemManager(systemId, components, essenceDefinitions = []) {
  return {
    user: { isGM: true },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (id) => (id === systemId ? { id: systemId, features: {}, components, managedItems: components, essenceDefinitions } : null),
      }),
      getResolutionModeService: () => null,
    },
  };
}

// ── Resolver: satisfiable override wins ─────────────────────────────────────
test('override selects a satisfiable non-default option (it wins over the default)', () => {
  const g = group([{ itemUuid: 'red', quantity: 1 }, { itemUuid: 'blue', quantity: 1 }], 'g1');
  const set = makeSet([g]);
  const items = [makeItem('red', 5), makeItem('blue', 5)];

  const dflt = set.resolveIngredientSelection(items);
  assert.equal(dflt.selectedIngredients[0].itemUuid, 'red', 'default picks the first option');

  const overridden = set.resolveIngredientSelection(items, null, {
    optionOverrides: { g1: { optionIndex: 1 } },
  });
  assert.equal(overridden.success, true);
  assert.equal(overridden.selectedIngredients[0].itemUuid, 'blue', 'override selects the second option');
  assert.equal(overridden.plan[0].item.uuid, 'blue', 'consumes the overridden option');
});

// ── Resolver: short override reports THAT option's have/need (no fallback) ───
test('override to a short option reports its own have/need and does not fall back', () => {
  const g = group([{ itemUuid: 'red', quantity: 1 }, { itemUuid: 'blue', quantity: 3 }], 'g1');
  const set = makeSet([g]);
  const items = [makeItem('red', 5), makeItem('blue', 1)];

  const overridden = set.resolveIngredientSelection(items, null, {
    optionOverrides: { g1: { optionIndex: 1 } },
  });
  assert.equal(overridden.success, false, 'the short chosen option makes the group missing');
  assert.equal(overridden.missingGroups.length, 1);
  assert.equal(overridden.missingGroups[0].have, 1, 'reports the chosen option have');
  assert.equal(overridden.missingGroups[0].need, 3, 'reports the chosen option need');
  assert.equal(overridden.missingGroups[0].ingredient.itemUuid, 'blue', 'no silent redirect to the satisfiable option');
});

// ── Resolver: tag-stack override consumes the chosen held item ──────────────
test('a heldItemId override consumes the specific chosen held stack', () => {
  const g = group([{ itemUuid: 'metal', quantity: 1 }], 'g1');
  const set = makeSet([g]);
  const items = [makeItem('metal-a', 2), makeItem('metal-b', 2)];
  // Custom matcher: both stacks satisfy the single tag-like option.
  const matcher = (_ingredient, item) => item.uuid.startsWith('metal-');

  const dflt = set.resolveIngredientSelection(items, matcher);
  assert.equal(dflt.plan[0].item.uuid, 'metal-a', 'default consumes the first matching stack');

  const overridden = set.resolveIngredientSelection(items, matcher, {
    optionOverrides: { g1: { optionIndex: 0, heldItemId: 'metal-b' } },
  });
  assert.equal(overridden.success, true);
  assert.equal(overridden.plan[0].item.uuid, 'metal-b', 'override consumes the chosen held stack');
});

// ── Resolver: currency override routes to currencySpends (decision 3) ───────
test('a currency override routes an available-item group to currencySpends when affordable', () => {
  const g = group(
    [{ itemUuid: 'red', quantity: 1 }, { match: { type: 'currency', unit: 'gp', amount: 50 }, quantity: 1 }],
    'g1'
  );
  const set = makeSet([g]);
  const items = [makeItem('red', 5)];

  // Default: items beat currency (preserve IngredientSet behaviour).
  const dflt = set.resolveIngredientSelection(items, null, { affordCurrency: () => true });
  assert.equal(dflt.plan.length, 1, 'default consumes the item');
  assert.equal(dflt.currencySpends.length, 0, 'default spends no currency');

  // Explicit override picks the currency alternative over the available item.
  const overridden = set.resolveIngredientSelection(items, null, {
    affordCurrency: () => true,
    optionOverrides: { g1: { optionIndex: 1 } },
  });
  assert.equal(overridden.success, true);
  assert.equal(overridden.plan.length, 0, 'no item consumed on the currency override');
  assert.deepEqual(overridden.currencySpends[0], {
    unit: 'gp',
    amount: 50,
    ingredient: overridden.selectedIngredients[0],
  });
});

test('an unaffordable currency override makes the group missing', () => {
  const g = group([{ match: { type: 'currency', unit: 'gp', amount: 50 }, quantity: 1 }], 'g1');
  const set = makeSet([g]);
  const overridden = set.resolveIngredientSelection([], null, {
    affordCurrency: () => false,
    optionOverrides: { g1: { optionIndex: 0 } },
  });
  assert.equal(overridden.success, false);
  assert.equal(overridden.currencySpends.length, 0);
  assert.equal(overridden.missingGroups.length, 1);
});

// ── Resolver: no override = byte-for-byte default; out-of-range falls back ──
test('no override is byte-for-byte the first-satisfiable default', () => {
  const g = group([{ itemUuid: 'red', quantity: 1 }, { itemUuid: 'blue', quantity: 1 }], 'g1');
  const set = makeSet([g]);
  const items = [makeItem('red', 5), makeItem('blue', 5)];

  const a = set.resolveIngredientSelection(items);
  const b = set.resolveIngredientSelection(items, null, {});
  const c = set.resolveIngredientSelection(items, null, { optionOverrides: {} });
  assert.equal(a.selectedIngredients[0].itemUuid, 'red');
  assert.equal(b.selectedIngredients[0].itemUuid, 'red');
  assert.equal(c.selectedIngredients[0].itemUuid, 'red');
});

test('an out-of-range override index falls back to the default resolution', () => {
  const g = group([{ itemUuid: 'red', quantity: 1 }, { itemUuid: 'blue', quantity: 1 }], 'g1');
  const set = makeSet([g]);
  const items = [makeItem('red', 5), makeItem('blue', 5)];
  const overridden = set.resolveIngredientSelection(items, null, {
    optionOverrides: { g1: { optionIndex: 9 } },
  });
  assert.equal(overridden.selectedIngredients[0].itemUuid, 'red', 'invalid index → default');
});

// ── Display == consumed: evaluateCraftability reflects the chosen option ────
test('evaluateCraftability display picks the SAME option the resolver consumes', () => {
  const systemId = 'sys-1';
  const components = [
    { id: 'cmp-a', name: 'Red Herb', registeredItemUuid: 'reg-a', img: 'a.webp' },
    { id: 'cmp-b', name: 'Blue Herb', registeredItemUuid: 'reg-b', img: 'b.webp' },
  ];
  globalThis.game = makeSystemManager(systemId, components);
  const manager = new RecipeManager();

  const g = group(
    [{ match: { type: 'component', componentId: 'cmp-a' }, quantity: 1 }, { match: { type: 'component', componentId: 'cmp-b' }, quantity: 1 }],
    'g1'
  );
  const set = makeSet([g]);
  const recipe = new Recipe({
    name: 'Potion',
    craftingSystemId: systemId,
    ingredientSets: [set.toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  const actor = makeActor([makeComponentItem('i-a', 'reg-a', 2), makeComponentItem('i-b', 'reg-b', 2)]);

  // Default display: chose option A.
  const dflt = manager.evaluateCraftability([actor], recipe);
  assert.equal(dflt.ingredientStates[0].componentId, 'cmp-a', 'default tile shows option A');
  const dfltChoice = dflt.ingredientChoices.find((c) => c.kind === 'option');
  assert.ok(dfltChoice, 'a multi-option group emits an option choice');
  assert.equal(dfltChoice.selectedOptionIndex, 0);
  assert.equal(dfltChoice.options.length, 2);
  assert.equal(dflt.ingredientStates[0].hasChoice, true, 'tile flagged as having a choice');
  assert.equal(dflt.ingredientStates[0].choiceCount, 2);

  // Override display: chose option B — the tile flips to B.
  const overrides = { g1: { optionIndex: 1 } };
  const overridden = manager.evaluateCraftability([actor], recipe, { optionOverrides: overrides });
  assert.equal(overridden.ingredientStates[0].componentId, 'cmp-b', 'override tile shows option B');
  assert.equal(overridden.ingredientChoices.find((c) => c.kind === 'option').selectedOptionIndex, 1);

  // The engine's consumption seam resolves the SAME option B with the same override.
  const consumed = recipe.ingredientSets[0].resolveIngredientSelection(
    [...actor.items],
    (ingredient, item) => manager.ingredientMatchesItem(recipe, ingredient, item),
    { optionOverrides: overrides }
  );
  assert.equal(consumed.selectedIngredients[0].match.componentId, 'cmp-b', 'display == consumed');
});

test('an insufficient overridden option is selectable-but-flagged (not craftable)', () => {
  const systemId = 'sys-1';
  const components = [
    { id: 'cmp-a', name: 'Red Herb', registeredItemUuid: 'reg-a' },
    { id: 'cmp-b', name: 'Blue Herb', registeredItemUuid: 'reg-b' },
  ];
  globalThis.game = makeSystemManager(systemId, components);
  const manager = new RecipeManager();

  const g = group(
    [{ match: { type: 'component', componentId: 'cmp-a' }, quantity: 1 }, { match: { type: 'component', componentId: 'cmp-b' }, quantity: 1 }],
    'g1'
  );
  const recipe = new Recipe({
    name: 'Potion',
    craftingSystemId: systemId,
    ingredientSets: [makeSet([g]).toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  // Only option A is owned; overriding to B (owned: none) must block.
  const actor = makeActor([makeComponentItem('i-a', 'reg-a', 2)]);
  const overridden = manager.evaluateCraftability([actor], recipe, {
    optionOverrides: { g1: { optionIndex: 1 } },
  });
  assert.equal(overridden.canCraft, false, 'the short chosen option blocks the craft');
  assert.equal(overridden.ingredientStates[0].satisfied, false);
  assert.equal(overridden.ingredientStates[0].componentId, 'cmp-b', 'still shows the chosen option');
});

test('mixed OR choices carry authored essence icon metadata without an aura image', () => {
  const systemId = 'sys-essence-choice';
  const components = [
    { id: 'cmp-a', name: 'Red Herb', registeredItemUuid: 'reg-a', img: 'a.webp' },
  ];
  globalThis.game = makeSystemManager(systemId, components, [
    { id: 'restorative', name: 'Restorative', icon: 'fas fa-heart' },
  ]);
  const manager = new RecipeManager();
  const g = group(
    [
      { match: { type: 'component', componentId: 'cmp-a' }, quantity: 1 },
      { match: { type: 'essence', essenceId: 'restorative', amount: 2 }, quantity: 1 },
    ],
    'g-essence-choice'
  );
  const recipe = new Recipe({
    name: 'Restorative Potion',
    craftingSystemId: systemId,
    ingredientSets: [makeSet([g]).toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });

  const result = manager.evaluateCraftability(
    [makeActor([makeComponentItem('i-a', 'reg-a', 2)])],
    recipe
  );
  const essence = result.ingredientChoices[0].options[1];
  assert.equal(essence.isEssence, true);
  assert.equal(essence.icon, 'fas fa-heart');
  assert.equal(essence.img, null);
  assert.notEqual(essence.img, 'icons/svg/aura.svg');
});

test('a tag option matching multiple held stacks emits a stack choice', () => {
  const systemId = 'sys-1';
  globalThis.game = makeSystemManager(systemId, []);
  const manager = new RecipeManager();

  const g = group([{ match: { type: 'tags', tags: ['metal'], tagMatch: 'any' }, quantity: 1 }], 'g1');
  const recipe = new Recipe({
    name: 'Ingot',
    craftingSystemId: systemId,
    ingredientSets: [makeSet([g]).toJSON()],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  const actor = makeActor([makeTagItem('iron', ['metal'], 3), makeTagItem('copper', ['metal'], 3)]);

  const result = manager.evaluateCraftability([actor], recipe);
  const stackChoice = result.ingredientChoices.find((c) => c.kind === 'stack');
  assert.ok(stackChoice, 'a single tag option matching >1 held stack emits a stack choice');
  assert.equal(stackChoice.stacks.length, 2);
  assert.equal(result.ingredientStates[0].hasChoice, true);
});
