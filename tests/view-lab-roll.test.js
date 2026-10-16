/** The View Lab's `Roll` class (issue 859). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getCaseById } from '../scripts/lib/viewLabCases.js';
import { resolveModifierLibrary } from '../src/systems/characterLibraries.js';
import {
  buildCheckModifierChoice,
  buildCheckModifierContext,
  resolveActiveCraftingCheckFormula,
  resolveModifierPolicy,
} from '../src/systems/checkModifierResolver.js';
import {
  rolledDiceGroups,
  evaluateCheckRoll,
  evaluatePreparedRunCheck,
  postCheckRollHandoff,
} from '../src/systems/checkRoll.js';
import { evaluateCountCheckRoll } from '../src/systems/countCheckRoll.js';
import { findCountRoll, registerCountRoll } from '../src/systems/countRoll.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import { resolveSalvageCheck } from '../src/systems/salvageCheckUsability.js';
import { rollPromptTarget } from '../src/ui/svelte/apps/crafting/rollPromptTarget.js';
import { hasPlainD20 } from '../src/utils/craftingCheckExpression.js';

import { installCountDice } from './helpers/countEngineDice.js';
import { stubInteractiveRollEnvironment, stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { installFoundryPropertyUtils } from './helpers/storedResourceActor.js';
import { ADDITIONAL_DICE_PROMPT_STATES } from './view-lab/additionalDiceFixtures.js';
import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import { installLabRandom } from './view-lab/foundry/labRandom.js';
import { createLabRoll } from './view-lab/foundry/labRoll.js';
import { seedRollPromptFixture } from './view-lab/rollPromptFixtures.js';
import { buildLabActors } from './view-lab/world/labActors.js';
import { buildLabContent } from './view-lab/world/labContent.js';
import { registerLabMacros } from './view-lab/world/labMacros.js';

test('roll-prompt View Lab variants project valid checks and long world modifier labels', async () => {
  const content = buildLabContent();
  const systems = new Map(content.systems.map((system) => [system.id, {
    ...system,
    modifiers: system.modifiers ?? system.craftingCheck?.checkModifiers ?? [],
  }]));
  const manager = {
    getSystem: (id) => systems.get(id),
    updateSystem: async (id, updates) => systems.set(id, { ...systems.get(id), ...updates }),
  };
  const store = {
    entries: [],
    isSeeded: () => true,
    listModifiers() { return this.entries; },
    async saveModifiers(entries) { this.entries = entries; },
  };
  const recipes = new Map(content.recipes.map((recipe) => [recipe.id, recipe]));
  const recipeManager = {
    getRecipe: (id) => recipes.get(id),
    updateRecipe: async (id, updates) => recipes.set(id, { ...recipes.get(id), ...updates }),
  };
  const world = {
    actorList: buildLabActors(content),
    fabricate: { craftingSystemManager: manager, characterLibrariesStore: store, recipeManager },
  };
  await seedRollPromptFixture(world, 'basic');
  assert.equal(resolveActiveCraftingCheckFormula(manager.getSystem('lab-smithing')).rollFormula, '2d6 + @abilities.int.mod');
  await seedRollPromptFixture(world, 'advantage');
  assert.equal(resolveActiveCraftingCheckFormula(manager.getSystem('lab-smithing')).rollFormula, '1d20 + @abilities.int.mod');
  await seedRollPromptFixture(world, 'pick-one');
  assert.equal(manager.getSystem('lab-herbalism').craftingCheck.maxModifierPicks, 1);
  await underPromptView(world);
  await countPromptView(world);
  await additionalDicePromptView(world);
  await seedRollPromptFixture(world, 'overflow');
  const herbalism = manager.getSystem('lab-herbalism');
  assert.equal(herbalism.craftingCheck.maxModifierPicks, 2);
  assert.ok(resolveModifierLibrary(herbalism, store).some((entry) => entry.id === 'hb-mod-luck' && entry.label.length > 40));
});

/**
 * The `under` state is frame 29: the real engine prompt names Sera Vane's target after the
 * applied modifier, and explains it from the Smithing level and the Hard Work tier.
 */
async function underPromptView(world) {
  const manager = world.fabricate.craftingSystemManager;
  await seedRollPromptFixture(world, 'under');
  const system = manager.getSystem('lab-smithing');
  const store = world.fabricate.characterLibrariesStore;
  assert.equal(system.craftingCheck.defaultModifierPolicy, 'addAll');
  assert.deepEqual(system.craftingCheck.defaultModifierIds, ['lab-mod-steady-hands']);
  const steady = resolveModifierLibrary(system, store).find((entry) => entry.id === 'lab-mod-steady-hands');
  assert.deepEqual([steady?.label, steady?.expression], ['Steady hands', '1'], "frame 29's applied modifier");
  const recipe = world.fabricate.recipeManager.getRecipe('sm-r-horseshoe');
  const crafter = world.actorList.find((actor) => actor.id === 'lab-actor-brenna');
  assert.deepEqual([crafter.name, recipe.name], ['Sera Vane', 'Hard Work'], "frame 29's subtitle");
  const stub = stubInteractiveRollEnvironment();
  const previousGame = globalThis.game;
  globalThis.game = { fabricate: { getCharacterLibrariesStore: () => store } };
  try {
    const engine = new CraftingEngine(null);
    await engine._runPassFailCheck(system, system.craftingCheck.simple, recipe, null, crafter, {
      interactive: true,
    });
    const view = stub.surface.view;
    assert.deepEqual([view.formula, view.direction, view.dc, view.subtitle], ['1d20', 'under', 10, 'Sera Vane · Hard Work']);
    assert.deepEqual(rollPromptTarget(view, []), {
      chipText: 'Target 11 · stay at or under',
      source: 'Sera Vane @skills.smith.level 12 · Hard Work −2 · modifiers +1',
    });
    engine._resolveSimpleCheckDc = async () => 14;
    await engine._runPassFailCheck(system, system.craftingCheck.simple, recipe, null, crafter, {
      interactive: true,
    });
    assert.deepEqual(rollPromptTarget(stub.surface.view, []), {
      chipText: 'Target 15 · stay at or under', source: 'Base 14 · modifiers +1',
    }, 'a DC macro that moved the target leaves no character value to explain it');
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
    stub.restore();
  }
}

/** The `count` and `count-threshold` states: the horseshoe's real engine prompt, frames 35 and 30. */
async function countPromptView(world) {
  const manager = world.fabricate.craftingSystemManager;
  const frames = {
    count: ['5d10 · each ≥ 8', 'Success on ≥ 8 · explodes on 10 · 1 cancels a success', 'Each adds dice.', 'Fine Craft'],
    'count-threshold': [
      '2d20 · each ≤ 13', 'Success on ≤ 13 (character value 13)', 'Each moves the threshold.', 'Complex Work',
    ],
  };
  for (const [state, [formula, rules, eachAdds, recipeName]] of Object.entries(frames)) {
    await seedRollPromptFixture(world, state);
    const recipe = world.fabricate.recipeManager.getRecipe('sm-r-horseshoe');
    const crafter = world.actorList.find((actor) => actor.id === 'lab-actor-brenna');
    assert.deepEqual([crafter.name, recipe.name], ['Sera Vane', recipeName], `${state}: the frame's subtitle`);
    const system = manager.getSystem('lab-smithing');
    assert.deepEqual(system.craftingCheck.defaultModifierIds, ['lab-mod-steady-hands'], 'the frames\' one modifier');
    const dice = installCountDice();
    const surface = stubPromptSurface(() => null);
    try {
      await new CraftingEngine(null)._runPassFailCheck(
        system, system.craftingCheck.simple, recipe, null,
        crafter,
        { interactive: true }
      );
      const { view } = surface;
      assert.equal(view.subtitle, `Sera Vane · ${recipeName}`);
      assert.equal(view.formula, formula, `${state}: the pool line, not the retained formula`);
      assert.equal(view.labels.formulaNote, rules);
      assert.equal(view.neededText, '2 successes needed');
      assert.equal(view.labels.eachAdds, eachAdds);
      // The count rule offers by default (issue 2007).
      assert.deepEqual([view.dc, view.allowAdvantage], [null, true]);
      assert.deepEqual(dice.constructed, [], 'a dismissed prompt rolls nothing');
    } finally {
      surface.restore();
      dice.restore();
    }
  }
}

/**
 * Each issue 2008 prompt state's offer, as the real engine reads it from the lab Actor: the most
 * Sera Vane may buy, why nothing can be bought, and what the prompt may judge (`reach`).
 */
const ADDITIONAL_DICE_OFFERS = {
  'count-additional': { limit: 1, unavailable: null, needed: 2 },
  'count-additional-floor': { limit: 2, unavailable: null, needed: 3 },
  'count-additional-insufficient': { limit: 0, unavailable: null, needed: 3 },
  'count-additional-disadvantage-only': { limit: 0, unavailable: null, needed: 2 },
  'count-additional-impossible': { limit: 1, unavailable: null, needed: 5 },
  'count-additional-rescued': { limit: 1, unavailable: null, needed: 5, rescued: true },
  'count-additional-explode': {
    limit: 1,
    unavailable: null,
    needed: 5,
    perDieMost: null,
    explode: 'recursive',
  },
  'count-additional-zero-pool': { limit: 0, unavailable: null, needed: 2 },
  'count-additional-single-roll': { limit: 1, unavailable: null, needed: 4 },
  'count-additional-unaffordable': { limit: 0, unavailable: null, needed: 1 },
  'count-additional-unlabelled': { limit: 1, unavailable: null, needed: 2, label: '' },
  'count-additional-unreadable': { limit: 0, unavailable: 'resourceUnreadable', needed: 1 },
  'count-additional-overridden': { limit: 0, unavailable: 'resourceOverridden', needed: 1 },
  'count-additional-not-writable': { limit: 0, unavailable: 'resourceNotWritable', needed: 1 },
  'count-additional-macro-failed': { limit: 0, unavailable: 'resourceMacroFailed', needed: 1 },
  'count-result-bought': { limit: 1, unavailable: null, needed: 3 },
  'count-result-bought-miss': { limit: 1, unavailable: null, needed: 2 },
};

/** Drive one additional-dice state's horseshoe craft to its prompt, which is dismissed. */
async function offerFor(world, state) {
  await seedRollPromptFixture(world, state);
  const system = world.fabricate.craftingSystemManager.getSystem('lab-smithing');
  const recipe = world.fabricate.recipeManager.getRecipe('sm-r-horseshoe');
  const crafter = world.actorList.find((actor) => actor.id === 'lab-actor-brenna');
  const before = structuredClone(crafter.system.resources ?? {});
  const surface = stubPromptSurface(() => null);
  const dice = installCountDice();
  try {
    await new CraftingEngine(null)._runPassFailCheck(
      system, system.craftingCheck.simple, recipe, null, crafter, { interactive: true }
    );
    assert.deepEqual(dice.constructed, [], `${state}: a dismissed prompt rolls nothing`);
    assert.deepEqual(crafter.system.resources ?? {}, before, `${state}: and spends nothing`);
    return surface.view.additionalDiceOffer;
  } finally {
    dice.restore();
    surface.restore();
  }
}

/** Issue 2008: every new `rollPromptState` through the real engine, as the lab renders it. */
async function additionalDicePromptView(world) {
  assert.deepEqual(
    new Set(Object.keys(ADDITIONAL_DICE_OFFERS)),
    new Set(Object.keys(ADDITIONAL_DICE_PROMPT_STATES)),
    'every prompt state is asserted here'
  );
  const documents = new Map();
  registerLabMacros(documents);
  const previous = { game: globalThis.game, fromUuid: globalThis.fromUuid };
  const store = world.fabricate.characterLibrariesStore;
  Object.assign(globalThis, {
    game: { fabricate: { getCharacterLibrariesStore: () => store } },
    fromUuid: async (uuid) => documents.get(uuid) ?? null,
  });
  const restoreFoundry = installFoundryPropertyUtils();
  const crafter = world.actorList.find((actor) => actor.id === 'lab-actor-brenna');
  const permission = crafter.canUserModify;
  const manager = world.fabricate.craftingSystemManager;
  const smithing = manager.getSystem('lab-smithing');
  try {
    for (const [state, expected] of Object.entries(ADDITIONAL_DICE_OFFERS)) {
      // Each lab frame boots its own world, so no state inherits another's check or stamp.
      await manager.updateSystem(smithing.id, smithing);
      crafter.overrides = {};
      crafter.canUserModify = permission;
      const offer = await offerFor(world, state);
      const { limit, unavailable, needed, label = 'Momentum', ...reach } = expected;
      assert.deepEqual(
        [offer?.limit, offer?.unavailable, offer?.resourceLabel],
        [limit, unavailable, label],
        `${state}: the offer's limit, reason and Resource name`
      );
      assert.deepEqual(
        offer.reach,
        { needed, perDieMost: 1, explode: 'off', rescued: false, ...reach },
        `${state}: what the prompt may judge`
      );
    }
  } finally {
    restoreFoundry();
    Object.assign(globalThis, previous);
    if (previous.game === undefined) delete globalThis.game;
  }
}

/** The two statics the shim hands through, reproduced verbatim from `installFoundryShim.js`. */
const STATICS = {
  replaceFormulaData(formula, data = {}, { missing = 'NaN' } = {}) {
    return String(formula).replaceAll(/@([\w.]+)/g, (_match, path) => {
      const value = String(path)
        .split('.')
        .reduce((current, part) => (current == null ? undefined : current[part]), data);
      return value === undefined || value === null ? missing : String(value);
    });
  },
  validate(formula) {
    return !/NaN|@/.test(String(formula));
  },
};

/**
 * Build a `Roll` over a freshly seeded stream, so every test starts at draw 0.
 *
 * @param {number} [seed] The seed; defaults to the lab's own.
 * @returns {Function} A `Roll` class.
 */
function makeRoll(seed = LIVE_SEED) {
  const random = installLabRandom({ seed });
  // `installLabRandom` swaps the realm's `Math.random`/`Date.now`; restore immediately. Only the
  // generator function itself is wanted here, and leaking the swap would poison sibling tests.
  random.restore();
  return createLabRoll({
    random: random.random,
    replaceFormulaData: STATICS.replaceFormulaData,
    validate: STATICS.validate,
  });
}

/**
 * The seed the lab actually renders with, read out of `labWorld.js`'s own default rather than
 * copied. A copy is what let the reviewer change `labWorld.js`'s seed with this whole file green.
 */
const LIVE_SEED = (() => {
  const source = readFileSync(new URL('./view-lab/world/labWorld.js', import.meta.url), 'utf8');
  const match = /seed\s*=\s*([\d_]+)/.exec(source);
  assert.ok(match, 'labWorld.js no longer declares a default seed');
  return Number(match[1].replaceAll('_', ''));
})();

test('the seeded smithing check clears its own threshold', () => {
  // The COMPOSED invariant, not three copied literals.
  const content = buildLabContent();
  const actors = buildLabActors(content);
  const smithing = content.systems.find((system) => system.id === 'lab-smithing');
  assert.ok(smithing, 'the smithing fixture system exists');
  const { rollFormula, thresholds } = smithing.craftingCheck.simple;
  const brenna = actors.find((actor) => actor.id === 'lab-actor-brenna');
  assert.ok(brenna, 'Brenna exists');

  const Roll = makeRoll();
  const roll = new Roll(rollFormula, brenna.getRollData());
  return roll.evaluate().then((evaluated) => {
    assert.ok(
      evaluated.total >= thresholds.success,
      `the seeded smithing craft must clear its threshold, or the two craft frames stop showing a ` +
        `successful craft: rolled ${evaluated.total} of ${rollFormula} against ${thresholds.success}`
    );
  });
});

test('the bulk roll prompt frame is what its own subjects authored', () => {
  // COMPOSED, and about a frame that exists: `player-inventory-bulk-roll-prompt` publishes the ONE
  // dialog a whole batch answers, and two of its visible properties are decided entirely by fixture
  // data rather than by anything the panel does.
  const viewCase = getCaseById('player-inventory-bulk-roll-prompt');
  assert.ok(viewCase, 'the bulk roll-prompt case is still in the registry');

  const keys = (viewCase.steps ?? [])
    .map((step) => /data-inventory-card="([^"]+)"/.exec(step?.selector ?? '')?.[1])
    .filter(Boolean);
  assert.equal(keys.length, 2, `expected the case to select two cards, saw ${keys.join(', ')}`);

  // A card key is `<systemId>:<componentId>`, and the system half is the participation the row
  // ACTS on: a bulk row acts on the selected participation when its card is the inspected one and
  // the primary otherwise, and both of these cards resolve to the system their key names.
  const content = buildLabContent();
  const checks = keys.map((key) => {
    const systemId = key.slice(0, key.indexOf(':'));
    const system = content.systems.find((entry) => entry.id === systemId);
    assert.ok(system, `the case selects a card from "${systemId}", which the world no longer has`);
    return { key, ...resolveSalvageCheck(system) };
  });

  const usable = checks.filter((check) => check.checkUsable);
  assert.deepEqual(
    checks.map((check) => `${check.key}=${check.checkUsable}`),
    ['lab-herbalism:hb-cracked-alembic=true', 'lab-smithing:sm-air-shard=false'],
    'the published frame is a MIXED batch — one subject that rolls and one that does not — over a ' +
      'heading that counts BOTH. Changing which is which changes the picture'
  );
  assert.ok(
    usable.length > 0,
    'no subject in the batch has a usable salvage check, so the service would never prompt and ' +
      'the case can no longer be captured'
  );
  assert.ok(
    usable.every((check) => hasPlainD20(check.rollFormula)),
    `the frame publishes an Advantage / Normal / Disadvantage row, which the service offers only ` +
      `when EVERY usable-check subject's authored formula carries a plain 1d20: ` +
      `${usable.map((check) => `${check.key} rolls ${check.rollFormula}`).join(', ')}`
  );
});

test('the same seed replays the same faces', async () => {
  const first = await new (makeRoll())('4d6 + 2').evaluate();
  const second = await new (makeRoll())('4d6 + 2').evaluate();
  assert.deepEqual(second.dice, first.dice, 'identical dice');
  assert.equal(second.total, first.total, 'identical total');
  // A different seed must actually differ, or "deterministic" is indistinguishable from "constant".
  const other = await new (makeRoll(1))('4d6 + 2').evaluate();
  assert.notDeepEqual(other.dice, first.dice, 'a different seed rolls differently');
});

test('evaluate resolves to this, and is idempotent', async () => {
  const Roll = makeRoll();
  const roll = new Roll('2d8');
  const evaluated = await roll.evaluate({ allowInteractive: false });
  assert.equal(evaluated, roll, 'evaluate resolves to the roll itself');
  const total = roll.total;
  await roll.evaluate();
  assert.equal(roll.total, total, 're-evaluating does not re-roll');
  assert.equal(roll.dice.length, 1, 're-evaluating does not append a second die group');
});

test('the die shape is the one rolledDiceGroups reads', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('3d6 + 1').evaluate();
  const [die] = roll.dice;
  assert.equal(die.number, 3);
  assert.equal(die.faces, 6);
  assert.equal(die.results.length, 3);
  // `active: true` on a kept result, matching every Foundry-shaped dice fixture in this repo
  // (`check-roll.test.js`, `check-roll-dice.test.js`, `check-roll-tier-step.test.js`).
  assert.ok(
    die.results.every((entry) => entry.active === true),
    'a kept result is explicitly active'
  );
  assert.equal(
    die.total,
    die.results.reduce((sum, entry) => sum + entry.result, 0),
    'die.total is the sum of its faces when nothing is dropped'
  );
  const [group] = rolledDiceGroups(roll);
  assert.equal(group.group, '3d6');
  assert.equal(group.sum, die.total);
  assert.equal(group.results.length, 3, 'every face is active');
});

test('kh keeps the highest and marks the rest inactive', async () => {
  const Roll = makeRoll();
  // `2d20kh1` is exactly what `applyD20Advantage` emits for advantage.
  const roll = await new Roll('2d20kh1').evaluate();
  const [die] = roll.dice;
  assert.equal(die.results.length, 2, 'both faces are recorded');
  const dropped = die.results.filter((entry) => entry.active === false);
  assert.equal(dropped.length, 1, 'exactly one face is dropped');
  const kept = die.results.filter((entry) => entry.active !== false);
  assert.equal(die.total, kept[0].result, 'the total is the kept face');
  assert.ok(kept[0].result >= dropped[0].result, 'kh keeps the higher face');
  assert.equal(roll.total, die.total);
  // And the consumer agrees: the dropped face must not reach the active-only face list.
  const [group] = rolledDiceGroups(roll);
  assert.equal(group.results.length, 1, 'rolledDiceGroups sees only the kept face');
});

test('kl keeps the lowest', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('2d20kl1').evaluate();
  const [die] = roll.dice;
  const kept = die.results.filter((entry) => entry.active !== false);
  const dropped = die.results.filter((entry) => entry.active === false);
  assert.equal(kept.length, 1);
  assert.ok(kept[0].result <= dropped[0].result, 'kl keeps the lower face');
  assert.equal(die.total, kept[0].result);
});

/** A lab Roll whose dice show `faces` in order, on dice of `sides`. */
function scriptedRoll(faces, sides) {
  const queue = [...faces];
  return createLabRoll({
    random: () => (queue.shift() - 0.5) / sides,
    replaceFormulaData: STATICS.replaceFormulaData,
    validate: STATICS.validate,
  });
}

const facesOf = (roll) => roll.dice[0].results.map((entry) => [entry.result, entry.exploded === true]);

test('x explodes recursively, xo tests the originals only, and a comparison names the faces', async () => {
  const recursive = await new (scriptedRoll([6, 2, 6, 1], 6))('2d6x=6').evaluate();
  assert.deepEqual(facesOf(recursive), [[6, true], [2, false], [6, true], [1, false]]);
  assert.equal(recursive.total, 15);
  const once = await new (scriptedRoll([6, 2, 6], 6))('2d6xo=6').evaluate();
  assert.deepEqual(facesOf(once), [[6, true], [2, false], [6, false]], 'a generated 6 stays put');
  const under = await new (scriptedRoll([2, 5, 1, 4], 6))('2d6x<=2').evaluate();
  assert.deepEqual(facesOf(under), [[2, true], [5, false], [1, true], [4, false]]);
  assert.equal(under._formula, '2d6x<=2', 'the formula a count Roll compares its policy against');
});

test('an explosion that never stops raises core\'s recursion error', async () => {
  const Roll = scriptedRoll(Array.from({ length: 1200 }, () => 6), 6);
  await assert.rejects(new Roll('1d6x>=1').evaluate(), /Maximum recursion depth/);
});

test('the count Roll nets the lab Roll\'s faces through the production projection', async () => {
  const config = { Dice: { rolls: [] } };
  const CountRoll = registerCountRoll({ config, BaseRoll: scriptedRoll([8, 10, 1, 3], 10) });
  const policy = {
    dice: 3,
    die: 10,
    direction: 'over',
    comparison: 'meet',
    threshold: 8,
    explode: { kind: 'best', value: null, once: false },
    cancel: { kind: 'worst', value: null },
  };
  const roll = await CountRoll.fromPolicy(policy).evaluate();
  assert.equal(roll.total, 1, '8 and 10 qualify, the 1 cancels, the exploded 3 does nothing');
  assert.deepEqual(
    roll.countProjection().results.map((entry) => [entry.face, entry.contribution]),
    [[8, 1], [10, 1], [1, -1], [3, 0]]
  );
});

test('roll data substitutes, and a missing key contributes zero', async () => {
  const Roll = makeRoll();
  // `missing: '0'` inside evaluate mirrors Foundry's behaviour for a Roll constructed WITH data:
  // an unresolved key contributes nothing rather than producing NaN.
  const roll = await new Roll('1d20 + @nope.missing', {}).evaluate();
  assert.ok(Number.isFinite(roll.total), 'an unresolved key does not produce NaN');
  assert.equal(roll.total, roll.dice[0].total, 'it contributes exactly zero');
});

test('a bare dN defaults to one die', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('d20').evaluate();
  assert.equal(roll.dice[0].number, 1);
  assert.equal(roll.dice[0].results.length, 1);
});

test('a negated die totals negative, wrapped as core wraps it in `(… * -1)`', async () => {
  const negated = await new (scriptedRoll([4], 6))('-1d6').evaluate();
  assert.equal(negated.formula, '(1d6 * -1)');
  assert.equal(negated.total, -4);
  const offset = await new (scriptedRoll([7], 20))('-1d20 + 30').evaluate();
  assert.equal(offset.formula, '(1d20 * -1) + 30');
  assert.equal(offset.total, 23);
});

test('toMessage routes to ChatMessage.create and tolerates its absence', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('1d6').evaluate();
  const created = [];
  const previous = globalThis.ChatMessage;
  try {
    globalThis.ChatMessage = {
      async create(data) {
        created.push(data);
        return { _id: 'lab-chat-0', ...data };
      },
    };
    const message = await roll.toMessage({ flavor: 'Crafting · Herbalism' }, { rollMode: 'roll' });
    assert.equal(created.length, 1);
    assert.equal(created[0].flavor, 'Crafting · Herbalism');
    assert.deepEqual(created[0].rolls, [roll], 'the roll is carried on `rolls`');
    assert.equal(created[0].rollMode, 'roll');
    assert.equal(message._id, 'lab-chat-0');

    // `create: false` returns the data without posting.
    const data = await roll.toMessage({}, { create: false });
    assert.equal(created.length, 1, 'create:false posts nothing');
    assert.deepEqual(data.rolls, [roll]);

    // No ChatMessage at all must not throw — `checkRoll.js` console.errors on a throw here, and
    // the capture driver fails a case on any console error.
    globalThis.ChatMessage = undefined;
    assert.equal(await roll.toMessage({}), null);
  } finally {
    globalThis.ChatMessage = previous;
  }
});

test('evaluated Roll snapshots survive JSON transport without consuming seeded entropy', async () => {
  const Roll = makeRoll();
  const ControlRoll = makeRoll();
  // No space before `[Tool]`: real Foundry refuses `1d4 [Tool]` (the recorded 13.351/14.365 terms).
  const formula = '2d20kh1 + @prof + 1d4[Tool]';
  const options = { flavor: 'Smithing', custom: { source: 'check' } };
  const original = await new Roll(formula, { prof: 3 }, options).evaluate();
  await new ControlRoll(formula, { prof: 3 }).evaluate();
  const snapshot = original.toJSON();
  assert.deepEqual(
    Object.keys(snapshot).sort((a, b) => a.localeCompare(b)),
    ['class', 'dice', 'evaluated', 'formula', 'options', 'terms', 'total']
  );
  assert.equal(snapshot.class, 'LabRoll');
  assert.equal(snapshot.evaluated, true, 'core uses evaluated, not _evaluated, on the wire');
  assert.equal(snapshot.formula, '2d20kh1 + 3 + 1d4[Tool]');
  assert.equal(snapshot.total, original.total);
  assert.deepEqual(snapshot.options, options);
  const transported = JSON.parse(JSON.stringify(snapshot));
  const restored = Roll.fromData(transported);
  assert.ok(restored instanceof Roll);
  assert.deepEqual(restored.terms, original.terms);
  assert.deepEqual(restored.dice, original.dice);
  assert.equal(restored.result, original.result);
  assert.equal(restored.formula, original.formula);
  assert.equal(restored._evaluated, true);
  assert.equal(await restored.evaluate(), restored);
  assert.equal(restored.total, original.total);
  assert.deepEqual(rolledDiceGroups(restored), rolledDiceGroups(original));
  const message = await restored.toMessage(
    { flags: { fabricate: { check: true } } },
    { messageMode: 'self', create: false }
  );
  assert.equal(message.messageMode, 'self');
  assert.deepEqual(message.flags, { fabricate: { check: true } });
  assert.equal(message.rolls[0], restored);
  assert.deepEqual(
    (await new Roll('4d20').evaluate()).dice,
    (await new ControlRoll('4d20').evaluate()).dice,
    'restore/evaluate/post consumed no draws'
  );
  snapshot.terms[0].results[0].result = -1;
  transported.options.custom.source = 'changed';
  transported.dice[0].results[0].result = -2;
  assert.ok(original.terms[0].results[0].result > 0, 'serialization detached nested results');
  assert.ok(restored.dice[0].results[0].result > 0, 'restoration detached nested results');
  assert.equal(restored.options.custom.source, 'check');
});

test('Roll reconstruction preserves zero totals and unevaluated state', async () => {
  const Roll = makeRoll();
  const zero = await new Roll('0').evaluate();
  assert.equal(Roll.fromData(JSON.parse(JSON.stringify(zero))).total, 0);
  const pending = Roll.fromData(
    JSON.parse(JSON.stringify(new Roll('1d6 + @prof', { prof: 2 })))
  );
  assert.equal(pending._evaluated, false);
  assert.equal(pending.total, undefined);
  // Core parses its terms at construction, so the die exists before it rolls, with no faces.
  assert.deepEqual(pending.dice.map((die) => die.results), [[]]);
  const expected = await new (makeRoll())('1d6 + 2').evaluate();
  assert.equal((await pending.evaluate()).total, expected.total);
});

test('prepared run checks hand the evaluated lab roll to player chat on both chat APIs', async (t) => {
  for (const [api, modeOption] of [
    ['v13', 'rollMode'],
    ['v14', 'messageMode'],
  ]) {
    await t.test(api, async (t) => {
      const Roll = makeRoll();
      const ControlRoll = makeRoll();
      const posted = [];
      const previous = ['Roll', 'ChatMessage', 'foundry'].map((key) => [
        key, Object.getOwnPropertyDescriptor(globalThis, key),
      ]);
      t.after(() => {
        for (const [key, descriptor] of previous) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor);
          else delete globalThis[key];
        }
      });
      globalThis.Roll = Roll;
      // ratchet-exempt(lint): the keep transform reads the lab `Die` from `foundry.dice.terms`.
      globalThis.foundry = { dice: { terms: Roll.TERM_CLASSES } };
      globalThis.ChatMessage = {
        ...(api === 'v14' ? { applyMode() {} } : {}),
        async create(data) {
          posted.push(data);
          return data;
        },
      };
      const speaker = { actor: 'lab-actor-brenna', alias: 'Brenna' };
      const preparation = {
        rollFormula: '1d20 + @prof',
        slot: 'simple',
        checkConfig: { dc: 1 },
        flavor: 'Crafting · Smithing',
        speaker,
      };
      const result = await evaluatePreparedRunCheck(
        preparation,
        { getRollData: () => ({ prof: 3 }) },
        {
          allowAdvantage: true,
          // The authority honours only a button the bound offer includes (issue 2007).
          advantageOffer: { advantage: true, disadvantage: true, kind: 'keep', detail: null },
          advantage: 'advantage',
          rollMode: 'selfroll',
        }
      );
      assert.equal(result.success, true);
      assert.equal(posted.length, 0, 'authority evaluation does not post the visible check');
      assert.ok(result.rollHandoff?.serializedRoll, 'authority produces a serializable handoff');
      const handoff = JSON.parse(JSON.stringify(result.rollHandoff));
      assert.deepEqual(await postCheckRollHandoff(handoff, { Roll }), { success: true });
      assert.equal(posted.length, 1);
      const message = posted[0];
      assert.deepEqual(message.speaker, speaker);
      assert.equal(message.flavor, preparation.flavor);
      assert.equal(message[modeOption], api === 'v14' ? 'self' : 'selfroll');
      assert.equal(message.rolls[0].total, result.data.total);
      assert.deepEqual(rolledDiceGroups(message.rolls[0]), result.data.diceGroups);
      assert.equal(message.rolls[0]._evaluated, true);
      await new ControlRoll('2d20kh1 + 3').evaluate();
      assert.deepEqual(
        (await new Roll('4d20').evaluate()).dice,
        (await new ControlRoll('4d20').evaluate()).dice
      );
    });
  }
});

test('the statics behave exactly as the object they replaced', () => {
  const Roll = makeRoll();
  // Pinned because ~15 recipe check cards render off `replaceFormulaData`, and
  // `resolveCheckFormulaDisplay` gates its `resolved` flag on `validate`.
  assert.equal(Roll.replaceFormulaData('1d20 + @prof', { prof: 3 }), '1d20 + 3');
  assert.equal(
    Roll.replaceFormulaData('1d20 + @prof', {}, { missing: 'NaN' }),
    '1d20 + NaN',
    'an unresolved key yields the requested missing marker'
  );
  assert.equal(Roll.replaceFormulaData('1d20 + @a.b.c', { a: { b: { c: 7 } } }), '1d20 + 7');
  assert.equal(Roll.validate('1d20 + 3'), true);
  assert.equal(Roll.validate('1d20 + @x'), false);
  assert.equal(Roll.validate('1d20 + NaN'), false);
});

test('the shim registers the count Roll over its Roll, so a count check reaches its prompt', async () => {
  const content = buildLabContent();
  const previous = { Roll: globalThis.Roll, CONFIG: globalThis.CONFIG };
  const shim = installFoundryShim({
    seed: LIVE_SEED,
    actorList: buildLabActors(content),
    scenes: [],
    settings: new Map(),
    i18n: { localize: (key) => key, format: (key) => key },
    worldTime: 0,
    documents: new Map(),
  });
  try {
    const CountRoll = findCountRoll(globalThis.CONFIG);
    assert.equal(CountRoll?.name, 'FabricateCountRoll', 'registered through the production factory');
    assert.ok(CountRoll.prototype instanceof globalThis.Roll, 'over the lab Roll, never replacing it');
    assert.equal(globalThis.CONFIG.Dice.rolls[0], globalThis.Roll);
    let prompted = null;
    const result = await evaluateCountCheckRoll(
      { getRollData: () => ({}) },
      {
        interactive: true,
        evaluation: normalizeCheckEvaluation({ product: 'count', pool: { die: 10, base: '6', threshold: '8', required: 2 } }),
        required: 2,
        prompt: async (input) => {
          prompted = input;
          return { confirmed: false };
        },
      }
    );
    assert.equal(result.cancelled, true);
    assert.deepEqual([prompted.product, prompted.pool, prompted.die, prompted.threshold], ['count', 6, 10, 8]);
  } finally {
    shim.restore();
    globalThis.Roll = previous.Roll;
  }
  assert.equal(globalThis.CONFIG, previous.CONFIG, 'restore puts CONFIG back');
});

test('a count Roll snapshot restores as the registered count Roll, as core looks it up', async () => {
  const content = buildLabContent();
  const previous = { Roll: globalThis.Roll, CONFIG: globalThis.CONFIG };
  const shim = installFoundryShim({
    seed: LIVE_SEED,
    actorList: buildLabActors(content),
    scenes: [],
    settings: new Map(),
    i18n: { localize: (key) => key, format: (key) => key },
    worldTime: 0,
    documents: new Map(),
  });
  try {
    const CountRoll = findCountRoll(globalThis.CONFIG);
    const policy = { dice: 2, die: 6, direction: 'over', comparison: 'meet', threshold: 1 };
    const rolled = await CountRoll.fromPolicy({ ...policy, explode: null, cancel: null }).evaluate();
    const restored = globalThis.Roll.fromData(JSON.parse(JSON.stringify(rolled.toJSON())));
    assert.ok(restored instanceof CountRoll, 'the base class resolves the snapshot to its own class');
    assert.equal(restored.total, rolled.total);
    assert.throws(
      () => globalThis.Roll.fromData({ ...rolled.toJSON(), class: 'UnregisteredRoll' }),
      /cannot reconstruct UnregisteredRoll/
    );
  } finally {
    shim.restore();
    // ratchet-exempt(lint): the shim installs the lab Roll as a Foundry global; this restores it.
    globalThis.Roll = previous.Roll;
  }
});

test('the shim installs a Roll CONSTRUCTOR, so evaluateCheckRoll reaches the prompt', async () => {
  // COMPOSITION, and the reason this test exists: every other test here imports `createLabRoll`
  // directly, so reverting `installFoundryShim.js` to the pre-change two-static object left the
  // whole capability gone with the suite green.
  const content = buildLabContent();
  const actors = buildLabActors(content);
  const previous = { Roll: globalThis.Roll, game: globalThis.game, ui: globalThis.ui };
  try {
    installFoundryShim({
      seed: LIVE_SEED,
      actorList: actors,
      scenes: [],
      settings: new Map(),
      i18n: { localize: (key) => key, format: (key) => key },
      worldTime: 0,
      documents: new Map(),
    });
    assert.equal(typeof globalThis.Roll, 'function', 'the shim installs a Roll constructor');

    let prompted = false;
    const result = await evaluateCheckRoll(
      '1d20 + 3',
      { getRollData: () => ({}) },
      {
        interactive: true,
        prompt: async () => {
          prompted = true;
          return { confirmed: true };
        },
      }
    );
    assert.equal(result.engine, true, 'the check is engine-evaluated rather than short-circuited');
    assert.ok(prompted, 'the interactive prompt is reached');
  } finally {
    globalThis.Roll = previous.Roll;
    globalThis.game = previous.game;
    globalThis.ui = previous.ui;
  }
});

// The `player-crafting-roll-prompt` frame's PREMISE, read from the fixtures rather than assumed
// (issues 1055, 1094).
test('the lab fixtures still reach the interactive modifier fieldset (issues 1055, 1094)', () => {
  const content = buildLabContent();
  const herbalism = content.systems.find((system) => system.id === 'lab-herbalism');
  assert.ok(herbalism, 'the herbalism fixture system exists');
  const stillroom = content.recipes.find((recipe) => recipe.id === 'hb-r-stillroom');
  assert.ok(stillroom, 'the roll-prompt case’s recipe exists');

  // The rule is the SYSTEM's, full stop. A recipe may carry a pick, never a rule.
  const active = resolveActiveCraftingCheckFormula(herbalism);
  assert.ok(
    active.checkUsable,
    'the active mode still carries an authored roll formula — without one the engine offers no choice'
  );
  // Read the AUTHORED field, not `active.rollFormula`.
  const authoredFormula = herbalism?.craftingCheck?.[active.slot]?.rollFormula ?? '';
  assert.ok(authoredFormula.trim() !== '', 'the fixture authors a formula on the active slot');
  assert.equal(
    authoredFormula.includes('@craftingmod'),
    false,
    'and the FIXTURE seeds no retired placeholder, so the capture case does not depend on one'
  );
  // The lab fixture authors its two libraries at their PRE-MIGRATION locations on purpose (issues
  // 1095 C13, 1117), so the lab BUILD's migration pass is what lifts and merges them.
  const migrated = {
    ...herbalism,
    modifiers: herbalism.craftingCheck?.checkModifiers,
  };
  const context = buildCheckModifierContext(migrated, 'crafting', stillroom);
  assert.equal(
    resolveModifierPolicy(context),
    'playerPicks',
    'the effective rule is playerPicks; authored anywhere but the SYSTEM it is not honoured'
  );

  // …and the descriptor the prompt renders from. `null` here is the failure the CI capture
  // reported: the dialog opens with no fieldset in it.
  const choice = buildCheckModifierChoice(context, () => 1);
  assert.ok(choice, 'a modifier-choice descriptor is built');
  assert.ok(
    choice.modifiers.length >= 2,
    `the two-option floor is cleared (${choice.modifiers.length} eligible)`
  );
  assert.ok(
    choice.maxPicks >= 2,
    'the cap leaves room for a MULTI-pick checkbox group rather than a pick-one radio group'
  );
});

test('the lab roll-prompt answerer stops answering once disconnected', async () => {
  const { Window } = await import('happy-dom');
  const { createLabRollPromptAnswerer } = await import('./view-lab/rollPromptAnswer.js');
  const window = new Window();
  const previousObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = window.MutationObserver;
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const prompt = (onRoll) => {
    const node = window.document.createElement('div');
    node.setAttribute('data-roll-prompt', 'single');
    const button = window.document.createElement('button');
    button.dataset.action = 'roll';
    button.addEventListener('click', onRoll);
    node.append(button);
    return node;
  };
  try {
    const answerer = createLabRollPromptAnswerer(window.document);
    answerer.setAnswer('roll');
    let answered = 0;
    window.document.body.append(prompt(() => (answered += 1)));
    await flush();
    assert.equal(answered, 1, 'a watched prompt is answered');
    answerer.disconnect();
    window.document.body.append(prompt(() => (answered += 1)));
    await flush();
    assert.equal(answered, 1, 'a prompt after disconnect is left standing');
  } finally {
    globalThis.MutationObserver = previousObserver;
    await window.happyDOM.abort();
  }
});

test('1516: evaluateSync reads dice at an extreme and skips modifiers, as core does', async () => {
  const { quantityFormulaErrors } = await import('../src/models/Result.js');
  const Roll = makeRoll();
  const maximum = (formula) => new Roll(formula).evaluateSync({ maximize: true }).total;
  assert.equal(maximum('1d4+1'), 5);
  assert.equal(maximum('2d6kh1'), 12, 'core’s sync path skips modifiers');
  assert.equal(maximum('2d20cs<=0'), 40, 'a count modifier too');
  assert.equal(maximum('@abilities.str.mod + 1'), 1, 'a missing path reads 0');
  assert.throws(() => maximum('1000d4'), /999 dice/, 'core caps one term at 999 dice');
  assert.equal(new Roll('2d6 + 1').evaluateSync({ minimize: true }).total, 3);
  assert.throws(() => new Roll('1d4').evaluateSync(), /synchronously/, 'dice need an extreme');
  assert.equal(new Roll('2 + 3').evaluateSync().total, 5, 'a dice-free formula needs none');

  // The floor the amount field's error and the save path both read.
  assert.deepEqual(quantityFormulaErrors('1d4+1', Roll), []);
  assert.deepEqual(quantityFormulaErrors('0', Roll), [
    'quantity formula can never award a positive amount',
  ]);
  assert.deepEqual(quantityFormulaErrors('max(, 2)', Roll), ['quantity formula cannot be rolled']);
  assert.deepEqual(quantityFormulaErrors('1d4 / @x', Roll), ['quantity formula cannot be rolled']);
  const divided = await new Roll('1d4 / @x').evaluate();
  assert.equal(Number.isFinite(divided.total), false, 'and the async total is left as computed');
});
