import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-contents-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    // The recipe thumbnails resolve through the shared pure image helper (issue 544).
    'src/ui/svelte/util/craftingImageDefaults.js',
  ],
  compiledModules: [
    // `SetPicker` and the primitives it renders (issue 1782): its tokens are the ONE chip, its
    // rows the shared Avatar, and its panel the searchable popover.
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/Avatar.svelte',
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/SetPicker.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte',
});

const LINKED = [
  { id: 'r1', name: 'Alloy Bronze', category: 'Smithing' },
  { id: 'r2', name: 'Refine Steel', category: 'Smithing' },
];

// A library rather than a handful; the router hands the unlinked rest as `availableRecipes`.
const LIBRARY = [
  ...LINKED,
  { id: 'r3', name: 'Veil Powder', category: 'Alchemy' },
  { id: 'r4', name: 'Verdant Tonic', category: 'Alchemy' },
  { id: 'r5', name: 'Verdigris Salve', category: 'Alchemy' },
];
const UNLINKED = LIBRARY.slice(2);

async function settle() {
  flushSync();
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

/** A keydown from wherever focus is, which is how the primitive's dismissal is reached. */
async function pressKey(key) {
  document.activeElement.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
  await settle();
}

/** A mounted tab with both callbacks recorded, in call order. */
async function mountTab(props = {}) {
  const calls = [];
  const root = await harness.mount({
    linkedRecipes: LINKED,
    availableRecipes: UNLINKED,
    onLinkRecipe: (id) => calls.push(['link', id]),
    onRemoveRecipe: (id) => calls.push(['remove', id]),
    ...props,
  });
  const panel = () => root.querySelector('.fabricate-set-picker-popover');
  return {
    root,
    calls,
    panel,
    trigger: () => root.querySelector('[data-recipe-item-link-recipe-toggle]'),
    option: (id) => root.querySelector(`[data-recipe-item-link-recipe-option="${id}"]`),
    marked: () =>
      [...(panel()?.querySelectorAll('[role="option"][aria-selected="true"]') ?? [])].map((row) =>
        row.getAttribute('data-recipe-item-link-recipe-option')
      ),
    async click(element) {
      element.click();
      await settle();
    },
  };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemContentsTab (mounted)', () => {
  it('draws the linked recipes as tokens and offers every recipe of the system in the panel', async () => {
    const tab = await mountTab();
    assert.deepEqual(
      [...tab.root.querySelectorAll('[data-set-picker-token]')].map((token) =>
        token.textContent.trim()
      ),
      ['Alloy Bronze', 'Refine Steel']
    );
    await tab.click(tab.trigger());
    assert.equal(tab.root.querySelectorAll('[data-recipe-item-link-recipe-option]').length, 5);
    assert.deepEqual(tab.marked(), ['r1', 'r2'], 'the members are marked');
    assert.equal(
      tab.panel().querySelector('[data-popover-filtered-count]').textContent.trim(),
      '5 of 5'
    );
  });

  it('shows an empty state with no linked recipes', async () => {
    const tab = await mountTab({ linkedRecipes: [], availableRecipes: LIBRARY });
    assert.ok(tab.root.querySelector('[data-recipe-item-contents-empty]'));
  });

  it('renders the blueprint (not the item-bag) for a recipe with a generic/empty image (issue 544)', async () => {
    const tab = await mountTab({
      linkedRecipes: [
        { id: 'bag', name: 'Forge Club', category: 'Smithing', img: 'icons/svg/item-bag.svg' },
        { id: 'empty', name: 'Forge Handaxe', category: 'Smithing', img: '' },
        {
          id: 'real',
          name: 'Alloy Bronze',
          category: 'Smithing',
          img: 'icons/tools/smithing/anvil.webp',
        },
      ],
      availableRecipes: [],
    });
    await tab.click(tab.trigger());
    const src = (id) => tab.option(id).querySelector('img').getAttribute('src');
    const blueprint = /blueprint-recipe-alchemical[.]webp$/u;
    assert.match(src('bag'), blueprint, 'a generic bag shows the blueprint');
    assert.match(src('empty'), blueprint, 'an empty image shows it too');
    assert.equal(src('real'), 'icons/tools/smithing/anvil.webp', 'a real image passes through');
  });

  it('writes nothing while recipes are toggled', async () => {
    const tab = await mountTab();
    await tab.click(tab.trigger());
    await tab.click(tab.option('r3'));
    await tab.click(tab.option('r1'));
    assert.deepEqual(tab.calls, []);
    assert.deepEqual(tab.marked(), ['r2', 'r3'], 'the panel marks the staged set');
  });

  it('forwards only the changed recipes on Apply', async () => {
    const tab = await mountTab();
    await tab.click(tab.trigger());
    await tab.click(tab.option('r3'));
    await tab.click(tab.option('r5'));
    await tab.click(tab.option('r1'));
    await tab.click(tab.root.querySelector('[data-set-picker-apply]'));
    assert.deepEqual(tab.calls, [
      ['link', 'r3'],
      ['link', 'r5'],
      ['remove', 'r1'],
    ]);
    assert.ok(!tab.panel(), 'Apply closes the panel');
  });

  for (const [how, dismiss] of [
    ['Escape', () => pressKey('Escape')],
    [
      'an outside press',
      async () => {
        document.body.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
        await settle();
      },
    ],
    ['the trigger', (tab) => tab.click(tab.trigger())],
  ]) {
    it(`discards the staged recipes when ${how} closes the panel`, async () => {
      const tab = await mountTab();
      await tab.click(tab.trigger());
      await tab.click(tab.option('r3'));
      await dismiss(tab);
      assert.ok(!tab.panel(), `${how} closes it`);
      assert.deepEqual(tab.calls, [], 'and writes nothing');
      await tab.click(tab.trigger());
      assert.deepEqual(tab.marked(), ['r1', 'r2'], 'reopening shows the committed set');
    });
  }

  it('keeps Clear reachable at zero members', async () => {
    const tab = await mountTab({ linkedRecipes: [], availableRecipes: LIBRARY });
    await tab.click(tab.trigger());
    const clear = tab.root.querySelector('[data-set-picker-clear]');
    assert.ok(Boolean(clear), 'Clear renders over an empty membership');
    assert.equal(clear.disabled, false);
    await tab.click(tab.option('r4'));
    await tab.click(clear);
    assert.deepEqual(tab.marked(), [], 'Clear empties the staged set');
    assert.deepEqual(tab.calls, []);
  });

  it('carries the validation address on a trigger that opens over a full membership', async () => {
    const tab = await mountTab({ linkedRecipes: LIBRARY, availableRecipes: [] });
    const trigger = tab.root.querySelector('[data-validation-target="recipe-item-link-recipe"]');
    assert.ok(trigger === tab.trigger(), 'the address rides the trigger');
    assert.equal(trigger.tagName, 'BUTTON');
    assert.equal(trigger.disabled, false);
    assert.ok(!trigger.hasAttribute('aria-disabled'), 'a full membership still opens the panel');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  });

  it('names the token group, the panel, its list and its query field', async () => {
    const tab = await mountTab();
    assert.equal(
      tab.root.querySelector('.fabricate-set-picker [role="group"]').getAttribute('aria-label'),
      'Recipes inside'
    );
    await tab.click(tab.trigger());
    assert.equal(tab.panel().getAttribute('aria-label'), 'Recipes inside');
    assert.equal(
      tab.panel().querySelector('[role="listbox"]').getAttribute('aria-label'),
      'Recipes inside'
    );
    const field = tab.panel().querySelector('input');
    assert.equal(field.getAttribute('placeholder'), 'Search recipes…');
    assert.equal(field.getAttribute('aria-label'), 'Search recipes…');
  });

  it('narrows the panel by the query and counts matched-of-total', async () => {
    const tab = await mountTab({ linkedRecipes: [], availableRecipes: LIBRARY });
    await tab.click(tab.trigger());
    const field = tab.panel().querySelector('input');
    field.value = 'Verd';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assert.equal(tab.root.querySelectorAll('[data-recipe-item-link-recipe-option]').length, 2);
    assert.equal(
      tab.panel().querySelector('[data-popover-filtered-count]').textContent.trim(),
      '2 of 5'
    );
  });
});
