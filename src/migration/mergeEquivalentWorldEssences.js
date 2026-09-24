/**
 * The `1.34.0` pass giving the world one record per essence behaviour (issue 1654); spec
 * § Equivalent World Essence Merge owns every requirement. A non-empty persisted
 * `fabricate.worldEssenceMergeMap` is reused, so a torn run re-applies its ids (requirement 10).
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

const ESSENCE_DEFINITIONS_FIELD = ENTITY_TYPE_FIELDS.essences;

const ESSENCES = 'essences';

/** The canonical empty a frozen section takes when the world had no opinion (requirement 8). */
const EMPTY_SECTION_OVERRIDE = Object.freeze({ macro: null, effectSource: Object.freeze({}) });

/**
 * On the shipped field names the read union consumes (requirement 8): a mirror of the private
 * `INHERITED_SECTION_WRITERS.essences`, checked behaviourally. `effectSource` writes `?? null` per
 * field, since null, not absence, is the unset state.
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

/** Total. `retired` is normalized by key only; its snapshots pass through verbatim. */
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
 * For world-scope positions only, which belong to no system; the reference rewrite uses the
 * per-system legs, so a loser id is re-keyed only where present.
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

function mapHasEntries(map) {
  return Object.keys(map).length > 0;
}

/**
 * The definition ids and the derived `essences` alias, read long before a save re-mints it. The
 * shared walk rewrites references, so neither position is on it.
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
 * At both scopes, against the loser's default; the in-system write only where a world value exists,
 * the membership write always (requirement 8).
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

/** Every row per id: `unionScopedDefinitions` keeps a hand-edited map's duplicate ids. */
function indexInSystemEssences(systems) {
  const bySystem = new Map();
  forEachSystem(systems, (system) => {
    const systemId = trimmedString(system.id);
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
 * Freeze first, while `entityId` still names the parent it is leaving; in-system rows are looked
 * up under the survivor id. `null` for a record naming no system.
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
 * Two passes; the first copies unmoved records under their keys, so a no-op run is byte-identical.
 * A collision, reachable only from a hand-edited map, keeps the survivor's record.
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
  return {
    membership: rebuilt,
    inSystemFreezes: inSystemFreezes.filter((freeze) => freeze.sections.length > 0),
  };
}

/** The changed keys plus the transient `_worldEssenceMergeReport`. */
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
  // Before the rewrite, so it sees the persisted map's ids; a re-run discards only its map.
  const equivalence = buildWorldEssenceEquivalence({
    systems,
    essenceScope: data.essenceScope,
    componentScope: data.componentScope,
  });
  const perSystemLegs = reusingPersistedMap ? persisted.systems : equivalence.mergeMap;
  const remap = unionMergeMap(perSystemLegs);
  const globalRemapper = keyedRemapper(remap);

  // 1. The rewrite, unconditional and driven by the map alone.
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
    // `resolveTool` reads `repairRequirements` from the membership record alone.
    for (const record of Object.values(toolScope.membership)) {
      if (!isPlainObject(record) || trimmedString(record.systemId) !== systemId) continue;
      rewriteMembershipReferences(record, 'tools', remappers);
    }
  });

  // The world-scope key positions, which belong to no system and take the unioned lookup.
  for (const record of Object.values(componentScope.defaults)) {
    rewriteEssenceQuantityMap(record, { remapEssence: globalRemapper });
  }
  // `seedToolRepairRequirements` copies this into every later record, so a retired id spreads
  // (requirement 5).
  for (const record of Object.values(toolScope.defaults)) {
    rewriteToolReferences(record, { remapEssence: globalRemapper });
  }

  // 2. The retirement: after the rewrite, whose re-keyed rows its write lands on, and before the
  // loser keys the freeze reads are deleted.
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

  // 5. Unchanged keys answer the original: seeding an empty `entities` would license a prune.
  const unchanged = (next, original) =>
    JSON.stringify(next) === JSON.stringify(original) ? original : next;
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
