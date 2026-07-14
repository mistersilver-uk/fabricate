import { getItemMatchUuids, resolveComponentForItem } from './sourceUuid.js';

/**
 * Resolve which single component a submitted alchemy item IS — the ONE canonical
 * alchemy-submission bucketing function, shared by every attribution surface (the
 * workbench owned-components palette, the submission collector, and — via the
 * `componentId` the collector records — the engine's signature matcher and fizzle
 * dead-end multiset). Bucketing an item to a component happens exactly HERE, so the
 * palette, collector, and engine can never disagree (issue 572).
 *
 * It is the strict TIER UNION of the two ladders that previously diverged across the
 * three sites, COMPOSED from the shared resolvers WITHOUT mutating them (they keep
 * their essence-accumulation / gathering / inventory callers):
 *
 *   1-3. {@link resolveComponentForItem} — system-scoped, durable-flag-first: the
 *        per-system `roles[systemId].componentId` map, then the legacy scalar
 *        `componentId`, then the raw source-reference fall-through (load-bearing for
 *        unstamped/pre-durable-identity worlds; MUST NOT be weakened).
 *   4.   bare top-level `item.registeredItemUuid` supplement — an id-less
 *        legacy/alchemy-formula link the shared resolver structurally cannot see (it
 *        is not part of `getItemSourceReferences`).
 *   5.   name fallback — components created before source references existed.
 *
 * @param {Item|object|null} item - Item-like object with `uuid`, source metadata, and `getFlag`.
 * @param {Array<object>|null} components - The candidate component set of ONE system.
 * @param {string|null|undefined} systemId - That system's id (durable-flag scope).
 * @returns {object|null} The single component the item IS, or null.
 */
export function resolveAlchemySubmissionComponent(item, components, systemId) {
  if (!item || typeof item !== 'object') return null;
  const candidates = Array.isArray(components) ? components : [];
  if (candidates.length === 0) return null;

  // Tiers 1-3: durable-flag-first, system-scoped, then raw source-reference fall-through.
  const resolved = resolveComponentForItem(item, candidates, systemId);
  if (resolved) return resolved;

  // Tier 4: the one legacy field the shared resolver cannot see.
  const bareRegisteredItemUuid = item.registeredItemUuid;
  if (bareRegisteredItemUuid) {
    const byBare = candidates.find((component) =>
      getItemMatchUuids(component).includes(bareRegisteredItemUuid)
    );
    if (byBare) return byBare;
  }

  // Tier 5: name fallback.
  return (
    candidates.find(
      (component) =>
        component?.name &&
        item?.name &&
        String(item.name).toLowerCase() === String(component.name).toLowerCase()
    ) || null
  );
}

/**
 * Map an ordered list of component ids (one per placed workbench unit) to the
 * OWNED item unit-submissions on the source actors, tagged with the component id
 * each was bucketed to. Each owned stack is expanded into one submission per unit
 * (the engine's per-unit occurrence model), and requests beyond the owned quantity
 * are silently dropped, so a bench can never submit more units than the actor holds.
 *
 * BUCKET-ONCE CONTRACT (issue 572). Each owned item is bucketed to a component
 * EXACTLY ONCE, here, via {@link resolveAlchemySubmissionComponent} scoped by
 * `systemId` — the SAME resolver the workbench palette
 * (`AlchemyListingBuilder._projectOwnedComponents`) uses. Each returned record's
 * `componentId` is by construction the queue key the item was dispensed from, so it
 * is the id the palette emitted for that placed unit. The engine
 * (`_matchAlchemySignature` / the dead-end multiset) CONSUMES this `componentId`
 * rather than re-deriving identity from raw source references, so the palette,
 * collector, and engine can never disagree.
 *
 * Each record's `item` is the REAL owned item object (not a thin `{uuid,...}` copy):
 * essence accumulation reads its essence flags and the uuid-keyed consumption path
 * (`_consumeSubmittedAlchemyItems`) reads its `uuid`.
 *
 * @param {Array<{items?: Iterable}>} componentSourceActors
 * @param {Array<object>} components The active system's components.
 * @param {string[]} submittedComponentIds One component id per placed unit.
 * @param {string|null|undefined} systemId The active system's id (durable-flag scope).
 * @returns {Array<{item: object, componentId: string}>} One record per resolved unit (order preserved).
 */
export function resolveAlchemySubmissions(
  componentSourceActors,
  components,
  submittedComponentIds,
  systemId
) {
  if (!Array.isArray(submittedComponentIds) || submittedComponentIds.length === 0) return [];
  // componentId -> queue of per-unit owned-item submissions.
  const available = new Map();
  for (const actor of Array.isArray(componentSourceActors) ? componentSourceActors : []) {
    const items = actor?.items ? [...actor.items] : [];
    for (const item of items) {
      const component = resolveAlchemySubmissionComponent(item, components, systemId);
      if (!component?.id) continue;
      const units = Math.max(1, Math.trunc(Number(item?.system?.quantity ?? 1)) || 1);
      const queue = available.get(component.id) ?? [];
      for (let unit = 0; unit < units; unit += 1) queue.push(item);
      available.set(component.id, queue);
    }
  }
  const submissions = [];
  for (const componentId of submittedComponentIds) {
    const next = available.get(componentId)?.shift();
    if (next) submissions.push({ item: next, componentId });
  }
  return submissions;
}
