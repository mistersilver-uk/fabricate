import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureCloseOrdering,
  withFabricateLifecycleReplay,
} from '../helpers/extension-composition-harness.js';

// The provider declares its OWN tab ids, and three of them rather than a copy of Core's five.
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

      // The late-evaluated-entry recovery `ready` owns: the init-bound facade has gone.
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
      // The two registries hold SEPARATE surface-id namespaces.
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

// AC9. `_registerHooks()` runs from `_onRender`.
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
      // The lab's own "borrow the prototype" shape.
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

// The validity guard on `_selectTab` was asserted only as source text.
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
        // Core-SHAPED — `isCoreTabId` says "not a provider route key".
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

      // The predicate is LIVE, not a set frozen at construction.
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

// The player Downtime experimental gate (issue 1257).
test('the downtime surface is withheld from the player window until the world opts in', async () => {
  await withFabricateLifecycleReplay(async ({ init, loadModule }) => {
    const releases = [];
    try {
      globalThis.game.fabricate = undefined;
      await init();
      const api = globalThis.game.fabricate.api.playerExtensions;
      // TWO companions, and only one of them claims the gated id. A single-provider fixture
      // cannot tell "the gated surface is withheld" apart from "the seam went dark".
      releases.push(api.registerPlayerNavProvider(provider()));
      releases.push(api.registerPlayerNavProvider(provider('crew-quarters')));

      // The lab world boots with experimental features ON; this is the default a real world has.
      await globalThis.game.settings.set('fabricate', 'experimentalFeatures', false);

      const { SvelteFabricateApp } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
      const pushed = [];
      const headless = () =>
        Object.assign(Object.create(SvelteFabricateApp.prototype), {
          _activeTab: 'crafting',
          _services: null,
          _activeCanvasTool: null,
          _scopedEnvironmentId: null,
          _scopedTaskId: null,
          _scopedActorId: null,
          _scopedInteractableRef: null,
          _hookIds: null,
          _playerExtensionsUnsubscribe: null,
          updateProps: (props) => pushed.push(props),
        });

      const app = headless();
      assert.deepEqual(
        app._prepareSvelteProps().extensionSurfaces.map((surface) => surface.surfaceId),
        ['crew-quarters'],
        'the gated surface is absent from the frame while the ungated companion still renders'
      );

      // UNREACHABLE, not merely unlinked: the rail has no entry.
      app._selectTab('ext:downtime:board');
      assert.equal(app._activeTab, 'crafting', '_selectTab must refuse a gated companion route');
      assert.deepEqual(pushed, [], 'and must push nothing to the mounted component');
      app._selectTab('ext:crew-quarters:board');
      assert.equal(
        app._activeTab,
        'ext:crew-quarters:board',
        'while an ungated companion route is selectable exactly as it always was'
      );

      // THE STALE-RAIL CASE the spec's gate section states.
      await globalThis.game.settings.set('fabricate', 'experimentalFeatures', true);
      const stale = headless();
      assert.ok(
        stale
          ._prepareSvelteProps()
          .extensionSurfaces.some((surface) => surface.surfaceId === 'downtime'),
        'the frame derived while the world had opted in offers the surface'
      );
      await globalThis.game.settings.set('fabricate', 'experimentalFeatures', false);
      stale._selectTab('ext:downtime:board');
      assert.equal(
        stale._activeTab,
        'crafting',
        'and the route is refused once the gate shuts, without waiting for a fresh snapshot'
      );

      // REGISTRATION IS NEVER GATED. The provider registered while the gate was shut is still
      // held, keeps its unregister handle, and needs no re-registration to appear.
      await globalThis.game.settings.set('fabricate', 'experimentalFeatures', true);
      assert.deepEqual(
        headless()
          ._prepareSvelteProps()
          .extensionSurfaces.map((surface) => surface.surfaceId),
        ['downtime', 'crew-quarters'],
        'the same registration renders the moment the world opts in'
      );
    } finally {
      for (const release of releases) release?.();
    }
  });
});

test('the production player window closes a mounted companion before ApplicationV2 removes its target', async () => {
  const lifecycle = await captureCloseOrdering({
    modulePath: '/src/ui/SvelteFabricateApp.svelte.js',
    exportName: 'SvelteFabricateApp',
    disposeMethod: 'disposePlayerProvidersBeforeRemoval',
  });

  // The ordering assertion targets the AWAITED `super.close(options)`.
  assert.deepEqual(lifecycle, [
    ['companion-dispose', true],
    ['application-close', { force: true }, true],
  ]);
});
