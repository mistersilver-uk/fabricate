/**
 * The two boots the companion-extension composition suites run under.
 *
 * Both the Manager seam's composition suite and the player seam's need the same two things:
 * a real Vite server that can evaluate the production entry module, and an ApplicationV2
 * close-ordering fixture that records what happened in what order. Hand-inlining the pair a
 * second time is the exact near-identical block SonarCloud's new-code duplication gate counts
 * against `tests/**` just as it does against `src/`, so they live here once (issue 1198).
 *
 * THE TWO BOOTS ARE DELIBERATELY NOT UNIFIED. `withFabricateLifecycleReplay` runs middleware
 * mode with HMR disabled, a `/lang/en.json` fetch shim and a `CONFIG` stub, because it
 * evaluates `src/main.js` inside `buildLabWorld`'s Foundry host, which fetches during boot.
 * `captureCloseOrdering` runs middleware mode alone against hand-stubbed globals and no lab
 * world, because it evaluates one application module and must control every global that
 * module's class hierarchy reads. Collapsing them onto one option set would silently change
 * what the second runs under.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Boot the real entry module inside `buildLabWorld`'s Foundry host and hand the caller the
 * ACTUAL `init` and `ready` callbacks `src/main.js` registered.
 *
 * `buildLabWorld` is the smallest faithful Foundry host for evaluating the real entry module,
 * and its browser-side boot fetches `/lang/en.json`, which Node has no answer for — hence the
 * direct file response installed here rather than in each caller.
 *
 * @param {(context: {world: object, init: Function, ready: Function}) => Promise<void>} run
 *   Scenario body. Its own cleanup belongs in its own `finally`; this helper restores only the
 *   globals and the server it created.
 * @returns {Promise<void>}
 */
export async function withFabricateLifecycleReplay(run) {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.CONFIG;
  let world = null;
  // NO FILE WATCHER. `root` is the repository, and a developer who has harvested Foundry chrome
  // for the View Lab has ~7,100 read-only art files under `.foundry-chrome/`. Vite watches what it
  // serves, chokidar costs one inotify handle per file, and a stock Linux box allows 65,536 for the
  // whole user session — so one harvest exhausts it and these suites die with
  // `ENOSPC ... watch '<something>.webp'` raised from inside chokidar, on tests about window
  // lifecycle that never touch art. Nothing is edited mid-run, so the watcher buys nothing.
  const vite = await createServer({
    root: repoRoot,
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });

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
    await vite.close();
  }
}

/**
 * Close one production application against a recording ApplicationV2 base and report the
 * ordered lifecycle.
 *
 * The recorded entries are a DEEP-EQUAL target on purpose: the whole point is the ORDER of
 * the companion disposal against `super.close()`, together with the fact that the mount target
 * was still connected when the disposal ran. Loosening the caller's assertion to an ordering
 * predicate would leave both suites green while proving strictly less.
 *
 * @param {object} options Scenario inputs.
 * @param {string} options.modulePath Vite-root-relative module to evaluate.
 * @param {string} options.exportName Application class export on that module.
 * @param {string} options.disposeMethod Svelte-root export the application must call first.
 * @param {(app: object) => void} [options.prepareApp] Per-application stubbing.
 * @param {object} [options.closeOptions] Options passed to `close()`.
 * @returns {Promise<Array>} `[['companion-dispose', targetConnected], ['application-close', options, targetConnected]]`
 *   in the order they actually happened.
 */
export async function captureCloseOrdering({
  modulePath,
  exportName,
  disposeMethod,
  prepareApp = () => {},
  closeOptions = { force: true },
}) {
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

  // NO FILE WATCHER. `root` is the repository, and a developer who has harvested Foundry chrome
  // for the View Lab has ~7,100 read-only art files under `.foundry-chrome/`. Vite watches what it
  // serves, chokidar costs one inotify handle per file, and a stock Linux box allows 65,536 for the
  // whole user session — so one harvest exhausts it and these suites die with
  // `ENOSPC ... watch '<something>.webp'` raised from inside chokidar, on tests about window
  // lifecycle that never touch art. Nothing is edited mid-run, so the watcher buys nothing.
  const vite = await createServer({
    root: repoRoot,
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  try {
    const module = await vite.ssrLoadModule(modulePath);
    const ApplicationClass = module[exportName];
    assert.equal(
      typeof ApplicationClass,
      'function',
      `${modulePath} should export ${exportName}`
    );
    const app = new ApplicationClass();
    app._svelteComponent = {
      targetConnected: true,
      [disposeMethod]() {
        lifecycle.push(['companion-dispose', this.targetConnected]);
      },
    };
    prepareApp(app);

    await app.close(closeOptions);
  } finally {
    await vite.close();
    globalThis.foundry = originalFoundry;
    globalThis.Hooks = originalHooks;
    globalThis.game = originalGame;
  }
  return lifecycle;
}
