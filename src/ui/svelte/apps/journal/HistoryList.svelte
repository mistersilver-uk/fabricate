<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { formatRelativeWorldTime } from '../../util/formatDuration.js';
  import Pagination from '../../components/Pagination.svelte';
  import HistoryRow from './HistoryRow.svelte';
  import JournalListShell from './JournalListShell.svelte';

  let {
    runs = [],
    totalCount = 0,
    pageIndex = 0,
    pageSize = 4,
    pageSizeOptions = [4, 6, 12, 25],
    onPageChange = null,
    onPageSizeChange = null,
    selectedRunKey = '',
    onSelect = null,
    onDismiss = null,
    sort = 'newest',
    onSortChange = null,
    now = 0,
    secondsPerDay = 86400,
  } = $props();

  const sortOptions = $derived([
    { value: 'newest', label: localize('FABRICATE.App.Journal.History.Sort.Newest') },
    { value: 'oldest', label: localize('FABRICATE.App.Journal.History.Sort.Oldest') },
  ]);
  const relativeLabels = $derived({
    today: localize('FABRICATE.App.Journal.RelativeTime.Today'),
    yesterday: localize('FABRICATE.App.Journal.RelativeTime.Yesterday'),
    daysAgo: (n) => localize('FABRICATE.App.Journal.RelativeTime.DaysAgo', { days: n }),
  });
  const keyOf = (run) => String(run?.key ?? run?.id ?? '');
  const relativeTimeFor = (run) =>
    formatRelativeWorldTime(run?.finishedAt, now, { secondsPerDay, labels: relativeLabels });
</script>

<JournalListShell
  titleId="journal-history-title"
  kind="history"
  listName="finished"
  title={localize('FABRICATE.App.Journal.History.Title')}
  sortLabel={localize('FABRICATE.App.Journal.History.Sort.Label')}
  sortValue={sort}
  {sortOptions}
  {onSortChange}
  isEmpty={totalCount === 0}
  emptyIcon="fa-clock-rotate-left"
  emptyText={localize('FABRICATE.App.Journal.Empty.History')}
>
  <div class="journal-history-list" role="list">
    {#each runs as run (keyOf(run))}
      <div role="listitem">
        <HistoryRow
          {run}
          selected={keyOf(run) === selectedRunKey}
          {onSelect}
          {onDismiss}
          relativeTime={relativeTimeFor(run)}
        />
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
      label={localize('FABRICATE.App.Journal.History.Title')}
      navLabel={localize('FABRICATE.App.Journal.History.Title')}
      onPageChange={(index) => onPageChange?.(index)}
      onPageSizeChange={(size) => onPageSizeChange?.(size)}
    />
  {/snippet}
</JournalListShell>

<style>
  .journal-history-list {
    display: grid;
    min-width: 0;
    gap: var(--fab-space-2);
  }
  .journal-history-list > div {
    min-width: 0;
  }
  :global(.journal-list-section .manager-pagination) {
    padding: var(--fab-space-2) 0 0;
    border-top: 1px solid var(--fab-border);
    background: transparent;
  }
</style>
