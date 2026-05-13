/**
 * Coverage for the tools field on gathering tasks: normalization defaults,
 * legacy-task compatibility, and per-rule validation messages.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SETTING_KEYS } from '../src/config/settings.js';
import { GatheringEnvironmentStore } from '../src/systems/GatheringEnvironmentStore.js';

function makeStore({ saved = [], systems = [
  { id: 'system-a', features: { gathering: true }, components: [{ id: 'comp-axe' }, { id: 'comp-axe-broken' }] }
] } = {}) {
  const settings = new Map([[SETTING_KEYS.GATHERING_ENVIRONMENTS, saved]]);
  let counter = 0;
  return new GatheringEnvironmentStore({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    getSystems: () => systems,
    randomID: () => `id-${++counter}`
  });
}

function routedTask(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather',
    enabled: true,
    resolutionMode: 'routed',
    catalysts: [],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' },
    resultGroups: [{ id: 'g', name: 'Iron', results: [{ id: 'r', componentId: 'comp-axe', quantity: 1 }] }],
    ...overrides
  };
}

function envWith(task) {
  return {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Test Environment',
    enabled: true,
    selectionMode: 'targeted',
    tasks: [task]
  };
}

test('legacy task without tools field normalizes to empty tools array', async () => {
  const store = makeStore({ saved: [envWith(routedTask())] });
  const list = store.load();
  assert.deepEqual(list[0].tasks[0].tools, []);
});

test('save accepts tasks with no tools and persists tools: []', async () => {
  const store = makeStore({ saved: [envWith(routedTask())] });
  store.load();
  await store.save(store.list());
  const saved = store.list()[0].tasks[0];
  assert.deepEqual(saved.tools, []);
});

test('normalizeTool defaults breakage to limitedUses with null maxUses and onBreak to destroy', async () => {
  const store = makeStore({ saved: [envWith(routedTask({ tools: [{ componentId: 'comp-axe' }] }))] });
  const tool = store.load()[0].tasks[0].tools[0];
  assert.equal(tool.componentId, 'comp-axe');
  assert.equal(tool.requirement, null);
  assert.deepEqual(tool.breakage, { mode: 'limitedUses', maxUses: null });
  assert.deepEqual(tool.onBreak, { mode: 'destroy' });
});

test('save rejects tool with empty componentId', async () => {
  const store = makeStore({ saved: [envWith(routedTask({ tools: [{ componentId: '' }] }))] });
  store.load();
  await assert.rejects(
    () => store.save(store.list()),
    /tool 1 requires componentId/
  );
});

test('save rejects diceExpression tool missing formula', async () => {
  const store = makeStore({
    saved: [envWith(routedTask({
      tools: [{
        componentId: 'comp-axe',
        breakage: { mode: 'diceExpression', formula: '', threshold: 5 }
      }]
    }))]
  });
  store.load();
  await assert.rejects(
    () => store.save(store.list()),
    /breakage\.formula is required for diceExpression mode/
  );
});

test('save rejects breakageChance tool with out-of-range value', async () => {
  const store = makeStore({
    saved: [envWith(routedTask({
      tools: [{
        componentId: 'comp-axe',
        breakage: { mode: 'breakageChance', breakageChance: 150 }
      }]
    }))]
  });
  store.load();
  await assert.rejects(
    () => store.save(store.list()),
    /breakage\.breakageChance must be an integer between 0 and 100/
  );
});

test('save rejects replaceWith tool when replacementComponentId equals componentId', async () => {
  const store = makeStore({
    saved: [envWith(routedTask({
      tools: [{
        componentId: 'comp-axe',
        onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-axe' }
      }]
    }))]
  });
  store.load();
  await assert.rejects(
    () => store.save(store.list()),
    /onBreak\.replacementComponentId must differ from componentId/
  );
});

test('save rejects macro-provider requirement missing macroUuid', async () => {
  const store = makeStore({
    saved: [envWith(routedTask({
      tools: [{
        componentId: 'comp-axe',
        requirement: { provider: 'macro', macroUuid: '' }
      }]
    }))]
  });
  store.load();
  await assert.rejects(
    () => store.save(store.list()),
    /requirement\.macroUuid is required when provider is macro/
  );
});

test('normalizeTool preserves valid replaceWith configuration', async () => {
  const store = makeStore({
    saved: [envWith(routedTask({
      tools: [{
        componentId: 'comp-axe',
        breakage: { mode: 'breakageChance', breakageChance: 25 },
        onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-axe-broken' }
      }]
    }))]
  });
  const tool = store.load()[0].tasks[0].tools[0];
  assert.equal(tool.breakage.mode, 'breakageChance');
  assert.equal(tool.breakage.breakageChance, 25);
  assert.equal(tool.onBreak.mode, 'replaceWith');
  assert.equal(tool.onBreak.replacementComponentId, 'comp-axe-broken');
});

test('round-trip save/load is idempotent for tools', async () => {
  const tool = {
    componentId: 'comp-axe',
    requirement: { provider: 'dnd5e', formula: '@abilities.str.mod', macroUuid: '' },
    breakage: { mode: 'limitedUses', maxUses: 5 },
    onBreak: { mode: 'destroy' }
  };
  const store = makeStore({ saved: [envWith(routedTask({ tools: [tool] }))] });
  store.load();
  await store.save(store.list());
  await store.save(store.list());
  const final = store.list()[0].tasks[0].tools[0];
  assert.deepEqual(final, {
    componentId: 'comp-axe',
    requirement: { provider: 'dnd5e', formula: '@abilities.str.mod', macroUuid: '' },
    breakage: { mode: 'limitedUses', maxUses: 5 },
    onBreak: { mode: 'destroy' }
  });
});
