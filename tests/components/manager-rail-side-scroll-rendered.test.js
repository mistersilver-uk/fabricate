/**
 * Issue 3030: a rail kept beside the content must not pin its label and scope card over a nav
 * that scrolls beneath them. The shipped stylesheet is laid over static markup below the 1120px
 * rung; each side-rail route is scrolled to its ends and the nav's clip edge must sit below the
 * return link. A route that restacks into a strip at 831px keeps its pin there, as does `systems`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

const stylesheet = readStylesheet();

const HOST_WIDTH_PX = 1000;
const HOST_HEIGHT_PX = 720;
/** Below the 832px container rung, where `tool-edit`, `tools` and `knowledge` restack their rail. */
const STACKED_STRIP_WIDTH_PX = 800;
const NAV_ROWS = 30;

/**
 * The view names in each `:is()` list that unpins the rail blocks, read from the shipped sheet so
 * the lists cannot drift from the CSS. The first list applies at every width; the second sits
 * behind a container-width gate, which must open between them.
 */
const UNPIN_RULE =
  /:is\(([^)]*)\)\s*\.manager-rail > :is\(\.manager-rail-title, \.manager-rail-block\) \{/g;
const unpinRules = [...stylesheet.matchAll(UNPIN_RULE)];
assert.equal(unpinRules.length, 2, 'the sheet has one always-on and one gated unpin rule');
assert.match(
  stylesheet.slice(unpinRules[0].index, unpinRules[1].index),
  /@container fabricate-manager \(min-width: \d+px\) \{/,
  'the second unpin rule sits behind a container-width gate'
);
const viewsOf = (rule) =>
  [...rule[1].matchAll(/data-manager-view="([^"]+)"/g)].map((view) => view[1]);
const ALWAYS_SIDE_RAIL_VIEWS = viewsOf(unpinRules[0]);
const GATED_SIDE_RAIL_VIEWS = viewsOf(unpinRules[1]);

/** A route that stacks its rail above the content: the pin is its contract. */
const STACKED_VIEW = 'systems';

/**
 * The rail as it ships: label, scope card with the return link, and a nav taller than the rail.
 *
 * @param {string} viewAttributes
 * @param {number} hostWidth
 * @returns {string}
 */
function railPage(viewAttributes, hostWidth = HOST_WIDTH_PX) {
  const nav = `<nav class="fabricate-nav manager-nav">${Array.from(
    { length: NAV_ROWS },
    (_, index) =>
      `<button type="button" class="manager-nav-button" data-nav-row="${index}"><span>Row ${index}</span></button>`
  ).join('')}</nav>`;
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${stylesheet}</style>
    <style>html, body { margin: 0; padding: 0; }
      .probe-host { width: ${hostWidth}px; height: ${HOST_HEIGHT_PX}px; }
      .probe-body { grid-template-columns: 220px minmax(0, 1fr); grid-template-rows: ${HOST_HEIGHT_PX}px; }</style>
    </head><body><div class="probe-host">
      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" ${viewAttributes}>
        <div class="manager-body probe-body">
          <aside class="manager-rail">
            <p class="manager-rail-title">GM Management</p>
            <section class="manager-rail-block">
              <div class="manager-scope-card">
                <div class="manager-scope-card-head">
                  <p class="manager-kicker">Crafting system</p>
                  <button type="button" class="manager-rail-toggle manager-scope-collapse" aria-label="Collapse"><i class="fas fa-angles-left" aria-hidden="true"></i></button>
                </div>
                <div class="manager-scope-select" style="height: 32px"></div>
                <button type="button" class="manager-scope-return"><i class="fas fa-arrow-left-long" aria-hidden="true"></i><span>All crafting systems</span></button>
              </div>
            </section>
            ${nav}
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
    navOverflowY: getComputedStyle(nav).overflowY,
    railOverflowY: getComputedStyle(rail).overflowY,
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

  const sideRailPages = [
    ...[...ALWAYS_SIDE_RAIL_VIEWS, ...GATED_SIDE_RAIL_VIEWS].map((view) => [
      view,
      `data-manager-view="${view}"`,
    ]),
    [
      'gathering-task-edit (full layout)',
      'data-manager-view="gathering-task-edit" data-gathering-task-layout="full"',
    ],
  ];

  it('reads the route lists from the stylesheet', () => {
    assert.ok(ALWAYS_SIDE_RAIL_VIEWS.length >= 15, ALWAYS_SIDE_RAIL_VIEWS.join(', '));
    assert.deepEqual(GATED_SIDE_RAIL_VIEWS, ['tool-edit', 'tools', 'knowledge']);
  });

  for (const [name, attributes] of sideRailPages) {
    it(`${name}: the nav's clip edge sits below the link`, async () => {
      await page.setContent(railPage(attributes), { waitUntil: 'load' });
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

  for (const view of GATED_SIDE_RAIL_VIEWS) {
    it(`control: ${view} keeps its stacked pin and rail-level scroll at ${STACKED_STRIP_WIDTH_PX}px`, async () => {
      await page.setContent(railPage(`data-manager-view="${view}"`, STACKED_STRIP_WIDTH_PX), {
        waitUntil: 'load',
      });
      const measured = await page.evaluate(measureRail);
      assert.equal(measured.blockPosition, 'sticky', JSON.stringify(measured));
      assert.notEqual(measured.navOverflowY, 'auto', JSON.stringify(measured));
      assert.notEqual(measured.railOverflowY, 'visible', JSON.stringify(measured));
    });
  }

  it('control: a stacked route keeps its pin', async () => {
    await page.setContent(railPage(`data-manager-view="${STACKED_VIEW}"`), { waitUntil: 'load' });
    const measured = await page.evaluate(measureRail);
    assert.equal(measured.blockPosition, 'sticky', JSON.stringify(measured));
  });
});
