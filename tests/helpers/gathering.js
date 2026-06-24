import { GatheringEngine } from '../../src/systems/GatheringEngine.js';
import { GatheringRichStateService } from '../../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../../src/config/settings.js';

export const DEFAULT_TEST_ACTOR = Object.freeze({
  id: 'actor-test',
  uuid: 'Actor.actor-test',
  name: 'Test Gatherer',
  items: []
});

export const DEFAULT_TEST_VIEWER = Object.freeze({ id: 'user-test', isGM: false });

export const DEFAULT_TEST_SYSTEM = Object.freeze({
  id: 'system-test',
  name: 'Test System',
  enabled: true,
  features: { gathering: true },
  components: [{ id: 'herb' }]
});

export function makeFakeActor(overrides = {}) {
  let flags = {};
  return {
    id: 'actor-flag',
    uuid: 'Actor.actor-flag',
    name: 'Flag Actor',
    items: [],
    getFlag: (namespace, key) => flags[`${namespace}.${key}`],
    setFlag: async (namespace, key, value) => {
      flags = { ...flags, [`${namespace}.${key}`]: value };
      return value;
    },
    ...overrides
  };
}

export function makeRichState({
  config = {},
  rolls = [100],
  evaluateExpression = null,
  runMacro = null,
  secondsPerUnit = null
} = {}) {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  const writes = [];
  const rollQueue = [...rolls];
  const rollCalls = [];
  const hooks = [];
  const evaluateCalls = [];
  const macroCalls = [];
  const service = new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      writes.push({ key, value });
      return value;
    },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    rollD100: () => {
      rollCalls.push(true);
      return rollQueue.shift() ?? 1;
    },
    hooks: {
      callAll: (name, payload) => hooks.push({ name, payload })
    },
    evaluateExpression: evaluateExpression
      ? async (payload) => { evaluateCalls.push(payload); return evaluateExpression(payload); }
      : null,
    runMacro: runMacro
      ? async (uuid, context) => { macroCalls.push({ uuid, context }); return runMacro(uuid, context); }
      : null,
    secondsPerUnit
  });
  return { service, settings, writes, hooks, rollCalls, evaluateCalls, macroCalls };
}

export function environment(overrides = {}) {
  return {
    id: 'env-test',
    craftingSystemId: 'system-test',
    name: 'Test Environment',
    enabled: true,
    selectionMode: 'targeted',
    // Legacy `region` string: inert post-unification (region is no longer a
    // composition axis), left here to prove it does not affect matching.
    region: 'north',
    biomes: ['forest'],
    dangerTags: ['hazardous'],
    tasks: [],
    ...overrides
  };
}

export function makeEngine({ richState, env = environment(), calls = {}, runManager = null, actingActor = DEFAULT_TEST_ACTOR, system = DEFAULT_TEST_SYSTEM } = {}) {
  calls.created = [];
  calls.terminal = [];
  return new GatheringEngine({
    environmentStore: {
      list: () => [env],
      get: () => env
    },
    getSystems: () => [system],
    richState,
    getSelectableActors: () => [actingActor],
    isActorSelectable: () => true,
    isGamePaused: () => false,
    evaluator: {
      evaluateVisibility: async () => ({ visible: true })
    },
    sceneAccess: {
      canAttempt: () => ({ allowed: true })
    },
    resultCreator: {
      plan: async ({ resultGroups }) => resultGroups.flatMap(group => group.results).map(result => ({
        actorUuid: actingActor.uuid,
        itemUuid: result.itemUuid || `Component.${result.componentId}`,
        quantity: result.quantity
      })),
      create: async (payload) => {
        calls.created.push(payload);
        return payload.resultGroups.flatMap(group => group.results).map(result => ({
          actorUuid: actingActor.uuid,
          itemUuid: result.itemUuid || `Component.${result.componentId}`,
          quantity: result.quantity
        }));
      }
    },
    failureFeedback: {
      apply: async () => null
    },
    runManager: runManager ?? {
      getActiveRuns: () => [],
      getRunHistory: () => [],
      findActiveRunForTask: () => null,
      createTerminalRun: async (selectedActor, runData, status, payload) => {
        calls.terminal.push({ selectedActor, runData, status, payload });
        return { id: 'run-test', status, ...runData, ...payload };
      }
    },
    localize: key => key
  });
}

/**
 * Build a system-level routed gathering check (issue 424). Routed gathering
 * resolves through this check's roll formula rather than a per-task provider: the
 * single success tier (named `tierName`) routes to the result group whose name
 * matches it. Pair with {@link routedRoll}/{@link stubRoll} to drive the roll.
 *
 * @param {object} [options]
 * @param {string} [options.tierName] Name of the lone success tier (matches the
 *   result group it should route to). Defaults to `'Iron'`.
 * @param {number} [options.dc] Base difficulty class. Defaults to `15`.
 * @returns {{ routed: object }} A `gatheringCraftingCheck` fragment.
 */
export function routedSystemCheck({ tierName = 'Iron', dc = 15 } = {}) {
  return {
    routed: {
      rollFormula: '1d20',
      dc,
      type: 'relative',
      thresholdMode: 'meet',
      relativeOutcomes: [{ id: `tier-${tierName}`, name: tierName, success: true, dc: 0 }]
    }
  };
}

/**
 * Stub `globalThis.Roll` so `evaluate()` resolves to a fixed `total` plus the
 * supplied `dice` groups (default none). Tests must `delete globalThis.Roll`
 * afterwards (try/finally).
 *
 * @param {number} total The roll total the stubbed engine returns.
 * @param {Array<object>} [dice] Dice-group metadata (e.g. crit detection).
 */
export function stubRoll(total, dice = []) {
  globalThis.Roll = class {
    async evaluate() {
      return { total, dice };
    }
  };
}

/**
 * Stub a routed-check roll that passes (`18`, a pass at the default dc 15) or
 * misses (`5`) the success tier — the convenience pair for {@link routedSystemCheck}.
 * Includes a single d20 dice group so crit detection sees a real roll.
 *
 * @param {boolean} [success] Whether the roll should clear the dc. Defaults to `true`.
 */
export function routedRoll(success = true) {
  const total = success ? 18 : 5;
  stubRoll(total, [{ number: 1, faces: 20, total }]);
}

/**
 * Build a per-system character modifier library descriptor that the test rich
 * state can absorb directly via `makeRichState({ config })`.
 *
 * @param {object} options
 * @param {Array<object>} [options.entries] Library entries.
 * @param {string} [options.system] Crafting system id.
 * @returns {object} A `config` payload with the modifiers seeded.
 */
export function makeCharacterModifierLibrary({ entries = [], system = 'system-test' } = {}) {
  return {
    systems: {
      [system]: {
        characterModifiers: entries
      }
    }
  };
}
