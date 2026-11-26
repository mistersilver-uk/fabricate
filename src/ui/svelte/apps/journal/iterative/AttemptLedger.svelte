<!-- Svelte 5 runes mode -->
<!-- What one committed Iterative Attempt checked, paid and changed (issue 3011, D-10), read from
     its projected session row, so no counter hidden from this viewer is named. A Notice's evidence. -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../../../components/Chip.svelte';
  import JournalFactRow from '../JournalFactRow.svelte';

  const K = Object.freeze({
    check: 'FABRICATE.App.Journal.Iterative.Ledger.Check',
    paid: 'FABRICATE.App.Journal.Iterative.Ledger.Paid',
    changed: 'FABRICATE.App.Journal.Iterative.Ledger.Changed',
    nothing: 'FABRICATE.App.Journal.Iterative.Ledger.Nothing',
  });

  let { row } = $props();
</script>

{#snippet chips(list, tone)}
  <span class="workpiece-ledger-chips">
    {#each list ?? [] as chip (chip.counterId)}<Chip density="row" {tone} mono>{chip.label}</Chip>
    {:else}<Chip density="row" tone="info" mono>{localize(K.nothing)}</Chip>{/each}
  </span>
{/snippet}

<div class="workpiece-ledger" data-iterative-ledger>
  <JournalFactRow keyed prose icon={null} label={localize(K.check)}>
    <Chip density="row" tone="info" mono>{row?.check?.text ?? ''}</Chip>
  </JournalFactRow>
  <JournalFactRow keyed prose icon={null} label={localize(K.paid)}>
    {@render chips(row?.paid, 'danger')}
  </JournalFactRow>
  <JournalFactRow keyed prose icon={null} label={localize(K.changed)}>
    {@render chips(row?.changed, 'positive')}
  </JournalFactRow>
</div>

<style>
  .workpiece-ledger {
    display: grid;
    gap: var(--fab-space-1);
    --journal-fact-key-width: 72px;
  }

  .workpiece-ledger-chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
  }
</style>
