import { FABRICATE_SETTINGS_NAMESPACE, SETTING_KEYS } from './settings.js';

const CRAFTING_SYSTEMS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CRAFTING_SYSTEMS}`;
const RECIPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPES}`;
const GATHERING_ENVIRONMENTS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`;
const PLAYER_CHARACTER_TYPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES}`;

/**
 * Bridge a replicated Fabricate world-setting change into the local change hooks the
 * player app listens on.
 *
 * Foundry's `updateSetting` hook fires on EVERY connected client when a world setting
 * replicates, but Fabricate's `fabricate.craftingSystemsChanged` /
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
  { craftingSystemManager, recipeManager, gatheringEnvironmentStore, callAll } = {}
) {
  if (settingKey === CRAFTING_SYSTEMS_KEY) {
    if (craftingSystemManager?.reload?.()) {
      callAll?.('fabricate.craftingSystemsChanged', craftingSystemManager.getSystems());
    }
    return true;
  }
  if (settingKey === RECIPES_KEY) {
    if (recipeManager?.reload?.()) {
      callAll?.('fabricate.recipesChanged', {
        action: 'external',
        recipes: recipeManager.getRecipes(),
      });
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
