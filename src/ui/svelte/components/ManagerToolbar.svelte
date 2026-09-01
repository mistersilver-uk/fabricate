<!-- Svelte 5 runes mode -->
<!--
  THE manager's filter bar (issue 1039).

  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────
  `openspec/specs/design-system/spec.md`'s browse archetype names "the filter bar" as
  a fixed element of every browse screen, and until this component the bar was a CSS
  CONVENTION: write `class="manager-toolbar"` on a `<section>` and the sheet gives you
  the `--fab-space-3` padding, the hairline bottom rule, the `--fab-overlay-light-03`
  fill and the wrapping flex row (`fabricate.css:5657` for the box, `:5671` and `:5679`
  for the row). Eleven sites across eleven components wrote that out by hand.

  ── ONE HOST, AND THE CENSUS THAT ESTABLISHED IT ──────────────────────────────────
  All eleven sites are a `<section>`. That was measured by walking each component's
  Svelte AST rather than by grep, because a `class` attribute on its own line, a
  multi-line attribute list or a template-literal `class` all defeat a line-based
  census — `StatusToggle`'s found three element shapes and needed an `as` prop, and
  `InspectorCard`'s found one and rightly refused one. This census found one, so there
  is no polymorphism prop here either.

  A raw grep says TWELVE. It is wrong, and the reason is worth stating because the
  same regex will be written again: `GatheringTaskEditView.svelte:1784` is a
  `.manager-toolbar-pills` chip row on a `<div>`, and `\b` matches before a hyphen, so
  a `\b`-terminated token pattern counts it. A class-token pattern has to end
  `(?![\w-])`. `tests/helpers/primitiveSourceContract.js` matches on that boundary for
  the same reason.

  ── WHAT THIS COMPONENT DOES NOT OWN, AND WHY ─────────────────────────────────────
  THE ROW DIV IS NOT SWALLOWED. Four bars wrap their controls in a row class —
  `manager-component-filter-row`, `manager-essence-filter-row`,
  `manager-recipe-filter-row` and `manager-scoped-list-filter-row` — and the Component
  and Recipe studios render THREE such rows each (the base row, `.is-secondary` and
  `.is-chips`). More importantly the row class is a SHARED SEAM already:
  `BulkSelectionToolbar.svelte:116` renders `<div class="{rowClass} is-selection">` in
  its OWN template, which is how spec.md's "the selection bar replaces the filter bar
  in place" is built. `EssenceBrowserView.svelte:527-536` records that contract
  breaking once already — a row rule authored in the essence view's scoped block never
  reached the primitive's div, and the selection row shipped with no row metrics at
  all. A bar that rendered the row itself would have to re-decide that, so it renders
  its children and nothing else.

  THE FILTER CONTROL IS NOT PICKED. Across the eleven bars the control beside the
  search field is three different things — `<label class="manager-filter"><select>`
  (16 sites), a bare `<select>` carrying its own accessible name (2), and a
  segmented control (2, at `EssenceBrowserView.svelte:289` and
  `RecipesBrowserView.svelte:468`). `library.html:1233` sketches a `<FilterBar>` that
  owns `toggles`, `selects`, `segments` and `sort` as DATA; the shipped corpus has
  three control vocabularies and no bar in a position to choose between them, so this
  primitive takes a slot. See the manifest row and `ui-integration/spec.md`.

  NO VARIANT PROP. The sheet paints four further treatments and they are not one
  vocabulary: `.manager-environments-toolbar` and `.manager-task-toolbar` cap the bar
  at 100px and 112px and scroll it (`fabricate.css:5684`, `:5689`);
  `.manager-scoped-list-toolbar` is sized from a SCOPED rule in
  `scoped/EntityListInspectorFrame.svelte` rather than from the sheet at all; and
  `.manager-toolbar:not(:has(.manager-toolbar-primary))` (`:5679`) switches the bar
  from grid to flex — a branch that is ALWAYS taken, because no component under `src/`
  writes `.manager-toolbar-primary`, measured, so the grid form at `:5671` is declared
  and never rendered. Every modifier therefore travels as a pass-through on `class`,
  spelled as it is spelled today.

  It deliberately has no scoped `<style>`, for `ManagerButton.svelte`'s,
  `IconButton.svelte`'s and `InspectorCard.svelte`'s reason: the bar is painted by
  `styles/fabricate.css` under `.fabricate-manager`, and a scoped block here would be a
  second source of truth for the same box. The consequence is theirs too — this is a
  MANAGER primitive, and dropped into `.fabricate-app` it renders as an unstyled
  `<section>`. That consequence is not reached in the product today: no player-app
  component renders a filter bar.

  It is an IMPORT-FREE LEAF, like `Stepper`, `IconButton` and `InspectorCard`: props
  only, no `foundryBridge`, no util imports. Callers pass an ALREADY-LOCALIZED
  `ariaLabel`. One util import inside a leaf propagates a required raw-module entry
  into every mount harness that compiles anything rendering it, and an omission there
  is reported as `# cancelled` rather than `# fail` — see the measured account in
  `tests/components/mounted-harness-primitive-allowlist.test.js`.

  ── THE ACCESSIBLE NAME IS A NAMED PROP, NOT A REST KEY ───────────────────────────
  A `<section>` is a `region` landmark only while it has an accessible name; without
  one it is a generic grouping element and drops out of the landmark list entirely. All
  eleven hand-rolled bars carried an `aria-label` and nothing made them. Passing it
  through the rest spread would have kept that a convention, so it is a named prop and
  `tests/components/manager-filter-bar-source-contract.test.js` asserts every call
  site passes it.
  That is the clause that earns this primitive its own guard file, exactly as the
  accessible-name clause earns `IconButton`'s.

  Props:
   - children: the bar's contents. A snippet, because the bar is a container: its rows,
     its search field and its filter controls are whatever the screen writes.
   - ariaLabel: the landmark's accessible name, already localized. Required in
     practice and gated by the source contract.
   - class: an EXTRA class, appended to the primitive's own, never a replacement. It
     has to be a named prop rather than a rest key, because the rest spread lands after
     `class={classes}` and a `class` passed through it would REPLACE `manager-toolbar`
     outright — silently un-barring the section while every `data-*` selector in the
     tests kept resolving.

     Before writing a rule against it, read `InspectorCard.svelte`'s note on the same
     prop. A scoped `<style>` rule in the CALLING component stops reaching the element
     the moment that site converts, and on Svelte 5.56.3 that is usually SILENT: a rule
     survives with the hash attached and matching nothing whenever the same component
     also writes a regular element carrying a spread or an expression-valued `class`.
     One rule died to this conversion —
     `scoped/EntityListInspectorFrame.svelte`'s `.manager-scoped-list-toolbar { flex: 0
     0 auto }` — and it is repaired as `:global(.manager-toolbar.manager-scoped-list-toolbar)`,
     chained so its specificity is unchanged at (0,2,0).

  Every other attribute — `data-*` hooks, `tabindex`, `id` — is forwarded through the
  rest spread onto the `<section>`, so a call site keeps its own selectors and the
  three browsers keep the `tabindex="-1"` landmark the manager root focuses.

  ── ONE TRAP THE REST SPREAD CARRIES ──────────────────────────────────────────────
  A BARE `data-*` attribute on a COMPONENT tag is the boolean `true`, not the empty
  string it is on an element. `<section data-recipe-toolbar>` renders
  `data-recipe-toolbar=""`; `<ManagerToolbar data-recipe-toolbar>` spreads `true` and
  renders `data-recipe-toolbar="true"`. Four of the converted attributes were written
  bare and every one is spelled `data-…=""` at its call site for that reason. Presence
  selectors resolve either way, which is precisely why this would not have been caught
  by the suites and smoke steps that use them.
-->
<script>
  let {
    children = undefined,
    // The landmark's accessible name, already localized. Named rather than spread because a
    // `<section>` with no accessible name is not a `region` landmark at all.
    ariaLabel = undefined,
    // An EXTRA class, appended to the primitive's own — never a replacement for it. It has to
    // be a named prop rather than a rest key: the rest spread lands after `class={…}` in the
    // markup, so a `class` passed through it would REPLACE `manager-toolbar` outright and
    // silently un-bar the section while every `data-*` selector in the tests kept resolving.
    class: extraClass = '',
    ...rest
  } = $props();

  const classes = $derived(['manager-toolbar', extraClass].filter(Boolean).join(' '));
</script>

<section class={classes} aria-label={ariaLabel} {...rest}>{@render children?.()}</section>
