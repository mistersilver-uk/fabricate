/** Dotted-path traversal, shared (issue 1024). */

/** Split a dotted path into its segments, rejecting anything that is not a usable path. */
export function pathSegments(path) {
  if (typeof path !== 'string') return [];
  const trimmed = path.trim();
  if (trimmed === '') return [];
  return trimmed.split('.');
}

/** Read a dotted path out of an object. */
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

/** Whether every segment of a dotted path is PRESENT on an object. */
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

/** Write a value at a dotted path, CREATING the intermediate objects it needs. */
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
