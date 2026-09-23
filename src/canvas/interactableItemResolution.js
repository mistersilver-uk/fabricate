/**
 * Resolve a dropped Foundry Item uuid to a crafting-system Tool, so dragging a real Item spawns
 * the same tool station as dragging its Tool row. Matching reuses the shared
 * `src/utils/sourceUuid.js` helpers rather than duplicating the source-uuid chain.
 * SYNC CONTRACT: `classifyInteractableDrop` runs synchronously inside `dropCanvasData`, so this
 * resolver must be synchronous — a compendium uuid that only resolves asynchronously degrades to
 * NO MATCH rather than throwing, and falls through to vanilla Foundry handling.
 * The Foundry and library reads are injected; production wiring binds them in the manager.
 */

import { resolvedToolsFor } from '../systems/scopedEntityReads.js';
import { resolveToolForItem } from '../utils/sourceUuid.js';

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
 * Scan the preferred (active) system first, the rest in natural order. Ambiguity — an item
 * mapping to tools in several systems, or several tools in one — resolves to the FIRST match in
 * this order: deterministic and stated.
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
 * The id of the first Tool in `system` the dropped item resolves to. A Tool is a first-class kind
 * carrying its own source references, so the item is matched DIRECTLY against the Tools library —
 * durable `roles[systemId].toolId` first, then source-ref intersection scoped to this system.
 * That is what lets an item-sourced Tool that is not a component resolve, and stops an item whose
 * durable identity names a DIFFERENT tool being mis-resolved through an inherited transitive
 * `_stats.duplicateSource` (issues 559, 561).
 */
function firstToolMatch(item, system) {
  const tools = resolvedToolsFor(system);
  const resolved = resolveToolForItem(item, tools, system?.id);
  if (!resolved?.id) return null;
  const toolId = String(resolved.id);
  return toolId || null;
}
