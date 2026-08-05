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
    bottom-right bulk-select check badge (issue 859), 19px, inset 5px from the
                 thumb's bottom/right edges. Only the FOURTH slot in the thumb, so
                 it does not collide with the top-right quantity pip or the
                 top-left badge row — but it DOES sit directly above the
                 bottom-left essence chips, which are `flex-wrap` with no width
                 limit of their own; `.inventory-card-pips` therefore carries
                 `max-width: calc(100% - 32px)` to keep a wide essence row clear of
                 this slot rather than running under it.

  The card owns its thumbnail markup rather than reusing CraftingThumb: that
  component takes a px `size` and hard-sets width/height from it, so it cannot
  render this responsive `width:100%; aspect-ratio:1/1` square. It DOES reuse
  CraftingThumb's fallback constant, so a component with no authored art shows the
  same blueprint every other tab shows rather than a broken-image glyph. The glyph
  path is for ESSENCES only, which have an authored icon and no artwork.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { DEFAULT_CRAFTING_IMAGE } from '../../util/craftingImageDefaults.js';

  let {
    item = null,
    selected = false,
    bulkSelected = false,
    bulkActive = false,
    onSelect = null,
    onBulkToggle = null,
  } = $props();

  const id = $derived(String(item?.key ?? ''));
  const name = $derived(String(item?.name ?? ''));
  const quantity = $derived(Number(item?.totalQuantity ?? 0));
  const isEssence = $derived(item?.isEssenceSource === true);
  const img = $derived(typeof item?.img === 'string' && item.img.trim() !== '' ? item.img : '');
  const icon = $derived(
    typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle'
  );
  const quantityLabel = $derived(`×${quantity}`);
  // At-a-glance badges (component rows only): salvageable, tool. Essence rows carry
  // neither. `broken` is a read-only verdict decided builder-side — it does NOT gate
  // salvageability, so the recycle badge stands on a broken tool.
  const isTool = $derived(item?.isTool === true);
  const isSalvageable = $derived(item?.salvage?.enabled === true);
  const broken = $derived(item?.broken === true);
  const essencePips = $derived(Array.isArray(item?.essences) ? item.essences : []);
  const brokenLabel = $derived(localize('FABRICATE.App.Inventory.Card.Broken'));
  const selectedSuffixLabel = $derived(localize('FABRICATE.App.Inventory.Card.SelectedSuffix'));
  const bulkSelectedPipLabel = $derived(localize('FABRICATE.App.Inventory.Card.BulkSelectedPip'));
  const baseAriaLabel = $derived(
    broken ? `${name} — ${brokenLabel}` : `${name} — ${quantityLabel}`
  );
  // The bulk-selected suffix is ADDED to the existing label, never a replacement —
  // a broken selected card must still announce its brokenness.
  const ariaLabel = $derived(
    bulkSelected ? `${baseAriaLabel} — ${selectedSuffixLabel}` : baseAriaLabel
  );

  // One handler serves click AND keydown: both MouseEvent and KeyboardEvent carry
  // `shiftKey`, so the keyboard equivalent (Shift+Enter / Shift+Space) falls out
  // free rather than needing its own branch. `preventDefault()` on the shift path
  // is required — without it the browser starts a text selection across the grid.
  // `onBulkToggle` is a prop the parent may not have wired yet; it degrades to a
  // no-op via optional chaining rather than throwing.
  function activate(event) {
    if (event?.shiftKey) {
      event.preventDefault();
      onBulkToggle?.(id);
      return;
    }
    onSelect?.(id);
  }
  function onKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      // Stops a double activation on click-emulating keys AND stops a double
      // TOGGLE on the shift path, which would otherwise silently cancel itself.
      event.preventDefault();
      activate(event);
    }
  }
</script>

<div
  class="inventory-card"
  class:is-selected={selected}
  class:is-essence={isEssence}
  class:is-bulk-selected={bulkSelected}
  class:is-broken={broken}
  role="listitem"
  data-inventory-card={id}
  data-inventory-card-broken={broken ? 'true' : undefined}
  data-inventory-card-bulk-selected={bulkSelected ? 'true' : undefined}
>
  <button
    type="button"
    class="inventory-card-button"
    aria-pressed={bulkActive ? bulkSelected : selected}
    aria-label={ariaLabel}
    aria-keyshortcuts="Shift+Enter Shift+Space"
    title={name}
    onclick={activate}
    onkeydown={onKey}
  >
    <span class="inventory-card-thumb">
      <span class="inventory-card-art" class:is-dimmed={broken}>
        {#if isEssence}
          <span class="inventory-card-essence" aria-hidden="true">
            <i class={icon}></i>
          </span>
        {:else}
          <img src={img || DEFAULT_CRAFTING_IMAGE} alt="" draggable="false" />
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

      {#if bulkSelected}
        <span
          class="inventory-card-bulk-badge"
          data-inventory-bulk-badge
          title={bulkSelectedPipLabel}
          aria-label={bulkSelectedPipLabel}
        >
          <i class="fas fa-check" aria-hidden="true"></i>
        </span>
      {/if}
    </span>
    <span class="inventory-card-name">{name}</span>
  </button>
</div>

<style>
  /* The grid stretches its ITEMS, but the item is this wrapper and the visible card is
     the BUTTON inside it — so a wrapped name grew the wrapper while the button kept its
     own short height, and a row of cards came out ragged. Making the wrapper a flex row
     stretches the button to the wrapper's (row's) height on the cross axis, so the
     tallest name in a row sets the row and every card in it matches. Done here rather
     than with `height: 100%`, which the Foundry `height: auto` reset below would have
     to undo. */
  .inventory-card {
    min-width: 0;
    display: flex;
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
    /* The RESTING card is the darker page fill, NOT --surface-soft. That baseline is
       what makes selection's --accent-soft fill a visible change: filling a
       --surface-soft card with --surface-soft is a no-op, and selection then collapses
       to a 1px border shifting alpha. */
    background: var(--fab-bg-2);
    color: var(--fab-text);
    font: inherit;
    line-height: 1.15;
    cursor: pointer;
    text-align: center;
  }

  /* Written explicitly, as every sibling selectable card does
     (`.gathering-env-card.is-available:not(.is-selected):hover`,
     `.journal-run-card:not(.is-selected):hover`): hover must not repaint over the
     selected fill. */
  .inventory-card:not(.is-selected) .inventory-card-button:hover {
    background: var(--fab-surface-raised);
  }

  .inventory-card-button:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* Full-strength accent border + a tinted fill, matching all four sibling selectable
     surfaces. */
  .inventory-card.is-selected .inventory-card-button {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  /* Bulk-selected treatment (issue 859): a softer fill than single-selection plus a
     1px accent ring, so a multi-selected card reads distinctly from the single
     inspected one. Declared BEFORE `.is-broken` so equal-specificity cascade order
     lets the broken rule's border-color win when both classes are present — a
     broken selected card keeps its danger border rather than being signalled by
     the 19px check badge alone. */
  .inventory-card.is-bulk-selected .inventory-card-button {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-active);
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
    padding: 2px 7px;
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
    font-size: 8px;
    line-height: 1;
  }

  .inventory-card-badge.is-salvageable {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
    color: var(--fab-info);
  }

  /* Essence chips: the chip exists so an 8px glyph reads on ANY artwork. The icon is
     the essence's own authored icon — never a fixed four mapped onto tag hues.
     max-width reserves the bottom-right bulk-select badge slot (issue 859): this
     row is `flex-wrap` with no width limit of its own, and four essences already
     reach ~73px in a ~98px thumb — enough to run under a 19px badge inset 5px from
     the right without this constraint. */
  .inventory-card-pips {
    position: absolute;
    bottom: 5px;
    left: 5px;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    max-width: calc(100% - 32px);
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

  /* Bulk-select check badge (issue 859): the fourth thumb slot, bottom-right,
     mirroring the top-right quantity pip's 5px inset. Accent-filled so it reads as
     a positive confirmation distinct from the neutral quantity pip and the danger
     broken pip. */
  .inventory-card-bulk-badge {
    position: absolute;
    bottom: 5px;
    right: 5px;
    z-index: 2;
    width: 19px;
    height: 19px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid var(--fab-accent-border);
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .inventory-card-bulk-badge i {
    font-size: 9px;
    line-height: 1;
  }

  /* The name WRAPS and the card grows to fit it (the prototype's behaviour). A card is
     a 120px-wide column, so an ellipsis here is not an edge case — "Masterwork
     Armorer's Jig" and most authored component names are longer than one line, and
     truncating turned the grid's only text into "Smoke Cracked Am…". The grid's rows
     stretch, so the taller card sets its row's height rather than overlapping. */
  .inventory-card-name {
    min-width: 0;
    max-width: 100%;
    /* `anywhere` so a single unbroken token longer than the card still breaks instead
       of overflowing the frame it cannot be trimmed to fit. */
    overflow-wrap: anywhere;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.25;
  }
</style>
