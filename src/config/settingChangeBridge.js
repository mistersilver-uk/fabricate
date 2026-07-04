import { FABRICATE_SETTINGS_NAMESPACE, SETTING_KEYS } from './settings.js';

const CRAFTING_SYSTEMS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CRAFTING_SYSTEMS}`;
const RECIPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPES}`;

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
 * @param {(hook: string, payload: any) => void} deps.callAll Bound `Hooks.callAll`.
 * @returns {boolean} `true` when `settingKey` was a handled Fabricate data setting.
 */
export function handleFabricateSettingChange(
  settingKey,
  { craftingSystemManager, recipeManager, callAll } = {}
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
  return false;
}
