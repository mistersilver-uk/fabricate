<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import AlchemySystemSelector from './AlchemySystemSelector.svelte';
  import ComponentPalette from './ComponentPalette.svelte';
  import WorkbenchComponent from './Workbench.svelte';
  import DiscoveredRecipesPanel from './DiscoveredRecipesPanel.svelte';
  import RunSummary from './RunSummary.svelte';

  let { store } = $props();

  // Local palette filter state
  let paletteSearch = $state('');
  let paletteOwnedOnly = $state(false);

  // Subscribe to the Svelte stores.
  // These are svelte/store writable() instances from craftingStore.js.
  // The Svelte compiler may warn about capturing prop-derived references at
  // init time, but store is stable for the app's lifetime so this is safe.
  // svelte-ignore state_referenced_locally
  const selectedAlchemySystem = store.selectedAlchemySystem;
  // svelte-ignore state_referenced_locally
  const alchemySystems = store.alchemySystems;
  // svelte-ignore state_referenced_locally
  const palette = store.palette;
  // svelte-ignore state_referenced_locally
  const workbench = store.workbench;
  // svelte-ignore state_referenced_locally
  const discoveredRecipes = store.discoveredRecipes;
  // svelte-ignore state_referenced_locally
  const discoveredRecipeSearch = store.discoveredRecipeSearch;
  // svelte-ignore state_referenced_locally
  const discoveredCraftableOnly = store.discoveredCraftableOnly;
  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;
  // svelte-ignore state_referenced_locally
  const alchemyRuns = store.alchemyRuns;
  // svelte-ignore state_referenced_locally
  const alchemyRunHistory = store.alchemyRunHistory;

  let filteredPalette = $derived.by(() => {
    let entries = $palette;
    if (paletteSearch) {
      const term = paletteSearch.toLowerCase();
      entries = entries.filter(e => e.name.toLowerCase().includes(term));
    }
    if (paletteOwnedOnly) {
      entries = entries.filter(e => e.inventoryQuantity > 0);
    }
    return entries;
  });
</script>

<RunSummary
  activeRuns={$alchemyRuns ?? $viewState.activeRuns}
  runHistory={$alchemyRunHistory ?? $viewState.runHistory}
  hasCraftingActor={$viewState.hasCraftingActor}
  onCraft={store.craft}
  onShowRunDetails={null}
  onRestartRun={store.restartRun}
  onCancelRun={store.cancelRun}
  onCancelSalvageRun={store.cancelSalvageRun}
/>

<AlchemySystemSelector
  alchemySystems={$alchemySystems}
  selectedSystemId={$selectedAlchemySystem?.id || ''}
  onSelectSystem={store.selectAlchemySystem}
/>

<WorkbenchComponent
  entries={$workbench}
  onAddToWorkbench={store.addToWorkbench}
  onRemoveFromWorkbench={store.removeFromWorkbench}
  onClearWorkbench={store.clearWorkbench}
  onSubmitWorkbench={store.submitWorkbench}
/>

<div class="alchemy-tab-panels">
  <!-- Left panel: palette -->
  <div class="alchemy-tab-left">
    <div class="alchemy-palette-toolbar">
      <div class="fabricate-search has-clear-button">
        <input
          type="text"
          placeholder={localize('FABRICATE.Alchemy.Palette.SearchPlaceholder')}
          value={paletteSearch}
          oninput={(e) => { paletteSearch = e.target.value; }}
        />
        <button
          type="button"
          class="fabricate-search-clear"
          class:is-empty={!paletteSearch}
          onclick={() => { paletteSearch = ''; }}
          tabindex={paletteSearch ? 0 : -1}
        >
          <i class="fas fa-times"></i>
        </button>
        <span class="fabricate-search-icon"><i class="fas fa-search"></i></span>
      </div>
      <button
        type="button"
        class="fabricate-filter-btn alchemy-palette-owned-btn"
        class:active={paletteOwnedOnly}
        onclick={() => { paletteOwnedOnly = !paletteOwnedOnly; }}
      >
        <i class="fas fa-check-circle"></i>
        {localize('FABRICATE.Alchemy.Palette.OwnedOnly')}
      </button>
    </div>
    <div class="alchemy-palette">
      <ComponentPalette
        palette={filteredPalette}
        onAddToWorkbench={store.addToWorkbench}
        onRemoveFromWorkbench={store.removeFromWorkbench}
      />
    </div>
  </div>

  <!-- Right panel: discovered recipes -->
  <div class="alchemy-tab-right">
    <DiscoveredRecipesPanel
      recipes={$discoveredRecipes}
      searchTerm={$discoveredRecipeSearch}
      craftableOnly={$discoveredCraftableOnly}
      onSearch={store.setDiscoveredRecipeSearch}
      onToggleCraftableOnly={store.toggleDiscoveredCraftableOnly}
      onAutoFill={store.autoFill}
    />
  </div>
</div>

<style>
  .alchemy-tab-panels {
    display: flex;
    gap: 8px;
    flex: 1;
    overflow: hidden;
    padding: 8px;
  }

  .alchemy-tab-left {
    flex: 3;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .alchemy-palette-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 4px;
    flex-shrink: 0;
  }

  .alchemy-palette-toolbar .fabricate-search {
    flex: 1;
    min-width: 0;
    margin-bottom: 0;
  }

  .alchemy-palette-toolbar .alchemy-palette-owned-btn {
    padding: 8px 12px;
    font-size: 13px;
    line-height: 1;
    box-sizing: border-box;
    height: auto;
    margin: 0;
  }

  .alchemy-tab-left .alchemy-palette {
    flex: 1;
    overflow-y: auto;
  }

  .alchemy-tab-right {
    flex: 2;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    border-left: 1px solid rgba(0, 0, 0, 0.12);
    padding-left: 8px;
  }
</style>
