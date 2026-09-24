import {
  defineScope,
  isSectionInherited,
  normalizeMemberships,
  normalizeWorldDefaults,
  resolveScopedDefinition,
} from './scopedDefinitions.js';
import { unionScopedDefinitions } from './scopedDefinitionStore.js';

/**
 * The component half of Scoped Entity Definitions (issue 1358). `category` and `essences` are
 * sections whose inherit switch the read union honours (issues 1371, 1372). A component carries no
 * `enabled` flag, structurally, so the resolver omits the key. `tags` is not a section: additive
 * with per-tag muting, and the union's in-system re-spread discards the resolved set, so world tags
 * and mutes are authored but unconsumed. Neither helper reads a vocabulary; each takes the world
 * value as an argument. Contract: `data-models/spec.md` § Scoped Entity Definitions, Component
 * scope.
 */

/**
 * The component sections, and the only keys an `inherit` map may carry. An absent switch reads as
 * inheriting, so a new section needs a migration that marks every existing record (`1.32.0`).
 */
export const COMPONENT_SECTIONS = Object.freeze(['category', 'essences']);

/**
 * The `essences` section's shape rule: trimmed ids to positive finite quantities, in a new object;
 * a non-object is absence. `{}` is an authored "no essences", not absence.
 */
export function normalizeComponentEssenceMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const normalized = {};
  for (const [rawId, rawQuantity] of Object.entries(raw)) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    const quantity = Number(rawQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    normalized[id] = quantity;
  }
  return normalized;
}

/** Equal normalized quantities, absence reading as empty; the `1.32.0` migration's test. */
export function componentEssenceMapsEqual(left, right) {
  const a = normalizeComponentEssenceMap(left) ?? {};
  const b = normalizeComponentEssenceMap(right) ?? {};
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((id) => b[id] === a[id]);
}

function normalizeLabels(raw) {
  const entries = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const labels = [];
  for (const entry of entries) {
    const label = typeof entry === 'string' ? entry.trim() : '';
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/** An empty label list normalizes to absent; no reader may tell the two apart. */
function attachLabels(target, key, raw) {
  const labels = normalizeLabels(raw);
  if (labels.length > 0) target[key] = labels;
  return target;
}

function isAuthoredCategory(category) {
  return typeof category === 'string' && category.trim().length > 0;
}

/** Coerce at normalization, so an overriding system's stored value obeys the same rule. */
function coerceComponentSection(section, value) {
  if (section === 'category') return isAuthoredCategory(value) ? value.trim() : undefined;
  if (section === 'essences') return normalizeComponentEssenceMap(value);
  return value;
}

export const COMPONENT_SCOPE = defineScope({
  sections: COMPONENT_SECTIONS,
  enableable: false,
  coerceSection: coerceComponentSection,
  worldExtras: (entry) => attachLabels({}, 'tags', entry.tags),
  membershipExtras: (entry) => {
    const extras = attachLabels({}, 'tags', entry.tags);
    return attachLabels(extras, 'mutedTags', entry.mutedTags);
  },
});

/**
 * Normalize the world component defaults. An unauthored category stays absent and is never
 * `general`, which must not persist and would reset every inheriting system's category.
 */
export function normalizeComponentWorldDefaults(raw) {
  return normalizeWorldDefaults(raw, COMPONENT_SCOPE);
}

/** Normalize the component memberships; an input `enabled` key is dropped. */
export function normalizeComponentMemberships(raw) {
  return normalizeMemberships(raw, COMPONENT_SCOPE);
}

/**
 * The inheriting branch's category: an authored world category wins, else the local one, else
 * absence, never the reserved `general`.
 */
export function resolveComponentCategory(worldCategory, localCategory) {
  if (isAuthoredCategory(worldCategory)) return worldCategory.trim();
  if (isAuthoredCategory(localCategory)) return localCategory.trim();
  return;
}

/** The effective tags: world tags minus the record's `mutedTags`, plus its own `tags`. */
export function resolveComponentTags(worldTags, membership = null) {
  const record = membership && typeof membership === 'object' ? membership : {};
  const muted = new Set(normalizeLabels(record.mutedTags));
  const effective = normalizeLabels(worldTags).filter((tag) => !muted.has(tag));
  const seen = new Set(effective);
  for (const tag of normalizeLabels(record.tags)) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    effective.push(tag);
  }
  return effective;
}

/**
 * Resolve one `(component, system)` pair: `category` and `essences` when authored, `tags`,
 * `member` (the gate, since sections fill for a non-member) and `inherited`. `'enabled' in result`
 * is `false`.
 */
export function resolveComponent(worldDefault, membership) {
  const world = worldDefault && typeof worldDefault === 'object' ? worldDefault : {};
  const record = membership && typeof membership === 'object' ? membership : null;
  const resolved = resolveScopedDefinition(world, record, COMPONENT_SCOPE);
  if (isSectionInherited(record, 'category')) {
    const category = resolveComponentCategory(world.category, record?.category);
    if (category === undefined) delete resolved.category;
    else resolved.category = category;
  }
  resolved.tags = resolveComponentTags(world.tags, record);
  return resolved;
}

/**
 * The read union for components, membership-filtered and resolved; see `unionScopedDefinitions`.
 * The in-system record still supplies `salvage`, `difficulty`, `complications` and every key it
 * carries except an inheriting section, so a world-scope writer must not assume world-wins.
 */
export function resolveComponentScope(worldCorpus, systemId, systemComponents) {
  return unionScopedDefinitions({
    corpus: worldCorpus,
    systemId,
    systemDefinitions: systemComponents,
    resolve: resolveComponent,
    entityType: 'components',
  });
}
