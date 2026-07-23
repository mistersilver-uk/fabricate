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
