/**
 * The Journal's one iterative notice (issue 3011, D-10): each state a Player's press can leave the
 * pane in, as a descriptor of already-localized copy `{ kind, reason, tone, icon, title, detail }`.
 * A result's ledger is the projected session row, so a hidden counter never reaches any copy.
 */
import { journalRunReasonMessage } from '../../svelte/util/journalRunReasons.js';
import { spentDiceNotice } from '../additionalDicePrompt.js';

import { iterativeRefusalCopy } from './iterativeRefusalCopy.js';
import { listText } from './iterativeRuleText.js';

const K = Object.freeze({
  busyTitle: 'FABRICATE.App.Journal.Iterative.Notice.BusyTitle',
  busyTitleFree: 'FABRICATE.App.Journal.Iterative.Notice.BusyTitleFree',
  busyDetail: 'FABRICATE.App.Journal.Iterative.Notice.BusyDetail',
  unansweredTitle: 'FABRICATE.App.Journal.Iterative.Notice.UnansweredTitle',
  staleTitle: 'FABRICATE.App.Journal.Iterative.Notice.StaleTitle',
  stale: 'FABRICATE.App.Journal.Iterative.Notice.StaleDetail',
  staleAlone: 'FABRICATE.App.Journal.Iterative.Notice.StaleDetailAlone',
  staleBought: 'FABRICATE.App.Journal.Iterative.Notice.StaleDetailBought',
  staleAloneBought: 'FABRICATE.App.Journal.Iterative.Notice.StaleDetailAloneBought',
  refusalTitle: 'FABRICATE.App.Journal.Iterative.Notice.RefusalTitle',
  checkDetail: 'FABRICATE.App.Journal.Iterative.Notice.CheckDetail',
  checkAsk: 'FABRICATE.App.Journal.Iterative.Notice.CheckAsk',
  checkName: 'FABRICATE.App.Journal.Iterative.Card.CheckName',
  resultTitle: 'FABRICATE.App.Journal.Iterative.Notice.ResultTitle',
  resultTitleFree: 'FABRICATE.App.Journal.Iterative.Notice.ResultTitleFree',
  resultPlain: 'FABRICATE.App.Journal.Iterative.Notice.ResultTitlePlain',
  resultPlainFree: 'FABRICATE.App.Journal.Iterative.Notice.ResultTitlePlainFree',
  resultFailedEffect: 'FABRICATE.App.Journal.Iterative.Notice.ResultFailedEffect',
  resultFailed: 'FABRICATE.App.Journal.Iterative.Notice.ResultFailed',
  resultSaved: 'FABRICATE.App.Journal.Iterative.Notice.ResultSaved',
  resumeTitle: 'FABRICATE.App.Journal.Iterative.Notice.ResumeTitle',
  resume: 'FABRICATE.App.Journal.Iterative.Notice.ResumeDetail',
  resumeFree: 'FABRICATE.App.Journal.Iterative.Notice.ResumeDetailFree',
  startedTitle: 'FABRICATE.App.Journal.Iterative.Notice.StartedTitle',
  started: 'FABRICATE.App.Journal.Iterative.Notice.StartedDetail',
  startedBare: 'FABRICATE.App.Journal.Iterative.Notice.StartedDetailBare',
});

/** The ranked order of the states one workpiece can show; the first one that applies is shown. */
export const ITERATIVE_NOTICE_ORDER = Object.freeze([
  'busy',
  'unanswered',
  'stale',
  'refusal',
  'check',
  'error',
  'verdict',
  'started',
  'result',
  'resume',
]);

/** The highest-ranked of `candidates` (`{ kind }` descriptors, `null`s skipped), else `null`. */
export function leadingNotice(candidates) {
  const present = candidates.filter(Boolean);
  const rank = (entry) => ITERATIVE_NOTICE_ORDER.indexOf(entry.kind);
  return present.toSorted((left, right) => rank(left) - rank(right))[0] ?? null;
}

const notice = (kind, reason, [tone, icon], [title, detail], extra = {}) => ({
  kind,
  reason,
  tone,
  icon,
  title,
  detail,
  ...extra,
});

const REFUSED = ['danger', 'fas fa-ban'];

/** The notice while a press saves: "Working session 3: Hammer", or "Working: Stoke" when free. */
export function busyNotice(pressed, localize) {
  const title = pressed.free
    ? localize(K.busyTitleFree, { action: pressed.name })
    : localize(K.busyTitle, { session: pressed.sessionNumber, action: pressed.name });
  return notice(
    'busy',
    'success',
    ['info', 'fas fa-hourglass-half'],
    [title, localize(K.busyDetail)]
  );
}

/** A command that timed out or threw: its outcome is unknown, so nothing is said to be spent. */
export function unansweredNotice(reason, localize) {
  const detail = journalRunReasonMessage('command-timeout', localize);
  return notice(
    'unanswered',
    reason,
    ['warning', 'fas fa-hourglass-end'],
    [localize(K.unansweredTitle), detail]
  );
}

/**
 * A stale refusal: the action `other` took first, when the reload names any, and the press's own.
 * Bought dice are never refunded, so a refusal after a buy states the spend, not "nothing was spent".
 */
export function staleNotice({ action, other, result, localize }) {
  const bought = result?.boughtDice > 0;
  const keys = other
    ? { plain: K.stale, bought: K.staleBought }
    : { plain: K.staleAlone, bought: K.staleAloneBought };
  const detail = localize(bought ? keys.bought : keys.plain, { other, action });
  return notice(
    'stale',
    'stale-run',
    ['warning', 'fas fa-arrows-rotate'],
    [localize(K.staleTitle), [detail, spentDiceNotice(result, localize)].filter(Boolean).join(' ')]
  );
}

/** A refused press, worded by `iterativeRefusalCopy`. */
export function refusalNotice(result, context) {
  const reason = typeof result?.reason === 'string' && result.reason ? result.reason : 'refused';
  return notice('refusal', reason, REFUSED, [
    context.localize(K.refusalTitle),
    iterativeRefusalCopy(result, context),
  ]);
}

/** The check could not roll: its own message when it has one, else who to ask. */
export function checkNotice(result, localize) {
  const check = localize(K.checkName);
  const message = typeof result?.message === 'string' ? result.message.trim() : '';
  return notice('check', 'roll-unavailable', REFUSED, [
    localize(K.refusalTitle),
    `${localize(K.checkDetail, { check })} ${message || localize(K.checkAsk)}`,
  ]);
}

/** A press that could not be sent at all, saying the shipped craft error. */
export function errorNotice(message, localize) {
  return notice('error', 'no-id-service', REFUSED, [localize(K.refusalTitle), message]);
}

function resultTitle({ row, fallback, localize }) {
  const action = row?.action ?? fallback.action;
  const session = row ? row.sessionNumber : fallback.session;
  const free = session === null || session === undefined;
  const checked = row?.check?.outcome != null;
  if (checked) {
    const data = { session, action, outcome: row.check.outcome, value: row.check.value };
    return localize(free ? K.resultTitleFree : K.resultTitle, data);
  }
  return localize(free ? K.resultPlainFree : K.resultPlain, { session, action });
}

const RESULT_LOOKS = Object.freeze({
  'check-failed': ['warning', 'fas fa-dice-d20'],
  'check-passed': ['info', 'fas fa-dice-d20'],
  private: ['info', 'fas fa-dice-d20'],
  'no-check': ['info', 'fas fa-hand-back-fist'],
});

/**
 * A committed press. `reason` classifies the reply's check, `row` is the reloaded session row it
 * wrote (or `null` when the reload does not hold it yet), `fallback` names the press itself.
 */
export function resultNotice({ reason, row, fallback, replayed, localize }) {
  let detail = localize(K.resultSaved);
  if (reason === 'check-failed') {
    detail = localize(row?.changed?.length > 0 ? K.resultFailedEffect : K.resultFailed);
  }
  return notice(
    'result',
    reason,
    RESULT_LOOKS[reason],
    [resultTitle({ row, fallback, localize }), detail],
    { ledger: row ?? null, replayed: replayed === true }
  );
}

/** "Picked up where you left off", for a workpiece first seen with attempts already on it. */
export function resumeNotice(iterative, localize) {
  const session = iterative?.nextSession;
  const detail = session ? localize(K.resume, { session }) : localize(K.resumeFree);
  return notice(
    'resume',
    'success',
    ['info', 'fas fa-rotate-left'],
    [localize(K.resumeTitle), detail]
  );
}

/** "Step 2 started", beside the counters its start formulas gave. */
export function startedNotice(iterative, localize) {
  const index = (iterative?.focusStepIndex ?? 0) + 1;
  const counters = listText(
    (iterative?.startedWith ?? []).map((row) => row.text),
    'all',
    localize
  );
  const detail = counters ? localize(K.started, { index, counters }) : localize(K.startedBare);
  return notice(
    'started',
    'success',
    ['info', 'fas fa-forward-step'],
    [localize(K.startedTitle, { index }), detail]
  );
}

/** The step-end verdict a boundary or a finished piece states, as a notice. */
export function verdictNotice(verdict) {
  return notice(
    'verdict',
    verdict.end,
    [verdict.tone, verdict.icon],
    [verdict.title, verdict.detail],
    {
      yields: verdict.yields ?? [],
    }
  );
}
