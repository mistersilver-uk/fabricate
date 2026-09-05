<!-- Svelte 5 runes mode -->
<!--
  ONE STAGING INSET, as the reference draws it (issue 1371 r16-list; `proto:1120`-`1240`): a
  recessed card holding a 28px search well, a FIXED window of rows, and a pager. The system
  Component Rules list's bulk panel draws it three times — categories, tags and essence values —
  and the world Component catalogue's bulk panel draws the same object three more times from a
  snippet of its own (`ComponentCatalogueBulkPanel.svelte`, `stagingInset`).

  ── WHY A COMPONENT, AND WHY ONLY ONE CALLER TODAY ──────────────────────────────────────────
  The search well, the rows container and the pager are identical in all six insets and only the
  ROWS differ — a tag row cycles three states, a category row is a radio, an essence row carries a
  stepper — so the rows are `children` and everything around them is this file. Writing it a
  second time inside the system panel would have been a 150-line copy of the world panel's scoped
  block, which is what the SonarCloud duplication gate reads a copy as. The world panel is NOT
  re-pointed at this component in the same change because that file is being re-geometried in a
  parallel lane (maintainer ruling M24, lane CAT); it is the intended second caller, and the
  design-system register (`tests/design-system-primitives.test.js`) is what will notice the moment
  it arrives. Until then this sits under `apps/manager/` as manager-scoped chrome, beside the
  `BulkEditPanelShell` and `BulkEditSection` it is always rendered between.

  ── THE ROWS CARRY THIS COMPONENT'S CLASSES, NOT THE CALLER'S ────────────────────────────────
  A snippet rendered as `children` carries the scope hash of the component that DEFINES it, so
  a scoped `.fab-bulk-inset-row` here would match nothing a caller writes. The row rules below
  are therefore `:global()` and ROOTED AT THIS COMPONENT'S OWN ROOT (`.fab-bulk-inset`), which is
  the design-system rule for a class family a shared primitive paints — rooted at the primitive,
  never at an application root — and is what lets a caller write `<button class="fab-bulk-inset-row">`
  and get the row the reference draws.

  Props:
   - id: the inset's name, stamped as `data-bulk-inset={id}` and on every hook below, so two
     insets in one panel are distinguishable by selector.
   - query / onQuery(next): the search well's value and its change.
   - placeholder: the well's placeholder AND its accessible name, already localized.
   - page: `{pageIndex, pageCount, rangeStart, rangeEnd, total}` — `pageBulkInsetRows` output.
   - onPage(index): the pager's request for another page.
   - empty: the sentence drawn when the window holds no row, already localized.
   - hasRows: whether `children` renders anything; `false` draws `empty` instead.
   - disabled: inerts the well and the pager (the caller inerts its own rows).
   - rowsAttr: an optional bare hook on the rows container, e.g. `data-component-bulk-essences`.
   - minRows: the window's height in rows; the reference's tag and category windows hold five and
     its essence window is taller, so the caller states which.
   - children: the rows.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    id = '',
    query = '',
    onQuery = () => {},
    placeholder = '',
    page = { pageIndex: 0, pageCount: 1, rangeStart: 0, rangeEnd: 0, total: 0 },
    onPage = () => {},
    empty = '',
    hasRows = true,
    disabled = false,
    rowsAttr = '',
    minRows = 5,
    children,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function phrase(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  // Spread, following `Callout`'s hook idiom: the attribute NAME is a parameter, so it cannot be
  // written literally. `''` rather than `true`, because Svelte serialises `true` as `="true"`.
  const rowsHook = $derived(rowsAttr ? { [rowsAttr]: '' } : {});
  const pageIndex = $derived(Number(page?.pageIndex) || 0);
  const pageCount = $derived(Math.max(1, Number(page?.pageCount) || 1));
  // Five rows plus their gaps is the reference's own 181px window; each extra row adds a row and
  // a gap. Stated as a custom property so the height is one declaration in the CSS below.
  const windowStyle = $derived(`--fab-bulk-inset-rows: ${Math.max(1, Number(minRows) || 5)}`);
</script>

<div class="fab-bulk-inset" data-bulk-inset={id}>
  <div class="fab-bulk-inset-search">
    <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
    <input
      type="search"
      value={query}
      {placeholder}
      aria-label={placeholder}
      {disabled}
      data-bulk-inset-search={id}
      oninput={(event) => onQuery(event.currentTarget.value)}
    />
  </div>
  <div class="fab-bulk-inset-rows" style={windowStyle} {...rowsHook}>
    {#if hasRows}
      {@render children?.()}
    {:else}
      <p class="fab-bulk-inset-empty" data-bulk-inset-empty={id}>{empty}</p>
    {/if}
  </div>
  <div class="fab-bulk-inset-pager">
    <!-- NEUTRAL, noun-free keys under `Admin.Manager.BulkEdit`, because this inset pages
         categories, tags and essences alike. `Page {page} of {of}` is the reference's own sentence
         (`proto:1157`, `Page 1 of 1`); the world panel's `Page {page}/{of}` is its own key. -->
    <span class="fab-bulk-inset-range" data-bulk-inset-range={id}>
      {phrase('FABRICATE.Admin.Manager.BulkEdit.InsetRange', 'Showing {start}-{end} of {total}', {
        start: page?.rangeStart ?? 0,
        end: page?.rangeEnd ?? 0,
        total: page?.total ?? 0,
      })}
    </span>
    <div class="fab-bulk-inset-pages">
      <!-- EVERY `<button>` HERE DECLARES `data-keyboard-focus="true"`: Foundry's
           `KeyboardManager#hasFocus` recognises a button only by its `form`, and this rail renders
           none, so a focused pager would otherwise leave Space pausing the game. -->
      <button
        type="button"
        class="fab-bulk-inset-page"
        data-keyboard-focus="true"
        data-bulk-inset-prev={id}
        disabled={disabled || pageIndex === 0}
        aria-label={text('FABRICATE.Admin.Manager.Pagination.Previous', 'Previous page')}
        onclick={() => onPage(pageIndex - 1)}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="fab-bulk-inset-page-label">
        {phrase('FABRICATE.Admin.Manager.BulkEdit.InsetPage', 'Page {page} of {of}', {
          page: pageIndex + 1,
          of: pageCount,
        })}
      </span>
      <button
        type="button"
        class="fab-bulk-inset-page"
        data-keyboard-focus="true"
        data-bulk-inset-next={id}
        disabled={disabled || pageIndex >= pageCount - 1}
        aria-label={text('FABRICATE.Admin.Manager.Pagination.Next', 'Next page')}
        onclick={() => onPage(pageIndex + 1)}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</div>

<style>
  /* THEME-ROOT tokens only, for the reason `BulkEditPanelShell` records: a scoped block may not
     reach an area-scoped property from any directory.

     ── THE STAGING INSET (`proto:1138`) ─────────────────────────────────────────────────────
     A recess one rung BELOW the panel, hairline, radius 9 — `design-system/spec.md` puts a well on
     9, which is the reference's own value. The reference's 9px padding takes `--fab-space-2`, the
     nearest step on the published 4px scale. */
  .fab-bulk-inset {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-0);
  }

  /* The 28px search well, lifted back to `--fab-bg-1` inside the recess (`proto:1139`). */
  .fab-bulk-inset-search {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    height: 28px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-1);
  }

  .fab-bulk-inset-search > i {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.56rem;
  }

  /* Foundry core sizes every `<input>` to its own height and border; both are reset here so the
     field is the WELL and not a second box inside it. */
  .fab-bulk-inset-search input {
    flex: 1 1 auto;
    width: auto;
    height: auto;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--fab-text);
    font-family: inherit;
    font-size: 0.66rem;
    font-weight: 500;
  }

  /* THE WINDOW IS A FIXED HEIGHT, which is the whole reason the reference draws a pager on it: a
     list that grew and shrank with its search would move the groups below it on every keystroke.
     One row is the reference's 27px (`padding:6px 9px` around a 10.5px line plus the hairline)
     and the gap between rows its 4px; five of them is its own `min-height:151px`
     (`proto:1143`), which is what the calc below resolves to at the default. */
  .fab-bulk-inset-rows {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-height: calc(var(--fab-bulk-inset-rows, 5) * 31px - var(--fab-space-1));
    align-content: flex-start;
  }

  /* ── THE ROW, ROOTED AT THIS COMPONENT (see the header) ──────────────────────────────────
     `proto:1146` draws a row as `padding:6px 9px; border-radius:7px` on `--bg1` with a hairline,
     in `600 10.5px`. The 6px is `--fab-space-chip`, the scale's dense step — a 4 would make every
     row 4px shorter than the reference's, which is the dimension M24 asks for — and the 9 is
     `--fab-space-2`, the nearest step. It is a real `<button>` because a row here is a control. */
  :global(.fab-bulk-inset .fab-bulk-inset-row) {
    appearance: none;
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-1);
    color: var(--fab-text-secondary);
    font-family: inherit;
    font-size: 0.66rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  :global(.fab-bulk-inset button.fab-bulk-inset-row:hover:not(:disabled)) {
    border-color: var(--fab-border-strong);
  }

  /* The three staged paints (`proto:5601`-`5604`): a chosen or added row on the accent pair, a
     removal on the danger pair — the direction has to survive a monochrome render, so the glyph
     carries it too. `is-staged` is the reference's `add`/`on` face; `is-removing` its `rem`. */
  :global(.fab-bulk-inset .fab-bulk-inset-row.is-staged) {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  :global(.fab-bulk-inset .fab-bulk-inset-row.is-removing) {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }

  :global(.fab-bulk-inset .fab-bulk-inset-row:disabled) {
    color: var(--fab-text-disabled);
    cursor: default;
  }

  :global(.fab-bulk-inset button.fab-bulk-inset-row:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  :global(.fab-bulk-inset .fab-bulk-inset-row > i) {
    flex: 0 0 auto;
    width: 9px;
    font-size: 0.5rem;
  }

  :global(.fab-bulk-inset .fab-bulk-inset-name) {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* `proto:5573`: the `n/N` count in the mono face at 9px/600, subtle, pinned to the trailing
     edge and never wrapping. */
  :global(.fab-bulk-inset .fab-bulk-inset-meta) {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.56rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .fab-bulk-inset-empty {
    margin: 0;
    padding: var(--fab-space-3) var(--fab-space-2);
    color: var(--fab-text-disabled);
    font-size: 0.63rem;
  }

  /* The pager is lifted back to `--fab-bg-1` like the search well, so the recess reads as a card
     with two lit edges rather than as a flat band (`proto:1153`). Radius 7, not the reference's
     8: the ladder puts nothing on 8. */
  .fab-bulk-inset-pager {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    /* `proto:1153`: `padding:6px 8px`, the dense step over the scale's 8. */
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-1);
  }

  .fab-bulk-inset-range {
    color: var(--fab-text-subtle);
    font-size: 0.56rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .fab-bulk-inset-pages {
    display: flex;
    gap: var(--fab-space-chip);
    align-items: center;
    margin-left: auto;
  }

  .fab-bulk-inset-page {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-bg-0);
    color: var(--fab-text-secondary);
    font-size: 0.56rem;
    cursor: pointer;
  }

  .fab-bulk-inset-page:disabled {
    color: var(--fab-text-disabled);
    cursor: default;
  }

  .fab-bulk-inset-page:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-bulk-inset-page-label {
    min-width: 62px;
    color: var(--fab-text-secondary);
    font-size: 0.56rem;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
  }
</style>
