import {
  normalizeGatheringRealm,
  normalizeGatheringRealmList,
  normalizeGatheringRealmSettings,
  validateGatheringRealm,
  validateGatheringRealmList,
  validateGatheringRealmSettings,
} from './gatheringRealms.js';

export class GatheringRealmValidationError extends Error {
  constructor(errors = []) {
    super(`Gathering realm validation failed: ${errors.join('; ')}`);
    this.name = 'GatheringRealmValidationError';
    this.errors = errors;
  }
}

/**
 * Thin CRUD facade over the per-system `gatheringRealms` array. Persistence
 * funnels through `systemManager.updateSystem(systemId, { gatheringRealms })`,
 * which re-runs `_normalizeSystem` and self-heals each realm's
 * `craftingSystemId` to the owning system. The store owns the validation
 * boundary (duplicate ids, modifier/scene-mapping vocab) and never mutates
 * fields the Travel-route quick list does not touch — description, img, secret,
 * biomes, modifiers, and scene mappings round-trip untouched on a name/enabled
 * edit because `update` merges over the existing record.
 *
 * `delete` never blocks: it returns referenced-by repair evidence (environments
 * and party overrides that still cite the realm) so the GM confirm copy can warn
 * before removal.
 */
export class GatheringRealmStore {
  constructor({ systemManager, randomID = null } = {}) {
    this.systemManager = systemManager;
    this.randomID = randomID || (() => globalThis.foundry?.utils?.randomID?.());
  }

  _getSystem(systemId) {
    if (!systemId || !this.systemManager?.getSystem) return null;
    return this.systemManager.getSystem(systemId) || null;
  }

  _getRealms(systemId) {
    const system = this._getSystem(systemId);
    return Array.isArray(system?.gatheringRealms) ? system.gatheringRealms : [];
  }

  listBySystem(systemId) {
    return cloneJson(this._getRealms(systemId));
  }

  get(systemId, realmId) {
    const realm = this._getRealms(systemId).find((r) => r.id === realmId);
    return realm ? cloneJson(realm) : null;
  }

  getRealmSettings(systemId) {
    const system = this._getSystem(systemId);
    return normalizeGatheringRealmSettings(system?.gatheringRealmSettings);
  }

  async updateRealmSettings(systemId, patch = {}) {
    const current = this.getRealmSettings(systemId);
    const merged = { ...current, ...patch };
    const errors = validateGatheringRealmSettings(merged);
    if (errors.length > 0) throw new GatheringRealmValidationError(errors);
    await this.systemManager.updateSystem(systemId, {
      gatheringRealmSettings: normalizeGatheringRealmSettings(merged),
    });
    return this.getRealmSettings(systemId);
  }

  async create(systemId, data = {}) {
    const realm = normalizeGatheringRealm(
      { ...data, id: data?.id || this.randomID() },
      { craftingSystemId: systemId, randomID: this.randomID }
    );
    const next = [...this._getRealms(systemId), realm];
    await this._persist(
      systemId,
      next,
      data ? [...this._getRealms(systemId), { ...data, id: realm.id }] : next
    );
    return this.get(systemId, realm.id);
  }

  async update(systemId, realmId, patch = {}) {
    const realms = this._getRealms(systemId);
    const index = realms.findIndex((r) => r.id === realmId);
    if (index === -1) return null;

    const mergedRaw = { ...realms[index], ...cloneJson(patch), id: realmId };
    const realm = normalizeGatheringRealm(mergedRaw, {
      craftingSystemId: systemId,
      randomID: this.randomID,
    });
    const next = replaceAt(realms, index, realm);
    const rawNext = replaceAt(realms, index, mergedRaw);
    await this._persist(systemId, next, rawNext);
    return this.get(systemId, realmId);
  }

  async reorder(systemId, orderedRealmIds = []) {
    const realms = this._getRealms(systemId);
    const byId = new Map(realms.map((r) => [r.id, r]));
    const emitted = new Set();
    const reordered = [];
    for (const id of Array.isArray(orderedRealmIds) ? orderedRealmIds : []) {
      if (!byId.has(id) || emitted.has(id)) continue;
      reordered.push(byId.get(id));
      emitted.add(id);
    }
    for (const realm of realms) {
      if (emitted.has(realm.id)) continue;
      reordered.push(realm);
      emitted.add(realm.id);
    }
    await this._persist(systemId, reordered, reordered);
    return this.listBySystem(systemId);
  }

  /**
   * Delete a realm. Never blocks; returns the deleted realm plus referenced-by
   * repair evidence collected from the optional environment/party stores so the
   * GM confirm copy can warn about dangling references.
   *
   * @param {string} systemId
   * @param {string} realmId
   * @param {{ environmentStore?: object, partyStore?: object }} [collaborators]
   * @returns {Promise<{ deleted: object|null, referencedBy: { environments: object[], partyOverrides: object[] } }>}
   */
  async delete(systemId, realmId, { environmentStore = null, partyStore = null } = {}) {
    const realms = this._getRealms(systemId);
    const existing = realms.find((r) => r.id === realmId);
    if (!existing) return { deleted: null, referencedBy: { environments: [], partyOverrides: [] } };

    const referencedBy = this._collectReferences(systemId, realmId, {
      environmentStore,
      partyStore,
    });
    const next = realms.filter((r) => r.id !== realmId);
    await this._persist(systemId, next, next);
    return { deleted: cloneJson(existing), referencedBy };
  }

  _collectReferences(systemId, realmId, { environmentStore, partyStore }) {
    const environments = [];
    const partyOverrides = [];

    const envList =
      typeof environmentStore?.listBySystem === 'function'
        ? environmentStore.listBySystem(systemId)
        : typeof environmentStore?.list === 'function'
          ? environmentStore.list()
          : [];
    for (const env of Array.isArray(envList) ? envList : []) {
      if (env?.craftingSystemId && env.craftingSystemId !== systemId) continue;
      const included =
        Array.isArray(env?.includedRealmIds) && env.includedRealmIds.includes(realmId);
      const excluded =
        Array.isArray(env?.excludedRealmIds) && env.excludedRealmIds.includes(realmId);
      if (included || excluded) {
        environments.push({ id: env.id, name: env.name, included, excluded });
      }
    }

    const parties = typeof partyStore?.list === 'function' ? partyStore.list() : [];
    for (const party of Array.isArray(parties) ? parties : []) {
      const override = party?.currentRealmOverrides?.[systemId];
      if (override && Array.isArray(override.realmIds) && override.realmIds.includes(realmId)) {
        partyOverrides.push({ id: party.id, name: party.name });
      }
    }

    return { environments, partyOverrides };
  }

  async _persist(systemId, normalizedRealms, rawForValidation) {
    const errors = validateGatheringRealmList(rawForValidation);
    // Per-realm validation on the normalized records as a belt-and-braces check
    // for callers that pass already-normalized lists (reorder).
    for (const realm of normalizedRealms) {
      errors.push(...validateGatheringRealm(realm));
    }
    if (errors.length > 0) throw new GatheringRealmValidationError([...new Set(errors)]);
    await this.systemManager.updateSystem(systemId, {
      gatheringRealms: normalizeGatheringRealmList(normalizedRealms, {
        craftingSystemId: systemId,
        randomID: this.randomID,
      }),
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
