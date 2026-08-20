/**
 * Reads the Font Awesome bundle Foundry ships and reports what it can actually render.
 *
 * Fabricate's icon vocabulary used to be generated from Font Awesome Free 6.7.2 metadata, which
 * describes a DIFFERENT font from the one a Foundry client loads. Foundry bundles Font Awesome
 * Pro, so an icon Foundry renders perfectly was unofferable whenever the free release lacked it.
 * This module exists so the vocabulary is derived from the stylesheet Foundry actually serves.
 *
 * Everything here is pure apart from `readWoff2Codepoints`, which is the only function that
 * touches a file.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

const BACKSLASH = '\\';

/**
 * The order of woff2's built-in table tags. A woff2 table directory entry names its table by
 * index into this list rather than by tag, unless the index is 63.
 *
 * @see https://www.w3.org/TR/WOFF2/#table_dir_format
 */
const WOFF2_KNOWN_TABLE_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

/**
 * Reads the edition and version out of the stylesheet's banner comment.
 *
 * The version is MEASURED rather than assumed because the catalogue this bundle generates
 * describes one Foundry release's font and nothing else.
 *
 * @param {string} cssText
 * @returns {{ edition: string, version: string }}
 */
export function parseFontAwesomeRelease(cssText) {
  const match = /Font Awesome (Free|Pro) (\d+\.\d+\.\d+)/.exec(String(cssText ?? ''));
  if (!match) {
    throw new Error(
      'The stylesheet carries no Font Awesome banner, so its release cannot be measured.'
    );
  }
  return { edition: match[1], version: match[2] };
}

/**
 * A CSS escape, per CSS Syntax §4.3.7: one to SIX hex digits, optionally followed by a single
 * whitespace that terminates the run rather than belonging to it.
 *
 * Both halves of that are load-bearing against this bundle. The terminator form is how a minifier
 * spells an escape whose next character would otherwise be read as a seventh hex digit, and it is
 * the form `.fa-0` through `.fa-9` are written in: `--fa:"\30 "` is the digit zero, not a three.
 * The one-digit bound matters because `\a` is a legal escape naming U+000A, and a lower bound of
 * two would read it as the letter `a`.
 */
const CSS_HEX_ESCAPE = /^([0-9a-f]{1,6})(?:\r\n|[ \n\t\r\f])?$/i;

/**
 * Turns the `--fa` custom property's value into the codepoint it names.
 *
 * Font Awesome 7 assigns a glyph with `--fa:"\f6bc"` rather than a `content` rule, and the value
 * is a CSS string in which a backslash starts either a hex escape or a literal-character escape.
 * `\f6bc` is a codepoint; `\+` is the character `+`; `\30 ` is a codepoint whose trailing space
 * is the escape's terminator and not part of the value.
 *
 * The codepoint is the ONLY input to the classic-and-not-brands filter that decides what the
 * catalogue contains, so misreading one is not a cosmetic error: it decides an icon's membership
 * by whichever face happens to carry the wrong number.
 *
 * @param {string} cssValue the raw text between the quotes
 * @returns {number} a Unicode codepoint
 */
export function parseGlyphCodepoint(cssValue) {
  const value = String(cssValue ?? '');
  if (!value.startsWith(BACKSLASH)) return value.codePointAt(0);
  const escaped = value.slice(1);
  const hexEscape = CSS_HEX_ESCAPE.exec(escaped);
  return hexEscape ? Number.parseInt(hexEscape[1], 16) : escaped.codePointAt(0);
}

/**
 * Every rule in the stylesheet that assigns a glyph, with the names that share it.
 *
 * A naive `::before` scrape finds almost nothing in Font Awesome 7 because the release moved from
 * a `content` rule to the `--fa` custom property, and several names routinely share one rule:
 * `.fa-baby-carriage,.fa-carriage-baby{--fa:"\f77d"}` is one picture under two names.
 *
 * Requiring a glyph assignment is also what drops the seventy-odd `.fa-<name>` classes that are
 * not icons — the family names, the sizes, and the animation, rotation and layout utilities. They
 * match the same selector shape and are excluded by construction rather than by a list.
 *
 * @param {string} cssText
 * @returns {Array<{ names: string[], codepoint: number }>}
 */
export function parseIconGlyphRules(cssText) {
  const rulePattern = /((?:\.fa-[a-z0-9-]+,)*\.fa-[a-z0-9-]+)\{--fa:"([^"]+)"\}/g;
  const rules = [];
  let match;
  while ((match = rulePattern.exec(String(cssText ?? ''))) !== null) {
    rules.push({
      names: match[1].split(',').map((selector) => selector.trim().slice('.fa-'.length)),
      codepoint: parseGlyphCodepoint(match[2]),
    });
  }
  return rules;
}

function readUIntBase128(buffer, cursor) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = buffer[cursor.offset];
    cursor.offset += 1;
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return value >>> 0;
  }
  throw new Error('Malformed UIntBase128 in the woff2 table directory.');
}

function readCmapSubtable(cmap, subtableOffset, codepoints) {
  const format = cmap.readUInt16BE(subtableOffset);
  if (format === 4) {
    const segmentsTimesTwo = cmap.readUInt16BE(subtableOffset + 6);
    const endBase = subtableOffset + 14;
    const startBase = endBase + segmentsTimesTwo + 2;
    for (let segment = 0; segment < segmentsTimesTwo / 2; segment += 1) {
      const end = cmap.readUInt16BE(endBase + segment * 2);
      const start = cmap.readUInt16BE(startBase + segment * 2);
      if (start === 0xff_ff && end === 0xff_ff) continue;
      for (let codepoint = start; codepoint <= end; codepoint += 1) codepoints.add(codepoint);
    }
    return;
  }
  if (format === 12) {
    const groupCount = cmap.readUInt32BE(subtableOffset + 12);
    for (let group = 0; group < groupCount; group += 1) {
      const groupOffset = subtableOffset + 16 + group * 12;
      const start = cmap.readUInt32BE(groupOffset);
      const end = cmap.readUInt32BE(groupOffset + 4);
      for (let codepoint = start; codepoint <= end; codepoint += 1) codepoints.add(codepoint);
    }
  }
}

/**
 * The codepoints a woff2 face actually carries, read from its `cmap`.
 *
 * This is what makes `hasRegular` and "is this a brand?" measurable rather than assumed. woff2
 * transforms `glyf` and `loca` but leaves every other table intact, so `cmap` can be read straight
 * out of the decompressed stream.
 *
 * @param {string} filePath a `.woff2` file
 * @returns {Set<number>}
 */
export function readWoff2Codepoints(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString('latin1', 0, 4) !== 'wOF2') {
    throw new Error(`${filePath} is not a woff2 file.`);
  }

  const tableCount = buffer.readUInt16BE(12);
  const cursor = { offset: 48 };
  const directory = [];
  for (let index = 0; index < tableCount; index += 1) {
    const flags = buffer[cursor.offset];
    cursor.offset += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    let tag;
    if (tagIndex === 63) {
      tag = buffer.toString('latin1', cursor.offset, cursor.offset + 4);
      cursor.offset += 4;
    } else {
      tag = WOFF2_KNOWN_TABLE_TAGS[tagIndex];
    }
    const originalLength = readUIntBase128(buffer, cursor);
    const isTransformed =
      tag === 'glyf' || tag === 'loca' ? transformVersion === 0 : transformVersion !== 0;
    const length = isTransformed ? readUIntBase128(buffer, cursor) : originalLength;
    directory.push({ tag, length });
  }

  const stream = zlib.brotliDecompressSync(buffer.subarray(cursor.offset));
  let offset = 0;
  let cmapOffset = -1;
  let cmapLength = 0;
  for (const table of directory) {
    if (table.tag === 'cmap') {
      cmapOffset = offset;
      cmapLength = table.length;
    }
    offset += table.length;
  }
  if (cmapOffset < 0) throw new Error(`${filePath} has no cmap table.`);

  const cmap = stream.subarray(cmapOffset, cmapOffset + cmapLength);
  const encodingCount = cmap.readUInt16BE(2);
  const codepoints = new Set();
  for (let index = 0; index < encodingCount; index += 1) {
    readCmapSubtable(cmap, cmap.readUInt32BE(4 + index * 8 + 4), codepoints);
  }
  return codepoints;
}

/**
 * The tokens a retired spelling ends in.
 *
 * `-o`, `-lg`/`-sm` and `-h`/`-v` are the suffixes the project used before it moved to descriptive
 * compound names, so `home-lg` is the older spelling of `house-chimney`. `-times`, `-edit` and
 * `-broken` are the same thing in word form: Font Awesome 6 renamed every one of them to `-xmark`,
 * `-pen` and `-crack`/`-slash`, and left the old spelling behind as an alias.
 */
const RETIRED_VARIANT_TOKENS = new Set(['broken', 'edit', 'times', 'o', 'lg', 'sm', 'h', 'v']);

/**
 * Whether a name carries one of Font Awesome's retired-variant markers.
 *
 * A marker is a whole hyphen-delimited TOKEN, and reading the name as tokens is what says so.
 * The equivalent `/(^|-)alt($|-)|(^|-)(broken|edit|…|[0-9]+)$/` this replaces was correct, and
 * correct in a shape whose two anchors each bound to one alternative — legible only to a reader
 * who had worked that out (`javascript:S5850`), for the rule that decides which of a glyph's
 * names a GM is offered.
 *
 * `alt` counts wherever it sits rather than only at the end, because `comment-alt-dots` is a
 * retired spelling of `message-dots` and reads as one in a picker label. Every other marker counts
 * as the FINAL token only, so `times-circle` and `smoke` are names in their own right — and a
 * token is why `salt-shaker` is not an `alt` name.
 *
 * A trailing ordinal is a marker too: `battery-5`, `temperature-0` and `wifi-3` are the older
 * spellings of `battery-full`, `temperature-empty` and `wifi`. It over-matches, as `-broken` and
 * `-o` do: the ten digit icons `.fa-0` through `.fa-9`, `image-broken` and `circle-o` are not
 * retired anything. Every one of those is the only name its glyph carries, so the over-match is
 * inert — this ranks the names of ONE glyph, and a glyph with a single name has nothing to rank.
 *
 * @param {string} iconName
 * @returns {boolean}
 */
export function isRetiredVariantName(iconName) {
  const tokens = String(iconName ?? '').split('-');
  if (tokens.includes('alt')) return true;

  const finalToken = tokens.at(-1);
  return RETIRED_VARIANT_TOKENS.has(finalToken) || /^\d+$/.test(finalToken);
}

/**
 * How many names in the bundle start with each leading token.
 *
 * @param {Iterable<string>} iconNames
 * @returns {Map<string, number>}
 */
export function countLeadingTokens(iconNames) {
  const counts = new Map();
  for (const name of iconNames) {
    const token = name.split('-', 1)[0];
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

/**
 * Which of a glyph's names the vocabulary offers.
 *
 * This is a PRESENTATION choice, not a claim about which name Font Awesome considers canonical.
 * The bundle cannot answer that: every one of its multi-name selector lists is sorted
 * alphabetically, so the order carries no information about which name came first. Because the
 * other names stay on the entry and resolve to it, a preference that reads oddly costs a retro
 * label and never a refused name.
 *
 * The order is: a retired-variant spelling loses; then, when one name extends another token for
 * token, the shorter wins, so the glyph a family is NAMED after keeps its plain name (`clock` over
 * `clock-four`, `folder` over `folder-blank`); then the name whose leading token names the larger
 * family in the bundle, which puts `tower-broadcast` ahead of `broadcast-tower` and `hand-fist`
 * ahead of `fist-raised`; then the longer name; then alphabetical, so the result never depends on
 * the order the stylesheet happened to list.
 *
 * @param {string[]} names every name the stylesheet gives one glyph
 * @param {Map<string, number>} leadingTokenCounts from `countLeadingTokens`
 * @returns {string}
 */
export function preferredIconName(names, leadingTokenCounts) {
  return [...names].sort((left, right) => {
    const leftRetired = isRetiredVariantName(left) ? 1 : 0;
    const rightRetired = isRetiredVariantName(right) ? 1 : 0;
    if (leftRetired !== rightRetired) return leftRetired - rightRetired;

    if (right.startsWith(`${left}-`)) return -1;
    if (left.startsWith(`${right}-`)) return 1;

    const leftFamily = leadingTokenCounts.get(left.split('-', 1)[0]) ?? 0;
    const rightFamily = leadingTokenCounts.get(right.split('-', 1)[0]) ?? 0;
    if (leftFamily !== rightFamily) return rightFamily - leftFamily;

    if (left.length !== right.length) return right.length - left.length;
    return left < right ? -1 : 1;
  })[0];
}

/**
 * The Title-Cased label derived from an icon code.
 *
 * Derived rather than authored: 3,700 hand-written captions would drift from their codes, and a
 * caption that disagrees with the name a GM typed is worse than a plain one.
 *
 * @param {string} iconCode
 * @returns {string}
 */
export function iconLabelFor(iconCode) {
  return String(iconCode ?? '')
    .split('-')
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(' ');
}

/**
 * The catalogue: one entry per glyph the classic faces carry, sorted by the offered name.
 *
 * A glyph is in when the classic solid face carries its codepoint and the brands face does not.
 * That is the whole brand rule, and it is measured from the fonts rather than matched against a
 * list of company names — a logo is exactly a glyph that only the brands face draws.
 *
 * @param {object} bundle
 * @param {string} bundle.cssText the bundled `all.min.css`
 * @param {Set<number>} bundle.classicCodepoints from the classic solid face
 * @param {Set<number>} bundle.brandCodepoints from the brands face
 * @returns {Array<{ iconCode: string, label: string, aliases: string[] }>}
 */
export function buildIconCatalogue({ cssText, classicCodepoints, brandCodepoints }) {
  const rules = parseIconGlyphRules(cssText);
  const classicRules = rules.filter(
    (rule) => classicCodepoints.has(rule.codepoint) && !brandCodepoints.has(rule.codepoint)
  );
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
