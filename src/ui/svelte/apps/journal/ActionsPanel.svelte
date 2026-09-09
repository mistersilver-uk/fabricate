<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RunActionBar from '../../components/RunActionBar.svelte';

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
  const legacyExecutable = $derived(run?.manualAdvance === true && gateReady);
  const canExecute = $derived(actions.execute === true || (!currentContract && legacyExecutable));
  const canCancel = $derived(
    actions.cancel === true || (!currentContract && run?.canCancel === true)
  );
  const reason = $derived(reasonFor(actions.disabledReason, gateReady));

  function reasonFor(code, ready) {
    if (!ready) return localize('FABRICATE.App.Journal.Actions.WaitingHint');
    const key = {
      authorityUnavailable: 'AuthorityUnavailable',
      recoveryRequired: 'RecoveryRequired',
      unsupportedLifecycle: 'UnsupportedLifecycle',
      selectionRequired: 'SelectionRequired',
    }[code];
    return key
      ? localize(`FABRICATE.App.Journal.Actions.${key}`)
      : localize('FABRICATE.App.Journal.Actions.NeedsOwner');
  }

  function primaryLabel() {
    if (run?.activityKind === 'gathering') return localize('FABRICATE.App.Journal.Actions.Collect');
    if (run?.activityKind === 'alchemy') return localize('FABRICATE.App.Journal.Actions.Brew');
    return localize(
      run?.isFinalStep
        ? 'FABRICATE.App.Journal.Actions.FinishCrafting'
        : 'FABRICATE.App.Journal.Actions.TriggerNextStep'
    );
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
      icon: 'fas fa-play',
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
</div>
