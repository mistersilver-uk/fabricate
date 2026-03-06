import { SETTING_KEYS } from './settings.js';

export async function cleanupStalePreferences(validSystemIds, validRecipeIds, getSetting, setSetting) {
  // 1. Validate lastManagedCraftingSystem
  const lastSystem = getSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM);
  if (lastSystem && !validSystemIds.has(lastSystem)) {
    await setSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM, '');
    console.log('Fabricate | Cleared stale lastManagedCraftingSystem:', lastSystem);
  }

  // 2. Clean progressive-order preferences for missing recipes
  const progressiveOrder = getSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER);
  if (progressiveOrder && typeof progressiveOrder === 'object') {
    const cleaned = {};
    let changed = false;
    for (const [recipeId, order] of Object.entries(progressiveOrder)) {
      if (validRecipeIds.has(recipeId)) {
        cleaned[recipeId] = order;
      } else {
        changed = true;
        console.log('Fabricate | Removed stale progressive-order preference for recipe:', recipeId);
      }
    }
    if (changed) {
      await setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, cleaned);
    }
  }
}
