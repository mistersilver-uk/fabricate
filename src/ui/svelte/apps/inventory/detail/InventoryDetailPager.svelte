<!-- Svelte 5 runes mode -->
<!--
  InventoryDetailPager is the compact per-section pager the component inspector
  puts under each of its independently paginated lists (sources, essence
  contributors, used-by, required-for, produced-by): prev/next buttons around an
  "x–y / total" range readout.

  Purely presentational — the page index lives in the parent (one per section id,
  reset when the selected item changes), so this component renders nothing at all
  when the list fits on a single page.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { list = [], sectionKey = '', page = 0, pageSize = 6, onPage = null } = $props();

  const total = $derived(Array.isArray(list) ? list.length : 0);
  const count = $derived(Math.max(1, Math.ceil(total / (pageSize > 0 ? pageSize : 1))));
  const current = $derived(Math.min(Math.max(0, page), count - 1));
</script>

{#if total > pageSize}
  <div class="inventory-detail-pager" data-inventory-pager={sectionKey}>
    <button
      type="button"
      class="inventory-detail-pager-btn"
      disabled={current === 0}
      aria-label={localize('FABRICATE.App.Inventory.Detail.PagePrevious')}
      onclick={() => onPage?.(current - 1)}
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>
    <span class="inventory-detail-pager-range" data-inventory-pager-range>
      {current * pageSize + 1}–{Math.min((current + 1) * pageSize, total)} / {total}
    </span>
    <button
      type="button"
      class="inventory-detail-pager-btn"
      disabled={current >= count - 1}
      aria-label={localize('FABRICATE.App.Inventory.Detail.PageNext')}
      onclick={() => onPage?.(current + 1)}
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </div>
{/if}

<style>
  /* Compact per-section pager: prev/next + an "x–y / total" range readout. */
  .inventory-detail-pager {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 2px;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .inventory-detail-pager-range {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .inventory-detail-pager-btn {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
  }

  .inventory-detail-pager-btn:hover:not(:disabled) {
    background: var(--fab-surface-raised);
  }

  .inventory-detail-pager-btn:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-pager-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
