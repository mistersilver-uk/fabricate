import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';
import { cloneJson, normalizeIdList, stringOrEmpty } from '../utils/scalars.js';

import {
  environmentComposesRecord,
  resolveGatheringCompositionMode,
} from './gatheringComposition.js';
import { validateGatheringDropReferencesSync } from './GatheringDropReferenceValidator.js';
import {
  DANGER_LEVELS,
  evaluateEnvironmentMatch,
  resolveEnvironmentDangerLevel,
} from './gatheringMatch.js';
import { normalizeNodeRuntime } from './gatheringNodeConfig.js';
import { resolvedComponentsFor } from './scopedEntityReads.js';
import { SettingsBackedStore } from './SettingsBackedStore.js';

const VALID_SELECTION_MODES = new Set(['targeted', 'blind']);
const VALID_COMPOSITION_MODES = new Set(['automatic', 'manual']);
const VALID_RISK_LEVELS = new Set(['safe', 'hazardous', 'unsafe', 'extreme']);
/** The two id lists that make up an environment's realm membership. */
const REALM_MEMBERSHIP_KEYS = Object.freeze(['includedRealmIds', 'excludedRealmIds']);

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
 * field targets and summary links. Realm membership is the one field a save REWRITES rather
 * than rejects: environments persist as a single world list, so a realm id the record already
 * carried and the world library has lost is pruned rather than allowed to make every
 * environment in the world unsaveable (issue 1848).
 */
export class GatheringEnvironmentStore extends SettingsBackedStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    systemManager = null,
    getSystems = null,
    travelStore = null,
    randomID = null,
    runCleanup = null,
    warn = console.warn,
  } = {}) {
    super({ getSetting, setSetting, settingKey: SETTING_KEYS.GATHERING_ENVIRONMENTS });
    this.systemManager = systemManager;
    this.getSystems = getSystems;
    this.travelStore = travelStore;
    this.randomID = randomID || (() => foundry.utils.randomID());
    this.runCleanup = runCleanup;
    this.warn = warn;
    this.environments = [];
  }

  _setCache(value) {
    this.environments = value;
  }

  load() {
    this._publish(this._normalizeEnvironmentList(this._readSetting()));
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

  async _persistEnvironmentList(environments, { baselineById = null } = {}) {
    const original = Array.isArray(environments) ? cloneJson(environments) : [];
    const normalized = this._normalizeEnvironmentList(original);
    this._pruneStaleRealmMembership(normalized, { baselineById });
    const errors = this._validateAll(normalized, original);
    if (errors.length > 0) {
      throw new GatheringEnvironmentValidationError(errors);
    }

    const payload = cloneJson(normalized);
    await this._writeThenPublish(normalized, payload);
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
    // Validate a copy with the persisted record's own stale realm ids already pruned: a manager
    // patch re-sends the whole record, so the patch mentioning an id cannot be what marks it as
    // newly introduced. The persist below re-prunes and reports across the whole list.
    const errors = this._validateEnvironment(this._withStaleRealmIdsPruned(environment), merged);
    if (errors.length > 0) {
      throw new GatheringEnvironmentValidationError(errors);
    }
    // Return what was PERSISTED, not what was submitted: the persist may have pruned realm ids
    // off this record, and a caller handed the submitted copy would re-send them.
    const persisted = await this._persistEnvironmentList(
      replaceAt(this.environments, index, environment)
    );
    return persisted.find((env) => env.id === environmentId) ?? cloneJson(environment);
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
    // A copy has no persisted counterpart under its own id, so its baseline is the record it
    // was copied FROM: it inherits that record's stale ids, and owns anything `overrides` names.
    const baselineById = new Map([[duplicate.id, source]]);
    const errors = this._validateEnvironment(
      this._withStaleRealmIdsPruned(duplicate, { baselineById })
    );
    if (errors.length > 0) {
      throw new GatheringEnvironmentValidationError(errors);
    }
    const persisted = await this._persistEnvironmentList([...this.environments, duplicate], {
      baselineById,
    });
    return persisted.find((env) => env.id === duplicate.id) ?? cloneJson(duplicate);
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
      ...(blindSelection && { blindSelection }),
      ...(forcedTaskIds.length > 0 && { forcedTaskIds }),
      ...(forcedEventIds.length > 0 && { forcedEventIds }),
      // Per-environment node runtime state (taskId → node object), so a library
      // task's resource nodes deplete/respawn independently in each environment.
      nodeRuntime: normalizeNodeRuntime(data?.nodeRuntime),
    };
  }

  /**
   * The world realm library as a lookup, or null when it cannot be read at all. Both the
   * rejection of an unknown realm id and the prune of a stale one are keyed to this same
   * answer, so a library that is missing neither rejects nor destroys anything.
   *
   * @returns {Set<string>|null}
   */
  _knownRealmIds() {
    const worldRealms = this.travelStore?.list?.();
    if (!Array.isArray(worldRealms)) return null;
    return new Set(worldRealms.map((realm) => realm?.id).filter(Boolean));
  }

  /**
   * Drop realm ids whose realm has left the world library from the records that ALREADY carried
   * them (issue 1848), so one deleted realm cannot make every environment in the world
   * unsaveable. An id a write introduces is left in place for `_validateEnvironment` to reject.
   *
   * @param {object[]} environments normalized records, pruned in place
   * @param {{ baselineById?: Map<string, object>|null, notify?: boolean }} [options]
   * @returns {object[]} the same records
   */
  _pruneStaleRealmMembership(environments, { baselineById = null, notify = true } = {}) {
    const knownRealmIds = this._knownRealmIds();
    if (!knownRealmIds) return environments;

    const reports = [];
    for (const environment of environments) {
      const baseline = this._membershipBaseline(environment.id, baselineById);
      const dropped = baseline ? pruneRealmMembership(environment, baseline, knownRealmIds) : [];
      if (dropped.length > 0) {
        reports.push(`"${environment.name || environment.id}" (${dropped.join(', ')})`);
      }
    }

    // One report per write, not one per environment: environments persist as a single world
    // list, so the save that repairs one of them repairs every one of them.
    if (notify && reports.length > 0) {
      this.warn(
        `Fabricate | Dropped gathering environment references to realms no longer in the world library: ${reports.join('; ')}`
      );
    }
    return environments;
  }

  /** The record a write is measured against: the persisted one, unless the caller names another. */
  _membershipBaseline(environmentId, baselineById) {
    if (baselineById?.has(environmentId)) return baselineById.get(environmentId);
    return this.environments.find((persisted) => persisted.id === environmentId) ?? null;
  }

  /** A copy of one normalized record with its inherited stale realm ids pruned, silently. */
  _withStaleRealmIdsPruned(environment, { baselineById = null } = {}) {
    const [pruned] = this._pruneStaleRealmMembership([cloneJson(environment)], {
      baselineById,
      notify: false,
    });
    return pruned;
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

    // Realm-id availability validation runs only at save boundaries; load paths never reach
    // here with a throw because the load path normalizes without validating. Stale biome ids
    // are not rejected here — they remain compatibility input until a biome vocabulary
    // surface ships.
    //
    // Realms are WORLD scope since issue 1282, so this resolves against the world library
    // rather than the owning system's copy. That makes it strictly more resolvable than it
    // was: an environment citing a realm another system happened to author was previously
    // invalid-but-inert, and is now simply valid.
    const realmIds = this._knownRealmIds();
    if (realmIds) {
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
      errors.push(`Environment "${label}" must have at least one task before it can be enabled`);
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

  /**
   * Whether this environment composes at least one task, which is what gates enabling it.
   *
   * Each mode is asked its own question, because after issue 1315 the two modes compose by
   * different rules. Two mode-blind guards used to precede this and both are retired:
   *
   *  - a non-empty `enabledTaskIds` returned true in ANY mode, including automatic, where that
   *    list is ignored entirely. Issue 1321 recorded this as a known gap and deferred it here.
   *  - a non-empty `forcedTaskIds` returned true in MANUAL mode, which this issue's ruling makes
   *    wrong: manual composes exactly `enabledTaskIds`, so a manual environment whose only entry
   *    is a force list composes nothing and must not be enableable.
   *
   * Manual keeps the coarser id-presence test deliberately. "Is there an explicit pick parked
   * here" is a different question from "does this record compose", and a manual pick naming an
   * id the library no longer holds is a dangling reference to report, not a reason to refuse
   * enabling. Automatic has no such list to consult, so it must ask the predicate.
   */
  _environmentHasTaskSource(environment) {
    if (resolveGatheringCompositionMode(environment) === 'manual') {
      return normalizeIdList(environment.enabledTaskIds).length > 0;
    }
    return this._composesAnyLibraryTask(environment);
  }

  _composesAnyLibraryTask(environment) {
    const compositionMode = resolveGatheringCompositionMode(environment);
    return this._getGatheringLibraryTasks(environment.craftingSystemId).some((task) =>
      environmentComposesRecord(
        environment,
        task,
        'task',
        compositionMode,
        evaluateEnvironmentMatch(task, environment, {}, { includeDanger: false }).matches
      )
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
    // Repointed at issue 1370 onto the READ accessor, with `getItems` kept as the fallback for
    // a manager double that stubs only the older name.
    if (this.systemManager?.getComponentsForSystem) {
      return (
        this.systemManager
          .getComponentsForSystem(systemId)
          .find((item) => item?.id === componentId) || null
      );
    }
    if (this.systemManager?.getItems) {
      return this.systemManager.getItems(systemId).find((item) => item?.id === componentId) || null;
    }
    const system = this._getSystem(systemId);
    return resolvedComponentsFor(system).find((item) => item?.id === componentId) || null;
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

/**
 * Drop from `environment` every realm id that `baseline` already carried and the world library
 * no longer has; an id `baseline` did not carry is left for validation to reject.
 *
 * @returns {string[]} the dropped ids
 */
function pruneRealmMembership(environment, baseline, knownRealmIds) {
  const dropped = new Set();
  for (const key of REALM_MEMBERSHIP_KEYS) {
    const inherited = new Set(normalizeIdList(baseline[key]));
    const kept = [];
    for (const realmId of environment[key]) {
      if (knownRealmIds.has(realmId) || !inherited.has(realmId)) kept.push(realmId);
      else dropped.add(realmId);
    }
    environment[key] = kept;
  }
  return [...dropped];
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

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => stringOrEmpty(entry).toLowerCase()).filter(Boolean))];
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
