// Unit tests for routedSuccessTierOptions — the pure helper that builds the recipe
// editor's check-mode result-set assignment options from a routed crafting check.
// Extracted from CraftingSystemManagerRoot's recipeRoutedOutcomeTierOptions derived
// so the success===true filter is provable without mounting the component.
import test from 'node:test';
import assert from 'node:assert/strict';

const { routedSuccessTierOptions, routedHasOutcomeTiers } = await import(
  '../src/utils/routedOutcomeKeywords.js'
);

test('null/undefined routed config yields no options', () => {
  assert.deepEqual(routedSuccessTierOptions(null), []);
  assert.deepEqual(routedSuccessTierOptions(undefined), []);
});

test('relative type: only success tiers with an id are offered', () => {
  const routed = {
    type: 'relative',
    relativeOutcomes: [
      { id: 't1', name: 'Fine', success: true },
      { id: 't2', name: 'Botch', success: false }, // failure → excluded
      { id: '', name: 'NoId', success: true }, // missing id → excluded
      { name: 'Undefined', success: true }, // missing id → excluded
      { id: 't3', name: 'Mythic', success: true },
    ],
    fixedOutcomes: [{ id: 'f1', name: 'Ignored', success: true }],
  };
  assert.deepEqual(routedSuccessTierOptions(routed), [
    { id: 't1', name: 'Fine' },
    { id: 't3', name: 'Mythic' },
  ]);
});

test('fixed type reads the fixed outcome list', () => {
  const routed = {
    type: 'fixed',
    relativeOutcomes: [{ id: 'r1', name: 'Ignored', success: true }],
    fixedOutcomes: [
      { id: 'f1', name: 'Low', success: true },
      { id: 'f2', name: 'High', success: false },
    ],
  };
  assert.deepEqual(routedSuccessTierOptions(routed), [{ id: 'f1', name: 'Low' }]);
});

test('a tier without a name falls back to its id', () => {
  const routed = { type: 'relative', relativeOutcomes: [{ id: 't1', success: true }] };
  assert.deepEqual(routedSuccessTierOptions(routed), [{ id: 't1', name: 't1' }]);
});

test('a non-array outcome list yields no options', () => {
  assert.deepEqual(routedSuccessTierOptions({ type: 'relative', relativeOutcomes: null }), []);
});

test('routedHasOutcomeTiers: null/undefined routed config is false', () => {
  assert.equal(routedHasOutcomeTiers(null), false);
  assert.equal(routedHasOutcomeTiers(undefined), false);
});

test('routedHasOutcomeTiers: true when failure-only tiers exist (distinct from success options)', () => {
  const routed = {
    type: 'relative',
    relativeOutcomes: [
      { id: 't1', name: 'Cursed', success: false },
      { id: 't2', name: 'Botched', success: false },
    ],
  };
  // The bug case: tiers are defined but none is a Success, so the success-filtered
  // option list is empty while the "any tier defined" signal is true.
  assert.deepEqual(routedSuccessTierOptions(routed), []);
  assert.equal(routedHasOutcomeTiers(routed), true);
});

test('routedHasOutcomeTiers: reads the active type list (fixed vs relative)', () => {
  assert.equal(
    routedHasOutcomeTiers({ type: 'fixed', fixedOutcomes: [{ id: 'f1' }], relativeOutcomes: [] }),
    true
  );
  assert.equal(
    routedHasOutcomeTiers({ type: 'fixed', fixedOutcomes: [], relativeOutcomes: [{ id: 'r1' }] }),
    false
  );
});

test('routedHasOutcomeTiers: tiers without an id do not count', () => {
  assert.equal(
    routedHasOutcomeTiers({ type: 'relative', relativeOutcomes: [{ name: 'NoId', success: true }] }),
    false
  );
  assert.equal(routedHasOutcomeTiers({ type: 'relative', relativeOutcomes: null }), false);
});
