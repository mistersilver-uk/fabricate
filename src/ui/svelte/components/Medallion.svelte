<!-- Svelte 5 runes mode -->
<!--
  The flat identity tile used by recipe rows and inspectors. It renders the real
  linked image when the caller resolves one, and falls back to a Font Awesome
  glyph when `src` is falsy — a recipe HAS an `img`, so a glyph-only medallion
  would have quietly deleted the image affordance.

  Flat by contract: the surface is `--fab-bg-3`, never a gradient
  (`tests/components/flat-ui-style-contract.test.js` bans linear/radial/conic
  gradients anywhere under `src/ui/**` and `styles/**`).

  Import-free leaf (design-system §7): props only. The CALLER resolves the image
  (`resolveRecipeImage(recipe)`) and passes a plain string — importing
  `craftingImageDefaults.js` here would propagate a required raw-module entry into
  every mount-harness allowlist compiling anything that renders a Medallion.

  Props:
   - src: resolved image path; falsy → the glyph fallback.
   - icon: Font Awesome class used when `src` is falsy.
   - size: edge length in px (default 40).
   - alt: image alt text (decorative by default).
-->
<script>
  let { src = '', icon = 'fas fa-scroll', size = 40, alt = '' } = $props();

  const boxStyle = $derived(`width:${size}px;height:${size}px`);
</script>

<span class="fab-medallion" data-medallion={src ? 'image' : 'glyph'} style={boxStyle}>
  {#if src}
    <img class="fab-medallion-img" {src} {alt} />
  {:else}
    <i class={icon} aria-hidden="true"></i>
  {/if}
</span>

<style>
  /* Flat surface — no gradient (flat-ui-style-contract). */
  .fab-medallion {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    color: var(--fab-accent);
    background: var(--fab-bg-3);
    font-size: 0.9rem;
  }

  .fab-medallion-img {
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: cover;
  }
</style>
