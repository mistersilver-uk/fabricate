/**
 * @module revisionTokens
 *
 * The revision-token contract for crafting definitions (issue 1076, under #1070).
 *
 * Three sibling issues need to know "has this changed since I last looked?" without
 * re-deriving the answer from the corpus: #1074 (alchemy signature-report invalidation),
 * #1077 (inventory/knowledge snapshot identity) and #1078 (scoped invalidation routing).
 * The contract lives here, once, so those three do not invent three schemes.
 *
 * ## Who mints tokens
 *
 * The two runtime managers, and nobody else. `RecipeManager` mints the recipe scopes and
 * `CraftingSystemManager` mints the system scopes. A consumer READS tokens and compares
 * them; it never advances one. That asymmetry is the whole safety property: a token can
 * only be wrong if a manager failed to advance it, which is one bounded audit, rather than
 * if any of N consumers advanced it at the wrong moment, which is not.
 *
 * ## Granularity: both, deliberately
 *
 * Every mutation advances TWO scopes — the domain scope and the affected crafting system's
 * scope:
 *
 * | Scope                     | Advanced by                                                   |
 * |---------------------------|---------------------------------------------------------------|
 * | `recipes`                 | any recipe create / update / delete / import / changed reload  |
 * | `recipes:<systemId>`      | the same, for the system the recipe belongs to                 |
 * | `systems`                 | any crafting-system create / update / delete / import / reload |
 * | `system:<systemId>`       | the same, for that one system                                  |
 *
 * A consumer that caches per system (#1074's signature report, #1077's snapshots) watches
 * the narrow scope and is untouched by an edit in a different system. A consumer that
 * cannot attribute its cache to one system watches the domain scope. Publishing only the
 * narrow scope would force every such consumer to enumerate systems; publishing only the
 * domain scope would make one edit invalidate every system's cache, which is the
 * over-broad invalidation #1078 exists to remove. Both cost one integer.
 *
 * A recipe MOVED between systems advances the scopes of BOTH the system it left and the
 * system it joined, because a consumer watching the old system must also stop trusting its
 * cache.
 *
 * ## What a token IS
 *
 * A non-negative integer, monotonically increasing within one registry and one scope,
 * starting at `0` for a scope nothing has ever advanced.
 *
 * Its VALUE is meaningless. The only supported operation is `===` against a token the same
 * consumer read earlier from the same scope of the same registry. It is deliberately not a
 * hash, a timestamp, or a content digest:
 *
 * - a **hash** of the corpus is the `JSON.stringify`-the-whole-world pattern this contract
 *   replaces, and it costs O(corpus) to compute the thing you wanted to avoid computing;
 * - a **timestamp** is not monotonic across clients and collides at clock resolution;
 * - a **counter** is O(1) to advance, O(1) to compare, and cannot accidentally report
 *   "unchanged" for a change, which is the only failure direction that corrupts a cache.
 *
 * It is per-process and per-registry: it never crosses the wire, is never persisted, and
 * carries no meaning on another client. A remote edit reaches this client as a replicated
 * setting change, `reload()` runs, and the LOCAL token advances then — which is exactly
 * what a local consumer needs.
 *
 * ## How a no-change reload avoids advancing anything
 *
 * `reload()` is called from the `updateSetting` hook on every client including the writer,
 * whose in-memory map already holds the saved data. Both managers therefore have to answer
 * "did anything actually change?", and both used to answer it by running `JSON.stringify`
 * over the whole corpus TWICE per reload — 22.3 MB of string per pass at 10,000 recipes.
 *
 * {@link corpusChanged} replaces that. It compares record by record, takes a reference
 * fast path per record, short-circuits at the first difference, and never builds a whole-
 * corpus string. In the common no-change case on the writing client it still walks the
 * corpus — the persisted array was rebuilt, so the records are not reference-equal — but it
 * allocates one projection per record instead of one projection plus two 22 MB strings, and
 * in the common CHANGED case it stops at the first differing record instead of serializing
 * everything twice.
 */

/**
 * The canonical scope names. Use these rather than composing scope strings by hand: a
 * consumer watching `recipes-<id>` while a manager advances `recipes:<id>` is a cache that
 * never invalidates and no test would notice.
 */
export const REVISION_SCOPES = Object.freeze({
  /** Every recipe in the world. */
  recipes: 'recipes',
  /** Every crafting system in the world. */
  systems: 'systems',
  /**
   * The recipes belonging to one crafting system.
   *
   * @param {string|null|undefined} systemId
   * @returns {string}
   */
  recipesOfSystem: (systemId) => `recipes:${systemId ?? ''}`,
  /**
   * One crafting system's own definitions (components, tools, essences, recipe items).
   *
   * @param {string|null|undefined} systemId
   * @returns {string}
   */
  system: (systemId) => `system:${systemId ?? ''}`,
});

/**
 * A per-manager registry of monotonic revision counters, keyed by scope.
 *
 * Deliberately not a module-level singleton: two managers constructed in one test process
 * (which every fixture in this repository does) must not share counters, or one fixture's
 * mutation would invalidate another's cache and the resulting flake would be blamed on the
 * cache rather than on the registry.
 */
export class RevisionRegistry {
  constructor() {
    /** @type {Map<string, number>} */
    this._tokens = new Map();
  }

  /**
   * The current token of a scope.
   *
   * @param {string} scope
   * @returns {number} `0` for a scope nothing has advanced.
   */
  read(scope) {
    return this._tokens.get(scope) ?? 0;
  }

  /**
   * Advance one or more scopes. Passing every affected scope in one call is the intended
   * shape, because a mutation always affects the domain scope AND a system scope.
   *
   * A nullish scope is ignored, so a caller need not guard a system id it may not have.
   *
   * @param {...(string|null|undefined)} scopes
   * @returns {void}
   */
  advance(...scopes) {
    for (const scope of scopes) {
      if (scope == null) continue;
      this._tokens.set(scope, this.read(scope) + 1);
    }
  }

  /**
   * Whether a token a consumer read earlier is still current.
   *
   * @param {string} scope
   * @param {number|null|undefined} token
   * @returns {boolean} `false` for a token never read (so a cold consumer rebuilds).
   */
  isCurrent(scope, token) {
    return typeof token === 'number' && token === this.read(scope);
  }
}

/**
 * JSON-shaped deep equality, short-circuiting at the first difference.
 *
 * Matches `JSON.stringify` semantics closely enough that swapping it in for a string
 * comparison does not change which reloads report a change: `undefined` and function
 * values are treated as ABSENT (as `JSON.stringify` drops them from an object), and two
 * `NaN`s compare equal (both serialize to `null`). Everything else is `Object.is`.
 *
 * @param {*} left
 * @param {*} right
 * @returns {boolean}
 */
function jsonEquals(left, right) {
  if (left === right) return true;
  if (typeof left === 'number' && typeof right === 'number') {
    return Number.isNaN(left) && Number.isNaN(right);
  }
  if (left === null || right === null) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;

  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;
  if (leftIsArray) {
    if (left.length !== right.length) return false;
    for (const [index, entry] of left.entries()) {
      if (!jsonEquals(entry, right[index])) return false;
    }
    return true;
  }

  const leftKeys = presentKeys(left);
  const rightKeys = presentKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key)) return false;
    if (!jsonEquals(left[key], right[key])) return false;
  }
  return true;
}

/**
 * The own enumerable keys `JSON.stringify` would actually emit for an object.
 *
 * @param {object} value
 * @returns {string[]}
 */
function presentKeys(value) {
  return Object.keys(value).filter((key) => {
    const entry = value[key];
    return entry !== undefined && typeof entry !== 'function';
  });
}

/**
 * Whether two corpora differ, without serializing either one.
 *
 * The replacement for `JSON.stringify(before) !== JSON.stringify(after)` in both managers'
 * `reload()`. Three properties matter:
 *
 * 1. **Order is significant**, exactly as it was for the string comparison: the persisted
 *    array's order is the in-memory map's insertion order, and a reordering IS a change a
 *    consumer must see.
 * 2. **A reference-equal record is skipped**, so a backend that hands back the same objects
 *    costs one pointer comparison per record and nothing else.
 * 3. **It short-circuits.** The string comparison had to serialize everything before it
 *    could tell; this returns at the first differing record.
 *
 * @param {Iterable<object>} before
 * @param {Iterable<object>} after
 * @param {(record: object) => object} [project] Map a record to its comparable form —
 *   `(recipe) => recipe.toJSON()` for recipes, identity for already-plain systems.
 * @returns {boolean}
 */
export function corpusChanged(before, after, project = (record) => record) {
  const left = [...before];
  const right = [...after];
  if (left.length !== right.length) return true;
  for (const [index, record] of left.entries()) {
    if (record === right[index]) continue;
    if (!jsonEquals(project(record), project(right[index]))) return true;
  }
  return false;
}
