/**
 * `1.30.0` — GROUPING, IDENTITY AND THE PER-SYSTEM RE-KEY MAP (issue 1363). Spec § World-Scope
 * Entity Migration owns the grouping rule, the oldest-wins identity exception, the id-claim ladder
 * and the refusal fixed point. TOTAL AND NON-THROWING, permutation-invariant, and AN UNLINKED
 * DEFINITION IS ITS OWN ENTITY AND IS NEVER MERGED ON A NAME.
 */

import { isPlainObject } from '../utils/scalars.js';

const ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/** The `craftingSystem` array each entity type is stored under. */
export const ENTITY_TYPE_FIELDS = Object.freeze({
  components: 'components',
  essences: 'essenceDefinitions',
  tools: 'tools',
});

/**
 * The entity types whose ids this pass may re-key; essences group by id instead, and `1.34.0` re-keys
 * them under its own map. Widening THIS list would newly refuse a pair on a native duplicate id.
 */
export const REKEYABLE_ENTITY_TYPES = Object.freeze(['components', 'tools']);

/**
 * The SOURCE-LINK fields, UNIONED across the group rather than taken from the donor.
 * DONOR-WINS-AS-A-UNIT IS RIGHT FOR DISPLAY IDENTITY AND WRONG FOR THESE: union-find guarantees the
 * group is CONNECTED, not that every member shares a reference with the DONOR, so in a chain A-B-C
 * taking A's links as a unit DELETES the uuids only C claimed. Unioning is safe in the direction the
 * deletion was not, the resolvers intersecting reference SETS. EXPORTED so the world-scope
 * projection DERIVES `sourceLinked` from it rather than restating the three names (issue 1380).
 */
export const SOURCE_LINK_FIELDS = Object.freeze([
  'originItemUuid',
  'registeredItemUuid',
  'aliasItemUuids',
]);

/**
 * The three `EssenceDefinition` fields the `effectSource` SECTION is spelled over. ONE LIST, THREE
 * DIRECTIONS OF TRAVEL, exported rather than restated. It is a BLOCK over the three names rather
 * than three sections, because a source is one choice: a per-field switch could name two Items.
 */
export const ESSENCE_EFFECT_SOURCE_FIELDS = Object.freeze([
  'sourceComponentId',
  'sourceItemUuid',
  'associatedSystemItemId',
]);

/** The identity fields lifted to a world entity, per entity type. */
const IDENTITY_FIELDS = Object.freeze({
  components: Object.freeze([
    'name',
    'img',
    'description',
    'originItemUuid',
    'registeredItemUuid',
    'aliasItemUuids',
  ]),
  essences: Object.freeze(['name', 'icon', 'colorToken', 'description']),
  tools: Object.freeze([
    'name',
    'img',
    'description',
    'originItemUuid',
    'registeredItemUuid',
    'aliasItemUuids',
  ]),
});

/** The identity fields lifted per entity type. Exported so the drift detector and the write-back read ONE list. */
export const WORLD_IDENTITY_FIELDS = IDENTITY_FIELDS;

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Every source reference a record carries, new-name-first and legacy-tolerant, in a stable order. */
export function sourceReferencesOf(record) {
  if (!isPlainObject(record)) return [];
  const refs = [];
  const push = (value) => {
    const ref = trimmedString(value);
    if (ref && !refs.includes(ref)) refs.push(ref);
  };
  push(record.originItemUuid);
  push(record.registeredItemUuid);
  push(record.sourceUuid);
  push(record.sourceItemUuid);
  const aliases = Array.isArray(record.aliasItemUuids)
    ? record.aliasItemUuids
    : arrayOf(record.fallbackItemIds);
  for (const alias of aliases) push(alias);
  return refs;
}

/**
 * The references a TOOL groups by: its own, else the component its `componentId` names IN THE SAME
 * SYSTEM, mirroring `deriveToolSourceFromComponents`'s guard exactly.
 */
export function toolSourceReferences(tool, components) {
  const own = sourceReferencesOf(tool);
  if (own.length > 0) return own;
  const componentId = trimmedString(tool?.componentId);
  if (!componentId) return [];
  const component = arrayOf(components).find(
    (entry) => isPlainObject(entry) && String(entry.id) === componentId
  );
  return component ? sourceReferencesOf(component) : [];
}

/** A minimal union-find over string keys. */
function createUnionFind() {
  const parent = new Map();
  const find = (key) => {
    if (!parent.has(key)) parent.set(key, key);
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression, so a long transitive chain does not re-walk on every lookup.
    let cursor = key;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  return {
    find,
    union(a, b) {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootB, rootA);
    },
  };
}

/** Every definition of one entity type across the corpus, in stored corpus order. */
function collectDefinitions(systems, entityType) {
  const field = ENTITY_TYPE_FIELDS[entityType];
  const definitions = [];
  for (const [systemIndex, system] of systems.entries()) {
    if (!isPlainObject(system)) continue;
    const systemId = trimmedString(system.id);
    if (!systemId) continue;
    for (const [index, record] of arrayOf(system[field]).entries()) {
      if (!isPlainObject(record)) continue;
      const id = trimmedString(record.id);
      if (!id) continue;
      definitions.push({ systemIndex, systemId, index, id, record });
    }
  }
  return definitions;
}

/** Partition one entity type's definitions into groups, each in corpus order. */
function partition(systems, entityType, refusedPairs) {
  const definitions = collectDefinitions(systems, entityType).filter(
    (definition) => !refusedPairs.has(`${definition.systemId}|${entityType}`)
  );
  if (entityType === 'essences') {
    const byId = new Map();
    for (const definition of definitions) {
      if (!byId.has(definition.id)) byId.set(definition.id, []);
      byId.get(definition.id).push(definition);
    }
    return [...byId.values()];
  }

  const componentsBySystem = new Map();
  for (const system of systems) {
    if (isPlainObject(system) && trimmedString(system.id)) {
      componentsBySystem.set(trimmedString(system.id), arrayOf(system.components));
    }
  }

  const unionFind = createUnionFind();
  const groupKeys = [];
  for (const definition of definitions) {
    const refs =
      entityType === 'tools'
        ? toolSourceReferences(definition.record, componentsBySystem.get(definition.systemId))
        : sourceReferencesOf(definition.record);
    // An UNLINKED definition is its own world entity and is NEVER merged: its group key is
    // per-definition, so no two unlinked records can land in one group.
    const ownKey = `def:${definition.systemId}:${entityType}:${definition.id}:${definition.index}`;
    groupKeys.push(ownKey);
    // Seeds the node so an unlinked definition still gets a root of its own.
    void unionFind.find(ownKey);
    for (const ref of refs) unionFind.union(ownKey, `ref:${ref}`);
  }

  const grouped = new Map();
  for (const [position, definition] of definitions.entries()) {
    const root = unionFind.find(groupKeys[position]);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(definition);
  }
  return [...grouped.values()];
}

/** Corpus order: oldest system first, then stored position within that system. */
function byCorpusPosition(left, right) {
  if (left.systemIndex !== right.systemIndex) return left.systemIndex - right.systemIndex;
  return left.index - right.index;
}

/**
 * The DISPLAY identity from one definition: ABSENCE-PRESERVING, with `aliasItemUuids` copied fresh.
 * The SOURCE-LINK fields are unioned by {@link groupIdentity} instead.
 */
export function identityOf(record, entityType) {
  const identity = {};
  for (const field of IDENTITY_FIELDS[entityType] ?? []) {
    const value = record?.[field];
    if (value === undefined) continue;
    identity[field] = Array.isArray(value) ? [...value] : value;
  }
  return identity;
}

/**
 * The identity a whole GROUP produces: display identity from the DONOR as a unit, source links
 * UNIONED in the SHIPPED SHAPE — the donor's primaries stay primary and the rest land in
 * `aliasItemUuids`, which is what every reader intersects against.
 */
export function groupIdentity(group, entityType) {
  const donor = group[0]?.record;
  const identity = identityOf(donor, entityType);
  if (!(IDENTITY_FIELDS[entityType] ?? []).includes('originItemUuid')) return identity;

  const primaries = [identity.originItemUuid, identity.registeredItemUuid].filter((ref) =>
    trimmedString(ref)
  );
  const aliases = [];
  for (const member of group) {
    for (const ref of sourceReferencesOf(member.record)) {
      if (primaries.includes(ref) || aliases.includes(ref)) continue;
      aliases.push(ref);
    }
  }
  // ABSENCE IS STILL PRESERVED: a group in which nothing claimed an alias emits no key, so an
  // unlinked entity is unchanged.
  if (aliases.length > 0) identity.aliasItemUuids = aliases;
  else if (Array.isArray(identity.aliasItemUuids) && identity.aliasItemUuids.length === 0) {
    identity.aliasItemUuids = [];
  }
  return identity;
}

/**
 * Whether the union kept every source reference this member claimed. IT IS A TAUTOLOGY UNDER
 * {@link groupIdentity}, AND SAYING SO IS THE POINT: it cannot currently answer `false`, and is kept
 * as a guard against a regression to donor-wins NARROWING. The reachable direction is
 * OVER-reporting, which `tests/world-scope-entity-grouping.test.js` pins.
 */
function unionAbsorbed(record, identity) {
  const kept = new Set([
    ...(trimmedString(identity.originItemUuid) ? [identity.originItemUuid] : []),
    ...(trimmedString(identity.registeredItemUuid) ? [identity.registeredItemUuid] : []),
    ...(Array.isArray(identity.aliasItemUuids) ? identity.aliasItemUuids : []),
  ]);
  return sourceReferencesOf(record).every((ref) => kept.has(ref));
}

/** Whether two identity projections disagree, and on which fields. */
function identityDifferences(left, right, entityType) {
  const changed = [];
  for (const field of IDENTITY_FIELDS[entityType] ?? []) {
    if (JSON.stringify(left?.[field] ?? null) !== JSON.stringify(right?.[field] ?? null)) {
      changed.push(field);
    }
  }
  return changed;
}

/** Claim a world id for one group. */
function claimWorldId(group, claimed) {
  for (const member of group) {
    if (!claimed.has(member.id)) return member.id;
  }
  const base = group[0].id;
  let suffix = 2;
  while (claimed.has(`${base}-w${suffix}`)) suffix += 1;
  return `${base}-w${suffix}`;
}

/** One derivation attempt, given a refusal set. */
function derive(systems, refusedPairs) {
  const entities = {};
  const rekeyMap = {};
  const renames = [];
  const mergedGroups = [];
  const transitiveGroups = [];

  for (const entityType of ENTITY_TYPES) {
    const claimed = new Set();
    const groups = partition(systems, entityType, refusedPairs)
      .map((group) => [...group].sort(byCorpusPosition))
      .sort((left, right) => byCorpusPosition(left[0], right[0]));
    entities[entityType] = [];

    for (const group of groups) {
      // This pass re-keys no essence id, so the group's shared id IS the world id and the ladder is
      // not consulted — running it would re-key an id this migration undertook never to re-key.
      const worldId = entityType === 'essences' ? group[0].id : claimWorldId(group, claimed);
      claimed.add(worldId);
      const donor = group[0];
      // Display identity from the DONOR as a unit; source links UNIONED across the group.
      const identity = groupIdentity(group, entityType);
      entities[entityType].push({
        id: worldId,
        entityType,
        identity,
        donorSystemId: donor.systemId,
        members: group.map((member) => ({
          systemId: member.systemId,
          oldId: member.id,
          index: member.index,
        })),
      });

      if (group.length > 1) {
        mergedGroups.push({
          entityType,
          entityId: worldId,
          systemIds: group.map((member) => member.systemId),
        });
      }
      // A group formed TRANSITIVELY from more than two definitions is reported with its members so
      // a GM can split an over-merge.
      if (group.length > 2) {
        transitiveGroups.push({
          entityType,
          entityId: worldId,
          members: group.map((member) => ({ systemId: member.systemId, oldId: member.id })),
        });
      }

      for (const member of group) {
        // Compared against the SAME projection the world entity took, so a member whose source
        // links were absorbed into the union does not read as an identity change it did not suffer.
        const changedFields = identityDifferences(
          identityOf(member.record, entityType),
          identity,
          entityType
        ).filter(
          (field) => !SOURCE_LINK_FIELDS.includes(field) || !unionAbsorbed(member.record, identity)
        );
        const reKeyed = member.id !== worldId;
        if (reKeyed && REKEYABLE_ENTITY_TYPES.includes(entityType)) {
          const perSystem = (rekeyMap[member.systemId] ??= {});
          const perType = (perSystem[entityType] ??= {});
          perType[member.id] = worldId;
        }
        // EVERY rename is reported, not only content-differing ones; a byte-identical group
        // produces none.
        if (reKeyed || changedFields.length > 0) {
          renames.push({
            entityType,
            entityId: worldId,
            systemId: member.systemId,
            donorSystemId: donor.systemId,
            oldId: member.id,
            newId: worldId,
            changedFields,
          });
        }
      }
    }
  }

  return { entities, rekeyMap, renames, mergedGroups, transitiveGroups };
}

/**
 * The `(system, entityType)` pairs whose map cannot be applied safely, on the two invariants the spec
 * section states — the second a POST-condition. A REFUSAL IS NOT ALWAYS CAUSED BY THIS PASS:
 * uniqueness is asserted over every pair, EMPTY map included, so a NATIVE duplicate fails on its own.
 */
function findRefusals(systems, rekeyMap) {
  const refusals = [];
  for (const system of systems) {
    if (!isPlainObject(system)) continue;
    const systemId = trimmedString(system.id);
    if (!systemId) continue;
    for (const entityType of REKEYABLE_ENTITY_TYPES) {
      const map = rekeyMap[systemId]?.[entityType] ?? {};
      const keys = new Set(Object.keys(map));
      const image = Object.values(map);
      if (image.some((value) => keys.has(value))) {
        refusals.push({ systemId, entityType, reason: 'nonDisjointMap' });
        continue;
      }
      const emitted = arrayOf(system[ENTITY_TYPE_FIELDS[entityType]])
        .filter((record) => isPlainObject(record) && trimmedString(record.id))
        .map((record) => map[trimmedString(record.id)] ?? trimmedString(record.id));
      if (new Set(emitted).size !== emitted.length) {
        refusals.push({ systemId, entityType, reason: 'outputIdCollision' });
      }
    }
  }
  return refusals;
}

/**
 * Group every system's entities, choose one identity per group, and produce the re-key map. TOTAL
 * AND NON-THROWING, and fully determined by the corpus, so a re-run answers byte-identically.
 */
export function buildWorldScopeGrouping(systems) {
  const safeSystems = arrayOf(systems);
  const refusedPairs = new Set();
  const refusals = [];
  // The refusal set only ever GROWS and is bounded by the pair count, so this terminates. The bound
  // is a literal guard rather than trusted, because a migration that spins is indistinguishable from
  // a hung world.
  const bound = safeSystems.length * REKEYABLE_ENTITY_TYPES.length + 1;
  let derived = derive(safeSystems, refusedPairs);
  for (let iteration = 0; iteration <= bound; iteration += 1) {
    const found = findRefusals(safeSystems, derived.rekeyMap).filter(
      (refusal) => !refusedPairs.has(`${refusal.systemId}|${refusal.entityType}`)
    );
    if (found.length === 0) break;
    for (const refusal of found) {
      refusedPairs.add(`${refusal.systemId}|${refusal.entityType}`);
      refusals.push(refusal);
    }
    derived = derive(safeSystems, refusedPairs);
  }

  return { ...derived, refusals };
}

/** Whether a `(system, entityType)` pair was refused. */
export function isRefusedPair(refusals, systemId, entityType) {
  return arrayOf(refusals).some(
    (refusal) => refusal?.systemId === systemId && refusal?.entityType === entityType
  );
}
