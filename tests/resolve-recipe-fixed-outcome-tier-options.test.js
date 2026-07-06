// Unit tests for resolveRecipeFixedOutcomeTierOptions — the pure helper that resolves
// the recipe editor's "Minimum success tier" dropdown options. Success tiers of a
// FIXED-type routed crafting check only, ranked ascending by `start`; gated on the
// system's real `routedByCheck` resolution mode (the min-tier gate is only threaded
// through the routedByCheck runtime path — routedByIngredients shares the routed
// check config but never reads the field). Every other case yields [] so the control
// auto-hides.
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

test('routedByCheck + fixed returns success tiers ranked ascending by start', () => {
  const options = resolveRecipeFixedOutcomeTierOptions(
    { routed: { type: 'fixed', fixedOutcomes: FIXED_OUTCOMES } },
    'routedByCheck'
  );
  assert.deepEqual(options, [
    { id: 'mid', name: 'Partial', start: 6 },
    { id: 'high', name: 'Clean', start: 15 },
  ]);
});

test('routedByIngredients + fixed yields no options (the field is never read there)', () => {
  // routedByIngredients shares craftingCheck.routed but runs a pass/fail gate that
  // ignores minSuccessOutcomeId — surfacing the control would author a dead value.
  assert.deepEqual(
    resolveRecipeFixedOutcomeTierOptions(
      { routed: { type: 'fixed', fixedOutcomes: FIXED_OUTCOMES } },
      'routedByIngredients'
    ),
    []
  );
});

test('failure tiers are excluded — only success tiers are a valid minimum', () => {
  const options = resolveRecipeFixedOutcomeTierOptions(
    { routed: { type: 'fixed', fixedOutcomes: [{ id: 'low', name: 'Fumble', success: false, start: 1 }] } },
    'routedByCheck'
  );
  assert.deepEqual(options, []);
});

test('a tier with no id is skipped', () => {
  const options = resolveRecipeFixedOutcomeTierOptions(
    { routed: { type: 'fixed', fixedOutcomes: [{ name: 'Nameless', success: true, start: 3 }] } },
    'routedByCheck'
  );
  assert.deepEqual(options, []);
});

test('a tier with no name yields an empty name (the UI applies the "Unnamed tier" label)', () => {
  const options = resolveRecipeFixedOutcomeTierOptions(
    { routed: { type: 'fixed', fixedOutcomes: [{ id: 'x', success: true, start: 2 }] } },
    'routedByCheck'
  );
  assert.deepEqual(options, [{ id: 'x', name: '', start: 2 }]);
});

test('routedByCheck + relative yields no options (fixed-type only)', () => {
  assert.deepEqual(
    resolveRecipeFixedOutcomeTierOptions(
      { routed: { type: 'relative', fixedOutcomes: FIXED_OUTCOMES } },
      'routedByCheck'
    ),
    []
  );
});

test('routedByCheck + omitted type yields no options (defaults to relative)', () => {
  assert.deepEqual(
    resolveRecipeFixedOutcomeTierOptions({ routed: { fixedOutcomes: FIXED_OUTCOMES } }, 'routedByCheck'),
    []
  );
});

test('simple / progressive / null modes yield no options', () => {
  const craftingCheck = { routed: { type: 'fixed', fixedOutcomes: FIXED_OUTCOMES } };
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(craftingCheck, 'simple'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(craftingCheck, 'progressive'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(craftingCheck, 'alchemy'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(craftingCheck, null), []);
});

test('missing config / outcomes yield an empty list (no throw)', () => {
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(null, 'routedByCheck'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions(undefined, 'routedByCheck'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions({}, 'routedByCheck'), []);
  assert.deepEqual(resolveRecipeFixedOutcomeTierOptions({ routed: { type: 'fixed' } }, 'routedByCheck'), []);
});
