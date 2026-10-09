/**
 * The inventory view in Chromium: the detail column is a full rail section flush to the content
 * area's edges, and the grid's pager is the left column's footer, so its outer box meets the nav
 * rail, the window's bottom edge and the detail rail's border with no gutter. Stacked, the pager
 * spans the window and the detail rail stands directly beneath it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@inventory-view-styles/' });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/** The host, the pager, the left rail and the detail panel boxes, mounted `width` wide. */
async function boxesAt(width) {
  const page = await fixtureServer.newPage({ viewport: { width: width + 40, height: 900 } });
  await page.goto(fixtureServer.url(`/tests/fixtures/inventory-view/index.html?width=${width}`));
  await page.waitForSelector('html[data-inventory-view-ready="true"] [data-inventory-card]');
  const boxes = await page.evaluate(() => {
    const box = (selector) => {
      const { left, top, right, bottom } = document.querySelector(selector).getBoundingClientRect();
      return { left, top, right, bottom };
    };
    return {
      host: box('[data-host]'),
      pager: box('.inventory-grid-pagination .fabricate-pagination'),
      rail: box('.inventory-view-column-left'),
      detail: box('[data-inventory-detail]'),
    };
  });
  await page.close();
  return boxes;
}

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 0.5, `${label}: ${actual}, expected ${expected}`);

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
