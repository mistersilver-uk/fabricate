/**
 * Unit tests for T-050: Salvage Destructive Change Handling
 *
 * 12 tests across 3 groups:
 *  Group 1: Mode change disables invalid salvage configs (4 tests)
 *  Group 2: Feature disable cleans up salvage runs (4 tests)
 *  Group 3: Component deletion cleans up salvage runs (4 tests)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

let idSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: () => undefined
  }
};
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
// Default game stub; individual tests may override globalThis.game before calling SUT
globalThis.game = { user: { isGM: true }, actors: [] };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function makeManager(resolutionService = null) {
  const recipeManagerStub = {
    getRecipes: () => [],
    deleteRecipe: async () => {},
    updateRecipe: async () => {}
  };
  const mgr = new CraftingSystemManager(recipeManagerStub);
  mgr.initialized = true;
  mgr.save = async () => {};

  // Wire up a real or stubbed ResolutionModeService
  if (resolutionService) {
    mgr._getResolutionModeService = () => resolutionService;
  }

  return mgr;
}

/**
 * Create an actor stub with a salvageRuns history flag.
 */
function makeActor(id, salvageRunsHistory = null) {
  const flags = {};
  if (salvageRunsHistory !== null) {
    if (!flags.fabricate) flags.fabricate = {};
    flags.fabricate['fabricate.salvageRuns'] = { active: {}, history: salvageRunsHistory };
  }
  return {
    id,
    uuid: `Actor.${id}`,
    _setFlagCalled: false,
    getFlag(ns, key) {
      return flags[ns]?.[key] ?? null;
    },
    async setFlag(ns, key, value) {
      if (!flags[ns]) flags[ns] = {};
      flags[ns][key] = value;
      this._setFlagCalled = true;
    },
    _flags: flags
  };
}

// ---------------------------------------------------------------------------
// Group 1: Mode change disables invalid salvage configs
// ---------------------------------------------------------------------------

test('Changing salvageResolutionMode from simple to routed disables components without outcomeRouting', async () => {
  // Simple mode requires exactly 1 result group. Routed requires outcomeRouting + check enabled.
  // Component has 1 result group but no outcomeRouting → invalid for routed.
  const system = {
    id: 'sys-1',
    name: 'Test',
    features: { salvage: true },
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: 'Macro.check',
      outcomes: ['pass', 'fail'],
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
      progressive: { awardMode: 'equal', allowPlayerReorder: false },
      // Routed salvage routes by outcome-tier name: a success tier the component
      // never routes makes it invalid for routed (see ResolutionModeService).
      routed: {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [
          { id: 't-pass', name: 'pass', success: true, dc: 0 },
          { id: 't-fail', name: 'fail', success: false, dc: -5 }
        ]
      }
    },
    components: [{
      id: 'comp-1',
      name: 'Iron Ore',
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [{ id: 'r-1', componentId: 'scrap', quantity: 1 }] }]
        // no outcomeRouting → the "pass" success tier is unrouted → invalid for routed
      }
    }]
  };

  // Use real ResolutionModeService wired to a system manager returning our system
  const svcMgr = { getSystem: () => null }; // validateSalvage doesn't use this
  const resolutionService = new ResolutionModeService(svcMgr);

  const mgr = makeManager(resolutionService);
  const normalized = mgr._normalizeSystem(system);
  mgr.systems.set(normalized.id, normalized);

  await mgr.updateSystem(normalized.id, { salvageResolutionMode: 'routed' });

  const updated = mgr.getSystem(normalized.id);
  const comp = updated.components.find(c => c.id === 'comp-1');
  assert.equal(comp.salvage.enabled, false, 'Component without outcomeRouting should be disabled in routed mode');
});

test('Changing salvageResolutionMode from routed to simple disables components with multiple result groups', async () => {
  // Simple mode requires exactly 1 result group. A component with 2 groups is invalid.
  const system = {
    id: 'sys-2',
    name: 'Test',
    features: { salvage: true },
    salvageResolutionMode: 'routed',
    salvageCraftingCheck: {
      enabled: true, macroUuid: 'Macro.check', outcomes: ['pass', 'fail'],
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
      progressive: { awardMode: 'equal', allowPlayerReorder: false }
    },
    components: [{
      id: 'comp-1',
      name: 'Dragon Scale',
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [
          { id: 'rg-pass', name: 'Pass', results: [{ id: 'r-1', componentId: 'gem', quantity: 1 }] },
          { id: 'rg-fail', name: 'Fail', results: [{ id: 'r-2', componentId: 'dust', quantity: 1 }] }
        ],
        outcomeRouting: { pass: 'rg-pass', fail: 'rg-fail' }
      }
    }]
  };

  const resolutionService = new ResolutionModeService({ getSystem: () => null });
  const mgr = makeManager(resolutionService);
  const normalized = mgr._normalizeSystem(system);
  mgr.systems.set(normalized.id, normalized);

  await mgr.updateSystem(normalized.id, { salvageResolutionMode: 'simple' });

  const updated = mgr.getSystem(normalized.id);
  const comp = updated.components.find(c => c.id === 'comp-1');
  assert.equal(comp.salvage.enabled, false, 'Component with 2 result groups should be disabled in simple mode');
});

test('Mode change does not disable components that are already valid for the new mode', async () => {
  // Component with exactly 1 result group, valid for simple mode.
  const system = {
    id: 'sys-3',
    name: 'Test',
    features: { salvage: true },
    salvageResolutionMode: 'routed',
    salvageCraftingCheck: {
      enabled: false, macroUuid: null, outcomes: [],
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
      progressive: { awardMode: 'equal', allowPlayerReorder: false }
    },
    components: [{
      id: 'comp-1',
      name: 'Iron Ore',
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [{ id: 'r-1', componentId: 'scrap', quantity: 1 }] }]
      }
    }]
  };

  const resolutionService = new ResolutionModeService({ getSystem: () => null });
  const mgr = makeManager(resolutionService);
  const normalized = mgr._normalizeSystem(system);
  mgr.systems.set(normalized.id, normalized);

  // Switch to simple mode — component with 1 group is valid for simple
  await mgr.updateSystem(normalized.id, { salvageResolutionMode: 'simple' });

  const updated = mgr.getSystem(normalized.id);
  const comp = updated.components.find(c => c.id === 'comp-1');
  assert.equal(comp.salvage.enabled, true, 'Component valid for new mode should remain enabled');
});

test('GM notification sent when components are disabled by mode change', async () => {
  const warnMessages = [];
  globalThis.ui.notifications.warn = (msg) => warnMessages.push(msg);

  const system = {
    id: 'sys-4',
    name: 'Test',
    features: { salvage: true },
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      enabled: true, macroUuid: 'Macro.check', outcomes: ['pass', 'fail'],
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
      progressive: { awardMode: 'equal', allowPlayerReorder: false },
      routed: {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [
          { id: 't-pass', name: 'pass', success: true, dc: 0 },
          { id: 't-fail', name: 'fail', success: false, dc: -5 }
        ]
      }
    },
    components: [{
      id: 'comp-1',
      name: 'Ore Fragment',
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [{ id: 'r-1', componentId: 'scrap', quantity: 1 }] }]
        // no outcomeRouting → the "pass" success tier is unrouted → invalid for routed
      }
    }]
  };

  const resolutionService = new ResolutionModeService({ getSystem: () => null });
  const mgr = makeManager(resolutionService);
  const normalized = mgr._normalizeSystem(system);
  mgr.systems.set(normalized.id, normalized);

  await mgr.updateSystem(normalized.id, { salvageResolutionMode: 'routed' });

  assert.ok(warnMessages.length > 0, 'At least one warn notification should be sent');
  const combined = warnMessages.join('\n');
  assert.ok(
    /Ore Fragment/i.test(combined) || /salvage/i.test(combined) || /incompatible/i.test(combined),
    `Notification should mention the disabled component. Got: ${combined}`
  );
});

// ---------------------------------------------------------------------------
// Group 2: Feature disable cleans up salvage runs
// ---------------------------------------------------------------------------

test('Salvage is always on: attempting to disable it keeps it enabled and preserves run history', async () => {
  const systemId = 'sys-cleanup';
  const runForThisSystem = { id: 'run-1', craftingSystemId: systemId, componentId: 'comp-1', status: 'succeeded' };
  const actor = makeActor('actor-1', [runForThisSystem]);

  const mgr = makeManager();
  mgr._getResolutionModeService = () => null;
  globalThis.game = {
    user: { isGM: true },
    actors: [actor]
  };

  // System starts with salvage enabled
  const normalized = mgr._normalizeSystem({
    id: systemId,
    name: 'Test',
    features: { salvage: true },
    salvageResolutionMode: 'simple',
    components: []
  });
  mgr.systems.set(normalized.id, normalized);

  // Salvage is always on, so an attempt to disable it is a no-op: the feature
  // stays true and no salvage-run cleanup is triggered.
  const updated = await mgr.updateSystem(systemId, { features: { salvage: false } });
  assert.equal(updated.features.salvage, true, 'salvage cannot be disabled');

  const stored = actor.getFlag('fabricate', 'fabricate.salvageRuns');
  assert.ok(stored, 'salvageRuns flag should be present');
  const history = stored.history || [];
  const remaining = history.filter(r => r.craftingSystemId === systemId);
  assert.equal(remaining.length, 1, 'Run history is preserved because salvage stays enabled');
});

test('Salvage is always on, so a feature update never removes runs from other systems', async () => {
  const systemId = 'sys-a';
  const otherSystemId = 'sys-b';
  const runForA = { id: 'run-a', craftingSystemId: systemId, componentId: 'comp-1', status: 'succeeded' };
  const runForB = { id: 'run-b', craftingSystemId: otherSystemId, componentId: 'comp-x', status: 'succeeded' };
  const actor = makeActor('actor-1', [runForA, runForB]);

  const mgr = makeManager();
  mgr._getResolutionModeService = () => null;
  globalThis.game = {
    user: { isGM: true },
    actors: [actor]
  };

  const normalized = mgr._normalizeSystem({
    id: systemId, name: 'System A', features: { salvage: true },
    salvageResolutionMode: 'simple', components: []
  });
  mgr.systems.set(normalized.id, normalized);

  await mgr.updateSystem(systemId, { features: { salvage: false } });

  const stored = actor.getFlag('fabricate', 'fabricate.salvageRuns');
  const history = stored?.history || [];
  const bRuns = history.filter(r => r.craftingSystemId === otherSystemId);
  assert.equal(bRuns.length, 1, 'Runs for other systems should NOT be removed');
});

test('A salvage feature update is a safe no-op when no actors exist', async () => {
  const systemId = 'sys-empty';
  const mgr = makeManager();
  mgr._getResolutionModeService = () => null;
  globalThis.game = {
    user: { isGM: true },
    actors: []
  };

  const normalized = mgr._normalizeSystem({
    id: systemId, name: 'Test', features: { salvage: true },
    salvageResolutionMode: 'simple', components: []
  });
  mgr.systems.set(normalized.id, normalized);

  // Should not throw
  await assert.doesNotReject(
    async () => mgr.updateSystem(systemId, { features: { salvage: false } }),
    'Should not throw when no actors exist'
  );
});

test('Salvage stays on, so a no-op feature update triggers no salvage-run flag writes', async () => {
  const systemId = 'sys-noop';
  const actor = makeActor('actor-1', []);
  actor._setFlagCalled = false;

  const mgr = makeManager();
  mgr._getResolutionModeService = () => null;
  globalThis.game = {
    user: { isGM: true },
    actors: [actor]
  };

  // Salvage is always on; an explicit `false` normalizes back to true, so this
  // update changes nothing salvage-related and writes no salvage-run flags.
  const normalized = mgr._normalizeSystem({
    id: systemId, name: 'Test', features: { salvage: false },
    salvageResolutionMode: 'simple', components: []
  });
  mgr.systems.set(normalized.id, normalized);

  await mgr.updateSystem(systemId, { features: { salvage: false } });

  assert.equal(actor._setFlagCalled, false, 'setFlag should NOT be called when salvage was already disabled');
});

// ---------------------------------------------------------------------------
// Group 3: Component deletion cleans up salvage runs
// ---------------------------------------------------------------------------

test('Deleting a component removes salvage run history referencing that component', async () => {
  const systemId = 'sys-del';
  const componentId = 'comp-to-delete';
  const runForComp = { id: 'run-1', craftingSystemId: systemId, componentId, status: 'succeeded' };
  const actor = makeActor('actor-1', [runForComp]);

  const mgr = makeManager();
  globalThis.game = {
    user: { isGM: true },
    actors: [actor]
  };
  mgr.recipeManager.getRecipes = () => [];

  const comp = {
    id: componentId, name: 'Deletable Component',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [] }
  };
  const normalized = mgr._normalizeSystem({
    id: systemId, name: 'Test', features: { salvage: true },
    salvageResolutionMode: 'simple', components: [comp]
  });
  mgr.systems.set(normalized.id, normalized);

  await mgr.deleteItem(systemId, componentId);

  const stored = actor.getFlag('fabricate', 'fabricate.salvageRuns');
  const history = stored?.history || [];
  const remaining = history.filter(r => r.componentId === componentId);
  assert.equal(remaining.length, 0, 'History entries for the deleted component should be removed');
});

test('Deleting a component does not remove runs for other components', async () => {
  const systemId = 'sys-del2';
  const componentId = 'comp-to-delete';
  const otherComponentId = 'comp-other';
  const runForDeleted = { id: 'run-del', craftingSystemId: systemId, componentId, status: 'succeeded' };
  const runForOther = { id: 'run-other', craftingSystemId: systemId, componentId: otherComponentId, status: 'succeeded' };
  const actor = makeActor('actor-1', [runForDeleted, runForOther]);

  const mgr = makeManager();
  globalThis.game = {
    user: { isGM: true },
    actors: [actor]
  };
  mgr.recipeManager.getRecipes = () => [];

  const comp = {
    id: componentId, name: 'Deletable',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [] }
  };
  const otherComp = {
    id: otherComponentId, name: 'Other',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [] }
  };
  const normalized = mgr._normalizeSystem({
    id: systemId, name: 'Test', features: { salvage: true },
    salvageResolutionMode: 'simple', components: [comp, otherComp]
  });
  mgr.systems.set(normalized.id, normalized);

  await mgr.deleteItem(systemId, componentId);

  const stored = actor.getFlag('fabricate', 'fabricate.salvageRuns');
  const history = stored?.history || [];
  const otherRuns = history.filter(r => r.componentId === otherComponentId);
  assert.equal(otherRuns.length, 1, 'Runs for other components should NOT be removed');
});

test('Deleting a component works when no salvageRuns flag exists on actor', async () => {
  const systemId = 'sys-del3';
  const componentId = 'comp-1';
  const actor = makeActor('actor-1', null); // no flag

  const mgr = makeManager();
  globalThis.game = {
    user: { isGM: true },
    actors: [actor]
  };
  mgr.recipeManager.getRecipes = () => [];

  const comp = {
    id: componentId, name: 'Iron Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [] }
  };
  const normalized = mgr._normalizeSystem({
    id: systemId, name: 'Test', features: { salvage: true },
    salvageResolutionMode: 'simple', components: [comp]
  });
  mgr.systems.set(normalized.id, normalized);

  await assert.doesNotReject(
    async () => mgr.deleteItem(systemId, componentId),
    'Should not throw when actor has no salvageRuns flag'
  );
});

test('Deleting a component works when history is empty', async () => {
  const systemId = 'sys-del4';
  const componentId = 'comp-1';
  const actor = makeActor('actor-1', []); // empty history
  actor._setFlagCalled = false;

  const mgr = makeManager();
  globalThis.game = {
    user: { isGM: true },
    actors: [actor]
  };
  mgr.recipeManager.getRecipes = () => [];

  const comp = {
    id: componentId, name: 'Iron Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [] }
  };
  const normalized = mgr._normalizeSystem({
    id: systemId, name: 'Test', features: { salvage: true },
    salvageResolutionMode: 'simple', components: [comp]
  });
  mgr.systems.set(normalized.id, normalized);

  await assert.doesNotReject(
    async () => mgr.deleteItem(systemId, componentId),
    'Should not throw when history is empty'
  );

  // setFlag should NOT be called since no history entries were removed
  assert.equal(actor._setFlagCalled, false, 'setFlag should NOT be called when history is already empty');
});
