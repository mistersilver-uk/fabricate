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
  // Issue 1278: the world-scoped currency configuration — the coin ladder, the spend
  // strategy, the selected provider and the GM macro set. It is world scope because a
  // world runs exactly ONE Foundry game system, so there is exactly one way actors store
  // coins; two crafting systems cannot meaningfully disagree about how to read the same
  // actor's purse. Each crafting system keeps only `requirements.currency.enabled`, which
  // decides whether that system PARTICIPATES in the world's currency, not what it is.
  CURRENCY_CONFIG: 'currencyConfig',
  // Issue 1282: the world-scoped travel configuration — the realm library, the reveal mode and the
  // modifier visibility.
  TRAVEL_CONFIG: 'travelConfig',
  // Issue 1308: the world-scoped character libraries — the character-prerequisite library and the
  // modifier library, as `{ characterPrerequisites: [], modifiers: [] }`.
  CHARACTER_LIBRARIES: 'characterLibraries',
  // Issue 1359 (epic 1357): the three WORLD-SCOPE entity definition settings — the World Component,
  // World Essence and World Tool rosters, their world defaults, and the per-`(entity, system)`
  // membership records.
  COMPONENT_SCOPE: 'componentScope',
  ESSENCE_SCOPE: 'essenceScope',
  TOOL_SCOPE: 'toolScope',
  // Issue 1392 (epic 1357, PR 7a): the WORLD VOCABULARY — component categories, component tags and
  // recipe categories, authored once for the world instead of once per crafting system.
  WORLD_VOCABULARY: 'worldVocabulary',
  // Issue 1363 (epic 1357, PR 3): the `1.30.0` migration's DURABLE DECISION RECORD — the per-system
  // `{ components: {oldId: newId}, tools: {...} }` re-key map, written as the FIRST writeback leg
  // so a torn pass is recoverable whichever later legs landed.
  WORLD_SCOPE_REKEY_MAP: 'worldScopeRekeyMap',
  // Issue 1654: the `1.34.0` equivalent-essence merge's durable decision record, written as the
  // second writeback leg (after `worldScopeRekeyMap`, before `recipes`) so a torn pass is
  // recoverable.
  WORLD_ESSENCE_MERGE_MAP: 'worldEssenceMergeMap',
  GATHERING_ENVIRONMENTS: 'gatheringEnvironments',
  GATHERING_CONFIG: 'gatheringConfig',
  GATHERING_PARTIES: 'gatheringParties',
  // Issue 901: secret state for in-flight BLIND gathering runs, keyed by run id — the drawn task,
  // its start-time snapshot, and its provisional node reservation.
  GATHERING_BLIND_RUNS: 'gatheringBlindRuns',
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
  // Issue 555 (repurposed by issue 567): version stamp for the one-shot primary-GM recipe-item
  // durable-flag backfill.
  RECIPE_ITEM_FLAG_STAMP_VERSION: 'recipeItemFlagStampVersion',
  // Issue 556: version stamp for the one-shot primary-GM component durable-flag backfill that
  // writes `flags.fabricate.roles[systemId].componentId` on registered component sources.
  COMPONENT_FLAG_STAMP_VERSION: 'componentFlagStampVersion',
  // Issue 561: version stamp for the one-shot primary-GM TOOL durable-flag backfill that writes
  // `flags.fabricate.roles[systemId].toolId` on registered tool sources.
  TOOL_FLAG_STAMP_VERSION: 'toolFlagStampVersion',
  // Issue 600 (#540 Phase 2): version stamp for the one-shot active-GM re-stamp that writes
  // `flags.fabricate.roles[systemId].componentId` onto OWNED ACTOR items that currently resolve to
  // a component by name ONLY.
  OWNED_ITEM_COMPONENT_STAMP_VERSION: 'ownedItemComponentStampVersion',
  // Issue 1363 (epic 1357, PR 3): version stamp for the one-shot active-GM pass that remaps the
  // durable identity flags the `1.30.0` re-key invalidates.
  WORLD_SCOPE_IDENTITY_FLAG_VERSION: 'worldScopeIdentityFlagVersion',
  // Issue 1654: version stamp for the one-shot active-GM pass that remaps the durable identity
  // flags the `1.34.0` essence merge invalidates.
  WORLD_ESSENCE_MERGE_FLAG_VERSION: 'worldEssenceMergeFlagVersion',
  // Issue 1024: the ADDITIONAL actor types a GM designates as player characters.
  ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES: ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY,
  // Issue 1024 (#853 proposal 1): the dotted path Fabricate reads AND writes for an item's stack
  // size.
  ITEM_STACK_QUANTITY_PATH: 'itemStackQuantityPath',
});

// The target version for the one-shot recipe-item flag auto-stamp.
export const RECIPE_ITEM_FLAG_STAMP_TARGET = 2;

// The target version for the one-shot component flag auto-stamp (issue 556).
export const COMPONENT_FLAG_STAMP_TARGET = 2;

// The target version for the one-shot tool flag auto-stamp (issue 561).
export const TOOL_FLAG_STAMP_TARGET = 2;

// The target version for the one-shot owned-item component re-stamp (issue 600, #540 Phase 2).
export const OWNED_ITEM_COMPONENT_STAMP_TARGET = 1;

// The target version for the one-shot world-scope identity-flag remap (issue 1363, epic 1357).
export const WORLD_SCOPE_IDENTITY_FLAG_TARGET = 1;

// The target version for the one-shot essence-merge identity-flag remap (issue 1654).
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
  // Issue 1392 (epic 1357, PR 7a).
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
  // Player-side "hide unavailable (locked) environments" preference for the Gathering app's
  // Environments column.
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
    // preference that must reach them on any device they open this world from, rather than sit in
    // one browser's localStorage.
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
  // `config: false` — edited through the settings-menu picker (`registerPlayerCharacterTypesMenu`),
  // not a raw text field, because the valid values are the actor types the active world declares
  // and a free-text list would be unguessable.
  [SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES]: {
    name: 'FABRICATE.Settings.PlayerCharacterActorTypes.Name',
    hint: 'FABRICATE.Settings.PlayerCharacterActorTypes.Hint',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  },
  // `config: true` — free text, deliberately, and NOT a `choices` dropdown: the design refuses to
  // auto-append a `.value` leaf and the set of real paths in the wild is open-ended (`.value`,
  // `.val`, `.qty`, bare numbers).
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

/**
 * The setting keys stored at `scope: 'world'`, derived from the definitions above rather than
 * restated, so it cannot drift as settings are added or re-scoped.
 */
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
  // GM maintenance button, surfaced alongside the theme selector in module settings.
  registerRepairItemDataMenu();
  // Player-character actor-types picker (issue 1024), same panel.
  registerPlayerCharacterTypesMenu();
}

export function getSetting(key) {
  return game.settings.get(FABRICATE_SETTINGS_NAMESPACE, key);
}

export async function setSetting(key, value) {
  return game.settings.set(FABRICATE_SETTINGS_NAMESPACE, key, value);
}
