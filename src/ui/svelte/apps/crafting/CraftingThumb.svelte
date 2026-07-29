<!-- Svelte 5 runes mode -->
<!--
  CraftingThumb is the shared square image tile used across the Crafting tab
  (recipe rows, the detail header, IO tables, the shopping list, run summaries).
  It centralises the image + fallback handling so the same markup is not repeated
  per surface (which would otherwise add duplicated lines that fail the Sonar
  new-code duplication gate).
-->
<script>
  import { DEFAULT_CRAFTING_IMAGE, GENERIC_ITEM_IMAGE } from '../../util/craftingImageDefaults.js';

  let {
    src = '',
    alt = '',
    size = 48,
    // Opt-in glyph fallback for MATERIAL tiles (issue 917). Recipe surfaces pass no
    // glyph and keep the blueprint fallback byte-for-byte; a component or tag tile
    // passes one, which additionally makes Foundry's generic item-bag literal read as
    // "no image" rather than as artwork.
    glyph = null
  } = $props();

  const trimmed = $derived(typeof src === 'string' ? src.trim() : '');
  const hasGlyph = $derived(typeof glyph === 'string' && glyph.trim() !== '');
  // The sentinel is only "no image" for a tile that has a glyph to fall back to;
  // without one, blanking it would leave nothing at all to render.
  const hasImage = $derived(trimmed !== '' && !(hasGlyph && trimmed === GENERIC_ITEM_IMAGE));
  const showGlyph = $derived(hasGlyph && !hasImage);
  const resolved = $derived(hasImage ? src : DEFAULT_CRAFTING_IMAGE);
  const dimension = $derived(`${size}px`);
</script>

<span
  class="crafting-thumb"
  class:is-fallback={!hasImage}
  class:is-glyph={showGlyph}
  style={`--crafting-thumb-size:${dimension}`}
>
  {#if showGlyph}
    <i class={glyph} aria-hidden="true" title={alt || undefined}></i>
  {:else}
    <img src={resolved} alt={alt} />
  {/if}
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

  .crafting-thumb.is-glyph {
    color: var(--fab-text-muted);
  }

  .crafting-thumb.is-glyph i {
    font-size: calc(var(--crafting-thumb-size, 48px) * 0.45);
    line-height: 1;
  }
</style>
