<!--
  THE browse-screen pager: a range summary, a prev/page/next nav, and a per-page `<SegmentedControl>`.
  Area-agnostic — the player app's lists render it as well as the manager's browse screens.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `totalCount` / `pageSize` / `pageIndex` / `pageSizeOptions` | numbers / number[] | `0` / `10` / `0` / `[10, 25, 50]` | The window the caller is showing, and the sizes offered. |
  | `onPageChange(index)` / `onPageSizeChange(size)` | functions | no-ops | Both are caller contracts; this component holds no state. |
  | `persistent` | boolean | `false` | Render the bar ALWAYS, with disabled arrows rather than no nav, for a browse surface whose footer is part of its frame: a footer that appears past a threshold reads as a layout glitch. |
  | `showPageSize` | boolean | `true` | Opt-OUT. The page-size control is not rendered, caption included, when the sorted union of `pageSizeOptions` and `pageSize` holds fewer than two values. A page-size choice is a BROWSE-SCREEN control; an INSPECTOR's pager walks a fixed window over one record's rows in a 300px column, where offering one changes a number nothing else on the screen refers to. A prop rather than a second component, because the summary, the nav, the disabled-arrow rule and the range arithmetic are identical. |
  | `multiPageOnly` | boolean | `false` | Opt-in THIRD MODE: render only when there is more than one page. The default is neither, and `persistent` WINS if both are set. THE COST, recorded rather than discovered: hiding the bar hides the page-size control with it, so a POINTER reader who chooses a size that fits the whole list cannot choose a smaller one again from this screen. A KEYBOARD reader is spared: each arrow key on a page-size radio commits, so the bar stays mounted while focus is inside it, moving between its own controls included, and hides once focus leaves it entirely. |
  | `ariaLabel` / `navLabel` | resolved strings | `''` | The names of the two landmarks this component emits: the region and the nav inside it. |
  | `previousLabel` / `nextLabel` / `perPageLabel` | resolved strings | `''` | The arrows' names, which are also their tooltips, and the page-size caption. |
  | `rangeTemplate` / `pageTemplate` | resolved templates | `''` | The summary over `{first}` `{last}` `{total}` and the page label over `{page}` `{total}`; whoever supplies a template, it is filled here. |
  | `density` | `'default'` \| `'compact'` | `'default'` | `compact` keeps a browse rail's bar on one row: its page-size control takes SegmentedControl's `inline` rung (the default bar takes the default rung), the "Per page" caption stays visible, and the full page sentence stays in the accessibility tree. |
  | `edge` | boolean | `false` | With `compact`, the bar closes a pane section: its rule spans the section and it pads itself by `--fab-section-inset` (`--fab-space-2` by default) inline and below. |

  Invariants:
  - THE ROOT `<section>` CARRIES `fabricate-pagination`, written inline
    because this component composes nothing. THE `<nav>` IS NOT THE ROOT: the descendant rules
    resolve through the `<section>`, so a root there would leave the summary and per-page label
    unpainted. The family declares its own focus pair for the BUTTONS it contains, buttons only;
    the page-size segments carry their own ring. Both rules are
    `openspec/specs/design-system/spec.md`'s.
  - THE PAGE-SIZE RADIOGROUP carries `data-pagination-size` and is named by the visible "Per page"
    caption through `aria-labelledby`. Its radio `name` is per instance, so two pagers on one
    screen never uncheck each other.
  - THIS COMPONENT EMITS TWO LANDMARKS — an `aria-label`led `<section>` is a REGION and the `<nav>`
    inside it is a second — so a screen drawing two bars would publish two identically named entries
    in the one list a screen-reader user navigates BY. Both names default to `''` with the fallback
    written at the USE SITE, which is the shape `tests/design-system-required-names.test.js`
    requires; callers pass a RESOLVED string, not a key. Each fallback is localized through the
    `APP_LOCALIZER` context, and a tree mounted without one draws the English.
  - AN UPDATE THAT DISABLES OR REMOVES THE FOCUSED ARROW moves focus to the other arrow while it is
    enabled, else to the checked page-size radio, else blurs the arrow and releases the hold, unless
    focus moved elsewhere meanwhile. On an arrow it moved focus to, a held Enter's repeats are
    cancelled until that key is released or pressed afresh; `tests/components/pagination.test.js`.
-->
<script>
  import { getContext } from 'svelte';

  import { fill } from '../../../utils/fillPlaceholders.js';
  import { localizeWith } from '../../../utils/localizeWithFallback.js';
  import { APP_LOCALIZER } from '../util/appLocalizer.js';
  import IconButton from './IconButton.svelte';
  import SegmentedControl from './SegmentedControl.svelte';

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
    ariaLabel = '',
    navLabel = '',
    previousLabel = '',
    nextLabel = '',
    perPageLabel = '',
    rangeTemplate = '',
    pageTemplate = '',
    density = 'default',
    edge = false,
  } = $props();

  const localize = getContext(APP_LOCALIZER);
  const copy = (key, fallback) => localizeWith(localize, key, undefined, fallback);

  const compact = $derived(density === 'compact');

  const totalPages = $derived(Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize))));
  const firstShown = $derived(totalCount === 0 ? 0 : pageIndex * pageSize + 1);
  const lastShown = $derived(Math.min((pageIndex + 1) * pageSize, totalCount));
  const minPageSize = $derived(
    pageSizeOptions.length ? Math.min(pageSize, ...pageSizeOptions) : pageSize
  );
  let holdOpen = $state(false);
  const showPagination = $derived(
    persistent || holdOpen || (multiPageOnly ? totalPages > 1 : totalCount > minPageSize)
  );
  const showNav = $derived(persistent || totalPages > 1);

  function previousPage() {
    const next = Math.max(0, Math.min(totalPages - 1, pageIndex - 1));
    if (next !== pageIndex) onPageChange(next);
  }

  function nextPage() {
    const next = Math.max(0, Math.min(totalPages - 1, pageIndex + 1));
    if (next !== pageIndex) onPageChange(next);
  }

  function changePageSize(value) {
    const next = Number(value);
    if (Number.isFinite(next) && next > 0 && next !== pageSize) onPageSizeChange(next);
  }

  const instanceId = $props.id();
  const captionId = `${instanceId}-per-page`;

  const ARROWS = '[data-pagination-prev], [data-pagination-next]';
  let bar = $state(null);
  // The arrow holding focus as an update starts, judged again once the DOM has changed.
  let noted = null;
  let stopCancel = null;

  $effect.pre(() => {
    void [pageIndex, totalPages, showNav, showPagination];
    const active = bar?.ownerDocument.activeElement;
    noted = active && bar.contains(active) && active.matches(ARROWS) ? active : null;
  });

  $effect(() => {
    void [pageIndex, totalPages, showNav, showPagination];
    const arrow = noted;
    noted = null;
    if (arrow && (!arrow.isConnected || arrow.disabled)) moveFocusOff(arrow);
  });

  // Focus that has moved to anything but the noted arrow, the body or nothing stays where it is.
  function moveFocusOff(arrow) {
    const doc = arrow.ownerDocument;
    const active = doc.activeElement;
    if (active !== arrow && active !== null && active !== doc.body) return;
    const other = arrow.matches('[data-pagination-prev]')
      ? '[data-pagination-next]'
      : '[data-pagination-prev]';
    const sibling = bar?.querySelector(other);
    const radio = bar?.querySelector('[data-pagination-size] input[type="radio"]:checked');
    if (sibling?.isConnected && !sibling.disabled) {
      sibling.focus();
      cancelHeldEnter(sibling);
    } else if (radio) radio.focus();
    else {
      if (arrow.isConnected && doc.activeElement === arrow) arrow.blur();
      holdOpen = false;
    }
  }

  // Prevents, never stops, the repeats of an Enter held from the press that moved focus here.
  function cancelHeldEnter(arrow) {
    stopCancel?.();
    const types = ['keydown', 'keyup', 'focusout'];
    const listen = (event) => {
      if (event.type !== 'keydown' || !event.repeat) stop();
      else if (event.key === 'Enter') event.preventDefault();
    };
    function stop() {
      for (const type of types) arrow.removeEventListener(type, listen);
      if (stopCancel === stop) stopCancel = null;
    }
    for (const type of types) arrow.addEventListener(type, listen);
    stopCancel = stop;
  }

  const sizeOptions = $derived(
    [
      ...new Set(
        [...pageSizeOptions, pageSize].map(Number).filter((n) => Number.isFinite(n) && n > 0)
      ),
    ]
      .sort((a, b) => a - b)
      .map((n) => ({ value: n, label: String(n) }))
  );
</script>

{#if showPagination}
  <section
    bind:this={bar}
    class="fabricate-pagination"
    class:is-compact={compact}
    class:is-edge={compact && edge}
    data-pagination-compact={compact || undefined}
    onfocusin={() => (holdOpen = true)}
    onfocusout={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) holdOpen = false;
    }}
    aria-label={ariaLabel || copy('FABRICATE.Admin.Manager.Pagination.Label', 'Pagination')}
  >
    <span class="manager-pagination-summary" data-pagination-summary>
      {fill(
        rangeTemplate ||
          copy('FABRICATE.Admin.Manager.Pagination.Range', 'Showing {first}–{last} of {total}'),
        { first: firstShown, last: lastShown, total: totalCount }
      )}
    </span>
    {#if showNav}
      <nav
        class="manager-pagination-nav"
        aria-label={navLabel ||
          copy('FABRICATE.Admin.Manager.Pagination.Navigation', 'Page navigation')}
      >
        <IconButton
          data-pagination-prev=""
          ariaLabel={previousLabel ||
            copy('FABRICATE.Admin.Manager.Pagination.Previous', 'Previous page')}
          icon="fas fa-chevron-left"
          disabled={pageIndex === 0}
          onclick={previousPage}
        />
        <span
          class="manager-pagination-page"
          class:manager-pagination-hidden={compact}
          data-pagination-page
        >
          {fill(
            pageTemplate ||
              copy('FABRICATE.Admin.Manager.Pagination.PageOf', 'Page {page} of {total}'),
            { page: pageIndex + 1, total: totalPages }
          )}
        </span>
        <IconButton
          data-pagination-next=""
          ariaLabel={nextLabel || copy('FABRICATE.Admin.Manager.Pagination.Next', 'Next page')}
          icon="fas fa-chevron-right"
          disabled={pageIndex >= totalPages - 1}
          onclick={nextPage}
        />
      </nav>
    {/if}
    {#if showPageSize && sizeOptions.length > 1}
      <span class="manager-pagination-size">
        <span id={captionId}
          >{perPageLabel || copy('FABRICATE.Admin.Manager.Pagination.PerPage', 'Per page')}</span
        >
        <SegmentedControl
          density={compact ? 'inline' : 'default'}
          options={sizeOptions}
          value={Number(pageSize)}
          groupName={`${instanceId}-size`}
          optionDataAttr="data-pagination-size-option"
          aria-labelledby={captionId}
          data-pagination-size=""
          onChange={changePageSize}
        />
      </span>
    {/if}
  </section>
{/if}
