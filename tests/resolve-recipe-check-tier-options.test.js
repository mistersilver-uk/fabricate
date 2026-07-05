// Unit tests for resolveRecipeCheckTierOptions — the pure helper that resolves the
// recipe editor's "Check tier" dropdown options from the selected system's active
// crafting-check mode. Extracted from CraftingSystemManagerRoot's recipeCheckTierOptions
// derived, which previously only handled simple-static checks and so left routed
// relative checks unable to surface their authored recipe tiers (issue 512).
import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveRecipeCheckTierOptions } = await import('../src/utils/routedOutcomeKeywords.js');

const SIMPLE_TIERS = [
  { id: 's1', name: 'Rough' },
  { id: 's2', name: 'Fine' },
];
const ROUTED_TIERS = [
  { id: 'r1', name: 'Poor' },
  { id: 'r2', name: 'Master' },
];

test('simple mode + static dcMode returns the simple tier list', () => {
  const craftingCheck = { simple: { dcMode: 'static', tiers: SIMPLE_TIERS } };
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, 'simple'), SIMPLE_TIERS);
});

test('simple mode + omitted dcMode defaults to static and returns the simple tier list', () => {
  const craftingCheck = { simple: { tiers: SIMPLE_TIERS } };
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, 'simple'), SIMPLE_TIERS);
});

test('simple mode + dynamic dcMode yields no options', () => {
  const craftingCheck = { simple: { dcMode: 'dynamic', tiers: SIMPLE_TIERS } };
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, 'simple'), []);
});

test('routed mode + relative type returns the routed tier list', () => {
  const craftingCheck = { routed: { type: 'relative', tiers: ROUTED_TIERS } };
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, 'routed'), ROUTED_TIERS);
});

test('routed mode + omitted type defaults to relative and returns the routed tier list', () => {
  const craftingCheck = { routed: { tiers: ROUTED_TIERS } };
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, 'routed'), ROUTED_TIERS);
});

test('routed mode + fixed type yields no options', () => {
  const craftingCheck = { routed: { type: 'fixed', tiers: ROUTED_TIERS } };
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, 'routed'), []);
});

// The gates mirror the editors' normalizations, which key off the EXCLUDED value
// only (simple: `dcMode === 'dynamic'`; routed: `type === 'fixed'`). Any other
// value — including a non-canonical one — is treated as the tier-bearing mode, so
// the dropdown can never diverge from what the check editor actually shows.
test('non-canonical dcMode/type is treated as the tier-bearing mode, mirroring the editors', () => {
  assert.deepEqual(
    resolveRecipeCheckTierOptions({ simple: { dcMode: 'weird', tiers: SIMPLE_TIERS } }, 'simple'),
    SIMPLE_TIERS
  );
  assert.deepEqual(
    resolveRecipeCheckTierOptions({ routed: { type: 'weird', tiers: ROUTED_TIERS } }, 'routed'),
    ROUTED_TIERS
  );
});

test('progressive mode yields no options', () => {
  const craftingCheck = { simple: { tiers: SIMPLE_TIERS }, routed: { tiers: ROUTED_TIERS } };
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, 'progressive'), []);
});

test('null / unknown mode yields no options', () => {
  const craftingCheck = { simple: { tiers: SIMPLE_TIERS }, routed: { tiers: ROUTED_TIERS } };
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, null), []);
  assert.deepEqual(resolveRecipeCheckTierOptions(craftingCheck, 'alchemy'), []);
});

test('missing simple config yields no options (no throw)', () => {
  assert.deepEqual(resolveRecipeCheckTierOptions({}, 'simple'), []);
  assert.deepEqual(resolveRecipeCheckTierOptions(null, 'simple'), []);
  assert.deepEqual(resolveRecipeCheckTierOptions(undefined, 'simple'), []);
});

test('missing routed config yields no options (no throw)', () => {
  assert.deepEqual(resolveRecipeCheckTierOptions({}, 'routed'), []);
  assert.deepEqual(resolveRecipeCheckTierOptions(null, 'routed'), []);
  assert.deepEqual(resolveRecipeCheckTierOptions(undefined, 'routed'), []);
});

test('missing tiers arrays yield an empty list (no throw)', () => {
  assert.deepEqual(resolveRecipeCheckTierOptions({ simple: { dcMode: 'static' } }, 'simple'), []);
  assert.deepEqual(resolveRecipeCheckTierOptions({ routed: { type: 'relative' } }, 'routed'), []);
});
