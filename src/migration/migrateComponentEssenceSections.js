/**
 * `1.32.0` — ELECT each world component's `essences` map and MARK every membership record's
 * `inherit.essences` switch (issue 1371; spec § Component Essence Sections owns why it is a THIRD
 * PASS and why THE GUARD IS PER ENTITY). Pure, idempotent, version-gated.
 */

import {
  componentEssenceMapsEqual,
  normalizeComponentEssenceMap,
} from '../systems/componentScope.js';

import { isPlainObject, forEachSystem } from './migrationHelpers.js';

/**
 * The in-system component rows of every system, keyed `systemId` then component id, with each
 * system's stored corpus position.
 */
function componentsBySystem(systems) {
  const bySystem = new Map();
  forEachSystem(systems, (system, index) => {
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

/** Whether a membership record's `essences` switch has already been decided. */
function isDecided(record) {
  return isPlainObject(record?.inherit) && typeof record.inherit.essences === 'boolean';
}

/**
 * Mark ONE membership record's `inherit.essences` against the elected world map, answering whether
 * it changed. A record already carrying a boolean switch is left alone. EXPORTED so the `1.30.0`
 * election applies THIS rule to the records it writes, rather than a second one restated there.
 */
export function markComponentEssenceInheritance(record, inSystemRow, worldEssences) {
  if (!isPlainObject(record) || isDecided(record)) return false;
  const inherit = isPlainObject(record.inherit) ? record.inherit : {};
  // A record with no row LEFT has nothing to preserve, so it inherits. `null` is that state and ONLY
  // that state: a row that exists and carries no `essences` key reads as the EMPTY map — a system
  // that authored none rather than one with nothing to say.
  const own = isPlainObject(inSystemRow)
    ? (normalizeComponentEssenceMap(inSystemRow.essences) ?? {})
    : null;
  if (own && !componentEssenceMapsEqual(own, worldEssences)) {
    inherit.essences = false;
    record.essences = own;
  } else {
    inherit.essences = true;
  }
  record.inherit = inherit;
  return true;
}

/**
 * Elect one component's world map from the oldest system still holding a row for it; absence when
 * the donor authored none or no system holds a row.
 */
function electFromDonor(members, bySystem, entityId) {
  let donor = null;
  for (const { systemId } of members) {
    const system = bySystem.get(systemId);
    const row = system?.rows.get(entityId);
    if (!row) continue;
    if (!donor || system.index < donor.index) donor = { index: system.index, row };
  }
  const elected = donor ? normalizeComponentEssenceMap(donor.row.essences) : undefined;
  return elected && Object.keys(elected).length > 0 ? elected : undefined;
}

/** Decide one entity: elect or keep its world map, then mark every record against it. */
function decideEntity(scope, entityId, members, bySystem) {
  if (members.some((member) => isDecided(member.record))) return;
  const existing = isPlainObject(scope.defaults?.[entityId]) ? scope.defaults[entityId] : null;
  const kept = normalizeComponentEssenceMap(existing?.essences);
  const elected = kept ?? electFromDonor(members, bySystem, entityId);
  if (!kept && elected) {
    if (!isPlainObject(scope.defaults)) scope.defaults = {};
    scope.defaults[entityId] = { ...existing, id: entityId, essences: elected };
  }
  for (const { record, systemId } of members) {
    const row = bySystem.get(systemId)?.rows.get(entityId) ?? null;
    markComponentEssenceInheritance(record, row, elected);
  }
}

/** Run the pass over a migration data payload, mutated in place like every startup migration. */
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
    // THE TRIMMED PAIR TRAVELS WITH THE RECORD: `bySystem` is keyed on the trimmed system id, so
    // every lookup downstream must use this one rather than reading `record.systemId` back.
    byEntity.get(entityId).push({ record, systemId });
  }
  for (const [entityId, members] of byEntity) decideEntity(scope, entityId, members, bySystem);
  return data;
}
