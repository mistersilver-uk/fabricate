/**
 * The words a refused Iterative Attempt reads (issue 3011, D-14): a literal table of every C4
 * reason against its detail, the interpolated lines and their fallbacks, and the rules that rank
 * the reply's own message, an additional-dice refusal and a secret reply.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ITERATIVE_ATTEMPT_REFUSALS } from '../../src/systems/iterative/preflightAttempt.js';
import { iterativeRefusalCopy } from '../../src/ui/presenters/iterative/iterativeRefusalCopy.js';
import { JOURNAL_RUN_REASON_KEYS } from '../../src/ui/svelte/util/journalRunReasons.js';
import { workpieceLocalize as localize } from '../helpers/iterativeJournalListing.js';

const GENERIC = 'Crafting failed.';
const UNSPENT = 'Nothing was spent and the session wasn’t counted.';
const COUNTERS = { heat: 'Heat', fuel: 'Fuel' };
const CARD = {
  requirements: 'Heat 4 or more',
  costEntries: { burn: 'fuel', hidden: 'qzxHidden' },
  effectIds: ['warm'],
};

const mapped = (reason) => localize(JOURNAL_RUN_REASON_KEYS[reason]);
const copy = (result, extra = {}) =>
  iterativeRefusalCopy(result, {
    card: CARD,
    counters: COUNTERS,
    localize,
    generic: GENERIC,
    ...extra,
  });

describe('the interpolated lines', () => {
  const table = [
    [
      'unknown-counter',
      { counterId: 'fuel' },
      `This action uses Fuel, which isn’t tracked here. Ask your GM to review it. ${UNSPENT}`,
    ],
    [
      'expression-invalid',
      { entryId: 'burn' },
      `The Fuel cost doesn’t work out. Ask your GM to review it. ${UNSPENT}`,
    ],
    [
      'cost-unaffordable',
      { entryId: 'burn', counterId: 'fuel', amount: 5, value: 3 },
      `Needs 5 Fuel; the piece has 3. ${UNSPENT}`,
    ],
    [
      'cost-unaffordable',
      { entryId: 'burn', counterId: 'fuel', amount: 2, value: 0 },
      `Needs 2 Fuel; the piece has 0. ${UNSPENT}`,
    ],
    ['action-unavailable', { actionId: 'temper' }, `Needs Heat 4 or more. ${UNSPENT}`],
    [
      'roll-unavailable',
      { entryId: 'warm' },
      `The dice for one of this action’s effects couldn’t be rolled. Choose the action again. ${UNSPENT}`,
    ],
  ];
  for (const [reason, detail, expected] of table) {
    test(`${reason} ${JSON.stringify(detail)}`, () => {
      assert.equal(copy({ success: false, reason, detail }), expected);
    });
  }
});

describe('every C4 reason reads a sentence and never a raw code', () => {
  const reasons = [
    ...Object.values(ITERATIVE_ATTEMPT_REFUSALS),
    'stale-run',
    'command-timeout',
    'queue-timeout',
    'operation-failed',
    'action-not-found',
    'step-not-started',
    'step-time-pending',
    'tools-unavailable',
    'iterative-not-ready',
  ];
  for (const reason of reasons) {
    test(reason, () => {
      const result = copy({ success: false, reason, detail: {} }, { card: null });
      assert.notEqual(result, '');
      assert.ok(!result.includes('{'), `${reason} left a placeholder: ${result}`);
      assert.ok(!result.includes(reason), `${reason} printed its own code: ${result}`);
      if (JOURNAL_RUN_REASON_KEYS[reason]) assert.equal(result, mapped(reason));
    });
  }

  test('an unmapped code falls back to the generic line, never its slug', () => {
    assert.equal(copy({ success: false, reason: 'made-up-code' }), GENERIC);
    assert.equal(copy({ success: false }), GENERIC);
    assert.equal(copy(null), GENERIC);
  });
});

describe('what hides, is missing or is empty falls back to the mapped sentence', () => {
  const cases = [
    [
      'a hidden counter on a cost',
      'cost-unaffordable',
      { counterId: 'qzxHidden', amount: 5, value: 3 },
    ],
    ['a missing value', 'cost-unaffordable', { counterId: 'fuel', amount: 5 }],
    ['an unknown counter id', 'unknown-counter', { counterId: 'nope' }],
    ['a cost entry on a hidden counter', 'expression-invalid', { entryId: 'hidden' }],
    ['an entry the action does not cost', 'expression-invalid', { entryId: 'missing' }],
    ['an entry that is an effect', 'expression-invalid', { entryId: 'warm' }],
    ['an empty entry id on dice', 'roll-unavailable', { entryId: '' }],
  ];
  for (const [name, reason, detail] of cases) {
    test(name, () => {
      const result = copy({ success: false, reason, detail });
      assert.equal(result, JOURNAL_RUN_REASON_KEYS[reason] ? mapped(reason) : GENERIC);
      assert.ok(!result.includes('Qzx') && !result.includes('qzx'));
    });
  }

  test('an action with no known requirements reads the mapped sentence', () => {
    const result = copy(
      { success: false, reason: 'action-unavailable', detail: {} },
      { card: { requirements: '' } }
    );
    assert.equal(result, mapped('action-unavailable'));
  });

  test('an absent card and empty counters still read the mapped sentence', () => {
    const result = iterativeRefusalCopy(
      {
        success: false,
        reason: 'cost-unaffordable',
        detail: { counterId: 'fuel', amount: 1, value: 0 },
      },
      { localize, generic: GENERIC }
    );
    assert.equal(result, mapped('cost-unaffordable'));
  });

  test('a value of 0 counts as a value', () => {
    const detail = { counterId: 'fuel', amount: 1, value: 0 };
    assert.match(
      copy({ success: false, reason: 'cost-unaffordable', detail }),
      /the piece has 0\./
    );
  });
});

describe('ranking', () => {
  test('the reply’s own message wins over every line', () => {
    const detail = { counterId: 'fuel', amount: 5, value: 3 };
    const result = copy({
      success: false,
      reason: 'cost-unaffordable',
      detail,
      message: ' The GM says no. ',
    });
    assert.equal(result, 'The GM says no.');
  });

  test('a secret refusal reads the shipped operation-failed line, whatever else it carries', () => {
    const result = copy({
      success: false,
      secret: true,
      reason: 'cost-unaffordable',
      message: 'leak',
      detail: { counterId: 'fuel', amount: 5, value: 3 },
    });
    assert.equal(result, mapped('operation-failed'));
  });

  test('an additional-dice refusal uses the additional-dice wording', () => {
    const result = copy({
      success: false,
      reason: 'additional-dice-refused',
      additionalDiceRefusal: 'sourceMissing',
      additionalDiceNotice: {},
    });
    assert.ok(result.length > 0 && result !== mapped('additional-dice-refused'));
  });

  test('bought dice drop the unspent clause and state the spend instead', () => {
    const detail = { counterId: 'fuel', amount: 5, value: 3 };
    const result = copy({
      success: false,
      reason: 'cost-unaffordable',
      detail,
      boughtDice: 2,
      additionalDiceNotice: { label: 'Fate' },
    });
    assert.ok(result.startsWith('Needs 5 Fuel; the piece has 3.'));
    assert.ok(!result.includes('Nothing was spent'), result);
    assert.match(result, /2 Fate spent; the roll could not be completed\./);
  });

  test('bought dice also strip the clause from a mapped sentence', () => {
    const result = copy({ success: false, reason: 'step-ended', boughtDice: 1 });
    assert.ok(!result.includes('Nothing was spent'), result);
    assert.match(result, /spent; the roll could not be completed\./);
  });

  test('a mapped sentence that already ends "nothing was spent" is never extended', () => {
    const result = copy({ success: false, reason: 'step-ended' });
    assert.equal(result, mapped('step-ended'));
    assert.equal(result.split('Nothing was spent').length, 2);
  });

  test('a hidden counter falls back for a cost refusal and for every other interpolated reason alike', () => {
    for (const [reason, detail] of [
      ['cost-unaffordable', { counterId: 'qzxHidden', amount: 1, value: 0 }],
      ['unknown-counter', { counterId: 'qzxHidden' }],
    ]) {
      assert.equal(copy({ success: false, reason, detail }), mapped(reason), reason);
    }
  });
});
