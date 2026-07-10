/**
 * Resolve a dropped Foundry Item uuid to a crafting-system Tool (Fix 4).
 *
 * When a GM drags a real Item (from a compendium or the items directory) onto the
 * canvas, the `dropCanvasData` payload carries `{ type: 'Item', uuid }`. If that
 * item is the source of a managed component that a crafting system's Tool library
 * references (`tool.componentId`), we want the drop to spawn a TOOL tile — the
 * same outcome as dragging the Tool row from the browser.
 *
 * The matching reuses the shared {@link resolveComponentForItem} +
 * source-ref helpers (`src/utils/sourceUuid.js`) so the source-uuid chain is
 * resolved identically to crafting award/stacking logic — no duplicated matching.
 *
 * SYNC CONTRACT: `classifyInteractableDrop` runs synchronously inside the
 * `dropCanvasData` hook, so this resolver must be synchronous. World items resolve
 * via `fromUuidSync`; a compendium uuid that only resolves asynchronously degrades
 * to NO MATCH (returns null) rather than throwing — an unrelated item simply falls
 * through to vanilla Foundry handling. Foundry's `dropCanvasData` payload commonly
 * carries a pre-resolved `data` item too, which we prefer when present.
 *
 * The Foundry/library reads (uuid resolution, system enumeration) are injected so
 * the matching strategy is unit-testable with fakes; production wiring binds the
 * real Foundry edges in {@link InteractableManager#_resolutionDeps}.
 */

import { resolveComponentForItem } from '../utils/sourceUuid.js';

/**
 * @param {string} uuid  The dropped Item uuid.
 * @param {object} deps
 * @param {(uuid: string) => (object|null)} deps.resolveItem  Synchronous item
 *   resolver (world items via `fromUuidSync`); returns null for an item that
 *   cannot be resolved synchronously (e.g. an unloaded compendium entry).
 * @param {() => Array<object>} deps.getSystems  All crafting systems
 *   (`CraftingSystemManager.getSystems()`), each exposing `tools[]` + `components[]`.
 * @param {() => string} [deps.getPreferredSystemId]  The active/selected system id
 *   to scan FIRST (so an ambiguous match prefers the system the GM is working in).
 * @returns {{ systemId: string, toolId: string } | null} The first matching
 *   system+tool, preferring the preferred system; null when nothing matches.
 */
export function resolveItemUuidToTool(
  uuid,
  { resolveItem, getSystems, getPreferredSystemId } = {}
) {
  if (typeof uuid !== 'string' || !uuid) return null;
  if (typeof resolveItem !== 'function' || typeof getSystems !== 'function') return null;

  const item = resolveItem(uuid);
  // No synchronously-resolvable item ⇒ degrade to no-match (let Foundry handle it).
  if (!item || typeof item !== 'object') return null;

  const systems = getSystems() ?? [];
  const ordered = orderByPreferredSystem(
    Array.isArray(systems) ? systems : [],
    typeof getPreferredSystemId === 'function' ? getPreferredSystemId() : ''
  );

  for (const system of ordered) {
    const match = firstToolMatch(item, system);
    if (match) return { systemId: String(system?.id ?? ''), toolId: match };
  }
  return null;
}

/**
 * Order the systems so the preferred (active/selected) system is scanned first;
 * remaining systems keep their natural order. Ambiguity (an item that maps to a
 * tool in more than one system, or more than one tool in a system) resolves to
 * the FIRST match in this order — documented and deterministic.
 *
 * @param {Array<object>} systems
 * @param {string} preferredSystemId
 * @returns {Array<object>}
 */
function orderByPreferredSystem(systems, preferredSystemId) {
  const preferred = String(preferredSystemId ?? '');
  if (!preferred) return systems;
  const head = systems.filter((system) => String(system?.id ?? '') === preferred);
  if (head.length === 0) return systems;
  const tail = systems.filter((system) => String(system?.id ?? '') !== preferred);
  return [...head, ...tail];
}

/**
 * The id of the first Tool in `system` whose managed component matches `item`.
 *
 * @param {object} item   The resolved Foundry item.
 * @param {object} system A crafting system (`tools[]` + `components[]`).
 * @returns {string|null}
 */
function firstToolMatch(item, system) {
  const tools = Array.isArray(system?.tools) ? system.tools : [];
  const components = Array.isArray(system?.components) ? system.components : [];
  // Resolve the dropped item to the single component it IS, once, list-aware and
  // scoped by this system's id — so an item whose durable identity names a
  // DIFFERENT component is never resolved to a Tool via an inherited, transitive
  // `_stats.duplicateSource` (issue 559).
  const resolved = resolveComponentForItem(item, components, system?.id);
  if (!resolved?.id) return null;
  for (const tool of tools) {
    const componentId = tool?.componentId;
    if (!componentId) continue;
    if (String(componentId) === String(resolved.id)) {
      const toolId = String(tool?.id ?? '');
      if (toolId) return toolId;
    }
  }
  return null;
}
