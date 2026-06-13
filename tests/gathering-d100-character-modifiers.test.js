import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRichState } from './helpers/gathering.js';

function configFor({ entries = [], events = [] } = {}) {
  return {
    systems: {
      'system-a': {
        rules: { rewardSelectionMode: 'allDrops', eventSelectionMode: 'allDrops' },
        characterModifiers: entries,
        events
      }
    }
  };
}

function environmentWithLibrary(service, { events = [], conditions = null, biomes = null, rules = {} } = {}) {
  const composed = service.composeEnvironment({
    id: 'env',
    craftingSystemId: 'system-a',
    tasks: []
  }, { id: 'system-a' });
  // Override conditions, biomes, and events inline (composeEnvironment uses system defaults)
  if (conditions) composed.conditions = conditions;
  if (biomes) composed.biomes = biomes;
  if (events.length > 0) composed.events = events;
  composed.rules = {
    rewardSelectionMode: 'allDrops',
    eventSelectionMode: 'allDrops',
    rewardLimit: 99,
    eventLimit: 99,
    eventPolicy: 'successWithEvent',
    ...rules
  };
  return composed;
}

function composeAndResolve(service, { task, events = [], conditions = null, biomes = null, rules = {} } = {}) {
  const composed = environmentWithLibrary(service, { events, conditions, biomes, rules });
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

test('event threshold reduced by negative character modifier', async () => {
  const { service } = makeRichState({
    config: configFor({
      entries: [{ id: 'stealth', label: 'Stealth', icon: 'fa-solid fa-eye', provider: 'dnd5e', expression: '@stealth' }]
    }),
    rolls: [100, 100],
    evaluateExpression: () => 4
  });
  const result = await composeAndResolve(service, {
    task: { id: 't', dropRows: [{ id: 'd', componentId: 'herb', quantity: 1, dropRate: 0 }] },
    events: [{
      id: 'h1',
      name: 'Trap',
      dropRate: 30,
      characterModifiers: [{ id: 'rh', modifierId: 'stealth', operator: '-' }]
    }]
  });
  const haz = result.events[0];
  assert.equal(haz.characterModifierTotal, -4);
  assert.equal(haz.finalDropRate, 26);
});

test('eventModifier and characterModifiers are independent on the same event', async () => {
  const { service } = makeRichState({
    config: configFor({
      entries: [{ id: 'stealth', provider: 'dnd5e', label: 'Stealth', expression: '@stealth' }]
    }),
    rolls: [100],
    evaluateExpression: () => 5
  });
  const result = await composeAndResolve(service, {
    task: { id: 't', dropRows: [] },
    events: [{
      id: 'h',
      name: 'Trap',
      dropRate: 30,
      eventModifier: { provider: 'static', value: 2 },
      characterModifiers: [{ id: 'r', modifierId: 'stealth', operator: '-' }]
    }]
  });
  const haz = result.events[0];
  assert.equal(haz.modifier, 2, 'roll-side eventModifier preserved');
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

// --- issue 299: multiplicative drop-chance modifiers (additive/multiplicative toggle) ---

const MOD_LIBRARY = [
  { id: 'mod', label: 'Mod', icon: 'fa-solid fa-dice', provider: 'dnd5e', expression: '@mod' }
];

async function resolveSingleRow(service, { dropRate, reference, rules = {}, conditionModifiers } = {}) {
  const result = await composeAndResolve(service, {
    rules,
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate,
        ...(conditionModifiers ? { conditionModifiers } : {}),
        characterModifiers: [reference]
      }]
    }
  });
  return result.items[0];
}

// Shared arrange for the single-MOD_LIBRARY-reference cases below: every modifier
// resolves to `value`; `rolls` defaults to a guaranteed-miss so the row is scored.
function richForMod({ value = 10, rolls } = {}) {
  const opts = { config: configFor({ entries: MOD_LIBRARY }), evaluateExpression: () => value };
  if (rolls) opts.rolls = rolls;
  return makeRichState(opts).service;
}

async function resolveDrop({ dropRate, reference, value = 10, rules = {} } = {}) {
  return resolveSingleRow(richForMod({ value, rolls: [100] }), { dropRate, reference, rules });
}

async function previewDrop({ dropRate, reference, value = 10, rules = {} } = {}) {
  return previewSingleRow(richForMod({ value }), { dropRate, reference, rules });
}

test('issue 299: additive baseline unchanged (base 25, +10 => 35)', async () => {
  const drop = await resolveDrop({ dropRate: 25, reference: { id: 'r', modifierId: 'mod', operator: '+' } });
  assert.equal(drop.characterModifierTotal, 10);
  assert.equal(drop.characterModifierFactor, 1);
  assert.equal(drop.finalDropRate, 35);
  assert.equal(drop.threshold, 101 - 35);
});

test('issue 299: additive negative (base 25, -10 => 15)', async () => {
  const drop = await resolveDrop({ dropRate: 25, reference: { id: 'r', modifierId: 'mod', operator: '-' } });
  assert.equal(drop.characterModifierTotal, -10);
  assert.equal(drop.finalDropRate, 15);
});

test('issue 299: multiplicative single negative clean (base 20 x0.9 => 18)', async () => {
  const drop = await resolveDrop({ dropRate: 20, reference: { id: 'r', modifierId: 'mod', operator: '-', mode: 'multiplicative' } });
  assert.equal(drop.characterModifierTotal, 0, 'multiplicative entries contribute no additive delta');
  assert.equal(drop.characterModifierFactor, 0.9);
  assert.equal(drop.finalDropRate, 18);
});

test('issue 299: multiplicative single negative locks rounding (base 25 x0.9 => 23)', async () => {
  const drop = await resolveDrop({ dropRate: 25, reference: { id: 'r', modifierId: 'mod', operator: '-', mode: 'multiplicative' } });
  // 25 * 0.9 = 22.5 -> Math.round => 23
  assert.equal(drop.finalDropRate, 23);
});

test('issue 299: multiplicative positive (base 50 x1.2 => 60)', async () => {
  const drop = await resolveDrop({ dropRate: 50, value: 20, reference: { id: 'r', modifierId: 'mod', operator: '+', mode: 'multiplicative' } });
  assert.equal(drop.characterModifierFactor, 1.2);
  assert.equal(drop.finalDropRate, 60);
});

test('issue 299: mixed order applies additive before multiplicative (base 20, +10 add & -50% mult => 15)', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: [
      { id: 'add', label: 'Add', icon: 'fa-solid fa-plus', provider: 'dnd5e', expression: '@add' },
      { id: 'mult', label: 'Mult', icon: 'fa-solid fa-xmark', provider: 'dnd5e', expression: '@mult' }
    ] }),
    rolls: [100],
    evaluateExpression: (payload) => (payload.modifier.id === 'add' ? 10 : 50)
  });
  const result = await composeAndResolve(service, {
    task: {
      id: 't',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate: 20,
        characterModifiers: [
          { id: 'r-add', modifierId: 'add', operator: '+', mode: 'additive' },
          { id: 'r-mult', modifierId: 'mult', operator: '-', mode: 'multiplicative' }
        ]
      }]
    }
  });
  const drop = result.items[0];
  // (20 + 10) * 0.5 = 15. Control: reverse order (20*0.5)+10 = 20, which we must NOT get.
  assert.equal(drop.characterModifierTotal, 10);
  assert.equal(drop.characterModifierFactor, 0.5);
  assert.equal(drop.finalDropRate, 15);
  assert.notEqual(drop.finalDropRate, 20, 'multiplying base before adding would give 20');
});

test('issue 299: per-reference override beats system default (both directions)', async () => {
  // System default multiplicative, but the reference forces additive.
  const additive = await resolveDrop({
    dropRate: 25,
    rules: { dropModifierMode: 'multiplicative' },
    reference: { id: 'r', modifierId: 'mod', operator: '+', mode: 'additive' }
  });
  assert.equal(additive.finalDropRate, 35, 'additive override under multiplicative default');
  assert.equal(additive.characterModifierFactor, 1);

  // System default additive, but the reference forces multiplicative.
  const multiplicative = await resolveDrop({
    dropRate: 50,
    value: 20,
    rules: { dropModifierMode: 'additive' },
    reference: { id: 'r', modifierId: 'mod', operator: '+', mode: 'multiplicative' }
  });
  assert.equal(multiplicative.finalDropRate, 60, 'multiplicative override under additive default');
  assert.equal(multiplicative.characterModifierFactor, 1.2);
});

test('issue 299: default reference mode inherits system default (additive vs multiplicative)', async () => {
  const additive = await resolveDrop({
    dropRate: 25,
    rules: { dropModifierMode: 'additive' },
    reference: { id: 'r', modifierId: 'mod', operator: '+', mode: 'default' }
  });
  assert.equal(additive.finalDropRate, 35);

  const multiplicative = await resolveDrop({
    dropRate: 20,
    rules: { dropModifierMode: 'multiplicative' },
    reference: { id: 'r', modifierId: 'mod', operator: '-', mode: 'default' }
  });
  assert.equal(multiplicative.finalDropRate, 18, 'default inherits multiplicative system mode');
});

test('issue 299: min/max clamps value before factor (value 50 but max 10, - mult => x0.9)', async () => {
  const drop = await resolveDrop({
    dropRate: 20,
    value: 50,
    reference: { id: 'r', modifierId: 'mod', operator: '-', mode: 'multiplicative', max: 10 }
  });
  // value clamped 50 -> 10, factor 1 - 10/100 = 0.9, 20*0.9 = 18
  assert.equal(drop.characterModifierFactor, 0.9);
  assert.equal(drop.finalDropRate, 18);
});

// Zero-rate boundary rows can never drop (threshold 101 > max roll 100), so we
// inspect the no-dice preview which returns every row regardless of the roll.
async function previewSingleRow(service, { dropRate, reference, rules = {} } = {}) {
  const composed = environmentWithLibrary(service, { rules });
  const preview = await service.previewDropBreakdown({
    environment: composed,
    task: {
      id: 't',
      resolutionMode: 'd100',
      dropRows: [{
        id: 'd1', componentId: 'herb', quantity: 1, dropRate,
        characterModifiers: [reference]
      }]
    },
    actor: { uuid: 'Actor.x' }
  });
  return preview.drops[0];
}

test('issue 299: rounding/clamp boundaries (100 x1.5 => 100 threshold 1)', async () => {
  const high = await resolveDrop({
    dropRate: 100,
    value: 50,
    reference: { id: 'r', modifierId: 'mod', operator: '+', mode: 'multiplicative' }
  });
  assert.equal(high.finalDropRate, 100, '100 * 1.5 clamps to 100');
  assert.equal(high.threshold, 1, 'threshold floored at 1');
});

test('issue 299: rounding/clamp boundaries (1 x0.1 => 0 via preview)', async () => {
  const drop = await previewDrop({
    dropRate: 1,
    value: 90,
    reference: { id: 'r', modifierId: 'mod', operator: '-', mode: 'multiplicative' }
  });
  // 1 * 0.1 = 0.1 -> Math.round => 0
  assert.equal(Math.round(drop.finalChance * 100), 0);
});

test('issue 299: negative-factor guard (value 150, - mult => factor 0 => 0)', async () => {
  const drop = await previewDrop({
    dropRate: 80,
    value: 150,
    reference: { id: 'r', modifierId: 'mod', operator: '-', mode: 'multiplicative' }
  });
  // 1 - 150/100 = -0.5 -> guarded to 0; 80 * 0 = 0
  assert.equal(Math.round(drop.finalChance * 100), 0);
});

test('issue 299: event drop rate uses the same additive-then-multiplicative aggregation', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: MOD_LIBRARY }),
    rolls: [100, 100],
    evaluateExpression: () => 10
  });
  const result = await composeAndResolve(service, {
    task: { id: 't', dropRows: [{ id: 'd', componentId: 'herb', quantity: 1, dropRate: 0 }] },
    events: [{
      id: 'h1', name: 'Trap', dropRate: 20,
      characterModifiers: [{ id: 'rh', modifierId: 'mod', operator: '-', mode: 'multiplicative' }]
    }]
  });
  const event = result.events[0];
  assert.equal(event.characterModifierFactor, 0.9);
  assert.equal(event.finalDropRate, 18);
});

test('issue 299: back-compat config/reference with no mode fields is identical to additive baseline', async () => {
  // No dropModifierMode in rules, no mode on the reference: pure additive.
  const drop = await resolveDrop({ dropRate: 25, reference: { id: 'r', modifierId: 'mod', operator: '+' } });
  assert.equal(drop.characterModifierTotal, 10);
  assert.equal(drop.characterModifierFactor, 1);
  assert.equal(drop.finalDropRate, 35);
});

// --- issue 299 (extended): condition modifiers (weather/time-of-day/biome) honor the mode ---

// Resolve a single drop row with only condition modifiers (no character modifiers)
// under the given conditions/biomes. The row is scored on a guaranteed-miss roll.
async function resolveConditionRow(
  { dropRate, conditionModifiers, conditions = null, biomes = null, rules = {}, characterModifiers = [] } = {}
) {
  const service = makeRichState({
    config: configFor({ entries: MOD_LIBRARY }),
    rolls: [100],
    evaluateExpression: () => 10
  }).service;
  const result = await composeAndResolve(service, {
    rules,
    conditions,
    biomes,
    task: {
      id: 't',
      dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate, conditionModifiers, characterModifiers }]
    }
  });
  return result.items[0];
}

// Preview a single drop row (returns regardless of the roll) with condition modifiers.
async function previewConditionRow({ dropRate, conditionModifiers, conditions = null, biomes = null, rules = {} } = {}) {
  const service = makeRichState({ config: configFor({ entries: MOD_LIBRARY }) }).service;
  const composed = environmentWithLibrary(service, { conditions, biomes, rules });
  const preview = await service.previewDropBreakdown({
    environment: composed,
    task: {
      id: 't',
      resolutionMode: 'd100',
      dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate, conditionModifiers }]
    },
    actor: { uuid: 'Actor.x' }
  });
  return preview.drops[0];
}

test('issue 299: additive-only condition modifiers stay byte-identical (conditionModifier unchanged)', async () => {
  // base 25 + weather +15 + time -5 = 35; conditionModifier reports the additive total.
  const drop = await resolveConditionRow({
    dropRate: 25,
    conditions: { weather: 'rain', timeOfDay: 'night' },
    conditionModifiers: {
      weather: [{ id: 'w', conditionId: 'rain', operator: '+', value: 15 }],
      timeOfDay: [{ id: 't', conditionId: 'night', operator: '-', value: 5 }]
    }
  });
  assert.equal(drop.conditionModifier, 10, 'additive condition total preserved');
  assert.equal(drop.finalDropRate, 35);
});

test('issue 299: multiplicative weather condition (base 20, rain -10% mult => 18)', async () => {
  const drop = await resolveConditionRow({
    dropRate: 20,
    conditions: { weather: 'rain', timeOfDay: 'day' },
    conditionModifiers: { weather: [{ id: 'w', conditionId: 'rain', operator: '-', value: 10, mode: 'multiplicative' }] }
  });
  // 20 * 0.9 = 18; the multiplicative weather entry contributes no additive delta.
  assert.equal(drop.conditionModifier, 0);
  assert.equal(drop.finalDropRate, 18);
});

test('issue 299: multiplicative time-of-day condition (base 50, night +20% mult => 60)', async () => {
  const drop = await resolveConditionRow({
    dropRate: 50,
    conditions: { weather: 'clear', timeOfDay: 'night' },
    conditionModifiers: { timeOfDay: [{ id: 't', conditionId: 'night', operator: '+', value: 20, mode: 'multiplicative' }] }
  });
  assert.equal(drop.finalDropRate, 60);
});

test('issue 299: multiplicative biome across aggregations + mixed additive/multiplicative subset', async () => {
  // Two active biomes; one additive +10, one multiplicative -50%.
  const conditionModifiers = {
    biome: [
      { id: 'b-add', conditionId: 'forest', operator: '+', value: 10, mode: 'additive' },
      { id: 'b-mult', conditionId: 'swamp', operator: '-', value: 50, mode: 'multiplicative' }
    ]
  };
  // (20 + 10) * 0.5 = 15 regardless of aggregation when there is one of each.
  for (const aggregation of ['cumulative', 'strongestOfEach', 'dominant']) {
    const drop = await resolveConditionRow({
      dropRate: 20,
      conditions: { weather: 'clear', timeOfDay: 'day' },
      biomes: ['forest', 'swamp'],
      rules: { biomeModifierAggregation: aggregation },
      conditionModifiers
    });
    assert.equal(drop.finalDropRate, 15, `mixed biome subset under ${aggregation}`);
    assert.equal(drop.conditionModifier, 10, `additive biome subset reported under ${aggregation}`);
  }

  // Two multiplicative biomes: cumulative aggregates the signed percents (-10 + -20 = -30 => x0.7).
  const cumulative = await resolveConditionRow({
    dropRate: 100,
    conditions: { weather: 'clear', timeOfDay: 'day' },
    biomes: ['forest', 'swamp'],
    rules: { biomeModifierAggregation: 'cumulative' },
    conditionModifiers: {
      biome: [
        { id: 'b1', conditionId: 'forest', operator: '-', value: 10, mode: 'multiplicative' },
        { id: 'b2', conditionId: 'swamp', operator: '-', value: 20, mode: 'multiplicative' }
      ]
    }
  });
  assert.equal(cumulative.finalDropRate, 70, 'cumulative aggregates signed percents then applies one factor');

  // strongestOfEach picks the largest boost + largest penalty in signed-percent space.
  const strongest = await resolveConditionRow({
    dropRate: 100,
    conditions: { weather: 'clear', timeOfDay: 'day' },
    biomes: ['forest', 'swamp', 'cave'],
    rules: { biomeModifierAggregation: 'strongestOfEach' },
    conditionModifiers: {
      biome: [
        { id: 'b1', conditionId: 'forest', operator: '+', value: 30, mode: 'multiplicative' },
        { id: 'b2', conditionId: 'swamp', operator: '-', value: 20, mode: 'multiplicative' },
        { id: 'b3', conditionId: 'cave', operator: '-', value: 5, mode: 'multiplicative' }
      ]
    }
  });
  // +30 boost + -20 penalty = +10 signed => x1.1 => 110 clamped to 100.
  assert.equal(strongest.finalDropRate, 100);

  // dominant picks the single largest-magnitude signed percent (-40 => x0.6).
  const dominant = await resolveConditionRow({
    dropRate: 100,
    conditions: { weather: 'clear', timeOfDay: 'day' },
    biomes: ['forest', 'swamp'],
    rules: { biomeModifierAggregation: 'dominant' },
    conditionModifiers: {
      biome: [
        { id: 'b1', conditionId: 'forest', operator: '+', value: 10, mode: 'multiplicative' },
        { id: 'b2', conditionId: 'swamp', operator: '-', value: 40, mode: 'multiplicative' }
      ]
    }
  });
  assert.equal(dominant.finalDropRate, 60);
});

test('issue 299: mixed character + condition modifiers apply additive before multiplicative', async () => {
  // base 20, +10 char additive, +5 weather additive, -50% biome multiplicative.
  // (20 + 10 + 5) * 0.5 = 17.5 -> round => 18.
  const drop = await resolveConditionRow({
    dropRate: 20,
    conditions: { weather: 'rain', timeOfDay: 'day' },
    biomes: ['forest'],
    characterModifiers: [{ id: 'rc', modifierId: 'mod', operator: '+' }], // resolves to +10 (value 10)
    conditionModifiers: {
      weather: [{ id: 'w', conditionId: 'rain', operator: '+', value: 5 }],
      biome: [{ id: 'b', conditionId: 'forest', operator: '-', value: 50, mode: 'multiplicative' }]
    }
  });
  assert.equal(drop.characterModifierTotal, 10);
  assert.equal(drop.conditionModifier, 5, 'additive condition total (weather) only');
  assert.equal(drop.finalDropRate, 18);
});

test('issue 299: per-entry condition override beats system default; default inherits it', async () => {
  // System default multiplicative; an explicit additive weather entry forces a sum.
  const override = await resolveConditionRow({
    dropRate: 20,
    rules: { dropModifierMode: 'multiplicative' },
    conditions: { weather: 'rain', timeOfDay: 'day' },
    conditionModifiers: { weather: [{ id: 'w', conditionId: 'rain', operator: '+', value: 10, mode: 'additive' }] }
  });
  assert.equal(override.finalDropRate, 30, 'additive override under multiplicative default');
  assert.equal(override.conditionModifier, 10);

  // System default multiplicative; a 'default' entry inherits it.
  const inherited = await resolveConditionRow({
    dropRate: 20,
    rules: { dropModifierMode: 'multiplicative' },
    conditions: { weather: 'rain', timeOfDay: 'day' },
    conditionModifiers: { weather: [{ id: 'w', conditionId: 'rain', operator: '-', value: 10, mode: 'default' }] }
  });
  assert.equal(inherited.finalDropRate, 18, 'default inherits multiplicative system mode');
  assert.equal(inherited.conditionModifier, 0);
});

test('issue 299: preview parity with the rolled result for a multiplicative condition', async () => {
  const args = {
    dropRate: 20,
    conditions: { weather: 'rain', timeOfDay: 'day' },
    biomes: ['forest'],
    conditionModifiers: {
      weather: [{ id: 'w', conditionId: 'rain', operator: '+', value: 5 }],
      biome: [{ id: 'b', conditionId: 'forest', operator: '-', value: 50, mode: 'multiplicative' }]
    }
  };
  const rolled = await resolveConditionRow(args);
  const preview = await previewConditionRow(args);
  // (20 + 5) * 0.5 = 12.5 -> round => 13.
  assert.equal(rolled.finalDropRate, 13);
  assert.equal(Math.round(preview.finalChance * 100), 13, 'preview finalChance matches the rolled rate');
  // Display payload: additive weather value plus the biome multiplicative factor.
  assert.equal(preview.modifiers.weather.value, 5);
  assert.equal(preview.modifiers.biome.factor, 0.5);
});

test('issue 299: taskSuccessChance reflects a multiplicative condition modifier', async () => {
  const service = makeRichState({ config: configFor({ entries: [] }) }).service;
  const composed = environmentWithLibrary(service, { conditions: { weather: 'rain', timeOfDay: 'day' } });
  const task = {
    id: 't',
    resolutionMode: 'd100',
    dropRows: [{
      id: 'd1', componentId: 'herb', quantity: 1, dropRate: 20,
      conditionModifiers: { weather: [{ id: 'w', conditionId: 'rain', operator: '-', value: 10, mode: 'multiplicative' }] }
    }]
  };
  const chance = service.taskSuccessChance(task, composed);
  // 20 * 0.9 = 18 => 0.18 single-row miss-all.
  assert.equal(Math.round(chance * 100), 18);
});

test('issue 299: event path honors a multiplicative condition modifier', async () => {
  const service = makeRichState({
    config: configFor({ entries: [] }),
    rolls: [100, 100]
  }).service;
  const result = await composeAndResolve(service, {
    conditions: { weather: 'rain', timeOfDay: 'day' },
    task: { id: 't', dropRows: [{ id: 'd', componentId: 'herb', quantity: 1, dropRate: 0 }] },
    events: [{
      id: 'h1', name: 'Trap', dropRate: 20,
      conditionModifiers: { weather: [{ id: 'we', conditionId: 'rain', operator: '-', value: 10, mode: 'multiplicative' }] }
    }]
  });
  const event = result.events[0];
  assert.equal(event.finalDropRate, 18);
});
