/**
 * Unit tests for tiered-mode normalization cleanup (#134).
 * Covers:
 * AC 1. _normalizeResolutionMode maps 'mapped' → 'routed'
 * AC 2. _normalizeResolutionMode maps 'tiered' → 'routed'
 * AC 3. Existing 'cauldron' → 'alchemy' alias is preserved (regression)
 * AC 4. _normalizeComponent no longer emits a 'tier' field
 * AC 5. _normalizeSystem no longer emits 'enableTiers' or 'tiers' fields
 * AC 6. _normalizeSalvageResolutionMode maps 'mapped' → 'routed'
 * AC 7. _normalizeSalvageResolutionMode maps 'tiered' → 'routed'
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
  const recipeManagerStub = { getRecipes: () => [] };
  return new CraftingSystemManager(recipeManagerStub);
}

// ---------------------------------------------------------------------------
// AC 1 + AC 2: _normalizeResolutionMode legacy aliases
// ---------------------------------------------------------------------------

test('resolutionMode: "mapped" normalizes to "routed"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1', resolutionMode: 'mapped' });
  assert.equal(system.resolutionMode, 'routed');
});

test('resolutionMode: "tiered" normalizes to "routed"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-2', resolutionMode: 'tiered' });
  assert.equal(system.resolutionMode, 'routed');
});

test('resolutionMode: "routed" passes through unchanged', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-3', resolutionMode: 'routed' });
  assert.equal(system.resolutionMode, 'routed');
});

test('resolutionMode: "simple" passes through unchanged', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-4', resolutionMode: 'simple' });
  assert.equal(system.resolutionMode, 'simple');
});

test('resolutionMode: "progressive" passes through unchanged', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-5', resolutionMode: 'progressive' });
  assert.equal(system.resolutionMode, 'progressive');
});

test('resolutionMode: "alchemy" passes through unchanged', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-6', resolutionMode: 'alchemy' });
  assert.equal(system.resolutionMode, 'alchemy');
});

// AC 3: regression — cauldron → alchemy alias preserved

test('resolutionMode: "cauldron" normalizes to "alchemy" (regression)', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-7', resolutionMode: 'cauldron' });
  assert.equal(system.resolutionMode, 'alchemy');
});

test('resolutionMode: unknown value defaults to "simple"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-8', resolutionMode: 'legacy-unknown' });
  assert.equal(system.resolutionMode, 'simple');
});

// ---------------------------------------------------------------------------
// AC 4: _normalizeComponent no longer emits 'tier' (AC 4)
// ---------------------------------------------------------------------------

test('_normalizeComponent does not emit a "tier" field', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-9',
    components: [{ id: 'comp-1', name: 'Iron Ore', tier: 'rare' }]
  });
  const component = system.components[0];
  assert.ok(!Object.prototype.hasOwnProperty.call(component, 'tier'),
    'component should not have a "tier" field');
});

test('_normalizeComponent does not emit "tier" even when item.tier is null', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-10',
    components: [{ id: 'comp-2', name: 'Coal', tier: null }]
  });
  const component = system.components[0];
  assert.ok(!Object.prototype.hasOwnProperty.call(component, 'tier'),
    'component should not have a "tier" field when source tier is null');
});

// ---------------------------------------------------------------------------
// AC 5: _normalizeSystem no longer emits 'enableTiers' or 'tiers' (AC 5)
// ---------------------------------------------------------------------------

test('_normalizeSystem does not emit "enableTiers" field', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-11' });
  assert.ok(!Object.prototype.hasOwnProperty.call(system, 'enableTiers'),
    'system should not have an "enableTiers" field');
});

test('_normalizeSystem does not emit "tiers" field', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-12' });
  assert.ok(!Object.prototype.hasOwnProperty.call(system, 'tiers'),
    'system should not have a "tiers" field');
});

// ---------------------------------------------------------------------------
// AC 6 + AC 7: _normalizeSalvageResolutionMode legacy aliases
// ---------------------------------------------------------------------------

test('salvageResolutionMode: "mapped" normalizes to "routed"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-13', salvageResolutionMode: 'mapped' });
  assert.equal(system.salvageResolutionMode, 'routed');
});

test('salvageResolutionMode: "tiered" normalizes to "routed"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-14', salvageResolutionMode: 'tiered' });
  assert.equal(system.salvageResolutionMode, 'routed');
});

test('salvageResolutionMode: "routed" passes through unchanged', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-15', salvageResolutionMode: 'routed' });
  assert.equal(system.salvageResolutionMode, 'routed');
});

test('salvageResolutionMode: unknown value defaults to "simple"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-16', salvageResolutionMode: 'legacy-unknown' });
  assert.equal(system.salvageResolutionMode, 'simple');
});
