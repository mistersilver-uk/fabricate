import { evaluateEnvironmentMatch } from './gatheringMatch.js';

const FLAG_NAMESPACE = 'fabricate';
const STATE_FLAG_KEY = 'gatheringState';
const DEFAULT_CONDITIONS = Object.freeze({ weather: 'clear', timeOfDay: 'day' });
const DEFAULT_VOCABULARIES = Object.freeze({
  regions: [],
  biomes: ['forest', 'grassland', 'mountain', 'cave', 'coastal', 'swamp', 'desert', 'urban', 'ruins', 'wasteland'],
  danger: ['safe', 'hazardous', 'dangerous', 'deadly'],
  weather: ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'wind'],
  timeOfDay: ['dawn', 'day', 'dusk', 'night']
});
const CONDITION_DIMENSIONS = ['weather', 'timeOfDay'];
const VOCABULARY_DIMENSIONS = ['regions', 'biomes'];
const BIOME_COLOR_TOKENS = new Set(['sage', 'mist', 'lavender', 'rose', 'peach', 'butter', 'aqua', 'mauve']);
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
  wasteland: Object.freeze({ label: 'Wasteland', icon: 'fas fa-skull', colorToken: 'mauve' })
});
const DEFAULT_CONDITION_ICONS = Object.freeze({
  weather: Object.freeze({
    clear: 'fas fa-sun',
    cloudy: 'fas fa-cloud',
    rain: 'fas fa-cloud-rain',
    storm: 'fas fa-bolt',
    snow: 'fas fa-snowflake',
    fog: 'fas fa-smog',
    wind: 'fas fa-wind'
  }),
  timeOfDay: Object.freeze({
    dawn: 'fas fa-cloud-sun',
    day: 'fas fa-sun',
    dusk: 'fas fa-cloud-moon',
    night: 'fas fa-moon'
  })
});
const FALLBACK_CONDITION_ICONS = Object.freeze({
  weather: 'fas fa-cloud-sun',
  timeOfDay: 'fas fa-clock'
});
const DROP_SELECTION_MODES = new Set(['highestRankedDrop', 'allDrops', 'limitedDrops']);
const LEGACY_DROP_SELECTION_MODES = new Set(['highestRankedDrop', 'allDrops']);
const HAZARD_POLICIES = new Set(['successWithHazard', 'failureWithHazard']);
const TOOL_BREAKAGE_POLICIES = new Set(['failureOnBreak', 'successDespiteBreak']);
const BIOME_MODIFIER_AGGREGATIONS = new Set(['cumulative', 'strongestOfEach', 'dominant']);
const CHARACTER_MODIFIER_PROVIDERS = new Set(['dnd5e', 'pf2e', 'macro']);
const CHARACTER_MODIFIER_OPERATORS = new Set(['+', '-']);
const ROLL_EXPRESSION_PATTERN = /\d\s*d\s*\d|[*/()]/i;
const DEFAULT_GATHERING_RULES = Object.freeze({
  rewardSelectionMode: 'highestRankedDrop',
  rewardLimit: 1,
  hazardSelectionMode: 'allDrops',
  hazardLimit: 1,
  hazardPolicy: 'successWithHazard',
  toolBreakagePolicy: 'failureOnBreak',
  biomeModifierAggregation: 'strongestOfEach'
});

const BLOCKED_REASON_KEYS = Object.freeze({
  NODE_DEPLETED: 'FABRICATE.Gathering.Blocked.NodeDepleted',
  ATTEMPT_LIMIT_EXHAUSTED: 'FABRICATE.Gathering.Blocked.AttemptLimitExhausted',
  STAMINA_BLOCKED: 'FABRICATE.Gathering.Blocked.StaminaBlocked'
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
    runMacro = null
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
  }

  getConditions() {
    const config = this._config();
    return {
      weather: config.conditions.weather,
      timeOfDay: config.conditions.timeOfDay,
      vocabularies: cloneJson(config.vocabularies)
    };
  }

  async setWeather(weather) {
    return this.setConditions({ weather });
  }

  async setTimeOfDay(timeOfDay) {
    return this.setConditions({ timeOfDay });
  }

  async setConditions({ weather = undefined, timeOfDay = undefined } = {}) {
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
      vocabularies: cloneJson(next.vocabularies)
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
    const hasSystemRules = rawSystemConfig?.rules && typeof rawSystemConfig.rules === 'object' && !Array.isArray(rawSystemConfig.rules);
    const rules = hasSystemRules
      ? normalizeGatheringRules(libraries.rules)
      : normalizeGatheringRules({
          hazardSelectionMode: environment.hazardSelectionMode,
          hazardLimit: environment.hazardLimit,
          hazardPolicy: environment.hazardPolicy
        });
    const compositionMode = environment?.compositionMode === 'manual' ? 'manual' : 'automatic';
    const tasks = [
      ...normalizeList(environment.tasks),
      ...sortRecordsByOrder(
        normalizeList(libraries.tasks)
          .filter(task => task?.enabled !== false)
          .filter(task => this._recordMatchesEnvironment(task, environment, currentConditions, { includeDanger: false, conditionSettings: systemConditions }))
          .filter(task => this._environmentIncludesLibraryRecord(environment, task.id, 'task', compositionMode)),
        environment?.taskOrder
      ).map(task => this._libraryTaskToRuntimeTask(task))
    ];
    const hazards = sortRecordsByOrder(
      normalizeList(libraries.hazards)
        .filter(hazard => hazard?.enabled !== false)
        .filter(hazard => this._recordMatchesEnvironment(hazard, environment, currentConditions, { includeDanger: true, conditionSettings: systemConditions }))
        .filter(hazard => this._environmentIncludesLibraryRecord(environment, hazard.id, 'hazard', compositionMode)),
      environment?.hazardOrder
    ).map(hazard => normalizeHazard(hazard));

    const libraryCharacterModifiers = new Map();
    for (const entry of normalizeList(libraries.characterModifiers)) {
      if (entry?.id) libraryCharacterModifiers.set(String(entry.id), cloneJson(entry));
    }

    const libraryTools = new Map();
    for (const tool of normalizeList(libraries.tools)) {
      if (tool?.id) libraryTools.set(String(tool.id), cloneJson(tool));
    }

    const composed = {
      ...cloneJson(environment),
      conditions: cloneJson(currentConditions),
      biomes: normalizeTagList(environment.biomes ?? environment.biome),
      dangerTags: normalizeTagList(environment.dangerTags ?? environment.risk),
      tasks,
      hazards,
      rules,
      useLegacyTaskItemSelectionMode: !hasSystemRules,
      hazardSelectionMode: rules.hazardSelectionMode,
      hazardLimit: rules.hazardLimit,
      hazardPolicy: rules.hazardPolicy
    };
    Object.defineProperty(composed, '__libraryCharacterModifiers', {
      value: libraryCharacterModifiers,
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(composed, '__libraryTools', {
      value: libraryTools,
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(composed, '__systemId', {
      value: systemId,
      enumerable: false,
      configurable: true,
      writable: true
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
   * @param {number} [options.hazardModifier] Fallback hazard modifier value.
   * @returns {Promise<object>} Resolution payload (status, items, hazards,
   *   hazardPolicy, characterModifierSnapshot, [diagnostics]).
   */
  async resolveD100Attempt({ task, environment, actor = null, viewer = null, system = null, gatheringModifier = 0, hazardModifier = 0 } = {}) {
    const itemRows = normalizeList(task?.dropRows ?? task?.itemDrops);
    const taskModifier = numericModifier(task?.gatheringModifier, gatheringModifier);
    const conditions = environment?.conditions || {};
    const library = environment?.__libraryCharacterModifiers instanceof Map
      ? environment.__libraryCharacterModifiers
      : new Map();

    const diagnostics = [];
    const enabledRows = itemRows.filter(row => row?.enabled !== false).map(row => normalizeItemDrop(row));
    const enabledHazards = normalizeList(environment?.hazards).filter(hazard => hazard?.enabled !== false).map(hazard => normalizeHazard(hazard));

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
          hazard: null,
          viewer,
          system
        });
        if (!resolved.ok) {
          diagnostics.push(resolved.diagnostic);
          continue;
        }
        contributions.push(resolved.contribution);
        rowEvidence.push(resolved.evidence);
      }
      rowSnapshots.push({ rowId: row.id, contributions: rowEvidence });
      rowContributions.push({ row, contributions, characterModifierTotal: contributions.reduce((sum, value) => sum + value, 0) });
    }

    const hazardSnapshots = [];
    const hazardContributions = [];
    for (const hazard of enabledHazards) {
      const contributions = [];
      const hazardEvidence = [];
      for (const reference of normalizeList(hazard.characterModifiers)) {
        const entry = library.get(String(reference.modifierId)) || null;
        const resolved = await this._resolveCharacterModifierContribution({
          reference,
          libraryEntry: entry,
          actor,
          environment,
          task,
          row: null,
          hazard,
          viewer,
          system
        });
        if (!resolved.ok) {
          diagnostics.push(resolved.diagnostic);
          continue;
        }
        contributions.push(resolved.contribution);
        hazardEvidence.push(resolved.evidence);
      }
      hazardSnapshots.push({ hazardId: hazard.id, contributions: hazardEvidence });
      hazardContributions.push({ hazard, contributions, characterModifierTotal: contributions.reduce((sum, value) => sum + value, 0) });
    }

    if (diagnostics.length > 0) {
      return {
        status: 'misconfigured',
        items: [],
        hazards: [],
        hazardPolicy: null,
        characterModifierSnapshot: { rows: rowSnapshots, hazards: hazardSnapshots },
        diagnostics
      };
    }

    const rules = resolveRulesForAttempt(task, environment);
    const biomes = Array.isArray(environment?.biomes) ? environment.biomes : [];
    const biomeAggregation = rules.biomeModifierAggregation;

    const droppedItems = rowContributions
      .map((entry, index) => rollDropRow({
        row: entry.row,
        index,
        roll: this.rollD100(),
        modifier: taskModifier,
        conditions,
        biomes,
        biomeAggregation,
        characterModifierContributions: entry.contributions
      }))
      .filter(result => result.dropped);
    const selectedItems = selectDrops(droppedItems, rules.rewardSelectionMode, rules.rewardLimit);

    const droppedHazards = hazardContributions
      .map((entry, index) => rollDropRow({
        row: entry.hazard,
        index,
        roll: this.rollD100(),
        modifier: numericModifier(entry.hazard?.hazardModifier, hazardModifier),
        conditions,
        biomes,
        biomeAggregation,
        characterModifierContributions: entry.contributions
      }))
      .filter(result => result.dropped);
    const selectedHazards = selectDrops(droppedHazards, rules.hazardSelectionMode, rules.hazardLimit);
    const hazardPolicy = rules.hazardPolicy;

    return {
      status: selectedHazards.length > 0 && hazardPolicy === 'failureWithHazard' ? 'failed' : 'succeeded',
      items: selectedItems,
      hazards: selectedHazards,
      hazardPolicy,
      characterModifierSnapshot: { rows: rowSnapshots, hazards: hazardSnapshots }
    };
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
   * @param {object|null} [payload.hazard]
   * @param {object} [payload.viewer]
   * @param {object} [payload.system]
   * @returns {Promise<{ok: boolean, contribution: number, evidence: object, diagnostic?: object}>}
   */
  async _resolveCharacterModifierContribution({ reference, libraryEntry, actor, environment, task, row, hazard, viewer, system }) {
    const referenceId = stringOrFallback(reference?.id, '');
    const modifierId = stringOrFallback(reference?.modifierId, '');
    const operator = CHARACTER_MODIFIER_OPERATORS.has(reference?.operator) ? reference.operator : '+';
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
          hazardId: hazard?.id || null
        }
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
          hazardId: hazard?.id || null
        }
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
            hazard,
            conditions,
            modifier: { id: modifierId, label: libraryEntry?.label || modifierId },
            viewer,
            system
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
          hazard,
          viewer,
          system,
          modifier: { id: modifierId, label: libraryEntry?.label || modifierId }
        });
      }
    } catch (_err) {
      rawValue = null;
    }

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return {
        ok: false,
        diagnostic: {
          code: 'CHARACTER_MODIFIER_NON_FINITE',
          message: `Character modifier "${modifierId}" did not resolve to a finite number`,
          modifierId,
          referenceId,
          rowId: row?.id || null,
          hazardId: hazard?.id || null
        }
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
          hazardId: hazard?.id || null
        }
      };
    }

    let clamped = numeric;
    if (min !== null) clamped = Math.max(clamped, min);
    if (max !== null) clamped = Math.min(clamped, max);
    const contribution = operator === '-' ? -clamped : clamped;

    const evidence = {
      rowId: row?.id || null,
      hazardId: hazard?.id || null,
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
      bounds: { min, max }
    };

    return { ok: true, contribution, evidence };
  }

  inspectEnvironment(environmentId) {
    const environment = this.environmentStore?.get?.(environmentId);
    return environment ? cloneJson(environment) : null;
  }

  buildListingMetadata({ environment, task, actor, viewer }) {
    const opaqueBlind = environment?.selectionMode === 'blind' && viewer?.isGM !== true;
    const nodes = task?.nodes ? {
      enabled: true,
      available: Number(task.nodes.current || 0) > 0,
      current: task.nodes.showCountsToPlayers === true || viewer?.isGM === true || !opaqueBlind ? Number(task.nodes.current || 0) : null,
      max: task.nodes.showCountsToPlayers === true || viewer?.isGM === true || !opaqueBlind ? Number(task.nodes.max || 0) : null
    } : null;
    const stamina = Number(task?.staminaCost || 0) > 0 ? {
      cost: Number(task.staminaCost || 0),
      state: this.getActorStamina(actor, environment?.craftingSystemId)
    } : null;
    const attemptLimit = task?.attemptLimit ? this._attemptLimitEvidence({ actor, environment, task, viewer }) : null;
    return {
      nodes,
      stamina,
      attemptLimit,
      risk: task?.riskOverride || environment?.risk || 'safe',
      conditions: this.getConditions().weather ? cloneJson(this._config().conditions) : cloneJson(environment?.conditions || {}),
      hazards: opaqueBlind
        ? normalizeList(environment?.hazards).map(() => ({ matched: true }))
        : normalizeList(environment?.hazards).map(hazard => ({
            id: hazard.id,
            name: hazard.name,
            dropRate: hazard.dropRate
          }))
    };
  }

  getActorStamina(actor, systemId = null) {
    const state = readState(actor);
    const key = systemId || 'default';
    const stamina = state.stamina?.[key] || {};
    return {
      current: Number.isFinite(Number(stamina.current)) ? Number(stamina.current) : null,
      max: Number.isFinite(Number(stamina.max)) ? Number(stamina.max) : null,
      provider: stamina.provider || 'fabricate',
      regenerationMode: stamina.regenerationMode || 'manual'
    };
  }

  async setActorStamina(actor, { systemId = 'default', current = null, max = null, provider = 'fabricate', regenerationMode = 'manual' } = {}) {
    const state = readState(actor);
    const key = systemId || 'default';
    const previous = state.stamina?.[key] || {};
    const next = {
      provider: provider || previous.provider || 'fabricate',
      regenerationMode: regenerationMode || previous.regenerationMode || 'manual',
      current: nonNegativeNumber(current, previous.current ?? 0),
      max: nonNegativeNumber(max, previous.max ?? current ?? 0)
    };
    state.stamina = { ...(state.stamina || {}), [key]: next };
    state.history = [
      this._historyEvent('stamina.set', { systemId: key, current: next.current, max: next.max }),
      ...normalizeList(state.history)
    ].slice(0, 50);
    await writeState(actor, state);
    this._callHook('fabricate.gathering.staminaAdjusted', { actor, systemId: key, stamina: cloneJson(next) });
    return cloneJson(next);
  }

  async adjustActorStamina(actor, { systemId = 'default', delta = 0 } = {}) {
    const current = this.getActorStamina(actor, systemId);
    const nextCurrent = Math.max(0, Number(current.current || 0) + Number(delta || 0));
    return this.setActorStamina(actor, {
      systemId,
      current: current.max !== null ? Math.min(nextCurrent, current.max) : nextCurrent,
      max: current.max ?? nextCurrent,
      provider: current.provider,
      regenerationMode: current.regenerationMode
    });
  }

  async restockNode({ environmentId, taskId, current = null, max = null } = {}) {
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    const tasks = normalizeList(environment.tasks).map(task => {
      if (task?.id !== taskId) return task;
      const existing = task.nodes || { enabled: true, max: 0, current: 0, depletionTiming: 'onStart', respawn: { policy: 'none' } };
      const nextMax = nonNegativeInteger(max, existing.max);
      return {
        ...task,
        nodes: {
          ...existing,
          enabled: true,
          max: nextMax,
          current: Math.min(nonNegativeInteger(current, nextMax), nextMax)
        }
      };
    });
    const updated = await this.environmentStore.update(environmentId, { tasks });
    this._callHook('fabricate.gathering.nodeRestocked', { environmentId, taskId, current, max });
    return updated;
  }

  async updateConditions({ environmentId, conditions = {} } = {}) {
    if (!environmentId) {
      return this.setConditions(conditions);
    }
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    const updated = await this.environmentStore.update(environmentId, {
      conditions: {
        ...(environment.conditions || {}),
        ...conditions
      }
    });
    this._callHook('fabricate.gathering.conditionsUpdated', { environmentId, conditions: updated?.conditions || {} });
    return updated;
  }

  async revealTask(actor, { environmentId, taskId, scope = 'actor' } = {}) {
    const state = readState(actor);
    const key = revealKey({ environmentId, taskId, scope, actor, userId: this.getUserId() });
    state.reveals = { ...(state.reveals || {}), [key]: this._historyEvent('blind.reveal', { environmentId, taskId, scope }) };
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

  async evaluateStart({ actor, system, environment, task, viewer } = {}) {
    const blockedReasons = [];
    const evidence = this.buildListingMetadata({ environment, task, actor, viewer });

    if (task?.nodes && Number(task.nodes.current || 0) <= 0 && viewer?.isGM !== true) {
      blockedReasons.push(this._blockedReason('NODE_DEPLETED', { taskId: task.id }));
    }

    if (task?.attemptLimit) {
      const attempt = this._attemptLimitEvidence({ actor, environment, task, viewer });
      evidence.attemptLimit = attempt;
      if (attempt.remaining !== null && attempt.remaining <= 0 && viewer?.isGM !== true) {
        blockedReasons.push(this._blockedReason('ATTEMPT_LIMIT_EXHAUSTED', { taskId: task.id }));
      }
    }

    const staminaCost = Number(task?.staminaCost || 0);
    if (staminaCost > 0 && viewer?.isGM !== true) {
      const stamina = this.getActorStamina(actor, system?.id || environment?.craftingSystemId);
      evidence.stamina = { cost: staminaCost, state: stamina };
      if (Number(stamina.current ?? 0) < staminaCost) {
        blockedReasons.push(this._blockedReason('STAMINA_BLOCKED', {
          taskId: task.id,
          required: staminaCost,
          current: stamina.current ?? 0
        }));
      }
    }

    return { blockedReasons, evidence };
  }

  async commitAcceptedAttempt({ actor, system, environment, task, outcome = null } = {}) {
    const evidence = {
      conditions: cloneJson(environment?.conditions || {}),
      risk: task?.riskOverride || environment?.risk || 'safe',
      node: null,
      stamina: null,
      attemptLimit: null,
      characterModifierSnapshot: cloneJson(
        outcome?.characterModifierSnapshot
          ?? outcome?.checkResult?.characterModifierSnapshot
          ?? null
      )
    };

    if (task?.nodes && shouldDepleteNode(task, outcome)) {
      const current = Math.max(0, Number(task.nodes.current || 0) - 1);
      await this.restockNode({ environmentId: environment.id, taskId: task.id, current, max: task.nodes.max });
      evidence.node = { taskId: task.id, consumed: 1, remaining: current };
    }

    const staminaCost = Number(task?.staminaCost || 0);
    if (staminaCost > 0) {
      await this.adjustActorStamina(actor, { systemId: system?.id || environment?.craftingSystemId, delta: -staminaCost });
      evidence.stamina = { spent: staminaCost };
    }

    if (task?.attemptLimit) {
      const state = readState(actor);
      const key = attemptKey({ actor, environment, task, userId: this.getUserId() });
      const previous = state.attempts?.[key] || { count: 0 };
      const next = {
        count: Number(previous.count || 0) + 1,
        updatedAtWorldTime: this._now()
      };
      state.attempts = { ...(state.attempts || {}), [key]: next };
      await writeState(actor, state);
      evidence.attemptLimit = { key, count: next.count, max: task.attemptLimit.max };
    }

    this._callHook('fabricate.gathering.richAttemptCommitted', { actor, system, environment, task, outcome, evidence });
    return evidence;
  }

  _recordMatchesEnvironment(record, environment, conditions, { includeDanger, conditionSettings = null }) {
    return evaluateEnvironmentMatch(record, environment, conditions, { includeDanger, conditionSettings }).matches;
  }

  _environmentAllowsLibraryRecord(environment, id, kind) {
    const enabledKey = kind === 'hazard' ? 'enabledHazardIds' : 'enabledTaskIds';
    const disabledKey = kind === 'hazard' ? 'disabledHazardIds' : 'disabledTaskIds';
    const enabled = normalizeList(environment?.[enabledKey]).map(String);
    const disabled = normalizeList(environment?.[disabledKey]).map(String);
    if (disabled.includes(String(id))) return false;
    return enabled.length === 0 || enabled.includes(String(id));
  }

  /**
   * Whether a matching, library-enabled record is composed into the
   * environment, honoring `compositionMode`:
   * - `automatic`: include unless explicitly excluded (`disabled*Ids`). A
   *   non-empty `enabled*Ids` is still honored as a legacy allow-list so
   *   pre-existing environments keep their behavior (the new editor never
   *   populates `enabled*Ids` while in automatic mode).
   * - `manual`: include only when explicitly listed (`enabled*Ids`) and not excluded.
   */
  _environmentIncludesLibraryRecord(environment, id, kind, compositionMode = 'automatic') {
    const enabledKey = kind === 'hazard' ? 'enabledHazardIds' : 'enabledTaskIds';
    const disabledKey = kind === 'hazard' ? 'disabledHazardIds' : 'disabledTaskIds';
    const enabled = normalizeList(environment?.[enabledKey]).map(String);
    const disabled = normalizeList(environment?.[disabledKey]).map(String);
    if (disabled.includes(String(id))) return false;
    if (compositionMode === 'manual') return enabled.includes(String(id));
    return enabled.length === 0 || enabled.includes(String(id));
  }

  _libraryTaskToRuntimeTask(task) {
    const normalized = normalizeLibraryTask(task);
    const runtimeTask = {
      id: normalized.id,
      name: normalized.name,
      description: normalized.description,
      img: normalized.img,
      enabled: normalized.enabled,
      resolutionMode: 'd100',
      itemSelectionMode: normalized.itemSelectionMode,
      dropRows: normalized.dropRows,
      staminaCost: normalized.staminaCost,
      gatheringModifier: normalized.gatheringModifier,
      resultGroups: [{ id: `${normalized.id}-d100`, name: normalized.name, results: [] }],
      resultSelection: { provider: 'd100Rows' },
      catalysts: [],
      toolIds: Array.isArray(normalized.toolIds) ? [...normalized.toolIds] : []
    };
    if (normalized.timeRequirement) runtimeTask.timeRequirement = cloneJson(normalized.timeRequirement);
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
    if (typeof this.getSetting !== 'function' || typeof this.setSetting !== 'function') return false;
    const target = String(systemId);
    const raw = this.getSetting(this.settingKey);
    const systems = raw?.systems;
    if (!systems || typeof systems !== 'object' || !(target in systems)) return false;
    const nextSystems = { ...systems };
    delete nextSystems[target];
    const next = { ...(raw || {}), systems: nextSystems };
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

  _attemptLimitEvidence({ actor, environment, task }) {
    if (!task?.attemptLimit) return null;
    const state = readState(actor);
    const key = attemptKey({ actor, environment, task, userId: this.getUserId() });
    const current = Number(state.attempts?.[key]?.count || 0);
    const max = Number(task.attemptLimit.max || 1);
    return {
      key,
      scope: task.attemptLimit.scope || 'actor',
      count: current,
      max,
      remaining: Math.max(0, max - current)
    };
  }

  _blockedReason(code, data = null) {
    return {
      code,
      messageKey: BLOCKED_REASON_KEYS[code] || `FABRICATE.Gathering.Blocked.${code}`,
      data
    };
  }

  _historyEvent(type, data = {}) {
    return {
      id: `${type}-${this._now()}-${Math.random().toString(36).slice(2)}`,
      type,
      worldTime: this._now(),
      ...cloneJson(data)
    };
  }

  _now() {
    const value = Number(this.nowWorldTime());
    return Number.isFinite(value) ? value : 0;
  }

  _callHook(name, payload) {
    try {
      this.hooks?.callAll?.(name, payload);
    } catch (err) {
      console.warn(`Fabricate | Gathering hook failed: ${name}`, err);
    }
  }
}

function shouldDepleteNode(task, outcome) {
  if (!task?.nodes) return false;
  if (task.nodes.depletionTiming === 'onSuccess') return outcome?.status === 'succeeded';
  return true;
}

function normalizeGatheringConfig(raw = {}) {
  const vocabularies = {
    regions: seedVocabulary(raw?.vocabularies?.regions, DEFAULT_VOCABULARIES.regions),
    biomes: seedVocabulary(raw?.vocabularies?.biomes, DEFAULT_VOCABULARIES.biomes),
    danger: seedVocabulary(raw?.vocabularies?.danger, DEFAULT_VOCABULARIES.danger),
    weather: seedVocabulary(raw?.vocabularies?.weather, DEFAULT_VOCABULARIES.weather),
    timeOfDay: seedVocabulary(raw?.vocabularies?.timeOfDay, DEFAULT_VOCABULARIES.timeOfDay)
  };
  const weather = normalizeConditionId(raw?.conditions?.weather) || DEFAULT_CONDITIONS.weather;
  const timeOfDay = normalizeConditionId(raw?.conditions?.timeOfDay) || DEFAULT_CONDITIONS.timeOfDay;
  const systems = {};
  for (const [systemId, config] of Object.entries(raw?.systems || {})) {
    systems[String(systemId)] = {
      rules: normalizeGatheringRules(config?.rules),
      conditions: normalizeSystemConditions(config?.conditions, { vocabularies, conditions: { weather, timeOfDay } }),
      vocabularies: normalizeSystemVocabularies(config?.vocabularies, vocabularies),
      tasks: normalizeList(config?.tasks).map(normalizeLibraryTask),
      tools: normalizeList(config?.tools).map(normalizeLibraryTool).filter(Boolean),
      hazards: normalizeList(config?.hazards).map(normalizeHazard),
      characterModifiers: normalizeList(config?.characterModifiers)
        .map(entry => normalizeCharacterModifierLibraryEntry(entry))
        .filter(Boolean)
    };
  }
  return {
    vocabularies,
    conditions: {
      weather: weather || DEFAULT_CONDITIONS.weather,
      timeOfDay: timeOfDay || DEFAULT_CONDITIONS.timeOfDay
    },
    systems
  };
}

function normalizeSystemConditions(raw = {}, fallback = {}) {
  const normalized = {};
  for (const kind of CONDITION_DIMENSIONS) {
    const fallbackValues = fallback?.vocabularies?.[kind] || DEFAULT_VOCABULARIES[kind];
    const enabled = raw?.[kind]?.enabled !== false;
    const explicitValues = Array.isArray(raw?.[kind]?.values);
    const normalizedValues = explicitValues ? normalizeConditionOptions(kind, raw?.[kind]?.values) : seedConditionOptions(kind, raw?.[kind]?.values, fallbackValues);
    const values = normalizedValues.length > 0 || !enabled ? normalizedValues : normalizeConditionOptions(kind, fallbackValues);
    const fallbackCurrent = normalizeConditionId(fallback?.conditions?.[kind]) || DEFAULT_CONDITIONS[kind];
    const requestedCurrent = normalizeConditionId(raw?.[kind]?.current) || fallbackCurrent;
    const valueIds = values.map(option => option.id);
    normalized[kind] = {
      enabled,
      current: valueIds.includes(requestedCurrent) ? requestedCurrent : values[0]?.id || DEFAULT_CONDITIONS[kind],
      values
    };
  }
  return normalized;
}

function resolveSystemConditionSettings(config, systemId) {
  return config?.systems?.[systemId]?.conditions
    || normalizeSystemConditions(null, { vocabularies: config?.vocabularies, conditions: config?.conditions });
}

function normalizeSystemVocabularies(raw = {}, fallbackVocabularies = {}) {
  const normalized = {};
  for (const kind of VOCABULARY_DIMENSIONS) {
    const rawValues = Array.isArray(raw?.[kind]?.values)
      ? raw[kind].values
      : (Array.isArray(raw?.[kind]) ? raw[kind] : fallbackVocabularies?.[kind]);
    normalized[kind] = {
      values: normalizeVocabularyOptions(kind, rawValues)
    };
  }
  return normalized;
}

function conditionSettingsToCurrent(settings) {
  return {
    weather: settings?.weather?.current || DEFAULT_CONDITIONS.weather,
    timeOfDay: settings?.timeOfDay?.current || DEFAULT_CONDITIONS.timeOfDay
  };
}

function normalizeLibraryTask(task = {}) {
  return {
    id: stringOrFallback(task.id, `task-${normalizeTag(task.name) || 'gather'}`),
    name: stringOrFallback(task.name, 'Gather'),
    description: stringOrFallback(task.description, ''),
    img: stringOrFallback(task.img, 'icons/svg/item-bag.svg'),
    enabled: task.enabled !== false,
    regions: normalizeTagList(Array.isArray(task.regions)
      ? task.regions
      : task.region ? [task.region] : []),
    biomes: normalizeTagList(task.biomes),
    weather: normalizeConditionIdList(task.weather),
    timeOfDay: normalizeConditionIdList(task.timeOfDay),
    itemSelectionMode: LEGACY_DROP_SELECTION_MODES.has(task.itemSelectionMode) ? task.itemSelectionMode : 'highestRankedDrop',
    dropRows: normalizeList(task.dropRows ?? task.itemDrops).map(normalizeItemDrop),
    staminaCost: nonNegativeNumber(task.staminaCost, 0),
    gatheringModifier: normalizeModifierProvider(task.gatheringModifier ?? task.modifier),
    timeRequirement: plainObjectOrNull(task.timeRequirement),
    toolIds: Array.isArray(task.toolIds)
      ? task.toolIds.map(id => String(id ?? '').trim()).filter(Boolean)
      : []
  };
}

function normalizeItemDrop(row = {}) {
  return {
    id: stringOrFallback(row.id, `drop-${normalizeTag(row.componentId ?? row.itemUuid ?? row.name) || 'row'}`),
    name: stringOrFallback(row.name, ''),
    componentId: stringOrFallback(row.componentId ?? row.systemItemId, ''),
    itemUuid: stringOrFallback(row.itemUuid, ''),
    quantity: Math.max(1, nonNegativeInteger(row.quantity, 1)),
    dropRate: clampDropRate(row.dropRate),
    conditionModifiers: normalizeDropConditionModifiers(row.conditionModifiers),
    characterModifiers: normalizeDropCharacterModifiers(row.characterModifiers),
    enabled: row.enabled !== false
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
    macroUuid: typeof input.macroUuid === 'string' ? input.macroUuid : ''
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
    threshold: Number.isFinite(threshold) ? threshold : 0
  };
}

function normalizeToolOnBreak(input) {
  const mode = TOOL_ON_BREAK_MODES.has(input?.mode) ? input.mode : 'destroy';
  if (mode === 'replaceWith') {
    return {
      mode,
      replacementComponentId: typeof input?.replacementComponentId === 'string'
        ? input.replacementComponentId
        : null
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
    onBreak: normalizeToolOnBreak(tool.onBreak)
  };
}

function normalizeHazard(hazard = {}) {
  return {
    id: stringOrFallback(hazard.id, `hazard-${normalizeTag(hazard.name) || 'row'}`),
    name: stringOrFallback(hazard.name, 'Hazard'),
    description: stringOrFallback(hazard.description, ''),
    img: stringOrFallback(hazard.img, 'icons/svg/hazard.svg'),
    enabled: hazard.enabled !== false,
    dangerTags: normalizeTagList(hazard.dangerTags),
    regions: normalizeTagList(Array.isArray(hazard.regions)
      ? hazard.regions
      : hazard.region ? [hazard.region] : []),
    biomes: normalizeTagList(hazard.biomes),
    weather: normalizeConditionIdList(hazard.weather),
    timeOfDay: normalizeConditionIdList(hazard.timeOfDay),
    dropRate: clampDropRate(hazard.dropRate),
    linkedSceneUuid: stringOrFallback(hazard.linkedSceneUuid, ''),
    hazardModifier: normalizeModifierProvider(hazard.hazardModifier ?? hazard.modifier),
    conditionModifiers: normalizeDropConditionModifiers(hazard.conditionModifiers),
    characterModifiers: normalizeHazardCharacterModifiers(hazard.characterModifiers)
  };
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
    isRollExpression: ROLL_EXPRESSION_PATTERN.test(expression || '')
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
 * Normalize hazard-row character modifier references.
 *
 * @param {Array} refs Raw reference list.
 * @returns {Array<object>} Normalized references.
 */
export function normalizeHazardCharacterModifiers(refs) {
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
    expressionOverride: stringOrFallback(ref.expressionOverride, '')
  };
}

function numberOrNullStrict(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeModifierProvider(provider = null) {
  if (!provider || typeof provider !== 'object') return null;
  return {
    provider: stringOrFallback(provider.provider, ''),
    value: numberOrNull(provider.value),
    formula: stringOrFallback(provider.formula, ''),
    macroUuid: stringOrFallback(provider.macroUuid, '')
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

function rollDropRow({ row, index, roll, modifier, conditions = {}, biomes = [], biomeAggregation = 'strongestOfEach', characterModifierContributions = [] }) {
  const effectiveRoll = Number(roll) + Number(modifier || 0);
  const conditionModifier = matchingConditionModifier(row.conditionModifiers, conditions, biomes, biomeAggregation);
  const characterModifierTotal = (Array.isArray(characterModifierContributions) ? characterModifierContributions : [])
    .reduce((sum, value) => sum + Number(value || 0), 0);
  const finalDropRate = Math.min(100, Math.max(0, Number(row.dropRate) + conditionModifier + characterModifierTotal));
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
    dropped: effectiveRoll >= threshold
  };
}

function normalizeDropConditionModifiers(modifiers = {}) {
  return {
    timeOfDay: normalizeDropConditionModifierList(modifiers?.timeOfDay),
    weather: normalizeDropConditionModifierList(modifiers?.weather),
    biome: normalizeDropConditionModifierList(modifiers?.biome)
  };
}

function normalizeDropConditionModifierList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((modifier, index) => {
      const conditionId = normalizeConditionId(modifier?.conditionId ?? modifier?.id);
      const rawValue = Number(modifier?.value);
      if (!conditionId || !Number.isFinite(rawValue)) return null;
      const truncated = Math.trunc(rawValue);
      const explicitOperator = modifier?.operator === '-' || modifier?.operator === '+'
        ? modifier.operator
        : null;
      const operator = explicitOperator ?? (truncated < 0 ? '-' : '+');
      return {
        id: stringOrFallback(modifier?.id, `${conditionId}-${index + 1}`),
        conditionId,
        operator,
        value: Math.abs(truncated)
      };
    })
    .filter(Boolean);
}

function matchingConditionModifier(modifiers = {}, conditions = {}, biomes = [], biomeAggregation = 'strongestOfEach') {
  const conditionTotal = ['timeOfDay', 'weather'].reduce((total, kind) => {
    const current = normalizeConditionId(conditions?.[kind]);
    if (!current) return total;
    return total + normalizeDropConditionModifierList(modifiers?.[kind])
      .filter(modifier => modifier.conditionId === current)
      .reduce((sum, modifier) => sum + (modifier.operator === '-' ? -modifier.value : modifier.value), 0);
  }, 0);
  return conditionTotal + matchingBiomeModifier(modifiers?.biome, biomes, biomeAggregation);
}

function matchingBiomeModifier(biomeModifiers = [], biomes = [], aggregation = 'strongestOfEach') {
  const activeBiomes = new Set((Array.isArray(biomes) ? biomes : []).map(normalizeTag).filter(Boolean));
  if (activeBiomes.size === 0) return 0;
  const values = normalizeDropConditionModifierList(biomeModifiers)
    .filter(modifier => activeBiomes.has(normalizeTag(modifier.conditionId)))
    .map(modifier => (modifier.operator === '-' ? -modifier.value : modifier.value));
  return aggregateBiomeModifierValues(values, aggregation);
}

function aggregateBiomeModifierValues(values = [], aggregation = 'strongestOfEach') {
  if (!Array.isArray(values) || values.length === 0) return 0;
  if (aggregation === 'cumulative') return values.reduce((sum, value) => sum + value, 0);
  if (aggregation === 'dominant') {
    return values.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, 0);
  }
  // strongestOfEach: largest boost plus largest penalty.
  const positives = values.filter(value => value > 0);
  const negatives = values.filter(value => value < 0);
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
    hazardSelectionMode: DROP_SELECTION_MODES.has(rules?.hazardSelectionMode)
      ? rules.hazardSelectionMode
      : DEFAULT_GATHERING_RULES.hazardSelectionMode,
    hazardLimit: positiveInteger(rules?.hazardLimit, DEFAULT_GATHERING_RULES.hazardLimit),
    hazardPolicy: HAZARD_POLICIES.has(rules?.hazardPolicy)
      ? rules.hazardPolicy
      : DEFAULT_GATHERING_RULES.hazardPolicy,
    toolBreakagePolicy: TOOL_BREAKAGE_POLICIES.has(rules?.toolBreakagePolicy)
      ? rules.toolBreakagePolicy
      : DEFAULT_GATHERING_RULES.toolBreakagePolicy,
    biomeModifierAggregation: BIOME_MODIFIER_AGGREGATIONS.has(rules?.biomeModifierAggregation)
      ? rules.biomeModifierAggregation
      : DEFAULT_GATHERING_RULES.biomeModifierAggregation
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
    hazardSelectionMode: LEGACY_DROP_SELECTION_MODES.has(environment?.hazardSelectionMode)
      ? environment.hazardSelectionMode
      : normalized.hazardSelectionMode,
    hazardLimit: positiveInteger(environment?.hazardLimit, normalized.hazardLimit),
    hazardPolicy: HAZARD_POLICIES.has(environment?.hazardPolicy)
      ? environment.hazardPolicy
      : normalized.hazardPolicy
  };
}

function selectDrops(drops, mode, limit = 1) {
  if (mode === 'allDrops') return drops.map(drop => cloneJson(drop));
  const ranked = drops
    .slice()
    .sort((left, right) => Number(left.rank) - Number(right.rank));
  if (mode === 'limitedDrops') return ranked.slice(0, positiveInteger(limit, 1)).map(drop => cloneJson(drop));
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
    .map(token => token.length <= 2 ? token.toUpperCase() : `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(' ');
}

function normalizeBiomeColorToken(value) {
  const token = String(value || '').trim().replace(/^--fab-tag-/, '');
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
    ? (rawLabel || defaultBiome?.label || vocabularyLabelFromId(id))
    : (defaultBiome?.label || vocabularyLabelFromId(id));
  if (kind === 'biomes') {
    return {
      id,
      label,
      icon: normalizeConditionIcon(isRecord ? (value.icon || defaultBiome?.icon || 'fas fa-tree') : (defaultBiome?.icon || 'fas fa-tree'), 'fas fa-tree'),
      colorToken: normalizeBiomeColorToken(isRecord ? (value.colorToken || defaultBiome?.colorToken || DEFAULT_BIOME_COLOR_TOKEN) : (defaultBiome?.colorToken || DEFAULT_BIOME_COLOR_TOKEN)),
      customColor: normalizeCustomHex(isRecord ? value.customColor : '')
    };
  }
  return { id, label };
}

function normalizeVocabularyOptions(kind, value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
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
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(normalizeTag).filter(Boolean)));
}

function normalizeTag(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeConditionIdList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(normalizeConditionId).filter(Boolean)));
}

function normalizeConditionId(value) {
  if (value && typeof value === 'object') {
    return normalizeConditionId(value.id ?? value.value ?? value.label);
  }
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeConditionIcon(icon, fallback) {
  const tokens = String(icon || '').trim().split(/\s+/).filter(Boolean);
  const prefix = tokens.find(token => /^(?:fa[bsrltd]?|fa-solid|fa-regular|fa-light|fa-thin|fa-duotone|fa-brands)$/.test(token)) || 'fas';
  const iconToken = tokens.findLast(token => token.startsWith('fa-') && !['fa', 'fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-brands'].includes(token));
  return iconToken ? `${prefix} ${iconToken}` : fallback;
}

function conditionLabelFromId(id) {
  return String(id || '')
    .split('-')
    .filter(Boolean)
    .map(token => token.length <= 2 ? token.toUpperCase() : `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
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
    label: isRecord ? (rawLabel || conditionLabelFromId(id)) : (/[A-Z]/.test(rawLabel) ? rawLabel : conditionLabelFromId(id)),
    icon: normalizeConditionIcon(isRecord ? value.icon : fallbackIcon, fallbackIcon)
  };
}

function normalizeConditionOptions(kind, value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
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

function hasAny(left, right) {
  const rightSet = new Set(right);
  return left.some(value => rightSet.has(value));
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

function attemptKey({ actor, environment, task, userId }) {
  const scope = task?.attemptLimit?.scope || 'actor';
  if (scope === 'global') return `global:${task?.id}`;
  if (scope === 'environment') return `environment:${environment?.id}:${task?.id}`;
  if (scope === 'user') return `user:${userId || 'unknown'}:${task?.id}`;
  if (scope === 'task') return `task:${task?.id}`;
  return `actor:${actor?.uuid || actor?.id || 'unknown'}:${task?.id}`;
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
  } catch (_err) {
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
      const ai = orderIndex.has(String(a.record?.id)) ? orderIndex.get(String(a.record?.id)) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(String(b.record?.id)) ? orderIndex.get(String(b.record?.id)) : Number.MAX_SAFE_INTEGER;
      return ai === bi ? a.index - b.index : ai - bi;
    })
    .map(entry => entry.record);
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
