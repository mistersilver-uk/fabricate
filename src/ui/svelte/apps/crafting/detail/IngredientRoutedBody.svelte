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
    onChoose = null
  } = $props();

  // The chosen ingredient set determines the output, so the "Produces" list must
  // follow the selected route's products (not the builder's static default-set
  // result). Keep the recipe result's time/xp metadata.
  const selectedSet = $derived(
    Array.isArray(recipe?.ingredientSets)
      ? (recipe.ingredientSets.find((set) => set?.id === selectedSetId) ?? null)
      : null
  );
  const routedResult = $derived({
    items: Array.isArray(selectedSet?.products)
      ? selectedSet.products
      : (recipe?.result?.items ?? []),
    time: recipe?.result?.time ?? null,
    timeLabel: recipe?.result?.timeLabel ?? null,
    xp: recipe?.result?.xp ?? null
  });
</script>

<div data-recipe-mode="routedByIngredients">
  <RecipeBodyShell {recipe} {selectedSetId} {rollResult} {onChoose}>
    {#snippet selectorIntro()}
      <p class="crafting-routing-hint" data-recipe-section="routing-hint">
        {localize('FABRICATE.App.Crafting.Detail.IngredientRoutingHint')}
      </p>
    {/snippet}
    {#snippet results()}
      <IoTable {craftability} result={routedResult} />
    {/snippet}
  </RecipeBodyShell>
</div>

<style>
  .crafting-routing-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }
</style>
