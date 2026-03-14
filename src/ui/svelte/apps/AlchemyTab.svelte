<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import AlchemySystemSelector from './AlchemySystemSelector.svelte';
  import ComponentPalette from './ComponentPalette.svelte';
  import WorkbenchComponent from './Workbench.svelte';
  import DiscoveredRecipesPanel from './DiscoveredRecipesPanel.svelte';
  import RunSummary from './RunSummary.svelte';

  let { store } = $props();

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
</script>

<RunSummary
  activeRuns={$viewState.activeRuns}
  runHistory={$viewState.runHistory}
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

<div class="alchemy-tab-panels">
  <!-- Left panel: palette + workbench -->
  <div class="alchemy-tab-left">
    <div class="alchemy-palette">
      <ComponentPalette
        palette={$palette}
        onAddToWorkbench={store.addToWorkbench}
        onRemoveFromWorkbench={store.removeFromWorkbench}
      />
    </div>
    <WorkbenchComponent
      entries={$workbench}
      onRemoveFromWorkbench={store.removeFromWorkbench}
      onClearWorkbench={store.clearWorkbench}
      onSubmitWorkbench={store.submitWorkbench}
    />
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
