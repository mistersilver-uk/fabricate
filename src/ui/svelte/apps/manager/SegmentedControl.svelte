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
     segments, in order. `variant` ('' | 'success' | 'danger' | 'neutral') tints the
     ACTIVE segment only and defaults to the plain active tile, so a consumer that
     sets none renders exactly as before. `disabled` is carried onto the segment's
     radio ITSELF, not merely onto a class: `select()` only guards `next !== value`,
     so a dimmed-but-live segment would still fire onChange. `count` renders a trailing
     tally so a segment can say how many rows choosing it would show — omitted by every
     existing consumer, and a non-finite value renders nothing rather than `NaN`.
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
  class={`manager-segmented${fill ? ' is-fill' : ''}${iconOnly ? ' is-icon-only' : ''}`}
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
     the middle one's intent implicit. */
  .manager-segment.is-active.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
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
