/**
 * The journal view in Chromium: each list's compact pager is its section's footer, so its rule
 * meets the browse column's edges, its content keeps the section's inline inset, and the next
 * section's top rule (the Finished section's, then the detail pane's stacked, or the window's
 * bottom edge side by side) sits directly beneath it; side by side, four rows of each list fit.
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

/** The view at a host `width` by `height`, measured section by section. */
async function journalBoxes(width, height) {
  const page = await fixtureServer.newPage({ viewport: { width: width + 40, height: 900 } });
  try {
    await page.goto(
      fixtureServer.url(`/tests/fixtures/journal-view/index.html?width=${width}&height=${height}`)
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
          lastControl: box([...pager.querySelectorAll('button')].at(-1)),
          body: box(body),
          rows: [...body.querySelectorAll('[role="listitem"]')].map(box),
        };
      };
      const detail = document.querySelector('.journal-detail-pane');
      return {
        host: box(document.querySelector('[data-host]')),
        detail: { ...box(detail), rule: getComputedStyle(detail).borderTopWidth },
        active: section('active'),
        finished: section('finished'),
      };
    });
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

// The 1240x880 window and the stacked 1024x880 window's content areas.
for (const [label, width, stacked] of [
  ['side by side at 1240x880', 1240, false],
  ['stacked at 1024x880', 1010, true],
]) {
  describe(`journal view, rendered ${label}: each pager is its section's footer`, () => {
    let boxes;
    before(async () => {
      boxes = await journalBoxes(width, 774);
    });

    it('spans each section with its content at the section inset', () => {
      const inset = boxes.active.title.left - boxes.active.box.left;
      assert.ok(inset > 0, `NON-VACUITY: the header sits ${inset}px inside its section`);
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

    if (!stacked) {
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
