<!-- Svelte 5 runes mode -->
<!--
  IngredientRoutedBody renders a routed-by-ingredients recipe. The chosen
  ingredient set determines the output, so the set selector is the primary control
  here; the IO table reflects the selected set's Have/Need/Missing and its routed
  outputs. Shared composition lives in RecipeBodyShell.
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
    busy = false,
    onChoose = null,
    onCraft = null
  } = $props();
</script>

<div data-recipe-mode="routedByIngredients">
  <p class="crafting-routing-hint" data-recipe-section="routing-hint">
    {localize('FABRICATE.App.Crafting.Detail.IngredientRoutingHint')}
  </p>
  <RecipeBodyShell {recipe} {selectedSetId} {craftability} {rollResult} {busy} {onChoose} {onCraft}>
    {#snippet results()}
      <IoTable {craftability} result={recipe?.result} />
    {/snippet}
  </RecipeBodyShell>
</div>

<style>
  .crafting-routing-hint {
    margin: 0 0 var(--fab-space-3);
    font-size: 12px;
    color: var(--fab-text-muted);
  }
</style>
