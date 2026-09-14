/**
 * One implementation of each scalar helper this codebase kept redefining.
 *
 * Six names were declared 33 times across `src/`, and SonarCloud's duplication detector counts
 * every copy. What matters more than the count is that the copies were checked before they were
 * merged: of the eleven names issue #1662 lists, only these six are declared identically at every
 * site. The other five differ in ways that change behaviour, so they are NOT here — see
 * `tests/scalar-helper-duplicates.test.js`, which records each divergence rather than papering
 * over it.
 *
 * Foundry-free on purpose: domain code, migrations and UI all import this, and a Foundry global
 * reached from here would make the migration path untestable outside a live world.
 */

/**
 * Whether `value` is a non-null, non-array object.
 *
 * The test a migration uses before walking a payload's own keys. `null` is excluded because
 * `typeof null === 'object'`, and arrays because a caller that wanted one would have asked.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A deep copy through JSON, preserving `undefined` rather than throwing on it.
 *
 * The guard is load-bearing: `JSON.stringify(undefined)` returns `undefined`, and
 * `JSON.parse(undefined)` is a `SyntaxError`. `null` needs no guard — it round-trips to `null` —
 * which is why the three spellings that existed before this all agreed despite two of them
 * checking `== null` and one `=== undefined`.
 *
 * JSON, not `structuredClone`: every caller clones settings-shaped data that is about to be
 * written to a Foundry flag, so anything JSON cannot carry is already not allowed through.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * `value` trimmed if it is a string, and the empty string otherwise.
 *
 * NOT the same as `String(value ?? '').trim()`, which this repository also has under the name
 * `trimmed`: that one renders a number as its digits, where this answers `''`. Both are wanted in
 * their own call sites, so they keep separate names (issue #1662).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A tag reduced to its comparable form: trimmed and lower-cased.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/**
 * A list of tags, de-duplicated and emptied of blanks, accepting a bare tag as a one-item list.
 *
 * @param {unknown} value a tag, a list of tags, or nothing
 * @returns {string[]}
 */
export function normalizeTagList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => normalizeTag(entry)).filter(Boolean))];
}

/**
 * A condition identifier reduced to its slug: lower-case, non-alphanumerics collapsed to hyphens.
 *
 * Accepts an object and reads `id`, then `value`, then `label` from it, because callers hand this
 * either the identifier or the whole condition it came from.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeConditionId(value) {
  if (value && typeof value === 'object') {
    return normalizeConditionId(value.id ?? value.value ?? value.label);
  }
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .split('-')
    .filter(Boolean)
    .join('-');
}
