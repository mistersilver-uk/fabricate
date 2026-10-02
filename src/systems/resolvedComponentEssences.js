/**
 * The one accessor for what a system resolves for a component's essences (issue 1371), read by
 * the row projection, usage counts, delete-impact refusal, override baseline and editor seed:
 * `getItems` answers the persisted row, so each must ask the read union (`getComponentsForSystem`).
 * A manager without that method, or one that throws, answers absence, leaving callers on the
 * persisted row, which is what the model degrades to with no world half.
 */

/** Each component's resolved essence map by id, or `null` when there is no union to ask. */
export function resolvedComponentEssencesById(systemManager, systemId) {
  let resolved;
  try {
    resolved = systemManager?.getComponentsForSystem?.(systemId);
  } catch {
    return null;
  }
  if (!Array.isArray(resolved)) return null;
  const byId = new Map();
  for (const component of resolved) {
    const id = typeof component?.id === 'string' ? component.id : String(component?.id ?? '');
    if (id) byId.set(id, component.essences);
  }
  return byId;
}

/** One component's resolved map, `undefined` when the union cannot answer for it. */
export function resolvedComponentEssencesFor(systemManager, systemId, componentId) {
  return resolvedComponentEssencesById(systemManager, systemId)?.get(String(componentId ?? ''));
}

/** The rows with resolved `essences` in new objects; a row with no answer passes through as is. */
export function componentsWithResolvedEssences(systemManager, systemId, components) {
  const rows = Array.isArray(components) ? components : [];
  const byId = resolvedComponentEssencesById(systemManager, systemId);
  if (!byId) return rows;
  return rows.map((component) => {
    const resolved = byId.get(String(component?.id ?? ''));
    return resolved === undefined ? component : { ...component, essences: resolved };
  });
}
