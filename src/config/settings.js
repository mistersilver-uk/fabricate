import {
  DEFAULT_INTERACTION_PROMPT_POSITION,
  INTERACTION_PROMPT_POSITION_CHOICES,
} from '../ui/interactionPromptPosition.js';
import {
  DEFAULT_FABRICATE_THEME,
  FABRICATE_THEME_CHOICES,
  applyFabricateTheme,
} from '../ui/theme.js';

import { registerRepairComponentSourcesMenu } from './repairComponentSources.js';

export const FABRICATE_SETTINGS_NAMESPACE = 'fabricate';

export const SETTING_KEYS = Object.freeze({
  RECIPES: 'recipes',
  CRAFTING_SYSTEMS: 'craftingSystems',
  GATHERING_ENVIRONMENTS: 'gatheringEnvironments',
  GATHERING_CONFIG: 'gatheringConfig',
  GATHERING_PARTIES: 'gatheringParties',
  LAST_CRAFTING_ACTOR: 'lastCraftingActor',
  LAST_GATHERING_ACTOR: 'lastGatheringActor',
  LAST_COMPONENT_SOURCES: 'lastComponentSources',
  LAST_MANAGED_CRAFTING_SYSTEM: 'lastManagedCraftingSystem',
  MANAGER_RAIL_COLLAPSED: 'managerRailCollapsed',
  GATHERING_HIDE_UNAVAILABLE: 'gatheringHideUnavailableEnvironments',
  PROGRESSIVE_RESULT_ORDER: 'progressiveResultOrder',
  MIGRATION_VERSION: 'migrationVersion',
  FAVOURITE_RECIPES: 'favouriteRecipes',
  LAST_ALCHEMY_SYSTEM: 'lastAlchemySystem',
  THEME: 'theme',
  EXPERIMENTAL_FEATURES: 'experimentalFeatures',
  INTERACTION_PROMPT_POSITION: 'interactionPromptPosition',
  // Issue 555 (repurposed by issue 567): version stamp for the one-shot primary-GM
  // recipe-item durable-flag backfill. Bumped past `RECIPE_ITEM_FLAG_STAMP_TARGET` once the
  // pass has run so it never repeats. Target 2 backfills the per-system
  // `roles[systemId].recipeItemDefinitionId` leaf (v1 stamped the retired scalar).
  RECIPE_ITEM_FLAG_STAMP_VERSION: 'recipeItemFlagStampVersion',
  // Issue 556: version stamp for the one-shot primary-GM component durable-flag backfill
  // that writes `flags.fabricate.roles[systemId].componentId` on registered component
  // sources. Bumped past `COMPONENT_FLAG_STAMP_TARGET` once the pass has run.
  COMPONENT_FLAG_STAMP_VERSION: 'componentFlagStampVersion',
  // Issue 561: version stamp for the one-shot primary-GM TOOL durable-flag backfill that
  // writes `flags.fabricate.roles[systemId].toolId` on registered tool sources. Bumped past
  // `TOOL_FLAG_STAMP_TARGET` once the pass has run.
  TOOL_FLAG_STAMP_VERSION: 'toolFlagStampVersion',
  // Issue 600 (#540 Phase 2): version stamp for the one-shot active-GM re-stamp that writes
  // `flags.fabricate.roles[systemId].componentId` onto OWNED ACTOR items that currently
  // resolve to a component by name ONLY. Bumped past `OWNED_ITEM_COMPONENT_STAMP_TARGET`
  // once the pass has run so it never repeats.
  OWNED_ITEM_COMPONENT_STAMP_VERSION: 'ownedItemComponentStampVersion',
});

// The target version for the one-shot recipe-item flag auto-stamp. When the stored
// `RECIPE_ITEM_FLAG_STAMP_VERSION` is below this, the primary GM runs the backfill once
// on `ready` and writes this value back. Bumped 1 → 2 by issue 567: v1 stamped the retired
// scalar `flags.fabricate.recipeItemDefinitionId`, v2 backfills the per-system
// `roles[systemId].recipeItemDefinitionId` leaf, so a world stamped at v1 re-runs once.
export const RECIPE_ITEM_FLAG_STAMP_TARGET = 2;

// The target version for the one-shot component flag auto-stamp (issue 556). When the
// stored `COMPONENT_FLAG_STAMP_VERSION` is below this, the primary GM runs the backfill
// once on `ready` and writes this value back.
export const COMPONENT_FLAG_STAMP_TARGET = 1;

// The target version for the one-shot tool flag auto-stamp (issue 561). When the stored
// `TOOL_FLAG_STAMP_VERSION` is below this, the primary GM runs the backfill once on `ready`
// (AFTER the 1.15.0 settings-data migration populates tool source refs) and writes it back.
export const TOOL_FLAG_STAMP_TARGET = 1;

// The target version for the one-shot owned-item component re-stamp (issue 600, #540 Phase
// 2). When the stored `OWNED_ITEM_COMPONENT_STAMP_VERSION` is below this, the active GM runs
// the name-fallback back-fill once on `ready` (AFTER the source-side component auto-stamp)
// and writes this value back.
export const OWNED_ITEM_COMPONENT_STAMP_TARGET = 1;

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
  // Player-side "hide unavailable (locked) environments" preference for the
  // Gathering app's Environments column. `scope: 'client'` persists it in the
  // browser's `localStorage`, so the choice is per client/device, not per user
  // account, and does not follow the user to a second device. Hidden from the
  // Foundry settings menu (`config: false`); toggled from the app UI. Defaults
  // to false (show all).
  [SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE]: {
    name: 'Hide Unavailable Gathering Environments',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
  },
  [SETTING_KEYS.PROGRESSIVE_RESULT_ORDER]: {
    name: 'Progressive Result Order Preferences',
    // `user` scope (issue 651), NOT `client`: a player's chosen stage order is a standing
    // preference that must reach them on any device they open this world from, rather
    // than sit in one browser's localStorage. This is per user PER WORLD (the same player
    // in a second world gets a fresh order) — never describe it as following the account,
    // which is wrong for `user` scope. Note also that `set` is now an async, replicated
    // document write that can reject, not a synchronous localStorage write.
    //
    // The flip needed no data migration, and the reason is NOT "nothing reads it" —
    // that would not imply absence. The real reason: NO WRITER EXISTED before this
    // change introduced one. The scope flip and the first real writer,
    // `setProgressiveResultOrder`, landed in the same commit, so no stored value
    // predated it: until then the only `setSetting` call for this key lived in
    // `cleanupStalePreferences`, which fires only when `changed` is true, which
    // required entries nothing created, so the map stayed its `{}` default. Foundry
    // also has no scope-migration facility (`ClientSettings#get` dispatches on scope
    // at read time), so any pre-existing localStorage key is orphaned in place —
    // never read, never deleted, never an error.
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
});

const keys = Object.values(SETTING_KEYS);

export function registerFabricateSettings() {
  for (const key of keys) {
    const definition = BASE_DEFINITIONS[key];
    game.settings.register(FABRICATE_SETTINGS_NAMESPACE, key, definition);
  }
  // GM maintenance button, surfaced alongside the theme selector in module settings.
  registerRepairComponentSourcesMenu();
}

export function getSetting(key) {
  return game.settings.get(FABRICATE_SETTINGS_NAMESPACE, key);
}

export async function setSetting(key, value) {
  return game.settings.set(FABRICATE_SETTINGS_NAMESPACE, key, value);
}
