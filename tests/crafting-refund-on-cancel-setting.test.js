/**
 * Settings coverage for the player-cancel refund policy (issue 848).
 *
 * `features.refundOnPlayerCancel` is a per-system GM toggle that decides whether a
 * player self-cancelling an in-progress craft gets their consumed inputs back. It is
 * a real default-ON toggle (mirroring `features.salvage`): default true, an explicit
 * false is honoured. This pins the normalizer default + honouring; the adminStore
 * selectedSystem projection is pinned in tests/stores/adminStore.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined,
  },
};
globalThis.game = { user: { isGM: true } };
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

test('features.refundOnPlayerCancel defaults to true (refund on cancel is opt-out)', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.equal(system.features.refundOnPlayerCancel, true);
});

test('features.refundOnPlayerCancel honours an explicit false (inputs forfeit on cancel)', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { refundOnPlayerCancel: false },
  });
  assert.equal(system.features.refundOnPlayerCancel, false);
});

test('features.refundOnPlayerCancel honours an explicit true', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { refundOnPlayerCancel: true },
  });
  assert.equal(system.features.refundOnPlayerCancel, true);
});
