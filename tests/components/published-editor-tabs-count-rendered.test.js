/**
 * Issue 2896: a published `EditorTabs` tab's `count`, laid under the module sheet in Chromium. The
 * real strip is mounted with the published keys alone and tabs carrying counts, then read for its
 * accessibility tree, the mark's ink on the selected, an unselected and a hovered tab over the
 * strip's four admitted grounds in all seven palettes, and forced colours.
 * Limit: happy-dom only produces the markup; no real screen reader or live Foundry reads it.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { APP_LOCALIZER_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { contrast, themePalettes } from '../helpers/themePaletteContrast.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const PALETTES = [...themePalettes(rulesIn(collectStyleCorpus()['styles/fabricate.css'])).keys()];
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const TABS = Object.freeze([
  { id: 'factions', label: 'Factions', icon: 'fas fa-flag', count: 2 },
  { id: 'journal', label: 'Journal', count: 1250 },
  { id: 'notes', label: 'Notes' },
]);

let browser;
let page;
let markup;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-published-editor-tabs-count-',
    rawModules: APP_LOCALIZER_RAW_MODULES,
    compiledModules: [component('Chip'), component('EditorTabs')],
    componentPath: component('EditorTabs'),
  });
  await harness.setup();
  try {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'factions',
      ariaLabel: 'Player sections',
      idStem: 'acme-player',
      onSelect: () => {},
    });
    markup = root.innerHTML;
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route(/^https?:/u, (route) => route.abort());
});

after(async () => {
  await browser?.close();
});

/** One strip on `--fab-bg-1`, for the tree and forced colours. */
const single = () =>
  page.setContent(
    `${renderedPageHead(['Chip', 'EditorTabs'])}<body class="game"><div class="fabricate" style="background:var(--fab-bg-1);padding:12px;width:600px">${markup}</div></body></html>`
  );

/** The strip on each admitted ground of each palette, each copy addressed by `data-ground`. */
const grid = () =>
  page.setContent(
    `${renderedPageHead(['Chip', 'EditorTabs'])}<body class="game">${PALETTES.map(
      (palette) =>
        `<div class="fabricate" data-fabricate-theme="${palette}">${GROUNDS.map(
          (ground) =>
            `<div data-ground="${palette} ${ground}" style="background:var(${ground});padding:8px;width:600px">${markup}<span data-probe style="color:var(--fab-text-muted)"></span></div>`
        ).join('')}</div>`
    ).join('')}</body></html>`
  );

/** `rgb(r, g, b)` or `rgba(r, g, b, a)` as the space-separated form the palette reader takes. */
const spaced = (computed) => {
  const [r, g, b, a] = computed.match(/[\d.]+/gu).map(Number);
  return a === undefined ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a * 100}%)`;
};

describe('a published tab’s count in Chromium’s accessibility tree', () => {
  it('names the tab "<label>, <count>" and keeps one tab with its selected state, in an unchanged tablist', async () => {
    await single();
    const factions = page.getByRole('tab', { name: 'Factions, 2', exact: true });
    assert.equal(await factions.count(), 1);
    assert.equal(await factions.getAttribute('aria-selected'), 'true');
    assert.equal(await factions.getAttribute('tabindex'), '0');
    assert.equal(
      await page.getByRole('tablist', { name: 'Player sections' }).ariaSnapshot(),
      [
        '- tablist "Player sections":',
        '  - tab "Factions, 2" [selected]: Factions',
        '  - tab "Journal, 1250": Journal',
        '  - tab "Notes"',
      ].join('\n')
    );
    const client = await page.context().newCDPSession(page);
    const { nodes } = await client.send('Accessibility.getFullAXTree');
    const exposed = nodes.filter((node) => !node.ignored);
    const tabs = exposed.filter((node) => node.role?.value === 'tab');
    assert.deepEqual(
      tabs.map((node) => node.name?.value),
      ['Factions, 2', 'Journal, 1250', 'Notes']
    );
    const texts = exposed
      .filter((node) => node.role?.value === 'StaticText')
      .map((node) => node.name?.value);
    assert.ok(!texts.includes('2') && !texts.includes('1250'), 'the hidden mark is not read again');
  });
});

describe('a published tab’s count ink', () => {
  it('draws the muted ink at 4.5:1 or more on the selected, an unselected and a hovered tab, on the four grounds in every palette', async (t) => {
    await grid();
    const readings = [];
    for (const palette of PALETTES) {
      for (const ground of GROUNDS) {
        const copy = page.locator(`[data-ground="${palette} ${ground}"]`);
        const read = (id) =>
          copy.locator(`#acme-player-tab-${id} .manager-editor-tab-count`).evaluate((mark) => {
            const host = mark.closest('[data-ground]');
            return {
              ink: getComputedStyle(mark).color,
              muted: getComputedStyle(host.querySelector('[data-probe]')).color,
              ground: getComputedStyle(host).backgroundColor,
              tab: getComputedStyle(mark.closest('[role="tab"]')).backgroundColor,
            };
          });
        const rest = { selected: await read('factions'), unselected: await read('journal') };
        await copy.locator('#acme-player-tab-journal').hover();
        const hovered = await read('journal');
        await copy.locator('#acme-player-tab-factions').hover();
        const selectedHovered = await read('factions');
        await page.mouse.move(0, 0);
        for (const [state, reading] of Object.entries({
          ...rest,
          hovered,
          'selected, hovered': selectedHovered,
        })) {
          const where = `${palette} on ${ground}, ${state}`;
          assert.equal(reading.ink, reading.muted, `${where}: the muted ink`);
          assert.equal(reading.tab, 'rgba(0, 0, 0, 0)', `${where}: the tab paints no ground`);
          readings.push([where, contrast(spaced(reading.ink), spaced(reading.ground))]);
        }
      }
    }
    assert.equal(readings.length, PALETTES.length * GROUNDS.length * 4);
    assert.equal(PALETTES.length, 7);
    for (const palette of PALETTES) {
      const own = readings.filter(([where]) => where.startsWith(`${palette} `));
      const [where, ratio] = own.reduce((low, next) => (next[1] < low[1] ? next : low));
      t.diagnostic(`lowest: ${where} ${ratio.toFixed(2)}:1`);
    }
    const short = readings.filter(([, ratio]) => ratio < 4.5);
    assert.deepEqual(
      short.map(([where, ratio]) => `${where} ${ratio.toFixed(2)}:1`),
      [],
      'every reading clears 4.5:1'
    );
  });
});

describe('a published tab’s count under forced colours', () => {
  before(() => page.emulateMedia({ forcedColors: 'active' }));
  after(() => page.emulateMedia({ forcedColors: 'none' }));

  it('stays drawn in system ink, and the selected tab is told apart without it', async () => {
    await single();
    const read = (id) =>
      page.locator(`#acme-player-tab-${id}`).evaluate((tab) => {
        const mark = tab.querySelector('.manager-editor-tab-count');
        const style = getComputedStyle(tab);
        return {
          mark: mark
            ? {
                ink: getComputedStyle(mark).color,
                width: mark.getBoundingClientRect().width,
                visibility: getComputedStyle(mark).visibility,
              }
            : null,
          weight: style.fontWeight,
          underline: style.borderBottomColor,
          canvas: getComputedStyle(tab.closest('.fabricate')).backgroundColor,
        };
      });
    const [selected, unselected, plain] = [
      await read('factions'),
      await read('journal'),
      await read('notes'),
    ];
    for (const { mark, canvas } of [selected, unselected]) {
      assert.ok(mark.width > 0, 'the numeral has a box');
      assert.equal(mark.visibility, 'visible');
      assert.ok(contrast(spaced(mark.ink), spaced(canvas)) >= 4.5, 'system ink on the canvas');
    }
    assert.equal(plain.mark, null);
    assert.deepEqual(
      [selected.weight, unselected.weight, plain.weight],
      ['600', '500', '500'],
      'the selected tab keeps its weight, a cue the count does not carry'
    );
  });
});
