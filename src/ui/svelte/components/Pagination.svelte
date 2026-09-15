<!--
  THE browse-screen pager: a range summary, a prev/page/next nav, and a per-page `<Select>`.
  Area-agnostic — six player-app components render it as well as the manager's browse screens.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `totalCount` / `pageSize` / `pageIndex` | numbers | `0` / `10` / `0` | The window the caller is showing. |
  | `pageSizeOptions` | number[] | `[10, 25, 50]` | The sizes offered. |
  | `onPageChange(index)` / `onPageSizeChange(size)` | functions | no-ops | Both are caller contracts; this component holds no state. |
  | `persistent` | boolean | `false` | Render the bar ALWAYS, with disabled arrows rather than no nav. For a browse surface whose footer is part of its frame: it states the size of what you are looking at, which a reader wants BEFORE there is enough to page, and a footer that appears past a threshold reads as a layout glitch. |
  | `showPageSize` | boolean | `true` | Opt-OUT. A page-size choice is a BROWSE-SCREEN control; an INSPECTOR's pager walks a fixed window over one record's rows in a 300px column, and offering one there changes a number nothing else on the screen refers to. A prop rather than a second component, because the summary, the nav, the disabled-arrow rule and the range arithmetic are identical. |
  | `multiPageOnly` | boolean | `false` | Opt-in THIRD MODE: render only when there is more than one page. The default is neither — `persistent \|\| totalCount > minPageSize` renders the bar for eleven rows on a twenty-five-row page, where the per-page selector is still meaningful. `persistent` WINS if both are set. THE COST, recorded rather than discovered: hiding the bar hides the per-page selector with it, so a reader who chooses a size that fits the whole list cannot choose a smaller one again from this screen. |
  | `label` / `navLabel` | resolved strings | `''` | The names of the two landmarks this component emits. |

  Invariants:
  - THE ROOT `<section>` CARRIES `fabricate-pagination` AHEAD OF `manager-pagination`, and the
    sheet's pager rules are rooted at THAT class rather than at `.fabricate-manager`. It is written
    inline because this component composes nothing. THE `<nav>` IS NOT THE ROOT: the descendant
    rules resolve through the `<section>`, so a root on the `<nav>` would leave the summary and the
    per-page label unpainted.
  - THE FAMILY DECLARES ITS OWN FOCUS PAIR FOR THE BUTTONS IT CONTAINS, a `:focus` strip and a
    `:focus-visible` repaint. BUTTONS ONLY, deliberately: an `:is(button, select)` form would
    delete the player app's inset select ring, as the sheet's own comment above those rules says.
  - THIS COMPONENT EMITS TWO LANDMARKS — a `<section>` with an `aria-label` is a REGION and the
    `<nav>` inside it is a second — so a screen drawing two bars would publish two identically
    named entries in the one list a screen-reader user navigates BY. Both names default to `''`
    with the fallback written at the USE SITE rather than as the prop's default, which is the
    shape `tests/design-system-required-names.test.js` requires: a hard-coded English default is a
    name `game.i18n` never sees, and a bare `aria-label={label}` over an empty default suppresses
    the element's own name. Callers pass a RESOLVED string, not a key.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import IconButton from './IconButton.svelte';
  import Select from './Select.svelte';

  let {
    totalCount = 0,
    pageSize = 10,
    pageIndex = 0,
    pageSizeOptions = [10, 25, 50],
    onPageChange = () => {},
    onPageSizeChange = () => {},
    persistent = false,
    showPageSize = true,
    multiPageOnly = false,
    label = '',
    navLabel = '',
  } = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize))));
  const firstShown = $derived(totalCount === 0 ? 0 : pageIndex * pageSize + 1);
  const lastShown = $derived(Math.min((pageIndex + 1) * pageSize, totalCount));
  // The footer stays visible whenever a page-size choice is meaningful — more items than the
  // smallest available option — so picking a size that fits everything on one page does not hide
  // the only control to change it back. The nav still appears only past one page.
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

  /**
   * THE PER-PAGE CONTROL'S ACCESSIBLE NAME IS THE VISIBLE CAPTION ITSELF: a name that does not
   * BEGIN with the visible words fails WCAG 2.5.3 for speech input, and pointing at the caption is
   * the fix the two strings cannot drift apart under. `$props.id()` rather than a module counter,
   * so two pagers on one screen do not point their triggers at the same caption.
   */
  const instanceId = $props.id();
  const captionId = `${instanceId}-per-page`;

  /**
   * The page sizes as the shared select's option shape. The values stay NUMBERS — `Select`
   * stringifies them for the primitive's option identity and hands the caller's typed value back —
   * so `changePageSize`'s coercion is kept only because `onPageSizeChange` is a caller contract.
   */
  const sizeOptions = $derived(
    pageSizeOptions.map((option) => ({ value: option, label: String(option) }))
  );
</script>

{#if showPagination}
  <section
    class="fabricate-pagination manager-pagination"
    aria-label={label || text('FABRICATE.Admin.Manager.Pagination.Label', 'Pagination')}
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
        aria-label={navLabel ||
          text('FABRICATE.Admin.Manager.Pagination.Navigation', 'Page navigation')}
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
      <!-- A `<span>` RATHER THAN A `<label>`, and the reason is the CLICK rather than the name: a
           `<label>` also FORWARDS a caption click into the control, whose panel is dismissed on
           `mousedown` in the capture phase while open, so the caption could never CLOSE the list.
           The caption is named through `aria-labelledby` because there is no `id`-bearing
           labelable element for a `for` to address. The class survives unchanged. -->
      <span class="manager-pagination-size">
        <span id={captionId}>{text('FABRICATE.Admin.Manager.Pagination.PerPage', 'Per page')}</span>
        <Select
          size="inline"
          showTick={false}
          value={pageSize}
          options={sizeOptions}
          ariaLabelledBy={captionId}
          triggerData={{ 'data-pagination-size': '' }}
          onChange={changePageSize}
        />
      </span>
    {/if}
  </section>
{/if}
