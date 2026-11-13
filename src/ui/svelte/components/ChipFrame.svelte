<!--
  `Chip`'s root element and every rule that paints it: the base geometry, each density's rung and
  its icon-only square, the tones and the emphases. Split out of `Chip` so that component stays
  under the file-size limit (issue 2317); it is internal, and `Chip` is the only importer.

  One component holds all of them because a rule on the root from two scoped blocks would tie on
  specificity and be settled by stylesheet order. `Chip` keeps what paints its own children,
  through `:global()` on the root.

  Props: `tag`, `class`, `style`, `disabled`, `element` (bindable) and `children`, all on the root;
  `ariaRole` is its `role` and `chipTint` its `data-chip-tint`; `ariaLabel` is the name of a named
  chip, drawn as its `aria-label` unless `spoken`, and as its `data-tooltip-text` when `waived`.
  The rest spread lands last, so a caller's own value wins.
-->
<script>
  let {
    tag = 'span',
    class: classes = '',
    style = undefined,
    chipTint = undefined,
    ariaRole = undefined,
    ariaLabel = '',
    spoken = false,
    waived = false,
    disabled = undefined,
    element = $bindable(null),
    children,
    ...rest
  } = $props();

  // An empty object when unnamed, so every other chip's attributes keep their order.
  const naming = $derived(
    ariaLabel
      ? {
          'aria-label': spoken ? undefined : ariaLabel,
          'data-tooltip-text': waived ? ariaLabel : undefined,
        }
      : {}
  );
</script>

<svelte:element
  this={tag}
  bind:this={element}
  class={classes}
  {style}
  data-chip-tint={chipTint}
  role={ariaRole}
  {...naming}
  {disabled}
  {...rest}>{@render children?.()}</svelte:element
>

<style>
  .manager-chip {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    width: fit-content;
    max-width: 100%;
    min-height: 20px;
    padding: var(--fab-space-1) var(--fab-space-chip);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    color: var(--fab-text);
    background: var(--fab-overlay-light-06);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1;
  }

  .manager-chip.is-truncated {
    flex-wrap: nowrap;
    white-space: nowrap;
    overflow: hidden;
    border-radius: 999px;
  }

  button.manager-chip {
    appearance: none;
    height: auto;
    font-family: inherit;
    cursor: pointer;
  }

  button.manager-chip:hover:not(:disabled) {
    border-color: var(--fab-accent);
    color: var(--fab-text);
  }

  button.manager-chip:disabled {
    cursor: default;
    opacity: 0.6;
  }

  li.manager-chip {
    list-style: none;
  }

  /* The row density's ground and ink sit above the tones, so a tone composes with it. */
  .manager-chip.is-row {
    color: var(--fab-text-secondary);
    background: var(--fab-bg-2);
  }

  .manager-chip.is-active,
  .manager-chip.is-positive {
    border-color: var(--fab-success-border);
    color: var(--fab-success-text);
    background: var(--fab-success-soft);
  }

  .manager-chip.is-disabled,
  .manager-chip.is-warning {
    border-color: var(--fab-warning-border);
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
  }

  .manager-chip.is-info {
    border-color: var(--fab-info-border);
    color: var(--fab-info-text);
    background: var(--fab-info-soft);
  }

  .manager-chip.is-danger,
  .manager-chip.is-negative {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
  }

  .manager-chip.is-neutral {
    border-color: var(--fab-border);
    color: var(--fab-text-muted);
  }

  .manager-chip.is-secondary {
    border-color: var(--fab-border);
    color: var(--fab-text-secondary);
    background: var(--fab-surface-soft);
  }

  .manager-chip.is-subtle {
    border-color: transparent;
    color: var(--fab-text-subtle);
    background: var(--fab-surface-raised);
  }

  .manager-chip.is-accent {
    border-color: var(--fab-accent-border);
    color: var(--fab-accent-text);
    background: var(--fab-accent-soft);
  }

  .manager-chip.is-muted {
    border-color: var(--fab-border);
    color: var(--fab-text-disabled);
    background: none;
  }

  .manager-chip.is-struck {
    border-style: dashed;
    background: var(--fab-surface-soft);
    text-decoration: line-through;
  }

  .manager-chip.is-row {
    min-height: 22px;
    padding: 0 var(--fab-space-2);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .manager-chip.is-list {
    min-height: 0;
    padding: 1px var(--fab-space-2);
    border-radius: 999px;
    font-size: 9px;
    font-weight: 600;
    /* The library's explicit 1.6, on one line; how much room the row gives the chip is the caller's. */
    line-height: 1.6;
    white-space: nowrap;
  }

  /* Opt-in WorldClockChip geometry, centring its one baseline-aligned line of icon, label and value. */
  .manager-chip.is-clock {
    height: 28px;
    min-height: 28px;
    padding: 0 var(--fab-space-2);
    border-radius: 7px;
    gap: var(--fab-space-2);
    white-space: nowrap;
  }

  /* The button's geometry restated in full; `manager-header-geometry.test.js` gates the pair. */
  .manager-chip.is-action,
  .manager-chip.is-header {
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    border-radius: 9px;
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .manager-chip.is-header {
    min-height: 38px;
  }

  .manager-chip.is-tag-run {
    padding: var(--fab-space-chip) var(--fab-space-3);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }

  .manager-chip.is-inspector {
    padding: var(--fab-space-1) var(--fab-space-2);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
  }

  .manager-chip.is-mono {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  .manager-chip.is-icon-only {
    width: 20px;
    height: 20px;
    min-height: 20px;
    padding: 0;
  }

  .manager-chip.is-icon-only.is-row {
    width: 22px;
    height: 22px;
    min-height: 22px;
  }

  .manager-chip.is-icon-only.is-list {
    width: 15px;
    height: 15px;
    min-height: 15px;
  }

  .manager-chip.is-icon-only.is-action {
    width: 34px;
    height: 34px;
    min-height: 34px;
  }

  .manager-chip.is-icon-only.is-header {
    width: 38px;
    height: 38px;
    min-height: 38px;
  }

  .manager-chip.is-icon-only.is-tag-run {
    width: 25px;
    height: 25px;
    min-height: 25px;
  }

  .manager-chip.is-icon-only.is-inspector {
    width: 20px;
    height: 20px;
    min-height: 20px;
  }

  .manager-chip.is-removable {
    padding-right: var(--fab-space-2xs);
  }

  .manager-chip.is-tag {
    --fab-chip-color: var(--fab-purple);

    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
    color: var(--fab-text);
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-bg-3));
  }

  .manager-chip.has-tint {
    border-color: var(--fab-border);
    color: var(--fab-chip-color);
    background: var(--fab-surface-soft);
  }

  .manager-chip.is-outlined {
    background: var(--fab-bg-1);
  }

  .manager-chip.is-tag.is-lit,
  .manager-chip.has-swatch.is-lit,
  .manager-chip.has-tint.is-lit {
    color: var(--fab-chip-color);
    background: color-mix(in srgb, var(--fab-chip-color) 16%, transparent);
  }

  .manager-chip.is-tag.is-lit:not(.has-tint) {
    color: var(--fab-purple-text);
  }

  /* The mid-tone tags sit under AA on a selected row, so their ink is pulled halfway to the text ink. Keep this
     after the lit rule above: it wins that tie by order. */
  .manager-chip.has-tint:is([data-chip-tint='verdant'], [data-chip-tint='azure']) {
    color: color-mix(in srgb, var(--fab-chip-color) 50%, var(--fab-text));
  }

  .manager-chip.is-bare {
    border: 0;
  }

  .manager-chip.is-dashed {
    border-style: dashed;
  }

  /* Every solid ground is an opaque token, written after each tone so its paint wins the tie. */
  .manager-chip.is-solid {
    color: var(--fab-text);
    background: var(--fab-bg-3);
  }

  .manager-chip.is-solid:is(.is-active, .is-positive) {
    color: var(--fab-on-success);
    background: var(--fab-success);
  }

  .manager-chip.is-solid:is(.is-disabled, .is-warning) {
    color: var(--fab-bg-0);
    background: var(--fab-warning);
  }

  .manager-chip.is-solid.is-info {
    color: var(--fab-on-info);
    background: var(--fab-info);
  }

  .manager-chip.is-solid:is(.is-danger, .is-negative) {
    color: var(--fab-on-danger);
    background: var(--fab-danger);
  }

  .manager-chip.is-solid.is-accent {
    color: var(--fab-on-accent);
    background: var(--fab-accent);
  }
</style>
