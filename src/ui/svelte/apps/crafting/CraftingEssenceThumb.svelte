<!-- Svelte 5 runes mode -->
<script>
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../../util/essenceIcons.js';

  let { icon = null, size = 48 } = $props();

  const dimension = $derived(`${size}px`);
  const iconDimension = $derived(`${Math.max(12, Math.round(Number(size) * 0.42))}px`);
  const iconClass = $derived(normalizeEssenceIcon(icon || DEFAULT_ESSENCE_ICON));
</script>

<span
  class="crafting-essence-thumb"
  style={`--crafting-essence-thumb-size:${dimension};--crafting-essence-icon-size:${iconDimension}`}
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
    border-radius: 6px;
    overflow: hidden;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  .crafting-essence-thumb i {
    font-size: var(--crafting-essence-icon-size, 20px);
  }
</style>
