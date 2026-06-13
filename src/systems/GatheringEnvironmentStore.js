import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';

import { validateGatheringDropReferencesSync } from './GatheringDropReferenceValidator.js';
import {
  DANGER_LEVELS,
  evaluateEnvironmentMatch,
  resolveEnvironmentDangerLevel,
} from './gatheringMatch.js';
import { normalizeNodeRuntime } from './gatheringNodeConfig.js';

const VALID_SELECTION_MODES = new Set(['targeted', 'blind']);
const VALID_COMPOSITION_MODES = new Set(['automatic', 'manual']);
const VALID_RISK_LEVELS = new Set(['safe', 'hazardous', 'unsafe', 'extreme']);

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
  'oops',
]);

/**
 * Normalize an event-outcome policy, accepting the legacy hazard-schema values
 * (`successWithHazard` / `failureWithHazard`) on read and coercing them to the
 * event equivalents. Imported or pre-1.0.0-migration payloads still load with the
 * intended policy before the startup migration rewrites them. Unknown values
 * default to `successWithEvent`.
 *
 * @param {*} value
 * @returns {'successWithEvent' | 'failureWithEvent'}
 */
function normalizeEventPolicy(value) {
  const coerced =
    value === 'successWithHazard'
      ? 'successWithEvent'
      : value === 'failureWithHazard'
        ? 'failureWithEvent'
        : value;
  return ['successWithEvent', 'failureWithEvent'].includes(coerced) ? coerced : 'successWithEvent';
}

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
 * The store owns canonical normalization for environment-level fields
 * (selection/composition mode, conditions, danger, drop-rate adjustments,
 * reveal/chat config, and the per-environment `nodeRuntime` map). Tasks and
 * events are NOT authored on the environment — they live in the system library
 * and are matched in by region/biome/danger (or via the enabled/forced id
 * lists), so a targeted/blind environment is only valid when it has at least one
 * such library task source. Validation failures throw before persistence,
 * leaving callers' draft state intact; UI layers map error strings to inline
 * field targets and summary links.
 */
export class GatheringEnvironmentStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    systemManager = null,
    getSystems = null,
    randomID = null,
    runCleanup = null,
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
    const environment = this.environments.find((env) => env.id === environmentId);
    return environment ? cloneJson(environment) : null;
  }

  listBySystem(systemId, { includeDisabledFeature = true } = {}) {
    this._ensureLoaded();
    const system = this._getSystem(systemId);
    if (!includeDisabledFeature && system?.features?.gathering !== true) {
      return [];
    }
    return cloneJson(this.environments.filter((env) => env.craftingSystemId === systemId));
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
      errors,
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
    const index = this.environments.findIndex((env) => env.id === environmentId);
    if (index === -1) return null;

    const merged = {
      ...this.environments[index],
      ...cloneJson(patch),
      id: environmentId,
    };
    const environment = this._normalizeEnvironment(merged);
    const errors = this._validateEnvironment(environment, merged);
    if (errors.length > 0) {
      throw new GatheringEnvironmentValidationError(errors);
    }
    await this._persistEnvironmentList(replaceAt(this.environments, index, environment));
    return cloneJson(environment);
  }

  async duplicate(environmentId, overrides = {}) {
    this._ensureLoaded();
    const source = this.environments.find((env) => env.id === environmentId);
    if (!source) return null;

    const duplicate = this._normalizeEnvironment({
      ...cloneJson(source),
      ...cloneJson(overrides),
      id: this.randomID(),
      nodeRuntime: {}, // a copy starts with full pools
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
    const byId = new Map(this.environments.map((env) => [env.id, env]));
    const systemIds = new Set(
      this.environments.filter((env) => env.craftingSystemId === systemId).map((env) => env.id)
    );
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
    const reordered = this.environments.map((env) => {
      if (env.craftingSystemId !== systemId) return env;
      return queue.shift();
    });
    await this._persistEnvironmentList(reordered);
    return this.listBySystem(systemId);
  }

  async delete(environmentId) {
    this._ensureLoaded();
    const exists = this.environments.some((env) => env.id === environmentId);
    if (!exists) return false;

    const candidate = this.environments.filter((env) => env.id !== environmentId);
    await this._persistEnvironmentList(candidate);
    await this._removeRunsForEnvironment(environmentId);
    return true;
  }

  async cleanupByCraftingSystem(systemId) {
    this._ensureLoaded();
    const before = this.environments.length;
    const candidate = this.environments.filter((env) => env.craftingSystemId !== systemId);
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
    return records.map((record) => this._normalizeEnvironment(record));
  }

  _normalizeEnvironment(data = {}, { freshEnvironmentId = false } = {}) {
    const selectionMode = VALID_SELECTION_MODES.has(data?.selectionMode)
      ? data.selectionMode
      : 'targeted';
    const compositionMode = VALID_COMPOSITION_MODES.has(data?.compositionMode)
      ? data.compositionMode
      : 'automatic';
    const blindSelection = normalizeBlindSelection(data?.blindSelection);
    const forcedTaskIds = normalizeIdList(data?.forcedTaskIds);
    // Accept the legacy hazard-schema keys on read (imported or pre-1.0.0-migration
    // payloads) so an old export still loads before the startup migration runs.
    const forcedEventIds = normalizeIdList(data?.forcedEventIds ?? data?.forcedHazardIds);
    return {
      id: freshEnvironmentId || !data?.id ? this.randomID() : String(data.id),
      craftingSystemId: stringOrEmpty(data?.craftingSystemId),
      name: trimmedOrDefault(data?.name, 'New Gathering Environment'),
      description: stringOrEmpty(data?.description),
      img: normalizeOptionalString(data?.img),
      region: stringOrEmpty(data?.region),
      biome: stringOrEmpty(data?.biome),
      biomes: normalizeStringList(data?.biomes ?? data?.biome),
      // Explicit location availability rules (additive, opt-in). Legacy
      // `region`/`biomes` above stay untouched as compatibility/display metadata.
      // Accept the legacy realm-schema keys on read (imported or pre-1.1.0-migration
      // payloads) so an old export still loads before the startup migration runs.
      includedRealmIds: normalizeIdList(data?.includedRealmIds ?? data?.includedRegionIds),
      excludedRealmIds: normalizeIdList(data?.excludedRealmIds ?? data?.excludedRegionIds),
      includedBiomeIds: normalizeStringList(data?.includedBiomeIds),
      excludedBiomeIds: normalizeStringList(data?.excludedBiomeIds),
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
      enabledEventIds: normalizeIdList(data?.enabledEventIds ?? data?.enabledHazardIds),
      disabledEventIds: normalizeIdList(data?.disabledEventIds ?? data?.disabledHazardIds),
      taskOrder: normalizeIdList(data?.taskOrder),
      eventOrder: normalizeIdList(data?.eventOrder ?? data?.hazardOrder),
      taskDropRateAdjustments: normalizeTaskDropRateAdjustments(data?.taskDropRateAdjustments),
      taskDropRateAdjustmentsEnabled: normalizeTaskDropRateAdjustmentsEnabled(
        data?.taskDropRateAdjustmentsEnabled
      ),
      eventDropRateAdjustments: normalizeDropRateAdjustmentMap(
        data?.eventDropRateAdjustments ?? data?.hazardDropRateAdjustments
      ),
      eventDropRateAdjustmentsEnabled: normalizeEventDropRateAdjustmentsEnabled(
        data?.eventDropRateAdjustmentsEnabled ?? data?.hazardDropRateAdjustmentsEnabled
      ),
      eventSelectionMode: ['highestRankedDrop', 'allDrops'].includes(
        data?.eventSelectionMode ?? data?.hazardSelectionMode
      )
        ? (data.eventSelectionMode ?? data.hazardSelectionMode)
        : 'allDrops',
      eventPolicy: normalizeEventPolicy(data?.eventPolicy ?? data?.hazardPolicy),
      ...(blindSelection ? { blindSelection } : {}),
      ...(forcedTaskIds.length > 0 ? { forcedTaskIds } : {}),
      ...(forcedEventIds.length > 0 ? { forcedEventIds } : {}),
      // Per-environment node runtime state (taskId → node object), so a library
      // task's resource nodes deplete/respawn independently in each environment.
      nodeRuntime: normalizeNodeRuntime(data?.nodeRuntime),
    };
  }

  _validateAll(environments, originals = environments) {
    return environments.flatMap((environment, index) =>
      this._validateEnvironment(
        environment,
        Array.isArray(originals) ? originals[index] : environment
      )
    );
  }

  _validateEnvironment(environment, original = environment) {
    const normalized = this._normalizeEnvironment(environment);
    const errors = [];
    const label = normalized.name || normalized.id;

    const system = normalized.craftingSystemId
      ? this._getSystem(normalized.craftingSystemId)
      : null;
    if (!normalized.craftingSystemId) {
      errors.push(`Environment "${label}" is missing craftingSystemId`);
    } else if (!system) {
      errors.push(
        `Environment "${label}" references unresolved craftingSystemId "${normalized.craftingSystemId}"`
      );
    }

    // Realm-id availability validation runs only at save boundaries where the
    // owning system context resolves (realms live on the system, environments in
    // a world setting). Load paths never reach here with a throw because the
    // load path normalizes without validating. Stale biome ids are not rejected
    // here — they remain compatibility input until a biome vocabulary surface
    // ships.
    if (system && Array.isArray(system.gatheringRealms)) {
      const realmIds = new Set(system.gatheringRealms.map((realm) => realm?.id).filter(Boolean));
      for (const realmId of normalized.includedRealmIds) {
        if (!realmIds.has(realmId)) {
          errors.push(
            `Environment "${label}" includedRealmIds references unknown realm "${realmId}"`
          );
        }
      }
      for (const realmId of normalized.excludedRealmIds) {
        if (!realmIds.has(realmId)) {
          errors.push(
            `Environment "${label}" excludedRealmIds references unknown realm "${realmId}"`
          );
        }
      }
    }

    if (!VALID_SELECTION_MODES.has(original?.selectionMode)) {
      errors.push(`Environment "${label}" selectionMode must be targeted or blind`);
    }

    if (
      original?.compositionMode !== undefined &&
      !VALID_COMPOSITION_MODES.has(original.compositionMode)
    ) {
      errors.push(`Environment "${label}" compositionMode must be automatic or manual`);
    }

    if (original?.dangerLevel !== undefined && !DANGER_LEVELS.includes(original.dangerLevel)) {
      errors.push(`Environment "${label}" dangerLevel must be one of: ${DANGER_LEVELS.join(', ')}`);
    }

    errors.push(
      ...validateTaskDropRateAdjustments(
        original?.taskDropRateAdjustments,
        `Environment "${label}" taskDropRateAdjustments`
      ),
      ...validateTaskDropRateAdjustmentsEnabled(
        original?.taskDropRateAdjustmentsEnabled,
        `Environment "${label}" taskDropRateAdjustmentsEnabled`
      ),
      ...validateDropRateAdjustmentMap(
        original?.eventDropRateAdjustments,
        `Environment "${label}" eventDropRateAdjustments`
      ),
      ...validateEventDropRateAdjustmentsEnabled(
        original?.eventDropRateAdjustmentsEnabled,
        `Environment "${label}" eventDropRateAdjustmentsEnabled`
      )
    );

    const hasTaskSource = this._environmentHasTaskSource(normalized);
    if (normalized.enabled !== false && !hasTaskSource) {
      errors.push(
        `Environment "${label}" must have at least one task before it can be enabled`
      );
    }
    if (!VALID_RISK_LEVELS.has(original?.risk ?? normalized.risk)) {
      errors.push(`Environment "${label}" risk must be safe, hazardous, unsafe, or extreme`);
    }
    errors.push(...validateConditions(normalized.conditions, `Environment "${label}" conditions`));

    return errors;
  }

  _getSystem(systemId) {
    if (!systemId) return null;
    if (this.systemManager?.getSystem) return this.systemManager.getSystem(systemId);
    const systems = this._getSystems();
    return systems.find((system) => system?.id === systemId) || null;
  }

  _environmentHasTaskSource(environment) {
    if (environment.enabledTaskIds.length > 0) return true;
    if (
      environment.compositionMode === 'manual' &&
      normalizeIdList(environment.forcedTaskIds).length > 0
    )
      return true;
    if (environment.compositionMode !== 'automatic') return false;
    return this._hasMatchingLibraryTask(environment);
  }

  _hasMatchingLibraryTask(environment) {
    return this._getGatheringLibraryTasks(environment.craftingSystemId).some(
      (task) =>
        task?.enabled !== false &&
        evaluateEnvironmentMatch(task, environment, {}, { includeDanger: false }).matches
    );
  }

  _getGatheringLibraryTasks(systemId) {
    if (!systemId) return [];
    const config = this.getSetting?.(SETTING_KEYS.GATHERING_CONFIG);
    const tasks = config?.systems?.[systemId]?.tasks;
    return Array.isArray(tasks) ? tasks : [];
  }

  _getSystems() {
    const raw =
      typeof this.getSystems === 'function'
        ? this.getSystems()
        : this.systemManager?.getSystems
          ? this.systemManager.getSystems()
          : [];
    if (raw instanceof Map) return [...raw.values()];
    return Array.isArray(raw) ? raw : [];
  }

  _getSystemItem(systemId, componentId) {
    if (!systemId || !componentId) return null;
    if (this.systemManager?.getItems) {
      return this.systemManager.getItems(systemId).find((item) => item?.id === componentId) || null;
    }
    const system = this._getSystem(systemId);
    const items = Array.isArray(system?.components) ? system.components : [];
    return items.find((item) => item?.id === componentId) || null;
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
}

// Validates a library task's d100 drop rows (the admin task editor imports this).
export function validateDropRows(
  rows,
  label,
  {
    system = null,
    systemId = '',
    validateDisabledRows = false,
    requireAtLeastOneEnabled = true,
    resolveUuid,
  } = {}
) {
  const entries = Array.isArray(rows) ? rows.filter((row) => row?.enabled !== false) : [];
  const errors = [];
  if (requireAtLeastOneEnabled && entries.length === 0) {
    errors.push(`${label} requires at least one drop row`);
  }
  for (const row of entries) {
    const dropRate = Number(row?.dropRate);
    if (!Number.isInteger(dropRate) || dropRate < 0 || dropRate > 100) {
      errors.push(
        `${label} drop row "${row?.id || 'row'}" dropRate must be an integer from 0 to 100`
      );
    }
    if (!row?.componentId && !row?.itemUuid) {
      errors.push(`${label} drop row "${row?.id || 'row'}" requires componentId or itemUuid`);
    }
    const quantity = Number(row?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`${label} drop row "${row?.id || 'row'}" quantity must be positive`);
    }
  }
  errors.push(
    ...validateGatheringDropReferencesSync({
      tasks: [
        { name: label.replaceAll(/^Task\s+"|"$/g, ''), dropRows: Array.isArray(rows) ? rows : [] },
      ],
      system,
      systemId,
      validateDisabledRows,
      requireAtLeastOneEnabled: false,
      validateBasics: false,
      resolveUuid,
    })
  );
  return errors;
}

function normalizeConditions(data = null) {
  if (!data || typeof data !== 'object') return {};
  return {
    timeOfDay: stringOrEmpty(data.timeOfDay),
    weather: stringOrEmpty(data.weather),
    visibility: stringOrEmpty(data.visibility),
    notes: stringOrEmpty(data.notes),
  };
}

function validateConditions(conditions, _label) {
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
    events,
  };
}

function normalizeBlindSelection(data = null) {
  if (!data || typeof data !== 'object') return null;
  const weights = data.weights && typeof data.weights === 'object' ? cloneJson(data.weights) : {};
  if (Object.keys(weights).length === 0) return null;
  return { weights };
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

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => stringOrEmpty(entry).toLowerCase()).filter(Boolean))];
}

function normalizeIdList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => stringOrEmpty(entry)).filter(Boolean))];
}

function normalizeDropRateAdjustmentValue(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < -100 || number > 100 || number === 0) return null;
  return number;
}

function normalizeDropRateAdjustmentMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([id, adjustment]) => [stringOrEmpty(id), normalizeDropRateAdjustmentValue(adjustment)])
      .filter(([id, adjustment]) => id && adjustment !== null)
  );
}

function normalizeTaskDropRateAdjustments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([taskId, rowAdjustments]) => [
        stringOrEmpty(taskId),
        normalizeDropRateAdjustmentMap(rowAdjustments),
      ])
      .filter(([taskId, rowAdjustments]) => taskId && Object.keys(rowAdjustments).length > 0)
  );
}

function normalizeTaskDropRateAdjustmentsEnabled(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([taskId, enabled]) => [stringOrEmpty(taskId), enabled])
      .filter(([taskId, enabled]) => taskId && enabled === false)
  );
}

function normalizeEventDropRateAdjustmentsEnabled(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([eventId, enabled]) => [stringOrEmpty(eventId), enabled])
      .filter(([eventId, enabled]) => eventId && enabled === false)
  );
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

function validateEventDropRateAdjustmentsEnabled(value, label) {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return [`${label} must be an object`];
  const errors = [];
  for (const [eventId, enabled] of Object.entries(value)) {
    const key = stringOrEmpty(eventId);
    if (!key) {
      errors.push(`${label} keys must be non-empty event ids`);
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
