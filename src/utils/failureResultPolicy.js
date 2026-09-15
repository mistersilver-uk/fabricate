/**
 * The FAILURE-RESULT POLICY (issue 1098), one per activity check: may a FAILED check produce a
 * result at all. Orthogonal to the failure CONSUMPTION axis, which answers what a failure COSTS.
 * The policy SELECTS an authored failure output and never FABRICATES one, so `perRecord` and
 * `always` share {@link permitsFailureResults} and differ only as declarations of intent. A new
 * system defaults to `perRecord` and an unrecognized value reads as `perRecord`; the 1.25.0 seed
 * migration writes `never` onto every check block already on disk, so no existing world changes.
 */

/** The persisted values, in authoring order. */
export const FAILURE_RESULT_POLICIES = Object.freeze(['never', 'perRecord', 'always']);

/** The value a NEWLY-CREATED system gets, and the read-time fallback for junk. */
export const DEFAULT_FAILURE_RESULT_POLICY = 'perRecord';

/** The value the `1.25.0` migration seeds onto every check that already exists. */
export const SEEDED_FAILURE_RESULT_POLICY = 'never';

/** Coerce a persisted/imported value to one of the three policies. */
export function normalizeFailureResultPolicy(value) {
  return FAILURE_RESULT_POLICIES.includes(value) ? value : DEFAULT_FAILURE_RESULT_POLICY;
}

/** Does this policy permit a failed check to produce a result? */
export function permitsFailureResults(policy) {
  return normalizeFailureResultPolicy(policy) !== 'never';
}

/** Which system key each activity's check — and therefore its policy — is persisted under. */
const ACTIVITY_CHECK_KEYS = Object.freeze({
  crafting: 'craftingCheck',
  salvage: 'salvageCraftingCheck',
  gathering: 'gatheringCraftingCheck',
});

/** Read one activity's failure-result policy off a (possibly un-normalized) system. */
export function activityFailureResultPolicy(system, activity) {
  const key = ACTIVITY_CHECK_KEYS[activity];
  return normalizeFailureResultPolicy(key ? system?.[key]?.failureResultPolicy : undefined);
}

/** Does this activity's check permit a failed check to produce a result? */
export function activityPermitsFailureResults(system, activity) {
  return permitsFailureResults(activityFailureResultPolicy(system, activity));
}
