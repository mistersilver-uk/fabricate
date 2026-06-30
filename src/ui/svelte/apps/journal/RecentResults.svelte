<!-- Svelte 5 runes mode -->
<!--
  RecentResults is the right-column "mini-history": the store's run-independent
  `recentTerminalRuns` (top few terminal runs), NOT the selected run's results.
  It is a quick glance at the most recent outcomes plus a "View full history"
  button that jumps the left History column to its first page. Each row shows the
  run name, a status pill, and an "×N" badge when the run produced more than one
  result. Card chrome comes from the shared JournalCard.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RunStatusPill from './RunStatusPill.svelte';
  import JournalCard from './JournalCard.svelte';

  const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';

  let { runs = [], onViewFullHistory = null } = $props();

  function totalQuantity(run) {
    return (Array.isArray(run?.createdResults) ? run.createdResults : []).reduce(
      (sum, result) => sum + (Number(result?.quantity) || 0),
      0
    );
  }
</script>

<JournalCard kind="recent" title={localize('FABRICATE.App.Journal.RecentResults.Title')}>
  {#if runs.length === 0}
    <p class="journal-recent-empty">{localize('FABRICATE.App.Journal.RecentResults.Empty')}</p>
  {:else}
    <ul class="journal-recent-list">
      {#each runs as run (run.id)}
        <li class="journal-recent-item" data-recent-run-id={run.id}>
          <img class="journal-recent-thumb" src={run.img || DEFAULT_RUN_IMAGE} alt="" />
          <span class="journal-recent-name" title={run.names?.title ?? ''}>{run.names?.title ?? ''}</span>
          {#if totalQuantity(run) > 1}
            <span class="journal-recent-quantity">{localize('FABRICATE.App.Journal.Quantity', { n: totalQuantity(run) })}</span>
          {/if}
          <RunStatusPill status={run.derivedStatus} />
        </li>
      {/each}
    </ul>
    <button type="button" class="journal-recent-link" data-journal-view-history onclick={() => onViewFullHistory?.()}>
      {localize('FABRICATE.App.Journal.RecentResults.ViewFullHistory')}
    </button>
  {/if}
</JournalCard>

<style>
  .journal-recent-empty {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .journal-recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .journal-recent-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .journal-recent-thumb {
    display: block;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 5px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .journal-recent-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .journal-recent-quantity {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  .journal-recent-link {
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-accent);
    cursor: pointer;
    text-decoration: underline;
  }
</style>
