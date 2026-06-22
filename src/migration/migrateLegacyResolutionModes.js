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
 *  - former `tiered` → seed `resultSelection.provider = 'macroOutcome'` and run
 *    the GROUP-NAME RECONCILIATION below so canonical name-matching reproduces the
 *    legacy `outcomeRouting` behavior, then DELETE `outcomeRouting`.
 *
 * Tiered group-name reconciliation (recipe-level and per-step, deterministic):
 *  For each `outcomeRouting[outcome] → groupId`, rename the target
 *  `ResultGroup.name` to the `outcome` string. Edge cases:
 *   1. Orphan outcome (no resolvable group): logged, recipe still migratable (the
 *      outcome resolves to a craft-time misconfiguration under `macroOutcome`,
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
  const providerBySystemId = new Map();
  for (const system of systems) {
    if (!_isPlainObject(system)) continue;
    const legacyMode = system.resolutionMode;
    if (LEGACY_MODES.has(legacyMode)) {
      providerBySystemId.set(
        String(system.id),
        legacyMode === 'mapped' ? 'ingredientSet' : 'macroOutcome'
      );
      system.resolutionMode = 'routed';
    }
    if (system.salvageResolutionMode === 'tiered') {
      system.salvageResolutionMode = 'routed';
    }
  }

  if (providerBySystemId.size === 0 || !Array.isArray(recipes)) {
    return {
      systems,
      recipes: Array.isArray(recipes) ? recipes : data.recipes,
    };
  }

  const survivors = [];
  for (const recipe of recipes) {
    if (!_isPlainObject(recipe)) {
      survivors.push(recipe);
      continue;
    }
    const provider = providerBySystemId.get(String(recipe.craftingSystemId));
    if (!provider) {
      survivors.push(recipe);
      continue;
    }

    if (provider === 'ingredientSet') {
      _seedProvider(recipe, 'ingredientSet');
      survivors.push(recipe);
      continue;
    }

    // Former tiered → macroOutcome with group-name reconciliation across the
    // recipe-level container and every step container.
    _seedProvider(recipe, 'macroOutcome');
    const migratable = _reconcileTieredRecipe(recipe);
    if (migratable) {
      survivors.push(recipe);
    } else {
      _logRemovedRecipe(recipe);
    }
  }

  return { systems, recipes: survivors };
}

function _seedProvider(recipe, provider) {
  if (!_isPlainObject(recipe.resultSelection)) {
    recipe.resultSelection = { provider };
    return;
  }
  recipe.resultSelection.provider = provider;
}

/**
 * Reconcile a former-tiered recipe's `outcomeRouting` into canonical
 * `macroOutcome` group names across the recipe container and each step, then
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
  const groupsById = new Map();
  for (const group of groups) {
    if (_isPlainObject(group) && group.id != null) groupsById.set(String(group.id), group);
  }

  // Group the inbound outcomes by their target groupId, dropping reserved-keyword
  // outcomes (case 4 — they take the failure path; no group is renamed) and
  // orphan outcomes (case 1 — logged, left as a craft-time misconfiguration).
  const outcomesByGroupId = new Map();
  for (const [outcome, groupId] of Object.entries(routing)) {
    if (isReservedRoutedName(outcome)) {
      // Reserved-keyword outcome: failure path handles it; never rename a group
      // to a reserved keyword.
      continue;
    }
    const key = groupId == null ? '' : String(groupId);
    if (!groupsById.has(key)) {
      // Orphan: no resolvable group. Log and leave it; under macroOutcome the
      // outcome resolves to a craft-time misconfiguration, matching old behavior.
      console.log(
        `Fabricate | migrateLegacyResolutionModes: orphan tiered outcome "${outcome}" → "${groupId}" in ${contextId} (no matching result group; left as craft-time misconfiguration)`
      );
      continue;
    }
    if (!outcomesByGroupId.has(key)) outcomesByGroupId.set(key, []);
    outcomesByGroupId.get(key).push(String(outcome));
  }

  // Apply renames + fan-in splits. Track normalized names to detect collisions.
  const seenNames = new Set();
  // Seed with the normalized names of groups that have NO inbound outcome (case
  // 3: their names are preserved and still occupy the name space).
  for (const group of groups) {
    if (!_isPlainObject(group)) continue;
    const groupId = group.id == null ? '' : String(group.id);
    if (!outcomesByGroupId.has(groupId)) {
      const normalized = normalizeRoutedName(group.name);
      if (normalized) {
        if (seenNames.has(normalized)) return false; // pre-existing collision is unmigratable
        seenNames.add(normalized);
      }
    }
  }

  const clones = [];
  for (const [groupId, outcomes] of outcomesByGroupId) {
    const target = groupsById.get(groupId);
    // Deterministic order: lowest-sorted outcome keeps the original group.
    const sorted = [...outcomes].sort((a, b) => a.localeCompare(b));
    for (const [index, outcome] of sorted.entries()) {
      const normalized = normalizeRoutedName(outcome);
      if (seenNames.has(normalized)) return false; // unavoidable name collision → unmigratable
      seenNames.add(normalized);
      if (index === 0) {
        target.name = outcome;
      } else {
        clones.push({ ...target, id: _randomId(), name: outcome });
      }
    }
  }

  if (clones.length > 0) {
    container.resultGroups = [...groups, ...clones];
  }

  delete container.outcomeRouting;
  return true;
}

function _logRemovedRecipe(recipe) {
  console.log(
    `Fabricate | migrateLegacyResolutionModes: removed unmigratable recipe (post-rename ResultGroup.name collision) ${JSON.stringify(
      { id: recipe.id, name: recipe.name, craftingSystemId: recipe.craftingSystemId }
    )}`
  );
}

function _randomId() {
  // Prefer Foundry's id helper when present (runtime); fall back to a local
  // generator so the migration stays pure and unit-testable without globals.
  if (typeof foundry !== 'undefined' && foundry?.utils?.randomID) {
    return foundry.utils.randomID();
  }
  let id = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}
