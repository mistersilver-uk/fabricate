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
const WORLD_VOCABULARY_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.WORLD_VOCABULARY}`;

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
 */
function everySystemScopes(craftingSystemManager, domains) {
  const systems = craftingSystemManager?.getSystems?.() ?? [];
  return (Array.isArray(systems) ? systems : [])
    .filter((system) => system?.id)
    .map((system) => ({ systemId: system.id, domains }));
}

/** The union of the three domains the two character libraries carried between them. */
const CHARACTER_LIBRARY_DOMAINS = Object.freeze([
  INVALIDATION_DOMAINS.LABELLING,
  INVALIDATION_DOMAINS.RESOLUTION_CONFIG,
  INVALIDATION_DOMAINS.ACCESS_AND_KNOWLEDGE,
]);

/** The domains each world SCOPE key announces (issue 1359, epic 1357). */
const COMPONENT_SCOPE_DOMAINS = domainsForSystemFields(['components']);
const ESSENCE_SCOPE_DOMAINS = domainsForSystemFields(['essenceDefinitions']);
const TOOL_SCOPE_DOMAINS = domainsForSystemFields(['tools']);
/** The domains a WORLD VOCABULARY edit announces (issue 1392, epic 1357, PR 7a). */
const WORLD_VOCABULARY_DOMAINS = domainsForSystemFields([
  'componentCategories',
  'categories',
  'itemTags',
]);

/** The invalidation scopes a world currency edit produces (issue 1278). */
function currencyParticipantScopes(craftingSystemManager) {
  const systems = craftingSystemManager?.getSystems?.() ?? [];
  return (Array.isArray(systems) ? systems : [])
    .filter((system) => system?.requirements?.currency?.enabled === true)
    .map((system) => ({
      systemId: system.id,
      domains: [INVALIDATION_DOMAINS.RESOLUTION_CONFIG],
    }));
}

/** The invalidation scopes a manager's most recent replicated change produced (issue 1078 B1). */
function replicatedScopes(manager) {
  return typeof manager?.consumeReplicatedChangeScopes === 'function'
    ? manager.consumeReplicatedChangeScopes()
    : [];
}

/** Emit the scoped change signal for a whole-corpus replicated reload. */
function announceScopedChange(source, manager, callAll) {
  emitCraftingDataChanged(
    craftingDataChange({ source, scopes: replicatedScopes(manager) }),
    callAll
  );
}

/**
 * The WORLD-STORE legs: a replicated world setting whose reaction is always the same three steps —
 * reload the store, republish the manager, then announce the scopes that edit produced.
 */
const WORLD_STORE_LEGS = Object.freeze([
  { key: CURRENCY_CONFIG_KEY, store: 'currencyConfigStore', scopes: currencyParticipantScopes },
  { key: TRAVEL_CONFIG_KEY, store: 'travelStore', scopes: travelParticipantScopes },
  {
    key: CHARACTER_LIBRARIES_KEY,
    store: 'characterLibrariesStore',
    scopes: (manager) => everySystemScopes(manager, CHARACTER_LIBRARY_DOMAINS),
  },
  // Issue 1359 (epic 1357).
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
  // Issue 1392 (epic 1357, PR 7a).
  {
    key: WORLD_VOCABULARY_KEY,
    store: 'worldVocabularyStore',
    scopes: (manager) => everySystemScopes(manager, WORLD_VOCABULARY_DOMAINS),
  },
]);

/** Run one world-store leg. */
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
 * Bridge a replicated Fabricate world-setting change into the local change hooks the player app
 * listens on.
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
    // `load()` re-reads the setting into the store's in-memory list; it only reads, so there is no
    // write → `updateSetting` → write loop.
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
    // Issue 1024.
    callAll?.('fabricate.playerCharacterTypesChanged');
    return true;
  }
  return false;
}
