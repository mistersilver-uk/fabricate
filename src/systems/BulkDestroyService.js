/**
 * Permanently destroys the selected components on one actor (issue 859).
 *
 * ## "Destroy", and whole stacks
 *
 * **Destroy** already has exactly one meaning across Fabricate — `Tool.onBreak:
 * 'destroy'`, a `RecipeItem` "destroyed when spent", and this player action: *the
 * document is removed permanently and nothing replaces it*. "Scrap" is reserved as a
 * salvage RESULT-GROUP name (what salvage gives you) and must never name a destructive
 * action.
 *
 * Destroy removes the WHOLE stack. That is what destroying a thing means; the gesture
 * carries no quantity control; and salvage's one-unit-at-a-time rule comes from the
 * GM-authored `salvage.ingredientQuantity`, for which destroy has no analogue —
 * `salvage` is not read here at all.
 *
 * ## Deliberately NOT gated on salvage
 *
 * Neither `CraftingSystem.features.salvage` nor `component.salvage.enabled` gates this.
 * A player can already delete their own owned Items from the Foundry sheet, so this
 * adds ergonomics, not capability, and a blocked-for-salvage row is often exactly the
 * row a player wants gone. There is also **no chat card**: a result card reports what
 * an activity PRODUCED, and this produces nothing.
 *
 * ## The stack count is read through the configured accessor, never a literal
 *
 * `readStackQuantity` is the required reader for both the pre-delete capture and
 * `unitsDeleted`. The stack-quantity path is GM-configurable, so any other spelling
 * reports the wrong number on a world whose system does not use the dnd5e/pf2e field
 * (`tests/quantity-literal-gate.test.js` pins that). `updateStackQuantity` is
 * deliberately NOT used: a delete is not a schema-filtered update.
 *
 * ## Known consequence, recorded rather than papered over
 *
 * An active salvage or crafting run that references a destroyed document is not
 * cleaned up — `cleanupInvalidRuns` prunes deleted *content*, not deleted *documents* —
 * so such a run fails when it resumes.
 */

import { readStackQuantity } from './itemStackQuantity.js';

/**
 * The reasons a destroy target is refused before any deletion is attempted.
 *
 * `depleted` is the already-normative id for "the actor holds none of this", reused
 * here rather than coining a destroy-only synonym.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BULK_DESTROY_SKIP_REASONS = Object.freeze({
  unknownSystem: 'unknownSystem',
  unknownComponent: 'unknownComponent',
  depleted: 'depleted',
});

export class BulkDestroyService {
  /**
   * @param {object} options
   * @param {Function} options.getCraftingSystem `(systemId) => system|null`.
   * @param {Function} options.findComponentItems The engine's `findComponentItems(actor,
   *   component, system)`. Injected rather than reimplemented so destroy resolves
   *   documents through the IDENTICAL matcher salvage uses, including its
   *   case-SENSITIVE name fallback — a destroy that matched more broadly than salvage
   *   would delete things the player was shown as belonging to a different component.
   * @param {Function} options.deleteItems `(actor, itemIds) => Promise<Document[]>`,
   *   wrapping `actor.deleteEmbeddedDocuments('Item', ids)`. It must return the
   *   documents that were actually deleted; see {@link run}.
   */
  constructor({ getCraftingSystem, findComponentItems, deleteItems } = {}) {
    this.getCraftingSystem = getCraftingSystem;
    this.findComponentItems = findComponentItems;
    this.deleteItems = deleteItems;
  }

  /**
   * Destroy every target's whole stack on that target's own actor.
   *
   * ## Target-actor scoped
   *
   * A listing row's `sources` may span actors, but the panel resolves one target actor
   * per row and `findComponentItems` takes one actor. The counts this reports are
   * therefore the TARGET ACTOR's units, matching what the confirmation named.
   *
   * @param {object} params
   * @param {Array<{actor: object, actorId: string, actorName: string, systemId: string,
   *   componentId: string}>} params.targets Targets carrying an ALREADY-RESOLVED actor
   *   document; the facade owns resolution and the ownership gate.
   * @param {Function} [params.onProgress] Called `(completed, total)` after each target
   *   resolves — see {@link reportDestroyProgress}. OPTIONAL: a run without one behaves
   *   identically, and nothing the listener returns is awaited.
   * @returns {Promise<{items: object[], unitsDeleted: number, documentsDeleted: number}>}
   *   Plain models only — the documents are gone by the time this returns.
   */
  async run({ targets = [], onProgress = null } = {}) {
    const items = [];
    const queue = targets || [];
    for (const target of queue) {
      // Sequential for the same reason bulk salvage is: two rows can resolve to the
      // same owned document, and row k+1 must see what row k deleted.
      items.push(await this._destroyOne(target));
      // Every target ticks, a skip included: `_destroyOne` resolves each one, and the
      // panel is marking the rows the player confirmed, in this order.
      reportDestroyProgress(onProgress, items.length, queue.length);
    }
    return {
      items,
      unitsDeleted: items.reduce((sum, item) => sum + item.unitsDeleted, 0),
      documentsDeleted: items.reduce((sum, item) => sum + item.documentsDeleted, 0),
    };
  }

  /** @private */
  async _destroyOne(target) {
    const system = this.getCraftingSystem?.(target?.systemId) ?? null;
    if (!system) return buildRow(target, null, BULK_DESTROY_SKIP_REASONS.unknownSystem);

    const component =
      (system.components || []).find((entry) => entry?.id === target?.componentId) || null;
    if (!component) {
      return buildRow(target, null, BULK_DESTROY_SKIP_REASONS.unknownComponent);
    }

    const actor = target?.actor ?? null;
    const found = (await this.findComponentItems?.(actor, component, system)) || [];
    // CAPTURED BEFORE DELETING. Once the document is gone its name, image and stack
    // size are unreadable, so a report built afterwards would be blank rows.
    const captured = found.filter(Boolean).map((item) => ({
      id: item.id,
      name: item.name || component.name || '',
      img: item.img || component.img || '',
      quantity: readStackQuantity(item),
    }));
    if (captured.length === 0) {
      return buildRow(target, component, BULK_DESTROY_SKIP_REASONS.depleted);
    }

    const row = buildRow(target, component, null);
    row.requested = captured.reduce((sum, entry) => sum + entry.quantity, 0);
    row.items = captured.map(({ name, img, quantity }) => ({ name, img, quantity }));

    const byId = new Map(captured.map((entry) => [entry.id, entry]));
    const { requestedIds, deletedIds } = await this._deleteCaptured(actor, captured);
    // STALE and VETOED are two different stories and must not be merged. A stale id was
    // never submitted — the document had already gone, so there is nothing to tell the
    // player beyond "the panel was out of date". A VETOED id WAS submitted and a
    // `preDeleteItem` hook refused it, so that row is still in the player's pack and is
    // the one they need to see.
    row.staleIds = captured.length - requestedIds.length;

    const outstanding = new Map(requestedIds.map((id) => [id, byId.get(id)]));
    // `unitsDeleted` derives from what the delete RETURNED, never from what was
    // requested: `preDeleteItem` returning false drops individual ids SILENTLY while
    // the rest of the batch deletes, so counting the request would tell the player it
    // destroyed something that is still in their pack.
    for (const id of deletedIds) {
      const entry = outstanding.get(id);
      if (!entry) continue;
      row.unitsDeleted += entry.quantity;
      row.documentsDeleted += 1;
      outstanding.delete(id);
    }
    row.vetoed = [...outstanding.values()]
      .filter(Boolean)
      .map(({ name, img, quantity }) => ({ name, img, quantity }));
    if (row.documentsDeleted === 0) row.outcome = 'failed';
    return row;
  }

  /**
   * Delete the captured documents and report the ids that actually went.
   *
   * ## Why the ids are filtered against the live collection first
   *
   * `deleteEmbeddedDocuments` is ALL-OR-NOTHING on a stale id.
   * `#preDeleteDocumentArray` resolves every id with `collection.get(id, {strict:
   * true})`, which THROWS on the first one it cannot find — so a single id that went
   * away between the panel snapshot and the confirm click deletes NOTHING, not even
   * the twenty valid ids beside it. Destroy always runs against a snapshot the player
   * has been reading, and `InventoryView` reloads on world-time, scene and source
   * changes while the confirm dialog stands, so a stale id is expected rather than
   * exotic.
   *
   * The filter is skipped when the actor exposes no live collection lookup, because
   * filtering everything out would zero a run that would otherwise have succeeded —
   * a defence must not be able to cause the failure it defends against.
   *
   * ## And why the fallback is per item
   *
   * A per-item retry re-enters the same strict lookup one id at a time, so exactly the
   * stale id fails and every valid one still goes. Each retry is caught individually
   * and the loop continues.
   *
   * @private
   * @returns {Promise<{requestedIds: string[], deletedIds: Set<string>}>} What was
   *   actually submitted, and what the delete reported as removed. The caller needs
   *   BOTH: the difference between them is the vetoed set, and reporting a never-
   *   submitted stale id as vetoed would tell the player a hook refused something
   *   nothing ever asked for.
   */
  async _deleteCaptured(actor, captured) {
    const live = actor?.items?.has;
    const requestedIds =
      typeof live === 'function'
        ? captured.filter((entry) => actor.items.has(entry.id)).map((entry) => entry.id)
        : captured.map((entry) => entry.id);
    if (requestedIds.length === 0) return { requestedIds, deletedIds: new Set() };

    try {
      return { requestedIds, deletedIds: toIdSet(await this.deleteItems(actor, requestedIds)) };
    } catch (error) {
      console.error(
        'Fabricate | Bulk destroy batch failed; retrying one document at a time:',
        error
      );
    }

    const deletedIds = new Set();
    for (const id of requestedIds) {
      try {
        for (const deletedId of toIdSet(await this.deleteItems(actor, [id]))) {
          deletedIds.add(deletedId);
        }
      } catch (error) {
        console.error(`Fabricate | Bulk destroy could not delete item "${id}":`, error);
      }
    }
    return { requestedIds, deletedIds };
  }
}

/**
 * Report one more destroyed target to an optional listener, absorbing anything it
 * throws.
 *
 * Destroy is irreversible and the loop is already mid-flight when the first tick fires,
 * so a consumer's broken callback must never be able to abandon the rest of the queue —
 * that would leave the player with a half-destroyed selection and a report that no
 * longer describes their pack. The listener is called for effect only: the return value
 * is ignored and never awaited.
 *
 * Deliberately local rather than imported from the salvage service: destroy shares no
 * module with salvage on purpose, and a shared import for six lines would be the first
 * thread between them.
 *
 * @param {Function|null} onProgress The listener, or anything that is not a function.
 * @param {number} completed Targets destroyed so far, 1-based and monotonic.
 * @param {number} total Targets this run was given.
 */
function reportDestroyProgress(onProgress, completed, total) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress(completed, total);
  } catch (error) {
    console.error('Fabricate | A bulk destroy progress listener threw; the run continues:', error);
  }
}

/**
 * The ids a delete reported as removed.
 *
 * Accepts documents (what `deleteEmbeddedDocuments` returns) and bare id strings (what
 * a seam may hand back), because reading `undefined` out of the wrong shape would
 * silently report every row as vetoed.
 */
function toIdSet(deleted) {
  const ids = new Set();
  for (const entry of deleted || []) {
    if (typeof entry === 'string') ids.add(entry);
    else if (entry?.id) ids.add(entry.id);
    else if (entry?._id) ids.add(entry._id);
  }
  return ids;
}

/** The plain, document-free report row for one destroy target. */
function buildRow(target, component, skipReason) {
  return {
    actorId: target?.actorId ?? null,
    actorName: target?.actorName ?? '',
    systemId: target?.systemId ?? null,
    componentId: target?.componentId ?? null,
    name: component?.name || '',
    img: component?.img || '',
    outcome: skipReason ? 'skipped' : 'succeeded',
    skipReason: skipReason ?? null,
    requested: 0,
    unitsDeleted: 0,
    documentsDeleted: 0,
    staleIds: 0,
    items: [],
    vetoed: [],
  };
}
