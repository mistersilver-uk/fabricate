/**
 * @module definitionIndex
 *
 * Retained read indexes over ONE crafting system's definition set — the `Map`-backed
 * replacement for the linear `Array.find()` scans that every identity tier used to run
 * per owned item (issue 1076, under the performance programme #1070).
 *
 * ## The defect this exists to remove
 *
 * `resolveComponentForItem` was `O(components)` per item: two `candidates.find()` calls
 * for the durable tiers and a third for the raw source-reference tier. `findMatchingComponent`
 * then paid a FOURTH full scan in the name fallback. Nothing about that is exotic — it is
 * the branch an ordinary character sheet spends most of its time in, because mundane gear,
 * ammo and loot carry no Fabricate flags, no source references and no matching name, so
 * they fall through every tier and pay every scan before returning `null`.
 *
 * Multiply that by the callers and the shape of the reported regression appears:
 * `CraftingEngine.findComponentItems` filters `[...actor.items]` through
 * `itemResolvesToComponent`, which re-runs FULL candidate resolution per item, making it
 * `O(items x components)` per component resolved — and bulk salvage / `BulkDestroyService`
 * call it once per row, so a bulk run was `O(rows x items x components)`.
 *
 * With a warm index every tier is a `Map.get()`, so the same paths are `O(items)` and
 * `O(rows x items)`; the `components` term is paid once per index build, not once per item.
 *
 * ## What an index is keyed on, and why it is NOT global
 *
 * Component, tool and recipe-item ids are **not globally unique** — a copy-imported system
 * preserves its origin's ids on purpose — so identity is only ever resolved against ONE
 * system's candidate set. This module therefore keys every index on the **candidate array
 * itself** (a `WeakMap`), never on a system id and never on a process-wide registry. An
 * index is a property of the array it was derived from, so two systems holding a component
 * with the same id cannot see each other's entries even in principle.
 *
 * The durable identity an index reads is the `roles` map leaf
 * (`flags.fabricate.roles[systemId].componentId` and its `toolId` /
 * `recipeItemDefinitionId` siblings) via the caller, never anything Foundry's
 * `duplicateSource` propagation rewrites — this module only ever indexes the DEFINITION
 * side (`id`, source-reference union, `name`, `recipeIds`), which is authored data.
 *
 * ## Precedence is preserved exactly, and that is the correctness bar
 *
 * `Array.prototype.find` returns the FIRST element satisfying its predicate, so every
 * lookup here reproduces array-order precedence explicitly:
 *
 * - `byId`, `byName`, `byNameLower` are built **first-insert-wins** while walking the array
 *   in order, so a duplicate id or two same-named components resolve to the same definition
 *   `.find()` resolved to.
 * - Source references are stored as `ref -> array position` (first-wins per ref) and a
 *   lookup takes the **minimum position** across all of the item's references. That is not
 *   the same as "the first of the item's refs that hits": the original scanned CANDIDATES
 *   in the outer loop, so the winner is the earliest candidate matching ANY of the item's
 *   refs. Taking the minimum position reproduces that; taking the first hit would not.
 * - `byRecipeId` buckets keep array order, so a `filter()` over the definitions returns the
 *   same list in the same order.
 *
 * ## Invalidation rule — stated once, here
 *
 * > An index derived from array `A` stays valid while `A` is the same object, has the same
 * > `length`, and carries the same revision. Any in-place mutation of `A` — replacing or
 * > reordering an element, **or rewriting an INDEXED FIELD of an element** (`id`, `name`,
 * > `registeredItemUuid`, `originItemUuid`, `aliasItemUuids`, `recipeIds`) — MUST call
 * > {@link advanceDefinitionRevision} on `A`.
 *
 * Three clauses, because each closes a different hole:
 *
 * 1. **Array identity.** Every path that rebuilds a definition array — `_normalizeSystem`,
 *    import, and every `system.components = […]` replacement — produces a NEW array, which
 *    is a different `WeakMap` key and therefore a fresh index for free. No bookkeeping is
 *    needed for the common case.
 *
 *    `reload()` is the ONE deliberate exception, and it is worth stating plainly because
 *    this clause used to read as a blanket safety argument. It re-parses the whole corpus
 *    and so does hold a freshly built array for every system — but for a system its delta
 *    proves structurally unchanged it now DISCARDS that array and keeps the retained record,
 *    with the array the live index is already keyed on (issue 1078). Without that, a remote
 *    client rebuilt every index on every reload and the retained index was dead code for
 *    everyone but the writing GM.
 *
 *    That is safe, and only because the licence is strictly stronger than this rule needs:
 *    reuse requires `jsonEquals` over the WHOLE record (`revisionTokens.js`), so a reused
 *    array is byte-equivalent in every indexed field, element by element. A coarser
 *    licence — reuse because the system id set is unchanged — would hand back a same-object,
 *    same-length array whose elements had been replaced, which is exactly what clause 3
 *    exists to catch and what neither clause 1 nor clause 2 can see. A system whose record
 *    changed at all takes the freshly parsed array, so it is a new key and a fresh index.
 * 2. **Length.** A bare `push`/`pop`/`splice` on a live array changes its length, so a
 *    mutation that forgets clause 3 is still caught. This is a safety net for fixtures and
 *    external callers, not a licence to skip the revision.
 * 3. **Revision.** `CraftingSystemManager` is the only production in-place mutator, and it
 *    advances the revision at all twelve of its sites — six that mutate an ARRAY (two
 *    `push`, four `components[idx] = …`) and six that rewrite an indexed field of an
 *    ELEMENT (the recipe-item and component source-refresh branches, the item-sync name
 *    rewrite, and the three `recipeIds` membership writers). The element-field half is the
 *    one that matters: it is invisible to clauses 1 and 2, and it is exactly what
 *    `tests/recipe-book-membership-basis.test.js` catches when it is missed.
 *
 * `tests/runtime-definition-indexes.test.js` proves the rule by removing an advance and
 * watching a named leaf go red — an index with no staleness test is precisely the defect
 * this work could most easily introduce.
 *
 * ## Instrumentation
 *
 * {@link readIdentityCounters} exposes `candidatesExamined` — one bump per candidate
 * definition object this module inspects, INCLUDING the ones walked while building an
 * index. Counting the build is what keeps the counter honest: a counter that only saw
 * lookups would report a triumphant zero for a path that rebuilds the whole index every
 * call. The counters are plain integer bumps on a module-private object, in the same
 * shape as `componentNameMatch`'s warn-once telemetry state, and are reset by tests
 * through {@link resetIdentityCounters}.
 *
 * ## Rebuilding these indexes under a lazily-loaded record store (handed to #1080)
 *
 * Every index here is derived from data the manager already holds resident, so under
 * today's settings backend a rebuild costs one pass over an array that is in memory
 * anyway. Under the document-backed store #1079/#1080 is deciding on, that stops being
 * true, and #1088 Q5 removed the option this issue was originally written against: a
 * module CANNOT promote a field into a compendium's connect-time index, because the server
 * builds it from the document class's `metadata.compendiumIndexFields` and
 * `CONFIG[type].compendiumIndexFields` is client-side only (setting it merely marks every
 * pack of that type un-indexed and forces an O(N) `getIndex` round trip).
 *
 * So the three surviving strategies, per index:
 *
 * - **`byId` needs nothing.** `_id` is one of the four default index fields, so a
 *   lazily-loaded store answers id lookups from the connect-time index at 1.41 MB per
 *   client for 10,000 records — cheaper than today.
 * - **`byName` / `byNameLower` need nothing either.** `name` is also a default index field.
 *   This matters more than it looks: the name fallback is the branch a fat inventory
 *   actually takes, and it is the one index that survives the migration unchanged.
 * - **`bySourceRef` and `byRecipeId` are the cost.** Both read module flags, which are not
 *   default index fields. Recommended strategy: **hold them outside the record store** —
 *   maintain the source-reference and book-membership maps as a small derived world
 *   artefact written when a definition's source refs or `recipeIds` change, rather than
 *   hydrating every record at start-up (defeats lazy loading) or paying one O(N)
 *   `getIndex({fields:['flags.fabricate…']})` per session (a full round trip on every
 *   client, every login, for data that changes only when a GM edits a definition). The
 *   maps are small — one entry per source reference and per book membership, not per
 *   field of every record — and they are rebuildable from the corpus, so a lost or
 *   corrupt artefact degrades to a one-off full hydration rather than to wrong answers.
 *
 * `RecipeManager`'s search text (`normalizedSearchTextByRecipeId` in the issue's index
 * list) falls under the same "hold it outside the record store" heading, and is deferred
 * to the canonical summary projection (#1091) rather than built here: a search cohort keyed
 * on a mutable field of a live model object is a staleness bug waiting to happen, and the
 * summary projection is where a normalized record can own that text without aliasing the
 * model.
 */

import { getItemMatchUuids } from './sourceReferenceUnion.js';

// ---------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------

const _counters = {
  candidatesExamined: 0,
  indexBuilds: 0,
};

/**
 * Read the identity-resolution operation counters.
 *
 * `candidatesExamined` counts candidate definition objects inspected, including those
 * walked while an index is being built. `indexBuilds` counts index constructions, so a
 * test can assert an index is WARM before asserting a bound on the lookup.
 *
 * @returns {{candidatesExamined: number, indexBuilds: number}} A snapshot copy.
 */
export function readIdentityCounters() {
  return { ..._counters };
}

/**
 * Reset the identity-resolution counters. Test seam only.
 *
 * @returns {void}
 */
export function resetIdentityCounters() {
  _counters.candidatesExamined = 0;
  _counters.indexBuilds = 0;
}

// ---------------------------------------------------------------------------
// Revision bookkeeping
// ---------------------------------------------------------------------------

/** @type {WeakMap<object[], number>} */
const _revisions = new WeakMap();
/** @type {WeakMap<object[], {revision: number, length: number, index: DefinitionIndex}>} */
const _cache = new WeakMap();

/**
 * Announce that a definition array was mutated IN PLACE, so its retained index is rebuilt
 * on the next read.
 *
 * Required for any mutation that replaces or reorders an element — those are invisible to
 * the array-identity and length clauses of the invalidation rule. Adding or removing an
 * element is also covered by the length clause, but call this anyway: relying on a
 * coincidence of arithmetic is not an invalidation rule.
 *
 * @param {object[]|null|undefined} definitions The live array that was mutated.
 * @returns {void}
 */
export function advanceDefinitionRevision(definitions) {
  if (!Array.isArray(definitions)) return;
  _revisions.set(definitions, (_revisions.get(definitions) ?? 0) + 1);
}

/**
 * The current revision of a definition array. Exposed so a consumer can hold a
 * `(array, revision)` pair and compare it with `===` instead of re-deriving anything.
 *
 * @param {object[]|null|undefined} definitions
 * @returns {number} `0` for an array that has never been mutated in place.
 */
export function readDefinitionRevision(definitions) {
  if (!Array.isArray(definitions)) return 0;
  return _revisions.get(definitions) ?? 0;
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/**
 * @typedef {object} DefinitionIndex
 * @property {object[]} definitions The array the index was derived from.
 * @property {Map<*, object>} byId `def.id` -> definition, first-insert-wins.
 * @property {Map<string, number>} orderBySourceRef Source reference -> array position of
 *   the FIRST definition carrying it.
 * @property {Map<*, object>} byName Exact `def.name` -> definition, first-insert-wins.
 * @property {Map<string, object>} byNameLower Lower-cased name -> definition, first-wins.
 * @property {Map<string, object[]>} byRecipeId `String(recipeId)` -> definitions listing it,
 *   in array order.
 */

/**
 * A definition id is indexable when it can be compared by `Map` lookup exactly as
 * `def.id === claimed` compares it. `NaN` is the one value where `Map` (SameValueZero) and
 * `===` disagree, so it is excluded rather than silently matched.
 *
 * @param {*} id
 * @returns {boolean}
 */
function indexableId(id) {
  if (id == null) return false;
  return !(typeof id === 'number' && Number.isNaN(id));
}

/**
 * Walk a definition array once and build every facet.
 *
 * @param {object[]} definitions
 * @returns {DefinitionIndex}
 */
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
          // A definition listing the same recipe id twice must still appear ONCE, exactly
          // as `filter(...some(...))` returned it once.
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
 * The retained index for one system's definition array, rebuilt only when the invalidation
 * rule in this module's header says it must be.
 *
 * @param {object[]|null|undefined} definitions The LIVE candidate array of one system.
 * @returns {DefinitionIndex}
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
 * The definition an id claim names, or `null` — the indexed form of
 * `candidates.find((def) => def && def.id === claimedId)`.
 *
 * @param {DefinitionIndex} index
 * @param {*} claimedId
 * @returns {object|null}
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
 *
 * Takes the minimum array position rather than the first reference that hits, because the
 * scan it replaces iterated candidates in the outer loop.
 *
 * @param {DefinitionIndex} index
 * @param {Iterable<string>} refs The ITEM's source references.
 * @returns {object|null}
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
 * The first definition whose name matches `itemName` — the indexed form of
 * `candidates.find((def) => namesMatch(itemName, def.name, caseSensitive))`.
 *
 * Both halves of the comparison must be truthy, exactly as `namesMatch` requires, and the
 * two case modes read SEPARATE maps: salvage matches case-SENSITIVELY on purpose (matching
 * more broadly than salvage would let bulk destroy delete items belonging to a
 * differently-cased component), while the read/craft sites match case-insensitively. One
 * folded map cannot serve both.
 *
 * @param {DefinitionIndex} index
 * @param {*} itemName
 * @param {boolean} caseSensitive
 * @returns {object|null}
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
 * Every definition listing `recipeId` in its `recipeIds[]`, in array order — the indexed
 * form of `definitions.filter((def) => def.recipeIds.some((id) => String(id) === recipeId))`.
 *
 * Returns the SHARED bucket array; callers must not mutate it.
 *
 * @param {DefinitionIndex} index
 * @param {*} recipeId
 * @returns {object[]} Empty when nothing lists it.
 */
export function findByRecipeId(index, recipeId) {
  const bucket = index.byRecipeId.get(String(recipeId));
  if (!bucket) return [];
  _counters.candidatesExamined += bucket.length;
  return bucket;
}

/**
 * The membership lookups `utils/recipeItemMembership.js` accepts, backed by the retained
 * index (issue 1155).
 *
 * Only the `recipeIds[]` leg is index-backed, and deliberately so: it is the leg that runs
 * on EVERY player access check, and it is the one issue 1076's index exists for. The two
 * legacy legs run only on an un-migrated system and only after that leg misses, and they
 * were array scans at every call site before the membership rule was unified — so leaving
 * them as the leaf's default scan keeps this change free of any new index plumbing and any
 * new invalidation obligation.
 *
 * Lives here rather than in the membership leaf because the leaf imports nothing: it is
 * reached from the store projections the mounted Svelte suites pull in, and this module's
 * retained caches have no business in that closure.
 */
export const indexedMembershipLookups = Object.freeze({
  byRecipeId: (definitions, recipeId) => findByRecipeId(getDefinitionIndex(definitions), recipeId),
});
