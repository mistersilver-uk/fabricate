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
const TASK_SELECTION_MODES = new Set(['highestRankedDrop', 'allDrops']);
const HAZARD_SELECTION_MODES = new Set(['highestRankedDrop', 'allDrops']);
const HAZARD_POLICIES = new Set(['successWithHazard', 'failureWithHazard']);

const BLOCKED_REASON_KEYS = Object.freeze({
  NODE_DEPLETED: 'FABRICATE.Gathering.Blocked.NodeDepleted',
  ATTEMPT_LIMIT_EXHAUSTED: 'FABRICATE.Gathering.Blocked.AttemptLimitExhausted',
  STAMINA_BLOCKED: 'FABRICATE.Gathering.Blocked.StaminaBlocked'
});

/**
 * Owns additive rich-gathering state that is not part of result resolution:
 * node counts stored on environment tasks, actor-scoped stamina, attempt
 * counters, and blind task reveal evidence. The service is intentionally small
 * and side-effect explicit so GatheringEngine can keep history-before-effects
 * ordering.
 */
export class GatheringRichStateService {
  constructor({
    environmentStore = null,
    getSetting = null,
    setSetting = null,
    settingKey = 'gatheringConfig',
    nowWorldTime = () => Number(globalThis.game?.time?.worldTime || 0),
    getUserId = () => globalThis.game?.user?.id || null,
    rollD100 = () => Math.floor(Math.random() * 100) + 1,
    hooks = globalThis.Hooks ?? null
  } = {}) {
    this.environmentStore = environmentStore;
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.settingKey = settingKey;
    this.nowWorldTime = nowWorldTime;
    this.getUserId = getUserId;
    this.rollD100 = rollD100;
    this.hooks = hooks;
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
      const tag = normalizeTag(weather);
      if (!config.vocabularies.weather.includes(tag)) {
        throw new Error(`Unknown gathering weather tag: ${weather}`);
      }
      nextConditions.weather = tag;
    }
    if (timeOfDay !== undefined) {
      const tag = normalizeTag(timeOfDay);
      if (!config.vocabularies.timeOfDay.includes(tag)) {
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
    const config = this._config();
    const libraries = config.systems?.[String(system?.id || environment.craftingSystemId)] || {};
    const tasks = [
      ...normalizeList(environment.tasks),
      ...normalizeList(libraries.tasks)
        .filter(task => task?.enabled !== false)
        .filter(task => this._recordMatchesEnvironment(task, environment, config.conditions, { includeDanger: false }))
        .filter(task => this._environmentAllowsLibraryRecord(environment, task.id, 'task'))
        .map(task => this._libraryTaskToRuntimeTask(task))
    ];
    const hazards = normalizeList(libraries.hazards)
      .filter(hazard => hazard?.enabled !== false)
      .filter(hazard => this._recordMatchesEnvironment(hazard, environment, config.conditions, { includeDanger: true }))
      .filter(hazard => this._environmentAllowsLibraryRecord(environment, hazard.id, 'hazard'))
      .map(hazard => normalizeHazard(hazard));

    return {
      ...cloneJson(environment),
      conditions: cloneJson(config.conditions),
      biomes: normalizeTagList(environment.biomes ?? environment.biome),
      dangerTags: normalizeTagList(environment.dangerTags ?? environment.risk),
      tasks,
      hazards,
      hazardSelectionMode: HAZARD_SELECTION_MODES.has(environment.hazardSelectionMode) ? environment.hazardSelectionMode : 'allDrops',
      hazardPolicy: HAZARD_POLICIES.has(environment.hazardPolicy) ? environment.hazardPolicy : 'successWithHazard'
    };
  }

  resolveD100Attempt({ task, environment, gatheringModifier = 0, hazardModifier = 0 } = {}) {
    const itemRows = normalizeList(task?.dropRows ?? task?.itemDrops);
    const taskModifier = numericModifier(task?.gatheringModifier, gatheringModifier);
    const droppedItems = itemRows
      .filter(row => row?.enabled !== false)
      .map((row, index) => rollDropRow({
        row: normalizeItemDrop(row),
        index,
        roll: this.rollD100(),
        modifier: taskModifier
      }))
      .filter(result => result.dropped);
    const itemSelectionMode = TASK_SELECTION_MODES.has(task?.itemSelectionMode) ? task.itemSelectionMode : 'highestRankedDrop';
    const selectedItems = selectDrops(droppedItems, itemSelectionMode);

    const droppedHazards = normalizeList(environment?.hazards)
      .filter(hazard => hazard?.enabled !== false)
      .map((hazard, index) => rollDropRow({
        row: normalizeHazard(hazard),
        index,
        roll: this.rollD100(),
        modifier: numericModifier(hazard?.hazardModifier, hazardModifier)
      }))
      .filter(result => result.dropped);
    const hazardSelectionMode = HAZARD_SELECTION_MODES.has(environment?.hazardSelectionMode) ? environment.hazardSelectionMode : 'allDrops';
    const selectedHazards = selectDrops(droppedHazards, hazardSelectionMode);
    const hazardPolicy = HAZARD_POLICIES.has(environment?.hazardPolicy) ? environment.hazardPolicy : 'successWithHazard';

    return {
      status: selectedHazards.length > 0 && hazardPolicy === 'failureWithHazard' ? 'failed' : 'succeeded',
      items: selectedItems,
      hazards: selectedHazards,
      hazardPolicy
    };
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
      attemptLimit: null
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

  _recordMatchesEnvironment(record, environment, conditions, { includeDanger }) {
    const envRegion = normalizeTag(environment?.region);
    const envBiomes = normalizeTagList(environment?.biomes ?? environment?.biome);
    const envDanger = normalizeTagList(environment?.dangerTags ?? environment?.risk);
    if (record.region && normalizeTag(record.region) !== envRegion) return false;
    if (normalizeTagList(record.biomes).length > 0 && !hasAny(normalizeTagList(record.biomes), envBiomes)) return false;
    if (normalizeTagList(record.weather).length > 0 && !normalizeTagList(record.weather).includes(normalizeTag(conditions.weather))) return false;
    if (normalizeTagList(record.timeOfDay).length > 0 && !normalizeTagList(record.timeOfDay).includes(normalizeTag(conditions.timeOfDay))) return false;
    if (includeDanger && normalizeTagList(record.dangerTags).length > 0 && !hasAny(normalizeTagList(record.dangerTags), envDanger)) return false;
    return true;
  }

  _environmentAllowsLibraryRecord(environment, id, kind) {
    const enabledKey = kind === 'hazard' ? 'enabledHazardIds' : 'enabledTaskIds';
    const disabledKey = kind === 'hazard' ? 'disabledHazardIds' : 'disabledTaskIds';
    const enabled = normalizeList(environment?.[enabledKey]).map(String);
    const disabled = normalizeList(environment?.[disabledKey]).map(String);
    if (disabled.includes(String(id))) return false;
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
      catalysts: []
    };
    if (normalized.timeRequirement) runtimeTask.timeRequirement = cloneJson(normalized.timeRequirement);
    return runtimeTask;
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
  const weather = normalizeTag(raw?.conditions?.weather) || DEFAULT_CONDITIONS.weather;
  const timeOfDay = normalizeTag(raw?.conditions?.timeOfDay) || DEFAULT_CONDITIONS.timeOfDay;
  const systems = {};
  for (const [systemId, config] of Object.entries(raw?.systems || {})) {
    systems[String(systemId)] = {
      tasks: normalizeList(config?.tasks).map(normalizeLibraryTask),
      hazards: normalizeList(config?.hazards).map(normalizeHazard)
    };
  }
  return {
    vocabularies,
    conditions: {
      weather: vocabularies.weather.includes(weather) ? weather : DEFAULT_CONDITIONS.weather,
      timeOfDay: vocabularies.timeOfDay.includes(timeOfDay) ? timeOfDay : DEFAULT_CONDITIONS.timeOfDay
    },
    systems
  };
}

function normalizeLibraryTask(task = {}) {
  return {
    id: stringOrFallback(task.id, `task-${normalizeTag(task.name) || 'gather'}`),
    name: stringOrFallback(task.name, 'Gather'),
    description: stringOrFallback(task.description, ''),
    img: stringOrFallback(task.img, 'icons/svg/item-bag.svg'),
    enabled: task.enabled !== false,
    region: normalizeTag(task.region),
    biomes: normalizeTagList(task.biomes),
    weather: normalizeTagList(task.weather),
    timeOfDay: normalizeTagList(task.timeOfDay),
    itemSelectionMode: TASK_SELECTION_MODES.has(task.itemSelectionMode) ? task.itemSelectionMode : 'highestRankedDrop',
    dropRows: normalizeList(task.dropRows ?? task.itemDrops).map(normalizeItemDrop),
    staminaCost: nonNegativeNumber(task.staminaCost, 0),
    gatheringModifier: normalizeModifierProvider(task.gatheringModifier ?? task.modifier),
    timeRequirement: plainObjectOrNull(task.timeRequirement)
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
    enabled: row.enabled !== false
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
    region: normalizeTag(hazard.region),
    biomes: normalizeTagList(hazard.biomes),
    weather: normalizeTagList(hazard.weather),
    timeOfDay: normalizeTagList(hazard.timeOfDay),
    dropRate: clampDropRate(hazard.dropRate),
    hazardModifier: normalizeModifierProvider(hazard.hazardModifier ?? hazard.modifier)
  };
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

function rollDropRow({ row, index, roll, modifier }) {
  const effectiveRoll = Number(roll) + Number(modifier || 0);
  const threshold = 101 - Number(row.dropRate);
  return {
    ...cloneJson(row),
    rank: index,
    roll: Number(roll),
    modifier: Number(modifier || 0),
    effectiveRoll,
    threshold,
    dropped: effectiveRoll >= threshold
  };
}

function selectDrops(drops, mode) {
  if (mode === 'allDrops') return drops.map(drop => cloneJson(drop));
  const highest = drops
    .slice()
    .sort((left, right) => Number(left.rank) - Number(right.rank))[0];
  return highest ? [cloneJson(highest)] : [];
}

function seedVocabulary(raw, defaults) {
  const values = normalizeTagList(raw);
  return values.length > 0 ? values : [...defaults];
}

function normalizeTagList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(normalizeTag).filter(Boolean)));
}

function normalizeTag(value) {
  return String(value ?? '').trim().toLowerCase();
}

function hasAny(left, right) {
  const rightSet = new Set(right);
  return left.some(value => rightSet.has(value));
}

function clampDropRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(100, Math.max(1, Math.floor(number)));
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

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number(fallback || 0);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number(fallback || 0);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
