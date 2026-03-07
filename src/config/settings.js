export const FABRICATE_SETTINGS_NAMESPACE = 'fabricate';

export const SETTING_KEYS = Object.freeze({
  RECIPES: 'recipes',
  CRAFTING_SYSTEMS: 'craftingSystems',
  ENABLED: 'enabled',
  SHOW_SIMPLE_RECIPES_ONLY: 'showSimpleRecipesOnly',
  AUTO_CRAFT: 'autoCraft',
  LAST_CRAFTING_ACTOR: 'lastCraftingActor',
  LAST_COMPONENT_SOURCES: 'lastComponentSources',
  LAST_MANAGED_CRAFTING_SYSTEM: 'lastManagedCraftingSystem',
  PROGRESSIVE_RESULT_ORDER: 'progressiveResultOrder',
  MIGRATION_VERSION: 'migrationVersion',
  FAVOURITE_RECIPES: 'favouriteRecipes',
  RECENTLY_CRAFTED: 'recentlyCrafted'
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
  },
  [SETTING_KEYS.PROGRESSIVE_RESULT_ORDER]: {
    name: 'Progressive Result Order Preferences',
    scope: 'client',
    config: false,
    type: Object,
    default: {}
  },
  [SETTING_KEYS.MIGRATION_VERSION]: {
    name: 'Migration Version',
    scope: 'world',
    config: false,
    type: String,
    default: '0.0.0'
  },
  [SETTING_KEYS.FAVOURITE_RECIPES]: {
    name: 'Favourite Recipes',
    scope: 'client',
    config: false,
    type: Array,
    default: []
  },
  [SETTING_KEYS.RECENTLY_CRAFTED]: {
    name: 'Recently Crafted Recipes',
    scope: 'client',
    config: false,
    type: Array,
    default: []
  }
});

const keys = Object.values(SETTING_KEYS);

export function registerFabricateSettings() {
  for (const key of keys) {
    const definition = BASE_DEFINITIONS[key];
    game.settings.register(FABRICATE_SETTINGS_NAMESPACE, key, definition);
  }
}

export function getSetting(key) {
  return game.settings.get(FABRICATE_SETTINGS_NAMESPACE, key);
}

export async function setSetting(key, value) {
  return game.settings.set(FABRICATE_SETTINGS_NAMESPACE, key, value);
}
