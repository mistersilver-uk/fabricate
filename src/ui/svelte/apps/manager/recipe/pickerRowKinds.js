/**
 * The requirement row's kind table and its mapping to both persisted shapes. `KIND_META` holds a
 * kind's icon, tone and label key under the model's match type or result kind, for the row's
 * plate, its kind select and the kind menu; `toValue` / `fromValue` carry an ingredient option or
 * a result entry to and from the row's `value`. A tone is a class suffix, not a colour: the
 * `is-<tone>` tint rules are in `styles/fabricate.css`.
 */

/** The ingredient match types, in the order an ingredient surface offers them. */
export const INGREDIENT_KINDS = Object.freeze(['component', 'tags', 'essence', 'currency']);

/**
 * The kind order every surface offers: the ingredient match types, then `knowledge`, which only a
 * result awards.
 *
 * @type {ReadonlyArray<'component'|'tags'|'essence'|'currency'|'knowledge'>}
 */
export const KIND_ORDER = Object.freeze([...INGREDIENT_KINDS, 'knowledge']);

/** `RESULT_KINDS` of `src/models/Result.js`, restated so this leaf imports no model. */
export const RESULT_ROW_KINDS = Object.freeze(['component', 'currency', 'knowledge']);

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
  knowledge: Object.freeze({
    icon: 'fa-solid fa-book-open',
    tone: 'knowledge',
    labelKey: 'FABRICATE.Admin.Manager.Recipe.KnowledgeTypeLabel',
    label: 'Recipe knowledge',
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
 * its tone and the `data-recipe-add="<hook>-<tone>"` hook. The convert menu, a choice group's
 * adders and a result set's adder all read this list, so they state one subset in one order.
 *
 * @param {ReadonlyArray<string>} kinds the surface's offered match types or result kinds
 * @param {(key: string, fallback: string) => string} [translate] the caller's localizer
 * @param {string} [hook] the hook's prefix: `alternative`, or `result` on a result set's adder
 */
export function kindMenuItems(
  kinds,
  translate = (_key, fallback) => fallback,
  hook = 'alternative'
) {
  return KIND_ORDER.filter((kind) => kinds.includes(kind)).map((kind) => {
    const { icon, tone, labelKey, label } = KIND_META[kind];
    const data = { 'data-recipe-add': `${hook}-${tone}` };
    return { id: kind, label: translate(labelKey, label), icon, tone, data };
  });
}

const AMOUNT_ON_MATCH = new Set(['essence', 'currency']);
const SUBJECT_KEY = { component: 'componentId', essence: 'essenceId', currency: 'unit' };
const RESULT_SUBJECT_KEY = { component: 'componentId', currency: 'unit', knowledge: 'recipeId' };

/**
 * The read-only face per result kind, its hooks and its words, for a row whose kind its system
 * cannot honour: a currency while currency is off, and a knowledge result while no player can see
 * a learned recipe. Each keeps its value visible and says why.
 */
export const READONLY_FACES = Object.freeze({
  currency: Object.freeze({
    field: { 'data-recipe-option-currency': '' },
    subject: { 'data-recipe-currency-unit': '', 'data-recipe-currency-readonly': '' },
    marker: { 'data-recipe-currency-disabled': '' },
    fallback: ['FABRICATE.Admin.Manager.Recipe.CurrencyDisabledUnitFallback', 'Currency'],
    tag: ['FABRICATE.Admin.Manager.Recipe.CurrencyDisabledTag', 'Currency off'],
    hint: [
      'FABRICATE.Admin.Manager.Recipe.CurrencyDisabledHint',
      'Currency is disabled for this system; this row is inactive until it is re-enabled.',
    ],
  }),
  knowledge: Object.freeze({
    field: { 'data-recipe-option-knowledge': '' },
    subject: { 'data-recipe-knowledge-readonly': '' },
    marker: { 'data-recipe-knowledge-disabled': '' },
    fallback: ['FABRICATE.Admin.Manager.Recipe.KnowledgeTypeLabel', 'Recipe knowledge'],
    tag: ['FABRICATE.Admin.Manager.Recipe.KnowledgeDisabledTag', 'Learning off'],
    hint: [
      'FABRICATE.Admin.Manager.Recipe.KnowledgeDisabledHint',
      'Players on this system never see learned recipes, so this row cannot be awarded until a visibility mode that reveals learned recipes is chosen.',
    ],
  }),
});

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
 * else `quantity`. Result: kind is `kind` (absent is `component`), subject `componentId | unit |
 * recipeId`, amount `quantity` beside `quantityFormula`, and a currency's `label` and `reason`.
 * Amounts pass through as stored.
 */
export function toValue(entry) {
  if (isResult(entry)) {
    const { kind = 'component', quantity, quantityFormula, label, reason } = entry;
    const id = (Object.hasOwn(RESULT_SUBJECT_KEY, kind) && entry[RESULT_SUBJECT_KEY[kind]]) || '';
    return { kind, id, tags: [], tagMatch: 'any', quantity, quantityFormula, label, reason };
  }
  const match = entry?.match ?? {};
  const kind = INGREDIENT_KINDS.includes(match.type) ? match.type : 'component';
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

/** A new result of `kind` carrying no value, for the row's own field to name. */
export function emptyResult(kind, id) {
  if (kind === 'currency') return { id, kind, unit: '', quantity: 1 };
  if (kind === 'knowledge') return { id, kind, recipeId: '', quantity: 1 };
  return { id, componentId: null, quantity: 1 };
}

/**
 * A result retyped to `kind`: its id, and for a counted kind its shown amount and any roll
 * expression, since component and currency both roll; nothing of the old kind's subject.
 */
function retypedResult(entry, kind) {
  const retyped = emptyResult(kind, entry.id);
  if (kind === 'knowledge') return retyped;
  const formula = entry.quantityFormula;
  return withText(
    { ...retyped, quantity: shownAmount(entry.quantity) },
    'quantityFormula',
    formula
  );
}

/** `next` with `key` holding the typed `text` as typed, or without `key` when it is blank. */
function withText(next, key, text) {
  if (typeof text === 'string' && text.trim() !== '') next[key] = text;
  else delete next[key];
  return next;
}

function resultFrom(entry, before, value) {
  if (value.kind !== before.kind) {
    const known = (kind) => RESULT_ROW_KINDS.includes(kind);
    return known(value.kind) && known(before.kind) ? retypedResult(entry, value.kind) : entry;
  }
  const next = { ...entry };
  const subject = RESULT_SUBJECT_KEY[before.kind];
  if (subject && value.id !== before.id) next[subject] = value.id || null;
  if (value.quantity !== before.quantity) next.quantity = writtenAmount(value.quantity);
  if (value.label !== before.label) withText(next, 'label', value.label);
  if (value.reason !== before.reason) withText(next, 'reason', value.reason);
  if (value.quantityFormula === before.quantityFormula) return next;
  return withText(next, 'quantityFormula', value.quantityFormula);
}

/**
 * `entry` with the row's edited `value` merged onto it: only a field that differs from
 * `toValue(entry)` is written. A result is retyped only between result kinds, clearing the old
 * kind's value; a blank `quantityFormula`, `label` or `reason` removes its key.
 */
export function fromValue(entry, value) {
  const before = toValue(entry);
  return isResult(entry) ? resultFrom(entry, before, value) : ingredientFrom(entry, before, value);
}
