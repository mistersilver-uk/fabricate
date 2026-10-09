<!-- Svelte 5 runes mode -->
<!--
  RecipeBrowser is the left column: a search box and a paginated,
  status-badged list of recipes. It is prop-driven (the store state is
  threaded in by CraftingView) so it stays presentational and independently
  testable. The search and the pager are the shared primitives, each painting itself.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import SearchField from '../../components/SearchField.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import Select from '../../components/Select.svelte';
  import RecipeListRow from './RecipeListRow.svelte';

  let {
    recipes = [],
    search = '',
    selectedRecipeId = null,
    totalCount = 0,
    pageIndex = 0,
    pageSize = 12,
    favouritesOnly = false,
    craftableOnly = false,
    systemFilter = null,
    systems = [],
    categoryFilter = null,
    categories = [],
    favouriteIds = [],
    onSelect = null,
    onSearch = null,
    onAddToShoppingList = null,
    onToggleFavourite = null,
    onToggleFavourites = null,
    onToggleCraftable = null,
    onSystemChange = null,
    onCategoryChange = null,
    onPageChange = null,
    onPageSizeChange = null,
  } = $props();

  const hasResults = $derived(Array.isArray(recipes) && recipes.length > 0);
  const isSearching = $derived(String(search ?? '').trim() !== '');
  // Any active filter (search or the three controls) switches the empty state to
  // the "no matches" copy rather than the "no recipes at all" copy.
  const isFiltering = $derived(
    isSearching ||
      favouritesOnly === true ||
      craftableOnly === true ||
      Boolean(systemFilter) ||
      Boolean(categoryFilter)
  );
  const favouriteSet = $derived(new Set(Array.isArray(favouriteIds) ? favouriteIds : []));

  // THE TWO FILTERS' CAPTION IDS, per instance. `$props.id()` is what keeps two browsers on one
  // screen from pointing both of their triggers at the same caption.
  const instanceId = $props.id();
  const categoryCaptionId = `${instanceId}-category-filter`;
  const systemCaptionId = `${instanceId}-system-filter`;

  /**
   * THE PANEL'S CEILING FOR A FULL-WIDTH TRIGGER (issue 1511).
   *
   * The `inline` rung's own band tops out at 240px and this trigger spans the browse column, so
   * without a ceiling of its own each filter would drop a list narrower than the control it drops
   * from - the defect `Select.svelte`'s band table records. The layout resolves
   * `clamp(max(triggerWidth, minWidth), minWidth, maxWidth)` and is bounded again by the overlay
   * host's own width, so a generous ceiling costs nothing: the panel still tracks the trigger.
   *
   * ONE FIGURE FOR THE WIDEST REACHABLE TRIGGER, measured rather than guessed. The browse column
   * is `minmax(280px, 1fr)` of a 1fr/1.5fr/1fr grid that reflows to a single column at the
   * container's 960px breakpoint, so the two ends of the range are 280px at the column minimum
   * and 906px in the reflowed single column at the supported 1024px window floor. Past the
   * breakpoint a `1fr` column keeps growing with the window - a maximised ultra-wide frame puts
   * a 3376px container's left column at 946px - so the ceiling is set above BOTH rather than at
   * either, which is why it is one generous number and not a breakpoint-shaped pair.
   *
   * AND NO FLOOR, WHICH REVIEW ROUND 1 MADE WORTH SAYING. `Select.svelte`'s band docblock states
   * when an `inline` caller owes its panel a `minWidth`: when the widest option label needs more
   * than the panel's resolved width less the row's chrome. These two are the two call sites of
   * the six that cannot owe one, because their trigger spans the browse column and the panel
   * resolves from the trigger - at the 280px column minimum a ticked row still leaves 228px for a
   * category or system name, against the 44px the inventory sort had. The sibling sorts each
   * needed a floor and the participation selector needed a whole band.
   */
  const FILTER_PANEL_MAX_WIDTH = 1024;

  const categoryOptions = $derived([
    { value: '', label: localize('FABRICATE.App.Crafting.Browser.AllCategories') },
    ...categories.map((category) => ({ value: category.id, label: category.name })),
  ]);
  const systemOptions = $derived([
    { value: '', label: localize('FABRICATE.App.Crafting.Browser.AllSystems') },
    ...systems.map((system) => ({ value: system.id, label: system.name })),
  ]);

  // The sentinel row hands back `''` exactly as the `<option value="">` it replaces did, so the
  // null-for-unfiltered contract the store reads is unchanged by the conversion.
  function chooseSystem(next) {
    onSystemChange?.(next === '' ? null : next);
  }
  function chooseCategory(next) {
    onCategoryChange?.(next === '' ? null : next);
  }
</script>

<section class="crafting-browser" data-crafting-browser>
  <header class="crafting-browser-header">
    <p class="crafting-browser-title">{localize('FABRICATE.App.Crafting.Browser.Title')}</p>
    <SearchField
      class="crafting-browser-search"
      value={search}
      onChange={(value) => onSearch?.(value)}
      placeholder={localize('FABRICATE.App.Crafting.Browser.SearchPlaceholder')}
      ariaLabel={localize('FABRICATE.App.Crafting.Browser.SearchLabel')}
    />

    <div class="crafting-browser-filters" data-crafting-filters>
      <div class="crafting-browser-filter-toggles">
        <button
          type="button"
          class="crafting-browser-toggle"
          class:is-active={favouritesOnly}
          data-filter="favourites"
          aria-pressed={favouritesOnly}
          onclick={() => onToggleFavourites?.()}
        >
          <i class="fas fa-star" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Crafting.Browser.FavouritesOnly')}</span>
        </button>
        <button
          type="button"
          class="crafting-browser-toggle"
          class:is-active={craftableOnly}
          data-filter="craftable"
          aria-pressed={craftableOnly}
          onclick={() => onToggleCraftable?.()}
        >
          <i class="fas fa-hammer" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Crafting.Browser.CraftableOnly')}</span>
        </button>
      </div>
      {#if categories.length > 0}
        <!-- A `<span>` RATHER THAN THE `<label>` THIS WAS (issue 1511). The wrapper keeps its
             class and its column layout; what it stops being is a click target. A `<label>`
             forwards a caption click into the control it wraps, and the control is now a
             `<button>` toggling a portaled panel whose outside-click dismissal listens on
             `mousedown` while it is open - so with the list open the caption's own mousedown
             dismisses it and the forwarded click re-opens it, and the caption could never close
             the list. The trigger is named by that caption through `aria-labelledby`, which is
             what names the panel it opens as well. -->
        <span class="crafting-browser-filter-category">
          <span class="crafting-browser-filter-label" id={categoryCaptionId}
            >{localize('FABRICATE.App.Crafting.Browser.CategoryFilterLabel')}</span
          >
          <Select
            size="inline"
            value={categoryFilter ?? ''}
            options={categoryOptions}
            ariaLabelledBy={categoryCaptionId}
            maxWidth={FILTER_PANEL_MAX_WIDTH}
            triggerProps={{ 'data-crafting-category-filter': '' }}
            onChange={chooseCategory}
          />
        </span>
      {/if}
      {#if systems.length > 0}
        <span class="crafting-browser-filter-system">
          <span class="crafting-browser-filter-label" id={systemCaptionId}
            >{localize('FABRICATE.App.Crafting.Browser.SystemFilterLabel')}</span
          >
          <Select
            size="inline"
            value={systemFilter ?? ''}
            options={systemOptions}
            ariaLabelledBy={systemCaptionId}
            maxWidth={FILTER_PANEL_MAX_WIDTH}
            triggerProps={{ 'data-crafting-system-filter': '' }}
            onChange={chooseSystem}
          />
        </span>
      {/if}
    </div>
  </header>

  {#if hasResults}
    <div class="crafting-browser-list" role="list">
      {#each recipes as recipe (recipe.id)}
        <RecipeListRow
          {recipe}
          selected={recipe.id === selectedRecipeId}
          favourite={favouriteSet.has(recipe.id)}
          {onSelect}
          {onAddToShoppingList}
          {onToggleFavourite}
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
    <!-- HAND-ROLLED, AND DEFERRED RATHER THAN CONVERTED (issue 1514). Four of this tab's
         one-line empties are `EmptyState note` now. This one is not, and the reason is a
         property of that variant rather than of this site: `note` declares
         `place-items: start` and `text-align: left` on ITSELF, so a caller cannot restore a
         centred line through a wrapper. ATTEMPTED AND MEASURED, not predicted: in the View Lab
         at the default window this sentence is a full-width centred 13px line 48.25px tall
         standing in for the whole 322.84px recipe column, and routed through `note` it became a
         125.27px left-aligned 10px line 26px tall in the top-left corner of it. `filtered`
         centres but keeps the dashed panel, which is the box the frame-move rule forbids. So it
         goes to the geometry-and-gaps register with the measurement, and a centred one-line
         form is what would close it. It is the same refusal `InventoryGrid` took one phase
         earlier at the same rendered shape, and it carries its filtered/zero distinction the
         same way — in the TEXT, through the ternary below, not in a variant on the box. -->
    <p class="crafting-browser-empty" data-crafting-browser-empty>
      {isFiltering
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

  /* The field's family basis is a toolbar width, which in this column would be its height. */
  .crafting-browser-header > :global(.crafting-browser-search) {
    flex: none;
    min-width: 0;
  }

  /* Filters: the two toggles share a row; the system dropdown sits on its own line. */
  .crafting-browser-filters {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .crafting-browser-filter-toggles {
    display: flex;
    gap: 8px;
  }

  .crafting-browser-toggle {
    flex: 1 1 0;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 30px;
    padding: 4px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .crafting-browser-toggle:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-browser-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-browser-toggle.is-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .crafting-browser-filter-system,
  .crafting-browser-filter-category {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .crafting-browser-filter-label {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  /* The filter triggers' width and fill are this column's (issue 1511): a `<button>` trigger hugs
     its value, so it spans the column, and keeps `--fab-surface` rather than the rung's fill.
     Ancestor-qualified, so the pager's own trigger is not reached. */
  .crafting-browser-filter-category :global(.fabricate-select-trigger),
  .crafting-browser-filter-system :global(.fabricate-select-trigger) {
    width: 100%;
    background: var(--fab-surface);
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
</style>
