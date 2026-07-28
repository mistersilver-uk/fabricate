<!-- Svelte 5 runes mode -->
<!--
  CraftingEssenceThumb is the ONE essence glyph tile on the Crafting tab: the
  alternatives picker, the shopping list and the requirement rail all draw an
  essence through it, so the same essence can never be rendered by two components
  on one screen.

  It carries the authored per-essence colour (issue 917) WITHOUT knowing anything
  about it: `--fab-chip-color` is a custom property an ancestor sets, and custom
  properties inherit through a component boundary, so the tint reaches the glyph
  from whatever tinted surface the thumb happens to sit inside. Absent that
  property the glyph falls back to the muted text colour every call site had
  before the property existed.
-->
<script>
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../../util/essenceIcons.js';

  let {
    icon = null,
    size = 48,
    // Corner radius in CSS px. The rail's 56px slot tile nests this inside a 12px
    // rounded square and wants a slightly rounder glyph than the inline 40/28px
    // tiles do; everything else keeps the shipped 6px.
    radius = 6,
    // Extra class(es) merged onto the root, following the `Chip` precedent. Used for
    // a caller-owned selector hook (the requirement rail's `.requirement-slot-glyph`
    // is pinned by the Foundry smoke harness), never for restyling from outside.
    class: extraClass = ''
  } = $props();

  const dimension = $derived(`${size}px`);
  const iconDimension = $derived(`${Math.max(12, Math.round(Number(size) * 0.42))}px`);
  const iconClass = $derived(normalizeEssenceIcon(icon || DEFAULT_ESSENCE_ICON));
  const classes = $derived(['crafting-essence-thumb', extraClass].filter(Boolean).join(' '));
</script>

<span
  class={classes}
  style={`--crafting-essence-thumb-size:${dimension};--crafting-essence-icon-size:${iconDimension};--crafting-essence-thumb-radius:${radius}px`}
  aria-hidden="true"
>
  <i class={iconClass}></i>
</span>

<style>
  .crafting-essence-thumb {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--crafting-essence-thumb-size, 48px);
    height: var(--crafting-essence-thumb-size, 48px);
    border-radius: var(--crafting-essence-thumb-radius, 6px);
    overflow: hidden;
    background: var(--fab-surface-raised);
    /* The authored essence colour when an ancestor supplies one, else the colour
       every call site painted before per-essence colours existed. */
    color: var(--fab-chip-color, var(--fab-text-muted));
  }

  .crafting-essence-thumb i {
    font-size: var(--crafting-essence-icon-size, 20px);
  }
</style>
