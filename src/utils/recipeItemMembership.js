/**
 * Which recipe item definitions CONTAIN a recipe — the ONE implementation of that rule
 * (issue 1155).
 *
 * **Why this module exists.** The rule was implemented five times: twice in
 * `CraftingSystemManager` (`getRecipeItemDefinitionsContaining` and the legacy seed's
 * resolver), once in `RecipeVisibilityService` (player-facing), once in
 * `utils/recipeDeleteImpact.js`, and once in `adminRecipeRowProjection` — and they had
 * ALREADY drifted: the row projection had no `linkedRecipeItemUuid` → `originItemUuid`
 * leg, so on an un-migrated world the GM browser's book column and the delete card's
 * impact statement could name different books for the same recipe. Every caller now
 * routes here, so "what contains what" cannot answer differently depending on who asks.
 *
 * **Two bases, chosen by a marker and never inferred.** Membership is canonically the
 * definition's own `recipeIds[]` (issue 511's many-to-many). The recipe's legacy scalar
 * reverse ref resolves it only while the system's `membershipResolvesByRecipeIds` marker
 * is unset. The marker is a PARAMETER here, not a predicate over the arrays (issue 1011):
 * the retired "any definition has a non-empty `recipeIds`" inference flipped in BOTH
 * directions, so the first membership write orphaned every scalar-only member and
 * emptying the last array resurrected phantom membership for every player at once.
 *
 * **The legacy fallback order is load-bearing, including its refusal to fall through.**
 * A PRESENT `recipeItemId` resolves by definition id and the `linkedRecipeItemUuid`
 * branch is NOT consulted even when that id names nothing; only an ABSENT `recipeItemId`
 * falls through to the uuid leg. Falling through on a dangling id (as the 1.13.0
 * migration deliberately does) would state a membership the legacy basis never resolved.
 *
 * **This module is a LEAF and imports nothing.** It is reached from `systems/` and from
 * the store projections that the mounted Svelte suites pull in, so anything it imported
 * would land in every mounted component's dependency closure. It reads no Foundry global
 * and mutates nothing it is handed.
 *
 * **Data access is injected, the rule is not.** `CraftingSystemManager` and
 * `RecipeVisibilityService` answer the `recipeIds[]` leg from the retained
 * `recipeId -> definitions` index (issue 1076) rather than a per-check linear scan, so
 * they pass that lookup in ({@link module:utils/definitionIndex.indexedMembershipLookups})
 * instead of this module importing the index. A lookup substitutes HOW a set of
 * definitions is found, never WHICH question is asked or in what order — an injected
 * lookup that disagrees with the default scan is a defect, and
 * `tests/recipe-item-membership.test.js` runs both forms over one fixture battery to keep
 * them honest.
 *
 * **What is deliberately NOT here.** Two membership readers ask a differently shaped
 * question and keep their own code: the manager's
 * `_getRecipeObjectsReferencingRecipeItemDefinition` answers the REVERSE query (which
 * recipes does this book contain), and `InventoryListingBuilder` groups a whole system's
 * recipes by book in one pass for a player listing. Neither can be expressed as a call to
 * this function without making it once per recipe, so they are not copies of it going
 * stale — they are the other direction.
 * `adminSystemInspectorProjection.enrichRecipeItemLibrary` is book-side too, and resolves
 * ids the recipe-side projection already derived through this module.
 *
 * @module utils/recipeItemMembership
 */

function trimmed(value) {
  return String(value ?? '').trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * The default, index-free lookups: a scan of the supplied definitions.
 *
 * Each takes `(definitions, key)` rather than closing over the definitions, so the object
 * is built once at module scope and a caller on a player-facing path allocates nothing
 * per membership question.
 */
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

/**
 * The definition a recipe belongs to under the LEGACY scalar basis, or `null`.
 *
 * Exported because the first-write seed (`_seedMembershipFromLegacyScalars`) needs this
 * half on its own: it carries legacy membership onto the arrays and must resolve exactly
 * what the legacy READERS resolved, or switching basis would change resolved membership —
 * which is the one thing that seed exists to prevent.
 *
 * See the module docblock for why a dangling `recipeItemId` deliberately does NOT fall
 * through to the uuid leg.
 *
 * @param {object[]} definitions A system's `recipeItemDefinitions`.
 * @param {object} recipe A recipe object (or its JSON).
 * @param {{byDefinitionId?: Function, byOriginItemUuid?: Function}} [lookups] Optional
 *   data-access overrides; see the module docblock.
 * @returns {object|null} The matching definition, or `null` when none resolves.
 */
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

/**
 * The recipe item definitions of a system that contain `recipe`, under the supplied basis.
 *
 * Returns a fresh array every time: an index-backed `byRecipeId` hands back the SHARED
 * bucket, which a caller must not be able to mutate.
 *
 * @param {object[]} definitions A system's `recipeItemDefinitions`.
 * @param {object} recipe A recipe object (or its JSON). Only `id`, `recipeItemId` and
 *   `linkedRecipeItemUuid` are read, so a caller holding just an id may pass `{ id }` —
 *   the legacy legs then resolve nothing, exactly as they do for an unlinked recipe.
 * @param {boolean} membershipResolvesByRecipeIds The system's basis marker. Compared with
 *   `=== true`, so a missing marker fails to the LEGACY basis — the safe direction.
 * @param {{byRecipeId?: Function, byDefinitionId?: Function, byOriginItemUuid?: Function}}
 *   [lookups] Optional data-access overrides; see the module docblock.
 * @returns {object[]} The containing definitions, in definition order; never null.
 */
export function recipeItemDefinitionsContaining(
  definitions,
  recipe,
  membershipResolvesByRecipeIds,
  lookups = {}
) {
  const recipeId = trimmed(recipe?.id);
  if (!recipeId) return [];

  // The caller's OWN array, never a filtered copy: `getDefinitionIndex` caches by array
  // identity, so handing an index-backed lookup a fresh array per call would rebuild the
  // whole index on every access check — the exact per-check cost issue 1076 removed. A
  // null or non-object element is instead tolerated by each lookup.
  const defs = toArray(definitions);
  const byRecipeId = lookups.byRecipeId ?? DEFAULT_LOOKUPS.byRecipeId;
  const byMembership = toArray(byRecipeId(defs, recipeId));
  if (byMembership.length > 0) return [...byMembership];

  if (membershipResolvesByRecipeIds === true) return [];

  const legacy = resolveLegacyMembershipDefinition(defs, recipe, lookups);
  return legacy ? [legacy] : [];
}
