<!-- Svelte 5 runes mode -->
<!--
  ONE row in a bulk panel list (issue 859): thumbnail, name, an optional muted
  sub-line, and whatever the list needs on the right.

  WHY THE RIGHT-HAND SIDE IS A SNIPPET AND NOT A `mode` PROP. The panel has four
  lists and their trailing content genuinely differs — the queue shows a certainty
  chip (plus a danger chip when the item is broken) and a remove control, the
  blocked list shows a reason and a remove control, the yield preview shows a
  quantity and a certainty chip, and the report shows an outcome chip and its roll.
  A single `mode` prop with a four-way branch would carry three dead branches in
  every render and would have to grow a fifth the next time a list is added. A
  snippet keeps the row owning exactly what is common — the 30px thumb, the shared
  `.inventory-detail-row-name` leaf, the ellipsis behaviour, the box — which is the
  point: this is the ONE place that markup exists instead of four near-copies.

  `CraftingThumb` at a FIXED 30px. `InventoryItemCard`'s recorded reason for
  declining it (its hard-set width/height fights a responsive `aspect-ratio`
  square) does not apply to a row thumb that is a fixed size by design, and using
  it means a result with no authored artwork gets the house fallback rather than a
  broken-image glyph.

  Props:
   - img / name: the row's artwork and its (already-localized or authored) name.
   - note: an optional muted second line (the acting system, a missing-preview
     note, a skip reason detail). Empty renders nothing at all, not an empty line.
   - attrs: extra attributes for the `<li>` (the row's `data-` hooks).
   - trailing: the right-hand snippet described above.
-->
<script>
  import CraftingThumb from '../../crafting/CraftingThumb.svelte';

  let { img = '', name = '', note = '', attrs = {}, trailing = null } = $props();
</script>

<li class="bulk-row" {...attrs}>
  <CraftingThumb src={img} alt="" size={30} />
  <span class="bulk-row-text">
    <!-- The shell's shared leaf, not a private copy: the queue row's name then
         reads exactly like the inspector's own row names. -->
    <span class="inventory-detail-row-name">{name}</span>
    {#if note}<span class="bulk-row-note">{note}</span>{/if}
  </span>
  {#if trailing}
    <span class="bulk-row-trailing">{@render trailing()}</span>
  {/if}
</li>

<style>
  .bulk-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .bulk-row-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bulk-row-note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--fab-text-subtle);
  }

  /* The trailing group never shrinks: a long component name ellipses, the chip and
     the control it sits beside stay legible. */
  .bulk-row-trailing {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
  }
</style>
