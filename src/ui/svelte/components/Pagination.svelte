<!-- Svelte 5 runes mode -->
<!--
  THE browse-screen pager (issues 675, 1372, 1502).

  ── THE ROOT CLASS THIS COMPONENT EMITS ───────────────────────────────────────────
  The root `<section>` carries `fabricate-pagination` ahead of `manager-pagination`, and
  the sheet's own pager rules are rooted at THAT class rather than at `.fabricate-manager`
  (issue 1502; `design-system/spec.md` — a shared primitive's class family is rooted at the
  primitive, not at an app). It is written inline in the markup rather than composed in
  `<script>` because this component composes nothing: there is no `const classes` array to
  put it in, as there is on `ManagerButton` and `IconButton`.

  The `<nav>` is NOT the root. The descendant rules read `.fabricate-pagination
  .manager-pagination-…`, so they resolve through the `<section>`; a root written on the
  `<nav>` would leave the summary and the per-page label unpainted.

  ── WHAT THAT RE-ROOTING WIDENED, AND WHY THE SIX PLAYER CALLERS CHANGED WITH IT ──
  This component is area-agnostic and six player-app components render it — the journal
  history list, the inventory grid, the recipe browser, and the three gathering panels.
  Rooting the family at the class this component emits means the sheet's pager rules, and
  the five `.manager-icon-button` rules the two arrows match, now paint in `.fabricate-app`
  where they only ever painted in `.fabricate-manager`. TWELVE rules newly match there:
  seven Pagination rules (the bar, `-summary`, `-nav`, `-page`, `-size`, `-size select`, and
  the 28px arrow box) and five IconButton rules (the shared base block plus the `font:
  inherit` issue 1502 adds to it, `:disabled`, `:hover`, the 34px box, and the glyph rule).

  It also declares its own focus PAIR for the BUTTONS it contains: a `:focus` strip and a
  `:focus-visible` repaint at `fabricate.css:5616` and `:5634`. Buttons only, deliberately —
  the sheet comment above those rules says why an `:is(button, select)` form would delete the
  player app's inset select ring.

  Issue 1502 preserves the frame; it does not adopt the primitive's paint. Issues 1503 and
  1504 are where that adoption is decided, with their own visual review. (Written without a
  leading hash: `tests/components/theme-colour-contract.test.js` reads a four-digit issue
  number behind one as an `#RGBA` colour literal.)

  Each caller's own `:global` block is injected UNLAYERED while `styles/fabricate.css` is
  imported at `layer(modules)`, so every property a caller already declares still wins at
  any specificity. Only the REMAINDER — the sheet's longhands minus the union of every
  longhand that caller declares for that element in that state — is newly painted, and each
  caller restates its remainder at the value it rendered before. That base is mostly
  FOUNDRY CORE's, not nothing: core's `button` rule (`@layer elements.forms`) supplies
  `min-height: var(--button-size)` (2em, so 28px at its own 14px) and `font-size:
  var(--font-size-14)`, and its `select` rule supplies `height`/`line-height:
  var(--input-height)` (2rem).

  THE REMAINDER, MEASURED PER CALLER. Five callers (`inventory/InventoryGrid`,
  `crafting/RecipeBrowser`, `gathering/GatheringEnvironmentList`, `…/GatheringTasksPanel`,
  `…/GatheringEventsPanel`) declare the same block and share one remainder;
  `journal/HistoryList` declares less and has three more entries.

    element / state         | newly painted longhands        | restated | adopted (inert)
    ------------------------|--------------------------------|----------|-----------------
    .manager-pagination     | justify-content, background-*  | bg       | justify-content
    -summary                | (empty)                        | —        | —
    -nav                    | (empty)                        | —        | —
    -page                   | min-width, text-align,         | min-w,   | text-align
                            | font-weight                    | weight   |
    -size                   | (empty)                        | —        | —
    -size select            | min-width, font-* + line-height| min-w,   | font-family/-size/
                            |                                | l-height | -style/-variant/
                            |                                |          | -weight/-stretch
    .manager-icon-button    | appearance, -webkit-appearance,| min-h,   | the rest
                            | box-sizing, gap, min-width,    | font-size|
                            | min-height, line-height,       |          |
                            | font-*, padding                |          |
    …:disabled              | (empty)                        | —        | —
    …:hover                 | (empty)                        | —        | —
    .manager-icon-button i  | position, margin               | —        | both (same value)

  `journal/HistoryList` adds `padding-right/-bottom/-left` and `border-top-*` on the bar
  (it declared only `padding-top` and no rule), and `height` on the select (it declared no
  select rule at all) — all three restated. Its arrow also newly takes `flex: 0 0 28px`
  from the 28px box rule, adopted: its nav is `flex: 0 0 auto` inside a `nowrap` row whose
  summary absorbs every shrink, so the arrows are never compressed and a `flex-basis` of
  28px is the width they already had.

  WHY THE ADOPTIONS ARE INERT, once. `justify-content` cannot act because
  `.manager-pagination-size` carries `margin-left: auto`, and an auto margin takes all the
  free space before an alignment property sees it (all six render the size label; a future
  caller passing `showPageSize={false}` would make this live). `text-align` cannot act on a
  flex item whose box is its own max-content. `gap` cannot act on a button with one rendered
  child. `min-width: 0` cannot act on an arrow that never shrinks — `min-height: 0` CAN, and
  is the one that is restated, because it releases core's 2em floor and that floor is what
  actually sizes the five 26px arrows to 28px today. `padding` and `line-height` cannot move
  a glyph that `justify-content`/`align-items: center` keeps centred in a fixed box. `appearance` cannot act where the caller already declares border,
  radius, background and colour. `box-sizing`, the select's font longhands and the glyph
  rule are the same value the base already computed.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import IconButton from './IconButton.svelte';

  let {
    totalCount = 0,
    pageSize = 10,
    pageIndex = 0,
    pageSizeOptions = [10, 25, 50],
    onPageChange = () => {},
    onPageSizeChange = () => {},
    // Issue 675, opt-in and DEFAULT OFF so every manager surface renders unchanged.
    // The player Inventory's grid is a browse surface whose footer is part of its
    // frame: it states the size of what you are looking at ("Showing 1–18 of 18"),
    // which is information a player wants BEFORE there is enough to page, and a footer
    // that appears only past a threshold reads as a layout glitch rather than a
    // control. Under it the summary and the per-page selector are always present, and
    // the nav renders its (disabled) arrows rather than vanishing.
    persistent = false,
    // Issue 1372, opt-OUT and DEFAULT ON so every shipped surface renders unchanged.
    //
    // A page-size choice is a BROWSE-SCREEN control: `design-system/spec.md` puts the pagination
    // bar at the foot of a browse screen, outside the scroll area, and a GM changing how many
    // rows they see at once is changing how they read the whole list. An INSPECTOR's pager is a
    // different control with the same anatomy — it walks a fixed five-row window over one
    // record's related rows inside a 300px column, and the prototype draws it as summary plus
    // arrows with no size selector (`essences.png`). Offering one there would put a third
    // `<select>` in a column that already cannot hold two side by side, to change a number
    // nothing else on the screen refers to.
    //
    // It is a PROP ON THE PRIMITIVE rather than a second pager component: the summary, the nav,
    // the disabled-arrow rule and the range arithmetic are identical, and this is the one part
    // that differs.
    showPageSize = true,
    // Issue 1372, opt-in and DEFAULT OFF so every shipped surface renders unchanged.
    //
    // "Render the footer only when there is more than one page" — the maintainer's ruling on the
    // world catalogues, whose prototype frame draws six rows and NO foot pager (`essences.png`)
    // while the shipped screen drew a full-width `Showing 1–6 of 6 · Page 1 of 1 · Per page 25`
    // band under them. A bar that can only ever say `Page 1 of 1` states nothing the list does
    // not already show.
    //
    // It is a THIRD MODE rather than a relaxation of `persistent`, because the default is
    // neither: `persistent || totalCount > minPageSize` renders the bar for eleven rows on a
    // twenty-five-row page, which is one page but more items than the smallest offered size — so
    // the per-page selector is still a meaningful control there. This mode says the stricter
    // thing, and it is opt-in so that no other surface changes.
    //
    // `persistent` WINS if both are set, which is a contradiction rather than a case: they are
    // mutually exclusive by meaning, and one of them has to be answered first.
    //
    // THE COST, RECORDED RATHER THAN DISCOVERED: hiding the bar hides the per-page selector with
    // it, so a GM who chooses a size that fits the whole list on one page cannot choose a smaller
    // one again from this screen. It is bounded — the size is component state that resets when
    // the route unmounts, and it is unreachable at the default size on any list the choice could
    // matter for — but it is the one thing this mode gives up.
    multiPageOnly = false,
  } = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize))));
  const firstShown = $derived(totalCount === 0 ? 0 : pageIndex * pageSize + 1);
  const lastShown = $derived(Math.min((pageIndex + 1) * pageSize, totalCount));
  // Keep the footer (and its per-page selector) visible whenever a page-size choice is
  // meaningful — i.e. there are more items than the smallest available option. Otherwise
  // picking a size that fits everything on one page would hide the only control to change
  // it back. The prev/next nav still only appears when there is more than one page.
  const minPageSize = $derived(
    pageSizeOptions.length ? Math.min(pageSize, ...pageSizeOptions) : pageSize
  );
  const showPagination = $derived(
    persistent || (multiPageOnly ? totalPages > 1 : totalCount > minPageSize)
  );
  const showNav = $derived(persistent || totalPages > 1);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function goToPage(index) {
    const next = Math.max(0, Math.min(totalPages - 1, index));
    if (next !== pageIndex) onPageChange(next);
  }

  function changePageSize(value) {
    const next = Number(value);
    if (Number.isFinite(next) && next > 0 && next !== pageSize) onPageSizeChange(next);
  }
</script>

{#if showPagination}
  <section
    class="fabricate-pagination manager-pagination"
    aria-label={text('FABRICATE.Admin.Manager.Pagination.Label', 'Pagination')}
  >
    <span class="manager-pagination-summary" data-pagination-summary>
      {text('FABRICATE.Admin.Manager.Pagination.Range', 'Showing {first}–{last} of {total}')
        .replace('{first}', firstShown)
        .replace('{last}', lastShown)
        .replace('{total}', totalCount)}
    </span>
    {#if showNav}
      <nav
        class="manager-pagination-nav"
        aria-label={text('FABRICATE.Admin.Manager.Pagination.Navigation', 'Page navigation')}
      >
        <IconButton
          data-pagination-prev=""
          ariaLabel={text('FABRICATE.Admin.Manager.Pagination.Previous', 'Previous page')}
          disabled={pageIndex === 0}
          onclick={() => goToPage(pageIndex - 1)}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </IconButton>
        <span class="manager-pagination-page" data-pagination-page>
          {text('FABRICATE.Admin.Manager.Pagination.PageOf', 'Page {page} of {total}')
            .replace('{page}', pageIndex + 1)
            .replace('{total}', totalPages)}
        </span>
        <IconButton
          data-pagination-next=""
          ariaLabel={text('FABRICATE.Admin.Manager.Pagination.Next', 'Next page')}
          disabled={pageIndex >= totalPages - 1}
          onclick={() => goToPage(pageIndex + 1)}
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </IconButton>
      </nav>
    {/if}
    {#if showPageSize}
      <label class="manager-pagination-size">
        <span>{text('FABRICATE.Admin.Manager.Pagination.PerPage', 'Per page')}</span>
        <select
          value={pageSize}
          data-pagination-size
          aria-label={text('FABRICATE.Admin.Manager.Pagination.PerPageLabel', 'Rows per page')}
          onchange={(event) => changePageSize(event.currentTarget.value)}
        >
          {#each pageSizeOptions as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
    {/if}
  </section>
{/if}
