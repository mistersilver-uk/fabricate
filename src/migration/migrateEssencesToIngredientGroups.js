/**
 * `1.17.0` — supersede the per-set `IngredientSet.essences` map with first-class essence ingredient
 * GROUPS, then reconcile the alchemy signature collisions that introduces (issue 649). Pure,
 * deep-clone, idempotent, one-way; spec § Essences → Ingredient Groups Migration owns the rules.
 * THE PAYLOAD IS `data.recipes`, with `data.systems` read-only. Ids come from `crypto.randomUUID()`,
 * which keeps this Foundry-free — `foundry.utils.randomID()` throws under `node --test`.
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
 * Rewrite every set in an array: fold each positive `essences` entry into a single-option essence
 * group and delete the map. Empty or non-positive entries are dropped as the no-ops they were.
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
 * Per alchemy system, validate the migrated recipes against that system's components and disable
 * BOTH participants of every conflict, answering the disabled names for the GM notice.
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
