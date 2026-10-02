import { executedCheckDisplay } from '../ui/presenters/checkDisplay.js';

import { CARD_ROLLS } from './checkCardRolls.js';

/** The check-result fields a crafting result card states, and the key a versioned execution
 * re-enters `craft()` under: identity-typed, so re-declaring it elsewhere reads as `undefined`. */
export const VERSIONED_EXECUTION_CONTEXT = Symbol('fabricate.versionedCraftingExecution');

/** The RAW rolled total for a result chat card, or null when no check ran or a zero pool rolled
 * nothing. A progressive check overwrites `value` with the AWARDING value on a forced crit, so the
 * card reads `data.total`. */
export function rollTotalForCard(checkResult) {
  if (checkResult?.data?.zeroPool === true) return null;
  return checkResult?.data?.total ?? checkResult?.value ?? null;
}

/** Realized routed tier-step evidence for result chat, or null when the tier was never moved:
 * `runFormulaRouted` emits `data.tierStepApplied` only on an actual tier change (issue 975). */
export function tierStepForCard(checkResult) {
  return checkResult?.data?.tierStepApplied ?? null;
}

/** The executed check projection a result card gates its evidence rows on, with the executed
 * visibility handed over unpersisted; null when no check ran (issue 2005). A check whose rolls are
 * offered to the card names the offer under `CARD_ROLLS`, which no clone or transport keeps. */
export function checkDisplayForCard(checkResult) {
  if (!checkResult?.data || typeof checkResult.data !== 'object') return null;
  const display = executedCheckDisplay(checkResult);
  const offer = checkResult.cardRolls;
  return typeof offer === 'string' ? { ...display, [CARD_ROLLS]: offer } : display;
}
