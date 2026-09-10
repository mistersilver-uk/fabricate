// Shared, pure tone+icon+label vocabulary for the player-facing Journal run
// status presentation. The frozen map supplies the active/detail chips and
// HistoryRow's labeled outcome glyph. HistoryRow explicitly requests unknown,
// recovery or inProgress for incomplete evidence rather than assuming success.
//
// Tones reuse the existing status palette (no new `--fab-*` tokens) and the
// RuntimeStatePill vocabulary: paused=neutral+pause; waiting=warning+hourglass; ready=success+play;
// succeeded=success+check; failed=danger+xmark; cancelled (and any un-mapped
// status, e.g. a step `pending`) = a neutral chip; inProgress=info. Ready never
// co-occurs with Succeeded (Ready only appears on ACTIVE runs, Succeeded only in
// HISTORY), so the shared success tone is disambiguated by icon + column context.

/**
 * Presentation descriptor for a run status pill.
 *
 * @typedef {{tone: 'success'|'warning'|'danger'|'info'|'neutral', icon: string, labelKey: string}} RunStatusPresentation
 */

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
  waiting: {
    tone: 'warning',
    icon: 'fa-hourglass-half',
    labelKey: 'FABRICATE.App.Journal.Status.waiting',
  },
  ready: {
    tone: 'success',
    icon: 'fa-circle-play',
    labelKey: 'FABRICATE.App.Journal.Status.ready',
  },
  inProgress: {
    tone: 'info',
    icon: 'fa-gear',
    labelKey: 'FABRICATE.App.Journal.Status.inProgress',
  },
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
