import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { renderCatalogueModule } from '../scripts/generate-icon-catalogue.mjs';
import {
  assertClassicFaceParity,
  buildIconCatalogueFromRules,
  iconNamesFromRules,
  parseCompatibleIconGlyphRules,
  parseLegacyIconGlyphRules,
} from '../scripts/lib/fontAwesomeCompatibility.js';
import {
  FOUNDRY_ICON_BUNDLE_RELEASE,
  FOUNDRY_ICON_DEFINITIONS,
} from '../src/ui/svelte/util/foundryIconCatalogue.js';

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

const RELEASE = { edition: 'Pro', version: '7.2.0' };
const MEASUREMENTS = {
  foundryVersion: '14.365.0',
  glyphRules: 3,
  declaredNames: 5,
  multiNameRules: 1,
  classicGlyphs: 3,
  brandGlyphs: 0,
  classicFaceCodepoints: 3,
};

const FIXTURE_DEFINITIONS = [
  { iconCode: '0', label: '0', aliases: [] },
  { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
  { iconCode: 'yen', label: 'Yen', aliases: ['cny', 'jpy'] },
];

function renderFixtureModule(definitions = FIXTURE_DEFINITIONS) {
  return renderCatalogueModule({ release: RELEASE, definitions, measurements: MEASUREMENTS });
}

function readEmittedRows(moduleText) {
  const blob = /const ICON_ROWS = `\n([\S\s]*?)\n`;/.exec(moduleText);
  assert.ok(blob, 'the emitted module carries the entries in one ICON_ROWS template literal');
  return blob[1].split('\n');
}

async function importModuleText(moduleText) {
  const encoded = Buffer.from(moduleText, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

describe('icon catalogue module rendering', () => {
  it('emits the entries as one delimited text blob, not one object literal each', () => {
    const rendered = renderFixtureModule();

    assert.deepEqual(readEmittedRows(rendered), ['0|0', 'gear|Gear|cog', 'yen|Yen|cny,jpy']);
    assert.ok(
      !/iconCode: "/.test(rendered),
      'no per-entry object literal survives: that repetition is what SonarCloud reports as duplication'
    );
  });

  it('round-trips the blob back to the same frozen entries the generator was given', async () => {
    const { FOUNDRY_ICON_DEFINITIONS: parsed, FOUNDRY_ICON_BUNDLE_RELEASE: release } =
      await importModuleText(renderFixtureModule());

    assert.deepEqual(
      parsed.map(({ iconCode, label, aliases }) => ({ iconCode, label, aliases: [...aliases] })),
      FIXTURE_DEFINITIONS
    );
    assert.ok(Object.isFrozen(parsed), 'the exported array is frozen');
    assert.ok(
      parsed.every((entry) => Object.isFrozen(entry) && Object.isFrozen(entry.aliases)),
      'every entry and every alias list is frozen, so a filter cannot hand out a writable row'
    );
    assert.deepEqual({ ...release }, { ...RELEASE, foundryVersion: MEASUREMENTS.foundryVersion });
  });

  it('fails closed, naming the entry, on a value the row encoding cannot represent', () => {
    const unencodable = [
      { iconCode: 'pipe', label: 'Pipe|Split', aliases: [] },
      { iconCode: 'comma', label: 'Comma', aliases: ['a,b'] },
      { iconCode: 'newline', label: 'Line\nBreak', aliases: [] },
      { iconCode: 'backtick', label: 'End `Literal', aliases: [] },
      { iconCode: 'substitution', label: 'Sub ${x}', aliases: [] },
      { iconCode: 'backslash', label: 'Escape \\u0041', aliases: [] },
      { iconCode: 'sep|arator', label: 'Separator', aliases: [] },
    ];

    for (const definition of unencodable) {
      assert.throws(
        () => renderFixtureModule([definition]),
        new RegExp(`Icon "${definition.iconCode.replace('|', '\\|')}".*cannot represent`, 's'),
        `${definition.iconCode} must stop generation rather than emit a row that parses wrong`
      );
    }

    assert.throws(
      () => renderFixtureModule([{ iconCode: 'empty', label: '', aliases: [] }]),
      /Icon "empty" has an empty or non-string label/
    );
  });

  it('keeps the committed catalogue in step with the renderer', () => {
    const committed = fs.readFileSync(
      fileURLToPath(new URL('../src/ui/svelte/util/foundryIconCatalogue.js', import.meta.url)),
      'utf8'
    );
    const rendered = renderCatalogueModule({
      release: FOUNDRY_ICON_BUNDLE_RELEASE,
      definitions: FOUNDRY_ICON_DEFINITIONS,
      measurements: { ...MEASUREMENTS, foundryVersion: FOUNDRY_ICON_BUNDLE_RELEASE.foundryVersion },
    });

    assert.deepEqual(
      readEmittedRows(committed),
      readEmittedRows(rendered),
      'the committed rows are what this renderer emits for the entries it exports; regenerate on drift'
    );
  });
});
