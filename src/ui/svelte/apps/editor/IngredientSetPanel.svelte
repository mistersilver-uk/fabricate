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
    onUpdateCatalyst,
    // Essence actions
    showEssences = false,
    allEssences = [],
    onAddEssence,
    onUpdateEssence,
    onRemoveEssence
  } = $props();

  let selectedNewEssence = $state('');

  const addableEssences = $derived(
    (allEssences || []).filter(def => !Object.hasOwn(set?.essences || {}, def.id))
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
          <div class="essence-grid">
            {#each Object.entries(set?.essences || {}) as [essenceId, quantity]}
              {@const def = allEssences.find(e => e.id === essenceId)}
              <article class="essence-card">
                <button
                  type="button"
                  class="essence-step essence-step-minus"
                  disabled={quantity <= 1}
                  onclick={() => onUpdateEssence?.(setIndex, essenceId, Math.max(1, quantity - 1))}
                  aria-label={localize('FABRICATE.Editor.Essences.Decrement', { name: def?.name || essenceId })}
                  title={localize('FABRICATE.Editor.Essences.Decrement', { name: def?.name || essenceId })}
                >
                  <i class="fas fa-minus"></i>
                </button>

                <input
                  class="essence-quantity-input"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  aria-label={localize('FABRICATE.Editor.Essences.QuantityLabel')}
                  oninput={(e) => {
                    const val = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    onUpdateEssence?.(setIndex, essenceId, val);
                  }}
                />

                <div class="essence-icon" aria-hidden="true">
                  {#if def?.icon}<i class={def.icon} aria-hidden="true"></i>{/if}
                </div>

                <strong class="essence-name">{def?.name || essenceId}</strong>

                <button
                  type="button"
                  class="essence-step essence-step-plus"
                  onclick={() => onUpdateEssence?.(setIndex, essenceId, quantity + 1)}
                  aria-label={localize('FABRICATE.Editor.Essences.Increment', { name: def?.name || essenceId })}
                  title={localize('FABRICATE.Editor.Essences.Increment', { name: def?.name || essenceId })}
                >
                  <i class="fas fa-plus"></i>
                </button>

                <button
                  type="button"
                  class="essence-remove"
                  onclick={() => onRemoveEssence?.(setIndex, essenceId)}
                  title={localize('FABRICATE.Admin.Features.Essences.Remove')}
                  aria-label={localize('FABRICATE.Admin.Features.Essences.Remove')}
                >
                  <i class="fas fa-times"></i>
                </button>
              </article>
            {/each}
          </div>
          {#if addableEssences.length > 0}
            <div class="add-essence-row">
              <select value={selectedNewEssence} onchange={(e) => selectedNewEssence = e.target.value}>
                <option value="">{localize('FABRICATE.Editor.Essences.SelectPlaceholder')}</option>
                {#each addableEssences as def}
                  <option value={def.id}>{def.name}</option>
                {/each}
              </select>
              <button type="button" disabled={!selectedNewEssence}
                onclick={() => { onAddEssence?.(setIndex, selectedNewEssence, 1); selectedNewEssence = ''; }}>
                <i class="fas fa-plus"></i> {localize('FABRICATE.Editor.Essences.Add')}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .accordion-panel {
    border: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
    border-radius: 10px;
    margin-bottom: 8px;
    overflow: hidden;
    background: var(--fabricate-editor-surface-soft, rgba(255, 255, 255, 0.05));
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
  }

  .accordion-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    cursor: pointer;
    background: rgba(0, 0, 0, 0.18);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
    color: var(--fabricate-editor-muted, rgba(255, 229, 210, 0.68));
  }

  .panel-title {
    font-weight: bold;
    flex: 1;
    color: var(--fabricate-editor-text, rgba(255, 243, 232, 0.92));
  }

  .panel-summary {
    font-size: 0.85rem;
    color: var(--fabricate-editor-muted, rgba(255, 229, 210, 0.68));
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
    color: var(--fabricate-editor-muted, rgba(255, 229, 210, 0.68));
  }

  .panel-actions button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .panel-actions button:hover:not(:disabled),
  .panel-actions button:focus-visible:not(:disabled) {
    background: var(--fabricate-editor-input-bg-hover, rgba(255, 255, 255, 0.07));
    color: var(--fabricate-editor-text, rgba(255, 243, 232, 0.92));
  }

  .accordion-body {
    padding: 12px;
    background: rgba(0, 0, 0, 0.12);
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
    color: var(--fabricate-editor-muted-strong, rgba(255, 236, 220, 0.82));
  }

  .set-name-row input {
    flex: 1;
  }

  .add-group-btn {
    margin: 8px 0;
  }

  .drop-zone-area {
    border: 2px dashed rgba(148, 190, 255, 0.3);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
    color: var(--fabricate-editor-muted, rgba(255, 229, 210, 0.68));
    margin: 8px 0;
    background: rgba(74, 144, 226, 0.08);
  }

  .essence-requirements {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .essence-requirements h4 {
    margin: 0 0 8px 0;
    font-size: 0.9rem;
    color: var(--fabricate-editor-muted-strong, rgba(255, 236, 220, 0.82));
  }

  .essence-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .essence-card {
    display: grid;
    grid-template-columns: auto auto auto 1fr auto auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
    background: rgba(255, 255, 255, 0.04);
  }

  .essence-step {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
    background: rgba(255, 255, 255, 0.04);
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
  .essence-step:focus-visible:not(:disabled) {
    border-color: var(--color-border-highlight, #4488cc);
    background: rgba(255, 255, 255, 0.08);
  }

  .essence-step:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .essence-quantity-input {
    width: 44px;
    min-width: 44px;
    height: 28px;
    text-align: center;
    padding: 0 4px;
    border-radius: 5px;
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
    background: rgba(255, 255, 255, 0.06);
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

  .essence-remove {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: none;
    color: var(--fabricate-editor-muted, rgba(255, 229, 210, 0.68));
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }

  .essence-remove i {
    font-size: 9px;
  }

  .essence-remove:hover,
  .essence-remove:focus-visible {
    color: var(--fabricate-editor-danger, rgba(255, 216, 208, 0.95));
    background: var(--fabricate-editor-danger-soft, rgba(220, 53, 69, 0.18));
    border-color: var(--fabricate-editor-danger-soft, rgba(220, 53, 69, 0.18));
  }

  .add-essence-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .add-essence-row select {
    flex: 1;
  }

  @media (max-width: 720px) {
    .essence-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
