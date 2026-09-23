/** `recipeDisplayStates` driven directly through its seam bag, covering the branches reachable
 * only through a full craftability evaluation and therefore asserted nowhere else. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEssencePool,
  buildEssenceStates,
  buildIngredientChoices,
  buildIngredientStates,
  buildShoppingRequirement,
  chosenOptionByGroup,
  displayGroups,
  resolveGroupDescription,
  resolveIngredientDescription,
  resolveIngredientVisual,
  shoppingIngredientKey,
} from '../../src/systems/recipeDisplayStates.js';

// Foundry globals required to load RecipeManager.js, which composes this module's seam bag.
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${Math.random()}`,
    getProperty: (obj, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], obj),
  },
};
globalThis.game = {
  user: { isGM: true },
  actors: [],
  fabricate: {},
  settings: { get: () => undefined, set: async () => undefined },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { RecipeManager } = await import('../../src/systems/RecipeManager.js');

/** The literal `FALLBACK_COMPONENT_IMG` in `RecipeManager.js` and `GENERIC_ITEM_IMG` here share. */
const BAG_IMG = 'icons/svg/item-bag.svg';
const COIN_IMG = 'icons/svg/coins.svg';

const RECIPE = { id: 'r-1', craftingSystemId: 'sys-1' };

/** An owned item: `readStackQuantity` reads `system.quantity`. */
function item({ id, name = id, img = null, tags = [], componentId = null, quantity = 1 }) {
  return { id, uuid: `Item.${id}`, name, img, tags, componentId, system: { quantity } };
}

const componentOption = (componentId, quantity = 1) => ({
  quantity,
  match: { type: 'component', componentId },
});
const tagOption = (tags, quantity = 1) => ({ quantity, match: { type: 'tags', tags } });
const essenceOption = (essenceId, amount) => ({ match: { type: 'essence', essenceId, amount } });
const currencyOption = (unit, amount) => ({ match: { type: 'currency', unit, amount } });

/** A seam bag whose every entry is a function of the recipe it is handed. */
function makeDeps({
  components = {},
  essences = {},
  essenceNames = null,
  currencyUnits = [],
  systemComponents = [],
  accumulated = {},
} = {}) {
  return {
    matchesItem: (_recipe, ingredient, owned) => {
      const match = ingredient?.match || null;
      if (match?.type === 'component') return owned.componentId === match.componentId;
      if (match?.type === 'tags') return (match.tags || []).some((tag) => owned.tags.includes(tag));
      return false;
    },
    componentName: (_recipe, componentId) => components[componentId]?.name ?? 'Unknown Component',
    componentImg: (_recipe, componentId) => components[componentId]?.img ?? BAG_IMG,
    essenceDefinition: (_recipe, type) => essences[type] ?? null,
    essenceName: (_recipe, type) => essenceNames?.[type] ?? essences[type]?.name ?? String(type),
    accumulateEssences: () => accumulated,
    systemComponents: () => systemComponents,
    currencyUnits: () => currencyUnits,
  };
}

test('displayGroups answers the authored groups, or one synthetic group per flat ingredient', () => {
  const group = { id: 'g-1', options: [componentOption('c-iron')] };
  assert.deepEqual(displayGroups({ ingredientGroups: [group] }), [group]);

  const flat = componentOption('c-iron');
  assert.deepEqual(displayGroups({ ingredientGroups: [], ingredients: [flat] }), [
    { options: [flat] },
  ]);
  assert.deepEqual(displayGroups({}), []);
});

test('chosenOptionByGroup reads satisfied groups by running index across a missing group', () => {
  // `selectedIngredients` carries one entry per non-missing group in author-group order, so the
  // running index stays aligned even when an essence group is authored ahead of a tag group.
  const essenceChoice = essenceOption('e-fire', 2);
  const ironChoice = componentOption('c-iron');
  const tinChoice = componentOption('c-tin');
  const groups = [
    { id: 'g-essence', options: [essenceChoice] },
    { id: 'g-missing', options: [componentOption('c-gold'), componentOption('c-silver')] },
    { id: 'g-iron', options: [ironChoice] },
    { id: 'g-tin', options: [tinChoice] },
  ];
  const selection = {
    // One entry per non-missing group, in group order, so the running index must skip the missing
    // group without consuming an entry.
    selectedIngredients: [essenceChoice, ironChoice, tinChoice],
    missingGroups: [{ group: groups[1], ingredient: groups[1].options[1], need: 2, have: 0 }],
  };

  const map = chosenOptionByGroup({ ingredientGroups: groups }, selection);
  assert.equal(map.get('g-essence'), essenceChoice);
  assert.equal(map.get('g-missing'), groups[1].options[1], 'a missing group reads its own entry');
  assert.equal(map.get('g-iron'), ironChoice);
  assert.equal(map.get('g-tin'), tinChoice);
});

test('chosenOptionByGroup falls back to the first option when the selection says nothing', () => {
  const first = componentOption('c-iron');
  const groups = [{ id: 'g-1', options: [first, componentOption('c-tin')] }];
  const map = chosenOptionByGroup({ ingredientGroups: groups }, null);
  assert.equal(map.get('g-1'), first);
});

test('an ingredient description resolves the essence NAME seam, never the definition', () => {
  const deps = makeDeps({
    components: { 'c-iron': { name: 'Iron Ore' } },
    essences: { 'e-restore': { name: 'definition name that must not leak' } },
    essenceNames: { 'e-restore': 'Restorative' },
    currencyUnits: [{ id: 'gp', name: 'Gold Pieces' }],
  });

  assert.equal(resolveIngredientDescription(RECIPE, deps, componentOption('c-iron', 2)), '2x Iron Ore');
  assert.equal(
    resolveIngredientDescription(RECIPE, deps, essenceOption('e-restore', 2)),
    '2x Restorative essence'
  );
  assert.equal(
    resolveIngredientDescription(RECIPE, deps, currencyOption('gp', 100)),
    '100 Gold Pieces',
    'the currency unit resolves through the recipe units seam, not the raw id'
  );
  assert.equal(
    resolveIngredientDescription(RECIPE, deps, { getDescription: () => 'a legacy ingredient' }),
    'a legacy ingredient'
  );
  assert.equal(resolveIngredientDescription(RECIPE, deps, null), '');
});

test('a component tile draws its glyph when the component image is the no-image sentinel', () => {
  // `materialImg(componentImg(...))`: an unresolvable component falls back to the bag literal,
  // which is the same string as the sentinel, so the tile must report no image at all.
  const deps = makeDeps({ components: { 'c-iron': { name: 'Iron Ore', img: 'icons/iron.webp' } } });

  const unresolvable = resolveIngredientVisual(RECIPE, deps, componentOption('c-ghost'));
  assert.equal(unresolvable.img, null, 'the bag literal is a sentinel, never a drawn image');
  assert.equal(unresolvable.name, 'Unknown Component');

  const resolved = resolveIngredientVisual(RECIPE, deps, componentOption('c-iron'));
  assert.equal(resolved.img, 'icons/iron.webp', 'a real image still passes through');
  assert.equal(resolved.componentId, 'c-iron');
});

test('an essence tile carries its authored icon and colour token, blank ones as null', () => {
  const authored = makeDeps({
    essences: { 'e-fire': { name: 'Fire', icon: 'fa-fire', colorToken: '--fab-tag-red' } },
  });
  const blank = makeDeps({ essences: { 'e-fire': { name: 'Fire', icon: '  ', colorToken: '   ' } } });

  const withToken = resolveIngredientVisual(RECIPE, authored, essenceOption('e-fire', 2));
  assert.deepEqual(withToken, {
    componentId: null,
    name: '2x Fire essence',
    img: null,
    isEssence: true,
    icon: 'fa-fire',
    colorToken: '--fab-tag-red',
  });

  const unauthored = resolveIngredientVisual(RECIPE, blank, essenceOption('e-fire', 2));
  assert.equal(unauthored.icon, null);
  assert.equal(unauthored.colorToken, null, 'a whitespace-only token is not a token');
});

test('a tag tile shows the consumed item, else any held match, else no image', () => {
  const deps = makeDeps();
  const option = tagOption(['metal']);
  const first = item({ id: 'first', tags: ['metal'], img: 'icons/first.webp' });
  const spent = item({ id: 'spent', tags: ['metal'], img: 'icons/spent.webp' });

  assert.equal(resolveIngredientVisual(RECIPE, deps, option, [first, spent]).img, 'icons/first.webp');
  assert.equal(
    resolveIngredientVisual(RECIPE, deps, option, [first, spent], spent).img,
    'icons/spent.webp',
    'the item the engine will spend wins over the first match (issue 553)'
  );
  assert.equal(
    resolveIngredientVisual(RECIPE, deps, option, [], item({ id: 'bagged', img: BAG_IMG })).img,
    null,
    'the sentinel is honoured on a tag tile too'
  );
});

test('a currency tile always shows a coin icon, and a bare ingredient shows none', () => {
  const deps = makeDeps({ currencyUnits: [{ id: 'gp', name: 'Gold Pieces' }] });
  const currency = resolveIngredientVisual(RECIPE, deps, currencyOption('gp', 5));
  assert.equal(currency.img, COIN_IMG);
  assert.equal(currency.name, '5 Gold Pieces');

  const bare = resolveIngredientVisual(RECIPE, deps, { getDescription: () => 'Something' });
  assert.deepEqual(bare, { componentId: null, name: 'Something', img: null });
});

test('a group caption is the chosen option, falling back to the OR-join of every option', () => {
  const deps = makeDeps({ components: { 'c-iron': { name: 'Iron Ore' }, 'c-tin': { name: 'Tin' } } });
  const options = [componentOption('c-iron'), componentOption('c-tin')];
  assert.equal(resolveGroupDescription(RECIPE, deps, options[1], options), '1x Tin');

  const nameless = [{ quantity: 1 }, { quantity: 1 }];
  assert.equal(resolveGroupDescription(RECIPE, deps, nameless[0], nameless), ' OR ');
});

test('a satisfied group re-derives `have` by re-matching every held stack', () => {
  const deps = makeDeps({ components: { 'c-iron': { name: 'Iron Ore', img: 'icons/iron.webp' } } });
  const option = componentOption('c-iron', 3);
  const groups = [{ id: 'g-1', options: [option] }];
  const held = [
    item({ id: 'a', componentId: 'c-iron', quantity: 2 }),
    item({ id: 'b', componentId: 'c-iron', quantity: 5 }),
    item({ id: 'c', componentId: 'c-tin', quantity: 9 }),
  ];
  const selection = { selectedIngredients: [option], missingGroups: [], plan: [] };

  const [state] = buildIngredientStates(RECIPE, deps, { ingredientGroups: groups }, selection, held);
  assert.equal(state.need, 3);
  assert.equal(state.have, 7, 'the two matching stacks sum through readStackQuantity');
  assert.equal(state.satisfied, true);
  assert.equal(state.description, '3x Iron Ore');
  assert.equal(state.img, 'icons/iron.webp');
});

test('a short group reports the missing entry rather than a re-derived count', () => {
  const deps = makeDeps({ components: { 'c-iron': { name: 'Iron Ore' } } });
  const option = componentOption('c-iron', 4);
  const groups = [{ id: 'g-1', options: [option] }];
  const selection = {
    selectedIngredients: [],
    missingGroups: [{ group: groups[0], ingredient: option, need: 4, have: 1 }],
  };

  const [state] = buildIngredientStates(RECIPE, deps, { ingredientGroups: groups }, selection, []);
  assert.deepEqual(
    { need: state.need, have: state.have, satisfied: state.satisfied },
    { need: 4, have: 1, satisfied: false }
  );
});

test('the consumed item resolves through essenceGroupIds before the plan ingredient', () => {
  // The two entries must resolve to DIFFERENT items, or dropping the first lookup reads green.
  const deps = makeDeps();
  const option = tagOption(['metal']);
  const groups = [{ id: 'g-1', options: [option] }];
  const byEssence = item({ id: 'essence-carrier', tags: ['metal'], img: 'icons/carrier.webp' });
  const byIngredient = item({ id: 'plan-item', tags: ['metal'], img: 'icons/plan.webp' });
  const selection = {
    selectedIngredients: [option],
    missingGroups: [],
    plan: [
      { item: byEssence, essenceGroupIds: ['g-1'] },
      { ingredient: option, item: byIngredient },
    ],
  };

  const [state] = buildIngredientStates(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    selection,
    [byEssence, byIngredient]
  );
  assert.equal(state.img, 'icons/carrier.webp', 'the essence block entry wins');
});

test('a satisfied tile shows the planned stack, not the first matching one', () => {
  // The 4th `consumedItem` argument: dropping it reverts the tile to a plausible-looking image.
  const deps = makeDeps();
  const option = tagOption(['metal']);
  const groups = [{ id: 'g-1', options: [option] }];
  const first = item({ id: 'first', tags: ['metal'], img: 'icons/first.webp' });
  const planned = item({ id: 'planned', tags: ['metal'], img: 'icons/planned.webp' });
  const selection = {
    selectedIngredients: [option],
    missingGroups: [],
    plan: [{ ingredient: option, item: planned }],
  };

  const [state] = buildIngredientStates(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    selection,
    [first, planned]
  );
  assert.equal(state.img, 'icons/planned.webp');
});

test('a currency group reports the resolver verdict and the world-scoped refusal', () => {
  const deps = makeDeps({ currencyUnits: [{ id: 'gp', name: 'Gold Pieces' }] });
  const option = currencyOption('gp', 100);
  const groups = [{ id: 'g-1', options: [option] }];
  const satisfied = { selectedIngredients: [option], missingGroups: [], plan: [] };

  const [affordable] = buildIngredientStates(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    satisfied,
    []
  );
  assert.deepEqual(
    {
      need: affordable.need,
      have: affordable.have,
      isCurrency: affordable.isCurrency,
      affordable: affordable.affordable,
      issue: affordable.issue,
    },
    { need: 100, have: 0, isCurrency: true, affordable: true, issue: '' }
  );

  const missing = {
    selectedIngredients: [],
    missingGroups: [{ group: groups[0], ingredient: option }],
    plan: [],
  };
  const [refused] = buildIngredientStates(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    missing,
    [],
    'no currency ladder is configured'
  );
  assert.equal(refused.affordable, false);
  assert.equal(refused.issue, 'no currency ladder is configured');
});

test('an essence group reports delivered beside owned, from the pool requirement', () => {
  const deps = makeDeps({ essences: { 'e-fire': { name: 'Fire' } } });
  const option = essenceOption('e-fire', 4);
  const groups = [{ id: 'g-1', options: [option] }];
  const selection = {
    selectedIngredients: [option],
    missingGroups: [],
    plan: [],
    essencePool: {
      requirements: [
        { groupId: 'g-1', essenceId: 'e-fire', need: 4, delivered: 4, owned: 9, satisfied: true },
      ],
    },
  };

  const [state] = buildIngredientStates(RECIPE, deps, { ingredientGroups: groups }, selection, []);
  assert.deepEqual(
    { need: state.need, delivered: state.delivered, owned: state.owned, satisfied: state.satisfied },
    { need: 4, delivered: 4, owned: 9, satisfied: true }
  );
  assert.equal(state.have, undefined, 'an essence requirement never reports a component `have`');
});

test('an essence group with no pool at all falls back to the missing-group verdict', () => {
  const deps = makeDeps({ essences: { 'e-fire': { name: 'Fire' } } });
  const option = essenceOption('e-fire', 4);
  const groups = [{ id: 'g-1', options: [option] }];
  const selection = {
    selectedIngredients: [],
    missingGroups: [{ group: groups[0], ingredient: option, need: 4, have: 1 }],
    plan: [],
  };

  const [state] = buildIngredientStates(RECIPE, deps, { ingredientGroups: groups }, selection, []);
  assert.deepEqual(
    { delivered: state.delivered, owned: state.owned, satisfied: state.satisfied },
    { delivered: 1, owned: 1, satisfied: false }
  );
});

test('the Alternatives fallback is a defensive default for a duck-typed option set, unreachable through a real IngredientGroup', () => {
  const deps = makeDeps();
  const options = [{ quantity: 1 }, { quantity: 1 }];
  const groups = [{ id: 'g-1', options }];
  const selection = { selectedIngredients: [options[0]], missingGroups: [], plan: [] };

  const [choice] = buildIngredientChoices(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    selection,
    [],
    null,
    null
  );
  assert.equal(choice.groupName, 'Alternatives');
});

test('an authored group name is never replaced by the fallback label', () => {
  const deps = makeDeps({ components: { 'c-iron': { name: 'Iron Ore' } } });
  const options = [componentOption('c-iron'), componentOption('c-tin')];
  const groups = [{ id: 'g-1', name: '  Metals  ', options }];
  const selection = { selectedIngredients: [options[0]], missingGroups: [], plan: [] };

  const [choice] = buildIngredientChoices(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    selection,
    [],
    null,
    null
  );
  assert.equal(choice.groupName, 'Metals');
  assert.equal(choice.kind, 'option');
  assert.equal(choice.options.length, 2);
  assert.equal(choice.selectedOptionIndex, 0);
});

test('a tag option offers one stack row per held stack, with its own held quantity', () => {
  const deps = makeDeps();
  const option = tagOption(['metal']);
  const groups = [{ id: 'g-1', name: 'Metals', options: [option] }];
  const held = [
    item({ id: 'a', name: 'Iron Bar', tags: ['metal'], img: 'icons/a.webp', quantity: 2 }),
    item({ id: 'b', name: 'Tin Bar', tags: ['metal'], img: 'icons/b.webp', quantity: 5 }),
    item({ id: 'c', name: 'Gold Bar', tags: ['metal'], quantity: 7 }),
    item({ id: 'd', name: 'Herb', tags: ['plant'], quantity: 9 }),
  ];
  const selection = { selectedIngredients: [option], missingGroups: [], plan: [] };

  const choices = buildIngredientChoices(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    selection,
    held,
    null,
    null
  );
  assert.equal(choices.length, 1);
  assert.equal(choices[0].kind, 'stack');
  assert.deepEqual(choices[0].stacks, [
    { itemId: 'Item.a', name: 'Iron Bar', img: 'icons/a.webp', have: 2 },
    { itemId: 'Item.b', name: 'Tin Bar', img: 'icons/b.webp', have: 5 },
    { itemId: 'Item.c', name: 'Gold Bar', img: null, have: 7 },
  ]);
  assert.equal(choices[0].selectedHeldItemId, 'Item.a', 'the first stack, absent a plan entry');
});

test('a component option offers no stack sub-choice however many stacks are held', () => {
  const deps = makeDeps({ components: { 'c-iron': { name: 'Iron Ore' } } });
  const option = componentOption('c-iron');
  const groups = [{ id: 'g-1', name: 'Iron', options: [option] }];
  const held = [
    item({ id: 'a', componentId: 'c-iron', quantity: 2 }),
    item({ id: 'b', componentId: 'c-iron', quantity: 3 }),
  ];
  const selection = { selectedIngredients: [option], missingGroups: [], plan: [] };

  assert.deepEqual(
    buildIngredientChoices(
      RECIPE,
      deps,
      { ingredientGroups: groups },
      selection,
      held,
      null,
      null
    ),
    []
  );
});

test('a stack sub-choice prefers the override, then the planned stack', () => {
  const deps = makeDeps();
  const option = tagOption(['metal']);
  const groups = [{ id: 'g-1', name: 'Metals', options: [option] }];
  const held = [
    item({ id: 'a', tags: ['metal'] }),
    item({ id: 'b', tags: ['metal'] }),
    item({ id: 'c', tags: ['metal'] }),
  ];
  const planned = {
    selectedIngredients: [option],
    missingGroups: [],
    plan: [{ ingredient: option, item: held[1] }],
  };

  const [fromPlan] = buildIngredientChoices(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    planned,
    held,
    null,
    null
  );
  assert.equal(fromPlan.selectedHeldItemId, 'Item.b');

  const [fromOverride] = buildIngredientChoices(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    planned,
    held,
    { 'g-1': { heldItemId: 'Item.c' } },
    null
  );
  assert.equal(fromOverride.selectedHeldItemId, 'Item.c');
});

test('a currency option choice labels its cost through the positional units array', () => {
  // The positional `currencyUnits` is resolved once per evaluation and is not the recipe-scoped
  // `deps.currencyUnits` seam, which describes the option itself.
  const deps = makeDeps({ currencyUnits: [{ id: 'gp', name: 'Recipe Gold' }] });
  const options = [currencyOption('gp', 100), componentOption('c-iron')];
  const groups = [{ id: 'g-1', name: 'Pay or bring', options }];
  const selection = { selectedIngredients: [options[0]], missingGroups: [], plan: [] };

  const [choice] = buildIngredientChoices(
    RECIPE,
    deps,
    { ingredientGroups: groups },
    selection,
    [],
    null,
    () => true,
    [{ id: 'gp', name: 'Evaluation Gold' }]
  );
  assert.equal(choice.options[0].costLabel, '100 Evaluation Gold');
  assert.equal(choice.options[0].name, '100 Recipe Gold');
  assert.equal(choice.options[0].isCurrency, true);
  assert.equal(choice.options[0].affordable, true);
  assert.equal(choice.options[1].isCurrency, false);
  assert.equal(choice.options[1].costLabel, '');
});

test('essence display states report the definition name, icon and colour token', () => {
  const deps = makeDeps({
    essences: { 'e-fire': { name: '  Fire  ', icon: 'fa-fire', colorToken: '--fab-tag-red' } },
    accumulated: { 'e-fire': 3, 'e-water': 0 },
  });
  const set = { essences: { 'e-fire': 2, 'e-water': 1 } };
  const features = { enableEssences: true };

  const states = buildEssenceStates(RECIPE, deps, set, [], features);
  assert.deepEqual(states[0], {
    type: 'e-fire',
    name: '  Fire  ',
    icon: 'fa-fire',
    colorToken: '--fab-tag-red',
    isEssence: true,
    need: 2,
    have: 3,
    satisfied: true,
  });
  assert.deepEqual(
    { name: states[1].name, icon: states[1].icon, satisfied: states[1].satisfied },
    { name: 'e-water', icon: null, satisfied: false }
  );

  assert.deepEqual(buildEssenceStates(RECIPE, deps, set, [], { enableEssences: false }), []);
  assert.deepEqual(buildEssenceStates(RECIPE, deps, null, [], features), []);
});

test('the essence pool projects the resolver ledger, with carrier images sentinel-checked', () => {
  const deps = makeDeps({
    essences: { 'e-fire': { name: 'Fire', icon: '  ', colorToken: '  ' } },
    systemComponents: [],
  });
  const selection = {
    essencePool: {
      requirements: [
        { groupId: 'g-1', essenceId: 'e-fire', need: 2, delivered: 2, owned: 5, satisfied: true },
      ],
      carriers: [
        {
          itemKey: 'k-1',
          item: { name: 'Ember', img: BAG_IMG },
          ownedUnits: 5,
          allocatedUnits: 2,
          perUnit: { 'e-fire': 1 },
        },
        {
          itemKey: 'k-2',
          item: { name: 'Coal', img: 'icons/coal.webp' },
          ownedUnits: 1,
          allocatedUnits: 0,
          perUnit: { 'e-fire': 1 },
        },
      ],
      allocation: { 'k-1': 2 },
      totals: { 'e-fire': 5 },
      suggested: { 'k-1': 2 },
    },
  };

  const pool = buildEssencePool(RECIPE, deps, { id: 'set-1' }, selection, { enableEssences: true });
  assert.equal(pool.scopeKey, 'set-1');
  assert.equal(pool.requirements[0].name, 'Fire');
  assert.equal(pool.requirements[0].icon, null);
  assert.equal(pool.requirements[0].colorToken, null, 'a whitespace-only token is not a token');
  assert.equal(pool.carriers[0].img, null, 'the bag literal is the no-image sentinel');
  assert.equal(pool.carriers[1].img, 'icons/coal.webp');

  assert.equal(buildEssencePool(RECIPE, deps, {}, selection, { enableEssences: false }), null);
  assert.equal(buildEssencePool(RECIPE, deps, {}, {}, { enableEssences: true }), null);
});

test('the shopping requirement unions every set, keeping the worst-case need', () => {
  const deps = {
    ...makeDeps({ components: { 'c-iron': { name: 'Iron Ore' } } }),
    features: () => ({ enableEssences: false, enableTags: true }),
    affordCurrency: () => () => true,
    currencyIssue: () => '',
    essenceOptionResolver: () => () => ({}),
    toolStates: (_recipe, set) =>
      set.id === 'set-1'
        ? [{ name: 'Anvil', componentId: 'c-anvil', available: true }]
        : [{ name: 'Anvil', componentId: 'c-anvil', available: false }],
  };
  const cheap = componentOption('c-iron', 1);
  const dear = componentOption('c-iron', 4);
  const recipe = {
    ...RECIPE,
    ingredientSets: [
      { id: 'set-1', ingredientGroups: [{ id: 'g-1', options: [cheap] }] },
      { id: 'set-2', ingredientGroups: [{ id: 'g-2', options: [dear] }] },
    ],
  };
  const actor = { items: [item({ id: 'a', componentId: 'c-iron', quantity: 2 })] };

  const result = buildShoppingRequirement(recipe, deps, actor);
  assert.equal(result.ingredientStates.length, 1, 'both sets merge under one component key');
  assert.deepEqual(
    { need: result.ingredientStates[0].need, satisfied: result.ingredientStates[0].satisfied },
    { need: 4, satisfied: false }
  );
  assert.deepEqual(result.toolStates, [{ name: 'Anvil', componentId: 'c-anvil', available: false }]);

  assert.deepEqual(buildShoppingRequirement(recipe, deps, []), {
    ingredientStates: [],
    essenceStates: [],
    toolStates: [],
  });
});

test('the shopping merge key separates a price from a quantity', () => {
  assert.equal(shoppingIngredientKey({ componentId: 'c-1', description: 'x' }), 'cid:c-1');
  assert.equal(shoppingIngredientKey({ isCurrency: true, description: '100 gp' }), 'currency:100 gp');
  assert.equal(shoppingIngredientKey({ isEssence: true, description: '2x Fire' }), 'essence:2x Fire');
  assert.equal(shoppingIngredientKey({ name: 'Herb' }), 'desc:Herb');
});

test('the manager component fallback still composes with this module no-image sentinel', () => {
  // `FALLBACK_COMPONENT_IMG` lives in `RecipeManager.js` and `GENERIC_ITEM_IMG` here; the two
  // literals must stay equal, so the composition is asserted rather than the spelling.
  const manager = new RecipeManager();
  manager._getComponent = () => null;
  const visual = manager._resolveIngredientVisual(RECIPE, componentOption('c-ghost'));
  assert.equal(visual.img, null, 'an unresolvable component draws its glyph, never a bag icon');
});

test('the shopping requirement reports its essence rows and its tool rows', () => {
  const manager = new RecipeManager();
  manager._getSystemFeatures = () => ({ enableEssences: true, enableTags: true });
  manager._getSystemComponents = () => [];
  manager._getComponent = () => null;
  manager._accumulateEssences = () => ({ 'e-fire': 1 });
  manager._resolveEssenceDefinition = (_recipe, type) => ({ id: type, name: 'Fire' });
  manager.getToolsForSet = () => [{ id: 't-1' }];
  manager.resolveToolStates = () => [{ componentId: 'c-anvil', name: 'Anvil', available: false }];
  const recipe = {
    ...RECIPE,
    ingredientSets: [{ id: 's-1', essences: { 'e-fire': 3 }, ingredientGroups: [] }],
  };

  const result = manager.evaluateShoppingRequirement([{ items: [] }], recipe);
  assert.deepEqual(
    result.essenceStates.map((e) => [e.type, e.need, e.have, e.satisfied]),
    [['e-fire', 3, 1, false]],
    'the legacy essence map reaches the shopping list through the features seam'
  );
  assert.deepEqual(result.toolStates, [
    { componentId: 'c-anvil', name: 'Anvil', available: false },
  ]);
});

test('a display seam resolves against the recipe it is handed, not a pre-resolved one', () => {
  const manager = new RecipeManager();
  const units = {
    'r-a': [{ id: 'u', abbreviation: 'AA', value: 1, isBase: true }],
    'r-b': [{ id: 'u', abbreviation: 'BB', value: 1, isBase: true }],
  };
  manager._resolveNormalizedCurrencyUnits = (recipe) => units[recipe.id] ?? [];
  const option = currencyOption('u', 2);
  const first = manager._resolveGroupDescription({ id: 'r-a' }, option, [option]);
  const second = manager._resolveGroupDescription({ id: 'r-b' }, option, [option]);
  assert.notEqual(first, second, 'a bag entry closing over the first recipe makes `recipe` inert');
  assert.match(second, /BB/);
});
