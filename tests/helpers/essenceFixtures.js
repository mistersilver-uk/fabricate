/** Shared essence builders and the Foundry-ish engine harness for the issue-1036 essence suites. */

/** One essence definition in the exact shape `_normalizeEssenceDefinition` emits. */
export function makeEssence(overrides = {}) {
  return {
    id: 'fire',
    name: 'Fire',
    description: 'Elemental heat',
    icon: 'fas fa-fire',
    colorToken: null,
    enabled: true,
    propertyMacroUuid: null,
    sourceComponentId: null,
    sourceItemUuid: null,
    associatedSystemItemId: null,
    ...overrides,
  };
}

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

const SKIPPED_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * `foundry.utils.setProperty`, transcribed from the REAL helper (`common/utils/helpers.mjs`) rather
 * than approximated, because its edge semantics are the whole point of the essence apply loop's
 * guard.
 *
 * @returns {boolean} whether the value changed from its previous value.
 */
function setProperty(object, path, value) {
  if (!path || SKIPPED_PROPERTIES.has(path)) return false;

  let target = object;
  let key = String(path);
  if (key.includes('.')) {
    const parts = key.split('.');
    if (parts.some((part) => SKIPPED_PROPERTIES.has(part))) return false;
    key = parts.pop();
    target = parts.reduce((node, part) => {
      if (node[part] === undefined) node[part] = {};
      return node[part];
    }, object);
  }

  if (target[key] !== value) {
    target[key] = value;
    return true;
  }
  return false;
}

/**
 * Install the Foundry globals the crafting engine reads, and return the notification spies so a
 * suite can assert that an unresolvable macro raised NO toast.
 */
export function installEngineGlobals() {
  const errors = [];
  const warnings = [];
  const infos = [];
  let ids = 0;
  globalThis.foundry = {
    utils: {
      getProperty,
      setProperty,
      randomID: () => `rid-${(ids += 1)}`,
      deepClone: (value) => JSON.parse(JSON.stringify(value)),
    },
  };
  globalThis.ui = {
    notifications: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      info: (message) => infos.push(String(message)),
    },
  };
  return { errors, warnings, infos };
}

/**
 * Publish a crafting system on `game.fabricate` and resolve the supplied documents through
 * `fromUuid`.
 */
export function publishSystem(system, documents = {}) {
  globalThis.game = {
    user: { isGM: true },
    fabricate: { getCraftingSystemManager: () => ({ getSystem: () => system }) },
  };
  globalThis.fromUuid = async (uuid) => documents[uuid] ?? null;
}

/**
 * A script Macro stand-in. `command` is a string, which is the ONLY thing `MacroExecutor.run`
 * requires, and the body is evaluated as an async function whose `context` argument is the macro
 * context.
 */
export function makeScriptMacro(command) {
  return { command, type: 'script' };
}

/**
 * An actor that records every item payload handed to `createEmbeddedDocuments` and exposes an
 * iterable `items` collection, which is what the engine's stacking lookup requires before it will
 * even consider a match.
 */
export function makeCapturingActor(items = []) {
  const captured = [];
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    captured,
    items: {
      contents: items,
      [Symbol.iterator]() {
        return items[Symbol.iterator]();
      },
    },
    async createEmbeddedDocuments(_type, dataArray) {
      captured.push(...dataArray);
      return dataArray.map((data, index) => ({
        ...data,
        uuid: `${this.uuid}.Item.created-${index}`,
        parent: this,
        _source: structuredClone(data),
        effects: [],
        async createEmbeddedDocuments(_effectType, effects) {
          this.effects.push(...effects);
          return effects;
        },
      }));
    },
  };
}

/**
 * An owned inventory item the stacking path can update, matched by NAME (the engine's
 * case-sensitive name fallback) so a fixture needs no uuid plumbing.
 */
export function makeOwnedStack(name, quantity = 1) {
  return {
    id: `owned-${name.toLowerCase().replaceAll(/\W+/g, '-')}`,
    uuid: `Item.owned-${name}`,
    name,
    system: { quantity },
    flags: {},
    updates: [],
    getFlag: () => null,
    async update(payload) {
      this.updates.push({ ...payload });
      if (payload['system.quantity'] !== undefined) {
        this.system.quantity = payload['system.quantity'];
      }
      return this;
    },
  };
}

/**
 * A `createAdminStore` services stub whose crafting-system manager implements the FOUR essence
 * write primitives the store's new exports route through (issue 1036).
 */
export function makeEssenceStoreHarness(options = {}) {
  const writes = [];
  const confirmations = [];
  const localizations = [];
  const notifications = { info: [], warn: [], error: [] };
  const recipes = options.recipes ? [...options.recipes] : [];
  const system = {
    id: 'sys1',
    name: 'System One',
    description: '',
    resolutionMode: 'simple',
    visibilityMode: 'item',
    features: { essences: true, effectTransfer: true, ...(options.features || {}) },
    categories: [],
    itemTags: [],
    essenceDefinitions: options.essences ? options.essences.map((def) => ({ ...def })) : [],
    components: options.components ? options.components.map((item) => ({ ...item })) : [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    recipeItemDefinitions: [],
  };

  function definitions() {
    return Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
  }

  const systemManager = {
    getSystems: () => [system],
    getSystem: (id) => (id === system.id ? system : null),
    getItems: () => system.components,
    updateSystem: async (id, updates) => {
      writes.push({ kind: 'updateSystem', updates });
      Object.assign(system, updates);
    },
    // Mirrors the shipped primitive's presence gating: `Object.hasOwn`, never truthiness,
    // because `colorToken: null` and `enabled: false` are falsy but REAL staged edits.
    applyBulkEditToEssences: async (id, essenceIds, edit = {}) => {
      writes.push({ kind: 'applyBulkEditToEssences', essenceIds: [...essenceIds], edit });
      const targets = new Set([...essenceIds].map(String));
      const changed = [];
      system.essenceDefinitions = definitions().map((def) => {
        if (!targets.has(String(def.id))) return def;
        changed.push(String(def.id));
        const next = { ...def };
        if (Object.hasOwn(edit, 'icon') && String(edit.icon || '').trim()) next.icon = edit.icon;
        if (Object.hasOwn(edit, 'colorToken')) next.colorToken = edit.colorToken;
        if (Object.hasOwn(edit, 'enabled')) next.enabled = edit.enabled === true;
        return next;
      });
      return { updated: changed.length, essenceIds: changed };
    },
    deleteEssence: async (id, essenceId) => {
      writes.push({ kind: 'deleteEssence', essenceId });
      system.essenceDefinitions = definitions().filter((def) => def.id !== essenceId);
      return true;
    },
    deleteEssences: async (id, essenceIds) => {
      writes.push({ kind: 'deleteEssences', essenceIds: [...essenceIds] });
      const removed = new Set([...essenceIds].map(String));
      system.essenceDefinitions = definitions().filter((def) => !removed.has(String(def.id)));
      return { deleted: removed.size, essenceIds: [...removed], recipesUpdated: 0, recipesDisabled: 0 };
    },
  };

  const services = {
    getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
    setSetting: async () => {},
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => ({
      getRecipes: (filter) =>
        filter?.craftingSystemId
          ? recipes.filter((recipe) => recipe.craftingSystemId === filter.craftingSystemId)
          : recipes,
      getRecipe: (id) => recipes.find((recipe) => recipe.id === id) || null,
      updateRecipe: async () => {},
    }),
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    // Keys are returned verbatim, which is what makes "is this string localized?" visible in an
    // assertion: a hardcoded English sentence cannot be mistaken for a key.
    localize: (key, data) => {
      localizations.push({ key, data });
      return key;
    },
    // Captures each call so a suite can assert a confirm was asked for, while keeping the
    // boolean return the confirm/decline suites rely on.
    confirmDialog: async (config) => {
      confirmations.push(config);
      return options.confirm !== false;
    },
    notify: {
      info: (message) => notifications.info.push(String(message)),
      warn: (message) => notifications.warn.push(String(message)),
      error: (message) => notifications.error.push(String(message)),
    },
  };

  return {
    services,
    systemManager,
    system,
    recipes,
    writes,
    confirmations,
    localizations,
    notifications,
  };
}
