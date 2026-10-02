/**
 * The remaining-quantity ledger an ingredient set resolves against: how it is seeded, the candidate
 * item plans drawn from it, and the shared node budget those enumerations charge.
 */
// Foundry-free: the configured path is pushed into `itemStackQuantity.js` (`data-models`).
import { readStackQuantity } from '../systems/itemStackQuantity.js';

/** Node/subset budget for the item-level backtracking assignment search (issue 663). */
export const INGREDIENT_SEARCH_NODE_CAP = 200_000;

export function itemKeyOf(item) {
  return item.uuid || item.id;
}

/** Seed the remaining-quantity ledger (item key -> units) shared by the search and greedy pass. */
export function seedRemaining(availableItems) {
  const remaining = new Map();
  for (const item of availableItems) {
    // The configured stack-quantity path enters here, and the whole plan follows (issue 1024).
    remaining.set(itemKeyOf(item), readStackQuantity(item));
  }
  return remaining;
}

/** Charge one node; reports whether the budget is spent. */
export function chargeNode(budget) {
  if (++budget.nodes > INGREDIENT_SEARCH_NODE_CAP) {
    budget.capHit = true;
    return true;
  }
  return false;
}

/** Deduct the plan from the ledger; a supplied journal makes it undoable. */
export function commitItemPlan(candidatePlan, plan, remaining, journal = null) {
  for (const entry of candidatePlan) {
    plan.push(entry);
    const key = itemKeyOf(entry.item);
    const previous = remaining.get(key) || 0;
    if (journal) journal.push(key, previous);
    remaining.set(key, Math.max(0, previous - entry.quantity));
  }
}

/** Replay the journal backwards to `mark`, then truncate it. */
export function undoLedger(remaining, journal, mark) {
  for (let index = journal.length - 2; index >= mark; index -= 2) {
    remaining.set(journal[index], journal[index + 1]);
  }
  journal.length = mark;
}

export function planSignature(plan) {
  return plan.map((entry) => `${itemKeyOf(entry.item)}x${entry.quantity}`).join('|');
}

/** The stacks an option matches, in `availableItems` order. */
export function candidateStacksForOption(option, restrictItemId, scan) {
  const { index, matcher, availableItems } = scan;
  const pool =
    index?.optionItems.get(option) ??
    availableItems.filter((item) => (matcher ? matcher(option, item) : option.matches(item)));
  if (!restrictItemId) return pool;
  return pool.filter((item) => itemKeyOf(item) === restrictItemId);
}

/** Snapshotted, so a later ledger write cannot move an in-flight enumeration's domain. */
export function candidateStacksWithAvailability(option, restrictItemId, scan) {
  const out = [];
  for (const item of candidateStacksForOption(option, restrictItemId, scan)) {
    const avail = Number(scan.remaining.get(itemKeyOf(item)) || 0);
    if (avail > 0) out.push({ item, avail });
  }
  return out;
}

/** The greedy front-loaded item plan for one option against `scan.remaining`. */
export function buildItemPlanForOption(option, restrictItemId, scan) {
  // Currency is never item-satisfiable; the fallback pass's affordability probe chooses it.
  if (option?.match?.type === 'currency') {
    return { ok: false, plan: [], have: 0 };
  }

  let neededQuantity = option.quantity;
  const optionPlan = [];
  let totalAvailable = 0;

  const matchingItems = candidateStacksForOption(option, restrictItemId, scan);

  for (const item of matchingItems) {
    const availableQty = Number(scan.remaining.get(itemKeyOf(item)) || 0);
    if (availableQty <= 0) continue;

    totalAvailable += availableQty;
    if (neededQuantity <= 0) continue;

    const toConsume = Math.min(neededQuantity, availableQty);
    optionPlan.push({ item, quantity: toConsume, ingredient: option });
    neededQuantity -= toConsume;
  }

  return {
    ok: neededQuantity <= 0,
    plan: optionPlan,
    have: totalAvailable,
  };
}

/** The distinct unit-count plans over `matchingItems` for exactly `need` units, greedy first. */
export function* enumerateUnitPlans(option, matchingItems, need, budget) {
  yield* enumerateUnitPlansFrom(option, matchingItems, 0, need, [], budget);
}

/** Most from the earliest stack first, so the first complete plan is the greedy pick. */
function* enumerateUnitPlansFrom(option, matchingItems, index, remainingNeed, entries, budget) {
  if (chargeNode(budget)) return;
  if (remainingNeed === 0) {
    yield entries.map((entry) => ({
      item: entry.item,
      quantity: entry.quantity,
      ingredient: option,
    }));
    return;
  }
  if (index >= matchingItems.length) return;

  const { item, avail } = matchingItems[index];
  const maxHere = Math.min(avail, remainingNeed);
  for (let take = maxHere; take >= 0; take -= 1) {
    if (budget.capHit) return;
    if (take > 0) entries.push({ item, quantity: take });
    yield* enumerateUnitPlansFrom(
      option,
      matchingItems,
      index + 1,
      remainingNeed - take,
      entries,
      budget
    );
    if (take > 0) entries.pop();
  }
}
