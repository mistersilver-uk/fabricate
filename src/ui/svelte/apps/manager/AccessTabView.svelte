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
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import { resolveRecipeImage } from '../../util/craftingImageDefaults.js';
  import { getRecipeCategoryLabel } from '../../../../utils/recipeCategories.js';

  let {
    recipes = [],
    recipeCategories = [],
    recipeSearchTerm = '',
    selectedRecipeId = '',
    selectedSystemName = '',
    onSearchChange = () => {},
    onSelectRecipe = () => {},
  } = $props();

  let categoryFilter = $state('all');
  let accessFilter = $state('all');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  function grantCount(recipe) {
    const summary = recipe?.accessSummary || {};
    return (summary.characterCount || 0) + (summary.playerCount || 0);
  }

  const filteredRecipes = $derived(
    (recipes || []).filter((recipe) => {
      const matchesCategory = categoryFilter === 'all' || recipe.category === categoryFilter;
      const granted = grantCount(recipe) > 0;
      const matchesAccess =
        accessFilter === 'all' ||
        (accessFilter === 'granted' && granted) ||
        (accessFilter === 'none' && !granted);
      return matchesCategory && matchesAccess;
    })
  );
  const filtersActive = $derived(
    (recipeSearchTerm || '').trim().length > 0 || categoryFilter !== 'all' || accessFilter !== 'all'
  );
  const paginatedRecipes = $derived(
    filteredRecipes.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredRecipes.length) {
      pageIndex = 0;
    }
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
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

<main
  class="manager-main"
  aria-label={text('FABRICATE.Admin.Manager.Access.Title', 'Recipe access')}
>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">
        {selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}
      </p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Access.Title', 'Recipe access')}</h2>
      <p class="manager-subtitle">
        {text(
          'FABRICATE.Admin.Manager.Access.Hint',
          'Grant individual recipes to specific characters or players. Only granted recipes are visible to them.'
        )}
      </p>
    </div>
  </section>

  <section
    class="manager-toolbar"
    aria-label={text('FABRICATE.Admin.Manager.Access.Filters', 'Access filters')}
  >
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
      <select
        value={categoryFilter}
        onchange={(event) => (categoryFilter = event.currentTarget.value)}
        data-access-category-filter
        aria-label={text(
          'FABRICATE.Admin.Manager.Recipe.CategoryFilterLabel',
          'Filter recipes by category'
        )}
      >
        <option value="all"
          >{text('FABRICATE.Admin.Manager.Recipe.CategoryAll', 'All categories')}</option
        >
        {#each recipeCategories || [] as category (category.name)}
          <option value={category.name}>{category.name} ({category.count})</option>
        {/each}
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Access.Filter', 'Access')}</span>
      <select
        value={accessFilter}
        onchange={(event) => (accessFilter = event.currentTarget.value)}
        data-access-filter
        aria-label={text('FABRICATE.Admin.Manager.Access.FilterLabel', 'Filter recipes by access')}
      >
        <option value="all"
          >{text('FABRICATE.Admin.Manager.Access.FilterAll', 'All recipes')}</option
        >
        <option value="granted"
          >{text('FABRICATE.Admin.Manager.Access.FilterGranted', 'Granted')}</option
        >
        <option value="none"
          >{text('FABRICATE.Admin.Manager.Access.FilterNone', 'No access')}</option
        >
      </select>
    </label>
    <Chip
      >{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}')
        .replace('{shown}', filteredRecipes.length)
        .replace('{total}', (recipes || []).length)}</Chip
    >
    {#if filtersActive}
      <button
        type="button"
        class="manager-button manager-clear-filters"
        data-clear-filters="access"
        onclick={clearFilters}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section
    class="manager-table-scroll manager-access-scroll"
    aria-label={text('FABRICATE.Admin.Manager.Access.Table', 'Recipe access table')}
  >
    {#if (recipes || []).length === 0}
      <EmptyState
        icon="fas fa-user-lock"
        title={text('FABRICATE.Admin.Manager.Recipe.EmptyTitle', 'No recipes yet')}
        hint={text(
          'FABRICATE.Admin.Manager.Recipe.EmptyHint',
          'Create recipes for the selected crafting system.'
        )}
      />
    {:else if filteredRecipes.length === 0}
      <EmptyState
        icon="fas fa-search"
        title={text(
          'FABRICATE.Admin.Manager.Recipe.EmptySearchTitle',
          'No recipes match these filters'
        )}
        hint={text(
          'FABRICATE.Admin.Manager.Access.EmptySearchHint',
          'Clear search and filters to show every recipe in this system.'
        )}
      >
        <button type="button" class="manager-button" onclick={clearFilters}
          >{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</button
        >
      </EmptyState>
    {:else}
      <!--
        A real `<ul>`/`<li>`, not a `<button role="listitem">`: `listitem` on a button
        overrode the button's own interactive role, which the compiler reports and which
        told assistive technology the row was not operable. `role="list"` is deliberately
        NOT restated on the `<ul>`: it is the element's implicit role, so it says nothing
        the markup does not already say. (Note the compiler does NOT report that one —
        `a11y_no_redundant_roles` fires for `<nav role="navigation">` and
        `<button role="button">`, but Svelte 5.56 exempts `<ul role="list">`, because the
        redundancy is a documented Safari/VoiceOver workaround. Verified, because the
        issue-924 delta asserted the opposite. It is dropped on the merits, not to placate
        a gate.)

        `aria-current`, not `aria-pressed`. This is single-select master-detail: a row
        cannot be un-pressed, and selecting another silently un-presses the first, so
        "pressed" describes a toggle the user has no way to reverse. `aria-selected` is
        valid only on `option`/`tab`/`row`/`treeitem`, so it would trade one
        `a11y_role_supports_aria_props` warning for another. `aria-current` is global,
        means exactly "the current item in a set of related items", and needs no roving
        tabindex. It is emitted only when true — an ABSENT attribute, never
        `aria-current="false"`.
      -->
      <ul class="manager-access-list">
        {#each paginatedRecipes as recipe (recipe.id)}
          {@const granted = grantCount(recipe) > 0}
          <li class="manager-access-row-item">
            <button
              type="button"
              class={`manager-access-row ${isSelectedRecipe(recipe) ? 'is-selected' : ''}`}
              aria-current={isSelectedRecipe(recipe) ? 'true' : undefined}
              data-access-row={recipe.id}
              onclick={() => onSelectRecipe(recipe.id)}
            >
              <img class="manager-recipe-thumb" src={resolveRecipeImage(recipe)} alt="" />
              <span class="manager-access-copy">
                <span class="manager-access-heading">
                  <span class="manager-access-name" title={recipe.name}>{recipe.name}</span>
                  <Chip class="manager-access-category">{categoryLabel(recipe)}</Chip>
                </span>
                {#if granted}
                  <Chip
                    tone="active"
                    icon="fas fa-users"
                    class="manager-access-grant-chip"
                    data-access-grant={recipe.id}
                  >
                    <span>{grantChipLabel(recipe)}</span>
                  </Chip>
                {:else}
                  <Chip
                    tone="danger"
                    icon="fas fa-lock"
                    class="manager-access-grant-chip"
                    data-access-grant={recipe.id}
                  >
                    <span>{text('FABRICATE.Admin.Manager.Access.NoAccess', 'No access')}</span>
                  </Chip>
                {/if}
              </span>
              <i class="fas fa-chevron-right manager-access-chevron" aria-hidden="true"></i>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <Pagination
    totalCount={filteredRecipes.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => (pageIndex = next)}
    onPageSizeChange={(next) => {
      pageSize = next;
      pageIndex = 0;
    }}
  />
</main>

<style>
  /* The list reset is load-bearing, not tidiness. Foundry's `@layer elements.typography`
     carries `ul, ol { margin: 1rem 0; padding: 0 0 0 1.5em }`, so an unreset `<ul>` here
     draws bullets and a ~21-24px indent on a GM screen. A scoped block is enough:
     `css: 'injected'` emits these rules unlayered and Fabricate declares no `@layer`
     anywhere, so an unlayered rule beats Foundry's layered one whatever the specificity. */
  .manager-access-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* The `<li>` is a pure wrapper; the button inside it is the full-width row, and without
     this the 100%-width button has no block to fill. */
  .manager-access-row-item {
    display: flex;
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

  /* Both are `Chip`s (issue 883), so this component's scoping hash is not on them.
     Reach them through `:global`, nested under a selector that DOES carry the hash. */
  .manager-access-heading :global(.manager-access-category) {
    flex: 0 0 auto;
  }

  .manager-access-copy :global(.manager-access-grant-chip) {
    align-self: flex-start;
  }

  .manager-access-chevron {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.72rem;
  }
</style>
