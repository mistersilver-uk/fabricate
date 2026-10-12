/** The range bar's pure geometry, `src/ui/svelte/util/rangeBarGeometry.js` (issue 2431). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ariaBoundsFor,
  bandDomain,
  boundsFor,
  clampTo,
  numeric,
  resolveBands,
  snapTo,
  trackMaxOf,
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
