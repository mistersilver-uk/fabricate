/** The recorded `new Roll(formula, data).terms` corpus and the doubles built on it (issue 2007). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeRecordedTerm,
  ROLL_TERMS_DATA,
  rollTermsKey,
} from '../scripts/lib/rollTermsCorpus.js';

import {
  RECORDED_ROLL_TERMS,
  RECORDED_TERM_BUILDS,
  recordedRollDouble,
  unrecordedCorpusEntries,
} from './helpers/recordedRollParse.js';
import { createTermBearingRoll, Die, TERM_CLASSES } from './helpers/termBearingRoll.js';
import { createLabRoll } from './view-lab/foundry/labRoll.js';
import { DiceTerm, LabSubRoll } from './view-lab/foundry/labRollTerms.js';

const STATICS = recordedRollDouble();
const LAB = createLabRoll({ random: () => 0.5, ...STATICS });

/** A live term in the recorded shape, minus the class chain `instanceof` checks separately. */
function shapeOf(term) {
  const {
    ancestry: _ancestry,
    class: name,
    ...rest
  } = describeRecordedTerm(term, {
    Roll: LabSubRoll,
    DiceTerm,
  });
  return { class: name === 'BasicDie' ? 'Die' : name, ...rest };
}

const recordedShape = ({ ancestry: _ancestry, class: name, ...rest }) => ({
  class: name === 'BasicDie' ? 'Die' : name,
  ...rest,
});

const recordedEntries = (version) => Object.values(RECORDED_ROLL_TERMS[version].entries);

describe('the recorded Roll terms corpus', () => {
  for (const version of RECORDED_TERM_BUILDS) {
    it(`records every corpus formula on Foundry ${version}`, () => {
      assert.equal(RECORDED_ROLL_TERMS[version].foundryVersion, version);
      assert.deepEqual(
        unrecordedCorpusEntries(version).map((entry) => rollTermsKey(entry)),
        [],
        'record the gap with `node scripts/foundry-test.mjs --check=roll-terms` on each arm'
      );
    });
  }

  it('the two builds agree on every term apart from the plain die class dnd5e registers', () => {
    const [v13, v14] = RECORDED_TERM_BUILDS.map((version) => RECORDED_ROLL_TERMS[version]);
    assert.equal(v13.dieClass, 'Die');
    assert.equal(v14.dieClass, 'BasicDie');
    for (const [key, entry] of Object.entries(v14.entries)) {
      const other = v13.entries[key];
      assert.equal(other.threw, entry.threw, key);
      if (entry.threw) continue;
      assert.equal(other._formula, entry._formula, key);
      assert.deepEqual(other.terms.map(recordedShape), entry.terms.map(recordedShape), key);
    }
  });
});

describe('the View Lab Roll parses the recorded terms, on both builds', () => {
  for (const version of RECORDED_TERM_BUILDS) {
    for (const entry of recordedEntries(version)) {
      it(`${version}: ${rollTermsKey(entry)}`, () => {
        const data = ROLL_TERMS_DATA[entry.data];
        if (entry.threw) {
          assert.throws(() => new LAB(entry.formula, data), SyntaxError);
          return;
        }
        const roll = new LAB(entry.formula, data);
        assert.equal(roll._formula, entry._formula);
        assert.equal(roll.formula, entry.rollFormula);
        assert.deepEqual(roll.terms.map(shapeOf), entry.terms.map(recordedShape));
      });
    }
  }
});

describe('the term-bearing double replays the recording', () => {
  for (const version of RECORDED_TERM_BUILDS) {
    const Roll = createTermBearingRoll({ foundryVersion: version, strict: true });

    it(`${version}: every recorded term, with its class and core's instanceof chain`, () => {
      for (const entry of recordedEntries(version)) {
        const data = ROLL_TERMS_DATA[entry.data];
        if (entry.threw) {
          assert.throws(() => new Roll(entry.formula, data), SyntaxError);
          continue;
        }
        const roll = new Roll(entry.formula, data);
        assert.equal(roll._formula, entry._formula, entry.formula);
        for (const [index, term] of roll.terms.entries()) {
          const recorded = entry.terms[index];
          assert.equal(term.constructor.name, recorded.class, entry.formula);
          assert.equal(term instanceof Die, recorded.ancestry.includes('Die'), entry.formula);
          assert.equal(term instanceof DiceTerm, recorded.ancestry.includes('DiceTerm'));
          assert.deepEqual(shapeOf(term), recordedShape(recorded), entry.formula);
        }
      }
    });

    it(`${version}: a keep mutation reads on every formula surface as core's did`, () => {
      for (const probe of RECORDED_ROLL_TERMS[version].probes) {
        const roll = new Roll(probe.formula, ROLL_TERMS_DATA[probe.data]);
        const term = roll.terms[probe.index];
        const original = term._number;
        term.number = original + probe.extraDice;
        term.modifiers.push(`${probe.keep}${original}`);
        assert.deepEqual(
          { _formula: roll._formula, rollFormula: roll.formula },
          probe.beforeReset,
          `${probe.formula}: only the live formula moves before resetFormula`
        );
        roll.resetFormula();
        const json = roll.toJSON();
        assert.deepEqual(
          {
            _formula: roll._formula,
            rollFormula: roll.formula,
            toJSONFormula: json.formula,
            fromDataFormula: Roll.fromData(JSON.parse(JSON.stringify(json)))._formula,
            cloneFormula: roll.clone()._formula,
          },
          {
            _formula: probe.afterReset._formula,
            rollFormula: probe.afterReset.rollFormula,
            toJSONFormula: probe.afterReset.toJSONFormula,
            fromDataFormula: probe.afterReset.fromDataFormula,
            cloneFormula: probe.afterReset.cloneFormula,
          },
          probe.formula
        );
        assert.deepEqual(
          roll.terms.map(shapeOf),
          probe.afterReset.terms.map(recordedShape),
          probe.formula
        );
      }
    });
  }

  it('replays a recording only for the data it was recorded with, and parses otherwise', () => {
    const Roll = createTermBearingRoll();
    assert.equal(new Roll('1d12 + @prof', { prof: 3 }).terms[0].constructor.name, 'BasicDie');
    const other = new Roll('1d12 + @prof', { prof: 5 });
    assert.equal(other._formula, '1d12 + 5');
    assert.equal(other.terms[0].constructor.name, 'Die', 'the modelled parser, not the recording');
    assert.throws(
      () => new (createTermBearingRoll({ strict: true }))('1d12 + @prof', { prof: 5 }),
      /no recorded Foundry 14\.365 terms/
    );
  });

  it('evaluates the mutated terms, and a scripted total overrides the rolled one', async () => {
    const Roll = createTermBearingRoll({ random: () => 0.99 });
    const roll = new Roll('1d20 + 3');
    roll.terms[0].number = 2;
    roll.terms[0].modifiers.push('kh1');
    roll.resetFormula();
    await roll.evaluate({ allowInteractive: false });
    assert.equal(roll.dice[0], roll.terms[0], 'the kept die is the mutated term');
    assert.equal(roll.dice[0].results.length, 2);
    assert.equal(roll.total, 23);
    const fixed = await new (createTermBearingRoll({ total: 15 }))('1d20').evaluate();
    assert.equal(fixed.total, 15);
    assert.equal(TERM_CLASSES.Die, Die);
  });
});
