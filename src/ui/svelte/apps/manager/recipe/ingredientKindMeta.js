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
export const INGREDIENT_KIND_ORDER = Object.freeze(['component', 'tags', 'essence', 'currency']);

/**
 * Per kind: the Font Awesome glyph, the `is-<tone>` suffix its tint rules are written on, and
 * the localization key + English fallback for its one-word name.
 *
 * @type {Readonly<Record<string, { icon: string, tone: string, labelKey: string, label: string }>>}
 */
export const INGREDIENT_KIND_META = Object.freeze({
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
export function ingredientKindMeta(matchType) {
  return INGREDIENT_KIND_META[matchType] || INGREDIENT_KIND_META.component;
}

/**
 * The full class string for a glyph carrying a kind's tint: its icon plus the shared
 * tinted-mark pair. ONE string, because `SearchablePopover` renders an option's `icon` as the
 * whole `class` attribute of its `<i>` and the row's own marks are written the same way.
 *
 * @param {string} matchType a requirement option's `match.type`
 * @returns {string}
 */
export function ingredientKindMarkClass(matchType) {
  const meta = ingredientKindMeta(matchType);
  return `${meta.icon} manager-recipe-option-mark is-${meta.tone}`;
}
