<!-- Svelte 5 runes mode -->
<script>
  import { localize, renderDialog } from '../util/foundryBridge.js';
  import ActorSelector from './ActorSelector.svelte';
  import SourceActorPicker from './SourceActorPicker.svelte';
  import SearchBar from './SearchBar.svelte';
  import FilterBar from './FilterBar.svelte';
  import RecipeList from './RecipeList.svelte';
  import RunSummary from './RunSummary.svelte';
  import RecentsSection from './RecentsSection.svelte';
  import AlchemySubmitPanel from './AlchemySubmitPanel.svelte';
  import ShoppingListPanel from './ShoppingListPanel.svelte';

  let { store, services = null } = $props();

  // Subscribe to the Svelte stores.
  // These are svelte/store writable() instances from craftingStore.js.
  // The Svelte compiler may warn about capturing prop-derived references at
  // init time, but store is stable for the app's lifetime so this is safe.
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
  const isAlchemyMode = store.isAlchemyMode;
  // svelte-ignore state_referenced_locally
  const shoppingList = store.shoppingList;
  // svelte-ignore state_referenced_locally
  const shoppingListExpanded = store.shoppingListExpanded;

  function handleShowRunDetails(runId, scope) {
    // TODO: Replace with full run details dialog
    renderDialog({
      title: localize('FABRICATE.RunSummary.RunDetails'),
      content: `<p>Run ${runId} (${scope})</p>`,
      buttons: [{ action: 'close', label: 'OK', default: true }]
    });
  }

  // TODO: Replace with full RecipeDetailsDialog implementation
  function handleShowDetails(recipeId) {
    const recipe = $viewState.recipes.find(r => r.id === recipeId);
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

</script>
<div class="fabricate-crafting-app">
  <!-- Actor Selection Section -->
  <section class="actor-selection-section">
    <ActorSelector
      availableActors={$viewState.availableActors}
      onSelectActor={store.selectActor}
    />
    <SourceActorPicker
      ownedActors={$viewState.ownedActors}
      onToggleSource={store.toggleSourceActor}
    />
  </section>

  <RunSummary
    activeRuns={$viewState.activeRuns}
    runHistory={$viewState.runHistory}
    hasCraftingActor={$viewState.hasCraftingActor}
    onCraft={store.craft}
    onShowRunDetails={handleShowRunDetails}
    onRestartRun={store.restartRun}
    onCancelRun={store.cancelRun}
    onCancelSalvageRun={store.cancelSalvageRun}
  />

  {#if $viewState.salvageEntries?.length > 0}
    <section class="run-summary-section">
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

  <!-- Search and Filters Header -->
  <header class="fabricate-header">
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

  <!-- Recipe List / Alchemy Panel -->
  {#if $isAlchemyMode}
    <AlchemySubmitPanel {store} />
  {:else}
    <div class="fabricate-recipe-list">
      {#if !$viewState.hasComponentSources}
        <div class="fabricate-empty">
          <i class="fas fa-info-circle"></i>
          <p>{localize('FABRICATE.SourceActorPicker.NoActors')}</p>
        </div>
      {:else}
        <RecentsSection
          recipes={$viewState.recentRecipes}
          onCraft={store.craft}
          onShowDetails={handleShowDetails}
        />
        <RecipeList
          recipes={$viewState.recipes}
          search={$searchTerm}
          onCraft={store.craft}
          onLearnRecipe={store.learnRecipe}
          onToggleFavourite={store.toggleFavourite}
          onShowDetails={handleShowDetails}
          onRestartRun={store.restartRun}
          onAddToShoppingList={store.addToShoppingList}
        />
        {#if $viewState.totalRecipes > 0}
          <p class="hint">{localize('FABRICATE.RecipeList.Count').replace('{count}', $viewState.totalRecipes)}</p>
        {/if}
      {/if}
    </div>
  {/if}
</div>
