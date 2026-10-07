/**
 * Mount the real ingredient-route selector (three routes: craftable, blocked by a tool, short of
 * an ingredient) and one real recipe row, recording each callback on the document (issue 1778).
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import IngredientSetSelector from '../../../src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte';
import RecipeListRow from '../../../src/ui/svelte/apps/crafting/RecipeListRow.svelte';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

/** Appends `value` to the document's `data-<key>` list, which the suite reads back. */
const record = (key) => (value) => {
  const { dataset } = document.documentElement;
  dataset[key] = [dataset[key], value].filter(Boolean).join(' ');
};

const products = [{ name: 'Warding Shield Boss', img: '', qty: 1 }];
const sets = [
  { id: 'set-a', label: 'Verdant Warding', craftability: { canCraft: true }, products },
  {
    id: 'set-b',
    label: 'Graveward Binding',
    craftability: { canCraft: false, toolStates: [{ name: 'Anvil', available: false }] },
    products,
  },
  {
    id: 'set-c',
    label: 'Ashen Lattice',
    craftability: { canCraft: false, ingredientStates: [{ name: 'Ash', satisfied: false }] },
    products,
  },
];

const root = document.createElement('div');
root.className = 'fabricate fabricate-app';
root.style.width = '460px';
const routes = document.createElement('div');
routes.dataset.case = 'routes';
const row = document.createElement('div');
row.dataset.case = 'row';
root.append(routes, row);
document.body.append(root);

mount(IngredientSetSelector, {
  target: routes,
  props: { sets, selectedSetId: 'set-a', onChoose: record('chosen') },
});
mount(RecipeListRow, {
  target: row,
  props: {
    recipe: {
      id: 'r1',
      name: 'Healing Potion',
      img: '',
      systemName: 'Alchemy',
      browseStatus: 'available',
    },
    onSelect: record('selected'),
    onToggleFavourite: record('favourited'),
    onAddToShoppingList: record('added'),
  },
});

document.documentElement.dataset.craftingRoutesReady = 'true';
