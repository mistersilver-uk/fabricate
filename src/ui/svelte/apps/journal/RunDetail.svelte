<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { formatDurationHMS } from '../../util/formatDuration.js';
  import { statusChipTone } from '../../util/statusChipTone.js';
  import { worldTimeLabel } from '../../util/worldTimeLabel.js';
  import Callout from '../manager/Callout.svelte';
  import Chip from '../../components/Chip.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import Notice from '../../components/Notice.svelte';
  import OutcomeLadder from '../../components/OutcomeLadder.svelte';
  import RunProgress from '../../components/RunProgress.svelte';
  import StageCard from '../../components/StageCard.svelte';
  import StageNav from '../../components/StageNav.svelte';
  import YieldScale from '../../components/YieldScale.svelte';
  import { runStatusPresentation } from './journalRunStatus.js';
  import ActionsPanel from './ActionsPanel.svelte';
  import JournalFactRow from './JournalFactRow.svelte';
  import StepDetails from './StepDetails.svelte';
  import TimeRemainingBox from './TimeRemainingBox.svelte';

  let { run = null, journal = null, now = 0, services = null } = $props();

  const status = $derived(String(run?.derivedStatus ?? run?.status ?? 'inProgress'));
  const statusView = $derived(runStatusPresentation(status));
  const terminal = $derived(['succeeded', 'failed', 'cancelled'].includes(status));
  const stages = $derived(Array.isArray(run?.steps) ? run.steps : []);
  const currentIndex = $derived(Math.max(0, Number(run?.stepIndex) || 0));
  const viewedIndex = $derived(Math.max(0, Number(journal?.viewedStageIndex) || 0));
  const viewedStage = $derived(stages[viewedIndex] ?? run?.currentStep ?? null);
  const gate = $derived(run?.timeGate ?? run?.currentStep?.timeGate ?? null);
  const elapsed = $derived(
    Number.isFinite(Number(gate?.requiredSeconds)) && Number(gate.requiredSeconds) > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((now - Number(gate.initiatedAt ?? now)) / Number(gate.requiredSeconds)) * 100
          )
        )
      : status === 'ready'
        ? 100
        : 0
  );
  const progressBlocker = $derived(
    run?.pauseState ? localize('FABRICATE.App.Journal.Notice.PausedTitle') : ''
  );

  const gatheringYield = $derived(run?.gatheringYield ?? null);
  const yieldEntries = $derived(
    Array.isArray(gatheringYield?.entries) ? gatheringYield.entries : []
  );
  const outcomeTiers = $derived(Array.isArray(gatheringYield?.tiers) ? gatheringYield.tiers : []);
  const resolutionModeLabel = $derived(
    gatheringYield?.mode
      ? localize(`FABRICATE.App.Journal.Mode.${gatheringYield.mode}`)
      : (run?.resolutionModeLabel ?? '')
  );
  const startedLabel = $derived(calendarLabel(run?.startedAt));
  const finishedLabel = $derived(calendarLabel(run?.finishedAt));
  const results = $derived(Array.isArray(run?.createdResults) ? run.createdResults : []);
  const resultEntries = $derived(
    results.map((result, index) => ({
      id: result.itemUuid ?? result.componentId ?? `result-${index}`,
      name: result.name ?? result.componentId ?? localize('FABRICATE.App.Journal.Yields.Item'),
      art: result.img ?? '',
      chance: 100,
      qty: Number(result.quantity) || 1,
    }))
  );

  const showActions = $derived(
    !terminal && (run?.manualAdvance === true || Object.values(run?.actions ?? {}).some(Boolean))
  );
  const guidance = $derived(
    run?.activityKind === 'gathering'
      ? localize('FABRICATE.App.Journal.WhatToExpect.Gathering')
      : run?.runType === 'salvage'
        ? localize('FABRICATE.App.Journal.WhatToExpect.Salvage')
        : localize(
            run?.multiStep
              ? 'FABRICATE.App.Journal.WhatToExpect.Crafting'
              : 'FABRICATE.App.Journal.WhatToExpect.CraftingSingleStep'
          )
  );

  function stageState(index) {
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
  function numberOrNaN(raw) {
    return raw == null ? Number.NaN : Number(raw);
  }
  function formatRoll(check) {
    const formula = String(check?.formula ?? '');
    const total = numberOrNaN(check?.total);
    const value = numberOrNaN(check?.value);
    const dc = numberOrNaN(check?.dc);
    if (formula !== '' && Number.isFinite(total)) {
      return Number.isFinite(dc)
        ? localize('FABRICATE.App.Journal.StepDetails.RollResultWithDc', { formula, total, dc })
        : localize('FABRICATE.App.Journal.StepDetails.RollResult', { formula, total });
    }
    if (Number.isFinite(value)) {
      return Number.isFinite(dc)
        ? localize('FABRICATE.App.Journal.StepDetails.RollResultValueWithDc', { value, dc })
        : localize('FABRICATE.App.Journal.StepDetails.RollResultValue', { value });
    }
    return '';
  }
  function stageFacts(stage) {
    const facts = [];
    const snapshot = stage?.requirementSnapshot;
    for (const [index, group] of (snapshot?.ingredientGroups ?? []).entries()) {
      const picked = Number(
        stage?.selectionPlan?.ingredientOptionOverrides?.[group?.id]?.optionIndex
      );
      const option =
        group?.options?.[Number.isSafeInteger(picked) ? picked : 0] ?? group?.options?.[0];
      const name =
        option?.name ??
        option?.match?.value ??
        option?.componentId ??
        localize('FABRICATE.App.Journal.Yields.Item');
      const quantity = Math.max(1, Number(option?.quantity ?? group?.quantity) || 1);
      facts.push({
        id: `requirement-${group?.id ?? index}`,
        icon: 'fas fa-box',
        label: group?.name ?? localize('FABRICATE.App.Journal.Stage.Requirement', { n: index + 1 }),
        value: `${name} ${localize('FABRICATE.App.Journal.Quantity', { n: quantity })}`,
      });
    }
    if (Number(stage?.detail?.requiredSeconds) > 0)
      facts.push({
        id: 'time',
        icon: 'fas fa-clock',
        label: localize('FABRICATE.App.Journal.StepDetails.RequiresTime'),
        value: formatDurationHMS(stage.detail.requiredSeconds),
      });
    if (stage?.lastCheckResult)
      facts.push({
        id: 'roll',
        icon: 'fas fa-dice-d20',
        label: localize('FABRICATE.App.Journal.StepDetails.RollLabel'),
        value: formatRoll(stage.lastCheckResult),
      });
    if (stage?.detail?.failureText)
      facts.push({
        id: 'failure',
        icon: 'fas fa-triangle-exclamation',
        label: localize('FABRICATE.App.Journal.StepDetails.Failure'),
        value: stage.detail.failureText,
      });
    if (stage?.consumedIngredients?.length)
      facts.push({
        id: 'spent',
        icon: 'fas fa-box-open',
        label: localize('FABRICATE.App.Journal.StepDetails.ConsumedTitle'),
        value: stage.consumedIngredients
          .map((item) => `${item.name ?? item.componentId} ×${item.quantity}`)
          .join(', '),
      });
    return facts;
  }
</script>

<article class="journal-detail" data-journal-detail data-run-key={run?.key ?? run?.id}>
  <header class="journal-detail-header">
    <div class="journal-detail-identity">
      <Medallion art={run?.img ?? ''} icon="fas fa-hammer" alt="" size={52} />
      <div>
        <h2>{run?.names?.title ?? ''}</h2>
        <div class="journal-detail-meta">
          {#if run?.names?.subtitle}<span>{run.names.subtitle}</span>{/if}
          <Chip
            density="list"
            tone={statusChipTone(statusView.tone)}
            icon={`fas ${statusView.icon}`}>{localize(statusView.labelKey)}</Chip
          >
          {#if run?.blindSecretPreview}<Chip density="list" tone="warning" icon="fas fa-eye-slash"
              >{localize('FABRICATE.App.Journal.BlindSecret.Badge')}</Chip
            >{/if}
        </div>
      </div>
    </div>
    {#if showActions}<ActionsPanel {run} {journal} {now} />{/if}
  </header>

  {#if run?.recoveryEvidence?.required}
    <Notice
      tone="danger"
      blocking
      title={localize('FABRICATE.App.Journal.Notice.RecoveryTitle')}
      detail={localize('FABRICATE.App.Journal.Notice.RecoveryDetail', {
        count: run.recoveryEvidence.appliedEffectCount ?? 0,
      })}
      dataAttr="data-journal-recovery"
      dataValue="true"
    />
  {:else if run?.pauseState}
    <Notice
      tone="warning"
      title={localize('FABRICATE.App.Journal.Notice.PausedTitle')}
      detail={localize('FABRICATE.App.Journal.Notice.PausedDetail')}
      dataAttr="data-journal-paused"
      dataValue="true"
    />
  {:else if run?.actions?.disabledReason === 'unsupportedLifecycle'}
    <Notice
      tone="warning"
      title={localize('FABRICATE.App.Journal.Notice.UnsupportedTitle')}
      detail={localize('FABRICATE.App.Journal.Actions.UnsupportedLifecycle')}
    />
  {/if}

  {#if terminal}
    <Notice
      tone={status === 'succeeded' ? 'success' : status === 'failed' ? 'danger' : 'info'}
      title={localize(`FABRICATE.App.Journal.Verdict.${status}`)}
      detail={status === 'failed' ? (run?.failureReason ?? '') : ''}
      dataAttr="data-journal-verdict"
      dataValue={status}
    />
  {/if}

  {#if stages.length > 0}
    <section class="journal-detail-stages" data-journal-stages>
      <RunProgress
        {stages}
        current={currentIndex}
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
          localize('FABRICATE.App.Journal.Stage.Return', { index: index + 1 })}
      />
      {#if viewedStage}
        <StageCard
          stage={{
            name:
              viewedStage.stepName ||
              localize('FABRICATE.App.Journal.Stage.Number', { index: viewedIndex + 1 }),
            summary: viewedStage.detail?.summary ?? '',
          }}
          index={viewedIndex}
          current={!terminal && viewedIndex === currentIndex}
          state={stageState(viewedIndex)}
          tag={{
            label: localize(`FABRICATE.App.Journal.Stage.State.${stageState(viewedIndex)}`),
            tone: stageState(viewedIndex) === 'past' ? 'positive' : 'neutral',
          }}
          facts={stageFacts(viewedStage)}
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
  {/if}

  {#if gate && !terminal}<TimeRemainingBox
      availableAt={gate.availableAt}
      hintKey={run?.isFinalStep ? 'FABRICATE.App.Journal.TimeRemaining.WhenPassedFinal' : undefined}
      {services}
    />{/if}

  {#if gatheringYield?.mode === 'routed' && outcomeTiers.length > 0}
    <OutcomeLadder
      tiers={outcomeTiers}
      emptyTierText={localize('FABRICATE.App.Journal.Yields.None')}
      label={localize('FABRICATE.App.Journal.Yields.PreviewTitle')}
    />
  {:else if gatheringYield && yieldEntries.length > 0}
    <YieldScale
      entries={yieldEntries}
      roll={gatheringYield.roll}
      label={localize('FABRICATE.App.Journal.Yields.PreviewTitle')}
      labels={{
        threshold: (entry) =>
          localize('FABRICATE.App.Journal.Yields.Chance', { chance: entry.chance }),
        cleared: (entry) =>
          localize('FABRICATE.App.Journal.Yields.Awarded', { chance: entry.chance }),
        missed: (entry) =>
          localize('FABRICATE.App.Journal.Yields.Missed', { chance: entry.chance }),
        quantity: (entry) => localize('FABRICATE.App.Journal.Quantity', { n: entry.qty }),
        chance: (entry) => `${entry.chance}%`,
        cut: (roll) => String(roll),
      }}
    />
  {/if}

  {#if resultEntries.length > 0}
    <YieldScale
      entries={resultEntries}
      label={localize('FABRICATE.App.Journal.Yields.AwardedTitle')}
      labels={{
        threshold: () => localize('FABRICATE.App.Journal.Yields.Received'),
        quantity: (entry) => localize('FABRICATE.App.Journal.Quantity', { n: entry.qty }),
        chance: () => localize('FABRICATE.App.Journal.Yields.AwardedChip'),
      }}
    />
  {/if}

  <section class="journal-detail-record" data-journal-record>
    <h3>{localize('FABRICATE.App.Journal.Record.Title')}</h3>
    <JournalFactRow
      icon="fa-fingerprint"
      label={localize('FABRICATE.App.Journal.About.RunId')}
      value={run?.id ?? ''}
    />
    {#if run?.recipeId}<JournalFactRow
        icon="fa-scroll"
        label={localize('FABRICATE.App.Journal.About.Recipe')}
        value={run.recipeId}
      />{/if}
    {#if run?.taskId}<JournalFactRow
        icon="fa-leaf"
        label={localize('FABRICATE.App.Journal.Record.Task')}
        value={run.taskId}
      />{/if}
    {#if resolutionModeLabel}<JournalFactRow
        icon="fa-diagram-project"
        label={localize('FABRICATE.App.Journal.About.Mode')}
        value={resolutionModeLabel}
      />{/if}
    {#if startedLabel}<JournalFactRow
        icon="fa-clock"
        label={localize('FABRICATE.App.Journal.About.Started')}
        value={startedLabel}
      />{/if}
    {#if finishedLabel}<JournalFactRow
        icon="fa-flag-checkered"
        label={localize('FABRICATE.App.Journal.Record.Finished')}
        value={finishedLabel}
      />{/if}
  </section>

  <Callout
    tone="info"
    title={localize('FABRICATE.App.Journal.WhatToExpect.Title')}
    text={`${guidance} ${localize('FABRICATE.App.Journal.Tips.WorldTime')}`}
    dataAttr="data-journal-guidance"
  />
</article>

<style>
  .journal-detail {
    display: grid;
    gap: var(--fab-space-4);
    min-width: 0;
    padding: var(--fab-space-4);
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
    font-size: 18px;
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
  .journal-detail-record {
    display: grid;
    gap: var(--fab-space-1);
    padding-top: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }
  .journal-detail-record h3 {
    margin: 0 0 var(--fab-space-2);
    color: var(--fab-text-subtle);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
