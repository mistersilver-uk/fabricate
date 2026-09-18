/** One implementation of each scalar helper this codebase kept redefining. */

/** Whether `value` is a non-null, non-array object. */
export function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** A deep copy through JSON, preserving `undefined` rather than throwing on it. */
export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** `value` trimmed if it is a string, and the empty string otherwise. */
export function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** A tag reduced to its comparable form: trimmed and lower-cased. */
export function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/** A list of tags, de-duplicated and emptied of blanks, accepting a bare tag as a one-item list. */
export function normalizeTagList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => normalizeTag(entry)).filter(Boolean))];
}

/**
 * A condition identifier reduced to its slug: lower-case, non-alphanumerics collapsed to hyphens.
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

/** A finite number, or `null` for nullish, empty-string and non-finite input. */
export function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A finite number, or `null`; `null` and `''` become `0`, because `Number(null)` and `Number('')` are `0`. */
export function laxNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** `value` stringified and trimmed, and the empty string for nullish input. */
export function stringOrEmpty(value) {
  return value == null ? '' : String(value).trim();
}

/** `value` stringified without trimming, and the empty string for nullish input. */
export function untrimmedStringOrEmpty(value) {
  return value == null ? '' : String(value);
}

/** `value` stringified and trimmed, and `null` for nullish or blank input. */
export function stringOrNull(value) {
  return value == null ? null : String(value).trim() || null;
}

/** `value` stringified without trimming, and `null` for nullish or empty input. */
export function untrimmedStringOrNull(value) {
  const text = untrimmedStringOrEmpty(value);
  return text.length > 0 ? text : null;
}

/** `value` trimmed when it is a string, and `null` for a blank string or any non-string. */
export function trimStringOrNull(value) {
  return trimString(value) || null;
}

/** `value` when it is an array, and an empty array otherwise. */
export function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

/** An array as-is, `[]` for nullish, `[value]` otherwise — admitting the `0` and `''` that `normalizeIdList`'s falsy wrap drops. */
export function arrayOrWrapped(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

/** A plain array from an array, a `Map`, a `.values()` source or any iterable, and `[]` otherwise. */
export function iterableToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (typeof value.values === 'function') return [...value.values()];
  if (typeof value[Symbol.iterator] === 'function') return [...value];
  return [];
}

/** De-duplicated trimmed ids, accepting a bare truthy value as a one-item list and dropping blanks. */
export function normalizeIdList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => stringOrEmpty(entry)).filter(Boolean))];
}

/** De-duplicated trimmed ids from an array's string entries only; `normalizeIdList` stringifies the rest. */
export function stringOnlyIdList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ];
}
