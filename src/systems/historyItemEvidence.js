import { getRunLifecycleContract } from './runLifecycleState.js';

/** Historical identity metadata never supplies another occurrence's quantity or state. */
const list = (value) => (Array.isArray(value) ? value : []);
const named = (value) => typeof value === 'string' && value.trim() !== '';
const time = (value) =>
  value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

function physicalKey(row) {
  const match = /^(Actor\.[^.]+|Scene\.[^.]+\.Token\.[^.]+\.Actor\.[^.]+)\.Item\.[^.]+$/.exec(
    row?.itemUuid ?? ''
  );
  return match && (!named(row.actorUuid) || row.actorUuid === match[1]) ? row.itemUuid : null;
}

function readMetadata(read, key) {
  try {
    return read?.(key) ?? null;
  } catch {
    return null;
  }
}

function metadataField(candidates, field) {
  const values = new Set(candidates.map((row) => row?.[field]).filter(named));
  return { conflict: values.size > 1, value: values.size === 1 ? [...values][0] : null };
}

/** Callers supply only currently entitled sources and scoped component lookups. */
export function enrichHistoricalConsumption(
  step,
  { earlierItems = [], liveItem = null, component = null } = {}
) {
  const prepared = list(step?.preparedConsumption?.consumedSummary);
  const consumed = list(step?.consumedIngredients);
  return (consumed.length > 0 ? consumed : prepared).map((entry) => {
    const row = structuredClone(entry);
    const key = physicalKey(row);
    const matching = (items) => (key ? items.filter((item) => physicalKey(item) === key) : []);
    const preparedMatches = matching(prepared);
    const historicalMatches = matching(earlierItems);
    const live = key ? readMetadata(liveItem, key) : null;
    const definition = named(row.componentId) ? readMetadata(component, row.componentId) : null;
    for (const field of ['name', 'img']) {
      if (named(row[field])) continue;
      row[field] = null;
      for (const candidates of [preparedMatches, [live], historicalMatches, [definition]]) {
        const evidence = metadataField(candidates, field);
        if (evidence.conflict) break;
        if (evidence.value) {
          row[field] = evidence.value;
          break;
        }
      }
    }
    return row;
  });
}

function receiptItems(effect) {
  if (effect?.phase !== 'applied') return [];
  if (effect.kind === 'awardResults') return list(effect.receipt?.results);
  if (['consumeIngredients', 'consumeAlchemyExtras'].includes(effect.kind))
    return list(effect.receipt?.items);
  if (
    ['awardItems', 'createGatheredResults', 'consumeItems', 'consumeAlchemyItems'].includes(
      effect.kind
    )
  )
    return list(effect.receipt);
  return [];
}

function recordedItems(run) {
  const contract = getRunLifecycleContract(run);
  if (contract === 'current') return list(run.executionJournal?.effects).flatMap(receiptItems);
  if (contract !== 'legacy') return [];
  return [
    ...list(run.createdResults),
    ...list(run.steps).flatMap((step) => [
      ...list(step.createdResults),
      ...list(step.consumedIngredients),
    ]),
  ];
}

/** Only established earlier terminal evidence is eligible; entitlement precedes this call. */
export function historicalItemSources(runs, before, { sameTimeIsEarlier = false } = {}) {
  const boundary = time(before);
  if (boundary === null) return [];
  return list(runs)
    .filter((run) => {
      const at = time(run.finishedAt ?? run.completedAtWorldTime);
      return (
        ['succeeded', 'failed', 'cancelled'].includes(run.status) &&
        at !== null &&
        (at < boundary || (sameTimeIsEarlier && at === boundary))
      );
    })
    .flatMap(recordedItems)
    .filter((row) => physicalKey(row))
    .map((row) => ({
      actorUuid: row.actorUuid ?? null,
      itemUuid: row.itemUuid,
      name: named(row.name) ? row.name : null,
      img: named(row.img) ? row.img : null,
    }));
}
