<!--
  Binary / tertiary mode switch drawn as a segmented track (design-system §7.4), rendering REAL
  radios behind `<label>` segments that carry the styling. Presentational and prop-driven.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `options` | `[{ value, labelKey, fallback, icon?, variant?, disabled?, count?, badge? }]` | `[]` | the segments, in order. `variant` tints the ACTIVE segment only; `disabled` is carried onto the radio ITSELF, because `select()` only guards `next !== value` and a dimmed-but-live segment would still fire `onChange`; and a caller passes `count` or `badge`, never both. |
  | `value` / `groupName` / `ariaLabel` | strings | | the selection, the shared radio `name` (unique per rendered control) and the radiogroup's accessible name |
  | `dataAttr` / `optionDataAttr` / `fill` / `iconOnly` | | `''` / `false` | the two data-* hook names, whether segments share the track `flex: 1 1 0`, and whether each renders its `icon` alone with the label CLIPPED |
  | `shape` \| `density` \| `tone` | `'pill'` \| `'compact'`/`'field'` \| `'tag'`/`'accent'`/`'accent-soft'` | `''`/`'default'`/`''` | the CONSTRUCTION, the SCALE and the PAINT, as variants ON the primitive: the design system forbids a layout-context rule restyling a primitive's `font-*`, `border`, `border-radius` and `background`. `is-accent` is a PREFIX of `is-accent-soft`, so only a whole-token match tells the two apart. |

  Callbacks:
  - `onChange(value)` — the chosen option's `value`.
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
    density = 'default',
    // `variant` says what choosing a segment MEANS, `tone` what the track is ABOUT. 'tag' carries
    // the track's SCALE too, so a `tone="tag"` consumer passes no `density`.
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
    <!-- `title` ONLY in the icon-only variant, the pointer half of what the clipped label already
         gives the a11y tree; `undefined` omits it, so a labelled consumer's markup is untouched. -->
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
      <!-- `badge` is `count`'s MONO presentation, not a second tally: it reuses the slot and
        changes only the face, and passing both renders two numerals. -->
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

  /* Full-width variant (issue 643): the segments share the track equally. */
  .manager-segmented.is-fill {
    display: flex;
    width: 100%;
  }

  .manager-segmented.is-fill .manager-segment {
    flex: 1 1 0;
  }

  /* COMPACT density, in px because the parity fixture asserts the value, and declared BEFORE
     `.is-active` so the active tile's weight still wins at equal specificity. */
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

  /* `:not(.is-active)` is load-bearing: (0,3,0) against `.is-active`'s (0,2,0). */
  .manager-segmented.is-compact .manager-segment:not(.is-active) {
    color: var(--fab-text-subtle);
    font-weight: 500;
  }

  /* FIELD density: a third density rather than a rule written from the Difficulty card, because
     those four properties are the primitive's to state. */
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

  /* TAG tone. `overflow: hidden` is why no segment restates a corner radius and why the track
     carries no padding or gap. THE TRACK IS SHORTER than the other rungs and that is load-bearing:
     a taller one makes an EMPTY tag row stand above every sibling, guarded by `the tag requirement
     row keeps its arm whole, and an EMPTY one is a row like any other`. */
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

  /* `:not(.is-active)` again: at (0,4,0) this would otherwise out-specify `.is-active`'s ink. */
  .manager-segmented.is-tag .manager-segment:not(.is-active) {
    color: var(--fab-text-subtle);
  }

  .manager-segmented.is-tag .manager-segment.is-active {
    border-color: transparent;
    background: color-mix(in srgb, var(--fab-purple) 22%, transparent);
    color: var(--fab-text);
  }

  /* THE FOCUS RING TURNS INWARD: `overflow: hidden` would clip an outline painted outside. */
  .manager-segmented.is-tag .manager-segment:has(:focus-visible) {
    outline-offset: -2px;
  }

  /* ICON-ONLY (issue 1036). `min-width: 32px` is the TARGET, one step inside the 34px icon button
     because the track adds its own padding and border around the pair. */
  .manager-segmented.is-icon-only .manager-segment {
    /* A local containing block for the two clipped 1px children. */
    position: relative;
    gap: 0;
    min-width: 32px;
    padding: var(--fab-space-chip) var(--fab-space-2);
  }

  /* The label is CLIPPED, never removed: the `<label>` IS the radio's accessible name. It restates
     `.visually-hidden` because a scoped block cannot see a global class, and stamping that class
     into the markup would fire it for labelled consumers too. */
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

  /* PILL shape: the track gives up its fill, edge and padding. WRITTEN AFTER `is-compact` AND
     `is-field`, because it ties them on specificity and ORDER decides the corner; and
     `border-color: transparent` rather than `border: 0` keeps the 1px it contributes. */
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

  /* Every segment at 600: a pill run says which is chosen with the pill's own face, not weight. */
  .manager-segmented.is-pill .manager-segment:not(.is-active) {
    font-weight: 600;
  }

  /* ACCENT tone: colour only, written after the `is-compact` block it composes with. */
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

  /* Both selectors reach (0,4,0), because the shipped `.is-active .manager-segment-count` below is
     (0,3,0) and is written LATER. */
  .manager-segmented.is-accent .manager-segment.is-active .manager-segment-count {
    color: inherit;
  }

  .manager-segmented.is-accent .manager-segment:not(.is-active) .manager-segment-count {
    color: inherit;
  }

  /* SOFT ACCENT tone: colour only, pinned by `segmented-control-mounted.test.js`; the measurement
     is in the issue, because `theme-colour-contract.test.js` scans prose too. `--fab-bg-1` for the
     idle fill is this epic's standing licensed departure (issue 676). */
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

  /* THE CHOSEN SEGMENT'S TALLY, and only the chosen one's. THE IDLE ONE IS DELIBERATELY NOT
     RESTATED: `.manager-segment-count.is-badge` already declares `--fab-text-subtle`, and a
     `:not(.is-active)` rule here would out-specify it and pull the idle numeral brighter. */
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

  /* The trailing tally: quieter than its label, and `tabular-nums` so the width does not jitter. */
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

  /* Optional per-option tints for the ACTIVE segment (issue 975). `neutral` declares nothing and
     exists so a three-way control can name every segment; the coloured cells share one formula —
     the family's `-border`, `-soft` and `-text` — so this is one ramp at four hues. */
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
