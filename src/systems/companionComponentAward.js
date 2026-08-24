/**
 * The **Component Award** — placing one or more of a crafting system's components onto an
 * actor's sheet, published to a companion module as `game.fabricate.awardComponents`
 * (issue 1301).
 *
 * ## What this member is, and what the contract already published
 *
 * `getCraftingEngine().findComponentItems` has been published since issue 1289 as the RESOLVER
 * half of a two-part operation — "finds an actor's existing stacks of a component, so an award
 * can stack rather than duplicate" — while the write half was reachable only from inside
 * Fabricate. This module is that write half, composed with the resolver it was designed to
 * compose with, so a companion holding the resolver's answer finally has somewhere to take it.
 *
 * ## A write is judged by its RETURN VALUE, not by whether it threw
 *
 * Every derived number this module reports is read back out of what a write ANSWERED, and
 * never restated from the request. Foundry document writes fail silently far more often than
 * they reject: `createEmbeddedDocuments` resolves `[]` when a constructor throws or a
 * `_preCreate`/`preCreateItem` hook refuses, and `Document#update` resolves `undefined` when
 * the whole diff is empty — which is exactly what a GM-authored stack-quantity path that is not
 * in the item's data model produces. So:
 *
 * - the CREATE branch judges the seam's returned document (`createOrStackComponentItem`
 *   normalises both failures to `null`);
 * - the STACK branch judges `updateStackQuantity`'s OWN answer, which is `null` for every case
 *   where nothing was written;
 * - a rejection anywhere in an entry's body — including from `resolveSourceItem`, which is
 *   `fromUuid` in production and rejects on a server error loading from a pack that exists —
 *   is that entry's `awardFailed`, and the loop continues.
 *
 * There is deliberately NO re-read of the stored quantity across the write. A pre-read/post-read
 * inequality reports success for a discarded write whenever anything else moved the stack
 * concurrently, and reports failure for a successful write on a system whose data preparation
 * recomputes the configured path — and `awardFailed` is published as RETRY-SAFE, so that second
 * lie double-awards.
 *
 * ## The stack write is THIS module's, and the shared seam is used only to CREATE
 *
 * {@link createOrStackComponentItem} decides create-vs-update itself and returns the existing
 * item UNCONDITIONALLY on its stack branch, throwing away `updateStackQuantity`'s answer — the
 * one fact this member has to report honestly. It has three other production callers on the
 * craft and salvage paths that read its return AS AN ITEM, so widening it is not available.
 * This module therefore selects its stack target with the BYTE-IDENTICAL predicate that seam
 * uses, performs the stack itself, and passes `matchingItems: []` on every create call so the
 * seam can never take its own stack branch. What stays shared is the part that matters: the
 * create normalisation, and the matcher — `findComponentItems`, so what an award stacks onto
 * and what salvage consumes can never disagree.
 *
 * ## A Foundry-free leaf
 *
 * It reads NO global, resolves NO actor and imports exactly four modules. The crafting system,
 * the component, the actor's matching items, the source item and the create primitive all
 * arrive as SEAMS, and the resolved actor arrives as an argument — the facade resolves it
 * through the shared ownership-gated resolver, so there is no second resolver here to disagree
 * with the first, and no route past the very seam every stacking assertion depends on.
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
 * The CLOSED key set of one award entry.
 *
 * Closed rather than merely required: an entry-level `systemId` is refused rather than silently
 * honoured, because a component id is not globally unique and the identity stamp is per system,
 * so a mixed-system award is two calls (D11). The test is over `Object.keys`, so
 * `{ componentId, quantity: undefined }` IS a well-formed entry whose QUANTITY is then refused
 * per entry — the caller told us which component it wanted and got a per-entry answer about it,
 * where `{ componentId }` alone is a malformed list and refuses the whole call.
 */
const AWARD_ENTRY_KEYS = Object.freeze(['componentId', 'quantity']);

/**
 * The fallback item payload's shape, for a component whose `registeredItemUuid` resolves
 * nothing — the same shape the crafting engine's own result creation falls back to.
 */
const FALLBACK_ITEM_NAME = 'Awarded Item';
const FALLBACK_ITEM_IMG = 'icons/svg/item-bag.svg';

/**
 * Normalize one entry's `quantity`, REFUSING rather than coercing.
 *
 * A numeric string is accepted, because a companion reading an authored activity field
 * legitimately holds one; everything else is refused. The safe-integer test is not fussiness:
 * `createOrStackComponentItem` silently coerces any non-finite or non-positive
 * `awardedQuantity` to ONE, while the create path would author `2.5` verbatim — so a validator
 * written as `quantity > 0` ships a fractional stack and a `-1` that awards a single unit.
 * Beyond `Number.MAX_SAFE_INTEGER` a stack's arithmetic silently stops being exact.
 *
 * @param {*} value the caller's `quantity`
 * @returns {number|null} the whole positive quantity, or `null` when there is no usable one
 */
function normalizeAwardQuantity(value) {
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Whether one entry is a well-formed award entry (see {@link AWARD_ENTRY_KEYS}).
 *
 * @param {*} entry
 * @returns {boolean}
 */
function isAwardEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const keys = Object.keys(entry);
  // OWN keys on both sides. `key in entry` would admit an entry whose `quantity` lives on a
  // prototype while an unrecognised own key rode in beside it, which is precisely what a closed
  // key set is a claim about.
  return (
    keys.length === AWARD_ENTRY_KEYS.length &&
    AWARD_ENTRY_KEYS.every((key) => Object.hasOwn(entry, key))
  );
}

/**
 * The caller's `awards` list, or `null` when the whole call must refuse `invalidAwards`.
 *
 * An EMPTY list refuses rather than succeeding vacuously: `placements: []` already means
 * NOTHING WAS ATTEMPTED, so a vacuous `awarded: 0` beside it would collide head-on with the one
 * distinction the answer shape exists to draw. The upper bound exists because each entry is a
 * Foundry document write, so an unbounded list is an unbounded write batch driven by an
 * external caller.
 *
 * @param {*} awards
 * @returns {Array<object>|null}
 */
function validateAwardEntries(awards) {
  if (!Array.isArray(awards)) return null;
  if (awards.length === 0 || awards.length > AWARD_ENTRIES_MAX) return null;
  return awards.every(isAwardEntry) ? awards : null;
}

/**
 * The item this award would stack onto, chosen with the predicate
 * {@link createOrStackComponentItem} uses BYTE-IDENTICALLY, so the two can never disagree about
 * which candidate is the target.
 *
 * @param {*} matchingItems the resolver's answer
 * @returns {object|null}
 */
function selectStackTarget(matchingItems) {
  if (!Array.isArray(matchingItems)) return null;
  return matchingItems.find((item) => item && typeof item.update === 'function') ?? null;
}

/**
 * Build the item payload for the CREATE branch, from NAMED KEYS ONLY.
 *
 * No caller-supplied key reaches it. Spreading the entry in would leave the seam's key set and
 * the answer unchanged while the created Foundry document carried caller-controlled arbitrary
 * keys — which is a leading cause of `createEmbeddedDocuments` resolving `[]`, and so would
 * manufacture the very silent failure this member exists to report.
 *
 * The quantity write is guarded exactly as the crafting engine's own result creation guards it,
 * so a game system with no quantity field does not have one INVENTED — and then the WRITTEN
 * VALUE is tested rather than the field's presence. Presence is not enough: a GM who configures
 * the PARENT of the count makes the path resolve an object, `hasStackQuantity` still answers
 * `true`, and `setStackQuantity` warns and no-ops, so a presence test would create ONE document
 * while the answer reported N.
 *
 * @param {object} params
 * @param {object} params.component the resolved component
 * @param {number} params.quantity the whole positive quantity to author
 * @param {string} params.quantityPath the path resolved ONCE for this call
 * @param {string|null|undefined} params.systemId the crafting system's own id, for the stamp
 * @param {(uuid: string) => Promise<object|null>} params.resolveSourceItem
 * @returns {Promise<object|null>} the payload, or `null` when the world cannot carry the count
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
  // The absent default of 1 is what preserves the "one document IS one unit" allowance: at
  // `quantity === 1` an absent or unreadable value answers 1 and the award proceeds, and only a
  // request for MORE than the world can express is refused. It is SPELLED rather than left to
  // the reader's default, because the routed-call-site guard in `tests/item-stack-quantity.test.js`
  // pins every absent default against live source and an implicit one is invisible to it.
  if (readStoredStackQuantity(itemData, { absentDefault: 1, path: quantityPath }) !== quantity) {
    return null;
  }

  stampItemDataRoleIdentity(itemData, systemId, 'componentId', component?.id);
  return itemData;
}

/**
 * Attempt the STACK branch against an already-chosen target.
 *
 * `absentDefault: null` is the whole of the "nothing is invented" rule: a `null` base means the
 * target carries no readable count, and the caller then falls through to CREATE a second
 * document rather than authoring a count field on an item type that has none. A finite stored
 * `0` is kept as a base, exactly as the shared seam's own comment requires.
 *
 * The write is judged by `updateStackQuantity`'s own return, which is `null` for every case in
 * which nothing was written — an object-valued path, an `update` that resolved nothing, and an
 * item with no `update` function (which this target cannot be, because the predicate that
 * selected it tested for one).
 *
 * @param {object} params
 * @param {object} params.target the item to stack onto
 * @param {number} params.quantity
 * @param {string} params.quantityPath
 * @returns {Promise<{placed: number, stacked: boolean|null, outcome: string}|null>} the entry's
 *   outcome, or `null` when this target cannot be stacked onto at all
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
 * Place ONE entry, with the WHOLE body inside one `try`.
 *
 * The `try` encloses the resolution and the payload build as well as the mutating call, because
 * `resolveSourceItem` is a third rejecting site: the crafting engine leaves its own two
 * `fromUuid` calls uncaught on one path and wraps them on another, and a `stable` member may
 * not throw on either.
 *
 * The loop this belongs to ACCUMULATES rather than aborting at the first failure. An award is a
 * GIVE: stopping compounds nothing, withholds value the GM authorised, and would force the
 * caller's log to record a non-reason for every later entry.
 *
 * @param {object} params
 * @param {object|null} params.actor the RESOLVED actor
 * @param {object} params.entry one caller entry
 * @param {object} params.system the resolved crafting system
 * @param {string} params.quantityPath
 * @param {Map<string, object>} params.carried the per-CALL duplicate-`componentId` map
 * @param {object} params.seams
 * @returns {Promise<{componentId: *, requested: *, placed: number, stacked: boolean|null,
 *   outcome: string}>} this member's INTERNAL placement record
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

    // Resolution runs BEFORE the resolver seam, and that ordering is this member's compliance
    // with its own promise tier rather than tidiness: the published carve-out records that
    // `findComponentItems` THROWS on a null component, and a `stable` member may not throw.
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

    // `matchingItems` is ALWAYS `[]` here: this member has already decided not to stack, and a
    // non-empty array would let the seam take its own stack branch and invent the count field
    // this member just declined to invent. The quantity rides on `itemData` as well as on
    // `awardedQuantity`, because the seam ignores `awardedQuantity` entirely when it creates.
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
 * The CALL-level outcome, derived from the placements alone.
 *
 * `awarded` means every entry placed its full requested quantity; `awardFailed` means every
 * entry was ATTEMPTED and nothing landed, which the fully populated `placements` beside it is
 * what distinguishes from a refusal that never attempted anything.
 *
 * @param {Array<{placed: number, outcome: string}>} placements
 * @returns {string}
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
 * Award components to an actor — the behaviour published as
 * `game.fabricate.awardComponents` (issue 1301).
 *
 * **Not idempotent, and no idempotency will be added.** An award has no natural key: awarding
 * three hides twice is legitimately six hides, and nothing Fabricate can read distinguishes a
 * duplicate award from a second, intended one. The CALLER owns not double-awarding, and the
 * recommended discipline is a claim recorded in front of the irreversible act rather than a
 * guard inside it. The `callSite` election gate removes the steady-state multi-client
 * duplication class and is not a lease.
 *
 * **The stack-quantity path is resolved ONCE per call** and threaded explicitly into the
 * payload build, the written-value test and the write itself. The per-entry body spans two
 * `await`s, so a lane that re-resolved the module's ambient path at each site could write at
 * one path and read at another after a mid-call reconfiguration.
 *
 * **Two entries naming the same component never produce two documents where the world can
 * express a stack count**, through a per-CALL map of what this call has already placed. Per
 * call, never module-scoped: a leaked map would take one actor's item as another actor's stack
 * target and land the value on the wrong player's sheet with a truthful-looking answer.
 *
 * @param {object|null} actor the already-resolved actor — the facade's ownership gate ran
 * @param {object} request
 * @param {string} request.systemId the crafting system every entry resolves within
 * @param {Array<{componentId: string, quantity: number|string}>} request.awards
 * @param {string} request.callSite one of `COMPANION_CALL_SITES`; required, no default
 * @param {object} seams the six injected seams, supplied by the facade
 * @param {(systemId: string) => object|null} seams.resolveSystem
 * @param {(system: object, componentId: string) => object|null} seams.resolveComponent
 * @param {(actor: object, component: object, system: object) => Array<object>}
 *   seams.findComponentItems the PUBLISHED resolver, so what an award stacks onto and what
 *   salvage consumes can never disagree
 * @param {(uuid: string) => Promise<object|null>} seams.resolveSourceItem
 * @param {(params: object) => Promise<object|null>} [seams.createOrStack] the CREATE primitive
 * @param {() => boolean} seams.isElectedExecutor
 * @returns {Promise<Readonly<{success: boolean, awarded: number|null,
 *   placements: Array<object>, outcome: string, message: string, messageData?: object}>>}
 */
export async function awardComponents(
  actor,
  { systemId = null, awards = null, callSite = null } = {},
  { createOrStack = createOrStackComponentItem, ...seams } = {}
) {
  const refusal = gateCompanionCallSite({ callSite }, seams);
  if (refusal) return componentAwardResult(refusal);

  // The caller's own arguments are validated first, because they are the ones whose refusal
  // points at the call site; the crafting system is the GM's problem and is reported after.
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

  // Resolved ONCE, here, and threaded from here on. A lane that re-read the module's ambient
  // path at each site could write at one path and read at another, because the per-entry body
  // spans two `await`s and a GM can reconfigure the setting between them.
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
