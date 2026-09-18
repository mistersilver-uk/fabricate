/** Issue 1645: a RESULT's amount is fixed or ROLLED. This pins the persisted shape (absent on disk
 *  means fixed), the rollability floor `validate({ Roll })` enforces, and the one resolver. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { seededRollClass } from './helpers/seededRoll.js';
import { hasRollDataPath, maximisedTotal } from '../src/utils/rollFormulaRollability.js';

globalThis.foundry = { utils: { randomID: () => 'rid' } };

const { Result, RESULT_OMITTED_WHEN_DEFAULT } = await import('../src/models/Result.js');
const { resolveRolledAmount, rolledAwardRecord } = await import(
  '../src/systems/rolledAmountResolver.js'
);

const fixed = (extra = {}) => new Result({ componentId: 'comp', quantity: 2, ...extra });

test('1645: a fixed result omits `quantityFormula` from its payload entirely', () => {
  const json = fixed().toJSON();
  assert.ok(!('quantityFormula' in json), 'the key is omitted, not written as null');
  assert.equal(json.quantity, 2, '`quantity` is never omitted');
  assert.equal(RESULT_OMITTED_WHEN_DEFAULT.quantityFormula(null), true);
});

test('1645: an empty or whitespace formula reads back as absent, and a real one survives', () => {
  for (const authored of ['', '   ', null, undefined]) {
    assert.equal(fixed({ quantityFormula: authored }).quantityFormula, null, `${authored}`);
    assert.ok(!('quantityFormula' in fixed({ quantityFormula: authored }).toJSON()));
  }
  const rolled = Result.fromJSON({ componentId: 'comp', quantity: 2, quantityFormula: ' 1d4+1 ' });
  assert.equal(rolled.quantityFormula, '1d4+1', 'trimmed');
  assert.equal(rolled.toJSON().quantityFormula, '1d4+1');
  assert.equal(Result.fromJSON(rolled.toJSON()).quantityFormula, '1d4+1', 'round-trips');
});

test('1645: validate({ Roll }) accepts a rollable formula and one that depends on the actor', () => {
  const { Roll, calls } = seededRollClass({
    maxima: {
      '1d4+1': 5,
      '@abilities.str.mod + 1d2': 2,
      '@abilities.str.mod': 0,
      '@scale.rogue.sneak-attack + 1d4': 4,
    },
  });
  assert.deepEqual(fixed({ quantityFormula: '1d4+1' }).validate({ Roll }).errors, []);
  const actorDependent = fixed({ quantityFormula: '@abilities.str.mod + 1d2' });
  assert.deepEqual(actorDependent.validate({ Roll }).errors, [], 'a path-bearing formula parses');
  const wholly = fixed({ quantityFormula: '@abilities.str.mod' });
  assert.deepEqual(wholly.validate({ Roll }).errors, [], 'a maximum of 0 is undecidable, not wrong');
  assert.deepEqual(fixed().validate({ Roll }).errors, [], 'a fixed result is unaffected');
  // A hyphen inside a path is core's own pattern, and a formula cut at one leaves a `StringTerm`
  // that throws under evaluation — which reported a valid recipe as unrollable and blocked crafting.
  const hyphenated = fixed({ quantityFormula: '@scale.rogue.sneak-attack + 1d4' });
  assert.deepEqual(hyphenated.validate({ Roll }).errors, [], 'a hyphenated path is one path');
  assert.deepEqual(
    calls.map((call) => call.formula),
    [
      '1d4+1',
      '@abilities.str.mod + 1d2',
      '@abilities.str.mod',
      '@scale.rogue.sneak-attack + 1d4',
    ],
    'every formula reaches `Roll` verbatim, because `Roll.parse` substitutes the references'
  );
});

test('1645: a roll-data path is recognised in both of the forms core substitutes', () => {
  for (const formula of [
    '@abilities.str.mod + 1',
    '@scale.rogue.sneak-attack + 1d4',
    '@{abilities.str.mod} + 1',
    '@{scale.rogue.sneak-attack}',
  ]) {
    assert.equal(hasRollDataPath(formula), true, formula);
  }
  for (const formula of ['1d4+1', '', null, 'max(1d4, 2)']) {
    assert.equal(hasRollDataPath(formula), false, `${formula}`);
  }
});

test('1645: the maximised reading hands the formula to `Roll` exactly as authored', () => {
  const { Roll, calls } = seededRollClass({ maxima: { '@x + 1d2': 2 } });
  assert.equal(maximisedTotal('@x + 1d2', Roll), 2);
  assert.equal(calls[0].formula, '@x + 1d2', 'no local substitution stands in for `Roll.parse`');
  assert.deepEqual(calls[0].evaluateSync, { maximize: true });
});

test('1645: validate({ Roll }) refuses a path-free formula that can never award anything', () => {
  const { Roll } = seededRollClass({ maxima: { '1d4 - 10': -6 }, unparsable: ['1d4]'] });
  const negative = fixed({ quantityFormula: '1d4 - 10' }).validate({ Roll });
  assert.equal(negative.valid, false);
  assert.match(negative.errors.join(' '), /positive/);
  const broken = fixed({ quantityFormula: '1d4]' }).validate({ Roll });
  assert.equal(broken.valid, false);
  assert.match(broken.errors.join(' '), /rolled/);
});

test('1645: validate() with no Roll injected reports nothing about the formula', () => {
  assert.deepEqual(fixed({ quantityFormula: '1d4 - 10' }).validate().errors, []);
  assert.deepEqual(fixed({ quantityFormula: '1d4]' }).validate({}).errors, []);
});

test('1645: the resolver rolls nothing without a formula and answers the authored amount', async () => {
  const { Roll, calls } = seededRollClass();
  assert.deepEqual(await resolveRolledAmount({ quantity: 3 }, null, { Roll }), {
    amount: 3,
    rolled: null,
    roll: null,
  });
  assert.deepEqual(await resolveRolledAmount({ quantity: 3, quantityFormula: '  ' }, null, { Roll }), {
    amount: 3,
    rolled: null,
    roll: null,
  });
  assert.equal(calls.length, 0, 'no formula, no roll');
});

test('1645: the resolver rolls once against the actor, floors the total and clamps it at zero', async () => {
  const { Roll, calls } = seededRollClass({ totals: { '1d4+1': 4, '2d4/2': 3.7, '1d4-8': -3 } });
  const actor = { getRollData: () => ({ abilities: { str: { mod: 2 } } }) };

  const awarded = await resolveRolledAmount({ quantity: 1, quantityFormula: '1d4+1' }, actor, {
    Roll,
  });
  assert.equal(awarded.amount, 4);
  assert.deepEqual(awarded.rolled, { formula: '1d4+1', total: 4 });
  assert.equal(awarded.roll.total, 4, 'the live roll comes back for the chat message');
  assert.deepEqual(calls[0].data, { abilities: { str: { mod: 2 } } }, 'rolled against the actor');
  assert.deepEqual(calls[0].evaluate, { allowInteractive: false });

  assert.equal((await resolveRolledAmount({ quantityFormula: '2d4/2' }, actor, { Roll })).amount, 3);
  const empty = await resolveRolledAmount({ quantity: 1, quantityFormula: '1d4-8' }, actor, { Roll });
  assert.equal(empty.amount, 0, 'a negative total clamps to an empty award');
  assert.deepEqual(empty.rolled, { formula: '1d4-8', total: -3 }, 'the roll is stated as it fell');
  assert.equal(calls.length, 3, 'one roll per call, never two');
});

test('1645: the resolver throws rather than falling back to an ambient Roll', async () => {
  const previous = globalThis.Roll;
  delete globalThis.Roll;
  try {
    await assert.rejects(
      () => resolveRolledAmount({ quantity: 1, quantityFormula: '1d4' }, null, {}),
      /Roll/
    );
  } finally {
    if (previous !== undefined) globalThis.Roll = previous;
  }
});

test('1645: an award record states the roll beside the integer awarded, zero included', () => {
  const record = rolledAwardRecord({ id: 'r1', componentId: 'comp' }, { formula: '1d4-8', total: -3 }, 0);
  assert.deepEqual(record, {
    resultId: 'r1',
    componentId: 'comp',
    formula: '1d4-8',
    total: -3,
    quantity: 0,
  });
});

test('1645: a projection states the expression for a rolled amount and the number for a fixed one', () => {
  assert.equal(fixed().getDescription(), '2x item');
  assert.equal(fixed({ quantityFormula: ' 1d4+1 ' }).getDescription(), '1d4+1x item');
});
