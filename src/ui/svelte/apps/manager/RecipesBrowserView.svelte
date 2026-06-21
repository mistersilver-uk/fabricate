<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js';
  import { getRecipeCategoryLabel } from '../../../../utils/recipeCategories.js';

  let {
    recipes = [],
    recipeCategories = [],
    recipeSearchTerm = '',
    selectedRecipeId = '',
    showRecipeCategories = false,
    selectedSystemName = '',
    onSearchChange = () => {},
    onSelectRecipe = () => {},
    onEditRecipe = () => {},
    onDuplicateRecipe = () => {},
    onDeleteRecipe = () => {},
    onToggleEnabled = () => {}
  } = $props();

  let statusFilter = $state('all');
  let categoryFilter = $state('all');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  const filteredRecipes = $derived((recipes || []).filter(recipe => {
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && recipe.enabled !== false)
      || (statusFilter === 'disabled' && recipe.enabled === false)
      || (statusFilter === 'locked' && recipe.locked === true);
    const matchesCategory = categoryFilter === 'all' || recipe.category === categoryFilter;
    return matchesStatus && matchesCategory;
  }));
  const filtersActive = $derived(
    (recipeSearchTerm || '').trim().length > 0
    || statusFilter !== 'all'
    || categoryFilter !== 'all'
  );
  const paginatedRecipes = $derived(filteredRecipes.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredRecipes.length) {
      pageIndex = 0;
    }
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function stackedLabel(key, fallback) {
    return `${text(key, fallback)}:`;
  }

  function recipeImage(recipe) {
    return recipe?.recipeItemImg || recipe?.img || DEFAULT_RECIPE_IMAGE;
  }

  // Render the recipe's category in sentence case: the reserved fallback resolves
  // to a localized "General" rather than the raw lowercase value; custom
  // categories keep their authored casing.
  function categoryLabel(recipe) {
    return getRecipeCategoryLabel(recipe?.category, localize);
  }

  function structureLabel(recipe) {
    const labels = {
      multiStep: text('FABRICATE.Admin.Manager.Recipe.MultiStep', 'Multi-step'),
      singleStep: text('FABRICATE.Admin.Manager.Recipe.SingleStep', 'Single step'),
      simple: text('FABRICATE.Admin.Manager.Recipe.Simple', 'Simple')
    };
    return labels[recipe?.structureKey] || (recipe?.isSimple
      ? text('FABRICATE.Admin.Manager.Recipe.Simple', 'Simple')
      : text('FABRICATE.Admin.Manager.Recipe.Advanced', 'Advanced'));
  }

  function isSelectedRecipe(recipe) {
    return !!selectedRecipeId && recipe.id === selectedRecipeId;
  }

  function clearFilters() {
    statusFilter = 'all';
    categoryFilter = 'all';
    onSearchChange('');
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Recipe.Library', 'Recipe library')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.Recipe.LibraryHint', 'Browse recipes for the selected system and open the existing editor for changes.')}</p>
    </div>
  </section>

  <section class="manager-toolbar" aria-label={text('FABRICATE.Admin.Manager.Recipe.Filters', 'Recipe filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        value={recipeSearchTerm || ''}
        oninput={(event) => onSearchChange(event.currentTarget.value)}
        placeholder={text('FABRICATE.Admin.Manager.Recipe.SearchPlaceholder', 'Search recipes...')}
        aria-label={text('FABRICATE.Admin.Manager.Recipe.SearchLabel', 'Search recipes')}
      />
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.Manager.Recipe.StatusFilterLabel', 'Filter recipes by status')}>
        <option value="all">{text('FABRICATE.Admin.Manager.Recipe.StatusAll', 'All recipes')}</option>
        <option value="active">{text('FABRICATE.Admin.Manager.StatusActive', 'Active')}</option>
        <option value="disabled">{text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')}</option>
        <option value="locked">{text('FABRICATE.Admin.Manager.Recipe.Locked', 'Locked')}</option>
      </select>
    </label>
    {#if showRecipeCategories}
      <label class="manager-filter">
        <span>{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</span>
        <select value={categoryFilter} onchange={(event) => categoryFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.Manager.Recipe.CategoryFilterLabel', 'Filter recipes by category')}>
          <option value="all">{text('FABRICATE.Admin.Manager.Recipe.CategoryAll', 'All categories')}</option>
          {#each recipeCategories || [] as category (category.name)}
            <option value={category.name}>{category.name} ({category.count})</option>
          {/each}
        </select>
      </label>
    {/if}
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredRecipes.length).replace('{total}', recipes.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-button manager-clear-filters" data-clear-filters="recipes" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Recipe.Table', 'Recipes table')}>
    {#if (recipes || []).length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-scroll" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Recipe.EmptyTitle', 'No recipes yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Recipe.EmptyHint', 'Create recipes for the selected crafting system.')}</p>
        </div>
      </div>
    {:else if filteredRecipes.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Recipe.EmptySearchTitle', 'No recipes match these filters')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Recipe.EmptySearchHint', 'Clear search and filters to show all recipes in this system.')}</p>
          <button type="button" class="manager-button" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</button>
        </div>
      </div>
    {:else}
      <div class:has-no-category={!showRecipeCategories} class="manager-recipes-table" role="table" aria-label={text('FABRICATE.Admin.Manager.Recipe.TableShort', 'Recipes')}>
        <div class="manager-table-head manager-recipe-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Recipe.Column.Recipe', 'Recipe')}</span>
          {#if showRecipeCategories}
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</span>
          {/if}
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Recipe.Structure', 'Structure')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Recipe.Status', 'Status')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedRecipes as recipe (recipe.id)}
          <div class={`manager-recipe-row ${isSelectedRecipe(recipe) ? 'is-selected' : ''}`} role="row" aria-selected={isSelectedRecipe(recipe)} data-recipe-id={recipe.id}>
            {#if recipe.incomplete}
              <span class="manager-recipe-row-flag-slot">
                <span class="manager-chip is-warning manager-recipe-incomplete-chip" title={text('FABRICATE.Admin.Manager.Recipe.Incomplete', 'Incomplete')}>
                  <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Recipe.Incomplete', 'Incomplete')}</span>
                </span>
              </span>
            {/if}
            <button type="button" class="manager-recipe-identity" onclick={() => onSelectRecipe(recipe.id)} role="cell">
              <img class="manager-recipe-thumb" src={recipeImage(recipe)} alt="" />
              <span class="manager-system-copy">
                <span class="manager-system-name" title={recipe.name}>{recipe.name}</span>
                {#if recipe.description}
                  <span class="manager-system-description" title={recipe.description}>{recipe.description}</span>
                {:else}
                  <span class="manager-system-description">{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span>
                {/if}
                {#if recipe.locked}
                  <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Recipe.Locked', 'Locked')}</span>
                {/if}
              </span>
            </button>
            {#if showRecipeCategories}
              <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}>
                <span class="manager-chip">{categoryLabel(recipe)}</span>
              </span>
            {/if}
            <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Recipe.Structure', 'Structure')}>
              <span class="manager-chip">{structureLabel(recipe)}</span>
            </span>
            <span role="cell" class="manager-recipe-status manager-labeled-cell manager-status-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Recipe.Status', 'Status')}>
              <button
                type="button"
                class={`manager-status-toggle ${recipe.enabled === false ? 'is-off' : 'is-on'}`}
                aria-pressed={recipe.enabled !== false}
                aria-label={recipe.enabled === false
                  ? text('FABRICATE.Admin.Manager.Recipe.EnableNamed', 'Enable {name}').replace('{name}', recipe.name)
                  : text('FABRICATE.Admin.Manager.Recipe.DisableNamed', 'Disable {name}').replace('{name}', recipe.name)}
                onclick={(event) => { event.stopPropagation(); onToggleEnabled(recipe.id, recipe.enabled === false); }}
                onkeydown={(event) => event.stopPropagation()}
              >
                <span class="manager-status-toggle-track" aria-hidden="true">
                  <span class="manager-status-toggle-knob"></span>
                </span>
                <span class="manager-status-toggle-label">
                  {recipe.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                </span>
              </button>
            </span>
            <span role="cell" class="manager-action-group manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Recipe.EditNamed', 'Edit {name}').replace('{name}', recipe.name)} title={text('FABRICATE.Admin.Manager.Recipe.Edit', 'Edit recipe')} onclick={() => onEditRecipe(recipe.id)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Recipe.DuplicateNamed', 'Duplicate {name}').replace('{name}', recipe.name)} title={text('FABRICATE.Admin.Manager.Recipe.Duplicate', 'Duplicate recipe')} onclick={() => onDuplicateRecipe(recipe.id)}>
                <i class="fas fa-copy" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Recipe.DeleteNamed', 'Delete {name}').replace('{name}', recipe.name)} title={text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')} onclick={() => onDeleteRecipe(recipe.id)}>
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredRecipes.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</main>
