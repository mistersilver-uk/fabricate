import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiceGroups,
  isPlainDieTerm,
  parsePlainDiceGroups,
  hasPlainD20,
  applyD20Advantage,
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

describe('isPlainDieTerm', () => {
  it('classifies plain, unmodified NdS terms as crit-eligible (bare dN === 1dN)', () => {
    assert.equal(isPlainDieTerm('1d20'), true);
    assert.equal(isPlainDieTerm('2d6'), true);
    assert.equal(isPlainDieTerm('d20'), true);
  });

  it('classifies any modified pool (keep/drop/explode/reroll/min/max) as ineligible', () => {
    for (const term of [
      '2d20kh1',
      '4d6dl1',
      '1d6x',
      '2d10r1',
      '2d6min2',
      '2d6max5',
      'min',
      'max',
    ]) {
      assert.equal(isPlainDieTerm(term), false, `${term} must be non-plain`);
    }
  });

  it('is a pure function with no side effects (stable across repeated calls)', () => {
    assert.equal(typeof isPlainDieTerm, 'function');
    const before = isPlainDieTerm('2d20kh1');
    assert.equal(isPlainDieTerm('2d20kh1'), before);
    assert.equal(isPlainDieTerm('2d20kh1'), false);
    // Pure: classifying one term never alters the result for another.
    assert.equal(isPlainDieTerm('1d20'), true);
    assert.equal(isPlainDieTerm('2d20kh1'), false);
  });
});

describe('parsePlainDiceGroups', () => {
  it('lists only the plain dice groups, in canonical NdS form', () => {
    assert.deepEqual(
      parsePlainDiceGroups('2d6+1d4+3').map((g) => g.raw),
      ['2d6', '1d4']
    );
    assert.deepEqual(parsePlainDiceGroups('d20+5'), [{ raw: '1d20', count: 1, sides: 20 }]);
  });

  it('excludes modified pools but keeps the plain dice alongside them', () => {
    assert.deepEqual(
      parsePlainDiceGroups('2d20kh1+1d4').map((g) => g.raw),
      ['1d4']
    );
    assert.deepEqual(parsePlainDiceGroups('4d6dl1'), []);
    assert.deepEqual(parsePlainDiceGroups('1d6x'), []);
    assert.deepEqual(parsePlainDiceGroups('2d10r1'), []);
  });

  it('keeps a plain die that carries bracketed flavor text', () => {
    assert.deepEqual(
      parsePlainDiceGroups('2d6[fire]+1d4').map((g) => g.raw),
      ['2d6', '1d4']
    );
  });
});

describe('hasPlainD20', () => {
  it('is true for a plain 1d20 (and bare d20)', () => {
    assert.equal(hasPlainD20('1d20+3'), true);
    assert.equal(hasPlainD20('d20'), true);
    assert.equal(hasPlainD20('@prof + 1d20'), true);
  });

  it('is false for non-plain-d20 formulas', () => {
    assert.equal(hasPlainD20('2d20'), false);
    assert.equal(hasPlainD20('d200'), false);
    assert.equal(hasPlainD20('2d20kh1'), false);
    assert.equal(hasPlainD20('2d6+1'), false);
    assert.equal(hasPlainD20(''), false);
    assert.equal(hasPlainD20(null), false);
  });
});

describe('applyD20Advantage', () => {
  it('rewrites the first plain d20 to a keep-highest/lowest pool', () => {
    assert.equal(applyD20Advantage('1d20 + 3', 'advantage'), '2d20kh1 + 3');
    assert.equal(applyD20Advantage('1d20 + 3', 'disadvantage'), '2d20kl1 + 3');
  });

  it('handles a bare d20 and a leading actor reference', () => {
    assert.equal(applyD20Advantage('d20', 'advantage'), '2d20kh1');
    assert.equal(applyD20Advantage('@prof + 1d20', 'advantage'), '@prof + 2d20kh1');
  });

  it('handles an uppercase D20', () => {
    assert.equal(hasPlainD20('1D20'), true);
    assert.equal(applyD20Advantage('1D20 + 3', 'advantage'), '2d20kh1 + 3');
    assert.equal(applyD20Advantage('D20', 'disadvantage'), '2d20kl1');
  });

  it('rewrites only the FIRST plain d20', () => {
    assert.equal(applyD20Advantage('1d20 + 1d20', 'advantage'), '2d20kh1 + 1d20');
  });

  it('leaves non-plain-d20 formulas and non-adv modes unchanged', () => {
    assert.equal(applyD20Advantage('2d6+1', 'advantage'), '2d6+1');
    assert.equal(applyD20Advantage('2d20', 'advantage'), '2d20');
    assert.equal(applyD20Advantage('1d20 + 3', 'normal'), '1d20 + 3');
    assert.equal(applyD20Advantage('1d20 + 3', 'anything'), '1d20 + 3');
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
