/** The pager's range arithmetic, landmarks and segmented page-size control, mounted for real. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
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
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/appLocalizer.js',
  ],
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
    assert.ok(pager(target), 'the persistent bar still renders');
    assert.ok(!size(target), 'no radiogroup');
    assert.ok(!target.querySelector('.manager-pagination-size'), 'no caption either');
  });

  it('renders neither the control nor its caption under showPageSize={false}', async () => {
    const target = await harness.mount({ totalCount: 100, pageSize: 10, showPageSize: false });
    assert.ok(pager(target), 'the bar still renders');
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

  it('keeps a multiPageOnly bar mounted while focus is inside it, and lets it hide on blur', async () => {
    const target = await harness.mount({ totalCount: 100, pageSize: 10, multiPageOnly: true });
    const radio = target.querySelector(':scope [data-pagination-size] input[type="radio"]');
    radio.focus();
    flushSync();
    await harness.setProps({ pageSize: 100 });
    flushSync();
    assert.ok(pager(target), 'a size covering the whole list does not unmount the focused bar');
    assert.ok(target.contains(document.activeElement), 'focus stays inside the bar');
    radio.blur();
    flushSync();
    assert.ok(!pager(target), 'the bar hides once focus leaves it');
  });

  it('keeps a held multiPageOnly bar mounted when focus moves between its own controls', async () => {
    // Negative control: an unguarded focusout handler (holdOpen = false on every focusout) drops
    // the hold here, because focusout also fires when focus moves to a sibling control inside the
    // bar.
    const target = await harness.mount({ totalCount: 100, pageSize: 10, multiPageOnly: true });
    const [first, second] = target.querySelectorAll(
      ':scope [data-pagination-size] input[type="radio"]'
    );
    first.focus();
    flushSync();
    await harness.setProps({ pageSize: 100 });
    flushSync();
    assert.ok(pager(target), 'the held bar is mounted before focus moves');
    first.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: second }));
    flushSync();
    assert.ok(pager(target), 'focus moving to a sibling control inside the bar keeps it mounted');
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

const LABELS = Object.freeze({
  ariaLabel: 'Reagent pages',
  navLabel: 'Reagent page navigation',
  previousLabel: 'Previous reagents page',
  nextLabel: 'Next reagents page',
  perPageLabel: 'Rows',
  rangeTemplate: '{first}–{last} of {total} reagents',
  pageTemplate: 'Page {page} of {total}, {unknown}',
});

/** The strings the bar draws: its landmark names, the arrows, the caption, the summary and the page. */
function drawnCopy(target) {
  const bar = pager(target);
  const group = size(target);
  return {
    region: bar.getAttribute('aria-label'),
    nav: bar.querySelector('nav').getAttribute('aria-label'),
    previous: bar.querySelector('[data-pagination-prev]').getAttribute('aria-label'),
    next: bar.querySelector('[data-pagination-next]').getAttribute('aria-label'),
    caption: target.querySelector(`#${group.getAttribute('aria-labelledby')}`).textContent.trim(),
    summary: bar.querySelector('[data-pagination-summary]').textContent.trim(),
    page: bar.querySelector('[data-pagination-page]').textContent.trim(),
  };
}

describe('Pagination copy', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it("draws each label prop in place of its fallback, and fills the caller's templates", async () => {
    const target = await harness.mount({ totalCount: 60, pageSize: 25, pageIndex: 1, ...LABELS });
    assert.deepEqual(drawnCopy(target), {
      region: 'Reagent pages',
      nav: 'Reagent page navigation',
      previous: 'Previous reagents page',
      next: 'Next reagents page',
      caption: 'Rows',
      summary: '26–50 of 60 reagents',
      page: 'Page 2 of 3, {unknown}',
    });
  });

  it("draws the context localizer's copy, its templates filled", async () => {
    const { APP_LOCALIZER } = await harness.loadRawModule('src/ui/svelte/util/appLocalizer.js');
    const localized = {
      'FABRICATE.Admin.Manager.Pagination.Range': 'Von {first} bis {last} ({total})',
      'FABRICATE.Admin.Manager.Pagination.PageOf': 'Seite {page}/{total}',
    };
    const localize = (key) => localized[key] ?? `[${key.split('.').at(-1)}]`;
    const target = await harness.mount(
      { totalCount: 60, pageSize: 25, pageIndex: 1 },
      { context: new Map([[APP_LOCALIZER, localize]]) }
    );
    assert.deepEqual(drawnCopy(target), {
      region: '[Label]',
      nav: '[Navigation]',
      previous: '[Previous]',
      next: '[Next]',
      caption: '[PerPage]',
      summary: 'Von 26 bis 50 (60)',
      page: 'Seite 2/3',
    });
  });

  it('draws the English under no context, and asks game.i18n for nothing', async () => {
    const { game } = globalThis;
    const saved = game.i18n;
    const calls = [];
    const record = (key) => {
      calls.push(key);
      return key;
    };
    game.i18n = { localize: record, format: record, has: () => true };
    try {
      const target = await harness.mount({ totalCount: 60, pageSize: 25, pageIndex: 1 });
      assert.deepEqual(drawnCopy(target), {
        region: 'Pagination',
        nav: 'Page navigation',
        previous: 'Previous page',
        next: 'Next page',
        caption: 'Per page',
        summary: 'Showing 26–50 of 60',
        page: 'Page 2 of 3',
      });
      assert.deepEqual(calls, []);
    } finally {
      game.i18n = saved;
    }
  });
});

const arrow = (target, which) => target.querySelector(`[data-pagination-${which}]`);
const checkedSize = (target) =>
  target.querySelector(':scope [data-pagination-size] input[type="radio"]:checked');

describe('Pagination focus when an update disables or removes the focused arrow', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('leaves focus on Previous after Next reaches the last page, and on Next after Previous reaches the first', async () => {
    const target = await harness.mount({ totalCount: 60, pageSize: 25, pageIndex: 1 });
    arrow(target, 'next').focus();
    await harness.setProps({ pageIndex: 2 });
    assert.ok(arrow(target, 'next').disabled, 'Next is disabled on the last page');
    assert.ok(document.activeElement === arrow(target, 'prev'), 'focus rests on Previous');
    await harness.setProps({ pageIndex: 1 });
    arrow(target, 'prev').focus();
    await harness.setProps({ pageIndex: 0 });
    assert.ok(document.activeElement === arrow(target, 'next'), 'focus rests on Next');
  });

  it('moves focus to the checked size radio when a persistent update leaves one page', async () => {
    const target = await harness.mount({
      totalCount: 60,
      pageSize: 25,
      pageIndex: 2,
      persistent: true,
    });
    arrow(target, 'prev').focus();
    await harness.setProps({ totalCount: 20, pageIndex: 0 });
    assert.ok(arrow(target, 'prev').disabled && arrow(target, 'next').disabled);
    assert.ok(document.activeElement === checkedSize(target), 'focus is on the checked size');
    assert.equal(checkedSize(target).value, '25');
  });

  it('moves focus to the checked size radio when an update removes the navigation', async () => {
    const target = await harness.mount({ totalCount: 30, pageSize: 10, pageSizeOptions: [10, 50] });
    arrow(target, 'next').focus();
    await harness.setProps({ pageSize: 50 });
    assert.ok(!target.querySelector('nav'), 'one page draws no navigation');
    assert.ok(document.activeElement === checkedSize(target), 'focus is on the checked size');
    assert.equal(checkedSize(target).value, '50');
  });

  it('takes focus off the arrow with neither to move to, and removes a bar only focus held', async () => {
    const persistent = await harness.mount({
      totalCount: 30,
      pageSize: 10,
      pageSizeOptions: [10],
      persistent: true,
    });
    const next = arrow(persistent, 'next');
    next.focus();
    // happy-dom's `blur()` ignores a disabled element, which Chromium's does not; count the call.
    const blurred = [];
    next.blur = () => {
      blurred.push(next);
    };
    await harness.setProps({ totalCount: 10 });
    assert.ok(next.disabled, 'the persistent bar keeps its disabled arrows');
    assert.equal(blurred.length, 1, 'Fabricate takes focus off the disabled arrow');

    const held = await harness.mount({ totalCount: 30, pageSize: 10, pageSizeOptions: [10] });
    arrow(held, 'next').focus();
    await harness.setProps({ totalCount: 10 });
    assert.equal(held.children.length, 0, 'the bar focus held is removed');
    assert.ok(document.activeElement === document.body, 'focus is on the body');
  });

  it('keeps focus a caller moved to its own control before the update', async () => {
    const target = await harness.mount({ totalCount: 60, pageSize: 25, pageIndex: 1 });
    const own = document.createElement('button');
    document.body.append(own);
    arrow(target, 'next').focus();
    own.focus();
    await harness.setProps({ pageIndex: 2 });
    assert.ok(document.activeElement === own, "the caller's control keeps focus");
    own.remove();
  });
});
