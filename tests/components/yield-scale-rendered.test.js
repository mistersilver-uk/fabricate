/**
 * Issue 2257 D15: YieldScale's sentence-under-name rows at the gathering column's 274px, measured
 * in Chromium with long names: each row is one flex line, a line breaks only at whitespace unless a
 * word is wider than the column, and the reading sits under the name.
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
const SCOPED = ['YieldScale', 'Medallion', 'Chip', 'Kicker'];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-yield-scale-rendered-',
  compiledModules: ['YieldScale', 'ListRow', 'Medallion', 'Chip', 'Kicker'].map(component),
  componentPath: component('YieldScale'),
});

/** The column's own width, and the word no 274px row can hold. */
const COLUMN = 274;
const UNBROKEN = 'Unquarriedgreyfellbasaltslabofthedeepnorthernseam';

const ENTRIES = [
  {
    id: 'long',
    name: 'Prismatic Starsilver Filigree Shard of the Hollow Ridge',
    qty: 12,
    chance: 7,
  },
  { id: 'sure', name: 'Greyfell Scree', qty: 3, chance: 100 },
  { id: 'never', name: 'Skyfall Shard Embedded in Ancient Meteoric Glass', qty: 1, chance: 0 },
  { id: 'unbroken', name: UNBROKEN, qty: 2, chance: 45 },
];
const LABELS = {
  threshold: (entry) =>
    `Effective roll ${101 - entry.chance} or higher, before the task's modifier and any bonus`,
  quantity: (entry) => `×${entry.qty}`,
  chance: (entry) => `${entry.chance}%`,
};

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
<style>${SCOPED.map((name) => scopedComponentCss(resolve(repoRoot, component(name))).css).join('\n')}</style>
<style>:root{--font-primary:Arial,sans-serif}</style>
</head><body class="game"><div class="fabricate fabricate-app">
  <div data-column style="width:${COLUMN}px">${markup}</div>
</div></body></html>`;

let browser;
let tab;

async function render(props) {
  await harness.setup();
  let markup;
  try {
    markup = (await harness.mount(props)).innerHTML;
  } finally {
    harness.teardown();
  }
  await tab.setContent(page(markup), { waitUntil: 'load' });
}

/** Each row's flex children and text lines, read in the page. */
function measureRows() {
  return tab.evaluate(() => {
    const box = (element) => {
      const { top, bottom, left, right } = element.getBoundingClientRect();
      return { top, bottom, left, right };
    };
    // Each line break between two visible characters, and whether whitespace separates them.
    const breaks = (element) => {
      const text = element.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) return [];
      const range = document.createRange();
      const tops = [];
      for (let index = 0; index < text.data.length; index += 1) {
        if (/\s/u.test(text.data[index])) continue;
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        tops.push([index, range.getBoundingClientRect().top]);
      }
      return tops.slice(1).flatMap(([index, top], at) => {
        const [previous, above] = tops[at];
        return top > above + 1 ? [{ atWhitespace: index > previous + 1, word: text.data }] : [];
      });
    };
    return [...document.querySelectorAll('[data-yield-entry]')].map((entry) => {
      const row = entry.querySelector('.fabricate-list-row');
      const part = (selector) => row.querySelector(selector);
      return {
        id: entry.dataset.yieldEntry,
        row: box(row),
        overflow: row.scrollWidth - row.clientWidth,
        body: box(part('.fabricate-list-row-body')),
        name: box(part('.fabricate-list-row-name')),
        reading: box(part('[data-yield-reading]')),
        figures: [
          '.fabricate-list-row-leading',
          '.fabricate-list-row-quantity',
          '.fabricate-list-row-trailing',
        ].map((selector) => box(part(selector))),
        breaks: [
          ...breaks(part('.fabricate-list-row-name')),
          ...breaks(part('[data-yield-reading]')),
        ],
      };
    });
  });
}

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await render({ entries: ENTRIES, order: 'authored', labels: LABELS });
});

after(async () => {
  await browser?.close();
});

describe('YieldScale rows at 274px, rendered (issue 2257 D15)', () => {
  it('keeps each row one flex line: the mark, quantity and chance sit inside its body', async () => {
    const rows = await measureRows();
    assert.equal(rows.length, ENTRIES.length);
    for (const { id, body, figures } of rows) {
      for (const figure of figures) {
        assert.ok(
          figure.top >= body.top - 0.5 && figure.bottom <= body.bottom + 0.5,
          `${id}: a figure at ${figure.top}–${figure.bottom}px left the ${body.top}–${body.bottom}px line`
        );
      }
    }
  });

  it('breaks a name or a sentence only at whitespace, unless a word is wider than the column', async () => {
    const rows = await measureRows();
    const wrapped = rows.filter(({ breaks }) => breaks.length > 0).map(({ id }) => id);
    assert.ok(wrapped.includes('long') && wrapped.includes('never'), 'the long rows do wrap');
    for (const { id, breaks, overflow } of rows) {
      assert.ok(overflow <= 0, `${id} overflows its row`);
      const inWord = breaks.filter((line) => !line.atWhitespace);
      if (id === 'unbroken') {
        assert.ok(
          inWord.some((line) => line.word === UNBROKEN),
          'a word wider than the column breaks inside itself'
        );
      } else {
        assert.deepEqual(inWord, [], `${id} breaks inside a word`);
      }
    }
  });

  it('sets the reading under the name', async () => {
    for (const { id, name, reading } of await measureRows()) {
      assert.ok(reading.top >= name.bottom - 0.5, `${id}: the reading starts above the name's end`);
    }
  });
});
