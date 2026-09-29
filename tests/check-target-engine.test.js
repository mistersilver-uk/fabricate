/**
 * Issue 2003 — the activity adapters resolve and validate a check's target before any Fabricate
 * roll (QE3). Every cell drives a real engine entry point with a counting `Roll` and asserts the
 * refusal, zero rolls (Tool dice included) and zero effects, then a positive control that rolls once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { craftProbe, probeResolutionService, salvageProbe } from './helpers/craftPipelineProbe.js';
import { promptJournalStageCheck } from '../src/bootstrap/journalOperations.js';
import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { buildCheckModifierContext } from '../src/systems/checkModifierResolver.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import {
  evaluatePreparedRunCheck,
  runFormulaPassFail,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';
import { checkDiceLine } from '../src/ui/presenters/checkDiceLine.js';
import { executedCheckDisplay } from '../src/ui/presenters/checkDisplay.js';
import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';
import { MacroExecutor } from '../src/utils/MacroExecutor.js';
import { rollPromptTarget } from '../src/ui/svelte/apps/crafting/rollPromptTarget.js';
import { stubI18n, stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { foldTargetTerms } from '../src/ui/presenters/checkDisplay.js';
import {
  GatheringDocumentActor,
  gatheringFixture,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';

/** A `Roll` that records every construction; a constant formula totals itself, dice total 12. */
function installCountingRoll() {
  const constructed = [];
  globalThis.Roll = class CountingRoll {
    constructor(formula) {
      this.formula = String(formula);
      const constant = Number(this.formula);
      this.total = Number.isFinite(constant) ? constant : 12;
      this.dice = [];
      constructed.push(this.formula);
    }
    async evaluate() {
      return this;
    }
    evaluateSync() {
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
    async toMessage() {}
    static replaceFormulaData(formula) {
      return formula;
    }
    static validate() {
      return true;
    }
  };
  return constructed;
}

/** A summed evaluation against the actor's character value at `expression`. */
function attribute(expression, { direction = 'over', ...target } = {}) {
  return { product: 'sum', direction, target: { source: 'attribute', expression, ...target } };
}

/** Reading a missing path as 0 would pass every roll of 12, so only a refusal stops it. */
const MISSING = attribute('@skills.missing.value');
const VALID = attribute('@skills.craft.value');
const SUM_UNDER = { product: 'sum', direction: 'under' };
const SKILLS = { craft: { value: 14 } };
const UNRESOLVED = 'check cannot roll: the character value its target reads was not found.';
const PROGRESSIVE_UNDER = 'check cannot roll: a progressive check cannot roll under a target.';

/** Journal entries that consume, spend, award or post. */
const EFFECT = /^(item\.|actor\.|chat\.|currency\.|itemPiles\.deduct|complication\.)/;
const effects = (journal) => journal.entries.filter(([name]) => EFFECT.test(name));

/** A refused craft opens its run, discards it and returns: nothing else is journalled. */
const REFUSED_CRAFT_JOURNAL = [
  'run.findActiveRunForRecipe',
  'run.createRun',
  'visibility.guardCraftStart',
  'run.getActiveRun',
  'run.discardRun',
  'returned',
];

const HAMMER = { id: 'tool-hammer', componentId: 'hammer', name: 'Hammer' };
const TIERS = [
  { id: 't-fine', name: 'Fine', success: true, breakTools: false, dc: 0 },
  { id: 't-botch', name: 'Botch', success: false, breakTools: false, dc: -10 },
];

/** A craft world whose one Tool rolls a `1d4` bonus, so an early Tool roll is visible. */
function craftingWorld({ resolutionMode, slot, config, alchemy }) {
  const world = craftProbe({
    resolutionMode,
    features: { craftingChecks: true },
    craftingCheck: { enabled: true, consumption: {}, [slot]: config },
    tools: [HAMMER],
    alchemy,
    resolutionService: probeResolutionService({ mode: resolutionMode }),
  });
  world.engine.recipeManager.resolveToolStates = (_recipe, tools) =>
    tools.map((tool) => ({
      available: true,
      contributionInput: {
        tool: { ...tool, bonus: { enabled: true, expression: '1d4' } },
        matchedItem: world.toolItems[0],
        primaryActor: world.craftingActor,
      },
    }));
  return world;
}

/** Records each check result `_runCraftingCheck` returns, passing it through unchanged. */
function recordChecks(engine) {
  const results = [];
  const run = engine._runCraftingCheck.bind(engine);
  engine._runCraftingCheck = async (...args) => {
    const result = await run(...args);
    results.push(result);
    return result;
  };
  return results;
}

const simpleCheck = (evaluation) => ({ rollFormula: '1d20', dc: 10, evaluation });
const routedCheck = (evaluation) => ({
  rollFormula: '1d20',
  dc: 10,
  thresholdMode: 'meet',
  type: 'relative',
  relativeOutcomes: TIERS,
  fixedOutcomes: [],
  evaluation,
});

const CRAFT_SITES = [
  { name: 'crafting simple', resolutionMode: 'simple', slot: 'simple', config: simpleCheck },
  {
    name: 'routed-by-ingredients optional check',
    resolutionMode: 'routedByIngredients',
    slot: 'simple',
    config: simpleCheck,
  },
  { name: 'routedByCheck', resolutionMode: 'routedByCheck', slot: 'routed', config: routedCheck },
];

for (const site of CRAFT_SITES) {
  test(`${site.name}: a missing character path refuses before any roll, spend or award`, async () => {
    const world = craftingWorld({ ...site, config: site.config(MISSING) });
    const checks = recordChecks(world.engine);
    const constructed = installCountingRoll();
    const result = await world.craft();
    assert.equal(result.success, false);
    assert.equal(result.message, `Crafting ${UNRESOLVED}`);
    assert.deepEqual(
      [result.misconfigured, result.data],
      [true, { targetRefusal: 'unresolved-path' }],
      'craft() carries the refusal channel and its reason'
    );
    assert.equal(checks[0].misconfigured, true);
    assert.deepEqual(checks[0].data, { targetRefusal: 'unresolved-path' });
    assert.deepEqual(constructed, [], 'no Tool die and no check roll');
    assert.deepEqual(effects(world.journal), []);
    assert.deepEqual(
      world.journal.entries.map(([name]) => name),
      REFUSED_CRAFT_JOURNAL,
      'the run it opened is discarded, not kept'
    );
  });

  test(`${site.name}: a resolvable character value rolls the check exactly once`, async () => {
    const world = craftingWorld({ ...site, config: site.config(VALID) });
    world.craftingActor.system.skills = SKILLS;
    const checks = recordChecks(world.engine);
    const constructed = installCountingRoll();
    await world.craft();
    assert.equal(checks[0].misconfigured, undefined);
    // A total of 12 misses Fine at 14 and routes Botch, whose threshold is 14 − 10.
    assert.deepEqual(
      [checks[0].data.dc, checks[0].data.target],
      [null, site.slot === 'routed' ? 4 : 14],
      'graded against the character value, not the DC of 10, which names no DC'
    );
    assert.deepEqual(constructed, ['1d4', '1d20 + 12[Hammer]']);
  });
}

test('routedByCheck fixed ranges read no target, so a missing path still rolls once and routes', async () => {
  const ranges = {
    ...routedCheck(attribute('@skills.missing.value', { direction: 'under' })),
    type: 'fixed',
    relativeOutcomes: [],
    fixedOutcomes: [
      { id: 'r-fine', name: 'Fine', success: true, breakTools: false, start: 0, end: 11 },
      { id: 'r-botch', name: 'Botch', success: false, breakTools: false, start: 12, end: 40 },
    ],
  };
  const world = craftingWorld({ resolutionMode: 'routedByCheck', slot: 'routed', config: ranges });
  const checks = recordChecks(world.engine);
  const constructed = installCountingRoll();
  await world.craft();
  assert.equal(checks[0].misconfigured, undefined, 'a fixed-range target source is inert');
  assert.deepEqual(
    [checks[0].data.outcomeId, checks[0].success],
    ['r-fine', true],
    'under, the Tool 1d4 (12) raises the benefit, so the total 12 matches 12 − 12 = 0'
  );
  assert.deepEqual(constructed, ['1d4', '1d20'], 'the Tool and the check each roll once');
});

test('crafting progressive: sum/under refuses before its Tool roll, and sum/over rolls once', async () => {
  const progressive = (evaluation) => ({ rollFormula: '1d20', evaluation });
  const site = { resolutionMode: 'progressive', slot: 'progressive' };
  const refused = craftingWorld({ ...site, config: progressive(SUM_UNDER) });
  const checks = recordChecks(refused.engine);
  const constructed = installCountingRoll();
  await refused.craft();
  assert.deepEqual(checks[0].data, { targetRefusal: 'progressive-under' });
  assert.deepEqual(constructed, []);
  assert.deepEqual(effects(refused.journal), []);

  const control = craftingWorld({ ...site, config: progressive(attribute('@skills.missing')) });
  const controlChecks = recordChecks(control.engine);
  const controlRolls = installCountingRoll();
  await control.craft();
  assert.equal(controlChecks[0].misconfigured, undefined, 'a progressive target source is inert');
  assert.deepEqual(controlRolls, ['1d4', '1d20 + 12[Hammer]']);
});

for (const checkMode of ['simple', 'tiered']) {
  test(`alchemy ${checkMode}: a missing character path refuses before the Tool roll`, async () => {
    const slot = checkMode === 'simple' ? 'simple' : 'routed';
    const config = checkMode === 'simple' ? simpleCheck : routedCheck;
    const run = async (evaluation) => {
      const world = craftingWorld({
        resolutionMode: 'alchemy',
        slot,
        config: config(evaluation),
        alchemy: { checkMode },
      });
      world.craftingActor.system.skills = SKILLS;
      const toolItems = [{ tool: HAMMER, contributionInput: world.engine.recipeManager
        .resolveToolStates(world.recipe, [HAMMER])[0].contributionInput }];
      const constructed = installCountingRoll();
      const result = await world.engine._runCraftingCheck(
        world.recipe, world.craftingActor, [world.sourceActor], null, null, { toolItems }
      );
      return { result, constructed, world };
    };
    const refused = await run(MISSING);
    assert.equal(refused.result.misconfigured, true);
    assert.deepEqual(refused.result.data, { targetRefusal: 'unresolved-path' });
    assert.deepEqual(refused.constructed, []);
    assert.deepEqual(effects(refused.world.journal), []);

    const control = await run(VALID);
    assert.deepEqual(
      [control.result.data.dc, control.result.data.target],
      [null, checkMode === 'simple' ? 14 : 4]
    );
    assert.deepEqual(control.constructed, ['1d4', '1d20 + 12[Hammer]']);
  });
}

test('crafting simple: each target refusal reason reaches the misconfigured channel', async () => {
  for (const [evaluation, reason] of [
    [attribute(''), 'expression-missing'],
    [attribute('1d6 + @skills.craft.value'), 'dice'],
    [attribute('@skills.craft.value', { adjustmentKind: 'multiply', baseAdjustment: 0 }), 'adjustment-invalid'],
    [attribute('@skills.craft.value', { direction: 'under' }), null],
  ]) {
    const world = craftingWorld({ resolutionMode: 'simple', slot: 'simple', config: simpleCheck(evaluation) });
    world.craftingActor.system.skills = SKILLS;
    const constructed = installCountingRoll();
    const result = await world.engine._runCraftingCheck(
      world.recipe, world.craftingActor, [world.sourceActor], null, null, {}
    );
    if (reason === null) {
      assert.equal(result.misconfigured, undefined, 'a valid roll-under character value rolls');
      assert.deepEqual(constructed, ['1d20']);
      continue;
    }
    assert.deepEqual(result.data, { targetRefusal: reason }, reason);
    assert.deepEqual(constructed, [], reason);
  }
});

// ── timed FINISH ──────────────────────────────────────────────────────────────

test('timed FINISH: a refusal rolls and awards nothing and leaves the run resumable', async () => {
  const world = craftProbe({
    features: { craftingChecks: true },
    craftingCheck: { enabled: true, consumption: {}, simple: simpleCheck(VALID) },
    resolutionService: probeResolutionService({ mode: 'simple' }),
    steps: [
      {
        ingredients: [{ componentId: 'wood', quantity: 2 }],
        results: [{ componentId: 'plank', quantity: 1 }],
        timeRequirement: { hours: 1 },
      },
    ],
    worldTime: 1000,
  });
  const constructed = installCountingRoll();
  await world.craft();
  const { id: runId } = world.runManager.getActiveRuns(world.craftingActor)[0];
  world.advanceClock(3600);
  const startEffects = effects(world.journal).length;
  const finished = await world.craft(null, { runId });
  assert.equal(finished.success, false);
  assert.equal(finished.message, `Crafting ${UNRESOLVED}`);
  assert.deepEqual(
    [finished.misconfigured, finished.data],
    [true, { targetRefusal: 'unresolved-path' }],
    'FINISH carries the refusal channel and its reason'
  );
  assert.deepEqual(constructed, []);
  assert.equal(effects(world.journal).length, startEffects, 'FINISH awards and posts nothing');
  assert.equal(world.runManager.getActiveRuns(world.craftingActor)[0]?.id, runId, 'still resumable');

  world.craftingActor.system.skills = SKILLS;
  const resumed = await world.craft(null, { runId });
  assert.equal(resumed.message, 'Crafting check failed', '12 misses the character value of 14');
  assert.deepEqual(constructed, ['1d20'], 'the resumed FINISH rolls once');
  assert.deepEqual(world.runManager.getActiveRuns(world.craftingActor), []);
});

// ── the macro ─────────────────────────────────────────────────────────────────

test('a dynamic target macro runs only after validation and receives the adjusted value', async () => {
  const payloads = [];
  const original = MacroExecutor.run;
  MacroExecutor.run = async (_uuid, payload) => {
    payloads.push(payload);
    payload.evaluation.target.expression = 'mutated';
    return payload.anchorDc + 3.7;
  };
  try {
    const evaluation = attribute('@skills.craft.value', { adjustmentKind: 'add', baseAdjustment: -2 });
    const dynamic = (target) => ({ ...simpleCheck(target), dcMode: 'dynamic', macroUuid: 'Macro.dc' });
    const refusedWorld = craftingWorld({ resolutionMode: 'simple', slot: 'simple', config: dynamic(MISSING) });
    installCountingRoll();
    const refused = await refusedWorld.engine._runCraftingCheck(
      refusedWorld.recipe, refusedWorld.craftingActor, [refusedWorld.sourceActor], null, null, {}
    );
    assert.equal(refused.misconfigured, true);
    assert.equal(payloads.length, 0, 'validation precedes the macro');

    const world = craftingWorld({ resolutionMode: 'simple', slot: 'simple', config: dynamic(evaluation) });
    world.craftingActor.system.skills = SKILLS;
    installCountingRoll();
    const result = await world.engine._runCraftingCheck(
      world.recipe, world.craftingActor, [world.sourceActor], null, null, {}
    );
    assert.equal(payloads[0].anchorDc, 12, 'the attribute 14 with its added -2');
    assert.equal(payloads[0].evaluation.direction, 'over');
    assert.equal(
      world.system.craftingCheck.simple.evaluation.target.expression,
      '@skills.craft.value',
      'the payload evaluation is a clone'
    );
    assert.equal(result.data.target, 15, 'the truncated macro result replaces the anchor');
    assert.deepEqual(result.data.targetTerms, [{ kind: 'anchor', value: 15 }], 'issue 2005');

    MacroExecutor.run = async () => {
      throw new Error('boom');
    };
    const fallback = await world.engine._runCraftingCheck(
      world.recipe, world.craftingActor, [world.sourceActor], null, null, {}
    );
    assert.equal(fallback.data.target, 12, 'a failed macro keeps the adjusted anchor');
    assert.deepEqual(fallback.data.targetTerms, [
      { kind: 'anchor', value: 14 },
      { kind: 'adjustment', value: -2 },
    ]);
  } finally {
    MacroExecutor.run = original;
  }
});

test('a DC macro that moves a roll-under target hides its character-value basis', async () => {
  const original = MacroExecutor.run;
  MacroExecutor.run = async (_uuid, payload) => payload.anchorDc + 3;
  const surface = stubPromptSurface(() => null);
  try {
    const evaluation = attribute('@skills.craft.value', { direction: 'under', adjustmentKind: 'add', baseAdjustment: -2 });
    const config = { ...simpleCheck(evaluation), dcMode: 'dynamic', macroUuid: 'Macro.dc' };
    const world = craftingWorld({ resolutionMode: 'simple', slot: 'simple', config });
    world.craftingActor.system.skills = SKILLS;
    installCountingRoll();
    const tool = { ...HAMMER, bonus: { enabled: true, expression: '2' } };
    const toolItems = [{ tool: HAMMER, contributionInput: { tool, primaryActor: world.craftingActor } }];
    await world.engine._runCraftingCheck(
      world.recipe, world.craftingActor, [world.sourceActor], null, null, { interactive: true, toolItems }
    );
    assert.equal(surface.view.targetBasis, null, 'the macro moved 12 to 15, off what @skills.craft.value explains');
    assert.deepEqual(rollPromptTarget(surface.view, []), {
      chipText: 'Target 17 · stay at or under', source: 'Base 15 · tools +2',
    });
  } finally {
    surface.restore();
    MacroExecutor.run = original;
  }
});

// ── the adjustment each activity selects ──────────────────────────────────────

/** A summed evaluation against `@skill` with the given adjustment kind and base. */
const skillTarget = (direction, adjustmentKind, baseAdjustment) =>
  attribute('@skill', { direction, adjustmentKind, baseAdjustment });

test('salvage takes the component adjustmentOverride over the base, read from getRollData', async () => {
  const engine = Object.create(CraftingEngine.prototype);
  installCountingRoll();
  const result = await engine._runSalvageSimpleCheck(
    { rollFormula: '1d20', dc: 10, evaluation: skillTarget('over', 'add', 0) },
    { name: 'Scrap', salvage: { adjustmentOverride: -4 } },
    { system: {}, getRollData: () => ({ skill: 14 }) },
    {}
  );
  assert.deepEqual([result.data.dc, result.data.target, result.success], [null, 10, true]);
});

test('salvage and gathering roll-under prompts name the character value, never a Base', async () => {
  const actor = { name: 'Scavenger', system: {}, getRollData: () => ({ skill: 14 }) };
  const tool = { ...HAMMER, bonus: { enabled: true, expression: '2' } };
  const toolItems = [{ tool: HAMMER, contributionInput: { tool, primaryActor: actor } }];
  const evaluation = skillTarget('under', 'add', 0);
  const salvage = Object.create(CraftingEngine.prototype);
  const gathering = Object.create(GatheringEngine.prototype);
  const component = { name: 'Scrap', salvage: { adjustmentOverride: -4 } };
  const runs = {
    'salvage simple': () => salvage._runSalvageSimpleCheck(
      simpleCheck(evaluation), component, actor, { interactive: true, toolItems }),
    'salvage routed': () => salvage._runSalvageRoutedCheck(
      routedCheck(evaluation), component, actor, { interactive: true, toolItems }),
    'gathering routed': () => gathering._rollRoutedFormula({
      routed: routedCheck(evaluation), rollFormula: '1d20', actor,
      task: { name: 'Forage', adjustmentOverride: -4 }, interactive: true,
    }),
  };
  const expected = {
    'salvage simple': ['Target 12 · stay at or under', 'Scavenger @skill 14 · difficulty −4 · tools +2'],
    'salvage routed': ['Target 12 · stay at or under', 'Scavenger @skill 14 · difficulty −4 · tools +2'],
    'gathering routed': ['Target 10 · stay at or under', 'Scavenger @skill 14 · difficulty −4'],
  };
  for (const [site, run] of Object.entries(runs)) {
    installCountingRoll();
    const surface = stubPromptSurface(() => null);
    try {
      await run();
      const { chipText, source } = rollPromptTarget(surface.view, []);
      assert.deepEqual([chipText, source], expected[site], site);
    } finally {
      surface.restore();
    }
  }
});

/** Capture every posted check-roll flavor while `run` executes, with the prompt confirming. */
async function postedFlavors(run) {
  const flavors = [];
  const originalChat = globalThis.ChatMessage;
  globalThis.ChatMessage = { create: async () => null, getSpeaker: () => null };
  const surface = stubPromptSurface(() => ({ confirmed: true }));
  try {
    installCountingRoll();
    globalThis.Roll.prototype.toMessage = async (data) => {
      flavors.push(data.flavor);
    };
    const result = await run();
    return { flavors, result, view: surface.view };
  } finally {
    surface.restore();
    globalThis.ChatMessage = originalChat;
  }
}

test('a routed roll names no Target in its flavor, fixed range or not; relative roll-high keeps its DC', async () => {
  const gathering = Object.create(GatheringEngine.prototype);
  const salvage = Object.create(CraftingEngine.prototype);
  const actor = { name: 'Scavenger', system: {} };
  const fixedRange = (evaluation) => ({
    ...routedCheck(evaluation), type: 'fixed',
    fixedOutcomes: [{ id: 'all', name: 'All', success: true, start: 1, end: 20 }],
  });
  const gather = (routed) => gathering._rollRoutedFormula({
    routed, rollFormula: '1d20', actor, task: { name: 'Forage' }, interactive: true,
  });
  const salvageRouted = (routed) =>
    salvage._runSalvageRoutedCheck(routed, { name: 'Scrap', salvage: {} }, actor, { interactive: true });
  const flavorOf = async (run) => (await postedFlavors(run)).flavors.at(-1);
  assert.equal(await flavorOf(() => gather(routedCheck(SUM_UNDER))), 'Forage — Gathering check');
  assert.equal(await flavorOf(() => gather(fixedRange(SUM_UNDER))), 'Forage — Gathering check');
  assert.equal(await flavorOf(() => salvageRouted(fixedRange(SUM_UNDER))), 'Scrap — Salvage check');
  const sumOver = { product: 'sum', direction: 'over' };
  assert.equal(
    await flavorOf(() => gather(routedCheck(sumOver))),
    'Forage — Gathering check (DC 10)',
    'roll-high keeps its flavor byte-identical'
  );
  assert.equal(
    await flavorOf(() => gather(fixedRange(sumOver))),
    'Forage — Gathering check',
    'a fixed-range roll-high check has no DC, as crafting shows none'
  );
});

test('a pass/fail roll-under flavor names the final target, as the chip and data.target do (M1)', async () => {
  const actor = { name: 'Scavenger', system: {}, getRollData: () => ({}) };
  const tool = { ...HAMMER, bonus: { enabled: true, expression: '2' } };
  const toolItems = [{ tool: HAMMER, contributionInput: { tool, primaryActor: actor } }];
  const salvage = Object.create(CraftingEngine.prototype);
  const { flavors, result, view } = await postedFlavors(() =>
    salvage._runSalvageSimpleCheck(simpleCheck(SUM_UNDER), { name: 'Scrap' }, actor, {
      interactive: true,
      toolItems,
    })
  );
  assert.equal(result.data.target, 12, '10 raised by the Tool bonus of 2');
  assert.equal(rollPromptTarget(view, []).chipText, 'Target 12 · stay at or under');
  assert.deepEqual(flavors, ['Scrap — Salvage check (Target 12)']);

  const over = await postedFlavors(() =>
    salvage._runSalvageSimpleCheck(simpleCheck({ product: 'sum', direction: 'over' }), { name: 'Scrap' }, actor, {
      interactive: true,
      toolItems,
    })
  );
  assert.deepEqual(over.flavors, ['Scrap — Salvage check (DC 10)'], 'roll-high byte-identical');
});

test('the Target suffix sits before a picked modifier label, as the DC suffix does', async () => {
  const actor = { name: 'Scavenger', system: {}, getRollData: () => ({}) };
  const system = {
    modifiers: [
      { id: 'steady', label: 'Steady hands', expression: '1', enabled: true },
      { id: 'keen', label: 'Keen eye', expression: '2', enabled: true },
    ],
    salvageCraftingCheck: {
      defaultModifierPolicy: 'playerPicks',
      defaultModifierIds: ['steady', 'keen'],
      maxModifierPicks: 1,
    },
  };
  const component = { name: 'Scrap' };
  const salvage = Object.create(CraftingEngine.prototype);
  const { flavors } = await postedFlavors(() =>
    salvage._runSalvageSimpleCheck(simpleCheck(SUM_UNDER), component, actor, {
      interactive: true,
      craftingModifier: buildCheckModifierContext(system, 'salvage', component),
    })
  );
  assert.equal(flavors.length, 1);
  assert.match(flavors[0], /^Scrap — Salvage check \(Target \d+\) · /);
});

test('a Journal pass/fail roll with no anchor names no Target, never Target 0', async () => {
  installCountingRoll();
  const prepared = {
    mode: 'simple',
    slot: 'simple',
    rollFormula: '1d20',
    flavor: 'Sun Tea — Crafting check',
    checkConfig: { rollFormula: '1d20', thresholdMode: 'meet', dc: null, evaluation: SUM_UNDER },
    decisionPolicy: { target: null },
  };
  const rolled = await evaluatePreparedRunCheck(prepared, { getRollData: () => ({}) }, {
    rollMode: 'publicroll',
  });
  assert.equal(rolled.rollHandoff?.flavor, 'Sun Tea — Crafting check');
});

test('a Journal pass/fail roll hands back its final target, localized, and a secret one none', async () => {
  const prepared = {
    mode: 'simple',
    slot: 'simple',
    rollFormula: '1d20',
    flavor: 'Sun Tea — Crafting check',
    checkConfig: { rollFormula: '1d20', thresholdMode: 'meet', dc: 10, evaluation: SUM_UNDER },
    decisionPolicy: { target: 10, allowsSituationalModifier: true },
  };
  const decision = { rollMode: 'publicroll', bonus: '2', allowsSituationalModifier: true };
  const actor = { getRollData: () => ({}) };
  installCountingRoll();
  const originalChat = globalThis.ChatMessage;
  const restore = stubI18n({ 'FABRICATE.Check.Roll.FlavorTarget': 'Ziel {target}' });
  try {
    const open = await evaluatePreparedRunCheck(prepared, actor, decision);
    assert.equal(open.data.target, 12);
    assert.equal(open.rollHandoff.flavor, 'Sun Tea — Crafting check (Ziel 12)');
    const posted = [];
    globalThis.ChatMessage = { create: async () => null };
    globalThis.Roll.prototype.toMessage = async (data) => {
      posted.push(data.flavor);
    };
    const secret = await evaluatePreparedRunCheck(prepared, actor, decision, { secret: true });
    assert.ok(!secret.rollHandoff, 'a secret roll hands nothing back');
    assert.deepEqual(posted, ['Sun Tea — Crafting check'], 'nor does its private post name a target');

    // A routed Journal roll names no Target: its tiers grade their own, and a fixed range none.
    for (const type of ['relative', 'fixed']) {
      const routed = await evaluatePreparedRunCheck(
        {
          ...prepared,
          mode: 'routedByCheck',
          slot: 'routed',
          checkConfig: {
            ...prepared.checkConfig,
            type,
            relativeOutcomes: TIERS,
            fixedOutcomes: [{ id: 'all', name: 'All', success: true, start: 1, end: 20 }],
          },
        },
        actor,
        decision
      );
      assert.equal(routed.rollHandoff.flavor, 'Sun Tea — Crafting check', type);
    }
  } finally {
    restore();
    globalThis.ChatMessage = originalChat;
  }
});

test('the direct gathering prompt shows no DC for a fixed-range routed check, as crafting', async () => {
  const gathering = Object.create(GatheringEngine.prototype);
  const actor = { name: 'Ranger', system: {}, getRollData: () => ({}) };
  const fixed = {
    ...routedCheck(undefined),
    type: 'fixed',
    relativeOutcomes: [],
    fixedOutcomes: [{ id: 'all', name: 'All', start: 1, end: 20, success: true }],
  };
  const seen = {};
  for (const [site, routed] of Object.entries({ fixed, relative: routedCheck(undefined) })) {
    installCountingRoll();
    const surface = stubPromptSurface(() => null);
    try {
      await gathering._rollRoutedFormula({
        routed, rollFormula: '1d20', actor, task: { name: 'Forage' }, interactive: true,
      });
      seen[site] = [surface.view.dc ?? null, surface.view.chipText];
    } finally {
      surface.restore();
    }
  }
  assert.deepEqual(seen, {
    fixed: [null, ''],
    relative: [10, 'DC 10 · meet or beat'],
  });
});

test('crafting takes the selected recipe tier adjustment over the base', async () => {
  const engine = Object.create(CraftingEngine.prototype);
  installCountingRoll();
  const tiers = [{ id: 'hard', name: 'Hard', dc: 20, adjustment: 0.5 }];
  const simple = { rollFormula: '1d100', dc: 10, tiers, evaluation: skillTarget('under', 'multiply', 1) };
  const result = await engine._runSimpleCheck(
    { craftingCheck: { simple } },
    { name: 'R', checkTierId: 'hard' },
    null,
    { getRollData: () => ({ skill: 55 }) },
    {}
  );
  assert.deepEqual([result.data.target, result.success], [27, true], '55 × ½, floored');
});

// ── QE5: the production placement path ────────────────────────────────────────

/** A sum/under crafting check with a Tool scalar +2 and a library scalar +1, and no overrides. */
async function sumUnderWithScalars(total) {
  const world = craftingWorld({
    resolutionMode: 'simple',
    slot: 'simple',
    config: {
      ...simpleCheck({ product: 'sum', direction: 'under', target: { source: 'fixed' } }),
      dc: 10,
    },
  });
  world.system.modifiers = [{ id: 'knack', label: 'Knack', expression: '1' }];
  Object.assign(world.system.craftingCheck, {
    defaultModifierPolicy: 'addAll',
    defaultModifierIds: ['knack'],
  });
  const tool = { ...HAMMER, bonus: { enabled: true, expression: '2' } };
  const toolItems = [{ tool: HAMMER, contributionInput: { tool, primaryActor: world.craftingActor } }];
  const constructed = installCountingRoll();
  class FixedTotal extends globalThis.Roll {
    constructor(formula) {
      super(formula);
      if (!Number.isFinite(Number(formula))) this.total = total;
    }
  }
  globalThis.Roll = FixedTotal;
  const result = await world.engine._runCraftingCheck(
    world.recipe, world.craftingActor, [world.sourceActor], null, null, { toolItems }
  );
  return { result, constructed };
}

test('QE5: a sum/under Tool and library scalar append no term to the rolled formula', async () => {
  const { constructed } = await sumUnderWithScalars(13);
  assert.deepEqual(constructed, ['2', '1d20'], 'the Tool scalar evaluates once; the check rolls bare');
});

test('QE5: the Tool and library scalars raise the target by 3 exactly once', async () => {
  const passed = (await sumUnderWithScalars(13)).result;
  assert.equal(passed.success, true, 'anchor + 3 passes');
  assert.deepEqual([passed.data.dc, passed.data.target, passed.data.margin], [10, 13, 0]);
  assert.equal((await sumUnderWithScalars(14)).result.success, false, 'anchor + 4 fails');
});

// ── salvage ───────────────────────────────────────────────────────────────────

const SALVAGE_GROUPS = [{ id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 1 }] }];
const SALVAGE_SITES = [
  { mode: 'simple', check: simpleCheck },
  { mode: 'routed', check: (evaluation) => ({ ...routedCheck(evaluation), relativeOutcomes: [{ ...TIERS[0], name: 'Fine' }] }) },
];

function salvageWorld(mode, config) {
  return salvageProbe({
    salvageResolutionMode: mode,
    salvageCraftingCheck: { [mode]: config, consumption: { consumeComponentOnFail: true } },
    resultGroups: SALVAGE_GROUPS,
    awardDifficulty: 1,
  });
}

for (const { mode, check } of SALVAGE_SITES) {
  test(`salvage ${mode}: a missing character path refuses with zero mutation`, async () => {
    const world = salvageWorld(mode, check(MISSING));
    const constructed = installCountingRoll();
    const result = await world.salvage();
    assert.equal(result.misconfigured, true);
    assert.equal(result.message, `Salvage ${UNRESOLVED}`);
    assert.deepEqual(result.data, { targetRefusal: 'unresolved-path' });
    assert.deepEqual(constructed, []);
    assert.deepEqual(effects(world.journal), []);

    const control = salvageWorld(mode, check(VALID));
    control.actor.system.skills = SKILLS;
    const controlRolls = installCountingRoll();
    const salvaged = await control.salvage();
    assert.equal(salvaged.misconfigured, undefined);
    assert.deepEqual(controlRolls, ['1d20']);
  });
}

test('salvage progressive: sum/under refuses with zero mutation, sum/over rolls once', async () => {
  const progressive = (evaluation) => ({ rollFormula: '1d20', evaluation });
  const world = salvageWorld('progressive', progressive(SUM_UNDER));
  const constructed = installCountingRoll();
  const result = await world.salvage();
  assert.equal(result.misconfigured, true);
  assert.equal(result.message, `Salvage ${PROGRESSIVE_UNDER}`);
  assert.deepEqual(result.data, { targetRefusal: 'progressive-under' });
  assert.deepEqual(constructed, []);
  assert.deepEqual(effects(world.journal), []);

  const control = salvageWorld('progressive', progressive(MISSING));
  const controlRolls = installCountingRoll();
  assert.equal((await control.salvage()).misconfigured, undefined);
  assert.deepEqual(controlRolls, ['1d20']);
});

test('bulk salvage: a refused row is misconfigured, rolls nothing and consumes nothing', async () => {
  const run = async (evaluation) => {
    const world = salvageWorld('simple', simpleCheck(evaluation));
    world.actor.system.skills = SKILLS;
    const system = globalThis.game.fabricate.getCraftingSystemManager().getSystem('sys-salvage');
    const posted = [];
    const service = new BulkSalvageService({
      salvage: (...args) => world.engine.salvage(...args),
      getCraftingSystem: () => system,
      postChatMessage: async (message) => posted.push(message),
    });
    const constructed = installCountingRoll();
    const outcome = await service.run({
      targets: [{ actorUuid: world.actor.uuid, actorId: world.actor.id, actorName: 'Salvager', systemId: 'sys-salvage', componentId: 'ore' }],
      interactive: false,
    });
    return { outcome, constructed, world };
  };
  const refused = await run(MISSING);
  assert.equal(refused.outcome.counts.misconfigured, 1);
  assert.deepEqual(refused.constructed, []);
  assert.deepEqual(effects(refused.world.journal), []);

  const control = await run(VALID);
  assert.equal(control.outcome.counts.misconfigured, 0);
  assert.deepEqual(control.constructed, ['1d20']);
});

// ── gathering ─────────────────────────────────────────────────────────────────

/** A real gathering attempt whose system check authors `check` for the task's `mode`. */
async function gatheringAttempt(mode, check, { skills = null } = {}) {
  const fixture = gatheringFixture({
    mode,
    resultGroups: [{ id: 'g-yield', name: 'Yield', results: [{ id: 'r-herb', componentId: 'herb', quantity: 1 }] }],
    components: [{ id: 'herb', name: 'Herb', difficulty: 1 }],
  });
  Object.assign(fixture.system.gatheringCraftingCheck[mode] ??= {}, check);
  const actor = new GatheringDocumentActor('Gatherer', { ownerIds: ['user-gathering'] });
  if (skills) actor.system = { skills };
  let constructed = [];
  const result = await runRealGatheringAttempt({
    ...fixture,
    actor,
    beforeStart: () => {
      constructed = installCountingRoll();
    },
  });
  return { ...result, constructed };
}

test('gathering routed: a missing character path answers CHECK_TARGET_INVALID before any roll', async () => {
  const refused = await gatheringAttempt('routed', { evaluation: MISSING });
  assert.equal(refused.response.accepted, false);
  assert.equal(refused.response.blockedReasons[0].data.code, 'CHECK_TARGET_INVALID');
  assert.deepEqual(refused.constructed, []);
  assert.equal(refused.runManagerCalls.createTerminalRun.length, 0);
  assert.equal(refused.actor.items.length, 0, 'nothing is awarded');

  const control = await gatheringAttempt('routed', { evaluation: VALID }, { skills: SKILLS });
  assert.equal(control.response.accepted, true);
  assert.deepEqual(control.constructed, ['1d20']);
});

test('gathering routed: a sum/under check grades under through the engine', async () => {
  const under = await gatheringAttempt('routed', {
    evaluation: { product: 'sum', direction: 'under', target: { source: 'fixed' } },
  });
  assert.equal(under.response.accepted, true);
  assert.equal(under.actor.items.length, 1, '12 ≤ 15 lands Yield; graded over it would miss to Ruined');
});

test('gathering progressive: sum/under answers CHECK_TARGET_INVALID before any roll', async () => {
  const progressive = { rollFormula: '1d20', checkBreakage: { triggers: [] } };
  const refused = await gatheringAttempt('progressive', { ...progressive, evaluation: SUM_UNDER });
  assert.equal(refused.response.accepted, false);
  assert.equal(refused.response.blockedReasons[0].data.code, 'CHECK_TARGET_INVALID');
  assert.deepEqual(refused.constructed, []);
  assert.equal(refused.actor.items.length, 0);

  const control = await gatheringAttempt('progressive', { ...progressive, evaluation: MISSING });
  assert.equal(control.response.accepted, true, 'a progressive target source is inert');
  assert.deepEqual(control.constructed, ['1d20']);
});

test('the gathering versioned descriptor refuses a target and captures a resolved one', () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  const describe = (evaluation, actor, mode = 'routed') => {
    Object.assign(system.gatheringCraftingCheck, {
      [mode]: { ...system.gatheringCraftingCheck.routed, evaluation },
    });
    return engine._versionedCheckDescriptor({
      actor,
      run: { taskId: task.id },
      system,
      environment,
      task: { ...task, resolutionMode: mode, adjustmentOverride: -2 },
    });
  };
  const bare = { uuid: 'Actor.g', system: {} };
  assert.throws(() => describe(MISSING, bare), {
    code: 'CHECK_TARGET_INVALID',
    message: `Gathering ${UNRESOLVED}`,
  });
  assert.throws(() => describe(SUM_UNDER, bare, 'progressive'), { code: 'CHECK_TARGET_INVALID' });

  const described = describe(VALID, { uuid: 'Actor.g', getRollData: () => ({ skills: SKILLS }) });
  const policy = described.privateEvaluation.decisionPolicy;
  assert.deepEqual([policy.dc, policy.target, policy.targetSource], [null, 12, 'attribute']);
  assert.equal(described.privateEvaluation.flavor, 'Forage — Gathering check', 'named at roll time');

  const fixed = describe(undefined, bare).privateEvaluation;
  assert.deepEqual(
    [fixed.decisionPolicy.dc, fixed.decisionPolicy.target, fixed.decisionPolicy.targetSource],
    [15, 15, 'fixed']
  );
  assert.equal(fixed.flavor, 'Forage — Gathering check (DC 15)');
});

test('the gathering versioned descriptor names a roll-under target and its character-value basis', () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  const describe = (evaluation, actor) => {
    Object.assign(system.gatheringCraftingCheck.routed, { evaluation });
    return engine._versionedCheckDescriptor({
      actor,
      run: { taskId: task.id },
      system,
      environment,
      task: { ...task, resolutionMode: 'routed', adjustmentOverride: -2 },
    }).publicPrompt;
  };

  const fixed = describe(SUM_UNDER, { uuid: 'Actor.g', system: {} });
  assert.deepEqual(
    [fixed.target, fixed.direction, fixed.comparison, fixed.targetBasis, fixed.toolBonus],
    [15, 'under', 'meet', null, 0],
    'the routed anchor names a roll-under target with no character-value basis'
  );

  const under = attribute('@skills.craft.value', { direction: 'under', adjustmentKind: 'add' });
  const named = describe(under, { uuid: 'Actor.g', getRollData: () => ({ skills: SKILLS }) });
  assert.equal(named.target, 12, '14 from @skills.craft.value, minus 2 from the task override');
  assert.equal(named.direction, 'under');
  assert.deepEqual(named.targetBasis, {
    expression: '@skills.craft.value',
    value: 14,
    adjustment: { kind: 'add', value: -2, label: '' },
  });
  assert.equal(named.toolBonus, 0, 'gathering has no tool-bonus seam');

  const over = describe({ product: 'sum', direction: 'over' }, { uuid: 'Actor.g', system: {} });
  assert.deepEqual(
    [over.target, over.direction, over.targetBasis],
    [15, 'over', undefined],
    'a roll-over check names its target but no roll-under basis'
  );
});

test('the gathering versioned descriptor keeps a hidden task and a fixed-range check silent', () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  Object.assign(system.gatheringCraftingCheck.routed, { evaluation: SUM_UNDER });
  const bare = { uuid: 'Actor.g', system: {} };

  const hiddenDescriptor = engine._versionedCheckDescriptor({
    actor: bare,
    run: { taskId: `blind:${environment.id}` },
    system,
    environment,
    task: { ...task, resolutionMode: 'routed' },
  });
  const hidden = hiddenDescriptor.publicPrompt;
  assert.equal(hidden.target, null, 'a hidden task names no target');
  assert.doesNotMatch(hiddenDescriptor.privateEvaluation.flavor, /Target|\d/, 'nor does its flavor');
  assert.equal(hidden.direction, null);
  assert.equal(hidden.comparison, null);
  assert.ok(!Object.hasOwn(hidden, 'targetBasis'), 'a hidden task carries no basis field either');

  const fixedRangeSystem = {
    ...system,
    gatheringCraftingCheck: {
      ...system.gatheringCraftingCheck,
      routed: { ...system.gatheringCraftingCheck.routed, type: 'fixed' },
    },
  };
  const fixedRangeDescriptor = engine._versionedCheckDescriptor({
    actor: bare,
    run: { taskId: task.id },
    system: fixedRangeSystem,
    environment,
    task: { ...task, resolutionMode: 'routed' },
  });
  const fixedRange = fixedRangeDescriptor.publicPrompt;
  assert.equal(fixedRange.target, null, 'a fixed-range routed check grades the raw roll, not a target');
  assert.doesNotMatch(fixedRangeDescriptor.privateEvaluation.flavor, /Target/);
  assert.equal(fixedRange.direction, null);
  assert.equal(fixedRange.comparison, null);
});

test('the gathering versioned descriptor names the formula and actor crafting names', () => {
  installCountingRoll();
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  Object.assign(system.gatheringCraftingCheck.routed, { rollFormula: '1d20', evaluation: SUM_UNDER });
  const actor = { uuid: 'Actor.g', name: 'Scavenger', system: {} };
  const describeAs = (run) =>
    engine._versionedCheckDescriptor({
      actor,
      run,
      system,
      environment,
      task: { ...task, resolutionMode: 'routed' },
    }).publicPrompt;

  const visible = describeAs({ taskId: task.id });
  assert.equal(visible.actorName, 'Scavenger');
  assert.deepEqual(
    [visible.formula, visible.resolvedFormula, visible.displayFormula],
    ['1d20', '1d20', '1d20'],
    'the retained formula reaches the prompt, resolved and displayed the same with nothing to expand'
  );

  const hidden = describeAs({ taskId: `blind:${environment.id}` });
  assert.equal(hidden.actorName, '', 'a hidden task names no actor either');
  assert.deepEqual(
    [hidden.formula, hidden.resolvedFormula, hidden.displayFormula],
    ['', null, ''],
    'a hidden task names no formula'
  );
});

test('the gathering versioned descriptor appends an active check modifier to formula and resolvedFormula, never displayFormula', () => {
  installCountingRoll();
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  system.modifiers = [{ id: 'knack', label: 'Knack', expression: '2' }];
  Object.assign(system.gatheringCraftingCheck.routed, { rollFormula: '1d20' });
  Object.assign(system.gatheringCraftingCheck, {
    defaultModifierPolicy: 'addAll',
    defaultModifierIds: ['knack'],
  });
  const publicPrompt = engine._versionedCheckDescriptor({
    actor: { uuid: 'Actor.g', system: {} },
    run: { taskId: task.id },
    system,
    environment,
    task: { ...task, resolutionMode: 'routed' },
  }).publicPrompt;
  assert.equal(publicPrompt.formula, '1d20 + 2[Modifiers]', 'the retained formula carries the applied modifier');
  assert.equal(
    publicPrompt.resolvedFormula,
    '1d20 + 2[Modifiers]',
    'the resolved formula also carries it, or the prompt would roll a term it never showed'
  );
  assert.equal(
    publicPrompt.displayFormula,
    '1d20',
    'the pre-modifier display formula names no applied modifier: it is itemised as a chip instead'
  );
});

test('the gathering versioned descriptor names an exceed threshold in its comparison', () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  Object.assign(system.gatheringCraftingCheck.routed, { thresholdMode: 'exceed' });
  const publicPrompt = engine._versionedCheckDescriptor({
    actor: { uuid: 'Actor.g', system: {} },
    run: { taskId: task.id },
    system,
    environment,
    task: { ...task, resolutionMode: 'routed' },
  }).publicPrompt;
  assert.equal(publicPrompt.comparison, 'exceed', 'an authored exceed threshold names exceed, not meet');
});

test('the gathering versioned descriptor grades a count evaluation with no dc or target', () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  Object.assign(system.gatheringCraftingCheck.routed, {
    evaluation: { product: 'count', direction: 'over', pool: { base: '3', threshold: '8', required: 2 } },
  });
  const described = engine._versionedCheckDescriptor({
    actor: { uuid: 'Actor.g', system: {} },
    run: { taskId: task.id },
    system,
    environment,
    task: { ...task, resolutionMode: 'routed' },
  });
  assert.equal(described.privateEvaluation.decisionPolicy.dc, null, 'a count check names no dc');
  assert.equal(described.privateEvaluation.decisionPolicy.target, null, 'and no target either');
});

test('the gathering versioned descriptor names no formula for a count check', () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  Object.assign(system.gatheringCraftingCheck.routed, {
    rollFormula: '1d20',
    evaluation: { product: 'count', direction: 'over', pool: { base: '3', threshold: '8' } },
  });
  const publicPrompt = engine._versionedCheckDescriptor({
    actor: { uuid: 'Actor.g', name: 'Scavenger', system: {} },
    run: { taskId: task.id },
    system,
    environment,
    task: { ...task, resolutionMode: 'routed' },
  }).publicPrompt;
  assert.deepEqual(
    [publicPrompt.formula, publicPrompt.resolvedFormula, publicPrompt.displayFormula],
    ['', null, ''],
    "a count check shows its pool line, per today's count prompt, never a formula"
  );
  assert.equal(publicPrompt.actorName, 'Scavenger', 'a count check still names the actor');
});

test('a Journal-prompted roll-under gathering check shows its target chip and roll-under help', async () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  Object.assign(system.gatheringCraftingCheck.routed, {
    evaluation: attribute('@skills.craft.value', { direction: 'under', adjustmentKind: 'add' }),
  });
  const descriptor = engine._versionedCheckDescriptor({
    actor: { uuid: 'Actor.g', name: 'Scavenger', getRollData: () => ({ skills: SKILLS }) },
    run: { taskId: task.id },
    system,
    environment,
    task: { ...task, resolutionMode: 'routed', adjustmentOverride: -2 },
  });
  const surface = stubPromptSurface(() => null);
  try {
    await promptJournalStageCheck({ subject: descriptor.publicPrompt.label, ...descriptor.publicPrompt });
  } finally {
    surface.restore();
  }
  const { chipText, source } = rollPromptTarget(surface.view, []);
  assert.equal(chipText, 'Target 12 · stay at or under');
  assert.equal(source, 'Scavenger @skills.craft.value 14 · difficulty −2', 'the ruled form');
  assert.equal(
    surface.view.labels.bonusHelp,
    'A bonus raises the target. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
  );
  assert.equal(surface.view.subtitle, 'Scavenger · Forage', 'the Journal subtitle names the actor and task');
  assert.equal(surface.view.formula, '1d20', 'the retained formula reaches the prompt untouched');
});

test('a Journal-prompted roll-high gathering check shows its DC chip, subtitle and formula', async () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  // The fixture's default routed check names a fixed DC 15, `meet`, and no evaluation override
  // (sum/over/fixed), so this is a roll-high (DC) check, not the roll-under case above.
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  const descriptor = engine._versionedCheckDescriptor({
    actor: { uuid: 'Actor.g', name: 'Scavenger', system: {} },
    run: { taskId: task.id },
    system,
    environment,
    task: { ...task, resolutionMode: 'routed' },
  });
  const surface = stubPromptSurface(() => null);
  try {
    await promptJournalStageCheck({ subject: descriptor.publicPrompt.label, ...descriptor.publicPrompt });
  } finally {
    surface.restore();
  }
  assert.equal(surface.view.subtitle, 'Scavenger · Forage', 'the Journal subtitle names the actor and task');
  assert.equal(surface.view.formula, '1d20', 'the retained formula reaches the prompt untouched');
  assert.equal(surface.view.chipText, 'DC 15 · meet or beat', 'a roll-high check still names its DC');
});

test('a Journal-prompted roll-high gathering check against a character value names its target, not a DC (G5)', async () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  Object.assign(system.gatheringCraftingCheck.routed, {
    evaluation: attribute('@skills.craft.value', { direction: 'over' }),
  });
  const descriptor = engine._versionedCheckDescriptor({
    actor: { uuid: 'Actor.g', name: 'Scavenger', getRollData: () => ({ skills: SKILLS }) },
    run: { taskId: task.id },
    system,
    environment,
    task: { ...task, resolutionMode: 'routed' },
  });
  assert.equal(descriptor.publicPrompt.targetSource, 'attribute');
  const surface = stubPromptSurface(() => null);
  try {
    await promptJournalStageCheck({ subject: descriptor.publicPrompt.label, ...descriptor.publicPrompt });
  } finally {
    surface.restore();
  }
  assert.equal(surface.view.chipText, 'Target 14 · meet or beat');
});

// ── the prepared evaluator ────────────────────────────────────────────────────

/** A `Roll` whose `1d20` shows 14, resolving `@path` from roll data as the engine's display does. */
function installPathRoll() {
  const resolve = (formula, data) =>
    String(formula).replaceAll(/@([\w.]+)/g, (_match, path) =>
      String(path.split('.').reduce((node, key) => node?.[key], data) ?? 'NaN')
    );
  globalThis.Roll = class PathRoll {
    constructor(formula, data = {}) {
      this.formula = resolve(formula, data);
      const extra = [...this.formula.matchAll(/[+-]\s*(\d+)(?![d\d])/g)].reduce(
        (sum, [term, value]) => sum + (term.startsWith('-') ? -1 : 1) * Number(value),
        0
      );
      this.total = 14 + extra;
      this.dice = [{ number: 1, faces: 20, total: 14, results: [{ result: 14 }] }];
    }
    async evaluate() {
      return this;
    }
    evaluateSync() {
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
    async toMessage() {}
    static replaceFormulaData(formula, data) {
      return resolve(formula, data);
    }
    static validate() {
      return true;
    }
  };
}

/** A Journal (prepared) pass/fail check typed as `rollFormula`, rolled for Sera's Smithing 12. */
async function preparedTyped(rollFormula) {
  installPathRoll();
  const actor = { name: 'Sera Vane', getRollData: () => ({ skills: { smith: { level: 12 } } }) };
  try {
    return await evaluatePreparedRunCheck(
      {
        mode: 'simple',
        slot: 'simple',
        rollFormula,
        checkConfig: { rollFormula, thresholdMode: 'meet', dc: 20 },
        decisionPolicy: { target: 20 },
      },
      actor,
      { rollMode: 'publicroll' }
    );
  } finally {
    delete globalThis.Roll;
  }
}

test('a Journal check records its typed formula, and its dice line names the path (QE r3 1)', async () => {
  const result = await preparedTyped('1d20 + @skills.smith.level');
  assert.equal(result.data.rollFormula, '1d20 + @skills.smith.level');
  const line = checkDiceLine(executedCheckDisplay(result), shippedLocalize);
  assert.ok(line.includes('12 @skills.smith.level'), line);
});

test('the typed formula is recorded after the retired-placeholder shim (QE r3 3)', async () => {
  const prepared = await preparedTyped('1d20 + @craftingmod + @skills.smith.level');
  assert.equal(prepared.data.rollFormula, '1d20 + @skills.smith.level');
  const line = checkDiceLine(executedCheckDisplay(prepared), shippedLocalize);
  assert.equal(line, '1d20 (14) + 12 @skills.smith.level = 26');
  installPathRoll();
  try {
    const direct = await runFormulaPassFail({
      formula: '1d20 + @craftingmod + @skills.smith.level',
      dc: 20,
      thresholdMode: 'meet',
      triggers: [],
      actor: { getRollData: () => ({ skills: { smith: { level: 12 } } }) },
    });
    assert.equal(direct.data.formula, '1d20 + @skills.smith.level');
    assert.equal(
      checkDiceLine(executedCheckDisplay(direct), shippedLocalize),
      '1d20 (14) + 12 @skills.smith.level = 26'
    );
    const routed = await runFormulaRouted({
      formula: '1d20 + @craftingmod + @skills.smith.level',
      dc: 20,
      thresholdMode: 'meet',
      type: 'relative',
      relativeOutcomes: [],
      fixedOutcomes: [],
      triggers: [],
      actor: { getRollData: () => ({ skills: { smith: { level: 12 } } }) },
    });
    assert.equal(routed.data.formula, '1d20 + @skills.smith.level');
  } finally {
    delete globalThis.Roll;
  }
});

test('the prepared evaluator refuses progressive sum/under before any roll', async () => {
  const constructed = installCountingRoll();
  const prepared = (evaluation) => ({
    mode: 'progressive',
    slot: 'progressive',
    rollFormula: '1d20',
    checkConfig: { rollFormula: '1d20', evaluation },
    decisionPolicy: {},
  });
  const refused = await evaluatePreparedRunCheck(prepared(SUM_UNDER), { getRollData: () => ({}) });
  assert.equal(refused.misconfigured, true);
  assert.deepEqual(refused.data, { targetRefusal: 'progressive-under' });
  assert.equal(refused.message, `Crafting ${PROGRESSIVE_UNDER}`, 'the activity, not "Prepared"');
  const gathering = new GatheringEngine({ localize: (key) => key });
  gathering.installVersionedRunAuthority({ evaluatePreparedRunCheck });
  const gathered = await gathering.evaluatePreparedVersionedCheck({
    actor: { getRollData: () => ({}) },
    privateEvaluation: prepared(SUM_UNDER),
  });
  assert.equal(gathered.message, `Gathering ${PROGRESSIVE_UNDER}`);
  assert.deepEqual(constructed, []);
});

// ── executed target terms (issue 2005) ─────────────────────────────────────────

/** A `Roll` whose `1d4` pre-roll totals 3 and whose main `3d6` totals 9; a constant totals itself. */
function installVerificationRoll() {
  globalThis.Roll = class VerificationRoll {
    constructor(formula) {
      this.formula = String(formula);
      const constant = Number(this.formula);
      if (Number.isFinite(constant)) this.total = constant;
      else this.total = this.formula === '1d4' ? 3 : 9;
      this.dice = Number.isFinite(constant) ? [] : [{ number: 1, faces: 4, total: this.total }];
    }
    async evaluate() {
      return this;
    }
    evaluateSync() {
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
    async toMessage() {}
    static replaceFormulaData(formula) {
      return formula;
    }
    static validate() {
      return true;
    }
  };
}

test('attribute 12, adjustment −2, library +1 and a situational 1d4 of 3 grade 3d6 = 9 against 14', async () => {
  installVerificationRoll();
  const world = salvageWorld('simple', {
    rollFormula: '3d6',
    evaluation: attribute('@skills.craft.value', { direction: 'under' }),
  });
  const system = game.fabricate.getCraftingSystemManager().getSystem('sys-salvage');
  system.modifiers = [{ id: 'steady', label: 'Steady hands', expression: '1' }];
  system.salvageCraftingCheck.defaultModifierIds = ['steady'];
  system.components[0].salvage.adjustmentOverride = -2;
  world.actor.system.skills = { craft: { value: 12 } };
  const checks = [];
  const cards = [];
  const run = world.engine._runSalvageCraftingCheck.bind(world.engine);
  world.engine._runSalvageCraftingCheck = async (...args) => {
    checks.push(await run(...args));
    return checks.at(-1);
  };
  const post = world.engine._postSalvageChatMessage.bind(world.engine);
  world.engine._postSalvageChatMessage = async (params) => {
    cards.push(params.check);
    return post(params);
  };

  await world.salvage({ interactive: true, rollDecision: { bonus: '1d4' } });

  const { data, visibility } = checks[0];
  assert.deepEqual([data.total, data.target, data.margin], [9, 14, 5]);
  assert.deepEqual(data.targetTerms, [
    { kind: 'anchor', value: 12 },
    { kind: 'adjustment', value: -2 },
    { kind: 'benefit', value: 1, source: 'library' },
  ]);
  assert.deepEqual(
    data.preRolls.map(({ source, total }) => [source, total]),
    [['situational', 3]],
    'one pre-roll'
  );
  assert.equal(foldTargetTerms(data.targetTerms, data.preRolls), data.target);
  assert.deepEqual(visibility, { rollMode: 'publicroll', secret: false });
  assert.equal(cards[0].evidence.target, 14, 'the card reads the executed target');
  assert.deepEqual(cards[0].visibility, { rollMode: 'publicroll', secret: false });
  delete globalThis.Roll;
});

test('a sum/over fixed check records no target terms', async () => {
  installVerificationRoll();
  const world = salvageWorld('simple', { rollFormula: '3d6', dc: 8 });
  const checks = [];
  const run = world.engine._runSalvageCraftingCheck.bind(world.engine);
  world.engine._runSalvageCraftingCheck = async (...args) => {
    checks.push(await run(...args));
    return checks.at(-1);
  };
  await world.salvage();
  assert.equal(checks[0].data.target, 8);
  assert.ok(!Object.hasOwn(checks[0].data, 'targetTerms'));
  delete globalThis.Roll;
});

test('the gathering evaluator hands back no executed visibility, which its run would persist', async () => {
  installCountingRoll();
  const prepared = {
    mode: 'routedByCheck',
    slot: 'routed',
    rollFormula: '1d20',
    checkConfig: { rollFormula: '1d20', type: 'relative', relativeOutcomes: TIERS },
    decisionPolicy: { target: 10, targetSource: 'fixed' },
  };
  const crafted = await evaluatePreparedRunCheck(prepared, { getRollData: () => ({}) });
  assert.deepEqual(crafted.visibility, { rollMode: 'selfroll', secret: false });
  const gathering = new GatheringEngine({ localize: (key) => key });
  gathering.installVersionedRunAuthority({ evaluatePreparedRunCheck });
  const gathered = await gathering.evaluatePreparedVersionedCheck({
    actor: { getRollData: () => ({}) },
    privateEvaluation: prepared,
  });
  assert.equal(gathered.success, true);
  assert.ok(!Object.hasOwn(gathered, 'visibility'));
  delete globalThis.Roll;
});

test('the ordinary engine prompt carries the check offer, and the prompt view keeps it (issue 2005)', async () => {
  const offered = async (offerSituationalBonus) => {
    const surface = stubPromptSurface(() => null);
    try {
      const config = { ...simpleCheck(SUM_UNDER), ...(offerSituationalBonus === false && { offerSituationalBonus }) };
      const world = craftingWorld({ resolutionMode: 'simple', slot: 'simple', config });
      installCountingRoll();
      await world.engine._runCraftingCheck(
        world.recipe, world.craftingActor, [world.sourceActor], null, null, { interactive: true }
      );
      return surface.view.offerSituationalBonus;
    } finally {
      surface.restore();
    }
  };
  assert.equal(await offered(false), false, 'an offer-false check hides the field');
  assert.equal(await offered(undefined), true, 'positive control');
  delete globalThis.Roll;
});
