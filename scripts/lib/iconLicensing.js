/** The other half of the icon licensing rule: what Fabricate's own source is allowed to write. */

import { parseIconGlyphRules } from './fontAwesomeBundle.js';

/** Repository-relative roots whose files ship to a GM's Foundry and are therefore scanned. */
export const SCANNED_ROOTS = Object.freeze(['src', 'styles', 'lang']);

/** The file extensions within those roots that can carry an icon class. */
export const SCANNED_EXTENSIONS = Object.freeze([
  '.js',
  '.mjs',
  '.svelte',
  '.css',
  '.scss',
  '.json',
  '.html',
]);

/** Font Awesome family and style tokens a free release publishes. */
export const FREE_STYLE_TOKENS = Object.freeze(
  new Set(['fa', 'fas', 'far', 'fab', 'fa-solid', 'fa-regular', 'fa-brands', 'fa-classic'])
);

/** Family and style tokens that exist only in Font Awesome Pro, in both spellings. */
export const PRO_STYLE_TOKENS = Object.freeze(
  new Set([
    'fal',
    'fat',
    'fad',
    'fass',
    'fasr',
    'fasl',
    'fast',
    'fasds',
    'fasdr',
    'fasdl',
    'fasdt',
    'fa-light',
    'fa-thin',
    'fa-duotone',
    'fa-sharp',
    'fa-sharp-duotone',
  ])
);

/** Utility classes that only a Pro face renders. `fa-swap-opacity` is duotone-only. */
export const PRO_UTILITY_TOKENS = Object.freeze(new Set(['fa-swap-opacity']));

/** Modules allowed to assemble an icon class from fragments, and why. */
export const COMPOSITION_EXEMPT_PATHS = Object.freeze(['src/ui/svelte/util/essenceIcons.js']);

// A `fa-` class token, anchored so `manager-fa-thing` cannot match. The name shape is Font
// Awesome's own: lowercase alphanumerics in hyphen-separated segments.
const GLYPH_TOKEN = /(?<![\w-])fa-[a-z0-9]+(?:-[a-z0-9]+)*/g;

// The characters a class list is made of. Expanding across them from a matched token recovers the
// whitespace-separated run the token sits in, without parsing HTML, JavaScript or Svelte.
const CLASS_RUN_CHARACTER = /[A-Za-z0-9_\- \t]/;

// `fa-${…}`: a template expression completing the name.
const TEMPLATE_COMPOSITION = /(?<![\w-])fa-\$\{/g;

// `'fa-' + …`: a string literal closed on the prefix and concatenated with something else.
const CONCATENATED_COMPOSITION = /(?<![\w-])fa-(['"`])\s*\+/g;

/** Which line of `text` the character at `index` is on, counting from 1. */
function lineAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === '\n') line += 1;
  }
  return line;
}

/** The whitespace-separated run of class-shaped characters surrounding a match. */
function classRunAround(text, index, length) {
  let start = index;
  while (start > 0 && CLASS_RUN_CHARACTER.test(text[start - 1])) start -= 1;
  let end = index + length;
  while (end < text.length && CLASS_RUN_CHARACTER.test(text[end])) end += 1;
  return text.slice(start, end).trim();
}

/**
 * The free glyph names and the free non-glyph utility classes, both measured from one stylesheet.
 */
export function readFreeIconVocabulary(cssText) {
  const glyphNames = new Set(parseIconGlyphRules(cssText).flatMap((rule) => rule.names));
  const utilityClasses = new Set();
  for (const match of cssText.matchAll(/\.fa-([a-z0-9-]+)/g)) {
    if (!glyphNames.has(match[1])) utilityClasses.add(match[1]);
  }
  return { glyphNames, utilityClasses };
}

/** What one whitespace-separated class token is, against the free vocabulary. */
export function classifyIconToken(token, vocabulary) {
  if (FREE_STYLE_TOKENS.has(token)) return 'free-style';
  if (PRO_STYLE_TOKENS.has(token)) return 'pro-style';
  if (PRO_UTILITY_TOKENS.has(token)) return 'pro-utility';
  const name = token.startsWith('fa-') ? token.slice(3) : token;
  if (vocabulary.utilityClasses.has(name)) return 'free-utility';
  if (vocabulary.glyphNames.has(name)) return 'free-glyph';
  return 'unknown-glyph';
}

/** Every icon name the text spells out that Font Awesome does not publish for free. */
export function findUnknownNameViolations(text, vocabulary) {
  const violations = [];
  for (const match of text.matchAll(GLYPH_TOKEN)) {
    if (classifyIconToken(match[0], vocabulary) !== 'unknown-glyph') continue;
    violations.push({
      kind: 'unlicensed-icon-name',
      token: match[0],
      line: lineAt(text, match.index),
      detail: `"${match[0]}" names no icon Font Awesome publishes for free, so it is a Pro-only name or a typo`,
    });
  }
  return violations;
}

/** Whether a whitespace-separated word is a Font Awesome class token at all. */
export function isFontAwesomeToken(token) {
  return token.startsWith('fa-') || FREE_STYLE_TOKENS.has(token) || PRO_STYLE_TOKENS.has(token);
}

/** The contiguous blocks of Font Awesome tokens inside one class run. */
function fontAwesomeTokenBlocks(tokens) {
  const blocks = [];
  let current = [];
  for (const token of tokens) {
    if (isFontAwesomeToken(token)) {
      current.push(token);
      continue;
    }
    if (current.length > 0) blocks.push(current);
    current = [];
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/** Every Pro-only family, style or utility token used inside a real icon class list. */
export function findProStyleViolations(text, vocabulary) {
  const violations = [];
  const seen = new Set();
  for (const match of text.matchAll(GLYPH_TOKEN)) {
    const run = classRunAround(text, match.index, match[0].length);
    const line = lineAt(text, match.index);
    if (seen.has(`${line}:${run}`)) continue;
    seen.add(`${line}:${run}`);
    for (const block of fontAwesomeTokenBlocks(run.split(/\s+/).filter(Boolean))) {
      const kinds = block.map((token) => classifyIconToken(token, vocabulary));
      const namesAGlyph = block.some(
        (token, index) =>
          token.startsWith('fa-') &&
          (kinds[index] === 'free-glyph' || kinds[index] === 'unknown-glyph')
      );
      if (!namesAGlyph) continue;
      for (const [index, kind] of kinds.entries()) {
        if (kind !== 'pro-style' && kind !== 'pro-utility') continue;
        violations.push({
          kind: 'pro-only-style',
          token: block[index],
          line,
          detail: `"${block[index]}" is a Font Awesome Pro family, style or utility class, used here beside an icon name in "${run}"`,
        });
      }
    }
  }
  return violations;
}

/** Every icon name assembled from fragments rather than written down. */
export function findCompositionViolations(text) {
  const violations = [];
  for (const pattern of [TEMPLATE_COMPOSITION, CONCATENATED_COMPOSITION]) {
    for (const match of text.matchAll(pattern)) {
      violations.push({
        kind: 'composed-icon-name',
        token: match[0],
        line: lineAt(text, match.index),
        detail:
          'an icon name assembled at runtime cannot be resolved against the free set by a text scan',
      });
    }
  }
  return violations.sort((left, right) => left.line - right.line);
}

/** Every licensing violation in one file's source text. */
export function findIconLicensingViolations({ text, vocabulary, allowComposition = false }) {
  return [
    ...findUnknownNameViolations(text, vocabulary),
    ...findProStyleViolations(text, vocabulary),
    ...(allowComposition ? [] : findCompositionViolations(text)),
  ].sort((left, right) => left.line - right.line);
}

/** Whether a file composes an icon name, used to prove a composition exemption is still earned. */
export function composesIconNames(text) {
  return findCompositionViolations(text).length > 0;
}
