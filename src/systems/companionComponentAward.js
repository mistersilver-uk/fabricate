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
 * `placeComponentAward` is the effect-path primitive (issue 1954): it may stamp a companion effect
 * marker and judges the write by the returned document's `_source`.
 */

import { forcedReplacementEntry, stampItemDataRoleIdentity } from '../config/flags.js';

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
  stackQuantityUpdate,
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

/** The single-slot companion effect marker, `flags.fabricate.companionEffect`. */
const MARKER_PARENT = 'flags.fabricate';
const MARKER_KEY = 'companionEffect';
const MARKER_PATH = `${MARKER_PARENT}.${MARKER_KEY}`;

/** A dotted read of a document's `_source`, as Foundry's `getProperty`. */
function sourceValue(document, path) {
  let node = document?._source;
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return;
    node = node[segment];
  }
  return node;
}

function carriesMarker(document, marker) {
  const stored = sourceValue(document, MARKER_PATH);
  if (!stored || typeof stored !== 'object') return false;
  const keys = Object.keys(marker);
  return (
    keys.length === Object.keys(stored).length && keys.every((key) => stored[key] === marker[key])
  );
}

/** Marker AND post-value on `_source`: the only proof a placement landed. */
function landed(document, { marker, quantityPath, expected }) {
  if (marker && !carriesMarker(document, marker)) return false;
  return Number(sourceValue(document, quantityPath)) === expected;
}

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
  // A copied marker would claim another operation's placement.
  if (itemData.flags?.fabricate) delete itemData.flags.fabricate[MARKER_KEY];

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
 * Resolve and write one entry: `{ refusal }` before any write, `{ intent, aborted }` when
 * `proceed` declines, else `{ intent, quantity, target, written }` with the raw write answer.
 * `absentDefault: null` sends a target with no readable count to create; throws propagate.
 */
async function writeAwardEntry(args) {
  const { actor, entry, system, quantityPath, carried, seams, marker, strict, create, proceed } =
    args;
  const quantity = normalizeAwardQuantity(entry.quantity);
  if (quantity === null) return { refusal: COMPANION_OUTCOMES.invalidQuantity };

  // Resolve the component before the resolver seam: `findComponentItems` throws on a null
  // component, and a `stable` member may not throw.
  const component = seams.resolveComponent(system, entry.componentId) || null;
  if (!component) return { refusal: COMPANION_OUTCOMES.componentNotFound };

  const matchingItems = await seams.findComponentItems(actor, component, system);
  const target = carried.get(entry.componentId) ?? selectStackTarget(matchingItems);
  const before = target
    ? readStoredStackQuantity(target, { absentDefault: null, path: quantityPath })
    : null;
  if (before !== null) {
    const intent = { mode: 'stack', targetItemUuid: target.uuid ?? null, stackBefore: before };
    if (strict && sourceValue(target, quantityPath) == null) {
      return { intent, refusal: 'stackSourceMissing' };
    }
    const payload = stackQuantityUpdate(target, before + quantity, quantityPath);
    if (!payload) return { intent, quantity, target, written: null };
    if (proceed && !(await proceed(intent))) return { intent, aborted: true };
    const markerFields = marker
      ? Object.fromEntries([forcedReplacementEntry(MARKER_PARENT, MARKER_KEY, marker)])
      : {};
    const written = await target.update?.({ ...payload, ...markerFields });
    return { intent, quantity, target, written };
  }

  const itemData = await buildAwardItemData({
    component,
    quantity,
    quantityPath,
    systemId: system?.id,
    resolveSourceItem: seams.resolveSourceItem,
  });
  if (!itemData) return { refusal: COMPANION_OUTCOMES.multiUnitUnsupported };
  // A plain nested object, never an operator: creation data takes no update operators.
  if (marker) ((itemData.flags ??= {}).fabricate ??= {})[MARKER_KEY] = { ...marker };

  const intent = { mode: 'create', targetItemUuid: null, stackBefore: null };
  if (proceed && !(await proceed(intent))) return { intent, aborted: true };
  return { intent, quantity, target: null, written: await create(itemData, quantity) };
}

/**
 * Place one entry with the whole body in one `try`: `resolveSourceItem` (`fromUuid`) can reject
 * too, and a `stable` member may not throw. The caller's loop accumulates, never aborts: an award
 * is a give, and stopping withholds value the GM authorised. Judged by the write's truthy answer.
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
    // Always `matchingItems: []`, so the seam cannot take its own stack branch; the quantity
    // rides on `itemData` too, because the seam ignores `awardedQuantity` when it creates.
    const create = (itemData, quantity) =>
      seams.createOrStack({
        actor,
        itemData,
        matchingItems: [],
        awardedQuantity: quantity,
        quantityPath,
      });
    const placed = await writeAwardEntry({
      actor,
      entry,
      system,
      quantityPath,
      carried,
      seams,
      create,
      marker: null,
    });
    if (placed.refusal) return record(placed.refusal);
    if (!placed.written) return record(COMPANION_OUTCOMES.awardFailed);
    const stacked = placed.intent.mode === 'stack';
    carried.set(entry.componentId, stacked ? placed.target : placed.written);
    return record(COMPANION_OUTCOMES.awarded, placed.quantity, stacked);
  } catch (error) {
    console.error(
      `Fabricate | Could not award component "${entry?.componentId ?? ''}" to an actor`,
      error
    );
    return record(COMPANION_OUTCOMES.awardFailed);
  }
}

const settled = (status, intent, receipt, failure) => ({ status, intent, receipt, failure });
const failure = (reason, detail = null) => ({ reason, detail });

/** Judge an effect-path write: `undefined`, `null` or `[]` wrote nothing; else marker AND value. */
function judgePlacement(placed, { marker, quantityPath }) {
  const { intent, quantity, written } = placed;
  const stack = intent.mode === 'stack';
  if (written == null || (Array.isArray(written) && written.length === 0)) {
    return settled('knownFailure', intent, null, failure('writeRefused'));
  }
  const single = Array.isArray(written) && written.length === 1 ? written[0] : null;
  const document = stack ? written : single;
  const expected = stack ? intent.stackBefore + quantity : quantity;
  if (!document || !landed(document, { marker, quantityPath, expected })) {
    return settled('uncertain', intent, null, failure('receiptMismatch'));
  }
  const receipt = { itemUuid: document.uuid ?? null, placed: quantity, stacked: stack };
  return settled('applied', intent, receipt, null);
}

/**
 * Place one award entry on the effect path (issue 1954), answering `{ status, intent, receipt,
 * failure }` with status `applied`, `knownFailure`, `uncertain`, or `notAttempted` when
 * `beforeWrite(intent)` does not answer `true`. A pre-write throw is `knownFailure`, a throw from
 * `beforeWrite` propagates, and a throw during the write is `uncertain`. `carried` maps
 * componentId to the document to stack onto, so a caller can rebuild it from prior receipts.
 */
export async function placeComponentAward(
  {
    actor,
    entry,
    system,
    marker = null,
    carried = new Map(),
    quantityPath = itemStackQuantityPath(),
    beforeWrite = null,
  },
  seams
) {
  let phase = 'preflight';
  let intent = null;
  const proceed = async (planned) => {
    intent = planned;
    phase = 'hook';
    const go = beforeWrite ? (await beforeWrite(planned)) === true : true;
    phase = 'write';
    return go;
  };
  const create = (itemData) => actor.createEmbeddedDocuments('Item', [itemData]);
  try {
    const placed = await writeAwardEntry({
      actor,
      entry,
      system,
      quantityPath,
      carried,
      seams,
      marker,
      create,
      proceed,
      strict: true,
    });
    intent = placed.intent ?? intent;
    if (placed.refusal) return settled('knownFailure', intent, null, failure(placed.refusal));
    if (placed.aborted) return settled('notAttempted', intent, null, null);
    const answer = judgePlacement(placed, { marker, quantityPath });
    if (answer.status === 'applied') {
      carried.set(entry.componentId, placed.target ?? placed.written[0]);
    }
    return answer;
  } catch (error) {
    if (phase === 'hook') throw error;
    const detail = error?.message ?? String(error);
    if (phase === 'write') return settled('uncertain', intent, null, failure('writeThrew', detail));
    return settled('knownFailure', intent, null, failure('preflightThrew', detail));
  }
}

/**
 * Recovery probe (issue 1954): `applied` with a receipt only when a candidate document carries
 * `marker` AND the intended post-value on `_source`; otherwise `uncertain`, never unapplied.
 */
export function probeComponentAward({
  intent,
  marker,
  quantity,
  documents = [],
  quantityPath = itemStackQuantityPath(),
}) {
  const stack = intent?.mode === 'stack';
  const expected = stack ? intent.stackBefore + quantity : quantity;
  const document = marker
    ? documents.find((candidate) => landed(candidate, { marker, quantityPath, expected }))
    : null;
  if (!document) return { status: 'uncertain', receipt: null };
  const receipt = { itemUuid: document.uuid ?? null, placed: quantity, stacked: stack };
  return { status: 'applied', receipt };
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
