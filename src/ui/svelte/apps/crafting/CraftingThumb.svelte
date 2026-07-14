<!-- Svelte 5 runes mode -->
<!--
  CraftingThumb is the shared square image tile used across the Crafting tab
  (recipe rows, the detail header, IO tables, the shopping list, run summaries).
  It centralises the image + fallback handling so the same markup is not repeated
  per surface (which would otherwise add duplicated lines that fail the Sonar
  new-code duplication gate).
-->
<script>
  import { DEFAULT_CRAFTING_IMAGE } from '../../util/craftingImageDefaults.js';

  let { src = '', alt = '', size = 48 } = $props();

  const hasImage = $derived(typeof src === 'string' && src.trim() !== '');
  const resolved = $derived(hasImage ? src : DEFAULT_CRAFTING_IMAGE);
  const dimension = $derived(`${size}px`);
</script>

<span
  class="crafting-thumb"
  class:is-fallback={!hasImage}
  style={`--crafting-thumb-size:${dimension}`}
>
  <img src={resolved} alt={alt} />
</span>

<style>
  .crafting-thumb {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--crafting-thumb-size, 48px);
    height: var(--crafting-thumb-size, 48px);
    border-radius: 6px;
    overflow: hidden;
    background: var(--fab-surface-raised);
  }

  .crafting-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .crafting-thumb.is-fallback img {
    object-fit: contain;
    padding: 6px;
    box-sizing: border-box;
    opacity: 0.85;
  }
</style>
