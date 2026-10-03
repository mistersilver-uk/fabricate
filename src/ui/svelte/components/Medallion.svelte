<!--
  The flat identity tile used by recipe rows and inspectors: the real linked image when the caller
  resolves one, and a Font Awesome glyph when it does not. An import-free leaf, so the CALLER
  resolves the image and passes a plain string.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `art` | resolved image path | `''` | Falsy renders the glyph fallback. Named for the artwork it carries rather than for an element's `src`. |
  | `src` | DEPRECATED alias for `art` | `''` | Kept for ONE release so an out-of-tree caller is not broken by the rename; `art` wins where both are passed. Delete it, and this row, in the next release. |
  | `icon` / `size` / `glyph` | Font Awesome classes / px | see source / `40` / `''` | The glyph used when `art` is falsy, the tile's edge length, and the glyph's own font size for a tile large enough that the default reads as a speck. `glyph` is a prop rather than a `size`-derived calc because deriving it would re-type all ~40 medallions at once. |
  | `alt` | string | `''` | Image alt text, passed EXPLICITLY wherever `art` is set; the contract is that the decision was TAKEN. `medallion-art-contract.test.js` reds on an art-bearing call site that names no `alt`, and on one reaching for the deprecated alias to escape it. |
  | `tint` | bare `--fab-tag-*` key | `''` | Recolours the GLYPH and nothing else. Unset is byte-identical to the shipped render, because the glyph reads the token through a `var()` fallback. |
  | `variant` | `''` \| `'glyph-chip'` | `''` | The tile as an UNBORDERED slate chip. Anything else resolves to `''`, so a medallion that does not ask for it is byte-identical to what shipped. |
  | `tone` | `''` \| `'success'` \| `'danger'` | `''` | Paints the edge, ground and glyph in that family's `-border`, `-soft` and `-text` tokens, as the library's toned `<IconChip>` specimens do; a rolled die face reads qualified or cancelled by it. Anything else resolves to `''`. |
  | `ink` | `''` \| `'success'` \| `'danger'` | `''` | Inks the GLYPH alone in that family's `-text` token on the unchanged slate ground, as the Checks simulator's result-card icon reads success or failure. Anything else resolves to `''`. |

  Invariants:
  - FLAT BY CONTRACT: the surface is `--fab-bg-3`, or a `tone`'s flat `-soft` token, never a gradient
    (`tests/components/flat-ui-style-contract.test.js`). The reference paints the chip variant with a
    gradient, so a `backgroundColor` compare against it stays a recorded deviation.
  - THE TINT RECOLOURS THE GLYPH ALONE, which also raises glyph-to-ground contrast, and it is
    validated to a bare palette key before interpolation into the `style` attribute; the leading
    `--fab-tag-` is tolerated because `TintPickerButton` accepts both spellings.
  - THE `glyph-chip` VARIANT OWNS ONE THING, THE ABSENT BORDER, which is what a caller cannot
    otherwise express; its size and colour stay the existing props.
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
    tone = '',
    ink = '',
  } = $props();

  const safeTone = $derived(['success', 'danger'].includes(tone) ? tone : '');
  const safeInk = $derived(['success', 'danger'].includes(ink) ? ink : '');

  const isGlyphChip = $derived(String(variant ?? '') === 'glyph-chip');

  const artPath = $derived(art || src);

  const boxHeight = $derived(Math.max(0, Number(size) || 0));
  const glyphPx = $derived(Math.max(0, Number(glyph) || 0));

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
  class:is-tone-success={safeTone === 'success'}
  class:is-tone-danger={safeTone === 'danger'}
  class:is-ink-success={safeInk === 'success'}
  class:is-ink-danger={safeInk === 'danger'}
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
    color: var(--fab-medallion-tint, var(--fab-accent));
    background: var(--fab-bg-3);

    font-size: var(--fab-medallion-glyph, 0.9rem);
  }

  .fab-medallion.is-glyph-chip {
    border: 0;
  }

  .fab-medallion.is-tone-success {
    border-color: var(--fab-success-border);
    color: var(--fab-success-text);
    background: var(--fab-success-soft);
  }

  .fab-medallion.is-tone-danger {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
  }

  .fab-medallion.is-ink-success {
    color: var(--fab-success-text);
  }

  .fab-medallion.is-ink-danger {
    color: var(--fab-danger-text);
  }

  .fab-medallion-img {
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: cover;
  }
</style>
