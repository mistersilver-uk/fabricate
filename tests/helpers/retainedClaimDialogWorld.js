/**
 * The retained-claim release prompt over a recording dialog, for the store tests that drive the
 * real `offerReleaseForRefusal` instead of a stub, so the dialog and its choices are observable.
 */
import { offerReleaseForRefusal } from '../../src/ui/svelte/apps/journal/runRecovery.js';

import { installFoundryBridgeEnv } from './foundryBridgeEnv.js';

export const CLAIM = Object.freeze({
  claimId: 'claim-7',
  requestKind: 'command',
  failureReason: 'operation-failed',
  failureMessage: 'No ledger',
  claimedAt: 1000,
});

/** A dialog `answer` that presses the button for `action`. */
export const press = (action) => (options) =>
  options.buttons.find((button) => button.action === action)?.callback?.();

/**
 * Add the release seams to `services`. `claim` is what the viewer's seam reports (`null` for a
 * player); `answer` responds to each dialog render, and with none the dialog stays open.
 * `restore()` puts the Foundry globals back.
 */
export function wireRetainedClaim(
  services,
  { claim = CLAIM, answer = null, reconcile = null } = {}
) {
  const dialogs = [];
  const reconciles = [];
  const state = { claim };
  class RecordingDialog {
    constructor(options) {
      this.options = options;
    }
    render() {
      dialogs.push(this.options);
      answer?.(this.options);
    }
  }
  const labels = { localize: (key) => key, format: (key) => key };
  const env = installFoundryBridgeEnv({ labels, dialog: RecordingDialog });
  services.getRetainedJournalClaim = () => state.claim;
  services.reconcileJournalRunAuthority =
    reconcile ??
    (async (options) => {
      reconciles.push(options);
      state.claim = null;
      return { success: true };
    });
  services.offerReleaseForRefusal = (result) =>
    offerReleaseForRefusal({ result, services, localize: services.localize });
  return { dialogs, reconciles, state, restore: env.restore };
}
