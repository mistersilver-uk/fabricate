/**
 * The four ingredient KINDS a requirement can be, and the one table every surface reads them
 * from (issue 1373, maintainer round 8).
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────────────────────
 * The design has exactly one of these tables, `KINDMETA` at `proto:4624`, and every surface
 * that names a kind resolves through it: the row's plate (`proto:2247` via `proto:4645`), the
 * row's kind select (`proto:4658`), the choice group's alt adders (`proto:4692`) and the `or…`
 * menu's four entries (`proto:4682`). One table is why those four surfaces cannot disagree
 * about what a kind is called or what colour it is.
 *
 * This repository had FOUR copies of it, and they had already drifted in two places:
 *
 *   - the row's plate drew a component as `fas fa-cubes` and a tag as `fas fa-tag`;
 *   - the `or…` menu drew a component as `fas fa-cube` and a tag as `fas fa-tags`;
 *
 * so the glyph a GM pressed in the menu was not the glyph that appeared on the row it created.
 * Neither spelling was wrong on its own, nothing failed, and the only way to see it was to open
 * the menu — which no View Lab case did. `proto:4624` settles it: `fa-cube` and `fa-tag`,
 * singular, in both places.
 *
 * ── WHAT IS HERE AND WHAT IS NOT ────────────────────────────────────────────────────────────
 * A kind's ICON, its TONE and its LABEL KEY. Not its localized text: this module stays free of
 * the Foundry bridge so it is a leaf every mounted harness can copy verbatim, and each component
 * localizes through its own `text()` helper as it already does.
 *
 * The TONE is a class suffix, not a colour. `styles/fabricate.css` declares the four
 * `.manager-recipe-option-mark.is-<tone>` rules ONCE, beside the plate they also ink, and every
 * consumer wears that class rather than restating a token — so the menu's entry glyph and the
 * row's own mark are inked by the same declaration and cannot drift into two greens.
 * `tests/components/manager-layout.test.js` measures that equality in a real cascade rather
 * than trusting it.
 *
 * The keys are the MATCH TYPES the model uses (`component` / `tags` / `essence` / `currency`),
 * not the design's abbreviations, so a caller keys straight off `option.match.type`.
 */

/**
 * The kind order every surface offers, which is the order `proto:4682` and `proto:4658` use.
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
 * says nothing else — rather than returning undefined for a caller to crash on.
 *
 * @param {string} matchType a requirement option's `match.type`
 * @returns {{ icon: string, tone: string, labelKey: string, label: string }}
 */
export function ingredientKindMeta(matchType) {
  return INGREDIENT_KIND_META[matchType] || INGREDIENT_KIND_META.component;
}

/**
 * The full class string for a glyph that must carry a kind's tint: the kind's icon plus the
 * shared tinted-mark class pair `styles/fabricate.css` inks.
 *
 * Returned as one string because that is the shape a consumer needs — `SearchablePopover`
 * renders an option's `icon` as the whole `class` attribute of its `<i>`, and the row's own
 * marks are written the same way.
 *
 * @param {string} matchType a requirement option's `match.type`
 * @returns {string}
 */
export function ingredientKindMarkClass(matchType) {
  const meta = ingredientKindMeta(matchType);
  return `${meta.icon} manager-recipe-option-mark is-${meta.tone}`;
}
