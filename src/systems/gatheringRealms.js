/**
 * Pure normalization and validation for gathering realms, realm modifiers, scene mappings and the
 * world travel config, shared by the system normalizer, the realm store, import and export, and the
 * location resolver. Realms are world geography (issue 1282), kept in the `travelConfig` world
 * setting with no owning system. Unknown enum values coerce to defaults on read, so stored data
 * never throws, and the `validate*` helpers reject them at save and import boundaries.
 */

import { stringOrEmpty } from '../utils/scalars.js';

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

// Not `Math.random()`, which Sonar flags: Foundry's `randomID`, else Web Crypto, else a counter.
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

/** One scene mapping; a stale uuid is kept verbatim for the GM to repair. */
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
 * One realm modifier. Unknown values coerce on read (`enabled` true, `visibility` visible,
 * `kind` custom, `operation` add, a non-finite `value` 0); validation rejects them on save.
 */
export function normalizeGatheringRealmModifier(data = {}, { randomID = defaultRandomID } = {}) {
  const numericValue = Number(data?.value);
  // The pre-1.0.0 `hazardChance` reads as `eventChance` rather than falling to `custom`.
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

/** One realm's persisted shape; the retired `craftingSystemId` is dropped on read (issue 1282). */
export function normalizeGatheringRealm(data = {}, { randomID = defaultRandomID } = {}) {
  const realm = {
    id: data?.id ? String(data.id) : randomID(),
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

export function normalizeGatheringRealmList(value, collaborators = {}) {
  const records = Array.isArray(value) ? value : [];
  return records.map((record) => normalizeGatheringRealm(record, collaborators));
}

/** Errors for raw modifiers: duplicate ids, unknown enums and non-finite values. */
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

/** Errors for raw scene mappings: duplicate ids only, as a stale uuid stays valid for repair. */
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

/** Errors for one raw realm, read before normalization coerces the unknown values away. */
export function validateGatheringRealm(realm) {
  const label = stringOrEmpty(realm?.name) || stringOrEmpty(realm?.id) || 'realm';
  const errors = [
    ...validateGatheringRealmModifiers(realm?.modifiers, label),
    ...validateGatheringRealmSceneMappings(realm?.sceneMappings, label),
  ];
  return errors;
}

/** Errors for a raw realm list, duplicate realm ids included. */
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
 * A system's realm settings, participation only (issue 1282): only a boolean `true` opts in. The
 * world-level `revealMode` and `modifierVisibility` are dropped, never passed through, so a
 * reader still on this record cannot quietly read `manual`.
 */
export function normalizeGatheringRealmSettings(data = {}) {
  return { enabled: data?.enabled === true };
}

/** Errors for raw realm settings: a present `enabled` must be a boolean. */
export function validateGatheringRealmSettings(data = {}) {
  if (data === undefined || data === null) return [];
  if (typeof data !== 'object' || Array.isArray(data))
    return ['gatheringRealmSettings must be an object'];
  const errors = [];
  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
    errors.push('gatheringRealmSettings enabled must be a boolean');
  }
  return errors;
}

/**
 * The world travel config (issue 1282): the realms plus their `revealMode` and
 * `modifierVisibility`, coerced on read; a system keeps only `gatheringRealmSettings.enabled`.
 */
export function normalizeTravelConfig(data = {}, collaborators = {}) {
  const raw = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return {
    revealMode: REVEAL_MODE_SET.has(raw.revealMode)
      ? raw.revealMode
      : DEFAULT_REALM_SETTINGS.revealMode,
    modifierVisibility: MODIFIER_VISIBILITY_SET.has(raw.modifierVisibility)
      ? raw.modifierVisibility
      : DEFAULT_REALM_SETTINGS.modifierVisibility,
    realms: normalizeGatheringRealmList(raw.realms, collaborators),
  };
}

/** De-duplicated errors for a raw travel config, rejecting what the normalizer coerces. */
export function validateTravelConfig(data = {}) {
  if (data === undefined || data === null) return [];
  if (typeof data !== 'object' || Array.isArray(data)) return ['travelConfig must be an object'];
  const errors = [];
  if (data.revealMode !== undefined && !REVEAL_MODE_SET.has(data.revealMode)) {
    errors.push(
      `travelConfig revealMode must be one of: ${GATHERING_REALM_REVEAL_MODES.join(', ')}`
    );
  }
  if (
    data.modifierVisibility !== undefined &&
    !MODIFIER_VISIBILITY_SET.has(data.modifierVisibility)
  ) {
    errors.push('travelConfig modifierVisibility must be visible or gmOnly');
  }
  if (data.realms !== undefined) errors.push(...validateGatheringRealmList(data.realms));
  return [...new Set(errors)];
}

/**
 * How realm names are disclosed to players, from the world config; one helper, since a reader of
 * the retired per-system field would silently read `manual`.
 */
export function getRealmRevealMode(travelConfig) {
  return REVEAL_MODE_SET.has(travelConfig?.revealMode)
    ? travelConfig.revealMode
    : DEFAULT_REALM_SETTINGS.revealMode;
}

/** Whether realm modifiers are shown to players (`visible` or `gmOnly`), from the world config. */
export function getRealmModifierVisibility(travelConfig) {
  return MODIFIER_VISIBILITY_SET.has(travelConfig?.modifierVisibility)
    ? travelConfig.modifierVisibility
    : DEFAULT_REALM_SETTINGS.modifierVisibility;
}

/** The one realm and travel gate the engine, resolver and public API all read. */
export function isGatheringRealmsEnabled(system) {
  return system?.gatheringRealmSettings?.enabled === true;
}
