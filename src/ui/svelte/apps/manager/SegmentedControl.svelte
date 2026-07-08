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
   - options: [{ value, labelKey, fallback, icon? }] — the segments, in order.
   - value: the currently selected option `value`.
   - onChange(value): called with the chosen option's `value` on selection.
   - groupName: the shared radio `name` (must be unique per rendered control).
   - ariaLabel: accessible name for the radiogroup.
   - dataAttr?: optional data-* attribute name stamped `true` on the track (for
     test/host hooks, e.g. 'data-when-spent-control').
   - optionDataAttr?: optional data-* attribute name stamped with each option's
     `value` on its segment (e.g. 'data-when-spent-option').
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
    optionDataAttr = ''
  } = $props();

  function text(key, fallback) {
    if (!key) return fallback ?? '';
    const translated = localize(key);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  function select(next) {
    if (next !== value) onChange(next);
  }
</script>

<div
  class="manager-segmented"
  role="radiogroup"
  aria-label={ariaLabel || undefined}
  {...dataAttr ? { [dataAttr]: true } : {}}
>
  {#each options as option (option.value)}
    <label
      class={`manager-segment ${option.value === value ? 'is-active' : ''}`}
      {...optionDataAttr ? { [optionDataAttr]: option.value } : {}}
    >
      <input
        type="radio"
        class="manager-segment-input"
        name={groupName}
        value={option.value}
        checked={option.value === value}
        onchange={() => select(option.value)}
      />
      {#if option.icon}<i class={option.icon} aria-hidden="true"></i>{/if}
      <span class="manager-segment-label">{text(option.labelKey, option.fallback)}</span>
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

  .manager-segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    padding: var(--fab-space-chip) var(--fab-space-3);
    border-radius: 7px;
    color: var(--fab-text-muted);
    font-weight: 500;
    font-size: 0.72rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .manager-segment.is-active {
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-weight: 600;
  }

  .manager-segment:hover:not(.is-active) {
    color: var(--fab-text-secondary);
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
