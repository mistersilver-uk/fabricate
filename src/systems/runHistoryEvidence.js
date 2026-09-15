import { isSafeFlagKeySegment } from '../config/flags.js';

import {
  hasStackQuantity,
  itemStackQuantityPath,
  readStoredStackQuantity,
  updateStackQuantity,
} from './itemStackQuantity.js';
import { getRunLifecycleContract, incrementRunRevision } from './runLifecycleState.js';

const text = (value) => (typeof value === 'string' && value.trim() ? value : null);
const list = (value) => (Array.isArray(value) ? value : []);
const states = new Set(['pending', 'complete', 'uncertain', 'notApplicable']);

export function receiptQuantity(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function itemReceipt(entry = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const receipt = Object.fromEntries(
    ['actorUuid', 'itemUuid', 'name', 'img'].map((key) => [key, text(source[key])])
  );
  const quantity =
    typeof source.quantity === 'string' && source.quantity.trim()
      ? Number(source.quantity)
      : source.quantity;
  receipt.quantity = receiptQuantity(quantity);
  for (const key of ['componentId', 'resultRowId', 'sourceItemUuid']) {
    if (Object.hasOwn(source, key)) receipt[key] = text(source[key]);
  }
  return receipt;
}

export function historyEvidenceFields(source = {}) {
  const evidence = {};
  if (
    ['check', 'ingredients', 'none'].includes(source.resolutionSnapshot?.kind) &&
    text(source.resolutionSnapshot.mode)
  ) {
    evidence.resolutionSnapshot = {
      kind: source.resolutionSnapshot.kind,
      mode: source.resolutionSnapshot.mode,
    };
  }
  if (source.historySettlement) {
    evidence.historySettlement = Object.fromEntries(
      ['consumption', 'awards']
        .filter((key) => states.has(source.historySettlement[key]))
        .map((key) => [key, source.historySettlement[key]])
    );
  }
  return evidence;
}

export function nativeHistoryRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const value = structuredClone(record);
  if (Object.hasOwn(value, 'lifecycleVersion')) return value;
  delete value.historySettlement;
  delete value.resolutionSnapshot;
  Object.assign(value, historyEvidenceFields(record));
  for (const key of ['consumedComponents', 'consumedIngredients', 'createdResults']) {
    if (Array.isArray(record[key])) value[key] = record[key].map(itemReceipt);
  }
  return value;
}

export function unconfirmedHistoryError(message, receipts = [], cause = null) {
  const error = new Error(message, { cause });
  error.code = 'HISTORY_EFFECT_UNCERTAIN';
  error.receipts = list(receipts).map(itemReceipt);
  return error;
}

export function requireDocumentAcknowledgment(expected, returned) {
  if (!expected || returned !== expected) {
    throw unconfirmedHistoryError('The matching document did not acknowledge its write');
  }
  return returned;
}

/** Prepared data may be recomputed; effect deltas read the persisted source. */
export function sourceItemQuantity(item, { path, absentDefault = 1 } = {}) {
  const source = item?._source ?? item;
  if (!hasStackQuantity(source, path)) return receiptQuantity(absentDefault);
  return receiptQuantity(readStoredStackQuantity(source, { path, absentDefault: null }));
}

/** Return the acknowledged Item while its invocation collector retains the immutable delta. */
export async function writeItemAward({
  actor,
  itemData,
  existing = null,
  quantity,
  path = itemStackQuantityPath(),
  absentDefault = 1,
  receiptCollector = null,
  receiptIdentity = {},
}) {
  if (receiptQuantity(quantity) === null) throw unconfirmedHistoryError('Invalid award quantity');
  if (quantity === 0) return null;
  if (existing) {
    const before = sourceItemQuantity(existing, { path, absentDefault });
    if (before === null) throw unconfirmedHistoryError('Unknown source stack quantity');
    // `throwOnRefusal` keeps the two `null`s apart: the path guard answers `null` WITHOUT
    // calling `update`, which acknowledgement cannot tell from a document that did not answer.
    requireDocumentAcknowledgment(
      existing,
      await updateStackQuantity(existing, before + quantity, path, { throwOnRefusal: true })
    );
    const after = sourceItemQuantity(existing, { path, absentDefault: null });
    if (after === null || after < before) throw unconfirmedHistoryError('Unknown awarded delta');
    receiptCollector?.record(existing, after - before, receiptIdentity);
    if (after - before !== quantity) throw unconfirmedHistoryError('Partial awarded delta');
    return existing;
  }
  if (typeof actor?.createEmbeddedDocuments !== 'function')
    throw unconfirmedHistoryError('Item creation unavailable');
  const requested = sourceItemQuantity(itemData, { path, absentDefault: quantity });
  if (requested === null) throw unconfirmedHistoryError('Invalid creation quantity');
  const created = await actor.createEmbeddedDocuments('Item', [itemData]);
  if (
    !Array.isArray(created) ||
    created.length !== 1 ||
    !created[0]?.uuid?.startsWith(`${actor.uuid}.Item.`) ||
    created[0].parent !== actor
  ) {
    throw unconfirmedHistoryError('Item creation was not acknowledged');
  }
  const item = created[0];
  const actual = sourceItemQuantity(item, { path });
  if (actual === null) throw unconfirmedHistoryError('Unknown created quantity');
  receiptCollector?.record(item, actual, receiptIdentity);
  if (actual !== requested) throw unconfirmedHistoryError('Partial created quantity');
  return item;
}

/** One invocation owns its receipts, including repeated awards onto one document. */
export function createItemReceiptCollector() {
  const receipts = [];
  return {
    record(item, quantity, identity = {}) {
      const receipt = itemReceipt({
        actorUuid: item.parent?.uuid,
        itemUuid: item.uuid,
        name: item.name,
        img: item.img,
        ...identity,
        quantity,
      });
      if (receipt.quantity === null || !receipt.itemUuid)
        throw unconfirmedHistoryError('Invalid Item receipt', receipts);
      receipts.push(Object.freeze(receipt));
      return receipt;
    },
    snapshot: () => receipts.map((receipt) => ({ ...receipt })),
    // A path-guard refusal reached no database at all, so with nothing recorded it is a DEFINITE
    // failure rather than the uncertain effect reconciliation exists for.
    failure: (error) =>
      error?.code === 'STACK_QUANTITY_PATH_REFUSED' && receipts.length === 0
        ? error
        : unconfirmedHistoryError('Item effects require reconciliation', receipts, error),
  };
}

/** The returned document array owns an immutable per-invocation snapshot, never its Items. */
export function attachAwardReceipts(items, receipts) {
  Object.defineProperty(items, 'historyReceipts', {
    value: Object.freeze(list(receipts).map((entry) => Object.freeze(itemReceipt(entry)))),
  });
  return items;
}

export function awardReceipts(items) {
  if (!Array.isArray(items)) return [];
  if (items.length > 0 && !Array.isArray(items.historyReceipts))
    throw unconfirmedHistoryError('Award receipts are missing');
  return list(items.historyReceipts).map(itemReceipt);
}

/** Native settlement is monotonic; a stale pending copy cannot erase settled evidence. */
export function preserveSettledHistory(current, next) {
  const byId = new Map(list(current).map((run) => [run.id, run]));
  return list(next).map((run) => {
    const saved = byId.get(run.id);
    if (!saved) return run;
    const protectedState = ['consumption', 'awards'].some(
      (key) =>
        ['complete', 'uncertain'].includes(saved.historySettlement?.[key]) &&
        !['complete', 'uncertain'].includes(run.historySettlement?.[key])
    );
    return protectedState ? saved : run;
  });
}

/** One flag update carries history plus child deletions; no active record is removed first. */
export async function writeAcknowledgedRunContainer(actor, namespace, key, current, next) {
  if (sameHistoryValue(current, next)) return;
  const payload = structuredClone(next);
  for (const id of Object.keys(current?.active ?? {})) {
    // A dotted or otherwise unsafe id cannot be addressed by a deletion key at all: the update
    // re-splits it on every dot and the `-=` lands on another node. Mirrors the same guard on
    // `GatheringStaminaService._deleteRetiredStaminaKeys`.
    if (!isSafeFlagKeySegment(id)) continue;
    // `-=` is deprecated `{since: 14, until: 16}` and V14's `_migrateDeletionKey` logs a
    // compatibility warning for it (behaviour is unchanged; it becomes a throw only under
    // `CONFIG.compatibility.mode = FAILURE`). It is KEPT DELIBERATELY. The replacement,
    // `foundry.data.operators.ForcedDeletion`, does not exist on V13 and this module ships at
    // `minimum: "13"`, and the only generation-neutral alternative — `Document#unsetFlag` —
    // deletes one key per write, which would break the single acknowledged update this function
    // exists to make. Migrate when the supported floor reaches V14; see the five sibling `-=`
    // writers, which must move together.
    if (!Object.hasOwn(payload.active, id)) payload.active[`-=${id}`] = null;
  }
  requireDocumentAcknowledgment(actor, await actor.setFlag(namespace, key, payload));
}

function sameHistoryValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== right.length) return false;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return (
    keys.length === Object.keys(right).filter((key) => right[key] !== undefined).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameHistoryValue(left[key], right[key]))
  );
}

export function assertNativeEffectsUninvoked(run) {
  if (
    Object.values(run?.historySettlement ?? {}).some((state) =>
      ['pending', 'uncertain'].includes(state)
    )
  ) {
    throw unconfirmedHistoryError('This run has invoked effects and cannot be replayed');
  }
}

/** A confirmed prefix belongs to its still-uncertain effect, never to an applied effect. */
export async function retainUncertainReceipt(
  location,
  effectId,
  receipts,
  { executionOperationId } = {}
) {
  const run = location?.run;
  if (!run || getRunLifecycleContract(run) !== 'current')
    throw unconfirmedHistoryError('A versioned run is required');
  location.assertMutation({ executionOperationId });
  const effect = run.executionJournal?.effects.find((entry) => entry.effectId === effectId);
  if (run.executionJournal?.operationId !== executionOperationId || effect?.phase !== 'applying')
    throw unconfirmedHistoryError('The uncertain effect is not owned by this operation');
  effect.receipt = { confirmed: list(receipts).map(itemReceipt), uncertain: true };
  incrementRunRevision(run);
  return location.persist();
}

/** Links are assigned on the evaluated input, before route selection or row filtering. */
export function linkResultGroups(groups = []) {
  return list(groups).map((group, groupIndex) => ({
    ...group,
    results: list(group.results).map((row, index) => ({
      ...row,
      resultRowId:
        text(row.resultRowId) ?? `${group.id ?? groupIndex}:${row.id ?? 'result'}:${index}`,
    })),
  }));
}
