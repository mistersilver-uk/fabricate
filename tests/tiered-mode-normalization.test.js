/**
 * Unit tests for removal of tiered-mode remnants from normalization (#134).
 *
 * Acceptance criteria:
 * 1. _normalizeResolutionMode maps 'mapped' → 'routed' and 'tiered' → 'routed'.
 * 2. Unit tests confirm mapped and tiered resolution modes normalize to routed on load.
 * 3. Existing 'cauldron' → 'alchemy' normalization is preserved (regression test).
 * 4. _normalizeComponent no longer emits `tier`.
 * 5. _normalizeSystem no longer emits `enableTiers` or `tiers`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal stubs so the module can load without a Foundry runtime
let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined
  }
};
globalThis.game = {};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ---------------------------------------------------------------------------
// AC 1 & 2 — _normalizeResolutionMode maps 'mapped' and 'tiered' to 'routed'
// ---------------------------------------------------------------------------

test('_normalizeSystem - resolutionMode "mapped" normalizes to "routed"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1', resolutionMode: 'mapped' });
  assert.equal(system.resolutionMode, 'routed');
});

test('_normalizeSystem - resolutionMode "tiered" normalizes to "routed"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1', resolutionMode: 'tiered' });
  assert.equal(system.resolutionMode, 'routed');
});

// AC 3 — regression: 'cauldron' → 'alchemy' is still preserved
test('_normalizeSystem - resolutionMode "cauldron" still normalizes to "alchemy" (regression)', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1', resolutionMode: 'cauldron' });
  assert.equal(system.resolutionMode, 'alchemy');
});

// Canonical modes pass through unchanged
test('_normalizeSystem - resolutionMode "simple" passes through unchanged', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1', resolutionMode: 'simple' });
  assert.equal(system.resolutionMode, 'simple');
});

test('_normalizeSystem - resolutionMode "routed" passes through unchanged', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1', resolutionMode: 'routed' });
  assert.equal(system.resolutionMode, 'routed');
});

test('_normalizeSystem - resolutionMode "progressive" passes through unchanged', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1', resolutionMode: 'progressive' });
  assert.equal(system.resolutionMode, 'progressive');
});

test('_normalizeSystem - unknown resolutionMode defaults to "simple"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1', resolutionMode: 'legacy-unknown' });
  assert.equal(system.resolutionMode, 'simple');
});

// ---------------------------------------------------------------------------
// AC 4 — _normalizeComponent no longer emits `tier`
// ---------------------------------------------------------------------------

test('_normalizeComponent - does not emit `tier` field', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    managedItems: [{ id: 'comp-1', name: 'Iron Ore', tier: 'common' }]
  });
  const component = system.components[0];
  assert.ok(!Object.prototype.hasOwnProperty.call(component, 'tier'),
    'component must not have a `tier` field');
});

test('_normalizeComponent - does not emit `tier` even when source item has no tier', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    managedItems: [{ id: 'comp-2', name: 'Herb' }]
  });
  const component = system.components[0];
  assert.ok(!Object.prototype.hasOwnProperty.call(component, 'tier'),
    'component must not have a `tier` field');
});

// ---------------------------------------------------------------------------
// AC 5 — _normalizeSystem no longer emits `enableTiers` or `tiers`
// ---------------------------------------------------------------------------

test('_normalizeSystem - does not emit `enableTiers` field', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.ok(!Object.prototype.hasOwnProperty.call(system, 'enableTiers'),
    'system must not have an `enableTiers` field');
});

test('_normalizeSystem - does not emit `tiers` field', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.ok(!Object.prototype.hasOwnProperty.call(system, 'tiers'),
    'system must not have a `tiers` field');
});
