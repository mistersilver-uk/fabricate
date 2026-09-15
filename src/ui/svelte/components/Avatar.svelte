<!--
  AN ACTOR'S PORTRAIT: a fixed-size tile drawing the actor's artwork, or their INITIALS when there is
  none. It is not the icon chip, which carries a RECORD's artwork with a GLYPH fallback; the two
  differ in the corner and in the fallback, so one component taking a `kind` prop would be two
  components sharing a file. An IMPORT-FREE LEAF (design-system §7), because one util import inside
  a leaf propagates a required raw-module entry into every mount harness compiling anything that
  renders it, and a missing entry HANGS that suite as `# cancelled`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `art` | resolved image path | `''` | Falsy renders the initials fallback, and THE FALLBACK TRIGGER IS THE CALLER'S: this never compares against Foundry's default-artwork constant, which would make it an importing component rather than a leaf. Named `art` because it carries a record's ARTWORK rather than an element's `src`. |
  | `name` | string | `''` | The ONLY source of the initials. An empty name renders an empty tile rather than a placeholder glyph: inventing a person glyph for the nameless case would be a second fallback nobody asked for. |
  | `alt` | string | `''` | Image alt text, passed EXPLICITLY wherever `art` is set. `alt=""` is the correct value at both shipped sites, because each renders the actor's name as adjacent text; the contract is that the decision was TAKEN. `avatar-source-contract.test.js` reds on an art-bearing call site that names no `alt`. |
  | `size` | px | `32` | Edge length, the specimen's single-mark rung. NOT restricted to the art ladder, because the caption covers avatar, stack and member row and says nothing about a detail header. The shipped population is recorded on `design-system-known-debt.json`'s `offLadderArtSizes`. |
  | `shape` | `'round'` \| `'square'` | `'round'` | A person, or a party/vehicle/place. A CLOSED set compared against a literal, so an unrecognised value renders the default rather than emitting an `is-*` class the style block does not paint; `round` is the default because the person mark is the reading a caller gets wrong by silence. `shape` IS the kind, expressed as the one thing the kind decides: actor type is system-defined and eligibility comes from a GM world setting, so a second `kind` prop would put a routing table inside a primitive that cannot see the setting it depends on. |
  | `tint` | bare `--fab-tag-*` key | `''` | Unset is byte-identical to a flat tile. It is a prop for the same reason `shape` is one: the redaction-safe actor DTO carries neither a tint nor a kind. |

  Invariants:
  - THE TINT IS CLASS-GATED, AND THAT IS THE ONLY GENUINE NO-OP. Written as one rule on the base —
    `background: color-mix(in oklab, var(--fab-avatar-tint) 30%, var(--fab-bg-3))` — an UNTINTED
    avatar is not untinted: the property is unset, so the mix is invalid at computed-value time
    and `background-color` falls back to `transparent`, losing the ground entirely. A
    `transparent` fallback does not repair it either — that mixes 30% of nothing into the ground
    and washes out every untinted tile. Hence `has-tint` is a `class:` directive rather than a
    value.
  - THE RING IS A BORDER COLOUR RATHER THAN THE SPECIMEN'S `box-shadow`. Reproduced literally on
    top of the `--fab-border` edge this tile already carries, that would be TWO hairlines where
    the specimen draws one, and it would grow the tinted tile's footprint by 1px per side, so a
    tinted and an untinted avatar in the same roster would no longer align. The VALUE is the
    specimen's: the tint at full strength.
  - FLAT BY CONTRACT: the surface is `--fab-bg-3` or a mix over it, never a gradient
    (`tests/components/flat-ui-style-contract.test.js`).
-->
<script>
  let { art = '', name = '', alt = '', size = 32, shape = 'round', tint = '' } = $props();

  const SHAPES = new Set(['round', 'square']);

  const FALLBACK_SHAPE = 'round';

  // A BOOLEAN feeding a `class:` directive rather than a joined class string, so the class
  // attribute stays a static literal and the class names stay literals for the tooling that
  // reads them.
  const isSquare = $derived((SHAPES.has(shape) ? shape : FALLBACK_SHAPE) === 'square');

  const boxSize = $derived(Math.max(0, Number(size) || 0));

  /**
   * The initials type scale, as the fraction of the box the specimen draws. DERIVED rather than a
   * prop, because with `size` deliberately unrestricted a fixed 10px would render as a speck
   * inside a 50px detail-header portrait.
   */
  const INITIALS_RATIO = 0.3125;

  const initialsPx = $derived(Math.round(boxSize * INITIALS_RATIO));

  /**
   * Two letters from a name: the first of each of the first two words, or the first two characters
   * of a single word. Iterated with `Array.from` rather than by index, so a name whose first
   * character is outside the BMP yields that character rather than half of its surrogate pair, and
   * `toUpperCase` rather than `toLocaleUpperCase`, so the mark does not depend on the host locale.
   *
   * @param {unknown} value the actor's name
   * @returns {string} two letters, one letter, or the empty string
   */
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

  // A bare palette key, interpolated into a `style` attribute, so anything else is DROPPED to ''
  // and renders the flat untinted tile. The leading `--fab-tag-` is tolerated because
  // `ManagerColorPicker` already accepts both spellings.
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
  /* Theme-root tokens only: `--fab-bg-3`, `--fab-border` and the `--fab-tag-*` family are
     declared in `:root` and in all seven theme blocks, which every Fabricate surface carries. */
  .fab-avatar {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    /* `999px` and not `50%`, because the published radius ladder carries the pill value and a
       non-square box should clamp rather than become an ellipse. */
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
    /* `1` rather than the host's leading: inherited leading would push a two-letter mark off
       centre in the small sizes. */
    line-height: 1;
  }
</style>
