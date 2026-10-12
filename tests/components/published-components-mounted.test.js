/**
 * The published component seam on Fabricate's real Svelte runtime (issue 2426), drawing the
 * test-only probe into bare companion-owned targets: replace-not-merge on one root node, the
 * microtask timing, three fault paths, destroy on a removed target and ancestor independence.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { PROBE_ENTRY } from '../fixtures/published-components/probeEntry.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PROBE = 'tests/fixtures/published-components/PublishedProbe.svelte';
const ADAPTER = 'src/ui/publishedComponents.svelte.js';
const SEAM = 'src/ui/publishedComponentSeam.js';
const FAULT_REPORT = 'Fabricate | Published component render failed:';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-published-components-',
  rawModules: [SEAM, 'src/ui/publishedComponentManifest.js'],
  runeModules: [ADAPTER],
  compiledModules: ['src/ui/svelte/published/PublishedComponentHost.svelte', PROBE],
  componentPath: PROBE,
});

let runtime;
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
  ({ publishedComponentRuntime: runtime } = await harness.loadRuneModule(ADAPTER));
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
    assert.equal(textOf(target), 'B');
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
    assert.equal(target.closest('.fabricate, .fabricate-app, .fabricate-manager'), null);
    const hidden = getComputedStyle(target.querySelector('.probe-hidden'));
    assert.equal(hidden.position, 'absolute');
    assert.equal(hidden.overflow, 'hidden');
    assert.equal(hidden.width, '1px');
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
      await settle();
      if (update) {
        assert.equal(handle.update(update), true);
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
    assert.equal(handle.update({}), false);
    assert.equal(target.childNodes.length, 0, 'unmounted inside the flush that delivered it');
    await settle();
    assert.deepEqual(escaped, []);
    assert.equal(target.childNodes.length, 0);
    assert.equal(instance.liveMountCount(), 0);
  });

  it("reaches console.error through the adapter's default report", async () => {
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
