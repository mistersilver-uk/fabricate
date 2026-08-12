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

/**
 * The View Lab's own `Roll`, which parses ANY formula rather than replaying a recording.
 *
 * The bucketing suites below need spaces the recording does not hold (`1d20 + 100`), and
 * they must not hand-build a `{ total, diceGroups }` list to get one: a bag spelled by hand
 * is exactly the second model this module refuses to keep. This double is graded against the
 * recording by `the View Lab Roll double agrees with the recorded 14.365 output`, so a space
 * taken through it is a space taken through the production enumerator.
 */
const LAB_ROLL = createLabRoll({
  random: () => 0.5,
  replaceFormulaData: REAL.replaceFormulaData,
  validate: REAL.validate,
});

/** The enumerated outcome space of a formula, asserted to exist before it is used. */
function spaceOf(formula, actor = ACTOR) {
  const verdict = describeFormulaEnumerability(formula, actor, { Roll: LAB_ROLL });
  assert.equal(verdict.enumerable, true, `${formula} enumerates (got ${verdict.reason})`);
  return verdict;
}

/** The inclusive range of totals a verdict's space reaches. */
function domainOf(verdict) {
  const totals = verdict.outcomes.map((outcome) => outcome.total);
  return { min: Math.min(...totals), max: Math.max(...totals) };
}

describe('checkOdds: the positive whitelist, graded against recorded Foundry 14.365 output', () => {
  it('accepts a plain single die and enumerates the totals it reaches', () => {
    const d20 = describe14365('1d20 + 5');
    assert.equal(d20.enumerable, true, `enumerable (got ${d20.reason})`);
    assert.deepEqual(d20.dice, [{ faces: 20 }]);
    assert.equal(d20.combinations, 20, 'one assignment per face');
    assert.deepEqual(domainOf(d20), { min: 6, max: 25 });
    assert.equal(d20.display, '1d20 + 5');

    const d12 = describe14365('1d12 + 2');
    assert.deepEqual(d12.dice, [{ faces: 12 }]);
    assert.deepEqual(domainOf(d12), { min: 3, max: 14 });
  });

  it('accepts a formula carrying a RESOLVABLE @ key, resolved against the previewed actor', () => {
    // Not a bare literal remainder: `@prof` is 3 for this actor, and the remainder has to
    // be read off the resolved display rather than off the parse.
    const verdict = describe14365('1d20 + @prof');
    assert.equal(verdict.display, '1d20 + 3');
    assert.deepEqual(domainOf(verdict), { min: 4, max: 23 }, '`@prof` is 3 for this actor');
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
    assert.deepEqual(
      domainOf(verdict),
      { min: 6, max: 25 },
      'both flavoured terms move the whole domain, and neither is read as a die'
    );

    // ACCEPTANCE IS PINNED DIRECTLY: the same fixture with the offending term removed
    // enumerates too, so "it accepted" cannot be a coincidence of the shorter string.
    assert.equal(describe14365('1d20 + 5').enumerable, true);
  });

  it('accepts a DETERMINISTIC parenthetical, which is what makes the string-term test precise', () => {
    // `ParentheticalTerm` carries a string `term` exactly as `StringTerm` does (recorded
    // from 14.365), so a predicate that told them apart by that field alone would refuse
    // `1d20 + (2)` — a formula real Foundry evaluates to a fixed number — as a stray word.
    const deterministic = describe14365('1d20 + (2)');
    assert.equal(deterministic.enumerable, true, `enumerable (got ${deterministic.reason})`);
    assert.deepEqual(domainOf(deterministic), { min: 3, max: 22 });
    // …and its ROLLING sibling is refused for what is actually wrong with it — a `2d6` is
    // eleven outcomes on a triangular distribution, not a shape this enumerates — rather
    // than for the string field a parenthetical happens to share with `StringTerm`.
    assert.deepEqual(describe14365('1d20 + (2d6)'), {
      enumerable: false,
      reason: ODDS_REASONS.nonUnitCount,
    });
  });

  it('ENUMERATES A DIE INSIDE A FUNCTION, which is what a bounded check modifier is', () => {
    // THE CASE THIS ENUMERATOR WAS REBUILT FOR. A rolling check modifier's bounds are
    // expressed IN the formula — `min(max((1d8), -1), 6)[Modifiers]` — so every system with
    // one authored a formula whose dice are not all top-level. `RollParser.flattenTree`
    // pushes a function term WHOLE, so the old top-level determinism test refused the lot.
    const verdict = describe14365('1d20 + min(max((1d8), -1), 6)[Modifiers]');
    assert.equal(verdict.enumerable, true, `enumerable (got ${verdict.reason})`);
    assert.deepEqual(verdict.dice, [{ faces: 20 }, { faces: 8 }], 'BOTH dice, in reading order');
    assert.equal(verdict.faces, null, 'and no single face count, because there is no one die');
    assert.equal(verdict.combinations, 160);
    // THE CLAMP IS APPLIED, not merely parsed around: the `1d8` contributes 1..6, so the
    // domain is `1+1 .. 20+6`. A string scan reads the bound arguments `-1` and `6` as flat
    // addends and answers `7 .. 33` — monotone, correctly shaped and wrong by five.
    assert.deepEqual(domainOf(verdict), { min: 2, max: 26 });
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
    ['5 + 3', ODDS_REASONS.noDice],
    ['1d20 + (2d6)', ODDS_REASONS.nonUnitCount],
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

  it('ACCEPTS the three shapes that used to be refused for holding dice in a container', () => {
    // The counter-list to the table above, and the point of it: `multiple-die-groups` is
    // retired, and `max(1d20,5)`, `1d20 + 1d6` and `{1d20,1d12}kh` are all exactly
    // enumerable. Each is checked by its DOMAIN rather than by the verdict flag, so a
    // predicate that said yes and then charted the wrong space would fail here.
    const clamped = describe14365('max(1d20,5)');
    assert.deepEqual(domainOf(clamped), { min: 5, max: 20 }, 'the floor is applied');
    const two = describe14365('1d20 + 1d6');
    assert.equal(two.combinations, 120);
    assert.deepEqual(domainOf(two), { min: 2, max: 26 });
    const pool = describe14365('{1d20,1d12}kh');
    assert.deepEqual(domainOf(pool), { min: 1, max: 20 }, 'keep-highest of the two members');
  });

  it('refuses a space too large to walk, rather than sampling one', () => {
    // A cap is a REFUSAL with a stated reason, because a sampled histogram is the
    // approximation this whole module exists to avoid. `1d100 + 1d100 + 1d100` is a million
    // assignments; the two-die case beneath the cap proves the refusal is the SIZE and not
    // the die count.
    // The pair BRACKETS the cap: 10 000 assignments are walked and 1 000 000 are refused, so
    // neither arm can pass on a cap that has been moved.
    assert.equal(spaceOf('1d100 + 1d100').combinations, 10_000);
    assert.deepEqual(
      describeFormulaEnumerability('1d100 + 1d100 + 1d100', ACTOR, {
        Roll: LAB_ROLL,
      }),
      {
        enumerable: false,
        reason: ODDS_REASONS.tooManyOutcomes,
      }
    );
  });

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
    const rows = enumerateRoutedOdds({ outcomes: spaceOf('1d20').outcomes, args: routedArgs() });
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
    const rows = enumerateRoutedOdds({ outcomes: spaceOf('1d20').outcomes, args: routedArgs() });
    assert.ok(
      !rows.some((row) => row.id === 'masterwork'),
      'no face reaches 22, so Masterwork is not listed at all'
    );
  });

  it('shifts every bucket by the remainder', () => {
    const rows = enumerateRoutedOdds({
      outcomes: spaceOf('1d20 + 10').outcomes,
      args: routedArgs(),
    });
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
    const rows = enumerateRoutedOdds({ outcomes: spaceOf('1d12').outcomes, args: routedArgs() });
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
      // An offset that would otherwise put BOTH faces in the middle of the range, so the
      // forced routing is the only thing that can produce these two buckets.
      outcomes: spaceOf('1d20 + 5').outcomes,
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
        outcomes: spaceOf('1d20').outcomes,
        args: { dc: 15, comparison: 'meet', triggers: [] },
      }).map((row) => [row.id, row.count]),
      [
        ['failure', 14],
        ['success', 6],
      ]
    );
    assert.deepEqual(
      enumeratePassFailOdds({
        outcomes: spaceOf('1d20').outcomes,
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
      outcomes: spaceOf('1d20 + 100').outcomes,
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
      outcomes: spaceOf('1d20 + 4').outcomes,
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
      outcomes: spaceOf('1d20').outcomes,
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
    const outcomes = spaceOf('1d20').outcomes;
    const equal = enumerateProgressiveOdds({
      outcomes,
      difficulties: [10, 10],
      awardMode: 'equal',
    });
    const partial = enumerateProgressiveOdds({
      outcomes,
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
