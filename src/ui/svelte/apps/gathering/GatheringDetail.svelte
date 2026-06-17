<!-- Svelte 5 runes mode -->
<!--
  GatheringDetail is the center column of the player gathering tab. With no
  environment selected it shows a hint to pick one from the left. With an
  environment selected it renders a header (name, biome/danger info pips,
  description, and a gathering-mode hint), the economy strip, an optional
  environment-level scene banner, then a TAB STRIP (GatheringDetailTabs) with two
  tab panels:

   - Tasks (default): for blind environments an "Attempt gathering" button (a
     blind gather omits the task id so the engine picks a candidate) plus — when
     the effective reveal policy is not `never` — a "Discovered Tasks (x/y)" list;
     for targeted environments the selectable task list. Searchable + paginated.
   - Events: the aggregate Highest-Danger + event-chance summary, then a
     searchable, paginated list of selectable event rows (GatheringEventRow).
     The list is redacted (engine sends `[]`) for a non-GM viewer of a blind
     environment, in which case a "hidden" hint is shown in place of the rows.

  Task and event rows are selectable: clicking one drives the right-column
  inspector (the task inspector carries the per-task Attempt action; the event
  inspector is read-only). `activeTab`, `selectedTaskId`, and `selectedEventId`
  are owned by GatheringView so the right column can swap inspectors with the tab.
  The blind "Attempt gathering" button and the task inspector's Attempt both call
  the `onAttempt` handler (lifted to GatheringView), which runs
  services.startGatheringAttempt and re-fetches the listing; `busy` guards against
  double-submits. Tasks and events keep independent search + pagination state.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { riskClass, riskLabel, biomeChipStyle } from '../../util/gatheringFormat.js';
  import Pagination from '../../components/Pagination.svelte';
  import GatheringDetailTabs from './GatheringDetailTabs.svelte';
  import GatheringTaskRow from './GatheringTaskRow.svelte';
  import GatheringEventRow from './GatheringEventRow.svelte';
  import EventChanceBar from './EventChanceBar.svelte';
  import LinkedScene from './LinkedScene.svelte';

  let {
    environment = null,
    services = null,
    onAttempt = null,
    busy = false,
    selectedTaskId = null,
    onSelectTask = null,
    activeTab = 'tasks',
    onTabChange = null,
    selectedEventId = null,
    onSelectEvent = null
  } = $props();

  const env = $derived(environment);
  const envId = $derived(String(env?.id ?? ''));
  const name = $derived(String(env?.name ?? ''));
  const description = $derived(String(env?.description ?? ''));
  const isBlind = $derived(env?.selectionMode === 'blind');
  const sceneUuid = $derived(String(env?.sceneUuid ?? ''));
  // The linked scene is an environment-level restriction: show its banner once,
  // above the task list, exactly when the environment is scene-gated.
  const envBlockedReasons = $derived(Array.isArray(env?.blockedReasons) ? env.blockedReasons : []);
  const sceneBlocked = $derived(sceneUuid !== '' && envBlockedReasons.some(reason => reason?.code === 'SCENE_TOKEN_BLOCKED'));
  const revealPolicy = $derived(String(env?.revealPolicy ?? 'never'));
  const tasks = $derived(Array.isArray(env?.tasks) ? env.tasks : []);
  const discoveredTasks = $derived(Array.isArray(env?.discoveredTasks) ? env.discoveredTasks : []);
  const showDiscovered = $derived(isBlind && revealPolicy !== 'never');
  const discoveredTaskCount = $derived(Number(env?.discoveredTaskCount ?? discoveredTasks.length));
  const composedTaskCount = $derived(Number(env?.composedTaskCount ?? 0));
  const blindAttemptable = $derived(env?.attemptable === true);

  // System limitation flags + (when stamina enabled) the actor's pool, surfaced
  // as a strip beneath the header. Both flags off shows nothing; both on shows
  // both items. Blind environments keep the node legend generic (per-task counts
  // are redacted in the rows themselves).
  const staminaEnabled = $derived(env?.staminaEnabled === true);
  const nodesEnabled = $derived(env?.nodesEnabled === true);
  const staminaPool = $derived(env?.staminaPool ?? null);
  const hasStaminaPool = $derived(
    staminaEnabled && staminaPool && staminaPool.current != null && staminaPool.max != null
  );

  const biomeTags = $derived(Array.isArray(env?.biomeTags) ? env.biomeTags : []);
  const danger = $derived(String(env?.risk ?? (Array.isArray(env?.dangerTags) ? env.dangerTags[0] : '') ?? ''));
  // Localize the danger value to match the GM editor's risk labels (Safe,
  // Hazardous, …); fall back to the raw value for any unmapped level.
  const dangerLabel = $derived(riskLabel(danger, localize));
  // Tier class so the danger pip's icon can escalate in colour with the risk
  // level (success -> warning -> danger); unmapped values fall back to the
  // base danger colour.
  const dangerRiskClass = $derived(riskClass(danger));

  // The GM-configured event visibility tier the engine resolved for this viewer:
  // 'dangerLevelOnly' shows only the danger pip + a risk note above the tasks,
  // 'encounterChance' adds the encounter-chance bar above the tasks, 'full' shows the
  // dedicated Events tab with the searchable event list. GMs always resolve to 'full'.
  const eventVisibility = $derived(String(env?.eventVisibility ?? 'full'));
  // The Events tab (and its tab strip) only exists in the 'full' tier; the restricted
  // tiers surface their summary above the tasks instead. effectiveTab guards against a
  // stale 'events' selection when the strip is hidden.
  const showEventsTab = $derived(eventVisibility === 'full');
  const effectiveTab = $derived(showEventsTab ? activeTab : 'tasks');

  // Environment-level "chance of encountering an event" (0..1) the engine carries
  // on the listing. > 0 shows the event bar; 0 shows the "safe" hint instead.
  const eventChance = $derived(Math.max(0, Math.min(1, Number(env?.eventChance ?? 0))));
  const hasEvent = $derived(eventChance > 0);

  // The list the center column paginates: discovered tasks for blind sites,
  // the full task list for targeted ones.
  const activeTasks = $derived(isBlind ? discoveredTasks : tasks);

  // Individual events surfaced by the engine listing. Redacted to `[]` for a
  // non-GM viewer of a blind environment, so an empty list while eventChance > 0
  // means "hidden", not "safe" (see eventsHidden below).
  const events = $derived(Array.isArray(env?.events) ? env.events : []);

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

  // Events: an independent search + pagination set, beneath the task list.
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
  // present. An empty list with a non-zero chance on a blind environment means
  // the engine redacted the events, so show a "hidden" hint instead of nothing.
  const showEventList = $derived(events.length > 0);
  const eventsHidden = $derived(events.length === 0 && eventChance > 0 && isBlind);

  // Reset search + pagination when the selected environment changes.
  $effect(() => {
    envId;
    taskPageIndex = 0;
    eventPageIndex = 0;
    taskSearchTerm = '';
    eventSearchTerm = '';
  });

  // Snap each list back to its first page if a search shrinks it past the offset.
  $effect(() => {
    if (taskPageIndex > 0 && taskPageIndex * taskPageSize >= filteredTasks.length) taskPageIndex = 0;
  });
  $effect(() => {
    if (eventPageIndex > 0 && eventPageIndex * eventPageSize >= filteredEvents.length) eventPageIndex = 0;
  });

  const titleId = 'gathering-detail-title';
</script>

{#if env == null}
  <div class="gathering-detail-state" data-gathering-detail-state="empty">
    <i class="fas fa-hand-pointer" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Gathering.Detail.SelectHint')}</p>
  </div>
{:else}
  <section
    class="gathering-detail"
    aria-labelledby={titleId}
    data-gathering-detail-state="selected"
    data-detail-environment-id={envId}
    data-selection-mode={isBlind ? 'blind' : 'targeted'}
  >
    <header class="gathering-detail-header">
      <h2 id={titleId} class="gathering-detail-title" title={name}>{name}</h2>

      {#if biomeTags.length > 0 || danger !== ''}
        <ul class="gathering-detail-pips" data-gathering-pips>
          {#each biomeTags as tag (tag.id)}
            <li
              class="gathering-detail-pip is-biome"
              style={biomeChipStyle(tag)}
              aria-label={localize('FABRICATE.App.Gathering.Detail.Pips.Biome', { value: tag.label })}
            >
              <i class={tag.icon} aria-hidden="true"></i>
              <span>{tag.label}</span>
            </li>
          {/each}
          {#if dangerLabel !== ''}
            <li
              class={`gathering-detail-pip is-danger ${dangerRiskClass}`}
              aria-label={localize('FABRICATE.App.Gathering.Detail.Pips.Danger', { value: dangerLabel })}
            >
              <i class="fas fa-skull" aria-hidden="true"></i>
              <span>{dangerLabel}</span>
            </li>
          {/if}
        </ul>
      {/if}

      {#if description !== ''}
        <p class="gathering-detail-description">{description}</p>
      {/if}

      <p class="gathering-detail-mode-hint" data-gathering-mode-hint>
        {#if sceneBlocked}
          {localize('FABRICATE.App.Gathering.Detail.SceneGateHint')}
        {:else}
          {localize(isBlind
            ? 'FABRICATE.App.Gathering.Detail.BlindHint'
            : 'FABRICATE.App.Gathering.Detail.TargetedHint')}
        {/if}
      </p>
    </header>

    {#if staminaEnabled || nodesEnabled}
      <section class="gathering-detail-economy" data-gathering-economy-strip data-economy-mode={env?.economyMode ?? 'none'}>
        {#if staminaEnabled}
          <span class="gathering-detail-economy-item">
            <i class="fas fa-bolt" aria-hidden="true"></i>
            {#if hasStaminaPool}
              <span data-gathering-stamina-pool>{localize('FABRICATE.App.Gathering.Detail.StaminaPool', { current: staminaPool.current, max: staminaPool.max })}</span>
            {:else}
              <span data-gathering-stamina-pool="none">{localize('FABRICATE.App.Gathering.Detail.StaminaPoolNone')}</span>
            {/if}
          </span>
        {/if}
        {#if nodesEnabled}
          <span class="gathering-detail-economy-item">
            <i class="fas fa-mountain" aria-hidden="true"></i>
            <span>{localize('FABRICATE.App.Gathering.Detail.NodesLegend')}</span>
          </span>
        {/if}
      </section>
    {/if}

    {#if sceneBlocked}
      <section class="gathering-detail-scene" data-gathering-scene-banner>
        <LinkedScene {sceneUuid} {services} />
      </section>
    {/if}

    {#if showEventsTab}
      <GatheringDetailTabs {activeTab} onSelect={onTabChange} />
    {/if}

    <div
      class="gathering-detail-panel"
      role={showEventsTab ? 'tabpanel' : undefined}
      id={showEventsTab ? `gathering-detail-panel-${effectiveTab}` : undefined}
      aria-labelledby={showEventsTab ? `gathering-detail-tab-${effectiveTab}` : undefined}
    >
      {#if effectiveTab === 'events'}
        <div class="gathering-detail-event" data-gathering-event-section>
          <div class="gathering-detail-event-danger">
            <span class="gathering-detail-event-caption">{localize('FABRICATE.App.Gathering.Detail.HighestDanger')}</span>
            <span class={`gathering-detail-event-level is-danger ${dangerRiskClass}`}>
              <i class="fas fa-skull" aria-hidden="true"></i>
              <span>{dangerLabel || localize('FABRICATE.App.Gathering.Detail.Risk.safe')}</span>
            </span>
          </div>

          {#if hasEvent}
            <EventChanceBar value={eventChance} />
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
      {:else}
        {#if eventVisibility === 'dangerLevelOnly'}
          <p class="gathering-detail-event-hint" data-gathering-event-risk-note>
            {localize('FABRICATE.App.Gathering.Detail.EventRiskNote')}
          </p>
        {:else if eventVisibility === 'encounterChance'}
          <div class="gathering-detail-event" data-gathering-event-summary>
            {#if hasEvent}
              <EventChanceBar value={eventChance} />
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
      {/if}
    </div>
  </section>
{/if}

<style>
  .gathering-detail-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    text-align: center;
    color: var(--fab-text-muted);
  }

  .gathering-detail-state i {
    font-size: 32px;
  }

  .gathering-detail-state p {
    margin: 0;
    font-size: 14px;
  }

  .gathering-detail {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-3);
    box-sizing: border-box;
    overflow-y: auto;
    color: var(--fab-text);
  }

  .gathering-detail-header {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .gathering-detail-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gathering-detail-pips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .gathering-detail-pip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 12px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text);
  }

  .gathering-detail-pip i {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .gathering-detail-pip.is-biome {
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-surface-raised));
    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
  }

  .gathering-detail-pip.is-biome i {
    color: var(--fab-chip-color);
  }

  /*
    The danger pip's icon escalates in colour with the environment's risk tier,
    success -> warning -> danger. The base rule is the fallback for any unmapped
    risk value; the per-tier rules below override it.
  */
  .gathering-detail-pip.is-danger i {
    color: var(--fab-danger, var(--fab-text-muted));
  }

  .gathering-detail-pip.is-danger.risk-safe i {
    color: var(--fab-success);
  }

  .gathering-detail-pip.is-danger.risk-unsafe i {
    color: color-mix(in srgb, var(--fab-success) 55%, var(--fab-warning) 45%);
  }

  .gathering-detail-pip.is-danger.risk-hazardous i {
    color: var(--fab-warning);
  }

  .gathering-detail-pip.is-danger.risk-dangerous i {
    color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-danger) 50%);
  }

  .gathering-detail-pip.is-danger.risk-deadly i,
  .gathering-detail-pip.is-danger.risk-extreme i {
    color: var(--fab-danger);
  }

  .gathering-detail-description {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fab-text);
  }

  .gathering-detail-mode-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* Environment safety readout: highest danger level + event-chance bar (or a
     "safe" hint when there is no event chance). */
  .gathering-detail-economy {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .gathering-detail-economy-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .gathering-detail-economy-item i {
    color: var(--fab-text-muted);
  }

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

  /* Events section sits beneath the tasks list, divided by a soft rule. */
  /* The active tab's content: fills the remaining column height and scrolls on
     its own, keeping the header/economy/scene strip and the tab strip pinned. */
  .gathering-detail-panel {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    overflow-y: auto;
  }

  .gathering-detail-event-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* Environment-level linked-scene banner, shown once above the task list. */
  .gathering-detail-scene {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
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
