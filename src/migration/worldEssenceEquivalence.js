/**
 * The decision core of the `1.34.0` world-essence merge (issue 1654); spec § Equivalent World
 * Essence Merge owns every rule, the canonical triple and three refusal invariants included. Total,
 * non-throwing and pure.
 */

import { resolveEssence } from '../systems/essenceScope.js';
import { membershipKey } from '../systems/scopedDefinitions.js';
import { subKeyEntries } from '../systems/scopedDefinitionStore.js';
import { isWorldAddressable } from '../systems/worldScopeDefaults.js';
import {
  ENTITY_TYPE_FIELDS,
  ESSENCE_EFFECT_SOURCE_FIELDS,
  identityOf,
} from '../systems/worldScopeEntityGrouping.js';

import { isPlainObject, forEachSystem } from './migrationHelpers.js';

const ESSENCE_DEFINITIONS_FIELD = ENTITY_TYPE_FIELDS.essences;

const ESSENCES = 'essences';

/** The fallback stem `mintEssenceId` uses for an empty or wholly non-alphanumeric name. */
const FALLBACK_SLUG_STEM = 'essence';

/** Shared tokens, so a caller never matches its own string literal. */
export const ESSENCE_MERGE_REFUSAL_REASONS = Object.freeze({
  unresolvedEffectSourceComponent: 'unresolvedEffectSourceComponent',
  nonDisjointMap: 'nonDisjointMap',
  outputIdCollision: 'outputIdCollision',
  membershipKeyCollision: 'membershipKeyCollision',
});

export const ESSENCE_DECLINE_REASONS = Object.freeze({
  sectionDisagreement: 'sectionDisagreement',
  uncanonicalisableKey: 'uncanonicalisableKey',
});

/** The answer for a value no writer produces; folding it into `null` would merge on junk. */
const UNCANONICALISABLE = Symbol('uncanonicalisable');

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** `toLowerCase`, never the locale fold; an empty name is `UNCANONICALISABLE`, not a key. */
function canonicalEssenceName(value) {
  if (value !== null && value !== undefined && typeof value !== 'string') return UNCANONICALISABLE;
  const name = String(value ?? '')
    .trim()
    .toLowerCase();
  return name === '' ? UNCANONICALISABLE : name;
}

/** The canonical `macro`: a trimmed UUID or `null`, `''` reading as `null` as every reader does. */
function canonicalEssenceMacro(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return UNCANONICALISABLE;
  return value.trim() || null;
}

/** In fixed key order, each trimmed or `null` (requirement 2). */
function canonicalEssenceEffectSource(value) {
  if (value === null || value === undefined) return blankEffectSource();
  if (!isPlainObject(value)) return UNCANONICALISABLE;
  const block = {};
  for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) {
    const raw = value[field];
    if (raw === null || raw === undefined) {
      block[field] = null;
      continue;
    }
    if (typeof raw !== 'string') return UNCANONICALISABLE;
    block[field] = raw.trim() || null;
  }
  return block;
}

/** The all-`null` block an absent `effectSource` canonicalises to. */
function blankEffectSource() {
  const block = {};
  for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) block[field] = null;
  return block;
}

/** An array, so it never depends on property enumeration order. */
function equivalenceKey(name, macro, effectSource) {
  return JSON.stringify([
    name,
    macro,
    ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => effectSource[field]),
  ]);
}

/** `mintEssenceId`'s stem, copied from a UI leaf a migration must not import; a test pins them. */
export function essenceSlugStem(name) {
  return (
    String(name ?? '')
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '') || FALLBACK_SLUG_STEM
  );
}

/**
 * How slug-shaped an id is: `0` bare stem, `1` collision form, `2` otherwise — three ranks, so a
 * group holding `iron` and `iron-2` retires `iron-2` rather than letting corpus position decide.
 */
function slugRank(id, stem) {
  if (id === stem) return 0;
  const suffix = id.startsWith(`${stem}-`) ? id.slice(stem.length + 1) : '';
  if (suffix !== '' && /^\d+$/.test(suffix)) return 1;
  return 2;
}

/** A duplicate system id keeps the first age and both rows, so a collision is refused. */
function readSystemsCorpus(systems) {
  const order = new Map();
  const rowsBySystem = new Map();
  const positionById = new Map();
  const systemsByRowId = new Map();
  forEachSystem(systems, (system, systemIndex) => {
    const systemId = trimmedString(system.id);
    if (!systemId) return;
    if (!order.has(systemId)) order.set(systemId, systemIndex);
    if (!rowsBySystem.has(systemId)) rowsBySystem.set(systemId, []);
    const rows = rowsBySystem.get(systemId);
    for (const [index, record] of arrayOf(system[ESSENCE_DEFINITIONS_FIELD]).entries()) {
      if (!isPlainObject(record)) continue;
      const id = trimmedString(record.id);
      if (!id) continue;
      rows.push({ id, index });
      if (!positionById.has(id)) positionById.set(id, { systemIndex, index });
      if (!systemsByRowId.has(id)) systemsByRowId.set(id, new Set());
      systemsByRowId.get(id).add(systemId);
    }
  });
  return { order, rowsBySystem, positionById, systemsByRowId };
}

/**
 * Both sub-key shapes, de-duplicated like the normalizers, keys derived from each record. A record
 * is live only with its entity on the roster and its system in the corpus, or a dead essence would
 * pass the zero-member point.
 */
function readEssenceScope(essenceScope, systemOrder) {
  const source = isPlainObject(essenceScope) ? essenceScope : {};
  const entities = [];
  const byId = new Set();
  for (const entry of subKeyEntries(source.entities)) {
    if (!isPlainObject(entry)) continue;
    const id = trimmedString(entry.id);
    if (!id || byId.has(id)) continue;
    byId.add(id);
    entities.push({ id, arrayIndex: entities.length, record: entry });
  }

  const defaultsById = new Map();
  for (const entry of subKeyEntries(source.defaults)) {
    if (!isPlainObject(entry)) continue;
    const id = trimmedString(entry.id);
    if (!id || defaultsById.has(id)) continue;
    defaultsById.set(id, entry);
  }

  const membershipsByEntity = new Map();
  const seen = new Set();
  for (const entry of subKeyEntries(source.membership)) {
    if (!isPlainObject(entry)) continue;
    const entityId = trimmedString(entry.entityId);
    const systemId = trimmedString(entry.systemId);
    if (!entityId || !systemId) continue;
    if (!byId.has(entityId) || !systemOrder.has(systemId)) continue;
    const key = membershipKey(entityId, systemId);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!membershipsByEntity.has(entityId)) membershipsByEntity.set(entityId, []);
    membershipsByEntity.get(entityId).push(entry);
  }
  // By system age, so downstream order is a corpus fact, not payload insertion.
  for (const records of membershipsByEntity.values()) {
    records.sort(
      (left, right) =>
        systemOrder.get(trimmedString(left.systemId)) -
        systemOrder.get(trimmedString(right.systemId))
    );
  }
  return { entities, defaultsById, membershipsByEntity };
}

/** The false-merge gate's inputs: the world component roster and the proving membership keys. */
function readComponentScope(componentScope) {
  const source = isPlainObject(componentScope) ? componentScope : {};
  const ids = new Set();
  for (const entry of subKeyEntries(source.entities)) {
    if (!isPlainObject(entry)) continue;
    const id = trimmedString(entry.id);
    if (id) ids.add(id);
  }
  const memberships = new Set();
  for (const entry of subKeyEntries(source.membership)) {
    if (!isPlainObject(entry)) continue;
    const entityId = trimmedString(entry.entityId);
    const systemId = trimmedString(entry.systemId);
    if (entityId && systemId) memberships.add(membershipKey(entityId, systemId));
  }
  return { ids, memberships };
}

function canonicalSectionsOf(worldDefault, membership) {
  const resolved = resolveEssence(worldDefault, membership);
  return {
    macro: canonicalEssenceMacro(resolved.macro),
    effectSource: canonicalEssenceEffectSource(resolved.effectSource),
  };
}

/** Section equality through a serialised form, so key enumeration order cannot decide it. */
function sectionsEqual(left, right) {
  if (left === right) return true;
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  return (
    JSON.stringify(ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => left[field])) ===
    JSON.stringify(ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => right[field]))
  );
}

/** The stored name, never the fold, and absence-preserving. */
function displayNameOf(record) {
  const name = record?.name;
  return name === undefined ? {} : { name };
}

function classifyCandidates(scope, corpus) {
  const candidates = [];
  const declined = [];
  const orphaned = [];
  const decline = (entity, sections, reason) => {
    declined.push({
      essenceId: entity.id,
      ...displayNameOf(entity.record),
      sections,
      reason,
    });
  };

  for (const entity of scope.entities) {
    const members = scope.membershipsByEntity.get(entity.id) ?? [];
    // The zero point, tested explicitly: unanimity over no members is vacuously true, so without
    // this line an essence nobody resolves would be the most mergeable essence in the world.
    if (members.length === 0) {
      orphaned.push({ essenceId: entity.id, ...displayNameOf(entity.record) });
      continue;
    }

    const name = canonicalEssenceName(entity.record?.name);
    if (name === UNCANONICALISABLE) {
      decline(entity, ['name'], ESSENCE_DECLINE_REASONS.uncanonicalisableKey);
      continue;
    }

    const worldDefault = scope.defaultsById.get(entity.id) ?? null;
    const first = canonicalSectionsOf(worldDefault, members[0]);
    const unreadable = [];
    const disagreed = [];
    for (const member of members) {
      const sections = canonicalSectionsOf(worldDefault, member);
      for (const section of ['macro', 'effectSource']) {
        if (sections[section] === UNCANONICALISABLE) {
          if (!unreadable.includes(section)) unreadable.push(section);
          continue;
        }
        if (!sectionsEqual(sections[section], first[section]) && !disagreed.includes(section)) {
          disagreed.push(section);
        }
      }
    }

    if (unreadable.length > 0) {
      decline(entity, unreadable, ESSENCE_DECLINE_REASONS.uncanonicalisableKey);
      continue;
    }
    if (disagreed.length > 0) {
      decline(entity, disagreed, ESSENCE_DECLINE_REASONS.sectionDisagreement);
      continue;
    }

    const stem = essenceSlugStem(name);
    candidates.push({
      id: entity.id,
      record: entity.record,
      arrayIndex: entity.arrayIndex,
      key: equivalenceKey(name, first.macro, first.effectSource),
      effectSource: first.effectSource,
      slugRank: slugRank(entity.id, stem),
      corpusPosition: corpus.positionById.get(entity.id) ?? null,
      memberSystemIds: members.map((member) => trimmedString(member.systemId)),
    });
  }

  return { candidates, declined, orphaned };
}

/** Requirement 5: live corpus position; `essenceScope.entities` order only breaks ties. */
function byElectionOrder(left, right) {
  if (left.slugRank !== right.slugRank) return left.slugRank - right.slugRank;
  const leftPosition = left.corpusPosition;
  const rightPosition = right.corpusPosition;
  if (leftPosition && !rightPosition) return -1;
  if (!leftPosition && rightPosition) return 1;
  if (leftPosition && rightPosition) {
    if (leftPosition.systemIndex !== rightPosition.systemIndex) {
      return leftPosition.systemIndex - rightPosition.systemIndex;
    }
    if (leftPosition.index !== rightPosition.index) return leftPosition.index - rightPosition.index;
  }
  return left.arrayIndex - right.arrayIndex;
}

/** Survivor first; keyed on canonical content, so only the last tie-break sees array order. */
function partitionCandidates(candidates) {
  const ordered = [...candidates].sort(byElectionOrder);
  const groups = new Map();
  for (const candidate of ordered) {
    if (!groups.has(candidate.key)) groups.set(candidate.key, []);
    groups.get(candidate.key).push(candidate);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * Presence, not reachability, in corpus age order: `unionScopedDefinitions` passes a row with no
 * membership record through. A loser's id as an `essences` map key is not presence.
 */
function presenceSystemsOf(candidate, corpus) {
  const present = new Set(candidate.memberSystemIds);
  for (const systemId of corpus.systemsByRowId.get(candidate.id) ?? []) present.add(systemId);
  return [...present].sort((left, right) => corpus.order.get(left) - corpus.order.get(right));
}

function buildMergeMap(groups, corpus) {
  const mergeMap = {};
  for (const group of groups) {
    const [survivor, ...losers] = group;
    for (const loser of losers) {
      for (const systemId of presenceSystemsOf(loser, corpus)) {
        const perSystem = (mergeMap[systemId] ??= {});
        const perType = (perSystem[ESSENCES] ??= {});
        perType[loser.id] = survivor.id;
      }
    }
  }
  return mergeMap;
}

/**
 * Requirement 3's false-merge trap, over `sourceComponentId` alone: a document UUID is globally
 * addressable and carries no system scope to mis-compare.
 */
function unresolvedEffectSourceSystems(group, worldComponents, corpus) {
  const references = ['sourceComponentId', 'associatedSystemItemId']
    .map((field) => group[0].effectSource[field])
    .filter((value) => trimmedString(value));
  if (references.length === 0) return [];

  const offending = new Set();
  for (const candidate of group) {
    for (const systemId of candidate.memberSystemIds) {
      for (const reference of references) {
        if (namesWorldComponentIn(reference, systemId, worldComponents)) continue;
        offending.add(systemId);
      }
    }
  }
  return [...offending].sort((left, right) => corpus.order.get(left) - corpus.order.get(right));
}

/**
 * On the world roster and held by this system's membership. `1.30.0` skips the second half, but a
 * pair it refused wrote no record, so that system's essences still carry system-local ids.
 */
function namesWorldComponentIn(reference, systemId, worldComponents) {
  if (!isWorldAddressable(reference, worldComponents.ids)) return false;
  // A document UUID passes unconditionally and carries no system scope.
  if (!worldComponents.ids.has(reference)) return true;
  return worldComponents.memberships.has(membershipKey(reference, systemId));
}

/** Requirement 6's disjointness: vacuous while groups partition the roster, which may change. */
function findNonDisjointGroups(mergeMap, groups) {
  const findings = new Map();
  for (const [systemId, legs] of Object.entries(mergeMap)) {
    const map = legs[ESSENCES] ?? {};
    const keys = new Set(Object.keys(map));
    for (const survivorId of Object.values(map)) {
      if (!keys.has(survivorId)) continue;
      for (const group of groups) {
        if (group.every((candidate) => candidate.id !== survivorId)) continue;
        if (!findings.has(group)) findings.set(group, new Set());
        findings.get(group).add(systemId);
      }
    }
  }
  return [...findings].map(([group, systemIds]) => ({
    group,
    systemIds: [...systemIds],
    reason: ESSENCE_MERGE_REFUSAL_REASONS.nonDisjointMap,
  }));
}

/**
 * Requirement 6's output uniqueness, read as `1.30.0`'s `findRefusals` reads it. Names are not
 * uniquified, so one system can hold two equivalent same-name essences whose merge collides.
 */
function findOutputCollisionGroups(mergeMap, groups, corpus) {
  const findings = new Map();
  for (const [systemId, rows] of corpus.rowsBySystem) {
    const map = mergeMap[systemId]?.[ESSENCES] ?? {};
    const sourcesByOutput = new Map();
    for (const row of rows) {
      const output = map[row.id] ?? row.id;
      if (!sourcesByOutput.has(output)) sourcesByOutput.set(output, []);
      sourcesByOutput.get(output).push(row.id);
    }
    for (const [output, sources] of sourcesByOutput) {
      if (sources.length < 2) continue;
      const involved = new Set([output, ...sources]);
      for (const group of groups) {
        if (group.every((candidate) => !involved.has(candidate.id))) continue;
        if (!findings.has(group)) findings.set(group, new Set());
        findings.get(group).add(systemId);
      }
    }
  }
  return [...findings].map(([group, systemIds]) => ({
    group,
    systemIds: [...systemIds],
    reason: ESSENCE_MERGE_REFUSAL_REASONS.outputIdCollision,
  }));
}

/** A post-condition, the only invariant that sees a record for a system with no in-system row. */
function findMembershipCollisionGroups(groups, corpus) {
  const findings = [];
  for (const group of groups) {
    const counts = new Map();
    for (const candidate of group) {
      for (const systemId of candidate.memberSystemIds) {
        counts.set(systemId, (counts.get(systemId) ?? 0) + 1);
      }
    }
    const systemIds = [...counts]
      .filter(([, count]) => count > 1)
      .map(([systemId]) => systemId)
      .sort((left, right) => corpus.order.get(left) - corpus.order.get(right));
    if (systemIds.length > 0) {
      findings.push({
        group,
        systemIds,
        reason: ESSENCE_MERGE_REFUSAL_REASONS.membershipKeyCollision,
      });
    }
  }
  return findings;
}

/** In a fixed reason order, so the report is stable. */
function findGroupRefusals(mergeMap, groups, corpus) {
  return [
    ...findNonDisjointGroups(mergeMap, groups),
    ...findOutputCollisionGroups(mergeMap, groups, corpus),
    ...findMembershipCollisionGroups(groups, corpus),
  ];
}

/** Equivalence, survivors, per-system re-keys and tombstones; mutates nothing. */
export function buildWorldEssenceEquivalence({ systems, essenceScope, componentScope } = {}) {
  const corpus = readSystemsCorpus(systems);
  const scope = readEssenceScope(essenceScope, corpus.order);
  const worldComponents = readComponentScope(componentScope);

  const { candidates, declined, orphaned } = classifyCandidates(scope, corpus);
  const allGroups = partitionCandidates(candidates);

  const refusals = [];
  const refused = new Set();
  const recordRefusal = (group, systemIds, reason) => {
    if (refused.has(group)) return;
    refused.add(group);
    refusals.push({
      survivorId: group[0].id,
      // The survivor's display name, because a refusal names the same group a merge would have.
      ...displayNameOf(group[0].record),
      loserIds: group.slice(1).map((candidate) => candidate.id),
      systemIds,
      reason,
    });
  };

  // The false-merge trap first: a candidacy gate, so its removals never reach the map.
  for (const group of allGroups) {
    const offending = unresolvedEffectSourceSystems(group, worldComponents, corpus);
    if (offending.length > 0) {
      recordRefusal(
        group,
        offending,
        ESSENCE_MERGE_REFUSAL_REASONS.unresolvedEffectSourceComponent
      );
    }
  }

  // A literal bound, since a spinning migration looks like a hung world. Each refusal belongs to
  // one group, so removal creates none, and the second iteration asserts it.
  const bound = allGroups.length + 1;
  let accepted = allGroups.filter((group) => !refused.has(group));
  let mergeMap = buildMergeMap(accepted, corpus);
  for (let iteration = 0; iteration <= bound; iteration += 1) {
    const found = findGroupRefusals(mergeMap, accepted, corpus).filter(
      (finding) => !refused.has(finding.group)
    );
    if (found.length === 0) break;
    for (const finding of found) recordRefusal(finding.group, finding.systemIds, finding.reason);
    accepted = accepted.filter((group) => !refused.has(group));
    mergeMap = buildMergeMap(accepted, corpus);
  }

  const mergedGroups = [];
  const retired = {};
  for (const group of accepted) {
    const [survivor, ...losers] = group;
    const systemIds = new Set();
    for (const candidate of group) {
      for (const systemId of presenceSystemsOf(candidate, corpus)) systemIds.add(systemId);
    }
    mergedGroups.push({
      survivorId: survivor.id,
      // The survivor's name, the one a GM can act on; each loser's is kept in `retired`.
      ...displayNameOf(survivor.record),
      loserIds: losers.map((loser) => loser.id),
      systemIds: [...systemIds].sort(
        (left, right) => corpus.order.get(left) - corpus.order.get(right)
      ),
    });
    for (const loser of losers) {
      // Absence-preserving, so a restore never mints a field the retired entity lacked.
      retired[loser.id] = {
        ...identityOf(loser.record, ESSENCES),
        // The last record of the pairing: the one-shot pass clears the per-system legs.
        survivorId: survivor.id,
        systems: presenceSystemsOf(loser, corpus),
      };
    }
  }

  return { mergeMap, retired, mergedGroups, refusals, declined, orphaned };
}
