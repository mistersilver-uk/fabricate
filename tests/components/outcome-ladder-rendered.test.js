/**
 * Issue 2257 D19: OutcomeLadder's yield chips in a 240px column, measured in Chromium: every chip
 * stays inside its tier, a choice group keeps its whole name while its members wrap at whitespace,
 * a long item name ellipsizes with its full name as its title, and a one-line chip is 24px tall.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import {
  createMountedComponentHarness,
  OUTCOME_LADDER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const SCOPED = ['OutcomeLadder', 'Kicker', 'Medallion', 'Chip'];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-outcome-ladder-rendered-',
  compiledModules: SCOPED.map(component),
  rawModules: OUTCOME_LADDER_RAW_MODULES,
  componentPath: component('OutcomeLadder'),
});

const COLUMN = 240;
const LONG_NAME = 'Masterwork Runeblade of the Ashfall Forge-Hall, Inscribed';
const GROUP_NAME = 'Choose one reagent';
const MEMBERS = [
  'Binding Chalk of the Hollow Ridge',
  'Rune Bar of Tempered Starsilver',
  'Moonlit Quicksilver Draught',
  'Ember-Kissed Salamander Scale',
].join(' · ');

const TIERS = [
  {
    id: 'fine',
    name: 'Fine',
    band: '14–19',
    yields: [
      { id: 'long', name: LONG_NAME, icon: 'fas fa-khanda', quantity: '×1' },
      { id: 'group', name: GROUP_NAME, icon: 'fas fa-list', detail: MEMBERS },
      { id: 'short', name: 'Iron Nodule', icon: 'fas fa-hammer', quantity: '×2' },
    ].map((item) => ({ ...item, props: { 'data-yield-id': item.id } })),
  },
];

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
let chips;

/** Each chip's box, its parts' overflow, and its detail's line breaks, read in the page. */
function measureChips() {
  return tab.evaluate(() => {
    const box = (element) => {
      const { top, bottom, left, right, height } = element.getBoundingClientRect();
      return { top, bottom, left, right, height };
    };
    const part = (element) =>
      element && {
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        title: element.getAttribute('title'),
      };
    // Each line break between two visible characters: the pair, and whether whitespace or a
    // hyphen, the line-break opportunities a word keeps, separates them.
    const breaks = (element) => {
      const text = element?.firstChild;
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
        if (top <= above + 1) return [];
        const pair = text.data.slice(previous, index + 1);
        return [{ pair, atBoundary: index > previous + 1 || pair.startsWith('-') }];
      });
    };
    // The yields' content box: a chip may not run into the padding either.
    const list = document.querySelector('.fab-outcome-yields');
    const { paddingLeft, paddingRight } = getComputedStyle(list);
    const yields = box(list);
    yields.left += parseFloat(paddingLeft);
    yields.right -= parseFloat(paddingRight);
    return Object.fromEntries(
      [...document.querySelectorAll('[data-outcome-yield]')].map((chip) => [
        chip.dataset.yieldId,
        {
          box: box(chip),
          yields,
          name: part(chip.querySelector('.fab-outcome-yield-name')),
          detailBreaks: breaks(chip.querySelector('.fab-outcome-yield-detail')),
        },
      ])
    );
  });
}

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await harness.setup();
  let markup;
  try {
    markup = (await harness.mount({ tiers: TIERS })).innerHTML;
  } finally {
    harness.teardown();
  }
  await tab.setContent(page(markup), { waitUntil: 'load' });
  chips = await measureChips();
});

after(async () => {
  await browser?.close();
});

describe('OutcomeLadder yield chips at 240px, rendered (issue 2257 D19)', () => {
  it('keeps every chip inside its tier', () => {
    assert.deepEqual(Object.keys(chips), ['long', 'group', 'short']);
    for (const [id, { box, yields }] of Object.entries(chips)) {
      assert.ok(
        box.left >= yields.left - 0.5 && box.right <= yields.right + 0.5,
        `${id}: ${box.left}–${box.right}px left the ${yields.left}–${yields.right}px yields`
      );
    }
  });

  it("keeps a group's whole name and wraps its members at whitespace", () => {
    const { name, detailBreaks } = chips.group;
    assert.ok(
      name.scrollWidth <= name.clientWidth,
      `the group's name is cut to ${name.clientWidth} of ${name.scrollWidth}px`
    );
    assert.ok(detailBreaks.length > 0, "the group's members span more than one line");
    assert.deepEqual(
      detailBreaks.filter((line) => !line.atBoundary),
      [],
      "the group's members break inside a word"
    );
  });

  it("ellipsizes a long item name and titles the chip's name with it in full", () => {
    const { name } = chips.long;
    assert.ok(name.scrollWidth > name.clientWidth, 'the long name is not cut');
    assert.equal(name.title, LONG_NAME);
  });

  it('draws a one-line chip at least 24px tall', () => {
    assert.ok(chips.short.box.height >= 24, `the chip is ${chips.short.box.height}px tall`);
  });
});
