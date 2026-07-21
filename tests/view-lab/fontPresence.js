/*
 * Pure, injectable font/glyph PRESENCE assertion (issue 823, Design E).
 *
 * Extracted from `mount.js` so its ABORT branch is unit-testable OUTSIDE a browser:
 * it takes a `surface = { check, probe }` seam, so a synthetic "a family reports
 * unloaded" case can assert it THROWS. `mount.js` passes the real browser surface
 * (`document.fonts.check` + a canvas width-probe). No DOM/Vite/browser globals are
 * touched at import, so a globbed `node --test` file can import it directly.
 *
 * `document.fonts.ready` gates TIMING only — it resolves even when a face 404'd — so
 * it CANNOT make a load failure fatal. This affirmatively checks each family is
 * actually loaded AND that a representative FA glyph resolves to the FA face (a
 * width-probe that must differ from a generic serif), and THROWS if any is absent. A
 * silent Arial/tofu fallback that renders green is the exact worst outcome this gate
 * exists to prevent.
 */

// The families the View Lab bundles and the FA icon face. FA glyphs are FONT glyphs,
// so a missing FA font renders tofu (not a failed <img>) — the presence assertion,
// not the image-decode gate, is what catches it.
export const REQUIRED_TEXT_FONTS = Object.freeze(['Signika', 'Spectral', 'JetBrains Mono']);
export const FA_FONT = 'Font Awesome 6 Free';
export const FA_PROBE_GLYPH = String.fromCharCode(0xf00c); // fa-check (Font Awesome solid)

/**
 * @param {object} surface
 * @param {(spec: string) => boolean} surface.check   e.g. `document.fonts.check`
 * @param {(font: string, text: string) => number} surface.probe  measured text width
 * @param {object} [options]
 * @param {string[]} [options.families]
 * @param {string} [options.faFont]
 * @returns {true} when every family is present; otherwise THROWS.
 */
export function assertFontsLoaded(surface, { families = REQUIRED_TEXT_FONTS, faFont = FA_FONT } = {}) {
  if (!surface || typeof surface.check !== 'function' || typeof surface.probe !== 'function') {
    throw new Error('assertFontsLoaded requires a { check, probe } surface');
  }
  const missing = [];
  for (const family of families) {
    if (!surface.check(`16px "${family}"`)) missing.push(family);
  }
  if (!surface.check(`900 16px "${faFont}"`)) missing.push(faFont);

  // Canvas width-probe: a known FA glyph must render WIDER than 0 and differ from the
  // same codepoint in a generic serif (tofu/fallback would collapse to the serif
  // metric). This catches a face that "checks" true but never actually painted.
  const faWidth = surface.probe(`900 32px "${faFont}"`, FA_PROBE_GLYPH);
  const serifWidth = surface.probe('32px serif', FA_PROBE_GLYPH);
  if (!(faWidth > 0) || Math.abs(faWidth - serifWidth) < 0.5) {
    missing.push(`${faFont} (glyph probe: FA=${faWidth}, serif=${serifWidth})`);
  }

  if (missing.length > 0) {
    throw new Error(
      `View Lab font PRESENCE assertion failed — missing/unloaded: ${missing.join(', ')}. ` +
        'Capture is aborted (a silent Arial/tofu fallback would render green). ' +
        'Confirm the bundled woff2 under assets/fonts/ are present and served.',
    );
  }
  return true;
}

/** The real browser surface used by the mount. */
export function browserFontSurface() {
  return {
    check: (spec) => document.fonts.check(spec),
    probe: (font, text) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = font;
      return ctx.measureText(text).width;
    },
  };
}
