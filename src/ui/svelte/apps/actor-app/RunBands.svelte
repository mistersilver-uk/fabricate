<!-- Svelte 5 runes mode -->
<!--
  RunBands renders the dual In Progress / Recent History band for the actor
  app. Wraps both lists in a single collapsible section so the user can hide
  the bands when they want to focus on the recipe table. Each list paginates
  independently with a small page size; the store owns the page-index state
  so it survives across tab switches and refreshes within the session.

  The collapse state and page indices come from the parent (driven by store
  writables in the actor app) so a single source of truth is preserved.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  const PAGE_SIZE = 5;

  let {
    activeRuns = [],
    runHistory = [],
    hasCraftingActor = false,
    expanded = true,
    activeRunPageIndex = 0,
    historyPageIndex = 0,
    onCraft,
    onShowRunDetails,
    onRestartRun,
    onCancelRun,
    onCancelSalvageRun,
    onToggleExpanded = () => {},
    onActiveRunPageChange = () => {},
    onHistoryPageChange = () => {}
  } = $props();

  // Slice each list to the current page. Page index is clamped against the
  // list length so a stale index from a long list collapses safely as items
  // complete and the list shrinks.
  let activeRunsPage = $derived.by(() => {
    const start = Math.max(0, activeRunPageIndex) * PAGE_SIZE;
    return activeRuns.slice(start, start + PAGE_SIZE);
  });

  let runHistoryPage = $derived.by(() => {
    const start = Math.max(0, historyPageIndex) * PAGE_SIZE;
    return runHistory.slice(start, start + PAGE_SIZE);
  });

  function chevronIcon() {
    return expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
  }

  function runKey(run, index, scope) {
    return run?.uiKey || `${scope}-${run?.runType || 'crafting'}-${run?.id ?? index}`;
  }
</script>

{#if hasCraftingActor}
<section class="run-bands" class:run-bands--collapsed={!expanded} data-testid="run-bands">
  <header class="run-bands__header">
    <button
      type="button"
      class="run-bands__toggle"
      aria-expanded={expanded}
      onclick={() => onToggleExpanded()}
    >
      <i class={chevronIcon()} aria-hidden="true"></i>
      <span class="run-bands__heading">
        <span class="run-bands__heading-segment">
          {localize('FABRICATE.RunSummary.InProgress')} ({activeRuns.length})
        </span>
        <span class="run-bands__heading-divider" aria-hidden="true">·</span>
        <span class="run-bands__heading-segment">
          {localize('FABRICATE.RunSummary.RecentHistory')} ({runHistory.length})
        </span>
      </span>
    </button>
  </header>

  {#if expanded}
    <div class="run-bands__columns">
      <!-- In Progress column -->
      <div class="run-bands__column">
        <h4 class="run-bands__column-title">{localize('FABRICATE.RunSummary.InProgress')}</h4>
        {#if activeRuns.length > 0}
          <ul class="run-list">
            {#each activeRunsPage as run, index (runKey(run, index, 'active'))}
              <li class="run-row">
                <strong>{run.recipeName}</strong>
                <span class="badge">{run.statusLabel}</span>
                {#if run.stepLabel}
                  <span class="hint">{run.stepLabel}</span>
                {/if}
                <span class="run-row-actions">
                  {#if run.canContinue}
                    <button
                      type="button"
                      class="details-btn"
                      onclick={() => onCraft?.(run.recipeId, { runId: run.id })}
                      title={localize('FABRICATE.RunSummary.ContinueRun')}
                    >
                      <i class="fas fa-play"></i>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="details-btn"
                    onclick={() => onShowRunDetails?.(run.id, 'active')}
                    title={localize('FABRICATE.RunSummary.RunDetails')}
                  >
                    <i class="fas fa-list"></i>
                  </button>
                  {#if run.runType !== 'salvage'}
                    <button
                      type="button"
                      class="details-btn"
                      onclick={() => onRestartRun?.(run.recipeId, run.id)}
                      title={localize('FABRICATE.RunSummary.RestartRun')}
                    >
                      <i class="fas fa-rotate-left"></i>
                    </button>
                  {/if}
                  {#if run.canCancel}
                    <button
                      type="button"
                      class="details-btn"
                      onclick={() => run.runType === 'salvage'
                        ? onCancelSalvageRun?.(run.id)
                        : onCancelRun?.(run.id)}
                      title={localize('FABRICATE.RunSummary.CancelRun')}
                    >
                      <i class="fas fa-stop"></i>
                    </button>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
          <Pagination
            totalCount={activeRuns.length}
            pageSize={PAGE_SIZE}
            pageIndex={activeRunPageIndex}
            onPageChange={(idx) => onActiveRunPageChange(idx)}
            onPageSizeChange={() => {}}
          />
        {:else}
          <p class="hint">{localize('FABRICATE.RunSummary.NoActiveRuns')}</p>
        {/if}
      </div>

      <!-- Recent History column -->
      <div class="run-bands__column">
        <h4 class="run-bands__column-title">{localize('FABRICATE.RunSummary.RecentHistory')}</h4>
        {#if runHistory.length > 0}
          <ul class="run-list">
            {#each runHistoryPage as run, index (runKey(run, index, 'history'))}
              <li class="run-row">
                <strong>{run.recipeName}</strong>
                <span class="badge">{run.statusLabel}</span>
                <span class="run-row-actions">
                  <button
                    type="button"
                    class="details-btn"
                    onclick={() => onShowRunDetails?.(run.id, 'history')}
                    title={localize('FABRICATE.RunSummary.RunDetails')}
                  >
                    <i class="fas fa-list"></i>
                  </button>
                </span>
              </li>
            {/each}
          </ul>
          <Pagination
            totalCount={runHistory.length}
            pageSize={PAGE_SIZE}
            pageIndex={historyPageIndex}
            onPageChange={(idx) => onHistoryPageChange(idx)}
            onPageSizeChange={() => {}}
          />
        {:else}
          <p class="hint">{localize('FABRICATE.RunSummary.NoRecentHistory')}</p>
        {/if}
      </div>
    </div>
  {/if}
</section>
{/if}

<style>
  .run-bands {
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-surface-soft);
    flex-shrink: 0;
  }

  .run-bands__header {
    display: flex;
    align-items: center;
  }

  .run-bands__toggle {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-3);
    border: none;
    border-radius: var(--fab-v2-radius-panel);
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: left;
  }

  .run-bands__toggle:hover,
  .run-bands__toggle:focus-visible {
    color: var(--fab-text);
  }

  .run-bands__toggle i {
    font-size: 11px;
    color: var(--fab-text-subtle);
    width: 12px;
  }

  .run-bands__heading {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
    flex-wrap: wrap;
  }

  .run-bands__heading-divider {
    color: var(--fab-text-subtle);
    opacity: 0.6;
  }

  .run-bands__columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--fab-space-3);
    padding: 0 var(--fab-space-3) var(--fab-space-2);
  }

  .run-bands__column {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .run-bands__column-title {
    margin: 0 0 var(--fab-space-1) 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-subtle);
  }

  @container actor-app (max-width: 760px) {
    .run-bands__columns {
      grid-template-columns: 1fr;
    }
  }
</style>
