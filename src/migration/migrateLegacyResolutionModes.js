/**
 * 1.4.0 — Hard-migrate legacy crafting resolution modes `mapped`/`tiered` to
 * canonical `routed` + a seeded result-selection provider (pure, idempotent,
 * version-gated). Per `007-destructive-changes-and-migrations §Resolution-Model
 * Migration (Pre-Release)`, this is a TRUE one-time read-legacy → write-canonical
 * migration: no permanent live `tiered` branch and no permanent `outcomeRouting`
 * read-shim are retained anywhere in the active runtime.
 *
 * Operates on the runner's `systems` and `recipes` payload keys.
 *
 * System migration (for each system whose `resolutionMode` is `mapped`/`tiered`):
 *  - `resolutionMode`: `mapped`/`tiered` → `routed`.
 *  - `salvageResolutionMode`: `tiered` → `routed` (token only; salvage keeps its
 *    own `outcomeRouting` model at runtime, so salvage routing data is untouched).
 *
 * Recipe migration (for each recipe belonging to a former mapped/tiered system):
 *  - former `mapped` → seed `resultSelection.provider = 'ingredientSet'`
 *    (the mapped routing is byte-identical to the canonical `ingredientSet`
 *    contract — no data reshaping beyond provider seeding).
 *  - former `tiered` → seed `resultSelection.provider = 'check'` (the canonical
 *    routed provider) and run the GROUP-NAME RECONCILIATION below so canonical
 *    name-matching reproduces the legacy `outcomeRouting` behavior, then DELETE
 *    `outcomeRouting`. (Originally seeded the now-removed `macroOutcome` alias; the
 *    1.6.0 migration folded that alias into `check`, so this seed targets `check`
 *    directly and an upgrading world's persisted `macroOutcome` is caught up by 1.6.0.)
 *
 * Tiered group-name reconciliation (recipe-level and per-step, deterministic):
 *  For each `outcomeRouting[outcome] → groupId`, rename the target
 *  `ResultGroup.name` to the `outcome` string. Edge cases:
 *   1. Orphan outcome (no resolvable group): logged, recipe still migratable (the
 *      outcome resolves to a craft-time misconfiguration under `check`,
 *      matching the old empty-routing result). NOT a deletion cause.
 *   2. Fan-in (multiple outcomes → one group): split — the lowest-sorted outcome
 *      keeps the original group; each other outcome gets a clone (new unique id,
 *      identical results) named after it. No name collision, same results awarded.
 *   3. Unrouted group (no inbound outcome): name left as-is (unreachable by
 *      name-matching, identical to the old behavior).
 *   4. Reserved-keyword outcome (fail/miss/hazard family): drops to the failure
 *      path; the entry is dropped and NO group is renamed to a reserved keyword.
 *   5. Post-rename normalized-name collision: the recipe is unmigratable and is
 *      HARD-DELETED with cascade cleanup + JSON log (per §211-213).
 *
 * Idempotent: once no `mapped`/`tiered` token and no `outcomeRouting` remain, a
 * re-run finds nothing to transform and is a no-op.
 *
 * Pure: returns `{ systems, recipes }` and performs no I/O (logging excepted).
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {Array<object>} [data.recipes] Raw recipes setting.
 * @returns {{ systems: Array<object>, recipes: Array<object> }}
 */
import { normalizeRoutedName, isReservedRoutedName } from '../utils/routedOutcomeKeywords.js';

const LEGACY_MODES = new Set(['mapped', 'tiered']);

export function migrateLegacyResolutionModes(data = {}) {
  const systems = _clone(data.systems);
  const recipes = _clone(data.recipes);

  if (!Array.isArray(systems)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  // Map each system id to the provider its recipes should be seeded with, derived
  // from the legacy mode BEFORE the system mode token is rewritten.
  const providerBySystemId = _migrateSystems(systems);

  if (providerBySystemId.size === 0 || !Array.isArray(recipes)) {
    return {
      systems,
      recipes: Array.isArray(recipes) ? recipes : data.recipes,
    };
  }

  return { systems, recipes: _migrateRecipes(recipes, providerBySystemId) };
}

/**
 * Rewrite every legacy system mode token in place and return the map of system id
 * → provider its recipes should be seeded with (derived from the legacy mode
 * BEFORE the token was rewritten).
 * @param {Array<object>} systems
 * @returns {Map<string, string>}
 */
function _migrateSystems(systems) {
  const providerBySystemId = new Map();
  for (const system of systems) {
    if (!_isPlainObject(system)) continue;
    const legacyMode = system.resolutionMode;
    if (LEGACY_MODES.has(legacyMode)) {
      providerBySystemId.set(
        String(system.id),
        legacyMode === 'mapped' ? 'ingredientSet' : 'check'
      );
      system.resolutionMode = 'routed';
    }
    if (system.salvageResolutionMode === 'tiered') {
      system.salvageResolutionMode = 'routed';
    }
  }
  return providerBySystemId;
}

/**
 * Migrate every recipe belonging to a former mapped/tiered system, returning the
 * surviving recipes (unmigratable former-tiered recipes are dropped + logged).
 * @param {Array<object>} recipes
 * @param {Map<string, string>} providerBySystemId
 * @returns {Array<object>}
 */
function _migrateRecipes(recipes, providerBySystemId) {
  const survivors = [];
  for (const recipe of recipes) {
    const provider = _isPlainObject(recipe)
      ? providerBySystemId.get(String(recipe.craftingSystemId))
      : undefined;
    if (!provider) {
      survivors.push(recipe);
      continue;
    }

    if (provider === 'ingredientSet') {
      _seedProvider(recipe, 'ingredientSet');
      survivors.push(recipe);
      continue;
    }

    // Former tiered → check with group-name reconciliation across the recipe-level
    // container and every step container. (`check` is the canonical routed provider;
    // the legacy `macroOutcome` alias this once seeded was removed in 1.6.0.)
    _seedProvider(recipe, 'check');
    if (_reconcileTieredRecipe(recipe)) {
      survivors.push(recipe);
    } else {
      _logRemovedRecipe(recipe);
    }
  }
  return survivors;
}

function _seedProvider(recipe, provider) {
  if (!_isPlainObject(recipe.resultSelection)) {
    recipe.resultSelection = { provider };
    return;
  }
  recipe.resultSelection.provider = provider;
}

/**
 * Reconcile a former-tiered recipe's `outcomeRouting` into canonical `check`
 * group names across the recipe container and each step, then
 * drop every `outcomeRouting` map. Returns false if any container is
 * unmigratable (post-rename normalized-name collision).
 * @param {object} recipe
 * @returns {boolean} migratable
 */
function _reconcileTieredRecipe(recipe) {
  let migratable = _reconcileContainer(recipe, recipe.id);

  if (Array.isArray(recipe.steps)) {
    for (const step of recipe.steps) {
      if (!_isPlainObject(step)) continue;
      const ok = _reconcileContainer(step, `${recipe.id}/${step.id}`);
      migratable = migratable && ok;
    }
  }

  return migratable;
}

/**
 * Reconcile one container (recipe or step) holding `outcomeRouting` + a
 * `resultGroups` array. Renames/splits groups to match canonical name routing,
 * then deletes `outcomeRouting`. Returns false on an unavoidable normalized-name
 * collision.
 * @param {object} container
 * @param {string} contextId for logging
 * @returns {boolean} migratable
 */
function _reconcileContainer(container, contextId) {
  const routing = container.outcomeRouting;
  // No routing on this container: nothing to reconcile (case 3 groups keep their
  // names). Still drop a present-but-empty map so the data becomes canonical.
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

/**
 * Index plain-object groups by their stringified id.
 * @param {Array<object>} groups
 * @returns {Map<string, object>}
 */
function _indexGroupsById(groups) {
  const groupsById = new Map();
  for (const group of groups) {
    if (_isPlainObject(group) && group.id != null) groupsById.set(String(group.id), group);
  }
  return groupsById;
}

/**
 * Group the inbound outcomes by their target groupId, dropping reserved-keyword
 * outcomes (case 4 — they take the failure path; no group is renamed) and orphan
 * outcomes (case 1 — logged, left as a craft-time misconfiguration).
 * @param {object} routing
 * @param {Map<string, object>} groupsById
 * @param {string} contextId
 * @returns {Map<string, Array<string>>}
 */
function _groupOutcomesByGroupId(routing, groupsById, contextId) {
  const outcomesByGroupId = new Map();
  for (const [outcome, groupId] of Object.entries(routing)) {
    // Reserved-keyword outcome: failure path handles it; never rename a group to
    // a reserved keyword.
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
  // Orphan: no resolvable group. Log and leave it; under the canonical `check`
  // provider the outcome resolves to a craft-time misconfiguration, matching old
  // behavior.
  console.log(
    `Fabricate | migrateLegacyResolutionModes: orphan tiered outcome "${outcome}" → "${groupId}" in ${contextId} (no matching result group; left as craft-time misconfiguration)`
  );
}

/**
 * Seed the name space with the normalized names of groups that have NO inbound
 * outcome (case 3: their names are preserved and still occupy the name space).
 * Returns null if those preserved names already collide (unmigratable).
 * @param {Array<object>} groups
 * @param {Map<string, Array<string>>} outcomesByGroupId
 * @returns {Set<string> | null}
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
 * Apply renames + fan-in splits, tracking normalized names to detect collisions.
 * The lowest-sorted outcome keeps the original group; each other outcome gets a
 * fresh-id clone. Returns the clones to append, or null on an unavoidable name
 * collision (unmigratable).
 * @param {Map<string, Array<string>>} outcomesByGroupId
 * @param {Map<string, object>} groupsById
 * @param {Set<string>} seenNames
 * @returns {Array<object> | null}
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
        // Deep-copy so the clone does not share `results` (or any nested array)
        // by reference with the original group, consistent with `_clone` usage.
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
  // `crypto.randomUUID` is available in Node 22 and the Foundry browser context,
  // so the migration stays pure, Foundry-free, and unit-testable without globals.
  // Result-group ids are free-form internal reference strings, so a UUID is fine.
  return crypto.randomUUID();
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
