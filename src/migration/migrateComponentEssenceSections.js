/**
 * 1.32.0 — ELECT each world component's `essences` map and MARK every existing membership record's
 * `inherit.essences` switch, now that `essences` is a component world-default section (issue 1371
 * r18-store, maintainer ruling M31; pure, idempotent, version-gated).
 *
 * ## WHY A THIRD PASS RATHER THAN A WIDER `1.30.0`
 *
 * `1.30.0` already ran in every world that has upgraded, and it wrote each component membership
 * record with `inherit: {category: false}` — the one section that existed then. Adding `essences`
 * to `COMPONENT_SECTIONS` makes `normalizeInherit` read an ABSENT key as INHERITING, so the moment a
 * world map exists every one of those records would follow it whatever its own crafting system
 * authored. `1.30.0` cannot be widened retroactively: its per-pair guard never rewrites a membership
 * record a previous pass already wrote, precisely so a re-run cannot overwrite a GM's later edit.
 *
 * A world that has NOT yet reached `1.30.0` gets the same answer from that pass directly — its
 * election step calls {@link markComponentEssenceInheritance} over the records it just wrote — and
 * this pass then finds nothing left to do. Both orders converge on the same corpus.
 *
 * ## THE RULE
 *
 * The maintainer's model is the `category` model exactly: world-level essence values on the world
 * record, inherited by every system that has rules for the component unless that system overrides
 * with its own map. Per world component:
 *
 * 1. THE WORLD MAP IS ELECTED FROM THE DONOR — the OLDEST system (stored corpus position, the
 *    `1.30.0` exception to the registry's corpus-order rule) that still holds an in-system row for
 *    the component — as that row's normalized `essences`. An EMPTY donor map elects NOTHING, on the
 *    absence-preserving rule `category` follows: the world saying nothing is not the world saying
 *    "none". A world default that already carries a map is kept, never re-elected.
 * 2. EVERY MEMBERSHIP RECORD IS MARKED against the elected map, absence reading as empty: a record
 *    whose system's own row EQUALS it is marked `inherit.essences: true`; one that differs is marked
 *    `false` and carries its own map on the record, exactly as `category` carries its own token.
 *    A record with no in-system row left has nothing to preserve and is marked inheriting, so a
 *    later re-add starts from the world map — the union draws nothing for it until then.
 * 3. RESOLUTION AT MIGRATION TIME IS UNCHANGED BY CONSTRUCTION: an inheriting record equals the
 *    world map it now follows, and an overriding one answers its own in-system row.
 *
 * ## IDEMPOTENT, AND THE GUARD IS PER ENTITY
 *
 * An entity ANY of whose records already carries a boolean `inherit.essences` has been decided —
 * by this pass, by `1.30.0`, or by a GM — and is left ALONE, world map and records both. The guard
 * is per entity rather than per record because the election is per entity: re-electing a world map
 * an earlier run already declined, from a donor whose row has since changed, would move every
 * system that run marked inheriting. A record added to a decided entity after the pass keeps the
 * omitted switch "add to system" gave it, which is inheriting, which is what adding means.
 *
 * Never throws: every level is guarded, and a malformed payload, system or record is skipped rather
 * than repaired.
 *
 * Mutated setting keys: `fabricate.componentScope` (`defaults` and `membership`).
 */

import {
  componentEssenceMapsEqual,
  normalizeComponentEssenceMap,
} from '../systems/componentScope.js';

import { isPlainObject } from './migrationHelpers.js';

/**
 * The in-system component rows of every crafting system, keyed `systemId` then component id, with
 * each system's stored corpus position.
 *
 * @param {unknown} systems
 * @returns {Map<string, {index: number, rows: Map<string, object>}>}
 */
function componentsBySystem(systems) {
  const bySystem = new Map();
  (Array.isArray(systems) ? systems : []).forEach((system, index) => {
    if (!isPlainObject(system)) return;
    const systemId = typeof system.id === 'string' ? system.id.trim() : '';
    if (!systemId || bySystem.has(systemId)) return;
    const rows = new Map();
    for (const component of Array.isArray(system.components) ? system.components : []) {
      if (!isPlainObject(component)) continue;
      const componentId = typeof component.id === 'string' ? component.id.trim() : '';
      if (componentId && !rows.has(componentId)) rows.set(componentId, component);
    }
    bySystem.set(systemId, { index, rows });
  });
  return bySystem;
}

/**
 * Whether a membership record's `essences` switch has already been decided.
 *
 * @param {object} record
 * @returns {boolean}
 */
function isDecided(record) {
  return isPlainObject(record?.inherit) && typeof record.inherit.essences === 'boolean';
}

/**
 * Mark ONE membership record's `inherit.essences` against the elected world map, answering
 * whether the record changed. A record already carrying a boolean switch is left alone.
 *
 * EXPORTED so the `1.30.0` election applies THIS rule to the records it writes, rather than a
 * second one restated there.
 *
 * @param {object} record the membership record, mutated in place.
 * @param {object|null} inSystemRow the system's own in-system component row, when it still exists.
 * @param {unknown} worldEssences the elected world map, or absence.
 * @returns {boolean}
 */
export function markComponentEssenceInheritance(record, inSystemRow, worldEssences) {
  if (!isPlainObject(record) || isDecided(record)) return false;
  const inherit = isPlainObject(record.inherit) ? record.inherit : {};
  if (!isPlainObject(inSystemRow)) {
    // Nothing to preserve: the union draws no row for this record until a re-add seeds one.
    inherit.essences = true;
  } else {
    const own = normalizeComponentEssenceMap(inSystemRow.essences) ?? {};
    if (componentEssenceMapsEqual(own, worldEssences)) {
      inherit.essences = true;
    } else {
      inherit.essences = false;
      record.essences = own;
    }
  }
  record.inherit = inherit;
  return true;
}

/**
 * Elect one component's world map from the oldest system still holding a row for it.
 *
 * @param {Array<object>} records the entity's membership records.
 * @param {Map<string, {index: number, rows: Map<string, object>}>} bySystem
 * @param {string} entityId
 * @returns {Record<string, number>|undefined} the donor's normalized map, or absence when the donor
 *   authored none or no system holds a row.
 */
function electFromDonor(records, bySystem, entityId) {
  let donor = null;
  for (const record of records) {
    const system = bySystem.get(record.systemId);
    const row = system?.rows.get(entityId);
    if (!row) continue;
    if (!donor || system.index < donor.index) donor = { index: system.index, row };
  }
  const elected = donor ? normalizeComponentEssenceMap(donor.row.essences) : undefined;
  return elected && Object.keys(elected).length > 0 ? elected : undefined;
}

/**
 * Decide one entity: elect (or keep) its world map, then mark every record against it.
 *
 * @param {object} scope the `componentScope` payload, in the persisted MAP shape.
 * @param {string} entityId
 * @param {Array<object>} records the entity's membership records.
 * @param {Map<string, {index: number, rows: Map<string, object>}>} bySystem
 * @returns {void}
 */
function decideEntity(scope, entityId, records, bySystem) {
  if (records.some(isDecided)) return;
  const existing = isPlainObject(scope.defaults?.[entityId]) ? scope.defaults[entityId] : null;
  const kept = normalizeComponentEssenceMap(existing?.essences);
  const elected = kept ?? electFromDonor(records, bySystem, entityId);
  if (!kept && elected) {
    if (!isPlainObject(scope.defaults)) scope.defaults = {};
    scope.defaults[entityId] = { ...(existing ?? {}), id: entityId, essences: elected };
  }
  for (const record of records) {
    const row = bySystem.get(record.systemId)?.rows.get(entityId) ?? null;
    markComponentEssenceInheritance(record, row, elected);
  }
}

/**
 * Run the pass over a migration data payload.
 *
 * @param {object} data
 * @returns {object} the same payload, mutated in place like every other startup migration.
 */
export function migrateComponentEssenceSections(data) {
  if (!isPlainObject(data)) return data;
  const scope = data.componentScope;
  if (!isPlainObject(scope) || !isPlainObject(scope.membership)) return data;

  const bySystem = componentsBySystem(data.systems);
  const byEntity = new Map();
  for (const record of Object.values(scope.membership)) {
    if (!isPlainObject(record)) continue;
    const entityId = typeof record.entityId === 'string' ? record.entityId.trim() : '';
    const systemId = typeof record.systemId === 'string' ? record.systemId.trim() : '';
    if (!entityId || !systemId) continue;
    if (!byEntity.has(entityId)) byEntity.set(entityId, []);
    byEntity.get(entityId).push(record);
  }
  for (const [entityId, records] of byEntity) decideEntity(scope, entityId, records, bySystem);
  return data;
}
