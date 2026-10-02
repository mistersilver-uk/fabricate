/**
 * The pure half of an import's world-scope entity merge (issue 1364): the corpus readers and the
 * destination re-check of every world default the import would add. The merge loops live in
 * `CompendiumImporter.js`. The merge is three per-layer merges (`entities` and `defaults` by
 * `id`, `membership` by `(entityId, systemId)`), the destination winning every collision, so
 * only an added default is re-checked, section by section, against the merged corpus.
 *
 * That corpus is an in-memory union, because membership is written after defaults: persisted
 * membership alone would make the every-member precondition vacuously true for a minted entity.
 * Incoming records count as one extra system, which may over-decline but never under-declines,
 * and declining is lossless. When no component roster will be written, every section carrying a
 * component reference is declined rather than seeded dangling. Contract: `import-export/spec.md`
 * § World-scope entity merge on import and § World-default constraint re-check on import.
 */

import { isPlainObject } from '../utils/scalars.js';

import { membershipKey } from './scopedDefinitions.js';
import { subKeyEntries } from './scopedDefinitionStore.js';
import {
  FALLBACK_EXPOSED_SECTIONS,
  isWorldAddressable,
  referencedComponentIds,
  RESERVED_CATEGORY,
  sectionIsAuthoredBy,
  WORLD_DEFAULT_SECTIONS,
} from './worldScopeDefaults.js';
import { ESSENCE_EFFECT_SOURCE_FIELDS } from './worldScopeEntityGrouping.js';

/**
 * The token incoming membership records count under, never the payload's own system id: copy mode
 * has not minted the destination id, and keep mode may have matched a system by name.
 */
export const INCOMING_SYSTEM_TOKEN = '__fabricate.incoming__';

function trimmedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The records of one slice sub-key, in either shape, dropping non-records. */
export function sliceRecords(slice, subKey) {
  if (!isPlainObject(slice)) return [];
  return subKeyEntries(slice[subKey]).filter((record) => isPlainObject(record));
}

/** Persisted membership plus every incoming record under {@link INCOMING_SYSTEM_TOKEN}. */
export function mergedMembershipUnion(persistedSlice, incomingSlice) {
  const union = [];
  for (const record of sliceRecords(persistedSlice, 'membership')) {
    const entityId = trimmedId(record.entityId);
    const systemId = trimmedId(record.systemId);
    if (entityId && systemId) union.push({ entityId, systemId, record });
  }
  for (const record of sliceRecords(incomingSlice, 'membership')) {
    const entityId = trimmedId(record.entityId);
    if (entityId) union.push({ entityId, systemId: INCOMING_SYSTEM_TOKEN, record });
  }
  return union;
}

/** The persisted and incoming `entities` ids, unioned. */
export function mergedEntityIds(persistedSlice, incomingSlice) {
  const ids = new Set();
  for (const slice of [persistedSlice, incomingSlice]) {
    for (const entity of sliceRecords(slice, 'entities')) {
      const id = trimmedId(entity.id);
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * The first reference the merged roster cannot address, or `null`. A `null` roster is
 * undecidable, so only a dotted document UUID passes.
 */
function firstUnaddressable(references, worldComponentIds) {
  for (const reference of references) {
    const value = trimmedId(reference);
    if (!value) continue;
    const addressable = worldComponentIds
      ? isWorldAddressable(value, worldComponentIds)
      : value.includes('.');
    if (!addressable) return value;
  }
  return null;
}

/** Decide one section of an incoming world default against the merged destination corpus. */
function sectionPasses({
  entityType,
  section,
  value,
  worldComponentIds,
  componentMembers,
  entityMemberSystems,
}) {
  if (entityType === 'components') {
    if (section === 'essences') return { ok: true };
    // A world `general` would reset every inheriting system's category.
    return value === RESERVED_CATEGORY ? { ok: false, referenceValue: section } : { ok: true };
  }

  if (entityType === 'essences') {
    if (section === 'macro') return { ok: true };
    const effectSource = isPlainObject(value) ? value : {};
    const offending = firstUnaddressable(
      ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => effectSource[field]),
      worldComponentIds
    );
    return offending ? { ok: false, referenceValue: offending } : { ok: true };
  }

  if (section === 'breakage') return { ok: true };

  if (section === 'onBreak') {
    const target = isPlainObject(value) ? value.replacementTarget : null;
    if (!isPlainObject(target) || target.type !== 'component') return { ok: true };
    const offending = firstUnaddressable([target.componentId], worldComponentIds);
    return offending ? { ok: false, referenceValue: offending } : { ok: true };
  }

  // `repairRequirements` is a seed, copied once, so a dangling group would bake into a future
  // system's repair recipe; with no decidable roster it is declined outright.
  if (!Array.isArray(value) || value.length === 0) return { ok: true };
  if (!worldComponentIds) return { ok: false, referenceValue: section };
  for (const componentId of referencedComponentIds(value)) {
    if (!worldComponentIds.has(componentId)) return { ok: false, referenceValue: componentId };
    // Every member system of the tool must also hold the component.
    for (const systemId of entityMemberSystems) {
      if (!componentMembers.has(membershipKey(componentId, systemId))) {
        return { ok: false, referenceValue: componentId };
      }
    }
  }
  return { ok: true };
}

/**
 * Re-check one incoming world default per section, answering the surviving record (`null` when
 * only `id` is left) and the declined sections; the entity and memberships are untouched.
 * `worldComponentIds` is `null` when the roster is undecidable; `membershipUnion` is this entity
 * type's, and `componentMembers` is keyed `(componentId, systemId)`.
 */
export function recheckWorldDefault({
  entityType,
  record,
  worldComponentIds,
  membershipUnion,
  componentMembers,
}) {
  const declined = [];
  const entityId = trimmedId(record?.id);
  if (!entityId) return { record: null, declined };

  const members = membershipUnion.filter((entry) => entry.entityId === entityId);
  const entityMemberSystems = [...new Set(members.map((entry) => entry.systemId))];

  const next = { id: entityId };
  for (const section of WORLD_DEFAULT_SECTIONS[entityType] ?? []) {
    const value = record[section];
    if (value === undefined) continue;

    // The every-member precondition, through the migration's own predicate: key presence is not
    // enough, since a hand-authored `category: ''` is coerced to absence and falls back.
    if (
      FALLBACK_EXPOSED_SECTIONS.has(section) &&
      members.some((entry) => !sectionIsAuthoredBy(entry.record, entityType, section))
    ) {
      declined.push({ section, referenceValue: section });
      continue;
    }

    const verdict = sectionPasses({
      entityType,
      section,
      value,
      worldComponentIds,
      componentMembers,
      entityMemberSystems,
    });
    if (verdict.ok) next[section] = value;
    else declined.push({ section, referenceValue: verdict.referenceValue ?? section });
  }

  const authored = Object.keys(next).filter((key) => key !== 'id');
  return { record: authored.length > 0 ? next : null, declined };
}

/** The component membership union as `(componentId, systemId)` keys. */
export function membershipKeySet(membershipUnion) {
  return new Set(membershipUnion.map((entry) => membershipKey(entry.entityId, entry.systemId)));
}
