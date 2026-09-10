<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RunActionBar from '../../components/RunActionBar.svelte';
  import Notice from '../../components/Notice.svelte';
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
  const reason = $derived(reasonFor(actions.disabledReason, gateReady));
  const hasCheck = $derived(
    Boolean(
      run?.currentStep?.detail?.checkLabel ||
      run?.currentStep?.resolutionSnapshot?.kind === 'check' ||
      run?.gatheringYield?.mode === 'routed'
    )
  );

  function reasonFor(code, ready) {
    const key = {
      authorityUnavailable: 'AuthorityUnavailable',
      'active-gm-missing': 'AuthorityUnavailable',
      'active-gm-required': 'ActiveGmRequired',
      'ledger-missing': 'LedgerMissing',
      'ledger-ambiguous': 'LedgerAmbiguous',
      recoveryRequired: 'RecoveryRequired',
      'recovery-required': 'RecoveryRequired',
      'claim-held': 'ClaimHeld',
      'claim-release-failed': 'ClaimReleaseFailed',
      'secure-random-unavailable': 'SecureRandomUnavailable',
      executionInProgress: 'ExecutionInProgress',
      unsupportedLifecycle: 'UnsupportedLifecycle',
      selectionRequired: 'SelectionRequired',
    }[code];
    if (key) return localize(`FABRICATE.App.Journal.Actions.${key}`);
    if (code === 'notOwner') return localize('FABRICATE.App.Journal.Actions.NeedsOwner');
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
        currentContract || run?.refundOnCancel === false
          ? 'FABRICATE.App.Journal.Actions.CancelConfirmForfeit'
          : 'FABRICATE.App.Journal.Actions.CancelConfirmRefund'
      ),
      confirmLabel: localize('FABRICATE.App.Journal.Actions.CancelConfirmYes'),
      keepLabel: localize('FABRICATE.App.Journal.Actions.CancelKeep'),
    }}
    {completion}
    onPrimary={() => journal?.execute?.(run)}
    onPause={() => journal?.pause?.(run)}
    onResume={() => journal?.resume?.(run)}
    onCancel={() => journal?.cancel?.(run)}
    bind:armed={cancelArmed}
  />
  {#if actions.disabledReason && !canExecute}
    <Notice
      tone="warning"
      title={reason}
      dataAttr="data-journal-action-blocker"
      dataValue={actions.disabledReason}
    />
  {/if}
</div>
