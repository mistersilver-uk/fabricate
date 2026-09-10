<!-- Svelte 5 runes mode -->
<!--
  HistoryRow renders one terminal run in the Journal history list: a small thumb,
  the run name, relative finish time and a labeled right-side outcome glyph.
  Selectable via role=button + Enter/Space so clicking it opens the run detail.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
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
  const status = $derived(String(run?.derivedStatus ?? run?.status ?? 'unknown'));
  const outcome = $derived.by(() => {
    if (run?.recoveryEvidence?.required) return 'recovery';
    if (run?.recoveryEvidence?.status === 'planned') return 'inProgress';
    return ['succeeded', 'failed', 'cancelled'].includes(status) ? status : 'unknown';
  });
  const runStatus = $derived(runStatusPresentation(outcome));

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

<div class="journal-history-row" class:is-selected={selected} class:is-failed={status === 'failed'}>
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
    <Medallion art={img} alt="" size={26} />
    <div class="journal-history-copy">
      <span class="journal-history-name" {title}>{title}</span>
      <div class="journal-history-meta">
        {#if relativeTime !== ''}
          <span class="journal-history-time">{relativeTime}</span>
        {/if}
      </div>
    </div>
    <span
      class="journal-history-outcome"
      class:is-success={runStatus.tone === 'success'}
      class:is-danger={runStatus.tone === 'danger'}
      class:is-warning={runStatus.tone === 'warning'}
      role="img"
      aria-label={localize(runStatus.labelKey)}
      title={localize(runStatus.labelKey)}
      data-history-outcome={outcome}
      ><i class={`fas ${runStatus.icon}`} aria-hidden="true"></i></span
    >
  </div>
  <IconButton
    class="journal-history-dismiss is-ghost"
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
    border-radius: 9px;
    background: var(--fab-bg-2);
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

  .journal-history-row.is-failed {
    background: var(--fab-danger-soft);
    border-color: var(--fab-danger-border);
  }
  .journal-history-row.is-selected {
    border-color: var(--fab-accent-border);
  }

  .journal-history-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .journal-history-name {
    font-size: 11px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .journal-history-meta {
    display: flex;
    align-items: center;
  }

  .journal-history-time {
    font-size: 9.5px;
    color: var(--fab-text-muted);
  }

  .journal-history-outcome {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--fab-text-muted);
  }
  .journal-history-outcome.is-success {
    color: var(--fab-success-text);
  }
  .journal-history-outcome.is-danger {
    color: var(--fab-danger-text);
  }
  .journal-history-outcome.is-warning {
    color: var(--fab-warning-text);
  }
</style>
