<!-- Svelte 5 runes mode -->
<!--
  InventoryItemCard is one selectable owned item in the grid: a square thumbnail
  carrying every at-a-glance signal, with the item name beneath. Selecting it
  drives the right-hand inspector. It is ListRow's card layout (issue 1778): the
  thumbnail leads over a one-line name, the button is pressed by the inspected card
  or, while a bulk selection is open, by each bulk-selected card, and its name folds
  in every state the thumbnail only draws. A preview (`interactive={false}`) is the
  inert form.

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

  The card owns its thumbnail markup rather than reusing the shared art tile, and
  the reason is RE-MEASURED against the tile that survives rather than left pointing
  at the crafting thumbnail this adjudication was written against: `Medallion` writes
  `width:${size}px;height:${size}px` into a `style` attribute from a px `size` prop
  (`components/Medallion.svelte`, the `boxStyle` derivation), so it still cannot render
  this responsive `width:100%; aspect-ratio:1/1` square, and it declares no `class` and
  no rest spread through which a caller could override the box. The decision therefore
  STANDS at the point where the two tiles became one (issue 1506). What this card DOES
  reuse is the shared fallback constant `DEFAULT_CRAFTING_IMAGE`, so a component with no
  authored art shows the same blueprint every other tab shows rather than a broken-image
  glyph. The glyph path is for ESSENCES only, which have an authored icon and no artwork.
-->
<script>
  import ListRow from '../../components/ListRow.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { DEFAULT_CRAFTING_IMAGE } from '../../util/craftingImageDefaults.js';
  import { essenceTintToken } from '../../util/essenceTint.js';

  let {
    item = null,
    selected = false,
    bulkSelected = false,
    bulkActive = false,
    onSelect = null,
    onBulkToggle = null,
    // Issue 1036: the essence editor's "How players see it" preview mounts this REAL player
    // component twice with `onSelect`/`onBulkToggle` null, purely to show the tile. Left
    // interactive, that dropped two focusable, keyboard-operable, aria-pressed buttons that
    // no-op into the editor's tab order — a keyboard/screen-reader trap. `interactive`
    // defaults to true so the real player inventory (every other caller) is unchanged.
    interactive = true,
  } = $props();

  const id = $derived(String(item?.key ?? ''));
  const name = $derived(String(item?.name ?? ''));
  const quantity = $derived(Number(item?.totalQuantity ?? 0));
  const isEssence = $derived(item?.isEssenceSource === true);
  const img = $derived(typeof item?.img === 'string' && item.img.trim() !== '' ? item.img : '');
  const icon = $derived(
    typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle'
  );
  // Used by the essence glyph tile below AND each carrying-component pip. It moved to
  // `util/essenceTint.js` when the inspector needed the same fold for its own tile and its
  // essence chips: four copies of a sanitiser is four places for the palette rule to drift.

  // Issue 1036: the essence glyph tile renders in the essence's CHOSEN colour when one is set,
  // and stays the theme accent when it is not — mirroring the manager `Medallion` tint.
  // Anything unsanitisable DROPS to '' → no inline var is emitted → the CSS `var()` fallback
  // paints the accent, byte-identical to the pre-1036 render.
  const essenceTint = $derived(essenceTintToken(item?.colorToken));
  const essenceTintStyle = $derived(
    essenceTint ? `--fab-essence-tint:var(--fab-tag-${essenceTint})` : undefined
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
  const salvageableLabel = $derived(localize('FABRICATE.App.Inventory.Card.SalvageablePip'));
  const toolLabel = $derived(localize('FABRICATE.App.Inventory.Card.ToolPip'));
  const selectedSuffixLabel = $derived(localize('FABRICATE.App.Inventory.Card.SelectedSuffix'));
  const bulkSelectedPipLabel = $derived(localize('FABRICATE.App.Inventory.Card.BulkSelectedPip'));
  // The control's name is the visible name, then every state the thumbnail only draws (issue
  // 1778): the quantity or Broken pip, the corner badges, each carried essence, and the bulk
  // selection, which is added, never a replacement, so a broken selected card still says broken.
  const ariaLabel = $derived(
    [
      name,
      broken ? brokenLabel : quantityLabel,
      isSalvageable && salvageableLabel,
      isTool && toolLabel,
      ...essencePips.map((pip) => pip.name),
      bulkSelected && selectedSuffixLabel,
    ]
      .filter(Boolean)
      .join(', ')
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

{#snippet thumb()}
  <!-- The name carries every state drawn here, so the thumbnail is drawn only; its titles stay. -->
  <span class="inventory-card-thumb" aria-hidden="true">
    <span class="inventory-card-art" class:is-dimmed={broken}>
      {#if isEssence}
        <span
          class="inventory-card-essence"
          class:has-tint={Boolean(essenceTint)}
          data-inventory-essence-tint={essenceTint || undefined}
          style={essenceTintStyle}
        >
          <i class={icon}></i>
        </span>
      {:else}
        <img src={img || DEFAULT_CRAFTING_IMAGE} alt="" draggable="false" />
      {/if}
    </span>
    {#if broken}
      <!-- The broken wash tints the artwork itself, under every overlay. -->
      <span class="inventory-card-broken-wash"></span>
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
            title={salvageableLabel}
          >
            <i class="fas fa-recycle"></i>
          </span>
        {/if}
        {#if isTool}
          <span class="inventory-card-badge is-tool" data-inventory-pip="tool" title={toolLabel}>
            <i class="fas fa-screwdriver-wrench"></i>
          </span>
        {/if}
      </span>
    {/if}

    {#if essencePips.length > 0}
      <span class="inventory-card-pips" data-inventory-pips>
        {#each essencePips as pip (pip.id)}
          {@const pipTint = essenceTintToken(pip.colorToken)}
          <span
            class="inventory-card-pip"
            data-inventory-pip="essence"
            data-inventory-pip-tint={pipTint || undefined}
            title={pip.name}
            style={pipTint ? `--fab-pip-tint:var(--fab-tag-${pipTint})` : undefined}
          >
            <i class={pip.icon || 'fas fa-mortar-pestle'}></i>
          </span>
        {/each}
      </span>
    {/if}

    {#if bulkSelected}
      <span
        class="inventory-card-bulk-badge"
        data-inventory-bulk-badge
        title={bulkSelectedPipLabel}
      >
        <i class="fas fa-check"></i>
      </span>
    {/if}
  </span>
{/snippet}

<ListRow
  {name}
  layout="card"
  truncateName
  tone={broken ? 'danger' : 'neutral'}
  nameClass="inventory-card-name"
  class={[
    'inventory-card',
    {
      'is-selected': selected,
      'is-essence': isEssence,
      'is-bulk-selected': bulkSelected,
      'is-broken': broken,
    },
  ]}
  role="listitem"
  data-inventory-card={id}
  data-inventory-card-broken={broken ? 'true' : undefined}
  data-inventory-card-bulk-selected={bulkSelected ? 'true' : undefined}
  selected={bulkActive ? bulkSelected : selected}
  onOpen={interactive ? activate : null}
  openProps={{
    class: ['inventory-card-button', { 'is-static': !interactive }],
    'aria-label': interactive ? ariaLabel : undefined,
    'aria-keyshortcuts': interactive ? 'Shift+Enter Shift+Space' : undefined,
    title: name,
    onkeydown: interactive ? onKey : undefined,
  }}
  leading={thumb}
/>

<style>
  /* The card, its button, its hover, ring, pressed fill and edge, broken (danger) ground and
     one-line name are ListRow's card layout (issue 1778). The thumbnail takes the card's width. */
  :global(.inventory-card > .fabricate-list-row-open > .fabricate-list-row-leading) {
    align-self: stretch;
  }

  /* The thumbnail is the positioning context for every overlay: the pips sit INSIDE
     its bounds, not hanging off the card.

     HAND-ROLLED, AND DEFERRED ON THREE COUNTS (issue 1514). Every other art tile in this tab
     is `Medallion` now; this one cannot be, and none of the three reasons is about paint:

       1. the box is FLUID — `width: 100%` at `aspect-ratio: 1 / 1`, sized by the grid's
          `minmax(120px, 1fr)` track — while `Medallion` takes a px `size` and no ladder rung
          has a fluid value at all;
       2. this element is `position: relative` and is the positioning context for the quantity
          pip, the broken badge, the essence pips and the selection tick, all of which are
          absolutely positioned against it. `Medallion` declares no `position`, so the overlays
          would resolve against the card instead and hang off its bounds;
       3. the `<img>` inside carries `draggable="false"`, and `Medallion`'s own `<img>` has no
          `draggable` and no rest spread — the same blocker that defers the two progressive
          stage tiles.

     All three go to the register with their measurements. */
  .inventory-card-thumb {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 9px;
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

  /* Essence tile / image fallback: the item's own glyph on the thumb fill. Issue 1036: the
     glyph reads its colour through a `var()` FALLBACK, so an essence with no chosen colour
     resolves to exactly the `var(--fab-accent)` it painted before — while a coloured essence
     tints to its `--fab-tag-*` token (theme-aware, since the tokens are redefined per theme). */
  .inventory-card-essence {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--fab-essence-tint, var(--fab-accent));
    font-size: 18px;
  }

  /* The subtle surface wash, CLASS-GATED rather than folded into the base rule so it is a
     genuine no-op when unset (a `color-mix` against an unset property would tint every essence
     tile). Mirrors the manager `Medallion` wash so the player tile and the manager tile read
     the same side by side. */
  .inventory-card-essence.has-tint {
    background: color-mix(in srgb, var(--fab-essence-tint) 14%, var(--fab-bg-3));
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
    padding: var(--fab-space-2xs) var(--fab-space-chip);
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
    gap: var(--fab-space-1);
  }

  .inventory-card-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 6px;
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
    gap: var(--fab-space-1);
    max-width: calc(100% - 32px);
  }

  /* Issue 1036: the pip glyph tints to the carried essence's OWN chosen colour when one is
     set — mirroring the essence-source tile above and `Medallion` — and stays `--fab-text`
     when it is not, via the same `var()` fallback pattern so an uncoloured pip is
     byte-identical to the pre-1036 render. */
  .inventory-card-pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    border: 1px solid var(--fab-overlay-light-28);
    background: var(--fab-overlay-dark-78);
    color: var(--fab-pip-tint, var(--fab-text));
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
</style>
