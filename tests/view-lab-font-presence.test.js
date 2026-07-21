/*
 * Fail-closed font-presence guardrail (issue 823, Design E) — ABORT-branch coverage.
 *
 * `assertFontsLoaded` takes an injectable `{ check, probe }` surface so its THROW path
 * is testable without a browser. Someone weakening `check` back to `fonts.ready`, or
 * dropping the FA canvas width-probe, must fail here. Globbed top-level so `npm test`
 * runs it and its total rises.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertFontsLoaded,
  REQUIRED_TEXT_FONTS,
  FA_FONT,
} from './view-lab/fontPresence.js';

// A surface where every family checks true and the FA glyph probes distinctly wider
// than a generic serif — the all-present happy path.
function healthySurface() {
  return {
    check: () => true,
    probe: (font) => (font.includes(FA_FONT) ? 30 : 12),
  };
}

test('passes when every family is loaded and the FA glyph probes distinctly', () => {
  assert.equal(assertFontsLoaded(healthySurface()), true);
});

test('THROWS when a required text family reports unloaded', () => {
  const surface = {
    check: (spec) => !spec.includes(REQUIRED_TEXT_FONTS[1]), // Spectral unloaded
    probe: (font) => (font.includes(FA_FONT) ? 30 : 12),
  };
  assert.throws(() => assertFontsLoaded(surface), new RegExp(REQUIRED_TEXT_FONTS[1]));
});

test('THROWS when the Font Awesome face reports unloaded', () => {
  const surface = {
    check: (spec) => !spec.includes(FA_FONT),
    probe: (font) => (font.includes(FA_FONT) ? 30 : 12),
  };
  assert.throws(() => assertFontsLoaded(surface), /Font Awesome 6 Free/);
});

test('THROWS when the FA glyph probe collapses to the serif metric (tofu/fallback)', () => {
  // check() lies (returns true) but the glyph never painted the FA face, so its width
  // equals the serif width — the probe is what catches this.
  const surface = { check: () => true, probe: () => 12 };
  assert.throws(() => assertFontsLoaded(surface), /glyph probe/);
});

test('THROWS when the FA glyph probe reports zero width', () => {
  const surface = { check: () => true, probe: (font) => (font.includes(FA_FONT) ? 0 : 12) };
  assert.throws(() => assertFontsLoaded(surface), /glyph probe/);
});

test('THROWS when handed no usable surface (guards a fonts.ready-only regression)', () => {
  assert.throws(() => assertFontsLoaded(undefined), /requires a \{ check, probe \} surface/);
  assert.throws(() => assertFontsLoaded({ check: () => true }), /requires a \{ check, probe \} surface/);
});
