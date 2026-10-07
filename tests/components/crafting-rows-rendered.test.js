/**
 * Issue 1778 — the crafting browser's recipe row and the ingredient routes, measured in Chromium
 * under Foundry's fixed button height: the row's button grows to hold its content, a selected
 * uncraftable row draws the danger ring, and an arrow key moves the route radios' choice.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { recipe } from '../helpers/crafting-fixtures.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import {
  CRAFTING_APP_COMPILED_MODULES,
  CRAFTING_APP_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

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

  it('rings a selected uncraftable row inside its danger ground, and only while selected', async () => {
    const shadows = await tab.evaluate(() =>
      ['selected', 'resting'].map((id) => {
        const row = document.querySelector(`[data-case="${id}"] .crafting-recipe-row`);
        const style = getComputedStyle(row);
        return { danger: row.classList.contains('is-danger'), shadow: style.boxShadow };
      })
    );
    assert.deepEqual(
      shadows.map(({ danger }) => danger),
      [true, true],
      'both rows are drawn on the danger ground'
    );
    assert.match(shadows[0].shadow, /inset/u, 'a selected danger row draws its 1px inset ring');
    assert.equal(shadows[1].shadow, 'none', 'a resting one does not');
  });

  it('moves the chosen route with an arrow key, firing the change that chooses it', async () => {
    const focused = await tab.evaluate(() => {
      const group = document.querySelector('[data-case="routes"] fieldset');
      globalThis.routeChanges = [];
      group?.addEventListener('change', (event) =>
        globalThis.routeChanges.push(event.target.value)
      );
      // The serialized markup loses the `checked` property, so it is restored from the card the
      // group marked as the chosen one.
      const chosen = group?.querySelector('.is-active input[type="radio"]');
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
      changes: globalThis.routeChanges,
    }));
    assert.deepEqual(
      moved,
      { checked: ['set-b'], focused: 'set-b', changes: ['set-b'] },
      'ArrowDown moved the one checked route to the next and fired its change'
    );
  });
});
