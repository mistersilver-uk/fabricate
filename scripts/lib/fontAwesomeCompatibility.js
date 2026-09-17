/**
 * What a catalogue needs from a Font Awesome bundle beyond reading its glyph rules: the guard on
 * the one-row-per-glyph model, and the construction of rows from rules a caller has already parsed
 * and filtered.
 */

import { countLeadingTokens, iconLabelFor, preferredIconName } from './fontAwesomeBundle.js';

/**
 * Refuse to regenerate a one-row-per-glyph catalogue when its weight assumption stops being true.
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

/** Every icon name declared by a parsed bundle, including aliases. */
export function iconNamesFromRules(rules) {
  return new Set(rules.flatMap((rule) => rule.names));
}

/** Build one catalogue row per classic glyph from already-parsed rules. */
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
