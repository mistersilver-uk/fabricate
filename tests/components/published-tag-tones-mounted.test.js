/**
 * The published `Meter`'s segment tones and `BandedBar`'s row fills (issue 2789) on Fabricate's real Svelte runtime, through a
 * fresh seam registered with the adapter's own table, into a companion target under no Fabricate
 * ancestor: each tag-palette name paints a segment and a lone segment's fill, a name outside the
 * closed set draws neutral, and an `update` rewrites and removes them.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  OUT_OF_SET_TONES,
  SEMANTIC_TONES,
  TAG_TONES,
} from '../fixtures/published-components/fillBarTones.js';
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
  tmpPrefix: 'fabricate-published-tag-tones-',
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

/** A meter of `segments` mounted at 6 of 10, its handle and the elements as drawn now. */
function mountMeter(segments, props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('Meter', {
    target,
    props: { label: 'Days', value: 6, max: 10, segments, ...props },
  });
  return {
    handle,
    track: () => target.querySelector('.fab-fill-bar'),
    fill: () => target.querySelector('.fab-fill-bar-fill'),
    segments: () => [...target.querySelectorAll('.fab-fill-bar-share')],
  };
}

/** A node's authored classes, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));
const tonesOf = (segments) => segments.map((segment) => classesOf(segment)[1]);

describe('the published Meter, segment tones', () => {
  it('draws one segment of each tag name, and rewrites and removes them on update', async () => {
    const entries = TAG_TONES.map((tone) => ({ value: 1, tone }));
    const meter = mountMeter(entries, { value: 10 });
    await settle();
    assert.deepEqual(
      tonesOf(meter.segments()),
      TAG_TONES.map((tone) => `is-${tone}`)
    );
    const reversed = entries.toReversed();
    assert.equal(
      meter.handle.update({ label: 'Days', value: 10, max: 10, segments: reversed }),
      true
    );
    await settle();
    assert.deepEqual(
      tonesOf(meter.segments()),
      TAG_TONES.toReversed().map((tone) => `is-${tone}`)
    );
    assert.equal(
      meter.handle.update({ label: 'Days', value: 10, max: 10, segments: [{ tone: 'rose' }] }),
      true
    );
    await settle();
    assert.equal(meter.segments().length, 0, 'one entry draws no segment element');
    assert.deepEqual(classesOf(meter.fill()), ['fab-fill-bar-fill', 'is-rose']);
    assert.equal(meter.handle.update({ label: 'Days', value: 10, max: 10 }), true);
    await settle();
    assert.deepEqual(classesOf(meter.fill()), ['fab-fill-bar-fill', 'is-success']);
    meter.handle.destroy();
  });

  for (const tone of [...SEMANTIC_TONES, ...TAG_TONES]) {
    it(`paints a ${tone} segment, and a lone ${tone} entry's fill, through the tone class`, async () => {
      const pair = mountMeter([{ value: 3, tone }, { tone: 'neutral' }]);
      await settle();
      assert.deepEqual(tonesOf(pair.segments()), [`is-${tone}`, 'is-neutral']);
      pair.handle.destroy();
      const lone = mountMeter([{ tone }]);
      await settle();
      assert.deepEqual(classesOf(lone.fill()), ['fab-fill-bar-fill', `is-${tone}`]);
      assert.equal(lone.track().dataset.fillBarTone, tone);
      lone.handle.destroy();
    });
  }

  for (const tone of OUT_OF_SET_TONES) {
    it(`paints ${JSON.stringify(tone)}, a name outside the closed set, neutral`, async () => {
      const pair = mountMeter([{ value: 3, tone }, { tone }]);
      await settle();
      assert.deepEqual(tonesOf(pair.segments()), ['is-neutral', 'is-neutral']);
      pair.handle.destroy();
      const lone = mountMeter([{ tone }]);
      await settle();
      assert.deepEqual(classesOf(lone.fill()), ['fab-fill-bar-fill', 'is-neutral']);
      lone.handle.destroy();
    });
  }

  it('accepts no raw colour as a segment tone', async () => {
    const meter = mountMeter([{ value: 3, tone: '#ff0000' }, { tone: 'rgb(0 0 0)' }]);
    await settle();
    assert.deepEqual(tonesOf(meter.segments()), ['is-neutral', 'is-neutral']);
    for (const segment of meter.segments()) {
      assert.doesNotMatch(segment.getAttribute('style'), /#ff0000|rgb\(0 0 0\)/u);
    }
    meter.handle.destroy();
  });

  it('draws a segment that reads 0 nowhere, whatever its tone', async () => {
    const meter = mountMeter([
      { value: 0, tone: 'ember' },
      { value: 3, tone: 'azure' },
      { tone: 'rose' },
    ]);
    await settle();
    assert.deepEqual(tonesOf(meter.segments()), ['is-azure', 'is-rose']);
    meter.handle.destroy();
  });
});

describe('the published BandedBar, a row fill read as a FillBar tone', () => {
  /** A one-row bar mounted with `fill`: its handle and the fill as drawn now. */
  function mountBanded(fill) {
    const target = companionTarget(targets);
    const handle = ui().mount('BandedBar', {
      target,
      props: { rows: [{ name: 'Event chance', percent: 40, fill }] },
    });
    return { handle, fill: () => target.querySelector('.fab-fill-bar-fill') };
  }

  for (const tone of TAG_TONES) {
    it(`paints a ${tone} row fill, a tag name, through the tone class`, async () => {
      const bar = mountBanded(tone);
      await settle();
      assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', `is-${tone}`]);
      bar.handle.destroy();
    });
  }

  for (const tone of OUT_OF_SET_TONES) {
    it(`paints ${JSON.stringify(tone)}, a fill outside every set, neutral`, async () => {
      const bar = mountBanded(tone);
      await settle();
      assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-neutral']);
      bar.handle.destroy();
    });
  }

  it('rewrites a tag name to a semantic tone on update', async () => {
    const bar = mountBanded('ember');
    await settle();
    assert.equal(
      bar.handle.update({ rows: [{ name: 'Event chance', percent: 40, fill: 'danger' }] }),
      true
    );
    await settle();
    assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-danger']);
    bar.handle.destroy();
  });
});
