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
     `disabled`, `warning`, `info`, `danger`, `neutral`, `negative`, `accent`, `muted`,
     `secondary`, `tag`, or '' for the default neutral fill. Tone is colour only and never
     changes the size; a tone that resized would reintroduce the drift this component removes.
   - emphasis: '' (the shipped chip), 'outlined' or 'lit'. It is a SECOND AXIS and not an
     eleventh tone: `tone` says which family the chip belongs to, `emphasis` says HOW that
     family arrives. Anything else resolves to '', exactly as an unrecognised `tone` does, so a
     chip that does not ask for one is byte-identical to what shipped. Both rules are the last
     in the style block and carry the full notes.
     · 'outlined' — the chip as a FLAT PLATE rather than a tinted wash, for a badge that has to
       stand ON a panel of its own colour family (`proto:1313`).
     · 'lit' — the family's colour on the INK too, over a 16% wash of it and nothing else
       (issue 1371). The reference's lit world-tag chip is purple ink on a purple tint behind a
       purple edge (`proto:5401`, `proto:5665`); `tone="tag"` alone states the edge correctly,
       inks `--fab-text` and mixes its wash into the opaque `--fab-bg-3`. It applies to the two
       chips that declare a colour of their own — `tone="tag"` and any `swatch` — because those
       are the ones with a colour to be lit in; on any other chip the rule does not match and
       nothing moves.
   - mono: numerals in the mono face with `tabular-nums`, so columns of counts, DCs and
     quantities line up. Counts are mono everywhere in the manager.
   - struck: the MUTED VARIANT the design reference draws for a value that is switched off in
     the scope being read (issue 1371, maintainer parity round 4) — a dashed hairline, the
     `--fab-surface-soft` fill and a struck-through label (`proto:5692-5697`). It composes with
     `tone`, adding those three declarations and nothing else, so the two call sites pair it
     with `tone="muted"` and a muted chip that does NOT set it is byte-identical to what
     shipped. It is a BOOLEAN rather than a repaint of `tone="muted"` because that tone already
     has five callers with a different meaning — "unavailable", as in the complications
     section's `Salvage · n/a` — and striking those through would say they had been switched
     off by a GM. `rebuild-spec.md` D4.2 names this the `muted` variant; the prop is spelled
     `struck` only because the tone of that name is taken.
     Callers: the rules editor's world-tag group and the world Component entry's own world-tag
     run, which the reference paints identically.
   - icon: Font Awesome classes for a leading glyph, e.g. `fas fa-lock`.
   - swatch: a BARE `--fab-tag-*` palette key (`sage`, `mauve`, …) rendering a leading
     COLOUR DOT (issue 1036). The colour pill is a variant of the one chip rather than a
     tenth pill shape. It is deliberately NOT the `is-tag` fill treatment: `--fab-chip-color`
     is DECLARED inside `.manager-chip.is-tag` and consumed only by that rule, so setting it
     on a non-tag chip paints literally nothing — a declaration that renders as a no-op is a
     failed visual change, not a subtle one — and eight pastel fills down a dense library
     list is not what a colour pill should look like. `swatch` composes with every tone.
   - tint: a BARE `--fab-tag-*` palette key that inks the WHOLE chip — glyph and label — in
     that colour over the quiet surface behind the plain hairline (issue 1371 r18-colour,
     maintainer ruling M29). It is the reference's face for a row's essence dot
     (`proto:5502`: `background: var(--surface-soft); border: 1px solid var(--border);
     color: e.color`), and it is what lets an essence be drawn in the colour the Essence
     Catalogue gave it wherever it is drawn. It is validated exactly as `swatch` is and rides
     the same `--fab-chip-color` vehicle, so the two compose on one declaration; it is NOT the
     swatch, because a swatch says "this chip is ABOUT a colour" with a dot and a tint says
     "this chip IS that colour" with its ink. It states colour only and is written after every
     tone, so a tint on a toned chip wins the family; `emphasis="outlined"` still plates it and
     `emphasis="lit"` still washes it, because a tint declares the colour those two act on.
     A chip that does not ask for one is byte-identical to what shipped.
   - class: additional classes for a caller that also needs layout context from the
     global sheet (`manager-editor-tab-badge` positions a badge inside a tab button, for
     instance). Those rules sit at a higher specificity than this scoped block by
     design — see the note in the style block below.
   - element: bindable, the rendered DOM node. `bind:this` on a component yields the
     component INSTANCE, not its node, so a caller that must measure or focus the chip
     — `SearchablePopover` positions its popover off the trigger's bounding box and
     restores focus to it on close — has no other way to reach it.
   - density: 'default' (the manager's one chip scale), 'row' — the Checks Studio
     modifier row's own scale for an in-line annotation chip (the bounds chip, the
     "Rolls dice" chip), taken from the prototype (issue 1096) — 'list', a browser ROW's
     own in-line pill, which the reference draws smaller and quieter than either
     (`proto:4872`: a ~15px stadium at 9px/600 in the secondary ink on the soft surface) —
     'action', the page
     header's action cluster, where a chip stands in the same row as the Back / Delete /
     Save buttons and has to be one of them — 'tag-run', the scale of a chip that is a
     CONTROL a GM clicks rather than a badge they read (issue 1371) — or 'inspector', the
     browser inspector's `Tags in effect` run, which is the DEFAULT chip's height at the
     reference's own weight and inset rather than a fourth micro scale (its rule below carries
     the measurement). The reference draws
     every tag chip that way, on the world Component entry (`proto:5401`) and in the rules
     editor's world-tag and own-tag runs (`proto:5692`, `proto:5707`): `padding: 5px 12px`,
     `border-radius: 999px`, `font: 600 11px`, a pill roughly 25px tall against the default
     chip's 20. Two parity lanes measured that one mismatch as ~34 of the rules editor's 117
     drift lines and 10 of the entry's — the largest single cause on either screen. This
     block closes 5 of that 10 outright (corner, size, weight and both horizontal insets);
     the two vertical insets stay open by 1px under the spacing-scale deviation below, and
     the remaining 3 are the caller's `tone`, not this scale's.

     `tag-run` IS THE SCALE, NOT THE PAINT. The lit face the reference draws is its own purple at
     sixteen percent behind an edge of the same purple at fifty and a LABEL in that purple at full
     strength; that face is `tone="tag" emphasis="lit"`, and the second half of it is corrected
     here (issue 1371, parity round 5). This note used to say `tone="tag"` alone stated the whole
     of it. It does not, and the harness measured the difference rather than inferring it: that
     tone mixes its sixteen percent into the OPAQUE `--fab-bg-3` rather than into what is behind
     the chip, so the fill measures a grey-blue, and it inks the label `--fab-text` rather than
     the purple. The edge was right all along. `emphasis="lit"` states the other two. The unlit
     and switched-off faces stay `tone`/`struck`; keeping paint and scale on separate axes is what
     lets one run draw lit, unlit and struck chips at one size, which is what that run is.

     THE REFERENCE'S MICRO PILL IS ALREADY HERE, and is deliberately not a second value. Both
     lanes also asked for a `micro` scale for the `World catalogue` badge (`proto:1313`) and the
     salvage mode pill (`proto:5721`) at `padding: 2px 8px; border-radius: 999px; font: 600 9px`
     — which is `density="list"` above, to within one pixel of vertical padding. Adding a value
     a pixel from a shipped one is how a primitive drifts into two scales, which is the failure
     this component was extracted to end; `list` is the answer for both, and this note is here so
     the next lane does not re-derive the question. `styles/fabricate.css`
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
    emphasis = '',
    mono = false,
    struck = false,
    icon = '',
    swatch = '',
    tint = '',
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
  const safeSwatch = $derived(safePaletteKey(swatch));
  // The tint takes the same shape and the same discipline (issue 1371 r18-colour): a bare key
  // or nothing, never a value a caller composed.
  const safeTint = $derived(safePaletteKey(tint));
  // ONE declaration of the vehicle whichever of the two props set it. A swatch and a tint on
  // one chip name one colour, so the tint's key is taken when both are given — a chip that is
  // inked in a colour is that colour before it is about one.
  const chipColor = $derived(safeTint || safeSwatch);
  const swatchStyle = $derived(
    chipColor ? `--fab-chip-color:var(--fab-tag-${chipColor})` : undefined
  );

  /**
   * A bare `--fab-tag-*` palette key, or '' for anything that is not one. The key is interpolated
   * into a `style` attribute, so it is constrained to the shape a key can have; both spellings
   * are tolerated because `ManagerColorPicker` already accepts both.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function safePaletteKey(value) {
    const key = String(value || '').replace(/^--fab-tag-/, '');
    return /^[a-z0-9-]+$/.test(key) ? key : '';
  }

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
    // ACCENT (issue 1286): the chip is a real, chosen, ON state — the complications
    // section's "Applies to" chips are accent-when-on — and none of the nine tones above
    // could say it. `active`/`positive` is the SUCCESS family and reads as "this passed";
    // `tag` is the purple membership fill. The accent family already ships the four
    // tokens a chip tone needs (`-border`, `-text`, `-soft`), so this states the family
    // rather than inventing a treatment.
    'accent',
    // MUTED (issue 1286): an explicitly DIMMED, unavailable chip — "Salvage · n/a" on a
    // system whose salvage is not progressive. It is genuinely distinct from `neutral`,
    // which has two dozen call sites and is the RECESSIVE DEFAULT for a fact that is
    // merely present. The tone that reads "unavailable" today is `is-disabled` — and that
    // is joined to the WARNING family two rules below, so routing an n/a pill there would
    // paint it amber and read as a hazard the GM must act on.
    'muted',
    // An item TAG (issue 772). Tags are purple across the manager, and the component
    // editor's tag pill carried that colour in the global sheet before it converted onto
    // this component. Without the tone here, `TONES` would DROP `tag` silently at the
    // filter below and the purple would simply disappear: `positive` would re-colour tag
    // membership into the success family, `neutral` would erase the tag language, and a
    // `class=` override would re-derive the tone back in the global sheet.
    'tag',
    // SECONDARY (issue 1371): the quiet FACT pill. The reference's salvage mode pill
    // (`proto:5721`) is drawn by its own shared pill helper as the subtle surface behind a
    // plain hairline with the SECONDARY ink, and no tone here inks that. `neutral` is the
    // nearest and is genuinely a different statement: it inks `--fab-text-muted`, declares no
    // fill at all, and has two dozen callers meaning "a fact that is merely present". The mode
    // pill is a step louder than that — it names the rule the GM is reading, on a surface of
    // its own — and a step quieter than every semantic family.
    'secondary',
  ]);

  /**
   * The emphasis vocabulary, closed for the same reason `TONES` is: an unrecognised value
   * renders the SHIPPED chip rather than emitting an `is-*` class the style block does not
   * paint, so a typo shows up as the default rather than as a declaration that silently does
   * nothing. It is a `Set` rather than a ternary because the style block's mirror is guarded by
   * a test that reads this literal, exactly as the tone matrix reads `TONES`.
   *
   * @type {ReadonlySet<string>}
   */
  const EMPHASES = new Set(['outlined', 'lit']);

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
      // `is-tag-run`, NOT `is-tag`: the tone of that name is already taken, and a class list is
      // matched by whole token, so the scale and the purple tone compose on one chip without
      // either reaching the other's rules.
      density === 'tag-run' ? 'is-tag-run' : '',
      density === 'inspector' ? 'is-inspector' : '',
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
  {...rest}
  >{#if safeSwatch}<span
      class="manager-chip-swatch"
      data-chip-swatch={safeSwatch}
      aria-hidden="true"
    ></span>{/if}{#if icon}<i class={icon} aria-hidden="true"
    ></i>{/if}{@render children?.()}</svelte:element
>

<style>
  /* Theme-root tokens ONLY. NO scoped `<style>` may reference `--fab-manager-*`, or any other
     custom property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY
     directory — a component is placed in a directory, not in a DOM subtree, so its scoped CSS
     cannot guarantee where its host renders, and `tests/token-generation-gate.test.js` reds the
     reference wherever it is written. Outside the manager —
     `.fabricate-app`, `.fabricate-admin`, `.fabricate-interactables-manager` — such a
     property is not in scope, the declaration becomes invalid at computed-value time and
     the colour silently falls back to inheritance. Nothing fails; it just looks wrong, and
     the trigger is exactly the reuse this primitive exists to enable. Every token below is
     declared in `:root` or in all seven `.fabricate[data-fabricate-theme="…"]` blocks,
     which every Fabricate surface carries. */

  /* A NOTE ON LAYERS FIRST, THEN SPECIFICITY, because the two used to be written here the
     other way round and the order is the whole of it (corrected in issue 1118). The `density`
     note in this component's props block already had it right; this one did not, and both are
     load-bearing, so they now say the same thing.

     LAYERS DECIDE. `module.json` gives `styles/fabricate.css` no explicit layer, so Foundry
     imports it at `layer(modules)` — `tests/view-lab/cascade.css` mirrors that, and
     `vite.config.js` strips the JS-side import from the production build, so it is the only
     way the sheet loads in the product. `css: 'injected'` (svelte.config.js) puts THIS block
     in `document.head` unlayered, and an unlayered author declaration beats every layered one
     at ANY specificity. So a global rule that restates a property declared below cannot win,
     however many classes it is written with. Measured, not reasoned: with the sheet layered,
     `.manager-header-actions .manager-chip { min-height: 34px }` at three classes leaves the
     chip at this block's 20px; unlayered, the same markup reports 34px. Two such rules were
     retired from the header cluster in issue 1118 for exactly that reason, and
     `styles/fabricate.css` records the same finding from a parity run at
     `.manager-checks-card .manager-modifier-readonly-expression`.

     SPECIFICITY DECIDES ONLY AMONG UNLAYERED RULES — which is to say, among this block and
     other components' scoped blocks. Svelte compiles these selectors to
     `.manager-chip.svelte-<hash>`, two classes, (0,2,0). A CALLER's own `:global(...)` rule
     is unlayered too, so at three classes it does out-specify this block and render, which is
     what `CraftingModifierCatalogueCard.svelte` did before `density` existed. That is still a
     second implementation of the one chip's geometry, which is what issue 883 retired and
     what `manager-layout.test.js`'s hand-rolled-chip ratchet exists to catch.

     What legitimately remains in the global sheet is what this block cannot reach and does
     not declare: the chip's POSITION inside a parent's layout. Not its geometry — a chip that
     must be a different size in one context takes a variant prop here, as `density="row"`
     does. `.fabricate-manager .manager-chip.manager-vocabulary-chip-unused` is written at
     three classes and states `color`/`background`, which this block also declares, so it is
     in the same position the header rules were in: a candidate for the same treatment rather
     than an example to copy. */

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

  /* SECONDARY (issue 1371): the quiet FACT pill, one step louder than `neutral` above and one
     step quieter than every semantic family. `proto:5721` draws the rules editor's salvage
     mode pill through the prototype's shared pill helper with exactly these three: the subtle
     surface, a plain `--fab-border` hairline and the SECONDARY ink. `--fab-text-secondary` IS
     that reference's own secondary ink token, the same equivalence `StatusPill`'s outlined
     emphasis rests on, so this states a token rather than approximating a colour.

     THREE DECLARATIONS AND NO GEOMETRY, like every tone here. The mode pill's SCALE is
     `density="list"` — see the micro-pill note in the props block above, which settles both of
     the reference's micro pills onto that one value rather than adding a scale a pixel from a
     shipped one. */
  .manager-chip.is-secondary {
    border-color: var(--fab-border);
    color: var(--fab-text-secondary);
    background: var(--fab-surface-soft);
  }

  /* ACCENT (issue 1286): the chosen-ON chip. `--fab-accent-text` rather than `--fab-accent`
     is the ink, for the reason that token was added at all — the raw accent over
     `--fab-accent-soft` measures under AA in `ironblood-forge`, and every other semantic
     family here already inks its soft fill with its own `*-text`. */
  .manager-chip.is-accent {
    border-color: var(--fab-accent-border);
    color: var(--fab-accent-text);
    background: var(--fab-accent-soft);
  }

  /* MUTED (issue 1286): dimmed and unavailable — an outline with the disabled ink and NO
     fill, so it recedes behind every toned chip beside it without borrowing the warning
     family's alarm. Deliberately not `opacity`: an opacity on the chip would also fade a
     leading glyph and any swatch dot to a different degree than the label, and it composes
     unpredictably with a caller's own container opacity. */
  .manager-chip.is-muted {
    border-color: var(--fab-border);
    color: var(--fab-text-disabled);
    background: none;
  }

  /* THE MUTED VARIANT (issue 1371): a value switched off in the scope being read. Written
     AFTER every tone rule so it wins the three properties it states over whichever tone the
     caller paired it with, and states only those three — the tone still owns the ink, so a
     muted-toned struck chip keeps `--fab-text-disabled` and an info-toned one would keep the
     info ink. `border-style` rather than the `border` shorthand, so the tone's own
     `border-color` survives. */
  .manager-chip.is-struck {
    border-style: dashed;
    background: var(--fab-surface-soft);
    text-decoration: line-through;
  }

  /* The strike must not cross the leading glyph: `text-decoration` inherits into the `<i>`,
     and an eye-slash with a line through it reads as a broken icon rather than a muted tag. */
  .manager-chip.is-struck > i {
    text-decoration: none;
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

  /* LIST density (issue 1373): a browser ROW's in-line pill — the Tool Rules list's breakage
     and state pills, and the same construction on every list the reference draws.
     `proto:4872` states it exactly: `padding: 1px 8px; border-radius: 999px; background:
     var(--surface-soft); border: 1px solid var(--border); font: 600 9px var(--sans); color:
     var(--text2)`, a stadium about 15px tall.

     THE DEFAULT SCALE IS FIVE PIXELS TALLER AND A WEIGHT HEAVIER than that, which is a lot on
     a chip that sits under a 13.5px row name and is meant to read as an annotation of it. The
     row was carrying two chips at nearly the height of the name above them.

     A VARIANT ON THE PRIMITIVE, not a caller override, for the reason `density` documents
     above — and here that reason is enforced rather than advisory: `manager-layout.test.js`
     asserts in terms that `.manager-tools-library-chips .manager-chip` must not exist in the
     global sheet, and its hand-rolled-chip ratchet fails on the token appearing anywhere in a
     manager `.svelte` other than this one. Both directions are closed on purpose; this prop is
     the door that is open.

     `min-height: 0` is required and is not slack. The base rule's 20px floor is a MINIMUM, so
     restating padding and font-size alone would leave the pill exactly as tall as it was.
     The base rule already draws the 1px `--fab-border` edge, so only the corner is restated.

     SIZE ONLY, and no colour, which is the mirror image of the rule this block's neighbours
     state for a tone. `proto:4872` also names `--surface-soft` and `--text2`, and those two
     are withheld deliberately: the same list draws a `danger`-toned pill for a Tool that needs
     attention, and a density that painted a fill and a foreground would flatten that tone into
     the neutral one. The difference between the base chip's fill and the design's is a single
     percentage point of the same overlay; the difference between an amber warning and a
     neutral pill is the whole message. */
  .manager-chip.is-list {
    min-height: 0;
    /* `1px` is the spacing scale's documented hairline exemption; `8px` is its own step. */
    padding: 1px var(--fab-space-2);
    border-radius: 999px;
    font-size: 9px;
    font-weight: 600;
  }

  /* ACTION density: a chip standing in the page header's action cluster.
     
     THE ROW CENTRES ITS CHILDREN, so a 20px chip beside 34px buttons floated in the middle
     of the group and read as a stray label rather than as the first member of it — which is
     where every Core editor and every companion drill-down puts its own `Unsaved`. Measured
     in Chromium against the composed page, not reasoned: 20px against 34px.
     
     34px IS THE BUTTON'S OWN FIGURE, from `.fabricate-manager .manager-button` in
     `styles/fabricate.css`. It is restated here rather than read, because there is nothing to
     read it from: a `min-height` in a layered sheet cannot be inherited by an unlayered block,
     and the two are decided in different places by different layers. What keeps them equal is
     `manager-header-geometry.test.js`, which measures BOTH in one composed page and fails
     naming the pair — a duplicated figure with a gate on it, rather than a duplicated figure
     with a comment on it.
     
     THIS IS A VARIANT ON THE PRIMITIVE, not a caller override, for the reason `density`
     documents above — and here that reason is not theoretical. Two global rules claimed this
     exact geometry (`min-height: 34px` at three classes, `min-height: 38px` at four) and both
     were inert, because the sheet is layered and this block is not; issue 1118 retired them
     rather than arbitrating them. A third attempt written the same way would be inert in the
     same way.
     
     The radius is left at the base rule's 10px. The retired rules asked for 999px and 6px
     between them, which is two answers to a question the design does not put: the base chip's
     corner is the chip's corner, and a header chip is a chip. */
  .manager-chip.is-action {
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    white-space: nowrap;
  }

  /* TAG-RUN scale (issue 1371): the chip that is a CONTROL. `proto:5401` states it as
     `padding: 5px 12px; border-radius: 999px; font: 600 11px`, and every one of those but the
     vertical padding is written here verbatim.

     THE 5px SNAPS TO `--fab-space-chip` (6px). 5 is off the published 4px spacing scale, which
     `openspec/specs/ui-integration/spec.md` makes normative and
     `tests/components/spacing-scale-ratchet.test.js` enforces as a ratchet — a gate, not a
     preference — so the choice is between the scale's 4px step and its 6px dense optical step.
     6px is the nearer of the two once the reference's line box is accounted for: it authors no
     `line-height`, so its 11px text lays out at ~13.2px and the pill measures ~25.4px tall,
     against 25px here and 21px at 4px. The horizontal 12px is `--fab-space-3` exactly.

     NO `min-height`, unlike `is-list` above, and that is a measurement rather than an omission:
     6 + 6 + 11 + 2 is 25px, already clear of the base rule's 20px floor, so restating the floor
     would change nothing and would read as though it did.

     SIZE ONLY. The lit purple face is `tone="tag"` and the switched-off face is `struck`; this
     block and those two share not one property, so all three compose without an ordering
     argument. A scale that also painted would flatten a run whose whole job is to show three
     different states at one size. */
  .manager-chip.is-tag-run {
    padding: var(--fab-space-chip) var(--fab-space-3);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }

  /* INSPECTOR density (issue 1371): the component browser inspector's `Tags in effect` run.
     `proto:5663` and `proto:5665` draw both halves of that run — the tags a component inherits
     from the world classification, and the ones a system sets itself — at one geometry:
     `padding: 3px 9px; border-radius: 999px; font: 600 10px`.

     IT IS NOT A FOURTH MICRO SCALE, and that is a measurement rather than a preference. The
     reference's pill is the SAME HEIGHT as the shipped default — its unauthored line box puts a
     10px face at roughly 12px, so 3 + 12 + 3 plus the hairline is about 20px, which is exactly
     the base rule's floor — so what a parity lane actually measured as open is TWO properties,
     not a size: the base scale's `font-weight: 700` against the reference's 600, and its
     `--fab-space-chip` horizontal inset against a wider one. `is-list` (15px) and `is-tag-run`
     (25px) are both a different pill; this is the default pill, spoken more quietly.

     THE OTHER TWO DECLARATIONS ARE NOT RESTATEMENTS of the base rule, which is why they are
     written rather than omitted the way `is-tag-run` omits its floor. The base rule's 10px
     corner and this 999px are IDENTICAL on one line — 999px clamps to half the shorter side —
     and diverge the moment a long tag name wraps, where the reference draws a stadium. And
     `0.62rem` tracks the host document's root font size while the reference's 10px does not,
     so the two agree in the manager and can disagree wherever else this primitive is reused.

     THE DEFAULT SCALE DOES NOT MOVE, which is the whole reason this is a density and not an
     edit to the base rule. That rule is what 60-odd call sites render, and one run's parity
     finding is not a mandate to restyle all of them.

     BOTH INSETS SNAP TO THE PUBLISHED SCALE. 3px and 9px are off the 4px scale
     `openspec/specs/ui-integration/spec.md` makes normative and
     `tests/components/spacing-scale-ratchet.test.js` enforces as a ratchet — a gate, not a
     preference — so the vertical takes `--fab-space-1` (4px, one more) and the horizontal
     `--fab-space-2` (8px, one less). Neither snap can move the rendered height: 4 + 10 + 4 is
     18px, still under the base rule's 20px floor, so the pill measures 20px either way.

     GEOMETRY AND TYPE ONLY, no colour, for the reason `is-list` and `is-tag-run` state above
     and which this run makes vivid: its two halves are deliberately DIFFERENTLY toned, and a
     density that painted a fill would flatten the distinction the run exists to draw. */
  .manager-chip.is-inspector {
    padding: var(--fab-space-1) var(--fab-space-2);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
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
     once for the whole manager. `--fab-bg-3` is the shade the retired
     `.manager-component-tag-toggle.is-on` rule mixed against, named here as the theme-root
     token it is, on the same rule as the block above: a scoped `<style>` may reach no
     area-scoped property from any directory, whatever its own reuse looks like. */
  .manager-chip.is-tag {
    --fab-chip-color: var(--fab-purple);

    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
    color: var(--fab-text);
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-bg-3));
  }

  /* THE TINT (issue 1371 r18-colour, maintainer ruling M29): the chip inked in ITS OWN colour.

     `proto:5502` draws a row's essence dot as `background: var(--surface-soft); border: 1px solid
     var(--border); color: e.color` — the essence's colour on the glyph AND the numeral, over the
     quiet surface, behind the plain hairline. Three declarations, and every one of them is a
     colour: the tint is an axis like `tone`, and a tint that resized would reintroduce the drift
     this component was extracted to end.

     IT READS `--fab-chip-color`, the vehicle the tag tone and the swatch dot already share, which
     the root sets INLINE from the validated key. That is why this rule can be one selector rather
     than eight: the palette arrives as a token name and the theme resolves it, so a theme swap
     re-inks every tinted chip without this block naming a single palette entry.

     WRITTEN AFTER EVERY TONE, and that is the whole of its cascade argument. Each tone is (0,2,0)
     and so is this; a caller that pairs a tone with a tint asks for the tint, so the tint has to
     be the later rule. `is-outlined` and the lit pair stand after it in turn, because both act ON
     a chip's declared colour — the plate keeps this ink and edge and takes back the fill, and the
     lit face keeps this ink and washes the fill — so a tint written after either would undo the
     emphasis the caller also asked for.

     The label keeps the palette colour as its INK, and that is a measured decision rather than a
     stylistic one: `tests/components/essence-chip-rendered.test.js` renders this face in Chromium
     under every theme block the sheet declares, for every tint the picker offers, and holds the
     composited label above 4.5:1. */
  .manager-chip.has-tint {
    border-color: var(--fab-border);
    color: var(--fab-chip-color);
    background: var(--fab-surface-soft);
  }

  /* THE OUTLINED EMPHASIS (issue 1371): the chip as a FLAT PLATE.

     `proto:1313` draws the world Component entry's `World catalogue` badge INSIDE an
     `info-soft` callout, and does not tint it: the badge is a flat `--bg1` surface behind an
     info hairline with info ink, so it reads as a different surface sitting ON the panel.
     `tone="info"` alone cannot say that. It would put an `info-soft` fill on an `info-soft`
     callout — measured equal, not estimated equal, by a parity run that reported no background
     drift between the two — and the badge would dissolve into the panel it is meant to stand
     on. That is the defect, and no combination of the ten tones closes it, because every one of
     them paints a wash.

     SO EMPHASIS IS A SECOND AXIS, not an eleventh tone. `tone` says which FAMILY the chip
     belongs to; `emphasis` says whether that family arrives as a wash or as a plate. ONE
     declaration expresses the whole of it, because the tone rules above already state the edge
     and the ink it needs: `tone="info" emphasis="outlined"` is `--fab-info-border` and
     `--fab-info-text` on `--fab-bg-1`, and a toneless outlined chip keeps the base rule's
     `--fab-border` and `--fab-text`. Eleven tones times one rule, rather than eleven more rules
     — and a tone added later is outlined for free.

     IT IS THE MIRROR OF `StatusPill`'s EMPHASIS OF THE SAME NAME, and the axis it supersedes is
     the OPPOSITE one. Stating that plainly because the shared prop name invites the assumption
     that the two are the same declarations: that pill's outlined emphasis neutralises the EDGE
     and the INK and keeps the tone's fill, because its reference draws one neutral attribution
     badge whatever state it annotates (`proto:834`); this one neutralises the FILL and keeps
     the tone's edge and ink, because its reference draws a coloured badge that must not melt
     into a coloured panel. What the two genuinely share is the meaning of the word — a
     hairline-edged plate rather than a tinted wash — which is why this is that prop's second
     value and not a differently named prop.

     WRITTEN LAST IN THE BLOCK, and that ordering is load-bearing rather than tidy. Every tone
     rule is (0,2,0), as this is, so order decides the fill; `is-tag` immediately above is the
     final tone rule and the only one whose fill is a `color-mix` rather than a token, so an
     emphasis written anywhere earlier would be beaten by that tone alone and the purple tag
     chip would be the one shape the plate did not reach. `is-struck` also states a fill and
     also sits earlier, so a struck outlined chip keeps its dashed edge and its line-through and
     takes the plate — the composition this axis promises, though no caller pairs the two
     today. */
  .manager-chip.is-outlined {
    background: var(--fab-bg-1);
  }

  /* THE LIT EMPHASIS (issue 1371, parity round 5, UX finding F10): the chip's own colour on the
     INK as well as on the edge, over a wash of that colour and nothing else.

     WHAT IT CLOSES. The reference's lit world-tag chip is one colour said three ways — the
     `--fab-purple` token at sixteen percent on the fill, at fifty on the edge, and at full
     strength ON THE LABEL (`proto:5401`, `proto:5665`). The shipped `tone="tag"` states the edge
     at fifty and is exactly right; it states the FILL as that purple at sixteen mixed into the
     OPAQUE `--fab-bg-3`, and the ink as `--fab-text` — so a parity run measured the entry's tag
     chip as a grey-blue fill under a cream label against a purple tint under a purple one. Two of
     those three lines are this rule; the third was never wrong.

     WHY IT IS NOT AN IN-PLACE REPAINT OF `is-tag`. That tone has shipped callers on other
     screens, and a shared primitive that takes a second site's treatment takes a PROP rather than
     an edit — the standing rule this whole round is applying. `emphasis` is the axis that already
     says how a family arrives, so this is its second value rather than a thirteenth tone.

     IT READS `--fab-chip-color`, AND IT IS SELECTED ON THE CLASSES THAT DECLARE ONE — the tag
     tone, the `swatch` dot and, since issue 1371 r18-colour, the `tint`. That property is the
     vehicle the three share, and it is the whole of this emphasis's generality: a chip has to
     have a colour of its own before it can be lit in it. Writing the precondition into the
     SELECTOR rather than into a `var()` fallback is the
     honest form — `background: color-mix(…, var(--fab-chip-color, <something>) 16%, transparent)`
     is a mix whatever the fallback is, so a toneless lit chip would lose its fill to a 16% wash
     of it rather than keep it. Unmatched is the only genuine no-op, which is `Medallion`'s
     `has-tint` reasoning applied one component over.

     WRITTEN LAST, AFTER `is-outlined`, and that is load-bearing exactly as its neighbour's own
     note says: every tone rule is (0,2,0) and decides its fill by order, so a rule that repaints
     `is-tag`'s fill must stand after it. At (0,3,0) these two selectors also beat `is-outlined`
     outright, which is correct — a plate and a wash are the two answers to one question, so the
     two emphases are alternatives rather than a composition, and no caller pairs them. */
  .manager-chip.is-tag.is-lit,
  .manager-chip.has-swatch.is-lit,
  .manager-chip.has-tint.is-lit {
    color: var(--fab-chip-color);
    background: color-mix(in srgb, var(--fab-chip-color) 16%, transparent);
  }
</style>
