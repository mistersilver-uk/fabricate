<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE chip: a short, fully-rounded badge carrying a count, a state, a
  category or a tag. Every chip on every GM manager screen renders through this
  component (issue 883).

  It exists because the chip had drifted into two scales. The base `.manager-chip` rule
  in `styles/fabricate.css` was 24px tall at `0.75rem`/700, and the Tool Studio and
  Knowledge surfaces opted OUT of it through a three-selector join that restated a
  compact 20px/`0.62rem`/1 scale. Chips therefore out-sized the Tool Studio's everywhere
  else, and the only way to fix a screen was to add its container to that join — which is
  how an opt-in scale spreads instead of settling. The compact scale is now simply what a
  chip IS: nothing opts in, and there is no second size to opt into.

  Its CSS lives in this scoped `<style>`, not the global sheet, so `VIEW_RECIPES` in
  `scripts/ui-pr-screenshot-evidence.mjs` maps a change here to the views that actually
  render it rather than matching the broad `theme-or-global-ui` recipe.

  The root keeps the literal `manager-chip` class. `manager-layout.test.js`, the mounted
  suites and the Foundry smoke harness (`scripts/foundry-test-run.mjs` selects
  `.manager-chip:has-text("Unsaved")` in two phases) all pin it, and a primitive that
  renamed the hook would break those without changing anything a user sees.

  Props:
   - tag: the rendered element. `span` (default), or `li` / `button` / `div` where the
     surrounding markup demands it — a chip inside a `role="list"` must be a list item,
     and a clickable chip must be a real button.
   - tone: the colour family, WITHOUT the `is-` prefix — one of `active`, `positive`,
     `disabled`, `warning`, `info`, `danger`, `neutral`, `negative`, `tag`, or '' for the
     default neutral fill. Tone is colour only and never changes the size; a tone that
     resized would reintroduce the drift this component removes.
   - mono: numerals in the mono face with `tabular-nums`, so columns of counts, DCs and
     quantities line up. Counts are mono everywhere in the manager.
   - icon: Font Awesome classes for a leading glyph, e.g. `fas fa-lock`.
   - swatch: a BARE `--fab-tag-*` palette key (`sage`, `mauve`, …) rendering a leading
     COLOUR DOT (issue 1036). The colour pill is a variant of the one chip rather than a
     tenth pill shape. It is deliberately NOT the `is-tag` fill treatment: `--fab-chip-color`
     is DECLARED inside `.manager-chip.is-tag` and consumed only by that rule, so setting it
     on a non-tag chip paints literally nothing — a declaration that renders as a no-op is a
     failed visual change, not a subtle one — and eight pastel fills down a dense library
     list is not what a colour pill should look like. `swatch` composes with every tone.
   - class: additional classes for a caller that also needs layout context from the
     global sheet (`manager-editor-tab-badge` positions a badge inside a tab button, for
     instance). Those rules sit at a higher specificity than this scoped block by
     design — see the note in the style block below.
   - element: bindable, the rendered DOM node. `bind:this` on a component yields the
     component INSTANCE, not its node, so a caller that must measure or focus the chip
     — `SearchablePopover` positions its popover off the trigger's bounding box and
     restores focus to it on close — has no other way to reach it.
   - density: 'default' (the manager's one chip scale) or 'row' — the Checks Studio
     modifier row's own scale for an in-line annotation chip (the bounds chip, the
     "Rolls dice" chip), taken from the prototype (issue 1096). `styles/fabricate.css`
     cannot state it: that sheet imports at `layer(modules)` while this component's
     `css: 'injected'` block lands UNLAYERED (svelte.config.js), and an unlayered
     declaration beats a layered one no matter how specific the layered selector is
     written. A caller's OWN scoped block is unlayered too, so a `:global(...)` override
     written there can out-specify this component's base rule and visually work — that is
     exactly what `CraftingModifierCatalogueCard.svelte` did before this prop existed —
     but it is still a second, parallel implementation of the one chip's geometry, which
     is precisely what issue 883 retired and what `manager-layout.test.js`'s hand-rolled-
     chip ratchet exists to catch: rendering right is not the bar, one owner is. So
     `density` is the variant-on-the-primitive escape hatch `SegmentedControl`'s own
     `density` prop is, for the identical reason: a layout context may still size a
     chip's POSITION (a caller sets `flex-shrink` etc. from outside), but never its own
     geometry.

  Every other attribute — `title`, `aria-label`, `role`, `data-*` hooks, `onclick`,
  `type`, `disabled` — is forwarded through the rest spread, so a call site is not
  limited to a fixed prop list.
-->
<script>
  let {
    tag = 'span',
    tone = '',
    mono = false,
    icon = '',
    swatch = '',
    class: extraClass = '',
    truncate = false,
    density = 'default',
    element = $bindable(null),
    children,
    ...rest
  } = $props();

  // The token is interpolated into a `style` attribute, so it is constrained to the shape
  // a bare palette key can have; anything else is dropped and the dot is not rendered at
  // all, rather than emitting whatever the caller composed. Both spellings are tolerated
  // because `ManagerColorPicker` already accepts both.
  const safeSwatch = $derived(
    /^[a-z0-9-]+$/.test(String(swatch || '').replace(/^--fab-tag-/, ''))
      ? String(swatch).replace(/^--fab-tag-/, '')
      : ''
  );
  const swatchStyle = $derived(
    safeSwatch ? `--fab-chip-color:var(--fab-tag-${safeSwatch})` : undefined
  );

  // Colour families this component paints. Anything else a caller passes is dropped
  // rather than emitted as an unstyled `is-*` class, so a typo shows up as the default
  // chip instead of silently doing nothing at all.
  const TONES = new Set([
    'active',
    'positive',
    'disabled',
    'warning',
    'info',
    'danger',
    'neutral',
    'negative',
    // An item TAG (issue 772). Tags are purple across the manager, and the component
    // editor's tag pill carried that colour in the global sheet before it converted onto
    // this component. Without the tone here, `TONES` would DROP `tag` silently at the
    // filter below and the purple would simply disappear: `positive` would re-colour tag
    // membership into the success family, `neutral` would erase the tag language, and a
    // `class=` override would re-derive the tone back in the global sheet.
    'tag',
  ]);

  const classes = $derived(
    [
      'manager-chip',
      TONES.has(tone) ? `is-${tone}` : '',
      safeSwatch ? 'has-swatch' : '',
      mono ? 'is-mono' : '',
      truncate ? 'is-truncated' : '',
      density === 'row' ? 'is-row' : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<!-- Written without internal whitespace on purpose: a newline between the glyph and the
     content becomes a text node, and callers assert on the chip's exact `textContent`
     (a count badge reading ' 1' instead of '1' is a real defect, not a test artefact). -->
<svelte:element this={tag} bind:this={element} class={classes} style={swatchStyle} {...rest}
  >{#if safeSwatch}<span
      class="manager-chip-swatch"
      data-chip-swatch={safeSwatch}
      aria-hidden="true"
    ></span>{/if}{#if icon}<i class={icon} aria-hidden="true"
    ></i>{/if}{@render children?.()}</svelte:element
>

<style>
  /* Theme-root tokens ONLY. This component is area-agnostic, so it must not reference
     `--fab-mv2-*` or any other alias declared on `.fabricate-manager` (styles/fabricate.css
     declares those inside that area block). Outside the manager — `.fabricate-app`,
     `.fabricate-admin`, `.fabricate-interactables-manager` — such a property is not in
     scope, the declaration becomes invalid at computed-value time and the colour silently
     falls back to inheritance. Nothing fails; it just looks wrong, and the trigger is
     exactly the reuse this primitive exists to enable. Every token below is declared in
     `:root` or in all seven `.fabricate[data-fabricate-theme="…"]` blocks, which every
     Fabricate surface carries. */

  /* A NOTE ON SPECIFICITY, because it decides what may stay in the global sheet.
     Svelte compiles these selectors to `.manager-chip.svelte-<hash>` — two classes,
     (0,2,0) — and `css: 'injected'` (svelte.config.js) puts them in `document.head`
     AFTER Foundry's `<link>` for styles/fabricate.css. So a global rule at (0,2,0), such
     as `.fabricate-manager .manager-vocabulary-chip-unused`, TIES with this block and
     loses on source order. Every global rule that must still beat a chip declaration is
     therefore written at three classes or more, e.g.
     `.fabricate-manager .manager-chip.manager-vocabulary-chip-unused`. What legitimately
     remains global is what a scoped block cannot reach: an ancestor-context rule (a chip
     in the header action bar matches the 34px control beside it) and the chip's position
     inside a parent's layout. */

  /* Pill (issue 643): fully-rounded rather than 6px-cornered, matching the Recipe Studio
     language. The COMPACT scale (issue 883) is the only scale — 20px tall, `0.62rem`,
     `line-height: 1`, and the horizontal-only chip padding. */
  .manager-chip {
    /* See the EmptyState note: area-agnostic, so the padding model is declared, not
       inherited from `.fabricate-manager * { box-sizing }`. */
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    width: fit-content;
    max-width: 100%;
    min-height: 20px;
    /* Vertical padding is REAL, not slack. With `padding: 0` the breathing room above and
       below a single line was only the difference between the 20px min-height and a
       9.92px line box; the moment a long label wrapped, that difference was spent and the
       text sat flush against the border. 4px keeps a single-line chip at 17.92px — still
       under the min-height, so every existing chip renders pixel-identically — while a
       wrapped one keeps its padding (issue 883). */
    padding: var(--fab-space-1) var(--fab-space-chip);
    border: 1px solid var(--fab-border);
    /* 10px, not 999px: at the 20px single-line height these are THE SAME — 999px clamps to
       half the shorter side, which is 10px — so a normal chip is unchanged. They diverge
       only once a chip wraps, where 999px would draw a stadium around two lines of text
       and 10px draws a rounded rectangle. The radius follows the wrap for free, with no
       prop and no visual change to anything that does not wrap. */
    border-radius: 10px;
    color: var(--fab-text);
    background: var(--fab-overlay-light-06);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1;
  }

  /* Opt-in single-line chip. Wrapping is the DEFAULT because chip content arrives as a
     snippet, so this component cannot derive a `title` from it — truncating everywhere
     would silently hide user-authored names at ~140 call sites with nothing to recover
     them. `truncate` is for chips whose ROW HEIGHT must not move (a toolbar beside 34px
     buttons), and a caller that sets it should pass `title` so the full text stays
     reachable. The pill returns here: a truncated chip is single-line by construction,
     so the stadium is always correct (issue 883). */
  .manager-chip.is-truncated {
    flex-wrap: nowrap;
    white-space: nowrap;
    overflow: hidden;
    border-radius: 999px;
  }

  /* The glyph must not be squeezed by a long label; the label owns the clipping. */
  .manager-chip.is-truncated > i {
    flex: 0 0 auto;
  }

  /* A chip rendered as a `button` must beat Foundry's host button geometry, which sets a
     fixed height and its own font. Those are the properties the host actually imposes;
     everything else the base rule above already covers. */
  button.manager-chip {
    appearance: none;
    height: auto;
    font-family: inherit;
    cursor: pointer;
  }

  /* Pointer feedback for a chip that is actually a control (issue 772). The component
     editor's tag pill had this — `.manager-component-tag-toggle:hover:not(:disabled)` —
     and lost it when that block retired into this primitive, and the bulk panel's
     tri-state chips, whose whole interaction is repeated clicking, never had it at all.
     Edge and foreground only, so it composes with every tone rather than fighting it:
     a hover that repainted the fill would have to be restated per tone.

     `button.`-prefixed, so it reaches ONLY the chips that are real buttons — six call
     sites. A `<span>` chip can be neither hovered as a control nor `:disabled`, so the
     wide call-site count is not a reason to leave a control without feedback. */
  button.manager-chip:hover:not(:disabled) {
    border-color: var(--fab-accent);
    color: var(--fab-text);
  }

  /* A disabled chip-button goes inert. The component editor's tag run states this for
     itself in the global sheet (three classes, so it still wins there); stating it HERE
     is what covers a chip-button outside such a run — the bulk panel's chips, which had
     no disabled treatment at all while an apply was in flight. */
  button.manager-chip:disabled {
    cursor: default;
    opacity: 0.6;
  }

  /* A chip rendered as a list item drops the marker; the pill IS the item. */
  li.manager-chip {
    list-style: none;
  }

  /* Numerics are mono everywhere in the manager: counts, DCs, step numbers, quantities.
     Opt-in via `mono` so a text chip is unaffected. `tabular-nums` keeps columns of
     numbers aligned even on the fallback face. */
  .manager-chip.is-mono {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  /* Tone is colour ONLY — edge, foreground and fill. None of these touches the size. */
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

  /* Neutral recedes: it is the tone for a fact that is merely present, not a state the
     GM should read as good or bad. */
  .manager-chip.is-neutral {
    border-color: var(--fab-border);
    color: var(--fab-text-muted);
  }

  /* ROW density (issue 1096): the Checks Studio modifier row's in-line annotation chip
     — the bounds chip ("-1 to +5") and the "Rolls dice" chip — sits at a scale the
     prototype draws slightly taller and cooler than the manager-wide default: a 22px
     pill, 10px/600 text in the SECONDARY ink, on the raised `--fab-bg-2` surface. Values
     are read off `scripts/visual-parity`'s `modifier-row-bounds-chip` fixture, not
     chosen here. This is a VARIANT ON THE PRIMITIVE, not a caller override, for the
     reason `density` documents above: a caller COULD out-specify the base rule with its
     own unlayered `:global(...)` block, and one did, but a second implementation of the
     one chip's geometry is what issue 883 retired regardless of whether it renders
     correctly — `manager-layout.test.js`'s hand-rolled-chip ratchet enforces that this is
     the one place a chip's own geometry may be declared. Written after every tone rule so
     a call site that also sets `tone` still gets the row's own colour, though no call
     site does both today. `border` is unchanged from the base rule, so it is not
     restated here. */
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

  /* The colour DOT (issue 1036). One rule, painting the leading span from the
     `--fab-chip-color` the root sets inline. Named `manager-chip-swatch` rather than
     anything matching `manager-chip` on its own, because `manager-layout.test.js`'s
     hand-rolled-chip ratchet greps for that exact token and must stay at empty. */
  .manager-chip-swatch {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border: 1px solid color-mix(in srgb, var(--fab-chip-color) 60%, var(--fab-border));
    border-radius: 50%;
    background: var(--fab-chip-color);
  }

  /* An item TAG (issue 772). Purple, through the same `--fab-chip-color` + `color-mix`
     vehicle `.manager-availability-pill.is-tag` already uses, so the tag tone is defined
     once for the whole manager. `--fab-bg-3` stands in for the manager alias the retired
     `.manager-component-tag-toggle.is-on` rule mixed against (`--fab-mv2-surface-2` IS
     `--fab-bg-3`), because this component is area-agnostic and must reach theme root. */
  .manager-chip.is-tag {
    --fab-chip-color: var(--fab-purple);

    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
    color: var(--fab-text);
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-bg-3));
  }
</style>
