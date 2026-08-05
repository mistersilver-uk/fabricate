<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE multi-select toolbar: the tri-state page box, the selected-count
  readout, `Select all {N} results` and Clear, in the LAST row of a browser's toolbar,
  sitting directly above its list (issue 772, extracted for issue 1010).

  It lives under `apps/manager/` — beside `Chip`, `Callout` and `SegmentedControl` — and
  NOT under `apps/manager/components/`, which holds the area-agnostic leaves. That is
  deliberate and load-bearing: this component's root class is `manager-*`, both of its
  consumers are manager views, and staying inside `apps/manager/` keeps `--fab-mv2-*`
  (declared on `.fabricate-manager`) in scope, so the extraction needed no token swap. A
  `components/` leaf can be rendered outside `.fabricate-manager`, where those properties
  are undefined and the colours silently fall back to inheritance.

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

  const selectAllLabel = $derived(text('FABRICATE.Admin.Manager.BulkEdit.SelectAll', 'Select all'));
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
    <span class="fab-bulk-selection-all-label">{selectAllLabel}</span>
  </label>

  {#if count > 0}
    <span class="fab-bulk-selection-divider" aria-hidden="true"></span>
    <span class="fab-bulk-selection-count" {...countHook}>
      <i class="fas fa-layer-group" aria-hidden="true"></i>
      <span>{countLabel}</span>
    </span>
    {#if showSelectAllResults}
      <button
        type="button"
        class="fab-bulk-selection-link"
        {...resultsHook}
        onclick={() => onSelectAllResults()}>{resultsLabel}</button
      >
    {/if}
    <button type="button" class="fab-bulk-selection-clear" {...clearHook} onclick={() => onClear()}>
      <i class="fas fa-xmark" aria-hidden="true"></i>
      <span>{clearLabel}</span>
    </button>
  {/if}
</div>

<style>
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is always in scope here. That is the
     opposite of `SelectionCheckbox`, which is area-agnostic and reaches theme root only;
     do not carry this over to a shared `components/` primitive.

     The row itself is NOT styled here. `.<rowClass>.is-selection` in the global sheet owns
     the row metrics and the hairline that separates this register from the filter rows
     above, because that is layout context shared with the rows it joins. */

  .fab-bulk-selection-all {
    display: inline-flex;
    gap: var(--fab-space-2);
    align-items: center;
    flex: 0 0 auto;
    color: var(--fab-mv2-text-muted);
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
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }

  .fab-bulk-selection-divider {
    flex: 0 0 auto;
    width: 1px;
    height: 16px;
    background: var(--fab-mv2-border);
  }

  /* The selection count is the one ACCENT thing in the row: it is the fact the rest of the
     row acts on, and the panel in the rail restates it. */
  .fab-bulk-selection-count {
    display: inline-flex;
    gap: var(--fab-space-chip);
    align-items: center;
    flex: 0 0 auto;
    color: var(--fab-mv2-accent);
    font-size: 0.68rem;
    font-weight: 700;
  }

  .fab-bulk-selection-count > i {
    font-size: 0.62rem;
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
    color: var(--fab-mv2-info);
    border-bottom: 1px solid var(--fab-info-border);
    border-radius: 0;
  }

  /* Clear is the quiet escape from the whole mode, so it recedes and sits at the far end
     of the row — away from the two controls that ADD to the selection. */
  .fab-bulk-selection-clear {
    margin-left: auto;
    color: var(--fab-text-subtle);
  }

  .fab-bulk-selection-clear:hover,
  .fab-bulk-selection-link:hover {
    color: var(--fab-mv2-text);
  }

  .fab-bulk-selection-link:focus-visible,
  .fab-bulk-selection-clear:focus-visible {
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }

  .fab-bulk-selection-clear > i {
    font-size: 0.62rem;
  }
</style>
