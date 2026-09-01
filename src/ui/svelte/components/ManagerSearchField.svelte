<!-- Svelte 5 runes mode -->
<!--
  THE manager's search field (issue 1039).

  ── WHY IT IS A SECOND COMPONENT AND NOT PART OF THE BAR ──────────────────────────
  `library.html:1233` sketches ONE `<FilterBar>` owning `query` and `onQueryChange`, so
  the obvious extraction is a bar that renders its own field. The corpus says
  otherwise, and the number is the argument: of the 23 sites writing
  `class="manager-search"`, THIRTEEN are inside no `.manager-toolbar` at all — the
  gathering task editor's four, the access and knowledge rosters, both realm-environment
  columns, the Tool Studio's library card, the vocabulary panel's search row, the world
  scope's system-rules roster and the manager root's two. A field folded into the bar would have forced a bar around each
  of them, which is a redesign of nine screens rather than an extraction. The bar has
  eleven sites and one of them (`BooksScrollsView.svelte:279`) has no field at all.
  Two components with an eleven-and-nineteen split is what the tree contains.

  Before this component the field was a CSS CONVENTION: `class="manager-search"` on a
  `<label>` wrapping an `<i class="fas fa-search">` and an `<input type="search">`, and
  `styles/fabricate.css` turns that into the relative box and its `1 1 260px` basis
  (`:5714`), the 34px pill with its 34px side padding (`:5730`) and the absolutely
  positioned leading glyph (`:5858`).

  ── ONE HOST, AND THE CENSUS THAT ESTABLISHED IT ──────────────────────────────────
  All 23 sites are a `<label>`, measured by walking each component's Svelte AST rather
  than by grep — two of them write `class` on its own line, which a line-based census
  reports the wrong host for. The set is of size one, so there is no `as` prop, for
  `InspectorCard.svelte`'s reason.

  The leading glyph is `fas fa-search` at every site this component covers, so it is
  WRITTEN HERE rather than taken as a prop. The one site in the corpus that swaps it —
  `GatheringTaskEditView.svelte:1746`, which uses `fa-tags` — is an adjudicated
  opt-out below, so an icon prop would be a seam against a variation set of one.

  ── THE THREE SITES THIS COMPONENT DELIBERATELY DOES NOT COVER ────────────────────
  Three of the 23 are COMBOBOXES wearing this class. `GatheringTaskEditView.svelte:1747`
  and both `CraftingSystemManagerRoot.svelte` sites (`:12051`, `:12460`) render a
  `.manager-tag-suggestions` typeahead list as a SIBLING of the input, inside the
  label, and the first also swaps the glyph. They match the CSS and not the meaning:
  what they are is `SearchablePopover.svelte`'s surface, and absorbing a suggestion
  list into a plain field would make this primitive own two meanings at once.

  The two root sites carry a second, harder disqualifier that is worth naming because
  it is structural rather than editorial: both write `bind:this={characterModifierSearchAnchor}`
  on the label, because the popover positions itself against that element. `bind:this`
  on a COMPONENT tag binds the component instance, not its host element, so converting
  either one needs an element-ref seam this primitive does not have and should not grow
  for two callers.

  ── FIVE HAND-ROLLED TWINS ARE OUT OF SCOPE, RECORDED RATHER THAN CONVERTED ───────
  `GatheringPartiesTab.svelte:259` and `PartyAddMemberPanel.svelte:136` render a `<div>`
  with a `fa-magnifying-glass` glyph and a bare `<input>`;
  `recipe-item/RecipeItemLimitsTab.svelte:531` and `:631` render
  `class="manager-tag-search"` with `role="combobox"`; and
  `GatheringEconomyView.svelte:449` is a bare `<input type="search">` with no wrapper
  and no icon. None of them writes `manager-search`, none is painted by the rules
  above, and each would be a re-skin rather than a conversion — a change with visible
  output and its own review. They are named here so their absence is a decision.

  ── NO SCOPED STYLE, AND WHY ──────────────────────────────────────────────────────
  Like `ManagerButton`, `IconButton` and `InspectorCard`, this leaf has no scoped
  `<style>`: the pill is painted by `styles/fabricate.css` under `.fabricate-manager`,
  and a scoped block here would be a second source of truth for the same control.
  It is a MANAGER primitive; dropped into `.fabricate-app` it renders as an unstyled
  `<label>`. That consequence is not reached today — the player apps' four search
  inputs are hand-rolled and write none of these classes.

  It is an IMPORT-FREE LEAF: props only, no `foundryBridge`, no util imports. Callers
  pass ALREADY-LOCALIZED `placeholder` and `ariaLabel`.

  ── THE ACCESSIBLE NAME IS A NAMED PROP ───────────────────────────────────────────
  The `<label>` wraps an icon and an input and NO text, so it contributes no accessible
  name; every one of the 20 converted sites names the control with an `aria-label` on
  the input instead. Nothing made them, and an unnamed search box is announced as
  "search" and nothing else. It is therefore a named prop, and
  `tests/manager-search-field-source-contract.test.js` asserts every call site passes
  it — the clause that earns this primitive its own guard file.

  Props:
   - value: the current query. `$bindable`, because ten of the nineteen sites bound it
     directly and converting those to a callback would be a behavioural rewrite rather
     than an extraction.
   - onInput(next, event): called after `value` is updated, for the nine sites that do
     something more than store the string — resetting a pager is the common one.
   - placeholder / ariaLabel: already localized. Both are present at all 19 sites.
   - compact: emits `is-compact`, the 32px-tall `min(220px, 30%)` density
     (`fabricate.css:15183`). Three converted sites take it, all in the gathering task
     editor. A boolean rather than a `density` string because the sheet declares
     exactly two states and the base one is the absence of the class.
   - class: an EXTRA class, appended after the primitive's own and after `is-compact`,
     which is the order all 22 hand-rolled sites already wrote
     (`manager-search is-compact manager-task-component-tag-search`,
     `manager-search manager-access-roster-search`), so every converted site emits a
     byte-identical `class` attribute. It has to be a named prop rather than a rest
     key, because the rest spread lands after `class={classes}` and a `class` passed
     through it would REPLACE the token outright.
   - inputAttrs: attributes for the INPUT rather than for the label. Four sites hang a
     `data-*` hook there — `data-access-search`, `data-knowledge-search`,
     `data-scoped-list-search` and `data-access-roster-search={section.key}` — and the
     rest spread cannot reach it, because the rest spread belongs to the host. Spread
     rather than a `*Attr` name prop in `BulkSelectionToolbar`'s style because one of
     the four carries a VALUE rather than the empty string, which a name prop cannot
     express.

  Every other attribute — the two label-level `data-*` hooks, `id` — rides the rest
  spread onto the `<label>`.

  ── ONE TRAP EACH SPREAD CARRIES ──────────────────────────────────────────────────
  A BARE `data-*` attribute on a COMPONENT tag is the boolean `true`, not the empty
  string it is on an element, and an `inputAttrs` entry written `{ 'data-x': true }`
  does the same thing. `<label data-knowledge-search>` renders `data-knowledge-search=""`;
  the component form renders `="true"` unless the value is spelled `''`. Presence
  selectors resolve either way, which is why the suites and smoke steps that use them
  would not have caught it.
-->
<script>
  let {
    // The current query. `$bindable` because ten of the nineteen converted sites bound it.
    value = $bindable(''),
    // Called after `value` has been updated, for the sites that do more than store the string.
    onInput = undefined,
    placeholder = undefined,
    // The input's accessible name, already localized. The `<label>` wraps an icon and an input
    // and no text, so it contributes no name of its own.
    ariaLabel = undefined,
    // `is-compact`: the 32px `min(220px, 30%)` density (`fabricate.css:15183`).
    compact = false,
    // An EXTRA class, appended after the primitive's own and after `is-compact` — never a
    // replacement. Named rather than a rest key for the reason `InspectorCard.svelte` records.
    class: extraClass = '',
    // Attributes for the INPUT. The rest spread belongs to the host `<label>` and cannot
    // reach it.
    inputAttrs = undefined,
    ...rest
  } = $props();

  const classes = $derived(
    ['manager-search', compact ? 'is-compact' : '', extraClass].filter(Boolean).join(' ')
  );

  /**
   * @param {Event & { currentTarget: HTMLInputElement }} event
   */
  function handleInput(event) {
    const next = event.currentTarget.value;
    value = next;
    onInput?.(next, event);
  }
</script>

<label class={classes} {...rest}>
  <i class="fas fa-search" aria-hidden="true"></i>
  <input
    type="search"
    {value}
    {placeholder}
    aria-label={ariaLabel}
    oninput={handleInput}
    {...inputAttrs}
  />
</label>
