/**
 * Which recipe item definitions CONTAIN a recipe — the ONE implementation of that rule (issue 1155),
 * replacing five copies that had already drifted. Membership is canonically the definition's
 * `recipeIds[]`; the recipe's legacy scalar resolves it only while `membershipResolvesByRecipeIds`
 * is unset, and that marker is a PARAMETER, never inferred from the arrays (issue 1011). A PRESENT
 * `recipeItemId` never falls through to the uuid leg. A LEAF that imports nothing: the `recipeIds[]`
 * lookup is injected so `definitionIndex.js` can serve it, while the rule itself never is.
 */

function trimmed(value) {
  return String(value ?? '').trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/** The default, index-free lookups: a scan of the supplied definitions. */
const DEFAULT_LOOKUPS = Object.freeze({
  byRecipeId: (definitions, recipeId) =>
    definitions.filter((definition) =>
      toArray(definition?.recipeIds).some((id) => trimmed(id) === recipeId)
    ),
  byDefinitionId: (definitions, definitionId) =>
    definitions.find((definition) => trimmed(definition?.id) === definitionId) ?? null,
  byOriginItemUuid: (definitions, originItemUuid) =>
    definitions.find((definition) => trimmed(definition?.originItemUuid) === originItemUuid) ??
    null,
});

/** The definition a recipe belongs to under the LEGACY scalar basis, or `null`. */
export function resolveLegacyMembershipDefinition(definitions, recipe, lookups = {}) {
  const defs = toArray(definitions);

  const recipeItemId = trimmed(recipe?.recipeItemId);
  if (recipeItemId) {
    const byDefinitionId = lookups.byDefinitionId ?? DEFAULT_LOOKUPS.byDefinitionId;
    return byDefinitionId(defs, recipeItemId) || null;
  }

  const legacyUuid = trimmed(recipe?.linkedRecipeItemUuid);
  if (!legacyUuid) return null;
  const byOriginItemUuid = lookups.byOriginItemUuid ?? DEFAULT_LOOKUPS.byOriginItemUuid;
  return byOriginItemUuid(defs, legacyUuid) || null;
}

/** The recipe item definitions of a system that contain `recipe`, under the supplied basis. */
export function recipeItemDefinitionsContaining(
  definitions,
  recipe,
  membershipResolvesByRecipeIds,
  lookups = {}
) {
  const recipeId = trimmed(recipe?.id);
  if (!recipeId) return [];

  // The caller's OWN array, never a filtered copy: `getDefinitionIndex` caches by array identity,
  // so handing an index-backed lookup a fresh array per call would rebuild the whole index on every
  // access check — the exact per-check cost issue 1076 removed.
  const defs = toArray(definitions);
  const byRecipeId = lookups.byRecipeId ?? DEFAULT_LOOKUPS.byRecipeId;
  const byMembership = toArray(byRecipeId(defs, recipeId));
  if (byMembership.length > 0) return [...byMembership];

  if (membershipResolvesByRecipeIds === true) return [];

  const legacy = resolveLegacyMembershipDefinition(defs, recipe, lookups);
  return legacy ? [legacy] : [];
}
