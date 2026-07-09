<!-- Svelte 5 runes mode -->
<!--
  Recipe access list (Books & Scrolls `restricted` visibility mode). A search +
  Category filter + Access filter over the system's recipes; each row shows the
  recipe icon, name, category pill, and a grant chip — "N char · N player" when
  granted, or a danger "No access" chip when no character or player is granted.
  Selecting a row surfaces the GrantAccessInspector for that recipe. Modelled on
  RecipesBrowserView but simpler (no enable / duplicate / delete actions).

  Props:
   - recipes: projected recipe rows ({ id, name, img, category, accessSummary }).
   - recipeCategories: [{ name, count }] for the Category filter.
   - recipeSearchTerm: current search term (owned by the parent).
   - selectedRecipeId: id of the highlighted recipe.
   - selectedSystemName: kicker label.
   - onSearchChange(term): search input handler.
   - onSelectRecipe(id): row-select handler.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import { DEFAULT_CRAFTING_IMAGE } from '../../util/craftingImageDefaults.js';
  import { getRecipeCategoryLabel } from '../../../../utils/recipeCategories.js';

  let {
    recipes = [],
    recipeCategories = [],
    recipeSearchTerm = '',
    selectedRecipeId = '',
    selectedSystemName = '',
    onSearchChange = () => {},
    onSelectRecipe = () => {}
  } = $props();

  let categoryFilter = $state('all');
  let accessFilter = $state('all');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  function grantCount(recipe) {
    const summary = recipe?.accessSummary || {};
    return (summary.characterCount || 0) + (summary.playerCount || 0);
  }

  const filteredRecipes = $derived((recipes || []).filter(recipe => {
    const matchesCategory = categoryFilter === 'all' || recipe.category === categoryFilter;
    const granted = grantCount(recipe) > 0;
    const matchesAccess = accessFilter === 'all'
      || (accessFilter === 'granted' && granted)
      || (accessFilter === 'none' && !granted);
    return matchesCategory && matchesAccess;
  }));
  const filtersActive = $derived(
    (recipeSearchTerm || '').trim().length > 0
    || categoryFilter !== 'all'
    || accessFilter !== 'all'
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

  function recipeImage(recipe) {
    return recipe?.recipeItemImg || recipe?.img || DEFAULT_CRAFTING_IMAGE;
  }

  function categoryLabel(recipe) {
    return getRecipeCategoryLabel(recipe?.category, localize);
  }

  function grantChipLabel(recipe) {
    const summary = recipe?.accessSummary || {};
    return text('FABRICATE.Admin.Manager.Access.GrantChip', '{chars} char · {players} player')
      .replace('{chars}', summary.characterCount || 0)
      .replace('{players}', summary.playerCount || 0);
  }

  function isSelectedRecipe(recipe) {
    return !!selectedRecipeId && recipe.id === selectedRecipeId;
  }

  function clearFilters() {
    categoryFilter = 'all';
    accessFilter = 'all';
    onSearchChange('');
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Access.Title', 'Recipe access')}>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Access.Title', 'Recipe access')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.Access.Hint', 'Grant individual recipes to specific characters or players. Only granted recipes are visible to them.')}</p>
    </div>
  </section>

  <section class="manager-toolbar" aria-label={text('FABRICATE.Admin.Manager.Access.Filters', 'Access filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        value={recipeSearchTerm || ''}
        oninput={(event) => onSearchChange(event.currentTarget.value)}
        placeholder={text('FABRICATE.Admin.Manager.Recipe.SearchPlaceholder', 'Search recipes...')}
        aria-label={text('FABRICATE.Admin.Manager.Recipe.SearchLabel', 'Search recipes')}
        data-access-search
      />
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</span>
      <select value={categoryFilter} onchange={(event) => categoryFilter = event.currentTarget.value} data-access-category-filter aria-label={text('FABRICATE.Admin.Manager.Recipe.CategoryFilterLabel', 'Filter recipes by category')}>
        <option value="all">{text('FABRICATE.Admin.Manager.Recipe.CategoryAll', 'All categories')}</option>
        {#each recipeCategories || [] as category (category.name)}
          <option value={category.name}>{category.name} ({category.count})</option>
        {/each}
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Access.Filter', 'Access')}</span>
      <select value={accessFilter} onchange={(event) => accessFilter = event.currentTarget.value} data-access-filter aria-label={text('FABRICATE.Admin.Manager.Access.FilterLabel', 'Filter recipes by access')}>
        <option value="all">{text('FABRICATE.Admin.Manager.Access.FilterAll', 'All recipes')}</option>
        <option value="granted">{text('FABRICATE.Admin.Manager.Access.FilterGranted', 'Granted')}</option>
        <option value="none">{text('FABRICATE.Admin.Manager.Access.FilterNone', 'No access')}</option>
      </select>
    </label>
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredRecipes.length).replace('{total}', (recipes || []).length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-button manager-clear-filters" data-clear-filters="access" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-table-scroll manager-access-scroll" aria-label={text('FABRICATE.Admin.Manager.Access.Table', 'Recipe access table')}>
    {#if (recipes || []).length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-user-lock" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Recipe.EmptyTitle', 'No recipes yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Recipe.EmptyHint', 'Create recipes for the selected crafting system.')}</p>
        </div>
      </div>
    {:else if filteredRecipes.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Recipe.EmptySearchTitle', 'No recipes match these filters')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Access.EmptySearchHint', 'Clear search and filters to show every recipe in this system.')}</p>
          <button type="button" class="manager-button" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-access-list" role="list">
        {#each paginatedRecipes as recipe (recipe.id)}
          {@const granted = grantCount(recipe) > 0}
          <button
            type="button"
            class={`manager-access-row ${isSelectedRecipe(recipe) ? 'is-selected' : ''}`}
            role="listitem"
            aria-pressed={isSelectedRecipe(recipe)}
            data-access-row={recipe.id}
            onclick={() => onSelectRecipe(recipe.id)}
          >
            <img class="manager-recipe-thumb" src={recipeImage(recipe)} alt="" />
            <span class="manager-access-copy">
              <span class="manager-access-heading">
                <span class="manager-access-name" title={recipe.name}>{recipe.name}</span>
                <span class="manager-chip manager-access-category">{categoryLabel(recipe)}</span>
              </span>
              {#if granted}
                <span class="manager-chip is-active manager-access-grant-chip" data-access-grant={recipe.id}>
                  <i class="fas fa-users" aria-hidden="true"></i>
                  <span>{grantChipLabel(recipe)}</span>
                </span>
              {:else}
                <span class="manager-chip is-danger manager-access-grant-chip" data-access-grant={recipe.id}>
                  <i class="fas fa-lock" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Access.NoAccess', 'No access')}</span>
                </span>
              {/if}
            </span>
            <i class="fas fa-chevron-right manager-access-chevron" aria-hidden="true"></i>
          </button>
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

<style>
  .manager-access-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-access-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    width: 100%;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
    text-align: left;
    cursor: pointer;
  }

  .manager-access-row.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-surface-raised);
  }

  .manager-access-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    flex: 1;
    min-width: 0;
  }

  .manager-access-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-access-name {
    font-weight: 600;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-access-category {
    flex: 0 0 auto;
  }

  .manager-access-grant-chip {
    align-self: flex-start;
  }

  .manager-access-chevron {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.72rem;
  }
</style>
