/**
 * The time-of-day bar's band fills, rasterised in Chromium in every shipped theme (issue 2431):
 * each of the eight positions' name and range sublabel reach 4.5:1 on its fill, and the world-clock
 * line and the current-time dot reach 3:1 against it. The handle's grip, at rest and lit on hover or
 * drag, reaches 3:1 on those fills and on every Checks band fill too (issue 2435).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { BAND_TONES } from '../../src/ui/svelte/apps/manager/checks/checkBandModel.js';
import {
  TIME_OF_DAY_TAGS,
  timeOfDayTint,
} from '../../src/ui/svelte/apps/manager/environment/timeOfDayBandModel.js';
import { openLayoutContext } from '../helpers/layout-harness.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const strip = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/components/ThresholdBandStrip.svelte')
);
const marker = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/components/RangeBarMarker.svelte')
);
const css = readStylesheet();

const STRIP_CLASSES = [
  'fab-band-strip-track',
  'fab-band-strip-band',
  'fab-band-strip-band-name',
  'fab-band-strip-band-range',
  'fab-band-strip-handle',
  'fab-band-strip-grip',
];

/**
 * The Checks band fills: the crafting editor's five-tone ramp, `bandFill` in
 * `CraftingCheckEditor.svelte`, and the simple editor's two, its `BAND_COLORS`.
 */
const CHECK_FILLS = [
  ...BAND_TONES.map((tone) => [
    tone,
    `color-mix(in oklab, var(--fab-${tone}) 26%, var(--fab-bg-0))`,
  ]),
  ['simple-failure', 'color-mix(in srgb, var(--fab-danger) 22%, var(--fab-bg-0))'],
  ['simple-success', 'color-mix(in srgb, var(--fab-success) 22%, var(--fab-bg-0))'],
];

/** A grip at rest, and one lit as the dragged handle's is. */
const GRIPS =
  '<span class="fab-band-strip-handle"><span class="fab-band-strip-grip" data-grip="rest"></span></span>' +
  '<span class="fab-band-strip-handle is-dragging"><span class="fab-band-strip-grip" data-grip="lit"></span></span>';

function bandMarkup(theme, position) {
  const { color, ink } = timeOfDayTint(position);
  return (
    `<span class="fab-band-strip-band has-range" data-probe="${theme}|${position + 1}" ` +
    `style="--fab-band-strip-fill: ${color}; --fab-band-strip-ink: ${ink};">` +
    '<span class="fab-band-strip-band-name">Night</span>' +
    '<span class="fab-band-strip-band-range">21–04</span>' +
    '<span class="fab-band-strip-line"></span>' +
    `<span class="fab-band-strip-marker"><span class="fab-band-strip-dot"></span></span>${GRIPS}</span>`
  );
}

function checkBandMarkup(theme, [name, color]) {
  return (
    `<span class="fab-band-strip-band" data-check-probe="${theme}|${name}" ` +
    `style="--fab-band-strip-fill: ${color};">${GRIPS}</span>`
  );
}

/** Each probe's fill, name, sublabel, line and dot, rasterised to RGBA. */
async function measure(themes) {
  const context = await openLayoutContext({ viewport: { width: 900, height: 400 } });
  const page = await context.newPage();
  try {
    const cells = themes
      .map(
        (theme) =>
          `<div class="fabricate" data-fabricate-theme="${theme}"><div class="fab-band-strip-track">` +
          TIME_OF_DAY_TAGS.map((_tag, position) => bandMarkup(theme, position)).join('') +
          CHECK_FILLS.map((fill) => checkBandMarkup(theme, fill)).join('') +
          '</div></div>'
      )
      .join('');
    let body = STRIP_CLASSES.reduce(
      (markup, name) => withScopeHash(markup, name, strip.hashClass),
      `<div class="fabricate-manager">${cells}</div>`
    );
    for (const name of ['fab-band-strip-line', 'fab-band-strip-marker', 'fab-band-strip-dot']) {
      body = withScopeHash(body, name, marker.hashClass);
    }
    await page.setContent(
      `<style>${css}</style><style>${strip.css}</style><style>${marker.css}</style>${body}`
    );
    return await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // Two sentinels: `fillStyle` keeps the previous paint for a value it refuses.
      const rasterise = (value) => {
        const [first, second] = ['#000000', '#ffffff'].map((sentinel) => {
          ctx.fillStyle = sentinel;
          ctx.fillStyle = value;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data];
        });
        return first.every((channel, index) => channel === second[index]) ? first : null;
      };
      const read = (element, property) => rasterise(getComputedStyle(element)[property]);
      const grips = (band) => ({
        fill: read(band, 'backgroundColor'),
        grip: read(band.querySelector('[data-grip="rest"]'), 'backgroundColor'),
        lit: read(band.querySelector('[data-grip="lit"]'), 'backgroundColor'),
      });
      return {
        bands: [...document.querySelectorAll('[data-probe]')].map((band) => ({
          probe: band.dataset.probe,
          ...grips(band),
          name: read(band.querySelector('.fab-band-strip-band-name'), 'color'),
          range: read(band.querySelector('.fab-band-strip-band-range'), 'color'),
          line: read(band.querySelector('.fab-band-strip-line'), 'backgroundColor'),
          dot: read(band.querySelector('.fab-band-strip-dot'), 'backgroundColor'),
        })),
        checks: [...document.querySelectorAll('[data-check-probe]')].map((band) => ({
          probe: band.dataset.checkProbe,
          ...grips(band),
        })),
      };
    });
  } finally {
    await context.close();
  }
}

const channel = (value) => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
/** `top` painted over the opaque `under`: `--fab-text-muted` carries alpha in some themes. */
const over = (top, under) =>
  top
    .slice(0, 3)
    .map((value, index) => Math.round((value * top[3] + under[index] * (255 - top[3])) / 255));
const ratio = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

test('every time-of-day band clears its contrast floors in every shipped theme', async () => {
  const themes = [
    ...new Set([...css.matchAll(/data-fabricate-theme="([\w-]+)"/g)].map((m) => m[1])),
  ];
  assert.equal(themes.length, 7, `every palette is measured, found ${themes.join(', ')}`);

  const { bands: measured, checks } = await measure(themes);
  assert.equal(measured.length, themes.length * TIME_OF_DAY_TAGS.length);
  assert.equal(checks.length, themes.length * CHECK_FILLS.length);
  const unreadable = [...measured, ...checks].filter(
    (m) =>
      !m.fill ||
      m.fill[3] < 255 ||
      ['name', 'range', 'line', 'dot', 'grip', 'lit'].some((key) => key in m && !m[key])
  );
  assert.deepEqual(
    unreadable.map((m) => m.probe),
    [],
    'every colour rasterises, and every fill is opaque'
  );
  assert.ok(
    new Set(measured.map((m) => m.fill.join(','))).size > themes.length,
    'the tag fills reach the bands, so the palette is under test'
  );

  const GRIP_FLOORS = [
    ['grip', 3],
    ['lit', 3],
  ];
  const failures = [
    ...measured.map((m) => [
      m,
      [['name', 4.5], ['range', 4.5], ['line', 3], ['dot', 3], ...GRIP_FLOORS],
    ]),
    ...checks.map((m) => [m, GRIP_FLOORS]),
  ].flatMap(([m, floors]) =>
    floors
      .map(([key, floor]) => [key, floor, ratio(over(m[key], m.fill), m.fill)])
      .filter(([, floor, measuredRatio]) => measuredRatio < floor)
      .map(
        ([key, floor, measuredRatio]) =>
          `${m.probe} ${key}: ${measuredRatio.toFixed(2)}:1 < ${floor}`
      )
  );
  assert.deepEqual(failures, []);
});
