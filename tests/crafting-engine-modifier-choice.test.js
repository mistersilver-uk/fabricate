// Engine gating for the interactive `playerPicks` modifier-choice descriptor (#855).
// The resolver (builds the descriptor) and the roll prompt (consumes it) are unit
// tested elsewhere; this pins the ENGINE glue that decides WHEN to build one, so a
// regression that widened the guard (e.g. to include `highest`) or NARROWED it back to a
// placeholder-presence test would fail here rather than ship green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingListingBuilder } from '../src/systems/CraftingListingBuilder.js';
import { resolveCheckFormulaDisplay } from '../src/systems/checkRoll.js';
import { Recipe } from '../src/models/Recipe.js';
import { stubInteractiveRollEnvironment } from './helpers/rollPromptDialogStub.js';

// `Recipe` stamps `metadata.author` from a BARE `game` reference, which is a
// ReferenceError rather than `undefined` when the global is absent. The authority cases
// below build real recipes, so the minimum global lives here; the dismissal test at the
// end of this file saves and restores whatever it finds.
globalThis.game = { user: { name: 'GM' } };

// Stub Roll.replaceFormulaData so the internal makeRollDataExpressionEvaluator resolves
// the catalogue's `@key` expressions to numbers; an unknown key is left `@`-prefixed so
// the evaluator zeroes it (matching production).
function withRoll(values, fn) {
  const previous = globalThis.Roll;
  globalThis.Roll = {
    replaceFormulaData: (expression) =>
      String(expression).replace(/@([a-z]+)/gi, (_match, key) =>
        key in values ? String(values[key]) : `@${key}`
      ),
  };
  try {
    return fn();
  } finally {
    globalThis.Roll = previous;
  }
}

const CATALOGUE = [
  { id: 'med', label: 'Medicine', icon: 'fa-a', expression: '@med' },
  { id: 'herb', label: 'Herbalism', icon: 'fa-b', expression: '@herb' },
];
const ACTOR = { getRollData: () => ({}) };
const engine = new CraftingEngine(null);
const build = (formula, context, interactive) =>
  engine._buildInteractiveModifierChoice(formula, context, ACTOR, interactive);
const context = (overrides = {}) => ({
  catalogue: CATALOGUE,
  systemPolicy: 'playerPicks',
  defaultModifierIds: ['med', 'herb'],
  recipeModifier: null,
  ...overrides,
});

test('engine gating: a non-interactive craft threads no modifierChoice', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    assert.equal(build('1d20', context(), false), null);
  });
});

// `playerPicks` is the ONLY rule that defers to ROLL time. `byRecipe` defers too, but to
// the RECIPE AUTHOR at recipe-edit time — by the time the engine rolls, the choice is
// already made and stored, so prompting would re-ask a question the recipe answered.
// That is why the gate tests for `playerPicks` specifically rather than for
// `policyDefersSelection`.
test('engine gating: an interactive non-playerPicks rule threads no modifierChoice', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    for (const systemPolicy of ['addAll', 'highest', 'byRecipe']) {
      assert.equal(
        build('1d20', context({ systemPolicy }), true),
        null,
        systemPolicy
      );
    }
    // …including `byRecipe` with a real recipe pick in hand: the selection is stored, so
    // there is still nothing to prompt for.
    assert.equal(
      build(
        '1d20',
        context({ systemPolicy: 'byRecipe', recipeModifier: { modifierIds: ['med', 'herb'] } }),
        true
      ),
      null,
      'byRecipe defers to the recipe author, not to the player'
    );
  });
});

test('engine gating: interactive playerPicks over an authored formula builds the descriptor', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    const choice = build('1d20', context({ maxModifierPicks: 1 }), true);
    assert.ok(choice, 'a descriptor is built');
    assert.equal(choice.maxPicks, 1, 'the system cap rides the descriptor');
    assert.deepEqual(choice.defaultSelectedIds, ['herb'], 'pre-selects the highest (herb +5)');
    assert.deepEqual(
      choice.modifiers.map((modifier) => modifier.id),
      ['med', 'herb']
    );
  });
});

// The cap is a SYSTEM fact threaded straight through the context bag, so the prompt can
// never offer a wider selection than the engine would honour.
test('engine gating: the descriptor carries the system cap, clamped to the option count', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    assert.equal(build('1d20', context({ maxModifierPicks: 2 }), true).maxPicks, 2);
    const unbounded = build('1d20', context(), true);
    assert.equal(unbounded.maxPicks, 2, 'unlimited over two options is two');
    assert.deepEqual(
      unbounded.defaultSelectedIds,
      ['med', 'herb'],
      'and everything is legal to pick, so everything is pre-selected'
    );
  });
});

// THE B1 GATE, re-pointed rather than deleted (issue 1094). This test used to assert the
// OPPOSITE: that a formula without the retired placeholder threads NO descriptor. That was
// the real gate on the whole interactive `playerPicks` feature — not `evaluateCheckRoll`'s
// `useDeferredChoice`, which only ever keyed on the descriptor being present — so retiring
// the placeholder without replacing this condition would have left every interactive
// `playerPicks` craft silently offering no modifier fieldset, with `npm test` green.
//
// It is also the assertion that FAILS if `_buildInteractiveModifierChoice` is mutated to
// `return null`: mutate it and this test flips red, which is what makes the gate proven
// live rather than merely described.
test('engine gating: a PLACEHOLDER-FREE formula still offers the modifier fieldset (B1)', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    const choice = build('1d20 + @abilities.int.mod', context(), true);
    assert.ok(choice, 'the migrated, placeholder-free formula still reaches the prompt');
    assert.deepEqual(
      choice.modifiers.map((modifier) => modifier.id),
      ['med', 'herb']
    );
  });
});

// The condition that REPLACED it: the active mode must carry an authored (post-shim) roll
// formula. There is nothing to modify on a check that rolls nothing.
test('engine gating: an unauthored formula threads no modifierChoice', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    for (const formula of ['', '   ', null, undefined]) {
      assert.equal(build(formula, context(), true), null, String(formula));
    }
  });
});

// …and a formula whose only content was the retired placeholder is unauthored too, once
// the shim has stripped it. Asserted with a `Roll.validate` double, because the residue
// check is what makes the non-additive placements answer "no formula" as well.
test('engine gating: a formula that strips to empty threads no modifierChoice', () => {
  const previousRoll = globalThis.Roll;
  globalThis.Roll = {
    replaceFormulaData: (expression) =>
      String(expression).replace(/@([a-z]+)/gi, (_match, key) =>
        ({ med: '2', herb: '5' })[key] ?? `@${key}`
      ),
    validate(formula) {
      const text = String(formula).trim();
      return text !== '' && !/[+\-*/]$/.test(text);
    },
  };
  try {
    assert.equal(build('@craftingmod', context(), true), null, 'placeholder alone');
    assert.equal(build('1d20 * @craftingmod', context(), true), null, 'multiplicative');
    // The residue of this one — `max(, 2)` — is a formula real Foundry ACCEPTS (and rolls
    // as `-Infinity`), so a gate that leaned on `Roll.validate` would still offer a
    // fieldset for a check that can never succeed.
    assert.equal(build('max(@craftingmod, 2)', context(), true), null, 'function argument');
    assert.equal(build('(@craftingmod)d6', context(), true), null, 'dice count');
    assert.ok(
      build('1d20 + @craftingmod', context(), true),
      'but an ADDITIVE placement leaves a real formula standing, so the fieldset is offered'
    );
  } finally {
    globalThis.Roll = previousRoll;
  }
});

test('engine gating: an empty eligible set threads no modifierChoice', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    assert.equal(build('1d20', context({ defaultModifierIds: [] }), true), null);
  });
});

test('engine gating: fewer than two eligible modifiers threads no modifierChoice', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    // One eligible modifier is not a choice: the radio could not be changed, and
    // `highest` over a single value substitutes that very modifier anyway.
    assert.equal(
      build('1d20', context({ defaultModifierIds: ['med'] }), true),
      null
    );
    assert.ok(
      build('1d20', context({ defaultModifierIds: ['med', 'herb'] }), true),
      'two eligible modifiers still build a descriptor'
    );
  });
});

// A recipe never overrides the rule, so a stored legacy `policy` can neither opt a
// recipe INTO an interactive roll nor opt it OUT of one. This is the descriptor-level
// observable of that invariant; the rolled string is asserted through a real runner
// further down.
test('engine gating: a stored recipe policy can neither add nor remove the descriptor', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    for (const stale of ['playerPicks', 'byRecipe', 'highest', 'addAll']) {
      assert.equal(
        build(
          '1d20',
          context({ systemPolicy: 'addAll', recipeModifier: { policy: stale } }),
          true
        ),
        null,
        `a recipe carrying ${stale} cannot opt an addAll system into an interactive roll`
      );
      assert.ok(
        build(
          '1d20',
          context({ systemPolicy: 'playerPicks', recipeModifier: { policy: stale } }),
          true
        ),
        `…and cannot opt a playerPicks system out of one either (${stale})`
      );
    }
  });
});

// ── composition: every check runner actually THREADS the descriptor ──────────
//
// The gating tests above call `_buildInteractiveModifierChoice` directly, so they say
// nothing about whether any runner CALLS it. Deleting the three
// `modifierChoice: this._buildInteractiveModifierChoice(…)` threads leaves the whole
// suite green and ships `playerPicks` dead. These tests drive the real seam end to end —
// engine → `buildInteractiveRollOptions` → `evaluateCheckRoll` → prompt → substitution —
// and assert the rolled formula carries the NON-DEFAULT picked value, so a missing
// descriptor (which falls back to the deterministic `highest`) cannot coincidentally
// match.

const PICK_CATALOGUE = [
  { id: 'med', label: 'Medicine', icon: 'fa-a', expression: '@med' },
  { id: 'herb', label: 'Herbalism', icon: 'fa-b', expression: '@herb' },
];
// Medicine (2) is the player's pick; Herbalism (5) is the pre-selected highest AND the
// value the deterministic fallback would append — hence `+ 2[Modifiers]` vs
// `+ 5[Modifiers]` discriminates.
const PICK_ACTOR = { getRollData: () => ({ med: 2, herb: 5 }) };
const PICK_FORMULA = '1d20';
const PICK_RECIPE = { name: 'Healing Salve', craftingSystemId: 'sys-1' };

/** A crafting system whose modifier catalogue is `playerPicks` over both entries. */
function modifierSystem(checkSlot) {
  return {
    craftingCheck: {
      checkModifiers: PICK_CATALOGUE,
      defaultModifierPolicy: 'playerPicks',
      defaultModifierIds: ['med', 'herb'],
      ...checkSlot,
    },
  };
}

const RUNNER_CASES = [
  {
    label: '_runPassFailCheck (simple / routedByIngredients / alchemy simple)',
    check: { simple: { rollFormula: PICK_FORMULA, dc: 10, thresholdMode: 'meet' } },
    run: (craftingEngine, system) =>
      craftingEngine._runPassFailCheck(
        system,
        system.craftingCheck.simple,
        PICK_RECIPE,
        null,
        PICK_ACTOR,
        { interactive: true }
      ),
  },
  {
    label: '_runRoutedCheck (routedByCheck / alchemy tiered)',
    check: {
      routed: {
        rollFormula: PICK_FORMULA,
        dc: 10,
        thresholdMode: 'meet',
        type: 'relative',
        relativeOutcomes: [{ id: 'o-fine', name: 'Fine', dc: 0, success: true }],
      },
    },
    run: (craftingEngine, system) =>
      craftingEngine._runRoutedCheck(system, PICK_RECIPE, null, PICK_ACTOR, { interactive: true }),
  },
  {
    label: '_runProgressiveCheck (progressive)',
    check: { progressive: { rollFormula: PICK_FORMULA } },
    run: (craftingEngine, system) =>
      craftingEngine._runProgressiveCheck(system, PICK_RECIPE, PICK_ACTOR, { interactive: true }),
  },
];

for (const runnerCase of RUNNER_CASES) {
  test(`engine composition: ${runnerCase.label} rolls the PLAYER-PICKED modifier`, async () => {
    const stub = stubInteractiveRollEnvironment({ pickedId: 'med' });
    try {
      const result = await runnerCase.run(
        new CraftingEngine(null),
        modifierSystem(runnerCase.check)
      );
      assert.equal(
        stub.rolled.at(-1),
        '1d20 + 2[Modifiers]',
        'the runner threaded the descriptor: the PICKED Medicine (+2) appended, not the pre-selected highest (+5)'
      );
      assert.equal(
        result.data.resolvedFormula,
        '1d20 + 2[Modifiers]',
        'the surfaced display formula equals what evaluated'
      );
    } finally {
      stub.restore();
    }
  });
}

// ── cancel: a dismissed playerPicks prompt aborts a REAL craft with zero mutation ──
//
// The repo's other zero-mutation proofs stub `_runCraftingCheck` out entirely, so none
// of them exercises a dismissed `playerPicks` dialog reaching the abort. This one runs
// the real check through `craft()`, dismisses the dialog, and asserts nothing moved.

test('engine craft: dismissing the playerPicks prompt cancels with zero Item mutation', async () => {
  const stub = stubInteractiveRollEnvironment({ dismiss: true });
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  const system = {
    resolutionMode: 'simple',
    features: { craftingChecks: true },
    craftingCheck: {
      enabled: true,
      simple: { rollFormula: PICK_FORMULA, dc: 10, thresholdMode: 'meet' },
      checkModifiers: PICK_CATALOGUE,
      defaultModifierPolicy: 'playerPicks',
      defaultModifierIds: ['med', 'herb'],
    },
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 },
  };

  const mutations = [];
  const ingredientItem = {
    id: 'ing-1',
    uuid: 'Item.ing-1',
    name: 'Spring Water',
    parent: null,
    system: { quantity: 2 },
    getFlag: () => undefined,
    setFlag: async () => {},
    delete: async () => {
      mutations.push('delete');
    },
    update: async (payload) => {
      mutations.push(['update', payload]);
    },
  };
  const ingredient = {
    systemItemId: 'ing-1',
    quantity: 1,
    getDescription: () => ingredientItem.name,
  };
  const ingredientSet = {
    id: 'set-1',
    matchIngredients: (availableItems) =>
      availableItems.includes(ingredientItem)
        ? [{ item: ingredientItem, quantity: 1, ingredient }]
        : [],
  };
  const recipe = {
    id: 'recipe-1',
    name: 'Healing Salve',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [],
    toolIds: [],
    outcomeRouting: null,
    steps: [],
    transferEffects: false,
    getExecutionSteps: null,
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return { id: this.id, name: this.name };
    },
  };
  const recipeManager = {
    canCraft: () => ({
      canCraft: true,
      satisfiableSet: ingredientSet,
      missing: { ingredients: [], essences: [], tools: [] },
    }),
    getToolsForSet: () => [],
    toolMatchesItem: () => false,
    ingredientMatchesItem: (_recipe, _ingredient, item) => item === ingredientItem,
  };
  const created = [];
  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem] };
  const craftingActor = {
    id: 'a1',
    name: 'Crafter',
    uuid: 'Actor.a1',
    items: { contents: [] },
    createEmbeddedDocuments: async (type, data) => {
      created.push([type, data]);
      return [];
    },
  };

  try {
    const result = await new CraftingEngine(recipeManager, null, null).craft(
      craftingActor,
      [sourceActor],
      recipe,
      null,
      { interactive: true }
    );
    assert.equal(result.cancelled, true, 'a dismissed dialog is a cancel, not a failure');
    assert.equal(result.success, false);
    assert.deepEqual(mutations, [], 'no ingredient item saw update or delete');
    assert.deepEqual(created, [], 'no result item was created');
    assert.deepEqual(stub.rolled, [], 'nothing was ever rolled');
  } finally {
    stub.restore();
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
    if (previousUi === undefined) delete globalThis.ui;
    else globalThis.ui = previousUi;
  }
});

// ── the four rules, as the engine actually ROLLS them (issue 1055) ───────────
//
// Every case here asserts the ROLLED FORMULA STRING produced by a real check runner.
// That is deliberate and it is the only observable that can fail for the right reason:
// a resolver-level assertion cannot see a runner that never threads the context, and a
// descriptor-level assertion cannot see the arithmetic that reaches Foundry's `Roll`.
// The fixture is two eligible modifiers with DIFFERENT values — Medicine 2, Herbalism 5
// — so `addAll`/unbounded-`playerPicks` (7), `highest`/capped-`playerPicks` (5), an
// authored empty set (0) and a one-modifier pick (2) are four distinct strings and no
// two of them can coincide.
//
// `resolvedFormula` is asserted equal to the rolled string in every case, which is
// acceptance criterion 9 (evaluated formula == displayed formula) under each rule.

const RULE_SLOT = { simple: { rollFormula: PICK_FORMULA, dc: 10, thresholdMode: 'meet' } };

/**
 * A crafting system with the two-modifier catalogue, a combination rule, a default
 * eligible set and — only when one is given — a pick cap. ABSENCE is unlimited and is a
 * real state, so the key is attached rather than defaulted.
 */
function ruleSystem({ policy, defaultIds = ['med', 'herb'], maxPicks } = {}) {
  const craftingCheck = {
    checkModifiers: PICK_CATALOGUE,
    defaultModifierPolicy: policy,
    defaultModifierIds: defaultIds,
    ...RULE_SLOT,
  };
  if (maxPicks !== undefined) craftingCheck.maxModifierPicks = maxPicks;
  return { resolutionMode: 'simple', craftingCheck };
}

/** A REAL recipe, so `Recipe._normalizeCraftingModifier` is on the path. */
function modifierRecipe(craftingModifier, id = 'r-mod') {
  return new Recipe({ id, name: 'Healing Salve', craftingSystemId: 'sys-1', craftingModifier });
}

/** Roll one interactive pass/fail check and report what actually reached `Roll`. */
async function rollThrough(system, recipe, stubOptions = {}) {
  const stub = stubInteractiveRollEnvironment(stubOptions);
  try {
    const result = await new CraftingEngine(null)._runPassFailCheck(
      system,
      system.craftingCheck.simple,
      recipe,
      null,
      PICK_ACTOR,
      { interactive: true }
    );
    return { rolled: stub.rolled.at(-1), resolved: result.data.resolvedFormula };
  } finally {
    stub.restore();
  }
}

/** Assert the rolled string, and that the DISPLAYED formula is the same string. */
function assertRolled({ rolled, resolved }, expected, message) {
  assert.equal(rolled, expected, message);
  assert.equal(resolved, expected, `${message} — and the surfaced formula equals it`);
}

test('engine rules: the SYSTEM rule decides the arithmetic, whatever a recipe stored', async () => {
  // A recipe carrying a legacy rule alongside a pick. The pick is honoured under
  // `byRecipe` and ignored elsewhere; the RULE is ignored everywhere.
  const recipe = modifierRecipe({ policy: 'addAll', modifierIds: ['med'] }, 'r-rule');
  assertRolled(
    await rollThrough(ruleSystem({ policy: 'highest' }), recipe),
    '1d20 + 5[Modifiers]',
    'highest stands: the stored addAll cannot flip max→sum'
  );
  assertRolled(
    await rollThrough(ruleSystem({ policy: 'addAll' }), recipe),
    '1d20 + 7[Modifiers]',
    'addAll sums the SYSTEM default set — the stored {med} pick is not a byRecipe pick'
  );
});

test('engine rules: byRecipe rolls the recipe author’s pick', async () => {
  const system = ruleSystem({ policy: 'byRecipe' });
  assertRolled(
    await rollThrough(system, modifierRecipe({ modifierIds: ['med'] }, 'r-pick')),
    '1d20 + 2[Modifiers]',
    'the recipe picked Medicine alone, so Medicine alone reaches the roll'
  );
  assertRolled(
    await rollThrough(system, modifierRecipe({ modifierIds: ['med', 'herb'] }, 'r-both')),
    '1d20 + 7[Modifiers]',
    'two picks SUM — byRecipe is a sum over what was picked'
  );
  assertRolled(
    await rollThrough(system, modifierRecipe(null, 'r-none')),
    '1d20 + 7[Modifiers]',
    'nothing picked → the system default set'
  );
});

// The cap is enforced at the RESOLVER, not only at the picker, so a GM who lowers it
// below what a recipe already picked cannot leave that recipe rolling more than the
// system now permits.
test('engine rules: a lowered cap TRUNCATES a byRecipe pick already on disk', async () => {
  const recipe = modifierRecipe({ modifierIds: ['med', 'herb'] }, 'r-capped');
  assertRolled(
    await rollThrough(ruleSystem({ policy: 'byRecipe' }), recipe),
    '1d20 + 7[Modifiers]',
    'unbounded, both picks reach the roll'
  );
  assertRolled(
    await rollThrough(ruleSystem({ policy: 'byRecipe', maxPicks: 1 }), recipe),
    '1d20 + 2[Modifiers]',
    'a cap of 1 keeps the FIRST pick in authored order (Medicine 2), never the best one'
  );
});

test('engine rules: an AUTHORED EMPTY pick appends nothing under byRecipe', async () => {
  // Built through the MODEL, never as a literal: the preservation of the empty array is
  // `Recipe._normalizeCraftingModifier`'s job, and a bare literal would bypass it and
  // prove nothing about the shape that actually persists.
  const recipe = modifierRecipe({ modifierIds: [] }, 'r-empty');
  assert.deepEqual(
    recipe.craftingModifier,
    { modifierIds: [] },
    'the model preserved the authored empty array rather than dropping the key'
  );
  assertRolled(
    await rollThrough(ruleSystem({ policy: 'byRecipe' }), recipe),
    '1d20',
    'no modifier is eligible, so the placeholder reduces to 0 — not to the system default'
  );
  assertRolled(
    await rollThrough(ruleSystem({ policy: 'addAll' }), recipe),
    '1d20 + 7[Modifiers]',
    'and it is ignored like any other pick under a rule that does not defer'
  );
});

// THE BACK-COMPAT GUARANTEE, end to end. A world migrated by `1.20.0` carries
// `maxModifierPicks: 1`, and at that cap `playerPicks` is arithmetically identical to
// `highest` on every non-interactive path — which is exactly what those worlds rolled
// before the cap existed.
test('engine rules: non-interactive playerPicks at cap 1 rolls the historical highest', async () => {
  const recipe = modifierRecipe(null, 'r-headless');
  const stub = stubInteractiveRollEnvironment();
  try {
    const craftingEngine = new CraftingEngine(null);
    const system = ruleSystem({ policy: 'playerPicks', maxPicks: 1 });
    // NOT interactive: no descriptor is built at all, so the deterministic scalar rolls.
    const result = await craftingEngine._runPassFailCheck(
      system,
      system.craftingCheck.simple,
      recipe,
      null,
      PICK_ACTOR,
      { interactive: false }
    );
    assert.equal(stub.rolled.at(-1), '1d20 + 5[Modifiers]', 'max(2,5) — the pre-1055 behaviour');
    assert.equal(result.data.resolvedFormula, '1d20 + 5[Modifiers]');
  } finally {
    stub.restore();
  }
});

test('engine rules: non-interactive playerPicks UNBOUNDED sums the best legal selection', async () => {
  const recipe = modifierRecipe(null, 'r-headless-open');
  const stub = stubInteractiveRollEnvironment();
  try {
    const craftingEngine = new CraftingEngine(null);
    const system = ruleSystem({ policy: 'playerPicks' });
    const result = await craftingEngine._runPassFailCheck(
      system,
      system.craftingCheck.simple,
      recipe,
      null,
      PICK_ACTOR,
      { interactive: false }
    );
    assert.equal(
      stub.rolled.at(-1),
      '1d20 + 7[Modifiers]',
      'picking everything is legal and optimal when nothing bounds the selection'
    );
    assert.equal(result.data.resolvedFormula, '1d20 + 7[Modifiers]');
  } finally {
    stub.restore();
  }
});

// The interactive multi-pick, through a REAL checkbox group. `RadioNodeList#value`
// inspects radio inputs only, so a `{ value }` stand-in could not express a two-box
// selection at all and would silently exercise the no-answer fallback instead.
test('engine rules: an interactive multi-pick selection SUMS what the player ticked', async () => {
  const system = ruleSystem({ policy: 'playerPicks', maxPicks: 2 });
  const recipe = modifierRecipe(null, 'r-multi');
  assertRolled(
    await rollThrough(system, recipe, {
      multiPick: { offered: ['med', 'herb'], checkedIds: ['med', 'herb'] },
    }),
    '1d20 + 7[Modifiers]',
    'both boxes ticked → Medicine 2 + Herbalism 5'
  );
  assertRolled(
    await rollThrough(system, recipe, {
      multiPick: { offered: ['med', 'herb'], checkedIds: ['med'] },
    }),
    '1d20 + 2[Modifiers]',
    'one box ticked → that modifier alone, not the pre-selected pair'
  );
  assertRolled(
    await rollThrough(system, recipe, {
      multiPick: { offered: ['med', 'herb'], checkedIds: [] },
    }),
    '1d20',
    'NO box ticked is an answer — it reduces to 0 rather than falling back to the default'
  );
});

test('engine rules: a single-pick radio answer still appends that one modifier', async () => {
  assertRolled(
    await rollThrough(
      ruleSystem({ policy: 'playerPicks', maxPicks: 1 }),
      modifierRecipe(null, 'r-single'),
      { pickedId: 'med' }
    ),
    '1d20 + 2[Modifiers]',
    'the PICKED Medicine (+2) substituted, not the pre-selected highest (+5)'
  );
});

test('engine rules: a one-modifier eligible set collapses a playerPicks system', async () => {
  // One eligible modifier is not a choice, so the two-option floor suppresses the
  // descriptor and the deterministic scalar rolls instead. The stub answers with an id
  // the (suppressed) descriptor would not offer, which production discards — so a
  // descriptor built here could not coincidentally match.
  assertRolled(
    await rollThrough(
      ruleSystem({ policy: 'playerPicks', defaultIds: ['herb'], maxPicks: 1 }),
      modifierRecipe(null, 'r-one'),
      { pickedId: 'med' }
    ),
    '1d20 + 5[Modifiers]',
    'a one-element eligible set rolls deterministically'
  );
  // Negative control for the line above: with TWO eligible the very same pick channel
  // IS live, so `(5)` above is the floor doing its job rather than a dead stub.
  assertRolled(
    await rollThrough(
      ruleSystem({ policy: 'playerPicks', maxPicks: 1 }),
      modifierRecipe(null, 'r-two'),
      { pickedId: 'med' }
    ),
    '1d20 + 2[Modifiers]',
    'two eligible modifiers still build a descriptor and honour the pick'
  );
});

test('engine rules: the listing DISPLAYS exactly what the engine rolls (parity)', async () => {
  // The fixture is chosen so the two context builders can DISAGREE: `byRecipe` with a
  // capped recipe pick reads the recipe set, the cap and the rule. Under `addAll` both
  // sides would read the system default set and the parity would hold vacuously.
  const system = ruleSystem({ policy: 'byRecipe', maxPicks: 1 });
  const recipe = modifierRecipe({ modifierIds: ['med', 'herb'] }, 'r-parity');
  const engineRoll = await rollThrough(system, recipe);
  assert.equal(
    engineRoll.rolled,
    '1d20 + 2[Modifiers]',
    'the engine honours the rule, the pick and the cap'
  );

  const stub = stubInteractiveRollEnvironment();
  try {
    const builder = new CraftingListingBuilder({
      // The production wiring from `main.js`, so the display path under test is the
      // real one rather than a stub that could never disagree.
      resolveCheckFormula: (formula, actor, craftingModifier) =>
        resolveCheckFormulaDisplay(formula, actor, craftingModifier),
    });
    const check = builder._buildCheck(system, 'simple', recipe, PICK_ACTOR);
    assert.equal(
      check.resolvedFormula,
      engineRoll.rolled,
      'the listed formula is the string the engine rolled, not a second reading of the context'
    );
  } finally {
    stub.restore();
  }
});
