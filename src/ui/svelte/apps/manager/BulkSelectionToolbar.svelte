<!-- Svelte 5 runes mode -->
<!--
  The manager's one multi-select toolbar: the tri-state page box, the selected-count readout,
  `Select all {N} results` and Clear, in the last row of a browser's toolbar directly above its
  list (issue 772, extracted for issue 1010). Its root JOINS the host browser's filter-row class
  so it inherits that toolbar's row metrics; `is-selection` is authored in `styles/fabricate.css`
  beside the rows it joins, and only what this component draws for itself lives below.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `pageSelectionState` | `'all' \| 'some' \| 'none'` | `'none'` | over the RENDERED rows only |
  | `count` | number | `0` | the size of the WHOLE selection, not its intersection with the page |
  | `showSelectAllResults` / `selectAllResultsCount` | boolean / number | `false` / `0` | the results link and its number |
  | `selectAllScope` | `'results' \| 'shown'` | `'results'` | which population select-all names, and therefore whether the master box is drawn at all |
  | `selectAllCaption` | string | `''` | a shorter VISIBLE caption; the accessible name never follows it |
  | `hint` | string | `''` | an already-localized standing sentence beside the count |
  | `trailingActions` / `bareActions` | boolean | `false` | move the two text actions to the trailing edge; draw them as bare type |
  | `countIcon` | string | `'fas fa-layer-group'` | the glyph before the count |
  | `rowClass` | string | the Component Studio's | the host toolbar row class this root joins |
  | `toolbarAttr` / `pageBoxAttr` / `countAttr` / `resultsAttr` / `clearAttr` | string | the Component Studio's | the five test and screenshot hook names |

  Callbacks:
  - `onTogglePage(on)` / `onSelectAllResults()` / `onClear()`.

  Invariants:
  - The two actions are never conflated: the tri-state box acts on the RENDERED rows (the page
    flat, or the union of non-collapsed groups), and `Select all {N} results` acts on the whole
    FILTERED set, which is the only way to reach a row the page control cannot. A collapsed
    category's rows are not rendered, so the link appears even on a single-page library.
  - Under `selectAllScope="shown"` the box's job moves into the link, so `pageSelectionState`,
    `onTogglePage`, `selectAllCaption` and `pageBoxAttr` are inert; the caller passes the count
    of the rows it is RENDERING and points `onSelectAllResults` at those same rows, and the band
    stops rendering when the selection is empty rather than drawing an empty bordered row.
  - The model returns DATA (`describeBulkSelection`) and this component localizes it. Its labels
    are noun-free, under `Admin.Manager.BulkEdit.*` — written without its `FABRICATE` root on
    purpose, per the note in `BulkEditPanelShell.svelte`.
  - The five hook names are PARAMETERS of this primitive, not a reason to fork it
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
    // Which population select-all names; see the header. One prop, because the reference is one
    // ruling — splitting it would let a caller take half of it.
    selectAllScope = 'results',
    // Visible caption only; `ariaLabel` keeps the full phrase.
    selectAllLabel: selectAllLabelOverride = '',
    // An already-localized standing sentence beside the count, and only while there is a count.
    // The caller's string because only the caller knows whether its bulk body lands in a rail.
    hint = '',
    // Puts the auto margin on the select-all action instead of on `Clear`, so the pair sits
    // together at the trailing edge. A prop and NOT a rule in `styles/fabricate.css`: that sheet
    // is imported at `layer(modules)` and this scoped block is injected unlayered, so a rule
    // there loses to the one below whatever its specificity, silently.
    trailingActions = false,
    // Draws the two actions as bare type — no underline on the link, no `fa-xmark` before
    // `Clear`. One prop for both, because that is one statement about one pair. The glyph half
    // has to be markup: no stylesheet can remove an element the template renders.
    bareActions = false,
    // The glyph the count draws — a substitution, not part of `bareActions`'s removal. A string,
    // following `Chip`, `Callout`, `ModifierLibraryRow`, `ComplicationEffectRow` and
    // `ArmedDangerButton`. The default is today's markup exactly, which two font-size fixtures
    // hand-copy.
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

  // Spread because the attribute NAME is a parameter. The value is `''`, NOT `true`: Svelte
  // serializes `true` as `="true"` and these five hooks shipped as bare attributes, so a truthy
  // value would silently re-serialize every screenshot and smoke hook in the toolbar.
  const toolbarHook = $derived({ [toolbarAttr]: '' });
  const pageBoxHook = $derived({ [pageBoxAttr]: '' });
  const countHook = $derived({ [countAttr]: '' });
  const resultsHook = $derived({ [resultsAttr]: '' });
  const clearHook = $derived({ [clearAttr]: '' });

  // The accessible name, always the full phrase.
  const selectAllLabel = $derived(text('FABRICATE.Admin.Manager.BulkEdit.SelectAll', 'Select all'));
  // The visible caption, which a caller may shorten. `All` beside a box is legible because the
  // box is there; `All` announced on its own is not a verb a screen-reader user can act on, so
  // only the caption moves.
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

  // A closed set with a fallback, as `Chip`'s tone and `ManagerButton`'s role are: an
  // unrecognised value renders the shipped band rather than silently deleting its master box.
  const showsShown = $derived(selectAllScope === 'shown');

  // Its own key rather than `SelectAllResults` with a swapped word: `{count} results` and
  // `{count} shown` are different sentences about different populations.
  const shownLabel = $derived(
    format('FABRICATE.Admin.Manager.BulkEdit.SelectAllShown', 'Select all {count} shown', {
      count: selectAllResultsCount,
    })
  );

  // With the box suppressed and nothing selected there is no content, and an empty bordered row
  // is not a thing this component may render. Under the default this is always true.
  const renders = $derived(!showsShown || count > 0);
</script>

{#if renders}
  <div class="{rowClass} is-selection" {...toolbarHook}>
    {#if !showsShown}
      <!--
        `wrapper="contents"` because THIS element is the label: the box and its caption are one
        click target, and nesting the primitive's own `<label>` inside another would be invalid
        HTML. The focus ring therefore belongs to this host, so the focus-ring rule below is
        load-bearing — read its comment before touching its shape. Suppressed under
        `selectAllScope="shown"`, where the link takes over the population it acted on.
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
  /* Theme-root tokens only — design-system spec, *The token namespace is one generation and
     names its purpose*. The row itself is NOT styled here: `.<rowClass>.is-selection` in the
     global sheet owns the row metrics and the hairline separating this register from the filter
     rows above, because that is layout context shared with the rows it joins. */

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

  /* The real control is 1px and transparent, so the ring is drawn on the visible box.
     `SelectionCheckbox` scopes its own ring to the `<label>` it renders, which this host opts
     out of with `wrapper="contents"`.

     EVERY cross-boundary part of the selector must sit inside `:global()`. With `input` left
     outside it, Svelte's unused-selector analysis — which cannot see across a component
     boundary — emitted the whole block as an `(unused)` CSS comment and the ring was dead in
     every shipped build. The adjacent-sibling form is what makes `:global()` sufficient:
     `<input>` and `<span class="fab-selection-check">` are siblings in both of the primitive's
     wrapper modes, and `+` steps over any comment anchor Svelte interleaves between them.

     Nothing inside `:global()` is analysed by any gate, so the contract is pinned instead by
     `tests/components/bulk-selection-toolbar-mounted.test.js`: a drift assertion re-reads the
     class tokens out of this `:global()` and demands each still appear in `SelectionCheckbox`'s
     markup, plus the adjacency case. A hand-copied second copy sits in the Playwright fixture in
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

  /* The selection count is the one accent thing in the row: it is the fact the rest of the row
     acts on. */
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

  /* Muted and one rung lighter than the count: context for the accent fact rather than a second
     fact. `flex: 0 1 auto` with `min-width: 0`, not `0 0 auto` — it is the one item in this
     register that is a sentence rather than a control, so it is the only one that can honestly
     give width back before the row wraps. */
  .fab-bulk-selection-hint {
    flex: 0 1 auto;
    min-width: 0;
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    font-weight: 500;
    line-height: 1.2;
  }

  /* A real `<button>` wearing link chrome, not an `<a>` with no href: it performs an action on
     this screen and must be reachable by keyboard as the action it is. Foundry's host button
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

  /* `bareActions` removes only the border; the colour was already right. `border-bottom: 0`
     rather than dropping the declaration from a variant, so the override is one property against
     one property. `Clear`'s half of the same ruling is a markup change, because no stylesheet can
     delete an element. */
  .fab-bulk-selection-link.is-bare {
    border-bottom: 0;
  }

  /* Clear is the quiet escape from the whole mode, so it recedes and sits away from the two
     controls that ADD to the selection. */
  .fab-bulk-selection-clear {
    margin-left: auto;
    color: var(--fab-text-subtle);
  }

  /* `trailingActions` moves the pair to the end together. BOTH declarations are required, and
     the second is the non-obvious half: two flex items each carrying `margin-left: auto` SPLIT
     the free space rather than both moving right, so `Clear` has to give its own back — it keeps
     it whenever the link is absent. Scoped rather than `:global()`, so Svelte would warn if
     either class stopped being emitted. */
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
