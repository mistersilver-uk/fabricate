/**
 * Issue 2863: a centred `FillBar` with a `neutralBand`, measured in Chromium in the real cascade
 * of the module sheet and the component's scoped block. A reading inside the band paints the
 * neutral ink on its own side of the midpoint and one beyond it the sign's ink; under forced
 * colours a banded bar draws its fill in the system text colour, solid beyond the band and as a
 * hollow 1px ring within it, so the two differ by shape as well as by side, while a bar with no
 * band is left to the user agent, which today repaints its fill to the forced ground (issue 2838).
 * The ring needs room: a fill about 2.4px wide paints solid, which is pinned beside one that keeps
 * it, and a thin banded track keeps an outline edge that leaves its 4px fill room for the ring.
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
  tmpPrefix: 'fabricate-fill-bar-neutral-band-',
  compiledModules: [FILL_BAR],
  componentPath: FILL_BAR,
});

const probe = (name, style) =>
  `<span data-probe="${name}" style="display:block;width:1px;height:1px;${style}"></span>`;
const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, FILL_BAR)).css}</style>
</head><body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">
  ${probe('subtle', 'background:var(--fab-text-subtle)')}
  ${probe('success', 'background:var(--fab-success-text)')}
  ${probe('danger', 'background:var(--fab-danger-text)')}
  ${probe('text', 'forced-color-adjust:none;background:canvastext')}
  ${probe('canvas', 'forced-color-adjust:none;background:canvas')}
  ${markup}
</div></body></html>`;

const ROWS = [
  { id: 'within', value: 10, neutralBand: 20 },
  { id: 'edge', value: -20, neutralBand: 20 },
  { id: 'beyond', value: 21, neutralBand: 20 },
  { id: 'below', value: -45, neutralBand: 20 },
  { id: 'thin-within', value: 10, neutralBand: 20, density: 'thin' },
  { id: 'thin-beyond', value: -60, neutralBand: 20, density: 'thin' },
  { id: 'unbanded', value: 10 },
  { id: 'narrow', value: 2, neutralBand: 20 },
  { id: 'short', value: 3, neutralBand: 20 },
];

let browser;
let tab;
let rest;
let forced;

/** Each probe's paint, and each row's fill: its paint, ring and box against its track's midpoint. */
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
        const outer = track.getBoundingClientRect();
        const inner = outer.left + track.clientLeft;
        const box = fill.getBoundingClientRect();
        return [
          row.dataset.row,
          {
            paint: paint(fill),
            ring: ['outlineStyle', 'outlineWidth', 'outlineOffset', 'outlineColor'].map(
              (property) => getComputedStyle(fill)[property]
            ),
            left: box.left - (inner + track.clientWidth / 2),
            right: box.right - (inner + track.clientWidth / 2),
            width: box.width,
            half: track.clientWidth / 2,
            box: { x: box.left, y: box.top, width: box.width, height: box.height },
            track: ['borderTopWidth', 'outlineStyle', 'outlineWidth', 'outlineColor'].map(
              (property) => getComputedStyle(track)[property]
            ),
          },
        ];
      })
    );
    return { probes, rows };
  });

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await harness.setup();
  const markup = [];
  for (const { id, ...props } of ROWS) {
    const root = await harness.mount({ origin: 'center', ...props });
    markup.push(`<div data-row="${id}" style="width:240px;margin:4px 0">${root.innerHTML}</div>`);
    harness.remount();
  }
  await tab.setContent(page(markup.join('\n')), { waitUntil: 'load' });
  rest = await measure();
  await tab.emulateMedia({ forcedColors: 'active' });
  forced = await measure();
  for (const row of Object.values(forced.rows)) row.run = await runAcross(row.box);
});

/** A run with the light pixels either side of the fill trimmed, so its ends are the fill's. */
const inside = (run) => run.replaceAll(/^\.+|\.+$/gu, '');

/**
 * The pixels along the middle row of a fill's box, 2px either side, as `#` for ink darker than
 * mid-grey and `.` for any lighter: a hollow ring reads `#.....#`, a solid fill `#######`.
 */
async function runAcross({ x, y, width, height }) {
  const left = Math.floor(x) - 2;
  const clip = {
    x: left,
    y: Math.floor(y + height / 2),
    width: Math.ceil(x + width) + 2 - left,
    height: 1,
  };
  const shot = [...(await tab.screenshot({ clip }))];
  return tab.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, 1);
    let run = '';
    for (let index = 0; index < data.length; index += 4) {
      run += data[index] + data[index + 1] + data[index + 2] < 384 ? '#' : '.';
    }
    return run;
  }, shot);
}

after(async () => {
  harness.teardown();
  await browser?.close();
});

describe('FillBar neutral band, rendered (issue 2863)', () => {
  it('paints a reading inside the band, its edge included, in the neutral ink on its own side', () => {
    const { probes, rows } = rest;
    for (const id of ['within', 'edge', 'thin-within']) {
      assert.equal(rows[id].paint, probes.subtle, `${id} is neutral`);
    }
    assert.ok(Math.abs(rows.within.left) <= 0.5, 'a positive reading grows right of the midpoint');
    assert.ok(Math.abs(rows.within.width - rows.within.half * 0.1) <= 0.5);
    assert.ok(Math.abs(rows.edge.right) <= 0.5, 'a negative one ends at the midpoint');
    assert.ok(Math.abs(rows.edge.width - rows.edge.half * 0.2) <= 0.5);
  });

  it('paints a reading beyond the band in its sign’s ink, and a bar with no band by sign', () => {
    const { probes, rows } = rest;
    assert.equal(rows.beyond.paint, probes.success);
    assert.equal(rows.below.paint, probes.danger);
    assert.equal(rows['thin-beyond'].paint, probes.danger);
    assert.equal(rows.unbanded.paint, probes.success, 'no band: +10 is success, as before');
    assert.notEqual(probes.subtle, probes.success);
  });

  it('draws a banded fill under forced colours solid beyond the band and as a hollow ring within it', () => {
    const { probes, rows } = forced;
    assert.notEqual(probes.text, probes.canvas, 'the two system colours differ');
    for (const id of ['beyond', 'below', 'thin-beyond']) {
      assert.equal(rows[id].paint, probes.text, `${id} is solid`);
      assert.equal(rows[id].ring[0], 'none', `${id} draws no ring`);
    }
    for (const id of ['within', 'edge', 'thin-within']) {
      assert.equal(rows[id].paint, probes.canvas, `${id} is hollow`);
      assert.deepEqual(
        rows[id].ring,
        ['solid', '1px', '-1px', probes.text],
        `${id} draws a 1px ring in the text colour, inside its own box`
      );
    }
    assert.ok(Math.abs(forced.rows.within.left) <= 0.5, 'and it keeps its side');
  });

  it('tells the band by shape only where the fill is wide enough for a ring: +10 is hollow, +21 solid', () => {
    const { rows } = forced;
    for (const id of ['within', 'edge', 'short']) {
      assert.match(inside(rows[id].run), /^#\.+#$/u, `${id} is a ring: ${rows[id].run}`);
    }
    for (const id of ['beyond', 'below']) {
      assert.match(inside(rows[id].run), /^#+$/u, `${id} is solid: ${rows[id].run}`);
    }
  });

  it('paints an in-band fill too short for a ring as solid: +2, about 2.4px on a 240px track, beside +3, about 3.6px, which keeps its ring', () => {
    const { rows } = forced;
    assert.ok(Math.abs(rows.narrow.width - 2.38) <= 0.05, `+2 is ${rows.narrow.width}px wide`);
    assert.ok(Math.abs(rows.short.width - 3.57) <= 0.05, `+3 is ${rows.short.width}px wide`);
    assert.deepEqual(rows.narrow.ring, rows.within.ring, 'it carries the same ring rule');
    assert.equal(inside(rows.narrow.run), '##', 'and draws two solid pixels');
    assert.equal(inside(rows.short.run), '#..#', 'where +3 draws its ring');
  });

  it('keeps a 1px edge in the text colour outside a banded thin track under forced colours, and none at rest', () => {
    for (const id of ['thin-within', 'thin-beyond']) {
      assert.deepEqual(
        forced.rows[id].track,
        ['0px', 'solid', '1px', forced.probes.text],
        `${id} under forced colours: an outline, never a border`
      );
      assert.deepEqual(rest.rows[id].track.slice(0, 2), ['0px', 'none'], `${id} at rest`);
    }
  });

  it('leaves the thin in-band fill its 4px under forced colours, so it keeps its ring', () => {
    const { rows } = forced;
    assert.equal(rows['thin-within'].box.height, 4);
    assert.match(inside(rows['thin-within'].run), /^#\.+#$/u);
    assert.match(inside(rows['thin-beyond'].run), /^#+$/u);
  });

  it('leaves a bar with no band to the user agent, which repaints its fill to the forced ground', () => {
    const { rows } = forced;
    const channels = (colour) => colour.match(/\d+/gu).slice(0, 3).join(' ');
    assert.equal(channels(rows.unbanded.paint), channels(forced.probes.canvas));
    assert.equal(rows.unbanded.ring[0], 'none');
  });
});
