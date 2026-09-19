/** The check-result fields a crafting result card states, and the key a versioned execution
 * re-enters `craft()` under: identity-typed, so re-declaring it elsewhere reads as `undefined`. */
export const VERSIONED_EXECUTION_CONTEXT = Symbol('fabricate.versionedCraftingExecution');

/** The RAW rolled total for a result chat card, or null when no check ran. A progressive check
 * overwrites `value` with the AWARDING value on a forced crit, so the card reads `data.total`. */
export function rollTotalForCard(checkResult) {
  return checkResult?.data?.total ?? checkResult?.value ?? null;
}

/** Realized routed tier-step evidence for result chat, or null when the tier was never moved:
 * `runFormulaRouted` emits `data.tierStepApplied` only on an actual tier change (issue 975). */
export function tierStepForCard(checkResult) {
  return checkResult?.data?.tierStepApplied ?? null;
}
