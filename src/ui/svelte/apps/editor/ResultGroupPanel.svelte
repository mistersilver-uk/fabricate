<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    group,
    groupIndex = 0,
    totalGroups = 1,
    collapsed = false,
    itemMap = new Map(),
    showComplexRecipes = false,
    showPropertyMacros = false,
    // Actions
    onTogglePanel,
    onMoveUp,
    onMoveDown,
    onRemoveGroup,
    onUpdateGroupName,
    hasError = false,
    onAddResult,
    onRemoveResult,
    onDropResult,
    onUpdateResult
  } = $props();

  const panelId = $derived(group?.id || `result-${groupIndex}`);
  const resultCount = $derived((group?.results || []).length);
  const groupNameId = $derived(`fab-group-name-${panelId}`);

  function resolveItem(componentId) {
    if (!componentId) return null;
    return itemMap.get(componentId) || null;
  }

  function handleDrop(event, resultIndex) {
    event.preventDefault();
    try {
      const raw = event.dataTransfer.getData('text/plain');
      const data = JSON.parse(raw);
      if (data.type === 'component' && data.componentId) {
        onDropResult?.(groupIndex, resultIndex, data.componentId);
      }
    } catch { /* ignore */ }
  }

  function handleNewDrop(event) {
    event.preventDefault();
    try {
      const raw = event.dataTransfer.getData('text/plain');
      const data = JSON.parse(raw);
      if (data.type === 'component' && data.componentId) {
        onAddResult?.(groupIndex);
        onDropResult?.(groupIndex, (group?.results || []).length, data.componentId);
      }
    } catch { /* ignore */ }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }
</script>

<section
  class="accordion-panel result-group-panel"
  class:group-error={hasError}
  data-panel-id={panelId}
  aria-label={group?.name || `Result Group ${groupIndex + 1}`}
>
  <header class="accordion-header" role="button" tabindex="0"
    aria-expanded={!collapsed}
    aria-controls="panel-body-{panelId}"
    onclick={() => onTogglePanel?.(panelId)}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTogglePanel?.(panelId); }}}
  >
    {#if showComplexRecipes}
      <span class="drag-handle" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
    {/if}
    <i class="fas {collapsed ? 'fa-chevron-right' : 'fa-chevron-down'} chevron"></i>
    <span class="panel-title">{group?.name || `Result Group ${groupIndex + 1}`}</span>
    <span class="panel-summary">
      {localize('FABRICATE.Editor.ResultGroups.PanelSummary', { count: resultCount })}
    </span>

    {#if showComplexRecipes}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="panel-actions" onclick={(e) => e.stopPropagation()}>
        <button type="button" disabled={groupIndex === 0} onclick={() => onMoveUp?.(groupIndex)}
          title={localize('FABRICATE.Editor.ResultGroups.MoveUp')}>
          <i class="fas fa-arrow-up"></i>
        </button>
        <button type="button" disabled={groupIndex >= totalGroups - 1} onclick={() => onMoveDown?.(groupIndex)}
          title={localize('FABRICATE.Editor.ResultGroups.MoveDown')}>
          <i class="fas fa-arrow-down"></i>
        </button>
        <button type="button" onclick={() => onRemoveGroup?.(groupIndex)}
          title={localize('FABRICATE.Editor.ResultGroups.RemoveGroup')}>
          <i class="fas fa-trash"></i>
        </button>
      </div>
    {/if}
  </header>

  {#if !collapsed}
    <div class="accordion-body" id="panel-body-{panelId}">
      {#if showComplexRecipes}
        <div class="group-name-row">
          <label for={groupNameId}>{localize('FABRICATE.Editor.ResultGroups.GroupNameLabel')}</label>
          <input
            id={groupNameId}
            type="text"
            value={group?.name || ''}
            oninput={(e) => onUpdateGroupName?.(groupIndex, e.target.value)}
          />
        </div>
      {/if}

      {#if (group?.results || []).length > 0}
        <table class="result-table">
          <thead>
            <tr>
              <th>{localize('FABRICATE.Editor.ResultGroups.ManagedItemHeader')}</th>
              <th>{localize('FABRICATE.Ingredient.Quantity')}</th>
              {#if showPropertyMacros}
                <th>{localize('FABRICATE.Editor.ResultGroups.PropertyMacroLabel')}</th>
              {/if}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each group.results as result, resultIdx}
              {@const item = resolveItem(result.componentId)}
              <tr ondrop={(e) => handleDrop(e, resultIdx)} ondragover={handleDragOver}>
                <td>
                  <div class="item-cell">
                    {#if item}
                      <img src={item.img || 'icons/svg/item-bag.svg'} alt={item.name} class="item-thumb" />
                      <span>{item.name}</span>
                    {:else}
                      <span class="no-item">{localize('FABRICATE.Editor.IngredientOptions.NoItemSelected')}</span>
                    {/if}
                  </div>
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={result.quantity}
                    oninput={(e) => onUpdateResult?.(groupIndex, resultIdx, 'quantity', Number(e.target.value) || 1)}
                    class="qty-input"
                  />
                </td>
                {#if showPropertyMacros}
                  <td>
                    <input
                      type="text"
                      value={result.propertyMacroUuid || ''}
                      placeholder={localize('FABRICATE.Editor.ResultGroups.NoPropertyMacro')}
                      oninput={(e) => onUpdateResult?.(groupIndex, resultIdx, 'propertyMacroUuid', e.target.value || null)}
                      class="macro-input"
                    />
                  </td>
                {/if}
                <td>
                  {#if (group.results || []).length > 1}
                    <button type="button" class="icon-button danger"
                      onclick={() => onRemoveResult?.(groupIndex, resultIdx)}
                      title={localize('FABRICATE.Editor.ResultGroups.RemoveResult')}>
                      <i class="fas fa-trash"></i>
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="results-empty" ondrop={handleNewDrop} ondragover={handleDragOver}>
          <i class="fas fa-download"></i>
          {localize('FABRICATE.Editor.ResultGroups.EmptyState')}
        </div>
      {/if}

      <div class="result-actions">
        <button type="button" onclick={() => onAddResult?.(groupIndex)}>
          <i class="fas fa-plus"></i> {localize('FABRICATE.Editor.ResultGroups.AddResult')}
        </button>
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="drop-zone-area" ondrop={handleNewDrop} ondragover={handleDragOver}>
        <i class="fas fa-download"></i>
        {localize('FABRICATE.Editor.ResultGroups.EmptyState')}
      </div>
    </div>
  {/if}
</section>

<style>
  .accordion-panel {
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    border-radius: 10px;
    margin-bottom: 8px;
    overflow: hidden;
    background: var(--fab-editor-surface-soft, var(--fab-overlay-light-05));
    box-shadow: 0 10px 22px var(--fab-overlay-dark-18);
  }

  .group-error {
    border-color: var(--fab-editor-border-danger, var(--fab-editor-border-danger));
    box-shadow: 0 0 0 1px var(--fab-editor-border-danger, var(--fab-editor-border-danger));
  }

  .accordion-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    cursor: pointer;
    background: var(--fab-overlay-dark-18);
    border-bottom: 1px solid var(--fab-overlay-light-06);
    user-select: none;
  }

  .accordion-header:focus-visible {
    outline: 2px solid var(--color-border-highlight, var(--fab-info));
  }

  .chevron {
    font-size: 0.75rem;
    width: 12px;
  }

  .drag-handle {
    cursor: grab;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
  }

  .panel-title {
    font-weight: bold;
    flex: 1;
    color: var(--fab-editor-text, var(--fab-editor-text));
  }

  .panel-summary {
    font-size: 0.85rem;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
  }

  .panel-actions {
    display: flex;
    gap: 2px;
  }

  .panel-actions button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 5px;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
  }

  .panel-actions button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .panel-actions button:hover:not(:disabled),
  .panel-actions button:focus-visible:not(:disabled) {
    background: var(--fab-editor-input-bg-hover, var(--fab-overlay-light-07));
    color: var(--fab-editor-text, var(--fab-editor-text));
  }

  .accordion-body {
    padding: 12px;
    background: var(--fab-overlay-dark-12);
  }

  .group-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .group-name-row label {
    font-weight: bold;
    white-space: nowrap;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .group-name-row input {
    flex: 1;
  }

  .result-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
  }

  .result-table th {
    text-align: left;
    font-size: 0.8rem;
    padding: 2px 4px;
    border-bottom: 1px solid var(--fab-overlay-light-08);
    color: var(--fab-editor-muted, var(--fab-editor-muted));
  }

  .result-table td {
    padding: 4px;
    vertical-align: middle;
  }

  .item-cell {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 34px;
    padding: 4px 6px;
    border: 1px solid var(--fab-overlay-light-05);
    border-radius: 6px;
    background: var(--fab-overlay-light-03);
  }

  .item-thumb {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .no-item {
    color: var(--fab-editor-muted, var(--fab-editor-muted));
    font-style: italic;
  }

  .qty-input {
    width: 50px;
  }

  .macro-input {
    width: 100%;
  }

  .icon-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 5px;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
  }

  .icon-button.danger {
    color: var(--fab-editor-danger, var(--fab-editor-danger));
  }

  .result-actions {
    margin: 8px 0;
  }

  .results-empty {
    border: 2px dashed var(--fab-blue-border);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
    font-style: italic;
    background: var(--fab-blue-soft);
  }

  .drop-zone-area {
    border: 2px dashed var(--fab-blue-border);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
    margin-top: 8px;
    background: var(--fab-blue-soft);
  }
</style>
