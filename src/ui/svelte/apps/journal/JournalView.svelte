<!-- Svelte 5 runes mode -->
<script>
  import { localize, subscribeSceneChange, subscribeWorldTime } from '../../util/foundryBridge.js';
  import Field from '../../components/Field.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import Notice from '../../components/Notice.svelte';
  import Select from '../../components/Select.svelte';
  import SegmentedControl from '../manager/SegmentedControl.svelte';
  import EmptyState from '../manager/EmptyState.svelte';
  import PlayerViewState from '../PlayerViewState.svelte';
  import ActiveRunsList from './ActiveRunsList.svelte';
  import HistoryList from './HistoryList.svelte';
  import RunDetail from './RunDetail.svelte';

  let { services = null } = $props();
  const journal = $derived(services?.journal ?? null);
  const loading = $derived(journal?.loading === true);
  const error = $derived(journal?.error === true);
  const hasActor = $derived(Boolean(journal?.listing?.selectedActorId));
  const now = $derived(Number(journal?.worldTime ?? 0));
  const activeRuns = $derived(
    Array.isArray(journal?.activePageItems)
      ? journal.activePageItems
      : Array.isArray(journal?.activeRuns)
        ? journal.activeRuns
        : []
  );
  const historyRuns = $derived(
    Array.isArray(journal?.historyPageItems) ? journal.historyPageItems : []
  );
  const selectedRun = $derived(journal?.selectedRun ?? null);
  const selectedRunKey = $derived(
    String(journal?.selectedRunKey ?? selectedRun?.key ?? journal?.selectedRunId ?? '')
  );
  const counts = $derived(
    journal?.activeCounts ?? {
      all: journal?.activeCount ?? activeRuns.length,
      ready: 0,
      waiting: 0,
      paused: 0,
    }
  );

  const kindOptions = $derived([
    { value: 'all', label: localize('FABRICATE.App.Journal.Filters.Kind.All') },
    { value: 'crafting', label: localize('FABRICATE.App.Journal.Filters.Kind.Crafting') },
    { value: 'gathering', label: localize('FABRICATE.App.Journal.Filters.Kind.Gathering') },
    { value: 'salvage', label: localize('FABRICATE.App.Journal.Filters.Kind.Salvage') },
    { value: 'alchemy', label: localize('FABRICATE.App.Journal.Filters.Kind.Alchemy') },
  ]);
  const statusOptions = $derived([
    {
      value: 'all',
      fallback: localize('FABRICATE.App.Journal.Filters.Status.All'),
      badge: counts.all ?? 0,
    },
    {
      value: 'ready',
      fallback: localize('FABRICATE.App.Journal.Filters.Status.Ready'),
      badge: counts.ready ?? 0,
    },
    {
      value: 'waiting',
      fallback: localize('FABRICATE.App.Journal.Filters.Status.Waiting'),
      badge: counts.waiting ?? 0,
    },
    {
      value: 'paused',
      fallback: localize('FABRICATE.App.Journal.Filters.Status.Paused'),
      badge: counts.paused ?? 0,
    },
  ]);

  const viewStates = $derived([
    {
      when: loading,
      kind: 'loading',
      hook: 'data-journal-state',
      value: 'loading',
      icon: 'fas fa-spinner fa-spin',
      message: localize('FABRICATE.App.Journal.Loading'),
    },
    {
      when: !hasActor,
      kind: 'empty',
      hook: 'data-journal-state',
      value: 'empty',
      icon: 'fas fa-book-open',
      message: localize('FABRICATE.App.Journal.Empty.NoActor'),
    },
  ]);

  $effect(() => {
    void services?.actorBar?.selectedActorId;
    journal?.load?.();
  });
  $effect(() => subscribeSceneChange(() => journal?.load?.(true)));
  $effect(() =>
    subscribeWorldTime(() => {
      journal?.load?.(true);
      journal?.tickWorldTime?.();
    })
  );
</script>

{#if error}
  <div class="journal-error-state" data-journal-state="error">
    <Notice
      tone="danger"
      title={localize('FABRICATE.App.Journal.Error')}
      action={{ label: localize('FABRICATE.App.Journal.Retry'), onClick: () => journal?.load?.() }}
    />
  </div>
{:else}
  <PlayerViewState branches={viewStates}>
    <div class="journal-view-container" data-journal-state="populated">
      <div class="journal-view-grid">
        <aside class="journal-browse" aria-label={localize('FABRICATE.App.Journal.Browse.Label')}>
          <div class="journal-browse-controls">
            <div class="journal-search-field">
              <span>{localize('FABRICATE.App.Journal.Filters.SearchKicker')}</span>
              <ManagerSearchField
                class="journal-search-control"
                size="38"
                value={journal?.search ?? ''}
                onInput={(value) => journal?.setSearch?.(value)}
                placeholder={localize('FABRICATE.App.Journal.Filters.SearchPlaceholder')}
                ariaLabel={localize('FABRICATE.App.Journal.Filters.SearchLabel')}
                data-journal-search
              />
            </div>
            <Field as="div" class="journal-kind-field">
              <span>{localize('FABRICATE.App.Journal.Filters.Kind.Label')}</span>
              <Select
                size="form"
                value={journal?.kindFilter ?? 'all'}
                options={kindOptions}
                ariaLabel={localize('FABRICATE.App.Journal.Filters.Kind.Label')}
                triggerData={{ 'data-journal-kind-filter': true }}
                onChange={(value) => journal?.setKindFilter?.(value)}
              />
            </Field>
          </div>
          <SegmentedControl
            options={statusOptions}
            value={journal?.activeStatusFilter ?? 'all'}
            onChange={(value) => journal?.setActiveStatusFilter?.(value)}
            groupName="journal-active-status"
            ariaLabel={localize('FABRICATE.App.Journal.Filters.Status.Label')}
            dataAttr="data-journal-status-filter"
            fill
          />

          <div class="journal-browse-lists">
            <ActiveRunsList
              runs={activeRuns}
              totalCount={journal?.activeCount ?? activeRuns.length}
              {selectedRunKey}
              onSelect={(run) => journal?.select?.(run)}
              {now}
              sort={journal?.activeSort ?? 'soonestReady'}
              onSortChange={(value) => journal?.setActiveSort?.(value)}
              pageIndex={journal?.activePage ?? 0}
              pageSize={journal?.activePageSize ?? 4}
              pageSizeOptions={journal?.pageSizes ?? [4, 6, 12, 25]}
              onPageChange={(value) => journal?.setActivePage?.(value)}
              onPageSizeChange={(value) => journal?.setActivePageSize?.(value)}
            />
            <HistoryList
              runs={historyRuns}
              totalCount={journal?.historyCount ?? historyRuns.length}
              pageIndex={journal?.historyPage ?? 0}
              pageSize={journal?.historyPageSize ?? 4}
              pageSizeOptions={journal?.historyPageSizes ?? journal?.pageSizes ?? [4, 6, 12, 25]}
              onPageChange={(value) => journal?.setHistoryPage?.(value)}
              onPageSizeChange={(value) => journal?.setHistoryPageSize?.(value)}
              {selectedRunKey}
              onSelect={(run) => journal?.select?.(run)}
              onDismiss={(run) => journal?.dismiss?.(run)}
              sort={journal?.historySort ?? 'newest'}
              onSortChange={(value) => journal?.setHistorySort?.(value)}
              {now}
              secondsPerDay={services?.getWorldTimeComponents?.(now)?.secondsPerDay ?? 86400}
            />
          </div>
        </aside>

        <main class="journal-detail-pane">
          {#if selectedRun}
            <RunDetail run={selectedRun} {journal} {now} {services} />
          {:else}
            <EmptyState
              icon="fas fa-book-open"
              title={localize('FABRICATE.App.Journal.Empty.Detail')}
              dataAttr="data-journal-empty"
              dataValue="detail"
            />
          {/if}
        </main>
      </div>
    </div>
  </PlayerViewState>
{/if}

<style>
  .journal-view-container {
    container: fabricate-journal / inline-size;
    height: 100%;
    min-height: 0;
    background: var(--fab-surface);
  }

  .journal-error-state {
    display: grid;
    height: 100%;
    padding: var(--fab-space-4);
    place-items: center;
    background: var(--fab-surface);
  }
  .journal-view-grid {
    display: grid;
    grid-template-columns: minmax(310px, 0.72fr) minmax(0, 1.8fr);
    height: 100%;
    min-height: 0;
  }
  .journal-browse {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border-right: 1px solid var(--fab-border);
    background: var(--fab-bg-1);
  }
  .journal-browse-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 138px;
    align-items: end;
    gap: var(--fab-space-2);
  }
  .journal-search-field {
    display: grid;
    gap: var(--fab-space-chip);
    min-width: 0;
    color: var(--fab-text);
    font-size: 0.82rem;
    font-weight: 700;
  }
  .journal-search-field > :global(.journal-search-control) {
    min-width: 0;
  }
  :global(.journal-kind-field) {
    min-width: 0;
  }
  .journal-browse-lists {
    display: grid;
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    min-height: 0;
    flex: 1 1 auto;
    gap: var(--fab-space-3);
  }
  .journal-detail-pane {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    background: var(--fab-surface);
  }
  .journal-detail-pane > :global(.manager-empty) {
    min-height: 100%;
  }

  @container fabricate-journal (max-width: 960px) {
    .journal-view-grid {
      grid-template-columns: 1fr;
      height: auto;
    }
    .journal-browse {
      display: contents;
    }
    .journal-browse-controls,
    .journal-browse > :global(.manager-segmented) {
      margin: var(--fab-space-3) var(--fab-space-3) 0;
    }
    .journal-browse-lists {
      display: contents;
    }
    .journal-browse-lists > :global(.journal-list-section) {
      min-height: 220px;
      max-height: 360px;
      padding: var(--fab-space-3);
      border-bottom: 1px solid var(--fab-border);
    }
    .journal-detail-pane {
      min-height: 220px;
      overflow: visible;
    }
  }

  @container fabricate-journal (max-width: 560px) {
    .journal-browse-controls {
      grid-template-columns: 1fr;
    }
  }
</style>
