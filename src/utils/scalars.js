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
