/**
 * Issue 2459: the tint popover as the search popover's grid form, in a real browser. The overlay
 * host serves the real components through Vite under the real sheet, in the manager's main column:
 * `color` is the New-biome swatch trigger in its form's grid cell, and `tint-anchored` the palette
 * opened from a caller's anchor, as the biome edit palette opens it. The pointer resolves to the
 * control it is over, and the anchor's right-click, ContextMenu key and Shift+F10 open one panel.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@overlay-host-styles/' });

const PANEL = '.fabricate-color-picker-popover.fabricate-picker-popover';
const TRIGGER = '.manager-color-picker-trigger';
const ANCHOR = '.tint-anchored-anchor';

// The New-biome swatch's 38px cell in the add form, which the primitive's `div.fabricate-picker`
// wrapper must leave unchanged.
const TRIGGER_AT_REST = { width: 38, height: 38 };

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

async function openHost(query) {
  const page = await fixtureServer.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    fixtureServer.url(`/tests/fixtures/overlay-host/index.html?host=manager&${query}`),
    {
      waitUntil: 'load',
    }
  );
  await page.waitForFunction(() => globalThis.__overlayHostFixtureReady === true);
  return page;
}

async function settled(page) {
  await page.waitForSelector(PANEL);
  await frames(page);
  await frames(page);
}

/** The panel's border box, the tile boxes, and the hex field, query and action boxes. */
const geometry = (panelSelector) => {
  const box = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  };
  const panel = globalThis.document.querySelector(panelSelector);
  return {
    panel: box(panel),
    tiles: [...panel.querySelectorAll('[role="option"]')].map(box),
    hex: box(panel.querySelector('[data-manager-custom-color]')),
    query: box(panel.querySelector('input[role="combobox"]')),
    action: box(panel.querySelector('.fabricate-picker-footer-action')),
  };
};

/** What the pointer resolves to at a point: a tile's index, or the named part it is over. */
const hitAt = ([x, y]) => {
  const hit = globalThis.document.elementFromPoint(x, y);
  const tile = hit?.closest('[role="option"]');
  if (tile) return [...tile.parentElement.querySelectorAll('[role="option"]')].indexOf(tile);
  if (hit?.matches('[role="listbox"]')) return 'list';
  if (hit?.closest('[data-manager-custom-color]')) return 'hex';
  if (hit?.closest('input[role="combobox"]')) return 'query';
  if (hit?.closest('.fabricate-picker-footer-action')) return 'action';
  return hit?.className ?? null;
};

/** The New-biome swatch opened below a spacer of `height` px in the manager host. */
async function openSpacedTrigger(height) {
  const page = await openHost('component=color&wrap=biome-add');
  await page.evaluate((spacer) => {
    globalThis.document.querySelector('.fixture-spacer').style.height = `${spacer}px`;
  }, height);
  await page.click(TRIGGER);
  await settled(page);
  return page;
}

/** The swatch's top, the panel's bottom, and the list's heights, padding and row pitch. */
const listFit = ({ panel, trigger }) => {
  const popover = globalThis.document.querySelector(panel);
  const list = popover.querySelector('[role="listbox"]');
  const styles = getComputedStyle(list);
  const rowGap = Number.parseFloat(styles.rowGap) || 0;
  return {
    paddingY: Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom),
    triggerTop: globalThis.document.querySelector(trigger).getBoundingClientRect().top,
    panelBottom: popover.getBoundingClientRect().bottom,
    clientHeight: list.clientHeight,
    scrollHeight: list.scrollHeight,
    rowGap,
    rowPitch: list.querySelector('[role="option"]').getBoundingClientRect().height + rowGap,
  };
};

const centre = (rect) => [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];

/** The element focus is on: the query, the anchor, or its classes. */
const focused = (page) =>
  page.evaluate(() => {
    const active = globalThis.document.activeElement;
    if (!active || active === globalThis.document.body) return 'body';
    if (active.matches('.fabricate-picker-popover input[role="combobox"]')) return 'query';
    if (active.matches('.tint-anchored-anchor')) return 'anchor';
    return `.${[...active.classList].join('.')}`;
  });

describe('2459 TintPicker — the swatch trigger and its panel, rendered', () => {
  it('keeps the New-biome trigger box at rest', async () => {
    const page = await openHost('component=color&wrap=biome-add');
    try {
      const rest = await page.evaluate((selector) => {
        const rect = globalThis.document.querySelector(selector).getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }, TRIGGER);
      assert.deepEqual(rest, TRIGGER_AT_REST, 'the swatch keeps its 38px cell');
    } finally {
      await page.close();
    }
  });

  it('opens a 240px panel whose tiles, hex and query each resolve to themselves', async () => {
    const page = await openHost('component=color&wrap=biome-add');
    try {
      await page.click(TRIGGER);
      await settled(page);
      const placed = await page.evaluate(geometry, PANEL);

      assert.equal(placed.panel.right - placed.panel.left, 240, "the panel's border box is 240px");
      assert.equal(placed.tiles.length, 10, 'ten tiles, four to a row');
      const firstRow = placed.tiles.filter((tile) => tile.top === placed.tiles[0].top);
      assert.equal(
        new Set(firstRow.map((tile) => tile.left)).size,
        4,
        'the first row holds four tiles side by side'
      );
      for (const [index, tile] of placed.tiles.entries()) {
        assert.equal(await page.evaluate(hitAt, centre(tile)), index, `tile ${index}'s centre`);
      }
      const [first, second] = placed.tiles;
      const gap = [(first.right + second.left) / 2, (first.top + first.bottom) / 2];
      assert.ok(second.left > first.right, 'the tiles stand apart');
      assert.equal(await page.evaluate(hitAt, gap), 'list', 'a gap point is the list');
      assert.equal(await page.evaluate(hitAt, centre(placed.hex)), 'hex', 'the hex field');
      assert.equal(await page.evaluate(hitAt, centre(placed.query)), 'query', 'the query');
    } finally {
      await page.close();
    }
  });

  it('keeps its tiles square and its rows apart in a panel opened short of room', async () => {
    const page = await openHost('component=color&wrap=biome-add');
    try {
      await page.click(TRIGGER);
      await settled(page);
      // The height the layout leaves a panel opened 184px above the window's floor, as the
      // New-biome swatch opens in the 820px Lab window.
      await page.evaluate((panel) => {
        globalThis.document.querySelector(panel).style.maxHeight = '184px';
      }, PANEL);
      await frames(page);
      const { tiles } = await page.evaluate(geometry, PANEL);
      for (const [index, tile] of tiles.entries()) {
        assert.equal(tile.bottom - tile.top, tile.right - tile.left, `tile ${index} is square`);
      }
      assert.ok(tiles[4].top > tiles[0].bottom, 'the second row stands below the first');
    } finally {
      await page.close();
    }
  });

  it('flips above when the swatch sits within the floor of the bottom', async () => {
    // The panel's three tile rows are taller than the host leaves on either side once the 160px
    // floor is reserved, so the swatch has to sit within the floor of the host's bottom for the
    // panel to flip above it; from this spacer up it does, with every row showing.
    const page = await openSpacedTrigger(330);
    try {
      const placed = await page.evaluate(listFit, { panel: PANEL, trigger: TRIGGER });
      assert.ok(placed.panelBottom <= placed.triggerTop, 'the panel draws above the swatch');
      assert.equal(placed.clientHeight, placed.scrollHeight, 'its list shows every row');
    } finally {
      await page.close();
    }
  });

  it('floors its list to whole rows when neither side holds the whole panel', async () => {
    const page = await openSpacedTrigger(200);
    try {
      const placed = await page.evaluate(listFit, { panel: PANEL, trigger: TRIGGER });
      assert.ok(placed.clientHeight < placed.scrollHeight, 'the list is short of its rows');
      const rows = placed.clientHeight - placed.paddingY;
      const remainder = (rows + placed.rowGap) % placed.rowPitch;
      assert.ok(
        Math.min(remainder, placed.rowPitch - remainder) <= 1,
        `the list's ${rows}px inside its ring reach is whole ${placed.rowPitch}px rows`
      );
    } finally {
      await page.close();
    }
  });
});

describe('2459 TintPicker — the anchored palette, rendered', () => {
  it('opens one panel on a real right-click, with the query focused and No colour live', async () => {
    const page = await openHost('component=tint-anchored');
    try {
      await page.click(ANCHOR, { button: 'right' });
      await settled(page);
      assert.equal(await page.locator(PANEL).count(), 1, 'one panel node');
      assert.equal(await focused(page), 'query');

      const placed = await page.evaluate(geometry, PANEL);
      assert.equal(placed.panel.right - placed.panel.left, 240, "the panel's border box is 240px");
      assert.equal(await page.evaluate(hitAt, centre(placed.action)), 'action', 'No colour');
      await page.mouse.click(...centre(placed.action));
      await frames(page);
      assert.equal(await page.locator(PANEL).count(), 0, 'No colour closes the panel');
      assert.deepEqual(
        await page.evaluate(() => globalThis.__tintAnchoredHost.state().unset),
        true,
        'and clears the colour'
      );
    } finally {
      await page.close();
    }
  });

  it('closes on a second real right-click and hands focus back to the anchor', async () => {
    const page = await openHost('component=tint-anchored');
    try {
      await page.click(ANCHOR, { button: 'right' });
      await settled(page);
      await page.click(ANCHOR, { button: 'right' });
      await frames(page);
      assert.equal(await page.locator(PANEL).count(), 0, 'the right-click toggled it shut');
      assert.equal(await focused(page), 'anchor');
    } finally {
      await page.close();
    }
  });

  for (const key of ['ContextMenu', 'Shift+F10']) {
    it(`opens on ${key} and stays open with the query focused`, async () => {
      const page = await openHost('component=tint-anchored');
      try {
        await page.focus(ANCHOR);
        await page.keyboard.press(key);
        await settled(page);
        assert.equal(await page.locator(PANEL).count(), 1, 'one panel node');
        assert.ok(
          await page.evaluate(() => globalThis.__tintAnchoredHost.isOpen()),
          'no trailing contextmenu toggled it shut'
        );
        assert.equal(await focused(page), 'query');
      } finally {
        await page.close();
      }
    });
  }

  it('picks with Enter under the cursor, closes and returns focus to the anchor', async () => {
    const page = await openHost('component=tint-anchored');
    try {
      await page.click(ANCHOR, { button: 'right' });
      await settled(page);
      await page.keyboard.press('Space');
      await frames(page);
      assert.equal(await page.locator(PANEL).count(), 1, 'a Space types and commits nothing');
      for (const key of ['Backspace', 'ArrowDown', 'ArrowRight', 'Enter']) {
        await page.keyboard.press(key);
      }
      await frames(page);
      assert.equal(await page.locator(PANEL).count(), 0, 'Enter picked and closed');
      assert.equal(
        await page.evaluate(() => globalThis.__tintAnchoredHost.state().colorToken),
        'mist'
      );
      assert.equal(await focused(page), 'anchor');
    } finally {
      await page.close();
    }
  });
});
