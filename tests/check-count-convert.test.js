/** Free-text counting formulas and their staged Convert (issue 2006, N17–N23). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  convertCountingFormula,
  formulaCountsSuccesses,
  parseCountingFormula,
  planCountConversion,
} from '../src/ui/svelte/apps/manager/checks/countFormulaConversion.js';
import { evaluateCheckReadiness } from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';

const OFF = undefined;
const best = (once = false) => ({ kind: 'best', value: null, once });
const worst = { kind: 'worst', value: null };
const from = (value, once) => (once === undefined ? { kind: 'from', value } : { kind: 'from', value, once });

/** A summing crafting check over a fixed DC, as the Studio authors one. */
const summed = (rollFormula, extra = {}) => ({
  rollFormula,
  dc: 12,
  thresholdMode: 'meet',
  dcMode: 'static',
  evaluation: { product: 'sum', direction: 'over', target: { source: 'fixed' } },
  ...extra,
});

const raised = (check, options = { mode: 'simple', activity: 'crafting' }) =>
  evaluateCheckReadiness(check, options).issues.find((issue) => issue.id === 'freeTextCountingFormula');

describe('the formulas that convert, each to the count it maps to exactly', () => {
  // Fixed inputs, never generated: every row is a formula a GM has typed.
  const CONVERTS = [
    ['2d20cs<=@skills.survival.value', { die: 20, base: '2', threshold: '@skills.survival.value', direction: 'under', thresholdMode: 'meet', explode: OFF, cancel: OFF }],
    ['6d10x10cs>=8df1', { die: 10, base: '6', threshold: '8', direction: 'over', thresholdMode: 'meet', explode: best(), cancel: worst }],
    ['6d10xcs>=8', { die: 10, base: '6', threshold: '8', direction: 'over', thresholdMode: 'meet', explode: best(), cancel: OFF }],
    ['2D20CS<=10', { die: 20, base: '2', threshold: '10', direction: 'under', thresholdMode: 'meet', explode: OFF, cancel: OFF }],
    ['(@a.b)d10cs>=8', { die: 10, base: '@a.b', threshold: '8', direction: 'over', thresholdMode: 'meet', explode: OFF, cancel: OFF }],
    ['2d20xo=1cs<=10', { die: 20, base: '2', threshold: '10', direction: 'under', thresholdMode: 'meet', explode: best(true), cancel: OFF }],
    ['3d6cs6', { die: 6, base: '3', threshold: '6', direction: 'over', thresholdMode: 'meet', explode: OFF, cancel: OFF }],
  ];
  for (const [formula, expected] of CONVERTS) {
    it(`${formula} converts`, () => {
      assert.deepEqual(parseCountingFormula(formula), expected);
      assert.equal(planCountConversion(summed(formula), { mode: 'simple' }).convertible, true);
      assert.ok(raised(summed(formula)), 'it is warned about, with the action');
    });
  }
});

describe('the formulas that only warn', () => {
  const WARN_ONLY = [
    ['@poold10cs>=8', 'a bare path swallows its die'],
    ['4d6cf<=2', 'cf counts failures, never cancels'],
    ['6d10cs>=8df<=8', 'the 8 both qualifies and cancels'],
    ['2d20xcs<=10', 'a bare x explodes the worst face under'],
    ['6d10x2>=9cs>=8', 'the explosion-count form'],
    ['2d20cs=10', 'an equality off the extreme face'],
    ['2d20cs<=@x.ydf>=20', 'the path swallows the cancel'],
    ['2d20cs<=10[Survival]', 'a flavor label'],
    ['2d20cs<=10 + 1', 'a second term'],
  ];
  for (const [formula, why] of WARN_ONLY) {
    it(`${formula} warns without Convert (${why})`, () => {
      const issue = raised(summed(formula));
      assert.ok(issue, 'the warning is raised');
      assert.equal(issue.severity, 'warning');
      assert.equal(issue.data.convertible, false, 'with View only');
    });
  }

  it('a sum/under check warns without Convert', () => {
    const under = summed('2d20cs<=10', {
      evaluation: { product: 'sum', direction: 'under', target: { source: 'fixed' } },
    });
    assert.equal(raised(under).data.convertible, false);
  });

  it('1d20 + 5 and 2d20kh1 raise nothing', () => {
    for (const formula of ['1d20 + 5', '2d20kh1', '']) {
      assert.equal(formulaCountsSuccesses(formula), false, formula);
      assert.equal(raised(summed(formula)), undefined, formula);
    }
  });
});

describe('the comparator decides direction and strictness (N17)', () => {
  const side = (formula) => {
    const parsed = parseCountingFormula(formula);
    return parsed && [parsed.direction, parsed.thresholdMode];
  };

  it('maps >= > <= < to over/under meet/exceed', () => {
    assert.deepEqual(side('4d10cs>=8'), ['over', 'meet']);
    assert.deepEqual(side('4d10cs>8'), ['over', 'exceed']);
    assert.deepEqual(side('4d10cs<=3'), ['under', 'meet']);
    assert.deepEqual(side('4d10cs<3'), ['under', 'exceed']);
  });

  it('converts = or a bare threshold only on the die size (over) or 1 (under)', () => {
    assert.deepEqual(side('4d10cs=10'), ['over', 'meet']);
    assert.deepEqual(side('4d10cs10'), ['over', 'meet']);
    assert.deepEqual(side('4d10cs=1'), ['under', 'meet']);
    assert.deepEqual(side('4d10cs1'), ['under', 'meet']);
    for (const formula of ['4d10cs=5', '4d10cs5', '4d10cs=@a.b']) {
      assert.equal(parseCountingFormula(formula), null, formula);
    }
  });
});

describe('explode and cancel convert only on their own side (N18, N19)', () => {
  const faces = (formula) => {
    const parsed = parseCountingFormula(formula);
    return parsed && { explode: parsed.explode, cancel: parsed.cancel };
  };

  it('reads an explosion from a face toward the qualifying side', () => {
    assert.deepEqual(faces('6d10x>=9cs>=8').explode, from(9, false));
    assert.deepEqual(faces('6d10xo>9cs>=8').explode, from(10, true));
    assert.deepEqual(faces('2d20x<=2cs<=10').explode, from(2, false));
    assert.deepEqual(faces('2d20x<3cs<=10').explode, from(2, false));
    assert.deepEqual(faces('2d20x1cs<=10').explode, best());
  });

  it('reads a cancel from a face toward the worst side', () => {
    assert.deepEqual(faces('6d10cs>=8df=1').cancel, worst);
    assert.deepEqual(faces('6d10cs>=8df<=2').cancel, from(2));
    assert.deepEqual(faces('6d10cs>=8df<3').cancel, from(2));
    assert.deepEqual(faces('2d20cs<=10df20').cancel, worst);
    assert.deepEqual(faces('2d20cs<=10df>=19').cancel, from(19));
    assert.deepEqual(faces('2d20cs<=10df>18').cancel, from(19));
  });

  it('never maps cf to cancel', () => {
    for (const formula of ['6d10cs>=8cf1', '6d10cs>=8cf<=2', '4d6cf<=2']) {
      assert.equal(parseCountingFormula(formula), null, formula);
    }
  });

  it('refuses an overlapping cancel, a path-threshold cancel and an opposite-side explosion', () => {
    for (const formula of [
      '6d10cs>=8df<=8',
      '6d10cs>7df<=8',
      '2d20cs<=10df>=10',
      '2d20cs<=@{x.y}df20',
      '6d10cs>=@{a.b}df<=2',
      '6d10x<=2cs>=8',
      '2d20x>=19cs<=10',
      '6d10cs>=8df>=9',
      '2d20x=20cs<=10',
      '6d10x>10cs>=8',
    ]) {
      assert.equal(parseCountingFormula(formula), null, formula);
    }
    assert.ok(parseCountingFormula('6d10cs>8df<=8'), 'an exceed threshold of 8 leaves the 8 to cancel');
  });

  it('needs the i flag: the grammar is case-insensitive (N23)', () => {
    assert.ok(parseCountingFormula('2D20CS<=10'));
    assert.deepEqual(faces('6D10X10CS>=8DF1'), { explode: best(), cancel: worst });
  });
});

describe('Convert stages the count and keeps the summing record (N20, N22)', () => {
  const tiers = [
    { id: 'plain', name: 'Plain', dc: 10, successes: null },
    { id: 'kept', name: 'Kept', dc: 14, successes: 3 },
    { id: 'hard', name: 'Hard', dc: 16 },
  ];

  it('copies the DCs into successes needed, never overwriting an authored count', () => {
    const check = summed('2d20cs<=@skills.survival.value', { tiers });
    const next = convertCountingFormula(check);
    assert.equal(next.evaluation.product, 'count');
    assert.equal(next.evaluation.direction, 'under');
    assert.equal(next.thresholdMode, 'meet');
    assert.deepEqual(
      { die: next.evaluation.pool.die, base: next.evaluation.pool.base, threshold: next.evaluation.pool.threshold, required: next.evaluation.pool.required },
      { die: 20, base: '2', threshold: '@skills.survival.value', required: 12 }
    );
    assert.deepEqual(next.tiers.map((tier) => tier.successes), [10, 3, 16]);
    assert.equal(next.rollFormula, check.rollFormula, 'the formula is kept');
    assert.equal(next.dc, 12, 'the DC is kept');
    assert.deepEqual(next.tiers.map((tier) => tier.dc), [10, 14, 16], 'every tier DC is kept');
    assert.equal(check.evaluation.product, 'sum', 'the input is not mutated');
  });

  it('adds one to every copied DC for an exceed check (ruling R1)', () => {
    const next = convertCountingFormula(summed('6d10cs>=8', { thresholdMode: 'exceed', tiers }));
    assert.equal(next.evaluation.pool.required, 13);
    assert.deepEqual(next.tiers.map((tier) => tier.successes), [11, 3, 17]);
    assert.equal(next.thresholdMode, 'meet', 'the per-die test comes from the comparator');
  });

  it('keeps every other pool field and switches an absent rule off with its faces kept', () => {
    const authored = {
      product: 'sum',
      direction: 'over',
      target: { source: 'fixed' },
      pool: {
        modifierDestination: 'threshold',
        zeroPoolFails: false,
        explode: { enabled: true, faces: { kind: 'from', value: 9 }, once: true },
        cancel: { enabled: false, faces: { kind: 'from', value: 2 } },
      },
    };
    const next = convertCountingFormula(summed('4d10cs>=8df1', { evaluation: authored }));
    assert.equal(next.evaluation.pool.modifierDestination, 'threshold');
    assert.equal(next.evaluation.pool.zeroPoolFails, false);
    assert.deepEqual(next.evaluation.pool.explode, { enabled: false, faces: { kind: 'from', value: 9 }, once: true });
    assert.deepEqual(next.evaluation.pool.cancel, { enabled: true, faces: { kind: 'worst', value: 2 } });
  });

  it('offers no action for a copied count outside 0–20 or not whole, and names it', () => {
    assert.deepEqual(planCountConversion(summed('2d20cs<=10', { dc: 25 }), { mode: 'simple' }), {
      convertible: false,
      outOfRange: 25,
    });
    assert.deepEqual(
      planCountConversion(summed('2d20cs<=10', { dc: 20, thresholdMode: 'exceed' }), { mode: 'simple' }),
      { convertible: false, outOfRange: 21 },
      'DC 20 on an exceed check becomes 21'
    );
    assert.equal(planCountConversion(summed('2d20cs<=10', { dc: 12.5 }), { mode: 'simple' }).convertible, false);
    const tierOut = summed('2d20cs<=10', { tiers: [{ id: 'x', name: 'X', dc: -1, successes: null }] });
    assert.deepEqual(planCountConversion(tierOut, { mode: 'simple' }), { convertible: false, outOfRange: -1 });
    const authoredTier = summed('2d20cs<=10', { tiers: [{ id: 'x', name: 'X', dc: 40, successes: 2 }] });
    assert.equal(planCountConversion(authoredTier, { mode: 'simple' }).convertible, true, 'a kept count is not copied');
  });

  it('offers no action for a sum/under, character-value, progressive or dynamic-exceed check', () => {
    const under = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
    const attribute = { product: 'sum', direction: 'over', target: { source: 'attribute', expression: '@a' } };
    for (const [check, mode] of [
      [summed('2d20cs<=10', { evaluation: under }), 'simple'],
      [summed('2d20cs<=10', { evaluation: attribute }), 'simple'],
      [summed('2d20cs<=10'), 'progressive'],
      [summed('2d20cs<=10', { dcMode: 'dynamic', thresholdMode: 'exceed' }), 'simple'],
    ]) {
      assert.equal(planCountConversion(check, { mode }).convertible, false, JSON.stringify(check));
    }
    assert.deepEqual(planCountConversion(summed('2d20cs<=10', { dcMode: 'dynamic' }), { mode: 'routed' }), {
      convertible: true,
      dynamic: true,
    });
  });

  it('names the components and tasks that override the DC but not the successes needed', () => {
    const components = [
      { id: 'a', name: 'Iron', salvage: { enabled: true, dcOverride: 14, successesOverride: null } },
      { id: 'b', name: 'Copper', salvage: { enabled: true, dcOverride: 14, successesOverride: 2 } },
      { id: 'c', name: 'Tin', salvage: { enabled: false, dcOverride: 14 } },
      { id: 'd', name: 'Lead', salvage: { enabled: true, dcOverride: null } },
    ];
    const plan = planCountConversion(summed('4d10cs>=8'), {
      mode: 'simple',
      activity: 'salvage',
      records: { components },
    });
    assert.deepEqual(plan, { convertible: true, overrides: 'Iron' });
    const tasks = [
      { id: 't1', name: 'Pan for gold', resolutionMode: 'routed', dcOverride: 9 },
      { id: 't2', name: 'Forage', resolutionMode: 'progressive', dcOverride: 9 },
    ];
    assert.equal(
      planCountConversion(summed('4d10cs>=8'), { mode: 'routed', activity: 'gathering', records: { gatheringTasks: tasks } }).overrides,
      'Pan for gold'
    );
  });

  it('leaves a formula that does not convert untouched', () => {
    const check = summed('4d6cf<=2');
    assert.equal(convertCountingFormula(check), check);
  });
});
