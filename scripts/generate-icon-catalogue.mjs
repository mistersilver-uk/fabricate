#!/usr/bin/env node
/**
 * Regenerates Fabricate's icon catalogue from the Font Awesome bundle a Foundry install ships.
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
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildIconCatalogue,
  parseFontAwesomeRelease,
  parseIconGlyphRules,
  readWoff2Codepoints,
} from './lib/fontAwesomeBundle.js';
import {
  assertClassicFaceParity,
  buildIconCatalogueFromRules,
  parseCompatibleIconGlyphRules,
} from './lib/fontAwesomeCompatibility.js';

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

function renderCatalogueModule({ release, definitions, measurements }) {
  const entries = definitions
    .map(({ iconCode, label, aliases }) => {
      const aliasList =
        aliases.length === 0 ? '[]' : `[${aliases.map((alias) => `"${alias}"`).join(', ')}]`;
      return `  { iconCode: "${iconCode}", label: "${label}", aliases: ${aliasList} }`;
    })
    .join(',\n');

  return `// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/generate-icon-catalogue.mjs <foundry>/resources/app/public/fonts/fontawesome
//
// Every icon the Font Awesome bundle Foundry ships can render, measured from that bundle rather
// than from Font Awesome's published metadata. The predecessor of this file was generated from
// Font Awesome Free 6.7.2 metadata, which describes a DIFFERENT font from the one a Foundry client
// loads: Foundry bundles Font Awesome ${release.edition} ${release.version}. An icon Foundry renders was
// therefore unofferable whenever the free release happened to lack it, which is why
// \`candle-holder\` — a Pro icon that renders correctly in Foundry today — was absent.
//
// WHAT THIS FILE IS AND IS NOT LICENSED TO DO. Font Awesome Pro's font files are Foundry's to
// ship and Foundry ships them; this file bundles none of them. It records NAMES, and a name is a
// configuration value that Foundry's own stylesheet resolves against the font a Foundry client has
// already loaded. Writing \`fas fa-candle-holder\` and letting Foundry draw it is using Foundry as
// it is meant to be used; copying a \`.woff2\` into a module is not, and nothing here does. The
// generator reads the installed bundle to learn what exists and emits names, never glyph outlines.
// Ruled by the maintainer, and it governs the whole vocabulary rather than the two glyphs the
// question was first raised about.
//
// Measured from Foundry ${measurements.foundryVersion}'s bundle:
//   ${measurements.glyphRules} rules assign a glyph, over ${measurements.declaredNames} \`.fa-\` names.
//   ${measurements.classicGlyphs} of those glyphs are classic; the rest are the ${measurements.brandGlyphs} the brands face draws.
//   The classic solid and regular faces carry an identical ${measurements.classicFaceCodepoints}-codepoint cmap.
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
// \`aliases\` — every other name the bundle gives the same glyph, kept rather than discarded. They
// are searchable and they resolve, so offering one name refuses none: a GM who types \`cog\` finds
// the gear, and a module that persisted \`fas fa-cog\` gets the gear's row. They also make the
// curated vocabulary's exclusions sound, because an exclusion describes what a glyph DEPICTS and a
// depiction cannot be dodged by spelling: \`automobile\` is the same drawing as \`car\`.
//
// \`hasRegular\` — GONE, and deliberately so rather than left stale. It was meaningful under Font
// Awesome Free, where the regular weight covered a small subset. It is not meaningful here: the
// classic solid and regular faces Foundry ships carry the SAME ${measurements.classicFaceCodepoints} codepoints, so the field
// would read \`true\` for every entry and distinguish nothing, while making a picker offer two rows
// of the same drawing at two weights. The \`far\` prefix is still accepted and still renders; it is
// simply not a second row.
//
// VERSION COUPLING. This file describes ONE Foundry release's bundle. When Foundry bumps Font
// Awesome, rerun the generator against the new install: names are added, and Font Awesome does
// retire and re-alias names between majors, so an icon a GM chose can become an alias of another
// glyph. Running the generator with \`--check\` reports whether the bundle moved without writing.

const definitions = [
${entries}
];

for (const definition of definitions) {
  Object.freeze(definition.aliases);
  Object.freeze(definition);
}

/**
 * Every icon Foundry's bundled Font Awesome can render, brands excluded.
 *
 * Frozen ENTRY BY ENTRY, not just as an array: \`Object.freeze\` is shallow, and the curated
 * vocabulary is a filter of this array, so an unfrozen entry would hand any caller a writable
 * handle on a row every Fabricate picker renders from.
 *
 * @type {ReadonlyArray<{ iconCode: string, label: string, aliases: ReadonlyArray<string> }>}
 */
export const FOUNDRY_ICON_DEFINITIONS = Object.freeze(definitions);

/** The Font Awesome release this catalogue was generated from. */
export const FOUNDRY_ICON_BUNDLE_RELEASE = Object.freeze({
  edition: '${release.edition}',
  version: '${release.version}',
  foundryVersion: '${measurements.foundryVersion}'
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
    `Foundry ${foundryVersion} / Font Awesome ${release.edition} ${release.version}`
  );

  const modernRules = parseIconGlyphRules(cssText);
  const rules = parseCompatibleIconGlyphRules(cssText);
  if (rules.length === 0) {
    throw new Error(
      `Foundry ${foundryVersion} / Font Awesome ${release.edition} ${release.version} yielded no icon glyph rules.`
    );
  }
  const definitions =
    modernRules.length > 0
      ? buildIconCatalogue({ cssText, classicCodepoints, brandCodepoints })
      : buildIconCatalogueFromRules({ rules, classicCodepoints, brandCodepoints });
  const measurements = {
    foundryVersion,
    glyphRules: rules.length,
    declaredNames: rules.reduce((total, rule) => total + rule.names.length, 0),
    multiNameRules: rules.filter((rule) => rule.names.length > 1).length,
    classicGlyphs: definitions.length,
    brandGlyphs: rules.filter((rule) => brandCodepoints.has(rule.codepoint)).length,
    classicFaceCodepoints: classicCodepoints.size,
  };

  const rendered = renderCatalogueModule({ release, definitions, measurements });

  if (checkOnly) {
    const committed = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : '';
    if (committed === rendered) {
      console.log(
        `Up to date: ${measurements.classicGlyphs} icons from Font Awesome ${release.edition} ${release.version}.`
      );
      return;
    }
    console.error(
      `OUT OF DATE. This bundle is Font Awesome ${release.edition} ${release.version} with ` +
        `${measurements.classicGlyphs} classic icons; the committed catalogue does not match it.`
    );
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, rendered);
  console.log(
    `Wrote ${measurements.classicGlyphs} icons (${measurements.declaredNames} names over ` +
      `${measurements.glyphRules} glyphs, ${measurements.brandGlyphs} brand glyphs excluded) from ` +
      `Font Awesome ${release.edition} ${release.version} in Foundry ${measurements.foundryVersion}.`
  );
}

main();
