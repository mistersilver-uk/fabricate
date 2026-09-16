/**
 * A gathering task's FAILURE OUTCOME — the text or macro feedback a failed attempt dispatches
 * through `GatheringEngine._applyFailureFeedback` (issue 1098, CF8). Shared rather than inlined
 * because THREE whitelist rebuilds must emit it, the ENGINE-facing one included; two of the three
 * persists the field perfectly and leaves it unread at roll time. Absence-preserving, and
 * deliberately NOT validating: a malformed value is PRESERVED for
 * `GatheringEngine.validateFailureOutcome` to report rather than silently dropped.
 */

/** Coerce one authored `failureOutcome` to its persisted shape. */
function _shape(value) {
  const outcome = { mode: String(value.mode ?? '') };
  // Each operand is attached only when the key is PRESENT, so switching mode in the editor never
  // destroys the other mode's operand — the retention `_normalizeTierStep` already gives `dc` and
  // `start`/`end` across a `type` switch, for the same reason.
  if (value.text !== undefined) outcome.text = String(value.text ?? '');
  if (value.macroUuid !== undefined) outcome.macroUuid = String(value.macroUuid ?? '');
  return outcome;
}

/** The absence-preserving `failureOutcome` attach, spread into a gathering-task rebuild. */
export function authoredFailureOutcome(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
  return { failureOutcome: _shape(value) };
}
