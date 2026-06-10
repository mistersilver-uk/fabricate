/**
 * Resolves the current regions for a party (or a selected actor) within one
 * crafting system. Manual GM override takes precedence; the slice does not yet
 * implement token-derived sensing, but the canonical source token `travelActor`
 * is reserved so Phase 3 can insert it between the override and unresolved
 * branches without changing the contract.
 *
 * Canonical source tokens: `manualOverride`, `travelActor`, `unresolved`.
 *
 * Resolution detail (per the Current Region Resolution spec):
 * - A manual override that includes a DISABLED region id still resolves it (GM
 *   diagnostic/preview inclusion); the UI marks it disabled.
 * - Region ids referencing MISSING regions are stale repair evidence
 *   (`staleRegionIds`) and do not resolve.
 * - `mode: 'none'`, or a disabled/travel-actor-less party, resolves to
 *   `unresolved`.
 */
export class GatheringLocationService {
  constructor({ partyStore, systemManager } = {}) {
    this.partyStore = partyStore;
    this.systemManager = systemManager;
  }

  _getRegions(systemId) {
    const system = this.systemManager?.getSystem?.(systemId);
    return Array.isArray(system?.gatheringRegions) ? system.gatheringRegions : [];
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

    // Phase 3 inserts travel-actor token sensing here. For now, mode 'none' or
    // absent override, or a disabled/travel-actor-less party, resolves to none.
    return { ...empty, partyId, systemId };
  }

  /**
   * Resolve current regions for the enabled party that contains the actor.
   *
   * @param {{ actor: object, systemId: string }} args
   * @returns {object} Same shape as resolveCurrentRegions.
   */
  resolveForActor({ actor, systemId } = {}) {
    const actorUuid = actor?.uuid || actor?.id || null;
    const party = actorUuid ? this.partyStore?.findEnabledPartyForActor?.(actorUuid) : null;
    if (!party) {
      return {
        resolved: false,
        source: 'unresolved',
        regions: [],
        regionIds: [],
        staleRegionIds: [],
        partyId: null,
        systemId: systemId || ''
      };
    }
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
