<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE multi-select toolbar: the tri-state page box, the selected-count
  readout, `Select all {N} results` and Clear, in the LAST row of a browser's toolbar,
  sitting directly above its list (issue 772, extracted for issue 1010).

  It lives under `apps/manager/` — beside `Chip`, `Callout` and `SegmentedControl` — and
  NOT under `apps/manager/components/`, which holds the area-agnostic leaves. That is
  deliberate and load-bearing, but NOT for the reason first recorded here. "Staying inside
  `apps/manager/` keeps `--fab-manager-*` in scope" has LAPSED: a scoped `<style>` may not
  reach an area-scoped property from ANY directory, because a component is placed in a
  directory and not in a DOM subtree (design-system spec, *The token namespace is one
  generation and names its purpose*). What survives is what the placement really decides:
  this component's root class is `manager-*`, both of its consumers are manager views, and
  `components/` is the area-agnostic leaf set, which this is not.

  Its root JOINS the host browser's own filter-row class so it inherits that toolbar's row
  metrics (flex, wrap, gap, full width) rather than declaring a bespoke bar; `is-selection`
  adds only the row CONTEXT that separates it from the filter rows above, and that class is
  authored once in `styles/fabricate.css` beside the rows it joins. Everything this
  component draws for ITSELF lives in the scoped block below.

  TWO DISTINCT ACTIONS, and they are never conflated:
   - the tri-state box acts on the RENDERED rows — the page flat, or the union of the
     NON-COLLAPSED groups when grouping is on. A collapsed category's rows are not rendered
     and this control must never reach them, or the count would exceed the rows the GM can
     see;
   - `Select all {N} results` acts on the WHOLE filtered set, which is the only way to
     reach a row the page control cannot.

  Consequence, accepted: because the link shows whenever the filtered set is larger than
  the rendered set, collapsing a category makes it appear even on a single-page library —
  where the prototype would not show it. That is correct; a collapsed group's rows are
  exactly the rows the page control cannot reach.

  The model returns DATA (`describeBulkSelection`) and this component localizes it — the
  pure model carries no strings. Its four labels are NOUN-FREE, so they live in the neutral
  `Admin.Manager.BulkEdit.*` namespace rather than under either studio. (Written without its
  `FABRICATE` root on purpose — see the note in `BulkEditPanelShell.svelte`.)

  Props:
   - pageSelectionState: `'all' | 'some' | 'none'` over the RENDERED rows.
   - count: the size of the WHOLE selection, not its intersection with the page. A
     selection made on page 1 survives paging and is still counted here.
   - showSelectAllResults / selectAllResultsCount: the results link and its number.
   - onTogglePage(on) / onSelectAllResults() / onClear().
   - rowClass: the host toolbar's row class this root joins. Defaulted to the Component
     Studio's, so its shipped call site, the smoke selectors and the view-lab cases keep
     working untouched.
   - toolbarAttr / pageBoxAttr / countAttr / resultsAttr / clearAttr: the five test and
     screenshot hook names, defaulted to the Component Studio's strings for the same
     reason. They are PARAMETERS of this primitive, not a reason to fork it
     (`openspec/specs/ui-integration/spec.md`, Selection controls).
-->
<script>
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    pageSelectionState = 'none',
    count = 0,
    showSelectAllResults = false,
    selectAllResultsCount = 0,
    onTogglePage = () => {},
    onSelectAllResults = () => {},
    onClear = () => {},
    // The VISIBLE caption on the select-all box, when a caller wants one shorter than the shared
    // phrase. `''` — the default — keeps the shipped words, so the three studios are untouched.
    // See `selectAllCaption` below for why the accessible name does not follow it.
    selectAllLabel: selectAllLabelOverride = '',
    // ── WHERE THE ACTIONS THIS COUNT FEEDS ACTUALLY ARE ─────────────────────────────────────
    // An ALREADY-LOCALIZED standing sentence, rendered beside the count and only while there is
    // a count to stand beside. `proto:594` draws it — `Bulk actions are in the inspector →` — and
    // it is what keeps this register from competing with the panel it points at: the band states
    // the fact, the panel owns the verbs.
    //
    // A PARAMETER rather than a shipped default, for the reason the five hook names are: `''`
    // renders nothing, so the Component, Recipe and Essence Studios are byte-identical across
    // this. It is the CALLER's string because only the caller knows whether its bulk body lands
    // in an inspector rail at all — `EntityRulesListShell` renders one directly under this row.
    hint = '',
    // ── THE TWO TEXT ACTIONS AT THE TRAILING EDGE, TOGETHER ─────────────────────────────────
    // `proto:595`-`596` puts the auto margin on the SELECT-ALL action and lets `Clear` follow it
    // directly; this component's shipped rule puts it on `Clear` alone, so a register carrying a
    // `hint` strands `Select all N results` against that sentence with no space between two
    // differently-coloured runs of text. `false` keeps the shipped arrangement, so the Component,
    // Recipe and Essence Studios render byte-identically.
    //
    // A PROP RATHER THAN A RULE IN `styles/fabricate.css`, and that is mechanical rather than a
    // preference: that sheet is imported at `layer(modules)` and this scoped block is injected
    // unlayered, so a rule there loses to the one below WHATEVER its specificity — silently, with
    // the selector matching and the declaration unused. The sheet records the measurement.
    trailingActions = false,
    // ── THE PAIR AS BARE TYPE, WHICH IS WHAT THE REFERENCE DRAWS ────────────────────────────
    // `proto:595` is a bare clickable span — `font:600 11px var(--sans); color:var(--info);
    // cursor:pointer` — with NO border and no underline, and `proto:596` is the same shape in
    // `--subtle` with NO glyph. This component draws the link with a `--fab-info-border`
    // underline and puts a `fa-xmark` before `Clear`, and neither is in that reference.
    //
    // The xmark is not invented, and where it belongs is the point: `proto:626` is the INSPECTOR
    // PANEL's Clear and it DOES carry one, at `600 10px` with a `gap:5px`. `BulkEditPanelShell`
    // draws that correctly. What happened here is that the panel's treatment was borrowed for the
    // band, where the design states the plainer one.
    //
    // ONE PROP FOR BOTH, because `proto:595` and `proto:596` are one statement about one pair:
    // the band's two actions are type, not chrome. Splitting it would let a caller take half of a
    // ruling. `false` is today's rendering exactly, so the Component, Recipe and Essence Studios
    // are byte-identical — including the hand-copied markup in their two font-size fixtures,
    // which spell the `fa-xmark` out.
    //
    // A PROP RATHER THAN A ROUTE-SCOPED RULE IN `styles/fabricate.css`, for the reason
    // `trailingActions` records: this block declares `border-bottom` on the element, that sheet
    // ships at `layer(modules)`, and a layered declaration loses to an unlayered one whatever its
    // specificity. The glyph is not a cascade question at all — no stylesheet can remove an
    // element the template renders.
    bareActions = false,
    // ── WHICH GLYPH THE COUNT DRAWS, WHICH IS A THIRD OBJECT AND NOT A THIRD ACTION ─────────
    // `proto:593` is the band's count — `font:700 11px var(--sans); color:var(--accent)` behind a
    // `fa-solid fa-check-double` at `font-size:10px; margin-right:6px`. Measured in Chromium at
    // the production layering, everything but the glyph already matches: the count renders
    // 10.88px at weight 700 in the accent token itself, and the glyph sits 6px from the label,
    // because `--fab-space-chip` IS 6px. The sub-pixel gaps — 10.88px against 11px, and 9.92px
    // against 10px — are the shipped rem scale this block is written in and are left alone; buying
    // 0.12px would cost the three studios their identical rendering.
    //
    // NOT A THIRD CLAUSE ON `bareActions`, deliberately. That prop is one ruling about the band's
    // two ACTIONS — `proto:595`-`596` — and it is a REMOVAL: no underline, no glyph. The count is
    // the fact those actions operate on, not an action, and its ruling is a SUBSTITUTION. Folding
    // it in would make one prop mean two unrelated things and hand a caller that asked about the
    // actions a change to something else, which is the failure `bareActions`'s own note names when
    // it argues against splitting a single ruling.
    //
    // A STRING, following the shipped idiom rather than inventing one: `Chip`, `Callout`,
    // `ChecklistCardRow`, `ComplicationEffectRow` and `ArmedDangerButton` all take "which Font
    // Awesome classes does this leading glyph draw" as a string prop. The default is today's
    // markup EXACTLY, so the Component, Recipe and Essence Studios are byte-identical — including
    // the hand-copied `<i class="fas fa-layer-group">` in their two font-size fixtures.
    //
    // AND IT CANNOT BE A RULE. `bareActions` records why the sheet cannot win a cascade against
    // this block; the glyph does not even get that far, because no stylesheet can swap the element
    // a template renders. It is markup or it is nothing.
    countIcon = 'fas fa-layer-group',
    rowClass = 'manager-component-filter-row',
    toolbarAttr = 'data-component-selection-toolbar',
    pageBoxAttr = 'data-component-select-all-page',
    countAttr = 'data-component-selection-count',
    resultsAttr = 'data-component-select-all-results',
    clearAttr = 'data-component-clear-selection',
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  // Spread, following `Callout`'s hook idiom: the attribute NAME is a parameter, so it
  // cannot be written literally in the markup.
  //
  // The value is `''`, NOT `true`. Svelte serializes `true` as `="true"`, and these five
  // hooks shipped as BARE attributes (`data-x=""`) written literally in the markup — so a
  // truthy value would silently re-serialize every screenshot and smoke hook in the
  // Component Studio's toolbar. Presence selectors would not notice; a value-matching one
  // would, and this extraction is supposed to change nothing a consumer can observe.
  const toolbarHook = $derived({ [toolbarAttr]: '' });
  const pageBoxHook = $derived({ [pageBoxAttr]: '' });
  const countHook = $derived({ [countAttr]: '' });
  const resultsHook = $derived({ [resultsAttr]: '' });
  const clearHook = $derived({ [clearAttr]: '' });

  // THE ACCESSIBLE NAME, always the full phrase.
  const selectAllLabel = $derived(text('FABRICATE.Admin.Manager.BulkEdit.SelectAll', 'Select all'));
  // THE VISIBLE CAPTION, which a caller may shorten. The prototype's catalogue toolbar reads
  // `[☐ All]` where three shipped studios read `[☐ Select all]`, and the two are not the same
  // string for the same reason the `title` on an icon-only segment is not: `All` beside a box is
  // legible because the box is right there, and `All` announced on its own is not a verb a
  // screen-reader user can act on. So only the caption moves and `ariaLabel` stays whole.
  const selectAllCaption = $derived(String(selectAllLabelOverride || '').trim() || selectAllLabel);
  const countLabel = $derived(
    format('FABRICATE.Admin.Manager.BulkEdit.SelectedCount', '{count} selected', {
      count,
    })
  );
  const resultsLabel = $derived(
    format('FABRICATE.Admin.Manager.BulkEdit.SelectAllResults', 'Select all {count} results', {
      count: selectAllResultsCount,
    })
  );
  const clearLabel = $derived(text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear'));
</script>

<div class="{rowClass} is-selection" {...toolbarHook}>
  <!--
    `wrapper="contents"` because THIS element is the label: the box and its caption are one
    click target, and nesting the primitive's own `<label>` inside another would be invalid
    HTML with an ambiguous target. The focus ring therefore belongs to this host — the
    primitive scopes its own ring to the wrapper IT renders — so the focus-ring rule below
    is load-bearing, not decoration. Read its comment before touching its shape: this rule
    reaches into another component's markup, and the obvious authoring of it compiles to
    nothing at all.
  -->
  <label class="fab-bulk-selection-all">
    <SelectionCheckbox
      wrapper="contents"
      size="md"
      checked={pageSelectionState === 'all'}
      indeterminate={pageSelectionState === 'some'}
      ariaLabel={selectAllLabel}
      {...pageBoxHook}
      onChange={(on) => onTogglePage(on === true)}
    />
    <span class="fab-bulk-selection-all-label">{selectAllCaption}</span>
  </label>

  {#if count > 0}
    <span class="fab-bulk-selection-divider" aria-hidden="true"></span>
    <span class="fab-bulk-selection-count" {...countHook}>
      <i class={countIcon} aria-hidden="true"></i>
      <span>{countLabel}</span>
    </span>
    {#if hint}
      <span class="fab-bulk-selection-hint">{hint}</span>
    {/if}
    {#if showSelectAllResults}
      <button
        type="button"
        class="fab-bulk-selection-link"
        class:is-trailing={trailingActions}
        class:is-bare={bareActions}
        {...resultsHook}
        onclick={() => onSelectAllResults()}>{resultsLabel}</button
      >
    {/if}
    <button type="button" class="fab-bulk-selection-clear" {...clearHook} onclick={() => onClear()}>
      {#if !bareActions}<i class="fas fa-xmark" aria-hidden="true"></i>{/if}
      <span>{clearLabel}</span>
    </button>
  {/if}
</div>

<style>
  /* THEME-ROOT tokens only, like every scoped `<style>` in the product. The reason once
     recorded here — that living under `apps/manager/` puts an area-scoped
     `--fab-manager-*` property in scope — has LAPSED: a scoped block may not reach one from
     ANY directory (design-system spec, *The token namespace is one generation and names its
     purpose*). `SelectionCheckbox` records the same rule for the same reason; it is no
     longer the opposite case.

     The row itself is NOT styled here. `.<rowClass>.is-selection` in the global sheet owns
     the row metrics and the hairline that separates this register from the filter rows
     above, because that is layout context shared with the rows it joins. */

  .fab-bulk-selection-all {
    display: inline-flex;
    gap: var(--fab-space-2);
    align-items: center;
    flex: 0 0 auto;
    color: var(--fab-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    cursor: pointer;
  }

  /* The real control is 1px and transparent, so the ring has to be drawn on the visible
     box. `SelectionCheckbox` scopes its own ring to the `<label>` IT renders, which this
     host opts out of with `wrapper="contents"` — so the host draws it.

     EVERY CROSS-BOUNDARY PART OF THE SELECTOR SITS INSIDE `:global()`, and that is the
     fix, not a style choice. This rule used to read
     `…-all:has(input:focus-visible) :global(.fab-selection-check)`, which left `input`
     outside the `:global()` — and the `<input>` is rendered by `SelectionCheckbox`'s
     `control()` snippet, not by this template. Svelte's unused-selector analysis cannot
     see across a component boundary, so it decided the rule matched nothing, emitted the
     whole block into the compiled stylesheet as an `(unused)` CSS comment, and the focus
     ring was DEAD in every shipped build while this comment claimed it was load-bearing.
     It was load-bearing; it just was not being applied.

     The adjacent-sibling form is what makes `:global()` sufficient: `<input>` and
     `<span class="fab-selection-check">` are siblings in both of the primitive's wrapper
     modes, and `+` steps over any comment anchor Svelte interleaves between them.

     THE FIX ALSO CHANGED THE FAILURE MODE FROM LOUD TO SILENT, so the contract is pinned by
     a test. Nothing inside `:global()` is analysed, and no other gate covers it: Stylelint
     excludes `.svelte`, SonarCloud indexes none of it, and the sweep compiles each component
     alone. Rename `.fab-selection-input` or `.fab-selection-check` in `SelectionCheckbox`, or
     interpose an element between them, and this ring dies with nothing objecting. The
     structural assertions live in `tests/components/bulk-selection-toolbar-mounted.test.js`
     — a DRIFT assertion that re-reads the class tokens out of this `:global()` and demands
     each one still appear in `SelectionCheckbox`'s markup, plus the adjacency case, because
     adjacency alone cannot see a typo inside `:global()`. A second, hand-copied copy of the
     same markup sits in the Playwright fixture in
     `tests/components/component-studio-font-size.test.js`. */
  .fab-bulk-selection-all :global(.fab-selection-input:focus-visible + .fab-selection-check) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-bulk-selection-divider {
    flex: 0 0 auto;
    width: 1px;
    height: 16px;
    background: var(--fab-border);
  }

  /* The selection count is the one ACCENT thing in the row: it is the fact the rest of the
     row acts on, and the panel in the rail restates it. */
  .fab-bulk-selection-count {
    display: inline-flex;
    gap: var(--fab-space-chip);
    align-items: center;
    flex: 0 0 auto;
    color: var(--fab-accent);
    font-size: 0.68rem;
    font-weight: 700;
  }

  .fab-bulk-selection-count > i {
    font-size: 0.62rem;
  }

  /* The standing sentence beside the count, MUTED and one rung lighter than it: it is context
     for the accent fact rather than a second fact. `proto:594` sets `500 10.5px var(--sans)` in
     `--muted`, and 10.5px is 0.66rem against the 16px root this product uses.

     `flex: 0 1 auto` with `min-width: 0`, not `0 0 auto`: it is the one item in this register
     that is a sentence rather than a control, so it is also the only one that can honestly give
     width back before the row wraps. */
  .fab-bulk-selection-hint {
    flex: 0 1 auto;
    min-width: 0;
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    font-weight: 500;
    line-height: 1.2;
  }

  /* A real `<button>` wearing link chrome, not an `<a>` with no href: it performs an
     action on this screen and must be reachable by keyboard as the action it is. Foundry's
     host button geometry is reset explicitly (fixed height, its own font family), the same
     properties `Chip`'s button rule resets and for the same reason. */
  .fab-bulk-selection-link,
  .fab-bulk-selection-clear {
    appearance: none;
    display: inline-flex;
    gap: var(--fab-space-chip);
    align-items: center;
    flex: 0 0 auto;
    width: auto;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font-family: inherit;
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
  }

  .fab-bulk-selection-link {
    color: var(--fab-info);
    border-bottom: 1px solid var(--fab-info-border);
    border-radius: 0;
  }

  /* ── `bareActions`: THE LINK LOSES ITS UNDERLINE (issue 1373, round 4) ─────────────────────
     `proto:595` gives the select-all action colour and weight and nothing else. The rule above
     is the shipped treatment and stays the default; this removes only the border, since the
     colour was already right. `Clear`'s half of the same ruling is a MARKUP change — the
     `fa-xmark` simply is not rendered — because no stylesheet can delete an element.

     `border-bottom: 0` rather than dropping the declaration from a variant, so the override is
     one property against one property and a future change to the default's colour or width does
     not have to be mirrored here. */
  .fab-bulk-selection-link.is-bare {
    border-bottom: 0;
  }

  /* Clear is the quiet escape from the whole mode, so it recedes and sits at the far end
     of the row — away from the two controls that ADD to the selection. */
  .fab-bulk-selection-clear {
    margin-left: auto;
    color: var(--fab-text-subtle);
  }

  /* ── `trailingActions`: THE PAIR MOVES TO THE END TOGETHER (issue 1373, round 4) ───────────
     `proto:595` puts the auto margin here rather than on `Clear`, so `Select all N results` and
     `Clear` sit together at the trailing edge with the count and the standing hint at the
     leading one. BOTH declarations are required and the second is the non-obvious half: two flex
     items each carrying `margin-left: auto` SPLIT the free space between them rather than both
     moving right, so `Clear` has to give its own back. It keeps it whenever the link is absent,
     which is the single-page case.

     Scoped, not `:global()`, and deliberately so: both elements are written by THIS template, so
     Svelte can see the selector and would warn if either class stopped being emitted. */
  .fab-bulk-selection-link.is-trailing {
    margin-left: auto;
  }

  .fab-bulk-selection-link.is-trailing + .fab-bulk-selection-clear {
    margin-left: 0;
  }

  .fab-bulk-selection-clear:hover,
  .fab-bulk-selection-link:hover {
    color: var(--fab-text);
  }

  .fab-bulk-selection-link:focus-visible,
  .fab-bulk-selection-clear:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-bulk-selection-clear > i {
    font-size: 0.62rem;
  }
</style>
