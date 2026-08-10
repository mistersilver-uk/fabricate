<!-- Svelte 5 runes mode -->
<!--
  The paginated ROWS/COLUMNS of a studio library (issue 1036 follow-up).

  Every studio browser ends the same way: an empty state when the library itself is empty,
  a DIFFERENT empty state when filters have excluded everything, otherwise a `<ul role="list">`
  of entries in either a list column or a card grid, then the pager. Four studios were
  re-deriving that tail; this is it once.

  ── WHY THE CONTAINER AND THE PAGER ARE ONE COMPONENT ───────────────────────────
  Because the two empty states have to suppress the pager, and a studio that owns the pager
  itself has to remember to. Keeping them together makes "no rows means no pager" structural
  rather than a rule each studio re-remembers. `Pagination` stays the leaf primitive it is;
  this only decides WHEN it renders.

  ── WHAT STAYS THE STUDIO'S ────────────────────────────────────────────────────
  The ENTRY is a snippet, so each studio renders its own row/card component; this never
  imports one. The list class and the view data-attribute are props, because the Foundry
  smoke walk, the View Lab cases and `managerLayoutGuards` navigate by studio-specific
  selectors (`.manager-essences-table`, `data-essence-view`) and a shared primitive must
  not rename the hooks its callers are found by — the same override convention
  `BulkSelectionToolbar` already uses.

  The GRID template lives with the studio too (`listClass` + `.is-grid`), because column
  width is a content judgement: essences fit a 210px minimum, a recipe card with a subtitle
  and a longer fact row will not.
-->
<script>
  import Pagination from '../../../components/Pagination.svelte';

  let {
    items = [],
    // 'grid' renders `.is-grid`, anything else `.is-list`.
    viewMode = 'list',
    listClass = '',
    listAttrs = {},
    ariaLabel = undefined,
    // Pager
    totalCount = 0,
    pageIndex = 0,
    pageSize = 25,
    pageSizeOptions = [10, 25, 50],
    onPageChange = () => {},
    onPageSizeChange = () => {},
    // `true` when the underlying library has no entries at all, as opposed to none matching.
    isEmpty = false,
    scrollLabel = undefined,
    // Snippets
    entry = undefined,
    empty = undefined,
    emptyFiltered = undefined,
  } = $props();

  const isGrid = $derived(viewMode === 'grid');
</script>

<section class="manager-table-scroll" aria-label={scrollLabel}>
  {#if isEmpty}
    {#if empty}{@render empty()}{/if}
  {:else if totalCount === 0}
    {#if emptyFiltered}{@render emptyFiltered()}{/if}
  {:else}
    <!-- A card row has no columns, so this is a list, not a table: no `role="table"` head and
         no `role="row"` / `role="cell"`. Selection is conveyed by the row's own `.is-selected`
         ring and `aria-current`. -->
    <ul
      class={`${listClass} ${isGrid ? 'is-grid' : 'is-list'}`}
      role="list"
      aria-label={ariaLabel}
      {...listAttrs}
    >
      {#each items as item, index (item.id)}
        {#if entry}{@render entry(item, index)}{/if}
      {/each}
    </ul>
  {/if}
</section>

<!-- UNCONDITIONAL, exactly as every studio renders it today. `Pagination` already decides
     for itself whether there is anything to page (`totalCount > minPageSize`, or `persistent`),
     so gating it here would only add a second, subtly different opinion — and would silently
     drop the pager for a caller that asked for `persistent`. -->
<Pagination
  {totalCount}
  {pageSize}
  {pageIndex}
  {pageSizeOptions}
  {onPageChange}
  {onPageSizeChange}
/>
