<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import IngredientGroupCard from './IngredientGroupCard.svelte';
  import CatalystBlock from './CatalystBlock.svelte';
  import {
    adjustComponentEssenceQuantity,
    buildEditableEssenceOptions,
    clampComponentEssenceQuantity
  } from '../../util/componentEditor.js';

  let {
    set,
    setIndex = 0,
    totalSets = 1,
    collapsed = false,
    itemMap = new Map(),
    showComplexRecipes = false,
    showItemTags = false,
    allTags = [],
    // Actions
    onTogglePanel,
    onMoveUp,
    onMoveDown,
    onRemoveSet,
    onUpdateSetName,
    // Group actions (passed through)
    onAddGroup,
    onRemoveGroup,
    onAddOption,
    onRemoveOption,
    onClearComponent,
    onDropIngredient,
    onUpdateOption,
    onUpdateGroupName,
    validationErrors = [],
    // Catalyst actions (passed through)
    onAddCatalyst,
    onRemoveCatalyst,
    onClearCatalyst,
    onDropCatalyst,
    onUpdateCatalyst,
    // Essence actions
    showEssences = false,
    allEssences = [],
    onUpdateEssence
  } = $props();

  const essenceOptions = $derived(
    buildEditableEssenceOptions(allEssences || [], set?.essences || {})
  );

  const panelId = $derived(set?.id || `set-${setIndex}`);
  const ingredientCount = $derived(
    (set?.ingredientGroups || []).reduce((sum, g) => sum + (g.options?.length || 0), 0)
  );
  const catalystCount = $derived((set?.catalysts || []).length);
  const errorGroupIds = $derived(
    new Set(validationErrors
      .filter(e => e.panelId === (set?.id) && e.fieldSelector)
      .map(e => {
        const match = e.fieldSelector.match(/data-group-id="([^"]+)"/);
        return match?.[1];
      })
      .filter(Boolean))
  );

  function handleDrop(event) {
    event.preventDefault();
    try {
      const raw = event.dataTransfer.getData('text/plain');
      const data = JSON.parse(raw);
      if (data.type === 'component' && data.componentId) {
        // Dropping on the set panel adds a new group with this item
        onAddGroup?.(setIndex);
        // Then assign item to the last group's first option
        const groups = set?.ingredientGroups || [];
        onDropIngredient?.(setIndex, groups.length, 0, data.componentId);
      }
    } catch { /* ignore */ }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function setEssenceQuantity(essenceId, rawValue) {
    onUpdateEssence?.(setIndex, essenceId, clampComponentEssenceQuantity(rawValue));
  }

  function adjustEssenceQuantity(essenceId, delta) {
    const option = essenceOptions.find(entry => entry.id === essenceId);
    if (!option) return;
    onUpdateEssence?.(setIndex, essenceId, adjustComponentEssenceQuantity(option.quantity, delta));
  }

  const setNameId = $derived(`fab-set-name-${panelId}`);
</script>

<section
  class="accordion-panel ingredient-set-panel"
  data-panel-id={panelId}
  aria-label={set?.name || `Set ${setIndex + 1}`}
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
    <span class="panel-title">{set?.name || `Set ${setIndex + 1}`}</span>
    <span class="panel-summary">
      {ingredientCount} {ingredientCount === 1 ? localize('FABRICATE.Admin.Recipes.Ingredient') : localize('FABRICATE.Admin.Recipes.Ingredients')}
      {#if catalystCount > 0}
        , {catalystCount} {catalystCount === 1 ? localize('FABRICATE.Admin.Recipes.Catalyst') : localize('FABRICATE.Admin.Recipes.Catalysts')}
      {/if}
    </span>

    {#if showComplexRecipes}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="panel-actions" onclick={(e) => e.stopPropagation()}>
        <button type="button" disabled={setIndex === 0} onclick={() => onMoveUp?.(setIndex)}
          title={localize('FABRICATE.Editor.IngredientSets.MoveUp')}>
          <i class="fas fa-arrow-up"></i>
        </button>
        <button type="button" disabled={setIndex >= totalSets - 1} onclick={() => onMoveDown?.(setIndex)}
          title={localize('FABRICATE.Editor.IngredientSets.MoveDown')}>
          <i class="fas fa-arrow-down"></i>
        </button>
        <button type="button" onclick={() => onRemoveSet?.(setIndex)}
          title={localize('FABRICATE.Editor.IngredientSets.RemoveSet')}>
          <i class="fas fa-trash"></i>
        </button>
      </div>
    {/if}
  </header>

  {#if !collapsed}
    <div class="accordion-body" id="panel-body-{panelId}">
      {#if showComplexRecipes}
        <div class="set-name-row">
          <label for={setNameId}>{localize('FABRICATE.Editor.IngredientSets.SetNameLabel')}</label>
          <input
            id={setNameId}
            type="text"
            value={set?.name || ''}
            oninput={(e) => onUpdateSetName?.(setIndex, e.target.value)}
          />
        </div>
      {/if}

      {#each set?.ingredientGroups || [] as group, groupIdx (group.id)}
        <IngredientGroupCard
          {group}
          groupIndex={groupIdx}
          {setIndex}
          {itemMap}
          {showItemTags}
          {showComplexRecipes}
          {allTags}
          hasError={errorGroupIds.has(group.id)}
          {onAddOption}
          {onRemoveOption}
          {onRemoveGroup}
          {onClearComponent}
          {onDropIngredient}
          {onUpdateOption}
          {onUpdateGroupName}
        />
      {/each}

      <button type="button" class="add-group-btn" onclick={() => onAddGroup?.(setIndex)}>
        <i class="fas fa-plus"></i> {localize('FABRICATE.Editor.IngredientSets.AddGroup')}
      </button>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="drop-zone-area" ondrop={handleDrop} ondragover={handleDragOver}>
        <i class="fas fa-download"></i>
        {localize('FABRICATE.Editor.IngredientSets.DropNewIngredient')}
      </div>

      <CatalystBlock
        catalysts={set?.catalysts || []}
        {setIndex}
        {itemMap}
        onAdd={onAddCatalyst}
        onRemove={onRemoveCatalyst}
        onClear={onClearCatalyst}
        onDrop={onDropCatalyst}
        onUpdate={onUpdateCatalyst}
      />

      {#if showEssences}
        <div class="essence-requirements">
          <h4>{localize('FABRICATE.Editor.Essences.SectionTitle')}</h4>
          {#if essenceOptions.length > 0}
            <div class="essence-grid">
              {#each essenceOptions as option (option.id)}
                <article class="essence-card" data-essence-id={option.id}>
                  <button
                    type="button"
                    class="essence-step essence-step-minus"
                    onclick={() => adjustEssenceQuantity(option.id, -1)}
                    aria-label={localize('FABRICATE.Editor.Essences.Decrement', { name: option.name })}
                    title={localize('FABRICATE.Editor.Essences.Decrement', { name: option.name })}
                  >
                    <i class="fas fa-minus"></i>
                  </button>

                  <input
                    class="essence-quantity-input"
                    type="number"
                    min="0"
                    step="1"
                    value={option.quantity}
                    aria-label={localize('FABRICATE.Editor.Essences.QuantityLabel', { name: option.name })}
                    oninput={(event) => setEssenceQuantity(option.id, event.currentTarget.value)}
                  />

                  <div class="essence-icon" aria-hidden="true">
                    <i class={option.icon} aria-hidden="true"></i>
                  </div>

                  <strong class="essence-name">{option.name}</strong>

                  <button
                    type="button"
                    class="essence-step essence-step-plus"
                    onclick={() => adjustEssenceQuantity(option.id, 1)}
                    aria-label={localize('FABRICATE.Editor.Essences.Increment', { name: option.name })}
                    title={localize('FABRICATE.Editor.Essences.Increment', { name: option.name })}
                  >
                    <i class="fas fa-plus"></i>
                  </button>
                </article>
              {/each}
            </div>
          {:else}
            <p class="hint">{localize('FABRICATE.Editor.IngredientSets.NoEssencesDefined')}</p>
          {/if}
        </div>
      {/if}
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
    outline: 2px solid var(--fab-info-border);
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

  .set-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .set-name-row label {
    font-weight: bold;
    white-space: nowrap;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .set-name-row input {
    flex: 1;
  }

  .add-group-btn {
    margin: 8px 0;
  }

  .drop-zone-area {
    border: 2px dashed var(--fab-blue-border);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
    margin: 8px 0;
    background: var(--fab-blue-soft);
  }

  .essence-requirements {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--fab-overlay-light-08);
  }

  .essence-requirements h4 {
    margin: 0 0 8px 0;
    font-size: 0.9rem;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .essence-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .essence-card {
    display: grid;
    grid-template-columns: 24px 3.25rem 30px minmax(0, 1fr) 24px;
    align-items: center;
    gap: 6px;
    padding: 8px 9px;
    border-radius: 9px;
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    background: var(--fab-overlay-light-04);
    min-width: 0;
  }

  .essence-step {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    background: var(--fab-overlay-light-04);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: 0 0 auto;
    color: inherit;
  }

  .essence-step i {
    font-size: 9px;
    opacity: 0.85;
  }

  .essence-step:hover:not(:disabled),
  .essence-step:focus-visible {
    border-color: var(--fab-info-border);
    background: var(--fab-overlay-light-08);
  }

  .essence-requirements .hint {
    margin: 0;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
  }

  .essence-requirements .essence-card .essence-quantity-input {
    width: 100%;
    min-width: 0;
    height: 28px;
    text-align: center;
    padding: 0 6px;
    border-radius: 5px;
    justify-self: stretch;
    font-variant-numeric: tabular-nums;
  }

  .essence-quantity-input::-webkit-outer-spin-button,
  .essence-quantity-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .essence-quantity-input[type="number"] {
    -moz-appearance: textfield;
  }

  .essence-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--fab-overlay-light-06);
    flex: 0 0 auto;
  }

  .essence-icon i {
    font-size: 13px;
  }

  .essence-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.88rem;
  }

  @media (max-width: 420px) {
    .essence-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
