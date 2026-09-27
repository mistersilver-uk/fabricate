/**
 * Issue 2003 — the activity adapters resolve and validate a check's target before any Fabricate
 * roll (QE3). Every cell drives a real engine entry point with a counting `Roll` and asserts the
 * refusal, zero rolls (Tool dice included) and zero effects, then a positive control that rolls once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { craftProbe, probeResolutionService, salvageProbe } from './helpers/craftPipelineProbe.js';
import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { evaluatePreparedRunCheck } from '../src/systems/checkRoll.js';
import { MacroExecutor } from '../src/utils/MacroExecutor.js';
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

/** Journal entries that consume, spend, award or post. */
const EFFECT = /^(item\.|actor\.|chat\.|currency\.|itemPiles\.deduct|complication\.)/;
const effects = (journal) => journal.entries.filter(([name]) => EFFECT.test(name));

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
    assert.equal(result.message, 'Crafting check target is invalid (unresolved-path)');
    assert.equal(checks[0].misconfigured, true);
    assert.deepEqual(checks[0].data, { targetRefusal: 'unresolved-path' });
    assert.deepEqual(constructed, [], 'no Tool die and no check roll');
    assert.deepEqual(effects(world.journal), []);
  });

  test(`${site.name}: a resolvable character value rolls the check exactly once`, async () => {
    const world = craftingWorld({ ...site, config: site.config(VALID) });
    world.craftingActor.system.skills = SKILLS;
    const checks = recordChecks(world.engine);
    const constructed = installCountingRoll();
    await world.craft();
    assert.equal(checks[0].misconfigured, undefined);
    assert.equal(checks[0].data.dc, 14, 'graded against the character value, not the DC of 10');
    assert.deepEqual(constructed, ['1d4', '1d20 + 12[Hammer]']);
  });
}

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
    assert.equal(control.result.data.dc, 14);
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

test('a count evaluation stays inert: its fixed DC grades and progressive count/under rolls', async () => {
  const count = { product: 'count', direction: 'under', target: { source: 'attribute' } };
  const simple = craftingWorld({ resolutionMode: 'simple', slot: 'simple', config: simpleCheck(count) });
  const simpleRolls = installCountingRoll();
  const passFail = await simple.engine._runCraftingCheck(
    simple.recipe, simple.craftingActor, [simple.sourceActor], null, null, {}
  );
  assert.equal(passFail.data.dc, 10);
  assert.deepEqual(simpleRolls, ['1d20']);

  const progressive = craftingWorld({
    resolutionMode: 'progressive',
    slot: 'progressive',
    config: { rollFormula: '1d20', evaluation: count },
  });
  const progressiveRolls = installCountingRoll();
  const rolled = await progressive.engine._runCraftingCheck(
    progressive.recipe, progressive.craftingActor, [progressive.sourceActor], null, null, {}
  );
  assert.equal(rolled.misconfigured, undefined);
  assert.deepEqual(progressiveRolls, ['1d20']);
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
  assert.equal(finished.message, 'Crafting check target is invalid (unresolved-path)');
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
    assert.equal(result.data.dc, 15, 'the truncated macro result replaces the anchor');

    MacroExecutor.run = async () => {
      throw new Error('boom');
    };
    const fallback = await world.engine._runCraftingCheck(
      world.recipe, world.craftingActor, [world.sourceActor], null, null, {}
    );
    assert.equal(fallback.data.dc, 12, 'a failed macro keeps the adjusted anchor');
  } finally {
    MacroExecutor.run = original;
  }
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

test(
  'QE5: the Tool and library scalars raise the target by 3 exactly once',
  { todo: 'Task 3 of issue 2003 activates direction-aware grading' },
  async () => {
    assert.equal((await sumUnderWithScalars(13)).result.success, true, 'anchor + 3 passes');
    assert.equal((await sumUnderWithScalars(14)).result.success, false, 'anchor + 4 fails');
  }
);

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
    assert.equal(result.message, 'Salvage check target is invalid (unresolved-path)');
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
  assert.equal(result.message, 'Salvage check target is invalid (progressive-under)');
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
  assert.throws(() => describe(MISSING, bare), { code: 'CHECK_TARGET_INVALID' });
  assert.throws(() => describe(SUM_UNDER, bare, 'progressive'), { code: 'CHECK_TARGET_INVALID' });

  const described = describe(VALID, { uuid: 'Actor.g', getRollData: () => ({ skills: SKILLS }) });
  const policy = described.privateEvaluation.decisionPolicy;
  assert.deepEqual([policy.dc, policy.target, policy.targetSource], [null, 12, 'attribute']);
  assert.equal(described.privateEvaluation.flavor, 'Forage — Gathering check');

  const fixed = describe(undefined, bare).privateEvaluation;
  assert.deepEqual(
    [fixed.decisionPolicy.dc, fixed.decisionPolicy.target, fixed.decisionPolicy.targetSource],
    [15, 15, 'fixed']
  );
  assert.equal(fixed.flavor, 'Forage — Gathering check (DC 15)');
});

// ── the prepared evaluator ────────────────────────────────────────────────────

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
  assert.deepEqual(constructed, []);

  const count = await evaluatePreparedRunCheck(
    prepared({ product: 'count', direction: 'under' }),
    { getRollData: () => ({}) }
  );
  assert.equal(count.misconfigured, undefined, 'count/under progressive still rolls');
  assert.deepEqual(constructed, ['1d20']);
});
