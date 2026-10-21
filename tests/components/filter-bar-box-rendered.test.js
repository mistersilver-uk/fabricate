/* THE FILTER BAR IS ONE BORDERED BOX IN EVERY HOST, MEASURED IN A REAL BROWSER (issue 2546, M2).
   The sheet draws the box once and insets it from the three hosts that do not pad their content;
   the hosts that do pad theirs (the Tools card, the interactables column, the Vocabulary panel)
   add nothing. The fixture is core-less, so its heights are the sheet's own. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const sheet = readStylesheet();
const interactables = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/InteractableBrowserRoot.svelte')
);

const HOST_WIDTH_PX = 900;
const INSET_PX = 12;
const EPSILON_PX = 0.5;

/** One 34px control, which is what every bar in the manager holds on its single line. */
const CONTROL = '<button type="button" style="height: 34px; width: 120px; margin: 0">Filter</button>';
const BAR = `<section class="fabricate-filter-bar BAR_CLASS" aria-label="Filters">${CONTROL}</section>`;

/** The hosts, each with the markup that wraps a bar and the margin the SHEET gives it (0 where the host pads). */
const HOSTS = Object.freeze([
  ...['recipes', 'essences', 'world-tools', 'components', 'systems'].map((view) =>
    Object.freeze({
      name: `the ${view} pane`,
      view,
      markup: (bar) => `<main class="manager-main">${bar}</main>`,
      margin: INSET_PX,
    })
  ),
  Object.freeze({
    name: 'a gathering panel',
    view: 'gathering',
    markup: (bar) => `<div class="manager-gathering-panel">${bar}</div>`,
    margin: INSET_PX,
  }),
  Object.freeze({
    name: 'the scoped list column',
    view: 'world-components',
    markup: (bar) => `<div class="manager-scoped-list-column">${bar}</div>`,
    margin: INSET_PX,
  }),
  Object.freeze({
    name: 'the Tools card, whose content the pane pads',
    view: 'tools',
    markup: (bar) =>
      `<main class="manager-main"><div class="manager-tools-main-content"><section class="manager-tools-library-card">${bar}</section></div></main>`,
    margin: 0,
  }),
  Object.freeze({
    name: 'the interactables column, which pads its content',
    view: null,
    styles: interactables.css,
    markup: (bar) =>
      `<div class="fabricate-interactable-browser ${interactables.hashClass}">${bar}</div>`,
    barClass: 'fab-ib-controls',
    margin: 0,
  }),
]);

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

function page(host) {
  const bar = BAR.replace('BAR_CLASS', host.barClass ?? 'probe-bar');
  const view = host.view ? `data-manager-view="${host.view}"` : '';
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>@layer modules { ${sheet} }</style>
    <style>${host.styles ?? ''}</style>
    <style>html, body { margin: 0; padding: 0; } .probe-host { width: ${HOST_WIDTH_PX}px; }</style></head>
    <body><div class="probe-host"><div class="fabricate fabricate-manager" data-fabricate-theme="dark" ${view}>
    <div class="manager-body">${host.markup(bar)}</div></div></div></body></html>`;
}

async function measure(host) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await tab.setContent(page(host));
    return await tab.evaluate(() => {
      const bar = document.querySelector('.fabricate-filter-bar');
      const box = bar.getBoundingClientRect();
      const parentBox = bar.parentElement.getBoundingClientRect();
      const style = getComputedStyle(bar);
      const probe = document.createElement('div');
      probe.style.background = 'var(--fab-bg-1)';
      bar.parentElement.append(probe);
      const bg1 = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const parentStyle = getComputedStyle(bar.parentElement);
      return {
        height: box.height,
        left: box.left - parentBox.left - parseFloat(parentStyle.paddingLeft),
        right: parentBox.right - box.right - parseFloat(parentStyle.paddingRight),
        borders: ['top', 'right', 'bottom', 'left'].map(
          (edge) => `${style[`border-${edge}-width`]} ${style[`border-${edge}-style`]}`
        ),
        radius: style.borderTopLeftRadius,
        fill: style.backgroundColor,
        bg1,
        display: style.display,
        marginInline: [style.marginLeft, style.marginRight],
      };
    });
  } finally {
    await tab.close();
  }
}

describe('the filter bar box, host by host', () => {
  for (const host of HOSTS) {
    it(`is a bordered radius-9 bg-1 flex box in ${host.name}`, async () => {
      const box = await measure(host);
      assert.deepEqual(box.borders, Array(4).fill('1px solid'), 'a border on all four sides');
      assert.equal(box.radius, '9px');
      assert.equal(box.display, 'flex');
      assert.notEqual(box.bg1, 'rgba(0, 0, 0, 0)', 'NON-VACUITY: --fab-bg-1 resolved');
      assert.equal(box.fill, box.bg1, 'the fill is --fab-bg-1');
      // One 34px control, 12px padding and a 1px border each side.
      assert.ok(Math.abs(box.height - 60) <= 1, `the bar is ${box.height}px tall, not 60`);
    });
  }

  for (const host of HOSTS) {
    it(`insets the box from the edges of ${host.name} and never bleeds past them`, async () => {
      const box = await measure(host);
      const { margin } = host;
      assert.deepEqual(
        box.marginInline.map(parseFloat),
        [margin, margin],
        `the bar's own inline margin is ${margin}px`
      );
      assert.ok(
        Math.abs(box.left - margin) <= EPSILON_PX && Math.abs(box.right - margin) <= EPSILON_PX,
        `the box is ${box.left}/${box.right}px from its host's content edges, not ${margin}px`
      );
    });
  }
});
