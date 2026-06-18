<!-- Svelte 5 runes mode -->
<!--
  GatheringEventsPanel is the Events tab body of GatheringDetail (only mounted in
  the 'full' event-visibility tier). It renders the aggregate Highest-Danger +
  event-chance summary, then a searchable, paginated list of selectable event
  rows (GatheringEventRow). The list is redacted (engine sends `[]`) for a non-GM
  viewer of a blind environment, in which case a "hidden" hint is shown in place
  of the rows. Search + pagination state is owned here, independent of the tasks
  panel. Selecting a row drives the right-column event inspector via onSelectEvent.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import GatheringEventRow from './GatheringEventRow.svelte';
  import ChanceBar from './ChanceBar.svelte';

  let {
    eventChance = 0,
    dangerLabel = '',
    dangerRiskClass = '',
    events = [],
    selectedEventId = null,
    onSelectEvent = null,
    isBlind = false
  } = $props();

  const hasEvent = $derived(eventChance > 0);

  const pageSizeOptions = [6, 9, 12];

  // Events: an independent search + pagination set.
  let eventSearchTerm = $state('');
  const normalizedEventSearch = $derived(eventSearchTerm.trim().toLowerCase());
  const filteredEvents = $derived(events.filter(event =>
    !normalizedEventSearch
    || `${event?.name ?? ''} ${event?.description ?? ''}`.toLowerCase().includes(normalizedEventSearch)
  ));
  let eventPageIndex = $state(0);
  let eventPageSize = $state(6);
  const paginatedEvents = $derived(filteredEvents.slice(eventPageIndex * eventPageSize, (eventPageIndex + 1) * eventPageSize));

  // The center column shows the event list whenever individual events are
  // present. For a blind environment, an empty list with a non-zero chance means
  // the engine redacted the events, so show a "hidden" hint instead of nothing.
  // Targeted environments simply have no individual events to list (the aggregate
  // chance is shown elsewhere), so the hint must stay blind-only.
  const showEventList = $derived(events.length > 0);
  const eventsHidden = $derived(events.length === 0 && eventChance > 0 && isBlind);

  // Reset search + pagination when the underlying events change (selected
  // environment changed).
  $effect(() => {
    events;
    eventPageIndex = 0;
    eventSearchTerm = '';
  });

  // Snap the list back to its first page if a search shrinks it past the offset.
  $effect(() => {
    if (eventPageIndex > 0 && eventPageIndex * eventPageSize >= filteredEvents.length) eventPageIndex = 0;
  });
</script>

<div class="gathering-detail-event" data-gathering-event-section>
  <div class="gathering-detail-event-danger">
    <span class="gathering-detail-event-caption">{localize('FABRICATE.App.Gathering.Detail.HighestDanger')}</span>
    <span class={`gathering-detail-event-level is-danger ${dangerRiskClass}`}>
      <i class="fas fa-skull" aria-hidden="true"></i>
      <span>{dangerLabel || localize('FABRICATE.App.Gathering.Detail.Risk.safe')}</span>
    </span>
  </div>

  {#if hasEvent}
    <ChanceBar value={eventChance} scale="event" />
    <p class="gathering-detail-event-hint">{localize('FABRICATE.App.Gathering.Detail.EventChanceHint')}</p>
  {:else}
    <p class="gathering-detail-event-hint" data-gathering-safe-hint>
      {localize('FABRICATE.App.Gathering.Detail.EventSafeHint')}
    </p>
  {/if}
</div>

{#if showEventList}
  <section class="gathering-detail-section" data-gathering-events-section>
    <header class="gathering-detail-section-head">
      <h3 class="gathering-detail-section-title">
        {localize('FABRICATE.App.Gathering.Detail.EventsHeading')}
      </h3>
      <label class="gathering-detail-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          bind:value={eventSearchTerm}
          placeholder={localize('FABRICATE.App.Gathering.Detail.EventSearchPlaceholder')}
          aria-label={localize('FABRICATE.App.Gathering.Detail.EventSearchLabel')}
          data-gathering-event-search
        />
      </label>
    </header>

    {#if filteredEvents.length === 0}
      <p class="gathering-detail-empty" data-gathering-no-event-matches>
        {localize('FABRICATE.App.Gathering.Detail.NoEventMatches')}
      </p>
    {:else}
      <div class="gathering-detail-event-list" role="list">
        {#each paginatedEvents as event (event.id)}
          <GatheringEventRow
            {event}
            selected={String(event.id) === String(selectedEventId)}
            onSelect={onSelectEvent}
          />
        {/each}
      </div>
    {/if}

    {#if filteredEvents.length > 0}
      <div class="gathering-detail-pagination">
        <Pagination
          totalCount={filteredEvents.length}
          pageSize={eventPageSize}
          pageIndex={eventPageIndex}
          {pageSizeOptions}
          onPageChange={(n) => eventPageIndex = n}
          onPageSizeChange={(n) => { eventPageSize = n; eventPageIndex = 0; }}
        />
      </div>
    {/if}
  </section>
{:else if eventsHidden}
  <p class="gathering-detail-empty" data-gathering-events-hidden>
    {localize('FABRICATE.App.Gathering.Detail.EventsHiddenHint')}
  </p>
{/if}

<style>
  .gathering-detail-event {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .gathering-detail-event-danger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .gathering-detail-event-caption {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .gathering-detail-event-level {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--fab-text);
  }

  /* Danger-tier icon colour, mirroring the header danger pip. */
  .gathering-detail-event-level.is-danger i {
    color: var(--fab-danger, var(--fab-text-muted));
  }

  .gathering-detail-event-level.is-danger.risk-safe i {
    color: var(--fab-success);
  }

  .gathering-detail-event-level.is-danger.risk-unsafe i {
    color: color-mix(in srgb, var(--fab-success) 55%, var(--fab-warning) 45%);
  }

  .gathering-detail-event-level.is-danger.risk-hazardous i {
    color: var(--fab-warning);
  }

  .gathering-detail-event-level.is-danger.risk-dangerous i {
    color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-danger) 50%);
  }

  .gathering-detail-event-level.is-danger.risk-deadly i,
  .gathering-detail-event-level.is-danger.risk-extreme i {
    color: var(--fab-danger);
  }

  .gathering-detail-event-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /*
    Sections stack at their natural height and the column (.gathering-detail,
    overflow-y: auto) scrolls. They must NOT flex-grow/shrink: with two stacked
    sections (tasks + events), `flex: 1 1 auto` + `min-height: 0` shrinks each
    box below its content, and the inner row lists (no own scroll) overflow and
    paint over the neighbouring section.
  */
  .gathering-detail-section {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .gathering-detail-section-title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
  }

  /* Section header: title on the left, search box on the right; wraps on a
     narrow column so the search input keeps a usable width. */
  .gathering-detail-section-head {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .gathering-detail-section-head .gathering-detail-section-title {
    flex: 0 1 auto;
    min-width: 0;
  }

  /* Search box, mirroring the left column's environment search. */
  .gathering-detail-search {
    position: relative;
    flex: 1 1 160px;
    min-width: 140px;
  }

  .gathering-detail-search i {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--fab-text-muted);
    pointer-events: none;
  }

  .gathering-detail-search input {
    width: 100%;
    height: 32px;
    box-sizing: border-box;
    padding: 0 10px 0 32px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  .gathering-detail-search input:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }

  .gathering-detail-event-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .gathering-detail-empty {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-detail-pagination {
    flex: 0 0 auto;
  }

  /*
    Pagination.svelte renders .manager-pagination* + .manager-icon-button markup
    that is .fabricate-manager-scoped in the GM app and therefore UNSTYLED in the
    player app. Theme it here with base --fab-* tokens (mirrors the left column).
    Scoped Svelte styles do NOT leak from the parent, so each panel carries its
    own copy of this :global override block.
  */
  .gathering-detail-pagination :global(.manager-pagination) {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) 0 0;
    border-top: 1px solid var(--fab-border);
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-detail-pagination :global(.manager-pagination-summary) {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gathering-detail-pagination :global(.manager-pagination-nav) {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .gathering-detail-pagination :global(.manager-pagination-page) {
    color: var(--fab-text);
    white-space: nowrap;
  }

  .gathering-detail-pagination :global(.manager-pagination-size) {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
    white-space: nowrap;
  }

  .gathering-detail-pagination :global(.manager-pagination-size select) {
    height: 26px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  .gathering-detail-pagination :global(.manager-icon-button) {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
  }

  .gathering-detail-pagination :global(.manager-icon-button:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  .gathering-detail-pagination :global(.manager-icon-button:hover:not(:disabled)) {
    background: var(--fab-surface-raised);
  }
</style>
