/** What the `CraftingSystemManager` cluster modules share (issue 1923): the save attributions and
 * the base `io` bag every module bag spreads, whose thunks read the manager member at call time.
 * The manager rebuilds a bag on every call and never caches it. */
import { domainsForSystemFields } from '../invalidationDomains.js';

// The invalidation-domain attributions every `save()` site names (issue 1078), derived from the
// field map so a local mutation and its replicated copy classify alike.
export const COMPONENT_FACTS = domainsForSystemFields(['components']);
export const TOOL_FACTS = domainsForSystemFields(['tools']);
export const RECIPE_ITEM_FACTS = domainsForSystemFields(['recipeItemDefinitions']);
// A component delete also rewrites the essence definitions that pointed at it, and an essence
// delete strips the essence from every component: one attribution serves both directions.
export const ESSENCE_FACTS = domainsForSystemFields(['essenceDefinitions', 'components']);
// `repairItemData` refreshes definition names, images and descriptions for both libraries.
export const ITEM_METADATA_FACTS = domainsForSystemFields(['components', 'tools']);

/** The thunks every cluster module needs; each returns its member's value or promise. */
export function baseCollaborators(manager) {
  return {
    assertGM: (action) => manager._assertGM(action),
    getSystem: (systemId) => manager.getSystem(systemId),
    getSystems: () => manager.getSystems(),
    recipeManager: () => manager.recipeManager,
    saveSystems: (change) => manager.save(change),
    notifySystemsChanged: () => manager._notifySystemsChanged(),
  };
}
