<!-- Svelte 5 runes mode -->
<!--
  JournalListShell is the shared chrome for the left column's two titled list
  regions (Active Runs, History): a header with the title, an optional count, and
  a sort dropdown, plus the per-column empty state. Factored into one component so
  ActiveRunsList and HistoryList do not each paste the identical header/sort/empty
  markup + CSS (which would fail the SonarCloud new-code duplication gate). The
  list body is supplied as children; the empty state replaces it when `isEmpty`.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import EmptyState from '../manager/EmptyState.svelte';
  import Select from '../../components/Select.svelte';

  let {
    titleId = '',
    kind = '',
    listName = kind,
    title = '',
    count = null,
    sortLabel = '',
    sortValue = '',
    sortOptions = [],
    onSortChange = null,
    isEmpty = false,
    emptyIcon = 'fa-inbox',
    emptyText = '',
    children,
    footer = undefined,
  } = $props();

  // MANDATORY HERE, not defensive. This component renders TWICE on one screen - Active Runs above
  // History - so a fixed caption id would give both triggers the same `aria-labelledby` target
  // and the second one would be named by the first one's caption.
  const instanceId = $props.id();
  const sortCaptionId = `${instanceId}-sort`;

  /*
   * EXACTLY ONE OF THE TWO NAMING PROPS, and which one depends on the caller's own caption.
   *
   * `sortLabel` defaults to `''`, and `aria-labelledby` pointed at an EMPTY span produces no
   * accessible name and no warning at all: the primitive warns only when all three naming props
   * are absent, and a non-empty id string satisfies that check while naming nothing. So a caller
   * that draws no caption is named by a string instead, and the two are never passed together -
   * a labelledby wins over a label wherever both are present, which would leave the string as
   * dead text free to drift from the caption it duplicates.
   */
  const captionedByLabel = $derived(String(sortLabel ?? '').trim() !== '');

  /**
   * THE PANEL'S OWN FLOOR, WHICH IS NOT THE TRIGGER'S (issue 1511, review round 1).
   *
   * The rule is stated once in `Select.svelte`'s band docblock: an `inline` caller states a
   * `minWidth` whenever its widest option label needs more than the panel's resolved width less
   * the row's chrome. This site needs one, and the first shipping of this conversion did not have
   * it - `Soonest Ready` opened the list reading `Soonest Rea…`.
   *
   * Measured in `tests/fixtures/player-select/` under Chromium and taken at the wider face: the
   * `Soonest Ready` ROW's label is 82.06px in Arial and 74.86px in Signika, at the panel's fixed
   * 12px rather than the trigger's 11.5px. A ticked row spends 52px on chrome before the label
   * gets any - 2px of panel border, 12px of panel padding, 2px of row border, 16px of row
   * padding, the 12px tick gutter and the 8px row gap - so the panel needs 82.06 + 52 = 134.06px
   * and takes the next whole pixel.
   *
   * IT DOES NOT REACH THE HEADER ROW. The floor below is the trigger's, and the header wraps
   * between a 140px and a 160px trigger; this figure moves the portaled panel only, which sits
   * outside that row's layout entirely.
   */
  const SORT_PANEL_MIN_WIDTH = 135;
</script>

<section class="journal-list-section" aria-labelledby={titleId} data-journal-list={listName}>
  <header class="journal-list-header">
    <h3 id={titleId} class="journal-list-title">
      {title}{#if count !== null}<span class="journal-list-count">{count}</span>{/if}
    </h3>
    <!-- A `<span>` RATHER THAN THE `<label>` THIS WAS (issue 1511). The control is a `<button>`
         toggling a portaled panel now, and a `<label>` forwards a caption click into it: with the
         list open, the caption's own mousedown dismisses the panel and the forwarded click
         re-opens it, so the caption could never close the list. The hook keeps its dynamic value
         and rides onto the trigger through `triggerData`, which is what keeps two instances on
         one screen distinguishable. -->
    <span class="journal-sort">
      <!-- THE CAPTION IS CONDITIONAL FOR THE SAME REASON THE NAMING PROP IS. `sortLabel` defaults
           to `''`, and an empty span is not nothing here: `.journal-sort` is an `inline-flex` row
           with a 6px gap, so a caption-less caller would draw a zero-width box and still pay for
           the gap in front of its trigger. Nothing points at the span in that state either - the
           name comes from `ariaLabel` - so it is not rendered rather than rendered empty. -->
      {#if captionedByLabel}
        <span class="journal-sort-label" id={sortCaptionId}>{sortLabel}</span>
      {/if}
      <Select
        size="inline"
        value={sortValue}
        options={sortOptions}
        ariaLabelledBy={captionedByLabel ? sortCaptionId : ''}
        ariaLabel={captionedByLabel ? '' : localize('FABRICATE.App.Journal.Sort.Fallback')}
        minWidth={SORT_PANEL_MIN_WIDTH}
        triggerData={{ 'data-journal-sort': kind }}
        onChange={(next) => onSortChange?.(next)}
      />
    </span>
  </header>

  <div class="journal-list-body" class:is-empty={isEmpty} data-journal-list-scroll>
    {#if isEmpty}
      <!--
        `compact`, because this panel shares a half-height column with a sibling list: the
        base variant's 44px hero inset would make an empty half taller than the rows it
        stands in for. The wrapper survives carrying the ONE property the deleted rule had
        that is the column's layout rather than the panel's box — `flex: 0 0 auto`, without
        which `.journal-list-body`'s column flex could shrink the panel and clip it.

        The hook value is DYNAMIC (`kind` is `active` or `history`) and `EmptyState` renders
        `dataValue || true`, so it is forwarded as written rather than left bare.
      -->
      <div class="journal-list-empty">
        <EmptyState
          compact
          icon={`fas ${emptyIcon}`}
          hint={emptyText}
          dataAttr="data-journal-empty"
          dataValue={kind}
        />
      </div>
    {:else}
      {@render children?.()}
    {/if}
  </div>
  {#if footer}
    <footer class="journal-list-footer">{@render footer()}</footer>
  {/if}
</section>

<style>
  /* Each list region takes an equal half of the left column (flex: 1 1 0) so the
     Active Runs and History sections are always the same height regardless of
     content, and the empty state stays vertically centered in its half rather
     than collapsing the section to the top third. */
  .journal-list-section {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-height: 0;
  }

  .journal-list-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .journal-list-body.is-empty {
    justify-content: center;
    overflow: hidden;
  }

  .journal-list-footer {
    flex: 0 0 auto;
    min-width: 0;
  }

  .journal-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .journal-list-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--fab-text);
  }

  .journal-list-count {
    margin-left: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  .journal-sort {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* A WIDTH FLOOR AT THE WIDEST SORT VALUE (issue 1511). A `<select>` sized itself to its widest
     option; the `<button>` that replaces it hugs the one it is showing, so switching from
     "Soonest Ready" to "Newest" would shrink the control and shuffle the title beside it. The
     floor is the measured width of the TRIGGER showing that widest value - "Soonest Ready",
     112.64px under the Arial fallback the repository's Chromium gates render against and 105.73px
     under Foundry's own Signika, both at the `inline` rung's 11.5px - taken at the next whole
     pixel above the wider of the two and no further.

     RE-DERIVED AT REVIEW ROUND 1, and this floor MOVED: 126px stood on a recorded pair of 124.14
     and 115.80 that the fixture does not reproduce. The Arial figure was 11.50px - one whole rung
     font-size - above what the control measures, as it was at both sibling floors, so it was
     arithmetic rather than measurement.

     It stops at the measurement rather than being rounded up generously: the header row is
     `flex-wrap: wrap` with `justify-content: space-between`, so an over-sized floor wraps the
     title off its own row rather than widening the control. Measured, that row wraps between a
     140px and a 160px floor at the 280px column minimum, so 113 keeps a clear margin at both
     ends - and the open list's own shortfall is answered by `SORT_PANEL_MIN_WIDTH` above rather
     than by widening this, which would move the closed control to fix an open one.
     Ancestor-qualified, because a leading bare `:global()` is document-wide. */
  .journal-sort :global(.fabricate-select-trigger) {
    min-width: 113px;
  }

  /* THE WRAPPER ONLY: the one property that is the column's layout. See the markup. */
  .journal-list-empty {
    flex: 0 0 auto;
  }
</style>
