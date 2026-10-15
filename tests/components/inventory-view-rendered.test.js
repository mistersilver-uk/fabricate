/**
 * The inventory view in Chromium: the detail column is a full rail section flush to the content
 * area's edges, and the grid's pager is the left column's footer, so its outer box meets the nav
 * rail, the window's bottom edge and the detail rail's border with no gutter. Stacked, the pager
 * spans the window and the detail rail stands directly beneath it, and the two panes split the
 * window's height and scroll on their own, so both the pager and the bulk footer stay in view.
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

/** Open the bulk panel on `rows` queued components and evaluate `measure` in the page. */
async function onBulkPanel(rows, measure) {
  const page = await fixtureServer.newPage({ viewport: { width: 1240, height: 900 } });
  try {
    await page.goto(fixtureServer.url(`${VIEW.url}?width=1200&bulk=${rows}`));
    await page.waitForSelector(
      'html[data-inventory-view-ready="true"] [data-inventory-bulk-footer]'
    );
    // A ResizeObserver publishes the footer's height before the next paint; wait for two.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    );
    return await page.evaluate(measure);
  } finally {
    await page.close();
  }
}

/** The footer and its first and last actions against the column's scroller, at three offsets. */
function footerSamples() {
  // The scroller is the shell's root inside the column section; both carry the hook.
  const column = document.querySelector('.inventory-detail[data-inventory-detail]');
  const footer = column.querySelector('[data-inventory-bulk-footer]');
  const actions = [...footer.querySelectorAll('button')];
  const style = getComputedStyle(column);
  const edges = (node) => {
    const { left, right, bottom } = node.getBoundingClientRect();
    return { left, right, bottom };
  };
  const sampleAt = (scrollTop) => {
    column.scrollTop = scrollTop;
    const box = column.getBoundingClientRect();
    const left = box.left + column.clientLeft;
    return {
      scrollTop: column.scrollTop,
      column: { left, right: box.right, bottom: box.bottom },
      content: {
        left: left + parseFloat(style.paddingLeft),
        right: left + column.clientWidth - parseFloat(style.paddingRight),
      },
      footer: edges(footer),
      actions: [edges(actions[0]), edges(actions.at(-1))],
    };
  };
  const overflow = column.scrollHeight - column.clientHeight;
  return {
    overflow,
    actionCount: actions.length,
    samples: [sampleAt(0), sampleAt(Math.floor(overflow / 2)), sampleAt(column.scrollHeight)],
  };
}

/** Focus every control above the footer from the top, then the last of them from scroll top. */
function focusWalk() {
  const column = document.querySelector('.inventory-detail[data-inventory-detail]');
  const footer = column.querySelector('[data-inventory-bulk-footer]');
  const controls = [...column.querySelectorAll('button')].filter((node) => !footer.contains(node));
  const under = (control) => {
    const bottom = control.getBoundingClientRect().bottom;
    const top = footer.getBoundingClientRect().top;
    return bottom > top + 1
      ? `${control.getAttribute('aria-label') ?? 'a control'} ends ${bottom}px, footer top ${top}px`
      : '';
  };
  column.scrollTop = 0;
  let scrolls = 0;
  const obscured = [];
  for (const control of controls) {
    const before = column.scrollTop;
    control.focus();
    if (column.scrollTop !== before) scrolls += 1;
    if (under(control)) obscured.push(under(control));
  }
  // Blurred first: focusing the element that already has focus does not scroll.
  document.activeElement.blur();
  column.scrollTop = 0;
  controls.at(-1).focus();
  return { count: controls.length, scrolls, obscured, last: under(controls.at(-1)) };
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
      const { overflow, actionCount, samples } = await onBulkPanel(rows, footerSamples);
      assert.ok(
        rows === 1 ? overflow === 0 : overflow >= 48,
        `NON-VACUITY: ${label} overflows the column by ${overflow}px`
      );
      assert.equal(actionCount, 2, 'NON-VACUITY: the footer carries Destroy and Salvage');
      for (const { scrollTop, column, content, footer, actions } of samples) {
        within(
          footer.bottom,
          column.bottom,
          `its bottom edge on the column's foot at ${scrollTop}px`
        );
        within(footer.left, column.left, `its left edge on the column's at ${scrollTop}px`);
        within(footer.right, column.right, `its right edge on the column's at ${scrollTop}px`);
        // The footer's inline padding pays its bleed back, as the shell's dock does for Apply.
        for (const [index, action] of actions.entries()) {
          const name = index === 0 ? 'first' : 'last';
          within(
            action.left,
            content.left,
            `its ${name} action on the content's left at ${scrollTop}px`
          );
          within(
            action.right,
            content.right,
            `its ${name} action on the content's right at ${scrollTop}px`
          );
        }
      }
    });
  }

  it('stops a focus scroll above the footer on a 25-row queue (WCAG 2.4.11)', async () => {
    const walk = await onBulkPanel(25, focusWalk);
    assert.ok(
      walk.count >= 26 && walk.scrolls > 0,
      `NON-VACUITY: ${walk.count} controls, ${walk.scrolls} focus scrolls`
    );
    assert.deepEqual(walk.obscured, [], 'a focused control sat under the footer');
    assert.equal(
      walk.last,
      '',
      'the last control above the footer, focused from scroll top, sat under it'
    );
  });
});

/** The stacked panes in a host the 1024px window's content area, `height` tall, four queued. */
async function stackedPanes(height) {
  const page = await fixtureServer.newPage({ viewport: { width: 1100, height: 900 } });
  try {
    await page.goto(fixtureServer.url(`${VIEW.url}?width=1010&height=${height}&bulk=4`));
    await page.waitForSelector(
      'html[data-inventory-view-ready="true"] [data-inventory-bulk-footer]'
    );
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    );
    return await page.evaluate(() => {
      const box = (node) => {
        const { left, top, right, bottom } = node.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const cards = document.querySelector('.inventory-grid');
      const detail = document.querySelector('.inventory-detail[data-inventory-detail]');
      const footerAt = (scrollTop) => {
        detail.scrollTop = scrollTop;
        return { scrollTop: detail.scrollTop, detail: box(detail), footer: box(footer) };
      };
      const footer = detail.querySelector('[data-inventory-bulk-footer]');
      return {
        host: box(document.querySelector('[data-host]')),
        browse: box(document.querySelector('.inventory-view-column-left')),
        pager: box(document.querySelector('.inventory-grid-pagination')),
        grid: { overflow: cards.scrollHeight - cards.clientHeight, height: cards.clientHeight },
        cardHeight: document.querySelector('[data-inventory-card]').getBoundingClientRect().height,
        detailOverflow: detail.scrollHeight - detail.clientHeight,
        samples: [footerAt(0), footerAt(detail.scrollHeight)],
      };
    });
  } finally {
    await page.close();
  }
}

// The 1024px window's content area at 860px and 640px tall, less the window header and actor bar.
describe('inventory view, rendered: stacked, each pane keeps its own footer', () => {
  it('keeps the pager and the bulk footer in view at the 1024x860 window', async () => {
    const { host, browse, pager, grid, detailOverflow, samples } = await stackedPanes(754);
    assert.ok(grid.overflow > 0, `NON-VACUITY: the grid overflows by ${grid.overflow}px`);
    assert.ok(detailOverflow > 0, `NON-VACUITY: the detail overflows by ${detailOverflow}px`);
    assert.ok(pager.bottom <= host.bottom + 0.5, `the pager ends at ${pager.bottom}px`);
    near(pager.left, host.left, 'the pager left edge against the nav rail');
    near(pager.right, host.right, 'the pager right edge against the window');
    near(pager.bottom, browse.bottom, "the pager bottom edge on the browse pane's");
    for (const { scrollTop, detail, footer } of samples) {
      assert.ok(footer.bottom <= host.bottom + 0.5, `the footer ends at ${footer.bottom}px`);
      within(
        footer.bottom,
        detail.bottom,
        `the footer on the detail pane's foot at ${scrollTop}px`
      );
    }
    assert.ok(samples[1].scrollTop > 0, 'NON-VACUITY: the detail pane scrolled');
  });

  it('keeps a card row in the grid and the footer at its foot at the 1024x640 window', async () => {
    const { grid, cardHeight, detailOverflow, samples } = await stackedPanes(534);
    assert.ok(grid.overflow > 0, `the grid scrolls on its own, overflowing by ${grid.overflow}px`);
    assert.ok(
      detailOverflow > 0,
      `the detail scrolls on its own, overflowing by ${detailOverflow}px`
    );
    assert.ok(
      grid.height >= cardHeight,
      `the grid scrolls in ${grid.height}px, under one ${cardHeight}px card row`
    );
    for (const { scrollTop, detail, footer } of samples) {
      within(
        footer.bottom,
        detail.bottom,
        `the footer on the detail pane's foot at ${scrollTop}px`
      );
    }
  });
});
