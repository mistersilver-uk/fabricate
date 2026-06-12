import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRichState, makeEngine, makeFakeActor, environment } from './helpers/gathering.js';

function configFor({ entries = [], events = [] } = {}) {
  return {
    systems: {
      'system-test': {
        rules: { rewardSelectionMode: 'allDrops', eventSelectionMode: 'allDrops' },
        characterModifiers: entries,
        events
      }
    }
  };
}

function environmentWithLibrary(service) {
  const composed = service.composeEnvironment({
    id: 'env-test',
    craftingSystemId: 'system-test',
    tasks: []
  }, { id: 'system-test' });
  composed.rules = { rewardSelectionMode: 'allDrops', eventSelectionMode: 'allDrops', rewardLimit: 99, eventLimit: 99, eventPolicy: 'successWithEvent' };
  return composed;
}

test('missing library modifier aborts attempt with diagnostic', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: [] }),
    rolls: [100],
    evaluateExpression: () => 0
  });
  const env = environmentWithLibrary(service);
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 30, characterModifiers: [{ id: 'r', modifierId: 'gone', operator: '+' }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(result.status, 'misconfigured');
  assert.equal(result.items.length, 0);
  assert.equal(result.events.length, 0);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, 'MISSING_CHARACTER_MODIFIER');
  assert.equal(result.diagnostics[0].modifierId, 'gone');
});

test('min > max aborts attempt with diagnostic', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: [{ id: 'str', provider: 'dnd5e', label: 'Strength', expression: '@s' }] }),
    rolls: [100],
    evaluateExpression: () => 1
  });
  const env = environmentWithLibrary(service);
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 30, characterModifiers: [{ id: 'r', modifierId: 'str', operator: '+', min: 5, max: 0 }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(result.status, 'misconfigured');
  assert.equal(result.diagnostics[0].code, 'INVALID_CHARACTER_MODIFIER_BOUNDS');
});

test('non-finite expression resolution aborts', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: [{ id: 'str', provider: 'dnd5e', label: 'Strength', expression: '@s' }] }),
    rolls: [100],
    evaluateExpression: () => null
  });
  const env = environmentWithLibrary(service);
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 30, characterModifiers: [{ id: 'r', modifierId: 'str', operator: '+' }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(result.status, 'misconfigured');
  assert.equal(result.diagnostics[0].code, 'CHARACTER_MODIFIER_NON_FINITE');
});

test('macro returning NaN aborts with CHARACTER_MODIFIER_NON_FINITE', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: [{ id: 'm', provider: 'macro', label: 'Macro', macroUuid: 'Macro.x' }] }),
    rolls: [100],
    runMacro: () => Number.NaN
  });
  const env = environmentWithLibrary(service);
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 30, characterModifiers: [{ id: 'r', modifierId: 'm', operator: '+' }] }] },
    environment: env,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(result.status, 'misconfigured');
  assert.equal(result.diagnostics[0].code, 'CHARACTER_MODIFIER_NON_FINITE');
});

test('aborted attempts do not consume nodes/stamina/attempt-limit', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: [] }),
    rolls: [100],
    evaluateExpression: () => 0
  });
  const calls = {};
  const actor = makeFakeActor();
  // Pre-seed stamina so commit would deduct it
  await actor.setFlag('fabricate', 'gatheringState', { stamina: { 'system-test': { current: 5, max: 5, provider: 'fabricate', regenerationMode: 'manual' } } });

  // Configure library task with a missing modifier reference inside a system
  const config = {
    systems: {
      'system-test': {
        tasks: [{
          id: 'task-misconfig',
          name: 'Misconfig Task',
          staminaCost: 1,
          dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 30, characterModifiers: [{ id: 'r', modifierId: 'gone', operator: '+' }] }]
        }]
      }
    }
  };
  const { service: serviceWithTask } = makeRichState({ config, rolls: [100], evaluateExpression: () => 0 });
  const env = environment({ id: 'env-test', craftingSystemId: 'system-test', tasks: [] });
  const engine = makeEngine({
    richState: serviceWithTask,
    env,
    calls,
    actingActor: actor
  });
  const result = await engine.startAttempt({ viewer: { id: 'u', isGM: false }, actor, environmentId: 'env-test', taskId: 'task-misconfig' });
  assert.equal(result.accepted, false, 'attempt is blocked');
  const stamina = serviceWithTask.getActorStamina(actor, 'system-test');
  assert.equal(stamina.current, 5, 'stamina was not consumed');
});
