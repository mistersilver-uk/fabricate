<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import RecipeCard from './RecipeCard.svelte';

  let {
    recipes = [],
    search = '',
    onCraft,
    onLearnRecipe,
    onToggleFavourite,
    onShowDetails,
    onRestartRun,
    onAddToShoppingList
  } = $props();
</script>

{#if recipes.length > 0}
  {#each recipes as recipe (recipe.id)}
    <RecipeCard
      {recipe}
      {onCraft}
      {onLearnRecipe}
      {onToggleFavourite}
      {onShowDetails}
      {onRestartRun}
      {onAddToShoppingList}
    />
  {/each}
{:else}
  <div class="fabricate-empty">
    <i class="fas fa-inbox"></i>
    <p>{localize('FABRICATE.RecipeList.NoRecipes')}</p>
    {#if search}
      <p class="hint">{localize('FABRICATE.RecipeList.AdjustFilters')}</p>
    {:else}
      <p class="hint">{localize('FABRICATE.RecipeList.GMNeeded')}</p>
    {/if}
  </div>
{/if}
