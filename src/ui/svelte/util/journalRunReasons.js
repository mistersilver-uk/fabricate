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
  // Minted by the EDGES through `authorityUnavailableRefusal`, so the drift guard can see it.
  'authority-unavailable': 'FABRICATE.App.Journal.Actions.AuthorityUnavailable',
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
  'secure-random-unavailable': 'FABRICATE.App.Journal.Actions.SecureRandomUnavailable',
  // ── Execution claim and recovery ──────────────────────────────────────────
  'claim-held': 'FABRICATE.App.Journal.Actions.ClaimHeld',
  'claim-mismatch': 'FABRICATE.App.Journal.Reason.ClaimMismatch',
  'claim-release-failed': 'FABRICATE.App.Journal.Actions.ClaimReleaseFailed',
  'recovery-required': 'FABRICATE.App.Journal.Actions.RecoveryRequired',
  'recovery-pending': 'FABRICATE.App.Journal.Reason.RecoveryPending',
  'reconstruction-failed': 'FABRICATE.App.Journal.Reason.ReconstructionFailed',
  'reconstruction-unavailable': 'FABRICATE.App.Journal.Reason.ReconstructionUnavailable',
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
  // ── Minted by the crafting operations in `src/main.js`, outside the drift guard's glob ────
  'source-actor-not-found': 'FABRICATE.App.Journal.Reason.SourceActorNotFound',
  'alchemy-system-not-found': 'FABRICATE.App.Journal.Reason.AlchemySystemNotFound',
  'alchemy-submission-invalid': 'FABRICATE.App.Journal.Reason.AlchemySubmissionInvalid',
  'ingredient-set-not-found': 'FABRICATE.App.Journal.Reason.IngredientSetNotFound',
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
  essenceRequired: 'FABRICATE.App.Journal.Actions.EssenceRequired',
  currencyRequired: 'FABRICATE.App.Journal.Actions.CurrencyRequired',
  toolRequired: 'FABRICATE.App.Journal.Actions.ToolRequired',
  routeUnavailable: 'FABRICATE.App.Journal.Actions.RouteUnavailable',
  choiceRequired: 'FABRICATE.App.Journal.Actions.ChoiceRequired',
  stageNotStarted: 'FABRICATE.App.Journal.Actions.StageNotStarted',
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

/**
 * Dispositions minted ONLY by a stage that ran to a resolved failure — the crafting
 * engine's stage-execution outcome is their single source. A refusal never reaches a
 * check, so it can never carry one, which is what makes this the honest split.
 */
const RESOLVED_FAILURE_DISPOSITIONS = Object.freeze(['failed', 'produced-on-failure']);

/**
 * Whether a `success: false` result is a resolved failure OUTCOME rather than a refusal.
 * A failed check is the system working; only a refusal is something going wrong.
 *
 * @param {{disposition?: unknown}|null|undefined} result
 * @returns {boolean}
 */
export function isResolvedFailureOutcome(result) {
  return RESOLVED_FAILURE_DISPOSITIONS.includes(result?.disposition);
}

/**
 * The one sentence every surface shows for a resolved failed check. It says the check
 * failed and NOTHING about what was consumed: the system's failure policy decides that
 * and the chat card itemises it, so the generic craft error — which promises "Nothing
 * was consumed" — is the wrong text here.
 *
 * @param {(key: string) => string} localize
 * @returns {string} Always a string, so a notification never renders `undefined`.
 */
export function resolvedFailureMessage(localize) {
  const text =
    typeof localize === 'function' ? localize('FABRICATE.App.Crafting.Notify.CheckFailed') : '';
  return typeof text === 'string' ? text.trim() : '';
}
