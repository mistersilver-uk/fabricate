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
