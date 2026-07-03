<!-- Svelte 5 runes mode -->
<!--
  InventoryItemCard is one selectable owned item in the grid: a square thumbnail
  (component image, or a Font Awesome tile for an essence row) with an overlaid
  quantity badge, and the item name beneath. Selecting it drives the right-hand
  detail panel. The card treatment mirrors RecipeListRow (border + surface-soft,
  accent border/fill when selected).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from '../crafting/CraftingThumb.svelte';

  let { item = null, selected = false, onSelect = null } = $props();

  const id = $derived(String(item?.key ?? ''));
  const name = $derived(String(item?.name ?? ''));
  const quantity = $derived(Number(item?.totalQuantity ?? 0));
  const isEssence = $derived(item?.isEssenceSource === true);
  const icon = $derived(typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle');
  const quantityLabel = $derived(`×${quantity}`);
  // At-a-glance pips (component rows only): one per essence the component carries,
  // plus a tool pip when it is a registered tool. Essence rows carry neither.
  const isTool = $derived(item?.isTool === true);
  const essencePips = $derived(Array.isArray(item?.essences) ? item.essences : []);

  function select() {
    onSelect?.(id);
  }
  function onKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      select();
    }
  }
</script>

<div
  class="inventory-card"
  class:is-selected={selected}
  class:is-essence={isEssence}
  role="listitem"
  data-inventory-card={id}
>
  <button
    type="button"
    class="inventory-card-button"
    aria-pressed={selected}
    aria-label={`${name} — ${quantityLabel}`}
    title={name}
    onclick={select}
    onkeydown={onKey}
  >
    <span class="inventory-card-thumb">
      {#if isEssence}
        <span class="inventory-card-essence" aria-hidden="true">
          <i class={icon}></i>
        </span>
      {:else}
        <CraftingThumb src={item?.img ?? ''} alt="" size={72} />
      {/if}
      <span class="inventory-card-qty" data-inventory-qty>{quantityLabel}</span>
      {#if essencePips.length > 0 || isTool}
        <span class="inventory-card-pips" data-inventory-pips>
          {#each essencePips as pip (pip.id)}
            <span
              class="inventory-card-pip"
              data-inventory-pip="essence"
              title={pip.name}
              aria-label={pip.name}
            >
              <i class={pip.icon || 'fas fa-mortar-pestle'} aria-hidden="true"></i>
            </span>
          {/each}
          {#if isTool}
            <span
              class="inventory-card-pip is-tool"
              data-inventory-pip="tool"
              title={localize('FABRICATE.App.Inventory.Card.ToolPip')}
              aria-label={localize('FABRICATE.App.Inventory.Card.ToolPip')}
            >
              <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
            </span>
          {/if}
        </span>
      {/if}
    </span>
    <span class="inventory-card-name">{name}</span>
  </button>
</div>

<style>
  .inventory-card {
    min-width: 0;
  }

  .inventory-card-button {
    box-sizing: border-box;
    width: 100%;
    height: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    cursor: pointer;
    text-align: center;
  }

  .inventory-card-button:hover {
    background: var(--fab-surface-raised);
  }

  .inventory-card-button:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-card.is-selected .inventory-card-button {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  .inventory-card-thumb {
    position: relative;
    display: inline-flex;
  }

  /* Essence tile: an accent-tinted square carrying the essence's FA icon, so an
     essence row reads distinctly from an image-backed component. */
  .inventory-card-essence {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 6px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 28px;
  }

  .inventory-card-qty {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--fab-border-strong);
    background: var(--fab-bg-1);
    color: var(--fab-text);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  /* At-a-glance pips: a vertical stack on the right of the thumbnail, starting just
     below the quantity badge. */
  .inventory-card-pips {
    position: absolute;
    top: 20px;
    right: -6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .inventory-card-pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid var(--fab-border-strong);
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .inventory-card-pip i {
    font-size: 9px;
    line-height: 1;
  }

  .inventory-card-pip.is-tool {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .inventory-card-name {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }
</style>
