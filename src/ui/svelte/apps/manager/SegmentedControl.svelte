<!-- Svelte 5 runes mode -->
<!--
  Binary / tertiary mode switch styled as a segmented track (design-system §7.4:
  track = surface-soft, active thumb = accent on on-accent text). Renders REAL
  radios (one per option) so the control is keyboard- and screen-reader
  accessible; the radios are visually hidden and their `<label>` segments carry
  the styling. Purely presentational and prop-driven.

  Used for whenSpent (Destroyed / Becomes inert) and the learning-limit scope
  (Per copy / Across all copies).

  Props:
   - options: [{ value, labelKey, fallback, icon?, variant?, disabled?, count? }] — the
     segments, in order. `variant` ('' | 'success' | 'info' | 'warning' | 'danger' |
     'neutral') tints the ACTIVE segment only and defaults to the plain active tile, so a
     consumer that sets none renders exactly as before. `info` and `warning` (issue 1286)
     complete the semantic ramp: the CSS declared only `success` and `danger`, so a
     three-way minor/major/severe control — the complications section's severity picker —
     could express exactly one of its three segments and the other two fell back to the
     plain tile. Each is purely additive and gated on its own `is-<variant>` class, so no
     existing consumer's markup or rendering moves. `disabled` is carried onto the segment's
     radio ITSELF, not merely onto a class: `select()` only guards `next !== value`,
     so a dimmed-but-live segment would still fire onChange. `count` renders a trailing
     tally so a segment can say how many rows choosing it would show — omitted by every
     existing consumer, and a non-finite value renders nothing rather than `NaN`. `badge`
     (issue 1371) is that SAME tally in the mono face, for a filter the reference draws that
     way; a caller passes `count` or `badge`, never both.
   - value: the currently selected option `value`.
   - onChange(value): called with the chosen option's `value` on selection.
   - groupName: the shared radio `name` (must be unique per rendered control).
   - ariaLabel: accessible name for the radiogroup.
   - dataAttr?: optional data-* attribute name stamped `true` on the track (for
     test/host hooks, e.g. 'data-when-spent-control').
   - optionDataAttr?: optional data-* attribute name stamped with each option's
     `value` on its segment (e.g. 'data-when-spent-option').
   - fill?: when true the track spans its container full-width and the segments
     share it equally (each `flex: 1 1 0`), rather than the default inline track
     hugging its content. The recipe rail's Step-mode control opts in; the other
     uses (whenSpent, learning scope) keep the default inline sizing.
   - shape?: '' (the shipped track) or 'pill' — the CONSTRUCTION, orthogonal to `density`
     (which is the scale) and to `tone` (which is the paint). The reference draws its
     filter controls as a RUN OF SEPARATE PILLS rather than as tiles inside a frame
     (`proto:5457`, the world Component entry's `All / With rules / Without`): no track fill,
     no track edge, no track padding, radius 999 on each segment, and every segment at 600
     because a pill run has no resting/chosen WEIGHT contrast — each pill carries its own
     edge instead. Opt-in, so every existing consumer keeps the framed track.
   - iconOnly?: when true each segment renders its `icon` glyph alone in a compact
     square tile and the label is CLIPPED rather than dropped (issue 1036). See the
     `is-icon-only` CSS below for why the markup is unchanged and the accessible
     name survives. Opt-in: every existing consumer keeps the labelled rendering.

  ## The icon-only variant is a VARIANT, not a second control

  The essence library's list/grid toggle is the prototype's two glyph tiles, and the
  labelled track is ~2x their width — so the toggle either shouted louder than the
  status filter beside it or a neighbouring control had to be moved to buy it room.
  Both were tried before this. Hand-rolling a pair of `.manager-icon-button`s instead
  would have re-derived the segmented track's active tile, hover, focus ring and radio
  keyboarding in a fourth place, which is the copy the shared-primitive rule refuses;
  the mismatch is presentational, so the fix belongs on the primitive as a flag.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    options = [],
    value = '',
    onChange = () => {},
    groupName = '',
    ariaLabel = '',
    dataAttr = '',
    optionDataAttr = '',
    fill = false,
    iconOnly = false,
    // 'default': the manager's existing track. 'compact': the Checks Studio's per-ROW
    // scale, taken from the prototype and pinned by the Checks Studio parity fixture's
    // `segmented-toggle` / `segmented-option-*` regions. 'field': the same studio's
    // FIELD scale — the Difficulty card's `COMPARISON` control, which stands beside a
    // 36px stepper in a labelled field rather than inside a 46px list row, and which the
    // prototype draws two pixels roomier with an ACCENT-edged active tile.
    //
    // Each is a VARIANT ON THE PRIMITIVE rather than an override written from the layout
    // context, because the design system forbids a layout-context rule restyling a
    // primitive's `font-*`, `border`, `border-radius` and `background` — and those four
    // are exactly what these tracks change. A SIZE taken from the layout context is still
    // permitted, so the tier row supplies the 158px width and nothing else.
    density = 'default',
    // '' | 'tag': the FAMILY the whole track is painted in, which is orthogonal to `density`
    // and to the per-option `variant` above. `variant` tints one ACTIVE segment inside an
    // otherwise neutral track to say what choosing it means; `tone` says what the track is
    // ABOUT, and repaints its edge and both its segments together (issue 1373).
    //
    // One value so far. The recipe/repair requirement row's any-of / all-of control is the
    // only member of a control run — the row's own edge, the tag chips, the `+ Tag` pill —
    // that is entirely about tags, and a neutral track there put the one control that names
    // the match policy in a different family from the values it applies to. `tag` is not a
    // semantic ramp cell like `success` or `danger`: it names an entity family, so it cannot
    // be spelled as a per-option `variant` without claiming that CHOOSING it means something.
    //
    // It carries the track's own scale as well as its colour, so a `tone` consumer passes no
    // `density`: the design draws this control at one size only, and a caller free to combine
    // the two would be choosing between two sets of the same four properties at equal
    // specificity, decided by source order.
    //
    // 'accent' (issue 1371, maintainer parity round 4) is the COHORT filter's family: the
    // reference's system rules list draws its `In this system` / `All world components` switch
    // with the chosen segment FILLED `--fab-accent` on `--fab-on-accent` and the idle one
    // unfilled, unbordered and in `--fab-text-muted` (`proto:1558`). Unlike `tag` it carries no
    // scale of its own — it is colour only — so it composes with `density="compact"`, which is
    // the rung the reference's `padding: 5px 11px` / radius-6 / 10.5px-600 segment lands on.
    // That is deliberate and is why it is spelled as a `tone` rather than a fourth `density`:
    // the geometry is already a shipped rung and only the paint is new.
    //
    // 'accent-soft' (issue 1371) is the OTHER accent control the reference draws, and it is a
    // second value rather than a repaint of `accent` because both ship. `accent` is the cohort
    // SWITCH at `proto:1558`: the chosen segment solid `--fab-accent` on `--fab-on-accent`, the
    // idle one unfilled, unbordered and muted — two alternative views of one thing, where only
    // the chosen one has a face. `accent-soft` is the FILTER at `proto:5457`, where every
    // segment has a face: the idle one a real tile on `--fab-bg-1` behind a `--fab-border`
    // hairline, the chosen one `--fab-accent-soft` inside `--fab-accent-border` in `--fab-accent`
    // ink. All three of those accent tokens are byte-equal to the reference's own values here, so
    // this is a token statement rather than an approximation.
    //
    // Like `accent` it carries NO scale, so it composes with `density="compact"` — the rung the
    // reference's 10.5px segment already lands on — and with `shape="pill"`, which is the corner
    // and the frameless track. Note for anyone matching on strings: `is-accent` is a PREFIX of
    // `is-accent-soft`, and only a whole-token match tells the two apart.
    tone = '',
    shape = '',
  } = $props();

  function text(key, fallback) {
    if (!key) return fallback ?? '';
    const translated = localize(key);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  function select(next) {
    if (next !== value) onChange(next);
  }

  // Class list for one segment. The variant tint applies to the ACTIVE segment only —
  // an inactive segment stays the muted track colour whatever it would become when
  // chosen, which is what keeps a three-way outcome toggle legible.
  function segmentClass(option) {
    const active = option.value === value;
    const variant = active && option.variant ? ` is-${option.variant}` : '';
    return `manager-segment ${active ? 'is-active' : ''}${variant}${option.disabled ? ' is-disabled' : ''}`;
  }
</script>

<div
  class={`manager-segmented${fill ? ' is-fill' : ''}${iconOnly ? ' is-icon-only' : ''}${density === 'compact' ? ' is-compact' : ''}${density === 'field' ? ' is-field' : ''}${tone === 'tag' ? ' is-tag' : ''}${tone === 'accent' ? ' is-accent' : ''}${tone === 'accent-soft' ? ' is-accent-soft' : ''}${shape === 'pill' ? ' is-pill' : ''}`}
  role="radiogroup"
  aria-label={ariaLabel || undefined}
  {...dataAttr ? { [dataAttr]: true } : {}}
>
  {#each options as option (option.value)}
    <!-- `title` ONLY in the icon-only variant: it is the pointer half of the affordance
         the clipped label already gives the a11y tree, and a labelled segment showing a
         tooltip that repeats its own visible words is noise. `undefined` omits the
         attribute outright, so a labelled consumer's markup is untouched. -->
    <label
      class={segmentClass(option)}
      title={iconOnly ? text(option.labelKey, option.fallback) : undefined}
      {...optionDataAttr ? { [optionDataAttr]: option.value } : {}}
    >
      <input
        type="radio"
        class="manager-segment-input"
        name={groupName}
        value={option.value}
        checked={option.value === value}
        disabled={option.disabled === true}
        onchange={() => select(option.value)}
      />
      {#if option.icon}<i class={option.icon} aria-hidden="true"></i>{/if}
      <span class="manager-segment-label">{text(option.labelKey, option.fallback)}</span>
      {#if Number.isFinite(option.count)}
        <span class="manager-segment-count" data-segment-count={option.count}>{option.count}</span>
      {/if}
      <!--
        `badge` IS `count`'S MONO PRESENTATION, not a second tally (issue 1371, round 4).

        The reference draws a filter segment as `label` + a numeral in the MONO face, and the
        shipped `count` slot draws the same number in the track's sans. Rather than a second
        element with a second meaning — which is the duplication a shared primitive exists to
        stop — `badge` reuses the slot and changes only the face. A caller passes one or the
        other; passing both is a caller error and renders two numerals, which is visible.

        The mono face ships 400 and 500 only (`design-system/spec.md:230-231`), so the
        reference's `font:700 …var(--mono)` numeral lands on 500.
      -->
      {#if option.badge !== undefined && option.badge !== null && option.badge !== ''}
        <span class="manager-segment-count is-badge" data-segment-badge={option.badge}
          >{option.badge}</span
        >
      {/if}
    </label>
  {/each}
</div>

<style>
  .manager-segmented {
    display: inline-flex;
    gap: var(--fab-space-2xs);
    padding: var(--fab-space-2xs);
    background: var(--fab-surface-soft);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
  }

  /* Full-width variant (issue 643): the track fills its container and the segments
     share it equally, so a two-option control reads as one balanced bar rather than
     two content-hugging tiles floating at the left. */
  .manager-segmented.is-fill {
    display: flex;
    width: 100%;
  }

  .manager-segmented.is-fill .manager-segment {
    flex: 1 1 0;
  }

  /* COMPACT variant (issue 1096): the Checks Studio's in-row scale, measured from the
     prototype. Authored in px, as the prototype authors it, because the exact value is what the parity
     fixture's `segmented-option-selected.fontSize` asserts. Declared BEFORE `.is-active`
     below so the active tile's own weight still wins at equal specificity. */
  .manager-segmented.is-compact {
    gap: 3px;
    padding: 3px;
    border-radius: 8px;
    background: var(--fab-bg-1);
  }

  .manager-segmented.is-compact .manager-segment {
    flex: 1 1 0;
    height: 26px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 10.5px;
  }

  /* `:not(.is-active)` is load-bearing, not tidiness: this rule is (0,3,0) and
     `.manager-segment.is-active` is (0,2,0), so an unqualified `color` / `font-weight`
     here would out-specify the ACTIVE tile's own and paint the lit segment as the
     resting one. */
  .manager-segmented.is-compact .manager-segment:not(.is-active) {
    color: var(--fab-text-subtle);
    font-weight: 500;
  }

  /* FIELD variant (issue 1096): the Checks Studio's Difficulty card draws `COMPARISON` as
     a labelled field beside a 36px stepper, not as an in-row toggle, and the prototype
     gives it a roomier track (4px rather than 3px) and an ACCENT-edged active tile over
     the raised surface instead of the default strong border over the active one.

     A third density rather than a rule written from the Difficulty card, for the reason
     `is-compact` is a density: padding, radius, background and the active tile's edge are
     the primitive's to state. Authored in px, as the prototype authors it. */
  .manager-segmented.is-field {
    gap: 4px;
    padding: 4px;
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  .manager-segmented.is-field .manager-segment {
    flex: 1 1 0;
    height: 26px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 10.5px;
  }

  /* `:not(.is-active)` is load-bearing here for the same reason it is on `.is-compact`:
     this rule is (0,3,0) and `.manager-segment.is-active` is (0,2,0). */
  .manager-segmented.is-field .manager-segment:not(.is-active) {
    color: var(--fab-text-subtle);
    font-weight: 500;
  }

  .manager-segmented.is-field .manager-segment.is-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-raised);
  }

  /* TAG TONE (issue 1373): the requirement row's any-of / all-of control, drawn as the design
     draws it at `proto:2268` and `proto:4628` — an edged track in the tag family with the
     chosen segment lit in the same hue and the unchosen one painting nothing at all.

     `overflow: hidden` is why no segment restates a corner radius: the track clips them to its
     own ends, so the pair reads as one control rather than two tiles inside a box. That is also
     why the track carries no padding and no gap — the design's segments MEET.

     THE TRACK IS SHORTER THAN THE DEFAULT AND THE COMPACT ONE, and that is load-bearing rather
     than cosmetic. This control is the only thing a tag requirement row carries that the other
     three kinds do not, so it is the row's tallest item unless it is smaller than the 30px
     select and field beside it — and a taller one made an EMPTY tag row stand above every
     sibling row in the same set (the maintainer's round-7 report, guarded by `the tag
     requirement row keeps its arm whole, and an EMPTY one is a row like any other`).

     THE SEGMENT PADDING IS TOKENS, not the design's own `4px 9px`. The two other densities
     above authored their padding in px and are carried in the spacing ratchet's baseline as
     debt; a third would ADD to it, which is the one thing that baseline exists to stop. The
     nearest steps are `--fab-space-1` and `--fab-space-2`, which is a pixel narrower per side
     than the design draws — well inside the slack this control has, since what its width has
     to satisfy is the row's one-line budget rather than a pinned value.

     The hue is written as a RATIO against `--fab-purple` rather than as the design's own
     translucent literal, because that is how the tag family is already mixed here — the
     requirement row's edge and the `+ Tag` pill both do it — and a literal would fail the
     colour contract. */
  .manager-segmented.is-tag {
    gap: 0;
    padding: 0;
    border-color: color-mix(in srgb, var(--fab-purple) 40%, transparent);
    border-radius: 7px;
    background: transparent;
    overflow: hidden;
  }

  .manager-segmented.is-tag .manager-segment {
    height: auto;
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 9.5px;
    font-weight: 600;
  }

  /* `:not(.is-active)` is load-bearing here for the same reason it is on `.is-compact`: this
     rule is (0,4,0) and it would otherwise out-specify `.manager-segment.is-active`'s own ink
     and paint the lit segment as the resting one. */
  .manager-segmented.is-tag .manager-segment:not(.is-active) {
    color: var(--fab-text-subtle);
  }

  .manager-segmented.is-tag .manager-segment.is-active {
    border-color: transparent;
    background: color-mix(in srgb, var(--fab-purple) 22%, transparent);
    color: var(--fab-text);
  }

  /* THE FOCUS RING TURNS INWARD, and it is the `overflow: hidden` above that makes it have to.
     An outline is painted OUTSIDE the element's border box, so the clip that gives this track
     its rounded ends would take the shared `outline-offset: 2px` ring with it and leave a
     keyboard user with no visible focus at all. A negative offset paints the same ring inside
     the segment instead, where nothing clips it. This is the only density that clips, so the
     override is scoped to the tone rather than applied to the primitive. */
  .manager-segmented.is-tag .manager-segment:has(:focus-visible) {
    outline-offset: -2px;
  }

  /* ICON-ONLY variant (issue 1036): a square glyph tile per segment. `min-width: 32px`
     is the target, not the glyph — a 0.72rem icon on its own measures ~12px, and a tile
     that hugged it would be a 28px-tall control 16px wide. It sits one step inside the
     34px `.manager-icon-button` because the track adds its own padding and border
     around the pair, so the two controls end up the same height in a toolbar row. */
  .manager-segmented.is-icon-only .manager-segment {
    /* A local containing block for the two clipped 1px children. It changes nothing
       today — neither sets an offset, so both take their static position inside the
       segment either way — but without it the first offset either ever grows would be
       resolved against whatever distant ancestor happens to be positioned. */
    position: relative;
    gap: 0;
    min-width: 32px;
    padding: var(--fab-space-chip) var(--fab-space-2);
  }

  /* The label is CLIPPED, never removed and never `display: none`.

     The segment's `<label>` IS the radio's accessible name — that is the whole reason
     this control renders real radios — so dropping the span would leave every segment
     of an icon-only track anonymous to a screen reader, and `display: none` would take
     it out of the accessibility tree for the same net effect. Clipping keeps the name
     and the keyboard behaviour exactly as the labelled variant has them, and costs the
     markup nothing: the icon-only rendering is a pure CSS statement over the same DOM,
     which is what keeps `[data-…-option="…"]` resolving to a real clickable target.

     This restates the `.visually-hidden` utility in `styles/fabricate.css` rather than
     reaching for it: a scoped block cannot see a global class, and stamping
     `visually-hidden` into the markup would fire it for the labelled consumers too. */
  .manager-segmented.is-icon-only .manager-segment-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  /* PILL SHAPE (issue 1371): a RUN OF SEPARATE PILLS, not tiles in a frame. `proto:5457` draws
     the entry's system filter with no track box at all — the pills sit directly in the toolbar
     row — so the track gives up its fill, its edge and its padding, and what is left of it is the
     flex row and the gap between the pills.

     THE GAP IS `--fab-space-2`. The reference's toolbar sets 9px between every one of its
     children, which is off the published 4px spacing scale that
     `tests/components/spacing-scale-ratchet.test.js` enforces as a ratchet; 8px is the nearest
     step, and it is the same step the row's other gaps snap to.

     WRITTEN AFTER `is-compact` AND `is-field` ON PURPOSE. `.manager-segmented.is-pill
     .manager-segment` ties `.manager-segmented.is-compact .manager-segment` on specificity —
     both are two classes plus one — so ORDER is what decides the corner, and a pill run written
     above them would silently keep the density's 6px radius. The same is true of the weight
     rule below against each density's `:not(.is-active)` block.

     `border-color: transparent` rather than `border: 0`, so the track keeps the 1px it
     contributes to the row's height and nothing above it reflows when a caller opts in. */
  .manager-segmented.is-pill {
    gap: var(--fab-space-2);
    padding: 0;
    border-color: transparent;
    border-radius: 0;
    background: none;
  }

  .manager-segmented.is-pill .manager-segment {
    border-radius: 999px;
  }

  /* Every segment at 600. A framed track says which segment is chosen partly by WEIGHT — the
     densities above drop their idle segments to 500 — but a pill run says it with the pill's own
     face, and the reference draws all three at 600. `:not(.is-active)` reaches the segments those
     density rules reach, and only them: the chosen segment is already 600 from
     `.manager-segment.is-active`. */
  .manager-segmented.is-pill .manager-segment:not(.is-active) {
    font-weight: 600;
  }

  /* ACCENT TONE (issue 1371): colour only. It states the chosen segment's fill and ink and the
     idle segment's ink, and nothing about size — see the `tone` note. Written after the
     `is-compact` block it composes with, so the fill wins over that block's active paint at
     equal specificity, and after nothing else, because nothing else declares these two. */
  .manager-segmented.is-accent .manager-segment.is-active {
    border-color: var(--fab-accent);
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .manager-segmented.is-accent .manager-segment:not(.is-active) {
    border-color: transparent;
    background: none;
    color: var(--fab-text-muted);
  }

  /* The numeral rides the segment's own ink in both states, so the chosen segment's count is
     legible on the accent fill rather than staying in the muted grey the base rule gives it.
     BOTH selectors carry `.is-active` / `:not(.is-active)` to reach (0,4,0): the shipped
     `.manager-segment.is-active .manager-segment-count` below is (0,3,0) and is written LATER
     in this block, so a (0,3,0) rule here would lose the chosen segment's numeral to it. */
  .manager-segmented.is-accent .manager-segment.is-active .manager-segment-count {
    color: inherit;
  }

  .manager-segmented.is-accent .manager-segment:not(.is-active) .manager-segment-count {
    color: inherit;
  }

  /* SOFT ACCENT TONE (issue 1371): the filter's paint, where BOTH states have a face. Colour
     only — see the `tone` note — so it states no size and composes with `density="compact"` and
     `shape="pill"`. `proto:5457` verbatim, and every value is the token that already holds it:
     `--fab-accent-soft` is `rgb(232 198 167 / 16%)` against the reference's `rgba(232,198,167,.16)`,
     `--fab-accent-border` is its `.48`, and `--fab-accent` is `#E8C6A7` — the same three bytes.

     `--fab-bg-1` for the idle fill is the ONE licensed departure, and it is this epic's standing
     one: the reference draws `#111A23` and the shipped ramp is a step brighter throughout, so the
     token that HOLDS this role here is `--fab-bg-1` and reaching for `--fab-bg-0` to match a
     literal would put this control on a different ramp from the card it sits in.

     Written after the `is-compact` and `is-field` blocks it composes with, so its fills win over
     their active paint at equal specificity, and after `is-accent` so the two accent controls read
     in the order they were built. */
  .manager-segmented.is-accent-soft .manager-segment.is-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .manager-segmented.is-accent-soft .manager-segment:not(.is-active) {
    border-color: var(--fab-border);
    background: var(--fab-bg-1);
    color: var(--fab-text-muted);
  }

  /* THE CHOSEN SEGMENT'S TALLY, and ONLY the chosen one's. `proto:5457` inks the numeral
     `var(--accent)` when its segment is chosen and `var(--subtle)` when it is not, so the chosen
     one has to leave the shipped `.manager-segment.is-active .manager-segment-count`'s
     `--fab-text-secondary` — grey on an accent face — and follow the segment instead.

     THE IDLE ONE IS DELIBERATELY NOT RESTATED, which is a measurement rather than an omission.
     `.manager-segment-count.is-badge` already declares `--fab-text-subtle`, which IS the
     reference's `var(--subtle)`, and a `:not(.is-active)` rule here would out-specify it and pull
     the idle numeral up to the segment's `--fab-text-muted` — a step brighter than the reference
     draws it. A plain `count` consumer's idle numeral is `--fab-text-muted` from the base rule
     either way, so the rule would be a no-op there and a regression on the slot the reference
     actually uses. */
  .manager-segmented.is-accent-soft .manager-segment.is-active .manager-segment-count {
    color: inherit;
  }

  .manager-segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    padding: var(--fab-space-chip) var(--fab-space-3);
    /* A transparent border so the active tile's border adds no width jump. */
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--fab-text-muted);
    font-weight: 500;
    font-size: 0.72rem;
    white-space: nowrap;
    cursor: pointer;
  }

  /* The optional trailing tally. Quieter than the label it follows — it qualifies the
     segment rather than competing with it — and `tabular-nums` so the track's width does
     not jitter as the counts change under a search. */
  .manager-segment-count {
    color: var(--fab-text-muted);
    font-weight: 600;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
  }

  /* The MONO presentation. Weight 500 is the ceiling the mono face ships
     (`design-system/spec.md:230-231`), so the reference's 700 lands here. */
  .manager-segment-count.is-badge {
    font-family: var(--fab-font-mono);
    font-weight: 500;
    font-size: 0.6rem;
    color: var(--fab-text-subtle);
  }

  .manager-segment-input:checked ~ .manager-segment-count.is-badge {
    color: inherit;
  }

  .manager-segment.is-active .manager-segment-count {
    color: var(--fab-text-secondary);
  }

  /* Active option is a raised dark tile (issue 643 §G3), not a solid peach accent
     fill — the accent fill out-shouted the green Save button on the editor rail. */
  .manager-segment.is-active {
    border: 1px solid var(--fab-border-strong);
    background: var(--fab-surface-active);
    color: var(--fab-text);
    font-weight: 600;
  }

  /* Optional per-option tints for the ACTIVE segment (issue 975). `neutral` is the
     plain active tile above and deliberately declares nothing — it exists so a
     three-way good/neutral/bad control can name every segment rather than leaving
     the middle one's intent implicit.

     All four coloured cells are the SAME formula — the family's `-border`, `-soft` and
     `-text` — because a tint that reached for a different vehicle per family would be four
     treatments rather than one ramp at four hues. */
  .manager-segment.is-active.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  /* INFO and WARNING (issue 1286) complete the ramp. Without them a severity control could
     paint `severe` and nothing else, and the two unpainted segments would read as the
     unchosen ones even while selected. */
  .manager-segment.is-active.is-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
    color: var(--fab-info-text);
  }

  .manager-segment.is-active.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  .manager-segment.is-active.is-danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }

  /* `:not(.is-disabled)` is load-bearing: without it a disabled segment still
     recolours under the pointer and reads as choosable. */
  .manager-segment:hover:not(.is-active):not(.is-disabled) {
    color: var(--fab-text-secondary);
  }

  /* The radio itself carries `disabled`, so this is only the visual half. */
  .manager-segment.is-disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Visually hidden but focusable: the label segment is the visible control, the
     radio stays in the a11y/keyboard tree. */
  .manager-segment-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  /* `:has(:focus-visible)` (not `:focus-within`) so a MOUSE click on a segment doesn't
     leave a persistent ring — the visually-hidden radio keeps focus after click. */
  .manager-segment:has(:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
