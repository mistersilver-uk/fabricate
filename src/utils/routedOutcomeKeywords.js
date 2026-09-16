/** Canonical reserved routing keywords for routed-mode outcome matching. */

import { permitsFailureResults } from './failureResultPolicy.js';

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

/** Trim + lowercase a candidate routing name to its normalized comparison form. */
export function normalizeRoutedName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

const FAIL_SET = new Set(FAIL_KEYWORDS);
const MISS_SET = new Set(MISS_KEYWORDS);
const HAZARD_SET = new Set(HAZARD_KEYWORDS);

/** Does the (already-normalized or raw) name take the FAIL path? */
export function isFailKeyword(name) {
  const normalized = normalizeRoutedName(name);
  return FAIL_SET.has(normalized) || HAZARD_SET.has(normalized);
}

/** Does the name take the MISS path? */
export function isMissKeyword(name) {
  return MISS_SET.has(normalizeRoutedName(name));
}

/**
 * Is the name reserved (fail/miss/hazard) and therefore forbidden as a routed `ResultGroup.name`?
 */
export function isReservedRoutedName(name) {
  const normalized = normalizeRoutedName(name);
  return FAIL_SET.has(normalized) || MISS_SET.has(normalized) || HAZARD_SET.has(normalized);
}

/**
 * Match result groups to a routed `outcome` by NORMALIZED name — the single shared sub-step of the
 * three otherwise-distinct routing models (crafting's `check` provider, gathering's system-check
 * tier).
 */
export function matchResultGroupsByName(outcome, groups, { firstOnly = false } = {}) {
  const normalized = normalizeRoutedName(outcome);
  const matched = (Array.isArray(groups) ? groups : []).filter(
    (group) => normalizeRoutedName(group?.name) === normalized
  );
  return firstOnly ? matched.slice(0, 1) : matched;
}

/**
 * Build the `{id, name}` options for the recipe editor's check-mode result-set assignment control
 * from a routed crafting check's active outcome-tier list.
 */
export function routedSuccessTierOptions(routed) {
  if (!routed) return [];
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : [])
    .filter((tier) => tier?.id && tier.success === true)
    .map((tier) => ({ id: tier.id, name: tier.name || tier.id }));
}

/** ALL outcome tiers (success AND failure) as `{id, name}`, in authored order. */
export function routedOutcomeTierOptions(routed) {
  if (!routed) return [];
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : [])
    .filter((tier) => tier?.id)
    .map((tier) => ({ id: tier.id, name: tier.name || tier.id }));
}

/**
 * The outcome-tier options a RESULT-AUTHORING control may offer, chosen by the owning activity's
 * failure-result policy (issue 1098, decision 7).
 */
export function routedTierOptionsForPolicy(routed, failureResultPolicy) {
  return permitsFailureResults(failureResultPolicy)
    ? routedOutcomeTierOptions(routed)
    : routedSuccessTierOptions(routed);
}

/** Does the routed check have ANY outcome tier defined (regardless of success)? */
export function routedHasOutcomeTiers(routed) {
  if (!routed) return false;
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return Array.isArray(tiers) && tiers.some((tier) => tier?.id);
}

/**
 * How many outcome tiers a routed check has authored — success AND failure tiers, counted by id
 * exactly as {@link routedHasOutcomeTiers} tests.
 */
export function routedOutcomeTierCount(routed) {
  if (!routed) return 0;
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : []).filter((tier) => tier?.id).length;
}

/**
 * The recipe-tier list offered to the recipe editor's "Check tier" dropdown for the selected
 * system, resolved from its active crafting-check mode.
 */
export function resolveRecipeCheckTierOptions(craftingCheck, craftingCheckMode) {
  if (craftingCheckMode === 'simple') {
    // Only an explicit `dcMode === 'dynamic'` hides tiers; every other value, omission included,
    // is static and offers them. Structurally symmetric with the routed `type === 'fixed'` gate.
    return craftingCheck?.simple?.dcMode === 'dynamic' ? [] : craftingCheck?.simple?.tiers || [];
  }
  if (craftingCheckMode === 'routed') {
    return craftingCheck?.routed?.type === 'fixed' ? [] : craftingCheck?.routed?.tiers || [];
  }
  return [];
}

/**
 * The success outcome tiers offered to a recipe's "Minimum success tier" dropdown, for a FIXED-type
 * routed crafting check only.
 */
export function resolveRecipeFixedOutcomeTierOptions(craftingCheck, resolutionMode) {
  if (resolutionMode !== 'routedByCheck') return [];
  const routed = craftingCheck?.routed;
  if (routed?.type !== 'fixed') return [];
  return (Array.isArray(routed.fixedOutcomes) ? routed.fixedOutcomes : [])
    .filter((tier) => tier?.id && tier.success === true)
    .map((tier) => ({ id: tier.id, name: tier.name || '', start: Number(tier.start) }))
    .sort((a, b) => a.start - b.start);
}

/**
 * All NON-EMPTY outcome-tier NAMES of a routed check's active type — success AND failure tiers — in
 * author order.
 */
export function routedOutcomeTierNames(routed) {
  if (!routed) return [];
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : [])
    .map((tier) => String(tier?.name || '').trim())
    .filter((name) => name.length > 0);
}

/**
 * The tier NAMES a routed-salvage `outcomeRouting` select may offer, chosen by the salvage
 * failure-result policy (issue 1098, decision 7) — the name-keyed twin of {@link
 * routedTierOptionsForPolicy}.
 */
export function routedOutcomeTierNamesForPolicy(routed, failureResultPolicy) {
  const names = routedOutcomeTierNames(routed);
  if (permitsFailureResults(failureResultPolicy)) return names;
  const successNames = new Set(routedSuccessTierOptions(routed).map((tier) => tier.name));
  return names.filter((name) => successNames.has(name));
}
