<!-- Svelte 5 runes mode -->
<!--
  CraftingView is the player Crafting tab content. It reads the shared
  services.crafting store and renders one of: loading, error, no-actor, empty, or
  the populated 3-column layout (browser | recipe detail | shopping-list/run
  summary).

  All browse/craft state lives in the store; this view threads store getters down
  into the prop-driven child components and routes their callbacks back to store
  actions. It refetches the listing on mount, on a shared actor-selection change,
  on a scene change, and on world-time advancement (so calendar-aware durations
  stay current).
-->
<script>
  import { localize, subscribeSceneChange, subscribeWorldTime } from '../../util/foundryBridge.js';
  import RecipeBrowser from './RecipeBrowser.svelte';
  import RecipeDetail from './RecipeDetail.svelte';
  import ShoppingList from './ShoppingList.svelte';
  import RunSummaryPanel from './RunSummaryPanel.svelte';

  let { services = null } = $props();

  const store = $derived(services?.crafting ?? null);
  const sourcesStore = $derived(services?.craftingSources ?? null);
  const actorBar = $derived(services?.actorBar ?? null);

  // The selected recipe id the run summary was last dismissed for, so dismissing a
  // run returns the right column to the shopping list without losing the recorded
  // outcome (and a later craft of the same recipe re-opens the summary).
  let dismissedRunFor = $state(null);

  const listing = $derived(store?.listing ?? null);
  const hasActor = $derived(Boolean(listing?.selectedActorId));
  // The cheap SUMMARY rows (issue 1075). The rich model for the selected recipe is
  // hydrated separately by the store and read through `selectedRecipe` below.
  const summaries = $derived(Array.isArray(listing?.summaries) ? listing.summaries : []);

  const isLoading = $derived(Boolean(store?.loading) && !store?.loadedOnce);
  const isError = $derived(Boolean(store?.error));
  const isNoActor = $derived(Boolean(store?.loadedOnce) && !hasActor);
  const isEmpty = $derived(Boolean(store?.loadedOnce) && hasActor && summaries.length === 0);

  // The hydrated rich model, and the row it was hydrated from. The browser list highlights
  // the ROW, so a hydration that answers nothing leaves the selection visible rather than
  // silently clearing it.
  const selectedRecipe = $derived(store?.selectedRecipe ?? null);
  const selectedSummary = $derived(store?.selectedSummary ?? null);
  const selectedSetId = $derived(
    store?.selectedIngredientSetId ?? selectedRecipe?.defaultSetId ?? null
  );
  const craftability = $derived(store?.selectedCraftability ?? null);
  const craftInFlight = $derived(Boolean(store?.craftInFlight));

  // Progressive stage list (issue 651). The ORDER is applied in the store, not here —
  // this view only threads getters down and routes callbacks back.
  const progressiveStages = $derived(store?.orderedProgressiveStages ?? []);
  const canReorderStages = $derived(selectedRecipe?.allowPlayerResultReorder !== false);
  const stageAnnouncement = $derived(store?.orderAnnouncement ?? '');

  // The requirement rail is INTERACTIVE only for the step the engine would execute
  // next, and only while that step's time gate is unarmed (issue 917). A later step's
  // rail would drive a craft it does not describe — and the engine drops any
  // allocation naming the wrong step — while an armed gate means the inputs were
  // already consumed and the finish path never re-resolves ingredients. Both fields
  // are absent on a pre-917 listing, in which case they compare equal and the rail
  // stays interactive, exactly as today.
  const railReadOnly = $derived(
    selectedRecipe?.activeStepTimeGateArmed === true ||
      (selectedRecipe?.activeStepId ?? null) !== (selectedRecipe?.displayedStepId ?? null)
  );

  const rail = $derived({
    chosenGroupIds: Object.keys(store?.selectedIngredientOptions ?? {}),
    openSlotId: railReadOnly ? null : (store?.openSlotId ?? null),
    readOnly: railReadOnly,
    announcement: store?.slotAnnouncement ?? '',
    onChooseOption,
    onOpenSlot,
    onPickForMe,
    onAllocateEssence,
  });

  // Resolve the per-recipe last roll outcome for the current selection.
  const rollResult = $derived(
    selectedRecipe?.id ? (store?.lastRollResult?.[selectedRecipe.id] ?? null) : null
  );
  const showRunSummary = $derived(Boolean(rollResult) && dismissedRunFor !== selectedRecipe?.id);

  // Shopping-list entries enriched with display name/img from the listing.
  const shoppingEntries = $derived(
    (store?.shoppingEntries ?? []).map((entry) => {
      const recipe = summaries.find((item) => item?.id === entry.recipeId) ?? null;
      return {
        recipeId: entry.recipeId,
        quantity: entry.quantity,
        name: recipe?.name ?? entry.recipeId,
        img: recipe?.img ?? null,
      };
    })
  );

  function onSelect(id) {
    store?.select(id);
  }
  function onSearch(value) {
    store?.setSearch(value);
  }
  function onAddToShoppingList(id) {
    store?.addToShoppingList(id, 1);
  }
  function onToggleFavourite(id) {
    store?.toggleFavourite(id);
  }
  function onToggleFavourites() {
    store?.setFavouritesOnly(!(store?.favouritesOnly === true));
  }
  function onToggleCraftable() {
    store?.setCraftableOnly(!(store?.craftableOnly === true));
  }
  function onSystemChange(systemId) {
    store?.setSystemFilter(systemId);
  }
  function onCategoryChange(category) {
    store?.setCategoryFilter(category);
  }
  function onChoose(setId) {
    store?.chooseIngredientSet(setId);
  }
  function onChooseOption(groupId, choice) {
    store?.chooseIngredientOption(groupId, choice);
  }
  function onOpenSlot(slotId) {
    store?.openSlot(slotId);
  }
  function onAllocateEssence(itemKey, units) {
    store?.setEssenceAllocation(itemKey, units);
  }
  function onPickForMe() {
    // The component owns the i18n and the store owns the state, mirroring the
    // progressive reorder path: the localized sentence is passed IN.
    store?.pickForMe(localize('FABRICATE.App.Crafting.Slots.PickedForYou'));
  }
  function onReorderStage(index, target, announcement) {
    store?.reorderProgressiveStage(index, target, announcement);
  }
  function onReorderStageSettled() {
    void store?.flushProgressiveOrder();
  }
  async function onCraft() {
    if (!selectedRecipe) return;
    // A fresh craft re-opens the run summary for this recipe.
    dismissedRunFor = null;
    await store?.craft(selectedRecipe);
  }
  function onDismissRun() {
    dismissedRunFor = selectedRecipe?.id ?? null;
  }

  // Refetch on mount and whenever the shared actor selection changes. The shared
  // top bar is the single source of truth for the selected character, so persist
  // its selection into the crafting setting (LAST_CRAFTING_ACTOR) BEFORE loading —
  // the listing resolves its crafting actor from that setting, so persist-before-
  // load keeps the browse list pinned to the same actor the bar shows. Re-point the
  // required component source to that actor too so its inventory is included.
  $effect(() => {
    const actorId = actorBar?.selectedActorId ?? null;
    services?.setSelectedCraftingActorId?.(actorId ?? '');
    sourcesStore?.load();
    sourcesStore?.setCraftingActor(actorId);
    store?.load();
  });

  // Scene-linked availability can change when the player navigates scenes.
  $effect(() => subscribeSceneChange(() => store?.load(true)));

  // The GM advancing the clock changes calendar-aware durations / regen windows;
  // bump the store's world-time tick and quietly re-fetch.
  $effect(() =>
    subscribeWorldTime(() => {
      store?.tickWorldTime();
      store?.load(true);
    })
  );
</script>

{#if isLoading}
  <div class="crafting-view-state" data-crafting-state="loading">
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Crafting.Loading')}</p>
  </div>
{:else if isError}
  <div class="crafting-view-state" data-crafting-state="error">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Crafting.Error')}</p>
  </div>
{:else if isNoActor}
  <div class="crafting-view-state" data-crafting-state="no-actor">
    <i class="fas fa-user-slash" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Crafting.NoActor')}</p>
  </div>
{:else if isEmpty}
  <div class="crafting-view-state" data-crafting-state="empty">
    <i class="fas fa-hammer" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Crafting.Empty')}</p>
  </div>
{:else}
  <div class="crafting-view-container">
    <div class="crafting-view-grid" data-crafting-state="populated">
      <div class="crafting-view-column crafting-view-column-left">
        <RecipeBrowser
          recipes={store?.pageItems ?? []}
          search={store?.search ?? ''}
          selectedRecipeId={selectedSummary?.id ?? null}
          totalCount={store?.visibleRecipes?.length ?? 0}
          pageIndex={store?.page ?? 0}
          pageSize={store?.pageSize ?? 12}
          favouritesOnly={store?.favouritesOnly ?? false}
          craftableOnly={store?.craftableOnly ?? false}
          systemFilter={store?.systemFilter ?? null}
          systems={store?.availableSystems ?? []}
          categoryFilter={store?.categoryFilter ?? null}
          categories={store?.availableCategories ?? []}
          favouriteIds={store?.favouriteIds ?? []}
          {onSelect}
          {onSearch}
          {onAddToShoppingList}
          {onToggleFavourite}
          {onToggleFavourites}
          {onToggleCraftable}
          {onSystemChange}
          {onCategoryChange}
          onPageChange={(index) => store?.setPage(index)}
          onPageSizeChange={(size) => store?.setPageSize(size)}
        />
      </div>

      <section class="crafting-view-column crafting-view-column-center" data-crafting-detail>
        <RecipeDetail
          recipe={selectedRecipe}
          {selectedSetId}
          {craftability}
          {rollResult}
          busy={craftInFlight}
          {onChoose}
          {onChooseOption}
          {onCraft}
          {progressiveStages}
          {canReorderStages}
          {stageAnnouncement}
          {onReorderStage}
          {onReorderStageSettled}
          steps={selectedRecipe?.steps ?? []}
          {rail}
          activeStepId={selectedRecipe?.activeStepId ?? null}
        />
      </section>

      <section class="crafting-view-column crafting-view-column-right" data-crafting-right>
        {#if showRunSummary}
          <RunSummaryPanel
            recipe={selectedRecipe}
            {rollResult}
            canCraft={craftability?.canCraft === true}
            busy={craftInFlight}
            onCraftNext={onCraft}
            onDismiss={onDismissRun}
          />
        {:else}
          <ShoppingList
            aggregate={store?.shoppingAggregate ?? null}
            entries={shoppingEntries}
            onIncrement={(id) => store?.addToShoppingList(id, 1)}
            onDecrement={(id) => store?.decrementShoppingList(id)}
            onRemove={(id) => store?.removeFromShoppingList(id)}
            onClear={() => store?.clearShoppingList()}
          />
        {/if}
      </section>
    </div>
  </div>
{/if}

<style>
  /* The grid wrapper is the size container so columns reflow against the Fabricate
     window width (the app docks/resizes at any width), matching the gathering
     view's parent-container pattern. */
  .crafting-view-container {
    container-type: inline-size;
    container-name: fabricate-crafting;
    height: 100%;
    min-height: 0;
  }

  .crafting-view-grid {
    display: grid;
    /* The centre column carries the denser minimum so it scales down with the side
       columns instead of collapsing first; below the breakpoint the three columns
       reflow into a single vertical stack. */
    grid-template-columns: minmax(280px, 1fr) minmax(280px, 1.5fr) minmax(280px, 1fr);
    gap: var(--fab-space-4);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  /* At the supported 1024px window floor this container's content box is roughly
     938px wide, so the shared 960px boundary is deliberately reachable. */
  @container fabricate-crafting (max-width: 960px) {
    .crafting-view-grid {
      grid-template-columns: 1fr;
      grid-auto-rows: minmax(min-content, max-content);
      height: auto;
      min-height: 100%;
      overflow-y: auto;
    }

    .crafting-view-column {
      min-height: 220px;
    }
  }

  .crafting-view-column {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .crafting-view-column-center,
  .crafting-view-column-right {
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    overflow: hidden;
  }

  .crafting-view-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--fab-text-muted);
    background: var(--fab-surface);
  }

  .crafting-view-state i {
    font-size: 32px;
  }

  .crafting-view-state p {
    margin: 0;
    font-size: 14px;
  }
</style>
