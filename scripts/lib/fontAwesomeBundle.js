/** Reads the Font Awesome bundle Foundry ships and reports what it can actually render. */

import fs from 'node:fs';
import zlib from 'node:zlib';

const BACKSLASH = '\\';

/**
 * The order of woff2's built-in table tags. A woff2 table directory entry names its table by index
 * into this list rather than by tag, unless the index is 63.
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

/** A quoted `"Font Awesome <major> <flavour>"` font-family literal, in either quote character. */
const FONT_FAMILY_LITERAL = /(["'])(Font Awesome \d+[^"']*)\1/g;

/** The generation and edition a set of `font-family` literals describes, by highest major. */
export function highestFontAwesomeFamilyRelease(fontFamilies) {
  let highest = null;
  for (const family of fontFamilies) {
    const match = /^Font Awesome (\d+)\b(.*)$/.exec(String(family ?? '').trim());
    if (!match) continue;

    const major = Number(match[1]);
    const edition = /\bPro\b/.test(match[2]) ? 'Pro' : /\bFree\b/.test(match[2]) ? 'Free' : null;
    const supersedes =
      highest === null ||
      major > highest.major ||
      (major === highest.major && highest.edition === null);
    if (supersedes) highest = { edition, major };
  }
  return highest;
}

/** The release a stylesheet describes, and which evidence says so. */
export function parseFontAwesomeRelease(cssText) {
  const text = String(cssText ?? '');
  const banner = /Font Awesome (Free|Pro) (\d+)\.(\d+\.\d+)/.exec(text);
  if (banner) {
    return {
      edition: banner[1],
      version: `${banner[2]}.${banner[3]}`,
      major: Number(banner[2]),
      evidence: 'banner',
    };
  }

  const family = highestFontAwesomeFamilyRelease(
    [...text.matchAll(FONT_FAMILY_LITERAL)].map((match) => match[2])
  );
  if (family) {
    return { edition: family.edition, version: null, major: family.major, evidence: 'font-family' };
  }

  throw new Error(
    'The stylesheet carries no Font Awesome banner and no Font Awesome font-family literal, so it ' +
      'names no release to measure.'
  );
}

/** The edition a bundled `LICENSE.txt` grants. */
export function fontAwesomeLicenseEdition(licenseText) {
  return /Font Awesome (Free|Pro) License/.exec(String(licenseText ?? ''))?.[1] ?? null;
}

/**
 * A CSS escape, per CSS Syntax §4.3.7: one to six hex digits, optionally followed by a single
 * whitespace that terminates the run rather than belonging to it.
 */
const CSS_HEX_ESCAPE = /^([0-9a-f]{1,6})(?:\r\n|[ \n\t\r\f])?$/i;

/** Turns the `--fa` custom property's value into the codepoint it names. */
export function parseGlyphCodepoint(cssValue) {
  const value = String(cssValue ?? '');
  if (!value.startsWith(BACKSLASH)) return value.codePointAt(0);
  const escaped = value.slice(1);
  const hexEscape = CSS_HEX_ESCAPE.exec(escaped);
  return hexEscape ? Number.parseInt(hexEscape[1], 16) : escaped.codePointAt(0);
}

/** Every rule in the stylesheet that assigns a glyph, with the names that share it. */
export function parseIconGlyphRules(cssText) {
  const rulePattern = /((?:\.fa-[a-z0-9-]+,)*\.fa-[a-z0-9-]+)\{--fa:"([^"]+)"(?:;|\})/g;
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

/**
 * The codepoints a format 4 subtable covers: 16-bit segment mapping, the format every classic face
 * uses for the Basic Multilingual Plane.
 */
function addFormat4SegmentCodepoints(cmap, subtableOffset, codepoints) {
  const segmentsTimesTwo = cmap.readUInt16BE(subtableOffset + 6);
  const endBase = subtableOffset + 14;
  const startBase = endBase + segmentsTimesTwo + 2;
  for (let segment = 0; segment < segmentsTimesTwo / 2; segment += 1) {
    const end = cmap.readUInt16BE(endBase + segment * 2);
    const start = cmap.readUInt16BE(startBase + segment * 2);
    if (start === 0xff_ff && end === 0xff_ff) continue;
    for (let codepoint = start; codepoint <= end; codepoint += 1) codepoints.add(codepoint);
  }
}

/**
 * The codepoints a format 12 subtable covers: 32-bit segmented coverage, which is how a face
 * declares anything above the Basic Multilingual Plane.
 */
function addFormat12GroupCodepoints(cmap, subtableOffset, codepoints) {
  const groupCount = cmap.readUInt32BE(subtableOffset + 12);
  for (let group = 0; group < groupCount; group += 1) {
    const groupOffset = subtableOffset + 16 + group * 12;
    const start = cmap.readUInt32BE(groupOffset);
    const end = cmap.readUInt32BE(groupOffset + 4);
    for (let codepoint = start; codepoint <= end; codepoint += 1) codepoints.add(codepoint);
  }
}

/** Add one cmap subtable's codepoints, when it is written in a format this reader understands. */
function readCmapSubtable(cmap, subtableOffset, codepoints) {
  const format = cmap.readUInt16BE(subtableOffset);
  if (format === 4) addFormat4SegmentCodepoints(cmap, subtableOffset, codepoints);
  else if (format === 12) addFormat12GroupCodepoints(cmap, subtableOffset, codepoints);
}

/** The codepoints a woff2 face actually carries, read from its `cmap`. */
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

/** The tokens a retired spelling ends in. */
const RETIRED_VARIANT_TOKENS = new Set(['broken', 'edit', 'times', 'o', 'lg', 'sm', 'h', 'v']);

/** Whether a name carries one of Font Awesome's retired-variant markers. */
export function isRetiredVariantName(iconName) {
  const tokens = String(iconName ?? '').split('-');
  if (tokens.includes('alt')) return true;

  const finalToken = tokens.at(-1);
  return RETIRED_VARIANT_TOKENS.has(finalToken) || /^\d+$/.test(finalToken);
}

/** How many names in the bundle start with each leading token. */
export function countLeadingTokens(iconNames) {
  const counts = new Map();
  for (const name of iconNames) {
    const token = name.split('-', 1)[0];
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

/** Which of a glyph's names the vocabulary offers. */
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

/** The Title-Cased label derived from an icon code. */
export function iconLabelFor(iconCode) {
  return String(iconCode ?? '')
    .split('-')
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(' ');
}

/** The catalogue: one entry per glyph the classic faces carry, sorted by the offered name. */
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
