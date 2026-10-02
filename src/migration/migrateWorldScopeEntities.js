/**
 * `1.30.0`, the world-scope entity migration (issue 1363). Pure, non-mutating and idempotent: an
 * unchanged key answers its original object. `destructive-changes-and-migrations/spec.md`
 * § World-Scope Entity Migration owns every rule, the rewrite-before-payload order included.
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
 * Every section overridden. Component `essences` is absent: step 3b decides its switch by
 * equality, through `1.32.0`'s own rule.
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

/** Total: a hand-edited or absent value answers `{}`. */
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
 * In place, absence included: a field the world entity lacks is deleted, the donor winning every
 * identity field as a unit. The three source-link fields are the exception to the donor rule only.
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

/** In `Tool`'s shape; unauthored is the canonical empty gate ({@link buildMembershipRecord}). */
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

/** Every section overridden, each copied verbatim from the system's own definition. */
export function buildMembershipRecord(record, entityType, entityId, systemId) {
  const membership = {
    entityId,
    systemId,
    inherit: { ...OVERRIDING_INHERIT[entityType] },
  };
  if (entityType === 'components') {
    // `general` is legitimate in an override; the prohibition binds the world default. The write
    // must preserve absence: `''` coerces to absence, which under `inherit: false` falls back to
    // the world value, so the world default is declined instead.
    if (trimmedString(record.category)) membership.category = record.category.trim();
    const tags = arrayOf(record.tags).filter((tag) => trimmedString(tag));
    if (tags.length > 0) membership.tags = tags.map((tag) => tag.trim());
    return membership;
  }
  if (entityType === 'essences') {
    // Written unconditionally: an absent section under `inherit: false` would inherit the donor's
    // value, and `{}` and `null` are real overriding empties, so neither needs a decline.
    const effectSource = {};
    for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) {
      if (record[field] !== undefined) effectSource[field] = record[field];
    }
    membership.effectSource = effectSource;
    membership.macro = record.propertyMacroUuid ?? null;
    membership.enabled = record.enabled !== false;
    return membership;
  }
  // Absence-preserving, necessarily: the read union spreads the resolved value last, so
  // `breakage: {}` would overwrite the in-system block with a shape every reader mis-reads.
  if (record.breakage !== undefined) membership.breakage = cloneJson(record.breakage);
  if (record.onBreak !== undefined) membership.onBreak = cloneJson(record.onBreak);
  // Written unconditionally, like `effectSource`: an empty override reads as "none". An absent
  // key gets the canonical empty, which `Tool` mints on construction anyway.
  membership.prerequisites = toolPrerequisitesOverride(record.prerequisites);
  membership.bonus = toolBonusOverride(record.bonus);
  // Not a resolver section: `resolveTool` reads it from the membership record alone.
  if (Array.isArray(record.repairRequirements)) {
    membership.repairRequirements = cloneJson(record.repairRequirements);
  }
  membership.enabled = record.enabled !== false;
  return membership;
}

/** Normalized and cloned; exported so the `1.34.0` merge reads through the same reader. */
export function readScopePayload(existing) {
  const source = isPlainObject(existing) ? existing : {};
  const { entities, defaults, membership, ...extras } = source;
  return {
    entities: cloneJson(arrayOf(entities).filter((entry) => isPlainObject(entry))),
    defaults: cloneJson(isPlainObject(defaults) ? defaults : {}),
    membership: cloneJson(isPlainObject(membership) ? membership : {}),
    // Every other key survives: the tool scope carries a fourth sibling, the world tool-breakage
    // authority, and `downgradeLosesData: false` rests on it surviving untouched.
    ...cloneJson(extras),
  };
}

/** A definition id, not a document UUID: `randomID()` output never contains a dot. */
function looksLikeDefinitionId(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('.');
}

/** Through the rewrite's own walk, so the two can never disagree about a site. */
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
  // A clone: the walk mutates, and must never touch the payload the caller persists.
  const probe = cloneJson({ system, recipes, gatheringSlice });
  rewriteSystemReferences(probe.system, remappers);
  for (const recipe of arrayOf(probe.recipes)) rewriteRecipeReferences(recipe, remappers);
  rewriteGatheringSliceReferences(probe.gatheringSlice, remappers);
  return { componentIds, toolIds };
}

/** Dangling references, for GM review. None is deleted here; only the consumer sweep prunes. */
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

/** The changed keys plus the transient `_worldScopeEntityReport`. */
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
  // Derived every pass, but a re-run discards its map: a torn run may have re-keyed
  // `craftingSystems` already while `gatheringConfig` still holds the old ids.
  const grouping = buildWorldScopeGrouping(systems);
  const rekeyMap = reusingPersistedMap ? persistedMap : grouping.rekeyMap;

  const payloads = {};
  for (const entityType of ENTITY_TYPES) {
    payloads[entityType] = readScopePayload(data[SCOPE_PAYLOAD_KEYS[entityType]]);
  }

  // 1. The rewrite, unconditional and driven by the map alone. The repair count is zero on a
  // correctly ordered pass; anything else means a payload was built before the rewrite.
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
    // The definition ids, then every reference to them.
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
    // The scope payloads as a fourth target. Counted because it repairs silently, invisible to
    // any assertion about content.
    for (const entityType of ENTITY_TYPES) {
      for (const record of Object.values(payloads[entityType].membership)) {
        if (record?.systemId !== systemId) continue;
        const beforeRewrite = JSON.stringify(record);
        rewriteMembershipReferences(record, entityType, remappers);
        if (JSON.stringify(record) !== beforeRewrite) payloadRewriteRepairs += 1;
      }
    }
  });

  // 2. The in-system identity write-back, also unconditional.
  const identityByNewId = {};
  for (const entityType of ENTITY_TYPES) {
    const lookup = new Map();
    // On a re-run: the persisted payload, keyed by the new id.
    for (const entity of payloads[entityType].entities) {
      const id = trimmedString(entity?.id);
      if (id) lookup.set(id, projectIdentity(entity, entityType));
    }
    // Otherwise the grouping, correct because `craftingSystems` still carries the old ids.
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

  // 3. The lift and claim, gated per `(entityId, systemId)` on the corpus.
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
        // Never `migrationVersion` and never a disjunction across the three keys: any GM edit
        // seeds a key, and migrations run on the active GM alone.
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

  // 3b. The donor-elected world defaults, after the loop whose records the `repairRequirements`
  // constraint reads (requirement 6's stated exception).
  const worldComponentIds = new Set(payloads.components.entities.map((entity) => entity.id));
  const isMemberOf = (componentId, systemId) =>
    Boolean(payloads.components.membership[membershipKeyOf(componentId, systemId)]);
  const refusedDefaultSections = [];

  for (const entityType of ENTITY_TYPES) {
    const payload = payloads[entityType];
    for (const entity of grouping.entities[entityType]) {
      // Under the lift guard, so a re-run cannot overwrite a GM's later edit.
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
        // Every live member's: a section one member authored must not become a world default
        // the others would fall back to.
        memberRecords,
        worldComponentIds,
        isMemberOf,
        memberSystemIds: liveMembers.map((member) => member.systemId),
      });
      if (record) payload.defaults[entity.id] = record;
      for (const section of refusedSections) {
        refusedDefaultSections.push({ entityType, entityId: entity.id, section });
      }
      // `essences` inherits where a member's map equals the elected one, the `1.32.0` rule, so
      // one run of both passes and an old `1.30.0` run converge on one corpus (issue 1371).
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

  // 4. The report.
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
    payloadRewriteRepairs,
    // Sections a constraint declined, not ones the donor never authored; a diagnostic, never shown
    // to the GM.
    refusedDefaultSections,
  };

  // 5. Unchanged keys answer the original, compared against the normalized read, so a world with
  // nothing to lift is not seeded: an empty `entities` makes `_scopeEntityBasis` report a known,
  // empty basis, which is a licence to prune.
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
