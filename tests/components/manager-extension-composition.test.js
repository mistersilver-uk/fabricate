import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { createManagerExtensionsRegistry } from '../../src/ui/managerExtensions.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function bindManagerExtensionsApi(game, registry) {
  game.fabricate ??= {};
  game.fabricate.api = registry.bindPublicApi({});
}

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

test('the init/ready API replay preserves the registered manager-extension provider', () => {
  const registry = createManagerExtensionsRegistry();
  const game = {};

  bindManagerExtensionsApi(game, registry);
  const initApi = game.fabricate.api.managerExtensions;
  const unregister = initApi.registerWorldNavProvider(provider());

  bindManagerExtensionsApi(game, registry);
  const readyApi = game.fabricate.api.managerExtensions;

  assert.equal(readyApi, initApi, 'both lifecycle binds publish the same registration object');
  assert.equal(registry.getWorldNavProvider('downtime')?.id, 'downtime');
  unregister();
  assert.equal(registry.getWorldNavProvider('downtime'), null);
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
