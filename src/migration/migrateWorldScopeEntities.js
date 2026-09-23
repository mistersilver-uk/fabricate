/**
 * `1.30.0` — THE WORLD-SCOPE ENTITY MIGRATION (issue 1363). PURE, NON-MUTATING AND IDEMPOTENT: it
 * answers the ORIGINAL object for any key it did not change. Spec § World-Scope Entity Migration
 * owns every rule, the load-bearing rewrite-before-payload order included.
 */

import { electWorldDefault } from '../systems/worldScopeDefaults.js';
import {
  buildWorldScopeGrouping,
  ENTITY_TYPE_FIELDS,
  ESSENCE_EFFECT_SOURCE_FIELDS,
  isRefusedPair,
  REKEYABLE_ENTITY_TYPES,
  WORLD_IDENTITY_FIELDS,
} from '../systems/worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
} from '../systems/worldScopeReferenceRewrite.js';
import { cloneJson, isPlainObject } from '../utils/scalars.js';

import { markComponentEssenceInheritance } from './migrateComponentEssenceSections.js';
import { forEachSystem } from './migrationHelpers.js';

/** The `data` keys the three scope payloads travel under inside the migration runner. */
export const SCOPE_PAYLOAD_KEYS = Object.freeze({
  components: 'componentScope',
  essences: 'essenceScope',
  tools: 'toolScope',
});

/**
 * The `inherit` map each entity type is created with — every section OVERRIDDEN. Component
 * `essences` is absent: its switch is decided by EQUALITY in step 3b, through `1.32.0`'s own rule.
 */
const OVERRIDING_INHERIT = Object.freeze({
  components: Object.freeze({ category: false }),
  essences: Object.freeze({ effectSource: false, macro: false }),
  tools: Object.freeze({ breakage: false, onBreak: false, prerequisites: false, bonus: false }),
});

const ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The membership map key, spelled exactly as `scopedDefinitions.membershipKey` spells it. */
function membershipKeyOf(entityId, systemId) {
  return `${entityId}|${systemId}`;
}

/**
 * Normalize a persisted re-key map, dropping anything that cannot be one. TOTAL: a hand-edited or
 * absent value answers `{}`.
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

/** The identity projection of one record, for the write-back and the drift detector. */
function projectIdentity(record, entityType) {
  const identity = {};
  for (const field of WORLD_IDENTITY_FIELDS[entityType] ?? []) {
    if (record?.[field] === undefined) continue;
    identity[field] = Array.isArray(record[field]) ? [...record[field]] : record[field];
  }
  return identity;
}

/**
 * Apply a merged identity onto one in-system record, IN PLACE. ABSENCE IS PART OF THE UNIT: a field
 * the world entity does not carry is DELETED, the donor winning every identity field AS A UNIT. The
 * three SOURCE-LINK fields are the exception to the donor rule, not to this one.
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
 * One system's `prerequisites` override, in `Tool`'s own shape. An unauthored input answers the
 * canonical EMPTY gate rather than absence — see {@link buildMembershipRecord} for why.
 */
export function toolPrerequisitesOverride(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const ids = arrayOf(source.ids)
    .filter((entry) => typeof entry === 'string' && entry.trim())
    .map((entry) => entry.trim());
  return {
    enabled: source.enabled === true && ids.length > 0,
    ids: [...new Set(ids)],
    gateMode: source.gateMode === 'bonus' ? 'bonus' : 'usability',
  };
}

/** One system's `bonus` override. See {@link toolPrerequisitesOverride}. */
export function toolBonusOverride(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const expression = typeof source.expression === 'string' ? source.expression.trim() : '';
  return { enabled: source.enabled === true && expression !== '', expression };
}

/**
 * The membership record one in-system definition produces — every section OVERRIDDEN, each value
 * copied verbatim from that system's own definition.
 */
export function buildMembershipRecord(record, entityType, entityId, systemId) {
  const membership = {
    entityId,
    systemId,
    inherit: { ...OVERRIDING_INHERIT[entityType] },
  };
  if (entityType === 'components') {
    // `category` verbatim, because this is an OVERRIDE and `general` is a legitimate token here —
    // the prohibition binds the WORLD default. THE WRITE IS ABSENCE-PRESERVING AND MUST BE: an empty
    // override is NOT EXPRESSIBLE, since `''` coerces to absence and an ABSENT section under
    // `inherit: false` FALLS BACK to the world value. The world default is DECLINED instead.
    if (trimmedString(record.category)) membership.category = record.category.trim();
    const tags = arrayOf(record.tags).filter((tag) => trimmedString(tag));
    if (tags.length > 0) membership.tags = tags.map((tag) => tag.trim());
    return membership;
  }
  if (entityType === 'essences') {
    // BOTH SECTIONS ARE WRITTEN UNCONDITIONALLY, which is what makes them safe: an ABSENT section
    // under `inherit: false` falls back to the world value, so an absence-preserving write would
    // hand a system that authored nothing the DONOR's effect source or property macro. Both can
    // express emptiness — `{}` and `null` are real overriding values — so neither needs a decline.
    const effectSource = {};
    for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) {
      if (record[field] !== undefined) effectSource[field] = record[field];
    }
    membership.effectSource = effectSource;
    membership.macro = record.propertyMacroUuid ?? null;
    membership.enabled = record.enabled !== false;
    return membership;
  }
  // ABSENCE-PRESERVING, AND NECESSARILY SO: neither section can express an empty override. `{}` IS
  // an override, but the read union spreads the resolved value LAST, so `breakage: {}` would
  // overwrite the surviving in-system block with a shape every reader mis-reads.
  if (record.breakage !== undefined) membership.breakage = cloneJson(record.breakage);
  if (record.onBreak !== undefined) membership.onBreak = cloneJson(record.onBreak);
  // WRITTEN UNCONDITIONALLY, on the `effectSource` rule rather than the `breakage` one, because an
  // empty override here is a real value every reader treats as "none". AN ABSENT KEY IS FILLED WITH
  // THAT CANONICAL EMPTY, because `Tool` mints both on construction and a raw record already
  // resolves to exactly these values.
  membership.prerequisites = toolPrerequisitesOverride(record.prerequisites);
  membership.bonus = toolBonusOverride(record.bonus);
  // NOT A RESOLVER SECTION: `resolveTool` answers `repairRequirements` from the membership record
  // ALONE and never reads the world defaults, so an unauthored one needs no decline.
  if (Array.isArray(record.repairRequirements)) {
    membership.repairRequirements = cloneJson(record.repairRequirements);
  }
  membership.enabled = record.enabled !== false;
  return membership;
}

/**
 * The persisted scope payload for one entity type, normalized and fully cloned. Exported so the
 * `1.34.0` merge reads one through the same reader this pass writes one through.
 */
export function readScopePayload(existing) {
  const source = isPlainObject(existing) ? existing : {};
  const { entities, defaults, membership, ...extras } = source;
  return {
    entities: cloneJson(arrayOf(entities).filter((entry) => isPlainObject(entry))),
    defaults: cloneJson(isPlainObject(defaults) ? defaults : {}),
    membership: cloneJson(isPlainObject(membership) ? membership : {}),
    // EVERY OTHER AUTHORED KEY IS PRESERVED, and that is not defensive style: the tool scope carries
    // a FOURTH sibling, the WORLD tool-breakage authority, which `ScopedDefinitionStore`
    // round-trips. Narrowing to the three sub-keys would DESTROY it on any world this pass lifts,
    // and the registry label rests `downgradeLosesData: false` on those settings surviving untouched.
    ...cloneJson(extras),
  };
}

/**
 * A component id plausibly a definition id rather than a document UUID: anything dotted is excluded,
 * `randomID()` output never containing a dot.
 */
function looksLikeDefinitionId(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('.');
}

/**
 * Collect every component and tool reference one system reaches, THROUGH THE SHARED WALK, so it
 * cannot report a site the rewrite does not visit, or the reverse.
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
  // A CLONE, because the collectors are driven through the MUTATING walk: the writes are no-ops,
  // but a walk is still a walk and must not be pointed at the payload the caller will persist.
  const probe = cloneJson({ system, recipes, gatheringSlice });
  rewriteSystemReferences(probe.system, remappers);
  for (const recipe of arrayOf(probe.recipes)) rewriteRecipeReferences(recipe, remappers);
  rewriteGatheringSliceReferences(probe.gatheringSlice, remappers);
  return { componentIds, toolIds };
}

/**
 * The references that resolve to NOTHING, reported so a GM can review them. A REPORT, NOT A
 * PREDICTED DELETION: they become prunable only at the CONSUMER SWEEP, so this release deletes none.
 */
function computeFlaggedForReview(systems, recipes, gatheringConfig, worldRoster) {
  const flagged = [];
  forEachSystem(systems, (system) => {
    const systemId = trimmedString(system.id);
    if (!systemId) return;
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
  });
  return flagged;
}

/**
 * Run the whole `1.30.0` transform, answering the keys it changed plus the transient
 * `_worldScopeEntityReport`. Every unchanged key answers its ORIGINAL object.
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
  // The grouping is derived on EVERY pass: it supplies the roster, the memberships and the report.
  // Only its MAP is discarded on a re-run — a torn run may already have re-keyed `craftingSystems`,
  // from which the derived map would be empty while `gatheringConfig` still holds the old ids.
  const grouping = buildWorldScopeGrouping(systems);
  const rekeyMap = reusingPersistedMap ? persistedMap : grouping.rekeyMap;

  const payloads = {};
  for (const entityType of ENTITY_TYPES) {
    payloads[entityType] = readScopePayload(data[SCOPE_PAYLOAD_KEYS[entityType]]);
  }

  // 1. THE REWRITE HALF — unconditional, driven by the map alone.
  // How many membership records the FOURTH-target walk had to repair. ZERO on a correctly ordered
  // pass; anything else means a payload was built BEFORE the rewrite ran.
  let payloadRewriteRepairs = 0;
  const recipesBySystem = new Map();
  for (const recipe of recipes) {
    const systemId = trimmedString(recipe?.craftingSystemId);
    if (!systemId) continue;
    if (!recipesBySystem.has(systemId)) recipesBySystem.set(systemId, []);
    recipesBySystem.get(systemId).push(recipe);
  }

  forEachSystem(systems, (system) => {
    const systemId = trimmedString(system.id);
    if (!systemId) return;
    const perSystem = rekeyMap[systemId];
    if (!perSystem) return;
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
    // The scope payloads as a FOURTH target — the belt-and-braces arm, which finds NOTHING on a
    // correctly ordered pass. IT IS COUNTED, and that is not telemetry: the arm is UNCONDITIONAL, so
    // it would silently REPAIR a pre-rewrite payload, invisibly to every assertion about CONTENT.
    for (const entityType of ENTITY_TYPES) {
      for (const record of Object.values(payloads[entityType].membership)) {
        if (record?.systemId !== systemId) continue;
        const beforeRewrite = JSON.stringify(record);
        rewriteMembershipReferences(record, entityType, remappers);
        if (JSON.stringify(record) !== beforeRewrite) payloadRewriteRepairs += 1;
      }
    }
  });

  // 2. THE IN-SYSTEM IDENTITY WRITE-BACK — also unconditional. See the module note.
  const identityByNewId = {};
  for (const entityType of ENTITY_TYPES) {
    const lookup = new Map();
    // On a re-run the source is the PERSISTED SCOPE PAYLOAD, keyed by the mapped NEW id.
    for (const entity of payloads[entityType].entities) {
      const id = trimmedString(entity?.id);
      if (id) lookup.set(id, projectIdentity(entity, entityType));
    }
    // A fresh pass, or a tear before the scope legs landed, has no persisted payload; the grouping
    // is then the only source and is correct, because `craftingSystems` still carries the old ids.
    for (const entity of grouping.entities[entityType]) {
      if (!lookup.has(entity.id)) lookup.set(entity.id, entity.identity);
    }
    identityByNewId[entityType] = lookup;
  }

  let overriddenRecords = 0;
  forEachSystem(systems, (system) => {
    const systemId = trimmedString(system.id);
    if (!systemId) return;
    for (const entityType of ENTITY_TYPES) {
      if (isRefusedPair(grouping.refusals, systemId, entityType)) continue;
      for (const record of arrayOf(system[ENTITY_TYPE_FIELDS[entityType]])) {
        const id = trimmedString(record?.id);
        if (!id) continue;
        const identity = identityByNewId[entityType].get(id);
        if (identity) applyIdentity(record, identity, entityType);
      }
    }
  });

  // 3. THE LIFT/CLAIM HALF — gated PER `(entityId, systemId)` on the corpus.
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
        // THE GUARD, corpus-derived and per pair. Never `migrationVersion`, and never a disjunction
        // across the three keys: any GM edit seeds a key, and migrations run on the active GM alone.
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

  // 3b. THE DONOR-ELECTED WORLD DEFAULTS, AFTER THE MEMBERSHIP LOOP, which is load-bearing: the
  // `repairRequirements` constraint reads the records written above. The corpus differential is
  // unchanged by two mechanisms (requirement 6's stated exception).
  const worldComponentIds = new Set(payloads.components.entities.map((entity) => entity.id));
  const isMemberOf = (componentId, systemId) =>
    Boolean(payloads.components.membership[membershipKeyOf(componentId, systemId)]);
  const refusedDefaultSections = [];

  for (const entityType of ENTITY_TYPES) {
    const payload = payloads[entityType];
    for (const entity of grouping.entities[entityType]) {
      // The per-pair LIFT guard governs this too: an entity whose defaults a previous pass already
      // wrote is not re-elected, so a re-run cannot overwrite a GM's later edit.
      if (payload.defaults[entity.id]) continue;
      const liveMembers = entity.members.filter(
        (member) => !isRefusedPair(grouping.refusals, member.systemId, entityType)
      );
      if (liveMembers.length === 0) continue;
      const recordFor = (systemId) =>
        arrayOf(systemsById.get(systemId)?.[ENTITY_TYPE_FIELDS[entityType]]).find(
          (candidate) => trimmedString(candidate?.id) === entity.id
        );
      const memberRecords = liveMembers.map((member) => recordFor(member.systemId)).filter(Boolean);
      const donorRecord = memberRecords[0];
      if (!donorRecord) continue;
      const { record, refusedSections } = electWorldDefault({
        entityType,
        entityId: entity.id,
        donorRecord,
        // EVERY live member's record, because a section only one of them authored must NOT become a
        // world default: the members that authored none would fall back to it.
        memberRecords,
        worldComponentIds,
        isMemberOf,
        memberSystemIds: liveMembers.map((member) => member.systemId),
      });
      if (record) payload.defaults[entity.id] = record;
      for (const section of refusedSections) {
        refusedDefaultSections.push({ entityType, entityId: entity.id, section });
      }
      // THE `essences` SWITCH IS DECIDED BY EQUALITY, not written off: each live member is marked
      // inheriting where its own map equals the elected one and overriding where it does not. That
      // is the `1.32.0` rule applied here, so a world reaching both passes in one run and one that
      // ran `1.30.0` long ago converge on the same corpus (issue 1371).
      if (entityType === 'components') {
        for (const member of liveMembers) {
          markComponentEssenceInheritance(
            payload.membership[membershipKeyOf(entity.id, member.systemId)],
            recordFor(member.systemId) ?? null,
            record?.essences
          );
        }
      }
    }
  }

  // 4. THE REPORT.
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
    // ZERO on a correctly ordered pass. See the fourth-target walk above.
    payloadRewriteRepairs,
    // The world-default sections a CONSTRAINT declined, distinct from ones the donor never authored.
    // A DIAGNOSTIC, not a GM-facing fact: see the module note.
    refusedDefaultSections,
  };

  // 5. RETURN THE ORIGINAL OBJECT FOR ANY KEY THIS PASS DID NOT CHANGE. The comparison is against
  // the NORMALIZED read of the original, so a world with nothing to lift leaves its three scope
  // settings and the map untouched rather than seeding them: seeding an empty `entities` would make
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
