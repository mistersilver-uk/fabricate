<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { items = [], searchTerm = '', onSearch, onDragStart } = $props();

  function handleDragStart(event, item) {
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'component',
      componentId: item.id
    }));
    event.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(event, item);
  }

  function handleSearchInput(event) {
    onSearch?.(event.target.value);
  }
</script>

<aside class="item-picker-panel">
  <div class="picker-header">
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

  <div class="picker-grid-scroll">
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
  </div>
</aside>

<style>
  .item-picker-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    border-left: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
    background: var(--fabricate-editor-surface, rgba(0, 0, 0, 0.16));
    padding: 0;
    min-width: 200px;
    max-width: 280px;
  }

  .picker-header {
    flex: 0 0 auto;
    background: var(--fabricate-editor-menu-bg, #171b26);
    padding: 10px;
    border-bottom: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
  }

  .picker-heading {
    margin: 0 0 6px;
    font-size: 1rem;
    color: var(--fabricate-editor-muted-strong, rgba(255, 236, 220, 0.82));
  }

  .picker-search {
    width: 100%;
    box-sizing: border-box;
  }

  .picker-grid-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
    padding: 10px;
  }

  .picker-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 6px;
    border: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--fabricate-editor-input-bg, rgba(255, 255, 255, 0.04));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    cursor: grab;
    overflow: hidden;
    text-align: center;
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    min-height: 86px;
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }

  .picker-card:hover {
    background: var(--fabricate-editor-accent-soft, rgba(74, 144, 226, 0.22));
    border-color: rgba(148, 190, 255, 0.3);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.18);
    transform: translateY(-1px);
  }

  .picker-card-img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  .picker-card-name {
    font-size: 0.75rem;
    line-height: 1.2;
    color: var(--fabricate-editor-text, rgba(255, 243, 232, 0.92));
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .picker-empty {
    color: var(--fabricate-editor-muted, rgba(255, 229, 210, 0.68));
    font-style: italic;
    text-align: center;
    padding: 18px 12px;
  }

  @media (max-width: 1100px) {
    .item-picker-panel {
      min-width: 0;
      max-width: none;
      max-height: 260px;
      border-left: 0;
      border-top: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
    }
  }
</style>
