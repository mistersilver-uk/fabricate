/**
 * Canonical reserved routing keywords for routed-mode outcome matching.
 *
 * The routed `check` provider (and the @deprecated legacy `macroOutcome` /
 * `rollTableOutcome` providers, pending removal) route a check outcome / drawn
 * name to a `ResultGroup` by NAME. Certain normalized names are RESERVED for the
 * failure path and never match (or name) a real result group:
 *
 *  - the FAIL family:  fail / failed / failure / f
 *  - the MISS family:  miss / missed / m / nothing / none / whiff / whiffed
 *  - the HAZARD family: hazard / danger / complication / trap / oops
 *
 * This single shared set is the source of truth for both
 * `ResolutionModeService` (runtime resolution for `macroOutcome` AND
 * `rollTableOutcome`) and `Recipe.js` (routed `ResultGroup.name` validation),
 * so the two never drift. Living in the utils layer keeps it importable from
 * both `src/models` and `src/systems` without a layering violation.
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
