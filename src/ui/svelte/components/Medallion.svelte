<!-- Svelte 5 runes mode -->
<!--
  The flat identity tile used by recipe rows and inspectors. It renders the real
  linked image when the caller resolves one, and falls back to a Font Awesome
  glyph when `art` is falsy — a recipe HAS an `img`, so a glyph-only medallion
  would have quietly deleted the image affordance.

  Flat by contract: the surface is `--fab-bg-3`, never a gradient
  (`tests/components/flat-ui-style-contract.test.js` bans linear/radial/conic
  gradients anywhere under `src/ui/**` and `styles/**`).

  Import-free leaf (design-system §7): props only. The CALLER resolves the image
  (`resolveRecipeImage(recipe)`, or `resolveCraftingArt(img, glyph)` for a tile that
  falls back to a glyph) and passes a plain string — importing
  `craftingImageDefaults.js` here would propagate a required raw-module entry into
  every mount-harness allowlist compiling anything that renders a Medallion.

  Props:
   - art: resolved image path; falsy → the glyph fallback. Named for the tile the design
     system publishes, whose prop is `art` because what it carries is a record's ARTWORK
     rather than an element's `src` attribute.
   - src: DEPRECATED alias for `art`, kept for ONE release so an out-of-tree caller is not
     broken by the rename. `art` wins where both are passed, and no shipped call site uses
     it; delete it, and this bullet, in the release after the one that introduces `art`.
   - icon: Font Awesome class used when `art` is falsy.
   - size: edge length in px (default 40).
   - alt: image alt text. Passed EXPLICITLY wherever `art` is set — `alt=""` is the correct
     value at every shipped site, because each renders the record's name as adjacent text, and
     the contract is that the decision was TAKEN rather than that a sentence was written. Worded
     as "required" it would push an author into writing redundant alt text beside a visible name
     on every browse row. `medallion-art-contract.test.js` reds on an art-bearing call site that
     names no `alt`, and on one reaching for the deprecated `src` alias to escape it.
   - tint: a BARE `--fab-tag-*` palette key (`sage`, `mauve`, …), or '' for the accent
     default. Issue 1036: the tile pinned `color: var(--fab-accent)` and forwards no rest
     spread, so as shipped it renders every essence medallion accent-coloured and the
     per-essence colour vocabulary could never appear on it. The tint recolours the GLYPH
     and NOTHING ELSE (issue 1506): the published specimen renders this tile on a flat
     surface at all four rungs and every tinted example there sets `color:` alone, and issue
     1371's own parity run against the reference reached the same finding from the other side
     — the row chips share ONE surface and differ in the glyph's colour. Dropping the surface
     wash also RAISES glyph-to-ground contrast, because the mix moved the ground toward the
     ink. Unset is byte-identical to the shipped render: the glyph reads the token through a
     `var()` FALLBACK, so an unset property resolves to the accent it always painted.
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
     What the variant owns is the one thing a caller CANNOT express: the absent border. It owned a
     second — that a tinted glyph on this chip brings no tinted SURFACE with it — until issue 1506
     made that true of every medallion, at which point it stopped being this variant's to say.

     WHY THIS VARIANT NO LONGER HAS ANYTHING TO SUPPRESS. It shipped with a second rule cancelling
     the tint's surface wash, because the reference's row chips share ONE slate surface and differ
     only in the glyph's colour, so a per-category wash would have been this repo's invention. That
     finding was true of every medallion rather than of this variant's four call sites, so issue
     1506 acted on it at the primitive: the wash is gone from the base tile, and the cancellation
     went with the thing it cancelled. What is left is the ABSENT BORDER, which is the one thing a
     caller still cannot say. The surface stays `--fab-bg-3` because the reference paints the chip
     with a 135deg linear gradient between two slate greys and this repo forbids gradients under
     `src/ui/**` and `styles/**` outright (`flat-ui-style-contract.test.js`) — `--fab-bg-3` is the
     flat token in the middle of that pair and is the honest reproduction. A `backgroundColor`
     compare line against the reference's `transparent` stays open under that ban and is a recorded
     deviation rather than a defect this variant can close.
-->
<script>
  let {
    art = '',
    // DEPRECATED alias for `art`, kept for one release. See the props block above.
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
   * into the attribute, which is what `components/Avatar.svelte`'s `class:has-tint` does — the
   * directive this component carried until issue 1506 deleted its tint wash. That keeps the class
   * attribute a static literal, so an unset variant renders the exact token list this component
   * has always rendered, and it keeps the class name a literal in the source for the tooling that
   * reads one.
   */
  const isGlyphChip = $derived(String(variant ?? '') === 'glyph-chip');

  // `art` wins, and the deprecated alias answers only when it is unset. Resolved once here
  // rather than at each of the three places the template asks about it, so the image branch,
  // the `data-medallion` hook and the rendered `src` attribute can never disagree about
  // whether this tile has artwork.
  const artPath = $derived(art || src);

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
  data-medallion={artPath ? 'image' : 'glyph'}
  data-medallion-tint={safeTint || undefined}
  style={boxStyle}
>
  {#if artPath}
    <img class="fab-medallion-img" src={artPath} {alt} />
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

  /* THE GLYPH-CHIP VARIANT (issue 1371, reduced by issue 1506). ONE declaration, and it is the
     one thing the existing props cannot say.

     `border: 0`, NOT `border-width: 0`, and the difference is measurable rather than stylistic.
     This variant states that the chip HAS NO EDGE, and the reference's chip has none — it
     declares no `border` at all (`proto:5242`), so it computes `border-style: none` and takes
     `currentcolor`. `border-width: 0` shipped first and left the base rule's `solid` and its
     `var(--fab-border)` standing underneath: inert to the eye, but `borderTopStyle` and
     `borderTopColor` are two of the four properties the parity oracle reads for a `border`
     region, so the run reported `solid !== none` on a chip that draws nothing, on every screen
     the variant reaches. A property nobody can see is still a property the comparison asks
     about, and a zero-width edge with a colour is a claim this variant does not mean to make.
     What it overrules is the BASE rule's `1px solid var(--fab-border)` at the top of this block,
     and it overrules it on specificity: (0,2,0) against (0,1,0), so the reset does not depend on
     which of the two is written later. It used to have a second thing to overrule — the tinted
     tile's mixed `border-color` — and issue 1506 deleted that rule, so the base edge is now the
     only edge there is to reset. */
  .fab-medallion.is-glyph-chip {
    border: 0;
  }

  .fab-medallion-img {
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: cover;
  }
</style>
