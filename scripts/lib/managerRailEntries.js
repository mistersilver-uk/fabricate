/** The manager rail's entries, as `(stable id, visible label)` pairs (issue 1362, epic 1357). */

/** The SYSTEM-scope rail entries a selected crafting system renders, in DOM order. */
export const MANAGER_SYSTEM_RAIL_ENTRIES = Object.freeze([
  Object.freeze({ id: 'manager-nav-system-overview', label: 'System Overview' }),
  Object.freeze({ id: 'manager-nav-crafting', label: 'Crafting' }),
  Object.freeze({ id: 'manager-nav-component-rules', label: 'Component Rules' }),
  Object.freeze({ id: 'manager-nav-tags', label: 'Tags & Categories' }),
  Object.freeze({ id: 'manager-nav-essence-rules', label: 'Essence Rules' }),
  Object.freeze({ id: 'manager-nav-tool-rules', label: 'Tool Rules' }),
  Object.freeze({ id: 'manager-nav-checks', label: 'Checks' }),
  Object.freeze({ id: 'manager-nav-gathering', label: 'Gathering' }),
  Object.freeze({ id: 'manager-nav-graph', label: 'Graph' }),
]);

/** The WORLD-scope rail leaves this epic adds, in the prototype's authored order. */
export const MANAGER_WORLD_SCOPED_RAIL_ENTRIES = Object.freeze([
  Object.freeze({ id: 'manager-world-nav-component-catalogue', label: 'Component catalogue' }),
  Object.freeze({ id: 'manager-world-nav-vocabulary', label: 'Tags & Categories' }),
  Object.freeze({ id: 'manager-world-nav-essence-catalogue', label: 'Essence Catalogue' }),
  Object.freeze({ id: 'manager-world-nav-tool-catalogue', label: 'Tools Catalogue' }),
]);

/** The CSS selector for one rail entry, scoped to the manager window. */
export function railSelector(id) {
  return `.fabricate-manager #${id}`;
}
