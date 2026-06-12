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
import { isGatheringRealmsEnabled } from './gatheringRealms.js';

export class GatheringLocationService {
  /**
   * @param {object} collaborators
   * @param {object} collaborators.partyStore
   * @param {object} collaborators.systemManager
   * @param {(travelActorUuid: string) => Iterable<string>} [collaborators.senseSceneRegions]
   *   Returns the Scene Region UUIDs the marker token currently sits inside.
   *   Foundry-backed at runtime; defaults to none so the service stays pure in tests.
   */
  constructor({ partyStore, systemManager, senseSceneRegions = () => [] } = {}) {
    this.partyStore = partyStore;
    this.systemManager = systemManager;
    this.senseSceneRegions = typeof senseSceneRegions === 'function' ? senseSceneRegions : () => [];
  }

  _getRealms(systemId) {
    const system = this.systemManager?.getSystem?.(systemId);
    return Array.isArray(system?.gatheringRealms) ? system.gatheringRealms : [];
  }

  /**
   * Whether the realm/travel subsystem is enabled for the given system. Reads
   * the same shared flag the engine and public API gate on, so a disabled system
   * resolves to "unresolved" everywhere without re-implementing the check.
   *
   * @param {string} systemId
   * @returns {boolean}
   */
  _realmsEnabled(systemId) {
    return isGatheringRealmsEnabled(this.systemManager?.getSystem?.(systemId));
  }

  /**
   * @param {{ partyId: string, systemId: string }} args
   * @returns {{ resolved: boolean, source: 'manualOverride'|'travelActor'|'unresolved', realms: object[], realmIds: string[], staleRealmIds: string[], partyId: string|null, systemId: string }}
   */
  resolveCurrentRealms({ partyId, systemId } = {}) {
    const empty = {
      resolved: false,
      source: 'unresolved',
      realms: [],
      realmIds: [],
      staleRealmIds: [],
      partyId: partyId || null,
      systemId: systemId || ''
    };
    if (!partyId || !systemId) return empty;
    // Realm/travel disabled ⇒ never resolve a current realm (no location gating).
    if (!this._realmsEnabled(systemId)) return empty;

    const party = this.partyStore?.get?.(partyId);
    if (!party) return empty;

    const override = party.currentRealmOverrides?.[systemId] ?? party.currentRegionOverrides?.[systemId];
    if (override && override.mode === 'manual') {
      const realmsById = new Map(this._getRealms(systemId).map(realm => [realm.id, realm]));
      const realms = [];
      const realmIds = [];
      const staleRealmIds = [];
      const overrideRealmIds = Array.isArray(override.realmIds)
        ? override.realmIds
        : (Array.isArray(override.regionIds) ? override.regionIds : []);
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
        systemId
      };
    }

    // Auto (travel-actor) sensing: derive the current realms LIVE from the Scene
    // Regions the party's marker token sits inside, mapped to Fabricate realms by
    // their sceneMappings. A travel-actor-less party, or a marker in no linked
    // realm, resolves to unresolved.
    const travelActorUuid = party.travelActorUuid ? String(party.travelActorUuid) : '';
    if (!travelActorUuid) return { ...empty, partyId, systemId };

    const sensed = this.senseSceneRegions(travelActorUuid);
    const sceneRegionUuids = sensed instanceof Set ? sensed : new Set(Array.isArray(sensed) ? sensed : []);
    if (sceneRegionUuids.size === 0) return { ...empty, partyId, systemId };

    const realms = [];
    const realmIds = [];
    for (const realm of this._getRealms(systemId)) {
      const mappings = Array.isArray(realm?.sceneMappings) ? realm.sceneMappings : [];
      if (mappings.some(mapping => sceneRegionUuids.has(mapping?.sceneRegionUuid))) {
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
      systemId
    };
  }

  /**
   * Resolve current realms for the enabled party that contains the actor.
   *
   * @param {{ actor: object, systemId: string }} args
   * @returns {object} Same shape as resolveCurrentRealms.
   */
  resolveForActor({ actor, systemId } = {}) {
    const unresolved = {
      resolved: false,
      source: 'unresolved',
      realms: [],
      realmIds: [],
      staleRealmIds: [],
      partyId: null,
      systemId: systemId || ''
    };
    // Realm/travel disabled ⇒ fast-exit to unresolved-empty (no party lookup).
    if (!this._realmsEnabled(systemId)) return unresolved;
    const actorUuid = actor?.uuid ?? null;
    const party = actorUuid ? this.partyStore?.findEnabledPartyForActor?.(actorUuid) : null;
    if (!party) return unresolved;
    return this.resolveCurrentRealms({ partyId: party.id, systemId });
  }

  /**
   * Build the current-realm context consumed by `evaluateLocationAvailability`.
   *
   * @param {{ actor: object, systemId: string }} args
   * @returns {{ resolved: boolean, source: string, realms: object[], realmIds: string[], staleRealmIds: string[], partyId: string|null, systemId: string }}
   */
  buildCurrentRealmContext({ actor, systemId } = {}) {
    return this.resolveForActor({ actor, systemId });
  }
}
