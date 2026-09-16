/**
 * `1.0.0` — rename the gathering "Hazard" concept to "Event" across every persisted key and value,
 * so a world saved on the old schema loads cleanly. The mechanic is unchanged.
 * DELIBERATELY UNCHANGED, none of them being the Event concept: the core asset `hazard.svg`, the
 * danger axis, and the d100 failure-result keyword `hazard`. Pure and idempotent — every rename
 * guards on "old key present AND new key absent", so a stale key beside a new one is left inert.
 */

import { isPlainObject, clone, renameKey } from './migrationHelpers.js';

const POLICY_VALUE_REMAP = {
  successWithHazard: 'successWithEvent',
  failureWithHazard: 'failureWithEvent',
};

/**
 * Coerce a legacy policy value to its event equivalent. Only the two known legacy strings are
 * remapped, so an already-event value is untouched.
 */
function remapPolicyValue(obj, key) {
  if (!isPlainObject(obj)) return;
  const current = obj[key];
  if (
    typeof current === 'string' &&
    Object.prototype.hasOwnProperty.call(POLICY_VALUE_REMAP, current)
  ) {
    obj[key] = POLICY_VALUE_REMAP[current];
  }
}

/** Rename the rule keys and values on a system or environment rules-bearing object. */
function migrateRuleKeys(obj) {
  if (!isPlainObject(obj)) return;
  renameKey(obj, 'hazardSelectionMode', 'eventSelectionMode');
  renameKey(obj, 'hazardLimit', 'eventLimit');
  renameKey(obj, 'hazardPolicy', 'eventPolicy');
  renameKey(obj, 'hazardVisibility', 'eventVisibility');
  remapPolicyValue(obj, 'eventPolicy');
}

/** Run the hazard-to-event rename over the runner's bundle. */
export function migrateRenameGatheringHazardsToEvents(data = {}) {
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  const gatheringConfig = isPlainObject(data?.gatheringConfig)
    ? clone(data.gatheringConfig)
    : data?.gatheringConfig;
  const environments = Array.isArray(data?.environments) ? clone(data.environments) : [];

  // 1 + 3. Gathering-config systems: collection, rules, and event-record fields.
  const configSystems = isPlainObject(gatheringConfig?.systems) ? gatheringConfig.systems : {};
  for (const systemConfig of Object.values(configSystems)) {
    if (!isPlainObject(systemConfig)) continue;

    renameKey(systemConfig, 'hazards', 'events');
    migrateRuleKeys(systemConfig.rules);

    const events = systemConfig.events;
    if (Array.isArray(events)) {
      for (const record of events) {
        if (!isPlainObject(record)) continue;
        renameKey(record, 'hazardModifier', 'eventModifier');
        // `img` (icons/svg/hazard.svg) and `dangerTags` (incl. 'hazardous') stay.
      }
    }
  }

  // 2 + 3. Environments: composition id lists, order, rule keys/values, adjustments.
  for (const environment of environments) {
    if (!isPlainObject(environment)) continue;
    renameKey(environment, 'enabledHazardIds', 'enabledEventIds');
    renameKey(environment, 'disabledHazardIds', 'disabledEventIds');
    renameKey(environment, 'forcedHazardIds', 'forcedEventIds');
    renameKey(environment, 'hazardOrder', 'eventOrder');
    renameKey(environment, 'hazardDropRateAdjustments', 'eventDropRateAdjustments');
    renameKey(environment, 'hazardDropRateAdjustmentsEnabled', 'eventDropRateAdjustmentsEnabled');
    migrateRuleKeys(environment);
  }

  // 4. Crafting-system region modifiers: kind value hazardChance → eventChance.
  for (const system of systems) {
    if (!isPlainObject(system)) continue;
    const regions = system.gatheringRegions;
    if (!Array.isArray(regions)) continue;
    for (const region of regions) {
      if (!isPlainObject(region)) continue;
      const modifiers = region.modifiers;
      if (!Array.isArray(modifiers)) continue;
      for (const modifier of modifiers) {
        if (isPlainObject(modifier) && modifier.kind === 'hazardChance') {
          modifier.kind = 'eventChance';
        }
      }
    }
  }

  return { systems, gatheringConfig, environments };
}
