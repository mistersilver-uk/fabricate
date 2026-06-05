import { getSetting as defaultGetSetting, setSetting as defaultSetSetting, SETTING_KEYS } from '../config/settings.js';
import { validateGatheringDropReferencesSync } from './GatheringDropReferenceValidator.js';
import { DANGER_LEVELS, evaluateEnvironmentMatch, resolveEnvironmentDangerLevel } from './gatheringMatch.js';
import { normalizeNodeConfig, normalizeRespawn, normalizeNodeRuntime, VALID_DEPLETION_TIMINGS, VALID_RESPAWN_POLICIES } from './gatheringNodeConfig.js';

const DEFAULT_TASK_IMG = 'icons/svg/item-bag.svg';
const VALID_SELECTION_MODES = new Set(['targeted', 'blind']);
const VALID_COMPOSITION_MODES = new Set(['automatic', 'manual']);
const VALID_RESOLUTION_MODES = new Set(['progressive', 'routed', 'd100']);
const VALID_RESULT_SELECTION_PROVIDERS = new Set(['macroOutcome', 'rollTableOutcome']);
const VALID_CHECK_PROVIDERS = new Set(['dnd5e', 'pf2e', 'macro']);
const VALID_PROGRESSIVE_AWARD_MODES = new Set(['partial', 'equal', 'exceed']);
const VALID_RISK_LEVELS = new Set(['safe', 'hazardous', 'unsafe', 'extreme']);
const VALID_CHARACTER_MODIFIER_OPERATORS = new Set(['+', '-']);
const VALID_REVEAL_SCOPES = new Set(['actor', 'user', 'party', 'global']);
const TIME_UNITS = ['minutes', 'hours', 'days', 'months', 'years'];

export const GATHERING_FAILURE_KEYWORDS = Object.freeze([
  'f',
  'fail',
  'failed',
  'failure',
  'miss',
  'missed',
  'm',
  'none',
  'nothing',
  'whiff',
  'whiffed',
  'hazard',
  'danger',
  'complication',
  'trap',
  'oops'
]);

const FAILURE_KEYWORDS = new Set(GATHERING_FAILURE_KEYWORDS);

export class GatheringEnvironmentValidationError extends Error {
  constructor(errors = []) {
    super(`Gathering environment validation failed: ${errors.join('; ')}`);
    this.name = 'GatheringEnvironmentValidationError';
    this.errors = errors;
  }
}

/**
 * Persists and validates GM-authored gathering environments.
 *
 * The store owns canonical normalization for environment/task result,
 * catalyst, routed result-selection, progressive, provider-check,
 * `timeRequirement`, and `failureOutcome` records. Disabled tasks may persist
 * incomplete routed/progressive provider targets, but any present
 * `timeRequirement` or `failureOutcome` still validates. Draft UIs may keep
 * nullable catalyst `maxUses` values, but saves reject blank catalyst
 * `componentId` values and reject invalid `maxUses` only when `degradesOnUse`
 * is enabled. Validation failures throw before persistence, leaving callers'
 * draft state intact; UI layers are responsible for mapping error strings to
 * inline field targets and summary links.
 */
export class GatheringEnvironmentStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    systemManager = null,
    getSystems = null,
    randomID = null,
    runCleanup = null
  } = {}) {
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.systemManager = systemManager;
    this.getSystems = getSystems;
    this.randomID = randomID || (() => foundry.utils.randomID());
    this.runCleanup = runCleanup;
    this.environments = [];
    this.loaded = false;
  }

  load() {
    const saved = this.getSetting(SETTING_KEYS.GATHERING_ENVIRONMENTS);
    this.environments = this._normalizeEnvironmentList(saved);
    this.loaded = true;
    return cloneJson(this.environments);
  }

  list() {
    this._ensureLoaded();
    return cloneJson(this.environments);
  }

  get(environmentId) {
    this._ensureLoaded();
    const environment = this.environments.find(env => env.id === environmentId);
    return environment ? cloneJson(environment) : null;
  }

  listBySystem(systemId, { includeDisabledFeature = true } = {}) {
    this._ensureLoaded();
    const system = this._getSystem(systemId);
    if (!includeDisabledFeature && system?.features?.gathering !== true) {
      return [];
    }
    return cloneJson(this.environments.filter(env => env.craftingSystemId === systemId));
  }

  async save(environments = null) {
    if (environments === null) {
      this._ensureLoaded();
      return this._persistEnvironmentList(this.environments);
    }

    return this._persistEnvironmentList(environments);
  }

  async _persistEnvironmentList(environments) {
    const original = Array.isArray(environments) ? cloneJson(environments) : [];
    const normalized = this._normalizeEnvironmentList(original);
    const errors = this._validateAll(normalized, original);
    if (errors.length > 0) {
      throw new GatheringEnvironmentValidationError(errors);
    }

    const payload = cloneJson(normalized);
    await this.setSetting(SETTING_KEYS.GATHERING_ENVIRONMENTS, payload);
    this.environments = normalized;
    this.loaded = true;
    return cloneJson(payload);
  }

  validate(environment) {
    const errors = this._validateEnvironment(environment);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async create(data = {}) {
    this._ensureLoaded();
    const environment = this._normalizeEnvironment(data, { freshEnvironmentId: !data?.id });
    const errors = this._validateEnvironment(environment, data);
    if (errors.length > 0) {
      throw new GatheringEnvironmentValidationError(errors);
    }
    await this._persistEnvironmentList([...this.environments, environment]);
    return cloneJson(environment);
  }

  async update(environmentId, patch = {}) {
    this._ensureLoaded();
    const index = this.environments.findIndex(env => env.id === environmentId);
    if (index < 0) return null;
    const previousTaskIds = new Set((this.environments[index].tasks || []).map(task => task.id));

    const merged = {
      ...this.environments[index],
      ...cloneJson(patch),
      id: environmentId
    };
    const environment = this._normalizeEnvironment(merged);
    const errors = this._validateEnvironment(environment, merged);
    if (errors.length > 0) {
      throw new GatheringEnvironmentValidationError(errors);
    }
    await this._persistEnvironmentList(replaceAt(this.environments, index, environment));
    const nextTaskIds = new Set((environment.tasks || []).map(task => task.id));
    const removedTaskIds = Array.from(previousTaskIds).filter(taskId => !nextTaskIds.has(taskId));
    for (const taskId of removedTaskIds) {
      await this._removeRunsForTask(taskId, { environmentId });
    }
    return cloneJson(environment);
  }

  async duplicate(environmentId, overrides = {}) {
    this._ensureLoaded();
    const source = this.environments.find(env => env.id === environmentId);
    if (!source) return null;

    const duplicate = this._normalizeEnvironment({
      ...cloneJson(source),
      ...cloneJson(overrides),
      id: this.randomID(),
      nodeRuntime: {}, // a copy starts with full pools (task ids are reissued anyway)
      tasks: source.tasks.map(task => ({
        ...cloneJson(task),
        id: this.randomID()
      }))
    });
    const errors = this._validateEnvironment(duplicate);
    if (errors.length > 0) {
      throw new GatheringEnvironmentValidationError(errors);
    }
    await this._persistEnvironmentList([...this.environments, duplicate]);
    return cloneJson(duplicate);
  }

  async reorder(systemId, orderedEnvironmentIds = []) {
    this._ensureLoaded();
    const orderedIds = Array.isArray(orderedEnvironmentIds) ? orderedEnvironmentIds : [];
    const byId = new Map(this.environments.map(env => [env.id, env]));
    const systemIds = new Set(this.environments.filter(env => env.craftingSystemId === systemId).map(env => env.id));
    const emitted = new Set();
    const reorderedSystemEnvironments = [];

    for (const id of orderedIds) {
      if (!systemIds.has(id) || emitted.has(id)) continue;
      reorderedSystemEnvironments.push(byId.get(id));
      emitted.add(id);
    }

    for (const env of this.environments) {
      if (env.craftingSystemId !== systemId) continue;
      if (emitted.has(env.id)) continue;
      reorderedSystemEnvironments.push(env);
      emitted.add(env.id);
    }

    const queue = [...reorderedSystemEnvironments];
    const reordered = this.environments.map(env => {
      if (env.craftingSystemId !== systemId) return env;
      return queue.shift();
    });
    await this._persistEnvironmentList(reordered);
    return this.listBySystem(systemId);
  }

  async delete(environmentId) {
    this._ensureLoaded();
    const environment = this.environments.find(env => env.id === environmentId);
    if (!environment) return false;

    const candidate = this.environments.filter(env => env.id !== environmentId);
    await this._persistEnvironmentList(candidate);
    await this._removeRunsForEnvironment(environmentId);
    return true;
  }

  async deleteTask(environmentId, taskId) {
    this._ensureLoaded();
    const index = this.environments.findIndex(env => env.id === environmentId);
    if (index < 0) return false;
    const environment = this.environments[index];
    if (!environment.tasks.some(task => task.id === taskId)) return false;

    const nextEnvironment = {
      ...environment,
      tasks: environment.tasks.filter(task => task.id !== taskId)
    };
    const candidate = replaceAt(this.environments, index, nextEnvironment);
    await this._persistEnvironmentList(candidate);
    await this._removeRunsForTask(taskId, { environmentId });
    return true;
  }

  async cleanupByCraftingSystem(systemId) {
    this._ensureLoaded();
    const before = this.environments.length;
    const candidate = this.environments.filter(env => env.craftingSystemId !== systemId);
    if (candidate.length === before) return false;

    await this._persistEnvironmentList(candidate);
    await this._removeRunsForSystem(systemId);
    return true;
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
  }

  _normalizeEnvironmentList(raw) {
    const records = Array.isArray(raw) ? raw : [];
    return records.map(record => this._normalizeEnvironment(record));
  }

  _normalizeEnvironment(data = {}, { freshEnvironmentId = false } = {}) {
    const selectionMode = VALID_SELECTION_MODES.has(data?.selectionMode) ? data.selectionMode : 'targeted';
    const compositionMode = VALID_COMPOSITION_MODES.has(data?.compositionMode) ? data.compositionMode : 'automatic';
    const blindSelection = normalizeBlindSelection(data?.blindSelection);
    const forcedTaskIds = normalizeIdList(data?.forcedTaskIds);
    const forcedHazardIds = normalizeIdList(data?.forcedHazardIds);
    return {
      id: freshEnvironmentId || !data?.id ? this.randomID() : String(data.id),
      craftingSystemId: stringOrEmpty(data?.craftingSystemId),
      name: trimmedOrDefault(data?.name, 'New Gathering Environment'),
      description: stringOrEmpty(data?.description),
      img: normalizeOptionalString(data?.img),
      region: stringOrEmpty(data?.region),
      biome: stringOrEmpty(data?.biome),
      biomes: normalizeStringList(data?.biomes ?? data?.biome),
      dangerTags: normalizeStringList(data?.dangerTags ?? data?.risk),
      dangerLevel: resolveEnvironmentDangerLevel(data),
      risk: VALID_RISK_LEVELS.has(data?.risk) ? data.risk : 'safe',
      conditions: normalizeConditions(data?.conditions),
      chatMessages: normalizeChatMessages(data?.chatMessages),
      enabled: data?.enabled !== false,
      selectionMode,
      compositionMode,
      sceneUuid: normalizeOptionalString(data?.sceneUuid),
      enabledTaskIds: normalizeIdList(data?.enabledTaskIds),
      disabledTaskIds: normalizeIdList(data?.disabledTaskIds),
      enabledHazardIds: normalizeIdList(data?.enabledHazardIds),
      disabledHazardIds: normalizeIdList(data?.disabledHazardIds),
      taskOrder: normalizeIdList(data?.taskOrder),
      hazardOrder: normalizeIdList(data?.hazardOrder),
      taskDropRateAdjustments: normalizeTaskDropRateAdjustments(data?.taskDropRateAdjustments),
      taskDropRateAdjustmentsEnabled: normalizeTaskDropRateAdjustmentsEnabled(data?.taskDropRateAdjustmentsEnabled),
      hazardDropRateAdjustments: normalizeDropRateAdjustmentMap(data?.hazardDropRateAdjustments),
      hazardDropRateAdjustmentsEnabled: normalizeHazardDropRateAdjustmentsEnabled(data?.hazardDropRateAdjustmentsEnabled),
      hazardSelectionMode: ['highestRankedDrop', 'allDrops'].includes(data?.hazardSelectionMode) ? data.hazardSelectionMode : 'allDrops',
      hazardPolicy: ['successWithHazard', 'failureWithHazard'].includes(data?.hazardPolicy) ? data.hazardPolicy : 'successWithHazard',
      ...(blindSelection ? { blindSelection } : {}),
      ...(forcedTaskIds.length > 0 ? { forcedTaskIds } : {}),
      ...(forcedHazardIds.length > 0 ? { forcedHazardIds } : {}),
      tasks: Array.isArray(data?.tasks) ? data.tasks.map(task => this._normalizeTask(task)) : [],
      // Per-environment node runtime state (taskId → node object), so a library
      // task's resource nodes deplete/respawn independently in each environment.
      nodeRuntime: normalizeNodeRuntime(data?.nodeRuntime)
    };
  }

  _normalizeTask(data = {}) {
    const resolutionMode = VALID_RESOLUTION_MODES.has(data?.resolutionMode) ? data.resolutionMode : 'routed';
    const resultSelection = this._normalizeResultSelection(data?.resultSelection);
    const progressive = this._normalizeProgressive(data?.progressive);
    const visibility = this._normalizeProviderConfig(data?.visibility, { thresholdRequired: true });
    const check = this._normalizeProviderConfig(data?.check, { thresholdRequired: false });
    const timeRequirement = this._normalizeTimeRequirement(data?.timeRequirement);
    const failureOutcome = this._normalizeFailureOutcome(data?.failureOutcome);

    const task = {
      id: data?.id ? String(data.id) : this.randomID(),
      name: trimmedOrDefault(data?.name, 'Gather'),
      description: stringOrEmpty(data?.description),
      img: normalizeOptionalString(data?.img) || DEFAULT_TASK_IMG,
      enabled: data?.enabled !== false,
      resolutionMode,
      itemSelectionMode: ['highestRankedDrop', 'allDrops'].includes(data?.itemSelectionMode) ? data.itemSelectionMode : 'highestRankedDrop',
      dropRows: Array.isArray(data?.dropRows ?? data?.itemDrops) ? (data.dropRows ?? data.itemDrops).map(row => normalizeDropRow(row, this.randomID)) : [],
      catalysts: Array.isArray(data?.catalysts) ? data.catalysts.map(catalyst => normalizeCatalyst(catalyst)) : [],
      tools: Array.isArray(data?.tools) ? data.tools.map(tool => normalizeTool(tool)) : [],
      resultGroups: Array.isArray(data?.resultGroups) ? data.resultGroups.map(group => this._normalizeResultGroup(group)) : []
    };

    const nodes = normalizeNodeConfig(data?.nodes);
    const reveal = normalizeRevealConfig(data?.reveal);
    const encounters = normalizeEncounterConfig(data?.encounters);
    const chatMessages = normalizeChatMessages(data?.chatMessages);
    const staminaCostModifiers = normalizeStaminaCostModifiers(data?.staminaCostModifiers);
    if (nodes) task.nodes = nodes;
    if (Number.isFinite(Number(data?.staminaCost)) && Number(data.staminaCost) > 0) task.staminaCost = Number(data.staminaCost);
    if (staminaCostModifiers.length > 0) task.staminaCostModifiers = staminaCostModifiers;
    if (VALID_RISK_LEVELS.has(data?.riskOverride)) task.riskOverride = data.riskOverride;
    if (reveal) task.reveal = reveal;
    if (encounters) task.encounters = encounters;
    if (chatMessages) task.chatMessages = chatMessages;
    if (visibility) task.visibility = visibility;
    if (timeRequirement) task.timeRequirement = timeRequirement;
    if (check) task.check = check;
    if (resultSelection) task.resultSelection = resultSelection;
    if (progressive) task.progressive = progressive;
    if (failureOutcome) task.failureOutcome = failureOutcome;

    return task;
  }

  _normalizeResultSelection(data = null) {
    if (!data || typeof data !== 'object') return null;
    const provider = stringOrEmpty(data.provider);
    return {
      provider,
      macroUuid: normalizeOptionalString(data.macroUuid),
      rollTableUuid: normalizeOptionalString(data.rollTableUuid)
    };
  }

  _normalizeProgressive(data = null) {
    if (!data || typeof data !== 'object') return null;
    return {
      awardMode: VALID_PROGRESSIVE_AWARD_MODES.has(data.awardMode) ? data.awardMode : 'equal'
    };
  }

  _normalizeProviderConfig(data = null) {
    if (!data || typeof data !== 'object') return null;
    return {
      provider: stringOrEmpty(data.provider),
      formula: normalizeOptionalString(data.formula),
      threshold: normalizeOptionalString(data.threshold),
      macroUuid: normalizeOptionalString(data.macroUuid)
    };
  }

  _normalizeTimeRequirement(data = null) {
    if (!data || typeof data !== 'object') return null;
    return TIME_UNITS.reduce((normalized, unit) => {
      const raw = data[unit];
      normalized[unit] = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
      return normalized;
    }, {});
  }

  _normalizeFailureOutcome(data = null) {
    if (!data || typeof data !== 'object') return null;
    const mode = stringOrEmpty(data.mode);
    return {
      mode,
      text: normalizeOptionalString(data.text),
      macroUuid: normalizeOptionalString(data.macroUuid)
    };
  }

  _normalizeResultGroup(data = {}) {
    return {
      id: data?.id ? String(data.id) : this.randomID(),
      name: trimmedOrDefault(data?.name, 'Result Group'),
      results: Array.isArray(data?.results) ? data.results.map(result => normalizeResult(result, this.randomID)) : []
    };
  }

  _validateAll(environments, originals = environments) {
    return environments.flatMap((environment, index) => this._validateEnvironment(
      environment,
      Array.isArray(originals) ? originals[index] : environment
    ));
  }

  _validateEnvironment(environment, original = environment) {
    const normalized = this._normalizeEnvironment(environment);
    const errors = [];
    const label = normalized.name || normalized.id;

    if (!normalized.craftingSystemId) {
      errors.push(`Environment "${label}" is missing craftingSystemId`);
    } else if (!this._getSystem(normalized.craftingSystemId)) {
      errors.push(`Environment "${label}" references unresolved craftingSystemId "${normalized.craftingSystemId}"`);
    }

    if (!VALID_SELECTION_MODES.has(original?.selectionMode)) {
      errors.push(`Environment "${label}" selectionMode must be targeted or blind`);
    }

    if (original?.compositionMode !== undefined && !VALID_COMPOSITION_MODES.has(original.compositionMode)) {
      errors.push(`Environment "${label}" compositionMode must be automatic or manual`);
    }

    if (original?.dangerLevel !== undefined && !DANGER_LEVELS.includes(original.dangerLevel)) {
      errors.push(`Environment "${label}" dangerLevel must be one of: ${DANGER_LEVELS.join(', ')}`);
    }

    errors.push(...validateTaskDropRateAdjustments(original?.taskDropRateAdjustments, `Environment "${label}" taskDropRateAdjustments`));
    errors.push(...validateTaskDropRateAdjustmentsEnabled(original?.taskDropRateAdjustmentsEnabled, `Environment "${label}" taskDropRateAdjustmentsEnabled`));
    errors.push(...validateDropRateAdjustmentMap(original?.hazardDropRateAdjustments, `Environment "${label}" hazardDropRateAdjustments`));
    errors.push(...validateHazardDropRateAdjustmentsEnabled(original?.hazardDropRateAdjustmentsEnabled, `Environment "${label}" hazardDropRateAdjustmentsEnabled`));

    const hasTaskSource = this._environmentHasTaskSource(normalized);
    if (normalized.selectionMode === 'targeted' && !hasTaskSource) {
      errors.push(`Environment "${label}" targeted selection requires at least one task`);
    }
    if (normalized.selectionMode === 'blind' && !hasTaskSource) {
      errors.push(`Environment "${label}" blind selection requires at least one task`);
    }
    if (!VALID_RISK_LEVELS.has(original?.risk ?? normalized.risk)) {
      errors.push(`Environment "${label}" risk must be safe, hazardous, unsafe, or extreme`);
    }
    errors.push(...validateConditions(normalized.conditions, `Environment "${label}" conditions`));

    normalized.tasks.forEach((task, index) => {
      const originalTask = Array.isArray(original?.tasks) ? original.tasks[index] : task;
      errors.push(...this._validateTask(task, {
        originalTask,
        environment: normalized,
        index
      }));
    });

    return errors;
  }

  _validateTask(task, { originalTask = task, environment, index = 0 } = {}) {
    const errors = [];
    const label = task.name || task.id || `Task ${index + 1}`;

    if (hasOwn(originalTask, 'IngredientSet') || hasOwn(originalTask, 'ingredientSet') || hasOwn(originalTask, 'ingredientSets')) {
      errors.push(`Task "${label}" must not use IngredientSet or ingredientSet configuration`);
    }

    if (!VALID_RESOLUTION_MODES.has(originalTask?.resolutionMode)) {
      errors.push(`Task "${label}" resolutionMode must be progressive, routed, or d100`);
    }

    errors.push(...this._validateProviderConfig(task.visibility, {
      label: `Task "${label}" visibility`,
      thresholdRequired: true
    }));

    if (task.timeRequirement) {
      errors.push(...validateTimeRequirement(task.timeRequirement, `Task "${label}"`));
    }

    errors.push(...validateCatalysts(task.catalysts, `Task "${label}"`, originalTask?.catalysts));
    errors.push(...validateTools(task.tools, `Task "${label}"`, originalTask?.tools));
    if (task.resolutionMode !== 'd100') {
      errors.push(...validateResultGroupNames(task.resultGroups, `Task "${label}"`));
    }

    if (task.failureOutcome) {
      errors.push(...validateFailureOutcome(task.failureOutcome, `Task "${label}" failureOutcome`));
    }
    errors.push(...validateNodeConfig(task.nodes, `Task "${label}" nodes`));
    if (hasOwn(originalTask, 'staminaCost')) {
      const staminaCost = Number(originalTask?.staminaCost);
      if (!Number.isFinite(staminaCost) || staminaCost < 0) {
        errors.push(`Task "${label}" staminaCost must be a non-negative number`);
      }
    }
    errors.push(...validateStaminaCostModifiers(task.staminaCostModifiers, `Task "${label}" staminaCostModifiers`));
    if (task.riskOverride && !VALID_RISK_LEVELS.has(task.riskOverride)) {
      errors.push(`Task "${label}" riskOverride must be safe, hazardous, unsafe, or extreme`);
    }
    errors.push(...validateRevealConfig(task.reveal, `Task "${label}" reveal`));

    if (task.enabled !== true) {
      return errors;
    }

    if (task.resolutionMode === 'd100') {
      errors.push(...validateDropRows(originalTask?.dropRows ?? originalTask?.itemDrops, `Task "${label}"`, {
        system: this._getSystem(environment?.craftingSystemId),
        systemId: environment?.craftingSystemId,
        validateDisabledRows: true
      }));
    }

    if (task.resolutionMode === 'routed') {
      errors.push(...this._validateRoutedTask(task, label));
    }

    if (task.resolutionMode === 'progressive') {
      errors.push(...this._validateProgressiveTask(task, {
        label,
        craftingSystemId: environment?.craftingSystemId,
        originalTask
      }));
    }

    return errors;
  }

  _validateRoutedTask(task, label) {
    const errors = [];
    if (!task.resultSelection || typeof task.resultSelection !== 'object') {
      errors.push(`Task "${label}" routed resolution requires resultSelection`);
    } else {
      const provider = task.resultSelection.provider;
      if (!VALID_RESULT_SELECTION_PROVIDERS.has(provider)) {
        errors.push(`Task "${label}" resultSelection.provider must be macroOutcome or rollTableOutcome`);
      }
      if (provider === 'macroOutcome' && !task.resultSelection.macroUuid) {
        errors.push(`Task "${label}" macroOutcome provider requires macroUuid`);
      }
      if (provider === 'rollTableOutcome' && !task.resultSelection.rollTableUuid) {
        errors.push(`Task "${label}" rollTableOutcome provider requires rollTableUuid`);
      }
    }
    if (!Array.isArray(task.resultGroups) || task.resultGroups.length < 1) {
      errors.push(`Task "${label}" routed resolution requires at least one result group`);
    }
    return errors;
  }

  _validateProgressiveTask(task, { label, craftingSystemId, originalTask = task }) {
    const errors = [];
    if (!task.check) {
      errors.push(`Task "${label}" progressive resolution requires check`);
    } else {
      errors.push(...this._validateProviderConfig(task.check, {
        label: `Task "${label}" check`,
        thresholdRequired: false
      }));
    }
    if (!task.progressive) {
      errors.push(`Task "${label}" progressive resolution requires progressive config`);
    } else if (
      !VALID_PROGRESSIVE_AWARD_MODES.has(task.progressive.awardMode) ||
      !VALID_PROGRESSIVE_AWARD_MODES.has(originalTask?.progressive?.awardMode)
    ) {
      errors.push(`Task "${label}" progressive.awardMode must be partial, equal, or exceed`);
    }
    if (!Array.isArray(task.resultGroups) || task.resultGroups.length !== 1) {
      errors.push(`Task "${label}" progressive resolution requires exactly one result group`);
      return errors;
    }

    const [group] = task.resultGroups;
    if (!Array.isArray(group.results) || group.results.length < 1) {
      errors.push(`Task "${label}" progressive result group requires at least one result`);
      return errors;
    }

    for (const result of group.results) {
      errors.push(...this._validateProgressiveResultDifficulty(craftingSystemId, result, label));
    }
    return errors;
  }

  _validateProviderConfig(config, { label, thresholdRequired }) {
    if (!config) return [];
    const errors = [];
    if (!VALID_CHECK_PROVIDERS.has(config.provider)) {
      errors.push(`${label} provider must be dnd5e, pf2e, or macro`);
      return errors;
    }
    if (config.provider === 'macro') {
      if (!config.macroUuid) errors.push(`${label} macro provider requires macroUuid`);
      return errors;
    }
    if (!config.formula) {
      errors.push(`${label} ${config.provider} provider requires formula`);
    }
    if (thresholdRequired && !config.threshold) {
      errors.push(`${label} ${config.provider} provider requires threshold`);
    }
    return errors;
  }

  _validateProgressiveResultDifficulty(craftingSystemId, result, label) {
    if (!result?.componentId) {
      return [`Task "${label}" progressive result "${result.id}" requires componentId with difficulty`];
    }

    const item = this._getSystemItem(craftingSystemId, result.componentId);
    if (!item) {
      return [`Task "${label}" progressive result "${result.id}" references unresolved componentId "${result.componentId}" for difficulty`];
    }
    if (!hasOwn(item, 'difficulty')) {
      return [`Task "${label}" progressive result "${result.id}" component "${result.componentId}" has no difficulty`];
    }

    const difficulty = Number(item.difficulty);
    if (Number.isFinite(difficulty) && difficulty >= 1) return [];
    return [`Task "${label}" progressive result "${result.id}" requires difficulty >= 1`];
  }

  _getSystem(systemId) {
    if (!systemId) return null;
    if (this.systemManager?.getSystem) return this.systemManager.getSystem(systemId);
    const systems = this._getSystems();
    return systems.find(system => system?.id === systemId) || null;
  }

  _environmentHasTaskSource(environment) {
    if (environment.tasks.length > 0) return true;
    if (environment.enabledTaskIds.length > 0) return true;
    if (environment.compositionMode === 'manual' && normalizeIdList(environment.forcedTaskIds).length > 0) return true;
    if (environment.compositionMode !== 'automatic') return false;
    return this._hasMatchingLibraryTask(environment);
  }

  _hasMatchingLibraryTask(environment) {
    return this._getGatheringLibraryTasks(environment.craftingSystemId)
      .some(task => task?.enabled !== false
        && evaluateEnvironmentMatch(task, environment, {}, { includeDanger: false }).matches);
  }

  _getGatheringLibraryTasks(systemId) {
    if (!systemId) return [];
    const config = this.getSetting?.(SETTING_KEYS.GATHERING_CONFIG);
    const tasks = config?.systems?.[systemId]?.tasks;
    return Array.isArray(tasks) ? tasks : [];
  }

  _getSystems() {
    const raw = typeof this.getSystems === 'function'
      ? this.getSystems()
      : (this.systemManager?.getSystems ? this.systemManager.getSystems() : []);
    if (raw instanceof Map) return Array.from(raw.values());
    return Array.isArray(raw) ? raw : [];
  }

  _getSystemItem(systemId, componentId) {
    if (!systemId || !componentId) return null;
    if (this.systemManager?.getItems) {
      return this.systemManager.getItems(systemId).find(item => item?.id === componentId) || null;
    }
    const system = this._getSystem(systemId);
    const items = Array.isArray(system?.components) ? system.components : [];
    return items.find(item => item?.id === componentId) || null;
  }

  async _removeRunsForSystem(systemId) {
    if (typeof this.runCleanup?.removeRunsForSystem === 'function') {
      await this.runCleanup.removeRunsForSystem(systemId);
    }
  }

  async _removeRunsForEnvironment(environmentId) {
    if (typeof this.runCleanup?.removeRunsForEnvironment === 'function') {
      await this.runCleanup.removeRunsForEnvironment(environmentId);
    }
  }

  async _removeRunsForTask(taskId, options = {}) {
    if (typeof this.runCleanup?.removeRunsForTask === 'function') {
      await this.runCleanup.removeRunsForTask(taskId, options);
    }
  }
}

function normalizeCatalyst(data = {}) {
  const maxUses = data?.maxUses === null || data?.maxUses === undefined || data?.maxUses === ''
    ? null
    : Number(data.maxUses);
  return {
    componentId: normalizeOptionalString(data?.componentId ?? data?.systemItemId),
    degradesOnUse: data?.degradesOnUse === true,
    destroyWhenExhausted: data?.destroyWhenExhausted === true,
    maxUses: Number.isFinite(maxUses) ? maxUses : null
  };
}

function validateCatalysts(catalysts, label, originalCatalysts = catalysts) {
  if (!Array.isArray(catalysts)) return [];
  const errors = [];
  catalysts.forEach((catalyst, index) => {
    const catalystLabel = `${label} catalyst ${index + 1}`;
    const original = Array.isArray(originalCatalysts) ? originalCatalysts[index] : catalyst;
    const rawMaxUses = original?.maxUses ?? catalyst?.maxUses;
    const maxUsesIsSet = rawMaxUses !== null && rawMaxUses !== undefined && rawMaxUses !== '';
    const maxUses = maxUsesIsSet ? Number(rawMaxUses) : null;

    if (!catalyst?.componentId) {
      errors.push(`${catalystLabel} requires componentId`);
    }

    if (
      catalyst?.degradesOnUse === true &&
      maxUsesIsSet &&
      (!Number.isInteger(maxUses) || maxUses < 1)
    ) {
      errors.push(`${catalystLabel} maxUses must be a positive integer when set`);
    }
  });
  return errors;
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
  const numericThreshold = Number(input?.threshold);
  return {
    mode,
    formula: typeof input?.formula === 'string' ? input.formula : '',
    threshold: Number.isFinite(numericThreshold) ? numericThreshold : 0
  };
}

function normalizeToolOnBreak(input) {
  const mode = TOOL_ON_BREAK_MODES.has(input?.mode) ? input.mode : 'destroy';
  if (mode === 'replaceWith') {
    return {
      mode,
      replacementComponentId: typeof input?.replacementComponentId === 'string' ? input.replacementComponentId : null
    };
  }
  return { mode };
}

function normalizeTool(data = {}) {
  return {
    componentId: normalizeOptionalString(data?.componentId ?? data?.systemItemId),
    requirement: data?.requirement === undefined ? null : normalizeToolRequirement(data?.requirement),
    breakage: normalizeToolBreakage(data?.breakage),
    onBreak: normalizeToolOnBreak(data?.onBreak)
  };
}

function validateTools(tools, label, originalTools = tools) {
  if (!Array.isArray(tools)) return [];
  const errors = [];
  tools.forEach((tool, index) => {
    const toolLabel = `${label} tool ${index + 1}`;
    const original = Array.isArray(originalTools) ? originalTools[index] : tool;

    if (!tool?.componentId) {
      errors.push(`${toolLabel} requires componentId`);
    }

    if (tool?.requirement) {
      const provider = tool.requirement.provider;
      if (!TOOL_REQUIREMENT_PROVIDERS.has(provider)) {
        errors.push(`${toolLabel} requirement.provider must be dnd5e, pf2e, or macro`);
      } else if (provider === 'macro') {
        if (!tool.requirement.macroUuid) {
          errors.push(`${toolLabel} requirement.macroUuid is required when provider is macro`);
        }
      } else if (!tool.requirement.formula) {
        errors.push(`${toolLabel} requirement.formula is required for system providers`);
      }
    }

    const mode = tool?.breakage?.mode;
    if (!TOOL_BREAKAGE_MODES.has(mode)) {
      errors.push(`${toolLabel} breakage.mode must be limitedUses, breakageChance, or diceExpression`);
    } else if (mode === 'limitedUses') {
      const rawMaxUses = original?.breakage?.maxUses ?? tool?.breakage?.maxUses;
      const isSet = rawMaxUses !== null && rawMaxUses !== undefined && rawMaxUses !== '';
      if (isSet) {
        const numeric = Number(rawMaxUses);
        if (!Number.isInteger(numeric) || numeric < 1) {
          errors.push(`${toolLabel} breakage.maxUses must be null or a positive integer`);
        }
      }
    } else if (mode === 'breakageChance') {
      const value = tool.breakage.breakageChance;
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        errors.push(`${toolLabel} breakage.breakageChance must be an integer between 0 and 100`);
      }
    } else if (mode === 'diceExpression') {
      if (!tool.breakage.formula) {
        errors.push(`${toolLabel} breakage.formula is required for diceExpression mode`);
      }
      if (!Number.isFinite(tool.breakage.threshold)) {
        errors.push(`${toolLabel} breakage.threshold must be a finite number`);
      }
    }

    const onBreakMode = tool?.onBreak?.mode;
    if (!TOOL_ON_BREAK_MODES.has(onBreakMode)) {
      errors.push(`${toolLabel} onBreak.mode must be destroy, flagBroken, or replaceWith`);
    } else if (onBreakMode === 'replaceWith') {
      if (!tool.onBreak.replacementComponentId) {
        errors.push(`${toolLabel} onBreak.replacementComponentId is required for replaceWith mode`);
      } else if (tool.onBreak.replacementComponentId === tool.componentId) {
        errors.push(`${toolLabel} onBreak.replacementComponentId must differ from componentId`);
      }
    }
  });
  return errors;
}

function normalizeResult(data = {}, randomID) {
  return {
    id: data?.id ? String(data.id) : randomID(),
    componentId: normalizeOptionalString(data?.componentId ?? data?.systemItemId),
    itemUuid: normalizeOptionalString(data?.itemUuid),
    quantity: Number.isFinite(Number(data?.quantity)) && Number(data.quantity) > 0 ? Number(data.quantity) : 1,
    propertyMacroUuid: normalizeOptionalString(data?.propertyMacroUuid)
  };
}

function normalizeDropRow(data = {}, randomID) {
  return {
    id: data?.id ? String(data.id) : randomID(),
    name: stringOrEmpty(data?.name),
    componentId: normalizeOptionalString(data?.componentId ?? data?.systemItemId),
    itemUuid: normalizeOptionalString(data?.itemUuid),
    quantity: Number.isFinite(Number(data?.quantity)) && Number(data.quantity) > 0 ? Number(data.quantity) : 1,
    dropRate: data?.dropRate === undefined || data?.dropRate === null || data?.dropRate === '' ? 1 : Number(data.dropRate),
    enabled: data?.enabled !== false
  };
}

export function validateDropRows(rows, label, {
  system = null,
  systemId = '',
  validateDisabledRows = false,
  requireAtLeastOneEnabled = true,
  resolveUuid
} = {}) {
  const entries = Array.isArray(rows) ? rows.filter(row => row?.enabled !== false) : [];
  const errors = [];
  if (requireAtLeastOneEnabled && entries.length < 1) {
    errors.push(`${label} requires at least one drop row`);
  }
  for (const row of entries) {
    const dropRate = Number(row?.dropRate);
    if (!Number.isInteger(dropRate) || dropRate < 0 || dropRate > 100) {
      errors.push(`${label} drop row "${row?.id || 'row'}" dropRate must be an integer from 0 to 100`);
    }
    if (!row?.componentId && !row?.itemUuid) {
      errors.push(`${label} drop row "${row?.id || 'row'}" requires componentId or itemUuid`);
    }
    const quantity = Number(row?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`${label} drop row "${row?.id || 'row'}" quantity must be positive`);
    }
  }
  errors.push(...validateGatheringDropReferencesSync({
    tasks: [{ name: label.replace(/^Task\s+"|"$/g, ''), dropRows: Array.isArray(rows) ? rows : [] }],
    system,
    systemId,
    validateDisabledRows,
    requireAtLeastOneEnabled: false,
    validateBasics: false,
    resolveUuid
  }));
  return errors;
}

function validateResultGroupNames(resultGroups, label) {
  const errors = [];
  if (!Array.isArray(resultGroups) || resultGroups.length < 1) {
    errors.push(`${label} requires at least one result group`);
    return errors;
  }

  const seen = new Map();
  for (const group of resultGroups) {
    const normalizedName = normalizeGroupName(group?.name);
    if (!normalizedName) {
      errors.push(`${label} result groups require names`);
      continue;
    }
    if (FAILURE_KEYWORDS.has(normalizedName)) {
      errors.push(`${label} result group "${group.name}" collides with reserved failure keyword`);
    }
    if (seen.has(normalizedName)) {
      errors.push(`${label} result group "${group.name}" duplicates "${seen.get(normalizedName)}"`);
    } else {
      seen.set(normalizedName, group.name);
    }
  }
  return errors;
}

function validateTimeRequirement(timeRequirement, label) {
  const errors = [];
  let total = 0;
  for (const unit of TIME_UNITS) {
    const value = Number(timeRequirement?.[unit] || 0);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${label} timeRequirement.${unit} must be a non-negative number`);
      continue;
    }
    total += value;
  }
  if (total <= 0) {
    errors.push(`${label} timeRequirement must include a positive duration`);
  }
  return errors;
}

function validateFailureOutcome(outcome, label) {
  const errors = [];
  if (!['text', 'macro'].includes(outcome.mode)) {
    errors.push(`${label}.mode must be text or macro`);
  }
  if (outcome.mode === 'text' && !outcome.text) {
    errors.push(`${label} text mode requires text`);
  }
  if (outcome.mode === 'macro' && !outcome.macroUuid) {
    errors.push(`${label} macro mode requires macroUuid`);
  }
  return errors;
}

function normalizeConditions(data = null) {
  if (!data || typeof data !== 'object') return {};
  return {
    timeOfDay: stringOrEmpty(data.timeOfDay),
    weather: stringOrEmpty(data.weather),
    visibility: stringOrEmpty(data.visibility),
    notes: stringOrEmpty(data.notes)
  };
}

function validateConditions(conditions, label) {
  if (!conditions || typeof conditions !== 'object') return [];
  return [];
}

function normalizeChatMessages(data = null) {
  if (!data || typeof data !== 'object') return null;
  const events = {};
  for (const [event, enabled] of Object.entries(data.events || {})) {
    events[String(event)] = enabled === true;
  }
  return {
    enabled: data.enabled === true,
    gmDiagnostics: data.gmDiagnostics === true,
    events
  };
}


function validateNodeConfig(nodes, label) {
  if (!nodes) return [];
  const errors = [];
  if (!Number.isInteger(Number(nodes.max)) || Number(nodes.max) < 0) {
    errors.push(`${label}.max must be a non-negative integer`);
  }
  if (!Number.isInteger(Number(nodes.current)) || Number(nodes.current) < 0) {
    errors.push(`${label}.current must be a non-negative integer`);
  }
  if (Number(nodes.current) > Number(nodes.max)) {
    errors.push(`${label}.current must not exceed max`);
  }
  if (!VALID_DEPLETION_TIMINGS.has(nodes.depletionTiming)) {
    errors.push(`${label}.depletionTiming must be onStart or onSuccess`);
  }
  if (!VALID_RESPAWN_POLICIES.has(nodes.respawn?.policy)) {
    errors.push(`${label}.respawn.policy is invalid`);
  }
  if (['elapsedTime', 'probability', 'manualAndElapsedTime'].includes(nodes.respawn?.policy) && Number(nodes.respawn?.intervalSeconds || 0) <= 0) {
    errors.push(`${label}.respawn.intervalSeconds must be positive for timed respawn`);
  }
  if (nodes.respawn?.policy === 'probability' || nodes.respawn?.policy === 'manualAndElapsedTime') {
    const chance = Number(nodes.respawn?.chance);
    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
      errors.push(`${label}.respawn.chance must be between 0 and 1`);
    }
  }
  return errors;
}

// Per-actor stamina-cost modifier references. Same shape as drop-row character
// modifier references (resolved against the per-system character modifier
// library at attempt time): { id, modifierId, operator, min, max,
// expressionOverride }. Entries without a modifierId are dropped.
function normalizeStaminaCostModifiers(refs) {
  return (Array.isArray(refs) ? refs : [])
    .map((ref, index) => {
      if (!ref || typeof ref !== 'object') return null;
      const modifierId = normalizeOptionalString(ref.modifierId);
      if (!modifierId) return null;
      return {
        id: normalizeOptionalString(ref.id) || `char-mod-${modifierId}-${index + 1}`,
        modifierId,
        operator: VALID_CHARACTER_MODIFIER_OPERATORS.has(ref.operator) ? ref.operator : '+',
        min: numberOrNull(ref.min),
        max: numberOrNull(ref.max),
        expressionOverride: normalizeOptionalString(ref.expressionOverride) || ''
      };
    })
    .filter(Boolean);
}

function validateStaminaCostModifiers(refs, label) {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const errors = [];
  refs.forEach((ref, index) => {
    if (!ref?.modifierId) {
      errors.push(`${label}[${index}] requires a modifierId`);
    }
    if (!VALID_CHARACTER_MODIFIER_OPERATORS.has(ref?.operator)) {
      errors.push(`${label}[${index}].operator must be + or -`);
    }
    if (ref?.min !== null && ref?.max !== null && Number(ref.min) > Number(ref.max)) {
      errors.push(`${label}[${index}] min must not exceed max`);
    }
  });
  return errors;
}

function normalizeBlindSelection(data = null) {
  if (!data || typeof data !== 'object') return null;
  const weights = data.weights && typeof data.weights === 'object' ? cloneJson(data.weights) : {};
  if (Object.keys(weights).length === 0) return null;
  return { weights };
}

function normalizeRevealConfig(data = null) {
  if (!data || typeof data !== 'object') return null;
  return {
    enabled: data.enabled === true,
    scope: VALID_REVEAL_SCOPES.has(data.scope) ? data.scope : 'actor',
    triggers: Array.isArray(data.triggers) ? data.triggers.map(trigger => stringOrEmpty(trigger)).filter(Boolean) : []
  };
}

function validateRevealConfig(reveal, label) {
  if (!reveal) return [];
  if (!VALID_REVEAL_SCOPES.has(reveal.scope)) {
    return [`${label}.scope must be actor, user, party, or global`];
  }
  return [];
}

function normalizeEncounterConfig(data = null) {
  if (!data || typeof data !== 'object') return null;
  const hooks = Array.isArray(data.hooks) ? data.hooks : [];
  return {
    hooks: hooks
      .filter(hook => hook && typeof hook === 'object')
      .map(hook => ({
        event: stringOrEmpty(hook.event),
        rollTableUuid: normalizeOptionalString(hook.rollTableUuid),
        macroUuid: normalizeOptionalString(hook.macroUuid),
        chance: numberOrNull(hook.chance) ?? 1
      }))
  };
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function replaceAt(array, index, value) {
  const next = [...array];
  next[index] = value;
  return next;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function stringOrEmpty(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(entry => stringOrEmpty(entry).toLowerCase()).filter(Boolean)));
}

function normalizeIdList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(entry => stringOrEmpty(entry)).filter(Boolean)));
}

function normalizeDropRateAdjustmentValue(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < -100 || number > 100 || number === 0) return null;
  return number;
}

function normalizeDropRateAdjustmentMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([id, adjustment]) => [stringOrEmpty(id), normalizeDropRateAdjustmentValue(adjustment)])
    .filter(([id, adjustment]) => id && adjustment !== null));
}

function normalizeTaskDropRateAdjustments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([taskId, rowAdjustments]) => [stringOrEmpty(taskId), normalizeDropRateAdjustmentMap(rowAdjustments)])
    .filter(([taskId, rowAdjustments]) => taskId && Object.keys(rowAdjustments).length > 0));
}

function normalizeTaskDropRateAdjustmentsEnabled(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([taskId, enabled]) => [stringOrEmpty(taskId), enabled])
    .filter(([taskId, enabled]) => taskId && enabled === false));
}

function normalizeHazardDropRateAdjustmentsEnabled(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([hazardId, enabled]) => [stringOrEmpty(hazardId), enabled])
    .filter(([hazardId, enabled]) => hazardId && enabled === false));
}

function validateDropRateAdjustmentMap(value, label) {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return [`${label} must be an object`];
  const errors = [];
  for (const [id, adjustment] of Object.entries(value)) {
    const key = stringOrEmpty(id);
    const number = Number(adjustment);
    if (!key) {
      errors.push(`${label} keys must be non-empty ids`);
      continue;
    }
    if (!Number.isInteger(number) || number < -100 || number > 100) {
      errors.push(`${label}.${key} must be an integer from -100 to 100`);
    }
  }
  return errors;
}

function validateTaskDropRateAdjustments(value, label) {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return [`${label} must be an object`];
  return Object.entries(value).flatMap(([taskId, rowAdjustments]) => {
    const key = stringOrEmpty(taskId);
    if (!key) return [`${label} keys must be non-empty task ids`];
    return validateDropRateAdjustmentMap(rowAdjustments, `${label}.${key}`);
  });
}

function validateTaskDropRateAdjustmentsEnabled(value, label) {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return [`${label} must be an object`];
  const errors = [];
  for (const [taskId, enabled] of Object.entries(value)) {
    const key = stringOrEmpty(taskId);
    if (!key) {
      errors.push(`${label} keys must be non-empty task ids`);
      continue;
    }
    if (typeof enabled !== 'boolean') {
      errors.push(`${label}.${key} must be a boolean`);
    }
  }
  return errors;
}

function validateHazardDropRateAdjustmentsEnabled(value, label) {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return [`${label} must be an object`];
  const errors = [];
  for (const [hazardId, enabled] of Object.entries(value)) {
    const key = stringOrEmpty(hazardId);
    if (!key) {
      errors.push(`${label} keys must be non-empty hazard ids`);
      continue;
    }
    if (typeof enabled !== 'boolean') {
      errors.push(`${label}.${key} must be a boolean`);
    }
  }
  return errors;
}

function trimmedOrDefault(value, fallback) {
  return stringOrEmpty(value) || fallback;
}

function normalizeGroupName(value) {
  return stringOrEmpty(value).toLowerCase();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}
