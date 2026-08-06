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
   - tint: a BARE `--fab-tag-*` palette key (`sage`, `mauve`, …), or '' for the accent
     default. Issue 1036: the tile pinned `color: var(--fab-accent)` and forwards no rest
     spread, so as shipped it renders every essence medallion accent-coloured and the
     per-essence colour vocabulary could never appear on it. The tint recolours the GLYPH
     and washes the SURFACE, because the prototype tile carries both and recolouring the
     glyph alone does not reproduce it. Unset is byte-identical to the shipped render:
     the glyph reads the token through a `var()` FALLBACK, and the wash is a separate
     class-gated rule rather than a `color-mix` against `transparent`, which would leave
     an untinted tile 14% translucent instead of unchanged.
   - block: the tile fills its container's WIDTH and takes `size` as its HEIGHT, instead of
     being a `size`×`size` square (issue 1036, maintainer round 2). An editor's icon control
     reserves a column and the tile should own it; at a fixed `size` the tile sat narrower
     than the picker beneath it and left a ragged gap to its right. Off by default, so every
     row and inspector medallion is byte-identical.
   - glyph: the glyph's font-size in px, for a tile large enough that the 0.9rem default
     reads as a speck inside it. Unset resolves to `0.9rem` through a `var()` FALLBACK, so
     no existing medallion moves. It is a prop rather than a `size`-derived calc precisely
     because deriving it would re-type all ~40 medallions across the manager at once, which
     is a change with its own frames rather than a side effect of this one.
-->
<script>
  let {
    src = '',
    icon = 'fas fa-scroll',
    size = 40,
    alt = '',
    tint = '',
    block = false,
    glyph = 0,
  } = $props();

  // Both numeric props are coerced and floored at zero before interpolation: they land in a
  // `style` attribute, and a caller that passes a string is a caller that could otherwise
  // compose a declaration.
  const boxHeight = $derived(Math.max(0, Number(size) || 0));
  const glyphPx = $derived(Math.max(0, Number(glyph) || 0));

  // The token arrives as a bare palette key and is interpolated into a `style` attribute,
  // so it is constrained to the shape a key can have. Anything else is DROPPED to '' — an
  // unrecognised value renders the accent default rather than emitting a declaration the
  // caller composed. The leading `--fab-tag-` is tolerated because `ManagerColorPicker`
  // already accepts both spellings and a primitive should not be the one place that does not.
  const safeTint = $derived(
    /^[a-z0-9-]+$/.test(String(tint || '').replace(/^--fab-tag-/, ''))
      ? String(tint).replace(/^--fab-tag-/, '')
      : ''
  );
  const boxStyle = $derived(
    `${block ? 'width:100%' : `width:${boxHeight}px`};height:${boxHeight}px` +
      (glyphPx ? `;--fab-medallion-glyph:${glyphPx}px` : '') +
      (safeTint ? `;--fab-medallion-tint:var(--fab-tag-${safeTint})` : '')
  );
</script>

<span
  class="fab-medallion"
  class:has-tint={Boolean(safeTint)}
  class:is-block={Boolean(block)}
  data-medallion={src ? 'image' : 'glyph'}
  data-medallion-tint={safeTint || undefined}
  style={boxStyle}
>
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
    /* The tint recolours the glyph through a var() FALLBACK, so an untinted medallion
       resolves to exactly the `var(--fab-accent)` it painted before issue 1036. */
    color: var(--fab-medallion-tint, var(--fab-accent));
    background: var(--fab-bg-3);

    /* Same `var()` FALLBACK discipline as the tint: with `--fab-medallion-glyph` unset this
       resolves to exactly the 0.9rem every medallion painted before issue 1036. */
    font-size: var(--fab-medallion-glyph, 0.9rem);
  }

  /* `block` states the fill in CSS as well as inline, so the tile keeps filling its column
     if a host ever places it somewhere the inline `width: 100%` would resolve against a
     shrink-to-fit box. `max-width` is what stops it outgrowing a narrower parent, since the
     base rule's `flex: 0 0 auto` forbids shrinking. */
  .fab-medallion.is-block {
    width: 100%;
    max-width: 100%;
  }

  /* The surface wash, CLASS-GATED rather than folded into the base rule. Writing it as
     `color-mix(in srgb, var(--fab-medallion-tint, transparent) 14%, var(--fab-bg-3))`
     would look equivalent but is not: with the property unset that mixes 14% of
     `transparent` into the surface, leaving every untinted medallion in the repo slightly
     see-through. A separate rule is the only form that is genuinely a no-op when unset. */
  .fab-medallion.has-tint {
    border-color: color-mix(in srgb, var(--fab-medallion-tint) 45%, var(--fab-border));
    background: color-mix(in srgb, var(--fab-medallion-tint) 14%, var(--fab-bg-3));
  }

  .fab-medallion-img {
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: cover;
  }
</style>
