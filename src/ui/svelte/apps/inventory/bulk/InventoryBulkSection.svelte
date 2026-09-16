<!-- Svelte 5 runes mode -->
<!--
  ONE titled list section inside the bulk panel (issue 859).

  It authors NOTHING of its own visually: `.inventory-detail-section` and
  `.inventory-detail-section-title` are the shell's shared leaves, published by
  `InventoryDetailHeader` as ancestor-guarded globals and in scope here because the
  panel renders inside the shell. That is the whole reason the panel adopts the
  shell rather than re-rolling an inspector column — a section eyebrow here is the
  SAME eyebrow the Info and Salvage bodies draw, and cannot drift from it.

  The `<ul>` is owned here rather than by each caller so the list geometry (reset,
  column, 6px rhythm) has one owner across the queue, the blocked list, the yield
  preview and the report's three lists.

  Props:
   - title: the ALREADY-localized eyebrow.
   - titleTrailing: an optional snippet pinned to the RIGHT of that eyebrow, on the
     SAME line — the complication block's "N could fire" count. It is a prop rather
     than a second hand-rolled copy because `SalvageProgressiveBody` already draws
     exactly this ("Roll to resolve" / "1 of 3 recovered" beside its own body title,
     `.salvage-body-hint`), and a second site is what turns an idiom into a
     primitive. The trailing type is that hint's — 9px/700/subtle — so the two read
     as one treatment across the inspector rather than two that happen to agree.
   - note: an optional standing note under the title (the blocked list's "these are
     skipped automatically"), rendered before the list because it explains the
     whole section rather than any one row.
   - attrs: extra attributes for the `<section>` (its `data-` hook).
   - children: the `<li>` rows, normally `InventoryBulkRow` or a group card.
-->
<script>
  let { title = '', titleTrailing = null, note = '', attrs = {}, children = null } = $props();
</script>

<section class="inventory-detail-section" {...attrs}>
  <!-- The title is wrapped in its own span unconditionally so the eyebrow keeps ONE
       shape whether or not a trailing slot is filled; with no trailing content the
       block stays a plain text line, and the flex row is switched on only when there
       is a second thing to place. The trailing span is owned HERE rather than by the
       caller because the snippet's own elements carry the CALLER's style scope, so a
       rule keyed on them from this component would never match. -->
  <p class="inventory-detail-section-title" class:has-trailing={titleTrailing != null}>
    <span>{title}</span>
    {#if titleTrailing}
      <span class="bulk-section-title-trailing">{@render titleTrailing()}</span>
    {/if}
  </p>
  {#if note}
    <p class="bulk-section-note">{note}</p>
  {/if}
  <ul class="bulk-list">
    {@render children?.()}
  </ul>
</section>

<style>
  .inventory-detail-section-title.has-trailing {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
  }

  /* `.salvage-body-hint`'s type, not a fourth micro-scale. `margin-left: auto` rather
     than `justify-content: space-between`, which would strand the title when the
     trailing slot is empty. */
  .bulk-section-title-trailing {
    margin-left: auto;
    font-size: 9px;
    font-weight: 700;
    color: var(--fab-text-subtle);
  }

  .bulk-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
  }

  .bulk-section-note {
    margin: 0;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }
</style>
