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
 * The next `{` or `}` at or after `from`, or -1 when the text holds neither.
 *
 * A single character sweep rather than two `indexOf` calls: `indexOf('{')` on text whose remaining
 * braces are all `}` scans to the end of the stylesheet every time it is asked, which is the same
 * quadratic cost in a different disguise.
 *
 * @param {string} text
 * @param {number} from
 * @returns {number}
 */
function nextBraceIndex(text, from) {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '{' || text[index] === '}') return index;
  }
  return -1;
}

/**
 * Every innermost `selector { declarations }` block in a stylesheet, in source order.
 *
 * This replaces a `([^{}]+)\{([^{}]*)\}` splitter, which reads naturally and is the wrong tool
 * for a quarter-megabyte of minified CSS: its two unbounded character classes are ambiguous, so
 * every at-rule prelude that fails to match costs the engine a retry from the next offset and its
 * runtime grows super-linearly in the length of a brace-free run (`javascript:S8786`). The walk
 * below answers the same question by reading each character once.
 *
 * It reports the same blocks the splitter did, deliberately, because the callers' behaviour is
 * defined by that reading:
 *
 * - a nested block's PRELUDE is not a rule. `@media …{.fa-beat{…}}` yields `.fa-beat`, because a
 *   body that opens another block cannot match; the walk resumes inside the outer block.
 * - a selector must be non-empty, and a run terminated by `}` rather than `{` is not a selector.
 * - neither form is a CSS parser: a brace inside a quoted value ends a block early in both. That
 *   is safe against Font Awesome's output, whose only string values are glyph escapes and font
 *   family names.
 *
 * @param {string} cssText
 * @returns {Generator<{ selectorText: string, declarations: string }>}
 */
function* eachDeclarationBlock(cssText) {
  const text = String(cssText ?? '');
  let cursor = 0;

  while (cursor < text.length) {
    const open = nextBraceIndex(text, cursor);
    if (open === -1) return;
    if (open === cursor || text[open] === '}') {
      cursor = open + 1;
      continue;
    }

    const close = nextBraceIndex(text, open + 1);
    if (close === -1) return;
    if (text[close] === '{') {
      cursor = open + 1;
      continue;
    }

    yield { selectorText: text.slice(cursor, open), declarations: text.slice(open + 1, close) };
    cursor = close + 1;
  }
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

  for (const { selectorText, declarations } of eachDeclarationBlock(cssText)) {
    const content = /(?:^|;)\s*content\s*:\s*(["'])(.*?)\1\s*(?:;|$)/.exec(declarations);
    if (!content) continue;

    const names = [...selectorText.matchAll(/\.fa-([a-z0-9-]+)\s*::?before\b/gi)].map(
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
