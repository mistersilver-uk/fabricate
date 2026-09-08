<!-- Svelte 5 runes mode -->
<!--
  InventoryFilters is the left-column header: a search box, the kind filter
  (All / Components / Essences / Tools / Books & Scrolls — this fixed order, each
  with an icon and a live count), and a sort select (Name / Quantity / Type).
  Prop-driven so it stays presentational; callbacks route back to the inventory
  store.

  THE KIND FILTER IS THE SHARED `SegmentedControl` (issue 1514), drawn as a pill run
  in the soft-accent family. It was five `aria-pressed` buttons in a `role="group"`
  and is now one radiogroup, which is the semantics a one-of-N choice has; see the
  markup below for the two props that reproduce its construction and its paint. The
  search field and the sort select are NOT converted here: they belong to the controls issue
  and the player-selects issue respectively.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import SegmentedControl from '../manager/SegmentedControl.svelte';

  let {
    search = '',
    filter = 'all',
    sort = 'name',
    counts = {},
    onSearch = null,
    onFilter = null,
    onSort = null,
  } = $props();

  // The fixed kind order, as `SegmentedControl` takes it: `value` rather than `id`, and a
  // WHOLE Font Awesome class rather than the bare glyph name, because the primitive renders
  // `class={option.icon}` verbatim where the hand-rolled markup composed `fas ${pill.icon}`.
  const PILLS = [
    { value: 'all', labelKey: 'FABRICATE.App.Inventory.Filters.All', icon: 'fas fa-layer-group' },
    {
      value: 'components',
      labelKey: 'FABRICATE.App.Inventory.Filters.Components',
      icon: 'fas fa-cube',
    },
    {
      value: 'essences',
      labelKey: 'FABRICATE.App.Inventory.Filters.Essences',
      icon: 'fas fa-droplet',
    },
    {
      value: 'tools',
      labelKey: 'FABRICATE.App.Inventory.Filters.Tools',
      icon: 'fas fa-screwdriver-wrench',
    },
    {
      value: 'recipeItems',
      labelKey: 'FABRICATE.App.Inventory.Filters.RecipeItems',
      icon: 'fas fa-book',
    },
  ];

  const SORTS = [
    { id: 'name', labelKey: 'FABRICATE.App.Inventory.Filters.SortName' },
    { id: 'quantity', labelKey: 'FABRICATE.App.Inventory.Filters.SortQuantity' },
    { id: 'type', labelKey: 'FABRICATE.App.Inventory.Filters.SortType' },
  ];

  // The live per-kind tally rides the primitive's own `count` slot. It is coerced here rather
  // than in the markup because `SegmentedControl` renders the slot only for a FINITE number, so
  // a missing key has to arrive as 0 rather than as `undefined`.
  const pillOptions = $derived(
    PILLS.map((pill) => ({ ...pill, count: Number(counts?.[pill.value] ?? 0) }))
  );

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
    <!-- THE KIND FILTER IS A RADIOGROUP, not five toggles (issue 1514). Choosing a kind is a
         genuinely one-of-N choice and the hand-rolled strip spelled it as five independent
         `aria-pressed` buttons in a `role="group"`, which announces each one's state on its
         own and never says the set is exclusive. `shape="pill"` is the construction the strip
         already had — a run of separate pills, no track fill, no track edge, radius 999 — and
         `tone="accent-soft"` is the paint it already had, an unfilled resting tile behind a
         `--fab-border` hairline against a chosen one on `--fab-accent-soft` inside
         `--fab-accent-border` in `--fab-accent` ink. Both are the shipped values rather than a
         near miss, which is why this converts as a frame move rather than a restyle.

         `aria-label` is the SearchLabel string the `role="group"` carried, forwarded verbatim
         rather than corrected: the label a screen reader announces here is not this change's
         to move. -->
    <SegmentedControl
      options={pillOptions}
      value={filter}
      onChange={(next) => onFilter?.(next)}
      groupName="inventory-filter-kind"
      ariaLabel={localize('FABRICATE.App.Inventory.Filters.SearchLabel')}
      optionDataAttr="data-inventory-pill"
      shape="pill"
      tone="accent-soft"
    />

    <label class="inventory-sort">
      <span class="inventory-sort-label"
        >{localize('FABRICATE.App.Inventory.Filters.SortLabel')}</span
      >
      <select
        value={sort}
        aria-label={localize('FABRICATE.App.Inventory.Filters.SortLabel')}
        onchange={onSortInput}
      >
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
