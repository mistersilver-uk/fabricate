<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import IngredientGroupCard from './IngredientGroupCard.svelte';
  import CatalystBlock from './CatalystBlock.svelte';

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
    onUpdateCatalyst
  } = $props();

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
      if (data.type === 'systemItem' && data.systemItemId) {
        // Dropping on the set panel adds a new group with this item
        onAddGroup?.(setIndex);
        // Then assign item to the last group's first option
        const groups = set?.ingredientGroups || [];
        onDropIngredient?.(setIndex, groups.length, 0, data.systemItemId);
      }
    } catch { /* ignore */ }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
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
    </div>
  {/if}
</section>

<style>
  .accordion-panel {
    border: 1px solid var(--color-border-light, #ccc);
    border-radius: 4px;
    margin-bottom: 8px;
  }

  .accordion-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    cursor: pointer;
    background: var(--color-bg-option, #f5f5f5);
    border-radius: 4px 4px 0 0;
    user-select: none;
  }

  .accordion-header:focus-visible {
    outline: 2px solid var(--color-border-highlight, #4488cc);
  }

  .chevron {
    font-size: 0.75rem;
    width: 12px;
  }

  .drag-handle {
    cursor: grab;
    color: var(--color-text-light-heading, #999);
  }

  .panel-title {
    font-weight: bold;
    flex: 1;
  }

  .panel-summary {
    font-size: 0.85rem;
    color: var(--color-text-light-heading, #888);
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
  }

  .panel-actions button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .accordion-body {
    padding: 12px;
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
  }

  .set-name-row input {
    flex: 1;
  }

  .add-group-btn {
    margin: 8px 0;
  }

  .drop-zone-area {
    border: 2px dashed var(--color-border-light, #ccc);
    border-radius: 4px;
    padding: 12px;
    text-align: center;
    color: var(--color-text-light-heading, #999);
    margin: 8px 0;
  }
</style>
