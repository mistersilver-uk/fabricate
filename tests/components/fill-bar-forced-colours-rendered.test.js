/**
 * Issue 2838: the `FillBar`'s track edge and fill under `forced-colors: active`, sampled in
 * Chromium in the real cascade of the module sheet and the component's scoped block. The user
 * agent repaints every background to the ground, so a bar paints its own: the `thin` track keeps a
 * 1px edge in the system text colour, and every fill (single, stacked, caller-coloured, centred)
 * is drawn in that colour, so each is told from the ground by its pixels. Outside forced colours
 * the same bars keep their ordinary paint, which is pinned beside.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { pixelAt } from '../helpers/pagePixels.js';
import { chromium } from '../helpers/playwrightChromium.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const FILL_BAR = 'src/ui/svelte/components/FillBar.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-fill-bar-forced-colours-',
  compiledModules: [FILL_BAR],
  componentPath: FILL_BAR,
});

const probe = (name, style) =>
  `<span data-probe="${name}" style="display:block;width:8px;height:8px;${style}"></span>`;
const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, FILL_BAR)).css}</style>
</head><body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">
  ${probe('text', 'forced-color-adjust:none;background:canvastext')}
  ${probe('canvas', 'forced-color-adjust:none;background:canvas')}
  ${probe('track', 'background:var(--fab-bg-3)')}
  ${probe('success', 'background:var(--fab-success)')}
  ${probe('border', 'background:var(--fab-border)')}
  ${markup}
</div></body></html>`;

const ROWS = [
  { id: 'default', value: 50 },
  { id: 'thin', value: 50, density: 'thin' },
  { id: 'thin-empty', value: 0, density: 'thin' },
  { id: 'thin-colour', value: 50, density: 'thin', color: 'var(--fab-success)' },
  {
    id: 'thin-stacked',
    value: 80,
    density: 'thin',
    shares: [
      { weight: 1, tone: 'ember' },
      { weight: 1, tone: 'azure' },
    ],
  },
  { id: 'compact', value: 50, density: 'compact' },
  {
    id: 'thin-coloured-shares',
    value: 80,
    density: 'thin',
    shares: [
      { weight: 1, color: 'var(--fab-success)' },
      { weight: 1, color: 'var(--fab-danger)' },
    ],
  },
  { id: 'thin-up', value: 60, density: 'thin', origin: 'center' },
  { id: 'thin-down', value: -60, density: 'thin', origin: 'center' },
  { id: 'thin-zero', value: 0, density: 'thin', origin: 'center' },
  { id: 'up', value: 60, origin: 'center' },
  { id: 'down', value: -60, origin: 'center' },
];

let browser;
let tab;
let rest;
let forced;

/** Each row's boxes and computed edge and paint, and each probe's. */
const measure = () =>
  tab.evaluate(() => {
    const paint = (element) => getComputedStyle(element).backgroundColor;
    const probes = Object.fromEntries(
      [...document.querySelectorAll('[data-probe]')].map((node) => [
        node.dataset.probe,
        paint(node),
      ])
    );
    const rows = Object.fromEntries(
      [...document.querySelectorAll('[data-row]')].map((row) => {
        const track = row.querySelector('.fab-fill-bar');
        const fill = track.querySelector('.fab-fill-bar-fill');
        const box = (element) => {
          const { left, top, width, height } = element.getBoundingClientRect();
          return { left, top, width, height };
        };
        const style = getComputedStyle(track);
        const fillStyle = getComputedStyle(fill);
        return [
          row.dataset.row,
          {
            track: box(track),
            fill: box(fill),
            trackPaint: paint(track),
            fillPaint: paint(fill),
            fillAdjust: fillStyle.forcedColorAdjust,
            shares: [...track.querySelectorAll('.fab-fill-bar-share')].map(paint),
            edge: {
              border: style.borderTopWidth,
              outline: [style.outlineStyle, style.outlineWidth, style.outlineColor],
            },
          },
        ];
      })
    );
    return { probes, rows };
  });

/** A pixel the page paints at a row's fill: its centre, or a point `fraction` along the track. */
const along = ({ track }, fraction) => [
  track.left + track.width * fraction,
  track.top + track.height / 2,
];

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 800, height: 700 } });
  await harness.setup();
  const markup = [];
  for (const { id, ...props } of ROWS) {
    const root = await harness.mount(props);
    markup.push(
      `<div data-row="${id}" style="width:240px;margin:8px 12px">${root.innerHTML}</div>`
    );
    harness.remount();
  }
  await tab.setContent(page(markup.join('\n')), { waitUntil: 'load' });
  rest = await measure();
  await tab.emulateMedia({ forcedColors: 'active' });
  forced = await measure();
  forced.sample = {};
  for (const [id, row] of Object.entries(forced.rows)) {
    const [midX, midY] = along(row, 0.5);
    const top = Math.floor(row.track.top);
    forced.sample[id] = {
      above: await pixelAt(tab, Math.floor(midX), top - 1),
      leftHalf: await pixelAt(tab, Math.floor(along(row, 0.25)[0]), Math.floor(midY)),
      rightHalf: await pixelAt(tab, Math.floor(along(row, 0.75)[0]), Math.floor(midY)),
      centre: await pixelAt(tab, Math.floor(midX), Math.floor(midY)),
      fillCentre: await pixelAt(
        tab,
        Math.floor(row.fill.left + row.fill.width / 2),
        Math.floor(row.fill.top + row.fill.height / 2)
      ),
    };
  }
  forced.ground = await pixelAt(tab, 790, 690);
  const textBox = await tab.evaluate(() => {
    const { left, top } = document.querySelector('[data-probe="text"]').getBoundingClientRect();
    return [left + 4, top + 4];
  });
  forced.text = await pixelAt(tab, ...textBox);
});

after(async () => {
  harness.teardown();
  await browser?.close();
});

const same = (a, b) => a.join(',') === b.join(',');

describe('FillBar under forced colours, rendered (issue 2838)', () => {
  it('has a ground and a text colour that differ, so the samples mean something', () => {
    assert.ok(!same(forced.text, forced.ground), `${forced.text} against ${forced.ground}`);
  });

  it('keeps a 1px edge in the text colour outside the thin track, as a border cannot without costing its fill', () => {
    for (const id of [
      'thin',
      'thin-empty',
      'thin-colour',
      'thin-stacked',
      'thin-up',
      'thin-down',
      'thin-zero',
    ]) {
      const { edge, track } = forced.rows[id];
      assert.deepEqual(edge.outline.slice(0, 2), ['solid', '1px'], id);
      assert.equal(edge.border, '0px', `${id}: no border, so the track stays 4px`);
      assert.equal(track.height, 4, id);
      assert.ok(
        same(forced.sample[id].above, forced.text),
        `${id}: the edge pixel is the text colour`
      );
    }
  });

  it('draws an empty thin track as an edge around the ground, not as nothing', () => {
    for (const id of ['thin-empty', 'thin-zero']) {
      assert.ok(same(forced.sample[id].above, forced.text), `${id} edge`);
      assert.ok(same(forced.sample[id].leftHalf, forced.ground), `${id} interior is the ground`);
      assert.ok(same(forced.sample[id].rightHalf, forced.ground), `${id} interior is the ground`);
    }
  });

  it('draws every single fill in the text colour on either density, so it is told from the ground', () => {
    for (const id of ['default', 'compact', 'thin', 'thin-colour']) {
      const { fillPaint, fillAdjust } = forced.rows[id];
      assert.equal(fillAdjust, 'none', id);
      assert.equal(fillPaint, forced.probes.text, `${id} fill`);
      assert.ok(same(forced.sample[id].fillCentre, forced.text), `${id} fill pixel`);
      assert.ok(!same(forced.sample[id].fillCentre, forced.ground), `${id} is not the ground`);
      assert.ok(
        same(forced.sample[id].rightHalf, forced.ground),
        `${id}: the track beyond is the ground`
      );
    }
  });

  it('draws a stacked fill solid in the text colour across both shares, a caller colour included', () => {
    for (const id of ['thin-stacked', 'thin-coloured-shares']) {
      const { leftHalf, rightHalf, above } = forced.sample[id];
      assert.ok(same(leftHalf, forced.text), `${id}: first share`);
      assert.ok(same(rightHalf, forced.text), `${id}: second share`);
      assert.ok(same(above, forced.text), `${id}: the edge`);
      const { track, fill } = forced.rows[id];
      assert.ok(Math.abs(fill.width - track.width * 0.8) <= 1, `${id}: 80% wide`);
    }
  });

  it('draws a centred fill in the text colour on its own side of the midpoint, and nothing on the other', () => {
    for (const id of ['up', 'thin-up']) {
      assert.ok(same(forced.sample[id].rightHalf, forced.text), `${id}: right of the midpoint`);
      assert.ok(same(forced.sample[id].leftHalf, forced.ground), `${id}: left is the ground`);
    }
    for (const id of ['down', 'thin-down']) {
      assert.ok(same(forced.sample[id].leftHalf, forced.text), `${id}: left of the midpoint`);
      assert.ok(same(forced.sample[id].rightHalf, forced.ground), `${id}: right is the ground`);
    }
  });

  it('draws a centred fill of no width as nothing, so a zero reading is an empty track', () => {
    assert.equal(forced.rows['thin-zero'].fill.width, 0);
    assert.ok(same(forced.sample['thin-zero'].centre, forced.ground));
  });

  it('leaves the ordinary paint alone outside forced colours', () => {
    const { probes, rows } = rest;
    for (const id of ['thin', 'thin-empty', 'thin-up']) {
      assert.equal(rows[id].edge.border, '0px', id);
      assert.equal(rows[id].edge.outline[0], 'none', id);
      assert.equal(rows[id].trackPaint, probes.track, `${id} track`);
      assert.equal(rows[id].fillAdjust, 'auto', id);
    }
    assert.equal(rows.default.edge.border, '1px');
    assert.equal(rows.default.edge.outline[0], 'none');
    assert.equal(rows['thin-colour'].fillPaint, probes.success, 'a caller colour still paints');
    assert.equal(rows['thin-coloured-shares'].shares[0], probes.success, 'and so does a share’s');
    assert.notEqual(rows['thin-coloured-shares'].shares[1], probes.success);
    assert.notEqual(rows.thin.fillPaint, probes.text);
    assert.notEqual(rows.thin.fillPaint, rows.thin.trackPaint);
  });
});
