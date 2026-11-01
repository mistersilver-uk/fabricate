/**
 * Issue 2837: `StageBars`' `track` and a stage's `shares` measured in Chromium, in the real
 * cascade of the module sheet and both components' scoped blocks. The `thin` track is 6px tall,
 * borderless and `--fab-bg-3`, so its fill is the whole 6px, where `FillBar`'s own thin rule
 * draws 4px and the default track's 1px border leaves a 4px fill; under forced colours the thin
 * track keeps a 1px edge as the default one does; and a stage's shares split its fill by weight.
 * It also characterises, without promising, the forced-colours fill issue 2838 tracks.
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
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const SCOPED = ['StageBars', 'FillBar'];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-stage-bars-forms-',
  compiledModules: SCOPED.map(component),
  componentPath: component('StageBars'),
});

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${SCOPED.map((name) => scopedComponentCss(resolve(repoRoot, component(name))).css).join('\n')}</style>
</head><body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">
  <span data-probe style="display:block;width:1px;height:1px;background:var(--fab-bg-3)"></span>
  ${markup}
</div></body></html>`;

const SPLIT = [
  { weight: 3, tone: 'ember' },
  { weight: 1, tone: 'azure' },
];
const STAGES = [
  { name: 'Done', value: 100 },
  { name: 'Now', value: 50, shares: SPLIT },
  { name: 'Next', value: 0 },
];
const ROWS = [
  { id: 'default', currentIndex: 1, stages: STAGES },
  { id: 'thin', currentIndex: 1, track: 'thin', stages: STAGES },
];

let browser;
let tab;

/** A computed colour's channels without its alpha: Chromium keeps a forced colour's alpha. */
const rgb = (colour) => colour.match(/\d+/gu).slice(0, 3).join(' ');

/** Each row's bars as drawn now: the track's box, edge and paint, and its fill's and shares' boxes. */
const measure = () =>
  tab.evaluate(() => {
    const probe = getComputedStyle(document.querySelector('[data-probe]')).backgroundColor;
    const rows = Object.fromEntries(
      [...document.querySelectorAll('[data-row]')].map((row) => [
        row.dataset.row,
        [...row.querySelectorAll('.fab-stage-bars-track')].map((track) => {
          const bar = track.querySelector('.fab-fill-bar');
          const fill = bar.querySelector('.fab-fill-bar-fill');
          const style = getComputedStyle(bar);
          return {
            track: track.getBoundingClientRect().height,
            height: bar.getBoundingClientRect().height,
            border: ['Top', 'Right', 'Bottom', 'Left'].map((side) => style[`border${side}Width`]),
            borderColor: style.borderTopColor,
            background: style.backgroundColor,
            fill: fill.getBoundingClientRect().height,
            fillBackground: getComputedStyle(fill).backgroundColor,
            fillWidth: fill.getBoundingClientRect().width,
            shares: [...bar.querySelectorAll('.fab-fill-bar-share')].map((share) => ({
              width: share.getBoundingClientRect().width,
              height: share.getBoundingClientRect().height,
            })),
          };
        }),
      ])
    );
    return { probe, rows };
  });

let rest;
let forced;

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await harness.setup();
  const markup = [];
  for (const { id, ...props } of ROWS) {
    const root = await harness.mount({ ariaLabel: id, ...props });
    markup.push(`<div data-row="${id}" style="width:300px">${root.innerHTML}</div>`);
    harness.remount();
  }
  await tab.setContent(page(markup.join('\n')), { waitUntil: 'load' });
  rest = await measure();
  await tab.emulateMedia({ forcedColors: 'active' });
  forced = await measure();
});

after(async () => {
  harness.teardown();
  await browser?.close();
});

describe('StageBars forms, rendered (issue 2837)', () => {
  it('draws the thin track 6px tall, borderless, on --fab-bg-3, so the fill is the whole 6px', () => {
    for (const bar of rest.rows.thin) {
      assert.equal(bar.track, 6);
      assert.equal(bar.height, 6, 'the row’s 6px beats FillBar’s own thin 4px');
      assert.deepEqual(bar.border, ['0px', '0px', '0px', '0px']);
      assert.equal(bar.background, rest.probe);
    }
    assert.equal(rest.rows.thin[0].fill, 6, 'the filled stage’s fill is the whole track');
    assert.deepEqual(
      rest.rows.thin[1].shares.map(({ height }) => height),
      [6, 6]
    );
  });

  it('draws the default track 6px tall with a 1px edge on another ground, so the fill is 4px', () => {
    for (const bar of rest.rows.default) {
      assert.equal(bar.height, 6);
      assert.deepEqual(bar.border, ['1px', '1px', '1px', '1px']);
      assert.notEqual(bar.background, rest.probe);
    }
    assert.equal(rest.rows.default[0].fill, 4);
  });

  it('splits a stage’s fill by its shares’ weights, the stack half a full fill wide, on either track', () => {
    for (const id of ['default', 'thin']) {
      const [full, { fillWidth, shares }] = rest.rows[id];
      assert.ok(fillWidth > 0, `${id}: the stack is drawn`);
      assert.ok(Math.abs(fillWidth - full.fillWidth / 2) <= 0.5, `${id}: its value, 50, wide`);
      const width = shares.reduce((sum, share) => sum + share.width, 0);
      assert.ok(Math.abs(width - fillWidth) <= 0.5, `${id}: the shares make up the stack`);
      assert.ok(Math.abs(shares[0].width - fillWidth * 0.75) <= 0.5, `${id}: share 0`);
      assert.ok(Math.abs(shares[1].width - fillWidth * 0.25) <= 0.5, `${id}: share 1`);
    }
  });

  it('keeps a 1px edge on the thin track under forced colours, as on the default one', () => {
    for (const id of ['default', 'thin']) {
      for (const bar of forced.rows[id]) {
        assert.deepEqual(bar.border, ['1px', '1px', '1px', '1px'], `${id} under forced colours`);
        assert.equal(bar.height, 6);
      }
    }
    assert.equal(forced.rows.thin[0].borderColor, forced.rows.default[0].borderColor);
  });

  // A characterisation of CURRENT behaviour, not a contract: issue 2838 will give the fill a
  // forced-colours paint, and this test is then expected to change with it.
  it('characterises today’s forced colours: Chromium repaints the fill to the track’s own ground on either track (issue 2838 will change this)', () => {
    for (const id of ['default', 'thin']) {
      const [full] = forced.rows[id];
      assert.equal(rgb(full.fillBackground), rgb(full.background), `${id}: the fill is not seen`);
      assert.notEqual(full.borderColor, full.background, `${id}: the edge is`);
      assert.notEqual(rest.rows[id][0].fillBackground, rest.rows[id][0].background);
    }
  });
});
