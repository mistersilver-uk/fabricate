/**
 * One accepted gathering attempt spends its stamina cost once, at its start commit (issue 3034),
 * through the real engine and rich state for every lifecycle that commits more than once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GatheringBlindRunStore } from '../src/systems/GatheringBlindRunStore.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';

import {
  GatheringDocumentActor,
  gatheringFixture,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';

const SYSTEM_ID = 'system-fixture';
const COST = 2;
const MAX = 8;
const STAMINA_LINE =
  /FABRICATE\.Chat\.GatherStamina: <span class="fabricate-gather-chat__stat-value">(\d+)<\/span>/;

/** A d100 task costing {@link COST} stamina from a seeded {@link MAX} pool, with chat output on. */
function staminaFixture({ timeRequirement = null, selectionMode = 'targeted', dropRow = {} } = {}) {
  const fixture = gatheringFixture({
    mode: 'd100',
    components: [{ id: 'scrap', name: 'Scrap', difficulty: 1 }],
    dropRows: [
      { id: 'row-a', componentId: 'scrap', quantity: 1, dropRate: 100, enabled: true, ...dropRow },
    ],
    timeRequirement,
    selectionMode,
    chatOutput: true,
  });
  fixture.task.staminaCost = COST;
  return selectionMode === 'blind' ? { ...fixture, taskId: null } : fixture;
}

/** Run one attempt with the stamina economy on, recording every stamina and commit hook. */
async function attempt(
  fixture,
  {
    current = MAX,
    settings = {},
    beforeStart,
    richStateMethods = ['evaluateStart'],
    ...options
  } = {}
) {
  const hooks = [];
  const config = {
    systems: { [SYSTEM_ID]: { economy: { stamina: { enabled: true } }, ...settings } },
  };
  const blindSettings = new Map();
  const result = await runRealGatheringAttempt({
    ...fixture,
    rolls: [1, 1, 1, 1],
    worldTime: 100,
    richStateOptions: {
      getSetting: () => config,
      hooks: {
        callAll: (name, payload) => {
          hooks.push({ name, payload: structuredClone(payload) });
        },
      },
      evaluateExpression: async () => 1,
    },
    richStateMethods,
    beforeStart: async ({ engine, runManager }) => {
      engine.blindRunStore = new GatheringBlindRunStore({
        getSetting: (key) => blindSettings.get(key),
        setSetting: async (key, value) => blindSettings.set(key, value),
        settingKey: 'blindRuns',
      });
      await beforeStart?.({ engine, runManager });
    },
    actor: seededActor(current),
    ...options,
  });
  const adjusted = hooks.filter(({ name }) => name === 'fabricate.gathering.staminaAdjusted');
  return {
    ...result,
    hooks,
    adjusted,
    stamina: result.actor.getFlag('fabricate', 'gatheringState').stamina[SYSTEM_ID].current,
    cardStamina: result.chat.map((message) => STAMINA_LINE.exec(message.content)?.[1] ?? null),
  };
}

function seededActor(current) {
  const actor = new GatheringDocumentActor('Gatherer', { ownerIds: ['user-gathering'] });
  actor._flags = {
    fabricate: { gatheringState: { stamina: { [SYSTEM_ID]: { current, max: MAX } } } },
  };
  return actor;
}

/** The terminal journal's economy receipt: what the terminal commit recorded for the run. */
function terminalEconomyReceipt(record) {
  return record.executionJournal.effects.find((effect) => effect.effectId === 'economy').receipt;
}

function assertSpentOnce(result, label) {
  assert.equal(result.error, null, `${label}: ${JSON.stringify(result.error)}`);
  assert.equal(result.record?.status, 'succeeded', `${label}: the attempt completed`);
  assert.equal(result.stamina, MAX - COST, `${label}: one attempt spends its cost once`);
  assert.deepEqual(
    result.adjusted.map(({ payload }) => payload.stamina.current),
    [MAX - COST],
    `${label}: one staminaAdjusted event`
  );
  assert.deepEqual(result.cardStamina, [String(COST)], `${label}: the card reports the one spend`);
}

const VERSIONED_LIFECYCLES = {
  'a ready run started then executed': { fixture: staminaFixture() },
  'a timed run started then matured': {
    fixture: staminaFixture({ timeRequirement: { minutes: 1 } }),
    matureWorldTime: 300,
  },
  'a blind run started then executed': { fixture: staminaFixture({ selectionMode: 'blind' }) },
  'a blind timed run started then matured': {
    fixture: staminaFixture({ selectionMode: 'blind', timeRequirement: { minutes: 1 } }),
    matureWorldTime: 300,
  },
};

for (const [label, { fixture, matureWorldTime = null }] of Object.entries(VERSIONED_LIFECYCLES)) {
  test(`${label} spends its stamina once and keeps the start commit's evidence`, async () => {
    const result = await attempt(fixture, { versioned: true, matureWorldTime });

    assertSpentOnce(result, label);
    assert.deepEqual(
      terminalEconomyReceipt(result.record).stamina ?? null,
      fixture.taskId === null ? null : { spent: COST, base: COST },
      'the terminal commit keeps the start spend, not a second one'
    );
    const commits = result.hooks.filter(
      ({ name }) => name === 'fabricate.gathering.richAttemptCommitted'
    );
    assert.equal(commits.length, 2, 'both commits still announce themselves');
  });
}

test('a run whose task references a library character modifier spends its stamina once', async () => {
  const fixture = staminaFixture({
    dropRow: { characterModifiers: [{ id: 'ref-1', modifierId: 'str', operator: '+' }] },
  });
  const libraryTask = fixture.environment.tasks[0];
  fixture.environment.compositionMode = 'automatic';
  fixture.environment.tasks = [];
  fixture.system.modifiers = [{ id: 'str', label: 'Strength', expression: '@str' }];

  const result = await attempt(fixture, {
    versioned: true,
    settings: { tasks: [libraryTask] },
    richStateMethods: ['evaluateStart', 'composeEnvironment'],
  });

  assertSpentOnce(result, 'modifier reference');
});

test('a legacy single-commit attempt spends its stamina once and records it', async () => {
  const result = await attempt(staminaFixture(), { versioned: false });

  assertSpentOnce(result, 'legacy immediate');
  assert.deepEqual(result.record.economyEvidence.stamina, { spent: COST, base: COST });
});

test('a legacy timed run spends its stamina at start only and records that spend', async () => {
  const result = await attempt(staminaFixture({ timeRequirement: { minutes: 1 } }), {
    versioned: false,
    matureWorldTime: 300,
  });

  assertSpentOnce(result, 'legacy timed');
  assert.deepEqual(result.record.economyEvidence.stamina, { spent: COST, base: COST });
});

test('a run already charged at start before the fix spends nothing at its terminal commit', async () => {
  let atMaturity = null;
  const result = await attempt(staminaFixture({ timeRequirement: { minutes: 1 } }), {
    versioned: true,
    matureWorldTime: 300,
    beforeMature: ({ actor, runManager }) => {
      // The persisted shape 1.14.4 and 1.14.5 left: the start receipt records the spend.
      const [run] = runManager.getActiveRuns(actor);
      atMaturity = {
        stamina: actor.getFlag('fabricate', 'gatheringState').stamina[SYSTEM_ID].current,
        receipt: run.executionJournal.effects.find((effect) => effect.effectId === 'economy')
          .receipt.stamina,
      };
    },
  });

  assert.deepEqual(atMaturity, { stamina: MAX - COST, receipt: { spent: COST, base: COST } });
  assertSpentOnce(result, 'in-flight run');
});

test('a start refused for want of stamina spends none', async () => {
  const result = await attempt(staminaFixture(), { versioned: true, current: 1 });

  assert.equal(result.response?.accepted, false);
  assert.ok(
    result.response.blockedReasons.some((reason) => reason.code === 'STAMINA_BLOCKED'),
    JSON.stringify(result.response.blockedReasons)
  );
  assert.equal(result.stamina, 1);
  assert.deepEqual(result.adjusted, []);
});

/** The rich-state guard alone: a commit carrying its run's start record spends nothing. */
async function commitWith(startCommit, { commits = 1 } = {}) {
  const adjusted = [];
  const service = new GatheringRichStateService({
    getSetting: () => ({ systems: { [SYSTEM_ID]: { economy: { stamina: { enabled: true } } } } }),
    hooks: {
      callAll: (name) => {
        if (name === 'fabricate.gathering.staminaAdjusted') adjusted.push(name);
      },
    },
  });
  const actor = seededActor(MAX);
  const evidence = [];
  for (let index = 0; index < commits; index += 1) {
    evidence.push(
      await service.commitAcceptedAttempt({
        actor,
        system: { id: SYSTEM_ID },
        environment: { id: 'env', craftingSystemId: SYSTEM_ID },
        task: { id: 'task', staminaCost: COST },
        outcome: { status: 'succeeded' },
        phase: 'immediate',
        startCommit,
      })
    );
  }
  const { current } = actor.getFlag('fabricate', 'gatheringState').stamina[SYSTEM_ID];
  return { current, adjusted: adjusted.length, stamina: evidence.map((entry) => entry.stamina) };
}

test('commitAcceptedAttempt spends once for a first commit and records the spend', async () => {
  assert.deepEqual(await commitWith(null), {
    current: MAX - COST,
    adjusted: 1,
    stamina: [{ spent: COST, base: COST }],
  });
});

test('commitAcceptedAttempt keeps a start record and spends nothing, however often replayed', async () => {
  const recorded = { spent: 3, base: COST };
  assert.deepEqual(await commitWith({ stamina: recorded }, { commits: 2 }), {
    current: MAX,
    adjusted: 0,
    stamina: [recorded, recorded],
  });
  assert.deepEqual(await commitWith({ stamina: null }), {
    current: MAX,
    adjusted: 0,
    stamina: [null],
  });
});

test('commitAcceptedAttempt reports the cost for a run that kept no start record', async () => {
  assert.deepEqual(await commitWith({}), {
    current: MAX,
    adjusted: 0,
    stamina: [{ spent: COST, base: COST }],
  });
});
