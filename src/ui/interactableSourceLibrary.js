/**
 * Shared interactable SOURCE enumeration (issue 335).
 *
 * The GM Interactable browser and the Manage-Interactables promote picker both
 * need the SAME catalogue of placement sources for a crafting system: its Tools
 * (system-owned, `getSystem(id).tools`) and its Gathering Tasks (persisted in the
 * gathering config). This module is the single source of truth for that read so
 * the two surfaces can never drift — the browser lists draggable sources, the
 * promote picker lists the same sources to bind to a region.
 *
 * Every read is delegated through an injected dependency bag (the live
 * `CraftingSystemManager` and the persisted gathering config), so the helpers are
 * pure and unit-testable without Foundry globals.
 *
 * @typedef {object} InteractableSourceDeps
 * @property {() => object|null} getCraftingSystemManager  Live system manager accessor.
 * @property {() => object|null} getGatheringConfig        Persisted gathering config accessor.
 */

/**
 * Resolve the live crafting system record for an id (or null). Tolerates a missing
 * manager / accessor so callers never need their own guards.
 *
 * @param {InteractableSourceDeps} deps
 * @param {string} systemId
 * @returns {object|null}
 */
function resolveSystem(deps, systemId) {
  if (!systemId) return null;
  const manager = deps?.getCraftingSystemManager?.();
  return manager?.getSystem?.(systemId) ?? null;
}

/**
 * The crafting systems as `{ id, name }` rows (the shared system picker source).
 *
 * @param {InteractableSourceDeps} deps
 * @returns {Array<{ id: string, name: string }>}
 */
export function listSystemOptions(deps) {
  const systems = deps?.getCraftingSystemManager?.()?.getSystems?.() ?? [];
  return [...systems].map((system) => ({
    id: String(system?.id ?? ''),
    name: String(system?.name ?? system?.id ?? ''),
  }));
}

/**
 * A system's RAW Tool library (the canonical system-owned `getSystem(id).tools`).
 * This is the single enumeration both the browser and the promote picker read —
 * neither re-walks the manager itself.
 *
 * @param {InteractableSourceDeps} deps
 * @param {string} systemId
 * @returns {object[]}
 */
export function listSystemTools(deps, systemId) {
  const system = resolveSystem(deps, systemId);
  return Array.isArray(system?.tools) ? system.tools : [];
}

/**
 * A system's RAW managed components, for resolving a tool's display name/image when
 * its own `label` is empty (the SAME `system.components` source ToolsBrowserView reads).
 *
 * @param {InteractableSourceDeps} deps
 * @param {string} systemId
 * @returns {object[]}
 */
export function listSystemComponents(deps, systemId) {
  const system = resolveSystem(deps, systemId);
  return Array.isArray(system?.components) ? system.components : [];
}

/**
 * The managed component (`{ id, name, img }`) for a tool's `componentId`, or null.
 *
 * @param {InteractableSourceDeps} deps
 * @param {string} systemId
 * @param {string} componentId
 * @returns {{ id: string, name: string, img: string }|null}
 */
export function getSystemComponent(deps, systemId, componentId) {
  if (!componentId) return null;
  const component = listSystemComponents(deps, systemId).find(
    (item) => String(item?.id) === String(componentId)
  );
  return component ? { id: component.id, name: component.name, img: component.img } : null;
}

/**
 * A system's RAW Gathering Task library (the persisted gathering config — the SAME
 * source `InteractableManager._readLibraryTasks` reads).
 *
 * @param {InteractableSourceDeps} deps
 * @param {string} systemId
 * @returns {object[]}
 */
export function listSystemTasks(deps, systemId) {
  if (!systemId) return [];
  const config = deps?.getGatheringConfig?.();
  const tasks = config?.systems?.[systemId]?.tasks;
  return Array.isArray(tasks) ? tasks : [];
}

/**
 * Resolve a Tool's display name: its own `label`, else the managed component's name,
 * else its id. Mirrors `ToolsBrowserView.toolPrimaryLabel` / the browser row label.
 *
 * @param {object} tool
 * @param {{ name?: string }|null} component
 * @returns {string}
 */
export function resolveToolName(tool, component) {
  const label = String(tool?.label || '').trim();
  if (label) return label;
  if (component?.name) return String(component.name);
  return String(tool?.id ?? '');
}

/**
 * The promote picker's Tool SOURCE OPTIONS for a system as `{ id, name }` — the SAME
 * tool enumeration the browser uses, just projected to the picker's option shape.
 * A system with a Tool yields a non-empty list (the bug this fixed: the picker was
 * reading a divergent path and showed "No sources").
 *
 * @param {InteractableSourceDeps} deps
 * @param {string} systemId
 * @returns {Array<{ id: string, name: string }>}
 */
export function listToolSourceOptions(deps, systemId) {
  const components = listSystemComponents(deps, systemId);
  return listSystemTools(deps, systemId)
    .map((tool) => {
      const component = tool?.componentId
        ? components.find((c) => String(c?.id) === String(tool.componentId))
        : null;
      return {
        id: String(tool?.id ?? ''),
        name: resolveToolName(tool, component),
      };
    })
    .filter((tool) => tool.id);
}

/**
 * The promote picker's Gathering-Task SOURCE OPTIONS for a system as `{ id, name }` —
 * the SAME task enumeration the browser uses, projected to the picker's option shape.
 *
 * @param {InteractableSourceDeps} deps
 * @param {string} systemId
 * @returns {Array<{ id: string, name: string }>}
 */
export function listTaskSourceOptions(deps, systemId) {
  return listSystemTasks(deps, systemId)
    .map((task) => ({
      id: String(task?.id ?? ''),
      name: String(task?.name || task?.id || ''),
    }))
    .filter((task) => task.id);
}
