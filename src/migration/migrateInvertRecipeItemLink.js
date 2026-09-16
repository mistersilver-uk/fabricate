/**
 * `1.13.0` — invert the recipe-to-recipe-item link (issue 511): membership moves off each recipe's
 * scalar reverse ref, which allowed at most ONE book, onto each definition's many-to-many
 * `recipeIds[]`, and the relocated fields are stripped. Each recipe's book is resolved the SAME way
 * the old runtime did — by `recipeItemId`, else by `linkedRecipeItemUuid` against an origin uuid.
 * Pure and idempotent: after a run the recipes carry neither field, and existing `recipeIds` survive.
 */
export function migrateInvertRecipeItemLink(data = {}) {
  const systems = _clone(data.systems);
  const recipes = _clone(data.recipes);

  if (!Array.isArray(systems) || !Array.isArray(recipes)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  // Per-system definition lookups (by id and by source uuid); ensure every
  // definition carries a `recipeIds` array to receive membership.
  const systemIndex = new Map();
  for (const system of systems) {
    if (!_isPlainObject(system)) continue;
    const definitions = Array.isArray(system.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    const byId = new Map();
    const bySource = new Map();
    for (const def of definitions) {
      if (!_isPlainObject(def)) continue;
      if (!Array.isArray(def.recipeIds)) def.recipeIds = [];
      const id = String(def.id || '').trim();
      if (id) byId.set(id, def);
      // New-name-first, legacy-name-tolerant: this runs ahead of the `1.16.0` field rename, so it
      // normally sees the legacy spelling, but tolerating the new one keeps it correct either way.
      const source = String(def.originItemUuid || def.sourceItemUuid || '').trim();
      if (source) bySource.set(source, def);
    }
    systemIndex.set(String(system.id || ''), { byId, bySource });
  }

  for (const recipe of recipes) {
    if (!_isPlainObject(recipe)) continue;
    const recipeId = String(recipe.id || '').trim();
    const sysIdx = systemIndex.get(String(recipe.craftingSystemId || ''));

    // Only the `linkedRecipeItemUuid` path resolving the book makes that uuid a book alias that may
    // be stripped. If `recipeItemId` resolves the book while a DISTINCT `linkedRecipeItemUuid` points
    // elsewhere — a standalone alchemy formula item — that link is unrelated and MUST survive.
    let linkedUuidResolvedBook = false;
    if (recipeId && sysIdx) {
      const recipeItemId = String(recipe.recipeItemId || '').trim();
      let def = recipeItemId ? sysIdx.byId.get(recipeItemId) : null;
      if (!def) {
        const legacyUuid = String(recipe.linkedRecipeItemUuid || '').trim();
        if (legacyUuid) {
          def = sysIdx.bySource.get(legacyUuid) || null;
          if (def) linkedUuidResolvedBook = true;
        }
      }
      if (def && !def.recipeIds.includes(recipeId)) def.recipeIds.push(recipeId);
    }

    // Drop the book-only `recipeItemId` unconditionally; drop `linkedRecipeItemUuid` ONLY when it
    // was itself the ref that resolved to a book, else it is the standalone formula-item link.
    if ('recipeItemId' in recipe) delete recipe.recipeItemId;
    if (linkedUuidResolvedBook && 'linkedRecipeItemUuid' in recipe) {
      delete recipe.linkedRecipeItemUuid;
    }
  }

  return { systems, recipes };
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
