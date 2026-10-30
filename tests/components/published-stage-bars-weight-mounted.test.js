/**
 * The published `StageBars`' stage `weight` and `gap` (issue 2821) on Fabricate's real Svelte
 * runtime, through a fresh seam registered with the adapter's own table, into a companion target
 * under no Fabricate ancestor: the bars take `weight / Σweight` of the row, a weight that is not a
 * finite number above zero reads 1, a list with none draws equal bars, `gap` takes its two values,
 * and an `update` rewrites and removes both.
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
  tmpPrefix: 'fabricate-published-stage-bars-weight-',
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

const STAGES = (weights) =>
  weights.map((weight, index) => ({ name: `S${index}`, value: 50, weight }));

/** `StageBars` mounted with `props`: its handle and the group as drawn now. */
function mountStages(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('StageBars', { target, props: { ariaLabel: 'Run', ...props } });
  return {
    handle,
    group: () => target.querySelector('[role="group"]'),
    columns: () => target.querySelector('[role="group"]').style.gridTemplateColumns,
  };
}

/** The `fr` shares a template names, rounded to two places. */
const sharesOf = (template) =>
  [...template.matchAll(/minmax\(0, ([\d.e+-]+)fr\)/gu)].map(({ 1: share }) =>
    Number(Number(share).toFixed(2))
  );

describe('the published StageBars, weight', () => {
  it('sizes each bar by weight over the sum, and removes it on update', async () => {
    const bars = mountStages({ stages: STAGES([1, 3, 6]) });
    await settle();
    assert.deepEqual(sharesOf(bars.columns()), [10, 30, 60]);
    assert.equal(
      bars.handle.update({ ariaLabel: 'Run', stages: STAGES([undefined, undefined, undefined]) }),
      true
    );
    await settle();
    assert.equal(bars.columns(), '', 'an update that names no weight draws equal bars');
    bars.handle.destroy();
  });

  it('rewrites the weights on update', async () => {
    const bars = mountStages({ stages: STAGES([1, 1]) });
    await settle();
    assert.deepEqual(sharesOf(bars.columns()), [50, 50]);
    assert.equal(bars.handle.update({ ariaLabel: 'Run', stages: STAGES([1, 1, 2]) }), true);
    await settle();
    assert.deepEqual(sharesOf(bars.columns()), [25, 25, 50]);
    bars.handle.destroy();
  });

  it('reads a weight under 1 as a share, not as a count of fr', async () => {
    const bars = mountStages({ stages: STAGES([0.25, 0.75]) });
    await settle();
    assert.deepEqual(sharesOf(bars.columns()), [25, 75]);
    bars.handle.destroy();
  });

  for (const weight of [0, -2, NaN, Infinity, '3', null, true, {}, undefined]) {
    it(`reads ${String(weight)} as 1 beside a stage weighted 3`, async () => {
      const bars = mountStages({ stages: STAGES([3, weight]) });
      await settle();
      assert.deepEqual(sharesOf(bars.columns()), [75, 25]);
      bars.handle.destroy();
    });
  }

  it('keeps the proportions of weights too large to sum', async () => {
    const bars = mountStages({ stages: STAGES([1e308, 1e308, 2e307]) });
    await settle();
    assert.deepEqual(sharesOf(bars.columns()), [45.45, 45.45, 9.09]);
    bars.handle.destroy();
  });

  for (const stages of [null, 'abc', {}]) {
    it(`draws the group as before for stages ${JSON.stringify(stages)} and reports nothing`, async () => {
      const bars = mountStages({ stages });
      await settle();
      assert.ok(bars.group(), 'the named group is drawn');
      assert.equal(bars.columns(), '');
      bars.handle.destroy();
    });
  }

  it('draws equal bars, with no template, when no stage names a valid weight', async () => {
    const bars = mountStages({ stages: STAGES([0, -1, '2', undefined]) });
    await settle();
    assert.equal(bars.columns(), '');
    bars.handle.destroy();
  });

  it('keeps one bar per stage and each bar named and valued as it was', async () => {
    const bars = mountStages({ stages: STAGES([1, 5]), currentIndex: 1 });
    await settle();
    const names = [...bars.group().querySelectorAll('[role="progressbar"]')].map((bar) => [
      bar.getAttribute('aria-label'),
      bar.getAttribute('aria-valuenow'),
    ]);
    assert.deepEqual(names, [
      ['S0', '50'],
      ['S1', '50'],
    ]);
    bars.handle.destroy();
  });
});

describe('the published StageBars, gap', () => {
  const tight = (bars) => bars.group().classList.contains('is-tight');

  it('draws the tight gap for tight, and removes it on update', async () => {
    const bars = mountStages({ stages: STAGES([1, 1]), gap: 'tight' });
    await settle();
    assert.equal(tight(bars), true);
    assert.equal(bars.handle.update({ ariaLabel: 'Run', stages: STAGES([1, 1]) }), true);
    await settle();
    assert.equal(tight(bars), false);
    bars.handle.destroy();
  });

  for (const gap of ['default', 'Tight', 'TIGHT', 'wide', '', 2, true, null]) {
    it(`draws the default gap for ${JSON.stringify(gap)}`, async () => {
      const bars = mountStages({ stages: STAGES([1, 1]), gap });
      await settle();
      assert.equal(tight(bars), false);
      bars.handle.destroy();
    });
  }
});
