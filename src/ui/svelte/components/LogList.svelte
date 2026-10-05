<!--
  A named list of past entries a caller may open (`<LogList>`, `library.html`), drawn at the
  journal's Finished list, its exemplar. Props: `entries` (`{ key, text, when, art, tone, outcome:
  { icon, label, tone, props }, props }[]`), `ariaLabel` (required), `selectedKey`, `onOpen(entry)`
  (absent, entries are inert), `action` (a snippet drawn beside each open control) and `class`.
  An entry's `props` lands on its open control and the rest spread on the root, after the class.
-->
<script>
  import Medallion from './Medallion.svelte';

  let {
    entries = [],
    ariaLabel = '',
    selectedKey = '',
    onOpen = null,
    action = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  function openOnKey(event, entry) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onOpen?.(entry);
    }
  }
</script>

{#snippet line(entry)}
  {#if entry.art}<Medallion art={entry.art} alt="" size={26} />{/if}
  <div class="fab-log-list-copy">
    <span class="fab-log-list-text" title={entry.text}>{entry.text}</span>
    <div class="fab-log-list-meta">
      {#if entry.when}<span class="fab-log-list-when">{entry.when}</span>{/if}
    </div>
  </div>
  {#if entry.outcome}
    <span
      {...entry.outcome.props}
      class="fab-log-list-outcome"
      class:is-success={entry.outcome.tone === 'success'}
      class:is-danger={entry.outcome.tone === 'danger'}
      class:is-warning={entry.outcome.tone === 'warning'}
      role="img"
      aria-label={entry.outcome.label || undefined}
      title={entry.outcome.label}
      ><i class={`fas ${entry.outcome.icon}`} aria-hidden="true"></i></span
    >
  {/if}
{/snippet}

<div class={['fab-log-list', extraClass]} role="list" aria-label={ariaLabel || undefined} {...rest}>
  {#each entries as entry (entry.key)}
    {@const selected = selectedKey !== '' && entry.key === selectedKey}
    <div class="fab-log-list-item" role="listitem">
      <div
        class="fab-log-list-entry"
        class:is-open={Boolean(onOpen)}
        class:is-selected={selected}
        class:is-danger={entry.tone === 'danger'}
      >
        {#if onOpen}
          <div
            {...entry.props}
            class="fab-log-list-open"
            role="button"
            tabindex="0"
            data-keyboard-focus="true"
            aria-pressed={selected}
            onclick={() => onOpen(entry)}
            onkeydown={(event) => openOnKey(event, entry)}
          >
            {@render line(entry)}
          </div>
        {:else}
          <div {...entry.props} class="fab-log-list-open">{@render line(entry)}</div>
        {/if}
        {@render action?.(entry)}
      </div>
    </div>
  {/each}
</div>

<style>
  .fab-log-list {
    display: grid;
    min-width: 0;
    gap: var(--fab-space-1);
  }

  .fab-log-list-item {
    min-width: 0;
  }

  .fab-log-list-entry {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    width: 100%;
    height: 44px;
    min-height: 44px;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
    color: var(--fab-text);
    text-align: left;
  }

  .fab-log-list-entry.is-open {
    cursor: pointer;
  }

  .fab-log-list-open {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
    gap: var(--fab-space-2);
  }

  .fab-log-list-entry.is-open:not(.is-selected):hover {
    background: var(--fab-surface-raised);
  }

  .fab-log-list-entry.is-danger {
    background: var(--fab-danger-soft);
    border-color: var(--fab-danger-border);
  }

  .fab-log-list-entry.is-selected {
    border-color: var(--fab-accent-border);
  }

  .fab-log-list-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.2;
  }

  .fab-log-list-text {
    font-size: 11px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .fab-log-list-meta {
    display: flex;
    align-items: center;
  }

  .fab-log-list-when {
    font-size: 9.5px;
    color: var(--fab-text-muted);
  }

  .fab-log-list-outcome {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .fab-log-list-outcome.is-success {
    color: var(--fab-success-text);
  }

  .fab-log-list-outcome.is-danger {
    color: var(--fab-danger-text);
  }

  .fab-log-list-outcome.is-warning {
    color: var(--fab-warning-text);
  }
</style>
