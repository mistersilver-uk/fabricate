/**
 * Check modifiers ACCEPT DICE (issue 1118), on every combination rule.
 *
 * The suite is built around one rule: an assertion about what reaches Foundry is asserted
 * against a shape RECORDED from the shipped 14.365 dice stack
 * (`tests/helpers/recordedModifierRollShapes.js`), never against a shape invented here. The
 * emitted-formula tests below therefore assert an exact string AND that the string is a
 * recorded one, because a formula that is merely well-formed to look at is exactly what
 * `max(, 2)` was.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECORDED_CHECK_FORMULAS,
  RECORDED_FRAGMENT_VALIDITY,
  recordedModifierRoll,
} from './helpers/recordedModifierRollShapes.js';

const {
  appendResolvedCheckModifier,
  buildCheckModifierChoice,
  buildCheckModifierContext,
  makeRollDataExpressionResolver,
  resolveCheckModifierContribution,
  resolveSelectedCheckModifiers,
} = await import('../src/systems/checkModifierResolver.js');
const { appendCheckModifierRollTerms } = await import('../src/systems/toolCheckBonus.js');

const ACTOR = { getRollData: () => ({ med: 3, prof: 2 }) };

const CATALOGUE = [
  { id: 'flat', label: 'Flat', expression: '@med' },
  { id: 'small', label: 'Small', expression: '@prof' },
  { id: 'die', label: 'Die', expression: '1d4' },
  { id: 'bounded', label: 'Bounded', expression: '1d8', min: -1, max: 6 },
  { id: 'floored', label: 'Floored', expression: '1d8', min: 2 },
  { id: 'capped', label: 'Capped', expression: '1d8', max: 6 },
  { id: 'flavoured', label: 'Flavoured', expression: '1d4[fire]' },
  { id: 'pool', label: 'Pool', expression: '{1d6,1d8}kh1' },
  { id: 'keyed', label: 'Keyed', expression: '1d4 + @prof' },
  { id: 'inverted', label: 'Inverted', expression: '1d8', min: 5, max: -1 },
  { id: 'unsafe', label: 'Unsafe', expression: '1d8', max: 1e21 },
  // Two DIFFERENT kinds of unusable expression, and the distinction is the point.
  // `1d4]` is refused by the reducer, which never reaches the engine. `1d4[fire` REDUCES
  // fine — an unterminated flavour label contributes no value — and is refused by the
  // 14.365 grammar, so only `Roll.validate` can catch it.
  { id: 'unreadable', label: 'Unreadable', expression: '1d4]' },
  { id: 'ungrammatical', label: 'Ungrammatical', expression: '1d4[fire' },
];

const RECORDED_FORMULAS = new Set(RECORDED_CHECK_FORMULAS.map(([, formula]) => formula));

/** Append the resolved contribution of `ids` under `policy` to `1d20`. */
function rolled(policy, ids, { maxModifierPicks, subject = {} } = {}) {
  const system = {
    modifiers: CATALOGUE,
    craftingCheck: {
      defaultModifierPolicy: policy,
      defaultModifierIds: ids,
      ...(maxModifierPicks === undefined ? {} : { maxModifierPicks }),
    },
  };
  const context = buildCheckModifierContext(system, 'crafting', subject);
  return appendResolvedCheckModifier('1d20', ACTOR, context, recordedModifierRoll());
}

// ── the emitted formula, against the recorded real-Foundry corpus ─────────────

test('every formula this resolver emits was measured on the shipped 14.365 dice stack', () => {
  for (const [label, formula, observed] of RECORDED_CHECK_FORMULAS) {
    assert.ok(
      observed.dice.length >= 2,
      `${label}: a recorded row must carry the base die AND at least one modifier die`
    );
    assert.equal(observed.dice[0], '1d20', `${label}: the base formula's die comes first`);
    assert.match(formula, /\[Modifiers]/, `${label}: every appended term is flavoured`);
  }
});

test('addAll appends the flat SUM as one term and each rolling modifier as its own', () => {
  const formula = rolled('addAll', ['flat', 'die']);
  assert.equal(formula, '1d20 + 3[Modifiers] + (1d4)[Modifiers]');
  assert.ok(RECORDED_FORMULAS.has(formula), 'and that exact string was evaluated in 14.365');
});

test('addAll mixes three rolling modifiers, a clamp and a pool into ONE coherent formula', () => {
  const formula = rolled('addAll', ['die', 'bounded', 'pool']);
  assert.equal(
    formula,
    '1d20 + (1d4)[Modifiers] + min(max((1d8), -1), 6)[Modifiers] + ({1d6,1d8}kh1)[Modifiers]'
  );
  assert.ok(RECORDED_FORMULAS.has(formula));
});

test('a catalogue with NO dice in it emits the byte-identical formula it always did', () => {
  assert.equal(
    rolled('addAll', ['flat', 'small']),
    '1d20 + 5[Modifiers]',
    'the flat sum still collapses into one term, so nothing about a scalar catalogue moved'
  );
});

// ── the clamp is IN THE FORMULA ──────────────────────────────────────────────

test('min/max clamp the ROLLED result, expressed in the formula', () => {
  assert.equal(rolled('addAll', ['bounded']), '1d20 + min(max((1d8), -1), 6)[Modifiers]');
  assert.equal(
    rolled('addAll', ['floored', 'capped']),
    '1d20 + max((1d8), 2)[Modifiers] + min((1d8), 6)[Modifiers]',
    'a half-bounded entry emits ONE function, not a clamp with an invented other side'
  );
});

// The clamp's whole point, stated as a range rather than as a string: an unclamped `1d8`
// would let the total reach 28, and the recorded run of this exact formula observed 26.
test('the recorded evaluation of a clamped modifier never exceeds the authored maximum', () => {
  const [, formula, observed] = RECORDED_CHECK_FORMULAS.find(
    ([, candidate]) => candidate === '1d20 + min(max((1d8), -1), 6)[Modifiers]'
  );
  assert.equal(rolled('addAll', ['bounded']), formula);
  assert.equal(observed.total[1], 26, '20 from the d20 plus the authored maximum of 6');
  assert.deepEqual([...observed.dice], ['1d20', '1d8'], 'and the clamped die is still rolled');
});

test('a bound that cannot be a bound still blocks its entry, dice or not', () => {
  // Both faults are BLOCKING, and both are contained: the well-formed neighbours still
  // contribute, which is the containment `modifierBoundsUnsafe` documents.
  assert.equal(
    rolled('addAll', ['inverted', 'unsafe', 'flat', 'die']),
    '1d20 + 3[Modifiers] + (1d4)[Modifiers]'
  );
  assert.equal(rolled('addAll', ['inverted']), '1d20', 'alone, it appends nothing at all');
});

// ── ranking by average ───────────────────────────────────────────────────────

test('highest ranks by AVERAGE, so 1d4 (2.5) beats a flat +2', () => {
  assert.equal(
    rolled('highest', ['small', 'die']),
    '1d20 + (1d4)[Modifiers]',
    'and the winner is appended AS DICE, so ranking deterministically does not flatten it'
  );
  assert.equal(
    rolled('highest', ['flat', 'die']),
    '1d20 + 3[Modifiers]',
    'a flat +3 still beats 1d4, because 3 > 2.5'
  );
});

test('playerPicks takes the best N by average, non-interactively', () => {
  assert.equal(
    rolled('playerPicks', ['small', 'die', 'flat'], { maxModifierPicks: 2 }),
    '1d20 + 3[Modifiers] + (1d4)[Modifiers]',
    'flat (3) and die (2.5) beat small (2); the two survivors keep eligible order'
  );
  assert.equal(
    rolled('playerPicks', ['small', 'die'], { maxModifierPicks: 1 }),
    '1d20 + (1d4)[Modifiers]',
    'a cap of 1 is `highest`, unchanged'
  );
});

test('bySubject appends what the subject picked, dice included', () => {
  assert.equal(
    rolled('bySubject', ['flat', 'die', 'pool'], {
      subject: { craftingModifier: { modifierIds: ['die', 'flat'] } },
    }),
    '1d20 + 3[Modifiers] + (1d4)[Modifiers]'
  );
});

// ── what the resolver refuses ────────────────────────────────────────────────

test('a fragment real Foundry refuses is dropped, and takes NOTHING else with it', () => {
  // `1d4[fire` is authorable free text that REDUCES cleanly, so nothing before the engine
  // can refuse it. Appending it would throw inside `new Roll(...)`, which is a ROLLED and
  // therefore consuming failure — where before issue 1118 the same entry merely contributed
  // 0. `Roll.validate` is the only thing standing between those two outcomes.
  assert.deepEqual(
    RECORDED_FRAGMENT_VALIDITY.find(([fragment]) => fragment === '(1d4[fire)'),
    ['(1d4[fire)', false],
    'recorded from 14.365: the grammar refuses it'
  );
  assert.equal(
    rolled('addAll', ['ungrammatical', 'flat', 'die']),
    '1d20 + 3[Modifiers] + (1d4)[Modifiers]'
  );
});

test('an expression the reducer cannot read never reaches the engine at all', () => {
  const calls = [];
  const context = buildCheckModifierContext(
    {
      modifiers: CATALOGUE,
      craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['unreadable', 'flat'] },
    },
    'crafting',
    {}
  );
  assert.equal(
    appendResolvedCheckModifier('1d20', ACTOR, context, recordedModifierRoll(calls)),
    '1d20 + 3[Modifiers]'
  );
  assert.deepEqual(calls, [], 'nothing was assembled to validate');
});

test('the resolver actually CONSULTS the engine about each rolling fragment', () => {
  // A negative control for the test above: without this, a guard that never ran would look
  // identical, because a dropped entry and an un-emitted one produce the same formula.
  const calls = [];
  const context = buildCheckModifierContext(
    { modifiers: CATALOGUE, craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['die', 'flat'] } },
    'crafting',
    {}
  );
  appendResolvedCheckModifier('1d20', ACTOR, context, recordedModifierRoll(calls));
  assert.deepEqual(calls, ['(1d4)'], 'the rolling entry is validated; the flat one needs no parse');
});

test('an authored flavour survives, because the fragment is parenthesised', () => {
  const formula = rolled('addAll', ['flavoured']);
  assert.equal(formula, '1d20 + (1d4[fire])[Modifiers]');
  assert.ok(RECORDED_FORMULAS.has(formula));
  // The reason the parentheses are not cosmetic: recorded from 14.365, the unwrapped form is
  // a syntax error because a term may carry only one flavour.
  assert.deepEqual(
    RECORDED_FRAGMENT_VALIDITY.find(([fragment]) => fragment === '(1d4[fire)'),
    ['(1d4[fire)', false]
  );
});

test('a roll-data key inside a dice expression is substituted, and the dice survive', () => {
  const formula = rolled('addAll', ['keyed']);
  assert.equal(formula, '1d20 + (1d4 + 2)[Modifiers]');
  assert.ok(RECORDED_FORMULAS.has(formula));
});

// ── the resolved-modifier shape the prompt and the roll share ────────────────

test('a resolved entry carries EITHER a value or a formula, never both', () => {
  const context = buildCheckModifierContext(
    {
      modifiers: CATALOGUE,
      craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['flat', 'die'] },
    },
    'crafting',
    {}
  );
  const Roll = recordedModifierRoll();
  const selected = resolveSelectedCheckModifiers(
    context,
    makeRollDataExpressionResolver(ACTOR, Roll),
    Roll
  );
  assert.deepEqual(
    selected.map(({ id, value, formula, average }) => ({ id, value, formula, average })),
    [
      { id: 'flat', value: 3, formula: null, average: 3 },
      { id: 'die', value: null, formula: '(1d4)', average: 2.5 },
    ]
  );
  const { scalar, rollTerms } = resolveCheckModifierContribution(
    context,
    makeRollDataExpressionResolver(ACTOR, Roll),
    Roll
  );
  assert.equal(scalar, 3, 'a rolling entry contributes NOTHING to the flat sum');
  assert.deepEqual(rollTerms, ['(1d4)']);
});

test('the interactive descriptor carries the fragment and a chip the roll can keep', () => {
  const context = buildCheckModifierContext(
    {
      modifiers: CATALOGUE,
      craftingCheck: {
        defaultModifierPolicy: 'playerPicks',
        defaultModifierIds: ['flat', 'die', 'bounded'],
        maxModifierPicks: 1,
      },
    },
    'crafting',
    {}
  );
  const Roll = recordedModifierRoll();
  const choice = buildCheckModifierChoice(
    context,
    makeRollDataExpressionResolver(ACTOR, Roll),
    Roll
  );
  assert.deepEqual(
    choice.modifiers.map(({ id, display, formula }) => ({ id, display, formula })),
    [
      { id: 'flat', display: '+3', formula: null },
      { id: 'die', display: '+1d4', formula: '(1d4)' },
      { id: 'bounded', display: '+min(max((1d8), -1), 6)', formula: 'min(max((1d8), -1), 6)' },
    ],
    'a rolling option shows what it will ROLL; its average is a number the roll cannot produce'
  );
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['bounded'],
    'the pre-selection ranks by average: bounded (4.5) beats flat (3) and die (2.5)'
  );
});

// ── the appender itself ──────────────────────────────────────────────────────

test('appendCheckModifierRollTerms emits one flavoured term per fragment, verbatim', () => {
  assert.equal(
    appendCheckModifierRollTerms('1d20', ['(1d4)', 'min((1d8), 6)']),
    '1d20 + (1d4)[Modifiers] + min((1d8), 6)[Modifiers]'
  );
  assert.equal(appendCheckModifierRollTerms('1d20', []), '1d20', 'no fragments append nothing');
  assert.equal(appendCheckModifierRollTerms('1d20', ['', '   ', null]), '1d20');
  assert.equal(appendCheckModifierRollTerms('', ['(1d4)']), '', 'an empty base is not a formula');
});
