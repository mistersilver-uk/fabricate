/**
 * Per-token node-state override seam coverage at the GatheringRichStateService
 * level (the actual read/write seam threaded from `GatheringEngine.startAttempt`'s
 * `nodeStateOverride`).
 *
 * Asserts the service PREFERS an injected `nodeState` adapter over
 * `environment.nodeRuntime[taskId]` for the depletion gate, the listing node
 * counts, and the decrement-on-commit — and that `environment.nodeRuntime` is
 * left UNTOUCHED when the override is present (the write routes through the
 * adapter, i.e. the GM socket). The absent-override branch still uses
 * `nodeRuntime`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../../src/config/settings.js';

const SYS = 'sys-tok';

function makeService() {
  const config = {
    systems: {
      [SYS]: {
        economy: { mode: 'nodes' },
        tasks: [{ id: 'task-1', name: 'Mine', nodes: { enabled: true, max: 5, current: 5, depletionTiming: 'onStart', respawn: { policy: 'manual' } } }]
      }
    }
  };
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  const envUpdates = [];
  const environmentStore = {
    get: (id) => (id === 'env-1' ? { id: 'env-1', craftingSystemId: SYS, nodeRuntime: { 'task-1': { enabled: true, max: 5, current: 5, respawn: { policy: 'manual' } } } } : null),
    update: async (id, patch) => { envUpdates.push({ id, patch }); return { id, ...patch }; }
  };
  const service = new GatheringRichStateService({
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    environmentStore,
    nowWorldTime: () => 0,
    hooks: { callAll: () => {} }
  });
  return { service, envUpdates };
}

// A minimal per-token adapter that reads a local node and records writes.
function tokenAdapter(node) {
  const writes = [];
  return {
    adapter: {
      read: () => node,
      write: (next) => { writes.push(next); }
    },
    writes
  };
}

const environment = { id: 'env-1', craftingSystemId: SYS, nodeRuntime: { 'task-1': { enabled: true, max: 5, current: 5, respawn: { policy: 'manual' } } } };
const system = { id: SYS };
const task = { id: 'task-1', nodes: { enabled: true, max: 5, current: 5, depletionTiming: 'onStart', respawn: { policy: 'manual' } } };

test('evaluateStart blocks on the OVERRIDE node depletion, not the env node', async () => {
  const { service } = makeService();
  const { adapter } = tokenAdapter({ enabled: true, max: 5, current: 0, respawn: { policy: 'manual' } });
  const result = await service.evaluateStart({ actor: null, system, environment, task, viewer: { isGM: true }, nodeState: adapter });
  assert.equal(result.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true, 'the depleted TOKEN node blocks even though the env node is full');
});

test('evaluateStart does NOT block when the override node is available (env node ignored)', async () => {
  const { service } = makeService();
  // Env node is full (5); token override is also available (2). Neither blocks.
  const { adapter } = tokenAdapter({ enabled: true, max: 5, current: 2, respawn: { policy: 'manual' } });
  const result = await service.evaluateStart({ actor: null, system, environment, task, viewer: { isGM: true }, nodeState: adapter });
  assert.equal(result.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), false);
});

test('buildListingMetadata surfaces the OVERRIDE node counts + depleted flag', async () => {
  const { service } = makeService();
  const { adapter } = tokenAdapter({ enabled: true, max: 5, current: 0, respawn: { policy: 'manual' } });
  const meta = service.buildListingMetadata({ environment, task, actor: null, viewer: { isGM: true }, nodeState: adapter });
  assert.equal(meta.nodes.current, 0, 'reflects the token node count, not the env node (5)');
  assert.equal(meta.nodes.max, 5);
  assert.equal(meta.nodes.depleted, true);
  assert.equal(meta.nodes.available, false);
});

test('commitAcceptedAttempt decrements the OVERRIDE node and leaves env nodeRuntime untouched', async () => {
  const { service, envUpdates } = makeService();
  const { adapter, writes } = tokenAdapter({ enabled: true, max: 5, current: 3, depletionTiming: 'onStart', respawn: { policy: 'manual' } });
  const evidence = await service.commitAcceptedAttempt({
    actor: null, system, environment, task, outcome: { status: 'succeeded' }, viewer: { isGM: true }, nodeState: adapter
  });
  // The TOKEN node was decremented and persisted through the adapter (GM socket).
  assert.equal(writes.length, 1, 'the token node write routed through the adapter');
  assert.equal(writes[0].current, 2, '3 → 2');
  assert.equal(evidence.node.remaining, 2);
  // The per-environment nodeRuntime was NOT written.
  assert.equal(envUpdates.length, 0, 'environment.nodeRuntime is untouched when an override is present');
});

test('commitAcceptedAttempt without an override falls back to env nodeRuntime (no token write)', async () => {
  const { service, envUpdates } = makeService();
  const evidence = await service.commitAcceptedAttempt({
    actor: null, system, environment, task, outcome: { status: 'succeeded' }, viewer: { isGM: true }
  });
  // No override ⇒ the env node runtime is written (the pre-existing behavior).
  assert.equal(envUpdates.length, 1, 'env nodeRuntime is written when there is no override');
  assert.equal(evidence.node.remaining, 4, '5 → 4 on the env node');
});

test('respawn no-ops correctly: a manual override node is never auto-respawned (decrement only on commit)', async () => {
  const { service } = makeService();
  // Manual respawn policy ⇒ evaluateStart/commit never respawn; the gate just
  // reads current. A depleted manual node stays blocked.
  const { adapter } = tokenAdapter({ enabled: true, max: 5, current: 0, respawn: { policy: 'manual' } });
  const result = await service.evaluateStart({ actor: null, system, environment, task, viewer: { isGM: true }, nodeState: adapter });
  assert.equal(result.blockedReasons.some(r => r.code === 'NODE_DEPLETED'), true);
});
