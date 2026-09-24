/**
 * The three-layer resolution primitive behind Scoped Entity Definitions (issue 1358) and the
 * normalizers for its two records: world entity (identity), world defaults (inherited behaviour),
 * then the per-`(entity, system)` membership record. Resolution is per section, never per field,
 * and section values are opaque here: never walked or cloned, so a normalized record aliases the
 * caller's section values. It runs once per merged row of every read union (issue 1370), where
 * the in-system record wins every key it carries but an inheriting section (issue 1372). The
 * dependency runs one way: this module must not import the per-entity scope modules, pinned by an
 * ESLint `no-restricted-imports` entry and `tests/scoped-definitions.test.js`. Contract:
 * `data-models/spec.md` § Scoped Entity Definitions requirements 1 to 12.
 */

/** The separator between an entity id and a system id in a membership key. */
export const MEMBERSHIP_KEY_SEPARATOR = '|';

/** The key a membership record is addressed by. */
export function membershipKey(entityId, systemId) {
  return `${entityId}${MEMBERSHIP_KEY_SEPARATOR}${systemId}`;
}

function trimmedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Describe one entity's scope. `enableable` is structural: a non-enableable resolver omits
 * `enabled` rather than answering `false`. `worldEnableable` adds a world master switch ANDed with
 * the per-system flag (tools only). `coerceSection` states a per-entity section rule inside
 * normalization, so both resolution branches honour it; `undefined` means absent.
 */
export function defineScope({
  sections,
  enableable = false,
  worldEnableable = false,
  coerceSection = (section, value) => value,
  worldExtras = () => ({}),
  membershipExtras = () => ({}),
}) {
  return Object.freeze({
    sections: Object.freeze([...sections]),
    enableable,
    worldEnableable: enableable && worldEnableable,
    coerceSection,
    worldExtras,
    membershipExtras,
  });
}

/**
 * Copy authored sections, absence-preserving: an unauthored or coerced-away section stays absent
 * (never `null` or a minted default such as `general`), and an unknown key is dropped.
 */
function attachAuthoredSections(source, target, scope) {
  for (const section of scope.sections) {
    if (source[section] === undefined) continue;
    const value = scope.coerceSection(section, source[section]);
    if (value !== undefined) target[section] = value;
  }
}

function normalizeWorldDefault(entry, scope) {
  if (!entry || typeof entry !== 'object') return null;
  const id = trimmedId(entry.id);
  if (!id) return null;
  const normalized = { id };
  // The world master switch is absence-preserving, unlike the membership `enabled` minted below:
  // minting it here would rewrite every world default on load. The resolver reads `!== false`. A
  // world setting, unlike `setFlag`, keeps that absence across a save
  // (`.agents/docs/foundry-and-architecture.md`).
  if (scope.worldEnableable && typeof entry.enabled === 'boolean') {
    normalized.enabled = entry.enabled;
  }
  attachAuthoredSections(entry, normalized, scope);
  return Object.assign(normalized, scope.worldExtras(entry));
}

/**
 * Normalize one entity type's world defaults: total, non-throwing and idempotent. A bad or id-less
 * entry is dropped, and ids are trimmed and de-duplicated first-wins.
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

/** Keep only boolean switches for known sections; an omitted section reads as inheriting. */
function normalizeInherit(raw, sections) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const inherit = {};
  for (const section of sections) {
    if (typeof source[section] === 'boolean') inherit[section] = source[section];
  }
  return inherit;
}

/** One membership record; a dormant override is kept whatever its switch says. */
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
  // Defaults to true: a record created by "add to system" is a member that is on.
  if (scope.enableable) normalized.enabled = entry.enabled !== false;
  attachAuthoredSections(entry, normalized, scope);
  return Object.assign(normalized, scope.membershipExtras(entry));
}

/**
 * Normalize one entity type's membership records, de-duplicated first-wins on the
 * `(entityId, systemId)` pair. A non-enableable entity never carries `enabled`.
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

export function findWorldDefault(worldDefaults, entityId) {
  const id = trimmedId(entityId);
  if (!id || !Array.isArray(worldDefaults)) return null;
  return worldDefaults.find((entry) => entry?.id === id) ?? null;
}

export function findMembership(memberships, entityId, systemId) {
  const entity = trimmedId(entityId);
  const system = trimmedId(systemId);
  if (!entity || !system || !Array.isArray(memberships)) return null;
  return (
    memberships.find((entry) => entry?.entityId === entity && entry?.systemId === system) ?? null
  );
}

/** An absent record inherits every section, so a non-member still previews the world value. */
export function isSectionInherited(membership, section) {
  if (!membership || typeof membership !== 'object') return true;
  return membership.inherit?.[section] !== false;
}

/**
 * Resolve one `(entity, system)` pair. Sections are filled even for a non-member, so `member` is
 * the gate. For a `worldEnableable` scope this is the one place `enabled = worldEnabled &&
 * systemEnabled` is computed (world off wins), with both halves also returned for the authoring
 * screens. An overriding section that stores nothing falls back to the world value, while
 * `inherited[section]` still reports the switch as authored.
 */
export function resolveScopedDefinition(worldDefault, membership, scope) {
  const world = worldDefault && typeof worldDefault === 'object' ? worldDefault : {};
  const record = membership && typeof membership === 'object' ? membership : null;
  const resolved = {};
  const inherited = {};
  for (const section of scope.sections) {
    const inheritsSection = isSectionInherited(record, section);
    inherited[section] = inheritsSection;
    const local = record?.[section];
    // An absent local section is not an override, so falling back is not per-field inheritance.
    const value = inheritsSection || local === undefined ? world[section] : local;
    if (value !== undefined) resolved[section] = value;
  }
  resolved.member = record !== null;
  resolved.inherited = inherited;
  if (scope.enableable) {
    const systemEnabled = record ? record.enabled !== false : false;
    if (scope.worldEnableable) {
      const worldEnabled = isWorldEnabled(worldDefault);
      resolved.worldEnabled = worldEnabled;
      resolved.systemEnabled = systemEnabled;
      resolved.enabled = worldEnabled && systemEnabled;
    } else {
      resolved.enabled = systemEnabled;
    }
  }
  return resolved;
}

/** Only `false` disables at world scope; absent or junk reads as enabled. */
export function isWorldEnabled(worldDefault) {
  return worldDefault?.enabled !== false;
}

/**
 * Re-apply the world master switch over merged rows, since the read union's in-system re-spread
 * overwrites the resolver's AND. A veto only, never turning a row on; the rows array is returned by
 * identity when nothing is disabled.
 */
export function applyWorldEnabledVeto(rows, worldDefaults) {
  const disabled = new Set();
  for (const record of Array.isArray(worldDefaults) ? worldDefaults : []) {
    const recordId = trimmedId(record?.id);
    if (recordId && record.enabled === false) disabled.add(recordId);
  }
  if (disabled.size === 0 || !Array.isArray(rows)) return rows;
  return rows.map((row) =>
    disabled.has(trimmedId(row?.id)) && row.enabled !== false ? { ...row, enabled: false } : row
  );
}

/**
 * Flip one section's switch, answering a new record. Off seeds the local block from the world
 * value unless a retained value exists, which is restored; on flips the switch only and keeps
 * the block dormant.
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

/** The member systems inheriting one section; a system with no membership record is not one. */
export function inheritingSystemIds(memberships, entityId, section) {
  const id = trimmedId(entityId);
  if (!id || !Array.isArray(memberships)) return [];
  return memberships
    .filter((entry) => entry?.entityId === id && isSectionInherited(entry, section))
    .map((entry) => entry.systemId);
}

/** How many systems a world-defaults edit changes, which every such editor states first. */
export function countInheritingSystems(memberships, entityId, section) {
  return inheritingSystemIds(memberships, entityId, section).length;
}
