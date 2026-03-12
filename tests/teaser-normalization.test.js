/**
 * Tests for teaser mode normalization in Recipe and CraftingSystemManager
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Minimal mock for foundry global
global.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
global.game = { user: { name: 'Test User' } };

const { Recipe } = await import('../src/models/Recipe.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

// Minimal RecipeManager stub for CraftingSystemManager
function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ─── Recipe._normalizeTeaser ────────────────────────────────────────────────

describe('Recipe._normalizeTeaser', () => {
  it('produces correct defaults when teaser is undefined', () => {
    const recipe = new Recipe({ name: 'Test', resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }] });
    assert.deepEqual(recipe.teaser, {
      enabled: true,
      hiddenFields: ['ingredients', 'results', 'description'],
      revealThreshold: 100,
      teaserDescription: ''
    });
  });

  it('produces correct defaults when teaser is null', () => {
    const recipe = new Recipe({ name: 'Test', teaser: null, resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }] });
    assert.deepEqual(recipe.teaser, {
      enabled: true,
      hiddenFields: ['ingredients', 'results', 'description'],
      revealThreshold: 100,
      teaserDescription: ''
    });
  });

  it('accepts custom hiddenFields', () => {
    const recipe = new Recipe({ name: 'Test', teaser: { hiddenFields: ['description', 'catalysts'] }, resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }] });
    assert.deepEqual(recipe.teaser.hiddenFields, ['description', 'catalysts']);
  });

  it('filters out invalid hiddenFields values', () => {
    const recipe = new Recipe({ name: 'Test', teaser: { hiddenFields: ['ingredients', 'invalid-field', 'RESULTS'] }, resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }] });
    assert.deepEqual(recipe.teaser.hiddenFields, ['ingredients']);
  });

  it('clamps revealThreshold to 0-100', () => {
    const r1 = new Recipe({ name: 'T', teaser: { revealThreshold: 150 }, resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }] });
    assert.equal(r1.teaser.revealThreshold, 100);
    const r2 = new Recipe({ name: 'T', teaser: { revealThreshold: -10 }, resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }] });
    assert.equal(r2.teaser.revealThreshold, 0);
    const r3 = new Recipe({ name: 'T', teaser: { revealThreshold: 50 }, resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }] });
    assert.equal(r3.teaser.revealThreshold, 50);
  });

  it('round-trips through toJSON/fromJSON', () => {
    const original = new Recipe({
      name: 'Test',
      teaser: { enabled: false, hiddenFields: ['essences'], revealThreshold: 75, teaserDescription: 'Hint text' },
      resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }]
    });
    const json = original.toJSON();
    assert.ok(json.teaser, 'teaser should be in toJSON output');
    const restored = Recipe.fromJSON(json);
    assert.deepEqual(restored.teaser, {
      enabled: false,
      hiddenFields: ['essences'],
      revealThreshold: 75,
      teaserDescription: 'Hint text'
    });
  });
});

// ─── CraftingSystemManager._normalizeTeaserConfig ───────────────────────────

describe('CraftingSystemManager._normalizeTeaserConfig', () => {
  it('produces correct defaults when teaserConfig is undefined', () => {
    const manager = makeManager();
    const system = manager._normalizeSystem({ name: 'Test' });
    assert.deepEqual(system.teaserConfig, { enabled: false, discoveryMode: 'threshold', fragments: [] });
  });

  it('accepts valid discoveryMode values', () => {
    const manager = makeManager();
    for (const mode of ['threshold', 'fragments', 'both']) {
      const system = manager._normalizeSystem({ name: 'Test', teaserConfig: { enabled: true, discoveryMode: mode } });
      assert.equal(system.teaserConfig.discoveryMode, mode);
    }
  });

  it('falls back to threshold for invalid discoveryMode', () => {
    const manager = makeManager();
    const system = manager._normalizeSystem({ name: 'Test', teaserConfig: { discoveryMode: 'invalid' } });
    assert.equal(system.teaserConfig.discoveryMode, 'threshold');
  });

  it('normalizes fragment entries', () => {
    const manager = makeManager();
    const system = manager._normalizeSystem({
      name: 'Test',
      teaserConfig: {
        enabled: true,
        discoveryMode: 'fragments',
        fragments: [
          { id: 'frag-1', name: 'Scroll Fragment', linkedItemUuid: 'Compendium.world.items.abc', recipeIds: ['r1', 'r2'], progressValue: 25 }
        ]
      }
    });
    assert.equal(system.teaserConfig.fragments.length, 1);
    const frag = system.teaserConfig.fragments[0];
    assert.equal(frag.id, 'frag-1');
    assert.equal(frag.name, 'Scroll Fragment');
    assert.equal(frag.linkedItemUuid, 'Compendium.world.items.abc');
    assert.deepEqual(frag.recipeIds, ['r1', 'r2']);
    assert.equal(frag.progressValue, 25);
  });

  it('clamps fragment progressValue to 0-100', () => {
    const manager = makeManager();
    const system = manager._normalizeSystem({
      name: 'Test',
      teaserConfig: {
        enabled: true,
        discoveryMode: 'fragments',
        fragments: [
          { id: 'f1', progressValue: 200 },
          { id: 'f2', progressValue: -5 }
        ]
      }
    });
    assert.equal(system.teaserConfig.fragments[0].progressValue, 100);
    assert.equal(system.teaserConfig.fragments[1].progressValue, 0);
  });

  it("accepts 'teaser' as a valid recipeVisibility listMode", () => {
    const manager = makeManager();
    const system = manager._normalizeSystem({ name: 'Test', recipeVisibility: { listMode: 'teaser' } });
    assert.equal(system.recipeVisibility.listMode, 'teaser');
  });
});

describe('CraftingSystemManager._normalizeSystem', () => {
  it('omits the system-level difficulty object', () => {
    const manager = makeManager();
    const system = manager._normalizeSystem({ name: 'No Difficulty' });
    assert.equal(Object.prototype.hasOwnProperty.call(system, 'difficulty'), false);
  });
});
