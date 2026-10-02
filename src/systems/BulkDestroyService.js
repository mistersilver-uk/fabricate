/**
 * Permanently destroys the selected components' whole stacks on one actor (issue 859; DOMAIN.md
 * "Bulk Destroy": one meaning of destroy, no salvage gate, no chat card). Stack counts are read
 * through `readStackQuantity`, never a literal, since the path is GM-configurable
 * (`tests/quantity-literal-gate.test.js`). An active run referencing a destroyed document is not
 * cleaned up (`cleanupInvalidRuns` prunes deleted content, not documents), so it fails on resume.
 */

import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';

import { readStackQuantity } from './itemStackQuantity.js';
import { resolvedComponentsFor } from './scopedEntityReads.js';

/** Why a target is refused before any deletion; `depleted` reuses the normative id. */
export const BULK_DESTROY_SKIP_REASONS = Object.freeze({
  unknownSystem: 'unknownSystem',
  unknownComponent: 'unknownComponent',
  depleted: 'depleted',
});

export class BulkDestroyService {
  /**
   * `findComponentItems` is the engine's, so destroy matches documents exactly as salvage does,
   * case-SENSITIVE name fallback included; `deleteItems` must return the documents it deleted.
   */
  constructor({ getCraftingSystem, findComponentItems, deleteItems } = {}) {
    this.getCraftingSystem = getCraftingSystem;
    this.findComponentItems = findComponentItems;
    this.deleteItems = deleteItems;
  }

  /**
   * Destroy each target's whole stack on its own already-resolved actor (the facade owns the
   * ownership gate), so the counts are that actor's units. `onProgress(completed, total)` is
   * optional and never awaited. Answers plain models only, since the documents are gone.
   */
  async run({ targets = [], onProgress = null } = {}) {
    const items = [];
    const queue = targets || [];
    for (const target of queue) {
      // Sequential for the same reason bulk salvage is: two rows can resolve to the
      // same owned document, and row k+1 must see what row k deleted.
      items.push(await this._destroyOne(target));
      // Every target ticks, a skip included, in the order the player confirmed.
      reportDestroyProgress(onProgress, items.length, queue.length);
    }
    return {
      items,
      unitsDeleted: items.reduce((sum, item) => sum + item.unitsDeleted, 0),
      documentsDeleted: items.reduce((sum, item) => sum + item.documentsDeleted, 0),
    };
  }

  async _destroyOne(target) {
    const system = this.getCraftingSystem?.(target?.systemId) ?? null;
    if (!system) return buildRow(target, null, BULK_DESTROY_SKIP_REASONS.unknownSystem);

    const component = findById(
      getDefinitionIndex(resolvedComponentsFor(system)),
      target?.componentId
    );
    if (!component) {
      return buildRow(target, null, BULK_DESTROY_SKIP_REASONS.unknownComponent);
    }

    const actor = target?.actor ?? null;
    const found = (await this.findComponentItems?.(actor, component, system)) || [];
    // Captured before deleting: a gone document's name, image and stack size are unreadable.
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
    // A stale id was never submitted (the panel was out of date); a VETOED id was, and a
    // `preDeleteItem` hook kept it in the player's pack, so the two are reported apart.
    row.staleIds = captured.length - requestedIds.length;

    const outstanding = new Map(requestedIds.map((id) => [id, byId.get(id)]));
    // Counted from what the delete RETURNED: a `preDeleteItem` veto silently drops single ids
    // from an otherwise successful batch.
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
   * Delete the captured documents, answering the ids submitted and the ids removed (their
   * difference is the vetoed set). Ids are first filtered against the live collection, because one
   * stale id makes `deleteEmbeddedDocuments` reject the whole batch (see
   * `.agents/docs/foundry-and-architecture.md`) and the panel reloads under a standing confirm;
   * with no live lookup nothing is filtered. A failed batch retries per item, so only the stale id
   * fails.
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
 * Report progress, absorbing a listener's throw: destroy is irreversible and mid-flight, so a
 * broken callback must not abandon the queue. Local on purpose, as destroy shares no module with
 * salvage.
 */
function reportDestroyProgress(onProgress, completed, total) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress(completed, total);
  } catch (error) {
    console.error('Fabricate | A bulk destroy progress listener threw; the run continues:', error);
  }
}

/** Removed ids from documents or bare strings; misreading the shape would report all as vetoed. */
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
