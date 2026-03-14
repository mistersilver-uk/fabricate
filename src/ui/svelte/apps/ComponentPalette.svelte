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
      <div
        class="alchemy-palette-cell"
        class:alchemy-palette-cell--empty={isEmpty}
        role="button"
        aria-label="{component.name} ({component.availableQuantity} {localize('FABRICATE.Alchemy.Palette.Available')})"
        aria-disabled={isEmpty ? 'true' : undefined}
        tabindex={isEmpty ? -1 : 0}
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
      </div>
    {/each}
  {/if}
</div>

<style>
  .alchemy-palette {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 6px;
    padding: 4px;
  }

  .alchemy-palette-empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    color: rgba(0, 0, 0, 0.4);
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
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background: rgba(0, 0, 0, 0.04);
    cursor: grab;
    position: relative;
    min-height: 104px;
    user-select: none;
  }

  .alchemy-palette-cell:hover {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.2);
  }

  .alchemy-palette-cell--empty {
    opacity: 0.35;
    pointer-events: none;
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
    font-size: 12px;
    font-weight: 700;
    min-width: 20px;
    text-align: center;
    background: var(--fabricate-primary, #4a90d9);
    color: #fff;
  }

  .alchemy-palette-badge--zero {
    background: rgba(0, 0, 0, 0.2);
    color: rgba(255, 255, 255, 0.5);
  }
</style>
