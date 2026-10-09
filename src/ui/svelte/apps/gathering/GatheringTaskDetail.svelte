<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskDetail is the right column of the player gathering tab — the
  "selected task" inspector. It mirrors the right-context-menu idiom used
  elsewhere:
   - no task selected but tasks exist  -> "Select a gathering task" hint
   - no tasks at all in the environment -> "No available tasks" hint
   - a task selected -> the identity header (tile, name, and the pane's one primary,
     Attempt), the description, the success-chance bar, then the shared task
     requirements section (the same one shown inline when a row is expanded in the
     center column).

  It also carries a lazily-loaded "What you might find" section for the selected task.
-->
<script>
  import { DEFAULT_GATHERING_TASK_IMG } from '../../../../gatheringImageDefaults.js';
  import PlayerDetailHeader from '../PlayerDetailHeader.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { withRollPromptOrigin } from '../../util/rollPromptOrigin.js';
  import { formatRespawnDuration } from '../../util/formatDuration.js';
  import { describeBlockedReasons } from './gatheringBlockedReasons.js';
  import { descriptionOrDefault } from '../../util/gatheringFormat.js';
  import Notice from '../../components/Notice.svelte';
  import GatheringTaskRequirements from './GatheringTaskRequirements.svelte';
  import GatheringTaskDrops from './GatheringTaskDrops.svelte';
  import ChanceBar from './ChanceBar.svelte';

  let {
    task = null,
    hasTasks = false,
    environmentId = '',
    onAttempt = null,
    busy = false,
    services = null,
    rememberedActorId = null,
  } = $props();

  const id = $derived(String(task?.id ?? ''));
  const name = $derived(String(task?.name ?? task?.label ?? ''));
  const description = $derived(String(task?.description ?? ''));
  const hasDescription = $derived(description !== '');
  const descriptionText = $derived(
    descriptionOrDefault(description, 'FABRICATE.App.Gathering.Detail.NoTaskDescription', localize)
  );
  const img = $derived(String(task?.img ?? ''));
  const attemptable = $derived(task?.attemptable === true);

  // A blocked task (not merely an in-flight `busy` attempt) gets a ban icon and a
  // visible reason, in the center-row callout vocabulary.
  const blocked = $derived(task != null && !attemptable);
  const blockedReasons = $derived(Array.isArray(task?.blockedReasons) ? task.blockedReasons : []);

  // Economy summary shown above the Attempt button: the per-task stamina cost
  // against the actor's pool, and/or the remaining node count. Each is present
  // only when the active system enables that limitation (the runtime supplies
  // task.rich.{stamina,nodes}); both appear when both flags are on.
  const staminaCost = $derived(task?.rich?.stamina?.cost ?? null);
  const staminaState = $derived(task?.rich?.stamina?.state ?? null);
  const richNodes = $derived(task?.rich?.nodes ?? null);
  const nodeCount = $derived(
    richNodes && richNodes.current != null && richNodes.max != null
      ? `${richNodes.current}/${richNodes.max}`
      : null
  );
  const nodeDepleted = $derived(richNodes != null && richNodes.available === false);
  // A `nonRegenerating` pool that has hit 0 is exhausted for good: the runtime
  // surfaces this as a derived `permanentlyExhausted` flag. Show the permanent
  // copy instead of the "replenishes over time" message and suppress the
  // respawn-ETA block (already null for non-overTime policies).
  const nodeExhausted = $derived(richNodes?.permanentlyExhausted === true);
  // A `nonRegenerating` pool never replenishes, so surface a plain permanence line
  // ("This resource will not replenish.") BEFORE exhaustion (current > 0). The count
  // is already shown on the NodesAvailable line above, so this copy does not repeat
  // it. At current <= 0 the exhausted callout shows the distinct exhausted permanence
  // copy instead (no respawn ETA), via the depleted callout's `is-depleted` treatment.
  const nodeNonRegenerating = $derived(richNodes?.nonRegenerating === true);
  const nodeScarcePermanentText = $derived(
    nodeNonRegenerating ? localize('FABRICATE.App.Gathering.Detail.NodeScarcePermanent') : ''
  );
  // Per-region node respawn ETA (canvas gathering-task region): the engine surfaces
  // `rich.nodes.respawnEta = { nextWorldTime, secondsUntil }` only for a placed
  // interactable whose node is under cap. Format `secondsUntil` into a calendar-aware
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
  const blockReason = $derived(blocked ? describeBlockedReasons(blockedReasons, localize) : '');
  // A disabled Attempt keeps its visible label as its name; the reason is visible text it is described by.
  const uid = $props.id();
  const reasonId = `${uid}-attempt-reason`;
  const attemptProps = $derived({
    class: 'gathering-task-detail-attempt',
    'data-gathering-attempt': '',
    'data-gathering-attempt-blocked': blocked ? 'true' : 'false',
    title: blocked ? blockReason : undefined,
    'aria-describedby': blocked ? reasonId : undefined,
  });

  // Lazily resolve the per-drop "What you might find" breakdown for the selected
  // task only (it personalizes chances to the selected actor + current
  // conditions, so it is fetched on demand, not baked into the listing). A
  // cancelled flag drops any stale response when the selection changes.
  let breakdown = $state(null);
  let dropsLoading = $state(false);
  // The THIRD outcome of the lazy fetch (issue 1514). Clearing the breakdown on failure
  // renders exactly what "this task has no drops" renders, so a broken services call and an
  // empty drop table were the same picture and the player was told nothing. This flag is what
  // lets `GatheringTaskDrops` tell them apart.
  let dropsError = $state(false);

  // Prefer the fully personalized success chance from the loaded breakdown (it
  // folds in weather/time/biome AND the actor's character-ability modifiers);
  // fall back to the listing's condition-adjusted value while it loads.
  const successChance = $derived(
    breakdown && breakdown.successChance != null
      ? breakdown.successChance
      : (task?.successChance ?? null)
  );

  function handleAttempt(event) {
    if (!attemptable || busy) return;
    withRollPromptOrigin(event, () => onAttempt?.({ environmentId, taskId: id }));
  }

  $effect(() => {
    const taskId = id;
    const envId = String(environmentId ?? '');
    void rememberedActorId;
    if (!taskId || typeof services?.getGatheringDropBreakdown !== 'function') {
      breakdown = null;
      dropsLoading = false;
      dropsError = false;
      return;
    }
    let cancelled = false;
    dropsLoading = true;
    dropsError = false;
    breakdown = null;
    Promise.resolve(
      services.getGatheringDropBreakdown({ environmentId: envId, taskId, rememberedActorId })
    )
      .then((result) => {
        if (cancelled) return;
        breakdown = result ?? null;
        dropsLoading = false;
        dropsError = false;
      })
      .catch(() => {
        if (cancelled) return;
        breakdown = null;
        dropsLoading = false;
        // SURFACED rather than swallowed (issue 1514). What the player is owed here is the
        // fact that the figures could not be worked out, which is a different sentence from
        // "there is nothing to find" and was previously indistinguishable from it.
        dropsError = true;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if task == null}
  <div
    class="gathering-task-detail-state"
    data-gathering-task-detail-state={hasTasks ? 'empty' : 'none'}
  >
    <i class={`fas ${hasTasks ? 'fa-hand-pointer' : 'fa-list'}`} aria-hidden="true"></i>
    <p>
      {localize(
        hasTasks
          ? 'FABRICATE.App.Gathering.Detail.SelectTaskHint'
          : 'FABRICATE.App.Gathering.Detail.NoAvailableTasks'
      )}
    </p>
  </div>
{:else}
  <section
    class="gathering-task-detail"
    aria-label={name || localize('FABRICATE.App.Gathering.Detail.TaskInspectorLabel')}
    data-gathering-task-detail
    data-detail-task-id={String(task?.id ?? '')}
  >
    <PlayerDetailHeader
      {name}
      art={img || DEFAULT_GATHERING_TASK_IMG}
      primaryLabel={localize('FABRICATE.App.Gathering.Detail.Attempt')}
      primaryIcon={blocked ? 'fa-solid fa-ban' : ''}
      primaryDisabled={!attemptable || busy}
      primaryProps={attemptProps}
      onclick={handleAttempt}
    />
    {#if blocked}
      <div id={reasonId} data-gathering-attempt-reason>
        <Notice tone="warning" icon="fa-solid fa-ban" title={blockReason} />
      </div>
    {/if}

    <p class="gathering-task-detail-description" class:is-fallback={!hasDescription}>
      {descriptionText}
    </p>

    {#if staminaCost != null || nodeCount != null}
      <div class="gathering-task-detail-economy" data-gathering-economy-summary>
        {#if staminaCost != null}
          <span class="gathering-economy-line" data-gathering-stamina-cost>
            <i class="fas fa-bolt" aria-hidden="true"></i>
            <span>
              {#if staminaState && staminaState.current != null && staminaState.max != null}
                {localize('FABRICATE.App.Gathering.Detail.StaminaCostWithPool', {
                  cost: staminaCost,
                  current: staminaState.current,
                  max: staminaState.max,
                })}
              {:else}
                {localize('FABRICATE.App.Gathering.Detail.StaminaCostOnly', { cost: staminaCost })}
              {/if}
            </span>
          </span>
        {/if}
        {#if nodeCount != null}
          <span
            class="gathering-economy-line"
            class:is-depleted={nodeDepleted}
            data-gathering-node-count
          >
            <i class="fas fa-mountain" aria-hidden="true"></i>
            <span
              >{localize('FABRICATE.App.Gathering.Detail.NodesAvailable', {
                count: nodeCount,
              })}</span
            >
            {#if nodeDepleted}
              <span class="gathering-economy-depleted"
                >{localize('FABRICATE.App.Gathering.Detail.Callout.NodeDepleted')}</span
              >
            {/if}
          </span>
        {/if}
      </div>
    {/if}

    {#if nodeDepleted}
      <!--
        Player-facing depleted banner for a token-scoped node.

        `Notice` NON-BLOCKING rather than `Callout` (issue 1514), and the current role is what
        decides: this element carried `role="status"`, `Callout` emits `role="note"` or nothing
        (`Callout.svelte:131`) and cannot express a live status region, while `Notice` renders
        `role="status"` with `aria-live="polite"` whenever `blocking` is unset. The tone is still
        carried by more than colour — the glyph and the title ink move with it.

        The respawn ETA is the `detail` line. It was a `<span>` inside the copy stacked by a
        column flex, which is the shape `detail` already draws, so the second line survives the
        conversion; what does not is its own `data-gathering-node-respawn-eta` hook, because
        `Notice` exposes its two hook pairs on the ROOT alone. The two shipped readers of that
        hook are NEGATIVE assertions (`gathering-detail-mounted.test.js`), and an assertion that
        can never fail is worse than none, so they are retargeted onto the detail line's TEXT in
        the same commit rather than left to pass vacuously.
      -->
      <Notice
        tone="warning"
        icon="fas fa-mountain-sun"
        title={nodeExhausted
          ? localize('FABRICATE.App.Gathering.Detail.NodeExhaustedPermanent')
          : localize('FABRICATE.App.Gathering.Detail.NodeDepletedRespawns')}
        detail={nodeExhausted ? '' : respawnEtaText}
        data-gathering-node-depleted=""
      />
    {:else if nodeNonRegenerating && nodeScarcePermanentText !== ''}
      <!--
        Permanence banner for a nonRegenerating pool BEFORE exhaustion (current > 0).
        Distinct from the regenerating "replenishes over time" copy: this resource will
        never replenish. The remaining count is already shown on the NodesAvailable
        line above, so this copy does not repeat it. `info`, not `warning`, which is the
        palette the rule it replaces painted.
      -->
      <Notice
        tone="info"
        icon="fas fa-mountain-sun"
        title={nodeScarcePermanentText}
        data-gathering-node-scarce=""
      />
    {/if}

    {#if successChance != null}
      <ChanceBar value={successChance} scale="success" />
    {/if}

    <GatheringTaskRequirements {task} />

    <GatheringTaskDrops {breakdown} loading={dropsLoading} error={dropsError} />
  </section>
{/if}

<style>
  .gathering-task-detail-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-3);
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

  /* The header grows along its own row; in this column it must not take the free height. */
  .gathering-task-detail > :global(.player-detail-header) {
    flex: none;
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

  /* Economy summary (stamina cost vs pool / node count) above the success-chance bar. */
  .gathering-task-detail-economy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .gathering-economy-line {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-economy-line.is-depleted {
    color: var(--fab-warning-text);
  }

  .gathering-economy-depleted {
    padding: 0 var(--fab-space-chip);
    border-radius: 999px;
    font-weight: 600;
    background: var(--fab-warning-soft);
    border: 1px solid var(--fab-warning-border);
  }

  /* The shared requirements block renders as a bordered card in this column. */
  .gathering-task-detail :global(.gathering-task-details) {
    border: 1px solid var(--fab-border);
    border-radius: 11px;
  }
</style>
