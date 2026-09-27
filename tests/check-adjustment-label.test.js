/** Issue 2005 — adjustment labels and the parser the Studio's formatted Steppers type through. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MULTIPLIER_STOPS,
  formatCheckAdjustment,
  parseCheckAdjustment,
} from '../src/ui/svelte/apps/manager/checks/checkAdjustmentLabel.js';

describe('formatCheckAdjustment', () => {
  it('signs an added adjustment with a true minus', () => {
    assert.deepEqual(
      [5, -2, 0, 0.5].map((value) => formatCheckAdjustment('add', value)),
      ['+5', '−2', '0', '+0.5']
    );
  });

  it('names the listed multipliers and writes an off-list one as a decimal', () => {
    assert.deepEqual(
      [2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 0.7, 0.3].map((value) =>
        formatCheckAdjustment('multiply', value)
      ),
      ['×2', '×1', '×½', '×⅓', '×¼', '×⅕', '×0.7', '×0.3']
    );
  });

  it('labels nothing for an absent or non-finite value', () => {
    for (const value of [null, undefined, '', Number.NaN, Infinity]) {
      assert.equal(formatCheckAdjustment('add', value), '');
      assert.equal(formatCheckAdjustment('multiply', value), '');
    }
  });
});

describe('parseCheckAdjustment', () => {
  it('round-trips every stop label and every added label', () => {
    for (const stop of MULTIPLIER_STOPS) {
      const label = formatCheckAdjustment('multiply', stop);
      assert.ok(Math.abs(parseCheckAdjustment('multiply', label) - stop) < 1e-9, label);
    }
    for (const value of [-10, -2, 0, 3, 0.5]) {
      assert.equal(parseCheckAdjustment('add', formatCheckAdjustment('add', value)), value);
    }
  });

  it('accepts the plain forms a GM types', () => {
    const cases = [
      ['multiply', '½', 0.5],
      ['multiply', '1/2', 0.5],
      ['multiply', '0.5', 0.5],
      ['multiply', 'x0.5', 0.5],
      ['multiply', ' × 2 ', 2],
      ['add', '-2', -2],
      ['add', '+4', 4],
      ['add', '7', 7],
      ['add', '0', 0],
    ];
    for (const [kind, text, value] of cases) assert.equal(parseCheckAdjustment(kind, text), value, text);
  });

  it('reads nonsense, a multiplier not above zero and a zero denominator as NaN', () => {
    for (const [kind, text] of [
      ['add', 'abc'],
      ['add', ''],
      ['add', '1d4'],
      ['multiply', '-0.5'],
      ['multiply', '0'],
      ['multiply', '0/3'],
      ['multiply', '×0'],
      ['multiply', '1/0'],
      ['multiply', 'Otherwise'],
    ]) {
      assert.ok(Number.isNaN(parseCheckAdjustment(kind, text)), `${kind} ${text}`);
    }
  });
});
