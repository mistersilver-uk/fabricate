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

  BULK SALVAGE (issue 859) renders as a SIBLING of `InventoryDetail`, not through
  it. `InventoryDetail` is a documented public entry point — `RecipeItemEditor`
  renders it for the GM's preview — so routing bulk through it would buy a
  permanent prop-forwarding surface for a feature preview can never use, AND a
  router import would pull the whole bulk tree into `recipe-item-editor-mounted`
  and `manager-mounted`'s static module graphs (a `{#if}` in a router does not keep
  a branch out of the graph; the compiled module imports every child statically).

  This view also owns the BULK i18n BOUNDARY, following the `onResetSalvageOrder`
  precedent: the store holds no localized text, so the destroy confirmation's copy
  and the selection-cap notice are composed here and handed down/in already
  localized.
-->
<script>
  import { localize, subscribeSceneChange, subscribeWorldTime } from '../../util/foundryBridge.js';
  import InventoryFilters from './InventoryFilters.svelte';
  import InventoryGrid from './InventoryGrid.svelte';
  import InventoryDetail from './InventoryDetail.svelte';
  import InventoryBulkPanel from './bulk/InventoryBulkPanel.svelte';

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
  function onLearn(recipeId) {
    return store?.learn?.(recipeId);
  }
  function onLearnAll(recipeIds) {
    return store?.learnAll?.(recipeIds);
  }
  // The acting participation of the selected card (issue 766): the store resolves it from
  // the selected system, defaulting to the primary. The whole detail body scopes to it.
  const activeSystem = $derived(store?.selectedParticipation ?? null);
  function onSelectSystem(systemId) {
    store?.selectSystem?.(systemId);
  }
  function onSalvage() {
    // Route salvage through the SELECTED participation's ids, never the primary default.
    return store?.salvage?.(activeSystem?.systemId ?? null, activeSystem?.componentId ?? null);
  }
  function onResetSalvage() {
    store?.resetSalvage?.();
  }
  function onReorderSalvageStage(index, target, announcement) {
    store?.reorderSalvageStage?.(index, target, announcement);
  }
  // The announcement is owned here, not by the store: the store holds no i18n, and a
  // keyboard user who presses Reset must hear that the order moved — the rows change
  // under them with no other signal.
  function onResetSalvageOrder() {
    store?.resetSalvageOrder?.(
      localize('FABRICATE.App.Inventory.Salvage.StageOrderResetAnnouncement')
    );
  }
  function onSalvageReorderSettled() {
    // A drag has already settled by the time it drops, so flush rather than coalesce.
    // The returned status is the store's business here; the FOOTER is what must gate
    // the run on a successful flush.
    return store?.flushSalvageOrder?.();
  }
  // The salvage panel only ever sees the outcome of the participation it belongs to (issue
  // 766): the result is keyed by the acting `(systemId, componentId)`, so the gate compares
  // on the SELECTED participation — a system-B outcome must not surface under a system-A view.
  const salvageResult = $derived(
    store?.salvageResult &&
      store.salvageResult.systemId === activeSystem?.systemId &&
      store.salvageResult.componentId === activeSystem?.componentId
      ? store.salvageResult
      : null
  );

  // --- Bulk salvage / destroy (issue 859) ---------------------------------------
  const bulkActive = $derived(Boolean(store?.bulkActive));
  const bulkEntries = $derived(store?.bulkEntries ?? []);

  // The whole-stack unit total the confirmation must name alongside the row count —
  // the TARGET actor's units, matching what destroy actually deletes.
  const bulkUnitCount = $derived(
    bulkEntries.reduce((sum, entry) => sum + (Number(entry?.actorQuantity) || 0), 0)
  );
  // Composed ONCE and reused by both the trigger label and the dialog copy, so the
  // two can never name the numbers differently. Independently pluralized, because a
  // row count and a unit count reach 1 at different times.
  const bulkComponentsText = $derived(
    localize(
      bulkEntries.length === 1
        ? 'FABRICATE.App.Inventory.Bulk.DestroyComponentsOne'
        : 'FABRICATE.App.Inventory.Bulk.DestroyComponentsMany',
      { count: bulkEntries.length }
    )
  );
  const bulkUnitsText = $derived(
    localize(
      bulkUnitCount === 1
        ? 'FABRICATE.App.Inventory.Bulk.DestroyUnitsOne'
        : 'FABRICATE.App.Inventory.Bulk.DestroyUnitsMany',
      { count: bulkUnitCount }
    )
  );
  const bulkDestroyLabel = $derived(
    localize('FABRICATE.App.Inventory.Bulk.DestroyAction', {
      components: bulkComponentsText,
      units: bulkUnitsText,
    })
  );

  // The store signals a refused 26th selection rather than authoring a message; the
  // notice is localized here. It carries no number: the panel's live count line
  // already states the limit on the click that REACHED it.
  function onBulkToggle(key) {
    const outcome = store?.toggleBulkSelection?.(key);
    if (outcome?.refused === true) {
      services?.notify?.(localize('FABRICATE.App.Inventory.Bulk.LimitReached'));
    }
  }
  function onBulkClear() {
    store?.clearBulkSelection?.();
  }
  function onBulkRemove(key) {
    store?.removeFromBulkSelection?.(key);
  }
  function onBulkSalvage() {
    return store?.bulkSalvage?.();
  }
  // The dialog names BOTH numbers, and its copy states plainly that destroying is
  // not salvaging — a tool sitting in the pack broken is there precisely because its
  // GM chose NOT to destroy it on break, so this must not read like that rule firing.
  function onBulkDestroy() {
    return store?.bulkDestroy?.({
      // `window: { title }` is the shape DialogV2 reads its frame title from — the
      // canonical one, kept explicit here. Issue 1154 took the follow-up this comment
      // used to defer: `normalizeConfirmOptions` (`svelte/util/foundryBridge.js`) now
      // maps a top-level `title` onto it for every confirm seam, so the manager-side
      // callers this could not retitle at the time are covered centrally.
      window: {
        title: localize('FABRICATE.App.Inventory.Bulk.DestroyTitle', {
          components: bulkComponentsText,
        }),
      },
      content:
        `<p>${localize('FABRICATE.App.Inventory.Bulk.DestroyBody', {
          components: bulkComponentsText,
          units: bulkUnitsText,
        })}</p>` + `<p>${localize('FABRICATE.App.Inventory.Bulk.DestroyRule')}</p>`,
      yes: {
        // Without an explicit icon the confirm button wears `DialogV2.confirm`'s
        // default checkmark, which reads as approval on a permanent deletion.
        icon: 'fa-solid fa-trash',
        label: localize('FABRICATE.App.Inventory.Bulk.DestroyConfirm'),
        callback: () => true,
      },
      // No `no` override: `DialogV2.confirm`'s own default already returns false and
      // is the DEFAULT button. A `no: () => false` here configured nothing —
      // `mergeObject` reads `Object.keys()` of a function, which is empty — so it
      // only read as if it did.
    });
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
  $effect(() =>
    subscribeWorldTime(() => {
      store?.tickWorldTime();
      store?.load(true);
    })
  );
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
          bulkSelectedKeys={store?.bulkSelectedKeys ?? []}
          {onBulkToggle}
          {onBulkClear}
          onPageChange={(index) => store?.setPage(index)}
          onPageSizeChange={(size) => store?.setPageSize(size)}
        />
      </div>

      <section class="inventory-view-column inventory-view-column-right" data-inventory-detail>
        {#if bulkActive}
          <InventoryBulkPanel
            counts={store?.bulkCounts ?? null}
            entries={bulkEntries}
            salvageable={store?.bulkSalvageable ?? []}
            blocked={store?.bulkBlocked ?? []}
            yieldRows={store?.bulkYieldPreview ?? []}
            running={store?.bulkRunning ?? false}
            destroying={store?.bulkDestroying ?? false}
            progress={store?.bulkProgress ?? null}
            report={store?.bulkReport ?? null}
            destroyLabel={bulkDestroyLabel}
            onClear={onBulkClear}
            onRemove={onBulkRemove}
            onSalvage={onBulkSalvage}
            onDestroy={onBulkDestroy}
            onDone={onBulkClear}
          />
        {:else}
          <InventoryDetail
            item={store?.selectedItem ?? null}
            {activeSystem}
            {onSelectSystem}
            learningRecipeId={store?.learningRecipeId ?? null}
            salvaging={store?.salvagingKey != null}
            {salvageResult}
            salvageStages={store?.orderedSalvageStages ?? []}
            salvageAnnouncement={store?.salvageOrderAnnouncement ?? ''}
            {onOpenRecipe}
            {onLearn}
            {onLearnAll}
            {onSalvage}
            {onResetSalvage}
            {onReorderSalvageStage}
            {onSalvageReorderSettled}
            salvageOrderIsCustom={store?.salvageOrderIsCustom ?? false}
            {onResetSalvageOrder}
          />
        {/if}
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
