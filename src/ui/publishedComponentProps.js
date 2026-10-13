/**
 * The published component seam's prop kinds (issue 2451): each shipped kind's copier, and the
 * validated copy of the props one mount or update renders. Plain JS with no import, so the seam
 * and its tests read it without Svelte.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
export const PREFIX = 'Fabricate | published components: ';
const DATA_ATTRIBUTE = /^data-[a-z0-9-]+$/;
const ATTRIBUTE_TYPES = new Set(['string', 'number', 'boolean']);

export const refuse = (message) => new TypeError(PREFIX + message);

// One step from a null prototype, so a null-prototype or cross-realm plain object passes.
function hasPlainPrototype(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** A deep copy of one prop value, refusing functions (M10), non-data (M11) and cycles (M12). */
function copyData(value, key, ancestors) {
  if (typeof value === 'function') throw refuse('functions are phase 2 (issue 2427)');
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw refuse(`"${key}" holds a cycle`);
  const isArray = Array.isArray(value);
  if (!isArray && !hasPlainPrototype(value)) throw refuse(`"${key}" must be data`);
  ancestors.add(value);
  const copy = isArray ? value.map((item) => copyData(item, key, ancestors)) : {};
  if (!isArray) {
    for (const [name, item] of Object.entries(value)) {
      const field = copyData(item, key, ancestors);
      Object.defineProperty(copy, name, { value: field, enumerable: true, writable: true });
    }
  }
  ancestors.delete(value);
  return copy;
}

/** One `text` value: a string as passed, `undefined` as absent, a function M10, else M14. */
function copyText(value, key) {
  if (typeof value === 'function') throw refuse('functions are phase 2 (issue 2427)');
  if (value !== undefined && typeof value !== 'string') throw refuse(`"${key}" must be a string`);
  return value;
}

/** One `slot` value: a boolean as passed, `undefined` as absent, a function M10, else M15. */
function copySlot(value, key) {
  if (typeof value === 'function') throw refuse('functions are phase 2 (issue 2427)');
  if (value !== undefined && typeof value !== 'boolean') {
    throw refuse(`"${key}" is a slot and takes true or false`);
  }
  return value;
}

/** Each shipped prop kind's copier; registration refuses a kind this table does not hold. */
export const SHIPPED_KINDS = Object.freeze({
  data: (value, key) => copyData(value, key, new Set()),
  text: copyText,
  slot: copySlot,
});

/** The validated copy one mount or update renders: M7, M8, M10-M15, then M9. */
export function copyProps(entry, props) {
  if (!hasPlainPrototype(props)) throw refuse('props must be a plain object');
  const copy = {};
  for (const [key, raw] of Object.entries(props)) {
    const published = Object.hasOwn(entry.props, key);
    if (!published && !entry.rest) throw refuse(`"${key}" is not a prop of ${entry.name}`);
    const value = SHIPPED_KINDS[published ? entry.props[key].kind : 'data'](raw, key);
    if (!published && !(DATA_ATTRIBUTE.test(key) && ATTRIBUTE_TYPES.has(typeof value))) {
      throw refuse(`"${key}" is not a data attribute`);
    }
    Object.defineProperty(copy, key, { value, enumerable: true, writable: true });
  }
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.required === true && (copy[key] === undefined || copy[key] === '')) {
      throw refuse(`${entry.name} requires a non-empty "${key}"`);
    }
  }
  return copy;
}
