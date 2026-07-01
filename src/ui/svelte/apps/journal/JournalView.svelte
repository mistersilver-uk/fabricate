<!-- Svelte 5 runes mode -->
<!--
  JournalView is the player Journal tab content. It reads the shared
  services.journal store (so the nav badge in the shell and this view share one
  reactive run state) and renders one of: loading, error, no-actor empty, or the
  populated 3-column layout.

  The grid is cloned from GatheringView: a container-query 3-column layout
  (minmax(280px,1fr) / 1.5fr / 1fr) that reflows to a single column below 900px of
  app width. Left column = active runs + history; centre = the selected run's
  detail; right column (mockup order) = about this run → what to expect →
  recent results → tips. World-time guidance lives in the Tips card.

  This view HOSTS the re-fetch effects (so the store stays Foundry-global-free):
  an actor-selection change re-loads; a scene change quietly re-loads; a
  world-time change quietly re-loads AND ticks (recomputing countdowns/progress).
  The shell also registers world-time/scene refreshes so the badge stays fresh
  while the tab is closed; the duplicate quiet loads are harmless.
-->
<script>
  import { localize, subscribeSceneChange, subscribeWorldTime } from '../../util/foundryBridge.js';
  import ActiveRunsList from './ActiveRunsList.svelte';
  import HistoryList from './HistoryList.svelte';
  import RunDetail from './RunDetail.svelte';
  import RecentResults from './RecentResults.svelte';
  import AboutThisRun from './AboutThisRun.svelte';
  import WhatToExpect from './WhatToExpect.svelte';
  import JournalTips from './JournalTips.svelte';

  let { services = null } = $props();

  const journal = $derived(services?.journal ?? null);

  const loading = $derived(journal?.loading === true);
  const error = $derived(journal?.error === true);
  const hasActor = $derived(Boolean(journal?.listing?.selectedActorId));
  const now = $derived(Number(journal?.worldTime ?? 0));

  const activeRuns = $derived(Array.isArray(journal?.activeRuns) ? journal.activeRuns : []);
  const historyPageItems = $derived(Array.isArray(journal?.historyPageItems) ? journal.historyPageItems : []);
  const recentTerminalRuns = $derived(Array.isArray(journal?.recentTerminalRuns) ? journal.recentTerminalRuns : []);
  const selectedRun = $derived(journal?.selectedRun ?? null);
  const selectedRunId = $derived(String(journal?.selectedRunId ?? ''));
  const expectRunType = $derived(String(selectedRun?.runType ?? 'crafting'));

  function selectRun(id) {
    journal?.select?.(id);
  }
  function viewFullHistory() {
    journal?.setHistoryPage?.(0);
    const first = (Array.isArray(journal?.historyPageItems) ? journal.historyPageItems : [])[0];
    if (first?.id) journal?.select?.(first.id);
  }

  // Re-fetch on mount and whenever the shared selected actor changes.
  $effect(() => {
    void services?.actorBar?.selectedActorId;
    journal?.load?.();
  });

  // Scene-linked availability can change when the player navigates scenes; quietly
  // re-fetch on a canvas redraw without flashing the spinner.
  $effect(() => subscribeSceneChange(() => journal?.load?.(true)));

  // World time only advances on the synced updateWorldTime hook (no per-second
  // core hook): quietly re-fetch and tick so countdowns/progress/readiness
  // recompute. READ-only refresh — no side effects published here.
  $effect(() =>
    subscribeWorldTime(() => {
      journal?.load?.(true);
      journal?.tickWorldTime?.();
    })
  );
</script>

{#if loading}
  <div class="journal-view-state" data-journal-state="loading">
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Journal.Loading')}</p>
  </div>
{:else if error}
  <div class="journal-view-state" data-journal-state="error">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Journal.Error')}</p>
  </div>
{:else if !hasActor}
  <div class="journal-view-state" data-journal-state="empty">
    <i class="fas fa-book-open" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Journal.Empty.NoActor')}</p>
  </div>
{:else}
  <div class="journal-view-container">
    <div class="journal-view-grid" data-journal-state="populated">
      <div class="journal-view-column journal-view-column-left">
        <ActiveRunsList
          runs={activeRuns}
          {selectedRunId}
          {now}
          onSelect={selectRun}
          sort={journal?.activeSort ?? 'soonestReady'}
          onSortChange={(value) => journal?.setActiveSort?.(value)}
        />
        <HistoryList
          runs={historyPageItems}
          totalCount={Number(journal?.historyCount ?? 0)}
          pageIndex={Number(journal?.historyPage ?? 0)}
          pageSize={Number(journal?.historyPageSize ?? 6)}
          pageSizeOptions={journal?.historyPageSizes ?? [6, 12, 25]}
          onPageChange={(index) => journal?.setHistoryPage?.(index)}
          onPageSizeChange={(size) => journal?.setHistoryPageSize?.(size)}
          {selectedRunId}
          onSelect={selectRun}
          {now}
          sort={journal?.historySort ?? 'newest'}
          onSortChange={(value) => journal?.setHistorySort?.(value)}
        />
      </div>
      <section class="journal-view-column journal-view-column-center" data-journal-detail>
        <RunDetail run={selectedRun} {now} {services} />
      </section>
      <div class="journal-view-column journal-view-column-right">
        {#if selectedRun}
          <AboutThisRun run={selectedRun} {services} />
          <WhatToExpect runType={expectRunType} />
        {/if}
        <RecentResults runs={recentTerminalRuns} onViewFullHistory={viewFullHistory} />
        <JournalTips />
      </div>
    </div>
  </div>
{/if}

<style>
  /* Container-query layout cloned from GatheringView: the wrapper is the size
     container so the columns reflow against the Fabricate window width (the app
     is resizable/dockable, so a viewport media query would be wrong). */
  .journal-view-container {
    container-type: inline-size;
    container-name: fabricate-journal;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .journal-view-grid {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(280px, 1.5fr) minmax(280px, 1fr);
    gap: var(--fab-space-4);
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  /* Below the combined three-column minimum the grid reflows into a single
     vertical stack so the view stays usable on a narrow window. */
  @container fabricate-journal (max-width: 900px) {
    .journal-view-grid {
      grid-template-columns: 1fr;
      grid-auto-rows: minmax(min-content, max-content);
      height: auto;
      min-height: 100%;
      overflow-y: auto;
    }

    .journal-view-column {
      min-height: 220px;
    }
  }

  .journal-view-column {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    overflow-y: auto;
  }

  /* The left column hosts two equal-height list halves (Active Runs / History);
     it must not scroll as a whole — each half scrolls internally — so the 50/50
     split holds instead of the sections collapsing. */
  .journal-view-column-left {
    overflow: hidden;
  }

  .journal-view-column-center {
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    overflow: hidden;
  }

  .journal-view-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--fab-text-muted);
    background: var(--fab-surface);
  }

  .journal-view-state i {
    font-size: 32px;
  }

  .journal-view-state p {
    margin: 0;
    font-size: 14px;
  }
</style>
