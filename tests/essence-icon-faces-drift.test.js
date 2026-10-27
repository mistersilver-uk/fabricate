/**
 * The face prefixes an essence icon may keep must each resolve to a webfont the client's Font
 * Awesome stylesheet declares. Foundry 14 ships six webfonts and no Sharp family, so a prefix the
 * stylesheet does not declare renders a fallback glyph without any error.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseFontAwesomeRelease } from '../scripts/lib/fontAwesomeBundle.js';
import { resolveChromeCache } from '../scripts/lib/foundryChromeCache.js';
import { ESSENCE_ICON_STYLE_PREFIXES } from '../src/ui/svelte/util/essenceIcons.js';
import { FOUNDRY_ICON_BUNDLE_RELEASE } from '../src/ui/svelte/util/foundryIconCatalogue.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STYLESHEET = 'fonts/fontawesome/css/all.min.css';
const FOUNDRY_CATALOGUE_MAJOR = 14;

// Each supported prefix and the @font-face it draws from: the family flavour and the weight.
const PREFIX_FACES = Object.freeze({
  fas: { flavour: 'classic', weight: 900 },
  'fa-solid': { flavour: 'classic', weight: 900 },
  far: { flavour: 'classic', weight: 400 },
  'fa-regular': { flavour: 'classic', weight: 400 },
  fal: { flavour: 'classic', weight: 300 },
  'fa-light': { flavour: 'classic', weight: 300 },
  fat: { flavour: 'classic', weight: 100 },
  'fa-thin': { flavour: 'classic', weight: 100 },
  fad: { flavour: 'duotone', weight: 900 },
  'fa-duotone': { flavour: 'duotone', weight: 900 },
  fab: { flavour: 'brands', weight: 400 },
  'fa-brands': { flavour: 'brands', weight: 400 },
});

/** The `{ family, weights }` of every `@font-face` rule in a stylesheet. */
function declaredFontFaces(cssText) {
  return [...cssText.matchAll(/@font-face\s*\{([^}]*)\}/g)].flatMap(([, body]) => {
    const family = /font-family\s*:\s*["']?([^;"']+)["']?/.exec(body)?.[1]?.trim();
    const weights = /font-weight\s*:\s*(\d+)(?:\s+(\d+))?/.exec(body);
    if (!family || !weights) return [];
    const low = Number(weights[1]);
    return [{ family, low, high: weights[2] ? Number(weights[2]) : low }];
  });
}

/** The flavour a `Font Awesome <major> <flavour>` family name stands for, or `null`. */
function flavourOf(family) {
  const match = /^Font Awesome \d+ (.+)$/.exec(family);
  if (!match) return null;
  if (match[1] === 'Duotone') return 'duotone';
  if (match[1] === 'Brands') return 'brands';
  return match[1] === 'Pro' || match[1] === 'Free' ? 'classic' : null;
}

function resolvesToDeclaredFace(prefix, faces) {
  const { flavour, weight } = PREFIX_FACES[prefix];
  return faces.some(
    (face) => flavourOf(face.family) === flavour && face.low <= weight && weight <= face.high
  );
}

const cache = resolveChromeCache(ROOT);
const stylesheetPath = cache ? join(cache.dir, STYLESHEET) : null;
const cssText =
  stylesheetPath && existsSync(stylesheetPath) ? readFileSync(stylesheetPath, 'utf8') : '';
const skip = cssText
  ? false
  : 'no harvested Foundry Font Awesome stylesheet; run: npm run viewlab:chrome:harvest';

const FOUNDRY_14_FIXTURE = `
@font-face{font-family:"Font Awesome 7 Brands";font-style:normal;font-weight:400;src:url(a.woff2)}
@font-face{font-family:"Font Awesome 7 Duotone";font-style:normal;font-weight:900;src:url(b.woff2)}
@font-face{font-family:"Font Awesome 7 Pro";font-style:normal;font-weight:300;src:url(c.woff2)}
@font-face{font-family:"Font Awesome 7 Pro";font-style:normal;font-weight:400;src:url(d.woff2)}
@font-face{font-family:"Font Awesome 7 Pro";font-style:normal;font-weight:900;src:url(e.woff2)}
@font-face{font-family:"Font Awesome 7 Pro";font-style:normal;font-weight:100;src:url(f.woff2)}
`;

describe('essence icon style prefixes and the Font Awesome faces', () => {
  it('names a face for exactly the supported prefixes', () => {
    const byName = (left, right) => left.localeCompare(right);
    assert.deepEqual(
      [...ESSENCE_ICON_STYLE_PREFIXES].toSorted(byName),
      Object.keys(PREFIX_FACES).toSorted(byName)
    );
  });

  it('keeps no Sharp prefix, which Foundry 14 draws as a fallback glyph', () => {
    for (const prefix of ESSENCE_ICON_STYLE_PREFIXES) {
      assert.ok(!/sharp|^fas[a-z]+$/.test(prefix), `${prefix} names a Sharp face`);
    }
  });

  it('reads a Foundry 14 shaped stylesheet: every prefix resolves, a Sharp family does not', () => {
    const faces = declaredFontFaces(FOUNDRY_14_FIXTURE);
    assert.equal(faces.length, 6);
    for (const prefix of Object.keys(PREFIX_FACES)) {
      assert.ok(resolvesToDeclaredFace(prefix, faces), `${prefix} has no face in the fixture`);
    }
    const sharpOnly = declaredFontFaces(
      '@font-face{font-family:"Font Awesome 6 Sharp";font-weight:900;src:url(a.woff2)}'
    );
    assert.ok(!resolvesToDeclaredFace('fas', sharpOnly), 'a Sharp family is not the classic face');
  });

  it('declares a webfont for every supported prefix in the harvested stylesheet', { skip }, () => {
    const faces = declaredFontFaces(cssText);
    assert.ok(
      faces.length > 0,
      `no @font-face rule parsed from the Foundry ${cache.version} sheet`
    );
    for (const prefix of ESSENCE_ICON_STYLE_PREFIXES) {
      assert.ok(
        resolvesToDeclaredFace(prefix, faces),
        `${prefix} resolves to no @font-face in Foundry ${cache.version}'s Font Awesome stylesheet`
      );
    }
  });

  it(
    'measured the committed catalogue from the Font Awesome release Foundry 14 ships',
    { skip },
    (t) => {
      if (Number.parseInt(cache.version, 10) !== FOUNDRY_CATALOGUE_MAJOR) {
        t.skip(
          `the catalogue is measured from Foundry ${FOUNDRY_CATALOGUE_MAJOR}, not ${cache.version}`
        );
        return;
      }
      const release = parseFontAwesomeRelease(cssText);
      assert.equal(release.edition, FOUNDRY_ICON_BUNDLE_RELEASE.edition);
      if (release.version) assert.equal(release.version, FOUNDRY_ICON_BUNDLE_RELEASE.version);
      else assert.equal(release.major, Number.parseInt(FOUNDRY_ICON_BUNDLE_RELEASE.version, 10));
    }
  );
});
