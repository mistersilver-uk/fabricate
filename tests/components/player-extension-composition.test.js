import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureCloseOrdering,
  withFabricateLifecycleReplay,
} from '../helpers/extension-composition-harness.js';

// The provider declares its OWN tab ids, and three of them rather than a copy of Core's five.
// A fixture mirroring Core's list cannot tell "the seam accepts what the companion declares"
// apart from "the seam happens to accept Core's own ids".
function provider(id = 'downtime') {
  return {
    apiVersion: 1,
    id,
    tabs: ['board', 'ledger', 'crew'].map((tabId) => ({
      id: tabId,
      label: `Companion ${tabId}`,
      icon: 'fas fa-clock',
      accessibleName: `Open Companion ${tabId}`,
      tooltip: `Companion ${tabId} tools`,
    })),
    mount() {},
  };
}

test('the production init/ready replay preserves a provider registered through game.fabricate.api', async () => {
  await withFabricateLifecycleReplay(async ({ world, init, ready }) => {
    let unregister = null;
    try {
      globalThis.game.fabricate = undefined;
      await init();
      const initApi = globalThis.game.fabricate.api.playerExtensions;
      unregister = initApi.registerPlayerNavProvider(provider());

      // The late-evaluated-entry recovery `ready` owns: the init-bound facade has gone, but
      // the page-session registry still holds the companion provider.
      globalThis.game.fabricate = { stale: true };
      await ready();
      const readyApi = globalThis.game.fabricate.api.playerExtensions;
      assert.equal(readyApi, initApi, 'the actual ready callback retains the public API identity');
      assert.equal(
        typeof readyApi.registerPlayerNavProvider,
        'function',
        'ready must restore the player registration API on the actual Fabricate global'
      );
      assert.equal(
        world.fabricate,
        globalThis.game.fabricate,
        'ready must restore the live Fabricate facade before companion access'
      );
      assert.throws(
        () => readyApi.registerPlayerNavProvider(provider()),
        /already registered/,
        'the provider registered between the actual lifecycle callbacks must survive ready'
      );
      // The two registries hold SEPARATE surface-id namespaces, so one companion may claim
      // the same surface id in both windows.
      const unregisterManagerSurface =
        globalThis.game.fabricate.api.managerExtensions.registerWorldNavProvider({
          apiVersion: 1,
          id: 'downtime',
          tabs: [
            {
              id: 'board',
              label: 'Board',
              accessibleName: 'Board',
              tooltip: 'Board',
              icon: 'fas fa-clock',
            },
          ],
          mount() {},
        });
      unregisterManagerSurface();

      unregister();
      unregister = null;
      const unregisterAfterReady = readyApi.registerPlayerNavProvider(provider());
      unregisterAfterReady();
    } finally {
      unregister?.();
    }
  });
});

// AC9. `_registerHooks()` runs from `_onRender` — AFTER the render pipeline has built the
// first frame's props — and returns early once the hook bag exists, while `show()` reuses the
// singleton. So a companion that follows the documented contract (register during your own
// `init`, before the window is ever opened) gets its tabs on the first open only if
// `_prepareSvelteProps()` DERIVES the snapshot rather than reading a field something else
// seeded. This test never publishes after registration: it registers, then asks the
// production class for the props of a first render, and reads the rail model off them.
test('a provider registered before the window is first opened is in the first frame props', async () => {
  await withFabricateLifecycleReplay(async ({ init, loadModule }) => {
    let unregister = null;
    try {
      globalThis.game.fabricate = undefined;
      await init();
      unregister = globalThis.game.fabricate.api.playerExtensions.registerPlayerNavProvider(
        provider()
      );

      const { SvelteFabricateApp } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
      const { buildPlayerNavTabs } = await loadModule('/src/ui/playerNavModel.js');
      // The lab's own "borrow the prototype" shape: a first render's props with no
      // ApplicationV2 involved, and — critically — with `_hookIds` still null, so nothing has
      // subscribed and no publication has occurred.
      const app = Object.assign(Object.create(SvelteFabricateApp.prototype), {
        _activeTab: 'crafting',
        _services: null,
        _activeCanvasTool: null,
        _scopedEnvironmentId: null,
        _scopedTaskId: null,
        _scopedActorId: null,
        _scopedInteractableRef: null,
        _hookIds: null,
        _playerExtensionsUnsubscribe: null,
      });

      const props = app._prepareSvelteProps();
      assert.equal(app._hookIds, null, 'nothing may have subscribed to produce the first frame');
      assert.equal(
        app._playerExtensionsUnsubscribe,
        null,
        'and the registry subscription must not exist yet either'
      );
      assert.deepEqual(
        props.extensionSurfaces.map((surface) => surface.surfaceId),
        ['downtime'],
        'the first frame props must already carry the registered surface'
      );
      assert.equal(
        props.playerExtensions?.publicApi,
        globalThis.game.fabricate.api.playerExtensions,
        'the prop must be the SAME page-session registry the public API registers into'
      );
      assert.deepEqual(
        buildPlayerNavTabs({
          coreTabs: [],
          extensionSurfaces: props.extensionSurfaces,
          localize: (key) => key,
        }).map((tab) => tab.routeKey),
        ['ext:downtime:board', 'ext:downtime:ledger', 'ext:downtime:crew'],
        "the rail model built from the first frame's props already offers the companion tabs"
      );
    } finally {
      unregister?.();
    }
  });
});

// The validity guard on `_selectTab` was asserted only as source text, and the enumeration of
// guarded sites left this one out — so removing the predicate from the method the case is NAMED
// for left 49 tests green. The prototype borrow above is what makes a real behavioural claim
// possible: `_selectTab` reads nothing but `isOfferedTab`, `this._activeTab` and
// `this.updateProps`, so a headless instance is a faithful subject for it and the
// "cannot be instantiated headless" premise the source-regex block rests on does not reach here.
test('_selectTab refuses every route the window does not currently offer', async () => {
  await withFabricateLifecycleReplay(async ({ init, loadModule }) => {
    let unregister = null;
    try {
      globalThis.game.fabricate = undefined;
      await init();
      unregister = globalThis.game.fabricate.api.playerExtensions.registerPlayerNavProvider(
        provider()
      );

      const { SvelteFabricateApp } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
      const pushed = [];
      const app = Object.assign(Object.create(SvelteFabricateApp.prototype), {
        _activeTab: 'crafting',
        updateProps: (props) => pushed.push(props),
      });

      for (const refused of [
        // Core-SHAPED — `isCoreTabId` says "not a provider route key", which is true of any
        // non-empty string — but not one of this window's own Core ids.
        'bogus',
        // The LIVE provider, and a tab it does not declare.
        'ext:downtime:nope',
        // A surface nothing ever registered.
        'ext:nobody:board',
        'ext:downtime',
        '',
        null,
      ]) {
        app._selectTab(refused);
        assert.equal(
          app._activeTab,
          'crafting',
          `_selectTab must refuse ${JSON.stringify(refused)} and leave the active route alone`
        );
      }
      assert.deepEqual(pushed, [], 'and a refused route must never reach the mounted component');

      app._selectTab('gathering');
      app._selectTab('ext:downtime:ledger');
      assert.equal(app._activeTab, 'ext:downtime:ledger');
      assert.deepEqual(
        pushed,
        [{ activeTab: 'gathering' }, { activeTab: 'ext:downtime:ledger' }],
        'a Core tab and a registered companion route both still move the window, exactly once each'
      );

      // The predicate is LIVE, not a set frozen at construction: the very same route stops
      // being selectable the moment its provider goes.
      unregister();
      unregister = null;
      app._activeTab = 'crafting';
      app._selectTab('ext:downtime:ledger');
      assert.equal(
        app._activeTab,
        'crafting',
        'an unregistered companion route must be refused like any other unoffered route'
      );
      assert.equal(pushed.length, 2, 'and must push nothing');
    } finally {
      unregister?.();
    }
  });
});

test('the production player window closes a mounted companion before ApplicationV2 removes its target', async () => {
  const lifecycle = await captureCloseOrdering({
    modulePath: '/src/ui/SvelteFabricateApp.svelte.js',
    exportName: 'SvelteFabricateApp',
    disposeMethod: 'disposePlayerProvidersBeforeRemoval',
  });

  // The ordering assertion targets the AWAITED `super.close(options)`: unlike the manager,
  // this class assigns the result and returns it afterwards, so a check that only looked at
  // the returned expression would be looking at the wrong statement.
  assert.deepEqual(lifecycle, [
    ['companion-dispose', true],
    ['application-close', { force: true }, true],
  ]);
});
