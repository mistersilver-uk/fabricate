import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiceGroups,
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

  it('ignores actor references that cannot be resolved ahead of time', () => {
    assert.deepEqual(
      parseDiceGroups('1d20+@attributes.con.mod').map((g) => g.raw),
      ['1d20']
    );
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
