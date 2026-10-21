/** The pager's range arithmetic, landmarks and segmented page-size control, mounted for real. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { byCodePoint } from '../helpers/codePointOrder.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { choosePageSize, pageSizeValue, pageSizeValues } from '../helpers/page-size-control.js';
import {
  PAGINATION_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

import { pagerBarFixture } from './manager-layout-shared.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PAGINATION = 'src/ui/svelte/components/Pagination.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-pagination-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [...PAGINATION_COMPILED_MODULES],
  componentPath: PAGINATION,
});

const pager = (target) => target.querySelector('.fabricate-pagination');
const size = (target, scope = '') => target.querySelector(`${scope} [data-pagination-size]`.trim());

describe('Pagination page-size control', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('draws one radio per option in a named radiogroup', async () => {
    const target = await harness.mount({ totalCount: 100, pageSize: 25 });
    const group = size(target);
    assert.equal(group.getAttribute('role'), 'radiogroup');
    assert.deepEqual(pageSizeValues(target), ['10', '25', '50']);
    assert.equal(pageSizeValue(target), '25');
    const caption = target.querySelector(`#${group.getAttribute('aria-labelledby')}`);
    assert.equal(caption.textContent.trim(), 'Per page');
  });

  it('offers the sorted union of the options and the current size', async () => {
    const target = await harness.mount({
      totalCount: 100,
      pageSize: 20,
      pageSizeOptions: [50, 10, 25],
    });
    assert.deepEqual(pageSizeValues(target), ['10', '20', '25', '50']);
    assert.equal(pageSizeValue(target), '20');
  });

  it('renders neither the control nor its caption under two options', async () => {
    const target = await harness.mount({
      totalCount: 100,
      pageSize: 10,
      pageSizeOptions: [10],
      persistent: true,
    });
    assert.ok(!size(target), 'no radiogroup');
    assert.ok(!target.querySelector('.manager-pagination-size'), 'no caption either');
  });

  it('reports a chosen size as a number', async () => {
    const chosen = [];
    const target = await harness.mount({
      totalCount: 100,
      pageSize: 10,
      onPageSizeChange: (next) => {
        chosen.push(next);
      },
    });
    choosePageSize(target, '', 25);
    assert.deepEqual(chosen, [25]);
    assert.equal(typeof chosen[0], 'number');
  });

  it('takes the inline rung in a compact pager and the default rung otherwise', async () => {
    const compact = await harness.mount({ totalCount: 100, pageSize: 10, density: 'compact' });
    assert.ok(size(compact).classList.contains('is-inline'));
    const plain = await harness.mount({ totalCount: 100, pageSize: 10 });
    assert.ok(!size(plain).classList.contains('is-inline'));
    assert.ok(!size(plain).classList.contains('is-compact'));
  });

  it('keeps the caption visible in a compact pager and the page label hidden', async () => {
    const target = await harness.mount({ totalCount: 100, pageSize: 10, density: 'compact' });
    const caption = target.querySelector(`#${size(target).getAttribute('aria-labelledby')}`);
    assert.ok(!caption.classList.contains('manager-pagination-hidden'));
    assert.ok(
      target.querySelector('[data-pagination-page]').classList.contains('manager-pagination-hidden')
    );
  });

  it('gives each pager its own radio group name', async () => {
    const first = await harness.mount({ totalCount: 100, pageSize: 10 });
    const second = await harness.mount({ totalCount: 100, pageSize: 25 });
    const name = (target) => target.querySelector(':scope [data-pagination-size] input').name;
    assert.notEqual(name(first), name(second));
    assert.equal(pageSizeValue(first), '10');
    assert.equal(pageSizeValue(second), '25');
  });

  it('renders no bar when the whole list fits the smallest size', async () => {
    const target = await harness.mount({ totalCount: 5, pageSize: 10 });
    assert.ok(!pager(target));
  });

  it("keeps the layout fixtures' pager skeleton the one the component renders", async () => {
    const classesOf = (element) =>
      [...element.classList].filter((name) => !name.startsWith('svelte-'));
    const skeleton = (root) => {
      const bar = root.querySelector('.fabricate-pagination');
      const group = bar.querySelector('[role="radiogroup"]');
      const caption = bar.querySelector(`#${group.getAttribute('aria-labelledby')}`);
      return {
        bar: classesOf(bar).sort(byCodePoint),
        children: [...bar.children].map((child) => classesOf(child).join(' ')),
        group: classesOf(group).sort(byCodePoint),
        segments: group.querySelectorAll(':scope label.manager-segment input[type="radio"]').length,
        caption: caption.textContent.trim(),
        wired: group.hasAttribute('data-pagination-size'),
      };
    };
    for (const compact of [false, true]) {
      const mounted = await harness.mount({
        totalCount: 100,
        pageSize: 25,
        pageSizeOptions: [10, 25, 50],
        density: compact ? 'compact' : 'default',
      });
      const holder = document.createElement('div');
      holder.innerHTML = pagerBarFixture({
        probe: 'drift',
        sizes: [10, 25, 50],
        value: 25,
        arrows: true,
        compact,
      });
      assert.deepEqual(
        skeleton(holder),
        skeleton(mounted),
        `the ${compact ? 'compact' : 'default'} fixture bar drifted from the rendered pager`
      );
    }
  });
});
