import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertClassicFaceParity,
  intersectCompatibleIconCatalogues,
  parseGeneratorArguments,
  parseLegacyIconGlyphRules,
} from '../scripts/generate-icon-catalogue.mjs';

const BACKSLASH = '\\';

function entry(iconCode, aliases = []) {
  return { iconCode, label: iconCode, aliases };
}

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
    const css = [
      `.fa-cog::before,.fa-gear::before{content:"${BACKSLASH}f013"}`,
      `.fa-0:before{content:"${BACKSLASH}30 "}`,
      '.fa-spin{animation-name:fa-spin}',
    ].join('');

    assert.deepEqual(parseLegacyIconGlyphRules(css), [
      { names: ['cog', 'gear'], codepoint: 0xf013 },
      { names: ['0'], codepoint: 0x30 },
    ]);
  });

  it('keeps only names every supported bundle can render', () => {
    const primary = [
      entry('candle-holder'),
      entry('gear', ['cog']),
      entry('new-spelling', ['old-spelling']),
    ];
    const older = [entry('gear', ['cog']), entry('old-spelling')];

    assert.deepEqual(intersectCompatibleIconCatalogues(primary, [older]), [
      { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
      { iconCode: 'old-spelling', label: 'Old Spelling', aliases: [] },
    ]);
  });

  it('drops aliases whose older bundle maps them to a different glyph', () => {
    const primary = [entry('merged', ['merged-alt'])];
    const older = [entry('merged'), entry('merged-alt')];

    assert.deepEqual(intersectCompatibleIconCatalogues(primary, [older]), [
      { iconCode: 'merged', label: 'Merged', aliases: [] },
    ]);
  });

  it('preserves the single-bundle output unchanged until compatibility bundles are supplied', () => {
    const primary = [entry('gear', ['cog'])];
    assert.equal(intersectCompatibleIconCatalogues(primary), primary);
  });

  it('parses repeated compatibility paths without treating them as primary paths', () => {
    assert.deepEqual(
      parseGeneratorArguments([
        'v14/fontawesome',
        '--compatible-with',
        'v13/fontawesome',
        '--compatible-with=v12/fontawesome',
        '--check',
      ]),
      {
        checkOnly: true,
        primary: 'v14/fontawesome',
        compatibleWith: ['v13/fontawesome', 'v12/fontawesome'],
      }
    );
  });

  it('rejects incomplete compatibility options and extra primary paths', () => {
    assert.throws(
      () => parseGeneratorArguments(['v14/fontawesome', '--compatible-with']),
      /requires a Foundry fontawesome bundle path/
    );
    assert.throws(
      () => parseGeneratorArguments(['v14/fontawesome', 'v13/fontawesome']),
      /Unexpected second primary bundle path/
    );
  });
});
