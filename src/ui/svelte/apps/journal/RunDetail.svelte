<!-- Svelte 5 runes mode -->
<script>
  import { choiceDialog, localize } from '../../util/foundryBridge.js';
  import { formatAuthoredDuration, formatDurationHMS } from '../../util/formatDuration.js';
  import { statusChipTone } from '../../util/statusChipTone.js';
  import { worldTimeLabel } from '../../util/worldTimeLabel.js';
  import Callout from '../manager/Callout.svelte';
  import Chip from '../../components/Chip.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import ListRow from '../../components/ListRow.svelte';
  import Kicker from '../../components/Kicker.svelte';
  import Notice from '../../components/Notice.svelte';
  import OutcomeLadder from '../../components/OutcomeLadder.svelte';
  import RunProgress from '../../components/RunProgress.svelte';
  import StageCard from '../../components/StageCard.svelte';
  import StageNav from '../../components/StageNav.svelte';
  import YieldScale from '../../components/YieldScale.svelte';
  import { runAttentionPresentation, runStatusPresentation } from './journalRunStatus.js';
  import { runStateNotice } from './runStateNotice.js';
  import { stageHeadingName } from './stageHeading.js';
  import {
    applyPersonalizedDrops,
    effectPhaseText,
    formatRoll,
    numberOrNaN,
    previewName,
    previewTiers,
    quantityText,
  } from './runDetailPresentation.js';
  import { reconcileRetainedClaim, retainedClaimPrompt } from './runRecovery.js';
  import ActionsPanel from './ActionsPanel.svelte';
  import JournalFactRow from './JournalFactRow.svelte';
  import StepDetails from './StepDetails.svelte';
  import TimeRemainingBox from './TimeRemainingBox.svelte';
  import HistoricalRunDetail from './HistoricalRunDetail.svelte';
  import ThisRun from './ThisRun.svelte';
  import { presentStage } from './historyPresentation.js';

  let { run = null, journal = null, now = 0, services = null } = $props();

  const status = $derived(String(run?.derivedStatus ?? run?.status ?? 'inProgress'));
  const statusView = $derived(
    runStatusPresentation(run?.recoveryEvidence?.status === 'planned' ? 'inProgress' : status)
  );
  const terminal = $derived(['succeeded', 'failed', 'cancelled'].includes(status));
  // The same "waiting on you" signal the Active row carries, so the opened run agrees with
  // the list it was opened from (M10).
  const attention = $derived(runAttentionPresentation(run));
  const stages = $derived(Array.isArray(run?.steps) ? run.steps : []);
  const currentIndex = $derived.by(() => {
    if (!terminal) return Math.max(0, Number(run?.stepIndex) || 0);
    if (run?.lifecycleContract == null || run.lifecycleContract === 'legacy') {
      const executed = stages.findLastIndex((stage) =>
        ['succeeded', 'failed', 'done'].includes(stage.status)
      );
      if (executed >= 0) return executed;
    }
    return Math.max(0, stages.length - 1);
  });
  const viewedIndex = $derived(
    journal?.viewedStageIndex == null
      ? currentIndex
      : Math.max(0, Number(journal.viewedStageIndex) || 0)
  );
  const viewedStage = $derived(stages[viewedIndex] ?? run?.currentStep ?? null);
  const viewedEvidence = $derived(presentStage(viewedStage, localize));
  const currentStage = $derived(run?.currentStep ?? stages[currentIndex] ?? null);
  const currentGate = $derived(run?.timeGate ?? currentStage?.timeGate ?? null);
  const viewedIsCurrent = $derived(stages.length === 0 || viewedIndex === currentIndex);
  const singleStage = $derived(stages.length === 1);
  const stageName = $derived(
    stageHeadingName({ singleStage, stage: viewedStage, index: viewedIndex, localize })
  );
  const stageTag = $derived.by(() => {
    if (!viewedIsCurrent) return null;
    if (!((status === 'ready' && run?.actions?.execute === true) || run?.pauseState)) return null;
    return {
      label: localize(
        run?.pauseState
          ? 'FABRICATE.App.Journal.Stage.State.paused'
          : 'FABRICATE.App.Journal.History.YourMove'
      ),
      tone: run?.pauseState ? 'warning' : 'positive',
    };
  });
  const summaryGate = $derived(viewedStage?.timeGate ?? (viewedIsCurrent ? currentGate : null));
  // THE BAR READS THE GATE'S DEADLINE, NEVER ELAPSED WALL TIME (issue 1648). `applyResume`
  // re-anchors `availableAt` past every paused second, so `required - remaining` carries any
  // number of pause cycles already and agrees with the remaining-time labels beside it.
  // `now - initiatedAt` counted the pause as progress and pegged the bar full on a run the
  // same panel reported as still waiting.
  const elapsed = $derived.by(() => {
    const required = Number(currentGate?.requiredSeconds);
    if (!(Number.isFinite(required) && required > 0)) return status === 'ready' ? 100 : 0;
    const pausedRemaining = numberOrNaN(run?.pauseState?.remainingSeconds);
    const gateRemaining = Number(currentGate?.availableAt) - now;
    const remaining = Number.isFinite(pausedRemaining) ? pausedRemaining : gateRemaining;
    if (!Number.isFinite(remaining)) return 0;
    return Math.max(0, Math.min(100, ((required - remaining) / required) * 100));
  });
  const progressBlocker = $derived(
    run?.pauseState ? localize('FABRICATE.App.Journal.Notice.PausedTitle') : ''
  );

  const gatheringYield = $derived(run?.gatheringYield ?? null);
  const craftingYield = $derived.by(() => {
    if (terminal || run?.redacted === true || viewedIndex < currentIndex) return null;
    const preview = viewedIsCurrent ? run?.craftingYield : viewedStage?.yieldPreview;
    return preview?.source === 'preview' && preview.stageIndex === viewedIndex ? preview : null;
  });
  const yieldEntries = $derived(
    Array.isArray(gatheringYield?.entries) ? gatheringYield.entries : []
  );
  let personalizedYieldEntries = $state(null);
  let yieldPreviewLoading = $state(false);
  let yieldPreviewError = $state(false);
  const displayedYieldEntries = $derived(
    (personalizedYieldEntries ?? yieldEntries).map((item) => ({
      ...item,
      name: previewName(item, localize),
    }))
  );
  const outcomeTiers = $derived(previewTiers(gatheringYield?.tiers, localize));
  const resolutionModeLabel = $derived(
    gatheringYield?.mode
      ? localize(`FABRICATE.App.Journal.Mode.${gatheringYield.mode}`)
      : (run?.resolutionModeLabel ?? '')
  );
  const finishedLabel = $derived(calendarLabel(run?.finishedAt));
  const requiredSeconds = $derived(
    Number(summaryGate?.requiredSeconds ?? viewedStage?.detail?.requiredSeconds) || 0
  );
  const availableAt = $derived(Number(summaryGate?.availableAt));
  const remainingTime = $derived.by(() => {
    const pausedRemaining = viewedIsCurrent
      ? numberOrNaN(run?.pauseState?.remainingSeconds)
      : Number.NaN;
    if (Number.isFinite(pausedRemaining)) return formatDurationHMS(pausedRemaining);
    return Number.isFinite(availableAt) && availableAt > now
      ? formatDurationHMS(availableAt - now)
      : localize('FABRICATE.App.Journal.Summary.None');
  });
  const readyAtLabel = $derived(
    viewedIsCurrent && run?.pauseState ? '' : calendarLabel(summaryGate?.availableAt)
  );
  const checkLabel = $derived(
    String(
      viewedStage?.detail?.checkLabel ??
        (viewedIsCurrent && ['d100', 'routed'].includes(gatheringYield?.mode)
          ? resolutionModeLabel
          : '')
    )
  );
  const checkOutcome = $derived(
    viewedStage?.lastCheckResult
      ? formatRoll(viewedStage.lastCheckResult, localize)
      : viewedIsCurrent && gatheringYield?.roll != null
        ? String(gatheringYield.roll)
        : ''
  );
  const confirmedNoCheck = $derived(
    !run?.redacted &&
      (viewedStage?.detail?.checkKind === 'none' || gatheringYield?.mode === 'straight')
  );
  const runIdentity = $derived(
    String(
      run?.key ??
        JSON.stringify([run?.actorUuid ?? null, run?.runType ?? 'crafting', run?.id ?? null])
    )
  );
  const commandError = $derived(
    journal?.commandError?.runKey === runIdentity ? journal.commandError : null
  );
  const transient = $derived(journal?.commandResult?.runKey === runIdentity);
  // ONE run, ONE state, ONE notice — see `runStateNotice.js`.
  const stateNotice = $derived(runStateNotice(run, localize));
  let reconciling = $state(false);

  /** Offer the active GM the two dispositions the authority honours, then record one. */
  async function releaseRetainedClaim() {
    const claim = stateNotice?.claim;
    if (!claim || reconciling) return;
    const disposition = await choiceDialog(retainedClaimPrompt(claim, localize));
    if (disposition !== 'reconciled' && disposition !== 'abandoned') return;
    reconciling = true;
    try {
      const outcome = await reconcileRetainedClaim({ claim, disposition, services, localize });
      services?.notify?.(outcome.message);
      await journal?.load?.(true);
    } finally {
      reconciling = false;
    }
  }

  const showActions = $derived(
    !terminal && (run?.manualAdvance === true || Object.values(run?.actions ?? {}).some(Boolean))
  );
  const currentHasCheck = $derived(
    Boolean(currentStage?.detail?.checkLabel || currentStage?.lastCheckResult)
  );
  const guidanceKey = $derived.by(() => {
    if (run?.recoveryEvidence?.required) return 'FABRICATE.App.Journal.WhatToExpect.Recovery';
    if (terminal) return 'FABRICATE.App.Journal.WhatToExpect.Terminal';
    if (!viewedIsCurrent)
      return viewedIndex < currentIndex
        ? 'FABRICATE.App.Journal.WhatToExpect.Past'
        : 'FABRICATE.App.Journal.WhatToExpect.Future';
    if (run?.pauseState) return 'FABRICATE.App.Journal.WhatToExpect.Paused';
    if (run?.activityKind === 'gathering' || run?.runType === 'gathering')
      return run?.lifecycleContract === 'current'
        ? 'FABRICATE.App.Journal.WhatToExpect.GatheringManual'
        : 'FABRICATE.App.Journal.WhatToExpect.Gathering';
    if (run?.runType === 'salvage') return 'FABRICATE.App.Journal.WhatToExpect.Salvage';
    if (run?.redacted) return 'FABRICATE.App.Journal.WhatToExpect.Protected';
    if (run?.lifecycleContract === 'current' && !currentHasCheck && confirmedNoCheck)
      return run?.multiStep
        ? 'FABRICATE.App.Journal.WhatToExpect.CraftingNoCheck'
        : 'FABRICATE.App.Journal.WhatToExpect.CraftingSingleStepNoCheck';
    return run?.multiStep
      ? 'FABRICATE.App.Journal.WhatToExpect.Crafting'
      : 'FABRICATE.App.Journal.WhatToExpect.CraftingSingleStep';
  });
  const guidance = $derived(
    viewedIsCurrent ? localize(guidanceKey) : localize(guidanceKey, { index: currentIndex + 1 })
  );

  function stageState(index) {
    const stageStatus = stages[index]?.status;
    if (stageStatus === 'failed') return 'failed';
    if (terminal && !['succeeded', 'done'].includes(stageStatus)) return 'unexecuted';
    if (terminal || index < currentIndex) return 'past';
    if (index > currentIndex) return 'future';
    return run?.pauseState ? 'paused' : 'current';
  }
  function hasTimestamp(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value));
  }
  function calendarLabel(value) {
    if (!hasTimestamp(value)) return '';
    const components = services?.getWorldTimeComponents?.(Number(value)) ?? null;
    return worldTimeLabel(components, { localize });
  }
  function stageFacts(stage) {
    const facts = [];
    if (Number(stage?.detail?.requiredSeconds) > 0)
      facts.push({
        id: 'time',
        icon: 'fas fa-clock',
        label: localize('FABRICATE.App.Journal.StepDetails.RequiresTime'),
        value: formatAuthoredDuration(stage.detail.requiredSeconds, { localize }),
      });
    if (viewedIndex > currentIndex && stage?.detail?.checkLabel)
      facts.push({
        id: 'check',
        label: localize('FABRICATE.App.Journal.StepDetails.Check'),
        value: stage.detail.checkLabel,
      });
    if (viewedIndex < currentIndex)
      facts.push({
        id: 'roll',
        icon: 'fas fa-dice-d20',
        label: localize('FABRICATE.App.Journal.StepDetails.RollLabel'),
        value: presentStage(stage, localize).resolution,
      });
    if (viewedIndex < currentIndex && stage?.detail?.failureText)
      facts.push({
        id: 'failure',
        icon: 'fas fa-triangle-exclamation',
        label: localize('FABRICATE.App.Journal.StepDetails.Failure'),
        value: stage.detail.failureText,
      });
    if (viewedIndex <= currentIndex && stage?.selectedRequirementSnapshot?.name)
      facts.push({
        id: 'route',
        label: localize('FABRICATE.App.Journal.Stage.Route'),
        value: stage.selectedRequirementSnapshot.name,
      });
    return facts;
  }

  function stageIo(preview, inputs) {
    const text = (key) => localize(`FABRICATE.App.Journal.History.${key}`);
    const past = viewedIndex < currentIndex;
    const produced = !past
      ? (craftingYield?.entries ?? []).map((item) => ({
          ...item,
          name: previewName(item, localize),
          quantityText: quantityText(item.qty, localize),
        }))
      : viewedEvidence.produced;
    const io = [
      {
        kind: 'produced',
        label: text(past ? 'Produced' : viewedIsCurrent ? 'Produces' : 'WillProduce'),
        items: produced,
        content: craftingYield && craftingYield.presentation !== 'entries' ? preview : null,
        emptyText: text(
          past && viewedStage?.createdResultsRecorded ? 'NothingBanked' : 'NotRecorded'
        ),
      },
    ];
    if (!viewedIsCurrent)
      io.unshift({
        kind: 'consumed',
        label: text(past ? 'Consumed' : 'WillConsume'),
        items: past ? viewedEvidence.consumed : [],
        content: !past ? inputs : null,
        emptyText: text('NotRecorded'),
      });
    // REQUIRED tools, as the same four-column card the history tools section draws. The domain
    // has no "primary" tool, so the stage lists every tool it needs rather than electing one.
    const tools = viewedStage?.detail?.tools ?? [];
    if (tools.length > 0)
      io.push({
        kind: 'tools',
        label: localize('FABRICATE.App.Journal.StepDetails.RequiredTools'),
        items: tools.map((tool) => ({ ...tool, icon: 'fas fa-hammer' })),
        emptyText: text('NotRecorded'),
      });
    return io;
  }

  $effect(() => {
    const entries = yieldEntries;
    const canPersonalize =
      !terminal &&
      run?.redacted !== true &&
      run?.blindSecretPreview !== true &&
      run?.activityKind === 'gathering' &&
      gatheringYield?.mode === 'd100' &&
      Boolean(run?.environmentId) &&
      Boolean(run?.taskId) &&
      typeof services?.getGatheringDropBreakdown === 'function';
    if (!canPersonalize) {
      personalizedYieldEntries = null;
      yieldPreviewLoading = false;
      yieldPreviewError = false;
      return;
    }
    let cancelled = false;
    personalizedYieldEntries = null;
    yieldPreviewLoading = true;
    yieldPreviewError = false;
    Promise.resolve()
      .then(() =>
        services.getGatheringDropBreakdown({
          environmentId: run.environmentId,
          taskId: run.taskId,
          rememberedActorId: services?.actorBar?.selectedActorId ?? null,
        })
      )
      .then((breakdown) => {
        if (cancelled) return;
        personalizedYieldEntries = applyPersonalizedDrops(entries, breakdown);
        yieldPreviewLoading = false;
      })
      .catch(() => {
        if (cancelled) return;
        personalizedYieldEntries = null;
        yieldPreviewLoading = false;
        yieldPreviewError = true;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<article class="journal-detail" data-journal-detail data-run-key={run?.key ?? run?.id}>
  <!-- The controls and the state they are refused by read as ONE block, not as a callout
       floating beside the buttons it talks about. -->
  <section class="journal-detail-state">
    <header class="journal-detail-header">
      <div class="journal-detail-identity">
        <Medallion art={run?.img ?? ''} icon="fas fa-hammer" alt="" size={38} />
        <div>
          <h2>{run?.names?.title ?? ''}</h2>
          <div class="journal-detail-meta">
            {#if run?.names?.subtitle}<span>{run.names.subtitle}</span>{/if}
            {#if resolutionModeLabel}<span>{resolutionModeLabel}</span>{/if}
            {#if terminal && finishedLabel}<span>{finishedLabel}</span>{/if}
            <Chip
              density="list"
              tone={statusChipTone(statusView.tone)}
              icon={`fas ${statusView.icon}`}>{localize(statusView.labelKey)}</Chip
            >
            {#if attention}<Chip
                density="list"
                tone={statusChipTone(attention.tone)}
                icon={`fas ${attention.icon}`}
                data-run-attention={attention.kind}>{localize(attention.labelKey)}</Chip
              >{/if}
            {#if run?.blindSecretPreview}<Chip density="list" tone="warning" icon="fas fa-eye-slash"
                >{localize('FABRICATE.App.Journal.BlindSecret.Badge')}</Chip
              >{/if}
          </div>
        </div>
      </div>
      {#if showActions}<ActionsPanel {run} {journal} {now} />{/if}
    </header>

    {#if stateNotice}
      <Notice
        tone={stateNotice.tone}
        blocking={stateNotice.blocking}
        title={stateNotice.title}
        detail={stateNotice.detail}
        dataAttr={stateNotice.dataAttr}
        dataValue={stateNotice.dataValue}
        stateDataAttr={stateNotice.stateDataAttr}
        stateDataValue={stateNotice.stateDataValue}
        action={stateNotice.claim
          ? {
              label: localize('FABRICATE.App.Journal.Recovery.Action'),
              onClick: releaseRetainedClaim,
            }
          : null}
      />
    {/if}
  </section>

  {#if stateNotice?.evidence}
    <section data-journal-recovery-evidence>
      {#each run.recoveryEvidence.effects ?? [] as effect (effect.index)}
        <div data-journal-effect={effect.index} data-effect-phase={effect.phase}>
          <JournalFactRow
            label={localize('FABRICATE.App.Journal.Notice.Effect', { index: effect.index + 1 })}
            value={effectPhaseText(effect.phase, localize)}
            danger={effect.phase === 'applying'}
          />
          {#each effect.receipt?.items ?? [] as item, index (index)}
            <ListRow
              art={item.img ?? ''}
              name={item.name || localize('FABRICATE.App.Journal.History.UnknownMaterial')}
              quantity={quantityText(item.quantity, localize)}
            />
          {/each}
          {#each effect.receipt?.currencies ?? [] as spend, index (index)}
            <JournalFactRow label={spend.unit} value={String(spend.amount ?? '')} />
          {/each}
        </div>
      {/each}
    </section>
  {/if}

  {#if commandError}
    <Notice
      tone="danger"
      title={commandError.message || localize('FABRICATE.App.Journal.CommandError.Fallback')}
      detail={localize('FABRICATE.App.Journal.CommandError.Detail')}
      action={{
        label: localize('FABRICATE.App.Journal.Retry'),
        onClick: () => journal?.retryCommandError?.(),
      }}
      dataAttr="data-journal-command-error"
      dataValue="true"
    />
  {/if}

  {#if terminal}
    <HistoricalRunDetail {run} {services} {transient} />
  {:else}
    {#if stages.length > 0}
      <section class="journal-detail-stages" data-journal-stages>
        <RunProgress
          {stages}
          current={terminal ? -1 : currentIndex}
          progress={elapsed}
          blocker={progressBlocker}
          label={localize('FABRICATE.App.Journal.Progress.Label')}
        />
        <StageNav
          {stages}
          current={currentIndex}
          view={viewedIndex}
          onView={(index) => journal?.viewStage?.(run, index)}
          stageLabel={(stage, index) =>
            localize('FABRICATE.App.Journal.Stage.Open', {
              index: index + 1,
              name: stage?.stepName ?? '',
            })}
          previousLabel={localize('FABRICATE.App.Journal.Stage.Previous')}
          nextLabel={localize('FABRICATE.App.Journal.Stage.Next')}
          positionLabel={(index, count) =>
            localize('FABRICATE.App.Journal.Stage.Position', { index: index + 1, count })}
          returnLabel={(index) =>
            localize(
              terminal
                ? 'FABRICATE.App.Journal.Stage.ReturnFinal'
                : 'FABRICATE.App.Journal.Stage.Return',
              { index: index + 1 }
            )}
        />
        {#if viewedStage}
          <StageCard
            stage={{
              status: viewedStage.status,
              name: stageName,
              summary:
                stages.length > 1 && viewedIsCurrent
                  ? viewedStage.presentationSnapshot?.description || ''
                  : viewedStage.detail?.summary || '',
            }}
            index={viewedIndex}
            current={!terminal && viewedIndex === currentIndex}
            state={stageState(viewedIndex)}
            tag={stageTag}
            facts={stageFacts(viewedStage)}
            showHeading={!singleStage || Boolean(stageName) || Boolean(stageTag)}
            showNumber={!singleStage}
            io={stageIo(craftingPreview, futureInputs)}
            note={!viewedIsCurrent
              ? localize(
                  viewedIndex < currentIndex
                    ? 'FABRICATE.App.Journal.History.PastNote'
                    : 'FABRICATE.App.Journal.History.FutureNote'
                )
              : ''}
          >
            {#snippet body()}
              <StepDetails
                step={viewedStage}
                {run}
                {journal}
                editable={!terminal &&
                  viewedIndex === currentIndex &&
                  run?.actions?.setSelection === true}
              />
            {/snippet}
          </StageCard>
        {/if}
      </section>
    {:else if currentGate && !run?.redacted}
      <RunProgress
        stages={[{}]}
        current={0}
        progress={elapsed}
        label={localize('FABRICATE.App.Journal.Progress.Label')}
      />
    {/if}

    {#if currentGate && viewedIsCurrent && run?.lifecycleContract !== 'current' && !run?.pauseState}<TimeRemainingBox
        availableAt={currentGate.availableAt}
        hintKey={run?.isFinalStep
          ? 'FABRICATE.App.Journal.TimeRemaining.WhenPassedFinal'
          : undefined}
        {services}
        {now}
      />{/if}

    {#if gatheringYield?.mode === 'routed' && outcomeTiers.length > 0}
      <OutcomeLadder
        tiers={outcomeTiers}
        emptyTierText={localize('FABRICATE.App.Journal.Yields.None')}
        label={localize('FABRICATE.App.Journal.Yields.PreviewTitle')}
        hint={localize('FABRICATE.App.Journal.Yields.RoutedRule')}
      />
    {:else if gatheringYield && displayedYieldEntries.length > 0}
      {#if yieldPreviewLoading}
        <Notice
          tone="info"
          title={localize('FABRICATE.App.Journal.Yields.LoadingPreview')}
          dataAttr="data-journal-yield-loading"
          dataValue="true"
        />
      {:else if yieldPreviewError}
        <Notice
          tone="warning"
          title={localize('FABRICATE.App.Journal.Yields.PreviewError')}
          dataAttr="data-journal-yield-error"
          dataValue="true"
        />
      {/if}
      <YieldScale
        entries={displayedYieldEntries}
        roll={gatheringYield.roll}
        label={localize('FABRICATE.App.Journal.Yields.PreviewTitle')}
        labels={{
          threshold: (entry) =>
            localize(
              gatheringYield.mode === 'd100'
                ? 'FABRICATE.App.Journal.Yields.HighRollThreshold'
                : 'FABRICATE.App.Journal.Yields.Chance',
              { chance: entry.chance, threshold: 101 - entry.chance }
            ),
          cleared: (entry) =>
            localize('FABRICATE.App.Journal.Yields.Awarded', { chance: entry.chance }),
          missed: (entry) =>
            localize('FABRICATE.App.Journal.Yields.Missed', { chance: entry.chance }),
          quantity: (entry) => quantityText(entry.qty, localize),
          chance: (entry) => `${entry.chance}%`,
          cut: (roll) => String(roll),
        }}
      />
    {/if}

    {#snippet futureInputs()}
      {#each viewedStage?.inputPreview?.routes ?? [] as route, routeIndex (route.id ?? routeIndex)}
        <section class="fab-stack" data-gap="1" data-journal-future-input-route={route.id}>
          {#if (viewedStage?.inputPreview?.routes?.length ?? 0) > 1}<Kicker>{route.name}</Kicker
            >{/if}
          {#each route.groups as group, groupIndex (group.id ?? groupIndex)}
            {#if group.options.length > 1}<span
                >{localize('FABRICATE.App.Journal.History.FutureChoice', {
                  count: group.options.length,
                })}</span
              >{/if}
            {#each group.options as option (option.id)}
              <ListRow
                name={option.name || localize('FABRICATE.App.Journal.History.UnknownMaterial')}
                art={option.img ?? ''}
                icon={option.icon ?? 'fas fa-box'}
                quantity={quantityText(option.need, localize)}
              />
            {/each}
          {:else}<span>{localize('FABRICATE.App.Journal.History.NoInputs')}</span>{/each}
        </section>
      {:else}<span>{localize('FABRICATE.App.Journal.History.NotRecorded')}</span>{/each}
    {/snippet}

    {#snippet craftingPreview()}
      {#if craftingYield}
        <div data-journal-crafting-yield={craftingYield.presentation}>
          {#if craftingYield.presentation === 'tiers'}
            <OutcomeLadder
              tiers={previewTiers(craftingYield.tiers, localize)}
              emptyTierText={localize('FABRICATE.App.Journal.Yields.None')}
              label={localize('FABRICATE.App.Journal.Yields.PreviewTitle')}
              hint={localize(
                viewedIsCurrent
                  ? 'FABRICATE.App.Journal.Yields.CraftingPreviewHint'
                  : 'FABRICATE.App.Journal.Yields.FuturePreviewHint'
              )}
            />
          {:else if craftingYield.presentation === 'progressive'}
            <InspectorCard>
              <h3>{localize('FABRICATE.App.Journal.Yields.ProgressiveTitle')}</h3>
              <p>{localize('FABRICATE.App.Journal.Yields.ProgressiveHint')}</p>
              <JournalFactRow
                label={localize('FABRICATE.App.Journal.Yields.AwardMode')}
                value={localize(
                  `FABRICATE.App.Journal.Yields.AwardModes.${craftingYield.progressive?.awardMode ?? 'equal'}`
                )}
              />
              {#each craftingYield.progressive?.stages ?? [] as entry, index (index)}
                <ListRow
                  name={`${index + 1}. ${previewName(entry, localize)}`}
                  art={entry.art ?? ''}
                  quantity={entry.quantity ?? localize('FABRICATE.App.Journal.History.NotRecorded')}
                  detail={entry.cost == null
                    ? localize('FABRICATE.App.Journal.Yields.UnknownCost')
                    : localize('FABRICATE.App.Journal.Yields.BudgetCost', {
                        quantity: entry.quantity,
                        cost: entry.cost,
                      })}
                />
              {/each}
            </InspectorCard>
          {:else if craftingYield.presentation === 'routes'}
            <p>{localize('FABRICATE.App.Journal.History.FutureRoutes')}</p>
            {#each craftingYield.routes ?? [] as route, index (index)}
              <section class="fab-stack" data-gap="1">
                <Kicker>{route.name || localize('FABRICATE.App.Journal.Stage.Route')}</Kicker>
                {#each route.entries ?? [] as entry, itemIndex (entry.id ?? itemIndex)}
                  <ListRow
                    name={previewName(entry, localize)}
                    art={entry.art ?? ''}
                    quantity={quantityText(entry.qty, localize)}
                  />
                {:else}<p>{localize('FABRICATE.App.Journal.History.NotRecorded')}</p>{/each}
              </section>
            {/each}
          {/if}
        </div>
      {/if}
    {/snippet}

    {#if viewedIsCurrent}<div class="journal-detail-summary" data-journal-summary>
        <InspectorCard class="journal-summary-card" data-journal-summary-card="time">
          <div class="journal-summary-heading">
            <Medallion size={26} icon="fas fa-clock" />
            <h3>{localize('FABRICATE.App.Journal.Summary.Time')}</h3>
          </div>
          <JournalFactRow
            icon="fa-clock"
            label={localize('FABRICATE.App.Journal.Summary.Needs')}
            value={requiredSeconds > 0
              ? formatAuthoredDuration(requiredSeconds, { localize })
              : localize('FABRICATE.App.Journal.Summary.None')}
          />
          <JournalFactRow
            icon="fa-hourglass-half"
            label={localize('FABRICATE.App.Journal.Summary.Left')}
            value={remainingTime}
          />
          {#if readyAtLabel}<JournalFactRow
              icon="fa-calendar"
              label={localize('FABRICATE.App.Journal.Summary.ReadyAt')}
              value={readyAtLabel}
            />{/if}
        </InspectorCard>
        <InspectorCard class="journal-summary-card" data-journal-summary-card="check">
          <div class="journal-summary-heading">
            <Medallion
              size={26}
              icon={checkLabel ? 'fas fa-dice-d20' : 'fas fa-wand-magic-sparkles'}
            />
            <h3>
              {localize(
                confirmedNoCheck
                  ? 'FABRICATE.App.Journal.Summary.NoCheck'
                  : 'FABRICATE.App.Journal.Summary.Check'
              )}
            </h3>
          </div>
          <JournalFactRow
            icon={checkLabel ? 'fa-dice-d20' : 'fa-circle-check'}
            label={localize(
              confirmedNoCheck
                ? 'FABRICATE.App.Journal.Summary.NothingToRoll'
                : 'FABRICATE.App.Journal.Summary.DecidedBy'
            )}
            value={checkLabel ||
              localize(
                confirmedNoCheck
                  ? 'FABRICATE.App.Journal.Summary.SimplyCompletes'
                  : 'FABRICATE.App.Journal.Summary.CheckUnavailable'
              )}
          />
          {#if checkOutcome}<JournalFactRow
              icon="fa-check"
              label={localize('FABRICATE.App.Journal.Summary.Outcome')}
              value={checkOutcome}
            />{/if}
        </InspectorCard>
      </div>{/if}
    <ThisRun {run} {services} />
    {#if run?.actions?.disabledReason !== 'unsupportedLifecycle'}
      <Callout tone="neutral" text={guidance} dataAttr="data-journal-guidance" />
    {/if}
  {/if}
</article>

<style>
  .journal-detail {
    display: grid;
    gap: var(--fab-space-4);
    min-width: 0;
    padding: var(--fab-space-4) var(--fab-space-6);
  }
  /* The controls and the state notice are ONE block: a tighter gap than the article's, so
     the sentence explaining a refusal reads as part of the controls it refuses. */
  .journal-detail-state {
    display: grid;
    gap: var(--fab-space-2);
  }
  .journal-detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--fab-space-3);
  }
  .journal-detail-identity {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: var(--fab-space-3);
  }
  .journal-detail-identity h2 {
    margin: 0 0 var(--fab-space-1);
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 22px;
    font-weight: 600;
  }
  .journal-detail-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    color: var(--fab-text-subtle);
    font-size: 11px;
  }
  .journal-detail-stages {
    display: grid;
    gap: var(--fab-space-3);
  }
  .journal-detail-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--fab-space-3);
  }
  .journal-detail-summary :global(.journal-summary-card) {
    min-width: 0;
  }
  .journal-detail-summary h3 {
    margin: 0 0 var(--fab-space-1);
    color: var(--fab-text-subtle);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
