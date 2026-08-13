/**
 * A gathering task's FAILURE OUTCOME — the text or macro feedback a failed gathering
 * attempt dispatches through `GatheringEngine._applyFailureFeedback` (issue 1098, CF8).
 *
 * ## Why this is a shared module rather than three literals
 *
 * A gathering task is rebuilt by THREE whitelist rebuilds, and `failureOutcome` was
 * emitted by none of them:
 *
 *  - `normalizeLibraryTask` (`src/systems/GatheringRichStateService.js`) — the library shape;
 *  - `_normalizeGatheringTask` (`src/ui/svelte/stores/adminStore.js`) — the manager draft
 *    save path, its mirror;
 *  - `_libraryTaskToRuntimeTask` (`src/systems/GatheringRichStateService.js`) — the
 *    ENGINE-facing runtime task, which is what `_applyFailureFeedback` actually reads.
 *
 * Two of the three is not enough, and this is not a hypothetical: `checkModifierIds` was
 * correct in both library normalizers and absent from the runtime builder, so the field
 * persisted perfectly and was unread at roll time. Emitting `failureOutcome` from the two
 * library rebuilds alone would leave a read-only cross-reference telling the GM a value is
 * set while the roll still dispatched `null`.
 *
 * ## Absence-preserving, and deliberately NOT validating
 *
 * The attach is `{}` or `{ failureOutcome }`, so a task that authored nothing keeps no key
 * — matching `authoredCheckModifierIds` — and `_applyFailureFeedback`'s
 * `task.failureOutcome ?? null` reads exactly as it did.
 *
 * A malformed value is PRESERVED rather than repaired or dropped, the same treatment
 * `_normalizeTierStep` gives a dangling `tierId`. `GatheringEngine.validateFailureOutcome`
 * is what reports a bad `mode`, a text mode with no text and a macro mode with no
 * `macroUuid`; a normalizer that quietly deleted those would make the validator
 * unreachable and turn an authoring mistake into silent data loss.
 */

/**
 * Coerce one authored `failureOutcome` to its persisted shape.
 * @param {object} value a plain object the caller has already type-checked
 * @returns {{mode: string, text?: string, macroUuid?: string}}
 */
function _shape(value) {
  const outcome = { mode: String(value.mode ?? '') };
  // Each operand is attached only when the key is PRESENT, so switching mode in the editor
  // never destroys the other mode's operand — the retention `_normalizeTierStep` already
  // gives `dc` and `start`/`end` across a `type` switch, for the same reason.
  if (value.text !== undefined) outcome.text = String(value.text ?? '');
  if (value.macroUuid !== undefined) outcome.macroUuid = String(value.macroUuid ?? '');
  return outcome;
}

/**
 * The absence-preserving `failureOutcome` attach, spread into a gathering-task rebuild.
 *
 * @param {*} value the raw authored value
 * @returns {{failureOutcome?: {mode: string, text?: string, macroUuid?: string}}}
 */
export function authoredFailureOutcome(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
  return { failureOutcome: _shape(value) };
}
