/**
 * What a catalogue needs from a Font Awesome bundle beyond reading its glyph rules: the guard on
 * the one-row-per-glyph model, and the construction of rows from rules a caller has already
 * parsed and filtered.
 *
 * THIS MODULE NO LONGER SPANS TWO FONT AWESOME GENERATIONS, and the reason is worth recording
 * because the code that did was written against a premise that is false. It carried a
 * `parseLegacyIconGlyphRules` reader for `content` on `:before`/`::before`, described as the
 * format "Foundry 13's bundled 6.7.2 uses", behind a `parseCompatibleIconGlyphRules` that fell
 * back to it whenever the modern reader came up empty. Font Awesome 6 had ALREADY moved glyph
 * assignment to the `--fa` custom property: Foundry 13.351's bundle declares
 * `font-family:"Font Awesome 6 Pro"` and assigns every one of its 4,656 icon rules with `--fa`.
 * Run against the real stylesheets, the legacy reader returns ZERO rules from Foundry 13.351,
 * zero from Foundry 14.360 and zero from Font Awesome Free 7.3.1 — the only `content` rules in
 * any of them are the two-to-four family blocks (`.fas:before{content:var(--fa)}`) that render
 * the custom property, and they name no icon.
 *
 * So the fallback never fired, and the reason Foundry 13 looked like a different generation was
 * not its `content` rules but its SECOND declaration: `.fa-gear{--fa:"\f013";--fa--fa:"…"}`, which
 * `parseIconGlyphRules` did not read until it stopped requiring `}` after the closing quote.
 * Deleting the reader is therefore not a narrowing of support — it removes a branch that answered
 * a question no shipped bundle asks, and whose presence made an unread bundle look supported.
 */

import { countLeadingTokens, iconLabelFor, preferredIconName } from './fontAwesomeBundle.js';

/**
 * Refuse to regenerate a one-row-per-glyph catalogue when its weight assumption stops being true.
 *
 * PR #1274 deliberately removes `hasRegular` because the classic solid and regular faces Foundry
 * ships carry identical cmaps — measured on both supported generations, 4,580 codepoints each in
 * Foundry 14.360 and 4,118 each in Foundry 13.351, with nothing on either side of either pair.
 * Continuing after that invariant stops holding would emit a file whose header says the faces are
 * identical while silently throwing away the information needed to represent the difference, so
 * this is a hard failure rather than a warning.
 *
 * @param {Set<number>} solidCodepoints
 * @param {Set<number>} regularCodepoints
 * @param {string} [context]
 */
export function assertClassicFaceParity(
  solidCodepoints,
  regularCodepoints,
  context = 'Font Awesome bundle'
) {
  const solidOnly = [...solidCodepoints].filter((codepoint) => !regularCodepoints.has(codepoint));
  const regularOnly = [...regularCodepoints].filter((codepoint) => !solidCodepoints.has(codepoint));
  if (solidOnly.length === 0 && regularOnly.length === 0) return;

  throw new Error(
    `${context}: classic solid and regular cmaps differ ` +
      `(${solidCodepoints.size} solid, ${regularCodepoints.size} regular; ` +
      `${solidOnly.length} solid-only, ${regularOnly.length} regular-only). ` +
      'The catalogue deliberately has no hasRegular field, so revisit that model before regenerating.'
  );
}

/**
 * Every icon name declared by a parsed bundle, including aliases.
 *
 * @param {Array<{ names: string[] }>} rules
 * @returns {Set<string>}
 */
export function iconNamesFromRules(rules) {
  return new Set(rules.flatMap((rule) => rule.names));
}

/**
 * Build one catalogue row per classic glyph from already-parsed rules.
 *
 * The counterpart of `buildIconCatalogue`, which reads a stylesheet itself: this takes rules a
 * caller has already parsed, so a caller that must FILTER them — by licence, by face, by anything
 * the stylesheet does not say — can still produce a catalogue.
 *
 * It groups by CODEPOINT rather than by rule, and that is load-bearing rather than defensive.
 * Foundry 13.351 gives 762 of its codepoints more than one rule (`.fa-adjust` and
 * `.fa-circle-half-stroke` are separate blocks naming one drawing, as are `.fa-address-card`,
 * `.fa-contact-card` and `.fa-vcard`), so grouping per rule would emit one glyph as several
 * entries, each claiming the others as no alias of it. Foundry 14.360 does it once, for
 * `crate-apple`/`apple-crate`.
 *
 * @param {object} bundle
 * @param {Array<{ names: string[], codepoint: number }>} bundle.rules
 * @param {Set<number>} bundle.classicCodepoints
 * @param {Set<number>} bundle.brandCodepoints
 * @returns {Array<{ iconCode: string, label: string, aliases: string[] }>}
 */
export function buildIconCatalogueFromRules({ rules, classicCodepoints, brandCodepoints }) {
  const namesByCodepoint = new Map();
  for (const rule of rules) {
    if (!classicCodepoints.has(rule.codepoint) || brandCodepoints.has(rule.codepoint)) continue;
    const names = namesByCodepoint.get(rule.codepoint) ?? new Set();
    for (const name of rule.names) names.add(name);
    namesByCodepoint.set(rule.codepoint, names);
  }

  const classicRules = [...namesByCodepoint].map(([codepoint, names]) => ({
    codepoint,
    names: [...names],
  }));
  const leadingTokenCounts = countLeadingTokens(classicRules.flatMap((rule) => rule.names));

  return classicRules
    .map((rule) => {
      const iconCode = preferredIconName(rule.names, leadingTokenCounts);
      return {
        iconCode,
        label: iconLabelFor(iconCode),
        aliases: rule.names
          .filter((name) => name !== iconCode)
          .sort((left, right) => (left < right ? -1 : 1)),
      };
    })
    .sort((left, right) => (left.iconCode < right.iconCode ? -1 : 1));
}
