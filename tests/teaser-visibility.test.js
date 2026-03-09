/**
 * Tests for teaser mode visibility logic in RecipeVisibilityService
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

global.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
global.game = { user: { name: 'Test User', isGM: false }, actors: [] };

const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSystem(overrides = {}) {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  return manager._normalizeSystem({
    id: 'sys-1',
    name: 'Test System',
    recipeVisibility: { listMode: 'teaser' },
    teaserConfig: { enabled: true, discoveryMode: 'threshold', fragments: [] },
    ...overrides
  });
}

function makeRecipe(overrides = {}) {
  return new Recipe({
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'sys-1',
    teaser: { enabled: true, hiddenFields: ['ingredients', 'results', 'description'], revealThreshold: 100 },
    resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }],
    ingredientSets: [{ id: 'is', ingredientGroups: [{ id: 'ig', options: [{ itemUuid: 'uuid', quantity: 1 }] }] }],
    ...overrides
  });
}

function makeService(system) {
  const recipeManager = { getRecipes: () => [] };
  const craftingSystemManager = { getSystem: () => system };
  return new RecipeVisibilityService(recipeManager, craftingSystemManager);
}

function makeActor(flags = {}) {
  const store = {};
  return {
    id: 'actor-1',
    isOwner: true,
    items: [],
    getFlag: (ns, key) => {
      const k = key.replace('fabricate.', '');
      return store[k] !== undefined ? store[k] : null;
    },
    setFlag: async (ns, key, value) => {
      const k = key.replace('fabricate.', '');
      store[k] = value;
    },
    _store: store,
    ...flags
  };
}

function makeActorWithProgress(recipeId, progress, fragments = []) {
  const store = {};
  // Pre-populate the discoveryProgress flag
  store['discoveryProgress'] = { [recipeId]: { progress, fragments, discoveredAt: null, manuallySet: false } };

  return {
    id: 'actor-1',
    isOwner: true,
    items: [],
    _store: store,
    getFlag: (ns, key) => {
      const k = key.replace('fabricate.', '');
      return store[k] !== undefined ? store[k] : null;
    },
    setFlag: async (ns, key, value) => {
      const k = key.replace('fabricate.', '');
      store[k] = value;
    }
  };
}

const gmViewer = { id: 'gm-1', isGM: true };
const playerViewer = { id: 'player-1', isGM: false };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Teaser visibility - existing modes unaffected', () => {
  it('global mode returns visible:true for player', () => {
    const system = makeSystem({ recipeVisibility: { listMode: 'global' } });
    const service = makeService(system);
    const recipe = makeRecipe({ teaser: { enabled: true } });
    const access = service.evaluateRecipeAccess({ recipe, viewer: playerViewer, craftingActor: makeActor() });
    assert.equal(access.visible, true);
    assert.equal(access.craftable, true);
  });

  it('player mode respects visibility restriction', () => {
    const system = makeSystem({ recipeVisibility: { listMode: 'player' } });
    const service = makeService(system);
    const recipe = makeRecipe({ visibility: { restricted: true, allowedUserIds: [] } });
    const access = service.evaluateRecipeAccess({ recipe, viewer: playerViewer, craftingActor: makeActor() });
    assert.equal(access.visible, false);
  });
});

describe('Teaser visibility - GM sees all recipes fully', () => {
  it('GM sees full recipe with no teaser masking', () => {
    const system = makeSystem();
    const service = makeService(system);
    const recipe = makeRecipe();
    const actor = makeActor();
    const access = service.evaluateRecipeAccess({ recipe, viewer: gmViewer, craftingActor: actor });
    assert.equal(access.visible, true);
    assert.equal(access.reason, 'ok');
    assert.equal(access.teaserState, undefined);
  });
});

describe('Teaser visibility - player with 0% progress', () => {
  it('recipe visible as teaser, not craftable, with 0% progress', () => {
    const system = makeSystem();
    const service = makeService(system);
    const recipe = makeRecipe();
    const actor = makeActor(); // no discoveryProgress flags
    const access = service.evaluateRecipeAccess({ recipe, viewer: playerViewer, craftingActor: actor });
    assert.equal(access.visible, true);
    assert.equal(access.craftable, false);
    assert.equal(access.reason, 'teaser');
    assert.ok(access.teaserState);
    assert.equal(access.teaserState.isTeaser, true);
    assert.equal(access.teaserState.progress, 0);
  });
});

describe('Teaser visibility - player with partial progress', () => {
  it('visible as teaser with correct progress percentage', () => {
    const system = makeSystem();
    const service = makeService(system);
    const recipe = makeRecipe();
    const actor = makeActorWithProgress('recipe-1', 45);
    const access = service.evaluateRecipeAccess({ recipe, viewer: playerViewer, craftingActor: actor });
    assert.equal(access.visible, true);
    assert.equal(access.craftable, false);
    assert.equal(access.reason, 'teaser');
    assert.equal(access.teaserState.progress, 45);
    assert.equal(access.teaserState.isTeaser, true);
  });
});

describe('Teaser visibility - player at 100% progress', () => {
  it('fully visible and craftable at threshold', () => {
    const system = makeSystem();
    const service = makeService(system);
    const recipe = makeRecipe({ teaser: { enabled: true, hiddenFields: ['ingredients'], revealThreshold: 100 } });
    const actor = makeActorWithProgress('recipe-1', 100);
    const access = service.evaluateRecipeAccess({ recipe, viewer: playerViewer, craftingActor: actor });
    assert.equal(access.visible, true);
    assert.equal(access.craftable, true);
    assert.equal(access.reason, 'teaser-discovered');
  });
});

describe('Teaser visibility - recipe with teaser.enabled=false', () => {
  it('fully visible even in teaser mode when recipe opts out', () => {
    const system = makeSystem();
    const service = makeService(system);
    const recipe = makeRecipe({ teaser: { enabled: false, hiddenFields: [], revealThreshold: 100 } });
    const actor = makeActor();
    const access = service.evaluateRecipeAccess({ recipe, viewer: playerViewer, craftingActor: actor });
    assert.equal(access.visible, true);
    assert.equal(access.craftable, true);
    assert.equal(access.reason, 'ok');
  });
});

describe('Teaser visibility - custom revealThreshold', () => {
  it('recipe unlocks at 50% threshold, not 100%', () => {
    const system = makeSystem();
    const service = makeService(system);
    const recipe = makeRecipe({ teaser: { enabled: true, hiddenFields: ['description'], revealThreshold: 50 } });
    const actor = makeActorWithProgress('recipe-1', 50);
    const access = service.evaluateRecipeAccess({ recipe, viewer: playerViewer, craftingActor: actor });
    assert.equal(access.visible, true);
    assert.equal(access.craftable, true);
    assert.equal(access.reason, 'teaser-discovered');
  });

  it('recipe stays as teaser below 50% threshold', () => {
    const system = makeSystem();
    const service = makeService(system);
    const recipe = makeRecipe({ teaser: { enabled: true, hiddenFields: ['description'], revealThreshold: 50 } });
    const actor = makeActorWithProgress('recipe-1', 49);
    const access = service.evaluateRecipeAccess({ recipe, viewer: playerViewer, craftingActor: actor });
    assert.equal(access.craftable, false);
    assert.equal(access.reason, 'teaser');
  });
});

describe('Teaser visibility - setDiscoveryProgress', () => {
  it('updates actor flags correctly', async () => {
    const system = makeSystem();
    const service = makeService(system);
    const actor = makeActor();
    await service.setDiscoveryProgress(actor, 'recipe-1', 75);

    // Read back what was stored
    const stored = actor.getFlag('fabricate', 'fabricate.discoveryProgress');
    assert.ok(stored);
    assert.equal(stored['recipe-1'].progress, 75);
    assert.equal(stored['recipe-1'].manuallySet, true);
  });
});

describe('Teaser visibility - discoverFragment', () => {
  it('adds fragment to actor and updates progress for linked recipes', async () => {
    const system = makeSystem({
      teaserConfig: {
        enabled: true,
        discoveryMode: 'fragments',
        fragments: [
          { id: 'frag-1', name: 'Fragment', linkedItemUuid: 'uuid-item-1', recipeIds: ['recipe-1'], progressValue: 30 }
        ]
      }
    });
    const service = makeService(system);
    const actor = makeActor();
    await service.discoverFragment(actor, 'frag-1', system);

    const stored = actor.getFlag('fabricate', 'fabricate.discoveryProgress');
    assert.ok(stored?.['recipe-1']);
    // Fragment membership stored in fragments[], effective progress computed on read
    assert.ok(stored['recipe-1'].fragments.includes('frag-1'));
    assert.equal(service._computeEffectiveProgress(actor, 'recipe-1', system), 30);
  });

  it('contributes to multiple recipes', async () => {
    const system = makeSystem({
      teaserConfig: {
        enabled: true,
        discoveryMode: 'fragments',
        fragments: [
          { id: 'frag-1', name: 'Fragment', linkedItemUuid: 'uuid-item-1', recipeIds: ['recipe-1', 'recipe-2'], progressValue: 25 }
        ]
      }
    });
    const service = makeService(system);
    const actor = makeActor();
    await service.discoverFragment(actor, 'frag-1', system);

    const stored = actor.getFlag('fabricate', 'fabricate.discoveryProgress');
    // Fragment progress is computed on read via _computeEffectiveProgress;
    // flags store the fragments[] membership, not the computed total.
    assert.ok(stored['recipe-1'].fragments.includes('frag-1'));
    assert.ok(stored['recipe-2'].fragments.includes('frag-1'));
    // Effective progress should be 25 for each
    assert.equal(service._computeEffectiveProgress(actor, 'recipe-1', system), 25);
    assert.equal(service._computeEffectiveProgress(actor, 'recipe-2', system), 25);
  });

  it('is idempotent — no double-counting', async () => {
    const system = makeSystem({
      teaserConfig: {
        enabled: true,
        discoveryMode: 'fragments',
        fragments: [
          { id: 'frag-1', name: 'Fragment', linkedItemUuid: 'uuid-item-1', recipeIds: ['recipe-1'], progressValue: 30 }
        ]
      }
    });
    const service = makeService(system);
    const actor = makeActor();
    await service.discoverFragment(actor, 'frag-1', system);
    await service.discoverFragment(actor, 'frag-1', system); // second time — should be no-op

    // Fragment ID should appear only once in the array
    const stored = actor.getFlag('fabricate', 'fabricate.discoveryProgress');
    const fragList = stored['recipe-1'].fragments;
    assert.equal(fragList.filter(f => f === 'frag-1').length, 1);
    // Effective progress is still 30, not 60
    assert.equal(service._computeEffectiveProgress(actor, 'recipe-1', system), 30);
  });

  it('auto-transitions to discovered when threshold is met', async () => {
    const system = makeSystem({
      teaserConfig: {
        enabled: true,
        discoveryMode: 'fragments',
        fragments: [
          { id: 'frag-1', name: 'Fragment', linkedItemUuid: 'uuid-item-1', recipeIds: ['recipe-1'], progressValue: 100 }
        ]
      }
    });
    const service = makeService(system);
    const actor = makeActor();

    // Set up a recipe with revealThreshold: 100 in the recipeManager
    const recipe = makeRecipe();
    service.recipeManager.getRecipe = () => recipe;

    await service.discoverFragment(actor, 'frag-1', system);

    const stored = actor.getFlag('fabricate', 'fabricate.discoveryProgress');
    // effective progress is 100 (fragment contribution)
    assert.equal(service._computeEffectiveProgress(actor, 'recipe-1', system), 100);
    // discoveredAt should be set because 100 >= revealThreshold 100
    assert.ok(stored['recipe-1'].discoveredAt !== null);
  });
});

describe('Teaser visibility - getDiscoveryProgressForActor', () => {
  it('returns correct progress map for an actor', async () => {
    const system = makeSystem();
    const service = makeService(system);
    const actor = makeActor();
    await service.setDiscoveryProgress(actor, 'recipe-1', 50);
    await service.setDiscoveryProgress(actor, 'recipe-2', 75);

    const progressMap = service.getDiscoveryProgressForActor(actor, 'sys-1');
    assert.ok(progressMap);
    assert.equal(progressMap['recipe-1'].progress, 50);
    assert.equal(progressMap['recipe-2'].progress, 75);
  });
});
