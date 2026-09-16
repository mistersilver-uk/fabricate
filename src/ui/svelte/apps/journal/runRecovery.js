/**
 * The GM's in-app door out of a retained execution claim (issue 1648).
 *
 * `reconcileJournalRunAuthority` releases authority ONLY: it replays nothing, compensates
 * nothing and rolls nothing back, and the two dispositions differ solely in what the ledger
 * records. The wording below says exactly that, so a GM is never told a choice does more
 * than it does. Retaining the claim stays correct; this supplies the missing door.
 */
import { journalRefusalMessage } from '../../util/journalRunReasons.js';

import { retainedClaimDetail } from './runStateNotice.js';

const DISPOSITIONS = Object.freeze(['reconciled', 'abandoned']);

/**
 * The `choiceDialog` descriptor for one retained claim.
 *
 * @param {object} claim `run.actions.recoveryClaim`.
 * @param {(key: string, data?: object) => string} localize
 * @returns {{title: string, content: string, choices: Array<{action: string, label: string}>}}
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
