/**
 * Tests for the ingredient-`match` type registry (`src/models/match/matchTypes.js`).
 *
 * The registry centralizes per-type `match` logic (normalize / isComplete /
 * validate / signature / expandToComponentIds / matchesItem / getComponentId /
 * describe) behind `getMatchHandler`. This is a pure refactor of logic lifted
 * verbatim from Ingredient, recipeReadiness, SignatureValidator, and
 * RecipeManager, so these tests pin the registry contract AND the four
 * plan-review behaviors that must not regress:
 *
 *   1. Stacked validate — an incomplete tags/currency match yields BOTH the
 *      shared "must include a match rule" error (from Ingredient) AND the
 *      per-type tag/currency message (from the handler); under
 *      `requireComplete:false` neither completeness error fires.
 *   2. `_matchesIngredient` fall-through — only tags/currency are terminal; a
 *      `{type:'component'}` match with `alternatives` still recurses, currency
 *      is terminal-false, tags with `enableTags:false` is false.
 *   3. `systemItem` alias — `getMatchHandler({type:'systemItem'})` resolves the
 *      component handler; its id helpers return the id.
 *   4. Safe fallback — `getMatchHandler(null)` and `{type:'bogus'}` resolve a
 *      no-op handler (isComplete false, empty set, false, null).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry global stubs (mirrors tests/ingredient-currency-match.test.js)
// ---------------------------------------------------------------------------
let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
  },
};
globalThis.game = { user: { isGM: true, name: 'Test' }, fabricate: null };

const { HANDLERS, getMatchHandler, getIngredientComponentId, normalizeMatch } = await import(
  '../src/models/match/matchTypes.js'
);
const { Ingredient } = await import('../src/models/Ingredient.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

/**
 * Build a fake Foundry item whose `getFlag('fabricate', 'fabricate.tags')`
 * returns the supplied tags — the shape `getFabricateFlag` reads.
 */
function fakeItem({ tags = [], uuid = 'Item.x', name = 'Thing' } = {}) {
  return {
    uuid,
    name,
    getFlag(namespace, key) {
      if (namespace === 'fabricate' && (key === 'fabricate.tags' || key === 'tags')) {
        return tags;
      }
      return undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// getMatchHandler resolution
// ---------------------------------------------------------------------------
test('getMatchHandler resolves each known type', () => {
  assert.equal(getMatchHandler({ type: 'component' }).type, 'component');
  assert.equal(getMatchHandler({ type: 'tags' }).type, 'tags');
  assert.equal(getMatchHandler({ type: 'currency' }).type, 'currency');
});

test('getMatchHandler aliases systemItem to the component handler', () => {
  const handler = getMatchHandler({ type: 'systemItem', systemItemId: 'cmp-iron' });
  assert.equal(handler, HANDLERS.component);
  assert.equal(handler.getComponentId({ type: 'systemItem', systemItemId: 'cmp-iron' }), 'cmp-iron');
  assert.deepEqual(
    [...handler.expandToComponentIds({ type: 'systemItem', systemItemId: 'cmp-iron' }, [])],
    ['cmp-iron']
  );
  // A raw, un-normalized systemItem match must read as complete and sign the
  // same as its normalized component form, so it is not dropped as incomplete
  // or unsignatured on paths that run before normalizeMatch.
  assert.equal(handler.isComplete({ type: 'systemItem', systemItemId: 'cmp-iron' }), true);
  assert.equal(handler.signature({ type: 'systemItem', systemItemId: ' cmp-iron ' }), 'component:cmp-iron');
});

test('getMatchHandler returns a safe fallback for null and unknown types', () => {
  for (const match of [null, undefined, { type: 'bogus' }]) {
    const handler = getMatchHandler(match);
    assert.equal(handler.isComplete(match), false);
    assert.deepEqual(handler.validate(match, { requireComplete: true }), []);
    assert.equal(handler.signature(match), null);
    assert.deepEqual([...handler.expandToComponentIds(match, [])], []);
    assert.equal(handler.matchesItem(match, fakeItem(), { features: { enableTags: true } }), false);
    assert.equal(handler.getComponentId(match), null);
  }
});

// ---------------------------------------------------------------------------
// component handler
// ---------------------------------------------------------------------------
test('component handler: normalize/isComplete/signature/expand/getComponentId/describe', () => {
  const h = HANDLERS.component;
  assert.deepEqual(normalizeMatch({ match: { type: 'component', componentId: 'cmp-iron' } }), {
    type: 'component',
    componentId: 'cmp-iron',
  });
  assert.equal(h.isComplete({ type: 'component', componentId: 'cmp-iron' }), true);
  assert.equal(h.isComplete({ type: 'component', componentId: null }), false);
  assert.equal(h.signature({ type: 'component', componentId: ' cmp-iron ' }), 'component:cmp-iron');
  assert.equal(h.signature({ type: 'component', componentId: '' }), null);
  assert.deepEqual([...h.expandToComponentIds({ type: 'component', componentId: 'cmp-iron' }, [])], [
    'cmp-iron',
  ]);
  assert.equal(h.getComponentId({ type: 'component', componentId: 'cmp-iron' }), 'cmp-iron');
  // Component matching is owned upstream, so the handler never matches an item.
  assert.equal(h.matchesItem({ type: 'component', componentId: 'cmp-iron' }, fakeItem(), {}), false);
  assert.equal(h.describe({ type: 'component', componentId: 'cmp-iron' }, { quantity: 3 }), '3x component');
  assert.deepEqual(h.validate({ type: 'component', componentId: null }, { requireComplete: true }), []);
});

// ---------------------------------------------------------------------------
// tags handler
// ---------------------------------------------------------------------------
test('tags handler: normalize trims/filters and defaults tagMatch', () => {
  assert.deepEqual(
    normalizeMatch({ match: { type: 'tags', tags: [' metal ', '', 'sharp'], tagMatch: 'all' } }),
    { type: 'tags', tags: ['metal', 'sharp'], tagMatch: 'all' }
  );
  assert.deepEqual(normalizeMatch({ match: { type: 'tags', tags: ['metal'] } }), {
    type: 'tags',
    tags: ['metal'],
    tagMatch: 'any',
  });
});

test('tags handler: signature sorts tags and appends tagMatch', () => {
  const h = HANDLERS.tags;
  assert.equal(h.signature({ type: 'tags', tags: ['sharp', 'metal'], tagMatch: 'all' }), 'tags:metal,sharp|all');
  assert.equal(h.signature({ type: 'tags', tags: [], tagMatch: 'any' }), null);
});

test('tags handler: expandToComponentIds filters components by any/all', () => {
  const h = HANDLERS.tags;
  const components = [
    { id: 'a', tags: ['metal', 'sharp'] },
    { id: 'b', tags: ['metal'] },
    { id: 'c', tags: ['wood'] },
  ];
  assert.deepEqual(
    [...h.expandToComponentIds({ type: 'tags', tags: ['metal'], tagMatch: 'any' }, components)].sort((x, y) =>
      x.localeCompare(y),
    ),
    ['a', 'b']
  );
  assert.deepEqual(
    [...h.expandToComponentIds({ type: 'tags', tags: ['metal', 'sharp'], tagMatch: 'all' }, components)],
    ['a']
  );
});

test('tags handler: matchesItem honors enableTags and any/all', () => {
  const h = HANDLERS.tags;
  const item = fakeItem({ tags: ['metal', 'sharp'] });
  assert.equal(h.matchesItem({ type: 'tags', tags: ['metal'], tagMatch: 'any' }, item, { features: { enableTags: true } }), true);
  assert.equal(h.matchesItem({ type: 'tags', tags: ['metal', 'wood'], tagMatch: 'all' }, item, { features: { enableTags: true } }), false);
  // Tags disabled → never matches.
  assert.equal(h.matchesItem({ type: 'tags', tags: ['metal'], tagMatch: 'any' }, item, { features: { enableTags: false } }), false);
});

test('tags handler: getComponentId is null; describe joins tags', () => {
  const h = HANDLERS.tags;
  assert.equal(h.getComponentId({ type: 'tags', tags: ['metal'] }), null);
  assert.equal(h.describe({ type: 'tags', tags: ['metal', 'sharp'], tagMatch: 'all' }, { quantity: 2 }), '2x metal & sharp');
  assert.equal(h.describe({ type: 'tags', tags: ['metal', 'sharp'], tagMatch: 'any' }, { quantity: 1 }), '1x metal | sharp');
});

// ---------------------------------------------------------------------------
// currency handler
// ---------------------------------------------------------------------------
test('currency handler: normalize trims unit and clamps amount', () => {
  assert.deepEqual(normalizeMatch({ match: { type: 'currency', unit: '  gp  ', amount: 100 } }), {
    type: 'currency',
    unit: 'gp',
    amount: 100,
  });
  assert.deepEqual(normalizeMatch({ match: { type: 'currency', unit: 'sp', amount: -5 } }), {
    type: 'currency',
    unit: 'sp',
    amount: 0,
  });
});

test('currency handler: isComplete/signature/expand/matchesItem/getComponentId', () => {
  const h = HANDLERS.currency;
  assert.equal(h.isComplete({ type: 'currency', unit: 'gp', amount: 100 }), true);
  assert.equal(h.isComplete({ type: 'currency', unit: '', amount: 100 }), false);
  assert.equal(h.isComplete({ type: 'currency', unit: 'gp', amount: 0 }), false);
  assert.equal(h.signature({ type: 'currency', unit: 'gp', amount: 100 }), 'currency:gp:100');
  assert.equal(h.signature({ type: 'currency', unit: '', amount: 100 }), null);
  assert.deepEqual([...h.expandToComponentIds({ type: 'currency', unit: 'gp', amount: 100 }, [{ id: 'a' }])], []);
  assert.equal(h.matchesItem({ type: 'currency', unit: 'gp', amount: 100 }, fakeItem(), { features: { enableTags: true } }), false);
  assert.equal(h.getComponentId({ type: 'currency', unit: 'gp', amount: 100 }), null);
});

// ---------------------------------------------------------------------------
// normalizeMatch legacy folding
// ---------------------------------------------------------------------------
test('normalizeMatch folds legacy systemItem/componentId/systemItemId into component', () => {
  assert.deepEqual(normalizeMatch({ match: { type: 'systemItem', systemItemId: 'cmp-iron' } }), {
    type: 'component',
    componentId: 'cmp-iron',
  });
  assert.deepEqual(normalizeMatch({ componentId: 'cmp-bare' }), {
    type: 'component',
    componentId: 'cmp-bare',
  });
  assert.deepEqual(normalizeMatch({ systemItemId: 'cmp-legacy' }), {
    type: 'component',
    componentId: 'cmp-legacy',
  });
  assert.deepEqual(normalizeMatch({ tags: [' a ', 'b'], tagMatch: 'all' }), {
    type: 'tags',
    tags: ['a', 'b'],
    tagMatch: 'all',
  });
  assert.deepEqual(normalizeMatch({ tag: 'solo' }), { type: 'tags', tags: ['solo'], tagMatch: 'any' });
  assert.equal(normalizeMatch({}), null);
});

// ---------------------------------------------------------------------------
// Plan-review case 1: stacked validate via Ingredient
// ---------------------------------------------------------------------------
test('plan-review 1: an incomplete tags match stacks both the shared and tag errors', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'tags', tags: [] } });
  const { valid, errors } = ingredient.validate({ requireComplete: true });
  assert.equal(valid, false);
  assert.ok(errors.includes('Ingredient must include a match rule or specific item UUID'), errors.join(', '));
  assert.ok(errors.includes('Tag-based ingredient match requires at least one tag'), errors.join(', '));
});

test('plan-review 1: an incomplete currency match stacks both the shared and currency errors', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'currency', unit: '', amount: 0 } });
  const { valid, errors } = ingredient.validate({ requireComplete: true });
  assert.equal(valid, false);
  assert.ok(errors.includes('Ingredient must include a match rule or specific item UUID'), errors.join(', '));
  assert.ok(errors.includes('Currency ingredient match requires a unit and a positive amount'), errors.join(', '));
});

test('plan-review 1: requireComplete:false waives both completeness errors', () => {
  for (const match of [{ type: 'tags', tags: [] }, { type: 'currency', unit: '', amount: 0 }]) {
    const ingredient = new Ingredient({ quantity: 1, match });
    const { valid, errors } = ingredient.validate({ requireComplete: false });
    assert.equal(valid, true, errors.join(', '));
    assert.equal(errors.length, 0, errors.join(', '));
  }
});

// ---------------------------------------------------------------------------
// Plan-review case 2: terminal-vs-fall-through dispatch
// ---------------------------------------------------------------------------
test('plan-review 2: component is not terminal — only tags/currency dispatch through the handler', () => {
  assert.equal(getMatchHandler({ type: 'component', componentId: 'x' }).type, 'component');
  // tags and currency are the terminal types RecipeManager dispatches to.
  assert.equal(getMatchHandler({ type: 'tags', tags: ['a'] }).type, 'tags');
  assert.equal(getMatchHandler({ type: 'currency', unit: 'gp', amount: 1 }).type, 'currency');
});

test('plan-review 2: _matchesIngredient — a {type:component} ingredient with alternatives still recurses', () => {
  const manager = new RecipeManager();
  const features = { enableTags: true };
  const item = fakeItem({ uuid: 'Item.match', tags: [] });

  // A component-typed match is NOT terminal: the dispatch falls through to the
  // bare-field legacy paths, including the alternatives recursion. The
  // alternative matches by itemUuid, so the whole ingredient matches.
  const ingredient = {
    match: { type: 'component', componentId: 'cmp-iron' },
    alternatives: [{ itemUuid: 'Item.match' }],
  };
  assert.equal(manager._matchesIngredient(ingredient, item, features), true);

  // With no matching alternative the component match still falls through (and
  // returns false here) rather than being short-circuited by the handler.
  const noMatch = {
    match: { type: 'component', componentId: 'cmp-iron' },
    alternatives: [{ itemUuid: 'Item.other' }],
  };
  assert.equal(manager._matchesIngredient(noMatch, item, features), false);
});

test('plan-review 2: _matchesIngredient — currency is terminal false; tags gated on enableTags', () => {
  const manager = new RecipeManager();
  const item = fakeItem({ tags: ['metal'] });

  assert.equal(
    manager._matchesIngredient({ match: { type: 'currency', unit: 'gp', amount: 1 } }, item, { enableTags: true }),
    false
  );
  assert.equal(
    manager._matchesIngredient({ match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }, item, { enableTags: false }),
    false
  );
  assert.equal(
    manager._matchesIngredient({ match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }, item, { enableTags: true }),
    true
  );
});

test('plan-review 2: currency terminal matchesItem is always false; tags with enableTags:false is false', () => {
  assert.equal(
    HANDLERS.currency.matchesItem({ type: 'currency', unit: 'gp', amount: 1 }, fakeItem(), { features: { enableTags: true } }),
    false
  );
  assert.equal(
    HANDLERS.tags.matchesItem({ type: 'tags', tags: ['metal'] }, fakeItem({ tags: ['metal'] }), { features: { enableTags: false } }),
    false
  );
});

// ---------------------------------------------------------------------------
// isTerminalInventoryMatch — handler-declared terminality (Seam 1)
// ---------------------------------------------------------------------------
test('isTerminalInventoryMatch: tags and currency are terminal', () => {
  assert.equal(HANDLERS.tags.isTerminalInventoryMatch, true);
  assert.equal(HANDLERS.currency.isTerminalInventoryMatch, true);
});

test('isTerminalInventoryMatch: component and the null/unknown fallback are non-terminal', () => {
  assert.equal(HANDLERS.component.isTerminalInventoryMatch, false);
  // The fallback handler (null / unrecognized type) must be non-terminal so the
  // null/unknown path stays an explicit fall-through.
  assert.equal(getMatchHandler(null).isTerminalInventoryMatch, false);
  assert.equal(getMatchHandler({ type: 'bogus' }).isTerminalInventoryMatch, false);
});

// ---------------------------------------------------------------------------
// getIngredientComponentId — shared ref → component-id resolver (Seam 2)
// ---------------------------------------------------------------------------
test('getIngredientComponentId: resolves a structured component match via the handler', () => {
  assert.equal(
    getIngredientComponentId({ match: { type: 'component', componentId: 'cmp-iron' } }),
    'cmp-iron'
  );
});

test('getIngredientComponentId: resolves the legacy systemItem/systemItemId alias match', () => {
  assert.equal(
    getIngredientComponentId({ match: { type: 'systemItem', systemItemId: 'cmp-iron' } }),
    'cmp-iron'
  );
});

test('getIngredientComponentId: falls back to bare componentId/systemItemId fields', () => {
  assert.equal(getIngredientComponentId({ componentId: 'cmp-bare' }), 'cmp-bare');
  assert.equal(getIngredientComponentId({ systemItemId: 'cmp-legacy' }), 'cmp-legacy');
});

test('getIngredientComponentId: a tags match resolves to null', () => {
  assert.equal(getIngredientComponentId({ match: { type: 'tags', tags: ['metal'] } }), null);
});

test('getIngredientComponentId: a currency match resolves to null', () => {
  assert.equal(
    getIngredientComponentId({ match: { type: 'currency', unit: 'gp', amount: 100 } }),
    null
  );
});

test('getIngredientComponentId: null, undefined, and unknown refs/matches resolve to null', () => {
  assert.equal(getIngredientComponentId(null), null);
  assert.equal(getIngredientComponentId(undefined), null);
  assert.equal(getIngredientComponentId({}), null);
  assert.equal(getIngredientComponentId({ match: { type: 'bogus' } }), null);
});

// ---------------------------------------------------------------------------
// Plan-review case 4: safe fallback (also covered above; explicit assertions)
// ---------------------------------------------------------------------------
test('plan-review 4: null and bogus matches resolve a no-op handler', () => {
  for (const match of [null, { type: 'bogus' }]) {
    const handler = getMatchHandler(match);
    assert.equal(handler.isComplete(match), false);
    assert.deepEqual([...handler.expandToComponentIds(match, [{ id: 'a' }])], []);
    assert.equal(handler.matchesItem(match, fakeItem({ tags: ['x'] }), { features: { enableTags: true } }), false);
    assert.equal(handler.getComponentId(match), null);
    assert.equal(handler.signature(match), null);
  }
});
