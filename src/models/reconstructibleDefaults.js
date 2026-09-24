/**
 * The filter behind every "omitted when default" table (issues 1087, 1135): a write-side reduction
 * with no migration and no change in meaning. A key is omittable only where no reader tells
 * absence from the default, audited per field (`data-models/spec.md` Recipe requirement 18).
 * Dependency-free: the mounted harnesses copy it raw, and a missing import cancels the suite.
 */

export const isEmptyArray = (value) => Array.isArray(value) && value.length === 0;

export const isNull = (value) => value === null;

export const isFalse = (value) => value === false;

export const isEmptyString = (value) => value === '';

export const isEmptyMap = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;

/** Drop every key whose value the constructor rebuilds from absence. */
export function omitReconstructibleDefaults(payload, omittedWhenDefault) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (omittedWhenDefault[key]?.(value)) continue;
    out[key] = value;
  }
  return out;
}
