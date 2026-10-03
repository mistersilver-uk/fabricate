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
  import Callout from '../../components/Callout.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import Kicker from '../../components/Kicker.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
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
    isBlind = false,
  } = $props();

  const hasEvent = $derived(eventChance > 0);

  const pageSizeOptions = [6, 9, 12];

  // Events: an independent search + pagination set.
  let eventSearchTerm = $state('');
  const normalizedEventSearch = $derived(eventSearchTerm.trim().toLowerCase());
  const filteredEvents = $derived(
    events.filter(
      (event) =>
        !normalizedEventSearch ||
        `${event?.name ?? ''} ${event?.description ?? ''}`
          .toLowerCase()
          .includes(normalizedEventSearch)
    )
  );
  let eventPageIndex = $state(0);
  let eventPageSize = $state(6);
  const paginatedEvents = $derived(
    filteredEvents.slice(eventPageIndex * eventPageSize, (eventPageIndex + 1) * eventPageSize)
  );

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
    if (eventPageIndex > 0 && eventPageIndex * eventPageSize >= filteredEvents.length)
      eventPageIndex = 0;
  });
</script>

<InspectorCard class="gathering-detail-event" data-gathering-event-section="">
  <div class="gathering-detail-event-danger">
    <Kicker as="span">{localize('FABRICATE.App.Gathering.Detail.HighestDanger')}</Kicker>
    <span class={`gathering-detail-event-level is-danger ${dangerRiskClass}`}>
      <i class="fas fa-skull" aria-hidden="true"></i>
      <span>{dangerLabel || localize('FABRICATE.App.Gathering.Detail.Risk.safe')}</span>
    </span>
  </div>

  <!--
    TWO SENTENCES, TWO ANSWERS, AND THE BRANCH IS WHAT SEPARATES THEM (issue 1514).

    `EventSafeHint` converts and `EventChanceHint` does NOT, and the deciding question is the
    routing rule's own: is this a statement about the WORLD, or a caption for a CONTROL?
    "No events can occur here" is true of this environment whether or not anything is drawn
    beside it, which is the standing statement `Callout` owns — and its twin renders the same
    sentence in `GatheringTasksPanel` under the same tier, so the two are converted together
    rather than drawn two ways. "Your chance of encountering an event while gathering here" is
    a caption for the bar on the line directly above it: it documents a control, says nothing
    about the world, and reads as a label rather than as a strip. A caption is neither
    primitive's, so it stays the bare 12px line it has always been and is RECORDED as the shape
    the set does not name — in the ruled-out register the specification actually maintains,
    which is the "ruled-out register is part of the specification" requirement in
    `openspec/specs/design-system/spec.md` and section 15 of
    `openspec/specs/design-system/library.html`. An earlier draft sent it to "the register
    (issue 1519)"; that number is the geometry sweep's, a different programme, and no entry ever
    landed anywhere. A deferral that lives only in a `why` string and a source comment is not
    recorded at all, which is the whole point of the register having a home.

    THE MEASUREMENT, so the deferral is not re-litigated: converted, this line rendered
    432.3x44.39 against the 432.3x15 its `<p>` draws — a +29.39px growth plus a 1px
    `--fab-info-border` edge, an r11 corner, a `--fab-info-soft` fill and a 12px inset, all of
    it around a caption for the 6px track above. `.gathering-detail-event-hint` therefore
    survives in this file; its twin in `GatheringTasksPanel` does not, because both of that
    file's sentences convert.
  -->
  {#if hasEvent}
    <ChanceBar value={eventChance} scale="event" />
    <p class="gathering-detail-event-hint">
      {localize('FABRICATE.App.Gathering.Detail.EventChanceHint')}
    </p>
  {:else}
    <Callout
      tone="info"
      text={localize('FABRICATE.App.Gathering.Detail.EventSafeHint')}
      data-gathering-safe-hint
    />
  {/if}
</InspectorCard>

{#if showEventList}
  <section class="gathering-detail-section" data-gathering-events-section>
    <header class="gathering-detail-section-head">
      <h3 class="gathering-detail-section-title">
        {localize('FABRICATE.App.Gathering.Detail.EventsHeading')}
      </h3>
      <ManagerSearchField
        class="gathering-detail-search"
        bind:value={eventSearchTerm}
        placeholder={localize('FABRICATE.App.Gathering.Detail.EventSearchPlaceholder')}
        ariaLabel={localize('FABRICATE.App.Gathering.Detail.EventSearchLabel')}
        inputProps={{ 'data-gathering-event-search': '' }}
      />
    </header>

    {#if filteredEvents.length === 0}
      <EmptyState
        note
        hint={localize('FABRICATE.App.Gathering.Detail.NoEventMatches')}
        data-gathering-no-event-matches
      />
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
          onPageChange={(n) => (eventPageIndex = n)}
          onPageSizeChange={(n) => {
            eventPageSize = n;
            eventPageIndex = 0;
          }}
        />
      </div>
    {/if}
  </section>
{:else if eventsHidden}
  <EmptyState
    note
    hint={localize('FABRICATE.App.Gathering.Detail.EventsHiddenHint')}
    data-gathering-events-hidden
  />
{/if}

<style>
  .gathering-detail-event-danger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  /* The caption under the event chance bar. It survives the issue-1514 conversion because a
     caption for a control is not a standing statement about the world — see the comment above
     the branch that renders it. */
  .gathering-detail-event-hint {
    margin: 0;
    font-size: 12px;
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

  /* The field's slot in this wrapping row; its box is the shared field's own. */
  .gathering-detail-section-head > :global(.gathering-detail-search) {
    flex: 1 1 160px;
    min-width: 140px;
  }

  .gathering-detail-event-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }
</style>
