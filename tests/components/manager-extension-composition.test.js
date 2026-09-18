import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureCloseOrdering,
  withFabricateLifecycleReplay,
} from '../helpers/extension-composition-harness.js';

// Deliberately NOT Core's four tab ids, and deliberately not four of them.
function provider(id = 'downtime') {
  return {
    apiVersion: 1,
    id,
    tabs: ['board', 'ledger', 'crew'].map((tabId) => ({
      id: tabId,
      label: tabId,
      accessibleName: tabId,
      tooltip: tabId,
      icon: 'fas fa-clock',
      title: `${tabId} title`,
      subtitle: `${tabId} subtitle`,
      breadcrumb: tabId,
    })),
    actions: [{ id: 'guide', label: 'Guide', href: 'https://example.test/guide' }],
    mount() {},
  };
}

test('the production init/ready replay preserves a provider registered through game.fabricate.api', async () => {
  await withFabricateLifecycleReplay(async ({ world, init, ready }) => {
    let unregister = null;
    try {
      // Prove the public seam as a companion sees it: init binds `game.fabricate.api`.
      globalThis.game.fabricate = undefined;
      await init();
      const initApi = globalThis.game.fabricate.api.managerExtensions;
      unregister = initApi.registerWorldNavProvider(provider());

      // Model the late-evaluated-entry recovery that `ready` owns.
      globalThis.game.fabricate = { stale: true };
      await ready();
      const readyApi = globalThis.game.fabricate.api.managerExtensions;
      assert.equal(readyApi, initApi, 'the actual ready callback retains the public API identity');
      assert.equal(
        typeof readyApi.registerWorldNavProvider,
        'function',
        'ready must restore the extension registration API on the actual Fabricate global'
      );
      assert.equal(
        world.fabricate,
        globalThis.game.fabricate,
        'ready must restore the live Fabricate facade before companion access'
      );
      assert.throws(
        () => readyApi.registerWorldNavProvider(provider()),
        /already registered/,
        'the provider registered between the actual lifecycle callbacks must survive ready'
      );
      // A second surface is a second slot, not a conflict.
      const unregisterOtherSurface = readyApi.registerWorldNavProvider(provider('crew-quarters'));
      unregisterOtherSurface();

      unregister();
      unregister = null;
      const unregisterAfterReady = readyApi.registerWorldNavProvider(provider());
      unregisterAfterReady();
    } finally {
      unregister?.();
    }
  });
});

test('the production manager closes a mounted companion before ApplicationV2 removes its target', async () => {
  const lifecycle = await captureCloseOrdering({
    modulePath: '/src/ui/SvelteCraftingSystemManagerApp.svelte.js',
    exportName: 'SvelteCraftingSystemManagerApp',
    disposeMethod: 'disposeDowntimeProviderBeforeRemoval',
    prepareApp: (app) => {
      app._unregisterUserHooks = () => {};
    },
  });

  assert.deepEqual(lifecycle, [
    ['companion-dispose', true],
    ['application-close', { force: true }, true],
  ]);
});

/**
 * Close one production manager with a companion navigation guard installed.
 *
 * @param {object} options Scenario inputs.
 * @param {Function} [options.guard] The value the app's registered companion guard returns.
 * @param {object} [options.closeOptions] Options passed to `close()`.
 * @returns {Promise<{lifecycle: Array, asked: string[]}>} What happened, and whether the
 */
async function closeWithCompanionGuard({ guard, coreGuard, closeOptions }) {
  const asked = [];
  const lifecycle = await captureCloseOrdering({
    modulePath: '/src/ui/SvelteCraftingSystemManagerApp.svelte.js',
    exportName: 'SvelteCraftingSystemManagerApp',
    disposeMethod: 'disposeDowntimeProviderBeforeRemoval',
    closeOptions,
    prepareApp: (app) => {
      app._unregisterUserHooks = () => {};
      if (coreGuard) {
        app._confirmDiscardDirtyToolDraft = () => {
          asked.push('tool');
          return coreGuard();
        };
      }
      if (!guard) return;
      app._confirmDowntimeCompanionNavigation = () => {
        asked.push('asked');
        return guard();
      };
    },
  });
  return { lifecycle, asked };
}

test('a mounted companion with unsaved work keeps the production manager window open', async () => {
  const { lifecycle, asked } = await closeWithCompanionGuard({
    guard: () => Promise.resolve(false),
    closeOptions: {},
  });

  assert.deepEqual(asked, ['asked'], 'a user-initiated close asks the companion');
  assert.deepEqual(
    lifecycle,
    [],
    'and a veto stops the close dead: the companion is never disposed and the window stays up'
  );
});

test('a companion that allows the close changes nothing about it', async () => {
  const { lifecycle, asked } = await closeWithCompanionGuard({
    guard: () => true,
    closeOptions: {},
  });

  assert.deepEqual(asked, ['asked']);
  assert.deepEqual(lifecycle, [
    ['companion-dispose', true],
    ['application-close', {}, true],
  ]);
});

/** THE FORCE EXEMPTION, and why it is not negotiable. */
test('a forced close never consults the companion, however dirty it is', async () => {
  const { lifecycle, asked } = await closeWithCompanionGuard({
    guard: () => false,
    closeOptions: { force: true },
  });

  assert.deepEqual(asked, [], 'the guard is not even called on a forced close');
  assert.deepEqual(lifecycle, [
    ['companion-dispose', true],
    ['application-close', { force: true }, true],
  ]);
});

/**
 * The companion is asked BEFORE Core's own guards, and that order is the guarantee. Core's guards
 * can SAVE — a tool draft, an environment draft — so a save that landed for a close the companion
 * then refused would have written world data for a window that stayed open.
 */
test('asks the companion before the Core guards that can save, and a veto writes nothing', async () => {
  const { lifecycle, asked } = await closeWithCompanionGuard({
    guard: () => false,
    coreGuard: () => true,
    closeOptions: {},
  });

  assert.deepEqual(asked, ['asked'], 'the companion answers first, and its veto ends the close');
  assert.deepEqual(lifecycle, [], 'so the Core guard never runs and the window stays up');
});

test('reaches the Core guards once the companion allows, still in that order', async () => {
  const { lifecycle, asked } = await closeWithCompanionGuard({
    guard: () => true,
    coreGuard: () => true,
    closeOptions: {},
  });

  assert.deepEqual(asked, ['asked', 'tool'], 'companion first, then the Core draft guard');
  assert.deepEqual(lifecycle, [
    ['companion-dispose', true],
    ['application-close', {}, true],
  ]);
});
