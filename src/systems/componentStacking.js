/**
 * Component-creation stacking (issue 858).
 *
 * When Fabricate produces a component into an actor's inventory — salvage recovery
 * (the reported case) or crafting output — a produced item that matches a component
 * already present in the actor's inventory must INCREMENT that item's quantity
 * rather than spawn a duplicate stack. Both engine paths funnel their per-item
 * creation through {@link createOrStackComponentItem}, so the behaviour is shared.
 *
 * The quantity read/write path defaults to `system.quantity` — the path every
 * Fabricate crafting/salvage quantity read already uses — and is injectable so
 * issue #853 (configurable per-system quantity path) can supply a resolved path
 * without reworking this seam.
 */

export const DEFAULT_QUANTITY_PATH = 'system.quantity';

const AWARDED_QUANTITY_KEY = '_fabricateAwardedQuantity';

function readByPath(target, path) {
  if (!target || !path) return;
  return path.split('.').reduce((acc, key) => acc?.[key], target);
}

/**
 * Tag a produced/updated item with the quantity contributed by THIS award, so
 * downstream chat/run reporting shows the amount produced now rather than the
 * merged stack total after a stack. Non-enumerable and best-effort (a frozen stub
 * is tolerated; reporting then falls back to the item's own quantity).
 *
 * @param {object} item     - the produced or updated item.
 * @param {number} quantity - the amount awarded by this call.
 * @returns {object} the same item.
 */
export function tagAwardedQuantity(item, quantity) {
  if (!item) return item;
  const amount = Number(quantity);
  const add = Number.isFinite(amount) && amount > 0 ? amount : 1;
  // ACCUMULATE across awards: when the SAME produced item is stacked onto more than
  // once in one craft/salvage (the same managed component listed in multiple result
  // rows), the tag must sum every award so reporting shows the total produced, not
  // just the last award (issue 858 review).
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
    /* frozen document stub — reporting falls back to system.quantity */
  }
  return item;
}

/**
 * The quantity a produced item contributed to this award. Prefers the award tag
 * (present on items produced through {@link createOrStackComponentItem}) and
 * otherwise falls back to the item's own quantity — so untagged items and legacy
 * call sites read exactly as before.
 *
 * @param {object} item - the produced or updated item.
 * @returns {number} the awarded quantity (>= 1).
 */
export function awardedQuantityOf(item) {
  const tagged = Number(item?.[AWARDED_QUANTITY_KEY]);
  if (Number.isFinite(tagged) && tagged > 0) return tagged;
  return Number(item?.system?.quantity || 1);
}

/**
 * Create a produced component item on `actor`, or — when `matchingItems` contains
 * an item already resolving to the same component — increment that existing item's
 * quantity by `awardedQuantity` instead of creating a duplicate (issue 858).
 *
 * Match resolution is the CALLER's responsibility: it owns the system-scoped
 * component resolver and passes the already-resolved candidate items. This seam
 * only decides create-vs-update and performs it, keeping the decision pure and
 * unit-testable with a stubbed actor/item.
 *
 * @param {object}   params
 * @param {object}   params.actor            - target actor (`createEmbeddedDocuments`).
 * @param {object}   params.itemData         - item payload for the create path.
 * @param {Array<object>} [params.matchingItems] - existing inventory items already
 *   resolved to the produced component; the first updatable one is stacked onto.
 * @param {number}   [params.awardedQuantity] - quantity produced by this call.
 * @param {string}   [params.quantityPath]   - dotted quantity path (default
 *   `system.quantity`); injectable for issue #853.
 * @returns {Promise<object|null>} the created or updated item.
 */
export async function createOrStackComponentItem({
  actor,
  itemData,
  matchingItems = [],
  awardedQuantity = 1,
  quantityPath = DEFAULT_QUANTITY_PATH,
}) {
  const amount = Number(awardedQuantity);
  const delta = Number.isFinite(amount) && amount > 0 ? amount : 1;

  const existing = Array.isArray(matchingItems)
    ? matchingItems.find((item) => item && typeof item.update === 'function')
    : null;

  if (existing) {
    const current = Number(readByPath(existing, quantityPath));
    // A finite current quantity (including a legitimate 0) is kept; only an
    // absent/non-numeric quantity defaults to a single unit (issue 858 review).
    const base = Number.isFinite(current) ? current : 1;
    await existing.update({ [quantityPath]: base + delta });
    return existing;
  }

  if (typeof actor?.createEmbeddedDocuments !== 'function') return null;
  const [created] = await actor.createEmbeddedDocuments('Item', [itemData]);
  return created ?? null;
}
