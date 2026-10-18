/**
 * Mount the bulk edit shell in the manager's inspector rail, `?h=` px tall (520 by default), with the
 * set delete in its dock. `?armed` arms it, and `?card=recipe` gives it the recipe card's longest
 * impact list in its shipped copy; otherwise it carries the component card's two rows. `?frame=world`
 * mounts it in a world catalogue's flush bulk scroller instead, styled by the frame's scoped CSS the
 * suite adds under the `?scope=` hash class; `?view=` sets `data-manager-view`.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import { installFixtureI18n } from '../select-fixture-shared.js';

import BulkDockHost from './BulkDockHost.svelte';
import { railMarkup } from './rails.js';

installFixtureI18n(en);

const params = new URLSearchParams(globalThis.location.search);
const { i18n } = globalThis.game;
const RECIPE = 'FABRICATE.Admin.Manager.Recipe.BulkEdit.';

// Every row the recipe card can draw, each at a plural count so none is gated off.
const recipeCard = {
  token: 'delete-recipes',
  heading: i18n.localize(`${RECIPE}DeleteHeading`),
  rows: [
    { key: 'recipes', text: i18n.format(`${RECIPE}ImpactRecipes`, { count: 3 }) },
    { key: 'items', text: i18n.format(`${RECIPE}ImpactItems`, { count: 2 }), count: 2 },
    { key: 'learners', text: i18n.format(`${RECIPE}ImpactLearners`, { count: 2 }), count: 2 },
  ],
  standingHint: i18n.localize(`${RECIPE}DeleteStandingHint`),
  idleLabel: i18n.format(`${RECIPE}Delete`, { count: 3 }),
  armedLabel: i18n.localize(`${RECIPE}DeleteConfirm`),
};
const componentCard = {
  token: 'delete-components',
  heading: 'Delete selected components',
  rows: [
    { key: 'components', text: '3 components will be deleted.' },
    { key: 'recipes', text: '2 recipes will be rewritten.', count: 2 },
  ],
  idleLabel: 'Delete 3 components',
  armedLabel: 'Confirm delete',
};

const height = Number(params.get('h') ?? 520);
const host = document.createElement('div');
host.style.cssText = `width:1200px;height:${height}px`;
// The system rail's two empty bands stand for the manager's header rows, so the body lands in its
// `1fr` track.
host.innerHTML = railMarkup({
  frame: params.get('frame') ?? 'system',
  view: params.get('view') ?? '',
  scope: params.get('scope') ?? '',
  height,
});
document.body.append(host);

mount(BulkDockHost, {
  target: host.querySelector('[data-probe-inspector]'),
  props: {
    armed: params.has('armed'),
    card: params.get('card') === 'recipe' ? recipeCard : componentCard,
  },
});

document.documentElement.dataset.bulkDockReady = 'true';
