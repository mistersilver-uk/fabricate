/**
 * Component-creation stacking (issue 858): a produced component matching one already held
 * increments that stack rather than spawning a duplicate, for salvage and crafting alike through
 * {@link createOrStackComponentItem}. The quantity path is the GM-configured one from
 * `itemStackQuantity.js` (issue 1024).
 */

import { itemStackQuantityPath, readStackQuantity } from './itemStackQuantity.js';
import { writeItemAward } from './runHistoryEvidence.js';

const AWARDED_QUANTITY_KEY = '_fabricateAwardedQuantity';

/**
 * Tag an item with the quantity this award contributed, summed across repeat awards onto the same
 * item, so reporting shows the amount produced rather than the stack total. Non-enumerable and best
 * effort: a frozen stub falls back to the item's own quantity.
 */
export function tagAwardedQuantity(item, quantity) {
  if (!item) return item;
  const amount = Number(quantity);
  const add = Number.isFinite(amount) && amount > 0 ? amount : 1;
  const prev = Number(item[AWARDED_QUANTITY_KEY]);
  const value = (Number.isFinite(prev) && prev > 0 ? prev : 0) + add;
  try {
    Object.defineProperty(item, AWARDED_QUANTITY_KEY, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    /* frozen document stub — reporting falls back to the item's own stack quantity */
  }
  return item;
}

/** The award tag when present, else the item's own stack quantity. */
export function awardedQuantityOf(item) {
  const tagged = Number(item?.[AWARDED_QUANTITY_KEY]);
  if (Number.isFinite(tagged) && tagged > 0) return tagged;
  return readStackQuantity(item);
}

/**
 * Create the produced item, or stack onto the first updatable of `matchingItems`, which the caller
 * resolves to the same component. `quantityPath` defaults to the configured path and stays a test
 * seam.
 */
export async function createOrStackComponentItem({
  actor,
  itemData,
  matchingItems = [],
  awardedQuantity = 1,
  quantityPath = itemStackQuantityPath(),
  receiptCollector = null,
  receiptIdentity = {},
}) {
  const existing = Array.isArray(matchingItems)
    ? matchingItems.find((item) => item && typeof item.update === 'function')
    : null;

  return writeItemAward({
    actor,
    itemData,
    existing,
    quantity: awardedQuantity,
    path: quantityPath,
    receiptCollector,
    receiptIdentity,
  });
}
