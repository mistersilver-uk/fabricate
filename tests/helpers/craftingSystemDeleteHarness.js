// Shared scaffolding for the CraftingSystemManager.deleteSystem cascade/flag-cleanup
// tests. This file lives under tests/helpers/ so the `npm test` glob does NOT run it
// as a suite, but it imports fine into the top-level *.test.js files. Keeping the
// foundry/ui globals, the cache-busting importManager(), and the fake service
// factories in ONE place avoids duplicating ~80 lines across the two delete tests
// (and the SonarCloud new-code duplication gate that would flag the copy).

let idSeq = 0;

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], obj),
  },
};

export const notifications = [];

globalThis.ui = {
  notifications: {
    info: (message) => notifications.push(message),
    warn: () => {},
    error: () => {},
  },
};

/**
 * Default recipe fixtures used by the cascade test: one recipe on the system that
 * gets deleted and one on a system that is kept.
 */
export function defaultRecipes() {
  return [
    { id: 'recipe-1', craftingSystemId: 'sys-delete', name: 'R1' },
    { id: 'recipe-2', craftingSystemId: 'sys-keep', name: 'R2' },
  ];
}

/**
 * A minimal in-memory RecipeManager stand-in. Pass a custom recipe list to model a
 * multi-recipe system; defaults to {@link defaultRecipes}.
 */
export function fakeRecipeManager(recipes = defaultRecipes()) {
  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return recipes.filter((r) => r.craftingSystemId === filters.craftingSystemId);
      }
      return recipes;
    },
    async deleteRecipe(id) {
      const idx = recipes.findIndex((r) => r.id === id);
      if (idx >= 0) recipes.splice(idx, 1);
    },
  };
}

export function fakeEnvironmentStore(calls) {
  return {
    async cleanupByCraftingSystem(systemId) {
      calls.push({ method: 'environmentStore.cleanupByCraftingSystem', systemId });
      return true;
    },
  };
}

export function fakeGatheringRunManager(calls) {
  return {
    async removeRunsForSystem(systemId) {
      calls.push({ method: 'gatheringRunManager.removeRunsForSystem', systemId });
    },
  };
}

export function fakeSalvageRunManager(calls) {
  return {
    async removeRunsForSystem(systemId, options) {
      calls.push({ method: 'salvageRunManager.removeRunsForSystem', systemId, options });
    },
  };
}

export function fakeCraftingRunManager(calls) {
  return {
    async removeRunsForSystem(systemId) {
      calls.push({ method: 'craftingRunManager.removeRunsForSystem', systemId });
    },
  };
}

export function fakeRichStateService(calls) {
  return {
    async removeSystem(systemId) {
      calls.push({ method: 'richStateService.removeSystem', systemId });
      return true;
    },
  };
}

/**
 * A recipe-visibility service stand-in whose `cleanupLearnedRecipes` records every
 * call (with a snapshot of the valid recipe-id set) onto the SHARED `calls` array
 * and prunes each `game.actors` entry's `learned` map to the valid ids, mirroring
 * the real service's single bulk pass across all actors.
 *
 * The exactly-once assertion in the flag-cleanup test MUST accumulate through this
 * shared array, NOT an instance counter: the `game.fabricate.getRecipeVisibilityService`
 * seam returns a fresh factory result on every lookup, so an instance-scoped count
 * would reset each call and never catch a per-recipe fan-out regression.
 *
 * @param {Array} calls - shared collector array
 * @param {{throwOnCleanup?: boolean}} [options]
 */
export function fakeRecipeVisibilityService(calls, options = {}) {
  return {
    async cleanupLearnedRecipes(validRecipeIds = new Set()) {
      calls.push({
        method: 'visibilityService.cleanupLearnedRecipes',
        validRecipeIds: [...validRecipeIds],
      });
      if (options.throwOnCleanup) {
        throw new Error('cleanupLearnedRecipes boom');
      }
      for (const actor of game.actors || []) {
        const learned = actor.learned || {};
        for (const recipeId of Object.keys(learned)) {
          if (!validRecipeIds.has(recipeId)) {
            delete learned[recipeId];
          }
        }
      }
    },
  };
}

export async function importManager() {
  // Fresh import each time to avoid cached module state between tests.
  const mod = await import(`../../src/systems/CraftingSystemManager.js?cb=${++idSeq}`);
  return mod.CraftingSystemManager;
}
