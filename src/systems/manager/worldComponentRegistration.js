/** World Component registration for an imported component (issue 2218): the decision for one
 * in-system record and the single `fabricate.componentScope` write a run flushes. It reads no
 * crafting system, so a caller passes the in-system rows in. Contract: `data-models/spec.md`
 * § Component scope requirement 6. */
import { isGeneralComponentCategory } from '../../utils/componentCategories.js';
import { arrayOrEmpty, trimString } from '../../utils/scalars.js';
import { getItemMatchUuids, sourceReferenceKey } from '../../utils/sourceReferenceUnion.js';
import { componentEssenceMapsEqual, normalizeComponentEssenceMap } from '../componentScope.js';
import { membershipKey } from '../scopedDefinitions.js';
import { identityOf } from '../worldScopeEntityGrouping.js';

function sourceKeys(record) {
  return new Set(getItemMatchUuids(record).map(sourceReferenceKey));
}

function sharesSource(record, keys) {
  return getItemMatchUuids(record).some((reference) => keys.has(sourceReferenceKey(reference)));
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

/** A roster index: each entity by id, first-wins, and under each source key the first entity in
 * roster order that carries it. */
function indexRoster(entities) {
  const roster = { byId: new Map(), byKey: new Map(), size: 0 };
  for (const entity of arrayOrEmpty(entities)) addToRoster(roster, entity);
  return roster;
}

function addToRoster(roster, entity) {
  const entry = { entity, order: roster.size };
  roster.size += 1;
  if (!roster.byId.has(entity?.id)) roster.byId.set(entity?.id, entity);
  for (const reference of getItemMatchUuids(entity)) {
    const key = sourceReferenceKey(reference);
    if (!roster.byKey.has(key)) roster.byKey.set(key, entry);
  }
}

/** The first entity in roster order carrying one of `keys`, or `null`. */
function firstSharing(roster, keys) {
  let first = null;
  for (const key of keys) {
    const entry = roster.byKey.get(key);
    if (entry && (!first || entry.order < first.order)) first = entry;
  }
  return first?.entity ?? null;
}

const RUN_ROSTERS = new WeakMap();

/** The roster a run adopts against: the store's entities, then each row the run has registered
 * that no entity stands for yet, since the flush makes it one. Indexed once per run, keyed on its
 * registrations array, and rebuilt when the store has published another roster. */
function runRoster(entities, registrations, rowsOf) {
  let run = RUN_ROSTERS.get(registrations);
  if (run?.entities !== entities) {
    run = { entities, roster: indexRoster(entities), folded: 0 };
    RUN_ROSTERS.set(registrations, run);
  }
  for (; run.folded < registrations.length; run.folded += 1) {
    const { systemId, componentId } = registrations[run.folded];
    if (run.roster.byId.has(componentId)) continue;
    const row = rowById(rowsOf(systemId), componentId);
    if (row) addToRoster(run.roster, row);
  }
  return run.roster;
}

/** The id a record not yet in its system's array takes: that of the first entity in roster order
 * sharing a source with it, or `null` when none does or the system already holds a row under it. */
export function adoptedWorldComponentId({ entities, registrations, rowsOf, systemId, record }) {
  const keys = sourceKeys(record);
  if (keys.size === 0) return null;
  const run = Array.isArray(registrations) ? registrations : [];
  const target = firstSharing(runRoster(entities, run, rowsOf), keys);
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

/** What registering one in-system record writes to a persisted scope payload: `null`, a membership
 * for the entity under its id, or a new entity with its membership. An id match alone binds nothing,
 * and an entity under another id sharing its source leaves it unregistered. */
export function planWorldComponentRegistration(
  payload,
  { systemId, record, added = false },
  roster = indexRoster(payload?.entities)
) {
  const keys = sourceKeys(record);
  const entity = roster.byId.get(record.id);
  if (entity) {
    if (payload.membership?.[membershipKey(record.id, systemId)]) return null;
    if (!sharesSource(entity, keys)) return null;
    return { membership: membershipFor(systemId, record, added, payload.defaults?.[record.id]) };
  }
  if (firstSharing(roster, keys)) return null;
  return {
    entity: { id: record.id, ...identityOf(record, 'components') },
    membership: membershipFor(systemId, record, added, null),
  };
}

/** Write a run's registrations in one `fabricate.componentScope` save, each planned against the
 * store's payload now and only for a row its system holds and `isPersisted` vouches for. Nothing is
 * awaited between that read and the save; a rejected save is caught and the store reloaded. */
export async function flushWorldComponentRegistrations({
  store,
  registrations,
  rowsOf,
  isPersisted,
}) {
  const pending = arrayOrEmpty(registrations);
  if (!store || pending.length === 0) return { registered: 0, error: null };
  const payload = store.get();
  const roster = indexRoster(payload.entities);
  const rows = new Map();
  let registered = 0;
  for (const { systemId, componentId, added } of pending) {
    if (!rows.has(systemId)) rows.set(systemId, rowsById(rowsOf(systemId)));
    const record = rows.get(systemId).get(componentId);
    if (!record || !isPersisted(systemId, componentId)) continue;
    const planned = planWorldComponentRegistration(payload, { systemId, record, added }, roster);
    if (!planned) continue;
    if (planned.entity) {
      payload.entities.push(planned.entity);
      addToRoster(roster, planned.entity);
    }
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
