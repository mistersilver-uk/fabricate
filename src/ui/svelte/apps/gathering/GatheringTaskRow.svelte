<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskRow renders one gathering task in the center column — used for both
  a targeted environment's task list and a blind environment's "Discovered Tasks"
  list. It is a compact, selectable row: clicking it selects the task, which
  drives the right-column inspector (the canonical place for the full task detail
  and the Attempt action) and highlights the row.

  Layout: a top HEADER bar (only when the task is blocked) surfaces each blocking
  issue as a callout chip ("Missing tool(s)", wrong conditions, …). Below it the
  main row shows the task image (with a lock overlay + desaturation when blocked),
  the name, and a SuccessChanceBar. A short, always-visible description sits
  underneath. The row has no Attempt button and no expand toggle — those live in
  the right-column inspector.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { descriptionOrDefault } from '../../util/gatheringFormat.js';
  import SuccessChanceBar from './SuccessChanceBar.svelte';

  let {
    task = null,
    selected = false,
    onSelect = null
  } = $props();

  const id = $derived(String(task?.id ?? ''));
  const name = $derived(String(task?.name ?? task?.label ?? ''));
  const description = $derived(String(task?.description ?? ''));
  // Always show a description line; fall back to a sensible placeholder when the
  // task carries none, so the underneath section stays present and aligned.
  const hasDescription = $derived(description !== '');
  const descriptionText = $derived(
    descriptionOrDefault(description, 'FABRICATE.App.Gathering.Detail.NoTaskDescription', localize)
  );
  const img = $derived(String(task?.img ?? ''));
  const attemptable = $derived(task?.attemptable === true);
  const blocked = $derived(!attemptable);
  const blockedReasons = $derived(Array.isArray(task?.blockedReasons) ? task.blockedReasons : []);
  const successChance = $derived(task?.successChance ?? null);

  // Economy badges: a node "current/max" count and/or a stamina cost, present
  // only when the system runs that mode and (for blind tasks) the count is not
  // redacted — the runtime nulls those fields when they must stay hidden.
  const richNodes = $derived(task?.rich?.nodes ?? null);
  const nodeCount = $derived(richNodes && richNodes.current != null && richNodes.max != null
    ? `${richNodes.current}/${richNodes.max}` : null);
  const staminaCost = $derived(task?.rich?.stamina?.cost ?? null);

  // Each blocking issue becomes a header callout chip. The linked-scene gate is
  // an environment-level restriction, surfaced once above the task list by
  // GatheringDetail — never as a per-task callout here.
  const CALLOUTS = {
    TOOL_BLOCKED: { icon: 'fa-screwdriver-wrench', key: 'FABRICATE.App.Gathering.Detail.Callout.MissingTools', tone: 'warning' },
    CONDITIONS_BLOCKED: { icon: 'fa-cloud-sun', key: 'FABRICATE.App.Gathering.Detail.Callout.Conditions', tone: 'warning' },
    GAME_PAUSED: { icon: 'fa-pause', key: 'FABRICATE.App.Gathering.Detail.Callout.Paused', tone: 'neutral' },
    DUPLICATE_ACTIVE_RUN: { icon: 'fa-hourglass-half', key: 'FABRICATE.App.Gathering.Detail.Callout.DuplicateRun', tone: 'neutral' },
    NODE_DEPLETED: { icon: 'fa-mountain', key: 'FABRICATE.App.Gathering.Detail.Callout.NodeDepleted', tone: 'warning' },
    NODE_EXHAUSTED: { icon: 'fa-mountain', key: 'FABRICATE.App.Gathering.Detail.Callout.NodeExhausted', tone: 'warning' },
    STAMINA_BLOCKED: { icon: 'fa-bolt', key: 'FABRICATE.App.Gathering.Detail.Callout.StaminaBlocked', tone: 'warning' }
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

  function select() {
    onSelect?.(id);
  }
  function onSummaryKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      select();
    }
  }
</script>

<div
  class="gathering-task-row"
  class:is-blocked={blocked}
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
        {#if nodeCount != null || staminaCost != null}
          <span class="gathering-task-economy" data-gathering-economy>
            {#if nodeCount != null}
              <span class="gathering-economy-chip" data-gathering-node-count title={localize('FABRICATE.App.Gathering.Detail.NodesRemaining')}>
                <i class="fas fa-mountain" aria-hidden="true"></i>
                <span>{nodeCount}</span>
              </span>
            {/if}
            {#if staminaCost != null}
              <span class="gathering-economy-chip" data-gathering-stamina-cost title={localize('FABRICATE.App.Gathering.Detail.StaminaCost')}>
                <i class="fas fa-bolt" aria-hidden="true"></i>
                <span>{staminaCost}</span>
              </span>
            {/if}
          </span>
        {/if}
      </span>

      {#if successChance != null}
        <span class="gathering-task-chance" data-gathering-success>
          <SuccessChanceBar value={successChance} />
        </span>
      {/if}
    </div>

    <p
      class="gathering-task-description"
      class:is-fallback={!hasDescription}
      data-gathering-task-description
    >{descriptionText}</p>
  </div>
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

  .gathering-task-chance {
    flex: 0 0 auto;
  }

  /* Economy badges (node count / stamina cost) under the task name. */
  .gathering-task-economy {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .gathering-economy-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text-muted);
  }

  .gathering-economy-chip i {
    font-size: 10px;
  }

  /* Short, always-visible description beneath the main row — occupies the slot
     the requirements drop-down used, but compact and never toggled. */
  .gathering-task-description {
    margin: 0;
    padding: 0 var(--fab-space-2) var(--fab-space-2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.4;
    color: var(--fab-text-muted);
  }

  /* Placeholder shown when a task has no authored description. */
  .gathering-task-description.is-fallback {
    font-style: italic;
    opacity: 0.85;
  }
</style>
