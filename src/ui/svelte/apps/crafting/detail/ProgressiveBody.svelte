<!-- Svelte 5 runes mode -->
<!--
  ProgressiveBody renders a progressive recipe: a multi-step craft where each
  attempt advances the run. The body shows the inputs/outputs IO table plus a
  progressive note; the craft button advances the next step (the run-summary panel
  on the right surfaces an in-flight run). Shared composition lives in
  RecipeBodyShell.
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
    onReorderStage = null
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
        />
      {:else}
        <IoTable {craftability} result={recipe?.result} {onChooseOption} />
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
