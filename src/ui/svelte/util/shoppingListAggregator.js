/**
 * shoppingListAggregator — Pure aggregation function for shopping list (T-059)
 *
 * Takes a list of { recipeId, quantity } entries and recipe evaluation data,
 * sums ingredient needs across recipes, deduplicates by component, and
 * computes have/missing counts per material.
 *
 * No Foundry or DOM dependencies — fully unit-testable.
 */

/**
 * Build a stable deduplication key for an ingredient state.
 * Priority: componentId > itemUuid > description (tag-based fallback)
 *
 * @param {object} ingredientState
 * @returns {string}
 */
function _buildIngredientKey(ingredientState) {
  if (ingredientState.componentId) return `cid:${ingredientState.componentId}`;
  if (ingredientState.itemUuid) return `uuid:${ingredientState.itemUuid}`;
  return `desc:${ingredientState.description ?? 'unknown'}`;
}

/**
 * Merge an incoming ingredient state into an existing aggregated entry.
 *
 * @param {object} existing - The current aggregated entry (mutated in-place)
 * @param {object} incoming - The evaluation state for a single recipe ingredient
 * @param {string} recipeId
 * @param {string} recipeName
 * @param {number} recipeQuantity - The shopping list quantity multiplier
 */
function _mergeIngredient(existing, incoming, recipeId, recipeName, recipeQuantity) {
  const contribution = (incoming.need ?? 0) * recipeQuantity;
  existing.totalNeed += contribution;
  // `have` is shared inventory — always reflect the latest evaluation value
  existing.have = incoming.have ?? 0;
  existing.recipeBreakdown.push({
    recipeId,
    recipeName,
    quantity: recipeQuantity,
    need: incoming.need ?? 0
  });
}

/**
 * Aggregate shopping list entries into a summary of materials needed.
 *
 * @param {Array<{recipeId: string, quantity: number}>} entries
 * @param {object} recipeManager - Must expose getRecipe() and evaluateCraftability()
 * @param {Array} componentSourceActors - Actor inventory sources for have/need calcs
 * @returns {{
 *   ingredients: Array,
 *   essences: Array,
 *   catalysts: Array,
 *   allSatisfied: boolean,
 *   totalRecipes: number,
 *   totalQuantity: number
 * }}
 */
export function aggregateShoppingList(entries, recipeManager, componentSourceActors) {
  if (!entries || entries.length === 0) {
    return {
      ingredients: [],
      essences: [],
      catalysts: [],
      allSatisfied: true,
      totalRecipes: 0,
      totalQuantity: 0
    };
  }

  const ingredientMap = new Map();  // key -> aggregated ingredient entry
  const essenceMap = new Map();     // essenceType -> aggregated essence entry
  const catalystMap = new Map();    // componentId -> catalyst entry

  let totalRecipes = 0;
  let totalQuantity = 0;

  for (const entry of entries) {
    const { recipeId, quantity } = entry;
    if (!quantity || quantity <= 0) continue;

    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) continue;

    totalRecipes += 1;
    totalQuantity += quantity;

    const evaluation = componentSourceActors && componentSourceActors.length > 0
      ? recipeManager.evaluateCraftability(componentSourceActors, recipe)
      : { ingredientStates: [], essenceStates: [], catalystStates: [] };

    const ingredientStates = evaluation?.ingredientStates ?? [];
    const essenceStates = evaluation?.essenceStates ?? [];
    const catalystStates = evaluation?.catalystStates ?? [];

    // --- Ingredients ---
    for (const ing of ingredientStates) {
      const key = _buildIngredientKey(ing);
      if (!ingredientMap.has(key)) {
        ingredientMap.set(key, {
          componentId: ing.componentId ?? null,
          itemUuid: ing.itemUuid ?? null,
          description: ing.description ?? '',
          totalNeed: 0,
          have: ing.have ?? 0,
          recipeBreakdown: []
        });
      }
      _mergeIngredient(ingredientMap.get(key), ing, recipeId, recipe.name, quantity);
    }

    // --- Essences ---
    for (const ess of essenceStates) {
      const type = ess.type ?? ess.essenceType ?? 'unknown';
      if (!essenceMap.has(type)) {
        essenceMap.set(type, {
          type,
          totalNeed: 0,
          have: ess.have ?? 0
        });
      }
      const existing = essenceMap.get(type);
      existing.totalNeed += (ess.need ?? 0) * quantity;
      existing.have = ess.have ?? 0;
    }

    // --- Catalysts (non-consumable — no quantity multiplication, just deduplicate) ---
    for (const cat of catalystStates) {
      const key = cat.componentId ?? cat.name ?? 'unknown';
      if (!catalystMap.has(key)) {
        catalystMap.set(key, {
          componentId: cat.componentId ?? null,
          name: cat.name ?? cat.description ?? key,
          available: cat.available ?? cat.satisfied ?? false
        });
      }
      // Availability: if any evaluation shows it unavailable, mark unavailable
      if (!(cat.available ?? cat.satisfied ?? false)) {
        catalystMap.get(key).available = false;
      }
    }
  }

  // --- Finalise ingredients ---
  const ingredients = Array.from(ingredientMap.values()).map(ing => {
    const missing = Math.max(0, ing.totalNeed - ing.have);
    return {
      ...ing,
      missing,
      satisfied: missing === 0
    };
  });

  // --- Finalise essences ---
  const essences = Array.from(essenceMap.values()).map(ess => {
    const missing = Math.max(0, ess.totalNeed - ess.have);
    return {
      ...ess,
      missing,
      satisfied: missing === 0
    };
  });

  // --- Finalise catalysts ---
  const catalysts = Array.from(catalystMap.values());

  const allSatisfied =
    ingredients.every(i => i.satisfied) &&
    essences.every(e => e.satisfied) &&
    catalysts.every(c => c.available);

  return {
    ingredients,
    essences,
    catalysts,
    allSatisfied,
    totalRecipes,
    totalQuantity
  };
}
