<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from './Pagination.svelte';

  let {
    recipes = [],
    recipeCategories = [],
    recipeSearchTerm = '',
    selectedRecipeId = '',
    showRecipeCategories = false,
    selectedSystemName = '',
    onSearchChange = () => {},
    onSelectRecipe = () => {},
    onCreateRecipe = () => {},
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
    return recipe?.img || 'icons/svg/item-bag.svg';
  }

  function ingredientCount(recipe) {
    return recipe?.ingredientCount ?? recipe?.ingredients?.length ?? 0;
  }

  function catalystCount(recipe) {
    return recipe?.catalystCount ?? recipe?.catalysts?.length ?? 0;
  }

  function formatCount(keySingular, fallbackSingular, keyPlural, fallbackPlural, count) {
    const key = count === 1 ? keySingular : keyPlural;
    const fallback = count === 1 ? fallbackSingular : fallbackPlural;
    return `${count} ${text(key, fallback)}`;
  }

  function stepRequirementSummary(step) {
    if (!step) return text('FABRICATE.Admin.ManagerV2.Recipe.NoRequirements', 'No requirements');
    if (step.hasAlternatives) {
      return text('FABRICATE.Admin.ManagerV2.Recipe.AlternativeSets', '{count} alternative sets')
        .replace('{count}', step.ingredientSetCount || step.ingredientSetSummaries?.length || 0);
    }
    const ingredients = step.ingredientCount || 0;
    const catalysts = step.catalystCount || 0;
    const ingredientLabel = formatCount(
      'FABRICATE.Admin.ManagerV2.Recipe.Ingredient',
      'ingredient',
      'FABRICATE.Admin.ManagerV2.Recipe.Ingredients',
      'ingredients',
      ingredients
    );
    if (catalysts <= 0) return ingredientLabel;
    const catalystLabel = formatCount(
      'FABRICATE.Admin.ManagerV2.Recipe.Catalyst',
      'catalyst',
      'FABRICATE.Admin.ManagerV2.Recipe.Catalysts',
      'catalysts',
      catalysts
    );
    return `${ingredientLabel}, ${catalystLabel}`;
  }

  function requirementsSummary(recipe) {
    const steps = Array.isArray(recipe?.requirementsPreview) ? recipe.requirementsPreview : [];
    if (steps.length > 1) {
      return text('FABRICATE.Admin.ManagerV2.Recipe.StepRequirements', '{count} steps')
        .replace('{count}', steps.length);
    }
    if (steps.length === 1) return stepRequirementSummary(steps[0]);
    return stepRequirementSummary({
      ingredientCount: ingredientCount(recipe),
      catalystCount: catalystCount(recipe),
      ingredientSetCount: 1
    });
  }

  function structureLabel(recipe) {
    const labels = {
      multiStep: text('FABRICATE.Admin.ManagerV2.Recipe.MultiStep', 'Multi-step'),
      singleStep: text('FABRICATE.Admin.ManagerV2.Recipe.SingleStep', 'Single step'),
      simple: text('FABRICATE.Admin.ManagerV2.Recipe.Simple', 'Simple')
    };
    return labels[recipe?.structureKey] || (recipe?.isSimple
      ? text('FABRICATE.Admin.ManagerV2.Recipe.Simple', 'Simple')
      : text('FABRICATE.Admin.ManagerV2.Recipe.Advanced', 'Advanced'));
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

<main class="manager-v2-main" aria-label={text('FABRICATE.Admin.ManagerV2.Nav.Recipes', 'Recipes')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{selectedSystemName || text('FABRICATE.Admin.ManagerV2.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.Recipe.Library', 'Recipe library')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.Recipe.LibraryHint', 'Browse recipes for the selected system and open the existing editor for changes.')}</p>
    </div>
  </section>

  <section class="manager-v2-toolbar" aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.Filters', 'Recipe filters')}>
    <label class="manager-v2-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        value={recipeSearchTerm || ''}
        oninput={(event) => onSearchChange(event.currentTarget.value)}
        placeholder={text('FABRICATE.Admin.ManagerV2.Recipe.SearchPlaceholder', 'Search recipes...')}
        aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.SearchLabel', 'Search recipes')}
      />
    </label>
    <label class="manager-v2-filter">
      <span>{text('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.StatusFilterLabel', 'Filter recipes by status')}>
        <option value="all">{text('FABRICATE.Admin.ManagerV2.Recipe.StatusAll', 'All recipes')}</option>
        <option value="active">{text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active')}</option>
        <option value="disabled">{text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled')}</option>
        <option value="locked">{text('FABRICATE.Admin.ManagerV2.Recipe.Locked', 'Locked')}</option>
      </select>
    </label>
    {#if showRecipeCategories}
      <label class="manager-v2-filter">
        <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Category', 'Category')}</span>
        <select value={categoryFilter} onchange={(event) => categoryFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.CategoryFilterLabel', 'Filter recipes by category')}>
          <option value="all">{text('FABRICATE.Admin.ManagerV2.Recipe.CategoryAll', 'All categories')}</option>
          {#each recipeCategories || [] as category}
            <option value={category.name}>{category.name} ({category.count})</option>
          {/each}
        </select>
      </label>
    {/if}
    <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.SearchCount', '{shown} of {total}').replace('{shown}', filteredRecipes.length).replace('{total}', recipes.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-v2-button manager-v2-clear-filters" data-clear-filters="recipes" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.Table', 'Recipes table')}>
    {#if (recipes || []).length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-scroll" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptyTitle', 'No recipes yet')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptyHint', 'Create recipes for the selected crafting system.')}</p>
          <button type="button" class="manager-v2-button is-primary" onclick={onCreateRecipe}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Create', 'Create Recipe')}</span>
          </button>
        </div>
      </div>
    {:else if filteredRecipes.length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySearchTitle', 'No recipes match these filters')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySearchHint', 'Clear search and filters to show all recipes in this system.')}</p>
          <button type="button" class="manager-v2-button" onclick={clearFilters}>{text('FABRICATE.Admin.ManagerV2.ClearSearch', 'Clear search')}</button>
        </div>
      </div>
    {:else}
      <div class:has-no-category={!showRecipeCategories} class="manager-v2-recipes-table" role="table" aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.TableShort', 'Recipes')}>
        <div class="manager-v2-table-head manager-v2-recipe-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Recipe.Column.Recipe', 'Recipe')}</span>
          {#if showRecipeCategories}
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Recipe.Category', 'Category')}</span>
          {/if}
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Recipe.Structure', 'Structure')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Recipe.Requirements', 'Requirements')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Recipe.Status', 'Status')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedRecipes as recipe (recipe.id)}
          <div class={`manager-v2-recipe-row ${isSelectedRecipe(recipe) ? 'is-selected' : ''}`} role="row" aria-selected={isSelectedRecipe(recipe)} data-recipe-id={recipe.id}>
            <button type="button" class="manager-v2-recipe-identity" onclick={() => onSelectRecipe(recipe.id)} role="cell">
              <img class="manager-v2-recipe-thumb" src={recipeImage(recipe)} alt="" />
              <span class="manager-v2-system-copy">
                <span class="manager-v2-system-name" title={recipe.name}>{recipe.name}</span>
                {#if recipe.description}
                  <span class="manager-v2-system-description" title={recipe.description}>{recipe.description}</span>
                {:else}
                  <span class="manager-v2-system-description">{text('FABRICATE.Admin.ManagerV2.NoDescription', 'No description')}</span>
                {/if}
                {#if recipe.locked}
                  <span class="manager-v2-chip is-disabled">{text('FABRICATE.Admin.ManagerV2.Recipe.Locked', 'Locked')}</span>
                {/if}
              </span>
            </button>
            {#if showRecipeCategories}
              <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Recipe.Category', 'Category')}>
                <span class="manager-v2-chip">{recipe.category || text('FABRICATE.Admin.ManagerV2.Recipe.General', 'General')}</span>
              </span>
            {/if}
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Recipe.Structure', 'Structure')}>
              <span class="manager-v2-chip">{structureLabel(recipe)}</span>
            </span>
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Recipe.Requirements', 'Requirements')}>
              <span class="manager-v2-muted">{requirementsSummary(recipe)}</span>
            </span>
            <span role="cell" class="manager-v2-recipe-status manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Recipe.Status', 'Status')}>
              <label class="manager-v2-toggle">
                <input
                  type="checkbox"
                  checked={recipe.enabled !== false}
                  aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.ToggleNamed', 'Toggle {name}').replace('{name}', recipe.name)}
                  onchange={(event) => onToggleEnabled(recipe.id, event.currentTarget.checked)}
                />
                <span>{recipe.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active')}</span>
              </label>
            </span>
            <span role="cell" class="manager-v2-action-group manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
              <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.EditNamed', 'Edit {name}').replace('{name}', recipe.name)} title={text('FABRICATE.Admin.ManagerV2.Recipe.Edit', 'Edit recipe')} onclick={() => onEditRecipe(recipe.id)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.DuplicateNamed', 'Duplicate {name}').replace('{name}', recipe.name)} title={text('FABRICATE.Admin.ManagerV2.Recipe.Duplicate', 'Duplicate recipe')} onclick={() => onDuplicateRecipe(recipe.id)}>
                <i class="fas fa-copy" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.DeleteNamed', 'Delete {name}').replace('{name}', recipe.name)} title={text('FABRICATE.Admin.ManagerV2.Recipe.Delete', 'Delete recipe')} onclick={() => onDeleteRecipe(recipe.id)}>
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
