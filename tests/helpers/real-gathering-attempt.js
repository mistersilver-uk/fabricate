/** The REAL gathering writer chain, as one call (issue 1648, TP14-B). */

import { GatheringEngine } from '../../src/systems/GatheringEngine.js';
import { GatheringRichStateService } from '../../src/systems/GatheringRichStateService.js';

import { routedSystemCheck, stubRoll } from './gathering.js';
import { FakeActor } from './run-manager-fakes.js';

/**
 * A Foundry Actor document double: merging acknowledged flag writes (inherited) plus
 * embedded Item creation, so award writers reach a real create/update boundary.
 */
export class GatheringDocumentActor extends FakeActor {
  /** `ownerIds` reaches `FakeActor#testUserPermission`, which drives the inherited `isOwner`. */
  constructor(name = 'Gatherer', { ownerIds = [] } = {}) {
    super(name, { ownerIds });
    this.documentName = 'Actor';
    this.items = [];
  }

  async createEmbeddedDocuments(_type, data) {
    return data.map((source) => this.items[this.items.push(embeddedItem(this, source)) - 1]);
  }
}

function embeddedItem(actor, source) {
  const id = `item-${actor.items.length}`;
  return {
    ...structuredClone(source),
    id,
    uuid: `${actor.uuid}.Item.${id}`,
    documentName: 'Item',
    parent: actor,
    _source: structuredClone(source),
    async update(patch) {
      for (const [path, value] of Object.entries(patch)) writePath(this._source, path, value);
      this.system = structuredClone(this._source.system);
      return this;
    },
  };
}

function readPath(object, path) {
  return String(path ?? '')
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function writePath(object, path, value) {
  const keys = String(path ?? '').split('.');
  const leaf = keys.pop();
  keys.reduce((node, key) => (node[key] ??= {}), object)[leaf] = value;
  return object;
}

/**
 * Wrap real {@link GatheringRunManager} terminal-writing methods so a caller can inspect the
 * exact arguments each received, without changing behaviour — every wrapper still delegates
 * through to the original. Also appends one `stageJournal` entry per call, in call order, so a
 * caller can assert ordering against other stage markers (`respond`, `reservation-released`).
 */
function recordRunManagerCalls(runManager, calls, stageJournal) {
  const wrap = (name, toSnapshot) => {
    const original = runManager[name].bind(runManager);
    runManager[name] = async (...args) => {
      calls[name].push(toSnapshot(...args));
      stageJournal.push({ stage: name });
      return original(...args);
    };
  };
  wrap('createTerminalRun', (actor, runData, status, payload, options) => ({ actor, runData, status, payload, options }));
  wrap('completeRun', (actor, run, status, payload, options) => ({ actor, run, status, payload, options }));
  wrap('settleHistory', (actor, runId, payload) => ({ actor, runId, payload }));
  wrap('cancelRun', (actor, runId, options) => ({ actor, runId, options }));
  wrap('clearActiveRun', (actor, runId, options) => ({ actor, runId, options }));
}

/**
 * Wire the production engine to its real collaborators, doubling only the world around it.
 *
 * `engine._terminalStart` is wrapped to append a `respond` stage marker (issue 1700's stage-9),
 * and `blindRunStore` is a minimal double — not {@link GatheringBlindRunStore}'s real
 * reservation-count semantics, only enough to prove when a run's provisional claim is released
 * relative to commit and respond, via a `reservation-released` marker.
 */
function buildEngine({
  system, store, actor, viewer, runManager, publications, nowWorldTime, createResultCreator, rollD100,
  isPrimaryGM = () => true, toolBreakage = null, stageJournal,
}) {
  const rich = new GatheringRichStateService({ environmentStore: store, rollD100, nowWorldTime });
  const engine = new GatheringEngine({
    environmentStore: store,
    runManager,
    // `revealTask`/`listRevealedTaskIds` are bound so the reveal POLICY really runs: without
    // them a blind attempt records no reveal and every reveal-gated read answers "hidden"
    // whatever the policy says, which cannot tell a working gate from an absent one.
    richState: Object.fromEntries(
      ['resolveD100Attempt', 'resolveEnvironmentalEvents', 'commitAcceptedAttempt', 'revealTask', 'listRevealedTaskIds'].map((name) => [name, rich[name].bind(rich)])
    ),
    getSystems: () => [system],
    getSelectableActors: () => [actor],
    isActorSelectable: () => true,
    isGamePaused: () => false,
    isPrimaryGM,
    getRunViewer: () => viewer,
    evaluator: { evaluateVisibility: async () => ({ visible: true }) },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    toolBreakage,
    resultCreator: createResultCreator({ getSystem: () => system }),
    hookPublisher: { publishAttemptCompleted: (payload) => publications.push(payload) },
    nowWorldTime,
    localize: (key) => key,
  });
  const originalTerminalStart = engine._terminalStart.bind(engine);
  engine._terminalStart = async (...args) => {
    stageJournal.push({ stage: 'respond' });
    return originalTerminalStart(...args);
  };
  engine.blindRunStore = {
    get: () => true,
    release: async () => {
      stageJournal.push({ stage: 'reservation-released' });
      return { released: true };
    },
  };
  return engine;
}

/**
 * Execute one gathering attempt, reload it from serialized flags and project it.
 *
 * `matureWorldTime`, when set, advances the shared clock past a `timeRequirement`-bearing
 * task's start and drives the waiting run to completion through the real maturity entry each
 * lifecycle uses in production — `processWorldTime` for a legacy run, `executeVersionedStage`
 * for a versioned one — rather than through `startAttempt`/`startVersionedRun` alone. Its result
 * is returned as `maturedResult`; a persistence throw on that path is caught the same as a
 * throw from the start call, into `error`.
 *
 * @param {object} options Composed `system`/`environment`, acting `viewer`, d100 `rolls`,
 *   `sources` backing `fromUuidSync`, the versioned `resolvedCheckResult`, and the maturity,
 *   primary-GM and tool-breakage seams above.
 * @returns {Promise<object>} Response/error, maturity and call-instrumentation data, the
 *   reloaded record and a `project` seam.
 */
export async function runRealGatheringAttempt({
  system,
  environment,
  taskId = null,
  viewer = { id: 'user-gathering', isGM: false },
  // The ordinary case: a player OWNS the character they gather with. Hard-coding no owner
  // would hide every ownership-sensitive branch behind a permission nobody holds.
  actor = new GatheringDocumentActor('Gatherer', { ownerIds: [viewer.id] }),
  rolls = [1],
  sources = {},
  versioned = false,
  resolvedCheckResult = null,
  rollTotal = 18,
  worldTime = 100,
  matureWorldTime = null,
  // Runs once, between start and maturity, only when `matureWorldTime` is set — the seam a
  // cell drives state drift through (e.g. deleting the task the waiting run points at) that a
  // single start-to-maturity call cannot otherwise reach.
  beforeMature = null,
  // Runs once, before `startAttempt`/`startVersionedRun` — the seam a cell reaches the run
  // manager itself through, e.g. removing `createTerminalRun` to pin the immediate refusal.
  beforeStart = null,
  isPrimaryGM = () => true,
  toolBreakage = null,
} = {}) {
  const { GatheringRunManager } = await import('../../src/systems/GatheringRunManager.js');
  const { RunJournalBuilder } = await import('../../src/ui/presenters/RunJournalBuilder.js');
  const { createGatheringResultCreator } = await import('../../src/gatheringResultCreation.js');
  const keys = ['game', 'foundry', 'Roll', 'ChatMessage', 'fromUuidSync'];
  const saved = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const queue = [...rolls];
  const publications = [];
  const chat = [];
  const stageJournal = [];
  const runManagerCalls = {
    createTerminalRun: [], completeRun: [], settleHistory: [], cancelRun: [], clearActiveRun: [],
  };
  let sequence = 0;
  let now = worldTime;
  const store = { list: () => [environment], get: (id) => (id === environment.id ? environment : null) };
  const runManager = new GatheringRunManager({
    randomID: () => `run-${++sequence}`,
    nowWorldTime: () => now,
    getUserId: () => viewer.id,
    getActors: () => [actor],
  });
  recordRunManagerCalls(runManager, runManagerCalls, stageJournal);
  try {
    globalThis.game = {
      user: viewer, users: new Map([[viewer.id, viewer]]), actors: [actor], time: { worldTime: now },
      settings: { get: () => 'publicroll' },
    };
    globalThis.foundry = {
      utils: {
        randomID: () => `fid-${++sequence}`,
        deepClone: (value) => structuredClone(value),
        getProperty: readPath,
        setProperty: writePath,
      },
    };
    globalThis.fromUuidSync = (uuid) => sources[uuid] ?? null;
    globalThis.ChatMessage = { getSpeaker: () => ({ actor: actor.id }), create: async (data) => chat.push(data) };
    stubRoll(rollTotal, [{ number: 1, faces: 20, total: rollTotal }]);
    const engine = buildEngine({ system, store, actor, viewer, runManager, publications, nowWorldTime: () => now,
      createResultCreator: createGatheringResultCreator,
      rollD100: () => queue.shift() ?? 1,
      isPrimaryGM, toolBreakage, stageJournal });
    engine.installVersionedRunAuthority({
      consumeExecutionGrant: async (_grant, context) => ({ operationId: `operation-${context.requestId}`, resolvedCheckResult }),
    });
    if (typeof beforeStart === 'function') await beforeStart({ runManager, engine });
    const args = { actor, viewer, environmentId: environment.id, taskId, requestId: 'start', executionGrant: 'grant' };
    let response = null;
    let error = null;
    let maturedResult;
    try {
      response = versioned ? await engine.startVersionedRun(args) : await engine.startAttempt(args);
      if (matureWorldTime != null) {
        now = matureWorldTime;
        if (typeof beforeMature === 'function') await beforeMature({ environment, task: environment.tasks.find((candidate) => candidate.id === taskId) ?? null, actor, runManager, engine });
        if (versioned) {
          const waiting = runManager.getActiveRuns(actor)[0];
          maturedResult = await engine.executeVersionedStage({ actor, runId: waiting.id, expectedRevision: waiting.runRevision, requestId: 'mature', executionGrant: 'grant' });
        } else {
          maturedResult = await engine.processWorldTime(now);
        }
      } else {
        const waiting = runManager.getActiveRuns(actor)[0];
        if (versioned && waiting) {
          response = await engine.executeVersionedStage({ actor, runId: waiting.id, expectedRevision: waiting.runRevision, requestId: 'execute', executionGrant: 'grant' });
        }
      }
    } catch (failure) {
      error = { code: failure.code, message: failure.message };
    }
    actor._flags = JSON.parse(JSON.stringify(actor._flags));
    const fresh = new GatheringRunManager();
    return {
      actor,
      response,
      maturedResult,
      error,
      chat,
      publications,
      stageJournal,
      runManagerCalls,
      history: fresh.getRunHistory(actor),
      record: fresh.getRunHistory(actor)[0],
      project: ({ projectionViewer = viewer, ...builder } = {}) =>
        new RunJournalBuilder({
          gatheringRunSource: fresh,
          getSystem: () => system,
          getGatheringTask: (_environmentId, id) => environment.tasks.find((task) => task.id === id) ?? null,
          // The SAME decision the chat card takes, from the engine that wrote the record.
          isGatheringIdentityHidden: (args) => engine.isHistoricalBlindIdentityHidden(args),
          getResultItem: () => null,
          getComponent: () => null,
          localize: (key) => key,
          nowWorldTime: () => now,
          ...builder,
        }).buildListing({ actor, viewer: projectionViewer }).history[0],
    };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

/**
 * Compose the system/environment/task trio {@link runRealGatheringAttempt} executes.
 *
 * @param {object} [options] Resolution `mode`, authored rows/groups, resolved `components`,
 * environment `selectionMode`, the system's `failureResultPolicy` and the task's
 * `timeRequirement` — null resolves immediately; set, it waits and matures (see
 * {@link runRealGatheringAttempt}'s `matureWorldTime`).
 */
export function gatheringFixture({
  mode = 'd100',
  dropRows = [],
  resultGroups = [],
  components = [],
  selectionMode = 'targeted',
  failureResultPolicy = null,
  chatOutput = false,
  taskName = 'Forage',
  taskImg = null,
  timeRequirement = null,
} = {}) {
  const task = {
    id: 'task-fixture',
    name: taskName,
    img: taskImg,
    enabled: true,
    resolutionMode: mode,
    toolIds: [],
    timeRequirement,
    resultGroups,
    dropRows,
  };
  const environment = {
    id: 'env-fixture',
    craftingSystemId: 'system-fixture',
    name: 'Fixture Site',
    enabled: true,
    selectionMode,
    tasks: [task],
    events: [],
    conditions: {},
    rules: { rewardSelectionMode: 'allDrops' },
  };
  const system = {
    id: environment.craftingSystemId,
    name: 'Fixture System',
    enabled: true,
    features: { gathering: true, chatOutput },
    gatheringCraftingCheck: {
      ...routedSystemCheck({ tierName: 'Yield', failureTierName: 'Ruined' }),
      ...(failureResultPolicy ? { failureResultPolicy } : {}),
    },
    components,
  };
  return { system, environment, task, taskId: task.id };
}

/** A pack-owned source Item double: what an award is created FROM, never where it lands. */
export function compendiumSourceItem({ uuid, name, img }) {
  const data = { name, img, type: 'loot', system: { quantity: 1 } };
  return { uuid, ...data, toObject: () => structuredClone(data) };
}

/** The versioned execution authority's recorded answer for a routed/progressive check. */
export function resolvedCheck(success, outcome) {
  const value = success ? 18 : 3;
  return { success, status: success ? 'success' : 'failure', outcome, value, data: { total: value, formula: '1d20' } };
}
