/**
 * Resolves the current regions for a party (or a selected actor) within one
 * crafting system. Manual GM override takes precedence; absent a manual override
 * the current region is derived LIVE from where the party's `travelActor` marker
 * token currently sits (token-in-scene-region → region `sceneMappings` → Fabricate
 * region), via the injected `senseSceneRegions` collaborator. No state is stored
 * for the auto case — it always reflects the marker's live position.
 *
 * Canonical source tokens: `manualOverride`, `travelActor`, `unresolved`.
 *
 * Resolution detail (per the Current Region Resolution spec):
 * - A manual override that includes a DISABLED region id still resolves it (GM
 *   diagnostic/preview inclusion); the UI marks it disabled.
 * - Region ids referencing MISSING regions are stale repair evidence
 *   (`staleRegionIds`) and do not resolve.
 * - `mode: 'none'` / absent override ⇒ auto (travel-actor) sensing; a
 *   travel-actor-less party, or a marker in no linked Scene Region, resolves to
 *   `unresolved`.
 */
import { isGatheringRegionsEnabled } from './gatheringRegions.js';

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

  _getRegions(systemId) {
    const system = this.systemManager?.getSystem?.(systemId);
    return Array.isArray(system?.gatheringRegions) ? system.gatheringRegions : [];
  }

  /**
   * Whether the region/travel subsystem is enabled for the given system. Reads
   * the same shared flag the engine and public API gate on, so a disabled system
   * resolves to "unresolved" everywhere without re-implementing the check.
   *
   * @param {string} systemId
   * @returns {boolean}
   */
  _regionsEnabled(systemId) {
    return isGatheringRegionsEnabled(this.systemManager?.getSystem?.(systemId));
  }

  /**
   * @param {{ partyId: string, systemId: string }} args
   * @returns {{ resolved: boolean, source: 'manualOverride'|'travelActor'|'unresolved', regions: object[], regionIds: string[], staleRegionIds: string[], partyId: string|null, systemId: string }}
   */
  resolveCurrentRegions({ partyId, systemId } = {}) {
    const empty = {
      resolved: false,
      source: 'unresolved',
      regions: [],
      regionIds: [],
      staleRegionIds: [],
      partyId: partyId || null,
      systemId: systemId || ''
    };
    if (!partyId || !systemId) return empty;
    // Region/travel disabled ⇒ never resolve a current region (no location gating).
    if (!this._regionsEnabled(systemId)) return empty;

    const party = this.partyStore?.get?.(partyId);
    if (!party) return empty;

    const override = party.currentRegionOverrides?.[systemId];
    if (override && override.mode === 'manual') {
      const regionsById = new Map(this._getRegions(systemId).map(region => [region.id, region]));
      const regions = [];
      const regionIds = [];
      const staleRegionIds = [];
      for (const regionId of Array.isArray(override.regionIds) ? override.regionIds : []) {
        const region = regionsById.get(regionId);
        if (!region) {
          // Missing region ⇒ stale repair evidence; does not resolve.
          staleRegionIds.push(regionId);
          continue;
        }
        // Disabled regions in a manual override STILL resolve (GM diagnostic).
        regions.push(region);
        regionIds.push(regionId);
      }
      return {
        resolved: regionIds.length > 0,
        source: regionIds.length > 0 ? 'manualOverride' : 'unresolved',
        regions,
        regionIds,
        staleRegionIds,
        partyId,
        systemId
      };
    }

    // Auto (travel-actor) sensing: derive the current regions LIVE from the Scene
    // Regions the party's marker token sits inside, mapped to Fabricate regions by
    // their sceneMappings. A travel-actor-less party, or a marker in no linked
    // region, resolves to unresolved.
    const travelActorUuid = party.travelActorUuid ? String(party.travelActorUuid) : '';
    if (!travelActorUuid) return { ...empty, partyId, systemId };

    const sensed = this.senseSceneRegions(travelActorUuid);
    const sceneRegionUuids = sensed instanceof Set ? sensed : new Set(Array.isArray(sensed) ? sensed : []);
    if (sceneRegionUuids.size === 0) return { ...empty, partyId, systemId };

    const regions = [];
    const regionIds = [];
    for (const region of this._getRegions(systemId)) {
      const mappings = Array.isArray(region?.sceneMappings) ? region.sceneMappings : [];
      if (mappings.some(mapping => sceneRegionUuids.has(mapping?.sceneRegionUuid))) {
        regions.push(region);
        regionIds.push(region.id);
      }
    }
    return {
      resolved: regionIds.length > 0,
      source: regionIds.length > 0 ? 'travelActor' : 'unresolved',
      regions,
      regionIds,
      staleRegionIds: [],
      partyId,
      systemId
    };
  }

  /**
   * Resolve current regions for the enabled party that contains the actor.
   *
   * @param {{ actor: object, systemId: string }} args
   * @returns {object} Same shape as resolveCurrentRegions.
   */
  resolveForActor({ actor, systemId } = {}) {
    const unresolved = {
      resolved: false,
      source: 'unresolved',
      regions: [],
      regionIds: [],
      staleRegionIds: [],
      partyId: null,
      systemId: systemId || ''
    };
    // Region/travel disabled ⇒ fast-exit to unresolved-empty (no party lookup).
    if (!this._regionsEnabled(systemId)) return unresolved;
    const actorUuid = actor?.uuid ?? null;
    const party = actorUuid ? this.partyStore?.findEnabledPartyForActor?.(actorUuid) : null;
    if (!party) return unresolved;
    return this.resolveCurrentRegions({ partyId: party.id, systemId });
  }

  /**
   * Build the current-region context consumed by `evaluateLocationAvailability`.
   *
   * @param {{ actor: object, systemId: string }} args
   * @returns {{ resolved: boolean, source: string, regions: object[], regionIds: string[], staleRegionIds: string[], partyId: string|null, systemId: string }}
   */
  buildCurrentRegionContext({ actor, systemId } = {}) {
    return this.resolveForActor({ actor, systemId });
  }
}
