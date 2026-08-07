<!-- Svelte 5 runes mode -->
<!--
  InventoryDetailHeader is the ONE inspector shell both detail bodies render
  inside: the scrolling `.inventory-detail` column, the identity header
  (thumbnail + name + "N total" + chips), and the shared leaf styles their bodies
  author (sections, section eyebrows, row names, empty notes, chips).

  WHY A SHELL AND NOT JUST A HEADER (issue 675). `InventoryComponentDetail` and
  `InventoryBookDetail` were split out of one file and then hand-rolled the SAME
  eleven class names in their own scoped `<style>` blocks. Svelte scoping means
  neither copy can see the other, so they drifted silently and invisibly: clicking
  component -> book changed the name from serif 18/600 to sans 16/600, the thumb
  from 64px to 72px, the eyebrow from 10/700/.12em to 11/600/.06em, and the
  "N total" colour. Nothing but a single owner closes that — a review note cannot,
  and the copies would drift again on the next edit. The component's values are
  canonical.

  HOW THE SHARED LEAVES REACH A CONSUMER'S MARKUP. A body's sections, rows, chips
  and notes are authored in the BODY, so they carry the BODY's scope hash and this
  component's scoped rules can never match them. They are therefore published as
  `:global(:where(.inventory-detail) .x)` — ancestor-guarded, so they only ever
  apply inside an inventory inspector, and at `:where()`-zeroed specificity
  (exactly one class, 0-1-0), so ANY consumer rule — which always compiles to at
  least 0-2-0 once Svelte appends its scope hash — reliably overrides the base
  instead of tying with it. A plain `:global(.inventory-detail .x)` would be 0-2-0
  and would tie with (and randomly beat) `.inventory-chip-type`, silently
  reinstating the very drift this file removes.

  Props:
   - detailKey / attrs: the root's `data-inventory-detail` value and any extra
     root attributes the body needs (e.g. `data-inventory-recipe-item`).
   - img / icon: artwork, or an authored Font Awesome glyph for essences (which
     have an icon and no artwork). `icon` wins when set.
   - name: the item name (serif — reserved for item/product names, brief §2).
   - total: the ALREADY-localized "N total" line, so this stays i18n-free.
   - totalAttrs: extra attributes spread onto that line, matching the `attrs` /
     `chip.attrs` idiom. It exists because the count line is BOTH the shell's
     `total` slot and, for the bulk panel (issue 859), a polite live region: the
     panel announces "n selected · n salvageable · n skipped" as the selection
     changes. Without this prop the panel would have to re-roll
     `.inventory-detail-total` inside its own body — the drift this file exists
     to prevent.
   - headerAction: an optional snippet pinned to the RIGHT of the header (the
     bulk panel's Clear). It renders inside its OWN wrapper carrying
     `margin-left: auto; flex: 0 0 auto` rather than putting that rule on
     `.inventory-detail-heading` — a consumer passing no action then adds no flex
     child at all, so both existing consumers' geometry is provably byte-identical.
     `.inventory-detail-header` is a `flex` row whose heading declares no `flex`
     and sizes to content only because it is the last child today.
   - size: the header thumbnail's px dimension. 64 is canonical.
   - chips: `{ id, label, icon?, tone?, attrs? }[]` rendered as the header's chip
     row. Data, not a snippet: the chip markup and every tone then live here once,
     so a caller cannot re-roll them.
   - children: the body, rendered inside the scrolling column.
-->
<script>
  import CraftingThumb from '../../crafting/CraftingThumb.svelte';
  import { essenceTintToken } from '../../../util/essenceTint.js';

  let {
    detailKey = '',
    attrs = {},
    img = '',
    icon = '',
    name = '',
    total = '',
    totalAttrs = {},
    size = 64,
    chips = [],
    colorToken = '',
    headerAction = null,
    children = null,
  } = $props();

  const chipList = $derived(Array.isArray(chips) ? chips.filter((chip) => chip != null) : []);

  // Issue 1036: a selected ESSENCE wears its own colour here, exactly as it does on the
  // inventory tile and on the manager medallion — the inspector is the surface that
  // answers "which essence is this", so it cannot be the one place the colour is dropped.
  //
  // `has-tint` gates it rather than a `var(…, fallback)` chain, because the untinted tile
  // must render byte-identically to before: a fallback chain would still route the
  // background through `color-mix`, which is not the same paint as the flat `--fab-bg-3`
  // it has today. No token → no class → the shipped rule, untouched. `Medallion` already
  // states this convention.
  const tint = $derived(essenceTintToken(colorToken));
  const tintStyle = $derived(tint ? `;--fab-essence-tint:var(--fab-tag-${tint})` : '');
</script>

<div class="inventory-detail" data-inventory-detail={detailKey} {...attrs}>
  <header class="inventory-detail-header">
    {#if icon}
      <span
        class="inventory-detail-essence"
        class:has-tint={Boolean(tint)}
        style={`--inventory-detail-thumb-size:${size}px${tintStyle}`}
        data-essence-tint={tint || undefined}
        aria-hidden="true"
      >
        <i class={icon}></i>
      </span>
    {:else}
      <CraftingThumb src={img} alt="" {size} />
    {/if}
    <div class="inventory-detail-heading">
      <p class="inventory-detail-name">{name}</p>
      <p class="inventory-detail-total" {...totalAttrs}>{total}</p>
      {#if chipList.length > 0}
        <div class="inventory-detail-chips">
          {#each chipList as chip (chip.id)}
            <span class={`inventory-chip is-${chip.tone ?? 'neutral'}`} {...chip.attrs ?? {}}>
              {#if chip.icon}<i class={chip.icon} aria-hidden="true"></i>{/if}
              <span>{chip.label}</span>
            </span>
          {/each}
        </div>
      {/if}
    </div>
    {#if headerAction}
      <div class="inventory-detail-header-action">{@render headerAction()}</div>
    {/if}
  </header>

  {@render children?.()}
</div>

<style>
  .inventory-detail {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    overflow-y: auto;
  }

  .inventory-detail-header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  /* The essence tile stands in for the thumbnail at the SAME dimension, so the header
     geometry does not shift between an essence and a component. */
  .inventory-detail-essence {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--inventory-detail-thumb-size, 64px);
    height: var(--inventory-detail-thumb-size, 64px);
    border-radius: 8px;
    background: var(--fab-bg-3);
    color: var(--fab-accent);
    font-size: 24px;
  }

  /* The essence's own colour: the glyph takes it outright, and the tile washes toward it.
     The 14% wash is the same weight the manager `Medallion` uses for its surface, so the
     same essence reads as the same colour on both sides of the app. */
  .inventory-detail-essence.has-tint {
    background: color-mix(in srgb, var(--fab-essence-tint) 14%, var(--fab-bg-3));
    color: var(--fab-essence-tint);
  }

  .inventory-detail-heading {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Serif is reserved for item/product NAMES — nowhere else (brief §2). */
  .inventory-detail-name {
    margin: 0;
    font-family: var(--fab-font-serif);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.15;
  }

  .inventory-detail-total {
    margin: 0;
    font-size: 11.5px;
    font-weight: 400;
    color: var(--fab-text-subtle);
    font-variant-numeric: tabular-nums;
  }

  /* The rule lives HERE and not on `.inventory-detail-heading` deliberately: the
     heading has no `flex` and sizes to content only because it is the last child
     when no action is passed. Putting `margin-left: auto` on the heading would
     change every consumer; putting it on a wrapper that only exists when an
     action is passed changes none of them. */
  .inventory-detail-header-action {
    margin-left: auto;
    flex: 0 0 auto;
  }

  .inventory-detail-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  /* --- Shared body leaves ---------------------------------------------------
     Authored by the CONSUMER, so they must be published globally to reach it; see
     the header comment for why each is `:where()`-zeroed and ancestor-guarded. */

  :global(:where(.inventory-detail) .inventory-chip) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  /* A quiet reading of the row's kind (Component / Essence), not an accent
     call-to-action. */
  :global(:where(.inventory-detail) .inventory-chip.is-quiet) {
    color: var(--fab-text-secondary);
    font-size: 10px;
  }

  :global(:where(.inventory-detail) .inventory-chip.is-info) {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
    color: var(--fab-info-text);
  }

  :global(:where(.inventory-detail) .inventory-chip.is-success) {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  :global(:where(.inventory-detail) .inventory-chip.is-warning) {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  :global(:where(.inventory-detail) .inventory-detail-section) {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Section eyebrows: uppercase, wide-tracked, muted (brief §2 type scale). */
  :global(:where(.inventory-detail) .inventory-detail-section-title) {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--fab-text-muted);
  }

  :global(:where(.inventory-detail) .inventory-detail-row-name) {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  :global(:where(.inventory-detail) .inventory-detail-empty-note) {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }
</style>
