/**
 * The `1.34.0` pass giving the world one record per essence behaviour, repairing the duplication
 * `1.30.0` left (issue 1654; spec § Equivalent World Essence Merge owns every requirement). THE MAP
 * IS REUSED from `fabricate.worldEssenceMergeMap` whenever it carries entries, so a torn run
 * re-applies the ids it was written against (requirement 10).
 */

import { ESSENCE_SECTIONS, resolveEssence } from '../systems/essenceScope.js';
import { membershipKey } from '../systems/scopedDefinitions.js';
import {
  ENTITY_TYPE_FIELDS,
  ESSENCE_EFFECT_SOURCE_FIELDS,
} from '../systems/worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteEssenceQuantityMap,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
  rewriteToolReferences,
} from '../systems/worldScopeReferenceRewrite.js';

import { readScopePayload } from './migrateWorldScopeEntities.js';
import { clone, isPlainObject, forEachSystem } from './migrationHelpers.js';
import { buildWorldEssenceEquivalence } from './worldEssenceEquivalence.js';

/** The `craftingSystem` array essences are stored under, read from the one list that names it. */
const ESSENCE_DEFINITIONS_FIELD = ENTITY_TYPE_FIELDS.essences;

/** The entity-type leg the per-system map is written under. */
const ESSENCES = 'essences';

/** The canonical empty a frozen section takes when the world had no opinion (requirement 8). */
const EMPTY_SECTION_OVERRIDE = Object.freeze({ macro: null, effectSource: Object.freeze({}) });

/**
 * How a frozen section is written onto the in-system row, on the SHIPPED field names the read union
 * consumes (requirement 8). A deliberate mirror of the module-private
 * `INHERITED_SECTION_WRITERS.essences`, which cannot be imported, checked BEHAVIOURALLY because a
 * key-set check cannot see a writer projecting onto the wrong field name. `effectSource` writes
 * `?? null` per field: the unset state of all three is `null`, not absence.
 */
const IN_SYSTEM_SECTION_WRITERS = Object.freeze({
  macro(record, value) {
    record.propertyMacroUuid = value;
  },
  effectSource(record, value) {
    const block = isPlainObject(value) ? value : {};
    for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) record[field] = block[field] ?? null;
  },
});

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Normalize the persisted merge map to its two named legs, totally. The `retired` leg is normalized
 * BY KEY ONLY and its snapshots pass through verbatim, so none is ever discarded.
 */
export function normalizeEssenceMergeMap(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const systems = {};
  for (const [systemId, legs] of Object.entries(
    isPlainObject(source.systems) ? source.systems : {}
  )) {
    if (!trimmedString(systemId) || !isPlainObject(legs)) continue;
    const pairs = {};
    for (const [loserId, survivorId] of Object.entries(
      isPlainObject(legs[ESSENCES]) ? legs[ESSENCES] : {}
    )) {
      if (trimmedString(loserId) && trimmedString(survivorId)) pairs[loserId] = survivorId;
    }
    if (Object.keys(pairs).length > 0) systems[systemId] = { [ESSENCES]: pairs };
  }
  const retired = {};
  for (const [loserId, snapshot] of Object.entries(
    isPlainObject(source.retired) ? source.retired : {}
  )) {
    if (trimmedString(loserId) && isPlainObject(snapshot)) retired[loserId] = snapshot;
  }
  return { systems, retired };
}

/**
 * The world-wide lookup for WORLD-SCOPE positions only — a world entity row, a default key and a
 * default's quantity map belong to no system. The reference rewrite uses the PER-SYSTEM legs, so a
 * loser id is re-keyed only where it is present (§ Equivalent World Essence Merge).
 */
function unionMergeMap(perSystemLegs) {
  const union = {};
  for (const legs of Object.values(perSystemLegs)) {
    for (const [loserId, survivorId] of Object.entries(legs[ESSENCES] ?? {})) {
      union[loserId] = survivorId;
    }
  }
  return union;
}

/** Whether a per-system map carries any pair at all. */
function mapHasEntries(map) {
  return Object.keys(map).length > 0;
}

/**
 * Re-key one system's own essence rows: the definition ids and the derived `essences` alias beside
 * them, which is READ long before the next save re-mints it. Neither position is on the shared
 * walk's lists, correctly: that walk rewrites REFERENCES.
 */
function rekeySystemEssenceIds(system, remapEssence) {
  for (const record of arrayOf(system[ESSENCE_DEFINITIONS_FIELD])) {
    if (!isPlainObject(record)) continue;
    const id = trimmedString(record.id);
    if (id) record.id = remapEssence(id);
  }
  if (Array.isArray(system[ESSENCES])) {
    system[ESSENCES] = system[ESSENCES].map((id) => remapEssence(id));
  }
}

/**
 * Freeze every section a re-pointed membership record was inheriting, at BOTH scopes, resolving
 * against the loser's default rather than the survivor's, with the in-system write CONDITIONAL on a
 * world value existing and the membership write unconditional (requirement 8 owns all three).
 */
function freezeInheritedSections(record, loserDefault, inSystemRows) {
  const resolved = resolveEssence(loserDefault, record);
  const written = [];
  for (const section of ESSENCE_SECTIONS) {
    if (resolved.inherited?.[section] !== true) continue;
    const value = resolved[section];
    record[section] = value === undefined ? clone(EMPTY_SECTION_OVERRIDE[section]) : clone(value);
    if (!isPlainObject(record.inherit)) record.inherit = {};
    record.inherit[section] = false;
    if (value === undefined || inSystemRows.length === 0) continue;
    for (const row of inSystemRows) IN_SYSTEM_SECTION_WRITERS[section](row, clone(value));
    written.push(section);
  }
  return written;
}

/**
 * Index the already-re-keyed in-system rows by system and id, EVERY row per id rather than the
 * first: `unionScopedDefinitions` preserves a duplicate id, reachable from a hand-edited map.
 */
function indexInSystemEssences(systems) {
  const bySystem = new Map();
  forEachSystem(systems, (system) => {
    const systemId = trimmedString(system?.id);
    if (!systemId) return;
    const byId = new Map();
    for (const record of arrayOf(system[ESSENCE_DEFINITIONS_FIELD])) {
      if (!isPlainObject(record)) continue;
      const id = trimmedString(record.id);
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(record);
    }
    bySystem.set(systemId, byId);
  });
  return bySystem;
}

/**
 * Re-point one membership record at its survivor, freezing first: the freeze resolves through the
 * parent it is LEAVING, so it runs while `entityId` still names the loser, while the in-system rows
 * are looked up under the SURVIVOR id. `null` for a record naming no system, which resolves for
 * nobody.
 */
function repointMembershipRecord({ record, loserId, survivorId }, defaults, inSystemEssences) {
  const systemId = trimmedString(record.systemId);
  if (!systemId) return null;
  const sections = freezeInheritedSections(
    record,
    isPlainObject(defaults[loserId]) ? defaults[loserId] : null,
    inSystemEssences.get(systemId)?.get(survivorId) ?? []
  );
  record.entityId = survivorId;
  const freeze = { systemId, essenceId: survivorId, sections };
  return { key: membershipKey(survivorId, systemId), freeze };
}

/**
 * Rebuild `essenceScope.membership` with every loser re-pointed, in two passes: the first copies
 * every record NOT re-pointed under its original key, which is what keeps a no-op run
 * byte-identical. A collision keeps the SURVIVOR's record, an arm a hand-edited map alone reaches.
 */
function rebuildMembership(membership, defaults, remap, inSystemEssences) {
  const rebuilt = {};
  const repointed = [];
  const inSystemFreezes = [];
  for (const [key, record] of Object.entries(membership)) {
    const entityId = isPlainObject(record) ? trimmedString(record.entityId) : null;
    const survivorId = entityId ? remap[entityId] : undefined;
    if (!survivorId) {
      rebuilt[key] = record;
      continue;
    }
    repointed.push({ record, loserId: entityId, survivorId });
  }
  for (const entry of repointed) {
    const repoint = repointMembershipRecord(entry, defaults, inSystemEssences);
    if (!repoint) continue;
    inSystemFreezes.push(repoint.freeze);
    if (!(repoint.key in rebuilt)) rebuilt[repoint.key] = entry.record;
  }
  // Filtered rather than branched at the push: a record that froze nothing has nothing to disclose.
  return {
    membership: rebuilt,
    inSystemFreezes: inSystemFreezes.filter((freeze) => freeze.sections.length > 0),
  };
}

/**
 * Run the whole `1.34.0` merge, answering the keys it changed plus the transient
 * `_worldEssenceMergeReport`. Every unchanged key answers its original object.
 */
export function mergeEquivalentWorldEssences(data) {
  if (!isPlainObject(data)) return data;

  const systems = clone(arrayOf(data.systems));
  const recipes = clone(arrayOf(data.recipes));
  const gatheringConfig = clone(isPlainObject(data.gatheringConfig) ? data.gatheringConfig : {});
  const essenceScope = readScopePayload(data.essenceScope);
  const componentScope = readScopePayload(data.componentScope);
  const toolScope = readScopePayload(data.toolScope);

  const persisted = normalizeEssenceMergeMap(data.worldEssenceMergeMap);
  const reusingPersistedMap = mapHasEntries(persisted.systems);
  // Derived on every pass because it supplies the report, and read BEFORE the rewrite half so it
  // sees the ids the persisted map was written against; only its map is discarded on a re-run.
  const equivalence = buildWorldEssenceEquivalence({
    systems,
    essenceScope: data.essenceScope,
    componentScope: data.componentScope,
  });
  const perSystemLegs = reusingPersistedMap ? persisted.systems : equivalence.mergeMap;
  const remap = unionMergeMap(perSystemLegs);
  const globalRemapper = keyedRemapper(remap);

  // 1. The rewrite half — unconditional, driven by the map alone.
  const recipesBySystem = new Map();
  for (const recipe of recipes) {
    const systemId = trimmedString(recipe?.craftingSystemId);
    if (!systemId) continue;
    if (!recipesBySystem.has(systemId)) recipesBySystem.set(systemId, []);
    recipesBySystem.get(systemId).push(recipe);
  }

  forEachSystem(systems, (system) => {
    const systemId = trimmedString(system?.id);
    if (!systemId) return;
    const legs = perSystemLegs[systemId];
    if (!legs) return;
    const remapEssence = keyedRemapper(legs[ESSENCES]);
    const remappers = { remapEssence };
    // The definition ids and the derived roster first, then every reference to them.
    rekeySystemEssenceIds(system, remapEssence);
    rewriteSystemReferences(system, remappers);
    for (const recipe of recipesBySystem.get(systemId) ?? []) {
      rewriteRecipeReferences(recipe, remappers);
    }
    if (isPlainObject(gatheringConfig.systems)) {
      rewriteGatheringSliceReferences(gatheringConfig.systems[systemId], remappers);
    }
    // A missed key here is a SILENT DELETION on the next save (requirement 5).
    for (const record of Object.values(componentScope.membership)) {
      if (!isPlainObject(record) || trimmedString(record.systemId) !== systemId) continue;
      rewriteMembershipReferences(record, 'components', remappers);
    }
    // `resolveTool` reads `repairRequirements` from the membership record ALONE, never falling back
    // to the world default, so a missed id here is the only copy the repair check reads.
    for (const record of Object.values(toolScope.membership)) {
      if (!isPlainObject(record) || trimmedString(record.systemId) !== systemId) continue;
      rewriteMembershipReferences(record, 'tools', remappers);
    }
  });

  // The world-scope key positions, which belong to no system and take the unioned lookup.
  for (const record of Object.values(componentScope.defaults)) {
    rewriteEssenceQuantityMap(record, { remapEssence: globalRemapper });
  }
  // The sharpest of the three tool positions: `seedToolRepairRequirements` copies this array into
  // every membership record minted later, so a retired id left here PROPAGATES (requirement 5).
  for (const record of Object.values(toolScope.defaults)) {
    rewriteToolReferences(record, { remapEssence: globalRemapper });
  }

  // 2. The retirement itself, BEFORE the loser keys are deleted (the freeze reads them) and AFTER
  // the rewrite half (its in-system write lands on rows that half has already re-keyed).
  const rebuilt = rebuildMembership(
    essenceScope.membership,
    essenceScope.defaults,
    remap,
    indexInSystemEssences(systems)
  );
  essenceScope.membership = rebuilt.membership;
  for (const loserId of Object.keys(remap)) delete essenceScope.defaults[loserId];
  essenceScope.entities = essenceScope.entities.filter(
    (entity) => !(trimmedString(entity?.id) && trimmedString(entity.id) in remap)
  );

  // 3. The tombstone leg, never cleared, persisted snapshot always winning (requirement 17).
  const retired = { ...persisted.retired };
  for (const [loserId, snapshot] of Object.entries(equivalence.retired)) {
    if (loserId in remap && !(loserId in retired)) retired[loserId] = snapshot;
  }

  // 4. The report — transient, captured and deleted by the runner (requirement 13).
  const report = {
    mergedGroups: equivalence.mergedGroups,
    refusals: equivalence.refusals,
    declined: equivalence.declined,
    orphaned: equivalence.orphaned,
    inSystemFreezes: rebuilt.inSystemFreezes,
  };

  // 5. Return the original object for any key this pass did not change, compared against the
  // NORMALIZED read: seeding an empty `entities` would licence a prune.
  const unchanged = (next, original) =>
    JSON.stringify(next) === JSON.stringify(original) ? original : next;
  // The scope legs compare against the normalized read, so an equal rebuild answers the original.
  const unchangedScope = (next, original) =>
    JSON.stringify(next) === JSON.stringify(readScopePayload(original)) ? original : next;
  const mergeMapSetting = { systems: perSystemLegs, retired };

  return {
    recipes: unchanged(recipes, data.recipes),
    systems: unchanged(systems, data.systems),
    gatheringConfig: unchanged(gatheringConfig, data.gatheringConfig),
    essenceScope: unchangedScope(essenceScope, data.essenceScope),
    componentScope: unchangedScope(componentScope, data.componentScope),
    toolScope: unchangedScope(toolScope, data.toolScope),
    worldEssenceMergeMap:
      JSON.stringify(mergeMapSetting) === JSON.stringify(persisted)
        ? data.worldEssenceMergeMap
        : mergeMapSetting,
    _worldEssenceMergeReport: report,
  };
}
