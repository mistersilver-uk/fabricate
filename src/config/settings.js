import {
  DEFAULT_INTERACTION_PROMPT_POSITION,
  INTERACTION_PROMPT_POSITION_CHOICES,
} from '../ui/interactionPromptPosition.js';
import {
  DEFAULT_FABRICATE_THEME,
  FABRICATE_THEME_CHOICES,
  applyFabricateTheme,
} from '../ui/theme.js';

import { ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY } from './playerCharacterTypes.js';
import { registerPlayerCharacterTypesMenu } from './playerCharacterTypesMenu.js';
import { registerRepairItemDataMenu } from './repairItemData.js';
import {
  DEFAULT_ITEM_STACK_QUANTITY_PATH,
  stackQuantityPathPresetFor,
} from './stackQuantityPathPresets.js';

export const FABRICATE_SETTINGS_NAMESPACE = 'fabricate';

export const SETTING_KEYS = Object.freeze({
  RECIPES: 'recipes',
  CRAFTING_SYSTEMS: 'craftingSystems',
  // World scope (issue 1278): a world runs one game system, so one way actors store coins. A
  // crafting system keeps only `requirements.currency.enabled`, whether it participates.
  CURRENCY_CONFIG: 'currencyConfig',
  // Issue 1282: the realm library, reveal mode and modifier visibility.
  TRAVEL_CONFIG: 'travelConfig',
  // Issue 1308: `{ characterPrerequisites: [], modifiers: [] }`.
  CHARACTER_LIBRARIES: 'characterLibraries',
  // Issue 1359: each world roster, its defaults and its `(entity, system)` membership records.
  COMPONENT_SCOPE: 'componentScope',
  ESSENCE_SCOPE: 'essenceScope',
  TOOL_SCOPE: 'toolScope',
  // Issue 1392: component categories and tags and recipe categories, authored once per world.
  WORLD_VOCABULARY: 'worldVocabulary',
  // Issue 1363: `1.30.0`'s decision record, the per-system `{ components: {oldId: newId}, tools }`
  // re-key map, written as the first writeback leg so a torn pass is recoverable.
  WORLD_SCOPE_REKEY_MAP: 'worldScopeRekeyMap',
  // Issue 1654: `1.34.0`'s decision record, the second writeback leg (before `recipes`).
  WORLD_ESSENCE_MERGE_MAP: 'worldEssenceMergeMap',
  GATHERING_ENVIRONMENTS: 'gatheringEnvironments',
  GATHERING_CONFIG: 'gatheringConfig',
  GATHERING_PARTIES: 'gatheringParties',
  // Issue 901: per blind run id, the drawn task, its snapshot and its provisional reservation.
  GATHERING_BLIND_RUNS: 'gatheringBlindRuns',
  LAST_CRAFTING_ACTOR: 'lastCraftingActor',
  LAST_GATHERING_ACTOR: 'lastGatheringActor',
  LAST_COMPONENT_SOURCES: 'lastComponentSources',
  LAST_MANAGED_CRAFTING_SYSTEM: 'lastManagedCraftingSystem',
  MANAGER_RAIL_COLLAPSED: 'managerRailCollapsed',
  GATHERING_HIDE_UNAVAILABLE: 'gatheringHideUnavailableEnvironments',
  PROGRESSIVE_RESULT_ORDER: 'progressiveResultOrder',
  JOURNAL_RUN_DISMISSALS: 'journalRunDismissals',
  MIGRATION_VERSION: 'migrationVersion',
  FAVOURITE_RECIPES: 'favouriteRecipes',
  LAST_ALCHEMY_SYSTEM: 'lastAlchemySystem',
  THEME: 'theme',
  EXPERIMENTAL_FEATURES: 'experimentalFeatures',
  INTERACTION_PROMPT_POSITION: 'interactionPromptPosition',
  // Version stamps for the one-shot identity passes (issues 555, 556, 561, 600, 1363, 1654).
  RECIPE_ITEM_FLAG_STAMP_VERSION: 'recipeItemFlagStampVersion',
  COMPONENT_FLAG_STAMP_VERSION: 'componentFlagStampVersion',
  TOOL_FLAG_STAMP_VERSION: 'toolFlagStampVersion',
  OWNED_ITEM_COMPONENT_STAMP_VERSION: 'ownedItemComponentStampVersion',
  WORLD_SCOPE_IDENTITY_FLAG_VERSION: 'worldScopeIdentityFlagVersion',
  WORLD_ESSENCE_MERGE_FLAG_VERSION: 'worldEssenceMergeFlagVersion',
  // Issue 1024: the additional actor types a GM designates as player characters.
  ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES: ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY,
  // Issue 1024: the dotted path Fabricate reads and writes for an item's stack size.
  ITEM_STACK_QUANTITY_PATH: 'itemStackQuantityPath',
});

// The target versions of the one-shot identity passes, in `src/main.js` order.
export const RECIPE_ITEM_FLAG_STAMP_TARGET = 2;

export const COMPONENT_FLAG_STAMP_TARGET = 2;

export const TOOL_FLAG_STAMP_TARGET = 2;

export const OWNED_ITEM_COMPONENT_STAMP_TARGET = 1;

export const WORLD_SCOPE_IDENTITY_FLAG_TARGET = 1;

export const WORLD_ESSENCE_MERGE_FLAG_TARGET = 1;

const BASE_DEFINITIONS = Object.freeze({
  [SETTING_KEYS.RECIPES]: {
    name: 'Recipes',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  },
  [SETTING_KEYS.CRAFTING_SYSTEMS]: {
    name: 'Crafting Systems',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  },
  [SETTING_KEYS.CURRENCY_CONFIG]: {
    name: 'Currency Configuration',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.TRAVEL_CONFIG]: {
    name: 'Travel Configuration',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.CHARACTER_LIBRARIES]: {
    name: 'Character Libraries',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  // Issue 1359.
  [SETTING_KEYS.COMPONENT_SCOPE]: {
    name: 'World Component Scope',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.ESSENCE_SCOPE]: {
    name: 'World Essence Scope',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.TOOL_SCOPE]: {
    name: 'World Tool Scope',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  // Issue 1392.
  [SETTING_KEYS.WORLD_VOCABULARY]: {
    name: 'World Vocabulary',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  // Issue 1363.
  [SETTING_KEYS.WORLD_SCOPE_REKEY_MAP]: {
    name: 'World Scope Re-key Map',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  // Issue 1654.
  [SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP]: {
    name: 'World Essence Merge Map',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.GATHERING_ENVIRONMENTS]: {
    name: 'Gathering Environments',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  },
  [SETTING_KEYS.GATHERING_CONFIG]: {
    name: 'Gathering Configuration',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.GATHERING_PARTIES]: {
    name: 'Gathering Parties',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  },
  // Map of `runId -> { taskId, snapshot, reservation }` for in-flight blind runs.
  [SETTING_KEYS.GATHERING_BLIND_RUNS]: {
    name: 'Blind Gathering Runs',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.THEME]: {
    name: 'FABRICATE.Settings.Theme.Name',
    hint: 'FABRICATE.Settings.Theme.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: FABRICATE_THEME_CHOICES,
    default: DEFAULT_FABRICATE_THEME,
    onChange: applyFabricateTheme,
  },
  [SETTING_KEYS.EXPERIMENTAL_FEATURES]: {
    name: 'FABRICATE.Settings.ExperimentalFeatures.Name',
    hint: 'FABRICATE.Settings.ExperimentalFeatures.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  },
  [SETTING_KEYS.INTERACTION_PROMPT_POSITION]: {
    name: 'FABRICATE.Settings.InteractionPromptPosition.Name',
    hint: 'FABRICATE.Settings.InteractionPromptPosition.Hint',
    scope: 'client',
    config: true,
    type: String,
    choices: INTERACTION_PROMPT_POSITION_CHOICES,
    default: DEFAULT_INTERACTION_PROMPT_POSITION,
  },
  [SETTING_KEYS.LAST_CRAFTING_ACTOR]: {
    name: 'Last Crafting Actor',
    scope: 'client',
    config: false,
    type: String,
    default: '',
  },
  [SETTING_KEYS.LAST_GATHERING_ACTOR]: {
    name: 'Last Gathering Actor',
    scope: 'client',
    config: false,
    type: String,
    default: '',
  },
  [SETTING_KEYS.LAST_COMPONENT_SOURCES]: {
    name: 'Last Component Source Actors',
    scope: 'client',
    config: false,
    type: Array,
    default: [],
  },
  [SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM]: {
    name: 'Last Managed Crafting System',
    scope: 'client',
    config: false,
    type: String,
    default: '',
  },
  [SETTING_KEYS.MANAGER_RAIL_COLLAPSED]: {
    name: 'Crafting System Manager Rail Collapsed',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
  },
  [SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE]: {
    name: 'Hide Unavailable Gathering Environments',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
  },
  [SETTING_KEYS.PROGRESSIVE_RESULT_ORDER]: {
    name: 'Progressive Result Order Preferences',
    // `user`, not `client` (issue 651): the order follows the player to every device.
    scope: 'user',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.JOURNAL_RUN_DISMISSALS]: {
    name: 'Journal Run Dismissals',
    // Follows the user across clients; holds only bounded composite keys, never actor history.
    scope: 'user',
    config: false,
    type: Object,
    default: {},
  },
  [SETTING_KEYS.MIGRATION_VERSION]: {
    name: 'Migration Version',
    scope: 'world',
    config: false,
    type: String,
    default: '0.0.0',
  },
  [SETTING_KEYS.FAVOURITE_RECIPES]: {
    name: 'Favourite Recipes',
    scope: 'client',
    config: false,
    type: Array,
    default: [],
  },
  [SETTING_KEYS.LAST_ALCHEMY_SYSTEM]: {
    name: 'Last Alchemy System',
    scope: 'client',
    config: false,
    type: String,
    default: '',
  },
  [SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION]: {
    name: 'Recipe Item Flag Stamp Version',
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
  },
  [SETTING_KEYS.COMPONENT_FLAG_STAMP_VERSION]: {
    name: 'Component Flag Stamp Version',
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
  },
  [SETTING_KEYS.TOOL_FLAG_STAMP_VERSION]: {
    name: 'Tool Flag Stamp Version',
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
  },
  [SETTING_KEYS.OWNED_ITEM_COMPONENT_STAMP_VERSION]: {
    name: 'Owned Item Component Stamp Version',
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
  },
  [SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION]: {
    name: 'World Scope Identity Flag Version',
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
  },
  [SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION]: {
    name: 'World Essence Merge Flag Version',
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
  },
  // Edited through `registerPlayerCharacterTypesMenu`: valid values are the world's actor types.
  [SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES]: {
    name: 'FABRICATE.Settings.PlayerCharacterActorTypes.Name',
    hint: 'FABRICATE.Settings.PlayerCharacterActorTypes.Hint',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  },
  // Free text, not `choices`: real paths are open-ended, and no `.value` leaf is appended.
  [SETTING_KEYS.ITEM_STACK_QUANTITY_PATH]: {
    name: 'FABRICATE.Settings.ItemStackQuantityPath.Name',
    hint: 'FABRICATE.Settings.ItemStackQuantityPath.Hint',
    scope: 'world',
    config: true,
    type: String,
    default: DEFAULT_ITEM_STACK_QUANTITY_PATH,
  },
});

const keys = Object.values(SETTING_KEYS);

/** Derived from the definitions, so it cannot drift as settings are added or re-scoped. */
export const WORLD_SCOPED_SETTING_KEYS = Object.freeze(
  new Set(keys.filter((key) => BASE_DEFINITIONS[key]?.scope === 'world'))
);

/** Overlay the ACTIVE game system's defaults onto a frozen base definition. */
function withActiveSystemDefaults(key, definition) {
  if (key !== SETTING_KEYS.ITEM_STACK_QUANTITY_PATH) return definition;
  const preset = stackQuantityPathPresetFor(globalThis.game?.system?.id);
  const hintKey = definition.hint;
  const hint = globalThis.game?.i18n?.format?.(hintKey, { default: preset }) ?? hintKey;
  return { ...definition, default: preset || DEFAULT_ITEM_STACK_QUANTITY_PATH, hint };
}

export function registerFabricateSettings() {
  for (const key of keys) {
    const definition = withActiveSystemDefaults(key, BASE_DEFINITIONS[key]);
    game.settings.register(FABRICATE_SETTINGS_NAMESPACE, key, definition);
  }
  registerRepairItemDataMenu();
  registerPlayerCharacterTypesMenu();
}

export function getSetting(key) {
  return game.settings.get(FABRICATE_SETTINGS_NAMESPACE, key);
}

export async function setSetting(key, value) {
  return game.settings.set(FABRICATE_SETTINGS_NAMESPACE, key, value);
}
