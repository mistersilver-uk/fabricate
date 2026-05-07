<!-- Svelte 5 runes mode -->
<!--
  SelectedRecipeInspector dispatches between the Simple and Complex variants
  based on the selected recipe's classification. Slice 3 wires the complex
  inspector for recipes where `classification.isComplex === true`.
-->
<script>
  import SimpleRecipeInspector from './SimpleRecipeInspector.svelte';
  import ComplexRecipeInspector from './ComplexRecipeInspector.svelte';

  let {
    recipe = null,
    onCraft = () => {},
    onAddToShoppingList = () => {},
    onToggleFavourite = () => {},
    onShowDetails = () => {},
    onLearnRecipe = () => {},
    onRestartRun = () => {},
    onSelectPath = () => {}
  } = $props();

  let isComplex = $derived(recipe?.classification?.isComplex === true);
</script>

{#if isComplex}
  <ComplexRecipeInspector
    {recipe}
    {onCraft}
    {onAddToShoppingList}
    {onToggleFavourite}
    {onShowDetails}
    {onSelectPath}
  />
{:else}
  <SimpleRecipeInspector
    {recipe}
    {onCraft}
    {onAddToShoppingList}
    {onToggleFavourite}
    {onShowDetails}
    {onLearnRecipe}
    {onRestartRun}
  />
{/if}
