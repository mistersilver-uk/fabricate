<!-- Svelte 5 runes mode -->
<!--
  HistoryRow renders one terminal run in the Journal history list: a small thumb,
  the run name, a status chip, the relative finish time (pre-formatted by the
  parent), and an "×N" quantity badge when the run produced more than one result.
  Selectable via role=button + Enter/Space so clicking it opens the run detail.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { statusChipTone } from '../../util/statusChipTone.js';
  import Chip from '../../components/Chip.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import { runStatusPresentation } from './journalRunStatus.js';

  const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';

  let {
    run = null,
    selected = false,
    onSelect = null,
    onDismiss = null,
    relativeTime = '',
  } = $props();

  const id = $derived(String(run?.id ?? ''));
  const title = $derived(String(run?.names?.title ?? ''));
  const img = $derived(String(run?.img ?? '') || DEFAULT_RUN_IMAGE);
  const status = $derived(String(run?.derivedStatus ?? 'succeeded'));
  const runStatus = $derived(runStatusPresentation(status));

  // Total produced quantity across the run's results (badge shown when > 1).
  const totalQuantity = $derived(
    (Array.isArray(run?.createdResults) ? run.createdResults : []).reduce(
      (sum, result) => sum + (Number(result?.quantity) || 0),
      0
    )
  );

  function activate() {
    if (id) onSelect?.(run);
  }
  function dismiss(event) {
    event.stopPropagation();
    onDismiss?.(run);
  }
  function onKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate();
    }
  }
</script>

<div class="journal-history-row" class:is-selected={selected}>
  <div
    class="journal-history-select"
    role="button"
    tabindex="0"
    data-history-run-id={id}
    data-selected={selected ? 'true' : 'false'}
    aria-pressed={selected}
    onclick={activate}
    onkeydown={onKey}
  >
    <Medallion art={img} alt="" size={32} />
    <div class="journal-history-copy">
      <span class="journal-history-name" {title}>{title}</span>
      <div class="journal-history-meta">
        <Chip
          class="journal-run-status"
          density="list"
          tone={statusChipTone(runStatus.tone)}
          icon={`fas ${runStatus.icon}`}
          data-run-status={status}>{localize(runStatus.labelKey)}</Chip
        >
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
  <IconButton
    class="journal-history-dismiss"
    ariaLabel={localize('FABRICATE.App.Journal.History.Dismiss', { name: title })}
    title={localize('FABRICATE.App.Journal.History.Dismiss', { name: title })}
    data-journal-dismiss={id}
    onclick={dismiss}><i class="fas fa-xmark" aria-hidden="true"></i></IconButton
  >
</div>

<style>
  .journal-history-row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    width: 100%;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    text-align: left;
    cursor: pointer;
  }

  .journal-history-select {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
    gap: var(--fab-space-2);
  }

  .journal-history-row:not(.is-selected):hover {
    background: var(--fab-surface-raised);
  }

  .journal-history-row.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-success-soft);
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

  /* THE ROW'S STATUS CHIP holds its width (issue 1506). The retired journal status pill declared
     `flex: 0 0 auto` on itself; the shared chip declares no flex at all, because POSITION is the
     caller's and geometry is the primitive's — the rule its own `density` note states. So the one
     property that was doing work here is restated here, where the row that squeezes it lives. */
  .journal-history-meta :global(.journal-run-status) {
    flex: 0 0 auto;
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
