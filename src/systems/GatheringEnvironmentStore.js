import { getSetting as defaultGetSetting, setSetting as defaultSetSetting, SETTING_KEYS } from '../config/settings.js';

const DEFAULT_TASK_IMG = 'icons/svg/item-bag.svg';
const VALID_SELECTION_MODES = new Set(['targeted', 'blind']);
const VALID_RESOLUTION_MODES = new Set(['progressive', 'routed']);
const VALID_RESULT_SELECTION_PROVIDERS = new Set(['macroOutcome', 'rollTableOutcome']);
const VALID_CHECK_PROVIDERS = new Set(['dnd5e', 'pf2e', 'macro']);
const VALID_PROGRESSIVE_AWARD_MODES = new Set(['partial', 'equal', 'exceed']);
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
    return {
      id: freshEnvironmentId || !data?.id ? this.randomID() : String(data.id),
      craftingSystemId: stringOrEmpty(data?.craftingSystemId),
      name: trimmedOrDefault(data?.name, 'New Gathering Environment'),
      description: stringOrEmpty(data?.description),
      enabled: data?.enabled !== false,
      selectionMode,
      sceneUuid: normalizeOptionalString(data?.sceneUuid),
      tasks: Array.isArray(data?.tasks) ? data.tasks.map(task => this._normalizeTask(task)) : []
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
      catalysts: Array.isArray(data?.catalysts) ? data.catalysts.map(catalyst => normalizeCatalyst(catalyst)) : [],
      resultGroups: Array.isArray(data?.resultGroups) ? data.resultGroups.map(group => this._normalizeResultGroup(group)) : []
    };

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

    if (normalized.selectionMode === 'targeted' && normalized.tasks.length < 1) {
      errors.push(`Environment "${label}" targeted selection requires at least one task`);
    }
    if (normalized.selectionMode === 'blind' && normalized.tasks.length !== 1) {
      errors.push(`Environment "${label}" blind selection requires exactly one task`);
    }

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
      errors.push(`Task "${label}" resolutionMode must be progressive or routed`);
    }

    errors.push(...this._validateProviderConfig(task.visibility, {
      label: `Task "${label}" visibility`,
      thresholdRequired: true
    }));

    if (task.timeRequirement) {
      errors.push(...validateTimeRequirement(task.timeRequirement, `Task "${label}"`));
    }

    errors.push(...validateCatalysts(task.catalysts, `Task "${label}"`, originalTask?.catalysts));
    errors.push(...validateResultGroupNames(task.resultGroups, `Task "${label}"`));

    if (task.failureOutcome) {
      errors.push(...validateFailureOutcome(task.failureOutcome, `Task "${label}" failureOutcome`));
    }

    if (task.enabled !== true) {
      return errors;
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

function normalizeResult(data = {}, randomID) {
  return {
    id: data?.id ? String(data.id) : randomID(),
    componentId: normalizeOptionalString(data?.componentId ?? data?.systemItemId),
    itemUuid: normalizeOptionalString(data?.itemUuid),
    quantity: Number.isFinite(Number(data?.quantity)) && Number(data.quantity) > 0 ? Number(data.quantity) : 1,
    propertyMacroUuid: normalizeOptionalString(data?.propertyMacroUuid)
  };
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

function trimmedOrDefault(value, fallback) {
  return stringOrEmpty(value) || fallback;
}

function normalizeGroupName(value) {
  return stringOrEmpty(value).toLowerCase();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}
