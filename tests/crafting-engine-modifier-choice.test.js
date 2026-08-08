// Engine gating for the interactive `playerPicks` modifier-choice descriptor (#855).
// The resolver (builds the descriptor) and the roll prompt (consumes it) are unit
// tested elsewhere; this pins the ENGINE glue that decides WHEN to build one, so a
// regression that widened the guard (e.g. to include `highest`, or dropped the
// `@craftingmod`-token gate) would fail here rather than ship green.
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
    assert.equal(build('1d20 + @craftingmod', context(), false), null);
  });
});

test('engine gating: an interactive non-playerPicks policy threads no modifierChoice', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    // `byRecipe` is kept in this list deliberately after issue 1055 retired it: a
    // persisted world can still carry it, `LEGACY_POLICY_ALIASES` translates it to
    // `addAll`, and the point of the case is that neither the retired token nor its
    // translation is interactive.
    for (const systemPolicy of ['addAll', 'highest', 'byRecipe']) {
      assert.equal(
        build('1d20 + @craftingmod', context({ systemPolicy }), true),
        null,
        systemPolicy
      );
    }
  });
});

test('engine gating: interactive playerPicks with a @craftingmod formula builds the descriptor', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    const choice = build('1d20 + @craftingmod', context(), true);
    assert.ok(choice, 'a descriptor is built');
    assert.equal(choice.defaultSelectedId, 'herb', 'default-selects the highest (herb +5)');
    assert.deepEqual(
      choice.modifiers.map((modifier) => modifier.id),
      ['med', 'herb']
    );
  });
});

test('engine gating: a formula without @craftingmod threads no modifierChoice (issue F3)', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    assert.equal(build('1d20 + @abilities.int.mod', context(), true), null);
  });
});

test('engine gating: an empty eligible set threads no modifierChoice', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    assert.equal(build('1d20 + @craftingmod', context({ defaultModifierIds: [] }), true), null);
  });
});

test('engine gating: fewer than two eligible modifiers threads no modifierChoice', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    // One eligible modifier is not a choice: the radio could not be changed, and
    // `highest` over a single value substitutes that very modifier anyway.
    assert.equal(
      build('1d20 + @craftingmod', context({ defaultModifierIds: ['med'] }), true),
      null
    );
    assert.ok(
      build('1d20 + @craftingmod', context({ defaultModifierIds: ['med', 'herb'] }), true),
      'two eligible modifiers still build a descriptor'
    );
  });
});

test('engine gating: the effective policy resolves recipe override precedence', () => {
  withRoll({ med: 2, herb: 5 }, () => {
    // System addAll, recipe overrides to playerPicks → build. (Retargeted for issue
    // 1055: the system value here was `byRecipe`, which the authoring surface can no
    // longer produce; a persisted one is covered by the case above.)
    assert.ok(
      build(
        '1d20 + @craftingmod',
        context({ systemPolicy: 'addAll', recipeModifier: { policy: 'playerPicks' } }),
        true
      ),
      'an addAll→playerPicks recipe override builds a descriptor'
    );
    // …and the SAME override is withheld where the system does not delegate the rule
    // axis. This is the descriptor-level observable of the authority guard; the rolled
    // string is asserted through a real runner further down.
    for (const recipeModifierAuthority of ['none', 'setOnly']) {
      assert.equal(
        build(
          '1d20 + @craftingmod',
          context({
            systemPolicy: 'addAll',
            recipeModifier: { policy: 'playerPicks' },
            recipeModifierAuthority,
          }),
          true
        ),
        null,
        `at ${recipeModifierAuthority} the recipe cannot opt into an interactive roll`
      );
    }
    // System playerPicks, recipe overrides to highest → no choice (deterministic).
    assert.equal(
      build(
        '1d20 + @craftingmod',
        context({ systemPolicy: 'playerPicks', recipeModifier: { policy: 'highest' } }),
        true
      ),
      null,
      'a playerPicks→highest recipe override is deterministic (no descriptor)'
    );
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
// value the deterministic fallback would substitute — hence `(2)` vs `(5)` discriminates.
const PICK_ACTOR = { getRollData: () => ({ med: 2, herb: 5 }) };
const PICK_FORMULA = '1d20 + @craftingmod';
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
        '1d20 + (2)',
        'the runner threaded the descriptor: the PICKED Medicine (+2) substituted, not the pre-selected highest (+5)'
      );
      assert.equal(
        result.data.resolvedFormula,
        '1d20 + (2)',
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

// ── authority: WHICH recipe overrides the engine actually honours (issue 1055) ─
//
// Every case here asserts the ROLLED FORMULA STRING produced by a real check runner.
// That is deliberate and it is the only observable that can fail for the right reason:
// a resolver-level assertion cannot see a runner that never threads the context, and a
// descriptor-level assertion cannot see the arithmetic that reaches Foundry's `Roll`.
// The fixture is two eligible modifiers with DIFFERENT values — Medicine 2, Herbalism 5
// — so `addAll` (7), `highest` (5), an authored empty set (0) and a player's pick (2)
// are four distinct strings and no two of them can coincide.
//
// `resolvedFormula` is asserted equal to the rolled string in every case, which is
// acceptance criterion 9 (evaluated formula == displayed formula) at each level.

const AUTHORITY_SLOT = { simple: { rollFormula: PICK_FORMULA, dc: 10, thresholdMode: 'meet' } };

/**
 * A crafting system with the two-modifier catalogue, a combination rule, a default
 * eligible set and — only when one is given — an authority level. ABSENT is a real
 * state, so the key is attached rather than defaulted.
 */
function authoritySystem({ policy, defaultIds = ['med', 'herb'], authority } = {}) {
  const craftingCheck = {
    checkModifiers: PICK_CATALOGUE,
    defaultModifierPolicy: policy,
    defaultModifierIds: defaultIds,
    ...AUTHORITY_SLOT,
  };
  if (authority !== undefined) craftingCheck.recipeModifierAuthority = authority;
  return { resolutionMode: 'simple', craftingCheck };
}

/** A REAL recipe, so `Recipe._normalizeCraftingModifier` is on the path. */
function modifierRecipe(craftingModifier, id = 'r-mod') {
  return new Recipe({ id, name: 'Healing Salve', craftingSystemId: 'sys-1', craftingModifier });
}

/** Roll one interactive pass/fail check and report what actually reached `Roll`. */
async function rollThrough(system, recipe, { pickedId = null } = {}) {
  const stub = stubInteractiveRollEnvironment({ pickedId });
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

test('engine authority: a recipe RULE override is unhonoured at none and setOnly', async () => {
  // No set override at all, so the SET axis cannot confound the reading: every level
  // resolves the same eligible {med 2, herb 5}, and only the rule differs.
  const recipe = modifierRecipe({ policy: 'addAll' }, 'r-rule');
  for (const authority of ['none', 'setOnly']) {
    assertRolled(
      await rollThrough(authoritySystem({ policy: 'highest', authority }), recipe),
      '1d20 + (5)',
      `at ${authority} the system's highest rule stands and the stored addAll is ignored`
    );
  }
  for (const authority of ['setAndRule', undefined]) {
    assertRolled(
      await rollThrough(authoritySystem({ policy: 'highest', authority }), recipe),
      '1d20 + (7)',
      `at ${String(authority)} the recipe's addAll wins and both modifiers sum`
    );
  }
});

test('engine authority: a recipe SET override is unhonoured at none', async () => {
  const recipe = modifierRecipe({ modifierIds: ['med'] }, 'r-set');
  assertRolled(
    await rollThrough(authoritySystem({ policy: 'addAll', authority: 'none' }), recipe),
    '1d20 + (7)',
    'at none the SYSTEM default set is summed and the stored subset is ignored'
  );
  for (const authority of ['setOnly', 'setAndRule', undefined]) {
    assertRolled(
      await rollThrough(authoritySystem({ policy: 'addAll', authority }), recipe),
      '1d20 + (2)',
      `at ${String(authority)} the recipe's {med} subset is the eligible set`
    );
  }
});

test('engine authority: an AUTHORED EMPTY set resolves @craftingmod to 0', async () => {
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
    await rollThrough(authoritySystem({ policy: 'addAll', authority: 'setOnly' }), recipe),
    '1d20 + (0)',
    'no modifier is eligible, so the placeholder reduces to 0 — not to the system default'
  );
  assertRolled(
    await rollThrough(authoritySystem({ policy: 'addAll', authority: 'none' }), recipe),
    '1d20 + (7)',
    'and it is suppressed like any other set override where the system withholds the axis'
  );
});

test('engine authority: a recipe persisted with byRecipe keeps summing its own set', async () => {
  // The recipe-level mapping and `LEGACY_POLICY_ALIASES` are a deliberate PAIR: the
  // model pre-translates for anything built through it, and the alias re-translates
  // whatever never reached the model. Reverting EITHER alone still yields (7); only
  // reverting both drops the rule and falls back to the system's `highest` → (5).
  const recipe = modifierRecipe({ policy: 'byRecipe', modifierIds: ['med', 'herb'] }, 'r-legacy');
  assertRolled(
    await rollThrough(
      authoritySystem({ policy: 'highest', authority: 'setAndRule' }),
      recipe
    ),
    '1d20 + (7)',
    'the retired rule reduces to what it always did — sum the recipe’s own set'
  );
});

test('engine authority: a legacy byRecipe in a HAND-BUILT context is translated too', async () => {
  // A bare literal, so `Recipe._normalizeCraftingModifier` never runs — the shape an
  // imported payload, an un-migrated world or an internally constructed bag arrives in.
  // This is the case `LEGACY_POLICY_ALIASES` alone is answerable for.
  const literalRecipe = {
    name: 'Healing Salve',
    craftingSystemId: 'sys-1',
    craftingModifier: { policy: 'byRecipe', modifierIds: ['med', 'herb'] },
  };
  assertRolled(
    await rollThrough(
      authoritySystem({ policy: 'highest', authority: 'setAndRule' }),
      literalRecipe
    ),
    '1d20 + (7)',
    'the alias re-translates a byRecipe that never passed through the model'
  );
});

test('engine authority: playerPicks is offered at setAndRule and withheld below it', async () => {
  const recipe = modifierRecipe({ policy: 'playerPicks' }, 'r-picks');
  assertRolled(
    await rollThrough(authoritySystem({ policy: 'highest', authority: 'setAndRule' }), recipe, {
      pickedId: 'med',
    }),
    '1d20 + (2)',
    'the descriptor was built and the PICKED Medicine (+2) substituted, not the max (+5)'
  );
  for (const authority of ['none', 'setOnly']) {
    assertRolled(
      await rollThrough(authoritySystem({ policy: 'highest', authority }), recipe, {
        pickedId: 'med',
      }),
      '1d20 + (5)',
      `at ${authority} no descriptor is built, so the system's deterministic highest rolls`
    );
  }
});

test('engine authority: setOnly narrowing to ONE modifier collapses a playerPicks system', async () => {
  // One eligible modifier is not a choice, so the two-option floor suppresses the
  // descriptor and the deterministic `playerPicks == highest` scalar rolls instead.
  // The stub answers with an id the (suppressed) descriptor would not offer, which
  // production reduces to 0 — so a descriptor built here could not coincidentally match.
  const system = authoritySystem({ policy: 'playerPicks', authority: 'setOnly' });
  assertRolled(
    await rollThrough(system, modifierRecipe({ modifierIds: ['herb'] }, 'r-one'), {
      pickedId: 'med',
    }),
    '1d20 + (5)',
    'a one-element subset rolls deterministically'
  );
  // Negative control for the line above: with TWO eligible the very same pick channel
  // IS live, so `(5)` above is the floor doing its job rather than a dead stub.
  assertRolled(
    await rollThrough(system, modifierRecipe({ modifierIds: ['med', 'herb'] }, 'r-two'), {
      pickedId: 'med',
    }),
    '1d20 + (2)',
    'two eligible modifiers still build a descriptor and honour the pick'
  );
});

test('engine authority: the listing DISPLAYS exactly what the engine rolls (parity)', async () => {
  // The fixture is chosen so the two context builders can DISAGREE: authority `none`
  // with a stored rule override that changes the number. At `setAndRule` both sides
  // would read `addAll` and the parity would hold vacuously.
  const system = authoritySystem({ policy: 'highest', authority: 'none' });
  const recipe = modifierRecipe({ policy: 'addAll' }, 'r-parity');
  const engine = await rollThrough(system, recipe);
  assert.equal(engine.rolled, '1d20 + (5)', 'the engine honours the system rule');

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
      engine.rolled,
      'the listed formula is the string the engine rolled, not a second reading of the context'
    );
  } finally {
    stub.restore();
  }
});
