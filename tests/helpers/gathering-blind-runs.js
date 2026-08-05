/**
 * Shared fixture for the blind-run secrecy suite (issue 901).
 *
 * Builds a WHOLE blind world — real GatheringRunManager (actor flags), real
 * GatheringRichStateService in nodes-economy mode (so `nodeRuntime` writes are
 * observable), real GatheringBlindRunStore over an in-memory settings map, and a
 * GatheringEngine wired to all three — so the tests can assert on what actually
 * lands in each store rather than on a mock's call log.
 *
 * Lives in `helpers/` because several suites need the same world and the
 * duplication gate counts `tests/**`.
 */
import { SETTING_KEYS } from '../../src/config/settings.js';
import { GatheringBlindRunStore } from '../../src/systems/GatheringBlindRunStore.js';
import { GatheringEngine } from '../../src/systems/GatheringEngine.js';
import { GatheringRichStateService } from '../../src/systems/GatheringRichStateService.js';
import { GatheringRunManager } from '../../src/systems/GatheringRunManager.js';

export const BLIND_PLAYER = Object.freeze({ id: 'user-blind-player', isGM: false });
export const BLIND_GM = Object.freeze({ id: 'user-blind-gm', isGM: true });
export const BLIND_SYSTEM_ID = 'system-blind';
export const BLIND_ENVIRONMENT_ID = 'env-blind';

/** Minimal flag-backed actor: the run container lives in `flags.fabricate`. */
export function blindActor({ id = 'actor-blind', uuid = 'Actor.actor-blind' } = {}) {
  const flags = { fabricate: {} };
  return {
    id,
    uuid,
    name: 'Blind Gatherer',
    items: [],
    flags,
    getFlag: (namespace, key) => flags[namespace]?.[key],
    setFlag: async (namespace, key, value) => {
      flags[namespace] = flags[namespace] || {};
      flags[namespace][key] = JSON.parse(JSON.stringify(value));
      return value;
    },
  };
}

/**
 * A gathering-library task. `nodeMax: null` means "no finite node pool", which is
 * how the tests isolate the reservation behaviour from the rest.
 */
export function blindLibraryTask({
  id = 'task-silver',
  name = 'Silver Vein',
  nodeMax = 2,
  depletionTiming = 'onStart',
  minutes = 1,
} = {}) {
  const task = {
    id,
    name,
    enabled: true,
    timeRequirement: minutes === null ? null : { minutes },
    dropRows: [
      { id: `${id}-row`, componentId: 'comp-ore', quantity: 1, dropRate: 100, enabled: true },
    ],
  };
  if (nodeMax !== null) {
    task.nodes = {
      enabled: true,
      max: nodeMax,
      current: nodeMax,
      depletionTiming,
      respawn: { policy: 'manual' },
    };
  }
  return task;
}

function blindEnvironment(id) {
  return {
    id,
    craftingSystemId: BLIND_SYSTEM_ID,
    name: `Blind Site ${id}`,
    enabled: true,
    selectionMode: 'blind',
    sceneUuid: null,
    tasks: [],
    nodeRuntime: {},
  };
}

/**
 * Assemble the blind world.
 *
 * @param {object} [options]
 * @param {object[]} [options.tasks] Library tasks the blind environment composes.
 * @param {string[]} [options.environmentIds] Blind environments to create.
 * @param {boolean} [options.nodesEnabled] System node economy toggle.
 * @param {Function} [options.isActiveGM] Whether this client may write the world
 *   setting. `false` models a PLAYER client, which must relay.
 * @param {Function|null} [options.relayStart] Blind-start relay seam.
 * @param {Function|null} [options.isRunActive] Reservation liveness predicate.
 * @param {number[]} [options.rolls] d100 rolls (1 finds every 100%-rate row).
 */
export function makeBlindWorld({
  tasks = [blindLibraryTask()],
  environmentIds = [BLIND_ENVIRONMENT_ID],
  nodesEnabled = true,
  isActiveGM = () => true,
  relayStart = null,
  isRunActive = null,
  rolls = [],
} = {}) {
  const clock = { worldTime: 1000 };
  const environments = environmentIds.map((id) => blindEnvironment(id));
  const byId = new Map(environments.map((environment) => [environment.id, environment]));
  const settings = new Map([
    [
      SETTING_KEYS.GATHERING_CONFIG,
      {
        systems: {
          [BLIND_SYSTEM_ID]: {
            economy: { nodes: { enabled: nodesEnabled }, stamina: { enabled: false } },
            tasks,
            events: [],
          },
        },
      },
    ],
    [SETTING_KEYS.GATHERING_BLIND_RUNS, {}],
  ]);
  const settingWrites = [];
  const getSetting = (key) => settings.get(key);
  const setSetting = async (key, value) => {
    settings.set(key, value);
    settingWrites.push(key);
    return value;
  };

  const environmentStore = {
    get: (id) => byId.get(id) ?? null,
    list: () => environments,
    update: async (id, patch) => {
      Object.assign(byId.get(id), patch);
      return byId.get(id);
    },
  };

  const rollQueue = [...rolls];
  const richState = new GatheringRichStateService({
    getSetting,
    setSetting,
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    environmentStore,
    rollD100: () => rollQueue.shift() ?? 1,
    nowWorldTime: () => clock.worldTime,
    hooks: { callAll: () => {} },
  });

  const actor = blindActor();
  const runIds = [];
  const runManager = new GatheringRunManager({
    randomID: () => {
      const id = `run-${runIds.length + 1}`;
      runIds.push(id);
      return id;
    },
    nowWorldTime: () => clock.worldTime,
    getUserId: () => BLIND_PLAYER.id,
    getActors: () => [actor],
  });

  const blindStore = new GatheringBlindRunStore({
    getSetting,
    setSetting,
    settingKey: SETTING_KEYS.GATHERING_BLIND_RUNS,
    isActiveGM,
    isRunActive,
    nowWorldTime: () => clock.worldTime,
  });

  const created = [];
  const engine = new GatheringEngine({
    environmentStore,
    runManager,
    richState,
    getSystems: () => [
      {
        id: BLIND_SYSTEM_ID,
        name: 'Blind System',
        enabled: true,
        features: { gathering: true },
        components: [{ id: 'comp-ore', difficulty: 1 }],
        tools: [],
      },
    ],
    getSelectableActors: () => [actor],
    isActorSelectable: () => true,
    isGamePaused: () => false,
    evaluator: { evaluateVisibility: async () => ({ visible: true }) },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    resultCreator: {
      plan: async () => [],
      create: async (payload) => {
        created.push(payload);
        return [];
      },
    },
    failureFeedback: { apply: async () => null },
    localize: (key) => key,
  });
  engine.installBlindRunRelay({ store: blindStore, relayStart });

  return {
    engine,
    runManager,
    richState,
    blindStore,
    environmentStore,
    environments,
    settings,
    settingWrites,
    actor,
    clock,
    created,
    /** Seed a stored node pool, e.g. to model a decrement an earlier start made. */
    seedNodeRuntime: (taskId, node, environmentId = BLIND_ENVIRONMENT_ID) => {
      byId.get(environmentId).nodeRuntime = {
        ...byId.get(environmentId).nodeRuntime,
        [taskId]: node,
      };
    },
    /** Delete an environment from the store (a GM removing it mid-run). */
    deleteEnvironment: (id = BLIND_ENVIRONMENT_ID) => {
      byId.delete(id);
      const index = environments.findIndex((environment) => environment.id === id);
      if (index >= 0) environments.splice(index, 1);
    },
    /**
     * The COMPOSED runtime task, which is what a real waiting run snapshots — the
     * raw library record is not a valid runtime task on its own.
     */
    composedTask: (taskId, environmentId = BLIND_ENVIRONMENT_ID) =>
      richState
        .composeEnvironment(byId.get(environmentId), { id: BLIND_SYSTEM_ID })
        .tasks.find((task) => task.id === taskId) ?? null,
    /** The stored node pool for a task, or null when nothing has been written. */
    nodePool: (taskId, environmentId = BLIND_ENVIRONMENT_ID) =>
      byId.get(environmentId)?.nodeRuntime?.[taskId] ?? null,
    /** The single active run on the fixture actor, or null. */
    activeRun: () => runManager.getActiveRuns(actor)[0] ?? null,
    /** Every blind-store record, live or not, as raw stored values. */
    blindRecords: () => settings.get(SETTING_KEYS.GATHERING_BLIND_RUNS),
    /** Start a blind attempt as the given viewer through the public entry. */
    start: (options = {}) =>
      engine.requestStart({
        viewer: BLIND_PLAYER,
        actor,
        environmentId: BLIND_ENVIRONMENT_ID,
        ...options,
      }),
    /** Advance world time past the fixture time gate and resume matured runs. */
    mature: async () => {
      clock.worldTime += 600;
      return engine.processWorldTime(clock.worldTime);
    },
  };
}
