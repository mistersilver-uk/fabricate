/**
 * Fix 2 — `InteractableBrowserApp.show()` re-entrancy coalescing.
 *
 * The V13 scene-control button fires the launch handler 2–3× per activation, so
 * concurrent `show()` calls can arrive while the first render is still in flight.
 * Guarding only on `rendered` constructed a SECOND app instance whose render
 * collided with the first in ApplicationV2 `_updatePosition` ("el.parentElement
 * is null"). `show()` must coalesce concurrent calls onto a SINGLE window.
 *
 * The real class extends `SvelteApplicationMixin(ApplicationV2)` and imports a
 * `.svelte` root, so it cannot be `new`'d under `node:test`. This suite pins the
 * BEHAVIORAL CONTRACT two ways:
 *  1. A faithful re-implementation of the static `show()` (the same coalescing
 *     decision) driven by a fake app with an async render — asserting two
 *     back-to-back calls construct exactly ONE instance and resolve to it.
 *  2. A source guard that the shipped `show()` actually carries the coalescing
 *     shape (no second `new` once an instance exists; an in-flight render is
 *     awaited), so the contract test cannot silently drift from the real code.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/InteractableBrowserApp.svelte.js'),
  'utf8'
);

/**
 * A minimal harness mirroring the static `show()` contract of
 * `InteractableBrowserApp`: a single shared `_instance`, an in-flight
 * `_renderPromise`, and a fake app whose `render()` resolves on the next turn.
 * `constructs` counts how many app instances are created.
 */
function makeHarness({ renderShouldReject = false } = {}) {
  let constructs = 0;

  class FakeApp {
    constructor() {
      constructs += 1;
      this.rendered = false;
      this.broughtToFront = 0;
      // Per-instance toggle so a test can make ONLY the first render reject and
      // prove the next show() recovers with a fresh, successfully-rendered app.
      this.renderShouldReject = renderShouldReject;
    }
    bringToFront() { this.broughtToFront += 1; }
    async render() {
      // Resolve asynchronously so a concurrent show() sees an unfinished render.
      await Promise.resolve();
      if (this.renderShouldReject) throw new Error('render failed');
      this.rendered = true;
      return this;
    }

    static _instance = null;
    static _renderPromise = null;

    // Faithful copy of the shipped coalescing + reject-recovery decision.
    static async show() {
      const existing = FakeApp._instance;
      if (existing) {
        if (existing.rendered) existing.bringToFront();
        else if (FakeApp._renderPromise) await FakeApp._renderPromise;
        return existing;
      }
      const app = new FakeApp();
      FakeApp._instance = app;
      const renderPromise = Promise.resolve(app.render(true));
      FakeApp._renderPromise = renderPromise;
      try {
        await renderPromise;
      } catch (err) {
        if (FakeApp._instance === app) FakeApp._instance = null;
        if (FakeApp._renderPromise === renderPromise) FakeApp._renderPromise = null;
        throw err;
      } finally {
        if (FakeApp._renderPromise === renderPromise) FakeApp._renderPromise = null;
      }
      return app;
    }
  }

  return { FakeApp, constructs: () => constructs };
}

test('two back-to-back show() calls coalesce to a SINGLE instance (no second construct)', async () => {
  const { FakeApp, constructs } = makeHarness();

  // Fire both synchronously, BEFORE the first render resolves — the crash repro.
  const [first, second] = await Promise.all([FakeApp.show(), FakeApp.show()]);

  assert.equal(constructs(), 1, 'only one app instance is ever constructed');
  assert.equal(first, second, 'both calls resolve to the same window');
  assert.equal(FakeApp._instance, first, 'the singleton is the coalesced instance');
  assert.equal(first.rendered, true, 'the single window finished rendering');
});

test('a later show() after the window is rendered re-focuses (does not construct again)', async () => {
  const { FakeApp, constructs } = makeHarness();

  const app = await FakeApp.show();
  assert.equal(constructs(), 1);

  const again = await FakeApp.show();
  assert.equal(again, app, 'a re-show returns the same window');
  assert.equal(constructs(), 1, 'no second construct for an already-rendered window');
  assert.equal(app.broughtToFront, 1, 'the existing window is brought to front');
});

test('after close (instance cleared) a fresh show() constructs a new window', async () => {
  const { FakeApp, constructs } = makeHarness();

  const first = await FakeApp.show();
  // Simulate close()/_onClose() clearing the singleton.
  FakeApp._instance = null;

  const second = await FakeApp.show();
  assert.notEqual(second, first, 'a new window opens once the prior was closed');
  assert.equal(constructs(), 2, 'exactly two constructs across an open → close → open cycle');
});

test('a show() whose render REJECTS clears _instance and _renderPromise (no stuck-closed window)', async () => {
  const { FakeApp, constructs } = makeHarness({ renderShouldReject: true });

  await assert.rejects(() => FakeApp.show(), /render failed/);

  assert.equal(FakeApp._instance, null, 'a failed render clears the dead _instance');
  assert.equal(FakeApp._renderPromise, null, 'a failed render clears the tracked render promise');
  assert.equal(constructs(), 1, 'one (failed) construct');
});

test('after a render rejection a later successful show() constructs and renders a new instance', async () => {
  // Drive both attempts through ONE class whose render rejects only the first time.
  let constructs = 0;

  class RecoverApp {
    constructor() {
      constructs += 1;
      this.rendered = false;
      this.broughtToFront = 0;
    }
    bringToFront() { this.broughtToFront += 1; }
    async render() {
      await Promise.resolve();
      if (RecoverApp._failNext) {
        RecoverApp._failNext = false;
        throw new Error('render failed');
      }
      this.rendered = true;
      return this;
    }

    static _instance = null;
    static _renderPromise = null;
    static _failNext = true;

    static async show() {
      const existing = RecoverApp._instance;
      if (existing) {
        if (existing.rendered) existing.bringToFront();
        else if (RecoverApp._renderPromise) await RecoverApp._renderPromise;
        return existing;
      }
      const app = new RecoverApp();
      RecoverApp._instance = app;
      const renderPromise = Promise.resolve(app.render(true));
      RecoverApp._renderPromise = renderPromise;
      try {
        await renderPromise;
      } catch (err) {
        if (RecoverApp._instance === app) RecoverApp._instance = null;
        if (RecoverApp._renderPromise === renderPromise) RecoverApp._renderPromise = null;
        throw err;
      } finally {
        if (RecoverApp._renderPromise === renderPromise) RecoverApp._renderPromise = null;
      }
      return app;
    }
  }

  // First show() rejects and clears the singleton.
  await assert.rejects(() => RecoverApp.show(), /render failed/);
  assert.equal(RecoverApp._instance, null, 'failed render left no live instance');
  assert.equal(constructs, 1, 'one failed construct');

  // The NEXT show() must build a NEW instance and render it (recovery, not a
  // dead-instance reuse).
  const recovered = await RecoverApp.show();
  assert.equal(constructs, 2, 'a fresh instance is constructed after the failure');
  assert.equal(RecoverApp._instance, recovered, 'the new instance becomes the singleton');
  assert.equal(recovered.rendered, true, 'the recovery window finished rendering');
});

test('the shipped show() recovers _instance on a render rejection (guards against drift)', () => {
  // A catch clears the dead instance so a later show() can re-render.
  assert.match(
    appSource,
    /catch[\s\S]*?if \(InteractableBrowserApp\._instance === app\) \{\s*\n\s*InteractableBrowserApp\._instance = null;/,
    'a render rejection nulls _instance when it still points at the failed app'
  );
  assert.ok(
    appSource.includes('throw err;'),
    'the render rejection is rethrown (existing reject contract preserved)'
  );
});

test('the shipped show() carries the coalescing shape (guards against drift)', () => {
  // Tracks the in-flight render so concurrent calls can await it.
  assert.match(appSource, /static\s+_renderPromise\s*=\s*null/, 'an in-flight render promise is tracked');
  // Returns the existing instance whenever one exists (not only when rendered).
  assert.match(appSource, /const existing = InteractableBrowserApp\._instance;\s*\n\s*if \(existing\) \{/, 'show() returns early on ANY existing instance');
  // An unfinished render is awaited rather than ignored.
  assert.ok(appSource.includes('await InteractableBrowserApp._renderPromise'), 'an in-flight render is awaited');
  // The single `new` only happens after the existing-instance early return.
  const newIdx = appSource.indexOf('new InteractableBrowserApp()');
  const guardIdx = appSource.indexOf('if (existing) {');
  assert.ok(newIdx > guardIdx, 'the only construct sits after the existing-instance guard');
});
