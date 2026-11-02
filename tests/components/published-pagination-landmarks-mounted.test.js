/**
 * The published `Pagination`'s `landmarks` and `perPageAriaLabel` (issue 2894) on Fabricate's real
 * Svelte runtime, under a Fabricate window root: `'nav'` leaves the root unnamed, so the nav is the
 * pager's one landmark, every other value draws both, and `perPageAriaLabel` names the page-size
 * radiogroup in place of the caption it must contain (M22), the caption still drawn.
 * Limit: happy-dom computes no role or name, so
 * `tests/components/pagination-landmarks-rendered.test.js` counts the landmarks in Chromium.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const GROUP_NAME = 'Per page, recipes';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-pagination-landmarks-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let escaped;
let targets;
let stopRecording;

const ui = () => shippedSeam({ ...seamParts, report() {} });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components, loaders: harnessLoaders(harness) };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** A pager's props over 60 records at 25 a page, with `overrides`. */
const pagerProps = (overrides = {}) => ({
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
  ...overrides,
});

/** A pager mounted with `overrides`, and readers of its root, nav, radiogroup and caption. */
function mountPager(overrides = {}) {
  const target = fabricateTarget(targets);
  const handle = ui().mount('Pagination', { target, props: pagerProps(overrides) });
  const group = () => target.querySelector('[data-pagination-size]');
  return {
    handle,
    update: (next) => handle.update(pagerProps(next)),
    bar: () => target.querySelector('.fabricate-pagination'),
    nav: () => target.querySelector('nav'),
    group,
    caption: () => target.querySelector(':scope .manager-pagination-size > span[id]'),
  };
}

describe('the published Pagination, landmarks', () => {
  it('names the region and the nav by default', async () => {
    const { handle, bar, nav } = mountPager();
    await settle();
    assert.equal(bar().getAttribute('aria-label'), 'Recipe pages');
    assert.equal(nav().getAttribute('aria-label'), 'Recipe page navigation');
    handle.destroy();
  });

  it("leaves the root unnamed under 'nav', so the nav is its one landmark", async () => {
    const { handle, bar, nav } = mountPager({ landmarks: 'nav' });
    await settle();
    assert.equal(bar().tagName, 'SECTION');
    assert.ok(!bar().hasAttribute('aria-label'), 'no region name');
    assert.equal(nav().getAttribute('aria-label'), 'Recipe page navigation');
    handle.destroy();
  });

  it('names the region again on an update that drops it, keeping the root', async () => {
    const { handle, update, bar } = mountPager({ landmarks: 'nav' });
    await settle();
    const root = bar();
    assert.equal(update({}), true);
    await settle();
    assert.ok(bar() === root, 'the same root');
    assert.equal(root.getAttribute('aria-label'), 'Recipe pages');
    handle.destroy();
  });

  for (const value of ['both', 'none', 'region', 'NAV', true, 1, null]) {
    it(`draws both landmarks for ${JSON.stringify(value)}`, async () => {
      const { handle, bar, nav } = mountPager({ landmarks: value });
      await settle();
      assert.equal(bar().getAttribute('aria-label'), 'Recipe pages');
      assert.equal(nav().getAttribute('aria-label'), 'Recipe page navigation');
      handle.destroy();
    });
  }
});

describe('the published Pagination, perPageAriaLabel', () => {
  it('names the page-size radiogroup in place of the caption, which is still drawn', async () => {
    const { handle, group, caption } = mountPager({ perPageAriaLabel: GROUP_NAME });
    await settle();
    assert.equal(group().getAttribute('role'), 'radiogroup');
    assert.equal(group().getAttribute('aria-label'), GROUP_NAME);
    assert.ok(!group().hasAttribute('aria-labelledby'), 'the caption no longer names it');
    assert.equal(caption().textContent, 'Per page');
    handle.destroy();
  });

  for (const value of [undefined, '', ' '.repeat(3), 7]) {
    it(`names it by the caption for ${JSON.stringify(value)}`, async () => {
      const { handle, group, caption } = mountPager({ perPageAriaLabel: value });
      await settle();
      assert.equal(group().getAttribute('aria-labelledby'), caption().id);
      assert.ok(!group().hasAttribute('aria-label'));
      handle.destroy();
    });
  }

  it('refuses a name that does not hold the caption (M22), drawing nothing', () => {
    const target = fabricateTarget(targets);
    const props = pagerProps({ perPageAriaLabel: 'Recipes shown' });
    assert.throws(() => ui().mount('Pagination', { target, props }), {
      name: 'TypeError',
      message: `${REFUSAL}"perPageAriaLabel" must contain the text of "perPageLabel" ("Per page" is not in "Recipes shown")`,
    });
    assert.equal(target.childNodes.length, 0);
  });

  it('takes a name holding the caption in another case', async () => {
    const { handle, group } = mountPager({ perPageAriaLabel: 'Recipes per page' });
    await settle();
    assert.equal(group().getAttribute('aria-label'), 'Recipes per page');
    handle.destroy();
  });

  it('publishes both keys as data keys', () => {
    const { props } = ui().describe('Pagination');
    assert.deepEqual(
      [props.landmarks, props.perPageAriaLabel],
      [
        { kind: 'data', required: false },
        { kind: 'data', required: false },
      ]
    );
  });
});
