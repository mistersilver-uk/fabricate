/**
 * Issue 2821: `StageBars`' geometry measured in Chromium. A stage's `weight` sizes its bar as
 * `weight / Σweight` of the row with the gaps taken out of the total, and `gap` draws 6px between
 * the bars by default and 2px when tight.
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
  tmpPrefix: 'fabricate-stage-bars-geometry-',
  compiledModules: SCOPED.map(component),
  componentPath: component('StageBars'),
});

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${SCOPED.map((name) => scopedComponentCss(resolve(repoRoot, component(name))).css).join('\n')}</style>
</head><body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">
  ${markup}
</div></body></html>`;

const stagesOf = (weights) =>
  weights.map((weight, index) => ({ name: `S${index}`, value: 50, weight }));
const ROWS = [
  { id: 'equal', stages: stagesOf([undefined, undefined, undefined]) },
  { id: 'weighted', stages: stagesOf([1, 3, 6]) },
  { id: 'tight', gap: 'tight', stages: stagesOf([2, 2]) },
  { id: 'default', stages: stagesOf([2, 2]) },
];

let browser;
let tab;
let rows;

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
  rows = await tab.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-row]')].map((row) => {
        const group = row.querySelector('[role="group"]');
        const tracks = [...group.querySelectorAll('.fab-stage-bars-track')].map((track) =>
          track.getBoundingClientRect()
        );
        return [
          row.dataset.row,
          {
            widths: tracks.map(({ width }) => width),
            gaps: tracks.slice(1).map(({ left }, index) => left - tracks[index].right),
          },
        ];
      })
    )
  );
});

after(async () => {
  harness.teardown();
  await browser?.close();
});

describe('StageBars geometry, rendered (issue 2821)', () => {
  it('draws equal bars when no stage names a weight', () => {
    const { widths } = rows.equal;
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 0.5);
  });

  it('sizes the bars by weight over the sum of the room the gaps leave', () => {
    const { widths, gaps } = rows.weighted;
    const room = widths.reduce((sum, width) => sum + width, 0);
    assert.equal(gaps.length, 2);
    for (const [index, share] of [0.1, 0.3, 0.6].entries()) {
      assert.ok(Math.abs(widths[index] - room * share) <= 0.5, `bar ${index}: ${widths[index]}px`);
    }
  });

  it('draws a 6px gap by default and a 2px gap when tight', () => {
    assert.deepEqual(rows.default.gaps, [6]);
    assert.deepEqual(rows.tight.gaps, [2]);
  });
});
