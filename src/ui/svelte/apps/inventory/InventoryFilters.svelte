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
  markup below for the two props that reproduce its construction and its paint.

  THE SORT CONTROL IS THE SHARED `Select` (issue 1511), so the list it opens is the app's own
  rather than the operating system's. The search field is still NOT converted: it belongs to the
  controls issue.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Select from '../../components/Select.svelte';
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

  // The caption this control is named by, per instance: the inventory header can be rendered
  // twice on one screen by the GM preview, and two triggers must not share one caption id.
  const instanceId = $props.id();
  const sortCaptionId = `${instanceId}-sort`;

  const sortOptions = $derived(
    SORTS.map((option) => ({ value: option.id, label: localize(option.labelKey) }))
  );

  function onInput(event) {
    onSearch?.(event.currentTarget.value);
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

    <!-- A `<span>` RATHER THAN THE `<label>` THIS WAS (issue 1511): the control is a `<button>`
         toggling a portaled panel, and a `<label>` forwards a caption click into it, so with the
         list open the caption's own mousedown would dismiss the panel and the forwarded click
         would re-open it. The caption keeps its class and names the trigger through
         `aria-labelledby` instead of through the deleted `aria-label` that duplicated it. -->
    <span class="inventory-sort">
      <span class="inventory-sort-label" id={sortCaptionId}
        >{localize('FABRICATE.App.Inventory.Filters.SortLabel')}</span
      >
      <Select
        size="inline"
        value={sort}
        options={sortOptions}
        ariaLabelledBy={sortCaptionId}
        triggerData={{ 'data-inventory-sort': '' }}
        onChange={(next) => onSort?.(next)}
      />
    </span>
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

  /* A WIDTH FLOOR, AND WHY THIS ROW CAN ABSORB ONE (issue 1511). Height, corner, fill, type and
     the focus treatment are the `inline` rung's now; the one property left to this file is the
     width, because a `<select>` sized itself to its widest option while a `<button>` hugs the
     one it is showing - so choosing Type after Quantity would visibly shrink the control and
     shuffle the pill run beside it. The floor is the measured width of the widest of the three
     `SORTS` labels - `Quantity` - so every value renders at one width. MEASURED IN BOTH FACES
     and floored at the wider: 86.58px under Foundry's own Signika at the `inline` rung's 11.5px,
     88.33px under the Arial fallback the repository's Chromium gates render against.

     The row is `flex-wrap: wrap` with `justify-content: space-between`, which is what makes an
     over-sized floor wrap the pill run rather than widen the control - so the figure is the
     measured widest label and not a round number above it. Ancestor-qualified, because a leading
     bare `:global()` would reach every trigger in the document. */
  .inventory-sort :global(.fabricate-select-trigger) {
    min-width: 90px;
  }
</style>
