import { readStackQuantity } from '../systems/itemStackQuantity.js';

import { getItemMatchUuids, resolveComponentForItem } from './sourceUuid.js';

/**
 * Resolve which single component a submitted alchemy item IS — the ONE canonical bucketing
 * function, shared by the palette, the collector and (through the `componentId` the collector
 * records) the engine, so the three can never disagree (issue 572). It is the strict TIER UNION of
 * the two ladders that had diverged, COMPOSED from the shared resolvers without mutating them:
 * {@link resolveComponentForItem} (durable flag, legacy scalar, then the raw source-reference
 * fall-through, which MUST NOT be weakened), a bare `registeredItemUuid`, then the name fallback.
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
 * Map an ordered list of component ids (one per placed workbench unit) to the OWNED item
 * unit-submissions on the source actors, tagged with the component id each was bucketed to.
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
      // The `Math.trunc` stays HERE and is deliberately not folded into the shared accessor:
      // expanding a stack into discrete submissions is a SUBMISSION rule ("one submission = one
      // unit", `openspec/specs/resolution-modes/spec.md:397`), not a stack-reading rule.
      const units = Math.max(1, Math.trunc(readStackQuantity(item)) || 1);
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
