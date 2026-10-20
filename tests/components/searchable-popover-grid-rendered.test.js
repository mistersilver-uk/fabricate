/**
 * Issue 2459: the search popover's grid form, as an icon search, under real layout. The panel is
 * mounted from the Primitive Lab row's own props, serialized, and laid out in Chromium under the
 * sheet and its scoped block, standing where the row's anchor places it. The pointer resolves to
 * the tile it is over and never to a neighbour, a corner tile's hover ring has room inside the
 * panel, hover never fills, every column rung draws its count, and a four-column tint-sized panel
 * keeps a 44px tile.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PANEL = 'src/ui/svelte/components/SearchablePopoverPanel.svelte';
const sheet = readStylesheet();
// `Button`, the action's primitive, has no scoped block; the panel's is the only one.
const scopedCss = scopedComponentCss(resolve(repoRoot, PANEL)).css;

/** The Lab row this test lays out, read rather than restated, so the two cannot drift. */
const ROW = JSON.parse(
  readFileSync(resolve(repoRoot, 'tests/view-lab/primitives/catalogue/pickers.json'), 'utf8')
).find((row) => row.path === PANEL && row.fixture === 'SearchPopoverIconGrid');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-searchable-popover-grid-rendered-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: SEARCHABLE_POPOVER_COMPILED_MODULES,
  componentPath: PANEL,
});

let browser;

const noop = () => {};

// The 16px inset `open` restates is the Lab row's anchor geometry; the Lab frame (not this test)
// is the check that `ROW.data.anchorStyle` still places the anchor there.

/** Twelve options, enough for every column rung to wrap onto a second row. */
const MANY = Array.from({ length: 12 }, (_, index) => ({
  id: `glyph-${index}`,
  label: `Glyph ${index}`,
  icon: 'fas fa-circle',
}));

/**
 * The panel mounted with the row's props and `overrides`, laid out in Chromium at `width`, at the
 * row's 16px inset and below its anchor, as `anchoredPopover` would place it.
 */
async function open(overrides = {}, width = ROW.props.maxWidth) {
  const value = overrides.value ?? ROW.data.value;
  const target = await harness.mount({
    ...ROW.props,
    ...overrides,
    popoverLayout: () => null,
    chooseOption: noop,
    optionIsSelected: (option) => option.id === value,
    close: noop,
  });
  const markup = target.innerHTML;
  harness.remount();
  // Tall enough that the panel's 360px cap, not `50vh`, bounds a three-row list.
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8">' +
      `<style>@layer modules { ${sheet} }</style><style>${scopedCss}</style></head>` +
      '<body><div class="fabricate fabricate-manager" data-fabricate-theme="fabricate" ' +
      `style="position:relative;width:400px;height:800px">${markup}</div></body></html>`
  );
  await page.evaluate((px) => {
    const panel = globalThis.document.querySelector('.fabricate-picker-popover');
    panel.setAttribute(
      'style',
      `left: 16px; right: auto; top: 40px; bottom: auto; width: ${px}px; ` +
        `min-width: ${px}px; max-width: ${px}px;`
    );
  }, width);
  return page;
}

/** Every tile's box, and the boxes of the list, the panel, the query field and the action. */
const geometry = () => {
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  };
  const panel = globalThis.document.querySelector('.fabricate-picker-popover');
  return {
    panel: box(panel),
    list: box(panel.querySelector('[role="listbox"]')),
    tiles: [...panel.querySelectorAll('[role="option"]')].map(box),
  };
};

/** What the pointer resolves to at a point: a tile's index, `list`, or the element's own role. */
const hitAt = ([x, y]) => {
  const hit = globalThis.document.elementFromPoint(x, y);
  const tile = hit?.closest('[role="option"]');
  if (tile) return [...tile.parentElement.querySelectorAll('[role="option"]')].indexOf(tile);
  if (hit?.matches('[role="listbox"]')) return 'list';
  if (hit?.closest('input')) return 'query';
  if (hit?.closest('.fabricate-picker-footer-action')) return 'action';
  return hit?.className ?? null;
};

/** The colours the selected ground and the hover ink must resolve to, read from an in-panel probe. */
const probeColours = () => {
  const panel = globalThis.document.querySelector('.fabricate-picker-popover');
  const probe = globalThis.document.createElement('i');
  probe.style.cssText = 'background: var(--fab-surface-active); color: var(--fab-accent)';
  panel.append(probe);
  const style = globalThis.getComputedStyle(probe);
  const colours = { ground: style.backgroundColor, ink: style.color };
  probe.remove();
  return colours;
};

const centre = (rect) => [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];

/** One tile's paint, read in the page. */
const paintOf = (index) => {
  const tile = globalThis.document.querySelectorAll('[role="option"]')[index];
  const style = globalThis.getComputedStyle(tile);
  return {
    hover: tile.matches(':hover'),
    background: style.backgroundColor,
    outline: `${style.outlineStyle} ${style.outlineWidth}`,
    outlineColor: style.outlineColor,
    offset: style.outlineOffset,
  };
};

async function pointAt(page, index) {
  const box = await page.locator('[role="option"]').nth(index).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

describe('2459 the grid form as an icon search, laid out', () => {
  before(async () => {
    assert.ok(ROW, 'the Lab row for the grid form is catalogued');
    await harness.setup();
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    harness.teardown();
  });

  it('resolves each tile centre to its own tile, a gap to the list, and the controls to themselves', async () => {
    const page = await open();
    try {
      const { tiles } = await page.evaluate(geometry);
      assert.equal(tiles.length, 6, 'the row draws six tiles');
      for (const [index, tile] of tiles.entries()) {
        assert.equal(await page.evaluate(hitAt, centre(tile)), index, `tile ${index}'s centre`);
      }
      const gap = [(tiles[0].right + tiles[1].left) / 2, centre(tiles[0])[1]];
      assert.ok(tiles[1].left - tiles[0].right >= 5, 'the tiles stand 6px apart');
      assert.equal(await page.evaluate(hitAt, gap), 'list', 'the gap belongs to no tile');
      for (const [selector, name] of [
        ['.fabricate-picker-popover input', 'query'],
        ['.fabricate-picker-footer-action', 'action'],
      ]) {
        const box = await page.locator(selector).boundingBox();
        const point = [box.x + box.width / 2, box.y + box.height / 2];
        assert.equal(await page.evaluate(hitAt, point), name, `the ${name} resolves to itself`);
      }
    } finally {
      await page.close();
    }
  });

  it('leaves every corner tile its 3px hover ring inside the list and the panel', async () => {
    const page = await open({ gridColumns: 4, filteredOptions: MANY, renderedOptions: MANY });
    try {
      const { panel, list, tiles } = await page.evaluate(geometry);
      const corners = [0, 3, 8, 11].map((index) => [index, tiles[index]]);
      for (const [index, tile] of corners) {
        for (const [name, box, inset] of [
          ['list', list, 0],
          ['panel', panel, 1],
        ]) {
          assert.ok(
            tile.left - 3 >= box.left + inset - 0.01 &&
              tile.top - 3 >= box.top + inset - 0.01 &&
              tile.right + 3 <= box.right - inset + 0.01 &&
              tile.bottom + 3 <= box.bottom - inset + 0.01,
            `corner tile ${index}'s ring is clipped by the ${name}'s padding box`
          );
        }
      }
    } finally {
      await page.close();
    }
  });

  it('hovers with the outset outline alone, never a fill, and keeps the selected ground and the cursor', async () => {
    const page = await open({ activeIndex: 1 });
    try {
      await page.mouse.move(399, 399);
      const rest = await page.evaluate(paintOf, 2);
      const selectedRest = await page.evaluate(paintOf, 0);
      await pointAt(page, 2);
      const hovered = await page.evaluate(paintOf, 2);
      assert.ok(hovered.hover, 'the pointer is over the rest tile');
      assert.equal(hovered.background, rest.background, 'hover changed a rest tile’s ground');
      assert.equal(hovered.outline, 'solid 2px');
      assert.equal(hovered.offset, '1px', 'hover is the outset ring');

      await pointAt(page, 0);
      const selected = await page.evaluate(paintOf, 0);
      assert.ok(selected.hover);
      assert.equal(
        selected.background,
        selectedRest.background,
        'hover changed the selected ground'
      );
      assert.notEqual(selected.background, rest.background, 'the selected tile has its own ground');
      const { ground, ink } = await page.evaluate(probeColours);
      assert.equal(selectedRest.background, ground, 'the selected ground is --fab-surface-active');
      assert.equal(hovered.outlineColor, ink, 'the hover ring is drawn in --fab-accent');

      await pointAt(page, 1);
      const cursor = await page.evaluate(paintOf, 1);
      assert.ok(cursor.hover);
      assert.deepEqual([cursor.outline, cursor.offset], ['solid 2px', '-2px'], 'the cursor keeps');
    } finally {
      await page.close();
    }
  });

  for (const columns of [2, 3, 4, 5, 6]) {
    it(`draws ${columns} tiles to the first row and wraps the next`, async () => {
      const page = await open({
        gridColumns: columns,
        filteredOptions: MANY,
        renderedOptions: MANY,
      });
      try {
        const { tiles } = await page.evaluate(geometry);
        const firstRow = tiles.filter((tile) => Math.abs(tile.top - tiles[0].top) < 1);
        assert.equal(new Set(firstRow.map((tile) => Math.round(tile.left))).size, columns);
        assert.ok(tiles[columns].top > tiles[0].top + 1, `tile ${columns + 1} sits lower`);
      } finally {
        await page.close();
      }
    });
  }

  it('keeps a 44px tile at four columns in a 220px panel with the hint row and an action', async () => {
    const page = await open(
      { gridColumns: 4, footerAction: { label: 'No colour' }, keyHints: true },
      220
    );
    try {
      const { tiles } = await page.evaluate(geometry);
      for (const [index, tile] of tiles.entries()) {
        assert.ok(tile.right - tile.left >= 44, `tile ${index} is under 44px wide`);
        assert.ok(tile.bottom - tile.top >= 44, `tile ${index} is under 44px tall`);
      }
    } finally {
      await page.close();
    }
  });

  it('keeps a band-width panel the same width with the hint row and a long action as without', async () => {
    const widthOf = async (overrides) => {
      const page = await open(overrides, 280);
      try {
        await page.evaluate(() => {
          const panel = globalThis.document.querySelector('.fabricate-picker-popover');
          panel.setAttribute(
            'style',
            'left: 16px; right: auto; top: 40px; bottom: auto; min-width: 240px; max-width: 340px;'
          );
        });
        return await page.evaluate(
          () => globalThis.document.querySelector('.fabricate-picker-popover').offsetWidth
        );
      } finally {
        await page.close();
      }
    };
    const action = { label: 'Remove the colour and every override it has set on this item' };
    const plain = await widthOf({ footerAction: action, keyHints: false });
    const hinted = await widthOf({ footerAction: action, keyHints: true });
    assert.equal(hinted, plain, 'the hint row and a long action widened the panel');
  });
});
