import { evaluateEnvironmentMatch } from './gatheringMatch.js';
import { normalizeNodeConfig } from './gatheringNodeConfig.js';
import { GatheringNodeService } from './GatheringNodeService.js';
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
// System-wide drop-modifier application mode. This is a single global system
// setting (`dropModifierMode`) and cannot be overridden per modifier. Covers
// character modifiers AND condition modifiers (weather/time-of-day/biome).
const DROP_MODIFIER_MODES = new Set(['additive', 'multiplicative']);

/**
 * Resolve the effective additive/multiplicative drop-modifier mode from the
 * system-level setting alone, falling back to `'additive'` for any unknown
 * value. There is no per-reference/per-entry override.
 *
 * @param {string} [systemMode] The system-level `dropModifierMode`.
 * @returns {'additive'|'multiplicative'}
 */
function resolveDropModifierMode(systemMode) {
  return DROP_MODIFIER_MODES.has(systemMode) ? systemMode : 'additive';
}
// Legacy system-level limitation mode values, retained only for the read-time
// compat mapping in normalizeGatheringEconomy (legacy `mode` ⇒ stamina/nodes
// flags). The canonical state is the two independent booleans, not this enum.
const ECONOMY_MODES = new Set(['none', 'stamina', 'nodes']);
// System-level gathering resolution mode. `d100` is the only currently implemented
// resolution; `progressive`/`routed` are modelled but unimplemented (the manager
// shows them disabled). It is GM config, not part of the player listing payload.
const GATHERING_RESOLUTION_MODES = new Set(['d100', 'progressive', 'routed']);
// Stamina regeneration over world time.
const STAMINA_REGEN_POLICIES = new Set(['none', 'overTime']);
// Legacy stamina-regen policy mapped onto the unified `overTime` term. The 1.2.0
// migration rewrites this in persisted data, but normalizeGatheringEconomy applies
// the same mapping at read time so a world whose stamina data was never migrated
// keeps regenerating instead of silently coercing to `none` (which disables regen).
// NOTE: distinct from the pre-0.4.0 node-respawn `elapsedTime` legacy value — a
// different enum at a different path (see gatheringNodeConfig.js).
const LEGACY_STAMINA_REGEN_POLICY_MAP = Object.freeze({ elapsedTime: 'overTime' });
const STAMINA_REGEN_UNITS = new Set(['minutes', 'hours', 'days', 'weeks']);
const SECONDS_PER_UNIT = Object.freeze({ minutes: 60, hours: 3600, days: 86_400, weeks: 604_800 });
const ROLL_EXPRESSION_PATTERN = /\d\s*d\s*\d|[*/()]/i;
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
 * Owns rich-gathering runtime support: global conditions, reusable library
 * composition, system d100 rules, node counts, actor-scoped stamina, attempt
 * counters, and blind task reveal evidence. The service is intentionally small
 * and side-effect explicit so GatheringEngine can keep history-before-effects
 * ordering.
 */
export class GatheringRichStateService {
  /**
   * Construct the service with injected runtime seams. `evaluateExpression`
   * was added by the gathering character modifiers feature so d100 resolution
   * can evaluate character modifier expressions against the acting actor
   * without coupling the service to Foundry globals.
   *
   * @param {object} options
   * @param {object} [options.environmentStore] Gathering environment store.
   * @param {Function} [options.getSetting] Read accessor for gathering config.
   * @param {Function} [options.setSetting] Write accessor for gathering config.
   * @param {string} [options.settingKey] Config setting key.
   * @param {Function} [options.nowWorldTime] Current world-time getter.
   * @param {Function} [options.getUserId] Current Foundry user id getter.
   * @param {Function} [options.rollD100] D100 roller (test seam).
   * @param {object} [options.hooks] Foundry Hooks bridge.
   * @param {Function} [options.evaluateExpression] Async expression evaluator
   *   (signature matches `evaluateGatheringExpression`); used to resolve
   *   character modifier expressions to numeric contributions.
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
    // Interactable-scoped node seams (issue 302). These resolve + write the node
    // pool carried by a scene interactable's `fabricate.interactable` behaviour,
    // injected so the rich-state service never reaches for `game.scenes`. When
    // absent (the default), every node path falls back to the environment scope.
    resolveRegionBehavior = null,
    writeInteractableBehavior = null,
    // Extracted collaborators (issue 376). Default-constructed below from the
    // parent's already-assigned seams so `makeRichState()` and main.js keep
    // working unchanged. Injectable for focused tests.
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
    // Seam: seconds in one regen/respawn unit. The default reproduces the
    // hardcoded Earth-calendar table; main.js injects a calendar-aware provider
    // so `days`/`weeks` track the active Foundry world calendar (minutes/hours
    // are universal and always 60/3600).
    this.secondsPerUnit =
      typeof secondsPerUnit === 'function'
        ? secondsPerUnit
        : (unit) => SECONDS_PER_UNIT[unit] || SECONDS_PER_UNIT.hours;
    this.resolveRegionBehavior =
      typeof resolveRegionBehavior === 'function' ? resolveRegionBehavior : null;
    this.writeInteractableBehavior =
      typeof writeInteractableBehavior === 'function' ? writeInteractableBehavior : null;

    // Stamina + node subsystems were extracted (issue 376). They are wired from
    // the parent's OWN seams so there is a single economy/config/now/hook read
    // path (no drift, no duplicated normalize logic): the stamina service reads
    // the economy through `_systemEconomy`, the node service the config through
    // `_config`, and both fire hooks / resolve world-time through the parent's
    // `_callHook`/`_historyEvent`/`_now`. The parent retains its public economy
    // booleans and the d100/listing core, delegating stamina/node methods here.
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
    if (weather !== undefined) {
      const tag = normalizeConditionId(weather);
      if (!normalizeConditionIdList(config.vocabularies.weather).includes(tag)) {
        throw new Error(`Unknown gathering weather tag: ${weather}`);
      }
      nextConditions.weather = tag;
    }
    if (timeOfDay !== undefined) {
      const tag = normalizeConditionId(timeOfDay);
      if (!normalizeConditionIdList(config.vocabularies.timeOfDay).includes(tag)) {
        throw new Error(`Unknown gathering time-of-day tag: ${timeOfDay}`);
      }
      nextConditions.timeOfDay = tag;
    }

    const next = { ...config, conditions: nextConditions };
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
    const compositionMode = environment?.compositionMode === 'manual' ? 'manual' : 'automatic';
    const tasks = sortRecordsByOrder(
      normalizeList(libraries.tasks)
        .filter((task) => task?.enabled !== false)
        .filter(
          (task) =>
            this._recordMatchesEnvironment(task, environment, currentConditions, {
              includeDanger: false,
              conditionSettings: systemConditions,
            }) || this._recordIsForced(environment, task.id, 'task', compositionMode)
        )
        .filter((task) =>
          this._environmentIncludesLibraryRecord(environment, task.id, 'task', compositionMode)
        ),
      environment?.taskOrder
    ).map((task) => this._libraryTaskToRuntimeTask(task, environment));
    const events = sortRecordsByOrder(
      normalizeList(libraries.events)
        .filter((event) => event?.enabled !== false)
        .filter(
          (event) =>
            this._recordMatchesEnvironment(event, environment, currentConditions, {
              includeDanger: true,
              conditionSettings: systemConditions,
            }) || this._recordIsForced(environment, event.id, 'event', compositionMode)
        )
        .filter((event) =>
          this._environmentIncludesLibraryRecord(environment, event.id, 'event', compositionMode)
        ),
      environment?.eventOrder
    ).map((event) => applyEventDropRateAdjustment(normalizeEvent(event), environment));

    const libraryCharacterModifiers = new Map();
    for (const entry of normalizeList(libraries.characterModifiers)) {
      if (entry?.id) libraryCharacterModifiers.set(String(entry.id), cloneJson(entry));
    }

    // Tools are now system-owned: source the library from the crafting system
    // (`system.tools`, populated by CraftingSystemManager._normalizeSystem) — the
    // single canonical source the recipe gate, salvage, and the canvas browser all
    // read. The `system` argument is the normalized crafting system; fall back to a
    // live lookup via the global registry when a caller did not pass one. The
    // gathering-config `tools` copy is no longer the source (a reconciliation
    // migration moves any UI-authored tools onto the system).
    const toolSource =
      (Array.isArray(system?.tools) && system.tools) ||
      globalThis.game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId)?.tools ||
      [];
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
    Object.defineProperty(composed, '__libraryCharacterModifiers', {
      value: libraryCharacterModifiers,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(composed, '__libraryTools', {
      value: libraryTools,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(composed, '__systemId', {
      value: systemId,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    return composed;
  }

  /**
   * Resolve a d100 gathering attempt against the supplied task/environment.
   *
   * Now async because character modifier references invoke the injected
   * expression evaluator, which returns a promise. Returns
   * `{ status: 'misconfigured', diagnostics }` when any
   * reference or override cannot resolve so the caller short-circuits before
   * touching nodes, stamina, or attempt-limit state.
   *
   * @param {object} options
   * @param {object} options.task Task being resolved.
   * @param {object} options.environment Composed environment.
   * @param {object} [options.actor] Acting Foundry actor.
   * @param {object} [options.viewer] Active viewer payload.
   * @param {object} [options.system] Crafting system.
   * @param {number} [options.gatheringModifier] Fallback gathering modifier value.
   * @param {number} [options.eventModifier] Fallback event modifier value.
   * @returns {Promise<object>} Resolution payload (status, items, events,
   *   eventPolicy, characterModifierSnapshot, [diagnostics]).
   */
  async resolveD100Attempt({
    task,
    environment,
    actor = null,
    viewer = null,
    system = null,
    gatheringModifier = 0,
    eventModifier = 0,
    // Interactive DSN animation (opt-in). `animate` pre-rolls a single `Nd100`
    // Foundry Roll so Dice So Nice animates every percentile throw at once, then
    // draws the per-row/event faces from it (falling back to `this.rollD100()` if
    // the pool runs dry). `extraModifier` is a flat situational bonus added to
    // every throw. `rollMode`/`speaker`/`flavor` decorate the DSN chat post. All
    // default to the pre-existing silent behaviour (`animate` false → each throw
    // uses `this.rollD100()` unchanged, and nothing is posted to chat).
    animate = false,
    extraModifier = 0,
    rollMode,
    speaker,
    flavor,
  } = {}) {
    const flatBonus = Number.isFinite(extraModifier) ? extraModifier : 0;
    const itemRows = normalizeList(task?.dropRows ?? task?.itemDrops);
    const taskModifier = numericModifier(task?.gatheringModifier, gatheringModifier);
    const conditions = environment?.conditions || {};
    const library =
      environment?.__libraryCharacterModifiers instanceof Map
        ? environment.__libraryCharacterModifiers
        : new Map();

    // Resolve rules up front so the system-default character-modifier mode is
    // available while resolving each reference (the loops below predate the
    // later `rules` use at selection time, which now reuses this value).
    const rules = resolveRulesForAttempt(task, environment);
    const dropModifierMode = rules.dropModifierMode;

    const diagnostics = [];
    const enabledRows = itemRows
      .filter((row) => row?.enabled !== false)
      .map((row) => normalizeItemDrop(row));
    const enabledEvents = normalizeList(environment?.events)
      .filter((event) => event?.enabled !== false)
      .map((event) => normalizeEvent(event));

    const rowSnapshots = [];
    const rowContributions = [];
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
      rowContributions.push({
        row,
        contributions,
      });
    }

    const eventSnapshots = [];
    const eventContributions = [];
    for (const event of enabledEvents) {
      // Weather/time are runtime gates: an event that does not currently meet its
      // required weather/timeOfDay never triggers, even if it matched the
      // environment (region/biome/danger) at composition time.
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
      eventContributions.push({
        event,
        contributions,
      });
    }

    if (diagnostics.length > 0) {
      return {
        status: 'misconfigured',
        items: [],
        events: [],
        eventPolicy: null,
        characterModifierSnapshot: { rows: rowSnapshots, events: eventSnapshots },
        diagnostics,
      };
    }

    const biomes = Array.isArray(environment?.biomes) ? environment.biomes : [];
    const biomeAggregation = rules.biomeModifierAggregation;

    // Draw each percentile throw from a pre-rolled `Nd100` pool when animating, so
    // Dice So Nice shows the whole attempt at once; otherwise fall back to the
    // injected `this.rollD100()` seam (unchanged for the automated/timed path).
    const throwCount = rowContributions.length + eventContributions.length;
    let animationPool = null;
    let nextRoll = () => this.rollD100();
    if (animate && typeof globalThis.Roll === 'function' && throwCount > 0) {
      try {
        animationPool = await new globalThis.Roll(`${throwCount}d100`).evaluate({
          allowInteractive: false,
        });
        const faces = Array.isArray(animationPool?.dice?.[0]?.results)
          ? animationPool.dice[0].results
              .map((entry) => Number(entry?.result))
              .filter((face) => Number.isFinite(face))
          : [];
        let cursor = 0;
        nextRoll = () => (cursor < faces.length ? faces[cursor++] : this.rollD100());
      } catch (error) {
        console.error('Fabricate | Failed to pre-roll d100 animation pool:', error);
        animationPool = null;
        nextRoll = () => this.rollD100();
      }
    }

    const droppedItems = rowContributions
      .map((entry, index) =>
        rollDropRow({
          row: entry.row,
          index,
          roll: nextRoll(),
          modifier: taskModifier + flatBonus,
          conditions,
          biomes,
          biomeAggregation,
          dropModifierMode: rules.dropModifierMode,
          characterModifierContributions: entry.contributions,
        })
      )
      .filter((result) => result.dropped);
    const selectedItems = selectDrops(droppedItems, rules.rewardSelectionMode, rules.rewardLimit);

    const droppedEvents = eventContributions
      .map((entry, index) =>
        rollDropRow({
          row: entry.event,
          index,
          roll: nextRoll(),
          modifier: numericModifier(entry.event?.eventModifier, eventModifier) + flatBonus,
          conditions,
          biomes,
          biomeAggregation,
          dropModifierMode: rules.dropModifierMode,
          characterModifierContributions: entry.contributions,
        })
      )
      .filter((result) => result.dropped);
    const selectedEvents = selectDrops(droppedEvents, rules.eventSelectionMode, rules.eventLimit);
    const eventPolicy = rules.eventPolicy;

    // Surface the pooled roll to chat so Dice So Nice animates it. Interactive/
    // animate-only; a chat failure is logged and swallowed, never thrown.
    if (animationPool) {
      try {
        await animationPool.toMessage({ speaker, flavor }, { rollMode, create: true });
      } catch (error) {
        console.error('Fabricate | Failed to post d100 roll to chat:', error);
      }
    }

    return {
      status:
        selectedEvents.length > 0 && eventPolicy === 'failureWithEvent' ? 'failed' : 'succeeded',
      items: selectedItems,
      events: selectedEvents,
      eventPolicy,
      characterModifierSnapshot: { rows: rowSnapshots, events: eventSnapshots },
    };
  }

  /**
   * Build a no-dice preview of each drop row's chance for the player "What you
   * might find" inspector. Mirrors the per-row math in `resolveD100Attempt`
   * (condition + character modifiers) WITHOUT rolling, returning the base and
   * modifier-adjusted chance plus a recoverable breakdown (weather, time-of-day,
   * biome, and per-ability character contributions) so the UI can explain how
   * each contributor moves the chance.
   *
   * Async because character-ability modifiers resolve game-system expressions
   * against the actor. Unresolvable character modifiers are omitted from the
   * preview (no diagnostics surfaced to players).
   *
   * @param {object} options
   * @param {object} options.environment Composed environment (conditions/biomes/rules).
   * @param {object} options.task Composed/normalized task with `dropRows`.
   * @param {object} [options.actor] Selected actor for character modifiers.
   * @param {object} [options.viewer] Active viewer payload.
   * @param {object} [options.system] Crafting system.
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
      // Authoritative final chance comes from the shared mixer over ALL drop
      // modifiers (condition + character), so additive-then-multiplicative mixing
      // matches resolveD100Attempt/rollDropRow exactly. The per-kind display
      // payload below is purely for the breakdown UI and MUST NOT re-derive the
      // final number.
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
    // Aggregate "at least one find" chance from the modifier-adjusted per-drop
    // chances (NOT the base rates), so the success bar matches the drop rows.
    const missAll = drops.reduce(
      (product, drop) => product * (1 - Math.max(0, Math.min(1, Number(drop.finalChance) || 0))),
      1
    );
    return { ...empty, drops, successChance: 1 - missAll };
  }

  /**
   * The condition-adjusted "at least one find" success chance for a task — the
   * eager (sync, no-actor) counterpart to previewDropBreakdown's aggregate. It
   * applies the current weather/time-of-day/biome modifiers to each drop's base
   * rate so the listing's success bar reflects conditions (character-ability
   * modifiers are layered on later by the lazy inspector breakdown). Returns
   * `null` for non-d100 tasks or when there are no enabled drop rows.
   *
   * @param {object} task Composed/normalized task.
   * @param {object} environment Composed environment (conditions/biomes/rules).
   * @returns {number|null} A 0–1 fraction, or `null` when not applicable.
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
      // Same additive-then-multiplicative mixing as resolveD100Attempt so the
      // listing's success bar honors multiplicative condition modifiers too.
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
   * Resolve a single character modifier reference against the actor.
   *
   * Applies override-first inheritance (expression),
   * detects misconfiguration (missing entry, `min > max`, non-finite
   * resolution), invokes the injected evaluator, clamps by min/max, then
   * applies operator. The returned evidence is suitable for the per-row
   * snapshot.
   *
   * @param {object} payload Resolution payload.
   * @param {object} payload.reference Row-scoped reference shape.
   * @param {object|null} payload.libraryEntry Matching library modifier.
   * @param {object} payload.actor Acting actor.
   * @param {object} [payload.environment]
   * @param {object} [payload.task]
   * @param {object|null} [payload.row]
   * @param {object|null} [payload.event]
   * @param {object} [payload.viewer]
   * @param {object} [payload.system]
   * @param {string} [payload.dropModifierMode] Global system drop-modifier mode
   *   applied to every reference (no per-reference override).
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
    // The application mode is the single global system mode — there is no
    // per-reference override. The value is clamped and operator-signed
    // identically for both modes — only aggregation differs.
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

    // Structured entry carries everything aggregation needs to apply this
    // contribution either additively (signed delta) or multiplicatively
    // (factor `1 ± value/100`) without re-deriving the mode.
    const contributionEntry = {
      mode: effectiveMode,
      operator,
      value: clamped,
      contribution,
    };

    return { ok: true, contribution, contributionEntry, evidence };
  }

  /**
   * Resolve a character modifier's raw numeric value via the injected
   * expression evaluator. Returns `null` when no evaluator is wired or the
   * resolution throws — the caller maps that to a non-finite diagnostic.
   * Extracted from {@link _resolveCharacterModifierContribution} to keep that
   * method's branching shallow.
   *
   * @param {object} payload
   * @returns {Promise<*>} The raw resolved value, or `null`.
   */
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
            // Derived player-safe boolean: a depleted `nonRegenerating` pool is
            // exhausted for good. We surface only this flag, never the full
            // respawn block, to the player payload.
            permanentlyExhausted:
              Number(displayNode.current || 0) <= 0 &&
              displayNode.respawn?.policy === 'nonRegenerating',
            // Player-safe policy flag: drives count-bearing scarcity copy ("N of M
            // remaining — will not replenish") before exhaustion. Just the policy,
            // no extra counts leaked beyond the existing current/max.
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

  // Stamina public surface — delegated to GatheringStaminaService (issue 376).
  // Engine + main.js call these on the parent; the behaviour and persisted
  // shapes are unchanged.

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
   * Regenerate one actor's stamina as world time passes. Delegated to
   * GatheringStaminaService (issue 376); GatheringEngine calls this on the
   * parent.
   *
   * @param {object} payload
   * @returns {Promise<object|null>} The updated stamina entry, or null on no-op.
   */
  async regenerateActorStamina(payload = {}) {
    return this.staminaService.regenerateActorStamina(payload);
  }

  /**
   * Respawn finite resource nodes for one environment as world time passes.
   * The parent owns the `nodes.enabled` gate (the canonical economy read path
   * lives here); the per-node respawn arithmetic is delegated to
   * GatheringNodeService (issue 376). GatheringEngine calls this on the parent.
   *
   * @param {object} payload
   * @returns {Promise<object|null>} The updated environment, or null on no-op.
   */
  async respawnNodes({ environment, worldTime } = {}) {
    if (!environment) return null;
    if (!this.nodesEnabled(environment.craftingSystemId)) return null;
    return this.nodeService.respawnNodes({ environment, worldTime });
  }

  /**
   * Respawn one interactable-scoped node pool as world time passes (issue 302).
   * Delegated to GatheringNodeService (issue 376); GatheringEngine calls this on
   * the parent.
   *
   * @param {object} payload
   * @returns {Promise<{ changed: boolean, node: object }>}
   */
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

  /**
   * Count the distinct task ids an actor has revealed for one environment at a
   * given reveal scope. Delegates to
   * {@link GatheringRichStateService#listRevealedTaskIds} and returns its
   * length, so the count and the list share one read path and never drift. The
   * `party` scope has no dedicated key today and therefore collapses onto the
   * `actor:` key, matching the writer. Returns `0` on missing/inaccessible
   * state and never throws.
   *
   * @param {object} args
   * @param {object} args.actor Foundry actor holding the reveal flag state.
   * @param {string} args.environmentId Environment whose reveals are counted.
   * @param {string} [args.scope='actor'] Reveal scope (`actor`/`user`/`party`/`global`).
   * @returns {number} Count of distinct revealed task ids.
   */
  countRevealedTasks({ actor, environmentId, scope = 'actor' } = {}) {
    return this.listRevealedTaskIds({ actor, environmentId, scope }).length;
  }

  /**
   * List the distinct task ids the actor has revealed for an environment at the
   * given reveal scope. Shares the read path and `revealKey` prefix matching
   * with {@link GatheringRichStateService#countRevealedTasks} (which delegates
   * here) so the list and the count never drift from the `revealTask` writer.
   *
   * `party` collapses onto the `actor:` key (there is no party branch in
   * `revealKey`), matching how reveals are written.
   *
   * @param {object} args
   * @param {object} args.actor Foundry actor holding the reveal flag state.
   * @param {string} args.environmentId Environment whose reveals are listed.
   * @param {string} [args.scope='actor'] Reveal scope (`actor`/`user`/`party`/`global`).
   * @returns {string[]} Distinct revealed task ids; `[]` on missing/inaccessible state.
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
    // Build the scope-specific prefix once via revealKey (with a sentinel task
    // id) so the matching format always mirrors the writer's key format.
    const sentinel = ' ';
    const sampleKey = revealKey({
      environmentId: envId,
      taskId: sentinel,
      scope,
      actor,
      userId: this.getUserId(),
    });
    const prefix = sampleKey.slice(0, sampleKey.length - sentinel.length);
    const taskIds = new Set();
    for (const key of Object.keys(reveals)) {
      if (!key.startsWith(prefix)) continue;
      const taskId = key.slice(prefix.length);
      if (taskId) taskIds.add(taskId);
    }
    return [...taskIds];
  }

  /**
   * Resolve biome ids into display metadata so player chips render identically
   * to the GM editor. The per-system biome vocabulary wins, then the global
   * vocabulary, then {@link DEFAULT_BIOME_METADATA}. Reuses the shared
   * vocabulary-option normalizer so labels, icons, color tokens, and custom
   * colors match the manager surface.
   *
   * @param {Array<string>|string} biomeIds Biome ids to resolve.
   * @param {string} systemId Crafting system id for per-system vocabulary.
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
      // A `nonRegenerating` pool at 0 is permanently exhausted (it never
      // regrows and cannot be restocked), so surface a distinct reason.
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

  async commitAcceptedAttempt({
    actor,
    system,
    environment,
    task,
    outcome = null,
    viewer = null,
    interactableRef = null,
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
    if (nodesEnabled && depletionSource && shouldDepleteNode({ nodes: depletionSource }, outcome)) {
      // Persist the full node object (config + respawn timers) with one consumed,
      // so the resolved pool (env `nodeRuntime[taskId]` OR the interactable's own
      // scoped `node`) is seeded and decremented in a single write.
      const max = Number(depletionSource.max || 0);
      const current = Math.min(max, Math.max(0, Number(depletionSource.current || 0) - 1));
      const node = { ...cloneJson(depletionSource), current };
      // Seed the respawn anchor at depletion time so the FIRST world-time advance
      // past the interval produces a gain instead of only re-anchoring. Without
      // this, a freshly-seeded pool carries lastEvaluatedWorldTime: null and the
      // first tick is wasted on anchoring (mirrors stamina pool anchor seeding).
      if (node.respawn?.policy === 'overTime' && node.respawn.lastEvaluatedWorldTime == null) {
        node.respawn = {
          ...node.respawn,
          lastEvaluatedWorldTime: Number(this.nowWorldTime?.() ?? 0),
        };
      }
      await source.write(node);
      evidence.node = {
        taskId: task.id,
        consumed: 1,
        remaining: current,
        scope: source.kind,
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

  _environmentAllowsLibraryRecord(environment, id, kind) {
    const enabledKey = kind === 'event' ? 'enabledEventIds' : 'enabledTaskIds';
    const disabledKey = kind === 'event' ? 'disabledEventIds' : 'disabledTaskIds';
    const enabled = normalizeList(environment?.[enabledKey]).map(String);
    const disabled = normalizeList(environment?.[disabledKey]).map(String);
    if (disabled.includes(String(id))) return false;
    return enabled.length === 0 || enabled.includes(String(id));
  }

  /**
   * Whether a record is force-included into the environment. Forces are honored
   * only in manual mode (automatic ignores them, like the enabled allow-list);
   * a force-included record is composed even when it does not match the
   * environment context.
   */
  _recordIsForced(environment, id, kind, compositionMode = 'automatic') {
    if (compositionMode !== 'manual') return false;
    const forcedKey = kind === 'event' ? 'forcedEventIds' : 'forcedTaskIds';
    return normalizeList(environment?.[forcedKey]).map(String).includes(String(id));
  }

  /**
   * Whether a matching, library-enabled record is composed into the
   * environment, honoring `compositionMode`:
   * - `automatic`: include every matching record unless explicitly excluded
   *   (`disabled*Ids`). Any `enabled*Ids` allow-list is ignored — automatic
   *   means "all matching available unless excluded", so a stale list left
   *   over from manual mode never suppresses matching records.
   * - `manual`: include only when explicitly listed (`enabled*Ids`) or
   *   force-added (`forced*Ids`); stale disabled lists are ignored.
   */
  _environmentIncludesLibraryRecord(environment, id, kind, compositionMode = 'automatic') {
    const enabledKey = kind === 'event' ? 'enabledEventIds' : 'enabledTaskIds';
    const disabledKey = kind === 'event' ? 'disabledEventIds' : 'disabledTaskIds';
    const enabled = normalizeList(environment?.[enabledKey]).map(String);
    const disabled = normalizeList(environment?.[disabledKey]).map(String);
    if (compositionMode !== 'manual' && disabled.includes(String(id))) return false;
    if (compositionMode === 'manual') {
      const forced = normalizeList(
        environment?.[kind === 'event' ? 'forcedEventIds' : 'forcedTaskIds']
      ).map(String);
      return enabled.includes(String(id)) || forced.includes(String(id));
    }
    return true;
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
      resolutionMode: 'd100',
      itemSelectionMode: normalized.itemSelectionMode,
      dropRows: normalized.dropRows.map((row) =>
        applyDropRateAdjustment(row, rowAdjustments[row.id])
      ),
      staminaCost: normalized.staminaCost,
      staminaCostModifiers: Array.isArray(normalized.staminaCostModifiers)
        ? cloneJson(normalized.staminaCostModifiers)
        : [],
      gatheringModifier: normalized.gatheringModifier,
      resultGroups: [{ id: `${normalized.id}-d100`, name: normalized.name, results: [] }],
      resultSelection: { provider: 'd100Rows' },
      catalysts: [],
      toolIds: Array.isArray(normalized.toolIds) ? [...normalized.toolIds] : [],
    };
    if (normalized.timeRequirement)
      runtimeTask.timeRequirement = cloneJson(normalized.timeRequirement);
    // Resource nodes are per-environment: use this environment's stored runtime
    // pool if present, else seed a fresh full pool from the library config. The
    // seed is read-only here; it persists on first depletion.
    if (normalized.nodes) {
      const stored = environment?.nodeRuntime?.[normalized.id];
      // Library config is authoritative; the per-environment entry contributes
      // only runtime state (count + respawn anchor). A fresh pool starts full.
      runtimeTask.nodes = stored
        ? this.nodeService._mergeNodeConfigState(cloneJson(normalized.nodes), stored)
        : { ...cloneJson(normalized.nodes), current: Number(normalized.nodes.max || 0) };
    }
    return runtimeTask;
  }

  /**
   * Remove all per-system gathering library state for `systemId` from the
   * persisted gathering config. Operates on the raw setting (no normalization)
   * so unrelated systems are left untouched.
   *
   * @param {string} systemId
   * @returns {Promise<boolean>} true when an entry was removed
   */
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

  /**
   * Persist a crafting system's gathering economy block (the two independent
   * limitation flags — stamina + resource nodes — plus stamina regen) into the
   * raw config, merging beside the system's other library state.
   *
   * @param {{systemId: string, economy: object}} payload
   * @returns {Promise<object|null>} The normalized economy block, or null.
   */
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

  /**
   * The normalized economy block for a crafting system (two limitation flags +
   * stamina regen). Always returns a fully-defaulted block so callers never
   * branch on absence.
   *
   * @param {string} systemId Crafting system id.
   * @returns {{stamina: {enabled: boolean, regen: object}, nodes: {enabled: boolean}}}
   */
  _systemEconomy(systemId) {
    const economy = this._config().systems?.[String(systemId || '')]?.economy;
    // Normalize on read so persisted-but-not-yet-migrated worlds (legacy `mode`)
    // resolve to the two flags via the read-time compat mapping.
    return economy ? normalizeGatheringEconomy(economy) : normalizeGatheringEconomy(null);
  }

  /**
   * Whether the per-actor stamina limitation is enabled for a crafting system.
   *
   * @param {string} systemId Crafting system id.
   * @returns {boolean}
   */
  staminaEnabled(systemId) {
    return this._systemEconomy(systemId).stamina?.enabled === true;
  }

  /**
   * Whether the finite resource-node limitation is enabled for a crafting
   * system.
   *
   * @param {string} systemId Crafting system id.
   * @returns {boolean}
   */
  nodesEnabled(systemId) {
    return this._systemEconomy(systemId).nodes?.enabled === true;
  }

  /**
   * Whether the weather condition dimension is enabled for a crafting system.
   * Drives both gathering match gating (via the per-system condition settings)
   * and the player header bar's weather chip visibility.
   *
   * @param {string} systemId Crafting system id.
   * @returns {boolean}
   */
  weatherEnabled(systemId) {
    return resolveSystemConditionSettings(this._config(), systemId)?.weather?.enabled !== false;
  }

  /**
   * Whether the time-of-day condition dimension is enabled for a crafting system.
   *
   * @param {string} systemId Crafting system id.
   * @returns {boolean}
   */
  timeOfDayEnabled(systemId) {
    return resolveSystemConditionSettings(this._config(), systemId)?.timeOfDay?.enabled !== false;
  }

  /**
   * Thin derived back-compat accessor for a system's limitation "mode". The two
   * independent flags are the canonical state; this collapses them to a single
   * string for any external/API consumer. Returns `'both'` when both flags are
   * on (a value the old enum never had), `'stamina'` / `'nodes'` when only one
   * is, and `'none'` when neither is. No internal caller relies on it.
   *
   * @param {string} systemId Crafting system id.
   * @returns {'both'|'stamina'|'nodes'|'none'}
   */
  economyMode(systemId) {
    const stamina = this.staminaEnabled(systemId);
    const nodes = this.nodesEnabled(systemId);
    if (stamina && nodes) return 'both';
    if (stamina) return 'stamina';
    if (nodes) return 'nodes';
    return 'none';
  }

  /**
   * Public accessor for a system's normalized economy block.
   *
   * @param {string} systemId Crafting system id.
   * @returns {{stamina: {enabled: boolean, regen: object}, nodes: {enabled: boolean}}}
   */
  systemEconomy(systemId) {
    return cloneJson(this._systemEconomy(systemId));
  }

  /**
   * Resolve the character-modifier library for an attempt: prefer the
   * per-environment map populated at composition time, falling back to the
   * crafting system's library (needed for stamina regen, which has no
   * environment context).
   *
   * @param {object} payload
   * @returns {Map<string, object>}
   */
  _modifierLibrary({ environment = null, systemId = null } = {}) {
    if (
      environment?.__libraryCharacterModifiers instanceof Map &&
      environment.__libraryCharacterModifiers.size > 0
    ) {
      return environment.__libraryCharacterModifiers;
    }
    const entries =
      this._config().systems?.[String(systemId || environment?.craftingSystemId || '')]
        ?.characterModifiers || [];
    return new Map(entries.map((entry) => [String(entry.id), entry]));
  }

  /**
   * Resolve a task's stamina cost for one actor: the base `task.staminaCost`
   * adjusted by the task's `staminaCostModifiers` (resolved against the
   * per-environment character modifier library, the same path drop chances
   * use). Floored at 0 so a strong character can make a task free. Used by both
   * the start gate and the spend so they always agree.
   *
   * @param {object} payload
   * @returns {Promise<number>} Non-negative integer stamina cost.
   */
  async _effectiveStaminaCost({ actor, system, environment, task, viewer = null } = {}) {
    const base = Number(task?.staminaCost || 0);
    if (base <= 0) return 0;
    const references = normalizeList(task?.staminaCostModifiers);
    if (references.length === 0) return Math.max(0, Math.round(base));
    const library = this._modifierLibrary({
      environment,
      systemId: system?.id || environment?.craftingSystemId,
    });
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
        // Stamina-cost adjustments stay additive regardless of the system drop
        // mode: a force-additive resolution sums signed deltas onto the base.
        dropModifierMode: 'additive',
      });
      if (resolved.ok) total += Number(resolved.evidence.contribution || 0);
    }
    return Math.max(0, Math.round(total));
  }

  /**
   * The effective per-actor stamina cost to surface in a player listing, or
   * `null` when there is nothing to refine (the system does not have stamina
   * enabled, or the task has no base cost). The synchronous listing build shows the base
   * cost; callers use this to replace it with the modifier-adjusted value for
   * the viewing character.
   *
   * @param {object} payload
   * @returns {Promise<number|null>}
   */
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

function shouldDepleteNode(task, outcome) {
  if (!task?.nodes) return false;
  if (task.nodes.depletionTiming === 'onSuccess') return outcome?.status === 'succeeded';
  return true;
}

/**
 * Normalize a per-system gathering economy block. Two independent boolean
 * flags select the limitation models: `stamina.enabled` (per-actor stamina
 * pools) and `nodes.enabled` (finite resource nodes). Both can be on at once
 * (the anti-dogpiling combination); neither on means no limit. Stamina regen is
 * system-level: `amount` is a single expression (a plain number or a formula
 * with character references) evaluated per actor and applied once per `unit` of
 * elapsed world time when `policy === 'overTime'`.
 *
 * Read-time legacy compat: when neither new flag KEY is present but a legacy
 * `mode` string is, it is mapped to the flags (`stamina` ⇒ stamina.enabled,
 * `nodes` ⇒ nodes.enabled, else both false). Present flags always win over a
 * stale `mode`, so a stale `mode` can never resurrect a disabled limitation.
 *
 * `resolutionMode` is the system-level gathering resolution (default `d100`, the
 * only currently honored value). It is GM config and is NOT part of the player
 * gathering listing payload.
 *
 * @param {object} raw Raw economy block.
 * @returns {{resolutionMode: string, stamina: {enabled: boolean, regen: object}, nodes: {enabled: boolean}}}
 */
function normalizeGatheringEconomy(raw = {}) {
  const regen = raw?.stamina?.regen || {};
  // "New flags present" means the KEY exists (not merely truthy). Only when
  // neither key exists do we fall back to mapping a legacy `mode`.
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
      // Expression templates (number or formula, e.g. "40" or "4 * @abilities.con.mod"),
      // rolled once per character at seed time. `start` blank ⇒ start full at max.
      max: stringOrFallback(raw?.stamina?.max, ''),
      start: stringOrFallback(raw?.stamina?.start, ''),
      regen: {
        policy: STAMINA_REGEN_POLICIES.has(regen.policy)
          ? regen.policy
          : (LEGACY_STAMINA_REGEN_POLICY_MAP[regen.policy] ?? 'none'),
        unit: STAMINA_REGEN_UNITS.has(regen.unit) ? regen.unit : 'hours',
        // A single expression: a plain number ("1") or a formula with character
        // references ("1 + @abilities.con.mod"), evaluated per actor in-game.
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
    biomes: seedVocabulary(raw?.vocabularies?.biomes, DEFAULT_VOCABULARIES.biomes),
    danger: seedVocabulary(raw?.vocabularies?.danger, DEFAULT_VOCABULARIES.danger),
    weather: seedVocabulary(raw?.vocabularies?.weather, DEFAULT_VOCABULARIES.weather),
    timeOfDay: seedVocabulary(raw?.vocabularies?.timeOfDay, DEFAULT_VOCABULARIES.timeOfDay),
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
      characterModifiers: normalizeList(config?.characterModifiers)
        .map((entry) => normalizeCharacterModifierLibraryEntry(entry))
        .filter(Boolean),
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

function conditionSettingsToCurrent(settings) {
  return {
    weather: settings?.weather?.current || DEFAULT_CONDITIONS.weather,
    timeOfDay: settings?.timeOfDay?.current || DEFAULT_CONDITIONS.timeOfDay,
  };
}

function normalizeLibraryTask(task = {}) {
  return {
    id: stringOrFallback(task.id, `task-${normalizeTag(task.name) || 'gather'}`),
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
    dropRows: normalizeList(task.dropRows ?? task.itemDrops).map(normalizeItemDrop),
    staminaCost: nonNegativeNumber(task.staminaCost, 0),
    staminaCostModifiers: normalizeCharacterModifierReferenceList(task.staminaCostModifiers),
    gatheringModifier: normalizeModifierProvider(task.gatheringModifier ?? task.modifier),
    timeRequirement: plainObjectOrNull(task.timeRequirement),
    toolIds: Array.isArray(task.toolIds)
      ? task.toolIds.map((id) => String(id ?? '').trim()).filter(Boolean)
      : [],
    nodes: normalizeNodeConfig(task.nodes),
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

/**
 * Normalize a per-system character modifier library entry. Returns null when
 * the entry lacks a resolvable id or an expression (an entry that cannot
 * resolve to a number is dropped).
 *
 * @param {object} entry Raw library entry.
 * @returns {object|null} Normalized entry or null when invalid.
 */
function normalizeCharacterModifierLibraryEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const id = stringOrFallback(entry.id, '');
  if (!id) return null;
  const expression = stringOrFallback(entry.expression, '');
  if (!expression) return null;
  return {
    id,
    label: stringOrFallback(entry.label, id),
    icon: stringOrFallback(entry.icon, 'fa-solid fa-user'),
    expression,
    isRollExpression: ROLL_EXPRESSION_PATTERN.test(expression || ''),
  };
}

/**
 * Normalize drop-row character modifier references.
 *
 * @param {Array} refs Raw reference list.
 * @returns {Array<object>} Normalized references.
 */
export function normalizeDropCharacterModifiers(refs) {
  return normalizeCharacterModifierReferenceList(refs);
}

/**
 * Normalize event-row character modifier references.
 *
 * @param {Array} refs Raw reference list.
 * @returns {Array<object>} Normalized references.
 */
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
 * Aggregate resolved drop-modifier contributions (character AND condition
 * modifiers: weather/time-of-day/biome) onto a base drop rate.
 *
 * Deterministic mixing order: sum every entry's additive percentage-point delta
 * onto `baseRate` FIRST, then multiply by the PRODUCT of all multiplicative
 * factors, then clamp to [0, 100] and `Math.round` exactly once. A
 * multiplicative factor is `1 - value/100` for `-` and `1 + value/100` for `+`,
 * floored at 0 so an over-100 `-` reduction never flips the rate negative.
 * Additive-only inputs leave `multiplicativeFactor === 1`, so the rounding is an
 * identity and the result is byte-identical to the pre-feature flat sum
 * (`base + conditionAdditive + charAdditive`).
 *
 * Entries are structured payloads `{ mode, operator, value, contribution }`; a
 * legacy plain-number entry is treated as an additive delta for safety.
 *
 * @param {number} baseRate Row/event base drop rate (already a percentage).
 * @param {Array<object|number>} entries Resolved contribution entries (character
 *   + condition), each carrying its own resolved `mode`.
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

/**
 * Build a structured aggregation entry for a single condition modifier. The
 * global system `dropModifierMode` selects additive vs multiplicative for every
 * modifier; the shape matches the character `contributionEntry` so both feed the
 * same {@link applyDropModifierContributions} mixer.
 *
 * @param {object} modifier Normalized condition modifier (`operator`/`value`).
 * @param {string} dropModifierMode System-level drop-modifier mode.
 * @returns {{mode:'additive'|'multiplicative',operator:string,value:number,contribution:number}}
 */
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
 * Resolve the active condition modifiers (weather + time-of-day + biome) into a
 * flat list of structured aggregation entries, each carrying its own resolved
 * additive/multiplicative mode. Weather/time-of-day match by `conditionId`
 * against the current condition; biome entries are collapsed per-mode by
 * {@link matchingBiomeModifierEntries}.
 *
 * @param {object} modifiers Row/event `conditionModifiers` ({timeOfDay,weather,biome}).
 * @param {object} conditions Current environment conditions.
 * @param {Array<string>} biomes Active biome tags.
 * @param {string} biomeAggregation Biome aggregation policy.
 * @param {string} dropModifierMode System default mode.
 * @returns {Array<object>} Structured entries.
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
  // Evidence parity: `conditionModifier` reports the signed ADDITIVE condition
  // delta only (the field's historical meaning), so additive-only configs keep
  // emitting exactly the same number as before the multiplicative split.
  const conditionModifier = conditionEntries
    .filter((entry) => entry.mode !== 'multiplicative')
    .reduce((sum, entry) => sum + (Number(entry.contribution) || 0), 0);
  // Character-only additive total / multiplicative product, kept as their own
  // evidence fields so existing assertions about character contributions hold.
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

// Display split for a single condition kind ('weather'|'timeOfDay') under the
// current conditions — used by previewDropBreakdown so the player UI can show
// the additive percentage-point delta and the multiplicative factor (product of
// the matching `1 ± value/100` factors, `1` when none) separately. The
// authoritative final chance is computed elsewhere from the structured entries.
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

// Display split for biome modifiers: the additive delta (signed, per
// aggregation) and the single multiplicative factor derived from the aggregated
// signed percent. Mirrors matchingBiomeModifierEntries so the breakdown matches
// the rolled result.
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
 * Collapse the active biome modifiers into at most two structured aggregation
 * entries — one additive, one multiplicative — selected by the global system
 * `dropModifierMode` (every biome modifier shares that mode).
 *
 * The additive and multiplicative subsets are aggregated INDEPENDENTLY by the
 * existing {@link aggregateBiomeModifierValues} over their signed values. The
 * additive subset preserves today's exact behavior for every aggregation. The
 * multiplicative subset is aggregated in SIGNED-PERCENT space (not as a product
 * of factors) so cumulative/strongestOfEach/dominant stay consistent with the
 * additive intuition and yield one deterministic biome factor; that single
 * signed percent is then turned into one `± value` multiplicative entry.
 *
 * @param {Array} biomeModifiers Normalized biome condition-modifier list.
 * @param {Array<string>} biomes Active biome tags.
 * @param {string} aggregation Biome aggregation policy.
 * @param {string} dropModifierMode System default mode.
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
    // `dropModifierMode` is the generalized system default (character + condition
    // modifiers). Read the new key first, then fall back to the legacy
    // `characterModifierMode` (issue 324 was never released, so this is a
    // read-time compat shim, not a migration), then the default. Never emit the
    // legacy key.
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

function seedVocabulary(raw, defaults) {
  const values = normalizeTagList(raw);
  return values.length > 0 ? values : [...defaults];
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
  // Bare strings get a generated capitalised label; using the raw string as
  // the label would render an unwanted lowercase chip. Records keep their
  // explicit label when present.
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

function normalizeTagList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(normalizeTag).filter(Boolean))];
}

function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeConditionIdList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(normalizeConditionId).filter(Boolean))];
}

function normalizeConditionId(value) {
  if (value && typeof value === 'object') {
    return normalizeConditionId(value.id ?? value.value ?? value.label);
  }
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-');
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

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function plainObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return cloneJson(value);
}

function revealKey({ environmentId, taskId, scope, actor, userId }) {
  if (scope === 'global') return `global:${environmentId}:${taskId}`;
  if (scope === 'user') return `user:${userId || 'unknown'}:${environmentId}:${taskId}`;
  return `actor:${actor?.uuid || actor?.id || 'unknown'}:${environmentId}:${taskId}`;
}

/**
 * Stable-sort records by an explicit order of ids. Records absent from the
 * order array keep their original (library) order after the listed ones.
 */
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
