/**
 * Gathering's FAILURE-RESULT path (issue 1098, AF4/CF6/CF10) — the mirrored award gate,
 * and the four dispositions that must never participate in it.
 *
 * ## Why both halves are asserted, not just the one that creates items
 *
 * The `outcome.status === 'succeeded'` gate is MIRRORED. `_terminalSideEffectPlan` carries
 * one around result PLANNING and `_commitTerminalSideEffects` carries the identical one
 * around result CREATION, and both run in sequence on both flows. The PLAN's
 * `createdResults` is what feeds the run record, `response.createdResults` and the posted
 * chat card, so changing only the commit gate creates items on the actor that all three
 * report as ZERO — a state an item-count-only assertion cannot detect. Every test here
 * therefore reads the PLAN as well as the creation.
 *
 * ## THE WHOLE PATH SHIPS DORMANT (decision 8)
 *
 * `_libraryTaskToRuntimeTask` hardcodes `resolutionMode: 'd100'` and `GatheringEconomyView`
 * renders both formula-rolled modes disabled, both pending issue 683, so no configuration
 * a GM can select reaches this code today. These tests drive the seams directly, which is
 * the only way to pin a capability that is complete and unreachable — and the reason the
 * pin matters is that 683 will turn it on without revisiting any of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GatheringDocumentActor,
  compendiumSourceItem,
  gatheringFixture,
  resolvedCheck,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';


globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => `rid-${Math.random().toString(36).slice(2)}` },
};
globalThis.game = globalThis.game || { user: { id: 'u1', isGM: true } };

const { GatheringEngine } = await import('../src/systems/GatheringEngine.js');

const TASK = { id: 'task-1', name: 'Forage', resolutionMode: 'routed' };
const ENVIRONMENT = { id: 'env-1', name: 'Glade' };

/** A failure outcome carrying an authored group, as the routed seam now hands one over. */
function failedOutcome({ failureAward = true, resultGroups = null } = {}) {
  return {
    status: 'failed',
    resultGroups: resultGroups ?? [
      { id: 'rg-ruined', name: 'Ruined', results: [{ componentId: 'scrap', quantity: 1 }] },
    ],
    ...(failureAward ? { failureAward: true } : {}),
    checkResult: { outcome: 'Ruined', success: false, value: 3, data: {} },
  };
}

function makeEngine() {
  const calls = { planned: 0, created: 0 };
  const engine = new GatheringEngine({
    environmentStore: {},
    runManager: {},
    evaluator: {},
    resultCreator: {
      plan: async () => {
        calls.planned += 1;
        return [{ itemUuid: 'Item.scrap', quantity: 1, name: 'Scrap' }];
      },
      create: async () => {
        calls.created += 1;
        return [{ itemUuid: 'Item.scrap', quantity: 1 }];
      },
    },
    toolBreakage: { apply: async () => [] },
    failureFeedback: { apply: async () => null },
  });
  // The tool seams are exercised by their own suites; here they must simply not decide
  // the award, so both are neutralised to keep this file's subject unambiguous.
  engine._planTerminalTools = async () => [];
  engine._applyTerminalTools = async () => [];
  engine._resolveTaskTools = () => ({ tools: [] });
  return { engine, calls };
}

async function runBothHalves(system, outcome) {
  const { engine, calls } = makeEngine();
  const args = {
    viewer: { id: 'v1' },
    actor: { id: 'a1', uuid: 'Actor.a1' },
    system,
    environment: ENVIRONMENT,
    task: TASK,
    outcome,
    checkResult: outcome.checkResult,
  };
  const plan = await engine._terminalSideEffectPlan(args);
  await engine._commitTerminalSideEffects(args);
  return { plan, calls };
}

const systemWith = (failureResultPolicy) => ({
  id: 'sys-1',
  gatheringCraftingCheck: { failureResultPolicy },
});

test('a failed gathering outcome awards under a permitting policy, on BOTH halves', async () => {
  for (const policy of ['perRecord', 'always']) {
    const { plan, calls } = await runBothHalves(systemWith(policy), failedOutcome());
    assert.equal(calls.planned, 1, `${policy}: the PLAN half ran`);
    assert.equal(calls.created, 1, `${policy}: the COMMIT half ran`);
    // The plan's `createdResults` is what feeds the run record, the API response and the
    // chat card. An empty list here beside a created item is the reporting hole AF4 names.
    assert.equal(plan.createdResults.length, 1, `${policy}: and the award is REPORTED`);
  }
});

test('`never` awards nothing, and reports nothing, on both halves', async () => {
  const { plan, calls } = await runBothHalves(systemWith('never'), failedOutcome());
  assert.equal(calls.planned, 0);
  assert.equal(calls.created, 0);
  assert.deepEqual(plan.createdResults, []);
});

test('a succeeded outcome is unaffected by the policy, including under `never`', async () => {
  const succeeded = {
    status: 'succeeded',
    resultGroups: [{ id: 'rg', results: [{ componentId: 'herb', quantity: 1 }] }],
    checkResult: { outcome: 'Good', success: true, value: 18, data: {} },
  };
  const { plan, calls } = await runBothHalves(systemWith('never'), succeeded);
  assert.equal(calls.planned, 1, 'the success path never consults the failure-result policy');
  assert.equal(calls.created, 1);
  assert.equal(plan.createdResults.length, 1);
});

test('a `failureOnBreak`-voided attempt does NOT award, even under `always`', async () => {
  // A VOIDED SUCCESS, not an authored failure. The tool-breakage policy flips the status
  // and clears the groups, and under `always` the naive reading would convert "the attempt
  // is void" into "award the failure loot".
  const { engine, calls } = makeEngine();
  engine._planTerminalTools = async () => [{ id: 't1', broken: true }];
  const outcome = {
    status: 'succeeded',
    resultGroups: [{ id: 'rg', results: [{ componentId: 'herb', quantity: 1 }] }],
    checkResult: { success: true, value: 18, data: {} },
  };

  const plan = await engine._terminalSideEffectPlan({
    viewer: { id: 'v1' },
    actor: { id: 'a1', uuid: 'Actor.a1' },
    system: systemWith('always'),
    environment: { ...ENVIRONMENT, toolBreakagePolicy: 'failureOnBreak' },
    task: TASK,
    outcome,
    checkResult: outcome.checkResult,
  });

  assert.equal(outcome.status, 'failed', 'the policy voided the attempt');
  assert.equal(calls.planned, 0, 'and nothing was planned');
  assert.deepEqual(plan.createdResults, []);
});

test('a failed outcome carrying no `failureAward` marker does NOT award — the d100 case', async () => {
  // The d100 resolver's `failureWithEvent` policy returns a FAILED outcome that still
  // carries the matched drop rows (they are what the "nothing found" card reports). A
  // groups-only gate would start awarding them, changing a branch this issue must leave
  // untouched — and d100 outcomes do not pass through `normalizeTerminalOutcome` at all,
  // so they never carry the marker the routed failure seam sets.
  const { plan, calls } = await runBothHalves(
    systemWith('always'),
    failedOutcome({ failureAward: false })
  );
  assert.equal(calls.planned, 0);
  assert.equal(calls.created, 0);
  assert.deepEqual(plan.createdResults, []);
});

test('a failed outcome carrying NO group does not award — the null outcome-name case', async () => {
  // A fixed-tier total outside every authored range resolves to a null outcome name, and
  // the routed seam deliberately carries nothing for it: there is no tier, so there is no
  // authored failure output to select.
  const { plan, calls } = await runBothHalves(
    systemWith('always'),
    failedOutcome({ resultGroups: [] })
  );
  assert.equal(calls.planned, 0);
  assert.equal(calls.created, 0);
  assert.deepEqual(plan.createdResults, []);
});

test('a MISCONFIGURED outcome never participates — ROUTED_TIER_UNROUTED (CF10)', async () => {
  // Its status is `misconfigured`, not `failed`. The stale spec reading — "a succeeding
  // tier matching no group resolves to a terminal failure" — would, under `always`, have
  // turned authoring drift into failure loot.
  const { plan, calls } = await runBothHalves(systemWith('always'), {
    status: 'misconfigured',
    resultGroups: [{ id: 'rg', results: [{ componentId: 'scrap', quantity: 1 }] }],
    checkResult: { outcome: 'Ruined', success: false, value: 3, data: {} },
  });
  assert.equal(calls.planned, 0);
  assert.equal(calls.created, 0);
  assert.deepEqual(plan.createdResults, []);
});

/**
 * ## The zero-award evidence half (issue 1648, TP14-B acceptance 5)
 *
 * The gate above decides whether anything is awarded; this decides how a run that awarded
 * NOTHING says so. An omitted results effect is indistinguishable from evidence that was
 * never captured, so a deliberate zero records an APPLIED EMPTY RECEIPT, and the two
 * shapes that establish neither zero nor awards — an opaque record, and an effect still
 * applying — must stay distinguishable from it. These drive the real engine, run manager
 * and result creator; only Foundry documents and the check/roll inputs are doubled.
 */

const SOURCE_UUID = 'Compendium.fixture.materials.Item.scrap';
const SCRAP = compendiumSourceItem({ uuid: SOURCE_UUID, name: 'Scrap', img: 'icons/scrap.webp' });
const sources = { [SOURCE_UUID]: SCRAP };
const components = [
  { id: 'scrap', name: 'Scrap', img: 'icons/scrap.webp', registeredItemUuid: SOURCE_UUID, difficulty: 1 },
];

/** A routed task whose failure tier ('Ruined') and success tier ('Yield') both award. */
function routedFixture(failureResultPolicy) {
  return gatheringFixture({
    mode: 'routed',
    failureResultPolicy,
    components,
    resultGroups: [
      { id: 'ruined', name: 'Ruined', results: [{ id: 'r-fail', componentId: 'scrap', quantity: 1 }] },
      { id: 'yield', name: 'Yield', results: [{ id: 'r-win', componentId: 'scrap', quantity: 2 }] },
    ],
  });
}

const resultsEffect = (record) =>
  record?.executionJournal?.effects?.find((effect) => effect.effectId === 'results') ?? null;

test('a versioned failed run that awards nothing records an APPLIED EMPTY receipt, not an omission', async () => {
  const versioned = await runRealGatheringAttempt({
    ...routedFixture('never'),
    sources,
    versioned: true,
    rollTotal: 3,
    resolvedCheckResult: resolvedCheck(false, 'Ruined'),
  });

  assert.equal(versioned.error, null);
  assert.equal(versioned.record.status, 'failed');
  assert.equal(versioned.actor.items.length, 0, 'the policy refused the failure award');
  const effect = resultsEffect(versioned.record);
  // The DECISION, not its absence: the effect is present, applied, and its receipt is an
  // explicitly empty list. An omitted effect would read as evidence that was never taken.
  assert.equal(effect.phase, 'applied');
  assert.deepEqual(effect.receipt, []);
  assert.deepEqual(versioned.record.createdResults, []);

  // The legacy contract for the same decision is the settled counterpart.
  const legacy = await runRealGatheringAttempt({ ...routedFixture('never'), sources, rollTotal: 3 });
  assert.equal(legacy.record.status, 'failed');
  assert.equal(legacy.record.historySettlement.awards, 'complete');
  assert.deepEqual(legacy.record.createdResults, []);
});

test('a successful all-miss records the same confirmed zero, and a permitted failure award keeps its receipt', async () => {
  const allMiss = await runRealGatheringAttempt({
    ...gatheringFixture({ components, dropRows: [{ id: 'row-scrap', componentId: 'scrap', quantity: 1, dropRate: 40, enabled: true }] }),
    sources,
    versioned: true,
    rolls: [5],
    resolvedCheckResult: resolvedCheck(true, null),
  });

  assert.equal(allMiss.record.status, 'succeeded', 'a native all-miss still succeeds');
  assert.deepEqual(resultsEffect(allMiss.record).receipt, [], 'nothing dropped, and that is recorded');
  assert.equal(allMiss.actor.items.length, 0);

  const permitted = await runRealGatheringAttempt({
    ...routedFixture('always'),
    sources,
    versioned: true,
    rollTotal: 3,
    resolvedCheckResult: resolvedCheck(false, 'Ruined'),
  });
  assert.equal(permitted.record.status, 'failed');
  assert.deepEqual(
    resultsEffect(permitted.record).receipt.map((entry) => [entry.quantity, entry.resultRowId]),
    [[1, 'ruined:r-fail:0']],
    'a permitted failure award keeps an actual receipt with its row link'
  );
  assert.equal(permitted.actor.items.length, 1);
});

test('an OPAQUE record reports an empty list without claiming zero, while the award really happened', async () => {
  const blind = await runRealGatheringAttempt({
    ...gatheringFixture({
      selectionMode: 'blind',
      components,
      dropRows: [{ id: 'row-scrap', componentId: 'scrap', quantity: 2, dropRate: 90, enabled: true }],
    }),
    sources,
    taskId: null,
    rolls: [50],
  });

  assert.equal(blind.error, null);
  assert.equal(blind.actor.items.length, 1, 'the blind gather really did award an item');
  // Withheld evidence is never encoded as a complete empty: the list is empty because the
  // viewer may not see it, so no settlement state is asserted alongside it.
  assert.deepEqual(blind.record.createdResults, []);
  assert.equal(blind.record.historySettlement, undefined);
  assert.equal(blind.record.resolutionSnapshot, undefined);
});

test('an interrupted results effect stays APPLYING with no receipt, establishing neither zero nor awards', async () => {
  const actor = new GatheringDocumentActor();
  actor.createEmbeddedDocuments = async () => [];

  const stuck = await runRealGatheringAttempt({
    ...routedFixture('always'),
    actor,
    sources,
    versioned: true,
    rollTotal: 18,
    resolvedCheckResult: resolvedCheck(true, 'Yield'),
  });

  assert.equal(stuck.error?.code, 'RECOVERY_REQUIRED');
  const effect = resultsEffect(stuck.record);
  assert.equal(effect.phase, 'applying');
  assert.ok(!Object.hasOwn(effect, 'receipt'), 'an unapplied effect owns no receipt at all');
  assert.deepEqual(effect.planned.map((entry) => entry.quantity), [2], 'the PLAN is not a receipt');
  assert.deepEqual(stuck.record.createdResults, []);
  assert.equal(stuck.publications.length, 0, 'nothing planned is published as actual');
});
