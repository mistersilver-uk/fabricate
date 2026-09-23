/**
 * `1.3.0` — remove the `dnd5e | pf2e | macro` provider model from the four formula-only gathering
 * surfaces, which become formula-only outright. Pure, idempotent, version-gated.
 * A macro-only TOOL REQUIREMENT with no formula becomes `null`, so the tool becomes usable; a macro
 * VISIBILITY gate with no formula becomes `null` and fails open; every macro character-modifier
 * entry is deleted with its references scrubbed. Result selection and currency are untouched.
 */

import { isPlainObject, forEachSystem } from './migrationHelpers.js';

export function migrateRemoveSystemProvider(data = {}) {
  const systems = _clone(data.systems);
  const gatheringConfig = _clone(data.gatheringConfig);
  const environments = _clone(data.environments);

  forEachSystem(systems, (system) => _stripSystemToolRequirements(system));

  if (isPlainObject(gatheringConfig) && isPlainObject(gatheringConfig.systems)) {
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
    gatheringConfig: isPlainObject(gatheringConfig) ? gatheringConfig : data.gatheringConfig,
    environments: Array.isArray(environments) ? environments : data.environments,
  };
}

function _stripSystemToolRequirements(system) {
  if (!isPlainObject(system) || !Array.isArray(system.tools)) return;
  for (const tool of system.tools) {
    if (!isPlainObject(tool) || !('requirement' in tool)) continue;
    tool.requirement = _stripRequirement(tool.requirement);
  }
}

function _stripRequirement(requirement) {
  if (!isPlainObject(requirement)) return requirement === undefined ? requirement : null;
  const formula = typeof requirement.formula === 'string' ? requirement.formula : '';
  // A macro-only requirement (no formula) is removed entirely — the tool becomes
  // usable rather than gated by an unevaluable macro reference.
  if (!formula) return null;
  return { formula };
}

function _migrateGatheringConfigSystem(systemConfig) {
  if (!isPlainObject(systemConfig)) return;

  const deletedIds = new Set();
  if (Array.isArray(systemConfig.characterModifiers)) {
    systemConfig.characterModifiers = systemConfig.characterModifiers.filter((entry) => {
      if (isPlainObject(entry) && entry.provider === 'macro') {
        if (entry.id != null) deletedIds.add(String(entry.id));
        return false;
      }
      return true;
    });
    for (const entry of systemConfig.characterModifiers) {
      if (!isPlainObject(entry)) continue;
      delete entry.provider;
      delete entry.macroUuid;
    }
  }

  if (Array.isArray(systemConfig.tasks)) {
    for (const task of systemConfig.tasks) {
      if (!isPlainObject(task)) continue;
      if (Array.isArray(task.dropRows)) {
        for (const row of task.dropRows) {
          if (isPlainObject(row)) {
            row.characterModifiers = _scrubReferences(row.characterModifiers, deletedIds);
          }
        }
      }
      task.staminaCostModifiers = _scrubReferences(task.staminaCostModifiers, deletedIds);
    }
  }

  if (Array.isArray(systemConfig.events)) {
    for (const event of systemConfig.events) {
      if (isPlainObject(event)) {
        event.characterModifiers = _scrubReferences(event.characterModifiers, deletedIds);
      }
    }
  }
}

function _scrubReferences(references, deletedIds) {
  if (!Array.isArray(references)) return references;
  return references
    .filter((ref) => !(isPlainObject(ref) && deletedIds.has(String(ref.modifierId))))
    .map((ref) => {
      if (!isPlainObject(ref)) return ref;
      delete ref.providerOverride;
      delete ref.macroUuidOverride;
      return ref;
    });
}

function _stripEnvironmentTaskGates(environment) {
  if (!isPlainObject(environment) || !Array.isArray(environment.tasks)) return;
  for (const task of environment.tasks) {
    if (!isPlainObject(task)) continue;
    if ('visibility' in task) {
      task.visibility = _stripVisibility(task.visibility);
    }
    if ('check' in task) {
      task.check = _stripCheck(task.check);
    }
  }
}

function _stripVisibility(visibility) {
  if (!isPlainObject(visibility)) return visibility;
  const formula = typeof visibility.formula === 'string' ? visibility.formula : '';
  // A macro visibility gate with no formula is removed — the task becomes
  // visible (fail open) rather than gated by an unevaluable macro reference.
  if (!formula) return null;
  const next = { formula };
  if ('threshold' in visibility) next.threshold = visibility.threshold;
  return next;
}

function _stripCheck(check) {
  if (!isPlainObject(check)) return check;
  const formula = typeof check.formula === 'string' ? check.formula : '';
  // A macro check with no formula is left as `{ formula: '' }` so the existing misconfigured-check
  // diagnostic flags it: silently dropping a resolution gate is worse than surfacing it.
  const next = { formula };
  if ('threshold' in check) next.threshold = check.threshold;
  return next;
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}
