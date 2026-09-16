<!-- Svelte 5 runes mode -->
<!--
  Binary / tertiary mode switch drawn as a segmented track (design-system §7.4). It renders REAL
  radios, one per option, visually hidden behind `<label>` segments that carry the styling, so
  the control is keyboard- and screen-reader accessible. Purely presentational and prop-driven.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `options` | `[{ value, labelKey, fallback, icon?, variant?, disabled?, count?, badge? }]` | `[]` | the segments, in order |
  | `value` | the selected option's `value` | `''` | |
  | `groupName` | string | | the shared radio `name`; must be unique per rendered control |
  | `ariaLabel` | string | | the radiogroup's accessible name |
  | `dataAttr` / `optionDataAttr` | string | `''` | data-* hook names on the track and on each segment |
  | `fill` | boolean | `false` | the track spans its container and segments share it `flex: 1 1 0` |
  | `shape` | `'' \| 'pill'` | `''` | the CONSTRUCTION, orthogonal to `density` and `tone` |
  | `density` | `'default' \| 'compact' \| 'field'` | `'default'` | the SCALE |
  | `tone` | `'' \| 'tag' \| 'accent' \| 'accent-soft'` | `''` | the PAINT |
  | `iconOnly` | boolean | `false` | each segment renders its `icon` alone and the label is CLIPPED |

  Callbacks:
  - `onChange(value)` — the chosen option's `value`.

  Invariants:
  - An option's `variant` tints the ACTIVE segment only, so an inactive segment stays the muted
    track colour whatever it would become when chosen.
  - `disabled` is carried onto the segment's radio ITSELF, not merely onto a class: `select()`
    only guards `next !== value`, so a dimmed-but-live segment would still fire `onChange`.
  - A caller passes `count` or `badge`, never both; a non-finite value renders nothing.
  - `density`, `shape` and `tone` are variants ON the primitive, because the design system
    forbids a layout-context rule restyling a primitive's `font-*`, `border`, `border-radius`
    and `background`. A SIZE taken from the layout context is still permitted.
  - `is-accent` is a PREFIX of `is-accent-soft`; only a whole-token match tells the two apart.
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
    // The track's SCALE. 'compact' is the Checks Studio's per-row rung, pinned by that studio's
    // parity fixture's `segmented-toggle` / `segmented-option-*` regions; 'field' is the same
    // studio's Difficulty card rung, two pixels roomier with an accent-edged active tile.
    density = 'default',
    // The FAMILY the whole track is painted in, orthogonal to `density` and to the per-option
    // `variant`: `variant` tints one active segment to say what choosing it MEANS, `tone` says
    // what the track is ABOUT and repaints its edge and both segments together.
    //
    // 'tag' names an entity family, so it cannot be spelled as a per-option `variant` without
    // claiming that choosing it means something. It carries the track's own SCALE as well as its
    // colour, so a `tone="tag"` consumer passes no `density` — the two would otherwise choose
    // between two sets of the same four properties at equal specificity, decided by source order.
    // 'accent' (the cohort switch) and 'accent-soft' (the filter, where both states have a face)
    // carry no scale, so they compose with `density="compact"` and `shape="pill"`.
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

  // Class list for one segment; the variant tint applies to the ACTIVE segment only.
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
    <!-- `title` ONLY in the icon-only variant: it is the pointer half of the affordance the
         clipped label already gives the a11y tree. `undefined` omits the attribute outright, so a
         labelled consumer's markup is untouched. -->
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
        `badge` is `count`'s MONO presentation, not a second tally: it reuses the slot and changes
        only the face. Passing both is a caller error and renders two numerals. The mono face
        ships 400 and 500 only (`design-system/spec.md`), so a 700 numeral lands on 500.
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

  /* Full-width variant (issue 643): the track fills its container and the segments share it
     equally, so a two-option control reads as one balanced bar. */
  .manager-segmented.is-fill {
    display: flex;
    width: 100%;
  }

  .manager-segmented.is-fill .manager-segment {
    flex: 1 1 0;
  }

  /* COMPACT density: the Checks Studio's in-row rung. Authored in px because the exact value is
     what the parity fixture's `segmented-option-selected.fontSize` asserts, and declared BEFORE
     `.is-active` below so the active tile's own weight still wins at equal specificity. */
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

  /* `:not(.is-active)` is load-bearing: this rule is (0,3,0) and `.manager-segment.is-active` is
     (0,2,0), so an unqualified `color` / `font-weight` here would paint the lit segment as the
     resting one. */
  .manager-segmented.is-compact .manager-segment:not(.is-active) {
    color: var(--fab-text-subtle);
    font-weight: 500;
  }

  /* FIELD density: the Difficulty card's labelled-field rung — a roomier track and an
     accent-edged active tile over the raised surface. A third density rather than a rule written
     from that card, because padding, radius, background and the active tile's edge are the
     primitive's to state. Authored in px, as the prototype authors it. */
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

  /* `:not(.is-active)` is load-bearing here for the same specificity reason as on `.is-compact`. */
  .manager-segmented.is-field .manager-segment:not(.is-active) {
    color: var(--fab-text-subtle);
    font-weight: 500;
  }

  .manager-segmented.is-field .manager-segment.is-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-raised);
  }

  /* TAG tone: an edged track in the tag family, the chosen segment lit in the same hue and the
     unchosen one painting nothing.

     `overflow: hidden` is why no segment restates a corner radius — the track clips them to its
     own ends — and why the track carries no padding and no gap: the segments MEET.

     THE TRACK IS SHORTER than the default and compact rungs, and that is load-bearing. This
     control is the only thing a tag requirement row carries that the other three kinds do not,
     so a taller one makes an EMPTY tag row stand above every sibling row — guarded by `the tag
     requirement row keeps its arm whole, and an EMPTY one is a row like any other`.

     The segment padding is TOKENS, not the design's own px: the two densities above are carried
     in the spacing ratchet's baseline as debt and a third would add to it. The hue is a ratio
     against `--fab-purple`, as the requirement row's edge and the `+ Tag` pill already mix it;
     a literal would fail the colour contract. */
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

  /* `:not(.is-active)` is load-bearing here: this rule is (0,4,0) and would otherwise out-specify
     `.manager-segment.is-active`'s own ink. */
  .manager-segmented.is-tag .manager-segment:not(.is-active) {
    color: var(--fab-text-subtle);
  }

  .manager-segmented.is-tag .manager-segment.is-active {
    border-color: transparent;
    background: color-mix(in srgb, var(--fab-purple) 22%, transparent);
    color: var(--fab-text);
  }

  /* THE FOCUS RING TURNS INWARD, and the `overflow: hidden` above is what makes it have to: an
     outline is painted outside the border box, so the clip would take the shared
     `outline-offset: 2px` ring with it and leave a keyboard user with no visible focus. This is
     the only density that clips, so the override is scoped to the tone. */
  .manager-segmented.is-tag .manager-segment:has(:focus-visible) {
    outline-offset: -2px;
  }

  /* ICON-ONLY variant (issue 1036): a square glyph tile per segment. `min-width: 32px` is the
     TARGET, not the glyph, and it sits one step inside the 34px `.manager-icon-button` because
     the track adds its own padding and border around the pair — so the two controls end up the
     same height in a toolbar row. */
  .manager-segmented.is-icon-only .manager-segment {
    /* A local containing block for the two clipped 1px children, so the first offset either ever
       grows is not resolved against a distant positioned ancestor. */
    position: relative;
    gap: 0;
    min-width: 32px;
    padding: var(--fab-space-chip) var(--fab-space-2);
  }

  /* The label is CLIPPED, never removed and never `display: none`. The segment's `<label>` IS
     the radio's accessible name — the whole reason this control renders real radios — so either
     would leave every segment anonymous to a screen reader. Clipping keeps the name and the
     keyboard behaviour, and keeps `[data-…-option="…"]` resolving to a real clickable target.

     It restates the `.visually-hidden` utility rather than reaching for it: a scoped block cannot
     see a global class, and stamping it into the markup would fire it for labelled consumers. */
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

  /* PILL shape: a run of SEPARATE pills, not tiles in a frame, so the track gives up its fill,
     its edge and its padding and what is left is the flex row and the gap.

     The gap is `--fab-space-2`, the nearest step on the published 4px scale that
     `tests/components/spacing-scale-ratchet.test.js` ratchets.

     WRITTEN AFTER `is-compact` AND `is-field` ON PURPOSE: `.manager-segmented.is-pill
     .manager-segment` ties those on specificity, so ORDER decides the corner and a pill run
     written above them would silently keep the density's radius. The same holds for the weight
     rule below.

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

  /* Every segment at 600: a framed track says which segment is chosen partly by WEIGHT, but a
     pill run says it with the pill's own face. `:not(.is-active)` reaches the segments the
     density rules reach and only them. */
  .manager-segmented.is-pill .manager-segment:not(.is-active) {
    font-weight: 600;
  }

  /* ACCENT tone: colour only, stating nothing about size. Written after the `is-compact` block
     it composes with, so the fill wins over that block's active paint at equal specificity. */
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

  /* The numeral rides the segment's own ink in both states. BOTH selectors carry `.is-active` /
     `:not(.is-active)` to reach (0,4,0): the shipped `.manager-segment.is-active
     .manager-segment-count` below is (0,3,0) and is written LATER in this block. */
  .manager-segmented.is-accent .manager-segment.is-active .manager-segment-count {
    color: inherit;
  }

  .manager-segmented.is-accent .manager-segment:not(.is-active) .manager-segment-count {
    color: inherit;
  }

  /* SOFT ACCENT tone: the filter's paint, where both states have a face. Colour only, so it
     composes with `density="compact"` and `shape="pill"`. Which three tokens this tone states is
     pinned by `segmented-control-mounted.test.js`; that each equals the reference was measured
     once and recorded in the issue rather than re-derived here, because
     `theme-colour-contract.test.js` scans prose under `src/ui/**` as well as declarations.

     `--fab-bg-1` for the idle fill is this epic's standing licensed departure (the issue-676
     ruling): the shipped ramp is a step brighter throughout, so reaching down to `--fab-bg-0`
     would put this control on a different ramp from the card it sits in.

     Written after the `is-compact` and `is-field` blocks it composes with, so its fills win at
     equal specificity, and after `is-accent`. */
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

  /* THE CHOSEN SEGMENT'S TALLY, and only the chosen one's: it has to leave the shipped
     `.manager-segment.is-active .manager-segment-count`'s grey-on-accent ink and follow the
     segment instead.

     THE IDLE ONE IS DELIBERATELY NOT RESTATED. `.manager-segment-count.is-badge` already
     declares `--fab-text-subtle`, and a `:not(.is-active)` rule here would out-specify it and
     pull the idle numeral a step brighter. */
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

  /* The optional trailing tally: quieter than the label it qualifies, and `tabular-nums` so the
     track's width does not jitter as counts change under a search. */
  .manager-segment-count {
    color: var(--fab-text-muted);
    font-weight: 600;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
  }

  /* The MONO presentation; 500 is the ceiling the mono face ships (`design-system/spec.md`). */
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

  /* Active option is a raised dark tile (issue 643 §G3), not a solid accent fill — the accent
     fill out-shouted the Save button on the editor rail. */
  .manager-segment.is-active {
    border: 1px solid var(--fab-border-strong);
    background: var(--fab-surface-active);
    color: var(--fab-text);
    font-weight: 600;
  }

  /* Optional per-option tints for the ACTIVE segment (issue 975). `neutral` is the plain active
     tile and declares nothing — it exists so a three-way good/neutral/bad control can name every
     segment. All coloured cells share one formula — the family's `-border`, `-soft` and `-text` —
     so this is one ramp at four hues rather than four treatments. */
  .manager-segment.is-active.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  /* INFO and WARNING (issue 1286) complete the ramp: without them a severity control's two
     unpainted segments would read as the unchosen ones even while selected. */
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

  /* `:not(.is-disabled)` is load-bearing: without it a disabled segment still recolours under the
     pointer and reads as choosable. */
  .manager-segment:hover:not(.is-active):not(.is-disabled) {
    color: var(--fab-text-secondary);
  }

  /* The radio itself carries `disabled`, so this is only the visual half. */
  .manager-segment.is-disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Visually hidden but focusable: the label segment is the visible control, the radio stays in
     the a11y and keyboard tree. */
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

  /* `:has(:focus-visible)`, not `:focus-within`, so a mouse click does not leave a persistent
     ring — the visually-hidden radio keeps focus after click. */
  .manager-segment:has(:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
