/**
 * The per-record overrides `checksReadiness.js`'s `adjustmentInvalidForKind` grades beside a
 * check's own base and tier adjustments (issue 2078): a salvage-enabled component's or a routed
 * gathering task's kept override, outside any check draft.
 */
import { trimString as trimmed } from '../../../../../utils/scalars.js';
import { overrideInvalidForKind } from '../component/overridePlayerSees.js';

/**
 * Named `{ name, adjustment }` entries for every salvage-enabled component's kept override. A
 * component with salvage off never runs the check, so its dormant override is not graded.
 */
export function salvageOverrideEntries(components) {
  return (Array.isArray(components) ? components : [])
    .filter((component) => component?.salvage?.enabled === true)
    .map((component) => ({
      name: trimmed(component?.name) || String(component?.id ?? ''),
      adjustment: component?.salvage?.adjustmentOverride,
    }));
}

/**
 * Named `{ name, adjustment }` entries for every routed gathering task's kept override. Any other
 * resolution mode never reads it, `progressive` having no target at all.
 */
export function gatheringOverrideEntries(tasks) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.resolutionMode === 'routed')
    .map((task) => ({
      name: trimmed(task?.name) || String(task?.id ?? ''),
      adjustment: task?.adjustmentOverride,
    }));
}

/**
 * The named override entries `activity`'s own records grade, or `[]` for crafting (which has no
 * per-record override) or an unmatched activity.
 */
export function overrideEntriesFor(activity, { components, gatheringTasks } = {}) {
  if (activity === 'salvage') return salvageOverrideEntries(components);
  if (activity === 'gathering') return gatheringOverrideEntries(gatheringTasks);
  return [];
}

/**
 * Override records whose kept value breaks `kind`'s rule, through the SAME
 * {@link overrideInvalidForKind} a component's or task's own field warns with, so the Studio's
 * readiness and the field-level warning never disagree.
 */
export function invalidOverrideRecords(overrideRecords, kind) {
  return overrideRecords.filter((record) =>
    overrideInvalidForKind({ attribute: true, kind, adjustmentOverride: record.adjustment })
  );
}
