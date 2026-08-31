/**
 * The other half of the icon licensing rule: what Fabricate's own SOURCE is allowed to write.
 *
 * `scripts/generate-icon-catalogue.mjs` already narrows what a GM may PICK to the names Font
 * Awesome publishes for free, and tests/iconCatalogueGenerator.test.js keeps it narrowed. Nothing
 * governed what a component HARDCODES, so `fas fa-book-sparkles` shipped in five components and
 * three more Pro-only names shipped in five others. Every one of them renders perfectly on every
 * machine this project can test, because Foundry bundles Font Awesome PRO and draws them — which
 * is exactly why no gate caught them and why this one cannot be a rendering check.
 *
 * The clause, from `public/fonts/fontawesome/LICENSE.txt` in Foundry's own bundle:
 *
 *   "Font Awesome icons included in the Font Awesome Pro icon set may not be used, re-packaged, or
 *    referenced in code by third party package developers unless they obtain their own Font
 *    Awesome Pro license from https://fontawesome.com/."
 *
 * THE ORACLE MUST NOT BE THE FOUNDRY BUNDLE. A guard built on the stylesheet a Foundry install
 * serves would resolve every Pro name, certify it, and give the violation a green tick: that
 * bundle declares `font-family:"Font Awesome 6 Pro"` (or 7) and carries the duotone and sharp
 * families, so it answers "does this name exist" with a yes for precisely the names this guard
 * exists to forbid. The oracle is Font Awesome's own FREE release, read from the exactly-pinned
 * `@fortawesome/fontawesome-free` devDependency through the generator's own resolver, so this
 * guard and the catalogue generator cannot disagree about which file the free set is.
 *
 * WHAT THIS GUARD DOES NOT COVER. Stating the limits is the point of having them written down.
 *
 * - It is a TEXT scan. It sees a name spelled out in the source; it cannot see one assembled at
 *   runtime. That is why composition is a violation in its own right rather than something the
 *   scan quietly walks past — see `findCompositionViolations` — but the refusal only reaches
 *   fragments that still spell `fa-`. A class list built entirely from variables (`` `${style}
 *   ${name}` ``) is invisible to it, and no text scan can fix that.
 * - The STYLE-PREFIX half catches none of the ten violations that motivated this file. Every one
 *   of them wears `fas` or `fa-solid` and is Pro only in its NAME. The prefix half is prospective:
 *   it exists so `fa-duotone fa-book` — a free name at a Pro weight — cannot arrive later.
 * - It checks that a name is published free; it does not check that the WEIGHT is. Font Awesome
 *   Free publishes most of its classic icons at solid only, so `far fa-something` can be free by
 *   name and Pro by face. Per-style availability lives in the package's `metadata/icon-families.
 *   json` and is not read here.
 * - It matches `fa-`-prefixed class tokens, so prose that names a Pro glyph WITHOUT its class
 *   prefix is out of scope by construction. That is deliberate and it is the escape hatch the
 *   repository's own documentation uses: a comment explaining why `candle-holder` is declined has
 *   to be able to say `candle-holder`.
 * - It scans shipped source only (see `SCANNED_ROOTS`). `tests/**` is excluded because a test's
 *   job includes asserting that a Pro name is ABSENT, which requires naming it.
 */

import { parseIconGlyphRules } from './fontAwesomeBundle.js';

/**
 * Repository-relative roots whose files ship to a GM's Foundry and are therefore scanned.
 */
export const SCANNED_ROOTS = Object.freeze(['src', 'styles', 'lang']);

/**
 * The file extensions within those roots that can carry an icon class.
 */
export const SCANNED_EXTENSIONS = Object.freeze([
  '.js',
  '.mjs',
  '.svelte',
  '.css',
  '.scss',
  '.json',
  '.html',
]);

/**
 * Font Awesome family and style tokens a free release publishes.
 *
 * `fa` is the legacy bare prefix Foundry still resolves to solid.
 */
export const FREE_STYLE_TOKENS = Object.freeze(
  new Set(['fa', 'fas', 'far', 'fab', 'fa-solid', 'fa-regular', 'fa-brands', 'fa-classic'])
);

/**
 * Family and style tokens that exist only in Font Awesome Pro, in both spellings.
 *
 * The short forms matter as much as the long ones and are the reason this set is enumerated rather
 * than derived: `fal`, `fat` and `fad` carry no `fa-` prefix at all, so the name scan below cannot
 * see them.
 */
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

/**
 * Utility classes that only a Pro face renders. `fa-swap-opacity` is duotone-only.
 */
export const PRO_UTILITY_TOKENS = Object.freeze(new Set(['fa-swap-opacity']));

/**
 * Modules allowed to assemble an icon class from fragments, and why.
 *
 * `essenceIcons.js` is the icon vocabulary layer itself: composing `fa-${iconCode}` is its job,
 * and the codes it composes from are either rows of the committed catalogue — which
 * tests/iconCatalogueGenerator.test.js resolves against this same free oracle, name by name — or
 * a class a GM already saved, which is that GM's data and not a name Fabricate wrote down.
 *
 * The exemption is pinned: the guard asserts each entry still exists and still composes, so a
 * stale line fails rather than quietly widening.
 */
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

/**
 * Which line of `text` the character at `index` is on, counting from 1.
 *
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === '\n') line += 1;
  }
  return line;
}

/**
 * The whitespace-separated run of class-shaped characters surrounding a match.
 *
 * @param {string} text
 * @param {number} index
 * @param {number} length
 * @returns {string}
 */
function classRunAround(text, index, length) {
  let start = index;
  while (start > 0 && CLASS_RUN_CHARACTER.test(text[start - 1])) start -= 1;
  let end = index + length;
  while (end < text.length && CLASS_RUN_CHARACTER.test(text[end])) end += 1;
  return text.slice(start, end).trim();
}

/**
 * The free glyph names and the free non-glyph utility classes, both measured from one stylesheet.
 *
 * The utility set is DERIVED rather than listed: every `.fa-…` selector the free release declares
 * that carries no glyph is a utility (`fa-fw`, `fa-spin`, `fa-2x`, the sizing and rotation
 * families). Listing them by hand would rot, and a rotted entry reads as a Pro violation.
 *
 * @param {string} cssText a Font Awesome `all.min.css`
 * @returns {{ glyphNames: Set<string>, utilityClasses: Set<string> }}
 */
export function readFreeIconVocabulary(cssText) {
  const glyphNames = new Set(parseIconGlyphRules(cssText).flatMap((rule) => rule.names));
  const utilityClasses = new Set();
  for (const match of cssText.matchAll(/\.fa-([a-z0-9-]+)/g)) {
    if (!glyphNames.has(match[1])) utilityClasses.add(match[1]);
  }
  return { glyphNames, utilityClasses };
}

/**
 * What one whitespace-separated class token is, against the free vocabulary.
 *
 * Style and utility tokens are resolved BEFORE glyph names so that a recognition set — the arrays
 * and alternations in `essenceIcons.js` and `GatheringRichStateService.js` that teach the runtime
 * to READ a Pro prefix out of GM data — is classified as what it is rather than reported as ten
 * unknown icon names.
 *
 * @param {string} token
 * @param {{ glyphNames: Set<string>, utilityClasses: Set<string> }} vocabulary
 * @returns {'free-style'|'pro-style'|'pro-utility'|'free-utility'|'free-glyph'|'unknown-glyph'}
 */
export function classifyIconToken(token, vocabulary) {
  if (FREE_STYLE_TOKENS.has(token)) return 'free-style';
  if (PRO_STYLE_TOKENS.has(token)) return 'pro-style';
  if (PRO_UTILITY_TOKENS.has(token)) return 'pro-utility';
  const name = token.startsWith('fa-') ? token.slice(3) : token;
  if (vocabulary.utilityClasses.has(name)) return 'free-utility';
  if (vocabulary.glyphNames.has(name)) return 'free-glyph';
  return 'unknown-glyph';
}

/**
 * Every icon name the text spells out that Font Awesome does not publish for free.
 *
 * This is the half that catches the shipped defect, and it is deliberately unconditional: it does
 * not require a style prefix beside the name, because a Svelte `class:fa-book-sparkles={…}`
 * directive has none, and does not require a quoted string, because that directive has no quotes
 * either.
 *
 * @param {string} text
 * @param {{ glyphNames: Set<string>, utilityClasses: Set<string> }} vocabulary
 * @returns {Array<{ kind: string, token: string, line: number, detail: string }>}
 */
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

/**
 * Whether a whitespace-separated word is a Font Awesome class token at all.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isFontAwesomeToken(token) {
  return token.startsWith('fa-') || FREE_STYLE_TOKENS.has(token) || PRO_STYLE_TOKENS.has(token);
}

/**
 * The contiguous blocks of Font Awesome tokens inside one class run.
 *
 * Splitting on the non-Font-Awesome words is what separates a class list from a sentence. `fast`
 * is both an English word and Pro's sharp-thin prefix, and it appears thirty times in this
 * repository's prose; blocking on the surrounding words means it is only ever read as a prefix
 * when it stands beside an actual icon token.
 *
 * @param {string[]} tokens
 * @returns {string[][]}
 */
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

/**
 * Every Pro-only family, style or utility token used inside a real icon class list.
 *
 * A Pro token is reported only when it stands in a run of Font Awesome tokens that also names a
 * glyph — which is what an icon class list is, and what a recognition set is not. The arrays and
 * alternations in `essenceIcons.js` and `GatheringRichStateService.js` that teach the runtime to
 * READ `fa-duotone` out of GM-authored data list those prefixes one per string, beside no glyph,
 * so they are correctly silent here.
 *
 * @param {string} text
 * @param {{ glyphNames: Set<string>, utilityClasses: Set<string> }} vocabulary
 * @returns {Array<{ kind: string, token: string, line: number, detail: string }>}
 */
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

/**
 * Every icon name assembled from fragments rather than written down.
 *
 * Refused rather than skipped. A composed name is invisible to the two checks above, so passing
 * over it would let the guard report a clean file it had not actually read — the failure mode that
 * makes a guard worse than no guard, because it also reports the tree as protected.
 *
 * @param {string} text
 * @returns {Array<{ kind: string, token: string, line: number, detail: string }>}
 */
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

/**
 * Every licensing violation in one file's source text.
 *
 * @param {object} subject
 * @param {string} subject.text the file's source
 * @param {{ glyphNames: Set<string>, utilityClasses: Set<string> }} subject.vocabulary
 * @param {boolean} [subject.allowComposition] true for the vocabulary layer itself
 * @returns {Array<{ kind: string, token: string, line: number, detail: string }>}
 */
export function findIconLicensingViolations({ text, vocabulary, allowComposition = false }) {
  return [
    ...findUnknownNameViolations(text, vocabulary),
    ...findProStyleViolations(text, vocabulary),
    ...(allowComposition ? [] : findCompositionViolations(text)),
  ].sort((left, right) => left.line - right.line);
}

/**
 * Whether a file composes an icon name, used to prove a composition exemption is still earned.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function composesIconNames(text) {
  return findCompositionViolations(text).length > 0;
}
