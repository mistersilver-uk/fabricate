/**
 * Issue 2321 — `<XrefList>` measured in Chromium under Foundry's core list rules: every row stands
 * 40px whether it opens or not, the list draws no core bullets or indent, a row that opens takes
 * the pointer and the keyboard, and a row that does not takes neither.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-xref-list-rendered-',
  compiledModules: ['Medallion', 'ListRow', 'Kicker', 'XrefList'].map(component),
  componentPath: component('XrefList'),
});

const LONG_NAME = 'Carve the Bone Idol of the Drowned Choir Beneath the Northern Seam';

/** The kinds a tool's Required for lists; `opens` is set per list below. */
const KINDS = Object.freeze([
  { id: 'r3', name: LONG_NAME, icon: 'fas fa-scroll', detail: 'Recipe' },
  { id: 'r4', name: 'Temper a Blade', icon: 'fas fa-scroll', detail: 'Recipe' },
  { id: 'g1', name: 'Harvest Beast', icon: 'fas fa-leaf', detail: 'Gathering' },
]);

const open = () => {};

/** Three lists, each in the case it is placed in. */
const CASES = Object.freeze({
  linking: { label: 'Required for', items: KINDS, onOpen: open },
  optOut: {
    label: 'Required for',
    items: KINDS.map((item) => (item.id === 'g1' ? { ...item, opens: false } : item)),
    onOpen: open,
  },
  readOnly: {
    label: 'Sources',
    items: [
      { id: 'a1', name: LONG_NAME, icon: 'fas fa-user', quantity: '×2' },
      { id: 'a2', name: 'Camp Chest', icon: 'fas fa-user', quantity: '×5' },
    ],
  },
});

/**
 * Core's layered sheet with its reset's border-box sizing (as `select-popover-width.test.js`
 * restates it), which the 22px mark's border sits inside; the module sheet in `layer(modules)`;
 * the scoped styles unlayered.
 */
const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}
@layer reset{*,*::before,*::after{box-sizing:border-box}}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
${['Medallion', 'Kicker', 'XrefList']
  .map((name) => `<style>${scopedComponentCss(resolve(repoRoot, component(name))).css}</style>`)
  .join('\n')}
<style>:root{--font-primary:Arial,sans-serif}</style>
</head><body class="game"><div class="fabricate fabricate-app" style="width:1000px">
  <div data-case="linking" style="width:320px">${markup.linking}</div>
  <div data-case="optOut" style="width:320px">${markup.optOut}</div>
  <div data-case="readOnly" style="width:320px">${markup.readOnly}</div>
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

/** Each row of a case: its height, its centre, what the centre hits, and its detail's edges. */
const rowsOf = (caseId) =>
  tab.evaluate((id) => {
    return [...document.querySelectorAll(`[data-case="${id}"] [data-list-row]`)].map((row) => {
      const box = row.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      const paddingRight = Number.parseFloat(getComputedStyle(row).paddingRight);
      const detail = row.querySelector('.fabricate-list-row-detail');
      return {
        height: box.height,
        hitsOwnButton:
          Boolean(hit?.closest('button')) && hit.closest('button') === row.querySelector('button'),
        hitsButton: Boolean(hit?.closest('button')),
        contentRight: box.left + row.clientLeft + row.clientWidth - paddingRight,
        detailRight: detail ? detail.getBoundingClientRect().right : null,
        detailShare: detail ? detail.getBoundingClientRect().width / row.clientWidth : null,
      };
    });
  }, caseId);

describe('XrefList, rendered (issue 2321)', () => {
  it('(a) stands every row 40px border-box, opening or not, an overlong name on one line', async () => {
    for (const [id, props] of Object.entries(CASES)) {
      const rows = await rowsOf(id);
      assert.equal(rows.length, props.items.length, `${id}: every item renders a row`);
      for (const [index, row] of rows.entries()) {
        assert.ok(Math.abs(row.height - 40) < 0.01, `${id} row ${index} is ${row.height}px`);
      }
    }
  });

  it("(b) draws no bullet, margin or indent under core's list rules, the label the kicker's line", async () => {
    const list = await tab.evaluate(() => {
      const root = document.querySelector('[data-case="linking"] .fab-xref-list');
      const ul = root.querySelector('ul');
      const style = getComputedStyle(ul);
      const items = [...ul.children].map((li) => getComputedStyle(li));
      const label = root.querySelector('.fab-xref-list-label');
      const kicker = label.querySelector('.fab-kicker');
      return {
        margins: ['Top', 'Right', 'Bottom', 'Left'].map((side) => style[`margin${side}`]),
        paddings: ['Top', 'Right', 'Bottom', 'Left'].map((side) => style[`padding${side}`]),
        bullets: items.map((item) => item.listStyleType),
        itemMargins: items.map((item) => item.marginBottom),
        labelHeight: label.getBoundingClientRect().height,
        kickerLine: Number.parseFloat(getComputedStyle(kicker).lineHeight),
      };
    });
    assert.deepEqual(list.margins, ['0px', '0px', '0px', '0px'], 'no core list margin');
    assert.deepEqual(list.paddings, ['0px', '0px', '0px', '0px'], 'no core list indent');
    assert.deepEqual(list.bullets, ['none', 'none', 'none'], 'no bullet');
    assert.deepEqual(list.itemMargins, ['0px', '0px', '0px'], 'no core item spacing');
    assert.ok(list.kickerLine > 0, 'the kicker states a line height');
    assert.ok(
      Math.abs(list.labelHeight - list.kickerLine) < 0.5,
      `the label is ${list.labelHeight}px against the kicker's ${list.kickerLine}px line`
    );
  });

  it("(c) hits a linking row's own button at its centre", async () => {
    for (const [index, row] of (await rowsOf('linking')).entries()) {
      assert.equal(row.hitsOwnButton, true, `linking row ${index}`);
    }
  });

  it('(d) hits no button at the centre of an `opens: false` row, where its linking twin hits one', async () => {
    const optOut = (await rowsOf('optOut'))[2];
    const twin = (await rowsOf('linking'))[2];
    assert.equal(optOut.hitsButton, false, 'the opt-out row is no control');
    assert.equal(twin.hitsOwnButton, true, 'the same row in a linking list is');
  });

  it('(e) holds the detail at the trailing edge', async () => {
    for (const id of ['linking', 'optOut']) {
      for (const [index, row] of (await rowsOf(id)).entries()) {
        assert.ok(
          Math.abs(row.detailRight - row.contentRight) < 0.5,
          `${id} row ${index}: the detail ends at ${row.detailRight}px, the edge is ${row.contentRight}px`
        );
        assert.ok(row.detailShare <= 0.4, `${id} row ${index}: the detail is no 50% column`);
      }
    }
  });

  it('(f) reaches only the linking rows by Tab', async () => {
    const expected = await tab.evaluate(() =>
      [...document.querySelectorAll('button')].map(
        (button) => `${button.closest('[data-case]').dataset.case}:${button.textContent.trim()}`
      )
    );
    assert.equal(expected.length, 5, 'three linking rows and two of the opt-out list');
    await tab.evaluate(() => document.activeElement?.blur());
    const reached = [];
    for (let step = 0; step <= expected.length; step += 1) {
      await tab.keyboard.press('Tab');
      reached.push(
        await tab.evaluate(() => {
          const active = document.activeElement;
          const caseId = active?.closest('[data-case]')?.dataset.case;
          return caseId ? `${caseId}:${active.textContent.trim()}` : null;
        })
      );
    }
    assert.deepEqual(reached, [...expected, null], 'each linking row once, then out of the page');
  });
});
