<!-- Svelte 5 runes mode -->
<!--
  RecipeBodyShell is the shared composition every mode body reuses: the crafting-
  check card, an optional selector-intro (routing hint), the ingredient set/route
  selector, a mode-specific results region (passed as the `results` snippet), and
  the last-roll result box. Centralising the layout keeps the four mode body files
  thin (they differ only in their results snippet + mode marker), which avoids the
  duplicated-lines that would otherwise fail the Sonar gate. The craft button lives
  in RecipeDetail as a fixed footer BELOW this scrolling body.
-->
<script>
  import IngredientSetSelector from './IngredientSetSelector.svelte';
  import CraftingCheckCard from './CraftingCheckCard.svelte';
  import RollResultBox from './RollResultBox.svelte';

  let {
    recipe = null,
    selectedSetId = null,
    rollResult = null,
    onChoose = null,
    results = null,
    selectorIntro = null
  } = $props();

  const sets = $derived(Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []);
  const check = $derived(recipe?.check ?? null);
</script>

<div class="crafting-body" data-crafting-body>
  <CraftingCheckCard {check} />
  {#if selectorIntro}
    {@render selectorIntro()}
  {/if}
  <IngredientSetSelector {sets} {selectedSetId} {onChoose} />
  {#if results}
    {@render results()}
  {/if}
  <RollResultBox result={rollResult} />
</div>

<style>
  .crafting-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }
</style>
