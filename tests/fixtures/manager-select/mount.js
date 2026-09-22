/**
 * Mount the REAL converted manager settings/tab controls, and the three caption SHAPES, for issue
 * 1510.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';

import AccessTabView from '../../../src/ui/svelte/apps/manager/AccessTabView.svelte';
import BooksScrollsView from '../../../src/ui/svelte/apps/manager/BooksScrollsView.svelte';
import CharacterPrerequisitesCard from '../../../src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte';
import GatheringEconomyView from '../../../src/ui/svelte/apps/manager/GatheringEconomyView.svelte';
import SystemsBrowserView from '../../../src/ui/svelte/apps/manager/SystemsBrowserView.svelte';
import ImportFolderMappingModal from '../../../src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte';
import RecipeIngredientOption from '../../../src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte';
import EnvironmentOverviewTab from '../../../src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte';
import RecipeOverviewTab from '../../../src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte';
import Select from '../../../src/ui/svelte/components/Select.svelte';
import ToolBehaviorPreview from '../../../src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte';
import WorldCurrencyTab from '../../../src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte';
import { installFixtureI18n, mountCaptionShape } from '../select-fixture-shared.js';

const params = new URLSearchParams(globalThis.location.search);
const subject = params.get('subject') ?? 'span';
const startValue = params.get('value') ?? '';

installFixtureI18n(en);

const frame = document.createElement('div');
frame.className = 'fabricate fabricate-manager';
const mountPoint = document.createElement('div');
mountPoint.className = 'fixture-mount fixture-column manager-section-body';
frame.append(mountPoint);
document.body.append(frame);

/**
 * The three caption shapes around one bare `Select`, hosted the way the manager's `Pagination`
 * page-size row hosts its control (the wrapper class is the difference under test); the `showTick`
 * refusal matches that shipped row.
 */
function mountShape() {
  mountCaptionShape({
    mount,
    Select,
    mountPoint,
    subject,
    startValue,
    wrapperClass: 'manager-pagination-size fixture-wrapper',
    captionClass: 'fixture-caption',
    extraProps: { showTick: false },
  });
}

/** One prerequisite entry, opened, so the operator select renders. */
const PREREQUISITE_LIBRARY = [
  {
    id: 'p1',
    name: 'Trained hands',
    icon: 'fa-solid fa-user-shield',
    path: 'abilities.int.mod',
    op: startValue || 'gte',
    value: '2',
  },
];

/** Two folders, one of which the name matcher pre-fills, so both category states render. */
const IMPORT_FOLDERS = [
  {
    folderId: 'f1',
    folderName: 'Reagent',
    itemCount: 3,
    itemUuids: ['Item.a', 'Item.b', 'Item.c'],
  },
  { folderId: 'f2', folderName: 'Widgets', itemCount: 2, itemUuids: ['Item.d', 'Item.e'] },
];

/**
 * The gathering services seam, reduced to the four reads this view makes on mount.
 *
 * @param {string} unit The regeneration unit the economy starts on.
 */
function economyServices(unit) {
  const economy = {
    resolutionMode: 'd100',
    stamina: {
      enabled: true,
      max: '40',
      start: '',
      regen: { policy: 'overTime', unit, amount: '2' },
    },
    nodes: { enabled: false },
  };
  return {
    getGatheringEconomy: () => economy,
    setGatheringEconomy: (options) => Promise.resolve(options.economy),
    getGatheringStaminaState: () => [],
    setGatheringStamina: () => Promise.resolve({}),
    adjustGatheringStamina: () => Promise.resolve({}),
    rollGatheringStamina: () => Promise.resolve({}),
  };
}

// Two tiers of very different label lengths, so the overview cells can be measured on a short
// value and a long one (issue 1510). `Default DC` is the blank row both lists open with.
const RECIPE_CHECK_TIERS = [
  { id: 'tier-easy', name: 'Easy', dc: 8 },
  { id: 'tier-legendary', name: 'Legendary craftsmanship', dc: 28 },
];

// Label lengths that differ sharply, so the overview's three pickers measure on a short value and
// a long one (issue 1510).
const OVERVIEW_REALMS = [
  { id: 'verdant', name: 'Verdant' },
  { id: 'ashfall', name: 'The Ashfall Marches' },
];
const OVERVIEW_BIOMES = [
  { id: 'forest', label: 'Forest' },
  { id: 'saltmarsh', label: 'Saltmarsh and tidal flat' },
];
const OVERVIEW_DANGERS = [
  { id: 'safe', label: 'Safe' },
  { id: 'hazardous', label: 'Hazardous, with warnings' },
];

// The longest actor name a world realistically holds, so the `toolbar` rung's 320px panel cap is
// measured against something that can exceed it.
const PREVIEW_ACTORS = [
  { uuid: 'Actor.brenna', name: 'Brenna Karrunsdottir' },
  { uuid: 'Actor.wagon', name: 'The Ashfall Wagon of the Long Road' },
];

// The three browse toolbars' fixture data (issue 1510). Every vocabulary is kept inside the range
// the conversion measured in the product — the widest filter label in the manager's browse bars is
// 92px — because the shared 144px trigger floor is what pins these controls, and a label wider than
// the floor is a control that grows with the GM's choice whatever the floor says.
const BROWSE_SYSTEMS = [
  { id: 'alchemy', name: 'Alchemy', description: 'Potion work', enabled: true, featureCount: 3 },
  { id: 'smithing', name: 'Smithing', description: 'Heavy work', enabled: false, featureCount: 1 },
];
const ACCESS_RECIPES = [
  {
    id: 'alloy',
    name: 'Alloy Bronze',
    img: 'icons/svg/book.svg',
    category: 'Smithing',
    accessSummary: { characterCount: 2, playerCount: 0 },
  },
  {
    id: 'tincture',
    name: 'Tincture of clarity',
    img: 'icons/svg/book.svg',
    category: 'Alchemy',
    accessSummary: { characterCount: 0, playerCount: 0 },
  },
];
const ACCESS_CATEGORIES = [
  { name: 'Smithing', count: 1 },
  { name: 'Alchemy', count: 1 },
];
const RECIPE_ITEMS = [
  {
    id: 'primer',
    resolvedName: "Journeyman's Primer",
    resolvedImg: 'icons/svg/book.svg',
    derivedType: 'Book',
    enabled: true,
    caps: { item: { limitUses: false }, learn: { limitLearning: true, learnsAllowed: 2 } },
    recipes: [{ id: 'r1', name: 'Smelt Copper', category: 'Smithing' }],
    learnedByCount: 1,
  },
  {
    id: 'scroll',
    resolvedName: 'Scroll of Soul-Ash',
    resolvedImg: 'icons/svg/book.svg',
    derivedType: 'Scroll',
    enabled: false,
    caps: { item: { limitUses: false }, learn: { limitLearning: false } },
    recipes: [],
    learnedByCount: 0,
  },
];

/** The 340px column the tool-edit grid gives the rail, reproduced as fixture chrome. */
function railColumn() {
  const rail = document.createElement('div');
  rail.className = 'fixture-rail';
  mountPoint.append(rail);
  return rail;
}

const SUBJECTS = {
  prerequisites: () =>
    mount(CharacterPrerequisitesCard, {
      target: mountPoint,
      props: {
        library: PREREQUISITE_LIBRARY,
        requestOpenId: 'p1',
        requestOpenNonce: 1,
      },
    }),
  currency: () =>
    mount(WorldCurrencyTab, {
      target: mountPoint,
      props: {
        // THREE UNITS, so the add-sub-unit control has something to offer and two labels of very
        // different lengths to be measured on: `currencyUnitSubUnitOptions` offers every unit
        // that is not the edited one and not already reachable from it, and its labels are
        // `${label} (${abbreviation})`. One unit renders no builder at all.
        currencyUnits: [
          {
            id: 'gp',
            name: 'Gold',
            label: 'Gold',
            abbreviation: 'gp',
            actorPath: 'currency.gp',
            contains: [],
          },
          {
            id: 'sp',
            name: 'Silver',
            label: 'Silver',
            abbreviation: 'sp',
            actorPath: 'currency.sp',
            contains: [],
          },
          {
            id: 'electrum',
            name: 'Electrum piece',
            label: 'Electrum piece',
            abbreviation: 'ep',
            actorPath: 'currency.ep',
            contains: [],
          },
        ],
        currencySpendStrategy: startValue || 'actorProperty',
        currencyProviderId: 'dnd5e-inventory',
        currencyProviderOptions: [
          { id: 'dnd5e-inventory', label: 'D&D 5e actor inventory currency' },
          { id: 'pf2e-inventory', label: 'Pathfinder 2e actor inventory currency' },
        ],
      },
    }),
  import: () =>
    mount(ImportFolderMappingModal, {
      target: mountPoint,
      props: {
        open: true,
        folders: IMPORT_FOLDERS,
        componentCategories: ['Reagent', 'Metal', 'Alchemical reagent'],
        itemTags: ['herb', 'rare'],
      },
    }),
  economy: () =>
    mount(GatheringEconomyView, {
      target: mountPoint,
      props: { services: economyServices(startValue || 'hours'), systemId: 'sys' },
    }),
  // The recipe studio's four converted cells (issue 1510). `bySubject` with a non-empty modifier
  // catalogue is the one rule under which the eligible-set cell renders at all.
  'recipe-overview': () =>
    mount(RecipeOverviewTab, {
      target: mountPoint,
      props: {
        recipe: {
          id: 'r1',
          category: ['Metal', 'Alchemical reagent'].includes(startValue)
            ? startValue
            : 'Alchemical reagent',
          checkTierId: startValue?.startsWith('tier-') ? startValue : 'tier-easy',
          minSuccessOutcomeId: startValue?.startsWith('tier-') ? startValue : 'tier-easy',
          craftingModifier: startValue === 'inherit' ? null : { modifierIds: ['steady'] },
        },
        name: 'Tincture of clarity',
        categories: ['Alchemical reagent', 'Metal'],
        checkTierOptions: RECIPE_CHECK_TIERS,
        minSuccessTierOptions: RECIPE_CHECK_TIERS,
        craftingModifierOptions: [{ id: 'steady', label: 'Steady hands' }],
        craftingModifierPolicy: 'bySubject',
        craftingModifierDefaultIds: ['steady'],
      },
    }),
  // One requirement row, so the kind picker renders inside the row's own flex line.
  'recipe-option': () =>
    mount(RecipeIngredientOption, {
      target: mountPoint,
      props: {
        option: {
          quantity: 2,
          match: { type: startValue === 'tags' ? 'tags' : 'component', componentId: 'cmp-iron' },
        },
        componentOptions: [{ id: 'cmp-iron', name: 'Iron ingot' }],
        itemTags: ['herb', 'rare'],
      },
    }),
  // The overview's three: two add controls measurable only at their sentinel, and the ceiling.
  'environment-overview': () =>
    mount(EnvironmentOverviewTab, {
      target: mountPoint,
      props: {
        environment: {
          id: 'env-1',
          name: 'Sunlit Grove',
          enabled: true,
          biomes: [],
          includedRealmIds: [],
          dangerLevel: OVERVIEW_DANGERS.some((entry) => entry.id === startValue)
            ? startValue
            : 'safe',
        },
        realmsEnabled: true,
        realmRecords: OVERVIEW_REALMS,
        biomeOptions: OVERVIEW_BIOMES,
        dangerOptions: OVERVIEW_DANGERS,
      },
    }),
  // The three browse toolbars, whose filter values are component state rather than props: each is
  // driven through its own panel here, exactly as the GM drives it.
  'systems-browser': () =>
    mount(SystemsBrowserView, { target: mountPoint, props: { systems: BROWSE_SYSTEMS } }),
  'access-tab': () =>
    mount(AccessTabView, {
      target: mountPoint,
      props: { recipes: ACCESS_RECIPES, recipeCategories: ACCESS_CATEGORIES },
    }),
  'books-scrolls': () =>
    mount(BooksScrollsView, {
      target: mountPoint,
      props: { recipeItems: RECIPE_ITEMS, visibilityMode: 'knowledge' },
    }),
  // The `Preview as` roster, whose value is component state rather than a prop.
  'tool-preview': () =>
    mount(ToolBehaviorPreview, {
      target: railColumn(),
      props: {
        tool: { id: 'anvil', name: 'Anvil', img: '', breakage: { mode: 'unlimited' } },
        systemName: 'Karrun Forgecraft',
        actorOptions: PREVIEW_ACTORS,
      },
    }),
};

if (Object.hasOwn(SUBJECTS, subject)) SUBJECTS[subject]();
else mountShape();

globalThis.__managerSelectFixtureReady = true;
