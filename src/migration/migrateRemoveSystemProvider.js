/**
 * 1.3.0 — Remove the `dnd5e | pf2e | macro` provider model from the four
 * formula-only gathering surfaces (pure, idempotent, version-gated).
 *
 * Before this change, visibility gates, gathering checks, tool requirements, and
 * character modifiers each carried a `provider` discriminator (and, for the
 * `macro` provider, a `macroUuid`). Macro support is dropped from these surfaces
 * outright; the surfaces become formula-only. Result-selection providers
 * (`ingredientSet | macroOutcome | rollTableOutcome`) and currency providers
 * (`system | macro`) are real and untouched.
 *
 * Transforms (across the runner's `systems`, `gatheringConfig`, `environments`):
 *
 *  1. craftingSystems tool requirements — strip `provider`/`macroUuid`, keep
 *     `formula`. A macro-only requirement with no formula becomes `null` (the
 *     unusable gate is removed; the tool becomes usable).
 *  2. gatheringConfig character modifiers — delete every `provider === 'macro'`
 *     library entry, scrub references to the deleted ids across
 *     `tasks[].dropRows[].characterModifiers[]`, `tasks[].staminaCostModifiers[]`,
 *     and `events[].characterModifiers[]`, and strip `providerOverride`/
 *     `macroUuidOverride` from every surviving reference. Surviving library
 *     entries keep `{ id, label, icon, expression }`.
 *  3. gatheringEnvironments tasks — strip `provider`/`macroUuid` from
 *     `task.visibility` and `task.check`, keep `formula`/`threshold`. A macro
 *     visibility gate with no formula becomes `null` (fail open). A macro check
 *     with no formula is left as `{ formula: '' }` so the existing
 *     misconfigured-check diagnostic flags it.
 *
 * Stamina's legacy `provider` enum is handled by read-time normalization in the
 * rich-state service, not by this runner step.
 *
 * Idempotent: once `provider`/`macroUuid` and macro entries are gone, a re-run
 * finds nothing to transform and is a no-op.
 *
 * Pure: returns `{ systems, gatheringConfig, environments }` and performs no I/O.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {object} [data.gatheringConfig] Raw gatheringConfig setting.
 * @param {Array<object>} [data.environments] Raw gatheringEnvironments setting.
 * @returns {{ systems: Array<object>, gatheringConfig: object, environments: Array<object> }}
 */
export function migrateRemoveSystemProvider(data = {}) {
  const systems = _clone(data.systems);
  const gatheringConfig = _clone(data.gatheringConfig);
  const environments = _clone(data.environments);

  if (Array.isArray(systems)) {
    for (const system of systems) {
      _stripSystemToolRequirements(system);
    }
  }

  if (_isPlainObject(gatheringConfig) && _isPlainObject(gatheringConfig.systems)) {
    for (const systemConfig of Object.values(gatheringConfig.systems)) {
      _migrateGatheringConfigSystem(systemConfig);
    }
  }

  if (Array.isArray(environments)) {
    for (const environment of environments) {
      _stripEnvironmentTaskGates(environment);
    }
  }

  return {
    systems: Array.isArray(systems) ? systems : data.systems,
    gatheringConfig: _isPlainObject(gatheringConfig) ? gatheringConfig : data.gatheringConfig,
    environments: Array.isArray(environments) ? environments : data.environments,
  };
}

function _stripSystemToolRequirements(system) {
  if (!_isPlainObject(system) || !Array.isArray(system.tools)) return;
  for (const tool of system.tools) {
    if (!_isPlainObject(tool) || !('requirement' in tool)) continue;
    tool.requirement = _stripRequirement(tool.requirement);
  }
}

function _stripRequirement(requirement) {
  if (!_isPlainObject(requirement)) return requirement === undefined ? requirement : null;
  const formula = typeof requirement.formula === 'string' ? requirement.formula : '';
  // A macro-only requirement (no formula) is removed entirely — the tool becomes
  // usable rather than gated by an unevaluable macro reference.
  if (!formula) return null;
  return { formula };
}

function _migrateGatheringConfigSystem(systemConfig) {
  if (!_isPlainObject(systemConfig)) return;

  const deletedIds = new Set();
  if (Array.isArray(systemConfig.characterModifiers)) {
    systemConfig.characterModifiers = systemConfig.characterModifiers.filter((entry) => {
      if (_isPlainObject(entry) && entry.provider === 'macro') {
        if (entry.id != null) deletedIds.add(String(entry.id));
        return false;
      }
      return true;
    });
    for (const entry of systemConfig.characterModifiers) {
      if (!_isPlainObject(entry)) continue;
      delete entry.provider;
      delete entry.macroUuid;
    }
  }

  if (Array.isArray(systemConfig.tasks)) {
    for (const task of systemConfig.tasks) {
      if (!_isPlainObject(task)) continue;
      if (Array.isArray(task.dropRows)) {
        for (const row of task.dropRows) {
          if (_isPlainObject(row)) {
            row.characterModifiers = _scrubReferences(row.characterModifiers, deletedIds);
          }
        }
      }
      task.staminaCostModifiers = _scrubReferences(task.staminaCostModifiers, deletedIds);
    }
  }

  if (Array.isArray(systemConfig.events)) {
    for (const event of systemConfig.events) {
      if (_isPlainObject(event)) {
        event.characterModifiers = _scrubReferences(event.characterModifiers, deletedIds);
      }
    }
  }
}

function _scrubReferences(references, deletedIds) {
  if (!Array.isArray(references)) return references;
  return references
    .filter((ref) => !(_isPlainObject(ref) && deletedIds.has(String(ref.modifierId))))
    .map((ref) => {
      if (!_isPlainObject(ref)) return ref;
      delete ref.providerOverride;
      delete ref.macroUuidOverride;
      return ref;
    });
}

function _stripEnvironmentTaskGates(environment) {
  if (!_isPlainObject(environment) || !Array.isArray(environment.tasks)) return;
  for (const task of environment.tasks) {
    if (!_isPlainObject(task)) continue;
    if ('visibility' in task) {
      task.visibility = _stripVisibility(task.visibility);
    }
    if ('check' in task) {
      task.check = _stripCheck(task.check);
    }
  }
}

function _stripVisibility(visibility) {
  if (!_isPlainObject(visibility)) return visibility;
  const formula = typeof visibility.formula === 'string' ? visibility.formula : '';
  // A macro visibility gate with no formula is removed — the task becomes
  // visible (fail open) rather than gated by an unevaluable macro reference.
  if (!formula) return null;
  const next = { formula };
  if ('threshold' in visibility) next.threshold = visibility.threshold;
  return next;
}

function _stripCheck(check) {
  if (!_isPlainObject(check)) return check;
  const formula = typeof check.formula === 'string' ? check.formula : '';
  // A macro check with no formula is left as `{ formula: '' }` so the existing
  // misconfigured-check diagnostic flags it (silently dropping a resolution gate
  // is worse than surfacing it).
  const next = { formula };
  if ('threshold' in check) next.threshold = check.threshold;
  return next;
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}
