/**
 * `1.31.0` — record every tool membership record's OWN `prerequisites` and `bonus` as an override,
 * now that both are world-default sections (issue 1373; spec § Tool Requirement Sections).
 * A SECOND MIGRATION RATHER THAN A WIDER `1.30.0`, which cannot be widened retroactively: adding
 * these to `TOOL_SECTIONS` makes an ABSENT key read as INHERITING, and that pass's per-pair guard
 * never rewrites a record it wrote. THE GUARD IS PER SECTION, so a GM's later flip back survives.
 */

import { toolBonusOverride, toolPrerequisitesOverride } from './migrateWorldScopeEntities.js';
import { isPlainObject } from './migrationHelpers.js';

/** The two sections this pass backfills, in the order they are written. */
export const BACKFILLED_TOOL_SECTIONS = Object.freeze(['prerequisites', 'bonus']);

/** The in-system `Tool` records of every crafting system, keyed `systemId` then tool id. */
function toolsBySystem(systems) {
  const bySystem = new Map();
  for (const system of Array.isArray(systems) ? systems : []) {
    if (!isPlainObject(system)) continue;
    const systemId = typeof system.id === 'string' ? system.id.trim() : '';
    if (!systemId) continue;
    const byId = new Map();
    for (const tool of Array.isArray(system.tools) ? system.tools : []) {
      if (!isPlainObject(tool)) continue;
      const toolId = typeof tool.id === 'string' ? tool.id.trim() : '';
      if (toolId && !byId.has(toolId)) byId.set(toolId, tool);
    }
    bySystem.set(systemId, byId);
  }
  return bySystem;
}

/** The value one section takes on one membership record, read from that system's own Tool. */
function overrideFor(section, tool) {
  return section === 'prerequisites'
    ? toolPrerequisitesOverride(tool?.prerequisites)
    : toolBonusOverride(tool?.bonus);
}

/** Backfill one membership record, answering whether it changed. */
function backfillRecord(record, tool) {
  const inherit = isPlainObject(record.inherit) ? record.inherit : {};
  let changed = false;
  for (const section of BACKFILLED_TOOL_SECTIONS) {
    // PER SECTION, and the SWITCH is the guard rather than the value: a record carrying an
    // authored switch has already been decided, by this pass, by `1.30.0`, or by a GM.
    if (typeof inherit[section] === 'boolean') continue;
    inherit[section] = false;
    record[section] = overrideFor(section, tool);
    changed = true;
  }
  if (changed) record.inherit = inherit;
  return changed;
}

/** Run the pass over a migration data payload, mutated in place like every startup migration. */
export function migrateToolRequirementSections(data) {
  if (!isPlainObject(data)) return data;
  const scope = data.toolScope;
  if (!isPlainObject(scope)) return data;
  const membership = scope.membership;
  if (!isPlainObject(membership)) return data;

  const bySystem = toolsBySystem(data.systems);
  for (const record of Object.values(membership)) {
    if (!isPlainObject(record)) continue;
    const systemId = typeof record.systemId === 'string' ? record.systemId.trim() : '';
    const entityId = typeof record.entityId === 'string' ? record.entityId.trim() : '';
    if (!systemId || !entityId) continue;
    backfillRecord(record, bySystem.get(systemId)?.get(entityId) ?? null);
  }
  return data;
}
