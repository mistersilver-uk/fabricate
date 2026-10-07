/**
 * Mount the real known-recipe column, component column (one row disabled) and discipline chooser,
 * recording each callback on the document (issue 1778).
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import AlchemyDisciplineChooser from '../../../src/ui/svelte/apps/alchemy/AlchemyDisciplineChooser.svelte';
import ComponentInventoryColumn from '../../../src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte';
import KnownRecipesColumn from '../../../src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

/** Appends `value` to the document's `data-<key>` list, which the suite reads back. */
const record = (key) => (value) => {
  const { dataset } = document.documentElement;
  dataset[key] = [dataset[key], value].filter(Boolean).join(' ');
};

const recipe = (id, name) => ({ id, name, img: '', result: null, signatureSummary: [] });
const essence = (id, quantity) => ({ id, name: id, icon: 'fas fa-fire', quantity });
const component = (componentId, name, available, essences = []) => ({
  componentId,
  name,
  img: '',
  available,
  held: 12,
  essences,
  disabled: available <= 0,
});

const root = document.createElement('div');
root.className = 'fabricate fabricate-app';
root.style.width = '720px';
const cases = ['known', 'inventory', 'chooser'].map((name) => {
  const host = document.createElement('div');
  host.dataset.case = name;
  root.append(host);
  return host;
});
// The component column at the player window's width for it: 280px, so each row is 254px.
cases[1].style.width = '280px';
document.body.append(root);

mount(KnownRecipesColumn, {
  target: cases[0],
  props: {
    recipes: [recipe('vigor', 'Elixir of Vigor'), recipe('venom', 'Blade Venom')],
    knownCount: 2,
    onSelect: record('selected'),
  },
});
mount(ComponentInventoryColumn, {
  target: cases[1],
  props: {
    components: [
      component(
        'emberroot',
        'Emberroot',
        12,
        ['fire', 'water', 'earth', 'air'].map((id) => essence(id, 12))
      ),
      component('ashbloom', 'Ashbloom', 0),
      component('nettle', 'Nettle', 1, [essence('fire', 2)]),
      component('longroot', 'Supercalifragilistic Root of Everlasting Vitality', 3),
    ],
    hasComponents: true,
    onAdd: record('added'),
  },
});
mount(AlchemyDisciplineChooser, {
  target: cases[2],
  props: {
    systems: [
      { id: 'sys-a', name: 'Herbalism', knownCount: 1, totalCount: 4 },
      { id: 'sys-b', name: 'Poisoncraft', knownCount: 0, totalCount: 2 },
    ],
    onChoose: record('chosen'),
  },
});

document.documentElement.dataset.alchemyRowsReady = 'true';
