<!-- Svelte 5 runes mode -->
<script>
  import { localize, renderDialog } from '../util/foundryBridge.js';
  import ActorSelector from './ActorSelector.svelte';
  import SourceActorPicker from './SourceActorPicker.svelte';
  import SearchBar from './SearchBar.svelte';
  import FilterBar from './FilterBar.svelte';
  import RecipeList from './RecipeList.svelte';
  import RunSummary from './RunSummary.svelte';
  import FavouritesSection from './FavouritesSection.svelte';
  import RecentsSection from './RecentsSection.svelte';

  let { store, services = null } = $props();

  // Subscribe to the Svelte stores.
  // These are svelte/store writable() instances from craftingStore.js.
  // The Svelte compiler may warn about capturing prop-derived references at
  // init time, but store is stable for the app's lifetime so this is safe.
  const viewState = store.viewState;
  const searchTerm = store.searchTerm;
  const selectedCategory = store.selectedCategory;
  const showOnlyAvailable = store.showOnlyAvailable;

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
      categories={$viewState.categories}
      selectedCategory={$selectedCategory}
      onCategoryChange={store.setCategory}
    />
  </header>

  <!-- Recipe List -->
  <div class="fabricate-recipe-list">
    {#if !$viewState.hasComponentSources}
      <div class="fabricate-empty">
        <i class="fas fa-info-circle"></i>
        <p>{localize('FABRICATE.SourceActorPicker.NoActors')}</p>
      </div>
    {:else}
      <FavouritesSection
        recipes={$viewState.favouriteRecipes}
        onCraft={store.craft}
        onToggleFavourite={store.toggleFavourite}
      />
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
      />
      {#if $viewState.totalRecipes > 0}
        <p class="hint">{localize('FABRICATE.RecipeList.Count').replace('{count}', $viewState.totalRecipes)}</p>
      {/if}
    {/if}
  </div>
</div>
