/**
 * The published component seam on Fabricate's real Svelte runtime (issue 2426), drawing the
 * test-only probe into bare companion-owned targets: replace-not-merge on one root node, the
 * microtask timing, the target claim, three fault paths, destroy on a removed target, ancestor
 * independence, and a companion's own reactive contexts.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import { PROBE_ENTRY } from '../fixtures/published-components/probeEntry.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PROBE = 'tests/fixtures/published-components/PublishedProbe.svelte';
const ADAPTER = 'src/ui/publishedComponents.svelte.js';
const SEAM = 'src/ui/publishedComponentSeam.js';
const COMPANION = 'tests/fixtures/published-components/companionReactivity.svelte.js';
const MANIFEST_PATHS = PUBLISHED_COMPONENT_MANIFEST.map((entry) => entry.path);
const FAULT_REPORT = 'Fabricate | Published component render failed:';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-published-components-',
  rawModules: [SEAM, 'src/ui/publishedComponentManifest.js'],
  runeModules: [ADAPTER, COMPANION],
  compiledModules: [
    'src/ui/svelte/published/PublishedComponentHost.svelte',
    PROBE,
    ...MANIFEST_PATHS,
  ],
  componentPath: PROBE,
});

let runtime;
let adapterComponents;
let companion;
let createPublishedComponents;
let probe;
let reports;
let escaped;
let targets;
const recordEscape = (error) => {
  escaped.push(error);
};

// Past Svelte's flush and the boundary's `onerror` microtask, and the deferred unmount after it.
const settle = () => new Promise((done) => setTimeout(done, 0));

function companionTarget() {
  const shell = document.createElement('section');
  shell.className = 'companion-sheet';
  const target = document.createElement('div');
  shell.append(target);
  document.body.append(shell);
  targets.push(shell);
  return target;
}

function seam(options = {}) {
  return createPublishedComponents({
    table: [{ ...PROBE_ENTRY, component: probe.default }],
    ...runtime,
    isReady: () => true,
    report: (...args) => {
      reports.push(args);
    },
    ...options,
  });
}

const textOf = (target) => target.querySelector('.probe-text')?.textContent;

before(async () => {
  await harness.setup();
  ({ publishedComponentRuntime: runtime, COMPONENTS: adapterComponents } =
    await harness.loadRuneModule(ADAPTER));
  companion = await harness.loadRuneModule(COMPANION);
  ({ createPublishedComponents } = await harness.loadRawModule(SEAM));
  probe = await harness.loadRuneModule(PROBE);
});

after(() => harness.teardown());

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
});

describe('a published component on the real runtime', () => {
  it('returns with the DOM in place and resets an omitted prop to its default on one root', async () => {
    const ui = seam().publicApi;
    const target = companionTarget();
    const handle = ui.mount('PublishedProbe', { target, props: { text: 'Hello' } });
    assert.equal(textOf(target), 'Hello', 'the DOM is in place when mount returns');
    await settle();
    const root = target.querySelector('.probe');
    assert.equal(handle.update({}), true);
    await settle();
    assert.equal(textOf(target), 'DEFAULT');
    assert.ok(target.querySelector('.probe') === root, 'the same root node, so nothing remounted');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('shows an applied update after the next microtask flush, or at once under flushSync', async () => {
    const ui = seam().publicApi;
    const target = companionTarget();
    const handle = ui.mount('PublishedProbe', { target, props: { text: 'A' } });
    await settle();
    assert.equal(handle.update({ text: 'B' }), true);
    assert.equal(textOf(target), 'A', 'the seam never flushes synchronously');
    await Promise.resolve();
    assert.equal(textOf(target), 'B', "applied by Svelte's microtask batch flush");
    handle.update({ text: 'C' });
    flushSync();
    assert.equal(textOf(target), 'C');
    handle.destroy();
  });

  it('spreads data attributes onto the root', async () => {
    const ui = seam().publicApi;
    const target = companionTarget();
    const handle = ui.mount('PublishedProbe', { target, props: { 'data-rank': 2 } });
    assert.equal(target.querySelector('.probe').getAttribute('data-rank'), '2');
    handle.destroy();
  });

  it('destroys cleanly after the companion removed the target', async () => {
    const instance = seam();
    const target = companionTarget();
    const handle = instance.publicApi.mount('PublishedProbe', { target, props: {} });
    await settle();
    target.remove();
    handle.destroy();
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    assert.equal(instance.liveMountCount(), 0);
    assert.equal(handle.update({}), false);
  });

  it('clips its hidden text from its own stylesheet under a bare ancestor', async () => {
    const ui = seam().publicApi;
    const target = companionTarget();
    const handle = ui.mount('PublishedProbe', { target, props: {} });
    await settle();
    assert.ok(!target.closest('.fabricate, .fabricate-app, .fabricate-manager'), 'no app root');
    assert.equal(getComputedStyle(target.querySelector('.probe')).position, 'relative');
    const hidden = getComputedStyle(target.querySelector('.probe-hidden'));
    assert.equal(hidden.position, 'absolute');
    assert.equal(hidden.overflow, 'hidden');
    assert.equal(hidden.width, '1px');
    assert.equal(hidden.height, '1px');
    assert.equal(hidden.clipPath, 'inset(50%)');
    handle.destroy();
  });

  it('resolves a token from :root[data-fabricate-theme] over its own fallback', async () => {
    const root = document.documentElement;
    const theme = document.createElement('style');
    theme.textContent = ':root[data-fabricate-theme] { --fab-font-serif: ProbeFace; }';
    document.head.append(theme);
    root.setAttribute('data-fabricate-theme', 'probe');
    try {
      const ui = seam().publicApi;
      const target = companionTarget();
      const handle = ui.mount('PublishedProbe', { target, props: {} });
      await settle();
      assert.equal(getComputedStyle(target.querySelector('.probe')).fontFamily, 'ProbeFace');
      handle.destroy();
    } finally {
      root.removeAttribute('data-fabricate-theme');
      theme.remove();
    }
  });
});

describe('the adapter', () => {
  it("binds exactly the manifest paths, each to that path's own component", async () => {
    assert.ok(Object.isFrozen(adapterComponents));
    assert.deepEqual(Object.keys(adapterComponents), MANIFEST_PATHS);
    for (const path of MANIFEST_PATHS) {
      const { default: component } = await harness.loadRuneModule(path);
      assert.ok(adapterComponents[path] === component, `${path} is bound to its own default`);
    }
  });
});

describe('a target claim on the real runtime', () => {
  it('M5: refuses a second mount into a live target and leaves the first intact', async () => {
    const ui = seam().publicApi;
    const target = companionTarget();
    const first = ui.mount('PublishedProbe', { target, props: { text: 'First' } });
    await settle();
    assert.throws(
      () => ui.mount('PublishedProbe', { target, props: {} }),
      /^TypeError: Fabricate \| published components: target already holds a published component$/
    );
    assert.equal(textOf(target), 'First');
    assert.equal(first.update({ text: 'Still' }), true);
    await settle();
    assert.equal(textOf(target), 'Still');
    first.destroy();
  });

  it('M5: holds the claim while the leading node toggles, by a stable anchor', async () => {
    const ui = seam().publicApi;
    const target = companionTarget();
    const handle = ui.mount('PublishedProbe', { target, props: { leading: true } });
    await settle();
    const leading = target.querySelector('.probe-leading');
    assert.ok(Boolean(leading), 'the toggling node renders before the probe');
    handle.update({ leading: false });
    await settle();
    assert.ok(!target.contains(leading), 'the leading node left the target');
    assert.throws(
      () => ui.mount('PublishedProbe', { target, props: {} }),
      /target already holds a published component$/
    );
    assert.equal(handle.update({ text: 'Live' }), true);
    handle.destroy();
  });

  it('supersedes a mount whose DOM the companion cleared without destroying it', async () => {
    const instance = seam();
    const target = companionTarget();
    const stale = instance.publicApi.mount('PublishedProbe', { target, props: { text: 'Old' } });
    await settle();
    target.replaceChildren();
    const fresh = instance.publicApi.mount('PublishedProbe', { target, props: { text: 'New' } });
    assert.equal(stale.update({}), false, 'the stale mount was destroyed first');
    assert.equal(textOf(target), 'New');
    assert.equal(instance.liveMountCount(), 1);
    fresh.destroy();
  });
});

describe("a companion's own reactive context", () => {
  it('mounts from inside an $effect without that effect tracking the mount', () => {
    const ui = seam().publicApi;
    const target = companionTarget();
    const effect = companion.runInsideEffect(
      () => ui.mount('PublishedProbe', { target, props: { text: 'Inside' } }),
      flushSync
    );
    const [handle] = effect.runs;
    assert.equal(textOf(target), 'Inside');
    assert.equal(handle.update({ text: 'Updated' }), true);
    flushSync();
    assert.equal(textOf(target), 'Updated');
    assert.equal(effect.runs.length, 1, "the probe's state is no dependency of the effect");
    effect.dispose();
    handle.destroy();
  });

  it("updates from inside a $derived without Svelte's state_unsafe_mutation", () => {
    const ui = seam().publicApi;
    const target = companionTarget();
    const handle = companion.runInsideDerived(() =>
      ui.mount('PublishedProbe', { target, props: { text: 'Derived' } })
    );
    assert.equal(textOf(target), 'Derived');
    const accepted = companion.runInsideDerived(() => handle.update({ text: 'Again' }));
    assert.equal(accepted, true, "the host's setProps writes its cell under untrack");
    flushSync();
    assert.equal(textOf(target), 'Again');
    handle.destroy();
  });
});

describe('a published component that faults', () => {
  before(() => process.on('uncaughtException', recordEscape));
  after(() => process.off('uncaughtException', recordEscape));

  const FAULTS = [
    ['init', { throwAt: 'init' }, null],
    ['effect', { throwAt: 'effect' }, null],
    ['explode', {}, { explode: true }],
  ];
  for (const [fault, props, update] of FAULTS) {
    it(`contains a fault at ${fault}: reported once, target emptied, handle inert`, async () => {
      const instance = seam();
      const siblingTarget = companionTarget();
      const sibling = instance.publicApi.mount('PublishedProbe', {
        target: siblingTarget,
        props: { text: 'Sibling' },
      });
      const target = companionTarget();
      const handle = instance.publicApi.mount('PublishedProbe', { target, props });
      assert.equal(
        reports.length,
        0,
        'not the synchronous mount catch: the boundary reports later'
      );
      await settle();
      if (update) {
        assert.equal(handle.update(update), true);
        assert.equal(reports.length, 0, 'the boundary reports after the update returns');
        await settle();
      }
      assert.deepEqual(escaped, [], 'nothing escapes the boundary');
      assert.equal(reports.length, 1);
      assert.deepEqual(reports[0], [FAULT_REPORT, 'PublishedProbe', probe.PROBE_FAULTS[fault]]);
      assert.ok(reports[0][2] === probe.PROBE_FAULTS[fault], "the probe's own Error");
      assert.equal(target.childNodes.length, 0);
      assert.equal(handle.update({}), false);
      assert.equal(handle.update({ text: 'Again' }), false);
      assert.equal(sibling.update({ text: 'Sibling still' }), true);
      await settle();
      assert.equal(textOf(siblingTarget), 'Sibling still');
      assert.equal(instance.liveMountCount(), 1);
      const again = instance.publicApi.mount('PublishedProbe', { target, props: {} });
      assert.equal(textOf(target), 'DEFAULT', 'the emptied target mounts again');
      again.destroy();
      sibling.destroy();
    });
  }

  it('contains a fault Svelte delivers inside flushSync', async () => {
    const instance = seam();
    const target = companionTarget();
    const handle = instance.publicApi.mount('PublishedProbe', { target, props: {} });
    await settle();
    handle.update({ explode: true });
    flushSync();
    assert.deepEqual(escaped, []);
    assert.deepEqual(reports, [[FAULT_REPORT, 'PublishedProbe', probe.PROBE_FAULTS.explode]]);
    assert.equal(handle.update({}), false, "the boundary's onerror retired it inside flushSync");
    assert.equal(target.childNodes.length, 0, 'unmounted inside the flush that delivered it');
    await settle();
    assert.deepEqual(escaped, []);
    assert.equal(target.childNodes.length, 0);
    assert.equal(instance.liveMountCount(), 0);
  });

  it("reaches console.error through the seam's default reportToConsole", async () => {
    const original = console.error;
    const calls = [];
    console.error = (...args) => {
      calls.push(args);
    };
    try {
      const ui = seam({ report: undefined }).publicApi;
      ui.mount('PublishedProbe', { target: companionTarget(), props: { throwAt: 'init' } });
      await settle();
    } finally {
      console.error = original;
    }
    const faults = calls.filter(([first]) => first === FAULT_REPORT);
    assert.deepEqual(faults, [[FAULT_REPORT, 'PublishedProbe', probe.PROBE_FAULTS.init]]);
  });
});
