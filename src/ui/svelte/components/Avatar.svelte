<!--
  AN ACTOR'S PORTRAIT: a fixed-size tile drawing the actor's artwork, or their INITIALS when there
  is none. It is not the icon chip, which carries a RECORD's artwork with a GLYPH fallback. An
  import-free leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `art` | resolved image path | `''` | Falsy renders the initials fallback, and THE FALLBACK TRIGGER IS THE CALLER'S: this never compares against Foundry's default-artwork constant, which would make it an importing component. |
  | `name` / `alt` | strings | `''` | The only source of the initials, where an empty name renders an empty tile rather than a placeholder glyph; and image alt text, passed EXPLICITLY wherever `art` is set, so that the decision was TAKEN. `avatar-source-contract.test.js` reds on an art-bearing call site that names no `alt`. |
  | `size` | px | `32` | Edge length, unrestricted by the art ladder; the shipped population is recorded on `design-system-known-debt.json`'s `offLadderArtSizes`. |
  | `shape` | `'round'` \| `'square'` | `'round'` | A person, or a party/vehicle/place. A CLOSED set compared against a literal, so an unrecognised value renders the default rather than an unpainted `is-*`. |
  | `tint` | bare `--fab-tag-*` key | `''` | Unset is byte-identical to a flat tile. |

  Invariants:
  - `shape` IS THE KIND, expressed as the one thing the kind decides, and `tint` is a prop for the
    same reason: the redaction-safe actor DTO carries neither.
  - THE TINT IS CLASS-GATED, AND THAT IS THE ONLY GENUINE NO-OP. Written as one unconditional
    `color-mix` on the base, an untinted avatar is not untinted: the property is unset, the mix is
    invalid at computed-value time, and `background-color` falls back to `transparent` — while a
    `transparent` fallback washes out every untinted tile instead.
  - THE RING IS A BORDER COLOUR RATHER THAN THE SPECIMEN'S `box-shadow`, which over the
    `--fab-border` edge this tile already carries would draw two hairlines and grow the tinted tile
    by 1px per side, so a tinted and an untinted avatar would stop aligning. The surface stays flat
    by contract (`tests/components/flat-ui-style-contract.test.js`).
  - The initials are two letters read with `Array.from` rather than by index, so a name starting
    outside the BMP yields a character rather than half a surrogate pair, and with `toUpperCase`
    rather than `toLocaleUpperCase`, so the mark does not depend on the host locale.
-->
<script>
  let { art = '', name = '', alt = '', size = 32, shape = 'round', tint = '' } = $props();

  const SHAPES = new Set(['round', 'square']);

  const FALLBACK_SHAPE = 'round';

  const isSquare = $derived((SHAPES.has(shape) ? shape : FALLBACK_SHAPE) === 'square');

  const boxSize = $derived(Math.max(0, Number(size) || 0));

  const INITIALS_RATIO = 0.3125;

  const initialsPx = $derived(Math.round(boxSize * INITIALS_RATIO));

  function initialsOf(value) {
    const words = String(value ?? '')
      .trim()
      .split(/\s+/u)
      .filter(Boolean);
    if (words.length === 0) return '';
    const letters =
      words.length > 1
        ? [Array.from(words[0])[0], Array.from(words[1])[0]]
        : Array.from(words[0]).slice(0, 2);
    return letters.join('').toUpperCase();
  }

  const initials = $derived(initialsOf(name));

  const safeTint = $derived(
    /^[a-z0-9-]+$/.test(String(tint || '').replace(/^--fab-tag-/, ''))
      ? String(tint).replace(/^--fab-tag-/, '')
      : ''
  );

  const boxStyle = $derived(
    `width:${boxSize}px;height:${boxSize}px;--fab-avatar-initials:${initialsPx}px` +
      (safeTint ? `;--fab-avatar-tint:var(--fab-tag-${safeTint})` : '')
  );
</script>

<span
  class="fab-avatar"
  class:is-square={isSquare}
  class:has-tint={Boolean(safeTint)}
  data-avatar={art ? 'image' : 'initials'}
  data-avatar-tint={safeTint || undefined}
  style={boxStyle}
>
  {#if art}
    <img class="fab-avatar-img" src={art} {alt} />
  {:else}
    <span class="fab-avatar-initials" aria-hidden="true">{initials}</span>
  {/if}
</span>

<style>
  .fab-avatar {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    color: var(--fab-text);
    background: var(--fab-bg-3);
  }

  .fab-avatar.is-square {
    border-radius: 9px;
  }

  .fab-avatar.has-tint {
    border-color: var(--fab-avatar-tint);
    background: color-mix(in oklab, var(--fab-avatar-tint) 30%, var(--fab-bg-3));
  }

  .fab-avatar-img {
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: cover;
  }

  .fab-avatar-initials {
    font-size: var(--fab-avatar-initials, 10px);
    font-weight: 700;
    line-height: 1;
  }
</style>
