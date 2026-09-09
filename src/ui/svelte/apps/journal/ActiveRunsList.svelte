<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import JournalListShell from './JournalListShell.svelte';
  import RunCard from './RunCard.svelte';

  let {
    runs = [],
    totalCount = 0,
    selectedRunKey = '',
    onSelect = null,
    now = 0,
    sort = 'soonestReady',
    onSortChange = null,
    pageIndex = 0,
    pageSize = 4,
    pageSizeOptions = [4, 6, 12, 25],
    onPageChange = null,
    onPageSizeChange = null,
  } = $props();

  const sortOptions = $derived([
    {
      value: 'soonestReady',
      label: localize('FABRICATE.App.Journal.ActiveRuns.Sort.SoonestReady'),
    },
    { value: 'newest', label: localize('FABRICATE.App.Journal.ActiveRuns.Sort.Newest') },
  ]);
  const keyOf = (run) => String(run?.key ?? run?.id ?? '');
</script>

<JournalListShell
  titleId="journal-active-runs-title"
  kind="active"
  listName="active"
  title={localize('FABRICATE.App.Journal.ActiveRuns.Title')}
  count={localize('FABRICATE.App.Journal.ActiveRuns.Count', { count: totalCount })}
  sortLabel={localize('FABRICATE.App.Journal.ActiveRuns.Sort.Label')}
  sortValue={sort}
  {sortOptions}
  {onSortChange}
  isEmpty={totalCount === 0}
  emptyIcon="fa-hourglass-start"
  emptyText={localize('FABRICATE.App.Journal.Empty.Active')}
>
  <div class="journal-run-list" role="list">
    {#each runs as run (keyOf(run))}
      <div role="listitem">
        <RunCard {run} {now} selected={keyOf(run) === selectedRunKey} {onSelect} />
      </div>
    {/each}
  </div>
  {#snippet footer()}
    <Pagination
      {totalCount}
      {pageSize}
      {pageIndex}
      {pageSizeOptions}
      persistent
      label={localize('FABRICATE.App.Journal.ActiveRuns.Title')}
      navLabel={localize('FABRICATE.App.Journal.ActiveRuns.Title')}
      onPageChange={(index) => onPageChange?.(index)}
      onPageSizeChange={(size) => onPageSizeChange?.(size)}
    />
  {/snippet}
</JournalListShell>

<style>
  .journal-run-list {
    display: grid;
    min-width: 0;
    gap: var(--fab-space-2);
  }
  .journal-run-list > div {
    min-width: 0;
  }
  :global(.journal-list-section .manager-pagination) {
    flex-wrap: nowrap;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) 0 0;
    border-top: 1px solid var(--fab-border);
    background: transparent;
  }
  :global(.journal-list-section .manager-pagination-page) {
    display: none;
  }
</style>
