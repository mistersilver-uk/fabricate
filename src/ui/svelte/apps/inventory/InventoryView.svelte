<!-- Svelte 5 runes mode -->
<!--
  InventoryView is the player Inventory tab content. It reads the shared
  services.inventory store and renders one of: loading, error, no-actor, empty, or
  the populated two-column layout (filters + item grid | item detail).

  All browse state lives in the store; this view threads store getters down into
  the prop-driven child components and routes their callbacks back to store
  actions. It refetches the listing on mount, on a shared actor-selection change,
  on a component-source change, on a scene change, and on world-time advancement —
  mirroring the Crafting tab, with which it shares the selected character and
  component-source actors.
-->
<script>
  import { localize, subscribeSceneChange, subscribeWorldTime } from '../../util/foundryBridge.js';
  import InventoryFilters from './InventoryFilters.svelte';
  import InventoryGrid from './InventoryGrid.svelte';
  import InventoryDetail from './InventoryDetail.svelte';

  let { services = null } = $props();

  const store = $derived(services?.inventory ?? null);
  const sourcesStore = $derived(services?.craftingSources ?? null);
  const actorBar = $derived(services?.actorBar ?? null);

  const rows = $derived(store?.rows ?? []);
  const hasActor = $derived(Boolean(store?.hasActor));

  const isLoading = $derived(Boolean(store?.loading) && !store?.loadedOnce);
  const isError = $derived(Boolean(store?.error));
  const isNoActor = $derived(Boolean(store?.loadedOnce) && !hasActor);
  const isEmpty = $derived(Boolean(store?.loadedOnce) && hasActor && rows.length === 0);

  const filtering = $derived(
    String(store?.search ?? '').trim() !== '' || (store?.filter ?? 'all') !== 'all'
  );

  function onSelect(key) {
    store?.select(key);
  }
  function onSearch(value) {
    store?.setSearch(value);
  }
  function onFilter(value) {
    store?.setFilter(value);
  }
  function onSort(value) {
    store?.setSort(value);
  }
  function onOpenRecipe(recipeId) {
    services?.navigateToCraftingRecipe?.(recipeId);
  }

  // Refetch on mount and whenever the shared actor selection changes. The shared
  // top bar is the single source of truth for the selected character; persist its
  // selection into the crafting setting BEFORE loading (the inventory listing
  // resolves its actor from that setting, shared with Crafting) and re-point the
  // required component source to that actor so its inventory is included.
  $effect(() => {
    const actorId = actorBar?.selectedActorId ?? null;
    services?.setSelectedCraftingActorId?.(actorId ?? '');
    sourcesStore?.load();
    sourcesStore?.setCraftingActor(actorId);
    store?.load();
  });

  // Re-fetch when the component-source selection changes (adding/removing a
  // source actor folds its inventory in/out). Reading the id list registers the
  // dependency; the quiet reload avoids a spinner flash.
  $effect(() => {
    void sourcesStore?.selectedSourceIds;
    if (store?.loadedOnce) store?.load(true);
  });

  // Scene-linked availability can change when the player navigates scenes.
  $effect(() => subscribeSceneChange(() => store?.load(true)));

  // The GM advancing the clock can change owned stacks (regen, etc.); bump the
  // world-time tick and quietly re-fetch.
  $effect(() => subscribeWorldTime(() => {
    store?.tickWorldTime();
    store?.load(true);
  }));
</script>

{#if isLoading}
  <div class="inventory-view-state" data-inventory-state="loading">
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Inventory.Loading')}</p>
  </div>
{:else if isError}
  <div class="inventory-view-state" data-inventory-state="error">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Inventory.Error')}</p>
  </div>
{:else if isNoActor}
  <div class="inventory-view-state" data-inventory-state="no-actor">
    <i class="fas fa-user-slash" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Inventory.NoActor')}</p>
  </div>
{:else if isEmpty}
  <div class="inventory-view-state" data-inventory-state="empty">
    <i class="fas fa-boxes-stacked" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Inventory.Empty')}</p>
  </div>
{:else}
  <div class="inventory-view-container">
    <div class="inventory-view-grid" data-inventory-state="populated">
      <div class="inventory-view-column inventory-view-column-left">
        <InventoryFilters
          search={store?.search ?? ''}
          filter={store?.filter ?? 'all'}
          sort={store?.sort ?? 'name'}
          counts={store?.filterCounts ?? {}}
          {onSearch}
          {onFilter}
          {onSort}
        />
        <InventoryGrid
          items={store?.pageItems ?? []}
          selectedKey={store?.selectedItem?.key ?? null}
          totalCount={store?.visibleItems?.length ?? 0}
          pageIndex={store?.page ?? 0}
          pageSize={store?.pageSize ?? 25}
          {filtering}
          {onSelect}
          onPageChange={(index) => store?.setPage(index)}
          onPageSizeChange={(size) => store?.setPageSize(size)}
        />
      </div>

      <section class="inventory-view-column inventory-view-column-right" data-inventory-detail>
        <InventoryDetail item={store?.selectedItem ?? null} {onOpenRecipe} />
      </section>
    </div>
  </div>
{/if}

<style>
  /* The grid wrapper is the size container so columns reflow against the Fabricate
     window width, matching the crafting/gathering views' parent-container pattern. */
  .inventory-view-container {
    container-type: inline-size;
    container-name: fabricate-inventory;
    height: 100%;
    min-height: 0;
  }

  .inventory-view-grid {
    display: grid;
    /* Left (filters + grid) carries the denser weight; the detail column keeps a
       comfortable minimum. Below the breakpoint the two columns stack. */
    grid-template-columns: minmax(320px, 1.6fr) minmax(300px, 1fr);
    gap: var(--fab-space-4);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  @container fabricate-inventory (max-width: 900px) {
    .inventory-view-grid {
      grid-template-columns: 1fr;
      grid-auto-rows: minmax(min-content, max-content);
      height: auto;
      min-height: 100%;
      overflow-y: auto;
    }

    .inventory-view-column {
      min-height: 220px;
    }
  }

  .inventory-view-column {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .inventory-view-column-right {
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    overflow: hidden;
  }

  .inventory-view-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--fab-text-muted);
    background: var(--fab-surface);
  }

  .inventory-view-state i {
    font-size: 32px;
  }

  .inventory-view-state p {
    margin: 0;
    font-size: 14px;
  }
</style>
