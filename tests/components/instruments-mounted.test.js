/** The three instruments over the shared fill leaf (issue 1782): `Meter`, `BandedBar`, `StageBars`. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

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
const stages = createHarness('StageBars', []);
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
    const label = node.querySelector('.fab-meter-hidden');
    assert.equal(label.textContent, 'Labourers');
    assert.equal(node.getAttribute('aria-labelledby'), label.id, 'the hidden label names it');
    assert.match(node.querySelector('.fab-fill-bar-fill').getAttribute('style'), /width: 64%/u);
    assert.ok(node.querySelector('.fab-fill-bar').classList.contains('is-sm'), 'compact track');
  });

  it("is named by the caller's own head through labelId, and draws no label of its own", async () => {
    const root = await meter.mount({ value: 1, max: 2, labelId: 'head-1' });
    const node = root.querySelector('[role="meter"]');
    assert.equal(node.getAttribute('aria-labelledby'), 'head-1');
    assert.ok(!node.querySelector('.fab-meter-hidden'), 'no second copy of the name');
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
    assert.ok(!node.querySelector('.fab-meter-hidden'), 'no empty hidden label');
    assert.equal(node.getAttribute('aria-label'), 'Stamina', 'a rest aria-label names it');
  });
});

const sharesOf = (root) => [...root.querySelectorAll('.fab-fill-bar-share')];
const toneOf = (node) => [...node.classList].find((name) => name.startsWith('is-'));
const fillOf = (root) => root.querySelector('.fab-fill-bar-fill');

/** The drawn segments' grow factors stand in `expected`'s ratio, within 1e-6. */
function assertRatio(root, expected) {
  const grows = sharesOf(root).map((share) => Number(share.style.flexGrow));
  assert.equal(grows.length, expected.length, `${expected.length} segments drawn`);
  const sum = (list) => list.reduce((total, each) => total + each, 0);
  for (const [index, grow] of grows.entries()) {
    const want = expected[index] / sum(expected);
    assert.ok(Math.abs(grow / sum(grows) - want) < 1e-6, `segment ${index} is ${want} of the fill`);
  }
}

/** The single fill: its tone class, inline style and the track's tone attribute, and no segment. */
function assertSingleFill(root, tone, style) {
  assert.equal(sharesOf(root).length, 0, 'no segment element');
  assert.ok(!root.querySelector('.is-stacked'), 'no stacked fill');
  assert.deepEqual(
    [...fillOf(root).classList].filter((name) => !name.startsWith('svelte-')),
    ['fab-fill-bar-fill', `is-${tone}`]
  );
  assert.equal(fillOf(root).getAttribute('style'), style);
  assert.equal(root.querySelector('.fab-fill-bar').dataset.fillBarTone, tone);
}

describe('Meter segments (mounted)', () => {
  it('draws each entry as a segment of the one fill, and still announces the whole', async () => {
    const root = await meter.mount({
      value: 7,
      max: 12,
      label: 'Pooled days',
      segments: [{ value: 3, tone: 'accent' }, { tone: 'neutral' }],
    });
    assert.match(fillOf(root).getAttribute('style'), /width: 58%/u);
    assert.ok(fillOf(root).classList.contains('is-stacked'));
    assertRatio(root, [3, 4]);
    assert.deepEqual(sharesOf(root).map(toneOf), ['is-accent', 'is-neutral']);
    assert.equal(root.querySelector('[role="meter"]').getAttribute('aria-valuenow'), '7');
  });

  it('stops each span where the fill ends, so an entry past the reading is not drawn', async () => {
    const root = await meter.mount({
      value: 8,
      max: 10,
      label: 'x',
      segments: [{ value: 6 }, { value: 6 }, { tone: 'danger' }],
    });
    assertRatio(root, [6, 2]);
    assert.deepEqual(sharesOf(root).map(toneOf), ['is-success', 'is-success']);
  });

  it('gives the last entry the rest of the reading, whatever its own value', async () => {
    const root = await meter.mount({
      value: 7,
      max: 12,
      label: 'x',
      segments: [{ value: 3 }, { value: 1, tone: 'neutral' }],
    });
    assertRatio(root, [3, 4]);
  });

  it('draws no entry that spans nothing', async () => {
    const zero = await meter.mount({
      value: 7,
      max: 12,
      label: 'x',
      segments: [{ value: 0, tone: 'danger' }, { value: 2, tone: 'accent' }, { tone: 'neutral' }],
    });
    assertRatio(zero, [2, 5]);
    assert.deepEqual(sharesOf(zero).map(toneOf), ['is-accent', 'is-neutral']);
    meter.remount();

    const trailing = await meter.mount({
      value: 7,
      max: 12,
      label: 'x',
      segments: [{ value: 7, tone: 'accent' }, { tone: 'neutral' }],
    });
    assertSingleFill(trailing, 'accent', 'width: 58%;');
    meter.remount();

    const leading = await meter.mount({
      value: 7,
      max: 12,
      label: 'x',
      segments: [{ value: 0, tone: 'danger' }, { tone: 'accent' }],
    });
    assertSingleFill(leading, 'accent', 'width: 58%;');
    meter.remount();

    const whole = await meter.mount({
      value: 7,
      max: 12,
      label: 'x',
      segments: [{ value: 12, tone: 'danger' }, { tone: 'accent' }],
    });
    assertSingleFill(whole, 'danger', 'width: 58%;');
  });

  it('reads an entry value that is not a finite number of zero or more as 0', async () => {
    for (const bad of ['3', Infinity, -2, NaN]) {
      const root = await meter.mount({
        value: 7,
        max: 12,
        label: 'x',
        segments: [
          { value: bad, tone: 'danger' },
          { value: 2, tone: 'accent' },
          { tone: 'neutral' },
        ],
      });
      assertRatio(root, [2, 5]);
      assert.deepEqual(sharesOf(root).map(toneOf), ['is-accent', 'is-neutral'], String(bad));
      meter.remount();
    }
  });

  it('reads a null entry as one with no value, tone or colour', async () => {
    for (const [segments, tones] of [
      [
        [{ value: 3, tone: 'accent' }, null],
        ['is-accent', 'is-success'],
      ],
      [
        [{ value: 3, tone: 'accent' }, null, { tone: 'neutral' }],
        ['is-accent', 'is-neutral'],
      ],
    ]) {
      const root = await meter.mount({ value: 7, max: 12, label: 'x', segments });
      assertRatio(root, [3, 4]);
      assert.deepEqual(sharesOf(root).map(toneOf), tones);
      meter.remount();
    }
  });

  it('draws a span of float residue as nothing and a small real one as a segment', async () => {
    const residue = await meter.mount({
      value: 0.1 + 0.2,
      max: 1,
      label: 'x',
      segments: [{ value: 0.1 }, { value: 0.2 }, { tone: 'danger' }],
    });
    assertRatio(residue, [1, 2]);
    assert.deepEqual(sharesOf(residue).map(toneOf), ['is-success', 'is-success']);
    meter.remount();

    const small = await meter.mount({
      value: 1e-6,
      max: 1,
      label: 'x',
      segments: [{ value: 5e-7, tone: 'accent' }, { tone: 'neutral' }],
    });
    assertRatio(small, [1, 1]);
    assert.deepEqual(sharesOf(small).map(toneOf), ['is-accent', 'is-neutral']);
  });

  it('draws one entry, or none, as the single fill it drew before segments', async () => {
    for (const [segments, tone] of [
      [[{ tone: 'accent' }], 'accent'],
      [[], 'success'],
      [[{ value: 9, tone: 'accent' }], 'accent'],
    ]) {
      const root = await meter.mount({ value: 7, max: 12, label: 'x', segments });
      assertSingleFill(root, tone, 'width: 58%;');
      meter.remount();
    }
  });

  it("paints the first entry's tone and colour when no entry spans anything", async () => {
    const empty = await meter.mount({
      value: 0,
      max: 12,
      label: 'x',
      segments: [{ tone: 'accent', color: 'var(--fab-tag-aqua)' }],
    });
    assertSingleFill(empty, 'accent', 'width: 0%; background: var(--fab-tag-aqua);');
    meter.remount();

    const owed = await meter.mount({
      value: 0,
      max: 0,
      label: 'x',
      segments: [{ tone: 'accent' }],
    });
    assertSingleFill(owed, 'accent', 'width: 100%;');
    meter.remount();

    const full = await meter.mount({
      value: 7,
      max: 0,
      label: 'x',
      segments: [{ value: 3, tone: 'accent' }, { tone: 'neutral' }],
    });
    assertSingleFill(full, 'accent', 'width: 100%;');
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
  /** A second mount in the same test, after the first is destroyed. */
  async function remountStages(props) {
    stages.remount();
    return stages.mount(props);
  }

  it('is a named group of progress bars, each named by its label, else its name, toned by position', async () => {
    const root = await stages.mount({
      stages: [
        { name: 'Draw', value: 100 },
        { name: 'Fold', label: 'Fold the billet', value: 45 },
        { value: 0 },
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
        ['Fold the billet', '45'],
        [null, '0'],
      ],
      'a stage of several with neither label nor name has no name of its own'
    );
    assert.ok(!bars[2].hasAttribute('aria-labelledby'), 'and borrows none');
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
    assert.deepEqual(
      [...group.querySelectorAll('.fab-stage-bars-caption')].map((caption) => caption.textContent),
      ['1 Draw', '2 Fold', '3 '],
      'numbered by default, each caption its position and its name, never its label'
    );
    assert.deepEqual(
      [...group.querySelectorAll('.fab-stage-bars-caption')].map((caption) =>
        caption.getAttribute('title')
      ),
      ['Draw', 'Fold', null],
      "each named caption's title is its stage's whole name, never its label or position"
    );
    assert.ok(!group.querySelector('button'), 'choosing a stage is not this instrument');
  });

  it('announces a stage valueText as its reading, and only a non-empty string one', async () => {
    const root = await stages.mount({
      stages: [
        { name: 'Draw', valueText: '100%, stage 1 of 4', value: 100 },
        { name: 'Fold', value: 45 },
        { name: 'Quench', valueText: '', value: 0 },
        { name: 'Temper', valueText: 7, value: 0 },
      ],
      ariaLabel: 'Progress',
    });
    const bars = [...root.querySelectorAll('[role="progressbar"]')];
    assert.deepEqual(
      bars.map((bar) => [bar.getAttribute('aria-valuetext'), bar.getAttribute('aria-valuenow')]),
      [
        ['100%, stage 1 of 4', '100'],
        [null, '45'],
        [null, '0'],
        [null, '0'],
      ],
      'an omitted, empty or non-string valueText leaves the percentage as the reading'
    );
  });

  it('draws an empty named group for no stages', async () => {
    const root = await stages.mount({ stages: [], ariaLabel: 'Progress' });
    const group = root.querySelector('[role="group"]');
    assert.equal(group.getAttribute('aria-label'), 'Progress');
    assert.equal(group.children.length, 0);
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

  it("names a lone stage by its own label, else its own name, before the group's name", async () => {
    const named = await stages.mount({
      stages: [{ name: 'Copy', value: 70 }],
      ariaLabel: 'Progress',
    });
    assert.equal(
      named.querySelector('[role="progressbar"]').getAttribute('aria-label'),
      'Copy',
      "a lone stage's own name beats the group's"
    );
    const labelled = await remountStages({
      stages: [{ name: 'Copy', label: 'Copy the scroll', value: 70 }],
      ariaLabel: 'Progress',
    });
    assert.equal(
      labelled.querySelector('[role="progressbar"]').getAttribute('aria-label'),
      'Copy the scroll',
      "and its label beats both the name and the group's"
    );
  });

  it('clamps a value to 0–100, reads a non-numeric one as 0, and tones only a full bar by its value', async () => {
    const root = await stages.mount({
      stages: [
        { name: 'A', value: 150 },
        { name: 'B', value: -5 },
        { name: 'C', value: 'x' },
        { name: 'D', value: '45' },
      ],
      ariaLabel: 'Progress',
    });
    const bars = [...root.querySelectorAll('[role="progressbar"]')];
    assert.deepEqual(
      bars.map((bar) => bar.getAttribute('aria-valuenow')),
      ['100', '0', '0', '45']
    );
    assert.deepEqual(
      [...root.querySelectorAll('[data-stage-bars-state]')].map(
        (stage) => stage.dataset.stageBarsState
      ),
      ['success', 'neutral', 'neutral', 'neutral'],
      'a filled bar reads success, and no other bar but the current one is toned'
    );
    assert.deepEqual(
      bars.map((bar) => bar.getAttribute('aria-current')),
      ['step', null, null, null],
      'the current stage defaults to the first, and a filled current bar still carries it'
    );
  });

  it('announces a whole number, truncated, while the fill keeps the fraction', async () => {
    const root = await stages.mount({
      stages: [
        { name: 'A', value: 40.4 },
        { name: 'B', value: 99.9 },
        { name: 'C', value: 100 },
      ],
      ariaLabel: 'Progress',
    });
    assert.deepEqual(
      [...root.querySelectorAll('[role="progressbar"]')].map((bar) =>
        bar.getAttribute('aria-valuenow')
      ),
      ['40', '99', '100'],
      'an unfinished bar never reads 100, and no bar reads a fraction'
    );
  });

  it('draws a bar for every stage whatever a stage carries, and marks no current one out of range', async () => {
    const duplicated = await stages.mount({
      stages: [
        { id: 'a', name: 'X', value: 1 },
        { id: 'a', name: 'Y', value: 2 },
      ],
      ariaLabel: 'Progress',
    });
    assert.deepEqual(
      [...duplicated.querySelectorAll('[role="progressbar"]')].map((bar) =>
        bar.getAttribute('aria-label')
      ),
      ['X', 'Y'],
      'a private id two stages share keys nothing'
    );
    const outOfRange = await remountStages({
      stages: [{ name: 'A', value: 1 }, null],
      currentIndex: 7,
      ariaLabel: 'Progress',
    });
    const bars = [...outOfRange.querySelectorAll('[role="progressbar"]')];
    assert.equal(bars.length, 2, 'a null entry still draws its bar');
    assert.deepEqual(
      bars.map((bar) => bar.getAttribute('aria-current')),
      [null, null]
    );
  });
});
