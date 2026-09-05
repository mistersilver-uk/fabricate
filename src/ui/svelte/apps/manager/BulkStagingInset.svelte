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

  ── THE ROWS ARE THIS COMPONENT'S TOO, IN FOUR KINDS (issue 1371 r16-cat, maintainer rulings
  M24/M25 — "the two bulk panels must be structurally identical, differing only in data sources
  and write targets") ────────────────────────────────────────────────────────────────────────
  A caller may still pass `children` (the system panel's category and tag rows do), but a caller
  that passes `rows` and a `kind` gets the rows drawn HERE, from data, in one of four shapes the
  reference draws:
   - `radio`   — one chosen row; a circle glyph, filled when chosen (`proto:5296`).
   - `check`   — any number chosen; a 16px box, filled with a check when chosen (`proto:5273`).
   - `tri`     — leave / add / remove; a plus or minus glyph, the removal on the danger pair
                 (`proto:5330`).
   - `stepper` — a value per row; the essence's glyph tile, its name, an `n/N` and the shared
                 `Stepper` (`proto:1203-1211`, `proto:5627-5631`). The row is a static box
                 holding a control rather than being one.
  Every row is on a rung: 28px for a glyph row, 30px for a box row, 34px for a stepper row; the
  window below is sized from the kind so five rows always fit (156 / 166 / 186px — the reference's
  own 151 / 181 / 186).

  Props:
   - id: the inset's name, stamped as `data-bulk-inset={id}` and on every hook below, so two
     insets in one panel are distinguishable by selector.
   - kind: `children` (default) or one of the four row kinds above.
   - rows: `{id, name, state, meta?, disabled?, icon?, colorToken?, value?, active?, allowUnset?,
     min?, max?}[]` — the rows a kind draws. `state` is `on|off` for `radio` and `check`,
     `off|add|remove` for `tri`, and the caller's own word for `stepper` (stamped, never read).
   - onRow(id): a `radio` / `check` / `tri` row was pressed.
   - onStep(id, value|null): a `stepper` row's value changed; `null` when its field was cleared.
   - rowAttr / rowStateAttr: the attribute NAMES a row is stamped with, valued `row.id` and
     `row.state` (e.g. `data-world-component-bulk-option` / `-option-state`).
   - activeAttr: an optional attribute NAME stamped `"true"` / `"false"` from `row.active`
     (the system panel's `data-component-essence-active`).
   - inputAttr: an optional attribute NAME spread onto a stepper row's `<input>`, valued `row.id`.
   - rowsDisabled: inerts the rows alone (the systems inset is inert until a direction is chosen).
   - max: the stepper rows' ceiling unless a row states its own (the reference's 9).
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
  import Medallion from '../../components/Medallion.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    id = '',
    kind = 'children',
    rows = [],
    onRow = () => {},
    onStep = () => {},
    rowAttr = '',
    rowStateAttr = '',
    activeAttr = '',
    inputAttr = '',
    rowsDisabled = false,
    max = 9,
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
  // Rows plus their gaps: the window is sized from the ROW RUNG the kind draws at (28 / 30 / 34,
  // plus the 4px gap), so five of them always fit. Stated as a custom property so the height is
  // one declaration in the CSS below.
  const windowStyle = $derived(`--fab-bulk-inset-rows: ${Math.max(1, Number(minRows) || 5)}`);
  const rungClass = $derived(
    kind === 'stepper' ? 'is-rung-34' : kind === 'check' ? 'is-rung-30' : 'is-rung-28'
  );
  const drawsRows = $derived(kind !== 'children');
  const rowList = $derived(Array.isArray(rows) ? rows : []);

  function rowHooks(row) {
    const hooks = {};
    if (rowAttr) hooks[rowAttr] = row.id;
    if (rowStateAttr) hooks[rowStateAttr] = row.state ?? '';
    if (activeAttr) hooks[activeAttr] = String(Boolean(row.active));
    return hooks;
  }

  /** The glyph a `radio` or `tri` row leads with, by its state (`proto:5296`, `proto:5330`). */
  function glyphOf(state) {
    if (state === 'add') return 'fas fa-plus';
    if (state === 'remove') return 'fas fa-minus';
    if (state === 'on') return 'fas fa-circle-check';
    return 'far fa-circle';
  }

  const inert = $derived(disabled || rowsDisabled);
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
  <div class={`fab-bulk-inset-rows ${rungClass}`} style={windowStyle} {...rowsHook}>
    {#if drawsRows}
      {#each rowList as row (row.id)}
        {#if kind === 'stepper'}
          <!-- A STATIC box holding a control (`proto:1203`): the shared `Stepper` is the control,
               because a number a GM can change is a stepper. -->
          <div
            class="fab-bulk-inset-row is-stepper"
            class:is-staged={Boolean(row.active)}
            class:is-removing={row.state === 'strip'}
            {...rowHooks(row)}
          >
            <Medallion
              icon={row.icon || 'fas fa-mortar-pestle'}
              tint={row.colorToken || ''}
              size={22}
              glyph={10}
              variant="glyph-chip"
            />
            <span class="fab-bulk-inset-name">{row.name}</span>
            {#if row.meta}<span class="fab-bulk-inset-meta">{row.meta}</span>{/if}
            <Stepper
              value={row.value ?? null}
              allowUnset={row.allowUnset !== false}
              placeholder="—"
              min={row.min === undefined ? 0 : row.min}
              max={row.max ?? max}
              disabled={inert || row.disabled === true}
              ariaLabel={phrase(
                'FABRICATE.Admin.Manager.BulkEdit.EssenceValueFor',
                'Value for {name}',
                {
                  name: row.name,
                }
              )}
              decrementLabel={phrase(
                'FABRICATE.Admin.Manager.BulkEdit.EssenceStepDown',
                'Step {name} down',
                { name: row.name }
              )}
              incrementLabel={phrase(
                'FABRICATE.Admin.Manager.BulkEdit.EssenceStepUp',
                'Step {name} up',
                {
                  name: row.name,
                }
              )}
              inputProps={inputAttr ? { [inputAttr]: row.id } : {}}
              onChange={(next) => onStep(row.id, next)}
            />
          </div>
        {:else}
          <!-- A real `<button>` with `aria-pressed`, because a row here is a control: `tri` rows
               cycle three states, `check` rows toggle, `radio` rows choose. -->
          <button
            type="button"
            class="fab-bulk-inset-row"
            class:is-staged={row.state === 'on' || row.state === 'add'}
            class:is-removing={row.state === 'remove'}
            class:has-box={kind === 'check'}
            data-keyboard-focus="true"
            {...rowHooks(row)}
            aria-pressed={row.state !== 'off'}
            disabled={inert || row.disabled === true}
            onclick={() => onRow(row.id)}
          >
            {#if kind === 'check'}
              <!-- DECORATIVE: the row is the control and `aria-pressed` states the value; the box
                   paints it where the reference paints it (`proto:5273`). -->
              <span class="fab-bulk-inset-box" class:is-on={row.state !== 'off'} aria-hidden="true">
                {#if row.state !== 'off'}<i class="fas fa-check"></i>{/if}
              </span>
            {:else}
              <i class={glyphOf(row.state)} aria-hidden="true"></i>
            {/if}
            <span class="fab-bulk-inset-name">{row.name}</span>
            {#if row.meta}<span class="fab-bulk-inset-meta">{row.meta}</span>{/if}
          </button>
        {/if}
      {:else}
        <p class="fab-bulk-inset-empty" data-bulk-inset-empty={id}>{empty}</p>
      {/each}
    {:else if hasRows}
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
     field is the WELL and not a second box inside it. STRETCHED to the well's height (issue 1371
     r17-b): with `height: auto` alone the field was an 11px strip on the well's centre line, so a
     click in the well's upper or lower third focused nothing — the whole well is the control. */
  .fab-bulk-inset-search input {
    flex: 1 1 auto;
    align-self: stretch;
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
    /* A 28px row plus its 4px gap per row, less the last gap (M24: rows sit on rungs now, so the
       window is the rung's arithmetic — five glyph rows are 156px). */
    min-height: calc(
      var(--fab-bulk-inset-rows, 5) * (28px + var(--fab-space-1)) - var(--fab-space-1)
    );
    align-content: flex-start;
  }

  /* The box rows are on the 30 rung (five: 166px) and the stepper rows on 34 (five: 186px, the
     reference's own `min-height:186px` at `proto:1200`). */
  .fab-bulk-inset-rows.is-rung-30 {
    min-height: calc(
      var(--fab-bulk-inset-rows, 5) * (30px + var(--fab-space-1)) - var(--fab-space-1)
    );
  }

  .fab-bulk-inset-rows.is-rung-34 {
    min-height: calc(
      var(--fab-bulk-inset-rows, 5) * (34px + var(--fab-space-1)) - var(--fab-space-1)
    );
  }

  /* ── THE ROW, ROOTED AT THIS COMPONENT (see the header) ──────────────────────────────────
     `proto:1146` draws a row as `padding:6px 9px; border-radius:7px` on `--bg1` with a hairline,
     in `600 10.5px` — a 27px row, which is the 28 rung (M24). FIXED at the rung rather than padded
     to it, so the height holds whatever the host's button line-height does; the 9px inset is
     `--fab-space-2`, the nearest step. It is a real `<button>` because a row here is a control. */
  :global(.fab-bulk-inset .fab-bulk-inset-row) {
    appearance: none;
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    width: 100%;
    min-width: 0;
    height: 28px;
    min-height: 28px;
    margin: 0;
    padding: 0 var(--fab-space-2);
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

  /* THE BOX ROW (`proto:5273`, the world catalogue's systems): `7px 9px` around a 15px check box
     — a 33px row, the 30 rung, with a 16px box so the row centres on the 4px scale; the box's 5px
     corner takes the ladder's 6 for a control at or under 24px. Its name is the reference's
     11px/600 SERIF where the glyph rows' is 10.5px sans. */
  :global(.fab-bulk-inset .fab-bulk-inset-row.has-box) {
    height: 30px;
    min-height: 30px;
  }

  :global(.fab-bulk-inset .fab-bulk-inset-row.has-box .fab-bulk-inset-name),
  :global(.fab-bulk-inset .fab-bulk-inset-row.is-stepper .fab-bulk-inset-name) {
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 0.68rem;
  }

  :global(.fab-bulk-inset .fab-bulk-inset-box) {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 6px;
    color: var(--fab-on-accent);
    font-size: 0.5rem;
  }

  :global(.fab-bulk-inset .fab-bulk-inset-box.is-on) {
    border-color: var(--fab-accent);
    background: var(--fab-accent);
  }

  /* THE STEPPER ROW (`proto:1203`, `proto:5627`): `5px 9px` around a 22px tile and a 22px
     stepper — a 34px row, which is a rung — as a STATIC box holding a control rather than being
     one. It keeps the row family's paint and only stops being a pointer target. */
  :global(.fab-bulk-inset .fab-bulk-inset-row.is-stepper) {
    height: 34px;
    min-height: 34px;
    cursor: default;
  }

  /* THE STEPPER'S SLOT HAS NO INTRINSIC WIDTH, so its input is capped in this layout context
     rather than by the primitive (see `Stepper.svelte`'s `fill` note): the reference's value
     column is 26px, and the shared 48px would push the `n/N` off the row in a 320px rail. */
  :global(.fab-bulk-inset .fab-bulk-inset-row.is-stepper .fab-stepper) {
    flex: 0 0 auto;
  }

  :global(.fab-bulk-inset .fab-bulk-inset-row.is-stepper .fab-stepper-input) {
    width: 30px;
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

  /* `proto:5200`'s `pageBtn` (and `proto:1207`'s stepper adjunct): a 22px square on a 6px corner,
     which with the pager's `6px 8px` inset is the reference's 36px band (M24). */
  .fab-bulk-inset-page {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
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
