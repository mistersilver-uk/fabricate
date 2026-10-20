/** The world identity registration planner for Essences and Tools (issue 2554): per distinct row id
 * of each system it decides `create`, `adopt`, `registered` or `conflicting` against one persisted
 * scope payload, without writing it. Pure; the save chokepoint and the `1.36.0` migration share it.
 * Contract: `data-models/spec.md` § Scoped Entity Definitions requirements 17 and 17a. */
import {
  buildMembershipRecord,
  toolBonusOverride,
  toolPrerequisitesOverride,
} from '../../migration/migrateWorldScopeEntities.js';
import { cloneJson, isPlainObject, trimString } from '../../utils/scalars.js';
import { getItemMatchUuids, isEmbeddedItemUuid } from '../../utils/sourceReferenceUnion.js';
import { ESSENCE_SECTIONS, resolveEssence } from '../essenceScope.js';
import { membershipKey } from '../scopedDefinitions.js';
import { subKeyEntries, unionScopedDefinitions } from '../scopedDefinitionStore.js';
import { resolveTool, TOOL_SECTIONS } from '../toolScope.js';
import { ESSENCE_EFFECT_SOURCE_FIELDS, identityOf } from '../worldScopeEntityGrouping.js';

import {
  addToRoster,
  allSharing,
  indexRoster,
  sharesSource,
  sourceKeys,
} from './worldScopeRoster.js';

export const REGISTERED_ENTITY_TYPES = Object.freeze(['essences', 'tools']);

export const CONFLICT_REASONS = Object.freeze({
  sourceCollision: 'sourceCollision',
  idCollision: 'idCollision',
  retiredId: 'retiredId',
  emptyOverride: 'emptyOverride',
});

const SECTIONS = Object.freeze({ essences: ESSENCE_SECTIONS, tools: TOOL_SECTIONS });
const RESOLVERS = Object.freeze({ essences: resolveEssence, tools: resolveTool });
/** The two tool sections a membership cannot express an empty override for. */
const EMPTY_INEXPRESSIBLE = Object.freeze(['breakage', 'onBreak']);

/** A system's rows of one type, first row per trimmed id. */
export function registrationRows(system, entityType) {
  const rows =
    entityType === 'tools'
      ? system?.tools // ratchet-exempt(world-scope): writer — registration reads the persisted rows
      : system?.essenceDefinitions; // ratchet-exempt(world-scope): writer — registration reads the persisted rows
  const distinct = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = isPlainObject(row) ? trimString(row.id) : '';
    if (id && !distinct.has(id)) distinct.set(id, row);
  }
  return distinct;
}

/** A Tool's matchable references: its own source links minus embedded Item uuids, fail-closed. */
export function toolReferencesOf(parseUuid) {
  return (record) =>
    getItemMatchUuids(record).filter((uuid) => !isEmbeddedItemUuid(uuid, parseUuid));
}

function sameValue(left, right) {
  return canonical(left) === canonical(right);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : Number(a > b)));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Whether the section's world value, written onto the row by the read union, leaves the row's
 * shipped fields as they were. */
const SECTION_UNCHANGED = Object.freeze({
  effectSource: (row, merged) =>
    ESSENCE_EFFECT_SOURCE_FIELDS.every((field) => sameValue(row[field], merged[field])),
  macro: (row, merged) => sameValue(row.propertyMacroUuid, merged.propertyMacroUuid),
  breakage: (row, merged) => sameValue(row.breakage, merged.breakage),
  onBreak: (row, merged) => sameValue(row.onBreak, merged.onBreak),
  prerequisites: (row, merged) =>
    sameValue(
      toolPrerequisitesOverride(row.prerequisites),
      toolPrerequisitesOverride(merged.prerequisites)
    ),
  bonus: (row, merged) => sameValue(toolBonusOverride(row.bonus), toolBonusOverride(merged.bonus)),
});

/** The row as the read union's merge answers it when every section inherits `worldDefault`. */
function inheritingRow(entityType, row, id, systemId, worldDefault) {
  const corpus = {
    entities: [{ id }],
    defaults: [worldDefault],
    membership: [{ entityId: id, systemId, inherit: {}, enabled: true }],
  };
  return unionScopedDefinitions({
    corpus,
    systemId,
    systemDefinitions: [{ ...row, id }],
    resolve: RESOLVERS[entityType],
    entityType,
  })[0];
}

/** A created entity's membership: every section inherits, carrying the row's own `enabled`. */
function createdMembership(entityType, row, id, systemId) {
  const membership = { entityId: id, systemId, inherit: {}, enabled: row.enabled !== false };
  if (entityType === 'tools' && Array.isArray(row.repairRequirements)) {
    membership.repairRequirements = cloneJson(row.repairRequirements);
  }
  return membership;
}

/** An adopted entity's membership, the `1.30.0` overriding shape with each section flipped back to
 * inherit where the world default is absent or changes nothing; `null` where a Tool row leaves a
 * section unauthored that the world default authors, which no membership can express. */
function adoptedMembership(entityType, row, id, systemId, worldDefault) {
  const world = isPlainObject(worldDefault) ? worldDefault : {};
  if (
    entityType === 'tools' &&
    EMPTY_INEXPRESSIBLE.some(
      (section) => row[section] === undefined && world[section] !== undefined
    )
  ) {
    return null;
  }
  const membership = buildMembershipRecord(row, entityType, id, systemId);
  const merged = inheritingRow(entityType, row, id, systemId, { ...world, id });
  for (const section of SECTIONS[entityType]) {
    if (world[section] !== undefined && !SECTION_UNCHANGED[section](row, merged)) continue;
    delete membership.inherit[section];
    delete membership[section];
  }
  return membership;
}

function seededMembership(seed, id, systemId) {
  return { ...cloneJson(seed), entityId: id, systemId };
}

/** The decision for one Tool row against the roster; `adopt` and `create` carry no shape yet. */
function decideTool(context, row, entity) {
  const keys = sourceKeys(row, context.referencesOf);
  if (entity) {
    const shares =
      keys.size === 0
        ? sourceKeys(entity, context.referencesOf).size === 0
        : sharesSource(entity, keys, context.referencesOf);
    return shares
      ? { decision: 'adopt' }
      : { decision: 'conflicting', reason: CONFLICT_REASONS.idCollision };
  }
  const sharing = allSharing(context.roster, keys);
  if (sharing.length === 0) return { decision: 'create' };
  return {
    decision: 'conflicting',
    reason: CONFLICT_REASONS.sourceCollision,
    matchedIds: sharing.map((match) => match.id),
  };
}

function decideEssence(context, id, entity) {
  if (entity) return { decision: 'adopt' };
  if (context.retiredIds.has(id)) {
    return { decision: 'conflicting', reason: CONFLICT_REASONS.retiredId };
  }
  return { decision: 'create' };
}

/** One row's decision with the entity and membership it writes. */
function decideRow(context, systemId, id, row) {
  const { entityType } = context;
  const entity = context.roster.byId.get(id);
  const member = context.members.has(membershipKey(id, systemId));
  if (entity && member) return { decision: 'registered' };
  const base =
    entityType === 'tools' ? decideTool(context, row, entity) : decideEssence(context, id, entity);
  if (base.decision === 'conflicting') return base;
  const decided = { ...base };
  if (base.decision === 'create') decided.entity = { id, ...identityOf(row, entityType) };
  if (member) return decided;
  const seed = context.seeds?.[id];
  if (isPlainObject(seed)) {
    decided.membership = seededMembership(seed, id, systemId);
  } else if (base.decision === 'create') {
    decided.membership = createdMembership(entityType, row, id, systemId);
  } else {
    decided.membership = adoptedMembership(entityType, row, id, systemId, context.defaults.get(id));
    if (!decided.membership) {
      return { decision: 'conflicting', reason: CONFLICT_REASONS.emptyOverride };
    }
  }
  return decided;
}

function planContext({ entityType, payload, retiredIds, parseUuid }) {
  const referencesOf = entityType === 'tools' ? toolReferencesOf(parseUuid) : () => [];
  const members = new Set();
  for (const record of subKeyEntries(payload?.membership)) {
    if (isPlainObject(record)) members.add(membershipKey(record.entityId, record.systemId));
  }
  const defaults = new Map();
  for (const record of subKeyEntries(payload?.defaults)) {
    if (isPlainObject(record) && !defaults.has(record.id)) defaults.set(record.id, record);
  }
  return {
    entityType,
    referencesOf,
    roster: indexRoster(payload?.entities, referencesOf),
    members,
    defaults,
    retiredIds: new Set(retiredIds),
    seeds: null,
  };
}

/**
 * Every row's decision across `systems`, in corpus order then row order, each
 * `{ decision, systemId, id, name, reason?, matchedIds?, entity?, membership? }`. A row decided
 * earlier counts as registered for every later one. `seeds` is `{ systemId, essences?, tools? }`,
 * each an `entityId -> membership` map replacing the membership shape of that system's
 * `create`/`adopt` decisions; `parseUuid` is `foundry.utils.parseUuid`.
 */
export function planWorldScopeIdentityRegistration({
  entityType,
  payload,
  systems,
  retiredIds = null,
  parseUuid = null,
  seeds = null,
}) {
  const decisions = [];
  const context = planContext({ entityType, payload, retiredIds, parseUuid });
  for (const system of systems ?? []) {
    const systemId = trimString(system?.id);
    if (!systemId) continue;
    context.seeds = seeds?.systemId === systemId ? seeds[entityType] : null;
    for (const [id, row] of registrationRows(system, entityType)) {
      const decided = decideRow(context, systemId, id, row);
      decisions.push({ ...decided, systemId, id, name: trimString(row.name) || id });
      if (decided.entity) addToRoster(context.roster, decided.entity);
      if (decided.membership) context.members.add(membershipKey(id, systemId));
    }
  }
  return decisions;
}

/** Write the `entity`/`membership` of each decision into a persisted-shape payload, in place. */
export function applyRegistrationDecisions(payload, decisions) {
  for (const decided of decisions) {
    if (decided.entity) payload.entities.push(decided.entity);
    if (decided.membership) {
      payload.membership[membershipKey(decided.id, decided.systemId)] = decided.membership;
    }
  }
  return payload;
}

/** Remove from a persisted-shape payload, in place, each membership `decisions` wrote and each
 * entity they created that no membership still names; answers whether anything moved. */
export function withdrawRegistrationDecisions(payload, decisions) {
  let changed = false;
  for (const decided of decisions) {
    const key = membershipKey(decided.id, decided.systemId);
    if (decided.membership && payload.membership[key]) {
      delete payload.membership[key];
      changed = true;
    }
  }
  const named = new Set(subKeyEntries(payload.membership).map((record) => record?.entityId));
  const created = new Set(decisions.filter((d) => d.entity && !named.has(d.id)).map((d) => d.id));
  const kept = payload.entities.filter((entity) => !created.has(entity?.id));
  if (kept.length !== payload.entities.length) {
    payload.entities = kept;
    changed = true;
  }
  return changed;
}
