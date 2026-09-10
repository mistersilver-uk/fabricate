// Mounted coverage for RunDetail: the per-column "select a run" empty state, the
// crafting branch (step timeline + step details + Trigger button gated on
// readiness), the gathering branch (auto-resolve, no button), and the
// succeeded-run created-results section. Uses the shared harness with the full
// RunDetail subtree registered so the suite cannot hang as `# cancelled`.
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  PLAYER_APP_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness
} from '../helpers/svelte-component-harness.js';
import { makeCraftingRun, makeGatheringRun, makeSucceededRun, createPersistedCraftingHistory } from '../helpers/journal-fixtures.js';
import { GatheringRichStateService } from '../../src/systems/GatheringRichStateService.js';
import { RunJournalBuilder } from '../../src/systems/RunJournalBuilder.js';
import { GatheringRunManager } from '../../src/systems/GatheringRunManager.js';
import { GatheringEngine } from '../../src/systems/GatheringEngine.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-run-detail-',
  rawModules: [
    // Issue 1504/1506: the raw closure the shared `<Select>` reaches through
    // `SearchablePopover`, which the compiled `<Chip>` closure below arrives with.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/ui/svelte/util/worldTimeLabel.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js',
    'src/ui/svelte/apps/journal/historyPresentation.js',
    // Issue 1506: the run's status is a `<Chip>` now, and the chip tone it wears comes from
    // the ONE map the retired status vocabularies were routed through.
    ...STATUS_TONE_RAW_MODULES
  ],
  compiledModules: [
    // Issue 1506: the journal's status pill retired into the shared chip, which this list
    // reaches through the `<Select>` closure rather than by a fourth hand-written literal.
    ...SELECT_COMPILED_MODULES,
    // The shared primitives this tree draws, as ONE spread (issue 1514). See
    // `PLAYER_APP_COMPILED_MODULES` in the harness for why it is one roster and not a
    // list per suite.
    ...PLAYER_APP_COMPILED_MODULES,
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    ...['RunActionBar', 'ManagerButton', 'SlotTile',
      'SlotRow', 'ChoiceOptionList', 'EssencePool', 'RunProgress', 'StageNav',
      'StageCard', 'YieldScale', 'OutcomeLadder'].map((name) => `src/ui/svelte/components/${name}.svelte`),
    'src/ui/svelte/apps/journal/JournalCard.svelte',
    'src/ui/svelte/apps/journal/JournalFactRow.svelte',
    'src/ui/svelte/apps/journal/StepTimeline.svelte',
    'src/ui/svelte/apps/journal/StepDetails.svelte',
    'src/ui/svelte/apps/journal/TimeRemainingBox.svelte',
    'src/ui/svelte/apps/journal/ActionsPanel.svelte',
    'src/ui/svelte/apps/journal/RunDetail.svelte'
    , 'src/ui/svelte/apps/journal/HistoricalRunDetail.svelte', 'src/ui/svelte/apps/journal/ThisRun.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/journal/RunDetail.svelte'
});

function services() {
  return { journal: { busyRunId: '', execute() {} }, getWorldTimeComponents: () => null };
}

const mount = (props) => harness.mount({ ...props, journal: props.services?.journal });

async function projectGatheringRecord(payload, status = 'succeeded') {
  const flags = {};
  const actor = { id: 'gatherer', uuid: 'Actor.gatherer',
    getFlag: (_scope, key) => flags[key],
    setFlag: async (_scope, key, value) => { flags[key] = JSON.parse(JSON.stringify(value)); },
  };
  const manager = new GatheringRunManager({ randomID: () => 'gathered', nowWorldTime: () => 100, getUserId: () => 'player' });
  await manager.createTerminalRun(actor, { craftingSystemId: 'system', environmentId: 'environment', taskId: 'forage' }, status, payload);
  return new RunJournalBuilder({ gatheringRunSource: new GatheringRunManager() })
    .buildListing({ actor, viewer: { isGM: true } }).history[0];
}

describe('RunDetail mounted behavior', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  const forbiddenHistory = '[data-run-progress], [data-stage-nav], [data-journal-actions], [data-journal-summary], [data-journal-record], [data-journal-stage-details], [data-journal-time-remaining]';
  it('history-just-resolved owns its single summary until the correlated notice clears', async () => {
    const { model } = await createPersistedCraftingHistory({ stageCount: 1 });
    const target = await harness.mount({ run: model, journal: { commandResult: { runKey: model.key } } });
    assert.ok(target.querySelector('[data-history-items="transient-produced"]'));
    assert.ok(!target.querySelector('[data-history-summary]'));
    assert.equal(target.querySelectorAll('[data-essence-history-carrier]').length, 2);
    harness.remount();
    const reselected = await harness.mount({ run: model, journal: { commandResult: { runKey: 'another-run' } } });
    assert.ok(reselected.querySelector('[data-history-summary="check"]'));
    assert.ok(!reselected.querySelector('[data-history-items="transient-produced"]'));
    assert.ok(!reselected.querySelector(forbiddenHistory));
  });

  it('orders current purpose and produces above consumes, and names the check action', async () => {
    const base = makeCraftingRun();
    const step = { ...base.steps[0], presentationSnapshot: { name: 'Recorded stage', description: 'Recorded purpose' } };
    const run = makeCraftingRun({ steps: [step], currentStep: step, craftingYield: { source: 'preview', stageIndex: 0, entries: [{ id: 'tonic', name: 'Tonic', qty: 2 }], presentation: 'entries' } });
    const target = await harness.mount({ run, now: 2000 });
    const card = target.querySelector('[data-stage-card]');
    assert.match(card.querySelector('.fab-stage-card-name').textContent, /Recorded purpose/);
    assert.ok(card.querySelector('[data-stage-io="produced"]').compareDocumentPosition(card.querySelector('[data-journal-stage-details]')) & 4);
    assert.match(target.querySelector('[data-run-action="primary"]').textContent, /RollCheck/);
    assert.ok(!target.querySelector('[data-journal-record]'));
  });

  it('uses localized unknown identity without fabricating a missing amount', async () => {
    const run = makeSucceededRun({ steps: [{ status: 'succeeded', consumedIngredients: [{ actorUuid: 'Actor.a', itemUuid: 'Actor.a.Item.gone', name: null, quantity: null }] }] });
    const target = await harness.mount({ run });
    const text = target.querySelector('[data-history-items="consumed"]').textContent;
    assert.match(text, /UnknownMaterial/);
    assert.match(text, /NotRecorded/);
    assert.doesNotMatch(text, /null|undefined|×1|×0/);
  });

  for (const [roll, extraModifier, hits] of [[1, 0, 0], [41, 0, 1], [100, 0, 2], [21, 10, 1]]) {
    it(`native d100 history keeps actual outcomes and awards for ${roll}+${extraModifier}`, async () => {
      const task = { id: 'forage', resolutionMode: 'd100', dropRows: [
        { id: 'common', componentId: 'herb', name: 'Herb', quantity: 99, dropRate: 70 },
        { id: 'rare', componentId: 'seed', name: 'Seed', quantity: 99, dropRate: 20 },
      ] };
      const resolved = await new GatheringRichStateService({ rollD100: () => roll }).resolveD100Attempt({ task, environment: { rules: { rewardSelectionMode: 'allDrops' } }, extraModifier });
      const run = await projectGatheringRecord({
        checkResult: { provider: 'd100', roll: resolved.roll, itemRows: resolved.itemRows, items: resolved.items },
        createdResults: resolved.items.map((row) => ({ actorUuid: 'Actor.gatherer', componentId: row.componentId, name: row.name, quantity: 3 })),
      });
      const target = await harness.mount({ run });
      assert.equal(target.querySelectorAll('[data-yield-cut]').length, 1);
      assert.ok(!target.querySelector('[data-history-summary], [data-history-items="produced"], [data-outcome-ladder]'));
      assert.equal(target.querySelectorAll('[data-yield-entry]').length, 2);
      assert.equal(target.querySelectorAll('.is-cleared').length, hits);
      assert.equal(target.querySelectorAll('.is-missed').length, 2 - hits);
      const order = [...target.querySelector('.fab-yield-rows').children];
      assert.equal(order.indexOf(target.querySelector('[data-yield-cut]')), hits, 'the cut follows the recorded successes');
      assert.match(target.querySelector('[data-yield-cut]').textContent, new RegExp(String(roll)));
      assert.equal(run.gatheringYield.entries[0].effectiveRoll, roll + extraModifier);
      assert.deepEqual(run.gatheringYield.entries.map((entry) => entry.qty), Array.from({ length: 2 }, (_entry, index) => index < hits ? 3 : 0));
      assert.doesNotMatch(target.querySelector('[data-yield-scale]').textContent, /99|NotRecorded/);
      if (hits === 0) assert.match(target.querySelector('[data-journal-guidance]').textContent, /ClosedSuccessEmpty/);
    });
  }
  for (const success of [true, false]) {
    it(`routed gathering renders its persisted check and outcome (success=${success})`, async () => {
      const outcome = success ? 'Fine' : 'Setback';
      const result = await GatheringEngine.prototype._resolveRoutedFormulaOutcome.call(Object.create(GatheringEngine.prototype), {
        routed: { dc: 15 }, rollFormula: 'LIVE_FORMULA', task: { resultGroups: [{ id: 'result', name: outcome, results: [] }] },
        resolvedCheckResult: { success, outcome, value: 17, data: { resolvedFormula: '1d20 + 3', total: 17, dc: 15, privateConfiguration: 'SECRET' } },
      });
      const run = await projectGatheringRecord({ checkResult: result.checkResult, createdResults: [] }, success ? 'succeeded' : 'failed');
      const target = await harness.mount({ run });
      assert.match(target.querySelector('[data-history-outcome-log]').textContent, new RegExp(outcome));
      assert.ok(!target.querySelector('[data-outcome-ladder], [data-history-verdict-check]'));
      assert.equal(target.querySelectorAll('[data-history-summary="check"]').length, success ? 1 : 0);
      assert.equal(target.textContent.split('1d20 + 3').length - 1, 1, 'roll appears once');
      assert.doesNotMatch(target.textContent, /LIVE_FORMULA|SECRET/);
      assert.equal(run.gatheringYield.check.dc, 15);
    });
  }
  for (const [state, options, summary, count] of [
    ['history-checked-choice', { stageCount: 1 }, 'check', 1],
    ['history-resolution-simple', { stageCount: 1, checked: false }, 'none', 1],
    ['history-resolution-ingredients', { stageCount: 1, checked: false, mode: 'routedByIngredients' }, 'ingredients', 1],
    ['history-checked-ingredients', { stageCount: 1, mode: 'routedByIngredients' }, 'check', 1],
    ['history-multi-success', {}, null, 2],
    ['history-multi-failure', { failLast: true }, null, 2],
    ['history-cancelled-before', { cancelAfter: 0 }, null, 0],
    ['finished-cancelled', { cancelAfter: 1, armNext: true }, null, 1],
    ['history-cancelled-multi', { stageCount: 3, cancelAfter: 2, armNext: true }, null, 2],
  ]) {
    it(`${state}: mounts the reloaded writer account without active controls`, async () => {
      const { model } = await createPersistedCraftingHistory(options);
      const target = await harness.mount({ run: model, services: services() });
      assert.ok(target.querySelector('[data-journal-history-detail]'));
      assert.ok(!target.querySelector(forbiddenHistory), state);
      assert.equal(target.querySelectorAll('[data-history-stages] [data-stage-card]').length, count > 1 ? count : 0);
      assert.equal(target.querySelector('[data-history-summary]')?.dataset.historySummary ?? null, summary);
      const history = target.querySelector('[data-journal-history-detail]');
      assert.doesNotMatch(history.textContent, /Later live purpose|Changed live|CHANGED_PRIVATE_FORMULA|\bnull\b|\bundefined\b/);
      assert.ok(target.querySelector('[data-journal-this-run]'));
      assert.ok(target.querySelector('[data-journal-guidance]'));
      if (count > 1) {
        const cards = [...target.querySelectorAll('[data-history-stages] [data-stage-card]')];
        cards.forEach((card, index) => {
          assert.match(card.querySelector('[data-stage-io="produced"]').textContent, new RegExp(`Award stage-${index}`));
          assert.equal(card.querySelectorAll('[data-stage-fact="resolution"]').length, 1);
        });
      }
      if (count > 0) {
        assert.equal(target.querySelectorAll('[data-essence-history-carrier]').length, 2);
        assert.ok(!target.querySelector('[data-essence-history] input, [data-essence-history] button'));
      }
    });
  }

  it('preserves deleted-recipe evidence and redacts the real opaque writer account', async () => {
    const { model, deletedRecipeModel } = await createPersistedCraftingHistory({ opaque: true });
    let target = await harness.mount({ run: model, services: services() });
    assert.doesNotMatch(target.querySelector('[data-journal-history-detail]').textContent, /Carrier|Purpose|Recorded route|Award stage/);
    harness.remount();
    target = await harness.mount({ run: deletedRecipeModel, services: services() });
    assert.match(target.textContent, /Award stage-0/);
    assert.ok(!target.querySelector(forbiddenHistory));
  });

  it('owns a checked single failure roll once and preserves permitted failure awards', async () => {
    const { model } = await createPersistedCraftingHistory({ failLast: true, stageCount: 1 });
    const target = await harness.mount({ run: model, services: services() });
    assert.equal(target.querySelectorAll('[data-history-verdict-check]').length, 1);
    assert.ok(!target.querySelector('[data-history-summary="check"]'));
    assert.match(target.querySelector('[data-history-items="produced"]').textContent, /Award stage-0/);
    assert.match(target.querySelector('[data-journal-guidance]').textContent, /ClosedFailureAwards/);
  });

  it('renders no action or stage for an absent run (the Journal owns the empty state)', async () => {
    const target = await mount({ run: null, now: 0, services: services() });
    assert.ok(!target.querySelector('[data-journal-actions]'));
    assert.ok(!target.querySelector('[data-stage-card]'));
  });

  it('renders the crafting step timeline, step details, and a Trigger button', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0, services: services() });
    const detail = target.querySelector('[data-journal-detail]');
    assert.equal(detail.getAttribute('data-run-key'), makeCraftingRun().key);
    assert.ok(target.querySelector('[data-stage-nav]'), 'stage navigation rendered');
    assert.ok(target.querySelector('[data-stage-card]'), 'step details rendered');
    assert.ok(
      target.querySelector('[data-stage-card]').textContent.includes('Mortar & Pestle'),
      'primary tool fact rendered'
    );
    assert.ok(target.querySelector('[data-run-action="primary"]'), 'primary action rendered for a crafting run');
    // The active node (index 0) is time-gated, so it takes the distinct "waiting"
    // (warning) tone rather than the accent "current" tone; index 1 is pending.
    assert.equal(target.querySelector('[data-stage-card="0"]').getAttribute('data-stage-state'), 'current');
    assert.ok(target.querySelector('[data-stage-nav-index="1"]'));
  });

  // BOTH TITLE LOCATORS MOVED WITH THE MARKUP (issue 1514). `JournalCard` drew its heading as
  // a hand-rolled `.journal-card-title` `<h3>`; it is a `<Kicker as="h3">` now, so the class is
  // gone and `.fab-kicker` is the locator. A test that kept the old selector would not have
  // failed loudly — `querySelector` returns null and the assertion dies on `textContent`, which
  // is what these two did before this line was written.
  it('names the viewed stage for a multi-step run', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0, services: services() });
    const title = target.querySelector('[data-stage-card] .fab-stage-card-name');
    assert.equal(title.textContent, 'Brew', 'multi-step keeps its authored stage name');
  });

  it('suppresses redundant stage heading and navigation for a single-step run', async () => {
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
    assert.ok(!target.querySelector('[data-stage-nav]'), 'single-step run omits navigation');
    assert.ok(!target.querySelector('.fab-stage-card-number'), 'single-step run omits redundant numeral');
    assert.match(target.querySelector('.fab-stage-card-name').textContent, /Brew/);
  });

  it('disables Trigger while the gate is unmatured and enables it once ready', async () => {
    const waiting = await harness.mount({ run: makeCraftingRun(), now: 0, services: services() });
    assert.equal(waiting.querySelector('[data-run-action="primary"]').disabled, true, 'waiting → disabled');
    assert.ok(waiting.querySelector('[data-journal-time-remaining]'), 'waiting → shows the time-remaining callout');

    harness.remount();
    const ready = await harness.mount({ run: makeCraftingRun(), now: 2000, services: services() });
    assert.equal(ready.querySelector('[data-run-action="primary"]').disabled, false, 'matured gate → enabled');
  });

  it('treats an un-armed step (no time gate) as immediately triggerable', async () => {
    const run = makeCraftingRun({ timeGate: null, derivedStatus: 'inProgress' });
    const target = await harness.mount({ run, now: 0, services: services() });
    assert.equal(target.querySelector('[data-run-action="primary"]').disabled, false, 'no gate → triggerable now');
  });

  it('disables Trigger while the run is busy even after the gate has matured', async () => {
    const run = makeCraftingRun();
    // Matured gate (now past availableAt) would normally enable the button, but a
    // busy advance for this run id keeps it disabled to block re-entrancy.
    const svc = { journal: { busyRunId: run.id, advance() {} }, getWorldTimeComponents: () => null };
    const target = await mount({ run, now: 2000, services: svc });
    assert.equal(target.querySelector('[data-run-action="primary"]').disabled, true, 'busy → disabled');
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
    assert.equal(target.querySelector('[data-journal-verdict]').getAttribute('data-journal-verdict'), 'failed');
    assert.ok(!target.querySelector('[data-journal-actions]'), 'terminal run shows no actions panel');
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
    const details = target.querySelector('[data-stage-card]');
    assert.ok(details, 'step details render for a terminal run without a currentStep');
    assert.equal(target.querySelectorAll('[data-history-stages] [data-stage-card]').length, 2, 'all attempted stages render together');
    assert.match(target.querySelector('[data-history-stages]').textContent, /Brew.*Bottle/s);
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
    const details = target.querySelector('[data-journal-history-detail]');
    assert.ok(!target.querySelector('[data-stage-nav]'), 'history is not a stage browser');
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
    const details = target.querySelector('[data-journal-history-detail]');
    assert.ok(details, 'historical evidence renders for a legacy no-formula roll');
    assert.ok(details.textContent.includes('RollResultValue'), 'bare-value roll fallback rendered');
    assert.ok(details.textContent.includes('9'), 'shows the bare rolled value');
  });

  it('does not fabricate "vs DC 0" when a formula roll has no static DC (issue 738)', async () => {
    // Progressive / dynamic-DC checks persist `dc: null`. Number(null) === 0 is
    // finite, so an unguarded coercion would render the WithDc variant "vs DC 0".
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
          lastCheckResult: { success: false, formula: '1d20', total: 7, dc: null, value: 7 },
          requirements: [],
          consumedIngredients: []
        }
      ]
    });
    const target = await harness.mount({ run, now: 5000, services: services() });
    const details = target.querySelector('[data-journal-history-detail]');
    assert.ok(details.textContent.includes('RollResult'), 'a roll row is still rendered');
    assert.ok(!details.textContent.includes('WithDc'), 'the WithDc variant is not used for a null DC');
    assert.ok(!details.textContent.includes('"dc"'), 'no DC is interpolated into the roll');
  });

  it('does not fabricate "vs DC 0" for a bare-value roll with no static DC (issue 738)', async () => {
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
          lastCheckResult: { success: false, formula: null, total: null, value: 9, dc: null },
          requirements: [],
          consumedIngredients: []
        }
      ]
    });
    const target = await harness.mount({ run, now: 5000, services: services() });
    const details = target.querySelector('[data-journal-history-detail]');
    assert.ok(details.textContent.includes('RollResultValue'), 'the bare-value roll row is rendered');
    assert.ok(!details.textContent.includes('WithDc'), 'the WithDc variant is not used for a null DC');
  });

  it('renders duplicate-component requirement rows without an each_key crash (issue 738)', async () => {
    // Two ingredient groups can reference the same component; those rows share a
    // componentId and each carry a null itemUuid, so a componentId-only key would
    // collide into a Svelte each_key_duplicate crash.
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
          consumedIngredients: [
            { componentId: 'c-iron', itemUuid: null, quantity: 2, name: 'Iron', img: 'icons/iron.webp' },
            { componentId: 'c-iron', itemUuid: null, quantity: 1, name: 'Iron', img: 'icons/iron.webp' }
          ],
          requirements: []
        }
      ]
    });
    const target = await harness.mount({ run, now: 5000, services: services() });
    const rows = target.querySelectorAll('[data-history-items="consumed"] .manager-chip');
    assert.equal(rows.length, 2, 'both same-component requirement rows render');
  });

  it('renders no roll row when a check result has neither formula nor value (issue 738)', async () => {
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
          detail: {
            requiredSeconds: null,
            primaryToolName: null,
            toolNames: [],
            checkLabel: null,
            failureText: 'Botched the brew'
          },
          // A minimal recorded check with an explicit null value must not fabricate "Rolled 0".
          lastCheckResult: { success: false, formula: null, total: null, value: null, dc: null },
          requirements: [],
          consumedIngredients: []
        }
      ]
    });
    const target = await harness.mount({ run, now: 5000, services: services() });
    const details = target.querySelector('[data-journal-history-detail]');
    assert.ok(details, 'historical detail renders for the failed step');
    assert.ok(details.textContent.includes('Botched the brew'), 'shows the failure text');
    assert.ok(!details.textContent.includes('RollResultValue'), 'no bare-value roll row rendered');
    assert.ok(!details.textContent.includes('RollResult'), 'no roll row rendered at all');
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
    const consumed = target.querySelector('[data-history-items="consumed"]');
    assert.ok(!target.querySelector('[data-stage-fact^="requirement-"]'), 'history does not repeat authored requirements as actual spending');
    assert.ok(consumed, 'consumed section rendered');
    assert.ok(consumed.querySelector('.manager-chip'), 'actual consumption rendered');
    assert.ok(consumed.textContent.includes('Dried Herb'), 'consumed name rendered');
  });

  it('calls store.execute when the enabled primary action is clicked', async () => {
    const advanced = [];
    const svc = { journal: { busyRunId: '', execute: (run) => advanced.push(run?.id) }, getWorldTimeComponents: () => null };
    const target = await mount({ run: makeCraftingRun(), now: 2000, services: svc });
    target.querySelector('[data-run-action="primary"]').click();
    assert.deepEqual(advanced, ['run-craft-1'], 'advance invoked with the run');
  });

  it('shows an auto-resolve note and no Trigger button for a gathering run', async () => {
    const target = await harness.mount({ run: makeGatheringRun(), now: 0, services: services() });
    assert.ok(!target.querySelector('[data-run-action="primary"]'), 'no manual action for legacy gathering');
    assert.match(target.textContent, /WhatToExpect.Gathering/, 'auto-resolve guidance shown');
    assert.ok(!target.querySelector('[data-stage-nav]'), 'no stage nav for gathering');
    assert.ok(
      target.querySelector('[data-journal-summary-card="time"]'),
      'gathering summary shown in the body'
    );
  });

  it('lists created results only when the run succeeded, and hides actions', async () => {
    const target = await harness.mount({ run: makeSucceededRun(), now: 5000, services: services() });
    const results = target.querySelector('[data-history-items="produced"]');
    assert.ok(results, 'results section shown for a succeeded run');
    assert.ok(results.textContent.includes('Healing Potion'), 'result name rendered');
    // The harness's localize stub echoes the key + data, so assert the Quantity
    // key + the count rather than the rendered "×N" glyph.
    const resultText = results.querySelector('.manager-chip').textContent;
    assert.ok(resultText.includes('Quantity'), 'quantity badge uses the localized quantity key');
    assert.ok(resultText.includes('3'), 'quantity badge shows the produced count');
    assert.ok(!target.querySelector('[data-journal-actions]'), 'terminal run shows no actions panel');
  });
});
