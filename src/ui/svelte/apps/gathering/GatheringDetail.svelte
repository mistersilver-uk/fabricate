<!-- Svelte 5 runes mode -->
<!--
  GatheringDetail is the center column of the player gathering tab. With no
  environment selected it shows a hint to pick one from the left. With an
  environment selected it renders a header (name, biome/region/danger info pips,
  description, and a gathering-mode hint) plus a mode-aware attempt area:

   - Blind environments: an "Attempt gathering" button (a blind gather omits the
     task id so the engine picks a candidate), and — when the effective reveal
     policy is not `never` — a paginated "Discovered Tasks (x/y)" list of
     selectable task rows.
   - Targeted environments: the selectable task list, with no discovered heading.

  Task rows are read-only and selectable: clicking one drives the right-column
  inspector (which carries the per-task Attempt action). The blind "Attempt
  gathering" button and the inspector's Attempt both call the `onAttempt` handler
  (lifted to GatheringView), which runs services.startGatheringAttempt and
  re-fetches the listing; `busy` guards against double-submits.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import GatheringTaskRow from './GatheringTaskRow.svelte';
  import LinkedScene from './LinkedScene.svelte';

  let {
    environment = null,
    services = null,
    onAttempt = null,
    busy = false,
    selectedTaskId = null,
    onSelectTask = null
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

  const biomeTags = $derived(Array.isArray(env?.biomeTags) ? env.biomeTags : []);
  const region = $derived(String(env?.region ?? ''));
  const danger = $derived(String(env?.risk ?? (Array.isArray(env?.dangerTags) ? env.dangerTags[0] : '') ?? ''));
  // Localize the danger value to match the GM editor's risk labels (Safe,
  // Hazardous, …); fall back to the raw value for any unmapped level.
  const KNOWN_RISKS = new Set(['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']);
  const dangerLabel = $derived(
    danger === ''
      ? ''
      : (KNOWN_RISKS.has(danger) ? localize(`FABRICATE.App.Gathering.Detail.Risk.${danger}`) : danger)
  );
  // Tier class so the danger pip's icon can escalate in colour with the risk
  // level (success -> warning -> danger); unmapped values fall back to the
  // base danger colour.
  const dangerRiskClass = $derived(KNOWN_RISKS.has(danger) ? `risk-${danger}` : '');

  // The list the center column paginates: discovered tasks for blind sites,
  // the full task list for targeted ones.
  const activeTasks = $derived(isBlind ? discoveredTasks : tasks);

  let pageIndex = $state(0);
  let pageSize = $state(6);
  const pageSizeOptions = [6, 9, 12];
  const paginated = $derived(activeTasks.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  // Reset pagination when the selected environment changes.
  $effect(() => {
    envId;
    pageIndex = 0;
  });

  // Snap back to the first page if the active list shrinks past the offset.
  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= activeTasks.length) pageIndex = 0;
  });

  function biomeChipStyle(tag) {
    const hex = /^#[0-9a-fA-F]{6}$/.test(tag?.customColor || '') ? tag.customColor : '';
    const token = String(tag?.colorToken || 'sage').replace(/^--fab-tag-/, '');
    return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
  }

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

      {#if biomeTags.length > 0 || region !== '' || danger !== ''}
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
          {#if region !== ''}
            <li
              class="gathering-detail-pip"
              aria-label={localize('FABRICATE.App.Gathering.Detail.Pips.Region', { value: region })}
            >
              <i class="fas fa-map-location-dot" aria-hidden="true"></i>
              <span>{region}</span>
            </li>
          {/if}
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

    {#if sceneBlocked}
      <section class="gathering-detail-scene" data-gathering-scene-banner>
        <LinkedScene {sceneUuid} {services} />
      </section>
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

      {#if showDiscovered}
        <section class="gathering-detail-section" data-gathering-discovered>
          <h3 class="gathering-detail-section-title">
            {localize('FABRICATE.App.Gathering.Detail.DiscoveredHeading', {
              x: discoveredTaskCount,
              y: composedTaskCount
            })}
          </h3>
          {#if discoveredTasks.length === 0}
            <p class="gathering-detail-empty">
              {localize('FABRICATE.App.Gathering.Detail.NothingDiscovered')}
            </p>
          {:else}
            <div class="gathering-detail-task-list" role="list">
              {#each paginated as discoveredTask (discoveredTask.id)}
                <GatheringTaskRow
                  task={discoveredTask}
                  selected={String(discoveredTask.id) === String(selectedTaskId)}
                  onSelect={onSelectTask}
                />
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    {:else}
      <section class="gathering-detail-section">
        <div class="gathering-detail-task-list" role="list">
          {#each paginated as gatheringTask (gatheringTask.id)}
            <GatheringTaskRow
              task={gatheringTask}
              selected={String(gatheringTask.id) === String(selectedTaskId)}
              onSelect={onSelectTask}
            />
          {/each}
        </div>
      </section>
    {/if}

    {#if activeTasks.length > 0}
      <div class="gathering-detail-pagination">
        <Pagination
          totalCount={activeTasks.length}
          {pageSize}
          {pageIndex}
          {pageSizeOptions}
          onPageChange={(n) => pageIndex = n}
          onPageSizeChange={(n) => { pageSize = n; pageIndex = 0; }}
        />
      </div>
    {/if}
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

  .gathering-detail-section {
    flex: 1 1 auto;
    min-height: 0;
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
