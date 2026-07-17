<!-- Svelte 5 runes mode -->
<!--
  SalvageProgressiveBody renders `progressive` salvage: one roll flows DOWN an
  ordered list, each stage consuming its difficulty before the next is produced — so
  the order decides what the player actually recovers.

  It wraps the shared `ProgressiveStageList` (the crafting tab's), passing its two
  opt-in extensions: the `stacked` row shape and a `stateChip` snippet. Reuse rather
  than a twin is what keeps salvage's a11y triad — drag, keyboard, live region —
  identical to crafting's, and what keeps `canReorder: false` DETACHING the handlers
  instead of leaving inert rows a player can grab to no effect.

  It passes NO quantity, because there is no quantity to pass: progressive results are a
  quantity-less ordered list, each awarded entry grants exactly one item, and a row
  reading "×2" beside a single awarded item is a lie the player has no way to see
  through. The extension that rendered it is gone from the shared list entirely.

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
    fixedNoteFallback = undefined,
    // Restore the GM's authored order. `canResetOrder` is the panel's read of whether
    // the player's order actually differs from it — resetting to the order you are
    // already in is a no-op the control should not offer.
    canResetOrder = false,
    onResetOrder = () => {}
  } = $props();

  const resolved = $derived(result?.state === 'success');
  const awardedIds = $derived(
    new Set(Array.isArray(result?.awardedComponentIds) ? result.awardedComponentIds : [])
  );
  // No run record → nothing to reconcile against.
  const hasRecord = $derived(resolved && awardedIds.size > 0);
  // Counted over the STAGES, not over `awardedIds`: the record is the engine's award
  // list, which can name a component this list does not show, and the eyebrow's "of N"
  // denominator is this list's length. Counting the record directly could print
  // "5 of 4".
  const recoveredCount = $derived(
    stages.filter((stage) => awardedIds.has(stage.componentId)).length
  );

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
  <!--
    TWO BOXES, TWO DIFFERENT STATEMENTS — not a duplicate pair. The panel's mode banner
    NAMES the mode ("Progressive · ordered"); this one states the MECHANIC the player has
    to reason about to order the list: the roll flows down, each result is recovered
    while the roll still meets its DC, and it stops at the first it cannot reach. A round
    of this issue deleted this banner as a duplicate of the mode banner. It is not: the
    mode's name does not tell a player that the roll STOPS, and stopping is the entire
    reason the order is worth arranging.

    It sits here, below the roll summary, because after a roll it is the rule that
    explains the row states directly beneath it.
  -->
  <p class="salvage-flow" data-inventory-salvage-flow>
    <i class="fas fa-arrow-down-long" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Inventory.Salvage.ProgressiveFlow')}</span>
  </p>

  <!-- The eyebrow's right slot tracks the list's state rather than emptying out: before
       a roll it says what will resolve the list, after one it says how far the roll got.
       Only with a RECORD, though — a runless salvage cannot count what it awarded, and a
       "0 of 4 recovered" derived from an absent record is a lie, not a default. -->
  <p class="salvage-body-title">
    <span>{localize('FABRICATE.App.Inventory.Salvage.OrderedResultsTitle')}</span>
    {#if !resolved}
      <span class="salvage-body-hint" data-inventory-salvage-roll-hint>
        {localize('FABRICATE.App.Inventory.Salvage.RollToResolve')}
      </span>
    {:else if hasRecord}
      <span class="salvage-body-hint" data-inventory-salvage-recovered-count>
        {localize('FABRICATE.App.Inventory.Salvage.RecoveredCount', {
          recovered: recoveredCount,
          total: stages.length
        })}
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
      stacked
      {stateChip}
      {fixedNoteKey}
      {fixedNoteFallback}
    />
    <!-- The stage list explains itself only when the rows are FIXED. Silence in the
         other state leaves the affordance to be discovered: the grip is a small glyph,
         and reordering is the whole of this feature. Said here rather than in the shared
         list so the crafting tab stays byte-unchanged.

         Reset is part of the same note, not a separate control: an order the player can
         rearrange is an order they can get LOST in, and the GM's authored order is the
         only one they cannot reconstruct from what is on screen. It is disabled — not
         hidden — while the order is already the GM's, so the note's shape does not
         change under the player as they drag. -->
    {#if canReorder}
      <p class="salvage-reorder-note" data-inventory-salvage-reorder-note>
        <i class="fas fa-hand-pointer" aria-hidden="true"></i>
        <span class="salvage-reorder-note-text">
          {localize('FABRICATE.App.Inventory.Salvage.StageOrderYours')}
        </span>
        <button
          type="button"
          class="salvage-reorder-reset"
          data-inventory-salvage-reorder-reset
          disabled={!canResetOrder}
          onclick={() => onResetOrder?.()}
        >
          {localize('FABRICATE.App.Inventory.Salvage.StageOrderReset')}
        </button>
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

  /* The mechanic banner. It takes the panel banner's box but NOT its tone fill: two
     saturated boxes stacked make neither one the headline. This is the quieter of the
     pair — the mode banner names the mode, this explains it. */
  .salvage-flow {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface);
    color: var(--fab-info);
    font-size: 11px;
    line-height: 1.5;
  }

  .salvage-flow span {
    color: var(--fab-text-muted);
  }

  .salvage-reorder-note {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface);
    font-size: 11px;
    line-height: 1.4;
    color: var(--fab-text-muted);
  }

  .salvage-reorder-note-text {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* An inline text button, matching the panel ribbon's "Salvage again": a quiet way
     back, not a second call to action. The Foundry `.app button` reset is required —
     without it this inherits a fixed height and centred content and crops. */
  .salvage-reorder-reset {
    flex: 0 0 auto;
    box-sizing: border-box;
    appearance: none;
    -webkit-appearance: none;
    height: auto;
    width: auto;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    color: var(--fab-accent);
    font: inherit;
    font-weight: 600;
    line-height: 1;
    text-decoration: underline;
    cursor: pointer;
  }

  .salvage-reorder-reset:disabled {
    color: var(--fab-text-subtle);
    text-decoration: none;
    cursor: default;
  }

  .salvage-reorder-reset:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .salvage-reorder-reset:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
