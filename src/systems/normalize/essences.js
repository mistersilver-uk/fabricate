/**
 * The essence-definition and essence-quantity normalizers (issue 1713): free pure functions the
 * `CraftingSystemManager` delegates to, so a definition minted, imported or merged anywhere gets
 * one slug derivation. Internal to that aggregate — a private continuation of the `_normalizeSystem`
 * chokepoint, reached only through the manager's delegates and `./components.js`.
 */

export function normalizeEssenceDefinitions(value) {
  if (!Array.isArray(value)) return [];

  const used = new Set();
  const normalized = [];
  for (const entry of value) {
    const def = normalizeEssenceDefinition(entry, used);
    if (!def) continue;
    used.add(def.id);
    normalized.push(def);
  }
  return normalized;
}

/** The GM-authored per-essence colour (issue 917): a bare `--fab-tag-*` palette key, or null.
 * There is deliberately NO `customColor` sibling, because a free hex cannot be guaranteed
 * legible against all seven themes. An unrecognized token renders as the theme accent. */
function normalizeEssenceColorToken(value) {
  const token = String(value ?? '')
    .trim()
    .replace(/^--fab-tag-/, '');
  return token || null;
}

/** The GM-authored per-essence property macro (issue 1036). A SHAPE check, not a macro check:
 * `_looksLikeDocumentUuid` must stay permissive because `parseUuid` still re-interprets legacy
 * four-segment compendium uuids, so a `/^Macro\./` tightening would reject a resolvable macro. */
function normalizeEssencePropertyMacroUuid(value) {
  return looksLikeDocumentUuid(value) ? value : null;
}

export function normalizeEssenceDefinition(entry, usedIds = new Set()) {
  // BOTH branches below are whitelist REBUILDS that drop any key they do not name, so every
  // persisted field must appear in both or it is silently lost on the next save. `enabled` needs
  // NO migration, and adding one would be wrong: this whitelist has never emitted the key, so no
  // stored definition carries one and `entry.enabled !== false` reads absent as `true`.
  if (typeof entry === 'string') {
    const base = entry.trim();
    if (!base) return null;
    return {
      id: uniqueKey(base, usedIds),
      name: base,
      description: '',
      icon: 'fas fa-mortar-pestle',
      colorToken: null,
      enabled: true,
      propertyMacroUuid: null,
      sourceComponentId: null,
      sourceItemUuid: null,
      associatedSystemItemId: null, // transitional alias
    };
  }

  if (!entry || typeof entry !== 'object') return null;

  const rawName = String(entry.name || '').trim();
  const rawId = String(entry.id || '')
    .trim()
    .toLowerCase();
  const seed = rawId || rawName;
  if (!seed) return null;

  const id = uniqueKey(seed, usedIds);
  const sourceComponentId = entry.sourceComponentId || entry.associatedSystemItemId || null;
  const sourceItemUuid = entry.sourceItemUuid || null;
  return {
    id,
    name: rawName || id,
    description: String(entry.description || '').trim(),
    icon: String(entry.icon || '').trim() || 'fas fa-mortar-pestle',
    colorToken: normalizeEssenceColorToken(entry.colorToken),
    enabled: entry.enabled !== false,
    propertyMacroUuid: normalizeEssencePropertyMacroUuid(entry.propertyMacroUuid),
    sourceComponentId,
    sourceItemUuid,
    associatedSystemItemId: sourceComponentId, // transitional alias
  };
}

export function looksLikeDocumentUuid(value) {
  if (!value || typeof value !== 'string') return false;
  return /^(Actor|Item|Scene|JournalEntry|Macro|RollTable|Compendium)\./.test(value);
}

function uniqueKey(seed, usedIds) {
  const cleaned = toKey(seed);
  let key = cleaned || 'essence';
  let i = 2;
  while (usedIds.has(key)) {
    key = `${cleaned || 'essence'}-${i++}`;
  }
  return key;
}

export function toKey(value) {
  // Split/filter/join trims leading & trailing separators without the
  // backtracking-prone `/^-+|-+$/` anchored regex (already-collapsed single
  // dashes mean this yields the same slug).
  return String(value || '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-');
}

export function normalizeEssenceQuantities(essences = {}, validEssenceIds = null) {
  const output = {};
  if (!essences || typeof essences !== 'object') return output;
  const validIds = validEssenceIds instanceof Set ? validEssenceIds : null;

  for (const [rawKey, rawValue] of Object.entries(essences)) {
    const key = String(rawKey || '').trim();
    if (!key) continue;
    if (validIds && !validIds.has(key)) continue;

    const qty = Number(rawValue);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    output[key] = qty;
  }
  return output;
}
