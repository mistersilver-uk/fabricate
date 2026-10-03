<!-- Svelte 5 runes mode -->
<!--
  The per-section pager the inventory inspector puts under each independently paginated list: the
  shared `Pagination` with no page-size choice, drawn only when the list overflows one page.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `list` / `pageSize` / `page` | array / number / number | `[]` / `6` / `0` | The whole list, the window size and the caller-owned page index. |
  | `sectionKey` | string | `''` | The wrapper's `data-inventory-pager` value, which tells the inspector's pagers apart. |
  | `ariaLabel` | resolved string | `''` | The section title, naming the pager's region and nav landmarks. |

  Callbacks:
  - `onPage(index)` — a page was chosen; the caller stores it.
-->
<script>
  import Pagination from '../../../components/Pagination.svelte';

  let {
    list = [],
    sectionKey = '',
    page = 0,
    pageSize = 6,
    ariaLabel = '',
    onPage = null,
  } = $props();

  const total = $derived(Array.isArray(list) ? list.length : 0);
  const lastPage = $derived(Math.max(0, Math.ceil(total / (pageSize > 0 ? pageSize : 1)) - 1));
</script>

{#if total > pageSize}
  <div class="inventory-detail-pager" data-inventory-pager={sectionKey}>
    <Pagination
      totalCount={total}
      {pageSize}
      pageIndex={Math.min(Math.max(0, page), lastPage)}
      persistent
      showPageSize={false}
      density="compact"
      {ariaLabel}
      navLabel={ariaLabel}
      onPageChange={(index) => onPage?.(index)}
    />
  </div>
{/if}
