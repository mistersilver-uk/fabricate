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
  import GatheringTaskRequirements from './GatheringTaskRequirements.svelte';

  let {
    task = null,
    environmentId = '',
    onAttempt = null,
    busy = false,
    selected = false,
    onSelect = null
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

  // A task expands (in the center accordion) only when it has requirement detail
  // to show: required tools, or a remaining blocking reason other than the
  // tool/scene gates (those have dedicated panels). The expanded body is the
  // selected task's, so expansion is driven by `selected`, not a local toggle.
  const expandable = $derived(
    tools.length > 0
    || blockedReasons.some(reason => reason?.code !== 'TOOL_BLOCKED' && reason?.code !== 'SCENE_TOKEN_BLOCKED')
  );
  const expanded = $derived(selected && expandable);

  function select() {
    onSelect?.(id);
  }
  function onSummaryKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      select();
    }
  }

  function handleAttempt(event) {
    event?.stopPropagation?.();
    if (!attemptable || busy) return;
    onAttempt?.({ environmentId, taskId: id });
  }
</script>

<div
  class="gathering-task-row"
  class:is-blocked={blocked}
  class:is-expanded={expanded}
  class:is-selected={selected}
  role="listitem"
  data-task-id={id}
  data-attemptable={attemptable ? 'true' : 'false'}
  data-blocked={blocked ? 'true' : 'false'}
  data-selected={selected ? 'true' : 'false'}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="gathering-task-summary is-toggle"
    role="button"
    tabindex="0"
    aria-expanded={expandable ? expanded : undefined}
    onclick={select}
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

  {#if expanded}
    <GatheringTaskRequirements {task} />
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

  /* Selection highlight mirrors the environment card's selected state. */
  .gathering-task-row.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-success-soft);
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
</style>
