/**
 * Mount one real system inspector (`?inspector=recipes|essences|components|tools`) in the manager's
 * rail at `?size=long` (content overflowing the rail) or `short`, in a 1280px-wide host whose rail
 * is `?h=` px tall: 634 by default, the rail the View Lab measured at 1280x820.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import ComponentBrowserInspector from '../../../src/ui/svelte/apps/manager/components/ComponentBrowserInspector.svelte';
import EssenceBrowserInspector from '../../../src/ui/svelte/apps/manager/essences/EssenceBrowserInspector.svelte';
import RecipeBrowserInspector from '../../../src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte';
import ToolBrowserInspector from '../../../src/ui/svelte/apps/manager/tools/ToolBrowserInspector.svelte';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

const params = new URLSearchParams(globalThis.location.search);
const long = params.get('size') === 'long';
const count = (n) => Array.from({ length: long ? n : 0 }, (_, index) => index + 1);

const COMPONENTS = [
  { id: 'herb', name: 'Mountain Herb', img: '' },
  { id: 'potion', name: 'Healing Potion', img: '' },
];

/** A routed-by-check recipe: long, its requirement rows push four tier toggles under the fold. */
function recipeProps() {
  const groups = count(12).map((index) => ({
    id: `grp-${index}`,
    options: [
      { id: `o${index}`, quantity: index, match: { type: 'component', componentId: 'herb' } },
    ],
  }));
  const tiers = (long ? ['crit', 'success', 'partial', 'fail'] : ['success']).map((id) => ({
    id: `g-${id}`,
    name: `On ${id}`,
    checkOutcomeIds: [id],
    results: [{ id: `res-${id}`, componentId: 'potion', quantity: 1 }],
  }));
  return {
    selectedRecipe: {
      id: 'r1',
      name: 'Healing Draught',
      description: 'Restores a small amount of health.',
      img: '',
      category: 'general',
      enabled: true,
      locked: false,
      stepCount: 1,
      ingredientCount: groups.length,
      resultItemCount: tiers.length,
      resultGroupCount: tiers.length,
      checkSummary: { kind: 'dc', dc: 15 },
      ingredientSets: [{ id: 'set-1', ingredientGroups: groups }],
      resultGroups: tiers,
    },
    recipeCount: 1,
    resolutionMode: 'routedByCheck',
    outcomeTiers: tiers.map((tier) => ({ id: tier.checkOutcomeIds[0], name: tier.name })),
    componentOptions: COMPONENTS,
  };
}

/** An essence carried by components: long, its usage grid closes the content in buttons. */
function essenceProps() {
  return {
    essence: {
      id: 'earth',
      name: 'Earth',
      enabled: true,
      colorToken: '',
      description: 'The weight of stone.',
      componentUsageCount: 3,
      recipeUsageCount: 2,
      componentUsageItems: count(36).map((index) => ({ id: `c${index}`, name: `Stone ${index}` })),
    },
    systemName: 'Alchemy',
    showSourceUi: long,
    systemRows: count(6).map((index) => ({
      systemId: `sys-${index}`,
      systemName: `System ${index}`,
      member: index % 2 === 0,
      enabled: true,
    })),
    memberCount: long ? 3 : 0,
    rosterSize: long ? 6 : 0,
  };
}

/** A component with a world entry: long, its essence chips push the catalogue link under the fold. */
function componentProps() {
  return {
    selectedComponent: {
      id: 'coal',
      name: 'Coal',
      img: '',
      category: 'Raw',
      tags: ['sooty', ...count(24).map((index) => `tag-${index}`)],
      essences: count(60).map((index) => ({
        id: `e${index}`,
        name: `Essence ${index}`,
        quantity: 1,
      })),
      hasRegisteredItemUuid: true,
      registeredItemUuidDisplay: 'Item.coal-source',
      salvageSummary: { resultCount: 2 },
      difficulty: 17,
    },
    showTags: true,
    worldEntry: { id: 'coal', membershipCount: 2, defaults: { tags: ['fuel'] } },
    worldSystemRow: { mutedTags: [] },
    systemName: 'Forge',
    salvageFeatureEnabled: true,
    salvageModeLabel: 'Progressive',
  };
}

/**
 * An adopted Tool, whose description pushes the world-Tool route under the fold; short, a Tool this
 * system has not adopted, since a member's rules and inheritance already overflow a 634px rail.
 */
function toolProps() {
  if (!long) {
    const entity = { id: 'pick', name: 'Mining Pick', img: '', description: 'A pick.' };
    const defaults = { id: 'pick', breakage: { mode: 'breakageChance', breakageChance: 8 } };
    return { tool: null, unadopted: { id: 'pick', entity, defaults }, systemName: 'Forge' };
  }
  const description = 'A heavy pick for hard rock. '.repeat(60);
  return {
    tool: {
      id: 'pick',
      label: 'Mining Pick',
      enabled: true,
      componentId: 'c1',
      requirement: null,
      breakage: { mode: 'breakageChance', breakageChance: 8 },
      onBreak: { mode: 'destroy' },
    },
    managedItems: [{ id: 'c1', name: 'Mining Pick', description }],
    systemName: 'Mythwright Forge',
  };
}

const SUBJECTS = {
  recipes: [RecipeBrowserInspector, recipeProps],
  essences: [EssenceBrowserInspector, essenceProps],
  components: [ComponentBrowserInspector, componentProps],
  tools: [ToolBrowserInspector, toolProps],
};

const view = params.get('inspector');
const [component, props] = SUBJECTS[view];

const host = document.createElement('div');
host.style.cssText = `width:1280px;height:${Number(params.get('h') ?? 634)}px`;
// The two empty bands stand for the manager's header rows, so the body lands in its `1fr` track.
host.innerHTML =
  `<div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="${view}">` +
  '<div></div><div></div><div class="manager-body"><div class="manager-rail"></div><div class="manager-main"></div>' +
  '<aside class="manager-inspector" data-probe-inspector></aside></div></div>';
document.body.append(host);

mount(component, { target: host.querySelector('[data-probe-inspector]'), props: props() });

document.documentElement.dataset.inspectorFootReady = 'true';
