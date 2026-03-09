<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { items = [], searchTerm = '', onSearch, onDragStart } = $props();

  function handleDragStart(event, item) {
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'systemItem',
      systemItemId: item.id
    }));
    event.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(event, item);
  }

  function handleSearchInput(event) {
    onSearch?.(event.target.value);
  }
</script>

<aside class="item-picker-panel">
  <div class="picker-sticky-header">
    <h3 class="picker-heading">{localize('FABRICATE.Editor.ItemPicker.SectionTitle')}</h3>
    <input
      type="text"
      class="picker-search"
      value={searchTerm}
      placeholder={localize('FABRICATE.Editor.ItemPicker.SearchPlaceholder')}
      oninput={handleSearchInput}
      aria-label={localize('FABRICATE.Editor.ItemPicker.SearchPlaceholder')}
    />
  </div>

  {#if items.length > 0}
    <div class="picker-grid">
      {#each items as item (item.id)}
        <div
          class="picker-card"
          draggable="true"
          ondragstart={(e) => handleDragStart(e, item)}
          role="listitem"
          title={item.name}
        >
          <img src={item.img || 'icons/svg/item-bag.svg'} alt={item.name} class="picker-card-img" />
          <span class="picker-card-name">{item.name}</span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="picker-empty">{localize('FABRICATE.Editor.ItemPicker.EmptyState')}</p>
  {/if}
</aside>

<style>
  .item-picker-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    border-left: 1px solid var(--color-border-light, #ccc);
    padding: 0;
    min-width: 200px;
    max-width: 280px;
  }

  .picker-sticky-header {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--color-bg-option, #fff);
    padding: 8px;
    border-bottom: 1px solid var(--color-border-light, #ccc);
  }

  .picker-heading {
    margin: 0 0 6px;
    font-size: 1rem;
  }

  .picker-search {
    width: 100%;
    box-sizing: border-box;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 6px;
    padding: 8px;
  }

  .picker-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px;
    border: 1px solid var(--color-border-light, #ddd);
    border-radius: 4px;
    cursor: grab;
    overflow: hidden;
    text-align: center;
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
  }

  .picker-card:hover {
    background: var(--color-bg-option, #f0f0f0);
  }

  .picker-card-img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  .picker-card-name {
    font-size: 0.75rem;
    line-height: 1.2;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .picker-empty {
    color: var(--color-text-light-heading, #888);
    font-style: italic;
    text-align: center;
    padding: 16px 0;
  }
</style>
