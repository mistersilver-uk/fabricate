/**
 * `1.15.0` — convert legacy componentId-referencing library Tools into first-class tools carrying
 * their OWN source references and display snapshot (issue 561; spec § Tools First-Class Migration).
 * The runner has no Item handle, so `roles[systemId].toolId` is the separate `ready`-body
 * `autoStampToolSources` one-shot instead.
 */

import { forEachSystem } from './migrationHelpers.js';

export function migrateToolsToFirstClass(systems) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  forEachSystem(safeSystems, (system) => {
    if (!Array.isArray(system.tools) || system.tools.length === 0) return;
    const components = Array.isArray(system.components) ? system.components : [];
    for (const tool of system.tools) {
      deriveToolSourceFromComponents(tool, components);
    }
  });
  return { systems: safeSystems };
}

/**
 * Copy a component's source refs and display snapshot onto a legacy tool IN PLACE. Shared by the
 * settings migration and the export upcast, so both derive identical fields. Never writes `label`.
 */
export function deriveToolSourceFromComponents(tool, components) {
  if (!tool || typeof tool !== 'object') return false;
  // Already first-class. The guard MUST recognise the renamed spellings as well as the pre-#560
  // ones, or a NEW-named tool round-tripping through `migrateExportPayload` would re-derive from its
  // linked component and OVERWRITE its authored refs, silently (issue 560).
  if (tool.registeredItemUuid || tool.originItemUuid || tool.sourceUuid || tool.sourceItemUuid)
    return false;
  const componentId = typeof tool.componentId === 'string' ? tool.componentId.trim() : '';
  if (!componentId) return false;
  const list = Array.isArray(components) ? components : [];
  const component = list.find((entry) => entry && String(entry.id) === componentId) || null;
  // A dangling componentId is left as-is (degrades to presence-by-name / componentId display).
  if (!component) return false;

  // Read the component's refs new-name-first, old-name-tolerant, so `1.15.0` still upcasts a
  // not-yet-1.16.0-migrated (old-named) component in the same sequential runner pass.
  const registeredItemUuid =
    component.registeredItemUuid ||
    component.originItemUuid ||
    component.sourceUuid ||
    component.sourceItemUuid ||
    null;
  const originItemUuid =
    component.originItemUuid ||
    component.registeredItemUuid ||
    component.sourceItemUuid ||
    component.sourceUuid ||
    null;
  if (!registeredItemUuid && !originItemUuid) return false;

  // Write the NEW names onto the tool (safe: `1.16.0` and the normalizers accept them).
  tool.registeredItemUuid = registeredItemUuid;
  tool.originItemUuid = originItemUuid;
  const aliasSource = Array.isArray(component.aliasItemUuids)
    ? component.aliasItemUuids
    : Array.isArray(component.fallbackItemIds)
      ? component.fallbackItemIds
      : [];
  tool.aliasItemUuids = [
    ...new Set(aliasSource.filter((ref) => typeof ref === 'string' && ref.trim())),
  ];
  // Display snapshot — name + img ONLY, never `label`, and NEVER overwrite a name/img the
  // tool already carries (a pre-existing snapshot is authored data; only fill when absent).
  if (!tool.name && typeof component.name === 'string' && component.name)
    tool.name = component.name;
  if (!tool.img && typeof component.img === 'string' && component.img) tool.img = component.img;
  return true;
}
