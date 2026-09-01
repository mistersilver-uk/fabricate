<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import IconButton from './IconButton.svelte';

  let {
    totalCount = 0,
    pageSize = 10,
    pageIndex = 0,
    pageSizeOptions = [10, 25, 50],
    onPageChange = () => {},
    onPageSizeChange = () => {},
    // Issue 675, opt-in and DEFAULT OFF so every manager surface renders unchanged.
    // The player Inventory's grid is a browse surface whose footer is part of its
    // frame: it states the size of what you are looking at ("Showing 1–18 of 18"),
    // which is information a player wants BEFORE there is enough to page, and a footer
    // that appears only past a threshold reads as a layout glitch rather than a
    // control. Under it the summary and the per-page selector are always present, and
    // the nav renders its (disabled) arrows rather than vanishing.
    persistent = false,
    // Issue 1372, opt-OUT and DEFAULT ON so every shipped surface renders unchanged.
    //
    // A page-size choice is a BROWSE-SCREEN control: `design-system/spec.md` puts the pagination
    // bar at the foot of a browse screen, outside the scroll area, and a GM changing how many
    // rows they see at once is changing how they read the whole list. An INSPECTOR's pager is a
    // different control with the same anatomy — it walks a fixed five-row window over one
    // record's related rows inside a 300px column, and the prototype draws it as summary plus
    // arrows with no size selector (`essences.png`). Offering one there would put a third
    // `<select>` in a column that already cannot hold two side by side, to change a number
    // nothing else on the screen refers to.
    //
    // It is a PROP ON THE PRIMITIVE rather than a second pager component: the summary, the nav,
    // the disabled-arrow rule and the range arithmetic are identical, and this is the one part
    // that differs.
    showPageSize = true,
    // Issue 1372, opt-in and DEFAULT OFF so every shipped surface renders unchanged.
    //
    // "Render the footer only when there is more than one page" — the maintainer's ruling on the
    // world catalogues, whose prototype frame draws six rows and NO foot pager (`essences.png`)
    // while the shipped screen drew a full-width `Showing 1–6 of 6 · Page 1 of 1 · Per page 25`
    // band under them. A bar that can only ever say `Page 1 of 1` states nothing the list does
    // not already show.
    //
    // It is a THIRD MODE rather than a relaxation of `persistent`, because the default is
    // neither: `persistent || totalCount > minPageSize` renders the bar for eleven rows on a
    // twenty-five-row page, which is one page but more items than the smallest offered size — so
    // the per-page selector is still a meaningful control there. This mode says the stricter
    // thing, and it is opt-in so that no other surface changes.
    //
    // `persistent` WINS if both are set, which is a contradiction rather than a case: they are
    // mutually exclusive by meaning, and one of them has to be answered first.
    //
    // THE COST, RECORDED RATHER THAN DISCOVERED: hiding the bar hides the per-page selector with
    // it, so a GM who chooses a size that fits the whole list on one page cannot choose a smaller
    // one again from this screen. It is bounded — the size is component state that resets when
    // the route unmounts, and it is unreachable at the default size on any list the choice could
    // matter for — but it is the one thing this mode gives up.
    multiPageOnly = false,
  } = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize))));
  const firstShown = $derived(totalCount === 0 ? 0 : pageIndex * pageSize + 1);
  const lastShown = $derived(Math.min((pageIndex + 1) * pageSize, totalCount));
  // Keep the footer (and its per-page selector) visible whenever a page-size choice is
  // meaningful — i.e. there are more items than the smallest available option. Otherwise
  // picking a size that fits everything on one page would hide the only control to change
  // it back. The prev/next nav still only appears when there is more than one page.
  const minPageSize = $derived(
    pageSizeOptions.length ? Math.min(pageSize, ...pageSizeOptions) : pageSize
  );
  const showPagination = $derived(
    persistent || (multiPageOnly ? totalPages > 1 : totalCount > minPageSize)
  );
  const showNav = $derived(persistent || totalPages > 1);

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
  <section
    class="manager-pagination"
    aria-label={text('FABRICATE.Admin.Manager.Pagination.Label', 'Pagination')}
  >
    <span class="manager-pagination-summary" data-pagination-summary>
      {text('FABRICATE.Admin.Manager.Pagination.Range', 'Showing {first}–{last} of {total}')
        .replace('{first}', firstShown)
        .replace('{last}', lastShown)
        .replace('{total}', totalCount)}
    </span>
    {#if showNav}
      <nav
        class="manager-pagination-nav"
        aria-label={text('FABRICATE.Admin.Manager.Pagination.Navigation', 'Page navigation')}
      >
        <IconButton
          data-pagination-prev=""
          ariaLabel={text('FABRICATE.Admin.Manager.Pagination.Previous', 'Previous page')}
          disabled={pageIndex === 0}
          onclick={() => goToPage(pageIndex - 1)}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </IconButton>
        <span class="manager-pagination-page" data-pagination-page>
          {text('FABRICATE.Admin.Manager.Pagination.PageOf', 'Page {page} of {total}')
            .replace('{page}', pageIndex + 1)
            .replace('{total}', totalPages)}
        </span>
        <IconButton
          data-pagination-next=""
          ariaLabel={text('FABRICATE.Admin.Manager.Pagination.Next', 'Next page')}
          disabled={pageIndex >= totalPages - 1}
          onclick={() => goToPage(pageIndex + 1)}
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </IconButton>
      </nav>
    {/if}
    {#if showPageSize}
      <label class="manager-pagination-size">
        <span>{text('FABRICATE.Admin.Manager.Pagination.PerPage', 'Per page')}</span>
        <select
          value={pageSize}
          data-pagination-size
          aria-label={text('FABRICATE.Admin.Manager.Pagination.PerPageLabel', 'Rows per page')}
          onchange={(event) => changePageSize(event.currentTarget.value)}
        >
          {#each pageSizeOptions as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
    {/if}
  </section>
{/if}
