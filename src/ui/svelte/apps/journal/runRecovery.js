/**
 * The GM's in-app doors out of a retained execution claim (issue 1648) and, by Native
 * Reconciliation, out of an uncertain legacy run, which archives it and changes nothing else.
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

/**
 * Native Reconciliation's `choiceDialog` descriptor. Cancel is the default, so Enter closes nothing,
 * and `choiceDialog` rather than `confirmDialog` because it is a three-way choice outside the
 * manager scope, as `retainedClaimPrompt` is.
 */
export function nativeOutcomePrompt(localize) {
  const paragraphs = [
    'FABRICATE.App.Journal.NativeRecovery.Detail',
    'FABRICATE.App.Journal.NativeRecovery.Inspect',
    'FABRICATE.App.Journal.NativeRecovery.Effect',
  ];
  return {
    title: localize('FABRICATE.App.Journal.NativeRecovery.Title'),
    content: paragraphs.map((key) => `<p>${escapeHtml(localize(key))}</p>`).join(''),
    choices: [
      {
        action: 'reconciled',
        label: localize('FABRICATE.App.Journal.NativeRecovery.Reconciled'),
        icon: 'fas fa-clipboard-check',
      },
      {
        action: 'abandoned',
        label: localize('FABRICATE.App.Journal.NativeRecovery.Abandoned'),
        icon: 'fas fa-ban',
      },
      {
        action: 'cancel',
        label: localize('FABRICATE.App.Journal.NativeRecovery.Cancel'),
        icon: 'fas fa-xmark',
      },
    ],
    defaultAction: 'cancel',
  };
}

const DISPOSITION_KEYS = Object.freeze({
  reconciled: 'FABRICATE.App.Journal.Recovery.Disposition.reconciled',
  abandoned: 'FABRICATE.App.Journal.Recovery.Disposition.abandoned',
});

/** The recorded disposition's word, `checked` or `abandoned`; `''` for any other value. */
export function dispositionLabel(disposition, localize) {
  return Object.hasOwn(DISPOSITION_KEYS, disposition)
    ? localize(DISPOSITION_KEYS[disposition])
    : '';
}

/**
 * Ask the active GM how to close an uncertain legacy run, record the disposition, notify the
 * outcome or the localized refusal, and re-read the Journal. Cancel or a closed window records
 * nothing; `onBusy` brackets only the recording, never the open dialog.
 */
export async function recordNativeOutcome({ run, services, journal, localize, onBusy = () => {} }) {
  const disposition = await choiceDialog(nativeOutcomePrompt(localize));
  if (!DISPOSITIONS.includes(disposition)) return false;
  onBusy(true);
  try {
    let result = null;
    try {
      result = await services?.reconcileUncertainJournalRun?.({
        actorUuid: run?.actorUuid,
        runType: run?.runType,
        runId: run?.id,
        disposition,
      });
    } catch (error) {
      console.error('Fabricate | Error recording the native run outcome:', error);
    }
    const success = result?.success === true;
    services?.notify?.(
      success
        ? localize('FABRICATE.App.Journal.NativeRecovery.Closed', {
            disposition: dispositionLabel(disposition, localize),
          })
        : journalRefusalMessage(
            result,
            localize,
            localize('FABRICATE.App.Journal.NativeRecovery.CloseFailed')
          )
    );
    await journal?.load?.(true);
    return success;
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
