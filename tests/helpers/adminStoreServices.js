/** Shared `createAdminStore` test fixtures (issue 785). */

// Sonar flags `Math.random()` as S2245 (a MAJOR vulnerability) even in test code, and a single
// new-code finding above rating A fails the quality gate.
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

/**
 * `getSetting`/`setSetting` over a caller-owned record. Without one the historical defaults hold
 * (`lastManagedCraftingSystem` -> `sys1`); with one the record is the ONLY source, so a suite that
 * seeds nothing starts with no selected system.
 */
function settingAccessors(settings) {
  if (!settings) {
    return {
      getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
      setSetting: async () => {},
    };
  }
  return {
    getSetting: (key) => settings[key] ?? '',
    setSetting: async (key, value) => {
      settings[key] = value;
    },
  };
}

/** System writes that mutate `system` and log `{ kind, id, updates }` into the caller's array. */
function systemWriteMethods(system, systemWrites) {
  return {
    updateSystem: async (id, updates = {}) => {
      systemWrites.push({ kind: 'updateSystem', id, updates });
      if (id !== system.id) return null;
      Object.assign(system, updates);
      return system;
    },
  };
}

/** Capturing dialog/localization/notification hooks, each wired only when its sink is supplied. */
function dialogAccessors({ confirmations, localizations, notifications, confirm } = {}) {
  return {
    ...(confirmations && {
      confirmDialog: async (config) => {
        confirmations.push(config);
        return confirm !== false;
      },
    }),
    ...(localizations && {
      localize: (key, data) => {
        localizations.push({ key, data });
        return key;
      },
    }),
    ...(notifications && {
      notify: {
        info: (message) => notifications.info.push(String(message)),
        warn: (message) => notifications.warn.push(String(message)),
        error: (message) => notifications.error.push(String(message)),
      },
    }),
  };
}

export function createServices(system, recipes = [], capture = [], overrides = {}) {
  const { updateRecipe, settings, systemWrites, dialogCapture, ...serviceOverrides } = overrides;
  const systems = [system];
  const systemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find((s) => s.id === id) || null,
    getItems: () => system.items || [],
    ...(systemWrites ? systemWriteMethods(system, systemWrites) : {}),
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
    ...settingAccessors(settings),
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    // The raw actor DOCUMENTS the store builds its learned-knowledge index from (issue 1132).
    getWorldActors: () => {
      const raw = globalThis.game?.actors;
      return Array.isArray(raw?.contents) ? raw.contents : Array.isArray(raw) ? raw : [];
    },
    localize: (key) => key,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    ...(dialogCapture ? dialogAccessors(dialogCapture) : {}),
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
 * `isOwner` defaults to TRUE because these fixtures model a GM session, which is the only session
 * the manager runs in (issue 970).
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
