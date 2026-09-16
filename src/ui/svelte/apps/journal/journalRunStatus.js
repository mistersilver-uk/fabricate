// Shared, pure tone+icon+label vocabulary for the player-facing Journal run
// status presentation. The frozen map supplies the active/detail chips and
// HistoryRow's labeled outcome glyph. HistoryRow explicitly requests unknown,
// recovery or inProgress for incomplete evidence rather than assuming success.
//
// Tones reuse the existing status palette (no new `--fab-*` tokens) and the
// RuntimeStatePill vocabulary: paused=neutral+pause; ready=success+play;
// succeeded=success+check; failed=danger+xmark; cancelled (and any un-mapped
// status, e.g. a step `pending`) = a neutral chip; inProgress=info. Ready never
// co-occurs with Succeeded (Ready only appears on ACTIVE runs, Succeeded only in
// HISTORY), so the shared success tone is disambiguated by icon + column context.
//
// `waiting` AND `inProgress` PRESENT AS ONE BADGE (issue 1648, D-029/M19). An unpaused active
// craft reads `In progress` whether it is counting the world clock down or sitting between
// stages: the two badges were interchangeable to read, and one of them named a state no filter
// tab selected. `derivedStatus` keeps both values because the projection still distinguishes
// where the clock is; the PLAYER is shown one word, and the difference they can act on is
// carried beside it by the attention vocabulary below and beneath it by the progress rail.

/**
 * Presentation descriptor for a run status pill.
 *
 * @typedef {{tone: 'success'|'warning'|'danger'|'info'|'neutral', icon: string, labelKey: string}} RunStatusPresentation
 */

/** The one badge an unpaused active run wears, whatever the clock is doing (D-029). */
const IN_PROGRESS_PRESENTATION = Object.freeze({
  tone: 'info',
  icon: 'fa-gear',
  labelKey: 'FABRICATE.App.Journal.Status.inProgress',
});

/** @type {Readonly<Record<string, RunStatusPresentation>>} */
const STATUS_PRESENTATION = Object.freeze({
  unknown: {
    tone: 'neutral',
    icon: 'fa-circle-question',
    labelKey: 'FABRICATE.App.Journal.Status.unknown',
  },
  recovery: {
    tone: 'warning',
    icon: 'fa-triangle-exclamation',
    labelKey: 'FABRICATE.App.Journal.Notice.RecoveryTitle',
  },
  paused: {
    tone: 'neutral',
    icon: 'fa-pause',
    labelKey: 'FABRICATE.App.Journal.Status.paused',
  },
  // ONE object, deliberately shared: the merged badge cannot drift into two that merely read
  // alike, and the surviving badge is adopted whole rather than a third look invented for it.
  waiting: IN_PROGRESS_PRESENTATION,
  ready: {
    tone: 'success',
    icon: 'fa-circle-play',
    labelKey: 'FABRICATE.App.Journal.Status.ready',
  },
  inProgress: IN_PROGRESS_PRESENTATION,
  succeeded: {
    tone: 'success',
    icon: 'fa-circle-check',
    labelKey: 'FABRICATE.App.Journal.Status.succeeded',
  },
  failed: {
    tone: 'danger',
    icon: 'fa-circle-xmark',
    labelKey: 'FABRICATE.App.Journal.Status.failed',
  },
  cancelled: {
    tone: 'neutral',
    icon: 'fa-ban',
    labelKey: 'FABRICATE.App.Journal.Status.cancelled',
  },
});

// Fallback for an un-mapped status (e.g. a step's `pending`): a neutral chip.
const NEUTRAL_PRESENTATION = Object.freeze({
  tone: 'neutral',
  icon: 'fa-circle',
  labelKey: 'FABRICATE.App.Journal.Status.inProgress',
});

/**
 * Resolve the icon/tone/label descriptor for a run's derived status. Unknown
 * statuses fall back to a neutral chip.
 *
 * @param {string} status A `RunModel.derivedStatus` value.
 * @returns {RunStatusPresentation}
 */
export function runStatusPresentation(status) {
  return STATUS_PRESENTATION[status] ?? NEUTRAL_PRESENTATION;
}

// WHAT THE RUN IS WAITING ON, WHEN THAT IS THE PLAYER (issue 1648, M10).
//
// `derivedStatus` answers where the clock is, and an unstarted stage has no clock: it reads
// `inProgress` whether the run needs nothing or cannot move until the player picks its
// materials. So the two states a person has to act on are carried BESIDE the status chip
// rather than inside it, on every surface a player scans.
//
// The two are deliberately separate: one is fixed by choosing and the other by acquiring, and
// telling a player to choose when nothing they can choose will help is the worse of the two
// failures. `accent` is the neutral "your move" family; `warning` is the blocked one.
const CHOICE_ATTENTION = Object.freeze({
  kind: 'choice',
  tone: 'accent',
  icon: 'fa-hand-pointer',
  labelKey: 'FABRICATE.App.Journal.Status.awaitingChoice',
});
// The third member (issue 1648, U2): a timed stage with every requirement met and its start
// not yet taken. It needs an irreversible click and nothing else, so under the merged badge it
// is otherwise indistinguishable from a run counting the world clock down. `accent` is the same
// "your move" family as a choice, because both are the player's to make rather than a refusal.
const START_ATTENTION = Object.freeze({
  kind: 'start',
  tone: 'accent',
  icon: 'fa-circle-play',
  labelKey: 'FABRICATE.App.Journal.Status.readyToBegin',
});
const MATERIALS_ATTENTION = Object.freeze({
  kind: 'materials',
  tone: 'warning',
  icon: 'fa-box-open',
  labelKey: 'FABRICATE.App.Journal.Status.needsMaterials',
});
// An essence gap, a price and a missing tool are different problems with different fixes, so
// each says so in its own words rather than collapsing into "materials" (issue 1648).
const ACQUISITION_ATTENTION = Object.freeze({
  selectionRequired: MATERIALS_ATTENTION,
  essenceRequired: Object.freeze({
    kind: 'essences',
    tone: 'warning',
    icon: 'fa-atom',
    labelKey: 'FABRICATE.App.Journal.Status.needsEssences',
  }),
  currencyRequired: Object.freeze({
    kind: 'currency',
    tone: 'warning',
    icon: 'fa-coins',
    labelKey: 'FABRICATE.App.Journal.Status.needsCurrency',
  }),
  toolRequired: Object.freeze({
    kind: 'tools',
    tone: 'warning',
    icon: 'fa-hammer',
    labelKey: 'FABRICATE.App.Journal.Status.needsTools',
  }),
});

/**
 * What this run needs from the player, or `null` when it needs nothing from them.
 *
 * @param {object|null} run A `RunModel`.
 * @returns {(RunStatusPresentation & {kind: string})|null}
 */
export function runAttentionPresentation(run) {
  if (run?.awaitingChoice === true) return CHOICE_ATTENTION;
  // Ranked under the two BLOCKED states: a stage that can be begun is asked for only once
  // nothing else is owed, which `beginStep` already answers — it is the projection's own
  // "`beginVersionedStage` would commit this" predicate, so the chip cannot invite a click the
  // command refuses.
  if (run?.actions?.atStageStart === true && run?.actions?.beginStep === true)
    return START_ATTENTION;
  return ACQUISITION_ATTENTION[run?.actions?.disabledReason] ?? null;
}
