/**
 * Issue 1778 — inventory cards in Chromium, drawn from the real card's markup in the real grid
 * track under Foundry's fixed button height: each card's button grows to hold its square thumbnail
 * and its wrapped name, a row of cards matches its tallest, a press anywhere opens the card, and
 * the pressed edge, the broken ground and the ring are ListRow's. A live mount
 * (`tests/fixtures/inventory-cards/`) presses real keys: Shift toggles the bulk selection alone.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { installFixtureI18n } from '../fixtures/select-fixture-shared.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const en = JSON.parse(read('lang/en.json'));
const CARD = 'src/ui/svelte/apps/inventory/InventoryItemCard.svelte';
const GRID = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/inventory/InventoryGrid.svelte')
);

const essence = (id) => ({ id, name: id, icon: 'fas fa-fire' });
const gland = {
  key: 'sys:gland',
  name: 'Mordant Gland',
  isTool: true,
  salvage: { enabled: true },
  totalQuantity: 7,
  essences: ['fire', 'water'].map(essence),
};
const jig = {
  key: 'sys:jig',
  name: "Masterwork Armorer's Jig of the Deep Seam",
  isTool: true,
  broken: true,
  salvage: { enabled: true },
  totalQuantity: 1,
  essences: ['fire', 'water', 'earth', 'air'].map(essence),
};
const fire = { key: 'sys:fire', name: 'Fire', isEssenceSource: true, totalQuantity: 6 };
const ingot = { key: 'sys:ingot', name: 'Bronze Ingot', totalQuantity: 3 };

/** Each grid's cards, as the props the real grid hands them. */
const GRIDS = {
  inspect: [{ item: gland, selected: true }, { item: jig }, { item: fire }, { item: ingot }],
  bulk: [
    { item: gland, bulkActive: true },
    { item: jig, bulkActive: true, bulkSelected: true },
    { item: ingot, bulkActive: true, bulkSelected: true },
  ],
};

/** Core first, with Foundry's fixed button height in its own layer; the module sheet in `layer(modules)`. */
const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}
@layer blocks{button{height:28px;overflow:hidden}}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
<style>${scopedComponentCss(resolve(repoRoot, CARD)).css}\n${GRID.css}</style>
<style>:root{--font-primary:Arial,sans-serif}</style>
</head><body class="game"><div class="fabricate fabricate-app" style="width:1000px">
  ${Object.entries(markup)
    .map(
      ([name, cards]) =>
        `<div data-case="${name}" class="inventory-grid ${GRID.hashClass}" role="list" style="width:432px">${cards}</div>`
    )
    .join('\n')}
</div></body></html>`;

let browser;
let tab;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-inventory-card-rendered-',
    rawModules: [
      ...FOUNDRY_BRIDGE_RAW_MODULES,
      'src/ui/svelte/util/craftingImageDefaults.js',
      'src/ui/svelte/util/essenceTint.js',
    ],
    compiledModules: ['Medallion', 'ListRow']
      .map((name) => `src/ui/svelte/components/${name}.svelte`)
      .concat(CARD),
    componentPath: CARD,
    rootClass: 'fabricate-app',
  });
  const markup = {};
  await harness.setup();
  // The real strings, so the Broken pip measures as it draws.
  installFixtureI18n(en);
  try {
    for (const [name, cards] of Object.entries(GRIDS)) {
      markup[name] = '';
      for (const props of cards) {
        markup[name] += (await harness.mount({ ...props, onSelect: () => {} })).innerHTML;
        harness.remount();
      }
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/** Each card in `grid`: its root, button, thumbnail and name boxes, and what leaves the card. */
const cardsOf = (grid) =>
  tab.evaluate((name) => {
    const box = (node) => {
      const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    return [...document.querySelectorAll(`[data-case="${name}"] [data-inventory-card]`)].map(
      (root) => {
        const control = root.querySelector('.inventory-card-button');
        const thumb = control.querySelector('.inventory-card-thumb');
        const label = control.querySelector('.inventory-card-name');
        const outer = box(root);
        return {
          key: root.dataset.inventoryCard,
          root: outer,
          control: box(control),
          thumb: box(thumb),
          name: { ...box(label), clipped: label.scrollHeight > label.clientHeight + 0.5 },
          overlays: [
            ...thumb.querySelectorAll(
              '[data-inventory-qty], [data-inventory-badges], [data-inventory-pips], [data-inventory-bulk-badge]'
            ),
          ].map(box),
          leaving: [...root.querySelectorAll('*')]
            .filter((node) => {
              const { left, right, bottom, width } = node.getBoundingClientRect();
              return (
                width > 0 &&
                (left < outer.left - 0.5 ||
                  right > outer.right + 0.5 ||
                  bottom > outer.bottom + 0.5)
              );
            })
            .map((node) => node.className),
        };
      }
    );
  }, grid);

/** Whether `inner` lies within `outer`, to a hundredth of a pixel. */
const within = (inner, outer) =>
  ['left', 'top'].every((side) => inner[side] >= outer[side] - 0.01) &&
  ['right', 'bottom'].every((side) => inner[side] <= outer[side] + 0.01);

describe('inventory cards, rendered (issue 1778)', () => {
  it("grows every card's button past Foundry's fixed button height to hold its thumbnail and name", async () => {
    const cards = await cardsOf('inspect');
    assert.equal(cards.length, 4);
    for (const { key, root, control, thumb, name, leaving } of cards) {
      assert.ok(control.height > 28, `${key}: the button is ${control.height}px, so it is clipped`);
      assert.ok(
        within(thumb, control) && within(name, control),
        `${key}: content leaves its button`
      );
      assert.ok(within(control, root), `${key}: the button leaves its card`);
      assert.deepEqual(leaving, [], `${key}: these leave the card`);
    }
  });

  it("draws the thumbnail as a square across the card's width, holding every overlay", async () => {
    for (const { key, control, thumb, overlays } of await cardsOf('bulk')) {
      assert.ok(
        Math.abs(thumb.width - control.width) < 0.5,
        `${key}: ${thumb.width} of ${control.width}`
      );
      assert.ok(Math.abs(thumb.height - thumb.width) < 0.5, `${key}: the thumbnail is not square`);
      assert.ok(overlays.length > 0, `${key}: no overlay was measured`);
      for (const overlay of overlays) {
        assert.ok(
          within(overlay, thumb),
          `${key}: ${JSON.stringify(overlay)} leaves the thumbnail`
        );
      }
    }
  });

  it('wraps a long name whole, and its row of cards takes the tallest card’s height', async () => {
    const cards = await cardsOf('inspect');
    const jigCard = cards.find(({ key }) => key === 'sys:jig');
    assert.ok(jigCard.name.height > 20, 'the long name wraps onto more than one line');
    for (const { key, name } of cards) assert.ok(!name.clipped, `${key}: its name is clipped`);
    const firstRow = cards.filter(({ root }) => Math.abs(root.top - cards[0].root.top) < 0.5);
    assert.equal(firstRow.length, 3, 'a 432px grid holds three 120px tracks');
    assert.deepEqual(
      [...new Set(firstRow.map(({ root }) => Math.round(root.height * 10) / 10))],
      [Math.round(jigCard.root.height * 10) / 10],
      'every card in the row matches the long name’s'
    );
  });

  it('opens a card from anywhere on it, its padding and the space under a short name included', async () => {
    const misses = await tab.evaluate(() =>
      [...document.querySelectorAll('[data-case="inspect"] [data-inventory-card]')].flatMap(
        (root) => {
          const control = root.querySelector('.inventory-card-button');
          const { left, top, right, bottom } = root.getBoundingClientRect();
          return [
            // Inside the 11px corner radius, and inside the space-3 padding.
            [left + 5, top + 5],
            [right - 5, bottom - 5],
            [(left + right) / 2, bottom - 5],
          ]
            .filter(([x, y]) => !control.contains(document.elementFromPoint(x, y)))
            .map(([x, y]) => `${root.dataset.inventoryCard} @ ${x},${y}`);
        }
      )
    );
    assert.deepEqual(misses, [], 'a press there reaches something other than the card’s button');
  });

  it('draws the pressed edge, the broken ground and the focus ring through ListRow', async () => {
    const paint = await tab.evaluate(() => {
      const resolved = (property, value) => {
        const probe = document.createElement('div');
        probe.style.setProperty(property, value);
        document.querySelector('.fabricate-app').append(probe);
        const out = getComputedStyle(probe).getPropertyValue(property);
        probe.remove();
        return out;
      };
      const card = (grid, key) =>
        getComputedStyle(
          document.querySelector(`[data-case="${grid}"] [data-inventory-card="${key}"]`)
        );
      return {
        accent: resolved('border-top-color', 'var(--fab-accent-border)'),
        border: resolved('border-top-color', 'var(--fab-border)'),
        dangerSoft: resolved('background-color', 'var(--fab-danger-soft)'),
        inspected: card('inspect', 'sys:gland').borderTopColor,
        resting: card('inspect', 'sys:ingot').borderTopColor,
        bulk: card('bulk', 'sys:ingot').borderTopColor,
        notBulk: card('bulk', 'sys:gland').borderTopColor,
        brokenGround: card('inspect', 'sys:jig').backgroundColor,
      };
    });
    assert.notEqual(paint.accent, paint.border, 'NON-VACUITY: the two edges differ');
    assert.deepEqual(
      [paint.inspected, paint.resting, paint.bulk, paint.notBulk],
      [paint.accent, paint.border, paint.accent, paint.border],
      'the accent edge marks the pressed card alone: the inspected one, or each bulk-selected one'
    );
    assert.equal(paint.brokenGround, paint.dangerSoft, 'a broken card keeps the danger ground');

    await tab.keyboard.press('Tab');
    await tab.focus(
      '[data-case="inspect"] [data-inventory-card="sys:ingot"] .inventory-card-button'
    );
    const ring = await tab.evaluate(() => {
      const after = getComputedStyle(document.activeElement, '::after');
      return { style: after.outlineStyle, offset: after.outlineOffset, inset: after.inset };
    });
    assert.deepEqual(
      ring,
      { style: 'solid', offset: '-2px', inset: '0px' },
      'the ring sits inside the card'
    );
  });
});

describe('inventory cards, live under real keys (issue 1778)', () => {
  const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@inventory-cards-styles/' });
  let live;

  before(async () => {
    await fixtureServer.start();
    live = await fixtureServer.newPage({ viewport: { width: 800, height: 900 } });
    await live.goto(fixtureServer.url('/tests/fixtures/inventory-cards/index.html'));
    await live.waitForFunction(() => document.documentElement.dataset.inventoryCardsReady);
  });

  after(async () => {
    await fixtureServer.stop();
  });

  const recorded = async () => {
    const { selected, bulk } = await live.evaluate(() => ({ ...document.documentElement.dataset }));
    return { selected, bulk };
  };
  const reset = () =>
    live.evaluate(() => {
      delete document.documentElement.dataset.selected;
      delete document.documentElement.dataset.bulk;
    });
  const card = (key) => `[data-inventory-card="${key}"] .inventory-card-button`;

  it('inspects on Enter and Space, and toggles the bulk selection alone on Shift+Enter and Shift+Space', async () => {
    await reset();
    await live.focus(card('sys:ingot'));
    for (const key of ['Shift+Enter', 'Shift+Space']) await live.keyboard.press(key);
    assert.deepEqual(await recorded(), { selected: undefined, bulk: 'sys:ingot sys:ingot' });
    for (const key of ['Enter', 'Space']) await live.keyboard.press(key);
    assert.deepEqual(await recorded(), {
      selected: 'sys:ingot sys:ingot',
      bulk: 'sys:ingot sys:ingot',
    });
  });

  it('inspects on a click, and toggles the bulk selection alone on a Shift-click', async () => {
    await reset();
    await live.click(card('sys:fire'), { modifiers: ['Shift'] });
    await live.click(card('sys:gland'));
    assert.deepEqual(await recorded(), { selected: 'sys:gland', bulk: 'sys:fire' });
  });

  it('stops Tab once on each card and never on the preview', async () => {
    await live.focus(card('sys:gland'));
    const stops = [];
    for (let press = 0; press < 3; press += 1) {
      await live.keyboard.press('Tab');
      stops.push(
        await live.evaluate(
          () =>
            document.activeElement.closest('[data-inventory-card]')?.dataset.inventoryCard ?? null
        )
      );
    }
    assert.deepEqual(stops, ['sys:ingot', 'sys:fire', null], 'the preview card takes no Tab stop');
  });
});
