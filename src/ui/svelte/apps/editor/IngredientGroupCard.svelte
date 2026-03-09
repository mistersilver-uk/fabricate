<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    group,
    groupIndex,
    setIndex = 0,
    itemMap = new Map(),
    showItemTags = false,
    showComplexRecipes = false,
    allTags = [],
    hasError = false,
    onAddOption,
    onRemoveOption,
    onRemoveGroup,
    onClearComponent,
    onDropIngredient,
    onUpdateOption,
    onUpdateGroupName
  } = $props();

  function resolveItem(componentId) {
    if (!componentId) return null;
    return itemMap.get(componentId) || null;
  }

  function handleDrop(event, optionIndex) {
    event.preventDefault();
    try {
      const raw = event.dataTransfer.getData('text/plain');
      const data = JSON.parse(raw);
      if (data.type === 'systemItem' && data.systemItemId) {
        onDropIngredient?.(setIndex, groupIndex, optionIndex, data.systemItemId);
      }
    } catch { /* ignore non-JSON drops */ }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }
</script>

<div class="ingredient-group-card" class:group-error={hasError} data-group-id={group.id}>
  <div class="group-header">
    <input
      type="text"
      class="group-name-input"
      value={group.name}
      oninput={(e) => onUpdateGroupName?.(setIndex, groupIndex, e.target.value)}
      aria-label={localize('FABRICATE.Editor.IngredientSets.GroupTitle')}
    />
    {#if showComplexRecipes}
      <button
        type="button"
        class="icon-button danger"
        onclick={() => onRemoveGroup?.(setIndex, groupIndex)}
        title={localize('FABRICATE.Editor.IngredientSets.RemoveGroup')}
      >
        <i class="fas fa-trash"></i>
      </button>
    {/if}
  </div>

  <table class="ingredient-options-table">
    <thead>
      <tr>
        <th>{localize('FABRICATE.Editor.IngredientOptions.MatchTypeLabel')}</th>
        <th>{localize('FABRICATE.Editor.IngredientOptions.RequirementLabel')}</th>
        <th>{localize('FABRICATE.Ingredient.Quantity')}</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each group.options || [] as option, optionIndex}
        {#if optionIndex > 0}
          <tr class="or-separator"><td colspan="4">{localize('FABRICATE.Editor.IngredientOptions.OrSeparator')}</td></tr>
        {/if}
        <tr
          class="option-row"
          ondrop={(e) => handleDrop(e, optionIndex)}
          ondragover={handleDragOver}
        >
          <td>
            <select
              value={option.matchType}
              onchange={(e) => onUpdateOption?.(setIndex, groupIndex, optionIndex, 'matchType', e.target.value)}
            >
              <option value="component">{localize('FABRICATE.Editor.IngredientOptions.MatchManaged')}</option>
              {#if showItemTags}
                <option value="tags">{localize('FABRICATE.Editor.IngredientOptions.MatchTag')}</option>
              {/if}
            </select>
          </td>
          <td>
            {#if option.matchType === 'tags' && showItemTags}
              <div class="tag-match-fields">
                <input
                  type="text"
                  value={option.tagsText || ''}
                  placeholder={localize('FABRICATE.Editor.IngredientOptions.TagTextPlaceholder')}
                  oninput={(e) => onUpdateOption?.(setIndex, groupIndex, optionIndex, 'tagsText', e.target.value)}
                  list="tag-datalist-{setIndex}-{groupIndex}-{optionIndex}"
                />
                <datalist id="tag-datalist-{setIndex}-{groupIndex}-{optionIndex}">
                  {#each allTags as tag}
                    <option value={tag}></option>
                  {/each}
                </datalist>
                <select
                  value={option.tagMatch || 'any'}
                  onchange={(e) => onUpdateOption?.(setIndex, groupIndex, optionIndex, 'tagMatch', e.target.value)}
                >
                  <option value="any">{localize('FABRICATE.Editor.IngredientOptions.TagMatchAny')}</option>
                  <option value="all">{localize('FABRICATE.Editor.IngredientOptions.TagMatchAll')}</option>
                </select>
              </div>
            {:else}
              {@const item = resolveItem(option.componentId)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="item-cell" ondrop={(e) => handleDrop(e, optionIndex)} ondragover={handleDragOver}>
                {#if item}
                  <img src={item.img || 'icons/svg/item-bag.svg'} alt={item.name} class="item-thumb" />
                  <span class="item-name">{item.name}</span>
                  <button
                    type="button"
                    class="icon-button"
                    onclick={() => onClearComponent?.(setIndex, groupIndex, optionIndex)}
                    title={localize('FABRICATE.Editor.IngredientOptions.ClearComponent')}
                  >
                    <i class="fas fa-times"></i>
                  </button>
                {:else}
                  <span class="no-item">{localize('FABRICATE.Editor.IngredientOptions.NoItemSelected')}</span>
                {/if}
              </div>
            {/if}
          </td>
          <td>
            <input
              type="number"
              min="1"
              value={option.quantity}
              oninput={(e) => onUpdateOption?.(setIndex, groupIndex, optionIndex, 'quantity', Number(e.target.value) || 1)}
              class="qty-input"
            />
          </td>
          <td>
            {#if (group.options || []).length > 1}
              <button
                type="button"
                class="icon-button danger"
                onclick={() => onRemoveOption?.(setIndex, groupIndex, optionIndex)}
                title={localize('FABRICATE.Editor.IngredientOptions.RemoveOption')}
              >
                <i class="fas fa-minus"></i>
              </button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <button type="button" class="add-option-btn" onclick={() => onAddOption?.(setIndex, groupIndex)}>
    <i class="fas fa-plus"></i> {localize('FABRICATE.Editor.IngredientOptions.AddOption')}
  </button>
</div>

<style>
  .ingredient-group-card {
    border: 1px solid var(--color-border-light, #ddd);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 8px;
  }

  .group-error {
    border-color: var(--color-border-error, #dc3545);
    box-shadow: 0 0 0 1px var(--color-border-error, #dc3545);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .group-name-input {
    flex: 1;
    font-weight: bold;
  }

  .ingredient-options-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6px;
  }

  .ingredient-options-table th {
    text-align: left;
    font-size: 0.8rem;
    padding: 2px 4px;
    border-bottom: 1px solid var(--color-border-light, #ddd);
  }

  .ingredient-options-table td {
    padding: 4px;
    vertical-align: middle;
  }

  .or-separator td {
    text-align: center;
    font-weight: bold;
    font-size: 0.8rem;
    color: var(--color-text-light-heading, #888);
    padding: 2px;
  }

  .item-cell {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .item-thumb {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .no-item {
    color: var(--color-text-light-heading, #999);
    font-style: italic;
  }

  .qty-input {
    width: 50px;
  }

  .tag-match-fields {
    display: flex;
    gap: 4px;
  }

  .tag-match-fields input {
    flex: 1;
  }

  .icon-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
  }

  .icon-button.danger {
    color: var(--color-text-error, #c00);
  }

  .add-option-btn {
    font-size: 0.85rem;
  }
</style>
