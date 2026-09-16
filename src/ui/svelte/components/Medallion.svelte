<!--
  The flat identity tile used by recipe rows and inspectors: the real linked image when the caller
  resolves one, and a Font Awesome glyph when it does not — a recipe HAS an `img`, so a glyph-only
  medallion would have quietly deleted the image affordance. An IMPORT-FREE LEAF: the CALLER
  resolves the image and passes a plain string, because importing the image-defaults module here
  would propagate a required raw-module entry into every mount-harness allowlist.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `art` | resolved image path | `''` | Falsy renders the glyph fallback. Named for the tile the design system publishes, whose prop is `art` because it carries a record's ARTWORK rather than an element's `src`. |
  | `src` | DEPRECATED alias for `art` | `''` | Kept for ONE release so an out-of-tree caller is not broken by the rename. `art` wins where both are passed and no shipped site uses it; delete it, and this row, in the release after the one that introduced `art`. |
  | `icon` | Font Awesome classes | see source | Used when `art` is falsy. |
  | `size` | px | `40` | Edge length. |
  | `alt` | string | `''` | Image alt text, passed EXPLICITLY wherever `art` is set. `alt=""` is the correct value at every shipped site, because each renders the record's name as adjacent text; the contract is that the decision was TAKEN. Worded as "required" it would push an author into writing redundant alt text beside a visible name on every browse row. `medallion-art-contract.test.js` reds on an art-bearing call site that names no `alt`, and on one reaching for the deprecated alias to escape it. |
  | `tint` | bare `--fab-tag-*` key | `''` | Recolours the GLYPH and NOTHING ELSE. Unset is byte-identical to the shipped render, because the glyph reads the token through a `var()` FALLBACK that resolves to the accent it always painted. |
  | `glyph` | px | `''` | The glyph's font size, for a tile large enough that the default reads as a speck. A prop rather than a `size`-derived calc precisely because deriving it would re-type all ~40 medallions at once, which is a change with its own frames. |
  | `variant` | `''` \| `'glyph-chip'` | `''` | The tile as an UNBORDERED slate chip carrying a tinted glyph. Anything else resolves to `''`, so a medallion that does not ask for it is byte-identical to what shipped. |

  Invariants:
  - FLAT BY CONTRACT: the surface is `--fab-bg-3`, never a gradient
    (`tests/components/flat-ui-style-contract.test.js`). The reference paints the chip variant with
    a gradient between two slate greys, so a `backgroundColor` compare line against it stays open
    as a recorded deviation rather than a defect this variant can close.
  - THE TINT RECOLOURS THE GLYPH ALONE: every tinted example on the published specimen sets
    `color:` only, and the reference's row chips share ONE surface and differ in the glyph's
    colour. Dropping the surface wash also RAISES glyph-to-ground contrast.
  - THE `glyph-chip` VARIANT OWNS ONE THING: THE ABSENT BORDER, which is what a caller cannot
    otherwise express. Its size and colour are the existing props — making either implicit would
    put a second copy of a row's geometry inside a primitive that already takes it as an argument.
    It owned a second statement, cancelling the tint's surface wash, until that became true of
    every medallion; the cancellation went with the thing it cancelled.
-->
<script>
  let {
    art = '',
    src = '',
    icon = 'fas fa-scroll',
    size = 40,
    alt = '',
    tint = '',
    glyph = 0,
    variant = '',
  } = $props();

  /**
   * The variant set is CLOSED and compared against a literal, so an unrecognised value renders the
   * shipped tile rather than an `is-*` class the style block does not paint. It resolves to a
   * BOOLEAN feeding a `class:` directive rather than a joined class string, which keeps the class
   * attribute a static literal and the class name a literal in the source for the tooling that
   * reads one.
   */
  const isGlyphChip = $derived(String(variant ?? '') === 'glyph-chip');

  const artPath = $derived(art || src);

  const boxHeight = $derived(Math.max(0, Number(size) || 0));
  const glyphPx = $derived(Math.max(0, Number(glyph) || 0));

  // A bare palette key, interpolated into a `style` attribute, so anything else is DROPPED to ''
  // and renders the accent default. The leading `--fab-tag-` is tolerated because
  // `ManagerColorPicker` already accepts both spellings.
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
