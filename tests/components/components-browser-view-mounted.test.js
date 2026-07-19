/**
 * The GM component library's group headers (issue 676).
 *
 * `ComponentsBrowserView` composes filter → sort → paginate → GROUP, so a group header
 * that reports only its bucket length says "General · 25 components" above page 1 of a
 * 282-strong General bucket — the nav, the pager and the header then disagree about the
 * same library. The header carries BOTH numbers, and the total must respect the active
 * filters, or it is a third wrong number.
 *
 * The Component Studio and the Recipe Studio must read as one product, so the sibling
 * assertions live in `recipes-browser-view-mounted.test.js` and both are fed by the same
 * shared `browserGroupCounts.js`.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const browser = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-components-browser-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/utils/componentCategories.js',
    'src/utils/componentBrowserModel.js',
    // componentBrowserModel imports the shared category totals; omitting it HANGS this
    // suite (`# cancelled`) rather than failing it.
    'src/utils/browserGroupCounts.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
    'src/ui/svelte/apps/manager/components/ComponentRow.svelte',
    'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte'
});

function makeComponent(overrides = {}) {
  return {
    id: overrides.id || 'c1',
    name: overrides.name || 'Iron Ore',
    description: 'A lump of ore.',
    img: 'icons/svg/item-bag.svg',
    essences: [],
    salvageSummary: { resultGroupCount: 0 },
    ...overrides
  };
}

/** A category holding more than one page, so the "of N" is actually exercised. */
function manyGeneral(count) {
  return Array.from({ length: count }, (_, index) =>
    makeComponent({
      id: `g${index + 1}`,
      // Zero-padded so name-ascending order is also numeric order.
      name: `Scrap ${String(index + 1).padStart(2, '0')}`
    })
  );
}

function countTexts(root) {
  return [...root.querySelectorAll('.fab-group-count')].map((node) => node.textContent.trim());
}

before(async () => {
  await browser.setup();
});
after(() => {
  browser.teardown();
});
afterEach(() => {
  browser.remount();
});

describe('ComponentsBrowserView group headers (issue 676)', () => {
  it('pairs the rendered count with the category total when the group spans pages', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(30) });

    assert.equal(root.querySelectorAll('.manager-component-row').length, 25, 'the default page holds 25');
    assert.deepEqual(
      countTexts(root),
      ['25 of 30 components'],
      'the header must not say the General bucket holds 25'
    );
    // The pager and the header now agree about the same library.
    assert.equal(
      root.querySelector('[data-component-count]').textContent.trim(),
      '1–25 of 30'
    );
  });

  it('says it once when the group is shown WHOLE', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(3) });
    assert.deepEqual(countTexts(root), ['3 components'], 'not "3 of 3"');
  });

  it('handles the singular — "1 component" whole, "1 of N" paged', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(1) });
    assert.deepEqual(countTexts(root), ['1 component'], 'never "1 components"');

    browser.remount();
    const paged = await browser.mount({ itemCards: manyGeneral(26) });
    const size = paged.querySelector('[data-pagination-size]');
    size.value = '25';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    paged.querySelector('[data-pagination-next]').click();
    flushSync();

    assert.equal(paged.querySelectorAll('.manager-component-row').length, 1, 'page 2 holds one row');
    assert.deepEqual(countTexts(paged), ['1 of 26 components'], 'never "1 components", never a bare "1"');
  });

  it('counts the total over the FILTERED rows, so an active filter is respected', async () => {
    const rows = [
      ...manyGeneral(2),
      makeComponent({ id: 'm1', name: 'Copper Ore', category: 'Metal' }),
      makeComponent({ id: 'm2', name: 'Tin Ore', category: 'Metal' })
    ];
    const root = await browser.mount({ itemCards: rows, categoryVocabulary: ['Metal'] });
    assert.deepEqual(countTexts(root), ['2 components', '2 components'], 'Metal then general');

    const categoryFilter = root.querySelector('[data-component-category-filter]');
    categoryFilter.value = 'Metal';
    categoryFilter.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();

    assert.deepEqual(
      countTexts(root),
      ['2 components'],
      'a total that counted the unfiltered roster would report the whole library here'
    );
  });
});
