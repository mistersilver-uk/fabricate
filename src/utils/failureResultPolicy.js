/**
 * The FAILURE-RESULT POLICY (issue 1098) — one per activity check
 * (`craftingCheck` / `salvageCraftingCheck` / `gatheringCraftingCheck`), answering
 * exactly ONE question: may a FAILED check produce a result at all.
 *
 * It is deliberately NOT the failure CONSUMPTION axis. Consumption
 * (`consumption.consumeIngredientsOnFail` / `consumeComponentOnFail` /
 * `breakToolsOnFail`) answers what a failed attempt COSTS; this answers what a failed
 * attempt PRODUCES. The two are orthogonal and a system may author any combination.
 *
 * ## The three values, and why two of them share one predicate
 *
 *  - `never`     — a failed check never produces a result.
 *  - `perRecord` — the RECORD decides: a recipe, component or gathering row that
 *                  authored a failure output produces it, and one that authored none
 *                  produces nothing.
 *  - `always`    — the GM has declared that failures produce wherever an output can be
 *                  resolved.
 *
 * The policy SELECTS an authored failure output and never FABRICATES one, so `always`
 * on a record authoring no failure output still produces nothing. That is what makes
 * `perRecord` and `always` share a single runtime predicate — {@link permitsFailureResults}
 * — while remaining distinct GM-facing declarations of intent. The distinction is
 * recorded in the persisted value and read by the authoring surfaces (which describe the
 * choice back to the GM in the activity's own record noun); it is deliberately NOT a
 * second runtime branch, because a branch that could only differ by fabricating an
 * unauthored output is the one behaviour this policy forbids.
 *
 * ## Defaults
 *
 * A newly-created system defaults to `perRecord`, and an absent or unrecognized value
 * normalizes to `perRecord` on read — the `toolBreakage.authority` precedent
 * (`data-models` req 21). An UPGRADED world does not get that default: the `1.25.0`
 * seed migration writes `never` onto every check block already on disk, so no existing
 * world changes behaviour and the GM opts in deliberately, per activity, per system.
 */

/** The persisted values, in authoring order. */
export const FAILURE_RESULT_POLICIES = Object.freeze(['never', 'perRecord', 'always']);

/** The value a NEWLY-CREATED system gets, and the read-time fallback for junk. */
export const DEFAULT_FAILURE_RESULT_POLICY = 'perRecord';

/** The value the `1.25.0` migration seeds onto every check that already exists. */
export const SEEDED_FAILURE_RESULT_POLICY = 'never';

/**
 * Coerce a persisted/imported value to one of the three policies.
 *
 * ONE derivation, four callers: the three check normalizers in
 * `CraftingSystemManager` (each a whitelist rebuild) and the store projection. A second
 * copy is how one activity comes to accept a value another rejects.
 *
 * @param {*} value raw persisted value
 * @returns {'never'|'perRecord'|'always'}
 */
export function normalizeFailureResultPolicy(value) {
  return FAILURE_RESULT_POLICIES.includes(value) ? value : DEFAULT_FAILURE_RESULT_POLICY;
}

/**
 * Does this policy permit a failed check to produce a result?
 *
 * The ONE runtime predicate. Everything that gates on the policy — the crafting failure
 * award, the salvage failure branch, both halves of gathering's mirrored award gate,
 * routed tier resolution, and the recipe/salvage authoring surfaces — reads this, so the
 * picker can never offer a tier the engine refuses to route.
 *
 * A junk value reads as the default (`perRecord`), which permits: an unrecognized value
 * must behave as the read-time default rather than silently as `never`, or a typo in an
 * imported payload would quietly disable an authored capability.
 *
 * @param {*} policy
 * @returns {boolean}
 */
export function permitsFailureResults(policy) {
  return normalizeFailureResultPolicy(policy) !== 'never';
}

/** Which system key each activity's check — and therefore its policy — is persisted under. */
const ACTIVITY_CHECK_KEYS = Object.freeze({
  crafting: 'craftingCheck',
  salvage: 'salvageCraftingCheck',
  gathering: 'gatheringCraftingCheck',
});

/**
 * Read one activity's failure-result policy off a (possibly un-normalized) system.
 *
 * Tolerates a raw system exactly as {@link normalizeFailureResultPolicy} does, so an
 * engine holding a fixture-built system behaves as it would holding a normalized one.
 *
 * @param {?object} system
 * @param {'crafting'|'salvage'|'gathering'} activity
 * @returns {'never'|'perRecord'|'always'}
 */
export function activityFailureResultPolicy(system, activity) {
  const key = ACTIVITY_CHECK_KEYS[activity];
  return normalizeFailureResultPolicy(key ? system?.[key]?.failureResultPolicy : undefined);
}

/**
 * Does this activity's check permit a failed check to produce a result?
 * The composition of the two readers above, so no caller has to spell the pair.
 *
 * @param {?object} system
 * @param {'crafting'|'salvage'|'gathering'} activity
 * @returns {boolean}
 */
export function activityPermitsFailureResults(system, activity) {
  return permitsFailureResults(activityFailureResultPolicy(system, activity));
}
