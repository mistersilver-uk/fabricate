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

  /* Theme the manager-pagination markup in the player scope (mirrors the gathering
     environment list) using base tokens only. Anchored to the local scoped wrapper so it
     cannot bleed beyond this list.

     ISSUE 1502 — THE PAGER'S SHEET RULES NOW REACH THIS BLOCK, and the `1502 base`
     declarations below are what stops that moving the frame. `Pagination` and `IconButton`
     are rooted at the classes they emit, so `styles/fabricate.css` paints this player-app
     pager where it previously only painted the manager's — the markup is no longer
     "unstyled" here, which is why that word is gone from the sentence above. Every property
     this block already declares still WINS (a Svelte `:global` block is injected unlayered;
     the sheet is imported at `layer(modules)`), so only the remainder is newly painted, and
     each `1502 base` declaration restates what the remainder rendered BEFORE the widening.
     This pager declares LESS than its five siblings, so its remainder is the larger one: the
     per-property audit for all six player callers is in `components/Pagination.svelte`'s
     docblock. */
  .journal-history-body :global(.manager-pagination) {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--fab-space-2);
    font-size: 12px;
    color: var(--fab-text-muted);
    /* 1502 base: the sheet newly paints all four `padding` longhands, a `border-top` and a
       `background` on this bar. It has only ever had top padding, no rule and no fill — so
       the `padding-top` here becomes the full shorthand rather than gaining three siblings. */
    padding: var(--fab-space-2) 0 0;
    border-top: none;
    background: transparent;
  }

  /* Only the summary shrinks (ellipsis); the nav and per-page picker stay put so
     the footer never wraps to a second row in the narrow History column. */
  .journal-history-body :global(.manager-pagination-summary) {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .journal-history-body :global(.manager-pagination-page) {
    color: var(--fab-text);
    white-space: nowrap;
    /* 1502 base: the sheet newly paints `min-width: 96px` and `font-weight: 700` on this
       label. It has always been a content-width flex item at the inherited weight; the
       sheet's `text-align: center` is adopted and is inert on a content-width box. */
    min-width: auto;
    font-weight: inherit;
  }

  .journal-history-body :global(.manager-pagination-size) {
    display: inline-flex;
    flex: 0 0 auto;
    gap: var(--fab-space-1);
    align-items: center;
    margin-left: auto;
    white-space: nowrap;
  }

  .journal-history-body :global(.manager-icon-button) {
    /* 1502 base: Foundry core's `button` rule gives every button `min-height: 2em` and
       `font-size: var(--font-size-14)`, and the sheet newly overrides both with
       `min-height: 0` and `font: inherit`. Restated, so the chevron keeps its 14px glyph.
       The 2em minimum is this arrow's own 28px, so only the glyph was at stake here. */
    min-height: var(--button-size, 2em);
    font-size: var(--font-size-14, 0.875rem);
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
    flex: 0 0 auto;
    align-items: center;
    gap: var(--fab-space-2);
  }

  /* The per-page <select> colours are themed globally (`.fabricate-app select`), and its
     geometry was Foundry core's until issue 1502 — the sheet's re-rooted
     `.fabricate-pagination .manager-pagination-size select` now reaches it and would give it
     the manager's 28px box and a 64px floor. Its own colours are the SAME four declarations
     `.fabricate-app select` already made, so only the geometry is restated here. */
  .journal-history-body :global(.manager-pagination-size select) {
    /* 1502 base: Foundry core sizes every select `height: var(--input-height)` and sets
       `line-height` to match; the sheet's `font: inherit` shorthand newly resets that
       line-height, and its `min-width: 64px` is newly painted. */
    height: var(--input-height, 2rem);
    line-height: var(--input-height, 2rem);
    min-width: auto;
  }
</style>
