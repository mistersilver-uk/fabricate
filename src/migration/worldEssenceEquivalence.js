/**
 * The equivalence decision core of the `1.34.0` world-essence merge (issue 1654). Spec § Equivalent
 * World Essence Merge owns every rule below, the canonicalised `(name, macro, effectSource)` triple
 * and the three refusal invariants included. Total, non-throwing and PURE.
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

import { isPlainObject } from './migrationHelpers.js';

/** The `craftingSystem` array essences are stored under, read from the one list that names it. */
const ESSENCE_DEFINITIONS_FIELD = ENTITY_TYPE_FIELDS.essences;

/** The entity-type leg every map this module emits is written under. */
const ESSENCES = 'essences';

/** The fallback stem `mintEssenceId` uses for an empty or wholly non-alphanumeric name. */
const FALLBACK_SLUG_STEM = 'essence';

/** Every refusal reason, so a caller matches a shared token rather than its own string literal. */
export const ESSENCE_MERGE_REFUSAL_REASONS = Object.freeze({
  unresolvedEffectSourceComponent: 'unresolvedEffectSourceComponent',
  nonDisjointMap: 'nonDisjointMap',
  outputIdCollision: 'outputIdCollision',
  membershipKeyCollision: 'membershipKeyCollision',
});

/** Every reason this pass can decline a world essence's candidacy. */
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

// --- The canonicalisers ----------------------------------------------------

/**
 * The case-folded comparison key for an essence name, or `UNCANONICALISABLE`. `toLowerCase`, never
 * the locale-sensitive fold, and an EMPTY name is uncanonicalisable rather than a key of its own.
 */
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

/** The canonical `effectSource` section, in FIXED KEY ORDER, trimmed-or-`null` (requirement 2). */
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

/** The equivalence key, serialised as an ARRAY so it never depends on property enumeration order. */
function equivalenceKey(name, macro, effectSource) {
  return JSON.stringify([
    name,
    macro,
    ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => effectSource[field]),
  ]);
}

/**
 * The id stem the world catalogue would mint for a name: only the STEM of `mintEssenceId`, which
 * lives in a UI leaf a startup migration must not import, and a test keeps the two equal.
 */
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

// --- Reading the inputs ----------------------------------------------------

/**
 * The corpus facts election and the refusal invariants need. A duplicate system id keeps the first
 * system's age and accumulates BOTH systems' rows, or a collision would be hidden, not refused.
 */
function readSystemsCorpus(systems) {
  const order = new Map();
  const rowsBySystem = new Map();
  const positionById = new Map();
  const systemsByRowId = new Map();
  for (const [systemIndex, system] of arrayOf(systems).entries()) {
    if (!isPlainObject(system)) continue;
    const systemId = trimmedString(system.id);
    if (!systemId) continue;
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
  }
  return { order, rowsBySystem, positionById, systemsByRowId };
}

/**
 * The essence scope payload, accepting both sub-key shapes, de-duplicated as the shipped normalizers
 * do, with every key DERIVED from the record. A membership record is LIVE only when its entity is on
 * the roster and its system in the corpus, or a dead essence would pass the zero-member point.
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
  // Sorted by system age, so every downstream list is ordered by a corpus fact rather than by
  // payload insertion.
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

// --- Candidacy, and the zero point -----------------------------------------

/** The resolved, canonicalised `(macro, effectSource)` pair one membership record answers. */
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

/** A report fragment's display name: the STORED name, never the fold, and absence-preserving. */
function displayNameOf(record) {
  const name = record?.name;
  return name === undefined ? {} : { name };
}

/** Split the world roster into merge candidates, declined essences and orphans. */
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

// --- Survivor election -----------------------------------------------------

/**
 * The election order of requirement 5: corpus position re-derived from the LIVE corpus, with
 * `essenceScope.entities` array position the final tie-break only.
 */
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

/**
 * Partition the candidates, survivor first by construction, keying on canonicalised CONTENT so only
 * the final tie-break ever sees array order.
 */
function partitionCandidates(candidates) {
  const ordered = [...candidates].sort(byElectionOrder);
  const groups = new Map();
  for (const candidate of ordered) {
    if (!groups.has(candidate.key)) groups.set(candidate.key, []);
    groups.get(candidate.key).push(candidate);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

// --- The map and its three refusal invariants ------------------------------

/**
 * Every system one candidate is PRESENT in, in corpus age order. Presence, not reachability: the row
 * leg stays because `unionScopedDefinitions` passes a row with no membership record through. NOT
 * widened to a system merely carrying the loser's id as an `essences` map key.
 */
function presenceSystemsOf(candidate, corpus) {
  const present = new Set(candidate.memberSystemIds);
  for (const systemId of corpus.systemsByRowId.get(candidate.id) ?? []) present.add(systemId);
  return [...present].sort((left, right) => corpus.order.get(left) - corpus.order.get(right));
}

/** The per-system merge map one set of accepted groups produces. */
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
 * Whether a component reference is addressable at world scope from one system: on the world roster
 * AND held by this system's membership. The second half is the one `1.30.0` does not make, and a
 * pair it REFUSED wrote no record, so that system's essences still carry raw system-local ids.
 */
function namesWorldComponentIn(reference, systemId, worldComponents) {
  if (!isWorldAddressable(reference, worldComponents.ids)) return false;
  // `isWorldAddressable` passes a document UUID unconditionally, so anything past it and off the
  // roster is globally addressable and carries no system scope.
  if (!worldComponents.ids.has(reference)) return true;
  return worldComponents.memberships.has(membershipKey(reference, systemId));
}

/**
 * Requirement 6's disjointness invariant, which cannot answer anything today: groups partition the
 * world roster. Kept because that argument rests on the partition, which a re-election would break.
 */
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
 * Requirement 6's output-uniqueness invariant, over `systems[].essenceDefinitions` exactly as
 * `1.30.0`'s `findRefusals` reads it. Ids are uniquified and NAMES are not, so one system can hold
 * two equivalent same-name essences and merging them collides.
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

/**
 * Requirement 6's third invariant, a POST-condition over the rebuilt keys and the only one of the
 * three that can see a world essence holding a record for a system with no in-system row.
 */
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

/** Every refusal one candidate map exhibits, in a fixed reason order so the report is stable. */
function findGroupRefusals(mergeMap, groups, corpus) {
  return [
    ...findNonDisjointGroups(mergeMap, groups),
    ...findOutputCollisionGroups(mergeMap, groups, corpus),
    ...findMembershipCollisionGroups(groups, corpus),
  ];
}

// --- The public entry point ------------------------------------------------

/** Decide equivalence, survivors, per-system re-keys and tombstones. It mutates NOTHING. */
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

  // The false-merge trap first, because it is a candidacy gate rather than a map invariant: a group
  // it removes never contributes a map entry for the other three to read.
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

  // A literal bound, because a migration that spins is indistinguishable from a hung world. No fixed
  // point is needed: every refusal is attributable to exactly one group, so removing one cannot
  // create a new refusal, and the second iteration is the assertion that says so.
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
      // The survivor's display name: what the merged essence will still be called, so the name a GM
      // can act on. Every loser's own name is preserved in `retired`.
      ...displayNameOf(survivor.record),
      loserIds: losers.map((loser) => loser.id),
      systemIds: [...systemIds].sort(
        (left, right) => corpus.order.get(left) - corpus.order.get(right)
      ),
    });
    for (const loser of losers) {
      // `identityOf` is absence-preserving, which is right for a tombstone: a field the retired
      // entity never carried is not one a restore should mint.
      retired[loser.id] = {
        ...identityOf(loser.record, ESSENCES),
        // What absorbed it, recorded here because this is the last moment the pairing exists
        // anywhere: the per-system legs are cleared by the one-shot pass that consumes them.
        survivorId: survivor.id,
        systems: presenceSystemsOf(loser, corpus),
      };
    }
  }

  return { mergeMap, retired, mergedGroups, refusals, declined, orphaned };
}
