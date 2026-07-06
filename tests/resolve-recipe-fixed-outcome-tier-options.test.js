// Unit tests for resolveRecipeFixedOutcomeTierOptions — the pure helper that resolves
// the recipe editor's "Minimum success tier" dropdown options. Success tiers of a
// FIXED-type routed crafting check only, ranked ascending by `start`; every other
// mode/type yields [] so the control auto-hides.
import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveRecipeFixedOutcomeTierOptions } = await import(
  '../src/utils/routedOutcomeKeywords.js'
);

const FIXED_OUTCOMES = [
  { id: 'high', name: 'Clean', success: true, start: 15, end: 20 },
  { id: 'low', name: 'Fumble', success: false, start: 1, end: 5 },
  { id: 'mid', name: 'Partial', success: true, start: 6, end: 14 },
];

test('routed + fixed returns success tiers ranked ascending by start', () => {
  const options = resolveRecipeFixedOutcomeTierOptions(
    { routed: { type: 'fixed', fixedOutcomes: FIXED_OUTCOMES } },
    'routed'
  );
  assert.deepEqual(options, [
    { id: 'mid', name: 'Partial', start: 6 },
    { id: 'high', name: 'Clean', start: 15 },
  ]);
});

test('failure tiers are excluded — only success tiers are a valid minimum', () => {
  const options = resolveRecipeFixedOutcomeTierOptions(
    { routed: { type: 'fixed', fixedOutcomes: [{ id: 'low', name: 'Fumble', success: false, start: 1 }] } },
    'routed'
  );
  assert.deepEqual(options, []);
});

test('a tier with no id is skipped', () => {
  const options = resolveRecipeFixedOutcomeTierOptions(
    { routed: { type: 'fixed', fixedOutcomes: [{ name: 'Nameless', success: true, start: 3 }] } },
    'routed'
  );
  assert.deepEqual(options, []);
});

test('a tier with no name falls back to its id', () => {
  const options = resolveRecipeFixedOutcomeTierOptions(
    { routed: { type: 'fixed', fixedOutcomes: [{ id: 'x', success: true, start: 2 }] } },
    'routed'
  );
  assert.deepEqual(options, [{ id: 'x', name: 'x', start: 2 }]);
});

test('routed + relative yields no options (fixed-type only)', () => {
  assert.deepEqual(
    resolveRecipeFixedOutcomeTierOptions(
      { routed: { type: 'relative', fixedOutcomes: FIXED_OUTCOMES } },
      'routed'
    ),
    []
  );
});

test('routed + omitted type yields no options (defaults to relative)', () => {
  assert.deepEqual(
    resolveRecipeFixedOutcomeTierOptions({ routed: { fixedOutcomes: FIXED_OUTCOMES } }, 'routed'),
    []
  );
});

test('simple / progressive / null modes yield no options', () => {
  const craftingCheck = { routed: { type: 'fixed', fixedOutcomes: FIXED_OUTCOMES } };
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(craftingCheck, 'simple'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(craftingCheck, 'progressive'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(craftingCheck, null), []);
});

test('missing config / outcomes yield an empty list (no throw)', () => {
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(null, 'routed'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(undefined, 'routed'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions({}, 'routed'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions({ routed: { type: 'fixed' } }, 'routed'), []);
});
