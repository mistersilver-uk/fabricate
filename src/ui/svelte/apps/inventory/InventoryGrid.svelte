<!-- Svelte 5 runes mode -->
<!--
  InventoryGrid is the left-column body: a responsive grid of InventoryItemCards
  with a paginated footer (reusing the shared Pagination component, re-themed for
  the player app exactly as the Crafting browser does). Prop-driven so it stays
  presentational; selection + paging route back to the inventory store.

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
    gap: 12px;
    align-content: start;
    overflow-y: auto;
    padding-right: 2px;
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
     or Pagination's own `:global` flex layout. */
  .inventory-grid-bulk-hint {
    flex: 0 0 auto;
    margin: 0;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .inventory-grid-pagination {
    flex: 0 0 auto;
  }

  /*
    Pagination.svelte renders .manager-pagination* markup that is
    .fabricate-manager-scoped in the GM app and therefore UNSTYLED in the player
    app. Theme it here with base --fab-* tokens as a single compact inline row,
    matching the Crafting browser's pagination treatment.
  */
  .inventory-grid-pagination :global(.manager-pagination) {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) 0 0;
    border-top: 1px solid var(--fab-border);
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .inventory-grid-pagination :global(.manager-pagination-summary) {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inventory-grid-pagination :global(.manager-pagination-nav) {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .inventory-grid-pagination :global(.manager-pagination-page) {
    color: var(--fab-text);
    white-space: nowrap;
  }

  .inventory-grid-pagination :global(.manager-pagination-size) {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
    white-space: nowrap;
  }

  .inventory-grid-pagination :global(.manager-pagination-size select) {
    height: 26px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  .inventory-grid-pagination :global(.manager-icon-button) {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
  }

  .inventory-grid-pagination :global(.manager-icon-button:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  .inventory-grid-pagination :global(.manager-icon-button:hover:not(:disabled)) {
    background: var(--fab-surface-raised);
  }
</style>
