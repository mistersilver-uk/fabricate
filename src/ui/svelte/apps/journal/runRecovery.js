/**
 * The GM's in-app door out of a retained execution claim (issue 1648).
 *
 * `reconcileJournalRunAuthority` releases authority ONLY: it replays nothing, compensates
 * nothing and rolls nothing back, and the two dispositions differ solely in what the ledger
 * records. The wording below says exactly that, so a GM is never told a choice does more
 * than it does. Retaining the claim stays correct; this supplies the missing door.
 */
import { choiceDialog } from '../../util/foundryBridge.js';
import { journalRefusalMessage } from '../../util/journalRunReasons.js';

import { retainedClaimDetail } from './runStateNotice.js';

const DISPOSITIONS = Object.freeze(['reconciled', 'abandoned']);

/**
 * The `choiceDialog` descriptor for one retained claim.
 *
 * @param {object} claim `run.actions.recoveryClaim`.
 * @param {(key: string, data?: object) => string} localize
 * @returns {{title: string, content: string, choices: Array<{action: string, label: string}>,
 *   defaultAction: string}} Cancel is the default, so an unsolicited dialog never defaults to a release.
 */
export function retainedClaimPrompt(claim, localize) {
  const text = (key, ...data) => localize(`FABRICATE.App.Journal.Recovery.${key}`, ...data);
  const paragraph = (value) => `<p>${escapeHtml(value)}</p>`;
  return {
    title: text('Title'),
    content: [
      paragraph(retainedClaimDetail(claim, localize)),
      paragraph(text('Inspect')),
      paragraph(text('Effect')),
    ].join(''),
    choices: [
      { action: 'reconciled', label: text('Reconciled'), icon: 'fas fa-clipboard-check' },
      { action: 'abandoned', label: text('Abandoned'), icon: 'fas fa-ban' },
      { action: 'cancel', label: text('Cancel'), icon: 'fas fa-xmark' },
    ],
    defaultAction: 'cancel',
  };
}

/**
 * Record the GM's disposition of one retained claim and report what to tell them.
 *
 * @param {object} options
 * @param {object} options.claim `run.actions.recoveryClaim`.
 * @param {string} options.disposition `reconciled` or `abandoned`.
 * @param {object} options.services The app's Foundry seam bag.
 * @param {(key: string, data?: object) => string} options.localize
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function reconcileRetainedClaim({ claim, disposition, services, localize }) {
  const text = (key, ...data) => localize(`FABRICATE.App.Journal.Recovery.${key}`, ...data);
  if (!claim?.claimId || !DISPOSITIONS.includes(disposition)) {
    return { success: false, message: text('InvalidDisposition') };
  }
  let result;
  try {
    result = await services?.reconcileJournalRunAuthority?.({
      claimId: claim.claimId,
      disposition,
    });
  } catch (error) {
    console.error('Fabricate | Error reconciling the Journal run authority claim:', error);
    result = null;
  }
  if (result?.success === true) {
    return {
      success: true,
      message: text('Released', { disposition: text(`Disposition.${disposition}`) }),
    };
  }
  return {
    success: false,
    message: journalRefusalMessage(result, localize, text('ReleaseFailed')),
  };
}

/**
 * Ask the GM how to release one retained claim and record the choice. `onBusy` brackets only the
 * recording, never the open dialog, and `onRecorded` runs after the outcome is notified. Cancel
 * or a closed window records nothing. A throw while reporting never hides a recorded release.
 *
 * @returns {Promise<{recorded: boolean, released: boolean}>} `recorded` is true once the GM chose
 *   a disposition. `released` is true only when the authority accepted it.
 */
export async function offerRetainedClaimRelease({
  claim,
  services,
  localize,
  onBusy = () => {},
  onRecorded = async () => {},
}) {
  const disposition = await choiceDialog(retainedClaimPrompt(claim, localize));
  if (!DISPOSITIONS.includes(disposition)) return { recorded: false, released: false };
  onBusy(true);
  try {
    const outcome = await reconcileRetainedClaim({ claim, disposition, services, localize });
    try {
      services?.notify?.(outcome.message);
      await onRecorded();
    } catch (error) {
      console.error('Fabricate | Error reporting the claim release:', error);
    }
    return { recorded: true, released: outcome.success };
  } finally {
    onBusy(false);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
