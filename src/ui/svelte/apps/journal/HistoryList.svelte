<!-- Svelte 5 runes mode -->
<!--
  HistoryList is the bottom of the Journal's left column: the shared
  JournalListShell chrome (title + "Newest"/"Oldest" sort + empty state) wrapping
  the paged list of terminal HistoryRows (reusing the shared Pagination
  component). Sorting + paging are owned by the store; this presenter maps the
  current page to rows and pre-formats each row's relative finish time via the
  pure formatRelativeWorldTime helper.
-->
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
    pageSize = 6,
    pageSizeOptions = [6, 12, 25],
    onPageChange = null,
    onPageSizeChange = null,
    selectedRunId = '',
    onSelect = null,
    sort = 'newest',
    onSortChange = null,
    now = 0,
    secondsPerDay = 86400
  } = $props();

  const sortOptions = $derived([
    { value: 'newest', label: localize('FABRICATE.App.Journal.History.Sort.Newest') },
    { value: 'oldest', label: localize('FABRICATE.App.Journal.History.Sort.Oldest') }
  ]);

  const relativeLabels = $derived({
    today: localize('FABRICATE.App.Journal.RelativeTime.Today'),
    yesterday: localize('FABRICATE.App.Journal.RelativeTime.Yesterday'),
    daysAgo: (n) => localize('FABRICATE.App.Journal.RelativeTime.DaysAgo', { days: n })
  });

  function relativeTimeFor(run) {
    return formatRelativeWorldTime(run?.finishedAt, now, { secondsPerDay, labels: relativeLabels });
  }
</script>

<JournalListShell
  titleId="journal-history-title"
  kind="history"
  title={localize('FABRICATE.App.Journal.History.Title')}
  sortLabel={localize('FABRICATE.App.Journal.History.Sort.Label')}
  sortValue={sort}
  {sortOptions}
  {onSortChange}
  isEmpty={totalCount === 0}
  emptyIcon="fa-clock-rotate-left"
  emptyText={localize('FABRICATE.App.Journal.Empty.History')}
>
  <div class="journal-history-body">
    <div class="journal-history-list" role="list">
      {#each runs as run (run.id)}
        <div role="listitem" class="journal-history-list-item">
          <HistoryRow
            {run}
            selected={run.id === selectedRunId}
            {onSelect}
            relativeTime={relativeTimeFor(run)}
          />
        </div>
      {/each}
    </div>
    <Pagination
      {totalCount}
      {pageSize}
      {pageIndex}
      {pageSizeOptions}
      onPageChange={(index) => onPageChange?.(index)}
      onPageSizeChange={(size) => onPageSizeChange?.(size)}
    />
  </div>
</JournalListShell>

<style>
  .journal-history-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .journal-history-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .journal-history-list-item {
    flex: 0 0 auto;
    min-width: 0;
  }

  /* Theme the unstyled manager-pagination markup in the player scope (mirrors the
     gathering environment list) using base tokens only. Anchored to the local
     scoped wrapper so it cannot bleed beyond this list. */
  .journal-history-body :global(.manager-pagination) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding-top: var(--fab-space-2);
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .journal-history-body :global(.manager-icon-button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    cursor: pointer;
  }

  .journal-history-body :global(.manager-icon-button:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  .journal-history-body :global(.manager-pagination-nav) {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .journal-history-body :global(.manager-pagination-size select) {
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
  }
</style>
