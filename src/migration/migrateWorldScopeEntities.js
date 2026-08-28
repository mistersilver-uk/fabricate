/**
 * 1.30.0 — THE WORLD-SCOPE ENTITY MIGRATION (issue 1363, epic 1357, PR 3).
 *
 * Creates one WORLD ENTITY per resolved source item across every crafting system, re-keys every
 * other member of the group to that id, rewrites every reference the re-key invalidates, and
 * writes one fully-overriding SYSTEM MEMBERSHIP RECORD per original definition — so no system's
 * resolved behaviour changes.
 *
 * PURE, NON-MUTATING AND IDEMPOTENT. It clones what it transforms and returns the ORIGINAL
 * object for any key it did not change, so the runner's per-setting JSON comparison declines to
 * write an unchanged leg.
 *
 * ## THE ORDER IS LOAD-BEARING (`#### D6`)
 *
 * The rewrite runs FIRST, and the three scope payloads are built FROM THE REWRITTEN RECORDS.
 * Three lifted values contain component ids this same pass re-keys — essence `effectSource`,
 * tool `onBreak.replacementTarget.componentId` and tool `repairRequirements` — so a payload
 * built pre-rewrite would ship a membership record naming a retired id in every migrated world,
 * and the per-pair LIFT guard is keyed on the NEW pair, so a re-run would skip it and the stale
 * ids would persist permanently. The shared walk then runs over the three payloads as a FOURTH
 * target as a belt-and-braces check; on a correctly ordered pass it finds nothing to change.
 *
 * ## THE TWO HALVES, AND WHY THEY ARE GATED DIFFERENTLY (`#### D7`, `#### D12`)
 *
 * - The LIFT/CLAIM half is gated PER `(entityId, systemId)` on a CORPUS-DERIVED predicate — the
 *   world corpus already holds a membership record for that pair — never on `migrationVersion`.
 *   `1.28.0`'s "this key has entries" disjunction is not reusable: any GM edit seeds a key, and
 *   migrations run on the active GM alone, so key presence does not prove this pass ran.
 * - The REWRITE half runs UNCONDITIONALLY over `recipes`, `craftingSystems`, `gatheringConfig`
 *   and the three scope payloads, driven by the persisted re-key map alone. It is idempotent by
 *   construction, because each system's map has an image disjoint from its keys and every site
 *   does a single simultaneous lookup.
 *
 * **THE IN-SYSTEM IDENTITY WRITE-BACK RUNS WITH THE UNGUARDED HALF.** It is identity work and
 * sits between the rewrite and the payload build, so it reads as LIFT — but a tear between the
 * three scope legs and `craftingSystems` would then make the re-run skip it, leaving world
 * entities holding merged identity while in-system records keep their original identity, and
 * `#### D11`'s load-bearing equality claim FALSE on a repaired world. On a re-run the merged
 * identity is read from the PERSISTED SCOPE PAYLOADS, keyed by the mapped NEW id, because the
 * map carries old-to-new IDS and no identity VALUES.
 *
 * ## NO WORLD DEFAULTS ARE WRITTEN (`#### D1`)
 *
 * There is no unambiguous source to lift a behaviour default FROM: `#### D3`'s oldest-wins rule
 * is scoped to IDENTITY and wins every identity field as a unit; extending it to behaviour would
 * silently elect one of three systems' repair recipes, breakage modes and effect sources as the
 * value every future member inherits. Every membership record is created fully overriding, so no
 * section resolves through the world layer at migration time and resolution is bit-identical.
 *
 * The `defaults` SUB-KEY is still written, as an EMPTY MAP: `carriedSubKeys` keys seededness on
 * key PRESENCE rather than content, so writing it seeds `defaults` and the persisted shape
 * round-trips through `ScopedDefinitionStore#get` / `save` unchanged.
 */

import {
  buildWorldScopeGrouping,
  ENTITY_TYPE_FIELDS,
  isRefusedPair,
  REKEYABLE_ENTITY_TYPES,
  WORLD_IDENTITY_FIELDS,
} from './worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
} from './worldScopeReferenceRewrite.js';

/** The `data` keys the three scope payloads travel under inside the migration runner. */
export const SCOPE_PAYLOAD_KEYS = Object.freeze({
  components: 'componentScope',
  essences: 'essenceScope',
  tools: 'toolScope',
});

/** The membership `inherit` map each entity type is created with — every section OVERRIDDEN. */
const OVERRIDING_INHERIT = Object.freeze({
  components: Object.freeze({ category: false }),
  essences: Object.freeze({ effectSource: false, macro: false }),
  tools: Object.freeze({ breakage: false, onBreak: false }),
});

const ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The membership map key, spelled exactly as `scopedDefinitions.membershipKey` spells it. */
function membershipKeyOf(entityId, systemId) {
  return `${entityId}|${systemId}`;
}

/**
 * Normalize a persisted re-key map to `{ [systemId]: { components: {}, tools: {} } }`, dropping
 * anything that cannot be one. TOTAL: a hand-edited or absent value answers `{}`.
 *
 * @param {unknown} raw
 * @returns {object}
 */
export function normalizeRekeyMap(raw) {
  if (!isPlainObject(raw)) return {};
  const normalized = {};
  for (const [systemId, perSystem] of Object.entries(raw)) {
    if (!trimmedString(systemId) || !isPlainObject(perSystem)) continue;
    const legs = {};
    for (const entityType of REKEYABLE_ENTITY_TYPES) {
      const leg = perSystem[entityType];
      if (!isPlainObject(leg)) continue;
      const pairs = {};
      for (const [oldId, newId] of Object.entries(leg)) {
        if (trimmedString(oldId) && trimmedString(newId)) pairs[oldId] = newId;
      }
      if (Object.keys(pairs).length > 0) legs[entityType] = pairs;
    }
    if (Object.keys(legs).length > 0) normalized[systemId] = legs;
  }
  return normalized;
}

/** Whether a normalized re-key map carries any pair at all. */
function mapHasEntries(map) {
  return Object.keys(map).length > 0;
}

/**
 * The identity projection of one record, for the write-back and the drift detector.
 *
 * @param {object} record
 * @param {string} entityType
 * @returns {object}
 */
function projectIdentity(record, entityType) {
  const identity = {};
  for (const field of WORLD_IDENTITY_FIELDS[entityType] ?? []) {
    if (record?.[field] === undefined) continue;
    identity[field] = Array.isArray(record[field]) ? [...record[field]] : record[field];
  }
  return identity;
}

/**
 * Apply a merged identity onto one in-system record, IN PLACE.
 *
 * ABSENCE IS PART OF THE UNIT. A field the world entity does not carry is DELETED from the
 * record rather than left, because `#### D3`'s rule is that the oldest contributing definition
 * wins every identity field AS A UNIT — and because `reportWorldIdentityDrift`'s zero case is
 * only true if the two copies agree on absence as well as on value.
 *
 * @param {object} record
 * @param {object} identity
 * @param {string} entityType
 * @returns {boolean} whether anything changed.
 */
function applyIdentity(record, identity, entityType) {
  let changed = false;
  for (const field of WORLD_IDENTITY_FIELDS[entityType] ?? []) {
    const next = identity?.[field];
    if (next === undefined) {
      if (field in record) {
        delete record[field];
        changed = true;
      }
      continue;
    }
    const value = Array.isArray(next) ? [...next] : next;
    if (JSON.stringify(record[field]) !== JSON.stringify(value)) {
      record[field] = value;
      changed = true;
    }
  }
  return changed;
}

/**
 * The membership record one in-system definition produces — every section OVERRIDDEN, each
 * value copied verbatim from that system's own definition (`#### D6`).
 *
 * @param {object} record The REWRITTEN in-system definition.
 * @param {string} entityType
 * @param {string} entityId
 * @param {string} systemId
 * @returns {object}
 */
export function buildMembershipRecord(record, entityType, entityId, systemId) {
  const membership = {
    entityId,
    systemId,
    inherit: { ...OVERRIDING_INHERIT[entityType] },
  };
  if (entityType === 'components') {
    // `category` verbatim, because this is an OVERRIDE and `general` is a legitimate stored
    // token there. The `general` prohibition binds an absence-preserving WORLD default, which
    // this pass writes none of. `tags` verbatim and NO `mutedTags`: the tag merge is ADDITIVE
    // with no inherit switch, so a world tag list would be granted to every member system at
    // once — which is why no world tag list is written either.
    if (trimmedString(record.category)) membership.category = record.category.trim();
    const tags = arrayOf(record.tags).filter((tag) => trimmedString(tag));
    if (tags.length > 0) membership.tags = tags.map((tag) => tag.trim());
    return membership;
  }
  if (entityType === 'essences') {
    // WRITTEN FOR EVERY ESSENCE, world-addressable or not: the world-addressability constraint
    // binds a WORLD essence default, and this pass writes none, so it is satisfied vacuously
    // and the uniform system-side rule is applied to all of them.
    const effectSource = {};
    for (const field of ['sourceComponentId', 'sourceItemUuid', 'associatedSystemItemId']) {
      if (record[field] !== undefined) effectSource[field] = record[field];
    }
    membership.effectSource = effectSource;
    if (record.propertyMacroUuid !== undefined) membership.macro = record.propertyMacroUuid;
    membership.enabled = record.enabled !== false;
    return membership;
  }
  if (record.breakage !== undefined) membership.breakage = cloneJson(record.breakage);
  if (record.onBreak !== undefined) membership.onBreak = cloneJson(record.onBreak);
  if (Array.isArray(record.repairRequirements)) {
    membership.repairRequirements = cloneJson(record.repairRequirements);
  }
  membership.enabled = record.enabled !== false;
  return membership;
}

/**
 * The persisted scope payload for one entity type, or the ORIGINAL when nothing changed.
 *
 * @param {unknown} existing The persisted value.
 * @returns {{entities: Array<object>, defaults: object, membership: object}}
 */
function readScopePayload(existing) {
  const source = isPlainObject(existing) ? existing : {};
  const entities = arrayOf(source.entities).filter((entry) => isPlainObject(entry));
  const defaults = isPlainObject(source.defaults) ? { ...source.defaults } : {};
  const membership = isPlainObject(source.membership) ? { ...source.membership } : {};
  return {
    entities: cloneJson(entities),
    defaults: cloneJson(defaults),
    membership: cloneJson(membership),
  };
}

/**
 * A component id that is plausibly a definition id rather than a document UUID.
 *
 * `sourceItemUuid` legitimately holds EITHER, and a document UUID is not a dangling component
 * reference, so the dangling-reference report excludes anything dotted. Definition ids are
 * `randomID()` output, which never contains a dot.
 */
function looksLikeDefinitionId(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('.');
}

/**
 * Collect every component and tool reference one system reaches, THROUGH THE SHARED WALK.
 *
 * Driving the rewrite functions with recording remappers is deliberate: a second traversal
 * written by hand is a mirror of the enumeration, and mirrors rot. This one cannot report a
 * site the rewrite does not visit, and vice versa.
 *
 * @param {object} system
 * @param {Array<object>} recipes That system's recipes.
 * @param {object|null} gatheringSlice That system's `gatheringConfig.systems[id]` block.
 * @returns {{componentIds: Set<string>, toolIds: Set<string>}}
 */
function collectSystemReferences(system, recipes, gatheringSlice) {
  const componentIds = new Set();
  const toolIds = new Set();
  const remapComponent = (value) => {
    if (looksLikeDefinitionId(value)) componentIds.add(value.trim());
    return value;
  };
  const remapTool = (value) => {
    if (looksLikeDefinitionId(value)) toolIds.add(value.trim());
    return value;
  };
  const remappers = { remapComponent, remapTool };
  // A CLONE, because the collectors are driven through the mutating walk: returning the value
  // unchanged makes each write a no-op, but a walk is still a walk and must not be pointed at
  // the payload the caller is about to persist.
  const probe = cloneJson({ system, recipes, gatheringSlice });
  rewriteSystemReferences(probe.system, remappers);
  for (const recipe of arrayOf(probe.recipes)) rewriteRecipeReferences(recipe, remappers);
  rewriteGatheringSliceReferences(probe.gatheringSlice, remappers);
  return { componentIds, toolIds };
}

/**
 * The references `#### D10`'s newly-decidable Valid Id Basis will prune on the next save.
 *
 * Once the scope settings are seeded, `_scopeEntityBasis` reports KNOWN for a system whose
 * in-system array is EMPTY, where it previously reported `null`. A genuinely dangling reference
 * there becomes prunable on the first save after upgrade, permanently, because `_normalizeSystem`
 * is an allowlist rebuild. That is CORRECT — the basis really is known-complete now — but it is a
 * destructive consequence this migration causes, so it is computed and reported by name.
 *
 * @param {Array<object>} systems The REWRITTEN systems.
 * @param {Array<object>} recipes The REWRITTEN recipes.
 * @param {object} gatheringConfig The REWRITTEN gathering config.
 * @param {Record<string, Set<string>>} worldRoster Entity ids per entity type.
 * @returns {Array<{systemId: string, entityType: string, referenceId: string}>}
 */
function computeFlaggedForReview(systems, recipes, gatheringConfig, worldRoster) {
  const flagged = [];
  for (const system of arrayOf(systems)) {
    const systemId = trimmedString(system?.id);
    if (!systemId) continue;
    const ownComponents = new Set(
      arrayOf(system.components)
        .map((record) => trimmedString(record?.id))
        .filter(Boolean)
    );
    const ownTools = new Set(
      arrayOf(system.tools)
        .map((record) => trimmedString(record?.id))
        .filter(Boolean)
    );
    const systemRecipes = arrayOf(recipes).filter(
      (recipe) => trimmedString(recipe?.craftingSystemId) === systemId
    );
    const slice = isPlainObject(gatheringConfig?.systems)
      ? gatheringConfig.systems[systemId]
      : null;
    const { componentIds, toolIds } = collectSystemReferences(system, systemRecipes, slice ?? null);
    for (const referenceId of componentIds) {
      if (ownComponents.has(referenceId) || worldRoster.components.has(referenceId)) continue;
      flagged.push({ systemId, entityType: 'components', referenceId });
    }
    for (const referenceId of toolIds) {
      if (ownTools.has(referenceId) || worldRoster.tools.has(referenceId)) continue;
      flagged.push({ systemId, entityType: 'tools', referenceId });
    }
  }
  return flagged;
}

/**
 * Run the whole `1.30.0` world-scope entity transform.
 *
 * @param {object} data The runner's payload.
 * @returns {object} The keys this migration changed, plus the transient
 *   `_worldScopeEntityReport`. Every unchanged key answers its ORIGINAL object.
 */
export function migrateWorldScopeEntities(data) {
  if (!isPlainObject(data)) return data;
  const originalSystems = arrayOf(data.systems);
  const originalRecipes = arrayOf(data.recipes);
  const originalGatheringConfig = isPlainObject(data.gatheringConfig) ? data.gatheringConfig : {};

  const systems = cloneJson(originalSystems);
  const recipes = cloneJson(originalRecipes);
  const gatheringConfig = cloneJson(originalGatheringConfig);

  const persistedMap = normalizeRekeyMap(data.worldScopeRekeyMap);
  const reusingPersistedMap = mapHasEntries(persistedMap);
  // The grouping is derived on EVERY pass: it supplies the world roster, the memberships and
  // the report. Only its MAP is discarded on a re-run — a torn run may already have re-keyed
  // `craftingSystems`, from which the derived map would be empty while `gatheringConfig` still
  // holds the old ids.
  const grouping = buildWorldScopeGrouping(systems);
  const rekeyMap = reusingPersistedMap ? persistedMap : grouping.rekeyMap;

  const payloads = {};
  for (const entityType of ENTITY_TYPES) {
    payloads[entityType] = readScopePayload(data[SCOPE_PAYLOAD_KEYS[entityType]]);
  }

  // -------------------------------------------------------------------------
  // 1. THE REWRITE HALF — unconditional, driven by the map alone.
  // -------------------------------------------------------------------------
  const recipesBySystem = new Map();
  for (const recipe of recipes) {
    const systemId = trimmedString(recipe?.craftingSystemId);
    if (!systemId) continue;
    if (!recipesBySystem.has(systemId)) recipesBySystem.set(systemId, []);
    recipesBySystem.get(systemId).push(recipe);
  }

  for (const system of systems) {
    const systemId = trimmedString(system?.id);
    if (!systemId) continue;
    const perSystem = rekeyMap[systemId];
    if (!perSystem) continue;
    const remappers = {
      remapComponent: keyedRemapper(perSystem.components),
      remapTool: keyedRemapper(perSystem.tools),
    };
    // The DEFINITION ids themselves, then every reference to them.
    for (const entityType of REKEYABLE_ENTITY_TYPES) {
      const leg = perSystem[entityType] ?? {};
      for (const record of arrayOf(system[ENTITY_TYPE_FIELDS[entityType]])) {
        const id = trimmedString(record?.id);
        if (id && Object.prototype.hasOwnProperty.call(leg, id)) record.id = leg[id];
      }
    }
    rewriteSystemReferences(system, remappers);
    for (const recipe of recipesBySystem.get(systemId) ?? []) {
      rewriteRecipeReferences(recipe, remappers);
    }
    if (isPlainObject(gatheringConfig.systems)) {
      rewriteGatheringSliceReferences(gatheringConfig.systems[systemId], remappers);
    }
    // The three scope payloads as a FOURTH target. On a correctly ordered pass this finds
    // nothing to change; it is the belt-and-braces arm, and a test asserts it is inert.
    for (const entityType of ENTITY_TYPES) {
      for (const record of Object.values(payloads[entityType].membership)) {
        if (record?.systemId === systemId)
          rewriteMembershipReferences(record, entityType, remappers);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. THE IN-SYSTEM IDENTITY WRITE-BACK — also unconditional. See the module note.
  // -------------------------------------------------------------------------
  const identityByNewId = {};
  for (const entityType of ENTITY_TYPES) {
    const lookup = new Map();
    // On a re-run the source is the PERSISTED SCOPE PAYLOAD, keyed by the mapped NEW id.
    for (const entity of payloads[entityType].entities) {
      const id = trimmedString(entity?.id);
      if (id) lookup.set(id, projectIdentity(entity, entityType));
    }
    // A fresh pass, or a tear before the scope legs landed, has no persisted payload to read;
    // the grouping is then the only source and is correct, because `craftingSystems` still
    // carries the pre-re-key ids the grouping was derived from.
    for (const entity of grouping.entities[entityType]) {
      if (!lookup.has(entity.id)) lookup.set(entity.id, entity.identity);
    }
    identityByNewId[entityType] = lookup;
  }

  let overriddenRecords = 0;
  for (const system of systems) {
    const systemId = trimmedString(system?.id);
    if (!systemId) continue;
    for (const entityType of ENTITY_TYPES) {
      if (isRefusedPair(grouping.refusals, systemId, entityType)) continue;
      for (const record of arrayOf(system[ENTITY_TYPE_FIELDS[entityType]])) {
        const id = trimmedString(record?.id);
        if (!id) continue;
        const identity = identityByNewId[entityType].get(id);
        if (identity) applyIdentity(record, identity, entityType);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. THE LIFT/CLAIM HALF — gated PER `(entityId, systemId)` on the corpus.
  // -------------------------------------------------------------------------
  const createdEntities = { components: 0, essences: 0, tools: 0 };
  const systemsById = new Map(
    systems.filter((system) => trimmedString(system?.id)).map((system) => [system.id, system])
  );

  for (const entityType of ENTITY_TYPES) {
    const payload = payloads[entityType];
    const entityIds = new Set(payload.entities.map((entity) => entity.id));
    for (const entity of grouping.entities[entityType]) {
      const liveMembers = entity.members.filter(
        (member) => !isRefusedPair(grouping.refusals, member.systemId, entityType)
      );
      if (liveMembers.length === 0) continue;
      if (!entityIds.has(entity.id)) {
        payload.entities.push({ id: entity.id, ...entity.identity });
        entityIds.add(entity.id);
        createdEntities[entityType] += 1;
      }
      for (const member of liveMembers) {
        const key = membershipKeyOf(entity.id, member.systemId);
        // THE GUARD, corpus-derived and per pair. Never `migrationVersion`, and never a
        // disjunction across the three keys: any GM edit seeds a key, and migrations run on
        // the active GM alone, so "this key has entries" does not prove this pass ran.
        if (payload.membership[key]) continue;
        const system = systemsById.get(member.systemId);
        const record = arrayOf(system?.[ENTITY_TYPE_FIELDS[entityType]]).find(
          (candidate) => trimmedString(candidate?.id) === entity.id
        );
        if (!record) continue;
        payload.membership[key] = buildMembershipRecord(
          record,
          entityType,
          entity.id,
          member.systemId
        );
        overriddenRecords += 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. THE REPORT.
  // -------------------------------------------------------------------------
  const worldRoster = {
    components: new Set(payloads.components.entities.map((entity) => entity.id)),
    essences: new Set(payloads.essences.entities.map((entity) => entity.id)),
    tools: new Set(payloads.tools.entities.map((entity) => entity.id)),
  };
  const report = {
    createdEntities,
    mergedGroups: grouping.mergedGroups,
    transitiveGroups: grouping.transitiveGroups,
    renames: grouping.renames,
    overriddenRecords,
    refusals: grouping.refusals,
    flaggedForReview: computeFlaggedForReview(systems, recipes, gatheringConfig, worldRoster),
  };

  // -------------------------------------------------------------------------
  // 5. RETURN THE ORIGINAL OBJECT FOR ANY KEY THIS PASS DID NOT CHANGE.
  // -------------------------------------------------------------------------
  // The comparison is against the NORMALIZED read of the original, not the raw value, so a
  // world with nothing to lift leaves its three scope settings and the map untouched rather
  // than seeding them with empty collections. Seeding an empty `entities` would make
  // `_scopeEntityBasis` report a KNOWN, EMPTY basis, which is a licence to prune.
  const unchanged = (next, original) =>
    JSON.stringify(next) === JSON.stringify(original) ? original : next;

  const result = {
    recipes: unchanged(recipes, data.recipes),
    systems: unchanged(systems, data.systems),
    gatheringConfig: unchanged(gatheringConfig, data.gatheringConfig),
    worldScopeRekeyMap:
      JSON.stringify(rekeyMap) === JSON.stringify(normalizeRekeyMap(data.worldScopeRekeyMap))
        ? data.worldScopeRekeyMap
        : rekeyMap,
    _worldScopeEntityReport: report,
  };
  for (const entityType of ENTITY_TYPES) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    result[key] =
      JSON.stringify(payloads[entityType]) === JSON.stringify(readScopePayload(data[key]))
        ? data[key]
        : payloads[entityType];
  }
  return result;
}
