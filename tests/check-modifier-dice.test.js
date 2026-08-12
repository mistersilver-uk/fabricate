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
  VALIDATE_ONLY_HOLES,
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
  // PARSE-CLEAN, EVALUATE-FATAL. Each of these is authorable free text that `Roll.validate`
  // accepts and the engine then refuses to roll, so only the maximized-roll predicate can
  // catch them. `MAX` is a capitalized function name; `1000d6` exceeds Foundry's 999-result
  // cap; `.5` is not a dice-grammar `Constant`.
  { id: 'shouty', label: 'Shouty', expression: 'MAX(1d4,2)' },
  { id: 'shouty-bounded', label: 'Shouty bounded', expression: 'MAX(1d4,2)', min: -1, max: 6 },
  { id: 'oversized', label: 'Oversized', expression: '1000d6' },
  { id: 'leading-dot', label: 'Leading dot', expression: '1d4 + .5' },
  // NON-FINITE rather than fatal. Its MEAN is finite (2^566.5), so the reducer values it and
  // hands it on; maximized it is 2^1030 = `Infinity`, nothing throws, and `Roll#total`'s
  // `Number(this._total) || 0` hands that back as a number. Only the finite test refuses it —
  // and the bounded sibling below IS accepted, because the clamp genuinely contains it.
  { id: 'explosive', label: 'Explosive', expression: 'pow(2, 1d10 * 103)' },
  {
    id: 'explosive-bounded',
    label: 'Contained',
    expression: 'pow(2, 1d10 * 103)',
    min: -1,
    max: 6,
  },
];

const RECORDED_FORMULAS = new Set(RECORDED_CHECK_FORMULAS.map((row) => row.formula));

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

// THE MIRROR GUARD. Every recorded row carries the `(policy, ids)` that produces it, and this
// drives the real resolver with it. Asserting shape properties of the fixture instead — which
// is what this test did first — passes forever on a row nothing emits.
test('every recorded formula is one this resolver actually emits', () => {
  for (const row of RECORDED_CHECK_FORMULAS) {
    assert.equal(
      rolled(row.produce.policy, row.produce.ids),
      row.formula,
      `${row.label}: the recorded 14.365 measurement must describe what ships`
    );
    assert.equal(row.dice[0], '1d20', `${row.label}: the base formula's die comes first`);
    assert.match(row.formula, /\[Modifiers]/, `${row.label}: every appended term is flavoured`);
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
  const row = RECORDED_CHECK_FORMULAS.find(
    (candidate) => candidate.formula === '1d20 + min(max((1d8), -1), 6)[Modifiers]'
  );
  assert.equal(rolled('addAll', ['bounded']), row.formula);
  assert.equal(row.total[1], 26, '20 from the d20 plus the authored maximum of 6');
  assert.deepEqual([...row.dice], ['1d20', '1d8'], 'and the clamped die is still rolled');
});

test('a bound that cannot be a bound still blocks its entry, dice or not', () => {
  // Both faults are BLOCKING, and both are contained: the well-formed neighbours still
  // contribute, which is the containment `modifierBoundsUnsafe` documents.
  const calls = [];
  const system = {
    modifiers: CATALOGUE,
    craftingCheck: {
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['inverted', 'unsafe', 'flat', 'die'],
    },
  };
  const context = buildCheckModifierContext(system, 'crafting', {});
  assert.equal(
    appendResolvedCheckModifier('1d20', ACTOR, context, recordedModifierRoll(calls)),
    '1d20 + 3[Modifiers] + (1d4)[Modifiers]'
  );
  // THE CALL LIST, not just the formula. A faulted bound must be refused BEFORE a fragment is
  // built from it — otherwise `min(max((1d8), 5), -1)` reaches the engine, and a guard that
  // treats "the engine could not answer" as "unrollable" would swallow the mistake and emit
  // the identical formula. Mutation found exactly that: dropping the bounds gate changed no
  // assertion until this one existed.
  assert.deepEqual(calls, ['(1d4)'], 'only the well-formed rolling entry is ever assembled');
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
    ['(1d4[fire)', false, 'throws'],
    'recorded from 14.365: the grammar refuses it, and it throws at evaluate'
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
    ['(1d4[fire)', false, 'throws']
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
      { id: 'bounded', display: '+1d8 (-1 to 6)', formula: 'min(max((1d8), -1), 6)' },
    ],
    'a rolling option shows what it will ROLL; its average is a number the roll cannot produce'
  );
  // The chip is written for a PLAYER and the fragment for the dice engine. Reading the chip
  // back out of the fragment put `+min((1d4), 3)` on screen — parentheses that exist to make
  // the append parse, and a function wrapper that is how a bound is spelled to Foundry.
  assert.ok(
    !choice.modifiers.some((modifier) => modifier.display.includes('min(')),
    'no chip renders the engine spelling of a bound'
  );
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['bounded'],
    'the pre-selection ranks by average: bounded (4.5) beats flat (3) and die (2.5)'
  );
});

// ── the engine guard is an EVALUATE oracle, not a parse one (issue 1118 review) ──
//
// `Roll.validate` is `evaluateSync({strict: false})`, and `_evaluateASTSync` skips every
// non-deterministic node — so on a fragment that rolls it exercises no evaluate-time error
// class at all. Eight recorded fragments validate `true` and cannot be rolled.

test('the recorded oracle carries fragments Roll.validate accepts and the engine refuses', () => {
  assert.ok(
    VALIDATE_ONLY_HOLES.length >= 8,
    'without these rows the suite cannot tell a parse oracle from an evaluate one'
  );
  for (const [fragment, validates, evaluates] of VALIDATE_ONLY_HOLES) {
    assert.equal(validates, true, `${fragment} parses`);
    assert.notEqual(evaluates, 'rolls', `${fragment} cannot actually be rolled`);
  }
});

test('a fragment that PARSES but cannot be rolled is dropped, and takes nothing with it', () => {
  // Every one of these validated `true` on the real stack and threw at evaluate. Appending
  // any of them makes `new Roll(...)` throw inside `evaluateCheckRoll`, which the runners
  // catch as a FAILED check — ingredients spent and tools broken, on every attempt.
  for (const id of ['shouty', 'oversized', 'leading-dot']) {
    assert.equal(
      rolled('addAll', [id, 'flat', 'die']),
      '1d20 + 3[Modifiers] + (1d4)[Modifiers]',
      `${id} contributes nothing and the well-formed entries survive`
    );
  }
});

test('the clamp wrapper does not launder an unrollable expression', () => {
  // `min(max((MAX(1d4,2)), -1), 6)` parses too: the fault is inside the wrapper, so a guard
  // that only inspected the outermost term would pass it.
  assert.equal(rolled('addAll', ['shouty-bounded', 'flat']), '1d20 + 3[Modifiers]');
});

test('a fragment that evaluates to a NON-FINITE total is refused, not appended', () => {
  // Nothing throws for this one: the guard's finite test is the only thing standing between an
  // `Infinity` and the roll. The REDUCER cannot catch it either — the expression's mean is a
  // perfectly finite 2^566.5, which is exactly why the guard evaluates MAXIMIZED.
  assert.equal(rolled('addAll', ['explosive', 'flat']), '1d20 + 3[Modifiers]');
  // …and the BOUNDED sibling is accepted, because `min(max(…, -1), 6)` really does contain it.
  // A guard that refused anything mentioning `pow` would fail this half.
  assert.equal(
    rolled('addAll', ['explosive-bounded']),
    '1d20 + min(max((pow(2, 1d10 * 103)), -1), 6)[Modifiers]'
  );
});

test('the empty-head trap is closed by the finite test, not by the throw', () => {
  // `max(, 2)` PARSES, EVALUATES and totals `Math.max()` = -Infinity, which `Roll#total`'s
  // `Number(this._total) || 0` passes through as a number. Nothing throws; only the finite
  // test refuses it. Asserted through the double's own recorded behaviour, because no
  // authored expression the resolver accepts reaches this shape any more.
  const Roll = recordedModifierRoll();
  const roll = new Roll('max(, 2)');
  roll.evaluateSync({ maximize: true });
  assert.equal(Number.isFinite(roll.total), false, 'the total is -Infinity, and not an error');
  assert.equal(Roll.validate('max(, 2)'), true, 'and Roll.validate says it is fine');
});

test('an engine that cannot evaluate fails the guard OPEN', () => {
  // The shape that actually occurs: a minimal `Roll` stub carrying `replaceFormulaData` and
  // nothing else — every headless harness in this repo. Nothing evaluates the formula there,
  // so refusing would silently delete every rolling modifier from every headless resolution.
  // Inverting the posture to fail-closed must redden something, which is what this asserts.
  //
  // A `Roll` that is absent ENTIRELY is a different state and not this one: substitution
  // itself needs `replaceFormulaData`, so the entry never reaches the guard at all.
  class SubstituteOnlyRoll {
    static replaceFormulaData(formula) {
      return String(formula);
    }
  }
  const system = {
    modifiers: CATALOGUE,
    craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['die'] },
  };
  const context = buildCheckModifierContext(system, 'crafting', {});
  assert.equal(
    appendResolvedCheckModifier('1d20', ACTOR, context, SubstituteOnlyRoll),
    '1d20 + (1d4)[Modifiers]',
    'no evaluator: the fragment is emitted rather than dropped'
  );
  assert.equal(
    appendResolvedCheckModifier('1d20', ACTOR, context, undefined),
    '1d20',
    'and with no Roll at all nothing substitutes, so no entry resolves in the first place'
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
