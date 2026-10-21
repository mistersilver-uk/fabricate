/**
 * The published component seam's `value` kind (issue 2453): the change callback each value key
 * synthesises, the registration checks on an entry's value keys, and what one mount or update
 * hands the host. Plain JS with no import, as the prop kinds are.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean']);
const derived = new WeakMap();

/** Whether `value` is one a `value` key holds: a string, number, boolean or `null`. */
export const isValuePrimitive = (value) => value === null || PRIMITIVE_TYPES.has(typeof value);

/** The callback a value key synthesises: `on`, the key with its first letter upper-cased, `Change`. */
export const changeKeyOf = (key) => `on${key[0].toUpperCase()}${key.slice(1)}Change`;

const valueKeysOf = (entry) =>
  Object.keys(entry.props).filter((key) => entry.props[key].kind === 'value');

/** The frozen `{ on<Key>Change: <key> }` of an entry's value keys, derived once per entry. */
export function changeKeys(entry) {
  let keys = derived.get(entry);
  if (!keys) {
    keys = Object.freeze(
      Object.fromEntries(valueKeysOf(entry).map((key) => [changeKeyOf(key), key]))
    );
    derived.set(entry, keys);
  }
  return keys;
}

/**
 * The first rule an entry's value keys break, as a message tail naming the entry, or `null`: an
 * `initial` that is not a primitive, or a synthesised name the entry lists as a key of its own.
 */
export function valueEntryFault(entry) {
  for (const key of valueKeysOf(entry)) {
    if (!isValuePrimitive(entry.props[key].initial)) {
      return `${entry.name} "${key}" has an initial that is not a string, number, boolean or null`;
    }
    const change = changeKeyOf(key);
    if (Object.hasOwn(entry.props, change)) {
      return `${entry.name} "${change}" collides with the change callback of "${key}"`;
    }
  }
  return null;
}

/**
 * Moves each value key out of `props`, a validated copy, and answers those it held other than
 * `undefined`, so an `update` that omits one keeps the current value.
 */
export function takeValues(entry, props) {
  const taken = {};
  for (const key of valueKeysOf(entry)) {
    if (props[key] !== undefined) taken[key] = props[key];
    delete props[key];
  }
  return taken;
}

/** The value of each key a mount starts with: the one passed, else the entry's `initial`. */
export function seedValues(entry, taken) {
  return Object.fromEntries(
    valueKeysOf(entry).map((key) => [
      key,
      Object.hasOwn(taken, key) ? taken[key] : entry.props[key].initial,
    ])
  );
}

/** The host's record after an update: `held` itself when every taken value equals its own. */
export function keepCurrent(held, taken) {
  const changed = Object.keys(taken).some((key) => !Object.is(held[key], taken[key]));
  return changed ? { ...held, ...taken } : held;
}
