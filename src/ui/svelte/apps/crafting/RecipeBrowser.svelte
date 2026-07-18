<!-- Svelte 5 runes mode -->
<!--
  RecipeBrowser is the left column: a search box and a paginated,
  status-badged list of recipes. It is prop-driven (the store state is
  threaded in by CraftingView) so it stays presentational and independently
  testable. Pagination reuses the shared Pagination component.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import RecipeListRow from './RecipeListRow.svelte';

  let {
    recipes = [],
    search = '',
    selectedRecipeId = null,
    totalCount = 0,
    pageIndex = 0,
    pageSize = 12,
    favouritesOnly = false,
    craftableOnly = false,
    systemFilter = null,
    systems = [],
    categoryFilter = null,
    categories = [],
    favouriteIds = [],
    onSelect = null,
    onSearch = null,
    onAddToShoppingList = null,
    onToggleFavourite = null,
    onToggleFavourites = null,
    onToggleCraftable = null,
    onSystemChange = null,
    onCategoryChange = null,
    onPageChange = null,
    onPageSizeChange = null
  } = $props();

  const hasResults = $derived(Array.isArray(recipes) && recipes.length > 0);
  const isSearching = $derived(String(search ?? '').trim() !== '');
  // Any active filter (search or the three controls) switches the empty state to
  // the "no matches" copy rather than the "no recipes at all" copy.
  const isFiltering = $derived(
    isSearching ||
      favouritesOnly === true ||
      craftableOnly === true ||
      Boolean(systemFilter) ||
      Boolean(categoryFilter)
  );
  const favouriteSet = $derived(new Set(Array.isArray(favouriteIds) ? favouriteIds : []));

  function onInput(event) {
    onSearch?.(event.currentTarget.value);
  }
  function onSystemInput(event) {
    const value = event.currentTarget.value;
    onSystemChange?.(value === '' ? null : value);
  }
  function onCategoryInput(event) {
    const value = event.currentTarget.value;
    onCategoryChange?.(value === '' ? null : value);
  }
</script>

<section class="crafting-browser" data-crafting-browser>
  <header class="crafting-browser-header">
    <p class="crafting-browser-title">{localize('FABRICATE.App.Crafting.Browser.Title')}</p>
    <div class="crafting-browser-search">
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <input
        type="text"
        value={search}
        placeholder={localize('FABRICATE.App.Crafting.Browser.SearchPlaceholder')}
        aria-label={localize('FABRICATE.App.Crafting.Browser.SearchLabel')}
        oninput={onInput}
      />
    </div>

    <div class="crafting-browser-filters" data-crafting-filters>
      <div class="crafting-browser-filter-toggles">
        <button
          type="button"
          class="crafting-browser-toggle"
          class:is-active={favouritesOnly}
          data-filter="favourites"
          aria-pressed={favouritesOnly}
          onclick={() => onToggleFavourites?.()}
        >
          <i class="fas fa-star" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Crafting.Browser.FavouritesOnly')}</span>
        </button>
        <button
          type="button"
          class="crafting-browser-toggle"
          class:is-active={craftableOnly}
          data-filter="craftable"
          aria-pressed={craftableOnly}
          onclick={() => onToggleCraftable?.()}
        >
          <i class="fas fa-hammer" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Crafting.Browser.CraftableOnly')}</span>
        </button>
      </div>
      {#if categories.length > 0}
        <label class="crafting-browser-filter-category">
          <span class="crafting-browser-filter-label"
            >{localize('FABRICATE.App.Crafting.Browser.CategoryFilterLabel')}</span
          >
          <select
            value={categoryFilter ?? ''}
            aria-label={localize('FABRICATE.App.Crafting.Browser.CategoryFilterLabel')}
            onchange={onCategoryInput}
          >
            <option value="">{localize('FABRICATE.App.Crafting.Browser.AllCategories')}</option>
            {#each categories as category (category.id)}
              <option value={category.id}>{category.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if systems.length > 0}
        <label class="crafting-browser-filter-system">
          <span class="crafting-browser-filter-label"
            >{localize('FABRICATE.App.Crafting.Browser.SystemFilterLabel')}</span
          >
          <select
            value={systemFilter ?? ''}
            aria-label={localize('FABRICATE.App.Crafting.Browser.SystemFilterLabel')}
            onchange={onSystemInput}
          >
            <option value="">{localize('FABRICATE.App.Crafting.Browser.AllSystems')}</option>
            {#each systems as system (system.id)}
              <option value={system.id}>{system.name}</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>
  </header>

  {#if hasResults}
    <div class="crafting-browser-list" role="list">
      {#each recipes as recipe (recipe.id)}
        <RecipeListRow
          {recipe}
          selected={recipe.id === selectedRecipeId}
          favourite={favouriteSet.has(recipe.id)}
          {onSelect}
          {onAddToShoppingList}
          {onToggleFavourite}
        />
      {/each}
    </div>
    <div class="crafting-browser-pagination">
      <Pagination
        {totalCount}
        {pageSize}
        {pageIndex}
        pageSizeOptions={[12, 24, 48]}
        onPageChange={(index) => onPageChange?.(index)}
        onPageSizeChange={(size) => onPageSizeChange?.(size)}
      />
    </div>
  {:else}
    <p class="crafting-browser-empty" data-crafting-browser-empty>
      {isFiltering
        ? localize('FABRICATE.App.Crafting.Browser.NoMatches')
        : localize('FABRICATE.App.Crafting.Browser.Empty')}
    </p>
  {/if}
</section>

<style>
  .crafting-browser {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    height: 100%;
    min-height: 0;
  }

  .crafting-browser-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .crafting-browser-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .crafting-browser-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
  }

  .crafting-browser-search input {
    flex: 1 1 auto;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--fab-text);
    font-size: 13px;
  }

  .crafting-browser-search input:focus-visible {
    outline: none;
  }

  /* Filters: the two toggles share a row; the system dropdown sits on its own line. */
  .crafting-browser-filters {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .crafting-browser-filter-toggles {
    display: flex;
    gap: 8px;
  }

  .crafting-browser-toggle {
    flex: 1 1 0;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 30px;
    padding: 4px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .crafting-browser-toggle:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-browser-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-browser-toggle.is-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .crafting-browser-filter-system,
  .crafting-browser-filter-category {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .crafting-browser-filter-label {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .crafting-browser-filter-system select,
  .crafting-browser-filter-category select {
    box-sizing: border-box;
    width: 100%;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
    color: var(--fab-text);
    font-size: 12px;
  }

  .crafting-browser-filter-system select:focus-visible,
  .crafting-browser-filter-category select:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-browser-list {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .crafting-browser-empty {
    margin: 0;
    padding: var(--fab-space-4);
    text-align: center;
    font-size: 13px;
    color: var(--fab-text-muted);
  }

  .crafting-browser-pagination {
    flex: 0 0 auto;
  }

  /*
    Pagination.svelte renders .manager-pagination* + .manager-icon-button markup
    that is .fabricate-manager-scoped in the GM app and therefore UNSTYLED in the
    player app. Theme it here with base --fab-* tokens as a single compact inline
    row (mirrors the gathering environment list), rather than the unstyled block
    that stacks the summary, nav, and per-page controls onto separate lines.
  */
  .crafting-browser-pagination :global(.manager-pagination) {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) 0 0;
    border-top: 1px solid var(--fab-border);
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .crafting-browser-pagination :global(.manager-pagination-summary) {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crafting-browser-pagination :global(.manager-pagination-nav) {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .crafting-browser-pagination :global(.manager-pagination-page) {
    color: var(--fab-text);
    white-space: nowrap;
  }

  .crafting-browser-pagination :global(.manager-pagination-size) {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
    white-space: nowrap;
  }

  .crafting-browser-pagination :global(.manager-pagination-size select) {
    height: 26px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  .crafting-browser-pagination :global(.manager-icon-button) {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
  }

  .crafting-browser-pagination :global(.manager-icon-button:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  .crafting-browser-pagination :global(.manager-icon-button:hover:not(:disabled)) {
    background: var(--fab-surface-raised);
  }
</style>
