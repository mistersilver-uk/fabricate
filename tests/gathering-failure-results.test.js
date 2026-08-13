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
