/**
 * Issue 3030: the manager nav reveals its active row, within the nav only, at every width. The
 * real rows mount in a side-rail layout with the active row below the fold; mounting, or moving the
 * active row, brings it inside the nav's rect without scrolling the page, and a row already in
 * view leaves `scrollTop` alone.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const WIDTHS = [1000, 1280];

describe('the nav reveals its active row (issue 3030)', () => {
  const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@nav-reveal-styles/' });

  before(async () => {
    await fixtureServer.start();
  });

  after(async () => {
    await fixtureServer.stop();
  });

  /** Open the fixture and read where the nav, the active row and the window sit. */
  async function open(width, query) {
    const page = await fixtureServer.newPage({ viewport: { width, height: 720 } });
    await page.goto(
      fixtureServer.url(`/tests/fixtures/nav-reveal/index.html?width=${width}&${query}`)
    );
    await page.waitForFunction(() => document.documentElement.dataset.navRevealReady);
    // Layout settles once the fonts have, and a reveal that follows it is part of what is measured.
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (let frame = 0; frame < 3; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    });
    return page;
  }

  const read = (page) =>
    page.evaluate(() => {
      const nav = document.querySelector('.manager-nav');
      const row = document.querySelector('.manager-nav .is-active:not(.manager-nav-subitem)');
      const navBox = nav.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      return {
        scrollTop: nav.scrollTop,
        overflows: nav.scrollHeight > nav.clientHeight + 1,
        rowWithinNav: rowBox.top >= navBox.top - 0.5 && rowBox.bottom <= navBox.bottom + 0.5,
        pageScroll: [window.scrollX, window.scrollY, document.scrollingElement.scrollTop],
        railScroll: document.querySelector('.manager-rail').scrollTop,
      };
    });

  it('keeps a collapsed rail where it was when the active child is hidden', async () => {
    const page = await open(1000, 'active=26&grouped&collapsed');
    const measured = await read(page);
    assert.equal(measured.overflows, true, 'the nav is the scroller (anti-vacuity)');
    const child = await page.evaluate(
      () => document.querySelector('.manager-nav-subitem').getClientRects().length
    );
    assert.equal(child, 0, 'the active child has no box in a collapsed rail (anti-vacuity)');
    assert.ok(measured.scrollTop > 0, `the parent was revealed: ${JSON.stringify(measured)}`);
    assert.equal(measured.rowWithinNav, true, JSON.stringify(measured));
    await page.evaluate(() => {
      document.querySelector('.manager-body').classList.remove('is-rail-collapsed');
      document.querySelector('.manager-body').classList.add('is-rail-collapsed');
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    assert.equal((await read(page)).rowWithinNav, true, 'and a resize does not undo it');
    await page.close();
  });

  it('reveals the row in the rail of a stacked strip, where the nav does not scroll', async () => {
    const page = await open(800, 'view=tool-edit&active=26&stacked');
    const measured = await page.evaluate(() => {
      const rail = document.querySelector('.manager-rail');
      const nav = rail.querySelector('.manager-nav');
      const row = nav.querySelector('.is-active');
      const railBox = rail.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      const link = rail.querySelector('.manager-scope-return').getBoundingClientRect();
      return {
        railScrolls: rail.scrollHeight > rail.clientHeight + 1,
        railScrollTop: rail.scrollTop,
        navOverflowY: getComputedStyle(nav).overflowY,
        rowWithinRail: rowBox.top >= railBox.top && rowBox.bottom <= railBox.bottom + 0.5,
        rowBelowLink: rowBox.top >= link.bottom - 0.5,
        pageScroll: [window.scrollX, window.scrollY, document.scrollingElement.scrollTop],
      };
    });
    assert.equal(
      measured.railScrolls,
      true,
      `the rail is the scroller: ${JSON.stringify(measured)}`
    );
    assert.notEqual(measured.navOverflowY, 'auto', 'the nav is not the scroller here');
    assert.ok(measured.railScrollTop > 0, JSON.stringify(measured));
    assert.equal(measured.rowWithinRail, true, JSON.stringify(measured));
    assert.equal(measured.rowBelowLink, true, 'the row is not left under the pinned link');
    assert.deepEqual(measured.pageScroll, [0, 0, 0], 'the window did not scroll');
    await page.close();
  });

  for (const width of WIDTHS) {
    it(`mounts with a row below the fold inside the nav at ${width}px`, async () => {
      const page = await open(width, 'active=26');
      const measured = await read(page);
      assert.equal(measured.overflows, true, 'the nav is the scroller (anti-vacuity)');
      assert.ok(measured.scrollTop > 0, JSON.stringify(measured));
      assert.equal(measured.rowWithinNav, true, JSON.stringify(measured));
      assert.deepEqual(measured.pageScroll, [0, 0, 0], 'the window did not scroll');
      assert.equal(measured.railScroll, 0, 'only the nav scrolled');
      await page.close();
    });

    it(`reveals the row a route change makes active at ${width}px`, async () => {
      const page = await open(width, 'active=0');
      assert.equal((await read(page)).scrollTop, 0);
      await page.evaluate(() => globalThis.__navReveal.setActive(28));
      await page.waitForFunction(
        () => document.querySelector('.manager-nav').scrollTop > 0,
        undefined,
        { timeout: 5000 }
      );
      const measured = await read(page);
      assert.equal(measured.rowWithinNav, true, JSON.stringify(measured));
      assert.deepEqual(measured.pageScroll, [0, 0, 0]);
      await page.close();
    });

    it(`keeps the active row in view when the nav shrinks at ${width}px`, async () => {
      const page = await open(width, 'active=12');
      assert.equal((await read(page)).rowWithinNav, true);
      await page.evaluate(() => {
        const body = document.querySelector('.manager-body');
        body.style.height = '300px';
        body.style.gridTemplateRows = '300px';
      });
      await page.waitForFunction(() => {
        const nav = document.querySelector('.manager-nav');
        const row = nav.querySelector('.is-active').getBoundingClientRect();
        return nav.clientHeight < 250 && row.bottom <= nav.getBoundingClientRect().bottom + 0.5;
      });
      assert.deepEqual((await read(page)).pageScroll, [0, 0, 0]);
      await page.close();
    });

    it(`control: an active row already in view leaves scrollTop unchanged at ${width}px`, async () => {
      const page = await open(width, 'active=2');
      const measured = await read(page);
      assert.equal(measured.overflows, true);
      assert.equal(measured.scrollTop, 0, JSON.stringify(measured));
      assert.equal(measured.rowWithinNav, true);
      await page.close();
    });
  }
});
