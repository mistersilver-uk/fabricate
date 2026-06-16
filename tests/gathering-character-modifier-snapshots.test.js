import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRichState, makeEngine, makeFakeActor, environment, DEFAULT_TEST_SYSTEM } from './helpers/gathering.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';

function configFor({ entries = [], tasks = [], events = [] } = {}) {
  return {
    systems: {
      'system-test': {
        rules: { rewardSelectionMode: 'allDrops', eventSelectionMode: 'allDrops' },
        characterModifiers: entries,
        tasks,
        events
      }
    }
  };
}

const STR_LIB = [{ id: 'strength', label: 'Strength', icon: 'fa-solid fa-dumbbell', expression: '@abilities.str.mod' }];

function envWithLibrary(service, { events = [] } = {}) {
  const composed = service.composeEnvironment({
    id: 'env-test',
    craftingSystemId: 'system-test',
    tasks: []
  }, { id: 'system-test' });
  if (events.length > 0) composed.events = events;
  composed.rules = { rewardSelectionMode: 'allDrops', eventSelectionMode: 'allDrops', rewardLimit: 99, eventLimit: 99, eventPolicy: 'successWithEvent' };
  return composed;
}

test('terminal run records characterModifierSnapshot evidence per row and event', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIB }),
    rolls: [100, 100],
    evaluateExpression: () => 3
  });
  const env = envWithLibrary(service, {
    events: [{ id: 'h1', name: 'Trap', dropRate: 50, characterModifiers: [{ id: 'rh', modifierId: 'strength', operator: '-' }] }]
  });
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 50, characterModifiers: [{ id: 'rd', modifierId: 'strength', operator: '+' }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  assert.ok(result.characterModifierSnapshot, 'snapshot returned');
  assert.equal(result.characterModifierSnapshot.rows.length, 1);
  assert.equal(result.characterModifierSnapshot.events.length, 1);
  const rowEvidence = result.characterModifierSnapshot.rows[0].contributions[0];
  assert.equal(rowEvidence.modifierId, 'strength');
  assert.equal(rowEvidence.contribution, 3);
  const hazEvidence = result.characterModifierSnapshot.events[0].contributions[0];
  assert.equal(hazEvidence.contribution, -3);
});

test('dice term rolled total is captured in evidence', async () => {
  let evaluatedExpression;
  const { service } = makeRichState({
    config: configFor({ entries: [{ id: 'roll-d6', label: 'Roll d6', expression: '1d6 + @abilities.str.mod' }] }),
    rolls: [100],
    evaluateExpression: ({ expression }) => { evaluatedExpression = expression; return 7; }
  });
  const env = envWithLibrary(service);
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 50, characterModifiers: [{ id: 'r', modifierId: 'roll-d6', operator: '+' }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(evaluatedExpression, '1d6 + @abilities.str.mod');
  const evidence = result.characterModifierSnapshot.rows[0].contributions[0];
  assert.equal(evidence.rawValue, 7);
  assert.equal(evidence.contribution, 7);
});

test('replay invariance: terminal payload is snapshot-driven not library-driven', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIB }),
    rolls: [100],
    evaluateExpression: () => 5
  });
  const env = envWithLibrary(service);
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 50, characterModifiers: [{ id: 'r', modifierId: 'strength', operator: '+' }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  const snapshot = result.characterModifierSnapshot;
  // Mutating after the fact does not affect captured snapshot
  snapshot.rows[0].contributions[0].contribution = 999;
  // resolve a new attempt; underlying library is unchanged so still resolves to +5
  const second = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd2', componentId: 'herb', quantity: 1, dropRate: 50, characterModifiers: [{ id: 'r', modifierId: 'strength', operator: '+' }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(second.characterModifierSnapshot.rows[0].contributions[0].contribution, 5);
});

test('GatheringRunManager preserves characterModifierSnapshot on terminal runs', async () => {
  const actor = makeFakeActor();
  const manager = new GatheringRunManager({ randomID: () => 'run-1', nowWorldTime: () => 100, getUserId: () => 'u' });
  const run = await manager.createTerminalRun(
    actor,
    { craftingSystemId: 'system-test', environmentId: 'env-test', taskId: 'task-1' },
    'succeeded',
    {
      createdResults: [],
      characterModifierSnapshot: {
        rows: [{ rowId: 'd1', contributions: [{ contribution: 5, modifierId: 'strength' }] }],
        events: []
      }
    }
  );
  assert.ok(run.characterModifierSnapshot);
  assert.equal(run.characterModifierSnapshot.rows[0].contributions[0].contribution, 5);
  const history = manager.getRunHistory(actor);
  assert.equal(history[0].characterModifierSnapshot.rows[0].rowId, 'd1');
});

test('commitAcceptedAttempt records snapshot in evidence', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIB }),
    rolls: [100],
    evaluateExpression: () => 4
  });
  const actor = makeFakeActor();
  const env = envWithLibrary(service);
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 50, characterModifiers: [{ id: 'r', modifierId: 'strength', operator: '+' }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  const evidence = await service.commitAcceptedAttempt({
    actor,
    system: DEFAULT_TEST_SYSTEM,
    environment: { id: 'env-test', craftingSystemId: 'system-test', conditions: {} },
    task: { id: 't' },
    outcome: result
  });
  assert.ok(evidence.characterModifierSnapshot);
  assert.equal(evidence.characterModifierSnapshot.rows[0].contributions[0].contribution, 4);
});
