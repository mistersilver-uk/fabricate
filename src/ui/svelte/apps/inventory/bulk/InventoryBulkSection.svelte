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
   - note: an optional standing note under the title (the blocked list's "these are
     skipped automatically"), rendered before the list because it explains the
     whole section rather than any one row.
   - attrs: extra attributes for the `<section>` (its `data-` hook).
   - children: the `<li>` rows, normally `InventoryBulkRow`.
-->
<script>
  let { title = '', note = '', attrs = {}, children = null } = $props();
</script>

<section class="inventory-detail-section" {...attrs}>
  <p class="inventory-detail-section-title">{title}</p>
  {#if note}
    <p class="bulk-section-note">{note}</p>
  {/if}
  <ul class="bulk-list">
    {@render children?.()}
  </ul>
</section>

<style>
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
