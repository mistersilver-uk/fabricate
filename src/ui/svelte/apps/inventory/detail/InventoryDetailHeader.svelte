<!-- Svelte 5 runes mode -->
<!--
  InventoryDetailHeader is the ONE inspector shell both detail bodies render
  inside: the scrolling `.inventory-detail` column, the identity header
  (thumbnail + name + "N total" + chips), and the shared leaf styles their bodies
  author (sections, section eyebrows, row names, chips).

  THE EMPTY NOTE LEAF IS GONE (issue 1514). `.inventory-detail-empty-note` was the tenth
  published leaf and its ten consumers across four files — the bulk panel, the bulk report,
  the book body and the component body — all render `EmptyState note` now, so the rule was
  deleted with the last of them rather than left orphaned. That is what "converts together
  or not at all" means for a `:global(:where())` family: a family whose rule outlives its
  markup paints nothing, and one whose markup outlives its rule loses its type silently.

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
   - img / icon / colorToken: artwork, or an authored Font Awesome glyph for essences (which
     have an icon and no artwork) inked in the essence's own colour. `icon` wins when set.
   - name: the item name, drawn by `PlayerDetailHeader` on the pane's one `h2`.
   - total: the already-localized "N total" line, so this stays i18n-free.
   - totalAttrs: extra attributes spread onto that line. The bulk panel makes it a polite live
     region, announcing "n selected · n salvageable · n skipped" as the selection changes.
   - chips: `{ id, label, icon?, tone?, attrs? }[]` rendered as the header's chip row. Data, not
     a snippet: the chip markup and every tone then live here once.
   - primary: `PlayerDetailHeader`'s primary props (`primaryLabel`, `primaryIcon`,
     `primaryDisabled`, `primaryProps`, `onclick`), forwarded verbatim. Empty renders none.
   - headerAction: an optional non-primary snippet pinned to the right of the header (the bulk
     panel's Clear), in its own wrapper so a consumer passing none adds no flex child.
   - children: the body, rendered inside the scrolling column.
-->
<script>
  import PlayerDetailHeader from '../../PlayerDetailHeader.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { essenceTintToken } from '../../../util/essenceTint.js';

  let {
    detailKey = '',
    attrs = {},
    img = '',
    icon = '',
    name = '',
    total = '',
    totalAttrs = {},
    chips = [],
    colorToken = '',
    primary = {},
    headerAction = null,
    children = null,
  } = $props();

  const chipList = $derived(Array.isArray(chips) ? chips.filter((chip) => chip != null) : []);

  // A selected essence wears its own colour here as it does on the inventory tile (issue 1036).
  const tile = $derived(
    icon ? { art: '', icon, tint: essenceTintToken(colorToken) } : resolveCraftingArt(img)
  );
</script>

<div class="inventory-detail" data-inventory-detail={detailKey} {...attrs}>
  <header class="inventory-detail-header">
    <PlayerDetailHeader
      {name}
      {...tile}
      {meta}
      chips={chipList.length > 0 ? chipRow : null}
      {...primary}
    />
    {#if headerAction}
      <div class="inventory-detail-header-action">{@render headerAction()}</div>
    {/if}
  </header>

  {@render children?.()}
</div>

{#snippet meta()}
  <span class="inventory-detail-total" {...totalAttrs}>{total}</span>
{/snippet}

{#snippet chipRow()}
  {#each chipList as chip (chip.id)}
    <span class={`inventory-chip is-${chip.tone ?? 'neutral'}`} {...chip.attrs ?? {}}>
      {#if chip.icon}<i class={chip.icon} aria-hidden="true"></i>{/if}
      <span>{chip.label}</span>
    </span>
  {/each}
{/snippet}

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
    gap: var(--fab-space-3);
    align-items: flex-start;
  }

  /* On a wrapper that exists only when an action is passed, so a consumer passing none is
     laid out by the identity row alone. */
  .inventory-detail-header-action {
    flex: 0 0 auto;
  }

  /* --- Shared body leaves ---------------------------------------------------
     Authored by the CONSUMER, so they must be published globally to reach it; see
     the header comment for why each is `:where()`-zeroed and ancestor-guarded. */

  :global(:where(.inventory-detail) .inventory-chip) {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    padding: 1px var(--fab-space-2);
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
    gap: var(--fab-space-2);
  }

  /* Section eyebrows: uppercase, wide-tracked, muted (brief §2 type scale).

     HAND-ROLLED, AND REFUSED AS A FAMILY (issue 1514). This is a `:global(:where())` leaf with
     eight markup consumers across three files, so it converts together or not at all — a rule
     that outlives its markup paints nothing and markup that outlives its rule loses its type.
     One of the eight cannot convert: `InventoryBulkSection` renders it with
     `class:has-trailing` and declares `.inventory-detail-section-title.has-trailing { display:
     flex; align-items: baseline; gap }` so the complication count sits on the eyebrow's own
     line. `Kicker` forwards no `class` and no `style`, and its documented answer — keep your own
     wrapper and nest the kicker inside it — cannot be taken here without changing the ELEMENT
     the seven other consumers write, which is the whole point of a published family.

     So the family stays, and it goes to the register with that measurement. A `class`
     passthrough is not the answer (the primitive refuses one by design); what would close it is
     converting the seven plain consumers and giving the bulk section its own wrapper in the same
     change, which is a markup move in three files rather than a conversion. */
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
</style>
