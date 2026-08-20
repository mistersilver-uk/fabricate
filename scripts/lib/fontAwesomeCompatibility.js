import {
  countLeadingTokens,
  iconLabelFor,
  parseGlyphCodepoint,
  parseIconGlyphRules,
  preferredIconName,
} from './fontAwesomeBundle.js';

/**
 * Refuse to regenerate a one-row-per-glyph catalogue when its weight assumption stops being true.
 *
 * PR #1274 deliberately removes `hasRegular` because Foundry 14.365's classic solid and regular
 * faces carry identical cmaps. Continuing after that invariant stops holding would emit a file
 * whose header says the faces are identical while silently throwing away the information needed
 * to represent the difference, so this is a hard failure rather than a warning.
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
 * Read Font Awesome 6's icon rules.
 *
 * Font Awesome 7 moved icon glyph assignment to `--fa` on the icon class itself. Font Awesome 6
 * assigns `content` on `:before`/`::before`, which is the format Foundry 13's bundled 6.7.2 uses.
 * Supporting both is what lets the same smoke assertion and regeneration tooling reason about the
 * two Foundry generations instead of treating V13 as a guessed subtraction from V14.
 *
 * @param {string} cssText
 * @returns {Array<{ names: string[], codepoint: number }>}
 */
export function parseLegacyIconGlyphRules(cssText) {
  const rules = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = rulePattern.exec(String(cssText ?? ''))) !== null) {
    const content = /(?:^|;)\s*content\s*:\s*(["'])(.*?)\1\s*(?:;|$)/.exec(match[2]);
    if (!content) continue;

    const names = [...match[1].matchAll(/\.fa-([a-z0-9-]+)\s*::?before\b/gi)].map(
      (selector) => selector[1]
    );
    if (names.length === 0) continue;

    rules.push({
      names: [...new Set(names)],
      codepoint: parseGlyphCodepoint(content[2]),
    });
  }

  return rules;
}

/**
 * Read icon rules from either Font Awesome generation Fabricate currently supports.
 *
 * @param {string} cssText
 * @returns {Array<{ names: string[], codepoint: number }>}
 */
export function parseCompatibleIconGlyphRules(cssText) {
  const modern = parseIconGlyphRules(cssText);
  return modern.length > 0 ? modern : parseLegacyIconGlyphRules(cssText);
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
 * This is the legacy counterpart of `buildIconCatalogue`: grouping by codepoint matters because
 * Font Awesome 6 can spell aliases as separate selectors/rules rather than the single grouped rule
 * Font Awesome 7 emits.
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

  const classicRules = [...namesByCodepoint.entries()].map(([codepoint, names]) => ({
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
