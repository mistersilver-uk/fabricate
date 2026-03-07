import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal FoundryVTT globals
globalThis.foundry = {
  utils: { randomID: () => Math.random().toString(36).slice(2) }
};
globalThis.game = {
  user: { isGM: true },
  system: { id: 'dnd5e' },
  actors: [],
  fabricate: null
};
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { CraftingCheckAdapter, Dnd5eCraftingCheckAdapter, CraftingCheckAdapterRegistry } = await import('../src/systems/CraftingCheckAdapter.js');
const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

// Helper: make a minimal manager
function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ───────────────────────────────────────────────────────────
// Serialization / Normalization Tests
// ───────────────────────────────────────────────────────────

test('_normalizeCraftingCheck with checkSource: builtIn preserves builtIn config', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({
    checkSource: 'builtIn',
    builtIn: { ability: 'INT', skill: 'arc', dc: 20, advantage: 'advantage' }
  });
  assert.equal(result.checkSource, 'builtIn');
  assert.equal(result.builtIn.ability, 'int');
  assert.equal(result.builtIn.skill, 'arc');
  assert.equal(result.builtIn.dc, 20);
  assert.equal(result.builtIn.advantage, 'advantage');
});

test('_normalizeCraftingCheck with missing checkSource defaults to macro', () => {
  const mgr = makeManager();
  const result = mgr._normalizeCraftingCheck({ macroUuid: 'uuid-123' });
  assert.equal(result.checkSource, 'macro');
});

test('_normalizeBuiltInCheck with invalid dc defaults to 15', () => {
  const mgr = makeManager();
  const result = mgr._normalizeBuiltInCheck({ dc: 'not-a-number' });
  assert.equal(result.dc, 15);
});

test('_normalizeBuiltInCheck with dc of 0 defaults to 15', () => {
  const mgr = makeManager();
  const result = mgr._normalizeBuiltInCheck({ dc: 0 });
  assert.equal(result.dc, 15);
});

test('_normalizeBuiltInCheck with invalid advantage defaults to normal', () => {
  const mgr = makeManager();
  const result = mgr._normalizeBuiltInCheck({ advantage: 'superadvantage' });
  assert.equal(result.advantage, 'normal');
});

test('_normalizeBuiltInCheck with empty ability normalizes to empty string', () => {
  const mgr = makeManager();
  const result = mgr._normalizeBuiltInCheck({ ability: '' });
  assert.equal(result.ability, '');
});

// ───────────────────────────────────────────────────────────
// Adapter Tests
// ───────────────────────────────────────────────────────────

test('CraftingCheckAdapterRegistry.get returns null for unknown system', () => {
  // Use a fresh isolated registry test (unknown system)
  const adapter = CraftingCheckAdapterRegistry.get('unknown-system-xyz');
  assert.equal(adapter, null);
});

test('CraftingCheckAdapterRegistry.has returns true after registration', () => {
  CraftingCheckAdapterRegistry.register('test-system-abc', Dnd5eCraftingCheckAdapter);
  assert.equal(CraftingCheckAdapterRegistry.has('test-system-abc'), true);
});

test('Dnd5eCraftingCheckAdapter.getAbilities returns correct ability list', () => {
  const adapter = new Dnd5eCraftingCheckAdapter();
  const abilities = adapter.getAbilities();
  assert.ok(Array.isArray(abilities));
  const keys = abilities.map(a => a.key);
  assert.ok(keys.includes('str'));
  assert.ok(keys.includes('dex'));
  assert.ok(keys.includes('con'));
  assert.ok(keys.includes('int'));
  assert.ok(keys.includes('wis'));
  assert.ok(keys.includes('cha'));
  assert.equal(abilities.length, 6);
});

test('Dnd5eCraftingCheckAdapter.getSkills returns correct skill list', () => {
  const adapter = new Dnd5eCraftingCheckAdapter();
  const skills = adapter.getSkills();
  assert.ok(Array.isArray(skills));
  const keys = skills.map(s => s.key);
  assert.ok(keys.includes('arc'));
  assert.ok(keys.includes('nat'));
  assert.ok(keys.includes('med'));
  assert.ok(skills.length >= 3);
});

test('Dnd5eCraftingCheckAdapter.executeCheck returns pass when roll >= dc', async () => {
  const adapter = new Dnd5eCraftingCheckAdapter();
  const actor = { rollAbilityCheck: async () => ({ total: 18 }) };
  const result = await adapter.executeCheck(actor, { ability: 'int', skill: '', dc: 15, advantage: 'normal' });
  assert.equal(result.success, true);
  assert.equal(result.value, 18);
  assert.equal(result.outcome, 'pass');
});

test('Dnd5eCraftingCheckAdapter.executeCheck returns fail when roll < dc', async () => {
  const adapter = new Dnd5eCraftingCheckAdapter();
  const actor = { rollAbilityCheck: async () => ({ total: 8 }) };
  const result = await adapter.executeCheck(actor, { ability: 'str', skill: '', dc: 15, advantage: 'normal' });
  assert.equal(result.success, false);
  assert.equal(result.value, 8);
  assert.equal(result.outcome, 'fail');
});

// ───────────────────────────────────────────────────────────
// Engine Integration Tests
// ───────────────────────────────────────────────────────────

function makeEngine(systemOverride = {}) {
  const system = {
    id: 'sys-1',
    resolutionMode: 'tiered',
    advancedOptionsEnabled: true,
    features: { craftingChecks: true },
    craftingCheck: {
      enabled: true,
      macroUuid: 'macro-uuid-1',
      checkSource: 'macro',
      builtIn: { ability: 'int', skill: '', dc: 15, advantage: 'normal' },
      outcomes: ['low', 'high'],
      consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false },
      progressive: { awardMode: 'equal', allowPlayerReorder: false }
    },
    ...systemOverride
  };
  const systemManager = {
    getSystem: () => system
  };
  const resolutionService = {
    getMode: () => system.resolutionMode
  };
  const recipeManager = {};
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  globalThis.game = {
    ...globalThis.game,
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => resolutionService
    }
  };
  return { engine, system };
}

test('_runCraftingCheck with checkSource macro calls MacroExecutor', async () => {
  const { engine } = makeEngine({ craftingCheck: {
    enabled: true, checkSource: 'macro', macroUuid: 'macro-uuid-1',
    builtIn: { ability: 'int', skill: '', dc: 15, advantage: 'normal' },
    outcomes: ['fail', 'pass'],
    consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false },
    progressive: { awardMode: 'equal', allowPlayerReorder: false }
  }});

  // Temporarily override the module-level MacroExecutor via dynamic import is not easy,
  // so we test indirectly: with macroUuid set and checkSource=macro, the engine should try macro.
  // MacroExecutor.run is not importable directly here, so we patch via prototype access.
  const { MacroExecutor } = await import('../src/utils/MacroExecutor.js');
  let called = false;
  const origRun = MacroExecutor.run;
  MacroExecutor.run = async () => { called = true; return { success: true, outcome: 'pass', value: 18 }; };

  const recipe = { craftingSystemId: 'sys-1', getExecutionSteps: () => [] };
  const actor = { id: 'a1', name: 'Crafter', items: [] };
  const result = await engine._runCraftingCheck(recipe, actor, [actor], null);

  MacroExecutor.run = origRun;
  assert.equal(called, true, 'Expected MacroExecutor.run to be called');
  assert.equal(result.success, true);
});

test('_runCraftingCheck with checkSource builtIn calls adapter', async () => {
  const { engine } = makeEngine({ craftingCheck: {
    enabled: true, checkSource: 'builtIn', macroUuid: null,
    builtIn: { ability: 'int', skill: '', dc: 10, advantage: 'normal' },
    outcomes: ['fail', 'pass'],
    consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false },
    progressive: { awardMode: 'equal', allowPlayerReorder: false }
  }});

  // Register a dnd5e adapter that returns a known result
  CraftingCheckAdapterRegistry.register('dnd5e', class extends CraftingCheckAdapter {
    async executeCheck(actor, config) {
      return { success: true, outcome: 'pass', value: 15, data: {} };
    }
  });
  globalThis.game.system = { id: 'dnd5e' };

  const recipe = { craftingSystemId: 'sys-1', getExecutionSteps: () => [] };
  const actor = { id: 'a1', name: 'Crafter', items: [] };
  const result = await engine._runCraftingCheck(recipe, actor, [actor], null);

  assert.equal(result.success, true);
  assert.equal(result.outcome, 'pass');
  assert.equal(result.value, 15);
});

test('_runCraftingCheck with checkSource builtIn and no adapter returns error', async () => {
  const { engine } = makeEngine({ craftingCheck: {
    enabled: true, checkSource: 'builtIn', macroUuid: null,
    builtIn: { ability: 'str', skill: '', dc: 15, advantage: 'normal' },
    outcomes: ['fail', 'pass'],
    consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false },
    progressive: { awardMode: 'equal', allowPlayerReorder: false }
  }});

  // Temporarily set game system to an unknown id
  const origSystem = globalThis.game.system;
  globalThis.game.system = { id: 'pf1e-unknown' };

  const recipe = { craftingSystemId: 'sys-1', getExecutionSteps: () => [] };
  const actor = { id: 'a1', name: 'Crafter', items: [] };
  const result = await engine._runCraftingCheck(recipe, actor, [actor], null);

  globalThis.game.system = origSystem;
  assert.equal(result.success, false);
  assert.ok(result.message.includes('No system adapter available'));
});

test('_runCraftingCheck with builtIn adapter error returns failure', async () => {
  const { engine } = makeEngine({ craftingCheck: {
    enabled: true, checkSource: 'builtIn', macroUuid: null,
    builtIn: { ability: 'int', skill: '', dc: 15, advantage: 'normal' },
    outcomes: ['fail', 'pass'],
    consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false },
    progressive: { awardMode: 'equal', allowPlayerReorder: false }
  }});

  CraftingCheckAdapterRegistry.register('dnd5e-err', class extends CraftingCheckAdapter {
    async executeCheck() { throw new Error('roll dialog cancelled'); }
  });
  globalThis.game.system = { id: 'dnd5e-err' };

  const recipe = { craftingSystemId: 'sys-1', getExecutionSteps: () => [] };
  const actor = { id: 'a1', name: 'Crafter', items: [] };
  const result = await engine._runCraftingCheck(recipe, actor, [actor], null);

  globalThis.game.system = { id: 'dnd5e' };
  assert.equal(result.success, false);
  assert.ok(result.message.includes('roll dialog cancelled'));
});

test('backward compat: system without checkSource uses macro path', async () => {
  const { engine } = makeEngine({ craftingCheck: {
    enabled: true, macroUuid: 'old-macro-uuid',
    // no checkSource field -- should default to 'macro'
    builtIn: { ability: '', skill: '', dc: 15, advantage: 'normal' },
    outcomes: ['fail', 'pass'],
    consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false },
    progressive: { awardMode: 'equal', allowPlayerReorder: false }
  }});

  const { MacroExecutor } = await import('../src/utils/MacroExecutor.js');
  let called = false;
  const origRun = MacroExecutor.run;
  MacroExecutor.run = async () => { called = true; return { success: true }; };

  const recipe = { craftingSystemId: 'sys-1', getExecutionSteps: () => [] };
  const actor = { id: 'a1', name: 'Crafter', items: [] };
  await engine._runCraftingCheck(recipe, actor, [actor], null);

  MacroExecutor.run = origRun;
  assert.equal(called, true, 'Expected macro path when checkSource missing');
});

// ───────────────────────────────────────────────────────────
// ResolutionModeService Tests
// ───────────────────────────────────────────────────────────

function makeResolutionService(systemOverride = {}) {
  const system = {
    id: 'sys-res',
    resolutionMode: 'tiered',
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      checkSource: 'builtIn',
      outcomes: ['low', 'high']
    },
    ...systemOverride
  };
  const systemManager = { getSystem: () => system };
  const service = new ResolutionModeService(systemManager);
  return service;
}

test('validateRecipe accepts checkSource builtIn as valid for tiered mode', () => {
  const service = makeResolutionService({ resolutionMode: 'tiered' });
  const recipe = {
    craftingSystemId: 'sys-res',
    getExecutionSteps: () => [{
      id: 'step-1', name: 'Step 1',
      ingredientSets: [{ id: 'is1', ingredients: [], catalysts: [], resultGroupId: 'rg1' }],
      resultGroups: [{ id: 'rg1', results: [] }]
    }]
  };
  const result = service.validateRecipe(recipe);
  const tieredErrors = result.errors.filter(e => e.includes('crafting checks'));
  assert.equal(tieredErrors.length, 0, `Expected no check-enabled errors, got: ${tieredErrors.join(', ')}`);
});

test('validateRecipe accepts checkSource builtIn as valid for progressive mode', () => {
  const service = makeResolutionService({ resolutionMode: 'progressive' });
  const recipe = {
    craftingSystemId: 'sys-res',
    getExecutionSteps: () => [{
      id: 'step-1', name: 'Step 1',
      ingredientSets: [{ id: 'is1', ingredients: [], catalysts: [] }],
      resultGroups: [{ id: 'rg1', results: [] }]
    }]
  };
  const result = service.validateRecipe(recipe);
  const checkErrors = result.errors.filter(e => e.includes('crafting checks'));
  assert.equal(checkErrors.length, 0, `Expected no check-enabled errors, got: ${checkErrors.join(', ')}`);
});
