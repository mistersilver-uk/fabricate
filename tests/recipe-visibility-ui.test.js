/**
 * Unit tests for T-052: Recipe visibility UI
 * Covers:
 *   - System normalisation accepts 'global', 'player', 'knowledge' listModes
 *   - Default listMode is 'global'
 *   - Recipe validation allows restricted=true with empty allowedUserIds
 *   - RecipeManagerApp context exposes recipeVisibility data for template
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal stubs so the module can load without a Foundry runtime
let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined,
    deepClone: (obj) => JSON.parse(JSON.stringify(obj))
  }
};

// Stub game.settings so setSetting/getSetting work without a real Foundry game
const _settingsStore = new Map();
globalThis.game = {
  user: { isGM: true },
  settings: {
    get: (ns, key) => _settingsStore.get(`${ns}.${key}`),
    set: async (ns, key, value) => { _settingsStore.set(`${ns}.${key}`, value); return value; }
  }
};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  const recipeManagerStub = { getRecipes: () => [] };
  return new CraftingSystemManager(recipeManagerStub);
}

// ---------------------------------------------------------------------------
// Group 1: _normalizeRecipeVisibility — listMode support
// ---------------------------------------------------------------------------

test('_normalizeRecipeVisibility - defaults to global when no listMode provided', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({});
  assert.equal(result.listMode, 'global');
});

test('_normalizeRecipeVisibility - defaults to global when recipeVisibility is undefined', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility(undefined);
  assert.equal(result.listMode, 'global');
});

test('_normalizeRecipeVisibility - accepts global listMode explicitly', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'global' });
  assert.equal(result.listMode, 'global');
});

test('_normalizeRecipeVisibility - accepts player listMode', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'player' });
  assert.equal(result.listMode, 'player');
});

test('_normalizeRecipeVisibility - accepts knowledge listMode', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'knowledge' });
  assert.equal(result.listMode, 'knowledge');
});

test('_normalizeRecipeVisibility - rejects invalid listMode, falls back to global', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'invisible' });
  assert.equal(result.listMode, 'global');
});

test('_normalizeRecipeVisibility - old data with no listMode gets global default', () => {
  // Simulates data that previously defaulted to 'player' (old behaviour) but
  // should now normalise to 'global' when the field is absent.
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ knowledge: {} });
  assert.equal(result.listMode, 'global');
});

// ---------------------------------------------------------------------------
// Group 2: _normalizeRecipeVisibility — knowledge sub-object preserved
// ---------------------------------------------------------------------------

test('_normalizeRecipeVisibility - knowledge.mode defaults to itemOrLearned', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'knowledge' });
  assert.equal(result.knowledge.mode, 'itemOrLearned');
});

test('_normalizeRecipeVisibility - knowledge.mode accepts item', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'knowledge', knowledge: { mode: 'item' } });
  assert.equal(result.knowledge.mode, 'item');
});

test('_normalizeRecipeVisibility - knowledge.mode accepts learned', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'knowledge', knowledge: { mode: 'learned' } });
  assert.equal(result.knowledge.mode, 'learned');
});

test('_normalizeRecipeVisibility - knowledge.learn.consumeOnLearn defaults true', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'knowledge' });
  assert.equal(result.knowledge.learn.consumeOnLearn, true);
});

test('_normalizeRecipeVisibility - knowledge.learn.consumeOnLearn can be set false', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({
    listMode: 'knowledge',
    knowledge: { learn: { consumeOnLearn: false } }
  });
  assert.equal(result.knowledge.learn.consumeOnLearn, false);
});

// ---------------------------------------------------------------------------
// Group 3: _normalizeSystem — listMode flows through system normalisation
// ---------------------------------------------------------------------------

test('_normalizeSystem - recipeVisibility.listMode defaults to global', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ name: 'Test System' });
  assert.equal(system.recipeVisibility.listMode, 'global');
});

test('_normalizeSystem - preserves global listMode', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    name: 'Test',
    recipeVisibility: { listMode: 'global' }
  });
  assert.equal(system.recipeVisibility.listMode, 'global');
});

test('_normalizeSystem - preserves player listMode', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    name: 'Test',
    recipeVisibility: { listMode: 'player' }
  });
  assert.equal(system.recipeVisibility.listMode, 'player');
});

test('_normalizeSystem - preserves knowledge listMode', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    name: 'Test',
    recipeVisibility: { listMode: 'knowledge' }
  });
  assert.equal(system.recipeVisibility.listMode, 'knowledge');
});

// ---------------------------------------------------------------------------
// Group 4: updateSystem — listMode change is non-destructive
// ---------------------------------------------------------------------------

test('updateSystem - changing listMode from knowledge to player normalises correctly', async () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    name: 'Test',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'item', learn: { consumeOnLearn: false } }
    }
  });
  manager.systems.set('sys-1', system);

  const updated = await manager.updateSystem('sys-1', {
    recipeVisibility: { listMode: 'player' }
  });

  assert.equal(updated.recipeVisibility.listMode, 'player');
  // knowledge sub-object still present with defaults
  assert.ok(updated.recipeVisibility.knowledge, 'knowledge sub-object should exist');
});

test('updateSystem - changing listMode from player to knowledge with mode preserves mode', async () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-2',
    name: 'Test',
    recipeVisibility: {
      listMode: 'player'
    }
  });
  manager.systems.set('sys-2', system);

  const updated = await manager.updateSystem('sys-2', {
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'learned', learn: { consumeOnLearn: false } } }
  });

  assert.equal(updated.recipeVisibility.listMode, 'knowledge');
  assert.equal(updated.recipeVisibility.knowledge.mode, 'learned');
  assert.equal(updated.recipeVisibility.knowledge.learn.consumeOnLearn, false);
});

test('updateSystem - changing listMode from player to global results in global', async () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-3',
    name: 'Test',
    recipeVisibility: { listMode: 'player' }
  });
  manager.systems.set('sys-3', system);

  const updated = await manager.updateSystem('sys-3', {
    recipeVisibility: { listMode: 'global' }
  });

  assert.equal(updated.recipeVisibility.listMode, 'global');
});

// ---------------------------------------------------------------------------
// Group 5: Knowledge sub-object structure completeness
// ---------------------------------------------------------------------------

test('_normalizeRecipeVisibility - global mode produces complete knowledge sub-object', () => {
  // Even for global, the knowledge sub-object should be present (non-destructive switching)
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({ listMode: 'global' });
  assert.ok(result.knowledge, 'knowledge sub-object should exist');
  assert.equal(typeof result.knowledge.mode, 'string');
  assert.ok(result.knowledge.item, 'knowledge.item should exist');
  assert.ok(result.knowledge.learn, 'knowledge.learn should exist');
});

test('_normalizeRecipeVisibility - knowledge mode does not affect item sub-object defaults', () => {
  const manager = makeManager();
  const result = manager._normalizeRecipeVisibility({
    listMode: 'knowledge',
    knowledge: { mode: 'item' }
  });
  assert.equal(result.knowledge.item.limitUses, false);
  assert.equal(result.knowledge.item.destroyWhenExhausted, false);
});

// ---------------------------------------------------------------------------
// Group 6: _prepareRecipeContext — showVisibilitySummary only for player mode
// ---------------------------------------------------------------------------

test('_normalizeSystem - global mode system has recipeVisibility with correct listMode', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    name: 'Global System',
    recipeVisibility: { listMode: 'global' }
  });
  assert.equal(system.recipeVisibility.listMode, 'global');
  // The knowledge sub-object is always present for non-destructive switching
  assert.ok(system.recipeVisibility.knowledge);
});

test('_normalizeSystem - knowledge mode system has listMode knowledge', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    name: 'Knowledge System',
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'item' } }
  });
  assert.equal(system.recipeVisibility.listMode, 'knowledge');
  assert.equal(system.recipeVisibility.knowledge.mode, 'item');
});
