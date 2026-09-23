/** One salvage world and one flat, ordered effect journal over a real `CraftingEngine.salvage()`
 * driven against the real `SalvageRunManager` (issue 1714). The documents, the headless Foundry
 * edge and the recording run-manager proxy are `craftPipelineProbe`'s, so no second world factory
 * exists; only the salvage-shaped catalogue, tools and run seams are declared here. */
import { BulkSalvageService } from '../../src/systems/BulkSalvageService.js';
import { CraftingEngine } from '../../src/systems/CraftingEngine.js';
import { SalvageRunManager } from '../../src/systems/SalvageRunManager.js';

import {
  cardText,
  installProbeEnv,
  makeJournal,
  ProbeActor,
  ProbeItem,
  recordingRunManager,
} from './craftPipelineProbe.js';

const ACTOR_ALIAS = 'Salvager';

const DEFAULT_TARGET = Object.freeze({
  id: 'ore',
  name: 'Iron Ore',
  quantity: 3,
  ingredientQuantity: 1,
});

/**
 * A salvage run's state at the moment of the call: the lifecycle facts a reordered, dropped or
 * misattributed write moves, without the whole persisted record.
 */
export function salvageRunDigest(run) {
  if (!run || typeof run !== 'object') return run ?? null;
  const gate = run.timeGate ? ` gate@${run.timeGate.availableAt}` : '';
  const snapshot = run.resolutionSnapshot
    ? ` ${run.resolutionSnapshot.kind}:${run.resolutionSnapshot.mode}`
    : '';
  const settlement = run.historySettlement
    ? ` ${run.historySettlement.consumption ?? '-'}/${run.historySettlement.awards ?? '-'}`
    : '';
  const counts = `${(run.consumedComponents || []).length}c/${(run.usedTools || []).length}t/${(run.createdResults || []).length}r`;
  const order = run.resultOrder ? ` order[${run.resultOrder.join(',')}]` : '';
  const fired = (run.firedComplications || [])
    .map((entry) => `${entry.resultId}:${entry.complicationId}`)
    .join(',');
  return `Run:${run.id} ${run.componentId} ${run.status} ${counts}${gate}${snapshot}${settlement}${order}${fired ? ` fired[${fired}]` : ''}`;
}

/** The run-manager calls whose first run-shaped argument the journal digests. */
const RUN_ARGUMENT_CALLS = new Set([
  'run.updateRun',
  'run.markRunWaitingForTime',
  'run.markRunInProgress',
  'run.canProceedTimeGate',
  'run.completeRun',
]);

/** `makeJournal`, with every persisted salvage-run argument compacted by {@link salvageRunDigest}. */
function makeSalvageJournal() {
  const journal = makeJournal();
  const push = journal.push.bind(journal);
  journal.push = (name, ...args) => {
    if (!RUN_ARGUMENT_CALLS.has(name)) return push(name, ...args);
    const digest = (arg) => (arg?.id && arg.componentId ? salvageRunDigest(arg) : arg);
    return push(name, ...args.map((arg) => digest(arg)));
  };
  return journal;
}

/** The real `SalvageRunManager` behind the recording proxy, plus the two hooks a scenario arms on
 * a named call: the world clock tick, and the rejection that pins the settlement `try` boundary. */
function probeSalvageRunManager(journal) {
  const real = new SalvageRunManager();
  let tick = null;
  let failure = null;
  const onCall = (call) => {
    if (tick && call === tick.call) {
      globalThis.game.time.worldTime += tick.seconds;
      journal.push('clock.advance', tick.seconds);
      tick = null;
    }
    if (failure && call === failure.call) {
      const { message } = failure;
      failure = null;
      throw new Error(message);
    }
  };
  return {
    real,
    recording: recordingRunManager(real, journal, onCall),
    armClockTick: (call, seconds) => {
      tick = { call, seconds };
    },
    armCallFailure: (call, message) => {
      failure = { call, message };
    },
  };
}

/** The owned stack and the catalogue entry for one salvageable component. */
function probeTarget(journal, spec) {
  const {
    id,
    name,
    quantity,
    ingredientQuantity = 1,
    enabled = true,
    resultGroups = [],
    outcomeRouting = {},
    timeRequirement = null,
    toolIds = [],
    allowPlayerResultReorder,
    dcOverride,
    currencyRequirement,
    sourceQuantity,
  } = { ...DEFAULT_TARGET, ...spec };
  const item = Object.assign(new ProbeItem({ id, name, quantity, componentId: id }), { journal });
  if (sourceQuantity !== undefined) item._source = { system: { quantity: sourceQuantity } };
  const component = {
    id,
    name,
    img: `icons/${id}.png`,
    registeredItemUuid: item.uuid,
    salvage: {
      enabled,
      ingredientQuantity,
      toolIds,
      resultGroups,
      outcomeRouting,
      timeRequirement,
      ...(allowPlayerResultReorder === undefined ? {} : { allowPlayerResultReorder }),
      ...(dcOverride === undefined ? {} : { dcOverride }),
      ...(currencyRequirement ? { currencyRequirement } : {}),
    },
  };
  return { item, component };
}

/** The award catalogue: one registered source document per awardable component. */
function probeAwards(journal, awards) {
  const sources = [];
  const definitions = awards.map(({ id, name, difficulty, complications }) => {
    const source = Object.assign(new ProbeItem({ id: `src-${id}`, name: name ?? id }), { journal });
    sources.push(source);
    return {
      id,
      name: name ?? id,
      registeredItemUuid: source.uuid,
      ...(difficulty === undefined ? {} : { difficulty }),
      ...(complications ? { complications } : {}),
    };
  });
  return { sources, definitions };
}

/** The owned tool items, matched to library Tools by componentId. */
function probeTools(journal, tools) {
  const items = tools
    .filter((tool) => tool.present !== false)
    .map((tool) =>
      Object.assign(
        new ProbeItem({
          id: `tool-${tool.componentId}`,
          name: tool.name,
          componentId: tool.componentId,
        }),
        { journal }
      )
    );
  const library = tools.map(({ id, componentId, name, breakage, onBreak }) => ({
    id,
    componentId,
    name,
    ...(breakage ? { breakage } : {}),
    ...(onBreak ? { onBreak } : {}),
  }));
  return { items, library };
}

/** Make the dice engine reject: the one way a PROGRESSIVE salvage check reports failure, since
 * its runner reads every evaluated total as a budget rather than as a pass or a fail. */
export function failRollEngine(message) {
  globalThis.Roll = class ProbeFailingRoll {
    async evaluate() {
      throw new Error(message);
    }
  };
}

/** A coin spender whose every read and write is journalled, so the currency-absence control pins
 * a reachable seam staying silent rather than the absence of a seam. */
function probeCoinSpender(journal) {
  return {
    readCoins: (actor) => ({ ...(actor?.system?.currency || {}) }),
    check(_actor, requirement) {
      journal.push('currency.check', requirement?.unit?.id ?? null);
      return { valid: true };
    },
    async spend(_actor, requirement) {
      journal.push('currency.spend', requirement?.unit?.id ?? null);
      return { valid: true };
    },
    async refund(_actor, requirement) {
      journal.push('currency.refund', requirement?.unit?.id ?? null);
      return { valid: true };
    },
  };
}

/** Give the dice stub's evaluated result the `toMessage` post an interactive check makes — the
 * Dice So Nice trigger `suppressChat` deliberately does NOT suppress — so a suppressed card and a
 * still-posted roll are two distinguishable journal entries rather than one silence. */
function journalRollPosts(journal) {
  const Roll = globalThis.Roll;
  if (typeof Roll !== 'function') return;
  Roll.probeJournal = journal;
  if (Roll.probeEvaluate) return;
  Roll.probeEvaluate = Roll.prototype.evaluate;
  Roll.prototype.evaluate = async function evaluateAndPost(options) {
    const rolled = await Roll.probeEvaluate.call(this, options);
    rolled.toMessage = async (data) =>
      Roll.probeJournal?.push('chat.roll', { flavor: data?.flavor ?? null, total: rolled.total });
    return rolled;
  };
}

/**
 * Build one salvage world: the system, the salvageable components, the owned stock, the real run
 * manager behind its recording proxy, the engine and the seams the journal records. Every field is
 * named, so a scenario states only what makes it different.
 */
export function salvageRunProbe(spec = {}) {
  const {
    systemId = 'sys-salvage',
    salvageResolutionMode = 'simple',
    salvageCraftingCheck = {},
    features = {},
    toolBreakage = null,
    targets = [DEFAULT_TARGET],
    awards = [],
    tools = [],
    resultOrder = null,
    worldTime = 0,
    validateSalvage = { valid: true, errors: [] },
    salvageFeature = true,
    complicationWriter = false,
  } = spec;

  const journal = makeSalvageJournal();
  installProbeEnv(journal, { worldTime, actorAlias: ACTOR_ALIAS });

  const built = targets.map((target) => probeTarget(journal, target));
  const award = probeAwards(journal, awards);
  const toolSet = probeTools(journal, tools);
  const actor = Object.assign(
    new ProbeActor(ACTOR_ALIAS, [...built.map(({ item }) => item), ...toolSet.items]),
    { journal }
  );

  const system = {
    id: systemId,
    features: { salvage: salvageFeature, chatOutput: true, ...features },
    salvageResolutionMode,
    salvageCraftingCheck,
    components: [...built.map(({ component }) => component), ...award.definitions],
    tools: toolSet.library,
    ...(toolBreakage ? { toolBreakage } : {}),
  };
  const resolutionService = { validateSalvage: () => validateSalvage };
  const manager = probeSalvageRunManager(journal);

  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === systemId ? system : null) }),
      getResolutionModeService: () => resolutionService,
      getSalvageRunManager: () => manager.recording,
    },
    i18n: { localize: (key) => key, format: (key) => key },
    user: { id: 'user-probe', isGM: true },
    time: { worldTime },
    actors: [actor],
  };
  globalThis.fromUuid = async (uuid) =>
    [actor, ...actor.items, ...award.sources].find((document) => document.uuid === uuid) ?? null;

  const engine = new CraftingEngine(
    { toolMatchesItem: (_recipe, tool, item) => item?.componentId === tool?.componentId },
    null,
    resolutionService,
    null,
    manager.recording,
    probeCoinSpender(journal),
    probeCoinSpender(journal),
    { getPlayerResultOrder: () => resultOrder }
  );
  if (complicationWriter) {
    engine.installComplicationDelivery({
      writer: {
        deliver(request) {
          journal.push('complication.deliver', {
            complications: (request?.complications || []).map(
              (entry) => entry?.complicationId ?? null
            ),
          });
        },
      },
    });
  }

  const record = (result) => {
    journal.push('returned', { ...result, salvageRun: salvageRunDigest(result.salvageRun) });
    return result;
  };
  const recordThrow = (error) => {
    journal.push('threw', {
      code: error?.code ?? null,
      historyField: error?.historyField ?? null,
      message: error?.message ?? null,
    });
    return null;
  };

  return {
    journal,
    engine,
    actor,
    system,
    runManager: manager.real,
    armClockTick: manager.armClockTick,
    armCallFailure: manager.armCallFailure,
    advanceClock(seconds) {
      globalThis.game.time.worldTime += seconds;
      journal.push('clock.advance', seconds);
    },
    /** Seed an ACTIVE run through the real manager, so the seeding writes no journal entry. */
    async seedRun(runData = {}) {
      return manager.real.createRun(actor, {
        actorUuid: actor.uuid,
        craftingSystemId: systemId,
        componentId: targets[0].id ?? DEFAULT_TARGET.id,
        status: 'inProgress',
        ...runData,
      });
    },
    async salvage(options = {}, componentId = targets[0].id ?? DEFAULT_TARGET.id) {
      journalRollPosts(journal);
      try {
        return record(await engine.salvage(actor.uuid, systemId, componentId, options));
      } catch (error) {
        return recordThrow(error);
      }
    },
    /** The world-time resume path, driven exactly as the `updateWorldTime` hook drives it. */
    async processPendingSalvageRuns(seconds) {
      this.advanceClock(seconds);
      journalRollPosts(journal);
      await engine.processPendingSalvageRuns(globalThis.game.time.worldTime);
    },
    /** One bulk gesture over several components, sharing one roll decision and one card. */
    async bulkSalvage(componentIds, { rollDecision = { confirmed: true } } = {}) {
      journalRollPosts(journal);
      const service = new BulkSalvageService({
        salvage: (...args) => engine.salvage(...args),
        getCraftingSystem: (id) => (id === systemId ? system : null),
        promptRollDecision: async () => rollDecision,
        postChatMessage: async ({ content }) =>
          journal.push('chat.bulk', { text: cardText(content) }),
        deliverComplications: (message) =>
          journal.push('complication.deliver', {
            complications: (message?.complications || []).map(
              (entry) => entry?.complicationId ?? null
            ),
          }),
      });
      const report = await service.run({
        targets: componentIds.map((componentId) => ({
          actorUuid: actor.uuid,
          actorId: actor.id,
          actorName: actor.name,
          systemId,
          componentId,
        })),
      });
      journal.push('bulk.returned', { counts: report.counts, posted: report.posted });
      return report;
    },
  };
}
