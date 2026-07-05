/**
 * Canonical reserved routing keywords for routed-mode outcome matching.
 *
 * The routed `check` provider routes a crafting-check outcome to a `ResultGroup`
 * by NAME. Certain normalized names are RESERVED for the failure path and never
 * match (or name) a real result group:
 *
 *  - the FAIL family:  fail / failed / failure / f
 *  - the MISS family:  miss / missed / m / nothing / none / whiff / whiffed
 *  - the HAZARD family: hazard / danger / complication / trap / oops
 *
 * This single shared set is the source of truth for both
 * `ResolutionModeService` (runtime resolution for the `check` provider) and
 * `Recipe.js` (routed `ResultGroup.name` validation), so the two never drift.
 * Living in the utils layer keeps it importable from both `src/models` and
 * `src/systems` without a layering violation.
 */

export const FAIL_KEYWORDS = Object.freeze(['fail', 'failed', 'failure', 'f']);

export const MISS_KEYWORDS = Object.freeze([
  'miss',
  'missed',
  'm',
  'nothing',
  'none',
  'whiff',
  'whiffed',
]);

export const HAZARD_KEYWORDS = Object.freeze(['hazard', 'danger', 'complication', 'trap', 'oops']);

/**
 * Trim + lowercase a candidate routing name to its normalized comparison form.
 * @param {*} name
 * @returns {string}
 */
export function normalizeRoutedName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

const FAIL_SET = new Set(FAIL_KEYWORDS);
const MISS_SET = new Set(MISS_KEYWORDS);
const HAZARD_SET = new Set(HAZARD_KEYWORDS);

/**
 * Does the (already-normalized or raw) name take the FAIL path? The fail family
 * plus the hazard family route to failure under canonical routed resolution.
 * @param {*} name
 * @returns {boolean}
 */
export function isFailKeyword(name) {
  const normalized = normalizeRoutedName(name);
  return FAIL_SET.has(normalized) || HAZARD_SET.has(normalized);
}

/**
 * Does the name take the MISS path?
 * @param {*} name
 * @returns {boolean}
 */
export function isMissKeyword(name) {
  return MISS_SET.has(normalizeRoutedName(name));
}

/**
 * Is the name reserved (fail/miss/hazard) and therefore forbidden as a routed
 * `ResultGroup.name`?
 * @param {*} name
 * @returns {boolean}
 */
export function isReservedRoutedName(name) {
  const normalized = normalizeRoutedName(name);
  return FAIL_SET.has(normalized) || MISS_SET.has(normalized) || HAZARD_SET.has(normalized);
}

/**
 * Match result groups to a routed `outcome` by NORMALIZED name — the single
 * shared sub-step of the three otherwise-distinct routing models (crafting's
 * `check` provider, gathering's system-check tier). Only the name comparison and
 * the first-vs-all selection are shared here; reserved-keyword handling,
 * tier→result-set assignment, and per-system status shapes stay in the callers.
 *
 * @param {*} outcome the routed outcome/tier name (raw; normalized internally)
 * @param {Array<{name?: *}>} groups candidate result groups
 * @param {object} [options]
 * @param {boolean} [options.firstOnly=false] keep only the first match (crafting
 *   routes to a single group via `slice(0, 1)`); gathering keeps all matches.
 * @returns {Array} the matching groups in order
 */
export function matchResultGroupsByName(outcome, groups, { firstOnly = false } = {}) {
  const normalized = normalizeRoutedName(outcome);
  const matched = (Array.isArray(groups) ? groups : []).filter(
    (group) => normalizeRoutedName(group?.name) === normalized
  );
  return firstOnly ? matched.slice(0, 1) : matched;
}

/**
 * Build the `{id, name}` options for the recipe editor's check-mode result-set
 * assignment control from a routed crafting check's active outcome-tier list.
 * Only SUCCESS tiers (`success === true`) with an id are offered — a failed check
 * produces no result set to route to, so failure tiers are excluded. The active
 * list is the `fixedOutcomes` when `type === 'fixed'`, else `relativeOutcomes`.
 *
 * Pure (no `$derived`/Foundry deps) so it can be unit-tested directly and reused
 * by the recipe-readiness evaluator that needs the same success-filtered list.
 *
 * @param {?{type?: string, relativeOutcomes?: Array, fixedOutcomes?: Array}} routed
 * @returns {Array<{id: string, name: string}>}
 */
export function routedSuccessTierOptions(routed) {
  if (!routed) return [];
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : [])
    .filter((tier) => tier?.id && tier.success === true)
    .map((tier) => ({ id: tier.id, name: tier.name || tier.id }));
}

/**
 * Does the routed check have ANY outcome tier defined (regardless of success)?
 * The active list is `fixedOutcomes` when `type === 'fixed'`, else `relativeOutcomes`.
 *
 * This is the companion to {@link routedSuccessTierOptions}: it returns `true` even
 * when every tier is a failure tier, so callers can tell "no tiers authored yet"
 * apart from "tiers exist but none is a Success" — two states that both make
 * `routedSuccessTierOptions` return `[]` but need different guidance in the UI.
 *
 * Pure (no `$derived`/Foundry deps) so it can be unit-tested directly.
 *
 * @param {?{type?: string, relativeOutcomes?: Array, fixedOutcomes?: Array}} routed
 * @returns {boolean}
 */
export function routedHasOutcomeTiers(routed) {
  if (!routed) return false;
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return Array.isArray(tiers) && tiers.some((tier) => tier?.id);
}

/**
 * The recipe-tier list offered to the recipe editor's "Check tier" dropdown for
 * the selected system, resolved from its active crafting-check mode. Recipe tiers
 * are authored on a RELATIVE check (simple-static or routed-relative), so this
 * returns the active mode's tier list only in those two cases:
 *
 *  - simple mode + static `dcMode` → `craftingCheck.simple.tiers`
 *  - routed mode + relative type (`routed.type !== 'fixed'`) → `craftingCheck.routed.tiers`
 *
 * Everything else — simple + dynamic dcMode, routed + fixed type, progressive,
 * or a null/unknown mode — yields `[]` (no tier selection is meaningful). The
 * routed gate mirrors CraftingCheckEditor's `type` normalization
 * (`type === 'fixed' ? 'fixed' : 'relative'`), so an omitted/undefined routed
 * `type` is treated as relative and its tiers are offered.
 *
 * Pure (no `$derived`/Foundry deps) so it can be unit-tested directly and reused
 * by the recipe editor's `$derived` without adding a new module dependency.
 *
 * @param {?{simple?: {dcMode?: string, tiers?: Array}, routed?: {type?: string, tiers?: Array}}} craftingCheck
 * @param {?string} craftingCheckMode the active crafting-check mode: 'simple' |
 *   'routed' | 'progressive' | null
 * @returns {Array} the tier objects for the active mode, or `[]`
 */
export function resolveRecipeCheckTierOptions(craftingCheck, craftingCheckMode) {
  if (craftingCheckMode === 'simple') {
    // Mirror SimpleCraftingCheckEditor's `dcMode === 'dynamic' ? 'dynamic' : 'static'`
    // normalization: only an explicit `dynamic` hides tiers; every other value
    // (including omitted) is static and offers them. Structurally symmetric with the
    // routed `type === 'fixed'` gate below.
    return craftingCheck?.simple?.dcMode === 'dynamic' ? [] : craftingCheck?.simple?.tiers || [];
  }
  if (craftingCheckMode === 'routed') {
    return craftingCheck?.routed?.type === 'fixed' ? [] : craftingCheck?.routed?.tiers || [];
  }
  return [];
}

/**
 * All NON-EMPTY outcome-tier NAMES of a routed check's active type — success AND
 * failure tiers — in author order. The active list is the `fixedOutcomes` when
 * `type === 'fixed'`, else `relativeOutcomes`. This is the single source of truth
 * for "what outcome names can be routed", shared by the per-component salvage
 * routing UI and `ResolutionModeService` salvage validation so the editor and the
 * validator can never disagree about which outcomes exist (the bug that left
 * routed salvage permanently invalid when the two read different fields).
 *
 * Pure (no `$derived`/Foundry deps) so it can be unit-tested directly.
 *
 * @param {?{type?: string, relativeOutcomes?: Array, fixedOutcomes?: Array}} routed
 * @returns {Array<string>}
 */
export function routedOutcomeTierNames(routed) {
  if (!routed) return [];
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : [])
    .map((tier) => String(tier?.name || '').trim())
    .filter((name) => name.length > 0);
}
