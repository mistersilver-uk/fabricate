/**
 * Resolves the current realms for a party (or a selected actor) within one
 * crafting system. Manual GM override takes precedence; absent a manual override
 * the current realm is derived LIVE from where the party's `travelActor` marker
 * token currently sits (token-in-scene-region → realm `sceneMappings` → Fabricate
 * realm), via the injected `senseSceneRegions` collaborator. No state is stored
 * for the auto case — it always reflects the marker's live position.
 *
 * Canonical source tokens: `manualOverride`, `travelActor`, `unresolved`.
 *
 * Resolution detail (per the Current Realm Resolution spec):
 * - A manual override that includes a DISABLED realm id still resolves it (GM
 *   diagnostic/preview inclusion); the UI marks it disabled.
 * - Realm ids referencing MISSING realms are stale repair evidence
 *   (`staleRealmIds`) and do not resolve.
 * - `mode: 'none'` / absent override ⇒ auto (travel-actor) sensing; a
 *   travel-actor-less party, or a marker in no linked Scene Region, resolves to
 *   `unresolved`.
 */

export class GatheringLocationService {
  /**
   * @param {object} collaborators
   * @param {object} collaborators.partyStore
   * @param {object} collaborators.systemManager
   * @param {(travelActorUuid: string) => Iterable<string>} [collaborators.senseSceneRegions]
   *   Returns the Scene Region UUIDs the marker token currently sits inside.
   *   Foundry-backed at runtime; defaults to none so the service stays pure in tests.
   */
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
   * WHERE A PARTY IS DOES NOT DEPEND ON A CRAFTING SYSTEM (issue 1282).
   *
   * This resolver used to take a `systemId`, gate on that system's travel toggle, and read
   * that system's realms. All three dissolved when realms became world scope: a party is one
   * set of tokens standing in one place, and that fact is not a property of a crafting system.
   *
   * The per-system toggle moved entirely to the CONSUMPTION side — it decides whether a
   * system's environments are gated by the resolved location, never whether the location
   * resolves. `GatheringEngine._locationBlockedReasons` still holds that gate, unchanged.
   *
   * @param {{ partyId: string }} args
   * @returns {{ resolved: boolean, source: 'manualOverride'|'travelActor'|'unresolved', realms: object[], realmIds: string[], staleRealmIds: string[], partyId: string|null }}
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
          // Missing realm ⇒ stale repair evidence; does not resolve.
          staleRealmIds.push(realmId);
          continue;
        }
        // Disabled realms in a manual override STILL resolve (GM diagnostic).
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

    // Auto (travel-actor) sensing: derive the current realms LIVE from the Scene
    // Regions the party's marker token sits inside, mapped to Fabricate realms by
    // their sceneMappings. A travel-actor-less party, or a marker in no linked
    // realm, resolves to unresolved.
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

  /**
   * Resolve current realms for the enabled party that contains the actor.
   *
   * No `systemId`, and no travel gate: where an actor's party is standing is the same answer
   * whichever crafting system is asking. The gate lives at the consumption side, in
   * `GatheringEngine._locationBlockedReasons`.
   *
   * @param {{ actor: object }} args
   * @returns {object} Same shape as resolveCurrentRealms.
   */
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

  /**
   * Build the current-realm context consumed by `evaluateLocationAvailability`.
   *
   * @param {{ actor: object }} args
   * @returns {{ resolved: boolean, source: string, realms: object[], realmIds: string[], staleRealmIds: string[], partyId: string|null }}
   */
  buildCurrentRealmContext({ actor } = {}) {
    return this.resolveForActor({ actor });
  }
}
