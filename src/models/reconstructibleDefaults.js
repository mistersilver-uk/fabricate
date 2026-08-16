/**
 * The shared machinery behind every "omitted when default" serialization table
 * (issues 1087, 1135).
 *
 * A model that is rewritten whole on every mutation pays for each always-emitted default
 * once per instance, on every world-setting write, every socket replication, and both
 * `JSON.stringify` passes of `RecipeManager.reload()`'s change comparison. Dropping a key
 * whose absence the constructor rebuilds to the identical value is therefore a pure
 * WRITE-side reduction: no migration, no downgrade loss, and no change to what any stored
 * payload means.
 *
 * It is legitimate only where NO reader distinguishes absence from the written default,
 * which is a property of the READERS and is audited per field rather than inferred from the
 * constructor (see `openspec/specs/data-models/spec.md`, Recipe requirement 18).
 *
 * This module holds the filter and the predicate vocabulary so the three tables that use it
 * — `RECIPE_OMITTED_WHEN_DEFAULT`, `INGREDIENT_SET_OMITTED_WHEN_DEFAULT` and
 * `INGREDIENT_OMITTED_WHEN_DEFAULT` — cannot drift into three subtly different copies of the
 * same seven lines.
 *
 * Dependency-free by design: it is copied RAW into the hand-rolled mounted-component
 * harnesses alongside the models that import it, where an uncopied transitive import HANGS
 * the suite rather than failing it.
 */

/** @returns {boolean} whether `value` is an array holding nothing. */
export const isEmptyArray = (value) => Array.isArray(value) && value.length === 0;

/** @returns {boolean} whether `value` is exactly `null`. */
export const isNull = (value) => value === null;

/** @returns {boolean} whether `value` is exactly `false`. */
export const isFalse = (value) => value === false;

/** @returns {boolean} whether `value` is the empty string. */
export const isEmptyString = (value) => value === '';

/**
 * @returns {boolean} whether `value` is a plain object carrying no own keys — the shape a
 *   `data.x || {}` constructor default rebuilds from absence.
 */
export const isEmptyMap = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;

/**
 * Drop every key of a serialized payload whose value is the one the constructor rebuilds
 * from absence.
 *
 * Implemented as a FILTER over the caller's key order rather than as a rebuilt object
 * literal, so the serialized text of an unchanged model is stable across calls — which
 * `RecipeManager.reload()` relies on, detecting change by stringify comparison.
 *
 * @param {Record<string, unknown>} payload
 * @param {Record<string, (value: unknown) => boolean>} omittedWhenDefault
 * @returns {Record<string, unknown>}
 */
export function omitReconstructibleDefaults(payload, omittedWhenDefault) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (omittedWhenDefault[key]?.(value)) continue;
    out[key] = value;
  }
  return out;
}
