/**
 * Issue 2821: `FillBar`'s geometry measured in Chromium. The thin track is 4px high with no border
 * and paints `--fab-bg-3`, so the fill is the whole of it; the default and compact tracks keep
 * their 8px and 6px and their border. The bipolar fill grows from the midpoint of the track, to the
 * right above zero and to the left below it, whatever the writing direction.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const FILL_BAR = 'src/ui/svelte/components/FillBar.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-fill-bar-geometry-',
  compiledModules: [FILL_BAR],
  componentPath: FILL_BAR,
});

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, FILL_BAR)).css}</style>
</head><body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">
  ${markup}
</div></body></html>`;

let browser;
let tab;
let rows;

/** Draws each props object as its own 300px row, keyed by `id`, on one page. */
async function render(specs) {
  const markup = [];
  for (const { id, dir = 'ltr', ...props } of specs) {
    const root = await harness.mount(props);
    markup.push(
      `<div data-row="${id}" dir="${dir}" style="display:flex;width:300px">${root.innerHTML}</div>`
    );
    harness.remount();
  }
  await tab.setContent(page(markup.join('\n')), { waitUntil: 'load' });
}

/** Each row's track and fill: boxes and the computed styles the claims read. */
function measure() {
  return tab.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-row]')].map((row) => {
        const track = row.querySelector('.fab-fill-bar');
        const fill = track.querySelector('.fab-fill-bar-fill');
        const box = (node) => {
          const { left, width, height } = node.getBoundingClientRect();
          return { left, width, height };
        };
        const style = getComputedStyle(track);
        return [
          row.dataset.row,
          {
            track: box(track),
            fill: box(fill),
            border: style.borderTopWidth,
            background: style.backgroundColor,
            inner: track.clientWidth,
            token: getComputedStyle(row).getPropertyValue('--fab-bg-3').trim(),
          },
        ];
      })
    )
  );
}

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await harness.setup();
  await render([
    { id: 'default', value: 50 },
    { id: 'compact', value: 50, density: 'compact' },
    { id: 'thin', value: 50, density: 'thin' },
    { id: 'centre-positive', value: 60, origin: 'center' },
    { id: 'centre-negative', value: -60, origin: 'center' },
    { id: 'centre-negative-rtl', dir: 'rtl', value: -60, origin: 'center' },
    { id: 'centre-zero', value: 0, origin: 'center' },
    { id: 'centre-full', value: -100, origin: 'center', density: 'thin' },
    { id: 'thin-full', value: 100, density: 'thin', tone: 'info' },
  ]);
  rows = await measure();
});

after(async () => {
  harness.teardown();
  await browser?.close();
});

describe('FillBar geometry, rendered (issue 2821)', () => {
  it('draws the default, compact and thin tracks 8px, 6px and 4px high', () => {
    assert.equal(rows.default.track.height, 8);
    assert.equal(rows.compact.track.height, 6);
    assert.equal(rows.thin.track.height, 4);
  });

  it('draws the thin track with no border and the fill the whole of its height', () => {
    assert.equal(rows.thin.border, '0px');
    assert.equal(rows.default.border, '1px');
    assert.equal(rows.thin.fill.height, 4);
    assert.equal(rows['thin-full'].fill.width, rows['thin-full'].track.width);
  });

  it('paints the thin track --fab-bg-3 and the others something else', () => {
    assert.notEqual(rows.thin.token, '');
    const probe = (hex) => {
      const [red, green, blue] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
      return `rgb(${red}, ${green}, ${blue})`;
    };
    assert.equal(rows.thin.background, probe(rows.thin.token));
    assert.notEqual(rows.default.background, rows.thin.background);
  });

  it('grows the bipolar fill from the midpoint, right above zero and left below it', () => {
    const near = (actual, expected, claim) =>
      assert.ok(Math.abs(actual - expected) <= 0.5, `${claim}: ${actual}px, not ${expected}px`);
    for (const id of ['centre-positive', 'centre-negative', 'centre-negative-rtl']) {
      const { track, fill, inner } = rows[id];
      const middle = track.left + (track.width - inner) / 2 + inner / 2;
      near(fill.width, inner * 0.3, `${id} width`);
      if (id === 'centre-positive') near(fill.left, middle, `${id} starts at the midpoint`);
      else near(fill.left + fill.width, middle, `${id} ends at the midpoint`);
    }
  });

  it('draws a bipolar fill of no width at zero, and half the track at the extreme', () => {
    assert.equal(rows['centre-zero'].fill.width, 0);
    const { track, fill, inner } = rows['centre-full'];
    assert.ok(Math.abs(fill.width - inner / 2) <= 0.5);
    assert.ok(Math.abs(fill.left - (track.left + (track.width - inner) / 2)) <= 0.5);
  });
});
