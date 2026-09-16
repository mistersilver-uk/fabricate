/**
 * Retained `Map` indexes over ONE crafting system's definition arrays, replacing the per-item
 * `Array.find()` scans identity resolution used to run (issue 1076). Keyed on the candidate ARRAY
 * itself through a `WeakMap`, because definition ids are unique per system only, and array-order
 * precedence is reproduced exactly — including the minimum-position rule for source references.
 * Staleness is the data-models requirement "Definition Index Invalidation", whose enforcement
 * point is {@link advanceDefinitionRevision}.
 */

import { getItemMatchUuids } from './sourceReferenceUnion.js';

// ── Instrumentation ──

const _counters = {
  candidatesExamined: 0,
  indexBuilds: 0,
};

/** Read the identity-resolution operation counters. */
export function readIdentityCounters() {
  return { ..._counters };
}

/** Reset the identity-resolution counters. */
export function resetIdentityCounters() {
  _counters.candidatesExamined = 0;
  _counters.indexBuilds = 0;
}

// ── Revision bookkeeping ──

const _revisions = new WeakMap();
const _cache = new WeakMap();

/**
 * Announce that a definition array was mutated IN PLACE, so its retained index is rebuilt on the
 * next read.
 */
export function advanceDefinitionRevision(definitions) {
  if (!Array.isArray(definitions)) return;
  _revisions.set(definitions, (_revisions.get(definitions) ?? 0) + 1);
}

/** The current revision of a definition array. */
export function readDefinitionRevision(definitions) {
  if (!Array.isArray(definitions)) return 0;
  return _revisions.get(definitions) ?? 0;
}

// ── The index ──

/**
 * A definition id is indexable when it can be compared by `Map` lookup exactly as `def.id ===
 * claimed` compares it.
 */
function indexableId(id) {
  if (id == null) return false;
  return !(typeof id === 'number' && Number.isNaN(id));
}

/** Walk a definition array once and build every facet. */
function buildIndex(definitions) {
  const byId = new Map();
  const orderBySourceRef = new Map();
  const byName = new Map();
  const byNameLower = new Map();
  const byRecipeId = new Map();

  for (const [position, definition] of definitions.entries()) {
    _counters.candidatesExamined += 1;
    if (!definition || typeof definition !== 'object') continue;

    if (indexableId(definition.id) && !byId.has(definition.id)) {
      byId.set(definition.id, definition);
    }

    for (const ref of getItemMatchUuids(definition)) {
      if (!orderBySourceRef.has(ref)) orderBySourceRef.set(ref, position);
    }

    // `namesMatch` refuses a falsy name on either side, so an empty name is not a key.
    const name = definition.name;
    if (name) {
      if (!byName.has(name)) byName.set(name, definition);
      const lower = String(name).toLowerCase();
      if (!byNameLower.has(lower)) byNameLower.set(lower, definition);
    }

    if (Array.isArray(definition.recipeIds)) {
      for (const recipeId of definition.recipeIds) {
        const key = String(recipeId);
        const bucket = byRecipeId.get(key);
        if (!bucket) {
          byRecipeId.set(key, [definition]);
          // A definition listing the same recipe id twice must still appear ONCE, exactly as
          // `filter(...some(...))` returned it once.
        } else if (bucket.at(-1) !== definition) {
          bucket.push(definition);
        }
      }
    }
  }

  _counters.indexBuilds += 1;
  return { definitions, byId, orderBySourceRef, byName, byNameLower, byRecipeId };
}

/** The empty index handed back for a non-array argument, so callers need no guard. */
const EMPTY_INDEX = Object.freeze({
  definitions: Object.freeze([]),
  byId: new Map(),
  orderBySourceRef: new Map(),
  byName: new Map(),
  byNameLower: new Map(),
  byRecipeId: new Map(),
});

/**
 * The retained index for one system's definition array, rebuilt only when the invalidation rule in
 * this module's header says it must be.
 */
export function getDefinitionIndex(definitions) {
  if (!Array.isArray(definitions)) return EMPTY_INDEX;
  const revision = _revisions.get(definitions) ?? 0;
  const cached = _cache.get(definitions);
  if (cached && cached.revision === revision && cached.length === definitions.length) {
    return cached.index;
  }
  const index = buildIndex(definitions);
  _cache.set(definitions, { revision, length: definitions.length, index });
  return index;
}

/**
 * The definition an id claim names, or `null` — the indexed form of `candidates.find((def) => def
 * && def.id === claimedId)`.
 */
export function findById(index, claimedId) {
  if (!indexableId(claimedId)) return null;
  const found = index.byId.get(claimedId);
  if (!found) return null;
  _counters.candidatesExamined += 1;
  return found;
}

/**
 * The EARLIEST definition in array order carrying any of `refs` — the indexed form of
 * `candidates.find((def) => getItemMatchUuids(def).some((ref) => refs.has(ref)))`.
 */
export function findBySourceRefs(index, refs) {
  let best = -1;
  for (const ref of refs) {
    const position = index.orderBySourceRef.get(ref);
    if (position === undefined) continue;
    if (best === -1 || position < best) best = position;
  }
  if (best === -1) return null;
  _counters.candidatesExamined += 1;
  return index.definitions[best];
}

/**
 * The first definition whose name matches `itemName` — the indexed form of `candidates.find((def)
 * => namesMatch(itemName, def.name, caseSensitive))`.
 */
export function findByName(index, itemName, caseSensitive) {
  if (!itemName) return null;
  const found = caseSensitive
    ? index.byName.get(itemName)
    : index.byNameLower.get(String(itemName).toLowerCase());
  if (!found) return null;
  _counters.candidatesExamined += 1;
  return found;
}

/**
 * Every definition listing `recipeId` in its `recipeIds[]`, in array order — the indexed form of
 * `definitions.filter((def) => def.recipeIds.some((id) => String(id) === recipeId))`.
 */
export function findByRecipeId(index, recipeId) {
  const bucket = index.byRecipeId.get(String(recipeId));
  if (!bucket) return [];
  _counters.candidatesExamined += bucket.length;
  return bucket;
}

// ── The resolved scoped-definition union memo (issue 1359) ──

/** The memoized READ union of a world scope corpus with one system's in-system array. */
const _scopedUnions = new WeakMap();

/** The memo for `resolveComponentScope` and its siblings (issue 1359, epic 1357). */
export function getScopedDefinitionUnion(worldCorpus, systemDefinitions, build) {
  // An absent corpus or a non-array system list has no stable identity to key on, so it is computed
  // fresh rather than cached under a shared sentinel that two systems would collide in.
  if (!worldCorpus || typeof worldCorpus !== 'object' || !Array.isArray(systemDefinitions)) {
    _counters.indexBuilds += 1;
    return build();
  }
  let bySystem = _scopedUnions.get(worldCorpus);
  if (!bySystem) {
    bySystem = new WeakMap();
    _scopedUnions.set(worldCorpus, bySystem);
  }
  const revision = _revisions.get(systemDefinitions) ?? 0;
  const cached = bySystem.get(systemDefinitions);
  if (cached && cached.revision === revision && cached.length === systemDefinitions.length) {
    return cached.union;
  }
  const union = build();
  _counters.indexBuilds += 1;
  bySystem.set(systemDefinitions, { revision, length: systemDefinitions.length, union });
  return union;
}

/**
 * The membership lookups `utils/recipeItemMembership.js` accepts, backed by the retained index
 * (issue 1155).
 */
export const indexedMembershipLookups = Object.freeze({
  byRecipeId: (definitions, recipeId) => findByRecipeId(getDefinitionIndex(definitions), recipeId),
});
