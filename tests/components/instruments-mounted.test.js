/** The three instruments over the shared fill leaf (issue 1782): `Meter`, `BandedBar`, `StageBars`. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

function createHarness(name, dependencies, rawModules = []) {
  return createMountedComponentHarness({
    repoRoot,
    tmpPrefix: `fabricate-${name.toLowerCase()}-`,
    rawModules,
    compiledModules: [component('FillBar'), ...dependencies, component(name)],
    componentPath: component(name),
  });
}

const meter = createHarness('Meter', []);
const banded = createHarness(
  'BandedBar',
  [component('Kicker')],
  ['src/ui/svelte/util/dropRateTier.js']
);
const stages = createHarness('StageBars', [], [...FOUNDRY_BRIDGE_RAW_MODULES]);
const harnesses = [meter, banded, stages];

before(async () => {
  for (const harness of harnesses) await harness.setup();
});
afterEach(() => {
  for (const harness of harnesses) harness.remount();
});
after(() => {
  for (const harness of harnesses) harness.teardown();
});

describe('Meter (mounted)', () => {
  it('is a meter named by a visually hidden label, with its own value and reading', async () => {
    const root = await meter.mount({ value: 7, max: 11, label: 'Labourers', valueText: '7 / 11' });
    const node = root.querySelector('[role="meter"]');
    assert.ok(node.classList.contains('fab-meter'), 'the root is the meter');
    assert.deepEqual(
      ['aria-valuemin', 'aria-valuenow', 'aria-valuemax', 'aria-valuetext'].map((name) =>
        node.getAttribute(name)
      ),
      ['0', '7', '11', '7 / 11']
    );
    const label = node.querySelector('.visually-hidden');
    assert.equal(label.textContent, 'Labourers');
    assert.equal(node.getAttribute('aria-labelledby'), label.id, 'the hidden label names it');
    assert.match(node.querySelector('.fab-fill-bar-fill').getAttribute('style'), /width: 64%/u);
    assert.ok(node.querySelector('.fab-fill-bar').classList.contains('is-sm'), 'compact track');
  });

  it("is named by the caller's own head through labelId, and draws no label of its own", async () => {
    const root = await meter.mount({ value: 1, max: 2, labelId: 'head-1' });
    const node = root.querySelector('[role="meter"]');
    assert.equal(node.getAttribute('aria-labelledby'), 'head-1');
    assert.ok(!node.querySelector('.visually-hidden'), 'no second copy of the name');
    assert.ok(!node.hasAttribute('aria-valuetext'), 'an absent reading is genuinely absent');
  });

  it('clamps its value, reads a zero maximum as full, and paints the first segment', async () => {
    const root = await meter.mount({
      value: 5,
      max: 4,
      label: 'Shadow',
      segments: [{ tone: 'neutral', color: 'var(--fab-tag-aqua)' }],
    });
    const node = root.querySelector('[role="meter"]');
    assert.equal(node.getAttribute('aria-valuenow'), '4', 'an overshoot stops at the maximum');
    const fill = node.querySelector('.fab-fill-bar-fill');
    assert.match(fill.getAttribute('style'), /width: 100%; background: var\(--fab-tag-aqua\)/u);
    assert.equal(node.querySelector('.fab-fill-bar').dataset.fillBarTone, 'neutral');
    meter.remount();

    const empty = await meter.mount({ value: 0, max: 0, label: 'Nothing owed' });
    assert.match(empty.querySelector('.fab-fill-bar-fill').getAttribute('style'), /width: 100%/u);
    meter.remount();

    const third = await meter.mount({ value: 1, max: 3, label: 'x' });
    assert.match(third.querySelector('.fab-fill-bar-fill').getAttribute('style'), /width: 33%/u);
    meter.remount();

    const negative = await meter.mount({ value: -2, max: 4, label: 'x' });
    assert.equal(negative.querySelector('[role="meter"]').getAttribute('aria-valuenow'), '0');
  });

  it('draws no label and points at none when given neither label nor labelId', async () => {
    const root = await meter.mount({ value: 1, max: 2, 'aria-label': 'Stamina' });
    const node = root.querySelector('[role="meter"]');
    assert.ok(!node.hasAttribute('aria-labelledby'), 'no reference to an empty label');
    assert.ok(!node.querySelector('.visually-hidden'), 'no empty hidden label');
    assert.equal(node.getAttribute('aria-label'), 'Stamina', 'a rest aria-label names it');
  });
});

describe('BandedBar (mounted)', () => {
  it('draws one row as a meter, captioned and valued', async () => {
    const root = await banded.mount({
      rows: [{ id: 'chance', name: 'Event chance', percent: 62 }],
      direction: 'descending',
      'data-hook': 'yes',
    });
    const node = root.querySelector('[role="meter"]');
    assert.equal(node.getAttribute('aria-valuenow'), '62');
    assert.equal(node.getAttribute('aria-label'), 'Event chance', 'the caption names it');
    assert.equal(node.dataset.hook, 'yes', 'the rest spread lands on the root');
    assert.equal(node.querySelector('.fab-kicker').textContent, 'Event chance');
    assert.equal(node.querySelector('[data-banded-bar-percent]').textContent, '62%');
    assert.equal(node.querySelector('[data-banded-bar-row]').dataset.bandedBarRow, 'chance');
    assert.equal(node.querySelector('[data-banded-bar-track]').dataset.bandedBarTrack, 'chance');
    // Descending reads the risk ramp: 62% is its named middle step.
    assert.match(
      node.querySelector('.fab-fill-bar-fill').getAttribute('style'),
      /background: var\(--fab-hazard-mid\)/u
    );
  });

  it('draws several rows as a histogram whose tracks are hidden and whose text is not', async () => {
    const rows = [
      { id: 'fail', name: 'Failure', percent: 25, fill: 'danger' },
      { id: 'pass', name: 'Success', percent: 75, fill: 'success' },
    ];
    const root = await banded.mount({ rows, density: 'compact' });
    assert.ok(!root.querySelector('[role="meter"]'), 'a histogram is not a meter');
    const bands = [...root.querySelectorAll('[data-banded-bar-row]')];
    assert.deepEqual(
      bands.map((band) => [
        band.querySelector('.fab-banded-bar-name').textContent,
        band.querySelector('[data-banded-bar-percent]').textContent,
        band.querySelector('[data-banded-bar-track]').getAttribute('aria-hidden'),
        band.querySelector('.fab-fill-bar').dataset.fillBarTone,
      ]),
      [
        ['Failure', '25%', 'true', 'danger'],
        ['Success', '75%', 'true', 'success'],
      ]
    );
    for (const text of root.querySelectorAll('.fab-banded-bar-name, [data-banded-bar-percent]')) {
      assert.ok(!text.closest('[aria-hidden="true"]'), 'the name and percentage stay in the tree');
    }
  });

  it('draws one compact row as a meter in the band row geometry', async () => {
    const root = await banded.mount({
      rows: [{ id: 'botch', name: 'Botch', percent: 100, fill: 'danger' }],
      density: 'compact',
    });
    const node = root.querySelector('[role="meter"]');
    assert.equal(node.getAttribute('aria-valuenow'), '100');
    assert.equal(node.getAttribute('aria-label'), 'Botch');
    const band = node.querySelector('.fab-banded-bar-band[data-banded-bar-row="botch"]');
    assert.deepEqual(
      [...band.children].map((child) => child.classList[0]),
      ['fab-banded-bar-name', 'fab-fill-bar', 'fab-banded-bar-percent'],
      'name | track | percent, as a histogram row'
    );
    assert.equal(band.querySelector('[data-banded-bar-percent="botch"]').textContent, '100%');
    assert.ok(!node.querySelector('.fab-kicker'), 'no caption stacked over the row');
    assert.ok(!node.querySelector('[aria-hidden="true"]'), 'nothing inside the meter is hidden');
  });

  it('paints a fill that is neither a tone nor a ramp key neutral, never as a raw colour', async () => {
    const root = await banded.mount({
      rows: [
        { name: 'a', percent: 40, fill: '#ff0000' },
        { name: 'b', percent: 10, fill: 'color-mix(in srgb, red, blue)' },
      ],
    });
    for (const bar of root.querySelectorAll('.fab-fill-bar')) {
      assert.equal(bar.dataset.fillBarTone, 'neutral');
      assert.doesNotMatch(
        bar.querySelector('.fab-fill-bar-fill').getAttribute('style'),
        /background/u
      );
    }
  });

  it('reads an unfilled row off the drop-rate ramp when ascending', async () => {
    const root = await banded.mount({
      rows: [
        { id: 'a', name: 'Rare find', percent: 20 },
        { id: 'b', name: 'Sure thing', percent: 100 },
      ],
    });
    const styles = [...root.querySelectorAll('.fab-fill-bar-fill')].map((fill) =>
      fill.getAttribute('style')
    );
    assert.match(styles[0], /var\(--fab-drop-rate-rare\)/u);
    assert.match(styles[1], /var\(--fab-drop-rate-guaranteed\)/u);
  });
});

describe('StageBars (mounted)', () => {
  it('is a named group of stage-named progress bars, toned by position', async () => {
    const root = await stages.mount({
      stages: [
        { id: 'draw', name: 'Draw', value: 100 },
        { id: 'fold', name: 'Fold', value: 45 },
        { id: 'grind', value: 0 },
      ],
      currentIndex: 1,
      ariaLabel: 'Progress',
    });
    const group = root.querySelector('[role="group"]');
    assert.equal(group.getAttribute('aria-label'), 'Progress');
    assert.ok(!group.hasAttribute('aria-labelledby'), 'exactly one naming route');
    const bars = [...group.querySelectorAll('[role="progressbar"]')];
    assert.deepEqual(
      bars.map((bar) => [bar.getAttribute('aria-label'), bar.getAttribute('aria-valuenow')]),
      [
        ['Draw', '100'],
        ['Fold', '45'],
        ['FABRICATE.Common.StageBars.Unnamed:{"index":3,"count":3}', '0'],
      ]
    );
    assert.deepEqual(
      [...group.querySelectorAll('[data-stage-bars-state]')].map(
        (stage) => stage.dataset.stageBarsState
      ),
      ['success', 'accent', 'neutral']
    );
    assert.deepEqual(
      bars.map((bar) => bar.getAttribute('aria-current')),
      [null, 'step', null],
      'the current stage is not told by colour alone'
    );
    assert.equal(
      group.querySelectorAll('.fab-stage-bars-caption').length,
      3,
      'numbered by default'
    );
    assert.ok(!group.querySelector('button'), 'choosing a stage is not this instrument');
  });

  it('names the group by the caller kicker and draws no captions when unnumbered', async () => {
    const root = await stages.mount({
      stages: [{ value: 30 }],
      currentIndex: 0,
      numbered: false,
      ariaLabelledBy: 'kicker-1',
    });
    const group = root.querySelector('[role="group"]');
    assert.equal(group.getAttribute('aria-labelledby'), 'kicker-1');
    assert.ok(!group.hasAttribute('aria-label'), 'exactly one naming route');
    assert.ok(!group.querySelector('.fab-stage-bars-caption'), 'no caption row');
    const bar = group.querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute('aria-labelledby'), 'kicker-1', 'the lone bar takes the kicker');
    assert.ok(!bar.hasAttribute('aria-label'), 'and is not "Stage 1 of 1"');
  });

  it('names the unnamed bar of a one-stage list by the group name', async () => {
    const root = await stages.mount({ stages: [{}], ariaLabel: 'Progress' });
    const bar = root.querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute('aria-label'), 'Progress');
    assert.ok(!bar.hasAttribute('aria-labelledby'), 'exactly one naming route');
  });
});
