/**
 * The published `Pagination` on Fabricate's real Svelte runtime (issue 2646), through a fresh seam
 * registered with the adapter's own table, under a Fabricate window root and the standalone style
 * root it is drawn under in a companion's own shell (issue 2679): the named region, navigation,
 * arrows and radiogroup, each the companion's text, the filled templates, a page turn and a size
 * choice with the one argument each callback takes, a declined size put back, the focus Fabricate
 * moves off an arrow an update disables, in a second document too, the held Enter it cancels there
 * and the tooltip that focus opens, the return-focus selector, what an enclosing form reads, when
 * the bar is drawn, the clipped radios and page label, every refusal the entry adds, and both View
 * Lab specimens.
 * Limit: happy-dom activates no button on a key and runs no radio arrow navigation, so a page turn
 * is a click and a size key is the platform's simulated check; the View Lab cases press the keys.
 * Limit: happy-dom does not tell a keyboard focus from a pointer one, so the tooltip clause answers
 * `:focus-visible` on the arrow.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { getCaseById } from '../../scripts/lib/viewLabCases.js';
import { fixtureLiteral } from '../helpers/labFixtureLiterals.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  assertClipped,
  companionTarget,
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
  standaloneRootIn,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createLabTooltipManager } from '../view-lab/foundry/installFoundryShim.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const LABELS = Object.freeze({
  ariaLabel: 'Reagent pages',
  navLabel: 'Reagent page navigation',
  previousLabel: 'Previous reagents page',
  nextLabel: 'Next reagents page',
  perPageLabel: 'Per page',
  rangeTemplate: '{first}–{last} of {total} reagents',
  pageTemplate: 'Page {page} of {total}',
});
/** The return-focus selector the group states. */
const RETURN_FOCUS = 'button:not(:disabled), input[type="radio"]:checked';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-published-pagination-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

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
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  delete globalThis.game.tooltip;
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** The pager's required props over 60 records at 25 a page, with both callbacks, and `overrides`. */
const pagerProps = (onPageChange, onPageSizeChange, overrides = {}) => ({
  totalCount: 60,
  pageSize: 25,
  pageIndex: 0,
  pageSizeOptions: [10, 25, 50],
  ...LABELS,
  onPageChange,
  onPageSizeChange,
  ...overrides,
});

/** A target inside a `<form>` under a Fabricate window, and that form. */
function formTarget() {
  const target = fabricateTarget(targets);
  const form = document.createElement('form');
  target.replaceWith(form);
  form.append(target);
  return { target, form };
}

/**
 * A pager mounted under a Fabricate window: its target, handle, props, each callback's recorded
 * calls, and its parts. `callbacks` replaces either recorder.
 */
function mountPager(overrides = {}, callbacks = {}, target = fabricateTarget(targets)) {
  const page = recorder();
  const size = recorder();
  const props = pagerProps(
    callbacks.onPageChange ?? page.record,
    callbacks.onPageSizeChange ?? size.record,
    overrides
  );
  const handle = ui().mount('Pagination', { target, props });
  const scoped = (selector) => target.querySelector(`:scope ${selector}`);
  return {
    target,
    handle,
    props,
    pages: page.calls,
    sizes: size.calls,
    bar: () => scoped('.fabricate-pagination'),
    prev: () => scoped('[data-pagination-prev]'),
    next: () => scoped('[data-pagination-next]'),
    group: () => scoped('[data-pagination-size]'),
    radio: (value) => scoped(`[data-pagination-size] input[type="radio"][value="${value}"]`),
    radios: () => [...target.querySelectorAll(':scope [data-pagination-size] input[type="radio"]')],
    segment: (value) => scoped(`[data-pagination-size-option="${value}"]`),
    summary: () => scoped('[data-pagination-summary]').textContent.trim(),
    page: () => scoped('[data-pagination-page]').textContent.trim(),
  };
}

/** A pager whose `onPageSizeChange` passes the reached size back with the first page, before it returns. */
function mountAccepting(overrides = {}) {
  const companion = { calls: [] };
  const onPageSizeChange = (pageSize) => {
    companion.calls.push([pageSize]);
    companion.handle.update(pagerProps(() => {}, onPageSizeChange, { ...overrides, pageSize }));
  };
  const mounted = mountPager(overrides, { onPageSizeChange });
  companion.handle = mounted.handle;
  return { ...mounted, sizes: companion.calls };
}

/** Focuses and checks `radio` as the platform does on a key, then fires its `change`. */
function reach(radio) {
  radio.focus();
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Turns the page with Next as a keyboard user does, then passes the reached page back. */
async function pressNext({ handle, props, next }, pageIndex) {
  next().focus();
  next().click();
  handle.update({ ...props, pageIndex });
  await settle();
}

const checkedValues = (radios) => radios.filter((node) => node.checked).map((node) => node.value);
const enter = (overrides = {}) =>
  new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...overrides });

/** The refusal `mount` throws for the pager's props with `overrides`, with nothing rendered. */
function assertRefused(overrides, tail) {
  const target = fabricateTarget(targets);
  const props = pagerProps(
    () => {},
    () => {},
    overrides
  );
  assert.throws(() => ui().mount('Pagination', { target, props }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published Pagination', () => {
  it('describes the fifteen keys its manifest entry publishes, at the fabricate root', () => {
    const described = ui().describe('Pagination');
    assert.deepEqual(Object.keys(described.props), [
      'totalCount',
      'pageSize',
      'pageIndex',
      'pageSizeOptions',
      'onPageChange',
      'onPageSizeChange',
      'persistent',
      'ariaLabel',
      'navLabel',
      'previousLabel',
      'nextLabel',
      'perPageLabel',
      'rangeTemplate',
      'pageTemplate',
      'density',
    ]);
    assert.deepEqual(described.props.onPageChange, { kind: 'callback', required: true });
    assert.equal(described.root, 'any');
    assert.equal(described.overlays, false);
    assert.equal(described.rest, false);
  });

  it('draws one region, updates it in place, then leaves target empty on destroy', async () => {
    const { target, handle, props, bar, summary } = mountPager();
    await settle();
    assert.equal(target.children.length, 1, 'the region is the only element in target');
    const root = bar();
    assert.ok(target.firstElementChild === root);
    assert.equal(handle.update({ ...props, pageIndex: 1 }), true);
    await settle();
    assert.ok(bar() === root, 'the same region node');
    assert.equal(summary(), '26–50 of 60 reagents');
    handle.destroy();
    assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
    await settle();
    assert.deepEqual(reports, []);
  });

  it('draws nothing, and nothing focusable, while the list fits the smallest size', async () => {
    const { target, handle } = mountPager({ totalCount: 10 });
    await settle();
    assert.equal(target.children.length, 0);
    assert.equal(target.querySelectorAll('button, input').length, 0);
    handle.destroy();
  });

  it('draws both arrows disabled on a persistent single page', async () => {
    const { handle, prev, next } = mountPager({ totalCount: 10, persistent: true });
    await settle();
    assert.ok(prev().disabled && next().disabled);
    handle.destroy();
  });

  it('draws no caption and no radio for an empty pageSizeOptions', async () => {
    const { target, handle, group } = mountPager({ pageSizeOptions: [] });
    await settle();
    assert.ok(!group(), 'no radiogroup');
    assert.ok(!target.querySelector('.manager-pagination-size'), 'no caption');
    assert.equal(target.querySelectorAll('input').length, 0);
    handle.destroy();
  });

  it('stays drawn while focus is inside it, and is removed once focus leaves', async () => {
    const { target, handle, props, radio, bar } = mountPager({
      totalCount: 30,
      pageSize: 10,
      pageSizeOptions: [10, 50],
    });
    await settle();
    radio(10).focus();
    handle.update({ ...props, totalCount: 5 });
    await settle();
    assert.ok(bar(), 'the focused bar stays drawn');
    radio(10).blur();
    await settle();
    assert.equal(target.children.length, 0, 'and goes once focus leaves');
    handle.destroy();
  });

  it('draws each radio clipped at both densities, and the compact page label clipped under the module sheet', async () => {
    for (const density of ['default', 'compact']) {
      const { handle, radio } = mountPager({ density });
      await settle();
      assertClipped(radio(25), `the ${density} radio`);
      handle.destroy();
    }
    const rule = /\.fabricate-pagination \.manager-pagination-hidden \{[^}]*\}/.exec(
      readStylesheet()
    )?.[0];
    assert.ok(rule, 'the module rule that hides the page label was read');
    await underSheet(rule, async () => {
      const { handle, target } = mountPager({ density: 'compact' });
      await settle();
      const style = getComputedStyle(target.querySelector('[data-pagination-page]'));
      assert.deepEqual(
        [style.position, style.width, style.height, style.clipPath],
        ['absolute', '1px', '1px', 'inset(50%)']
      );
      handle.destroy();
    });
  });

  it('submits no form on an arrow press, and bubbles a size change to it', async () => {
    const { target, form } = formTarget();
    const submitted = [];
    const changed = [];
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitted.push(event);
    });
    form.addEventListener('change', (event) => {
      changed.push(event.target.value);
    });
    const { handle, next, radio } = mountPager({}, {}, target);
    await settle();
    assert.equal(next().type, 'button');
    next().click();
    reach(radio(50));
    assert.equal(submitted.length, 0, 'no submit');
    assert.deepEqual(changed, ['50']);
    handle.destroy();
  });

  it('writes distinct radio names for two mounts, each shared within its mount', async () => {
    const one = mountPager();
    const two = mountPager();
    await settle();
    const names = (mounted) => [...new Set(mounted.radios().map((node) => node.name))];
    assert.equal(names(one).length, 1);
    assert.notEqual(names(one)[0], names(two)[0]);
    one.handle.destroy();
    two.handle.destroy();
  });

  it('answers the return-focus selector with Previous on the last page, and the checked size on one persistent page', async () => {
    const last = mountPager({ pageIndex: 2 });
    await settle();
    assert.ok(last.target.querySelector(RETURN_FOCUS) === last.prev());
    const single = mountPager({ totalCount: 10, persistent: true });
    await settle();
    assert.ok(single.target.querySelector(RETURN_FOCUS) === single.radio(25));
    last.handle.destroy();
    single.handle.destroy();
  });
});

describe('the published Pagination names', () => {
  it('names the region, the navigation, each arrow and the radiogroup by the companion’s text', async () => {
    const { target, handle, bar, prev, next, group } = mountPager();
    await settle();
    assert.equal(bar().getAttribute('aria-label'), 'Reagent pages');
    assert.equal(bar().querySelector('nav').getAttribute('aria-label'), 'Reagent page navigation');
    assert.equal(prev().getAttribute('aria-label'), 'Previous reagents page');
    assert.equal(next().getAttribute('aria-label'), 'Next reagents page');
    const caption = target.querySelector(`[id="${group().getAttribute('aria-labelledby')}"]`);
    assert.equal(caption?.textContent.trim(), 'Per page');
    handle.destroy();
  });

  it('names each radio by its numeral through the wrapping label', async () => {
    const { handle, radios } = mountPager({ pageSizeOptions: [10, 1000] });
    await settle();
    assert.deepEqual(
      radios().map((node) => node.closest('label')?.textContent.trim()),
      ['10', '25', '1000']
    );
    handle.destroy();
  });

  it('fills both templates, keeping an unknown token as written, and draws 0 and 0 with no record', async () => {
    const { handle, props, summary, page } = mountPager({
      pageIndex: 1,
      pageTemplate: 'Page {page} of {total} {unit}',
    });
    await settle();
    assert.equal(summary(), '26–50 of 60 reagents');
    assert.equal(page(), 'Page 2 of 3 {unit}');
    handle.update({ ...props, totalCount: 0, pageIndex: 0, persistent: true });
    await settle();
    assert.equal(summary(), '0–0 of 0 reagents');
    handle.destroy();
  });

  it('asks game.i18n for nothing', async () => {
    const { game } = globalThis;
    const saved = game.i18n;
    const calls = [];
    const record = (key) => {
      calls.push(key);
      return key;
    };
    game.i18n = { localize: record, format: record, has: () => true };
    try {
      const { handle } = mountPager();
      await settle();
      assert.deepEqual(calls, []);
      handle.destroy();
    } finally {
      game.i18n = saved;
    }
  });
});

describe('a page turn in the published Pagination', () => {
  it('calls onPageChange with the next index, and moves the summary only after the update', async () => {
    const { handle, props, pages, next, summary } = mountPager();
    await settle();
    next().click();
    assert.deepEqual(pages, [[1]]);
    await settle();
    assert.equal(summary(), '1–25 of 60 reagents', 'not before the update');
    next().click();
    assert.deepEqual(pages, [[1], [1]], 'a second press before the update reports the same index');
    handle.update({ ...props, pageIndex: 1 });
    await settle();
    assert.equal(summary(), '26–50 of 60 reagents');
    handle.destroy();
  });

  it('disables Next on the last page and calls nothing for its press', async () => {
    const { handle, pages, next } = mountPager({ pageIndex: 2 });
    await settle();
    assert.equal(next().disabled, true);
    next().click();
    assert.deepEqual(pages, []);
    handle.destroy();
  });

  it('moves focus to Previous when the update disables the focused Next', async () => {
    const mounted = mountPager({ pageIndex: 1 });
    await settle();
    await pressNext(mounted, 2);
    assert.deepEqual(mounted.pages, [[2]]);
    assert.ok(mounted.next().disabled);
    assert.ok(document.activeElement === mounted.prev(), 'focus rests on Previous');
    mounted.handle.destroy();
  });

  it('moves focus on a mount adopted into a second document, onto that document’s Previous', async () => {
    const mounted = mountPager({ pageIndex: 1 });
    await settle();
    const other = document.implementation.createHTMLDocument('detached');
    other.body.append(other.adoptNode(mounted.target.parentElement));
    const own = document.createElement('button');
    document.body.append(own);
    own.focus();
    await pressNext(mounted, 2);
    assert.ok(other.activeElement === mounted.prev(), 'focus is on that document’s Previous');
    own.remove();
    mounted.handle.destroy();
  });

  it('reports an onPageChange that throws once, and stays drawn and live', async () => {
    const failure = new Error('the companion write failed');
    const { handle, props, next } = mountPager(
      {},
      {
        onPageChange: () => {
          throw failure;
        },
      }
    );
    await settle();
    next().click();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Pagination', 'onPageChange', failure]]);
    assert.equal(handle.update({ ...props, pageIndex: 1 }), true);
    handle.destroy();
  });
});

describe('the keyboard on the published Pagination', () => {
  /** A persistent pager whose update leaves one page, so focus falls to the checked size. */
  async function movedToSize() {
    const mounted = mountPager({ pageIndex: 1, persistent: true });
    await settle();
    mounted.next().focus();
    mounted.next().click();
    mounted.handle.update({ ...mounted.props, pageIndex: 0, totalCount: 10, persistent: true });
    await settle();
    assert.ok(document.activeElement === mounted.radio(25), 'focus was moved to the checked size');
    return mounted;
  }

  /** A pager whose Next has just reached the last page, focus moved to Previous. */
  async function movedToPrevious() {
    const mounted = mountPager({ pageIndex: 1 });
    await settle();
    await pressNext(mounted, 2);
    assert.ok(document.activeElement === mounted.prev(), 'focus was moved to Previous');
    return mounted;
  }

  it('cancels a held Enter’s repeat on the arrow it moved focus to, and still lets it reach the target', async () => {
    const { target, handle, prev, pages } = await movedToPrevious();
    const heard = [];
    target.addEventListener('keydown', (event) => {
      heard.push(event.key);
    });
    const repeat = enter({ repeat: true });
    prev().dispatchEvent(repeat);
    assert.equal(repeat.defaultPrevented, true, 'the repeat is cancelled');
    assert.deepEqual(heard, ['Enter'], 'and still bubbles to the companion');
    assert.deepEqual(pages, [[2]]);
    handle.destroy();
  });

  it('cancels a held Enter’s repeat on the size radio it moved focus to', async () => {
    const { handle, radio } = await movedToSize();
    const repeat = enter({ repeat: true });
    radio(25).dispatchEvent(repeat);
    assert.equal(repeat.defaultPrevented, true);
    handle.destroy();
  });

  it('keeps cancelling while a key other than Enter is released', async () => {
    const { handle, prev } = await movedToPrevious();
    prev().dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    const repeat = enter({ repeat: true });
    prev().dispatchEvent(repeat);
    assert.equal(repeat.defaultPrevented, true);
    handle.destroy();
  });

  it('holds no stale cancel after a second move', async () => {
    const m = mountPager({ pageIndex: 1 });
    await settle();
    await pressNext(m, 2);
    m.handle.update({ ...m.props, pageIndex: 0 });
    await settle();
    assert.ok(document.activeElement === m.next());
    const repeat = enter({ repeat: true });
    m.prev().dispatchEvent(repeat);
    assert.equal(repeat.defaultPrevented, false);
    m.handle.destroy();
  });

  it('leaves a removed size radio’s focus off the arrows', async () => {
    const { handle, props, radio, prev, next } = mountPager({ persistent: true, pageIndex: 1 });
    await settle();
    radio(25).focus();
    handle.update({ ...props, persistent: true, pageIndex: 1, pageSizeOptions: [] });
    await settle();
    assert.ok(document.activeElement !== prev() && document.activeElement !== next());
    handle.destroy();
  });

  for (const [claim, release] of [
    ['a keyup', (node) => node.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))],
    ['a fresh Enter', (node) => node.dispatchEvent(enter())],
    ['a focusout', (node) => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))],
  ]) {
    it(`cancels no repeat after ${claim}`, async () => {
      const { handle, prev } = await movedToPrevious();
      release(prev());
      const repeat = enter({ repeat: true });
      prev().dispatchEvent(repeat);
      assert.equal(repeat.defaultPrevented, false);
      handle.destroy();
    });
  }

  it('cancels no repeat of another key, nor a repeat Enter on an arrow it did not move focus to', async () => {
    const moved = await movedToPrevious();
    const other = new KeyboardEvent('keydown', { key: ' ', repeat: true, cancelable: true });
    moved.prev().dispatchEvent(other);
    assert.equal(other.defaultPrevented, false, 'a held Space is the platform’s');
    moved.handle.destroy();
    const plain = mountPager();
    await settle();
    plain.next().focus();
    const repeat = enter({ repeat: true });
    plain.next().dispatchEvent(repeat);
    assert.equal(repeat.defaultPrevented, false, 'focus the user moved is the platform’s');
    plain.handle.destroy();
  });

  it('opens Previous’s tooltip under the keyboard focus it moved there', async () => {
    const tooltip = createLabTooltipManager();
    globalThis.game.tooltip = tooltip;
    const mounted = mountPager({ pageIndex: 1 });
    await settle();
    const node = mounted.prev();
    const matches = node.matches.bind(node);
    node.matches = (selector) => selector === ':focus-visible' || matches(selector);
    await pressNext(mounted, 2);
    const opened = tooltip.calls.filter(
      ([verb, element]) => verb === 'activate' && element === node
    );
    assert.deepEqual(
      opened.map((call) => call[2]),
      [{ text: 'Previous reagents page' }]
    );
    mounted.handle.destroy();
  });
});

describe('a page-size choice in the published Pagination', () => {
  it('calls onPageSizeChange with the pressed size, as a number', async () => {
    const { handle, sizes, segment } = mountPager();
    await settle();
    segment(50).click();
    assert.deepEqual(sizes, [[50]]);
    assert.equal(typeof sizes[0][0], 'number');
    handle.destroy();
  });

  it('calls onPageSizeChange with the size of the radio the platform checks on a key', async () => {
    const { handle, sizes, radio } = mountPager();
    await settle();
    reach(radio(10));
    assert.deepEqual(sizes, [[10]]);
    handle.destroy();
  });

  it('calls nothing for a press on the selected size', async () => {
    const { handle, sizes, segment } = mountPager();
    await settle();
    segment(25).click();
    assert.deepEqual(sizes, []);
    handle.destroy();
  });

  it('puts the previous radio back and leaves focus on the reached one when the companion declines', async () => {
    const { handle, radio, radios } = mountPager();
    await settle();
    reach(radio(50));
    assert.deepEqual(checkedValues(radios()), ['25']);
    assert.ok(document.activeElement === radio(50), 'focus stays on the reached radio');
    handle.destroy();
  });

  it('keeps the reached radio checked when the companion passes it from inside onPageSizeChange', async () => {
    const { handle, sizes, radio, radios, summary } = mountAccepting();
    await settle();
    reach(radio(50));
    assert.deepEqual(sizes, [[50]]);
    await settle();
    assert.deepEqual(checkedValues(radios()), ['50']);
    assert.equal(summary(), '1–50 of 60 reagents');
    handle.destroy();
  });

  it('reports an onPageSizeChange that throws once, and stays drawn and live', async () => {
    const failure = new Error('the companion write failed');
    const { handle, props, radio, radios } = mountPager(
      {},
      {
        onPageSizeChange: () => {
          throw failure;
        },
      }
    );
    await settle();
    reach(radio(10));
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Pagination', 'onPageSizeChange', failure]]);
    assert.deepEqual(checkedValues(radios()), ['25'], 'the previous radio is put back');
    assert.equal(handle.update({ ...props, pageIndex: 1 }), true);
    handle.destroy();
  });
});

describe('what the published Pagination refuses', () => {
  for (const key of ['showPageSize', 'multiPageOnly', 'edge', 'class', 'data-x']) {
    it(`refuses ${key}, which it does not publish (M8)`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is not a prop of Pagination`);
    });
  }

  for (const key of ['onPageChange', 'onPageSizeChange']) {
    for (const value of ['', 'x']) {
      it(`refuses ${JSON.stringify(value)} for ${key} (M17), and renders nothing`, () => {
        assertRefused({ [key]: value }, `"${key}" must be a function`);
      });
    }
  }

  it('refuses a function among pageSizeOptions (M10), and renders nothing', () => {
    assertRefused(
      { pageSizeOptions: [10, () => 25] },
      '"pageSizeOptions" must not hold a function'
    );
  });
});

describe('the published Pagination in a companion’s own shell', () => {
  it('draws its region inside one standalone style root, its return-focus query is reached, and destroy leaves the shell empty', async () => {
    const target = companionTarget(targets);
    const props = pagerProps(
      () => {},
      () => {}
    );
    const handle = ui().mount('Pagination', { target, props });
    await settle();
    const region = standaloneRootIn(target).firstElementChild;
    assert.equal(region.localName, 'section');
    const focusable = target.querySelector('button:not(:disabled), input[type="radio"]:checked');
    assert.ok(region.contains(focusable), 'target’s return-focus element is the pager’s');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});

describe('the pagination View Lab specimen cases against the DOM the fixture draws', () => {
  const FIXTURE = 'tests/view-lab/fixtures/PublishedPagination.svelte';
  const count = (selector) => document.querySelectorAll(selector).length;

  /**
   * The fixture's `key` ground: its pager mounted into the target, and the echo each callback
   * writes; `update` false is a companion whose callbacks pass nothing back.
   */
  function drawFixture(key, { update = true } = {}) {
    const fixed = fixtureLiteral(FIXTURE, 'PAGERS')[key];
    const ground = document.createElement('div');
    ground.setAttribute('data-lab-pagination', key);
    const slot = document.createElement('div');
    slot.setAttribute('data-lab-pagination-target', key);
    ground.append(slot);
    fabricateTarget(targets).append(ground);
    let { pageIndex, pageSize } = fixed;
    const props = () => ({
      ...fixed,
      pageIndex,
      pageSize,
      onPageChange: (next) => {
        if (update) {
          pageIndex = next;
          handle.update(props());
        }
        ground.setAttribute('data-lab-pagination-page', next);
      },
      onPageSizeChange: (next) => {
        if (update) {
          pageSize = next;
          pageIndex = 0;
          handle.update(props());
        }
        ground.setAttribute('data-lab-pagination-size', next);
      },
    });
    const handle = ui().mount('Pagination', { target: slot, props: props() });
    return { handle, slot };
  }

  /** The case's one step on the one element it names, run as the platform runs its key. */
  function runStep(viewCase, act) {
    const [step] = viewCase.steps;
    assert.equal(count(step.selector), 1, 'the step names one element');
    const node = document.querySelector(step.selector);
    node.focus();
    act(node);
  }

  const assertNamesOne = (viewCase) => {
    for (const selector of [
      viewCase.expectCenterHit,
      ...viewCase.expectLayout.controls.map((control) => control.selector),
    ]) {
      assert.equal(count(selector), 1, `${selector} names one element`);
    }
  };

  const SPECIMENS = [
    {
      id: 'manager-published-pagination-specimen',
      key: 'browse',
      // happy-dom activates no button on Enter, so the step's press is the click it makes.
      act: (node) => node.click(),
      reached: (slot) => slot.querySelector('[data-pagination-prev]'),
    },
    {
      id: 'manager-published-pagination-size-specimen',
      key: 'compact',
      act: (node) =>
        reach(node.closest('[data-pagination-size]').querySelector('input[value="25"]')),
      reached: (slot) =>
        slot.querySelector(':scope [data-pagination-size] input[value="25"]').closest('label'),
    },
  ];

  for (const { id, key, act, reached } of SPECIMENS) {
    const viewCase = getCaseById(id);

    it(`${id} waits on exactly one element once its step and the update have run`, async () => {
      const { handle, slot } = drawFixture(key);
      await settle();
      // Foundry's tooltip, which sets `aria-describedby`, has no happy-dom stand-in: the render holds it.
      const selector = viewCase.expectSelector.replace('[aria-describedby="tooltip"]', '');
      assert.equal(count(selector), 0, 'not before the step');
      runStep(viewCase, act);
      await settle();
      assert.equal(count(selector), 1, 'one element after it');
      assert.ok(document.querySelector(selector) === reached(slot));
      assertNamesOne(viewCase);
      handle.destroy();
    });

    it(`${id} waits on nothing when the companion’s callback passes no update`, async () => {
      const { handle } = drawFixture(key, { update: false });
      await settle();
      runStep(viewCase, act);
      await settle();
      assert.equal(count(viewCase.expectSelector), 0, 'its choice was never drawn');
      handle.destroy();
    });
  }
});
