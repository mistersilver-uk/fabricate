import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRichState } from './helpers/gathering.js';

function configFor({ entries = [], hazards = [] } = {}) {
  return {
    systems: {
      'system-a': {
        rules: { rewardSelectionMode: 'allDrops', hazardSelectionMode: 'allDrops' },
        characterModifiers: entries,
        hazards
      }
    }
  };
}

function environmentWithLibrary(service, { hazards = [], conditions = null } = {}) {
  const composed = service.composeEnvironment({
    id: 'env',
    craftingSystemId: 'system-a',
    tasks: []
  }, { id: 'system-a' });
  // Override conditions and hazards inline (composeEnvironment uses system defaults)
  if (conditions) composed.conditions = conditions;
  if (hazards.length > 0) composed.hazards = hazards;
  composed.rules = { rewardSelectionMode: 'allDrops', hazardSelectionMode: 'allDrops', rewardLimit: 99, hazardLimit: 99, hazardPolicy: 'successWithHazard' };
  return composed;
}

function composeAndResolve(service, { task, hazards = [], conditions = null } = {}) {
  const composed = environmentWithLibrary(service, { hazards, conditions });
  return service.resolveD100Attempt({
    task,
    environment: composed,
    actor: { uuid: 'Actor.x' }
  });
}

const STR_LIBRARY = [
  { id: 'strength', label: 'Strength', icon: 'fa-solid fa-dumbbell', provider: 'dnd5e', expression: '@abilities.str.mod' }
];

test('drop row sums character modifier into final threshold', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIBRARY }),
    rolls: [100],
    evaluateExpression: () => 5
  });
  const result = await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1',
        componentId: 'herb',
        quantity: 1,
        dropRate: 25,
        characterModifiers: [{ id: 'r1', modifierId: 'strength', operator: '+' }]
      }]
    }
  });
  assert.equal(result.status, 'succeeded');
  const drop = result.items[0];
  assert.equal(drop.characterModifierTotal, 5);
  assert.equal(drop.finalDropRate, 30);
});

test('character modifier composes with condition modifier worked example', async () => {
  // dropRate 25 + weather +5 + strength +3 = finalThreshold 33; effectiveRoll = roll + 10 (gatheringModifier)
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIBRARY }),
    rolls: [100],
    evaluateExpression: () => 3
  });
  const result = await composeAndResolve(service, {
    task: {
      id: 't',
      gatheringModifier: { provider: 'static', value: 10 },
      dropRows: [{
        id: 'd1',
        componentId: 'herb',
        quantity: 1,
        dropRate: 25,
        conditionModifiers: { weather: [{ id: 'wm', conditionId: 'rain', value: 5 }] },
        characterModifiers: [{ id: 'r1', modifierId: 'strength', operator: '+' }]
      }]
    },
    conditions: { weather: 'rain', timeOfDay: 'day' }
  });
  assert.equal(result.items.length, 1);
  const drop = result.items[0];
  assert.equal(drop.conditionModifier, 5);
  assert.equal(drop.characterModifierTotal, 3);
  assert.equal(drop.finalDropRate, 33);
  assert.equal(drop.effectiveRoll, 110);
});

test('hazard threshold reduced by negative character modifier', async () => {
  const { service } = makeRichState({
    config: configFor({
      entries: [{ id: 'stealth', label: 'Stealth', icon: 'fa-solid fa-eye', provider: 'dnd5e', expression: '@stealth' }]
    }),
    rolls: [100, 100],
    evaluateExpression: () => 4
  });
  const result = await composeAndResolve(service, {
    task: { id: 't', dropRows: [{ id: 'd', componentId: 'herb', quantity: 1, dropRate: 0 }] },
    hazards: [{
      id: 'h1',
      name: 'Trap',
      dropRate: 30,
      characterModifiers: [{ id: 'rh', modifierId: 'stealth', operator: '-' }]
    }]
  });
  const haz = result.hazards[0];
  assert.equal(haz.characterModifierTotal, -4);
  assert.equal(haz.finalDropRate, 26);
});

test('hazardModifier and characterModifiers are independent on the same hazard', async () => {
  const { service } = makeRichState({
    config: configFor({
      entries: [{ id: 'stealth', provider: 'dnd5e', label: 'Stealth', expression: '@stealth' }]
    }),
    rolls: [100],
    evaluateExpression: () => 5
  });
  const result = await composeAndResolve(service, {
    task: { id: 't', dropRows: [] },
    hazards: [{
      id: 'h',
      name: 'Trap',
      dropRate: 30,
      hazardModifier: { provider: 'static', value: 2 },
      characterModifiers: [{ id: 'r', modifierId: 'stealth', operator: '-' }]
    }]
  });
  const haz = result.hazards[0];
  assert.equal(haz.modifier, 2, 'roll-side hazardModifier preserved');
  assert.equal(haz.characterModifierTotal, -5, 'threshold-side modifier applied');
  assert.equal(haz.finalDropRate, 25);
});

test('min/max clamp applied before operator', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIBRARY }),
    rolls: [100],
    evaluateExpression: () => 8
  });
  const result = await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate: 10,
        characterModifiers: [{ id: 'r', modifierId: 'strength', operator: '+', min: 0, max: 5 }]
      }]
    }
  });
  assert.equal(result.items[0].characterModifierTotal, 5);
});

test('multiple references on one row stack contributions', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: [
      { id: 'strength', provider: 'dnd5e', label: 'Strength', expression: '@s' },
      { id: 'athletics', provider: 'dnd5e', label: 'Athletics', expression: '@a' }
    ] }),
    rolls: [100],
    evaluateExpression: ({ expression }) => expression === '@s' ? 2 : 4
  });
  const result = await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate: 10,
        characterModifiers: [
          { id: 'r1', modifierId: 'strength', operator: '+' },
          { id: 'r2', modifierId: 'athletics', operator: '+' }
        ]
      }]
    }
  });
  assert.equal(result.items[0].characterModifierTotal, 6);
});

test('same modifier id referenced twice on one row evaluates both', async () => {
  let calls = 0;
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIBRARY }),
    rolls: [100],
    evaluateExpression: () => { calls += 1; return 3; }
  });
  const result = await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate: 10,
        characterModifiers: [
          { id: 'r1', modifierId: 'strength', operator: '+' },
          { id: 'r2', modifierId: 'strength', operator: '-' }
        ]
      }]
    }
  });
  assert.equal(calls, 2, 'evaluator invoked twice');
  // Both contributions: +3 and -3 = net 0
  assert.equal(result.items[0].characterModifierTotal, 0);
});

test('same modifier id across different rows resolves independently', async () => {
  const { service, evaluateCalls } = makeRichState({
    config: configFor({ entries: STR_LIBRARY }),
    rolls: [100, 100],
    evaluateExpression: () => 2
  });
  const result = await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [
        { id: 'd1', componentId: 'herb', quantity: 1, dropRate: 10, characterModifiers: [{ id: 'r1', modifierId: 'strength', operator: '+' }] },
        { id: 'd2', componentId: 'herb', quantity: 1, dropRate: 10, characterModifiers: [{ id: 'r2', modifierId: 'strength', operator: '+' }] }
      ]
    }
  });
  assert.equal(evaluateCalls.length, 2);
  assert.equal(result.items[0].characterModifierTotal, 2);
  assert.equal(result.items[1].characterModifierTotal, 2);
});

test('partial override inherits unset fields from library entry', async () => {
  let lastPayload;
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIBRARY }),
    rolls: [100],
    evaluateExpression: (payload) => { lastPayload = payload; return 7; }
  });
  await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate: 10,
        characterModifiers: [{ id: 'r', modifierId: 'strength', operator: '+', expressionOverride: '1d6 + @abilities.str.mod' }]
      }]
    }
  });
  assert.equal(lastPayload.expression, '1d6 + @abilities.str.mod');
  assert.equal(lastPayload.provider, 'dnd5e');
});

test('expression override replaces library expression but keeps library provider', async () => {
  let lastPayload;
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIBRARY }),
    rolls: [100],
    evaluateExpression: (payload) => { lastPayload = payload; return 1; }
  });
  await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate: 10,
        characterModifiers: [{ id: 'r', modifierId: 'strength', operator: '+', expressionOverride: '@a.b.c' }]
      }]
    }
  });
  assert.equal(lastPayload.expression, '@a.b.c');
  assert.equal(lastPayload.provider, 'dnd5e');
});

test('macro modifier receives correct context shape', async () => {
  let lastMacro;
  const { service } = makeRichState({
    config: configFor({ entries: [{ id: 'macro-mod', provider: 'macro', label: 'Macro', macroUuid: 'Macro.test' }] }),
    rolls: [100],
    runMacro: (uuid, context) => { lastMacro = { uuid, context }; return 2; }
  });
  await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate: 10,
        characterModifiers: [{ id: 'r', modifierId: 'macro-mod', operator: '+' }]
      }]
    }
  });
  assert.equal(lastMacro.uuid, 'Macro.test');
  assert.ok('actor' in lastMacro.context);
  assert.ok('environment' in lastMacro.context);
  assert.ok('task' in lastMacro.context);
  assert.ok('row' in lastMacro.context);
  assert.ok('conditions' in lastMacro.context);
  assert.ok('modifier' in lastMacro.context);
  assert.equal(lastMacro.context.kind, 'characterModifier');
});

test('final threshold is clamped to 0..100', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIBRARY }),
    rolls: [100],
    evaluateExpression: () => 1000
  });
  const result = await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate: 50,
        characterModifiers: [{ id: 'r', modifierId: 'strength', operator: '+' }]
      }]
    }
  });
  assert.equal(result.items[0].finalDropRate, 100);
});
