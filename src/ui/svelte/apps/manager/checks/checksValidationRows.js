/**
 * The Checks Validation tab's row states, mirroring `recipeReadiness.js`'s
 * `recipeValidationRowStates`: one row per check, claiming the issue it owns when unsatisfied, then
 * one row per issue no check claimed. A fault reads once — as its issue, at that issue's severity —
 * with the owning check's tick/cross riding the SAME row, rather than twice: once as a generic
 * warning checklist row and again as the issue's own row (issue 2083).
 */

/**
 * The issue(s) a check borrows its severity and copy from when unsatisfied. Two owners cover a
 * check that can fail two independent ways at once (e.g. a tier-step target can be both dangling
 * AND ambiguous); only the first found claims the check's row, the other still gets its own. A
 * check absent here either never fails, or fails with no issue naming it.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const CHECK_TO_ISSUES = Object.freeze({
  hasRollFormula: ['noRollFormula'],
  outcomesNamed: ['unnamedOutcome'],
  hasSuccessOutcome: ['noSuccessOutcome'],
  rangesValid: ['rangeInvalid'],
  rangesNoOverlap: ['rangeOverlap'],
  rangesContiguous: ['rangeGap'],
  tierStepTargetsResolve: ['danglingTierStepTarget', 'multipleTierStepTargets'],
  modifierBoundsValid: ['modifierBoundsInverted', 'modifierBoundsUnsafe'],
  modifierExpressionsResolve: ['modifierExpressionInvalid'],
  attributeTargetSet: ['attributeTargetMissing'],
  attributeTargetReadable: ['attributeTargetInvalid'],
  recipeTiersSetAdjustment: ['attributeTierWithoutAdjustment'],
  adjustmentsSuitKind: ['adjustmentInvalidForKind'],
  singleOtherwiseTier: ['otherwiseTierMissing', 'multipleOtherwiseTiers'],
  countPoolReadable: ['countPoolInvalid'],
  countThresholdReadable: ['countThresholdInvalid'],
  countFacesOnDie: ['countFaceBeyondDie'],
  countExplosionStops: ['countExplodeUnbounded'],
  countTiersSetSuccesses: ['countTierWithoutSuccesses'],
  countRequiredWithinMaxPool: ['countRequiredExceedsMaxPool'],
  countRequiredWithinBasePool: ['countRequiredExceedsBasePool'],
  progressiveHigherIsBetter: ['progressiveUnderUnsupported'],
});

/**
 * Check ids `evaluateCheckReadiness` never pushes with `satisfied: false`, so they own no
 * {@link CHECK_TO_ISSUES} entry. `countPoolCharacterDependent` is pushed only when true, literally
 * — a pool that reads the character has nothing to compare until a character rolls. Guarded by
 * `tests/checks-validation-rows.test.js` against every `CHECK_TICK_LABELS` id (issue 2106 review):
 * an id in neither this list nor `CHECK_TO_ISSUES` would fail silently GREEN in the Validation tab.
 * @type {ReadonlyArray<string>}
 */
export const CHECK_NEVER_FAILS = Object.freeze(['countPoolCharacterDependent']);

/** A row's status: `pass` when satisfied, else the claimed issue's severity, or `warn` with none —
 *  never `pass` for an unsatisfied check, which is the false-green issue 2106 review found. */
export function issueRowStatus(issue) {
  return issue && issue.severity === 'critical' ? 'block' : 'warn';
}

/**
 * One row state per check, then one per issue no check claimed. `transient` warnings (the
 * Preview-as actor's readings) own no check and are read separately by the caller.
 * @param {{checks?: Array<{id: string, satisfied: boolean}>,
 *   issues?: Array<{id: string, severity: string, data?: object}>}} readiness
 * @returns {Array<{checkId: string, satisfied: boolean, issue: object|null, status: string}>}
 */
export function checksValidationRowStates(readiness = {}) {
  const checks = Array.isArray(readiness?.checks) ? readiness.checks : [];
  const issues = Array.isArray(readiness?.issues) ? readiness.issues : [];
  const claimed = new Set();
  const rows = checks.map((check) => {
    const owners = CHECK_TO_ISSUES[check.id] || [];
    const issue = check.satisfied
      ? null
      : issues.find((entry) => owners.includes(entry.id)) || null;
    if (issue) claimed.add(issue);
    return {
      checkId: check.id,
      satisfied: check.satisfied,
      issue,
      status: check.satisfied ? 'pass' : issueRowStatus(issue),
    };
  });
  for (const issue of issues) {
    if (claimed.has(issue)) continue;
    rows.push({ checkId: '', satisfied: false, issue, status: issueRowStatus(issue) });
  }
  return rows;
}
