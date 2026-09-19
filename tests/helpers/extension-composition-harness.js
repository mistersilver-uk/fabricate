/**
 * Both composition boots use one isolated middleware-server factory with distinct Foundry hosts.
 * Lifecycle replay supplies `/lang/en.json` and `CONFIG` for the real entry module's boot.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { viteDepCacheDir } from './vite-dep-cache-dir.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function startCompositionServer() {
  const vite = await createServer({
    root: repoRoot,
    cacheDir: viteDepCacheDir(),
    // Test processes own their cache; sequential boots retain warm prebundles.
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  return { vite, close: () => vite.close() };
}

/**
 * Boot the real entry module inside `buildLabWorld`'s Foundry host and hand the caller the ACTUAL
 * `init` and `ready` callbacks `src/main.js` registered.
 *
 * @param {(context: {world: object, init: Function, ready: Function}) => Promise<void>} run
 * Scenario body. Its own cleanup belongs in its own `finally`; this helper restores only the
 * globals and the server it created.
 */
export async function withFabricateLifecycleReplay(run) {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.CONFIG;
  let world = null;
  const { vite, close } = await startCompositionServer();

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
    await run({ world, init, ready, loadModule: (path) => vite.ssrLoadModule(path) });
  } finally {
    world?.shim.restore();
    globalThis.fetch = originalFetch;
    globalThis.CONFIG = originalConfig;
    await close();
  }
}

/**
 * Instantiate one production application against a recording ApplicationV2 base and the Foundry
 * globals it reads, then run the scenario against that instance. `modulePath` is Vite-root-relative
 * and `hooks` is the `globalThis.Hooks` the class registers against.
 */
async function withProductionApplication({ modulePath, exportName, ApplicationV2, hooks }, run) {
  const originalFoundry = globalThis.foundry;
  const originalHooks = globalThis.Hooks;
  const originalGame = globalThis.game;
  const { vite, close } = await startCompositionServer();
  try {
    globalThis.foundry = { applications: { api: { ApplicationV2 } } };
    globalThis.Hooks = hooks;
    globalThis.game = { i18n: { localize: (key) => key, format: (key) => key } };
    const module = await vite.ssrLoadModule(modulePath);
    const ApplicationClass = module[exportName];
    assert.equal(typeof ApplicationClass, 'function', `${modulePath} should export ${exportName}`);
    await run(new ApplicationClass());
  } finally {
    globalThis.foundry = originalFoundry;
    globalThis.Hooks = originalHooks;
    globalThis.game = originalGame;
    await close();
  }
}

/**
 * Close one production application against a recording ApplicationV2 base and report the ordered
 * lifecycle.
 *
 * @param {object} options `disposeMethod` is the Svelte-root export the application must call
 * first; `prepareApp` stubs the instance; `closeOptions` reach `close()`.
 * @returns {Promise<Array>} `[['companion-dispose', targetConnected], ['application-close',
 * options, targetConnected]]` in the order they actually happened.
 */
export async function captureCloseOrdering({
  modulePath,
  exportName,
  disposeMethod,
  prepareApp = () => {},
  closeOptions = { force: true },
}) {
  const lifecycle = [];

  class ApplicationV2 {
    async close(options) {
      lifecycle.push(['application-close', options, this._svelteComponent?.targetConnected]);
      return this;
    }
  }

  await withProductionApplication(
    {
      modulePath,
      exportName,
      ApplicationV2,
      hooks: { on: () => 1, off: () => {}, once: () => 1 },
    },
    async (app) => {
      app._svelteComponent = {
        targetConnected: true,
        [disposeMethod]() {
          lifecycle.push(['companion-dispose', this.targetConnected]);
        },
      };
      prepareApp(app);
      await app.close(closeOptions);
    }
  );
  return lifecycle;
}

/**
 * Register one production application's user hooks against a recording `Hooks` and an admin store
 * recording `storeMethods`; the production code optional-calls anything absent from that list.
 *
 * @returns {Promise<{handlersFor: Function, drainCalls: Function}>} `handlersFor(hook)` answers
 * every handler registered for that hook; `drainCalls()` returns and clears the recorded calls.
 */
export async function captureUserHookHandlers({ modulePath, exportName, storeMethods }) {
  const registrations = [];
  const calls = [];

  await withProductionApplication(
    {
      modulePath,
      exportName,
      ApplicationV2: class {},
      hooks: {
        on: (hook, handler) => registrations.push([hook, handler]),
        off: () => {},
        once: () => 1,
      },
    },
    (app) => {
      app._adminStore = Object.fromEntries(
        storeMethods.map((name) => [name, () => calls.push(name)])
      );
      app._registerUserHooks();
    }
  );

  return {
    handlersFor: (hook) =>
      registrations.filter(([name]) => name === hook).map(([, handler]) => handler),
    drainCalls: () => {
      const drained = [...calls];
      calls.length = 0;
      return drained;
    },
  };
}
