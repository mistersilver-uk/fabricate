/**
 * The Alchemy rows in Chromium (issues 675, 1778), drawn from the real view's markup with ListRow's
 * sheet and the Medallion's own styles, under Foundry's fixed button height: a known recipe's name
 * renders whole beside a long signature and clips from the right when it is itself too long, every
 * row and card grows its button to hold its content, and a disabled component row drops its grab.
 * A live mount (`tests/fixtures/alchemy-rows/`) presses real keys on the rows.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  ALCHEMY_VIEW_HARNESS,
  alchemyServices,
  fakeAlchemyStore,
} from '../helpers/alchemyViewFixtures.js';
import { borrowBrowser } from '../helpers/layout-harness.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const SCOPED = [
  'apps/alchemy/AlchemyView',
  'apps/alchemy/KnownRecipesColumn',
  'apps/alchemy/ComponentInventoryColumn',
  'apps/alchemy/AlchemyDisciplineChooser',
  'apps/alchemy/EssenceChips',
  'components/Medallion',
].map((name) => `src/ui/svelte/${name}.svelte`);

// The Bug-1 string (raw essence ids) and the resolved string the fix produces.
const RAW_IDS = ['c6b220a6-8111-47ea-a4d7-7af2264e7fef', 'a1310622-8fc8-48a9-8bc0-d19c0857af02'];
const signature = (...parts) => [
  {
    setId: 'set',
    essences: [],
    groups: parts.map(([name, quantity]) => ({ options: [{ name, quantity }] })),
  },
];
const recipe = (id, name, signatureSummary, result = null) => ({
  id,
  name,
  img: null,
  result,
  signatureSummary,
});
const essence = (id, quantity) => ({ id, name: id, icon: 'fas fa-fire', quantity });

const WORKBENCH = {
  knownRecipes: [
    recipe('raw', 'Blade Venom', signature([RAW_IDS[0], 1], [RAW_IDS[1], 1])),
    recipe('short', 'Blade Venom', signature(['Toxic', 2], ['Water', 1])),
    recipe('long', 'Supercalifragilistic Elixir of Everlasting Vitality', signature(['Toxic', 2])),
    recipe('tonic', 'Ember Tonic', signature(['Emberroot', 1]), {
      name: 'Ember Tonic',
      quantity: 1,
    }),
  ],
  knownCount: 4,
  selectedRecipeId: 'tonic',
  components: [
    {
      componentId: 'emberroot',
      name: 'Emberroot',
      img: null,
      available: 2,
      held: 2,
      essences: ['fire', 'water', 'earth', 'air'].map((id) => essence(id, 2)),
      disabled: false,
    },
    { componentId: 'ashbloom', name: 'Ashbloom', img: null, available: 0, held: 1, disabled: true },
  ],
  hasOwnedComponents: true,
};
const CHOOSER = {
  needsChooser: true,
  systems: [
    {
      id: 'sys-a',
      name: 'Herbalism',
      knownCount: 1,
      totalCount: 4,
      description: 'Roots, leaves and the patience to steep them: a discipline of slow tonics.',
    },
    { id: 'sys-b', name: 'Poisoncraft', knownCount: 0, totalCount: 2 },
  ],
};

/** Core first, with Foundry's fixed button height in its own layer; the module sheet in `layer(modules)`. */
const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}
@layer blocks{button{height:28px;overflow:hidden}}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
<style>${SCOPED.map((path) => scopedComponentCss(resolve(repoRoot, path)).css).join('\n')}</style>
<style>:root{--font-primary:Arial,sans-serif}.win{width:1024px;height:600px}</style>
</head><body class="game"><div class="application theme-dark"><section class="window-content">
  <div class="fabricate fabricate-app" data-fabricate-theme="dark">
    <div class="win" data-case="workbench">${markup.workbench}</div>
    <div class="win" data-case="chooser">${markup.chooser}</div>
  </div>
</section></div></body></html>`;

let browser;
let tab;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-alchemy-rows-rendered-',
    ...ALCHEMY_VIEW_HARNESS,
  });
  const markup = {};
  await harness.setup();
  try {
    for (const [key, state] of Object.entries({ workbench: WORKBENCH, chooser: CHOOSER })) {
      const services = alchemyServices(fakeAlchemyStore(state));
      markup[key] = (await harness.mount({ services })).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await borrowBrowser();
  tab = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/** A known recipe's name, signature and list, by its `data-alchemy-recipe`. */
const measureRecipe = (id) =>
  tab.evaluate((recipeId) => {
    const control = document.querySelector(
      `[data-case="workbench"] [data-alchemy-recipe="${recipeId}"]`
    );
    const box = (node) => ({
      left: Math.round(node.getBoundingClientRect().left),
      scrollW: node.scrollWidth,
      clientW: node.clientWidth,
    });
    const name = control.querySelector('.alchemy-recipe-name');
    const sig = control.querySelector('.alchemy-recipe-sig');
    const { overflow, textOverflow } = getComputedStyle(name);
    return {
      name: { ...box(name), overflow, textOverflow },
      sig: { ...box(sig), textOverflow: getComputedStyle(sig).textOverflow },
      list: box(control.closest('.alchemy-known-list')),
    };
  }, id);

describe('Alchemy rows, rendered (issues 675, 1778)', () => {
  it('renders a recipe name whole beside a long raw-essence-id signature, which alone clips', async () => {
    const raw = await measureRecipe('raw');
    const short = await measureRecipe('short');
    assert.ok(raw.name.clientW > 0, 'the name measured nothing');
    assert.equal(raw.name.scrollW, raw.name.clientW, 'the name renders whole beside the raw ids');
    assert.ok(raw.sig.scrollW > raw.sig.clientW, 'the raw-id signature overflows its line');
    assert.equal(raw.sig.textOverflow, 'ellipsis', 'and clips with an ellipsis');
    assert.equal(short.sig.scrollW, short.sig.clientW, 'the resolved signature fits');
    assert.equal(raw.list.scrollW, raw.list.clientW, 'the list never scrolls sideways');
  });

  it('clips a long recipe name from the right with an ellipsis, at a stable left edge and width', async () => {
    const short = await measureRecipe('short');
    const long = await measureRecipe('long');
    assert.ok(long.name.scrollW > long.name.clientW, 'a long name overflows and is clipped');
    assert.deepEqual([long.name.overflow, long.name.textOverflow], ['hidden', 'ellipsis']);
    assert.equal(long.name.left, short.name.left, 'the name stays left-anchored');
    assert.equal(long.name.clientW, short.name.clientW, 'the name column keeps its width');
  });

  it("grows every row's and card's button past Foundry's fixed button height to hold its content", async () => {
    const controls = await tab.evaluate(() =>
      [
        '[data-case="workbench"] [data-alchemy-recipe="tonic"]',
        '[data-case="workbench"] [data-alchemy-inventory-row="emberroot"]',
        '[data-case="chooser"] [data-alchemy-chooser-card="sys-a"]',
      ].map((selector) => {
        const box = (element) => {
          const { left, top, right, bottom } = element.getBoundingClientRect();
          return { left, top, right, bottom };
        };
        const button = document.querySelector(selector);
        return {
          selector,
          height: button.getBoundingClientRect().height,
          button: box(button),
          children: [...button.children].map(box),
        };
      })
    );
    const within = (inner, outer) =>
      ['left', 'top'].every((side) => inner[side] >= outer[side] - 0.01) &&
      ['right', 'bottom'].every((side) => inner[side] <= outer[side] + 0.01);
    for (const { selector, height, button, children } of controls) {
      assert.ok(height > 40, `${selector} is ${height}px, so Foundry's 28px clips it`);
      assert.equal(children.length, 2, `${selector} holds its mark and its body`);
      for (const child of children) {
        assert.ok(within(child, button), `${selector}: ${JSON.stringify(child)} leaves the button`);
      }
    }
  });

  it('opens each row from its padding, and keeps a focused row inside its scrolling list', async () => {
    const hits = await tab.evaluate(() =>
      [
        '[data-case="workbench"] [data-alchemy-recipe="raw"]',
        '[data-case="workbench"] [data-alchemy-inventory-row="emberroot"]',
        '[data-case="chooser"] [data-alchemy-chooser-card="sys-b"]',
      ].map((selector) => {
        const control = document.querySelector(selector);
        const row = control.parentElement.getBoundingClientRect();
        const hit = document.elementFromPoint(row.left + 3, row.top + 3);
        return hit === control || control.contains(hit);
      })
    );
    assert.deepEqual(hits, [true, true, true], 'a click on the padding reaches the button');

    await tab.keyboard.press('Tab');
    const rows = [];
    for (const selector of [
      '[data-alchemy-recipe="raw"]',
      '[data-alchemy-inventory-row="emberroot"]',
    ]) {
      await tab.focus(`[data-case="workbench"] ${selector}`);
      rows.push(
        await tab.evaluate((focused) => {
          const control = document.querySelector(`[data-case="workbench"] ${focused}`);
          const list = control.closest('ul');
          const row = control.parentElement.getBoundingClientRect();
          const clip = list.getBoundingClientRect();
          const left = clip.left + list.clientLeft;
          return {
            focusVisible: control.matches(':focus-visible'),
            ring: getComputedStyle(control, '::after').outlineStyle,
            inside: row.left >= left - 0.01 && row.right <= left + list.clientWidth + 0.01,
          };
        }, selector)
      );
    }
    assert.deepEqual(
      rows,
      [
        { focusVisible: true, ring: 'solid', inside: true },
        { focusVisible: true, ring: 'solid', inside: true },
      ],
      "each focused row rings, and the list's sideways clip leaves the row whole"
    );
  });

  it('drops the grab cursor from a disabled component row, which fades', async () => {
    const rows = await tab.evaluate(() =>
      ['emberroot', 'ashbloom'].map((id) => {
        const control = document.querySelector(`[data-alchemy-inventory-row="${id}"]`);
        return {
          grip: getComputedStyle(control.querySelector('.alchemy-inventory-grip')).cursor,
          faded: Number(getComputedStyle(control.parentElement).opacity) < 1,
        };
      })
    );
    assert.deepEqual(rows, [
      { grip: 'grab', faded: false },
      { grip: 'default', faded: true },
    ]);
  });
});

describe('Alchemy rows, live under real keys (issue 1778)', () => {
  const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@alchemy-rows-styles/' });
  let live;

  before(async () => {
    await fixtureServer.start();
    live = await fixtureServer.newPage({ viewport: { width: 800, height: 1200 } });
    await live.goto(fixtureServer.url('/tests/fixtures/alchemy-rows/index.html'));
    await live.waitForFunction(() => document.documentElement.dataset.alchemyRowsReady);
  });

  after(async () => {
    await fixtureServer.stop();
  });

  const recorded = () =>
    live.evaluate(() => {
      const { selected, added, chosen } = document.documentElement.dataset;
      return { selected, added, chosen };
    });
  const focused = () =>
    live.evaluate(() => {
      const { alchemyRecipe, alchemyInventoryRow, alchemyChooserCard } =
        document.activeElement.dataset;
      return alchemyRecipe ?? alchemyInventoryRow ?? alchemyChooserCard ?? null;
    });

  it('selects a known recipe with Enter and with Space', async () => {
    await live.focus('[data-alchemy-recipe="venom"]');
    await live.keyboard.press('Enter');
    await live.keyboard.press('Space');
    assert.equal((await recorded()).selected, 'venom venom');
  });

  it('adds a component with Space and with Enter, and Tab passes over a disabled one', async () => {
    await live.focus('[data-alchemy-inventory-row="emberroot"]');
    await live.keyboard.press('Space');
    await live.keyboard.press('Tab');
    assert.equal(await focused(), 'nettle', 'the unavailable Ashbloom takes no Tab stop');
    await live.keyboard.press('Enter');
    assert.equal((await recorded()).added, 'emberroot nettle');
  });

  it('enters a discipline with Enter', async () => {
    await live.focus('[data-alchemy-chooser-card="sys-b"]');
    await live.keyboard.press('Enter');
    assert.equal((await recorded()).chosen, 'sys-b');
  });
});
