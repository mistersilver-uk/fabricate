<!-- Svelte 5 runes mode -->
<!--
  HistoryRow renders one terminal run in the Journal history list: a small thumb,
  the run name, a status pill, the relative finish time (pre-formatted by the
  parent), and an "×N" quantity badge when the run produced more than one result.
  Selectable via role=button + Enter/Space so clicking it opens the run detail.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RunStatusPill from './RunStatusPill.svelte';

  const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';

  let { run = null, selected = false, onSelect = null, relativeTime = '' } = $props();

  const id = $derived(String(run?.id ?? ''));
  const title = $derived(String(run?.names?.title ?? ''));
  const img = $derived(String(run?.img ?? '') || DEFAULT_RUN_IMAGE);
  const status = $derived(String(run?.derivedStatus ?? 'succeeded'));

  // Total produced quantity across the run's results (badge shown when > 1).
  const totalQuantity = $derived(
    (Array.isArray(run?.createdResults) ? run.createdResults : []).reduce(
      (sum, result) => sum + (Number(result?.quantity) || 0),
      0
    )
  );

  function activate() {
    if (id) onSelect?.(id);
  }
  function onKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="journal-history-row"
  class:is-selected={selected}
  role="button"
  tabindex="0"
  data-history-run-id={id}
  data-selected={selected ? 'true' : 'false'}
  aria-pressed={selected}
  onclick={activate}
  onkeydown={onKey}
>
  <img class="journal-history-thumb" src={img} alt="" />
  <div class="journal-history-copy">
    <span class="journal-history-name" title={title}>{title}</span>
    <div class="journal-history-meta">
      <RunStatusPill {status} />
      {#if relativeTime !== ''}
        <span class="journal-history-time">{relativeTime}</span>
      {/if}
    </div>
  </div>
  {#if totalQuantity > 1}
    <span class="journal-history-quantity" data-history-quantity>
      {localize('FABRICATE.App.Journal.Quantity', { n: totalQuantity })}
    </span>
  {/if}
</div>

<style>
  .journal-history-row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    text-align: left;
    cursor: pointer;
  }

  .journal-history-row:not(.is-selected):hover {
    background: var(--fab-surface-raised);
  }

  .journal-history-row.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-success-soft);
  }

  .journal-history-thumb {
    display: block;
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .journal-history-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .journal-history-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .journal-history-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .journal-history-time {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .journal-history-quantity {
    flex: 0 0 auto;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text-muted);
  }
</style>
