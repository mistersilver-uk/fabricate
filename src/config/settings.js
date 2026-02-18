export const FABRICATE_SETTINGS_NAMESPACE = 'fabricate';
export const LEGACY_SETTINGS_NAMESPACE = 'fabricate-v2';

export const SETTING_KEYS = Object.freeze({
  RECIPES: 'recipes',
  CRAFTING_SYSTEMS: 'craftingSystems',
  ENABLED: 'enabled',
  SHOW_SIMPLE_RECIPES_ONLY: 'showSimpleRecipesOnly',
  AUTO_CRAFT: 'autoCraft',
  LAST_CRAFTING_ACTOR: 'lastCraftingActor',
  LAST_COMPONENT_SOURCES: 'lastComponentSources',
  LAST_MANAGED_CRAFTING_SYSTEM: 'lastManagedCraftingSystem'
});

const BASE_DEFINITIONS = Object.freeze({
  [SETTING_KEYS.RECIPES]: {
    name: 'Recipes',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  },
  [SETTING_KEYS.CRAFTING_SYSTEMS]: {
    name: 'Crafting Systems',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  },
  [SETTING_KEYS.ENABLED]: {
    name: 'FABRICATE.Settings.Enabled.Name',
    hint: 'FABRICATE.Settings.Enabled.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  },
  [SETTING_KEYS.SHOW_SIMPLE_RECIPES_ONLY]: {
    name: 'FABRICATE.Settings.SimpleOnly.Name',
    hint: 'FABRICATE.Settings.SimpleOnly.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  },
  [SETTING_KEYS.AUTO_CRAFT]: {
    name: 'FABRICATE.Settings.AutoCraft.Name',
    hint: 'FABRICATE.Settings.AutoCraft.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  },
  [SETTING_KEYS.LAST_CRAFTING_ACTOR]: {
    name: 'Last Crafting Actor',
    scope: 'client',
    config: false,
    type: String,
    default: ''
  },
  [SETTING_KEYS.LAST_COMPONENT_SOURCES]: {
    name: 'Last Component Source Actors',
    scope: 'client',
    config: false,
    type: Array,
    default: []
  },
  [SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM]: {
    name: 'Last Managed Crafting System',
    scope: 'client',
    config: false,
    type: String,
    default: ''
  }
});

const keys = Object.values(SETTING_KEYS);

function valuesEqual(a, b) {
  const deepEqual = foundry?.utils?.deepEqual;
  if (typeof deepEqual === 'function') {
    return deepEqual(a, b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export function registerFabricateSettings() {
  for (const key of keys) {
    const definition = BASE_DEFINITIONS[key];
    game.settings.register(FABRICATE_SETTINGS_NAMESPACE, key, definition);
  }

  // Keep legacy keys registered for migration reads without showing duplicates.
  for (const key of keys) {
    const definition = BASE_DEFINITIONS[key];
    game.settings.register(LEGACY_SETTINGS_NAMESPACE, key, {
      ...definition,
      config: false
    });
  }
}

export async function migrateLegacySettings() {
  let migrated = 0;

  for (const key of keys) {
    const definition = BASE_DEFINITIONS[key];
    if (definition.scope === 'world' && !game.user?.isGM) {
      continue;
    }

    let currentValue;
    let legacyValue;
    try {
      currentValue = game.settings.get(FABRICATE_SETTINGS_NAMESPACE, key);
      legacyValue = game.settings.get(LEGACY_SETTINGS_NAMESPACE, key);
    } catch (err) {
      continue;
    }

    const isTargetUnset = valuesEqual(currentValue, definition.default);
    const hasLegacyData = !valuesEqual(legacyValue, definition.default);
    if (!isTargetUnset || !hasLegacyData) {
      continue;
    }

    await game.settings.set(FABRICATE_SETTINGS_NAMESPACE, key, legacyValue);
    migrated++;
  }

  if (migrated > 0) {
    console.log(`Fabricate v2 | Migrated ${migrated} setting(s) from ${LEGACY_SETTINGS_NAMESPACE}.* to ${FABRICATE_SETTINGS_NAMESPACE}.*`);
  }

  return migrated;
}

export function getSetting(key) {
  return game.settings.get(FABRICATE_SETTINGS_NAMESPACE, key);
}

export async function setSetting(key, value) {
  return game.settings.set(FABRICATE_SETTINGS_NAMESPACE, key, value);
}

