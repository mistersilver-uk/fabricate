/**
 * Issue 2182: `Meter`'s segments measured in Chromium: they abut inside the value-wide fill and end
 * at its edge, the fill clips them to its rounded ends, and each tone paints a segment exactly as it
 * paints a single fill.
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
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const SCOPED = ['Meter', 'FillBar'];
const TONES = ['success', 'warning', 'danger', 'info', 'accent', 'neutral', 'chartreuse'];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-meter-shares-rendered-',
  compiledModules: ['FillBar', 'Meter'].map(component),
  componentPath: component('Meter'),
});

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${SCOPED.map((name) => scopedComponentCss(resolve(repoRoot, component(name))).css).join('\n')}</style>
</head><body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">
  ${markup}
</div></body></html>`;

let browser;
let tab;

/** Draws each props object as its own 300px row, keyed by `id`, on one page. */
async function render(rows) {
  const markup = [];
  for (const { id, dir = 'ltr', ...props } of rows) {
    const root = await harness.mount({ label: id, ...props });
    markup.push(
      `<div data-row="${id}" dir="${dir}" style="display:flex;width:300px">${root.innerHTML}</div>`
    );
    harness.remount();
  }
  await tab.setContent(page(markup.join('\n')), { waitUntil: 'load' });
}

/** Each row's track, fill and segments: boxes and the computed styles the claims read. */
function measure() {
  return tab.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-row]')].map((row) => {
        const track = row.querySelector('.fab-fill-bar');
        const fill = track.querySelector('.fab-fill-bar-fill');
        const box = (node) => {
          const { left, right, width } = node.getBoundingClientRect();
          return { left, right, width };
        };
        const style = getComputedStyle(fill);
        return [
          row.dataset.row,
          {
            trackWidth: track.clientWidth,
            fill: box(fill),
            overflow: style.overflow,
            radius: style.borderTopLeftRadius,
            background: style.backgroundColor,
            shares: [...fill.querySelectorAll('.fab-fill-bar-share')].map((share) => {
              const computed = getComputedStyle(share);
              return {
                ...box(share),
                basis: computed.flexBasis,
                shrink: computed.flexShrink,
                background: computed.backgroundColor,
              };
            }),
          },
        ];
      })
    )
  );
}

const POOLED = [{ value: 3, tone: 'accent' }, { tone: 'neutral' }];
let rows;

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 800, height: 900 } });
  await harness.setup();
  await render([
    { id: 'pooled', value: 7, max: 12, segments: POOLED },
    { id: 'pooled-rtl', dir: 'rtl', value: 7, max: 12, segments: POOLED },
    {
      id: 'half',
      value: 0.5,
      max: 1,
      segments: [{ value: 0.2, tone: 'accent' }, { tone: 'neutral' }],
    },
    ...TONES.flatMap((tone) => [
      { id: `share-${tone}`, value: 1, max: 2, segments: [{ value: 0.5, tone }, { tone }] },
      { id: `fill-${tone}`, value: 1, max: 2, segments: [{ tone }] },
    ]),
  ]);
  rows = await measure();
});

after(async () => {
  harness.teardown();
  await browser?.close();
});

describe('Meter segments, rendered (issue 2182)', () => {
  it('abuts neighbouring segments and ends the last at the fill edge, even for factors under 1', () => {
    for (const id of ['pooled', 'half']) {
      const { fill, shares } = rows[id];
      assert.equal(shares.length, 2, `${id} draws two segments`);
      assert.ok(Math.abs(shares[0].right - shares[1].left) <= 0.5, `${id}: no gap at the join`);
      assert.ok(
        Math.abs(shares.at(-1).right - fill.right) <= 0.5,
        `${id}: the last segment ends at ${shares.at(-1).right}px, the fill at ${fill.right}px`
      );
    }
  });

  it('starts the first segment at the fill start under a right-to-left parent', () => {
    const { fill, shares } = rows['pooled-rtl'];
    assert.equal(shares.length, 2);
    assert.ok(
      Math.abs(shares[0].left - fill.left) <= 0.5,
      `the first segment starts at ${shares[0].left}px, the fill at ${fill.left}px`
    );
  });

  it('draws the fill 58% of the track, and the segments 3 to 4 within it', () => {
    const { trackWidth, fill, shares } = rows.pooled;
    assert.ok(
      Math.abs(fill.width - trackWidth * 0.58) <= 1.5,
      `${fill.width}px of ${trackWidth}px`
    );
    assert.ok(Math.abs(shares[0].width / fill.width - 3 / 7) <= 0.01, 'the first segment is 3/7');
  });

  it('clips the segments to the rounded fill and paints the fill itself nothing', () => {
    const { overflow, radius, background } = rows.pooled;
    assert.deepEqual([overflow, radius, background], ['hidden', '999px', 'rgba(0, 0, 0, 0)']);
  });

  it('gives each segment a zero basis and no shrink', () => {
    assert.equal(rows.pooled.shares.length, 2);
    for (const { basis, shrink } of rows.pooled.shares) {
      assert.deepEqual([basis, shrink], ['0px', '0']);
    }
  });

  it('paints a segment of each tone, and an unknown one, as a single fill of that tone', () => {
    for (const tone of TONES) {
      const { shares } = rows[`share-${tone}`];
      const single = rows[`fill-${tone}`].background;
      assert.equal(shares.length, 2, `${tone} draws two segments`);
      assert.notEqual(single, 'rgba(0, 0, 0, 0)', `${tone} paints its single fill`);
      for (const share of shares) assert.equal(share.background, single, `${tone} segment`);
    }
  });
});
