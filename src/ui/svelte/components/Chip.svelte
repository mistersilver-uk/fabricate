<!--
  The app's one chip: a short, fully-rounded badge carrying a count, a state, a category or a tag. `SearchablePopover` and `Select` render it too, so it ships under `components/`, and its root's CSS lives in `ChipFrame`'s scoped `<style>`, so `VIEW_RECIPES` maps a change there to the views that render it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tag` | `'span'` \| `'li'` \| `'button'` \| `'div'` | `'span'` | The rendered element. A chip inside a `role="list"` must be an `li`; a clickable chip must be a real `button`. |
  | `tone` | `active`, `positive`, `disabled`, `warning`, `info`, `danger`, `neutral`, `negative`, `accent`, `muted`, `secondary`, `subtle`, `tag` | `''` | Colour ONLY, never size. A CLOSED set: an unrecognised value is DROPPED rather than emitted as an unstyled `is-*`, so a typo shows as the default chip. See the invariants for how a caller picks one. |
  | `emphasis` | `'outlined'` \| `'lit'` \| `'bare'` \| `'solid'` \| `'dashed'` | `''` | A second axis: `tone` says which family the chip belongs to, `emphasis` how that family arrives. The five are alternatives, not a composition, and the set is closed the same way. `solid` is the opaque ground for a chip read over artwork; `dashed` dashes the tone's edge for a locked or provisional state its text or name must also say (issue 2858). |
  | `density` | `'default'` \| `'row'` \| `'list'` \| `'action'` \| `'tag-run'` \| `'inspector'` \| `'header'` | `'default'` | The scale, closed. It is THE variant-on-the-primitive escape hatch and the only one: a layout context may size a chip's POSITION from outside, never its own geometry, and a value within a pixel of a shipped one is that same drift. `manager-layout.test.js`'s hand-rolled-chip ratchet catches the alternative. `presentation="clock"` is `WorldClockChip`'s own opt-in geometry and no density. |
  | `mono` / `struck` / `icon` | booleans / Font Awesome classes | `false` / `false` / `''` | Numerals in the mono face with `tabular-nums`, so columns of counts, DCs and quantities line up; the MUTED VARIANT, a value switched off in the scope being read, composing with every tone, which owns the ink; and a leading glyph. |
  | `swatch` / `tint` | bare `--fab-tag-*` keys | `''` | A leading colour DOT (the chip is ABOUT a colour) and an ink for the WHOLE chip (the chip IS that colour). Both are validated to a bare key before interpolation into a `style` attribute, both ride `--fab-chip-color`, and the tint wins when both are set. |
  | `ariaLabel` | pre-localized string | `''` | A non-blank name: a `button` or `a` host's `aria-label`, and an `iconOnly` chip's beside `role="img"` on any other host but `li`. With an `icon` and no label the chip is its glyph alone, as `iconOnly` draws it, and also carries the name as its `data-tooltip-text`, before the rest spread so a caller's own wins; an `iconOnly` caller owns its own tooltip. On any other host the label is `aria-hidden` and the name is drawn beside it as visually hidden text, so never put a control in such a chip's children. A removable chip ignores it (issue 2858). |
  | `truncate` / `iconOnly` | booleans | `false` | `truncate` is single-line, keeps the glyph and the start of the label and ends in an ellipsis; wrapping is the DEFAULT because the label arrives as a snippet and no `title` can be derived from one, so a caller that truncates should pass one. `iconOnly` makes the chip its glyph — a square with equal insets and no label — and REQUIRES AN ACCESSIBLE NAME, which a source contract holds because a primitive cannot make a caller pass one. |
  | `removable` / `removeLabel` / `onRemove` | boolean / string / function | `false` / `undefined` / `null` | The chip is a MEMBERSHIP TOKEN in an editable set rather than a state the GM can only read; see the invariants for the three shapes `removable` refuses. |
  | `disabled` / `class` | boolean / class string | `false` / `''` | The chip and its remove control go inert together, written before the rest spread so a call site that passed it through the spread is unaffected; and an EXTRA class, for a caller that also needs layout context from the global sheet. |
  | `element` | bindable | `null` | The rendered DOM node. `bind:this` on a component yields the INSTANCE, so a caller that must measure or focus the chip has no other way to reach it. |

  Rest spread:
  - `{...rest}` lands on the rendered element after `role` and `disabled`, so a caller's own value wins; `title`, `aria-label`, `data-*` hooks, `onclick` and `type` all forward.

  Invariants:
  - The root keeps the literal `manager-chip` class — pinned by `manager-layout.test.js`, the mounted suites and `scripts/foundry-test-run.mjs`.
  - Four of the thirteen tones are one recessive ladder a caller routes by meaning, per "Every interactive primitive declares its full state set" in `openspec/specs/design-system/spec.md`; the names do not track the tokens (`muted` inks `--fab-text-disabled`, `neutral` inks `--fab-text-muted`).
  - `density="row"` composes with a tone: its ground and ink sit above the tone rules, so a tone paints a row chip as it paints every other density.
  - `emphasis="bare"` is the one emphasis that does not compose with `struck`, because its `border` shorthand resets the dashed `border-style` that prop states.
  - `iconOnly` emits `role="img"` on a non-interactive host only, before the rest spread so a caller's own `role` wins, because `aria-label` on a bare `span` is dropped; seven square sides are published, one per density, and `is-list` has no `min-height` to read.
  - `removable` throws rather than drops on `tag="button"`/`"a"`, a missing `removeLabel` and a missing `onRemove`; `removeLabel` names the member it takes out and defaults to `undefined`, never `''` — pinned by `tests/design-system-required-names.test.js`.
  - The remove control is a button outside a form, so it carries `data-keyboard-focus="true"`; focus moves to a sibling's remove control or the nearest enclosing `[data-chip-remove-fallback]` before `onRemove` runs, and the live region is the caller's, per "The Foundry contract binds every primitive" in `openspec/specs/design-system/spec.md`.
-->
<script>
  import ChipFrame from './ChipFrame.svelte';

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
    ariaLabel = '',
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

  const EMPHASES = new Set(['outlined', 'lit', 'bare', 'solid', 'dashed']);

  const INTERACTIVE_TAGS = new Set(['button', 'a']);

  const removeControl = $derived(resolveRemoveControl(removable, tag, removeLabel, onRemove));

  const isText = (value) => typeof value === 'string' && value.trim() !== '';
  const named = $derived(isText(ariaLabel) && !removeControl);
  const waived = $derived(named && isText(icon) && !children);
  const glyphOnly = $derived(iconOnly || waived);
  const operable = $derived(INTERACTIVE_TAGS.has(tag));
  // `role="img"` would replace an `li`'s list item role, so a named one speaks its name instead.
  const imaged = $derived(glyphOnly && !operable && !(named && tag === 'li'));
  const spoken = $derived(named && !imaged && !operable);
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
      glyphOnly ? 'is-icon-only' : '',
      removeControl ? 'is-removable' : '',
      presentation === 'clock' ? 'is-clock' : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<!-- ratchet-exempt(design-system): the spread is this primitive's own rest, forwarded to the root it composes -->
<ChipFrame
  {tag}
  bind:element
  class={classes}
  style={swatchStyle}
  chipTint={safeTint || undefined}
  ariaRole={imaged ? 'img' : undefined}
  ariaLabel={named ? ariaLabel : ''}
  {spoken}
  {waived}
  disabled={disabled || undefined}
  {...rest}
>
  {#if safeSwatch}<span class="manager-chip-swatch" data-chip-swatch={safeSwatch} aria-hidden="true"
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
    >{:else if spoken}{#if children}<span
        class={truncate ? 'manager-chip-label' : 'manager-chip-spoken'}
        aria-hidden="true">{@render children()}</span
      >{/if}<span class="manager-chip-name">{ariaLabel}</span>{:else if truncate && !glyphOnly}<span
      class="manager-chip-label">{@render children?.()}</span
    >{:else}{@render children?.()}{/if}</ChipFrame
>

<style>
  :global(.manager-chip.is-truncated) > i {
    flex: 0 0 auto;
  }

  :global(.manager-chip) i.fa-circle {
    font-size: 0.36rem;
  }

  :global(.manager-chip.is-struck) > i {
    text-decoration: none;
  }

  /* The library states no tag-run glyph, so the prototype's 9px is taken (ruling 2026-09-28). */
  :global(.manager-chip.is-tag-run) > i:not(.fa-circle) {
    font-size: 9px;
  }

  /* A spoken chip's hidden label lays its content out as the chip's own, as an unnamed chip does. */
  .manager-chip-spoken {
    display: contents;
  }

  /* A named chip's spoken name, restating `.visually-hidden`, which needs a Fabricate root. */
  .manager-chip-name {
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

  .manager-chip-swatch {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border: 1px solid color-mix(in srgb, var(--fab-chip-color) 60%, var(--fab-border));
    border-radius: 50%;
    background: var(--fab-chip-color);
  }

  :global(.manager-chip.is-truncated) .manager-chip-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
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

  :global(.manager-chip.is-bare) i:not(.fa-circle) {
    font-size: 7px;
  }
</style>
