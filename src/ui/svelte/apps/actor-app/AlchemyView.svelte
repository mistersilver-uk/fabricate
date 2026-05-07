<!-- Svelte 5 runes mode -->
<!--
  AlchemyView is the player-facing alchemy tab. It replaces the legacy
  AlchemyTab.svelte one-to-one and adopts the V2 workbench-first layout:
    - Run bands (In Progress / Recent History) at the top
    - Alchemy system selector (compact) above the workbench
    - Three-column main grid: Components palette | Workbench | Discovered + Selected
    - Palette availability legend at the bottom

  Secrecy: the discovered-recipes selection always resolves through the store's
  filtered `discoveredRecipes` writable. Hidden recipes never reach the
  inspector card.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RunBands from './RunBands.svelte';
  import SelectedDiscoveredRecipeCard from './SelectedDiscoveredRecipeCard.svelte';
  import PaletteAvailabilityLegend from './PaletteAvailabilityLegend.svelte';
  import AlchemySystemSelector from '../AlchemySystemSelector.svelte';
  import ComponentPalette from '../ComponentPalette.svelte';
  import WorkbenchComponent from '../Workbench.svelte';
  import DiscoveredRecipesPanel from '../DiscoveredRecipesPanel.svelte';

  let { store } = $props();

  // Local palette filter state
  let paletteSearch = $state('');
  let paletteOwnedOnly = $state(false);

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
  const selectedDiscoveredRecipe = store.selectedDiscoveredRecipe;
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

  let workbenchTotalCount = $derived(
    ($workbench || []).reduce((sum, e) => sum + (e.quantity || 0), 0)
  );
</script>

<div class="alchemy-view fabricate-actor-app--alchemy" data-testid="alchemy-view">
  <RunBands
    activeRuns={$alchemyRuns ?? $viewState.activeRuns}
    runHistory={$alchemyRunHistory ?? $viewState.runHistory}
    hasCraftingActor={$viewState.hasCraftingActor}
    onCraft={store.craft}
    onShowRunDetails={null}
    onRestartRun={store.restartRun}
    onCancelRun={store.cancelRun}
    onCancelSalvageRun={store.cancelSalvageRun}
  />

  {#if ($alchemySystems?.length || 0) > 1}
    <div class="alchemy-view__system-bar">
      <span class="alchemy-view__system-label">
        {localize('FABRICATE.ActorApp.Alchemy.SystemLabel')}
      </span>
      <AlchemySystemSelector
        alchemySystems={$alchemySystems}
        selectedSystemId={$selectedAlchemySystem?.id || ''}
        onSelectSystem={store.selectAlchemySystem}
      />
    </div>
  {/if}

  <div class="alchemy-view__grid">
    <!-- Left column: Components palette -->
    <section class="alchemy-view__column alchemy-view__column--components">
      <header class="alchemy-view__panel-header">
        <h3 class="alchemy-view__panel-title">
          {localize('FABRICATE.ActorApp.Alchemy.ComponentsTitle')}
        </h3>
      </header>
      <div class="alchemy-view__palette-toolbar">
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
            aria-label={localize('FABRICATE.Search.ClearLabel')}
          >
            <i class="fas fa-times"></i>
          </button>
          <span class="fabricate-search-icon"><i class="fas fa-search"></i></span>
        </div>
        <button
          type="button"
          class="fabricate-filter-btn"
          class:active={paletteOwnedOnly}
          onclick={() => { paletteOwnedOnly = !paletteOwnedOnly; }}
        >
          <i class="fas fa-check-circle"></i>
          {localize('FABRICATE.Alchemy.Palette.OwnedOnly')}
        </button>
      </div>
      <div class="alchemy-view__palette-body">
        <ComponentPalette
          palette={filteredPalette}
          onAddToWorkbench={store.addToWorkbench}
          onRemoveFromWorkbench={store.removeFromWorkbench}
        />
      </div>
    </section>

    <!-- Middle column: Workbench -->
    <section class="alchemy-view__column alchemy-view__column--workbench">
      <header class="alchemy-view__panel-header">
        <h3 class="alchemy-view__panel-title">
          {localize('FABRICATE.Workbench.Title')}
        </h3>
        <span class="alchemy-view__mix-counter" data-testid="alchemy-mix-counter">
          {localize('FABRICATE.ActorApp.Alchemy.CurrentMix').replace('{count}', workbenchTotalCount)}
        </span>
      </header>
      <div class="alchemy-view__workbench-body">
        <WorkbenchComponent
          entries={$workbench}
          onAddToWorkbench={store.addToWorkbench}
          onRemoveFromWorkbench={store.removeFromWorkbench}
          onClearWorkbench={store.clearWorkbench}
          onSubmitWorkbench={store.submitWorkbench}
        />
      </div>
    </section>

    <!-- Right column: Discovered recipes + selected inspector -->
    <section class="alchemy-view__column alchemy-view__column--discovered">
      <DiscoveredRecipesPanel
        recipes={$discoveredRecipes}
        searchTerm={$discoveredRecipeSearch}
        craftableOnly={$discoveredCraftableOnly}
        selectedRecipeId={$selectedDiscoveredRecipe?.id ?? null}
        onSearch={store.setDiscoveredRecipeSearch}
        onToggleCraftableOnly={store.toggleDiscoveredCraftableOnly}
        onAutoFill={store.autoFill}
        onSelectRecipe={store.selectDiscoveredRecipe}
      />
      <SelectedDiscoveredRecipeCard recipe={$selectedDiscoveredRecipe} />
    </section>
  </div>

  <PaletteAvailabilityLegend />
</div>

<style>
  .alchemy-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
  }

  .alchemy-view__system-bar {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-control);
    background: var(--fab-surface-soft);
  }

  .alchemy-view__system-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-subtle);
  }

  .alchemy-view__grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 3fr) minmax(0, 2fr);
    gap: var(--fab-space-2);
    flex: 1;
    min-height: 0;
  }

  .alchemy-view__column {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-surface);
  }

  .alchemy-view__panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .alchemy-view__panel-title {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .alchemy-view__mix-counter {
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--fab-surface-raised);
  }

  .alchemy-view__palette-toolbar {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    flex-shrink: 0;
  }

  .alchemy-view__palette-toolbar .fabricate-search {
    flex: 1;
    min-width: 0;
    margin-bottom: 0;
  }

  .alchemy-view__palette-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .alchemy-view__workbench-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .alchemy-view__column--discovered {
    overflow-y: auto;
  }

  /* Container-query stacking for narrower app widths */
  @container actor-app (max-width: 1100px) {
    .alchemy-view__grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .alchemy-view__column--discovered {
      grid-column: 1 / -1;
    }
  }

  @container actor-app (max-width: 740px) {
    .alchemy-view__grid {
      grid-template-columns: 1fr;
    }
    .alchemy-view__column--discovered {
      grid-column: auto;
    }
  }
</style>
