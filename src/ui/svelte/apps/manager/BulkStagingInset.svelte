<!--
  ONE STAGING INSET, as the reference draws it (issue 1371 r16-list): a recessed card holding a 28px
  search well, a FIXED window of rows, and a pager. The system Component Rules bulk panel draws it
  three times and the world Component catalogue's panel draws the same object three more.

  The well, the rows container and the pager are identical in all six and only the ROWS differ, so
  the rows are `children` and everything around them is this file. The world panel is NOT re-pointed
  at it in the same change because that file is being re-geometried in a parallel lane (maintainer
  ruling M24); it is the intended second caller, and `tests/design-system-primitives.test.js` is
  what will notice when it arrives.

  THE ROWS CARRY THIS COMPONENT'S CLASSES, NOT THE CALLER'S. A snippet rendered as `children` carries
  the scope hash of the component that DEFINES it, so a scoped `.fab-bulk-inset-row` here would match
  nothing a caller writes. The row rules below are therefore `:global()` and ROOTED AT THIS
  COMPONENT'S OWN ROOT, which is the design-system rule for a class family a shared primitive paints.

  A caller may still pass `children`, but one that passes `rows` and a `kind` gets the rows drawn
  HERE, in one of four shapes: `radio` (one chosen), `check` (any number), `tri` (leave / add /
  remove, the removal on the danger pair) and `stepper` (a value per row, a static box holding a
  control rather than being one). Every row is on a rung — 28px for a glyph row, 30px for a box row,
  34px for a stepper row — and the window is sized from the kind so five rows always fit.

  Props:
  | prop | contract |
  | --- | --- |
  | `id` | the inset's name, stamped as `data-bulk-inset={id}` and on every hook, so two insets in one panel are distinguishable by selector |
  | `kind` / `rows` / `onRow(id)` / `onStep(id, value\|null)` | the row kind, its data, and the two row callbacks; `state` is `on\|off` for `radio` and `check`, `off\|add\|remove` for `tri`, and the caller's own word for `stepper`, which is stamped and never read. `onStep` receives `null` when a field is cleared. |
  | `rowAttr` / `rowStateAttr` / `activeAttr` / `inputAttr` / `rowsAttr` | attribute NAMES, valued `row.id`, `row.state`, `row.active` and `row.id` respectively |
  | `rowsDisabled` / `disabled` / `max` / `minRows` | inert the rows alone, inert the well and pager, the stepper ceiling unless a row states its own, and the window's height in rows |
  | `query` / `onQuery(next)` / `placeholder` | the search well's value, its change, and its placeholder AND accessible name |
  | `page` / `onPage(index)` / `empty` / `hasRows` | `pageBulkInsetRows`'s output, the pager's request, the already-localized empty sentence, and whether `children` renders anything |
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
      aria-label={placeholder || undefined}
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
  /* THEME-ROOT tokens only: a scoped block may not reach an area-scoped property from any
     directory. THE STAGING INSET is a recess one rung BELOW the panel, hairline, radius 9 — the
     spec's well rung and the reference's own value — with its 9px padding on `--fab-space-2`. */
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

  /* Foundry core sizes every `<input>` to its own height and border; both are reset so the field is
     the WELL, not a box inside it, and STRETCHED to the well's height (issue 1371 r17-b), or a click
     in its upper or lower third focuses nothing. */
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

  /* THE WINDOW IS A FIXED HEIGHT, which is why the reference draws a pager on it: a list that grew
     and shrank with its search would move the groups below it on every keystroke. The calc below
     resolves to the reference's own five-row minimum at the default. */
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

  /* THE ROW, ROOTED AT THIS COMPONENT (see the header): the reference's 27px row on the 28 rung
     (M24), FIXED at the rung rather than padded to it, so the height holds whatever the host's
     button line-height does. A real `<button>`, because a row here is a control. */
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

  /* THE BOX ROW (the world catalogue's systems): the 30 rung, with a 16px box so the row centres on
     the 4px scale and the ladder's 6 for a control at or under 24px. Its name is SERIF. */
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
