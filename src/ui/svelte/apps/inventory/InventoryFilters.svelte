<!-- Svelte 5 runes mode -->
<!--
  InventoryFilters is the left-column header: a search box, a row of filter chips
  (All / Components / Essences / Tools / Books & Scrolls — this fixed order, each
  with an icon and a live count), and a sort select (Name / Quantity / Type).
  Prop-driven so it stays presentational; callbacks route back to the inventory
  store. The search + chip markup mirrors the Crafting browser so the two tabs
  feel identical.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    search = '',
    filter = 'all',
    sort = 'name',
    counts = {},
    onSearch = null,
    onFilter = null,
    onSort = null
  } = $props();

  const PILLS = [
    { id: 'all', labelKey: 'FABRICATE.App.Inventory.Filters.All', icon: 'fa-layer-group' },
    { id: 'components', labelKey: 'FABRICATE.App.Inventory.Filters.Components', icon: 'fa-cube' },
    { id: 'essences', labelKey: 'FABRICATE.App.Inventory.Filters.Essences', icon: 'fa-droplet' },
    { id: 'tools', labelKey: 'FABRICATE.App.Inventory.Filters.Tools', icon: 'fa-screwdriver-wrench' },
    { id: 'recipeItems', labelKey: 'FABRICATE.App.Inventory.Filters.RecipeItems', icon: 'fa-book' }
  ];

  const SORTS = [
    { id: 'name', labelKey: 'FABRICATE.App.Inventory.Filters.SortName' },
    { id: 'quantity', labelKey: 'FABRICATE.App.Inventory.Filters.SortQuantity' },
    { id: 'type', labelKey: 'FABRICATE.App.Inventory.Filters.SortType' }
  ];

  function onInput(event) {
    onSearch?.(event.currentTarget.value);
  }
  function onSortInput(event) {
    onSort?.(event.currentTarget.value);
  }
</script>

<div class="inventory-filters" data-inventory-filters>
  <div class="inventory-search">
    <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
    <input
      type="text"
      value={search}
      placeholder={localize('FABRICATE.App.Inventory.Filters.SearchPlaceholder')}
      aria-label={localize('FABRICATE.App.Inventory.Filters.SearchLabel')}
      oninput={onInput}
    />
  </div>

  <div class="inventory-filters-row">
    <div class="inventory-pills" role="group" aria-label={localize('FABRICATE.App.Inventory.Filters.SearchLabel')}>
      {#each PILLS as pill (pill.id)}
        <button
          type="button"
          class="inventory-pill"
          class:is-active={filter === pill.id}
          data-inventory-pill={pill.id}
          aria-pressed={filter === pill.id}
          onclick={() => onFilter?.(pill.id)}
        >
          <i class={`fas ${pill.icon}`} aria-hidden="true"></i>
          <span>{localize(pill.labelKey)}</span>
          <span class="inventory-pill-count" data-inventory-pill-count>{Number(counts?.[pill.id] ?? 0)}</span>
        </button>
      {/each}
    </div>

    <label class="inventory-sort">
      <span class="inventory-sort-label">{localize('FABRICATE.App.Inventory.Filters.SortLabel')}</span>
      <select value={sort} aria-label={localize('FABRICATE.App.Inventory.Filters.SortLabel')} onchange={onSortInput}>
        {#each SORTS as option (option.id)}
          <option value={option.id}>{localize(option.labelKey)}</option>
        {/each}
      </select>
    </label>
  </div>
</div>

<style>
  .inventory-filters {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .inventory-search {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
  }

  .inventory-search input {
    flex: 1 1 auto;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--fab-text);
    font-size: 13px;
  }

  .inventory-search input:focus-visible {
    outline: none;
  }

  .inventory-filters-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .inventory-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }

  .inventory-pill {
    box-sizing: border-box;
    /* Foundry's global `.app button` height/centering reset (EnvironmentCard pattern):
       a chip that sets only min-height gets cropped. */
    appearance: none;
    -webkit-appearance: none;
    height: auto;
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 3px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font: inherit;
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
  }

  .inventory-pill:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .inventory-pill:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-pill.is-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-weight: 600;
  }

  .inventory-pill i {
    font-size: 11px;
  }

  /* Counts read as data, so they take the mono family (brief §2). */
  .inventory-pill-count {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-muted);
  }

  .inventory-pill.is-active .inventory-pill-count {
    color: var(--fab-accent);
  }

  .inventory-sort {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  .inventory-sort-label {
    font-size: 11px;
    color: var(--fab-text-muted);
    white-space: nowrap;
  }

  .inventory-sort select {
    box-sizing: border-box;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 500;
  }

  .inventory-sort select:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
