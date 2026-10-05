/** World Component registration for an imported component (issue 2218): the decision for one
 * in-system record and the single `fabricate.componentScope` write a run flushes. It reads no
 * crafting system, so a caller passes the in-system rows in. Contract: `data-models/spec.md`
 * § Component scope requirement 6. */
import { isGeneralComponentCategory } from '../../utils/componentCategories.js';
import { arrayOrEmpty, trimString } from '../../utils/scalars.js';
import { getItemMatchUuids } from '../../utils/sourceReferenceUnion.js';
import { componentEssenceMapsEqual, normalizeComponentEssenceMap } from '../componentScope.js';
import { membershipKey } from '../scopedDefinitions.js';
import { identityOf } from '../worldScopeEntityGrouping.js';

/** A source reference's match key: a pack Item's uuid without its document-type segment, so the
 * type-less spelling earlier bulk imports stored matches the document's own. */
function sourceKey(reference) {
  const parts = reference.split('.');
  const packItem = parts.length === 5 && parts[0] === 'Compendium' && parts[3] === 'Item';
  return packItem ? `Compendium.${parts[1]}.${parts[2]}.${parts[4]}` : reference;
}

function sourceKeys(record) {
  return new Set(getItemMatchUuids(record).map(sourceKey));
}

function sharesSource(record, keys) {
  return getItemMatchUuids(record).some((reference) => keys.has(sourceKey(reference)));
}

function rowById(rows, id) {
  return arrayOrEmpty(rows).find((row) => row?.id === id) ?? null;
}

/** Rows keyed by id, first-wins as `rowById` reads them. */
function rowsById(rows) {
  const index = new Map();
  for (const row of arrayOrEmpty(rows)) if (!index.has(row?.id)) index.set(row?.id, row);
  return index;
}

/** The rows a run has registered that no roster entity stands for yet: each becomes an entity at
 * the flush, so adoption treats it as one. Each system's rows are indexed once per call. */
function pendingEntities(entities, registrations, rowsOf) {
  const known = new Set(entities.map((entity) => entity?.id));
  const indexed = new Map();
  const pending = [];
  for (const { systemId, componentId } of arrayOrEmpty(registrations)) {
    if (known.has(componentId)) continue;
    if (!indexed.has(systemId)) indexed.set(systemId, rowsById(rowsOf(systemId)));
    const row = indexed.get(systemId).get(componentId);
    if (!row) continue;
    known.add(componentId);
    pending.push(row);
  }
  return pending;
}

/** The id a record not yet in its system's array takes: that of the first entity in roster order
 * sharing a source with it, or `null` when none does or the system already holds a row under it. */
export function adoptedWorldComponentId({ entities, registrations, rowsOf, systemId, record }) {
  const keys = sourceKeys(record);
  if (keys.size === 0) return null;
  const roster = arrayOrEmpty(entities);
  const target = [...roster, ...pendingEntities(roster, registrations, rowsOf)].find((entity) =>
    sharesSource(entity, keys)
  );
  if (!target || rowById(rowsOf(systemId), target.id)) return null;
  return target.id;
}

/** The membership record for `(record, systemId)`: every section inherits, except that a record
 * the system already held keeps each value an authored world default would change, and a row the
 * run added keeps a category other than the reserved `general`. */
function membershipFor(systemId, record, added, worldDefault) {
  const membership = { entityId: record.id, systemId, inherit: {} };
  if (!worldDefault || typeof worldDefault !== 'object') return membership;
  const category = trimString(record.category);
  const worldCategory = trimString(worldDefault.category);
  const keepsCategory = added ? category && !isGeneralComponentCategory(category) : true;
  if (worldCategory && worldCategory !== category && keepsCategory) {
    membership.inherit.category = false;
    if (category) membership.category = category;
  }
  const worldEssences = worldDefault.essences;
  if (
    !added &&
    worldEssences !== undefined &&
    !componentEssenceMapsEqual(record.essences, worldEssences)
  ) {
    membership.inherit.essences = false;
    membership.essences = normalizeComponentEssenceMap(record.essences) ?? {};
  }
  return membership;
}

/**
 * What registering one in-system record writes to a persisted scope payload: `null`, a membership
 * for the entity under its id, or a new entity with its membership. An id match alone binds
 * nothing, and an entity under another id sharing its source leaves it unregistered, because an
 * import re-keys nothing. `added` says the run put the row in its system.
 */
export function planWorldComponentRegistration(payload, { systemId, record, added = false }) {
  const entities = arrayOrEmpty(payload?.entities);
  const keys = sourceKeys(record);
  const entity = entities.find((entry) => entry?.id === record.id);
  if (entity) {
    if (payload.membership?.[membershipKey(record.id, systemId)]) return null;
    if (!sharesSource(entity, keys)) return null;
    return { membership: membershipFor(systemId, record, added, payload.defaults?.[record.id]) };
  }
  if (entities.some((entry) => sharesSource(entry, keys))) return null;
  return {
    entity: { id: record.id, ...identityOf(record, 'components') },
    membership: membershipFor(systemId, record, added, null),
  };
}

/**
 * Write a run's registrations in one `fabricate.componentScope` save. Each is planned against the
 * payload as the store holds it now and its system's current rows, and nothing is awaited between
 * that read and the save, because the write replaces the whole setting. A rejected write is
 * caught and the store reloaded, since it publishes its cache before the write settles.
 * @returns {Promise<{registered: number, error: Error|null}>}
 */
export async function flushWorldComponentRegistrations({ store, registrations, rowsOf }) {
  const pending = arrayOrEmpty(registrations);
  if (!store || pending.length === 0) return { registered: 0, error: null };
  const payload = store.get();
  let registered = 0;
  for (const { systemId, componentId, added } of pending) {
    const record = rowById(rowsOf(systemId), componentId);
    const planned = record && planWorldComponentRegistration(payload, { systemId, record, added });
    if (!planned) continue;
    if (planned.entity) payload.entities.push(planned.entity);
    payload.membership[membershipKey(componentId, systemId)] = planned.membership;
    registered += 1;
  }
  if (registered === 0) return { registered: 0, error: null };
  try {
    await store.save(payload);
  } catch (error) {
    store.load();
    return { registered: 0, error };
  }
  return { registered, error: null };
}
