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

/** Trimmed and lowercased. */
export function normalizeRoutedName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

const FAIL_SET = new Set(FAIL_KEYWORDS);
const MISS_SET = new Set(MISS_KEYWORDS);
const HAZARD_SET = new Set(HAZARD_KEYWORDS);

export function isFailKeyword(name) {
  const normalized = normalizeRoutedName(name);
  return FAIL_SET.has(normalized) || HAZARD_SET.has(normalized);
}

export function isMissKeyword(name) {
  return MISS_SET.has(normalizeRoutedName(name));
}

/** Reserved (fail, miss, hazard), so forbidden as a routed `ResultGroup.name`. */
export function isReservedRoutedName(name) {
  const normalized = normalizeRoutedName(name);
  return FAIL_SET.has(normalized) || MISS_SET.has(normalized) || HAZARD_SET.has(normalized);
}

/** By normalized name, the one sub-step every routing model shares. */
export function matchResultGroupsByName(outcome, groups, { firstOnly = false } = {}) {
  const normalized = normalizeRoutedName(outcome);
  const matched = (Array.isArray(groups) ? groups : []).filter(
    (group) => normalizeRoutedName(group?.name) === normalized
  );
  return firstOnly ? matched.slice(0, 1) : matched;
}

/** The recipe editor's check-mode result-set options. */
export function routedSuccessTierOptions(routed) {
  if (!routed) return [];
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : [])
    .filter((tier) => tier?.id && tier.success === true)
    .map((tier) => ({ id: tier.id, name: tier.name || tier.id }));
}

/** Success and failure tiers, in authored order. */
export function routedOutcomeTierOptions(routed) {
  if (!routed) return [];
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : [])
    .filter((tier) => tier?.id)
    .map((tier) => ({ id: tier.id, name: tier.name || tier.id }));
}

/** Chosen by the activity's failure-result policy (issue 1098, decision 7). */
export function routedTierOptionsForPolicy(routed, failureResultPolicy) {
  return permitsFailureResults(failureResultPolicy)
    ? routedOutcomeTierOptions(routed)
    : routedSuccessTierOptions(routed);
}

export function routedHasOutcomeTiers(routed) {
  if (!routed) return false;
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return Array.isArray(tiers) && tiers.some((tier) => tier?.id);
}

/** Counted by id, exactly as {@link routedHasOutcomeTiers} tests. */
export function routedOutcomeTierCount(routed) {
  if (!routed) return 0;
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : []).filter((tier) => tier?.id).length;
}

/** The recipe editor's "Check tier" options, from the active crafting-check mode. */
export function resolveRecipeCheckTierOptions(craftingCheck, craftingCheckMode) {
  if (craftingCheckMode === 'simple') {
    // Only an explicit `dcMode === 'dynamic'` hides tiers; anything else, absence included, is
    // static.
    return craftingCheck?.simple?.dcMode === 'dynamic' ? [] : craftingCheck?.simple?.tiers || [];
  }
  if (craftingCheckMode === 'routed') {
    return craftingCheck?.routed?.type === 'fixed' ? [] : craftingCheck?.routed?.tiers || [];
  }
  return [];
}

/** "Minimum success tier" options, for a fixed-type routed crafting check only. */
export function resolveRecipeFixedOutcomeTierOptions(craftingCheck, resolutionMode) {
  if (resolutionMode !== 'routedByCheck') return [];
  const routed = craftingCheck?.routed;
  if (routed?.type !== 'fixed') return [];
  return (Array.isArray(routed.fixedOutcomes) ? routed.fixedOutcomes : [])
    .filter((tier) => tier?.id && tier.success === true)
    .map((tier) => ({ id: tier.id, name: tier.name || '', start: Number(tier.start) }))
    .sort((a, b) => a.start - b.start);
}

/** Non-empty tier names, success and failure, in author order. */
export function routedOutcomeTierNames(routed) {
  if (!routed) return [];
  const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  return (Array.isArray(tiers) ? tiers : [])
    .map((tier) => String(tier?.name || '').trim())
    .filter((name) => name.length > 0);
}

/** The name-keyed twin of {@link routedTierOptionsForPolicy}, for routed salvage. */
export function routedOutcomeTierNamesForPolicy(routed, failureResultPolicy) {
  const names = routedOutcomeTierNames(routed);
  if (permitsFailureResults(failureResultPolicy)) return names;
  const successNames = new Set(routedSuccessTierOptions(routed).map((tier) => tier.name));
  return names.filter((name) => successNames.has(name));
}
