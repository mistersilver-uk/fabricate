/**
 * Tests for essence-option consumption in IngredientSet.resolveIngredientSelection
 * (issue 649): an essence GROUP option draws down items carrying that essence until
 * `amount` is met, participating in the same items-first selection plan as
 * component/tag/currency options, including the anti-double-consume `remaining`
 * bookkeeping and the `optionOverrides` path.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };

const { IngredientSet } = await import('../src/models/IngredientSet.js');

// A minimal item: uuid, quantity, and Fabricate essence flags. `getFabricateFlag`
// reads via `getFlag('fabricate', normalizeFlagKey('essences'))` (a possibly
// dot-nested key), so resolve the key as a path within the fabricate scope.
function item(uuid, quantity, essences) {
  const scopes = { fabricate: { fabricate: { essences }, essences } };
  return {
    uuid,
    system: { quantity },
    getFlag: (scope, key) =>
      String(key)
        .split('.')
        .reduce((value, part) => (value == null ? undefined : value[part]), scopes[scope]),
  };
}

function essenceGroup(essenceId, amount) {
  return { id: `g-${essenceId}`, options: [{ quantity: 1, match: { type: 'essence', essenceId, amount } }] };
}

test('default (flag-only) resolver draws down flag-carrying items to meet the essence amount', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('fire', 3)] });
  const items = [item('i1', 2, { fire: 1 }), item('i2', 5, { fire: 1 })];
  const selection = set.resolveIngredientSelection(items);
  assert.equal(selection.success, true);
  const consumed = selection.plan.reduce((n, p) => n + p.quantity, 0);
  assert.equal(consumed, 3, 'exactly three fire-carrying units consumed');
});

test('reports the group missing with the available essence total when short', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('fire', 5)] });
  const items = [item('i1', 2, { fire: 1 })];
  const selection = set.resolveIngredientSelection(items);
  assert.equal(selection.success, false);
  assert.equal(selection.missingGroups.length, 1);
  assert.equal(selection.missingGroups[0].have, 2, 'have reflects total available fire essence');
  assert.equal(selection.missingGroups[0].need, 5);
});

test('a component-aware resolver resolves component-defined essences the flag-only path cannot', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('fire', 2)] });
  // The item carries NO essence flags; its component defines the essence.
  const bare = { uuid: 'i1', system: { quantity: 3 }, getFlag: () => undefined };
  const resolveItemEssences = (it) => (it.uuid === 'i1' ? { fire: 1 } : {});
  const selection = set.resolveIngredientSelection([bare], null, { resolveItemEssences });
  assert.equal(selection.success, true, 'component-defined essence satisfies the option');
});

test('anti-double-consume: an item claimed by a component group is not recounted for essence', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [
      { id: 'g-comp', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-ember' } }] },
      essenceGroup('fire', 1),
    ],
  });
  // One single-unit item that BOTH matches the component group and carries fire essence.
  const ember = item('ember', 1, { fire: 1 });
  const matcher = (ingredient, it) =>
    ingredient?.match?.type === 'component' && it.uuid === 'ember';
  const selection = set.resolveIngredientSelection([ember], matcher, {
    resolveItemEssences: () => ({ fire: 1 }),
  });
  // The component group consumes the only unit; the essence group then has nothing left.
  assert.equal(selection.success, false, 'the single unit cannot satisfy both groups');
  assert.equal(selection.missingGroups.length, 1);
  assert.equal(selection.missingGroups[0].ingredient.match.type, 'essence');
});

test('unit-granular: an indivisible item may over-consume past the amount', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('fire', 2)] });
  const items = [item('i1', 1, { fire: 3 })]; // one unit worth 3 essence, need 2
  const selection = set.resolveIngredientSelection(items);
  assert.equal(selection.success, true);
  assert.equal(selection.plan.length, 1);
  assert.equal(selection.plan[0].quantity, 1, 'the whole indivisible unit is consumed');
});

test('optionOverrides path resolves an explicitly chosen essence option', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [
      {
        id: 'g-or',
        options: [
          { quantity: 1, match: { type: 'component', componentId: 'cmp-none' } },
          { quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 2 } },
        ],
      },
    ],
  });
  const items = [item('i1', 5, { fire: 1 })];
  const selection = set.resolveIngredientSelection(items, null, {
    optionOverrides: { 'g-or': { optionIndex: 1 } },
  });
  assert.equal(selection.success, true, 'the chosen essence option resolves');
  assert.equal(selection.selectedIngredients[0].match.type, 'essence');
});

test('back-compat: a no-resolver resolveIngredientSelection with NO essence options is unchanged', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [
      { id: 'g-1', options: [{ quantity: 2, match: { type: 'component', componentId: 'cmp-iron' } }] },
    ],
  });
  const iron = { uuid: 'iron', system: { quantity: 5 }, getFlag: () => undefined };
  const matcher = (ingredient, it) => it.uuid === 'iron';
  const selection = set.resolveIngredientSelection([iron], matcher);
  assert.equal(selection.success, true);
  assert.deepEqual(
    selection.plan.map((p) => ({ uuid: p.item.uuid, quantity: p.quantity })),
    [{ uuid: 'iron', quantity: 2 }],
    'item-only plan is byte-for-byte the legacy behaviour'
  );
});
