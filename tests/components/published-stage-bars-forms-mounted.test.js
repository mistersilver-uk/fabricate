/**
 * The published `StageBars`' stage `shares` and `track` (issue 2837) on Fabricate's real Svelte
 * runtime, through a fresh seam registered with the adapter's own table: two or more shares draw
 * a stage's fill in their own tones in place of its state's paint, fewer draw the state's, a
 * share's raw `color` never reaches the bar, `thin` draws each bar's track as `FillBar`'s thin
 * one and any other `track` the default, and an `update` rewrites and removes both. A stage's
 * `title` (issue 2857) is its bar's `data-tooltip-text`, numbered or not, on no focusable element.
 * Limit: happy-dom lays nothing out, so the drawn heights, edges, widths and colours are
 * `stage-bars-forms-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, mountEntry } = publishedEntrySeam('fabricate-published-stage-bars-forms-');

const SPLIT = Object.freeze([
  { weight: 2, tone: 'ember' },
  { weight: 1, tone: 'azure' },
]);

/** `StageBars` mounted with `props`: its handle, and each stage's bar and shares as drawn now. */
async function mountStages(props) {
  const { target, handle } = mountEntry('StageBars', { ariaLabel: 'Run', ...props });
  await settle();
  const stages = () => [...target.querySelectorAll('[data-stage-bars-stage]')];
  return {
    handle,
    group: () => target.querySelector('[role="group"]'),
    bars: () => stages().map((stage) => stage.querySelector('.fab-fill-bar')),
    shares: (index) =>
      [...stages()[index].querySelectorAll('.fab-fill-bar-share')].map((share) =>
        [...share.classList].find((name) => name.startsWith('is-'))
      ),
    fill: (index) => stages()[index].querySelector('.fab-fill-bar-fill'),
    states: () => stages().map((stage) => stage.dataset.stageBarsState),
  };
}

describe('the published StageBars describes shares and track', () => {
  it('lists track after gap, as an optional data key', () => {
    const { props } = ui().describe('StageBars');
    assert.deepEqual(Object.keys(props), [
      'stages',
      'currentIndex',
      'numbered',
      'gap',
      'track',
      'ariaLabel',
    ]);
    assert.deepEqual(props.track, { kind: 'data', required: false });
  });
});

describe('the published StageBars, a stage’s shares', () => {
  it('draws two or more shares in their own tones, on the current, a filled and an ahead stage', async () => {
    const bars = await mountStages({
      currentIndex: 1,
      stages: [
        { name: 'Done', value: 100, shares: SPLIT },
        { name: 'Now', value: 40, shares: SPLIT },
        { name: 'Next', value: 20, shares: [...SPLIT, { weight: 1, tone: 'rose' }] },
      ],
    });
    assert.deepEqual(bars.shares(0), ['is-ember', 'is-azure']);
    assert.deepEqual(bars.shares(1), ['is-ember', 'is-azure']);
    assert.deepEqual(bars.shares(2), ['is-ember', 'is-azure', 'is-rose']);
    for (const [index, bar] of bars.bars().entries()) {
      assert.equal(bar.dataset.fillBarTone, undefined, `stage ${index} draws no state tone`);
      assert.ok(bars.fill(index).classList.contains('is-stacked'));
    }
    assert.equal(bars.fill(1).style.width, '40%', 'the stack is the stage’s value wide');
    assert.deepEqual(
      bars.states(),
      ['success', 'accent', 'neutral'],
      'the stage keeps its state hook'
    );
    const current = bars.group().querySelectorAll('[role="progressbar"]')[1];
    assert.equal(current.getAttribute('aria-current'), 'step', 'and the current bar its step');
    assert.equal(current.getAttribute('aria-valuenow'), '40');
    bars.handle.destroy();
  });

  for (const [what, shares] of [
    ['one share', [{ weight: 1, tone: 'ember' }]],
    ['no share', []],
    ['a shares that is not an array', { weight: 1, tone: 'ember' }],
    ['a string', 'ember'],
    ['null', null],
  ]) {
    it(`draws the state’s paint for ${what}`, async () => {
      const bars = await mountStages({
        currentIndex: 0,
        stages: [
          { name: 'Now', value: 40, shares },
          { name: 'Done', value: 100, shares },
        ],
      });
      assert.deepEqual(
        bars.bars().map((bar) => bar.dataset.fillBarTone),
        ['accent', 'success']
      );
      assert.ok(bars.fill(0).classList.contains('is-accent'));
      assert.equal(bars.shares(0).length, 0);
      bars.handle.destroy();
    });
  }

  it('paints a share by its tone alone, never a raw colour a share carries', async () => {
    const bars = await mountStages({
      stages: [
        {
          name: 'Now',
          value: 50,
          shares: [
            { weight: 1, tone: 'ember', color: 'red' },
            { weight: 1, tone: 'azure', color: 'var(--fab-tag-rose)' },
          ],
        },
      ],
    });
    assert.deepEqual(bars.shares(0), ['is-ember', 'is-azure']);
    const drawn = () => [...bars.group().querySelectorAll('.fab-fill-bar-share')];
    for (const share of drawn()) {
      assert.equal(share.style.background, '', 'no inline background');
      assert.doesNotMatch(share.getAttribute('style'), /red|--fab-tag-rose/u);
    }
    bars.handle.update({
      ariaLabel: 'Run',
      stages: [{ name: 'Now', value: 50, shares: [{ weight: 1, color: 'green' }, { weight: 1 }] }],
    });
    await settle();
    assert.deepEqual(bars.shares(0), ['is-success', 'is-success'], 'a share’s tone defaults');
    for (const share of drawn()) assert.equal(share.style.background, '');
    bars.handle.destroy();
  });

  it('draws a tone outside the set, a raw colour among them, as neutral', async () => {
    const bars = await mountStages({
      stages: [
        {
          name: 'Now',
          value: 50,
          shares: [
            { weight: 1, tone: '#ff0000' },
            { weight: 1, tone: 'Ember' },
          ],
        },
      ],
    });
    assert.deepEqual(bars.shares(0), ['is-neutral', 'is-neutral']);
    bars.handle.destroy();
  });

  it('sizes the shares within the stage’s fill and the stages by their own weight', async () => {
    const bars = await mountStages({
      stages: [
        { name: 'A', value: 60, weight: 3, shares: SPLIT },
        { name: 'B', value: 0, weight: 1 },
      ],
    });
    const grows = [...bars.group().querySelectorAll('.fab-fill-bar-share')].map(
      (share) => share.style.flexGrow
    );
    assert.equal(grows.length, 2);
    assert.ok(Math.abs(Number(grows[0]) - 200 / 3) < 0.01, `share 0 grows ${grows[0]}`);
    assert.ok(Math.abs(Number(grows[1]) - 100 / 3) < 0.01, `share 1 grows ${grows[1]}`);
    assert.match(bars.group().style.gridTemplateColumns, /^minmax\(0, 75fr\) minmax\(0, 25fr\)$/u);
    bars.handle.destroy();
  });

  it('rewrites the shares on update, and an update without them draws the state again', async () => {
    const bars = await mountStages({ stages: [{ name: 'Now', value: 50, shares: SPLIT }] });
    assert.deepEqual(bars.shares(0), ['is-ember', 'is-azure']);
    bars.handle.update({
      ariaLabel: 'Run',
      stages: [{ name: 'Now', value: 50, shares: SPLIT.toReversed() }],
    });
    await settle();
    assert.deepEqual(bars.shares(0), ['is-azure', 'is-ember']);
    bars.handle.update({ ariaLabel: 'Run', stages: [{ name: 'Now', value: 50 }] });
    await settle();
    assert.deepEqual(bars.shares(0), []);
    assert.equal(bars.bars()[0].dataset.fillBarTone, 'accent');
    bars.handle.destroy();
  });

  it('reads a hole in a sparse shares array as {}, and draws the rest', async () => {
    const shares = Object.assign([], { 1: SPLIT[0], 2: SPLIT[1] });
    assert.equal(0 in shares, false, 'the array holds a hole');
    const bars = await mountStages({ stages: [{ name: 'Now', value: 50, shares }] });
    assert.deepEqual(bars.shares(0), ['is-success', 'is-ember', 'is-azure']);
    bars.handle.destroy();
  });

  it('refuses a function in a share, as anywhere in a data value', () => {
    assert.throws(
      () =>
        mountEntry('StageBars', {
          ariaLabel: 'Run',
          stages: [{ value: 1, shares: [{ weight: () => 1 }, { weight: 1 }] }],
        }),
      { message: 'Fabricate | published components: "stages" must not hold a function' }
    );
  });
});

describe('the published StageBars, track', () => {
  const thin = (bars) => bars.bars().map((bar) => bar.classList.contains('is-thin'));

  it('draws each bar’s track thin for thin, and the default again on update', async () => {
    const stages = [
      { name: 'A', value: 100 },
      { name: 'B', value: 30 },
    ];
    const bars = await mountStages({ stages, currentIndex: 1, track: 'thin' });
    assert.ok(bars.group().classList.contains('is-thin'));
    assert.deepEqual(thin(bars), [true, true]);
    assert.deepEqual(
      bars.bars().map((bar) => bar.classList.contains('is-sm')),
      [false, false],
      'never also compact'
    );
    assert.deepEqual(
      bars.bars().map((bar) => bar.dataset.fillBarTone),
      ['success', 'accent'],
      'the states are painted on the thin track as on the default'
    );
    bars.handle.update({ ariaLabel: 'Run', stages, currentIndex: 1 });
    await settle();
    assert.ok(!bars.group().classList.contains('is-thin'));
    assert.deepEqual(thin(bars), [false, false]);
    assert.deepEqual(
      bars.bars().map((bar) => bar.classList.contains('is-sm')),
      [true, true]
    );
    bars.handle.destroy();
  });

  it('draws shares on the thin track', async () => {
    const bars = await mountStages({ track: 'thin', stages: [{ value: 50, shares: SPLIT }] });
    assert.deepEqual(thin(bars), [true]);
    assert.deepEqual(bars.shares(0), ['is-ember', 'is-azure']);
    bars.handle.destroy();
  });

  for (const track of ['default', 'Thin', 'THIN', 'compact', 'thick', '', 1, true, null]) {
    it(`draws the default track for ${JSON.stringify(track)}`, async () => {
      const bars = await mountStages({ track, stages: [{ name: 'A', value: 50 }] });
      assert.ok(!bars.group().classList.contains('is-thin'));
      assert.deepEqual(thin(bars), [false]);
      assert.ok(bars.bars()[0].classList.contains('is-sm'));
      bars.handle.destroy();
    });
  }
});

describe('the published StageBars, a stage’s title (issue 2857)', () => {
  const tooltips = (group) =>
    [...group.querySelectorAll('[role="progressbar"]')].map((bar) =>
      bar.getAttribute('data-tooltip-text')
    );

  for (const numbered of [false, true]) {
    it(`writes each title as its bar’s data-tooltip-text, numbered ${numbered}`, async () => {
      const bars = await mountStages({
        numbered,
        stages: [
          { label: 'Smelt', value: 60, title: 'Smelt: 3 of 5 days' },
          { label: 'Forge', value: 0, title: 'Forge: <b>not</b> begun' },
          { label: 'Temper', value: 0 },
        ],
      });
      assert.deepEqual(tooltips(bars.group()), [
        'Smelt: 3 of 5 days',
        'Forge: <b>not</b> begun',
        null,
      ]);
      assert.equal(bars.group().querySelector('b'), null, 'a title is never read as markup');
      for (const tip of bars.group().querySelectorAll('[data-tooltip-text]')) {
        assert.equal(tip.getAttribute('role'), 'progressbar', 'only a bar carries it');
        assert.equal(tip.hasAttribute('tabindex'), false, 'and the bar takes no focus');
        assert.equal(tip.hasAttribute('data-tooltip'), false);
        assert.equal(tip.hasAttribute('title'), false);
      }
      bars.handle.destroy();
    });
  }

  it('keeps a numbered caption’s own title, its name, beside the bar’s', async () => {
    const bars = await mountStages({
      stages: [{ name: 'Smelt', value: 60, title: '3 of 5 days' }],
    });
    const caption = bars.group().querySelector('.fab-stage-bars-caption');
    assert.equal(caption.getAttribute('title'), 'Smelt');
    assert.equal(caption.hasAttribute('data-tooltip-text'), false);
    assert.deepEqual(tooltips(bars.group()), ['3 of 5 days']);
    bars.handle.destroy();
  });

  for (const title of ['', ' '.repeat(3), 3, true, null, ['Smelt'], { text: 'Smelt' }]) {
    it(`writes no tooltip for ${JSON.stringify(title)}`, async () => {
      const bars = await mountStages({ stages: [{ label: 'Smelt', value: 60, title }] });
      assert.deepEqual(tooltips(bars.group()), [null]);
      bars.handle.destroy();
    });
  }

  it('rewrites the title on update, and an update without it removes it from the same bar', async () => {
    const bars = await mountStages({ stages: [{ label: 'Smelt', value: 60, title: 'Day 3' }] });
    const bar = bars.group().querySelector('[role="progressbar"]');
    bars.handle.update({
      ariaLabel: 'Run',
      stages: [{ label: 'Smelt', value: 80, title: 'Day 4' }],
    });
    await settle();
    assert.equal(bar.getAttribute('data-tooltip-text'), 'Day 4');
    bars.handle.update({ ariaLabel: 'Run', stages: [{ label: 'Smelt', value: 80 }] });
    await settle();
    assert.ok(bars.group().querySelector('[role="progressbar"]') === bar, 'the same bar');
    assert.equal(bar.hasAttribute('data-tooltip-text'), false);
    bars.handle.destroy();
  });

  it('keeps the bar’s name and reading whatever its title says', async () => {
    const bars = await mountStages({
      stages: [{ label: 'Smelt', value: 60, valueText: '60%, stage 1 of 1', title: 'Hint' }],
    });
    const bar = bars.group().querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute('aria-label'), 'Smelt');
    assert.equal(bar.getAttribute('aria-valuetext'), '60%, stage 1 of 1');
    assert.equal(bar.hasAttribute('aria-describedby'), false, 'Fabricate writes no description');
    bars.handle.destroy();
  });
});
