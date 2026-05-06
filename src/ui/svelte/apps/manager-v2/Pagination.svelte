<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    totalCount = 0,
    pageSize = 10,
    pageIndex = 0,
    pageSizeOptions = [10, 25, 50],
    onPageChange = () => {},
    onPageSizeChange = () => {}
  } = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize))));
  const firstShown = $derived(totalCount === 0 ? 0 : pageIndex * pageSize + 1);
  const lastShown = $derived(Math.min((pageIndex + 1) * pageSize, totalCount));
  const showPagination = $derived(totalCount > pageSize);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function goToPage(index) {
    const next = Math.max(0, Math.min(totalPages - 1, index));
    if (next !== pageIndex) onPageChange(next);
  }

  function changePageSize(value) {
    const next = Number(value);
    if (Number.isFinite(next) && next > 0 && next !== pageSize) onPageSizeChange(next);
  }
</script>

{#if showPagination}
  <section class="manager-v2-pagination" aria-label={text('FABRICATE.Admin.ManagerV2.Pagination.Label', 'Pagination')}>
    <span class="manager-v2-pagination-summary" data-pagination-summary>
      {text('FABRICATE.Admin.ManagerV2.Pagination.Range', 'Showing {first}–{last} of {total}')
        .replace('{first}', firstShown)
        .replace('{last}', lastShown)
        .replace('{total}', totalCount)}
    </span>
    <nav class="manager-v2-pagination-nav" aria-label={text('FABRICATE.Admin.ManagerV2.Pagination.Navigation', 'Page navigation')}>
      <button
        type="button"
        class="manager-v2-icon-button"
        data-pagination-prev
        aria-label={text('FABRICATE.Admin.ManagerV2.Pagination.Previous', 'Previous page')}
        disabled={pageIndex === 0}
        onclick={() => goToPage(pageIndex - 1)}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="manager-v2-pagination-page" data-pagination-page>
        {text('FABRICATE.Admin.ManagerV2.Pagination.PageOf', 'Page {page} of {total}')
          .replace('{page}', pageIndex + 1)
          .replace('{total}', totalPages)}
      </span>
      <button
        type="button"
        class="manager-v2-icon-button"
        data-pagination-next
        aria-label={text('FABRICATE.Admin.ManagerV2.Pagination.Next', 'Next page')}
        disabled={pageIndex >= totalPages - 1}
        onclick={() => goToPage(pageIndex + 1)}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </nav>
    <label class="manager-v2-pagination-size">
      <span>{text('FABRICATE.Admin.ManagerV2.Pagination.PerPage', 'Per page')}</span>
      <select
        value={pageSize}
        data-pagination-size
        aria-label={text('FABRICATE.Admin.ManagerV2.Pagination.PerPageLabel', 'Rows per page')}
        onchange={(event) => changePageSize(event.currentTarget.value)}
      >
        {#each pageSizeOptions as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>
  </section>
{/if}
