import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function provider() {
  return {
    apiVersion: 1,
    id: 'downtime',
    tabs: ['tracking', 'activities', 'factions', 'settings'].map((id) => ({
      id,
      label: id,
      accessibleName: id,
      tooltip: id,
      icon: 'fas fa-clock',
    })),
    mount() {},
  };
}

test('the production init/ready replay preserves a provider registered through game.fabricate.api', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.CONFIG;
  let world = null;
  let unregister = null;
  const vite = await createServer({
    root: repoRoot,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });

  // `buildLabWorld` is the smallest faithful Foundry host for evaluating the real entry module.
  // Its browser-side fetches need this direct file response when the composition test runs in Node.
  globalThis.fetch = async (url) => {
    if (String(url) !== '/lang/en.json') return new Response('', { status: 404 });
    return new Response(await readFile(resolve(repoRoot, 'lang/en.json')), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  globalThis.CONFIG = {};

  try {
    const { buildLabWorld } = await vite.ssrLoadModule('/tests/view-lab/world/labWorld.js');
    world = await buildLabWorld();
    const hookEntries = [...globalThis.Hooks.registrations.values()];
    const init = hookEntries.find((entry) => entry.event === 'init')?.handler;
    const ready = hookEntries.find((entry) => entry.event === 'ready')?.handler;
    assert.equal(typeof init, 'function', 'main.js should register its actual init callback');
    assert.equal(typeof ready, 'function', 'main.js should register its actual ready callback');

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
    unregister();
    unregister = null;
    const unregisterAfterReady = readyApi.registerWorldNavProvider(provider());
    unregisterAfterReady();
  } finally {
    unregister?.();
    world?.shim.restore();
    globalThis.fetch = originalFetch;
    globalThis.CONFIG = originalConfig;
    await vite.close();
  }
});

test('the production manager closes a mounted companion before ApplicationV2 removes its target', async () => {
  const originalFoundry = globalThis.foundry;
  const originalHooks = globalThis.Hooks;
  const originalGame = globalThis.game;
  const lifecycle = [];

  class ApplicationV2 {
    async close(options) {
      lifecycle.push(['application-close', options, this._svelteComponent?.targetConnected]);
      return this;
    }
  }

  globalThis.foundry = { applications: { api: { ApplicationV2 } } };
  globalThis.Hooks = { on: () => 1, off: () => {}, once: () => 1 };
  globalThis.game = { i18n: { localize: (key) => key, format: (key) => key } };

  const vite = await createServer({
    root: repoRoot,
    server: { middlewareMode: true },
    appType: 'custom',
  });
  try {
    const { SvelteCraftingSystemManagerApp } = await vite.ssrLoadModule(
      '/src/ui/SvelteCraftingSystemManagerApp.svelte.js'
    );
    const app = new SvelteCraftingSystemManagerApp();
    app._svelteComponent = {
      targetConnected: true,
      disposeDowntimeProviderBeforeRemoval() {
        lifecycle.push(['companion-dispose', this.targetConnected]);
      },
    };
    app._unregisterUserHooks = () => {};

    await app.close({ force: true });

    assert.deepEqual(lifecycle, [
      ['companion-dispose', true],
      ['application-close', { force: true }, true],
    ]);
  } finally {
    await vite.close();
    globalThis.foundry = originalFoundry;
    globalThis.Hooks = originalHooks;
    globalThis.game = originalGame;
  }
});
