#!/usr/bin/env node
/**
 * Emits `src/ui/svelte/util/foundryIconCatalogue.json` from the Font Awesome bundle a Foundry
 * install ships. Every name it writes must appear in the pinned free release, and CI fails on one
 * that does not: `tests/iconCatalogueGenerator.test.js`, with `candle-holder` as negative control.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  countLeadingTokens,
  iconLabelFor,
  parseFontAwesomeRelease,
  parseIconGlyphRules,
  preferredIconName,
  readWoff2Codepoints,
} from './lib/fontAwesomeBundle.js';
import {
  assertClassicFaceParity,
  buildIconCatalogueFromRules,
} from './lib/fontAwesomeCompatibility.js';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(
  REPOSITORY_ROOT,
  'src',
  'ui',
  'svelte',
  'util',
  'foundryIconCatalogue.json'
);

const CLASSIC_SOLID_FACE = 'fa-solid-900.woff2';
const CLASSIC_REGULAR_FACE = 'fa-regular-400.woff2';
const BRANDS_FACE = 'fa-brands-400.woff2';

/**
 * Where the free stylesheet lives, resolved through Node rather than by a relative path.
 *
 * Exported so the licensing guard reads the SAME file this generator intersected against. A test
 * that hard-coded `node_modules/...` would keep passing after a workspace layout moved the
 * package, and would then be guarding nothing.
 *
 * @returns {string} the path to `@fortawesome/fontawesome-free`'s `css/all.min.css`
 */
// eslint-disable-next-line unicorn/no-exports-in-scripts -- dual-mode CLI, imported by tests.
export function resolveFreeStylesheetPath() {
  const manifest = createRequire(import.meta.url).resolve(
    '@fortawesome/fontawesome-free/package.json'
  );
  return path.join(path.dirname(manifest), 'css', 'all.min.css');
}

/** How to name a Font Awesome release in prose. */
function releaseLabel(release) {
  if (release.version !== null && release.version !== undefined) {
    return `${release.edition} ${release.version}`;
  }
  return `${release.edition} ${release.major ?? 'unknown'}.x (no patch version in the bundle)`;
}

/**
 * Every icon name a Font Awesome FREE stylesheet publishes.
 *
 * Parsed with `parseIconGlyphRules` — the same reader the Foundry bundle goes through — so the two
 * sides of the intersection cannot disagree about what counts as a name. Brands are not filtered
 * out here and do not need to be: the catalogue this set is intersected with has already dropped
 * every brand glyph by codepoint, measured from the faces themselves.
 *
 * The edition is checked rather than assumed. This set decides what Fabricate is allowed to write
 * down, so a Pro stylesheet handed to it by mistake would not narrow the catalogue at all while
 * looking exactly like a run that had.
 *
 * @param {string} cssText a Font Awesome `all.min.css`
 * @param {string} [source] what to name in the error, when the text came from a file
 * @returns {{ release: { edition: string, version: string }, names: Set<string> }}
 */
// eslint-disable-next-line unicorn/no-exports-in-scripts -- dual-mode CLI, imported by tests.
export function freeIconNamesFrom(cssText, source = 'The stylesheet') {
  const release = parseFontAwesomeRelease(cssText);
  if (release.edition !== 'Free') {
    throw new Error(
      `${source} is Font Awesome ${releaseLabel(release)}, not a free release; ` +
        'it cannot be used as the free-name oracle.'
    );
  }
  return {
    // Narrowed to the documented pair.
    release: { edition: release.edition, version: release.version },
    names: new Set(parseIconGlyphRules(cssText).flatMap((rule) => rule.names)),
  };
}

/**
 * The free name set, read from the pinned `@fortawesome/fontawesome-free` devDependency.
 *
 * @returns {{ release: { edition: string, version: string }, names: Set<string> }}
 */
// eslint-disable-next-line unicorn/no-exports-in-scripts -- dual-mode CLI, imported by the guard.
export function readFreeIconNames(stylesheetPath = resolveFreeStylesheetPath()) {
  return freeIconNamesFrom(fs.readFileSync(stylesheetPath, 'utf8'), stylesheetPath);
}

/**
 * Keeps the glyphs Fabricate is licensed to name, and only the names it is licensed to write.
 *
 * A glyph survives when at least ONE of the names Foundry's bundle gives it is also a free name,
 * and it carries only those free names afterwards. Dropping a Pro-only alias is not tidying: an
 * alias is recorded in this file, searched by the picker and resolved for stored data, so it is a
 * referenced name in exactly the sense the Pro licence forbids.
 *
 * When the offered name is itself Pro-only while an alias is free, the entry is re-offered under
 * the free name via the catalogue's own tie-break rather than dropped — the glyph is licensed, so
 * refusing it would cost Foundry a drawing it is entitled to make. No entry needs this against
 * Foundry 14's bundle and Free 7.3.1; it is here so a later release cannot silently emit a Pro
 * name by leaving the preference alone.
 *
 * @param {Array<{ iconCode: string, label: string, aliases: ReadonlyArray<string> }>} definitions
 * @param {Set<string>} freeNames from `readFreeIconNames`
 * @returns {Array<{ iconCode: string, label: string, aliases: string[] }>}
 */
// eslint-disable-next-line unicorn/no-exports-in-scripts -- dual-mode CLI, imported by tests.
export function intersectWithFreeIconNames(definitions, freeNames) {
  const surviving = definitions
    .map((definition) => ({
      definition,
      names: [definition.iconCode, ...definition.aliases].filter((name) => freeNames.has(name)),
    }))
    .filter(({ names }) => names.length > 0);

  const leadingTokenCounts = countLeadingTokens(surviving.flatMap(({ names }) => names));

  return surviving
    .map(({ definition, names }) => {
      const iconCode = names.includes(definition.iconCode)
        ? definition.iconCode
        : preferredIconName(names, leadingTokenCounts);
      return {
        iconCode,
        label: iconLabelFor(iconCode),
        aliases: names
          .filter((name) => name !== iconCode)
          .sort((left, right) => (left < right ? -1 : 1)),
      };
    })
    .sort((left, right) => (left.iconCode < right.iconCode ? -1 : 1));
}

// The catalogue's row encoding. One string per glyph, `iconCode|label|alias,alias`, with the alias
// field omitted when a glyph has no other names.
const FIELD_DELIMITER = '|';
const ALIAS_DELIMITER = ',';

// Anything that could end a field or a row. The backtick, backslash and `${` cases are inert
// under JSON escaping and stay refused anyway: a row is a string a human reads in review.
const UNENCODABLE_FIELD = /[|,`\\\n\r\u{2028}\u{2029}]|\$\{/u;

/**
 * Fails generation rather than emitting a row that would parse back into something else.
 *
 * A catalogue is only worth committing if it says what the bundle measured, so an unencodable
 * value is a stop, not an escape-and-continue: escaping would put the burden of getting the
 * round-trip right on every future reader of the generated file.
 */
function assertEncodableField(value, field, iconCode) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Icon "${iconCode}" has an empty or non-string ${field}.`);
  }
  if (UNENCODABLE_FIELD.test(value)) {
    throw new Error(
      `Icon "${iconCode}" has a ${field} the row encoding cannot represent: ${JSON.stringify(value)}. ` +
        'A field may not contain "|", ",", a newline, a backtick, a backslash or a dollar-brace.'
    );
  }
}

function renderCatalogueRow({ iconCode, label, aliases }) {
  assertEncodableField(iconCode, 'iconCode', iconCode);
  assertEncodableField(label, 'label', iconCode);
  for (const alias of aliases) {
    assertEncodableField(alias, 'alias', iconCode);
  }

  const fields = [iconCode, label];
  if (aliases.length > 0) {
    fields.push(aliases.join(ALIAS_DELIMITER));
  }
  return fields.join(FIELD_DELIMITER);
}

// Exported as well as run: the round-trip test renders the catalogue and parses it back, which is
// the only check that the emitted row encoding still decodes to the entries measured.
// eslint-disable-next-line unicorn/no-exports-in-scripts -- dual-mode CLI, imported by tests.
export function renderCatalogueJson({ release, freeRelease, definitions, measurements }) {
  const catalogue = {
    bundleRelease: {
      edition: release.edition,
      version: release.version ?? null,
      foundryVersion: measurements.foundryVersion,
    },
    freeIntersection: { edition: freeRelease.edition, version: freeRelease.version },
    rows: definitions.map((definition) => renderCatalogueRow(definition)),
  };
  return `${JSON.stringify(catalogue, null, 2)}\n`;
}

function readFoundryVersion(bundleRoot) {
  // <foundry>/resources/app/public/fonts/fontawesome -> <foundry>/resources/app/package.json
  const packagePath = path.resolve(bundleRoot, '..', '..', '..', 'package.json');
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolveBundle(argument) {
  if (!argument) {
    throw new Error(
      "Pass the path to Foundry's bundled fontawesome directory, or to the all.min.css inside it."
    );
  }
  const resolved = path.resolve(argument);
  const bundleRoot = resolved.endsWith('.css') ? path.resolve(resolved, '..', '..') : resolved;
  const stylesheet = resolved.endsWith('.css')
    ? resolved
    : path.join(bundleRoot, 'css', 'all.min.css');
  if (!fs.existsSync(stylesheet)) {
    throw new Error(`No stylesheet at ${stylesheet}.`);
  }
  return { bundleRoot, stylesheet, webfonts: path.join(bundleRoot, 'webfonts') };
}

/** Everything the generator reports about the bundle it measured. */
function measureBundle({ foundryVersion, rules, definitions, offered, brandCodepoints, classic }) {
  return {
    foundryVersion,
    glyphRules: rules.length,
    declaredNames: rules.reduce((total, rule) => total + rule.names.length, 0),
    multiNameRules: rules.filter((rule) => rule.names.length > 1).length,
    classicGlyphs: definitions.length,
    offeredGlyphs: offered.length,
    brandGlyphs: rules.filter((rule) => brandCodepoints.has(rule.codepoint)).length,
    classicFaceCodepoints: classic.size,
  };
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const { bundleRoot, stylesheet, webfonts } = resolveBundle(
    args.find((arg) => !arg.startsWith('--'))
  );

  const cssText = fs.readFileSync(stylesheet, 'utf8');
  const release = parseFontAwesomeRelease(cssText);
  const foundryVersion = readFoundryVersion(bundleRoot);

  const classicCodepoints = readWoff2Codepoints(path.join(webfonts, CLASSIC_SOLID_FACE));
  const regularCodepoints = readWoff2Codepoints(path.join(webfonts, CLASSIC_REGULAR_FACE));
  const brandCodepoints = readWoff2Codepoints(path.join(webfonts, BRANDS_FACE));

  assertClassicFaceParity(
    classicCodepoints,
    regularCodepoints,
    `Foundry ${foundryVersion} / Font Awesome ${releaseLabel(release)}`
  );

  const rules = parseIconGlyphRules(cssText);
  if (rules.length === 0) {
    throw new Error(
      `Foundry ${foundryVersion} / Font Awesome ${releaseLabel(release)} yielded no icon glyph rules.`
    );
  }
  // Grouped by codepoint, not by rule.
  const definitions = buildIconCatalogueFromRules({ rules, classicCodepoints, brandCodepoints });

  const { release: freeRelease, names: freeNames } = readFreeIconNames();
  const offered = intersectWithFreeIconNames(definitions, freeNames);
  if (offered.length === 0) {
    throw new Error(
      `No glyph in Foundry ${foundryVersion}'s bundle carries a name Font Awesome ` +
        `${freeRelease.edition} ${freeRelease.version} publishes; the free oracle looks wrong.`
    );
  }

  const measurements = measureBundle({
    foundryVersion,
    rules,
    definitions,
    offered,
    brandCodepoints,
    classic: classicCodepoints,
  });

  const rendered = renderCatalogueJson({
    release,
    freeRelease,
    definitions: offered,
    measurements,
  });

  if (checkOnly) {
    const committed = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : '';
    if (committed === rendered) {
      console.log(
        `Up to date: ${measurements.offeredGlyphs} icons from Font Awesome ${release.edition} ` +
          `${release.version} narrowed to ${freeRelease.edition} ${freeRelease.version}.`
      );
      return;
    }
    console.error(
      `OUT OF DATE. This bundle is Font Awesome ${releaseLabel(release)} with ` +
        `${measurements.classicGlyphs} classic icons, ${measurements.offeredGlyphs} of them named by ` +
        `${freeRelease.edition} ${freeRelease.version}; the committed catalogue does not match it.`
    );
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, rendered);
  console.log(
    `Wrote ${measurements.offeredGlyphs} icons of the ${measurements.classicGlyphs} classic glyphs ` +
      `(${measurements.declaredNames} names over ${measurements.glyphRules} glyphs, ` +
      `${measurements.brandGlyphs} brand glyphs excluded) from Font Awesome ${release.edition} ` +
      `${release.version} in Foundry ${measurements.foundryVersion}, narrowed to the names ` +
      `${freeRelease.edition} ${freeRelease.version} publishes.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
