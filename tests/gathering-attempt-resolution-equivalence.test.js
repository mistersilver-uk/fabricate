/**
 * Equivalence pin for terminal gathering-attempt resolution (issue 1700) over the unchanged
 * `GatheringEngine`: the 4-mode x 3-entry-path matrix, plus the closing cells the delta names.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { authoredComplication } from './helpers/complicationFixtures.js';
import { gatheringFixture, resolvedCheck, runRealGatheringAttempt } from './helpers/real-gathering-attempt.js';

const SCRAP = { id: 'scrap', name: 'Scrap', difficulty: 1 };
const MATURE_WORLD_TIME = 300;
const START_WORLD_TIME = 100;

/** The one shared fixture factory the 4-mode base matrix drives. */
function modeFixture(mode, { timeRequirement = null } = {}) {
  const resultGroups = [{
    id: mode === 'routed' ? 'yield' : 'group-a',
    name: mode === 'routed' ? 'Yield' : 'Ore',
    results: [{ id: 'r-win', componentId: 'scrap', quantity: 2 }],
  }];
  const dropRows =
    mode === 'd100' ? [{ id: 'row-scrap', componentId: 'scrap', quantity: 1, dropRate: 100, enabled: true }] : [];
  const fixture = gatheringFixture({
    mode, components: [SCRAP], resultGroups, dropRows, timeRequirement, chatOutput: true,
  });
  if (mode === 'progressive') {
    fixture.system.gatheringCraftingCheck.progressive = { rollFormula: '1d20', awardMode: 'equal' };
  }
  return fixture;
}

/** A resolved check for a versioned matured routed/progressive cell; d100/straight need none. */
function checkFor(mode) {
  if (mode === 'routed') return resolvedCheck(true, 'Yield');
  if (mode === 'progressive') return resolvedCheck(true, null);
  return null;
}

/** The write call the entry path actually made: `createTerminalRun` immediate, `completeRun` matured. */
function writeCallFor(result, matured) {
  return matured ? result.runManagerCalls.completeRun[0] : result.runManagerCalls.createTerminalRun[0];
}

const ENTRIES = ['immediate-legacy', 'matured-legacy', 'matured-versioned'];

for (const mode of ['straight', 'd100', 'progressive', 'routed']) {
  for (const entry of ENTRIES) {
    const matured = entry !== 'immediate-legacy';
    const versioned = entry === 'matured-versioned';

    test(`${mode} x ${entry}: terminal resolution matches the unchanged engine`, async () => {
      const fixture = modeFixture(mode, { timeRequirement: matured ? { minutes: 1 } : null });
      const result = await runRealGatheringAttempt({
        ...fixture,
        versioned,
        worldTime: START_WORLD_TIME,
        matureWorldTime: matured ? MATURE_WORLD_TIME : null,
        resolvedCheckResult: versioned ? checkFor(mode) : null,
      });

      assert.equal(result.error, null);
      const terminal = matured ? (versioned ? result.maturedResult : result.maturedResult?.completed?.[0]) : result.response;
      assert.equal(terminal.state, 'succeeded');
      assert.equal(result.record.status, 'succeeded');

      const writeCall = writeCallFor(result, matured);
      assert.ok(writeCall, 'the terminal write was observed with its real arguments');
      assert.equal(writeCall.status, 'succeeded');
      // The versioned record's own `createdResults` field stays the pending snapshot forever —
      // the real evidence is the response (and its `run`, `mergeRunEconomyEvidence`'d for display).
      const createdResults = versioned ? result.maturedResult.createdResults : result.record.createdResults;
      assert.deepEqual(createdResults.map((entry) => entry.componentId), ['scrap']);

      assert.equal(result.chat.length, 1, 'one chat card per terminal attempt');
      assert.equal(result.chat[0].speaker.actor, result.actor.id);
      assert.ok(result.chat[0].content.length > 0);

      assert.ok(result.stageJournal.some((step) => step.stage === 'respond'));

      if (versioned) {
        // The stage-9 early return only applies when `writeTerminalHistory` answers a response;
        // a wrong refactor that hoists, drops or reorders an effect changes this array.
        assert.deepEqual(
          result.record.executionJournal.effects.map((effect) => effect.effectId),
          ['economy', 'results', 'complications', 'tools', 'events', 'reservation', 'presentation']
        );
        assert.equal(result.record.executionJournal.status, 'committed');
      }
    });
  }
}

// Closing cells, each written against a named wrong refactor.

/** A routed task with one tool, wired to a caller-controlled breakage plan/apply. */
function toolFixture({ timeRequirement = null } = {}) {
  const fixture = gatheringFixture({
    mode: 'routed', components: [SCRAP], timeRequirement,
    resultGroups: [{ id: 'yield', name: 'Yield', results: [{ id: 'r-win', componentId: 'scrap', quantity: 2 }] }],
  });
  fixture.task.tools = [{ componentId: 'tool-axe', breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } }];
  return fixture;
}

const BREAKING_TOOL_BREAKAGE = {
  plan: async ({ tools }) => tools.map((tool) => ({ componentId: tool.componentId, broken: true })),
  apply: async ({ tools }) => tools.map((tool) => ({ componentId: tool.componentId, broken: true })),
};

for (const entry of ENTRIES) {
  const matured = entry !== 'immediate-legacy';
  const versioned = entry === 'matured-versioned';

  // Wrong refactor this fails: stage 5 (`planSideEffects`) copying `outcome` instead of mutating
  // it in place, which would let a voided success reach stages 6-9 and award the loot anyway.
  test(`failureOnBreak (${entry}): a broken tool voids the award, in the write call and the record`, async () => {
    const fixture = toolFixture({ timeRequirement: matured ? { minutes: 1 } : null });
    const result = await runRealGatheringAttempt({
      ...fixture, toolBreakage: BREAKING_TOOL_BREAKAGE, versioned,
      worldTime: START_WORLD_TIME, matureWorldTime: matured ? MATURE_WORLD_TIME : null,
      resolvedCheckResult: versioned ? checkFor('routed') : null,
    });

    assert.equal(result.error, null);
    const writeCall = writeCallFor(result, matured);
    assert.equal(writeCall.status, 'failed');
    assert.deepEqual(writeCall.payload.createdResults, []);
    assert.equal(result.record.status, 'failed');
    assert.deepEqual(result.record.createdResults, []);

    if (versioned) {
      // No 'complications' effect (the award gate it sits behind is closed), and 'failure' takes
      // its usual place: the same order pin as the successful matrix cell, on the failed branch.
      assert.deepEqual(
        result.record.executionJournal.effects.map((effect) => effect.effectId),
        ['economy', 'results', 'tools', 'failure', 'events', 'reservation', 'presentation']
      );
    }
  });
}

// Wrong refactor this fails: releasing the blind reservation before the commit write, or after
// respond — `_processMaturedWaitingRun`'s legacy commit releases it strictly between the two.
test('matured legacy: reservation-released sits between the commit write and respond', async () => {
  const fixture = modeFixture('routed', { timeRequirement: { minutes: 1 } });
  const result = await runRealGatheringAttempt({
    ...fixture, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME,
  });

  assert.equal(result.error, null);
  const stages = result.stageJournal.map((step) => step.stage);
  const commitIndex = stages.lastIndexOf('settleHistory');
  const releaseIndex = stages.indexOf('reservation-released');
  const respondIndex = stages.indexOf('respond');
  assert.ok(commitIndex >= 0 && releaseIndex > commitIndex && respondIndex > releaseIndex, stages.join(' -> '));
});

// Wrong refactor this fails: stage 3b (the `createTerminalRun` precheck) running after stage 5
// (`planSideEffects`) rather than outranking it — a `plan`/`planTools` collaborator that ran despite
// no run manager would spend side effects the refusal is supposed to prevent.
test('immediate: plan and planTools never run, and the run-creation refusal carries its own code, when createTerminalRun is absent', async () => {
  let planCalls = 0;
  const fixture = toolFixture();
  const toolBreakage = { plan: async () => { planCalls += 1; return []; }, apply: async () => [] };
  const result = await runRealGatheringAttempt({
    ...fixture, toolBreakage, rollTotal: 18,
    beforeStart: ({ runManager }) => { runManager.createTerminalRun = undefined; },
  });

  assert.equal(result.error, null);
  assert.equal(planCalls, 0, 'the tool-breakage plan never ran');
  assert.equal(result.response.blockedReasons[0].code, 'RUN_CREATION_FAILED');
  assert.equal(result.response.blockedReasons[0].data.code, 'MISSING_RUN_MANAGER');
});

// Wrong refactor this fails: dropping the `initiatedBy === 'timed' && !isPrimaryGM` guard on the
// completion hook, which would double-publish the documented integration hook on every client.
test('matured legacy on a non-primary GM: the completion hook is suppressed, the chat card is not', async () => {
  const fixture = modeFixture('routed', { timeRequirement: { minutes: 1 } });
  const result = await runRealGatheringAttempt({
    ...fixture, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME, isPrimaryGM: () => false,
  });

  assert.equal(result.error, null);
  assert.equal(result.publications.length, 0);
  assert.equal(result.chat.length, 1);
});

// Wrong refactor this fails: moving `executeVersionedStage`'s own missing-reference check so
// `_processMaturedWaitingRun` is reached first. That refusal is also the proof that
// `_processMaturedWaitingRun`'s own versioned missing-reference branch is dead code: its only
// versioned caller is `executeVersionedStage`, always after this same check, so no caller can
// ever reach that branch with an already-missing reference. It cannot be driven to fail on its
// own terms; this cell is the closest proof the engine, as it stands, admits.
test('executeVersionedStage refuses a missing reference before delegating to maturity', async () => {
  const fixture = modeFixture('routed', { timeRequirement: { minutes: 1 } });
  const result = await runRealGatheringAttempt({
    ...fixture, versioned: true, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME,
    resolvedCheckResult: checkFor('routed'),
    beforeMature: () => { fixture.environment.id = 'renamed-environment'; },
  });

  assert.equal(result.error, null);
  assert.equal(result.maturedResult.blockedReasons[0].code, 'MISSING_REFERENCE');
  assert.equal(result.maturedResult.blockedReasons[0].data.reference, 'environment');
  // No 'respond' marker: the cancel path never reaches `_terminalStart`.
  assert.ok(!result.stageJournal.some((step) => step.stage === 'respond'));
});

// Persist-failure policy: the same falsy `completeRun`/`createTerminalRun` return is handled
// three different, deliberately disagreeing, ways per path. Wrong refactor this fails: unifying
// them into one shared refusal, which is exactly the deviation the delta rejects (DE-H1).
test('persist failure: matured legacy collects the throw into processWorldTime errors', async () => {
  const fixture = modeFixture('routed', { timeRequirement: { minutes: 1 } });
  const result = await runRealGatheringAttempt({
    ...fixture, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME,
    beforeMature: ({ runManager }) => {
      const original = runManager.completeRun.bind(runManager);
      runManager.completeRun = async (...args) => { await original(...args); return null; };
    },
  });

  assert.equal(result.error, null);
  assert.equal(result.maturedResult.completed.length, 0);
  assert.equal(result.maturedResult.errors[0].code, 'TERMINAL_HISTORY_NOT_WRITTEN');
  // The throw fires after `completeRun` persisted, so history exists but was never settled —
  // `_commitLegacyTerminal` (the commit that awards and settles it) never ran.
  assert.equal(result.record.historySettlement.awards, 'pending');
  assert.deepEqual(result.record.createdResults, []);
});

test('persist failure: matured versioned throws TERMINAL_HISTORY_NOT_WRITTEN', async () => {
  const fixture = modeFixture('routed', { timeRequirement: { minutes: 1 } });
  const result = await runRealGatheringAttempt({
    ...fixture, versioned: true, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME,
    resolvedCheckResult: checkFor('routed'),
    beforeMature: ({ runManager }) => {
      const original = runManager.completeRun.bind(runManager);
      runManager.completeRun = async (...args) => { await original(...args); return null; };
    },
  });

  assert.equal(result.error.code, 'TERMINAL_HISTORY_NOT_WRITTEN');
});

test('persist failure: immediate passes a null run through, unguarded, rather than refusing', async () => {
  const fixture = modeFixture('routed');
  const result = await runRealGatheringAttempt({
    ...fixture, rollTotal: 18,
    beforeStart: ({ runManager }) => { runManager.createTerminalRun = async () => null; },
  });

  // No RUN_CREATION_FAILED refusal — a null run crashes the downstream commit instead, which is
  // the "unguarded" half of the claim: `_resolveImmediateAttempt` only refuses on a thrown error.
  assert.equal(result.response, null);
  assert.notEqual(result.error, null);
  assert.equal(result.error.code, undefined);
});

// Ungated refusals: `blockedReasons[0].code` is `TASK_MISCONFIGURED`/`RUN_CREATION_FAILED` on every
// one of these and on `startAttempt`'s own preflight, so `.data` is the only thing that tells them
// apart. Wrong refactor this fails: a `refuse` that stops threading the inner outcome/plan code
// through to `.data`.

test('matured plan-misconfigured, legacy arm: an unresolvable result component clears with its own diagnostic', async () => {
  const fixture = gatheringFixture({
    mode: 'routed', components: [], timeRequirement: { minutes: 1 },
    resultGroups: [{ id: 'yield', name: 'Yield', results: [{ id: 'r', componentId: 'ghost', quantity: 1 }] }],
  });
  const result = await runRealGatheringAttempt({
    ...fixture, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME,
  });

  assert.equal(result.error, null);
  const cleared = result.maturedResult.cleared[0];
  assert.equal(cleared.blockedReasons[0].data.code, 'RESULT_PLAN_DIAGNOSTIC');
});

test('matured plan-misconfigured, versioned arm: the same diagnostic, cleared through the versioned cleanup', async () => {
  const fixture = gatheringFixture({
    mode: 'routed', components: [], timeRequirement: { minutes: 1 },
    resultGroups: [{ id: 'yield', name: 'Yield', results: [{ id: 'r', componentId: 'ghost', quantity: 1 }] }],
  });
  const result = await runRealGatheringAttempt({
    ...fixture, versioned: true, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME,
    resolvedCheckResult: checkFor('routed'),
  });

  assert.equal(result.error, null);
  assert.equal(result.maturedResult.state, 'cleared');
  assert.equal(result.maturedResult.blockedReasons[0].data.code, 'RESULT_PLAN_DIAGNOSTIC');
});

test('matured outcome-misconfigured, versioned: an unroutable success tier clears with ROUTED_TIER_UNROUTED', async () => {
  const fixture = gatheringFixture({
    mode: 'routed', components: [SCRAP], timeRequirement: { minutes: 1 },
    resultGroups: [{ id: 'g', name: 'Copper', results: [{ id: 'r', componentId: 'scrap', quantity: 1 }] }],
  });
  const result = await runRealGatheringAttempt({
    ...fixture, versioned: true, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME,
    resolvedCheckResult: checkFor('routed'),
  });

  assert.equal(result.error, null);
  assert.equal(result.maturedResult.blockedReasons[0].data.code, 'ROUTED_TIER_UNROUTED');
});

test('immediate outcome-misconfigured: an unroutable success tier blocks with ROUTED_TIER_UNROUTED', async () => {
  const fixture = gatheringFixture({
    mode: 'routed', components: [SCRAP],
    resultGroups: [{ id: 'g', name: 'Copper', results: [{ id: 'r', componentId: 'scrap', quantity: 1 }] }],
  });
  const result = await runRealGatheringAttempt({ ...fixture, rollTotal: 18 });

  assert.equal(result.error, null);
  assert.equal(result.response.blockedReasons[0].data.code, 'ROUTED_TIER_UNROUTED');
});

test('immediate plan-misconfigured: an unresolvable result component blocks with RESULT_PLAN_DIAGNOSTIC', async () => {
  const fixture = gatheringFixture({
    mode: 'routed', components: [],
    resultGroups: [{ id: 'yield', name: 'Yield', results: [{ id: 'r', componentId: 'ghost', quantity: 1 }] }],
  });
  const result = await runRealGatheringAttempt({ ...fixture, rollTotal: 18 });

  assert.equal(result.error, null);
  assert.equal(result.response.blockedReasons[0].data.code, 'RESULT_PLAN_DIAGNOSTIC');
});

test('propagated error.code (immediate persist failure): a throwing createTerminalRun surfaces its own code under RUN_CREATION_FAILED', async () => {
  const fixture = modeFixture('routed');
  const result = await runRealGatheringAttempt({
    ...fixture, rollTotal: 18,
    beforeStart: ({ runManager }) => {
      runManager.createTerminalRun = async () => {
        const failure = new Error('write exploded');
        failure.code = 'WRITE_EXPLODED';
        throw failure;
      };
    },
  });

  assert.equal(result.error, null);
  assert.equal(result.response.blockedReasons[0].code, 'RUN_CREATION_FAILED');
  assert.equal(result.response.blockedReasons[0].data.code, 'WRITE_EXPLODED');
});

// Component complications: two call sites (`commit`, the immediate/matured-legacy path; and
// `writeTerminalHistory`, the matured-versioned path), and the resolution-modes requirement that
// the unit is the result entry, never the component — two rows naming the same component must
// fire independently. Together the two cells below cover all five stage buckets
// (`src/utils/complicationPlan.js`): full, halted, skipped and unreached here; full, partial and
// unreached in the writeTerminalHistory cell. Wrong refactor either fails: deduplicating on
// componentId, or reading `outcome.resultGroups` (the awarded-only subset) instead of the task's
// full authored group for the stage list.

test('progressive complications via commit: full, halted, skipped, unreached, and one component fired twice', async () => {
  const compA = {
    id: 'comp-a', name: 'A', difficulty: 3,
    complications: [authoredComplication({ id: 'ca', when: { stageAwarded: true }, activity: 'gathering' })],
  };
  const compB = {
    id: 'comp-b', name: 'B', difficulty: 2,
    // On the halted component, never the awarded one — this only fires if the stage list is
    // built from the task's full authored group, not `outcome.resultGroups` (awarded-only).
    complications: [authoredComplication({ id: 'cb', when: { stageMissed: true }, activity: 'gathering' })],
  };
  const compC = { id: 'comp-c', name: 'C', difficulty: 0 };
  const compD = { id: 'comp-d', name: 'D', difficulty: 1 };
  const results = [
    { id: 'a1', componentId: 'comp-a', quantity: 1 },
    { id: 'a2', componentId: 'comp-a', quantity: 1 },
    { id: 'b1', componentId: 'comp-b', quantity: 1 },
    { id: 'c1', componentId: 'comp-c', quantity: 1 },
    { id: 'd1', componentId: 'comp-d', quantity: 1 },
  ];
  const fixture = gatheringFixture({
    mode: 'progressive', components: [compA, compB, compC, compD],
    resultGroups: [{ id: 'group-a', name: 'Ore', results }],
  });
  fixture.system.gatheringCraftingCheck.progressive = { rollFormula: '1d20', awardMode: 'equal' };

  const result = await runRealGatheringAttempt({ ...fixture, rollTotal: 6 });

  assert.equal(result.error, null);
  assert.deepEqual(result.record.checkResult.resolutionMeta, {
    awardedResultIds: ['a1', 'a2'], remaining: 0, partialResultId: null, haltedResultId: 'b1', skippedResultIds: ['c1'],
  });
  assert.deepEqual(
    result.response.complications.map((entry) => [entry.resultId, entry.componentId, entry.buckets[0]]),
    [['a1', 'comp-a', 'full'], ['a2', 'comp-a', 'full'], ['b1', 'comp-b', 'halted']],
    'the same component fires once per result entry, and the halted stage still fires its own'
  );
});

test('progressive complications via writeTerminalHistory: full, partial, unreached, and one component fired twice', async () => {
  const compF = {
    id: 'comp-f', name: 'F', difficulty: 3,
    complications: [
      authoredComplication({ id: 'cf-full', when: { stageAwarded: true }, activity: 'gathering' }),
      authoredComplication({ id: 'cf-partial', when: { stagePartial: true }, activity: 'gathering' }),
    ],
  };
  const compG = {
    id: 'comp-g', name: 'G', difficulty: 2,
    // On the unreached component — only reachable if the stage list is built from the task's
    // full authored group, not `outcome.resultGroups` (awarded-only, which never includes it).
    complications: [authoredComplication({ id: 'cg', when: { stageMissed: true }, activity: 'gathering' })],
  };
  const results = [
    { id: 'f1', componentId: 'comp-f', quantity: 1 },
    { id: 'f2', componentId: 'comp-f', quantity: 1 },
    { id: 'g1', componentId: 'comp-g', quantity: 1 },
  ];
  const fixture = gatheringFixture({
    mode: 'progressive', components: [compF, compG], timeRequirement: { minutes: 1 },
    resultGroups: [{ id: 'group-f', name: 'Ore', results }],
  });
  fixture.system.gatheringCraftingCheck.progressive = { rollFormula: '1d20', awardMode: 'partial' };

  const result = await runRealGatheringAttempt({
    ...fixture, versioned: true, worldTime: START_WORLD_TIME, matureWorldTime: MATURE_WORLD_TIME,
    resolvedCheckResult: { success: true, status: 'success', outcome: null, value: 5, data: { total: 5, formula: '1d20' } },
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.record.checkResult.resolutionMeta, {
    awardedResultIds: ['f1', 'f2'], remaining: 0, partialResultId: 'f2', haltedResultId: null, skippedResultIds: [],
  });
  assert.deepEqual(
    result.maturedResult.complications.map((entry) => [entry.resultId, entry.componentId, entry.buckets[0]]),
    [['f1', 'comp-f', 'full'], ['f2', 'comp-f', 'partial'], ['g1', 'comp-g', 'unreached']],
    'the same component fires full and partial per entry, and the unreached stage still fires its own'
  );
});
