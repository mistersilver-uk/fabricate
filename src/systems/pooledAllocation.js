/**
 * The two allocation policies a POOLED holdings read and a POOLED holdings consume
 * share with crafting, given names and one home (issue 1342, phase 1).
 *
 * Both were emergent: they existed only as an expression repeated at five call sites and
 * as a loop body inside one private engine method. Nothing named them, so nothing could
 * state what they promise, and the companion members that answer "what do these actors
 * hold" and "take this from them" would have had to re-derive both — the classic way two
 * answers to one question drift apart.
 *
 * ## Policy one — pooled order
 *
 * {@link pooledItemOrder} is the order in which a set of actors' owned items enter a
 * candidate list: **caller's actor order, then each actor's own item order**, flattened.
 * It is a policy and not an implementation detail because the drain below is FIRST-FIT:
 * whoever comes first pays first. Reordering the actors changes which documents are
 * destroyed, so the order is part of the observable behaviour of a consume.
 *
 * The caller's order is preserved exactly as given — this function sorts nothing. A
 * caller that wants "the crafting actor pays first" orders its own array that way.
 *
 * ## Policy two — first-fit drain
 *
 * {@link planFirstFitDrain} walks a candidate list in order and takes
 * `Math.min(available, remaining)` from each item until the requirement is met, stopping
 * at the first item that is not needed. It PLANS ONLY — it reads, it never writes. The
 * caller owns the writes, because the two callers write differently: the crafting engine
 * issues per-document `delete`/`update` calls, while the pooled consume batches per
 * actor.
 *
 * A candidate list that repeats one document pays from it ONCE. It plans nothing, so a
 * repeat would be read against the same unwritten `available` twice and reported as
 * `satisfied` for a quantity nothing holds — see {@link planFirstFitDrain}.
 *
 * ### Why the plan is parent-grouped
 *
 * {@link DrainPlan#groups} carries the same takes as {@link DrainPlan#takes}, bucketed by
 * the owning parent document. A flat list cannot be batched: `deleteEmbeddedDocuments`
 * and `updateEmbeddedDocuments` are called ON a parent, with the ids of ITS embedded
 * documents, so a consumer that wants one delete call per actor needs the grouping to
 * exist before it starts writing. Deriving it at each call site instead is exactly the
 * duplication this module exists to remove.
 *
 * Groups appear in first-encounter order — the order the pooled order visits parents in —
 * and takes inside a group stay in drain order, so a grouped write and a flat write
 * touch the same documents in a comparable sequence.
 *
 * ## The capacity reader is not a parameter
 *
 * Capacity is always {@link readStackQuantity}, which coerces an absent, unreadable or
 * stored-`0` stack to `1` ("a present item is at least one"). That is deliberate and it
 * is the reader `CraftingEngine._consumeComponentItems` has always used at this site.
 * The alternative reader, `readStoredStackQuantity`, honours a stored `0`, and a read
 * that disagreed with the consume about how much an item holds is precisely the gate that
 * lies — so this module does not offer the choice.
 *
 * A consequence worth stating: because `readStackQuantity` never returns less than `1`,
 * a planned take is always at least `1` and `available` is never `0`.
 *
 * ## This module is Foundry-free
 *
 * It imports no `game`, `ui`, `Hooks` or `CONFIG`, constructs no documents and awaits
 * nothing. It reads `item.parent` and a dotted stack-quantity path off plain objects, so
 * every case in its suite is a literal.
 */

import { readStackQuantity } from './itemStackQuantity.js';

/**
 * One item's contribution to a drain.
 *
 * @typedef {object} DrainTake
 * @property {object} item The candidate item document.
 * @property {object|null} parent The document that owns `item` (an Actor for an owned
 *   item), or `null` for an item with no parent.
 * @property {number} available What the item holds, per {@link readStackQuantity}.
 * @property {number} quantity How much this drain takes from it.
 * @property {number} remainingQuantity What would be left afterwards — `0` when the take
 *   exhausts the item.
 * @property {boolean} exhausted Whether the take consumes the whole item, i.e. whether
 *   the write is a DELETE rather than a decrement.
 */

/**
 * Every take against one parent document.
 *
 * @typedef {object} DrainGroup
 * @property {object|null} parent The owning document.
 * @property {DrainTake[]} takes This parent's takes, in drain order.
 * @property {DrainTake[]} deletions The subset whose items are exhausted — the batch a
 *   `deleteEmbeddedDocuments` call would carry.
 * @property {DrainTake[]} reductions The subset that survives with a smaller stack — the
 *   batch an `updateEmbeddedDocuments` call would carry.
 */

/**
 * @typedef {object} DrainPlan
 * @property {number} requested The quantity asked for, as supplied.
 * @property {number} allocated The quantity the takes actually cover.
 * @property {number} shortfall How much of `requested` no item covers.
 * @property {boolean} satisfied Whether `allocated` meets `requested`.
 * @property {DrainTake[]} takes Every take, in drain order.
 * @property {DrainGroup[]} groups The same takes, bucketed by parent.
 */

/**
 * The POOLED ORDER policy: the order a set of actors' owned items enter a candidate list.
 *
 * @param {Array<object>} actors The actors to pool, in the caller's own priority order.
 * @returns {Array<object>} Every actor's items, concatenated in actor order.
 */
export function pooledItemOrder(actors) {
  return (Array.isArray(actors) ? actors : []).flatMap((actor) => [...(actor?.items ?? [])]);
}

/**
 * The FIRST-FIT DRAIN policy: which items pay a quantity requirement, and how much each
 * one pays.
 *
 * Planning only — nothing here writes, deletes or awaits.
 *
 * Both totals and the loop guard use the supplied `quantity` verbatim rather than
 * coercing it, so a caller that passes a non-number gets the same arithmetic it got when
 * this loop lived inside the engine.
 *
 * **One document pays at most once.** A candidate list that names the same document twice
 * is planned as though it were two stacks: the first take reads `available` and exhausts
 * it, the second re-reads the SAME `available` off the same unwritten document and takes
 * again — so the plan reports `satisfied` for a quantity the pool does not hold, and a
 * caller that writes it reduces the stack and then deletes it while publishing the larger
 * figure. The repeat is skipped by object IDENTITY rather than by `id`, because two actors'
 * items are not guaranteed to have distinct ids and an id-keyed test would drop a second
 * actor's genuine stack.
 *
 * This is defence in depth and not the rule's home: the pooled members refuse a repeated
 * ACTOR up front, which is where a repeated document comes from. It is here because a
 * planner that answers `satisfied` for an unsatisfiable request is a lie no caller can
 * detect, and because this module is the one place both callers' drains meet.
 *
 * @param {Iterable<object>} items The candidate items, already in the order they should
 *   be drained (see {@link pooledItemOrder} for the pooled case).
 * @param {number} quantity How much to take in total.
 * @returns {DrainPlan}
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

/**
 * Bucket takes by their owning parent, preserving first-encounter parent order and drain
 * order within each bucket.
 *
 * @param {DrainTake[]} takes
 * @returns {DrainGroup[]}
 */
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
