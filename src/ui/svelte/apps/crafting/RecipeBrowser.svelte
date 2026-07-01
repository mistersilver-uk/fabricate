<!-- Svelte 5 runes mode -->
<!--
  RecipeBrowser is the left column: a search box, a Recents strip, and a
  paginated, status-badged list of recipes. It is prop-driven (the store state is
  threaded in by CraftingView) so it stays presentational and independently
  testable. Pagination reuses the shared Pagination component.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import RecipeRecents from './RecipeRecents.svelte';
  import RecipeListRow from './RecipeListRow.svelte';

  let {
    recipes = [],
    recents = [],
    search = '',
    selectedRecipeId = null,
    totalCount = 0,
    pageIndex = 0,
    pageSize = 12,
    onSelect = null,
    onSearch = null,
    onAddToShoppingList = null,
    onPageChange = null,
    onPageSizeChange = null
  } = $props();

  const hasResults = $derived(Array.isArray(recipes) && recipes.length > 0);
  const isSearching = $derived(String(search ?? '').trim() !== '');

  function onInput(event) {
    onSearch?.(event.currentTarget.value);
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
  </header>

  <RecipeRecents {recents} {onSelect} />

  {#if hasResults}
    <div class="crafting-browser-list" role="list">
      {#each recipes as recipe (recipe.id)}
        <RecipeListRow
          {recipe}
          selected={recipe.id === selectedRecipeId}
          {onSelect}
          {onAddToShoppingList}
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
      {isSearching
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
