<!-- Svelte 5 runes mode -->
<!--
  GatheringTasksPanel is the Tasks tab body of GatheringDetail (the default tab,
  and the only body in the restricted event-visibility tiers). It opens with the
  restricted-tier event summary the tasks share their panel with:
   - 'dangerLevelOnly': a risk note above the tasks.
   - 'encounterChance': the encounter-chance bar (or a "safe" hint) above the
     tasks.
  Then, for blind environments — when the effective reveal policy is not `never` —
  a "Discovered Tasks (x/y)" list; for targeted environments the selectable task
  list. Searchable + paginated, with search + pagination state owned here,
  independent of the events panel. Selecting a row drives the right-column task
  inspector via onSelectTask. The panel draws no action: the blind gather is the
  primary of GatheringDetail's identity header.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Callout from '../../components/Callout.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import GatheringTaskRow from './GatheringTaskRow.svelte';
  import ChanceBar from './ChanceBar.svelte';

  let {
    isBlind = false,
    showDiscovered = false,
    discoveredTaskCount = 0,
    composedTaskCount = 0,
    activeTasks = [],
    selectedTaskId = null,
    onSelectTask = null,
    envId = '',
    eventVisibility = 'full',
    eventChance = 0,
    hasEvent = false,
  } = $props();

  const pageSizeOptions = [6, 9, 12];

  // Tasks: a case-insensitive name+description search applied BEFORE pagination,
  // mirroring the left column's environment search.
  let taskSearchTerm = $state('');
  const normalizedTaskSearch = $derived(taskSearchTerm.trim().toLowerCase());
  const filteredTasks = $derived(
    activeTasks.filter(
      (task) =>
        !normalizedTaskSearch ||
        `${task?.name ?? ''} ${task?.description ?? ''}`
          .toLowerCase()
          .includes(normalizedTaskSearch)
    )
  );
  let taskPageIndex = $state(0);
  let taskPageSize = $state(6);
  const paginatedTasks = $derived(
    filteredTasks.slice(taskPageIndex * taskPageSize, (taskPageIndex + 1) * taskPageSize)
  );

  // Reset search + pagination when the selected environment changes.
  $effect(() => {
    envId;
    taskPageIndex = 0;
    taskSearchTerm = '';
  });

  // Snap the list back to its first page if a search shrinks it past the offset.
  $effect(() => {
    if (taskPageIndex > 0 && taskPageIndex * taskPageSize >= filteredTasks.length)
      taskPageIndex = 0;
  });
</script>

<!--
  Both restricted-tier statements are `Callout` (issue 1514). Each is DOCUMENTATION in the
  routing rule's sense — always true of this environment's tier, and still true a moment before
  and after the player acts — which is what separates a callout from a notice. Neither carried a
  role, and `Callout` adds `role="note"` only when it is given a title or actions, so the
  accessible tree is unchanged. Both were BARE 12px muted paragraphs with no box of their own,
  so this conversion GAINS the strip's edge, fill and inset; that is a published frame move, not
  a preserved one, and it is what makes the two statements read as the same kind of thing as the
  standing statements every other player surface now draws.
-->
{#if eventVisibility === 'dangerLevelOnly'}
  <Callout
    tone="info"
    text={localize('FABRICATE.App.Gathering.Detail.EventRiskNote')}
    data-gathering-event-risk-note
  />
{:else if eventVisibility === 'encounterChance'}
  <InspectorCard class="gathering-detail-event" data-gathering-event-summary="">
    {#if hasEvent}
      <ChanceBar value={eventChance} scale="event" />
    {:else}
      <Callout
        tone="info"
        text={localize('FABRICATE.App.Gathering.Detail.EventSafeHint')}
        data-gathering-safe-hint
      />
    {/if}
  </InspectorCard>
{/if}

{#if !isBlind || showDiscovered}
  <section
    class="gathering-detail-section"
    data-gathering-tasks-section
    data-gathering-discovered={isBlind ? 'true' : undefined}
  >
    <header class="gathering-detail-section-head">
      {#if isBlind}
        <h3 class="gathering-detail-section-title">
          {localize('FABRICATE.App.Gathering.Detail.DiscoveredHeading', {
            x: discoveredTaskCount,
            y: composedTaskCount,
          })}
        </h3>
      {:else}
        <h3 class="gathering-detail-section-title">
          {localize('FABRICATE.App.Gathering.Detail.TasksHeading')}
        </h3>
      {/if}
      {#if activeTasks.length > 0}
        <SearchField
          class="gathering-detail-search"
          bind:value={taskSearchTerm}
          placeholder={localize('FABRICATE.App.Gathering.Detail.TaskSearchPlaceholder')}
          ariaLabel={localize('FABRICATE.App.Gathering.Detail.TaskSearchLabel')}
          inputProps={{ 'data-gathering-task-search': '' }}
        />
      {/if}
    </header>

    {#if isBlind && activeTasks.length === 0}
      <EmptyState note hint={localize('FABRICATE.App.Gathering.Detail.NothingDiscovered')} />
    {:else if filteredTasks.length === 0 && normalizedTaskSearch !== ''}
      <!--
        `note`, not `filtered`, even though this IS the filtered branch: `filtered` keeps the
        dashed panel and this is a one-line empty inside a pane, so the box is what the
        frame-move rule forbids. The filtered/unfiltered distinction stays where it already
        lives — in the hook value and in the sentence.
      -->
      <EmptyState
        note
        hint={localize('FABRICATE.App.Gathering.Detail.NoTaskMatches')}
        data-gathering-no-task-matches
      />
    {:else if filteredTasks.length > 0}
      <div class="gathering-detail-task-list" role="list">
        {#each paginatedTasks as gatheringTask (gatheringTask.id)}
          <GatheringTaskRow
            task={gatheringTask}
            selected={String(gatheringTask.id) === String(selectedTaskId)}
            onSelect={onSelectTask}
          />
        {/each}
      </div>
    {/if}

    {#if filteredTasks.length > 0}
      <div class="gathering-detail-pagination">
        <Pagination
          totalCount={filteredTasks.length}
          pageSize={taskPageSize}
          pageIndex={taskPageIndex}
          {pageSizeOptions}
          onPageChange={(n) => (taskPageIndex = n)}
          onPageSizeChange={(n) => {
            taskPageSize = n;
            taskPageIndex = 0;
          }}
        />
      </div>
    {/if}
  </section>
{/if}

<style>
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
    gap: var(--fab-space-chip);
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

  .gathering-detail-task-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }
</style>
