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
 * Between the settings write and this pass, resolution degrades to the SOURCE-REFERENCE tier,
 * which this change does not touch. A source Item in a LOCKED pack is skipped and stays in that
 * tier permanently — accepted, stated, and counted in the report.
 */

import { isSafeFlagKeySegment } from '../config/flags.js';
import { canonicalSignatureKey } from '../utils/alchemySignatureKey.js';

import { compareSemver } from './MigrationRunner.js';

/**
 * The migration version that PRODUCES the re-key map this pass consumes.
 *
 * @type {string}
 */
export const WORLD_SCOPE_MIGRATION_VERSION = '1.30.0';

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

  const actorList = Array.isArray(actors)
    ? actors
    : actors && typeof actors[Symbol.iterator] === 'function'
      ? [...actors]
      : [];

  for (const actor of actorList) {
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
