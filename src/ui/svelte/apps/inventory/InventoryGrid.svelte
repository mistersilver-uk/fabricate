<!-- Svelte 5 runes mode -->
<!--
  InventoryGrid is the left-column body: a responsive grid of InventoryItemCards
  with a paginated footer (reusing the shared Pagination component, re-themed for
  the player app exactly as the Crafting browser does). Prop-driven so it stays
  presentational; selection + paging route back to the inventory store.
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
    onSelect = null,
    onPageChange = null,
    onPageSizeChange = null
  } = $props();

  const hasResults = $derived(Array.isArray(items) && items.length > 0);
</script>

<div class="inventory-grid-wrap" data-inventory-grid>
  {#if hasResults}
    <div class="inventory-grid" role="list">
      {#each items as item (item.key)}
        <InventoryItemCard {item} selected={item.key === selectedKey} {onSelect} />
      {/each}
    </div>
    <div class="inventory-grid-pagination">
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
    gap: 10px;
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
