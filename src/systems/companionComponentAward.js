/**
 * The Component Award: `game.fabricate.awardComponents` (issue 1301), the write half of the
 * published `getCraftingEngine().findComponentItems` resolver.
 * A write is judged by its return value, never by whether it threw and never by re-reading the
 * stored quantity (concurrent moves and derived paths make that lie, and `awardFailed` is
 * retry-safe). Foundry fails silently: `createEmbeddedDocuments` resolves `[]` when a
 * constructor throws or a `preCreateItem` hook refuses, and `Document#update` resolves
 * `undefined` for an empty diff. A rejection anywhere in an entry is that entry's `awardFailed`.
 * `createOrStackComponentItem` discards `updateStackQuantity`'s answer on its stack branch and
 * has item-reading callers, so this module stacks itself with the same target predicate and
 * passes `matchingItems: []` to create; the matcher stays `findComponentItems`.
 * A Foundry-free leaf with exactly four imports; everything else arrives as a seam.
 */

import { stampItemDataRoleIdentity } from '../config/flags.js';

import {
  AWARD_ENTRIES_MAX,
  COMPANION_OUTCOMES,
  componentAwardResult,
  gateCompanionCallSite,
} from './companionContract.js';
import { createOrStackComponentItem } from './componentStacking.js';
import {
  hasStackQuantity,
  itemStackQuantityPath,
  readStoredStackQuantity,
  setStackQuantity,
  updateStackQuantity,
} from './itemStackQuantity.js';

/**
 * The closed key set of one entry: an entry-level `systemId` is refused, since component ids are
 * per system (D11). Tested over `Object.keys`, so `{ componentId, quantity: undefined }` is
 * well-formed with a refused quantity, while `{ componentId }` refuses the whole call.
 */
const AWARD_ENTRY_KEYS = Object.freeze(['componentId', 'quantity']);

/** The crafting engine's own fallback payload, for an unresolvable `registeredItemUuid`. */
const FALLBACK_ITEM_NAME = 'Awarded Item';
const FALLBACK_ITEM_IMG = 'icons/svg/item-bag.svg';

/**
 * A whole positive safe-integer quantity (a numeric string included), or `null`; refused, never
 * coerced, since the stacking seam coerces bad values to one and create authors `2.5` verbatim.
 */
function normalizeAwardQuantity(value) {
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function isAwardEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const keys = Object.keys(entry);
  // Own keys only: `key in entry` would admit a `quantity` inherited from a prototype.
  return (
    keys.length === AWARD_ENTRY_KEYS.length &&
    AWARD_ENTRY_KEYS.every((key) => Object.hasOwn(entry, key))
  );
}

/**
 * The `awards` list, or `null` to refuse `invalidAwards`. Empty refuses, since `placements: []`
 * means nothing was attempted; the upper bound caps an external caller's write batch.
 */
function validateAwardEntries(awards) {
  if (!Array.isArray(awards)) return null;
  if (awards.length === 0 || awards.length > AWARD_ENTRIES_MAX) return null;
  return awards.every(isAwardEntry) ? awards : null;
}

/** The stack target, by the predicate `createOrStackComponentItem` uses byte-identically. */
function selectStackTarget(matchingItems) {
  if (!Array.isArray(matchingItems)) return null;
  return matchingItems.find((item) => item && typeof item.update === 'function') ?? null;
}

/**
 * The create payload from named keys only: caller keys would reach the Foundry document and are
 * a leading cause of `createEmbeddedDocuments` resolving `[]`. The quantity is written only
 * where the item has the field, then the written value is tested, since a configured parent path
 * makes `setStackQuantity` no-op. Answers `null` when the world cannot carry the count.
 */
async function buildAwardItemData({
  component,
  quantity,
  quantityPath,
  systemId,
  resolveSourceItem,
}) {
  const resolved = component?.registeredItemUuid
    ? await resolveSourceItem(component.registeredItemUuid)
    : null;
  const sourceItem = typeof resolved?.toObject === 'function' ? resolved : null;
  const itemData = sourceItem
    ? sourceItem.toObject()
    : {
        name: component?.name || FALLBACK_ITEM_NAME,
        img: component?.img || FALLBACK_ITEM_IMG,
        type: 'loot',
        system: {},
      };
  itemData.system ??= {};

  if (hasStackQuantity(itemData, quantityPath) || !sourceItem) {
    setStackQuantity(itemData, quantity, quantityPath);
  }
  // Absent default 1 keeps "one document is one unit" at `quantity === 1`; spelled out because
  // `tests/item-stack-quantity.test.js` pins every absent default against live source.
  if (readStoredStackQuantity(itemData, { absentDefault: 1, path: quantityPath }) !== quantity) {
    return null;
  }

  stampItemDataRoleIdentity(itemData, systemId, 'componentId', component?.id);
  return itemData;
}

/**
 * The stack branch, judged by `updateStackQuantity`'s own return (`null` when nothing was
 * written). `absentDefault: null` answers `null` for a target with no readable count, so the
 * caller creates rather than inventing a field; a stored `0` is kept as a base.
 */
async function attemptStack({ target, quantity, quantityPath }) {
  const before = readStoredStackQuantity(target, { absentDefault: null, path: quantityPath });
  if (before === null) return null;
  const written = await updateStackQuantity(target, before + quantity, quantityPath);
  if (!written) {
    return { placed: 0, stacked: null, outcome: COMPANION_OUTCOMES.awardFailed };
  }
  return { placed: quantity, stacked: true, outcome: COMPANION_OUTCOMES.awarded };
}

/**
 * Place one entry with the whole body in one `try`: `resolveSourceItem` (`fromUuid`) can reject
 * too, and a `stable` member may not throw. The caller's loop accumulates, never aborts: an award
 * is a give, and stopping withholds value the GM authorised.
 */
async function placeAwardEntry({ actor, entry, system, quantityPath, carried, seams }) {
  const record = (outcome, placed = 0, stacked = null) => ({
    componentId: entry.componentId,
    requested: entry.quantity,
    placed,
    stacked,
    outcome,
  });

  try {
    const quantity = normalizeAwardQuantity(entry.quantity);
    if (quantity === null) return record(COMPANION_OUTCOMES.invalidQuantity);

    // Resolve the component before the resolver seam: `findComponentItems` throws on a null
    // component, and a `stable` member may not throw.
    const component = seams.resolveComponent(system, entry.componentId) || null;
    if (!component) return record(COMPANION_OUTCOMES.componentNotFound);

    const matchingItems = await seams.findComponentItems(actor, component, system);
    const target = carried.get(entry.componentId) ?? selectStackTarget(matchingItems);
    if (target) {
      const stacked = await attemptStack({ target, quantity, quantityPath });
      if (stacked) {
        if (stacked.placed > 0) carried.set(entry.componentId, target);
        return record(stacked.outcome, stacked.placed, stacked.stacked);
      }
    }

    const itemData = await buildAwardItemData({
      component,
      quantity,
      quantityPath,
      systemId: system?.id,
      resolveSourceItem: seams.resolveSourceItem,
    });
    if (!itemData) return record(COMPANION_OUTCOMES.multiUnitUnsupported);

    // Always `matchingItems: []`, so the seam cannot take its own stack branch; the quantity
    // rides on `itemData` too, because the seam ignores `awardedQuantity` when it creates.
    const created = await seams.createOrStack({
      actor,
      itemData,
      matchingItems: [],
      awardedQuantity: quantity,
      quantityPath,
    });
    if (!created) return record(COMPANION_OUTCOMES.awardFailed);
    carried.set(entry.componentId, created);
    return record(COMPANION_OUTCOMES.awarded, quantity, false);
  } catch (error) {
    console.error(
      `Fabricate | Could not award component "${entry?.componentId ?? ''}" to an actor`,
      error
    );
    return record(COMPANION_OUTCOMES.awardFailed);
  }
}

/**
 * `awarded` when every entry placed in full, `awardFailed` when all were attempted and nothing
 * landed (the populated `placements` tell it from a refusal), else `partiallyAwarded`.
 */
function callOutcome(placements) {
  if (placements.every((placement) => placement.outcome === COMPANION_OUTCOMES.awarded)) {
    return COMPANION_OUTCOMES.awarded;
  }
  if (placements.some((placement) => placement.placed > 0)) {
    return COMPANION_OUTCOMES.partiallyAwarded;
  }
  return COMPANION_OUTCOMES.awardFailed;
}

/**
 * Award components to an actor (`game.fabricate.awardComponents`). Not idempotent by design: an
 * award has no natural key, so the caller owns not double-awarding; the `callSite` election gate
 * is not a lease. The stack-quantity path is resolved once per call, and a per-call (never
 * module-scoped) map makes a repeated component stack rather than create a second document.
 * `seams.findComponentItems` is the published resolver, so awards and salvage agree on stacks.
 */
export async function awardComponents(
  actor,
  { systemId = null, awards = null, callSite = null } = {},
  { createOrStack = createOrStackComponentItem, ...seams } = {}
) {
  const refusal = gateCompanionCallSite({ callSite }, seams);
  if (refusal) return componentAwardResult(refusal);

  // Caller arguments are refused before the crafting system, which is the GM's problem.
  const entries = validateAwardEntries(awards);
  if (!entries) {
    return componentAwardResult(COMPANION_OUTCOMES.invalidAwards, { max: AWARD_ENTRIES_MAX });
  }

  const system = seams.resolveSystem(systemId) || null;
  if (!system) {
    return componentAwardResult(COMPANION_OUTCOMES.systemNotFound, {
      system: String(systemId ?? ''),
    });
  }

  // Resolved once and threaded: the per-entry body spans two `await`s and a GM can reconfigure
  // the path between them.
  const quantityPath = itemStackQuantityPath();
  const carried = new Map();
  const entrySeams = { ...seams, createOrStack };
  const placements = [];
  for (const entry of entries) {
    placements.push(
      await placeAwardEntry({ actor, entry, system, quantityPath, carried, seams: entrySeams })
    );
  }

  return componentAwardResult(callOutcome(placements), null, { placements });
}
