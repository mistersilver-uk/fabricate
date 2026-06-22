import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiceGroups,
  expressionRange,
  rangesOverlap,
  findRangeConflicts,
} from '../src/utils/craftingCheckExpression.js';

describe('parseDiceGroups', () => {
  it('lists each dice group in order, ignoring flat modifiers', () => {
    assert.deepEqual(
      parseDiceGroups('2d6+1d4+3').map((g) => g.raw),
      ['2d6', '1d4']
    );
  });

  it('treats a bare dN as a single die', () => {
    assert.deepEqual(parseDiceGroups('d20+5'), [{ raw: '1d20', count: 1, sides: 20 }]);
  });

  it('returns an empty list when there are no dice', () => {
    assert.deepEqual(parseDiceGroups('5'), []);
    assert.deepEqual(parseDiceGroups(''), []);
    assert.deepEqual(parseDiceGroups(null), []);
  });
});

describe('expressionRange', () => {
  it('bounds a single die', () => {
    assert.deepEqual(expressionRange('1d20'), { min: 1, max: 20, valid: true });
  });

  it('adds flat modifiers to both bounds', () => {
    assert.deepEqual(expressionRange('2d6+3'), { min: 5, max: 15, valid: true });
  });

  it('handles subtraction of a constant and of dice', () => {
    assert.deepEqual(expressionRange('d20-2'), { min: -1, max: 18, valid: true });
    assert.deepEqual(expressionRange('2d6-1d4'), { min: -2, max: 11, valid: true });
  });

  it('sums multiple dice groups', () => {
    assert.deepEqual(expressionRange('2d6+1d4'), { min: 3, max: 16, valid: true });
  });

  it('flags unparseable or empty expressions as invalid', () => {
    assert.equal(expressionRange('abc').valid, false);
    assert.equal(expressionRange('1d20 oops').valid, false);
    assert.equal(expressionRange('1d20+').valid, false);
    assert.equal(expressionRange('').valid, false);
  });
});

describe('rangesOverlap', () => {
  it('detects intersecting inclusive ranges', () => {
    assert.equal(rangesOverlap({ start: 1, end: 10 }, { start: 10, end: 20 }), true);
    assert.equal(rangesOverlap({ start: 1, end: 10 }, { start: 11, end: 20 }), false);
  });
});

describe('findRangeConflicts', () => {
  it('returns no conflicts for adjacent, non-overlapping ranges', () => {
    const { overlapping, invalid } = findRangeConflicts([
      { start: 1, end: 10 },
      { start: 11, end: 20 },
    ]);
    assert.equal(overlapping.size, 0);
    assert.equal(invalid.size, 0);
  });

  it('marks both members of an overlapping pair', () => {
    const { overlapping } = findRangeConflicts([
      { start: 1, end: 10 },
      { start: 5, end: 15 },
      { start: 16, end: 20 },
    ]);
    assert.deepEqual([...overlapping].sort(), [0, 1]);
  });

  it('treats start greater than end as invalid and skips it for overlap', () => {
    const { overlapping, invalid } = findRangeConflicts([
      { start: 10, end: 5 },
      { start: 1, end: 20 },
    ]);
    assert.deepEqual([...invalid], [0]);
    assert.equal(overlapping.size, 0);
  });
});
