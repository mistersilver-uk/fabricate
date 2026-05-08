<!-- Svelte 5 runes mode -->
<!--
  CraftingView is the V2 player-facing crafting tab. Two full-height columns:
    LEFT (crafting-view__main): RunBands (collapsible, paginated), Salvage band
      (when entries exist), ShoppingList (collapsible), search/filter toolbar,
      RecipeTable, recipe-table Pagination.
    RIGHT (crafting-view__inspector): SelectedRecipeInspector — dominates the
      vertical space and dispatches between simple/complex variants.

  At narrow container widths the two-column grid collapses to a single column
  via @container actor-app queries.

  Teaser/secrecy: prepared recipes already mask hidden fields. The table and
  inspector render only what was provided, never raw recipe internals.
-->
<script>
  import { localize, renderDialog } from '../../util/foundryBridge.js';
  import SearchBar from '../SearchBar.svelte';
  import FilterBar from '../FilterBar.svelte';
  import ShoppingListPanel from '../ShoppingListPanel.svelte';
  import RunBands from './RunBands.svelte';
  import RecipeTable from './RecipeTable.svelte';
  import SelectedRecipeInspector from './SelectedRecipeInspector.svelte';
  import Pagination from '../../components/Pagination.svelte';

  let { store, services = null } = $props();

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;
  // svelte-ignore state_referenced_locally
  const searchTerm = store.searchTerm;
  // svelte-ignore state_referenced_locally
  const selectedCategory = store.selectedCategory;
  // svelte-ignore state_referenced_locally
  const showOnlyAvailable = store.showOnlyAvailable;
  // svelte-ignore state_referenced_locally
  const showFavouritesOnly = store.showFavouritesOnly;
  // svelte-ignore state_referenced_locally
  const shoppingList = store.shoppingList;
  // svelte-ignore state_referenced_locally
  const shoppingListExpanded = store.shoppingListExpanded;
  // svelte-ignore state_referenced_locally
  const craftingRuns = store.craftingRuns;
  // svelte-ignore state_referenced_locally
  const craftingRunHistory = store.craftingRunHistory;
  // svelte-ignore state_referenced_locally
  const selectedRecipeInspector = store.selectedRecipeInspector;
  // svelte-ignore state_referenced_locally
  const craftingPageIndex = store.craftingPageIndex;
  // svelte-ignore state_referenced_locally
  const pageSize = store.pageSize;
  // svelte-ignore state_referenced_locally
  const runBandsExpanded = store.runBandsExpanded;
  // svelte-ignore state_referenced_locally
  const activeRunPageIndex = store.activeRunPageIndex;
  // svelte-ignore state_referenced_locally
  const historyPageIndex = store.historyPageIndex;

  function handleShowRunDetails(runId, scope) {
    renderDialog({
      title: localize('FABRICATE.RunSummary.RunDetails'),
      content: `<p>Run ${runId} (${scope})</p>`,
      buttons: [{ action: 'close', label: 'OK', default: true }]
    });
  }

  function handleShowDetails(recipeId) {
    const list = $viewState.recipes ?? [];
    const recipe = list.find(r => r.id === recipeId) ?? null;
    renderDialog({
      title: recipe?.name ?? recipeId,
      content: `<p>${recipe?.description ?? ''}</p>`,
      buttons: [{ action: 'close', label: localize('FABRICATE.RecipeCard.ShowDetails'), default: true }]
    });
  }

  let enrichedShoppingEntries = $derived(
    ($shoppingList || []).map(entry => {
      const recipe = ($viewState.recipes || []).find(r => r.id === entry.recipeId);
      return { ...entry, recipeName: recipe?.name || entry.recipeId };
    })
  );

  let allRecipes = $derived($viewState.recipes ?? []);
  let totalRecipeCount = $derived(allRecipes.length);
  let pagedRecipes = $derived.by(() => {
    const size = $pageSize || 10;
    const start = ($craftingPageIndex || 0) * size;
    return allRecipes.slice(start, start + size);
  });
</script>

<div class="crafting-view fabricate-actor-app--crafting" data-testid="crafting-view">
  {#if !$viewState.hasComponentSources}
    <div class="crafting-view__empty">
      <i class="fas fa-info-circle" aria-hidden="true"></i>
      <p>{localize('FABRICATE.SourceActorPicker.NoActors')}</p>
    </div>
  {:else}
    <div class="crafting-view__body">
      <div class="crafting-view__main">
        <RunBands
          activeRuns={$craftingRuns ?? $viewState.activeRuns}
          runHistory={$craftingRunHistory ?? $viewState.runHistory}
          hasCraftingActor={$viewState.hasCraftingActor}
          expanded={$runBandsExpanded}
          activeRunPageIndex={$activeRunPageIndex}
          historyPageIndex={$historyPageIndex}
          onToggleExpanded={store.toggleRunBandsExpanded}
          onActiveRunPageChange={store.setActiveRunPageIndex}
          onHistoryPageChange={store.setHistoryPageIndex}
          onCraft={store.craft}
          onShowRunDetails={handleShowRunDetails}
          onRestartRun={store.restartRun}
          onCancelRun={store.cancelRun}
          onCancelSalvageRun={store.cancelSalvageRun}
        />

        {#if $viewState.salvageEntries?.length > 0}
          <section class="crafting-view__salvage-band">
            <h4>{localize('FABRICATE.Salvage.Title')}</h4>
            <ul class="run-list">
              {#each $viewState.salvageEntries as entry (`salvage-${entry.systemId}-${entry.id}`)}
                <li class="run-row">
                  <strong>{entry.name}</strong>
                  <span class="badge">{entry.statusLabel}</span>
                  <span class="hint">
                    {entry.systemName} • {localize('FABRICATE.Salvage.AvailableCount')
                      .replace('{have}', String(entry.quantityAvailable))
                      .replace('{need}', String(entry.quantityRequired))}
                  </span>
                  <span class="run-row-actions">
                    <button
                      type="button"
                      class="details-btn"
                      disabled={!entry.allowSalvageAction}
                      onclick={() => store.salvage(entry.systemId, entry.id)}
                      title={localize('FABRICATE.Salvage.Start')}
                    >
                      {entry.buttonLabel}
                    </button>
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <ShoppingListPanel
          shoppingListData={$viewState.shoppingListData}
          shoppingListEntries={enrichedShoppingEntries}
          expanded={$shoppingListExpanded}
          onToggleExpanded={store.toggleShoppingListExpanded}
          onRemoveRecipe={store.removeFromShoppingList}
          onSetQuantity={store.setShoppingListQuantity}
          onClearAll={store.clearShoppingList}
        />

        <header class="crafting-view__toolbar">
          <SearchBar
            value={$searchTerm}
            onSearch={store.setSearch}
            placeholder={localize('FABRICATE.Search.Placeholder')}
          />
          <FilterBar
            showCraftableOnly={$showOnlyAvailable}
            onToggleCraftable={store.toggleAvailable}
            showFavouritesOnly={$showFavouritesOnly}
            onToggleFavourites={store.toggleFavouritesOnly}
            categories={$viewState.categories}
            selectedCategory={$selectedCategory}
            onCategoryChange={store.setCategory}
          />
        </header>

        <RecipeTable
          recipes={pagedRecipes}
          selectedRecipeId={$selectedRecipeInspector?.id ?? null}
          onSelectRecipe={store.selectRecipe}
          onCraft={store.craft}
          onAddToShoppingList={store.addToShoppingList}
          onToggleFavourite={store.toggleFavourite}
        />
        <Pagination
          totalCount={totalRecipeCount}
          pageSize={$pageSize}
          pageIndex={$craftingPageIndex}
          onPageChange={(idx) => store.setCraftingPageIndex(idx)}
          onPageSizeChange={(size) => store.setPageSize(size)}
        />
      </div>
      <div class="crafting-view__inspector">
        <SelectedRecipeInspector
          recipe={$selectedRecipeInspector}
          onCraft={store.craft}
          onAddToShoppingList={store.addToShoppingList}
          onToggleFavourite={store.toggleFavourite}
          onShowDetails={handleShowDetails}
          onLearnRecipe={store.learnRecipe}
          onRestartRun={store.restartRun}
          onSelectPath={store.selectPath}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .crafting-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
  }

  .crafting-view__salvage-band {
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-surface-soft);
    max-height: clamp(140px, 28vh, 280px);
    overflow-y: auto;
  }

  .crafting-view__salvage-band h4 {
    position: sticky;
    top: 0;
    margin: 0 0 var(--fab-space-1) 0;
    padding: var(--fab-space-1) 0;
    background: var(--fab-surface-soft);
    z-index: 1;
  }

  .crafting-view__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .crafting-view__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-6);
    color: var(--fab-text-subtle);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
  }

  .crafting-view__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
    gap: var(--fab-space-2);
    flex: 1;
    min-height: 0;
  }

  .crafting-view__main {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    overflow-y: auto;
    padding-right: var(--fab-space-1);
  }

  .crafting-view__inspector {
    align-self: stretch;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .crafting-view__inspector > :global(.simple-inspector),
  .crafting-view__inspector > :global(.complex-inspector) {
    flex: 1;
    min-height: 0;
  }

  @container actor-app (max-width: 1180px) {
    .crafting-view__body {
      grid-template-columns: 1fr;
    }

    .crafting-view__inspector {
      align-self: auto;
    }
  }
</style>
