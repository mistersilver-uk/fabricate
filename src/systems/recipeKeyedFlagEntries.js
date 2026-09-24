/**
 * Read a recipe-id-keyed actor flag map (`learnedRecipes`, `discoveryProgress`) back at its ENTRY
 * boundary (issue 1143): `Document#update` stores a dotted id as a subtree on V13 and V14 alike, so
 * ids come from the entries' marker fields, never the top level, `flattenObject` or known-id
 * matching. Repair is best-effort and entries are scalar-only; `recipe-visibility/spec.md`
 * § Reading a recipe-id-keyed flag map owns the rules, both builds' routes and the lost shapes.
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

// Foundry's own `expandObject` recursion bound, so an accepted map is one Foundry could write.
const MAX_DEPTH = 32;

// Foundry's `getType(v) === "Object"` test, which decides whether `expandObject` recurses: an array
// (a discovery entry's `fragments`) or a class instance is an entry field, never an id segment.
function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isEntryShaped(node, entryFields) {
  return entryFields.some((field) => Object.prototype.hasOwnProperty.call(node, field));
}

// The entry without its nested-id children; every other own field is kept, so a future scalar
// field survives a retained-map rebuild.
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
    // A scalar under a container is a legacy `{ id: true }` entry, still surfaced; a scalar under
    // an ENTRY is one of its own fields.
    if (!nodeIsEntry) out.set(id, value);
  }
}

/**
 * The insertion-ordered `recipeId -> entry` view at any nesting depth: flat `{'a.b': e}` and nested
 * `{a: {b: e}}` both read as `a.b`, the later key winning a collision as the write did.
 */
export function readNestedFlagEntries(map, entryFields) {
  const out = new Map();
  if (!isPlainRecord(map)) return out;
  walk(map, '', entryFields, out, 0);
  return out;
}

export function readLearnedRecipeEntries(learnedMap) {
  return readNestedFlagEntries(learnedMap, LEARNED_RECIPE_ENTRY_FIELDS);
}

export function readDiscoveryProgressEntries(discoveryMap) {
  return readNestedFlagEntries(discoveryMap, DISCOVERY_PROGRESS_ENTRY_FIELDS);
}

/**
 * Whether a batched per-id forced deletion removes `id` without destroying anything else, or it
 * must take the delete-then-rebuild route: not when `id` is no safe flag-key segment, and not when
 * another entry nests inside it (`a.b` under `a`), even one the same call also clears.
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
 * A flat `{ id: entry }` map for `setFabricateFlag`. A dotted id re-splits on that write, so the
 * invariant kept is that no surviving entry is destroyed, not that the id round-trips.
 */
export function buildFlagMapFromEntries(entries) {
  return Object.fromEntries(entries);
}
