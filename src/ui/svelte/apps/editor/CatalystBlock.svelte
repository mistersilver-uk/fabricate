<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    catalysts = [],
    setIndex = 0,
    itemMap = new Map(),
    onAdd,
    onRemove,
    onClear,
    onDrop,
    onUpdate
  } = $props();

  function resolveItem(componentId) {
    if (!componentId) return null;
    return itemMap.get(componentId) || null;
  }

  function handleDrop(event, catalystIndex) {
    event.preventDefault();
    try {
      const raw = event.dataTransfer.getData('text/plain');
      const data = JSON.parse(raw);
      if (data.type === 'component' && data.componentId) {
        onDrop?.(setIndex, catalystIndex, data.componentId);
      }
    } catch { /* ignore */ }
  }

  function handleNewDrop(event) {
    event.preventDefault();
    try {
      const raw = event.dataTransfer.getData('text/plain');
      const data = JSON.parse(raw);
      if (data.type === 'component' && data.componentId) {
        onAdd?.(setIndex);
        // Assign to the newly created catalyst (last index)
        onDrop?.(setIndex, catalysts.length, data.componentId);
      }
    } catch { /* ignore */ }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }
</script>

<div class="catalyst-block">
  <div class="catalyst-header">
    <h4>{localize('FABRICATE.Editor.Catalysts.SectionTitle')}</h4>
    <button type="button" onclick={() => onAdd?.(setIndex)} title={localize('FABRICATE.Editor.Catalysts.AddCatalyst')}>
      <i class="fas fa-plus"></i>
    </button>
  </div>

  {#if catalysts.length > 0}
    <table class="catalyst-table">
      <thead>
        <tr>
          <th>{localize('FABRICATE.Editor.Catalysts.ManagedItemHeader')}</th>
          <th>{localize('FABRICATE.Editor.Catalysts.DegradeHeader')}</th>
          <th>{localize('FABRICATE.Editor.Catalysts.MaxUsesHeader')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each catalysts as catalyst, idx}
          {@const item = resolveItem(catalyst.componentId)}
          <tr ondrop={(e) => handleDrop(e, idx)} ondragover={handleDragOver}>
            <td>
              <div class="item-cell">
                {#if item}
                  <img src={item.img || 'icons/svg/item-bag.svg'} alt={item.name} class="item-thumb" />
                  <span>{item.name}</span>
                  <button type="button" class="icon-button" onclick={() => onClear?.(setIndex, idx)}
                    title={localize('FABRICATE.Editor.IngredientOptions.ClearComponent')}>
                    <i class="fas fa-times"></i>
                  </button>
                {:else}
                  <span class="no-item">{localize('FABRICATE.Editor.IngredientOptions.NoItemSelected')}</span>
                {/if}
              </div>
            </td>
            <td>
              <input
                type="checkbox"
                checked={catalyst.degradesOnUse}
                onchange={(e) => onUpdate?.(setIndex, idx, 'degradesOnUse', e.target.checked)}
              />
            </td>
            <td>
              <input
                type="number"
                min="1"
                value={catalyst.maxUses ?? ''}
                placeholder="∞"
                oninput={(e) => onUpdate?.(setIndex, idx, 'maxUses', e.target.value ? Number(e.target.value) : null)}
                class="max-uses-input"
              />
            </td>
            <td>
              <button type="button" class="icon-button danger" onclick={() => onRemove?.(setIndex, idx)}
                title={localize('FABRICATE.Editor.Catalysts.RemoveCatalyst')}>
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="catalyst-empty" ondrop={handleNewDrop} ondragover={handleDragOver}>
      <i class="fas fa-flask"></i>
      {localize('FABRICATE.Editor.Catalysts.EmptyState')}
    </div>
  {/if}
</div>

<style>
  .catalyst-block {
    margin-top: 12px;
    border-top: 1px solid var(--color-border-light, #ddd);
    padding-top: 8px;
  }

  .catalyst-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .catalyst-header h4 {
    margin: 0;
    font-size: 0.9rem;
  }

  .catalyst-table {
    width: 100%;
    border-collapse: collapse;
  }

  .catalyst-table th {
    text-align: left;
    font-size: 0.8rem;
    padding: 2px 4px;
    border-bottom: 1px solid var(--color-border-light, #ddd);
  }

  .catalyst-table td {
    padding: 4px;
    vertical-align: middle;
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

  .max-uses-input {
    width: 60px;
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

  .catalyst-empty {
    border: 2px dashed var(--color-border-light, #ccc);
    border-radius: 4px;
    padding: 12px;
    text-align: center;
    color: var(--color-text-light-heading, #999);
    font-style: italic;
  }
</style>
