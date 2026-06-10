import { getSetting as defaultGetSetting, setSetting as defaultSetSetting, SETTING_KEYS } from '../config/settings.js';

const OVERRIDE_MODES = new Set(['none', 'manual']);

export class GatheringPartyValidationError extends Error {
  constructor(errors = []) {
    super(`Gathering party validation failed: ${errors.join('; ')}`);
    this.name = 'GatheringPartyValidationError';
    this.errors = errors;
  }
}

/**
 * Persists and validates Fabricate-managed gathering parties to the world
 * setting `gatheringParties`. Parties are world/cross-system records that key
 * their current-region overrides by `systemId` because regions are per crafting
 * system.
 *
 * The store owns the composite cross-record uniqueness invariant: an actor uuid
 * may associate with at most one ENABLED party in total (as a member, as the
 * travel actor, or both — and when both, the same party). Disabled parties never
 * count toward this invariant, and stale actor/system/region references are
 * preserved verbatim for GM repair. Enabling a party requires exactly one travel
 * actor; the invariant runs across the whole list at every save boundary.
 *
 * Mutators stamp `updatedAt`/`updatedByUserId` on override writes (including the
 * `mode: 'none'` clear, which still stamps and empties `regionIds`). `moveMember`
 * is a single persisted write so a member never momentarily belongs to two
 * enabled parties mid-move.
 */
export class GatheringPartyStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    randomID = null,
    getUserId = null,
    now = null
  } = {}) {
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.randomID = randomID || (() => globalThis.foundry?.utils?.randomID?.());
    this.getUserId = getUserId || (() => globalThis.game?.user?.id || null);
    this.now = now || (() => Date.now());
    this.parties = [];
    this.loaded = false;
  }

  load() {
    const saved = this.getSetting(SETTING_KEYS.GATHERING_PARTIES);
    this.parties = this._normalizeList(saved);
    this.loaded = true;
    return cloneJson(this.parties);
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
  }

  list() {
    this._ensureLoaded();
    return cloneJson(this.parties);
  }

  get(partyId) {
    this._ensureLoaded();
    const party = this.parties.find(p => p.id === partyId);
    return party ? cloneJson(party) : null;
  }

  /**
   * Resolve the unique enabled party that references the actor uuid as a member
   * or as its travel actor. The composite invariant guarantees at most one.
   *
   * @param {string} actorUuid
   * @returns {object|null}
   */
  findEnabledPartyForActor(actorUuid) {
    this._ensureLoaded();
    const uuid = stringOrEmpty(actorUuid);
    if (!uuid) return null;
    const party = this.parties.find(p => p.enabled === true
      && (p.travelActorUuid === uuid || p.memberActorUuids.includes(uuid)));
    return party ? cloneJson(party) : null;
  }

  async create(data = {}) {
    this._ensureLoaded();
    const party = this._normalizeParty({ ...data, id: data?.id || this.randomID() });
    await this._persist([...this.parties, party]);
    return this.get(party.id);
  }

  async update(partyId, patch = {}) {
    return this._mutateParty(partyId, party => ({ ...party, ...cloneJson(patch), id: partyId }));
  }

  async delete(partyId) {
    this._ensureLoaded();
    const exists = this.parties.some(p => p.id === partyId);
    if (!exists) return false;
    await this._persist(this.parties.filter(p => p.id !== partyId));
    return true;
  }

  async addMember(partyId, actorUuid) {
    const uuid = stringOrEmpty(actorUuid);
    return this._mutateParty(partyId, party => ({
      ...party,
      memberActorUuids: Array.from(new Set([...party.memberActorUuids, uuid].filter(Boolean)))
    }));
  }

  async removeMember(partyId, actorUuid) {
    const uuid = stringOrEmpty(actorUuid);
    return this._mutateParty(partyId, party => ({
      ...party,
      memberActorUuids: party.memberActorUuids.filter(member => member !== uuid)
    }));
  }

  /**
   * Move a member uuid from one party to another in a single persisted write so
   * the member never momentarily belongs to two enabled parties.
   *
   * @param {string} fromPartyId
   * @param {string} toPartyId
   * @param {string} actorUuid
   * @returns {Promise<object[]>} The full normalized party list.
   */
  async moveMember(fromPartyId, toPartyId, actorUuid) {
    this._ensureLoaded();
    const uuid = stringOrEmpty(actorUuid);
    const next = this.parties.map(party => {
      if (party.id === fromPartyId) {
        return { ...party, memberActorUuids: party.memberActorUuids.filter(member => member !== uuid) };
      }
      if (party.id === toPartyId) {
        return { ...party, memberActorUuids: Array.from(new Set([...party.memberActorUuids, uuid].filter(Boolean))) };
      }
      return party;
    });
    await this._persist(next);
    return this.list();
  }

  async setTravelActor(partyId, actorUuid) {
    const uuid = optionalString(actorUuid);
    return this._mutateParty(partyId, party => ({ ...party, travelActorUuid: uuid }));
  }

  async setEnabled(partyId, enabled) {
    return this._mutateParty(partyId, party => ({ ...party, enabled: enabled === true }));
  }

  async setCurrentRegionOverride(partyId, systemId, regionIds = []) {
    const sysId = stringOrEmpty(systemId);
    const ids = normalizeIdList(regionIds);
    return this._mutateParty(partyId, party => ({
      ...party,
      currentRegionOverrides: {
        ...party.currentRegionOverrides,
        [sysId]: {
          mode: 'manual',
          regionIds: ids,
          updatedAt: this.now(),
          updatedByUserId: stringOrEmpty(this.getUserId())
        }
      }
    }));
  }

  async clearCurrentRegionOverride(partyId, systemId) {
    const sysId = stringOrEmpty(systemId);
    return this._mutateParty(partyId, party => ({
      ...party,
      currentRegionOverrides: {
        ...party.currentRegionOverrides,
        [sysId]: {
          mode: 'none',
          regionIds: [],
          updatedAt: this.now(),
          updatedByUserId: stringOrEmpty(this.getUserId())
        }
      }
    }));
  }

  async _mutateParty(partyId, transform) {
    this._ensureLoaded();
    const index = this.parties.findIndex(p => p.id === partyId);
    if (index < 0) return null;
    const nextParty = this._normalizeParty(transform(cloneJson(this.parties[index])));
    await this._persist(replaceAt(this.parties, index, nextParty));
    return this.get(partyId);
  }

  async save(parties = null) {
    if (parties === null) {
      this._ensureLoaded();
      return this._persist(this.parties);
    }
    return this._persist(parties);
  }

  async _persist(parties) {
    const normalized = this._normalizeList(parties);
    const errors = this._validateList(normalized, parties);
    if (errors.length > 0) throw new GatheringPartyValidationError(errors);
    const payload = cloneJson(normalized);
    await this.setSetting(SETTING_KEYS.GATHERING_PARTIES, payload);
    this.parties = normalized;
    this.loaded = true;
    return cloneJson(payload);
  }

  _normalizeList(raw) {
    const records = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const normalized = [];
    for (const record of records) {
      const party = this._normalizeParty(record);
      // Duplicate party ids on READ keep the first occurrence.
      if (seen.has(party.id)) continue;
      seen.add(party.id);
      normalized.push(party);
    }
    return normalized;
  }

  _normalizeParty(data = {}) {
    return {
      id: data?.id ? String(data.id) : this.randomID(),
      name: trimmedOrDefault(data?.name, 'New Party'),
      enabled: data?.enabled === true,
      memberActorUuids: normalizeIdList(data?.memberActorUuids),
      travelActorUuid: optionalString(data?.travelActorUuid),
      currentRegionOverrides: normalizeOverrides(data?.currentRegionOverrides)
    };
  }

  _validateList(parties, rawParties) {
    const errors = [];

    // Duplicate ids are rejected at the SAVE boundary (unlike read, which keeps
    // the first occurrence).
    const rawList = Array.isArray(rawParties) ? rawParties : [];
    const idCounts = new Map();
    for (const raw of rawList) {
      const id = stringOrEmpty(raw?.id);
      if (!id) continue;
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
    for (const [id, count] of idCounts) {
      if (count > 1) errors.push(`Duplicate party id "${id}"`);
    }

    // Enabled parties require exactly one travel actor.
    for (const party of parties) {
      if (party.enabled && !party.travelActorUuid) {
        errors.push(`Party "${party.name}" cannot be enabled without a travel actor`);
      }
    }

    // Composite uniqueness invariant across ENABLED parties: an actor uuid may
    // associate with at most one enabled party (member, travel actor, or both).
    const actorToParty = new Map();
    for (const party of parties) {
      if (!party.enabled) continue;
      const associated = new Set(party.memberActorUuids);
      if (party.travelActorUuid) associated.add(party.travelActorUuid);
      for (const uuid of associated) {
        const owner = actorToParty.get(uuid);
        if (owner && owner !== party.id) {
          errors.push(`Actor "${uuid}" is associated with more than one enabled party`);
        } else {
          actorToParty.set(uuid, party.id);
        }
      }
    }

    // Override mode vocab.
    for (const party of parties) {
      for (const [systemId, override] of Object.entries(party.currentRegionOverrides)) {
        if (!OVERRIDE_MODES.has(override.mode)) {
          errors.push(`Party "${party.name}" override for system "${systemId}" has invalid mode "${override.mode}"`);
        }
      }
    }

    return Array.from(new Set(errors));
  }
}

function normalizeOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [systemId, override] of Object.entries(value)) {
    const key = stringOrEmpty(systemId);
    if (!key || !override || typeof override !== 'object') continue;
    result[key] = {
      mode: OVERRIDE_MODES.has(override.mode) ? override.mode : 'none',
      regionIds: normalizeIdList(override.regionIds),
      updatedAt: Number.isFinite(Number(override.updatedAt)) ? Number(override.updatedAt) : 0,
      updatedByUserId: stringOrEmpty(override.updatedByUserId)
    };
  }
  return result;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function replaceAt(array, index, value) {
  const next = [...array];
  next[index] = value;
  return next;
}

function stringOrEmpty(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function optionalString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function trimmedOrDefault(value, fallback) {
  return stringOrEmpty(value) || fallback;
}

function normalizeIdList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(entry => stringOrEmpty(entry)).filter(Boolean)));
}
