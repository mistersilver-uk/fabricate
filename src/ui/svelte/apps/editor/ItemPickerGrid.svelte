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
    border-left: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    background: var(--fab-editor-surface, var(--fab-overlay-dark-16));
    padding: 0;
    min-width: 200px;
    max-width: 280px;
  }

  .picker-header {
    flex: 0 0 auto;
    background: var(--fab-editor-menu-bg, var(--fab-editor-menu-bg));
    padding: 10px;
    border-bottom: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
  }

  .picker-heading {
    margin: 0 0 6px;
    font-size: 1rem;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
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
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }

  .picker-card {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    border-radius: 8px;
    background: var(--fab-editor-input-bg, var(--fab-overlay-light-04));
    box-shadow: inset 0 1px 0 var(--fab-overlay-light-03);
    cursor: grab;
    overflow: hidden;
    text-align: center;
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }

  .picker-card:hover {
    background: var(--fab-editor-accent-soft, var(--fab-editor-accent-soft));
    border-color: var(--fab-blue-border);
    box-shadow: 0 10px 20px var(--fab-overlay-dark-18);
    transform: translateY(-1px);
  }

  .picker-card-img {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  .picker-card-name {
    display: block;
    flex: 1 1 auto;
    font-size: 0.75rem;
    line-height: 1.2;
    color: var(--fab-editor-text, var(--fab-editor-text));
    max-width: 100%;
    min-width: 0;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-empty {
    color: var(--fab-editor-muted, var(--fab-editor-muted));
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
      border-top: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    }
  }
</style>
