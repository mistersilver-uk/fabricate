/**
 * `1.4.0` — hard-migrate the legacy `mapped`/`tiered` crafting resolution modes to the canonical
 * routed modes. Pure, idempotent, version-gated; spec § Resolution-Model Migration (Pre-Release)
 * owns the mapping and its five edge cases. A TRUE one-time read-legacy, write-canonical migration,
 * so NO live `tiered` branch and no `outcomeRouting` read-shim is retained in the runtime. A former
 * `mapped` recipe is carried VERBATIM, mapped routing being byte-identical to ingredient-set.
 */
import { normalizeRoutedName, isReservedRoutedName } from '../utils/routedOutcomeKeywords.js';

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

/**
 * Rewrite every legacy system mode token in place, answering `systemId → the routed mode its
 * recipes now belong to`, derived BEFORE the token was rewritten.
 */
function _migrateSystems(systems) {
  const modeBySystemId = new Map();
  for (const system of systems) {
    if (!_isPlainObject(system)) continue;
    const target = LEGACY_MODE_TARGETS[system.resolutionMode];
    if (target) {
      modeBySystemId.set(String(system.id), target);
      system.resolutionMode = target;
    }
    if (system.salvageResolutionMode === 'tiered') {
      system.salvageResolutionMode = 'routed';
    }
  }
  return modeBySystemId;
}

/**
 * Migrate every recipe of a former mapped/tiered system, answering the survivors: an unmigratable
 * former-tiered recipe is dropped and logged.
 */
function _migrateRecipes(recipes, modeBySystemId) {
  const survivors = [];
  for (const recipe of recipes) {
    const mode = _isPlainObject(recipe)
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

    // Former tiered: reconcile group names across the recipe container and every step, so canonical
    // check name-matching reproduces the legacy `outcomeRouting` behaviour.
    if (_reconcileTieredRecipe(recipe)) {
      survivors.push(recipe);
    } else {
      _logRemovedRecipe(recipe);
    }
  }
  return survivors;
}

/**
 * Reconcile a former-tiered recipe's `outcomeRouting` into canonical `check` group names across the
 * recipe and each step, then drop every routing map. False when any container is unmigratable.
 */
function _reconcileTieredRecipe(recipe) {
  let migratable = _reconcileContainer(recipe, recipe.id);

  if (Array.isArray(recipe.steps)) {
    for (const step of recipe.steps) {
      if (!_isPlainObject(step)) continue;
      const ok = _reconcileContainer(step, `${recipe.id}/${step.id}`);
      migratable &&= ok;
    }
  }

  return migratable;
}

/**
 * Reconcile ONE container, then delete its `outcomeRouting`. False on an unavoidable
 * normalized-name collision.
 */
function _reconcileContainer(container, contextId) {
  const routing = container.outcomeRouting;
  // No routing here: nothing to reconcile. Still drop a present-but-empty map so the data becomes
  // canonical.
  if (!_isPlainObject(routing)) {
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

/** Index plain-object groups by their stringified id. */
function _indexGroupsById(groups) {
  const groupsById = new Map();
  for (const group of groups) {
    if (_isPlainObject(group) && group.id != null) groupsById.set(String(group.id), group);
  }
  return groupsById;
}

/**
 * Group the inbound outcomes by target groupId, dropping reserved-keyword outcomes (they take the
 * failure path, and no group is renamed to one) and orphan outcomes (logged, left as a craft-time
 * misconfiguration).
 */
function _groupOutcomesByGroupId(routing, groupsById, contextId) {
  const outcomesByGroupId = new Map();
  for (const [outcome, groupId] of Object.entries(routing)) {
    // Reserved-keyword outcome: the failure path handles it; never rename a group to one.
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
  // Orphan: under the canonical `check` provider the outcome resolves to a craft-time
  // misconfiguration, which matches the old behaviour.
  console.log(
    `Fabricate | migrateLegacyResolutionModes: orphan tiered outcome "${outcome}" → "${groupId}" in ${contextId} (no matching result group; left as craft-time misconfiguration)`
  );
}

/**
 * Seed the name space with the normalized names of groups that have NO inbound outcome — their
 * names are preserved and still occupy it. Null when those names already collide.
 */
function _seedUnroutedNames(groups, outcomesByGroupId) {
  const seenNames = new Set();
  for (const group of groups) {
    if (!_isPlainObject(group)) continue;
    const groupId = group.id == null ? '' : String(group.id);
    if (outcomesByGroupId.has(groupId)) continue;
    const normalized = normalizeRoutedName(group.name);
    if (!normalized) continue;
    if (seenNames.has(normalized)) return null;
    seenNames.add(normalized);
  }
  return seenNames;
}

/**
 * Apply renames and fan-in splits, tracking normalized names to detect collisions: the
 * lowest-sorted outcome keeps the original group and each other gets a fresh-id clone.
 * Answers the clones to append, or null on an unavoidable collision.
 */
function _applyRenamesAndSplits(outcomesByGroupId, groupsById, seenNames) {
  const clones = [];
  for (const [groupId, outcomes] of outcomesByGroupId) {
    const target = groupsById.get(groupId);
    // Deterministic order: lowest-sorted outcome keeps the original group.
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
  // `crypto.randomUUID` exists in Node 22 and the Foundry browser context, so the migration stays
  // pure and unit-testable without globals. Result-group ids are free-form internal strings.
  return crypto.randomUUID();
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
