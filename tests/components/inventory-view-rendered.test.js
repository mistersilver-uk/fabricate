/**
 * The inventory view in Chromium: the detail column is a full rail section flush to the content
 * area's edges, and the grid's pager is the left column's footer, so its outer box meets the nav
 * rail, the window's bottom edge and the detail rail's border with no gutter. Stacked, the pager
 * spans the window and the detail rail stands directly beneath it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { near } from '../helpers/railFooterAssertions.js';
import { railFooterGeometry } from '../helpers/railFooterGeometry.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@inventory-view-styles/' });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

const VIEW = {
  url: '/tests/fixtures/inventory-view/index.html',
  readySelector: 'html[data-inventory-view-ready="true"] [data-inventory-card]',
  selectors: {
    host: '[data-host]',
    pager: '.inventory-grid-pagination .fabricate-pagination',
    rail: '.inventory-view-column-left',
    detail: '[data-inventory-detail]',
  },
};

const boxesAt = (width) => railFooterGeometry(fixtureServer, VIEW, width);

describe('inventory view, rendered: the pager is the left column footer', () => {
  it('meets the nav rail, the window bottom and the detail rail side by side', async () => {
    const { host, pager, detail } = await boxesAt(1200);
    near(pager.left, host.left, 'its left edge against the nav rail');
    near(pager.right, detail.left, 'its right edge against the detail rail');
    near(pager.bottom, host.bottom, 'its bottom edge against the window');
    near(detail.top, host.top, 'the detail rail at the top edge');
    near(detail.right, host.right, 'the detail rail at the right edge');
    near(detail.bottom, host.bottom, 'the detail rail at the bottom edge');
  });

  it('spans the window with the detail rail directly beneath it, stacked', async () => {
    const { host, pager, rail, detail } = await boxesAt(900);
    near(pager.left, host.left, 'its left edge against the nav rail');
    near(pager.right, host.right, 'its right edge against the window');
    near(pager.bottom, rail.bottom, 'its bottom edge on the left column');
    near(detail.top, pager.bottom, 'the detail rail against its bottom edge');
    near(detail.left, host.left, 'the detail rail at the left edge');
    near(detail.right, host.right, 'the detail rail at the right edge');
  });
});

/** The bulk panel's footer against the detail column's scroller, at three scroll offsets. */
async function bulkFooterAt(rows) {
  const page = await fixtureServer.newPage({ viewport: { width: 1240, height: 900 } });
  try {
    await page.goto(fixtureServer.url(`${VIEW.url}?width=1200&bulk=${rows}`));
    await page.waitForSelector(
      'html[data-inventory-view-ready="true"] [data-inventory-bulk-footer]'
    );
    return await page.evaluate(() => {
      // The scroller is the shell's root inside the column section; both carry the hook.
      const column = document.querySelector('.inventory-detail[data-inventory-detail]');
      const footer = column.querySelector('[data-inventory-bulk-footer]');
      const sampleAt = (scrollTop) => {
        column.scrollTop = scrollTop;
        const box = column.getBoundingClientRect();
        const foot = footer.getBoundingClientRect();
        return {
          scrollTop: column.scrollTop,
          column: { left: box.left + column.clientLeft, right: box.right, bottom: box.bottom },
          footer: { left: foot.left, right: foot.right, bottom: foot.bottom },
        };
      };
      const overflow = column.scrollHeight - column.clientHeight;
      return {
        overflow,
        samples: [sampleAt(0), sampleAt(Math.floor(overflow / 2)), sampleAt(column.scrollHeight)],
      };
    });
  } finally {
    await page.close();
  }
}

/** Two edges within a pixel: a clamped integer `scrollTop` leaves a sub-pixel residue. */
const within = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual}, expected ${expected}`);

// Maintainer ruling, 2026-10-14: pinned to the column's foot and spanning its full width.
describe("inventory view, rendered: the bulk footer sits on the detail column's foot", () => {
  for (const [label, rows] of [
    ['a short queue', 1],
    ['a queue taller than the column', 25],
  ]) {
    it(`meets the column's bottom and both sides with ${label}`, async () => {
      const { overflow, samples } = await bulkFooterAt(rows);
      assert.ok(
        rows === 1 ? overflow === 0 : overflow >= 48,
        `NON-VACUITY: ${label} overflows the column by ${overflow}px`
      );
      for (const { scrollTop, column, footer } of samples) {
        within(
          footer.bottom,
          column.bottom,
          `its bottom edge on the column's foot at ${scrollTop}px`
        );
        within(footer.left, column.left, `its left edge on the column's at ${scrollTop}px`);
        within(footer.right, column.right, `its right edge on the column's at ${scrollTop}px`);
      }
    });
  }
});
