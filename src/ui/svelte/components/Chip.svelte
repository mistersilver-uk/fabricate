<!--
  THE app's one chip: a short, fully-rounded badge carrying a count, a state, a category or a tag.
  `SearchablePopover` and `Select` render it too, which is why it ships under `components/`, and its
  CSS lives in this scoped `<style>` so `VIEW_RECIPES` maps a change here to the views that render it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tag` | `'span'` \| `'li'` \| `'button'` \| `'div'` | `'span'` | The rendered element. A chip inside a `role="list"` must be an `li`; a clickable chip must be a real `button`. |
  | `tone` | `active`, `positive`, `disabled`, `warning`, `info`, `danger`, `neutral`, `negative`, `accent`, `muted`, `secondary`, `subtle`, `tag` | `''` | Colour ONLY, never size. A CLOSED set: an unrecognised value is DROPPED rather than emitted as an unstyled `is-*`, so a typo shows as the default chip. See the invariants for how a caller picks one. |
  | `emphasis` | `'outlined'` \| `'lit'` \| `'bare'` | `''` | A SECOND AXIS: `tone` says which family the chip belongs to, `emphasis` how that family arrives. The three are ALTERNATIVES, not a composition, and the set is closed the same way. |
  | `density` | `'default'` \| `'row'` \| `'list'` \| `'action'` \| `'tag-run'` \| `'inspector'` | `'default'` | The scale, closed. It is THE variant-on-the-primitive escape hatch and the only one: a layout context may size a chip's POSITION from outside, never its own geometry, and a value within a pixel of a shipped one is that same drift. `manager-layout.test.js`'s hand-rolled-chip ratchet catches the alternative. |
  | `mono` / `struck` / `icon` | booleans / Font Awesome classes | `false` / `false` / `''` | Numerals in the mono face with `tabular-nums`, so columns of counts, DCs and quantities line up; the MUTED VARIANT, a value switched off in the scope being read, composing with every tone, which owns the ink; and a leading glyph. |
  | `swatch` / `tint` | bare `--fab-tag-*` keys | `''` | A leading colour DOT (the chip is ABOUT a colour) and an ink for the WHOLE chip (the chip IS that colour). Both are validated to a bare key before interpolation into a `style` attribute, both ride `--fab-chip-color`, and the tint wins when both are set. |
  | `truncate` / `iconOnly` | booleans | `false` | `truncate` is single-line and clipped; wrapping is the DEFAULT because the label arrives as a snippet and no `title` can be derived from one, so a caller that truncates should pass one. `iconOnly` makes the chip its glyph — a square with equal insets and no label — and REQUIRES AN ACCESSIBLE NAME, which a source contract holds because a primitive cannot make a caller pass one. |
  | `removable` / `removeLabel` / `onRemove` | boolean / string / function | `false` / `undefined` / `null` | The chip is a MEMBERSHIP TOKEN in an editable set rather than a state the GM can only read; see the invariants for the three shapes `removable` refuses. |
  | `disabled` / `class` | boolean / class string | `false` / `''` | The chip and its remove control go inert together, written before the rest spread so a call site that passed it through the spread is unaffected; and an EXTRA class, for a caller that also needs layout context from the global sheet. |
  | `element` | bindable | `null` | The rendered DOM node. `bind:this` on a component yields the INSTANCE, so a caller that must measure or focus the chip has no other way to reach it. |

  Rest spread:
  - `{...rest}` lands on the rendered element, so `title`, `aria-label`, `data-*` hooks, `onclick`
    and `type` all forward. `role` and `disabled` are written BEFORE it, so a caller's own value
    still wins.

  Invariants:
  - THE ROOT KEEPS THE LITERAL `manager-chip` CLASS, which `manager-layout.test.js`, the mounted
    suites and `scripts/foundry-test-run.mjs` all pin, so renaming it breaks them while changing
    nothing a user sees.
  - FOUR OF THE THIRTEEN TONES ARE ONE RECESSIVE LADDER a caller routes by MEANING, which
    `openspec/specs/design-system/spec.md` states under "Every interactive primitive declares its
    full state set". The names deliberately do not track the tokens — `muted` inks
    `--fab-text-disabled` while `neutral` inks `--fab-text-muted`.
  - `emphasis="bare"` IS THE ONE EMPHASIS THAT DOES NOT COMPOSE WITH `struck`, because its `border`
    shorthand resets the dashed `border-style` that prop states. No caller pairs the two.
  - `iconOnly` EMITS `role="img"` BESIDE THE LABEL, since `aria-label` on a bare `span` is dropped
    under ARIA's prohibition on naming a generic role — but only on a NON-INTERACTIVE host, and
    before the rest spread so a caller's own `role` wins. SIX SIDES ARE PUBLISHED, one per density,
    because the prop must be total over the axis it reads; `is-list` states `min-height: 0` and has
    none to read, leaving an icon-only list chip about two pixels taller than its neighbours.
  - `removable` REFUSES THREE SHAPES WITH A THROW rather than a dropped prop: `tag="button"`/`"a"`
    nests a control inside a control, a missing `removeLabel` leaves a control whose only content is
    an `aria-hidden` glyph, and a missing `onRemove` is an affordance for an edit the screen cannot
    make. An unrecognised `tone` is dropped instead, because a dropped `removable` would be a chip
    that LOOKS removable and is not.
  - `removeLabel` MUST NAME THE MEMBER IT TAKES OUT ("Remove Perception"), because the chip's own
    label arrives as a snippet. It defaults to `undefined`, never `''` and never a word of its own,
    for the three reasons `tests/design-system-required-names.test.js` ratchets.
  - THE REMOVE CONTROL IS A BUTTON OUTSIDE A FORM, so it carries `data-keyboard-focus="true"`, per
    `openspec/specs/design-system/spec.md` under "The Foundry contract binds every primitive".
  - FOCUS DIES WITH THE REMOVED BUTTON and THE LIVE REGION IS THE CALLER'S — both rules, including
    the two fallback hooks a caller owes, are `openspec/specs/design-system/spec.md`'s. The caller's
    own hook here is `[data-chip-remove-fallback]`, searched outwards for the first match, and no
    test asserts that a removable-chip caller has a summary region.
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

  const EMPHASES = new Set(['outlined', 'lit', 'bare']);

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
      iconOnly ? 'is-icon-only' : '',
      removeControl ? 'is-removable' : '',
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
      class="manager-chip-remove"
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
    border-radius: 10px;
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

  .manager-chip.is-mono {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
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
    padding: 0 9px;
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
    white-space: nowrap;
  }

  .manager-chip.is-action {
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    white-space: nowrap;
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
</style>
