/**
 * Every retained `CraftingSystemManager` crafting-check member must forward to
 * `src/systems/normalize/craftingCheck.js` (issue 1698): six have no call site left and stubbing
 * three to `return null` leaves every covering suite green, so this suite compares results.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

let mintedIds = 0;
globalThis.foundry = {
  utils: { randomID: () => `rid-${String(++mintedIds).padStart(4, '0')}` },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');
const normalize = await import('../../src/systems/normalize/craftingCheck.js');
const { craftingCheckScenarios, knownModifierBasis } = await import(
  '../helpers/craftingCheckNormalizeCorpus.js'
);

/** Both sides of every comparison mint from the same seed, so ids cannot diverge spuriously. */
function seeded(call) {
  mintedIds = 0;
  return call();
}

const scenario = (name) => craftingCheckScenarios().find((entry) => entry.name === name).check;

const modern = scenario('modernRelative');
const natStepping = scenario('natSteppingWithD20Group').routed;
const matrixTrigger = scenario('triggerMatrixOnEverySubCheck').simple.checkBreakage.triggers[0];

/** An argument the row's branch short-circuits past, so no value of it can change the result. */
const SHORT_CIRCUITED = Symbol('short-circuited');

/**
 * One row per retained member and branch: the arguments it is called with, and per argument an
 * alternative value that must change the result, without which the equality assertion could not
 * catch that argument being dropped, transposed or hard-coded.
 */
const DELEGATES = [
  {
    member: '_normalizeCraftingCheck',
    export: 'normalizeCraftingCheck',
    args: [modern, knownModifierBasis()],
    alternatives: [undefined, undefined],
  },
  {
    member: '_normalizeSalvageCraftingCheck',
    export: 'normalizeSalvageCraftingCheck',
    args: [modern, knownModifierBasis()],
    alternatives: [undefined, undefined],
  },
  {
    member: '_normalizeGatheringCraftingCheck',
    export: 'normalizeGatheringCraftingCheck',
    args: [modern, knownModifierBasis()],
    alternatives: [undefined, undefined],
  },
  {
    member: '_normalizeCheckModifierSelection',
    export: 'normalizeCheckModifierSelection',
    args: [modern, knownModifierBasis()],
    alternatives: [undefined, undefined],
  },
  {
    member: '_normalizeSimpleCraftingCheck',
    export: 'normalizeSimpleCraftingCheck',
    args: [modern.simple],
    alternatives: [undefined],
  },
  {
    member: '_normalizeProgressiveCraftingCheck',
    export: 'normalizeProgressiveCraftingCheck',
    args: [modern.progressive],
    alternatives: [undefined],
  },
  {
    member: '_normalizeRoutedCraftingCheck',
    export: 'normalizeRoutedCraftingCheck',
    args: [modern.routed],
    alternatives: [undefined],
  },
  {
    member: '_normalizeSimpleTier',
    export: 'normalizeSimpleTier',
    args: [modern.simple.tiers[0]],
    alternatives: [undefined],
  },
  {
    member: '_normalizeRoutedOutcome',
    branch: 'fixed',
    export: 'normalizeRoutedOutcome',
    args: [modern.routed.fixedOutcomes[0], 'fixed'],
    alternatives: [undefined, 'relative'],
  },
  {
    member: '_normalizeRoutedOutcome',
    branch: 'relative',
    export: 'normalizeRoutedOutcome',
    args: [modern.routed.relativeOutcomes[0], 'relative'],
    alternatives: [undefined, 'fixed'],
  },
  {
    member: '_normalizeUnifiedTriggers',
    export: 'normalizeUnifiedTriggers',
    args: [
      modern.simple.rollFormula,
      modern.simple.diceCrits,
      modern.simple.checkBreakage,
      { natStepping: true, type: 'relative' },
    ],
    alternatives: [undefined, undefined, undefined, undefined],
  },
  {
    member: '_normalizeUnifiedTrigger',
    export: 'normalizeUnifiedTrigger',
    args: [matrixTrigger],
    alternatives: [undefined],
  },
  {
    member: '_normalizeCheckBreakage',
    export: 'normalizeCheckBreakage',
    args: [modern.simple.checkBreakage],
    alternatives: [undefined],
  },
  {
    member: '_normalizeTierStep',
    export: 'normalizeTierStep',
    args: [matrixTrigger.tierStep],
    alternatives: [undefined],
  },
  {
    member: '_convertDiceCritsToTriggers',
    export: 'convertDiceCritsToTriggers',
    args: [modern.simple.diceCrits, modern.simple.rollFormula],
    alternatives: [undefined, undefined],
  },
  {
    member: '_convertNatSteppingToTriggers',
    branch: 'relative',
    export: 'convertNatSteppingToTriggers',
    args: [natStepping.natStepping, natStepping.rollFormula, natStepping.type],
    alternatives: [undefined, undefined, 'fixed'],
  },
  {
    member: '_convertNatSteppingToTriggers',
    branch: 'fixed',
    export: 'convertNatSteppingToTriggers',
    args: [true, '2d6 + 1d20', 'fixed'],
    alternatives: [SHORT_CIRCUITED, SHORT_CIRCUITED, 'relative'],
    emptyByContract: true,
  },
];

/** The members deleted outright, because nothing outside the moved cluster ever named them. */
const DELETED = Object.freeze(['_canonicalDie', '_clampCritRaw', '_normalizeCheckBreakageCondition']);

const manager = new CraftingSystemManager({ getRecipes: () => [] });

const title = (row) => (row.branch ? `${row.member} (${row.branch})` : row.member);

test('the module exports exactly the fifteen functions the delegates forward to', () => {
  assert.deepStrictEqual(
    Object.keys(normalize).toSorted(),
    [...new Set(DELEGATES.map((row) => row.export))].toSorted(),
    'an export appeared or vanished; the three helpers with no caller stay module-private'
  );
});

for (const row of DELEGATES) {
  test(`${title(row)} forwards its full argument list to ${row.export}`, () => {
    const expected = seeded(() => normalize[row.export](...row.args));
    assert.deepStrictEqual(
      seeded(() => manager[row.member](...row.args)),
      expected,
      `${row.member} no longer returns what ${row.export} returns for the same arguments`
    );
    if (!row.emptyByContract) {
      // Non-vacuity: a delegate stubbed to `return null` or `return {}` must not read green.
      const size = Array.isArray(expected) ? expected.length : Object.keys(expected ?? {}).length;
      assert.ok(
        size > 0,
        `${row.export} returned nothing for this input, so the comparison is vacuous`
      );
    }
  });

  for (const [index, alternative] of row.alternatives.entries()) {
    if (alternative === SHORT_CIRCUITED) continue;
    test(`${title(row)}'s argument ${index} materially changes ${row.export}`, () => {
      const perturbed = row.args.map((value, at) => (at === index ? alternative : value));
      assert.notDeepStrictEqual(
        seeded(() => normalize[row.export](...perturbed)),
        seeded(() => normalize[row.export](...row.args)),
        `argument ${index} does not change the result, so the forwarding comparison above could not catch it being dropped, transposed or hard-coded`
      );
    });
  }
}

for (const member of DELETED) {
  test(`${member} is gone from the manager`, () => {
    assert.strictEqual(
      manager[member],
      undefined,
      `${member} has no caller and no spec, DOMAIN.md or src/ cite; it must not survive as a delegate`
    );
  });
}

test('convertDiceCritsToTriggers drops a crit keyed to a die the formula only modifies', () => {
  assert.deepStrictEqual(
    normalize.convertDiceCritsToTriggers(
      [{ id: 'crit-pool', die: '3d6', raw: 12, success: true }],
      '1d20 + 3d6kh2'
    ),
    [],
    'a `3d6` crit must not survive against a formula whose only 3d6 is the modified pool 3d6kh2'
  );
});

test('convertDiceCritsToTriggers targets the first matching group of a duplicate-die formula', () => {
  const [trigger] = normalize.convertDiceCritsToTriggers(
    [{ id: 'crit-first', die: '2d6', raw: 7 }],
    '1d20 + 2d6 + 2d6'
  );
  assert.deepStrictEqual(
    trigger?.condition,
    { type: 'diceGroup', groupId: 1, aggregate: 'total', operator: '==', value: 7 },
    'the trigger must target the first 2d6 term, group 1, not the last at group 2'
  );
});
