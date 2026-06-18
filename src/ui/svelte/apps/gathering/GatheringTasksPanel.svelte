<!-- Svelte 5 runes mode -->
<!--
  GatheringTasksPanel is the Tasks tab body of GatheringDetail (the default tab,
  and the only body in the restricted event-visibility tiers). It opens with the
  restricted-tier event summary the tasks share their panel with:
   - 'dangerLevelOnly': a risk note above the tasks.
   - 'encounterChance': the encounter-chance bar (or a "safe" hint) above the
     tasks.
  Then, for blind environments, an "Attempt gathering" button (a blind gather
  omits the task id so the engine picks a candidate) plus — when the effective
  reveal policy is not `never` — a "Discovered Tasks (x/y)" list; for targeted
  environments the selectable task list. Searchable + paginated, with search +
  pagination state owned here, independent of the events panel. Selecting a row
  drives the right-column task inspector via onSelectTask; the blind attempt
  button calls onAttempt with a null task id.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import GatheringTaskRow from './GatheringTaskRow.svelte';
  import ChanceBar from './ChanceBar.svelte';

  let {
    isBlind = false,
    showDiscovered = false,
    discoveredTaskCount = 0,
    composedTaskCount = 0,
    blindAttemptable = false,
    activeTasks = [],
    selectedTaskId = null,
    onSelectTask = null,
    onAttempt = null,
    busy = false,
    envId = '',
    eventVisibility = 'full',
    eventChance = 0,
    hasEvent = false
  } = $props();

  const pageSizeOptions = [6, 9, 12];

  // Tasks: a case-insensitive name+description search applied BEFORE pagination,
  // mirroring the left column's environment search.
  let taskSearchTerm = $state('');
  const normalizedTaskSearch = $derived(taskSearchTerm.trim().toLowerCase());
  const filteredTasks = $derived(activeTasks.filter(task =>
    !normalizedTaskSearch
    || `${task?.name ?? ''} ${task?.description ?? ''}`.toLowerCase().includes(normalizedTaskSearch)
  ));
  let taskPageIndex = $state(0);
  let taskPageSize = $state(6);
  const paginatedTasks = $derived(filteredTasks.slice(taskPageIndex * taskPageSize, (taskPageIndex + 1) * taskPageSize));

  // Reset search + pagination when the selected environment changes.
  $effect(() => {
    envId;
    taskPageIndex = 0;
    taskSearchTerm = '';
  });

  // Snap the list back to its first page if a search shrinks it past the offset.
  $effect(() => {
    if (taskPageIndex > 0 && taskPageIndex * taskPageSize >= filteredTasks.length) taskPageIndex = 0;
  });
</script>

{#if eventVisibility === 'dangerLevelOnly'}
  <p class="gathering-detail-event-hint" data-gathering-event-risk-note>
    {localize('FABRICATE.App.Gathering.Detail.EventRiskNote')}
  </p>
{:else if eventVisibility === 'encounterChance'}
  <div class="gathering-detail-event" data-gathering-event-summary>
    {#if hasEvent}
      <ChanceBar value={eventChance} scale="event" />
    {:else}
      <p class="gathering-detail-event-hint" data-gathering-safe-hint>
        {localize('FABRICATE.App.Gathering.Detail.EventSafeHint')}
      </p>
    {/if}
  </div>
{/if}

{#if isBlind}
  <div class="gathering-detail-blind-card" data-gathering-blind-card>
    <div class="gathering-detail-blind-card-lead">
      <i class="fas fa-mask" aria-hidden="true"></i>
      <span>{localize('FABRICATE.App.Gathering.Detail.BlindAttemptPrompt')}</span>
    </div>
    <span class="gathering-detail-blind-card-divider" aria-hidden="true"></span>
    <div class="gathering-detail-blind-card-action">
      <button
        type="button"
        class="gathering-detail-blind-attempt"
        data-gathering-blind-attempt
        disabled={!blindAttemptable || busy}
        onclick={() => onAttempt?.({ environmentId: envId, taskId: null })}
      >
        <i class="fas fa-dice" aria-hidden="true"></i>
        {localize('FABRICATE.App.Gathering.Detail.BlindAttempt')}
      </button>
    </div>
  </div>
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
            y: composedTaskCount
          })}
        </h3>
      {:else}
        <h3 class="gathering-detail-section-title">
          {localize('FABRICATE.App.Gathering.Detail.TasksHeading')}
        </h3>
      {/if}
      {#if activeTasks.length > 0}
        <label class="gathering-detail-search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input
            type="search"
            bind:value={taskSearchTerm}
            placeholder={localize('FABRICATE.App.Gathering.Detail.TaskSearchPlaceholder')}
            aria-label={localize('FABRICATE.App.Gathering.Detail.TaskSearchLabel')}
            data-gathering-task-search
          />
        </label>
      {/if}
    </header>

    {#if isBlind && activeTasks.length === 0}
      <p class="gathering-detail-empty">
        {localize('FABRICATE.App.Gathering.Detail.NothingDiscovered')}
      </p>
    {:else if filteredTasks.length === 0 && normalizedTaskSearch !== ''}
      <p class="gathering-detail-empty" data-gathering-no-task-matches>
        {localize('FABRICATE.App.Gathering.Detail.NoTaskMatches')}
      </p>
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
          onPageChange={(n) => taskPageIndex = n}
          onPageSizeChange={(n) => { taskPageSize = n; taskPageIndex = 0; }}
        />
      </div>
    {/if}
  </section>
{/if}

<style>
  /* The restricted-tier event summary that opens the tasks panel. */
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

  .gathering-detail-event-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* Blind call-to-action card: a flavour lead (icon + prompt) on the left, a
     faint partial-height divider, then the centered attempt button. */
  .gathering-detail-blind-card {
    flex: 0 0 auto;
    display: flex;
    align-items: stretch;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .gathering-detail-blind-card-lead {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 var(--fab-space-3);
    text-align: center;
    color: var(--fab-text-muted);
  }

  .gathering-detail-blind-card-lead i {
    font-size: 30px;
  }

  .gathering-detail-blind-card-lead span {
    font-size: 13px;
  }

  .gathering-detail-blind-card-divider {
    flex: 0 0 auto;
    width: 1px;
    align-self: stretch;
    margin: var(--fab-space-2) 0;
    background: var(--fab-border);
  }

  .gathering-detail-blind-card-action {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gathering-detail-blind-attempt {
    flex: 0 0 auto;
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 18px;
    border: 1px solid var(--fab-accent);
    border-radius: 6px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .gathering-detail-blind-attempt:hover:not(:disabled) {
    background: var(--fab-accent-hover);
  }

  .gathering-detail-blind-attempt:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .gathering-detail-blind-attempt:disabled {
    opacity: 0.5;
    cursor: default;
    background: var(--fab-surface-raised);
    border-color: var(--fab-border);
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

  .gathering-detail-task-list {
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
