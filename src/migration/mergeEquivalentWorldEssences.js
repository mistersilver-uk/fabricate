/**
 * The `1.34.0` pass giving the world one record per essence behaviour, repairing the duplication
 * `1.30.0` left (issue 1654; spec § Equivalent World Essence Merge owns every requirement).
 * THE MAP IS REUSED from `fabricate.worldEssenceMergeMap` whenever it carries entries, because a
 * torn run may already have re-keyed `craftingSystems` — from which a re-derived map would be empty
 * — while `recipes` and `gatheringConfig` still hold the retired ids (requirement 10).
 */

import { ESSENCE_SECTIONS, resolveEssence } from '../systems/essenceScope.js';
import { membershipKey } from '../systems/scopedDefinitions.js';

import { readScopePayload } from './migrateWorldScopeEntities.js';
import { clone, isPlainObject } from './migrationHelpers.js';
import { buildWorldEssenceEquivalence } from './worldEssenceEquivalence.js';
import { ENTITY_TYPE_FIELDS, ESSENCE_EFFECT_SOURCE_FIELDS } from './worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteEssenceQuantityMap,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
  rewriteToolReferences,
} from './worldScopeReferenceRewrite.js';

/** The `craftingSystem` array essences are stored under, read from the one list that names it. */
const ESSENCE_DEFINITIONS_FIELD = ENTITY_TYPE_FIELDS.essences;

/** The entity-type leg the per-system map is written under. */
const ESSENCES = 'essences';

/**
 * The value each section takes when a re-pointed record was inheriting it and the world had no
 * opinion to freeze. Both are real OVERRIDING values every reader treats as "none", so the record
 * states its current behaviour rather than leaving an absence that falls back.
 */
const EMPTY_SECTION_OVERRIDE = Object.freeze({ macro: null, effectSource: Object.freeze({}) });

/**
 * How a frozen section is written onto the in-system row, on the SHIPPED field names the read union
 * consumes: neither section NAME names anything on that record, so a write under it would sit where
 * no consumer reads and the freeze would be true of the membership record and false of every craft.
 * A deliberate mirror of the module-private `INHERITED_SECTION_WRITERS.essences`, which cannot be
 * imported; checked BEHAVIOURALLY, because a key-set check cannot see a writer projecting onto the
 * wrong field name.
 * `effectSource` writes `?? null` per field rather than conditionally, because the unset state of
 * all three is `null` and not absence — a stale `sourceComponentId` left standing would be the
 * per-field fallback `## Scoped Entity Definitions` forbids by name.
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
 * Normalize the persisted merge map to its two named legs. Total: a hand-edited or wrongly-shaped
 * value answers empty legs, and a partially-readable one keeps the half that reads. The `retired`
 * leg is normalized BY KEY ONLY and its snapshots pass through verbatim, because dropping an
 * unrecognised one would discard the only record of what a retired entity carried.
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
 * The world-wide lookup, unioned from the per-system legs, for WORLD-SCOPE positions only — a world
 * entity row, a default key and a default's quantity map belong to no system. The reference rewrite
 * uses the per-system legs instead, because a loser id is re-keyed only where it is PRESENT:
 * rewriting it elsewhere would turn a dangling reference into a live contribution of the survivor's
 * weight. Unambiguous because every leg naming a loser names the same survivor.
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
 * Re-key one system's own essence rows: the definition ids and the derived array beside them.
 * `systems[].essences` is a derived alias `_normalizeSystem` re-mints on the next save, but it is
 * READ before that save happens and a migrated world can sit weeks between the two, so leaving it
 * holding retired ids would show a GM the essence list of a world that no longer exists.
 * Neither position is on the shared walk's lists, correctly: that walk rewrites REFERENCES.
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
 * Freeze every section a re-pointed membership record was inheriting, at BOTH scopes (requirement 8).
 * The resolution runs against the record's CURRENT world parent — the loser's default, read before
 * this pass deletes it — because the value being frozen is the one it resolves to today; resolving
 * against the survivor would freeze the value the re-key is about to produce.
 * The in-system write is CONDITIONAL on a world value existing and the membership write is NOT:
 * `applyInheritedSections` skips an absent world value either side of the flip, so writing the
 * canonical empty over the row would destroy an authored value, while the record takes that empty
 * because an absent local section falls back to the world value even under `inherit: false`.
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
 * Index the already-re-keyed in-system rows by system and id. EVERY row per id rather than the
 * first, because {@link unionScopedDefinitions} emits the array's rows one for one and preserves a
 * duplicate id, so a single-row write would leave the second answering the pre-freeze value.
 * Unreachable from a derived map, reachable from a hand-edited one — which this must survive.
 */
function indexInSystemEssences(systems) {
  const bySystem = new Map();
  for (const system of systems) {
    const systemId = trimmedString(system?.id);
    if (!systemId) continue;
    const byId = new Map();
    for (const record of arrayOf(system[ESSENCE_DEFINITIONS_FIELD])) {
      if (!isPlainObject(record)) continue;
      const id = trimmedString(record.id);
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(record);
    }
    bySystem.set(systemId, byId);
  }
  return bySystem;
}

/**
 * Re-point one membership record at its survivor, freezing what it was inheriting first. The order
 * inside is load-bearing: the freeze resolves through the parent it is LEAVING, so it runs while
 * `entityId` still names the loser, while the in-system rows are looked up under the SURVIVOR id.
 * `null` for a record naming no system: it cannot be keyed for its new parent and resolves for
 * nobody, so it is dropped exactly as `readEssenceScope` never counted it as a live member.
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
 * Rebuild `essenceScope.membership` with every loser re-pointed. Two passes, and the order is
 * load-bearing: the first copies every record NOT being re-pointed under its original key, which is
 * what makes a no-op run byte-identical so the caller declines to write the leg.
 * A collision keeps the SURVIVOR's record — unreachable from a derived map, which is why that third
 * invariant is evaluated over the rebuilt keys, so this arm exists for a hand-edited one alone.
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
  // Filtered rather than branched at the push, because the empty case is the common one and the leg
  // is a disclosure: a record that froze nothing in-system has nothing to disclose.
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
  // Derived on every pass because it supplies the report; only its map is discarded on a re-run. It
  // reads the cloned corpus BEFORE the rewrite half touches it, so it sees the ids the persisted map
  // was written against.
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

  for (const system of systems) {
    const systemId = trimmedString(system?.id);
    if (!systemId) continue;
    const legs = perSystemLegs[systemId];
    if (!legs) continue;
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
    // A component membership record's `essences` map is keyed by world essence id, and
    // `_normalizeEssenceQuantities` prunes a key outside the valid id basis — so a key missed here is
    // a SILENT DELETION on the next save rather than a dangling reference a reader could report.
    for (const record of Object.values(componentScope.membership)) {
      if (!isPlainObject(record) || trimmedString(record.systemId) !== systemId) continue;
      rewriteMembershipReferences(record, 'components', remappers);
    }
    // A tool membership record's `repairRequirements` may carry essence-typed options, and
    // `resolveTool` answers that field from the membership record ALONE, never falling back to the
    // world default — so a missed id here is the only copy the repair check reads, disagreeing with
    // the in-system copy this pass has re-keyed.
    for (const record of Object.values(toolScope.membership)) {
      if (!isPlainObject(record) || trimmedString(record.systemId) !== systemId) continue;
      rewriteMembershipReferences(record, 'tools', remappers);
    }
  }

  // The world-scope key positions, which belong to no system and take the unioned lookup.
  for (const record of Object.values(componentScope.defaults)) {
    rewriteEssenceQuantityMap(record, { remapEssence: globalRemapper });
  }
  // A world tool default carries the donor's whole `repairRequirements` array, elected under a
  // constraint that checks component ids only, so an essence-typed option reaches world scope
  // untouched. It is the sharpest of the three tool positions: `seedToolRepairRequirements` copies
  // this array into every membership record minted when a tool is added to a system, so a retired id
  // left standing here does not decay — it PROPAGATES, into systems that do not exist yet.
  for (const record of Object.values(toolScope.defaults)) {
    rewriteToolReferences(record, { remapEssence: globalRemapper });
  }

  // 2. The essence scope rebuild — the retirement itself. The membership rebuild reads the world
  // defaults, so it runs BEFORE the loser keys are deleted: a re-pointed inheriting record freezes
  // the value it resolves to through the parent it is leaving. It runs AFTER the rewrite half,
  // because the in-system half of that freeze writes rows the rewrite half has already re-keyed.
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

  // 3. The tombstone leg, which is never cleared (requirement 17). The persisted snapshot always
  // wins: it was taken while the retired entity still existed, and a re-run cannot re-observe an
  // identity it has already deleted. A fresh snapshot is adopted only for a loser the map being
  // applied actually names, so a re-run cannot tombstone an id that still lives.
  const retired = { ...persisted.retired };
  for (const [loserId, snapshot] of Object.entries(equivalence.retired)) {
    if (loserId in remap && !(loserId in retired)) retired[loserId] = snapshot;
  }

  // 4. The report — transient, captured and deleted by the runner. `inSystemFreezes` is the one leg
  // not from the derivation: it names the only write this pass makes to an authored field's VALUE,
  // so it is disclosed rather than made silently. Empty on the migrated-world common case by
  // construction, since every record `buildMembershipRecord` wrote is fully overriding.
  const report = {
    mergedGroups: equivalence.mergedGroups,
    refusals: equivalence.refusals,
    declined: equivalence.declined,
    orphaned: equivalence.orphaned,
    inSystemFreezes: rebuilt.inSystemFreezes,
  };

  // 5. Return the original object for any key this pass did not change, compared against the
  // NORMALIZED read rather than the raw value, so a world with nothing to merge leaves its scope
  // settings untouched rather than seeding them: an empty `entities` would make `_scopeEntityBasis`
  // report a known, empty basis, which licences a prune.
  const unchanged = (next, original) =>
    JSON.stringify(next) === JSON.stringify(original) ? original : next;
  // The scope legs compare against the normalized read, so a payload rebuilt into an equal shape
  // answers the caller's own object rather than a fresh clone.
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
