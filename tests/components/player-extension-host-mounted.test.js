import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-player-ext-host-',
  rawModules: ['src/config/hooks.js', 'src/ui/playerExtensions.js', 'src/ui/extensionRegistry.js'],
  compiledModules: ['src/ui/svelte/apps/PlayerExtensionHost.svelte'],
  componentPath: 'src/ui/svelte/apps/PlayerExtensionHost.svelte',
});

function target(root) {
  return root.querySelector('.player-extension-target');
}

/**
 * A companion provider that records what Core did to it.
 *
 * `mount` is a real function returning a real cleanup, so cleanup-count assertions are about
 * the seam rather than about a spy shape.
 *
 * @param {object} [options] Fixture behaviour.
 * @returns {object} `{ provider, calls }`.
 */
function makeProvider({ id = 'downtime', tabIds = ['board', 'ledger'], throwOnMount = false } = {}) {
  const calls = { mounts: [], cleanups: [], contexts: [] };
  const provider = {
    apiVersion: 1,
    id,
    tabs: tabIds.map((tabId) => ({ id: tabId, label: `Companion ${tabId}`, icon: 'fas fa-clock' })),
    mount({ target: mountTarget, tabId, context }) {
      calls.mounts.push({ tabId, connected: mountTarget.isConnected });
      calls.contexts.push(context);
      const node = mountTarget.ownerDocument.createElement('p');
      node.textContent = `companion ${tabId}`;
      node.dataset.companionPanel = tabId;
      mountTarget.append(node);
      if (throwOnMount) throw new Error('companion exploded');
      return () => {
        calls.cleanups.push({ tabId, connected: mountTarget.isConnected });
      };
    },
  };
  return { provider, calls };
}

function frozenContext(overrides = {}) {
  return Object.freeze({
    schemaVersion: 1,
    surface: 'player',
    surfaceId: 'downtime',
    tabId: 'board',
    actorId: null,
    isGM: false,
    revision: 0,
    requestRemount: () => {},
    ...overrides,
  });
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('PlayerExtensionHost (mounted)', () => {
  it('mounts the provider into a connected target and stamps the surface and tab', async () => {
    const { provider, calls } = makeProvider();
    const hooks = [];
    const root = await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'board',
      context: frozenContext(),
      emitHook: (name, payload) => hooks.push([name, payload]),
    });

    assert.deepEqual(calls.mounts, [{ tabId: 'board', connected: true }]);
    assert.equal(target(root).dataset.playerExtensionMounted, 'downtime');
    assert.equal(target(root).dataset.playerExtensionTab, 'board');
    assert.ok(
      Boolean(root.querySelector('[data-companion-panel="board"]')),
      "the companion's own content is in the target"
    );
    assert.deepEqual(
      hooks.map(([name]) => name),
      ['fabricate.player.surfaceMounted']
    );
    assert.deepEqual(hooks[0][1], {
      schemaVersion: 1,
      surface: 'player',
      surfaceId: 'downtime',
      tabId: 'board',
      providerId: 'downtime',
    });
  });

  it('runs cleanup exactly once, while the target is still connected', async () => {
    const { provider, calls } = makeProvider();
    const root = await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'board',
      context: frozenContext(),
    });
    const mountTarget = target(root);

    harness.component.disposeBeforeRemoval();
    assert.deepEqual(calls.cleanups, [{ tabId: 'board', connected: true }]);
    assert.equal(mountTarget.childNodes.length, 0, 'the target is emptied');
    assert.ok(
      !mountTarget.getAttribute('data-player-extension-mounted'),
      'and the mounted stamp goes with it, so a cleared panel cannot claim to be mounted'
    );

    // Idempotent: the `onDestroy` net and a second application-shell call must not re-run it.
    harness.component.disposeBeforeRemoval();
    assert.equal(calls.cleanups.length, 1, 'cleanup runs exactly once');
  });

  it('disposes the previous mount on a tab switch and reports the change', async () => {
    const { provider, calls } = makeProvider();
    const hooks = [];
    const root = await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'board',
      context: frozenContext(),
      emitHook: (name, payload) => hooks.push([name, payload]),
    });

    await harness.setProps({ tabId: 'ledger', context: frozenContext({ tabId: 'ledger' }) });

    assert.deepEqual(calls.cleanups, [{ tabId: 'board', connected: true }]);
    assert.deepEqual(calls.mounts, [
      { tabId: 'board', connected: true },
      { tabId: 'ledger', connected: true },
    ]);
    assert.equal(target(root).dataset.playerExtensionTab, 'ledger');
    const tabChanged = hooks.find(([name]) => name === 'fabricate.player.surfaceTabChanged');
    assert.ok(Boolean(tabChanged), 'the tab change is reported');
    assert.equal(tabChanged[1].previousTabId, 'board');
    assert.equal(tabChanged[1].tabId, 'ledger');
  });

  it('refuses to mount a tab the active provider does not declare', async () => {
    const { provider, calls } = makeProvider({ tabIds: ['board'] });
    const root = await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'ledger',
      context: frozenContext({ tabId: 'ledger' }),
    });

    assert.deepEqual(calls.mounts, [], 'the one-render window where the id and provider disagree');
    assert.ok(!target(root).getAttribute('data-player-extension-mounted'), 'nothing is stamped');
  });

  it('contains a mount fault: partial content is cleared and the fault is reported UP', async () => {
    const { provider, calls } = makeProvider({ throwOnMount: true });
    const faults = [];
    const errors = [];
    const root = await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'board',
      context: frozenContext(),
      reportError: (...args) => errors.push(args),
      onProviderFault: (faulted) => faults.push(faulted),
    });

    assert.equal(calls.mounts.length, 1, 'the mount was attempted');
    assert.equal(target(root).childNodes.length, 0, 'the partial content the companion appended is gone');
    assert.ok(!target(root).getAttribute('data-player-extension-mounted'), 'and nothing is stamped');
    assert.deepEqual(faults, [provider], 'the fault is reported UP rather than healed locally');
    assert.equal(errors.length, 1, 'and reported through the injected error sink');
  });

  it('treats a non-function, non-undefined mount return as a fault', async () => {
    const faults = [];
    const errors = [];
    const provider = {
      apiVersion: 1,
      id: 'downtime',
      tabs: [{ id: 'board', label: 'Board', icon: 'fas fa-clock' }],
      mount: () => 'not a cleanup function',
    };
    await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'board',
      context: frozenContext(),
      reportError: (...args) => errors.push(args),
      onProviderFault: (faulted) => faults.push(faulted),
    });

    assert.deepEqual(faults, [provider]);
    assert.match(String(errors[0][1]), /cleanup function or nothing/);
  });

  it('remounts with a fresh frozen context when requestRemount advances the revision', async () => {
    const { provider, calls } = makeProvider();
    await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'board',
      context: frozenContext({ revision: 0 }),
    });

    await harness.setProps({ context: frozenContext({ revision: 1 }) });

    assert.equal(calls.mounts.length, 2, 'a new frozen context identity is the remount mechanism');
    assert.deepEqual(calls.cleanups, [{ tabId: 'board', connected: true }]);
    assert.notEqual(calls.contexts[0], calls.contexts[1], 'the context is REPLACED, never mutated');
    assert.equal(calls.contexts[1].revision, 1);
  });

  it('hands the companion a frozen context whose sorted key set is pinned at schemaVersion 1', async () => {
    const { provider, calls } = makeProvider();
    await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'board',
      context: frozenContext(),
    });

    const context = calls.contexts[0];
    assert.ok(Object.isFrozen(context), 'the context is frozen');
    assert.equal(context.schemaVersion, 1);
    // Pinned TOGETHER with the version: a key added or removed without a version bump is a
    // silent contract change for every companion already built against it.
    assert.deepEqual(Object.keys(context).sort(), [
      'actorId',
      'isGM',
      'requestRemount',
      'revision',
      'schemaVersion',
      'surface',
      'surfaceId',
      'tabId',
    ]);
  });

  it('reports the surface unmount after tearing the companion down', async () => {
    const { provider, calls } = makeProvider();
    const hooks = [];
    await harness.mount({
      provider,
      surfaceId: 'downtime',
      tabId: 'board',
      context: frozenContext(),
      emitHook: (name, payload) => hooks.push([name, payload]),
    });

    harness.remount();

    assert.equal(calls.cleanups.length, 1, 'the onDestroy net still runs the cleanup');
    assert.deepEqual(
      hooks.map(([name]) => name),
      ['fabricate.player.surfaceMounted', 'fabricate.player.surfaceUnmounted']
    );
    assert.equal(hooks[1][1].providerId, 'downtime');
  });
});
