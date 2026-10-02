/**
 * Resolves a party's current realms (Current Realm Resolution). A manual GM override wins,
 * resolving even a disabled realm for diagnosis, while a missing realm id becomes
 * `staleRealmIds` repair evidence. Otherwise the realms are sensed live, never stored, from the
 * Scene Regions holding the party's travel-actor marker, matched through realm `sceneMappings`.
 * Sources are `manualOverride`, `travelActor` and `unresolved`.
 */

export class GatheringLocationService {
  /** `senseSceneRegions(travelActorUuid)` yields the marker's region UUIDs, none by default. */
  constructor({ partyStore, travelStore, senseSceneRegions = () => [] } = {}) {
    this.partyStore = partyStore;
    this.travelStore = travelStore;
    this.senseSceneRegions = typeof senseSceneRegions === 'function' ? senseSceneRegions : () => [];
  }

  _getRealms() {
    const realms = this.travelStore?.list?.();
    return Array.isArray(realms) ? realms : [];
  }

  /**
   * `{ resolved, source, realms, realmIds, staleRealmIds, partyId }` for one party, independent
   * of any crafting system (issue 1282); the per-system gate is in
   * `GatheringEngine._locationBlockedReasons`.
   */
  resolveCurrentRealms({ partyId } = {}) {
    const empty = {
      resolved: false,
      source: 'unresolved',
      realms: [],
      realmIds: [],
      staleRealmIds: [],
      partyId: partyId || null,
    };
    if (!partyId) return empty;

    const party = this.partyStore?.get?.(partyId);
    if (!party) return empty;

    const override = party.currentRealmOverride;
    if (override && override.mode === 'manual') {
      const realmsById = new Map(this._getRealms().map((realm) => [realm.id, realm]));
      const realms = [];
      const realmIds = [];
      const staleRealmIds = [];
      const overrideRealmIds = Array.isArray(override.realmIds)
        ? override.realmIds
        : Array.isArray(override.regionIds)
          ? override.regionIds
          : [];
      for (const realmId of overrideRealmIds) {
        const realm = realmsById.get(realmId);
        if (!realm) {
          staleRealmIds.push(realmId);
          continue;
        }
        realms.push(realm);
        realmIds.push(realmId);
      }
      return {
        resolved: realmIds.length > 0,
        source: realmIds.length > 0 ? 'manualOverride' : 'unresolved',
        realms,
        realmIds,
        staleRealmIds,
        partyId,
      };
    }

    // No travel actor, or a marker in no linked region, is unresolved.
    const travelActorUuid = party.travelActorUuid ? String(party.travelActorUuid) : '';
    if (!travelActorUuid) return { ...empty, partyId };

    const sensed = this.senseSceneRegions(travelActorUuid);
    const sceneRegionUuids =
      sensed instanceof Set ? sensed : new Set(Array.isArray(sensed) ? sensed : []);
    if (sceneRegionUuids.size === 0) return { ...empty, partyId };

    const realms = [];
    const realmIds = [];
    for (const realm of this._getRealms()) {
      const mappings = Array.isArray(realm?.sceneMappings) ? realm.sceneMappings : [];
      if (mappings.some((mapping) => sceneRegionUuids.has(mapping?.sceneRegionUuid))) {
        realms.push(realm);
        realmIds.push(realm.id);
      }
    }
    return {
      resolved: realmIds.length > 0,
      source: realmIds.length > 0 ? 'travelActor' : 'unresolved',
      realms,
      realmIds,
      staleRealmIds: [],
      partyId,
    };
  }

  /** The current realms of the actor's enabled party, in `resolveCurrentRealms`'s shape. */
  resolveForActor({ actor } = {}) {
    const unresolved = {
      resolved: false,
      source: 'unresolved',
      realms: [],
      realmIds: [],
      staleRealmIds: [],
      partyId: null,
    };
    const actorUuid = actor?.uuid ?? null;
    const party = actorUuid ? this.partyStore?.findEnabledPartyForActor?.(actorUuid) : null;
    if (!party) return unresolved;
    return this.resolveCurrentRealms({ partyId: party.id });
  }

  /** The current-realm context `evaluateLocationAvailability` reads. */
  buildCurrentRealmContext({ actor } = {}) {
    return this.resolveForActor({ actor });
  }
}
