<!-- Svelte 5 runes mode -->
<!--
  SalvageProgressiveBody renders `progressive` salvage: one roll flows DOWN an
  ordered list, each stage consuming its difficulty before the next is produced — so
  the order decides what the player actually recovers.

  It wraps the shared `ProgressiveStageList` (the crafting tab's), passing its two
  opt-in extensions: per-stage quantity and a `stateChip` snippet. Reuse rather than a
  twin is what keeps salvage's a11y triad — drag, keyboard, live region — identical to
  crafting's, and what keeps `canReorder: false` DETACHING the handlers instead of
  leaving inert rows a player can grab to no effect.

  Reorder is the whole of the shipped feature: drag + keyboard, no exclude affordance.
  Exclusion would contradict the canonical reconciliation contract, which guarantees a
  result is never dropped (`out.length === results.length` ALWAYS) and has nowhere to
  persist an exclusion.

  The state chips are read-only. Before a roll every stage is "Awaiting roll"; after
  one, the summary above carries the outcome — so this stays the plan, not the record.
-->
<script>
  import { localize } from '../../../../util/foundryBridge.js';
  import ProgressiveStageList from '../../../crafting/detail/ProgressiveStageList.svelte';

  let {
    stages = [],
    canReorder = true,
    announcement = '',
    onReorder = () => {},
    onReorderSettled = () => {}
  } = $props();
</script>

{#snippet stateChip(stage)}
  <!-- Read-only. `Excluded` is deliberately absent: there is no exclude affordance. -->
  <span
    class="salvage-state-chip"
    data-progressive-stage-state={stage.threshold === null ? 'unreachable' : 'awaiting'}
  >
    {stage.threshold === null
      ? localize('FABRICATE.App.Inventory.Salvage.StateNotReached')
      : localize('FABRICATE.App.Inventory.Salvage.StateAwaitingRoll')}
  </span>
{/snippet}

<div class="salvage-body" data-inventory-salvage-body="progressive">
  <p class="salvage-progressive-banner" data-inventory-salvage-flow-note>
    <i class="fas fa-arrow-down-long" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Inventory.Salvage.ProgressiveFlow')}</span>
  </p>

  {#if stages.length === 0}
    <p class="salvage-empty">{localize('FABRICATE.App.Inventory.Salvage.NoResults')}</p>
  {:else}
    <ProgressiveStageList
      {stages}
      {canReorder}
      {announcement}
      {onReorder}
      {onReorderSettled}
      showQuantity
      {stateChip}
    />
  {/if}
</div>

<style>
  .salvage-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .salvage-progressive-banner {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--fab-info-border);
    border-radius: 9px;
    background: var(--fab-info-soft);
    color: var(--fab-info-text);
    font-size: 11px;
    line-height: 1.5;
  }

  .salvage-empty {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .salvage-state-chip {
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
</style>
