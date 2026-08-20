import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertClassicFaceParity,
  buildIconCatalogueFromRules,
  iconNamesFromRules,
  parseCompatibleIconGlyphRules,
  parseLegacyIconGlyphRules,
} from '../scripts/lib/fontAwesomeCompatibility.js';

const BACKSLASH = '\\';

const LEGACY_STYLESHEET = [
  '/*! Font Awesome Pro 6.7.2 */',
  `.fa-cog::before,.fa-gear::before{content:"${BACKSLASH}f013"}`,
  `.fa-0:before{content:"${BACKSLASH}30 "}`,
  `.fa-github::before{content:"${BACKSLASH}f09b"}`,
  '.fa-spin{animation-name:fa-spin}',
].join('');

const MODERN_STYLESHEET = [
  '/*! Font Awesome Pro 7.2.0 */',
  `.fa-cog,.fa-gear{--fa:"${BACKSLASH}f013"}`,
  `.fa-lychee{--fa:"${BACKSLASH}e7a5"}`,
].join('');

describe('icon catalogue generator compatibility support', () => {
  it('fails closed when the primary solid and regular faces diverge', () => {
    assert.throws(
      () => assertClassicFaceParity(new Set([1, 2, 3]), new Set([1, 3]), 'fixture'),
      /classic solid and regular cmaps differ/
    );
    assert.doesNotThrow(() =>
      assertClassicFaceParity(new Set([1, 2, 3]), new Set([3, 2, 1]), 'fixture')
    );
  });

  it('parses Font Awesome 6 content rules, including aliases and CSS escapes', () => {
    assert.deepEqual(parseLegacyIconGlyphRules(LEGACY_STYLESHEET), [
      { names: ['cog', 'gear'], codepoint: 0xf013 },
      { names: ['0'], codepoint: 0x30 },
      { names: ['github'], codepoint: 0xf09b },
    ]);
  });

  it('selects the appropriate parser for both supported Foundry generations', () => {
    assert.deepEqual(iconNamesFromRules(parseCompatibleIconGlyphRules(LEGACY_STYLESHEET)), new Set([
      'cog',
      'gear',
      '0',
      'github',
    ]));
    assert.deepEqual(iconNamesFromRules(parseCompatibleIconGlyphRules(MODERN_STYLESHEET)), new Set([
      'cog',
      'gear',
      'lychee',
    ]));
  });

  it('builds a legacy catalogue one glyph at a time and excludes brand codepoints', () => {
    const rules = parseCompatibleIconGlyphRules(LEGACY_STYLESHEET);
    const catalogue = buildIconCatalogueFromRules({
      rules,
      classicCodepoints: new Set([0xf013, 0x30]),
      brandCodepoints: new Set([0xf09b]),
    });

    assert.deepEqual(catalogue, [
      { iconCode: '0', label: '0', aliases: [] },
      { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
    ]);
  });
});
