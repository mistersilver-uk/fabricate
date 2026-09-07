<!-- Svelte 5 runes mode -->
<!--
  AN ACTOR'S PORTRAIT (issue 1506).

  ── WHY IT IS NOT THE ICON CHIP ───────────────────────────────────────────────────
  `library.html:1425-1431` publishes the `Avatar` entry beside `Rail`, `LogList` and
  `TierTrack`, and §14's routing row separates it from the `IconChip` entry on WHAT THE
  MARK IS ABOUT: the icon chip carries a RECORD's artwork with a glyph fallback, and this
  carries an ACTOR's — a person, a party, a vehicle or a place — with an INITIALS
  fallback. The two differ in the corner (round for a person, rounded-square for the
  rest) and in what they draw when there is no artwork, which is why one component
  taking a `kind` prop would have been two components sharing a file.

  ── THE SHAPE IS THE CALLER'S, AND SO IS THE KIND ─────────────────────────────────
  `library.html:1431` states it in terms: round for people, rounded-square for
  parties, vehicles and places, "but `shape` is caller-supplied, not derived: actor
  type is system-defined, and eligibility here comes from a GM world setting, not a
  type map". `shape` IS the kind, expressed as the one thing the kind decides — a
  second `kind` prop mapping onto this one would put the specimen's own routing table
  inside a primitive that cannot see the world setting it depends on.

  The same sentence is why `tint` is a prop: the redaction-safe actor DTO in
  `src/main.js` carries neither a tint nor a kind, so both arrive from the caller or
  not at all.

  ── THE IMAGE STATE IS SPECIFIED HERE, NOT INHERITED ──────────────────────────────
  The specimen draws only INITIALS tiles, and both shipped callers pass a real
  `character.img`, so the image geometry is stated rather than borrowed by accident:
  `object-fit: cover` filling the box, `overflow: hidden`, the ground `--fab-bg-3`,
  and the `1px solid var(--fab-border)` edge KEPT from the icon chip's own base rule.
  With those held, the only property that moves at the two converted sites is the
  CORNER.

  THE FALLBACK TRIGGER IS THE CALLER'S. This renders initials when it is passed no
  `art`, and never compares against Foundry's default-artwork constant — which is
  what `library.html:1436` describes and what would make this an importing component
  rather than a leaf. Core assigns default artwork on creation, so the initials state
  is genuinely rare; it is specified because it is the state this tile OWNS, not
  because a shipped screen reaches it today.

  IMPORT-FREE LEAF (design-system §7): props only. One util import inside a leaf
  propagates a required raw-module entry into every mount harness compiling anything
  that renders it, and a missing entry HANGS that suite (`# cancelled`) rather than
  failing it.

  Flat by contract: the surface is `--fab-bg-3` or a mix over it, never a gradient
  (`tests/components/flat-ui-style-contract.test.js` bans linear/radial/conic
  gradients anywhere under `src/ui/**` and `styles/**`).

  ── WHY THE TINT IS CLASS-GATED, AND WHY THAT IS THE ONLY GENUINE NO-OP ───────────
  This argument arrives here from `Medallion.svelte`, which carried it until issue
  1506 deleted the rule it justified. It is repeated rather than cited because the
  citation would dangle, and because this component is now the only place in the tree
  where the trap is live.

  Written the way the specimen draws it — one rule, `background: color-mix(in oklab,
  var(--fab-avatar-tint) 30%, var(--fab-bg-3))` on the base — an UNTINTED avatar is
  not untinted. `--fab-avatar-tint` is unset at both shipped call sites, so the
  `color-mix()` is invalid at computed-value time and `background-color` falls back to
  its initial `transparent`: the tile loses its ground entirely. Writing the property
  with a `transparent` fallback does not repair it either — that mixes 30% of nothing
  into `--fab-bg-3` and renders every untinted avatar washed out. A SEPARATE,
  CLASS-GATED rule is the only form that is genuinely a no-op when the property is
  unset, which is why `has-tint` is a `class:` directive rather than a value.

  ── AND WHY THE RING IS A BORDER COLOUR RATHER THAN A SHADOW ─────────────────────
  The specimen's tinted tiles draw their ring as `box-shadow: 0 0 0 1px <tint>`
  (`library.html:1427-1428`). Reproduced literally on top of the `--fab-border` edge
  this component already carries, that would be TWO hairlines where the specimen draws
  one, and it would grow the tinted tile's visual footprint by 1px per side relative
  to the untinted one — a tinted avatar and an untinted avatar in the same roster
  would no longer align. So the ring REPLACES the edge, by recolouring `border-color`,
  which is the mechanism `Medallion.svelte` used for its own tinted edge before that
  rule was deleted. The VALUE is the specimen's rather than that precedent's: the
  medallion mixed 45% of the tint into `--fab-border`, and the specimen's ring is the
  tint at full strength.

  Both are unreachable in the tree as it stands — neither shipped caller passes a tint
  — so they are specified to spare the next implementer the guess, not because a
  shipped pixel depends on them.

  Props:
   - art: resolved image path; falsy → the initials fallback. Named `art` for the same
     reason the icon chip's is: what it carries is a record's ARTWORK rather than an
     element's `src` attribute. There is no deprecated `src` alias here, because this
     component has never shipped under another name.
   - name: the actor's name, and the ONLY source of the initials. Both shipped callers
     already carry it on the projection beside the image, so the fallback needs no
     widening of the redaction-safe DTO. An empty name renders an empty tile rather
     than a placeholder glyph: this tile's fallback is initials, and inventing a
     person glyph for the nameless case would be a second fallback nobody asked for.
   - alt: image alt text. Passed EXPLICITLY wherever `art` is set — `alt=""` is the
     correct value at both shipped sites, because each renders the actor's name as
     adjacent text, and the contract is that the decision was TAKEN rather than that a
     sentence was written. `avatar-source-contract.test.js` reds on an art-bearing
     call site that names no `alt`.
   - size: edge length in px (default 32, the specimen's single-mark rung; 26 is its
     stacked rung). NOT restricted to the art ladder: `library.html:1425`'s caption is
     "avatar, stack, member row" and says nothing about a detail header, where a 32px
     portrait would sit beside a two-line name stack taller than itself. The shipped
     population is recorded on `design-system-known-debt.json`'s `offLadderArtSizes`
     so the geometry sweep lowers a pin rather than re-deriving a census.
   - shape: 'round' (a person) or 'square' (a party, a vehicle or a place). The set is
     CLOSED and compared against a literal, so an unrecognised value renders the
     default rather than emitting an `is-*` class the style block does not paint — the
     rule `ManagerButton`'s `ROLE_CLASSES` and `Chip`'s `TONES` both follow. `round`
     is the default because the person mark is the reading a caller gets wrong by
     silence; a party, a vehicle or a place is the deliberate opt-in.
   - tint: a BARE `--fab-tag-*` palette key (`sage`, `mauve`, …). Unset is
     byte-identical to a flat tile: the mix and the ring are class-gated, per the
     paragraphs above.
-->
<script>
  let { art = '', name = '', alt = '', size = 32, shape = 'round', tint = '' } = $props();

  /** The closed shape set. See the `shape` prop note above. */
  const SHAPES = new Set(['round', 'square']);

  /** A person is the reading a caller gets by silence, so it is the one that is safe. */
  const FALLBACK_SHAPE = 'round';

  // Resolved to a BOOLEAN feeding a `class:` directive rather than to a class string joined into
  // the attribute, so the class attribute stays a static literal and the class names stay literals
  // in the source for the tooling that reads them.
  const isSquare = $derived((SHAPES.has(shape) ? shape : FALLBACK_SHAPE) === 'square');

  // Coerced and floored at zero before interpolation: it lands in a `style` attribute, and a
  // caller that passes a string is a caller that could otherwise compose a declaration.
  const boxSize = $derived(Math.max(0, Number(size) || 0));

  /**
   * The initials type scale, as the fraction of the box the specimen draws.
   *
   * `library.html:1427` sets 10px inside a 32px tile, which is this ratio exactly; its stacked
   * 26px tile sets 9px, which this reproduces as 8. DERIVED rather than a prop, which is the
   * opposite of the choice `Medallion.svelte` makes for its glyph — and the difference is that
   * deriving the medallion's would have re-typed forty shipped tiles at once, while this
   * component is new, has two call sites and draws initials at neither. With `size`
   * deliberately unrestricted, a fixed 10px would render as a speck inside the 50px detail
   * header portrait, which is the one thing a constant cannot survive here.
   */
  const INITIALS_RATIO = 0.3125;

  const initialsPx = $derived(Math.round(boxSize * INITIALS_RATIO));

  /**
   * Two letters from a name: the first of each of the first two words, or the first two
   * characters of a single word.
   *
   * Iterated with `Array.from` rather than by index, so a name whose first character is outside
   * the BMP yields that character rather than half of its surrogate pair. `toUpperCase` and not
   * `toLocaleUpperCase`, because the rendered mark must not depend on the host's locale.
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

  // The token arrives as a bare palette key and is interpolated into a `style` attribute, so it
  // is constrained to the shape a key can have. Anything else is DROPPED to '' — an unrecognised
  // value renders the flat untinted tile rather than emitting a declaration the caller composed.
  // The leading `--fab-tag-` is tolerated because `ManagerColorPicker` already accepts both
  // spellings and a primitive should not be the one place that does not.
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
    <!-- Decorative: every shipped site renders the actor's name as adjacent text, so the mark
         is a second reading of a word the reader already has. -->
    <span class="fab-avatar-initials" aria-hidden="true">{initials}</span>
  {/if}
</span>

<style>
  /* Flat surface — no gradient (flat-ui-style-contract). Theme-root tokens only: `--fab-bg-3`,
     `--fab-border` and the `--fab-tag-*` family are declared in `:root` and in all seven
     `.fabricate[data-fabricate-theme="…"]` blocks, which every Fabricate surface carries. */
  .fab-avatar {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    /* The edge is on the BASE rule, so it is the edge in BOTH the tinted and the untinted
       state; the tinted rule recolours it rather than adding a second one. */
    border: 1px solid var(--fab-border);
    /* A person. `library.html:1427` draws the round mark and `:1431` says which actors take
       it. `999px` and not `50%`, because the published radius ladder carries the pill value
       and a non-square box should clamp rather than become an ellipse. */
    border-radius: 999px;
    color: var(--fab-text);
    background: var(--fab-bg-3);
  }

  /* A party, a vehicle or a place (`library.html:1428`, `:1431`). r9 is the avatar ladder's own
     rounded-square value, published in `spec.md`'s geometry requirement with this change. */
  .fab-avatar.is-square {
    border-radius: 9px;
  }

  /* THE TINT, CLASS-GATED. The docblock above argues at length why this is a separate rule and
     not a `color-mix()` against a possibly-unset property, and why the ring is a border colour
     rather than the specimen's literal `box-shadow`. */
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
    /* Derived from `size` and always emitted, so the fallback below is a safety net rather than
       a rung. It records the specimen's own 32px figure. */
    font-size: var(--fab-avatar-initials, 10px);
    font-weight: 700;
    /* `1` rather than the host's leading: the mark is one line inside a fixed box, and inherited
       leading would push a two-letter mark off centre in the small sizes. */
    line-height: 1;
  }
</style>
