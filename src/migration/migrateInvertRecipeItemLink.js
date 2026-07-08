/**
 * 1.13.0 — Invert the recipe ↔ recipe-item (book/scroll) link (issue 511).
 *
 * Membership used to be a scalar reverse ref on each recipe
 * (`recipe.recipeItemId`, + legacy `recipe.linkedRecipeItemUuid`), so a recipe could
 * belong to at most ONE book. This migration moves membership onto each recipe item
 * definition as a `recipeIds[]` list (many-to-many: a recipe may belong to several
 * books) and strips the now-relocated fields from every recipe.
 *
 * For each recipe it resolves its book the SAME way the old runtime did — by
 * `recipeItemId` against a definition id, else by `linkedRecipeItemUuid` against a
 * definition's `sourceItemUuid` — and pushes the recipe id onto that definition's
 * `recipeIds` (deduped). Then it deletes `recipeItemId` / `linkedRecipeItemUuid`.
 *
 * Idempotent: after a run the recipes carry neither field, so a re-run finds nothing
 * to push and the deletes are no-ops; existing `def.recipeIds` are preserved.
 *
 * Pure: returns `{ systems, recipes }` and performs no I/O.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {Array<object>} [data.recipes] Raw recipes setting.
 * @returns {{ systems: Array<object>, recipes: Array<object> }}
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
      const source = String(def.sourceItemUuid || '').trim();
      if (source) bySource.set(source, def);
    }
    systemIndex.set(String(system.id || ''), { byId, bySource });
  }

  for (const recipe of recipes) {
    if (!_isPlainObject(recipe)) continue;
    const recipeId = String(recipe.id || '').trim();
    const sysIdx = systemIndex.get(String(recipe.craftingSystemId || ''));

    let resolvedToBook = false;
    if (recipeId && sysIdx) {
      const recipeItemId = String(recipe.recipeItemId || '').trim();
      let def = recipeItemId ? sysIdx.byId.get(recipeItemId) : null;
      if (!def) {
        const legacyUuid = String(recipe.linkedRecipeItemUuid || '').trim();
        if (legacyUuid) def = sysIdx.bySource.get(legacyUuid) || null;
      }
      if (def) {
        resolvedToBook = true;
        if (!def.recipeIds.includes(recipeId)) def.recipeIds.push(recipeId);
      }
    }

    // Book membership now lives on the definition, so drop the book-only `recipeItemId`
    // reverse ref. `linkedRecipeItemUuid` is a legacy BOOK alias only when it resolved
    // to a definition; when it does NOT resolve (e.g. a standalone alchemy formula item
    // that is not a recipe-item definition) it is that recipe's formula-item link and
    // MUST be preserved.
    if ('recipeItemId' in recipe) delete recipe.recipeItemId;
    if (resolvedToBook && 'linkedRecipeItemUuid' in recipe) delete recipe.linkedRecipeItemUuid;
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
