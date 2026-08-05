/**
 * Dotted-path traversal, shared (issue 1024).
 *
 * Five hand-rolled walkers existed before this module: two private ones in
 * `currencyProfile.js` and `runFlagInvalidation.js`, one inline in
 * `SvelteCraftingSystemManagerApp.svelte.js`, one in `componentStacking.js`, and
 * `characterPrerequisites.js`'s `resolveRollDataPath`. The last one stays where it is
 * on purpose — it strips a leading `@` (a roll-data UI affordance that means nothing
 * anywhere else) — so this consolidates the other four into two exported functions
 * plus a setter.
 *
 * Traversal mirrors `foundry.utils.getProperty`/`hasProperty` semantics so the modules
 * converted onto it behave identically, but it never touches a Foundry global:
 * `src/models/IngredientSet.js` is (transitively) a consumer and
 * `openspec/specs/data-models/spec.md:1328` commits the ingredient model to being
 * Foundry-free.
 */

/**
 * Split a dotted path into its segments, rejecting anything that is not a usable path.
 *
 * @param {unknown} path Dotted path.
 * @returns {string[]} The segments, or `[]` when the path is unusable.
 */
export function pathSegments(path) {
  if (typeof path !== 'string') return [];
  const trimmed = path.trim();
  if (trimmed === '') return [];
  return trimmed.split('.');
}

/**
 * Read a dotted path out of an object.
 *
 * A path containing a dot is first tried as a LITERAL own key, matching
 * `foundry.utils.getProperty`. That is what makes this correct against a flattened
 * Foundry update payload (`{ 'system.quantity': 19 }`) as well as against a document.
 *
 * @param {unknown} target Object to read from.
 * @param {unknown} path Dotted path.
 * @returns {*} The resolved value, or `undefined` when any segment is missing.
 */
export function getByPath(target, path) {
  if (target === null || typeof target !== 'object') return;
  const segments = pathSegments(path);
  if (segments.length === 0) return;
  if (segments.length > 1 && Object.hasOwn(target, path)) return target[path];
  let current = target;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return;
    current = current[segment];
  }
  return current;
}

/**
 * Whether every segment of a dotted path is PRESENT on an object.
 *
 * Presence, not truthiness and not a value test: a key explicitly holding `undefined`
 * counts, exactly as `foundry.utils.hasProperty` does. This is the semantic
 * `runFlagInvalidation.js` needs, where a change diff carries the touched paths.
 *
 * @param {unknown} target Object to probe.
 * @param {unknown} path Dotted path.
 * @returns {boolean} True when the whole path exists.
 */
export function hasByPath(target, path) {
  const segments = pathSegments(path);
  if (segments.length === 0) return false;
  let current = target;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || !(segment in current)) return false;
    current = current[segment];
  }
  return true;
}

/**
 * Write a value at a dotted path, CREATING the intermediate objects it needs.
 *
 * Creating intermediates is load-bearing rather than a convenience. The item-creation
 * call sites build their payload into a fresh `{ system: {} }` literal (or a
 * `toObject()` clone) and then set the stack quantity on it; a reducer-shaped setter
 * that only walks existing keys would silently no-op on any path of three segments or
 * more, leaving the created item with NO quantity at all — after which every read falls
 * back to one and the consume path's delete branch fires on the first unit taken.
 *
 * A non-object value sitting in the middle of the path is REPLACED by a fresh object,
 * because there is no meaningful way to nest under a number or a string.
 *
 * @param {object} target Object to write into (mutated in place).
 * @param {unknown} path Dotted path.
 * @param {*} value Value to write.
 * @returns {object} The same `target`.
 */
export function setByPath(target, path, value) {
  if (target === null || typeof target !== 'object') return target;
  const segments = pathSegments(path);
  if (segments.length === 0) return target;
  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = current[segment];
    if (next === null || typeof next !== 'object') current[segment] = {};
    current = current[segment];
  }
  current[segments.at(-1)] = value;
  return target;
}
