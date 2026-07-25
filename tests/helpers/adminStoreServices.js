/**
 * Shared `createAdminStore` test fixtures (issue 785).
 *
 * The `makeRecipe` / `makeSystem` / `createServices` triple was near-duplicated
 * across the adminStore suites; SonarCloud counts `tests/**` like `src/`, so a
 * fresh copy fails the new-code duplication gate. New adminStore suites build
 * their services from here instead of copying the triple.
 *
 * `createServices` takes an `overrides` object so a suite can add or replace any
 * single service (a spy, a seam stub) without forking the whole factory.
 */

export function makeRecipe(overrides = {}) {
  const id = overrides.id || `recipe-${Math.random().toString(36).slice(2)}`;
  const name = overrides.name || `Recipe ${id}`;
  const craftingSystemId = overrides.craftingSystemId || 'sys1';
  return {
    id,
    name,
    description: '',
    img: 'recipe.png',
    category: overrides.category || 'general',
    enabled: overrides.enabled !== undefined ? overrides.enabled : true,
    locked: false,
    visibility: {},
    ingredientSets: [],
    recipeItemId: overrides.recipeItemId || '',
    craftingSystemId,
    isSimpleRecipe: () => true,
    toJSON: () => ({ id, name, craftingSystemId }),
    ...overrides,
  };
}

export function makeSystem(overrides = {}) {
  return {
    id: 'sys1',
    name: 'System One',
    description: '',
    resolutionMode: 'simple',
    visibilityMode: 'item',
    features: {},
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    recipeItemDefinitions: [],
    ...overrides,
  };
}

export function createServices(system, recipes = [], capture = [], overrides = {}) {
  const systems = [system];
  const systemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find((s) => s.id === id) || null,
    getItems: () => [],
    updateRecipeItemDefinition: async (systemId, recipeItemId, patch) => {
      capture.push({ systemId, recipeItemId, patch });
      const definition = (system.recipeItemDefinitions || []).find((d) => d.id === recipeItemId);
      if (definition && Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
        definition.enabled = patch.enabled;
      }
    },
  };
  const recipeManager = {
    getRecipes: (filter) =>
      filter?.craftingSystemId
        ? recipes.filter((r) => r.craftingSystemId === filter.craftingSystemId)
        : recipes,
    getRecipe: (id) => recipes.find((r) => r.id === id) || null,
  };
  return {
    getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
    setSetting: async () => {},
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    localize: (key) => key,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    ...overrides,
  };
}

/**
 * A document-like fixture whose `getFlag(scope, key)` walks a DOTTED key exactly
 * as Foundry's does, so `getFabricateFlag(actor, 'learnedRecipes')` resolves the
 * real doubly-nested `flags.fabricate.fabricate.learnedRecipes` path — and a
 * single-nested-only fixture correctly resolves to nothing.
 */
export function makeFlaggedActor({ id, name = '', img = '', flags = {}, items = [] } = {}) {
  const actor = { id, name: name || id, img, flags, items };
  actor.getFlag = (scope, key) =>
    String(key || '')
      .split('.')
      .reduce((value, part) => value?.[part], actor.flags?.[scope]);
  return actor;
}
