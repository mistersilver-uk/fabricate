import { getSourceUuid } from '../utils/sourceUuid.js';

/**
 * Register the createItem hook for automatic fragment-based discovery.
 *
 * When a player acquires an item that matches a fragment's linkedItemUuid in
 * any teaser-enabled system (with discoveryMode 'fragments' or 'both'), the
 * fragment is marked as discovered for that actor and discovery progress is
 * updated for all linked recipes.
 *
 * @param {object} craftingSystemManager - CraftingSystemManager instance
 * @param {object} visibilityService - RecipeVisibilityService instance
 * @returns {Function} The hook handler (also registered via Hooks.on)
 */
export function registerFragmentDiscoveryHook(craftingSystemManager, visibilityService) {
  const handler = async (item, options, userId) => {
    // Only process for the triggering user
    if (game.user.id !== userId) return;

    const actor = item.parent;
    if (!actor) return;

    const systems = craftingSystemManager.getSystems();
    for (const system of systems) {
      if (!system.teaserConfig?.enabled) continue;
      if (!['fragments', 'both'].includes(system.teaserConfig.discoveryMode)) continue;

      for (const fragment of (system.teaserConfig.fragments || [])) {
        if (!fragment.linkedItemUuid) continue;

        let sourceUuid = null;
        try {
          sourceUuid = getSourceUuid(item);
        } catch {
          sourceUuid = null;
        }

        if (item.uuid !== fragment.linkedItemUuid && sourceUuid !== fragment.linkedItemUuid) continue;

        await visibilityService.discoverFragment(actor, fragment.id, system);
      }
    }
  };

  // Register with Foundry if available (not in test environments)
  if (typeof Hooks !== 'undefined') {
    Hooks.on('createItem', handler);
  }

  return handler;
}
