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
   - glyph: the glyph's font-size in px, for a tile large enough that the 0.9rem default
     reads as a speck inside it. Unset resolves to `0.9rem` through a `var()` FALLBACK, so
     no existing medallion moves. It is a prop rather than a `size`-derived calc precisely
     because deriving it would re-type all ~40 medallions across the manager at once, which
     is a change with its own frames rather than a side effect of this one.
   - variant: '' (the shipped artwork tile) or 'glyph-chip' — the tile as an UNBORDERED slate
     chip carrying a tinted glyph (issue 1371, parity round 5, UX finding F12). Anything else
     resolves to '', as an unrecognised `tint` does, so a medallion that does not ask for it is
     byte-identical to what shipped.

     WHAT IT IS FOR. The reference's list rows draw their leading chip as a borderless rounded
     square with a fixed dark-slate surface and the CATEGORY's colour on the glyph alone
     (`proto:600` at 38px for the world catalogue's rows, `proto:1078`'s cohort at 40px for the
     system rules list's). The shipped tile is the same shape with a hairline around it, and one
     parity run measured that single difference as fourteen `compare` lines across three regions
     on three screens — `borderTopWidth`, `borderTopStyle` and a fill line each.

     THE SIZE AND THE COLOUR ARE THE EXISTING PROPS, NOT PART OF THE VARIANT. 38 is the `size`
     the caller already passes and 15px is the `glyph`; making either implicit here would put a
     second copy of the row's geometry inside a primitive that already takes it as an argument.
     What the variant owns is the two things a caller CANNOT express: the absent border, and the
     fact that a tinted glyph on this chip does not bring a tinted SURFACE with it.

     WHY THE SURFACE STAYS `--fab-bg-3` AND THE WASH IS SUPPRESSED. The reference paints the chip
     with a 135deg linear gradient between two slate greys, and this repo forbids gradients under
     `src/ui/**` and `styles/**` outright (`flat-ui-style-contract.test.js`) — `--fab-bg-3` is the
     flat token in the middle of that pair and is the honest reproduction. So the chip's fill is
     the SAME for every row whatever the row's category is, exactly as the reference's is, which
     is why this variant cancels `has-tint`'s wash while keeping the glyph colour it also sets.
     A `backgroundColor` compare line against the reference's `transparent` stays open under that
     ban and is a recorded deviation rather than a defect this variant can close.
-->
<script>
  let {
    src = '',
    icon = 'fas fa-scroll',
    size = 40,
    alt = '',
    tint = '',
    glyph = 0,
    // '' (the shipped tile) or 'glyph-chip'. See the props block above.
    variant = '',
  } = $props();

  /**
   * The variant set is CLOSED and compared against a literal, so an unrecognised value renders the
   * shipped tile rather than emitting an `is-*` class the style block does not paint — the rule
   * `ManagerButton`'s `ROLE_CLASSES` and `Chip`'s `TONES` both follow.
   *
   * It resolves to a BOOLEAN feeding a `class:` directive rather than to a class string joined
   * into the attribute, which is what `has-tint` beside it already does. That keeps the class
   * attribute a static literal, so an unset variant renders the exact token list this component
   * has always rendered, and it keeps the class name a literal in the source for the tooling that
   * reads one.
   */
  const isGlyphChip = $derived(String(variant ?? '') === 'glyph-chip');

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
    `width:${boxHeight}px;height:${boxHeight}px` +
      (glyphPx ? `;--fab-medallion-glyph:${glyphPx}px` : '') +
      (safeTint ? `;--fab-medallion-tint:var(--fab-tag-${safeTint})` : '')
  );
</script>

<span
  class="fab-medallion"
  class:is-glyph-chip={isGlyphChip}
  class:has-tint={Boolean(safeTint)}
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

  /* The surface wash, CLASS-GATED rather than folded into the base rule. Writing it as
     `color-mix(in srgb, var(--fab-medallion-tint, transparent) 14%, var(--fab-bg-3))`
     would look equivalent but is not: with the property unset that mixes 14% of
     `transparent` into the surface, leaving every untinted medallion in the repo slightly
     see-through. A separate rule is the only form that is genuinely a no-op when unset. */
  .fab-medallion.has-tint {
    border-color: color-mix(in srgb, var(--fab-medallion-tint) 45%, var(--fab-border));
    background: color-mix(in srgb, var(--fab-medallion-tint) 14%, var(--fab-bg-3));
  }

  /* THE GLYPH-CHIP VARIANT (issue 1371). Two declarations, and each of them is one of the two
     things the existing props cannot say.

     `border: 0`, NOT `border-width: 0`, and the difference is measurable rather than stylistic.
     This variant states that the chip HAS NO EDGE, and the reference's chip has none — it
     declares no `border` at all (`proto:5242`), so it computes `border-style: none` and takes
     `currentcolor`. `border-width: 0` shipped first and left the base rule's `solid` and its
     `var(--fab-border)` standing underneath: inert to the eye, but `borderTopStyle` and
     `borderTopColor` are two of the four properties the parity oracle reads for a `border`
     region, so the run reported `solid !== none` on a chip that draws nothing, on every screen
     the variant reaches. A property nobody can see is still a property the comparison asks
     about, and a zero-width edge with a colour is a claim this variant does not mean to make.
     It DOES now overrule `has-tint`'s `border-color`, which the width-only form left standing:
     both are (0,2,0) and this rule is written later, so the shorthand's `currentcolor` wins. That
     changes nothing anyone can see — a colour on an absent edge paints nothing — and it is the
     reference's own computed value, so the comparison and the screen agree instead of differing
     in the one place only the comparison looks.

     THE SECOND RULE IS THE WASH, CANCELLED. `tint` washes the surface as well as recolouring the
     glyph, which is right for the artwork tile it was written for and wrong here: the reference's
     row chips all share one slate surface and differ only in the glyph's colour, so a per-category
     wash would be this repo's invention rather than the reference's drawing. It is (0,3,0) against
     `has-tint`'s (0,2,0), so the cancellation is decided by specificity and not by which of the
     two rules is written later. */
  .fab-medallion.is-glyph-chip {
    border: 0;
  }

  .fab-medallion.is-glyph-chip.has-tint {
    background: var(--fab-bg-3);
  }

  .fab-medallion-img {
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: cover;
  }
</style>
