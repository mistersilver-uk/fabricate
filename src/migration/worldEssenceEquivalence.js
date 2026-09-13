/**
 * The equivalence decision core of the `1.34.0` world-essence merge (issue 1654;
 * `destructive-changes-and-migrations` § Equivalent World Essence Merge): which world essences are
 * the same essence, which one survives, which ids each system must rewrite, and what each retired
 * id carried.
 *
 * Total and non-throwing like `worldScopeEntityGrouping.js` — a non-array corpus, a malformed
 * system or a null definition answers an empty or partial result rather than raising, because a
 * migration that throws aborts the whole pass — and pure: it writes nothing, mutates nothing, and
 * its answer is fully determined by its input, so re-running the pass it feeds merges nothing more.
 *
 * Equivalence is the canonicalised `(name, macro, effectSource)` triple (requirement 2). `enabled`
 * is not in it, because every member keeps its own across a merge. For an essence with no macro and
 * no effect source the key is the name alone — the modal case, not a degenerate one (requirement
 * 2a) — so name-only matches in a merge report are the designed outcome.
 *
 * The effect-source reference is compared, never the referenced item's active effects: this runs on
 * raw settings, with no guarantee the Item or compendium is loaded.
 */

import { resolveEssence } from '../systems/essenceScope.js';
import { membershipKey } from '../systems/scopedDefinitions.js';
import { subKeyEntries } from '../systems/scopedDefinitionStore.js';

import { isPlainObject } from './migrationHelpers.js';
import { isWorldAddressable } from './worldScopeDefaults.js';
import {
  ENTITY_TYPE_FIELDS,
  ESSENCE_EFFECT_SOURCE_FIELDS,
  identityOf,
} from './worldScopeEntityGrouping.js';

/** The `craftingSystem` array essences are stored under, read from the one list that names it. */
const ESSENCE_DEFINITIONS_FIELD = ENTITY_TYPE_FIELDS.essences;

/** The entity-type leg every map this module emits is written under. */
const ESSENCES = 'essences';

/** The fallback stem `mintEssenceId` uses for an empty or wholly non-alphanumeric name. */
const FALLBACK_SLUG_STEM = 'essence';

/**
 * Every reason this pass can refuse a merge group, so a caller matches on a shared token rather
 * than on a string literal it spelled itself.
 */
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

/**
 * The answer a canonicaliser gives for a value no writer produces. Folding junk into the `null`
 * branch instead would make a hand-edited `effectSource: "Item.abc"` compare equal to an essence
 * with no source at all and merge the two; such an essence is declined and left exactly as it is.
 */
const UNCANONICALISABLE = Symbol('uncanonicalisable');

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// The canonicalisers
// ---------------------------------------------------------------------------

/**
 * The case-folded comparison key for an essence name, or {@link UNCANONICALISABLE}.
 *
 * `toLowerCase`, not `toLocaleLowerCase`: it agrees with the authoring guard this key exists to
 * match (`adminStore._essenceNameKey`) and with `mintEssenceId`'s stem, and a locale-sensitive fold
 * would make a migration's answer depend on the client locale (Turkish `I` folds to `ı`).
 *
 * An empty name is uncanonicalisable rather than a key of its own: two essences named nothing are
 * not provably the same essence, so merging them would be an irreversible content change made on a
 * guess.
 *
 * @returns {string|symbol}
 */
function canonicalEssenceName(value) {
  if (value !== null && value !== undefined && typeof value !== 'string') return UNCANONICALISABLE;
  const name = String(value ?? '')
    .trim()
    .toLowerCase();
  return name === '' ? UNCANONICALISABLE : name;
}

/**
 * The canonical `macro` section value: a trimmed document UUID or `null`, with `''` reading as
 * `null` because no reader distinguishes an empty macro from an absent one.
 *
 * @param {unknown} value The resolved section value.
 * @returns {string|null|symbol}
 */
function canonicalEssenceMacro(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return UNCANONICALISABLE;
  return value.trim() || null;
}

/**
 * The canonical `effectSource` section: the three-field block in a fixed key order, each value
 * trimmed-or-`null`, so an absent block, `{}` and an all-`null` block all compare equal. Three
 * writers emit those three shapes for one behaviour.
 *
 * @param {unknown} value The resolved section value.
 * @returns {Record<string, string|null>|symbol}
 */
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

/**
 * The equivalence key for one canonicalised triple, serialised as an array through
 * {@link ESSENCE_EFFECT_SOURCE_FIELDS} so it never depends on property enumeration order.
 */
function equivalenceKey(name, macro, effectSource) {
  return JSON.stringify([
    name,
    macro,
    ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => effectSource[field]),
  ]);
}

/**
 * The id stem the world catalogue would mint for a name.
 *
 * Only the stem of `mintEssenceId` is duplicated here, never its roster-reading collision suffix:
 * that function lives in a UI leaf a startup migration must not import. The test 'the local slug
 * stem agrees with `mintEssenceId` on an unclaimed roster' keeps the two equal, including the
 * `replaceAll` spelling `unicorn/prefer-string-replace-all` forces under `src/migration`.
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
 * How slug-shaped an id is for a name: `0` for the bare stem, `1` for the `<stem>-<n>` form
 * `mintEssenceId` mints on a collision, `2` for anything else. Three ranks rather than a boolean so
 * a group holding `iron` and `iron-2` retires `iron-2` rather than letting corpus position decide.
 */
function slugRank(id, stem) {
  if (id === stem) return 0;
  const suffix = id.startsWith(`${stem}-`) ? id.slice(stem.length + 1) : '';
  if (suffix !== '' && /^\d+$/.test(suffix)) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Reading the inputs
// ---------------------------------------------------------------------------

/**
 * The corpus facts election and the refusal invariants need: system age, each system's essence
 * definition rows, and where each id first appears.
 *
 * A duplicate system id keeps the first system's age and accumulates both systems' rows: the
 * refusal invariants must see every row that pair emits, so dropping the second system's rows would
 * hide a collision rather than refuse it.
 *
 * @param {unknown} systems The raw `craftingSystems` setting.
 * @returns {{order: Map<string, number>, rowsBySystem: Map<string, Array<{id: string,
 *   index: number}>>, positionById: Map<string, {systemIndex: number, index: number}>,
 *   systemsByRowId: Map<string, Set<string>>}}
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
 * The essence scope payload, read through the store's own {@link subKeyEntries} so the persisted
 * map shape and the published array shape are both accepted, and de-duplicated as the shipped
 * normalizers do: entities first-wins on id, memberships first-wins on `(entityId, systemId)`.
 *
 * Every key is derived from the record rather than trusted from the map key it was filed under, for
 * the reason `ScopedDefinitionStore` re-derives it: a payload whose key and record disagree must
 * not produce a lookup that finds the wrong record.
 *
 * A membership record is live only when its entity is on the roster and its system is in the
 * corpus. A record naming a deleted system resolves for nobody, so counting it would let a wholly
 * dead essence pass the zero point.
 *
 * @returns {{entities: Array<{id: string, arrayIndex: number, record: object}>,
 *   defaultsById: Map<string, object>, membershipsByEntity: Map<string, Array<object>>}}
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
  // Sorted by system age so every downstream list — the unanimity walk, the reported system ids,
  // the tombstone's `systems` — is ordered by a corpus fact rather than by payload insertion.
  for (const records of membershipsByEntity.values()) {
    records.sort(
      (left, right) =>
        systemOrder.get(trimmedString(left.systemId)) -
        systemOrder.get(trimmedString(right.systemId))
    );
  }
  return { entities, defaultsById, membershipsByEntity };
}

/**
 * The component-scope facts the false-merge gate needs: the world component roster, and the
 * `(componentId, systemId)` membership keys that prove a system's components were lifted rather
 * than refused.
 *
 * @returns {{ids: Set<string>, memberships: Set<string>}}
 */
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

// ---------------------------------------------------------------------------
// Candidacy, and the zero point
// ---------------------------------------------------------------------------

/** The resolved, canonicalised `(macro, effectSource)` pair one membership record answers. */
function canonicalSectionsOf(worldDefault, membership) {
  const resolved = resolveEssence(worldDefault, membership);
  return {
    macro: canonicalEssenceMacro(resolved.macro),
    effectSource: canonicalEssenceEffectSource(resolved.effectSource),
  };
}

/**
 * Whether two canonicalised section values are equal, compared through a serialised form so the
 * answer cannot depend on key enumeration order — the metadata difference this pass sees through.
 */
function sectionsEqual(left, right) {
  if (left === right) return true;
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  return (
    JSON.stringify(ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => left[field])) ===
    JSON.stringify(ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => right[field]))
  );
}

/**
 * The display name one world essence record carries, as a fragment to spread into a report entry.
 *
 * The stored name, never the canonical fold: the fold decides equality, and a GM reads the name.
 * Most ids this pass retires are `crypto.randomUUID()` output, so a notice enumerating id pairs is
 * unreadable; the test 'the shipped report shape — a `name` on every entry — needs no fallback at
 * all' pins every leg carrying one, and the producer owns it so no consumer re-derives it.
 *
 * Absence-preserving on {@link identityOf}'s rule: an `undefined` name emits no key and a stored
 * `null` stays `null`, so a nameless essence does not gain a minted name in a report.
 */
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

// ---------------------------------------------------------------------------
// Survivor election
// ---------------------------------------------------------------------------

/**
 * The election order: slug preference, then corpus position, then array position (requirement 5).
 *
 * Corpus position is re-derived from the live `craftingSystems` corpus and never read off
 * `essenceScope.entities`, whose persisted order has survived GM edits, deletions and copy-import
 * appends. Array position is the final tie-break only, for a world essence with no surviving
 * in-system member — which is why a candidate with no corpus position sorts after every candidate
 * that has one.
 *
 * Slug preference ranks an id the catalogue would mint for the group's name first, so a merge never
 * retires a readable `iron` in favour of a UUID.
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
 * Partition the candidates into equivalence groups, each ordered so the survivor is first.
 *
 * Sorted once by the election order and then bucketed, so `group[0]` is the elected survivor by
 * construction and the group order is deterministic. The partition is keyed on canonicalised
 * content, so a shuffled `entities` array produces a set-equal partition; only the final tie-break
 * sees array order.
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

// ---------------------------------------------------------------------------
// The map and its three refusal invariants
// ---------------------------------------------------------------------------

/**
 * Every system one candidate is present in — the systems it holds a live membership record for plus
 * the systems whose `essenceDefinitions` carry its id — in corpus age order.
 *
 * Presence, not reachability. The row leg stays because `unionScopedDefinitions` passes a row with
 * no membership record through untouched, so re-keying it cannot change what that row resolves to,
 * while dropping it would leave the row naming a world entity this pass has deleted and tombstoned.
 *
 * It is not widened to a non-member system that merely carries the loser's id as an `essences` map
 * key: that key is refused at use today and contributes nothing, so re-keying it would silently add
 * the survivor's weight to crafts in a system that never took part in the merge (issue 1654).
 */
function presenceSystemsOf(candidate, corpus) {
  const present = new Set(candidate.memberSystemIds);
  for (const systemId of corpus.systemsByRowId.get(candidate.id) ?? []) present.add(systemId);
  return [...present].sort((left, right) => corpus.order.get(left) - corpus.order.get(right));
}

/**
 * The per-system merge map one set of accepted groups produces.
 *
 * @returns {{[systemId: string]: {essences: {[loserId: string]: string}}}}
 */
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
 * The systems in which a group's canonical `effectSource` names a component id that is not a world
 * component id for that system — the false-merge trap of requirement 3.
 *
 * Checked over `sourceComponentId` and `associatedSystemItemId`, the two spellings of one
 * system-scoped id. `sourceItemUuid` is excluded: a document UUID is globally addressable and
 * carries no system scope to mis-compare.
 *
 * @returns {string[]} the offending system ids, in corpus age order.
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
 * Whether one component reference is addressable at world scope from one system: the id must be on
 * the world component roster, and this system must hold a membership record for it.
 *
 * The second half is the one `1.30.0`'s own addressability check does not make. A `(system,
 * 'components')` pair it refused wrote no membership record, so that system's essences still carry
 * raw system-local ids, one of which can coincide with an unrelated world component id.
 */
function namesWorldComponentIn(reference, systemId, worldComponents) {
  if (!isWorldAddressable(reference, worldComponents.ids)) return false;
  // `isWorldAddressable` passes a document UUID unconditionally, so anything that got past it
  // without being on the roster is globally addressable and carries no system scope.
  if (!worldComponents.ids.has(reference)) return true;
  return worldComponents.memberships.has(membershipKey(reference, systemId));
}

/**
 * The groups whose merge map would break disjointness of the map's image from its key set — the
 * first of requirement 6's three invariants.
 *
 * It cannot answer anything today, and that is the point: groups partition the world roster, so
 * every id is a survivor or a loser of exactly one group and no survivor is ever a key. It is kept
 * because that argument rests on the partition: electing per system, or re-electing a group after a
 * refusal as `1.30.0` does, would break it silently, and a non-disjoint map is not idempotent.
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
 * The groups whose merge map would make a `(system, 'essences')` pair emit a duplicate id —
 * requirement 6's output-uniqueness invariant, evaluated over `systems[].essenceDefinitions`
 * exactly as `1.30.0`'s `findRefusals` evaluates it, because a duplicate there is silently
 * last-wins.
 *
 * `_normalizeEssenceDefinition` uniquifies ids but not names — only the authoring store does, via
 * `_essenceNameTaken` — so an imported or hand-edited corpus can legally hold two equivalent
 * same-name essences inside one system, and merging them collides.
 *
 * A native duplicate the corpus already carried refuses the group that owns one of the colliding
 * ids, on `1.30.0`'s rule that such a system must not have a lift layered on it, and is otherwise
 * left alone: this pass did not cause it and refusing an unrelated merge would not fix it.
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
 * The groups whose merge would collide two membership keys — requirement 6's third invariant.
 *
 * A post-condition over the rebuilt keys, and the only one of the three that can see this failure:
 * the other two read `systems[].essenceDefinitions`, where a world essence holding a membership
 * record for a system with no in-system definition row is invisible. Merging two of those collides
 * `membershipKey(survivorId, systemId)` and drops the loser's authored overrides for that system
 * with no refusal and no report.
 *
 * Not exotic: a membership record outlives its in-system row whenever a GM deletes the row without
 * leaving the system, and copy-import can append one directly.
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

// ---------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------

/**
 * Decide which world essences are semantically equivalent, which survives each merge, which ids
 * every system must rewrite, and what each retired id carried.
 *
 * Total, non-throwing and fully determined by its input. It mutates nothing — neither its arguments
 * nor the records inside them — and applies nothing: the migration that consumes `mergeMap` and
 * `retired` owns every write.
 *
 * @param {unknown} [input.systems] The raw `craftingSystems` setting.
 * @param {unknown} [input.essenceScope] The persisted essence scope payload
 *   (`{entities, defaults, membership}`), in either the stored map or the published array shape.
 * @param {unknown} [input.componentScope] The persisted component scope payload, read for the
 *   world component roster and its membership keys.
 * @returns {{
 *   mergeMap: {[systemId: string]: {essences: {[loserId: string]: string}}},
 *   retired: {[loserId: string]: {name?: unknown, icon?: unknown, colorToken?: unknown,
 *     description?: unknown, survivorId: string, systems: string[]}},
 *   mergedGroups: Array<{survivorId: string, name?: unknown, loserIds: string[],
 *     systemIds: string[]}>,
 *   refusals: Array<{survivorId: string, name?: unknown, loserIds: string[],
 *     systemIds: string[], reason: string}>,
 *   declined: Array<{essenceId: string, name?: unknown, sections: string[], reason: string}>,
 *   orphaned: Array<{essenceId: string, name?: unknown}>
 * }}
 */
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

  // A literal bound, because a migration that spins is indistinguishable from a hung world. No
  // fixed point is needed: every refusal is attributable to exactly one group, so removing a group
  // cannot create a new refusal, and the second iteration is the assertion that says so.
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
      // The survivor's display name: it is what the merged essence will still be called, so it is
      // the name a GM can act on. Every loser's own name is preserved in `retired`.
      ...displayNameOf(survivor.record),
      loserIds: losers.map((loser) => loser.id),
      systemIds: [...systemIds].sort(
        (left, right) => corpus.order.get(left) - corpus.order.get(right)
      ),
    });
    for (const loser of losers) {
      // `identityOf` is absence-preserving, which is right for a tombstone: it records what the
      // retired entity carried, and a field it never carried is not one a restore should mint.
      retired[loser.id] = {
        ...identityOf(loser.record, ESSENCES),
        // What absorbed it, recorded here because this is the last moment the pairing exists
        // anywhere: the per-system legs carrying `loserId -> survivorId` are cleared by the
        // one-shot pass that consumes them (requirement 11), and the losers are gone by then.
        survivorId: survivor.id,
        systems: presenceSystemsOf(loser, corpus),
      };
    }
  }

  return { mergeMap, retired, mergedGroups, refusals, declined, orphaned };
}
