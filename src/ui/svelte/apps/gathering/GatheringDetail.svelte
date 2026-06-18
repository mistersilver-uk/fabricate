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
  import GatheringDetailTabs from './GatheringDetailTabs.svelte';
  import GatheringTasksPanel from './GatheringTasksPanel.svelte';
  import GatheringEventsPanel from './GatheringEventsPanel.svelte';
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
  // means "hidden", not "safe" (handled inside GatheringEventsPanel, which is
  // only mounted in the 'full' tier i.e. the blind-redaction context).
  const events = $derived(Array.isArray(env?.events) ? env.events : []);

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
        <GatheringEventsPanel
          {eventChance}
          {dangerLabel}
          {dangerRiskClass}
          {events}
          {selectedEventId}
          {onSelectEvent}
          {isBlind}
        />
      {:else}
        <GatheringTasksPanel
          {isBlind}
          {showDiscovered}
          {discoveredTaskCount}
          {composedTaskCount}
          {blindAttemptable}
          {activeTasks}
          {selectedTaskId}
          {onSelectTask}
          {onAttempt}
          {busy}
          {envId}
          {eventVisibility}
          {eventChance}
          {hasEvent}
        />
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

  /* The active tab's content: fills the remaining column height and scrolls on
     its own, keeping the header/economy/scene strip and the tab strip pinned.
     The tab bodies (GatheringTasksPanel / GatheringEventsPanel) mount as direct
     children of this wrapper; each carries its own scoped section/list/search/
     pagination styles (scoped Svelte styles do NOT leak into child components). */
  .gathering-detail-panel {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    overflow-y: auto;
  }

  /* Environment-level linked-scene banner, shown once above the task list. */
  .gathering-detail-scene {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }
</style>
