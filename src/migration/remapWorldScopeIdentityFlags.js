/**
 * The one-shot, active-GM pass remapping every DURABLE IDENTITY FLAG the `1.30.0` re-key invalidates
 * (issue 1363). Neither shipped pass can serve: the owned-item restamp returns early for an item
 * already carrying a flag, and `MigrationRunner` holds no Actor or Item handle. Spec § World-Scope
 * Entity Migration requirements 13 to 15 own the site list, the `learnedRecipes` exclusion and the
 * dotted-`systemId` guard. NO KEY IS EVER REMOVED HERE, which is what makes a plain merge correct.
 */

import { FABRICATE_FLAG_NAMESPACE, isSafeFlagKeySegment } from '../config/flags.js';
import { canonicalSignatureKey } from '../utils/alchemySignatureKey.js';
import { isPlainObject } from '../utils/scalars.js';

import { composeFindingsNotice } from './migrationNoticeDetail.js';
import { compareSemver } from './MigrationRunner.js';

/** The migration version that PRODUCES the re-key map this pass consumes. */
export const WORLD_SCOPE_MIGRATION_VERSION = '1.30.0';

/**
 * Whether the remap wrote everything it planned to — a SECOND, INDEPENDENT WITHHOLD:
 * {@link mayClearWorldScopeRekeyMap} asks whether the PRODUCING migration completed, this whether
 * the CONSUMING pass did, and nothing else notices a transient rejection.
 * `lockedSkips` is deliberately excluded: a STANDING state a re-run cannot improve would otherwise
 * retain the map forever.
 */
export function remapCompletedCleanly(summary) {
  if (!summary || typeof summary !== 'object') return true;
  return Number(summary.skippedErrors) === 0;
}

/**
 * Whether this pass may DESTROY the re-key map — a SEPARATE GATE from the one deciding whether the
 * pass RUNS, which is what keeps a torn migration recoverable: the runner's DEFERRED branch returns
 * NORMALLY, so this runs on the SAME BOOT as a torn one.
 * `compareSemver`, NEVER A BARE `>=`: `migrationVersion` is a STRING setting, so the bare form
 * compares LEXICOGRAPHICALLY and is TRUE for `'1.4.0'` through `'1.9.0'`.
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

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

/** A `(oldId) => newId` lookup over one leg of one system's map. */
function legLookup(leg) {
  const source = isPlainObject(leg) ? leg : {};
  return (value) =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(source, value)
      ? source[value]
      : value;
}

/** The component ids UNAMBIGUOUS corpus-wide — the tie-break the flat scalar is remapped under. */
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

/** Remap one run record in place. SYSTEM-SCOPED; a record with no system id is left alone. */
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

/** Remap a whole run container (`{ active, history }`), in place. */
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

/** PARSE, REMAP, RE-SORT, RE-JOIN the dead-end keys — a re-key changes their lexical order. */
export function remapAlchemyDeadEnds(deadEnds, rekeyMap) {
  if (!isPlainObject(deadEnds)) return { value: deadEnds, changed: false };
  const next = {};
  let changed = false;
  for (const [systemId, keys] of Object.entries(deadEnds)) {
    // DE-DUPLICATED: a merge can collapse two signatures onto one key. `includes` makes a duplicate
    // harmless, but this is a persisted flag that only ever grows.
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

/** Plan the durable-identity writes ONE owned Item needs. */
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
      // THE DOTTED-`systemId` GUARD. No shipped writer can have written an unsafe segment as a
      // `roles` key, and writing one here would mis-nest the flag, so it is SKIPPED and counted.
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

/** Remap every flag the `1.30.0` re-key invalidated. NO-THROW-PER-DOCUMENT; a LOCKED Item counts. */
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
      // THE OTHER DEPTH. `gatheringRuns` is written with a bare `setFlag`, so a pass assuming the
      // doubly-nested depth silently misses it.
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

// --- The `1.34.0` equivalent-essence merge half (issue 1654) ----------------
// A second, independent site list keyed on `fabricate.worldEssenceMergeMap`; spec § Equivalent World
// Essence Merge requirement 9 owns the sites and the exclusions.
// Every write is a FORCED REPLACEMENT: re-keying changes a container's key set and `Document#update`
// performs no deletions, so a merge would leave the retired key standing and a resumed run would
// transfer essences it never consumed.
// No startup-prune withhold is added — no startup pass gates on an essence id — which
// `tests/world-scope-startup-prune-ordering.test.js` pins negatively.

/** The migration version that produces the merge map this half consumes. */
export const WORLD_ESSENCE_MERGE_MIGRATION_VERSION = '1.34.0';

/** The transient leg: the per-system re-key pairs this pass consumes and boot-time gating clears. */
export const WORLD_ESSENCE_MERGE_SYSTEMS_LEG = 'systems';

/** The never-cleared tombstone leg: without it `mintEssenceId` would reissue a retired id. */
export const WORLD_ESSENCE_MERGE_RETIRED_LEG = 'retired';

/** The doubly-nested, system-less item essence override. */
const ITEM_ESSENCE_OVERRIDE_KEY = 'essences';

/** Whether this half may destroy the per-system legs; the `retired` leg is outside the clear. */
export function mayClearWorldEssenceMergeMap(migrationVersion) {
  return compareSemver(migrationVersion ?? '0.0.0', WORLD_ESSENCE_MERGE_MIGRATION_VERSION) >= 0;
}

/**
 * The per-system legs, read from the `systems` leg alone. NESTED rather than flat siblings, because
 * a system whose id is literally `retired` would collide with the tombstone key.
 */
export function worldEssenceMergeLegs(mergeMap) {
  const systems = isPlainObject(mergeMap) ? mergeMap[WORLD_ESSENCE_MERGE_SYSTEMS_LEG] : null;
  if (!isPlainObject(systems)) return {};
  const legs = {};
  for (const [systemId, leg] of Object.entries(systems)) {
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
 * Whether the merge map still holds unconsumed pairs. It does NOT fail closed, unlike the predicate
 * gating the destructive prune: failing closed here would walk every actor on every boot.
 */
export function hasPendingWorldEssenceMerge(mergeMap) {
  return Object.keys(worldEssenceMergeLegs(mergeMap)).length > 0;
}

/**
 * Split one system's pairs into safe groups and refused ids. An unsafe id refuses THE WHOLE GROUP:
 * half a merge leaves a state no later pass can distinguish from a partial tear.
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

/** The merge map as this pass will apply it: safe legs only, with what it refused. */
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
 * The essence ids unambiguous corpus-wide — the tie-break the item override is remapped under.
 * Leaving an ambiguous key is safe only because a retired id is never reissued.
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

/** Two re-keyed quantities land on one key: the survivor holds the sum. */
function sumEssenceQuantities(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(a) ? left : right;
  return a + b;
}

/**
 * Two re-keyed enabled-flags collide: the survivor takes the logical AND, not OR, because
 * `essenceEnabled` snapshots a gate the GM may have switched off for one contributor.
 */
function andEssenceEnabledFlags(left, right) {
  return Boolean(left) && Boolean(right);
}

/**
 * The key-position containers a run record holds, and how a collision resolves. A `Map`, so a record
 * carrying `constructor` or `__proto__` cannot reach an inherited member.
 */
const ESSENCE_KEY_POSITION_CONTAINERS = new Map([
  ['resolvedEssences', sumEssenceQuantities],
  ['essenceEnabled', andEssenceEnabledFlags],
]);

/**
 * Re-key one essence-keyed map through `combine`. The essence id is the KEY, which is why the write
 * side cannot use a merge; the accumulator is a `Map`, so `__proto__` lands as an own property.
 */
export function remapEssenceKeyedMap(map, lookup, combine) {
  if (!isPlainObject(map)) return { value: map, changed: false };
  const next = new Map();
  let changed = false;
  for (const [essenceId, value] of Object.entries(map)) {
    const mapped = String(lookup(essenceId));
    if (mapped !== essenceId) changed = true;
    next.set(mapped, next.has(mapped) ? combine(next.get(mapped), value) : value);
  }
  return { value: changed ? Object.fromEntries(next) : map, changed };
}

/**
 * Re-key every essence-keyed container at ANY depth, in place. The depth is not assumed, so a later
 * writer at another depth is covered without a second edit here.
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

/** Re-key a whole run container in place. System-scoped; a record with no system id is left alone. */
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
 * The forced-replacement update path, spelled once. `==` on the last segment is Foundry's
 * replace-wholesale prefix, valid across the declared `minimum: 13` / `verified: 14` band — not the
 * comparison operator of that spelling.
 */
export function forcedReplacementFlagPath(key, { bare = false } = {}) {
  const scope = bare
    ? FABRICATE_FLAG_NAMESPACE
    : `${FABRICATE_FLAG_NAMESPACE}.${FABRICATE_FLAG_NAMESPACE}`;
  return `flags.${scope}.==${key}`;
}

/** Apply the item-override arm to one owned Item. */
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
    // A refused write is the locked-pack degradation, reported rather than repaired.
    summary.lockedSkips += 1;
  }
}

/** Apply the run-container arm to one actor, at both flag depths. */
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
    // The other depth: `gatheringRuns` is written with a bare `setFlag`.
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
 * Remap every essence reference the `1.34.0` merge invalidated. It reaches owned actor Items ONLY,
 * so the same override on a world Item, a compendium Item or an unlinked token actor stays stale.
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

/**
 * The one-time notice describing what the `1.34.0` flag remap could not repair — a reachable state
 * requirement 9 calls data corruption rather than untidiness, since the world is then merged in
 * settings and un-merged in actor flags. Silent on a clean pass.
 */
export function buildWorldEssenceMergeRemapNotice(summary, localize) {
  const unsafe = Array.isArray(summary?.unsafeEssenceIdSkips) ? summary.unsafeEssenceIdSkips : [];
  const refused = Number(summary?.refusedGroups) || 0;
  const locked = Number(summary?.lockedSkips) || 0;
  const failed = Number(summary?.skippedErrors) || 0;
  return composeFindingsNotice(localize, [
    {
      when: refused > 0,
      data: { count: refused, essences: unsafe.join(', ') },
      key: 'FABRICATE.Migration.WorldEssenceMerge.UnsafeEssenceIds',
      fallback:
        "{count} merged essence set(s) could not be applied to your characters' in-progress runs.",
      detailKey: 'FABRICATE.Migration.WorldEssenceMerge.UnsafeEssenceIdsDetail',
      detailFallback:
        "{count} merged essence set(s) contain an id Fabricate cannot use inside a flag path, so the merge landed in your world's settings but NOT on your characters' in-progress runs: {essences}. Those runs may still name an essence that no longer exists — finish or cancel them, and rename the offending essence before merging again.",
    },
    {
      when: locked > 0,
      data: { count: locked },
      key: 'FABRICATE.Migration.WorldEssenceMerge.RemapLockedSkips',
      fallback:
        '{count} item(s) refused the update — usually because they live in a locked compendium — and may still name a merged-away essence.',
    },
    {
      when: failed > 0,
      data: { count: failed },
      key: 'FABRICATE.Migration.WorldEssenceMerge.RemapSkippedErrors',
      fallback:
        '{count} document(s) could not be updated, so the repair is incomplete. Fabricate will retry on the next reload.',
      detailKey: 'FABRICATE.Migration.WorldEssenceMerge.RemapSkippedErrorsDetail',
      detailFallback:
        '{count} document(s) could not be updated at all, so the repair is INCOMPLETE. Fabricate has kept its record of what to change and will retry on the next reload; you can also run it now from the console with game.fabricate.remapWorldEssenceIdentityFlags().',
    },
  ]);
}
