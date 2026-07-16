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

  The state chips are read-only, and they RECONCILE WITH THE ROLL. Before a roll the
  list is a plan and every reachable stage reads "Awaiting roll"; after one it is a
  record. A stage still claiming to await a roll directly beneath a success ribbon is a
  contradiction the player would have to resolve for us.

  The post-roll truth comes from the run record's `createdResults` — the engine's OWN
  list of what it awarded, keyed by componentId — not from matching the created Items
  by name, which is fragile. A salvage that ran without a run manager (the runless
  invariant) leaves no record, so the rows degrade to a neutral resolved state rather
  than inventing one and claiming every stage fell short.
-->
<script>
  import { localize } from '../../../../util/foundryBridge.js';
  import ProgressiveStageList from '../../../crafting/detail/ProgressiveStageList.svelte';

  let {
    stages = [],
    canReorder = true,
    announcement = '',
    onReorder = () => {},
    onReorderSettled = () => {},
    result = null,
    // WHY the rows are fixed, decided by the panel (which is the only thing that knows):
    // the GM pinned the order, or this player's roll has already been spent down the
    // list. Declared AND forwarded — a prop that stops at a wrapper silently falls back
    // to its default, which here is the crafting tab's "Order set by the GM": the exact
    // falsehood this prop exists to prevent.
    fixedNoteKey = undefined,
    fixedNoteFallback = undefined
  } = $props();

  const resolved = $derived(result?.state === 'success');
  const awardedIds = $derived(
    new Set(Array.isArray(result?.awardedComponentIds) ? result.awardedComponentIds : [])
  );
  // No run record → nothing to reconcile against.
  const hasRecord = $derived(resolved && awardedIds.size > 0);

  /**
   * The stage's state, in precedence order. `Excluded` is deliberately absent: there is
   * no exclude affordance, and the reconciliation contract has nowhere to store one.
   */
  function stateOf(stage) {
    // A stage the award loop SKIPS is reached at NO budget, ever — before or after a
    // roll. That is not "the roll fell short"; it is unreachable outright.
    if (stage.threshold === null || stage.threshold === undefined) return 'unreachable';
    if (!resolved) return 'awaiting';
    if (!hasRecord) return 'resolved';
    return awardedIds.has(stage.componentId) ? 'recovered' : 'short';
  }

  const STATE_KEYS = {
    recovered: 'FABRICATE.App.Inventory.Salvage.StateRecovered',
    short: 'FABRICATE.App.Inventory.Salvage.StateRollFellShort',
    unreachable: 'FABRICATE.App.Inventory.Salvage.StateNotReached',
    awaiting: 'FABRICATE.App.Inventory.Salvage.StateAwaitingRoll',
    resolved: 'FABRICATE.App.Inventory.Salvage.StateResolved'
  };
</script>

{#snippet stateChip(stage)}
  {@const state = stateOf(stage)}
  <span class="salvage-state-chip is-{state}" data-progressive-stage-state={state}>
    {localize(STATE_KEYS[state])}
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
      {fixedNoteKey}
      {fixedNoteFallback}
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

  /* Post-roll states carry a ramp so the outcome reads at a glance. Never colour alone:
     each chip states its outcome in words. */
  .salvage-state-chip.is-recovered {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  .salvage-state-chip.is-short {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }
</style>
