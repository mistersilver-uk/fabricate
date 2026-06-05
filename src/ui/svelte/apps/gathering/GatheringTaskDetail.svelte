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

  It carries the Attempt action (with the success-chance bar in-line) and a
  lazily-loaded "What you might find" section for the selected task.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import GatheringTaskRequirements from './GatheringTaskRequirements.svelte';
  import GatheringTaskDrops from './GatheringTaskDrops.svelte';
  import SuccessChanceBar from './SuccessChanceBar.svelte';

  let {
    task = null,
    hasTasks = false,
    environmentId = '',
    onAttempt = null,
    busy = false,
    services = null,
    rememberedActorId = null
  } = $props();

  const id = $derived(String(task?.id ?? ''));
  const name = $derived(String(task?.name ?? task?.label ?? ''));
  const description = $derived(String(task?.description ?? ''));
  const hasDescription = $derived(description !== '');
  const descriptionText = $derived(
    hasDescription ? description : localize('FABRICATE.App.Gathering.Detail.NoTaskDescription')
  );
  const img = $derived(String(task?.img ?? ''));
  const attemptable = $derived(task?.attemptable === true);

  const titleId = 'gathering-task-detail-title';

  // Lazily resolve the per-drop "What you might find" breakdown for the selected
  // task only (it personalizes chances to the selected actor + current
  // conditions, so it is fetched on demand, not baked into the listing). A
  // cancelled flag drops any stale response when the selection changes.
  let breakdown = $state(null);
  let dropsLoading = $state(false);

  // Prefer the fully personalized success chance from the loaded breakdown (it
  // folds in weather/time/biome AND the actor's character-ability modifiers);
  // fall back to the listing's condition-adjusted value while it loads.
  const successChance = $derived(
    breakdown && breakdown.successChance != null ? breakdown.successChance : (task?.successChance ?? null)
  );

  function handleAttempt() {
    if (!attemptable || busy) return;
    onAttempt?.({ environmentId, taskId: id });
  }

  $effect(() => {
    const taskId = id;
    const envId = String(environmentId ?? '');
    void rememberedActorId;
    if (!taskId || typeof services?.getGatheringDropBreakdown !== 'function') {
      breakdown = null;
      dropsLoading = false;
      return;
    }
    let cancelled = false;
    dropsLoading = true;
    breakdown = null;
    Promise.resolve(services.getGatheringDropBreakdown({ environmentId: envId, taskId, rememberedActorId }))
      .then(result => {
        if (cancelled) return;
        breakdown = result ?? null;
        dropsLoading = false;
      })
      .catch(() => {
        if (cancelled) return;
        breakdown = null;
        dropsLoading = false;
      });
    return () => { cancelled = true; };
  });
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

    <p class="gathering-task-detail-description" class:is-fallback={!hasDescription}>{descriptionText}</p>

    <div class="gathering-task-detail-action" class:has-chance={successChance != null}>
      {#if successChance != null}
        <SuccessChanceBar value={successChance} />
      {/if}
      <button
        type="button"
        class="gathering-task-detail-attempt"
        data-gathering-attempt
        disabled={!attemptable || busy}
        onclick={handleAttempt}
      >
        {localize('FABRICATE.App.Gathering.Detail.Attempt')}
      </button>
    </div>

    <GatheringTaskRequirements {task} />

    <GatheringTaskDrops {breakdown} loading={dropsLoading} />
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

  /* Placeholder shown when a task has no authored description. */
  .gathering-task-detail-description.is-fallback {
    font-style: italic;
    color: var(--fab-text-muted);
  }

  /* Single column (full-width Attempt) by default; two equal columns with
     whitespace between when a success-chance bar accompanies the button. */
  .gathering-task-detail-action {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--fab-space-3);
    align-items: center;
  }

  .gathering-task-detail-action.has-chance {
    grid-template-columns: 1fr 1fr;
  }

  .gathering-task-detail-attempt {
    width: 100%;
    appearance: none;
    -webkit-appearance: none;
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

  .gathering-task-detail-attempt:hover:not(:disabled) {
    background: var(--fab-accent-hover);
  }

  .gathering-task-detail-attempt:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .gathering-task-detail-attempt:disabled {
    opacity: 0.5;
    cursor: default;
    background: var(--fab-surface-raised);
    border-color: var(--fab-border);
    color: var(--fab-text-muted);
  }

  /* The shared requirements block renders as a bordered card in this column. */
  .gathering-task-detail :global(.gathering-task-details) {
    border: 1px solid var(--fab-border);
    border-radius: 8px;
  }
</style>
