/** Shared fixtures for the bulk salvage / bulk destroy suites (issue 859). */

import { attachAwardReceipts } from '../../src/systems/runHistoryEvidence.js';

/**
 * A managed component with salvage enabled by default.
 *
 * @param {boolean} [overrides.salvageEnabled] `component.salvage.enabled`; false authors the whole
 * `salvage` block as `{ enabled: false }` rather than dropping it, because "configured but switched
 * off" and "never configured" are different rows.
 * @param {object} [overrides.salvage] Extra `salvage` keys (e.g. `timeRequirement`).
 */
export function bulkComponent({
  id = 'comp-ore',
  name = 'Iron Ore',
  img = 'icons/ore.webp',
  salvageEnabled = true,
  ingredientQuantity = 1,
  salvage = {},
} = {}) {
  return {
    id,
    name,
    img,
    salvage: { enabled: salvageEnabled, ingredientQuantity, resultGroups: [], ...salvage },
  };
}

/**
 * A crafting system carrying the two feature flags the bulk path reads (`features.salvage` gates
 * the pre-flight, `features.chatOutput` gates the card) plus the salvage check block
 * `resolveSalvageCheck` dispatches on.
 */
export function bulkSystem({
  id = 'sys-a',
  salvage = true,
  chatOutput = true,
  components = [bulkComponent()],
  mode = 'simple',
  rollFormula = '',
  check = {},
} = {}) {
  return {
    id,
    features: { salvage, chatOutput },
    salvageResolutionMode: mode,
    salvageCraftingCheck: { [mode]: { rollFormula, ...check } },
    components,
  };
}

/**
 * A bulk salvage target. Carries an `actorUuid` because the FACADE derives it; the service never
 * resolves one and performs no ownership check of its own.
 */
export function bulkTarget({
  actorUuid = 'Actor.a1',
  actorId = 'a1',
  actorName = 'Akra',
  systemId = 'sys-a',
  componentId = 'comp-ore',
} = {}) {
  return { actorUuid, actorId, actorName, systemId, componentId };
}

/**
 * A `(systemId) => system|null` lookup over a list of systems, matching the seam's contract exactly
 * — including returning `null` (not `undefined`) for an unknown id, which is what the
 * `unknownSystem` pre-flight branch classifies on.
 */
export function craftingSystemLookup(systems) {
  const byId = new Map(systems.map((system) => [system.id, system]));
  return (systemId) => byId.get(systemId) ?? null;
}

/**
 * A recording `salvage` seam returning a fixed result (or a per-component one).
 *
 * @returns {{ seam: Function, calls: Array<object> }} `calls` records the FOUR positional arguments
 * separately, so a suite can assert the options bag without having to reconstruct which argument it
 * was.
 */
/**
 * The award array a real `salvage()` returns: the created documents carrying the immutable
 * per-invocation receipts `attachAwardReceipts` stamped on them.
 *
 * @param {Array<object>} items The created item-likes.
 * @returns {Array<object>} The same array, with its award receipts attached.
 */
export function recordedSalvageResults(items) {
  return attachAwardReceipts(
    items,
    items.map((item) => ({
      name: item.name,
      img: item.img,
      quantity: item.quantity ?? item.system?.quantity ?? 1,
    }))
  );
}

export function recordingSalvage(result = { success: true, results: [] }) {
  const calls = [];
  const seam = async (actorUuid, systemId, componentId, options) => {
    calls.push({ actorUuid, systemId, componentId, options });
    return typeof result === 'function' ? result(componentId) : result;
  };
  return { seam, calls };
}

/** One aggregated-card subject, in the shape `BulkSalvageService` hands the builder. */
export function cardSubject({
  name = 'Iron Ore',
  img = 'icons/ore.webp',
  outcome = 'succeeded',
  rollValue = null,
  tierStep = null,
  message = '',
} = {}) {
  return { name, img, outcome, rollValue, tierStep, message };
}

/**
 * An owned Item document stand-in for the destroy path: an id, a name, an image and a stack
 * quantity at the DEFAULT configured path, so `readStackQuantity` resolves it without any suite
 * configuring the ambient path.
 */
export function ownedItem(id, name, quantity, img = 'icons/ore.webp') {
  return { id, name, img, system: { quantity } };
}

/**
 * An actor exposing the LIVE embedded-collection lookup `BulkDestroyService` filters stale ids
 * against, plus a delete seam recording every submitted batch.
 *
 * @param {Array<object>} [options.items] Documents the actor currently holds.
 * @param {boolean} [options.liveCollection] When false the actor exposes NO `items.has`, which is
 * the "cannot filter" branch — the service must then submit every captured id rather than filtering
 * everything out.
 * @returns {object} `{ actor, deleteCalls, deleteItems }`.
 */
export function deleteCapableActor({ id = 'a1', items = [], liveCollection = true } = {}) {
  const held = new Map(items.map((item) => [item.id, item]));
  const deleteCalls = [];
  const actor = {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    items: liveCollection
      ? { has: (itemId) => held.has(itemId), get: (itemId) => held.get(itemId) ?? null }
      : {},
  };
  /** Deletes the ids it can find and RETURNS the removed documents, as core does. */
  const deleteItems = async (target, itemIds) => {
    deleteCalls.push({ actorId: target?.id ?? null, itemIds: [...itemIds] });
    const removed = [];
    for (const itemId of itemIds) {
      const item = held.get(itemId);
      if (!item) continue;
      held.delete(itemId);
      removed.push(item);
    }
    return removed;
  };
  return { actor, deleteCalls, deleteItems, held };
}
