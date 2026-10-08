/**
 * Issue 1778 — inventory cards in Chromium, drawn from the real card's markup in the real grid
 * track under Foundry's fixed button height: each card's button grows to hold its square thumbnail
 * and its one-line name, every card stands the same height, a press anywhere opens the card, and
 * the pressed fill and edge, the broken ground and the ring are ListRow's. A live mount
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
    const cards = await cardsOf('bulk');
    assert.deepEqual(
      Object.fromEntries(cards.map(({ key, overlays }) => [key, overlays.length])),
      { 'sys:gland': 3, 'sys:jig': 4, 'sys:ingot': 2 },
      'the quantity or Broken pip, the badges and the chips, and the check on a bulk-selected card'
    );
    for (const { key, control, thumb, overlays } of cards) {
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

  it('keeps a long name to one ellipsized line, whole in its title and its name, so every card stands even', async () => {
    const cards = await cardsOf('inspect');
    const firstRow = cards.filter(({ root }) => Math.abs(root.top - cards[0].root.top) < 0.5);
    assert.equal(firstRow.length, 3, 'a 432px grid holds three 120px tracks');
    assert.equal(
      new Set(cards.map(({ root }) => Math.round(root.height * 10) / 10)).size,
      1,
      'the long name’s row stands as tall as the short names’ row'
    );
    for (const { key, name } of cards) assert.ok(!name.clipped, `${key}: its name is clipped`);
    const jig = await tab.evaluate(() => {
      const control = document.querySelector(
        '[data-case="inspect"] [data-inventory-card="sys:jig"] .inventory-card-button'
      );
      const label = control.querySelector('.inventory-card-name');
      const style = getComputedStyle(label);
      return {
        cut: label.scrollWidth > label.clientWidth,
        oneLine: label.getBoundingClientRect().height < 2 * Number.parseFloat(style.fontSize),
        flow: [style.textOverflow, style.whiteSpace, style.minWidth],
        title: label.getAttribute('title'),
        accessibleName: control.getAttribute('aria-label'),
      };
    });
    assert.ok(jig.cut, 'the long name outruns its card, so the ellipsis is drawn');
    assert.deepEqual(jig.flow, ['ellipsis', 'nowrap', '0px']);
    assert.ok(jig.oneLine, 'on one line');
    assert.equal(jig.title, "Masterwork Armorer's Jig of the Deep Seam");
    assert.ok(jig.accessibleName.startsWith(`${jig.title}, `), jig.accessibleName);
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

  /** Each token's computed value for `property`, and each card's paint, by grid and key. */
  const paintOf = () =>
    tab.evaluate(() => {
      const resolved = (property, value) => {
        const probe = document.createElement('div');
        probe.style.setProperty(property, value);
        document.querySelector('.fabricate-app').append(probe);
        const out = getComputedStyle(probe).getPropertyValue(property);
        probe.remove();
        return out;
      };
      const cards = {};
      for (const root of document.querySelectorAll('[data-case] [data-inventory-card]')) {
        const style = getComputedStyle(root);
        cards[`${root.closest('[data-case]').dataset.case} ${root.dataset.inventoryCard}`] = {
          edge: style.borderTopColor,
          fill: style.backgroundColor,
          ring: style.boxShadow,
        };
      }
      return {
        accent: resolved('border-top-color', 'var(--fab-accent-border)'),
        border: resolved('border-top-color', 'var(--fab-border)'),
        active: resolved('background-color', 'var(--fab-surface-active)'),
        raised: resolved('background-color', 'var(--fab-surface-raised)'),
        ground: resolved('background-color', 'var(--fab-bg-2)'),
        dangerSoft: resolved('background-color', 'var(--fab-danger-soft)'),
        cards,
      };
    });

  it('draws the pressed fill and edge, the broken ground and the focus ring through ListRow', async () => {
    const paint = await paintOf();
    const { cards } = paint;
    assert.notEqual(paint.accent, paint.border, 'NON-VACUITY: the two edges differ');
    assert.notEqual(paint.active, paint.ground, 'NON-VACUITY: the two fills differ');
    assert.deepEqual(
      ['inspect sys:gland', 'inspect sys:ingot', 'bulk sys:ingot', 'bulk sys:gland'].map((key) => [
        cards[key].edge,
        cards[key].fill,
      ]),
      [
        [paint.accent, paint.active],
        [paint.border, paint.ground],
        [paint.accent, paint.active],
        [paint.border, paint.ground],
      ],
      'the fill and the accent edge mark the pressed card alone: the inspected one, or each bulk-selected one'
    );
    assert.equal(
      cards['inspect sys:jig'].fill,
      paint.dangerSoft,
      'a broken card keeps the danger ground'
    );
    const pressedBroken = cards['bulk sys:jig'];
    assert.equal(pressedBroken.fill, paint.dangerSoft, 'and keeps it when pressed, with no fill');
    assert.match(pressedBroken.ring, /inset/u, 'taking the inset ring instead');

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

  it('lights a resting card on hover, and leaves a pressed card its fill', async () => {
    const hovered = async (key) => {
      await tab.hover(
        `[data-case="inspect"] [data-inventory-card="${key}"] .inventory-card-button`
      );
      return (await paintOf()).cards[`inspect ${key}`].fill;
    };
    const { active, raised } = await paintOf();
    assert.equal(await hovered('sys:ingot'), raised, 'POSITIVE CONTROL: the hover fill');
    assert.equal(await hovered('sys:gland'), active, 'the pressed fill outlasts the hover');
    await tab.mouse.move(0, 0);
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
