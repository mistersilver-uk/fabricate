/**
 * 1.34.0 — THE EQUIVALENT WORLD ESSENCE MERGE (issue 1654).
 *
 * Gives the world ONE record per essence BEHAVIOUR, repairing the duplication `1.30.0` left
 * behind when it grouped essences by an id that is not the semantic key it was assumed to be.
 * This module is the WRITE half; every DECISION it applies is made by
 * {@link buildWorldEssenceEquivalence} and every REFERENCE it rewrites is visited by the shared
 * walk in `worldScopeReferenceRewrite.js`. It contains no third enumeration of the corpus and no
 * second equivalence rule, deliberately: a mirror of either would rot.
 *
 * PURE, NON-MUTATING AND IDEMPOTENT. It clones what it transforms and returns the ORIGINAL
 * object for any key it did not change, so the runner's per-setting JSON comparison declines to
 * write an unchanged leg. TOTAL AND NON-THROWING — a migration that throws aborts the whole pass.
 *
 * ## WHY IT IS A FOURTH PASS (`destructive-changes-and-migrations` § Equivalent World Essence
 * Merge requirement 1)
 *
 * `1.30.0` grouped essences by trimmed `id` on the premise that an essence id is a stable
 * semantic slug. THAT PREMISE IS FALSE: ids are minted PER SYSTEM, by `crypto.randomUUID()` in
 * `adminStore.addEssence` or by a name-derived slug in `mintEssenceId`, so two systems' "Iron"
 * arrive as two unrelated ids and each lifted to its OWN world essence. `1.30.0`'s grouping is
 * NOT changed here — a world that already migrated needs the repair whether or not it ever was,
 * so the repair is a SEPARATE pass exactly as `1.31.0` and `1.32.0` are.
 *
 * ## THE TWO HALVES, AND WHY THEY ARE GATED DIFFERENTLY
 *
 * The shape is the sibling's (`migrateWorldScopeEntities.js`), because the failure modes are the
 * same ones:
 *
 * - The REWRITE half runs UNCONDITIONALLY over `craftingSystems`, `recipes`, `gatheringConfig`
 *   and the two scope payloads, driven by the merge map alone. It is idempotent by construction:
 *   each system's map has an image disjoint from its key set — an invariant
 *   {@link buildWorldEssenceEquivalence} REFUSES a group rather than break — and every site does
 *   a single simultaneous lookup, so an already-rewritten id is not a key.
 * - The MAP itself is REUSED from `fabricate.worldEssenceMergeMap` whenever that setting carries
 *   entries, and re-derived otherwise. This is the sibling's rule and it exists for the sibling's
 *   reason: a torn run may already have re-keyed `craftingSystems`, from which a re-derived map
 *   would be EMPTY while `recipes` and `gatheringConfig` still hold the retired ids. The map is
 *   written as the SECOND writeback leg precisely so it survives such a tear (requirement 10).
 *
 * The DERIVATION nevertheless runs on every pass, because it supplies the REPORT. Only its MAP is
 * discarded on a re-run.
 *
 * ## WHAT A MERGE DOES TO A RECORD THAT AUTHORED NOTHING (requirement 8)
 *
 * Changing a membership record's `entityId` changes its WORLD PARENT, so a section it was
 * INHERITING would resolve through a different world default — or through none at all — the
 * moment the re-key lands, and the loser's own world default is deleted with the loser. So a
 * re-pointed record that was inheriting a section has that section's CURRENTLY RESOLVED value
 * written as an explicit override and the switch flipped to `false`. That is `1.30.0`
 * requirement 6's "every section overridden" applied at the one moment the parent MOVES, and it
 * is what keeps a merge behaviour-neutral for a record that authored nothing of its own.
 *
 * AN ABSENT RESOLVED VALUE IS WRITTEN AS THE CANONICAL EMPTY — `macro: null`, `effectSource: {}`
 * — and NOT as absence. `resolveScopedDefinition` falls back to the world value for an ABSENT
 * local section even under `inherit: false`, so an absence-preserving write would silently hand
 * the record the SURVIVOR's macro or effect source. `buildMembershipRecord` writes both sections
 * unconditionally for exactly this reason; this is the same rule at the same seam.
 *
 * ## WHAT IS DELIBERATELY NOT TOUCHED (requirement 8a)
 *
 * The survivor's world identity wins and the loser's world entity row is DELETED with its `name`,
 * `icon`, `colorToken` and `description`. **The IN-SYSTEM records keep theirs**: while
 * `## CraftingSystem` requirement 36 holds the in-system copy is the source of truth every reader
 * resolves through, and the triple this pass merged on says NOTHING about presentation, so
 * overwriting a re-keyed system's authored icon or description would destroy authored data this
 * pass has no behavioural evidence about. The consequence is stated rather than discovered:
 * `reportWorldIdentityDrift` will report a divergence for every re-keyed record whose identity
 * differs from the survivor's, that disclosure is CORRECT, and the `1.34.0` label says in advance
 * that it will fire.
 *
 * ## THE PERSISTED MAP'S SHAPE, AND WHY IT IS NESTED
 *
 * `{ systems: { [systemId]: { essences: { [loserId]: survivorId } } }, retired: { [loserId]: … } }`
 *
 * The per-system leg and the tombstone leg have DIFFERENT LIFETIMES — the pairs are cleared by
 * the one-shot pass that consumes them once this migration has completed, and `retired` is NEVER
 * cleared (requirements 11 and 17) — so they are two named siblings rather than a tombstone key
 * sitting among the system ids. Filing `retired` beside the system ids would make a world whose
 * crafting system is literally named `retired` ambiguous, and the ambiguity would be invisible:
 * nothing validates a system id against the reserved name on the way in.
 */

import { ESSENCE_SECTIONS, resolveEssence } from '../systems/essenceScope.js';
import { membershipKey } from '../systems/scopedDefinitions.js';

import { readScopePayload } from './migrateWorldScopeEntities.js';
import { clone, isPlainObject } from './migrationHelpers.js';
import { buildWorldEssenceEquivalence } from './worldEssenceEquivalence.js';
import { ENTITY_TYPE_FIELDS } from './worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteEssenceQuantityMap,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
} from './worldScopeReferenceRewrite.js';

/** The `craftingSystem` array essences are stored under, read from the ONE list that names it. */
const ESSENCE_DEFINITIONS_FIELD = ENTITY_TYPE_FIELDS.essences;

/** The entity-type leg the per-system map is written under. */
const ESSENCES = 'essences';

/**
 * The value each essence section takes when a re-pointed record was inheriting it and the world
 * had NO opinion to freeze.
 *
 * Both are REAL, OVERRIDING values that every reader treats as "no macro" and "no source" — which
 * is what makes them expressible at all, and what lets this pass state a record's current
 * behaviour rather than leave an absence that falls back to the new parent's.
 *
 * @type {Readonly<Record<string, unknown>>}
 */
const EMPTY_SECTION_OVERRIDE = Object.freeze({ macro: null, effectSource: Object.freeze({}) });

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Normalize the persisted `fabricate.worldEssenceMergeMap` to its two named legs, dropping
 * anything that cannot be one.
 *
 * TOTAL: a hand-edited, absent or wrongly-shaped value answers the empty pair of legs rather than
 * raising, and a partially-readable value keeps the half that reads.
 *
 * THE `retired` LEG IS NORMALIZED BY KEY ONLY and its snapshots are passed through verbatim. It
 * is a TOMBSTONE, read by `mintEssenceId` as a key set (`worldScopeProjection.retiredEssenceIds`),
 * and a normalizer that dropped a snapshot it did not recognise would discard the only record of
 * what a retired entity carried — which is the one thing a GM undoing a bad merge has to restore
 * from.
 *
 * @param {unknown} raw
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
 * The WORLD-WIDE old-to-new lookup, unioned from the per-system legs.
 *
 * The per-system legs are what the REFERENCE rewrite uses, because a loser id is re-keyed only in
 * the systems it is PRESENT in — rewriting it elsewhere would convert a dangling reference into a
 * live contribution of the survivor's weight, which is the outcome the tombstone leg exists to
 * prevent. The union is used for the WORLD-SCOPE payload positions only: a world entity row, a
 * world default key and a world default's essence quantity map belong to no system, so there is
 * no per-system leg that could answer for them.
 *
 * The union is unambiguous because every leg that names a loser names the SAME survivor: the map
 * is built from one per-group election, per system, and a group whose map is not disjoint is
 * refused outright.
 *
 * @param {object} perSystemLegs
 * @returns {{[loserId: string]: string}}
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
 * Re-key one system's OWN essence rows: the definition ids, and the derived id array beside them.
 *
 * `systems[].essences` is a DERIVED alias `_normalizeSystem` re-mints from `essenceDefinitions` on
 * the next save, so it is not authored data — but it is READ before that save ever happens, and a
 * migrated world can sit for weeks between the two. Leaving it holding retired ids would show a
 * GM the essence list of a world that no longer exists.
 *
 * Neither position is on the shared walk's site lists, and correctly so: the walk rewrites
 * REFERENCES to an entity, and these two are the entity's own identity and the system's roster of
 * them. `rewriteSystemReferences` says the same thing about a component's and an essence's own
 * `id` — re-keying a definition is the CALLER's decision.
 *
 * @param {object} system
 * @param {(value: unknown) => unknown} remapEssence
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
 * Freeze every section a RE-POINTED membership record was inheriting, in place.
 *
 * Requirement 8. The resolution is taken against the record's CURRENT world parent — the LOSER's
 * world default, read before this pass deletes it — because the value being frozen is the one the
 * record resolves to TODAY. Resolving against the survivor instead would freeze the value the
 * re-key is about to produce, which is not a freeze at all.
 *
 * A section the record already OVERRIDES is left exactly as it is: it authored its own value, the
 * world parent never decided it, and moving the parent cannot change it.
 *
 * @param {object} record The membership record, already cloned.
 * @param {object|null} loserDefault The world default of the entity being retired.
 */
function freezeInheritedSections(record, loserDefault) {
  const resolved = resolveEssence(loserDefault, record);
  for (const section of ESSENCE_SECTIONS) {
    if (resolved.inherited?.[section] !== true) continue;
    const value = resolved[section];
    record[section] = value === undefined ? clone(EMPTY_SECTION_OVERRIDE[section]) : clone(value);
    if (!isPlainObject(record.inherit)) record.inherit = {};
    record.inherit[section] = false;
  }
}

/**
 * Rebuild `essenceScope.membership` with every loser record re-pointed at its survivor.
 *
 * TWO PASSES, and the order is load-bearing. The first copies every record this pass is NOT
 * re-pointing, under its ORIGINAL key — which is what makes a no-op run byte-identical to its
 * input, so the caller's JSON comparison declines to write the leg. The second adds the
 * re-pointed records under the key {@link membershipKey} derives for their new parent.
 *
 * A COLLISION KEEPS THE SURVIVOR'S OWN RECORD. It is unreachable from a freshly derived map —
 * `findMembershipCollisionGroups` REFUSES a group whose merge would collide two membership keys,
 * which is the whole reason that third invariant is evaluated over the REBUILT keys rather than
 * over the in-system definition array — so this arm exists for a hand-edited persisted map alone.
 * Dropping the re-pointed record rather than the authored one is the conservative half: the
 * survivor's record is the one the world already resolves through.
 *
 * @param {object} membership The cloned membership map.
 * @param {object} defaults The cloned world defaults, read BEFORE the loser keys are deleted.
 * @param {{[loserId: string]: string}} remap The world-wide old-to-new lookup.
 * @returns {object} The rebuilt map.
 */
function rebuildMembership(membership, defaults, remap) {
  const rebuilt = {};
  const repointed = [];
  for (const [key, record] of Object.entries(membership)) {
    const entityId = isPlainObject(record) ? trimmedString(record.entityId) : null;
    const survivorId = entityId ? remap[entityId] : undefined;
    if (!survivorId) {
      rebuilt[key] = record;
      continue;
    }
    repointed.push({ record, loserId: entityId, survivorId });
  }
  for (const { record, loserId, survivorId } of repointed) {
    const systemId = trimmedString(record.systemId);
    // A record that names no system cannot be keyed for its new parent and cannot be resolved
    // for; it is dropped exactly as `readEssenceScope` never counted it as a live member.
    if (!systemId) continue;
    freezeInheritedSections(record, isPlainObject(defaults[loserId]) ? defaults[loserId] : null);
    record.entityId = survivorId;
    const key = membershipKey(survivorId, systemId);
    if (!(key in rebuilt)) rebuilt[key] = record;
  }
  return rebuilt;
}

/**
 * Run the whole `1.34.0` equivalent-world-essence merge.
 *
 * @param {object} data The runner's payload.
 * @returns {object} The keys this migration changed, plus the transient
 *   `_worldEssenceMergeReport`. Every unchanged key answers its ORIGINAL object.
 */
export function mergeEquivalentWorldEssences(data) {
  if (!isPlainObject(data)) return data;

  const systems = clone(arrayOf(data.systems));
  const recipes = clone(arrayOf(data.recipes));
  const gatheringConfig = clone(isPlainObject(data.gatheringConfig) ? data.gatheringConfig : {});
  const essenceScope = readScopePayload(data.essenceScope);
  const componentScope = readScopePayload(data.componentScope);

  const persisted = normalizeEssenceMergeMap(data.worldEssenceMergeMap);
  const reusingPersistedMap = mapHasEntries(persisted.systems);
  // Derived on EVERY pass, because it supplies the REPORT — the merged groups, the refusals, the
  // declined candidates and the orphans a GM is told about. Only its MAP is discarded on a re-run.
  // It is derived from the CLONED corpus BEFORE the rewrite half touches it, exactly as the
  // sibling derives its grouping, so it reads the ids the persisted map was written against.
  const equivalence = buildWorldEssenceEquivalence({
    systems,
    essenceScope: data.essenceScope,
    componentScope: data.componentScope,
  });
  const perSystemLegs = reusingPersistedMap ? persisted.systems : equivalence.mergeMap;
  const remap = unionMergeMap(perSystemLegs);
  const globalRemapper = keyedRemapper(remap);

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
    const legs = perSystemLegs[systemId];
    if (!legs) continue;
    const remapEssence = keyedRemapper(legs[ESSENCES]);
    const remappers = { remapEssence };
    // The DEFINITION ids and the derived roster first, then every reference to them.
    rekeySystemEssenceIds(system, remapEssence);
    rewriteSystemReferences(system, remappers);
    for (const recipe of recipesBySystem.get(systemId) ?? []) {
      rewriteRecipeReferences(recipe, remappers);
    }
    if (isPlainObject(gatheringConfig.systems)) {
      rewriteGatheringSliceReferences(gatheringConfig.systems[systemId], remappers);
    }
    // A COMPONENT membership record's `essences` map is spelled over `Component.essences`, so its
    // KEYS are world essence ids. `_normalizeEssenceQuantities` PRUNES a key that is not in the
    // Valid Id Basis, so a missed key here is a SILENT DELETION on the next save rather than a
    // dangling reference a reader could report (requirement 7).
    for (const record of Object.values(componentScope.membership)) {
      if (!isPlainObject(record) || trimmedString(record.systemId) !== systemId) continue;
      rewriteMembershipReferences(record, 'components', remappers);
    }
  }

  // The WORLD-SCOPE key positions, which belong to no system and take the unioned lookup.
  for (const record of Object.values(componentScope.defaults)) {
    rewriteEssenceQuantityMap(record, { remapEssence: globalRemapper });
  }

  // -------------------------------------------------------------------------
  // 2. THE ESSENCE SCOPE REBUILD — the retirement itself.
  //
  // `readScopePayload` has already preserved every OTHER authored key on the payload through its
  // extras spread, which requirement 7's last sentence requires and which the `1.34.0` registry
  // entry's `downgradeLosesData: false` rests on.
  // -------------------------------------------------------------------------
  // The membership rebuild reads the world defaults, so it runs BEFORE the loser keys are deleted:
  // a re-pointed inheriting record freezes the value it resolves to through the parent it is
  // LEAVING, and that parent's default is about to go.
  essenceScope.membership = rebuildMembership(
    essenceScope.membership,
    essenceScope.defaults,
    remap
  );
  for (const loserId of Object.keys(remap)) delete essenceScope.defaults[loserId];
  essenceScope.entities = essenceScope.entities.filter(
    (entity) => !(trimmedString(entity?.id) && trimmedString(entity.id) in remap)
  );

  // -------------------------------------------------------------------------
  // 3. THE TOMBSTONE LEG, which is never cleared (requirement 17).
  //
  // The PERSISTED snapshot always wins: it was taken while the retired entity still existed, and
  // a re-run cannot re-observe an identity it has already deleted. A freshly derived snapshot is
  // adopted only for a loser the map being APPLIED actually names — on a re-run the derivation
  // may see a group the persisted map does not merge, and tombstoning an id that still lives
  // would take it out of circulation for nothing.
  // -------------------------------------------------------------------------
  const retired = { ...persisted.retired };
  for (const [loserId, snapshot] of Object.entries(equivalence.retired)) {
    if (loserId in remap && !(loserId in retired)) retired[loserId] = snapshot;
  }

  // -------------------------------------------------------------------------
  // 4. THE REPORT — transient, captured and DELETED by the runner (requirement 13).
  // -------------------------------------------------------------------------
  const report = {
    mergedGroups: equivalence.mergedGroups,
    refusals: equivalence.refusals,
    declined: equivalence.declined,
    orphaned: equivalence.orphaned,
  };

  // -------------------------------------------------------------------------
  // 5. RETURN THE ORIGINAL OBJECT FOR ANY KEY THIS PASS DID NOT CHANGE.
  //
  // Compared against the NORMALIZED read of the original rather than the raw value, so a world
  // with nothing to merge leaves its two scope settings and its map untouched rather than seeding
  // them with empty collections. Seeding an empty `entities` would make `_scopeEntityBasis`
  // report a KNOWN, EMPTY basis, which is a licence to prune.
  // -------------------------------------------------------------------------
  const unchanged = (next, original) =>
    JSON.stringify(next) === JSON.stringify(original) ? original : next;
  // The scope legs compare against the NORMALIZED read, so a payload this pass rebuilt into an
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
    worldEssenceMergeMap:
      JSON.stringify(mergeMapSetting) === JSON.stringify(persisted)
        ? data.worldEssenceMergeMap
        : mergeMapSetting,
    _worldEssenceMergeReport: report,
  };
}
