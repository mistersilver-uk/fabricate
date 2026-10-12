/** The range bar's pure geometry, `src/ui/svelte/util/rangeBarGeometry.js` (issue 2431). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ariaBoundsFor,
  bandDomain,
  bandIndexAt,
  boundaryPatch,
  boundsFor,
  clampTo,
  markerBandStep,
  markerLayout,
  numeric,
  railSeeds,
  resolveBands,
  snapTo,
  trackMaxOf,
  valueAtClientX,
} from '../../src/ui/svelte/util/rangeBarGeometry.js';

const FIXED = [
  { id: 'slag', name: 'Slag', from: 1, to: 9 },
  { id: 'rough', name: 'Rough', from: 10, to: 17 },
  { id: 'fine', name: 'Fine', from: 18, to: 26 },
];

/** The geometry the strip derives from a band list, in one call. */
function geometryOf(bands, { binding = 'relative', min = null, max = null, step = 1 } = {}) {
  const rows = resolveBands(bands);
  const boundaries = rows ? rows.slice(1).map((row) => row.from) : [];
  const domain = bandDomain({ rows, boundaries, min, max, binding, step });
  const trackMax = trackMaxOf({ rows, binding, max, domain });
  return { rows, domain, trackMax, boundaries, domainMin: domain.min, step };
}

describe('rangeBarGeometry: reading values', () => {
  it('reads an absent value as null, never as 0', () => {
    for (const absent of [null, undefined, '', 'x', NaN]) assert.equal(numeric(absent), null);
    assert.equal(numeric(0), 0, 'an authored zero is kept');
    assert.equal(numeric('8'), 8);
  });
});

describe('rangeBarGeometry: which bands tile', () => {
  it('sorts by value and keeps each band its authored index', () => {
    const rows = resolveBands([
      { id: 'high', from: 10 },
      { id: 'low', from: 1 },
    ]);
    assert.deepEqual(
      rows.map((row) => [row.id, row.index]),
      [
        ['low', 1],
        ['high', 0],
      ]
    );
  });

  it('refuses a gapped, overlapping, repeated or partly unplaced set', () => {
    for (const bands of [
      [
        { from: 1, to: 9 },
        { from: 11, to: 17 },
      ],
      [
        { from: 1, to: 12 },
        { from: 10, to: 17 },
      ],
      [{ from: 4 }, { from: 4 }],
      [{ from: 4 }, { from: null }],
    ]) {
      assert.equal(resolveBands(bands), null, JSON.stringify(bands));
    }
  });
});

describe('rangeBarGeometry: the domain and the bounds', () => {
  it('runs a relative track one tier interval past the last band', () => {
    const { domain, trackMax } = geometryOf([{ from: 2 }, { from: 7 }, { from: 12 }]);
    assert.deepEqual(domain, { min: 2, max: 17 });
    assert.equal(trackMax, 17);
  });

  it('runs a fixed track to one past its inclusive end, and honours caller overrides', () => {
    assert.equal(geometryOf(FIXED, { binding: 'fixed' }).trackMax, 27);
    const overridden = geometryOf(FIXED, { binding: 'fixed', min: 0, max: 30 });
    assert.deepEqual(overridden.domain, { min: 0, max: 30 });
    assert.equal(overridden.trackMax, 30);
  });

  it('bounds each handle one step inside its neighbours and the track, and clamps to them', () => {
    const geometry = geometryOf(FIXED, { binding: 'fixed' });
    assert.deepEqual(boundsFor(0, geometry), [2, 17]);
    assert.deepEqual(boundsFor(1, geometry), [11, 26]);
    assert.equal(clampTo(1, 40, geometry), 26);
    assert.equal(clampTo(1, 0, geometry), 11);
  });

  it('pins an inverted range to the handle value, and announces bounds holding it', () => {
    const geometry = geometryOf([{ from: 0 }, { from: 4 }, { from: 6 }, { from: 20 }], {
      step: 5,
    });
    assert.deepEqual(boundsFor(0, geometry), [4, 4], 'pinned rather than inverted');
    assert.deepEqual(boundsFor(1, geometry), [9, 15]);
    assert.deepEqual(ariaBoundsFor(1, geometry), [6, 15], 'widened to hold the value 6');
  });

  it('snaps to the grid running from the domain min', () => {
    assert.equal(snapTo(8.4, 2, 1), 8);
    assert.equal(snapTo(9, 2, 5), 7);
    assert.equal(snapTo(9, 2, 0), 9, 'a non-positive step snaps to whole units');
  });
});

const DAY = [
  { id: 'dawn', from: 4 },
  { id: 'day', from: 8 },
  { id: 'dusk', from: 17 },
  { id: 'night', from: 21 },
];

describe('rangeBarGeometry: one band, for a binding that allows it', () => {
  it('resolves a single band only when the caller lowers the minimum', () => {
    assert.equal(resolveBands([{ from: 8 }]), null, 'the check bindings need two');
    assert.deepEqual(
      resolveBands([{ id: 'day', from: 8 }], 1).map((row) => row.id),
      ['day']
    );
  });
});

describe('rangeBarGeometry: the band a value falls in, and stepping between bands', () => {
  it('finds the band whose span holds a value, its start inclusive', () => {
    const rows = resolveBands(DAY);
    assert.deepEqual(
      [4, 7.9, 8, 16.5, 17, 27.9].map((value) => bandIndexAt(value, rows)),
      [0, 0, 1, 1, 2, 3]
    );
    assert.equal(bandIndexAt(3, rows), -1, 'before the first band is no band');
  });

  it('steps one band per arrow or page key, jumps with Home and End, and clamps', () => {
    assert.equal(markerBandStep('ArrowRight', 1, 4), 2);
    assert.equal(markerBandStep('ArrowUp', 1, 4), 2);
    assert.equal(markerBandStep('PageUp', 1, 4), 2);
    assert.equal(markerBandStep('ArrowLeft', 1, 4), 0);
    assert.equal(markerBandStep('ArrowDown', 1, 4), 0);
    assert.equal(markerBandStep('PageDown', 1, 4), 0);
    assert.equal(markerBandStep('Home', 2, 4), 0);
    assert.equal(markerBandStep('End', 0, 4), 3);
    assert.equal(markerBandStep('ArrowRight', 3, 4), 3, 'clamped at the last band');
    assert.equal(markerBandStep('ArrowLeft', 0, 4), 0, 'clamped at the first');
    assert.equal(markerBandStep('Enter', 1, 4), null, 'an unrelated key is not swallowed');
    assert.equal(markerBandStep('PageUp', 1, 25, 5), 6, 'a page strides over grid stops');
    assert.equal(markerBandStep('PageDown', 3, 25, 5), 0, 'clamped');
  });
});

describe('rangeBarGeometry: the rail seeds', () => {
  it('seeds each band two steps wide or more at its midpoint, rounded down to the step', () => {
    const rows = resolveBands([...DAY.slice(0, 3), { id: 'gloam', from: 20 }, DAY[3]]);
    assert.deepEqual(
      railSeeds(rows, 28, 1).map(({ band, value }) => [band.id, value]),
      [
        ['dawn', 6],
        ['day', 12],
        ['dusk', 18],
        ['night', 24],
      ],
      'Gloam, one step wide, is left out'
    );
  });

  it('seeds a two-step band at its start plus one step, and measures width in steps', () => {
    const rows = resolveBands([
      { id: 'a', from: 0 },
      { id: 'b', from: 2 },
    ]);
    assert.deepEqual(
      railSeeds(rows, 12, 1).map(({ value }) => value),
      [1, 7]
    );
    assert.deepEqual(
      railSeeds(rows, 12, 2).map(({ value }) => value),
      [6]
    );
  });

  it('skips a seed whose 24px button would overlap the last kept one at a measured width', () => {
    const rows = resolveBands([
      { id: 'a', from: 0 },
      { id: 'b', from: 2 },
      { id: 'c', from: 4 },
      { id: 'd', from: 8 },
    ]);
    const seeds = (pixelsPerUnit) =>
      railSeeds(rows, 24, 1, pixelsPerUnit).map(({ band }) => band.id);
    assert.deepEqual(seeds(0), ['a', 'b', 'c', 'd'], 'an unmeasured track keeps every seed');
    assert.deepEqual(seeds(12), ['a', 'b', 'c', 'd'], 'two hours at 12px are exactly 24px apart');
    assert.deepEqual(seeds(10), ['a', 'c', 'd'], 'at 10px b sits 20px from a and is skipped');
  });

  it('measures each seed against the last one kept, not the last one skipped', () => {
    const rows = resolveBands([
      { id: 'a', from: 0 },
      { id: 'b', from: 2 },
      { id: 'c', from: 4 },
      { id: 'd', from: 6 },
    ]);
    assert.deepEqual(
      railSeeds(rows, 24, 1, 7).map(({ band }) => band.id),
      ['a', 'c', 'd'],
      'c sits 14px from the skipped b but 28px from a'
    );
  });
});

describe('rangeBarGeometry: patches, pointer values and marker layout', () => {
  it('writes the start binding through the authored index of the band beginning there', () => {
    const rows = resolveBands(DAY.toReversed().map((band, index) => ({ ...band, index })));
    assert.deepEqual(boundaryPatch({ binding: 'start', rows, index: 0, next: 9 }), {
      binding: 'start',
      index: 2,
      start: 9,
    });
  });

  it('reads the value under a pointer against a scale, and nothing without one', () => {
    const scale = { left: 10, width: 240, min: 4, span: 24 };
    assert.equal(valueAtClientX(130, scale), 16);
    assert.equal(valueAtClientX(-50, scale), 4, 'clamped to the track');
    assert.equal(valueAtClientX(130, null), null);
  });

  it('lays out fixed markers inside the track and draggable ones at their stop', () => {
    const rows = resolveBands(DAY);
    const geometry = { domainMin: 4, trackMax: 28, step: 1 };
    const layout = markerLayout(
      [
        { id: 'clock', value: 14.5 },
        { id: 'outside', value: 2 },
        { id: 'current', value: 12.5, draggable: true, snap: 'band' },
        { id: 'hour', value: 9.4, draggable: true },
        { id: 'lost', value: null, draggable: true, snap: 'band' },
      ],
      rows,
      geometry,
      String
    );
    assert.deepEqual(
      layout.fixed.map(({ marker, left }) => [marker.id, left]),
      [['clock', 43.75]]
    );
    const [current, hour] = layout.draggable;
    assert.equal(layout.draggable.length, 2, 'a marker with no value is not drawn');
    assert.deepEqual(
      [current.at, current.left, current.stops[current.at].value],
      [1, (8.5 / 24) * 100, 12.5]
    );
    assert.deepEqual(
      current.stops.map(({ now, text, index }) => [now, text, index]),
      [
        [1, '', 0],
        [2, '', 1],
        [3, '', 2],
        [4, '', 3],
      ]
    );
    assert.equal(hour.stops.length, 25, 'one stop per grid value, 4 to 28');
    assert.deepEqual(hour.stops[hour.at], { from: 8.5, value: 9, now: 9, text: '9', index: 1 });
  });

  it("carries each band's authored index onto its stop when the list is authored high-to-low", () => {
    const rows = resolveBands(DAY.toReversed().map((band, index) => ({ ...band, index })));
    const geometry = { domainMin: 4, trackMax: 28, step: 1 };
    const marker = { id: 'c', value: 12.5, draggable: true, snap: 'band' };
    const [view] = markerLayout([marker], rows, geometry, String).draggable;
    assert.deepEqual(
      view.stops.map((stop) => stop.index),
      [3, 2, 1, 0]
    );
  });
});
