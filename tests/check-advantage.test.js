/**
 * The keep transform (issue 2007): `findKeepGroup`'s first-group proof, its parity with the terms
 * real Foundry 13.351 and 14.365 construct, and the transform on the constructed Roll.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { ROLL_TERMS_CORPUS, rollTermsKey } from '../scripts/lib/rollTermsCorpus.js';
import {
  applyKeepTransform,
  keepModifierFor,
  locateKeepTerm,
  planKeepTransform,
} from '../src/systems/checkKeepTransform.js';
import { evaluateCheckRoll } from '../src/systems/checkRoll.js';
import { normalizeCheckAdvantage } from '../src/systems/normalize/checkAdvantage.js';
import { findKeepGroup } from '../src/utils/craftingCheckExpression.js';

import { RECORDED_ROLL_TERMS, RECORDED_TERM_BUILDS } from './helpers/recordedRollParse.js';
import { Die, installTermBearingRoll, termFromRecording } from './helpers/termBearingRoll.js';
import { DiceTerm } from './view-lab/foundry/labRollTerms.js';

const OVER = { product: 'sum', direction: 'over' };
const UNDER = { product: 'sum', direction: 'under' };

const PROOFS = [
  ['1d20', { number: 1, faces: 20, prefix: '', referenceFirst: false }],
  ['d20', { number: 1, faces: 20, prefix: '', referenceFirst: false }],
  ['1D20 + 3', { number: 1, faces: 20, prefix: '', referenceFirst: false }],
  ['1d20[skill] + 3', { number: 1, faces: 20, prefix: '', referenceFirst: false }],
  ['2d6 + @prof', { number: 2, faces: 6, prefix: '', referenceFirst: false }],
  ['1d6 + 1d20', { number: 1, faces: 6, prefix: '', referenceFirst: false }],
  ['2 * 1d20', { number: 1, faces: 20, prefix: '2', referenceFirst: false }],
  ['1d20 * 2', { number: 1, faces: 20, prefix: '', referenceFirst: false }],
  ['@prof + 1d20', { number: 1, faces: 20, prefix: '@prof', referenceFirst: true }],
  ['(2 + 3) + 1d8', { number: 1, faces: 8, prefix: '(2 + 3)', referenceFirst: false }],
];

const REFUSALS = [
  ['@skill + 5', 'none'],
  ['', 'none'],
  ['1d6x + 1d20', 'modified'],
  ['2d20kh1 + 1d6', 'modified'],
  ['5d10cs>=8', 'modified'],
  ['(1d20+2)*2', 'nested'],
  ['max(1d20, 10)', 'nested'],
  ['floor(1d20/2)', 'nested'],
  ['{1d20,1d20}kh', 'nested'],
  ['(@skills.x.rank)d20', 'dynamic'],
  ['1d@faces', 'dynamic'],
  ['1df + 2', 'not-die'],
  ['dc', 'not-die'],
  ['10 - 1d20', 'position'],
  ['-1d20', 'position'],
  ['1d20 * -1', 'position'],
  ['@prof * 1d20', 'position'],
  ['5 - 2 * 1d20', 'position'],
  ['0d20 + 5', 'invalid'],
  ['1.5d20', 'invalid'],
  ['1d1', 'invalid'],
];

describe('findKeepGroup: the authored FIRST dice group, which must be plain', () => {
  for (const [formula, proof] of PROOFS) {
    it(`${formula} qualifies`, () => {
      assert.deepEqual(findKeepGroup(formula), { ok: true, ...proof });
    });
  }
  for (const [formula, reason] of REFUSALS) {
    it(`${JSON.stringify(formula)} is refused as ${reason}`, () => {
      assert.deepEqual(findKeepGroup(formula), { ok: false, reason });
    });
  }
});

/** Whether a recorded top-level term carries a die, itself or nested. */
const carriesDice = (term) =>
  term instanceof DiceTerm || /(?:^|[^a-z])\d*d\d/i.test(String(term.formula));

const isPositiveNumber = (term) => term?.constructor.name === 'NumericTerm' && term.number > 0;

/** The term-side reading of an additive position: `+`-led, or a positive literal's product. */
function additiveOnTerms(terms, index) {
  const [operator, factor] = [terms[index - 1]?.operator, terms[index - 2]];
  const leads =
    index === 0 ||
    operator === '+' ||
    (operator === '*' &&
      isPositiveNumber(factor) &&
      [undefined, '+'].includes(terms[index - 3]?.operator));
  let next = index + 1;
  while (['*', '/'].includes(terms[next]?.operator)) {
    if (!isPositiveNumber(terms[next + 1])) return false;
    next += 2;
  }
  return leads && (next === terms.length || ['+', '-'].includes(terms[next].operator));
}

/** What the recorded terms say of their first dice-bearing term, independent of the proof. */
function termVerdict(terms) {
  const index = terms.findIndex(carriesDice);
  if (index === -1) return 'none';
  const term = terms[index];
  if (!(term instanceof DiceTerm)) return 'nested';
  if (!(term instanceof Die)) return 'not-die';
  if (typeof term._number !== 'number' || typeof term._faces !== 'number') return 'dynamic';
  if (term.modifiers.length > 0) return 'modified';
  if (!Number.isInteger(term._number) || term._number < 1 || term._faces < 2) return 'invalid';
  return additiveOnTerms(terms, index) ? 'ok' : 'position';
}

describe('findKeepGroup agrees with the terms real Foundry constructs', () => {
  const plan = ROLL_TERMS_CORPUS.filter((entry) => entry.family === 'plan');
  for (const version of RECORDED_TERM_BUILDS) {
    const { entries } = RECORDED_ROLL_TERMS[version];
    for (const entry of plan) {
      it(`${version}: ${rollTermsKey(entry)}`, () => {
        const terms = entries[rollTermsKey(entry)].terms.map((term) => termFromRecording(term));
        const proof = findKeepGroup(entry.formula);
        if (!proof.ok) {
          const verdict = termVerdict(terms);
          // An `@` count or faces is substituted before parsing, so only the authored text sees it.
          if (proof.reason === 'dynamic') assert.ok(['dynamic', 'ok'].includes(verdict), verdict);
          else assert.equal(verdict, proof.reason);
          return;
        }
        const prefix = { formula: proof.prefix, data: entry.data };
        const index = proof.prefix === '' ? 0 : entries[rollTermsKey(prefix)].terms.length + 1;
        assert.equal(
          locateKeepTerm(terms, index, proof, Die),
          terms[index],
          'the transform agrees'
        );
        assert.ok(additiveOnTerms(terms, index), 'in an additive position on the terms too');
      });
    }
  }
});

describe('the keep transform on the constructed Roll', () => {
  const recorded = (formula) =>
    RECORDED_ROLL_TERMS['14.365'].entries[formula].terms.map((term) => termFromRecording(term));

  it('keeps by the choice and the direction', () => {
    assert.deepEqual(
      ['advantage', 'disadvantage', 'normal'].map((choice) => [
        keepModifierFor(choice, 'over'),
        keepModifierFor(choice, 'under'),
      ]),
      [
        ['kh', 'kl'],
        ['kl', 'kh'],
        [null, null],
      ]
    );
  });

  it('never keeps a FateDie, a keep-capable non-Die DiceTerm, or a sub-roll count', () => {
    class KeepingDiceTerm extends DiceTerm {
      static MODIFIERS = { kh: 'kh', kl: 'kl' };
    }
    assert.equal(locateKeepTerm(recorded('1df + 2'), 0, { number: 1, faces: 3 }, Die), null);
    const bare = [new KeepingDiceTerm({ number: 1, faces: 20 })];
    assert.equal(locateKeepTerm(bare, 0, { number: 1, faces: 20 }, Die), null);
    const ranked = recorded('(@skills.x.rank)d20');
    assert.equal(locateKeepTerm(ranked, 0, { number: 2, faces: 20 }, Die), null);
  });

  it('never keeps a count or faces that is not an integer in range, whatever the proof says', () => {
    for (const [number, faces] of [
      [1.5, 20],
      [0, 20],
      [1, 1],
      [1, 2.5],
    ]) {
      const terms = [new Die({ number, faces })];
      assert.equal(locateKeepTerm(terms, 0, { number, faces }, Die), null, `${number}d${faces}`);
    }
    const kept = [new Die({ number: 2, faces: 6, modifiers: ['kh1'] })];
    assert.equal(locateKeepTerm(kept, 0, { number: 2, faces: 6 }, Die), null, 'already modified');
  });

  it('never keeps a group the roll places after `-` or after a non-positive factor', () => {
    assert.equal(locateKeepTerm(recorded('10 - 1d20'), 2, { number: 1, faces: 20 }, Die), null);
    const product = recorded('2 * 1d20');
    assert.equal(locateKeepTerm(product, 2, { number: 1, faces: 20 }, Die), product[2]);
    product[0].number = -2;
    assert.equal(locateKeepTerm(product, 2, { number: 1, faces: 20 }, Die), null);
  });

  it('fails closed without a Die class, and warns once when the roll disagrees', () => {
    const { Roll, restore } = installTermBearingRoll();
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => {
      warnings.push(args);
    };
    try {
      const plan = planKeepTransform({
        choice: 'advantage',
        evaluation: OVER,
        advantage: normalizeCheckAdvantage(),
        authoredFormula: '1d20 + 3',
      });
      const roll = new Roll('1d20 + 3');
      assert.equal(applyKeepTransform(roll, plan, 0, null), false);
      assert.equal(roll._formula, '1d20 + 3');
      assert.deepEqual(warnings, [], 'no Die is the offer’s concern, not a disagreement');
      const other = new Roll('1d12 + 3');
      assert.equal(applyKeepTransform(other, plan, 0, Die), false);
      assert.equal(other._formula, '1d12 + 3');
      assert.equal(warnings.length, 1);
    } finally {
      console.warn = warn;
      restore();
    }
  });
});

describe('evaluateCheckRoll keeps on the constructed Roll', () => {
  let installed = null;
  afterEach(() => installed?.restore());

  /**
   * Roll `formula` with a forwarded `choice`; the rolled roll is the last one constructed. The lab
   * cannot evaluate `0d20`, which core rolls as 0, so a failed evaluation still yields the roll.
   */
  async function rollWith(
    formula,
    choice,
    { evaluation = OVER, advantage, data = {}, ...rest } = {}
  ) {
    const constructed = [];
    installed = installTermBearingRoll({
      onConstruct: (roll) => {
        constructed.push(roll);
      },
    });
    const result = await evaluateCheckRoll(
      formula,
      { getRollData: () => data },
      { interactive: true, rollDecision: { advantage: choice }, evaluation, advantage, ...rest }
    ).catch((error) => ({ error }));
    return { result, roll: constructed.at(-1), Roll: installed.Roll };
  }

  const rolled = async (...args) => (await rollWith(...args)).roll._formula;

  it('keeps the best of the first group in the check direction (MA2)', async () => {
    assert.equal(await rolled('1d20', 'advantage'), '2d20kh1');
    assert.equal(await rolled('1d20', 'disadvantage'), '2d20kl1');
    assert.equal(await rolled('1d20', 'advantage', { evaluation: UNDER }), '2d20kl1');
    assert.equal(await rolled('1d20', 'disadvantage', { evaluation: UNDER }), '2d20kh1');
    assert.equal(await rolled('1d20', 'normal'), '1d20');
  });

  it('rolls the record’s extra dice (MA3)', async () => {
    const advantage = { extraDice: 2 };
    assert.equal(await rolled('1d20', 'advantage', { advantage }), '3d20kh1');
    assert.equal(await rolled('1d20', 'advantage', { advantage, evaluation: UNDER }), '3d20kl1');
    assert.equal(await rolled('2d6', 'advantage', { advantage }), '4d6kh2');
  });

  it('keeps the group’s own count, for any die size (MA4, R1 class a)', async () => {
    assert.equal(await rolled('2d6', 'advantage'), '3d6kh2');
    assert.equal(await rolled('2d6', 'advantage', { evaluation: UNDER }), '3d6kl2');
    assert.equal(await rolled('1d100 + 5', 'disadvantage'), '2d100kl1 + 5');
  });

  it('re-caches the formula, so every surface reads the kept roll (MA5)', async () => {
    const { result, roll, Roll } = await rollWith('1d12 + @mod', 'advantage', {
      data: { mod: 3 },
      includeRollHandoff: true,
    });
    const expected = '2d12kh1 + 3';
    assert.deepEqual(
      {
        _formula: roll._formula,
        toJSON: roll.toJSON().formula,
        fromData: Roll.fromData(JSON.parse(JSON.stringify(roll)))._formula,
        clone: roll.clone()._formula,
        handoff: Roll.fromData(result.rollHandoff.serializedRoll)._formula,
        resolvedFormula: result.resolvedFormula,
      },
      {
        _formula: expected,
        toJSON: expected,
        fromData: expected,
        clone: expected,
        handoff: expected,
        resolvedFormula: expected,
      }
    );
  });

  it('never skips a refused first group for a later one (MA1, R1 class b2)', async () => {
    for (const formula of ['1d6x + 1d20', '(1d20+2)*2', 'max(1d20,10)', 'floor(1d20/2)']) {
      assert.equal(await rolled(formula, 'advantage'), await rolled(formula, 'normal'), formula);
    }
    assert.equal(await rolled('1d6 + 1d20', 'advantage'), '2d6kh1 + 1d20', 'R1 class b1');
    assert.equal(await rolled('1d20 + 1d6', 'advantage'), '2d20kh1 + 1d6');
  });

  it('refuses dice that are not plain or not additive (MA7)', async () => {
    const data = { skills: { x: { rank: 2 } }, faces: 20 };
    for (const [formula, unchanged] of [
      ['1df + 2', '1df + 2'],
      ['(@skills.x.rank)d20', '(2)d20'],
      ['1d@faces', '1d20'],
      ['10 - 1d20', '10 - 1d20'],
      ['1d20 * -1', '1d20 * -1'],
      ['0d20 + 5', '0d20 + 5'],
    ]) {
      assert.equal(await rolled(formula, 'advantage', { data }), unchanged, formula);
    }
    assert.equal(await rolled('2 * 1d20', 'advantage'), '2 * 2d20kh1', 'a positive factor keeps');
  });

  it('keeps only the AUTHORED group, never a modifier’s or a reference’s die (MA6)', async () => {
    const library = {
      catalogue: [{ id: 'wild', label: 'Wild', expression: '1d20' }],
      systemPolicy: 'addAll',
      defaultModifierIds: ['wild'],
    };
    assert.equal(
      await rolled('@skill + 3', 'advantage', { data: { skill: 2 }, craftingModifier: library }),
      '2 + 3 + (1d20)[Modifiers]'
    );
    const { result, roll } = await rollWith('@prof + 1d20', 'advantage', {
      data: { prof: '1d4' },
    });
    assert.equal(roll._formula, '1d4 + 2d20kh1');
    assert.equal(result.resolvedFormula, '1d4 + 2d20kh1');
  });

  it('keeps nothing when the rule is off or bonus, or disadvantage is not offered', async () => {
    assert.equal(await rolled('1d20', 'advantage', { advantage: { mode: 'off' } }), '1d20');
    const bonus = { advantage: { mode: 'bonus' } };
    assert.equal(await rolled('1d20', 'advantage', bonus), '1d20 + (1d6)', 'a bonus die, no keep');
    const noDisadvantage = { offerDisadvantage: false };
    assert.equal(await rolled('1d20', 'disadvantage', { advantage: noDisadvantage }), '1d20');
    assert.equal(await rolled('1d20', 'advantage', { advantage: noDisadvantage }), '2d20kh1');
  });

  it('reads only the kept faces, and later groups keep their group ids', async () => {
    const { result } = await rollWith('3d6 + 1d4', 'advantage');
    const [kept, later] = result.diceGroups;
    assert.equal(kept.group, '4d6');
    assert.equal(kept.results.length, 3, 'the dropped die is not a result');
    assert.deepEqual([later.groupId, later.group], [1, '1d4']);
  });
});
