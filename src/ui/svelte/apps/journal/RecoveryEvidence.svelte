<!--
  A run's recovery receipts, effect by effect, with Native Reconciliation's Record outcome… control
  at their foot for the active GM and, on a run a GM closed, who closed it and their note.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `run` | RunModel | `null` | Carries a non-null `recoveryEvidence`. |
  | `services` | app seam bag | `null` | `reconcileUncertainJournalRun` and `notify`. |
  | `journal` | journal store | `null` | `load(true)` re-reads the run once an outcome is recorded. |

  Invariants:
  - The control renders only for `run.actions.reconcileUncertain` — pinned by
    `tests/components/run-detail-mounted.test.js`.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Button from '../../components/Button.svelte';
  import ListRow from '../../components/ListRow.svelte';
  import JournalFactRow from './JournalFactRow.svelte';
  import { presentReceiptFacts } from './historyPresentation.js';
  import { effectPhaseText, quantityText } from './runDetailPresentation.js';
  import { dispositionLabel, recordNativeOutcome } from './runRecovery.js';

  let { run = null, services = null, journal = null } = $props();
  const closed = $derived(run?.gmReconciliation ?? null);
  let recording = $state(false);

  function recordOutcome() {
    if (recording) return;
    recordNativeOutcome({
      run,
      services,
      journal,
      localize,
      onBusy: (busy) => (recording = busy),
    });
  }
</script>

<section data-journal-recovery-evidence>
  {#each run?.recoveryEvidence?.effects ?? [] as effect (effect.index)}
    <div data-journal-effect={effect.index} data-effect-phase={effect.phase}>
      <JournalFactRow
        label={localize('FABRICATE.App.Journal.Notice.Effect', { index: effect.index + 1 })}
        value={effectPhaseText(effect.phase, localize)}
        danger={effect.phase === 'applying'}
      />
      {#each effect.receipt?.items ?? [] as item, index (index)}
        <ListRow
          art={item.img ?? ''}
          name={item.name || localize('FABRICATE.App.Journal.History.UnknownMaterial')}
          quantity={quantityText(item.quantity, localize)}
        />
      {/each}
      {#each presentReceiptFacts(effect.receipt, localize) as fact, index (index)}
        <JournalFactRow label={fact.label} value={fact.value} />
      {/each}
    </div>
  {/each}
  {#if closed}
    <JournalFactRow
      keyed
      label={localize('FABRICATE.App.Journal.NativeRecovery.ClosedBy')}
      value={`${closed.userName || localize('FABRICATE.App.Journal.NativeRecovery.ClosedByUnknown')} · ${dispositionLabel(closed.disposition, localize)}`}
    />
    {#if closed.note}<JournalFactRow
        keyed
        prose
        label={localize('FABRICATE.App.Journal.NativeRecovery.GmNote')}
        value={closed.note}
      />{/if}
  {/if}
  {#if run?.actions?.reconcileUncertain === true}
    <Button
      icon="fas fa-clipboard-check"
      disabled={recording}
      description={localize('FABRICATE.App.Journal.NativeRecovery.ActionHint')}
      data-journal-native-outcome=""
      onclick={recordOutcome}>{localize('FABRICATE.App.Journal.NativeRecovery.Action')}</Button
    >
  {/if}
</section>
