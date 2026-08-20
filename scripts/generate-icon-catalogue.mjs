#!/usr/bin/env node
/**
 * Regenerates Fabricate's icon catalogue from the Font Awesome bundle a Foundry install ships,
 * intersected with the names Font Awesome publishes in its free release.
 *
 * The catalogue is committed rather than built, because CI has no Foundry install to read. This
 * script exists so that regenerating it is reproducible instead of archaeological: run it against
 * the Foundry version whose bundle the catalogue should describe.
 *
 *   node scripts/generate-icon-catalogue.mjs \
 *     "C:/Program Files/Foundry Virtual Tabletop/resources/app/public/fonts/fontawesome"
 *
 * The argument is the bundled `fontawesome` directory, or the `all.min.css` inside it. Pass
 * `--check` to compare against the committed file without writing, which is what a maintainer
 * runs after a Foundry upgrade to find out whether the bundle moved.
 *
 * THE FREE INTERSECTION. Foundry ships Font Awesome Pro under its own commercial licence, and the
 * licence it ships alongside it (`public/fonts/fontawesome/LICENSE.txt`) says Pro icons "may not
 * be used, re-packaged, or referenced in code by third party package developers" without a Pro
 * licence of their own. A catalogue of names IS a reference in code, so this generator keeps only
 * the glyphs Foundry's bundle can draw whose names Font Awesome also publishes for free, and
 * records only those free names. See the header it emits for the full reasoning.
 *
 * `@fortawesome/fontawesome-free` is a devDependency and a NAME ORACLE only: it is read here at
 * generation time and by the licensing guard in tests/iconCatalogueGenerator.test.js. Nothing
 * under `src/` imports it and no file from it is ever shipped, so Fabricate distributes no font.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildIconCatalogue,
  countLeadingTokens,
  iconLabelFor,
  parseFontAwesomeRelease,
  parseIconGlyphRules,
  preferredIconName,
  readWoff2Codepoints,
} from './lib/fontAwesomeBundle.js';
import { assertClassicFaceParity } from './lib/fontAwesomeCompatibility.js';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(
  REPOSITORY_ROOT,
  'src',
  'ui',
  'svelte',
  'util',
  'foundryIconCatalogue.js'
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

/**
 * How to name a Font Awesome release in prose.
 *
 * Foundry 13's rebuild strips the `/*! Font Awesome … *\/` banner, so its bundle states an edition
 * and a major through its `font-family` literal but no patch version at all. Naming that release
 * `Pro null` would read as a parse failure rather than as the measurement it is.
 *
 * @param {{ edition: string, version: string|null, major?: number|null }} release
 * @returns {string}
 */
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
    // Narrowed to the documented pair. `parseFontAwesomeRelease` also reports the major it read
    // and the evidence it read it from, which the smoke arms need and a committed constant does
    // not — carrying them here would put them in the generated file by accident.
    release: { edition: release.edition, version: release.version },
    names: new Set(parseIconGlyphRules(cssText).flatMap((rule) => rule.names)),
  };
}

/**
 * The free name set, read from the pinned `@fortawesome/fontawesome-free` devDependency.
 *
 * @param {string} [stylesheetPath]
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

// The catalogue's row encoding. One entry per line as `iconCode|label|alias,alias`, with the alias
// field omitted when a glyph has no other names. See the emitted header for why the entries are a
// text blob rather than one object literal each. The emitted module spells these delimiters
// literally in its own parser; the round-trip test in tests/iconCatalogueGenerator.test.js is what
// holds the two halves of the grammar together.
const ROW_DELIMITER = '\n';
const FIELD_DELIMITER = '|';
const ALIAS_DELIMITER = ',';

// Anything that could end a field, end a row, end the template literal that holds the rows, or
// begin an escape or a substitution inside it.
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

// Exported as well as run: the catalogue round-trip test renders a module and parses it back,
// which is the only check that the emitted row encoding still decodes to the entries measured.
// eslint-disable-next-line unicorn/no-exports-in-scripts -- dual-mode CLI, imported by tests.
export function renderCatalogueModule({ release, freeRelease, definitions, measurements }) {
  const rows = definitions.map((definition) => renderCatalogueRow(definition)).join(ROW_DELIMITER);
  const proOnlyGlyphs = measurements.classicGlyphs - measurements.offeredGlyphs;

  return `// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/generate-icon-catalogue.mjs <foundry>/resources/app/public/fonts/fontawesome
//
// The icons Fabricate offers: every glyph the Font Awesome bundle Foundry ships can render whose
// name Font Awesome ALSO publishes in its free release. Both halves are measured rather than taken
// from published metadata — the first from the stylesheet a Foundry install serves, the second
// from the \`@fortawesome/fontawesome-free\` devDependency.
//
// Foundry bundles Font Awesome ${releaseLabel(release)}.
// The free release intersected against is Font Awesome ${freeRelease.edition} ${freeRelease.version}.
//
// WHY THE INTERSECTION IS NOT OPTIONAL. Foundry ships Font Awesome Pro under its own commercial
// licence and puts the terms in the bundle, at \`public/fonts/fontawesome/LICENSE.txt\`, in both
// the 13 and the 14 lines:
//
//   "Font Awesome Pro is included under commercial license by Foundry Gaming LLC for their own
//    usage in Foundry Virtual Tabletop. Font Awesome icons included in the Font Awesome Pro icon
//    set may not be used, re-packaged, or referenced in code by third party package developers
//    unless they obtain their own Font Awesome Pro license from https://fontawesome.com/."
//
// Fabricate is a third-party package developer and holds no Pro licence, and a catalogue of names
// is exactly what "referenced in code" describes. Shipping no \`.woff2\` is therefore not enough to
// clear the clause — the NAME is the thing it names. So a glyph is offered only when at least one
// of the names Foundry's bundle gives it also appears in the free stylesheet, and only its free
// names are recorded, because an alias is a referenced name too: it is searched by the picker and
// resolved for data a GM already saved.
//
// What that leaves is a name Font Awesome publishes itself, under CC BY 4.0 for the icons and SIL
// OFL 1.1 for the fonts. Fabricate may write it. Foundry then draws it from whichever face that
// client has loaded — the Pro face, on a Pro-bundled Foundry — which is Foundry's own licensed use
// of its own font, from a name Fabricate did not take from Foundry's copy of it.
//
// The oracle is a devDependency and NOTHING under \`src/\` imports it: it is read at generation
// time, and by the licensing guard in tests/iconCatalogueGenerator.test.js that fails CI when any
// committed name leaves the free set. It is version-pinned exactly rather than by range, because
// the names it publishes are what decide what this file is allowed to contain.
//
// Measured from Foundry ${measurements.foundryVersion}'s bundle:
//   ${measurements.glyphRules} rules assign a glyph, over ${measurements.declaredNames} \`.fa-\` names.
//   ${measurements.classicGlyphs} of those glyphs are classic; the rest are the ${measurements.brandGlyphs} the brands face draws.
//   The classic solid and regular faces carry an identical ${measurements.classicFaceCodepoints}-codepoint cmap.
//   ${measurements.offeredGlyphs} classic glyphs carry a free name and are the entries below.
//   The other ${proOnlyGlyphs} are Pro-only names, every one of which Foundry draws and this declines to write.
//
// \`candle-holder\` is the worked example, and it now runs the other way round. Foundry renders it,
// a companion module offers it, and this catalogue deliberately does NOT — it is a Pro-only name,
// so writing \`fas fa-candle-holder\` would be Fabricate referencing a Pro icon in code. It is not
// absent because it could not be measured; it was measured, and then declined.
//
// THE ENTRY SHAPE, and the three decisions behind it:
//
// \`iconCode\` — the name the vocabulary offers and persists. Several names routinely share one
// glyph (\`.fa-baby-carriage,.fa-carriage-baby{--fa:"\\f77d"}\` is one picture under two names), so
// there is one entry per GLYPH, not per name. Which name is offered is a presentation choice and
// not a claim about Font Awesome's canonical spelling: the bundle cannot answer that, because
// every one of its ${measurements.multiNameRules} multi-name selector lists is sorted alphabetically and the order
// therefore carries no information. \`preferredIconName\` in scripts/lib/fontAwesomeBundle.js states
// the tie-break it uses instead.
//
// \`aliases\` — every other FREE name the bundle gives the same glyph, kept rather than discarded.
// They are searchable and they resolve, so offering one name refuses none: a GM who types \`cog\`
// finds the gear, and a module that persisted \`fas fa-cog\` gets the gear's row. They also make the
// curated vocabulary's exclusions sound, because an exclusion describes what a glyph DEPICTS and a
// depiction cannot be dodged by spelling: \`automobile\` is the same drawing as \`car\`.
//
// \`hasRegular\` — GONE, and deliberately so rather than left stale. It was meaningful under the
// old free-metadata catalogue, where the regular weight covered a small subset. It is not
// meaningful here, because the classic solid and regular faces Foundry ships carry the same
// ${measurements.classicFaceCodepoints} codepoints: the field would read \`true\` for every entry and distinguish nothing,
// while making a picker offer two rows of the same drawing at two weights. The \`far\` prefix is
// still accepted and still renders; it is simply not a second row.
//
// THE ROW ENCODING, and why the entries below are text rather than object literals. One entry per
// line, fields separated by \`|\`: \`iconCode|label|alias,alias\`, with the alias field omitted when
// a glyph has no other names. The obvious form — one object literal per glyph — is what this file
// used to hold, and it read well; it also handed a copy-paste detector thousands of near-identical
// token sequences, and SonarCloud duly failed this file as duplicated new code. A template literal
// is ONE token, so the same data costs one. The generator refuses to emit a field containing a
// delimiter, a newline, a backtick, a backslash or a \`\${\` — it throws, naming the entry — because
// a file that parses back into something other than what was measured is worse than a generation
// that fails. Parsing costs one split per file and two per row, at module load.
//
// VERSION COUPLING, on both sides. This file describes ONE Foundry release's bundle narrowed by
// ONE free release's names. When Foundry bumps Font Awesome, rerun the generator against the new
// install: names are added, and Font Awesome does retire and re-alias names between majors, so an
// icon a GM chose can become an alias of another glyph. When the free release moves, rerun it too
// — Font Awesome promotes Pro icons into the free set, and each promotion is an icon Fabricate may
// now offer and does not. Running the generator with \`--check\` reports whether either moved
// without writing.

const ICON_ROWS = \`
${rows}
\`;

const definitions = ICON_ROWS.split('\\n')
  .filter((row) => row.length > 0)
  .map((row) => {
    const [iconCode, label, aliases] = row.split('|');
    return Object.freeze({
      iconCode,
      label,
      aliases: Object.freeze(aliases === undefined ? [] : aliases.split(',')),
    });
  });

/**
 * Every icon Foundry's bundled Font Awesome can render under a name Font Awesome publishes for
 * free, brands excluded.
 *
 * Frozen ENTRY BY ENTRY, not just as an array: \`Object.freeze\` is shallow, and the curated
 * vocabulary is a filter of this array, so an unfrozen entry would hand any caller a writable
 * handle on a row every Fabricate picker renders from.
 *
 * @type {ReadonlyArray<{ iconCode: string, label: string, aliases: ReadonlyArray<string> }>}
 */
export const FOUNDRY_ICON_DEFINITIONS = Object.freeze(definitions);

/** The Font Awesome release Foundry bundles, which this catalogue was measured from. */
export const FOUNDRY_ICON_BUNDLE_RELEASE = Object.freeze({
  edition: '${release.edition}',
  version: ${release.version === null ? 'null' : `'${release.version}'`},
  foundryVersion: '${measurements.foundryVersion}',
});

/**
 * The free release whose names this catalogue was narrowed to.
 *
 * Recorded rather than inferred so the licensing guard can say WHICH free set the committed names
 * were checked against, and fail when the pinned devDependency moves away from it.
 */
export const FOUNDRY_ICON_FREE_INTERSECTION = Object.freeze({
  edition: '${freeRelease.edition}',
  version: '${freeRelease.version}',
});
`;
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

/**
 * Everything the emitted module reports about the bundle it was measured from.
 *
 * The bundle counts describe what Foundry can DRAW and stay whole; `offeredGlyphs` is the only one
 * narrowed by the free intersection, so the header can say both numbers and the gap between them.
 */
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
  const definitions = buildIconCatalogue({ cssText, classicCodepoints, brandCodepoints });

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

  const rendered = renderCatalogueModule({
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
