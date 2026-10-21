/* The filter bar is one bordered box in every host, measured in a real browser (issue 2546).
   The sheet draws the box once and insets it from the hosts that do not pad their content, opening
   the box with `--fab-space-3` only where the bar is the host's first thing; the hosts that pad
   their own content (the Tools content column and the interactables column) add nothing. The
   Vocabulary panel's bar is covered by world-vocabulary-control-row-cascade.test.js, not here.
   The fixture is core-less, so its heights are the sheet's own. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const sheet = readStylesheet();
const scoped = (path) => scopedComponentCss(resolve(repoRoot, 'src/ui/svelte/apps', path));
const interactables = scoped('InteractableBrowserRoot.svelte');
const books = scoped('manager/BooksScrollsView.svelte');
const components = scoped('manager/ComponentsBrowserView.svelte');
const frame = scoped('manager/scoped/EntityListInspectorFrame.svelte');

const HOST_WIDTH_PX = 900;
const INSET_PX = 12;
/** The Tools content column pads `--fab-space-5`, so the bar's box starts 20px from the body. */
const TOOLS_EDGE_PX = 20;
const EPSILON_PX = 0.5;

/** One 34px control, which is what every bar in the manager holds on its single line. */
const CONTROL =
  '<button type="button" style="height: 34px; width: 120px; margin: 0">Filter</button>';
const BAR = `<section class="fabricate-filter-bar BAR_CLASS" aria-label="Filters">${CONTROL}</section>`;
const DROP_ZONE_BODY = '<i></i><span><strong>Drop</strong><small>an item</small></span>';

/**
 * The hosts, each with the markup that wraps a bar and what the sheet gives it.
 *
 * `margin` is the bar's own inline margin (0 where the host pads), `edge` is where its box starts
 * from the manager body's left edge, `above` names the element whose bottom edge the box opens
 * from (null where the bar opens the host, so the host's top edge is the anchor) and `gap` is the
 * distance from that anchor to the box: the old spacing wherever something already spaced it. A
 * host that pads its content has no `gap`, and `hostSelector` names the element whose padding does it.
 */
const HOSTS = Object.freeze([
  ...['recipes', 'essences', 'world-tools', 'components', 'systems', 'access'].map((view) =>
    Object.freeze({
      name: `the ${view} pane`,
      view,
      markup: (bar) => `<main class="manager-main">${bar}</main>`,
      margin: INSET_PX,
      edge: INSET_PX,
      above: null,
      gap: INSET_PX,
    })
  ),
  Object.freeze({
    name: 'the recipes pane, whose empty notice slot stands before the bar',
    view: 'recipes',
    markup: (bar) =>
      `<main class="manager-main"><div class="manager-recipe-notice"></div>${bar}</main>`,
    margin: INSET_PX,
    edge: INSET_PX,
    above: null,
    gap: INSET_PX,
  }),
  Object.freeze({
    name: 'the recipes pane, with the blocked-enable notice showing',
    view: 'recipes',
    markup: (bar) =>
      `<main class="manager-main"><div class="manager-recipe-notice"><div class="fab-notice" style="height: 40px"></div></div>${bar}</main>`,
    margin: INSET_PX,
    edge: INSET_PX,
    above: '.fab-notice',
    gap: INSET_PX,
  }),
  Object.freeze({
    name: 'the books pane, whose drop zone and gap already space the bar',
    view: 'books-scrolls',
    styles: books.css,
    markup: (bar) =>
      `<main class="manager-main manager-books-scrolls-main ${books.hashClass}"><section class="manager-books-scrolls-drop-zone ${books.hashClass}">${DROP_ZONE_BODY}</section>${bar}</main>`,
    margin: INSET_PX,
    edge: INSET_PX,
    above: '.manager-books-scrolls-drop-zone',
    // The drop zone's 12px margin plus the main's 12px gap, which is what it was before the box.
    gap: 2 * INSET_PX,
  }),
  Object.freeze({
    name: 'the components pane, whose drop zone stands before the bar',
    view: 'components',
    styles: components.css,
    markup: (bar) =>
      `<main class="manager-main"><div class="manager-component-head ${components.hashClass}"><section class="manager-component-drop-zone">${DROP_ZONE_BODY}</section></div>${bar}</main>`,
    margin: INSET_PX,
    edge: INSET_PX,
    above: '.manager-component-drop-zone',
    gap: INSET_PX,
  }),
  Object.freeze({
    name: 'a gathering panel',
    view: 'gathering',
    markup: (bar) => `<div class="manager-gathering-panel">${bar}</div>`,
    margin: INSET_PX,
    edge: INSET_PX,
    above: null,
    gap: INSET_PX,
  }),
  Object.freeze({
    name: 'the scoped list column',
    view: 'world-components',
    styles: frame.css,
    markup: (bar) =>
      withScopeHash(
        `<div class="manager-scoped-list-column">${bar}</div>`,
        'manager-scoped-list-column',
        frame.hashClass
      ),
    margin: INSET_PX,
    edge: INSET_PX,
    above: null,
    gap: INSET_PX,
  }),
  Object.freeze({
    name: 'the scoped list column, whose scope band leads it',
    view: 'world-tools',
    styles: frame.css,
    markup: (bar) =>
      withScopeHash(
        withScopeHash(
          `<div class="manager-scoped-list-column"><div class="manager-scoped-list-column-lead"><div style="height: 30px">Scope</div></div>${bar}</div>`,
          'manager-scoped-list-column',
          frame.hashClass
        ),
        'manager-scoped-list-column-lead',
        frame.hashClass
      ),
    margin: INSET_PX,
    edge: INSET_PX,
    above: '.manager-scoped-list-column-lead',
    // The column's own 12px gap, and nothing the bar adds.
    gap: INSET_PX,
  }),
  Object.freeze({
    name: 'the Tools content column, which pads its content',
    view: 'tools',
    markup: (bar) =>
      `<main class="manager-main"><div class="manager-tools-main-content"><section class="manager-tools-library-card">${bar}</section></div></main>`,
    margin: 0,
    edge: TOOLS_EDGE_PX,
    above: null,
    hostSelector: '.manager-tools-main-content',
  }),
  Object.freeze({
    name: 'the interactables column, which pads its content',
    view: null,
    styles: interactables.css,
    markup: (bar) =>
      `<div class="fabricate-interactable-browser ${interactables.hashClass}">${bar}</div>`,
    barClass: 'fab-ib-controls',
    margin: 0,
    edge: INSET_PX,
    above: null,
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
  const hostSelector = host.hostSelector ?? null;
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await tab.setContent(page(host));
    return await tab.evaluate(
      ({ aboveSelector, hostSelector }) => {
        const bar = document.querySelector('.fabricate-filter-bar');
        const box = bar.getBoundingClientRect();
        // The body is the reference, not the bar's parent: a padded host moves its own edge with it.
        const bodyBox = document.querySelector('.manager-body').getBoundingClientRect();
        const hostBox = (
          hostSelector ? document.querySelector(hostSelector) : bar.parentElement
        ).getBoundingClientRect();
        const anchor = aboveSelector ? document.querySelector(aboveSelector) : null;
        const style = getComputedStyle(bar);
        const probe = document.createElement('div');
        probe.style.background = 'var(--fab-bg-1)';
        bar.parentElement.append(probe);
        const bg1 = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          height: box.height,
          left: box.left - bodyBox.left,
          // Distance from the host's own outermost edges, so a padded host is checked against its border box.
          fromHostLeft: box.left - hostBox.left,
          fromHostTop: box.top - hostBox.top,
          above: box.top - (anchor ? anchor.getBoundingClientRect().bottom : hostBox.top),
          borders: ['top', 'right', 'bottom', 'left'].map(
            (edge) => `${style[`border-${edge}-width`]} ${style[`border-${edge}-style`]}`
          ),
          radius: style.borderTopLeftRadius,
          fill: style.backgroundColor,
          bg1,
          display: style.display,
          marginInline: [style.marginLeft, style.marginRight],
        };
      },
      { aboveSelector: host.above, hostSelector }
    );
  } finally {
    await tab.close();
  }
}

describe('the filter bar box, host by host', () => {
  for (const host of HOSTS) {
    it(`is a bordered radius-9 bg-1 flex box in ${host.name}`, async () => {
      const box = await measure(host);
      assert.deepEqual(
        box.borders,
        Array.from({ length: 4 }, () => '1px solid'),
        'a border on all four sides'
      );
      assert.equal(box.radius, '9px');
      assert.equal(box.display, 'flex');
      assert.notEqual(box.bg1, 'rgba(0, 0, 0, 0)', 'NON-VACUITY: --fab-bg-1 resolved');
      assert.equal(box.fill, box.bg1, 'the fill is --fab-bg-1');
      // One 34px control, 12px padding and a 1px border each side.
      assert.ok(Math.abs(box.height - 60) <= 1, `the bar is ${box.height}px tall, not 60`);
    });
  }

  for (const host of HOSTS) {
    it(`insets the box from the left edge in ${host.name}`, async () => {
      const box = await measure(host);
      const { margin, edge } = host;
      assert.deepEqual(
        box.marginInline.map(parseFloat),
        [margin, margin],
        `the bar's own inline margin is ${margin}px`
      );
      assert.ok(
        Math.abs(box.left - edge) <= EPSILON_PX,
        `the box starts ${box.left}px from the manager body's left edge, not ${edge}px`
      );
      assert.ok(
        box.fromHostLeft >= INSET_PX - EPSILON_PX,
        `the box is ${box.fromHostLeft}px from its host's left edge, under ${INSET_PX}px`
      );
    });
  }

  for (const host of HOSTS) {
    it(`opens the box ${host.gap ?? 'at least 12'}px below what leads it in ${host.name}`, async () => {
      const box = await measure(host);
      if (host.gap === undefined) {
        assert.ok(
          box.fromHostTop >= INSET_PX - EPSILON_PX,
          `the box is ${box.fromHostTop}px from its host's top edge, under ${INSET_PX}px`
        );
        return;
      }
      assert.ok(
        Math.abs(box.above - host.gap) <= EPSILON_PX,
        `the box opens ${box.above}px below its lead, not ${host.gap}px`
      );
    });
  }
});
