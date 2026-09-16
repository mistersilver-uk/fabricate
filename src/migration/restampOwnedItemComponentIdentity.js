/**
 * The one-shot, active-GM re-stamp back-filling `roles[systemId].componentId` onto OWNED ACTOR items
 * resolving to a component ONLY by name (issue 600). Deliberately NOT a `MigrationRunner` entry: the
 * runner holds settings payloads and no Item handle, so the edge lives in `src/main.js` and this
 * imports no Foundry global. IDEMPOTENT, NO FOREIGN CLOBBER, DOTTED-ID SAFE, NO-THROW-PER-ITEM.
 */

import { isSafeFlagKeySegment } from '../config/flags.js';
import { findComponentByNameSilently } from '../utils/componentNameMatch.js';
import { itemHasComponentIdentityFlag, resolveComponentForItem } from '../utils/sourceUuid.js';

/**
 * Plan the leaf writes one owned item needs. An item ALREADY carrying ANY durable identity is
 * skipped ENTIRELY, mirroring the runtime name-fallback gate exactly — omitting that would
 * MANUFACTURE and make PERMANENT the cross-system duplicate projection issue 538 prevents.
 * The name match is deliberately telemetry-free, so this pass does not pollute the issue-540 window
 * measuring live runtime reliance on the fallback.
 */
export function planOwnedItemComponentRestamp(item, systems) {
  const writes = [];
  if (!item || typeof item !== 'object') return writes;
  // Cross-system suppression (issue 538): an item already bearing ANY durable identity never
  // reaches the name fallback at runtime, so the migration must not stamp it into a merely
  // same-named system either — and this pass's own primary target is legacy flat-flag owned copies.
  if (itemHasComponentIdentityFlag(item)) return writes;
  for (const system of Array.isArray(systems) ? systems : []) {
    const systemId = system?.id;
    // An unsafe system id can never have been written as a `roles` key, so there is nothing to
    // back-fill and a write would mis-nest.
    if (!isSafeFlagKeySegment(systemId)) continue;
    const components = Array.isArray(system?.components) ? system.components : [];
    if (components.length === 0) continue;
    // Already resolves in THIS system (durable identity or raw source refs) ⇒ not name-only.
    if (resolveComponentForItem(item, components, systemId)) continue;
    // Name-only match in THIS system's candidate set?
    const match = findComponentByNameSilently(item, components, { caseSensitive: false });
    if (!match || match.id == null) continue;
    writes.push({
      systemId,
      componentId: match.id,
      flagKey: `roles.${systemId}.componentId`,
    });
  }
  return writes;
}

/** An actor's owned items as a plain array, tolerant of an `EmbeddedCollection` or an absence. */
function actorOwnedItems(actor) {
  const items = actor?.items;
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items[Symbol.iterator] === 'function') return [...items];
  return [];
}

/**
 * Re-stamp every name-only owned item across `actors` through the injected `writeFlag` seam — in
 * production `setFabricateFlag`, whose merge preserves sibling role leaves. Every plan and write is
 * guarded, so a single failing document is counted and skipped.
 */
export async function restampOwnedItemComponentIdentity({ actors, systems, writeFlag } = {}) {
  const summary = {
    scannedActors: 0,
    scannedItems: 0,
    stampedItems: 0,
    stampedLeaves: 0,
    skippedErrors: 0,
  };
  const systemList = Array.isArray(systems) ? systems : [];
  if (systemList.length === 0 || typeof writeFlag !== 'function') return summary;

  const actorList = Array.isArray(actors)
    ? actors
    : actors && typeof actors[Symbol.iterator] === 'function'
      ? [...actors]
      : [];

  for (const actor of actorList) {
    summary.scannedActors += 1;
    for (const item of actorOwnedItems(actor)) {
      summary.scannedItems += 1;
      let writes;
      try {
        writes = planOwnedItemComponentRestamp(item, systemList);
      } catch {
        // No-throw-per-item: a malformed item's plan failure never aborts the pass.
        summary.skippedErrors += 1;
        continue;
      }
      if (writes.length === 0) continue;
      let leavesWritten = 0;
      for (const write of writes) {
        try {
          await writeFlag(item, write.flagKey, write.componentId);
          leavesWritten += 1;
        } catch {
          summary.skippedErrors += 1;
        }
      }
      if (leavesWritten > 0) {
        summary.stampedItems += 1;
        summary.stampedLeaves += leavesWritten;
      }
    }
  }
  return summary;
}
