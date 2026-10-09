/**
 * Issue 1778 — the crafting browser's recipe row and the ingredient routes in Chromium. Rendered
 * markup under Foundry's fixed button height: the row's button grows to hold its content, a
 * selected uncraftable row draws the accent ring, and the routes are one native radio group. A
 * live mount (`tests/fixtures/crafting-routes/`): real keys choose routes and press row controls.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { chipToneOf } from '../helpers/chipTone.js';
import { recipe } from '../helpers/crafting-fixtures.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import {
  CRAFTING_APP_COMPILED_MODULES,
  CRAFTING_APP_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const ROW = 'src/ui/svelte/apps/crafting/RecipeListRow.svelte';
const ROUTES = 'src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte';
const SCOPED = [
  ROW,
  ...['Medallion', 'Chip', 'Kicker', 'RadioCardGroup'].map(
    (name) => `src/ui/svelte/components/${name}.svelte`
  ),
];

const uncraftable = (selected) => ({
  recipe: recipe({
    id: selected ? 'r-selected' : 'r-resting',
    name: 'Forge a Pattern-Welded Blade of the Deep Seam',
    systemName: 'Karrun Forgecraft',
    category: 'weapons',
    categoryLabel: 'Weaponsmithing',
    browseStatus: 'missingMaterials',
  }),
  selected,
});
const route = (id, label, canCraft) => ({
  id,
  label,
  craftability: { canCraft, toolStates: canCraft ? [] : [{ name: 'Anvil', available: false }] },
  products: [{ name: 'Warding Shield Boss', img: '', qty: 1 }],
});

/** Mounts `componentPath` once per props object and returns each mount's markup. */
async function markupOf(componentPath, propsList) {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-crafting-rows-rendered-',
    rawModules: CRAFTING_APP_RAW_MODULES,
    compiledModules: CRAFTING_APP_COMPILED_MODULES,
    componentPath,
    rootClass: 'fabricate-app',
  });
  await harness.setup();
  try {
    const markup = [];
    for (const props of propsList) {
      markup.push((await harness.mount(props)).innerHTML);
      harness.remount();
    }
    return markup;
  } finally {
    harness.teardown();
  }
}

/** Core first with Foundry's fixed button height in its own layer; the module sheet in `layer(modules)`. */
const page = ({ rows, routes }) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}
@layer blocks{button{height:28px;overflow:hidden}}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
<style>${SCOPED.map((path) => scopedComponentCss(resolve(repoRoot, path)).css).join('\n')}</style>
<style>:root{--font-primary:Arial,sans-serif}</style>
</head><body class="game"><div class="fabricate fabricate-app" style="width:1000px">
  <div data-case="selected" style="width:278px">${rows[0]}</div>
  <div data-case="resting" style="width:278px">${rows[1]}</div>
  <div data-case="wide" style="width:900px">${rows[1]}</div>
  <div data-case="routes" style="width:460px">${routes}</div>
</div></body></html>`;

let browser;
let tab;

before(async () => {
  const rows = await markupOf(ROW, [uncraftable(true), uncraftable(false)]);
  const [routes] = await markupOf(ROUTES, [
    {
      sets: [route('set-a', 'Verdant Warding', true), route('set-b', 'Graveward Binding', false)],
      selectedSetId: 'set-a',
    },
  ]);
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.setContent(page({ rows, routes }), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/** Whether `inner` lies within `outer`, to a hundredth of a pixel. */
const within = (inner, outer) =>
  ['left', 'top'].every((side) => inner[side] >= outer[side] - 0.01) &&
  ['right', 'bottom'].every((side) => inner[side] <= outer[side] + 0.01);

describe('crafting rows, rendered (issue 1778)', () => {
  it("grows a recipe row's button past Foundry's fixed button height to hold its content", async () => {
    const tall = await tab.evaluate(() => {
      const box = (element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const button = document.querySelector('[data-case="selected"] .crafting-recipe-row-main');
      return {
        height: button.getBoundingClientRect().height,
        button: box(button),
        children: [...button.children].map(box),
      };
    });
    assert.ok(tall.height > 28, `the button is ${tall.height}px, so the 38px thumbnail is clipped`);
    assert.equal(tall.children.length, 2, 'the thumbnail and the body');
    for (const child of tall.children) {
      assert.ok(
        within(child, tall.button),
        `${JSON.stringify(child)} leaves the button ${JSON.stringify(tall.button)}`
      );
    }
  });

  it('gives the system name up before the category, and packs the meta left on a wide row', async () => {
    const metas = await tab.evaluate(() =>
      ['resting', 'wide'].map((id) => {
        const box = (selector) =>
          document.querySelector(`[data-case="${id}"] ${selector}`).getBoundingClientRect();
        const system = document.querySelector(`[data-case="${id}"] .crafting-recipe-row-system`);
        // The drawn text's end, not the box's: a box that grows leaves its text short of the gap.
        const text = document.createRange();
        text.selectNodeContents(system);
        return {
          meta: box('.crafting-recipe-row-meta').width,
          category: box('.crafting-recipe-row-category').width,
          gap: box('.crafting-recipe-row-category').left - text.getBoundingClientRect().right,
          systemClipped: system.scrollWidth > system.clientWidth,
        };
      })
    );
    const [narrow, wide] = metas;
    assert.ok(
      Math.abs(narrow.category - narrow.meta / 2) < 0.5 && narrow.systemClipped,
      `at 278px "Weaponsmithing" holds half the meta line while the system name truncates: ${JSON.stringify(narrow)}`
    );
    assert.ok(
      !wide.systemClipped && Math.abs(wide.gap - 6) < 0.5,
      `on a wide row the category follows the whole system name at the 6px gap: ${JSON.stringify(wide)}`
    );
  });

  it('rings a selected uncraftable row inside its danger ground, and only while selected', async () => {
    const shadows = await tab.evaluate(() =>
      ['selected', 'resting'].map((id) => {
        const row = document.querySelector(`[data-case="${id}"] .crafting-recipe-row`);
        // The accent border token, resolved to the colour a computed shadow reports.
        const probe = document.createElement('span');
        probe.style.color = 'var(--fab-accent-border)';
        row.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return {
          danger: row.classList.contains('is-danger'),
          pressed: row.querySelector(':scope > button').getAttribute('aria-pressed'),
          shadow: getComputedStyle(row).boxShadow,
          accent,
        };
      })
    );
    assert.deepEqual(
      shadows.map(({ danger, pressed }) => [danger, pressed]),
      [
        [true, 'true'],
        [true, 'false'],
      ],
      'both rows are drawn on the danger ground, and only the selected one is pressed'
    );
    assert.match(shadows[0].accent, /^rgba?\(/u, 'the accent border token resolves to a colour');
    assert.equal(
      shadows[0].shadow,
      `${shadows[0].accent} 0px 0px 0px 1px inset`,
      'a selected danger row draws a 1px inset ring in the accent border colour'
    );
    assert.equal(shadows[1].shadow, 'none', 'a resting one does not');
  });

  it('shows the routes legend rather than hiding it visually', async () => {
    const legend = await tab.evaluate(() => {
      const node = document.querySelector('[data-case="routes"] fieldset > legend');
      const { width, height } = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        text: node.textContent.trim(),
        width,
        height,
        clip: style.clipPath,
        position: style.position,
      };
    });
    assert.equal(legend.text, 'FABRICATE.App.Crafting.Detail.IngredientSetsTitle');
    assert.ok(
      legend.width > 40 && legend.height > 8,
      `the legend is ${legend.width}x${legend.height}`
    );
    assert.deepEqual([legend.clip, legend.position], ['none', 'static'], 'and is not clipped away');
  });

  it('draws the routes as one native radio group that ArrowDown moves and changes', async () => {
    const focused = await tab.evaluate(() => {
      const group = document.querySelector('[data-case="routes"] fieldset');
      group?.addEventListener('change', (event) => {
        group.dataset.changes = `${group.dataset.changes ?? ''}${event.target.value};`;
      });
      // The serialized markup loses the `checked` property, so it is restored from the card the
      // group marked as the chosen one.
      const chosen = group?.querySelector(':scope .is-active input[type="radio"]');
      if (chosen) chosen.checked = true;
      chosen?.focus();
      return document.activeElement?.value ?? null;
    });
    assert.equal(focused, 'set-a', 'the chosen route is a radio, and takes focus');
    await tab.keyboard.press('ArrowDown');
    const moved = await tab.evaluate(() => ({
      checked: [
        ...document.querySelectorAll('[data-case="routes"] input[type="radio"]:checked'),
      ].map((radio) => radio.value),
      focused: document.activeElement?.value ?? null,
      changes: document.querySelector('[data-case="routes"] fieldset').dataset.changes,
    }));
    assert.deepEqual(
      moved,
      { checked: ['set-b'], focused: 'set-b', changes: 'set-b;' },
      'ArrowDown moved the one checked route to the next and fired its change'
    );
  });
});

describe('crafting routes and recipe row, live under real keys (issue 1778)', () => {
  const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@crafting-routes-styles/' });
  let live;

  before(async () => {
    await fixtureServer.start();
    live = await fixtureServer.newPage({ viewport: { width: 800, height: 900 } });
    await live.goto(fixtureServer.url('/tests/fixtures/crafting-routes/index.html'));
    await live.waitForFunction(() => document.documentElement.dataset.craftingRoutesReady);
  });

  after(async () => {
    await fixtureServer.stop();
  });

  const recorded = () =>
    live.evaluate(() => {
      const { chosen, selected, favourited, added } = document.documentElement.dataset;
      return { chosen, selected, favourited, added };
    });

  it('chooses every route an arrow key lands on, wrapping both ways, blocked or not', async () => {
    const routes = await live.evaluate(() =>
      [...document.querySelectorAll('[data-case="routes"] [data-set-id]')].map((card) => {
        const status = card.querySelector('[data-option-status]');
        return {
          id: card.dataset.setId,
          disabled: card.querySelector('input[type="radio"]').disabled,
          status: status.dataset.optionStatus,
          classes: [...status.classList],
        };
      })
    );
    assert.deepEqual(
      routes.map(({ id, disabled, status, classes }) => [
        id,
        disabled,
        status,
        chipToneOf({ classList: classes }),
      ]),
      [
        ['set-a', false, 'craftable', 'positive'],
        ['set-b', false, 'blocked', 'danger'],
        ['set-c', false, 'missing', 'warning'],
      ],
      'a blocked route stays choosable, and a short one wears the warning tone'
    );

    await live.focus('[data-set-id="set-a"] input[type="radio"]');
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp']) {
      await live.keyboard.press(key);
    }
    assert.equal(
      (await recorded()).chosen,
      'set-b set-c set-a set-c',
      'down onto the blocked and the short route, down again wrapping to the first, then up wrapping to the last'
    );
  });

  it('presses the favourite and the cart with Enter and Space without selecting the row', async () => {
    for (const control of ['.crafting-recipe-row-fav', '.crafting-recipe-row-add']) {
      await live.focus(`[data-case="row"] ${control}`);
      await live.keyboard.press('Enter');
      await live.keyboard.press('Space');
    }
    await live.focus('[data-case="row"] .crafting-recipe-row-main');
    await live.keyboard.press('Enter');
    const { selected, favourited, added } = await recorded();
    assert.deepEqual(
      { selected, favourited, added },
      { selected: 'r1', favourited: 'r1 r1', added: 'r1 r1' },
      'each trailing key pressed its own control, and only the row button selected the recipe'
    );
  });
});
