/** The `1.36.0` pass giving every Essence and Tool id a crafting system holds its world entity and
 * membership (issue 2554), through the save chokepoint's planner in stored corpus order. Pure; it
 * re-keys, merges and deletes nothing, and an unchanged scope is answered by reference. Contract:
 * `destructive-changes-and-migrations/spec.md` § Scoped Identity Reconciliation. */
import {
  applyRegistrationDecisions,
  CONFLICT_REASONS,
  planWorldScopeIdentityRegistration,
  REGISTERED_ENTITY_TYPES,
  registrationRows,
} from '../systems/manager/worldScopeIdentityRegistration.js';
import { membershipKey } from '../systems/scopedDefinitions.js';
import { subKeyEntries } from '../systems/scopedDefinitionStore.js';
import { toolSourceReferences } from '../systems/worldScopeEntityGrouping.js';
import { trimString } from '../utils/scalars.js';
import { isEmbeddedItemUuid } from '../utils/sourceReferenceUnion.js';

import { normalizeEssenceMergeMap } from './mergeEquivalentWorldEssences.js';
import { readScopePayload } from './migrateWorldScopeEntities.js';
import { isPlainObject } from './migrationHelpers.js';
import { buildWorldEssenceEquivalence } from './worldEssenceEquivalence.js';

const SCOPE_KEYS = Object.freeze({ essences: 'essenceScope', tools: 'toolScope' });
const DECISION_BUCKETS = Object.freeze({ create: 'created', adopt: 'adopted' });

/** A Tool row's references as `1.30.0` grouped them, minus embedded Item uuids, fail-closed. */
function toolRowReferences(parseUuid) {
  return (row, system) =>
    toolSourceReferences(row, system?.components).filter(
      (uuid) => !isEmbeddedItemUuid(uuid, parseUuid)
    );
}

function reportEntry(entityType, decided) {
  const entry = { entityType, systemId: decided.systemId, id: decided.id, name: decided.name };
  if (decided.reason) entry.reason = decided.reason;
  if (decided.matchedIds) entry.matchedIds = [...decided.matchedIds];
  return entry;
}

/** A row whose sources match two or more world entities is refused as `ambiguous`. */
function bucketOf(decided) {
  if (decided.decision !== 'conflicting') return DECISION_BUCKETS[decided.decision] ?? null;
  const ambiguous =
    decided.reason === CONFLICT_REASONS.sourceCollision && decided.matchedIds?.length >= 2;
  return ambiguous ? 'ambiguous' : 'conflicting';
}

/** Memberships naming no in-system row: reported, never deleted. */
function unresolvedMemberships(entityType, payload, systems) {
  const rows = new Set();
  for (const system of systems) {
    const systemId = trimString(system?.id);
    for (const id of registrationRows(system, entityType).keys()) {
      rows.add(membershipKey(id, systemId));
    }
  }
  const names = new Map(payload.entities.map((entity) => [entity?.id, trimString(entity?.name)]));
  return subKeyEntries(payload.membership)
    .filter((record) => isPlainObject(record))
    .filter((record) => !rows.has(membershipKey(record.entityId, record.systemId)))
    .map((record) => ({
      entityType,
      entityId: record.entityId,
      systemId: record.systemId,
      name: names.get(record.entityId) || record.entityId,
    }));
}

/** The groups the `1.34.0` equivalence would merge or refuse that hold an essence created here. */
function equivalentEssenceCandidates(data, essenceScope, createdIds) {
  if (createdIds.size === 0) return [];
  const { mergedGroups, refusals } = buildWorldEssenceEquivalence({
    systems: data.systems,
    essenceScope,
    componentScope: data.componentScope,
  });
  return [...mergedGroups, ...refusals]
    .map((group) => ({
      name: group.name ?? group.survivorId,
      ids: [group.survivorId, ...group.loserIds],
      systemIds: [...group.systemIds],
    }))
    .filter((candidate) => candidate.ids.some((id) => createdIds.has(id)));
}

/** The changed scope keys plus the transient `_scopedIdentityReconcileReport`. */
export function reconcileOrphanedScopedIdentities(data, { parseUuid = null } = {}) {
  if (!isPlainObject(data)) return data;
  const systems = Array.isArray(data.systems) ? data.systems : [];
  const retiredIds = Object.keys(normalizeEssenceMergeMap(data.worldEssenceMergeMap).retired);
  const report = {
    created: [],
    adopted: [],
    conflicting: [],
    ambiguous: [],
    unresolvedMemberships: [],
    equivalentEssenceCandidates: [],
  };
  const result = {};
  for (const entityType of REGISTERED_ENTITY_TYPES) {
    const key = SCOPE_KEYS[entityType];
    const payload = readScopePayload(data[key]);
    const decisions = planWorldScopeIdentityRegistration({
      entityType,
      payload,
      systems,
      retiredIds: entityType === 'essences' ? retiredIds : null,
      parseUuid,
      rowReferencesOf: entityType === 'tools' ? toolRowReferences(parseUuid) : null,
    });
    for (const decided of decisions) {
      const bucket = bucketOf(decided);
      if (bucket) report[bucket].push(reportEntry(entityType, decided));
    }
    const writes = decisions.filter((decided) => decided.entity || decided.membership);
    result[key] = writes.length > 0 ? applyRegistrationDecisions(payload, writes) : data[key];
    report.unresolvedMemberships.push(...unresolvedMemberships(entityType, payload, systems));
  }
  const createdEssenceIds = new Set(
    report.created.filter((entry) => entry.entityType === 'essences').map((entry) => entry.id)
  );
  report.equivalentEssenceCandidates = equivalentEssenceCandidates(
    data,
    result.essenceScope,
    createdEssenceIds
  );
  return { ...result, _scopedIdentityReconcileReport: report };
}
