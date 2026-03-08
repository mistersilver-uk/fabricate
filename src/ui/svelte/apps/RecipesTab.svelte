<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import SearchBar from './SearchBar.svelte';

  let {
    recipes = [],
    recipeSearchTerm = '',
    showVisibilitySummary = false,
    onRecipeSearch,
    onCreateRecipe,
    onEditRecipe,
    onDuplicateRecipe,
    onDeleteRecipe,
    onToggleRecipeEnabled,
    onImportRecipes,
    onExportRecipes
  } = $props();

  function ingredientLabel(count) {
    return `${count} ${count === 1 ? localize('FABRICATE.Admin.Recipes.Ingredient') : localize('FABRICATE.Admin.Recipes.Ingredients')}`;
  }

  function catalystLabel(count) {
    return `${count} ${count === 1 ? localize('FABRICATE.Admin.Recipes.Catalyst') : localize('FABRICATE.Admin.Recipes.Catalysts')}`;
  }
</script>

<section class="admin-panel">
  <div class="panel-toolbar recipe-toolbar">
    <SearchBar
      value={recipeSearchTerm}
      onSearch={onRecipeSearch}
      placeholder={localize('FABRICATE.Admin.Recipes.SearchPlaceholder')}
    />
    <button type="button" onclick={onCreateRecipe}>
      <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Recipes.NewRecipe')}
    </button>
    <button type="button" onclick={onImportRecipes}>
      <i class="fas fa-file-import"></i> {localize('FABRICATE.Admin.Recipes.Import')}
    </button>
    <button type="button" onclick={onExportRecipes}>
      <i class="fas fa-file-export"></i> {localize('FABRICATE.Admin.Recipes.Export')}
    </button>
  </div>

  {#if recipes.length > 0}
    <table class="recipe-table">
      <thead>
        <tr>
          <th>{localize('FABRICATE.Admin.Recipes.ColRecipe')}</th>
          <th>{localize('FABRICATE.Admin.Recipes.ColLocked')}</th>
          {#if showVisibilitySummary}
            <th>{localize('FABRICATE.Admin.Recipes.ColVisibility')}</th>
          {/if}
          <th>{localize('FABRICATE.Admin.Recipes.ColCategory')}</th>
          <th>{localize('FABRICATE.Admin.Recipes.ColType')}</th>
          <th>{localize('FABRICATE.Admin.Recipes.ColComponents')}</th>
          <th>{localize('FABRICATE.Admin.Recipes.ColEnabled')}</th>
          <th>{localize('FABRICATE.Admin.Recipes.ColActions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each recipes as recipe (recipe.id)}
          <tr class="recipe-row" class:recipe-disabled={!recipe.enabled} data-recipe-id={recipe.id}>
            <td>
              <img src={recipe.img} alt={recipe.name} class="recipe-thumb" />
              <span>{recipe.name}</span>
              {#if !recipe.enabled}
                <span class="badge badge-disabled">{localize('FABRICATE.Admin.Recipes.Disabled')}</span>
              {/if}
            </td>
            <td>
              {#if recipe.locked}
                <span class="badge badge-advanced">{localize('FABRICATE.Admin.Recipes.LockedYes')}</span>
              {:else}
                <span class="badge badge-simple">{localize('FABRICATE.Admin.Recipes.LockedNo')}</span>
              {/if}
            </td>
            {#if showVisibilitySummary}
              <td>{recipe.visibilitySummary}</td>
            {/if}
            <td>{recipe.category}</td>
            <td>
              {#if recipe.isSimple}
                <span class="badge badge-simple">{localize('FABRICATE.Admin.Recipes.Simple')}</span>
              {:else}
                <span class="badge badge-advanced">{localize('FABRICATE.Admin.Recipes.Advanced')}</span>
              {/if}
            </td>
            <td>
              {ingredientLabel(recipe.ingredients.length)}
              {#if recipe.catalysts.length > 0}
                + {catalystLabel(recipe.catalysts.length)}
              {/if}
            </td>
            <td>
              <input
                type="checkbox"
                checked={recipe.enabled}
                onchange={(e) => onToggleRecipeEnabled(recipe.id, e.target.checked)}
              />
            </td>
            <td>
              <button type="button" class="btn-icon" onclick={() => onEditRecipe?.(recipe.id)} title={localize('FABRICATE.Admin.Recipes.Edit')}>
                <i class="fas fa-edit"></i>
              </button>
              <button type="button" class="btn-icon" onclick={() => onDuplicateRecipe(recipe.id)} title={localize('FABRICATE.Admin.Recipes.Duplicate')}>
                <i class="fas fa-copy"></i>
              </button>
              <button type="button" class="btn-icon btn-danger" onclick={() => onDeleteRecipe(recipe.id)} title={localize('FABRICATE.Admin.Recipes.Delete')}>
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <div class="fabricate-empty">
      <i class="fas fa-scroll"></i>
      <h3>{localize('FABRICATE.Admin.Recipes.NoRecipes')}</h3>
      <p>{localize('FABRICATE.Admin.Recipes.NoRecipesHint')}</p>
      <button type="button" class="btn-primary" onclick={onCreateRecipe}>
        <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Recipes.CreateRecipe')}
      </button>
    </div>
  {/if}
</section>
