import {
  normalizeGatheringRegion,
  normalizeGatheringRegionList,
  normalizeGatheringRegionSettings,
  validateGatheringRegion,
  validateGatheringRegionList,
  validateGatheringRegionSettings
} from './gatheringRegions.js';

export class GatheringRegionValidationError extends Error {
  constructor(errors = []) {
    super(`Gathering region validation failed: ${errors.join('; ')}`);
    this.name = 'GatheringRegionValidationError';
    this.errors = errors;
  }
}

/**
 * Thin CRUD facade over the per-system `gatheringRegions` array. Persistence
 * funnels through `systemManager.updateSystem(systemId, { gatheringRegions })`,
 * which re-runs `_normalizeSystem` and self-heals each region's
 * `craftingSystemId` to the owning system. The store owns the validation
 * boundary (duplicate ids, modifier/scene-mapping vocab) and never mutates
 * fields the Travel-route quick list does not touch — description, img, secret,
 * biomes, modifiers, and scene mappings round-trip untouched on a name/enabled
 * edit because `update` merges over the existing record.
 *
 * `delete` never blocks: it returns referenced-by repair evidence (environments
 * and party overrides that still cite the region) so the GM confirm copy can warn
 * before removal.
 */
export class GatheringRegionStore {
  constructor({ systemManager, randomID = null } = {}) {
    this.systemManager = systemManager;
    this.randomID = randomID || (() => globalThis.foundry?.utils?.randomID?.());
  }

  _getSystem(systemId) {
    if (!systemId || !this.systemManager?.getSystem) return null;
    return this.systemManager.getSystem(systemId) || null;
  }

  _getRegions(systemId) {
    const system = this._getSystem(systemId);
    return Array.isArray(system?.gatheringRegions) ? system.gatheringRegions : [];
  }

  listBySystem(systemId) {
    return cloneJson(this._getRegions(systemId));
  }

  get(systemId, regionId) {
    const region = this._getRegions(systemId).find(r => r.id === regionId);
    return region ? cloneJson(region) : null;
  }

  getRegionSettings(systemId) {
    const system = this._getSystem(systemId);
    return normalizeGatheringRegionSettings(system?.gatheringRegionSettings);
  }

  async updateRegionSettings(systemId, patch = {}) {
    const current = this.getRegionSettings(systemId);
    const merged = { ...current, ...patch };
    const errors = validateGatheringRegionSettings(merged);
    if (errors.length > 0) throw new GatheringRegionValidationError(errors);
    await this.systemManager.updateSystem(systemId, {
      gatheringRegionSettings: normalizeGatheringRegionSettings(merged)
    });
    return this.getRegionSettings(systemId);
  }

  async create(systemId, data = {}) {
    const region = normalizeGatheringRegion(
      { ...data, id: data?.id || this.randomID() },
      { craftingSystemId: systemId, randomID: this.randomID }
    );
    const next = [...this._getRegions(systemId), region];
    await this._persist(systemId, next, data ? [...this._getRegions(systemId), { ...data, id: region.id }] : next);
    return this.get(systemId, region.id);
  }

  async update(systemId, regionId, patch = {}) {
    const regions = this._getRegions(systemId);
    const index = regions.findIndex(r => r.id === regionId);
    if (index < 0) return null;

    const mergedRaw = { ...regions[index], ...cloneJson(patch), id: regionId };
    const region = normalizeGatheringRegion(mergedRaw, { craftingSystemId: systemId, randomID: this.randomID });
    const next = replaceAt(regions, index, region);
    const rawNext = replaceAt(regions, index, mergedRaw);
    await this._persist(systemId, next, rawNext);
    return this.get(systemId, regionId);
  }

  async reorder(systemId, orderedRegionIds = []) {
    const regions = this._getRegions(systemId);
    const byId = new Map(regions.map(r => [r.id, r]));
    const emitted = new Set();
    const reordered = [];
    for (const id of Array.isArray(orderedRegionIds) ? orderedRegionIds : []) {
      if (!byId.has(id) || emitted.has(id)) continue;
      reordered.push(byId.get(id));
      emitted.add(id);
    }
    for (const region of regions) {
      if (emitted.has(region.id)) continue;
      reordered.push(region);
      emitted.add(region.id);
    }
    await this._persist(systemId, reordered, reordered);
    return this.listBySystem(systemId);
  }

  /**
   * Delete a region. Never blocks; returns the deleted region plus referenced-by
   * repair evidence collected from the optional environment/party stores so the
   * GM confirm copy can warn about dangling references.
   *
   * @param {string} systemId
   * @param {string} regionId
   * @param {{ environmentStore?: object, partyStore?: object }} [collaborators]
   * @returns {Promise<{ deleted: object|null, referencedBy: { environments: object[], partyOverrides: object[] } }>}
   */
  async delete(systemId, regionId, { environmentStore = null, partyStore = null } = {}) {
    const regions = this._getRegions(systemId);
    const existing = regions.find(r => r.id === regionId);
    if (!existing) return { deleted: null, referencedBy: { environments: [], partyOverrides: [] } };

    const referencedBy = this._collectReferences(systemId, regionId, { environmentStore, partyStore });
    const next = regions.filter(r => r.id !== regionId);
    await this._persist(systemId, next, next);
    return { deleted: cloneJson(existing), referencedBy };
  }

  _collectReferences(systemId, regionId, { environmentStore, partyStore }) {
    const environments = [];
    const partyOverrides = [];

    const envList = typeof environmentStore?.listBySystem === 'function'
      ? environmentStore.listBySystem(systemId)
      : (typeof environmentStore?.list === 'function' ? environmentStore.list() : []);
    for (const env of Array.isArray(envList) ? envList : []) {
      if (env?.craftingSystemId && env.craftingSystemId !== systemId) continue;
      const included = Array.isArray(env?.includedRegionIds) && env.includedRegionIds.includes(regionId);
      const excluded = Array.isArray(env?.excludedRegionIds) && env.excludedRegionIds.includes(regionId);
      if (included || excluded) {
        environments.push({ id: env.id, name: env.name, included, excluded });
      }
    }

    const parties = typeof partyStore?.list === 'function' ? partyStore.list() : [];
    for (const party of Array.isArray(parties) ? parties : []) {
      const override = party?.currentRegionOverrides?.[systemId];
      if (override && Array.isArray(override.regionIds) && override.regionIds.includes(regionId)) {
        partyOverrides.push({ id: party.id, name: party.name });
      }
    }

    return { environments, partyOverrides };
  }

  async _persist(systemId, normalizedRegions, rawForValidation) {
    const errors = validateGatheringRegionList(rawForValidation);
    // Per-region validation on the normalized records as a belt-and-braces check
    // for callers that pass already-normalized lists (reorder).
    for (const region of normalizedRegions) {
      errors.push(...validateGatheringRegion(region));
    }
    if (errors.length > 0) throw new GatheringRegionValidationError(Array.from(new Set(errors)));
    await this.systemManager.updateSystem(systemId, {
      gatheringRegions: normalizeGatheringRegionList(normalizedRegions, {
        craftingSystemId: systemId,
        randomID: this.randomID
      })
    });
  }
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function replaceAt(array, index, value) {
  const next = [...array];
  next[index] = value;
  return next;
}
