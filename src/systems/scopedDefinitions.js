/**
 * The generic three-layer resolution primitive behind Scoped Entity Definitions (issue 1358, part
 * of epic 1357), and the normalizers for the two records it resolves over.
 *
 * NOT YET LIVE. Nothing in the shipped runtime imports this module: the world-scope migration
 * (epic 1357, PR 3) is what makes it authoritative. Until then `## Component`,
 * `## EssenceDefinition` and `## Tool` describe what the code actually does, and
 * `## Scoped Entity Definitions` describes what this module implements.
 *
 * THE THREE LAYERS, in strict precedence:
 *   1. the World Component / World Essence / World Tool  - identity, one per entity, world scoped;
 *   2. the world defaults                                - the behaviour every system inherits;
 *   3. the system membership record                      - per `(entity, system)` behaviour, and
 *                                                          the fact of membership itself.
 *
 * RESOLUTION IS PER SECTION, NEVER PER FIELD. A section is the unit of the inherit decision AND
 * the unit of the answer: an overriding section's stored value is the whole answer for that
 * section, and no field inside it falls back to the world. That is deliberate rather than
 * incidental - turning a switch OFF SEEDS the local block from the current world value
 * (`setSectionInheritance` below), so an override is complete the moment it exists and a per-field
 * fallback would only ever paper over a record no authoring path can produce.
 *
 * SECTION VALUES ARE OPAQUE HERE. This module never looks inside one, never walks one, and never
 * clones one; the per-entity modules own whatever shape a section carries. That is what makes
 * normalization total on adversarial input: a self-referential section value cannot starve a
 * normalizer that does not descend into it.
 *
 * IT LIVES HERE, beside `modifierLibrary.js` and for the same reason: the eventual callers - the
 * world store, the migration, the export upcast and the GM screens - must agree byte for byte
 * about the normalized shape, and a second implementation of a normalizer is how a persisted shape
 * and its migration drift apart.
 *
 * THE DEPENDENCY RUNS ONE WAY. This module must not depend on the per-entity scope modules that
 * configure it; they depend on it. The boundary is pinned by an ESLint `no-restricted-imports`
 * entry scoped to this file and by a test that parses this file's real import specifiers.
 */

/**
 * The separator between an entity id and a system id in a membership key.
 *
 * @type {string}
 */
export const MEMBERSHIP_KEY_SEPARATOR = '|';

/**
 * The key a membership record is addressed by.
 *
 * @param {string} entityId
 * @param {string} systemId
 * @returns {string}
 */
export function membershipKey(entityId, systemId) {
  return `${entityId}${MEMBERSHIP_KEY_SEPARATOR}${systemId}`;
}

/**
 * Trim a candidate id, answering `null` for anything that is not a usable one.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function trimmedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Describe one entity's scope: the sections it resolves over, whether it carries an `enabled` flag
 * at all, and the per-entity fields its two records carry beside the sections.
 *
 * `enableable` is a STRUCTURAL switch rather than a default. A component carries no enabled flag -
 * the maintainer ruling behind epic 1357 is that component enabling serves no purpose and is not
 * implemented - so the component scope declares `enableable: false` and the resolver OMITS the key
 * from its answer rather than answering `false`. A resolver that computed `enabled: false` for
 * every entity would satisfy every statement about the record and still hand a screen the exact
 * value it would read to draw the toggle that ruling removes.
 *
 * @param {object} descriptor
 * @param {string[]} descriptor.sections Section names, in the order they are answered.
 * @param {boolean} [descriptor.enableable] Whether the entity carries an `enabled` flag.
 * @param {(entry: object) => object} [descriptor.worldExtras] Per-entity world-default fields.
 * @param {(entry: object) => object} [descriptor.membershipExtras] Per-entity membership fields.
 * @returns {Readonly<object>}
 */
export function defineScope({
  sections,
  enableable = false,
  worldExtras = () => ({}),
  membershipExtras = () => ({}),
}) {
  return Object.freeze({
    sections: Object.freeze([...sections]),
    enableable,
    worldExtras,
    membershipExtras,
  });
}

/**
 * Copy the authored sections of a raw record onto a normalized one.
 *
 * ABSENCE-PRESERVING, in both directions: an unauthored section stays ABSENT rather than becoming
 * `null` or a minted default, and an unknown section key is DROPPED rather than carried. That
 * matters most for the component category, whose absent world default must never normalize to the
 * reserved `general` bucket (`## CraftingSystem` requirement 6a) - treating it as authored would
 * silently reset every inheriting system's category on the first resolve.
 *
 * @param {object} source
 * @param {object} target
 * @param {readonly string[]} sections
 */
function attachAuthoredSections(source, target, sections) {
  for (const section of sections) {
    if (source[section] !== undefined) target[section] = source[section];
  }
}

/**
 * Normalize one world-defaults record, or `null` when the entry cannot be one.
 *
 * @param {unknown} entry
 * @param {Readonly<object>} scope
 * @returns {object|null}
 */
function normalizeWorldDefault(entry, scope) {
  if (!entry || typeof entry !== 'object') return null;
  const id = trimmedId(entry.id);
  if (!id) return null;
  const normalized = { id };
  attachAuthoredSections(entry, normalized, scope.sections);
  return Object.assign(normalized, scope.worldExtras(entry));
}

/**
 * Normalize the world defaults for one entity type.
 *
 * TOTAL, NON-THROWING AND IDEMPOTENT, on the `normalizeModifierLibrary` contract
 * (`## ModifierLibrary` requirement 2): a non-array answers an empty list, a non-object or id-less
 * entry is DROPPED rather than repaired, ids are trimmed and de-duplicated first-wins, and an
 * unknown section key is dropped. Idempotence is required rather than incidental - the store, the
 * migration and the export upcast will each normalize possibly-already-normalized data.
 *
 * @param {unknown} raw
 * @param {Readonly<object>} scope
 * @returns {Array<object>}
 */
export function normalizeWorldDefaults(raw, scope) {
  const entries = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    const record = normalizeWorldDefault(entry, scope);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    normalized.push(record);
  }
  return normalized;
}

/**
 * Normalize a membership record's inherit map.
 *
 * An unknown key is dropped, and a non-boolean value is dropped rather than coerced. A map that
 * OMITS a section reads as INHERITING it, because that is the state a record created by "add to
 * system" is in - so a dropped key and an authored `true` mean the same thing.
 *
 * @param {unknown} raw
 * @param {readonly string[]} sections
 * @returns {{[section: string]: boolean}}
 */
function normalizeInherit(raw, sections) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const inherit = {};
  for (const section of sections) {
    if (typeof source[section] === 'boolean') inherit[section] = source[section];
  }
  return inherit;
}

/**
 * Normalize one membership record, or `null` when the entry cannot be one.
 *
 * A DORMANT OVERRIDE IS RETAINED. A section value is copied across whether or not its switch says
 * the section is inherited, because re-inheriting flips the switch only: the local block stays on
 * disk and re-overriding restores it rather than re-seeding from the world.
 *
 * @param {unknown} entry
 * @param {Readonly<object>} scope
 * @returns {object|null}
 */
function normalizeMembership(entry, scope) {
  if (!entry || typeof entry !== 'object') return null;
  const entityId = trimmedId(entry.entityId);
  const systemId = trimmedId(entry.systemId);
  if (!entityId || !systemId) return null;
  const normalized = {
    entityId,
    systemId,
    inherit: normalizeInherit(entry.inherit, scope.sections),
  };
  // Read as `!== false` so the flag DEFAULTS TO TRUE, matching `## EssenceDefinition`
  // requirement 6: a record created by "add to system" is a member that is on.
  if (scope.enableable) normalized.enabled = entry.enabled !== false;
  attachAuthoredSections(entry, normalized, scope.sections);
  return Object.assign(normalized, scope.membershipExtras(entry));
}

/**
 * Normalize the system membership records for one entity type.
 *
 * De-duplication is on the `(entityId, systemId)` PAIR, first wins, because that pair is the
 * record's identity. An `enabled` key on a non-enableable entity is dropped here rather than
 * preserved: the component path has no such field, and adversarial input must not mint one.
 *
 * @param {unknown} raw
 * @param {Readonly<object>} scope
 * @returns {Array<object>}
 */
export function normalizeMemberships(raw, scope) {
  const entries = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    const record = normalizeMembership(entry, scope);
    if (!record) continue;
    const key = membershipKey(record.entityId, record.systemId);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(record);
  }
  return normalized;
}

/**
 * Find one entity's world defaults in a normalized list.
 *
 * @param {Array<object>} worldDefaults
 * @param {string} entityId
 * @returns {object|null}
 */
export function findWorldDefault(worldDefaults, entityId) {
  const id = trimmedId(entityId);
  if (!id || !Array.isArray(worldDefaults)) return null;
  return worldDefaults.find((entry) => entry?.id === id) ?? null;
}

/**
 * Find one `(entity, system)` membership record in a normalized list.
 *
 * @param {Array<object>} memberships
 * @param {string} entityId
 * @param {string} systemId
 * @returns {object|null}
 */
export function findMembership(memberships, entityId, systemId) {
  const entity = trimmedId(entityId);
  const system = trimmedId(systemId);
  if (!entity || !system || !Array.isArray(memberships)) return null;
  return (
    memberships.find((entry) => entry?.entityId === entity && entry?.systemId === system) ?? null
  );
}

/**
 * Whether a membership record inherits a section.
 *
 * An ABSENT record inherits everything: a non-member has nothing of its own, and its sections are
 * still answered from the world defaults so the world-scope preview can render them.
 *
 * @param {object|null} membership
 * @param {string} section
 * @returns {boolean}
 */
export function isSectionInherited(membership, section) {
  if (!membership || typeof membership !== 'object') return true;
  return membership.inherit?.[section] !== false;
}

/**
 * Resolve one `(entity, system)` pair over the three layers.
 *
 * SECTIONS ARE POPULATED EVEN FOR A NON-MEMBER, falling to the world-defaults branch, and that is
 * intentional: the world-scope preview resolves with no system at all and needs exactly those
 * values. `member` is therefore the gate a caller must check - a populated section says nothing
 * about whether the entity exists in the system.
 *
 * `enabled` is answered ONLY for an enableable entity, and answers `false` for a non-member
 * because it is NOT A MEMBER rather than because it inherited an off: a world default carries no
 * enabled flag, and disabling world-wide is N membership edits, never a fourth layer.
 *
 * @param {object|null} worldDefault
 * @param {object|null} membership
 * @param {Readonly<object>} scope
 * @returns {{member: boolean, inherited: {[section: string]: boolean}, enabled?: boolean}}
 */
export function resolveScopedDefinition(worldDefault, membership, scope) {
  const world = worldDefault && typeof worldDefault === 'object' ? worldDefault : {};
  const record = membership && typeof membership === 'object' ? membership : null;
  const resolved = {};
  const inherited = {};
  for (const section of scope.sections) {
    const inheritsSection = isSectionInherited(record, section);
    inherited[section] = inheritsSection;
    const value = inheritsSection ? world[section] : record?.[section];
    if (value !== undefined) resolved[section] = value;
  }
  resolved.member = record !== null;
  resolved.inherited = inherited;
  if (scope.enableable) resolved.enabled = record ? record.enabled !== false : false;
  return resolved;
}

/**
 * Flip one section's inherit switch on a membership record, answering a NEW record.
 *
 * Turning a switch OFF (`inherit: false`) SEEDS the local block from the current world value, so
 * no field is blank on first override - unless the record already carries a retained value, which
 * is RESTORED rather than re-seeded. Turning it back ON flips the switch ONLY: the local block
 * stays on disk, dormant and ignored by resolution. Nothing is lost, so no confirmation is
 * required and the inherit row's copy stays "fall back".
 *
 * @param {object} membership The normalized record to change.
 * @param {string} section
 * @param {boolean} inherit
 * @param {object|null} [worldDefault] The world defaults the seed is taken from.
 * @returns {object}
 */
export function setSectionInheritance(membership, section, inherit, worldDefault = null) {
  const record = membership && typeof membership === 'object' ? membership : {};
  const next = { ...record, inherit: { ...record.inherit, [section]: inherit } };
  if (inherit) return next;
  if (next[section] === undefined) {
    const world = worldDefault && typeof worldDefault === 'object' ? worldDefault : {};
    if (world[section] !== undefined) next[section] = world[section];
  }
  return next;
}

/**
 * The systems that inherit one section of one entity's world defaults.
 *
 * A system with NO membership record is NOT counted: the entity does not exist there, so editing
 * the world default changes nothing for it.
 *
 * @param {Array<object>} memberships
 * @param {string} entityId
 * @param {string} section
 * @returns {string[]}
 */
export function inheritingSystemIds(memberships, entityId, section) {
  const id = trimmedId(entityId);
  if (!id || !Array.isArray(memberships)) return [];
  return memberships
    .filter((entry) => entry?.entityId === id && isSectionInherited(entry, section))
    .map((entry) => entry.systemId);
}

/**
 * How many systems a world-defaults edit will change.
 *
 * Every world-defaults editor states this before the change lands, because editing one value
 * changes behaviour in every inheriting system at once.
 *
 * @param {Array<object>} memberships
 * @param {string} entityId
 * @param {string} section
 * @returns {number}
 */
export function countInheritingSystems(memberships, entityId, section) {
  return inheritingSystemIds(memberships, entityId, section).length;
}
