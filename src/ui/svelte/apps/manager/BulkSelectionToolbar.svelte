<!--
  The manager's one multi-select toolbar: the tri-state page box, the selected-count readout,
  `Select all {N} results` and Clear, in the last row of a browser's toolbar (issue 772, extracted
  for issue 1010). Its root JOINS the host browser's filter-row class, so it inherits that toolbar's
  row metrics; `is-selection` is authored in the sheet beside the rows it joins.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `pageSelectionState` / `count` | `'all'`\|`'some'`\|`'none'`, number | `'none'`, `0` | the first is over the RENDERED rows only; the second is the size of the WHOLE selection, not its intersection with the page |
  | `showSelectAllResults` / `selectAllResultsCount` / `selectAllCaption` | | `false`, `0`, `''` | the results link, its number, and a shorter VISIBLE caption whose accessible name never follows it |
  | `selectAllScope` | `'results'` \| `'shown'` | `'results'` | which population select-all names, and therefore whether the master box is drawn at all. Under `'shown'` the box's job moves into the link, so `pageSelectionState`, `onTogglePage`, `selectAllCaption` and `pageBoxAttr` are inert, the caller passes the count of the rows it is RENDERING, and the band stops rendering when the selection is empty. |
  | `hint` / `trailingActions` / `bareActions` / `countIcon` | | `''`, `false` | a standing sentence beside the count; whether the two text actions move to the trailing edge and draw as bare type; the glyph before the count |
  | `rowClass` and the five `*Attr` hook names | string | the Component Studio's | the host toolbar row class this root joins, and the five test and screenshot hooks — PARAMETERS of this primitive, not a reason to fork it (`openspec/specs/ui-visual-style/spec.md`, Selection controls) |
  | `onTogglePage(on)` / `onSelectAllResults()` / `onClear()` | | | the three callbacks. The first two are never conflated: the tri-state box acts on the RENDERED rows, and the link acts on the whole FILTERED set, which is the only way to reach a row the page control cannot — a collapsed category's rows are not rendered, so it appears even on a single-page library. |

  The model returns DATA (`describeBulkSelection`) and this component localizes it. Its labels are
  noun-free, under `Admin.Manager.BulkEdit.*` — written without its `FABRICATE` root on purpose,
  per the note in `BulkEditPanelShell.svelte`.
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
    selectAllScope = 'results',
    // Visible caption only; `ariaLabel` keeps the full phrase.
    selectAllLabel: selectAllLabelOverride = '',
    hint = '',
    // A prop and NOT a sheet rule: the sheet is `layer(modules)` and this block is unlayered, so a
    // rule there loses silently whatever its specificity.
    trailingActions = false,
    // One prop for both, because that is one statement about one pair. The glyph half has to be
    // markup: no stylesheet can remove an element the template renders.
    bareActions = false,
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

  // Spread because the NAME is a parameter, with `''` and NOT `true`: Svelte serializes `true` as
  // `="true"`, which would re-serialize every screenshot and smoke hook in the toolbar.
  const toolbarHook = $derived({ [toolbarAttr]: '' });
  const pageBoxHook = $derived({ [pageBoxAttr]: '' });
  const countHook = $derived({ [countAttr]: '' });
  const resultsHook = $derived({ [resultsAttr]: '' });
  const clearHook = $derived({ [clearAttr]: '' });

  // The accessible name, always the full phrase.
  const selectAllLabel = $derived(text('FABRICATE.Admin.Manager.BulkEdit.SelectAll', 'Select all'));
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

  const showsShown = $derived(selectAllScope === 'shown');

  // Its own key: `{count} results` and `{count} shown` name different populations.
  const shownLabel = $derived(
    format('FABRICATE.Admin.Manager.BulkEdit.SelectAllShown', 'Select all {count} shown', {
      count: selectAllResultsCount,
    })
  );

  // With the box suppressed and nothing selected there is no content, and an empty bordered row is
  // not a thing this component may render.
  const renders = $derived(!showsShown || count > 0);
</script>

{#if renders}
  <div class="{rowClass} is-selection" {...toolbarHook}>
    {#if !showsShown}
      <!-- `wrapper="contents"` because THIS element is the label, so the focus ring belongs to
        this host and the rule below is load-bearing. -->
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
    {/if}

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
          onclick={() => onSelectAllResults()}>{showsShown ? shownLabel : resultsLabel}</button
        >
      {/if}
      <button
        type="button"
        class="fab-bulk-selection-clear"
        {...clearHook}
        onclick={() => onClear()}
      >
        {#if !bareActions}<i class="fas fa-xmark" aria-hidden="true"></i>{/if}
        <span>{clearLabel}</span>
      </button>
    {/if}
  </div>
{/if}

<style>
  /* Theme-root tokens only — design-system spec, *The token namespace is one generation and names
     its purpose*. The row itself is NOT styled here: that is layout context shared with the rows
     it joins, so the global sheet owns it. */

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

  /* The real control is 1px and transparent, so the ring is drawn on the visible box. EVERY
     cross-boundary part of the selector must sit inside `:global()`: with `input` outside it,
     Svelte's unused-selector analysis emitted the whole block as an `(unused)` comment and the ring
     was dead in every shipped build. Nothing inside `:global()` is analysed by any gate, so
     `tests/components/bulk-selection-toolbar-mounted.test.js` re-reads these class tokens. */
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

  /* Context for the accent fact rather than a second fact. `flex: 0 1 auto` with `min-width: 0`:
     it is the one item here that is a sentence, so the only one that can give width back. */
  .fab-bulk-selection-hint {
    flex: 0 1 auto;
    min-width: 0;
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    font-weight: 500;
    line-height: 1.2;
  }

  /* A real `<button>` wearing link chrome, not an `<a>` with no href. Foundry's host button
     geometry is reset explicitly, as `Chip`'s button rule does. */
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

  /* `bareActions` removes only the border, as one property against one property. `Clear`'s half
     of the same ruling is a markup change, because no stylesheet can delete an element. */
  .fab-bulk-selection-link.is-bare {
    border-bottom: 0;
  }

  .fab-bulk-selection-clear {
    margin-left: auto;
    color: var(--fab-text-subtle);
  }

  /* `trailingActions` moves the pair to the end together, and BOTH declarations are required: two
     flex items each carrying `margin-left: auto` SPLIT the free space rather than both moving
     right, so `Clear` gives its own back whenever the link is present. */
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
