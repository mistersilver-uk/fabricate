import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  freeIconNamesFrom,
  intersectWithFreeIconNames,
  readFreeIconNames,
  renderCatalogueModule,
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

// Every bundle the project has measured — Foundry 13's Font Awesome 6, Foundry 14's 7, and Free
// 7.3.1 — assigns glyphs with `--fa`, so this fixture carries the two-declaration body Foundry 13
// ships alongside the single-declaration body Foundry 14 does.
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
const MEASUREMENTS = {
  foundryVersion: '14.365.0',
  glyphRules: 3,
  declaredNames: 5,
  multiNameRules: 1,
  classicGlyphs: 3,
  offeredGlyphs: 3,
  brandGlyphs: 0,
  classicFaceCodepoints: 3,
};

const FIXTURE_DEFINITIONS = [
  { iconCode: '0', label: '0', aliases: [] },
  { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
  { iconCode: 'yen', label: 'Yen', aliases: ['cny', 'jpy'] },
];

function renderFixtureModule(definitions = FIXTURE_DEFINITIONS) {
  return renderCatalogueModule({
    release: RELEASE,
    freeRelease: FREE_RELEASE,
    definitions,
    measurements: { ...MEASUREMENTS, offeredGlyphs: definitions.length },
  });
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

  it('records the free release it was narrowed to, beside the bundle it was measured from', async () => {
    const { FOUNDRY_ICON_FREE_INTERSECTION: intersection } =
      await importModuleText(renderFixtureModule());

    assert.deepEqual({ ...intersection }, FREE_RELEASE);
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
      freeRelease: FOUNDRY_ICON_FREE_INTERSECTION,
      definitions: FOUNDRY_ICON_DEFINITIONS,
      measurements: {
        ...MEASUREMENTS,
        foundryVersion: FOUNDRY_ICON_BUNDLE_RELEASE.foundryVersion,
        offeredGlyphs: FOUNDRY_ICON_DEFINITIONS.length,
      },
    });

    assert.deepEqual(
      readEmittedRows(committed),
      readEmittedRows(rendered),
      'the committed rows are what this renderer emits for the entries it exports; regenerate on drift'
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

  // An alias is recorded in the committed file, searched by the picker and resolved for stored
  // data, so it is a referenced name in exactly the sense the Pro licence forbids. Keeping the
  // glyph while keeping its Pro-only spelling would clear nothing.
  it('drops a Pro-only alias from a glyph it keeps, because an alias is a referenced name', () => {
    const narrowed = intersectWithFreeIconNames(
      [{ iconCode: 'star', label: 'Star', aliases: ['star-sharp', 'star-christmas'] }],
      FREE_NAMES
    );

    assert.deepEqual(narrowed, [{ iconCode: 'star', label: 'Star', aliases: [] }]);
  });

  // No entry needs this against Foundry 14's bundle and Free 7.3.1 — every surviving glyph's
  // offered name is already free. It is asserted anyway because the alternative to re-offering is
  // emitting a Pro name, and a later release moving one preference is not something to discover
  // from a licence complaint.
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

  // The oracle decides what Fabricate may write down, so a Pro stylesheet reaching it would not
  // narrow the catalogue at all while looking exactly like a run that had.
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

// THE LICENSING GUARD. Foundry ships Font Awesome Pro under a licence that forbids a third-party
// package developer from having the icons "used, re-packaged, or referenced in code", and a
// catalogue of names is a reference in code. The committed catalogue is therefore narrowed to the
// names Font Awesome publishes for free, and this is the check that keeps it narrowed: a
// regeneration against a Foundry install, or a hand-edit, that re-admits a Pro-only name fails CI
// here rather than shipping.
//
// It reads the free stylesheet from the `@fortawesome/fontawesome-free` devDependency through the
// generator's own resolver, so the guard and the generator cannot disagree about which file the
// free set is. That package is a NAME ORACLE: no font from it is shipped and nothing under `src/`
// imports it.
describe('the committed catalogue names only icons Font Awesome publishes for free', () => {
  // Resolved and read at collection, so a missing or unreadable devDependency throws HERE, naming
  // the package. A guard that fell back to an empty oracle would report every committed name as
  // free and pass loudest exactly when it had stopped checking anything.
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

  // The guard's own negative control, and the reason it is worth having. `candle-holder` renders
  // in Foundry, a companion module offers it, and this vocabulary declines it: it is a Pro-only
  // name. If this ever resolves, the free oracle has stopped discriminating and the assertion
  // above has stopped meaning anything.
  it('still declines the Pro-only glyph the whole narrowing was decided over', () => {
    assert.ok(!names.has('candle-holder'), 'candle-holder must be absent from the free set');
    assert.ok(
      FOUNDRY_ICON_DEFINITIONS.every(({ iconCode }) => iconCode !== 'candle-holder'),
      'candle-holder is Pro-only, so the catalogue must not offer it'
    );
  });
});
