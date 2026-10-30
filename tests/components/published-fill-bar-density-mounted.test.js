/**
 * The published `FillBar`'s `density` (issue 2821) on Fabricate's real Svelte runtime, through a
 * fresh seam registered with the adapter's own table, into a companion target under no Fabricate
 * ancestor: `thin` draws the borderless 4px track, `compact` and `default` keep theirs, a value
 * outside the set draws the default track, an `update` rewrites and removes it, and `BandedBar`,
 * which forwards its own `density`, never draws a thin track.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-fill-bar-density-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  assert.deepEqual(reports, [], 'nothing was reported');
});

/** The size classes a track carries beside its own: `is-sm` is compact, `is-thin` is thin. */
const sizeOf = (track) => ['is-sm', 'is-thin'].filter((name) => track.classList.contains(name));

/** A bar mounted with `props`: its handle and its track as drawn now. */
function mountBar(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('FillBar', { target, props });
  return { handle, track: () => target.querySelector('.fab-fill-bar') };
}

describe('the published FillBar, density', () => {
  it('draws the thin track for thin, and removes it on update', async () => {
    const bar = mountBar({ value: 50, density: 'thin' });
    await settle();
    assert.deepEqual(sizeOf(bar.track()), ['is-thin']);
    assert.equal(bar.handle.update({ value: 50 }), true);
    await settle();
    assert.deepEqual(sizeOf(bar.track()), []);
    bar.handle.destroy();
  });

  it('keeps compact and default as they were, and rewrites among all three on update', async () => {
    const bar = mountBar({ value: 50, density: 'compact' });
    await settle();
    assert.deepEqual(sizeOf(bar.track()), ['is-sm']);
    for (const [density, expected] of [
      ['thin', ['is-thin']],
      ['default', []],
      ['compact', ['is-sm']],
    ]) {
      assert.equal(bar.handle.update({ value: 50, density }), true);
      await settle();
      assert.deepEqual(sizeOf(bar.track()), expected, density);
    }
    bar.handle.destroy();
  });

  for (const density of ['Thin', 'THIN', 'tiny', 'sm', '', 4, true, null]) {
    it(`draws the default track for ${JSON.stringify(density)}, a value outside the set`, async () => {
      const bar = mountBar({ value: 50, density });
      await settle();
      assert.deepEqual(sizeOf(bar.track()), []);
      bar.handle.destroy();
    });
  }

  it('keeps the fill the value wide on the thin track', async () => {
    const bar = mountBar({ value: 35, density: 'thin', tone: 'info' });
    await settle();
    const fill = bar.track().querySelector('.fab-fill-bar-fill');
    assert.equal(fill.style.width, '35%');
    assert.ok(fill.classList.contains('is-info'));
    bar.handle.destroy();
  });
});

describe('the published BandedBar, which forwards its density', () => {
  /** A one-row bar mounted with `density`: its handle and the tracks as drawn now. */
  function mountBanded(density) {
    const target = companionTarget(targets);
    const handle = ui().mount('BandedBar', {
      target,
      props: { rows: [{ name: 'Event chance', percent: 40 }], density },
    });
    return { handle, tracks: () => [...target.querySelectorAll('.fab-fill-bar')] };
  }

  for (const [density, expected] of [
    ['thin', []],
    ['compact', ['is-sm']],
    ['default', []],
  ]) {
    it(`draws ${density} as ${expected.length > 0 ? 'the compact track' : 'the default track'}`, async () => {
      const bar = mountBanded(density);
      await settle();
      assert.equal(bar.tracks().length, 1);
      assert.deepEqual(sizeOf(bar.tracks()[0]), expected);
      bar.handle.destroy();
    });
  }
});
