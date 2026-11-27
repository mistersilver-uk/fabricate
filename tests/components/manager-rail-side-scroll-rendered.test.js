/**
 * Issue 3030: a side rail's pinned `← All crafting systems` link must never share pixels with a
 * nav row. Below the manager's 1120px rung the stacked rail pins its label and scope card and lets
 * the whole rail scroll beneath them. The routes that keep their rail BESIDE the content kept that
 * pin, so a nav row scrolled to the active item was cut flush under the link, half of it hidden.
 *
 * The shipped stylesheet is laid over static markup in the stacked width. For every route that
 * keeps a side rail, the rail and the nav are scrolled to their ends, as scrolling to the active
 * item does, and the nav's own clip edge must sit below the link, with the link still the topmost
 * thing at its centre. A stacked route is the control: it keeps its pin.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

const stylesheet = readStylesheet();

/** Below the 1120px container rung, where the stacked rail rules apply. */
const HOST_WIDTH_PX = 1000;
const HOST_HEIGHT_PX = 720;
const NAV_ROWS = 30;

/** The routes that keep the rail beside the content: `fabricate-manager-tool-editor-environments.css`. */
const SIDE_RAIL_VIEWS = Object.freeze([
  'data-manager-view="tool-edit"',
  'data-manager-view="tools"',
  'data-manager-view="knowledge"',
  'data-manager-view="world-downtime"',
  'data-manager-view="component-edit"',
  'data-manager-view="recipe-edit"',
  'data-manager-view="gathering-task-edit" data-gathering-task-layout="full"',
  'data-manager-view="world-currency"',
  'data-manager-view="world-prerequisites"',
  'data-manager-view="world-modifiers"',
  'data-manager-view="tags"',
  'data-manager-view="world-components"',
  'data-manager-view="world-component-entry"',
  'data-manager-view="world-essences"',
  'data-manager-view="world-essence-entry"',
  'data-manager-view="world-tools"',
  'data-manager-view="world-tool-entry"',
  'data-manager-view="world-vocabulary"',
]);

/** A route that stacks its rail above the content: the pin is its contract. */
const STACKED_VIEW = 'data-manager-view="systems"';

/**
 * The rail as it ships: label, scope card with the return link, and a nav taller than the rail.
 *
 * @param {string} viewAttributes
 * @returns {string}
 */
function railPage(viewAttributes) {
  const rows = Array.from(
    { length: NAV_ROWS },
    (_, index) =>
      `<button type="button" class="manager-nav-button" data-nav-row="${index}"><span>Row ${index}</span></button>`
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${stylesheet}</style>
    <style>html, body { margin: 0; padding: 0; }
      .probe-host { width: ${HOST_WIDTH_PX}px; height: ${HOST_HEIGHT_PX}px; }
      .probe-body { grid-template-columns: 220px minmax(0, 1fr); grid-template-rows: ${HOST_HEIGHT_PX}px; }</style>
    </head><body><div class="probe-host">
      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" ${viewAttributes}>
        <div class="manager-body probe-body">
          <aside class="manager-rail">
            <p class="manager-rail-title">GM Management</p>
            <section class="manager-rail-block">
              <div class="manager-scope-card">
                <button type="button" class="manager-scope-return"><span>All crafting systems</span></button>
              </div>
            </section>
            <nav class="fabricate-nav manager-nav">${rows}</nav>
          </aside>
          <main class="manager-main"></main>
        </div>
      </div>
    </div></body></html>`;
}

/**
 * Scroll the rail and the nav to their ends, then read where the nav's clip edge and the link sit.
 *
 * @returns {object}
 */
function measureRail() {
  const rail = document.querySelector('.manager-rail');
  const nav = document.querySelector('.manager-nav');
  const link = document.querySelector('.manager-scope-return');
  const block = document.querySelector('.manager-rail-block');
  rail.scrollTop = rail.scrollHeight;
  nav.scrollTop = nav.scrollHeight;
  const navBox = nav.getBoundingClientRect();
  const linkBox = link.getBoundingClientRect();
  const hit = document.elementFromPoint(
    linkBox.left + linkBox.width / 2,
    linkBox.top + linkBox.height / 2
  );
  return {
    blockPosition: getComputedStyle(block).position,
    navScrolls: nav.scrollHeight > nav.clientHeight + 1,
    navTop: Math.round(navBox.top * 10) / 10,
    linkBottom: Math.round(linkBox.bottom * 10) / 10,
    linkHeight: Math.round(linkBox.height),
    linkHit: Boolean(hit?.closest?.('.manager-scope-return')),
  };
}

describe('a side rail never draws a nav row under its pinned return link', () => {
  let browser;
  let page;

  before(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({
      viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX },
    });
  });

  after(async () => {
    await browser?.close();
  });

  for (const view of SIDE_RAIL_VIEWS) {
    it(`${view}: the nav's clip edge sits below the link`, async () => {
      await page.setContent(railPage(view), { waitUntil: 'load' });
      const measured = await page.evaluate(measureRail);
      assert.ok(measured.linkHeight >= 20, `the link rendered (${JSON.stringify(measured)})`);
      assert.equal(measured.navScrolls, true, 'the nav is the scroller (anti-vacuity)');
      assert.equal(measured.blockPosition, 'static', 'the scope block is not pinned');
      assert.ok(
        measured.navTop >= measured.linkBottom,
        `nav top ${measured.navTop} must be at or below the link's bottom ${measured.linkBottom}`
      );
      assert.equal(measured.linkHit, true, 'the link is the topmost thing at its centre');
    });
  }

  it('control: a stacked route keeps its pin', async () => {
    await page.setContent(railPage(STACKED_VIEW), { waitUntil: 'load' });
    const measured = await page.evaluate(measureRail);
    assert.equal(measured.blockPosition, 'sticky', JSON.stringify(measured));
  });
});
