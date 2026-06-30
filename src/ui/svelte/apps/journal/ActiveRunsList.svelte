<!-- Svelte 5 runes mode -->
<!--
  ActiveRunsList is the top of the Journal's left column: the shared
  JournalListShell chrome (title + count + "Soonest Ready"/"Newest" sort + empty
  state) wrapping the list of active RunCards. List ordering is owned by the
  store's `activeRuns` derived (an explicit comparator); this is a pure presenter.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RunCard from './RunCard.svelte';
  import JournalListShell from './JournalListShell.svelte';

  let {
    runs = [],
    selectedRunId = '',
    onSelect = null,
    now = 0,
    sort = 'soonestReady',
    onSortChange = null
  } = $props();

  const sortOptions = $derived([
    { value: 'soonestReady', label: localize('FABRICATE.App.Journal.ActiveRuns.Sort.SoonestReady') },
    { value: 'newest', label: localize('FABRICATE.App.Journal.ActiveRuns.Sort.Newest') }
  ]);
</script>

<JournalListShell
  titleId="journal-active-runs-title"
  kind="active"
  title={localize('FABRICATE.App.Journal.ActiveRuns.Title')}
  count={localize('FABRICATE.App.Journal.ActiveRuns.Count', { count: runs.length })}
  sortLabel={localize('FABRICATE.App.Journal.ActiveRuns.Sort.Label')}
  sortValue={sort}
  {sortOptions}
  {onSortChange}
  isEmpty={runs.length === 0}
  emptyIcon="fa-hourglass-start"
  emptyText={localize('FABRICATE.App.Journal.Empty.Active')}
>
  <div class="journal-run-list" role="list">
    {#each runs as run (run.id)}
      <div role="listitem" class="journal-run-list-item">
        <RunCard {run} {now} selected={run.id === selectedRunId} {onSelect} />
      </div>
    {/each}
  </div>
</JournalListShell>

<style>
  .journal-run-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .journal-run-list-item {
    flex: 0 0 auto;
    min-width: 0;
  }
</style>
