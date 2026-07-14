/**
 * @module restampOwnedItemComponentIdentity
 *
 * Issue 600 (#540 Phase 2): the one-shot, active-GM re-stamp that back-fills the durable
 * per-system component identity `flags.fabricate.roles[systemId].componentId` onto OWNED
 * ACTOR items that currently resolve to a system component ONLY by name — so those items
 * stop depending on the deprecated name fallback (whose removal is Phase 3, issue 601).
 *
 * This is the OWNED-COPY analogue of the source-side one-shot auto-stamps
 * (`CraftingSystemManager.autoStampComponentSources`, issue 556): those stamp registered
 * component SOURCES so future drags inherit the flag; this reaches the copies ALREADY in
 * actor inventories that predate the durable flag. Like those passes it is deliberately NOT
 * a `MigrationRunner` entry — that runner reads and writes only settings-data payloads
 * (recipes/systems/gathering config) and has no Foundry Item handle, so it cannot write Item
 * flags. The Foundry edge lives in `src/main.js` (`runOwnedItemComponentIdentityRestamp`),
 * version-gated + active-GM-gated + wrapped so it runs once and never throws into `ready`.
 *
 * The pure logic here imports NO Foundry runtime globals: the planner reads item shape
 * through the same `resolveComponentForItem` / `isSafeFlagKeySegment` primitives the runtime
 * reader uses, and the orchestrator takes its `actors`, `systems`, and a `writeFlag` seam as
 * explicit arguments, so it is fully unit-testable off a live world.
 *
 * ## Guarantees
 * - **Idempotent** — re-running is a no-op. A stamped leaf makes `resolveComponentForItem`
 *   return the component by durable identity, so the "resolves by name only" predicate is
 *   false on the second pass and nothing is written.
 * - **No foreign clobber** — each write targets exactly `roles.<systemId>.componentId`
 *   through the merge-preserving `writeFlag` seam, so a DIFFERENT system's existing role
 *   leaf is never overwritten. An item that name-matches components in several systems gains
 *   one leaf PER matching system (the same two-leaf outcome the source-side auto-stamp
 *   produces for a source registered in two systems).
 * - **Dotted-id safe** — a systemId that is not a safe single dotted-path segment is skipped
 *   (never written), so no mis-nested `roles.<a>.<b>` flag is ever created.
 * - **No-throw-per-item** — a planning or write failure on one item is counted and skipped;
 *   one bad document can never abort the pass.
 */

import { isSafeFlagKeySegment } from '../config/flags.js';
import { findComponentByNameSilently } from '../utils/componentNameMatch.js';
import { itemHasComponentIdentityFlag, resolveComponentForItem } from '../utils/sourceUuid.js';

/**
 * Plan the durable-identity leaf writes a single owned item needs to stop resolving to a
 * component by NAME ONLY. For each system whose id is a safe flag-key segment and whose
 * candidate set the item does NOT already resolve within (via durable identity or raw
 * source references), but a component name-matches (case-insensitive, the shared runtime
 * name-fallback semantics), emit one `roles.<systemId>.componentId` write.
 *
 * An item that ALREADY carries ANY durable component identity — a `roles.<system>.componentId`
 * leaf for SOME system, OR the legacy flat `flags.fabricate.componentId` scalar — is skipped
 * ENTIRELY (no system considered). This mirrors the runtime name-fallback gate exactly: the
 * live matcher ({@link findMatchingComponent}) reaches the name compare only when BOTH
 * `resolveComponentForItem` returns null AND `!itemHasComponentIdentityFlag(item)` — the
 * issue-538 rule that a flagged item's identity IS its component id and must never loosely
 * name-match a same-named component in a DIFFERENT system. Omitting this gate would MANUFACTURE
 * and make PERMANENT the exact cross-system duplicate-inventory projection #538 prevents (an
 * item flagged for system B, sharing only a display name with a component in system A, would be
 * stamped into A even though it does not resolve there at runtime).
 *
 * For an item that passes that gate, a system in which it ALREADY resolves (a raw-ref /
 * source-uuid intersection) yields no write — the existing per-system `resolveComponentForItem`
 * guard. The name match is intentionally telemetry-free ({@link findComponentByNameSilently}) so
 * this detection pass does not pollute the issue-540 Phase 3 telemetry window that measures live
 * runtime reliance on the fallback.
 *
 * @param {Item|object|null} item - An owned actor item (reads `name`, `getFlag`, source metadata).
 * @param {Array<{id?: string, components?: Array<object>}>} systems - The world's crafting systems.
 * @returns {Array<{systemId: string, componentId: string, flagKey: string}>} the leaf writes needed.
 */
export function planOwnedItemComponentRestamp(item, systems) {
  const writes = [];
  if (!item || typeof item !== 'object') return writes;
  // Cross-system suppression (issue 538): an item already bearing ANY durable component
  // identity (a `roles` leaf for some system, or the legacy flat scalar) never reaches the
  // name fallback at runtime, so the migration must not stamp it into a merely same-named
  // system either. This is the item-level counterpart of `findMatchingComponent`'s
  // `!itemHasComponentIdentityFlag(item)` guard and covers this migration's own primary
  // target — legacy flat-flag owned copies.
  if (itemHasComponentIdentityFlag(item)) return writes;
  for (const system of Array.isArray(systems) ? systems : []) {
    const systemId = system?.id;
    // Dotted/unsafe system ids can never have been written as a `roles` map key, so there
    // is nothing to back-fill and a write would mis-nest; skip exactly as the source-side
    // auto-stamp and the runtime reader do.
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

/**
 * The owned items of an actor as a plain array, tolerant of a Foundry `EmbeddedCollection`
 * (iterable), a plain array, or an absent collection.
 *
 * @param {object|null} actor
 * @returns {Array<object>}
 */
function actorOwnedItems(actor) {
  const items = actor?.items;
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items[Symbol.iterator] === 'function') return [...items];
  return [];
}

/**
 * Re-stamp durable component identity onto every name-only owned item across `actors`.
 *
 * Iterates each actor's owned items, plans the needed `roles.<systemId>.componentId` leaf
 * writes via {@link planOwnedItemComponentRestamp}, and applies each through the injected
 * `writeFlag` seam (in production `setFabricateFlag`, whose `setFlag` merge preserves sibling
 * role leaves). Every per-item plan and every per-leaf write is guarded so a single failing
 * document is counted and skipped rather than aborting the pass.
 *
 * @param {object} params
 * @param {Iterable<object>|Array<object>} params.actors - The world actors to scan.
 * @param {Array<{id?: string, components?: Array<object>}>} params.systems - Crafting systems.
 * @param {(item: object, flagKey: string, componentId: string) => Promise<unknown>} params.writeFlag -
 *   Persists `flags.fabricate.<flagKey>` on the owned item; merge-safe per role leaf.
 * @returns {Promise<{scannedActors: number, scannedItems: number, stampedItems: number, stampedLeaves: number, skippedErrors: number}>}
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
