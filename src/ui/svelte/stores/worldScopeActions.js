/**
 * The GM write path over the three world-scope entity settings (issue 1362, epic 1357).
 *
 * ## Sections are OPAQUE - values, not keys
 *
 * `scopedDefinitions.js` never looks inside a section value, and neither does this module:
 * `updateWorldDefaultSection` and `updateMembershipSection` take whatever the caller hands
 * them and store it verbatim. What is NOT opaque is the section NAME. `normalizeMembership`
 * is an allowlist rebuild that SILENTLY DISCARDS an unknown key on the next `load()`, so an
 * action that accepted `salvage` or `difficulty` would appear to work, survive the session,
 * and lose the write at reload. Every section-taking action therefore REFUSES a name the
 * scope does not declare and answers `false`.
 *
 * A COMPONENT HAS EXACTLY ONE SECTION. `COMPONENT_SECTIONS` is `['category']`. Its essence
 * quantities, salvage, complications and `difficulty` are not sections and not membership
 * fields - they stay on the in-system `Component` record.
 *
 * ## Three named exceptions, each DELEGATED rather than reimplemented
 *
 * - `setSectionInherited` delegates to `setSectionInheritance`, which SEEDS the local block
 *   when a switch goes off and RETAINS a dormant override when it goes back on. A local
 *   `{...record, inherit: {...}}` would drop the seed and re-seed on the next override.
 * - tool `addToSystem` delegates to `seedToolRepairRequirements`, the once-only DEEP COPY.
 *   A fully generic membership-create ships tool adoption that silently loses the repair
 *   recipe - the defect the opacity principle produces on its own.
 * - component tags delegate to `resolveComponentTags` for the READ; the WRITE is additive
 *   with per-tag muting and no inherit switch, which is why `tags` gets its own two actions
 *   and is never routed through `updateMembershipSection`.
 *
 * ## `setEnabled` DOES NOT EXIST on the component type
 *
 * Not "exists and refuses". The normalizer drops an `enabled` key on a component membership
 * rather than storing `false`, so an action that accepted the call and did nothing would let
 * a caller conclude the write had landed. `'setEnabled' in actions` is `false` there.
 *
 * ## The store is the seam
 *
 * Every action reads `store.get()` - a deep copy in the PERSISTED shape, maps rather than
 * arrays - edits it, and hands it to `store.save()`, which normalizes and publishes before
 * awaiting the write. Nothing here touches `game.settings`, and nothing here mutates the
 * published corpus in place: the resolved-union memo keys on that object's identity.
 */

import { COMPONENT_SCOPE, COMPONENT_SECTIONS } from '../../../systems/componentScope.js';
import { ESSENCE_SCOPE, ESSENCE_SECTIONS } from '../../../systems/essenceScope.js';
import { membershipKey, setSectionInheritance } from '../../../systems/scopedDefinitions.js';
import {
  seedToolRepairRequirements,
  TOOL_SCOPE,
  TOOL_SECTIONS,
} from '../../../systems/toolScope.js';

/**
 * What each entity type's write path is allowed to do.
 *
 * @type {Readonly<Record<string, Readonly<object>>>}
 */
const WRITE_DESCRIPTORS = Object.freeze({
  component: Object.freeze({
    scope: COMPONENT_SCOPE,
    sections: COMPONENT_SECTIONS,
    enableable: false,
    taggable: true,
  }),
  essence: Object.freeze({
    scope: ESSENCE_SCOPE,
    sections: ESSENCE_SECTIONS,
    enableable: true,
    taggable: false,
  }),
  tool: Object.freeze({
    scope: TOOL_SCOPE,
    sections: TOOL_SECTIONS,
    enableable: true,
    taggable: false,
  }),
});

/**
 * A trimmed id, or `''` for anything that cannot be one.
 *
 * @param {unknown} value
 * @returns {string}
 */
function id(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * A plain object, or `{}`.
 *
 * @param {unknown} value
 * @returns {object}
 */
function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Trimmed, de-duplicated, order-preserving labels - the same rule `componentScope`'s
 * normalizer applies, restated here so a rejected label never reaches the setting.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function labels(raw) {
  const seen = new Set();
  const list = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const label = typeof entry === 'string' ? entry.trim() : '';
    if (!label || seen.has(label)) continue;
    seen.add(label);
    list.push(label);
  }
  return list;
}

/**
 * The three persisted sub-keys, as maps, on a payload that may be missing any of them.
 *
 * @param {unknown} raw
 * @returns {{entities: Array<object>, defaults: object, membership: object}}
 */
function persistedShape(raw) {
  const source = plain(raw);
  return {
    ...source,
    entities: Array.isArray(source.entities) ? [...source.entities] : [],
    defaults: { ...plain(source.defaults) },
    membership: { ...plain(source.membership) },
  };
}

/**
 * Build the world-scope write path for ONE entity type.
 *
 * The returned object's KEY SET is part of its contract: `setEnabled` is present only on an
 * enableable entity, and `setWorldTags` / `setMutedTags` only on a taggable one.
 *
 * @param {object} options
 * @param {string} options.entityType `component`, `essence` or `tool`.
 * @param {() => object|null} options.getStore Resolves the scope store, or `null`.
 * @returns {object} The action family.
 */
export function createWorldScopeEntityActions({ entityType, getStore }) {
  const descriptor = WRITE_DESCRIPTORS[entityType];
  if (!descriptor) throw new TypeError(`unknown world scope entity type "${entityType}"`);

  const store = () => {
    try {
      return getStore?.() ?? null;
    } catch {
      return null;
    }
  };

  const knownSection = (section) => descriptor.sections.includes(section);

  /**
   * Read, edit and persist. The editor answers `false` to abandon the write, which is how
   * every refusal below reaches the caller without a second code path.
   *
   * @param {(payload: object) => boolean} edit
   * @returns {Promise<boolean>}
   */
  async function mutate(edit) {
    const current = store();
    if (!current) return false;
    const payload = persistedShape(current.get?.());
    if (edit(payload) === false) return false;
    await current.save(payload);
    return true;
  }

  /**
   * The membership record for one pair, or `null`.
   *
   * @param {object} payload
   * @param {string} entityId
   * @param {string} systemId
   * @returns {object|null}
   */
  function membershipOf(payload, entityId, systemId) {
    return payload.membership[membershipKey(entityId, systemId)] ?? null;
  }

  /**
   * Replace one membership record.
   *
   * @param {object} payload
   * @param {object} record
   * @returns {void}
   */
  function putMembership(payload, record) {
    payload.membership[membershipKey(record.entityId, record.systemId)] = record;
  }

  const actions = {
    /** The entity type these actions write. @type {string} */
    entityType,

    /**
     * Create a world entity. Identity only - the roster normalizer enforces nothing beyond
     * a trimmed, unique id, so every other authored field is preserved verbatim.
     *
     * @param {object} entity
     * @returns {Promise<boolean>}
     */
    async createEntity(entity) {
      const entityId = id(entity?.id);
      if (!entityId) return false;
      return mutate((payload) => {
        if (payload.entities.some((entry) => id(entry?.id) === entityId)) return false;
        payload.entities.push({ ...plain(entity), id: entityId });
        return true;
      });
    },

    /**
     * Patch a world entity's identity fields. The id itself is never re-keyed here: every
     * membership record and every reference addresses it, so a re-key is a migration.
     *
     * @param {string} entityId
     * @param {object} patch
     * @returns {Promise<boolean>}
     */
    async updateEntity(entityId, patch) {
      const target = id(entityId);
      if (!target) return false;
      return mutate((payload) => {
        const index = payload.entities.findIndex((entry) => id(entry?.id) === target);
        if (index === -1) return false;
        payload.entities[index] = { ...payload.entities[index], ...plain(patch), id: target };
        return true;
      });
    },

    /**
     * Delete a world entity, its world defaults and EVERY membership record naming it.
     *
     * The membership sweep is not optional cleanup: a record whose entity is gone is
     * unreachable from every screen and still counts as membership at resolution time.
     *
     * @param {string} entityId
     * @returns {Promise<boolean>}
     */
    async deleteEntity(entityId) {
      const target = id(entityId);
      if (!target) return false;
      return mutate((payload) => {
        const before = payload.entities.length;
        payload.entities = payload.entities.filter((entry) => id(entry?.id) !== target);
        if (payload.entities.length === before) return false;
        delete payload.defaults[target];
        for (const [key, record] of Object.entries(payload.membership)) {
          if (id(record?.entityId) === target) delete payload.membership[key];
        }
        return true;
      });
    },

    /**
     * Write one world-defaults SECTION. The VALUE is opaque; the NAME is not.
     *
     * @param {string} entityId
     * @param {string} section
     * @param {unknown} value
     * @returns {Promise<boolean>}
     */
    async updateWorldDefaultSection(entityId, section, value) {
      const target = id(entityId);
      if (!target || !knownSection(section)) return false;
      return mutate((payload) => {
        if (payload.entities.every((entry) => id(entry?.id) !== target)) return false;
        const current = plain(payload.defaults[target]);
        payload.defaults[target] = { ...current, id: target, [section]: value };
        return true;
      });
    },

    /**
     * Add the entity to a crafting system: a membership record that INHERITS EVERY SECTION.
     *
     * For a TOOL this also seeds `repairRequirements` from the world defaults, through
     * `seedToolRepairRequirements` - a structural COPY, taken once, never a live parent.
     *
     * @param {string} entityId
     * @param {string} systemId
     * @returns {Promise<boolean>}
     */
    async addToSystem(entityId, systemId) {
      const target = id(entityId);
      const system = id(systemId);
      if (!target || !system) return false;
      return mutate((payload) => {
        if (payload.entities.every((entry) => id(entry?.id) !== target)) return false;
        if (membershipOf(payload, target, system)) return false;
        const record = { entityId: target, systemId: system, inherit: {} };
        if (descriptor.enableable) record.enabled = true;
        if (entityType === 'tool') {
          const seeded = seedToolRepairRequirements(payload.defaults[target] ?? null);
          if (seeded.length > 0) record.repairRequirements = seeded;
        }
        putMembership(payload, record);
        return true;
      });
    },

    /**
     * Remove the entity from a crafting system. This deletes the record AND its overrides;
     * the world entity and every other system are untouched.
     *
     * @param {string} entityId
     * @param {string} systemId
     * @returns {Promise<boolean>}
     */
    async removeFromSystem(entityId, systemId) {
      const target = id(entityId);
      const system = id(systemId);
      if (!target || !system) return false;
      return mutate((payload) => {
        const key = membershipKey(target, system);
        if (!payload.membership[key]) return false;
        delete payload.membership[key];
        return true;
      });
    },

    /**
     * Flip one section's inherit switch, DELEGATING to `setSectionInheritance`.
     *
     * Turning it OFF seeds the local block from the current world value unless a retained
     * one is already there; turning it ON flips the switch alone and leaves the override
     * dormant on disk. Nothing is lost, so there is no confirmation and the row's copy is
     * "fall back".
     *
     * @param {string} entityId
     * @param {string} systemId
     * @param {string} section
     * @param {boolean} inherit
     * @returns {Promise<boolean>}
     */
    async setSectionInherited(entityId, systemId, section, inherit) {
      const target = id(entityId);
      const system = id(systemId);
      if (!target || !system || !knownSection(section) || typeof inherit !== 'boolean') {
        return false;
      }
      return mutate((payload) => {
        const record = membershipOf(payload, target, system);
        if (!record) return false;
        const retained = record[section] !== undefined;
        const next = setSectionInheritance(
          record,
          section,
          inherit,
          payload.defaults[target] ?? null
        );
        // `setSectionInheritance` copies the seed BY REFERENCE, which is the documented
        // contract of every normalized section value. Within ONE payload that would leave the
        // membership override and the world default sharing an object, so a later in-place
        // edit of either would reach through into the other. The DECISION — seed, restore or
        // flip the switch alone — stays delegated; only the copy is deepened, matching what
        // `seedToolRepairRequirements` already does for the seeded tool section.
        if (!inherit && !retained && next[section] !== undefined) {
          next[section] = deepCopy(next[section]);
        }
        putMembership(payload, next);
        return true;
      });
    },

    /**
     * Write one membership SECTION override. The VALUE is opaque; the NAME is not.
     *
     * The switch is NOT flipped here. A stored value with the switch still on is a retained
     * dormant override, which is a legitimate state and the one re-inheriting produces.
     *
     * @param {string} entityId
     * @param {string} systemId
     * @param {string} section
     * @param {unknown} value
     * @returns {Promise<boolean>}
     */
    async updateMembershipSection(entityId, systemId, section, value) {
      const target = id(entityId);
      const system = id(systemId);
      if (!target || !system || !knownSection(section)) return false;
      return mutate((payload) => {
        const record = membershipOf(payload, target, system);
        if (!record) return false;
        putMembership(payload, { ...record, [section]: value });
        return true;
      });
    },

    /**
     * Clone one system's membership record into others.
     *
     * The copy is INDEPENDENT from that point: it is a structural clone of the source
     * record's sections, so a later edit on either side cannot reach the other.
     *
     * NO PROVENANCE FIELD IS STAMPED, and that is a decision rather than an omission. The
     * brief's `from` field has no place in the normalized membership shape, and
     * `normalizeMembership` is an allowlist rebuild: a `from` written here would survive the
     * write, survive the session and vanish on the next `load()`. Recording where a copy came
     * from is a `data-models` change, not a UI one.
     *
     * @param {string} entityId
     * @param {string} fromSystemId
     * @param {string[]} toSystemIds
     * @returns {Promise<boolean>}
     */
    async copyMembership(entityId, fromSystemId, toSystemIds) {
      const target = id(entityId);
      const from = id(fromSystemId);
      const targets = (Array.isArray(toSystemIds) ? toSystemIds : [])
        .map(id)
        .filter((system) => system && system !== from);
      if (!target || !from || targets.length === 0) return false;
      return mutate((payload) => {
        const source = membershipOf(payload, target, from);
        if (!source) return false;
        for (const system of targets) {
          const copy = cloneMembership(source);
          copy.entityId = target;
          copy.systemId = system;
          putMembership(payload, copy);
        }
        return true;
      });
    },
  };

  if (descriptor.enableable) {
    /**
     * Enable or disable the entity in one system. DISABLED IS NOT ABSENT: the record and
     * its overrides survive.
     *
     * @param {string} entityId
     * @param {string} systemId
     * @param {boolean} enabled
     * @returns {Promise<boolean>}
     */
    actions.setEnabled = async (entityId, systemId, enabled) => {
      const target = id(entityId);
      const system = id(systemId);
      if (!target || !system || typeof enabled !== 'boolean') return false;
      return mutate((payload) => {
        const record = membershipOf(payload, target, system);
        if (!record) return false;
        putMembership(payload, { ...record, enabled });
        return true;
      });
    };
  }

  if (descriptor.taggable) {
    /**
     * Replace the world tag list. NOT A SECTION: tags are additive with per-tag muting and
     * carry no inherit switch, so they never pass through `updateWorldDefaultSection`.
     *
     * An empty list normalizes to ABSENCE, matching the `complications` doctrine.
     *
     * @param {string} entityId
     * @param {string[]} tags
     * @returns {Promise<boolean>}
     */
    actions.setWorldTags = async (entityId, tags) => {
      const target = id(entityId);
      if (!target) return false;
      return mutate((payload) => {
        if (payload.entities.every((entry) => id(entry?.id) !== target)) return false;
        const current = plain(payload.defaults[target]);
        payload.defaults[target] = { ...current, id: target, tags: labels(tags) };
        return true;
      });
    };

    /**
     * Replace one system's muted world tags. Muting is PER TAG, which a single per-section
     * switch cannot express - which is why this is an action rather than an inherit flip.
     *
     * @param {string} entityId
     * @param {string} systemId
     * @param {string[]} mutedTags
     * @returns {Promise<boolean>}
     */
    actions.setMutedTags = async (entityId, systemId, mutedTags) => {
      const target = id(entityId);
      const system = id(systemId);
      if (!target || !system) return false;
      return mutate((payload) => {
        const record = membershipOf(payload, target, system);
        if (!record) return false;
        putMembership(payload, { ...record, mutedTags: labels(mutedTags) });
        return true;
      });
    };
  }

  return actions;
}

/**
 * A structural copy of an OPAQUE value.
 *
 * A value that cannot be cloned is preserved verbatim rather than dropped, for the reason
 * `seedToolRepairRequirements` gives: a seed that silently lost a section would be worse than
 * one that shares a reference nobody can mutate structurally.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function deepCopy(value) {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

/**
 * A structural copy of one membership record.
 *
 * `structuredClone` first, for the reason `seedToolRepairRequirements` gives: a section value
 * is opaque, so the only honest copy is a deep one. A value that cannot be cloned is preserved
 * by reference rather than dropped - a copy that silently lost a section would be worse than
 * one that shares a reference nobody can mutate structurally.
 *
 * @param {object} record
 * @returns {object}
 */
function cloneMembership(record) {
  try {
    return structuredClone(record);
  } catch {
    return { ...record, inherit: { ...plain(record.inherit) } };
  }
}

/**
 * Build the write path for all three entity types.
 *
 * @param {object} options
 * @param {Record<string, () => object|null>} options.getStores `{component, essence, tool}`.
 * @returns {Record<string, object>}
 */
export function createWorldScopeActions({ getStores }) {
  const actions = {};
  for (const entityType of Object.keys(WRITE_DESCRIPTORS)) {
    actions[entityType] = createWorldScopeEntityActions({
      entityType,
      getStore: getStores?.[entityType] ?? (() => null),
    });
  }
  return actions;
}
