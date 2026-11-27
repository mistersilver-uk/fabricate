/**
 * The run controls of an iterative run (issue 3011, D-6): no primary and no pause, because the
 * step is worked card by card; "Start step N" at a boundary; and a cancel whose prompt says, by
 * the refund setting and the step count, what stopping returns.
 */
const K = Object.freeze({
  begin: 'FABRICATE.App.Journal.Iterative.Begin.Label',
  beginBusy: 'FABRICATE.App.Journal.Iterative.Begin.Busy',
  aria: 'FABRICATE.App.Journal.Iterative.Cancel.Aria',
  confirm: 'FABRICATE.App.Journal.Iterative.Cancel.Confirm',
  keep: 'FABRICATE.App.Journal.Iterative.Cancel.Keep',
  stopStep: 'FABRICATE.App.Journal.Iterative.Cancel.StopStep',
  stopPiece: 'FABRICATE.App.Journal.Iterative.Cancel.StopPiece',
  stopStepRefund: 'FABRICATE.App.Journal.Iterative.Cancel.StopStepRefund',
  stopPieceRefund: 'FABRICATE.App.Journal.Iterative.Cancel.StopPieceRefund',
});

/** The cancel prompt: refunds on unless the run says off, the current step named on a multi-step run. */
function cancelPrompt(run, localize) {
  const refund = run.refundOnCancel !== false;
  const index = (run.iterative.boundary?.nextStepIndex ?? run.iterative.focusStepIndex ?? 0) + 1;
  if ((run.steps?.length ?? 0) > 1) {
    return localize(refund ? K.stopStepRefund : K.stopStep, { index });
  }
  return localize(refund ? K.stopPieceRefund : K.stopPiece);
}

/**
 * `{ run, begin, cancel }` for `RunActionBar`. `busy` is whether this run holds the journal's busy
 * key, `canCancel` and `reason` the panel's own reading of the run's actions.
 */
export function workpieceBar({ run, busy, canCancel, reason, localize }) {
  const actions = run.actions ?? {};
  const index = (run.iterative.boundary?.nextStepIndex ?? run.stepIndex ?? 0) + 1;
  const aria = localize(K.aria);
  return {
    run: { ...run, busy },
    begin:
      actions.atStageStart === true
        ? {
            enabled: actions.beginStep === true,
            label: localize(K.begin, { index }),
            busyLabel: localize(K.beginBusy, { index }),
            icon: 'fas fa-forward-step',
            prompt: '',
            reason,
          }
        : null,
    cancel: {
      disabled: !canCancel,
      ariaLabel: aria,
      title: canCancel ? aria : reason,
      prompt: cancelPrompt(run, localize),
      confirmLabel: localize(K.confirm),
      keepLabel: localize(K.keep),
    },
  };
}
