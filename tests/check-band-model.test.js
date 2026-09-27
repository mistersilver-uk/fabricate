/** Issue 2005 — the read-only band pictures, drawn from the runtime's own grading. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  bandsAreEditable,
  describeBandScale,
  describeBandsUnavailable,
  buildPassFailBands,
  buildRoutedBands,
  describeBandRange,
  resolvePreviewTarget,
} from '../src/ui/svelte/apps/manager/checks/checkBandModel.js';

const fallback = (_key, text) => text;
const NAMES = { success: 'Success', failure: 'Failure' };
const UNDER_FIXED = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
const attribute = (direction, adjustmentKind = 'add', baseAdjustment = null) => ({
  product: 'sum',
  direction,
  target: { source: 'attribute', expression: '@skills.craft.value', adjustmentKind, baseAdjustment },
});
const LADDER = [
  { id: 'extreme', name: 'Extreme', success: true, dc: 0, adjustment: 0.2 },
  { id: 'hard', name: 'Hard', success: true, dc: 0, adjustment: 0.5 },
  { id: 'regular', name: 'Regular', success: true, dc: 0, adjustment: 1 },
  { id: 'otherwise', name: 'Otherwise', success: false, dc: 0, adjustment: null },
];

const summary = (bands) =>
  bands.map((band) => `${band.name}: ${describeBandRange(band, fallback)}`).join('; ');

describe('bandsAreEditable', () => {
  it('keeps handles only for summed roll-over against a fixed DC', () => {
    assert.equal(bandsAreEditable(undefined), true);
    assert.equal(bandsAreEditable({ product: 'sum', direction: 'over' }), true);
    assert.equal(bandsAreEditable(UNDER_FIXED), false);
    assert.equal(bandsAreEditable(attribute('over')), false);
  });
});

describe('buildPassFailBands', () => {
  it('ends an inclusive under success at the target and a strict one a step below', () => {
    const meet = buildPassFailBands({ evaluation: UNDER_FIXED, comparison: 'meet', target: 12, names: NAMES });
    assert.equal(summary(meet), 'Success: 12 or under; Failure: 13 or over');
    const exceed = buildPassFailBands({ evaluation: UNDER_FIXED, comparison: 'exceed', target: 12, names: NAMES });
    assert.equal(summary(exceed), 'Success: 11 or under; Failure: 12 or over');
  });

  it('puts an over success at the high end', () => {
    const bands = buildPassFailBands({ evaluation: attribute('over'), comparison: 'meet', target: 14, names: NAMES });
    assert.equal(summary(bands), 'Failure: 13 or under; Success: 14 or over');
    assert.ok(bands[0].from < bands[1].from, 'value order');
  });

  it('widens a supplied reachable range to show the target', () => {
    const bands = buildPassFailBands({ evaluation: UNDER_FIXED, comparison: 'meet', target: 12, min: 3, max: 18, names: NAMES });
    assert.deepEqual([bands[0].from, bands.at(-1).to], [3, 18]);
  });
});

describe('buildRoutedBands', () => {
  it('draws the percentile ladder with Otherwise taking the remainder', () => {
    const bands = buildRoutedBands({
      evaluation: attribute('under', 'multiply'),
      comparison: 'meet',
      anchor: 55,
      type: 'relative',
      outcomes: LADDER,
    });
    assert.equal(summary(bands), 'Extreme: 11 or under; Hard: 12–27; Regular: 28–55; Otherwise: 56 or over');
    assert.deepEqual(
      bands.map((band) => band.index),
      [0, 1, 2, 3],
      'each band names its authored row'
    );
  });

  it('moves every edge a step toward the better end when strict', () => {
    const bands = buildRoutedBands({
      evaluation: attribute('under', 'multiply'),
      comparison: 'exceed',
      anchor: 55,
      type: 'relative',
      outcomes: LADDER,
    });
    assert.equal(summary(bands), 'Extreme: 10 or under; Hard: 11–26; Regular: 27–54; Otherwise: 55 or over');
  });

  it('floors a multiplied threshold', () => {
    const bands = buildRoutedBands({
      evaluation: attribute('under', 'multiply'),
      comparison: 'meet',
      anchor: 9,
      type: 'relative',
      outcomes: [LADDER[1], LADDER[3]],
    });
    assert.equal(summary(bands), 'Hard: 4 or under; Otherwise: 5 or over');
  });

  it('subtracts a benefit-signed offset under and clamps into the least demanding tier', () => {
    const bands = buildRoutedBands({
      evaluation: UNDER_FIXED,
      comparison: 'meet',
      anchor: 12,
      type: 'relative',
      outcomes: [
        { id: 'superb', name: 'Superb', success: true, dc: 5 },
        { id: 'fine', name: 'Fine', success: true, dc: 0 },
        { id: 'poor', name: 'Poor', success: false, dc: -20 },
      ],
    });
    assert.equal(summary(bands), 'Superb: 7 or under; Fine: 8–12; Poor: 13 or over');
  });

  it('draws a fixed-range check as authored', () => {
    const bands = buildRoutedBands({
      evaluation: UNDER_FIXED,
      comparison: 'meet',
      anchor: 0,
      type: 'fixed',
      outcomes: [
        { id: 'b', name: 'B', start: 6, end: 10 },
        { id: 'a', name: 'A', start: 1, end: 5 },
      ],
    });
    assert.equal(summary(bands), 'A: 5 or under; B: 6 or over');
    assert.deepEqual(bands.map((band) => band.index), [1, 0]);
  });

  it('draws nothing with no tiers', () => {
    assert.deepEqual(
      buildRoutedBands({ evaluation: UNDER_FIXED, anchor: 10, type: 'relative', outcomes: [] }),
      []
    );
  });
});

describe('resolvePreviewTarget', () => {
  const character = { name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } };

  it('keeps a fixed anchor and needs no character', () => {
    assert.deepEqual(resolvePreviewTarget({ evaluation: UNDER_FIXED, anchor: 12 }), {
      state: 'ok',
      target: 12,
      value: null,
    });
  });

  it('asks for a character before reading a path, and names a missing one', () => {
    assert.deepEqual(resolvePreviewTarget({ evaluation: attribute('under'), anchor: 0 }), {
      state: 'needs-actor',
    });
    assert.deepEqual(
      resolvePreviewTarget({
        evaluation: attribute('under'),
        anchor: 0,
        character: { name: 'Vosk', rollData: {} },
      }),
      { state: 'unresolved', reason: 'unresolved-path' }
    );
  });

  it('applies the record adjustment, else the base, and floors', () => {
    const evaluation = attribute('under', 'multiply', 0.5);
    assert.deepEqual(resolvePreviewTarget({ evaluation, anchor: 0, character }), {
      state: 'ok',
      target: 27,
      value: 55,
    });
    assert.equal(resolvePreviewTarget({ evaluation, anchor: 0, adjustment: 0.2, character }).target, 11);
  });

  it('resolves an actor-free literal without a character', () => {
    const evaluation = { ...attribute('under', 'add', -2), target: { source: 'attribute', expression: '14', baseAdjustment: -2 } };
    assert.equal(resolvePreviewTarget({ evaluation, anchor: 0 }).target, 12);
  });
});

describe('the read-only strip copy', () => {
  it('states the target and where success sits, in the plain comparison word', () => {
    assert.equal(
      describeBandScale({ direction: 'under', comparison: 'exceed', target: 12, cmp: 'under' }, fallback),
      'Target 12. Success sits at the low end: a total under 12 succeeds.'
    );
    assert.equal(
      describeBandScale(
        { direction: 'under', comparison: 'meet', target: 27, source: 'Idrin 55, Hard ×½', cmp: 'at or under' },
        fallback
      ),
      'Target 27 (Idrin 55, Hard ×½). Success sits at the low end: a total at or under 27 succeeds.'
    );
    assert.equal(
      describeBandScale({ direction: 'over', comparison: 'meet', target: 14, source: 'Idrin 14' }, fallback),
      'Target 14 (Idrin 14). Success sits at the high end: a total of 14 or more succeeds.'
    );
  });

  it('names the missing actor or value instead of charting a zero', () => {
    assert.match(describeBandsUnavailable({ state: 'needs-actor' }, {}, fallback), /Choose a character/);
    assert.equal(
      describeBandsUnavailable(
        { state: 'unresolved', reason: 'unresolved-path' },
        { character: { name: 'Vosk' }, expression: '@skills.craft.value' },
        fallback
      ),
      'Vosk is missing a value this check reads (@skills.craft.value), so it cannot resolve for them.'
    );
  });
});
