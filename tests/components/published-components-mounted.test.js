/**
 * The published component seam on Fabricate's real Svelte runtime (issue 2426), drawing the
 * test-only probe into bare companion-owned targets: replace-not-merge on one root node, the
 * microtask timing, a `text` key's one element, the target claim, three fault paths and their
 * `onFault` notice, destroy on a removed target, ancestor independence, and a companion's own
 * reactive contexts; then the adapter's table and `TierTrack`.
 * The other shipped entries are `published-leaves-mounted.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import { PROBE_ENTRY } from '../fixtures/published-components/probeEntry.js';
import {
  FAULT_REPORT,
  PUBLISHED_ADAPTER as ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM as SEAM,
  assertClipped,
  companionTarget,
  recordEscapes,
  settle,
  shippedSeam,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PROBE = 'tests/fixtures/published-components/PublishedProbe.svelte';
const COMPANION = 'tests/fixtures/published-components/companionReactivity.svelte.js';
const MANIFEST_PATHS = PUBLISHED_COMPONENT_MANIFEST.map((entry) => entry.path);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-published-components-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: [...PUBLISHED_RUNE_MODULES, COMPANION],
  compiledModules: [...PUBLISHED_COMPILED_MODULES, PROBE],
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
const noteOf = (target) => target.querySelector('.probe-note');
const NOTE_FALLBACK = 'NO NOTE';

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
    const target = companionTarget(targets);
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
    const target = companionTarget(targets);
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
    const target = companionTarget(targets);
    const handle = ui.mount('PublishedProbe', { target, props: { 'data-rank': 2 } });
    assert.equal(target.querySelector('.probe').getAttribute('data-rank'), '2');
    handle.destroy();
  });

  it('destroys cleanly after the companion removed the target', async () => {
    const instance = seam();
    const target = companionTarget(targets);
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
    const target = companionTarget(targets);
    const handle = ui.mount('PublishedProbe', { target, props: {} });
    await settle();
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
    await underSheet(':root[data-fabricate-theme] { --fab-font-serif: ProbeFace; }', async () => {
      const ui = seam().publicApi;
      const target = companionTarget(targets);
      const handle = ui.mount('PublishedProbe', { target, props: {} });
      await settle();
      assert.equal(getComputedStyle(target.querySelector('.probe')).fontFamily, 'ProbeFace');
      handle.destroy();
    });
  });
});

describe('a text key on the real runtime', () => {
  it('draws the string in one attribute-free element, in place when mount returns', () => {
    const ui = seam().publicApi;
    const target = companionTarget(targets);
    const handle = ui.mount('PublishedProbe', { target, props: { note: '<b>Now</b>' } });
    const note = noteOf(target);
    assert.equal(note.children.length, 1, 'one element');
    const [span] = note.children;
    assert.equal(span.localName, 'span');
    assert.equal(span.attributes.length, 0, 'no class, attribute or style');
    assert.equal(span.textContent, '<b>Now</b>', 'the string is text, never markup');
    assert.equal(span.children.length, 0, 'no element was parsed out of it');
    assert.ok(!note.querySelector('b'), 'no <b>');
    handle.destroy();
  });

  it('draws a key first passed by update, keeps its element, and omits it when empty', async () => {
    const ui = seam().publicApi;
    const target = companionTarget(targets);
    const handle = ui.mount('PublishedProbe', { target, props: {} });
    const note = noteOf(target);
    const root = target.querySelector('.probe');
    assert.equal(note.textContent, NOTE_FALLBACK);
    assert.equal(note.children.length, 0, 'no element without a note');
    assert.equal(handle.update({ note: 'A' }), true);
    await settle();
    assert.equal(note.textContent, 'A', 'a key the mount never passed is drawn');
    assert.equal(note.children.length, 1);
    const [span] = note.children;
    assert.equal(span.attributes.length, 0);
    handle.update({ note: 'B' });
    await settle();
    assert.ok(note.children[0] === span, 'a new string is written into the same element');
    assert.equal(span.textContent, 'B');
    const textNode = span.firstChild;
    handle.update({ note: 'B', text: 'Moved' });
    await settle();
    assert.equal(textOf(target), 'Moved');
    assert.ok(span.firstChild === textNode, 'an unchanged string rewrites nothing');
    for (const props of [{ note: '' }, {}]) {
      handle.update(props);
      await settle();
      assert.equal(note.textContent, NOTE_FALLBACK, 'the fallback is back');
      assert.equal(note.children.length, 0, 'and the element is gone');
      handle.update({ note: 'C' });
      await settle();
      assert.equal(note.children.length, 1);
      assert.equal(note.children[0].textContent, 'C', 'drawn again with the current string');
    }
    assert.ok(target.querySelector('.probe') === root, 'the same root node, so nothing remounted');
    handle.destroy();
    assert.deepEqual(reports, []);
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

const TIER_LABELS = Object.freeze({
  ariaLabel: 'Standing with the Guild',
  currentLabel: 'You are here',
  reachedLabel: 'Reached',
  aheadLabel: 'Ahead',
});

const LADDER = Object.freeze(
  ['Revered', 'Honoured', 'Accepted', 'Wary', 'Hated'].map((name, index) => ({
    name,
    figure: String(20 - index * 10),
    notes: [`${name} note`],
  }))
);

const shipped = () =>
  shippedSeam({
    createPublishedComponents,
    runtime,
    components: adapterComponents,
    report: (...args) => {
      reports.push(args);
    },
  });

const tierProps = (props = {}) => ({ ...TIER_LABELS, tiers: LADDER, currentIndex: 2, ...props });
const tierStates = (target) =>
  [...target.querySelectorAll(':scope .fab-tier-track-list > li')].map(
    (li) =>
      li.getAttribute('aria-current') ?? li.querySelector('.fab-tier-track-hidden')?.textContent
  );

function mountTierTrack(props = {}) {
  const target = companionTarget(targets);
  return { target, handle: shipped().mount('TierTrack', { target, props: tierProps(props) }) };
}

describe('TierTrack through the seam', () => {
  it('mounts, and an update moves the current tier and its state text on one root', async () => {
    const { target, handle } = mountTierTrack();
    const root = target.querySelector('.fab-tier-track');
    assert.deepEqual(tierStates(target), ['Reached', 'Reached', 'step', 'Ahead', 'Ahead']);
    assert.equal(handle.update(tierProps({ currentIndex: 3 })), true);
    await settle();
    assert.ok(target.querySelector('.fab-tier-track') === root, 'the same root node');
    assert.deepEqual(tierStates(target), ['Reached', 'Reached', 'Reached', 'step', 'Ahead']);
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('passes an empty tier list, which draws a named list with no tier', () => {
    const { target, handle } = mountTierTrack({ tiers: [] });
    assert.equal(target.querySelector('ol').getAttribute('aria-label'), 'Standing with the Guild');
    assert.equal(target.querySelectorAll('li').length, 0);
    handle.destroy();
  });

  it('refuses class, which it declares but does not publish', () => {
    assert.throws(
      () =>
        shipped().mount('TierTrack', {
          target: companionTarget(targets),
          props: tierProps({ class: 'x' }),
        }),
      /^TypeError: Fabricate \| published components: "class" is not a data attribute$/
    );
  });

  for (const key of Object.keys(TIER_LABELS)) {
    for (const value of [undefined, '']) {
      it(`refuses ${value === '' ? 'an empty' : 'an absent'} ${key}`, () => {
        const props = tierProps();
        if (value === undefined) delete props[key];
        else props[key] = value;
        assert.throws(
          () => shipped().mount('TierTrack', { target: companionTarget(targets), props }),
          new RegExp(
            String.raw`^TypeError: Fabricate \| published components: TierTrack requires a non-empty "${key}"$`
          )
        );
      });
    }
  }

  it('renders through the page-session seam the adapter registered', async () => {
    const { publishedComponentSeam } = await harness.loadRawModule(SEAM);
    globalThis.game.fabricate = { ready: true };
    try {
      const target = companionTarget(targets);
      const handle = publishedComponentSeam.publicApi.mount('TierTrack', {
        target,
        props: tierProps(),
      });
      assert.equal(target.querySelectorAll(':scope .fab-tier-track-list > li').length, 5);
      handle.destroy();
    } finally {
      delete globalThis.game.fabricate;
    }
  });

  it('positions its root to contain its hidden text under a bare ancestor', async () => {
    const { target, handle } = mountTierTrack();
    await settle();
    assert.equal(getComputedStyle(target.querySelector('.fab-tier-track')).position, 'relative');
    handle.destroy();
  });

  it('clips the row layout’s current label and both state labels from its own stylesheet', async () => {
    const { target, handle } = mountTierTrack();
    await settle();
    const hidden = [...target.querySelectorAll('.fab-tier-track-hidden')];
    assert.deepEqual(
      hidden.map((element) => element.textContent),
      ['Reached', 'Reached', 'You are here', 'Ahead', 'Ahead']
    );
    for (const element of hidden) assertClipped(element, element.textContent);
    handle.destroy();
  });

  it('leaves the column layout’s current label visible', async () => {
    const { target, handle } = mountTierTrack({ layout: 'column' });
    await settle();
    const marker = target.querySelector('.fab-tier-track-marker');
    assert.equal(marker.textContent, 'You are here');
    const style = getComputedStyle(marker);
    assert.notEqual(style.position, 'absolute');
    assert.notEqual(style.clipPath, 'inset(50%)');
    handle.destroy();
  });

  it('resolves its figure face and its inks from :root[data-fabricate-theme]', async () => {
    const theme =
      ':root[data-fabricate-theme] { --fab-font-mono: ProbeMono; --fab-text-muted: rgb(1, 2, 3); --fab-text: rgb(4, 5, 6); }';
    await underSheet(theme, async () => {
      const { target, handle } = mountTierTrack({ layout: 'column' });
      await settle();
      const figure = getComputedStyle(target.querySelector('.fab-tier-track-figure'));
      assert.equal(figure.fontFamily, 'ProbeMono');
      assert.equal(figure.color, 'rgb(1, 2, 3)');
      const current = target.querySelector(':scope [aria-current="step"] .fab-tier-track-name');
      assert.equal(getComputedStyle(current).color, 'rgb(4, 5, 6)');
      handle.destroy();
    });
  });
});

describe('a target claim on the real runtime', () => {
  it('M5: refuses a second mount into a live target and leaves the first intact', async () => {
    const ui = seam().publicApi;
    const target = companionTarget(targets);
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
    const target = companionTarget(targets);
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
    const target = companionTarget(targets);
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
    const target = companionTarget(targets);
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
    const target = companionTarget(targets);
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
  let stopRecording;
  before(() => {
    stopRecording = recordEscapes(recordEscape);
  });
  after(() => stopRecording());

  const FAULTS = [
    ['init', { throwAt: 'init' }, null],
    ['effect', { throwAt: 'effect' }, null],
    ['explode', {}, { explode: true }],
  ];
  for (const [fault, props, update] of FAULTS) {
    it(`contains a fault at ${fault}: reported once, target emptied, handle inert`, async () => {
      const instance = seam();
      const siblingTarget = companionTarget(targets);
      const sibling = instance.publicApi.mount('PublishedProbe', {
        target: siblingTarget,
        props: { text: 'Sibling' },
      });
      const target = companionTarget(targets);
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

  for (const [fault, props, update] of FAULTS) {
    it(`tells onFault of a fault at ${fault} once, with the target empty and free`, async () => {
      const instance = seam();
      const target = companionTarget(targets);
      const seen = [];
      const mounted = {};
      const onFault = (error) => {
        seen.push({ error, children: target.childNodes.length, update: mounted.handle.update({}) });
        mounted.again = instance.publicApi.mount('PublishedProbe', {
          target,
          props: { text: 'Fallback' },
        });
      };
      mounted.handle = instance.publicApi.mount('PublishedProbe', { target, props, onFault });
      assert.equal(seen.length, 0, 'never inside mount');
      await settle();
      if (update) {
        assert.equal(mounted.handle.update(update), true);
        assert.equal(seen.length, 0, 'never inside update');
        await settle();
      }
      assert.equal(seen.length, 1, 'told once');
      assert.ok(seen[0].error === probe.PROBE_FAULTS[fault], "the probe's own Error");
      assert.equal(seen[0].children, 0, 'the target was already empty');
      assert.equal(seen[0].update, false, 'the handle was already inert');
      assert.equal(textOf(target), 'Fallback', 'a mount from inside it took the target');
      assert.equal(mounted.again.update({ text: 'Still' }), true);
      mounted.again.destroy();
      await settle();
      assert.equal(seen.length, 1);
      assert.equal(reports.length, 1);
      assert.deepEqual(escaped, []);
    });
  }

  it('contains a fault Svelte delivers inside flushSync', async () => {
    const instance = seam();
    const target = companionTarget(targets);
    const told = [];
    const onFault = (error) => {
      told.push(error);
    };
    const handle = instance.publicApi.mount('PublishedProbe', { target, props: {}, onFault });
    await settle();
    handle.update({ explode: true });
    flushSync();
    assert.deepEqual(told, [], 'onFault is not called inside the flush that delivered the fault');
    assert.deepEqual(escaped, []);
    assert.deepEqual(reports, [[FAULT_REPORT, 'PublishedProbe', probe.PROBE_FAULTS.explode]]);
    assert.equal(handle.update({}), false, "the boundary's onerror retired it inside flushSync");
    assert.equal(target.childNodes.length, 0, 'unmounted inside the flush that delivered it');
    await settle();
    assert.equal(told.length, 1, 'and is called once the flush has returned');
    assert.ok(told[0] === probe.PROBE_FAULTS.explode);
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
      ui.mount('PublishedProbe', { target: companionTarget(targets), props: { throwAt: 'init' } });
      await settle();
    } finally {
      console.error = original;
    }
    const faults = calls.filter(([first]) => first === FAULT_REPORT);
    assert.deepEqual(faults, [[FAULT_REPORT, 'PublishedProbe', probe.PROBE_FAULTS.init]]);
  });
});
