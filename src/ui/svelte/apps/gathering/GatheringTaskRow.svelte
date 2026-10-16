<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskRow draws one task of the center column as a selectable ListRow (issue 1778);
  selecting it drives the right-column inspector, which holds the detail and the Attempt. The 56px
  thumb leads, each blocking issue is a callout badge, the economy is meta, the description is the
  row's content and the success ChanceBar sits in the aside. A blocked row stays enabled, because
  it opens the inspector that explains it, and its name says it is blocked.
-->
<script>
  import { DEFAULT_GATHERING_TASK_IMG } from '../../../../gatheringImageDefaults.js';
  import { localize } from '../../util/foundryBridge.js';
  import { descriptionOrDefault, toPercent } from '../../util/gatheringFormat.js';
  import { calloutFor } from './gatheringBlockedReasons.js';
  import ChanceBar from './ChanceBar.svelte';
  import Kicker from '../../components/Kicker.svelte';
  import ListRow from '../../components/ListRow.svelte';

  let { task = null, selected = false, onSelect = null } = $props();

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
  const nodeCount = $derived(
    richNodes && richNodes.current != null && richNodes.max != null
      ? `${richNodes.current}/${richNodes.max}`
      : null
  );
  const staminaCost = $derived(task?.rich?.stamina?.cost ?? null);

  // Each blocking issue becomes a callout badge. Icon/tone/label come from
  // calloutFor in the shared gatheringBlockedReasons vocabulary. The linked-scene
  // gate is an environment-level restriction, surfaced once above the task list
  // by GatheringDetail — never as a per-task callout here, so it is skipped.
  const callouts = $derived.by(() => {
    // Function-local de-duplication scratch, discarded when the $derived.by returns.
    // It is never held in state, so reactivity does not apply.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const seen = new Set();
    const out = [];
    for (const reason of blockedReasons) {
      const code = reason?.code;
      if (!code || code === 'SCENE_TOKEN_BLOCKED' || seen.has(code)) continue;
      seen.add(code);
      out.push(calloutFor(code, reason, localize));
    }
    return out;
  });

  // The control's name is the visible name, then every state the row only draws (issue 1778):
  // the callouts, the chance, and the lock, whose generic sentence closes it.
  const accessibleName = $derived(
    [
      name,
      ...callouts.map((callout) => callout.label),
      successChance != null &&
        localize('FABRICATE.App.Gathering.Detail.SuccessChance', { x: toPercent(successChance) }),
      blocked && localize('FABRICATE.App.Gathering.Detail.Blocked'),
    ]
      .filter(Boolean)
      .join(', ')
  );

  function select() {
    onSelect?.(id);
  }
</script>

{#snippet thumb()}
  <span class="gathering-task-thumb-wrap">
    <img
      class="gathering-task-thumb"
      class:is-fallback={!img}
      src={img || DEFAULT_GATHERING_TASK_IMG}
      alt=""
    />
    {#if blocked}
      <span class="gathering-task-lock-overlay" aria-hidden="true">
        <i class="fas fa-lock"></i>
      </span>
    {/if}
  </span>
{/snippet}

{#snippet badges()}
  <span class="gathering-task-callouts" data-gathering-callouts>
    {#each callouts as callout (callout.code)}
      <span class={`gathering-task-callout tone-${callout.tone}`}>
        <i class={`fas ${callout.icon}`} aria-hidden="true"></i>
        <span>{callout.label}</span>
      </span>
    {/each}
  </span>
{/snippet}

{#snippet economy()}
  <span class="gathering-task-economy" data-gathering-economy>
    {#if nodeCount != null}
      <span
        class="gathering-economy-chip"
        data-gathering-node-count
        title={localize('FABRICATE.App.Gathering.Detail.NodesRemaining')}
      >
        <i class="fas fa-mountain" aria-hidden="true"></i>
        <span>{nodeCount}</span>
      </span>
    {/if}
    {#if staminaCost != null}
      <span
        class="gathering-economy-chip"
        data-gathering-stamina-cost
        title={localize('FABRICATE.App.Gathering.Detail.StaminaCost')}
      >
        <i class="fas fa-bolt" aria-hidden="true"></i>
        <span>{staminaCost}</span>
      </span>
    {/if}
  </span>
{/snippet}

{#snippet copy()}
  <span
    class="gathering-task-description"
    class:is-fallback={!hasDescription}
    data-gathering-task-description>{descriptionText}</span
  >
{/snippet}

<!-- The caption sits left of the track; the meter's own name already says it. -->
{#snippet chance()}
  <div class="gathering-task-chance" data-gathering-success>
    <span class="gathering-task-chance-caption" aria-hidden="true"
      ><Kicker as="span">{localize('FABRICATE.App.Gathering.Detail.SuccessChanceLabel')}</Kicker
      ></span
    >
    <ChanceBar value={successChance} scale="success" showCaption={false} />
  </div>
{/snippet}

<ListRow
  {name}
  density="default"
  class={['gathering-task-row', { 'is-blocked': blocked, 'is-selected': selected }]}
  role="listitem"
  data-task-id={id}
  data-attemptable={attemptable ? 'true' : 'false'}
  data-blocked={blocked ? 'true' : 'false'}
  data-selected={selected ? 'true' : 'false'}
  {selected}
  onOpen={select}
  openProps={{ class: 'gathering-task-summary', 'aria-label': accessibleName }}
  leading={thumb}
  badges={callouts.length > 0 ? badges : undefined}
  meta={nodeCount != null || staminaCost != null ? economy : undefined}
  children={copy}
  aside={successChance != null ? chance : undefined}
/>

<style>
  .gathering-task-callouts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .gathering-task-callout {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    padding: 1px var(--fab-space-2);
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
    border-radius: 9px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-task-thumb.is-fallback {
    object-fit: contain;
    padding: var(--fab-space-2);
    box-sizing: border-box;
  }

  :global(.gathering-task-row.is-blocked) .gathering-task-thumb {
    filter: saturate(0.65) brightness(0.85);
  }

  .gathering-task-lock-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: var(--fab-overlay-dark-48);
    color: var(--fab-overlay-light-96);
  }

  .gathering-task-lock-overlay i {
    font-size: 18px;
  }

  /* Economy badges (node count / stamina cost) under the task name. */
  .gathering-task-economy {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
  }

  .gathering-economy-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    padding: 0 var(--fab-space-chip);
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

  .gathering-task-chance {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--fab-space-2);
  }

  /* Clamped to two lines. The 1.5 line-height keeps the second line's descenders inside the clamp
     box (issue 401), and the row's own padding supplies the whitespace below: a padding-bottom
     here makes Chromium paint a sliver of the clamped-away third line. */
  .gathering-task-description {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.5;
    white-space: normal;
    color: var(--fab-text-muted);
  }

  /* Placeholder shown when a task has no authored description. */
  .gathering-task-description.is-fallback {
    font-style: italic;
    opacity: 0.85;
  }
</style>
