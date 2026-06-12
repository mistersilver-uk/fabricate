import { evaluateEnvironmentMatch } from './gatheringMatch.js';
import { normalizeNodeConfig } from './gatheringNodeConfig.js';
import { respawnNodeOnce } from './nodeRespawnMath.js';

const FLAG_NAMESPACE = 'fabricate';
const STATE_FLAG_KEY = 'gatheringState';
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
const CHARACTER_MODIFIER_PROVIDERS = new Set(['dnd5e', 'pf2e', 'macro']);
const CHARACTER_MODIFIER_OPERATORS = new Set(['+', '-']);
// Legacy system-level limitation mode values, retained only for the read-time
// compat mapping in normalizeGatheringEconomy (legacy `mode` ⇒ stamina/nodes
// flags). The canonical state is the two independent booleans, not this enum.
const ECONOMY_MODES = new Set(['none', 'stamina', 'nodes']);
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
});

const BLOCKED_REASON_KEYS = Object.freeze({
  NODE_DEPLETED: 'FABRICATE.Gathering.Blocked.NodeDepleted',
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
   * and `runMacro` were added by the gathering character modifiers feature so
   * d100 resolution can evaluate provider expressions and macro UUIDs against
   * the acting actor without coupling the service to Foundry globals.
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
   * @param {Function} [options.evaluateExpression] Async provider-expression
   *   evaluator (signature matches `evaluateGatheringExpression`); used to
   *   resolve character modifier expressions to numeric contributions.
   * @param {Function} [options.runMacro] Async macro runner for the `macro`
   *   character modifier provider; receives a context payload and returns a
   *   finite number.
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
    runMacro = null,
    secondsPerUnit = null,
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
    this.runMacro = runMacro;
    // Seam: seconds in one regen/respawn unit. The default reproduces the
    // hardcoded Earth-calendar table; main.js injects a calendar-aware provider
    // so `days`/`weeks` track the active Foundry world calendar (minutes/hours
    // are universal and always 60/3600).
    this.secondsPerUnit =
      typeof secondsPerUnit === 'function'
        ? secondsPerUnit
        : (unit) => SECONDS_PER_UNIT[unit] || SECONDS_PER_UNIT.hours;
  }

  /**
   * Convert a count of whole world-time units into seconds via the
   * `secondsPerUnit` seam, so day/week interval lengths follow the active
   * calendar (`days`/`weeks` track the active world calendar; `minutes`/`hours`
   * are fixed). Uses the injected `secondsPerUnit` seam.
   *
   * @param {number} count
   * @param {string} unit One of minutes|hours|days|weeks.
   * @returns {number} Non-negative seconds.
   */
  _durationToSeconds(count, unit) {
    const seconds = Number(this.secondsPerUnit(unit));
    const safe = seconds > 0 ? seconds : SECONDS_PER_UNIT.hours;
    return Math.max(0, Number(count || 0) * safe);
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
   * expression evaluator and (optional) macro runner, both of which return
   * promises. Returns `{ status: 'misconfigured', diagnostics }` when any
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
  } = {}) {
    const itemRows = normalizeList(task?.dropRows ?? task?.itemDrops);
    const taskModifier = numericModifier(task?.gatheringModifier, gatheringModifier);
    const conditions = environment?.conditions || {};
    const library =
      environment?.__libraryCharacterModifiers instanceof Map
        ? environment.__libraryCharacterModifiers
        : new Map();

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
        });
        if (!resolved.ok) {
          diagnostics.push(resolved.diagnostic);
          continue;
        }
        contributions.push(resolved.contribution);
        rowEvidence.push(resolved.evidence);
      }
      rowSnapshots.push({ rowId: row.id, contributions: rowEvidence });
      rowContributions.push({
        row,
        contributions,
        characterModifierTotal: contributions.reduce((sum, value) => sum + value, 0),
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
        });
        if (!resolved.ok) {
          diagnostics.push(resolved.diagnostic);
          continue;
        }
        contributions.push(resolved.contribution);
        eventEvidence.push(resolved.evidence);
      }
      eventSnapshots.push({ eventId: event.id, contributions: eventEvidence });
      eventContributions.push({
        event,
        contributions,
        characterModifierTotal: contributions.reduce((sum, value) => sum + value, 0),
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

    const rules = resolveRulesForAttempt(task, environment);
    const biomes = Array.isArray(environment?.biomes) ? environment.biomes : [];
    const biomeAggregation = rules.biomeModifierAggregation;

    const droppedItems = rowContributions
      .map((entry, index) =>
        rollDropRow({
          row: entry.row,
          index,
          roll: this.rollD100(),
          modifier: taskModifier,
          conditions,
          biomes,
          biomeAggregation,
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
          roll: this.rollD100(),
          modifier: numericModifier(entry.event?.eventModifier, eventModifier),
          conditions,
          biomes,
          biomeAggregation,
          characterModifierContributions: entry.contributions,
        })
      )
      .filter((result) => result.dropped);
    const selectedEvents = selectDrops(droppedEvents, rules.eventSelectionMode, rules.eventLimit);
    const eventPolicy = rules.eventPolicy;

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
   * (and optionally macros) against the actor. Unresolvable character modifiers
   * are omitted from the preview (no diagnostics surfaced to players).
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

    const drops = [];
    for (const row of rows) {
      const character = [];
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
        });
        if (resolved.ok) {
          character.push({
            label: resolved.evidence.label,
            icon: resolved.evidence.icon,
            contribution: resolved.evidence.contribution,
          });
        }
      }
      const characterTotal = character.reduce(
        (sum, entry) => sum + Number(entry.contribution || 0),
        0
      );
      const weather = conditionModifierForKind(row.conditionModifiers, 'weather', conditions);
      const timeOfDay = conditionModifierForKind(row.conditionModifiers, 'timeOfDay', conditions);
      const biome = matchingBiomeModifier(row.conditionModifiers?.biome, biomes, biomeAggregation);
      const base = clampDropRate(row.dropRate);
      const finalRate = Math.min(
        100,
        Math.max(0, base + weather + timeOfDay + biome + characterTotal)
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
          weather: { conditionId: normalizeConditionId(conditions?.weather), value: weather },
          timeOfDay: { conditionId: normalizeConditionId(conditions?.timeOfDay), value: timeOfDay },
          biome: { value: biome },
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
    const biomeAggregation = resolveRulesForAttempt(task, environment).biomeModifierAggregation;
    const missAll = rows.reduce((product, row) => {
      const base = clampDropRate(row.dropRate);
      const weather = conditionModifierForKind(row.conditionModifiers, 'weather', conditions);
      const timeOfDay = conditionModifierForKind(row.conditionModifiers, 'timeOfDay', conditions);
      const biome = matchingBiomeModifier(row.conditionModifiers?.biome, biomes, biomeAggregation);
      const finalRate = Math.min(100, Math.max(0, base + weather + timeOfDay + biome));
      return product * (1 - finalRate / 100);
    }, 1);
    return 1 - missAll;
  }

  /**
   * Resolve a single character modifier reference against the actor.
   *
   * Applies override-first inheritance (provider, expression, macroUuid),
   * detects misconfiguration (missing entry, macro override without uuid,
   * `min > max`, non-finite resolution), invokes the injected evaluator or
   * macro runner, clamps by min/max, then applies operator. The returned
   * evidence is suitable for the per-row snapshot.
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
   * @returns {Promise<{ok: boolean, contribution: number, evidence: object, diagnostic?: object}>}
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
  }) {
    const referenceId = stringOrFallback(reference?.id, '');
    const modifierId = stringOrFallback(reference?.modifierId, '');
    const operator = CHARACTER_MODIFIER_OPERATORS.has(reference?.operator)
      ? reference.operator
      : '+';
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

    const effectiveProvider = libraryEntry?.provider || null;
    const effectiveExpression = expressionOverride || libraryEntry?.expression || '';
    const effectiveMacroUuid = libraryEntry?.macroUuid || '';

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

    const conditions = environment?.conditions || {};
    let rawValue = null;
    try {
      if (effectiveProvider === 'macro') {
        if (typeof this.runMacro === 'function') {
          rawValue = await this.runMacro(effectiveMacroUuid, {
            kind: 'characterModifier',
            actor,
            environment,
            task,
            row,
            event,
            conditions,
            modifier: { id: modifierId, label: libraryEntry?.label || modifierId },
            viewer,
            system,
          });
        }
      } else if (typeof this.evaluateExpression === 'function') {
        rawValue = await this.evaluateExpression({
          expression: effectiveExpression,
          provider: effectiveProvider,
          actor,
          kind: 'characterModifier',
          environment,
          task,
          row,
          event,
          viewer,
          system,
          modifier: { id: modifierId, label: libraryEntry?.label || modifierId },
        });
      }
    } catch {
      rawValue = null;
    }

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
      effectiveProvider: effectiveProvider || '',
      effectiveExpression: effectiveExpression || '',
      effectiveMacroUuid: effectiveMacroUuid || '',
      rawValue: numeric,
      clampedValue: clamped,
      operator,
      contribution,
      bounds: { min, max },
    };

    return { ok: true, contribution, evidence };
  }

  inspectEnvironment(environmentId) {
    const environment = this.environmentStore?.get?.(environmentId);
    return environment ? cloneJson(environment) : null;
  }

  buildListingMetadata({ environment, task, actor, viewer }) {
    const opaqueBlind = environment?.selectionMode === 'blind' && viewer?.isGM !== true;
    const staminaEnabled = this.staminaEnabled(environment?.craftingSystemId);
    const nodesEnabled = this.nodesEnabled(environment?.craftingSystemId);
    const displayNode = task?.nodes ?? null;
    const showNodeCounts =
      displayNode?.showCountsToPlayers === true || viewer?.isGM === true || !opaqueBlind;
    const nodes =
      nodesEnabled && displayNode
        ? {
            enabled: true,
            available: Number(displayNode.current || 0) > 0,
            depleted: Number(displayNode.current || 0) <= 0,
            current: showNodeCounts ? Number(displayNode.current || 0) : null,
            max: showNodeCounts ? Number(displayNode.max || 0) : null,
          }
        : null;
    const stamina =
      staminaEnabled && Number(task?.staminaCost || 0) > 0
        ? {
            cost: Number(task.staminaCost || 0),
            state: this.getActorStamina(actor, environment?.craftingSystemId),
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

  getActorStamina(actor, systemId = null) {
    const state = readState(actor);
    const key = systemId || 'default';
    const stamina = state.stamina?.[key] || {};
    // Pools are materialized per character at seed time (the system max/start
    // expressions are rolled once into numbers), so this stays synchronous and
    // simply reads the stored values. A character with no pool reads `null`.
    // `max` is the rolled value; an optional GM `maxOverride` layers over it.
    const rolledMax = numberOrNullStrict(stamina.max);
    const maxOverride = numberOrNullStrict(stamina.maxOverride);
    const max = maxOverride == null ? rolledMax : maxOverride; // effective cap
    const storedCurrent = numberOrNullStrict(stamina.current);
    const current = storedCurrent == null ? (max == null ? null : max) : storedCurrent;
    return {
      current,
      max,
      rolledMax,
      maxOverride,
      provider: stamina.provider || 'fabricate',
      regenerationMode: stamina.regenerationMode || 'manual',
    };
  }

  /**
   * Materialize a character's stamina pool from the system `max`/`start`
   * expression templates, rolling them once and persisting the resulting
   * numbers. Idempotent: a character that already has a pool keeps it unless
   * `force` is set (the GM Roll/Reset path). No-ops when stamina is disabled or
   * when the max template is blank/non-finite (⇒ no pool, stamina unenforced).
   *
   * @param {object} payload
   * @returns {Promise<object|null>} The materialized pool, or null on no-op.
   */
  async seedActorStaminaIfNeeded({
    actor,
    systemId,
    system = null,
    environment = null,
    force = false,
  } = {}) {
    const key = systemId || 'default';
    const econ = this._systemEconomy(key);
    if (econ.stamina?.enabled !== true) return null;

    const state = readState(actor);
    const existing = state.stamina?.[key];
    if (!force && existing && numberOrNullStrict(existing.max) != null) {
      return cloneJson(existing);
    }

    const maxValue = await this._evaluateStaminaExpression({
      expression: econ.stamina?.max,
      actor,
      system,
      environment,
      kind: 'staminaMax',
    });
    if (maxValue == null) return null; // no max configured ⇒ leave unseeded (stamina unenforced)
    const max = Math.max(0, Math.round(maxValue));

    const startRaw = await this._evaluateStaminaExpression({
      expression: econ.stamina?.start,
      actor,
      system,
      environment,
      kind: 'staminaStart',
    });
    const start = startRaw == null ? max : Math.max(0, Math.round(startRaw)); // blank start ⇒ full

    const entry = {
      provider: 'fabricate',
      regenerationMode: econ.stamina?.regen?.policy === 'overTime' ? 'auto' : 'manual',
      current: Math.min(start, max),
      max,
      lastRegenWorldTime: this._now(),
    };
    state.stamina = { ...state.stamina, [key]: entry };
    state.history = [
      this._historyEvent('stamina.seed', { systemId: key, current: entry.current, max }),
      ...normalizeList(state.history),
    ].slice(0, 50);
    await writeState(actor, state);
    this._callHook('fabricate.gathering.staminaSeeded', {
      actor,
      systemId: key,
      stamina: cloneJson(entry),
    });
    return cloneJson(entry);
  }

  /**
   * Evaluate a stamina expression template against an actor, returning a finite
   * number or null when the template is blank/unresolvable. Reuses the same
   * Roll-backed `evaluateExpression` seam regen uses.
   */
  async _evaluateStaminaExpression({
    expression,
    actor,
    system = null,
    environment = null,
    kind = 'stamina',
  } = {}) {
    if (expression == null || expression === '') return null;
    const value =
      typeof this.evaluateExpression === 'function'
        ? await this.evaluateExpression({
            expression: String(expression),
            provider: null,
            actor,
            kind,
            system,
            environment,
          })
        : Number(expression);
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  async setActorStamina(
    actor,
    {
      systemId = 'default',
      current = null,
      max = null,
      maxOverride,
      provider = 'fabricate',
      regenerationMode = 'manual',
    } = {}
  ) {
    const state = readState(actor);
    const key = systemId || 'default';
    const previous = state.stamina?.[key] || {};
    const effectiveProvider = provider || previous.provider || 'fabricate';
    const priorMax = numberOrNullStrict(previous.max);
    const providedMax = numberOrNullStrict(max);
    // `max` is the rolled cap. When omitted, the prior rolled max is preserved
    // (the panel only edits current + override). When provided: Fabricate-owned
    // pools accept it freely; an external provider's maximum is read-only once
    // established, but an as-yet unset external pool may still be initialized.
    const rolledMax =
      providedMax != null && (effectiveProvider === 'fabricate' || priorMax == null)
        ? providedMax
        : priorMax;
    // `maxOverride`: undefined preserves the prior override; a finite number
    // sets it; null/'' clears it. The effective cap is the override, else rolled.
    const override =
      maxOverride === undefined
        ? numberOrNullStrict(previous.maxOverride)
        : maxOverride === null || maxOverride === ''
          ? null
          : nonNegativeNumber(maxOverride, 0);
    const effectiveMax = override == null ? rolledMax : override;
    let currentValue = nonNegativeNumber(current, previous.current ?? 0);
    if (Number.isFinite(Number(effectiveMax)))
      currentValue = Math.min(currentValue, Number(effectiveMax));
    const next = {
      provider: effectiveProvider,
      regenerationMode: regenerationMode || previous.regenerationMode || 'manual',
      current: currentValue,
      max: rolledMax,
      ...(override == null ? {} : { maxOverride: override }),
      // Preserve the regen anchor so a manual GM set does not reset the clock.
      ...(previous.lastRegenWorldTime === undefined
        ? {}
        : { lastRegenWorldTime: previous.lastRegenWorldTime }),
    };
    state.stamina = { ...state.stamina, [key]: next };
    state.history = [
      this._historyEvent('stamina.set', {
        systemId: key,
        current: next.current,
        max: next.max,
        maxOverride: override,
      }),
      ...normalizeList(state.history),
    ].slice(0, 50);
    await writeState(actor, state);
    this._callHook('fabricate.gathering.staminaAdjusted', {
      actor,
      systemId: key,
      stamina: cloneJson(next),
    });
    return cloneJson(next);
  }

  async adjustActorStamina(actor, { systemId = 'default', delta = 0 } = {}) {
    const key = systemId || 'default';
    const effective = this.getActorStamina(actor, key);
    const next = Math.max(0, Number(effective.current || 0) + Number(delta || 0));
    const clamped = effective.max === null ? next : Math.min(next, effective.max);
    const state = readState(actor);
    const previous = state.stamina?.[key] || {};
    // Preserve the stored max verbatim (null stays null) so the system default
    // max stays authoritative when no per-actor override exists.
    const previousOverride = numberOrNullStrict(previous.maxOverride);
    const entry = {
      provider: previous.provider || effective.provider || 'fabricate',
      regenerationMode: previous.regenerationMode || effective.regenerationMode || 'manual',
      current: clamped,
      max: numberOrNullStrict(previous.max),
      ...(previousOverride == null ? {} : { maxOverride: previousOverride }),
      ...(previous.lastRegenWorldTime === undefined
        ? {}
        : { lastRegenWorldTime: previous.lastRegenWorldTime }),
    };
    state.stamina = { ...state.stamina, [key]: entry };
    state.history = [
      this._historyEvent('stamina.adjust', {
        systemId: key,
        delta: Number(delta || 0),
        current: clamped,
      }),
      ...normalizeList(state.history),
    ].slice(0, 50);
    await writeState(actor, state);
    this._callHook('fabricate.gathering.staminaAdjusted', {
      actor,
      systemId: key,
      stamina: cloneJson(entry),
    });
    return cloneJson(entry);
  }

  async restockNode({ environmentId, taskId, current = null, max = null } = {}) {
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    const existing = this._currentNodeState(environment, taskId);
    if (!existing) return null;
    // A null/undefined max keeps the existing cap (don't let Number(null)→0 wipe it).
    const nextMax =
      max === null || max === undefined
        ? Number(existing.max || 0)
        : nonNegativeInteger(max, existing.max);
    const node = {
      ...existing,
      enabled: true,
      max: nextMax,
      current: Math.min(nonNegativeInteger(current, nextMax), nextMax),
    };
    const updated = await this._writeNodeState({ environmentId, taskId, node });
    this._callHook('fabricate.gathering.nodeRestocked', { environmentId, taskId, current, max });
    return updated;
  }

  /**
   * The current node object for a task in an environment: the per-environment
   * runtime pool if present, else a fresh full pool seeded from the library
   * task's node config. Null when the task has no node config.
   */
  _currentNodeState(environment, taskId) {
    const runtime = environment?.nodeRuntime?.[taskId];
    if (runtime) return runtime;
    const libraryTasks =
      this._config().systems?.[String(environment?.craftingSystemId || '')]?.tasks || [];
    const config = normalizeNodeConfig(
      normalizeList(libraryTasks).find((task) => task?.id === taskId)?.nodes
    );
    return config ? { ...config, current: config.max } : null;
  }

  /**
   * Persist a node object for a task into the per-environment `nodeRuntime` map
   * (reading the raw stored environment so a composed/runtime environment is
   * never written).
   */
  async _writeNodeState({ environmentId, taskId, node }) {
    const stored = this.environmentStore?.get?.(environmentId);
    if (!stored) return null;
    return this.environmentStore.update(environmentId, {
      nodeRuntime: { ...stored.nodeRuntime, [taskId]: node },
    });
  }

  /**
   * Regenerate one actor's stamina for a stamina-mode system as world time
   * passes. Adds the configured per-interval amount once for each whole
   * `regen.unit` elapsed since the last evaluation, clamps to the pool max, and
   * advances the persisted anchor by exactly the consumed intervals so the
   * fractional remainder accrues toward the next tick. No-ops when the system
   * does not have stamina enabled, regen is off, the pool has no max, or world time
   * has not advanced a full interval (re-anchoring on backwards jumps).
   *
   * @param {object} payload
   * @returns {Promise<object|null>} The updated stamina entry, or null on no-op.
   */
  async regenerateActorStamina({
    actor,
    systemId,
    system = null,
    environment = null,
    worldTime,
  } = {}) {
    const key = systemId || 'default';
    const econ = this._systemEconomy(key);
    if (econ.stamina?.enabled !== true) return null;
    const regen = econ.stamina?.regen || {};
    if (regen.policy !== 'overTime') return null;
    const interval = this._durationToSeconds(1, regen.unit);
    if (!(interval > 0)) return null;

    const state = readState(actor);
    const entry = state.stamina?.[key];
    if (!entry) return null; // regen only tops up materialized pools, never creates them
    // Effective cap: the GM override if set, else the rolled max.
    const max = numberOrNullStrict(entry.maxOverride) ?? numberOrNullStrict(entry.max);
    if (max == null) return null;
    const now = Number(worldTime);
    if (!Number.isFinite(now)) return null;
    const last = Number.isFinite(Number(entry.lastRegenWorldTime))
      ? Number(entry.lastRegenWorldTime)
      : now;

    // World time stood still or ran backwards: re-anchor, never regenerate.
    if (now <= last) {
      if (entry.lastRegenWorldTime !== now) {
        state.stamina = { ...state.stamina, [key]: { ...entry, lastRegenWorldTime: now } };
        await writeState(actor, state);
      }
      return null;
    }

    const intervals = Math.floor((now - last) / interval);
    if (intervals <= 0) return null; // keep the anchor so the remainder accrues

    const before = Number(entry.current || 0);
    const advancedAnchor = last + intervals * interval;
    if (before >= max) {
      state.stamina = { ...state.stamina, [key]: { ...entry, lastRegenWorldTime: advancedAnchor } };
      await writeState(actor, state);
      return null;
    }

    const perInterval = await this._regenAmountPerInterval({
      actor,
      systemId: key,
      system,
      environment,
      regen,
    });
    const nextCurrent = perInterval > 0 ? Math.min(max, before + perInterval * intervals) : before;
    const next = { ...entry, current: nextCurrent, lastRegenWorldTime: advancedAnchor };
    state.stamina = { ...state.stamina, [key]: next };
    state.history = [
      this._historyEvent('stamina.regen', {
        systemId: key,
        amount: nextCurrent - before,
        current: nextCurrent,
        max,
      }),
      ...normalizeList(state.history),
    ].slice(0, 50);
    await writeState(actor, state);
    this._callHook('fabricate.gathering.staminaRegenerated', {
      actor,
      systemId: key,
      amount: nextCurrent - before,
      stamina: cloneJson(next),
    });
    return cloneJson(next);
  }

  /**
   * Respawn finite resource nodes for one environment as world time passes
   * (systems with `nodes.enabled` only). For each task with an `overTime` respawn policy,
   * adds nodes per elapsed interval per the gain mode: `guaranteed` (+1),
   * `chance` (a persisted d100 roll per interval), or `expression` (roll
   * `amountExpression` per interval and add the rolled total), clamped to the
   * task max. Advances each task's `respawn.lastEvaluatedWorldTime` with the
   * consumed intervals (persisting `lastRoll`) so a same-tick refresh never
   * rerolls. Writes the environment once when any task changed.
   *
   * @param {object} payload
   * @returns {Promise<object|null>} The updated environment, or null on no-op.
   */
  async respawnNodes({ environment, worldTime } = {}) {
    if (!environment) return null;
    if (!this.nodesEnabled(environment.craftingSystemId)) return null;
    const now = Number(worldTime);
    if (!Number.isFinite(now)) return null;

    // Per-environment `nodeRuntime` holds only runtime STATE (the `current` count
    // and respawn timers); the respawn CONFIG is always sourced fresh from the
    // current library task. Otherwise a `nodeRuntime` entry seeded under an older
    // config (e.g. `manual` before the GM switched the task to `overTime`) would
    // freeze that stale config and never respawn — and an emptied pool never
    // re-depletes to pick up the new config. A sequential loop (not `.map`) so the
    // `expression` gain mode can await.
    let runtimeChanged = false;
    const nodeRuntime = { ...environment.nodeRuntime };
    // Resolve the library node configs once for this environment (not per node).
    const libNodes = this._libraryNodeConfigs(environment.craftingSystemId);
    for (const [taskId, node] of Object.entries(nodeRuntime)) {
      const effective = this._mergeNodeConfigState(libNodes.get(String(taskId)) || null, node);

      const result = await this._respawnNode(effective, {
        now,
        environment,
        environmentId: environment.id,
        taskId,
      });
      if (result.changed) {
        runtimeChanged = true;
        nodeRuntime[taskId] = result.node;
      }
    }

    if (!runtimeChanged) return null;
    return this.environmentStore.update(environment.id, { nodeRuntime });
  }

  /**
   * Index a system's library node configs by task id (`taskId → normalized
   * task.nodes`). Read once from the canonical config so respawn always reflects
   * the GM's current authoring rather than a per-environment snapshot, without
   * re-normalizing the whole config per node.
   *
   * @param {string} systemId
   * @returns {Map<string, object>}
   */
  _libraryNodeConfigs(systemId) {
    const tasks = this._config().systems?.[String(systemId || '')]?.tasks;
    const map = new Map();
    if (Array.isArray(tasks)) {
      for (const task of tasks) {
        if (task?.id && task?.nodes) map.set(String(task.id), task.nodes);
      }
    }
    return map;
  }

  /**
   * Merge a per-environment runtime node (`stored`) onto the current library node
   * CONFIG so respawn/listing always use the authoritative policy, gain mode,
   * interval, depletion timing, AND capacity (`max`) from the library task, while
   * preserving only the per-environment STATE: the `current` count (clamped to the
   * library `max`) and the respawn anchor/roll. `max` is config, not state — a
   * persisted snapshot (seeded on first depletion) must never shadow a later
   * library edit, or raising a task's node count would have no effect in
   * environments that had already gathered it. Falls back to `stored` when the
   * library task has no node config (e.g. the task was deleted).
   *
   * @param {object|null} libNode Authoritative library node config.
   * @param {object} stored The persisted per-environment node entry.
   * @returns {object}
   */
  _mergeNodeConfigState(libNode, stored) {
    if (!libNode) return stored;
    const storedRespawn = stored?.respawn || {};
    // Capacity is library config and authoritative — `...cloneJson(libNode)`
    // already supplies `max`, so we never read a stale `stored.max`.
    const max = Number(libNode.max);
    const storedCurrent = Number(stored?.current);
    const merged = {
      ...cloneJson(libNode),
      // STATE stays per-environment: the live count, clamped to the library cap so
      // a lowered cap can't leave `current` above `max`.
      current: Number.isFinite(storedCurrent)
        ? Number.isFinite(max)
          ? Math.min(storedCurrent, max)
          : storedCurrent
        : libNode.current,
      respawn: {
        ...cloneJson(libNode.respawn || { policy: 'manual' }),
        lastEvaluatedWorldTime: numberOrNullStrict(storedRespawn.lastEvaluatedWorldTime),
        nextEvaluationWorldTime: numberOrNullStrict(storedRespawn.nextEvaluationWorldTime),
        lastRoll:
          storedRespawn.lastRoll && typeof storedRespawn.lastRoll === 'object'
            ? cloneJson(storedRespawn.lastRoll)
            : null,
      },
    };
    if (stored?.showCountsToPlayers === true) merged.showCountsToPlayers = true;
    return merged;
  }

  /**
   * Respawn one resource-node pool as world time passes (`overTime` policy
   * only). Per elapsed interval, adds nodes per `respawn.gainMode`: `guaranteed`
   * (+1), `chance` (a persisted d100 roll), or `expression` (roll
   * `respawn.amountExpression` and add the rolled total). Clamped to max,
   * advancing the `respawn.lastEvaluatedWorldTime` anchor so a same-tick refresh
   * never rerolls.
   *
   * @param {object} nodes The node object (config + state).
   * @param {{now:number, environment?:object, environmentId:string, taskId:string}} ctx
   * @returns {Promise<{changed: boolean, node: object}>}
   */
  async _respawnNode(nodes, { now, environment = null, environmentId, taskId }) {
    const respawn = nodes?.respawn;
    if (!nodes || !respawn || respawn.policy !== 'overTime') {
      return { changed: false, node: nodes };
    }
    // The respawn ARITHMETIC (interval resolution, gain per mode, anchor advance,
    // backwards/stalled-time re-anchor, room===0 short-circuit, max-clamp early
    // break) is the single pure implementation in `nodeRespawnMath`. This env
    // path injects the SAME calendar/random seams the per-token adapter uses —
    // `secondsPerUnit` (legacy `intervalSeconds` falls through inside the math),
    // the `rollD100() <= chance*100` chance seam, and a SYNCHRONOUS expression
    // roll backed by pre-rolled async amounts (so Roll/`evaluateExpression`
    // evaluation still happens, while the math stays pure). Keeping one
    // implementation removes the prior `_respawnNode`/`respawnNodeOnce` drift.

    // Pre-roll expression amounts asynchronously (the math is sync). The needed
    // count is bounded by the elapsed whole intervals capped by the restock room,
    // mirroring the math's stochastic-loop bound; the math may consume fewer (the
    // max-clamp early break) — surplus pre-rolls are simply unused.
    let expressionRolls = null;
    let expressionCursor = 0;
    if ((respawn.gainMode || 'guaranteed') === 'expression') {
      const interval = respawn.intervalUnit
        ? this._durationToSeconds(respawn.intervalAmount, respawn.intervalUnit)
        : Number(respawn.intervalSeconds || 0);
      const last = Number.isFinite(Number(respawn.lastEvaluatedWorldTime))
        ? Number(respawn.lastEvaluatedWorldTime)
        : now;
      if (interval > 0 && now > last) {
        const elapsedIntervals = Math.floor((now - last) / interval);
        const room = Math.max(0, Number(nodes.max || 0) - Number(nodes.current || 0));
        const needed = Math.min(Math.max(0, elapsedIntervals), room);
        expressionRolls = [];
        for (let i = 0; i < needed; i++) {
          expressionRolls.push(
            await this._respawnExpressionAmount({
              expression: respawn.amountExpression,
              environment,
            })
          );
        }
      }
    }

    const before = Number(nodes.current || 0);
    const { changed, node } = respawnNodeOnce(nodes, {
      now,
      secondsPerUnit: (unit) => this._respawnIntervalSecondsSeam(respawn, unit),
      // Raw 1..100 roll seam (the math hits on `roll <= chance*100` and persists
      // the raw roll in `lastRoll.rolls`, identical to the prior env path).
      rollChance: () => Number(this.rollD100()),
      rollExpression: () =>
        expressionRolls ? Number(expressionRolls[expressionCursor++] || 0) : 0,
    });

    if (changed) {
      const nextCurrent = Number(node?.current ?? before);
      const max = Number(node?.max ?? nodes.max ?? 0);
      // Only emit the respawn hook when the count actually moved (a pure
      // re-anchor changes the node but gains nothing).
      if (nextCurrent !== before) {
        this._callHook('fabricate.gathering.nodeRespawned', {
          environmentId,
          taskId,
          amount: nextCurrent - before,
          current: nextCurrent,
          max,
        });
      }
    }
    return { changed, node };
  }

  /**
   * `secondsPerUnit` seam for `respawnNodeOnce` on the env path: resolve the
   * interval unit through the calendar-aware `_durationToSeconds(1, unit)`, so
   * day/week lengths follow the active world calendar exactly like the per-token
   * adapter. The math's own legacy `intervalSeconds` fallback handles
   * pre-unit-schema nodes (it only calls this seam when `respawn.intervalUnit`
   * is set).
   *
   * @param {object} respawn The node's respawn block.
   * @param {string} unit The interval unit passed by the math.
   * @returns {number} Seconds for one unit.
   */
  _respawnIntervalSecondsSeam(respawn, unit) {
    return this._durationToSeconds(1, unit);
  }

  /**
   * Roll the per-interval node gain for an `expression` respawn. Respawn is
   * environment-level with no actor, so the expression must be plain dice
   * (e.g. `1d4`); any `@actor.*` reference resolves against an empty roll-data
   * context and coerces to 0 (never throws). Floored at 0 and rounded.
   *
   * @param {object} payload
   * @returns {Promise<number>} Non-negative integer node gain for one interval.
   */
  async _respawnExpressionAmount({ expression, environment = null } = {}) {
    if (expression === null || expression === undefined || String(expression).trim() === '')
      return 0;
    let value;
    try {
      value =
        typeof this.evaluateExpression === 'function'
          ? await this.evaluateExpression({
              expression: String(expression),
              provider: null,
              actor: null,
              kind: 'nodeRespawn',
              system: null,
              environment,
            })
          : // No Roll available (e.g. headless): a plain number still resolves.
            Number(expression);
    } catch {
      // A malformed dice string (e.g. `1d`, `(`) or an `@actor.*` reference with
      // no actor must not abort respawn for the rest of the environment — treat
      // this interval as no gain.
      return 0;
    }
    const numeric = Number(value);
    return Math.max(0, Math.round(Number.isFinite(numeric) ? numeric : 0));
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

  async evaluateStart({ actor, system, environment, task, viewer } = {}) {
    const blockedReasons = [];
    const evidence = this.buildListingMetadata({ environment, task, actor, viewer });
    const systemId = system?.id || environment?.craftingSystemId;
    const staminaEnabled = this.staminaEnabled(systemId);
    const nodesEnabled = this.nodesEnabled(systemId);

    const gateNode = task?.nodes ?? null;
    if (nodesEnabled && gateNode && Number(gateNode.current || 0) <= 0) {
      blockedReasons.push(this._blockedReason('NODE_DEPLETED', { taskId: task.id }));
    }

    if (staminaEnabled && Number(task?.staminaCost || 0) > 0) {
      await this.seedActorStaminaIfNeeded({ actor, systemId, system, environment });
      const cost = await this._effectiveStaminaCost({ actor, system, environment, task, viewer });
      const stamina = this.getActorStamina(actor, systemId);
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

    const depletionSource = task?.nodes ?? null;
    if (nodesEnabled && depletionSource && shouldDepleteNode({ nodes: depletionSource }, outcome)) {
      // Persist the full node object (config + respawn timers) with one consumed,
      // so the per-environment pool (nodeRuntime for library tasks) is seeded and
      // decremented in a single write.
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
      await this._writeNodeState({ environmentId: environment.id, taskId: task.id, node });
      evidence.node = { taskId: task.id, consumed: 1, remaining: current };
    }

    if (staminaEnabled && Number(task?.staminaCost || 0) > 0) {
      await this.seedActorStaminaIfNeeded({ actor, systemId, system, environment });
      // Only spend when a pool exists (max configured); no max ⇒ no stamina limit.
      if (this.getActorStamina(actor, systemId).max != null) {
        const cost = await this._effectiveStaminaCost({ actor, system, environment, task, viewer });
        if (cost > 0) {
          await this.adjustActorStamina(actor, { systemId, delta: -cost });
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
        ? this._mergeNodeConfigState(cloneJson(normalized.nodes), stored)
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

  /**
   * The stamina an actor regenerates per elapsed `regen.unit`: `regen.amount`
   * evaluated per actor as a single expression (a plain number or a formula
   * with character references, e.g. "1 + @abilities.con.mod"). Floored at 0 and
   * rounded to an integer so multi-interval catch-up is deterministic.
   *
   * @param {object} payload
   * @returns {Promise<number>} Non-negative integer amount per interval.
   */
  async _regenAmountPerInterval({
    actor,
    systemId: _systemId,
    system = null,
    environment = null,
    regen,
  } = {}) {
    const expression = regen?.amount;
    if (expression == null || expression === '') return 0;
    const value =
      typeof this.evaluateExpression === 'function'
        ? await this.evaluateExpression({
            expression: String(expression),
            provider: null,
            actor,
            kind: 'staminaRegen',
            system,
            environment,
          })
        : // No Roll available (e.g. headless): a plain number still resolves.
          Number(expression);
    const numeric = Number(value);
    return Math.max(0, Math.round(Number.isFinite(numeric) ? numeric : 0));
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
 * @param {object} raw Raw economy block.
 * @returns {{stamina: {enabled: boolean, regen: object}, nodes: {enabled: boolean}}}
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
const TOOL_REQUIREMENT_PROVIDERS = new Set(['dnd5e', 'pf2e', 'macro']);

function normalizeToolRequirement(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  const provider = TOOL_REQUIREMENT_PROVIDERS.has(input.provider) ? input.provider : 'dnd5e';
  return {
    provider,
    formula: typeof input.formula === 'string' ? input.formula : '',
    macroUuid: typeof input.macroUuid === 'string' ? input.macroUuid : '',
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
 * the entry lacks a resolvable id or has neither an expression nor a
 * macroUuid (an entry that cannot resolve to a number is dropped).
 *
 * @param {object} entry Raw library entry.
 * @returns {object|null} Normalized entry or null when invalid.
 */
function normalizeCharacterModifierLibraryEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const id = stringOrFallback(entry.id, '');
  if (!id) return null;
  const provider = CHARACTER_MODIFIER_PROVIDERS.has(entry.provider) ? entry.provider : 'dnd5e';
  const expression = stringOrFallback(entry.expression, '');
  const macroUuid = stringOrFallback(entry.macroUuid, '');
  if (!expression && !macroUuid) return null;
  return {
    id,
    label: stringOrFallback(entry.label, id),
    icon: stringOrFallback(entry.icon, 'fa-solid fa-user'),
    provider,
    expression,
    macroUuid,
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

function numberOrNullStrict(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function rollDropRow({
  row,
  index,
  roll,
  modifier,
  conditions = {},
  biomes = [],
  biomeAggregation = 'strongestOfEach',
  characterModifierContributions = [],
}) {
  const effectiveRoll = Number(roll) + Number(modifier || 0);
  const conditionModifier = matchingConditionModifier(
    row.conditionModifiers,
    conditions,
    biomes,
    biomeAggregation
  );
  const characterModifierTotal = (
    Array.isArray(characterModifierContributions) ? characterModifierContributions : []
  ).reduce((sum, value) => sum + Number(value || 0), 0);
  const finalDropRate = Math.min(
    100,
    Math.max(0, Number(row.dropRate) + conditionModifier + characterModifierTotal)
  );
  const threshold = 101 - finalDropRate;
  return {
    ...cloneJson(row),
    rank: index,
    roll: Number(roll),
    modifier: Number(modifier || 0),
    conditionModifier,
    characterModifierTotal,
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

function matchingConditionModifier(
  modifiers = {},
  conditions = {},
  biomes = [],
  biomeAggregation = 'strongestOfEach'
) {
  const conditionTotal = ['timeOfDay', 'weather'].reduce((total, kind) => {
    const current = normalizeConditionId(conditions?.[kind]);
    if (!current) return total;
    return (
      total +
      normalizeDropConditionModifierList(modifiers?.[kind])
        .filter((modifier) => modifier.conditionId === current)
        .reduce(
          (sum, modifier) => sum + (modifier.operator === '-' ? -modifier.value : modifier.value),
          0
        )
    );
  }, 0);
  return conditionTotal + matchingBiomeModifier(modifiers?.biome, biomes, biomeAggregation);
}

// The signed condition-modifier total for a single kind ('weather'|'timeOfDay')
// under the current conditions — the per-kind split of matchingConditionModifier,
// used by previewDropBreakdown so the player UI can show weather and time-of-day
// contributions separately.
function conditionModifierForKind(modifiers = {}, kind, conditions = {}) {
  const current = normalizeConditionId(conditions?.[kind]);
  if (!current) return 0;
  return normalizeDropConditionModifierList(modifiers?.[kind])
    .filter((modifier) => modifier.conditionId === current)
    .reduce(
      (sum, modifier) => sum + (modifier.operator === '-' ? -modifier.value : modifier.value),
      0
    );
}

function matchingBiomeModifier(biomeModifiers = [], biomes = [], aggregation = 'strongestOfEach') {
  const activeBiomes = new Set(
    (Array.isArray(biomes) ? biomes : []).map(normalizeTag).filter(Boolean)
  );
  if (activeBiomes.size === 0) return 0;
  const values = normalizeDropConditionModifierList(biomeModifiers)
    .filter((modifier) => activeBiomes.has(normalizeTag(modifier.conditionId)))
    .map((modifier) => (modifier.operator === '-' ? -modifier.value : modifier.value));
  return aggregateBiomeModifierValues(values, aggregation);
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

function readState(actor) {
  try {
    const state = actor?.getFlag?.(FLAG_NAMESPACE, STATE_FLAG_KEY);
    return state && typeof state === 'object' ? cloneJson(state) : {};
  } catch {
    return {};
  }
}

async function writeState(actor, state) {
  return actor?.setFlag?.(FLAG_NAMESPACE, STATE_FLAG_KEY, cloneJson(state));
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
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

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number(fallback || 0);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number(fallback || 0);
}

function positiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : Number(fallback || 1);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
