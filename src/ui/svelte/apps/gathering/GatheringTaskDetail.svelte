<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskDetail is the right column of the player gathering tab — the
  "selected task" inspector. It mirrors the right-context-menu idiom used
  elsewhere:
   - no task selected but tasks exist  -> "Select a gathering task" hint
   - no tasks at all in the environment -> "No available tasks" hint
   - a task selected -> a header (image, name, description) followed by the
     shared task requirements section (the same one shown inline when a row is
     expanded in the center column).

  Stage 1 is read-only: the Attempt action stays on the center task row.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import GatheringTaskRequirements from './GatheringTaskRequirements.svelte';

  let { task = null, hasTasks = false } = $props();

  const name = $derived(String(task?.name ?? task?.label ?? ''));
  const description = $derived(String(task?.description ?? ''));
  const img = $derived(String(task?.img ?? ''));

  const titleId = 'gathering-task-detail-title';
</script>

{#if task == null}
  <div class="gathering-task-detail-state" data-gathering-task-detail-state={hasTasks ? 'empty' : 'none'}>
    <i class={`fas ${hasTasks ? 'fa-hand-pointer' : 'fa-list'}`} aria-hidden="true"></i>
    <p>
      {localize(hasTasks
        ? 'FABRICATE.App.Gathering.Detail.SelectTaskHint'
        : 'FABRICATE.App.Gathering.Detail.NoAvailableTasks')}
    </p>
  </div>
{:else}
  <section
    class="gathering-task-detail"
    aria-labelledby={titleId}
    aria-label={localize('FABRICATE.App.Gathering.Detail.TaskInspectorLabel')}
    data-gathering-task-detail
    data-detail-task-id={String(task?.id ?? '')}
  >
    <header class="gathering-task-detail-header">
      <span class="gathering-task-detail-thumb-wrap">
        <img class="gathering-task-detail-thumb" class:is-fallback={!img} src={img || 'icons/svg/item-bag.svg'} alt="" />
      </span>
      <span class="gathering-task-detail-heading">
        <h2 id={titleId} class="gathering-task-detail-title" title={name}>{name}</h2>
      </span>
    </header>

    {#if description !== ''}
      <p class="gathering-task-detail-description">{description}</p>
    {/if}

    <GatheringTaskRequirements {task} />
  </section>
{/if}

<style>
  .gathering-task-detail-state {
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

  .gathering-task-detail-state i {
    font-size: 32px;
  }

  .gathering-task-detail-state p {
    margin: 0;
    font-size: 14px;
  }

  .gathering-task-detail {
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

  .gathering-task-detail-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .gathering-task-detail-thumb-wrap {
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
  }

  .gathering-task-detail-thumb {
    display: block;
    width: 64px;
    height: 64px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-task-detail-thumb.is-fallback {
    object-fit: contain;
    padding: 10px;
    box-sizing: border-box;
  }

  .gathering-task-detail-heading {
    flex: 1 1 auto;
    min-width: 0;
  }

  .gathering-task-detail-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gathering-task-detail-description {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fab-text);
  }

  /* The shared requirements block renders as a bordered card in this column. */
  .gathering-task-detail :global(.gathering-task-details) {
    border: 1px solid var(--fab-border);
    border-radius: 8px;
  }
</style>
