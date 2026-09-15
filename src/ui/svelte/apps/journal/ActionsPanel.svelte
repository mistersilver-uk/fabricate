<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { journalRunReasonMessage } from '../../util/journalRunReasons.js';
  import RunActionBar from '../../components/RunActionBar.svelte';
  import { formatDurationHMS } from '../../util/formatDuration.js';

  let { run = null, journal = null, now = 0 } = $props();
  let cancelArmed = $state(false);

  const runKey = $derived(String(run?.key ?? run?.id ?? ''));
  const busy = $derived(
    String(journal?.busyRunKey ?? journal?.busyRunId ?? '') === runKey ||
      String(journal?.busyRunId ?? '') === String(run?.id ?? '')
  );
  const availableAt = $derived(Number(run?.timeGate?.availableAt));
  const gateReady = $derived(!Number.isFinite(availableAt) || availableAt <= now);
  const actions = $derived(run?.actions ?? {});
  const currentContract = $derived(run?.lifecycleContract === 'current');
  const legacyContract = $derived(
    run?.lifecycleContract == null || run.lifecycleContract === 'legacy'
  );
  const legacyExecutable = $derived(run?.manualAdvance === true && gateReady);
  const canExecute = $derived(
    currentContract
      ? actions.execute === true
      : legacyContract && legacyExecutable && actions.execute !== false
  );
  const canCancel = $derived(
    currentContract ? actions.cancel === true : legacyContract && run?.canCancel === true
  );
  // The stage boundary is its own control: it locks the choice, spends the materials and
  // starts the clock, and it is the ONLY thing that does so.
  const canBegin = $derived(currentContract && actions.beginStep === true);
  const awaitingStart = $derived(
    currentContract && (canBegin || actions.disabledReason === 'stageNotStarted')
  );
  const reason = $derived(reasonFor(actions.disabledReason, gateReady));
  const hasCheck = $derived(
    Boolean(
      run?.currentStep?.detail?.checkLabel ||
      run?.currentStep?.resolutionSnapshot?.kind === 'check' ||
      run?.gatheringYield?.mode === 'routed'
    )
  );

  // The code vocabulary itself lives in `journalRunReasons.js` so the stores that
  // report an authority refusal share it; only the panel's two positional
  // fallbacks (waiting on the time gate, then the generic) stay here.
  function reasonFor(code, ready) {
    const message = journalRunReasonMessage(code, localize);
    if (message) return message;
    // A code we cannot word is still a REFUSAL, so it must not fall through to the time-gate
    // hint: that told a player to wait for world time while the authority was the thing missing.
    // The positional fallbacks below apply only when the builder gave no code at all.
    if (code) return localize('FABRICATE.App.Journal.Actions.Unavailable');
    if (!ready) return localize('FABRICATE.App.Journal.Actions.WaitingHint');
    return localize('FABRICATE.App.Journal.Actions.Unavailable');
  }

  function primaryLabel() {
    if (currentContract && !gateReady)
      return localize('FABRICATE.App.Journal.Actions.Wait', {
        time: formatDurationHMS(availableAt - now),
      });
    if (run?.gatheringYield?.mode === 'd100')
      return localize('FABRICATE.App.Journal.Actions.RollD100');
    if (hasCheck) return localize('FABRICATE.App.Journal.Actions.RollCheck');
    if (run?.activityKind === 'gathering') return localize('FABRICATE.App.Journal.Actions.Collect');
    if (run?.activityKind === 'alchemy') return localize('FABRICATE.App.Journal.Actions.Brew');
    return localize(
      run?.isFinalStep
        ? 'FABRICATE.App.Journal.Actions.Complete'
        : 'FABRICATE.App.Journal.Actions.CompleteStage'
    );
  }

  function primaryIcon() {
    if (!gateReady) return 'fas fa-hourglass-half';
    if (run?.gatheringYield?.mode === 'd100') return 'fas fa-dice';
    if (hasCheck) return 'fas fa-dice-d20';
    return 'fas fa-check-double';
  }

  const completion = $derived(
    actions.setCompletionMode === true
      ? {
          label: localize('FABRICATE.App.Journal.Actions.Completion.Label'),
          value: run?.completionMode === 'worldTime' ? 'worldTime' : 'manual',
          ariaLabel: localize('FABRICATE.App.Journal.Actions.Completion.Label'),
          options: [
            {
              value: 'manual',
              fallback: localize('FABRICATE.App.Journal.Actions.Completion.Manual'),
            },
            {
              value: 'worldTime',
              fallback: localize('FABRICATE.App.Journal.Actions.Completion.WorldTime'),
            },
          ],
          onChange: (value) => journal?.setCompletionMode?.(run, value),
        }
      : false
  );
</script>

<div class="journal-actions" data-journal-actions>
  <RunActionBar
    {run}
    runLabel={String(run?.names?.title ?? '')}
    primary={{
      enabled: canExecute,
      busy,
      label: primaryLabel(),
      busyLabel: localize('FABRICATE.App.Journal.Actions.Working'),
      icon: primaryIcon(),
      reason,
    }}
    begin={awaitingStart
      ? {
          enabled: canBegin,
          label: localize('FABRICATE.App.Journal.Actions.BeginStep'),
          busyLabel: localize('FABRICATE.App.Journal.Actions.Working'),
          icon: 'fas fa-play',
          prompt: localize('FABRICATE.App.Journal.Actions.BeginStepPrompt'),
          reason,
        }
      : null}
    pause={{
      enabled: actions.pause === true,
      label: localize('FABRICATE.App.Journal.Actions.Pause'),
      reason,
    }}
    resume={{
      disabled: actions.resume !== true,
      label: localize('FABRICATE.App.Journal.Actions.Resume'),
      title: reason,
    }}
    cancel={{
      disabled: !canCancel,
      ariaLabel: localize('FABRICATE.App.Journal.Actions.CancelCraft'),
      title: canCancel ? localize('FABRICATE.App.Journal.Actions.CancelCraft') : reason,
      prompt: localize(
        run?.refundOnCancel === false
          ? 'FABRICATE.App.Journal.Actions.CancelConfirmForfeit'
          : 'FABRICATE.App.Journal.Actions.CancelConfirmRefund'
      ),
      confirmLabel: localize('FABRICATE.App.Journal.Actions.CancelConfirmYes'),
      keepLabel: localize('FABRICATE.App.Journal.Actions.CancelKeep'),
    }}
    {completion}
    onPrimary={() => journal?.execute?.(run)}
    onBegin={() => journal?.beginStep?.(run)}
    onPause={() => journal?.pause?.(run)}
    onResume={() => journal?.resume?.(run)}
    onCancel={() => journal?.cancel?.(run)}
    bind:armed={cancelArmed}
  />
</div>
