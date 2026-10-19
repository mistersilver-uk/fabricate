/**
 * `SearchablePopover` opened from a caller's anchor (issue 2459), in a real browser. The fixture
 * `tests/fixtures/overlay-host/AnchoredPopoverHost.svelte` is the real primitive compiled by Vite
 * under the real sheet: the anchor's own right-click, ContextMenu key and Shift+F10 set the bound
 * `open`, so the press that opens the panel is also a `mousedown` the outside-click dismissal sees.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@overlay-host-styles/' });

const PANEL = '.fabricate-picker-popover';
const FIRST = '.anchored-host-first';
const SECOND = '.anchored-host-second';

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

const frames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );

async function openHost(form = 'element') {
  const page = await fixtureServer.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    fixtureServer.url(
      `/tests/fixtures/overlay-host/index.html?host=manager&component=anchored-popover&form=${form}`
    ),
    { waitUntil: 'load' }
  );
  await page.waitForFunction(() => globalThis.__overlayHostFixtureReady === true);
  return page;
}

async function rightClickOpen(page, selector = FIRST) {
  await page.click(selector, { button: 'right' });
  await page.waitForSelector(PANEL);
  await frames(page);
}

/** The element focus is on, as a selector-ish description the assertions can compare. */
const focused = (page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return 'body';
    if (active.matches('[data-anchored-host]')) return 'host';
    if (active.closest('.fabricate-picker-popover input')) return 'query';
    return `.${[...active.classList].join('.')}`;
  });

/** Mark the open panel node, so a later read can tell the same panel from a reopened one. */
const pinPanel = (page) =>
  page.evaluate((selector) => {
    document.querySelector(selector).dataset.pinned = 'true';
  }, PANEL);

const samePanel = (page) =>
  page.evaluate((selector) => {
    const panels = document.querySelectorAll(selector);
    return panels.length === 1 && panels[0].dataset.pinned === 'true';
  }, PANEL);

async function dispatchOn(page, selector, type) {
  await page.evaluate(
    ({ selector: target, type: kind }) => {
      const node = document.querySelector(target);
      const init = { bubbles: true, cancelable: true, button: 2 };
      node.dispatchEvent(new MouseEvent(kind, init));
    },
    { selector, type }
  );
  await frames(page);
}

describe('2459 SearchablePopover — the anchored open', () => {
  it('renders no trigger, portals the panel to the root and focuses its query', async () => {
    const page = await openHost();
    try {
      const closed = await page.evaluate(() => {
        const root = document.querySelector('.fabricate-picker');
        return {
          buttons: root.querySelectorAll('button').length,
          display: getComputedStyle(root).display,
        };
      });
      assert.deepEqual(closed, { buttons: 0, display: 'contents' }, 'the picker root is inert');

      await rightClickOpen(page);
      const placed = await page.evaluate((selector) => {
        const panel = document.querySelector(selector);
        return {
          outsidePicker: !panel.closest('.fabricate-picker'),
          root: panel.parentElement.classList.contains('fabricate-manager'),
        };
      }, PANEL);
      assert.deepEqual(placed, { outsidePicker: true, root: true });
      assert.equal(await focused(page), 'query');

      await pinPanel(page);
      await page.click(FIRST, { button: 'right' });
      await frames(page);
      assert.ok(await samePanel(page), 'a second real right-click keeps the one panel');
    } finally {
      await page.close();
    }
  });

  it('keeps the panel on a mousedown alone on the anchor, and on the contextmenu after it', async () => {
    const page = await openHost();
    try {
      await rightClickOpen(page);
      await pinPanel(page);
      await dispatchOn(page, FIRST, 'mousedown');
      assert.ok(await samePanel(page), 'the anchor counts inside the outside-click dismissal');
      await dispatchOn(page, FIRST, 'contextmenu');
      assert.ok(await samePanel(page), 'and the reopen it is followed by changes nothing');
    } finally {
      await page.close();
    }
  });

  for (const key of ['ContextMenu', 'Shift+F10']) {
    it(`opens on ${key} and stays open with the query focused`, async () => {
      const page = await openHost();
      try {
        await page.focus(FIRST);
        await page.keyboard.press(key);
        await page.waitForSelector(PANEL);
        await frames(page);
        await frames(page);
        assert.equal(await page.locator(PANEL).count(), 1);
        assert.equal(await focused(page), 'query');
      } finally {
        await page.close();
      }
    });
  }

  for (const form of ['element', 'resolver']) {
    it(`re-anchors to a swapped ${form} anchor and counts it inside`, async () => {
      const page = await openHost(form);
      try {
        await rightClickOpen(page);
        await page.evaluate(() => globalThis.__anchoredHost.swap());
        await frames(page);
        const geometry = await page.evaluate(
          ({ panel, second }) => ({
            panel: document.querySelector(panel).getBoundingClientRect().left,
            anchor: document.querySelector(second).getBoundingClientRect().left,
          }),
          { panel: PANEL, second: SECOND }
        );
        assert.ok(
          Math.abs(geometry.panel - geometry.anchor) < 1.5,
          `the panel's left edge meets the new anchor's (${geometry.panel} vs ${geometry.anchor})`
        );
        await pinPanel(page);
        await dispatchOn(page, SECOND, 'mousedown');
        assert.ok(await samePanel(page), 'a press on the new anchor does not dismiss');
        const aria = await page.evaluate(
          (second) =>
            ['aria-haspopup', 'aria-expanded'].filter((name) =>
              document.querySelector(second).hasAttribute(name)
            ),
          SECOND
        );
        assert.deepEqual(aria, [], 'the primitive writes no ARIA onto the caller`s anchor');
        await page.keyboard.press('Escape');
        await frames(page);
        assert.equal(
          await focused(page),
          '.anchored-host-second',
          'close focuses the current anchor'
        );
      } finally {
        await page.close();
      }
    });
  }

  for (const [form, remove] of [
    ['element', (page) => page.evaluate((first) => document.querySelector(first).remove(), FIRST)],
    ['resolver', (page) => page.evaluate(() => globalThis.__anchoredHost.unmount())],
  ]) {
    it(`closes when the ${form} anchor is removed, focusing the nearest focusable container`, async () => {
      const page = await openHost(form);
      try {
        await rightClickOpen(page);
        await remove(page);
        await frames(page);
        assert.equal(await page.locator(PANEL).count(), 0, 'the panel closed with its anchor');
        assert.equal(await page.evaluate(() => globalThis.__anchoredHost.isOpen()), false);
        assert.equal(
          await focused(page),
          'host',
          'focus lands on the nearest [tabindex] container'
        );
      } finally {
        await page.close();
      }
    });
  }

  it('stays open when the resolver answers a new anchor as the old one unmounts', async () => {
    const page = await openHost('resolver');
    try {
      await rightClickOpen(page);
      await pinPanel(page);
      await page.evaluate(() => globalThis.__anchoredHost.swapAndUnmount());
      await frames(page);
      assert.ok(await samePanel(page), 'an answerable anchor keeps the one panel open');
      assert.equal(await page.evaluate(() => globalThis.__anchoredHost.isOpen()), true);
      const geometry = await page.evaluate(
        ({ panel, second }) => ({
          panel: document.querySelector(panel).getBoundingClientRect().left,
          anchor: document.querySelector(second).getBoundingClientRect().left,
        }),
        { panel: PANEL, second: SECOND }
      );
      assert.ok(
        Math.abs(geometry.panel - geometry.anchor) < 1.5,
        `the panel stands against the new anchor (${geometry.panel} vs ${geometry.anchor})`
      );
    } finally {
      await page.close();
    }
  });

  it('returns focus to the anchor on Escape and on a pick', async () => {
    const page = await openHost();
    try {
      await rightClickOpen(page);
      await page.keyboard.press('Escape');
      await frames(page);
      assert.equal(await page.locator(PANEL).count(), 0);
      assert.equal(await focused(page), '.anchored-host-first');

      await rightClickOpen(page);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await frames(page);
      assert.equal(await page.evaluate(() => globalThis.__anchoredHost.picked()), 'hammer');
      assert.equal(await focused(page), '.anchored-host-first');
    } finally {
      await page.close();
    }
  });

  it('does not move focus when the caller shuts the panel', async () => {
    const page = await openHost();
    try {
      await rightClickOpen(page);
      await page.focus(SECOND);
      await page.evaluate(() => globalThis.__anchoredHost.shut());
      await frames(page);
      assert.equal(await page.locator(PANEL).count(), 0);
      assert.equal(await focused(page), '.anchored-host-second');
    } finally {
      await page.close();
    }
  });
});
