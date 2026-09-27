/**
 * Foundry's `foundry.utils.expandObject`, which every `Document#update` applies to its changes
 * before merging them: a plain object's dotted keys expand recursively into nested objects,
 * arrays are mapped, and any other value (an operator instance included) is returned as is.
 */

function isPlainRecord(value) {
  return Object.prototype.toString.call(value) === '[object Object]' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function setDotted(target, key, value) {
  const segments = key.split('.');
  const leaf = segments.pop();
  let node = target;
  for (const segment of segments) {
    if (!isPlainRecord(node[segment])) node[segment] = {};
    node = node[segment];
  }
  node[leaf] = value;
}

export function expandObject(value, depth = 0) {
  if (depth > 32) throw new Error('Maximum object expansion depth exceeded');
  if (!value) return value;
  if (Array.isArray(value)) return value.map((inner) => expandObject(inner, depth + 1));
  if (!isPlainRecord(value)) return value;
  const expanded = {};
  for (const [key, inner] of Object.entries(value)) {
    setDotted(expanded, key, expandObject(inner, depth + 1));
  }
  return expanded;
}
