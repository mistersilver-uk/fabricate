/**
 * 1.31.0 — Record every existing tool membership record's OWN `prerequisites` and `bonus` as an
 * override, now that both are world-default sections (issue 1373, epic 1357; pure, idempotent,
 * version-gated).
 *
 * ## WHY A SECOND MIGRATION RATHER THAN A WIDER `1.30.0`
 *
 * `1.30.0` already ran in every world that has upgraded, and it wrote each tool membership record
 * with `inherit: {breakage: false, onBreak: false}` — the two sections that existed then. Adding
 * `prerequisites` and `bonus` to `TOOL_SECTIONS` makes `normalizeInherit` read an ABSENT key as
 * INHERITING, so every one of those records would silently claim to inherit a world default for a
 * value its own crafting system authored. `1.30.0` cannot be widened retroactively: its per-pair
 * guard deliberately never rewrites a membership record a previous pass already wrote, precisely
 * so a re-run cannot overwrite a GM's later edit.
 *
 * A world that has NOT yet reached `1.30.0` gets the same answer from that pass directly —
 * `buildMembershipRecord` writes both sections and `OVERRIDING_INHERIT` switches both off — and
 * this pass then finds nothing left to do. Both orders converge on the same corpus, which is what
 * makes running them in sequence safe.
 *
 * ## WHAT IT WRITES, AND WHERE THE VALUE COMES FROM
 *
 * For each `(tool, system)` membership record, the IN-SYSTEM `Tool` record of that system is the
 * source: it is the value that system resolves today, because `## CraftingSystem` requirement 36
 * makes the in-system record decide every key it carries. Copying it onto the membership record as
 * an override with the switch OFF is therefore behaviour-preserving BY CONSTRUCTION rather than by
 * fixture choice — the resolver answers the same value from the same system's own data, whether
 * or not a world default is ever authored afterwards.
 *
 * AN ABSENT IN-SYSTEM VALUE IS FILLED WITH THE CANONICAL EMPTY rather than skipped, and that is
 * the same rule `buildMembershipRecord` applies for the same reason: `Tool` mints both fields on
 * construction, so a raw record without them ALREADY resolves to exactly those values, and an
 * absent SECTION under an `inherit: false` switch would fall back to the world value instead.
 *
 * A MEMBERSHIP RECORD WHOSE SYSTEM OR TOOL IS GONE still gets the canonical empty and the switches
 * off. Leaving it inheriting would be the one state this pass exists to prevent, and there is no
 * system left whose value could be preferred.
 *
 * ## IDEMPOTENT, AND THE GUARD IS PER SECTION
 *
 * A record that already carries an authored `inherit` entry for a section is left ALONE — both the
 * switch and any stored value. That is what makes a re-run, or a run after `1.30.0` already wrote
 * the pair, a no-op, and it is also what stops this pass from undoing a GM who has since flipped a
 * section back to inheriting.
 *
 * NO WORLD DEFAULT IS WRITTEN. `worldScopeDefaults.js` records why: `Tool#toJSON` emits both keys
 * on every save, so the corpus cannot distinguish a GM's authored "nothing required" from the
 * normalizer's mint, and electing one would state a choice nobody made on every tool at once.
 *
 * Never throws: every level is guarded, and a malformed payload, system or record is skipped
 * rather than repaired.
 *
 * Mutated setting keys: `fabricate.toolScope` (membership records only).
 */

import { toolBonusOverride, toolPrerequisitesOverride } from './migrateWorldScopeEntities.js';
import { isPlainObject } from './migrationHelpers.js';

/**
 * The two sections this pass backfills, in the order they are written.
 *
 * @type {readonly string[]}
 */
export const BACKFILLED_TOOL_SECTIONS = Object.freeze(['prerequisites', 'bonus']);

/**
 * The in-system `Tool` records of every crafting system, keyed `systemId` then tool id.
 *
 * @param {unknown} systems
 * @returns {Map<string, Map<string, object>>}
 */
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

/**
 * The value one section takes on one membership record, read from that system's own Tool.
 *
 * @param {string} section
 * @param {object|null} tool
 * @returns {object}
 */
function overrideFor(section, tool) {
  return section === 'prerequisites'
    ? toolPrerequisitesOverride(tool?.prerequisites)
    : toolBonusOverride(tool?.bonus);
}

/**
 * Backfill one membership record, answering whether it changed.
 *
 * @param {object} record
 * @param {object|null} tool The in-system Tool of this record's system, when it still exists.
 * @returns {boolean}
 */
function backfillRecord(record, tool) {
  const inherit = isPlainObject(record.inherit) ? record.inherit : {};
  let changed = false;
  for (const section of BACKFILLED_TOOL_SECTIONS) {
    // PER SECTION, and the switch is the guard rather than the value: a record carrying an
    // authored switch has already been decided, by this pass, by `1.30.0`, or by a GM.
    if (typeof inherit[section] === 'boolean') continue;
    inherit[section] = false;
    record[section] = overrideFor(section, tool);
    changed = true;
  }
  if (changed) record.inherit = inherit;
  return changed;
}

/**
 * Run the pass over a migration data payload.
 *
 * @param {object} data
 * @returns {object} the same payload, mutated in place like every other startup migration.
 */
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
