/**
 * WHAT ONE SYSTEM RESOLVES FOR A COMPONENT'S ESSENCES — the one accessor, for every reader of it
 * (issue 1371 r20-store3, the reviewer's round-6 residual risk).
 *
 * ## WHY THIS IS A MODULE AND NOT A LINE AT EACH CALL SITE
 *
 * `essences` became a component world-default SECTION at r18: a world record carries the map and
 * every system inherits it unless its membership record overrides. `CraftingSystemManager.getItems`
 * is the AUTHORING accessor and answers the PERSISTED in-system row by design, so a reader that
 * means "what does this system actually resolve" has to ask the READ UNION
 * (`getComponentsForSystem`) instead.
 *
 * Rounds 5 and 6 both found the same defect twice, in different files, because each reader made
 * that decision for itself: the rules list drew the persisted row while the rules editor drew the
 * world map (round 5), and then the essence usage counts and the delete-impact dialog kept drawing
 * the persisted row after the row projection was fixed (round 6, finding 4). Two surfaces over one
 * conceptual value reading different fields is the shape; ONE accessor consumed by every read —
 * the row projection, the essence usage counts, the delete-impact refusal, the override rule's
 * baseline and the standalone editor's seed — is the answer.
 *
 * ## OPTIONAL BY CONSTRUCTION
 *
 * `getComponentsForSystem` is absent from the direct-projection fixtures and from any manager
 * stand-in that predates the read union, and a manager that throws is a manager whose corpus could
 * not be read. Both answer ABSENCE (`null` / `undefined`), which leaves every caller reading the
 * persisted row exactly as it did before — the safe direction, because the persisted row is what
 * the world model degrades to when there is no world half.
 *
 * This module reaches no store, no Foundry global and no UI. It is handed the manager it should
 * ask.
 */

/**
 * Each component's RESOLVED essence map for one system, keyed by component id.
 *
 * @param {object|null} systemManager
 * @param {string} systemId
 * @returns {Map<string, unknown>|null} component id → the resolved map, or `null` when there is no
 *   read union to ask.
 */
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

/**
 * What ONE system resolves for ONE component's essences.
 *
 * @param {object|null} systemManager
 * @param {string} systemId
 * @param {string} componentId
 * @returns {unknown} the resolved map, or `undefined` when there is no read union to ask or the
 *   union does not answer for this component.
 */
export function resolvedComponentEssencesFor(systemManager, systemId, componentId) {
  return resolvedComponentEssencesById(systemManager, systemId)?.get(String(componentId ?? ''));
}

/**
 * A component list with each row's `essences` replaced by what the system RESOLVES.
 *
 * The shape every USAGE reader wants: `_itemUsesEssence` and its two counters walk component rows
 * and read `item.essences`, so handing them resolved rows is the whole fix and none of them has to
 * learn about the world model. Rows the union does not answer for are passed through UNTOUCHED
 * rather than blanked — absence here means "no world half for this row", not "no essences".
 *
 * Never mutates its input: a resolved row is a NEW object, so the caller's own list (which is the
 * manager's live `system.components` array) is not written through.
 *
 * @param {object|null} systemManager
 * @param {string} systemId
 * @param {unknown} components the persisted in-system rows.
 * @returns {object[]} the same rows, essence maps resolved.
 */
export function componentsWithResolvedEssences(systemManager, systemId, components) {
  const rows = Array.isArray(components) ? components : [];
  const byId = resolvedComponentEssencesById(systemManager, systemId);
  if (!byId) return rows;
  return rows.map((component) => {
    const resolved = byId.get(String(component?.id ?? ''));
    return resolved === undefined ? component : { ...component, essences: resolved };
  });
}
