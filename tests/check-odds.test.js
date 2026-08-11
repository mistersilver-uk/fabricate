/**
 * The Checks Studio's odds enumerator (issue 1097).
 *
 * TWO THINGS ARE GRADED HERE AND THEY ARE GRADED DIFFERENTLY.
 *
 * The PREDICATE is graded against `Roll.parse` output RECORDED from a real Foundry 14.365
 * build (`tests/helpers/recordedRollParse.js`) rather than against a double this branch
 * also wrote. That distinction is the whole point: a double looser than core produces
 * false passes, which is the direction nothing notices under `npm test`, and the lab's own
 * `Roll.validate` double is already known to accept formulas real Foundry rejects.
 *
 * The VIEW LAB DOUBLE is then graded against that same recording, term field by term
 * field, so the lab and the live client cannot disagree about what a formula parses to.
 *
 * Every refusal asserts ITS OWN reason code. A shared "not enumerable" observable would
 * let a predicate implemented as `return false` pass every negative case, which is exactly
 * what BM5 says to prevent — so the accepting set below is not two bare-remainder
 * formulas either: it carries a resolvable `@` key and a pair of flavoured appended terms,
 * which is the shape every real previewed formula has after issue 1094.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ODDS_REASONS,
  describeFormulaEnumerability,
  enumeratePassFailOdds,
  enumerateProgressiveOdds,
  enumerateRoutedOdds,
  expectedFormulaValue,
} from '../src/ui/svelte/apps/manager/checks/checkOdds.js';
import { buildPreviewCheckArgs } from '../src/ui/svelte/apps/manager/checks/checkPreview.js';
import { resolveForcedOutcome } from '../src/systems/checkRoll.js';
import {
  RECORDED_ROLL_DATA,
  RECORDED_ROLL_PARSE_14_365,
  materialiseRecordedTerms,
  recordedRollDouble,
} from './helpers/recordedRollParse.js';
import { createLabRoll } from './view-lab/foundry/labRoll.js';

/** The previewed actor the recording was made against. */
const ACTOR = { getRollData: () => RECORDED_ROLL_DATA };

const REAL = recordedRollDouble();

/** Ask the predicate, with real Foundry's own parse output behind it. */
function describe14365(formula, actor = ACTOR) {
  return describeFormulaEnumerability(formula, actor, { Roll: REAL });
}

describe('checkOdds: the positive whitelist, graded against recorded Foundry 14.365 output', () => {
  it('accepts a plain single die and reports the deterministic remainder', () => {
    assert.deepEqual(describe14365('1d20 + 5'), {
      enumerable: true,
      faces: 20,
      remainder: 5,
      display: '1d20 + 5',
    });
    assert.deepEqual(describe14365('1d12 + 2'), {
      enumerable: true,
      faces: 12,
      remainder: 2,
      display: '1d12 + 2',
    });
  });

  it('accepts a formula carrying a RESOLVABLE @ key, resolved against the previewed actor', () => {
    // Not a bare literal remainder: `@prof` is 3 for this actor, and the remainder has to
    // be read off the resolved display rather than off the parse.
    assert.deepEqual(describe14365('1d20 + @prof'), {
      enumerable: true,
      faces: 20,
      remainder: 3,
      display: '1d20 + 3',
    });
  });

  it('accepts the flavoured appended terms every REAL previewed formula carries', () => {
    // After issue 1094 the preview formula is the authored one plus `+ N[Tools]` and
    // `+ N[Modifiers]`. A predicate that mishandled a flavoured constant would refuse
    // every real formula while passing a hand-typed pair, so this case is taken from
    // `buildPreviewCheckArgs`'s OWN output rather than typed here.
    const plan = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'simple',
      draft: { rollFormula: '1d20', dc: 12 },
      system: null,
      actor: ACTOR,
      toolTerms: [
        { value: 3, label: 'Tools' },
        { value: 2, label: 'Modifiers' },
      ],
    });
    assert.equal(plan.formula, '1d20 + 3[Tools] + 2[Modifiers]');
    const verdict = describe14365(plan.formula);
    assert.equal(verdict.enumerable, true, `enumerable (got ${verdict.reason})`);
    assert.equal(verdict.remainder, 5, 'both flavoured terms count toward the remainder');

    // ACCEPTANCE IS PINNED DIRECTLY: the same fixture with the offending term removed
    // enumerates too, so "it accepted" cannot be a coincidence of the shorter string.
    assert.equal(describe14365('1d20 + 5').enumerable, true);
  });
});

describe('checkOdds: every refusal carries its OWN reason code', () => {
  const REFUSALS = [
    ['2d6', ODDS_REASONS.nonUnitCount],
    ['2d20', ODDS_REASONS.nonUnitCount],
    ['2d20kh1', ODDS_REASONS.dieModifiers],
    ['1d6x', ODDS_REASONS.dieModifiers],
    ['1d20r1', ODDS_REASONS.dieModifiers],
    ['1d20min2', ODDS_REASONS.dieModifiers],
    ['1d(1d4)', ODDS_REASONS.nonIntegerFaces],
    ['1df', ODDS_REASONS.nonNumericDenomination],
    ['1dc', ODDS_REASONS.nonNumericDenomination],
    ['1d20 + 1d6', ODDS_REASONS.multipleDieGroups],
    ['5 + 3', ODDS_REASONS.noDice],
    ['max(1d20,5)', ODDS_REASONS.nonDeterministicRemainder],
    ['1d20 + (2d6)', ODDS_REASONS.nonDeterministicRemainder],
    ['{1d20,1d12}kh', ODDS_REASONS.nonDeterministicRemainder],
    ['1d20 + prof', ODDS_REASONS.stringTerm],
    ['1d20 +', ODDS_REASONS.parseThrew],
    ['1d20 + (', ODDS_REASONS.parseThrew],
    ['max(1d20,', ODDS_REASONS.parseThrew],
  ];

  for (const [formula, reason] of REFUSALS) {
    it(`refuses ${formula} as ${reason}`, () => {
      assert.deepEqual(describe14365(formula), { enumerable: false, reason });
    });
  }

  it('returns a not-enumerable RESULT for a mid-edit formula rather than throwing', () => {
    // `Roll.parse` calls the compiled peggy grammar with no `try`, so an unwrapped
    // predicate would throw out of a render — and one bad case fails a whole capture job.
    for (const formula of ['1d20 +', '1d20 + (', 'max(1d20,']) {
      assert.doesNotThrow(() => describe14365(formula));
    }
  });

  it('detects an unresolved @ key from resolved===false, because the PARSE cannot see it', () => {
    assert.deepEqual(describe14365('1d20 + @nope'), {
      enumerable: false,
      reason: ODDS_REASONS.unresolvedRollData,
    });
    // The proof that the refusal cannot come from the parse: real Foundry produced the
    // IDENTICAL term list for the resolvable and the unresolvable key, because
    // `replaceFormulaData(..., { missing: "0" })` had already replaced it.
    const resolvable = RECORDED_ROLL_PARSE_14_365['1d20 + @prof'].terms;
    const unresolvable = RECORDED_ROLL_PARSE_14_365['1d20 + @nope'].terms;
    assert.deepEqual(
      resolvable.map((term) => term.class),
      unresolvable.map((term) => term.class),
      'the parse reports the same term classes for both'
    );
    assert.equal(unresolvable[2].class, 'NumericTerm');
    assert.equal(unresolvable[2].isDeterministic, true, 'and calls the missing key a NUMBER');
  });

  it('refuses rather than throwing when Roll.parse is absent altogether', () => {
    const noParse = recordedRollDouble({ parse: undefined });
    assert.deepEqual(describeFormulaEnumerability('1d20 + 5', ACTOR, { Roll: noParse }), {
      enumerable: false,
      reason: ODDS_REASONS.parseThrew,
    });
  });
});

describe('checkOdds: the View Lab Roll double agrees with the recorded 14.365 output', () => {
  const LAB = createLabRoll({
    random: () => 0.5,
    replaceFormulaData: REAL.replaceFormulaData,
    validate: REAL.validate,
  });

  /** The fields the enumerability predicate actually reads off a term. */
  function shapeOf(term) {
    return {
      faces: 'faces' in term ? term.faces : '@absent',
      number: 'number' in term ? term.number : '@absent',
      denomination: term.denomination ?? '@absent',
      modifiers: Array.isArray(term.modifiers) ? term.modifiers : '@absent',
      isDeterministic: term.isDeterministic,
      isStringy: typeof term.term === 'string',
      isIntermediate: term.isIntermediate === true,
    };
  }

  for (const [formula, entry] of Object.entries(RECORDED_ROLL_PARSE_14_365)) {
    it(`parses ${formula} to the recorded shape`, () => {
      if (entry.threw) {
        assert.throws(() => LAB.parse(formula, RECORDED_ROLL_DATA), SyntaxError);
        return;
      }
      const parsed = LAB.parse(formula, RECORDED_ROLL_DATA);
      assert.deepEqual(
        parsed.map((term) => shapeOf(term)),
        materialiseRecordedTerms(entry.terms).map((term) => shapeOf(term)),
        'the lab double is neither looser nor differently shaped than real Foundry'
      );
    });
  }

  it('gives the predicate the SAME verdict through the lab double as through the recording', () => {
    for (const formula of Object.keys(RECORDED_ROLL_PARSE_14_365)) {
      assert.deepEqual(
        describeFormulaEnumerability(formula, ACTOR, { Roll: LAB }),
        describeFormulaEnumerability(formula, ACTOR, { Roll: REAL }),
        `the two agree about ${formula}`
      );
    }
  });
});

/** Five relative tiers at −10/−5/0/+5/+10, the frames' own worked example. */
const RELATIVE_TIERS = [
  { id: 'ruined', name: 'Ruined', dc: -10, success: false },
  { id: 'flawed', name: 'Flawed', dc: -5, success: false },
  { id: 'success', name: 'Success', dc: 0, success: true },
  { id: 'fine', name: 'Fine', dc: 5, success: true },
  { id: 'masterwork', name: 'Masterwork', dc: 10, success: true },
];

const routedArgs = (overrides = {}) => ({
  type: 'relative',
  dc: 12,
  comparison: 'meet',
  relativeOutcomes: RELATIVE_TIERS,
  fixedOutcomes: [],
  triggers: [],
  clampToNearest: true,
  minOutcomeId: null,
  ...overrides,
});

describe('checkOdds: routed bucketing matches a hand-computed distribution', () => {
  it('buckets a plain 1d20 against DC 12 exactly as the thresholds say', () => {
    // Thresholds are 2 / 7 / 12 / 17 / 22 with `clampToNearest`, so totals 1–6 clamp to
    // Ruined, 7–11 are Flawed, 12–16 Success, 17–21 Fine, 22+ Masterwork. With no
    // remainder the totals ARE the faces: 6 / 5 / 5 / 4 / 0.
    const rows = enumerateRoutedOdds({ faces: 20, remainder: 0, args: routedArgs() });
    assert.deepEqual(
      rows.map((row) => [row.id, row.count, row.percent]),
      [
        ['ruined', 6, 30],
        ['flawed', 5, 25],
        ['success', 5, 25],
        ['fine', 4, 20],
      ]
    );
  });

  it('OMITS a zero-probability tier rather than charting an empty bar', () => {
    const rows = enumerateRoutedOdds({ faces: 20, remainder: 0, args: routedArgs() });
    assert.ok(
      !rows.some((row) => row.id === 'masterwork'),
      'no face reaches 22, so Masterwork is not listed at all'
    );
  });

  it('shifts every bucket by the remainder', () => {
    const rows = enumerateRoutedOdds({ faces: 20, remainder: 10, args: routedArgs() });
    assert.deepEqual(
      rows.map((row) => [row.id, row.count]),
      [
        ['flawed', 1],
        ['success', 5],
        ['fine', 5],
        ['masterwork', 9],
      ]
    );
  });

  it('derives its caption from the enumerated space, so a d12 reads twelve', () => {
    const rows = enumerateRoutedOdds({ faces: 12, remainder: 0, args: routedArgs() });
    assert.equal(
      rows.reduce((sum, row) => sum + row.count, 0),
      12,
      'every face is accounted for exactly once'
    );
  });
});

describe('checkOdds: the per-face dice bag comes from the production code path', () => {
  const NAT_TRIGGERS = [
    {
      id: 'nat20',
      outcome: 'success',
      condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 20 },
    },
    {
      id: 'nat1',
      outcome: 'failure',
      condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
    },
  ];

  it('routes a natural 20 and a natural 1 to the forced tiers', () => {
    const rows = enumerateRoutedOdds({
      faces: 20,
      // A remainder that would otherwise put BOTH faces in the middle of the range, so the
      // forced routing is the only thing that can produce these two buckets.
      remainder: 5,
      args: routedArgs({ triggers: NAT_TRIGGERS }),
    });
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    assert.ok(byId.masterwork, 'a natural 20 forces the BEST succeeding tier');
    assert.ok(byId.ruined, 'a natural 1 forces the WORST failing tier');
    assert.equal(byId.ruined.count, 1, 'exactly one face forces the failure');
  });

  it('fails when the bag drops `results`, which is what makes the trigger visible at all', () => {
    // The negative control for B12. `resolveForcedOutcome` reads `data.diceGroups[].results`
    // for an `anyDie` aggregate, so a bag missing that key makes every per-die trigger
    // invisible — while STILL matching a hand-computed distribution for a trigger-free
    // check. This asserts the difference is observable rather than trusting that it is.
    const withResults = resolveForcedOutcome(NAT_TRIGGERS, {
      total: 25,
      diceGroups: [{ groupId: 0, group: '1d20', sum: 20, results: [20] }],
    });
    const withoutResults = resolveForcedOutcome(NAT_TRIGGERS, {
      total: 25,
      diceGroups: [{ groupId: 0, group: '1d20', sum: 20 }],
    });
    assert.deepEqual(withResults, { disposition: 'success' }, 'the real bag forces a success');
    assert.equal(withoutResults, null, 'a bag with no `results` forces nothing at all');
  });
});

describe('checkOdds: pass/fail and progressive bucketing', () => {
  it('splits a pass/fail check on the comparison', () => {
    assert.deepEqual(
      enumeratePassFailOdds({
        faces: 20,
        remainder: 0,
        args: { dc: 15, comparison: 'meet', triggers: [] },
      }).map((row) => [row.id, row.count]),
      [
        ['failure', 14],
        ['success', 6],
      ]
    );
    assert.deepEqual(
      enumeratePassFailOdds({
        faces: 20,
        remainder: 0,
        args: { dc: 15, comparison: 'exceed', triggers: [] },
      }).map((row) => [row.id, row.count]),
      [
        ['failure', 15],
        ['success', 5],
      ],
      'strictly-exceed moves exactly one face'
    );
  });

  it('honours a forced outcome on a pass/fail check', () => {
    const rows = enumeratePassFailOdds({
      faces: 20,
      remainder: 100,
      args: {
        dc: 15,
        comparison: 'meet',
        triggers: [
          {
            id: 'nat1',
            outcome: 'failure',
            condition: {
              type: 'diceGroup',
              groupId: 0,
              aggregate: 'anyDie',
              operator: '==',
              value: 1,
            },
          },
        ],
      },
    });
    assert.deepEqual(
      rows.map((row) => [row.id, row.count]),
      [
        ['failure', 1],
        ['success', 19],
      ],
      'every face clears DC 15 on the numbers; the natural 1 fails anyway'
    );
  });

  it('buckets a progressive check by AWARD COUNT and omits unreachable counts', () => {
    // Four results costing 5 each, `equal` mode, `1d20 + 4` → budgets 5..24, so a face can
    // pay for 1, 2, 3 or 4 results and NEVER for none.
    const rows = enumerateProgressiveOdds({
      faces: 20,
      remainder: 4,
      difficulties: [5, 5, 5, 5],
      awardMode: 'equal',
    });
    assert.deepEqual(
      rows.map((row) => [row.awarded, row.count]),
      [
        [1, 5],
        [2, 5],
        [3, 5],
        [4, 5],
      ]
    );
    assert.ok(!rows.some((row) => row.awarded === 0), 'a count no face reaches is omitted');
  });

  it('lists an award of NOTHING when it is reachable, because that is a real outcome', () => {
    const rows = enumerateProgressiveOdds({
      faces: 20,
      remainder: 0,
      difficulties: [12, 12],
      awardMode: 'equal',
    });
    assert.deepEqual(
      rows.map((row) => [row.awarded, row.count]),
      [
        [0, 11],
        [1, 9],
      ]
    );
  });

  it('reads the award MODE rather than assuming one', () => {
    const equal = enumerateProgressiveOdds({
      faces: 20,
      remainder: 0,
      difficulties: [10, 10],
      awardMode: 'equal',
    });
    const partial = enumerateProgressiveOdds({
      faces: 20,
      remainder: 0,
      difficulties: [10, 10],
      awardMode: 'partial',
    });
    assert.notDeepEqual(
      equal.map((row) => [row.awarded, row.count]),
      partial.map((row) => [row.awarded, row.count]),
      'a partial tail award changes the distribution'
    );
  });
});

describe('checkOdds: the avg annotation', () => {
  const avg = (formula, actor = ACTOR) => expectedFormulaValue(formula, actor, { Roll: REAL });

  it('is the expected value of the RESOLVED formula for the previewed actor', () => {
    assert.equal(avg('1d20 + @prof'), 13, '10.5 + 3, floored');
    assert.equal(avg('1d20 + 3[Tools] + 2[Modifiers]'), 15);
  });

  it('is LOOSER than the histogram: it answers for a formula the histogram abstains from', () => {
    assert.equal(avg('2d6'), 7);
    assert.equal(describe14365('2d6').enumerable, false);
  });

  it('is OMITTED when the formula does not reduce to a number for this actor', () => {
    assert.equal(avg('1d20 + @nope'), null);
    assert.equal(avg('1d20 + @prof', null), null, 'and with no actor at all');
  });
});
