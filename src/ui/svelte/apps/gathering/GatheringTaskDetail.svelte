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
  import { formatRespawnDuration } from '../../util/formatDuration.js';
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

  // A blocked task (not merely an in-flight `busy` attempt) gets a ban icon + a
  // tooltip naming the reason. Reuse the center-row callout vocabulary.
  const blocked = $derived(task != null && !attemptable);
  const blockedReasons = $derived(Array.isArray(task?.blockedReasons) ? task.blockedReasons : []);
  const BLOCK_LABEL_KEYS = {
    TOOL_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.MissingTools',
    CONDITIONS_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.Conditions',
    GAME_PAUSED: 'FABRICATE.App.Gathering.Detail.Callout.Paused',
    DUPLICATE_ACTIVE_RUN: 'FABRICATE.App.Gathering.Detail.Callout.DuplicateRun',
    SCENE_TOKEN_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.VisitScene',
    NODE_DEPLETED: 'FABRICATE.App.Gathering.Detail.Callout.NodeDepleted',
    STAMINA_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.StaminaBlocked'
  };

  // Economy summary shown above the Attempt button: the per-task stamina cost
  // against the actor's pool, or the remaining node count. Present only when the
  // active system runs that mode (the runtime supplies task.rich.{stamina,nodes}).
  const staminaCost = $derived(task?.rich?.stamina?.cost ?? null);
  const staminaState = $derived(task?.rich?.stamina?.state ?? null);
  const richNodes = $derived(task?.rich?.nodes ?? null);
  const nodeCount = $derived(richNodes && richNodes.current != null && richNodes.max != null
    ? `${richNodes.current}/${richNodes.max}` : null);
  const nodeDepleted = $derived(richNodes != null && richNodes.available === false);
  // Per-token node respawn ETA (canvas gathering-task token): the engine surfaces
  // `rich.nodes.respawnEta = { nextWorldTime, secondsUntil }` only for a placed
  // token whose node is under cap. Format `secondsUntil` into a calendar-aware
  // human duration for the {duration}-interpolated lang key.
  const respawnSecondsUntil = $derived(
    richNodes?.respawnEta?.secondsUntil != null ? Number(richNodes.respawnEta.secondsUntil) : null
  );
  const respawnDuration = $derived(
    respawnSecondsUntil != null
      ? formatRespawnDuration(respawnSecondsUntil, globalThis.game?.time?.calendar ?? null)
      : ''
  );
  const respawnEtaText = $derived(
    respawnDuration !== ''
      ? localize('FABRICATE.App.Gathering.Detail.NodeRespawnEta', { duration: respawnDuration })
      : ''
  );
  const blockReason = $derived.by(() => {
    if (!blocked) return '';
    const seen = new Set();
    const labels = [];
    for (const reason of blockedReasons) {
      const code = reason?.code;
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const key = BLOCK_LABEL_KEYS[code];
      labels.push(key ? localize(key) : (reason?.message || localize('FABRICATE.App.Gathering.Detail.Blocked')));
    }
    if (labels.length === 0) return localize('FABRICATE.App.Gathering.Detail.Blocked');
    return localize('FABRICATE.App.Gathering.Detail.CannotAttempt', { reason: labels.join(', ') });
  });

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

    {#if staminaCost != null || nodeCount != null}
      <div class="gathering-task-detail-economy" data-gathering-economy-summary>
        {#if staminaCost != null}
          <span class="gathering-economy-line" data-gathering-stamina-cost>
            <i class="fas fa-bolt" aria-hidden="true"></i>
            <span>
              {#if staminaState && staminaState.current != null && staminaState.max != null}
                {localize('FABRICATE.App.Gathering.Detail.StaminaCostWithPool', { cost: staminaCost, current: staminaState.current, max: staminaState.max })}
              {:else}
                {localize('FABRICATE.App.Gathering.Detail.StaminaCostOnly', { cost: staminaCost })}
              {/if}
            </span>
          </span>
        {/if}
        {#if nodeCount != null}
          <span class="gathering-economy-line" class:is-depleted={nodeDepleted} data-gathering-node-count>
            <i class="fas fa-mountain" aria-hidden="true"></i>
            <span>{localize('FABRICATE.App.Gathering.Detail.NodesAvailable', { count: nodeCount })}</span>
            {#if nodeDepleted}
              <span class="gathering-economy-depleted">{localize('FABRICATE.App.Gathering.Detail.Callout.NodeDepleted')}</span>
            {/if}
          </span>
        {/if}
      </div>
    {/if}

    {#if nodeDepleted}
      <!--
        Player-facing depleted callout for a token-scoped node. Tone is carried by
        the `is-depleted` class (not color alone) so the depleted state is legible
        without relying on color, mirroring the row/economy depleted pattern.
      -->
      <div class="gathering-node-depleted-callout is-depleted" role="status" data-gathering-node-depleted>
        <i class="fas fa-mountain-sun" aria-hidden="true"></i>
        <span class="gathering-node-depleted-text">
          {localize('FABRICATE.App.Gathering.Detail.NodeDepletedRespawns')}
          {#if respawnEtaText !== ''}
            <span class="gathering-node-respawn-eta" data-gathering-node-respawn-eta>{respawnEtaText}</span>
          {/if}
        </span>
      </div>
    {/if}

    <div class="gathering-task-detail-action" class:has-chance={successChance != null}>
      {#if successChance != null}
        <SuccessChanceBar value={successChance} />
      {/if}
      <span class="gathering-task-detail-attempt-wrap" title={blocked ? blockReason : null}>
        <button
          type="button"
          class="gathering-task-detail-attempt"
          data-gathering-attempt
          data-gathering-attempt-blocked={blocked ? 'true' : 'false'}
          disabled={!attemptable || busy}
          aria-label={blocked ? blockReason : null}
          onclick={handleAttempt}
        >
          {#if blocked}
            <i class="fa-solid fa-ban" aria-hidden="true"></i>
          {/if}
          {localize('FABRICATE.App.Gathering.Detail.Attempt')}
        </button>
      </span>
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

  /* Economy summary (stamina cost vs pool / node count) above the Attempt row. */
  .gathering-task-detail-economy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gathering-economy-line {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-economy-line.is-depleted {
    color: var(--fab-warning-text);
  }

  .gathering-economy-depleted {
    padding: 0 6px;
    border-radius: 999px;
    font-weight: 600;
    background: var(--fab-warning-soft);
    border: 1px solid var(--fab-warning-border);
  }

  /* Token-scoped depleted callout: a tone-carrying banner (not color alone) with
     the respawn ETA line. Reuses the warning palette like the depleted chip. */
  .gathering-node-depleted-callout {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 12px;
    background: var(--fab-warning-soft);
    border: 1px solid var(--fab-warning-border);
    color: var(--fab-warning-text);
  }

  .gathering-node-depleted-callout.is-depleted {
    color: var(--fab-warning-text);
  }

  .gathering-node-depleted-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gathering-node-respawn-eta {
    font-weight: 600;
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

  /* Wrapper (not the disabled button) carries the block tooltip so hover is
     reliable; it fills its grid column. */
  .gathering-task-detail-attempt-wrap {
    display: flex;
  }

  .gathering-task-detail-attempt {
    width: 100%;
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
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
