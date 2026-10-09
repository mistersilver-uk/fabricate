<!-- ratchet-exempt(file-size): a density's geometry must live in this scoped block, and D10 added the header rung; extraction is issue 2317 -->
<!--
  The app's one chip: a short, fully-rounded badge carrying a count, a state, a category or a tag. `SearchablePopover` and `Select` render it too, so it ships under `components/`, and its CSS lives in this scoped `<style>` so `VIEW_RECIPES` maps a change here to the views that render it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tag` | `'span'` \| `'li'` \| `'button'` \| `'div'` | `'span'` | The rendered element. A chip inside a `role="list"` must be an `li`; a clickable chip must be a real `button`. |
  | `tone` | `active`, `positive`, `disabled`, `warning`, `info`, `danger`, `neutral`, `negative`, `accent`, `muted`, `secondary`, `subtle`, `tag` | `''` | Colour ONLY, never size. A CLOSED set: an unrecognised value is DROPPED rather than emitted as an unstyled `is-*`, so a typo shows as the default chip. See the invariants for how a caller picks one. |
  | `emphasis` | `'outlined'` \| `'lit'` \| `'bare'` \| `'solid'` | `''` | A second axis: `tone` says which family the chip belongs to, `emphasis` how that family arrives. The four are alternatives, not a composition, and the set is closed the same way. `solid` is the opaque ground for a chip read over artwork. |
  | `density` | `'default'` \| `'row'` \| `'list'` \| `'action'` \| `'tag-run'` \| `'inspector'` \| `'header'` | `'default'` | The scale, closed. It is THE variant-on-the-primitive escape hatch and the only one: a layout context may size a chip's POSITION from outside, never its own geometry, and a value within a pixel of a shipped one is that same drift. `manager-layout.test.js`'s hand-rolled-chip ratchet catches the alternative. `presentation="clock"` is `WorldClockChip`'s own opt-in geometry and no density. |
  | `mono` / `struck` / `icon` | booleans / Font Awesome classes | `false` / `false` / `''` | Numerals in the mono face with `tabular-nums`, so columns of counts, DCs and quantities line up; the MUTED VARIANT, a value switched off in the scope being read, composing with every tone, which owns the ink; and a leading glyph. |
  | `swatch` / `tint` | bare `--fab-tag-*` keys | `''` | A leading colour DOT (the chip is ABOUT a colour) and an ink for the WHOLE chip (the chip IS that colour). Both are validated to a bare key before interpolation into a `style` attribute, both ride `--fab-chip-color`, and the tint wins when both are set. |
  | `truncate` / `iconOnly` | booleans | `false` | `truncate` is single-line and clipped; wrapping is the DEFAULT because the label arrives as a snippet and no `title` can be derived from one, so a caller that truncates should pass one. `iconOnly` makes the chip its glyph — a square with equal insets and no label — and REQUIRES AN ACCESSIBLE NAME, which a source contract holds because a primitive cannot make a caller pass one. |
  | `removable` / `removeLabel` / `onRemove` | boolean / string / function | `false` / `undefined` / `null` | The chip is a MEMBERSHIP TOKEN in an editable set rather than a state the GM can only read; see the invariants for the three shapes `removable` refuses. |
  | `disabled` / `class` | boolean / class string | `false` / `''` | The chip and its remove control go inert together, written before the rest spread so a call site that passed it through the spread is unaffected; and an EXTRA class, for a caller that also needs layout context from the global sheet. |
  | `element` | bindable | `null` | The rendered DOM node. `bind:this` on a component yields the INSTANCE, so a caller that must measure or focus the chip has no other way to reach it. |

  Rest spread:
  - `{...rest}` lands on the rendered element after `role` and `disabled`, so a caller's own value wins; `title`, `aria-label`, `data-*` hooks, `onclick` and `type` all forward.

  Invariants:
  - The root keeps the literal `manager-chip` class — pinned by `manager-layout.test.js`, the mounted suites and `scripts/foundry-test-run.mjs`.
  - Four of the thirteen tones are one recessive ladder a caller routes by meaning, per "Every interactive primitive declares its full state set" in `openspec/specs/design-system/spec.md`; the names do not track the tokens (`muted` inks `--fab-text-disabled`, `neutral` inks `--fab-text-muted`).
  - `emphasis="bare"` is the one emphasis that does not compose with `struck`, because its `border` shorthand resets the dashed `border-style` that prop states.
  - `iconOnly` emits `role="img"` on a non-interactive host only, before the rest spread so a caller's own `role` wins, because `aria-label` on a bare `span` is dropped; seven square sides are published, one per density, and `is-list` has no `min-height` to read.
  - `removable` throws rather than drops on `tag="button"`/`"a"`, a missing `removeLabel` and a missing `onRemove`; `removeLabel` names the member it takes out and defaults to `undefined`, never `''` — pinned by `tests/design-system-required-names.test.js`.
  - The remove control is a button outside a form, so it carries `data-keyboard-focus="true"`; focus moves to a sibling's remove control or the nearest enclosing `[data-chip-remove-fallback]` before `onRemove` runs, and the live region is the caller's, per "The Foundry contract binds every primitive" in `openspec/specs/design-system/spec.md`.
-->
<script>
  let {
    tag = 'span',
    tone = '',
    emphasis = '',
    mono = false,
    struck = false,
    icon = '',
    swatch = '',
    tint = '',
    class: extraClass = '',
    truncate = false,
    density = 'default',
    iconOnly = false,
    removable = false,
    removeLabel = undefined,
    onRemove = null,
    disabled = false,
    element = $bindable(null),
    children,
    presentation = '',
    ...rest
  } = $props();

  const safeSwatch = $derived(safePaletteKey(swatch));
  const safeTint = $derived(safePaletteKey(tint));
  const chipColor = $derived(safeTint || safeSwatch);
  const swatchStyle = $derived(
    chipColor ? `--fab-chip-color:var(--fab-tag-${chipColor})` : undefined
  );

  function safePaletteKey(value) {
    const key = String(value || '').replace(/^--fab-tag-/, '');
    return /^[a-z0-9-]+$/.test(key) ? key : '';
  }

  const TONES = new Set([
    'active',
    'positive',
    'disabled',
    'warning',
    'info',
    'danger',
    'neutral',
    'negative',
    'accent',
    'muted',
    'tag',
    'secondary',
    'subtle',
  ]);

  const EMPHASES = new Set(['outlined', 'lit', 'bare', 'solid']);

  const INTERACTIVE_TAGS = new Set(['button', 'a']);

  const iconOnlyRole = $derived(iconOnly && !INTERACTIVE_TAGS.has(tag) ? 'img' : undefined);

  const removeControl = $derived(resolveRemoveControl(removable, tag, removeLabel, onRemove));

  function resolveRemoveControl(on, host, label, handler) {
    if (!on) return false;
    if (INTERACTIVE_TAGS.has(host)) {
      throw new Error(
        `Chip: removable refuses tag="${host}", because the remove control is a button and a button inside an operable host nests a control in a control.`
      );
    }
    if (!label) {
      throw new Error(
        'Chip: removable requires removeLabel, because the control\u2019s glyph is aria-hidden and a control with no label is announced as nothing at all.'
      );
    }
    if (typeof handler !== 'function') {
      throw new Error(
        'Chip: removable requires onRemove, because a remove control with no handler is an affordance for an edit the screen cannot make.'
      );
    }
    return true;
  }

  function remove() {
    focusAfterRemoval();
    onRemove?.();
  }

  function focusAfterRemoval() {
    const target =
      removeControlIn(element?.nextElementSibling) ||
      removeControlIn(element?.previousElementSibling) ||
      fallbackTarget();
    target?.focus?.();
  }

  function removeControlIn(sibling) {
    return sibling?.querySelector?.('[data-chip-remove]') || null;
  }

  function fallbackTarget() {
    for (let node = element?.parentElement; node; node = node.parentElement) {
      const found = node.querySelector('[data-chip-remove-fallback]');
      if (found) return found;
    }
    return null;
  }

  const classes = $derived(
    [
      'manager-chip',
      TONES.has(tone) ? `is-${tone}` : '',
      EMPHASES.has(emphasis) ? `is-${emphasis}` : '',
      safeSwatch ? 'has-swatch' : '',
      safeTint ? 'has-tint' : '',
      mono ? 'is-mono' : '',
      struck ? 'is-struck' : '',
      truncate ? 'is-truncated' : '',
      density === 'row' ? 'is-row' : '',
      density === 'list' ? 'is-list' : '',
      density === 'action' ? 'is-action' : '',
      density === 'tag-run' ? 'is-tag-run' : '',
      density === 'inspector' ? 'is-inspector' : '',
      density === 'header' ? 'is-header' : '',
      iconOnly ? 'is-icon-only' : '',
      removeControl ? 'is-removable' : '',
      presentation === 'clock' ? 'is-clock' : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<svelte:element
  this={tag}
  bind:this={element}
  class={classes}
  style={swatchStyle}
  data-chip-tint={safeTint || undefined}
  role={iconOnlyRole}
  disabled={disabled || undefined}
  {...rest}
  >{#if safeSwatch}<span
      class="manager-chip-swatch"
      data-chip-swatch={safeSwatch}
      aria-hidden="true"
    ></span>{/if}{#if icon}<i class={icon} aria-hidden="true"></i>{/if}{#if removeControl}<span
      class="manager-chip-label">{@render children?.()}</span
    ><button
      type="button"
      class="manager-chip-remove fab-hit-area"
      data-chip-remove
      data-keyboard-focus="true"
      {disabled}
      aria-label={removeLabel || undefined}
      onclick={remove}><i class="fas fa-xmark" aria-hidden="true"></i></button
    >{:else}{@render children?.()}{/if}</svelte:element
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

  .manager-chip.is-truncated > i {
    flex: 0 0 auto;
  }

  .manager-chip i.fa-circle {
    font-size: 0.36rem;
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

  .manager-chip.is-struck > i {
    text-decoration: none;
  }

  .manager-chip.is-row {
    min-height: 22px;
    padding: 0 var(--fab-space-2);
    border-radius: 999px;
    color: var(--fab-text-secondary);
    background: var(--fab-bg-2);
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

  /* Opt-in WorldClockChip composition; icon, label and value are direct flex children. */
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

  /* The library states no tag-run glyph, so the prototype's 9px is taken (ruling 2026-09-28). */
  .manager-chip.is-tag-run > i:not(.fa-circle) {
    font-size: 9px;
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

  .manager-chip-swatch {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border: 1px solid color-mix(in srgb, var(--fab-chip-color) 60%, var(--fab-border));
    border-radius: 50%;
    background: var(--fab-chip-color);
  }

  .manager-chip.is-removable {
    padding-right: var(--fab-space-2xs);
  }

  .manager-chip.is-truncated .manager-chip-label {
    min-width: 0;
    overflow: hidden;
  }

  .manager-chip-remove {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    appearance: none;
    width: 20px;
    height: 20px;
    min-height: 20px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--fab-text-muted);
    background: transparent;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
  }

  .manager-chip-remove:hover:not(:disabled),
  .manager-chip-remove:focus-visible {
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
  }

  .manager-chip-remove:disabled {
    cursor: default;
    opacity: 0.6;
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

  .manager-chip.is-bare {
    border: 0;
  }

  .manager-chip.is-bare i:not(.fa-circle) {
    font-size: 7px;
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
