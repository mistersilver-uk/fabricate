/**
 * `1.4.0`: legacy `mapped` and `tiered` modes to the routed modes. Pure, idempotent and one-time,
 * so the runtime keeps no `tiered` branch or `outcomeRouting` shim; spec § Resolution-Model
 * Migration (Pre-Release) owns the mapping and its five edge cases.
 */
import { normalizeRoutedName, isReservedRoutedName } from '../utils/routedOutcomeKeywords.js';

import { isPlainObject, forEachSystem } from './migrationHelpers.js';

const LEGACY_MODE_TARGETS = { mapped: 'routedByIngredients', tiered: 'routedByCheck' };

export function migrateLegacyResolutionModes(data = {}) {
  const systems = _clone(data.systems);
  const recipes = _clone(data.recipes);

  if (!Array.isArray(systems)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  // Derived from the legacy mode BEFORE the system mode token is rewritten.
  const modeBySystemId = _migrateSystems(systems);

  if (modeBySystemId.size === 0 || !Array.isArray(recipes)) {
    return {
      systems,
      recipes: Array.isArray(recipes) ? recipes : data.recipes,
    };
  }

  return { systems, recipes: _migrateRecipes(recipes, modeBySystemId) };
}

/** In place; answers `systemId` to its recipes' routed mode, derived before the rewrite. */
function _migrateSystems(systems) {
  const modeBySystemId = new Map();
  forEachSystem(systems, (system) => {
    const target = LEGACY_MODE_TARGETS[system.resolutionMode];
    if (target) {
      modeBySystemId.set(String(system.id), target);
      system.resolutionMode = target;
    }
    if (system.salvageResolutionMode === 'tiered') {
      system.salvageResolutionMode = 'routed';
    }
  });
  return modeBySystemId;
}

/** Answers the survivors; an unmigratable former-tiered recipe is dropped and logged. */
function _migrateRecipes(recipes, modeBySystemId) {
  const survivors = [];
  for (const recipe of recipes) {
    const mode = isPlainObject(recipe)
      ? modeBySystemId.get(String(recipe.craftingSystemId))
      : undefined;
    if (!mode) {
      survivors.push(recipe);
      continue;
    }

    if (mode === 'routedByIngredients') {
      // Mapped routing is byte-identical to ingredient-set routing: carry verbatim.
      survivors.push(recipe);
      continue;
    }

    // Former tiered: group names reconciled so `check` name-matching reproduces `outcomeRouting`.
    if (_reconcileTieredRecipe(recipe)) {
      survivors.push(recipe);
    } else {
      _logRemovedRecipe(recipe);
    }
  }
  return survivors;
}

/** Across the recipe and each step, dropping every routing map; false if any fails. */
function _reconcileTieredRecipe(recipe) {
  let migratable = _reconcileContainer(recipe, recipe.id);

  if (Array.isArray(recipe.steps)) {
    for (const step of recipe.steps) {
      if (!isPlainObject(step)) continue;
      const ok = _reconcileContainer(step, `${recipe.id}/${step.id}`);
      migratable &&= ok;
    }
  }

  return migratable;
}

/** False on an unavoidable normalized-name collision. */
function _reconcileContainer(container, contextId) {
  const routing = container.outcomeRouting;
  // Still drop a present-but-empty map.
  if (!isPlainObject(routing)) {
    if ('outcomeRouting' in container) delete container.outcomeRouting;
    return true;
  }

  const groups = Array.isArray(container.resultGroups) ? container.resultGroups : [];
  const groupsById = _indexGroupsById(groups);
  const outcomesByGroupId = _groupOutcomesByGroupId(routing, groupsById, contextId);

  const seenNames = _seedUnroutedNames(groups, outcomesByGroupId);
  if (seenNames === null) return false; // pre-existing collision is unmigratable

  const clones = _applyRenamesAndSplits(outcomesByGroupId, groupsById, seenNames);
  if (clones === null) return false; // unavoidable name collision → unmigratable

  if (clones.length > 0) {
    container.resultGroups = [...groups, ...clones];
  }

  delete container.outcomeRouting;
  return true;
}

function _indexGroupsById(groups) {
  const groupsById = new Map();
  for (const group of groups) {
    if (isPlainObject(group) && group.id != null) groupsById.set(String(group.id), group);
  }
  return groupsById;
}

/** Drops reserved-keyword outcomes (the failure path) and orphans (logged, as before). */
function _groupOutcomesByGroupId(routing, groupsById, contextId) {
  const outcomesByGroupId = new Map();
  for (const [outcome, groupId] of Object.entries(routing)) {
    if (isReservedRoutedName(outcome)) continue;
    const key = groupId == null ? '' : String(groupId);
    if (!groupsById.has(key)) {
      _logOrphanOutcome(outcome, groupId, contextId);
      continue;
    }
    if (!outcomesByGroupId.has(key)) outcomesByGroupId.set(key, []);
    outcomesByGroupId.get(key).push(String(outcome));
  }
  return outcomesByGroupId;
}

function _logOrphanOutcome(outcome, groupId, contextId) {
  console.log(
    `Fabricate | migrateLegacyResolutionModes: orphan tiered outcome "${outcome}" → "${groupId}" in ${contextId} (no matching result group; left as craft-time misconfiguration)`
  );
}

/** Groups with no inbound outcome keep their names; null when those already collide. */
function _seedUnroutedNames(groups, outcomesByGroupId) {
  const seenNames = new Set();
  for (const group of groups) {
    if (!isPlainObject(group)) continue;
    const groupId = group.id == null ? '' : String(group.id);
    if (outcomesByGroupId.has(groupId)) continue;
    const normalized = normalizeRoutedName(group.name);
    if (!normalized) continue;
    if (seenNames.has(normalized)) return null;
    seenNames.add(normalized);
  }
  return seenNames;
}

/** The lowest-sorted outcome keeps the group, the rest get clones; null on a collision. */
function _applyRenamesAndSplits(outcomesByGroupId, groupsById, seenNames) {
  const clones = [];
  for (const [groupId, outcomes] of outcomesByGroupId) {
    const target = groupsById.get(groupId);
    const sorted = [...outcomes].sort((a, b) => a.localeCompare(b));
    for (const [index, outcome] of sorted.entries()) {
      const normalized = normalizeRoutedName(outcome);
      if (seenNames.has(normalized)) return null;
      seenNames.add(normalized);
      if (index === 0) {
        target.name = outcome;
      } else {
        // Deep-copy so the clone shares no nested array by reference with the original.
        clones.push({ ..._clone(target), id: _randomId(), name: outcome });
      }
    }
  }
  return clones;
}

function _logRemovedRecipe(recipe) {
  console.log(
    `Fabricate | migrateLegacyResolutionModes: removed unmigratable recipe (post-rename ResultGroup.name collision) ${JSON.stringify(
      { id: recipe.id, name: recipe.name, craftingSystemId: recipe.craftingSystemId }
    )}`
  );
}

function _randomId() {
  // `crypto.randomUUID` exists in Node 22 and the browser, so no Foundry global is needed.
  return crypto.randomUUID();
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
