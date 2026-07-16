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
  import StatusPill from '../../../../components/StatusPill.svelte';
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

  // Each state's localized label plus the house pill's tone + icon. Never colour alone:
  // every pill states its outcome in words AND carries a glyph.
  const STATES = {
    recovered: {
      key: 'FABRICATE.App.Inventory.Salvage.StateRecovered',
      tone: 'success',
      icon: 'fas fa-circle-check'
    },
    short: {
      key: 'FABRICATE.App.Inventory.Salvage.StateRollFellShort',
      tone: 'danger',
      icon: 'fas fa-circle-xmark'
    },
    unreachable: {
      key: 'FABRICATE.App.Inventory.Salvage.StateNotReached',
      tone: 'subtle',
      icon: 'fas fa-lock'
    },
    awaiting: {
      key: 'FABRICATE.App.Inventory.Salvage.StateAwaitingRoll',
      tone: 'subtle',
      icon: 'fas fa-circle'
    },
    resolved: {
      key: 'FABRICATE.App.Inventory.Salvage.StateResolved',
      tone: 'subtle',
      icon: 'fas fa-circle'
    }
  };
</script>

<!-- The house chip primitive, not a fourth hand-rolled one: StatusPill is what the
     Journal (a player surface) and the manager already use. -->
{#snippet stateChip(stage)}
  {@const state = stateOf(stage)}
  {@const pill = STATES[state]}
  <span class="salvage-state-chip" data-progressive-stage-state={state}>
    <StatusPill tone={pill.tone} icon={pill.icon} label={localize(pill.key)} />
  </span>
{/snippet}

<div class="salvage-body" data-inventory-salvage-body="progressive">
  <!-- The panel's mode banner already explains that one roll flows down this list; a
       second --info-soft box directly beneath it saying the same thing was two boxes for
       one idea. This is the section's eyebrow instead. -->
  <p class="salvage-body-title">
    <span>{localize('FABRICATE.App.Inventory.Salvage.OrderedResultsTitle')}</span>
    {#if !resolved}
      <span class="salvage-body-hint" data-inventory-salvage-roll-hint>
        {localize('FABRICATE.App.Inventory.Salvage.RollToResolve')}
      </span>
    {/if}
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
    <!-- The stage list explains itself only when the rows are FIXED. Silence in the
         other state leaves the affordance to be discovered: the grip is a small glyph,
         and reordering is the whole of this feature. Said here rather than in the shared
         list so the crafting tab stays byte-unchanged. -->
    {#if canReorder}
      <p class="salvage-reorder-note" data-inventory-salvage-reorder-note>
        {localize('FABRICATE.App.Inventory.Salvage.StageOrderYours')}
      </p>
    {/if}
  {/if}
</div>

<style>
  .salvage-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* The section eyebrow, matching its two sibling bodies. */
  .salvage-body-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--fab-text-muted);
  }

  .salvage-body-hint {
    margin-left: auto;
    font-size: 9px;
    font-weight: 700;
    color: var(--fab-text-subtle);
  }

  .salvage-empty {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* A positioning wrapper only — the pill inside is the shared StatusPill, which owns
     every ramp, the radius, the padding and the type. */
  .salvage-state-chip {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .salvage-reorder-note {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }
</style>
