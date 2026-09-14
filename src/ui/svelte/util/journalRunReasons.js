/**
 * Player-facing localization for versioned-run authority refusals.
 *
 * The authority reports a refusal as `{ success: false, reason }` with no
 * `message`, so every surface that only read `message` showed `undefined` or
 * nothing at all. `JOURNAL_RUN_REASON_KEYS` is the single vocabulary for those
 * codes (plus the UI-side `actions.disabledReason` codes the Journal panels
 * already used); `localize` is injected so this module stays UI-free.
 */

/**
 * Reason/disabled-reason code → localization key. Mirrors the `reason` literals
 * `src/systems/journalRunAuthority.js` and `src/systems/journalRunCommands.js`
 * can return; `tests/journal-run-reasons.test.js` fails when the two drift.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const JOURNAL_RUN_REASON_KEYS = Object.freeze({
  // ── Availability and ledger provisioning ──────────────────────────────────
  'active-gm-missing': 'FABRICATE.App.Journal.Actions.AuthorityUnavailable',
  'active-gm-required': 'FABRICATE.App.Journal.Actions.ActiveGmRequired',
  'ledger-missing': 'FABRICATE.App.Journal.Actions.LedgerMissing',
  // Added with ledger auto-provisioning. `lifecycle-refused` always carries a human
  // `message`, which the refusal chain prefers, so its own wording is the fallback for a
  // refusal that somehow arrives without one.
  'lifecycle-refused': 'FABRICATE.App.Journal.Reason.LifecycleRefused',
  'ledger-create-denied': 'FABRICATE.App.Journal.Reason.LedgerCreateDenied',
  'ledger-create-failed': 'FABRICATE.App.Journal.Reason.LedgerCreateFailed',
  'ledger-unsettled': 'FABRICATE.App.Journal.Reason.LedgerUnsettled',
  'ledger-ambiguous': 'FABRICATE.App.Journal.Actions.LedgerAmbiguous',
  'ledger-already-exists': 'FABRICATE.App.Journal.AuthoritySetup.AlreadyExists',
  'secure-random-unavailable': 'FABRICATE.App.Journal.Actions.SecureRandomUnavailable',
  // ── Execution claim and recovery ──────────────────────────────────────────
  'claim-held': 'FABRICATE.App.Journal.Actions.ClaimHeld',
  'claim-mismatch': 'FABRICATE.App.Journal.Reason.ClaimMismatch',
  'claim-release-failed': 'FABRICATE.App.Journal.Actions.ClaimReleaseFailed',
  'recovery-required': 'FABRICATE.App.Journal.Actions.RecoveryRequired',
  'recovery-pending': 'FABRICATE.App.Journal.Reason.RecoveryPending',
  'reconstruction-failed': 'FABRICATE.App.Journal.AuthoritySetup.RecoveryFailed',
  'reconstruction-unavailable': 'FABRICATE.App.Journal.AuthoritySetup.RecoveryFailed',
  'invalid-reconstruction-scope': 'FABRICATE.App.Journal.Reason.InvalidReconstructionScope',
  'invalid-disposition': 'FABRICATE.App.Journal.Reason.InvalidDisposition',
  // ── Request transport and durability ──────────────────────────────────────
  'command-timeout': 'FABRICATE.App.Journal.Reason.CommandTimeout',
  'execute-command-unavailable': 'FABRICATE.App.Journal.Reason.ExecuteCommandUnavailable',
  'execution-grant-invalid': 'FABRICATE.App.Journal.Reason.ExecutionGrantInvalid',
  'invalid-command': 'FABRICATE.App.Journal.Reason.InvalidCommand',
  'request-id-collision': 'FABRICATE.App.Journal.Reason.RequestIdCollision',
  'request-not-replayable': 'FABRICATE.App.Journal.Reason.RequestNotReplayable',
  'response-not-serializable': 'FABRICATE.App.Journal.Reason.ResponseNotSerializable',
  'unknown-sender': 'FABRICATE.App.Journal.Reason.UnknownSender',
  // ── Authorization ─────────────────────────────────────────────────────────
  'owner-required': 'FABRICATE.App.Journal.Actions.NeedsOwner',
  'source-owner-required': 'FABRICATE.App.Journal.Reason.SourceOwnerRequired',
  // ── Run state ─────────────────────────────────────────────────────────────
  'active-run': 'FABRICATE.App.Journal.Reason.ActiveRun',
  'actor-not-found': 'FABRICATE.App.Journal.Reason.ActorNotFound',
  'run-not-found': 'FABRICATE.App.Journal.Actions.NoRun',
  'stale-run': 'FABRICATE.App.Journal.Reason.StaleRun',
  'stale-stage': 'FABRICATE.App.Journal.Reason.StaleStage',
  'unsupported-version': 'FABRICATE.App.Journal.Actions.UnsupportedLifecycle',
  // ── Operation support and outcome ─────────────────────────────────────────
  'operation-failed': 'FABRICATE.App.Journal.Reason.OperationFailed',
  'operation-unavailable': 'FABRICATE.App.Journal.Reason.OperationUnavailable',
  'unsupported-operation': 'FABRICATE.App.Journal.Reason.UnsupportedOperation',
  // ── Check prompt and roll ─────────────────────────────────────────────────
  'check-evaluator-unavailable': 'FABRICATE.App.Journal.Reason.CheckEvaluatorUnavailable',
  'check-prompt-unavailable': 'FABRICATE.App.Journal.Reason.CheckPromptUnavailable',
  'invalid-dismissal': 'FABRICATE.App.Journal.Reason.InvalidDismissal',
  'prepare-token-invalid': 'FABRICATE.App.Journal.Reason.PrepareTokenInvalid',
  'roll-cancelled': 'FABRICATE.App.Journal.Reason.RollCancelled',
  'roll-unavailable': 'FABRICATE.App.Journal.Reason.RollUnavailable',
  // ── UI-side `run.actions.disabledReason` codes (moved from ActionsPanel) ──
  authorityUnavailable: 'FABRICATE.App.Journal.Actions.AuthorityUnavailable',
  recoveryRequired: 'FABRICATE.App.Journal.Actions.RecoveryRequired',
  executionInProgress: 'FABRICATE.App.Journal.Actions.ExecutionInProgress',
  unsupportedLifecycle: 'FABRICATE.App.Journal.Actions.UnsupportedLifecycle',
  selectionRequired: 'FABRICATE.App.Journal.Actions.SelectionRequired',
  notOwner: 'FABRICATE.App.Journal.Actions.NeedsOwner',
});

/**
 * Localize one refusal/disabled-reason code.
 *
 * @param {unknown} reason The authority `reason` (or UI `disabledReason`) code.
 * @param {(key: string) => string} localize
 * @returns {string} The localized sentence, or `''` when the code is absent,
 *   blank, unmapped, or no usable `localize` was supplied — so every caller
 *   falls through to its own readable generic rather than to a raw slug.
 */
export function journalRunReasonMessage(reason, localize) {
  if (typeof reason !== 'string' || typeof localize !== 'function') return '';
  const key = JOURNAL_RUN_REASON_KEYS[reason.trim()];
  if (!key) return '';
  const text = localize(key);
  return typeof text === 'string' && text.trim() !== '' ? text : '';
}

/**
 * The one refusal-reporting chain every player surface shows: the result's own
 * trimmed `message`, then its localized `reason`, then the caller's generic.
 * Always a string, so a notification never renders `undefined`.
 *
 * @param {{message?: unknown, reason?: unknown}|null|undefined} result
 * @param {(key: string) => string} localize
 * @param {unknown} [generic] The caller's existing fallback message.
 * @returns {string}
 */
export function journalRefusalMessage(result, localize, generic) {
  const message = typeof result?.message === 'string' ? result.message.trim() : '';
  if (message) return message;
  const reasonText = journalRunReasonMessage(result?.reason, localize);
  if (reasonText) return reasonText;
  return typeof generic === 'string' ? generic.trim() : '';
}
