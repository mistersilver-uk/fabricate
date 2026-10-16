/**
 * The gathering view in Chromium: the environment pager is the browse column's footer, flush to
 * the nav rail, the window bottom and the centre pane's rule, which with the right pane is a square
 * pane section. Stacked, the pager spans the window on one row with the centre pane beneath it.
 */
import { after, before, describe, it } from 'node:test';

import {
  assertFooterSideBySide,
  assertFooterStacked,
  assertNoFooterKeepsPadding,
} from '../helpers/railFooterAssertions.js';
import { railFooterGeometry } from '../helpers/railFooterGeometry.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@gathering-view-styles/' });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

const POPULATED = '[data-gathering-state="populated"]';

const view = (count, readySelector, extra = {}) => ({
  url: `/tests/fixtures/gathering-view/index.html?count=${count}`,
  readySelector,
  selectors: {
    host: '[data-host]',
    column: '.gathering-view-column-left',
    list: '.gathering-env-list-scroll',
    centre: '.gathering-view-column-center',
    right: '.gathering-view-column-right',
    ...extra,
  },
});

const PAGER = '.gathering-env-pagination .fabricate-pagination';
const PAGED = view(7, `${POPULATED} ${PAGER}`, { pager: PAGER });

describe('gathering view, rendered: the environment pager is the browse column footer', () => {
  it('meets the nav rail, the window bottom and the centre pane side by side', async () => {
    assertFooterSideBySide(await railFooterGeometry(fixtureServer, PAGED, 1200));
  });

  it('spans the window on one row with the centre pane beneath it, stacked', async () => {
    assertFooterStacked(await railFooterGeometry(fixtureServer, PAGED, 900));
  });

  it('keeps the column padding below a list too short to page', async () => {
    const short = view(6, `${POPULATED} [data-environment-id]`);
    assertNoFooterKeepsPadding(await railFooterGeometry(fixtureServer, short, 1200));
  });
});
