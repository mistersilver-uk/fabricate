/**
 * Pure classification, rebinding, and resolution of the cross-references carried
 * by a Fabricate import payload. Foundry-free: the only side channel is an
 * INJECTED async `resolveUuid` used for external existence checks (the importer
 * passes a wrapper over `fromUuid`).
 *
 * References fall into two classes:
 *   - INTERNAL — resolvable within the payload (env→task/event id linkage, drop-row
 *     `componentId`, tool `componentId`, recipe `recipeItemId`, essence
 *     `sourceComponentId`). A broken internal reference is a data-integrity
 *     warning: kept verbatim and reported.
 *   - EXTERNAL — world documents that may be absent in the target world
 *     (environment `sceneUuid`, realm `sceneMappings[].sceneUuid` +
 *     `sceneRegionUuid`, drop-row `itemUuid`, macro UUIDs). Preserved verbatim,
 *     resolved via `resolveUuid` if possible, else reported — never nulled out.
 *
 * Each reported/handled reference becomes an entry:
 *   { kind, ownerType, ownerId, ownerName, referenceValue, disposition }
 * where disposition is one of:
 *   - `remapped`  — external ref resolved to a DIFFERENT value (updated in place)
 *   - `retained`  — external ref resolved unchanged (kept verbatim)
 *   - `reported`  — needs GM attention (external absent, or broken internal)
 */

import { sourceReferencesOf, toolSourceReferences } from '../migration/worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
} from '../migration/worldScopeReferenceRewrite.js';

/** Reference kinds (also used as localization suffixes in the report). */
export const REFERENCE_KINDS = Object.freeze({
  SOURCE_ITEM: 'sourceItem',
  SCENE: 'scene',
  SCENE_REGION: 'sceneRegion',
  MACRO: 'macro',
  DROP_ROW_ITEM: 'dropRowItem',
  TASK_LINK: 'taskLink',
  EVENT_LINK: 'eventLink',
  COMPONENT_LINK: 'componentLink',
  RECIPE_ITEM: 'recipeItem',
  // The four world-scope entity kinds (issue 1364, epic 1357). All four carry the shipped
  // `reported` disposition and reuse the shipped entity-specific owner types, except
  // `worldToolBreakageDropped`, whose subject is a SETTING rather than a record and which
  // therefore takes the shipped `unknown` owner type. No new ownerType is introduced: a generic
  // `worldEntity` would be unsearchable and would lose the entity type in a report grouped by
  // kind.
  WORLD_ENTITY_COLLISION: 'worldEntityCollision',
  WORLD_ENTITY_MISSING: 'worldEntityMissing',
  WORLD_DEFAULT_DECLINED: 'worldDefaultDeclined',
  WORLD_TOOL_BREAKAGE_DROPPED: 'worldToolBreakageDropped',
});

/** The world-scope entity types, and the settings key + in-system array each is carried under. */
export const WORLD_SCOPE_ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/** The envelope slice key for each world-scope entity type. */
export const WORLD_SCOPE_SLICE_KEYS = Object.freeze({
  components: 'componentScope',
  essences: 'essenceScope',
  tools: 'toolScope',
});

/** The `system` array each world-scope entity type is stored under. */
const WORLD_SCOPE_SYSTEM_FIELDS = Object.freeze({
  components: 'components',
  essences: 'essenceDefinitions',
  tools: 'tools',
});

/** The report owner type each world-scope entity type reuses. */
const WORLD_SCOPE_OWNER_TYPES = Object.freeze({
  components: 'component',
  essences: 'essence',
  tools: 'tool',
});

const LOCAL_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function localId() {
  // 16-char base36 id; Foundry-free stand-in for foundry.utils.randomID().
  // Draws from the platform CSPRNG (`crypto.getRandomValues`, available in Node
  // and the Foundry browser context) rather than a pseudorandom generator, so it
  // stays pure, unit-testable, and free of insecure-randomness findings.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) {
    id += LOCAL_ID_ALPHABET[byte % LOCAL_ID_ALPHABET.length];
  }
  return id;
}

/**
 * The source-reference set one incoming record claims, computed exactly as the `1.30.0` grouping
 * computes it.
 *
 * IT IS THE MIGRATION'S SIX-SPELLING RULE, not the narrower three-field `getItemMatchUuids`, and
 * that is load-bearing rather than tidy. `sourceReferencesOf` reads `originItemUuid`,
 * `registeredItemUuid`, `sourceUuid`, `sourceItemUuid` and then `aliasItemUuids` OR - only in its
 * absence - `fallbackItemIds`. The three extra spellings are the LEGACY ones, which is exactly
 * what a schema 1-5 export carries: a component linked only through `sourceUuid` would be LINKED
 * to the migration and UNLINKED to the import, and would mint a duplicate world entity for an Item
 * the destination already holds. The alias list is an EITHER/OR, so a record carrying both has its
 * `fallbackItemIds` ignored.
 *
 * @param {unknown} record
 * @param {string} entityType
 * @param {object[]} components The OWNING system's component array, for a tool with no own refs.
 * @returns {string[]}
 */
function sourceReferenceSet(record, entityType, components) {
  return entityType === 'tools'
    ? toolSourceReferences(record, components)
    : sourceReferencesOf(record);
}

/**
 * The destination's world entity roster for one entity type, in roster order, each paired with its
 * source-reference set.
 *
 * @param {unknown} worldEntityIndex
 * @param {string} entityType
 * @returns {Array<{id: string, refs: Set<string>}>}
 */
function destinationRoster(worldEntityIndex, entityType) {
  const entities = worldEntityIndex?.[entityType];
  if (!Array.isArray(entities)) return [];
  const roster = [];
  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    const id = typeof entity.id === 'string' ? entity.id.trim() : '';
    if (!id) continue;
    // A world entity carries its OWN refs; there is no owning system to derive a tool's through,
    // and the migration's write-back has already folded a derived set onto it.
    roster.push({ id, refs: new Set(sourceReferencesOf(entity)) });
  }
  return roster;
}

function intersectionSize(refs, candidateRefs) {
  let size = 0;
  for (const ref of refs) if (candidateRefs.has(ref)) size += 1;
  return size;
}

function reportEntry(kind, ownerType, owner, referenceValue) {
  return {
    kind,
    ownerType,
    ownerId: owner?.id ?? null,
    ownerName: owner?.name ?? '',
    referenceValue,
    disposition: 'reported',
  };
}

/**
 * Report every incoming entity whose id equals a DESTINATION world entity's id while their source
 * references prove they are different Items (issue 1364, `worldEntityCollision`).
 *
 * IT RESOLVES, TO THE WRONG THING, which is why it is REPORTED rather than repaired. Component and
 * tool ids are not globally unique and copy-import has always preserved them; while ids were per
 * system that was harmless, but once they name WORLD entities an id collision silently binds the
 * imported system's membership record to an unrelated world record. Keep mode must not regenerate
 * anything, so there is no repair available that would not itself be a re-key.
 *
 * IT IS NOT KEEP-MODE-ONLY. It applies in keep mode for all three entity types, and in COPY mode
 * for tools and essences, whose identifiers copy mode preserves verbatim; components in copy mode
 * are protected by match-or-mint and cannot reach this state.
 *
 * THE PREDICATE REQUIRES POSITIVE EVIDENCE: both sets non-empty AND disjoint. An UNLINKED record
 * on either side carries no evidence either way, and reporting it would fire on the commonest
 * operation there is - re-importing a pack the destination already has.
 *
 * **THE ESSENCE ARM IS VACUOUS IN PRACTICE, AND SAYING SO IS THE POINT.** The DESTINATION side is
 * what makes it so: `WORLD_IDENTITY_FIELDS.essences` lifts only `name` / `icon` / `colorToken` /
 * `description`, because an essence id is a stable semantic slug the `1.30.0` grouping treats as
 * the identity itself, so no world essence entity the migration or an export ever produced
 * carries a source link and `destination.refs.size` is 0 for every one of them. The INCOMING side
 * is not empty - an essence definition's own `sourceItemUuid` is a THIRD, unrelated field family
 * that `sourceReferencesOf` happens to read - so it is the destination half alone that
 * short-circuits the positive-evidence guard. The loop still covers all three entity types
 * because the rule is stated over all three and a hand-authored world essence carrying a link
 * would then be covered without an edit; it is written down so no one mistakes the arm for tested
 * behaviour.
 *
 * **IT DELIBERATELY DOES NOT COVER COPY-MODE COMPONENTS, AND THE MANY-TO-ONE CASE IS NOT ITS
 * JOB.** This pass runs BEFORE `rebindCopyComponentIds`, so under copy mode a component's id here
 * is a PRE-REBIND id that is about to be replaced; reporting a collision on it would name an
 * identifier the prepared payload does not contain. The converse hazard - two incoming components
 * binding to ONE destination entity - is reported by the id-claim ladder in
 * {@link rebindCopyComponentIds}, which is the only place that knows which record claimed what.
 *
 * @param {object} prepared
 * @param {unknown} worldEntityIndex
 * @param {'keep'|'copy'} mode
 * @returns {object[]} report entries
 */
export function reportWorldEntityCollisions(prepared, worldEntityIndex, mode) {
  const entries = [];
  if (!prepared || typeof prepared !== 'object' || !worldEntityIndex) return entries;
  const components = arrayOf(prepared.system?.components);
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    // Components in copy mode bind through match-or-mint, so they never arrive under a colliding
    // id in the first place.
    if (mode === 'copy' && entityType === 'components') continue;
    const roster = destinationRoster(worldEntityIndex, entityType);
    if (roster.length === 0) continue;
    const byId = new Map(roster.map((entity) => [entity.id, entity]));
    for (const record of arrayOf(prepared.system?.[WORLD_SCOPE_SYSTEM_FIELDS[entityType]])) {
      if (!record || typeof record !== 'object') continue;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const destination = id ? byId.get(id) : null;
      if (!destination) continue;
      const refs = sourceReferenceSet(record, entityType, components);
      if (refs.length === 0 || destination.refs.size === 0) continue;
      if (intersectionSize(refs, destination.refs) > 0) continue;
      entries.push(
        reportEntry(
          REFERENCE_KINDS.WORLD_ENTITY_COLLISION,
          WORLD_SCOPE_OWNER_TYPES[entityType],
          record,
          id
        )
      );
    }
  }
  return entries;
}

/**
 * Copy-mode: regenerate record-CONTAINER ids (environment record ids) while PRESERVING
 * task / event / characterModifier ids so environment→library linkages survive (D3). The
 * `craftingSystemId` and the `gatheringConfig` system key are rebound by the importer once
 * `createSystem` has produced the fresh system id.
 *
 * REALM IDS ARE NO LONGER PART OF WHAT A COPY REBINDS (issue 1282). They were, while realms
 * belonged to the crafting system and a copy of that system therefore needed its own copies of
 * its places. Realms are WORLD scope now: they ride the envelope rather than the system, and
 * `CompendiumImporter._persistTravelConfig` merges them by id with the destination winning a
 * collision. Rebinding them here would defeat that merge outright — every realm in the pack
 * would arrive under an id the world has never seen, so a copy-import would DUPLICATE the
 * world's entire geography instead of recognising it, and the copy's environments would gate on
 * the duplicates while every other system kept gating on the originals.
 *
 * That is also why `includedRealmIds` / `excludedRealmIds` are left exactly as authored: the
 * ids they cite are the world's, and they still name the same places after the copy.
 *
 * @param {{ system: object, recipes: object[], gatheringEnvironments: object[], gatheringConfig: object }} prepared
 * @param {{ generateId?: () => string }} [deps]
 * @returns {object} the same `prepared` reference, mutated
 */
export function rebindCopyContainerIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { gatheringEnvironments } = prepared;

  // --- Environment record ids ---
  const environments = Array.isArray(gatheringEnvironments) ? gatheringEnvironments : [];
  for (const env of environments) {
    if (!env || typeof env !== 'object') continue;
    if (env.id) env.id = generateId();
  }

  return prepared;
}

/**
 * Copy-mode: bind every incoming component to the destination's EXISTING world entity where its
 * source references say they are the same Item, MINT a fresh id where they do not, and atomically
 * remap every within-payload reference to an old component id so nothing dangles.
 *
 * ## MATCH-OR-MINT REPLACES MINT-EVERYTHING (issue 1364, epic 1357 decision 5)
 *
 * Copy mode used to regenerate EVERY component id (issue 570), which closed issue 556's
 * copy-import id-collision residual while component ids were per system. Once they name WORLD
 * entities that same rule became the duplication this epic exists to end: re-importing a pack the
 * destination already has created a SECOND world record for every real Item in it. So an incoming
 * component whose source-reference set INTERSECTS an existing destination world entity's binds to
 * that entity's id, and only an unmatched or UNLINKED component mints.
 *
 * The guarantee issue 570 needed still holds, restated accurately: two copies share an id only
 * when their source-reference sets INTERSECT - a DIRECT shared reference, which is the relation
 * the `1.30.0` grouping unions on - so the two would have resolved to ONE world entity had they
 * been grouped in one corpus. Transitivity is how each SIDE's set was built, not what the match
 * tests.
 *
 * ## THE COLLECTION MATCHED OVER IS `prepared.system.components`, NEVER THE DERIVED SLICE
 *
 * That is easy to get backwards and it is load-bearing. The in-system array keeps its LEGACY
 * spellings, because the payload upcast discards the shared transform's rewritten `systems`;
 * the derived world entity in `componentScope.entities` has already canonicalised those spellings
 * into `aliasItemUuids`. Matching over the slice would make even the narrow three-field matcher
 * find them, and the whole point of using the six-spelling rule would evaporate.
 *
 * ## MULTI-MATCH BINDS DETERMINISTICALLY AND REPORTS
 *
 * The `1.30.0` grouping UNIONS a group's source references onto every in-system record, so an
 * exported record from a migrated world carries its whole SOURCE-WORLD GROUP's uuids. An incoming
 * set can therefore intersect MORE THAN ONE destination world entity. The import does not MERGE
 * them - that would be a destructive change to data the import did not bring - and it does not
 * MINT either, which would recreate the duplicate silently. It binds to the LARGEST intersection,
 * ties broken by roster position (first wins), and reports the ambiguity naming every losing
 * candidate. The tie-break is deterministic for the reason the id-claim ladder's is: a re-run must
 * choose identically.
 *
 * ## AND THE BINDING IS INJECTIVE: ONE DESTINATION ENTITY, AT MOST ONE INCOMING RECORD
 *
 * The converse of multi-match is the one that loses data, and it is not exotic. TWO incoming
 * records can intersect ONE destination entity - directly, when they share a
 * `registeredItemUuid`, and transitively, when the destination entity's own set was WIDENED by
 * the `1.30.0` grouping's union so that `c1{Item.x}` and `c2{Item.y}`, which share nothing with
 * each other, both intersect it. "Intersects a destination entity" is therefore NOT an
 * equivalence relation over the incoming records and cannot partition them.
 *
 * Without a claim ladder both records bind to the same id and the SECOND one vanishes whole:
 * `_normalizeSystem` keeps only the last of a duplicate id in `itemById`, and the read union
 * de-duplicates by entity id, so the component disappears from the UI, from the index and from
 * the engine with no error anywhere. The migration REFUSES the same corpus outright
 * (`outputIdCollision`), so silently collapsing it here would give one release two answers to one
 * question.
 *
 * So {@link bindToDestination} carries the ID-CLAIM LADDER's three rungs, keyed on the
 * DESTINATION id rather than on a group's members: the best intersecting candidate if unclaimed,
 * else the NEXT unclaimed intersecting candidate in the same ranked order, else mint. Every
 * contested destination id is reported naming BOTH owners.
 *
 * **The middle rung is not polish.** Mint-immediately is neither order-stable nor idempotent:
 * destination roster order is the key order of a persisted setting that nothing in this pipeline
 * sorts, and a record that mints because its best candidate was taken adds one world entity per
 * import, forever, because the entity it minted last time is never the one it prefers this time.
 * Taking the next unclaimed candidate binds to that minted entity on the second run instead, so
 * the second and every later import adds nothing.
 *
 * ## ONE ID CLASS, NOT THREE, AND FIVE REWRITE TARGETS
 *
 * Only components ever regenerated. Tools and essences continue to bind by id verbatim, and their
 * source-reference comparison is used only to REPORT a mismatch. The map drives FIVE targets:
 * the system, recipes and gathering slice through the shared walk; every `membership` record;
 * every `defaults` record, through the SAME section-shaped function; those records' own `id` /
 * `entityId`; and the incoming `entities` roster's own `id`, where a MATCHED entity's record is
 * DROPPED rather than re-keyed, because the destination already holds that world entity.
 *
 * Dropping rather than re-keying is deliberate. Re-keying and relying on the merge's
 * destination-wins collision rule is observationally equivalent under a CORRECT merge, and that is
 * exactly why it is not chosen: it would make this function's correctness depend on the merge's
 * collision rule being right.
 *
 * THE TRAVERSAL ITSELF IS NOT HERE. Every reference site lives in the ONE shared walk
 * `src/migration/worldScopeReferenceRewrite.js`, which this function and the `1.30.0` world-scope
 * migration both drive (issue 1363). This function keeps only what is copy-mode-specific.
 *
 * The rewrite is KEY-AWARE: it only rewrites a value that (a) sits at one of the enumerated
 * component-reference sites AND (b) equals an old component id. A value at a non-reference
 * position (a `recipeIds[]` entry, an outcome/salvage-group id, a scene/macro UUID) is never
 * touched even if it coincidentally equals a component id.
 *
 * TOOL IDS ARE NOT RE-KEYED BY COPY MODE, so the shared walk's tool-id sites are driven with an
 * identity remapper and are provably inert here.
 *
 * @param {{ system: object, recipes: object[], gatheringConfig: object }} prepared
 * @param {object} [deps]
 * @param {() => string} [deps.generateId]
 * @param {{components?: object[], essences?: object[], tools?: object[]}} [deps.worldEntityIndex]
 *   The DESTINATION world's entity roster. Required by `prepareForImport` under copy mode; an
 *   empty index here simply means every component mints.
 * @param {object[]} [deps.report] Sink for the ambiguity entries.
 * @returns {object} the same `prepared` reference, mutated
 */
export function rebindCopyComponentIds(
  prepared,
  { generateId = localId, worldEntityIndex = null, report = null } = {}
) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { system, recipes, gatheringConfig } = prepared;

  const components = Array.isArray(system?.components) ? system.components : [];
  const roster = destinationRoster(worldEntityIndex, 'components');

  // --- Old -> new component-id map (built over system.components[].id only) ---
  const idMap = {};
  /** The incoming ids that BOUND to a destination world entity rather than minting. */
  const matched = new Set();
  /**
   * The ID-CLAIM LADDER's state: destination entity id -> the incoming record that took it.
   * It is what makes the binding INJECTIVE, and it is a Map rather than a Set because a
   * contention is only actionable if the report can name BOTH owners.
   */
  const claimed = new Map();
  for (const component of components) {
    if (!component || typeof component !== 'object' || !component.id) continue;
    const refs = sourceReferenceSet(component, 'components', components);
    const bound =
      refs.length > 0 ? bindToDestination(refs, roster, component, report, claimed) : null;
    if (bound) {
      idMap[component.id] = bound;
      matched.add(component.id);
    } else {
      idMap[component.id] = generateId();
    }
  }
  if (Object.keys(idMap).length === 0) return prepared;

  // TARGET 5, first half - the world entity roster's own ids. A MATCHED entity's record is
  // DROPPED: the destination already holds that world entity, so there is nothing to add.
  dropMatchedWorldEntities(prepared, matched, idMap);

  // Rewrite the component ids themselves.
  for (const component of components) {
    if (component && typeof component === 'object' && component.id && idMap[component.id]) {
      component.id = idMap[component.id];
    }
  }

  const remappers = { remapComponent: keyedRemapper(idMap), remapTool: (value) => value };
  // TARGET 1 - the system, its recipes and its gathering slice, through the shared walk.
  for (const recipe of arrayOf(recipes)) rewriteRecipeReferences(recipe, remappers);
  rewriteSystemReferences(system, remappers);
  rewriteGatheringSliceReferences(systemSlice(gatheringConfig), remappers);
  // TARGETS 2, 3 and 4 - the component references INSIDE the three slices, and the records' own
  // identifiers.
  rewriteScopeSliceReferences(prepared, remappers, keyedRemapper(idMap));

  return prepared;
}

/**
 * Bind one incoming component to a destination world entity, or answer `null` to mint.
 *
 * THE ID-CLAIM LADDER, keyed on the destination id: the best intersecting candidate if
 * UNCLAIMED, else the next unclaimed candidate in the same ranked order, else mint. `claimed` is
 * threaded across the whole payload's records, which is what makes the binding INJECTIVE - see
 * {@link rebindCopyComponentIds}'s note for what a non-injective binding silently destroys, and
 * why the middle rung rather than an immediate mint is what makes a re-import idempotent.
 *
 * @param {string[]} refs
 * @param {Array<{id: string, refs: Set<string>}>} roster In ROSTER ORDER, which is the tie-break.
 * @param {object} component The incoming record, for the report's owner.
 * @param {object[]|null} report
 * @param {Map<string, object>} claimed Destination id -> the incoming record that took it.
 * @returns {string|null}
 */
function bindToDestination(refs, roster, component, report, claimed) {
  const candidates = rankedCandidates(refs, roster);
  if (candidates.length === 0) return null;

  // Everything ranked ABOVE the winner is, by construction, already claimed by another incoming
  // record; everything BELOW it is an ordinary multi-match loser.
  const winnerIndex = candidates.findIndex((candidate) => !claimed.has(candidate.id));
  const contested = winnerIndex === -1 ? candidates : candidates.slice(0, winnerIndex);
  const beaten = winnerIndex === -1 ? [] : candidates.slice(winnerIndex + 1);
  reportBinding(report, component, claimed, contested, beaten);

  // RUNG 3 - every intersecting candidate is spoken for, so this record mints its own id.
  if (winnerIndex === -1) return null;

  const winner = candidates[winnerIndex].id;
  claimed.set(winner, component);
  return winner;
}

/**
 * Every destination entity one incoming reference set intersects, best match first.
 *
 * Ranked by intersection size DESCENDING, ties by ROSTER POSITION so first wins. The position is
 * carried explicitly rather than left to `Array#sort`'s stability, because the ranking is the
 * whole of the determinism guarantee and a re-run must choose identically.
 *
 * @param {string[]} refs
 * @param {Array<{id: string, refs: Set<string>}>} roster
 * @returns {Array<{id: string, size: number, position: number}>}
 */
function rankedCandidates(refs, roster) {
  const candidates = [];
  for (const [position, entity] of roster.entries()) {
    const size = intersectionSize(refs, entity.refs);
    if (size > 0) candidates.push({ id: entity.id, size, position });
  }
  candidates.sort((left, right) => right.size - left.size || left.position - right.position);
  return candidates;
}

/**
 * Report one record's binding outcome: every CONTESTED destination id, and every candidate the
 * winner merely beat.
 *
 * A contested id is reported against BOTH owners - the record that claimed it and the record that
 * wanted it - because a contention naming only one of them tells a GM that something collided
 * without telling them what with, and the whole point of the entry is that the second record has
 * had to take a different id (or mint one) rather than silently disappear.
 *
 * @param {object[]|null} report
 * @param {object} component The record being bound.
 * @param {Map<string, object>} claimed
 * @param {Array<{id: string}>} contested
 * @param {Array<{id: string}>} beaten
 */
function reportBinding(report, component, claimed, contested, beaten) {
  if (!Array.isArray(report)) return;
  const push = (owner, referenceValue) => {
    report.push(
      reportEntry(REFERENCE_KINDS.WORLD_ENTITY_COLLISION, 'component', owner, referenceValue)
    );
  };
  for (const candidate of contested) {
    push(claimed.get(candidate.id), candidate.id);
    push(component, candidate.id);
  }
  for (const candidate of beaten) {
    if (!claimed.has(candidate.id)) push(component, candidate.id);
  }
}

/**
 * TARGET 5 - drop every MATCHED entity's incoming roster record and re-key the rest.
 *
 * Without this a matched entity arrives still carrying its pre-import id and merges into a
 * destination-wins, id-keyed roster as a NEW world entity: a second world record for an Item the
 * destination already has, and every membership record rewritten by target 4 then names a world
 * entity absent from the merged roster.
 *
 * @param {object} prepared
 * @param {ReadonlySet<string>} matched
 * @param {Record<string, string>} idMap
 */
function dropMatchedWorldEntities(prepared, matched, idMap) {
  const slice = prepared[WORLD_SCOPE_SLICE_KEYS.components];
  if (!slice || typeof slice !== 'object' || !Array.isArray(slice.entities)) return;
  const kept = [];
  for (const entity of slice.entities) {
    if (!entity || typeof entity !== 'object') continue;
    if (matched.has(entity.id)) continue;
    if (idMap[entity.id]) entity.id = idMap[entity.id];
    kept.push(entity);
  }
  slice.entities = kept;
}

/**
 * TARGETS 2, 3 and 4 - rewrite every component reference inside the three envelope slices, and
 * every `defaults` record's own `id` and `membership` record's own `entityId`.
 *
 * The shipped migration drives `rewriteMembershipReferences` over `membership` ONLY. A `defaults`
 * record has the SAME section shape, so the same function applies unchanged - and it must, because
 * a world default carries component references exactly as a membership record does. Its components
 * branch is a deliberate no-op (`category` holds no component reference) and its tools branch
 * deliberately WITHHOLDS `componentId`, because neither record class carries one.
 *
 * Only the COMPONENT scope's own identifiers move: essence and tool ids are never re-keyed.
 *
 * @param {object} prepared
 * @param {{remapComponent: Function}} remappers
 * @param {(value: unknown) => unknown} remapId
 */
function rewriteScopeSliceReferences(prepared, remappers, remapId) {
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    const slice = prepared[WORLD_SCOPE_SLICE_KEYS[entityType]];
    if (!slice || typeof slice !== 'object') continue;
    for (const record of arrayOf(slice.defaults)) {
      rewriteMembershipReferences(record, entityType, remappers);
      if (entityType === 'components' && record && typeof record === 'object') {
        record.id = remapId(record.id);
      }
    }
    for (const record of arrayOf(slice.membership)) {
      rewriteMembershipReferences(record, entityType, remappers);
      if (entityType === 'components' && record && typeof record === 'object') {
        record.entityId = remapId(record.entityId);
      }
    }
  }
}

/**
 * Copy-mode: regenerate every recipe id and atomically remap every within-payload
 * recipe-book membership reference (`recipeItemDefinitions[].recipeIds` entries) to
 * the regenerated id (issue #701). Without this, copy-mode strips recipe ids (the
 * downstream `Recipe` constructor mints fresh ones) but the book membership arrays
 * still point at the pre-import ids, so every book in the copy renders empty and a
 * faithful copy import reports every membership entry as a broken `RECIPE_ITEM`
 * reference.
 *
 * The rewrite is KEY-AWARE and class-scoped: only `recipeIds[]` membership
 * positions are rewritten. A membership entry naming a recipe id ABSENT from the
 * payload (genuinely broken in the source) is preserved verbatim so it still
 * resolves-and-reports downstream. Mirrors {@link rebindCopyComponentIds}; the
 * component-id remap still must not touch `recipeIds[]` (the protection is per id
 * class, not absolute).
 *
 * @param {{ system: object, recipes: object[] }} prepared
 * @param {{ generateId?: () => string }} [deps]
 * @returns {object} the same `prepared` reference, mutated
 */
export function rebindCopyRecipeIds(prepared, { generateId = localId } = {}) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const { system, recipes } = prepared;

  // --- Old → new recipe-id map (built over recipes[].id only) ---
  const idMap = new Map();
  for (const recipe of arrayOf(recipes)) {
    if (recipe && typeof recipe === 'object' && recipe.id) {
      idMap.set(recipe.id, generateId());
    }
  }
  if (idMap.size === 0) return prepared;

  // Rewrite the recipe ids themselves.
  for (const recipe of arrayOf(recipes)) {
    if (recipe && typeof recipe === 'object' && recipe.id && idMap.has(recipe.id)) {
      recipe.id = idMap.get(recipe.id);
    }
  }

  // Remap book membership; a membership id absent from the map is left verbatim.
  for (const def of arrayOf(system?.recipeItemDefinitions)) {
    if (def && Array.isArray(def.recipeIds)) {
      def.recipeIds = def.recipeIds.map((rid) => idMap.get(rid) ?? rid);
    }
  }

  return prepared;
}

/**
 * Resolve and classify every reference in the payload. Returns a deep clone with
 * remapped external values applied, plus the structured `unresolvedReferences[]`
 * collection.
 *
 * @param {{ system?: object, recipes?: object[], gatheringEnvironments?: object[], gatheringConfig?: object, travelConfig?: object }} payload
 * @param {{ resolveUuid?: (uuid: string) => Promise<null | { uuid: string }> }} [deps]
 * @returns {Promise<{ resolved: object, unresolvedReferences: object[] }>}
 */
export async function resolveImportReferences(payload, { resolveUuid = null } = {}) {
  const resolved = structuredClone(payload || {});
  const unresolvedReferences = [];

  // Internal (broken-reference) integrity checks are synchronous.
  collectBrokenInternalReferences(resolved, unresolvedReferences);

  // External existence checks require an injected resolver; without one we keep
  // everything verbatim and skip reporting (the caller decides).
  if (typeof resolveUuid === 'function') {
    const descriptors = collectExternalDescriptors(resolved);
    for (const descriptor of descriptors) {
      const value = descriptor.referenceValue;
      if (!value) continue;
      let outcome;
      try {
        outcome = await resolveUuid(value);
      } catch {
        // A malformed UUID throws; treat as absent (reported).
        outcome = null;
      }
      if (!outcome) {
        unresolvedReferences.push(entry(descriptor, 'reported'));
      } else if (outcome.uuid && outcome.uuid !== value) {
        descriptor.set(outcome.uuid);
        unresolvedReferences.push({ ...entry(descriptor, 'remapped'), newValue: outcome.uuid });
      } else {
        unresolvedReferences.push(entry(descriptor, 'retained'));
      }
    }
  }

  return { resolved, unresolvedReferences };
}

function entry(descriptor, disposition) {
  return {
    kind: descriptor.kind,
    ownerType: descriptor.ownerType,
    ownerId: descriptor.ownerId ?? null,
    ownerName: descriptor.ownerName ?? '',
    referenceValue: descriptor.referenceValue,
    disposition,
  };
}

/**
 * @param {object} payload
 * @returns {Array<{ kind, ownerType, ownerId, ownerName, referenceValue, set: (v: string) => void }>}
 */
function collectExternalDescriptors(payload) {
  const descriptors = [];
  const system = payload.system || {};

  // Environment scene gate.
  for (const env of arrayOf(payload.gatheringEnvironments)) {
    if (env?.sceneUuid) {
      descriptors.push({
        kind: REFERENCE_KINDS.SCENE,
        ownerType: 'environment',
        ownerId: env.id ?? null,
        ownerName: env.name ?? '',
        referenceValue: env.sceneUuid,
        set: (v) => {
          env.sceneUuid = v;
        },
      });
    }
  }

  // Realm scene mappings (scene + scene-region). Realms ride the ENVELOPE since issue 1282,
  // so they are read from the world travel config rather than off the system.
  for (const realm of arrayOf(payload.travelConfig?.realms)) {
    for (const mapping of arrayOf(realm?.sceneMappings)) {
      if (mapping?.sceneUuid) {
        descriptors.push({
          kind: REFERENCE_KINDS.SCENE,
          ownerType: 'realm',
          ownerId: realm.id ?? null,
          ownerName: realm.name ?? '',
          referenceValue: mapping.sceneUuid,
          set: (v) => {
            mapping.sceneUuid = v;
          },
        });
      }
      if (mapping?.sceneRegionUuid) {
        descriptors.push({
          kind: REFERENCE_KINDS.SCENE_REGION,
          ownerType: 'realm',
          ownerId: realm.id ?? null,
          ownerName: realm.name ?? '',
          referenceValue: mapping.sceneRegionUuid,
          set: (v) => {
            mapping.sceneRegionUuid = v;
          },
        });
      }
    }
  }

  // Drop-row item UUIDs across reusable tasks and events.
  const slice = systemSlice(payload.gatheringConfig);
  for (const record of [...arrayOf(slice.tasks), ...arrayOf(slice.events)]) {
    for (const row of arrayOf(record?.dropRows)) {
      if (row?.itemUuid) {
        descriptors.push({
          kind: REFERENCE_KINDS.DROP_ROW_ITEM,
          ownerType: 'dropRow',
          ownerId: record.id ?? null,
          ownerName: record.name ?? '',
          referenceValue: row.itemUuid,
          set: (v) => {
            row.itemUuid = v;
          },
        });
      }
    }
  }

  // Macro UUIDs anywhere on the surviving config/recipes.
  collectMacroDescriptors(payload.recipes, 'recipe', descriptors);
  collectMacroDescriptors(slice.tasks, 'task', descriptors);
  collectMacroDescriptors(slice.events, 'event', descriptors);
  // Essence property macros (issue 1036) live on a DIFFERENTLY NAMED field, so the
  // collector takes the field name rather than being forked. The import report already
  // carries the `essence` owner type (it is used for `componentLink`), so no new
  // owner-type label is needed.
  collectMacroDescriptors(system.essenceDefinitions, 'essence', descriptors, 'propertyMacroUuid');
  collectComplicationMacroDescriptors(system.components, descriptors);

  return descriptors;
}

/**
 * Component complication macros (issue 1286). `collectMacroDescriptors` reads
 * `record[field]` ONE level deep and so cannot reach a nested list; this walk is dedicated
 * rather than a flattened call for a REPORTING reason as much as a structural one. A
 * flattened call would take `ownerId`/`ownerName` from the complication, so the import
 * report would name the complication — which the GM cannot open — instead of the component
 * that carries it. `ownerType: 'component'` already has a localized label, so no new one is
 * needed.
 *
 * Unregistered, the uuid is never remapped and the complication runs the WRONG macro in the
 * importing world.
 *
 * @param {unknown} components
 * @param {object[]} descriptors
 */
function collectComplicationMacroDescriptors(components, descriptors) {
  for (const component of arrayOf(components)) {
    for (const complication of arrayOf(component?.complications)) {
      if (typeof complication?.macroUuid !== 'string' || !complication.macroUuid) continue;
      descriptors.push({
        kind: REFERENCE_KINDS.MACRO,
        ownerType: 'component',
        ownerId: component.id ?? null,
        ownerName: component.name ?? '',
        referenceValue: complication.macroUuid,
        set: (v) => {
          complication.macroUuid = v;
        },
      });
    }
  }
}

function collectMacroDescriptors(records, ownerType, descriptors, field = 'macroUuid') {
  for (const record of arrayOf(records)) {
    if (
      record &&
      typeof record === 'object' &&
      typeof record[field] === 'string' &&
      record[field]
    ) {
      descriptors.push({
        kind: REFERENCE_KINDS.MACRO,
        ownerType,
        ownerId: record.id ?? null,
        ownerName: record.name ?? '',
        referenceValue: record[field],
        set: (v) => {
          record[field] = v;
        },
      });
    }
  }
}

/**
 * Report internal references that resolve to nothing within the payload.
 * @param {object} payload
 * @param {object[]} out
 */
function collectBrokenInternalReferences(payload, out) {
  const system = payload.system || {};
  const componentIds = idSet(system.components);
  const recipeItemIds = idSet(system.recipeItemDefinitions);
  const slice = systemSlice(payload.gatheringConfig);
  const taskIds = idSet(slice.tasks);
  const eventIds = idSet(slice.events);

  const push = (kind, ownerType, owner, referenceValue) => {
    out.push({
      kind,
      ownerType,
      ownerId: owner?.id ?? null,
      ownerName: owner?.name ?? '',
      referenceValue,
      disposition: 'reported',
    });
  };

  // Environment → task / event id linkage.
  for (const env of arrayOf(payload.gatheringEnvironments)) {
    if (!env || typeof env !== 'object') continue;
    for (const id of taskLinkIds(env)) {
      if (!taskIds.has(id)) push(REFERENCE_KINDS.TASK_LINK, 'environment', env, id);
    }
    for (const id of eventLinkIds(env)) {
      if (!eventIds.has(id)) push(REFERENCE_KINDS.EVENT_LINK, 'environment', env, id);
    }
  }

  // Drop-row componentId (only when no itemUuid) + tool componentId.
  for (const record of [...arrayOf(slice.tasks), ...arrayOf(slice.events)]) {
    for (const row of arrayOf(record?.dropRows)) {
      if (row?.componentId && !row?.itemUuid && !componentIds.has(row.componentId)) {
        push(REFERENCE_KINDS.COMPONENT_LINK, 'dropRow', record, row.componentId);
      }
    }
  }

  // Tool componentId + onBreak.replacementComponentId, across BOTH the crafting-system
  // tools (`system.tools`) and the gathering-library tools (`gatheringConfig.system.tools`)
  // — issue 570 D2 (the collector previously walked only the gathering slice's tools).
  const reportToolComponentRefs = (tool) => {
    if (!tool || typeof tool !== 'object') return;
    if (tool.componentId && !componentIds.has(tool.componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'tool', tool, tool.componentId);
    }
    const replacementComponentId = tool.onBreak?.replacementComponentId;
    if (replacementComponentId && !componentIds.has(replacementComponentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'tool', tool, replacementComponentId);
    }
  };
  for (const tool of arrayOf(system.tools)) reportToolComponentRefs(tool);
  for (const tool of arrayOf(slice.tools)) reportToolComponentRefs(tool);

  // Recipe ingredient-option / result / catalyst component refs (issue 570 D2),
  // including the recursive `alternatives[]` and the flat `ingredients`/`results`
  // aliases, at both top level and per step.
  // `ownerType` travels with the owner because these walkers are shared by TWO owner
  // classes: a recipe's ingredient/result/catalyst refs, and a COMPONENT's salvage
  // result/catalyst refs. Hard-coding 'recipe' here (as it was before issue 877) made
  // the report label a salvage row "Recipe: Iron Ore" for a component owner, and left
  // the `OwnerType.component` label unreachable from this collector.
  const reportIngredientRef = (ref, owner, ownerType) => {
    if (!ref || typeof ref !== 'object') return;
    const componentId =
      (ref.match && typeof ref.match === 'object'
        ? ref.match.componentId || ref.match.systemItemId
        : null) ||
      ref.componentId ||
      ref.systemItemId ||
      null;
    if (componentId && !componentIds.has(componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, ownerType, owner, componentId);
    }
    for (const alt of arrayOf(ref.alternatives)) reportIngredientRef(alt, owner, ownerType);
  };
  const reportResultRef = (result, owner, ownerType) => {
    const componentId = result?.componentId || result?.systemItemId || null;
    if (componentId && !componentIds.has(componentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, ownerType, owner, componentId);
    }
  };
  const reportResultGroups = (resultGroups, owner, ownerType) => {
    for (const group of arrayOf(resultGroups)) {
      for (const result of arrayOf(group?.results)) reportResultRef(result, owner, ownerType);
    }
  };
  const reportIngredientSet = (set, owner, ownerType) => {
    if (!set || typeof set !== 'object') return;
    for (const group of arrayOf(set.ingredientGroups)) {
      for (const option of arrayOf(group?.options)) reportIngredientRef(option, owner, ownerType);
    }
    for (const ingredient of arrayOf(set.ingredients))
      reportIngredientRef(ingredient, owner, ownerType);
    for (const catalyst of arrayOf(set.catalysts)) reportIngredientRef(catalyst, owner, ownerType);
  };
  for (const recipe of arrayOf(payload.recipes)) {
    if (!recipe || typeof recipe !== 'object') continue;
    for (const set of arrayOf(recipe.ingredientSets)) reportIngredientSet(set, recipe, 'recipe');
    reportResultGroups(recipe.resultGroups, recipe, 'recipe');
    for (const result of arrayOf(recipe.results)) reportResultRef(result, recipe, 'recipe');
    for (const catalyst of arrayOf(recipe.catalysts))
      reportIngredientRef(catalyst, recipe, 'recipe');
    for (const step of arrayOf(recipe.steps)) {
      if (!step || typeof step !== 'object') continue;
      for (const set of arrayOf(step.ingredientSets)) reportIngredientSet(set, recipe, 'recipe');
      reportResultGroups(step.resultGroups, recipe, 'recipe');
      for (const catalyst of arrayOf(step.catalysts))
        reportIngredientRef(catalyst, recipe, 'recipe');
    }
  }

  // Component salvage result refs + legacy salvage catalysts (issue 570 D2). The owner
  // here is a COMPONENT, so the report says "Component: <name>" (issue 877).
  for (const component of arrayOf(system.components)) {
    const salvage = component?.salvage;
    if (!salvage || typeof salvage !== 'object') continue;
    reportResultGroups(salvage.resultGroups, component, 'component');
    for (const catalyst of arrayOf(salvage.catalysts))
      reportIngredientRef(catalyst, component, 'component');
  }

  // Essence sourceComponentId → components (fall back to the legacy
  // associatedSystemItemId alias).
  for (const def of arrayOf(system.essenceDefinitions)) {
    const sourceComponentId = def?.sourceComponentId ?? def?.associatedSystemItemId;
    if (sourceComponentId && !componentIds.has(sourceComponentId)) {
      push(REFERENCE_KINDS.COMPONENT_LINK, 'essence', def, sourceComponentId);
    }
  }

  // Recipe recipeItemId → recipeItemDefinitions (legacy reverse ref; absent once a
  // world is migrated to book-side membership).
  for (const recipe of arrayOf(payload.recipes)) {
    if (recipe?.recipeItemId && !recipeItemIds.has(recipe.recipeItemId)) {
      push(REFERENCE_KINDS.RECIPE_ITEM, 'recipe', recipe, recipe.recipeItemId);
    }
  }

  // Book membership: each definition's recipeIds → recipes (issue 511 many-to-many).
  const recipeIds = idSet(payload.recipes);
  for (const def of arrayOf(system.recipeItemDefinitions)) {
    for (const rid of arrayOf(def?.recipeIds)) {
      if (rid && !recipeIds.has(rid)) {
        push(REFERENCE_KINDS.RECIPE_ITEM, 'recipeItem', def, rid);
      }
    }
  }
}

function taskLinkIds(env) {
  const ids = new Set();
  for (const key of ['enabledTaskIds', 'disabledTaskIds', 'forcedTaskIds', 'taskOrder']) {
    for (const id of arrayOf(env[key])) ids.add(id);
  }
  for (const id of Object.keys(env.taskDropRateAdjustments || {})) ids.add(id);
  return ids;
}

function eventLinkIds(env) {
  const ids = new Set();
  for (const key of ['enabledEventIds', 'disabledEventIds', 'forcedEventIds', 'eventOrder']) {
    for (const id of arrayOf(env[key])) ids.add(id);
  }
  for (const id of Object.keys(env.eventDropRateAdjustments || {})) ids.add(id);
  return ids;
}

function systemSlice(gatheringConfig) {
  if (!gatheringConfig || typeof gatheringConfig !== 'object') return {};
  // Export shape: { system: <slice>, shared: {...} }.
  if (gatheringConfig.system && typeof gatheringConfig.system === 'object') {
    return gatheringConfig.system;
  }
  return {};
}

function idSet(records) {
  const set = new Set();
  for (const record of arrayOf(records)) {
    if (record?.id) set.add(record.id);
  }
  return set;
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}
