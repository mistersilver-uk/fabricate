/**
 * Retained indexes over one system's definition arrays (issue 1076), keyed on the array through a
 * `WeakMap` because ids are unique per system only. Array-order precedence is exact, including the
 * minimum position for source references. Staleness is `data-models` "Definition Index
 * Invalidation", enforced through {@link advanceDefinitionRevision}.
 */

import { getItemMatchUuids } from './sourceReferenceUnion.js';

const _counters = {
  candidatesExamined: 0,
  indexBuilds: 0,
};

export function readIdentityCounters() {
  return { ..._counters };
}

export function resetIdentityCounters() {
  _counters.candidatesExamined = 0;
  _counters.indexBuilds = 0;
}

const _revisions = new WeakMap();
const _cache = new WeakMap();

/** After an in-place mutation, so the next read rebuilds the index. */
export function advanceDefinitionRevision(definitions) {
  if (!Array.isArray(definitions)) return;
  _revisions.set(definitions, (_revisions.get(definitions) ?? 0) + 1);
}

export function readDefinitionRevision(definitions) {
  if (!Array.isArray(definitions)) return 0;
  return _revisions.get(definitions) ?? 0;
}

/** When a `Map` lookup compares it exactly as `def.id === claimed` does. */
function indexableId(id) {
  if (id == null) return false;
  return !(typeof id === 'number' && Number.isNaN(id));
}

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
          // Once per definition, even if it lists a recipe id twice.
        } else if (bucket.at(-1) !== definition) {
          bucket.push(definition);
        }
      }
    }
  }

  _counters.indexBuilds += 1;
  return { definitions, byId, orderBySourceRef, byName, byNameLower, byRecipeId };
}

/** For a non-array argument, so callers need no guard. */
const EMPTY_INDEX = Object.freeze({
  definitions: Object.freeze([]),
  byId: new Map(),
  orderBySourceRef: new Map(),
  byName: new Map(),
  byNameLower: new Map(),
  byRecipeId: new Map(),
});

/** Rebuilt only when the header's invalidation rule says so. */
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

/** The indexed `candidates.find((def) => def && def.id === claimedId)`, or `null`. */
export function findById(index, claimedId) {
  if (!indexableId(claimedId)) return null;
  const found = index.byId.get(claimedId);
  if (!found) return null;
  _counters.candidatesExamined += 1;
  return found;
}

/** The earliest definition carrying any of `refs`, as `find` over the array would answer. */
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

/** The indexed `find` by `namesMatch(itemName, def.name, caseSensitive)`. */
export function findByName(index, itemName, caseSensitive) {
  if (!itemName) return null;
  const found = caseSensitive
    ? index.byName.get(itemName)
    : index.byNameLower.get(String(itemName).toLowerCase());
  if (!found) return null;
  _counters.candidatesExamined += 1;
  return found;
}

/** Every definition listing `recipeId` in `recipeIds[]`, in array order. */
export function findByRecipeId(index, recipeId) {
  const bucket = index.byRecipeId.get(String(recipeId));
  if (!bucket) return [];
  _counters.candidatesExamined += bucket.length;
  return bucket;
}

const _scopedUnions = new WeakMap();

/** The memo for `resolveComponentScope` and its siblings (issue 1359, epic 1357). */
export function getScopedDefinitionUnion(worldCorpus, systemDefinitions, build) {
  // No stable identity to key on, so computed fresh rather than under a shared sentinel.
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

/** For `recipeItemMembership.js`, backed by the retained index (issue 1155). */
export const indexedMembershipLookups = Object.freeze({
  byRecipeId: (definitions, recipeId) => findByRecipeId(getDefinitionIndex(definitions), recipeId),
});
