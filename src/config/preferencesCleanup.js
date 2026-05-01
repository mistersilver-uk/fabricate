import { SETTING_KEYS } from './settings.js';

export function isGatheringActorSelectableByUser(actor, user) {
  if (!actor) {
    return false;
  }

  if (user?.isGM) {
    return true;
  }

  return actor.isOwner === true || actor.testUserPermission?.(user, 'OWNER') === true;
}

export async function cleanupStalePreferences(
  validSystemIds,
  validRecipeIds,
  getSetting,
  setSetting,
  {
    resolveGatheringActor = null,
    isSelectableGatheringActor = null
  } = {}
) {
  // 1. Validate lastManagedCraftingSystem
  const lastSystem = getSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM);
  if (lastSystem && !validSystemIds.has(lastSystem)) {
    await setSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM, '');
    console.log('Fabricate | Cleared stale lastManagedCraftingSystem:', lastSystem);
  }

  // 2. Validate lastGatheringActor when the caller can resolve/select actors
  const lastGatheringActor = getSetting(SETTING_KEYS.LAST_GATHERING_ACTOR);
  if (
    lastGatheringActor &&
    typeof resolveGatheringActor === 'function' &&
    typeof isSelectableGatheringActor === 'function'
  ) {
    const actor = resolveGatheringActor(lastGatheringActor);
    if (!actor || !isSelectableGatheringActor(actor)) {
      await setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, '');
      console.log('Fabricate | Cleared stale lastGatheringActor:', lastGatheringActor);
    }
  }

  // 3. Clean progressive-order preferences for missing recipes
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
