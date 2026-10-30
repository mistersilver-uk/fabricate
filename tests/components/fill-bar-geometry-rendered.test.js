/**
 * Issue 2821: `FillBar`'s geometry measured in Chromium. The thin track is 4px high with no border
 * and paints `--fab-bg-3`, so the fill is the whole of it; the default and compact tracks keep
 * their 8px and 6px and their border.
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
  for (const { id, ...props } of specs) {
    const root = await harness.mount(props);
    markup.push(`<div data-row="${id}" style="display:flex;width:300px">${root.innerHTML}</div>`);
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
});
