/**
 * Shared `createAdminStore` test fixtures (issue 785).
 *
 * The `makeRecipe` / `makeSystem` / `createServices` triple was duplicated across
 * adminStore suites; SonarCloud counts `tests/**` like `src/`, so a fresh copy fails
 * the new-code duplication gate — and extracting a helper only helps if the copies it
 * was extracted FROM are deleted, since CPD needs just two copies to report. The
 * suites whose triple was token-identical therefore import from here.
 *
 * `createServices` takes an `overrides` object so a suite can add or replace any
 * single service (a spy, a seam stub) without forking the whole factory. Two
 * recipe-manager writes are threadable through it: `updateRecipe` replaces the
 * default capturing stub outright.
 */

// Sonar flags `Math.random()` as S2245 (a MAJOR vulnerability) even in test code,
// and a single new-code finding above rating A fails the quality gate. A monotonic
// counter is both gate-safe and strictly better here: fixture ids become
// deterministic, so a failing assertion names the same recipe on every run.
let recipeIdSequence = 0;

export function makeRecipe(overrides = {}) {
  const id = overrides.id || `recipe-${(recipeIdSequence += 1)}`;
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
  const { updateRecipe, ...serviceOverrides } = overrides;
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
    updateRecipe:
      updateRecipe ||
      (async (id, updates, options) => {
        capture.push({ id, updates, options });
      }),
  };
  return {
    getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
    setSetting: async () => {},
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    // The raw actor DOCUMENTS the store builds its learned-knowledge index from (issue
    // 1132). It reads `globalThis.game` because that is where these fixtures already seed
    // their actors; the real seam in `SvelteCraftingSystemManagerApp` does the same read.
    getWorldActors: () => {
      const raw = globalThis.game?.actors;
      return Array.isArray(raw?.contents) ? raw.contents : Array.isArray(raw) ? raw : [];
    },
    localize: (key) => key,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    ...serviceOverrides,
  };
}

/**
 * A document-like fixture whose `getFlag(scope, key)` walks a DOTTED key exactly
 * as Foundry's does, so `getFabricateFlag(actor, 'learnedRecipes')` resolves the
 * real doubly-nested `flags.fabricate.fabricate.learnedRecipes` path — and a
 * single-nested-only fixture correctly resolves to nothing.
 */
/**
 * `isOwner` defaults to TRUE because these fixtures model a GM session, which is the only
 * session the manager runs in. `Actor#isOwner` short-circuits to OWNER for any `isGM`, so a
 * GM client genuinely sees every world actor as writable — and the learned-knowledge index
 * is scoped to `selectWritableActors` (issue 970/1132), so an actor without the field is
 * filtered out and contributes nothing. Pass `isOwner: false` to model the non-owned actor
 * both the count and the cascade must exclude.
 */
export function makeFlaggedActor({
  id,
  name = '',
  img = '',
  flags = {},
  items = [],
  isOwner = true,
} = {}) {
  const actor = { id, name: name || id, img, flags, items, isOwner };
  actor.getFlag = (scope, key) =>
    String(key || '')
      .split('.')
      .reduce((value, part) => value?.[part], actor.flags?.[scope]);
  return actor;
}
