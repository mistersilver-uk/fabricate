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
 * - component tags are additive with per-tag muting and carry NO inherit switch, which is why
 *   `tags` gets its own two write actions and is never routed through
 *   `updateMembershipSection`. THE READ SIDE IS NOT HERE: `resolveComponentTags`
 *   (`componentScope.js`) is what folds the world set, the muted list and the system's own
 *   tags into an effective one, and nothing in this module calls it, because a write path has
 *   no reason to resolve. Said plainly because the earlier wording implied this module had
 *   shipped the read, which PR 6a would have built on.
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
  TOOL_BREAKAGE_AUTHORITIES,
  TOOL_SCOPE,
  TOOL_SECTIONS,
} from '../../../systems/toolScope.js';
import {
  isWorldVocabularyKind,
  normalizeWorldVocabularyEntries,
  planWorldCategoryClear,
  planWorldTagStrip,
  WORLD_VOCABULARY_KINDS,
} from '../../../systems/worldVocabulary.js';

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
 * Whether this entity type's WORLD DEFAULTS carry a master switch.
 *
 * DERIVED from the scope descriptor rather than restated in the table above, on the same rule
 * `worldScopeProjection` follows: `defineScope` decides which types have one, so a second copy
 * here could only ever go stale in the direction that ships a write nothing resolves.
 *
 * @param {object} descriptor
 * @returns {boolean}
 */
function hasWorldEnabled(descriptor) {
  return descriptor?.scope?.worldEnableable === true;
}

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
 * enableable entity, `setWorldEnabled` only on one whose WORLD DEFAULTS carry a master switch,
 * and `setWorldTags` / `setMutedTags` only on a taggable one.
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

  if (hasWorldEnabled(descriptor)) {
    /**
     * Flip the WORLD MASTER SWITCH: enable or disable the entity across every crafting system
     * at once.
     *
     * WORLD OFF WINS. `resolveScopedDefinition` ANDs this flag with each system's own, so a
     * world-disabled entity is off everywhere whatever a system says, and no per-system write
     * can bring it back. Re-enabling here restores whatever each system had already chosen,
     * because this write never touches a membership record.
     *
     * IT IS SEPARATE FROM `setEnabled` RATHER THAN AN OVERLOAD OF IT. `setEnabled` takes a
     * system id and writes one membership record; this takes none and writes the world
     * defaults. Collapsing them onto one name behind an optional argument would make the
     * SCOPE of a destructive-feeling write depend on an argument a caller can forget.
     *
     * `true` IS WRITTEN EXPLICITLY rather than deleting the key. Absence and `true` resolve
     * identically (`isWorldEnabled`), so unlike the world tool-breakage authority this is not a
     * one-way door, and an explicit `true` is what lets a GM see that the switch was
     * deliberately left on.
     *
     * @param {string} entityId
     * @param {boolean} enabled
     * @returns {Promise<boolean>}
     */
    actions.setWorldEnabled = async (entityId, enabled) => {
      const target = id(entityId);
      if (!target || typeof enabled !== 'boolean') return false;
      return mutate((payload) => {
        if (payload.entities.every((entry) => id(entry?.id) !== target)) return false;
        const current = plain(payload.defaults[target]);
        payload.defaults[target] = { ...current, id: target, enabled };
        return true;
      });
    };
  }

  if (entityType === 'tool') {
    /**
     * Author the WORLD tool-breakage authority, or CLEAR it.
     *
     * NOT A SECTION, and not routed through `updateWorldDefaultSection`: the break mode is one
     * value for the whole world rather than a per-entity default, so it has no entity id to
     * address and `knownSection` would refuse the name anyway.
     *
     * THE CLEAR IS A DELETE, NOT AN EMPTY BLOCK, AND THAT IS THE HALF THAT MATTERS. "No world
     * authority" has to stay expressible on disk, because `resolveToolBreakageAuthority` reads
     * the world layer only when the system authored nothing - so a world value that could be
     * set and never unset would be a one-way door. `normalizeWorldToolBreakage` is
     * absence-preserving and a world SETTING preserves key absence (unlike `setFlag`, whose
     * merge resurrects a removed key), so the delete survives the round trip.
     *
     * ANYTHING THAT IS NOT ONE OF THE TWO SHIPPED TOKENS CLEARS. `null` is the caller the
     * tri-state control passes for its Inherit segment, and an unrecognized string is treated
     * the same way rather than stored: the normalizer would drop it on the next `load()`, so
     * storing it would report a write that vanishes.
     *
     * @param {unknown} authority One of {@link TOOL_BREAKAGE_AUTHORITIES}, or anything else
     *   to clear.
     * @returns {Promise<boolean>}
     */
    actions.setWorldToolBreakage = async (authority) =>
      mutate((payload) => {
        if (typeof authority === 'string' && TOOL_BREAKAGE_AUTHORITIES.includes(authority)) {
          payload.toolBreakage = { authority };
        } else {
          delete payload.toolBreakage;
        }
        return true;
      });

    /**
     * Replace one tool's WORLD `repairRequirements` default.
     *
     * ITS OWN ACTION, because `repairRequirements` is deliberately NOT a tool section:
     * `TOOL_SECTIONS` is `['breakage', 'onBreak', 'prerequisites', 'bonus']` and does not name
     * it, so `updateWorldDefaultSection` refuses the name and writes nothing. Without this
     * action the world Tool entry would display a seed source nobody can author.
     *
     * THE WRITE PATH AND THE READ PATH ARE DELIBERATELY ASYMMETRIC. The world holds this list;
     * the MEMBERSHIP RECORD answers it. `seedToolRepairRequirements` copies it once, when a
     * tool is added to a system, and `resolveTool` never reads it back out of the world
     * defaults - so an edit here changes what the NEXT system to adopt this tool starts from,
     * and reaches no system that already has it.
     *
     * The groups are OPAQUE and stored verbatim, exactly as `updateWorldDefaultSection` stores
     * a section value; a non-array is written as an empty list, on the `setWorldTags`
     * precedent.
     *
     * @param {string} entityId
     * @param {unknown} groups The ingredient-group list.
     * @returns {Promise<boolean>}
     */
    actions.setWorldRepairRequirements = async (entityId, groups) => {
      const target = id(entityId);
      if (!target) return false;
      return mutate((payload) => {
        if (payload.entities.every((entry) => id(entry?.id) !== target)) return false;
        const current = plain(payload.defaults[target]);
        payload.defaults[target] = {
          ...current,
          id: target,
          repairRequirements: Array.isArray(groups) ? groups : [],
        };
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
 * Build the WORLD VOCABULARY write path (issue 1392, epic 1357, PR 7a).
 *
 * ## A SEPARATE BUILDER, not a fourth `WRITE_DESCRIPTORS` entry
 *
 * Every verb the generic builder mints - `createEntity`, `addToSystem`, `setSection`,
 * `setSectionInherited`, `setWorldEnabled` - presupposes an entity roster, world defaults and
 * membership records. The World Vocabulary has none of the three: it holds VALUES the scoped
 * entities draw from, not entities. A fourth descriptor would therefore publish a family whose
 * key set is mostly verbs that cannot mean anything here, and `createEntity` would appear on it -
 * which `tests/world-scope-projection.test.js` asserts it does not.
 *
 * ## `removeEntry` IS A TWO-STORE CASCADE, AND THE SECOND WRITE IS GATED ON THE FIRST
 *
 * Deleting a world component category or tag also clears it from the world component DEFAULTS
 * that carry it, in `fabricate.componentScope`. Those are two separate settings and therefore two
 * non-atomic writes, so the ORDER and the GATE are both load-bearing:
 *
 * - DEFAULTS FIRST, AWAITED. A torn write then leaves an unused vocabulary entry - re-deletable,
 *   and leg 1 is idempotent so retrying converges - rather than a world default naming an entry
 *   no vocabulary offers, a state only re-authoring fixes.
 * - THE VOCABULARY WRITE IS ISSUED ONLY ON THE FIRST'S SUCCESS. Ordering alone buys nothing:
 *   `mutate` above has no `try`/`catch`, `VocabularyPanel` calls `onRemove(row)` UNAWAITED, and a
 *   world-setting write really can reject (Foundry gates `Setting` create/update on
 *   `SETTINGS_MODIFY`). The gate is also the only thing that guarantees a remote client sees the
 *   two `updateSetting` broadcasts in the authored order, since Foundry replicates two `Setting`
 *   documents as two independent operations ordered only by the order the writer issued them.
 *
 * A world default's `category` is CLEARED, never reassigned to `general` - `### Component scope`
 * requirement 2 forbids the reassignment, and clearing is what lets each inheriting system's own
 * local value fall through. Nothing else cascades: a system's own `componentCategories`,
 * `categories` and `itemTags` arrays, its components and its recipes are untouched, and a
 * membership record's `mutedTags` entry naming a deleted tag is left in place and is inert.
 *
 * ## IT POSTS NO NOTICE, AND THAT IS DELIBERATE
 *
 * Both legs are wrapped so a rejected `game.settings.set` becomes `false` rather than an
 * unhandled rejection, and the FAILURE IS REPORTED BY THE PAGE (`### GM World Vocabulary Route`
 * requirement 7). This module has no notification seam and must not grow one: Foundry already
 * posts `ui.notifications.error` for a server-refused write, so a second notice here would
 * double-notify on the commonest failure.
 *
 * @param {object} options
 * @param {() => object|null} options.getStore Resolves the world vocabulary store, or `null`.
 * @param {() => object|null} options.getComponentStore Resolves the world COMPONENT scope store,
 *   whose defaults the deletion cascade rewrites, or `null`.
 * @returns {object} The action family.
 */
export function createWorldVocabularyActions({ getStore, getComponentStore }) {
  const resolve = (getter) => {
    try {
      return getter?.() ?? null;
    } catch {
      return null;
    }
  };

  /**
   * Persist one payload, answering `false` for a rejected write rather than throwing.
   *
   * @param {object} store
   * @param {object} payload
   * @returns {Promise<boolean>}
   */
  async function persist(store, payload) {
    try {
      await store.save(payload);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The vocabulary payload in its persisted shape, with one kind guaranteed to be a list.
   *
   * @param {object} store
   * @param {string} kind
   * @returns {{payload: object, list: Array<object>}|null}
   */
  function readVocabulary(store, kind) {
    let payload;
    try {
      payload = plain(store.get?.());
    } catch {
      return null;
    }
    const list = Array.isArray(payload[kind]) ? [...payload[kind]] : [];
    return { payload: { ...payload }, list };
  }

  /**
   * Clear one entry out of the world component defaults, awaited.
   *
   * Answers `true` when there was nothing to rewrite, so a missing component store or an
   * unaffected corpus does not abandon a deletion that has no cascade to perform.
   *
   * @param {string} kind
   * @param {string} entryId
   * @returns {Promise<boolean>}
   */
  async function clearWorldDefaults(kind, entryId) {
    if (kind === 'recipeCategories') return true;
    const componentStore = resolve(getComponentStore);
    if (!componentStore) return true;
    let payload;
    try {
      payload = persistedShape(componentStore.get?.());
    } catch {
      return false;
    }
    const plan =
      kind === 'componentCategories'
        ? planWorldCategoryClear(payload.defaults, entryId)
        : planWorldTagStrip(payload.defaults, entryId);
    if (plan.affectedIds.length === 0) return true;
    // The planner answers a LIST and `save()` re-keys it: `ScopedDefinitionStore#_normalize`
    // reads its sub-keys through `subKeyEntries`, which takes an array or a map, and
    // `_persistedShape` keys the normalized records back off the records themselves.
    payload.defaults = plan.defaults;
    return persist(componentStore, payload);
  }

  return {
    /** The vocabularies this family writes. @type {readonly string[]} */
    kinds: WORLD_VOCABULARY_KINDS,

    /**
     * Add one entry to one vocabulary.
     *
     * Refuses a kind this vocabulary does not carry, a blank name, a reserved general bucket
     * (through the shipped guards, for the two category kinds) and a name whose derived id is
     * already taken. Every refusal answers `false`.
     *
     * @param {string} kind
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    async addEntry(kind, name) {
      if (!isWorldVocabularyKind(kind)) return false;
      const store = resolve(getStore);
      if (!store) return false;
      const [entry] = normalizeWorldVocabularyEntries(kind, [name]);
      if (!entry) return false;
      const read = readVocabulary(store, kind);
      if (!read) return false;
      if (read.list.some((existing) => existing?.id === entry.id)) return false;
      read.payload[kind] = [...read.list, entry];
      return persist(store, read.payload);
    },

    /**
     * Delete one entry from one vocabulary, cascading into the world component defaults first.
     *
     * @param {string} kind
     * @param {string} entryId
     * @returns {Promise<boolean>}
     */
    async removeEntry(kind, entryId) {
      if (!isWorldVocabularyKind(kind)) return false;
      const store = resolve(getStore);
      if (!store) return false;
      const targetId = id(entryId).toLowerCase();
      if (!targetId) return false;
      const read = readVocabulary(store, kind);
      if (!read) return false;
      if (!read.list.some((existing) => existing?.id === targetId)) return false;
      // LEG ONE, AWAITED AND GATED. An abandoned cascade changes nothing at all: the vocabulary
      // write below is never issued.
      const cleared = await clearWorldDefaults(kind, targetId);
      if (!cleared) return false;
      read.payload[kind] = read.list.filter((existing) => existing?.id !== targetId);
      return persist(store, read.payload);
    },
  };
}

/**
 * Build the write path for all three entity types, plus the world vocabulary.
 *
 * @param {object} options
 * @param {Record<string, () => object|null>} options.getStores `{component, essence, tool,
 *   vocabulary}`.
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
  // ATTACHED AFTER THE DESCRIPTOR LOOP, NEVER INSIDE IT (issue 1392). The vocabulary is not a
  // scoped-entity type and mints a different key set entirely; see `createWorldVocabularyActions`.
  actions.vocabulary = createWorldVocabularyActions({
    getStore: getStores?.vocabulary ?? (() => null),
    getComponentStore: getStores?.component ?? (() => null),
  });
  return actions;
}
