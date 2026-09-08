<!-- Svelte 5 runes mode -->
<!--
  RunDetail is the Journal's centre column: the full view of the selected run.
  With no run selected it shows the "Select a run" per-column empty state. With a
  run selected it renders a header (thumb, name, status chip, structure + step
  labels, flavor) then branches on runType:
   - crafting / salvage: a StepTimeline + the current step's StepDetails;
   - gathering: a simple auto-resolve summary (full gathering detail is Phase 2).
  An ActionsPanel is shown for non-terminal runs (run-type-aware: a Trigger button
  for crafting, an auto-resolve note for gathering/salvage). The run's
  createdResults are listed only when it succeeded.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { statusChipTone } from '../../util/statusChipTone.js';
  import Chip from '../../components/Chip.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import EmptyState from '../manager/EmptyState.svelte';
  import { runStatusPresentation } from './journalRunStatus.js';
  import StepTimeline from './StepTimeline.svelte';
  import StepDetails from './StepDetails.svelte';
  import ActionsPanel from './ActionsPanel.svelte';

  const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';
  const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

  let { run = null, now = 0, services = null } = $props();

  const runType = $derived(String(run?.runType ?? ''));
  const status = $derived(String(run?.derivedStatus ?? ''));
  const runStatus = $derived(runStatusPresentation(status));
  const isTerminal = $derived(TERMINAL.has(status));
  const isSucceeded = $derived(status === 'succeeded');
  const hasSteps = $derived(runType === 'crafting' || runType === 'salvage');
  const steps = $derived(Array.isArray(run?.steps) ? run.steps : []);
  const TERMINAL_STEP = new Set(['succeeded', 'failed']);
  // The step whose detail to show: the active step when present, else the last
  // EXECUTED step for a terminal run. All recipe steps are pre-created, so a run
  // that failed on an early step still carries trailing `pending` steps; picking the
  // raw last array element would show an unreached step with no roll / consumed
  // items. Walk back to the last step that actually ran (a terminal status or a
  // recorded check), falling back to the last element only if none did.
  function lastExecutedStep(list) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const candidate = list[i];
      if (TERMINAL_STEP.has(candidate?.status) || candidate?.lastCheckResult) return candidate;
    }
    return list.length > 0 ? list[list.length - 1] : null;
  }
  const detailStep = $derived(run?.currentStep ?? lastExecutedStep(steps));
  const createdResults = $derived(Array.isArray(run?.createdResults) ? run.createdResults : []);
  // The results heading names the activity: gathered vs salvaged vs crafted.
  const resultsTitle = $derived(
    localize(
      runType === 'gathering'
        ? 'FABRICATE.App.Journal.Results.TitleGathering'
        : runType === 'salvage'
          ? 'FABRICATE.App.Journal.Results.TitleSalvage'
          : 'FABRICATE.App.Journal.Results.Title'
    )
  );
</script>

{#if run == null}
  <!--
    THE FILL IS THE CALLER'S, THE PANEL IS THE PRIMITIVE'S (issue 1514). This branch stands
    in for the whole centre column, so it is a `height: 100%` centred fill; `EmptyState` is
    padding-driven and declares no height, and its own fill escape is `contextClass`, whose
    rules "live in the global sheet" (`EmptyState.svelte:53-55`) — which would put
    `styles/fabricate.css` on this change's path. So `.journal-detail-empty` survives as a
    caller-owned WRAPPER declaring the fill and the centring alone.

    The hook is an EXACT-VALUE one (`data-journal-empty="detail"`), and `EmptyState` renders
    `dataValue || true`, so the value is passed explicitly rather than left bare.
  -->
  <div class="journal-detail-empty">
    <EmptyState
      icon="fas fa-hand-pointer"
      hint={localize('FABRICATE.App.Journal.Empty.Detail')}
      dataAttr="data-journal-empty"
      dataValue="detail"
    />
  </div>
{:else}
  <article class="journal-detail" data-journal-detail data-run-id={run.id} data-run-type={runType}>
    <header class="journal-detail-header">
      <Medallion art={run.img || DEFAULT_RUN_IMAGE} alt="" size={64} />
      <div class="journal-detail-identity">
        <h2 class="journal-detail-title" title={run.names?.title ?? ''}>
          {run.names?.title ?? ''}
        </h2>
        <div class="journal-detail-meta">
          <Chip
            class="journal-run-status"
            density="list"
            tone={statusChipTone(runStatus.tone)}
            icon={`fas ${runStatus.icon}`}
            data-run-status={status}>{localize(runStatus.labelKey)}</Chip
          >
          {#if run.structureLabel}
            <span class="journal-detail-tag">{run.structureLabel}</span>
          {/if}
          {#if run.stepLabel}
            <span class="journal-detail-tag">{run.stepLabel}</span>
          {/if}
        </div>
        {#if run.flavor}
          <p class="journal-detail-flavor">{run.flavor}</p>
        {/if}
      </div>
    </header>

    <div class="journal-detail-body">
      {#if hasSteps}
        {#if run.multiStep}
          <StepTimeline {steps} currentIndex={run.stepIndex} />
        {/if}
        <StepDetails step={detailStep} multiStep={run?.multiStep === true} />
      {:else}
        <p class="journal-detail-gathering-summary" data-journal-gathering-summary>
          {localize('FABRICATE.App.Journal.WhatToExpect.Gathering')}
        </p>
      {/if}

      {#if !isTerminal}
        <ActionsPanel {run} {now} {services} />
      {/if}

      {#if isSucceeded && createdResults.length > 0}
        <section class="journal-detail-results" data-journal-results>
          <!--
            DEFERRED, on ink (issue 1514; register entry for issue 1519). This heading paints
            `var(--fab-success-text)` inside a success-soft well, which is the one thing on the
            panel that says the run SUCCEEDED. `Kicker`'s tone set is `default` (subtle) and
            `accent` (`Kicker.svelte:105`), so the conversion would turn the green grey. The
            plan's kicker table asserts every candidate paints `--fab-text-muted`; measured in
            the View Lab this one resolves to the success-text token instead.
          -->
          <h3 class="journal-detail-results-title">{resultsTitle}</h3>
          <ul class="journal-detail-results-list">
            {#each createdResults as result, index (result.itemUuid ?? result.componentId ?? index)}
              <li class="journal-detail-result" data-journal-result>
                {#if result.img}
                  <Medallion art={result.img} alt="" size={24} />
                {/if}
                <span class="journal-detail-result-name"
                  >{result.name ?? result.componentId ?? ''}</span
                >
                {#if Number(result.quantity) > 1}
                  <span class="journal-detail-result-qty"
                    >{localize('FABRICATE.App.Journal.Quantity', { n: result.quantity })}</span
                  >
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  </article>
{/if}

<style>
  /* THE WRAPPER ONLY: the fill and the centring the column needs. See the markup comment. */
  .journal-detail-empty {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    box-sizing: border-box;
  }

  .journal-detail {
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

  .journal-detail-header {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
  }

  .journal-detail-identity {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .journal-detail-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .journal-detail-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  /* THE ROW'S STATUS CHIP holds its width (issue 1506). The retired journal status pill declared
     `flex: 0 0 auto` on itself; the shared chip declares no flex at all, because POSITION is the
     caller's and geometry is the primitive's — the rule its own `density` note states. So the one
     property that was doing work here is restated here, where the row that squeezes it lives. */
  .journal-detail-meta :global(.journal-run-status) {
    flex: 0 0 auto;
  }

  .journal-detail-tag {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text-muted);
  }

  .journal-detail-flavor {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .journal-detail-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .journal-detail-gathering-summary {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .journal-detail-results {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-success-border);
    border-radius: 8px;
    background: var(--fab-success-soft);
  }

  .journal-detail-results-title {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-success-text);
  }

  .journal-detail-results-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .journal-detail-result {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 13px;
  }

  .journal-detail-result-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .journal-detail-result-qty {
    flex: 0 0 auto;
    font-weight: 600;
    color: var(--fab-text-muted);
  }
</style>
