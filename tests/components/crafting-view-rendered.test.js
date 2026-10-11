/**
 * The crafting view in Chromium: the recipe pager is the browse column's footer, flush to the nav
 * rail, the window bottom and the centre pane's rule, which with the right pane is a square pane
 * section. Stacked, the pager spans the window on one row with the centre pane directly beneath.
 */
import { after, before, describe, it } from 'node:test';

import {
  assertFooterSideBySide,
  assertFooterStacked,
  assertNoFooterKeepsPadding,
} from '../helpers/railFooterAssertions.js';
import { railFooterGeometry } from '../helpers/railFooterGeometry.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@crafting-view-styles/' });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

const READY =
  'html[data-crafting-view-ready="true"] [data-crafting-state="populated"] [data-recipe-id]';

const view = (count, extra = {}) => ({
  url: `/tests/fixtures/crafting-view/index.html?count=${count}`,
  readySelector: READY,
  selectors: {
    host: '[data-host]',
    column: '.crafting-view-column-left',
    list: '.crafting-browser-list',
    centre: '.crafting-view-column-center',
    right: '.crafting-view-column-right',
    ...extra,
  },
});

const PAGED = view(13, { pager: '.crafting-browser-pagination .fabricate-pagination' });

describe('crafting view, rendered: the recipe pager is the browse column footer', () => {
  it('meets the nav rail, the window bottom and the centre pane side by side', async () => {
    assertFooterSideBySide(await railFooterGeometry(fixtureServer, PAGED, 1200));
  });

  it('spans the window on one row with the centre pane beneath it, stacked', async () => {
    assertFooterStacked(await railFooterGeometry(fixtureServer, PAGED, 900));
  });

  it('keeps the column padding below a list too short to page', async () => {
    assertNoFooterKeepsPadding(await railFooterGeometry(fixtureServer, view(12), 1200));
  });
});
