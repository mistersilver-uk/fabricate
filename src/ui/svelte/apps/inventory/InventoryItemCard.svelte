<!-- Svelte 5 runes mode -->
<!--
  InventoryItemCard is one selectable owned item in the grid: a square thumbnail
  carrying every at-a-glance signal, with the item name beneath. Selecting it
  drives the right-hand inspector.

  SLOT GEOMETRY (issue 675). Every overlay sits INSIDE the thumbnail bounds and
  above it (`z-index: 2`), not floating outside the frame:

    top-right    quantity pip — REPLACED by a "Broken" pip when the item is a
                 broken tool. One slot, one ternary: they are the same element in
                 two ramps, never two elements (they would collide otherwise).
    top-left     a ROW of corner badges: salvageable (recycle) then tool (wrench).
                 The prototype puts both at one 18x18 slot, which is only safe
                 there because no prototype fixture is both. Fabricate's two flags
                 are orthogonal, and a broken salvageable tool is the headline
                 case, so they get adjacent slots with a gap.
    bottom-left  essence chips — the essence's OWN authored icon on a dark
                 circular chip. The chip is what makes an 8px glyph read against
                 arbitrary artwork; the icon set is GM-authored, never a fixed four.

  The card owns its thumbnail markup rather than reusing CraftingThumb: that
  component takes a px `size` and hard-sets width/height from it, so it cannot
  render this responsive `width:100%; aspect-ratio:1/1` square.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { item = null, selected = false, onSelect = null } = $props();

  const id = $derived(String(item?.key ?? ''));
  const name = $derived(String(item?.name ?? ''));
  const quantity = $derived(Number(item?.totalQuantity ?? 0));
  const isEssence = $derived(item?.isEssenceSource === true);
  const img = $derived(typeof item?.img === 'string' && item.img.trim() !== '' ? item.img : '');
  const icon = $derived(typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle');
  const quantityLabel = $derived(`×${quantity}`);
  // At-a-glance badges (component rows only): salvageable, tool. Essence rows carry
  // neither. `broken` is a derived, read-only runtime verdict — it does NOT gate
  // salvageability, so the recycle badge stands on a broken tool.
  const isTool = $derived(item?.isTool === true);
  const isSalvageable = $derived(item?.salvage?.enabled === true);
  const broken = $derived(item?.broken === true);
  const essencePips = $derived(Array.isArray(item?.essences) ? item.essences : []);
  const brokenLabel = $derived(localize('FABRICATE.App.Inventory.Card.Broken'));

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
  class:is-broken={broken}
  role="listitem"
  data-inventory-card={id}
  data-inventory-card-broken={broken ? 'true' : undefined}
>
  <button
    type="button"
    class="inventory-card-button"
    aria-pressed={selected}
    aria-label={broken ? `${name} — ${brokenLabel}` : `${name} — ${quantityLabel}`}
    title={name}
    onclick={select}
    onkeydown={onKey}
  >
    <span class="inventory-card-thumb">
      <span class="inventory-card-art" class:is-dimmed={broken}>
        {#if isEssence || !img}
          <span class="inventory-card-essence" aria-hidden="true">
            <i class={icon}></i>
          </span>
        {:else}
          <img src={img} alt="" draggable="false" />
        {/if}
      </span>
      {#if broken}
        <!-- The broken wash tints the artwork itself, under every overlay. -->
        <span class="inventory-card-broken-wash" aria-hidden="true"></span>
      {/if}

      <!-- ONE top-right slot. A broken item reports its brokenness there instead of
           its quantity: two elements in this slot would overlap. -->
      {#if broken}
        <span class="inventory-card-qty is-broken" data-inventory-qty data-inventory-qty-broken>
          {brokenLabel}
        </span>
      {:else}
        <span class="inventory-card-qty" data-inventory-qty>{quantityLabel}</span>
      {/if}

      {#if isSalvageable || isTool}
        <span class="inventory-card-badges" data-inventory-badges>
          {#if isSalvageable}
            <span
              class="inventory-card-badge is-salvageable"
              data-inventory-pip="salvageable"
              title={localize('FABRICATE.App.Inventory.Card.SalvageablePip')}
              aria-label={localize('FABRICATE.App.Inventory.Card.SalvageablePip')}
            >
              <i class="fas fa-recycle" aria-hidden="true"></i>
            </span>
          {/if}
          {#if isTool}
            <span
              class="inventory-card-badge is-tool"
              data-inventory-pip="tool"
              title={localize('FABRICATE.App.Inventory.Card.ToolPip')}
              aria-label={localize('FABRICATE.App.Inventory.Card.ToolPip')}
            >
              <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
            </span>
          {/if}
        </span>
      {/if}

      {#if essencePips.length > 0}
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
    /* Foundry's global `.app button` pins a fixed height and centers content; a card
       that sets only min-height gets cropped. Reset the inherited box (the
       EnvironmentCard pattern) — mounted tests cannot see this. */
    appearance: none;
    -webkit-appearance: none;
    height: auto;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 11px;
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    font: inherit;
    line-height: 1.15;
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
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-soft);
  }

  /* A broken item's card border is the outermost signal; it survives selection. */
  .inventory-card.is-broken .inventory-card-button {
    border-color: var(--fab-danger-border);
  }

  /* The thumbnail is the positioning context for every overlay: the pips sit INSIDE
     its bounds, not hanging off the card. */
  .inventory-card-thumb {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 8px;
    background: var(--fab-bg-3);
    overflow: hidden;
  }

  .inventory-card-art {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .inventory-card-art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .inventory-card-art.is-dimmed {
    opacity: 0.55;
  }

  /* Essence tile / image fallback: the item's own glyph on the thumb fill. */
  .inventory-card-essence {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--fab-accent);
    font-size: 18px;
  }

  .inventory-card-broken-wash {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: var(--fab-danger-soft);
    pointer-events: none;
  }

  .inventory-card-qty {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 2;
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--fab-border);
    background: var(--fab-bg-0);
    color: var(--fab-text);
    font-size: 9.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .inventory-card-qty.is-broken {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
    font-size: 9px;
    font-variant-numeric: normal;
  }

  /* Salvageable + tool are orthogonal in Fabricate (a broken salvageable tool is the
     headline case), so they take ADJACENT slots in a row rather than the prototype's
     single shared slot, which would stack two 18px badges. */
  .inventory-card-badges {
    position: absolute;
    top: 5px;
    left: 5px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .inventory-card-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1px solid var(--fab-border-strong);
    background: var(--fab-surface-active);
    color: var(--fab-text-secondary);
  }

  .inventory-card-badge i {
    font-size: 9px;
    line-height: 1;
  }

  .inventory-card-badge.is-salvageable {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
    color: var(--fab-info);
  }

  /* Essence chips: the chip exists so an 8px glyph reads on ANY artwork. The icon is
     the essence's own authored icon — never a fixed four mapped onto tag hues. */
  .inventory-card-pips {
    position: absolute;
    bottom: 5px;
    left: 5px;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .inventory-card-pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    border: 1px solid var(--fab-overlay-light-28);
    background: var(--fab-overlay-dark-78);
    color: var(--fab-text);
  }

  .inventory-card-pip i {
    font-size: 8px;
    line-height: 1;
  }

  .inventory-card-name {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.15;
  }
</style>
