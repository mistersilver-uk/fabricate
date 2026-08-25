// Unit tests for the pure system-level check-modifier resolver (issues 770, 1055, 1095).
import test from 'node:test';
import assert from 'node:assert/strict';

const RESOLVER_MODULE = '../src/systems/checkModifierResolver.js';

const {
  MODIFIER_POLICIES,
  normalizeModifierPolicy,
  policyDefersSelection,
  resolveMaxModifierPicks,
  buildCheckModifierContext,
  resolveActiveCraftingCheckFormula,
  resolveModifierPolicy,
  resolveEligibleModifierIds,
  resolveCheckModifierContribution,
  resolveSelectedCheckModifiers,
  buildCheckModifierChoice,
  evaluateNumericExpression,
  makeRollDataExpressionResolver,
  appendResolvedCheckModifier,
  clampModifierValue,
  resolveModifierBounds,
  resolveActiveSalvageCheckFormula,
  resolveActiveGatheringCheckFormula,
  isRollExpression,
} = await import(RESOLVER_MODULE);
const { appendCheckModifierTerm } = await import('../src/systems/toolCheckBonus.js');

// The FLAT half of a resolved contribution. Every rule's arithmetic below is asserted
// through this, because a catalogue of flat entries must reduce exactly as it did before
// issue 1118 taught the same rules to carry dice; the dice half has its own suite in
// `tests/check-modifier-dice.test.js`.
function scalarOf(context, resolveExpression) {
  return resolveCheckModifierContribution(context, resolveExpression).scalar;
}

const CATALOGUE = [
  { id: 'med', label: 'Medicine', expression: '@med' },
  { id: 'alch', label: 'Alchemy', expression: '@alch' },
  { id: 'herb', label: 'Herbalism', expression: '@herb' },
];

// A deterministic expression evaluator keyed by the catalogue's expression string.
function evaluatorFor(values) {
  return (expression) => (expression in values ? values[expression] : 0);
}

// ── the four combination rules (issue 1055) ──────────────────────────────────

test('MODIFIER_POLICIES is the frozen authoring order of all FOUR combination rules', () => {
  assert.deepEqual(
    [...MODIFIER_POLICIES],
    ['addAll', 'highest', 'bySubject', 'playerPicks'],
    'the two non-selecting rules first, then the two that defer the selection'
  );
  assert.ok(Object.isFrozen(MODIFIER_POLICIES));
  assert.ok(
    !MODIFIER_POLICIES.includes('byRecipe'),
    'the pre-1095 spelling is a READ alias, never an offerable rule — an authoring surface ' +
      'that rendered it would let a GM re-author a token nothing re-emits'
  );
});

test('normalizeModifierPolicy accepts every offerable rule and nulls everything else', () => {
  for (const policy of MODIFIER_POLICIES) assert.equal(normalizeModifierPolicy(policy), policy);
  for (const junk of ['bogus', '', undefined, null, 3, {}]) {
    assert.equal(normalizeModifierPolicy(junk), null, `${JSON.stringify(junk)} is not a rule`);
  }
});

// The pre-1095 spelling, READ and never RE-EMITTED (issue 1095). It is the same
// new-then-legacy shape `breakToolsOnFail` uses for `consumeCatalystsOnFail`: a world that
// has not yet run the `1.22.0` migration still resolves and renders correctly, and the
// first save rewrites the token.
test('normalizeModifierPolicy reads the legacy byRecipe token as bySubject and never returns it', () => {
  assert.equal(normalizeModifierPolicy('byRecipe'), 'bySubject');
  // The re-emit guard, stated as an assertion rather than as a comment: NOTHING this
  // function can return is the legacy spelling, for any input at all.
  const returned = new Set(
    ['byRecipe', 'bySubject', 'addAll', 'highest', 'playerPicks', 'bogus', null, undefined, 7].map(
      (input) => normalizeModifierPolicy(input)
    )
  );
  assert.ok(!returned.has('byRecipe'), 'the legacy token is never re-emitted, for any input');
  // …and it reaches the rest of the resolver as the rule it aliases, not as an unknown.
  assert.equal(resolveModifierPolicy({ systemPolicy: 'byRecipe' }), 'bySubject');
  assert.equal(
    policyDefersSelection('byRecipe'),
    true,
    'a raw membership test would answer false here and silently hide the pick cap on an ' +
      'un-migrated world'
  );
});

// The membership test both authoring surfaces ask rather than re-deriving: the Checks
// card shows the cap input under exactly these rules, and the recipe editor offers its
// picker under `bySubject`.
test('policyDefersSelection is true for bySubject and playerPicks only', () => {
  for (const policy of ['bySubject', 'playerPicks']) {
    assert.equal(policyDefersSelection(policy), true, `${policy} hands the selection to someone`);
  }
  for (const policy of ['addAll', 'highest', 'bogus', '', undefined, null]) {
    assert.equal(
      policyDefersSelection(policy),
      false,
      `${String(policy)} does not defer the selection, so a cap means nothing to it`
    );
  }
});

// ── the pick cap (issue 1055) ────────────────────────────────────────────────
//
// ABSENCE IS UNLIMITED, and every unbounded FORM reports the same `Infinity`, so no
// caller has to special-case a sentinel. A system that has never been asked the question
// must not silently acquire a bound that truncates recipe picks already on disk — the
// `1.20.0` migration, not this function, is where historical `playerPicks` worlds get
// their `1`.
test('resolveMaxModifierPicks reports every unbounded form as Infinity', () => {
  for (const maxModifierPicks of [undefined, null, 0, -1, 2.5, Infinity, NaN, '', 'three', {}]) {
    assert.equal(
      resolveMaxModifierPicks({ maxModifierPicks }),
      Infinity,
      `${String(maxModifierPicks)} is not a usable bound, so it is unlimited`
    );
  }
  assert.equal(resolveMaxModifierPicks({}), Infinity, 'an absent key is unlimited');
  assert.equal(resolveMaxModifierPicks(null), Infinity, 'and so is no context at all');
  assert.equal(resolveMaxModifierPicks(undefined), Infinity);
});

test('resolveMaxModifierPicks passes a positive integer through, including a numeric string', () => {
  for (const [input, expected] of [
    [1, 1],
    [3, 3],
    [12, 12],
    // `Number('2')` is an integer, so a setting persisted as a string still bounds.
    ['2', 2],
  ]) {
    assert.equal(resolveMaxModifierPicks({ maxModifierPicks: input }), expected);
  }
});

// ── rule resolution: the SYSTEM decides, full stop ───────────────────────────

test('resolveModifierPolicy reads the system rule and NEVER a recipe override', () => {
  assert.equal(resolveModifierPolicy({ systemPolicy: 'highest' }), 'highest');
  assert.equal(resolveModifierPolicy({ systemPolicy: 'bySubject' }), 'bySubject');
  assert.equal(resolveModifierPolicy({}), 'addAll', 'no rule anywhere → addAll');
  assert.equal(resolveModifierPolicy(null), 'addAll', 'and no context at all → addAll');
  assert.equal(resolveModifierPolicy({ systemPolicy: 'bogus' }), 'addAll');
  // A legacy `craftingModifier.policy` left on disk by a pre-1055 world stays on disk and
  // stays UNHONOURED. The invariant lives in the resolver rather than at the authoring
  // control, so no hand-built context can smuggle a rule override back in.
  for (const stale of ['addAll', 'highest', 'bySubject', 'playerPicks']) {
    assert.equal(
      resolveModifierPolicy({ systemPolicy: 'highest', subjectPolicy: stale }),
      'highest',
      `a stored subject rule (${stale}) cannot override the system's`
    );
  }
});

// ── eligible id resolution ───────────────────────────────────────────────────

test('resolveEligibleModifierIds uses system defaults, drops unknown + duplicate ids', () => {
  const ids = resolveEligibleModifierIds({
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'ghost', 'alch', 'med'],
  });
  assert.deepEqual(ids, ['med', 'alch'], 'unknown "ghost" and duplicate "med" dropped, order kept');
});

test('resolveEligibleModifierIds: the recipe SET is the source under bySubject ONLY', () => {
  const base = {
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'alch', 'herb'],
    subjectModifierIds: ['alch'],
  };
  assert.deepEqual(
    resolveEligibleModifierIds({ ...base, systemPolicy: 'bySubject' }),
    ['alch'],
    'bySubject hands the selection to the subject author'
  );
  for (const systemPolicy of ['addAll', 'highest', 'playerPicks', undefined, 'bogus']) {
    assert.deepEqual(
      resolveEligibleModifierIds({ ...base, systemPolicy }),
      ['med', 'alch', 'herb'],
      `at ${String(systemPolicy)} the system default set is the source and the stored subset is ignored`
    );
  }
});

test('resolveEligibleModifierIds: an AUTHORED empty set resolves to no modifiers under bySubject', () => {
  const context = {
    catalogue: CATALOGUE,
    defaultModifierIds: ['med', 'alch'],
    subjectModifierIds: [],
  };
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, systemPolicy: 'bySubject' }),
    [],
    'an authored empty array is an override, not an absence'
  );
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, systemPolicy: 'addAll' }),
    ['med', 'alch'],
    '…and it is ignored like any other recipe pick under a rule that does not defer'
  );
});

test('resolveEligibleModifierIds: recipe with no modifierIds array falls back to defaults', () => {
  const ids = resolveEligibleModifierIds({
    catalogue: CATALOGUE,
    systemPolicy: 'bySubject',
    defaultModifierIds: ['med'],
    subjectModifierIds: null,
  });
  assert.deepEqual(ids, ['med'], 'nothing picked → the system default set');
});

// The cap is enforced HERE and not only at the picker, per "a UI control's constraint is
// never an invariant": a GM who lowers the cap below what a recipe already picked must
// not leave that recipe rolling more modifiers than the system now permits.
test('resolveEligibleModifierIds TRUNCATES a bySubject pick to maxModifierPicks, in authored order', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'bySubject',
    defaultModifierIds: ['med'],
    subjectModifierIds: ['herb', 'med', 'alch'],
  };
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, maxModifierPicks: 2 }),
    ['herb', 'med'],
    'the FIRST N in authored order survive — not the best N'
  );
  assert.deepEqual(resolveEligibleModifierIds({ ...context, maxModifierPicks: 1 }), ['herb']);
  assert.deepEqual(
    resolveEligibleModifierIds({ ...context, maxModifierPicks: 9 }),
    ['herb', 'med', 'alch'],
    'a cap above the pick truncates nothing'
  );
  for (const unbounded of [undefined, null, 0, -1, 2.5]) {
    assert.deepEqual(
      resolveEligibleModifierIds({ ...context, maxModifierPicks: unbounded }),
      ['herb', 'med', 'alch'],
      `${String(unbounded)} is unlimited, so the whole pick survives`
    );
  }
  // The truncation counts SURVIVORS, not source entries: an unknown id ahead of the cap
  // must not consume a slot a real pick was entitled to.
  assert.deepEqual(
    resolveEligibleModifierIds({
      ...context,
      maxModifierPicks: 2,
      subjectModifierIds: ['ghost', 'herb', 'med', 'alch'],
    }),
    ['herb', 'med'],
    'the unknown "ghost" is dropped before the cap is counted'
  );
});

// The cap bounds the SELECTION, and under `playerPicks` the eligible list is the set of
// OPTIONS OFFERED rather than a selection — so it is deliberately not truncated here.
// `buildCheckModifierChoice` carries the bound to the prompt instead.
test('resolveEligibleModifierIds does NOT truncate the playerPicks option list', () => {
  assert.deepEqual(
    resolveEligibleModifierIds({
      catalogue: CATALOGUE,
      systemPolicy: 'playerPicks',
      defaultModifierIds: ['med', 'alch', 'herb'],
      maxModifierPicks: 1,
    }),
    ['med', 'alch', 'herb'],
    'a cap of 1 still offers all three options; it bounds what the player may pick FROM them'
  );
});

// ── the one shared context bag (issue 1055) ──────────────────────────────────
//
// The engine and the listing builder both build their `@craftingmod` context HERE, so a
// displayed formula can never disagree with the rolled one. The shape is fixed: the cap
// key is always present, and `undefined` is what an unbounded system reads as.

test('buildCheckModifierContext projects the SYSTEM catalogue and the activity selection', () => {
  const system = {
    modifiers: CATALOGUE,
    craftingCheck: {
      defaultModifierPolicy: 'bySubject',
      defaultModifierIds: ['med'],
      maxModifierPicks: 2,
    },
  };
  assert.deepEqual(
    buildCheckModifierContext(system, 'crafting', {
      craftingModifier: { modifierIds: ['alch'] },
    }),
    {
      activity: 'crafting',
      catalogue: CATALOGUE,
      systemPolicy: 'bySubject',
      defaultModifierIds: ['med'],
      subjectModifierIds: ['alch'],
      maxModifierPicks: 2,
    }
  );
});

// THE ACTIVITY ARGUMENT IS LOAD-BEARING (issue 1095). One catalogue, three selections: an
// arity-2 call would resolve salvage and gathering against the CRAFTING rule, which is the
// eval-vs-display defect `CraftingListingBuilder`'s call site exists to prevent.
test('buildCheckModifierContext reads a DIFFERENT selection triple per activity', () => {
  const system = {
    modifiers: CATALOGUE,
    craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['med'] },
    salvageCraftingCheck: {
      defaultModifierPolicy: 'highest',
      defaultModifierIds: ['alch'],
      maxModifierPicks: 1,
    },
    gatheringCraftingCheck: { defaultModifierPolicy: 'bySubject', defaultModifierIds: ['herb'] },
  };
  assert.deepEqual(
    buildCheckModifierContext(system, 'salvage', null),
    {
      activity: 'salvage',
      catalogue: CATALOGUE,
      systemPolicy: 'highest',
      defaultModifierIds: ['alch'],
      subjectModifierIds: null,
      maxModifierPicks: 1,
    },
    'salvage reads salvageCraftingCheck, never craftingCheck'
  );
  assert.deepEqual(
    buildCheckModifierContext(system, 'gathering', null),
    {
      activity: 'gathering',
      catalogue: CATALOGUE,
      systemPolicy: 'bySubject',
      defaultModifierIds: ['herb'],
      subjectModifierIds: null,
      maxModifierPicks: undefined,
    },
    'gathering reads gatheringCraftingCheck'
  );
});

// The SUBJECT field differs per activity because each subject is a different record, and
// authoredness is decided by `Array.isArray` AT ENTRY on all three — so an authored EMPTY
// pick survives as `[]` (a real pick of zero) rather than collapsing to "inherit".
test('buildCheckModifierContext reads each activity subject pick, preserving an authored empty', () => {
  const system = { modifiers: CATALOGUE };
  assert.deepEqual(
    buildCheckModifierContext(system, 'crafting', { craftingModifier: { modifierIds: ['med'] } })
      .subjectModifierIds,
    ['med']
  );
  assert.deepEqual(
    buildCheckModifierContext(system, 'salvage', { salvage: { checkModifierIds: ['alch'] } })
      .subjectModifierIds,
    ['alch']
  );
  assert.deepEqual(
    buildCheckModifierContext(system, 'gathering', { checkModifierIds: ['herb'] })
      .subjectModifierIds,
    ['herb']
  );
  for (const [activity, subject] of [
    ['crafting', { craftingModifier: { modifierIds: [] } }],
    ['salvage', { salvage: { checkModifierIds: [] } }],
    ['gathering', { checkModifierIds: [] }],
  ]) {
    assert.deepEqual(
      buildCheckModifierContext(system, activity, subject).subjectModifierIds,
      [],
      `${activity}: an authored EMPTY pick is a real pick of zero, never an absence`
    );
  }
  for (const [activity, subject] of [
    ['crafting', { craftingModifier: {} }],
    ['salvage', { salvage: {} }],
    ['gathering', {}],
  ]) {
    assert.equal(
      buildCheckModifierContext(system, activity, subject).subjectModifierIds,
      null,
      `${activity}: no authored array at all means inherit`
    );
  }
});

test('buildCheckModifierContext keeps the cap key present but undefined when unbounded', () => {
  const context = buildCheckModifierContext({ craftingCheck: {} }, 'crafting', null);
  assert.equal(Object.hasOwn(context, 'maxModifierPicks'), true, 'the shape is fixed');
  assert.equal(context.maxModifierPicks, undefined, 'absence is preserved, not defaulted');
  assert.equal(context.subjectModifierIds, null, 'a subject with no pick reads as null');
  assert.equal(
    resolveMaxModifierPicks(context),
    Infinity,
    'and the resolver — not the builder — owns what that absence means'
  );
});

// `catalogue` is an ARRAY rather than `undefined` since issue 1308: the builder resolves the
// world library through `resolveModifierLibrary`, which always answers with a list. Every
// consumer already coerced with `Array.isArray(catalogue) ? catalogue : []`, so nothing
// downstream can tell the two apart.
test('buildCheckModifierContext tolerates a null system, an unknown activity and a null subject', () => {
  assert.deepEqual(buildCheckModifierContext(null, 'crafting', null), {
    activity: 'crafting',
    catalogue: [],
    systemPolicy: undefined,
    defaultModifierIds: undefined,
    subjectModifierIds: null,
    maxModifierPicks: undefined,
  });
  assert.deepEqual(buildCheckModifierContext({ modifiers: CATALOGUE }, 'bogus', {}), {
    activity: 'bogus',
    catalogue: CATALOGUE,
    systemPolicy: undefined,
    defaultModifierIds: undefined,
    subjectModifierIds: null,
    maxModifierPicks: undefined,
  });
});

// ── scalar reduction truth table ─────────────────────────────────────────────

test('the flat contribution addAll sums the eligible expression values', () => {
  const scalar = scalarOf(
    { catalogue: CATALOGUE, systemPolicy: 'addAll', defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(scalar, 9);
});

test('the flat contribution highest returns the max scalar (not a dice pool)', () => {
  const scalar = scalarOf(
    { catalogue: CATALOGUE, systemPolicy: 'highest', defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(scalar, 4);
});

// THE BACK-COMPAT GUARANTEE, at the resolver. `playerPicks` sums the BEST LEGAL
// selection: at a cap of 1 that is exactly `max(...)` — the historical single-pick
// behaviour every pre-1055 world had — and unbounded it is the plain sum, because
// picking everything is then legal and optimal.
test('the flat contribution playerPicks at cap 1 is byte-identical to highest', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'playerPicks',
    defaultModifierIds: ['med', 'alch', 'herb'],
    maxModifierPicks: 1,
  };
  const values = { '@med': 3, '@alch': 2, '@herb': 4 };
  const asPlayerPicks = scalarOf(context, evaluatorFor(values));
  const asHighest = scalarOf(
    { ...context, systemPolicy: 'highest' },
    evaluatorFor(values)
  );
  assert.equal(asPlayerPicks, 4, 'capped at one pick, the best legal selection is max(3,2,4)');
  assert.equal(asPlayerPicks, asHighest, 'the 1.20.0-migrated world rolls what it always rolled');
});

test('the flat contribution playerPicks sums the best N as the cap widens', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'playerPicks',
    defaultModifierIds: ['med', 'alch', 'herb'],
  };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  assert.equal(
    scalarOf({ ...context, maxModifierPicks: 2 }, evaluate),
    7,
    'the two HIGHEST values (herb 4 + med 3), not the first two in eligible order'
  );
  assert.equal(
    scalarOf({ ...context, maxModifierPicks: 3 }, evaluate),
    9,
    'a cap at the option count is the plain sum'
  );
  assert.equal(
    scalarOf({ ...context, maxModifierPicks: 99 }, evaluate),
    9,
    'a cap ABOVE the option count adds nothing'
  );
  // …and unbounded is the same sum, because every value is then legal to pick. This is
  // the state the `1.20.0` migration exists to keep an upgraded world OUT of.
  assert.equal(scalarOf(context, evaluate), 9, 'unbounded playerPicks sums');
});

test('the flat contribution playerPicks picks the best N even when they are negative', () => {
  // Guards the descending sort's seed: taking the FIRST two rather than the two highest
  // would reduce to -8 here.
  assert.equal(
    scalarOf(
      {
        catalogue: CATALOGUE,
        systemPolicy: 'playerPicks',
        defaultModifierIds: ['med', 'alch', 'herb'],
        maxModifierPicks: 2,
      },
      evaluatorFor({ '@med': -3, '@alch': -1, '@herb': -5 })
    ),
    -4,
    'max two of (-3,-1,-5) is -1 + -3'
  );
});

// `bySubject` needs no special case in the reduction: `resolveEligibleModifierIds` has
// already narrowed the list to the recipe's selection and truncated it to the cap, so
// SUMMING that list is the whole rule.
test('the flat contribution bySubject sums the recipe pick, truncated to the cap', () => {
  const context = {
    catalogue: CATALOGUE,
    systemPolicy: 'bySubject',
    defaultModifierIds: ['med', 'alch', 'herb'],
    subjectModifierIds: ['alch', 'herb'],
  };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  assert.equal(
    scalarOf(context, evaluate),
    6,
    'only the recipe set (alch 2 + herb 4) is summed — the system default med is excluded'
  );
  assert.equal(
    scalarOf({ ...context, maxModifierPicks: 1 }, evaluate),
    2,
    'the cap keeps the FIRST pick in authored order (alch 2), never the best one'
  );
});

test('the flat contribution bySubject with nothing picked sums the system default set', () => {
  assert.equal(
    scalarOf(
      {
        catalogue: CATALOGUE,
        systemPolicy: 'bySubject',
        defaultModifierIds: ['med', 'alch'],
        subjectModifierIds: null,
      },
      evaluatorFor({ '@med': 3, '@alch': 2 })
    ),
    5
  );
});

test('the flat contribution: an authored empty set resolves @craftingmod to 0', () => {
  assert.equal(
    scalarOf(
      {
        catalogue: CATALOGUE,
        systemPolicy: 'bySubject',
        defaultModifierIds: ['med', 'alch', 'herb'],
        subjectModifierIds: [],
      },
      evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
    ),
    0
  );
});

// The cap is meaningless to the two rules that select nothing, and must not silently
// truncate what they reduce.
test('the flat contribution: maxModifierPicks does not bound addAll or highest', () => {
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  for (const [systemPolicy, expected] of [
    ['addAll', 9],
    ['highest', 4],
  ]) {
    assert.equal(
      scalarOf(
        {
          catalogue: CATALOGUE,
          systemPolicy,
          defaultModifierIds: ['med', 'alch', 'herb'],
          maxModifierPicks: 1,
        },
        evaluate
      ),
      expected,
      `${systemPolicy} reduces its whole default set whatever the cap says`
    );
  }
});

test('the flat contribution: a missing/failed expression contributes 0, never NaN', () => {
  const scalar = scalarOf(
    { catalogue: CATALOGUE, systemPolicy: 'addAll', defaultModifierIds: ['med', 'alch'] },
    (expression) => (expression === '@med' ? 3 : NaN)
  );
  assert.equal(scalar, 3, 'NaN from @alch coerces to 0');
});

test('the flat contribution: an empty eligible set is 0', () => {
  assert.equal(
    scalarOf(
      { catalogue: CATALOGUE, systemPolicy: 'highest', defaultModifierIds: [] },
      evaluatorFor({})
    ),
    0
  );
});

// ── interactive playerPicks descriptor ───────────────────────────────────────

const ICON_CATALOGUE = [
  { id: 'med', label: 'Medicine', icon: 'fa-med', expression: '@med' },
  { id: 'alch', label: 'Alchemy', icon: 'fa-alch', expression: '@alch' },
  { id: 'herb', label: 'Herbalism', icon: 'fa-herb', expression: '@herb' },
];

test('buildCheckModifierChoice maps eligible modifiers + pre-selects the best legal set', () => {
  const choice = buildCheckModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'], maxModifierPicks: 1 },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(
    Object.hasOwn(choice, 'token'),
    false,
    'the descriptor carries no token field: there is no placeholder left to name (issue 1094)'
  );
  assert.deepEqual(choice.modifiers, [
    // `formula: null` is the FLAT half of the 1118 shape: a flat entry appends a number and
    // never a fragment, and `display` is the chip the prompt renders for it.
    { id: 'med', label: 'Medicine', icon: 'fa-med', average: 3, value: 3, formula: null, blocked: false, display: '+3' },
    { id: 'alch', label: 'Alchemy', icon: 'fa-alch', average: 2, value: 2, formula: null, blocked: false, display: '+2' },
    { id: 'herb', label: 'Herbalism', icon: 'fa-herb', average: 4, value: 4, formula: null, blocked: false, display: '+4' },
  ]);
  assert.equal(choice.maxPicks, 1, 'the cap the prompt must enforce');
  assert.deepEqual(choice.defaultSelectedIds, ['herb'], 'herb (4) is the highest');
  assert.equal(choice.defaultSelectedId, 'herb', 'the singular field is the first of them');
});

// The cap rides the descriptor, and `defaultSelectedIds` is the best LEGAL selection —
// the highest-valued `maxPicks` modifiers — so the pre-selection agrees exactly with the
// deterministic scalar a non-interactive craft would have rolled.
test('buildCheckModifierChoice carries maxPicks and pre-selects the highest N in eligible order', () => {
  const context = {
    catalogue: ICON_CATALOGUE,
    defaultModifierIds: ['med', 'alch', 'herb'],
  };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  const two = buildCheckModifierChoice({ ...context, maxModifierPicks: 2 }, evaluate);
  assert.equal(two.maxPicks, 2);
  assert.deepEqual(
    two.defaultSelectedIds,
    ['med', 'herb'],
    'the two highest (med 3, herb 4) reported back in ELIGIBLE-SET order, not value order'
  );
  assert.equal(two.defaultSelectedId, 'med', 'the singular field stays the first of them');
});

// An unbounded system offers the whole set, so `maxPicks` is CLAMPED to the option count
// rather than reported as `Infinity` — the prompt renders a control, and "up to Infinity"
// is not a control.
test('buildCheckModifierChoice clamps an unbounded cap to the option count', () => {
  const choice = buildCheckModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'] },
    evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
  );
  assert.equal(choice.maxPicks, 3, 'unlimited over three options is three');
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['med', 'alch', 'herb'],
    'everything is legal to pick, so everything is pre-selected'
  );
  // …and a cap ABOVE the option count clamps the same way.
  assert.equal(
    buildCheckModifierChoice(
      {
        catalogue: ICON_CATALOGUE,
        defaultModifierIds: ['med', 'alch', 'herb'],
        maxModifierPicks: 9,
      },
      evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 })
    ).maxPicks,
    3
  );
});

test('buildCheckModifierChoice tie-breaks equal-max by eligible-set order (first wins)', () => {
  const choice = buildCheckModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'], maxModifierPicks: 1 },
    evaluatorFor({ '@med': 4, '@alch': 2, '@herb': 4 })
  );
  assert.deepEqual(choice.defaultSelectedIds, ['med'], 'med precedes herb in the eligible set');
});

// The two axes do not cross: under `playerPicks` it is the PLAYER who selects, so a set
// a recipe author stored (under some earlier rule, or in anticipation of `bySubject`)
// neither narrows nor reorders the options the prompt offers.
test('buildCheckModifierChoice ignores a stored recipe set under playerPicks', () => {
  const choice = buildCheckModifierChoice(
    {
      catalogue: ICON_CATALOGUE,
      systemPolicy: 'playerPicks',
      defaultModifierIds: ['med', 'alch', 'herb'],
      subjectModifierIds: ['herb'],
      maxModifierPicks: 1,
    },
    evaluatorFor({ '@med': 4, '@alch': 2, '@herb': 4 })
  );
  assert.deepEqual(
    choice.modifiers.map((modifier) => modifier.id),
    ['med', 'alch', 'herb'],
    'the system default set, in the system default order, is what is offered'
  );
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['med'],
    'med precedes herb among the equal-max, so the eligible-set order tie-break stands'
  );
});

// …and under `bySubject` the recipe's own order IS the eligible-set order, which is what
// the cap truncates against. A cap of 1 leaves one option, and one option is not a
// choice, so no descriptor is built at all.
test('buildCheckModifierChoice sees the bySubject pick order, capped', () => {
  const context = {
    catalogue: ICON_CATALOGUE,
    systemPolicy: 'bySubject',
    defaultModifierIds: ['med', 'alch', 'herb'],
    subjectModifierIds: ['herb', 'med'],
  };
  const evaluate = evaluatorFor({ '@med': 4, '@alch': 2, '@herb': 4 });
  assert.deepEqual(
    buildCheckModifierChoice(context, evaluate).modifiers.map((modifier) => modifier.id),
    ['herb', 'med'],
    'recipe pick order preserved'
  );
  assert.equal(
    buildCheckModifierChoice({ ...context, maxModifierPicks: 1 }, evaluate),
    null,
    'a cap of 1 truncates the pick to one option, and one option is not a choice'
  );
});

test('buildCheckModifierChoice coerces a missing/failed value to 0', () => {
  const choice = buildCheckModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch'], maxModifierPicks: 1 },
    (expression) => (expression === '@med' ? NaN : 5)
  );
  assert.equal(choice.modifiers[0].value, 0, 'NaN → 0');
  assert.deepEqual(choice.defaultSelectedIds, ['alch'], 'alch (5) beats the coerced-0 med');
});

test('buildCheckModifierChoice pre-selects the least-negative when all values are negative', () => {
  // Guards the descending sort: a comparator seeded at 0 would silently pre-select the
  // first option instead of the true (negative) max.
  const choice = buildCheckModifierChoice(
    { catalogue: CATALOGUE, defaultModifierIds: ['med', 'alch', 'herb'], maxModifierPicks: 1 },
    evaluatorFor({ '@med': -3, '@alch': -1, '@herb': -5 })
  );
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['alch'],
    'max(-3,-1,-5) = -1 → alch, not the first option'
  );
  assert.deepEqual(
    choice.modifiers.map((modifier) => modifier.value),
    [-3, -1, -5]
  );
});

test('buildCheckModifierChoice returns null when no modifier is eligible', () => {
  assert.equal(
    buildCheckModifierChoice(
      { catalogue: ICON_CATALOGUE, defaultModifierIds: [] },
      evaluatorFor({})
    ),
    null
  );
});

// The two-option rule (#856): one eligible modifier renders a radio the player cannot
// change, so it is suppressed and the deterministic `highest` scalar — which, over a
// single value, is arithmetically IDENTICAL to picking it — resolves the token instead.
test('buildCheckModifierChoice returns null for a SINGLE eligible modifier (no choice-less radio)', () => {
  const context = { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med'] };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  assert.equal(buildCheckModifierChoice(context, evaluate), null, 'one option is not a choice');
  // …and the value the deterministic fallback substitutes is the very same modifier.
  assert.equal(
    scalarOf({ ...context, systemPolicy: 'playerPicks' }, evaluate),
    3,
    'suppressing the single-option prompt changes no arithmetic'
  );
});

test('buildCheckModifierChoice builds a descriptor at exactly TWO eligible modifiers', () => {
  const choice = buildCheckModifierChoice(
    { catalogue: ICON_CATALOGUE, defaultModifierIds: ['med', 'alch'] },
    evaluatorFor({ '@med': 3, '@alch': 2 })
  );
  assert.ok(choice, 'two eligible modifiers is a real choice');
  assert.deepEqual(
    choice.modifiers.map((modifier) => modifier.id),
    ['med', 'alch']
  );
});

test('buildCheckModifierChoice defaults absent label/icon to empty strings', () => {
  const choice = buildCheckModifierChoice(
    {
      catalogue: [
        { id: 'bare', expression: '@bare' },
        { id: 'named', label: 'Named', icon: 'fa-named', expression: '@named' },
      ],
      defaultModifierIds: ['bare', 'named'],
    },
    evaluatorFor({ '@bare': 1, '@named': 0 })
  );
  assert.deepEqual(choice.modifiers[0], {
    id: 'bare',
    label: '',
    icon: '',
    average: 1,
    value: 1,
    formula: null,
    blocked: false,
    display: '+1',
  });
});

// ── the retired substitution surface ─────────────────────────────────────────

// Deleted, not weakened. `substituteCraftingModifier` and `CRAFTING_MOD_TOKEN` were the
// whole placeholder mechanism; issue 1094 retires it and the scalar APPENDS instead, so
// their absence from the module surface IS the behaviour under test. Asserted rather than
// merely un-imported, because an accidental re-export would otherwise pass unnoticed and
// hand a future caller a second, substituting path to the same arithmetic.
test('the placeholder substitution surface is GONE from the resolver (issue 1094)', async () => {
  const module = await import(RESOLVER_MODULE);
  assert.equal(module.substituteCraftingModifier, undefined);
  assert.equal(module.CRAFTING_MOD_TOKEN, undefined);
});

// ── arithmetic evaluator ─────────────────────────────────────────────────────

test('evaluateNumericExpression handles arithmetic, precedence, and math functions', () => {
  assert.equal(evaluateNumericExpression('3'), 3);
  assert.equal(evaluateNumericExpression('2 + 3'), 5);
  assert.equal(evaluateNumericExpression('2 + 3 * 4'), 14);
  assert.equal(evaluateNumericExpression('(2 + 3) * 4'), 20);
  assert.equal(evaluateNumericExpression('-5 + 2'), -3);
  assert.equal(evaluateNumericExpression('floor(7 / 2)'), 3);
  assert.equal(evaluateNumericExpression('max(1, 4, 2)'), 4);
  assert.ok(Number.isNaN(evaluateNumericExpression('')), 'blank → NaN (caller coerces to 0)');
  assert.ok(
    Number.isNaN(evaluateNumericExpression('5 / 0')),
    'divide-by-zero is NaN (never Infinity); the roll-data evaluator coerces it to 0'
  );
});

// ── roll-data evaluator (stubbed Roll) ───────────────────────────────────────

function stubReplaceRoll() {
  const Roll = class {};
  Roll.replaceFormulaData = (formula, data, { missing } = {}) =>
    String(formula).replace(/@([\w.]+)/g, (_m, path) => {
      const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
      return value === undefined || value === null ? (missing ?? `@${path}`) : String(value);
    });
  return Roll;
}

// It resolves to TEXT, not to a number (issue 1118): a modifier may roll, so reducing here
// would destroy the dice before anything could decide whether to append them.
test('makeRollDataExpressionResolver resolves @-paths to the substituted TEXT', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ abilities: { med: { mod: 3 } }, prof: 2 }) };
  const resolve = makeRollDataExpressionResolver(actor, Roll);
  assert.equal(resolve('@abilities.med.mod'), '3');
  assert.equal(resolve('@abilities.med.mod + @prof'), '3 + 2');
  assert.equal(resolve('1d4 + @prof'), '1d4 + 2', 'the dice survive substitution verbatim');
  assert.equal(
    resolve('@abilities.ghost.mod'),
    '0',
    'a missing key resolves to 0 (missing sentinel)'
  );
  assert.equal(resolve(''), null, 'an empty expression does not resolve');
  assert.equal(
    makeRollDataExpressionResolver(actor, {})('@prof'),
    null,
    'no dice engine means no substitution, so the entry contributes nothing'
  );
});

// ── appendResolvedCheckModifier (the seam checkRoll uses) ──────────────────────────

test('appendResolvedCheckModifier APPENDS the resolved scalar before Foundry sees it', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ med: 3, alch: 2, herb: 4 }) };
  const context = {
    catalogue: [
      { id: 'med', expression: '@med' },
      { id: 'alch', expression: '@alch' },
      { id: 'herb', expression: '@herb' },
    ],
    systemPolicy: 'highest',
    defaultModifierIds: ['med', 'alch', 'herb'],
  };
  assert.equal(
    appendResolvedCheckModifier('1d20', actor, context, Roll),
    '1d20 + 4[Modifiers]',
    'highest of 3/2/4, appended as one flavoured term'
  );
});

// The append is unconditional: there is no token to look for, so the only thing that can
// leave a formula unchanged is a scalar of zero.
test('appendResolvedCheckModifier appends a NEGATIVE scalar with the sign split, not a parenthesis', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ pen: -3 }) };
  const context = {
    catalogue: [{ id: 'pen', expression: '@pen' }],
    systemPolicy: 'addAll',
    defaultModifierIds: ['pen'],
  };
  // `Constant` is unsigned in the dice grammar, so `+ -3[Modifiers]` would not parse.
  assert.equal(appendResolvedCheckModifier('1d20', actor, context, Roll), '1d20 - 3[Modifiers]');
});

test('appendResolvedCheckModifier appends NOTHING when the eligible set resolves to 0', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({}) };
  assert.equal(
    appendResolvedCheckModifier('1d20 + @prof', actor, { catalogue: [] }, Roll),
    '1d20 + @prof',
    'an empty catalogue contributes nothing and the authored formula survives verbatim'
  );
});

test('appendResolvedCheckModifier appends nothing with no context at all (salvage/gathering)', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({}) };
  assert.equal(appendResolvedCheckModifier('1d20 + 4', actor, null, Roll), '1d20 + 4');
});

// A7, at THIS layer: a scalar that survives the roll-data evaluator as a plain decimal is
// appended verbatim, however extreme, because the dice grammar's `Constant` accepts it.
//
// The exponent-notation REFUSAL is asserted where the formatter lives
// (`tests/tool-check-bonus.test.js`), not here, and that split is deliberate rather than a
// gap: `makeRollDataExpressionEvaluator` cannot produce an exponent value at all. Foundry
// stringifies `1e-7` into the formula as the literal `1e-7`, and
// `evaluateNumericExpression`'s `parseNumber` consumes only `[0-9.]`, so it stops at the
// `e` and returns 1. The exposure is through an INJECTED evaluator and, from issue 1095,
// through summing N clamped values — both of which reach `appendCheckModifierTerm`
// directly.
test('appendResolvedCheckModifier appends an extreme but plain-decimal scalar verbatim', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ big: 1000000000000000 }) };
  const context = {
    catalogue: [{ id: 'big', expression: '@big' }],
    systemPolicy: 'addAll',
    defaultModifierIds: ['big'],
  };
  assert.equal(
    appendResolvedCheckModifier('1d20', actor, context, Roll),
    '1d20 + 1000000000000000[Modifiers]'
  );
});

test('appendResolvedCheckModifier appends a FRACTIONAL scalar, which the grammar does accept', () => {
  const Roll = stubReplaceRoll();
  const actor = { getRollData: () => ({ half: 2.5 }) };
  const context = {
    catalogue: [{ id: 'half', expression: '@half' }],
    systemPolicy: 'addAll',
    defaultModifierIds: ['half'],
  };
  assert.equal(appendResolvedCheckModifier('1d20', actor, context, Roll), '1d20 + 2.5[Modifiers]');
});

// ── which check a resolution mode ACTUALLY rolls (issue 1055) ────────────────
//
// The five-mode table this selector owns is a hand-maintained mirror of the engine's own
// slot choices, and three surfaces (the Checks card, the recipe Overview tab, the admin
// store) read it to decide whether the check-modifier catalogue reaches a roll. Drift here
// is silent: a mode routed to the wrong slot reports a formula the engine never rolls.

const MODE_TABLE = [
  { mode: 'simple', slot: 'simple', requiresCheck: false },
  { mode: 'routedByIngredients', slot: 'simple', requiresCheck: false },
  { mode: 'routedByCheck', slot: 'routed', requiresCheck: true },
  { mode: 'progressive', slot: 'progressive', requiresCheck: true },
];

const CHECK_SLOTS = {
  simple: { rollFormula: '1d20 + 2' },
  routed: { rollFormula: '2d6 + 1' },
  progressive: { rollFormula: '1d100' },
};

test('resolveActiveCraftingCheckFormula routes each non-alchemy mode to its own slot', () => {
  for (const { mode, slot, requiresCheck } of MODE_TABLE) {
    const active = resolveActiveCraftingCheckFormula({
      resolutionMode: mode,
      craftingCheck: CHECK_SLOTS,
    });
    assert.equal(active.slot, slot, `${mode} rolls the ${slot} check`);
    assert.equal(active.rollFormula, CHECK_SLOTS[slot].rollFormula, `${mode} formula`);
    assert.equal(active.config, CHECK_SLOTS[slot]);
    assert.equal(active.checkUsable, true);
    assert.equal(active.requiresCheck, requiresCheck, `${mode} requiresCheck`);
    assert.equal(active.alchemyCheckMode, null, 'never mistaken for an authored alchemy none');
  }
  // routedByIngredients SHARES the simple slot; it does not have a routed one of its own.
  assert.equal(
    resolveActiveCraftingCheckFormula({
      resolutionMode: 'routedByIngredients',
      craftingCheck: { routed: CHECK_SLOTS.routed },
    }).rollFormula,
    '',
    'the routed slot is not read for routedByIngredients'
  );
});

test('resolveActiveCraftingCheckFormula selects the alchemy slot from alchemy.checkMode', () => {
  for (const [checkMode, slot] of [
    ['none', null],
    ['simple', 'simple'],
    ['tiered', 'routed'],
  ]) {
    const active = resolveActiveCraftingCheckFormula({
      resolutionMode: 'alchemy',
      alchemy: { checkMode },
      craftingCheck: CHECK_SLOTS,
    });
    assert.equal(active.slot, slot, `alchemy/${checkMode} → ${slot}`);
    assert.equal(active.alchemyCheckMode, checkMode);
    assert.equal(active.requiresCheck, slot !== null, `alchemy/${checkMode} requiresCheck`);
    assert.equal(active.checkUsable, slot !== null);
  }
  // An absent alchemy block is `none`, not a coerced simple.
  assert.equal(
    resolveActiveCraftingCheckFormula({ resolutionMode: 'alchemy', craftingCheck: CHECK_SLOTS })
      .slot,
    null
  );
});

test('resolveActiveCraftingCheckFormula distinguishes the two inert causes', () => {
  // 1. No check at all.
  const noCheck = resolveActiveCraftingCheckFormula({
    resolutionMode: 'alchemy',
    alchemy: { checkMode: 'none' },
    craftingCheck: CHECK_SLOTS,
  });
  assert.equal(noCheck.slot, null);

  // 2. A slot exists but carries no authored formula — whitespace is not a formula.
  const noFormula = resolveActiveCraftingCheckFormula({
    resolutionMode: 'simple',
    craftingCheck: { simple: { rollFormula: '   ' } },
  });
  assert.equal(noFormula.slot, 'simple');
  assert.equal(noFormula.rollFormula, '', 'the formula is TRIMMED');
  assert.equal(noFormula.checkUsable, false);

  // There is no third cause. A formula that never spent the retired placeholder is now an
  // ordinary live check — the scalar appends to it — so this reports LIVE, and the
  // `noPlaceholder` value the two notice surfaces rendered has nowhere left to come from.
  const live = resolveActiveCraftingCheckFormula({
    resolutionMode: 'simple',
    craftingCheck: { simple: { rollFormula: '1d20 + 4' } },
  });
  assert.equal(live.checkUsable, true);
  assert.equal(
    Object.hasOwn(live, 'referencesModifier'),
    false,
    'the retired fact is not merely false, it is gone from the shape (issue 1094)'
  );
});

// THE SHIM RUNS BEFORE THE EMPTINESS TEST, asserted with a real `Roll.validate` double.
// A formula whose only content was the retired placeholder must NOT report usable, reach
// `evaluateCheckRoll` and throw inside `new Roll('')` as a rolled — consuming — failure.
//
// This assertion FAILS against the pre-change reader, which read the raw stored field and
// reported `checkUsable: true` for exactly this input.
test('resolveActiveCraftingCheckFormula reports noFormula for a placeholder-only formula', () => {
  const previous = globalThis.Roll;
  globalThis.Roll = class {
    static validate(formula) {
      const text = String(formula);
      return text.trim() !== '' && !/@/.test(text) && !/[*/+-]\s*$/.test(text);
    }
  };
  try {
    const active = resolveActiveCraftingCheckFormula({
      resolutionMode: 'simple',
      craftingCheck: { simple: { rollFormula: '@craftingmod' } },
    });
    assert.equal(active.slot, 'simple', 'the mode still rolls the simple slot');
    assert.equal(active.rollFormula, '');
    assert.equal(active.checkUsable, false, 'reported as noFormula, never as a usable check');

    // A non-additive placement is covered by the same residue check.
    const multiplicative = resolveActiveCraftingCheckFormula({
      resolutionMode: 'simple',
      craftingCheck: { simple: { rollFormula: '1d20 * @craftingmod' } },
    });
    assert.equal(multiplicative.checkUsable, false);

    // …and a token in an ADDITIVE position leaves a real formula standing.
    const additive = resolveActiveCraftingCheckFormula({
      resolutionMode: 'simple',
      craftingCheck: { simple: { rollFormula: '1d20 + @craftingmod' } },
    });
    assert.equal(additive.rollFormula, '1d20');
    assert.equal(additive.checkUsable, true);
  } finally {
    globalThis.Roll = previous;
  }
});

test('resolveActiveCraftingCheckFormula reports no check for an unrecognized mode', () => {
  // Deliberately NOT coerced to `simple`: surfacing "no check" is the answer that cannot
  // mislead a caller into validating a check the engine will not roll.
  const active = resolveActiveCraftingCheckFormula({
    resolutionMode: 'notAMode',
    craftingCheck: CHECK_SLOTS,
  });
  assert.equal(active.slot, null);
  assert.equal(active.config, null);
  assert.equal(active.checkUsable, false);
});

test('resolveActiveCraftingCheckFormula defaults an absent mode to simple and tolerates no system', () => {
  assert.equal(
    resolveActiveCraftingCheckFormula({ craftingCheck: CHECK_SLOTS }).slot,
    'simple',
    'an absent resolutionMode is the simple default'
  );
  const empty = resolveActiveCraftingCheckFormula(null);
  assert.equal(empty.mode, 'simple');
  assert.equal(empty.config, null);
  assert.equal(empty.rollFormula, '');
});

// ── per-entry bounds (issue 1095) ────────────────────────────────────────────
//
// `min`/`max` clamp the RESOLVED value, AFTER expression evaluation and BEFORE
// combination — which is what makes a bound mean the same thing under every rule. The
// alternative (clamping the reduced scalar) would let `addAll` blow past a per-entry cap
// by summing two entries that each honoured it.

const BOUNDED = [
  { id: 'floor', label: 'Floor', expression: '@floor', min: 2 },
  { id: 'ceil', label: 'Ceiling', expression: '@ceil', max: 5 },
  { id: 'both', label: 'Both', expression: '@both', min: -1, max: 5 },
];

test('resolveModifierBounds preserves absence and refuses to coerce a nullish bound', () => {
  assert.deepEqual(resolveModifierBounds({ min: -1, max: 5 }), {
    min: -1,
    max: 5,
    inverted: false,
    unsafe: false,
  });
  // ZERO is a REAL bound. Reading it through truthiness would silently unbound the entry.
  assert.deepEqual(resolveModifierBounds({ min: 0, max: 0 }), {
    min: 0,
    max: 0,
    inverted: false,
    unsafe: false,
  });
  for (const junk of [null, undefined, '', NaN, Infinity, -Infinity, 'three', {}, []]) {
    assert.deepEqual(
      resolveModifierBounds({ min: junk, max: junk }),
      { min: null, max: null, inverted: false, unsafe: false },
      `${String(junk)} is unbounded on both sides — Number(null), Number("") and Number([]) ` +
        'are all 0, and 0 is a real bound here'
    );
  }
  assert.equal(resolveModifierBounds(null).min, null, 'a missing entry is unbounded');
  assert.equal(resolveModifierBounds({ min: 5, max: -1 }).inverted, true);
});

// A WHITESPACE-ONLY bound is the `''` guard's blind spot: `Number('   ')` is `0`, and `0`
// is a REAL bound, so an untrimmed read minted a floor of zero out of a field that carries
// nothing. It is reachable from an import and from a hand-edited world, and its damage is
// silent — the entry clamps to at least 0 and a negative modifier stops being negative.
test('resolveModifierBounds trims a string bound, so whitespace reads as UNBOUNDED not 0', () => {
  for (const blank of ['   ', '\t', '\n ']) {
    assert.deepEqual(
      resolveModifierBounds({ min: blank, max: blank }),
      { min: null, max: null, inverted: false, unsafe: false },
      `${JSON.stringify(blank)} is not a bound of zero`
    );
  }
  assert.equal(
    resolveModifierBounds({ min: ' -2 ' }).min,
    -2,
    'a padded REAL bound still reads as that bound'
  );
  assert.equal(clampModifierValue(-5, { min: '   ' }), -5, 'and nothing clamps to a phantom 0');
});

// A bound only has to be FINITE to be a bound, so `1e21` is one — and it is a bound the
// dice grammar cannot express. Before this, clamping to it poisoned the SUM, and
// `appendCheckModifierTerm` then dropped THE WHOLE TERM, so one entry's bound deleted every
// other modifier's contribution from the roll.
test('resolveModifierBounds flags a bound the dice grammar cannot express as unsafe', () => {
  for (const bound of [1e21, '1e21', 1e-7, -1e21]) {
    assert.equal(
      resolveModifierBounds({ min: bound }).unsafe,
      true,
      `${String(bound)} stringifies to exponent notation, which Constant has no production for`
    );
  }
  assert.equal(resolveModifierBounds({ min: -999999, max: 999999 }).unsafe, false);
  assert.equal(
    resolveModifierBounds({ min: 0.5 }).unsafe,
    false,
    'a decimal is expressible — Constant is [0-9]+ ("." [0-9]+)?'
  );
});

test('clampModifierValue applies each bound independently and refuses an inverted pair', () => {
  assert.equal(clampModifierValue(1, { min: 2 }), 2, 'below the floor lifts to it');
  assert.equal(clampModifierValue(9, { max: 5 }), 5, 'above the ceiling drops to it');
  assert.equal(clampModifierValue(3, { min: -1, max: 5 }), 3, 'inside the pair is untouched');
  assert.equal(clampModifierValue(-9, { min: -1, max: 5 }), -1);
  assert.equal(clampModifierValue(9, {}), 9, 'unbounded is unbounded');
  // BLOCKING, not silently reordered: swapping the pair would roll a number the GM never
  // authored. The entry contributes 0 until it is repaired — gathering's refuse posture.
  assert.equal(clampModifierValue(3, { min: 5, max: -1 }), 0);
});

test('the flat contribution clamps EACH value before combining, under every rule', () => {
  const evaluate = evaluatorFor({ '@floor': -4, '@ceil': 9, '@both': 3 });
  const context = (systemPolicy) => ({
    catalogue: BOUNDED,
    systemPolicy,
    defaultModifierIds: ['floor', 'ceil', 'both'],
  });
  // Raw values -4, 9, 3 clamp to 2, 5, 3.
  assert.equal(
    scalarOf(context('addAll'), evaluate),
    10,
    'addAll sums the CLAMPED values (2 + 5 + 3), not the raw ones (8)'
  );
  assert.equal(
    scalarOf(context('highest'), evaluate),
    5,
    'highest compares CLAMPED values, so the capped 9 does not win at 9'
  );
});

// THE CONTAGION IS THE DEFECT, and the assertion is the OTHER entry's survival. With the
// unsafe bound honoured, `ok` clamps to 3, `bad` clamps to 1e21, the sum is 1e21, and
// `appendCheckModifierTerm` refuses the whole exponent-notation term — so the well-formed
// `+3` vanishes from a roll because of a bound on a DIFFERENT entry.
test('an entry with a grammar-inexpressible bound contributes 0 without poisoning the sum', () => {
  const catalogue = [
    { id: 'ok', label: 'Ok', expression: '@ok' },
    { id: 'huge', label: 'Huge', expression: '@huge', min: 1e21 },
  ];
  const evaluate = evaluatorFor({ '@ok': 3, '@huge': 1 });
  const scalar = scalarOf(
    { catalogue, systemPolicy: 'addAll', defaultModifierIds: ['ok', 'huge'] },
    evaluate
  );
  assert.equal(scalar, 3, 'the unbounded-by-mistake entry adds nothing, and 3 survives');
  assert.equal(
    appendCheckModifierTerm('1d20', { value: scalar }),
    '1d20 + 3[Modifiers]',
    'and the term still reaches the formula — the whole point of containing the refusal'
  );
});

test('the flat contribution makes an INVERTED entry contribute exactly 0', () => {
  const catalogue = [
    { id: 'ok', label: 'Ok', expression: '@ok' },
    { id: 'bad', label: 'Bad', expression: '@bad', min: 5, max: -1 },
  ];
  const evaluate = evaluatorFor({ '@ok': 3, '@bad': 100 });
  assert.equal(
    scalarOf(
      { catalogue, systemPolicy: 'addAll', defaultModifierIds: ['ok', 'bad'] },
      evaluate
    ),
    3,
    'the blocked entry adds nothing — not its raw value, and not either of its bounds'
  );
});

test('buildCheckModifierChoice offers the CLAMPED value the roll will append', () => {
  const choice = buildCheckModifierChoice(
    { catalogue: BOUNDED, systemPolicy: 'playerPicks', defaultModifierIds: ['floor', 'ceil'] },
    evaluatorFor({ '@floor': -4, '@ceil': 9 })
  );
  assert.deepEqual(
    choice.modifiers.map((modifier) => modifier.value),
    [2, 5],
    'the number the player is shown IS the number the roll appends'
  );
  assert.deepEqual(
    choice.defaultSelectedIds,
    ['floor', 'ceil'],
    'and the pre-selection is computed from the clamped values too'
  );
});

// ── bySubject on all THREE activities (issue 1095) ───────────────────────────

test('bySubject resolves and truncates identically on crafting, salvage and gathering', () => {
  const system = {
    modifiers: CATALOGUE,
    craftingCheck: {
      defaultModifierPolicy: 'bySubject',
      defaultModifierIds: ['med'],
      maxModifierPicks: 2,
    },
    salvageCraftingCheck: {
      defaultModifierPolicy: 'bySubject',
      defaultModifierIds: ['med'],
      maxModifierPicks: 2,
    },
    gatheringCraftingCheck: {
      defaultModifierPolicy: 'bySubject',
      defaultModifierIds: ['med'],
      maxModifierPicks: 2,
    },
  };
  const subjects = {
    crafting: { craftingModifier: { modifierIds: ['herb', 'med', 'alch'] } },
    salvage: { salvage: { checkModifierIds: ['herb', 'med', 'alch'] } },
    gathering: { checkModifierIds: ['herb', 'med', 'alch'] },
  };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2, '@herb': 4 });
  for (const activity of ['crafting', 'salvage', 'gathering']) {
    const context = buildCheckModifierContext(system, activity, subjects[activity]);
    assert.deepEqual(
      resolveEligibleModifierIds(context),
      ['herb', 'med'],
      `${activity}: the FIRST N in authored order survive the cap, never the best N`
    );
    assert.equal(scalarOf(context, evaluate), 7, `${activity}: 4 + 3`);
  }
});

test('an AUTHORED EMPTY pick resolves to zero on all three activities', () => {
  const selection = { defaultModifierPolicy: 'bySubject', defaultModifierIds: ['med', 'alch'] };
  const system = {
    modifiers: CATALOGUE,
    craftingCheck: selection,
    salvageCraftingCheck: selection,
    gatheringCraftingCheck: selection,
  };
  const empty = {
    crafting: { craftingModifier: { modifierIds: [] } },
    salvage: { salvage: { checkModifierIds: [] } },
    gathering: { checkModifierIds: [] },
  };
  const absent = { crafting: {}, salvage: { salvage: {} }, gathering: {} };
  const evaluate = evaluatorFor({ '@med': 3, '@alch': 2 });
  for (const activity of ['crafting', 'salvage', 'gathering']) {
    assert.equal(
      scalarOf(
        buildCheckModifierContext(system, activity, empty[activity]),
        evaluate
      ),
      0,
      `${activity}: an authored empty array is a real pick of zero`
    );
    assert.equal(
      scalarOf(
        buildCheckModifierContext(system, activity, absent[activity]),
        evaluate
      ),
      5,
      `${activity}: …and an ABSENT pick inherits the default set instead — a DIFFERENT roll`
    );
  }
});

// ── the two new active-formula siblings (issue 1095) ─────────────────────────

test('resolveActiveSalvageCheckFormula reports the same shape as its crafting sibling', () => {
  const usable = resolveActiveSalvageCheckFormula({
    salvageResolutionMode: 'routed',
    salvageCraftingCheck: { routed: { rollFormula: '1d20 + 2' } },
  });
  assert.equal(usable.slot, 'routed');
  assert.equal(usable.rollFormula, '1d20 + 2');
  assert.equal(usable.checkUsable, true);
  assert.equal(usable.requiresCheck, true);

  const empty = resolveActiveSalvageCheckFormula({
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: { simple: { rollFormula: '   ' } },
  });
  assert.equal(empty.checkUsable, false, 'a whitespace-only formula is not a check');
  assert.equal(empty.requiresCheck, false, 'simple salvage does not require one');

  // An unsupported mode reports NO slot, so the inert cause reads `noCheck` rather than
  // silently grading a configuration `validateSalvage` already calls invalid.
  const unsupported = resolveActiveSalvageCheckFormula({ salvageResolutionMode: 'bogus' });
  assert.equal(unsupported.slot, null);
  assert.equal(unsupported.checkUsable, false);
});

test('resolveActiveSalvageCheckFormula applies the retirement shim before its emptiness test', () => {
  const placeholderOnly = resolveActiveSalvageCheckFormula({
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: { simple: { rollFormula: '@craftingmod' } },
  });
  assert.equal(placeholderOnly.rollFormula, '', 'the retired token strips to nothing');
  assert.equal(
    placeholderOnly.checkUsable,
    false,
    'reported as NO FORMULA — otherwise it passes the abort, reaches new Roll("") and ' +
      'throws as a rolled, CONSUMING failure'
  );
});

test('resolveActiveGatheringCheckFormula has no slot under d100 and one under both others', () => {
  const system = {
    gatheringCraftingCheck: {
      progressive: { rollFormula: '2d6' },
      routed: { rollFormula: '1d20 + @craftingmod' },
    },
  };
  const d100 = resolveActiveGatheringCheckFormula(system, 'd100');
  assert.equal(d100.slot, null, 'd100 authors no check slot, so the catalogue reaches no roll');
  assert.equal(d100.checkUsable, false);
  assert.equal(d100.requiresCheck, false);
  assert.equal(
    resolveActiveGatheringCheckFormula(system).slot,
    null,
    'and d100 is the DEFAULT, because it is the only mode a GM can select today'
  );

  assert.equal(resolveActiveGatheringCheckFormula(system, 'progressive').rollFormula, '2d6');
  assert.equal(resolveActiveGatheringCheckFormula(system, 'progressive').requiresCheck, true);
  // The shim runs before the emptiness test here too.
  assert.equal(
    resolveActiveGatheringCheckFormula(system, 'routed').rollFormula,
    '1d20',
    'the retired placeholder is stripped before the formula is reported'
  );
});

// ── isRollExpression (issue 1117) ────────────────────────────────────────────────
//
// ONE library needs ONE classifier. Two lived in the repo while two libraries did, and they
// were COMPLEMENTARY rather than duplicates: `GatheringRichStateService`'s
// `/\d\s*d\s*\d|[*\/()]/i` required a digit before the `d`, so it matched `1d6` and missed a
// bare `d20`; `SystemEditView`'s `/d\d|[*\/()]/` required a word boundary before the `d`,
// so it matched `d20` and — `1` and `d` both being word characters, leaving no boundary
// between them — missed `1d6`. Neither was a superset of the other, so one library with two
// readers would have disagreed about whether the same entry rolls.
//
// BOTH HALVES ARE ASSERTED, and that is the point of this test rather than an excess of
// cases: dropping either alternation leaves the OTHER half's cases green, so a single
// happy-path assertion would let the union silently collapse back to one of its inputs.
// Issue 1118 review. `isRollExpression` no longer carries a pattern of its own: it asks
// `reduceRollExpression`, which OBSERVES dice while it reduces. The pattern disagreed with
// what actually appends in both directions, and each row below that moved lists which.
test('isRollExpression answers the same question the resolver does', () => {
  for (const rolls of [
    '1d6',
    'd20', // a BARE die
    '@prof + d4', // `@`-paths are neutralized first, so the walk reaches the die
    '(@abilities.str.mod)d6',
    '1dF', // FALSE under the old pattern: a Fate die rolls and got no chip
    '2dc', // …and a Coin die likewise
    '{1d6,1d8}kh1',
  ]) {
    assert.equal(isRollExpression(rolls), true, `${rolls} rolls`);
  }

  for (const flat of [
    '@abilities.med.mod',
    '@abilities.dex.mod', // a `d` at a word boundary NOT followed by a digit
    '@skills.nat.total',
    '@prof',
    '3',
    '',
    // TRUE under the old pattern, which also matched arithmetic GROUPING. None of these
    // rolls anything, and since issue 1118 the chip carries a roll note beside it — so the
    // old answer put a sentence about dice on an expression that has none.
    '@a * 2',
    '@a / 2',
    'max(@a, 2)',
    'floor(@a / 2)',
    // TRUE under the old pattern, and not a die at all: Foundry's grammar admits no
    // whitespace inside a die term, so `Roll.validate('2 d 10')` is false on 14.365.
    '2 d 10',
  ]) {
    assert.equal(isRollExpression(flat), false, `${flat} rolls nothing`);
  }

  // Non-strings are not expressions; they classify as flat rather than throwing, because a
  // malformed entry must still normalize.
  for (const junk of [null, undefined, 7, {}, []]) {
    assert.equal(isRollExpression(junk), false, `${String(junk)} is not an expression`);
  }
});
