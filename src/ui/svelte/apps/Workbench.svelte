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
  style="border-top: 1px solid rgba(0, 0, 0, 0.15); padding: 8px; background: rgba(0, 0, 0, 0.06);"
  use:dragDrop={{ onDrop: handleDrop, activeClass: 'workbench-drop-active' }}
>
  <!-- Header row -->
  <div class="workbench-header">
    <span
      class="workbench-title"
      style="text-transform: uppercase; font-size: 12px; font-weight: 700; opacity: 0.7;"
    >
      {localize('FABRICATE.Workbench.Title')}
    </span>

    <div class="workbench-actions">
      {#if !isEmpty}
        <button
          type="button"
          class="workbench-clear-btn"
          aria-label={localize('FABRICATE.Workbench.Clear')}
          onclick={() => onClearWorkbench?.()}
        >
          <i class="fas fa-trash"></i>
        </button>
      {/if}

      <button
        type="button"
        class="workbench-submit-btn"
        disabled={isEmpty}
        onclick={() => { if (!isEmpty) onSubmitWorkbench?.(); }}
      >
        {localize('FABRICATE.Workbench.Submit')}
      </button>
    </div>
  </div>

  <!-- Body -->
  {#if isEmpty}
    <p
      class="workbench-empty"
      style="font-style: italic; font-size: 12px; opacity: 0.5; padding: 16px 0; text-align: center;"
    >
      {localize('FABRICATE.Workbench.EmptyHint')}
    </p>
  {:else}
    <div
      class="workbench-chips"
      style="display: flex; flex-wrap: wrap; gap: 4px;"
    >
      {#each entries as entry (entry.componentId)}
        <div
          class="workbench-chip"
          data-component-id={entry.componentId}
          aria-label="{entry.name} x{entry.quantity}"
          style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 4px; background: rgba(0, 0, 0, 0.1); border: 1px solid rgba(0, 0, 0, 0.15); font-size: 12px; cursor: pointer;"
          onclick={() => onAddToWorkbench?.(entry.componentId)}
          oncontextmenu={(event) => { event.preventDefault(); onRemoveFromWorkbench?.(entry.componentId); }}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemoveFromWorkbench?.(entry.componentId); } }}
          role="button"
          tabindex="0"
        >
          {#if entry.img}
            <img
              src={entry.img}
              alt={entry.name}
              width="20"
              height="20"
            />
          {/if}
          <span class="chip-label">{entry.name} x{entry.quantity}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .workbench-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .workbench-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .workbench-submit-btn {
    background: var(--fabricate-primary, #4a90e2);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 6px 16px;
    font-size: 13px;
    cursor: pointer;
  }

  .workbench-submit-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  :global(.fabricate-workbench.workbench-drop-active) {
    background: rgba(74, 144, 226, 0.12) !important;
    outline: 2px dashed var(--fabricate-primary, #4a90e2);
    outline-offset: -2px;
  }
</style>
