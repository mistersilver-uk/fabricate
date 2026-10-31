/**
 * The published `FillBar`'s `neutralBand` (issue 2863) on Fabricate's real Svelte runtime, through
 * a fresh seam registered with the adapter's own table: while `origin` is `center`, a reading no
 * further from zero than the band, its edge included, draws neutral and one beyond it by sign;
 * zero is neutral at any band; a band that is not a finite number of zero or more reads 0 and
 * draws by sign alone, as before; `start` never reads it; and an `update` rewrites and removes it.
 * Limit: happy-dom paints nothing, so the inks and the forced-colours fills are
 * `fill-bar-neutral-band-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, mountEntry } = publishedEntrySeam('fabricate-published-fill-bar-band-');

/** The authored classes of a node, without Svelte's scope hash. */
const classesOf = (node) =>
  [...node.classList].filter((name) => !name.startsWith('svelte-')).slice(1);

/** A bar mounted with `props`: its handle, its track's band class, and its fill as drawn now. */
async function mountBar(props) {
  const { target, handle } = mountEntry('FillBar', props);
  await settle();
  const fill = () => target.querySelector('.fab-fill-bar-fill');
  return {
    handle,
    banded: () => target.querySelector('.fab-fill-bar').classList.contains('has-neutral-band'),
    classes: () => classesOf(fill()),
    box: () => [fill().style.left, fill().style.width],
  };
}

describe('the published FillBar describes neutralBand', () => {
  it('lists neutralBand after origin, as an optional data key', () => {
    const { props } = ui().describe('FillBar');
    assert.deepEqual(Object.keys(props), [
      'value',
      'tone',
      'color',
      'shares',
      'origin',
      'neutralBand',
      'density',
    ]);
    assert.deepEqual(props.neutralBand, { kind: 'data', required: false });
  });
});

describe('the published FillBar, neutralBand', () => {
  for (const [value, classes, box] of [
    [10, ['is-within-band'], ['50%', '5%']],
    [20, ['is-within-band'], ['50%', '10%']],
    [-20, ['is-within-band'], ['40%', '10%']],
    [-5, ['is-within-band'], ['47.5%', '2.5%']],
    [0, ['is-within-band'], ['50%', '0%']],
    [20.5, ['is-positive'], ['50%', '10.25%']],
    [21, ['is-positive'], ['50%', '10.5%']],
    [-21, ['is-negative'], ['39.5%', '10.5%']],
    [100, ['is-positive'], ['50%', '50%']],
    [-400, ['is-negative'], ['0%', '50%']],
  ]) {
    it(`draws ${value} at a band of 20 as ${classes.join(' ')}, on its own side`, async () => {
      const bar = await mountBar({ value, origin: 'center', neutralBand: 20 });
      assert.ok(bar.banded(), 'the track states its band');
      assert.deepEqual(bar.classes(), classes);
      assert.deepEqual(bar.box(), box);
      bar.handle.destroy();
    });
  }

  for (const band of [100, 250, Number.MAX_VALUE]) {
    it(`draws every reading neutral at a band of ${band}`, async () => {
      for (const value of [100, -100, 1]) {
        const bar = await mountBar({ value, origin: 'center', neutralBand: band });
        assert.deepEqual(bar.classes(), ['is-within-band'], String(value));
        bar.handle.destroy();
      }
    });
  }

  for (const band of [0, -0, -5, NaN, Infinity, -Infinity, '20', null, true, [20], { band: 20 }]) {
    it(`reads ${String(band)} as no band, drawing by sign alone as before`, async () => {
      for (const [value, classes] of [
        [10, ['is-positive']],
        [-10, ['is-negative']],
        [0, []],
      ]) {
        const bar = await mountBar({ value, origin: 'center', neutralBand: band });
        assert.equal(bar.banded(), false, `${String(band)} states no band`);
        assert.deepEqual(bar.classes(), classes, String(value));
        bar.handle.destroy();
      }
    });
  }

  it('is not read while origin is start, or any value but center', async () => {
    for (const origin of [undefined, 'start', 'Center', 'centre']) {
      const bar = await mountBar({ value: 10, origin, neutralBand: 20, tone: 'warning' });
      assert.equal(bar.banded(), false);
      assert.deepEqual(bar.classes(), ['is-warning'], String(origin));
      assert.deepEqual(bar.box(), ['', '10%']);
      bar.handle.destroy();
    }
  });

  it('rewrites the band on update, and an update without it draws by sign again', async () => {
    const bar = await mountBar({ value: 15, origin: 'center', neutralBand: 20 });
    assert.deepEqual(bar.classes(), ['is-within-band']);
    assert.equal(bar.handle.update({ value: 15, origin: 'center', neutralBand: 10 }), true);
    await settle();
    assert.deepEqual(bar.classes(), ['is-positive'], 'beyond the narrower band');
    assert.ok(bar.banded());
    assert.equal(bar.handle.update({ value: 15, origin: 'center' }), true);
    await settle();
    assert.deepEqual(bar.classes(), ['is-positive']);
    assert.equal(bar.banded(), false);
    bar.handle.destroy();
  });

  it('writes no tone attribute on a banded bar, as on any centred bar', async () => {
    const { target, handle } = mountEntry('FillBar', {
      value: 5,
      origin: 'center',
      neutralBand: 20,
      tone: 'danger',
    });
    await settle();
    const track = target.querySelector('.fab-fill-bar');
    assert.equal(track.dataset.fillBarTone, undefined);
    assert.equal(track.getAttribute('role'), null, 'and it stays decorative');
    handle.destroy();
  });
});
