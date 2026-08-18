import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureCloseOrdering,
  withFabricateLifecycleReplay,
} from '../helpers/extension-composition-harness.js';

// Deliberately NOT Core's four tab ids, and deliberately not four of them: the public seam
// a companion reaches through `game.fabricate.api` must accept the tab set the companion
// declares, and a fixture that mirrors Core's list cannot tell the two apart.
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
      // Prove the public seam as a companion sees it: init binds `game.fabricate.api`, then a
      // companion registers before ready rebinds the live global.
      globalThis.game.fabricate = undefined;
      await init();
      const initApi = globalThis.game.fabricate.api.managerExtensions;
      unregister = initApi.registerWorldNavProvider(provider());

      // Model the late-evaluated-entry recovery that `ready` owns: the init-bound facade has
      // disappeared, but the page-session registry still contains the companion provider.
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
      // A second surface is a second slot, not a conflict: the registry is keyed by surface
      // id, so a companion claiming a Manager surface Core has never heard of is accepted.
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
 * A helper rather than three inlined `captureCloseOrdering` calls: the three cases below
 * differ only in what the guard answers and what `close` is passed, and three copies of the
 * same eight-line block is the near-identical duplication the SonarCloud gate counts against
 * `tests/**` exactly as it does against `src/`.
 *
 * @param {object} options Scenario inputs.
 * @param {Function} [options.guard] The value the app's registered companion guard returns.
 * @param {object} [options.closeOptions] Options passed to `close()`.
 * @returns {Promise<{lifecycle: Array, asked: string[]}>} What happened, and whether the
 *   companion was consulted at all.
 */
async function closeWithCompanionGuard({ guard, closeOptions }) {
  const asked = [];
  const lifecycle = await captureCloseOrdering({
    modulePath: '/src/ui/SvelteCraftingSystemManagerApp.svelte.js',
    exportName: 'SvelteCraftingSystemManagerApp',
    disposeMethod: 'disposeDowntimeProviderBeforeRemoval',
    closeOptions,
    prepareApp: (app) => {
      app._unregisterUserHooks = () => {};
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

/**
 * THE FORCE EXEMPTION, and why it is not negotiable.
 *
 * Foundry's own lifecycle teardown and the repository's smoke harness both close with
 * `force`, in contexts where no confirmation dialog can be serviced. A guard that ran there
 * would be asking a question nothing can answer — the smoke harness would hang on it, and a
 * Foundry teardown would leave a window that refuses to die. So a forced close skips the
 * companion exactly as it already skips Core's own three dirty-draft guards.
 */
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
