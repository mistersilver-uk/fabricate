<!-- Svelte 5 runes mode -->
<!--
  RunDetail is the Journal's centre column: the full view of the selected run.
  With no run selected it shows the "Select a run" per-column empty state. With a
  run selected it renders a header (thumb, name, status pill, structure + step
  labels, flavor) then branches on runType:
   - crafting / salvage: a StepTimeline + the current step's StepDetails;
   - gathering: a simple auto-resolve summary (full gathering detail is Phase 2).
  An ActionsPanel is shown for non-terminal runs (run-type-aware: a Trigger button
  for crafting, an auto-resolve note for gathering/salvage). The run's
  createdResults are listed only when it succeeded.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RunStatusPill from './RunStatusPill.svelte';
  import StepTimeline from './StepTimeline.svelte';
  import StepDetails from './StepDetails.svelte';
  import ActionsPanel from './ActionsPanel.svelte';

  const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';
  const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

  let { run = null, now = 0, services = null } = $props();

  const runType = $derived(String(run?.runType ?? ''));
  const status = $derived(String(run?.derivedStatus ?? ''));
  const isTerminal = $derived(TERMINAL.has(status));
  const isSucceeded = $derived(status === 'succeeded');
  const hasSteps = $derived(runType === 'crafting' || runType === 'salvage');
  const steps = $derived(Array.isArray(run?.steps) ? run.steps : []);
  const stepCount = $derived(steps.length);
  // The step whose requirement facts to show: the active step when present, else
  // the last step (terminal runs).
  const detailStep = $derived(run?.currentStep ?? (stepCount > 0 ? steps[stepCount - 1] : null));
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
  <div class="journal-detail-empty" data-journal-empty="detail">
    <i class="fas fa-hand-pointer" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Journal.Empty.Detail')}</p>
  </div>
{:else}
  <article class="journal-detail" data-journal-detail data-run-id={run.id} data-run-type={runType}>
    <header class="journal-detail-header">
      <img class="journal-detail-thumb" src={run.img || DEFAULT_RUN_IMAGE} alt="" />
      <div class="journal-detail-identity">
        <h2 class="journal-detail-title" title={run.names?.title ?? ''}>{run.names?.title ?? ''}</h2>
        <div class="journal-detail-meta">
          <RunStatusPill {status} />
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
        <StepTimeline {steps} currentIndex={run.stepIndex} />
        <StepDetails step={detailStep} />
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
          <h3 class="journal-detail-results-title">{resultsTitle}</h3>
          <ul class="journal-detail-results-list">
            {#each createdResults as result, index (result.itemUuid ?? result.componentId ?? index)}
              <li class="journal-detail-result" data-journal-result>
                {#if result.img}
                  <img class="journal-detail-result-thumb" src={result.img} alt="" />
                {/if}
                <span class="journal-detail-result-name">{result.name ?? result.componentId ?? ''}</span>
                {#if Number(result.quantity) > 1}
                  <span class="journal-detail-result-qty">{localize('FABRICATE.App.Journal.Quantity', { n: result.quantity })}</span>
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
  .journal-detail-empty {
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

  .journal-detail-empty i {
    font-size: 32px;
  }

  .journal-detail-empty p {
    margin: 0;
    font-size: 14px;
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

  .journal-detail-thumb {
    display: block;
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--fab-surface-raised);
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

  .journal-detail-result-thumb {
    display: block;
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    object-fit: cover;
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
