<!-- Svelte 5 runes mode -->
<!--
  IngredientRoutedBody renders a routed-by-ingredients recipe. The chosen
  ingredient set determines the output, so the set selector is the primary control
  here; the IO table reflects the selected set's Have/Need/Missing and its routed
  outputs — except on a multi-step recipe, whose Produces row is the terminal step's
  product. Shared composition lives in RecipeBodyShell.
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
    onChoose = null,
    onChooseOption = null,
    // The requirement rail's interaction state (issue 917), spread straight onto
    // IoTable. One cohesive value rather than eight props threaded through four
    // bodies; `{}` renders a read-only rail with no chooser.
    rail = {},
  } = $props();

  // The chosen ingredient set determines the output, so the "Produces" list follows the
  // selected route's products. Every projected set resolves against the FIRST step, whose
  // result group may legally be empty on a multi-step recipe (issue 1907), so there the
  // builder's terminal-step product is the headline instead. Keep the result's time/xp.
  const selectedSet = $derived(
    Array.isArray(recipe?.ingredientSets)
      ? (recipe.ingredientSets.find((set) => set?.id === selectedSetId) ?? null)
      : null
  );
  const isMultiStep = $derived(Number(recipe?.stepCount ?? 0) > 1);
  const routedResult = $derived({
    items:
      !isMultiStep && Array.isArray(selectedSet?.products)
        ? selectedSet.products
        : (recipe?.result?.items ?? []),
    time: recipe?.result?.time ?? null,
    timeLabel: recipe?.result?.timeLabel ?? null,
    xp: recipe?.result?.xp ?? null,
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
      <IoTable {craftability} result={routedResult} {onChooseOption} {...rail} />
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
