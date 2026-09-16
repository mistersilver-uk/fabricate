/**
 * The `1.34.0` pass that gives the world one record per essence behaviour, repairing the
 * duplication `1.30.0` left behind when it grouped essences by an id that is not the semantic key
 * it was assumed to be (issue 1654; `destructive-changes-and-migrations` § Equivalent World Essence
 * Merge). Every decision it applies is made by {@link buildWorldEssenceEquivalence} and every
 * reference it rewrites is visited by the shared walk in `worldScopeReferenceRewrite.js`, so it
 * holds no second equivalence rule and no third enumeration of the corpus.
 *
 * Pure, non-mutating and idempotent: it clones what it transforms, returns the original object for
 * any key it did not change so the runner's per-setting comparison declines to write an unchanged
 * leg, and a re-run merges nothing further. Non-throwing, because a throw aborts the whole pass.
 *
 * The rewrite half runs unconditionally over `craftingSystems`, `recipes`, `gatheringConfig` and
 * the three scope payloads, driven by the map alone. The map itself is reused from
 * `fabricate.worldEssenceMergeMap` whenever that setting carries entries, because a torn run may
 * already have re-keyed `craftingSystems` — from which a re-derived map would be empty — while
 * `recipes` and `gatheringConfig` still hold the retired ids (requirement 10).
 *
 * Re-pointing a membership record moves its world parent, so a section it was inheriting is frozen
 * at both scopes first; {@link freezeInheritedSections} owns that rule, which requirement 8 states.
 *
 * Requirement 8a: the survivor's world identity wins and the loser's world entity row is deleted,
 * but the in-system records keep their own `name`, `icon`, `colorToken` and `description`, which
 * the merged triple says nothing about — so `reportWorldIdentityDrift` will correctly report a
 * divergence for every re-keyed record whose identity differs from the survivor's.
 *
 * The persisted map is `{systems: {[systemId]: {essences: {[loserId]: survivorId}}}, retired:
 * {[loserId]: …}}` rather than flat because the two legs have different lifetimes — the pairs are
 * cleared by the one-shot pass that consumes them, `retired` never is (requirements 11 and 17) —
 * and because filing `retired` among the system ids would make a world whose crafting system is
 * named `retired` ambiguous, with nothing validating a system id against the reserved name.
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
 * The value each essence section takes when a re-pointed record was inheriting it and the world had
 * no opinion to freeze. Both are real, overriding values every reader treats as "no macro" and "no
 * source", which is what lets the record state its current behaviour instead of leaving an absence
 * that falls back to the new parent's.
 */
const EMPTY_SECTION_OVERRIDE = Object.freeze({ macro: null, effectSource: Object.freeze({}) });

/**
 * How a frozen section is written onto the in-system `essenceDefinitions` row, on the shipped field
 * names the read union and every reader beyond it consume. Neither section name names anything on
 * that record — `macro` is spelled `propertyMacroUuid`, and `effectSource` is a block spread over
 * {@link ESSENCE_EFFECT_SOURCE_FIELDS} — so a write under the section name would sit under a key no
 * consumer reads, and the freeze would be true of the membership record and false of every craft.
 *
 * A deliberate mirror of the module-private `INHERITED_SECTION_WRITERS.essences` in
 * `src/systems/scopedDefinitionStore.js`, which cannot be imported: this pass writes what the read
 * union would have written, at the moment it stops being able to write it. The mirror is checked
 * behaviourally rather than by key set — which cannot see a writer projecting onto the wrong field
 * name — by `tests/world-essence-merge-acceptance.test.js`, which drives every section
 * `ESSENCE_SECTIONS` declares through the real `resolveEssenceScope` and asserts the union's answer
 * is unchanged across the merge.
 *
 * `effectSource` writes `?? null` per field rather than conditionally, because the unset state of
 * all three is `null` and not absence on this record: leaving a stale `sourceComponentId` standing
 * would be the per-field fallback `## Scoped Entity Definitions` forbids by name.
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
 * Normalize the persisted `fabricate.worldEssenceMergeMap` to its two named legs, dropping anything
 * that cannot be one. Total: a hand-edited, absent or wrongly-shaped value answers the empty pair
 * of legs rather than raising, and a partially-readable value keeps the half that reads.
 *
 * The `retired` leg is normalized by key only and its snapshots pass through verbatim. It is a
 * tombstone read as a key set (`worldScopeProjection.retiredEssenceIds`), and dropping a snapshot
 * this normalizer did not recognise would discard the only record of what a retired entity carried.
 *
 * @returns {{systems: object, retired: object}}
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
 * The world-wide old-to-new lookup, unioned from the per-system legs, for the world-scope payload
 * positions only: a world entity row, a world default key and a world default's essence quantity
 * map belong to no system, so no per-system leg can answer for them.
 *
 * The reference rewrite uses the per-system legs instead, because a loser id is re-keyed only in
 * the systems it is present in — rewriting it elsewhere would turn a dangling reference into a live
 * contribution of the survivor's weight, which the tombstone leg exists to prevent.
 *
 * Unambiguous because every leg that names a loser names the same survivor: one election per group,
 * per system, and a group whose map is not disjoint is refused outright.
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
 * Re-key one system's own essence rows: the definition ids, and the derived id array beside them.
 *
 * `systems[].essences` is a derived alias `_normalizeSystem` re-mints from `essenceDefinitions` on
 * the next save, but it is read before that save ever happens and a migrated world can sit weeks
 * between the two, so leaving it holding retired ids would show a GM the essence list of a world
 * that no longer exists.
 *
 * Neither position is on the shared walk's site lists, and correctly so: that walk rewrites
 * references to an entity, and these two are the entity's own identity and the system's roster of
 * them, so re-keying a definition is the caller's decision.
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
 * Freeze every section a re-pointed membership record was inheriting, at both scopes, in place
 * (requirement 8).
 *
 * The resolution runs against the record's current world parent — the loser's world default, read
 * before this pass deletes it — because the value being frozen is the one the record resolves to
 * today; resolving against the survivor would freeze the value the re-key is about to produce. A
 * section the record already overrides is left exactly as it is at both scopes: the world parent
 * never decided it, so moving the parent cannot change it.
 *
 * The in-system write is conditional on a world value existing and the membership write is not.
 * `applyInheritedSections` skips an absent world value before the flip and after it, so the row
 * already answers its own field and writing the canonical empty over it would destroy an authored
 * value; the membership record takes the canonical empty rather than absence because
 * `resolveScopedDefinition` falls back to the world value for an absent local section even under
 * `inherit: false`, which would silently hand the record the survivor's macro or effect source.
 *
 * @param {object} record The membership record, already cloned.
 * @param {object|null} loserDefault The world default of the entity being retired.
 * @param {Array<object>} inSystemRows This system's own `essenceDefinitions` rows for the entity,
 *   already re-keyed. Every one is written, because the union emits every in-system row.
 * @returns {string[]} The sections whose value was written onto the in-system rows, for the report.
 *   Empty when nothing was, which is the common case.
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
 * Index one corpus's already-re-keyed in-system essence rows by system and by id.
 *
 * Every row per id rather than the first, because {@link unionScopedDefinitions} emits the
 * in-system array's rows one for one and preserves a duplicate id rather than collapsing it, so a
 * single-row write would leave the second row answering the pre-freeze value. Duplicates are
 * unreachable from a derived map — requirement 6's output-uniqueness invariant refuses such a group
 * outright — and reachable from a hand-edited persisted one, which is the corpus this pass must
 * survive.
 *
 * @param {Array<object>} systems The cloned, re-keyed system array.
 * @returns {Map<string, Map<string, Array<object>>>}
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
 * Re-point one membership record at its survivor, freezing what it was inheriting first.
 *
 * The order inside is load-bearing: the freeze resolves the record through the parent it is
 * leaving, so it has to run while `entityId` still names the loser. The in-system rows are looked
 * up under the survivor id instead, because the rewrite half has already re-keyed them.
 *
 * @param {object} defaults The cloned world defaults, read before the loser keys are deleted.
 * @returns {{key: string, freeze: {systemId: string, essenceId: string, sections: string[]}}|null}
 *   The rebuilt key and this record's report entry, whose `sections` is empty when nothing was
 *   written in-system. `null` for a record that names no system: it cannot be keyed for its new
 *   parent and resolves for nobody, so it is dropped exactly as `readEssenceScope` never counted it
 *   as a live member.
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
 * Rebuild `essenceScope.membership` with every loser record re-pointed at its survivor.
 *
 * Two passes, and the order is load-bearing. The first copies every record this pass is not
 * re-pointing under its original key, which is what makes a no-op run byte-identical to its input
 * so the caller's comparison declines to write the leg; the second adds the re-pointed records
 * under the key {@link membershipKey} derives for their new parent.
 *
 * A collision keeps the survivor's own record. It is unreachable from a freshly derived map —
 * `findMembershipCollisionGroups` refuses a group whose merge would collide two membership keys,
 * which is why that third invariant is evaluated over the rebuilt keys rather than over the
 * in-system definition array — so this arm exists for a hand-edited persisted map alone, and the
 * survivor's record is the one the world already resolves through.
 *
 * @param {object} defaults The cloned world defaults, read before the loser keys are deleted.
 * @param {Map<string, Map<string, Array<object>>>} inSystemEssences The re-keyed in-system rows,
 *   from {@link indexInSystemEssences}, so a frozen section can reach the field the union reads.
 * @returns {{membership: object, inSystemFreezes: Array<object>}} The rebuilt map, and every
 *   in-system row this freeze wrote.
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
 * Run the whole `1.34.0` equivalent-world-essence merge.
 *
 * @param {object} data The runner's payload.
 * @returns {object} The keys this migration changed, plus the transient
 *   `_worldEssenceMergeReport`. Every unchanged key answers its original object.
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
  // reads the cloned corpus before the rewrite half touches it, as the sibling derives its
  // grouping, so it sees the ids the persisted map was written against.
  const equivalence = buildWorldEssenceEquivalence({
    systems,
    essenceScope: data.essenceScope,
    componentScope: data.componentScope,
  });
  const perSystemLegs = reusingPersistedMap ? persisted.systems : equivalence.mergeMap;
  const remap = unionMergeMap(perSystemLegs);
  const globalRemapper = keyedRemapper(remap);

  // -------------------------------------------------------------------------
  // 1. The rewrite half — unconditional, driven by the map alone.
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
    // `_normalizeEssenceQuantities` prunes a key outside the valid id basis, so a key missed here
    // is a silent deletion on the next save rather than a dangling reference a reader could report
    // (requirement 7).
    for (const record of Object.values(componentScope.membership)) {
      if (!isPlainObject(record) || trimmedString(record.systemId) !== systemId) continue;
      rewriteMembershipReferences(record, 'components', remappers);
    }
    // A tool membership record's `repairRequirements` is an `IngredientGroup[]` whose options may
    // be essence-typed, and `1.30.0` populates the position itself. `resolveTool` answers that
    // field from the membership record alone and never falls back to the world default, so a missed
    // id here is the only copy the repair check reads, disagreeing with the in-system copy this
    // pass has re-keyed (requirement 7).
    for (const record of Object.values(toolScope.membership)) {
      if (!isPlainObject(record) || trimmedString(record.systemId) !== systemId) continue;
      rewriteMembershipReferences(record, 'tools', remappers);
    }
  }

  // The world-scope key positions, which belong to no system and take the unioned lookup.
  for (const record of Object.values(componentScope.defaults)) {
    rewriteEssenceQuantityMap(record, { remapEssence: globalRemapper });
  }
  // A world tool default carries the donor's whole `repairRequirements` group array, elected under
  // a constraint whose guard checks component ids only (`worldScopeDefaults.electWorldDefault`), so
  // an essence-typed option reaches world scope untouched. It belongs to no system, so it takes the
  // unioned lookup.
  //
  // It is the sharpest of the three tool positions: `seedToolRepairRequirements`
  // (`src/systems/toolScope.js`) copies this array into every membership record minted when a tool
  // is added to a system, so a retired id left standing here does not decay — it propagates, into
  // systems that do not exist yet.
  for (const record of Object.values(toolScope.defaults)) {
    rewriteToolReferences(record, { remapEssence: globalRemapper });
  }

  // -------------------------------------------------------------------------
  // 2. The essence scope rebuild — the retirement itself. `readScopePayload` has already preserved
  // every other authored key on the payload through its extras spread, which requirement 7 requires
  // and which the `1.34.0` registry entry's `downgradeLosesData: false` rests on.
  // -------------------------------------------------------------------------
  // The membership rebuild reads the world defaults, so it runs before the loser keys are deleted:
  // a re-pointed inheriting record freezes the value it resolves to through the parent it is
  // leaving, and that parent's default is about to go. It runs after the rewrite half because the
  // in-system half of that freeze writes rows the rewrite half has already re-keyed.
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

  // -------------------------------------------------------------------------
  // 3. The tombstone leg, which is never cleared (requirement 17).
  // -------------------------------------------------------------------------
  // The persisted snapshot always wins: it was taken while the retired entity still existed, and a
  // re-run cannot re-observe an identity it has already deleted. A freshly derived snapshot is
  // adopted only for a loser the map being applied actually names, so a re-run cannot tombstone an
  // id that still lives.
  const retired = { ...persisted.retired };
  for (const [loserId, snapshot] of Object.entries(equivalence.retired)) {
    if (loserId in remap && !(loserId in retired)) retired[loserId] = snapshot;
  }

  // -------------------------------------------------------------------------
  // 4. The report — transient, captured and deleted by the runner (requirement 13).
  // -------------------------------------------------------------------------
  // `inSystemFreezes` is the one leg that does not come from the derivation: it names the only
  // write this pass makes to an authored field's value, requirement 8's in-system half, so it is
  // disclosed rather than made silently. It is empty on the migrated-world common case by
  // construction, since every record `buildMembershipRecord` wrote is fully overriding.
  const report = {
    mergedGroups: equivalence.mergedGroups,
    refusals: equivalence.refusals,
    declined: equivalence.declined,
    orphaned: equivalence.orphaned,
    inSystemFreezes: rebuilt.inSystemFreezes,
  };

  // -------------------------------------------------------------------------
  // 5. Return the original object for any key this pass did not change, compared against the
  // normalized read rather than the raw value, so a world with nothing to merge leaves its scope
  // settings and its map untouched rather than seeding them with empty collections: an empty
  // `entities` would make `_scopeEntityBasis` report a known, empty basis, which licences a prune.
  // -------------------------------------------------------------------------
  const unchanged = (next, original) =>
    JSON.stringify(next) === JSON.stringify(original) ? original : next;
  // The scope legs compare against the normalized read, so a payload this pass rebuilt into an
  // equal shape answers the caller's own object rather than a fresh clone of it.
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
