<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  /**
   * @typedef {{ componentId: string, name: string, img: string, inventoryQuantity: number, workbenchQuantity: number, availableQuantity: number }} PaletteEntry
   */

  let {
    /** @type {PaletteEntry[]} */
    palette = [],
    /** @type {(componentId: string) => void} */
    onAddToWorkbench,
    /** @type {(componentId: string) => void} */
    onRemoveFromWorkbench
  } = $props();

  /**
   * Handle right-click on a palette cell.
   * Prevents the native context menu and removes the component from the workbench
   * only when the component is already present there (workbenchQuantity > 0).
   *
   * @param {MouseEvent} event
   * @param {PaletteEntry} component
   */
  function handleContextMenu(event, component) {
    event.preventDefault();
    if (component.workbenchQuantity > 0) {
      onRemoveFromWorkbench?.(component.componentId);
    }
  }

  /**
   * Handle drag start on a palette cell.
   * Sets drag data so the workbench can receive the component drop.
   *
   * @param {DragEvent} event
   * @param {PaletteEntry} component
   */
  function handleDragStart(event, component) {
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'component',
      componentId: component.componentId
    }));
    event.dataTransfer.effectAllowed = 'copy';
  }
</script>

<div class="alchemy-palette">
  {#if palette.length === 0}
    <div class="alchemy-palette-empty">
      <i class="fas fa-flask"></i>
      <p>{localize('FABRICATE.Alchemy.Palette.NoComponents')}</p>
    </div>
  {:else}
    {#each palette as component (component.componentId)}
      {@const isEmpty = component.availableQuantity === 0}
      <button
        type="button"
        class="alchemy-palette-cell"
        class:alchemy-palette-cell--empty={isEmpty}
        aria-label="{component.name} ({component.availableQuantity} {localize('FABRICATE.Alchemy.Palette.Available')})"
        disabled={isEmpty}
        draggable={!isEmpty}
        onclick={() => onAddToWorkbench?.(component.componentId)}
        oncontextmenu={(e) => handleContextMenu(e, component)}
        ondragstart={(e) => handleDragStart(e, component)}
      >
        <div class="alchemy-palette-img-wrapper">
          <img
            src={component.img || 'icons/svg/item-bag.svg'}
            alt={component.name}
            width="64"
            height="64"
            draggable="false"
          />
          <span
            class="alchemy-palette-badge"
            class:alchemy-palette-badge--zero={isEmpty}
          >{component.availableQuantity}</span>
        </div>
        <span class="alchemy-palette-cell-name">{component.name}</span>
      </button>
    {/each}
  {/if}
</div>

<style>
  .alchemy-palette {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: var(--fab-space-1);
    padding: var(--fab-space-1);
  }

  .alchemy-palette-empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-6);
    color: var(--fab-text-subtle);
    font-size: 13px;
  }

  .alchemy-palette-empty i {
    font-size: 24px;
    opacity: 0.5;
  }

  .alchemy-palette-empty p {
    margin: 0;
  }

  .alchemy-palette-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 4px;
    border-radius: var(--fab-v2-radius-panel);
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    cursor: grab;
    position: relative;
    min-height: 104px;
    user-select: none;
    font: inherit;
  }

  .alchemy-palette-cell:hover,
  .alchemy-palette-cell:focus-visible {
    background: var(--fab-accent-soft);
    border-color: var(--fab-accent);
  }

  .alchemy-palette-cell:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .alchemy-palette-cell--empty {
    opacity: 0.5;
    pointer-events: none;
    background: var(--fab-surface-raised);
  }

  .alchemy-palette-img-wrapper {
    position: relative;
    display: inline-block;
    overflow: visible;
  }

  .alchemy-palette-cell img {
    display: block;
    object-fit: contain;
    width: 64px;
    height: 64px;
  }

  .alchemy-palette-cell-name {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.2;
    text-align: center;
    color: var(--fab-text);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .alchemy-palette-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    display: inline-block;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    min-width: 20px;
    text-align: center;
    background: var(--fab-accent);
    color: #051e0c;
    border: 1px solid var(--fab-accent-strong);
  }

  .alchemy-palette-badge--zero {
    background: var(--fab-surface-raised);
    color: var(--fab-text-subtle);
    border-color: var(--fab-border);
  }
</style>
