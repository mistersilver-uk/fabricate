<!-- Svelte 5 runes mode -->
<!--
  InventoryGrid is the left-column body: a responsive grid of InventoryItemCards
  with a paginated footer (the shared Pagination, which paints itself). Prop-driven
  so it stays presentational; selection + paging route back to the inventory store.

  Bulk selection (issue 859) is also prop-driven: `bulkSelectedKeys` is the store's
  selection, and this component derives `bulkSet` / `bulkActive` from it rather
  than owning any selection state itself. While bulk is active the single-selection
  fill is SUPPRESSED (`selected={!bulkActive && …}`) so the grid reads as one
  coherent multi-selection rather than two competing highlights.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import InventoryItemCard from './InventoryItemCard.svelte';

  let {
    items = [],
    selectedKey = null,
    totalCount = 0,
    pageIndex = 0,
    pageSize = 12,
    filtering = false,
    bulkSelectedKeys = [],
    onSelect = null,
    onPageChange = null,
    onPageSizeChange = null,
    onBulkToggle = null,
    onBulkClear = null,
  } = $props();

  const hasResults = $derived(Array.isArray(items) && items.length > 0);
  const bulkSet = $derived(new Set(Array.isArray(bulkSelectedKeys) ? bulkSelectedKeys : []));
  const bulkActive = $derived(bulkSet.size > 0);

  // Escape clears the selection, armed only while bulk is active. A document-level
  // capturing listener (the same pattern `dismissOnOutsideClick.js` uses) catches
  // it regardless of which control has focus — the card grid, the pagination, the
  // search field — rather than requiring focus to sit inside one particular
  // element, and `stopPropagation` keeps it from also closing an ancestor surface.
  // Without this, a keyboard-only player could exit bulk mode only by tabbing all
  // the way across the grid and pagination into the other column.
  $effect(() => {
    if (!bulkActive) return;
    function handleEscape(event) {
      // A modal on top, such as the bulk roll prompt, owns its own Escape.
      if (event.target?.closest?.('[aria-modal="true"]')) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onBulkClear?.();
    }
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  });
</script>

<div class="inventory-grid-wrap" data-inventory-grid>
  {#if hasResults}
    <div class="inventory-grid" role="list">
      {#each items as item (item.key)}
        <InventoryItemCard
          {item}
          selected={!bulkActive && item.key === selectedKey}
          bulkSelected={bulkSet.has(item.key)}
          {bulkActive}
          {onSelect}
          {onBulkToggle}
        />
      {/each}
    </div>
    <p class="inventory-grid-bulk-hint" data-inventory-grid-bulk-hint>
      {localize('FABRICATE.App.Inventory.Bulk.GridHint')}
    </p>
    <div class="inventory-grid-pagination">
      <Pagination
        {totalCount}
        {pageSize}
        {pageIndex}
        pageSizeOptions={[25, 50, 75]}
        persistent
        onPageChange={(index) => onPageChange?.(index)}
        onPageSizeChange={(size) => onPageSizeChange?.(size)}
      />
    </div>
  {:else}
    <!-- HAND-ROLLED, AND DEFERRED RATHER THAN CONVERTED (issue 1514). Every other one-line
         empty in this tab is `EmptyState note` now. This one is not, and the reason is a
         property of that variant rather than of this site: `note` declares
         `place-items: start` and `text-align: left` on ITSELF, so a caller cannot restore a
         centred line through a wrapper — an inherited alignment loses to the variant's own
         declaration. Measured in the View Lab at the default window: this sentence is a
         full-width centred line 48.25px tall standing in for the whole 630px card grid, and
         under `note` it became a 146.55px line 26px tall in the top-left corner of that
         column. `filtered` centres but keeps the dashed panel, which is the box the frame-move
         rule forbids. So it goes to the geometry-and-gaps register with the measurement, and
         a centred one-line form is what would close it. -->
    <p class="inventory-grid-empty" data-inventory-grid-empty>
      {filtering
        ? localize('FABRICATE.App.Inventory.NoMatches')
        : localize('FABRICATE.App.Inventory.Empty')}
    </p>
  {/if}
</div>

<style>
  .inventory-grid-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    flex: 1 1 auto;
    min-height: 0;
  }

  .inventory-grid {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--fab-space-3);
    align-content: start;
    overflow-y: auto;
    padding-right: var(--fab-space-2xs);
  }

  .inventory-grid-empty {
    margin: 0;
    padding: var(--fab-space-4);
    text-align: center;
    font-size: 13px;
    color: var(--fab-text-muted);
  }

  /* Its own element between the grid and the pagination (issue 859) — not nested
     inside either — so it cannot fight `.inventory-grid`'s scroll/overflow rules
     or the pager's own flex layout. */
  .inventory-grid-bulk-hint {
    flex: 0 0 auto;
    margin: 0;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .inventory-grid-pagination {
    flex: 0 0 auto;
  }
</style>
