/**
 * Migration 1.0.0: rename the gathering "Hazard" concept to "Event".
 *
 * Rewrites every persisted hazard-derived key/value to its event equivalent so a
 * world saved on the old schema loads cleanly after the source rename. The
 * mechanic is unchanged — only the ubiquitous-language term and the names/values
 * derived from it change:
 *
 * 1. `gatheringConfig.systems[sysId]`:
 *    - collection `hazards` → `events`;
 *    - rules `hazardSelectionMode/hazardLimit/hazardPolicy/hazardVisibility` → `event*`;
 *    - each event record field `hazardModifier` → `eventModifier`.
 * 2. `environments[*]`:
 *    - `enabledHazardIds/disabledHazardIds/forcedHazardIds` → `*EventIds`;
 *    - `hazardOrder` → `eventOrder`;
 *    - `hazardSelectionMode/hazardPolicy` → `event*`;
 *    - `hazardDropRateAdjustments(Enabled)` → `eventDropRateAdjustments(Enabled)`.
 * 3. Stored policy values `successWithHazard` / `failureWithHazard` →
 *    `successWithEvent` / `failureWithEvent` (rules and per-environment).
 * 4. `systems[*].gatheringRegions[*].modifiers[*]`: kind value `hazardChance` →
 *    `eventChance` (the modifier knob that adjusts event chance).
 *
 * Deliberately UNCHANGED (these are NOT the Event concept):
 * - the default-image literal `icons/svg/hazard.svg` (a Foundry core asset);
 * - the danger axis (`dangerTags`, `dangerLevel`, the `hazardous` danger tier);
 * - the d100 failure-result keyword `hazard` (a failure alias, not an Event).
 *
 * Pure function: no I/O, no Foundry calls, deep-clones its inputs. Idempotent —
 * every rename guards on "old key present AND new key absent", and a value remap
 * fires only for a known legacy string, so a second run is a no-op. A stale
 * legacy key left alongside an already-present new key is left inert (no clobber,
 * no drop). Runs at the new highest version (1.0.0), after all prior migrations.
 */

import { isPlainObject, clone, renameKey } from './migrationHelpers.js';

const POLICY_VALUE_REMAP = {
  successWithHazard: 'successWithEvent',
  failureWithHazard: 'failureWithEvent',
};

/**
 * Coerce a legacy policy value on a plain object's `key` to its event equivalent.
 * Only the two known legacy strings are remapped; anything else is left as-is
 * (idempotent — already-event values are untouched).
 *
 * @param {object} obj
 * @param {string} key
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

/**
 * Rename the rule keys/values on a system or environment rules-bearing object.
 *
 * @param {object} obj
 */
function migrateRuleKeys(obj) {
  if (!isPlainObject(obj)) return;
  renameKey(obj, 'hazardSelectionMode', 'eventSelectionMode');
  renameKey(obj, 'hazardLimit', 'eventLimit');
  renameKey(obj, 'hazardPolicy', 'eventPolicy');
  renameKey(obj, 'hazardVisibility', 'eventVisibility');
  remapPolicyValue(obj, 'eventPolicy');
}

/**
 * Run the hazard→event rename over the runner's one-pass data bundle.
 *
 * @param {{ systems?: object[], gatheringConfig?: object, environments?: object[] }} data
 * @returns {{ systems: object[], gatheringConfig: object, environments: object[] }}
 */
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
