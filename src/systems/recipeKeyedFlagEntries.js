/**
 * Read a recipe-id-keyed actor flag map back at its ENTRY boundary (issue 1143).
 *
 * Two actor flags are keyed by recipe id — `learnedRecipes` and `discoveryProgress` —
 * and NEITHER is persisted as the flat `{ id: entry }` object it is written as.
 * `Document#update` dot-expands the whole nested VALUE TREE of an `ObjectField`, not
 * just the update path key, so a recipe id containing a `.` is stored as a subtree:
 *
 * ```js
 * // written by `_setLearnedMap`
 * { 'imported.recipe.id': entry, plainid: entry }
 * // persisted
 * { imported: { recipe: { id: entry } }, plainid: entry }
 * ```
 *
 * Verified by EXECUTION against both supported builds, from their release archives:
 *
 * - **V14.365** expands inside the field: `ObjectField#_cleanType` →
 *   `#reconstructOperators` calls `SchemaField.expandObject` and then recurses into
 *   every nested plain object (`common/data/fields.mjs`).
 * - **V13.351** expands one level up, in `DataModel#updateSource`
 *   (`common/abstract/data.mjs`): when ANY top-level change key contains a dot it
 *   replaces `changes` with `expandObject(changes)`, and V13's `expandObject`
 *   (`common/utils/helpers.mjs`) recurses into nested plain objects, re-splitting keys
 *   at EVERY depth through `setProperty`. Fabricate always writes the dotted path
 *   `flags.fabricate.fabricate.<key>`, so that guard always fires. V13's `ObjectField`
 *   really does have no `_cleanType` override — the nesting simply happens earlier.
 *
 * So the persisted shape is the same on both builds and this reader is not version-gated.
 *
 * ## Why the walk stops at the entry boundary
 *
 * `foundry.utils.flattenObject` is NOT the inverse of that expansion and must never be
 * used here: it recurses all the way to non-plain-object LEAVES, so the map above
 * flattens to `imported.recipe.id.learnedAt`, `imported.recipe.id.sourceItemUuid`,
 * `plainid.learnedAt`, `plainid.sourceItemUuid`. None of those is a recipe id, so
 * diffing them against the set of valid ids marks EVERY key stale and deletes each
 * actor's whole map on every recipe deletion — strictly worse than reading the top
 * level. Derivation has to stop one level higher, at the entry.
 *
 * ## Why entry SHAPE and not longest-prefix matching
 *
 * The alternative — matching each subtree path against the set of known recipe ids —
 * cannot find an ORPHAN entry, whose id is by definition absent from that set. Orphans
 * are exactly what the recipe-deletion cascade exists to remove, so a known-id matcher
 * would be blind to its only input. Entry-shape detection needs no external set: an
 * entry is recognised by the fields every writer stamps on it.
 *
 * ## Limits, stated rather than papered over
 *
 * The id → storage mapping is not injective, so some inputs are unrecoverable BEFORE
 * any reader runs. All four shapes below were produced by executing V13.351's real
 * `expandObject`:
 *
 * - `a` learned, then `a.b` → `{a: {learnedAt, sourceItemUuid, b: {…}}}`. Both entries
 *   are recovered, because `a`'s own fields are scalars and `b` is not.
 * - `a.b` learned, then `a` → `{a: {learnedAt, sourceItemUuid}}`. Writing `a` REPLACES
 *   the whole node, so `a.b` is destroyed by the write. Nothing can recover it.
 * - `a` learned, then `a.learnedAt` → `{a: {learnedAt: {…}, sourceItemUuid}}`. Both
 *   entries are addressable, but recipe `a`'s own `learnedAt` TIMESTAMP was overwritten
 *   by the collision and is gone; this reader reports `a` without a `learnedAt` rather
 *   than reporting the colliding entry as if it were `a`'s timestamp.
 * - `a.learnedAt` learned, then `a` → `{a: {learnedAt, sourceItemUuid}}`. `a.learnedAt`
 *   is destroyed exactly as in the second case.
 *
 * This reader is therefore BEST-EFFORT repair. The complete fix is at the write
 * boundary — `RecipeManager` refuses a dotted recipe id at intake and
 * `CraftingSystemManager` refuses a dotted system id, per the `isSafeFlagKeySegment`
 * doctrine in `src/config/flags.js`. Repair exists for worlds that already carry one.
 *
 * An ENTRY IS SCALAR-ONLY. Every writer stamps only scalar fields, and the walk relies
 * on that: a plain-object-valued field added to an entry would be walked as a nested
 * recipe id and dropped from the entry view. `tests/recipe-visibility-service.test.js`
 * pins that contract against the real learn paths.
 */

import { isSafeFlagKeySegment } from '../config/flags.js';

/** Marker fields identifying one `learnedRecipes` entry (`RecipeVisibilityService`). */
export const LEARNED_RECIPE_ENTRY_FIELDS = Object.freeze(['learnedAt', 'sourceItemUuid']);

/** Marker fields identifying one `discoveryProgress` entry (`_getDiscoveryProgress`). */
export const DISCOVERY_PROGRESS_ENTRY_FIELDS = Object.freeze([
  'progress',
  'fragments',
  'discoveredAt',
  'manuallySet',
]);

// Matches Foundry's own `expandObject` recursion bound, so a map this reader accepts is
// one Foundry could have written.
const MAX_DEPTH = 32;

// A container the expansion could have created. Arrays are deliberately excluded: a
// `discoveryProgress` entry's `fragments` is an array and is an entry FIELD, never a
// nested id segment.
function isPlainRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEntryShaped(node, entryFields) {
  return entryFields.some((field) => Object.prototype.hasOwnProperty.call(node, field));
}

// The entry itself, without the children that are really nested recipe ids. Every
// non-record own field is kept rather than only the marker fields, so a future scalar
// field on an entry survives a retained-map rebuild instead of being silently dropped.
function entryView(node) {
  const entry = {};
  for (const [key, value] of Object.entries(node)) {
    if (!isPlainRecord(value)) entry[key] = value;
  }
  return entry;
}

function walk(node, prefix, entryFields, out, depth) {
  if (depth > MAX_DEPTH) return;
  // The root map is a container, never an entry, however its keys are spelled.
  const nodeIsEntry = prefix !== '' && isEntryShaped(node, entryFields);
  if (nodeIsEntry) out.set(prefix, entryView(node));
  for (const [key, value] of Object.entries(node)) {
    const id = prefix === '' ? key : `${prefix}.${key}`;
    if (isPlainRecord(value)) {
      walk(value, id, entryFields, out, depth + 1);
      continue;
    }
    // A scalar under a container is a legacy non-object entry (the pre-object
    // `{ id: true }` shape), which `Object.keys` used to surface and which must keep
    // being surfaced. A scalar under an ENTRY is one of that entry's own fields.
    if (!nodeIsEntry) out.set(id, value);
  }
}

/**
 * Recover the `recipeId -> entry` view of a recipe-id-keyed flag map, whatever depth
 * `expandObject` nested it to.
 *
 * A key written flat (`{'a.b': entry}`) and the same id written nested
 * (`{a: {b: entry}}`) both resolve to the id `a.b`, so a world that somehow holds both
 * shapes at once reads coherently; where they collide the later key in iteration order
 * wins, which is the same rule the persisted write itself applied.
 *
 * @param {object|null|undefined} map The raw flag map as read back off the actor.
 * @param {readonly string[]} entryFields Marker fields identifying one entry.
 * @returns {Map<string, *>} Insertion-ordered `id -> entry`; empty for a non-object map.
 */
export function readNestedFlagEntries(map, entryFields) {
  const out = new Map();
  if (!isPlainRecord(map)) return out;
  walk(map, '', entryFields, out, 0);
  return out;
}

/**
 * The `recipeId -> { learnedAt, sourceItemUuid }` view of an actor's `learnedRecipes`.
 *
 * @param {object|null|undefined} learnedMap
 * @returns {Map<string, *>}
 */
export function readLearnedRecipeEntries(learnedMap) {
  return readNestedFlagEntries(learnedMap, LEARNED_RECIPE_ENTRY_FIELDS);
}

/**
 * The `recipeId -> { progress, fragments, discoveredAt, manuallySet }` view of an
 * actor's `discoveryProgress`.
 *
 * @param {object|null|undefined} discoveryMap
 * @returns {Map<string, *>}
 */
export function readDiscoveryProgressEntries(discoveryMap) {
  return readNestedFlagEntries(discoveryMap, DISCOVERY_PROGRESS_ENTRY_FIELDS);
}

/**
 * Whether one id can be removed by a batched `-=<id>` deletion key WITHOUT destroying
 * anything else, or whether it has to route to the two-step delete-then-rebuild.
 *
 * Two things disqualify it, and the second is NOT the dotted-id case (issue 1143):
 *
 * 1. The id is not a safe flag-key segment, so `-=<id>` cannot address it at all —
 *    `expandObject` re-splits the deletion key and it lands somewhere else entirely.
 * 2. Another entry NESTS INSIDE it. Ids `a` and `a.b` are persisted as
 *    `{a: {learnedAt, sourceItemUuid, b: {…}}}`, so `-=a` is a perfectly well-formed
 *    deletion key that removes the whole node — recipe `a.b` included. `a` is a safe
 *    segment, so a safe/unsafe test alone waves this straight through and destroys a
 *    surviving learner's entry exactly as the top-level id derivation did.
 *
 * The check is deliberately conservative about (2): it disqualifies the id whenever any
 * descendant entry exists, even one the same call is also clearing. The rebuild path
 * handles that case correctly too, so the only cost is taking the heavier write.
 *
 * @param {Map<string, *>} entries The current entry view of the whole map.
 * @param {string} id
 * @returns {boolean}
 */
export function isDirectlyDeletableId(entries, id) {
  if (!isSafeFlagKeySegment(id)) return false;
  const descendantPrefix = `${id}.`;
  for (const key of entries.keys()) {
    if (key !== id && key.startsWith(descendantPrefix)) return false;
  }
  return true;
}

/**
 * Rebuild a flat `{ id: entry }` map from a retained entry view, ready to hand back to
 * `setFabricateFlag`. A dotted id re-splits on that write exactly as the original write
 * did, which is the documented fidelity limit — the invariant this preserves is that no
 * SURVIVING entry is destroyed, not that a dotted id round-trips normalized.
 *
 * @param {Map<string, *>|Iterable<[string, *]>} entries
 * @returns {object}
 */
export function buildFlagMapFromEntries(entries) {
  return Object.fromEntries(entries);
}
