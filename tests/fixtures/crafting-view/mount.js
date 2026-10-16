/**
 * Mount the real crafting view with `?count=` recipes (13 by default, one more than a page) in the
 * shared player-window host, `?width=` wide.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import CraftingView from '../../../src/ui/svelte/apps/crafting/CraftingView.svelte';
import { fakeCraftingStore, recipe } from '../../helpers/crafting-fixtures.js';
import { playerViewHost } from '../player-view-host.js';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

const count = Number(new URLSearchParams(location.search).get('count') ?? 13);
const recipes = Array.from({ length: count }, (_, i) =>
  recipe({ id: `recipe-${i}`, name: `Recipe ${i}` })
);
const store = fakeCraftingStore({ recipes, pageItems: recipes.slice(0, 12) });

mount(CraftingView, {
  target: playerViewHost(),
  props: { services: { crafting: store, craftingSources: null, actorBar: null } },
});

document.documentElement.dataset.craftingViewReady = 'true';
