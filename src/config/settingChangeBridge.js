import { craftingDataChange, emitCraftingDataChanged } from '../systems/craftingDataChange.js';
import { domainsForSystemFields, INVALIDATION_DOMAINS } from '../systems/invalidationDomains.js';

import { FABRICATE_SETTINGS_NAMESPACE, SETTING_KEYS } from './settings.js';

const CRAFTING_SYSTEMS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CRAFTING_SYSTEMS}`;
const RECIPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPES}`;
const GATHERING_ENVIRONMENTS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`;
const PLAYER_CHARACTER_TYPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES}`;
const CURRENCY_CONFIG_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CURRENCY_CONFIG}`;
const TRAVEL_CONFIG_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.TRAVEL_CONFIG}`;
const CHARACTER_LIBRARIES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CHARACTER_LIBRARIES}`;
const COMPONENT_SCOPE_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.COMPONENT_SCOPE}`;
const ESSENCE_SCOPE_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ESSENCE_SCOPE}`;
const TOOL_SCOPE_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.TOOL_SCOPE}`;

/**
 * The invalidation scopes a world travel edit produces (issue 1282).
 *
 * Realms used to live on the crafting system, so editing one wrote `craftingSystems` and the
 * systems branch announced `resolution-config` for that system through
 * `SYSTEM_FIELD_DOMAINS.gatheringRealms`. That row is unreachable for realm DATA now — the key
 * has left the system record — so this leg has to announce it instead.
 *
 * Scoped per PARTICIPATING system rather than as one unattributable world-wide scope, because
 * `craftingDataChange` treats an unattributable leg as poisoning the whole payload into a broad
 * invalidation. A system with travel switched off gates nothing on location, so re-narrowing it
 * could not produce an observable difference.
 *
 * @param {{ getSystems: () => any[] }|null|undefined} craftingSystemManager
 * @returns {Array<{systemId: string, domains: readonly string[]}>}
 */
function travelParticipantScopes(craftingSystemManager) {
  const systems = craftingSystemManager?.getSystems?.() ?? [];
  return (Array.isArray(systems) ? systems : [])
    .filter((system) => system?.gatheringRealmSettings?.enabled === true)
    .map((system) => ({
      systemId: system.id,
      domains: [INVALIDATION_DOMAINS.RESOLUTION_CONFIG],
    }));
}

/**
 * The scopes an UNATTRIBUTABLE world edit announces: EVERY crafting system, each carrying the same
 * domain set.
 *
 * NO PARTICIPATION FILTER, unlike currency and travel above, because these world settings have no
 * participation flag to filter on — any system may reference any entry by id, so any system may be
 * affected.
 *
 * THE DOMAINS ARE A UNION PER KEY, and narrowing them would silently under-invalidate: one setting
 * cannot say WHICH of the facts it carries moved. This is the same
 * cannot-attribute-so-carry-all reasoning `invalidationDomains.js` applies to a component rewrite.
 * Before issue 1308 the two character libraries lived on the crafting system and were classified
 * separately — `modifiers: [RESOLUTION_CONFIG]` and `characterPrerequisites: [LABELLING,
 * ACCESS_AND_KNOWLEDGE]` — so copying the currency leg's `RESOLUTION_CONFIG`-only scope would have
 * stopped announcing `labelling` and `access-and-knowledge` altogether.
 *
 * @param {{ getSystems: () => any[] }|null|undefined} craftingSystemManager
 * @param {readonly string[]} domains
 * @returns {Array<{systemId: string, domains: readonly string[]}>}
 */
function everySystemScopes(craftingSystemManager, domains) {
  const systems = craftingSystemManager?.getSystems?.() ?? [];
  return (Array.isArray(systems) ? systems : [])
    .filter((system) => system?.id)
    .map((system) => ({ systemId: system.id, domains }));
}

/**
 * The union of the three domains the two character libraries carried between them.
 *
 * @type {readonly string[]}
 */
const CHARACTER_LIBRARY_DOMAINS = Object.freeze([
  INVALIDATION_DOMAINS.LABELLING,
  INVALIDATION_DOMAINS.RESOLUTION_CONFIG,
  INVALIDATION_DOMAINS.ACCESS_AND_KNOWLEDGE,
]);

/**
 * The domains each world SCOPE key announces (issue 1359, epic 1357).
 *
 * DERIVED FROM `SYSTEM_FIELD_DOMAINS`, never restated. Each world scope shadows exactly one
 * in-system key, so the honest answer is that key's own row: a world component edit is
 * indistinguishable, to a consumer, from the `components` rewrite it will become after the
 * migration. Deriving it is also what keeps `SYSTEM_FIELD_DOMAINS` free of the three rows it must
 * NOT gain — that map classifies top-level keys of a persisted crafting-system record, and a world
 * setting is not one.
 */
const COMPONENT_SCOPE_DOMAINS = domainsForSystemFields(['components']);
const ESSENCE_SCOPE_DOMAINS = domainsForSystemFields(['essenceDefinitions']);
const TOOL_SCOPE_DOMAINS = domainsForSystemFields(['tools']);

/**
 * The invalidation scopes a world currency edit produces (issue 1278).
 *
 * Currency used to be per-system state, so editing it wrote `requirements` on a crafting system
 * and the ordinary systems branch announced `resolution-config` for THAT system. The ladder is
 * world scope now and no system record changes, so without this a GM's edit is invisible to every
 * connected player: their shells keep projecting costs against the ladder they last read.
 *
 * The scope stays PER SYSTEM rather than becoming one unattributable world-wide scope, because
 * `craftingDataChange` treats an unattributable leg as poisoning the whole payload into a broad
 * invalidation. Only systems that PARTICIPATE are listed: a system with
 * `requirements.currency.enabled === false` resolves nothing against the ladder, so re-narrowing
 * it would be work with no possible observable difference.
 *
 * @param {{ getSystems: () => any[] }|null|undefined} craftingSystemManager
 * @returns {Array<{systemId: string, domains: readonly string[]}>}
 */
function currencyParticipantScopes(craftingSystemManager) {
  const systems = craftingSystemManager?.getSystems?.() ?? [];
  return (Array.isArray(systems) ? systems : [])
    .filter((system) => system?.requirements?.currency?.enabled === true)
    .map((system) => ({
      systemId: system.id,
      domains: [INVALIDATION_DOMAINS.RESOLUTION_CONFIG],
    }));
}

/**
 * The invalidation scopes a manager's most recent replicated change produced (issue 1078 B1).
 *
 * A manager fake without the method answers with NO scopes, which every consumer routes
 * broadly — the same fail-safe an unrecognised payload gets, and the reason the many bridge
 * fixtures that stub `{reload, getRecipes}` keep working without being taught about domains.
 *
 * @param {object|null|undefined} manager
 * @returns {object[]}
 */
function replicatedScopes(manager) {
  return typeof manager?.consumeReplicatedChangeScopes === 'function'
    ? manager.consumeReplicatedChangeScopes()
    : [];
}

/**
 * Emit the scoped change signal for a whole-corpus replicated reload.
 *
 * @param {'recipes'|'systems'} source
 * @param {object} manager
 * @param {((hook: string, payload: object) => void)|undefined} callAll
 * @returns {void}
 */
function announceScopedChange(source, manager, callAll) {
  emitCraftingDataChanged(
    craftingDataChange({ source, scopes: replicatedScopes(manager) }),
    callAll
  );
}

/**
 * The WORLD-STORE legs: a replicated world setting whose reaction is always the same three steps —
 * reload the store, republish the manager, then announce the scopes that edit produced.
 *
 * A TABLE rather than six near-identical branches, and the ORDER OF THE STEPS is the load-bearing
 * part rather than the shape. `load()` MUST precede both announcements, because every consumer
 * that reacts reads the corpus back through the store: announcing first hands them the pre-edit
 * value and caches that as the new truth. `load()` only reads, so there is no
 * write -> `updateSetting` -> write loop.
 *
 * The manager republish is UNCONDITIONAL, for the reason the currency leg first stated: a second
 * GM's authoring surface is stale whether or not any crafting system currently participates, and
 * the manager subscribes to the three published hooks rather than to the unpublished
 * `craftingDataChanged` signal.
 *
 * A leg that produces NO scopes emits nothing at all, rather than an empty payload that
 * `craftingDataChange` would route broadly.
 *
 * @type {ReadonlyArray<{key: string, store: string,
 *   scopes: (manager: object) => Array<{systemId: string, domains: readonly string[]}>}>}
 */
const WORLD_STORE_LEGS = Object.freeze([
  { key: CURRENCY_CONFIG_KEY, store: 'currencyConfigStore', scopes: currencyParticipantScopes },
  { key: TRAVEL_CONFIG_KEY, store: 'travelStore', scopes: travelParticipantScopes },
  {
    key: CHARACTER_LIBRARIES_KEY,
    store: 'characterLibrariesStore',
    scopes: (manager) => everySystemScopes(manager, CHARACTER_LIBRARY_DOMAINS),
  },
  // Issue 1359 (epic 1357). Without these three, a client that booted before the migrating GM
  // wrote keeps `isSeeded() === false` for the whole session — harmless while the change is
  // additive, but once the migration strips the in-system arrays that client has an unseeded world
  // corpus AND an empty legacy corpus, so its union read answers NOTHING and it sees no
  // components, essences or tools at all until reload.
  {
    key: COMPONENT_SCOPE_KEY,
    store: 'componentScopeStore',
    scopes: (manager) => everySystemScopes(manager, COMPONENT_SCOPE_DOMAINS),
  },
  {
    key: ESSENCE_SCOPE_KEY,
    store: 'essenceScopeStore',
    scopes: (manager) => everySystemScopes(manager, ESSENCE_SCOPE_DOMAINS),
  },
  {
    key: TOOL_SCOPE_KEY,
    store: 'toolScopeStore',
    scopes: (manager) => everySystemScopes(manager, TOOL_SCOPE_DOMAINS),
  },
]);

/**
 * Run one world-store leg. See {@link WORLD_STORE_LEGS} for why the three steps are in this order.
 *
 * @param {{key: string, store: string, scopes: Function}} leg
 * @param {object} targets The bridge's dependency bag.
 * @returns {void}
 */
function runWorldStoreLeg(leg, targets) {
  const { craftingSystemManager, callAll } = targets;
  targets[leg.store]?.load?.();
  callAll?.('fabricate.craftingSystemsChanged', craftingSystemManager?.getSystems?.() ?? []);
  const scopes = leg.scopes(craftingSystemManager);
  if (scopes.length > 0) {
    emitCraftingDataChanged(craftingDataChange({ source: 'systems', scopes }), callAll);
  }
}

/**
 * Bridge a replicated Fabricate world-setting change into the local change hooks the
 * player app listens on.
 *
 * Foundry's `createSetting` / `updateSetting` / `deleteSetting` hooks fire on EVERY
 * connected client when a world setting replicates, but Fabricate's
 * `fabricate.craftingSystemsChanged` /
 * `fabricate.recipesChanged` hooks are `Hooks.callAll` — local to the writing (GM)
 * client only. So on a player's client the in-memory managers are stale after a GM
 * edit and nothing tells the open app to refresh. This reloads the affected manager
 * from the freshly-replicated setting and re-emits the matching change hook.
 *
 * The manager's `reload()` returns `false` when the normalized data is unchanged —
 * true on the writing client, whose map already holds the saved data — so no
 * redundant hook is re-emitted there (avoiding a double refresh). This never writes a
 * setting, so there is no `updateSetting` → write → `updateSetting` loop.
 *
 * @param {string} settingKey Fully-qualified `namespace.key` of the changed setting.
 * @param {object} deps
 * @param {{ reload: () => boolean, getSystems: () => any[] }} [deps.craftingSystemManager]
 * @param {{ reload: () => boolean, getRecipes: () => any[] }} [deps.recipeManager]
 * @param {{ load: () => any }} [deps.currencyConfigStore] The world currency config store
 *   (issue 1278), reloaded so a GM's ladder edit is visible on every client. The store caches
 *   the config in memory and otherwise only re-reads at startup, so without this a player's
 *   currency costs keep resolving against a stale ladder.
 * @param {{ load: () => any[] }} [deps.gatheringEnvironmentStore] Gathering environment
 *   store, reloaded so replicated `nodeRuntime` changes (a GM-applied gather
 *   depletion, a restock, a world-time respawn) are visible on every client. The
 *   store caches `environments` in memory and otherwise only re-reads at startup, so
 *   without this a client's node counts silently diverge from the world.
 * @param {{ load: () => any }} [deps.travelStore] The world travel config store (issue 1282).
 * @param {{ load: () => any }} [deps.characterLibrariesStore] The world character libraries store
 *   (issue 1308).
 * @param {{ load: () => any }} [deps.componentScopeStore] The world component scope store
 *   (issue 1359), reloaded so a GM's world component edit is visible on every client. Absent it,
 *   a client keeps an unseeded world corpus for the whole session.
 * @param {{ load: () => any }} [deps.essenceScopeStore] The world essence scope store (issue 1359).
 * @param {{ load: () => any }} [deps.toolScopeStore] The world tool scope store (issue 1359).
 * @param {(hook: string, payload: any) => void} deps.callAll Bound `Hooks.callAll`.
 * @returns {boolean} `true` when `settingKey` was a handled Fabricate data setting.
 */
export function handleFabricateSettingChange(settingKey, targets = {}) {
  const { craftingSystemManager, recipeManager, gatheringEnvironmentStore, callAll } = targets;
  if (settingKey === CRAFTING_SYSTEMS_KEY) {
    if (craftingSystemManager?.reload?.()) {
      callAll?.('fabricate.craftingSystemsChanged', craftingSystemManager.getSystems());
      announceScopedChange('systems', craftingSystemManager, callAll);
    }
    return true;
  }
  if (settingKey === RECIPES_KEY) {
    if (recipeManager?.reload?.()) {
      callAll?.('fabricate.recipesChanged', {
        action: 'external',
        recipes: recipeManager.getRecipes(),
      });
      announceScopedChange('recipes', recipeManager, callAll);
    }
    return true;
  }
  if (settingKey === GATHERING_ENVIRONMENTS_KEY) {
    // `load()` re-reads the setting into the store's in-memory list; it only reads,
    // so there is no write → `updateSetting` → write loop. The hook then tells open
    // views to re-project — without it the reload is invisible, since a player whose
    // gather was applied BY THE GM has no other signal that their node counts moved.
    // Unlike the manager reloads above there is no "unchanged" short-circuit to gate
    // on: the store's `load()` returns the list, not a changed flag.
    gatheringEnvironmentStore?.load?.();
    callAll?.('fabricate.gatheringEnvironmentsChanged');
    return true;
  }
  const worldStoreLeg = WORLD_STORE_LEGS.find((leg) => leg.key === settingKey);
  if (worldStoreLeg) {
    runWorldStoreLeg(worldStoreLeg, targets);
    return true;
  }
  if (settingKey === PLAYER_CHARACTER_TYPES_KEY) {
    // Issue 1024. There is nothing to reload: the predicate reads the setting per
    // call, and by the time this hook fires Foundry has already replicated the new
    // value into `game.settings`. What IS needed is a local signal, because every
    // surface governed by the player-character concept — the actor-selection bar, the
    // GM stamina roster, the manager's Access and Knowledge rosters, the party member
    // picker — projected its list once and will otherwise show a stale roster until
    // reload. This never writes a setting, so there is no write loop.
    callAll?.('fabricate.playerCharacterTypesChanged');
    return true;
  }
  return false;
}
