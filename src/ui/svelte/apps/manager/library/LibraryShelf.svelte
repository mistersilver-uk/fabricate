<!--
  The paginated tail every studio browser ends with, written once: an empty state when the library is
  empty, a DIFFERENT one when filters excluded everything, otherwise a `<ul role="list">` of entries
  as a list column or a card grid, then the pager. Container and pager are ONE component because the
  empty states have to suppress the pager, which makes "no rows means no pager" structural.

  The ENTRY is a snippet, so this never imports a studio's row component, and the list class and view
  attribute are props because the smoke walk, the View Lab cases and `managerLayoutGuards` navigate
  by studio selectors. The GRID template stays the studio's: column width is a content judgement a
  210px essence minimum and a recipe card do not share.
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
    <!-- A card row has no columns, so this is a list, not a table. Selection is conveyed by the
         row's own `.is-selected` ring and `aria-current`. -->
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

<!-- UNCONDITIONAL: `Pagination` already decides whether there is anything to page, so a gate here
     would be a second opinion that silently drops the pager for a `persistent` caller. -->
<Pagination
  {totalCount}
  {pageSize}
  {pageIndex}
  {pageSizeOptions}
  {onPageChange}
  {onPageSizeChange}
/>
