/**
 * Issue 1778 — ListRow's selectable form, measured in Chromium: the card layout's button keeps its
 * content's height, a focused row's ring sits inside the row where a scrolling list cannot clip
 * it, and a truncated name keeps 6ch before its badges wrap beneath it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-list-row-rendered-',
  compiledModules: ['Medallion', 'ListRow'].map(component),
  componentPath: component('ListRow'),
});

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));
const open = () => {};

/** The rows measured below, by the case each is placed in. */
const CASES = Object.freeze({
  card: {
    name: 'Moonlit Glade',
    layout: 'card',
    onOpen: open,
    meta: snippet('<span>Forest, three tasks</span>'),
  },
  focus: { name: 'Healing Potion', onOpen: open, selected: false },
  floor: {
    name: 'Forge a Pattern-Welded Blade of the Deep Seam',
    truncateName: true,
    onOpen: open,
    badges: snippet(`<span class="probe-badges">${'<span></span>'.repeat(3)}</span>`),
  },
});

/** Core first, the module sheet in `layer(modules)`, the mark's scoped styles unlayered. */
const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
<style>${scopedComponentCss(resolve(repoRoot, component('Medallion'))).css}</style>
<style>:root{--font-primary:Arial,sans-serif}
.probe-badges{display:flex;gap:4px}.probe-badges>span{display:block;width:48px;height:14px}</style>
</head><body class="game"><div class="fabricate fabricate-app" style="width:1000px">
  <div data-case="card" style="width:220px">${markup.card}</div>
  <div data-case="scroller" style="overflow-y:auto;width:320px;height:120px">${markup.focus}</div>
  <div data-case="narrow" style="width:220px">${markup.floor}</div>
  <div data-case="wide" style="width:360px">${markup.floor}</div>
</div></body></html>`;

let browser;
let tab;

before(async () => {
  const markup = {};
  await harness.setup();
  try {
    for (const [key, props] of Object.entries(CASES)) {
      markup[key] = (await harness.mount(props)).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/** Whether `inner` lies within `outer`, to a hundredth of a pixel. */
const within = (inner, outer) =>
  ['left', 'top'].every((side) => inner[side] >= outer[side] - 0.01) &&
  ['right', 'bottom'].every((side) => inner[side] <= outer[side] + 0.01);

describe('ListRow selectable form, rendered (issue 1778)', () => {
  it("keeps the card layout's button the height of its content", async () => {
    const card = await tab.evaluate(() => {
      const button = document.querySelector('[data-case="card"] .fabricate-list-row-open');
      const name = button.querySelector('.fabricate-list-row-name').getBoundingClientRect();
      const box = button.getBoundingClientRect();
      return { height: box.height, bottom: box.bottom, nameBottom: name.bottom };
    });
    assert.ok(card.height > 0, 'a zero flex basis in the column collapsed the button');
    assert.ok(
      card.bottom >= card.nameBottom - 0.01,
      `the name overflows a ${card.height}px button`
    );
  });

  it('rings a focused row inside the row, where the list scrolling around it cannot clip it', async () => {
    await tab.keyboard.press('Tab');
    await tab.focus('[data-case="scroller"] .fabricate-list-row-open');
    const ring = await tab.evaluate(() => {
      const px = (value) => Number.parseFloat(value) || 0;
      const box = (element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const button = document.querySelector('[data-case="scroller"] .fabricate-list-row-open');
      const row = button.parentElement;
      const scroller = row.parentElement;
      const overlay = getComputedStyle(button, '::after');
      // The overlay is placed against the row's padding box; its outline reaches past its edge
      // by the offset plus the width.
      const padding = box(row);
      padding.left += row.clientLeft;
      padding.top += row.clientTop;
      padding.right = padding.left + row.clientWidth;
      padding.bottom = padding.top + row.clientHeight;
      const reach = px(overlay.outlineOffset) + px(overlay.outlineWidth);
      const clip = box(scroller);
      clip.left += scroller.clientLeft;
      clip.top += scroller.clientTop;
      clip.right = clip.left + scroller.clientWidth;
      clip.bottom = clip.top + scroller.clientHeight;
      return {
        focusVisible: button.matches(':focus-visible'),
        ownOutline: getComputedStyle(button).outlineStyle,
        ringStyle: overlay.outlineStyle,
        ring: {
          left: padding.left + px(overlay.left) - reach,
          top: padding.top + px(overlay.top) - reach,
          right: padding.right - px(overlay.right) + reach,
          bottom: padding.bottom - px(overlay.bottom) + reach,
        },
        row: box(row),
        clip,
      };
    });
    assert.equal(ring.focusVisible, true, 'the row took keyboard focus');
    assert.deepEqual(
      [ring.ownOutline, ring.ringStyle],
      ['none', 'solid'],
      'one ring, the overlay’s'
    );
    assert.ok(within(ring.ring, ring.row), `the ring ${JSON.stringify(ring)} leaves the row`);
    assert.ok(within(ring.ring, ring.clip), 'and the scrolling list clips it');
  });

  it('keeps a truncated name 6ch wide, wrapping its badges beneath it rather than past the row', async () => {
    const measure = (id) =>
      tab.evaluate((caseId) => {
        const row = document.querySelector(`[data-case="${caseId}"] .fabricate-list-row`);
        const head = row.querySelector('.fabricate-list-row-head');
        const name = head.querySelector('.fabricate-list-row-name');
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:6ch';
        name.append(probe);
        const sixCh = probe.getBoundingClientRect().width;
        probe.remove();
        const named = name.getBoundingClientRect();
        const badges = head.querySelector('.fabricate-list-row-badges').getBoundingClientRect();
        return {
          sixCh,
          nameWidth: named.width,
          badgesBelow: badges.top >= named.bottom - 0.01,
          overflow: head.scrollWidth - head.clientWidth,
        };
      }, id);
    const narrow = await measure('narrow');
    const wide = await measure('wide');
    assert.ok(narrow.sixCh > 0, 'the 6ch probe measured nothing');
    assert.ok(narrow.nameWidth >= narrow.sixCh - 0.01, `the name shrank to ${narrow.nameWidth}px`);
    assert.equal(narrow.badgesBelow, true, 'the badges wrap beneath the name');
    assert.ok(narrow.overflow <= 0, `the head overflows the row by ${narrow.overflow}px`);
    assert.equal(wide.badgesBelow, false, 'where the line has room, the badges stay beside it');
    assert.ok(wide.nameWidth >= wide.sixCh - 0.01);
  });
});
