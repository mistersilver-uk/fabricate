/**
 * The REAL gathering writer chain, as one call (issue 1648, TP14-B).
 *
 * Builds a gathering world out of the production engine, run manager, rich state service
 * and result creator, executes one attempt, serializes the actor flags, reloads a FRESH
 * run manager and exposes the journal projection. Only Foundry documents and the roll /
 * check inputs are doubled — nothing under test is replaced by a fabricated return.
 */

import { GatheringEngine } from '../../src/systems/GatheringEngine.js';
import { GatheringRichStateService } from '../../src/systems/GatheringRichStateService.js';

import { routedSystemCheck, stubRoll } from './gathering.js';
import { FakeActor } from './run-manager-fakes.js';

/**
 * A Foundry Actor document double: merging acknowledged flag writes (inherited) plus
 * embedded Item creation, so award writers reach a real create/update boundary.
 */
export class GatheringDocumentActor extends FakeActor {
  constructor(name = 'Gatherer') {
    super(name);
    this.documentName = 'Actor';
    this.isOwner = true;
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

/** Wire the production engine to its real collaborators, doubling only the world around it. */
function buildEngine({ system, store, actor, viewer, runManager, publications, now, createResultCreator, rollD100 }) {
  const rich = new GatheringRichStateService({ environmentStore: store, rollD100, nowWorldTime: () => now });
  return new GatheringEngine({
    environmentStore: store,
    runManager,
    richState: Object.fromEntries(
      ['resolveD100Attempt', 'resolveEnvironmentalEvents', 'commitAcceptedAttempt'].map((name) => [name, rich[name].bind(rich)])
    ),
    getSystems: () => [system],
    getSelectableActors: () => [actor],
    isActorSelectable: () => true,
    isGamePaused: () => false,
    isPrimaryGM: () => true,
    getRunViewer: () => viewer,
    evaluator: { evaluateVisibility: async () => ({ visible: true }) },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    resultCreator: createResultCreator({ getSystem: () => system }),
    hookPublisher: { publishAttemptCompleted: (payload) => publications.push(payload) },
    nowWorldTime: () => now,
    localize: (key) => key,
  });
}

/**
 * Execute one gathering attempt, reload it from serialized flags and project it.
 *
 * @param {object} options Composed `system`/`environment`, acting `viewer`, d100 `rolls`,
 *   `sources` backing `fromUuidSync`, and the versioned `resolvedCheckResult`.
 * @returns {Promise<object>} Response/error, the reloaded record and a `project` seam.
 */
export async function runRealGatheringAttempt({
  system,
  environment,
  taskId = null,
  actor = new GatheringDocumentActor(),
  viewer = { id: 'user-gathering', isGM: false },
  rolls = [1],
  sources = {},
  versioned = false,
  resolvedCheckResult = null,
  rollTotal = 18,
  worldTime = 100,
} = {}) {
  const { GatheringRunManager } = await import('../../src/systems/GatheringRunManager.js');
  const { RunJournalBuilder } = await import('../../src/systems/RunJournalBuilder.js');
  const { createGatheringResultCreator } = await import('../../src/gatheringResultCreation.js');
  const keys = ['game', 'foundry', 'Roll', 'ChatMessage', 'fromUuidSync'];
  const saved = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const queue = [...rolls];
  const publications = [];
  const chat = [];
  let sequence = 0;
  const now = worldTime;
  const store = { list: () => [environment], get: (id) => (id === environment.id ? environment : null) };
  const runManager = new GatheringRunManager({
    randomID: () => `run-${++sequence}`,
    nowWorldTime: () => now,
    getUserId: () => viewer.id,
    getActors: () => [actor],
  });
  try {
    globalThis.game = { user: viewer, users: new Map([[viewer.id, viewer]]), actors: [actor], time: { worldTime: now } };
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
    const engine = buildEngine({ system, store, actor, viewer, runManager, publications, now,
      createResultCreator: createGatheringResultCreator,
      rollD100: () => queue.shift() ?? 1 });
    engine.installVersionedRunAuthority({
      consumeExecutionGrant: async (_grant, context) => ({ operationId: `operation-${context.requestId}`, resolvedCheckResult }),
    });
    const args = { actor, viewer, environmentId: environment.id, taskId, requestId: 'start', executionGrant: 'grant' };
    let response = null;
    let error = null;
    try {
      response = versioned ? await engine.startVersionedRun(args) : await engine.startAttempt(args);
      const waiting = runManager.getActiveRuns(actor)[0];
      if (versioned && waiting) {
        response = await engine.executeVersionedStage({ actor, runId: waiting.id, expectedRevision: waiting.runRevision, requestId: 'execute', executionGrant: 'grant' });
      }
    } catch (failure) {
      error = { code: failure.code, message: failure.message };
    }
    actor._flags = JSON.parse(JSON.stringify(actor._flags));
    const fresh = new GatheringRunManager();
    return {
      actor,
      response,
      error,
      chat,
      publications,
      history: fresh.getRunHistory(actor),
      record: fresh.getRunHistory(actor)[0],
      project: ({ projectionViewer = viewer, ...builder } = {}) =>
        new RunJournalBuilder({
          gatheringRunSource: fresh,
          getSystem: () => system,
          getGatheringTask: (_environmentId, id) => environment.tasks.find((task) => task.id === id) ?? null,
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
 *   environment `selectionMode` and the system's `failureResultPolicy`.
 * @returns {{system: object, environment: object, task: object, taskId: string}}
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
} = {}) {
  const task = {
    id: 'task-fixture',
    name: taskName,
    img: taskImg,
    enabled: true,
    resolutionMode: mode,
    toolIds: [],
    timeRequirement: null,
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
