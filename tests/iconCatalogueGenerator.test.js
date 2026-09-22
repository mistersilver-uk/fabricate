import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// `prettier/index.mjs`, not `prettier`: `npm test` runs under `--conditions=browser`, which
// resolves the bare specifier to the standalone build, and that build has no `resolveConfig`.
import { check as prettierCheck, resolveConfig } from 'prettier/index.mjs';

import {
  freeIconNamesFrom,
  intersectWithFreeIconNames,
  readFreeIconNames,
  renderCatalogueJson,
  resolveFreeStylesheetPath,
} from '../scripts/generate-icon-catalogue.mjs';
import {
  assertClassicFaceParity,
  buildIconCatalogueFromRules,
} from '../scripts/lib/fontAwesomeCompatibility.js';
import { parseIconGlyphRules } from '../scripts/lib/fontAwesomeBundle.js';
import {
  FOUNDRY_ICON_BUNDLE_RELEASE,
  FOUNDRY_ICON_DEFINITIONS,
  FOUNDRY_ICON_FREE_INTERSECTION,
} from '../src/ui/svelte/util/foundryIconCatalogue.js';

const BACKSLASH = '\\';

// Every bundle measured so far assigns glyphs with `--fa`, so this fixture carries Foundry 13's
// two-declaration body alongside Foundry 14's single-declaration one.
const MODERN_STYLESHEET = [
  '/*! Font Awesome Pro 7.2.0 */',
  `.fa-cog,.fa-gear{--fa:"${BACKSLASH}f013";--fa--fa:"${BACKSLASH}f013"}`,
  `.fa-0{--fa:"${BACKSLASH}30 "}`,
  `.fa-github{--fa:"${BACKSLASH}f09b"}`,
  '.fa-spin{animation-name:fa-spin}',
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

  it('builds a catalogue one glyph at a time and excludes brand codepoints', () => {
    const rules = parseIconGlyphRules(MODERN_STYLESHEET);
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
const FREE_RELEASE = { edition: 'Free', version: '7.3.1' };
const MEASUREMENTS = { foundryVersion: '14.365.0' };

const FIXTURE_DEFINITIONS = [
  { iconCode: '0', label: '0', aliases: [] },
  { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
  { iconCode: 'yen', label: 'Yen', aliases: ['cny', 'jpy'] },
];

const CATALOGUE_PATH = fileURLToPath(
  new URL('../src/ui/svelte/util/foundryIconCatalogue.json', import.meta.url)
);

function renderFixtureJson(definitions = FIXTURE_DEFINITIONS) {
  return renderCatalogueJson({
    release: RELEASE,
    freeRelease: FREE_RELEASE,
    definitions,
    measurements: MEASUREMENTS,
  });
}

function readEmittedRows(catalogueText) {
  return JSON.parse(catalogueText).rows;
}

function decodeRow(row) {
  const [iconCode, label, aliases] = row.split('|');
  return { iconCode, label, aliases: aliases === undefined ? [] : aliases.split(',') };
}

/** The one read of a `src/` file here; `tests/source-pin-ledger.txt` pins this module at one. */
function readCommittedCatalogue() {
  return fs.readFileSync(CATALOGUE_PATH, 'utf8');
}

function renderFromExports() {
  return renderCatalogueJson({
    release: FOUNDRY_ICON_BUNDLE_RELEASE,
    freeRelease: FOUNDRY_ICON_FREE_INTERSECTION,
    definitions: FOUNDRY_ICON_DEFINITIONS,
    measurements: { foundryVersion: FOUNDRY_ICON_BUNDLE_RELEASE.foundryVersion },
  });
}

describe('icon catalogue JSON rendering', () => {
  it('emits the entries as delimited strings, not one object literal each', () => {
    const rendered = renderFixtureJson();

    assert.deepEqual(readEmittedRows(rendered), ['0|0', 'gear|Gear|cog', 'yen|Yen|cny,jpy']);
    assert.ok(
      !/"iconCode"/.test(rendered),
      'no per-entry object literal survives: that repetition is what SonarCloud reports as duplication'
    );
  });

  it('records both releases beside the rows, in the shape the loader exports', () => {
    const { bundleRelease, freeIntersection } = JSON.parse(renderFixtureJson());

    assert.deepEqual(bundleRelease, {
      ...RELEASE,
      foundryVersion: MEASUREMENTS.foundryVersion,
    });
    assert.deepEqual(freeIntersection, FREE_RELEASE);
  });

  it('round-trips the committed rows back to the entries the loader exports', () => {
    assert.deepEqual(
      FOUNDRY_ICON_DEFINITIONS.map(({ iconCode, label, aliases }) => ({
        iconCode,
        label,
        aliases: [...aliases],
      })),
      readEmittedRows(readCommittedCatalogue()).map((row) => decodeRow(row))
    );
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
        () => renderFixtureJson([definition]),
        new RegExp(`Icon "${definition.iconCode.replace('|', '\\|')}".*cannot represent`, 's'),
        `${definition.iconCode} must stop generation rather than emit a row that parses wrong`
      );
    }

    assert.throws(
      () => renderFixtureJson([{ iconCode: 'empty', label: '', aliases: [] }]),
      /Icon "empty" has an empty or non-string label/
    );
  });

  it('keeps the committed catalogue byte-identical to what the renderer emits', () => {
    assert.equal(
      readCommittedCatalogue(),
      renderFromExports(),
      'the committed JSON is what this renderer emits for the entries it exports; regenerate on drift'
    );
  });

  // Output needing reformatting would fail `format:check` with no way to regenerate past it.
  it('emits JSON that is already Prettier-clean', async () => {
    const options = await resolveConfig(CATALOGUE_PATH);

    assert.ok(
      await prettierCheck(renderFromExports(), { ...options, filepath: CATALOGUE_PATH }),
      'the renderer must emit exactly what Prettier would format the catalogue to'
    );
  });
});

describe('narrowing the catalogue to the names Font Awesome publishes for free', () => {
  const FREE_NAMES = new Set(['gear', 'cog', 'star', 'wand-sparkles', 'magic']);

  it('keeps a glyph that carries a free name and drops one that carries none', () => {
    const narrowed = intersectWithFreeIconNames(
      [
        { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
        { iconCode: 'candle-holder', label: 'Candle Holder', aliases: [] },
      ],
      FREE_NAMES
    );

    assert.deepEqual(narrowed, [{ iconCode: 'gear', label: 'Gear', aliases: ['cog'] }]);
  });

  // An alias is a referenced name in exactly the sense the Pro licence forbids.
  it('drops a Pro-only alias from a glyph it keeps, because an alias is a referenced name', () => {
    const narrowed = intersectWithFreeIconNames(
      [{ iconCode: 'star', label: 'Star', aliases: ['star-sharp', 'star-christmas'] }],
      FREE_NAMES
    );

    assert.deepEqual(narrowed, [{ iconCode: 'star', label: 'Star', aliases: [] }]);
  });

  // No entry needs this against Foundry 14's bundle and Free 7.3.1.
  it('re-offers a kept glyph under a free name when its offered name is Pro-only', () => {
    const narrowed = intersectWithFreeIconNames(
      [{ iconCode: 'wand-magic-sparkles', label: 'Wand Magic Sparkles', aliases: ['magic'] }],
      FREE_NAMES
    );

    assert.deepEqual(narrowed, [{ iconCode: 'magic', label: 'Magic', aliases: [] }]);
  });

  it('sorts by the offered name, so re-offering cannot leave the catalogue out of order', () => {
    const narrowed = intersectWithFreeIconNames(
      [
        { iconCode: 'star', label: 'Star', aliases: [] },
        { iconCode: 'wand-magic-sparkles', label: 'Wand Magic Sparkles', aliases: ['magic'] },
        { iconCode: 'gear', label: 'Gear', aliases: [] },
      ],
      FREE_NAMES
    );

    assert.deepEqual(
      narrowed.map(({ iconCode }) => iconCode),
      ['gear', 'magic', 'star']
    );
  });

  // A Pro stylesheet as oracle would not narrow the catalogue, while looking like a run that had.
  it('refuses a stylesheet that is not a free release, rather than trusting it as the oracle', () => {
    assert.throws(
      () => freeIconNamesFrom(MODERN_STYLESHEET, 'fixture'),
      /fixture is Font Awesome Pro 7\.2\.0, not a free release/
    );
    assert.throws(() => freeIconNamesFrom('.fa-gear{--fa:"x"}'), /carries no Font Awesome banner/);
    assert.deepEqual(
      freeIconNamesFrom(MODERN_STYLESHEET.replace('Pro', 'Free')).names,
      new Set(['cog', 'gear', '0', 'github'])
    );
  });
});

// The licensing guard. Why a catalogue of names is a reference in code, and why the intersection
// is not optional: `openspec/specs/ui-visual-style/spec.md`, `#### Icon vocabulary`.
describe('the committed catalogue names only icons Font Awesome publishes for free', () => {
  // Resolved and read at collection, so a missing devDependency throws here, naming the package.
  const stylesheetPath = resolveFreeStylesheetPath();
  const { release, names } = readFreeIconNames(stylesheetPath);

  it('reads its oracle from the pinned devDependency the catalogue records', () => {
    assert.ok(
      stylesheetPath.includes(path.join('@fortawesome', 'fontawesome-free')),
      `the oracle must be the devDependency, not a stray stylesheet at ${stylesheetPath}`
    );
    assert.deepEqual(
      { ...FOUNDRY_ICON_FREE_INTERSECTION },
      release,
      'the catalogue was narrowed against a different free release than the one installed; regenerate it'
    );
    assert.ok(names.size > 1000, `the free oracle yielded only ${names.size} names, so it misparsed`);
  });

  it('offers no name outside the free set, under any spelling', () => {
    const referenced = FOUNDRY_ICON_DEFINITIONS.flatMap(({ iconCode, aliases }) => [
      iconCode,
      ...aliases,
    ]);
    const proOnly = referenced.filter((name) => !names.has(name));

    assert.deepEqual(
      proOnly,
      [],
      `${proOnly.length} committed name(s) are absent from Font Awesome ${release.edition} ` +
        `${release.version} and may not be referenced in code: ${proOnly.slice(0, 20).join(', ')}`
    );
  });

  // The guard's negative control: `candle-holder` renders in Foundry, and is a Pro-only name.
  it('still declines the Pro-only glyph the whole narrowing was decided over', () => {
    assert.ok(!names.has('candle-holder'), 'candle-holder must be absent from the free set');
    assert.ok(
      FOUNDRY_ICON_DEFINITIONS.every(({ iconCode }) => iconCode !== 'candle-holder'),
      'candle-holder is Pro-only, so the catalogue must not offer it'
    );
  });
});
