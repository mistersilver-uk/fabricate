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
  GATHERING_ENVIRONMENTS: 'gatheringEnvironments',
  GATHERING_CONFIG: 'gatheringConfig',
  GATHERING_PARTIES: 'gatheringParties',
  // Issue 901: secret state for in-flight BLIND gathering runs, keyed by run id —
  // the drawn task, its start-time snapshot, and its provisional node reservation.
  // `scope: 'world'` is the WHOLE POINT: only a GM may update a world Setting, so a
  // player can no longer forge the task their blind run will yield (it used to live
  // on an Actor flag they own). It is NOT a confidentiality store — Foundry has no
  // server-side read authorization — see `GatheringBlindRunStore`.
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
  // Issue 1024: the ADDITIONAL actor types a GM designates as player characters.
  // `'character'` is unioned in by `resolvePlayerCharacterTypes` and is never stored
  // here, so an existing dnd5e/pf2e world is unaffected by the default `[]`. Edited
  // through the `playerCharacterActorTypes` settings menu, not a config field.
  ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES: ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY,
  // Issue 1024 (#853 proposal 1): the dotted path Fabricate reads AND writes for an
  // item's stack size. `world`-scoped because a Foundry world runs exactly one game
  // system and one owned Item can participate in two crafting systems at once — a
  // per-crafting-system path would make a single document's stack count AMBIGUOUS
  // rather than configurable.
  ITEM_STACK_QUANTITY_PATH: 'itemStackQuantityPath',
  // Issue 1080 (-b): the observed and intended arrangement of recipe definition storage.
  // See DEFINITION_STORAGE_LAYOUTS / DEFINITION_STORAGE_TARGETS below for the values, and
  // `PerRecordCraftingDefinitionRepository` for why these are the ONLY two keys the
  // per-record backend registers.
  RECIPE_STORAGE_LAYOUT: 'recipeStorageLayout',
  RECIPE_STORAGE_TARGET: 'recipeStorageTarget',
});

/**
 * **Definition Storage Layout** — how definition storage is arranged *now*, observed.
 *
 * `unsettled` is a layout, not a lifecycle state: it says the corpus is currently spread
 * across both arrangements and neither can be read alone. It is the sole discriminator a
 * crashed Storage Layout Conversion resumes from, which is why the layout MUST NOT be
 * inferred from any data key's presence or emptiness.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DEFINITION_STORAGE_LAYOUTS = Object.freeze({
  SINGLE_ARRAY: 'singleArray',
  UNSETTLED: 'unsettled',
  PER_RECORD: 'perRecord',
});

/**
 * **Definition Storage Target** — how definition storage is *meant* to be arranged, config.
 *
 * Deliberately narrower than the layout: `unsettled` is something storage can BE and never
 * something an operator can ask for.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DEFINITION_STORAGE_TARGETS = Object.freeze({
  SINGLE_ARRAY: 'singleArray',
  PER_RECORD: 'perRecord',
});

/**
 * The localized labels the Definition Storage Target's `config: true` row offers.
 *
 * Written out rather than derived from {@link DEFINITION_STORAGE_TARGETS} by string
 * manipulation, so every localization key in this file is greppable from `lang/en.json`.
 * That makes it a hand-maintained mirror of the target enumeration, and a mirror rots
 * silently — a `choices` map missing a stored value renders the raw key in the dropdown and
 * offers the GM no way back to it. `tests/recipe-storage-target-control.test.js` therefore
 * asserts that every target has a label and that every label resolves in `lang/en.json`.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const RECIPE_STORAGE_TARGET_CHOICES = Object.freeze({
  [DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY]: 'FABRICATE.Settings.RecipeStorageTarget.SingleArray',
  [DEFINITION_STORAGE_TARGETS.PER_RECORD]: 'FABRICATE.Settings.RecipeStorageTarget.PerRecord',
});

/**
 * The label for an arrangement {@link RECIPE_STORAGE_TARGET_CHOICES} has no entry for.
 *
 * It exists because the LAYOUT enumeration carries a member the operator-facing choices map
 * has no label for and never will: `unsettled` is a real observed state and not a choice a
 * GM can make. Anything that labels a value it may be handed a layout for therefore needs a
 * miss arm, and `String(value)` is not one — it renders the raw internal token into a
 * GM-facing sentence.
 */
export const RECIPE_STORAGE_ARRANGEMENT_UNKNOWN_LABEL_KEY =
  'FABRICATE.Settings.RecipeStorageTarget.UnknownArrangement';

/**
 * The localization key naming one recipe storage arrangement, for a GM-facing sentence.
 *
 * A TOTAL function, deliberately: `data-models/spec.md` forbids a value-to-label helper from
 * falling back to rendering the raw value, and forbidding the leak says what the helper must
 * not do rather than what it must produce. The shipped `Unavailable` and `Failed` notices
 * interpolate this label, so it must still yield a readable phrase for every value — which
 * is why the miss arm is a localization key and not an empty string.
 *
 * @param {*} value a Definition Storage TARGET, a LAYOUT, or anything unreadable.
 * @returns {string} a localization key that always resolves.
 */
export function recipeStorageArrangementLabelKey(value) {
  return RECIPE_STORAGE_TARGET_CHOICES[value] ?? RECIPE_STORAGE_ARRANGEMENT_UNKNOWN_LABEL_KEY;
}

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
  // Map of `runId -> { taskId, snapshot, reservation }` for in-flight blind runs.
  // Written ONLY by the active GM (a player's start is relayed there), because
  // `game.settings.set` replaces rather than merges and there is no compare-and-set.
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
  // `config: false` — edited through the settings-menu picker
  // (`registerPlayerCharacterTypesMenu`), not a raw text field, because the valid
  // values are the actor types the active world declares and a free-text list would
  // be unguessable. No `onChange`, for two independent reasons: propagation already runs
  // through the shared setting listener in `main.js`, and registering both would
  // double-fire (Foundry calls `doc._onUpdate` — which invokes `onChange` — and THEN
  // `Hooks.callAll` on the same document in the same callback); and an `onChange` is the
  // one setting callback with no error containment around it. It runs inside
  // `doc._onUpdate`, BEFORE `Hooks.callAll('updateSetting')`, so a throw there propagates
  // and kills the broadcast for the whole batch on every client. A `Hooks.on` listener has
  // no such hazard — `Hooks.#call` try/catches each listener and routes to
  // `Hooks.onError`.
  [SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES]: {
    name: 'FABRICATE.Settings.PlayerCharacterActorTypes.Name',
    hint: 'FABRICATE.Settings.PlayerCharacterActorTypes.Hint',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  },
  // `config: true` — free text, deliberately, and NOT a `choices` dropdown: the design
  // refuses to auto-append a `.value` leaf and the set of real paths in the wild is
  // open-ended (`.value`, `.val`, `.qty`, bare numbers). The `default` and `hint` are
  // overlaid per game system at registration time by `withActiveSystemDefaults` below.
  // No `onChange`, for the same reason as the setting above: the shared setting
  // listener in `main.js` re-invokes `configureItemStackQuantityPath` and then runs the
  // probe, and registering both would double-fire — two full world scans and two
  // permanent notifications per save, on every client.
  [SETTING_KEYS.ITEM_STACK_QUANTITY_PATH]: {
    name: 'FABRICATE.Settings.ItemStackQuantityPath.Name',
    hint: 'FABRICATE.Settings.ItemStackQuantityPath.Hint',
    scope: 'world',
    config: true,
    type: String,
    default: DEFAULT_ITEM_STACK_QUANTITY_PATH,
  },
  // Issue 1080 (-b). TWO keys, and exactly two: `WorldSettings#getSetting` is a linear
  // `find` with no key index and `ClientSettings.register` calls it, so registering one
  // key per record would be O(N²) before a single recipe is read. The per-record backend
  // therefore registers NOTHING per record and indexes the world `Setting` collection
  // itself — see `PerRecordCraftingDefinitionRepository`. These two are O(1) and stay here
  // with every other Fabricate setting.
  //
  // The LAYOUT stays `config: false` permanently, and that asymmetry is the concept, not an
  // oversight. The layout records how storage is arranged NOW — it is observed state written
  // by the Storage Layout Conversion, and it is that conversion's sole crash-recovery
  // discriminator. A settings row would let a GM assert an arrangement rather than choose
  // one, and a hand-edited layout is indistinguishable from a real one: setting it to
  // `singleArray` over a per-record corpus presents an empty world, and setting it to
  // `perRecord` over a legacy corpus does the same in the other direction.
  [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: {
    name: 'Recipe Definition Storage Layout',
    scope: 'world',
    config: false,
    type: String,
    default: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
  },
  // Issue 1232: the TARGET becomes the GM-facing control, which is what -b deferred to the
  // change that ships a conversion acting on it. It is the supported pre-downgrade
  // reverse-conversion switch named by `data-models/spec.md` § Storage Conversion Crash
  // Recovery: a GM about to downgrade sets it back to `singleArray` and the reverse
  // conversion moves the corpus back into the legacy key before the older build reads it.
  //
  // No `onChange`, for the two reasons stated beside the settings above and one more that is
  // specific to this key. The shared setting listener in `main.js` already routes this key
  // through `settingChangeBridge`, so registering an `onChange` too would DOUBLE-FIRE — and
  // here that means starting two concurrent Storage Layout Conversions on the same corpus.
  // An `onChange` is also the one setting callback with no error containment: it runs inside
  // `doc._onUpdate` ahead of `Hooks.callAll('updateSetting')`, so a conversion failure there
  // would kill the setting broadcast for every client rather than being reported to the GM.
  //
  // Both values are offered even though this build can only perform the reverse conversion.
  // The control has to be able to EXPRESS the arrangement a world is on — a converted world
  // needs `perRecord` selectable to describe itself — and `reconcileRecipeStorageLayout` is
  // the authority on what is reachable: it reverts a target no conversion can satisfy, so a
  // GM choosing one gets it undone and explained rather than a world the Valid Id Basis gate
  // refuses forever.
  [SETTING_KEYS.RECIPE_STORAGE_TARGET]: {
    name: 'FABRICATE.Settings.RecipeStorageTarget.Name',
    hint: 'FABRICATE.Settings.RecipeStorageTarget.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: RECIPE_STORAGE_TARGET_CHOICES,
    default: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
  },
});

const keys = Object.values(SETTING_KEYS);

/**
 * The setting keys stored at `scope: 'world'`, derived from the definitions above
 * rather than restated, so it cannot drift as settings are added or re-scoped.
 *
 * These are the keys an ordinary player cannot update. The real gate is
 * `BaseSetting.#canModify` -> `user.hasPermission('SETTINGS_MODIFY')`, identical in V13
 * and V14, and `SETTINGS_MODIFY` has `defaultRole: ASSISTANT` in both — so a GM may grant
 * it to any role, and it is a PERMISSION rather than a role list.
 *
 * `requiredRoles` is version-dependent, and both earlier versions of this comment got it
 * wrong in opposite directions:
 *
 *   - V13's `SETTINGS_MODIFY` has NO `requiredRoles` (it declares `disableGM: false`), so
 *     a GM's permission there is grantable and revocable like any other.
 *   - V14 (which `module.json` verifies against, and which the smoke boots) DOES declare
 *     `requiredRoles: [USER_ROLES.GAMEMASTER]` in `common/constants.mjs`, and
 *     `User#hasPermission` returns `true` up front when the user's role appears in it.
 *     That means "these roles hold this permission UNREVOKABLY" — a GM cannot be denied
 *     `SETTINGS_MODIFY` — and NOT "only these roles hold it"; the `defaultRole` ladder
 *     still runs for everyone else.
 *
 * The guardrail is unchanged under every reading — a plain player cannot write a world
 * setting by default — but the accurate description is "SETTINGS_MODIFY only", never
 * "GM only".
 *
 * A code path reachable by a user without that permission which writes one of these
 * fails at the server with `User <name> lacks permission to update Setting [...]`, so
 * any such write must be routed to the active GM. Exported so tests can model that
 * refusal instead of assuming an omnipotent settings seam.
 *
 * @type {ReadonlySet<string>}
 */
export const WORLD_SCOPED_SETTING_KEYS = Object.freeze(
  new Set(keys.filter((key) => BASE_DEFINITIONS[key]?.scope === 'world'))
);

/**
 * Overlay the ACTIVE game system's defaults onto a frozen base definition.
 *
 * `BASE_DEFINITIONS` is frozen at module import, when `game` may not exist at all, so
 * the per-system stack-quantity preset has to be applied here instead. Three details
 * are load-bearing:
 *
 *   - every `game` read is optional-chained, because existing tests call
 *     `registerFabricateSettings()` against a stub with no `system` and no `i18n`;
 *   - a NEW object is built rather than the shared entry mutated, since `Object.freeze`
 *     is shallow and `ClientSettings#register` mutates the object it is handed; and
 *   - the result can never be `undefined`, because `register` applies
 *     `data.default ??= null`, which would make every read return `null` rather than a
 *     usable path.
 *
 * The hint names the active system's default VERBATIM so a GM edits a known-good string
 * rather than inventing one. Foundry localizes a hint at render time and
 * `Localization#localize` returns a non-key string unchanged, so pre-formatting here is
 * safe.
 *
 * @param {string} key The setting key.
 * @param {object} definition The frozen base definition.
 * @returns {object} The definition to register.
 */
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
