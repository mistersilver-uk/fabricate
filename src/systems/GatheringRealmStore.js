import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';

import {
  normalizeGatheringRealm,
  normalizeGatheringRealmList,
  normalizeTravelConfig,
  validateGatheringRealm,
  validateGatheringRealmList,
  validateTravelConfig,
} from './gatheringRealms.js';

export class GatheringRealmValidationError extends Error {
  constructor(errors = []) {
    super(`Gathering realm validation failed: ${errors.join('; ')}`);
    this.name = 'GatheringRealmValidationError';
    this.errors = errors;
  }
}

/**
 * The WORLD travel configuration store (issue 1282): the realm library, the reveal mode and
 * the modifier visibility, persisted to the `travelConfig` world setting.
 *
 * Realms are geography. The same valley is the same valley whichever crafting system a
 * character is there to serve, so they belong to the world and every system that opts in
 * shares them. What stays per crafting system is `gatheringRealmSettings.enabled` alone —
 * whether that system PARTICIPATES — which this store knows nothing about.
 *
 * It kept its class name deliberately. `GatheringRealmStore` is published on `game.fabricate`
 * in five places (`getGatheringRealmStore`, `gathering.getRealmStore`, the deprecated
 * `getGatheringRegionStore` alias, the class export and its `GatheringRegionStore` alias), so
 * renaming it would break those handles or demand a forwarding shim whose two halves have
 * incompatible signatures. What changed is the persistence seam and the loss of the leading
 * `systemId` from every method.
 *
 * It also kept its validation boundary (duplicate ids, modifier and scene-mapping vocabularies)
 * and its referenced-by evidence collection, because neither duplicates anything elsewhere —
 * pushing them into `adminStore` would be a genuine downgrade.
 *
 * `delete` never blocks: it returns referenced-by repair evidence (environments and party
 * overrides that still cite the realm) so the GM confirm copy can warn before removal.
 */
export class GatheringRealmStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    randomID = null,
  } = {}) {
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.randomID = randomID || (() => globalThis.foundry?.utils?.randomID?.());
    this.config = null;
    this.loaded = false;
  }

  load() {
    const saved = this.getSetting(SETTING_KEYS.TRAVEL_CONFIG);
    this.config = this._normalize(saved);
    this.loaded = true;
    return cloneJson(this.config);
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
  }

  _normalize(raw) {
    return normalizeTravelConfig(raw && typeof raw === 'object' ? raw : {}, {
      randomID: this.randomID,
    });
  }

  /** @returns {{ revealMode: string, modifierVisibility: string, realms: object[] }} */
  get() {
    this._ensureLoaded();
    return cloneJson(this.config);
  }

  _realms() {
    this._ensureLoaded();
    return Array.isArray(this.config?.realms) ? this.config.realms : [];
  }

  /** The world's realm library. */
  list() {
    return cloneJson(this._realms());
  }

  getRealm(realmId) {
    const realm = this._realms().find((r) => r.id === realmId);
    return realm ? cloneJson(realm) : null;
  }

  /**
   * The world's realm BEHAVIOUR — reveal mode and modifier visibility.
   *
   * Deliberately no `enabled`: participation is a crafting system's answer, not the world's,
   * and a store that returned one here is how `adminStore.canUsePartyRealmOverrides` came to
   * read the per-system gate through the wrong object.
   */
  getRealmSettings() {
    const { revealMode, modifierVisibility } = this.get();
    return { revealMode, modifierVisibility };
  }

  async updateRealmSettings(patch = {}) {
    const merged = { ...this.get(), ...patch };
    const errors = validateTravelConfig(merged);
    if (errors.length > 0) throw new GatheringRealmValidationError(errors);
    await this._persist(merged);
    return this.getRealmSettings();
  }

  async create(data = {}) {
    const realm = normalizeGatheringRealm(
      { ...data, id: data?.id || this.randomID() },
      { randomID: this.randomID }
    );
    const current = this._realms();
    await this._persistRealms([...current, realm], [...current, { ...data, id: realm.id }]);
    return this.getRealm(realm.id);
  }

  async update(realmId, patch = {}) {
    const realms = this._realms();
    const index = realms.findIndex((r) => r.id === realmId);
    if (index === -1) return null;

    const mergedRaw = { ...realms[index], ...cloneJson(patch), id: realmId };
    const realm = normalizeGatheringRealm(mergedRaw, { randomID: this.randomID });
    await this._persistRealms(replaceAt(realms, index, realm), replaceAt(realms, index, mergedRaw));
    return this.getRealm(realmId);
  }

  async reorder(orderedRealmIds = []) {
    const realms = this._realms();
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
    await this._persistRealms(reordered, reordered);
    return this.list();
  }

  /**
   * Point one Foundry Scene Region at one realm, in a SINGLE write.
   *
   * The caller used to do this by awaiting one `update()` per realm in a loop — strip the
   * region from every realm, then attach it to the chosen one. Against a setting-backed store
   * that is a guaranteed lost update: iteration N+1 reads the cache as it stood before N. One
   * method, one normalize, one write.
   *
   * Passing a falsy `realmId` unlinks the region without attaching it anywhere.
   *
   * @param {string} sceneRegionUuid
   * @param {string} realmId
   * @param {{ sceneUuid?: string }} [options]
   */
  async setSceneRegionLink(sceneRegionUuid, realmId, { sceneUuid = '' } = {}) {
    const regionUuid = String(sceneRegionUuid || '').trim();
    if (!regionUuid) return this.list();

    const next = this._realms().map((realm) => {
      const mappings = Array.isArray(realm.sceneMappings) ? realm.sceneMappings : [];
      const without = mappings.filter((mapping) => mapping?.sceneRegionUuid !== regionUuid);
      if (realm.id !== realmId) {
        return without.length === mappings.length ? realm : { ...realm, sceneMappings: without };
      }
      return {
        ...realm,
        sceneMappings: [
          ...without,
          { sceneUuid: String(sceneUuid || ''), sceneRegionUuid: regionUuid },
        ],
      };
    });

    await this._persistRealms(next, next);
    return this.list();
  }

  /**
   * Delete a realm. Never blocks; returns the deleted realm plus referenced-by repair evidence
   * collected from the optional environment/party stores so the GM confirm copy can warn about
   * dangling references.
   *
   * @param {string} realmId
   * @param {{ environmentStore?: object, partyStore?: object }} [collaborators]
   * @returns {Promise<{ deleted: object|null, referencedBy: { environments: object[], partyOverrides: object[] } }>}
   */
  async delete(realmId, { environmentStore = null, partyStore = null } = {}) {
    const realms = this._realms();
    const existing = realms.find((r) => r.id === realmId);
    if (!existing) return { deleted: null, referencedBy: { environments: [], partyOverrides: [] } };

    const referencedBy = this._collectReferences(realmId, { environmentStore, partyStore });
    const next = realms.filter((r) => r.id !== realmId);
    await this._persistRealms(next, next);
    return { deleted: cloneJson(existing), referencedBy };
  }

  _collectReferences(realmId, { environmentStore, partyStore }) {
    const environments = [];
    const partyOverrides = [];

    // Every environment in the world, not one system's: a world realm can be cited by
    // environments belonging to any crafting system that opted in, and the GM needs to see all
    // of them before deleting the place they name.
    const envList = typeof environmentStore?.list === 'function' ? environmentStore.list() : [];
    for (const env of Array.isArray(envList) ? envList : []) {
      const included =
        Array.isArray(env?.includedRealmIds) && env.includedRealmIds.includes(realmId);
      const excluded =
        Array.isArray(env?.excludedRealmIds) && env.excludedRealmIds.includes(realmId);
      if (included || excluded) {
        environments.push({
          id: env.id,
          name: env.name,
          craftingSystemId: env.craftingSystemId,
          included,
          excluded,
        });
      }
    }

    const parties = typeof partyStore?.list === 'function' ? partyStore.list() : [];
    for (const party of Array.isArray(parties) ? parties : []) {
      const override = party?.currentRealmOverride;
      if (override && Array.isArray(override.realmIds) && override.realmIds.includes(realmId)) {
        partyOverrides.push({ id: party.id, name: party.name });
      }
    }

    return { environments, partyOverrides };
  }

  async _persistRealms(normalizedRealms, rawForValidation) {
    const errors = validateGatheringRealmList(rawForValidation);
    // Per-realm validation on the normalized records as a belt-and-braces check for callers
    // that pass already-normalized lists (reorder, setSceneRegionLink).
    for (const realm of normalizedRealms) {
      errors.push(...validateGatheringRealm(realm));
    }
    if (errors.length > 0) throw new GatheringRealmValidationError([...new Set(errors)]);
    await this._persist({
      ...this.get(),
      realms: normalizeGatheringRealmList(normalizedRealms, { randomID: this.randomID }),
    });
  }

  /**
   * PUBLISH THE CACHE BEFORE AWAITING THE WRITE, not after.
   *
   * Callers read-modify-write, so a second edit starting while the first `setSetting` is still
   * in flight would otherwise read the pre-first-edit config and clobber it. The per-system
   * store this replaced was safe by construction, because `CraftingSystemManager.updateSystem`
   * writes its map before its own await; publishing late here would be a regression rather
   * than a new limitation. The cost is a cache briefly ahead of the setting if the write
   * rejects — recoverable on the next `load()`, which the replication bridge calls whenever
   * the setting changes. A lost update is not recoverable at all.
   */
  async _persist(next) {
    const normalized = this._normalize(next);
    const payload = cloneJson(normalized);
    this.config = normalized;
    this.loaded = true;
    await this.setSetting(SETTING_KEYS.TRAVEL_CONFIG, payload);
    return cloneJson(payload);
  }

  /** Replace the whole configuration — used by import and by the migration's writeback. */
  async save(config) {
    return this._persist(config);
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
