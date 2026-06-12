/**
 * Migration 1.1.0: rename the gathering "Region" concept to "Realm".
 *
 * Rewrites every persisted gathering-region-derived storage key to its realm
 * equivalent so a world saved on the old schema loads cleanly after the source
 * rename. ONLY the Fabricate gathering geography concept is renamed — the Foundry
 * Scene Region bridge fields (`sceneMappings`, `sceneRegionUuid`, `sceneUuid`) and
 * the realm modifier `kind`/`operation`/`visibility` VALUES are left untouched:
 *
 * 1. `systems[*]`:
 *    - `gatheringRegions` → `gatheringRealms`;
 *    - `gatheringRegionSettings` → `gatheringRealmSettings`.
 * 2. `environments[*]`:
 *    - `includedRegionIds` → `includedRealmIds`;
 *    - `excludedRegionIds` → `excludedRealmIds`.
 * 3. `gatheringParties[*]`:
 *    - `currentRegionOverrides` → `currentRealmOverrides`, then for each override
 *      map value `regionIds` → `realmIds`.
 *
 * Deliberately UNCHANGED (these are NOT the Fabricate gathering Realm concept):
 * - the Foundry Scene Region bridge fields `sceneMappings` / `sceneRegionUuid` /
 *   `sceneUuid` on each realm and each discovery entry;
 * - the realm modifier `kind` / `operation` / `visibility` values (`eventChance`,
 *   `dropRate`, `add`, `gmOnly`, …);
 * - the inert legacy `environment.region` free-text string.
 *
 * Pure function: no I/O, no Foundry calls, deep-clones its inputs. Idempotent —
 * every rename guards on "old key present AND new key absent", so a second run is
 * a no-op. A stale legacy key left alongside an already-present new key is left
 * inert (no clobber, no drop). Runs at the new highest version (1.1.0), strictly
 * after the 1.0.0 hazards→events migration, which still reads the pre-rename
 * `gatheringRegions` key.
 */

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Rename `oldKey` → `newKey` on a plain object in place, but only when `oldKey`
 * is present and `newKey` is absent (idempotent; never clobbers an existing new
 * key). A stale `oldKey` left beside an existing `newKey` is left inert.
 *
 * @param {object} obj
 * @param {string} oldKey
 * @param {string} newKey
 */
function renameKey(obj, oldKey, newKey) {
  if (!isPlainObject(obj)) return;
  if (!Object.prototype.hasOwnProperty.call(obj, oldKey)) return;
  if (Object.prototype.hasOwnProperty.call(obj, newKey)) return; // already migrated → leave stale inert
  obj[newKey] = obj[oldKey];
  delete obj[oldKey];
}

/**
 * Run the gathering-region → realm rename over the runner's one-pass data bundle.
 *
 * @param {{ systems?: object[], environments?: object[], gatheringParties?: object[] }} data
 * @returns {{ systems: object[], environments: object[], gatheringParties: object[] }}
 */
export function migrateRenameGatheringRegionsToRealms(data = {}) {
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  const environments = Array.isArray(data?.environments) ? clone(data.environments) : [];
  const gatheringParties = Array.isArray(data?.gatheringParties) ? clone(data.gatheringParties) : [];

  // 1. Crafting systems: realm library + realm settings. The Foundry-bridge
  // fields (sceneMappings/sceneRegionUuid/sceneUuid) and modifier kind/operation/
  // visibility values inside each realm ride along untouched.
  for (const system of systems) {
    if (!isPlainObject(system)) continue;
    renameKey(system, 'gatheringRegions', 'gatheringRealms');
    renameKey(system, 'gatheringRegionSettings', 'gatheringRealmSettings');
  }

  // 2. Environments: location-availability id lists. Biome lists and the inert
  // legacy `region` free-text string stay.
  for (const environment of environments) {
    if (!isPlainObject(environment)) continue;
    renameKey(environment, 'includedRegionIds', 'includedRealmIds');
    renameKey(environment, 'excludedRegionIds', 'excludedRealmIds');
  }

  // 3. Gathering parties: per-system current-realm override maps and their inner
  // realm id lists.
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
