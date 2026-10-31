/**
 * The published component seam's prop kinds (issue 2451): each shipped kind's copier, the
 * `callback` and `aria` kinds' among them (issue 2452) and the `value` kind's (issue 2453), and the
 * validated copy of the props one mount or update renders. Plain JS with no Svelte import, so the
 * seam and its tests read it without Svelte.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
import { changeKeys, isValuePrimitive } from './publishedComponentValues.js';

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

/**
 * The rest name an entry stating `tooltip: true` also refuses: Foundry pins a copy of a tooltip it
 * opens on a `data-locked` element, and the control's own closes never reach that copy.
 */
export const RESERVED_ON_A_TOOLTIP = /^data-locked$/;

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

/**
 * One `aria` value. It accepts a string, number or boolean as passed, and `undefined` as absent,
 * which writes no attribute. It refuses a function with M10 and any other type (an object, an
 * array, `null`, a symbol or a bigint) with M13, `"<key>" must be a string, number or boolean`.
 * No value is coerced here, because the host writes it as the attribute's value, so `false` is
 * written as `"false"`.
 */
function copyAria(value, key) {
  if (typeof value === 'function') throw refuseFunction(key);
  if (value !== undefined && !ATTRIBUTE_TYPES.has(typeof value)) {
    throw refuse(`"${key}" must be a string, number or boolean`);
  }
  return value;
}

/** One `value` value: a string, number, boolean or `null` as passed, `undefined` as absent, a function M10, else M20. */
function copyValue(value, key) {
  if (typeof value === 'function') throw refuseFunction(key);
  if (value !== undefined && !isValuePrimitive(value)) {
    throw refuse(`"${key}" must be a string, number, boolean or null`);
  }
  return value;
}

/**
 * The per-item members the seam drops from a copy of a published `data` value, each as
 * `<Entry>.<key>.<member>`: the entry's `data` key, then any members that hold the items below it
 * (an array is read item by item, an object as one item), then the member dropped. A component
 * that spreads such a member as attributes would otherwise let a caller write them.
 * `tests/published-component-ratchet.test.js` holds this list against the spreads the published
 * closures draw.
 */
export const STRIPPED_ITEM_MEMBERS = Object.freeze([
  'InfoStrip.facts.props',
  'ActionMenu.items.data',
]);

const STRIPPED_PATHS = Map.groupBy(
  STRIPPED_ITEM_MEMBERS.map((spec) => {
    const [entry, key, ...path] = spec.split('.');
    return { id: `${entry}.${key}`, path };
  }),
  ({ id }) => id
);

/**
 * `value` with the member that `path` ends at dropped from each item it holds, as a new tree. An
 * array is read item by item and an object as one item; a value that is not an array or a plain
 * object (a primitive, `null`) is returned as it is.
 */
export function withoutMember(value, path) {
  if (Array.isArray(value)) return value.map((item) => withoutMember(item, path));
  if (!hasPlainPrototype(value)) return value;
  const [head, ...below] = path;
  const copy = {};
  for (const [name, field] of Object.entries(value)) {
    if (name === head && below.length === 0) continue;
    const kept = name === head ? withoutMember(field, below) : field;
    Object.defineProperty(copy, name, { value: kept, enumerable: true, writable: true });
  }
  return copy;
}

/**
 * The only per-item members the seam passes from a published `data` value, each as `<Entry>.<key>`.
 * It names a key whose component draws a member the published form does not state, such as a
 * `FillBar` share's inline `color`, which no attribute spread carries and so no stripped row can name.
 */
export const ALLOWED_ITEM_MEMBERS = Object.freeze({
  'FillBar.shares': Object.freeze(['weight', 'tone']),
});

/**
 * `value` with each item reduced to the members `allowed` names, as a new tree. An array is read item
 * by item and an object as one item; a value that is not an array or a plain object is returned as it is.
 */
export function onlyMembers(value, allowed) {
  if (Array.isArray(value)) return value.map((item) => onlyMembers(item, allowed));
  if (!hasPlainPrototype(value)) return value;
  const copy = {};
  for (const name of allowed) {
    if (!Object.hasOwn(value, name)) continue;
    Object.defineProperty(copy, name, {
      value: value[name],
      enumerable: true,
      writable: true,
    });
  }
  return copy;
}

/**
 * The values the seam withholds from a published `data` key, each as `<Entry>.<key>.<value>`: the
 * component draws them for Fabricate's own callers alone, so the seam passes `undefined` in their
 * place and the key draws its default (issue 2849).
 */
export const WITHHELD_VALUES = Object.freeze(['SearchField.density.compact']);
const WITHHELD = new Set(WITHHELD_VALUES);

/**
 * The validated copy of one `data` value, less the per-item members `STRIPPED_ITEM_MEMBERS` names
 * and holding only those `ALLOWED_ITEM_MEMBERS` names, or `undefined` for a withheld value.
 */
function strippedCopy(entry, key, value) {
  const id = `${entry.name}.${key}`;
  if (typeof value === 'string' && WITHHELD.has(`${id}.${value}`)) return;
  const kept = (STRIPPED_PATHS.get(id) ?? []).reduce(
    (copy, { path }) => withoutMember(copy, path),
    value
  );
  const allowed = ALLOWED_ITEM_MEMBERS[id];
  return allowed ? onlyMembers(kept, allowed) : kept;
}

/** Each shipped prop kind's copier; registration refuses a kind this table does not hold. */
export const SHIPPED_KINDS = Object.freeze({
  data: (value, key) => copyData(value, key, new Set()),
  text: copyText,
  slot: copySlot,
  callback: copyCallback,
  aria: copyAria,
  value: copyValue,
});

/** M13: a rest key is a data attribute holding a scalar, and no name the entry reserves. */
function assertRestKey(entry, key, value) {
  if (!(DATA_ATTRIBUTE.test(key) && ATTRIBUTE_TYPES.has(typeof value))) {
    throw refuse(`"${key}" is not a data attribute`);
  }
  const reserved =
    RESERVED_ON_A_CONTROL.test(key) || (entry.tooltip === true && RESERVED_ON_A_TOOLTIP.test(key));
  if (entry.restOn === 'control' && reserved) {
    throw refuse(`"${key}" is reserved on ${entry.name}`);
  }
}

/** A key's kind: its entry's, `callback` for a value key's synthesised change key, else `null`. */
function kindOf(entry, key) {
  if (Object.hasOwn(entry.props, key)) return entry.props[key].kind;
  return Object.hasOwn(changeKeys(entry), key) ? 'callback' : null;
}

/**
 * M9 over a validated copy, in manifest order: a `required` key absent or `''`, or a `requiredWhen`
 * one so while the data key it names is truthy (issue 2452).
 */
function assertRequired(entry, copy) {
  for (const [key, spec] of Object.entries(entry.props)) {
    if (copy[key] !== undefined && copy[key] !== '') continue;
    if (spec.required === true) throw refuse(`${entry.name} requires a non-empty "${key}"`);
    const guard = spec.requiredWhen;
    if (guard !== undefined && copy[guard]) {
      throw refuse(`${entry.name} requires a non-empty "${key}" when "${guard}" is truthy`);
    }
  }
}

const WORDS =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

/**
 * `text` as a listener hears it, for M22: NFKC normalised and case folded, then its words and
 * symbols in order, each a run of letters, marks and digits or one symbol; punctuation and spacing
 * are dropped. Words are split by `Intl.Segmenter`, so a word inside unspaced CJK text stands
 * alone; a runtime without it splits on spacing, so such a label is refused rather than passed.
 */
export function spokenTokens(text) {
  const folded = text.normalize('NFKC').toLowerCase();
  const pieces = WORDS
    ? Array.from(WORDS.segment(folded), ({ segment }) => segment)
    : folded.split(/\s+/u);
  return pieces.flatMap((piece) => piece.match(/[\p{L}\p{M}\p{N}]+|\p{S}/gu) ?? []);
}

/** Whether `name`'s tokens hold `label`'s as one contiguous run of whole tokens. */
export function containsLabel(name, label) {
  const [heard, shown] = [spokenTokens(name), spokenTokens(label)];
  return (
    heard.some(
      (_, start) =>
        start + shown.length <= heard.length &&
        shown.every((token, offset) => heard[start + offset] === token)
    ) || shown.length === 0
  );
}

/**
 * M22 over a validated copy, after M9: a key stating `contains` whose non-blank string does not
 * hold the text of the `text` key it names, as a name must hold its visible label (WCAG 2.5.3).
 */
function assertContains(entry, copy) {
  for (const [key, { contains }] of Object.entries(entry.props)) {
    const [name, text] = [copy[key], copy[contains]];
    if (contains === undefined || typeof name !== 'string' || typeof text !== 'string') continue;
    if (name.trim() && !containsLabel(name, text)) {
      const tail = `(${JSON.stringify(text)} is not in ${JSON.stringify(name)})`;
      throw refuse(`"${key}" must contain the text of "${contains}" ${tail}`);
    }
  }
}

/**
 * The validated copy one mount or update renders: M7, M8, M10-M15, M17 and M20, then M9 and M22.
 * A `data` value in it lacks the members `STRIPPED_ITEM_MEMBERS` names, and the caller's own object
 * is never changed. Each key is configurable, so the seam can drop an absent callback key from it.
 */
export function copyProps(entry, props) {
  if (!hasPlainPrototype(props)) throw refuse('props must be a plain object');
  const copy = {};
  for (const [key, raw] of Object.entries(props)) {
    const kind = kindOf(entry, key);
    if (!kind && !entry.rest) throw refuse(`"${key}" is not a prop of ${entry.name}`);
    const copied = SHIPPED_KINDS[kind ?? 'data'](raw, key);
    if (!kind) assertRestKey(entry, key, copied);
    const value = kind === 'data' ? strippedCopy(entry, key, copied) : copied;
    const own = { value, enumerable: true, writable: true, configurable: true };
    Object.defineProperty(copy, key, own);
  }
  assertRequired(entry, copy);
  assertContains(entry, copy);
  return copy;
}
