/**
 * The four ingredient KINDS a requirement can be, and the one table every surface reads them
 * from: the row's plate, the row's kind select, the choice group's alt adders and the `or…`
 * menu's four entries. One table is why those four cannot disagree about what a kind is called
 * or what colour it is — this repository had FOUR copies, and two had already drifted, so the
 * glyph a GM pressed in the menu (`fa-cube`, `fa-tags`) was not the glyph on the row it created
 * (`fa-cubes`, `fa-tag`). Nothing failed and the only way to see it was to open the menu.
 *
 * What is here is a kind's ICON, TONE and LABEL KEY — not its localized text, so this module
 * stays free of the Foundry bridge and is a leaf every mounted harness can copy verbatim. The
 * TONE is a class suffix rather than a colour: `styles/fabricate.css` declares the four
 * `.manager-recipe-option-mark.is-<tone>` rules ONCE beside the plate they also ink, and
 * `tests/components/manager-layout.test.js` measures that equality in a real cascade.
 *
 * The keys are the model's MATCH TYPES, so a caller keys straight off `option.match.type`.
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
 * The full class string for a glyph carrying a kind's tint: its icon plus the shared
 * tinted-mark pair. ONE string, because `SearchablePopover` renders an option's `icon` as the
 * whole `class` attribute of its `<i>` and the row's own marks are written the same way.
 *
 * @param {string} matchType a requirement option's `match.type`
 * @returns {string}
 */
export function kindMarkClass(matchType) {
  const meta = kindMeta(matchType);
  return `${meta.icon} manager-recipe-option-mark is-${meta.tone}`;
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
