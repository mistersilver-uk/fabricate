/**
 * 1.30.0 — GROUPING, IDENTITY AND THE PER-SYSTEM RE-KEY MAP for the world-scope entity
 * migration (issue 1363, epic 1357, PR 3).
 *
 * This module answers three questions and nothing else, so the migration that consumes it
 * (`migrateWorldScopeEntities.js`) can be read as an ordering of writes rather than as an
 * algorithm:
 *
 *   1. WHICH in-system definitions across every crafting system are the SAME real thing;
 *   2. WHICH identity that thing takes, and under WHICH id;
 *   3. WHICH old ids each system must rewrite, or whether that system's rewrite is REFUSED.
 *
 * TOTAL AND NON-THROWING, on the `normalizeModifierLibrary` contract: a non-array corpus, a
 * malformed system, a null definition and a self-referential record all answer an empty or
 * partial result rather than raising. A migration that throws aborts the whole pass.
 *
 * ## Grouping (`#### D2`)
 *
 * COMPONENTS AND TOOLS group by TRANSITIVE CLOSURE over source-reference sets — union-find
 * over `{originItemUuid, registeredItemUuid, ...aliasItemUuids}` and their pre-#560 aliases.
 * The key is deliberately NOT a single canonical field, because two systems that registered
 * the same Item by different routes carry different ones. Union-find is permutation-invariant,
 * so the PARTITION is set-equal under a shuffled corpus.
 *
 * A tool with no source references of its own resolves through its `componentId`, applying the
 * same derivation the normalizer does (`deriveToolSourceFromComponents`). The migration must do
 * it itself, because it runs on raw settings before any manager load.
 *
 * ESSENCES group by trimmed `id`. An essence has no source item; `sourceComponentId` is a
 * component reference, not identity. Ids are stable semantic slugs, so two systems' `fire` are
 * intended to be one essence. ESSENCE IDS ARE NEVER RE-KEYED, so no essence reference is
 * rewritten and the re-key map carries no essence leg.
 *
 * AN UNLINKED DEFINITION BECOMES ITS OWN WORLD ENTITY AND IS NEVER MERGED — not with another
 * unlinked definition of the same name, not with a linked one. Two unlinked "Ash Salt"s in two
 * systems are not provably the same thing, and merging on a name would be a silent irreversible
 * content change made on a guess.
 *
 * ## "Oldest" (`#### D3`)
 *
 * STORED CORPUS POSITION. Systems carry no timestamp and `randomID()` is not time-ordered, so
 * array position is the only age fact the corpus holds; `createSystem` appends. This is a
 * DECLARED, REPORTED exception to `destructive-changes-and-migrations` § Migration Registry's
 * "a migration MUST NOT depend on corpus order", carved out under three conditions: declared in
 * this migration's own spec section, the entity PARTITION still permutation-invariant, and every
 * identity choice that changes a visible field reported by name.
 *
 * On a disagreement the oldest contributing definition wins every identity field AS A UNIT,
 * never field-by-field, so no chimera identity is minted.
 *
 * ## The id-claim ladder (`#### D3`)
 *
 * Deterministic, so a re-run chooses identically: the oldest contributing id if unclaimed; else
 * the next-oldest if unclaimed; else `<oldestId>-w<n>` with the smallest unclaimed `n >= 2`.
 * Steps 2 and 3 exist because component and tool ids are NOT globally unique — copy-import
 * preserves them.
 *
 * ## Refusal, and why it is a FIXED POINT (`#### D3`)
 *
 * The map is built and applied PER SYSTEM, because the same old id in two systems can name two
 * different components. After dropping identity entries the image must be disjoint from the key
 * set; and the OUTPUT ids must be unique per `(system, entityType)`, because disjointness alone
 * does not forbid an output id colliding with an id in the same pair that was NOT re-keyed, and
 * such a duplicate is silently last-wins in both index builders — making a definition
 * unreachable with no error. If either invariant fails, the pass REFUSES that pair entirely: no
 * lift, no re-key, no membership. That is #1313's paired-predicate rule applied literally.
 *
 * Refusing a pair REMOVES its definitions from every group they belonged to, which can change
 * the identity donor and the claimed id of a group — and therefore the maps of OTHER systems.
 * So the derivation is iterated to a FIXED POINT. The refusal set only ever grows and is bounded
 * by the number of `(system, entityType)` pairs, so the loop terminates.
 */

const ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/**
 * The `craftingSystem` array each entity type is stored under.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ENTITY_TYPE_FIELDS = Object.freeze({
  components: 'components',
  essences: 'essenceDefinitions',
  tools: 'tools',
});

/**
 * The entity types whose ids this pass may RE-KEY. Essences are deliberately absent
 * (`#### D2`): they group by id, so their id never changes and no essence reference is
 * rewritten.
 *
 * @type {readonly string[]}
 */
export const REKEYABLE_ENTITY_TYPES = Object.freeze(['components', 'tools']);

/**
 * The SOURCE-LINK fields, which are UNIONED across the group rather than taken from the donor.
 *
 * DONOR-WINS-AS-A-UNIT IS RIGHT FOR DISPLAY IDENTITY AND WRONG FOR THESE. Union-find guarantees
 * only that the group is connected, not that every member shares a reference with the DONOR: in
 * a chain A-B-C where C shares a uuid with B and nothing with A, taking A's links as a unit
 * DELETES C's unique uuids permanently. An owned Item sourced from one of them then stops
 * resolving at the source-reference tier - which is precisely the tier this whole change's
 * degradation story rests on as the safe fallback while the identity-flag remap has not run.
 *
 * Unioning is safe in the direction the deletion was not: a source reference is a CLAIM that this
 * entity is that Item, every member of the group has already made its own claim, and the resolvers
 * intersect reference SETS rather than compare them, so a longer list resolves strictly more.
 *
 * @type {readonly string[]}
 */
const SOURCE_LINK_FIELDS = Object.freeze([
  'originItemUuid',
  'registeredItemUuid',
  'aliasItemUuids',
]);

/** The identity fields lifted to a world entity, per entity type (`#### D1`). */
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

/**
 * The identity fields lifted to a world entity, per entity type. Exported so the drift
 * detector and the migration's own write-back read ONE list rather than three copies.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const WORLD_IDENTITY_FIELDS = IDENTITY_FIELDS;

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Every source reference a component- or tool-shaped record carries, new-name-first and
 * legacy-name-tolerant, in a stable order.
 *
 * @param {unknown} record
 * @returns {string[]}
 */
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
 * The source references a TOOL groups by: its own, or — when it has none — those of the
 * component its `componentId` names IN THE SAME SYSTEM.
 *
 * Mirrors `deriveToolSourceFromComponents`'s guard exactly (own refs win; a dangling
 * `componentId` derives nothing), so the grouping this pass performs on raw settings agrees
 * with the derivation the manager performs on load.
 *
 * @param {unknown} tool
 * @param {Array<object>} components The OWNING system's component array.
 * @returns {string[]}
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

/**
 * Every definition of one entity type across the corpus, in stored corpus order.
 *
 * @param {Array<object>} systems
 * @param {string} entityType
 * @returns {Array<{systemIndex: number, systemId: string, index: number, id: string,
 *   record: object}>}
 */
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

/**
 * Partition one entity type's definitions into groups.
 *
 * @param {Array<object>} systems
 * @param {string} entityType
 * @param {ReadonlySet<string>} refusedPairs `${systemId}|${entityType}` pairs to exclude.
 * @returns {Array<Array<object>>} groups, each in corpus order, ordered by oldest member.
 */
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
    // An UNLINKED definition is its own world entity and is NEVER merged. Its group key is
    // per-definition, so no two unlinked records can ever land in one group.
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
 * The identity a world entity takes from one definition.
 *
 * ABSENCE-PRESERVING: a field the donor does not carry is not minted. `aliasItemUuids` is
 * copied as a fresh array so the world entity never aliases the in-system record.
 *
 * DISPLAY IDENTITY ONLY. The three SOURCE-LINK fields are unioned across the group by
 * {@link groupIdentity} instead; see {@link SOURCE_LINK_FIELDS} for why donor-wins deletes data
 * there.
 *
 * @param {object} record
 * @param {string} entityType
 * @returns {object}
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
 * The identity a world entity takes from a whole GROUP: display identity from the DONOR as a
 * unit, source links UNIONED across every member.
 *
 * The union is emitted in the SHIPPED SHAPE rather than as one flat list, because that shape is
 * what every reader already intersects against: the donor's own `originItemUuid` and
 * `registeredItemUuid` are preserved as the primaries, and every other reference any member
 * claimed - including the other members' primaries - lands in `aliasItemUuids`, de-duplicated and
 * with the two primaries excluded exactly as `_normalizeComponent` and `_normalizeTool` emit them.
 *
 * @param {Array<{record: object}>} group Members in corpus order; the first is the donor.
 * @param {string} entityType
 * @returns {object}
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
  // ABSENCE IS STILL PRESERVED: a group in which nothing claimed an alias emits no key, exactly
  // as the donor-only projection did, so an unlinked entity is unchanged.
  if (aliases.length > 0) identity.aliasItemUuids = aliases;
  else if (Array.isArray(identity.aliasItemUuids) && identity.aliasItemUuids.length === 0) {
    identity.aliasItemUuids = [];
  }
  return identity;
}

/**
 * Whether the union kept every source reference this member claimed.
 *
 * A member whose references are all present in the world entity's union lost nothing, so the
 * difference in field SHAPE is not a rename a GM needs to see. A member that lost one still
 * reports.
 *
 * **IT IS A TAUTOLOGY UNDER {@link groupIdentity}, AND SAYING SO IS THE POINT.** That function
 * collects EVERY member's references into `primaries ∪ aliases`, so `kept` is a superset of every
 * member's own reference set and this predicate cannot currently answer `false`. Measured: forcing
 * it to `true` leaves the acceptance corpus's rename report byte-identical, so its greenness under
 * that mutation is a property of the union rather than a coverage gap, and no test can redden it.
 * It is kept as a guard against a regression to donor-wins NARROWING, which is the one change that
 * would make it answer `false` and start reporting the loss.
 *
 * The direction that IS reachable is over-reporting: forcing it to `false`, or dropping the filter
 * that calls it, tells the GM about renames that never happened - including the DONOR being told
 * its own identity changed inside its own group. `tests/world-scope-entity-grouping.test.js` pins
 * that direction.
 *
 * @param {object} record
 * @param {object} identity
 * @returns {boolean}
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

/**
 * Claim a world id for one group.
 *
 * @param {Array<object>} group Members in corpus order.
 * @param {Set<string>} claimed Ids already claimed for this entity type.
 * @returns {string}
 */
function claimWorldId(group, claimed) {
  for (const member of group) {
    if (!claimed.has(member.id)) return member.id;
  }
  const base = group[0].id;
  let suffix = 2;
  while (claimed.has(`${base}-w${suffix}`)) suffix += 1;
  return `${base}-w${suffix}`;
}

/**
 * One derivation attempt, given a refusal set.
 *
 * @param {Array<object>} systems
 * @param {ReadonlySet<string>} refusedPairs
 * @returns {object}
 */
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
      // Essence ids are NEVER re-keyed, so the group's shared id IS the world id and the
      // ladder is not consulted. Running the ladder would mint `fire-w2` for the second
      // system's `fire` and re-key an id this migration has undertaken never to re-key.
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
      // A group formed TRANSITIVELY from more than two definitions is reported with its
      // members so a GM can split an over-merge.
      if (group.length > 2) {
        transitiveGroups.push({
          entityType,
          entityId: worldId,
          members: group.map((member) => ({ systemId: member.systemId, oldId: member.id })),
        });
      }

      for (const member of group) {
        // Compared against the SAME projection the world entity took, so a member whose source
        // links were absorbed into the union does not read as an identity change it did not
        // suffer - it kept every reference it claimed.
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
 * The `(system, entityType)` pairs whose re-key map cannot be applied safely.
 *
 * TWO invariants, and the second is a POST-condition rather than a pre-condition:
 *
 *   - DISJOINTNESS — the map's image must not intersect its key set, or a single simultaneous
 *     lookup is not idempotent and a second application re-keys a re-keyed id.
 *   - OUTPUT UNIQUENESS — the ids the pair emits must be unique. Disjointness does not forbid
 *     an output id colliding with an id in the same pair that was NOT re-keyed, and such a
 *     duplicate is silently last-wins in both index builders, making a definition unreachable
 *     with no error.
 *
 * A REFUSAL IS NOT ALWAYS CAUSED BY THIS PASS. Output uniqueness is asserted over every pair,
 * including one with an EMPTY map, so a system carrying a NATIVE duplicate definition id fails it
 * on its own. That is deliberate - such a system already has an unreachable definition and must
 * not have a lift layered on top of it - but it has a visible consequence worth naming: refusing
 * a pair removes its definitions from every group they belonged to, which can change ANOTHER
 * system's elected identity donor. Every such change is reported as an ordinary rename, and the
 * refusal itself is reported with its reason.
 *
 * @param {Array<object>} systems
 * @param {object} rekeyMap
 * @returns {Array<{systemId: string, entityType: string, reason: string}>}
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
 * Group every crafting system's components, essences and tools into world entities, choose one
 * identity per group, and produce the per-system re-key map.
 *
 * TOTAL AND NON-THROWING. The result is fully determined by the corpus, so a re-run on the same
 * input produces a byte-identical answer.
 *
 * @param {unknown} systems The raw `craftingSystems` setting.
 * @returns {{entities: Record<string, Array<object>>, rekeyMap: object,
 *   renames: Array<object>, mergedGroups: Array<object>, transitiveGroups: Array<object>,
 *   refusals: Array<{systemId: string, entityType: string, reason: string}>}}
 */
export function buildWorldScopeGrouping(systems) {
  const safeSystems = arrayOf(systems);
  const refusedPairs = new Set();
  const refusals = [];
  // The refusal set only ever GROWS and is bounded by the number of `(system, entityType)`
  // pairs, so this terminates. The bound is stated as a literal guard rather than trusted,
  // because a migration that spins is indistinguishable from a hung world.
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

/**
 * Whether a `(system, entityType)` pair was refused.
 *
 * @param {Array<object>} refusals
 * @param {string} systemId
 * @param {string} entityType
 * @returns {boolean}
 */
export function isRefusedPair(refusals, systemId, entityType) {
  return arrayOf(refusals).some(
    (refusal) => refusal?.systemId === systemId && refusal?.entityType === entityType
  );
}
