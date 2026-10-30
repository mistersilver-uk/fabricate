/**
 * Issue 2850 — the geometry `ListRow` publishes, measured in Chromium: each `markSize` rung's mark
 * and the row height it sets, at the dense row's and the selectable form's inset; the default
 * density's inset; a truncated name ellipsizing on one line in a four-column board; and the card
 * layout's column, which holds its mark above its name inside the card's inset.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-list-row-geometry-rendered-',
  compiledModules: ['Medallion', 'ListRow'].map(component),
  componentPath: component('ListRow'),
});

const open = () => {};
const RUNGS = Object.freeze([22, 26, 28, 30, 34, 38]);
/** Each rung's corner, the art ladder's (`Medallion`'s `RUNG_CORNERS`). */
const CORNERS = Object.freeze({ 22: 6, 26: 7, 28: 7, 30: 7, 34: 9, 38: 9 });
const LONG = 'Forge a Pattern-Welded Blade of the Deep Seam';
const BOARD = 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;width:480px';

/** The inner right edge of a row: its border box less its 12px padding and 1px border. */
const innerRight = (row) => row.right - 12 - 1;
/** A short name's height, which the dense rung cases draw on one line: the one-line reference. */
const oneLine = async () => (await rowsOf('dense-22'))[0].name.height;

/** Each case's rows, keyed by `data-case`; a board case lays its rows out in four columns. */
const CASES = Object.freeze({
  ...Object.fromEntries(
    RUNGS.flatMap((size) => [
      [`dense-${size}`, [{ name: 'Iron ingot', markSize: size }]],
      [`form-${size}`, [{ name: 'Iron ingot', markSize: size, onOpen: open }]],
    ])
  ),
  default: [{ name: 'Moonlit Glade', density: 'default', markSize: 30, onOpen: open }],
  truncated: Array.from({ length: 4 }, () => ({ name: LONG, truncateName: true, markSize: 28 })),
  wrapped: Array.from({ length: 4 }, () => ({ name: LONG, markSize: 28 })),
  cards: Array.from({ length: 4 }, () => ({
    name: LONG,
    detail: 'Recipe',
    layout: 'card',
    truncateName: true,
    markSize: 34,
    onOpen: open,
  })),
});
const BOARDS = new Set(['truncated', 'wrapped', 'cards']);

let browser;
let tab;

before(async () => {
  const hosts = [];
  await harness.setup();
  try {
    for (const [id, rows] of Object.entries(CASES)) {
      const cells = [];
      for (const props of rows) {
        cells.push(`<div>${(await harness.mount(props)).innerHTML}</div>`);
        harness.remount();
      }
      const style = BOARDS.has(id) ? BOARD : 'width:320px';
      hosts.push(`<div data-case="${id}" style="${style}">${cells.join('')}</div>`);
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 2400 } });
  await tab.setContent(
    `${renderedPageHead(['Medallion'])}<body class="game">` +
      '<style>@layer blocks{button{height:28px;overflow:hidden}}</style>' +
      `<div class="fabricate fabricate-app">${hosts.join('')}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

/** Each row of a case: its box, padding, gap and corner, and its mark's and name's boxes. */
const rowsOf = (caseId) =>
  tab.evaluate((id) => {
    const box = (element) => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    return [...document.querySelectorAll(`[data-case="${id}"] .fabricate-list-row`)].map((row) => {
      const style = getComputedStyle(row);
      const mark = row.querySelector('.fab-medallion');
      const name = row.querySelector('.fabricate-list-row-name');
      const nameStyle = getComputedStyle(name);
      // The text's own extent, which a word that does not wrap carries past the name's box.
      const text = document.createRange();
      text.selectNodeContents(name);
      return {
        row: box(row),
        padding: [style.paddingTop, style.paddingLeft],
        gap: style.columnGap,
        corner: style.borderTopLeftRadius,
        background: style.backgroundColor,
        mark: { ...box(mark), corner: getComputedStyle(mark).borderTopLeftRadius },
        name: {
          ...box(name),
          text: name.textContent,
          textRight: text.getBoundingClientRect().right,
          clipped: name.scrollWidth > name.clientWidth,
          overflow: nameStyle.textOverflow,
          wrap: nameStyle.whiteSpace,
        },
      };
    });
  }, caseId);

describe('ListRow markSize, rendered (issue 2850)', () => {
  for (const size of RUNGS) {
    it(`draws the ${size}px rung at its corner, the row standing the mark plus its inset`, async () => {
      const [dense] = await rowsOf(`dense-${size}`);
      const [form] = await rowsOf(`form-${size}`);
      for (const [label, row, inset] of [
        ['the dense row', dense, 8],
        ['the selectable form', form, 4],
      ]) {
        assert.deepEqual([row.mark.width, row.mark.height], [size, size], `${label}'s mark`);
        assert.equal(row.mark.corner, `${CORNERS[size]}px`, `${label}'s mark corner`);
        assert.ok(
          Math.abs(row.row.height - (size + 2 * inset + 2)) < 0.01,
          `${label} at ${size}px stands ${row.row.height}px, not ${size + 2 * inset + 2}px`
        );
      }
    });
  }
});

describe('ListRow density, rendered (issue 2850)', () => {
  it('insets a default row 12px by 16px with a 12px gap and an 11px corner', async () => {
    const [row] = await rowsOf('default');
    assert.deepEqual([row.padding, row.gap, row.corner], [['12px', '16px'], '12px', '11px']);
    assert.ok(Math.abs(row.row.height - (30 + 24 + 2)) < 0.01, `it stands ${row.row.height}px`);
  });
});

describe('ListRow truncateName in a four-column board, rendered (issue 2850)', () => {
  it('ellipsizes each name on one line inside its cell, keeping its whole text', async () => {
    const rows = await rowsOf('truncated');
    const line = await oneLine();
    assert.equal(rows.length, 4, 'four cells');
    for (const { row, name } of rows) {
      assert.deepEqual([name.overflow, name.wrap, name.clipped], ['ellipsis', 'nowrap', true]);
      assert.ok(
        Math.abs(name.height - line) < 0.5,
        `the name stands ${name.height}px, not ${line}px`
      );
      assert.ok(name.right <= innerRight(row) + 0.01, `the name ends past the row's inset`);
      assert.equal(name.text, LONG);
    }
  });

  it('wraps the same names when the board does not truncate them', async () => {
    const line = await oneLine();
    for (const { row, name } of await rowsOf('wrapped')) {
      assert.ok(
        name.height > 1.5 * line,
        `the name stands ${name.height}px, one line is ${line}px`
      );
      assert.ok(name.textRight <= innerRight(row) + 0.01, 'and its text wraps inside the inset');
    }
  });
});

describe('ListRow layout card, rendered (issue 2850)', () => {
  it('stacks the mark above the name on the card ground at an 11px corner', async () => {
    const cards = await rowsOf('cards');
    const ground = await tab.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.backgroundColor = 'var(--fab-bg-2)';
      document.querySelector('.fabricate-app').append(probe);
      return getComputedStyle(probe).backgroundColor;
    });
    for (const { row, mark, name, padding, corner, background } of cards) {
      assert.deepEqual([mark.width, mark.height], [34, 34]);
      assert.ok(mark.bottom <= name.top + 0.01, 'the mark sits above the name');
      assert.ok(Math.abs(mark.left - (row.left + 1 + 12)) < 0.01, 'at the card’s 12px inset');
      assert.deepEqual([padding, corner, background], [['12px', '12px'], '11px', ground]);
      assert.deepEqual([name.clipped, name.overflow], [true, 'ellipsis'], 'the name ellipsizes');
      assert.ok(name.right <= innerRight(row) + 0.01, 'inside the card’s inset');
    }
  });
});
