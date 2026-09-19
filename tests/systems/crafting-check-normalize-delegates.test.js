/**
 * Every retained `CraftingSystemManager` crafting-check member must FORWARD to
 * `src/systems/normalize/craftingCheck.js`, not merely exist (issue 1698). Six of the fifteen have
 * no call site left in the repository, and stubbing three of them to `return null` leaves every
 * covering suite green, so existence proves nothing and this suite compares results instead.
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

/**
 * One row per retained member: the arguments it is called with, and per argument an ALTERNATIVE
 * value that must change the result. The alternative is what makes the equality assertion able to
 * catch a dropped, transposed or hard-coded argument — an argument the input does not make
 * material would let all three through.
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
    export: 'convertNatSteppingToTriggers',
    args: [natStepping.natStepping, natStepping.rollFormula, natStepping.type],
    alternatives: [undefined, undefined, 'fixed'],
  },
];

/** The members deleted outright, because nothing outside the moved cluster ever named them. */
const DELETED = Object.freeze(['_canonicalDie', '_clampCritRaw', '_normalizeCheckBreakageCondition']);

const manager = new CraftingSystemManager({ getRecipes: () => [] });

test('the module exports exactly the fifteen functions the delegates forward to', () => {
  assert.deepStrictEqual(
    Object.keys(normalize).toSorted(),
    DELEGATES.map((row) => row.export).toSorted(),
    'an export appeared or vanished; the three helpers with no caller stay module-private'
  );
});

for (const row of DELEGATES) {
  test(`${row.member} forwards its full argument list to ${row.export}`, () => {
    const expected = seeded(() => normalize[row.export](...row.args));
    assert.deepStrictEqual(
      seeded(() => manager[row.member](...row.args)),
      expected,
      `${row.member} no longer returns what ${row.export} returns for the same arguments`
    );
    // Non-vacuity: a delegate stubbed to `return null` or `return {}` must not read green.
    const size = Array.isArray(expected) ? expected.length : Object.keys(expected ?? {}).length;
    assert.ok(size > 0, `${row.export} returned nothing for this input, so the comparison is vacuous`);
  });

  for (const [index, alternative] of row.alternatives.entries()) {
    test(`${row.member}'s argument ${index} materially changes ${row.export}`, () => {
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
