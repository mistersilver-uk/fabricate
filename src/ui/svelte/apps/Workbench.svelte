<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import { dragDrop } from '../actions/dragDrop.js';

  let {
    entries = [],
    onAddToWorkbench,
    onRemoveFromWorkbench,
    onClearWorkbench,
    onSubmitWorkbench
  } = $props();

  let isEmpty = $derived(entries.length === 0);

  function handleDrop(data) {
    if (data?.type === 'component' && data.componentId) {
      onAddToWorkbench?.(data.componentId);
    }
  }
</script>

<div
  class="fabricate-workbench"
  use:dragDrop={{ onDrop: handleDrop, activeClass: 'workbench-drop-active' }}
>
  <!-- Drop area -->
  <div class="workbench-drop-area" class:workbench-drop-area--filled={!isEmpty}>
    {#if isEmpty}
      <div class="workbench-empty">
        <i class="fas fa-flask" aria-hidden="true"></i>
        <p>{localize('FABRICATE.Workbench.EmptyHint')}</p>
      </div>
    {:else}
      <div class="workbench-chips">
        {#each entries as entry (entry.componentId)}
          <div
            class="workbench-chip"
            data-component-id={entry.componentId}
            aria-label="{entry.name} x{entry.quantity}"
            onclick={() => onAddToWorkbench?.(entry.componentId)}
            oncontextmenu={(event) => { event.preventDefault(); onRemoveFromWorkbench?.(entry.componentId); }}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemoveFromWorkbench?.(entry.componentId); } }}
            role="button"
            tabindex="0"
          >
            {#if entry.img}
              <img
                src={entry.img}
                alt=""
                width="20"
                height="20"
              />
            {/if}
            <span class="chip-label">{entry.name}</span>
            <span class="chip-quantity">x{entry.quantity}</span>
            <button
              type="button"
              class="chip-remove"
              aria-label={localize('FABRICATE.Workbench.RemoveEntry').replace('{name}', entry.name)}
              onclick={(event) => { event.stopPropagation(); onRemoveFromWorkbench?.(entry.componentId); }}
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Action bar -->
  <div class="workbench-actions">
    <button
      type="button"
      class="workbench-attempt-btn"
      disabled={isEmpty}
      onclick={() => { if (!isEmpty) onSubmitWorkbench?.(); }}
    >
      <i class="fas fa-flask" aria-hidden="true"></i>
      {localize('FABRICATE.ActorApp.Alchemy.AttemptAlchemy')}
    </button>
    {#if !isEmpty}
      <button
        type="button"
        class="workbench-clear-btn"
        aria-label={localize('FABRICATE.Workbench.Clear')}
        onclick={() => onClearWorkbench?.()}
      >
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
</div>

<style>
  .fabricate-workbench {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    flex: 1;
    min-height: 0;
  }

  .workbench-drop-area {
    flex: 1;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
    padding: var(--fab-space-3);
    background: var(--fab-surface-soft);
  }

  .workbench-drop-area--filled {
    align-items: stretch;
    justify-content: stretch;
    border-style: solid;
  }

  .workbench-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-text-subtle);
    text-align: center;
  }

  .workbench-empty i {
    font-size: 28px;
    opacity: 0.5;
  }

  .workbench-empty p {
    margin: 0;
    font-size: 13px;
  }

  .workbench-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
    align-content: flex-start;
  }

  .workbench-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    padding: 4px 4px 4px 8px;
    border-radius: var(--fab-v2-radius-control);
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text);
    font-size: 12px;
    cursor: pointer;
  }

  .workbench-chip:hover,
  .workbench-chip:focus-visible {
    background: var(--fab-accent-soft);
    border-color: var(--fab-accent);
  }

  .workbench-chip img {
    border-radius: 3px;
    object-fit: contain;
  }

  .chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .chip-quantity {
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-muted);
    font-weight: 600;
  }

  .chip-remove {
    appearance: none;
    -webkit-appearance: none;
    border: none;
    background: transparent;
    color: var(--fab-text-subtle);
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    cursor: pointer;
    padding: 0;
  }

  .chip-remove:hover,
  .chip-remove:focus-visible {
    color: var(--fab-danger);
    background: var(--fab-danger-soft);
  }

  .workbench-actions {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .workbench-attempt-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-1);
    background: var(--fab-accent);
    color: #051e0c;
    border: 1px solid var(--fab-accent-strong);
    border-radius: var(--fab-v2-radius-control);
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .workbench-attempt-btn:hover:not(:disabled) {
    background: var(--fab-accent-hover);
  }

  .workbench-attempt-btn:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .workbench-attempt-btn:disabled {
    background: var(--fab-surface-raised);
    color: var(--fab-text-subtle);
    border-color: var(--fab-border);
    cursor: not-allowed;
  }

  .workbench-clear-btn {
    appearance: none;
    -webkit-appearance: none;
    border: 1px solid var(--fab-border);
    background: transparent;
    color: var(--fab-text-muted);
    width: var(--fab-v2-icon-button);
    height: var(--fab-v2-icon-button);
    border-radius: var(--fab-v2-radius-control);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .workbench-clear-btn:hover,
  .workbench-clear-btn:focus-visible {
    color: var(--fab-danger);
    border-color: var(--fab-danger);
  }

  :global(.fabricate-workbench.workbench-drop-active .workbench-drop-area) {
    background: var(--fab-accent-soft) !important;
    border-color: var(--fab-accent) !important;
  }
</style>
