/**
 * Shared UI helper for the interactive check-roll cancel seams (issue 513).
 *
 * A UI-triggered crafting / salvage / gathering check can be cancelled two ways,
 * both of which surface a `cancelled: true` runner result:
 *
 * - the bespoke issue-497 confirm-prompt **Cancel** click — a deliberate, self-evident
 *   action that stays SILENT (it carries no `cancelledReason`); and
 * - a **native roll-dialog dismissal** after the player already confirmed the
 *   Fabricate prompt — less obvious, so it warrants a WARN toast (it carries
 *   `cancelledReason === 'nativeRollDialogDismissed'`).
 *
 * Every UI cancel seam (crafting store, journal store, gathering view) routes its
 * `cancelled` branch through {@link notifyRollDialogDismissed} instead of branching
 * inline, so the discriminator lives in one tested place. Firing the toast at the UI
 * seam (not the engine) keeps the systems layer free of `ui.notifications`, so an
 * API / macro caller — which never sets `interactive` — can never raise a toast.
 *
 * The copy is intentionally activity-neutral (it is fired from craft / salvage /
 * gather): it states the attempt was cancelled, had no effect, and that the roll
 * dialog was dismissed — no crafting-only vocabulary such as "consumed".
 */

/**
 * The `cancelledReason` a native manual roll-fulfilment dialog dismissal threads
 * through the runner and engine cancelled returns. Mirrors
 * `NATIVE_ROLL_DIALOG_DISMISSED` in `src/systems/fabricateRoll.js`; the
 * `rollCancelNotice` unit test asserts the two stay in sync.
 */
export const NATIVE_ROLL_DIALOG_DISMISSED = 'nativeRollDialogDismissed';

/** The single neutral, activity-agnostic toast copy key (WARN severity). */
export const ROLL_CANCELLED_MESSAGE_KEY = 'FABRICATE.App.RollCancelled';

/**
 * Fire a WARN toast when — and ONLY when — a cancelled result was produced by a
 * dismissed native roll dialog. A bespoke confirm-prompt Cancel (no `cancelledReason`)
 * is left silent.
 *
 * @param {{ cancelledReason?: string } | null | undefined} result The runner /
 *   engine result whose `cancelledReason` discriminates the cancel source.
 * @param {object} deps
 * @param {(message: string) => void} deps.notifyWarn The WARN notifier (Foundry
 *   `ui.notifications.warn` via foundryBridge; in the stores this is `services.notify`,
 *   which is wired to `notifyWarn`).
 * @param {(key: string) => string} [deps.localize] Localizer for the toast copy;
 *   defaults to the identity function so a headless unit test observes the raw key.
 * @returns {boolean} `true` when the toast fired, `false` otherwise.
 */
export function notifyRollDialogDismissed(result, { notifyWarn, localize = (key) => key } = {}) {
  if (result?.cancelledReason !== NATIVE_ROLL_DIALOG_DISMISSED) return false;
  notifyWarn?.(localize(ROLL_CANCELLED_MESSAGE_KEY));
  return true;
}
