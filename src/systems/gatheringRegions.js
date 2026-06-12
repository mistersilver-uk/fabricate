/**
 * Pure, dependency-free normalization and validation for gathering regions,
 * region settings, region modifiers, and Scene Region mappings. No Foundry
 * globals are referenced here, so the module is testable in isolation and shared
 * by the system normalizer, the region store, import/export validation, and the
 * location resolver.
 *
 * Regions are geography scoped to a crafting system (see the data-models spec
 * delta). `normalizeGatheringRegion` forces `craftingSystemId` to the owning
 * system so a stored or imported region can never claim ownership by a foreign
 * system. Unknown enum values in modifiers and settings are coerced to defaults
 * when READ (so existing data never throws on load) AND reported as invalid by
 * the matching `validate*` helpers when SAVED (so the GM/import boundary rejects
 * them).
 *
 * @typedef {'manual' | 'onPartyTokenEntry' | 'alwaysVisible'} GatheringRegionRevealMode
 * @typedef {'visible' | 'gmOnly'} GatheringRegionModifierVisibility
 */

export const GATHERING_REGION_REVEAL_MODES = Object.freeze(['manual', 'onPartyTokenEntry', 'alwaysVisible']);
export const GATHERING_REGION_MODIFIER_VISIBILITIES = Object.freeze(['visible', 'gmOnly']);
export const GATHERING_REGION_MODIFIER_KINDS = Object.freeze([
  'eventChance',
  'dropRate',
  'yield',
  'difficulty',
  'staminaCost',
  'attemptLimit',
  'custom'
]);
export const GATHERING_REGION_MODIFIER_OPERATIONS = Object.freeze(['add', 'multiply', 'set', 'min', 'max']);

const REVEAL_MODE_SET = new Set(GATHERING_REGION_REVEAL_MODES);
const MODIFIER_VISIBILITY_SET = new Set(GATHERING_REGION_MODIFIER_VISIBILITIES);
const MODIFIER_KIND_SET = new Set(GATHERING_REGION_MODIFIER_KINDS);
const MODIFIER_OPERATION_SET = new Set(GATHERING_REGION_MODIFIER_OPERATIONS);

const DEFAULT_REGION_SETTINGS = Object.freeze({ enabled: false, revealMode: 'manual', modifierVisibility: 'visible' });

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
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(entry => stringOrEmpty(entry).toLowerCase()).filter(Boolean)));
}

let _regionIdFallbackSeq = 0;

// Region ids are non-secret record keys, but we still avoid Math.random() so the
// generator is not flagged as weak cryptography. Foundry's randomID is preferred;
// outside Foundry we use the Web Crypto API, with a deterministic counter as a
// last resort when no crypto source exists.
function defaultRandomID() {
  if (globalThis.foundry?.utils?.randomID) return globalThis.foundry.utils.randomID();
  const cryptoSource = globalThis.crypto;
  if (cryptoSource?.randomUUID) return cryptoSource.randomUUID().replace(/-/g, '').slice(0, 16);
  if (cryptoSource?.getRandomValues) {
    const bytes = new Uint8Array(8);
    cryptoSource.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `region-${(_regionIdFallbackSeq++).toString(36)}`;
}

/**
 * Normalize one region's scene mapping record. Stale scene/scene-region uuids are
 * preserved verbatim so a GM can repair them; automation ignores them elsewhere.
 *
 * @param {object} data
 * @param {{ randomID?: () => string }} [collaborators]
 * @returns {{ id: string, sceneUuid: string, sceneRegionUuid: string }}
 */
export function normalizeGatheringRegionSceneMapping(data = {}, { randomID = defaultRandomID } = {}) {
  return {
    id: data?.id ? String(data.id) : randomID(),
    sceneUuid: stringOrEmpty(data?.sceneUuid),
    sceneRegionUuid: stringOrEmpty(data?.sceneRegionUuid)
  };
}

function normalizeSceneMappingList(value, collaborators) {
  const records = Array.isArray(value) ? value : [];
  return records.map(record => normalizeGatheringRegionSceneMapping(record, collaborators));
}

/**
 * Normalize one region modifier. Unknown enum values coerce to defaults on read
 * (`enabled` true, `visibility` visible, `kind` custom, `operation` add) and a
 * non-finite `value` coerces to 0; `validateGatheringRegionModifiers` reports the
 * unknown originals as invalid at save/import boundaries.
 *
 * @param {object} data
 * @param {{ randomID?: () => string }} [collaborators]
 * @returns {object}
 */
export function normalizeGatheringRegionModifier(data = {}, { randomID = defaultRandomID } = {}) {
  const numericValue = Number(data?.value);
  // Accept the legacy `hazardChance` kind on read (imported or pre-1.0.0-migration
  // region data) and coerce it to `eventChance` so it is not silently dropped to
  // `custom` before the startup migration rewrites it.
  const kind = data?.kind === 'hazardChance' ? 'eventChance' : data?.kind;
  const modifier = {
    id: data?.id ? String(data.id) : randomID(),
    enabled: data?.enabled !== false,
    kind: MODIFIER_KIND_SET.has(kind) ? kind : 'custom',
    operation: MODIFIER_OPERATION_SET.has(data?.operation) ? data.operation : 'add',
    value: Number.isFinite(numericValue) ? numericValue : 0,
    visibility: MODIFIER_VISIBILITY_SET.has(data?.visibility) ? data.visibility : 'visible'
  };
  const note = optionalString(data?.note);
  if (note !== null) modifier.note = note;
  return modifier;
}

function normalizeModifierList(value, collaborators) {
  const records = Array.isArray(value) ? value : [];
  return records.map(record => normalizeGatheringRegionModifier(record, collaborators));
}

/**
 * Normalize one gathering region to its canonical persisted shape. The owning
 * `craftingSystemId` is forced so a region can never claim a foreign owner.
 *
 * @param {object} data
 * @param {{ craftingSystemId?: string, randomID?: () => string }} [collaborators]
 * @returns {object}
 */
export function normalizeGatheringRegion(data = {}, { craftingSystemId = '', randomID = defaultRandomID } = {}) {
  const ownerId = stringOrEmpty(craftingSystemId) || stringOrEmpty(data?.craftingSystemId);
  const region = {
    id: data?.id ? String(data.id) : randomID(),
    craftingSystemId: ownerId,
    name: trimmedOrDefault(data?.name, 'New Region'),
    description: stringOrEmpty(data?.description),
    img: optionalString(data?.img),
    enabled: data?.enabled !== false,
    secret: data?.secret === true,
    biomes: normalizeStringList(data?.biomes),
    sceneMappings: normalizeSceneMappingList(data?.sceneMappings, { randomID }),
    modifiers: normalizeModifierList(data?.modifiers, { randomID })
  };
  const sort = Number(data?.sort);
  if (Number.isFinite(sort)) region.sort = sort;
  return region;
}

/**
 * Normalize a list of regions for one owning system.
 *
 * @param {*} value
 * @param {{ craftingSystemId?: string, randomID?: () => string }} [collaborators]
 * @returns {object[]}
 */
export function normalizeGatheringRegionList(value, collaborators = {}) {
  const records = Array.isArray(value) ? value : [];
  return records.map(record => normalizeGatheringRegion(record, collaborators));
}

/**
 * Validate one region's modifiers against the canonical enum vocabularies. Used
 * at save/import boundaries. Duplicate modifier ids and unknown enums are errors.
 *
 * @param {object[]} modifiers Raw (pre-normalization) modifier list.
 * @param {string} label Region label for messages.
 * @returns {string[]}
 */
export function validateGatheringRegionModifiers(modifiers, label) {
  if (modifiers === undefined || modifiers === null) return [];
  if (!Array.isArray(modifiers)) return [`Region "${label}" modifiers must be an array`];
  const errors = [];
  const seen = new Set();
  for (const modifier of modifiers) {
    const id = stringOrEmpty(modifier?.id);
    if (id) {
      if (seen.has(id)) errors.push(`Region "${label}" has duplicate modifier id "${id}"`);
      seen.add(id);
    }
    if (modifier?.kind !== undefined && !MODIFIER_KIND_SET.has(modifier.kind)) {
      errors.push(`Region "${label}" modifier "${id || 'modifier'}" kind must be one of: ${GATHERING_REGION_MODIFIER_KINDS.join(', ')}`);
    }
    if (modifier?.operation !== undefined && !MODIFIER_OPERATION_SET.has(modifier.operation)) {
      errors.push(`Region "${label}" modifier "${id || 'modifier'}" operation must be one of: ${GATHERING_REGION_MODIFIER_OPERATIONS.join(', ')}`);
    }
    if (modifier?.visibility !== undefined && !MODIFIER_VISIBILITY_SET.has(modifier.visibility)) {
      errors.push(`Region "${label}" modifier "${id || 'modifier'}" visibility must be visible or gmOnly`);
    }
    if (!Number.isFinite(Number(modifier?.value))) {
      errors.push(`Region "${label}" modifier "${id || 'modifier'}" value must be a finite number`);
    }
  }
  return errors;
}

/**
 * Validate one region's scene mappings: unique ids only (stale uuids stay valid
 * so they remain readable for repair).
 *
 * @param {object[]} mappings Raw (pre-normalization) mapping list.
 * @param {string} label Region label for messages.
 * @returns {string[]}
 */
export function validateGatheringRegionSceneMappings(mappings, label) {
  if (mappings === undefined || mappings === null) return [];
  if (!Array.isArray(mappings)) return [`Region "${label}" sceneMappings must be an array`];
  const errors = [];
  const seen = new Set();
  for (const mapping of mappings) {
    const id = stringOrEmpty(mapping?.id);
    if (!id) continue;
    if (seen.has(id)) errors.push(`Region "${label}" has duplicate scene mapping id "${id}"`);
    seen.add(id);
  }
  return errors;
}

/**
 * Validate a single region (id present, modifiers, scene mappings). Operates on
 * raw input so unknown enum values are caught before normalization coerces them.
 *
 * @param {object} region Raw region.
 * @returns {string[]}
 */
export function validateGatheringRegion(region) {
  const label = stringOrEmpty(region?.name) || stringOrEmpty(region?.id) || 'region';
  const errors = [];
  errors.push(...validateGatheringRegionModifiers(region?.modifiers, label));
  errors.push(...validateGatheringRegionSceneMappings(region?.sceneMappings, label));
  return errors;
}

/**
 * Validate a region list: duplicate region ids are rejected at save boundaries;
 * each region's modifiers/scene mappings are validated.
 *
 * @param {*} regions Raw region list.
 * @returns {string[]}
 */
export function validateGatheringRegionList(regions) {
  if (regions === undefined || regions === null) return [];
  if (!Array.isArray(regions)) return ['gatheringRegions must be an array'];
  const errors = [];
  const seen = new Set();
  for (const region of regions) {
    const id = stringOrEmpty(region?.id);
    if (id) {
      if (seen.has(id)) errors.push(`Duplicate region id "${id}"`);
      seen.add(id);
    }
    errors.push(...validateGatheringRegion(region));
  }
  return errors;
}

/**
 * Normalize region settings, coercing unknown/missing values to defaults on read.
 * Only an explicit boolean `true` enables the region/travel subsystem; anything
 * else (missing, non-boolean) coerces to `false` so the subsystem stays opt-in.
 *
 * @param {object} data
 * @returns {{ enabled: boolean, revealMode: GatheringRegionRevealMode, modifierVisibility: GatheringRegionModifierVisibility }}
 */
export function normalizeGatheringRegionSettings(data = {}) {
  return {
    enabled: data?.enabled === true,
    revealMode: REVEAL_MODE_SET.has(data?.revealMode) ? data.revealMode : DEFAULT_REGION_SETTINGS.revealMode,
    modifierVisibility: MODIFIER_VISIBILITY_SET.has(data?.modifierVisibility)
      ? data.modifierVisibility
      : DEFAULT_REGION_SETTINGS.modifierVisibility
  };
}

/**
 * Validate region settings at save/import boundaries: unknown values are invalid
 * (whereas {@link normalizeGatheringRegionSettings} silently coerces on read).
 * `enabled` must be a real boolean when present.
 *
 * @param {object} data
 * @returns {string[]}
 */
export function validateGatheringRegionSettings(data = {}) {
  if (data === undefined || data === null) return [];
  if (typeof data !== 'object' || Array.isArray(data)) return ['gatheringRegionSettings must be an object'];
  const errors = [];
  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
    errors.push('gatheringRegionSettings enabled must be a boolean');
  }
  if (data.revealMode !== undefined && !REVEAL_MODE_SET.has(data.revealMode)) {
    errors.push(`gatheringRegionSettings revealMode must be one of: ${GATHERING_REGION_REVEAL_MODES.join(', ')}`);
  }
  if (data.modifierVisibility !== undefined && !MODIFIER_VISIBILITY_SET.has(data.modifierVisibility)) {
    errors.push('gatheringRegionSettings modifierVisibility must be visible or gmOnly');
  }
  return errors;
}

/**
 * Shared single source of truth for the region/travel subsystem gate. Reads the
 * normalized `enabled` flag off a crafting system. Every gate point (engine,
 * resolver, public API) reads through this helper so the toggle never drifts.
 *
 * @param {object} system Crafting system (normalized or raw).
 * @returns {boolean}
 */
export function isGatheringRegionsEnabled(system) {
  return system?.gatheringRegionSettings?.enabled === true;
}
