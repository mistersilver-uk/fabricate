/**
 * `1.1.0` — rename the gathering "Region" concept to "Realm" across every persisted key.
 * ONLY that concept: the Foundry Scene Region bridge fields, the realm modifier VALUES and the inert
 * legacy `environment.region` string are deliberately untouched.
 * Pure, deep-cloning, idempotent, and strictly after `1.0.0`, which still reads the old key.
 */

import { isPlainObject, clone, renameKey } from './migrationHelpers.js';

/** Run the region-to-realm rename over the runner's bundle. */
export function migrateRenameGatheringRegionsToRealms(data = {}) {
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  const environments = Array.isArray(data?.environments) ? clone(data.environments) : [];
  const gatheringParties = Array.isArray(data?.gatheringParties)
    ? clone(data.gatheringParties)
    : [];

  // The Foundry-bridge fields and the modifier values inside each realm ride along untouched.
  for (const system of systems) {
    if (!isPlainObject(system)) continue;
    renameKey(system, 'gatheringRegions', 'gatheringRealms');
    renameKey(system, 'gatheringRegionSettings', 'gatheringRealmSettings');
  }

  // 2. Environments: location-availability id lists.
  for (const environment of environments) {
    if (!isPlainObject(environment)) continue;
    renameKey(environment, 'includedRegionIds', 'includedRealmIds');
    renameKey(environment, 'excludedRegionIds', 'excludedRealmIds');
  }

  // 3. Gathering parties: override maps and their inner realm id lists.
  for (const party of gatheringParties) {
    if (!isPlainObject(party)) continue;
    renameKey(party, 'currentRegionOverrides', 'currentRealmOverrides');
    const overrides = party.currentRealmOverrides;
    if (isPlainObject(overrides)) {
      for (const override of Object.values(overrides)) {
        renameKey(override, 'regionIds', 'realmIds');
      }
    }
  }

  return { systems, environments, gatheringParties };
}
