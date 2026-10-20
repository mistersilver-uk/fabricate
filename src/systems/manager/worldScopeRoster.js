/** The source-keyed world entity roster both registration planners read (issues 2218, 2554). A
 * record's references default to `getItemMatchUuids`; a caller narrowing them passes its own
 * `referencesOf`, and every key is a `sourceReferenceKey`. */
import { arrayOrEmpty } from '../../utils/scalars.js';
import { getItemMatchUuids, sourceReferenceKey } from '../../utils/sourceReferenceUnion.js';

export function sourceKeys(record, referencesOf = getItemMatchUuids) {
  return new Set(referencesOf(record).map(sourceReferenceKey));
}

export function sharesSource(record, keys, referencesOf = getItemMatchUuids) {
  return referencesOf(record).some((reference) => keys.has(sourceReferenceKey(reference)));
}

/** A roster index: each entity by id, first-wins, and under each source key the first entity in
 * roster order that carries it. */
export function indexRoster(entities, referencesOf = getItemMatchUuids) {
  const roster = { byId: new Map(), byKey: new Map(), size: 0, referencesOf };
  for (const entity of arrayOrEmpty(entities)) addToRoster(roster, entity);
  return roster;
}

export function addToRoster(roster, entity) {
  const entry = { entity, order: roster.size };
  roster.size += 1;
  if (!roster.byId.has(entity?.id)) roster.byId.set(entity?.id, entity);
  for (const reference of roster.referencesOf(entity)) {
    const key = sourceReferenceKey(reference);
    if (!roster.byKey.has(key)) roster.byKey.set(key, entry);
  }
}

/** The first entity in roster order carrying one of `keys`, or `null`. */
export function firstSharing(roster, keys) {
  let first = null;
  for (const key of keys) {
    const entry = roster.byKey.get(key);
    if (entry && (!first || entry.order < first.order)) first = entry;
  }
  return first?.entity ?? null;
}

/** Every distinct entity carrying one of `keys`, in roster order. */
export function allSharing(roster, keys) {
  const found = new Map();
  for (const key of keys) {
    const entry = roster.byKey.get(key);
    if (entry) found.set(entry.order, entry.entity);
  }
  return [...found.keys()].sort((left, right) => left - right).map((order) => found.get(order));
}
