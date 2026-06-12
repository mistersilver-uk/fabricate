/**
 * Pure, dependency-free normalization and validation for gathering realms,
 * realm settings, realm modifiers, and Scene Region mappings. No Foundry
 * globals are referenced here, so the module is testable in isolation and shared
 * by the system normalizer, the realm store, import/export validation, and the
 * location resolver.
 *
 * Realms are geography scoped to a crafting system (see the data-models spec
 * delta). `normalizeGatheringRealm` forces `craftingSystemId` to the owning
 * system so a stored or imported realm can never claim ownership by a foreign
 * system. Unknown enum values in modifiers and settings are coerced to defaults
 * when READ (so existing data never throws on load) AND reported as invalid by
 * the matching `validate*` helpers when SAVED (so the GM/import boundary rejects
 * them).
 *
 * @typedef {'manual' | 'onPartyTokenEntry' | 'alwaysVisible'} GatheringRealmRevealMode
 * @typedef {'visible' | 'gmOnly'} GatheringRealmModifierVisibility
 */

export const GATHERING_REALM_REVEAL_MODES = Object.freeze([
  'manual',
  'onPartyTokenEntry',
  'alwaysVisible',
]);
export const GATHERING_REALM_MODIFIER_VISIBILITIES = Object.freeze(['visible', 'gmOnly']);
export const GATHERING_REALM_MODIFIER_KINDS = Object.freeze([
  'eventChance',
  'dropRate',
  'yield',
  'difficulty',
  'staminaCost',
  'attemptLimit',
  'custom',
]);
export const GATHERING_REALM_MODIFIER_OPERATIONS = Object.freeze([
  'add',
  'multiply',
  'set',
  'min',
  'max',
]);

const REVEAL_MODE_SET = new Set(GATHERING_REALM_REVEAL_MODES);
const MODIFIER_VISIBILITY_SET = new Set(GATHERING_REALM_MODIFIER_VISIBILITIES);
const MODIFIER_KIND_SET = new Set(GATHERING_REALM_MODIFIER_KINDS);
const MODIFIER_OPERATION_SET = new Set(GATHERING_REALM_MODIFIER_OPERATIONS);

const DEFAULT_REALM_SETTINGS = Object.freeze({
  enabled: false,
  revealMode: 'manual',
  modifierVisibility: 'visible',
});

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

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => stringOrEmpty(entry).toLowerCase()).filter(Boolean))];
}

let _realmIdFallbackSeq = 0;

// Realm ids are non-secret record keys, but we still avoid Math.random() so the
// generator is not flagged as weak cryptography. Foundry's randomID is preferred;
// outside Foundry we use the Web Crypto API, with a deterministic counter as a
// last resort when no crypto source exists.
function defaultRandomID() {
  if (globalThis.foundry?.utils?.randomID) return globalThis.foundry.utils.randomID();
  const cryptoSource = globalThis.crypto;
  if (cryptoSource?.randomUUID) return cryptoSource.randomUUID().replaceAll('-', '').slice(0, 16);
  if (cryptoSource?.getRandomValues) {
    const bytes = new Uint8Array(8);
    cryptoSource.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `realm-${(_realmIdFallbackSeq++).toString(36)}`;
}

/**
 * Normalize one realm's scene mapping record. Stale scene/scene-region uuids are
 * preserved verbatim so a GM can repair them; automation ignores them elsewhere.
 *
 * @param {object} data
 * @param {{ randomID?: () => string }} [collaborators]
 * @returns {{ id: string, sceneUuid: string, sceneRegionUuid: string }}
 */
export function normalizeGatheringRealmSceneMapping(
  data = {},
  { randomID = defaultRandomID } = {}
) {
  return {
    id: data?.id ? String(data.id) : randomID(),
    sceneUuid: stringOrEmpty(data?.sceneUuid),
    sceneRegionUuid: stringOrEmpty(data?.sceneRegionUuid),
  };
}

function normalizeSceneMappingList(value, collaborators) {
  const records = Array.isArray(value) ? value : [];
  return records.map((record) => normalizeGatheringRealmSceneMapping(record, collaborators));
}

/**
 * Normalize one realm modifier. Unknown enum values coerce to defaults on read
 * (`enabled` true, `visibility` visible, `kind` custom, `operation` add) and a
 * non-finite `value` coerces to 0; `validateGatheringRealmModifiers` reports the
 * unknown originals as invalid at save/import boundaries.
 *
 * @param {object} data
 * @param {{ randomID?: () => string }} [collaborators]
 * @returns {object}
 */
export function normalizeGatheringRealmModifier(data = {}, { randomID = defaultRandomID } = {}) {
  const numericValue = Number(data?.value);
  // Accept the legacy `hazardChance` kind on read (imported or pre-1.0.0-migration
  // realm data) and coerce it to `eventChance` so it is not silently dropped to
  // `custom` before the startup migration rewrites it.
  const kind = data?.kind === 'hazardChance' ? 'eventChance' : data?.kind;
  const modifier = {
    id: data?.id ? String(data.id) : randomID(),
    enabled: data?.enabled !== false,
    kind: MODIFIER_KIND_SET.has(kind) ? kind : 'custom',
    operation: MODIFIER_OPERATION_SET.has(data?.operation) ? data.operation : 'add',
    value: Number.isFinite(numericValue) ? numericValue : 0,
    visibility: MODIFIER_VISIBILITY_SET.has(data?.visibility) ? data.visibility : 'visible',
  };
  const note = optionalString(data?.note);
  if (note !== null) modifier.note = note;
  return modifier;
}

function normalizeModifierList(value, collaborators) {
  const records = Array.isArray(value) ? value : [];
  return records.map((record) => normalizeGatheringRealmModifier(record, collaborators));
}

/**
 * Normalize one gathering realm to its canonical persisted shape. The owning
 * `craftingSystemId` is forced so a realm can never claim a foreign owner.
 *
 * @param {object} data
 * @param {{ craftingSystemId?: string, randomID?: () => string }} [collaborators]
 * @returns {object}
 */
export function normalizeGatheringRealm(
  data = {},
  { craftingSystemId = '', randomID = defaultRandomID } = {}
) {
  const ownerId = stringOrEmpty(craftingSystemId) || stringOrEmpty(data?.craftingSystemId);
  const realm = {
    id: data?.id ? String(data.id) : randomID(),
    craftingSystemId: ownerId,
    name: trimmedOrDefault(data?.name, 'New Realm'),
    description: stringOrEmpty(data?.description),
    img: optionalString(data?.img),
    enabled: data?.enabled !== false,
    secret: data?.secret === true,
    biomes: normalizeStringList(data?.biomes),
    sceneMappings: normalizeSceneMappingList(data?.sceneMappings, { randomID }),
    modifiers: normalizeModifierList(data?.modifiers, { randomID }),
  };
  const sort = Number(data?.sort);
  if (Number.isFinite(sort)) realm.sort = sort;
  return realm;
}

/**
 * Normalize a list of realms for one owning system.
 *
 * @param {*} value
 * @param {{ craftingSystemId?: string, randomID?: () => string }} [collaborators]
 * @returns {object[]}
 */
export function normalizeGatheringRealmList(value, collaborators = {}) {
  const records = Array.isArray(value) ? value : [];
  return records.map((record) => normalizeGatheringRealm(record, collaborators));
}

/**
 * Validate one realm's modifiers against the canonical enum vocabularies. Used
 * at save/import boundaries. Duplicate modifier ids and unknown enums are errors.
 *
 * @param {object[]} modifiers Raw (pre-normalization) modifier list.
 * @param {string} label Realm label for messages.
 * @returns {string[]}
 */
export function validateGatheringRealmModifiers(modifiers, label) {
  if (modifiers === undefined || modifiers === null) return [];
  if (!Array.isArray(modifiers)) return [`Realm "${label}" modifiers must be an array`];
  const errors = [];
  const seen = new Set();
  for (const modifier of modifiers) {
    const id = stringOrEmpty(modifier?.id);
    if (id) {
      if (seen.has(id)) errors.push(`Realm "${label}" has duplicate modifier id "${id}"`);
      seen.add(id);
    }
    if (modifier?.kind !== undefined && !MODIFIER_KIND_SET.has(modifier.kind)) {
      errors.push(
        `Realm "${label}" modifier "${id || 'modifier'}" kind must be one of: ${GATHERING_REALM_MODIFIER_KINDS.join(', ')}`
      );
    }
    if (modifier?.operation !== undefined && !MODIFIER_OPERATION_SET.has(modifier.operation)) {
      errors.push(
        `Realm "${label}" modifier "${id || 'modifier'}" operation must be one of: ${GATHERING_REALM_MODIFIER_OPERATIONS.join(', ')}`
      );
    }
    if (modifier?.visibility !== undefined && !MODIFIER_VISIBILITY_SET.has(modifier.visibility)) {
      errors.push(
        `Realm "${label}" modifier "${id || 'modifier'}" visibility must be visible or gmOnly`
      );
    }
    if (!Number.isFinite(Number(modifier?.value))) {
      errors.push(`Realm "${label}" modifier "${id || 'modifier'}" value must be a finite number`);
    }
  }
  return errors;
}

/**
 * Validate one realm's scene mappings: unique ids only (stale uuids stay valid
 * so they remain readable for repair).
 *
 * @param {object[]} mappings Raw (pre-normalization) mapping list.
 * @param {string} label Realm label for messages.
 * @returns {string[]}
 */
export function validateGatheringRealmSceneMappings(mappings, label) {
  if (mappings === undefined || mappings === null) return [];
  if (!Array.isArray(mappings)) return [`Realm "${label}" sceneMappings must be an array`];
  const errors = [];
  const seen = new Set();
  for (const mapping of mappings) {
    const id = stringOrEmpty(mapping?.id);
    if (!id) continue;
    if (seen.has(id)) errors.push(`Realm "${label}" has duplicate scene mapping id "${id}"`);
    seen.add(id);
  }
  return errors;
}

/**
 * Validate a single realm (id present, modifiers, scene mappings). Operates on
 * raw input so unknown enum values are caught before normalization coerces them.
 *
 * @param {object} realm Raw realm.
 * @returns {string[]}
 */
export function validateGatheringRealm(realm) {
  const label = stringOrEmpty(realm?.name) || stringOrEmpty(realm?.id) || 'realm';
  const errors = [
    ...validateGatheringRealmModifiers(realm?.modifiers, label),
    ...validateGatheringRealmSceneMappings(realm?.sceneMappings, label),
  ];
  return errors;
}

/**
 * Validate a realm list: duplicate realm ids are rejected at save boundaries;
 * each realm's modifiers/scene mappings are validated.
 *
 * @param {*} realms Raw realm list.
 * @returns {string[]}
 */
export function validateGatheringRealmList(realms) {
  if (realms === undefined || realms === null) return [];
  if (!Array.isArray(realms)) return ['gatheringRealms must be an array'];
  const errors = [];
  const seen = new Set();
  for (const realm of realms) {
    const id = stringOrEmpty(realm?.id);
    if (id) {
      if (seen.has(id)) errors.push(`Duplicate realm id "${id}"`);
      seen.add(id);
    }
    errors.push(...validateGatheringRealm(realm));
  }
  return errors;
}

/**
 * Normalize realm settings, coercing unknown/missing values to defaults on read.
 * Only an explicit boolean `true` enables the realm/travel subsystem; anything
 * else (missing, non-boolean) coerces to `false` so the subsystem stays opt-in.
 *
 * @param {object} data
 * @returns {{ enabled: boolean, revealMode: GatheringRealmRevealMode, modifierVisibility: GatheringRealmModifierVisibility }}
 */
export function normalizeGatheringRealmSettings(data = {}) {
  return {
    enabled: data?.enabled === true,
    revealMode: REVEAL_MODE_SET.has(data?.revealMode)
      ? data.revealMode
      : DEFAULT_REALM_SETTINGS.revealMode,
    modifierVisibility: MODIFIER_VISIBILITY_SET.has(data?.modifierVisibility)
      ? data.modifierVisibility
      : DEFAULT_REALM_SETTINGS.modifierVisibility,
  };
}

/**
 * Validate realm settings at save/import boundaries: unknown values are invalid
 * (whereas {@link normalizeGatheringRealmSettings} silently coerces on read).
 * `enabled` must be a real boolean when present.
 *
 * @param {object} data
 * @returns {string[]}
 */
export function validateGatheringRealmSettings(data = {}) {
  if (data === undefined || data === null) return [];
  if (typeof data !== 'object' || Array.isArray(data))
    return ['gatheringRealmSettings must be an object'];
  const errors = [];
  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
    errors.push('gatheringRealmSettings enabled must be a boolean');
  }
  if (data.revealMode !== undefined && !REVEAL_MODE_SET.has(data.revealMode)) {
    errors.push(
      `gatheringRealmSettings revealMode must be one of: ${GATHERING_REALM_REVEAL_MODES.join(', ')}`
    );
  }
  if (
    data.modifierVisibility !== undefined &&
    !MODIFIER_VISIBILITY_SET.has(data.modifierVisibility)
  ) {
    errors.push('gatheringRealmSettings modifierVisibility must be visible or gmOnly');
  }
  return errors;
}

/**
 * Shared single source of truth for the realm/travel subsystem gate. Reads the
 * normalized `enabled` flag off a crafting system. Every gate point (engine,
 * resolver, public API) reads through this helper so the toggle never drifts.
 *
 * @param {object} system Crafting system (normalized or raw).
 * @returns {boolean}
 */
export function isGatheringRealmsEnabled(system) {
  return system?.gatheringRealmSettings?.enabled === true;
}
