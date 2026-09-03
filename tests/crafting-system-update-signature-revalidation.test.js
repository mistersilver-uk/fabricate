/**
 * #99 — `CraftingSystemManager.updateSystem` revalidates alchemy ingredient signature
 * uniqueness (spec 007 §"Alchemy Uniqueness Revalidation"). Editing an already-alchemy
 * system so that its component list introduces a signature collision must BLOCK the save
 * (throw) BEFORE persisting, leaving the prior system state intact. A non-alchemy system
 * update must not run signature validation at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: () => undefined,
  },
};
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };

const settingsStore = new Map();
globalThis.game = {
  user: { isGM: true },
  actors: [],
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    },
  },
};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { SignatureValidator } = await import('../src/systems/SignatureValidator.js');

// A recipe whose single ingredient group is satisfied by any component carrying the given
// tag (the alchemy engine infers the recipe from submitted ingredients, so two recipes whose
// tag groups expand to an overlapping component set collide).
function tagRecipe(id, name, tags) {
  return {
    id,
    name,
    craftingSystemId: 'sys-1',
    enabled: true,
    ingredientSets: [
      {
        id: `${id}-set`,
        essences: {},
        ingredientGroups: [
          { id: `${id}-grp`, name: 'Ingredients', options: [{ match: { type: 'tags', tags } }] },
        ],
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-r`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
  };
}

function makeRecipeManager(recipes = []) {
  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return recipes.filter((recipe) => recipe.craftingSystemId === filters.craftingSystemId);
      }
      return recipes;
    },
    async disableSignatureConflicts() {
      return [];
    },
    _notifyRecipesChanged() {},
  };
}

function makeManager(recipeManager) {
  const manager = new CraftingSystemManager(recipeManager);
  manager.initialized = true;
  manager.save = async () => {};
  return manager;
}

function seedSystem(manager, { resolutionMode, components }) {
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({ id: 'sys-1', name: 'Alchemy Bench', resolutionMode, components })
  );
}

test('updateSystem blocks an alchemy component edit that introduces a signature collision', async () => {
  settingsStore.clear();
  // Two recipes whose tag groups are disjoint with the current component list:
  // "rare" → {gold}, "metal" → {iron}. No overlap, so the system is valid.
  const recipeManager = makeRecipeManager([
    tagRecipe('recipe-rare', 'Rare Brew', ['rare']),
    tagRecipe('recipe-metal', 'Metal Brew', ['metal']),
  ]);
  const manager = makeManager(recipeManager);
  seedSystem(manager, {
    resolutionMode: 'alchemy',
    components: [
      { id: 'gold', name: 'Gold', tags: ['rare'] },
      { id: 'iron', name: 'Iron', tags: ['metal'] },
    ],
  });

  // Adding `mithril` (tagged BOTH rare and metal) makes both recipes resolvable from the
  // same component, so their signatures now overlap — the update must be blocked.
  await assert.rejects(
    () =>
      manager.updateSystem('sys-1', {
        components: [
          { id: 'gold', name: 'Gold', tags: ['rare'] },
          { id: 'iron', name: 'Iron', tags: ['metal'] },
          { id: 'mithril', name: 'Mithril', tags: ['rare', 'metal'] },
        ],
      }),
    /signature collision/i,
    'a collision-introducing alchemy update throws'
  );

  // Validate-before-persist: the rejected update left the prior system state intact.
  const persisted = manager.getSystem('sys-1');
  assert.deepEqual(
    persisted.components.map((c) => c.id).sort((a, b) => a.localeCompare(b)),
    ['gold', 'iron'],
    'the colliding `mithril` component was never persisted'
  );
});

test('updateSystem allows a non-colliding alchemy component edit', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    tagRecipe('recipe-rare', 'Rare Brew', ['rare']),
    tagRecipe('recipe-metal', 'Metal Brew', ['metal']),
  ]);
  const manager = makeManager(recipeManager);
  seedSystem(manager, {
    resolutionMode: 'alchemy',
    components: [
      { id: 'gold', name: 'Gold', tags: ['rare'] },
      { id: 'iron', name: 'Iron', tags: ['metal'] },
    ],
  });

  // Adding a component that matches neither recipe's tag group keeps signatures disjoint.
  const updated = await manager.updateSystem('sys-1', {
    components: [
      { id: 'gold', name: 'Gold', tags: ['rare'] },
      { id: 'iron', name: 'Iron', tags: ['metal'] },
      { id: 'wood', name: 'Wood', tags: ['organic'] },
    ],
  });

  assert.deepEqual(
    updated.components.map((c) => c.id).sort((a, b) => a.localeCompare(b)),
    ['gold', 'iron', 'wood'],
    'a non-colliding component edit persists'
  );
});

test('updateSystem does not run signature validation for a non-alchemy system', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    // These would collide IF signatures were checked (both match the same tag), proving the
    // non-alchemy path skips validation entirely rather than merely finding no conflicts.
    tagRecipe('recipe-a', 'A', ['metal']),
    tagRecipe('recipe-b', 'B', ['metal']),
  ]);
  const manager = makeManager(recipeManager);
  seedSystem(manager, {
    resolutionMode: 'simple',
    components: [{ id: 'iron', name: 'Iron', tags: ['metal'] }],
  });

  // Spy on the pure validator: a non-alchemy update must never construct/run it.
  const originalValidateSystem = SignatureValidator.prototype.validateSystem;
  let validateSystemCalls = 0;
  SignatureValidator.prototype.validateSystem = function spy(...args) {
    validateSystemCalls += 1;
    return originalValidateSystem.apply(this, args);
  };

  try {
    const updated = await manager.updateSystem('sys-1', {
      components: [
        { id: 'iron', name: 'Iron', tags: ['metal'] },
        { id: 'steel', name: 'Steel', tags: ['metal'] },
      ],
    });

    assert.equal(validateSystemCalls, 0, 'signature validation is not run for a non-alchemy system');
    assert.deepEqual(
      updated.components.map((c) => c.id).sort((a, b) => a.localeCompare(b)),
      ['iron', 'steel'],
      'the non-alchemy update succeeds'
    );
  } finally {
    SignatureValidator.prototype.validateSystem = originalValidateSystem;
  }
});
