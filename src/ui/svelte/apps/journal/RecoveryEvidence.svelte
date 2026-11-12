<!-- ratchet-exempt(design-system): a composition of the Button and ListRow members and the app-local JournalFactRow, extracted from RunDetail and reused by HistoricalRunDetail's GM-closed face rather than offered as a vocabulary member -->
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
  let prompting = false;

  async function recordOutcome() {
    if (prompting) return;
    prompting = true;
    try {
      await recordNativeOutcome({
        run,
        services,
        journal,
        localize,
        onBusy: (busy) => (recording = busy),
      });
    } finally {
      prompting = false;
    }
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
    <div class="recovery-evidence-closed">
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
    </div>
  {/if}
  {#if run?.actions?.reconcileUncertain === true}
    <div class="recovery-evidence-foot">
      <Button
        icon="fas fa-clipboard-check"
        busy={recording}
        description={localize('FABRICATE.App.Journal.NativeRecovery.ActionHint')}
        data-journal-native-outcome=""
        onclick={recordOutcome}
        >{localize(
          recording
            ? 'FABRICATE.App.Journal.Actions.Working'
            : 'FABRICATE.App.Journal.NativeRecovery.Action'
        )}</Button
      >
    </div>
  {/if}
</section>

<style>
  .recovery-evidence-closed,
  .recovery-evidence-foot {
    margin-top: var(--fab-space-3);
  }

  .recovery-evidence-closed {
    display: grid;
    gap: var(--fab-space-1);
  }
</style>
