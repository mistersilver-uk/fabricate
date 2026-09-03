/**
 * Regression — the Crafting System Manager must not stall on "still loading" after
 * a missed `init` hook, and its deferred-open gate must be replay-safe.
 *
 * Real-world failure (Vite dev, esp. with DevTools open): the source module evaluated
 * AFTER Foundry's `init` event, so the `init` hook callback — the ONLY place that set
 * `game.fabricate` — never ran. The `ready` hook still ran, logged "Fabricate | Ready"
 * and fired the one-shot `fabricate.ready` Hook. By the time the GM clicked the
 * manager button, `game.fabricate` was undefined AND the readiness Hook was spent, so
 * `show()` warned, latched `_pendingReadyOpen`, and every later click repeated the
 * warning forever.
 *
 * Two fixes, pinned here:
 *  1. `main.js` binds the global from BOTH `init` and `ready` (idempotent helper), so
 *     a missed `init` can no longer leave `game.fabricate` undefined.
 *  2. `show()` prefers the replay-safe `whenReady()` promise (resolves even if startup
 *     already finished) and clears the latch + re-checks readiness before opening, so
 *     a spent/early/stale signal can never permanently latch the gate.
 *
 * The real classes extend `SvelteApplicationMixin(ApplicationV2)` / import `.svelte`
 * roots, so they cannot be `new`'d under `node:test`. As with the sibling
 * `interactable-browser-app-show` suite, this pins the contract two ways: a faithful
 * re-implementation harness driven by a fake, plus source-drift guards on the shipped
 * code.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/SvelteCraftingSystemManagerApp.svelte.js'),
  'utf8'
);
const mainSource = readFileSync(resolve(__dirname, '../../src/main.js'), 'utf8');

/**
 * A faithful harness mirroring the static `show()` deferred-open decision: a fake
 * `game.fabricate` whose readiness flag and `whenReady()` promise can be flipped
 * independently (so we can model the "promise resolved but not yet ready" stale
 * signal), and a fake app that counts constructs/renders.
 */
function makeHarness({ readyAtStart = false } = {}) {
  let constructs = 0;
  let resolveReady;
  const readyPromise = new Promise((r) => { resolveReady = r; });
  const state = { ready: readyAtStart, gm: true };
  if (readyAtStart) resolveReady();

  const fabricate = {
    get ready() { return state.ready; },
    getRecipeManager: () => ({ initialized: state.ready }),
    getCraftingSystemManager: () => ({ initialized: state.ready }),
    whenReady: () => readyPromise
  };

  class FakeApp {
    constructor() { constructs += 1; this.rendered = false; }
    render() { this.rendered = true; return this; }

    static _pendingReadyOpen = false;
    static warnings = 0;
    static opened = null;

    static _isFabricateReady() {
      return fabricate.ready === true
        && fabricate.getRecipeManager()?.initialized === true
        && fabricate.getCraftingSystemManager()?.initialized === true;
    }

    // Faithful copy of the shipped deferred-open decision.
    static show() {
      if (!state.gm) return null;

      if (!FakeApp._isFabricateReady()) {
        FakeApp.warnings += 1;
        if (!FakeApp._pendingReadyOpen) {
          FakeApp._pendingReadyOpen = true;
          const openWhenReady = () => {
            FakeApp._pendingReadyOpen = false;
            if (!state.gm) return;
            if (!FakeApp._isFabricateReady()) return;
            const app = new FakeApp();
            app.render(true);
            FakeApp.opened = app;
          };
          const whenReady = fabricate?.whenReady;
          if (typeof whenReady === 'function') {
            Promise.resolve(whenReady.call(fabricate))
              .then(openWhenReady)
              .catch(() => { FakeApp._pendingReadyOpen = false; });
          }
        }
        return null;
      }

      const app = new FakeApp();
      app.render(true);
      FakeApp.opened = app;
      return app;
    }
  }

  return {
    FakeApp,
    constructs: () => constructs,
    // Startup completes: flip readiness AND settle the promise (the real `initialize`).
    becomeReady: () => { state.ready = true; resolveReady(); },
    // Settle the promise WITHOUT readiness — models a stale/early signal.
    settlePromiseOnly: () => resolveReady()
  };
}

test('deferred open fires once Fabricate finishes startup (whenReady resolves)', async () => {
  const h = makeHarness({ readyAtStart: false });

  assert.equal(h.FakeApp.show(), null, 'unready launch defers instead of opening');
  assert.equal(h.FakeApp.warnings, 1, 'the GM is warned once');
  assert.equal(h.FakeApp._pendingReadyOpen, true, 'a single deferred open is armed');
  assert.equal(h.constructs(), 0, 'no window is constructed while unready');

  h.becomeReady();
  await h.FakeApp.whenReady?.();
  await Promise.resolve(); // let the .then microtask run

  assert.equal(h.constructs(), 1, 'the window opens exactly once startup completes');
  assert.equal(h.FakeApp.opened?.rendered, true, 'the deferred window rendered');
  assert.equal(h.FakeApp._pendingReadyOpen, false, 'the latch is cleared after opening');
});

test('a launch when startup already finished opens immediately (replay-safe)', () => {
  // The spent-Hook scenario: by click time, readiness is already true. The old
  // one-shot Hook would never fire again; the direct readiness check opens now.
  const h = makeHarness({ readyAtStart: true });

  const app = h.FakeApp.show();
  assert.ok(app, 'an already-ready launch returns a window');
  assert.equal(h.constructs(), 1, 'exactly one window is constructed');
  assert.equal(app.rendered, true, 'the window rendered immediately');
  assert.equal(h.FakeApp.warnings, 0, 'no "still loading" warning when already ready');
});

test('a stale/early readiness signal re-arms the gate instead of latching forever', async () => {
  const h = makeHarness({ readyAtStart: false });

  assert.equal(h.FakeApp.show(), null);
  assert.equal(h.FakeApp._pendingReadyOpen, true);

  // Promise settles but readiness is still false (a stale signal). openWhenReady must
  // clear the latch and decline to open — NOT construct a half-ready window.
  h.settlePromiseOnly();
  await Promise.resolve();

  assert.equal(h.constructs(), 0, 'no window opens on a not-actually-ready signal');
  assert.equal(h.FakeApp._pendingReadyOpen, false, 'the latch re-arms (no permanent stall)');

  // A later click can therefore defer again rather than be stuck warning forever.
  assert.equal(h.FakeApp.show(), null);
  assert.equal(h.FakeApp.warnings, 2, 'the second launch warns and re-arms');
  assert.equal(h.FakeApp._pendingReadyOpen, true, 'the gate is armable again');
});

test('the shipped show() prefers the replay-safe whenReady() promise (guards drift)', () => {
  assert.ok(
    appSource.includes('game?.fabricate?.whenReady'),
    'show() should consult the replay-safe readiness promise'
  );
  // The Hook remains only as a fallback (also asserted by the manager contract suite).
  assert.ok(
    appSource.includes("hooks.once('fabricate.ready', openWhenReady)"),
    'the one-shot Hook is retained as a fallback'
  );
});

test('the shipped openWhenReady clears the latch and re-checks readiness before opening (guards drift)', () => {
  // The latch is cleared BEFORE the readiness re-check, so a stale signal re-arms it.
  assert.match(
    appSource,
    /SvelteCraftingSystemManagerApp\._pendingReadyOpen = false;[\s\S]*?if \(!game\.user\?\.isGM\) return;[\s\S]*?if \(!SvelteCraftingSystemManagerApp\._isFabricateReady\(\)\) return;/,
    'openWhenReady clears the latch, then re-checks GM + readiness before opening'
  );
});

test('main.js binds game.fabricate from BOTH init and ready via an idempotent helper (guards drift)', () => {
  assert.ok(
    mainSource.includes('function bindFabricateGlobal('),
    'the global binding is extracted into a reusable helper'
  );
  // The ready hook must re-bind before initialize(), the backstop for a missed init.
  assert.match(
    mainSource,
    /Hooks\.once\('ready', async \(\) => \{[\s\S]*?bindFabricateGlobal\(\);[\s\S]*?await fabricate\.initialize\(\);/,
    'the ready hook re-binds the global before initialize()'
  );
});

test('initialize() resolves the replay-safe readiness promise (guards drift)', () => {
  assert.match(
    mainSource,
    /this\.ready = true;\s*\n\s*this\._resolveReady\?\.\(\);/,
    'completing startup settles the whenReady() promise'
  );
  assert.ok(
    mainSource.includes('whenReady()'),
    'the Fabricate API exposes a whenReady() readiness method'
  );
});
