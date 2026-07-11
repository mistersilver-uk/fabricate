import { findMatchingComponent } from './essenceResolver.js';

/**
 * Map an ordered list of component ids (one per placed workbench unit) to the
 * OWNED item unit-submissions on the source actors. Each owned stack is expanded
 * into one submission per unit (the engine's per-unit occurrence model), and
 * requests beyond the owned quantity are silently dropped, so a bench can never
 * submit more units than the actor holds.
 *
 * Each submission is the REAL owned item object (not a thin `{uuid,...}` copy).
 * This is load-bearing: `CraftingEngine._matchAlchemySignature` resolves a
 * submission to a component ONLY by intersecting the item's source references
 * (`getItemSourceReferences` — its live uuid, `_stats.compendiumSource`,
 * `_stats.duplicateSource`, `flags.core.sourceId`) with the component's source
 * references, and essence accumulation reads the item's essence flags. A thin
 * object keyed on the owned actor-item uuid (`Actor.X.Item.Y`) strips BOTH, so it
 * never intersects the component's source-ref chain — every brew would fizzle and
 * no dead-end key would ever be recorded. The real item still carries `uuid` for
 * the uuid-keyed consumption path (`_consumeSubmittedAlchemyItems`).
 *
 * @param {Array<{items?: Iterable}>} componentSourceActors
 * @param {Array<object>} components The active system's components.
 * @param {string[]} submittedComponentIds One component id per placed unit.
 * @returns {object[]} Owned item objects, one per resolved unit (order preserved).
 */
export function resolveAlchemySubmissions(
  componentSourceActors,
  components,
  submittedComponentIds
) {
  if (!Array.isArray(submittedComponentIds) || submittedComponentIds.length === 0) return [];
  // componentId -> queue of per-unit owned-item submissions.
  const available = new Map();
  for (const actor of Array.isArray(componentSourceActors) ? componentSourceActors : []) {
    const items = actor?.items ? [...actor.items] : [];
    for (const item of items) {
      const component = findMatchingComponent(item, components);
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
    if (next) submissions.push(next);
  }
  return submissions;
}
