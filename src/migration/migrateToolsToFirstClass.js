/**
 * 1.15.0 — Convert legacy componentId-referencing library Tools into first-class tools
 * carrying their OWN source references + display snapshot (issue 561; pure, idempotent,
 * version-gated).
 *
 * Before #561 a `system.tools[]` entry only held a `componentId` pointing at a managed
 * component, and every tool matcher resolved that component before matching an owned item.
 * #561 makes a Tool a first-class registered kind with its own `sourceUuid` /
 * `sourceItemUuid` / `fallbackItemIds` + a `name`/`img` display snapshot. This migration
 * COPIES those fields from the referenced component onto each tool so a world that matched a
 * tool yesterday matches it today.
 *
 * `MigrationRunner` reads/writes the `craftingSystems` payload as pure DATA — it has no Item
 * handle, so it CANNOT stamp the durable `roles[systemId].toolId` flag. That is the separate
 * `ready`-body `autoStampToolSources` one-shot, which reads the source refs THIS migration
 * populates (ordering is structural: the migration persists at init, the restamp runs later
 * in the `ready` body).
 *
 * `componentId` is PRESERVED (issue 561, D1): a whetstone / migrated tool keeps it for
 * `onBreak.replaceWith` resolution and the UI's linked-component display, but it is no longer
 * the matching basis. `label` (a user-authored override) is NEVER written.
 *
 * Idempotent: a tool already carrying source refs, or one whose `componentId` no longer
 * resolves, is left as-is (the latter degrades to presence-by-name / componentId display,
 * exactly as a dangling component ref does today). Never throws.
 *
 * @param {Array<object>} systems - raw craftingSystems setting
 * @returns {{ systems: Array<object> }}
 */
export function migrateToolsToFirstClass(systems) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  for (const system of safeSystems) {
    if (!system || typeof system !== 'object') continue;
    if (!Array.isArray(system.tools) || system.tools.length === 0) continue;
    const components = Array.isArray(system.components) ? system.components : [];
    for (const tool of system.tools) {
      deriveToolSourceFromComponents(tool, components);
    }
  }
  return { systems: safeSystems };
}

/**
 * Copy a referenced component's source references + `name`/`img` snapshot onto a legacy
 * componentId-tool IN PLACE, when the tool has a `componentId` but no own source refs and the
 * component still resolves. Shared by the settings-data migration and the export-payload
 * import upcast so both derive identical first-class fields. Idempotent and mutation-safe:
 * a tool already carrying source refs, or one whose `componentId` misses the component set,
 * is left untouched. Never writes `label` (a user-authored override, issue 561 R2-2).
 *
 * @param {object} tool - a single `system.tools[]` entry (mutated in place)
 * @param {Array<object>} components - the system's component set
 * @returns {boolean} true when the tool was upcast (fields written)
 */
export function deriveToolSourceFromComponents(tool, components) {
  if (!tool || typeof tool !== 'object') return false;
  // Already first-class (carries its own source refs): nothing to derive.
  if (tool.sourceUuid || tool.sourceItemUuid) return false;
  const componentId = typeof tool.componentId === 'string' ? tool.componentId.trim() : '';
  if (!componentId) return false;
  const list = Array.isArray(components) ? components : [];
  const component = list.find((entry) => entry && String(entry.id) === componentId) || null;
  // A dangling componentId is left as-is (degrades to presence-by-name / componentId display).
  if (!component) return false;

  const sourceUuid = component.sourceUuid || component.sourceItemUuid || null;
  const sourceItemUuid = component.sourceItemUuid || component.sourceUuid || null;
  if (!sourceUuid && !sourceItemUuid) return false;

  tool.sourceUuid = sourceUuid;
  tool.sourceItemUuid = sourceItemUuid;
  tool.fallbackItemIds = Array.isArray(component.fallbackItemIds)
    ? [...new Set(component.fallbackItemIds.filter((ref) => typeof ref === 'string' && ref.trim()))]
    : [];
  // Display snapshot — name + img ONLY, never `label`, and NEVER overwrite a name/img the
  // tool already carries (a pre-existing snapshot is authored data; only fill when absent).
  if (!tool.name && typeof component.name === 'string' && component.name)
    tool.name = component.name;
  if (!tool.img && typeof component.img === 'string' && component.img) tool.img = component.img;
  return true;
}
