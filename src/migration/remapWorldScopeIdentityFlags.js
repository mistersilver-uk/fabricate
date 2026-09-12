/**
 * @module remapWorldScopeIdentityFlags
 *
 * Issue 1363 (epic 1357, PR 3): the one-shot, active-GM pass that remaps every DURABLE IDENTITY
 * FLAG the `1.30.0` world-scope re-key invalidates, driven by the persisted
 * `fabricate.worldScopeRekeyMap`.
 *
 * ## Why the shipped restamp cannot serve
 *
 * `restampOwnedItemComponentIdentity`'s planner returns EARLY for any item that already carries a
 * durable identity flag — which is PRECISELY the population whose flag is now stale. It is a
 * name-only backfill and cannot be reused. `MigrationRunner` cannot do it either: it reads and
 * writes only settings payloads and has no Actor or Item handle.
 *
 * ## The complete site list, or the reason for exclusion
 *
 * - **`roles[<systemId>].componentId` and `roles[<systemId>].toolId`** on owned actor Items,
 *   remapped from that system's leg of the map.
 * - **The legacy flat scalar `flags.fabricate.fabricate.componentId`**, which is SYSTEM-LESS,
 *   while the same old id in two systems can name two different components. The rule is narrow
 *   and decidable: remap it IFF the old value is a key in exactly ONE system's component map
 *   across the whole corpus, or in several that all agree on the image; otherwise leave it. That
 *   is behaviour-preserving rather than lossy — a stale scalar makes tiers 1-2 miss and
 *   resolution falls through to the UNCHANGED source-reference tier, and
 *   `itemHasComponentIdentityFlag` goes on returning `true`, so the issue-538 cross-system
 *   name-fallback suppression is unchanged too.
 * - **`flags.fabricate.fabricate.craftingRuns` and `.salvageRuns`, and
 *   `flags.fabricate.gatheringRuns` AT ITS SINGLE-SCOPE DEPTH.** The two depths differ and a pass
 *   that assumes one silently misses the other.
 * - **`flags.fabricate.fabricate.alchemyDeadEnds`**, whose keys are ORDER-SENSITIVE:
 *   `canonicalSignatureKey` builds each key from component ids SORTED LEXICALLY and joined
 *   `` `${componentId}:${count}` `` with `|`, so a re-key changes the sort order and textual
 *   substitution yields a key that never matches. The remap PARSES, remaps, RE-SORTS and re-joins
 *   through that same shared helper. It is player-visible wherever `showAttemptHistoryToPlayers`
 *   is true: every discovered dead end would silently stop being recognised.
 * - **`flags.fabricate.fabricate.learnedRecipes` is EXCLUDED**: it holds recipe ids, and recipe
 *   ids are never re-keyed.
 *
 * ## The dotted-`systemId` guard
 *
 * `setFabricateFlag` writes a role leaf through `document.update({[path]: value})`, which Foundry
 * expands on every dot, so a dotted `systemId` nests one level deeper than any reader indexing
 * `roles[systemId]`. Every shipped writer guards it with `isSafeFlagKeySegment`; so does this
 * pass, which SKIPS an unsafe segment and counts it in the report.
 *
 * The `alchemyDeadEnds` `systemId` is a VALUE-side object key rather than a dotted update-path
 * segment, so the guard does not apply to it.
 *
 * ## No key is ever REMOVED by this pass
 *
 * `setFabricateFlag` writes through `Document#update`, whose recursive merge never removes keys
 * deleted from a nested object — the trap that makes a cleared run field resurrect. This pass
 * only ever CHANGES leaf values inside structures whose key sets it leaves alone (run ids are
 * not re-keyed; `alchemyDeadEnds` values are arrays, which the merge replaces wholesale), so the
 * merge cannot resurrect anything. That property is what makes a plain merge write correct here.
 *
 * IT IS A PROPERTY OF THIS HALF ALONE. The `1.34.0` essence half at the foot of this file re-keys
 * object KEYS rather than leaf values, so it breaks the precondition exactly and writes through a
 * FORCED REPLACEMENT instead. Its own section note states why.
 *
 * Between the settings write and this pass, resolution degrades to the SOURCE-REFERENCE tier,
 * which this change does not touch. A source Item in a LOCKED pack is skipped and stays in that
 * tier permanently — accepted, stated, and counted in the report.
 */

import { FABRICATE_FLAG_NAMESPACE, isSafeFlagKeySegment } from '../config/flags.js';
import { canonicalSignatureKey } from '../utils/alchemySignatureKey.js';

import { compareSemver } from './MigrationRunner.js';

/**
 * The migration version that PRODUCES the re-key map this pass consumes.
 *
 * @type {string}
 */
export const WORLD_SCOPE_MIGRATION_VERSION = '1.30.0';

/**
 * Whether the remap finished CLEANLY, i.e. wrote everything it planned to.
 *
 * IT IS A SECOND, INDEPENDENT WITHHOLD, and it exists because the first one cannot see this
 * failure at all. `mayClearWorldScopeRekeyMap` asks whether the PRODUCING migration completed;
 * this asks whether the CONSUMING pass did. A transient rejection writing one actor's run
 * container is counted in `skippedErrors` and nothing else notices it: the pass returns normally,
 * the migration completed, so the map would be destroyed with that actor still naming retired
 * ids - and the startup prune, no longer withheld because the map is gone, deletes the run on the
 * next boot.
 *
 * `lockedSkips` is deliberately NOT part of this predicate. A locked compendium is a STANDING
 * state a re-run cannot improve, so withholding on it would retain the map forever; it is
 * reported to the GM instead. `skippedErrors` is a TRANSIENT failure a re-run genuinely can fix,
 * which is the whole distinction.
 *
 * @param {object|null} summary The pass summary, or `null` when the pass did not run.
 * @returns {boolean}
 */
export function remapCompletedCleanly(summary) {
  if (!summary || typeof summary !== 'object') return true;
  return Number(summary.skippedErrors) === 0;
}

/**
 * Whether this pass may DESTROY the re-key map — i.e. whether the producing migration has
 * COMPLETED on this world.
 *
 * IT IS A SEPARATE GATE FROM THE ONE THAT DECIDES WHETHER THE PASS RUNS, and the separation is
 * what keeps a torn migration recoverable. `_runMigrations()`'s DEFERRED branch returns NORMALLY,
 * so this pass runs on the SAME BOOT as a torn migration: the three scope legs land before
 * `craftingSystems`, so a corpus-seededness predicate is already true while `gatheringConfig`
 * still holds the OLD ids that only the map can repair.
 *
 * **`compareSemver`, NEVER A BARE JS `>=`.** `migrationVersion` is a STRING setting, so
 * `migrationVersion >= '1.30.0'` is a LEXICOGRAPHIC compare and is TRUE for `'1.4.0'` through
 * `'1.9.0'` — all six are registered migration versions, and they are the worlds running the
 * longest multi-migration pass, i.e. the most tear-prone population there is. The gate would be
 * defeated exactly where it is needed. `foundry.utils.isNewerVersion` IS part-wise numeric on
 * v14 and would be correct, but it is strictly-greater, so the `>=` form is the easily-inverted
 * `!isNewerVersion('1.30.0', migrationVersion)`.
 *
 * @param {unknown} migrationVersion The stored `fabricate.migrationVersion`.
 * @returns {boolean}
 */
export function mayClearWorldScopeRekeyMap(migrationVersion) {
  return compareSemver(migrationVersion ?? '0.0.0', WORLD_SCOPE_MIGRATION_VERSION) >= 0;
}

/** The two role leaves a re-key invalidates, and the map leg each is remapped from. */
const ROLE_LEAVES = Object.freeze([
  { roleKey: 'componentId', leg: 'components' },
  { roleKey: 'toolId', leg: 'tools' },
]);

/** The two DOUBLY-nested run containers, written through `setFabricateFlag`. */
const NESTED_RUN_CONTAINERS = Object.freeze(['craftingRuns', 'salvageRuns']);

/** The SINGLE-scope run container, written with a bare `setFlag`. */
const BARE_RUN_CONTAINER = 'gatheringRuns';

/** Leaf keys inside a run record that name a component. */
const COMPONENT_LEAF_KEYS = Object.freeze(['componentId', 'systemItemId']);

/** Leaf keys inside a run record that name a tool. */
const TOOL_LEAF_KEYS = Object.freeze(['toolId']);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * A `(oldId) => newId` lookup over one leg of one system's map.
 *
 * @param {object|undefined} leg
 * @returns {(value: unknown) => unknown}
 */
function legLookup(leg) {
  const source = isPlainObject(leg) ? leg : {};
  return (value) =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(source, value)
      ? source[value]
      : value;
}

/**
 * The component ids that are UNAMBIGUOUS across the whole corpus: an old id every system that
 * re-keys it maps to the SAME new id. This is the tie-break the system-less legacy flat scalar
 * is remapped under; anything else is left untouched.
 *
 * @param {object} rekeyMap
 * @returns {Map<string, string>}
 */
export function unambiguousComponentRemap(rekeyMap) {
  const candidates = new Map();
  const ambiguous = new Set();
  for (const perSystem of Object.values(isPlainObject(rekeyMap) ? rekeyMap : {})) {
    for (const [oldId, newId] of Object.entries(perSystem?.components ?? {})) {
      if (candidates.has(oldId) && candidates.get(oldId) !== newId) ambiguous.add(oldId);
      else candidates.set(oldId, newId);
    }
  }
  for (const oldId of ambiguous) candidates.delete(oldId);
  return candidates;
}

/**
 * Remap every component and tool reference inside ONE run record, in place.
 *
 * KEY-AWARE AND SYSTEM-SCOPED: the record's own `craftingSystemId` selects the map, because the
 * same old id in two systems can name two different components. A record with no system id is
 * left alone rather than remapped under a guess.
 *
 * @param {unknown} run
 * @param {object} rekeyMap
 * @returns {boolean} whether anything changed.
 */
function remapRunRecord(run, rekeyMap) {
  if (!isPlainObject(run)) return false;
  const systemId = typeof run.craftingSystemId === 'string' ? run.craftingSystemId : null;
  const perSystem = systemId ? rekeyMap[systemId] : null;
  if (!perSystem) return false;
  const remapComponent = legLookup(perSystem.components);
  const remapTool = legLookup(perSystem.tools);
  let changed = false;
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        const next = COMPONENT_LEAF_KEYS.includes(key)
          ? remapComponent(value)
          : TOOL_LEAF_KEYS.includes(key)
            ? remapTool(value)
            : value;
        if (next !== value) {
          node[key] = next;
          changed = true;
        }
        continue;
      }
      if (key === 'toolIds' && Array.isArray(value)) {
        const next = value.map((id) => remapTool(id));
        if (JSON.stringify(next) !== JSON.stringify(value)) {
          node[key] = next;
          changed = true;
        }
        continue;
      }
      walk(value);
    }
  };
  walk(run);
  return changed;
}

/**
 * Remap a whole run container (`{ active: {...}, history: [...] }`), in place.
 *
 * @param {unknown} container
 * @param {object} rekeyMap
 * @returns {boolean} whether anything changed.
 */
export function remapRunContainer(container, rekeyMap) {
  if (!isPlainObject(container)) return false;
  let changed = false;
  for (const run of Object.values(isPlainObject(container.active) ? container.active : {})) {
    if (remapRunRecord(run, rekeyMap)) changed = true;
  }
  for (const run of arrayOf(container.history)) {
    if (remapRunRecord(run, rekeyMap)) changed = true;
  }
  return changed;
}

/**
 * Remap the per-system alchemy dead-end SIGNATURE KEYS.
 *
 * PARSE, REMAP, RE-SORT, RE-JOIN — never textual substitution. Each key is
 * `componentId:count|...` sorted lexically by component id, so a re-key changes the sort order
 * and a substituted key would never match again.
 *
 * @param {unknown} deadEnds `{ [systemId]: [signatureKey, ...] }`
 * @param {object} rekeyMap
 * @returns {{value: object, changed: boolean}}
 */
export function remapAlchemyDeadEnds(deadEnds, rekeyMap) {
  if (!isPlainObject(deadEnds)) return { value: deadEnds, changed: false };
  const next = {};
  let changed = false;
  for (const [systemId, keys] of Object.entries(deadEnds)) {
    // DE-DUPLICATED, because a merge can collapse two distinct signatures onto one key: two dead
    // ends that differed only in which of two now-merged components they used are the SAME dead
    // end afterwards. The reader uses `includes`, so a duplicate is harmless to correctness — but
    // this is a persisted actor flag that only ever grows, and the writer already refuses to
    // append a key it already holds.
    // The `systemId` here is a VALUE-side object key, never a dotted update-path segment, so
    // `isSafeFlagKeySegment` deliberately does not apply.
    const remapComponent = legLookup(rekeyMap[systemId]?.components);
    next[systemId] = arrayOf(keys).map((signature) => {
      if (typeof signature !== 'string' || signature === '') return signature;
      const multiset = {};
      for (const entry of signature.split('|')) {
        const separator = entry.lastIndexOf(':');
        if (separator <= 0) return signature;
        const componentId = entry.slice(0, separator);
        const count = Number(entry.slice(separator + 1));
        if (!Number.isFinite(count)) return signature;
        const mapped = String(remapComponent(componentId));
        multiset[mapped] = (multiset[mapped] ?? 0) + count;
      }
      const rebuilt = canonicalSignatureKey(multiset);
      if (rebuilt !== signature) changed = true;
      return rebuilt;
    });
    const deduped = [...new Set(next[systemId])];
    if (deduped.length !== next[systemId].length) changed = true;
    next[systemId] = deduped;
  }
  return { value: changed ? next : deadEnds, changed };
}

/**
 * Plan the durable-identity writes ONE owned Item needs.
 *
 * @param {object|null} item An owned actor Item (reads `getFlag`).
 * @param {object} rekeyMap The persisted re-key map.
 * @param {Map<string, string>} unambiguous The corpus-wide unambiguous component remap.
 * @param {(document: object, key: string, fallback?: unknown) => unknown} readFlag
 * @returns {{writes: Array<{flagKey: string, value: string}>, unsafeSystemIds: string[]}}
 */
export function planItemIdentityFlagRemap(item, rekeyMap, unambiguous, readFlag) {
  const writes = [];
  const unsafeSystemIds = [];
  if (!item || typeof item !== 'object') return { writes, unsafeSystemIds };
  const roles = readFlag(item, 'roles', null);
  if (isPlainObject(roles)) {
    for (const [systemId, perSystem] of Object.entries(roles)) {
      if (!isPlainObject(perSystem)) continue;
      const legs = rekeyMap[systemId];
      if (!legs) continue;
      // THE DOTTED-`systemId` GUARD. An unsafe segment can never have been written as a
      // `roles` map key by any shipped writer, and writing one here would mis-nest the flag,
      // so it is SKIPPED and counted.
      if (!isSafeFlagKeySegment(systemId)) {
        unsafeSystemIds.push(systemId);
        continue;
      }
      for (const { roleKey, leg } of ROLE_LEAVES) {
        const current = perSystem[roleKey];
        const next = legLookup(legs[leg])(current);
        if (typeof next === 'string' && next !== current) {
          writes.push({ flagKey: `roles.${systemId}.${roleKey}`, value: next });
        }
      }
    }
  }
  // The legacy flat scalar, under its narrow whole-corpus tie-break.
  const legacyScalar = readFlag(item, 'componentId', null);
  if (typeof legacyScalar === 'string' && unambiguous.has(legacyScalar)) {
    writes.push({ flagKey: 'componentId', value: unambiguous.get(legacyScalar) });
  }
  return { writes, unsafeSystemIds };
}

/** The actors to walk as a plain array, tolerant of a Foundry `WorldCollection` or an iterable. */
function toActorList(actors) {
  if (Array.isArray(actors)) return actors;
  if (actors && typeof actors[Symbol.iterator] === 'function') return [...actors];
  return [];
}

/** The owned items of an actor as a plain array, tolerant of a Foundry `EmbeddedCollection`. */
function actorOwnedItems(actor) {
  const items = actor?.items;
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items[Symbol.iterator] === 'function') return [...items];
  return [];
}

/**
 * Remap every durable identity flag the `1.30.0` re-key invalidated.
 *
 * NO-THROW-PER-DOCUMENT: a planning or write failure on one actor or item is counted and
 * skipped; one bad document can never abort the pass. A LOCKED source Item refuses its write,
 * which surfaces here as a `lockedSkips` count rather than as a failure.
 *
 * @param {object} params
 * @param {Iterable<object>|Array<object>} params.actors
 * @param {object} params.rekeyMap The persisted `fabricate.worldScopeRekeyMap`.
 * @param {(document: object, key: string, fallback?: unknown) => unknown} params.readFlag
 * @param {(document: object, key: string, value: unknown) => Promise<unknown>}
 *   params.writeFabricateFlag Writes the DOUBLY-nested `flags.fabricate.fabricate.<key>`.
 * @param {(document: object, key: string, value: unknown) => Promise<unknown>}
 *   params.writeBareFlag Writes the SINGLE-scope `flags.fabricate.<key>`.
 * @returns {Promise<object>} the pass summary.
 */
export async function remapWorldScopeIdentityFlags({
  actors,
  rekeyMap,
  readFlag,
  writeFabricateFlag,
  writeBareFlag,
} = {}) {
  const summary = {
    scannedActors: 0,
    scannedItems: 0,
    remappedItems: 0,
    remappedLeaves: 0,
    remappedRunContainers: 0,
    remappedAlchemyDeadEnds: 0,
    unsafeSystemIdSkips: [],
    lockedSkips: 0,
    skippedErrors: 0,
  };
  const map = isPlainObject(rekeyMap) ? rekeyMap : {};
  if (
    Object.keys(map).length === 0 ||
    typeof readFlag !== 'function' ||
    typeof writeFabricateFlag !== 'function'
  ) {
    return summary;
  }
  const bareWrite = typeof writeBareFlag === 'function' ? writeBareFlag : writeFabricateFlag;
  const unambiguous = unambiguousComponentRemap(map);
  const unsafe = new Set();

  for (const actor of toActorList(actors)) {
    summary.scannedActors += 1;
    for (const item of actorOwnedItems(actor)) {
      summary.scannedItems += 1;
      let planned;
      try {
        planned = planItemIdentityFlagRemap(item, map, unambiguous, readFlag);
      } catch {
        summary.skippedErrors += 1;
        continue;
      }
      for (const systemId of planned.unsafeSystemIds) unsafe.add(systemId);
      let leaves = 0;
      for (const write of planned.writes) {
        try {
          await writeFabricateFlag(item, write.flagKey, write.value);
          leaves += 1;
        } catch {
          // A refused write is the LOCKED-PACK degradation: the document stays in the
          // source-reference tier permanently, which is stated rather than repaired.
          summary.lockedSkips += 1;
        }
      }
      if (leaves > 0) {
        summary.remappedItems += 1;
        summary.remappedLeaves += leaves;
      }
    }

    for (const key of NESTED_RUN_CONTAINERS) {
      try {
        const container = readFlag(actor, key, null);
        if (!remapRunContainer(container, map)) continue;
        await writeFabricateFlag(actor, key, container);
        summary.remappedRunContainers += 1;
      } catch {
        summary.skippedErrors += 1;
      }
    }
    try {
      // THE OTHER DEPTH. `gatheringRuns` is written with a bare `setFlag`, so it lives at the
      // SINGLE-scope `flags.fabricate.gatheringRuns` and a pass that assumes the doubly-nested
      // depth silently misses it.
      const container = readFlag(actor, BARE_RUN_CONTAINER, null, { bare: true });
      if (remapRunContainer(container, map)) {
        await bareWrite(actor, BARE_RUN_CONTAINER, container);
        summary.remappedRunContainers += 1;
      }
    } catch {
      summary.skippedErrors += 1;
    }

    try {
      const deadEnds = readFlag(actor, 'alchemyDeadEnds', null);
      const remapped = remapAlchemyDeadEnds(deadEnds, map);
      if (remapped.changed) {
        await writeFabricateFlag(actor, 'alchemyDeadEnds', remapped.value);
        summary.remappedAlchemyDeadEnds += 1;
      }
    } catch {
      summary.skippedErrors += 1;
    }
  }

  summary.unsafeSystemIdSkips = [...unsafe];
  return summary;
}

// ---------------------------------------------------------------------------
// The `1.34.0` EQUIVALENT-ESSENCE MERGE half (issue 1654)
//
// A SECOND, INDEPENDENT SITE LIST rather than an extension of the one above, and a second
// decision record: `fabricate.worldEssenceMergeMap` rather than `fabricate.worldScopeRekeyMap`.
// The two passes share this module because they share a corpus walk, a document-level no-throw
// rule and a set of flag depths — and nothing else. See § Equivalent World Essence Merge
// requirement 9 in `openspec/specs/destructive-changes-and-migrations/spec.md`.
//
// ## The site list, or the reason for exclusion
//
// - **`flags.fabricate.fabricate.craftingRuns` and `.salvageRuns`**, at their `resolvedEssences`
//   and `essenceEnabled` maps, wherever those appear inside a run record.
// - **`flags.fabricate.gatheringRuns` AT ITS SINGLE-SCOPE DEPTH**, on the same two keys.
// - **The system-less item override at the DOUBLY-nested `flags.fabricate.fabricate.essences`**,
//   under a whole-corpus unambiguity tie-break, exactly as the legacy flat `componentId` scalar
//   is treated above. `getFabricateFlag(item, 'essences')` normalizes to `fabricate.essences`, so
//   the stored path nests under the `fabricate` scope AGAIN.
// - **`flags.fabricate.fabricate.alchemyDeadEnds` is EXCLUDED**: its signature keys hold COMPONENT
//   ids only. That is a DIFFERENT reason from the one that excludes `learnedRecipes`, which holds
//   recipe ids, and recipe ids are never re-keyed by any pass.
//
// ## WHY THIS HALF CANNOT USE A PLAIN MERGE WRITE
//
// The module note above justifies `setFabricateFlag` on the grounds that "No key is ever REMOVED
// by this pass" — the re-key half only ever changes LEAF VALUES inside structures whose key sets
// it leaves alone. THIS HALF BREAKS THAT PRECONDITION EXACTLY: an essence id is an object KEY, so
// a re-key REMOVES one key and adds another.
//
// `Document#update` merges inner objects recursively (`recursive` defaults true) and
// `foundry.utils.mergeObject` defaults `performDeletions` false, so writing `{'fire-b': 3}` over a
// stored `{'fire-a': 1, 'fire-b': 2}` persists `{'fire-a': 1, 'fire-b': 3}` — the retired key
// SURVIVES. In a CONSUMED `resolvedEssences` snapshot that makes the resumed run transfer 4 units
// where 3 were paid for. That is data corruption, not untidiness.
//
// The write is therefore ONE ATOMIC UPDATE per container using Foundry's FORCED-REPLACEMENT key
// prefix `==` on the LAST path segment (see {@link forcedReplacementFlagPath}). `{recursive:
// false}` is NOT the fix: it replaces the whole `flags` field and destroys every other module's
// flags. The two-step delete-then-write shape `RecipeVisibilityService._rebuildStoreWithoutIds`
// uses is not the fix either, at least not for a run container: it opens a window in which the
// actor has no `craftingRuns` at all, and a crash between the two awaits loses every in-flight
// run.
//
// ## NO STARTUP PRUNE WITHHOLD IS ADDED
//
// `hasPendingWorldEssenceMerge` lives HERE and not in `src/systems/worldScopeRekeyPending.js`.
// That module is import-free because `startupPassComposition.js` consumes it; this predicate has
// no startup consumer, because no pass gated by the `componentIdentityRemap` kind reads an essence
// id and `STARTUP_PASS_ENTITY_KINDS` declares no essence-derived kind at all. A fail-closed gate
// would suppress housekeeping forever in exchange for protecting nothing. The absence is PINNED
// negatively by `tests/world-scope-startup-prune-ordering.test.js`, so a future pass that starts
// reading an essence id fails that test rather than silently needing a withhold nobody adds.
// ---------------------------------------------------------------------------

/**
 * The migration version that PRODUCES the merge map this half consumes.
 *
 * @type {string}
 */
export const WORLD_ESSENCE_MERGE_MIGRATION_VERSION = '1.34.0';

/**
 * The NEVER-CLEARED tombstone leg of `fabricate.worldEssenceMergeMap`, which sits beside the
 * per-system re-key legs in the same setting and is therefore not one of them.
 *
 * @type {string}
 */
export const WORLD_ESSENCE_MERGE_RETIRED_LEG = 'retired';

/** The doubly-nested, system-less item essence override. */
const ITEM_ESSENCE_OVERRIDE_KEY = 'essences';

/**
 * Whether this half may DESTROY the per-system legs of the merge map — i.e. whether the producing
 * `1.34.0` migration has COMPLETED on this world.
 *
 * **`compareSemver`, NEVER A BARE JS `>=`**, for the reason {@link mayClearWorldScopeRekeyMap}
 * states at length: `migrationVersion` is a STRING setting, so `migrationVersion >= '1.34.0'` is a
 * LEXICOGRAPHIC compare and is TRUE for `'1.4.0'` through `'1.9.0'`.
 *
 * The `retired` leg is OUTSIDE this clear and survives it; see
 * {@link WORLD_ESSENCE_MERGE_RETIRED_LEG}.
 *
 * @param {unknown} migrationVersion The stored `fabricate.migrationVersion`.
 * @returns {boolean}
 */
export function mayClearWorldEssenceMergeMap(migrationVersion) {
  return compareSemver(migrationVersion ?? '0.0.0', WORLD_ESSENCE_MERGE_MIGRATION_VERSION) >= 0;
}

/**
 * The per-system re-key legs of the raw merge map, READ BY SHAPE RATHER THAN BY NAME.
 *
 * THE SHAPE TEST IS WHAT KEEPS THE TOMBSTONE OUT. `retired` is a sibling of the system legs in
 * the same setting, and its values are `{name?, icon?, colorToken?, description?, systems: []}` —
 * no `essences` key at all — so requiring a plain-object `essences` leg excludes it structurally
 * rather than by matching one reserved name that a future rename could drift from. The reserved
 * name is skipped too, so a world whose migration wrote an empty `retired: {}` needs no shape
 * luck. A nested `{systems: {...}}` layout is accepted as well, so this reader cannot be the
 * reason a layout choice made by the producing migration becomes irreversible.
 *
 * Self-mapping and empty pairs are dropped, so a map that re-keys nothing reads as no legs.
 *
 * @param {unknown} mergeMap The raw `fabricate.worldEssenceMergeMap` value.
 * @returns {{[systemId: string]: {[loserId: string]: string}}}
 */
export function worldEssenceMergeLegs(mergeMap) {
  if (!isPlainObject(mergeMap)) return {};
  const source = isPlainObject(mergeMap.systems) ? mergeMap.systems : mergeMap;
  const legs = {};
  for (const [systemId, leg] of Object.entries(source)) {
    if (systemId === WORLD_ESSENCE_MERGE_RETIRED_LEG) continue;
    if (!isPlainObject(leg) || !isPlainObject(leg.essences)) continue;
    const pairs = {};
    for (const [loserId, survivorId] of Object.entries(leg.essences)) {
      if (typeof survivorId !== 'string' || survivorId === '' || loserId === '') continue;
      if (loserId === survivorId) continue;
      pairs[loserId] = survivorId;
    }
    if (Object.keys(pairs).length > 0) legs[systemId] = pairs;
  }
  return legs;
}

/**
 * Whether the persisted merge map still holds re-key pairs nothing has consumed.
 *
 * IT TAKES THE VALUE, NOT AN ACCESSOR, and it does NOT fail closed — both deliberately, and both
 * are the difference from `hasPendingWorldScopeRekey`. That predicate fails closed because it
 * gates a DESTRUCTIVE startup prune where skipping a boot costs nothing and a wrong answer deletes
 * data. This one only decides whether a repair pass walks the corpus, and answering "pending" on
 * an unreadable setting would make the pass walk every actor on every boot forever.
 *
 * @param {unknown} mergeMap The raw `fabricate.worldEssenceMergeMap` value.
 * @returns {boolean}
 */
export function hasPendingWorldEssenceMerge(mergeMap) {
  return Object.keys(worldEssenceMergeLegs(mergeMap)).length > 0;
}

/**
 * Split one system's pairs into the groups it is SAFE to apply and the ids that refused.
 *
 * A GROUP IS A SURVIVOR AND EVERY LOSER THAT MAPS TO IT, and an unsafe id refuses the WHOLE
 * group rather than the one pair. Applying half a merge group is worse than applying none of it:
 * some references would move to the survivor and the rest would stay on a loser this pass has
 * decided it cannot name, which is a state no later pass can distinguish from a partial tear.
 *
 * THE GUARD IS NOT THEORETICAL HERE. The map is derived from the RAW settings corpus, so a
 * hand-edited or imported essence id may be any string at all, and an id that is not a safe
 * dotted-path segment (see `FABRICATE_FLAG_KEY_SEGMENT_PATTERN`) cannot be addressed by any
 * flag-path write this pass or a later repair might need.
 *
 * @param {{[loserId: string]: string}} pairs
 * @param {Set<string>} unsafe Collects every refused id, across every system.
 * @returns {{safe: {[loserId: string]: string}, refusedGroups: number}}
 */
function partitionSafeEssencePairs(pairs, unsafe) {
  const bySurvivor = new Map();
  for (const [loserId, survivorId] of Object.entries(pairs)) {
    if (!bySurvivor.has(survivorId)) bySurvivor.set(survivorId, []);
    bySurvivor.get(survivorId).push(loserId);
  }
  const safe = {};
  let refusedGroups = 0;
  for (const [survivorId, loserIds] of bySurvivor) {
    const offending = [survivorId, ...loserIds].filter((id) => !isSafeFlagKeySegment(id));
    if (offending.length > 0) {
      for (const id of offending) unsafe.add(id);
      refusedGroups += 1;
      continue;
    }
    for (const loserId of loserIds) safe[loserId] = survivorId;
  }
  return { safe, refusedGroups };
}

/**
 * The merge map as this pass will actually apply it: safe legs only, with what it refused.
 *
 * @param {unknown} mergeMap The raw `fabricate.worldEssenceMergeMap` value.
 * @returns {{legs: object, unsafeEssenceIds: string[], refusedGroups: number}}
 */
export function readWorldEssenceMergeMap(mergeMap) {
  const unsafe = new Set();
  const legs = {};
  let refusedGroups = 0;
  for (const [systemId, pairs] of Object.entries(worldEssenceMergeLegs(mergeMap))) {
    const partitioned = partitionSafeEssencePairs(pairs, unsafe);
    refusedGroups += partitioned.refusedGroups;
    if (Object.keys(partitioned.safe).length > 0) legs[systemId] = partitioned.safe;
  }
  return { legs, unsafeEssenceIds: [...unsafe], refusedGroups };
}

/**
 * The essence ids that are UNAMBIGUOUS across the whole corpus: a retired id every system that
 * re-keys it maps to the SAME survivor. This is the tie-break the SYSTEM-LESS item override
 * (`flags.fabricate.fabricate.essences`) is remapped under; anything else is left untouched.
 *
 * LEAVING AN AMBIGUOUS KEY IS SAFE ONLY BECAUSE A RETIRED ID IS NEVER REISSUED. A key naming no
 * live essence contributes nothing to `essenceResolver`'s override, so the item degrades to the
 * unchanged resolution it already had. That is exactly what the never-cleared `retired` tombstone
 * protects: reissue the id and the key stops contributing nothing and starts contributing the
 * WRONG essence.
 *
 * @param {unknown} mergeMap The raw `fabricate.worldEssenceMergeMap` value.
 * @returns {Map<string, string>}
 */
export function unambiguousEssenceRemap(mergeMap) {
  const candidates = new Map();
  const ambiguous = new Set();
  for (const pairs of Object.values(readWorldEssenceMergeMap(mergeMap).legs)) {
    for (const [loserId, survivorId] of Object.entries(pairs)) {
      if (candidates.has(loserId) && candidates.get(loserId) !== survivorId) ambiguous.add(loserId);
      else candidates.set(loserId, survivorId);
    }
  }
  for (const loserId of ambiguous) candidates.delete(loserId);
  return candidates;
}

/** Two re-keyed quantities land on one key: the survivor holds the SUM. */
function sumEssenceQuantities(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(a) ? left : right;
  return a + b;
}

/**
 * Two re-keyed enabled-flags land on one key: the survivor takes the logical AND.
 *
 * AND rather than OR, because `essenceEnabled` is a snapshot of a BEHAVIOUR GATE taken at START:
 * if either contributing essence was switched off for that system, the run was not entitled to
 * transfer its effect, and OR would grant an effect the GM had disabled.
 */
function andEssenceEnabledFlags(left, right) {
  return Boolean(left) && Boolean(right);
}

/**
 * The KEY-POSITION containers a run record holds, and how a collision on one key resolves.
 *
 * A `Map` rather than an object literal, so a run record carrying a `constructor` or `__proto__`
 * key cannot reach an inherited member and be mistaken for a container.
 */
const ESSENCE_KEY_POSITION_CONTAINERS = new Map([
  ['resolvedEssences', sumEssenceQuantities],
  ['essenceEnabled', andEssenceEnabledFlags],
]);

/**
 * Re-key ONE essence-keyed map, resolving a collision through `combine`.
 *
 * THE KEYS ARE THE DATA, which is what makes this different from the leaf-value machinery above:
 * `COMPONENT_LEAF_KEYS` rewrites a string VALUE at a known key, while here the essence id IS the
 * key and the rewrite changes the map's KEY SET. That is the whole reason the write side cannot
 * use a merge.
 *
 * Returns the ORIGINAL object when nothing changed, so an unchanged container is never rewritten.
 *
 * @param {unknown} map `{[essenceId]: value}`
 * @param {(value: unknown) => unknown} lookup
 * @param {(left: unknown, right: unknown) => unknown} combine
 * @returns {{value: unknown, changed: boolean}}
 */
export function remapEssenceKeyedMap(map, lookup, combine) {
  if (!isPlainObject(map)) return { value: map, changed: false };
  const next = {};
  let changed = false;
  for (const [essenceId, value] of Object.entries(map)) {
    const mapped = String(lookup(essenceId));
    if (mapped !== essenceId) changed = true;
    next[mapped] = Object.hasOwn(next, mapped) ? combine(next[mapped], value) : value;
  }
  return { value: changed ? next : map, changed };
}

/**
 * Walk one node, re-keying every essence-keyed container found at any depth, IN PLACE.
 *
 * THE DEPTH IS NOT ASSUMED. `resolvedEssences` and `essenceEnabled` are written into a step's
 * `preparedConsumption`, and the three run containers nest their records differently, so a walker
 * that hard-coded one path would silently miss the others exactly as a pass assuming one flag
 * depth misses `gatheringRuns`.
 *
 * @param {unknown} node
 * @param {(value: unknown) => unknown} lookup
 * @returns {boolean} whether anything changed.
 */
function remapEssenceKeysInNode(node, lookup) {
  if (Array.isArray(node)) {
    let changed = false;
    for (const entry of node) {
      if (remapEssenceKeysInNode(entry, lookup)) changed = true;
    }
    return changed;
  }
  if (!isPlainObject(node)) return false;
  let changed = false;
  for (const [key, value] of Object.entries(node)) {
    const combine = ESSENCE_KEY_POSITION_CONTAINERS.get(key);
    if (combine) {
      const remapped = remapEssenceKeyedMap(value, lookup, combine);
      if (remapped.changed) {
        node[key] = remapped.value;
        changed = true;
      }
      continue;
    }
    if (remapEssenceKeysInNode(value, lookup)) changed = true;
  }
  return changed;
}

/**
 * Re-key every essence-keyed container inside a whole run container, in place.
 *
 * SYSTEM-SCOPED, exactly as {@link remapRunContainer} is: the record's own `craftingSystemId`
 * selects the leg, because the same retired id in two systems can name two different essences. A
 * record with no system id is left alone rather than remapped under a guess.
 *
 * @param {unknown} container `{active: {...}, history: [...]}`
 * @param {object} legs The SAFE per-system legs from {@link readWorldEssenceMergeMap}.
 * @returns {boolean} whether anything changed.
 */
export function remapEssenceRunContainer(container, legs) {
  if (!isPlainObject(container)) return false;
  const remapRecord = (run) => {
    if (!isPlainObject(run)) return false;
    const systemId = typeof run.craftingSystemId === 'string' ? run.craftingSystemId : null;
    const leg = systemId ? legs[systemId] : null;
    if (!leg) return false;
    return remapEssenceKeysInNode(run, legLookup(leg));
  };
  let changed = false;
  for (const run of Object.values(isPlainObject(container.active) ? container.active : {})) {
    if (remapRecord(run)) changed = true;
  }
  for (const run of arrayOf(container.history)) {
    if (remapRecord(run)) changed = true;
  }
  return changed;
}

/**
 * The FORCED-REPLACEMENT update path for one flag container.
 *
 * `==` on the LAST path segment is Foundry's replace-wholesale prefix — present in V13 and
 * retained in V14 as the deprecated spelling of `foundry.data.operators.ForcedReplacement`, so one
 * spelling covers the declared `minimum: 13` / `verified: 14` band. It is NOT the check-trigger
 * comparison operator of the same spelling.
 *
 * IT IS SPELLED HERE, ONCE, rather than at the Foundry edge in `src/main.js`, because nothing in
 * that file can be executed by a unit test and this string is the single highest-risk character
 * sequence in the change: a merge write in its place silently corrupts a consumed run snapshot.
 *
 * @param {string} key The flag container key (`'craftingRuns'`, `'essences'`, …).
 * @param {object} [options]
 * @param {boolean} [options.bare] `true` for the SINGLE-scope `flags.fabricate.<key>` depth that
 *   `gatheringRuns` is written at; `false` (the default) for the DOUBLY-nested
 *   `flags.fabricate.fabricate.<key>` depth everything else uses.
 * @returns {string}
 */
export function forcedReplacementFlagPath(key, { bare = false } = {}) {
  const scope = bare
    ? FABRICATE_FLAG_NAMESPACE
    : `${FABRICATE_FLAG_NAMESPACE}.${FABRICATE_FLAG_NAMESPACE}`;
  return `flags.${scope}.==${key}`;
}

/** Apply the item-override arm to ONE owned Item. */
async function applyEssenceOverrideToItem(item, context) {
  const { summary, readFlag, unambiguous, replaceFabricateFlag } = context;
  let next;
  try {
    const stored = readFlag(item, ITEM_ESSENCE_OVERRIDE_KEY, null);
    const remapped = remapEssenceKeyedMap(
      stored,
      (id) => unambiguous.get(id) ?? id,
      sumEssenceQuantities
    );
    if (!remapped.changed) return;
    next = remapped.value;
  } catch {
    summary.skippedErrors += 1;
    return;
  }
  try {
    await replaceFabricateFlag(item, ITEM_ESSENCE_OVERRIDE_KEY, next);
    summary.remappedItemOverrides += 1;
  } catch {
    // A refused write is the LOCKED-PACK degradation, reported rather than repaired.
    summary.lockedSkips += 1;
  }
}

/** Apply the run-container arm to ONE actor, at BOTH flag depths. */
async function applyEssenceRemapToActor(actor, context) {
  const { summary, legs, readFlag, replaceFabricateFlag, replaceBareFlag } = context;
  for (const key of NESTED_RUN_CONTAINERS) {
    try {
      const container = readFlag(actor, key, null);
      if (!remapEssenceRunContainer(container, legs)) continue;
      await replaceFabricateFlag(actor, key, container);
      summary.remappedRunContainers += 1;
    } catch {
      summary.skippedErrors += 1;
    }
  }
  try {
    // THE OTHER DEPTH, for the reason the re-key half states: `gatheringRuns` is written with a
    // bare `setFlag` and lives at the SINGLE-scope `flags.fabricate.gatheringRuns`.
    const container = readFlag(actor, BARE_RUN_CONTAINER, null, { bare: true });
    if (remapEssenceRunContainer(container, legs)) {
      await replaceBareFlag(actor, BARE_RUN_CONTAINER, container);
      summary.remappedRunContainers += 1;
    }
  } catch {
    summary.skippedErrors += 1;
  }
}

/**
 * Remap every durable essence reference the `1.34.0` equivalent-essence merge invalidated.
 *
 * NO-THROW-PER-DOCUMENT, exactly as {@link remapWorldScopeIdentityFlags} is: a read or write
 * failure on one actor or item is counted and skipped, and one bad document can never abort the
 * pass.
 *
 * EVERY WRITE IS A FORCED REPLACEMENT. See the section note above for why a plain merge write
 * cannot persist a key-set rewrite, and {@link forcedReplacementFlagPath} for the spelling.
 *
 * IT REACHES OWNED ACTOR ITEMS ONLY. The same override on a world Item, a compendium Item or an
 * unlinked synthetic token actor is never seen and is left stale PERMANENTLY. The GM notice states
 * that rather than implying it.
 *
 * @param {object} params
 * @param {Iterable<object>|Array<object>} params.actors
 * @param {unknown} params.mergeMap The persisted `fabricate.worldEssenceMergeMap`.
 * @param {(document: object, key: string, fallback?: unknown, options?: object) => unknown}
 *   params.readFlag
 * @param {(document: object, key: string, value: unknown) => Promise<unknown>}
 *   params.replaceFabricateFlag Forced-replaces `flags.fabricate.fabricate.<key>`.
 * @param {(document: object, key: string, value: unknown) => Promise<unknown>}
 *   params.replaceBareFlag Forced-replaces the SINGLE-scope `flags.fabricate.<key>`.
 * @returns {Promise<object>} the pass summary.
 */
export async function remapWorldEssenceIdentityFlags({
  actors,
  mergeMap,
  readFlag,
  replaceFabricateFlag,
  replaceBareFlag,
} = {}) {
  const { legs, unsafeEssenceIds, refusedGroups } = readWorldEssenceMergeMap(mergeMap);
  const summary = {
    scannedActors: 0,
    scannedItems: 0,
    remappedRunContainers: 0,
    remappedItemOverrides: 0,
    unsafeEssenceIdSkips: unsafeEssenceIds,
    refusedGroups,
    lockedSkips: 0,
    skippedErrors: 0,
  };
  if (
    Object.keys(legs).length === 0 ||
    typeof readFlag !== 'function' ||
    typeof replaceFabricateFlag !== 'function'
  ) {
    return summary;
  }
  const context = {
    summary,
    legs,
    readFlag,
    replaceFabricateFlag,
    replaceBareFlag: typeof replaceBareFlag === 'function' ? replaceBareFlag : replaceFabricateFlag,
    unambiguous: unambiguousEssenceRemap(mergeMap),
  };

  for (const actor of toActorList(actors)) {
    summary.scannedActors += 1;
    for (const item of actorOwnedItems(actor)) {
      summary.scannedItems += 1;
      await applyEssenceOverrideToItem(item, context);
    }
    await applyEssenceRemapToActor(actor, context);
  }
  return summary;
}
