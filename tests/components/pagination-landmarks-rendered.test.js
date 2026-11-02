/**
 * Issue 2894 — the published `Pagination`'s `landmarks` and `perPageAriaLabel`, read in Chromium's
 * own accessibility tree on the markup the seam draws, under the module sheet: each pager's landmark
 * count, two by default and one under `'nav'`, the nav's name, the root's role once unnamed, and the
 * page-size radiogroup named by the caption or by `perPageAriaLabel`, the caption still drawn.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { publishedAxPage } from '../helpers/publishedAxPage.js';

const PAGER = Object.freeze({
  totalCount: 60,
  pageSize: 25,
  pageSizeOptions: [10, 25, 50],
  ariaLabel: 'Recipe pages',
  navLabel: 'Recipe page navigation',
  previousLabel: 'Previous recipes page',
  nextLabel: 'Next recipes page',
  perPageLabel: 'Per page',
  rangeTemplate: '{first}–{last} of {total} recipes',
  pageTemplate: 'Page {page} of {total}',
  onPageChange() {},
  onPageSizeChange() {},
});

const CASES = Object.freeze([
  ['both', 'Pagination', PAGER],
  ['nav', 'Pagination', { ...PAGER, landmarks: 'nav' }],
  ['named', 'Pagination', { ...PAGER, landmarks: 'nav', perPageAriaLabel: 'Per page, recipes' }],
]);

let page;

before(async () => {
  page = await publishedAxPage({
    tmpPrefix: 'fabricate-pagination-landmarks-rendered-',
    cases: CASES,
  });
});

after(async () => {
  await page?.close();
});

/** The landmarks Chromium exposes inside the case, as `role name`, in tree order. */
async function landmarksOf(id) {
  const snapshot = await page.tab.locator(`[data-case="${id}"]`).ariaSnapshot();
  return snapshot
    .split('\n')
    .map((line) => line.match(/^\s*- (region|navigation) "([^"]*)"/u))
    .filter(Boolean)
    .map(([, role, name]) => `${role} ${name}`);
}

describe('the published Pagination’s landmarks in Chromium', () => {
  it('adds a named region and a named nav by default', async () => {
    assert.deepEqual(await landmarksOf('both'), [
      'region Recipe pages',
      'navigation Recipe page navigation',
    ]);
  });

  it("adds the nav alone under 'nav', its root no landmark", async () => {
    assert.deepEqual(await landmarksOf('nav'), ['navigation Recipe page navigation']);
    const root = await page.axOf('[data-case="nav"] .fabricate-pagination');
    assert.equal(root.name, '', 'the root is unnamed');
    assert.notEqual(root.role, 'region');
  });

  it('names the page-size radiogroup by its caption, or by perPageAriaLabel beside the caption', async () => {
    const group = (id) => page.axOf(`[data-case="${id}"] [data-pagination-size]`);
    assert.deepEqual(await group('nav'), { role: 'radiogroup', name: 'Per page', description: '' });
    assert.deepEqual(await group('named'), {
      role: 'radiogroup',
      name: 'Per page, recipes',
      description: '',
    });
    const caption = page.tab.locator('[data-case="named"] .manager-pagination-size > span[id]');
    assert.equal(await caption.textContent(), 'Per page');
    assert.ok(await caption.isVisible(), 'the caption is still drawn');
  });
});
