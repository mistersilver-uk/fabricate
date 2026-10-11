/**
 * The inventory view in Chromium: the detail column is a full rail section flush to the content
 * area's edges, and the grid's pager is the left column's footer, so its outer box meets the nav
 * rail, the window's bottom edge and the detail rail's border with no gutter. Stacked, the pager
 * spans the window and the detail rail stands directly beneath it.
 */
import { after, before, describe, it } from 'node:test';

import { near, railFooterGeometry } from '../helpers/railFooterGeometry.js';
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
