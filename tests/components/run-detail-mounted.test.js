// Mounted coverage for RunDetail: the per-column "select a run" empty state, the
// crafting branch (step timeline + step details + Trigger button gated on
// readiness), the gathering branch (auto-resolve, no button), and the
// succeeded-run created-results section. Uses the shared harness with the full
// RunDetail subtree registered so the suite cannot hang as `# cancelled`.
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { makeCraftingRun, makeGatheringRun, makeSucceededRun } from '../helpers/journal-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-run-detail-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/ui/svelte/util/worldTimeLabel.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js'
  ],
  compiledModules: [
    'src/ui/svelte/apps/journal/RunStatusPill.svelte',
    'src/ui/svelte/apps/journal/JournalCard.svelte',
    'src/ui/svelte/apps/journal/JournalFactRow.svelte',
    'src/ui/svelte/apps/journal/StepTimeline.svelte',
    'src/ui/svelte/apps/journal/StepDetails.svelte',
    'src/ui/svelte/apps/journal/TimeRemainingBox.svelte',
    'src/ui/svelte/apps/journal/ActionsPanel.svelte',
    'src/ui/svelte/apps/journal/RunDetail.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/journal/RunDetail.svelte'
});

function services() {
  return { journal: { busyRunId: '', advance() {} }, getWorldTimeComponents: () => null };
}

describe('RunDetail mounted behavior', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('shows the "select a run" empty state with no run', async () => {
    const target = await harness.mount({ run: null, now: 0, services: services() });
    assert.ok(target.querySelector('[data-journal-empty="detail"]'), 'detail empty state shown');
    assert.equal(target.querySelector('[data-journal-detail]'), null, 'no detail article rendered');
  });

  it('renders the crafting step timeline, step details, and a Trigger button', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0, services: services() });
    const detail = target.querySelector('[data-journal-detail]');
    assert.equal(detail.getAttribute('data-run-type'), 'crafting');
    assert.ok(target.querySelector('[data-journal-timeline]'), 'step timeline rendered');
    assert.ok(target.querySelector('[data-journal-card="step-details"]'), 'step details rendered');
    assert.ok(
      target.querySelector('[data-journal-card="step-details"]').textContent.includes('Mortar & Pestle'),
      'primary tool fact rendered'
    );
    assert.ok(target.querySelector('[data-journal-trigger]'), 'Trigger button rendered for a crafting run');
    // The active node (index 0) is time-gated, so it takes the distinct "waiting"
    // (warning) tone rather than the accent "current" tone; index 1 is pending.
    assert.equal(target.querySelector('[data-step-index="0"]').getAttribute('data-step-state'), 'waiting');
    assert.equal(target.querySelector('[data-step-index="1"]').getAttribute('data-step-state'), 'pending');
  });

  it('titles the requirements card "Step requirements" for a multi-step run', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0, services: services() });
    const title = target.querySelector('[data-journal-card="step-details"] .journal-card-title');
    assert.equal(title.textContent, 'FABRICATE.App.Journal.StepDetails.Title', 'multi-step keeps the step title');
  });

  it('titles the requirements card "Craft requirements" for a single-step run', async () => {
    const step = {
      stepId: 's1',
      stepName: 'Brew',
      index: 0,
      status: 'waitingTime',
      timeGate: { availableAt: 1000, initiatedAt: 0, requiredSeconds: 1000 },
      detail: { requiredSeconds: 1000, primaryToolName: 'Mortar & Pestle', toolNames: ['Mortar & Pestle'], checkLabel: null, failureText: null },
      lastCheckResult: null
    };
    const run = makeCraftingRun({
      multiStep: false,
      isFinalStep: true,
      stepLabel: '',
      steps: [step],
      currentStep: step,
      structureLabel: 'Single-Step Recipe'
    });
    const target = await harness.mount({ run, now: 0, services: services() });
    assert.equal(target.querySelector('[data-journal-timeline]'), null, 'single-step run omits the step timeline');
    const title = target.querySelector('[data-journal-card="step-details"] .journal-card-title');
    assert.equal(title.textContent, 'FABRICATE.App.Journal.StepDetails.TitleSingleStep', 'single-step uses the craft title');
  });

  it('disables Trigger while the gate is unmatured and enables it once ready', async () => {
    const waiting = await harness.mount({ run: makeCraftingRun(), now: 0, services: services() });
    assert.equal(waiting.querySelector('[data-journal-trigger]').disabled, true, 'waiting → disabled');
    assert.ok(waiting.querySelector('[data-journal-time-remaining]'), 'waiting → shows the time-remaining callout');

    harness.remount();
    const ready = await harness.mount({ run: makeCraftingRun(), now: 2000, services: services() });
    assert.equal(ready.querySelector('[data-journal-trigger]').disabled, false, 'matured gate → enabled');
  });

  it('treats an un-armed step (no time gate) as immediately triggerable', async () => {
    const run = makeCraftingRun({ timeGate: null, derivedStatus: 'inProgress' });
    const target = await harness.mount({ run, now: 0, services: services() });
    assert.equal(target.querySelector('[data-journal-trigger]').disabled, false, 'no gate → triggerable now');
  });

  it('disables Trigger while the run is busy even after the gate has matured', async () => {
    const run = makeCraftingRun();
    // Matured gate (now past availableAt) would normally enable the button, but a
    // busy advance for this run id keeps it disabled to block re-entrancy.
    const svc = { journal: { busyRunId: run.id, advance() {} }, getWorldTimeComponents: () => null };
    const target = await harness.mount({ run, now: 2000, services: svc });
    assert.equal(target.querySelector('[data-journal-trigger]').disabled, true, 'busy → disabled');
  });

  it('marks a failed step node with the failed state', async () => {
    const run = makeCraftingRun({
      status: 'failed',
      derivedStatus: 'failed',
      stepIndex: 0,
      steps: [
        {
          stepId: 's1',
          stepName: 'Brew',
          index: 0,
          status: 'failed',
          timeGate: null,
          detail: { requiredSeconds: null, primaryToolName: null, toolNames: [], checkLabel: null, failureText: 'Botched' },
          lastCheckResult: null
        }
      ]
    });
    const target = await harness.mount({ run, now: 0, services: services() });
    assert.equal(target.querySelector('[data-step-index="0"]').getAttribute('data-step-state'), 'failed');
    assert.equal(target.querySelector('[data-journal-actions]'), null, 'terminal run shows no actions panel');
  });

  it('falls back to the last step detail for a terminal run with no currentStep', async () => {
    const run = makeSucceededRun({
      currentStep: null,
      steps: [
        {
          stepId: 's1',
          stepName: 'Brew',
          index: 0,
          status: 'succeeded',
          timeGate: null,
          detail: { requiredSeconds: 600, primaryToolName: 'Mortar & Pestle', toolNames: ['Mortar & Pestle'], checkLabel: null, failureText: null },
          lastCheckResult: null
        },
        {
          stepId: 's2',
          stepName: 'Bottle',
          index: 1,
          status: 'succeeded',
          timeGate: null,
          detail: { requiredSeconds: 300, primaryToolName: 'Flask', toolNames: ['Flask'], checkLabel: null, failureText: null },
          lastCheckResult: null
        }
      ]
    });
    const target = await harness.mount({ run, now: 5000, services: services() });
    const details = target.querySelector('[data-journal-card="step-details"]');
    assert.ok(details, 'step details render for a terminal run without a currentStep');
    // detailStep falls back to the LAST step (Flask), not the first.
    assert.ok(details.textContent.includes('Flask'), 'shows the final step tool via the fallback');
  });

  it('selects the last EXECUTED step for a multi-step run that failed early (issue 738)', async () => {
    // All recipe steps are pre-created, so an early failure leaves a trailing
    // `pending` step. The detail must show the executed (failed) step, not the
    // unreached pending one.
    const run = makeSucceededRun({
      status: 'failed',
      derivedStatus: 'failed',
      currentStep: null,
      steps: [
        {
          stepId: 's1',
          stepName: 'Brew',
          index: 0,
          status: 'failed',
          timeGate: null,
          detail: { requiredSeconds: null, primaryToolName: 'Mortar & Pestle', toolNames: ['Mortar & Pestle'], checkLabel: null, failureText: 'Botched the brew' },
          lastCheckResult: { success: false, formula: '1d20', total: 7, dc: 12, value: 7 },
          requirements: [],
          consumedIngredients: []
        },
        {
          stepId: 's2',
          stepName: 'Bottle',
          index: 1,
          status: 'pending',
          timeGate: null,
          detail: { requiredSeconds: null, primaryToolName: 'Flask', toolNames: ['Flask'], checkLabel: null, failureText: null },
          lastCheckResult: null,
          requirements: [],
          consumedIngredients: []
        }
      ]
    });
    const target = await harness.mount({ run, now: 5000, services: services() });
    const details = target.querySelector('[data-journal-card="step-details"]');
    assert.ok(details.textContent.includes('Mortar & Pestle'), 'shows the executed (failed) step');
    assert.ok(details.textContent.includes('Botched the brew'), 'shows the failed step failure text');
    assert.ok(!details.textContent.includes('Flask'), 'does not show the unreached pending step');
  });

  it('renders the bare rolled value when a step has a value but no formula (issue 738)', async () => {
    const run = makeSucceededRun({
      status: 'failed',
      derivedStatus: 'failed',
      currentStep: null,
      steps: [
        {
          stepId: 's1',
          stepName: 'Brew',
          index: 0,
          status: 'failed',
          timeGate: null,
          detail: { requiredSeconds: null, primaryToolName: null, toolNames: [], checkLabel: null, failureText: null },
          // Legacy record: only a bare value, no formula/total.
          lastCheckResult: { success: false, formula: null, total: null, value: 9, dc: null },
          requirements: [],
          consumedIngredients: []
        }
      ]
    });
    const target = await harness.mount({ run, now: 5000, services: services() });
    const details = target.querySelector('[data-journal-card="step-details"]');
    assert.ok(details, 'step details render for a legacy no-formula roll');
    assert.ok(details.textContent.includes('RollResultValue'), 'bare-value roll fallback rendered');
    assert.ok(details.textContent.includes('9'), 'shows the bare rolled value');
  });

  it('lists a step\'s required and consumed ingredients (issue 738)', async () => {
    const run = makeSucceededRun({
      currentStep: null,
      steps: [
        {
          stepId: 's1',
          stepName: 'Brew',
          index: 0,
          status: 'succeeded',
          timeGate: null,
          detail: { requiredSeconds: null, primaryToolName: null, toolNames: [], checkLabel: null, failureText: null },
          lastCheckResult: null,
          requirements: [{ componentId: 'c-herb', itemUuid: null, quantity: 2, name: 'Dried Herb', img: 'icons/herb.webp' }],
          consumedIngredients: [{ componentId: 'c-herb', itemUuid: 'Item.herb', quantity: 2, name: 'Dried Herb', img: 'icons/herb.webp' }]
        }
      ]
    });
    const target = await harness.mount({ run, now: 5000, services: services() });
    const requirements = target.querySelector('[data-journal-requirements]');
    const consumed = target.querySelector('[data-journal-consumed]');
    assert.ok(requirements, 'requirements section rendered');
    assert.ok(requirements.textContent.includes('Dried Herb'), 'requirement name rendered');
    assert.ok(consumed, 'consumed section rendered');
    assert.ok(consumed.querySelector('[data-journal-consumed-item]'), 'a consumed item row rendered');
    assert.ok(consumed.textContent.includes('Dried Herb'), 'consumed name rendered');
  });

  it('calls store.advance when the enabled Trigger button is clicked', async () => {
    const advanced = [];
    const svc = { journal: { busyRunId: '', advance: (run) => advanced.push(run?.id) }, getWorldTimeComponents: () => null };
    const target = await harness.mount({ run: makeCraftingRun(), now: 2000, services: svc });
    target.querySelector('[data-journal-trigger]').click();
    assert.deepEqual(advanced, ['run-craft-1'], 'advance invoked with the run');
  });

  it('shows an auto-resolve note and no Trigger button for a gathering run', async () => {
    const target = await harness.mount({ run: makeGatheringRun(), now: 0, services: services() });
    assert.equal(target.querySelector('[data-journal-trigger]'), null, 'no Trigger button for gathering');
    assert.ok(target.querySelector('[data-journal-auto-resolve]'), 'auto-resolve note shown');
    assert.equal(target.querySelector('[data-journal-timeline]'), null, 'no step timeline for gathering');
    assert.ok(
      target.querySelector('[data-journal-gathering-summary]'),
      'gathering summary shown in the body'
    );
  });

  it('lists created results only when the run succeeded, and hides actions', async () => {
    const target = await harness.mount({ run: makeSucceededRun(), now: 5000, services: services() });
    const results = target.querySelector('[data-journal-results]');
    assert.ok(results, 'results section shown for a succeeded run');
    assert.ok(results.textContent.includes('Healing Potion'), 'result name rendered');
    // The harness's localize stub echoes the key + data, so assert the Quantity
    // key + the count rather than the rendered "×N" glyph.
    const resultText = results.querySelector('[data-journal-result]').textContent;
    assert.ok(resultText.includes('Quantity'), 'quantity badge uses the localized Quantity key');
    assert.ok(resultText.includes('3'), 'quantity badge shows the produced count');
    assert.equal(target.querySelector('[data-journal-actions]'), null, 'terminal run shows no actions panel');
  });
});
