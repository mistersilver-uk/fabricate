<!-- Svelte 5 runes mode -->
<!--
  ProgressiveBody renders a progressive recipe: a multi-step craft where each
  attempt advances the run. The body shows the inputs/outputs IO table plus a
  progressive note; the craft button advances the next step (the run-summary panel
  on the right surfaces an in-flight run). Shared composition lives in
  RecipeBodyShell.

  It opts the stage list into the per-stage COMPLICATION BAND (issue 1286) in the
  `forecast` tense, and only that tense. Crafting is FORECAST-ONLY, and that is a property
  of crafting rather than an omission: the fired record is defined on the salvage RUN
  record and the immediate crafting path writes none, so there is nothing to mark and no
  crafting stage ever claims a complication fired. `CraftingListingBuilder`'s own
  `_buildProgressiveStages` says the same at the point it attaches the forecast. Inventing
  a second carrier for a tense no prototype draws here is out of scope.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeBodyShell from './RecipeBodyShell.svelte';
  import IoTable from './IoTable.svelte';
  import ProgressiveStageList from './ProgressiveStageList.svelte';

  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
    rollResult = null,
    onChoose = null,
    onChooseOption = null,
    // The ordered stage list (issue 651), already reconciled against the player's stored
    // order by craftingStore. Ordering lives in the store, not here: this component
    // renders what it is given.
    progressiveStages = [],
    canReorderStages = true,
    stageAnnouncement = '',
    onReorderStage = null,
    onReorderStageSettled = null,
    // The requirement rail's interaction state (issue 917), spread straight onto
    // IoTable. One cohesive value rather than eight props threaded through four
    // bodies; `{}` renders a read-only rail with no chooser.
    rail = {},
  } = $props();

  const stages = $derived(Array.isArray(progressiveStages) ? progressiveStages : []);
</script>

<div data-recipe-mode="progressive">
  <p class="crafting-progressive-hint" data-recipe-section="progressive-hint">
    <i class="fas fa-list-ol" aria-hidden="true"></i>
    {localize('FABRICATE.App.Crafting.Detail.ProgressiveHint')}
  </p>
  <RecipeBodyShell {recipe} {selectedSetId} {rollResult} {onChoose}>
    {#snippet results()}
      <!-- The ordered stage list REPLACES the generic IoTable here. A progressive
           recipe's output is not a flat set: one roll is spent DOWN this list, so the
           order is the whole point and a table cannot express it. IoTable remains the
           fallback only when a recipe has no stages (an unconfigured progressive
           recipe), so the inputs half of the body still renders something. -->
      {#if stages.length > 0}
        <ProgressiveStageList
          {stages}
          canReorder={canReorderStages}
          announcement={stageAnnouncement}
          onReorder={(index, target, announcement) => onReorderStage?.(index, target, announcement)}
          onReorderSettled={() => onReorderStageSettled?.()}
          complications="forecast"
        />
      {:else}
        <IoTable {craftability} result={recipe?.result} {onChooseOption} {...rail} />
      {/if}
    {/snippet}
  </RecipeBodyShell>
</div>

<style>
  .crafting-progressive-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 var(--fab-space-3);
    font-size: 12px;
    color: var(--fab-text-muted);
  }
</style>
