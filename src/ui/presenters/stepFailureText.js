/**
 * A crafting step's recorded `failureReason` as Journal text. `iterativeFailure` is a stable code
 * (`data-models` CraftingRunStepState), so it is localized and never printed; free text passes.
 */
import { iterableToArray, stringOrNull } from '../../systems/gatheringEngineInternals.js';

export function stepFailureText(reason, localize) {
  const text = stringOrNull(reason);
  return text === 'iterativeFailure' ? localize('FABRICATE.Chat.IterativeFailure') : text;
}

/** The first failed step's failure text, or `null`. */
export function craftingFailureReason(runSteps, localize) {
  const failed = iterableToArray(runSteps).find((step) => step?.status === 'failed');
  return stepFailureText(failed?.failureReason, localize);
}
