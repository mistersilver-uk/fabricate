/**
 * The journal view in Chromium: each list's compact pager is its section's footer, so its rule
 * meets the browse column's edges, its content keeps the section's inline inset, and the next
 * section's top rule (the Finished section's, then the detail pane's stacked, or the window's
 * bottom edge side by side) sits directly beneath it; side by side, four rows of each list fit.
 * The status filter keeps inside the column's inset at both sizes.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { near } from '../helpers/railFooterAssertions.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@journal-view-styles/' });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/** The view at a host `width` by `height`, with the fixture's `query` knobs, section by section. */
async function journalBoxes(width, height, query = '') {
  const page = await fixtureServer.newPage({ viewport: { width: width + 40, height: 900 } });
  try {
    await page.goto(
      fixtureServer.url(
        `/tests/fixtures/journal-view/index.html?width=${width}&height=${height}${query}`
      )
    );
    await page.waitForSelector('html[data-journal-view-ready="true"] [data-journal-list] footer');
    return await page.evaluate(() => {
      const box = (node) => {
        const { left, top, right, bottom } = node.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const section = (name) => {
        const root = document.querySelector(`[data-journal-list="${name}"]`);
        const pager = root.querySelector('.fabricate-pagination');
        const body = root.querySelector('[data-journal-list-scroll]');
        return {
          box: box(root),
          title: box(root.querySelector('.journal-list-title')),
          pager: box(pager),
          pagerRule: getComputedStyle(pager).borderTopWidth,
          summary: box(pager.querySelector('[data-pagination-summary]')),
          lastControl: box([...pager.querySelectorAll('button, [data-pagination-size]')].at(-1)),
          body: box(body),
          rows: [...body.querySelectorAll('[role="listitem"]')].map(box),
        };
      };
      const detail = document.querySelector('.journal-detail-pane');
      const browse = document.querySelector('.journal-browse');
      return {
        host: box(document.querySelector('[data-host]')),
        browse: { ...box(browse), rule: parseFloat(getComputedStyle(browse).borderRightWidth) },
        filter: box(document.querySelector('[data-journal-status-filter]')),
        detail: { ...box(detail), rule: getComputedStyle(detail).borderTopWidth },
        active: section('active'),
        finished: section('finished'),
      };
    });
  } finally {
    await page.close();
  }
}

/** An ArrowRight on the checked Active page-size radio, and what the fixture journal recorded. */
async function arrowCommit() {
  const page = await fixtureServer.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(
      fixtureServer.url('/tests/fixtures/journal-view/index.html?width=1240&height=774')
    );
    const checked = '[data-journal-list="active"] [data-pagination-size] input:checked';
    await page.waitForSelector(checked);
    await page.focus(checked);
    await page.keyboard.press('ArrowRight');
    return await page.evaluate(() => ({
      sizes: document.documentElement.dataset.activePageSizes?.split(',').map(Number),
      focused: document.activeElement.value,
      isRadio: document.activeElement.type === 'radio',
    }));
  } finally {
    await page.close();
  }
}

/** Each pager's rule spans its section, and its content sits at the header's inset. */
function assertPagerIsSectionFooter(name, { box, title, pager, pagerRule, summary, lastControl }) {
  assert.equal(pagerRule, '1px', `the ${name} pager draws its own top rule`);
  near(pager.left, box.left, `the ${name} pager's left edge on its section's`);
  near(pager.right, box.right, `the ${name} pager's right edge on its section's`);
  near(summary.left, title.left, `the ${name} pager's range at the header's inset`);
  near(box.right - lastControl.right, title.left - box.left, `the ${name} pager's right inset`);
}

// The 1240x880 window and the stacked 1024x880 window's content areas, with each section inset.
const LAYOUTS = [
  ['side by side at 1240x880', 1240, false, 8],
  ['stacked at 1024x880', 1010, true, 12],
];
// Full pages of both lists, Active's one-row last page, and both lists empty, by Active's rows.
const QUERIES = [
  ['six runs each', '', 4],
  ["five active runs' last page", '&active=5&activePage=1', 1],
  ['no runs', '&active=0&finished=0', 0],
];

for (const [label, width, stacked, expectedInset] of LAYOUTS) {
  for (const [runs, query, activeRows] of QUERIES) {
    describe(`journal view, rendered ${label} with ${runs}: each pager is its section's footer`, () => {
      let boxes;
      before(async () => {
        boxes = await journalBoxes(width, 774, query);
      });

      it('spans each section with its content at the section inset', () => {
        const inset = boxes.active.title.left - boxes.active.box.left;
        assert.ok(inset > 0, `NON-VACUITY: the header sits ${inset}px inside its section`);
        assert.equal(boxes.active.rows.length, activeRows, 'NON-VACUITY: the Active page rows');
        assertPagerIsSectionFooter('Active', boxes.active);
        assertPagerIsSectionFooter('Finished', boxes.finished);
      });

      it('puts the next rule directly beneath each pager', () => {
        const { host, detail, active, finished } = boxes;
        near(finished.box.top, active.pager.bottom, "the Finished section's top rule");
        if (stacked) {
          near(detail.top, finished.pager.bottom, "the detail pane's top rule");
          assert.equal(detail.rule, '1px', 'the detail pane draws that top rule');
        } else {
          near(finished.pager.bottom, host.bottom, "the window's bottom edge");
        }
      });
    });
  }

  describe(`journal view, rendered ${label}: the browse column's edges and inset`, () => {
    let boxes;
    before(async () => {
      boxes = await journalBoxes(width, 774);
    });

    it(`insets each section by ${expectedInset}px`, () => {
      for (const name of ['active', 'finished']) {
        const { box, title } = boxes[name];
        near(title.left - box.left, expectedInset, `the ${name} header's inset`);
      }
    });

    it("keeps the status filter inside the column's inner edge", () => {
      const { box } = boxes.active;
      const inner = box.right - expectedInset;
      assert.ok(
        boxes.filter.right <= inner + 0.5,
        `the status filter ends at ${boxes.filter.right}px, past the column's inner edge ${inner}px`
      );
    });

    if (!stacked) {
      it("meets the browse column's edges with each pager, inside its border", () => {
        const { browse } = boxes;
        assert.equal(browse.rule, 1, "NON-VACUITY: the browse column's 1px border-right");
        for (const name of ['active', 'finished']) {
          const { pager } = boxes[name];
          near(pager.left, browse.left, `the ${name} pager's left edge on the column's`);
          near(pager.right, browse.right - browse.rule, `the ${name} pager's right edge`);
        }
      });

      it('keeps four rows of each list in view', () => {
        for (const [name, list] of Object.entries({
          active: boxes.active,
          finished: boxes.finished,
        })) {
          assert.equal(list.rows.length, 4, `NON-VACUITY: the ${name} page draws four rows`);
          for (const [index, row] of list.rows.entries()) {
            assert.ok(
              row.top >= list.body.top - 0.5 && row.bottom <= list.body.bottom + 0.5,
              `${name} row ${index + 1} spans ${row.top}-${row.bottom}px, outside its list ` +
                `${list.body.top}-${list.body.bottom}px`
            );
          }
        }
      });
    }
  });
}

describe('journal view, rendered: the page-size radios commit from the keyboard', () => {
  it('commits the next size on ArrowRight and keeps focus on that radio', async () => {
    const { sizes, focused, isRadio } = await arrowCommit();
    assert.deepEqual(sizes, [6], 'one commit, to the next offered size');
    assert.ok(isRadio, 'NON-VACUITY: focus rests on a radio');
    assert.equal(focused, '6', 'focus follows to the 6 radio');
  });
});
