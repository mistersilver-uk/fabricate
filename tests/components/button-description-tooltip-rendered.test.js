/**
 * Issue 2895 — a described published `IconButton`, and `Button` given a `tooltip`, mounted live
 * through the seam in Chromium beside a `game.tooltip` that sets and removes `aria-describedby` as
 * Foundry's does: reached by Tab, each opens its tooltip, and Chromium's accessibility tree reads
 * the tooltip and then the description, the caller's hint between them on `Button`; once focus
 * moves on, the description alone.
 * Limit: the tree is read once focus has settled, not at the instant a screen reader is told of
 * it, and no screen reader runs.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromiumAxDescribed } from '../helpers/chromiumAxNode.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const server = createViteFixtureServer({ styleMountPrefix: '/@button-description-styles/' });
const LABEL = 'Back 1 day';
const DESCRIPTION = 'Moves the date back 1 day; credits stay';
const TIP = 'Rewinds the clock';
const HINT = 'Credits are kept in the ledger.';

/** Each case in Tab order, its description while its tooltip is open, and once it has closed. */
const CASES = Object.freeze([
  ['icon', `${LABEL} ${DESCRIPTION}`, DESCRIPTION],
  ['button-tooltip', `${TIP} ${DESCRIPTION}`, DESCRIPTION],
  ['button-hinted', `${TIP} ${HINT} ${DESCRIPTION}`, `${HINT} ${DESCRIPTION}`],
]);

let page;

before(async () => {
  await server.start();
  page = await server.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto(server.url('/tests/fixtures/published-button-description/index.html'));
  await page.waitForFunction(() => globalThis.__describedReady === true);
});

after(async () => {
  await page?.close();
  await server.stop();
});

const control = (id) => `[data-case="${id}"] button`;

/** Whether the case's control holds focus and the open tooltip is its. */
const focusedWithTooltip = (id) =>
  page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return document.activeElement === node && globalThis.game.tooltip.element === node;
  }, control(id));

describe('a described published control beside Foundry’s keyboard tooltip, in Chromium', () => {
  it('reads the tooltip, then the description, at each Tab stop, and the description once left', async () => {
    for (const [id, open] of CASES) {
      await page.keyboard.press('Tab');
      assert.equal(await focusedWithTooltip(id), true, `${id} focused, its tooltip open`);
      assert.deepEqual(
        await chromiumAxDescribed(page, control(id)),
        { role: 'button', name: LABEL, description: open },
        id
      );
    }
    await page.evaluate(() => document.activeElement.blur());
    assert.equal(await page.evaluate(() => globalThis.game.tooltip.element), null, 'all closed');
    for (const [id, , closed] of CASES) {
      assert.equal((await chromiumAxDescribed(page, control(id))).description, closed, id);
    }
  });
});
