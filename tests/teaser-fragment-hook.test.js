/**
 * Tests for FragmentDiscoveryHook
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

global.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
global.game = { user: { id: 'user-1', name: 'Test User', isGM: false } };

const { registerFragmentDiscoveryHook } = await import('../src/systems/FragmentDiscoveryHook.js');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSystem(overrides = {}) {
  return {
    id: 'sys-1',
    teaserConfig: {
      enabled: true,
      discoveryMode: 'fragments',
      fragments: [
        { id: 'frag-1', name: 'Fragment', linkedItemUuid: 'Compendium.world.items.abc', recipeIds: ['r1'], progressValue: 30 }
      ]
    },
    ...overrides
  };
}

function makeItem(uuid, parentActor = null, sourceUuid = null) {
  return {
    uuid,
    parent: parentActor,
    _sourceUuid: sourceUuid
  };
}

function makeActor() {
  const store = {};
  return {
    id: 'actor-1',
    getFlag: (ns, key) => {
      const k = key.replace('fabricate.', '');
      return store[k] !== undefined ? store[k] : null;
    },
    setFlag: async (ns, key, value) => {
      const k = key.replace('fabricate.', '');
      store[k] = value;
    },
    _store: store
  };
}

// Track calls to discoverFragment
function makeVisibilityService(systems, discoverCalls) {
  return {
    discoverFragment: async (actor, fragmentId, system) => {
      discoverCalls.push({ actor, fragmentId, systemId: system.id });
    }
  };
}

function makeCraftingSystemManager(systems) {
  return { getSystems: () => systems };
}

// Minimal sourceUuid mock — normally imported from utils
global._sourceUuidOverrides = {};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('FragmentDiscoveryHook', () => {
  it('item matching a fragment linkedItemUuid triggers discovery', async () => {
    const discoverCalls = [];
    const actor = makeActor();
    const system = makeSystem();
    const item = makeItem('Compendium.world.items.abc', actor);

    const manager = makeCraftingSystemManager([system]);
    const service = makeVisibilityService([system], discoverCalls);

    const hookFn = registerFragmentDiscoveryHook(manager, service);
    await hookFn(item, {}, 'user-1');

    assert.equal(discoverCalls.length, 1);
    assert.equal(discoverCalls[0].fragmentId, 'frag-1');
  });

  it('item not matching any fragment is ignored', async () => {
    const discoverCalls = [];
    const actor = makeActor();
    const system = makeSystem();
    const item = makeItem('Compendium.world.items.xyz', actor); // different UUID

    const manager = makeCraftingSystemManager([system]);
    const service = makeVisibilityService([system], discoverCalls);

    const hookFn = registerFragmentDiscoveryHook(manager, service);
    await hookFn(item, {}, 'user-1');

    assert.equal(discoverCalls.length, 0);
  });

  it('item added by a different user is ignored', async () => {
    const discoverCalls = [];
    const actor = makeActor();
    const system = makeSystem();
    const item = makeItem('Compendium.world.items.abc', actor);

    const manager = makeCraftingSystemManager([system]);
    const service = makeVisibilityService([system], discoverCalls);

    const hookFn = registerFragmentDiscoveryHook(manager, service);
    await hookFn(item, {}, 'user-2'); // different user

    assert.equal(discoverCalls.length, 0);
  });

  it('system with teaserConfig.enabled=false is skipped', async () => {
    const discoverCalls = [];
    const actor = makeActor();
    const system = makeSystem({ teaserConfig: { enabled: false, discoveryMode: 'fragments', fragments: [{ id: 'frag-1', linkedItemUuid: 'Compendium.world.items.abc', recipeIds: ['r1'], progressValue: 30 }] } });
    const item = makeItem('Compendium.world.items.abc', actor);

    const manager = makeCraftingSystemManager([system]);
    const service = makeVisibilityService([system], discoverCalls);

    const hookFn = registerFragmentDiscoveryHook(manager, service);
    await hookFn(item, {}, 'user-1');

    assert.equal(discoverCalls.length, 0);
  });

  it('system with discoveryMode=threshold (not fragments) is skipped', async () => {
    const discoverCalls = [];
    const actor = makeActor();
    const system = makeSystem({ teaserConfig: { enabled: true, discoveryMode: 'threshold', fragments: [{ id: 'frag-1', linkedItemUuid: 'Compendium.world.items.abc', recipeIds: ['r1'], progressValue: 30 }] } });
    const item = makeItem('Compendium.world.items.abc', actor);

    const manager = makeCraftingSystemManager([system]);
    const service = makeVisibilityService([system], discoverCalls);

    const hookFn = registerFragmentDiscoveryHook(manager, service);
    await hookFn(item, {}, 'user-1');

    assert.equal(discoverCalls.length, 0);
  });

  it('item without a parent actor is ignored', async () => {
    const discoverCalls = [];
    const system = makeSystem();
    const item = makeItem('Compendium.world.items.abc', null); // no parent

    const manager = makeCraftingSystemManager([system]);
    const service = makeVisibilityService([system], discoverCalls);

    const hookFn = registerFragmentDiscoveryHook(manager, service);
    await hookFn(item, {}, 'user-1');

    assert.equal(discoverCalls.length, 0);
  });
});
