/**
 * A player's immediate d100 gather opens the roll prompt and resolves with its answer (issue 2398):
 * the versioned descriptor, the GM evaluator, the stage resolution and the Journal command path.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { createGatheringResultCreator } from '../src/gatheringResultCreation.js';
import { chatModeOption } from '../src/systems/bulkChatVisibility.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';
import { safeRollDecision } from '../src/systems/journalPreparedCheck.js';
import {
  createGatheringJournalRunOperations,
  createJournalRunCommandService,
  installGatheringJournalRunAuthority,
  JOURNAL_RUN_SOCKET_KIND,
} from '../src/systems/journalRunCommands.js';
import { preparedDecisionPolicy } from '../src/systems/preparedDecisionPolicy.js';
import { executePublicGather } from '../src/systems/publicGatheringAttempt.js';
import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';

import {
  buildEngine,
  compendiumSourceItem,
  GatheringDocumentActor,
  gatheringFixture,
  resolvedCheck,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';
import { replicatedAuthorityFixture } from './helpers/replicatedJournalAuthority.js';

const loadD100Check = () => import('../src/systems/gatheringD100Check.js');

const GM = Object.freeze({ id: 'gm', isGM: true });
const PLAYER = Object.freeze({ id: 'user-gathering', isGM: false });
const HERB_UUID = 'Compendium.fixture.materials.Item.herb';
const HERB = compendiumSourceItem({ uuid: HERB_UUID, name: 'Herb', img: 'icons/herb.webp' });
const SOURCES = { [HERB_UUID]: HERB };
const COMPONENTS = [
  {
    id: 'herb',
    name: 'Herb',
    img: 'icons/herb.webp',
    registeredItemUuid: HERB_UUID,
    difficulty: 1,
  },
];
const GLOBAL_KEYS = ['game', 'foundry', 'Roll', 'ChatMessage', 'fromUuidSync'];

/** Lint forbids assigning a global property, so each stand-in is defined. */
function setGlobal(key, value) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

let savedGlobals;
beforeEach(() => {
  savedGlobals = Object.fromEntries(GLOBAL_KEYS.map((key) => [key, globalThis[key]]));
});
afterEach(() => {
  for (const [key, value] of Object.entries(savedGlobals)) {
    if (value === undefined) delete globalThis[key];
    else setGlobal(key, value);
  }
});

/** dropRate 45 is a threshold of 56: a face of 50 needs a bonus of 6 or more to award. */
function herbFixture({ dropRate = 45, ...options } = {}) {
  return gatheringFixture({
    components: COMPONENTS,
    dropRows: [{ id: 'row-herb', componentId: 'herb', quantity: 1, dropRate, enabled: true }],
    ...options,
  });
}

const d100Answer = (roll, situationalBonus) => ({
  success: true,
  outcome: null,
  value: roll,
  data: { d100: { roll, situationalBonus } },
  engineEvaluated: true,
});

/**
 * A `Roll` double: `1d100` rolls the next face, `@key` reads its roll data, any other formula
 * `bonusTotal`; `validate` refuses a formula naming `bad`. Every evaluation, with the roll data it
 * was built with and its options, and every post is recorded on `dice`.
 */
function stubDice({ faces = [50], bonusTotal = 0, throwsOn = null } = {}) {
  const dice = { evaluated: [], evaluations: [], posts: [], created: [] };
  const queue = [...faces];
  const totalOf = (formula, data) => {
    if (formula === '1d100') return queue.shift() ?? 1;
    const reference = /^@(\w+)$/u.exec(formula);
    return reference ? Number(data?.[reference[1]]) : bonusTotal;
  };
  class FakeRoll {
    formula;
    data;
    total;

    // Builds through `this`, so a detached call fails as it does on Foundry's `Roll`.
    static validate(formula) {
      return !String(new this(formula).formula).includes('bad');
    }

    static fromData(data) {
      return Object.assign(new FakeRoll(data.formula), { total: data.total });
    }

    constructor(formula, data = {}) {
      this.formula = formula;
      this.data = data;
    }

    async evaluate(options) {
      if (throwsOn?.test(this.formula)) throw new Error('dice offline');
      this.total = totalOf(this.formula, this.data);
      dice.evaluated.push(this.formula);
      dice.evaluations.push({ formula: this.formula, data: this.data, options });
      return this;
    }

    toJSON() {
      return { class: 'Roll', formula: this.formula, total: this.total };
    }

    async toMessage(data, options) {
      dice.posts.push({ formulas: [this.formula], data, options });
      return {};
    }
  }
  setGlobal('Roll', FakeRoll);
  setGlobal('ChatMessage', {
    getSpeaker: ({ actor } = {}) => ({ alias: actor?.name ?? null }),
    create: async (data, options) => {
      dice.created.push({
        formulas: (data.rolls ?? []).map((roll) => roll.formula),
        data,
        options,
      });
      return data;
    },
  });
  return dice;
}

function installWorldGlobals({ viewer, actor, clock }) {
  setGlobal('game', {
    user: viewer,
    users: new Map([
      [GM.id, GM],
      [PLAYER.id, PLAYER],
    ]),
    actors: [actor],
    time: {
      get worldTime() {
        return clock.worldTime;
      },
    },
    settings: { get: () => 'publicroll' },
  });
  let sequence = 0;
  setGlobal('foundry', {
    utils: {
      randomID: () => `fid-${++sequence}`,
      deepClone: (value) => structuredClone(value),
      getProperty: (object, path) =>
        String(path)
          .split('.')
          .reduce((value, key) => value?.[key], object),
      setProperty: (object, path, value) => {
        const keys = String(path).split('.');
        const leaf = keys.pop();
        keys.reduce((node, key) => (node[key] ??= {}), object)[leaf] = value;
        return object;
      },
    },
  });
  setGlobal('fromUuidSync', (uuid) => SOURCES[uuid] ?? null);
}

/** A blind-run secret store keyed by run id, so a blind run hydrates its drawn task. */
function mapBlindStore() {
  const records = new Map();
  return {
    get: (runId) => records.get(runId) ?? null,
    reserve: async (record) => {
      records.set(record.runId, record);
      return record;
    },
    reservedUnits: () => 0,
    canWrite: () => true,
    release: async (runId) => ({ released: records.delete(runId) }),
  };
}

/** The production engine over a real run manager, with no authority installed yet. */
function engineWorld({ fixture = herbFixture(), viewer = PLAYER, rolls = [1] } = {}) {
  const { system, environment, taskId } = fixture;
  const actor = new GatheringDocumentActor('Gatherer', { ownerIds: [PLAYER.id] });
  const clock = { now: 1000, worldTime: 100 };
  installWorldGlobals({ viewer, actor, clock });
  let sequence = 0;
  const runManager = new GatheringRunManager({
    randomID: () => `run-${++sequence}`,
    nowWorldTime: () => clock.worldTime,
    getUserId: () => viewer.id,
    getActors: () => [actor],
  });
  const queue = [...rolls];
  const engine = buildEngine({
    system,
    store: { list: () => [environment], get: (id) => (id === environment.id ? environment : null) },
    actor,
    viewer,
    runManager,
    publications: [],
    nowWorldTime: () => clock.worldTime,
    createResultCreator: createGatheringResultCreator,
    rollD100: () => queue.shift() ?? 1,
    stageJournal: [],
  });
  engine.blindRunStore = mapBlindStore();
  return { engine, actor, runManager, clock, system, environment, taskId, viewer };
}

/** A versioned start under a permissive grant whose operation id is its request id. */
function startVersioned(world, { completionMode = 'manual' } = {}) {
  world.engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: `operation-${context.requestId}`,
    }),
  });
  return world.engine.startVersionedRun({
    actor: world.actor,
    viewer: world.viewer,
    environmentId: world.environment.id,
    taskId: world.taskId,
    completionMode,
    requestId: 'start',
    executionGrant: 'grant',
  });
}

/** A ready versioned run started under a permissive grant, and its check descriptor. */
async function describeStartedRun(world, options = {}) {
  const started = await startVersioned(world, options);
  const run = world.runManager.getActiveRuns(world.actor)[0];
  assert.ok(run, `the run started: ${JSON.stringify(started)}`);
  return world.engine.describeVersionedStageCheck({
    actor: world.actor,
    runId: run.id,
    preparationGrant: 'grant',
    requestId: 'describe',
  });
}

/**
 * The Journal command path over a real authority: the requester's service prompts, the elected GM's
 * service evaluates and executes, and socket messages relay between the two.
 */
function commandWorld({
  fixture = herbFixture(),
  requester = PLAYER,
  rolls = [1],
  answer = async () => ({ confirmed: true, bonus: '0' }),
  electedGM = null,
} = {}) {
  const world = engineWorld({ fixture, viewer: requester, rolls });
  const elected = electedGM ?? (() => GM);
  const authorityWorld = replicatedAuthorityFixture({ now: () => world.clock.now, electedGM });
  const users = new Map([
    [GM.id, GM],
    [PLAYER.id, PLAYER],
  ]);
  const seen = { prompts: [], handoffs: [], messages: [], evaluations: 0, formulaEvaluations: 0 };
  const services = {};
  const operations = createGatheringJournalRunOperations({
    engine: world.engine,
    runManager: world.runManager,
    getService: () => services.gm,
    getUser: (id) => users.get(id) ?? elected(),
  });
  const evaluateCheck = operations.evaluateCheck;
  operations.evaluateCheck = (args) => {
    seen.evaluations += 1;
    return evaluateCheck(args);
  };
  let requestSequence = 0;
  const relay = (from, message) => {
    seen.messages.push(message);
    const toGm = message.kind === JOURNAL_RUN_SOCKET_KIND.REQUEST;
    queueMicrotask(() =>
      toGm
        ? services.gm.handleSocketMessage(message, from.id)
        : services.player.handleSocketMessage(message, elected().id)
    );
  };
  const make = (user) =>
    createJournalRunCommandService({
      authority: authorityWorld.authority,
      operations: { gathering: operations },
      currentUser: user.isGM ? elected : () => user,
      activeGM: elected,
      getUser: (id) => users.get(id) ?? elected(),
      resolveUuid: async (uuid) => (uuid === world.actor.uuid ? world.actor : null),
      emit: (message) => relay(user, message),
      randomId: () => `${user.id}-${++requestSequence}`,
      timeoutMs: 2000,
      now: () => world.clock.now,
      promptCheck: async (descriptor, options) => {
        seen.prompts.push({
          descriptor,
          changed: options?.changed === true,
          items: world.actor.items.length,
          history: world.runManager.getRunHistory(world.actor).length,
        });
        return answer(descriptor, { world, seen, prompt: seen.prompts.length });
      },
      postRollHandoff: async (handoff) => {
        seen.handoffs.push(handoff);
        return { success: true };
      },
    });
  services.gm = make(GM);
  services.player = make(PLAYER);
  const service = requester.isGM ? services.gm : services.player;
  installGatheringJournalRunAuthority({
    engine: world.engine,
    service,
    evaluatePreparedRunCheck: () => {
      seen.formulaEvaluations += 1;
      return { engineEvaluated: true, success: true, data: {} };
    },
  });
  const tokenStatuses = () =>
    Object.values(authorityWorld.state().prepareTokens ?? {}).map((record) => record.status);
  const gather = ({ interactive = true, additionalDice = 0, completionMode = 'manual' } = {}) =>
    executePublicGather({
      requestStart: () =>
        world.engine.requestStart({
          actor: world.actor,
          environmentId: world.environment.id,
          taskId: world.taskId,
          lifecycleVersion: 1,
          completionMode,
        }),
      actor: world.actor,
      executeCommand: (command, options) => service.executeJournalRunCommand(command, options),
      interactive,
      additionalDice,
    });
  const activeRun = () => world.runManager.getActiveRuns(world.actor)[0] ?? null;
  const execute = (run, { interactive = true, trigger = 'manual' } = {}) =>
    service.executeJournalRunCommand(
      {
        actorUuid: world.actor.uuid,
        runType: 'gathering',
        runId: run.id,
        expectedRevision: run.runRevision,
        action: 'execute',
        payload: { trigger },
      },
      { interactive }
    );
  return { ...world, service, services, seen, tokenStatuses, gather, activeRun, execute };
}

/** A system whose gathering checks carry modifiers a d100 prompt must not borrow. */
function modifiedSystemFixture(options = {}) {
  const fixture = herbFixture(options);
  fixture.system.gatheringCraftingCheck = {
    ...fixture.system.gatheringCraftingCheck,
    routed: {
      ...fixture.system.gatheringCraftingCheck.routed,
      rollFormula: '1d20 + 4',
      offerSituationalBonus: false,
      craftingModifier: { activity: 'gathering', formula: '+2' },
    },
    progressive: { rollFormula: '2d6 + 1', offerSituationalBonus: false },
  };
  return fixture;
}

// The descriptor.

test('a ready immediate d100 run describes a required 1d100 player check', async () => {
  const world = engineWorld({ fixture: modifiedSystemFixture() });
  const descriptor = await describeStartedRun(world);

  assert.equal(descriptor.required, true);
  assert.equal(descriptor.publicPrompt.formula, '1d100');
  assert.equal(descriptor.publicPrompt.allowsSituationalModifier, true);
  assert.equal(descriptor.privateEvaluation.rollFormula, '1d100');
  assert.equal(descriptor.publicPrompt.mode, 'd100');
  assert.equal(descriptor.publicPrompt.label, 'Forage');
  assert.equal(descriptor.publicPrompt.actorName, 'Gatherer');
  assert.equal(descriptor.publicPrompt.target ?? null, null, 'no target: each row has its own');
  assert.equal(descriptor.privateEvaluation.flavor, 'Forage — Gathering check');
  assert.equal(descriptor.privateEvaluation.checkConfig, null);
});

test('an opaque blind d100 run describes a secret check that names no formula', async () => {
  const world = engineWorld({
    fixture: { ...herbFixture({ selectionMode: 'blind' }), taskId: null },
  });
  const descriptor = await describeStartedRun(world);

  assert.equal(descriptor.required, true);
  assert.equal(descriptor.privateEvaluation.secret, true);
  assert.equal(descriptor.privateEvaluation.rollFormula, '1d100');
  assert.equal(descriptor.publicPrompt.formula, '');
  assert.equal(descriptor.publicPrompt.actorName, '');
  assert.equal(descriptor.publicPrompt.label, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(
    descriptor.privateEvaluation.flavor,
    'FABRICATE.Gathering.BlindTaskLabel — Gathering check'
  );
});

test('a timed d100 run, a straight task and routed or progressive tasks describe as before', async () => {
  const timed = engineWorld({ fixture: herbFixture({ timeRequirement: { minutes: 1 } }) });
  timed.engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({ operationId: `op-${context.requestId}` }),
  });
  await timed.engine.startVersionedRun({
    actor: timed.actor,
    viewer: timed.viewer,
    environmentId: timed.environment.id,
    taskId: timed.taskId,
    requestId: 'start',
    executionGrant: 'grant',
  });
  const waiting = timed.runManager.getActiveRuns(timed.actor)[0];
  assert.ok(waiting.timeGate, 'a timed run carries its time gate');
  // The Journal offers the completion selector exactly where the engine will not prompt.
  const projected = new RunJournalBuilder({
    gatheringRunSource: timed.runManager,
    getGatheringTask: () => timed.environment.tasks[0],
    nowWorldTime: () => timed.clock.worldTime,
  }).buildListing({
    actor: Object.create(timed.actor, { isOwner: { value: true } }),
    viewer: timed.viewer,
  }).activeRuns[0];
  assert.equal(projected.derivedStatus, 'waiting');
  timed.clock.worldTime += 120;
  const timedDescriptor = await timed.engine.describeVersionedStageCheck({
    actor: timed.actor,
    runId: waiting.id,
    preparationGrant: 'grant',
    requestId: 'describe',
  });
  assert.equal(timedDescriptor.required, false);
  assert.equal(projected.actions.setCompletionMode, !timedDescriptor.required);

  const yieldGroup = {
    id: 'yield',
    name: 'Yield',
    results: [{ id: 'r', componentId: 'herb', quantity: 1 }],
  };
  const straight = await describeStartedRun(
    engineWorld({ fixture: herbFixture({ mode: 'straight', resultGroups: [yieldGroup] }) })
  );
  assert.equal(straight.required, false);

  const routed = await describeStartedRun(
    engineWorld({
      fixture: herbFixture({ mode: 'routed', resultGroups: [yieldGroup] }),
    })
  );
  assert.equal(routed.required, true);
  assert.equal(routed.publicPrompt.mode, 'routedByCheck');
  assert.equal(routed.privateEvaluation.rollFormula, '1d20');

  const progressiveFixture = herbFixture({ mode: 'progressive', resultGroups: [yieldGroup] });
  progressiveFixture.system.gatheringCraftingCheck.progressive = { rollFormula: '1d20' };
  const progressive = await describeStartedRun(engineWorld({ fixture: progressiveFixture }));
  assert.equal(progressive.required, true);
  assert.equal(progressive.publicPrompt.mode, 'progressive');
});

test('the d100 descriptor is the same on every read, so an answer stands for a re-preparation', async () => {
  const world = engineWorld();
  const first = await describeStartedRun(world);
  const run = world.runManager.getActiveRuns(world.actor)[0];
  const second = await world.engine.describeVersionedStageCheck({
    actor: world.actor,
    runId: run.id,
    preparationGrant: 'grant',
    requestId: 'describe-again',
  });
  assert.deepEqual(second, first);
});

// The stage resolves with the answer.

test('the answered face and bonus decide the item row, and the record keeps the face', async () => {
  const awarded = await runRealGatheringAttempt({
    ...herbFixture(),
    sources: SOURCES,
    versioned: true,
    resolvedCheckResult: d100Answer(50, 10),
    rolls: [1],
  });
  assert.equal(awarded.error, null, JSON.stringify(awarded.error));
  assert.equal(awarded.actor.items.length, 1, 'a face of 50 with +10 clears the 56 threshold');
  assert.equal(awarded.record.checkResult.roll, 50);

  const missed = await runRealGatheringAttempt({
    ...herbFixture(),
    sources: SOURCES,
    versioned: true,
    resolvedCheckResult: d100Answer(50, 0),
    rolls: [1],
  });
  assert.equal(missed.actor.items.length, 0, 'the same face with no bonus misses');
  assert.equal(missed.record.checkResult.roll, 50);
});

test('every event roll receives the answered bonus', async () => {
  const fixture = herbFixture({ dropRate: 0 });
  fixture.environment.events = [{ id: 'ev-storm', name: 'Storm', dropRate: 45, enabled: true }];
  const run = (bonus) =>
    runRealGatheringAttempt({
      ...fixture,
      sources: SOURCES,
      versioned: true,
      resolvedCheckResult: d100Answer(50, bonus),
      rolls: [50, 50],
    });

  const lifted = await run(10);
  assert.equal(lifted.error, null, JSON.stringify(lifted.error));
  assert.deepEqual(
    lifted.record.checkResult.events.map((event) => event.id),
    ['ev-storm'],
    'the event roll of 50 plus 10 clears 56'
  );
  const flat = await run(0);
  assert.deepEqual(flat.record.checkResult.events, [], 'without the bonus it does not');
});

test('an event never takes the answered face as its roll', async () => {
  const fixture = herbFixture({ dropRate: 0 });
  fixture.environment.events = [{ id: 'ev-storm', name: 'Storm', dropRate: 45, enabled: true }];
  const attempt = await runRealGatheringAttempt({
    ...fixture,
    sources: SOURCES,
    versioned: true,
    resolvedCheckResult: d100Answer(5, 10),
    rolls: [50],
  });
  assert.equal(attempt.error, null, JSON.stringify(attempt.error));
  assert.equal(attempt.record.checkResult.roll, 5);
  assert.deepEqual(
    attempt.record.checkResult.events.map((event) => event.id),
    ['ev-storm'],
    "the event rolls its own 50 plus 10, never the face's 5 plus 10"
  );
});

test('a face outside 1 to 100 falls back to the d100 seam, and the bonus still applies', async () => {
  for (const face of [null, 0, 101, 50.5]) {
    const attempt = await runRealGatheringAttempt({
      ...herbFixture(),
      sources: SOURCES,
      versioned: true,
      resolvedCheckResult: d100Answer(face, 10),
      rolls: [50],
    });
    assert.equal(attempt.error, null, `${face}: ${JSON.stringify(attempt.error)}`);
    assert.equal(attempt.record.checkResult.roll, 50, `${face} is not a face`);
    assert.equal(attempt.actor.items.length, 1, `${face}: the seam's 50 plus 10 awards`);
  }
});

test('a routed task handed a d100 answer resolves as misconfigured and awards nothing', async () => {
  const attempt = await runRealGatheringAttempt({
    ...herbFixture({
      mode: 'routed',
      resultGroups: [
        { id: 'yield', name: 'Yield', results: [{ id: 'r', componentId: 'herb', quantity: 2 }] },
      ],
    }),
    sources: SOURCES,
    versioned: true,
    resolvedCheckResult: {
      ...resolvedCheck(true, 'Yield'),
      data: { d100: { roll: 50, situationalBonus: 0 } },
    },
  });
  assert.equal(attempt.actor.items.length, 0);
  assert.deepEqual(
    attempt.response?.blockedReasons?.map((reason) => reason.code),
    ['TASK_MISCONFIGURED'],
    JSON.stringify(attempt.response)
  );
  assert.equal(attempt.response.blockedReasons[0].data.code, 'CHECK_MODE_MISMATCH');
});

// The GM evaluator.

/** Evaluate an answer the way the Journal does: the safe decision under the bound policy. */
async function evaluateAnswer(
  answer,
  { secret = false, prompt = {}, actor = { name: 'Gatherer' } } = {}
) {
  const { describeD100Check, evaluatePreparedD100Check } = await loadD100Check();
  const descriptor = describeD100Check({
    actor,
    run: { id: 'run-1', taskId: secret ? 'blind:env-fixture' : 'task-fixture' },
    system: { id: 'system-fixture' },
    environment: { id: 'env-fixture' },
    task: { id: 'task-fixture', name: 'Forage', resolutionMode: 'd100' },
    localize: (key) => key,
  });
  const decision = {
    ...safeRollDecision(answer),
    ...preparedDecisionPolicy({ ...descriptor.publicPrompt, ...prompt }),
  };
  return evaluatePreparedD100Check({
    actor,
    privateEvaluation: descriptor.privateEvaluation,
    decision,
  });
}

test('the evaluator rolls the 1d100 and hands it back with a typed bonus used as typed', async () => {
  const dice = stubDice({ faces: [42] });
  const result = await evaluateAnswer({ bonus: '7', rollMode: 'publicroll' });

  assert.equal(result.engineEvaluated, true);
  assert.equal(result.value, 42);
  assert.deepEqual(result.data.d100, { roll: 42, situationalBonus: 7 });
  assert.deepEqual(dice.evaluated, ['1d100'], 'a typed number rolls no dice');
  assert.equal(result.rollHandoff.serializedRoll.formula, '1d100');
  assert.equal(result.rollHandoff.serializedPreRolls, undefined);
  assert.equal(result.rollHandoff.rollMode, 'publicroll');
  assert.equal(result.rollHandoff.flavor, 'Forage — Gathering check (situational +7)');
  assert.deepEqual(result.rollHandoff, JSON.parse(JSON.stringify(result.rollHandoff)));
  assert.deepEqual(dice.posts, [], "a visible roll is the requester's to post");
});

test('a dice bonus is rolled once, rides with the 1d100, and clears or misses by its total', async () => {
  for (const [bonusTotal, awards] of [
    [10, 1],
    [2, 0],
  ]) {
    const dice = stubDice({ faces: [50], bonusTotal });
    const result = await evaluateAnswer({ bonus: '1d4 + 1' });
    assert.equal(result.data.d100.situationalBonus, bonusTotal);
    assert.deepEqual(dice.evaluated, ['1d4 + 1', '1d100']);
    assert.deepEqual(
      dice.evaluations.map(({ options }) => options),
      [{ allowInteractive: false }, { allowInteractive: false }],
      'neither roll may open an interactive dice prompt'
    );
    assert.deepEqual(
      result.rollHandoff.serializedPreRolls.map((roll) => roll.formula),
      ['1d4 + 1']
    );
    const { rollHandoff: _handoff, ...checkResult } = result;
    const attempt = await runRealGatheringAttempt({
      ...herbFixture(),
      sources: SOURCES,
      versioned: true,
      resolvedCheckResult: checkResult,
    });
    assert.equal(attempt.actor.items.length, awards, `a bonus of ${bonusTotal}`);
  }
});

test('a malformed or throwing bonus counts as 0 and rolls no pre-roll', async () => {
  stubDice({ faces: [50] });
  const malformed = await evaluateAnswer({ bonus: '1dbad' });
  assert.equal(malformed.data.d100.situationalBonus, 0);
  assert.equal(malformed.rollHandoff.serializedPreRolls, undefined);
  assert.equal(malformed.rollHandoff.flavor, 'Forage — Gathering check');

  stubDice({ faces: [50], throwsOn: /^1d4/ });
  const thrown = await evaluateAnswer({ bonus: '1d4' });
  assert.equal(thrown.data.d100.situationalBonus, 0);
  assert.equal(thrown.data.d100.roll, 50);
  assert.equal(thrown.rollHandoff.serializedPreRolls, undefined);
});

test('a dice bonus is rolled against the actor roll data', async () => {
  const dice = stubDice();
  const { rollSituationalBonus } = await loadD100Check();
  const bonus = await rollSituationalBonus('@prof', { getRollData: () => ({ prof: 3 }) });

  assert.equal(bonus.total, 3);
  assert.deepEqual(
    dice.evaluations.map(({ formula, data }) => ({ formula, data })),
    [{ formula: '@prof', data: { prof: 3 } }]
  );
});

test('the bonus is dropped when the bound policy does not allow it', async () => {
  stubDice({ faces: [50] });
  const result = await evaluateAnswer(
    { bonus: '9' },
    { prompt: { allowsSituationalModifier: false } }
  );
  assert.equal(result.data.d100.situationalBonus, 0);
});

test('an unknown or absent roll mode hands back null, so the client selector applies', async () => {
  for (const rollMode of [undefined, 'shoutroll']) {
    stubDice({ faces: [50] });
    const result = await evaluateAnswer({ bonus: null, rollMode });
    assert.equal(result.rollHandoff.rollMode, null, String(rollMode));
  }
  stubDice({ faces: [50] });
  const chosen = await evaluateAnswer({ rollMode: 'blindroll' });
  assert.equal(chosen.rollHandoff.rollMode, 'blindroll');
});

test('bought dice are refused as not offered', async () => {
  const dice = stubDice({ faces: [50] });
  const result = await evaluateAnswer({ additionalDice: 2 });
  assert.equal(result.additionalDiceRefusal, 'notOffered');
  assert.equal(result.engineEvaluated, undefined);
  assert.deepEqual(dice.evaluated, [], 'nothing is rolled');
});

test('with no dice engine, or one that throws, the face is null and nothing is handed back', async () => {
  delete globalThis.Roll;
  const absent = await evaluateAnswer({ bonus: '3' });
  assert.equal(absent.value, null);
  assert.deepEqual(absent.data.d100, { roll: null, situationalBonus: 3 });
  assert.equal(absent.rollHandoff, undefined);
  assert.equal(absent.engineEvaluated, true);

  const dice = stubDice({ throwsOn: /^1d100$/ });
  const thrown = await evaluateAnswer({ bonus: '3' });
  assert.equal(thrown.value, null);
  assert.equal(thrown.data.d100.roll, null);
  assert.equal(thrown.rollHandoff, undefined);
  assert.deepEqual([...dice.posts, ...dice.created], []);
});

test('a secret check posts GM-private on the GM, its bonus bundled, and hands nothing back', async () => {
  const dice = stubDice({ faces: [50], bonusTotal: 4 });
  const result = await evaluateAnswer({ bonus: '1d6', rollMode: 'publicroll' }, { secret: true });

  assert.equal(result.secret, true);
  assert.equal(result.rollHandoff, undefined);
  assert.deepEqual(result.data.d100, { roll: 50, situationalBonus: 4 });
  assert.equal(dice.created.length, 1, 'one bundled message');
  assert.deepEqual(dice.created[0].formulas, ['1d100', '1d6']);
  assert.deepEqual(dice.created[0].options, chatModeOption('gmroll'));
  assert.equal(
    dice.created[0].data.flavor,
    'FABRICATE.Gathering.BlindTaskLabel — Gathering check (situational +4)'
  );
});

// The Journal command path.

test('an interactive d100 gather prompts once and resolves only with the answer', async () => {
  const dice = stubDice({ faces: [50] });
  const world = commandWorld({ answer: async () => ({ confirmed: true, bonus: '10' }) });
  const result = await world.gather();

  assert.equal(world.seen.prompts.length, 1, JSON.stringify(result));
  assert.equal(world.seen.prompts[0].descriptor.formula, '1d100');
  assert.equal(world.seen.prompts[0].items, 0, 'nothing is awarded before the answer');
  assert.equal(world.seen.prompts[0].history, 0, 'nothing is resolved before the answer');
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(world.actor.items.length, 1, 'the face of 50 plus 10 awards');
  assert.equal(world.runManager.getRunHistory(world.actor)[0].checkResult.roll, 50);
  assert.equal(world.seen.evaluations, 1);
  assert.equal(world.seen.formulaEvaluations, 0, 'never the formula evaluator');
  assert.equal(world.seen.handoffs.length, 1, 'the requester posts the roll once');
  const [handoff] = world.seen.handoffs;
  assert.deepEqual(handoff, JSON.parse(JSON.stringify(handoff)));
  assert.equal(handoff.serializedRoll.formula, '1d100');
  assert.equal(
    handoff.serializedRoll.total,
    world.runManager.getRunHistory(world.actor)[0].checkResult.roll,
    'the posted roll is the face the stage resolved with'
  );
  assert.deepEqual(dice.posts, [], 'the GM posts nothing for a visible roll');
});

test('a dismissed d100 prompt releases its token, executes nothing and prompts again later', async () => {
  const dice = stubDice({ faces: [50] });
  const world = commandWorld({
    answer: async (_descriptor, { prompt }) =>
      prompt === 1 ? { confirmed: false } : { confirmed: true },
  });
  const result = await world.gather();

  assert.equal(result.cancelled, true, JSON.stringify(result));
  const releases = world.seen.messages.filter((message) => message.action === 'releaseCheck');
  assert.equal(releases.length, 1);
  const run = world.activeRun();
  assert.ok(run, 'the run waits in the Journal');
  assert.equal(releases[0].expectedRevision, run.runRevision, 'released at the same revision');
  assert.equal(world.runManager.canExecuteRun(run), true, 'and it is still ready');
  assert.deepEqual(world.runManager.getRunHistory(world.actor), []);
  assert.equal(world.actor.items.length, 0);
  assert.deepEqual(world.tokenStatuses(), ['released']);
  assert.equal(world.seen.evaluations, 0, 'the GM never evaluates a dismissed check');
  assert.deepEqual(dice.evaluated, [], 'and no dice are rolled');

  const collected = await world.execute(run);
  assert.equal(world.seen.prompts.length, 2, 'the ready action prompts again');
  assert.equal(collected.success, true, JSON.stringify(collected));
  assert.equal(world.runManager.getRunHistory(world.actor).length, 1);
});

test('an active-GM requester prompts on its own client', async () => {
  stubDice({ faces: [50] });
  const world = commandWorld({ requester: GM });
  const result = await world.gather();

  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(world.seen.prompts.length, 1);
  assert.equal(
    world.seen.messages.filter((message) => message.kind === JOURNAL_RUN_SOCKET_KIND.REQUEST)
      .length,
    0,
    'nothing crosses the socket'
  );
  assert.equal(world.seen.handoffs.length, 1);
});

test('a non-interactive gather settles under a token with no prompt and posts nothing', async () => {
  const dice = stubDice({ faces: [73] });
  const world = commandWorld();
  const result = await world.gather({ interactive: false });

  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(world.seen.prompts.length, 0);
  assert.deepEqual(world.tokenStatuses(), ['consumed'], 'a prepare token was issued and consumed');
  assert.equal(world.runManager.getRunHistory(world.actor)[0].checkResult.roll, 73);
  assert.deepEqual(world.seen.handoffs, [], 'the requester posts nothing');
  assert.deepEqual([...dice.posts, ...dice.created], []);
});

test('a non-interactive opaque blind gather posts GM-private and its reply carries no roll', async () => {
  const dice = stubDice({ faces: [73] });
  const world = commandWorld({
    fixture: { ...herbFixture({ selectionMode: 'blind' }), taskId: null },
  });
  const result = await world.gather({ interactive: false });

  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.rollHandoff, undefined);
  assert.equal(dice.posts.length, 1, 'the GM posts the roll');
  assert.deepEqual(dice.posts[0].options, { ...chatModeOption('gmroll'), create: true });
  assert.deepEqual(world.seen.handoffs, []);
});

test('an expired token settles under a fresh one with exactly one prompt', async () => {
  stubDice({ faces: [50] });
  const world = commandWorld({
    answer: async (_descriptor, { world: current }) => {
      current.clock.now += 61_000;
      return { confirmed: true, bonus: '10' };
    },
  });
  const result = await world.gather();

  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(world.seen.prompts.length, 1);
  assert.deepEqual(world.tokenStatuses(), ['released', 'consumed']);
  assert.equal(world.actor.items.length, 1);
});

test('two prompts on one run settle once', { timeout: 5000 }, async () => {
  stubDice({ faces: [50, 50] });
  let release;
  const bothOpen = new Promise((resolve) => (release = resolve));
  const world = commandWorld({
    answer: async (_descriptor, { prompt }) => {
      if (prompt === 2) release();
      await bothOpen;
      return { confirmed: true };
    },
  });
  await world.engine.requestStart({
    actor: world.actor,
    environmentId: world.environment.id,
    taskId: world.taskId,
    lifecycleVersion: 1,
  });
  const run = world.activeRun();
  const replies = await Promise.all([world.execute(run), world.execute(run)]);

  const outcomes = replies.map((reply) => (reply.success === true ? 'settled' : reply.reason));
  assert.deepEqual(new Set(outcomes), new Set(['settled', 'stale-run']), JSON.stringify(replies));
  assert.equal(world.seen.prompts.length, 2);
  assert.equal(world.seen.evaluations, 1, 'the check is evaluated once');
  assert.equal(world.runManager.getRunHistory(world.actor).length, 1);
});

/** A gather whose answer changes the elected GM while the prompt is open. */
async function electionRace(requester) {
  stubDice({ faces: [50] });
  let election = 0;
  const world = commandWorld({
    requester,
    electedGM: () => ({ id: `gm-${election}`, isGM: true }),
    answer: async () => {
      election += 1;
      return { confirmed: true, bonus: '10' };
    },
  });
  const result = await world.gather();

  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(world.seen.prompts.length, 1, 'the unchanged check is not asked again');
  assert.equal(world.seen.evaluations, 1);
  assert.equal(world.actor.items.length, 1);
  assert.deepEqual(world.tokenStatuses(), ['active', 'consumed']);
}

test('an answer settles once when the elected GM changes during the prompt', () =>
  electionRace(GM));

test("an answer settles once when the elected GM changes during a player's prompt", () =>
  electionRace(PLAYER));

test('a stale revision at answer time executes nothing', async () => {
  stubDice({ faces: [50] });
  const world = commandWorld({
    answer: async (_descriptor, { world: current }) => {
      const run = current.runManager.getActiveRuns(current.actor)[0];
      await current.runManager.setCompletionMode(current.actor, run.id, 'worldTime', {
        expectedRevision: run.runRevision,
      });
      return { confirmed: true };
    },
  });
  const result = await world.gather();

  assert.equal(result.success, false, JSON.stringify(result));
  assert.equal(result.reason, 'stale-run');
  assert.equal(world.seen.evaluations, 0);
  assert.deepEqual(world.runManager.getRunHistory(world.actor), []);
  assert.ok(world.activeRun(), 'the run is still active');
});

// Versioned operations read the actor afresh, not a cache another client's write went behind.

const persistedRuns = (world) => world.actor.getFlag('fabricate', 'gatheringRuns');

/** Restores `record` to the flag, caches it, then deletes it from the flag behind the cache. */
function cacheThenDeleteBehind(world, record) {
  persistedRuns(world).active[record.id] = record;
  world.runManager.invalidateCache(world.actor.uuid);
  assert.equal(world.runManager.getActiveRuns(world.actor).length, 1, 'the cache holds the run');
  delete persistedRuns(world).active[record.id];
}

test('a versioned describe, execute or cancel treats a run deleted behind the cache as gone', async () => {
  stubDice({ faces: [50] });
  const world = engineWorld();
  await describeStartedRun(world);
  const record = structuredClone(world.runManager.getActiveRuns(world.actor)[0]);
  const target = { actor: world.actor, runId: record.id, expectedRevision: record.runRevision };
  const operations = {
    describe: () => world.engine.describeVersionedStageCheck({ ...target, preparationGrant: 'g' }),
    execute: () => world.engine.executeVersionedStage({ ...target, executionGrant: 'g' }),
    cancel: () => world.engine.cancelVersionedRun({ ...target, executionGrant: 'g' }),
  };
  for (const [name, operate] of Object.entries(operations)) {
    cacheThenDeleteBehind(world, record);
    await assert.rejects(operate(), { code: 'RUN_NOT_FOUND' }, name);
  }
  assert.deepEqual(world.actor.items, []);
});

test('a replayed versioned start finds its committed run when the cache never saw it', async () => {
  const world = engineWorld();
  const started = await startVersioned(world);
  const record = structuredClone(world.runManager.getActiveRuns(world.actor)[0]);
  delete persistedRuns(world).active[record.id];
  world.runManager.invalidateCache(world.actor.uuid);
  assert.deepEqual(world.runManager.getActiveRuns(world.actor), [], 'the cache holds no run');
  persistedRuns(world).active[record.id] = record;

  const replayed = await startVersioned(world);
  assert.equal(replayed.runId, started.runId, JSON.stringify(replayed));
  world.runManager.invalidateCache(world.actor.uuid);
  assert.deepEqual(
    world.runManager.getActiveRuns(world.actor).map((run) => run.id),
    [record.id]
  );
});

test('a Journal execute of a run deleted behind the cache reports it not found', async () => {
  stubDice({ faces: [50] });
  const world = commandWorld({
    fixture: herbFixture({ timeRequirement: { minutes: 1 } }),
    rolls: [90],
  });
  await world.gather({ completionMode: 'worldTime' });
  const waiting = world.activeRun();
  assert.ok(waiting?.timeGate, 'the run waits on its time gate');
  delete persistedRuns(world).active[waiting.id];
  world.clock.worldTime += 120;

  const result = await world.execute(waiting, { trigger: 'worldTime' });
  assert.equal(result.reason, 'run-not-found', JSON.stringify(result));
  assert.deepEqual(world.actor.items, []);
  assert.deepEqual(persistedRuns(world).history ?? [], []);
});

// Timed d100 runs are not player checks.

test('a timed d100 run cleared of its time requirement mid-wait completes at world time unprompted', async () => {
  stubDice({ faces: [50] });
  const world = commandWorld({
    fixture: herbFixture({ timeRequirement: { minutes: 1 } }),
    rolls: [90],
  });
  await world.gather({ completionMode: 'worldTime' });
  const waiting = world.activeRun();
  assert.ok(waiting?.timeGate, 'the run waits on its time gate');
  // The stage reads the persisted run's task snapshot, so clear it there as well as live.
  world.environment.tasks[0].timeRequirement = null;
  const persisted = world.actor.getFlag('fabricate', 'gatheringRuns').active[waiting.id];
  const snapshotTask = persisted.economyEvidence.runtimeSnapshot.task;
  assert.ok(snapshotTask.timeRequirement, 'the snapshot carried the time requirement');
  snapshotTask.timeRequirement = null;
  world.clock.worldTime += 120;

  const result = await world.execute(waiting, { trigger: 'worldTime' });
  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(world.tokenStatuses(), [], 'no prepare token is issued');
  assert.equal(world.seen.prompts.length, 0);
  assert.equal(world.runManager.getRunHistory(world.actor).length, 1);
});

test('a timed d100 run collected manually opens no prompt', async () => {
  stubDice({ faces: [50] });
  const world = commandWorld({
    fixture: herbFixture({ timeRequirement: { minutes: 1 } }),
    rolls: [90],
  });
  await world.gather();
  const waiting = world.activeRun();
  world.clock.worldTime += 120;

  const result = await world.execute(waiting);
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(world.seen.prompts.length, 0);
  assert.deepEqual(world.tokenStatuses(), []);
});

test('an active d100 run records no roll while it waits, prompts or is dismissed (issue 2324)', async () => {
  stubDice({ faces: [50] });
  const recorded = (world, run) => world.actor.getFlag('fabricate', 'gatheringRuns').active[run.id];
  const firstActive = (world) => world.runManager.getActiveRuns(world.actor)[0];

  const timed = commandWorld({ fixture: herbFixture({ timeRequirement: { minutes: 1 } }) });
  await timed.gather();
  timed.clock.worldTime += 120;
  const waiting = firstActive(timed);
  assert.ok(waiting.timeGate, 'a timed run waits on its time gate');
  assert.equal(recorded(timed, waiting).checkResult, undefined, 'a ready timed run has no roll');

  let atPrompt;
  const untimed = commandWorld({
    answer: async (_descriptor, { world }) => {
      atPrompt = recorded(world, firstActive(world));
      return { confirmed: false };
    },
  });
  await untimed.gather();
  assert.ok(atPrompt, 'the prompt opened against an active run');
  assert.equal(atPrompt.checkResult, undefined, 'the prompt precedes any roll');
  assert.equal(
    recorded(untimed, firstActive(untimed)).checkResult,
    undefined,
    'a dismissed prompt leaves a ready run with no roll'
  );
});

test('offersD100Prompt keys on the run, not the live task', async () => {
  const { offersD100Prompt } = await loadD100Check();
  const task = { resolutionMode: 'd100', timeRequirement: null };
  assert.equal(offersD100Prompt({ task, run: { taskId: 't' } }), true);
  assert.equal(
    offersD100Prompt({ task, run: { taskId: 't', timeGate: { durationSeconds: 60 } } }),
    false
  );
  assert.equal(
    offersD100Prompt({ task: { resolutionMode: 'routed' }, run: { taskId: 't' } }),
    false
  );
  assert.equal(offersD100Prompt({ task: {}, run: { taskId: 't' } }), false);
});
