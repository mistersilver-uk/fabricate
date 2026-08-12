// Unit tests for the shared check-roll helpers (src/systems/checkRoll.js),
// extracted from the crafting engine and reused by the salvage (and later
// gathering) check runners.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  rolledDiceGroups,
  resolveForcedOutcome,
  evaluateCheckRoll,
  resolveCheckFormulaDisplay,
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} = await import('../src/systems/checkRoll.js');

// A unified trigger forcing `outcome` when its `diceGroup`/`total`/`==` condition
// matches the rolled group total (the recombined replacement for a per-die crit).
function totalTrigger({ id = 't', groupId = 0, value, outcome }) {
  return {
    id,
    condition: { type: 'diceGroup', groupId, aggregate: 'total', operator: '==', value },
    outcome,
    breakTools: false,
  };
}

// Mixed-activity results for the non-finite-total fallback (defect 2): a kept
// (active:true), a dropped (active:false), and a kept-without-the-flag result —
// Foundry omits `active` on a result it keeps. Active-only sum is 3 + 6 = 9.
const MIXED_ACTIVE_RESULTS = Object.freeze([
  Object.freeze({ result: 3, active: true }),
  Object.freeze({ result: 5, active: false }),
  Object.freeze({ result: 6 }),
]);

// Captures the first argument every `evaluate()` call receives, so the
// non-interactive option (defect 3) can be asserted. Reset per test via
// `evaluateArgs.length = 0`.
const evaluateArgs = [];
function stubRoll(total, dice = []) {
  evaluateArgs.length = 0;
  globalThis.Roll = class {
    async evaluate(options) {
      evaluateArgs.push(options);
      return { total, dice };
    }
  };
}
function stubThrowingRoll() {
  globalThis.Roll = class {
    async evaluate() {
      throw new Error('bad formula');
    }
  };
}
const ACTOR = { getRollData: () => ({}) };

// ── rolledDiceGroups ────────────────────────────────────────────────────────

test('rolledDiceGroups summarises dice as { groupId, group, sum, results } using the die-term total', () => {
  const groups = rolledDiceGroups({
    dice: [
      { number: 2, faces: 6, total: 9, results: [{ result: 4 }, { result: 5 }] },
      { number: 1, faces: 20, total: 18, results: [{ result: 18 }] },
    ],
  });
  assert.deepEqual(groups, [
    { groupId: 0, group: '2d6', sum: 9, results: [4, 5] },
    { groupId: 1, group: '1d20', sum: 18, results: [18] },
  ]);
});

test('rolledDiceGroups assigns groupId by evaluated-term order, disambiguating duplicate NdS', () => {
  // 1d20 + 1d20 → two distinct groups keyed by index, not by the NdS label.
  const groups = rolledDiceGroups({
    dice: [
      { number: 1, faces: 20, total: 3, results: [{ result: 3 }] },
      { number: 1, faces: 20, total: 17, results: [{ result: 17 }] },
    ],
  });
  assert.equal(groups[0].groupId, 0);
  assert.equal(groups[1].groupId, 1);
  assert.equal(groups[0].group, '1d20');
  assert.equal(groups[1].group, '1d20');
});

test('rolledDiceGroups results are active-only raw faces (drops dropped dice)', () => {
  // 2d20kh1: the dropped (active:false) die is excluded from results; sum keeps the
  // post-modifier die-term total.
  const groups = rolledDiceGroups({
    dice: [
      {
        number: 2,
        faces: 20,
        total: 18,
        results: [
          { result: 18, active: true },
          { result: 3, active: false },
        ],
      },
    ],
  });
  assert.deepEqual(groups[0].results, [18], 'dropped die excluded from raw faces');
  assert.equal(groups[0].sum, 18, 'sum is the post-modifier die-term total');
});

test('rolledDiceGroups falls back to summing per-die results when total is absent', () => {
  const groups = rolledDiceGroups({
    dice: [{ number: 2, faces: 6, results: [{ result: 3 }, { result: 4 }] }],
  });
  assert.deepEqual(groups, [{ groupId: 0, group: '2d6', sum: 7, results: [3, 4] }]);
});

// ── resolveCheckFormulaDisplay ──────────────────────────────────────────────
// A minimal Roll stub mirroring Foundry's static replaceFormulaData/validate: it
// substitutes @paths from the roll data and inserts the `missing` sentinel for
// unmatched keys (so the resolver can flag a non-numeric result).
function stubResolvingRoll() {
  const Roll = class {};
  Roll.replaceFormulaData = (formula, data, { missing } = {}) =>
    String(formula).replace(/@([\w.]+)/g, (_m, path) => {
      const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
      return value === undefined || value === null ? (missing ?? `@${path}`) : String(value);
    });
  Roll.validate = (formula) => !/NaN/.test(formula) && !/@/.test(formula);
  globalThis.Roll = Roll;
}

test('resolveCheckFormulaDisplay substitutes @-placeholders inline against the actor', () => {
  stubResolvingRoll();
  const actor = { getRollData: () => ({ abilities: { str: { mod: 3 } }, prof: 2 }) };
  const result = resolveCheckFormulaDisplay('1d20 + @abilities.str.mod + @prof', actor);
  assert.deepEqual(result, { display: '1d20 + 3 + 2', resolved: true });
});

test('resolveCheckFormulaDisplay flags an unresolved key as not resolved', () => {
  stubResolvingRoll();
  const actor = { getRollData: () => ({}) }; // no @prof on this actor
  const result = resolveCheckFormulaDisplay('1d20 + @prof', actor);
  assert.equal(result.resolved, false, 'a missing key does not resolve to a number');
  assert.match(result.display, /NaN/, 'the unresolved key becomes the NaN sentinel');
});

test('resolveCheckFormulaDisplay returns null for a blank formula or absent engine', () => {
  stubResolvingRoll();
  assert.equal(resolveCheckFormulaDisplay('', { getRollData: () => ({}) }), null, 'blank formula');
  assert.equal(resolveCheckFormulaDisplay('   ', {}), null, 'whitespace-only formula');

  delete globalThis.Roll;
  assert.equal(
    resolveCheckFormulaDisplay('1d20 + @prof', { getRollData: () => ({}) }),
    null,
    'no dice engine → null so the caller shows the raw formula'
  );
});

test('rolledDiceGroups fallback sums only active results: false excluded, absent included', () => {
  const groups = rolledDiceGroups({
    dice: [{ number: 3, faces: 6, results: MIXED_ACTIVE_RESULTS }],
  });
  // 3 (active:true) + 6 (active absent) — 5 (active:false) is dropped. The entry
  // carries the #419 groupId + active-only raw faces alongside the #443 fallback sum.
  assert.deepEqual(groups, [{ groupId: 0, group: '3d6', sum: 9, results: [3, 6] }]);
});

// ── the appended check-modifier term: eval == display (issues 770, 1094) ─────

// A Roll stub with BOTH an instance evaluate() (records the formula it rolled) and
// the static replaceFormulaData the display path uses.
function stubCraftingModRoll() {
  const rolledFormulas = [];
  const Roll = class {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      rolledFormulas.push(this.formula);
      return { total: 12, dice: [] };
    }
  };
  Roll.replaceFormulaData = (formula, data, { missing } = {}) =>
    String(formula).replace(/@([\w.]+)/g, (_m, path) => {
      const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
      return value === undefined || value === null ? (missing ?? `@${path}`) : String(value);
    });
  // Tightened for issue 1094 against RECORDED real-Foundry behaviour, because the
  // retirement shim's residue check is graded by this predicate and a permissive double
  // would grade nothing: real `Roll.validate` REJECTS the empty string (`Roll.parse('')`
  // returns `[]`, `RollParser.toAST([])` pops an empty array) and REJECTS a formula ending
  // in a dangling binary operator (`Expression` requires a `Term` after each operator) —
  // both of which the old `!/NaN|@/` predicate happily accepted.
  Roll.validate = (formula) => {
    const text = String(formula).trim();
    if (text === '' || /[+\-*/]$/.test(text)) return false;
    return !/NaN/.test(text) && !/@/.test(text);
  };
  globalThis.Roll = Roll;
  return rolledFormulas;
}

const MOD_CONTEXT = {
  catalogue: [
    { id: 'med', expression: '@abilities.med.mod' },
    { id: 'alch', expression: '@abilities.alch.mod' },
  ],
  systemPolicy: 'highest',
  defaultModifierIds: ['med', 'alch'],
};

test('check modifiers: evaluateCheckRoll APPENDS the scalar and its display matches resolveCheckFormulaDisplay', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({ abilities: { med: { mod: 3 }, alch: { mod: 5 } } }) };

  const rolled = await evaluateCheckRoll('1d20', actor, {
    craftingModifier: MOD_CONTEXT,
  });

  // highest(3, 5) = 5, appended BEFORE the roll as one flavoured term. The GM authored no
  // placeholder and could not have forgotten one (issue 1094).
  assert.equal(rolledFormulas.at(-1), '1d20 + 5[Modifiers]', 'the scalar is appended before Roll');
  // The eval path's display equals the standalone display path (eval == display).
  const display = resolveCheckFormulaDisplay('1d20', actor, MOD_CONTEXT);
  assert.equal(rolled.resolvedFormula, display.display);
  assert.equal(rolled.resolvedFormula, '1d20 + 5[Modifiers]');
  delete globalThis.Roll;
});

test('check modifiers: a ZERO scalar appends no term and rolls the authored formula', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({ abilities: { med: { mod: 3 } } }) };
  await evaluateCheckRoll('1d20 + @abilities.med.mod', actor, {
    craftingModifier: { ...MOD_CONTEXT, defaultModifierIds: [] },
  });
  assert.equal(
    rolledFormulas.at(-1),
    '1d20 + @abilities.med.mod',
    'an empty eligible set contributes nothing and the authored formula rolls verbatim'
  );
  delete globalThis.Roll;
});

test('check modifiers: runFormulaPassFail threads the modifier context through to the roll', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({ abilities: { med: { mod: 3 }, alch: { mod: 5 } } }) };
  const r = await runFormulaPassFail({
    formula: '1d20',
    dc: 10,
    thresholdMode: 'meet',
    actor,
    craftingModifier: MOD_CONTEXT,
  });
  assert.equal(rolledFormulas.at(-1), '1d20 + 5[Modifiers]');
  assert.equal(r.data.resolvedFormula, '1d20 + 5[Modifiers]');
  delete globalThis.Roll;
});

// ── the retirement shim, at the head of the roll path (issue 1094) ───────────

// A token that SURVIVED the 1.21.0 migration — hand-edited, imported, or seeded by a
// fixture — is stripped before anything else reads the formula, so it can never
// double-count against the appended term and can never reach Foundry's `Roll` unresolved
// (which would silently treat it as 0).
test('shim: a surviving placeholder is stripped, and the scalar still appends exactly once', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({ abilities: { med: { mod: 3 }, alch: { mod: 5 } } }) };
  await evaluateCheckRoll('1d20 + @craftingmod', actor, { craftingModifier: MOD_CONTEXT });
  assert.equal(rolledFormulas.at(-1), '1d20 + 5[Modifiers]');
  delete globalThis.Roll;
});

// A formula the shim empties is NOT a check. Without this guard `new Roll('')` throws —
// `Roll.parse('')` returns `[]` and `_evaluateASTAsync` dereferences `node.class` — and
// the runner's try/catch turns that into a rolled, and therefore CONSUMING, failure.
test('shim: a formula that strips to empty never constructs a Roll', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  const rolled = await evaluateCheckRoll('@craftingmod', actor, {
    craftingModifier: MOD_CONTEXT,
  });
  assert.equal(rolledFormulas.length, 0, 'no formula ever reached Roll');
  assert.equal(rolled.engine, false, 'reported as "no engine", the non-blocking shape');
  assert.equal(rolled.total, 0);
  assert.equal(rolled.resolvedFormula, null);
  delete globalThis.Roll;
});

// A NON-ADDITIVE placement is refused positionally, never by asking `Roll.validate` about
// the residue. `max(@craftingmod, 2)` is the case that makes the distinction load-bearing:
// its residue `max(, 2)` is a formula real Foundry ACCEPTS — `FunctionTerm`'s head is
// `Expression?`, so it parses with zero argument terms, `Math.max()` yields `-Infinity`
// and `Roll#total`'s `Number(this._total) || 0` lets that through — so a validate-driven
// rule would roll `-Infinity` against the DC on every craft, forever, silently.
test('shim: runFormulaPassFail does not FAIL a craft whose formula strips to empty', async () => {
  const rolledFormulas = stubCraftingModRoll();
  for (const formula of ['1d20 * @craftingmod', 'max(@craftingmod, 2)', '(@craftingmod)d6']) {
    const r = await runFormulaPassFail({
      formula,
      dc: 10,
      thresholdMode: 'meet',
      actor: { getRollData: () => ({}) },
      craftingModifier: MOD_CONTEXT,
    });
    assert.equal(r.success, true, `${formula}: must not become a consuming failure`);
    assert.equal(r.outcome, 'pass');
    assert.equal(r.value, null);
  }
  assert.equal(rolledFormulas.length, 0, 'and none of them ever reached Roll');
  delete globalThis.Roll;
});

test('shim: resolveCheckFormulaDisplay reports no formula for a placeholder-only string', () => {
  stubCraftingModRoll();
  assert.equal(resolveCheckFormulaDisplay('@craftingmod', { getRollData: () => ({}) }), null);
  assert.equal(
    resolveCheckFormulaDisplay('1d20 + @craftingmod', { getRollData: () => ({}) }).display,
    '1d20',
    'and strips a survivor rather than displaying a token the roll path has removed'
  );
  delete globalThis.Roll;
});

// ── interactive playerPicks: the DEFERRED modifier term (issues 770 P2, 1094) ──

// The interactive `playerPicks` descriptor: eligible modifiers + the best legal
// pre-selection. Herbalism (5) is the default; Medicine (3) is the override option.
// `maxPicks: 1` is the single-pick descriptor the radio group renders.
const PICK_CHOICE = {
  modifiers: [
    { id: 'med', label: 'Medicine', icon: 'fa-med', value: 3 },
    { id: 'herb', label: 'Herbalism', icon: 'fa-herb', value: 5 },
  ],
  maxPicks: 1,
  defaultSelectedIds: ['herb'],
  defaultSelectedId: 'herb',
};

// …and the multi-pick descriptor: same options, a cap of 2, both pre-selected.
const MULTI_PICK_CHOICE = {
  ...PICK_CHOICE,
  maxPicks: 2,
  defaultSelectedIds: ['med', 'herb'],
  defaultSelectedId: 'med',
};

test('playerPicks: the chosen modifier value is APPENDED before Roll (eval == display)', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  const rolled = await evaluateCheckRoll('1d20', actor, {
    interactive: true,
    modifierChoice: PICK_CHOICE,
    prompt: async () => ({ confirmed: true, chosenModifierId: 'med', advantage: 'normal' }),
  });
  assert.equal(
    rolledFormulas.at(-1),
    '1d20 + 3[Modifiers]',
    'chosen Medicine (3) appended, not the default'
  );
  assert.equal(rolled.resolvedFormula, '1d20 + 3[Modifiers]', 'display equals what evaluated');
  delete globalThis.Roll;
});

test('playerPicks: confirming the default pre-selection uses the highest value', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  await evaluateCheckRoll('1d20', actor, {
    interactive: true,
    modifierChoice: PICK_CHOICE,
    // Headless-style confirm without an explicit selection → falls back to the default.
    prompt: async () => ({ confirmed: true, advantage: 'normal' }),
  });
  assert.equal(rolledFormulas.at(-1), '1d20 + 5[Modifiers]', 'default Herbalism (5) is used');
  delete globalThis.Roll;
});

test('playerPicks: the prompt receives the descriptor and a neutral modifier placeholder', async () => {
  stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  let promptedArgs = null;
  await evaluateCheckRoll('1d20', actor, {
    interactive: true,
    modifierChoice: PICK_CHOICE,
    prompt: async (args) => {
      promptedArgs = args;
      return { confirmed: true, chosenModifierId: 'herb', advantage: 'normal' };
    },
  });
  assert.equal(
    promptedArgs.modifierChoice,
    PICK_CHOICE,
    'the descriptor is threaded to the prompt'
  );
  // The deferred slot is a TRAILING `+ (modifier)[Modifiers]` term — the same position
  // the resolved term takes — rather than a static default number a non-default pick
  // would contradict; the per-option chips carry each option's value.
  assert.equal(
    promptedArgs.formula,
    '1d20 + (modifier)[Modifiers]',
    'the modifier slot is a neutral trailing term'
  );
  assert.equal(
    promptedArgs.resolvedFormula,
    '1d20 + (modifier)[Modifiers]',
    'display shows the same trailing slot'
  );
  delete globalThis.Roll;
});

test('playerPicks: the chosen modifier is APPENDED BEFORE the advantage transform', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  const rolled = await evaluateCheckRoll('1d20', actor, {
    interactive: true,
    modifierChoice: PICK_CHOICE,
    prompt: async () => ({ confirmed: true, chosenModifierId: 'med', advantage: 'advantage' }),
  });
  // The append (med → 3) precedes the plain-d20 advantage rewrite, so the modifier
  // composes on top of the kept-highest pool: `2d20kh1 + 3[Modifiers]`, eval == display.
  assert.equal(rolledFormulas.at(-1), '2d20kh1 + 3[Modifiers]', 'advantage composes on the chosen modifier');
  assert.equal(rolled.resolvedFormula, '2d20kh1 + 3[Modifiers]', 'display equals what evaluated');
  delete globalThis.Roll;
});

test('playerPicks: an unknown chosen id contributes 0, so no term is appended', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  await evaluateCheckRoll('1d20', actor, {
    interactive: true,
    modifierChoice: PICK_CHOICE,
    prompt: async () => ({
      confirmed: true,
      chosenModifierId: 'not-a-real-id',
      advantage: 'normal',
    }),
  });
  assert.equal(rolledFormulas.at(-1), '1d20', 'unknown id → 0 → the zero-skip appends nothing');
  delete globalThis.Roll;
});

// ── multi-pick playerPicks: the returned SELECTION (issue 1055) ──────────────
//
// The prompt now returns `chosenModifierIds` (an array). `evaluateCheckRoll` reads it
// back in a fixed precedence — array first, the historical scalar second, the
// descriptor's own pre-selection third — and SUMS the survivors.

/** Roll the interactive path once and report the formula that reached `Roll`. */
async function rollChoice(modifierChoice, choice) {
  const rolledFormulas = stubCraftingModRoll();
  await evaluateCheckRoll(
    '1d20',
    { getRollData: () => ({}) },
    {
      interactive: true,
      modifierChoice,
      prompt: async () => ({ confirmed: true, advantage: 'normal', ...choice }),
    }
  );
  const rolled = rolledFormulas.at(-1);
  delete globalThis.Roll;
  return rolled;
}

// ── a chosen ROLLING modifier (issue 1118) ──────────────────────────────────
//
// A descriptor option carries `formula` instead of `value` when its expression rolls, and
// the chosen fragment is appended VERBATIM as its own flavoured term. It is taken from the
// descriptor rather than rebuilt here, so the chip the player was offered and the term that
// rolls are one derivation.
const DICE_PICK_CHOICE = {
  modifiers: [
    { id: 'med', label: 'Medicine', icon: 'fa-med', value: 3, formula: null, display: '+3' },
    {
      id: 'luck',
      label: 'Luck',
      icon: 'fa-luck',
      value: null,
      formula: '(1d4)',
      display: '+1d4',
    },
    {
      id: 'bounded',
      label: 'Bounded',
      icon: 'fa-b',
      value: null,
      formula: 'min(max((1d8), -1), 6)',
      display: '+min(max((1d8), -1), 6)',
    },
  ],
  maxPicks: 2,
  defaultSelectedIds: ['bounded'],
  defaultSelectedId: 'bounded',
};

test('playerPicks: a chosen ROLLING modifier appends its dice, not its average', async () => {
  assert.equal(
    await rollChoice(DICE_PICK_CHOICE, { chosenModifierIds: ['luck'] }),
    '1d20 + (1d4)[Modifiers]',
    'the fragment is appended verbatim; 2.5 is a number the roll could never produce'
  );
  assert.equal(
    await rollChoice(DICE_PICK_CHOICE, { chosenModifierIds: ['bounded'] }),
    '1d20 + min(max((1d8), -1), 6)[Modifiers]',
    'and a bounded one keeps its clamp'
  );
});

test('playerPicks: a mixed selection sums the flat half and appends the rolling half', async () => {
  assert.equal(
    await rollChoice(DICE_PICK_CHOICE, { chosenModifierIds: ['med', 'luck'] }),
    '1d20 + 3[Modifiers] + (1d4)[Modifiers]',
    'one flat term, then one term per rolling pick'
  );
});

test('playerPicks: the cap still truncates a rolling selection', async () => {
  assert.equal(
    await rollChoice(DICE_PICK_CHOICE, { chosenModifierIds: ['med', 'luck', 'bounded'] }),
    '1d20 + 3[Modifiers] + (1d4)[Modifiers]',
    'the third pick exceeds maxPicks 2 and is dropped in descriptor order'
  );
});

test('playerPicks: a rolling PRE-SELECTION is what a headless confirm rolls', async () => {
  assert.equal(
    await rollChoice(DICE_PICK_CHOICE, {}),
    '1d20 + min(max((1d8), -1), 6)[Modifiers]',
    'confirming without a selection falls back to the descriptor pre-selection'
  );
});

// ── advantage belongs to the AUTHORED check, not to a modifier (issue 1118 review) ──
//
// `parsePlainDiceGroups` splits on parens AND flavour brackets, so `(1d20)[Modifiers]`
// tokenises to a plain `1d20`. Without scoping, a check with no d20 of its own would offer
// Advantage and the transform would rewrite the MODIFIER's die.
const D20_MODIFIER_CHOICE = {
  modifiers: [
    { id: 'med', label: 'Medicine', icon: 'fa-med', value: 3, formula: null, display: '+3' },
    { id: 'wild', label: 'Wild', icon: 'fa-w', value: null, formula: '(1d20)', display: '+1d20' },
  ],
  maxPicks: 1,
  defaultSelectedIds: ['wild'],
  defaultSelectedId: 'wild',
};

test('a d20 MODIFIER on a d20-less check neither offers nor receives advantage', async () => {
  const rolledFormulas = stubCraftingModRoll();
  let asked = null;
  await evaluateCheckRoll(
    '3d6',
    { getRollData: () => ({}) },
    {
      interactive: true,
      modifierChoice: D20_MODIFIER_CHOICE,
      prompt: async (args) => {
        asked = args;
        return { confirmed: true, chosenModifierIds: ['wild'], advantage: 'advantage' };
      },
    }
  );
  assert.equal(asked.allowAdvantage, false, '3d6 is not a plain-d20 check, whatever it appends');
  assert.equal(
    rolledFormulas.at(-1),
    '3d6 + (1d20)[Modifiers]',
    "the modifier's die is left alone even when a caller forces the disposition"
  );
  delete globalThis.Roll;
});

// The NON-DEFERRED path asked the same question of the POST-append formula, so it is
// covered separately: on the deferred path the two readings coincide and a mutation there
// would go unnoticed.
test('a non-deferred d20 modifier does not manufacture an advantage offer', async () => {
  const rolledFormulas = stubCraftingModRoll();
  let asked = null;
  await evaluateCheckRoll(
    '3d6',
    { getRollData: () => ({}) },
    {
      interactive: true,
      craftingModifier: {
        catalogue: [{ id: 'wild', label: 'Wild', expression: '1d20' }],
        systemPolicy: 'addAll',
        defaultModifierIds: ['wild'],
      },
      prompt: async (args) => {
        asked = args;
        return { confirmed: true, advantage: 'advantage' };
      },
    }
  );
  assert.equal(asked.allowAdvantage, false, 'the appended d20 is not the check`s own');
  assert.equal(rolledFormulas.at(-1), '3d6 + (1d20)[Modifiers]');
  delete globalThis.Roll;
});

test('advantage still rewrites the CHECK`s own d20 with a d20 modifier appended', async () => {
  const rolledFormulas = stubCraftingModRoll();
  let asked = null;
  await evaluateCheckRoll(
    '1d20',
    { getRollData: () => ({}) },
    {
      interactive: true,
      modifierChoice: D20_MODIFIER_CHOICE,
      prompt: async (args) => {
        asked = args;
        return { confirmed: true, chosenModifierIds: ['wild'], advantage: 'advantage' };
      },
    }
  );
  assert.equal(asked.allowAdvantage, true, 'the authored check IS a plain-d20 one');
  assert.equal(
    rolledFormulas.at(-1),
    '2d20kh1 + (1d20)[Modifiers]',
    'the FIRST plain d20 is the check`s own, and the modifier keeps its die'
  );
  delete globalThis.Roll;
});

test('playerPicks: a multi-pick selection SUMS the chosen modifiers', async () => {
  assert.equal(
    await rollChoice(MULTI_PICK_CHOICE, { chosenModifierIds: ['med', 'herb'] }),
    '1d20 + 8[Modifiers]',
    'Medicine 3 + Herbalism 5'
  );
  assert.equal(
    await rollChoice(MULTI_PICK_CHOICE, { chosenModifierIds: ['med'] }),
    '1d20 + 3[Modifiers]',
    'one of two picked → that modifier alone'
  );
});

// `chosenModifierIds: []` is an ANSWER, not an absence. The player unticked everything,
// which contributes 0 and appends nothing; falling through to the descriptor default here
// would silently roll a modifier the player deliberately declined.
test('playerPicks: an EMPTY chosenModifierIds is an answer and beats the default', async () => {
  assert.equal(
    await rollChoice(MULTI_PICK_CHOICE, { chosenModifierIds: [] }),
    '1d20',
    'an empty array contributes 0 rather than falling back to the pre-selection'
  );
  // The negative control: with NO selection field at all, the same descriptor DOES fall
  // through to its pre-selection — so `(0)` above is the empty array being honoured
  // rather than a dead path.
  assert.equal(
    await rollChoice(MULTI_PICK_CHOICE, {}),
    '1d20 + 8[Modifiers]',
    'a headless confirm with no selection opens the descriptor default (both pre-selected)'
  );
});

test('playerPicks: the read-back precedence is ids, then the scalar, then the default', async () => {
  assert.equal(
    await rollChoice(MULTI_PICK_CHOICE, {
      chosenModifierIds: ['med'],
      chosenModifierId: 'herb',
    }),
    '1d20 + 3[Modifiers]',
    'the array wins over the historical scalar'
  );
  assert.equal(
    await rollChoice(MULTI_PICK_CHOICE, { chosenModifierId: 'herb' }),
    '1d20 + 5[Modifiers]',
    'the scalar is still honoured when no array came back — a harness supplying one keeps working'
  );
  assert.equal(
    await rollChoice(MULTI_PICK_CHOICE, { chosenModifierIds: null, chosenModifierId: null }),
    '1d20 + 8[Modifiers]',
    'null on both falls through to the descriptor default, exactly as `??` did'
  );
});

// The prompt is a UI control, so its cap is NOT the invariant: this layer re-derives the
// legal selection from the descriptor and never trusts what came back. Survivors are
// taken in ELIGIBLE-SET order and truncated — deliberately NOT best-N — so cheating the
// prompt can never pay more than a legal pick.
const OVER_LARGE_CHOICE = {
  modifiers: [
    { id: 'med', label: 'Medicine', icon: 'fa-med', value: 3 },
    { id: 'herb', label: 'Herbalism', icon: 'fa-herb', value: 5 },
    { id: 'alch', label: 'Alchemy', icon: 'fa-alch', value: 11 },
  ],
  maxPicks: 2,
  defaultSelectedIds: ['herb', 'alch'],
  defaultSelectedId: 'herb',
};

test('playerPicks: an OVER-LARGE selection is truncated in eligible-set order, not best-N', async () => {
  assert.equal(
    await rollChoice(OVER_LARGE_CHOICE, { chosenModifierIds: ['med', 'herb', 'alch'] }),
    '1d20 + 8[Modifiers]',
    'the first two OFFERED survivors (Medicine 3 + Herbalism 5) — best-N would have paid 16'
  );
  // The order the prompt happened to report is irrelevant: the descriptor decides.
  assert.equal(
    await rollChoice(OVER_LARGE_CHOICE, { chosenModifierIds: ['alch', 'herb', 'med'] }),
    '1d20 + 8[Modifiers]',
    'reordering the returned array changes nothing'
  );
});

test('playerPicks: unknown ids are DISCARDED before the cap is counted', async () => {
  assert.equal(
    await rollChoice(OVER_LARGE_CHOICE, {
      chosenModifierIds: ['ghost', 'phantom', 'alch'],
    }),
    '1d20 + 11[Modifiers]',
    'ids the descriptor never offered are dropped rather than consuming a slot'
  );
  assert.equal(
    await rollChoice(OVER_LARGE_CHOICE, { chosenModifierIds: ['ghost'] }),
    '1d20',
    'a lone unknown id still contributes 0'
  );
});

// A descriptor built before `maxPicks` existed must not silently widen to unlimited.
test('playerPicks: an absent or junk maxPicks falls back to the historical single pick', async () => {
  for (const maxPicks of [undefined, null, 0, -1, 2.5, 'two']) {
    assert.equal(
      await rollChoice(
        { ...OVER_LARGE_CHOICE, maxPicks },
        { chosenModifierIds: ['med', 'herb', 'alch'] }
      ),
      '1d20 + 3[Modifiers]',
      `maxPicks ${String(maxPicks)} means 1, so only the first offered survivor counts`
    );
  }
});

test('playerPicks: the chosen value composes UNDER a situational bonus', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  await evaluateCheckRoll('1d20', actor, {
    interactive: true,
    modifierChoice: PICK_CHOICE,
    prompt: async () => ({
      confirmed: true,
      chosenModifierId: 'med',
      bonus: '2',
      advantage: 'normal',
    }),
  });
  assert.equal(
    rolledFormulas.at(-1),
    '1d20 + 3[Modifiers] + (2)',
    'the modifier term appends first, then the situational bonus'
  );
  delete globalThis.Roll;
});

test('playerPicks: a cancelled prompt aborts with no appended term and no roll', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  const rolled = await evaluateCheckRoll('1d20', actor, {
    interactive: true,
    modifierChoice: PICK_CHOICE,
    prompt: async () => ({ confirmed: false }),
  });
  assert.equal(rolled.cancelled, true);
  assert.equal(rolledFormulas.length, 0, 'no formula ever rolled on cancel');
  delete globalThis.Roll;
});

// eval == display is an acceptance criterion of #855, and the SITUATIONAL-BONUS branch
// is where it can silently break: `effectiveFormula` gets the bonus appended, and only
// the paired `resolved = resolveCheckFormulaDisplay(...)` recompute keeps the journal /
// `resolvedFormula` in step. Without it a player who types `+2` sees `1d20 + 3[Modifiers]`
// while `1d20 + 3[Modifiers] + (2)` actually rolls. Both tests assert the ROLLED string and the
// DISPLAYED string are the same string.
test('playerPicks: eval == display with a situational bonus (and advantage) composed on top', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  const rolled = await evaluateCheckRoll('1d20', actor, {
    interactive: true,
    modifierChoice: PICK_CHOICE,
    prompt: async () => ({
      confirmed: true,
      chosenModifierId: 'med',
      bonus: '2',
      advantage: 'advantage',
    }),
  });
  assert.equal(
    rolledFormulas.at(-1),
    '2d20kh1 + 3[Modifiers] + (2)',
    'modifier, then advantage, then bonus'
  );
  assert.equal(
    rolled.resolvedFormula,
    '2d20kh1 + 3[Modifiers] + (2)',
    'the journal/display formula equals the formula that actually evaluated'
  );
  delete globalThis.Roll;
});

test('interactive: eval == display when only a situational bonus is appended (no playerPicks)', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({}) };
  const rolled = await evaluateCheckRoll('1d20 + 3', actor, {
    interactive: true,
    prompt: async () => ({ confirmed: true, bonus: '2', advantage: 'normal' }),
  });
  assert.equal(rolledFormulas.at(-1), '1d20 + 3 + (2)');
  assert.equal(rolled.resolvedFormula, '1d20 + 3 + (2)', 'display equals what evaluated');
  delete globalThis.Roll;
});

// The chat-flavor thread: the chosen modifier's label rides the existing flavor so the
// posted roll says WHICH modifier the player picked. `stubCraftingModRoll`'s evaluated
// roll has no `toMessage`, and the post is wrapped in a swallow-everything try/catch, so
// the append is only observable through a roll stub that records the payload.
function stubCraftingModChatRoll() {
  const posted = [];
  stubCraftingModRoll();
  const Base = globalThis.Roll;
  // Static `replaceFormulaData` / `validate` are inherited through the class chain.
  globalThis.Roll = class extends Base {
    async evaluate(options) {
      const rolled = await super.evaluate(options);
      return {
        ...rolled,
        toMessage: async (data, messageOptions) => {
          posted.push({ data, options: messageOptions });
        },
      };
    }
  };
  return posted;
}

function withChatMessage(run) {
  const previous = globalThis.ChatMessage;
  globalThis.ChatMessage = { create: () => {} };
  return run().finally(() => {
    if (previous === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previous;
  });
}

test('playerPicks: the chosen modifier label is appended to the chat flavor', async () => {
  const posted = stubCraftingModChatRoll();
  await withChatMessage(() =>
    evaluateCheckRoll('1d20', { getRollData: () => ({}) }, {
      interactive: true,
      modifierChoice: PICK_CHOICE,
      flavor: 'Healing Salve — Crafting check (DC 10)',
      prompt: async () => ({ confirmed: true, chosenModifierId: 'med', advantage: 'normal' }),
    })
  );
  assert.equal(
    posted.at(-1).data.flavor,
    'Healing Salve — Crafting check (DC 10) · Medicine',
    'the picked label rides the existing flavor behind a bullet'
  );
  delete globalThis.Roll;
});

test('playerPicks: an empty base flavor gets the label alone, never an orphan bullet', async () => {
  const posted = stubCraftingModChatRoll();
  await withChatMessage(() =>
    evaluateCheckRoll('1d20', { getRollData: () => ({}) }, {
      interactive: true,
      modifierChoice: PICK_CHOICE,
      // No `flavor`: a direct caller / test path production never takes.
      prompt: async () => ({ confirmed: true, chosenModifierId: 'herb', advantage: 'normal' }),
    })
  );
  assert.equal(posted.at(-1).data.flavor, 'Herbalism', 'no leading "· " on an empty base');
  delete globalThis.Roll;
});

// A multi-pick selection is ONE bullet segment with the labels comma-joined inside it,
// so the flavor does not grow a separator per modifier. The single-pick output above is
// unchanged, which is the point of joining inside the segment rather than outside it.
test('playerPicks: multiple picked labels join with ", " INSIDE one bullet segment', async () => {
  const posted = stubCraftingModChatRoll();
  await withChatMessage(() =>
    evaluateCheckRoll(
      '1d20',
      { getRollData: () => ({}) },
      {
        interactive: true,
        modifierChoice: MULTI_PICK_CHOICE,
        flavor: 'Healing Salve — Crafting check (DC 10)',
        prompt: async () => ({
          confirmed: true,
          chosenModifierIds: ['med', 'herb'],
          advantage: 'normal',
        }),
      }
    )
  );
  assert.equal(
    posted.at(-1).data.flavor,
    'Healing Salve — Crafting check (DC 10) · Medicine, Herbalism',
    'one bullet, then the labels comma-joined in descriptor order'
  );
  delete globalThis.Roll;
});

test('playerPicks: an EMPTY multi-pick selection leaves the flavor untouched', async () => {
  const posted = stubCraftingModChatRoll();
  await withChatMessage(() =>
    evaluateCheckRoll(
      '1d20',
      { getRollData: () => ({}) },
      {
        interactive: true,
        modifierChoice: MULTI_PICK_CHOICE,
        flavor: 'Crafting check',
        prompt: async () => ({ confirmed: true, chosenModifierIds: [], advantage: 'normal' }),
      }
    )
  );
  assert.equal(posted.at(-1).data.flavor, 'Crafting check', 'no orphan trailing "· "');
  delete globalThis.Roll;
});

test('playerPicks: an unlabelled chosen modifier leaves the flavor untouched', async () => {
  const posted = stubCraftingModChatRoll();
  await withChatMessage(() =>
    evaluateCheckRoll('1d20', { getRollData: () => ({}) }, {
      interactive: true,
      modifierChoice: {
        modifiers: [
          { id: 'bare', label: '', icon: '', value: 3 },
          { id: 'herb', label: 'Herbalism', icon: 'fa-herb', value: 5 },
        ],
        defaultSelectedId: 'herb',
      },
      flavor: 'Crafting check',
      prompt: async () => ({ confirmed: true, chosenModifierId: 'bare', advantage: 'normal' }),
    })
  );
  assert.equal(posted.at(-1).data.flavor, 'Crafting check', 'no trailing "· " for a blank label');
  delete globalThis.Roll;
});

// THE BACK-COMPAT GUARANTEE (issue 1055), pinned in BOTH halves because only the pair
// says anything. `playerPicks` sums the BEST LEGAL selection, so the CAP is what decides
// the arithmetic: at 1 — the bound `1.20.0` stamps onto every pre-existing `playerPicks`
// system — it is `max(3,5)` and identical to `highest`, which is what those worlds always
// rolled; unbounded it is the plain sum, because picking everything is then legal.
// Asserting only the unbounded half would let a regression that silently capped, or
// silently uncapped, every world ship green.
test('playerPicks non-interactive: a cap of 1 resolves the scalar exactly as highest', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({ abilities: { med: { mod: 3 }, alch: { mod: 5 } } }) };
  // No prompt / not interactive: the deterministic scalar path runs.
  await evaluateCheckRoll('1d20', actor, {
    craftingModifier: { ...MOD_CONTEXT, systemPolicy: 'playerPicks', maxModifierPicks: 1 },
  });
  assert.equal(
    rolledFormulas.at(-1),
    '1d20 + 5[Modifiers]',
    'capped at one pick, playerPicks == highest(3,5) — the migrated world rolls what it always rolled'
  );
  // The same context under `highest` is the same string, which is the whole claim.
  await evaluateCheckRoll('1d20', actor, {
    craftingModifier: { ...MOD_CONTEXT, systemPolicy: 'highest' },
  });
  assert.equal(rolledFormulas.at(-1), '1d20 + 5[Modifiers]');
  delete globalThis.Roll;
});

test('playerPicks non-interactive: UNBOUNDED resolves the scalar as the full sum', async () => {
  const rolledFormulas = stubCraftingModRoll();
  const actor = { getRollData: () => ({ abilities: { med: { mod: 3 }, alch: { mod: 5 } } }) };
  // No `maxModifierPicks`: absence is UNLIMITED, so the best legal selection is
  // everything, and everything sums. A system reaching this state on purpose is a GM who
  // cleared the cap; a system reaching it by accident is what the migration prevents.
  await evaluateCheckRoll('1d20', actor, {
    craftingModifier: { ...MOD_CONTEXT, systemPolicy: 'playerPicks' },
  });
  assert.equal(rolledFormulas.at(-1), '1d20 + 8[Modifiers]', 'unbounded playerPicks sums 3 + 5');
  delete globalThis.Roll;
});

// Truth table: {default-select, pick-override, cancel, non-interactive} ×
// {rolled/display formula, pass-fail mutation}. Threaded through runFormulaPassFail so
// the cancel row also pins the zero-mutation contract.
test('playerPicks truth table: selection state → appended term + pass/fail disposition', async () => {
  const actor = { getRollData: () => ({}) };
  const promptFor = (response) => async () => response;

  // Default (Herbalism 5), confirmed → success at dc 10 (stub total 12).
  let rolledFormulas = stubCraftingModRoll();
  let r = await runFormulaPassFail({
    formula: '1d20',
    dc: 10,
    thresholdMode: 'meet',
    actor,
    craftingModifier: MOD_CONTEXT,
    rollOptions: {
      interactive: true,
      modifierChoice: PICK_CHOICE,
      prompt: promptFor({ confirmed: true, chosenModifierId: 'herb', advantage: 'normal' }),
    },
  });
  assert.equal(rolledFormulas.at(-1), '1d20 + 5[Modifiers]');
  assert.equal(r.data.resolvedFormula, '1d20 + 5[Modifiers]', 'eval == display for the default');
  assert.equal(r.success, true);

  // Override to Medicine (3), confirmed → still appends the chosen scalar.
  rolledFormulas = stubCraftingModRoll();
  r = await runFormulaPassFail({
    formula: '1d20',
    dc: 10,
    thresholdMode: 'meet',
    actor,
    craftingModifier: MOD_CONTEXT,
    rollOptions: {
      interactive: true,
      modifierChoice: PICK_CHOICE,
      prompt: promptFor({ confirmed: true, chosenModifierId: 'med', advantage: 'normal' }),
    },
  });
  assert.equal(rolledFormulas.at(-1), '1d20 + 3[Modifiers]');
  assert.equal(r.data.resolvedFormula, '1d20 + 3[Modifiers]');

  // Cancel → zero mutation: cancelled disposition, no value.
  rolledFormulas = stubCraftingModRoll();
  r = await runFormulaPassFail({
    formula: '1d20',
    dc: 10,
    thresholdMode: 'meet',
    actor,
    craftingModifier: MOD_CONTEXT,
    rollOptions: {
      interactive: true,
      modifierChoice: PICK_CHOICE,
      prompt: promptFor({ confirmed: false }),
    },
  });
  assert.equal(r.cancelled, true);
  assert.equal(r.success, false);
  assert.equal(r.value, null);
  assert.equal(rolledFormulas.length, 0, 'cancel rolls nothing');
  delete globalThis.Roll;
});

// ── evaluateCheckRoll: non-interactive option (defect 3) ────────────────────

test('evaluateCheckRoll evaluates with { allowInteractive: false } (no fulfilment dialog)', async () => {
  stubRoll(12, [{ number: 1, faces: 20, total: 12 }]);
  await evaluateCheckRoll('1d20', ACTOR);
  assert.equal(evaluateArgs.length, 1);
  assert.deepEqual(evaluateArgs[0], { allowInteractive: false });
});

test('runFormula* paths evaluate with { allowInteractive: false }', async () => {
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  await runFormulaPassFail({ formula: '1d20', dc: 10, thresholdMode: 'meet', actor: ACTOR });
  assert.deepEqual(evaluateArgs.at(-1), { allowInteractive: false });

  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  await runFormulaProgressive({ formula: '2d6', actor: ACTOR });
  assert.deepEqual(evaluateArgs.at(-1), { allowInteractive: false });

  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.deepEqual(evaluateArgs.at(-1), { allowInteractive: false });
});

// ── resolveForcedOutcome ────────────────────────────────────────────────────

test('resolveForcedOutcome returns the matched disposition; forced failure beats forced success', () => {
  const diceGroups = [
    { groupId: 0, group: '1d20', sum: 20, results: [20] },
    { groupId: 1, group: '1d6', sum: 1, results: [1] },
  ];
  const forced = resolveForcedOutcome(
    [
      totalTrigger({ id: 'a', groupId: 0, value: 20, outcome: 'success' }),
      totalTrigger({ id: 'b', groupId: 1, value: 1, outcome: 'failure' }),
    ],
    { total: 21, diceGroups }
  );
  assert.deepEqual(forced, { disposition: 'failure' });
});

test('resolveForcedOutcome returns null when no trigger matches', () => {
  assert.equal(
    resolveForcedOutcome([totalTrigger({ groupId: 0, value: 20, outcome: 'success' })], {
      total: 5,
      diceGroups: [{ groupId: 0, group: '1d20', sum: 5, results: [5] }],
    }),
    null
  );
});

test('resolveForcedOutcome ignores outcomeTier conditions (circular) and outcome:none triggers', () => {
  const diceGroups = [{ groupId: 0, group: '1d20', sum: 1, results: [1] }];
  const tierTrigger = {
    id: 'tier',
    condition: { type: 'outcomeTier', tierIds: ['x'], outcomeKeys: [] },
    outcome: 'failure',
    breakTools: false,
  };
  const noneTrigger = totalTrigger({ groupId: 0, value: 1, outcome: 'none' });
  assert.equal(resolveForcedOutcome([tierTrigger, noneTrigger], { total: 1, diceGroups }), null);
});

// ── runFormulaPassFail ──────────────────────────────────────────────────────

test('runFormulaPassFail: meet comparison passes at/above the DC', async () => {
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const r = await runFormulaPassFail({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    actor: ACTOR,
  });
  assert.equal(r.success, true);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.value, 15);
  assert.equal(r.data.comparison, 'meet');
});

test('runFormulaPassFail: a forced-failure trigger overrides the comparison; label drives the message', async () => {
  // total 2 would meet dc 1, but the trigger matches the rolled group total (1) and
  // forces failure.
  stubRoll(2, [{ number: 1, faces: 20, total: 1 }]);
  const r = await runFormulaPassFail({
    formula: '1d20',
    dc: 1,
    thresholdMode: 'meet',
    triggers: [totalTrigger({ groupId: 0, value: 1, outcome: 'failure' })],
    actor: ACTOR,
    label: 'Salvage',
  });
  assert.equal(r.success, false);
  assert.equal(r.message, 'Salvage check failed');
});

test('runFormulaPassFail: a throwing roll fails with a labelled message', async () => {
  stubThrowingRoll();
  const r = await runFormulaPassFail({ formula: '1d20', dc: 10, actor: ACTOR, label: 'Crafting' });
  assert.equal(r.success, false);
  assert.match(r.message, /Crafting check roll failed/);
});

test('runFormulaPassFail: no dice engine does not block (pass, value null)', async () => {
  delete globalThis.Roll;
  const r = await runFormulaPassFail({ formula: '1d20', dc: 10, actor: ACTOR });
  assert.equal(r.success, true);
  assert.equal(r.value, null);
});

test('runFormulaPassFail: records the @-resolved formula + total + dc for the journal', async () => {
  // A Roll with BOTH an instance evaluate() and the static replaceFormulaData the
  // display resolver uses, so evaluateCheckRoll can roll AND resolve the formula.
  const Roll = class {
    async evaluate() {
      return { total: 18, dice: [] };
    }
  };
  Roll.replaceFormulaData = (formula, data) =>
    String(formula).replace(/@([\w.]+)/g, (_m, path) => {
      const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
      return value == null ? `@${path}` : String(value);
    });
  Roll.validate = (formula) => !/@/.test(formula);
  globalThis.Roll = Roll;

  const actor = { getRollData: () => ({ abilities: { int: { mod: 3 } } }) };
  const r = await runFormulaPassFail({
    formula: '1d20 + @abilities.int.mod',
    dc: 16,
    thresholdMode: 'meet',
    actor,
  });

  assert.equal(
    r.data.resolvedFormula,
    '1d20 + 3',
    'resolved formula recorded, not the placeholder'
  );
  assert.equal(r.data.total, 18);
  assert.equal(r.data.dc, 16);
  delete globalThis.Roll;
});

// ── runFormulaProgressive ───────────────────────────────────────────────────

test('runFormulaProgressive: the total is the value; success/failure triggers force all/none', async () => {
  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  assert.equal((await runFormulaProgressive({ formula: '2d6', actor: ACTOR })).value, 8);

  stubRoll(3, [{ number: 2, faces: 6, total: 12 }]);
  assert.equal(
    (
      await runFormulaProgressive({
        formula: '2d6',
        triggers: [totalTrigger({ groupId: 0, value: 12, outcome: 'success' })],
        actor: ACTOR,
      })
    ).value,
    Number.MAX_SAFE_INTEGER
  );

  stubRoll(9, [{ number: 2, faces: 6, total: 2 }]);
  assert.equal(
    (
      await runFormulaProgressive({
        formula: '2d6',
        triggers: [totalTrigger({ groupId: 0, value: 2, outcome: 'failure' })],
        actor: ACTOR,
      })
    ).value,
    0
  );
});

test('runFormulaProgressive: no dice engine awards nothing (value 0) without blocking', async () => {
  delete globalThis.Roll;
  const r = await runFormulaProgressive({ formula: '2d6', actor: ACTOR });
  assert.equal(r.success, true);
  assert.equal(r.value, 0);
});

// ── runFormulaRouted ────────────────────────────────────────────────────────

// Relative tiers carry a DC delta; the effective threshold is base dc + outcome.dc.
const RELATIVE = [
  { id: 'crit', name: 'Critical Success', success: true, breakTools: false, dc: 10 },
  { id: 'good', name: 'Success', success: true, breakTools: false, dc: 0 },
  { id: 'bad', name: 'Failure', success: false, breakTools: false, dc: -5 },
];
const FIXED = [
  { id: 'low', name: 'Fumble', success: false, breakTools: true, start: 1, end: 5 },
  { id: 'mid', name: 'Partial', success: true, breakTools: false, start: 6, end: 14 },
  { id: 'high', name: 'Clean', success: true, breakTools: false, start: 15, end: 20 },
];

test('runFormulaRouted relative: meet picks the highest matching effective threshold', async () => {
  // base dc 15: thresholds are 25 (crit), 15 (good), 10 (bad). total 16 → 15 & 10 match.
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Success');
  assert.equal(r.success, true);
  assert.equal(r.value, 16);
  assert.equal(r.data.outcomeId, 'good');
});

test('runFormulaRouted relative: exceed needs strictly greater than the threshold', async () => {
  // total 15, threshold for "good" is exactly 15. exceed → does not match good; only "bad" (10).
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'exceed',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Failure');
  assert.equal(r.success, false);
  assert.equal(r.data.comparison, 'exceed');
});

test('runFormulaRouted fixed: the total lands inside its [start, end] range', async () => {
  stubRoll(8, [{ number: 1, faces: 20, total: 8 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Partial');
  assert.equal(r.success, true);
  assert.equal(r.data.outcomeId, 'mid');
});

test('runFormulaRouted: no tier matches → outcome null, success false', async () => {
  // base dc 15: lowest threshold is "bad" at 10. total 4 matches nothing.
  stubRoll(4, [{ number: 1, faces: 20, total: 4 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.equal(r.outcome, null);
  assert.equal(r.success, false);
  assert.equal(r.value, 4);
});

test('runFormulaRouted: clampToNearest routes a below-lowest total to the lowest tier', async () => {
  // Same below-everything roll as above (total 4, lowest threshold "bad" at 10), but
  // clampToNearest routes to that closest tier instead of a null outcome. The clamped
  // tier carries its own success flag ("bad" is success:false).
  stubRoll(4, [{ number: 1, faces: 20, total: 4 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
    clampToNearest: true,
  });
  assert.equal(r.outcome, 'Failure', 'clamps to the lowest-threshold tier');
  assert.equal(r.data.outcomeId, 'bad');
  assert.equal(r.success, false, "the clamped tier's own success flag stands");
  assert.equal(r.value, 4);
});

test('runFormulaRouted: clampToNearest leaves fixed mode returning null out of range', async () => {
  // Fixed authored ranges own their own gaps: the clamp flag does not fill them.
  stubRoll(25, [{ number: 1, faces: 20, total: 25 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
    clampToNearest: true,
  });
  assert.equal(r.outcome, null, '25 is above every fixed range; clamp is relative-only');
  assert.equal(r.success, false);
});

test('runFormulaRouted: a success trigger forces the highest succeeding tier', async () => {
  // total 4 would match nothing, but the success trigger reroutes to the best success tier.
  stubRoll(4, [{ number: 1, faces: 20, total: 20 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    triggers: [totalTrigger({ groupId: 0, value: 20, outcome: 'success' })],
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Critical Success');
  assert.equal(r.success, true);
});

test('runFormulaRouted: a failure trigger forces the lowest failing tier', async () => {
  // total 20 would match a success tier, but the failure trigger reroutes to the worst failing tier.
  stubRoll(20, [{ number: 1, faces: 20, total: 1 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    triggers: [totalTrigger({ groupId: 0, value: 1, outcome: 'failure' })],
    actor: ACTOR,
  });
  assert.equal(r.outcome, 'Failure');
  assert.equal(r.success, false);
});

test('runFormulaRouted: a forced disposition with no matching tier leaves outcome null', async () => {
  // Only a single success tier exists; a failure trigger has nowhere to route.
  stubRoll(12, [{ number: 1, faces: 20, total: 1 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    type: 'relative',
    relativeOutcomes: [{ id: 'only', name: 'Win', success: true, dc: 0 }],
    triggers: [totalTrigger({ groupId: 0, value: 1, outcome: 'failure' })],
    actor: ACTOR,
  });
  assert.equal(r.outcome, null);
  assert.equal(r.success, false);
});

test('runFormulaRouted: the matched (or rerouted) tier surfaces its breakTools', async () => {
  // Fixed "Fumble" range matches and carries breakTools: true.
  stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
  const tier = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
  });
  assert.equal(tier.outcome, 'Fumble');
  assert.equal(tier.data.breakTools, true);

  // A failure trigger reroutes to the worst failing tier ("Fumble"), surfacing that
  // tier's own breakTools (the routed per-tier legacy bridge).
  stubRoll(8, [{ number: 1, faces: 20, total: 1 }]);
  const forced = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    triggers: [totalTrigger({ groupId: 0, value: 1, outcome: 'failure' })],
    actor: ACTOR,
  });
  assert.equal(forced.outcome, 'Fumble');
  assert.equal(forced.data.breakTools, true);
});

// ── minOutcomeId gate (fixed-type recipe minimum success tier) ───────────────

test('runFormulaRouted fixed: a roll below the recipe minimum tier fails outright', async () => {
  // Require "Clean" (start 15); a total of 8 lands in "Partial" (start 6) — below it.
  stubRoll(8, [{ number: 1, faces: 20, total: 8 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
    minOutcomeId: 'high',
  });
  assert.equal(r.success, false);
  assert.equal(r.outcome, null, 'no tier routes on a min-tier failure');
  assert.equal(r.data.outcomeId, null);
  assert.equal(r.data.breakTools, false);
  assert.equal(r.data.minTierFailed, true);
  // Issue 975 renamed this from `rolledOutcomeId`: with stepping placed before the
  // gate, the tier the gate blocked is the FINAL (post-step) one, while "rolled" is
  // now a term of art for the pre-step tier.
  assert.equal(r.data.blockedOutcomeId, 'mid', 'the blocked tier is surfaced for explanation');
  assert.equal(r.value, 8);
});

test('runFormulaRouted fixed: a roll at or above the minimum tier resolves normally', async () => {
  // Roll into "Clean" (15-20) with the same "high" minimum → the tier stands.
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
    minOutcomeId: 'high',
  });
  assert.equal(r.outcome, 'Clean');
  assert.equal(r.success, true);
  assert.equal(r.data.outcomeId, 'high');
  assert.equal(r.data.minTierFailed, undefined, 'the gate flag is absent on a pass');

  // The boundary is inclusive: rolling exactly the required tier passes.
  stubRoll(8, [{ number: 1, faces: 20, total: 8 }]);
  const equal = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
    minOutcomeId: 'mid',
  });
  assert.equal(equal.outcome, 'Partial');
  assert.equal(equal.success, true);
});

test('runFormulaRouted fixed: no minOutcomeId leaves the rolled tier untouched', async () => {
  stubRoll(8, [{ number: 1, faces: 20, total: 8 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
    minOutcomeId: null,
  });
  assert.equal(r.outcome, 'Partial');
  assert.equal(r.success, true);
  assert.equal(r.data.minTierFailed, undefined);
});

test('runFormulaRouted fixed: a forced success bypasses the minimum-tier gate', async () => {
  // Below the "high" minimum, but a success trigger reroutes to the best success tier.
  stubRoll(8, [{ number: 1, faces: 20, total: 20 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    triggers: [totalTrigger({ groupId: 0, value: 20, outcome: 'success' })],
    actor: ACTOR,
    minOutcomeId: 'high',
  });
  assert.equal(r.success, true, 'a forced crit is not downgraded by the recipe minimum');
  assert.equal(r.outcome, 'Clean');
  assert.equal(r.data.minTierFailed, undefined);
});

test('runFormulaRouted fixed: an unknown minOutcomeId no-ops gracefully', async () => {
  stubRoll(8, [{ number: 1, faces: 20, total: 8 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
    minOutcomeId: 'ghost',
  });
  assert.equal(r.outcome, 'Partial');
  assert.equal(r.success, true);
});

test('runFormulaRouted relative: minOutcomeId is ignored (fixed-type only)', async () => {
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
    minOutcomeId: 'good',
  });
  assert.equal(r.outcome, 'Success');
  assert.equal(r.success, true);
});

test('runFormulaRouted fixed: a min-tier failure drops the rolled tier breakTools', async () => {
  // Require "Clean" (start 15); the roll lands in "Fumble" (start 1), which carries
  // breakTools:true — but a min-tier failure routes no tier, so breakTools is dropped.
  stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 0,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
    minOutcomeId: 'high',
  });
  assert.equal(r.success, false);
  assert.equal(r.data.breakTools, false, 'no tier routes → the rolled tier breakTools is dropped');
  assert.equal(r.data.minTierFailed, true);
  assert.equal(r.data.blockedOutcomeId, 'low');
});

// ── interactive prompt DC seam (the fixed-check "no DC" contract) ────────────

test('runFormulaRouted: the fixed-check interactive prompt shows no DC (rollOptions.dc is not clobbered by the tier-matching dc)', async () => {
  // The engine passes dc:undefined on rollOptions for a fixed check; the runner must
  // NOT re-inject its tier-matching `dc` param and re-surface a DC chip in the prompt.
  stubRoll(8, [{ number: 1, faces: 20, total: 8 }]);
  let promptedDc = 'UNSET';
  await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    type: 'fixed',
    fixedOutcomes: FIXED,
    actor: ACTOR,
    rollOptions: {
      interactive: true,
      dc: undefined,
      prompt: async (args) => {
        promptedDc = args.dc;
        return { confirmed: true };
      },
    },
  });
  assert.equal(promptedDc, undefined);
});

test('runFormulaRouted: a relative interactive prompt still receives its DC', async () => {
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  let promptedDc = 'UNSET';
  await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
    rollOptions: {
      interactive: true,
      dc: 15,
      prompt: async (args) => {
        promptedDc = args.dc;
        return { confirmed: true };
      },
    },
  });
  assert.equal(promptedDc, 15);
});

test('runFormulaRouted: no dice engine does not block and does not fabricate a route', async () => {
  delete globalThis.Roll;
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
  });
  assert.equal(r.success, true);
  assert.equal(r.outcome, null);
  assert.equal(r.value, null);
});

test('runFormulaRouted: a throwing roll fails with a labelled message', async () => {
  stubThrowingRoll();
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 15,
    type: 'relative',
    relativeOutcomes: RELATIVE,
    actor: ACTOR,
    label: 'Salvage',
  });
  assert.equal(r.success, false);
  assert.equal(r.outcome, null);
  assert.match(r.message, /Salvage check roll failed/);
});
