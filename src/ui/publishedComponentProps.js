/**
 * The published component seam's prop kinds (issue 2451): each shipped kind's copier, the
 * `callback` kind's among them (issue 2452), and the validated copy of the props one mount or
 * update renders. Plain JS with no import, so the seam and its tests read it without Svelte.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
export const PREFIX = 'Fabricate | published components: ';
const DATA_ATTRIBUTE = /^data-[a-z0-9-]+$/;
const ATTRIBUTE_TYPES = new Set(['string', 'number', 'boolean']);

/**
 * The rest names an entry whose `restOn` is `'control'` refuses, because each would replace the
 * control's own keyboard mark (`data-keyboard-focus`), or be read off the control by Foundry: a
 * window action on a press (`data-action`), a cursor at the next pointer release (`data-cursor`),
 * a tooltip on pointer entry (`data-tooltip` and every name that starts `data-tooltip-`); or
 * because Fabricate's own stylesheet reads it off its own buttons (`data-validation-focused`,
 * which draws the keyboard ring under a Fabricate root, and `data-essence-sort-direction`).
 */
export const RESERVED_ON_A_CONTROL =
  /^data-(?:keyboard-focus|action|cursor|validation-focused|essence-sort-direction|tooltip(?:-[a-z0-9-]*)?)$/;

export const refuse = (message) => new TypeError(PREFIX + message);

/** M10: a function anywhere but as the whole value of a `callback` key, named by its top-level key. */
const refuseFunction = (key) => refuse(`"${key}" must not hold a function`);

// One step from a null prototype, so a null-prototype or cross-realm plain object passes.
function hasPlainPrototype(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** A deep copy of one prop value, refusing a function at any depth (M10), non-data (M11) and cycles (M12). */
function copyData(value, key, ancestors) {
  if (typeof value === 'function') throw refuseFunction(key);
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
  if (typeof value === 'function') throw refuseFunction(key);
  if (value !== undefined && typeof value !== 'string') throw refuse(`"${key}" must be a string`);
  return value;
}

/** One `slot` value: a boolean as passed, `undefined` as absent, a function M10, else M15. */
function copySlot(value, key) {
  if (typeof value === 'function') throw refuseFunction(key);
  if (value !== undefined && typeof value !== 'boolean') {
    throw refuse(`"${key}" is a slot and takes true or false`);
  }
  return value;
}

/**
 * One `callback` value: a function by identity, `undefined` as absent, else M17. Tested with
 * `typeof`, so a function from another realm passes.
 */
function copyCallback(value, key) {
  if (value !== undefined && typeof value !== 'function') {
    throw refuse(`"${key}" must be a function`);
  }
  return value;
}

/** Each shipped prop kind's copier; registration refuses a kind this table does not hold. */
export const SHIPPED_KINDS = Object.freeze({
  data: (value, key) => copyData(value, key, new Set()),
  text: copyText,
  slot: copySlot,
  callback: copyCallback,
});

/** M13: a rest key is a data attribute holding a scalar, and no name the entry reserves. */
function assertRestKey(entry, key, value) {
  if (!(DATA_ATTRIBUTE.test(key) && ATTRIBUTE_TYPES.has(typeof value))) {
    throw refuse(`"${key}" is not a data attribute`);
  }
  if (entry.restOn === 'control' && RESERVED_ON_A_CONTROL.test(key)) {
    throw refuse(`"${key}" is reserved on ${entry.name}`);
  }
}

/**
 * The validated copy one mount or update renders: M7, M8, M10-M15 and M17, then M9. Each key is
 * configurable, so the seam can drop an absent callback key from it.
 */
export function copyProps(entry, props) {
  if (!hasPlainPrototype(props)) throw refuse('props must be a plain object');
  const copy = {};
  for (const [key, raw] of Object.entries(props)) {
    const published = Object.hasOwn(entry.props, key);
    if (!published && !entry.rest) throw refuse(`"${key}" is not a prop of ${entry.name}`);
    const value = SHIPPED_KINDS[published ? entry.props[key].kind : 'data'](raw, key);
    if (!published) assertRestKey(entry, key, value);
    const own = { value, enumerable: true, writable: true, configurable: true };
    Object.defineProperty(copy, key, own);
  }
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.required === true && (copy[key] === undefined || copy[key] === '')) {
      throw refuse(`${entry.name} requires a non-empty "${key}"`);
    }
  }
  return copy;
}
