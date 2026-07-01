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

  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
    rollResult = null,
    onChoose = null
  } = $props();
</script>

<div data-recipe-mode="progressive">
  <p class="crafting-progressive-hint" data-recipe-section="progressive-hint">
    <i class="fas fa-list-ol" aria-hidden="true"></i>
    {localize('FABRICATE.App.Crafting.Detail.ProgressiveHint')}
  </p>
  <RecipeBodyShell {recipe} {selectedSetId} {rollResult} {onChoose}>
    {#snippet results()}
      <IoTable {craftability} result={recipe?.result} />
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
