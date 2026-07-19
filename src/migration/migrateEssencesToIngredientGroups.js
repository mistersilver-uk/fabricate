/**
 * 1.17.0 — Supersede the per-set `IngredientSet.essences` map with first-class
 * essence ingredient GROUPS, then reconcile the alchemy signature collisions that
 * folding essences into signature-bearing groups can introduce (issue 649).
 *
 * Every positive `set.essences[essenceId]` entry is rewritten into an equivalent
 * SINGLE-OPTION essence group
 * (`{ options: [{ quantity: 1, match: { type: 'essence', essenceId, amount } }] }`)
 * appended to the set's `ingredientGroups`, then `set.essences` is deleted. Because
 * every group in a set is AND-required, one single-option essence group per essence
 * preserves the old "in addition to" AND semantics exactly.
 *
 * Pure, deep-clone, idempotent, one-way:
 *
 *  - **Payload is `data.recipes`** (NOT `data.systems`): ingredient sets are
 *    persisted under the recipes setting; `data.systems` carries ZERO ingredient
 *    sets and is read READ-ONLY here for each alchemy system's components (needed by
 *    the collision reconciliation). Mirrors {@link migrateAlchemyCheckMode}'s
 *    `_clone(data.recipes)` / `return { recipes }` precedent.
 *  - Walks recipe-level `recipe.ingredientSets[]` AND step-level
 *    `recipe.steps[].ingredientSets[]` (a step-level `set.essences` would orphan
 *    when the back-compat read is later removed).
 *  - Drops empty / non-positive essence entries (already runtime no-ops) —
 *    behavior-preserving.
 *  - Idempotency: guarded on a non-empty `essences` map, so a set already lacking
 *    one (re-run, or authored post-migration) is untouched.
 *  - IDs via `crypto.randomUUID()` (available in Node 22 and the Foundry browser
 *    context; keeps the migration pure/Foundry-free and satisfies the Sonar S2245
 *    "no `Math.random`" gate). `foundry.utils.randomID()` throws under `node --test`.
 *
 * ## Post-migration alchemy-collision reconciliation (issue 649 §3a)
 *
 * `set.essences` never contributed to `SignatureValidator` overlap detection.
 * Folding essences into groups makes them signature-bearing, so a required essence
 * group GROWS a set's transversal coverage and can SILENTLY introduce new
 * collisions. Because {@link SignatureValidator#validateSystem} is now enabled-scoped
 * and every migrated recipe starts enabled, ONE pass over the all-enabled migrated
 * set finds every collision; both participant recipes of each conflict are disabled
 * (mirroring the runtime `disableSignatureConflicts` policy at the data level — this
 * pure fn cannot call the runtime helper, which reads `game.fabricate`). The enabled
 * residual is then pairwise collision-free, so on load `computeSystemVisibility`
 * reports no `blocks:'system'`.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.recipes] Raw recipes setting.
 * @param {Array<object>} [data.systems] Raw crafting systems setting (read-only).
 * @returns {{ recipes: Array<object>, _essenceCollisionDisabledRecipes?: string[] }}
 */
import { SignatureValidator } from '../systems/SignatureValidator.js';

export function migrateEssencesToIngredientGroups(data = {}) {
  const recipes = _clone(data.recipes);
  if (!Array.isArray(recipes)) {
    return { recipes: data.recipes };
  }

  for (const recipe of recipes) {
    if (!_isPlainObject(recipe)) continue;
    _rewriteRecipeSets(recipe.ingredientSets);
    for (const step of Array.isArray(recipe.steps) ? recipe.steps : []) {
      if (_isPlainObject(step)) _rewriteRecipeSets(step.ingredientSets);
    }
  }

  const disabledNames = _reconcileAlchemyCollisions(recipes, data.systems);

  return disabledNames.length > 0
    ? { recipes, _essenceCollisionDisabledRecipes: disabledNames }
    : { recipes };
}

/**
 * Rewrite every set in an ingredient-set array: fold each positive `set.essences`
 * entry into a single-option essence group and delete the map.
 * @param {Array<object>} sets
 */
function _rewriteRecipeSets(sets) {
  if (!Array.isArray(sets)) return;
  for (const set of sets) {
    if (!_isPlainObject(set)) continue;
    const essences = _isPlainObject(set.essences) ? set.essences : null;
    // Idempotency: a set with no essence map (re-run / post-migration author) is
    // untouched, and its `essences` key is left as-is (already absent or empty).
    if (!essences || Object.keys(essences).length === 0) {
      if ('essences' in set && !_isPlainObject(set.essences)) delete set.essences;
      continue;
    }
    const groups = Array.isArray(set.ingredientGroups) ? set.ingredientGroups : [];
    for (const [essenceId, rawAmount] of Object.entries(essences)) {
      const amount = Number(rawAmount);
      // Drop empty / non-positive entries (runtime no-ops) — behavior-preserving.
      if (!Number.isFinite(amount) || amount <= 0) continue;
      groups.push({
        id: crypto.randomUUID(),
        name: '',
        options: [{ quantity: 1, match: { type: 'essence', essenceId, amount } }],
      });
    }
    set.ingredientGroups = groups;
    delete set.essences;
  }
}

/**
 * Per alchemy system, build a data-backed `SignatureValidator` over the migrated
 * recipes (filtered by `craftingSystemId`) + that system's components, and disable
 * BOTH participants of every conflict. Returns the disabled recipe NAMES for the
 * post-load GM notice.
 * @param {Array<object>} recipes Migrated recipes (mutated in place).
 * @param {Array<object>} systems Raw crafting systems (read-only).
 * @returns {string[]}
 */
function _reconcileAlchemyCollisions(recipes, systems) {
  if (!Array.isArray(systems)) return [];
  const recipeById = new Map();
  for (const recipe of recipes) {
    if (_isPlainObject(recipe) && recipe.id != null) recipeById.set(recipe.id, recipe);
  }

  const disabledIds = new Set();
  for (const system of systems) {
    if (!_isAlchemySystem(system)) continue;
    const systemId = system.id;
    const systemRecipes = recipes.filter(
      (recipe) => _isPlainObject(recipe) && recipe.craftingSystemId === systemId
    );
    const components = Array.isArray(system.components) ? system.components : [];
    const validator = new SignatureValidator({
      getSystem: (id) => (id === systemId ? system : null),
      // All migrated recipes start enabled, so one enabled-scoped pass finds every
      // collision. `validateSystem` filters to enabled recipes.
      getRecipesForSystem: (id) => (id === systemId ? systemRecipes : []),
      getComponentsForSystem: (id) => (id === systemId ? components : []),
    });
    const { conflicts } = validator.validateSystem(systemId);
    for (const conflict of conflicts) {
      for (const id of [conflict.recipeA?.id, conflict.recipeB?.id]) {
        const recipe = id == null ? null : recipeById.get(id);
        if (recipe) {
          recipe.enabled = false;
          disabledIds.add(id);
        }
      }
    }
  }

  return [...disabledIds]
    .map((id) => recipeById.get(id)?.name)
    .filter((name) => typeof name === 'string' && name.length > 0);
}

/** Whether a system is in alchemy mode (accepting the legacy `cauldron` alias). */
function _isAlchemySystem(system) {
  return (
    _isPlainObject(system) &&
    (system.resolutionMode === 'alchemy' || system.resolutionMode === 'cauldron')
  );
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
