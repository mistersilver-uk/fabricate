/**
 * Tests for the `currency` ingredient match type (Part 3 of the recipe
 * requirement-sections work): a requirement alternative may carry a currency
 * cost (`match: { type:'currency', unit, amount }`) alongside component/tags.
 *
 * Covers:
 *   - `_normalizeMatch` round-trips a currency match (string unit, clamped amount)
 *   - `validate({requireComplete})` accepts a complete currency option
 *   - `validate({requireComplete})` rejects an incomplete currency option
 *     (empty unit / amount <= 0)
 *   - `validate({requireComplete:false})` is lenient for an incomplete currency
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

test('_normalizeMatch round-trips a complete currency match', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } });
  assert.deepEqual(ingredient.match, { type: 'currency', unit: 'gp', amount: 100 });
  // Currency carries no component/tag, so those derived fields stay null.
  assert.equal(ingredient.componentId, null);
  assert.equal(ingredient.tag, null);
});

test('_normalizeMatch trims the unit and clamps a negative amount to zero', () => {
  const ingredient = new Ingredient({ match: { type: 'currency', unit: '  sp  ', amount: -5 } });
  assert.equal(ingredient.match.unit, 'sp');
  assert.equal(ingredient.match.amount, 0);
});

test('_normalizeMatch coerces a non-numeric amount to zero', () => {
  const ingredient = new Ingredient({ match: { type: 'currency', unit: 'gp', amount: 'lots' } });
  assert.equal(ingredient.match.amount, 0);
});

test('validate accepts a complete currency option under requireComplete', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } });
  const result = ingredient.validate({ requireComplete: true });
  assert.equal(result.valid, true, result.errors.join(', '));
});

test('validate rejects an empty-unit currency option under requireComplete', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'currency', unit: '', amount: 100 } });
  const result = ingredient.validate({ requireComplete: true });
  assert.equal(result.valid, false);
});

test('validate rejects a zero-amount currency option under requireComplete', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 0 } });
  const result = ingredient.validate({ requireComplete: true });
  assert.equal(result.valid, false);
});

test('validate is lenient for an incomplete currency option when requireComplete is false', () => {
  const ingredient = new Ingredient({ quantity: 1, match: { type: 'currency', unit: '', amount: 0 } });
  const result = ingredient.validate({ requireComplete: false });
  assert.equal(result.valid, true, result.errors.join(', '));
});

test('validate threads requireComplete into currency alternatives', () => {
  const ingredient = new Ingredient({
    quantity: 1,
    match: { type: 'component', componentId: 'cmp-iron' },
    alternatives: [new Ingredient({ quantity: 1, match: { type: 'currency', unit: '', amount: 0 } })],
  });
  assert.equal(ingredient.validate({ requireComplete: true }).valid, false);
  assert.equal(ingredient.validate({ requireComplete: false }).valid, true);
});
