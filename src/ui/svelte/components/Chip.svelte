<!--
  THE app's one chip: a short, fully-rounded badge carrying a count, a state, a category or a tag.
  `SearchablePopover` and `Select` render it too, which is why it ships under `components/`, and its
  CSS lives in this scoped `<style>` so `VIEW_RECIPES` maps a change here to the views that render
  it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tag` | `'span'` \| `'li'` \| `'button'` \| `'div'` | `'span'` | The rendered element. A chip inside a `role="list"` must be an `li`; a clickable chip must be a real `button`. |
  | `tone` | `active`, `positive`, `disabled`, `warning`, `info`, `danger`, `neutral`, `negative`, `accent`, `muted`, `secondary`, `subtle`, `tag` | `''` | Colour ONLY, never size. A CLOSED set: an unrecognised value is DROPPED rather than emitted as an unstyled `is-*` class, so a typo shows as the default chip instead of silently doing nothing. See the invariants for how a caller picks one. |
  | `emphasis` | `'outlined'` \| `'lit'` \| `'bare'` | `''` | A SECOND AXIS: `tone` says which family the chip belongs to, `emphasis` says how that family arrives. The three are ALTERNATIVES, not a composition, and the set is closed the same way `tone` is. |
  | `density` | `'default'` \| `'row'` \| `'list'` \| `'action'` \| `'tag-run'` \| `'inspector'` | `'default'` | The scale, closed. It is THE variant-on-the-primitive escape hatch and the only one: a caller's own scoped `:global(...)` block is unlayered too and CAN out-specify this block — one did — but a second implementation of the one chip's geometry is what issue 883 retired, and `manager-layout.test.js`'s hand-rolled-chip ratchet exists to catch it. A layout context may size a chip's POSITION from outside, never its own geometry, and adding a value within a pixel of a shipped one is that same drift: the reference's two micro pills are both `density="list"`. |
  | `mono` | boolean | `false` | Numerals in the mono face with `tabular-nums`, so columns of counts, DCs and quantities line up. |
  | `struck` | boolean | `false` | The MUTED VARIANT: a value switched off in the scope being read — dashed hairline, soft fill, struck-through label. Composes with every tone, which owns the ink. |
  | `icon` | Font Awesome classes | `''` | A leading glyph, e.g. `fas fa-lock`. |
  | `swatch` | bare `--fab-tag-*` key | `''` | A leading colour DOT: the chip is ABOUT a colour. Anything that is not a bare key is dropped and no dot renders. |
  | `tint` | bare `--fab-tag-*` key | `''` | Inks the WHOLE chip — glyph and label — in that colour: the chip IS that colour. Validated exactly as `swatch` is; both ride `--fab-chip-color`, and the tint wins when a caller sets both. |
  | `truncate` | boolean | `false` | Single-line and clipped. Wrapping is the DEFAULT because the label arrives as a snippet and this component cannot derive a `title` from one, so a caller that truncates should pass one. |
  | `iconOnly` | boolean | `false` | The chip IS its glyph: a square with equal insets and no label, composing with whichever `density` the caller asks for. IT REQUIRES AN ACCESSIBLE NAME — the glyph is `aria-hidden`, so a chip with no `aria-label` is announced as nothing at all and a `title` is a tooltip rather than a name; a source contract holds that half, because a primitive cannot make a caller pass one. `role="img"` is emitted BESIDE the label, since `aria-label` on a bare `span` is dropped under ARIA's prohibition on naming a generic role, but only on a NON-INTERACTIVE host, because an `img` role on a button announces an operable control as a picture — and it is written before the rest spread, so a caller's own `role` wins. SIX SIDES ARE PUBLISHED, one per density, because the prop must be total over the axis it reads: five are the density's own height, and `is-list` states `min-height: 0` and so has none to read, which leaves an icon-only list chip about two pixels taller than the labelled ones beside it, deliberately. |
  | `removable` / `removeLabel` / `onRemove` | boolean / string / function | `false` / `undefined` / `null` | The chip is a MEMBERSHIP TOKEN in an editable set rather than a state the GM can only read. `removable` REFUSES THREE SHAPES WITH A THROW rather than a dropped prop: `tag="button"`/`tag="a"` nests a control inside a control; a missing `removeLabel` leaves a control whose only content is an `aria-hidden` glyph, announced as nothing at all; a missing `onRemove` is an affordance for an edit the screen cannot make. An unrecognised `tone` is dropped instead, because there the visible result reads as a typo — here it would be a chip that LOOKS removable and is not. `removeLabel` MUST NAME THE MEMBER IT TAKES OUT ("Remove Perception"), because the chip's own label arrives as a snippet and no component can read a name out of one; it defaults to `undefined`, never `''` and never a word of its own, since `aria-label=""` REPLACES the name the element would take from its content with nothing, a hard-coded English default is a name no world can change, and a localized generic is eight identically named buttons down a row of eight chips — `tests/design-system-required-names.test.js` ratchets all three. |
  | `disabled` | boolean | `false` | The chip and its remove control go inert together. Written before the rest spread, so a call site that passed it through the spread is unaffected. |
  | `class` | class string | `''` | An EXTRA class, for a caller that also needs layout context from the global sheet. |
  | `element` | bindable | `null` | The rendered DOM node. `bind:this` on a component yields the INSTANCE, so a caller that must measure or focus the chip has no other way to reach it. |

  Rest spread:
  - `{...rest}` lands on the rendered element, so `title`, `aria-label`, `data-*` hooks, `onclick`
    and `type` all forward. `role` and `disabled` are written BEFORE it, so a caller's own value
    still wins.

  Invariants:
  - THE ROOT KEEPS THE LITERAL `manager-chip` CLASS. `manager-layout.test.js`, the mounted suites
    and `scripts/foundry-test-run.mjs` — which selects `.manager-chip:has-text("Unsaved")` in two
    phases — all pin it, so renaming the hook breaks them without changing anything a user sees.
  - FOUR OF THE THIRTEEN TONES ARE ONE RECESSIVE LADDER, AND IT IS AN ORDER RATHER THAN A SET OF
    PERCENTAGES: `secondary` → `neutral` → `subtle` → `muted`, loudest to quietest. The quantity
    that orders them is the CONTRAST of each ink composited over that theme's own ground — never
    an alpha and never a channel, because the themes do not agree on a model and an alpha
    comparison ties three of the four. The order survives every shape they are stated in.
  - A CALLER ROUTES BY MEANING, NEVER BY MATCHING A TONE NAME TO A TOKEN NAME: `secondary` names
    the rule the GM is reading, `neutral` a fact merely present, `subtle` a quiet non-actionable
    state, `muted` unavailable. The names do NOT track the tokens — `muted` inks
    `--fab-text-disabled` while `neutral` inks `--fab-text-muted`.
  - `emphasis="bare"` IS THE ONE EMPHASIS THAT DOES NOT COMPOSE WITH `struck`, because its
    `border` shorthand resets the dashed `border-style` that prop states, so a struck bare chip
    loses the mark that says "switched off". No caller pairs the two.
  - THE REMOVE CONTROL IS A BUTTON OUTSIDE A FORM, so it carries `data-keyboard-focus="true"`:
    Foundry's `KeyboardManager#hasFocus` recognises a button only by its `form` and this
    application renders almost none, so without it Space pauses the game and the arrows pan the
    canvas while the control holds focus.
  - FOCUS DIES WITH THE REMOVED BUTTON, so the destination is taken BEFORE `onRemove` runs: the
    next chip's remove control, else the previous chip's, else the nearest enclosing
    `[data-chip-remove-fallback]` — a hook the CALLER puts on its own add trigger, since deleting
    the focused element otherwise drops focus to `<body>`, which Foundry reads as an unfocused
    window. THE ADD TRIGGER IS OFTEN CONDITIONAL, SO THE CALLER OWES A SECOND HOOK on the chip ROW
    itself, carrying `tabindex="-1"` and rendered in the empty state too, because a trigger that
    exists only while something is left to add disappears in exactly the removal that needs it.
    Both hooks coexist: the search runs outwards and takes the first match.
  - THE LIVE REGION IS THE CALLER'S, and a bare chip cannot own one. Neither adding nor removing a
    member moves focus into the row, so an editable chip set owes ONE `aria-live="polite"` summary
    BESIDE the row. A region wrapped AROUND the row announces each added chip's entire subtree,
    its remove button's label included, and announces NOTHING AT ALL on a removal. No test asserts
    that a removable-chip caller has one. `ModifierPillSelect` records the same failure in its own
    comment; nothing stops the next caller repeating it.
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
    // WorldClockChip opts into its owning geometry; ordinary density callers keep their face.
    presentation = '',
    ...rest
  } = $props();

  // Both props ride ONE vehicle and are validated to a bare palette key, because the key is
  // interpolated into a `style` attribute. The tint wins when both are set.
  const safeSwatch = $derived(safePaletteKey(swatch));
  const safeTint = $derived(safePaletteKey(tint));
  const chipColor = $derived(safeTint || safeSwatch);
  const swatchStyle = $derived(
    chipColor ? `--fab-chip-color:var(--fab-tag-${chipColor})` : undefined
  );

  /**
   * A bare `--fab-tag-*` palette key, or '' for anything that is not one. Both spellings are
   * tolerated because `ManagerColorPicker` already accepts both.
   *
   * @param {unknown} value
   * @returns {string}
   */
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

  /**
   * Whether to render the remove control, throwing on the three shapes the header refuses.
   *
   * @param {boolean} on the `removable` prop
   * @param {string} host the `tag` prop
   * @param {string} label the `removeLabel` prop
   * @param {unknown} handler the `onRemove` prop
   * @returns {boolean}
   */
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

  // Move focus BEFORE emitting: every candidate exists right now, and choosing one after the
  // handler has run is choosing from a DOM the removal has already changed. Next chip first —
  // jumping to the trigger while members remain reads as being thrown out of the row.
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

  /**
   * A sibling chip’s own remove control, or null. A row may hold things that are not chips, so
   * this asks each side for the hook rather than assuming a sibling is one.
   *
   * @param {Element|null|undefined} sibling
   * @returns {Element|null}
   */
  function removeControlIn(sibling) {
    return sibling?.querySelector?.('[data-chip-remove]') || null;
  }

  /**
   * The caller’s named fallback, searched OUTWARDS so a screen with two editable sets hands focus
   * to the trigger of the set being edited. A hook rather than a prop, because the trigger is
   * usually a component and `bind:this` on a component tag yields the INSTANCE.
   *
   * @returns {Element|null}
   */
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
      presentation === 'clock' ? 'is-clock' : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<!-- Written without internal whitespace on purpose: a newline between the glyph and the
     content becomes a text node, and callers assert on the chip's exact `textContent`
     (a count badge reading ' 1' instead of '1' is a real defect, not a test artefact). -->
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
  /* THEME-ROOT TOKENS ONLY. No scoped `<style>` may reference `--fab-manager-*`, or any other
     property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY directory: a
     component is placed in a directory, not in a DOM subtree, so outside the manager the property
     is not in scope, the declaration is invalid at computed-value time and the colour silently
     falls back to inheritance. `tests/token-generation-gate.test.js` reds the reference. */

  /* LAYERS DECIDE, THEN SPECIFICITY. Foundry imports `styles/fabricate.css` at `layer(modules)`
     while `css: 'injected'` puts this block in `document.head` UNLAYERED, and an unlayered author
     declaration beats every layered one at any specificity — so a global rule restating a property
     declared here cannot win, however many classes it carries. What legitimately stays in the
     global sheet is the chip's POSITION inside a parent's layout, never its geometry. */

  .manager-chip {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    width: fit-content;
    max-width: 100%;
    min-height: 20px;
    /* REAL, not slack: at `padding: 0` a wrapped label sat flush against the border. 4px keeps a
       single-line chip under the min-height, so nothing that does not wrap moves. */
    padding: var(--fab-space-1) var(--fab-space-chip);
    border: 1px solid var(--fab-border);
    /* 10px, not 999px: identical at the single-line height, since 999px clamps to half the
       shorter side, and they diverge only once a chip wraps. */
    border-radius: 10px;
    color: var(--fab-text);
    background: var(--fab-overlay-light-06);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1;
  }

  /* Opt-in single-line chip, for a row whose HEIGHT must not move. `overflow: hidden` makes the
     chip a flex scroll container, so its automatic minimum size becomes 0 — in a shrinkable row
     the caller must give it `flex-shrink: 0` unless clipping is what it wants. */
  .manager-chip.is-truncated {
    flex-wrap: nowrap;
    white-space: nowrap;
    overflow: hidden;
    border-radius: 999px;
  }

  .manager-chip.is-truncated > i {
    flex: 0 0 auto;
  }

  /* THE STATUS DOT: `fa-circle` is a MARK, and a rule rather than a prop because a caller cannot
     be asked to shrink a dot it did not choose to be a dot. IT REACHES THIS COMPONENT'S OWN GLYPH
     AND NOTHING ELSE, because Svelte requires the `<i>` to carry this component's scope hash. */
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

  /* SUBTLE: THREE declarations, not two. The pill this reproduces stated a transparent edge where
     this component's base states a visible hairline, so restating only its two would read one
     rank louder. `border-color` rather than the shorthand, for `is-struck`'s reason. */
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

  /* MUTED: an outline with the disabled ink and NO fill. Deliberately not `opacity`, which would
     fade a glyph and a swatch dot to a different degree than the label. */
  .manager-chip.is-muted {
    border-color: var(--fab-border);
    color: var(--fab-text-disabled);
    background: none;
  }

  /* THE MUTED VARIANT, written AFTER every tone so it wins the three properties it states — and
     states only those three, since the tone still owns the ink. `border-style` rather than the
     `border` shorthand, so the tone's `border-color` survives. */
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

  /* LIST density. `min-height: 0` IS REQUIRED: the base rule's floor is a MINIMUM, so restating
     padding and font-size alone would leave the pill as tall as it was. SIZE ONLY, no colour —
     the same list draws a `danger`-toned pill, and a density that painted would flatten it. */
  .manager-chip.is-list {
    min-height: 0;
    padding: 1px var(--fab-space-2);
    border-radius: 999px;
    font-size: 9px;
    font-weight: 600;
    /* The canonical library states an explicit 1.6 line-height: 18.4px with the border,
       16.4px bare. Issue 1648 repairs the inherited line-height of 1 to match that
       specimen rather than the contradictory height prose it replaced. */
    line-height: 1.6;
    /* SINGLE-LINE, and the one density that had to say so. Shrink protection stays with the
       caller: this states how the text lays out, never how much room the row gives the chip. */
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

  /* ACTION density. 34px is the button's own figure, restated because a layered `min-height`
     cannot be inherited by an unlayered block; `manager-header-geometry.test.js` measures BOTH in
     one composed page and fails naming the pair — a duplicated figure with a gate on it. */
  .manager-chip.is-action {
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    white-space: nowrap;
  }

  /* TAG-RUN scale. The reference's 5px inset SNAPS to `--fab-space-chip`, because 5 is off the
     4px spacing scale `openspec/specs/ui-integration/spec.md` makes normative and
     `tests/components/spacing-scale-ratchet.test.js` enforces. SIZE ONLY: this block shares no
     property with the lit tag face or with `struck`, which is what lets one run draw all three. */
  .manager-chip.is-tag-run {
    padding: var(--fab-space-chip) var(--fab-space-3);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }

  /* INSPECTOR density: NOT a fourth micro scale — the reference's pill is the shipped default's
     height, so what is open is the weight and the horizontal inset. The corner and font-size are
     not restatements: they diverge from the base rule's on a wrap and against the host's root font
     size. GEOMETRY AND TYPE ONLY: this run's two halves are deliberately differently toned. */
  .manager-chip.is-inspector {
    padding: var(--fab-space-1) var(--fab-space-2);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
  }

  /* THE ICON-ONLY CHIP: a square, which no density can produce — every density states a BAND.
     EQUAL INSETS, WHICH IS `padding: 0`. `min-height` is restated beside `height` on purpose: the
     base rule's floor would win at `list`, and `is-list`'s own `min-height: 0` would let a column
     flex parent collapse the square at the others. */
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

  /* The colour DOT, painted from the `--fab-chip-color` the root sets inline. Named
     `manager-chip-swatch` rather than anything matching `manager-chip` on its own, because
     `manager-layout.test.js`'s hand-rolled-chip ratchet greps for that exact token. */
  .manager-chip-swatch {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border: 1px solid color-mix(in srgb, var(--fab-chip-color) 60%, var(--fab-border));
    border-radius: 50%;
    background: var(--fab-chip-color);
  }

  /* THE REMOVE CONTROL, written AFTER the six density rules deliberately: each restates the chip's
     `padding` shorthand at this block's own specificity, so a trailing inset written before them
     would be reset. THE HIT BOX IS ONE SIDE, NOT SIX — the density axis scales the badge a GM
     reads, not the thing they press — so at `is-list` the control is taller than the row. */
  .manager-chip.is-removable {
    padding-right: var(--fab-space-2xs);
  }

  /* `truncate` clips the LABEL and never the control: a flex item's automatic minimum size is
     its CONTENT width, so without this the label refuses to shrink and pushes the control out of
     the chip's visible box — still in the DOM, still in the tab order, no longer on screen. */
  .manager-chip.is-truncated .manager-chip-label {
    min-width: 0;
    overflow: hidden;
  }

  /* The other half: the label gives way, the control does not. `height` and `min-height` are both
     stated for the reason the icon-only squares state both, and `appearance`/`height`/the font
     are the three properties Foundry's host button geometry imposes. */
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

  /* Foreground and fill only: NO `outline` and NO `box-shadow`, because the module focus pair is
     declared once at the module root and restating either half here would take the keyboard
     affordance off the one control this prop adds. */
  .manager-chip-remove:hover:not(:disabled),
  .manager-chip-remove:focus-visible {
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
  }

  .manager-chip-remove:disabled {
    cursor: default;
    opacity: 0.6;
  }

  /* An item TAG: purple, through the same `--fab-chip-color` + `color-mix` vehicle
     `.manager-availability-pill.is-tag` uses, so the tag tone is defined once. `--fab-bg-3` is
     named as the theme-root token it is, under this block's first rule. */
  .manager-chip.is-tag {
    --fab-chip-color: var(--fab-purple);

    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
    color: var(--fab-text);
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-bg-3));
  }

  /* THE TINT: three declarations and every one is a colour — a tint that resized would reintroduce
     the drift this component ended. WRITTEN AFTER EVERY TONE, because each tone is (0,2,0) as this
     is and a caller pairing them asks for the tint; `is-outlined` and the lit pair stand after it
     in turn, because both act ON a chip's declared colour.
     `tests/components/essence-chip-rendered.test.js` holds the inked label above 4.5:1. */
  .manager-chip.has-tint {
    border-color: var(--fab-border);
    color: var(--fab-chip-color);
    background: var(--fab-surface-soft);
  }

  /* THE OUTLINED EMPHASIS: a FLAT PLATE, which no tone can say because every one paints a wash.
     ONE declaration is the whole of it, because the tone rules already state the edge and the ink.
     WRITTEN LAST, and load-bearing: every tone rule is (0,2,0) as this is, so order decides the
     fill, and an emphasis written earlier would lose to the final tone rule alone. */
  .manager-chip.is-outlined {
    background: var(--fab-bg-1);
  }

  /* THE LIT EMPHASIS: a PROP rather than a repaint of a tone with shipped callers elsewhere. IT IS
     SELECTED ON THE CLASSES THAT DECLARE A COLOUR, because a chip must have one before it can be
     lit in it, and the precondition belongs in the SELECTOR rather than a `var()` fallback: a mix
     is a mix whatever the fallback is, and unmatched is the only genuine no-op. At (0,3,0) these
     beat `is-outlined`, which is correct — a plate and a wash are two answers to one question. */
  .manager-chip.is-tag.is-lit,
  .manager-chip.has-swatch.is-lit,
  .manager-chip.has-tint.is-lit {
    color: var(--fab-chip-color);
    background: color-mix(in srgb, var(--fab-chip-color) 16%, transparent);
  }

  /* THE BARE EMPHASIS earns a value on this axis because NEITHER A TONE NOR A DENSITY CAN REMOVE
     AN EDGE — a colour cannot subtract a width. `border` rather than `border-width: 0`, because
     the shorthand resets `border-color` to `currentColor`, the reference's computed edge. */
  .manager-chip.is-bare {
    border: 0;
  }

  /* `:not(.fa-circle)` is LOAD-BEARING: the status-dot rule above is (0,2,1) and an unqualified
     `.manager-chip.is-bare i` is also (0,2,1) — a tie decided by order, and this rule is later, so
     a bare chip's dot would inflate. Excluding by selector cannot lose that race. */
  .manager-chip.is-bare i:not(.fa-circle) {
    font-size: 7px;
  }
</style>
