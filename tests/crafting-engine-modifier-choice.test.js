// Engine gating for the interactive `playerPicks` modifier-choice descriptor (#855).
// The resolver (builds the descriptor) and the roll prompt (consumes it) are unit
// tested elsewhere; this pins the ENGINE glue that decides WHEN to build one, so a
// regression that widened the guard (e.g. to include `highest`, or dropped the
// `@craftingmod`-token gate) would fail here rather than ship green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';

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
    // System byRecipe, recipe overrides to playerPicks → build.
    assert.ok(
      build(
        '1d20 + @craftingmod',
        context({ systemPolicy: 'byRecipe', recipeModifier: { policy: 'playerPicks' } }),
        true
      ),
      'a byRecipe→playerPicks recipe override builds a descriptor'
    );
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

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

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

/**
 * Install the interactive roll environment: a `Roll` recording every rolled formula and
 * a `DialogV2.wait` that either answers with `pickedId` or dismisses (resolving `null`,
 * the real `rejectClose: false` shape). Returns `{ rolled, restore }`.
 */
function stubInteractiveRollEnvironment({ pickedId = null, dismiss = false } = {}) {
  const rolled = [];
  const previousRoll = globalThis.Roll;
  const previousFoundry = globalThis.foundry;
  class RollStub {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      rolled.push(this.formula);
      return { total: 12, dice: [] };
    }
  }
  RollStub.replaceFormulaData = (expression, data = {}) =>
    String(expression).replaceAll(/@([\w.]+)/g, (_match, path) => {
      const value = path
        .split('.')
        .reduce((node, key) => (node == null ? undefined : node[key]), data);
      return value === undefined || value === null ? `@${path}` : String(value);
    });
  RollStub.validate = () => true;
  globalThis.Roll = RollStub;
  globalThis.foundry = {
    utils: { getProperty },
    applications: {
      api: {
        DialogV2: {
          wait: async (config) => {
            if (dismiss) return null;
            const button = {
              form: {
                elements: {
                  situationalBonus: { value: '' },
                  rollMode: { value: 'publicroll' },
                  craftingModifier: { value: pickedId },
                },
              },
            };
            const chosen = config.buttons.find((entry) => entry.default) || config.buttons[0];
            return chosen.callback({}, button);
          },
        },
      },
    },
  };
  return {
    rolled,
    restore() {
      globalThis.Roll = previousRoll;
      if (previousFoundry === undefined) delete globalThis.foundry;
      else globalThis.foundry = previousFoundry;
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
