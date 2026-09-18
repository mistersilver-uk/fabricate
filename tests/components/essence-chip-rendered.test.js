/** THE TINTED ESSENCE CHIP STAYS READABLE ON EVERY THEME (issue 1371 r18-colour, M29). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';
import { compile } from 'svelte/compiler';

import { MANAGER_COLOR_TOKEN_KEYS } from '../../src/ui/svelte/util/managerColorTokens.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const CHIP_PATH = 'src/ui/svelte/components/Chip.svelte';
const ESSENCE_CHIP_PATH = 'src/ui/svelte/apps/manager/components/EssenceChip.svelte';
const MEDALLION_PATH = 'src/ui/svelte/components/Medallion.svelte';
const COMPILED = [CHIP_PATH, ESSENCE_CHIP_PATH, MEDALLION_PATH];

/** Every theme the sheet declares a root block for — read, not listed, so a new theme is measured. */
const THEMES = [
  ...new Set(
    [...fabricateCss.matchAll(/\.fabricate\[data-fabricate-theme="([\w-]+)"\]/g)].map(
      ([, name]) => name
    )
  ),
];

const LABEL_MIN_RATIO = 4.5;
const MARK_MIN_RATIO = 3;

/** The pairs measured below a floor at the base of issue 1371 r18-colour. */
const KNOWN_BELOW_LABEL_FLOOR = new Map([['foundry-native/mauve', 3.36]]);
const KNOWN_BELOW_MARK_FLOOR = new Map([['foundry-native/mauve', 2.72]]);

/** THE SELECTED ROW'S OWN RATCHET (issue 1371 r19-gates2, UX review round 5 F-P5). */
const KNOWN_BELOW_SELECTED_LABEL_FLOOR = new Map([
  ['foundry-native/mauve', 1.83],
  ['foundry-native/aqua', 2.99],
  ['ironblood-forge/mauve', 3.48],
  ['foundry-native/lavender', 3.73],
  ['foundry-native/rose', 4.09],
  ['foundry-native/peach', 4.14],
  ['ironblood-forge/rose', 4.19],
  ['hearth-herb/aqua', 4.35],
  ['starglass-arcana/aqua', 4.44],
]);

/**
 * Hold every pair above its floor, or — for a pinned pair — above its pinned ratchet.
 *
 * @param {import('node:test').TestContext} t
 * @param {(sample: object) => number} ratioOf
 * @param {number} floor
 * @param {Map<string, number>} pinned
 * @param {string} what
 */
function holdContrast(t, ratioOf, floor, pinned, what) {
  const failures = [];
  const cleared = [];
  for (const theme of THEMES) {
    let worst = null;
    for (const tint of MANAGER_COLOR_TOKEN_KEYS) {
      const key = `${theme}/${tint}`;
      const ratio = ratioOf(measured.get(key));
      if (!worst || ratio < worst.ratio) worst = { tint, ratio };
      if (pinned.has(key)) {
        if (ratio < pinned.get(key))
          failures.push(`${key} ${ratio.toFixed(2)}:1 fell below its pinned ${pinned.get(key)}:1`);
        if (ratio >= floor)
          cleared.push(`${key} ${ratio.toFixed(2)}:1 now clears ${floor}:1 — remove its pin`);
      } else if (ratio < floor) {
        failures.push(`${key} ${ratio.toFixed(2)}:1`);
      }
    }
    t.diagnostic(`${what} · ${theme}: worst ${worst.tint} ${worst.ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(failures, [], `${what} under ${floor}:1`);
  assert.deepEqual(cleared, [], `${what}: a pinned pair now clears the floor`);
}

const essenceChip = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-chip-rendered-',
  compiledModules: COMPILED,
  componentPath: ESSENCE_CHIP_PATH,
});

const medallion = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-tile-rendered-',
  compiledModules: COMPILED,
  componentPath: MEDALLION_PATH,
});

/** The scoped CSS of the rendered primitives, compiled `external` so it can be injected beside the sheet. */
function scopedCss() {
  return COMPILED.map((modulePath) => {
    const filename = resolve(repoRoot, modulePath);
    return compile(readFileSync(filename, 'utf8'), { filename, css: 'external' }).css?.code ?? '';
  }).join('\n');
}

/* THE TWO SURFACES A ROW CHIP STANDS ON. */
function page(theme, tint, chipMarkup, tileMarkup, scoped) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fabricateCss}</style><style>${scoped}</style>
    <style>html, body { margin: 0; } .probe-surface { padding: 16px; background: var(--fab-bg-1); } .probe-tile { padding: 16px; background: var(--fab-bg-3); } .probe-selected { padding: 16px; background: var(--fab-bg-2); } .probe-selected-row { padding: 16px; background: var(--fab-surface-active); }</style>
    </head><body>
      <div class="fabricate fabricate-manager" data-fabricate-theme="${theme}">
        <div class="probe-surface" data-probe-surface>${chipMarkup}</div>
        <div class="probe-tile" data-probe-tile>${tileMarkup}</div>
        <div class="probe-selected" data-probe-selected><div class="probe-selected-row" data-probe-selected-row>${chipMarkup}</div></div>
      </div>
    </body></html>`;
}

/** Runs IN THE PAGE: the chip's ink and fill, and the surface behind it, as raw rgba tuples. */
function readColours() {
  const parse = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return [0, 0, 0, 0];
    const parts = match[1].split(',').map((part) => parseFloat(part.trim()));
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  };
  const surface = document.querySelector('[data-probe-surface]');
  const chip = surface.querySelector('.manager-chip');
  const glyph = chip.querySelector('i');
  const selectedRow = document.querySelector('[data-probe-selected-row]');
  const selectedChip = selectedRow.querySelector('.manager-chip');
  const selectedHost = document.querySelector('[data-probe-selected]');
  const tile = document.querySelector('.fab-medallion');
  const tileGlyph = tile.querySelector('i');
  const tileHost = document.querySelector('[data-probe-tile]');
  return {
    chipInk: parse(getComputedStyle(chip).color),
    chipGlyphInk: parse(getComputedStyle(glyph).color),
    chipFill: parse(getComputedStyle(chip).backgroundColor),
    surface: parse(getComputedStyle(surface).backgroundColor),
    selectedChipInk: parse(getComputedStyle(selectedChip).color),
    selectedChipFill: parse(getComputedStyle(selectedChip).backgroundColor),
    selectedRowFill: parse(getComputedStyle(selectedRow).backgroundColor),
    selectedRowHost: parse(getComputedStyle(selectedHost).backgroundColor),
    tileGlyphInk: parse(getComputedStyle(tileGlyph).color),
    tileFill: parse(getComputedStyle(tile).backgroundColor),
    tileHost: parse(getComputedStyle(tileHost).backgroundColor),
  };
}

/** Source-over compositing of an rgba tuple onto an opaque rgb tuple. */
function composite(over, under) {
  const alpha = over[3];
  return [0, 1, 2].map((channel) => over[channel] * alpha + under[channel] * (1 - alpha));
}

function luminance([r, g, b]) {
  const linear = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** The chip's label against its fill on an ORDINARY row: `--fab-bg-1`, which is opaque. */
function labelRatioOnRow(sample) {
  return contrast(sample.chipInk, composite(sample.chipFill, composite(sample.surface, [0, 0, 0])));
}

/**
 * The same label on a SELECTED row, which is three translucent layers rather than one opaque one:
 */
function labelRatioOnSelectedRow(sample) {
  const row = composite(sample.selectedRowFill, composite(sample.selectedRowHost, [0, 0, 0]));
  return contrast(sample.selectedChipInk, composite(sample.selectedChipFill, row));
}

/** @type {Map<string, object>} keyed `${theme}/${tint}`; `${theme}/` is the untinted control. */
const measured = new Map();

describe('the tinted essence chip and tile, rendered on every theme (issue 1371 r18-colour, M29)', () => {
  const markup = { chip: '', tile: '' };

  before(async () => {
    await essenceChip.setup();
    try {
      const target = await essenceChip.mount({
        essence: { id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: 'TINT', quantity: 2 },
      });
      markup.chip = target.innerHTML;
    } finally {
      essenceChip.teardown();
    }
    await medallion.setup();
    try {
      const target = await medallion.mount({
        icon: 'fas fa-fire',
        size: 22,
        glyph: 10,
        tint: 'TINT',
        variant: 'glyph-chip',
      });
      markup.tile = target.innerHTML;
    } finally {
      medallion.teardown();
    }
    // The tint is a bare key validated by the primitives, so `TINT` was DROPPED by both.
    const scoped = scopedCss();
    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage({ viewport: { width: 400, height: 200 } });
      for (const theme of THEMES) {
        await tab.setContent(page(theme, '', markup.chip, markup.tile, scoped), {
          waitUntil: 'load',
        });
        measured.set(`${theme}/`, await tab.evaluate(readColours));
        for (const tint of MANAGER_COLOR_TOKEN_KEYS) {
          const tinted = {
            chip: markup.chip.replace(
              /class="([^"]*manager-chip[^"]*)"/,
              `class="$1 has-tint" style="--fab-chip-color:var(--fab-tag-${tint})" data-chip-tint="${tint}"`
            ),
            // No `has-tint` on the tile: issue 1506 deleted the surface wash and its gating class,
            // so the tinted tile is the untinted one plus the data hook and the custom property
            // the base rule inks the GLYPH from. Re-stamping a class the primitive no longer
            // emits would measure an element the app does not ship.
            tile: markup.tile
              .replace(
                /class="([^"]*fab-medallion[^"]*)" /,
                `class="$1" data-medallion-tint="${tint}" `
              )
              .replace(/style="([^"]*)"/, `style="$1;--fab-medallion-tint:var(--fab-tag-${tint})"`),
          };
          await tab.setContent(page(theme, tint, tinted.chip, tinted.tile, scoped), {
            waitUntil: 'load',
          });
          measured.set(`${theme}/${tint}`, await tab.evaluate(readColours));
        }
      }
    } finally {
      await browser.close();
    }
  });

  after(() => {
    measured.clear();
  });

  it('measured every theme the sheet declares and every tint the picker offers', () => {
    assert.ok(THEMES.length >= 7, `the sheet declares ${THEMES.length} theme roots`);
    assert.ok(MANAGER_COLOR_TOKEN_KEYS.length >= 8, 'the picker offers at least the shipped eight');
    assert.equal(measured.size, THEMES.length * (MANAGER_COLOR_TOKEN_KEYS.length + 1));
    assert.ok(
      markup.chip.includes('fab-essence-chip'),
      'the chip markup is the rendered primitive'
    );
    assert.ok(markup.tile.includes('is-glyph-chip'), 'the tile markup is the rendered primitive');
  });

  it('CONTROL: the tint is what moves the ink — an untinted chip reads the base ink and an untinted tile the accent', () => {
    for (const theme of THEMES) {
      const control = measured.get(`${theme}/`);
      const tinted = measured.get(`${theme}/${MANAGER_COLOR_TOKEN_KEYS[0]}`);
      assert.notDeepEqual(
        tinted.chipInk,
        control.chipInk,
        `${theme}: the chip’s ink moved with the tint`
      );
      assert.notDeepEqual(
        tinted.tileGlyphInk,
        control.tileGlyphInk,
        `${theme}: the tile’s glyph moved with the tint`
      );
      assert.deepEqual(
        tinted.chipGlyphInk,
        tinted.chipInk,
        `${theme}: the glyph and the label share one ink`
      );
    }
  });

  it('CONTROL: the SELECTED row really is the lighter surface, so the pair of measurements is not one measurement twice', () => {
    // Without this the arm below could be reading `--fab-bg-1` under another name and reporting a
    // second green for the same fact. `--fab-surface-active` is declared per theme, so the
    // brightening is read off each theme's own composited row rather than assumed once.
    for (const theme of THEMES) {
      const sample = measured.get(`${theme}/${MANAGER_COLOR_TOKEN_KEYS[0]}`);
      const plain = luminance(composite(sample.surface, [0, 0, 0]));
      const selected = luminance(
        composite(sample.selectedRowFill, composite(sample.selectedRowHost, [0, 0, 0]))
      );
      assert.ok(
        selected > plain,
        `${theme}: the selected row composited to luminance ${selected.toFixed(4)} against the ordinary row's ${plain.toFixed(4)} — the two probes are drawing the same surface`
      );
    }
  });

  it('keeps the chip’s LABEL at AA against its composited fill on every theme and every tint', (t) => {
    holdContrast(t, labelRatioOnRow, LABEL_MIN_RATIO, KNOWN_BELOW_LABEL_FLOOR, 'chip label');
  });

  it('and holds the SELECTED row — the lighter surface, where nine pairs are pinned short of AA', (t) => {
    holdContrast(
      t,
      labelRatioOnSelectedRow,
      LABEL_MIN_RATIO,
      KNOWN_BELOW_SELECTED_LABEL_FLOOR,
      'chip label on a selected row'
    );
  });

  it('keeps the tile’s GLYPH at the non-text minimum against the slate tile on every theme and every tint', (t) => {
    holdContrast(
      t,
      (sample) =>
        contrast(
          sample.tileGlyphInk,
          composite(sample.tileFill, composite(sample.tileHost, [0, 0, 0]))
        ),
      MARK_MIN_RATIO,
      KNOWN_BELOW_MARK_FLOOR,
      'tile glyph'
    );
  });
});
