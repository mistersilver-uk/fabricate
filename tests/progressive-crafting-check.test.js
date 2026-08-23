// Engine integration tests for the progressive crafting check
// (CraftingEngine._runProgressiveCheck via _runCraftingCheck dispatch): the roll
// total becomes the numeric `value` progressive result-awarding spends, per-die
// crits force award-all/award-none, and a formula-less progressive check fails
// loudly (the legacy macro check source is gone).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');

function defaultProgressive(overrides = {}) {
  return {
    awardMode: 'equal',
    allowPlayerReorder: false,
    rollFormula: '2d6',
    checkBreakage: { triggers: [] },
    ...overrides,
  };
}

// A unified trigger forcing `outcome` (and optionally breakTools) when the rolled
// group total equals `value` — the recombined replacement for a per-die crit.
function totalTrigger({ id = 't', groupId = 0, value, outcome = 'none', breakTools = false }) {
  return {
    id,
    condition: { type: 'diceGroup', groupId, aggregate: 'total', operator: '==', value },
    outcome,
    breakTools,
  };
}

function breakage(...triggers) {
  return { checkBreakage: { triggers } };
}

function makeEngine({ progressive, craftingCheck = {}, features = {} } = {}) {
  const system = {
    id: 'sys-1',
    resolutionMode: 'progressive',
    features,
    craftingCheck: { enabled: true, progressive, ...craftingCheck },
  };
  const systemManager = { getSystem: () => system };
  const resolutionService = {
    getMode: () => system.resolutionMode,
    getResultSelection: () => null,
  };
  const engine = new CraftingEngine({}, null, resolutionService);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => resolutionService,
    },
  };
  return { engine, system };
}

// Stub Foundry's Roll: evaluate() resolves to a fixed total and dice terms, each
// described as { number, faces, total } (mirroring an evaluated DiceTerm).
function stubRoll(total, dice = []) {
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      return { total, dice };
    }
  };
}

function stubThrowingRoll() {
  globalThis.Roll = class {
    async evaluate() {
      throw new Error('bad formula');
    }
  };
}

const ACTOR = { id: 'a1', name: 'Crafter', items: [] };
const run = (engine, recipe = { craftingSystemId: 'sys-1' }) =>
  engine._runCraftingCheck(recipe, ACTOR, [ACTOR], null);

// ── Plain roll → value is the total ─────────────────────────────────────────

test('a plain roll surfaces the total as the numeric value', async () => {
  const { engine } = makeEngine({ progressive: defaultProgressive() });
  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  const result = await run(engine);
  assert.equal(result.success, true, 'progressive crafts always proceed');
  assert.equal(result.outcome, null);
  assert.equal(result.value, 8, 'the value equals the roll total');
  assert.equal(result.data.total, 8);
  assert.equal(result.data.breakTools, undefined, 'a plain progressive roll surfaces no breakTools');
});

// ── Forced-outcome triggers force award-all / award-none ─────────────────────

test('a success trigger forces value MAX_SAFE_INTEGER (award all)', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive(breakage(totalTrigger({ groupId: 0, value: 12, outcome: 'success', breakTools: true }))),
  });
  stubRoll(12, [{ number: 2, faces: 6, total: 12 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.value, Number.MAX_SAFE_INTEGER, 'award-all sentinel');
});

test('a failure trigger forces value 0 (award nothing)', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive(breakage(totalTrigger({ groupId: 0, value: 2, outcome: 'failure' }))),
  });
  // A high total (10) would normally award plenty; the failure trigger overrides it.
  stubRoll(10, [{ number: 2, faces: 6, total: 2 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.value, 0, 'award-none');
});

test('a matching forced failure takes precedence over a matching forced success', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({
      rollFormula: '1d20+1d6',
      ...breakage(
        totalTrigger({ id: 'c1', groupId: 0, value: 20, outcome: 'success' }),
        totalTrigger({ id: 'c2', groupId: 1, value: 1, outcome: 'failure' })
      ),
    }),
  });
  stubRoll(21, [
    { number: 1, faces: 20, total: 20 },
    { number: 1, faces: 6, total: 1 },
  ]);
  const result = await run(engine);
  assert.equal(result.value, 0, 'forced failure wins → award nothing');
});

test('a non-matching trigger leaves the rolled total as the value', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive(breakage(totalTrigger({ groupId: 0, value: 12, outcome: 'success' }))),
  });
  stubRoll(7, [{ number: 2, faces: 6, total: 7 }]);
  const result = await run(engine);
  assert.equal(result.value, 7);
});

// ── Roll engine edge cases ──────────────────────────────────────────────────

test('no Roll engine available does not block the craft (awards nothing)', async () => {
  const { engine } = makeEngine({ progressive: defaultProgressive() });
  delete globalThis.Roll;
  const result = await run(engine);
  assert.equal(result.success, true);
  // A finite 0 value (award nothing) rather than null, so progressive awarding
  // accepts it instead of treating the craft as a validation failure.
  assert.equal(result.value, 0);
});

test('a roll that throws fails the check with a message', async () => {
  const { engine } = makeEngine({ progressive: defaultProgressive() });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.match(result.message, /roll failed/i);
});

// ── Formula-less progressive fails loudly (no legacy macro path) ─────────────

test('a formula-less progressive check fails loudly (requires a roll formula)', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({ rollFormula: '' }),
  });
  const result = await run(engine);
  assert.equal(result.success, false, 'progressive mode requires a configured roll formula');
  assert.match(result.message, /requires a configured crafting check roll formula/i);
});

// ── checkBreakage / value-vs-total distinction (issue 419) ───────────────────

test('progressive surfaces value (awarding) and data.total (raw roll) distinctly under a success trigger', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({
      rollFormula: '1d20',
      ...breakage(totalTrigger({ groupId: 0, value: 1, outcome: 'success' })),
    }),
  });
  // Natural 1 forces success: value → MAX_SAFE_INTEGER, data.total keeps raw 1.
  stubRoll(1, [{ number: 1, faces: 20, total: 1, results: [{ result: 1, active: true }] }]);
  const r = await run(engine);
  assert.equal(r.value, Number.MAX_SAFE_INTEGER, 'awarding value is the forced award');
  assert.equal(r.data.total, 1, 'data.total keeps the raw roll');
});

test('checkDriven progressive: a progressiveValue trigger fires while a rollTotal trigger does not (distinct sources)', async () => {
  const progressive = defaultProgressive({
    rollFormula: '1d20',
    ...breakage(totalTrigger({ groupId: 0, value: 1, outcome: 'success' })),
  });
  const { engine, system } = makeEngine({ progressive });
  system.toolBreakage = { authority: 'checkDriven' };
  stubRoll(1, [{ number: 1, faces: 20, total: 1, results: [{ result: 1, active: true }] }]);
  const r = await run(engine);
  // progressiveValue targets the awarded MAX; rollTotal targets the raw 1. Both
  // break-tools triggers, so only the one whose condition matches force-breaks.
  const progTrigger = { triggers: [{ id: 'pv', breakTools: true, condition: { type: 'progressiveValue', operator: '>=', value: 1000 } }] };
  const rollTrigger = { triggers: [{ id: 'rt', breakTools: true, condition: { type: 'rollTotal', operator: '>=', value: 1000 } }] };
  const { evaluateCheckBreakage } = await import('../src/toolBreakageRuntime.js');
  assert.equal(evaluateCheckBreakage({ checkBreakage: progTrigger, checkResult: r }).forceBreak, true);
  assert.equal(evaluateCheckBreakage({ checkBreakage: rollTrigger, checkResult: r }).forceBreak, false);
});

test('checkDriven progressive: surfaces data.diceGroups for the DSL', async () => {
  const { engine, system } = makeEngine({ progressive: defaultProgressive({ rollFormula: '2d6' }) });
  system.toolBreakage = { authority: 'checkDriven' };
  stubRoll(7, [{ number: 2, faces: 6, total: 7, results: [{ result: 3, active: true }, { result: 4, active: true }] }]);
  const r = await run(engine);
  assert.deepEqual(r.data.diceGroups, [{ groupId: 0, group: '2d6', sum: 7, results: [3, 4] }]);
});

// ---------------------------------------------------------------------------
// Progressive component complications: the crafting call site (issue 1286)
//
// The load-bearing claim is EXACTLY ONCE. `resolveResultGroups` is called up to three
// times for one craft — the pre-consumption misconfiguration gate, the failure-award
// preflight, and again inside `_createResultItems` — and a complication must fire for
// the LAST of those and for none of the others. These drive the whole `craft()` flow
// through a real `ResolutionModeService` so the count is of real calls.
// ---------------------------------------------------------------------------

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

/** An authored complication; `gmOnly` by default, so every firing yields a GM request. */
function craftComplication({
  id = 'cx',
  when = { stageAwarded: true },
  activities = { crafting: true },
  match = 'any',
} = {}) {
  return {
    id,
    name: 'Backfire',
    description: 'Backfire description',
    severity: 'minor',
    visibility: 'gmOnly',
    activities,
    match,
    when,
    rollCondition: { enabled: false },
    effectRoll: { enabled: false },
  };
}

/**
 * A progressive crafting world driven end to end through `craft()`.
 *
 * `_createSingleResult` is the ONLY engine method stubbed, and deliberately: it is the
 * Foundry document-creation edge, and stubbing `_createResultItems` instead would remove
 * the very `resolveResultGroups` call this test exists to count.
 */
function progressiveCraftWorld({
  value = 10,
  complicationsIron = [craftComplication()],
  complicationsMithril = [],
  resolutionMode = 'progressive',
  results = [
    { id: 'r-iron', componentId: 'c-iron' },
    { id: 'r-mithril', componentId: 'c-mithril' },
  ],
} = {}) {
  const system = {
    id: 'sys-1',
    resolutionMode,
    features: { chatOutput: false },
    craftingCheck: {
      enabled: true,
      progressive: defaultProgressive({ awardMode: 'equal' }),
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
    },
    components: [
      { id: 'c-iron', name: 'Iron Ingot', difficulty: 4, complications: complicationsIron },
      { id: 'c-mithril', name: 'Mithril Plate', difficulty: 20, complications: complicationsMithril },
    ],
  };
  const item = {
    id: 'item-iron',
    uuid: 'Item.iron',
    name: 'Iron Ingot',
    parent: null,
    system: { quantity: 5 },
    async delete() {},
    async update() {},
  };
  const ingredientSet = {
    id: 'set-1',
    matchIngredients(available) {
      const matched = available.find((entry) => entry === item);
      return matched ? [{ item: matched, quantity: 1, ingredient: { systemItemId: item.id } }] : [];
    },
  };
  const recipe = {
    id: 'recipe-1',
    name: 'Ingot Press',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', name: 'Output', results }],
    tools: [],
    getExecutionSteps: null,
    validate: () => ({ valid: true, errors: [] }),
  };
  const systemManager = { getSystem: (id) => (id === 'sys-1' ? system : null) };
  const service = new ResolutionModeService(systemManager);
  let resolveCalls = 0;
  const realResolve = service.resolveResultGroups.bind(service);
  service.resolveResultGroups = (args) => {
    resolveCalls += 1;
    return realResolve(args);
  };
  service.validateRecipe = () => ({ valid: true, errors: [] });

  const recipeManager = {
    canCraft: () => ({
      canCraft: true,
      satisfiableSet: ingredientSet,
      missing: { ingredients: [], essences: [], tools: [] },
    }),
    ingredientMatchesItem: (_recipe, _ingredient, candidate) => candidate === item,
    getToolsForSet: () => [],
  };
  const engine = new CraftingEngine(recipeManager, null, service);
  engine._runCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value,
    data: { total: value, value, diceGroups: [] },
    engineEvaluated: true,
  });
  engine._createSingleResult = async () => null;

  const writer = { calls: [], deliver(args) { this.calls.push(args); return true; } };
  engine.installComplicationDelivery({ writer });
  let fireRequests = 0;
  const realFire = engine._fireComponentComplications.bind(engine);
  engine._fireComponentComplications = (args) => {
    fireRequests += 1;
    return realFire(args);
  };

  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => service,
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 },
  };
  const sourceActor = { id: 'a1', name: 'Crafter', items: [item] };
  const craftingActor = {
    id: 'a1',
    name: 'Crafter',
    uuid: 'Actor.a1',
    items: { contents: [] },
    createEmbeddedDocuments: async () => [],
  };
  return {
    engine,
    recipe,
    writer,
    sourceActor,
    craftingActor,
    service,
    counts: {
      get resolve() {
        return resolveCalls;
      },
      get fire() {
        return fireRequests;
      },
    },
  };
}

test('craft(): fireComplications is requested EXACTLY ONCE, though the craft resolves twice', async () => {
  const world = progressiveCraftWorld();

  const result = await world.engine.craft(
    world.craftingActor,
    [world.sourceActor],
    world.recipe,
    null,
    {}
  );

  assert.equal(result.success, true);
  assert.ok(
    world.counts.resolve >= 2,
    `the craft resolved more than once (${world.counts.resolve} calls): the preflight gate and _createResultItems`
  );
  assert.equal(world.counts.fire, 1, 'and complications were requested exactly once');
  assert.equal(world.writer.calls.length, 1, 'so exactly one delivery was made');
  assert.deepEqual(
    world.writer.calls[0].complications.map((entry) => [entry.componentId, entry.bucket]),
    [['c-iron', 'full']],
    'budget 10 awards the cost-4 iron and halts on the cost-20 mithril'
  );
});

test('craft(): the halted stage fires its own complication, from the SAME single request', async () => {
  const world = progressiveCraftWorld({
    complicationsIron: [craftComplication({ id: 'ca' })],
    complicationsMithril: [craftComplication({ id: 'cb', when: { stageMissed: true } })],
  });

  await world.engine.craft(world.craftingActor, [world.sourceActor], world.recipe, null, {});

  assert.equal(world.counts.fire, 1, 'still one request for one resolution');
  assert.deepEqual(
    world.writer.calls[0].complications.map((entry) => [entry.componentId, entry.bucket]),
    [
      ['c-iron', 'full'],
      ['c-mithril', 'halted'],
    ]
  );
});

test('craft(): NEGATIVE CONTROL — a craft aborted by the misconfiguration gate fires NOTHING', async () => {
  // The gate resolves BEFORE any consumption precisely so a misconfigured recipe can
  // abort having consumed nothing. A complication fired from there would be a consequence
  // of a craft that never happened, which is why the firing site is after the award.
  const world = progressiveCraftWorld();
  const real = world.service.resolveResultGroups;
  let seen = 0;
  world.service.resolveResultGroups = (args) => {
    seen += 1;
    if (seen === 1) {
      return { groups: [], meta: { disposition: 'misconfiguration', error: 'No result group' } };
    }
    return real(args);
  };
  let consumed = false;
  world.engine._consumeIngredients = async () => {
    consumed = true;
    return [];
  };

  const result = await world.engine.craft(
    world.craftingActor,
    [world.sourceActor],
    world.recipe,
    null,
    {}
  );

  assert.equal(result.success, false, 'the craft aborted');
  assert.equal(result.disposition, 'misconfiguration');
  assert.equal(consumed, false, 'and it aborted with zero mutation');
  assert.equal(world.counts.fire, 0, 'so no complication was ever requested');
  assert.equal(world.writer.calls.length, 0);
});

test('craft(): NEGATIVE CONTROL — a SIMPLE-mode craft never asks about complications', async () => {
  const world = progressiveCraftWorld({ resolutionMode: 'simple' });

  const result = await world.engine.craft(
    world.craftingActor,
    [world.sourceActor],
    world.recipe,
    null,
    {}
  );

  assert.equal(result.success, true);
  assert.equal(world.counts.fire, 0, 'complications are a progressive-only consequence');
  assert.equal(world.writer.calls.length, 0);
});

test('craft(): a complication not enabled for CRAFTING never fires on a craft', async () => {
  const world = progressiveCraftWorld({
    complicationsIron: [craftComplication({ activities: { salvage: true } })],
  });

  await world.engine.craft(world.craftingActor, [world.sourceActor], world.recipe, null, {});

  assert.equal(world.counts.fire, 1, 'the site still ran');
  assert.equal(world.writer.calls.length, 0, 'but nothing was addressed to the GM');
});

test('craft(): a THROWING delivery writer never costs the craft its award', async () => {
  const world = progressiveCraftWorld();
  world.engine.installComplicationDelivery({
    writer: {
      deliver() {
        throw new Error('socket exploded');
      },
    },
  });

  const result = await world.engine.craft(
    world.craftingActor,
    [world.sourceActor],
    world.recipe,
    null,
    {}
  );

  assert.equal(result.success, true, 'the craft still succeeds');
});

test('progressiveStageOccurrences: publishes every stage, including the unreached ones', () => {
  // The reason this is published rather than inferred from `meta`: `meta` names the
  // awarded, partial, halted and skipped ids, and everything else is `unreached` — but
  // nothing in `meta` says what "everything else" IS, nor in which order.
  const world = progressiveCraftWorld();
  const stages = world.service.progressiveStageOccurrences({ recipe: world.recipe });

  assert.deepEqual(
    stages.map((stage) => [stage.resultId, stage.componentId, stage.component?.name]),
    [
      ['r-iron', 'c-iron', 'Iron Ingot'],
      ['r-mithril', 'c-mithril', 'Mithril Plate'],
    ]
  );
});

test('progressiveStageOccurrences: a non-progressive recipe has no stages', () => {
  const world = progressiveCraftWorld({ resolutionMode: 'routedByCheck' });
  assert.deepEqual(world.service.progressiveStageOccurrences({ recipe: world.recipe }), []);
});

test('_resolveProgressiveResultGroups: the flat meta reports all five stage facts', () => {
  const world = progressiveCraftWorld();
  const resolved = world.service.resolveResultGroups({
    recipe: world.recipe,
    checkResult: { value: 10 },
  });

  assert.deepEqual(resolved.meta, {
    awardedResultIds: ['r-iron'],
    remaining: 6,
    partialResultId: null,
    haltedResultId: 'r-mithril',
    skippedResultIds: [],
  });
});

test('_finishTimedStep(): the matured FINISH fires exactly once, after the run is completed', async () => {
  // The timed path is the SECOND crafting call site. It is driven directly because the
  // only route to it is a matured world-time gate, and a `craft()`-shaped test of it
  // would be a test of the run manager rather than of the firing site.
  const world = progressiveCraftWorld();
  const completed = [];
  const runManager = {
    completeStepSuccess: async (actor, run, stepIndex, payload) => {
      completed.push({ stepIndex, payload });
      return { ...run, status: 'succeeded' };
    },
  };
  const run = {
    id: 'run-1',
    steps: [{ preparedConsumption: { selectedIngredientSetId: 'set-1', consumedSummary: [] } }],
  };

  const outcome = await world.engine._finishTimedStep({
    craftingActor: world.craftingActor,
    componentSourceActors: [world.sourceActor],
    recipe: world.recipe,
    // A step authoring neither ingredient sets nor result groups falls back to the
    // recipe's own, which is what a single-step timed recipe looks like.
    step: { id: 'step-1', name: 'Press' },
    stepIndex: 0,
    options: {},
    presentTools: null,
    runManager,
    run,
  });

  assert.equal(outcome.result.success, true, 'the matured step succeeded');
  assert.equal(completed.length, 1, 'and the run was completed before anything fired');
  assert.equal(world.counts.fire, 1, 'complications were requested exactly once');
  assert.deepEqual(
    world.writer.calls[0].complications.map((entry) => [entry.componentId, entry.bucket]),
    [['c-iron', 'full']]
  );
});
