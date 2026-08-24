import { craftingDataChange, emitCraftingDataChanged } from '../systems/craftingDataChange.js';
import { INVALIDATION_DOMAINS } from '../systems/invalidationDomains.js';

import { FABRICATE_SETTINGS_NAMESPACE, SETTING_KEYS } from './settings.js';

const CRAFTING_SYSTEMS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CRAFTING_SYSTEMS}`;
const RECIPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPES}`;
const GATHERING_ENVIRONMENTS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`;
const PLAYER_CHARACTER_TYPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES}`;
const CURRENCY_CONFIG_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CURRENCY_CONFIG}`;
const TRAVEL_CONFIG_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.TRAVEL_CONFIG}`;
const CHARACTER_LIBRARIES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CHARACTER_LIBRARIES}`;

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
 * The scopes a character-libraries change announces (issue 1308): EVERY crafting system, each
 * carrying the UNION of the three invalidation domains the two libraries used to carry between
 * them.
 *
 * NO PARTICIPATION FILTER, unlike currency and travel above, because there is no participation
 * flag to filter on — any system may reference any entry by id, so any system may be affected.
 *
 * THE DOMAINS ARE A UNION, and narrowing them would silently under-invalidate. Before this move
 * the two libraries lived on the crafting system and were classified separately —
 * `modifiers: [RESOLUTION_CONFIG]` and `characterPrerequisites: [LABELLING,
 * ACCESS_AND_KNOWLEDGE]` — so an edit to either announced its own domains through the
 * `craftingSystems` write. One setting cannot say WHICH library moved, so it must announce all
 * three; copying the currency leg's `RESOLUTION_CONFIG`-only scope would silently stop
 * announcing `labelling` and `access-and-knowledge` altogether. This is the same
 * cannot-attribute-so-carry-all reasoning `invalidationDomains.js` applies to a component
 * rewrite.
 *
 * @param {{ getSystems: () => any[] }|null|undefined} craftingSystemManager
 * @returns {Array<{systemId: string, domains: readonly string[]}>}
 */
function characterLibraryScopes(craftingSystemManager) {
  const systems = craftingSystemManager?.getSystems?.() ?? [];
  return (Array.isArray(systems) ? systems : [])
    .filter((system) => system?.id)
    .map((system) => ({
      systemId: system.id,
      domains: [
        INVALIDATION_DOMAINS.LABELLING,
        INVALIDATION_DOMAINS.RESOLUTION_CONFIG,
        INVALIDATION_DOMAINS.ACCESS_AND_KNOWLEDGE,
      ],
    }));
}

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
 * @param {(hook: string, payload: any) => void} deps.callAll Bound `Hooks.callAll`.
 * @returns {boolean} `true` when `settingKey` was a handled Fabricate data setting.
 */
export function handleFabricateSettingChange(
  settingKey,
  {
    craftingSystemManager,
    recipeManager,
    gatheringEnvironmentStore,
    currencyConfigStore,
    travelStore,
    characterLibrariesStore,
    callAll,
  } = {}
) {
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
  if (settingKey === CURRENCY_CONFIG_KEY) {
    // Re-read the replicated ladder into the store's cache, then tell the shells which systems
    // it moved. `load()` only reads, so there is no write -> `updateSetting` -> write loop. A
    // world where no system participates produces no scopes, and `emitCraftingDataChanged` is
    // skipped entirely rather than emitting an empty payload that would route broadly.
    currencyConfigStore?.load?.();
    // Republish the MANAGER too, not only the player shells. Before issue 1278 a currency edit
    // wrote the `craftingSystems` setting, so a second GM with the manager open saw it through
    // the systems branch above; a world setting announces nothing, and the manager subscribes to
    // the three published hooks rather than to the unpublished `craftingDataChanged` signal. So
    // without this a second GM's World > Currency tab shows the pre-edit ladder until reload.
    // Unconditional, because the manager's own currency tab is stale whether or not any crafting
    // system currently participates.
    callAll?.('fabricate.craftingSystemsChanged', craftingSystemManager?.getSystems?.() ?? []);
    const scopes = currencyParticipantScopes(craftingSystemManager);
    if (scopes.length > 0) {
      emitCraftingDataChanged(craftingDataChange({ source: 'systems', scopes }), callAll);
    }
    return true;
  }
  if (settingKey === TRAVEL_CONFIG_KEY) {
    // Re-read the replicated realm library into the store's cache, then tell the shells which
    // systems it moved. `load()` only reads, so there is no write -> `updateSetting` -> write
    // loop. The manager republish is unconditional for the currency branch's reason: a second
    // GM's World > Travel tab is stale whether or not any system currently participates.
    travelStore?.load?.();
    callAll?.('fabricate.craftingSystemsChanged', craftingSystemManager?.getSystems?.() ?? []);
    const scopes = travelParticipantScopes(craftingSystemManager);
    if (scopes.length > 0) {
      emitCraftingDataChanged(craftingDataChange({ source: 'systems', scopes }), callAll);
    }
    return true;
  }
  if (settingKey === CHARACTER_LIBRARIES_KEY) {
    // Issue 1308. Re-read the replicated libraries into the store's cache, then tell the shells.
    // `load()` only reads, so there is no write -> `updateSetting` -> write loop.
    //
    // The reload MUST precede the announcements: every consumer that reacts to them reads the
    // libraries back through this store, so announcing first would hand them the pre-edit
    // libraries and cache that as the new truth.
    characterLibrariesStore?.load?.();
    // Unconditional manager republish, for the currency branch's reason: a second GM's authoring
    // surface is stale whether or not any crafting system currently references the library.
    callAll?.('fabricate.craftingSystemsChanged', craftingSystemManager?.getSystems?.() ?? []);
    const scopes = characterLibraryScopes(craftingSystemManager);
    if (scopes.length > 0) {
      emitCraftingDataChanged(craftingDataChange({ source: 'systems', scopes }), callAll);
    }
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
