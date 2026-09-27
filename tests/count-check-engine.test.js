/**
 * Issue 2004 — a success-counting check through the real engine entry points. The activity
 * adapters validate the pool before any Tool or modifier roll (QE3), then roll the registered
 * count Roll once over the core-faithful double, so every construction, Tool die included, is
 * counted and nothing is overridden but the recorder `_runCraftingCheck` passes through.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { craftProbe, probeResolutionService, salvageProbe } from './helpers/craftPipelineProbe.js';
import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation, preparedCountCheck } from './helpers/countFixtures.js';
import { createLangBackedI18n } from './helpers/langBackedI18n.js';
import {
  GatheringDocumentActor,
  gatheringFixture,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';
import { repoRoot } from './helpers/sourceScan.js';
import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import {
  evaluatePreparedRunCheck,
  postCheckRollHandoff,
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';
import {
  resolveActiveCraftingCheckFormula,
  resolveActiveGatheringCheckFormula,
  resolveActiveSalvageCheckFormula,
} from '../src/systems/checkModifierResolver.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { refusalMessage } from '../src/systems/checkTarget.js';
import { resolveSalvageCheck } from '../src/systems/salvageCheckUsability.js';
import { evaluateSystemValidation } from '../src/systems/systemValidation.js';
import { evaluateCheckBreakage } from '../src/toolBreakageRuntime.js';
import { MacroExecutor } from '../src/utils/MacroExecutor.js';

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
const MISSING = '@skills.missing.value';
const cannotRoll = (label, detail) => `${label} check cannot roll: ${detail}.`;
const THRESHOLD_MISSING = `its success threshold reads ${MISSING}, which this character does not have`;

/** Relative count tiers against a required count of 1: Fine needs 1, Botch 0. */
const TIERS = [
  { id: 't-fine', name: 'Fine', success: true, breakTools: false, dc: 0 },
  { id: 't-botch', name: 'Botch', success: false, breakTools: false, dc: -1 },
];

const simpleCheck = (evaluation, extra = {}) => ({ rollFormula: '', dc: 10, evaluation, ...extra });
const routedCheck = (evaluation, extra = {}) => ({
  rollFormula: '',
  dc: 10,
  thresholdMode: 'meet',
  type: 'relative',
  relativeOutcomes: TIERS,
  fixedOutcomes: [],
  evaluation,
  ...extra,
});
const progressiveCheck = (evaluation) => ({
  rollFormula: '',
  evaluation,
  checkBreakage: { triggers: [] },
});

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

/** Runs `body` with the count dice installed over the probe's own chat double. */
async function withDice(faces, body) {
  const dice = installCountDice({ faces, chat: false });
  try {
    return await body(dice);
  } finally {
    dice.restore();
  }
}

const CRAFT_SITES = [
  { name: 'crafting simple', resolutionMode: 'simple', slot: 'simple', config: simpleCheck },
  {
    name: 'routed-by-ingredients optional check',
    resolutionMode: 'routedByIngredients',
    slot: 'simple',
    config: simpleCheck,
  },
  { name: 'routedByCheck', resolutionMode: 'routedByCheck', slot: 'routed', config: routedCheck },
  {
    name: 'crafting progressive',
    resolutionMode: 'progressive',
    slot: 'progressive',
    config: progressiveCheck,
  },
];

for (const site of CRAFT_SITES) {
  test(`${site.name}: a threshold path the character lacks refuses before any roll or effect`, async () => {
    // Read as 0, the threshold would qualify every die, so only the refusal stops a pass.
    const world = craftingWorld({
      ...site,
      config: site.config(countEvaluation({ threshold: MISSING })),
    });
    const checks = recordChecks(world.engine);
    await withDice([], async (dice) => {
      const result = await world.craft();
      assert.equal(result.success, false);
      assert.equal(result.message, cannotRoll('Crafting', THRESHOLD_MISSING));
      assert.deepEqual(
        [result.misconfigured, result.data],
        [true, { targetRefusal: 'unresolved-path', refusedInput: 'threshold' }],
        'craft() carries the refusal, its reason and the input it names'
      );
      assert.deepEqual(checks[0].data, { targetRefusal: 'unresolved-path', refusedInput: 'threshold' });
      assert.deepEqual(dice.constructed, [], 'no Tool die and no count roll');
      assert.deepEqual(effects(world.journal), []);
      assert.deepEqual(
        world.journal.entries.map(([name]) => name),
        REFUSED_CRAFT_JOURNAL,
        'the run it opened is discarded, not kept'
      );
    });
  });

  test(`${site.name}: an empty retained formula rolls the count check exactly once`, async () => {
    const world = craftingWorld({ ...site, config: site.config(countEvaluation()) });
    const checks = recordChecks(world.engine);
    // The Tool 1d4 shows 1, adding one die to the base 2: 9 and 8 qualify, 4 does not.
    await withDice([1, 9, 4, 8], async (dice) => {
      await world.craft();
      assert.equal(checks[0].misconfigured, undefined);
      assert.deepEqual(dice.evaluated, [
        { formula: '1d4', kind: 'EngineRoll' },
        { formula: '3d10', kind: 'FabricateCountRoll' },
      ]);
      assert.deepEqual(
        [checks[0].data.product, checks[0].data.total, checks[0].data.successes],
        ['count', 2, 2],
        'the net is graded, never a total of 0'
      );
    });
  });
}

for (const checkMode of ['simple', 'tiered']) {
  test(`alchemy ${checkMode}: a count refusal precedes the Tool roll and a valid pool rolls once`, async () => {
    const slot = checkMode === 'simple' ? 'simple' : 'routed';
    const config = checkMode === 'simple' ? simpleCheck : routedCheck;
    const run = (evaluation, faces) =>
      withDice(faces, async (dice) => {
        const world = craftingWorld({
          resolutionMode: 'alchemy',
          slot,
          config: config(evaluation),
          alchemy: { checkMode },
        });
        const toolItems = [
          {
            tool: HAMMER,
            contributionInput: world.engine.recipeManager.resolveToolStates(world.recipe, [
              HAMMER,
            ])[0].contributionInput,
          },
        ];
        const result = await world.engine._runCraftingCheck(
          world.recipe,
          world.craftingActor,
          [world.sourceActor],
          null,
          null,
          { toolItems }
        );
        return { result, formulas: dice.formulas(), constructed: dice.constructed, world };
      });
    const refused = await run(countEvaluation({ threshold: MISSING }), []);
    assert.deepEqual(refused.result.data, {
      targetRefusal: 'unresolved-path',
      refusedInput: 'threshold',
    });
    assert.deepEqual(refused.constructed, []);
    assert.deepEqual(effects(refused.world.journal), []);

    const control = await run(countEvaluation(), [1, 9, 4, 8]);
    assert.deepEqual(control.formulas, ['1d4', '3d10']);
    assert.equal(control.result.data.total, 2);
  });
}

test('crafting simple: each count refusal names its reason, its input and, for a path, the path', async () => {
  const cases = [
    [{ base: MISSING }, 'unresolved-path', 'base', `its dice pool reads ${MISSING}, which this character does not have`],
    [{ base: '' }, 'expression-missing', 'base', 'its dice pool is blank'],
    [{ base: '2 +' }, 'invalid', 'base', 'its dice pool cannot be read as a number'],
    [{ base: '1 / 0' }, 'non-finite', 'base', 'its dice pool did not resolve to a number'],
    [{ threshold: '1d4' }, 'dice', 'threshold', 'its success threshold rolls dice, but a threshold must be a fixed number'],
    [
      { explode: { enabled: true, faces: { kind: 'from', value: null }, once: false } },
      'faces-invalid',
      'explode',
      'the face its dice explode on is not set',
    ],
    [
      { cancel: { enabled: true, faces: { kind: 'from', value: null } } },
      'faces-invalid',
      'cancel',
      'the face that cancels a success is not set',
    ],
    [
      { explode: { enabled: true, faces: { kind: 'from', value: 1 }, once: false } },
      'explode-unbounded',
      'explode',
      'its dice would explode past the most Foundry can roll at once',
    ],
  ];
  for (const [pool, reason, refusedInput, detail] of cases) {
    const world = craftingWorld({
      resolutionMode: 'simple',
      slot: 'simple',
      config: simpleCheck(countEvaluation(pool)),
    });
    await withDice([], async (dice) => {
      const result = await world.craft();
      assert.deepEqual(result.data, { targetRefusal: reason, refusedInput }, reason);
      assert.equal(result.message, cannotRoll('Crafting', detail), reason);
      assert.deepEqual(dice.constructed, [], reason);
      assert.deepEqual(effects(world.journal), [], reason);
    });
  }
});

test('a pool path the character lacks refuses rather than failing as a zero pool', async () => {
  for (const zeroPoolFails of [true, false]) {
    // Read as 0, the pool would be a zero-pool failure, or, with zeroPoolFails off, one die.
    const world = craftingWorld({
      resolutionMode: 'simple',
      slot: 'simple',
      config: simpleCheck(countEvaluation({ base: MISSING, zeroPoolFails })),
    });
    const checks = recordChecks(world.engine);
    await withDice([], async (dice) => {
      await world.craft();
      assert.deepEqual(checks[0].data, { targetRefusal: 'unresolved-path', refusedInput: 'base' });
      assert.equal(checks[0].data.zeroPool, undefined, `${zeroPoolFails}: not a zero-pool failure`);
      assert.deepEqual(dice.constructed, [], `${zeroPoolFails}: zero Rolls constructed`);
    });
  }
});

test('the runner refuses a die below two faces, which the normalizer never stores', async () => {
  await withDice([], async (dice) => {
    const result = await runFormulaPassFail({
      formula: '',
      dc: 1,
      actor: { system: {} },
      label: 'Salvage',
      evaluation: { ...countEvaluation(), pool: { ...countEvaluation().pool, die: 1 } },
    });
    assert.deepEqual(result.data, { targetRefusal: 'die-invalid', refusedInput: 'die' });
    assert.equal(result.message, cannotRoll('Salvage', 'its die needs at least two faces'));
    assert.deepEqual(dice.constructed, []);
  });
});

// ── timed FINISH ──────────────────────────────────────────────────────────────

test('timed FINISH: a count refusal rolls and awards nothing and leaves the run resumable', async () => {
  const world = craftProbe({
    features: { craftingChecks: true },
    craftingCheck: {
      enabled: true,
      consumption: {},
      simple: simpleCheck(countEvaluation({ threshold: '@skills.craft.value' })),
    },
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
  await withDice([2, 3], async (dice) => {
    await world.craft();
    const { id: runId } = world.runManager.getActiveRuns(world.craftingActor)[0];
    world.advanceClock(3600);
    const startEffects = effects(world.journal).length;
    const finished = await world.craft(null, { runId });
    assert.equal(
      finished.message,
      cannotRoll(
        'Crafting',
        'its success threshold reads @skills.craft.value, which this character does not have'
      )
    );
    assert.deepEqual(
      [finished.misconfigured, finished.data],
      [true, { targetRefusal: 'unresolved-path', refusedInput: 'threshold' }]
    );
    assert.deepEqual(dice.constructed, []);
    assert.equal(effects(world.journal).length, startEffects, 'FINISH awards, spends and posts nothing');
    assert.equal(world.runManager.getActiveRuns(world.craftingActor)[0]?.id, runId, 'resumable');

    world.craftingActor.system.skills = { craft: { value: 8 } };
    const resumed = await world.craft(null, { runId });
    assert.equal(resumed.message, 'Crafting check failed', 'faces 2 and 3 miss a threshold of 8');
    assert.deepEqual(dice.formulas(), ['2d10'], 'the resumed FINISH rolls once');
    assert.equal(effects(world.journal).length > startEffects, true, 'the failure is recorded');
    assert.deepEqual(world.runManager.getActiveRuns(world.craftingActor), []);
  });
});

// ── salvage and bulk salvage ──────────────────────────────────────────────────

const SALVAGE_GROUPS = [
  { id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 1 }] },
];

function salvageWorld(mode, config) {
  return salvageProbe({
    salvageResolutionMode: mode,
    salvageCraftingCheck: { [mode]: config, consumption: { consumeComponentOnFail: true } },
    resultGroups: SALVAGE_GROUPS,
    awardDifficulty: 1,
  });
}

const SALVAGE_SITES = [
  { mode: 'simple', check: simpleCheck },
  {
    mode: 'routed',
    check: (evaluation) => routedCheck(evaluation, { relativeOutcomes: [{ ...TIERS[0] }] }),
  },
  { mode: 'progressive', check: progressiveCheck },
];

for (const { mode, check } of SALVAGE_SITES) {
  test(`salvage ${mode}: a count refusal consumes nothing, and a valid pool rolls once`, async () => {
    const world = salvageWorld(mode, check(countEvaluation({ threshold: MISSING })));
    await withDice([], async (dice) => {
      const result = await world.salvage();
      assert.equal(result.misconfigured, true);
      assert.equal(result.message, cannotRoll('Salvage', THRESHOLD_MISSING));
      assert.deepEqual(result.data, { targetRefusal: 'unresolved-path', refusedInput: 'threshold' });
      assert.deepEqual(dice.constructed, []);
      assert.deepEqual(effects(world.journal), []);
    });

    const control = salvageWorld(mode, check(countEvaluation()));
    await withDice([9, 3], async (dice) => {
      const salvaged = await control.salvage();
      assert.equal(salvaged.misconfigured, undefined);
      assert.deepEqual(dice.formulas(), ['2d10']);
    });
  });
}

test('bulk salvage: a refused count row is misconfigured, rolls nothing and consumes nothing', async () => {
  const run = (threshold, faces) =>
    withDice(faces, async (dice) => {
      const world = salvageWorld('simple', simpleCheck(countEvaluation({ threshold })));
      const system = globalThis.game.fabricate.getCraftingSystemManager().getSystem('sys-salvage');
      const service = new BulkSalvageService({
        salvage: (...args) => world.engine.salvage(...args),
        getCraftingSystem: () => system,
        postChatMessage: async () => {},
      });
      const outcome = await service.run({
        targets: [
          {
            actorUuid: world.actor.uuid,
            actorId: world.actor.id,
            actorName: 'Salvager',
            systemId: 'sys-salvage',
            componentId: 'ore',
          },
        ],
        interactive: false,
      });
      return { outcome, formulas: dice.formulas(), constructed: dice.constructed, world };
    });
  const refused = await run(MISSING, []);
  assert.equal(refused.outcome.counts.misconfigured, 1);
  assert.deepEqual(refused.constructed, []);
  assert.deepEqual(effects(refused.world.journal), []);

  const control = await run('8', [9, 3]);
  assert.equal(control.outcome.counts.misconfigured, 0);
  assert.deepEqual(control.formulas, ['2d10']);
});

test('bulk salvage offers no advantage over a count check whose retained formula is a d20', async () => {
  const prompts = [];
  const world = salvageWorld('simple', simpleCheck(countEvaluation(), { rollFormula: '1d20' }));
  const system = globalThis.game.fabricate.getCraftingSystemManager().getSystem('sys-salvage');
  const service = new BulkSalvageService({
    salvage: async () => ({ success: true }),
    getCraftingSystem: () => system,
    promptRollDecision: async (input) => {
      prompts.push(input);
      return { confirmed: false };
    },
  });
  await service._resolveRollDecision(
    [{ system, component: {}, item: { actorName: 'Salvager', name: 'Ore' } }],
    true
  );
  assert.equal(prompts[0].allowAdvantage, false);
  assert.equal(world.engine instanceof CraftingEngine, true);
});

// ── gathering ─────────────────────────────────────────────────────────────────

/** A real gathering attempt whose system check authors `check` for the task's `mode`. */
async function gatheringAttempt(mode, check, { faces = [], skills = null, task = {} } = {}) {
  const fixture = gatheringFixture({
    mode,
    resultGroups: [
      { id: 'g-yield', name: 'Fine', results: [{ id: 'r-herb', componentId: 'herb', quantity: 1 }] },
    ],
    components: [{ id: 'herb', name: 'Herb', difficulty: 1 }],
  });
  fixture.system.gatheringCraftingCheck[mode] = check;
  Object.assign(fixture.environment.tasks[0], task);
  const actor = new GatheringDocumentActor('Gatherer', { ownerIds: ['user-gathering'] });
  if (skills) actor.system = { skills };
  let dice = null;
  try {
    const result = await runRealGatheringAttempt({
      ...fixture,
      actor,
      beforeStart: () => {
        dice = installCountDice({ faces, chat: false });
      },
    });
    return { ...result, formulas: dice.formulas(), constructed: dice.constructed };
  } finally {
    delete globalThis.CONFIG;
  }
}

test('gathering routed: a count refusal answers CHECK_TARGET_INVALID before any roll', async () => {
  const refused = await gatheringAttempt('routed', routedCheck(countEvaluation({ threshold: MISSING })));
  assert.equal(refused.response.accepted, false);
  assert.equal(refused.response.blockedReasons[0].data.code, 'CHECK_TARGET_INVALID');
  assert.deepEqual(refused.constructed, []);
  assert.equal(refused.runManagerCalls.createTerminalRun.length, 0);
  assert.equal(refused.actor.items.length, 0, 'nothing is awarded');

  const control = await gatheringAttempt('routed', routedCheck(countEvaluation()), {
    faces: [9, 3],
  });
  assert.equal(control.response.accepted, true);
  assert.deepEqual(control.formulas, ['2d10']);
  assert.equal(control.actor.items.length, 1, 'one success meets Fine');
});

test('gathering legacy progressive executes count: a refusal before any roll, else one roll', async () => {
  const refused = await gatheringAttempt(
    'progressive',
    progressiveCheck(countEvaluation({ base: MISSING }))
  );
  assert.equal(refused.response.accepted, false);
  assert.equal(refused.response.blockedReasons[0].data.code, 'CHECK_TARGET_INVALID');
  assert.deepEqual(refused.constructed, []);

  const control = await gatheringAttempt('progressive', progressiveCheck(countEvaluation()), {
    faces: [9, 3],
  });
  assert.equal(control.response.accepted, true);
  assert.deepEqual(control.formulas, ['2d10']);
  assert.equal(control.actor.items.length, 1, 'a budget of one awards the difficulty-1 herb');
});

test('gathering legacy progressive: a pool above 999 dice refuses at settlement, never a failed attempt', async () => {
  const refused = await gatheringAttempt('progressive', progressiveCheck(countEvaluation({ base: '1000' })));
  assert.equal(refused.response.accepted, false);
  assert.equal(refused.response.blockedReasons[0].data.code, 'CHECK_TARGET_INVALID');
  assert.deepEqual(refused.constructed, []);
  assert.equal(refused.runManagerCalls.createTerminalRun.length, 0);
});

test('the gathering descriptor refuses a count pool and captures its resolved policy', () => {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  const describe = (evaluation, actor, mode = 'routed', taskFields = {}) => {
    system.gatheringCraftingCheck[mode] = routedCheck(evaluation, { rollFormula: '1d20' });
    return engine._versionedCheckDescriptor({
      actor,
      run: { taskId: task.id },
      system,
      environment,
      task: { ...task, resolutionMode: mode, ...taskFields },
    });
  };
  const bare = { uuid: 'Actor.g', system: {} };
  assert.throws(() => describe(countEvaluation({ threshold: MISSING }), bare), {
    code: 'CHECK_TARGET_INVALID',
    message: cannotRoll('Gathering', THRESHOLD_MISSING),
  });
  assert.throws(
    () => describe(countEvaluation({ base: MISSING }), bare, 'progressive'),
    { code: 'CHECK_TARGET_INVALID' }
  );

  const actor = { uuid: 'Actor.g', getRollData: () => ({ skills: { craft: { value: 4 } } }) };
  const described = describe(
    countEvaluation({ base: '@skills.craft.value', direction: 'under', required: 3 }),
    actor,
    'routed',
    { successesOverride: 0 }
  );
  const { dc, target, targetSource, count } = described.privateEvaluation.decisionPolicy;
  assert.deepEqual([dc, target, targetSource], [null, null, null], 'no DC or target for count');
  assert.deepEqual(count, {
    die: 10,
    direction: 'under',
    base: 4,
    threshold: 8,
    required: 0,
    comparison: 'meet',
    explode: countEvaluation().pool.explode,
    cancel: countEvaluation().pool.cancel,
    zeroPoolFails: true,
    modifierDestination: 'pool',
  });
  assert.equal(described.publicPrompt.allowAdvantage, false, 'the retained 1d20 offers none');
  assert.equal(described.publicPrompt.allowsSituationalModifier, true);
  assert.equal(described.privateEvaluation.flavor, 'Forage — Gathering check', 'no DC suffix');
  assert.equal(JSON.stringify(described.publicPrompt).includes('skills'), false);
});

// ── the prepared evaluator ────────────────────────────────────────────────────

test('the prepared evaluator refuses a count check whose captured policy is missing', async () => {
  await withDice([], async (dice) => {
    const refused = await evaluatePreparedRunCheck(
      {
        mode: 'simple',
        slot: 'simple',
        rollFormula: '',
        checkConfig: simpleCheck(countEvaluation()),
        decisionPolicy: {},
      },
      { getRollData: () => ({}) }
    );
    assert.deepEqual(refused.data, { targetRefusal: 'invalid', refusedInput: 'pool' });
    assert.equal(refused.misconfigured, true);
    assert.deepEqual(dice.constructed, []);
  });
});

// ── required counts and the macro ─────────────────────────────────────────────

/** A crafting simple count check whose 2d10 shows 9 and 3, so the net is always 1. */
async function craftNetOne(config, recipeFields = {}) {
  const world = craftingWorld({ resolutionMode: 'simple', slot: 'simple', config });
  Object.assign(world.recipe, recipeFields);
  return withDice([9, 3], () =>
    world.engine._runCraftingCheck(world.recipe, world.craftingActor, [world.sourceActor], null, null, {})
  );
}

test('crafting reads the selected tier successes, else the pool required count, never its DC', async () => {
  const tiers = [
    { id: 'easy', name: 'Easy', dc: 1, successes: 1 },
    { id: 'unset', name: 'Unset', dc: 1, successes: null },
    { id: 'none', name: 'None', dc: 5, successes: 0 },
  ];
  const config = simpleCheck(countEvaluation({ required: 2 }), { tiers, dc: 1 });
  assert.equal((await craftNetOne(config, { checkTierId: 'easy' })).success, true, 'tier 1');
  assert.equal(
    (await craftNetOne(config, { checkTierId: 'unset' })).success,
    false,
    'a null tier falls back to the pool 2, not the tier DC 1'
  );
  const zero = await craftNetOne(config, { checkTierId: 'none' });
  assert.deepEqual([zero.success, zero.data.margin], [true, 1], 'zero is a required count');
  const pool = await craftNetOne(config);
  assert.deepEqual(
    [pool.success, pool.data.dc, pool.data.margin],
    [false, null, -1],
    'no tier: the pool 2 grades, and the DC never reaches data'
  );
});

test('salvage and gathering read a zero successesOverride as zero, not the pool count', async () => {
  const engine = Object.create(CraftingEngine.prototype);
  const simple = simpleCheck(countEvaluation({ required: 2 }), { dc: 1 });
  const salvaged = await withDice([9, 3], () =>
    engine._runSalvageSimpleCheck(
      simple,
      { name: 'Scrap', salvage: { successesOverride: 0, dcOverride: 9 } },
      { system: {} },
      {}
    )
  );
  assert.deepEqual([salvaged.success, salvaged.data.margin], [true, 1]);
  const unset = await withDice([9, 3], () =>
    engine._runSalvageSimpleCheck(simple, { name: 'Scrap', salvage: { successesOverride: null } }, { system: {} }, {})
  );
  assert.deepEqual([unset.success, unset.data.margin], [false, -1]);

  const gathering = Object.create(GatheringEngine.prototype);
  const routed = routedCheck(countEvaluation({ required: 2 }), { dc: 1 });
  const gathered = await withDice([9, 3], () =>
    gathering._rollRoutedFormula({
      routed,
      rollFormula: null,
      actor: { system: {} },
      task: { name: 'Forage', successesOverride: 0, dcOverride: 9 },
      interactive: false,
      craftingModifier: null,
    })
  );
  assert.deepEqual([gathered.outcome, gathered.data.margin], ['Fine', 1], 'required 0 + dc 0');
});

test('a dynamic count macro receives the anchor required count after validation', async () => {
  const payloads = [];
  const original = MacroExecutor.run;
  try {
    const tiers = [{ id: 'hard', name: 'Hard', dc: 20, successes: 3 }];
    const dynamic = (evaluation, extra = {}) =>
      simpleCheck(evaluation, { tiers, dcMode: 'dynamic', macroUuid: 'Macro.req', ...extra });
    MacroExecutor.run = async (_uuid, payload) => {
      payloads.push(payload);
      payload.evaluation.pool.base = 'mutated';
      return payload.anchorDc - 1.7;
    };
    const refused = await craftNetOne(dynamic(countEvaluation({ threshold: MISSING })), {
      checkTierId: 'hard',
    });
    assert.equal(refused.misconfigured, true);
    assert.equal(payloads.length, 0, 'validation precedes the macro');

    const config = dynamic(countEvaluation({ required: 2 }));
    const result = await craftNetOne(config, { checkTierId: 'hard' });
    assert.equal(payloads.length, 1, 'the macro resolves once');
    assert.equal(payloads[0].anchorDc, 3, 'the tier successes, not its DC of 20');
    assert.equal(payloads[0].evaluation.product, 'count');
    assert.equal(config.evaluation.pool.base, '2', 'the payload evaluation is a clone');
    assert.deepEqual([result.success, result.data.margin], [true, 0], 'trunc(3 − 1.7) = 1');

    MacroExecutor.run = async () => -4;
    const clamped = await craftNetOne(config, { checkTierId: 'hard' });
    assert.deepEqual([clamped.success, clamped.data.margin], [true, 1], 'max(0, −4) = 0');

    MacroExecutor.run = async () => 'not a number';
    const fallback = await craftNetOne(config, { checkTierId: 'hard' });
    assert.equal(fallback.data.margin, -2, 'a non-number keeps the anchor of 3');

    let invoked = 0;
    MacroExecutor.run = async () => {
      invoked += 1;
      return 0;
    };
    const stale = await craftNetOne(
      dynamic(countEvaluation({ required: 2 }), { dcMode: 'static' }),
      { checkTierId: 'hard' }
    );
    assert.equal(invoked, 0, 'a static-mode stale macro UUID stays inert');
    assert.equal(stale.data.margin, -2);
  } finally {
    MacroExecutor.run = original;
  }
});

// ── QE5: the production placement path ────────────────────────────────────────

/** A crafting simple count/over check (d6, base 2, threshold 5, required 2) with a Tool scalar
 *  +1 and a library scalar `library`, and no overrides. */
async function productionCraft({ modifierDestination, library = 1, tool = '1', faces }) {
  const evaluation = countEvaluation({
    die: 6,
    base: '2',
    threshold: '5',
    required: 2,
    modifierDestination,
  });
  const world = craftingWorld({ resolutionMode: 'simple', slot: 'simple', config: simpleCheck(evaluation) });
  world.system.modifiers = [{ id: 'knack', label: 'Knack', expression: String(library) }];
  Object.assign(world.system.craftingCheck, {
    defaultModifierPolicy: 'addAll',
    defaultModifierIds: ['knack'],
  });
  const bonus = { ...HAMMER, bonus: { enabled: true, expression: tool } };
  const toolItems = [
    { tool: HAMMER, contributionInput: { tool: bonus, primaryActor: world.craftingActor } },
  ];
  return withDice(faces, async (dice) => {
    const result = await world.engine._runCraftingCheck(
      world.recipe,
      world.craftingActor,
      [world.sourceActor],
      null,
      null,
      { toolItems }
    );
    return { result, rolled: dice.evaluated };
  });
}

test('QE5: a pool destination rolls base + Tool + library dice once, with no appended term', async () => {
  const { result, rolled } = await productionCraft({
    modifierDestination: 'pool',
    faces: [5, 1, 6, 2],
  });
  assert.deepEqual(rolled, [
    { formula: '1', kind: 'EngineRoll' },
    { formula: '4d6', kind: 'FabricateCountRoll' },
  ]);
  assert.deepEqual([result.data.target, result.data.successes, result.success], [5, 2, true]);
});

test('QE5: a threshold destination rolls the base dice once against a threshold lowered by 2', async () => {
  const { result, rolled } = await productionCraft({
    modifierDestination: 'threshold',
    faces: [3, 2],
  });
  assert.deepEqual(rolled.map(({ formula }) => formula), ['1', '2d6']);
  assert.deepEqual([result.data.target, result.data.successes, result.success], [3, 1, false]);
});

test('QE5: a Tool 1d4 pre-rolls once as its own Roll and adds its total to the pool once', async () => {
  const { result, rolled } = await productionCraft({
    modifierDestination: 'pool',
    library: 0,
    tool: '1d4',
    faces: [2, 6, 6, 6, 6],
  });
  assert.deepEqual(rolled.map(({ formula }) => formula), ['1d4', '4d6']);
  assert.deepEqual(result.data.preRolls, [
    { source: 'tool', label: 'Hammer', expression: '1d4', total: 2, destination: 'pool' },
  ]);
  assert.equal(result.data.successes, 4);
});

test('QE5: a fractional library benefit to the pool rolls floor(2.5) = 2 dice', async () => {
  const { rolled } = await productionCraft({
    modifierDestination: 'pool',
    library: 0.5,
    tool: '0',
    faces: [6, 6],
  });
  assert.deepEqual(rolled.map(({ formula }) => formula), ['0', '2d6']);
});

test('QE5: salvage simple and gathering routed place the same benefits the same way', async () => {
  const evaluation = (modifierDestination) =>
    countEvaluation({ die: 6, base: '2', threshold: '5', required: 2, modifierDestination });
  const salvage = (modifierDestination, faces) => {
    const world = salvageWorld('simple', simpleCheck(evaluation(modifierDestination)));
    const system = globalThis.game.fabricate.getCraftingSystemManager().getSystem('sys-salvage');
    system.modifiers = [{ id: 'knack', label: 'Knack', expression: '2' }];
    Object.assign(system.salvageCraftingCheck, {
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['knack'],
    });
    return withDice(faces, async (dice) => {
      const result = await world.salvage();
      return { result, formulas: dice.formulas() };
    });
  };
  assert.deepEqual((await salvage('pool', [5, 1, 6, 2])).formulas, ['4d6']);
  assert.deepEqual((await salvage('threshold', [3, 2])).formulas, ['2d6']);

  const gathering = Object.create(GatheringEngine.prototype);
  const gather = (modifierDestination, faces) =>
    withDice(faces, async (dice) => {
      const result = await gathering._rollRoutedFormula({
        routed: routedCheck(evaluation(modifierDestination)),
        rollFormula: null,
        actor: { system: {} },
        task: { name: 'Forage' },
        interactive: false,
        craftingModifier: {
          activity: 'gathering',
          catalogue: [{ id: 'knack', label: 'Knack', expression: '2' }],
          systemPolicy: 'addAll',
          defaultModifierIds: ['knack'],
        },
      });
      return { result, formulas: dice.formulas() };
    });
  const pooled = await gather('pool', [5, 1, 6, 2]);
  assert.deepEqual(pooled.formulas, ['4d6']);
  const lowered = await gather('threshold', [3, 2]);
  assert.deepEqual([lowered.formulas, lowered.result.data.target], [['2d6'], 3]);
});

// ── grading, routing, progressive and evidence ───────────────────────────────

const ACTOR = { getRollData: () => ({}) };
const normalized = (pool, direction) => normalizeCheckEvaluation(countEvaluation({ direction, ...pool }));
const cancelWorst = { cancel: { enabled: true, faces: { kind: 'worst', value: null } } };

test('a count/over exceed check passes when its net equals the required count: grading is met', async () => {
  const result = await withDice([9, 8], () =>
    runFormulaPassFail({
      formula: '',
      dc: 1,
      thresholdMode: 'exceed',
      actor: ACTOR,
      evaluation: normalized({}),
    })
  );
  assert.equal(result.success, true, '9 exceeds 8 and 8 does not, so the net is exactly 1');
  assert.deepEqual(result.data, {
    formula: '',
    resolvedFormula: null,
    product: 'count',
    direction: 'over',
    comparison: 'exceed',
    dc: null,
    target: 8,
    total: 1,
    successes: 1,
    cancelled: 0,
    margin: 0,
    diceGroups: [{ groupId: 0, group: '2d10', sum: 1, results: [9, 8] }],
  });
});

test('count/under qualifies at or under its threshold and still grades a higher net as better', async () => {
  const result = await withDice([2, 5, 3], () =>
    runFormulaPassFail({ formula: '', dc: 2, actor: ACTOR, evaluation: normalized({ base: '3', threshold: '3' }, 'under') })
  );
  assert.deepEqual(
    [result.success, result.data.direction, result.data.successes, result.data.margin],
    [true, 'under', 2, 0]
  );
});

/** Relative count tiers against a required count of 1: Fine needs 2, Success 1, Botch 0. */
const LADDER = [
  { id: 'botch', name: 'Botch', success: false, dc: -1 },
  { id: 'fine', name: 'Fine', success: true, dc: 1 },
  { id: 'success', name: 'Success', success: true, dc: 0 },
];

test('count/under routes by higher net, over and met, and records the per-die threshold', async () => {
  const result = await withDice([1, 2, 9], () =>
    runFormulaRouted({
      formula: '',
      dc: 1,
      type: 'relative',
      relativeOutcomes: LADDER,
      fixedOutcomes: [],
      clampToNearest: true,
      actor: ACTOR,
      evaluation: normalized({ base: '3', threshold: '5' }, 'under'),
    })
  );
  assert.equal(result.outcome, 'Fine', 'a net of 2 meets required 1 + 1');
  assert.deepEqual(
    [result.data.dc, result.data.target, result.data.margin, result.data.direction],
    [null, 5, 0, 'under'],
    'target is the per-die threshold; margin is the net less the matched tier count 2'
  );
});

/** Fixed count ranges, worst first; the gate asks for at least Good. */
const RANGES = [
  { id: 'plain', name: 'Plain', success: false, start: 0, end: 0 },
  { id: 'good', name: 'Good', success: true, start: 1, end: 1 },
  { id: 'great', name: 'Great', success: true, start: 2, end: 5 },
];

test('count/under fixed ranges rank and gate by higher net, and a net below every range stays unrouted', async () => {
  const routed = (faces, pool = {}) =>
    withDice(faces, () =>
      runFormulaRouted({
        formula: '',
        dc: 1,
        type: 'fixed',
        relativeOutcomes: [],
        fixedOutcomes: RANGES,
        clampToNearest: true,
        minOutcomeId: 'good',
        actor: ACTOR,
        evaluation: normalized({ base: '3', threshold: '5', ...pool }, 'under'),
      })
    );
  const great = await routed([1, 2, 9]);
  assert.deepEqual([great.outcome, great.success, great.data.minTierFailed], ['Great', true, undefined]);
  assert.deepEqual([great.data.margin, great.data.target], [null, 5]);

  // The worst face under is the die's maximum: 10 cancels and 9 neither qualifies nor cancels.
  const botched = await routed([10, 9, 9], cancelWorst);
  assert.deepEqual(
    [botched.data.total, botched.outcome, botched.success],
    [-1, null, false],
    'a net of −1 below ranges starting at 0 is never clamped to 0'
  );
});

test('a zero pool fails in every mode with no Roll and no triggers, even needing nothing', async () => {
  const zero = normalized({ base: '0', required: 0 });
  const triggers = [
    { id: 'lucky', outcome: 'success', condition: { type: 'rollTotal', operator: '<=', value: 0 } },
    { id: 'up', tierStep: { mode: 'up', steps: 1 }, condition: { type: 'rollTotal', operator: '<=', value: 0 } },
  ];
  const expected = {
    formula: '',
    resolvedFormula: null,
    product: 'count',
    direction: 'over',
    comparison: 'meet',
    dc: null,
    target: 8,
    total: null,
    successes: null,
    cancelled: null,
    margin: null,
    zeroPool: true,
    diceGroups: [],
  };
  await withDice([], async (dice) => {
    const simple = await runFormulaPassFail({ formula: '', dc: 0, triggers, actor: ACTOR, evaluation: zero });
    assert.deepEqual([simple.success, simple.outcome, simple.value], [false, 'fail', 0]);
    assert.deepEqual(simple.data, expected);

    const routed = await runFormulaRouted({
      formula: '',
      dc: 0,
      type: 'relative',
      relativeOutcomes: [
        { id: 'ruined', name: 'Ruined', success: false, dc: 1, breakTools: true },
        { id: 'botch', name: 'Botch', success: false, dc: -1 },
        { id: 'fine', name: 'Fine', success: true, dc: 0 },
      ],
      fixedOutcomes: [],
      triggers,
      minOutcomeId: 'fine',
      actor: ACTOR,
      evaluation: zero,
    });
    assert.deepEqual([routed.success, routed.outcome], [false, 'Botch'], 'the lowest-ranked failing tier');
    assert.deepEqual(routed.data, {
      ...expected,
      type: 'relative',
      outcomeId: 'botch',
      success: false,
      breakTools: false,
    });
    const unrouted = await runFormulaRouted({
      formula: '',
      dc: 0,
      type: 'relative',
      relativeOutcomes: [{ id: 'fine', name: 'Fine', success: true, dc: 0 }],
      fixedOutcomes: [],
      actor: ACTOR,
      evaluation: zero,
    });
    assert.deepEqual([unrouted.outcome, unrouted.data.outcomeId], [null, null]);

    const progressive = await runFormulaProgressive({ formula: '', triggers, actor: ACTOR, evaluation: zero });
    assert.deepEqual([progressive.success, progressive.value], [true, 0], 'an award budget of 0');
    assert.deepEqual(progressive.data, { ...expected, value: 0 });
    assert.deepEqual(dice.constructed, [], 'no main Roll');
  });
});

test('a zero pool keeps the evidence of a modifier it already rolled', async () => {
  const result = await withDice([3], () =>
    runFormulaPassFail({
      formula: '',
      dc: 1,
      actor: ACTOR,
      evaluation: normalized({ base: '0', modifierDestination: 'threshold' }),
      rollOptions: { interactive: true, prompt: null, post: false, rollDecision: { bonus: '1d4' } },
    })
  );
  assert.deepEqual([result.data.zeroPool, result.data.target], [true, 5], 'the 3 lowers 8 to 5');
  assert.deepEqual(result.data.preRolls, [
    { source: 'situational', label: '', expression: '1d4', total: 3, destination: 'threshold' },
  ]);
});

test('progressive spends max(0, net): progressiveValue reads the budget, rollTotal the raw botch', async () => {
  const progressive = (triggers) =>
    withDice([1, 3], () =>
      runFormulaProgressive({ formula: '', triggers, actor: ACTOR, evaluation: normalized(cancelWorst) })
    );
  const lessThanZero = (type, outcome) => ({ id: type, outcome, condition: { type, operator: '<', value: 0 } });
  const plain = await progressive([]);
  assert.deepEqual([plain.value, plain.data.total, plain.data.value], [0, -1, 0], 'the 1 cancels');
  assert.equal(
    (await progressive([lessThanZero('progressiveValue', 'success')])).value,
    0,
    'progressiveValue < 0 never fires on the clamped budget'
  );
  assert.equal(
    (await progressive([lessThanZero('rollTotal', 'success')])).value,
    Number.MAX_SAFE_INTEGER,
    'rollTotal < 0 fires on the raw net'
  );
  const breakage = (type) =>
    evaluateCheckBreakage({
      checkBreakage: { triggers: [{ ...lessThanZero(type, null), breakTools: true }] },
      checkResult: { ...plain, engineEvaluated: true },
    }).forceBreak;
  assert.deepEqual([breakage('rollTotal'), breakage('progressiveValue')], [true, false]);

  const service = new ResolutionModeService(null);
  service._getDifficulty = () => 1;
  for (const awardMode of ['equal', 'partial']) {
    const { meta } = service._resolveProgressiveResultGroups({
      recipe: {},
      checkResult: plain,
      system: { craftingCheck: { progressive: { awardMode } } },
      allGroups: [{ id: 'g', results: [{ id: 'first', componentId: 'c' }] }],
    });
    assert.deepEqual([meta.awardedResultIds, meta.remaining], [[], 0], `${awardMode} spends 0, not −1`);
  }
});

// ── prepared and secret checks ────────────────────────────────────────────────

/** A prepared count check authoring a live base path, whose capture resolved a base of 2. */
const preparedCount = (options) =>
  preparedCountCheck({ evaluation: countEvaluation({ base: '@skills.craft.value' }), ...options });

const LIVE_ACTOR = { getRollData: () => ({ skills: { craft: { value: 5 } } }) };

test('the prepared evaluator replays its captured pool, never the live actor, and drops advantage', async () => {
  const result = await withDice([9, 3], async (dice) => {
    const graded = await evaluatePreparedRunCheck(preparedCount(), LIVE_ACTOR, {
      allowAdvantage: true,
      advantage: 'advantage',
    });
    assert.deepEqual(dice.formulas(), ['2d10'], 'the captured base of 2, not the live 5, and no advantage die');
    return graded;
  });
  assert.deepEqual(
    [result.success, result.data.product, result.data.total, result.data.dc, result.engineEvaluated],
    [true, 'count', 1, null, true]
  );
});

test('a secret count check posts one gmroll carrying only the numeric replay policy', async () => {
  const toolContributions = [{ source: 'tool', label: 'Hammer', form: 'scalar', value: 1 }];
  const dice = installCountDice({ faces: [9, 3, 8] });
  try {
    const result = await evaluatePreparedRunCheck(preparedCount({ toolContributions }), LIVE_ACTOR, {}, {
      secret: true,
    });
    assert.equal(dice.posts.length, 1);
    const [roll] = dice.posts[0].rolls;
    assert.equal(roll.constructor.name, 'FabricateCountRoll');
    assert.deepEqual(dice.posts[0].options, { rollMode: 'gmroll', create: true });
    assert.deepEqual(Object.keys(roll.options), ['fabricateCount']);
    assert.deepEqual(roll.options.fabricateCount, {
      version: 1,
      direction: 'over',
      comparison: 'meet',
      threshold: 8,
      explode: null,
      cancel: null,
    });
    assert.equal(result.secret, true);
    assert.equal(Object.hasOwn(result, 'rollHandoff'), false, 'no handoff for a secret roll');
    assert.equal(Object.hasOwn(result.data, 'preRolls'), false);
    const answer = JSON.stringify(result);
    for (const leak of ['countProjection', 'modifierPlacement', 'skills', 'fabricateCount']) {
      assert.equal(answer.includes(leak), false, `the answer omits ${leak}`);
    }
    assert.deepEqual([result.data.total, result.data.successes], [2, 2], 'three dice, 9 and 8 qualify');
  } finally {
    dice.restore();
  }
});

test('an entitled count check hands back its roll, which reconstructs with no RNG', async () => {
  const dice = installCountDice({ faces: [9, 3] });
  try {
    const result = await evaluatePreparedRunCheck(preparedCount(), LIVE_ACTOR);
    const handoff = JSON.parse(JSON.stringify(result.rollHandoff));
    assert.deepEqual(Object.keys(handoff.serializedRoll.options), ['fabricateCount']);
    const draws = dice.rng.draws;
    const rebuilt = dice.Roll.fromData(handoff.serializedRoll);
    assert.equal(rebuilt.constructor.name, 'FabricateCountRoll');
    assert.equal(rebuilt.total, result.data.total);
    assert.equal((await postCheckRollHandoff(handoff, { Roll: dice.Roll })).success, true);
    assert.equal(dice.rng.draws, draws, 'reconstruction and posting draw no face');
  } finally {
    dice.restore();
  }
});

// ── the one active-check predicate ────────────────────────────────────────────

test('every predicate consumer treats an empty-formula count as active and an empty sum as none', () => {
  const count = { rollFormula: '', evaluation: countEvaluation() };
  const sum = { rollFormula: '  ' };
  for (const [slot, expected] of [[count, true], [sum, false]]) {
    const label = expected ? 'count' : 'sum';
    assert.equal(
      resolveActiveCraftingCheckFormula({ resolutionMode: 'progressive', craftingCheck: { progressive: slot } })
        .checkUsable,
      expected,
      `crafting: ${label}`
    );
    assert.equal(
      resolveSalvageCheck({ salvageResolutionMode: 'routed', salvageCraftingCheck: { routed: slot } }).checkUsable,
      expected,
      `salvage: ${label}`
    );
    assert.equal(
      resolveActiveSalvageCheckFormula({ salvageResolutionMode: 'simple', salvageCraftingCheck: { simple: slot } })
        .checkUsable,
      expected,
      `salvage sibling: ${label}`
    );
    assert.equal(
      resolveActiveGatheringCheckFormula({ gatheringCraftingCheck: { routed: slot } }, 'routed').checkUsable,
      expected,
      `gathering: ${label}`
    );
    assert.equal(new ResolutionModeService(null)._hasRollFormula(slot), expected, `mode service: ${label}`);

    const codes = (system) =>
      evaluateSystemValidation({ id: 's', name: 'S', features: {}, ...system }).issues.map(({ code }) => code);
    const blockers = [
      ...codes({ resolutionMode: 'routedByCheck', craftingCheck: { routed: slot } }),
      ...codes({ resolutionMode: 'progressive', craftingCheck: { progressive: slot } }),
      ...codes({ resolutionMode: 'alchemy', alchemy: { checkMode: 'tiered' }, craftingCheck: { routed: slot } }),
      ...codes({ salvageResolutionMode: 'routed', salvageCraftingCheck: { routed: slot } }),
    ];
    for (const code of ['routedCheckNoFormula', 'progressiveNoCheck', 'alchemyCheckNoFormula', 'salvageRoutedNoFormula']) {
      assert.equal(blockers.includes(code), !expected, `${code}: ${label}`);
    }

    const gathering = Object.create(GatheringEngine.prototype);
    const task = { id: 't', name: 'T', resolutionMode: 'routed', resultGroups: [{ id: 'g', results: [{ id: 'r' }] }] };
    const errors = gathering._validateStartTask(task, { gatheringCraftingCheck: { routed: slot } }).errors ?? [];
    assert.equal(
      errors.some((error) => /system-level gathering check roll formula/.test(error)),
      !expected,
      `gathering eligibility: ${label}`
    );
  }
});

test('every count refusal sentence in lang/en.json reads as its English fallback', () => {
  const i18n = createLangBackedI18n(repoRoot);
  const pairs = [
    ...['expression-missing', 'unresolved-path', 'non-finite', 'dice', 'invalid'].flatMap((reason) => [
      [reason, 'base'],
      [reason, 'threshold'],
    ]),
    ['die-invalid', 'die'],
    ['faces-invalid', 'explode'],
    ['faces-invalid', 'cancel'],
    ['explode-unbounded', 'explode'],
    ['non-finite', 'pool'],
    ['pool-too-large', 'pool'],
    ['unknown', 'pool'],
  ];
  const seen = new Set();
  for (const [reason, refusedInput] of pairs) {
    const refusal = { reason, refusedInput, path: '@skills.smith.rank' };
    const localized = refusalMessage(refusal, 'Salvage', i18n.format);
    assert.equal(localized, refusalMessage(refusal, 'Salvage', null), `${reason} ${refusedInput}`);
    assert.equal(localized.includes('{'), false, 'every placeholder is filled');
    seen.add(localized);
  }
  assert.equal(seen.size, pairs.length, 'each reason and input reads distinctly');
  assert.match(
    refusalMessage({ reason: 'explode-unbounded', refusedInput: 'explode' }, 'Salvage', i18n.format),
    /its dice would explode past the most Foundry can roll at once\.$/,
    'neutral copy, whichever limit stopped the roll'
  );
});
