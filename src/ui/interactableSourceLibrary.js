// The ONE enumeration of a crafting system's placement sources — its Tools and its Gathering Tasks
// — so the GM Interactable browser and the Manage-Interactables promote picker cannot drift; the
// picker reading a divergent path is what made it report "No sources" for a system that had one.
// Every read goes through an injected dependency bag, so the helpers are pure and need no globals.

import { resolveToolDisplayName } from '../models/toolDisplay.js';

function resolveSystem(deps, systemId) {
  if (!systemId) return null;
  const manager = deps?.getCraftingSystemManager?.();
  return manager?.getSystem?.(systemId) ?? null;
}

export function listSystemOptions(deps) {
  const systems = deps?.getCraftingSystemManager?.()?.getSystems?.() ?? [];
  return [...systems].map((system) => ({
    id: String(system?.id ?? ''),
    name: String(system?.name ?? system?.id ?? ''),
  }));
}

export function listSystemTools(deps, systemId) {
  const system = resolveSystem(deps, systemId);
  return Array.isArray(system?.tools) ? system.tools : [];
}

export function listSystemComponents(deps, systemId) {
  const system = resolveSystem(deps, systemId);
  return Array.isArray(system?.components) ? system.components : [];
}

export function getSystemComponent(deps, systemId, componentId) {
  if (!componentId) return null;
  const component = listSystemComponents(deps, systemId).find(
    (item) => String(item?.id) === String(componentId)
  );
  return component ? { id: component.id, name: component.name, img: component.img } : null;
}

export function listSystemTasks(deps, systemId) {
  if (!systemId) return [];
  const config = deps?.getGatheringConfig?.();
  const tasks = config?.systems?.[systemId]?.tasks;
  return Array.isArray(tasks) ? tasks : [];
}

export function resolveToolName(tool, component) {
  // `data-models` requirement 13: the missing rung printed the RAW TOOL ID for every
  // item-sourced Tool, which carries `componentId: null` by construction (issue 1119). The id stays
  // the last resort, because this surface has no localized fallback.
  return resolveToolDisplayName(tool, component, String(tool?.id ?? ''));
}

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

export function listTaskSourceOptions(deps, systemId) {
  return listSystemTasks(deps, systemId)
    .map((task) => ({
      id: String(task?.id ?? ''),
      name: String(task?.name || task?.id || ''),
    }))
    .filter((task) => task.id);
}
