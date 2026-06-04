<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskRow renders one attemptable gathering task in the center column —
  used for both a targeted environment's task list and a blind environment's
  "Discovered Tasks" list.

  Layout: a top HEADER bar (only when the task is blocked) surfaces each blocking
  issue as a callout chip ("Missing tool(s)", "Visit linked scene", wrong
  conditions, …), mirroring the environment-card header idiom. Below it the
  summary row shows the task image (with a lock overlay + desaturation when
  blocked), name + description, a SuccessChanceBar, and the Attempt button. When
  the task has required tools, a linked scene that gates it, or other blocking
  detail, the summary is clickable (chevron) and expands a "Requirements" section
  listing every required tool with its present/damaged/missing state, the linked
  scene panel, and any remaining blocking reasons as text.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import SuccessChanceBar from './SuccessChanceBar.svelte';

  let {
    task = null,
    environmentId = '',
    onAttempt = null,
    busy = false
  } = $props();

  const id = $derived(String(task?.id ?? ''));
  const name = $derived(String(task?.name ?? task?.label ?? ''));
  const description = $derived(String(task?.description ?? ''));
  const img = $derived(String(task?.img ?? ''));
  const attemptable = $derived(task?.attemptable === true);
  const blocked = $derived(!attemptable);
  const blockedReasons = $derived(Array.isArray(task?.blockedReasons) ? task.blockedReasons : []);
  const successChance = $derived(task?.successChance ?? null);
  const tools = $derived(Array.isArray(task?.tools) ? task.tools : []);

  // Each blocking issue becomes a header callout chip. The linked-scene gate is
  // an environment-level restriction, surfaced once above the task list by
  // GatheringDetail — never as a per-task callout here.
  const CALLOUTS = {
    TOOL_BLOCKED: { icon: 'fa-screwdriver-wrench', key: 'FABRICATE.App.Gathering.Detail.Callout.MissingTools', tone: 'warning' },
    CONDITIONS_BLOCKED: { icon: 'fa-cloud-sun', key: 'FABRICATE.App.Gathering.Detail.Callout.Conditions', tone: 'warning' },
    CATALYST_BLOCKED: { icon: 'fa-flask', key: 'FABRICATE.App.Gathering.Detail.Callout.Catalyst', tone: 'warning' },
    GAME_PAUSED: { icon: 'fa-pause', key: 'FABRICATE.App.Gathering.Detail.Callout.Paused', tone: 'neutral' },
    DUPLICATE_ACTIVE_RUN: { icon: 'fa-hourglass-half', key: 'FABRICATE.App.Gathering.Detail.Callout.DuplicateRun', tone: 'neutral' }
  };

  const callouts = $derived.by(() => {
    const seen = new Set();
    const out = [];
    for (const reason of blockedReasons) {
      const code = reason?.code;
      if (!code || code === 'SCENE_TOKEN_BLOCKED' || seen.has(code)) continue;
      seen.add(code);
      const def = CALLOUTS[code];
      out.push(def
        ? { code, icon: def.icon, tone: def.tone, label: localize(def.key) }
        : { code, icon: 'fa-triangle-exclamation', tone: 'warning', label: reason?.message || localize('FABRICATE.App.Gathering.Detail.Blocked') });
    }
    return out;
  });

  // Remaining blocking reasons (not tools, which have their own panel, nor the
  // environment-level scene gate) rendered as text lines in the expanded section.
  function blockedLines(reason) {
    const data = reason?.data ?? null;
    if (reason?.code === 'CONDITIONS_BLOCKED' && data) {
      const lines = [];
      const timeOfDay = Array.isArray(data.requiredTimeOfDay) ? data.requiredTimeOfDay : [];
      const weather = Array.isArray(data.requiredWeather) ? data.requiredWeather : [];
      if (timeOfDay.length > 0) lines.push(localize('FABRICATE.App.Gathering.Detail.RequiresTimeOfDay', { values: timeOfDay.join(', ') }));
      if (weather.length > 0) lines.push(localize('FABRICATE.App.Gathering.Detail.RequiresWeather', { values: weather.join(', ') }));
      if (lines.length > 0) return lines;
    }
    return [reason?.message || localize('FABRICATE.App.Gathering.Detail.Blocked')];
  }

  const detailLines = $derived(
    blockedReasons
      .filter(reason => reason?.code !== 'TOOL_BLOCKED' && reason?.code !== 'SCENE_TOKEN_BLOCKED')
      .flatMap(blockedLines)
  );

  const expandable = $derived(tools.length > 0 || detailLines.length > 0);

  let expanded = $state(false);
  function toggle() {
    if (expandable) expanded = !expanded;
  }
  function onSummaryKey(event) {
    if (!expandable) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      toggle();
    }
  }

  function handleAttempt(event) {
    event?.stopPropagation?.();
    if (!attemptable || busy) return;
    onAttempt?.({ environmentId, taskId: id });
  }

  function toolStateLabel(state) {
    return localize(`FABRICATE.App.Gathering.Detail.ToolState.${state}`);
  }
  function toolHint(state) {
    return localize(`FABRICATE.App.Gathering.Detail.ToolHint.${state}`);
  }

  const requirementsHeading = $derived(
    localize(blocked
      ? 'FABRICATE.App.Gathering.Detail.RequirementsHeading'
      : 'FABRICATE.App.Gathering.Detail.RequirementsHeadingReady')
  );
</script>

<div
  class="gathering-task-row"
  class:is-blocked={blocked}
  class:is-expanded={expanded}
  role="listitem"
  data-task-id={id}
  data-attemptable={attemptable ? 'true' : 'false'}
  data-blocked={blocked ? 'true' : 'false'}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="gathering-task-summary"
    class:is-toggle={expandable}
    role={expandable ? 'button' : undefined}
    tabindex={expandable ? 0 : undefined}
    aria-expanded={expandable ? expanded : undefined}
    onclick={toggle}
    onkeydown={onSummaryKey}
  >
    {#if callouts.length > 0}
      <div class="gathering-task-header" data-gathering-callouts>
        {#each callouts as callout (callout.code)}
          <span class={`gathering-task-callout tone-${callout.tone}`}>
            <i class={`fas ${callout.icon}`} aria-hidden="true"></i>
            <span>{callout.label}</span>
          </span>
        {/each}
      </div>
    {/if}

    <div class="gathering-task-main">
      <span class="gathering-task-thumb-wrap">
        <img class="gathering-task-thumb" class:is-fallback={!img} src={img || 'icons/svg/item-bag.svg'} alt="" />
        {#if blocked}
          <span class="gathering-task-lock-overlay" aria-hidden="true">
            <i class="fas fa-lock"></i>
          </span>
        {/if}
      </span>

      <span class="gathering-task-copy">
        <span class="gathering-task-name" title={name}>{name}</span>
        {#if description !== ''}
          <span class="gathering-task-description">{description}</span>
        {/if}
      </span>

      {#if successChance != null}
        <span class="gathering-task-chance" data-gathering-success>
          <SuccessChanceBar value={successChance} />
        </span>
      {/if}

      <button
        type="button"
        class="gathering-task-attempt"
        data-gathering-attempt
        disabled={!attemptable || busy}
        onclick={handleAttempt}
      >
        {localize('FABRICATE.App.Gathering.Detail.Attempt')}
      </button>

      {#if expandable}
        <span class="gathering-task-chevron" aria-hidden="true">
          <i class={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </span>
      {/if}
    </div>
  </div>

  {#if expandable && expanded}
    <div class="gathering-task-details" data-gathering-details>
      <p class="gathering-task-details-heading">{requirementsHeading}</p>
      <div class="gathering-task-details-grid">
        {#if tools.length > 0}
          <section class="gathering-task-tools" data-gathering-tools>
            <h4 class="gathering-task-subheading">
              <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.RequiredToolsHeading')}
            </h4>
            <ul class="gathering-task-tool-list">
              {#each tools as tool, index (tool.id ?? index)}
                <li class={`gathering-task-tool is-${tool.state}`} data-gathering-tool data-tool-state={tool.state}>
                  <img class="gathering-task-tool-thumb" src={tool.img || 'icons/svg/item-bag.svg'} alt="" />
                  <span class="gathering-task-tool-copy">
                    <span class="gathering-task-tool-name" title={tool.name}>{tool.name}</span>
                    <span class="gathering-task-tool-state">{toolStateLabel(tool.state)}</span>
                    <span class="gathering-task-tool-hint">{toolHint(tool.state)}</span>
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>

      {#if detailLines.length > 0}
        <ul class="gathering-task-blocked" data-gathering-blocked>
          {#each detailLines as line, index (index)}
            <li><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>{line}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .gathering-task-row {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    overflow: hidden;
  }

  .gathering-task-summary {
    display: flex;
    flex-direction: column;
  }

  .gathering-task-summary.is-toggle {
    cursor: pointer;
  }

  .gathering-task-summary.is-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  /* Header bar: a short full-width strip of blocking-issue callouts, divided
     from the body by a soft line (mirrors the environment-card header). */
  .gathering-task-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--fab-border);
  }

  .gathering-task-callout {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text);
  }

  .gathering-task-callout.tone-warning {
    color: var(--fab-warning-text);
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .gathering-task-callout.tone-info {
    color: var(--fab-info-text);
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .gathering-task-callout i {
    font-size: 10px;
  }

  .gathering-task-main {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-height: 72px;
    padding: var(--fab-space-2);
  }

  .gathering-task-thumb-wrap {
    position: relative;
    flex: 0 0 auto;
    width: 56px;
    height: 56px;
  }

  .gathering-task-thumb {
    display: block;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-task-thumb.is-fallback {
    object-fit: contain;
    padding: 8px;
    box-sizing: border-box;
  }

  .gathering-task-row.is-blocked .gathering-task-thumb {
    filter: saturate(0.65) brightness(0.85);
  }

  .gathering-task-lock-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--fab-overlay-dark-48);
    color: var(--fab-overlay-light-96);
  }

  .gathering-task-lock-overlay i {
    font-size: 18px;
  }

  .gathering-task-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .gathering-task-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .gathering-task-description {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.4;
    color: var(--fab-text-muted);
  }

  .gathering-task-chance {
    flex: 0 0 auto;
  }

  .gathering-task-attempt {
    flex: 0 0 auto;
    appearance: none;
    -webkit-appearance: none;
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--fab-accent);
    border-radius: 6px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .gathering-task-attempt:hover:not(:disabled) {
    background: var(--fab-accent-hover);
  }

  .gathering-task-attempt:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .gathering-task-attempt:disabled {
    opacity: 0.5;
    cursor: default;
    background: var(--fab-surface-raised);
    border-color: var(--fab-border);
    color: var(--fab-text-muted);
  }

  .gathering-task-chevron {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    color: var(--fab-text-muted);
  }

  /* Expanded requirements section. */
  .gathering-task-details {
    padding: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    background: var(--fab-surface);
  }

  .gathering-task-details-heading {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .gathering-task-details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--fab-space-3);
  }

  .gathering-task-subheading {
    margin: 0 0 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .gathering-task-tool-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .gathering-task-tool {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .gathering-task-tool-thumb {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-task-tool-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .gathering-task-tool-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 13px;
  }

  .gathering-task-tool-state {
    font-size: 11px;
    font-weight: 600;
  }

  .gathering-task-tool.is-present .gathering-task-tool-state {
    color: var(--fab-success-text);
  }

  .gathering-task-tool.is-damaged .gathering-task-tool-state {
    color: var(--fab-warning-text);
  }

  .gathering-task-tool.is-missing .gathering-task-tool-state {
    color: var(--fab-danger-text);
  }

  .gathering-task-tool-hint {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .gathering-task-blocked {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: var(--fab-warning-text);
  }

  .gathering-task-blocked li {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .gathering-task-blocked i {
    font-size: 10px;
  }
</style>
