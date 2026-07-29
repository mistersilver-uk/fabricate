<!-- Svelte 5 runes mode -->
<!--
  The component browser's multi-select toolbar (issue 772) — the LAST row of
  `.manager-toolbar.manager-component-toolbar`, sitting directly above the list, matching
  the prototype's third-row-then-list order.

  Its root JOINS `.manager-component-filter-row` so it inherits the toolbar's row metrics
  (flex, wrap, gap, full width) rather than declaring a bespoke bar; `is-selection` adds
  only the row CONTEXT that separates it from the filter rows above, and that class is
  authored once in `styles/fabricate.css` beside the rows it joins. Everything this
  component draws for ITSELF lives in the scoped block below.

  TWO DISTINCT ACTIONS, and they are never conflated:
   - the tri-state box acts on the RENDERED rows — `page.components` flat, or the union of
     the NON-COLLAPSED groups when grouping is on. A collapsed category's rows are not
     rendered and this control must never reach them, or the count would exceed the rows
     the GM can see;
   - `Select all {N} results` acts on the WHOLE filtered set, which is the only way to
     reach a row the page control cannot.

  Consequence, accepted: because the link shows whenever the filtered set is larger than
  the rendered set, collapsing a category makes it appear even on a single-page library —
  where the prototype would not show it. That is correct; a collapsed group's rows are
  exactly the rows the page control cannot reach.

  The model returns DATA (`describeComponentSelection`) and this component localizes it —
  the pure model carries no strings.

  Props:
   - pageSelectionState: `'all' | 'some' | 'none'` over the RENDERED rows.
   - count: the size of the WHOLE selection, not its intersection with the page. A
     selection made on page 1 survives paging and is still counted here.
   - showSelectAllResults / selectAllResultsCount: the results link and its number.
   - onTogglePage(on) / onSelectAllResults() / onClear().
-->
<script>
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    pageSelectionState = 'none',
    count = 0,
    showSelectAllResults = false,
    selectAllResultsCount = 0,
    onTogglePage = () => {},
    onSelectAllResults = () => {},
    onClear = () => {},
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

  const selectAllLabel = $derived(
    text('FABRICATE.Admin.Manager.Component.BulkEdit.SelectAll', 'Select all')
  );
  const countLabel = $derived(
    format('FABRICATE.Admin.Manager.Component.BulkEdit.SelectedCount', '{count} selected', {
      count,
    })
  );
  const resultsLabel = $derived(
    format(
      'FABRICATE.Admin.Manager.Component.BulkEdit.SelectAllResults',
      'Select all {count} results',
      {
        count: selectAllResultsCount,
      }
    )
  );
  const clearLabel = $derived(text('FABRICATE.Admin.Manager.Component.BulkEdit.Clear', 'Clear'));
</script>

<div class="manager-component-filter-row is-selection" data-component-selection-toolbar>
  <!--
    `wrapper="contents"` because THIS element is the label: the box and its caption are one
    click target, and nesting the primitive's own `<label>` inside another would be invalid
    HTML with an ambiguous target. The focus ring therefore belongs to this host — the
    primitive scopes its own ring to the wrapper IT renders — so the focus-ring rule below
    is load-bearing, not decoration. Read its comment before touching its shape: this rule
    reaches into another component's markup, and the obvious authoring of it compiles to
    nothing at all.
  -->
  <label class="manager-component-selection-all">
    <SelectionCheckbox
      wrapper="contents"
      size="md"
      checked={pageSelectionState === 'all'}
      indeterminate={pageSelectionState === 'some'}
      ariaLabel={selectAllLabel}
      data-component-select-all-page
      onChange={(on) => onTogglePage(on === true)}
    />
    <span class="manager-component-selection-all-label">{selectAllLabel}</span>
  </label>

  {#if count > 0}
    <span class="manager-component-selection-divider" aria-hidden="true"></span>
    <span class="manager-component-selection-count" data-component-selection-count>
      <i class="fas fa-layer-group" aria-hidden="true"></i>
      <span>{countLabel}</span>
    </span>
    {#if showSelectAllResults}
      <button
        type="button"
        class="manager-component-selection-link"
        data-component-select-all-results
        onclick={() => onSelectAllResults()}>{resultsLabel}</button
      >
    {/if}
    <button
      type="button"
      class="manager-component-selection-clear"
      data-component-clear-selection
      onclick={() => onClear()}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
      <span>{clearLabel}</span>
    </button>
  {/if}
</div>

<style>
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is always in scope here. That is the
     opposite of `SelectionCheckbox`, which is area-agnostic and reaches theme root only;
     do not carry this over to a shared primitive.

     The row itself is NOT styled here. `.manager-component-filter-row.is-selection` in the
     global sheet owns the row metrics and the hairline that separates this register from
     the filter rows above, because that is layout context shared with the rows it joins. */

  .manager-component-selection-all {
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
     modes, and `+` steps over any comment anchor Svelte interleaves between them. */
  .manager-component-selection-all
    :global(.fab-selection-input:focus-visible + .fab-selection-check) {
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }

  .manager-component-selection-divider {
    flex: 0 0 auto;
    width: 1px;
    height: 16px;
    background: var(--fab-mv2-border);
  }

  /* The selection count is the one ACCENT thing in the row: it is the fact the rest of the
     row acts on, and the panel in the rail restates it. */
  .manager-component-selection-count {
    display: inline-flex;
    gap: var(--fab-space-chip);
    align-items: center;
    flex: 0 0 auto;
    color: var(--fab-mv2-accent);
    font-size: 0.68rem;
    font-weight: 700;
  }

  .manager-component-selection-count > i {
    font-size: 0.62rem;
  }

  /* A real `<button>` wearing link chrome, not an `<a>` with no href: it performs an
     action on this screen and must be reachable by keyboard as the action it is. Foundry's
     host button geometry is reset explicitly (fixed height, its own font family), the same
     properties `Chip`'s button rule resets and for the same reason. */
  .manager-component-selection-link,
  .manager-component-selection-clear {
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

  .manager-component-selection-link {
    color: var(--fab-mv2-info);
    border-bottom: 1px solid var(--fab-info-border);
    border-radius: 0;
  }

  /* Clear is the quiet escape from the whole mode, so it recedes and sits at the far end
     of the row — away from the two controls that ADD to the selection. */
  .manager-component-selection-clear {
    margin-left: auto;
    color: var(--fab-text-subtle);
  }

  .manager-component-selection-clear:hover,
  .manager-component-selection-link:hover {
    color: var(--fab-mv2-text);
  }

  .manager-component-selection-link:focus-visible,
  .manager-component-selection-clear:focus-visible {
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }

  .manager-component-selection-clear > i {
    font-size: 0.62rem;
  }
</style>
