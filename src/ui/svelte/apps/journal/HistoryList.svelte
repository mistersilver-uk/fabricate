<!-- Svelte 5 runes mode -->
<!--
  The Journal's Finished list: each terminal run is a `LogList` entry opening its detail, with its
  relative finish time, a labelled outcome glyph and a dismiss control beside it.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { formatRelativeWorldTime } from '../../util/formatDuration.js';
  import IconButton from '../../components/IconButton.svelte';
  import LogList from '../../components/LogList.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import JournalListShell from './JournalListShell.svelte';
  import { runStatusPresentation } from './journalRunStatus.js';

  const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';

  let {
    runs = [],
    totalCount = 0,
    filtered = false,
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

  /** Settlement or recovery evidence outranks a terminal face; anything else reads unknown. */
  function outcomeOf(run, status) {
    if (run?.recoveryEvidence?.required) return 'recovery';
    if (run?.recoveryEvidence?.status === 'planned') return 'inProgress';
    return ['succeeded', 'failed', 'cancelled'].includes(status) ? status : 'unknown';
  }

  function entryOf(run) {
    const id = String(run?.id ?? '');
    const status = String(run?.derivedStatus ?? run?.status ?? 'unknown');
    const outcome = outcomeOf(run, status);
    const presentation = runStatusPresentation(outcome);
    return {
      key: keyOf(run),
      run,
      id,
      text: String(run?.names?.title ?? ''),
      when: formatRelativeWorldTime(run?.finishedAt, now, {
        secondsPerDay,
        labels: relativeLabels,
      }),
      art: String(run?.img ?? '') || DEFAULT_RUN_IMAGE,
      tone: status === 'failed' ? 'danger' : '',
      outcome: {
        icon: presentation.icon,
        label: localize(presentation.labelKey),
        tone: presentation.tone,
        props: { 'data-history-outcome': outcome },
      },
      props: { 'data-history-run-id': id },
    };
  }

  const entries = $derived(runs.map(entryOf));
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
  emptyText={localize(
    filtered ? 'FABRICATE.App.Journal.Empty.MatchingHistory' : 'FABRICATE.App.Journal.Empty.History'
  )}
>
  <!-- `journal-history-list` is a test and smoke hook only; no stylesheet selects it. -->
  <LogList
    class="journal-history-list"
    {entries}
    ariaLabel={localize('FABRICATE.App.Journal.History.Title')}
    selectedKey={selectedRunKey}
    onOpen={(entry) => entry.id && onSelect?.(entry.run)}
  >
    {#snippet action(entry)}
      <IconButton
        size={24}
        class="journal-history-dismiss is-ghost"
        ariaLabel={localize('FABRICATE.App.Journal.History.Dismiss', { name: entry.text })}
        title={localize('FABRICATE.App.Journal.History.Dismiss', { name: entry.text })}
        data-journal-dismiss={entry.id}
        onclick={() => onDismiss?.(entry.run)}
        ><i class="fas fa-xmark" aria-hidden="true"></i></IconButton
      >
    {/snippet}
  </LogList>
  {#snippet footer()}
    <Pagination
      {totalCount}
      {pageSize}
      {pageIndex}
      {pageSizeOptions}
      persistent
      density="compact"
      ariaLabel={localize('FABRICATE.App.Journal.History.Title')}
      navLabel={localize('FABRICATE.App.Journal.History.Title')}
      onPageChange={(index) => onPageChange?.(index)}
      onPageSizeChange={(size) => onPageSizeChange?.(size)}
    />
  {/snippet}
</JournalListShell>
