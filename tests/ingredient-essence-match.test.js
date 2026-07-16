/**
 * Tests for the `essence` ingredient match type (issue 649): a requirement
 * alternative may be an essence requirement (`match: { type:'essence', essenceId,
 * amount }`) alongside component/tags/currency, making "component OR essence"
 * authorable.
 *
 * Covers the same contract surface as the currency handler tests:
 *   - `_normalizeMatch` round-trips an essence match (trimmed id, clamped amount)
 *     and normalizes BEFORE the component fallback (essenceId/amount preserved)
 *   - `componentId`/`tag` derive null for an essence option
 *   - `validate({requireComplete})` accept/reject + `requireComplete:false` leniency
 *   - alternatives thread `requireComplete`
 *   - the `getDescription` essence arm
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
  },
};
globalThis.game = { user: { isGM: true, name: 'Test' }, fabricate: null };

const { Ingredient } = await import('../src/models/Ingredient.js');
const { getMatchHandler, normalizeMatch } = await import('../src/models/match/matchTypes.js');

test('_normalizeMatch round-trips a complete essence match, before the component fallback', () => {
  const ingredient = new Ingredient({
    quantity: 1,
    match: { type: 'essence', essenceId: 'fire', amount: 3 },
  });
  // The essence branch precedes the component normalizer, so essenceId/amount survive
  // (a misplaced branch would fold this to { type:'component', componentId:null }).
  assert.deepEqual(ingredient.match, { type: 'essence', essenceId: 'fire', amount: 3 });
  assert.equal(ingredient.componentId, null);
  assert.equal(ingredient.tag, null);
});

test('_normalizeMatch trims the essenceId and clamps a negative amount to zero', () => {
  const ingredient = new Ingredient({ match: { type: 'essence', essenceId: '  water  ', amount: -4 } });
  assert.equal(ingredient.match.essenceId, 'water');
  assert.equal(ingredient.match.amount, 0);
});

test('_normalizeMatch coerces a non-numeric amount to zero', () => {
  const ingredient = new Ingredient({ match: { type: 'essence', essenceId: 'earth', amount: 'lots' } });
  assert.equal(ingredient.match.amount, 0);
});

test('normalizeMatch does not fall through an essence match to the component normalizer', () => {
  assert.deepEqual(normalizeMatch({ match: { type: 'essence', essenceId: 'air', amount: 2 } }), {
    type: 'essence',
    essenceId: 'air',
    amount: 2,
  });
});

test('the essence handler signs stably and never affords currency or a component id', () => {
  const match = { type: 'essence', essenceId: 'fire', amount: 3 };
  const handler = getMatchHandler(match);
  assert.equal(handler.signature(match), 'essence:fire:3');
  assert.equal(handler.signature({ type: 'essence', essenceId: '', amount: 3 }), null);
  assert.equal(handler.signature({ type: 'essence', essenceId: 'fire', amount: 0 }), null);
  assert.equal(handler.getComponentId(match), null);
  assert.equal(handler.getCurrencySpend(match), null);
  assert.equal(handler.affords(match, { affordCurrency: () => true }), false);
  assert.equal(handler.matchesItem(match, {}), false);
  assert.equal(handler.isTerminalInventoryMatch, true);
});

test('expandToComponentIds returns every component carrying the essence (positive quantity only)', () => {
  const handler = getMatchHandler({ type: 'essence', essenceId: 'fire', amount: 2 });
  const ids = handler.expandToComponentIds({ type: 'essence', essenceId: 'fire', amount: 2 }, [
    { id: 'c1', essences: { fire: 2 } },
    { id: 'c2', essences: { fire: 0 } },
    { id: 'c3', essences: { water: 5 } },
    { id: 'c4', essences: { fire: 1, water: 1 } },
  ]);
  assert.deepEqual([...ids].sort(), ['c1', 'c4']);
});

test('validate accepts a complete essence option under requireComplete', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 3 } });
  const result = ingredient.validate({ requireComplete: true });
  assert.equal(result.valid, true, result.errors.join(', '));
});

test('validate rejects an empty-id essence option under requireComplete', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'essence', essenceId: '', amount: 3 } });
  assert.equal(ingredient.validate({ requireComplete: true }).valid, false);
});

test('validate rejects a zero-amount essence option under requireComplete', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 0 } });
  assert.equal(ingredient.validate({ requireComplete: true }).valid, false);
});

test('validate is lenient for an incomplete essence option when requireComplete is false', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'essence', essenceId: '', amount: 0 } });
  assert.equal(ingredient.validate({ requireComplete: false }).valid, true);
});

test('validate threads requireComplete into essence alternatives', () => {
  const ingredient = new Ingredient({
    quantity: 1,
    match: { type: 'component', componentId: 'cmp-iron' },
    alternatives: [new Ingredient({ quantity: 1, match: { type: 'essence', essenceId: '', amount: 0 } })],
  });
  assert.equal(ingredient.validate({ requireComplete: true }).valid, false);
  assert.equal(ingredient.validate({ requireComplete: false }).valid, true);
});

test('getDescription renders the essence amount phrase', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 3 } });
  assert.equal(ingredient.getDescription(), '3x fire essence');
});
