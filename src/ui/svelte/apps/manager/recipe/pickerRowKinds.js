/**
 * The requirement row's kind table and its mapping to both persisted shapes. `KIND_META` holds a
 * kind's icon, tone and label key under the model's match type, for the row's plate, its kind
 * select and the kind menu; `toValue` / `fromValue` carry an ingredient option or a result entry
 * to and from the row's `value`. A tone is a class suffix, not a colour: the `is-<tone>` tint rules
 * are in `styles/fabricate.css`.
 */

/**
 * The kind order every surface offers.
 *
 * @type {ReadonlyArray<'component'|'tags'|'essence'|'currency'>}
 */
export const KIND_ORDER = Object.freeze(['component', 'tags', 'essence', 'currency']);

/**
 * Per kind: the Font Awesome glyph, the `is-<tone>` suffix its tint rules are written on, and
 * the localization key + English fallback for its one-word name.
 *
 * @type {Readonly<Record<string, { icon: string, tone: string, labelKey: string, label: string }>>}
 */
export const KIND_META = Object.freeze({
  component: Object.freeze({
    icon: 'fa-solid fa-cube',
    tone: 'component',
    labelKey: 'FABRICATE.Admin.Manager.Recipe.ComponentTypeLabel',
    label: 'Component',
  }),
  tags: Object.freeze({
    icon: 'fa-solid fa-tag',
    tone: 'tag',
    labelKey: 'FABRICATE.Admin.Manager.Recipe.TagTypeLabel',
    label: 'Tag',
  }),
  essence: Object.freeze({
    icon: 'fa-solid fa-flask-vial',
    tone: 'essence',
    labelKey: 'FABRICATE.Admin.Manager.Recipe.EssenceTypeLabel',
    label: 'Essence',
  }),
  currency: Object.freeze({
    icon: 'fa-solid fa-coins',
    tone: 'currency',
    labelKey: 'FABRICATE.Admin.Manager.Recipe.CurrencyTypeLabel',
    label: 'Currency',
  }),
});

/**
 * The meta for a match type, falling back to `component` — the kind a requirement is when it
 * says nothing else — rather than to undefined.
 *
 * @param {string} matchType a requirement option's `match.type`
 * @returns {{ icon: string, tone: string, labelKey: string, label: string }}
 */
export function kindMeta(matchType) {
  return KIND_META[matchType] || KIND_META.component;
}

/**
 * The kind menu's `ActionMenu` items: the offered `kinds` in table order, each carrying its glyph,
 * its tone and the `data-recipe-add="alternative-<tone>"` hook. The convert menu and a choice
 * group's adders both read this list, so the two state one subset in one order.
 *
 * @param {ReadonlyArray<string>} kinds the surface's offered match types
 * @param {(key: string, fallback: string) => string} [translate] the caller's localizer
 */
export function kindMenuItems(kinds, translate = (_key, fallback) => fallback) {
  return KIND_ORDER.filter((kind) => kinds.includes(kind)).map((kind) => {
    const { icon, tone, labelKey, label } = KIND_META[kind];
    const data = { 'data-recipe-add': `alternative-${tone}` };
    return { id: kind, label: translate(labelKey, label), icon, tone, data };
  });
}

const AMOUNT_ON_MATCH = new Set(['essence', 'currency']);
const SUBJECT_KEY = { component: 'componentId', essence: 'essenceId', currency: 'unit' };

/** Whether this table names `kind`; a row draws any other as a misconfiguration. */
export const isKnownKind = (kind) => Object.hasOwn(KIND_META, kind);

/** The amount a row shows: an absent or non-positive stored amount reads as 1. */
export const shownAmount = (stored) => (Number(stored) > 0 ? Number(stored) : 1);

function writtenAmount(typed) {
  const next = Number(typed);
  return Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1;
}

const isResult = (entry) =>
  Boolean(entry) && typeof entry.match !== 'object' && ('componentId' in entry || 'kind' in entry);

/**
 * The row's `value`, and the one statement of the kind mapping. Ingredient: kind is `match.type`,
 * subject `match.componentId | essenceId | unit`, amount `match.amount` for essence and currency,
 * else `quantity`. Result: kind is `kind` (absent is `component`), amount `quantity` beside
 * `quantityFormula`. Amounts pass through as stored.
 */
export function toValue(entry) {
  if (isResult(entry)) {
    const { kind = 'component', componentId, quantity, quantityFormula } = entry;
    return { kind, id: componentId || '', tags: [], tagMatch: 'any', quantity, quantityFormula };
  }
  const match = entry?.match ?? {};
  const kind = isKnownKind(match.type) ? match.type : 'component';
  return {
    kind,
    id: match.type === kind ? match[SUBJECT_KEY[kind]] || '' : '',
    tags: kind === 'tags' && Array.isArray(match.tags) ? match.tags : [],
    tagMatch: match.tagMatch === 'all' ? 'all' : 'any',
    quantity: AMOUNT_ON_MATCH.has(kind) ? match.amount : entry?.quantity,
  };
}

function retyped(entry, kind) {
  if (AMOUNT_ON_MATCH.has(kind)) {
    return { ...entry, quantity: 1, match: { type: kind, [SUBJECT_KEY[kind]]: '', amount: 1 } };
  }
  const match =
    kind === 'tags'
      ? { type: 'tags', tags: [], tagMatch: 'any' }
      : { type: 'component', componentId: null };
  return { ...entry, quantity: shownAmount(entry?.quantity), match };
}

function ingredientFrom(entry, before, value) {
  const { kind } = before;
  if (value.kind !== kind) return retyped(entry, value.kind);
  let next = entry;
  if (kind === 'tags') {
    if (
      JSON.stringify(value.tags) !== JSON.stringify(before.tags) ||
      value.tagMatch !== before.tagMatch
    ) {
      next = { ...next, match: { type: 'tags', tags: [...value.tags], tagMatch: value.tagMatch } };
    }
  } else if (value.id !== before.id) {
    const match = AMOUNT_ON_MATCH.has(kind)
      ? { type: kind, [SUBJECT_KEY[kind]]: value.id, amount: shownAmount(before.quantity) }
      : { type: 'component', componentId: value.id || null };
    next = { ...next, match };
  }
  if (value.quantity === before.quantity) return next;
  const amount = writtenAmount(value.quantity);
  if (!AMOUNT_ON_MATCH.has(kind)) return { ...next, quantity: amount };
  return { ...next, match: { type: kind, [SUBJECT_KEY[kind]]: value.id, amount } };
}

function resultFrom(entry, before, value) {
  if (value.kind !== before.kind) return entry;
  const next = { ...entry };
  if (value.id !== before.id) next.componentId = value.id || null;
  if (value.quantity !== before.quantity) next.quantity = writtenAmount(value.quantity);
  const formula = value.quantityFormula;
  if (formula === before.quantityFormula) return next;
  if (typeof formula === 'string' && formula.trim() !== '') next.quantityFormula = formula;
  else delete next.quantityFormula;
  return next;
}

/**
 * `entry` with the row's edited `value` merged onto it: only a field that differs from
 * `toValue(entry)` is written. A result's kind is never written, and a blank `quantityFormula`
 * removes the key.
 */
export function fromValue(entry, value) {
  const before = toValue(entry);
  return isResult(entry) ? resultFrom(entry, before, value) : ingredientFrom(entry, before, value);
}
