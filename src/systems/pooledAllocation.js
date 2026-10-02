/**
 * The two allocation policies pooled holdings share with crafting, named once (issue 1342).
 * `pooledItemOrder`: the caller's actor order, then each actor's item order, unsorted; the drain
 * is first-fit, so the order decides which documents are destroyed.
 * `planFirstFitDrain`: takes `min(available, remaining)` per item until met, planning only; the
 * caller writes. Takes are also grouped by parent (first-encounter order) so a consumer batches
 * one delete and one update per actor. Foundry-free: plain objects in, nothing awaited.
 * Capacity is always `readStackQuantity` (a present item holds at least `1`), the reader
 * `CraftingEngine._consumeComponentItems` uses, so a read never disagrees with a consume.
 */

import { readStackQuantity } from './itemStackQuantity.js';

/** The pooled order: every actor's items, concatenated in the caller's actor order. */
export function pooledItemOrder(actors) {
  return (Array.isArray(actors) ? actors : []).flatMap((actor) => [...(actor?.items ?? [])]);
}

/**
 * The first-fit drain plan; nothing here writes or awaits. `quantity` is used verbatim, as the
 * engine loop did. One document pays at most once, by identity (ids may repeat across actors), or
 * a repeat would read the same unwritten `available` twice and report `satisfied` falsely.
 * A plan is `{ requested, allocated, shortfall, satisfied, takes, groups }`; a take is `{ item,
 * parent, available, quantity, remainingQuantity, exhausted }` (`exhausted` means a delete, not a
 * decrement), and a group is `{ parent, takes, deletions, reductions }`.
 */
export function planFirstFitDrain(items, quantity) {
  const takes = [];
  const drained = new Set();
  let remaining = quantity;
  let allocated = 0;

  for (const item of items ?? []) {
    if (remaining <= 0) break;
    if (drained.has(item)) continue;
    drained.add(item);
    const available = readStackQuantity(item);
    const takeQuantity = Math.min(available, remaining);
    takes.push({
      item,
      parent: item?.parent ?? null,
      available,
      quantity: takeQuantity,
      remainingQuantity: available - takeQuantity,
      exhausted: takeQuantity >= available,
    });
    remaining -= takeQuantity;
    allocated += takeQuantity;
  }

  return {
    requested: quantity,
    allocated,
    shortfall: Math.max(remaining, 0),
    satisfied: !(remaining > 0),
    takes,
    groups: groupTakesByParent(takes),
  };
}

/** Bucket takes by parent, in first-encounter parent order and drain order within each. */
function groupTakesByParent(takes) {
  const byParent = new Map();
  for (const take of takes) {
    let group = byParent.get(take.parent);
    if (!group) {
      group = { parent: take.parent, takes: [], deletions: [], reductions: [] };
      byParent.set(take.parent, group);
    }
    group.takes.push(take);
    (take.exhausted ? group.deletions : group.reductions).push(take);
  }
  return [...byParent.values()];
}
