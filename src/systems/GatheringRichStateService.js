import { authoredCheckModifierIds } from '../utils/checkModifierPicks.js';
import { authoredFailureOutcome } from '../utils/gatheringFailureOutcome.js';
import {
  laxNumberOrNull as numberOrNull,
  normalizeConditionId,
  normalizeTag,
  normalizeTagList,
} from '../utils/scalars.js';

import { chatModeOption } from './bulkChatVisibility.js';
import { resolveModifierLibrary } from './characterLibraries.js';
import {
  conditionSettingsToCurrent,
  environmentComposesRecord,
  resolveGatheringCompositionMode,
} from './gatheringComposition.js';
import { evaluateEnvironmentMatch } from './gatheringMatch.js';
import { depleteNodeOnce, normalizeNodeConfig } from './gatheringNodeConfig.js';
import { GatheringNodeService } from './GatheringNodeService.js';
import { normalizeGatheringResultGroups } from './gatheringResultGroups.js';
import {
  cloneJson,
  nonNegativeInteger,
  nonNegativeNumber,
  normalizeList,
  numberOrNullStrict,
  readState,
  writeState,
} from './gatheringRichStateInternals.js';
import { GatheringStaminaService } from './GatheringStaminaService.js';
import {
  normalizeNullableAdjustment,
  normalizeNullableSuccesses,
} from './normalize/checkEvaluation.js';
import { resolvedToolsFor } from './scopedEntityReads.js';

const DEFAULT_CONDITIONS = Object.freeze({ weather: 'clear', timeOfDay: 'day' });
const DEFAULT_VOCABULARIES = Object.freeze({
  biomes: [
    'forest',
    'grassland',
    'mountain',
    'cave',
    'coastal',
    'swamp',
    'desert',
    'urban',
    'ruins',
    'wasteland',
  ],
  danger: ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'],
  weather: ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'wind'],
  timeOfDay: ['dawn', 'day', 'dusk', 'night'],
});
const OBJECT_STRINGIFICATION = '[object object]';
const CONDITION_DIMENSIONS = ['weather', 'timeOfDay'];
const VOCABULARY_DIMENSIONS = ['biomes'];
const BIOME_COLOR_TOKENS = new Set([
  'sage',
  'mist',
  'lavender',
  'rose',
  'peach',
  'butter',
  'aqua',
  'mauve',
]);
const DEFAULT_BIOME_COLOR_TOKEN = 'sage';
const DEFAULT_BIOME_METADATA = Object.freeze({
  forest: Object.freeze({ label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage' }),
  grassland: Object.freeze({ label: 'Grassland', icon: 'fas fa-wheat-awn', colorToken: 'butter' }),
  mountain: Object.freeze({ label: 'Mountain', icon: 'fas fa-mountain', colorToken: 'mist' }),
  cave: Object.freeze({ label: 'Cave', icon: 'fas fa-dungeon', colorToken: 'lavender' }),
  coastal: Object.freeze({ label: 'Coastal', icon: 'fas fa-water', colorToken: 'aqua' }),
  swamp: Object.freeze({ label: 'Swamp', icon: 'fas fa-frog', colorToken: 'mauve' }),
  desert: Object.freeze({ label: 'Desert', icon: 'fas fa-sun', colorToken: 'peach' }),
  urban: Object.freeze({ label: 'Urban', icon: 'fas fa-city', colorToken: 'mist' }),
  ruins: Object.freeze({ label: 'Ruins', icon: 'fas fa-archway', colorToken: 'rose' }),
  wasteland: Object.freeze({ label: 'Wasteland', icon: 'fas fa-skull', colorToken: 'mauve' }),
});
const DEFAULT_CONDITION_ICONS = Object.freeze({
  weather: Object.freeze({
    clear: 'fas fa-sun',
    cloudy: 'fas fa-cloud',
    rain: 'fas fa-cloud-rain',
    storm: 'fas fa-bolt',
    snow: 'fas fa-snowflake',
    fog: 'fas fa-smog',
    wind: 'fas fa-wind',
  }),
  timeOfDay: Object.freeze({
    dawn: 'fas fa-cloud-sun',
    day: 'fas fa-sun',
    dusk: 'fas fa-cloud-moon',
    night: 'fas fa-moon',
  }),
});
const FALLBACK_CONDITION_ICONS = Object.freeze({
  weather: 'fas fa-cloud-sun',
  timeOfDay: 'fas fa-clock',
});
const DROP_SELECTION_MODES = new Set(['highestRankedDrop', 'allDrops', 'limitedDrops']);
const LEGACY_DROP_SELECTION_MODES = new Set(['highestRankedDrop', 'allDrops']);
const EVENT_POLICIES = new Set(['successWithEvent', 'failureWithEvent']);
const TOOL_BREAKAGE_POLICIES = new Set(['failureOnBreak', 'successDespiteBreak']);
const BIOME_MODIFIER_AGGREGATIONS = new Set(['cumulative', 'strongestOfEach', 'dominant']);
const BLIND_CANDIDATE_GATES = new Set(['attemptableOnly', 'allMatching']);
const REVEAL_POLICIES = new Set(['never', 'onSuccess', 'onAttempt']);
const REVEAL_SCOPES = new Set(['actor', 'user', 'party', 'global']);
const GATHERING_EVENT_VISIBILITIES = new Set(['dangerLevelOnly', 'encounterChance', 'full']);
const CHARACTER_MODIFIER_OPERATORS = new Set(['+', '-']);
// The single system-wide `dropModifierMode`, never overridden per modifier; it covers character
// and condition (weather, time-of-day, biome) modifiers.
const DROP_MODIFIER_MODES = new Set(['additive', 'multiplicative']);

/** The drop-modifier mode from the system setting alone, `'additive'` for any unknown value. */
function resolveDropModifierMode(systemMode) {
  return DROP_MODIFIER_MODES.has(systemMode) ? systemMode : 'additive';
}
// Legacy limitation-mode values, kept only for `normalizeGatheringEconomy`'s read-time mapping
// onto the two canonical booleans.
const ECONOMY_MODES = new Set(['none', 'stamina', 'nodes']);
// Legacy system-level economy setting. Task resolution is selected independently.
const GATHERING_RESOLUTION_MODES = new Set(['d100', 'progressive', 'routed']);
const GATHERING_TASK_RESOLUTION_MODES = new Set(['straight', 'd100', 'progressive', 'routed']);
// Stamina regeneration over world time.
const STAMINA_REGEN_POLICIES = new Set(['none', 'overTime']);
// Legacy stamina-regen policy mapped to `overTime`. The 1.2.0 migration rewrites stored data, but
// the read-time mapping keeps an unmigrated world regenerating instead of coercing to `none`.
// Distinct from the node-respawn `elapsedTime` value (see gatheringNodeConfig.js).
const LEGACY_STAMINA_REGEN_POLICY_MAP = Object.freeze({ elapsedTime: 'overTime' });
const STAMINA_REGEN_UNITS = new Set(['minutes', 'hours', 'days', 'weeks']);
const SECONDS_PER_UNIT = Object.freeze({ minutes: 60, hours: 3600, days: 86_400, weeks: 604_800 });
const DEFAULT_GATHERING_RULES = Object.freeze({
  rewardSelectionMode: 'highestRankedDrop',
  rewardLimit: 1,
  eventSelectionMode: 'allDrops',
  eventLimit: 1,
  eventPolicy: 'successWithEvent',
  toolBreakagePolicy: 'failureOnBreak',
  biomeModifierAggregation: 'strongestOfEach',
  blindCandidateGate: 'attemptableOnly',
  revealPolicy: 'never',
  revealScope: 'actor',
  eventVisibility: 'encounterChance',
  dropModifierMode: 'additive',
});

const BLOCKED_REASON_KEYS = Object.freeze({
  NODE_DEPLETED: 'FABRICATE.Gathering.Blocked.NodeDepleted',
  NODE_EXHAUSTED: 'FABRICATE.Gathering.Blocked.NodeExhausted',
  STAMINA_BLOCKED: 'FABRICATE.Gathering.Blocked.StaminaBlocked',
});

/**
 * Rich-gathering runtime support: global conditions, library composition, d100 rules, node
 * counts, actor stamina, attempt counters and blind reveal evidence, kept side-effect explicit so
 * GatheringEngine can keep history-before-effects ordering.
 */
export class GatheringRichStateService {
  /**
   * @param {Function} [options.rollD100] D100 roller (test seam).
   * @param {Function} [options.evaluateExpression] Async evaluator with the
   *   `evaluateGatheringExpression` signature, resolving character modifier expressions against
   *   the acting actor without Foundry globals.
   */
  constructor({
    environmentStore = null,
    getSetting = null,
    setSetting = null,
    settingKey = 'gatheringConfig',
    nowWorldTime = () => Number(globalThis.game?.time?.worldTime || 0),
    getUserId = () => globalThis.game?.user?.id || null,
    rollD100 = () => Math.floor(Math.random() * 100) + 1,
    hooks = globalThis.Hooks ?? null,
    evaluateExpression = null,
    secondsPerUnit = null,
    // Interactable-scoped node seams (issue 302) resolving and writing a scene interactable's
    // pool without `game.scenes`; absent, every node path uses the environment scope.
    resolveRegionBehavior = null,
    writeInteractableBehavior = null,
    // GM-routed environment node depletion: the pool lives in the `gatheringEnvironments` world
    // setting only a GM may update, so a player's decrement goes to the active GM
    // (`gatheringNodeSocket.js`). Absent, the write applies in place, as on a GM client.
    depleteEnvironmentNode = null,
    // Extracted collaborators (issue 376), default-constructed from this service's seams.
    staminaService = null,
    nodeService = null,
  } = {}) {
    this.environmentStore = environmentStore;
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.settingKey = settingKey;
    this.nowWorldTime = nowWorldTime;
    this.getUserId = getUserId;
    this.rollD100 = rollD100;
    this.hooks = hooks;
    this.evaluateExpression = evaluateExpression;
    // Seconds per regen/respawn unit. The default is the Earth-calendar table; main.js injects a
    // calendar-aware provider so `days`/`weeks` follow the world calendar.
    this.secondsPerUnit =
      typeof secondsPerUnit === 'function'
        ? secondsPerUnit
        : (unit) => SECONDS_PER_UNIT[unit] || SECONDS_PER_UNIT.hours;
    this.resolveRegionBehavior =
      typeof resolveRegionBehavior === 'function' ? resolveRegionBehavior : null;
    this.writeInteractableBehavior =
      typeof writeInteractableBehavior === 'function' ? writeInteractableBehavior : null;

    // Stamina and node services (issue 376) are wired from this service's own seams, so there is
    // one economy, config, clock and hook path: stamina reads `_systemEconomy`, nodes `_config`,
    // and both use `_callHook`/`_historyEvent`/`_now`.
    this.staminaService =
      staminaService ??
      new GatheringStaminaService({
        getSystemEconomy: (id) => this._systemEconomy(id),
        evaluateExpression: this.evaluateExpression,
        secondsPerUnit: this.secondsPerUnit,
        now: () => this._now(),
        callHook: (name, payload) => this._callHook(name, payload),
        historyEvent: (type, data) => this._historyEvent(type, data),
      });
    this.nodeService =
      nodeService ??
      new GatheringNodeService({
        environmentStore: this.environmentStore,
        getConfig: () => this._config(),
        secondsPerUnit: this.secondsPerUnit,
        rollD100: this.rollD100,
        evaluateExpression: this.evaluateExpression,
        callHook: (name, payload) => this._callHook(name, payload),
        nowWorldTime: this.nowWorldTime,
        resolveRegionBehavior: this.resolveRegionBehavior,
        writeInteractableBehavior: this.writeInteractableBehavior,
        depleteEnvironmentNode:
          typeof depleteEnvironmentNode === 'function' ? depleteEnvironmentNode : null,
        // The economy gate lives here, so the active-GM applier re-checks it rather than trusting
        // the requesting client.
        nodesEnabled: (systemId) => this.nodesEnabled(systemId),
      });
  }

  getConditions() {
    const config = this._config();
    return {
      weather: config.conditions.weather,
      timeOfDay: config.conditions.timeOfDay,
      vocabularies: cloneJson(config.vocabularies),
    };
  }

  async setWeather(weather) {
    return this.setConditions({ weather });
  }

  async setTimeOfDay(timeOfDay) {
    return this.setConditions({ timeOfDay });
  }

  async setConditions({ weather, timeOfDay } = {}) {
    const config = this._config();
    const nextConditions = { ...config.conditions };
    let nextSystems = config.systems;
    if (weather !== undefined) {
      const tag = normalizeConditionId(weather);
      if (!normalizeConditionIdList(config.vocabularies.weather).includes(tag)) {
        throw new Error(`Unknown gathering weather tag: ${weather}`);
      }
      nextConditions.weather = tag;
      nextSystems = withSystemCurrentCondition(nextSystems, 'weather', tag);
    }
    if (timeOfDay !== undefined) {
      const tag = normalizeConditionId(timeOfDay);
      if (!normalizeConditionIdList(config.vocabularies.timeOfDay).includes(tag)) {
        throw new Error(`Unknown gathering time-of-day tag: ${timeOfDay}`);
      }
      nextConditions.timeOfDay = tag;
      nextSystems = withSystemCurrentCondition(nextSystems, 'timeOfDay', tag);
    }

    const next = { ...config, conditions: nextConditions, systems: nextSystems };
    await this._saveConfig(next);
    this._callHook('fabricate.gathering.conditionsUpdated', {
      conditions: cloneJson(nextConditions),
      vocabularies: cloneJson(next.vocabularies),
    });
    return this.getConditions();
  }

  composeEnvironment(environment, system) {
    if (!environment || typeof environment !== 'object') return environment;
    const rawConfig = typeof this.getSetting === 'function' ? this.getSetting(this.settingKey) : {};
    const config = this._config();
    const systemId = String(system?.id || environment.craftingSystemId);
    const libraries = config.systems?.[systemId] || {};
    const systemConditions = resolveSystemConditionSettings(config, systemId);
    const currentConditions = conditionSettingsToCurrent(systemConditions);
    const rawSystemConfig = rawConfig?.systems?.[systemId] || {};
    const hasSystemRules =
      rawSystemConfig?.rules &&
      typeof rawSystemConfig.rules === 'object' &&
      !Array.isArray(rawSystemConfig.rules);
    const rules = hasSystemRules
      ? normalizeGatheringRules(libraries.rules)
      : normalizeGatheringRules({
          eventSelectionMode: environment.eventSelectionMode,
          eventLimit: environment.eventLimit,
          eventPolicy: environment.eventPolicy,
        });
    const compositionMode = resolveGatheringCompositionMode(environment);
    const tasks = sortRecordsByOrder(
      normalizeList(libraries.tasks)
        .filter((task) => task?.enabled !== false)
        .filter((task) =>
          environmentComposesRecord(
            environment,
            task,
            'task',
            compositionMode,
            this._recordMatchesEnvironment(task, environment, currentConditions, {
              includeDanger: false,
              conditionSettings: systemConditions,
            })
          )
        ),
      environment?.taskOrder
    ).map((task) => this._libraryTaskToRuntimeTask(task, environment));
    const events = sortRecordsByOrder(
      normalizeList(libraries.events)
        .filter((event) => event?.enabled !== false)
        .filter((event) =>
          environmentComposesRecord(
            environment,
            event,
            'event',
            compositionMode,
            this._recordMatchesEnvironment(event, environment, currentConditions, {
              includeDanger: true,
              conditionSettings: systemConditions,
            })
          )
        ),
      environment?.eventOrder
    ).map((event) => applyEventDropRateAdjustment(normalizeEvent(event), environment));

    // Modifiers are world-owned (issue 1308): one library in the `characterLibraries` setting
    // serves check modifiers and these d100 references. The gathering config's old
    // `characterModifiers` copy is retired by the 1.23.0 migration, with no read alias.
    const libraryCharacterModifiers = new Map();
    for (const entry of normalizeList(this._worldModifierLibrary(system))) {
      if (entry?.id) libraryCharacterModifiers.set(String(entry.id), cloneJson(entry));
    }

    // Tools are system-owned: read `system.tools` (normalized by `_normalizeSystem`), falling back
    // to a registry lookup when no system was passed; the gathering-config `tools` copy is retired.
    const toolSource = Array.isArray(system?.tools)
      ? resolvedToolsFor(system)
      : resolvedToolsFor(
          globalThis.game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId)
        );
    const libraryTools = new Map();
    for (const tool of normalizeList(toolSource)) {
      if (tool?.id) libraryTools.set(String(tool.id), cloneJson(tool));
    }

    const composed = {
      ...cloneJson(environment),
      conditions: cloneJson(currentConditions),
      biomes: normalizeTagList(environment.biomes ?? environment.biome),
      dangerTags: normalizeTagList(environment.dangerTags ?? environment.risk),
      tasks,
      events,
      rules,
      useLegacyTaskItemSelectionMode: !hasSystemRules,
      eventSelectionMode: rules.eventSelectionMode,
      eventLimit: rules.eventLimit,
      eventPolicy: rules.eventPolicy,
    };
    Object.defineProperties(composed, {
      __libraryCharacterModifiers: {
        value: libraryCharacterModifiers,
        enumerable: false,
        configurable: true,
        writable: true,
      },
      __libraryTools: {
        value: libraryTools,
        enumerable: false,
        configurable: true,
        writable: true,
      },
      __systemId: {
        value: systemId,
        enumerable: false,
        configurable: true,
        writable: true,
      },
    });
    return composed;
  }

  /**
   * Resolve a d100 gathering attempt. Returns `{ status: 'misconfigured', diagnostics }` when a
   * reference or override cannot resolve, so the caller stops before touching nodes, stamina or
   * attempt limits.
   *
   * @returns {Promise<object>} Resolution payload (status, roll, itemRows, items, events,
   *   eventPolicy, characterModifierSnapshot, [diagnostics]); `itemRows` keeps every evaluated row
   *   and `items` the reward-selected subset.
   */
  async resolveD100Attempt({
    task,
    environment,
    actor = null,
    viewer = null,
    system = null,
    gatheringModifier = 0,
    eventModifier = 0,
    // Opt-in Dice So Nice: `animate` pre-rolls one `Nd100` Roll and draws each row/event face
    // from it (falling back to `this.rollD100()`); `extraModifier` is a flat bonus on every throw;
    // `rollMode`/`speaker`/`flavor` decorate the post. Off, throws are silent.
    animate = false,
    extraModifier = 0,
    rollMode,
    speaker,
    flavor,
  } = {}) {
    const flatBonus = Number.isFinite(extraModifier) ? extraModifier : 0;
    const taskModifier = numericModifier(task?.gatheringModifier, gatheringModifier);

    // Rules resolve first, so the system-default modifier mode is available to each reference.
    const rules = resolveRulesForAttempt(task, environment);
    const dropModifierMode = rules.dropModifierMode;

    const itemResolution = await this._prepareD100ItemRows({
      task,
      environment,
      actor,
      viewer,
      system,
      dropModifierMode,
    });

    const environmentalEvents = await this._prepareEnvironmentalEvents({
      task,
      environment,
      actor,
      viewer,
      system,
      dropModifierMode,
    });
    const diagnostics = [...itemResolution.diagnostics, ...environmentalEvents.diagnostics];
    const { rowSnapshots, rowContributions } = itemResolution;
    const { eventSnapshots, eventContributions } = environmentalEvents;

    if (diagnostics.length > 0) {
      return {
        status: 'misconfigured',
        roll: null,
        itemRows: [],
        items: [],
        events: [],
        eventPolicy: null,
        characterModifierSnapshot: { rows: rowSnapshots, events: eventSnapshots },
        diagnostics,
      };
    }

    const itemRoll = await this._rollD100ItemRows({
      rowContributions,
      rules,
      environment,
      modifier: taskModifier + flatBonus,
      animate,
    });

    const eventResolution = this._resolvePreparedEnvironmentalEvents({
      eventContributions,
      eventSnapshots,
      rules,
      environment,
      eventModifier,
      extraModifier: flatBonus,
    });

    // Post the attempt's d100 so Dice So Nice animates it and the shown number is the one tested;
    // animate-only, and a chat failure is logged, never thrown.
    if (itemRoll.attemptRollMessage) {
      try {
        // `rollMode` is deprecated on V14; the shim picks key and vocabulary together.
        await itemRoll.attemptRollMessage.toMessage(
          { speaker, flavor },
          { ...chatModeOption(rollMode), create: true }
        );
      } catch (error) {
        console.error('Fabricate | Failed to post d100 roll to chat:', error);
      }
    }

    return {
      status: eventResolution.status === 'failed' ? 'failed' : 'succeeded',
      roll: itemRoll.roll,
      itemRows: itemRoll.itemRows,
      items: itemRoll.selectedItems,
      events: eventResolution.events,
      eventPolicy: eventResolution.eventPolicy,
      characterModifierSnapshot: { rows: rowSnapshots, events: eventSnapshots },
    };
  }

  async _prepareD100ItemRows({ task, environment, actor, viewer, system, dropModifierMode }) {
    const library =
      environment?.__libraryCharacterModifiers instanceof Map
        ? environment.__libraryCharacterModifiers
        : new Map();
    const enabledRows = normalizeList(task?.dropRows ?? task?.itemDrops)
      .filter((row) => row?.enabled !== false)
      .map((row) => normalizeItemDrop(row));
    const rowSnapshots = [];
    const rowContributions = [];
    const diagnostics = [];

    for (const row of enabledRows) {
      const contributions = [];
      const rowEvidence = [];
      for (const reference of normalizeList(row.characterModifiers)) {
        const entry = library.get(String(reference.modifierId)) || null;
        const resolved = await this._resolveCharacterModifierContribution({
          reference,
          libraryEntry: entry,
          actor,
          environment,
          task,
          row,
          event: null,
          viewer,
          system,
          dropModifierMode,
        });
        if (!resolved.ok) {
          diagnostics.push(resolved.diagnostic);
          continue;
        }
        contributions.push(resolved.contributionEntry);
        rowEvidence.push(resolved.evidence);
      }
      rowSnapshots.push({ rowId: row.id, contributions: rowEvidence });
      rowContributions.push({ row, contributions });
    }

    return { rowSnapshots, rowContributions, diagnostics };
  }

  async _rollD100ItemRows({ rowContributions, rules, environment, modifier, animate }) {
    // All item rows share one attempt roll. Environmental events are resolved separately,
    // with one independent throw per event, so hazards never correlate with the item haul.
    const rollsAttemptCheck = rowContributions.length > 0;
    let attemptRoll = null;
    let attemptRollMessage = null;
    if (rollsAttemptCheck && animate && typeof globalThis.Roll === 'function') {
      try {
        const rolled = await new globalThis.Roll('1d100').evaluate({ allowInteractive: false });
        const face = Number(rolled?.dice?.[0]?.results?.[0]?.result);
        if (Number.isFinite(face)) {
          attemptRoll = face;
          attemptRollMessage = rolled;
        }
      } catch (error) {
        console.error('Fabricate | Failed to roll the d100 gathering check:', error);
      }
    }
    if (rollsAttemptCheck && attemptRoll === null) attemptRoll = this.rollD100();

    const conditions = environment?.conditions || {};
    const biomes = Array.isArray(environment?.biomes) ? environment.biomes : [];
    const itemRows = rowContributions.map((entry, index) => ({
      ...rollDropRow({
        row: entry.row,
        index,
        roll: attemptRoll,
        modifier,
        conditions,
        biomes,
        biomeAggregation: rules.biomeModifierAggregation,
        dropModifierMode: rules.dropModifierMode,
        characterModifierContributions: entry.contributions,
      }),
      resultRowId: `${entry.row.id ?? 'drop'}:${index}`,
    }));
    const droppedItems = itemRows.filter((result) => result.dropped);
    return {
      roll: attemptRoll,
      itemRows,
      selectedItems: selectDrops(droppedItems, rules.rewardSelectionMode, rules.rewardLimit),
      attemptRollMessage,
    };
  }

  /**
   * Resolve the environment's independent event throws for any yield mode: event matching,
   * character-modifier evidence, selection and failure-with-event policy only.
   */
  async resolveEnvironmentalEvents({
    task,
    environment,
    actor = null,
    viewer = null,
    system = null,
    eventModifier = 0,
    extraModifier = 0,
  } = {}) {
    const rules = resolveRulesForAttempt(task, environment);
    const prepared = await this._prepareEnvironmentalEvents({
      task,
      environment,
      actor,
      viewer,
      system,
      dropModifierMode: rules.dropModifierMode,
    });
    if (prepared.diagnostics.length > 0) {
      return {
        status: 'misconfigured',
        events: [],
        eventPolicy: null,
        characterModifierSnapshot: { rows: [], events: prepared.eventSnapshots },
        diagnostics: prepared.diagnostics,
      };
    }
    return this._resolvePreparedEnvironmentalEvents({
      ...prepared,
      rules,
      environment,
      eventModifier,
      extraModifier,
    });
  }

  async _prepareEnvironmentalEvents({
    task,
    environment,
    actor,
    viewer,
    system,
    dropModifierMode,
  }) {
    const conditions = environment?.conditions || {};
    const library =
      environment?.__libraryCharacterModifiers instanceof Map
        ? environment.__libraryCharacterModifiers
        : new Map();
    const enabledEvents = normalizeList(environment?.events)
      .filter((event) => event?.enabled !== false)
      .map((event) => normalizeEvent(event));
    const eventSnapshots = [];
    const eventContributions = [];
    const diagnostics = [];

    for (const event of enabledEvents) {
      // Weather and time remain runtime gates after environment composition.
      if (
        evaluateEnvironmentMatch(event, environment, conditions, { includeDanger: true })
          .conditionsMet === false
      ) {
        continue;
      }
      const contributions = [];
      const eventEvidence = [];
      for (const reference of normalizeList(event.characterModifiers)) {
        const entry = library.get(String(reference.modifierId)) || null;
        const resolved = await this._resolveCharacterModifierContribution({
          reference,
          libraryEntry: entry,
          actor,
          environment,
          task,
          row: null,
          event,
          viewer,
          system,
          dropModifierMode,
        });
        if (!resolved.ok) {
          diagnostics.push(resolved.diagnostic);
          continue;
        }
        contributions.push(resolved.contributionEntry);
        eventEvidence.push(resolved.evidence);
      }
      eventSnapshots.push({ eventId: event.id, contributions: eventEvidence });
      eventContributions.push({ event, contributions });
    }

    return { eventSnapshots, eventContributions, diagnostics };
  }

  _resolvePreparedEnvironmentalEvents({
    eventContributions,
    eventSnapshots,
    rules,
    environment,
    eventModifier = 0,
    extraModifier = 0,
  }) {
    const conditions = environment?.conditions || {};
    const biomes = Array.isArray(environment?.biomes) ? environment.biomes : [];
    const flatBonus = Number.isFinite(extraModifier) ? extraModifier : 0;
    const droppedEvents = eventContributions
      .map((entry, index) =>
        rollDropRow({
          row: entry.event,
          index,
          roll: this.rollD100(),
          modifier: numericModifier(entry.event?.eventModifier, eventModifier) + flatBonus,
          conditions,
          biomes,
          biomeAggregation: rules.biomeModifierAggregation,
          dropModifierMode: rules.dropModifierMode,
          characterModifierContributions: entry.contributions,
        })
      )
      .filter((result) => result.dropped);
    const events = selectDrops(droppedEvents, rules.eventSelectionMode, rules.eventLimit);
    return {
      status:
        events.length > 0 && rules.eventPolicy === 'failureWithEvent' ? 'failed' : 'succeeded',
      events,
      eventPolicy: rules.eventPolicy,
      characterModifierSnapshot: { rows: [], events: eventSnapshots },
    };
  }

  /**
   * A no-dice preview of each drop row's chance for the "What you might find" inspector, using
   * `resolveD100Attempt`'s per-row math without rolling: base and adjusted chance plus a weather,
   * time-of-day, biome and per-ability breakdown. Unresolvable character modifiers are omitted,
   * with no diagnostics shown to players.
   *
   * @returns {Promise<{drops: object[], awardMode: string, awardLimit: number, eventPolicy: string}>}
   */
  async previewDropBreakdown({
    environment,
    task,
    actor = null,
    viewer = null,
    system = null,
  } = {}) {
    const rules = resolveRulesForAttempt(task, environment);
    const empty = {
      drops: [],
      successChance: null,
      awardMode: rules.rewardSelectionMode,
      awardLimit: rules.rewardLimit,
      eventPolicy: rules.eventPolicy,
    };
    if (task?.resolutionMode !== 'd100') return empty;
    const rows = normalizeList(task?.dropRows ?? task?.itemDrops)
      .filter((row) => row?.enabled !== false)
      .map((row) => normalizeItemDrop(row));
    if (rows.length === 0) return empty;

    const conditions = environment?.conditions || {};
    const biomes = Array.isArray(environment?.biomes) ? environment.biomes : [];
    const biomeAggregation = rules.biomeModifierAggregation;
    const library =
      environment?.__libraryCharacterModifiers instanceof Map
        ? environment.__libraryCharacterModifiers
        : new Map();

    const dropModifierMode = rules.dropModifierMode;
    const drops = [];
    for (const row of rows) {
      const character = [];
      const characterEntries = [];
      for (const reference of normalizeList(row.characterModifiers)) {
        const entry = library.get(String(reference.modifierId)) || null;
        const resolved = await this._resolveCharacterModifierContribution({
          reference,
          libraryEntry: entry,
          actor,
          environment,
          task,
          row,
          event: null,
          viewer,
          system,
          dropModifierMode,
        });
        if (resolved.ok) {
          character.push({
            label: resolved.evidence.label,
            icon: resolved.evidence.icon,
            contribution: resolved.evidence.contribution,
            mode: resolved.evidence.mode,
          });
          characterEntries.push(resolved.contributionEntry);
        }
      }
      const base = clampDropRate(row.dropRate);
      // The final chance comes from the shared mixer over all drop modifiers, matching
      // `resolveD100Attempt`; the per-kind payload below is display-only and never re-derives it.
      const conditionEntries = matchingConditionModifierEntries(
        row.conditionModifiers,
        conditions,
        biomes,
        biomeAggregation,
        dropModifierMode
      );
      const { finalRate } = applyDropModifierContributions(base, [
        ...conditionEntries,
        ...characterEntries,
      ]);
      const weather = conditionKindDisplay(
        row.conditionModifiers,
        'weather',
        conditions,
        dropModifierMode
      );
      const timeOfDay = conditionKindDisplay(
        row.conditionModifiers,
        'timeOfDay',
        conditions,
        dropModifierMode
      );
      const biome = biomeKindDisplay(
        row.conditionModifiers?.biome,
        biomes,
        biomeAggregation,
        dropModifierMode
      );
      drops.push({
        id: row.id,
        name: row.name,
        componentId: row.componentId,
        itemUuid: row.itemUuid,
        quantity: row.quantity,
        baseChance: base / 100,
        finalChance: finalRate / 100,
        modifiers: {
          weather: {
            conditionId: normalizeConditionId(conditions?.weather),
            value: weather.value,
            factor: weather.factor,
          },
          timeOfDay: {
            conditionId: normalizeConditionId(conditions?.timeOfDay),
            value: timeOfDay.value,
            factor: timeOfDay.factor,
          },
          biome: { value: biome.value, factor: biome.factor },
          character,
        },
      });
    }
    // "At least one find" from the adjusted per-drop chances, so the bar matches the rows.
    const missAll = drops.reduce(
      (product, drop) => product * (1 - Math.max(0, Math.min(1, Number(drop.finalChance) || 0))),
      1
    );
    return { ...empty, drops, successChance: 1 - missAll };
  }

  /**
   * The condition-adjusted "at least one find" chance for a task, the synchronous no-actor
   * counterpart to `previewDropBreakdown`; character modifiers are layered on by the inspector.
   *
   * @returns {number|null} A 0–1 fraction, or `null` for non-d100 tasks or no enabled rows.
   */
  taskSuccessChance(task, environment) {
    if (task?.resolutionMode !== 'd100') return null;
    const rows = normalizeList(task?.dropRows ?? task?.itemDrops)
      .filter((row) => row?.enabled !== false)
      .map((row) => normalizeItemDrop(row));
    if (rows.length === 0) return null;
    const conditions = environment?.conditions || {};
    const biomes = Array.isArray(environment?.biomes) ? environment.biomes : [];
    const rules = resolveRulesForAttempt(task, environment);
    const biomeAggregation = rules.biomeModifierAggregation;
    const dropModifierMode = rules.dropModifierMode;
    const missAll = rows.reduce((product, row) => {
      const base = clampDropRate(row.dropRate);
      // The same mixing as `resolveD100Attempt`, so multiplicative condition modifiers count.
      const { finalRate } = applyDropModifierContributions(
        base,
        matchingConditionModifierEntries(
          row.conditionModifiers,
          conditions,
          biomes,
          biomeAggregation,
          dropModifierMode
        )
      );
      return product * (1 - finalRate / 100);
    }, 1);
    return 1 - missAll;
  }

  /**
   * Resolve one character modifier reference against the actor: override-first inheritance,
   * misconfiguration detection (missing entry, `min > max`, non-finite result), evaluation,
   * min/max clamp, then the operator. The evidence feeds the per-row snapshot.
   *
   * @param {string} [payload.dropModifierMode] The system mode, applied to every reference.
   * @returns {Promise<{ok: boolean, contribution: number, contributionEntry?: object, evidence: object, diagnostic?: object}>}
   */
  async _resolveCharacterModifierContribution({
    reference,
    libraryEntry,
    actor,
    environment,
    task,
    row,
    event,
    viewer,
    system,
    dropModifierMode = 'additive',
  }) {
    const referenceId = stringOrFallback(reference?.id, '');
    const modifierId = stringOrFallback(reference?.modifierId, '');
    const operator = CHARACTER_MODIFIER_OPERATORS.has(reference?.operator)
      ? reference.operator
      : '+';
    // The single system mode; clamping and operator signing are identical in both modes, only
    // aggregation differs.
    const effectiveMode = resolveDropModifierMode(dropModifierMode);
    const min = numberOrNullStrict(reference?.min);
    const max = numberOrNullStrict(reference?.max);

    const expressionOverride = stringOrFallback(reference?.expressionOverride, '');

    if (!libraryEntry && !expressionOverride) {
      return {
        ok: false,
        diagnostic: {
          code: 'MISSING_CHARACTER_MODIFIER',
          message: `Character modifier "${modifierId}" is not defined in the library`,
          modifierId,
          referenceId,
          rowId: row?.id || null,
          eventId: event?.id || null,
        },
      };
    }

    const effectiveExpression = expressionOverride || libraryEntry?.expression || '';

    if (min !== null && max !== null && min > max) {
      return {
        ok: false,
        diagnostic: {
          code: 'INVALID_CHARACTER_MODIFIER_BOUNDS',
          message: `Character modifier "${modifierId}" has min > max`,
          modifierId,
          referenceId,
          rowId: row?.id || null,
          eventId: event?.id || null,
        },
      };
    }

    const rawValue = await this._resolveModifierRawValue({
      expression: effectiveExpression,
      modifier: { id: modifierId, label: libraryEntry?.label || modifierId },
      actor,
      environment,
      task,
      row,
      event,
      viewer,
      system,
    });

    if (rawValue == null || rawValue === '') {
      return {
        ok: false,
        diagnostic: {
          code: 'CHARACTER_MODIFIER_NON_FINITE',
          message: `Character modifier "${modifierId}" did not resolve to a finite number`,
          modifierId,
          referenceId,
          rowId: row?.id || null,
          eventId: event?.id || null,
        },
      };
    }
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) {
      return {
        ok: false,
        diagnostic: {
          code: 'CHARACTER_MODIFIER_NON_FINITE',
          message: `Character modifier "${modifierId}" did not resolve to a finite number`,
          modifierId,
          referenceId,
          rowId: row?.id || null,
          eventId: event?.id || null,
        },
      };
    }

    let clamped = numeric;
    if (min !== null) clamped = Math.max(clamped, min);
    if (max !== null) clamped = Math.min(clamped, max);
    const contribution = operator === '-' ? -clamped : clamped;

    const evidence = {
      rowId: row?.id || null,
      eventId: event?.id || null,
      referenceId,
      modifierId,
      label: libraryEntry?.label || modifierId,
      icon: libraryEntry?.icon || '',
      effectiveExpression: effectiveExpression || '',
      rawValue: numeric,
      clampedValue: clamped,
      operator,
      mode: effectiveMode,
      contribution,
      bounds: { min, max },
    };

    // Carries what aggregation needs to apply this additively (signed delta) or multiplicatively
    // (factor `1 ± value/100`).
    const contributionEntry = {
      mode: effectiveMode,
      operator,
      value: clamped,
      contribution,
    };

    return { ok: true, contribution, contributionEntry, evidence };
  }

  /** A character modifier's raw value from the injected evaluator, or `null` when none is wired or
   * it throws; the caller maps that to a non-finite diagnostic. */
  async _resolveModifierRawValue({
    expression,
    modifier,
    actor,
    environment,
    task,
    row,
    event,
    viewer,
    system,
  }) {
    const base = {
      kind: 'characterModifier',
      actor,
      environment,
      task,
      row,
      event,
      viewer,
      system,
      modifier,
    };
    try {
      if (typeof this.evaluateExpression !== 'function') return null;
      return await this.evaluateExpression({ ...base, expression });
    } catch {
      return null;
    }
  }

  inspectEnvironment(environmentId) {
    const environment = this.environmentStore?.get?.(environmentId);
    return environment ? cloneJson(environment) : null;
  }

  buildListingMetadata({ environment, task, actor, viewer, interactableRef = null }) {
    const opaqueBlind = environment?.selectionMode === 'blind' && viewer?.isGM !== true;
    const staminaEnabled = this.staminaEnabled(environment?.craftingSystemId);
    const nodesEnabled = this.nodesEnabled(environment?.craftingSystemId);
    const displayNode = this.nodeService
      ._resolveNodeSource({ environment, task, interactableRef })
      .read();
    const showNodeCounts =
      displayNode?.showCountsToPlayers === true || viewer?.isGM === true || !opaqueBlind;
    const nodes =
      nodesEnabled && displayNode
        ? {
            enabled: true,
            available: Number(displayNode.current || 0) > 0,
            depleted: Number(displayNode.current || 0) <= 0,
            // Player-safe: a depleted `nonRegenerating` pool is exhausted for good; only this
            // flag reaches players, never the respawn block.
            permanentlyExhausted:
              Number(displayNode.current || 0) <= 0 &&
              displayNode.respawn?.policy === 'nonRegenerating',
            // Player-safe policy flag for "will not replenish" copy; no counts beyond current/max.
            nonRegenerating: displayNode.respawn?.policy === 'nonRegenerating',
            current: showNodeCounts ? Number(displayNode.current || 0) : null,
            max: showNodeCounts ? Number(displayNode.max || 0) : null,
          }
        : null;
    const stamina =
      staminaEnabled && Number(task?.staminaCost || 0) > 0
        ? {
            cost: Number(task.staminaCost || 0),
            state: this.staminaService.getActorStamina(actor, environment?.craftingSystemId),
          }
        : null;
    return {
      nodes,
      stamina,
      risk: task?.riskOverride || environment?.risk || 'safe',
      conditions: this.getConditions().weather
        ? cloneJson(this._config().conditions)
        : cloneJson(environment?.conditions || {}),
      events: opaqueBlind
        ? normalizeList(environment?.events).map(() => ({ matched: true }))
        : normalizeList(environment?.events).map((event) => ({
            id: event.id,
            name: event.name,
            dropRate: event.dropRate,
          })),
    };
  }

  // Stamina surface, delegated to GatheringStaminaService (issue 376).

  getActorStamina(actor, systemId = null) {
    return this.staminaService.getActorStamina(actor, systemId);
  }

  async seedActorStaminaIfNeeded(payload = {}) {
    return this.staminaService.seedActorStaminaIfNeeded(payload);
  }

  async setActorStamina(actor, payload = {}) {
    return this.staminaService.setActorStamina(actor, payload);
  }

  async adjustActorStamina(actor, payload = {}) {
    return this.staminaService.adjustActorStamina(actor, payload);
  }

  // Node public surface — delegated to GatheringNodeService (issue 376).

  async restockNode(payload = {}) {
    return this.nodeService.restockNode(payload);
  }

  /**
   * Apply a routed environment node depletion as the active GM, the socket handler's apply body,
   * so a player's decrement lands as a GM-authored world-setting write.
   *
   * @returns {Promise<object|null>} The updated environment, or null on no-op.
   */
  async applyEnvironmentNodeDepletion(payload = {}) {
    return this.nodeService.applyEnvironmentNodeDepletion(payload);
  }

  /** Regenerate one actor's stamina over world time (GatheringStaminaService, issue 376). */
  async regenerateActorStamina(payload = {}) {
    return this.staminaService.regenerateActorStamina(payload);
  }

  /** Respawn one environment's finite nodes over world time. The `nodes.enabled` gate stays here;
   * the arithmetic is GatheringNodeService's (issue 376). */
  async respawnNodes({ environment, worldTime } = {}) {
    if (!environment) return null;
    if (!this.nodesEnabled(environment.craftingSystemId)) return null;
    return this.nodeService.respawnNodes({ environment, worldTime });
  }

  /** Respawn one interactable-scoped node pool over world time (issues 302, 376).
   * @returns {Promise<{ changed: boolean, node: object }>} */
  async respawnInteractableNode(payload = {}) {
    return this.nodeService.respawnInteractableNode(payload);
  }

  async updateConditions({ environmentId, conditions = {} } = {}) {
    if (!environmentId) {
      return this.setConditions(conditions);
    }
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    const updated = await this.environmentStore.update(environmentId, {
      conditions: {
        ...environment.conditions,
        ...conditions,
      },
    });
    this._callHook('fabricate.gathering.conditionsUpdated', {
      environmentId,
      conditions: updated?.conditions || {},
    });
    return updated;
  }

  async revealTask(actor, { environmentId, taskId, scope = 'actor' } = {}) {
    const state = readState(actor);
    const key = revealKey({ environmentId, taskId, scope, actor, userId: this.getUserId() });
    state.reveals = {
      ...state.reveals,
      [key]: this._historyEvent('blind.reveal', { environmentId, taskId, scope }),
    };
    await writeState(actor, state);
    this._callHook('fabricate.gathering.blindRevealed', { actor, environmentId, taskId, scope });
    return cloneJson(state.reveals[key]);
  }

  async clearReveal(actor, { environmentId, taskId, scope = 'actor' } = {}) {
    const state = readState(actor);
    const key = revealKey({ environmentId, taskId, scope, actor, userId: this.getUserId() });
    if (state.reveals) delete state.reveals[key];
    await writeState(actor, state);
    return true;
  }

  /** How many distinct task ids an actor revealed for an environment at a scope: the length of
   * {@link GatheringRichStateService#listRevealedTaskIds}. `0` on missing state; never throws. */
  countRevealedTasks({ actor, environmentId, scope = 'actor' } = {}) {
    return this.listRevealedTaskIds({ actor, environmentId, scope }).length;
  }

  /**
   * The distinct task ids an actor revealed for an environment at a reveal scope, matching the
   * `revealKey` prefix the `revealTask` writer uses. `party` collapses onto the `actor:` key, as
   * the writer does.
   *
   * @returns {string[]} Distinct revealed task ids; `[]` on missing or inaccessible state.
   */
  listRevealedTaskIds({ actor, environmentId, scope = 'actor' } = {}) {
    const envId = stringOrFallback(environmentId, '');
    if (!envId) return [];
    let reveals;
    try {
      reveals = readState(actor)?.reveals;
    } catch {
      return [];
    }
    if (!reveals || typeof reveals !== 'object') return [];
    // Build the prefix through `revealKey` with a sentinel task id, so it mirrors the writer.
    const sentinel = '\0';
    const sampleKey = revealKey({
      environmentId: envId,
      taskId: sentinel,
      scope,
      actor,
      userId: this.getUserId(),
    });
    const prefix = sampleKey.slice(0, sampleKey.length - sentinel.length);
    const taskIds = new Set();
    for (const [key, record] of Object.entries(reveals)) {
      if (!key.startsWith(prefix)) continue;
      // The record's own `taskId` first: keys are sanitised per segment (`revealKeySegment`), so a
      // dotted task id survives only in the record.
      const taskId = stringOrFallback(record?.taskId, '') || key.slice(prefix.length);
      if (taskId) taskIds.add(taskId);
    }
    return [...taskIds];
  }

  /**
   * Biome ids as display metadata matching the GM editor: the system vocabulary, then the global
   * one, then {@link DEFAULT_BIOME_METADATA}, via the shared vocabulary-option normalizer.
   *
   * @returns {Array<{id: string, label: string, icon: string, colorToken: string, customColor: string}>}
   */
  resolveBiomeTags(biomeIds, systemId) {
    const ids = normalizeTagList(biomeIds);
    if (ids.length === 0) return [];
    const config = this._config();
    const optionsById = new Map();
    const systemBiomes = config.systems?.[String(systemId)]?.vocabularies?.biomes;
    for (const option of normalizeVocabularyOptions(
      'biomes',
      systemBiomes?.values ?? systemBiomes
    )) {
      optionsById.set(option.id, option);
    }
    for (const option of normalizeVocabularyOptions('biomes', config.vocabularies?.biomes)) {
      if (!optionsById.has(option.id)) optionsById.set(option.id, option);
    }
    return ids.map((id) => optionsById.get(id) ?? normalizeVocabularyOption('biomes', id));
  }

  async evaluateStart({ actor, system, environment, task, viewer, interactableRef = null } = {}) {
    const blockedReasons = [];
    const evidence = this.buildListingMetadata({
      environment,
      task,
      actor,
      viewer,
      interactableRef,
    });
    const systemId = system?.id || environment?.craftingSystemId;
    const staminaEnabled = this.staminaEnabled(systemId);
    const nodesEnabled = this.nodesEnabled(systemId);

    const source = this.nodeService._resolveNodeSource({ environment, task, interactableRef });
    const gateNode = source.read();
    if (nodesEnabled && gateNode && Number(gateNode.current || 0) <= 0) {
      // A `nonRegenerating` pool at 0 never regrows or restocks, so it gets its own reason.
      const exhausted = gateNode.respawn?.policy === 'nonRegenerating';
      blockedReasons.push(
        this._blockedReason(exhausted ? 'NODE_EXHAUSTED' : 'NODE_DEPLETED', { taskId: task.id })
      );
    }

    if (staminaEnabled && Number(task?.staminaCost || 0) > 0) {
      await this.staminaService.seedActorStaminaIfNeeded({ actor, systemId, system, environment });
      const cost = await this._effectiveStaminaCost({ actor, system, environment, task, viewer });
      const stamina = this.staminaService.getActorStamina(actor, systemId);
      evidence.stamina = { cost, base: Number(task.staminaCost || 0), state: stamina };
      // Only enforce when a pool exists (max configured); no max ⇒ no stamina limit.
      if (cost > 0 && stamina.max != null && Number(stamina.current ?? 0) < cost) {
        blockedReasons.push(
          this._blockedReason('STAMINA_BLOCKED', {
            taskId: task.id,
            required: cost,
            current: stamina.current ?? 0,
          })
        );
      }
    }

    return { blockedReasons, evidence };
  }

  /**
   * @param {'immediate'|'waitingStart'|'timedMaturity'} [args.phase='immediate'] Which commit this
   *   is. A timed run commits at start and at maturity, so `onStart` depletes at `waitingStart`
   *   and `onSuccess` at `timedMaturity`; an `immediate` attempt commits once.
   */
  async commitAcceptedAttempt({
    actor,
    system,
    environment,
    task,
    outcome = null,
    viewer = null,
    interactableRef = null,
    phase = 'immediate',
  } = {}) {
    const evidence = {
      conditions: cloneJson(environment?.conditions || {}),
      risk: task?.riskOverride || environment?.risk || 'safe',
      node: null,
      stamina: null,
      characterModifierSnapshot: cloneJson(
        outcome?.characterModifierSnapshot ??
          outcome?.checkResult?.characterModifierSnapshot ??
          null
      ),
    };

    const systemId = system?.id || environment?.craftingSystemId;
    const staminaEnabled = this.staminaEnabled(systemId);
    const nodesEnabled = this.nodesEnabled(systemId);

    const source = this.nodeService._resolveNodeSource({ environment, task, interactableRef });
    const depletionSource = source.read();
    if (
      nodesEnabled &&
      depletionSource &&
      shouldDepleteNode({ nodes: depletionSource }, outcome) &&
      depletionPhaseMatches(depletionSource, phase)
    ) {
      // Persist the whole node with one unit consumed, seeding and decrementing the resolved pool
      // in one write. `deplete`, not `write`: the environment pool is a GM-only world setting, so
      // a player's decrement is routed to the GM, and `remaining` is this client's optimistic view.
      const node = depleteNodeOnce(depletionSource, {
        worldTime: Number(this.nowWorldTime?.() ?? 0),
      });
      await source.deplete(node);
      evidence.node = {
        taskId: task.id,
        consumed: 1,
        remaining: node.current,
        scope: source.kind,
        // False when relayed: `remaining` is then a possibly wrong local guess, so consumers
        // publishing a durable number (`GatheringEngine#_postGatheringChatMessage`) must suppress
        // it. `redactRichEvidence` still reads `remaining` for blind `available` reporting.
        authoritative: source.routed !== true,
      };
    }

    if (staminaEnabled && Number(task?.staminaCost || 0) > 0) {
      await this.staminaService.seedActorStaminaIfNeeded({ actor, systemId, system, environment });
      // Only spend when a pool exists (max configured); no max ⇒ no stamina limit.
      if (this.staminaService.getActorStamina(actor, systemId).max != null) {
        const cost = await this._effectiveStaminaCost({ actor, system, environment, task, viewer });
        if (cost > 0) {
          await this.staminaService.adjustActorStamina(actor, { systemId, delta: -cost });
          evidence.stamina = { spent: cost, base: Number(task.staminaCost || 0) };
        }
      }
    }

    this._callHook('fabricate.gathering.richAttemptCommitted', {
      actor,
      system,
      environment,
      task,
      outcome,
      evidence,
    });
    return evidence;
  }

  _recordMatchesEnvironment(
    record,
    environment,
    conditions,
    { includeDanger, conditionSettings = null }
  ) {
    return evaluateEnvironmentMatch(record, environment, conditions, {
      includeDanger,
      conditionSettings,
    }).matches;
  }

  _libraryTaskToRuntimeTask(task, environment = null) {
    const normalized = normalizeLibraryTask(task);
    const rowAdjustments = taskDropRateAdjustmentMap(environment, normalized.id);
    const runtimeTask = {
      id: normalized.id,
      name: normalized.name,
      description: normalized.description,
      img: normalized.img,
      enabled: normalized.enabled,
      resolutionMode: normalized.resolutionMode,
      itemSelectionMode: normalized.itemSelectionMode,
      dropRows: normalized.dropRows.map((row) =>
        applyDropRateAdjustment(row, rowAdjustments[row.id])
      ),
      staminaCost: normalized.staminaCost,
      staminaCostModifiers: Array.isArray(normalized.staminaCostModifiers)
        ? cloneJson(normalized.staminaCostModifiers)
        : [],
      gatheringModifier: normalized.gatheringModifier,
      resultGroups: cloneJson(normalized.resultGroups),
      // The task's own check-modifier pick (issue 1095) must survive this third whitelist rebuild,
      // the one the engine reads via `buildCheckModifierContext`; without it `bySubject` never
      // works on gathering. An authored empty array is a real pick and must not inherit.
      ...authoredCheckModifierIds(normalized.checkModifierIds),
      // The failure outcome must reach the engine (issue 1098): `_applyFailureFeedback` reads
      // `task.failureOutcome` off this object.
      ...authoredFailureOutcome(normalized.failureOutcome),
      // Per-task routed-check DC override (issue 904).
      dcOverride: normalized.dcOverride,
      adjustmentOverride: normalized.adjustmentOverride,
      successesOverride: normalized.successesOverride,
      catalysts: [],
      toolIds: Array.isArray(normalized.toolIds) ? [...normalized.toolIds] : [],
    };
    if (normalized.timeRequirement)
      runtimeTask.timeRequirement = cloneJson(normalized.timeRequirement);
    // Nodes are per environment: use the stored runtime pool, else a read-only full seed from the
    // library config that persists on first depletion.
    if (normalized.nodes) {
      const stored = environment?.nodeRuntime?.[normalized.id];
      // Library config is authoritative; the stored entry adds only count and respawn anchor.
      runtimeTask.nodes = stored
        ? this.nodeService._mergeNodeConfigState(cloneJson(normalized.nodes), stored)
        : { ...cloneJson(normalized.nodes), current: Number(normalized.nodes.max || 0) };
    }
    return runtimeTask;
  }

  /** Remove `systemId`'s gathering library state from the raw config, leaving other systems
   * untouched. Resolves true when an entry was removed. */
  async removeSystem(systemId) {
    if (!systemId) return false;
    if (typeof this.getSetting !== 'function' || typeof this.setSetting !== 'function')
      return false;
    const target = String(systemId);
    const raw = this.getSetting(this.settingKey);
    const systems = raw?.systems;
    if (!systems || typeof systems !== 'object' || !(target in systems)) return false;
    const nextSystems = { ...systems };
    delete nextSystems[target];
    const next = { ...raw, systems: nextSystems };
    await this.setSetting(this.settingKey, next);
    return true;
  }

  _config() {
    const raw = typeof this.getSetting === 'function' ? this.getSetting(this.settingKey) : {};
    return normalizeGatheringConfig(raw);
  }

  async _saveConfig(config) {
    if (typeof this.setSetting !== 'function') return config;
    return this.setSetting(this.settingKey, cloneJson(config));
  }

  /** Persist a system's economy block (stamina and node flags plus stamina regen) into the raw
   * config beside its other library state; resolves the normalized block, or null. */
  async setSystemEconomy({ systemId, economy } = {}) {
    if (!systemId || typeof this.setSetting !== 'function') return null;
    const target = String(systemId);
    const raw =
      (typeof this.getSetting === 'function' ? this.getSetting(this.settingKey) : null) || {};
    const systems = { ...raw.systems };
    const normalized = normalizeGatheringEconomy(economy);
    systems[target] = { ...systems[target], economy: cloneJson(normalized) };
    await this.setSetting(this.settingKey, { ...raw, systems });
    this._callHook('fabricate.gathering.economyUpdated', {
      systemId: target,
      economy: cloneJson(normalized),
    });
    return normalized;
  }

  /** A system's fully defaulted economy block, so callers never branch on absence.
   * @returns {{stamina: {enabled: boolean, regen: object}, nodes: {enabled: boolean}}} */
  _systemEconomy(systemId) {
    const economy = this._config().systems?.[String(systemId || '')]?.economy;
    // Normalized on read, so a legacy `mode` maps onto the two flags.
    return economy ? normalizeGatheringEconomy(economy) : normalizeGatheringEconomy(null);
  }

  /** Whether the per-actor stamina limitation is enabled for a system. */
  staminaEnabled(systemId) {
    return this._systemEconomy(systemId).stamina?.enabled === true;
  }

  /** Whether the finite resource-node limitation is enabled for a system. */
  nodesEnabled(systemId) {
    return this._systemEconomy(systemId).nodes?.enabled === true;
  }

  /** Whether the weather dimension is enabled for a system: match gating and the header chip. */
  weatherEnabled(systemId) {
    return resolveSystemConditionSettings(this._config(), systemId)?.weather?.enabled !== false;
  }

  /** Whether the time-of-day dimension is enabled for a system. */
  timeOfDayEnabled(systemId) {
    return resolveSystemConditionSettings(this._config(), systemId)?.timeOfDay?.enabled !== false;
  }

  /** A derived back-compat limitation "mode" for external consumers: `'both'`, `'stamina'`,
   * `'nodes'` or `'none'`. The two flags are canonical; no internal caller uses this. */
  economyMode(systemId) {
    const stamina = this.staminaEnabled(systemId);
    const nodes = this.nodesEnabled(systemId);
    if (stamina && nodes) return 'both';
    if (stamina) return 'stamina';
    if (nodes) return 'nodes';
    return 'none';
  }

  /** A system's normalized economy block. */
  systemEconomy(systemId) {
    return cloneJson(this._systemEconomy(systemId));
  }

  /**
   * The modifier library for an attempt: the per-environment map from composition, else the world
   * library (stamina regen has no environment). No system id since issue 1318, as the library is
   * world scope.
   *
   * @returns {Map<string, object>}
   */
  _modifierLibrary({ environment = null, system = null } = {}) {
    if (
      environment?.__libraryCharacterModifiers instanceof Map &&
      environment.__libraryCharacterModifiers.size > 0
    ) {
      return environment.__libraryCharacterModifiers;
    }
    const entries = this._worldModifierLibrary(system);
    return new Map(entries.map((entry) => [String(entry.id), entry]));
  }

  /** The one authored modifier library (issues 1117, 1308), now world scope. */
  _worldModifierLibrary(system) {
    // One read of the world library; nothing system-specific remains to look up (issue 1318).
    return resolveModifierLibrary(system);
  }

  /** A task's stamina cost for one actor: `task.staminaCost` adjusted by `staminaCostModifiers`
   * through the drop-chance path, floored at 0. The start gate and the spend both use it. */
  async _effectiveStaminaCost({ actor, system, environment, task, viewer = null } = {}) {
    const base = Number(task?.staminaCost || 0);
    if (base <= 0) return 0;
    const references = normalizeList(task?.staminaCostModifiers);
    if (references.length === 0) return Math.max(0, Math.round(base));
    const library = this._modifierLibrary({ environment, system });
    let total = base;
    for (const reference of references) {
      const entry = library.get(String(reference.modifierId)) || null;
      const resolved = await this._resolveCharacterModifierContribution({
        reference,
        libraryEntry: entry,
        actor,
        environment,
        task,
        row: null,
        event: null,
        viewer,
        system,
        // Stamina adjustments stay additive regardless of the system drop mode.
        dropModifierMode: 'additive',
      });
      if (resolved.ok) total += Number(resolved.evidence.contribution || 0);
    }
    return Math.max(0, Math.round(total));
  }

  /** The modifier-adjusted stamina cost to show the viewing character in a listing, or `null`
   * when stamina is off or the task has no base cost. */
  async listingStaminaCost({ actor, system = null, environment, task, viewer = null } = {}) {
    if (!this.staminaEnabled(environment?.craftingSystemId)) return null;
    if (!(Number(task?.staminaCost || 0) > 0)) return null;
    return this._effectiveStaminaCost({ actor, system, environment, task, viewer });
  }

  _blockedReason(code, data = null) {
    return {
      code,
      messageKey: BLOCKED_REASON_KEYS[code] || `FABRICATE.Gathering.Blocked.${code}`,
      data,
    };
  }

  _historyEvent(type, data = {}) {
    return {
      id: `${type}-${this._now()}-${Math.random().toString(36).slice(2)}`,
      type,
      worldTime: this._now(),
      ...cloneJson(data),
    };
  }

  _now() {
    const value = Number(this.nowWorldTime());
    return Number.isFinite(value) ? value : 0;
  }

  _callHook(name, payload) {
    try {
      this.hooks?.callAll?.(name, payload);
    } catch (error) {
      console.warn(`Fabricate | Gathering hook failed: ${name}`, error);
    }
  }
}

/**
 * Whether this commit consumes the node for a multi-commit run. A timed run commits at
 * `waitingStart` and `timedMaturity`, and `shouldDepleteNode` is true at both for `onStart`, so
 * `onStart` consumes at start and `onSuccess` at resolution; an `immediate` attempt always does.
 *
 * @param {'immediate'|'waitingStart'|'timedMaturity'} phase
 */
function depletionPhaseMatches(node, phase) {
  if (phase !== 'waitingStart' && phase !== 'timedMaturity') return true;
  const consumesOnStart = node?.depletionTiming !== 'onSuccess';
  return consumesOnStart ? phase === 'waitingStart' : phase === 'timedMaturity';
}

function shouldDepleteNode(task, outcome) {
  if (!task?.nodes) return false;
  if (task.nodes.depletionTiming === 'onSuccess') return outcome?.status === 'succeeded';
  return true;
}

/**
 * Normalize a system's gathering economy. `stamina.enabled` (actor pools) and `nodes.enabled`
 * (finite nodes) are independent and may both be on. Stamina regen applies the `amount`
 * expression per actor once per elapsed `unit` of world time under `policy: 'overTime'`.
 *
 * A legacy `mode` maps to the flags only when neither flag key is present, so a stale `mode` never
 * resurrects a disabled limitation. `resolutionMode` (default `d100`, the only honoured value) is
 * GM config and never reaches the player listing.
 *
 * @returns {{resolutionMode: string, stamina: {enabled: boolean, regen: object}, nodes: {enabled: boolean}}}
 */
function normalizeGatheringEconomy(raw = {}) {
  const regen = raw?.stamina?.regen || {};
  // A flag counts as present when its key exists, not when it is truthy.
  const hasStaminaFlag =
    raw?.stamina != null && Object.prototype.hasOwnProperty.call(raw.stamina, 'enabled');
  const hasNodesFlag =
    raw?.nodes != null && Object.prototype.hasOwnProperty.call(raw.nodes, 'enabled');
  const legacyMode = ECONOMY_MODES.has(raw?.mode) ? raw.mode : 'none';
  const staminaEnabled = hasStaminaFlag ? raw.stamina.enabled === true : legacyMode === 'stamina';
  const nodesEnabled = hasNodesFlag ? raw.nodes.enabled === true : legacyMode === 'nodes';
  return {
    resolutionMode: GATHERING_RESOLUTION_MODES.has(raw?.resolutionMode)
      ? raw.resolutionMode
      : 'd100',
    stamina: {
      enabled: staminaEnabled,
      // Expressions ("40", "4 * @abilities.con.mod") rolled once per character at seed time;
      // a blank `start` starts full.
      max: stringOrFallback(raw?.stamina?.max, ''),
      start: stringOrFallback(raw?.stamina?.start, ''),
      regen: {
        policy: STAMINA_REGEN_POLICIES.has(regen.policy)
          ? regen.policy
          : (LEGACY_STAMINA_REGEN_POLICY_MAP[regen.policy] ?? 'none'),
        unit: STAMINA_REGEN_UNITS.has(regen.unit) ? regen.unit : 'hours',
        // One expression, a number or a formula with character references, evaluated per actor.
        amount: stringOrFallback(regen.amount, ''),
        lastRoll:
          regen.lastRoll && typeof regen.lastRoll === 'object' ? cloneJson(regen.lastRoll) : null,
      },
    },
    nodes: { enabled: nodesEnabled },
  };
}

function normalizeGatheringConfig(raw = {}) {
  const vocabularies = {
    // `weather` / `timeOfDay` are condition-option ids (kebab-cased, as `setConditions`
    // stores them); `biomes` / `danger` are tags (lower-cased only, as the biome
    // modifier lookup and authored task/event biomes match them).
    biomes: seedVocabulary(raw?.vocabularies?.biomes, DEFAULT_VOCABULARIES.biomes),
    danger: seedVocabulary(raw?.vocabularies?.danger, DEFAULT_VOCABULARIES.danger),
    weather: seedVocabulary(
      raw?.vocabularies?.weather,
      DEFAULT_VOCABULARIES.weather,
      normalizeConditionId
    ),
    timeOfDay: seedVocabulary(
      raw?.vocabularies?.timeOfDay,
      DEFAULT_VOCABULARIES.timeOfDay,
      normalizeConditionId
    ),
  };
  const weather = normalizeConditionId(raw?.conditions?.weather) || DEFAULT_CONDITIONS.weather;
  const timeOfDay =
    normalizeConditionId(raw?.conditions?.timeOfDay) || DEFAULT_CONDITIONS.timeOfDay;
  const systems = {};
  for (const [systemId, config] of Object.entries(raw?.systems || {})) {
    systems[String(systemId)] = {
      rules: normalizeGatheringRules(config?.rules),
      conditions: normalizeSystemConditions(config?.conditions, {
        vocabularies,
        conditions: { weather, timeOfDay },
      }),
      vocabularies: normalizeSystemVocabularies(config?.vocabularies, vocabularies),
      tasks: normalizeList(config?.tasks).map(normalizeLibraryTask),
      tools: normalizeList(config?.tools).map(normalizeLibraryTool).filter(Boolean),
      events: normalizeList(config?.events).map(normalizeEvent),
      // `characterModifiers` is not emitted (issue 1117): this allowlist rebuild retires it.
      economy: normalizeGatheringEconomy(config?.economy),
    };
  }
  return {
    vocabularies,
    conditions: {
      weather: weather || DEFAULT_CONDITIONS.weather,
      timeOfDay: timeOfDay || DEFAULT_CONDITIONS.timeOfDay,
    },
    systems,
  };
}

function normalizeSystemConditions(raw = {}, fallback = {}) {
  const normalized = {};
  for (const kind of CONDITION_DIMENSIONS) {
    const fallbackValues = fallback?.vocabularies?.[kind] || DEFAULT_VOCABULARIES[kind];
    const enabled = raw?.[kind]?.enabled !== false;
    const explicitValues = Array.isArray(raw?.[kind]?.values);
    const normalizedValues = explicitValues
      ? normalizeConditionOptions(kind, raw?.[kind]?.values)
      : seedConditionOptions(kind, raw?.[kind]?.values, fallbackValues);
    const values =
      normalizedValues.length > 0 || !enabled
        ? normalizedValues
        : normalizeConditionOptions(kind, fallbackValues);
    const fallbackCurrent =
      normalizeConditionId(fallback?.conditions?.[kind]) || DEFAULT_CONDITIONS[kind];
    const requestedCurrent = normalizeConditionId(raw?.[kind]?.current) || fallbackCurrent;
    const valueIds = values.map((option) => option.id);
    normalized[kind] = {
      enabled,
      current: valueIds.includes(requestedCurrent)
        ? requestedCurrent
        : values[0]?.id || DEFAULT_CONDITIONS[kind],
      values,
    };
  }
  return normalized;
}

function resolveSystemConditionSettings(config, systemId) {
  return (
    config?.systems?.[systemId]?.conditions ||
    normalizeSystemConditions(null, {
      vocabularies: config?.vocabularies,
      conditions: config?.conditions,
    })
  );
}

function normalizeSystemVocabularies(raw = {}, fallbackVocabularies = {}) {
  const normalized = {};
  for (const kind of VOCABULARY_DIMENSIONS) {
    const rawValues = Array.isArray(raw?.[kind]?.values)
      ? raw[kind].values
      : Array.isArray(raw?.[kind])
        ? raw[kind]
        : fallbackVocabularies?.[kind];
    normalized[kind] = {
      values: normalizeVocabularyOptions(kind, rawValues),
    };
  }
  return normalized;
}

/**
 * Carry a validated global condition onto every system offering it, because composition gates
 * on `systems[id].conditions[kind].current`. A system whose `values` exclude the id keeps its
 * current, and a disabled dimension is updated too, since `enabled` governs gating, not storage.
 */
function withSystemCurrentCondition(systems, kind, current) {
  const next = {};
  for (const [systemId, config] of Object.entries(systems || {})) {
    const dimension = config?.conditions?.[kind];
    const offersCurrent = (dimension?.values || []).some((option) => option?.id === current);
    next[systemId] = offersCurrent
      ? { ...config, conditions: { ...config.conditions, [kind]: { ...dimension, current } } }
      : config;
  }
  return next;
}

function normalizeLibraryTask(task = {}) {
  const id = stringOrFallback(task.id, `task-${normalizeTag(task.name) || 'gather'}`);
  return {
    id,
    name: stringOrFallback(task.name, 'Gather'),
    description: stringOrFallback(task.description, ''),
    img: stringOrFallback(task.img, 'icons/svg/item-bag.svg'),
    enabled: task.enabled !== false,
    biomes: normalizeTagList(task.biomes),
    weather: normalizeConditionIdList(task.weather),
    timeOfDay: normalizeConditionIdList(task.timeOfDay),
    itemSelectionMode: LEGACY_DROP_SELECTION_MODES.has(task.itemSelectionMode)
      ? task.itemSelectionMode
      : 'highestRankedDrop',
    resolutionMode: GATHERING_TASK_RESOLUTION_MODES.has(task.resolutionMode)
      ? task.resolutionMode
      : 'd100',
    resultGroups: normalizeGatheringResultGroups(task.resultGroups, { fallbackPrefix: id }),
    dropRows: normalizeList(task.dropRows ?? task.itemDrops).map(normalizeItemDrop),
    staminaCost: nonNegativeNumber(task.staminaCost, 0),
    staminaCostModifiers: normalizeCharacterModifierReferenceList(task.staminaCostModifiers),
    gatheringModifier: normalizeModifierProvider(task.gatheringModifier ?? task.modifier),
    timeRequirement: plainObjectOrNull(task.timeRequirement),
    toolIds: Array.isArray(task.toolIds)
      ? task.toolIds.map((id) => String(id ?? '').trim()).filter(Boolean)
      : [],
    nodes: normalizeNodeConfig(task.nodes),
    // The task's check-modifier pick (issue 1095), used under `bySubject`, attached only when
    // authored: an empty array is a pick of zero, absence inherits `defaultModifierIds`. This
    // mirrors `_normalizeGatheringTask` in adminStore.js; both are whitelist rebuilds, so a key
    // missing from either is dropped on save.
    ...authoredCheckModifierIds(task.checkModifierIds),
    // Failure feedback (issue 1098), which `_libraryTaskToRuntimeTask` must emit too.
    ...authoredFailureOutcome(task.failureOutcome),
    // Per-task routed DC override (issue 904). Null and '' stay null, since `Number(null)` is 0,
    // mirroring `_normalizeGatheringTask` in adminStore.js.
    dcOverride: (() => {
      const raw = task.dcOverride;
      if ([null, undefined, ''].includes(raw)) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    })(),
    adjustmentOverride: normalizeNullableAdjustment(task.adjustmentOverride),
    successesOverride: normalizeNullableSuccesses(task.successesOverride),
  };
}

function normalizeItemDrop(row = {}) {
  return {
    id: stringOrFallback(
      row.id,
      `drop-${normalizeTag(row.componentId ?? row.itemUuid ?? row.name) || 'row'}`
    ),
    name: stringOrFallback(row.name, ''),
    componentId: stringOrFallback(row.componentId ?? row.systemItemId, ''),
    itemUuid: stringOrFallback(row.itemUuid, ''),
    quantity: Math.max(1, nonNegativeInteger(row.quantity, 1)),
    dropRate: clampDropRate(row.dropRate),
    conditionModifiers: normalizeDropConditionModifiers(row.conditionModifiers),
    characterModifiers: normalizeDropCharacterModifiers(row.characterModifiers),
    enabled: row.enabled !== false,
  };
}

const TOOL_BREAKAGE_MODES = new Set(['limitedUses', 'breakageChance', 'diceExpression']);
const TOOL_ON_BREAK_MODES = new Set(['destroy', 'flagBroken', 'replaceWith']);

function normalizeToolRequirement(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  return {
    formula: typeof input.formula === 'string' ? input.formula : '',
  };
}

function normalizeToolBreakage(input) {
  const mode = TOOL_BREAKAGE_MODES.has(input?.mode) ? input.mode : 'limitedUses';
  if (mode === 'limitedUses') {
    const raw = input?.maxUses;
    const isSet = raw !== null && raw !== undefined && raw !== '';
    const numeric = isSet ? Number(raw) : null;
    return { mode, maxUses: Number.isFinite(numeric) ? numeric : null };
  }
  if (mode === 'breakageChance') {
    const numeric = Number(input?.breakageChance);
    return { mode, breakageChance: Number.isFinite(numeric) ? numeric : 0 };
  }
  const threshold = Number(input?.threshold);
  return {
    mode,
    formula: typeof input?.formula === 'string' ? input.formula : '',
    threshold: Number.isFinite(threshold) ? threshold : 0,
  };
}

function normalizeToolOnBreak(input) {
  const mode = TOOL_ON_BREAK_MODES.has(input?.mode) ? input.mode : 'destroy';
  if (mode === 'replaceWith') {
    return {
      mode,
      replacementComponentId:
        typeof input?.replacementComponentId === 'string' ? input.replacementComponentId : null,
    };
  }
  return { mode };
}

function normalizeLibraryTool(tool = {}) {
  if (!tool || typeof tool !== 'object') return null;
  const id = stringOrFallback(tool.id, '');
  if (!id) return null;
  const label = stringOrFallback(tool.label, '').trim();
  const componentId = stringOrFallback(tool.componentId, '').trim() || null;
  return {
    id,
    label,
    enabled: tool.enabled !== false,
    componentId,
    requirement: normalizeToolRequirement(tool.requirement),
    breakage: normalizeToolBreakage(tool.breakage),
    onBreak: normalizeToolOnBreak(tool.onBreak),
  };
}

function normalizeEvent(event = {}) {
  return {
    id: stringOrFallback(event.id, `event-${normalizeTag(event.name) || 'row'}`),
    name: stringOrFallback(event.name, 'Event'),
    description: stringOrFallback(event.description, ''),
    img: stringOrFallback(event.img, 'icons/svg/mystery-man.svg'),
    enabled: event.enabled !== false,
    dangerTags: normalizeTagList(event.dangerTags),
    biomes: normalizeTagList(event.biomes),
    weather: normalizeConditionIdList(event.weather),
    timeOfDay: normalizeConditionIdList(event.timeOfDay),
    dropRate: clampDropRate(event.dropRate),
    linkedSceneUuid: stringOrFallback(event.linkedSceneUuid, ''),
    eventModifier: normalizeModifierProvider(event.eventModifier ?? event.modifier),
    conditionModifiers: normalizeDropConditionModifiers(event.conditionModifiers),
    characterModifiers: normalizeEventCharacterModifiers(event.characterModifiers),
  };
}

function normalizeDropRateAdjustmentValue(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < -100 || number > 100 || number === 0) return 0;
  return number;
}

function dropRateAdjustmentMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([id, adjustment]) => [
        String(id || '').trim(),
        normalizeDropRateAdjustmentValue(adjustment),
      ])
      .filter(([id, adjustment]) => id && adjustment !== 0)
  );
}

function taskDropRateAdjustmentMap(environment, taskId) {
  const id = String(taskId || '');
  const enabledMap = environment?.taskDropRateAdjustmentsEnabled;
  if (
    enabledMap &&
    typeof enabledMap === 'object' &&
    !Array.isArray(enabledMap) &&
    enabledMap[id] === false
  )
    return {};
  const taskMaps = environment?.taskDropRateAdjustments;
  if (!taskMaps || typeof taskMaps !== 'object' || Array.isArray(taskMaps)) return {};
  return dropRateAdjustmentMap(taskMaps[id]);
}

function applyDropRateAdjustment(row, adjustment = 0) {
  const normalizedAdjustment = normalizeDropRateAdjustmentValue(adjustment);
  const baseDropRate = clampDropRate(row?.dropRate);
  return {
    ...cloneJson(row),
    dropRate: clampDropRate(baseDropRate + normalizedAdjustment),
    baseDropRate,
    environmentDropRateAdjustment: normalizedAdjustment,
  };
}

function applyEventDropRateAdjustment(event, environment) {
  const id = String(event?.id || '');
  const enabledMap = environment?.eventDropRateAdjustmentsEnabled;
  if (
    enabledMap &&
    typeof enabledMap === 'object' &&
    !Array.isArray(enabledMap) &&
    enabledMap[id] === false
  ) {
    return applyDropRateAdjustment(event, 0);
  }
  const adjustments = dropRateAdjustmentMap(environment?.eventDropRateAdjustments);
  const adjustment = adjustments[id] || 0;
  return applyDropRateAdjustment(event, adjustment);
}

/** Normalize drop-row character modifier references. */
export function normalizeDropCharacterModifiers(refs) {
  return normalizeCharacterModifierReferenceList(refs);
}

/** Normalize event-row character modifier references. */
export function normalizeEventCharacterModifiers(refs) {
  return normalizeCharacterModifierReferenceList(refs);
}

function normalizeCharacterModifierReferenceList(refs) {
  return (Array.isArray(refs) ? refs : [])
    .map((ref, index) => normalizeCharacterModifierReference(ref, index))
    .filter(Boolean);
}

function normalizeCharacterModifierReference(ref, index) {
  if (!ref || typeof ref !== 'object') return null;
  const modifierId = stringOrFallback(ref.modifierId, '');
  if (!modifierId) return null;
  return {
    id: stringOrFallback(ref.id, `char-mod-${modifierId}-${index + 1}`),
    modifierId,
    operator: CHARACTER_MODIFIER_OPERATORS.has(ref.operator) ? ref.operator : '+',
    min: numberOrNullStrict(ref.min),
    max: numberOrNullStrict(ref.max),
    expressionOverride: stringOrFallback(ref.expressionOverride, ''),
  };
}

function normalizeModifierProvider(provider = null) {
  if (!provider || typeof provider !== 'object') return null;
  return {
    provider: stringOrFallback(provider.provider, ''),
    value: numberOrNull(provider.value),
    formula: stringOrFallback(provider.formula, ''),
    macroUuid: stringOrFallback(provider.macroUuid, ''),
  };
}

function numericModifier(provider = null, fallback = 0) {
  if (provider && typeof provider === 'object') {
    for (const value of [provider.value, provider.formula]) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
  }
  const direct = Number(provider);
  if (Number.isFinite(direct)) return direct;
  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
}

/**
 * Aggregate resolved drop-modifier contributions (character and condition) onto a base rate:
 * sum the additive deltas first, multiply by the product of the multiplicative factors
 * (`1 ± value/100`, floored at 0), then clamp to [0, 100] and round once. Additive-only input
 * gives the plain sum. A plain-number entry is an additive delta.
 *
 * @returns {{finalRate: number, additiveTotal: number, multiplicativeFactor: number}}
 */
function applyDropModifierContributions(baseRate, entries) {
  const list = Array.isArray(entries) ? entries : [];
  let additiveTotal = 0;
  let multiplicativeFactor = 1;
  for (const entry of list) {
    if (entry == null) continue;
    if (typeof entry === 'number') {
      additiveTotal += Number(entry) || 0;
      continue;
    }
    if (entry.mode === 'multiplicative') {
      const value = Number(entry.value) || 0;
      const factor = entry.operator === '-' ? 1 - value / 100 : 1 + value / 100;
      multiplicativeFactor *= Math.max(0, factor);
      continue;
    }
    additiveTotal += Number(entry.contribution) || 0;
  }
  const finalRate = Math.min(
    100,
    Math.max(0, Math.round((Number(baseRate) + additiveTotal) * multiplicativeFactor))
  );
  return { finalRate, additiveTotal, multiplicativeFactor };
}

/** One condition modifier as an aggregation entry under the system `dropModifierMode`, shaped like
 * the character `contributionEntry` for {@link applyDropModifierContributions}. */
function conditionEntry(modifier, dropModifierMode) {
  const value = Number(modifier.value) || 0;
  return {
    mode: resolveDropModifierMode(dropModifierMode),
    operator: modifier.operator,
    value,
    contribution: modifier.operator === '-' ? -value : value,
  };
}

/**
 * The active condition modifiers as aggregation entries: weather and time-of-day match by
 * `conditionId`, and biomes collapse per mode via {@link matchingBiomeModifierEntries}.
 */
function matchingConditionModifierEntries(
  modifiers = {},
  conditions = {},
  biomes = [],
  biomeAggregation = 'strongestOfEach',
  dropModifierMode = 'additive'
) {
  const entries = [];
  for (const kind of ['timeOfDay', 'weather']) {
    const current = normalizeConditionId(conditions?.[kind]);
    if (!current) continue;
    for (const modifier of normalizeDropConditionModifierList(modifiers?.[kind])) {
      if (modifier.conditionId !== current) continue;
      entries.push(conditionEntry(modifier, dropModifierMode));
    }
  }
  entries.push(
    ...matchingBiomeModifierEntries(modifiers?.biome, biomes, biomeAggregation, dropModifierMode)
  );
  return entries;
}

function rollDropRow({
  row,
  index,
  roll,
  modifier,
  conditions = {},
  biomes = [],
  biomeAggregation = 'strongestOfEach',
  dropModifierMode = 'additive',
  characterModifierContributions = [],
}) {
  const effectiveRoll = Number(roll) + Number(modifier || 0);
  const conditionEntries = matchingConditionModifierEntries(
    row.conditionModifiers,
    conditions,
    biomes,
    biomeAggregation,
    dropModifierMode
  );
  // `conditionModifier` keeps its meaning, the signed additive condition delta only.
  const conditionModifier = conditionEntries
    .filter((entry) => entry.mode !== 'multiplicative')
    .reduce((sum, entry) => sum + (Number(entry.contribution) || 0), 0);
  // Character-only additive total and multiplicative product, kept as their own evidence fields.
  const charList = Array.isArray(characterModifierContributions)
    ? characterModifierContributions
    : [];
  const characterModifierTotal = charList
    .filter((entry) => entry && typeof entry === 'object' && entry.mode !== 'multiplicative')
    .reduce((sum, entry) => sum + (Number(entry.contribution) || 0), 0);
  const characterModifierFactor = charList
    .filter((entry) => entry && typeof entry === 'object' && entry.mode === 'multiplicative')
    .reduce((product, entry) => {
      const value = Number(entry.value) || 0;
      const factor = entry.operator === '-' ? 1 - value / 100 : 1 + value / 100;
      return product * Math.max(0, factor);
    }, 1);
  const allEntries = [...conditionEntries, ...charList];
  const { finalRate } = applyDropModifierContributions(Number(row.dropRate), allEntries);
  const finalDropRate = finalRate;
  const threshold = 101 - finalDropRate;
  return {
    ...cloneJson(row),
    rank: index,
    roll: Number(roll),
    modifier: Number(modifier || 0),
    conditionModifier,
    characterModifierTotal,
    characterModifierFactor,
    finalDropRate,
    effectiveRoll,
    threshold,
    dropped: effectiveRoll >= threshold,
  };
}

function normalizeDropConditionModifiers(modifiers = {}) {
  return {
    timeOfDay: normalizeDropConditionModifierList(modifiers?.timeOfDay),
    weather: normalizeDropConditionModifierList(modifiers?.weather),
    biome: normalizeDropConditionModifierList(modifiers?.biome),
  };
}

function normalizeDropConditionModifierList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((modifier, index) => {
      const conditionId = normalizeConditionId(modifier?.conditionId ?? modifier?.id);
      const rawValue = Number(modifier?.value);
      if (!conditionId || !Number.isFinite(rawValue)) return null;
      const truncated = Math.trunc(rawValue);
      const explicitOperator =
        modifier?.operator === '-' || modifier?.operator === '+' ? modifier.operator : null;
      const operator = explicitOperator ?? (truncated < 0 ? '-' : '+');
      return {
        id: stringOrFallback(modifier?.id, `${conditionId}-${index + 1}`),
        conditionId,
        operator,
        value: Math.abs(truncated),
      };
    })
    .filter(Boolean);
}

// Display split for one condition kind: the additive delta and the multiplicative factor (`1`
// when none), for `previewDropBreakdown`; the final chance is computed from the entries.
function conditionKindDisplay(
  modifiers = {},
  kind,
  conditions = {},
  dropModifierMode = 'additive'
) {
  const current = normalizeConditionId(conditions?.[kind]);
  if (!current) return { value: 0, factor: 1 };
  let value = 0;
  let factor = 1;
  for (const modifier of normalizeDropConditionModifierList(modifiers?.[kind])) {
    if (modifier.conditionId !== current) continue;
    const entry = conditionEntry(modifier, dropModifierMode);
    if (entry.mode === 'multiplicative') {
      const f = entry.operator === '-' ? 1 - entry.value / 100 : 1 + entry.value / 100;
      factor *= Math.max(0, f);
    } else {
      value += entry.contribution;
    }
  }
  return { value, factor };
}

// Display split for biome modifiers, mirroring `matchingBiomeModifierEntries`.
function biomeKindDisplay(
  biomeModifiers = [],
  biomes = [],
  aggregation = 'strongestOfEach',
  dropModifierMode = 'additive'
) {
  const entries = matchingBiomeModifierEntries(
    biomeModifiers,
    biomes,
    aggregation,
    dropModifierMode
  );
  let value = 0;
  let factor = 1;
  for (const entry of entries) {
    if (entry.mode === 'multiplicative') {
      factor *= Math.max(0, entry.operator === '-' ? 1 - entry.value / 100 : 1 + entry.value / 100);
    } else {
      value += entry.contribution;
    }
  }
  return { value, factor };
}

/**
 * The active biome modifiers as at most two entries, one additive and one multiplicative, under
 * the system `dropModifierMode`. Each subset aggregates by {@link aggregateBiomeModifierValues}
 * over signed values; the multiplicative subset aggregates in signed-percent space, not as a
 * product of factors, and becomes one `± value` entry.
 *
 * @returns {Array<object>} Zero, one, or two structured entries.
 */
function matchingBiomeModifierEntries(
  biomeModifiers = [],
  biomes = [],
  aggregation = 'strongestOfEach',
  dropModifierMode = 'additive'
) {
  const activeBiomes = new Set(
    (Array.isArray(biomes) ? biomes : []).map(normalizeTag).filter(Boolean)
  );
  if (activeBiomes.size === 0) return [];
  const matching = normalizeDropConditionModifierList(biomeModifiers).filter((modifier) =>
    activeBiomes.has(normalizeTag(modifier.conditionId))
  );
  const additiveValues = [];
  const multiplicativeValues = [];
  for (const modifier of matching) {
    const signed = modifier.operator === '-' ? -modifier.value : modifier.value;
    if (resolveDropModifierMode(dropModifierMode) === 'multiplicative') {
      multiplicativeValues.push(signed);
    } else {
      additiveValues.push(signed);
    }
  }
  const entries = [];
  const additiveDelta = aggregateBiomeModifierValues(additiveValues, aggregation);
  if (additiveDelta !== 0) {
    entries.push({
      mode: 'additive',
      operator: additiveDelta < 0 ? '-' : '+',
      value: Math.abs(additiveDelta),
      contribution: additiveDelta,
    });
  }
  const multiplicativePercent = aggregateBiomeModifierValues(multiplicativeValues, aggregation);
  if (multiplicativePercent !== 0) {
    entries.push({
      mode: 'multiplicative',
      operator: multiplicativePercent < 0 ? '-' : '+',
      value: Math.abs(multiplicativePercent),
    });
  }
  return entries;
}

function aggregateBiomeModifierValues(values = [], aggregation = 'strongestOfEach') {
  if (!Array.isArray(values) || values.length === 0) return 0;
  if (aggregation === 'cumulative') return values.reduce((sum, value) => sum + value, 0);
  if (aggregation === 'dominant') {
    return values.reduce((best, value) => (Math.abs(value) > Math.abs(best) ? value : best), 0);
  }
  // strongestOfEach: largest boost plus largest penalty.
  const positives = values.filter((value) => value > 0);
  const negatives = values.filter((value) => value < 0);
  const maxPositive = positives.length > 0 ? Math.max(...positives) : 0;
  const minNegative = negatives.length > 0 ? Math.min(...negatives) : 0;
  return maxPositive + minNegative;
}

function normalizeGatheringRules(rules = {}) {
  return {
    rewardSelectionMode: DROP_SELECTION_MODES.has(rules?.rewardSelectionMode)
      ? rules.rewardSelectionMode
      : DEFAULT_GATHERING_RULES.rewardSelectionMode,
    rewardLimit: positiveInteger(rules?.rewardLimit, DEFAULT_GATHERING_RULES.rewardLimit),
    eventSelectionMode: DROP_SELECTION_MODES.has(rules?.eventSelectionMode)
      ? rules.eventSelectionMode
      : DEFAULT_GATHERING_RULES.eventSelectionMode,
    eventLimit: positiveInteger(rules?.eventLimit, DEFAULT_GATHERING_RULES.eventLimit),
    eventPolicy: EVENT_POLICIES.has(rules?.eventPolicy)
      ? rules.eventPolicy
      : DEFAULT_GATHERING_RULES.eventPolicy,
    toolBreakagePolicy: TOOL_BREAKAGE_POLICIES.has(rules?.toolBreakagePolicy)
      ? rules.toolBreakagePolicy
      : DEFAULT_GATHERING_RULES.toolBreakagePolicy,
    biomeModifierAggregation: BIOME_MODIFIER_AGGREGATIONS.has(rules?.biomeModifierAggregation)
      ? rules.biomeModifierAggregation
      : DEFAULT_GATHERING_RULES.biomeModifierAggregation,
    blindCandidateGate: BLIND_CANDIDATE_GATES.has(rules?.blindCandidateGate)
      ? rules.blindCandidateGate
      : DEFAULT_GATHERING_RULES.blindCandidateGate,
    revealPolicy: REVEAL_POLICIES.has(rules?.revealPolicy)
      ? rules.revealPolicy
      : DEFAULT_GATHERING_RULES.revealPolicy,
    revealScope: REVEAL_SCOPES.has(rules?.revealScope)
      ? rules.revealScope
      : DEFAULT_GATHERING_RULES.revealScope,
    eventVisibility: GATHERING_EVENT_VISIBILITIES.has(rules?.eventVisibility)
      ? rules.eventVisibility
      : DEFAULT_GATHERING_RULES.eventVisibility,
    // Read `dropModifierMode`, then the unreleased legacy `characterModifierMode` (a read-time
    // shim, issue 324), then the default; the legacy key is never emitted.
    dropModifierMode: DROP_MODIFIER_MODES.has(rules?.dropModifierMode)
      ? rules.dropModifierMode
      : DROP_MODIFIER_MODES.has(rules?.characterModifierMode)
        ? rules.characterModifierMode
        : DEFAULT_GATHERING_RULES.dropModifierMode,
  };
}

function resolveRulesForAttempt(task = {}, environment = {}) {
  const normalized = normalizeGatheringRules(environment?.rules);
  if (environment?.useLegacyTaskItemSelectionMode !== true && environment?.rules) {
    return normalized;
  }
  return {
    ...normalized,
    rewardSelectionMode: LEGACY_DROP_SELECTION_MODES.has(task?.itemSelectionMode)
      ? task.itemSelectionMode
      : normalized.rewardSelectionMode,
    eventSelectionMode: LEGACY_DROP_SELECTION_MODES.has(environment?.eventSelectionMode)
      ? environment.eventSelectionMode
      : normalized.eventSelectionMode,
    eventLimit: positiveInteger(environment?.eventLimit, normalized.eventLimit),
    eventPolicy: EVENT_POLICIES.has(environment?.eventPolicy)
      ? environment.eventPolicy
      : normalized.eventPolicy,
  };
}

function selectDrops(drops, mode, limit = 1) {
  if (mode === 'allDrops') return drops.map((drop) => cloneJson(drop));
  const ranked = [...drops].sort((left, right) => Number(left.rank) - Number(right.rank));
  if (mode === 'limitedDrops')
    return ranked.slice(0, positiveInteger(limit, 1)).map((drop) => cloneJson(drop));
  const highest = ranked[0];
  return highest ? [cloneJson(highest)] : [];
}

function seedVocabulary(raw, defaults, normalizeId = normalizeTag) {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  // The manager persists option records while this reads ids, so records unwrap to their id, and
  // a stringified record (`[object object]`, or `object-object` once kebab-cased) is discarded;
  // an all-poison list re-seeds the defaults.
  const sentinel = normalizeId(OBJECT_STRINGIFICATION);
  const ids = values
    .map((value) =>
      normalizeId(
        value && typeof value === 'object' ? (value.id ?? value.value ?? value.label) : value
      )
    )
    .filter((id) => id && id !== sentinel);
  const unique = [...new Set(ids)];
  return unique.length > 0 ? unique : [...defaults];
}

function vocabularyLabelFromId(id) {
  return String(id || '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((token) =>
      token.length <= 2 ? token.toUpperCase() : `${token.charAt(0).toUpperCase()}${token.slice(1)}`
    )
    .join(' ');
}

function normalizeBiomeColorToken(value) {
  const token = String(value || '')
    .trim()
    .replace(/^--fab-tag-/, '');
  return BIOME_COLOR_TOKENS.has(token) ? token : DEFAULT_BIOME_COLOR_TOKEN;
}

function normalizeCustomHex(value) {
  const hex = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : '';
}

function normalizeVocabularyOption(kind, value) {
  const isRecord = value && typeof value === 'object';
  const id = normalizeTag(isRecord ? (value.id ?? value.value ?? value.label) : value);
  if (!id) return null;
  const rawLabel = isRecord ? String(value.label ?? '').trim() : '';
  const defaultBiome = kind === 'biomes' ? DEFAULT_BIOME_METADATA[id] : null;
  // A bare string gets a capitalised generated label; a record keeps its own.
  const label = isRecord
    ? rawLabel || defaultBiome?.label || vocabularyLabelFromId(id)
    : defaultBiome?.label || vocabularyLabelFromId(id);
  if (kind === 'biomes') {
    return {
      id,
      label,
      icon: normalizeConditionIcon(
        isRecord
          ? value.icon || defaultBiome?.icon || 'fas fa-tree'
          : defaultBiome?.icon || 'fas fa-tree',
        'fas fa-tree'
      ),
      colorToken: normalizeBiomeColorToken(
        isRecord
          ? value.colorToken || defaultBiome?.colorToken || DEFAULT_BIOME_COLOR_TOKEN
          : defaultBiome?.colorToken || DEFAULT_BIOME_COLOR_TOKEN
      ),
      customColor: normalizeCustomHex(isRecord ? value.customColor : ''),
    };
  }
  return { id, label };
}

function normalizeVocabularyOptions(kind, value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const options = [];
  const seen = new Set();
  for (const raw of values) {
    const option = normalizeVocabularyOption(kind, raw);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options;
}

function normalizeConditionIdList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(normalizeConditionId).filter(Boolean))];
}

function normalizeConditionIcon(icon, fallback) {
  const tokens = String(icon || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const prefix =
    tokens.find((token) =>
      /^(?:fa[bsrltd]?|fa-solid|fa-regular|fa-light|fa-thin|fa-duotone|fa-brands)$/.test(token)
    ) || 'fas';
  const iconToken = tokens.findLast(
    (token) =>
      token.startsWith('fa-') &&
      !['fa', 'fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-brands'].includes(
        token
      )
  );
  return iconToken ? `${prefix} ${iconToken}` : fallback;
}

function conditionLabelFromId(id) {
  return String(id || '')
    .split('-')
    .filter(Boolean)
    .map((token) =>
      token.length <= 2 ? token.toUpperCase() : `${token.charAt(0).toUpperCase()}${token.slice(1)}`
    )
    .join(' ');
}

function defaultConditionIcon(kind, id) {
  return DEFAULT_CONDITION_ICONS[kind]?.[id] || FALLBACK_CONDITION_ICONS[kind] || 'fas fa-tag';
}

function normalizeConditionOption(kind, value) {
  const isRecord = value && typeof value === 'object';
  const id = normalizeConditionId(isRecord ? (value.id ?? value.value ?? value.label) : value);
  if (!id) return null;
  const rawLabel = isRecord ? String(value.label ?? '').trim() : String(value ?? '').trim();
  const fallbackIcon = defaultConditionIcon(kind, id);
  return {
    id,
    label: isRecord
      ? rawLabel || conditionLabelFromId(id)
      : /[A-Z]/.test(rawLabel)
        ? rawLabel
        : conditionLabelFromId(id),
    icon: normalizeConditionIcon(isRecord ? value.icon : fallbackIcon, fallbackIcon),
  };
}

function normalizeConditionOptions(kind, value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const options = [];
  const seen = new Set();
  for (const raw of values) {
    const option = normalizeConditionOption(kind, raw);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options;
}

function seedConditionOptions(kind, raw, defaults) {
  const values = normalizeConditionOptions(kind, raw);
  return values.length > 0 ? values : normalizeConditionOptions(kind, defaults);
}

function clampDropRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(100, Math.max(0, Math.floor(number)));
}

function stringOrFallback(value, fallback) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function plainObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return cloneJson(value);
}

/**
 * Reduce one reveal-key segment to a form Foundry cannot take apart. Reveals persist through
 * `setFlag`, which `expandObject`s every dotted key, so `actor:Actor.<id>:…` nested under
 * `reveals["actor:Actor"]` and no reader could find it.
 */
function revealKeySegment(value) {
  return String(value ?? '').replaceAll('.', '_');
}

function revealKey({ environmentId, taskId, scope, actor, userId }) {
  const env = revealKeySegment(environmentId);
  const task = revealKeySegment(taskId);
  if (scope === 'global') return `global:${env}:${task}`;
  if (scope === 'user') return `user:${revealKeySegment(userId || 'unknown')}:${env}:${task}`;
  return `actor:${revealKeySegment(actor?.uuid || actor?.id || 'unknown')}:${env}:${task}`;
}

/** Stable-sort records by an ordered id list; unlisted records keep library order after them. */
function sortRecordsByOrder(records, order) {
  const list = normalizeList(records);
  const orderIndex = new Map(normalizeList(order).map((id, index) => [String(id), index]));
  if (orderIndex.size === 0) return list;
  return list
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const ai = orderIndex.has(String(a.record?.id))
        ? orderIndex.get(String(a.record?.id))
        : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(String(b.record?.id))
        ? orderIndex.get(String(b.record?.id))
        : Number.MAX_SAFE_INTEGER;
      return ai === bi ? a.index - b.index : ai - bi;
    })
    .map((entry) => entry.record);
}

function positiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : Number(fallback || 1);
}
