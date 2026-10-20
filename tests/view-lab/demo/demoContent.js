/**
 * The hero-demo world (issue 2571): one mountain hold with a forge routed by its check and a still
 * that brews by essence. Every image is a Foundry core icon; nothing here feeds a View Lab case.
 */
import {
  component,
  componentCategoryVocabulary,
  ICON_BASE,
  recipe,
  simpleSet,
} from '../world/labContent.js';

/** The roll stream the scripted journey was tuned against; a new seed re-tunes every beat. */
export const DEMO_SEED = 4;

export const DEMO_SYSTEM_IDS = Object.freeze({
  FORGE: 'demo-emberdeep-forge',
  STILL: 'demo-hollowmere-still',
});

const FORGE_COMPONENTS = [
  component('ed-iron-ore', 'Iron Ore', 'commodities/stone/ore-chunk-iron-black.webp', {
    categories: ['Raw Materials'],
    tags: ['ore'],
    description: 'Black-veined ore hauled up from the Emberdeep seams.',
  }),
  component('ed-charcoal', 'Forge Charcoal', 'commodities/stone/ore-chunk-black.webp', {
    categories: ['Raw Materials'],
    tags: ['fuel'],
    description: 'Hardwood burned slow under turf until it rings when dropped.',
  }),
  component('ed-iron-ingot', 'Iron Ingot', 'commodities/metal/ingot-worn-iron.webp', {
    categories: ['Refined'],
    tags: ['ingot'],
    description: 'A plain bar of bloom iron, still pitted from the crucible.',
  }),
  component('ed-steel-ingot', 'Steel Ingot', 'commodities/metal/ingot-steel.webp', {
    categories: ['Refined'],
    tags: ['ingot'],
    description: 'Iron folded and quenched until the grain runs fine and grey.',
  }),
  component('ed-oiled-grip', 'Oiled Grip', 'commodities/leather/leather-bolt-brown.webp', {
    categories: ['Fittings'],
    tags: ['leather'],
    description: 'Hide wrapping worked with tallow, cut to a hilt’s length.',
  }),
  component('ed-leather-scraps', 'Leather Scraps', 'commodities/leather/leather-scrap-brown.webp', {
    categories: ['Fittings'],
    tags: ['leather'],
    description: 'Offcuts of old grip, good for binding and little else.',
  }),
  component('ed-flawed-longsword', 'Flawed Longsword', 'weapons/swords/sword-broad-worn.webp', {
    categories: ['Arms'],
    tags: ['weapon'],
    description: 'It holds an edge, mostly. The temper line wanders.',
  }),
  component('ed-longsword', 'Longsword', 'weapons/swords/sword-guard.webp', {
    categories: ['Arms'],
    tags: ['weapon'],
    description: 'A sound blade of Emberdeep steel, balanced a hand above the guard.',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      toolIds: ['ed-tool-hammer'],
      resultGroups: [
        {
          id: 'ed-salv-longsword',
          name: 'Reclaimed stock',
          results: [
            { componentId: 'ed-steel-ingot', quantity: 1 },
            { componentId: 'ed-leather-scraps', quantity: 1 },
          ],
        },
      ],
    },
  }),
  component(
    'ed-masterwork-longsword',
    'Masterwork Longsword',
    'weapons/swords/sword-guard-engraved.webp',
    {
      categories: ['Arms'],
      tags: ['weapon'],
      description: 'Engraved along the fuller and true enough to sing when drawn.',
    }
  ),
];

/** The still's reagents, each carrying the essences its recipes are matched by. */
const STILL_COMPONENTS = [
  component('hm-bitterfern', 'Bitterfern', 'consumables/plants/fern-leaf-bundle-green.webp', {
    categories: ['Reagents'],
    tags: ['herb'],
    essences: { life: 2 },
    description: 'Cut at the tarn’s edge; bitter enough to wake the dying.',
  }),
  component('hm-moonbell', 'Moonbell', 'commodities/flowers/cornflower-blue.webp', {
    categories: ['Reagents'],
    tags: ['flower'],
    essences: { water: 1 },
    description: 'Opens only under mist, and holds the cold in its cup.',
  }),
  component('hm-embercap', 'Embercap', 'consumables/mushrooms/campanulate-bell-shiny-red.webp', {
    categories: ['Reagents'],
    tags: ['fungus'],
    essences: { fire: 1 },
    description: 'Grows on old forge slag and is warm to the touch.',
  }),
  component('hm-stonecrop', 'Stonecrop', 'consumables/plants/aloe-succulent-green.webp', {
    categories: ['Reagents'],
    tags: ['herb'],
    essences: { earth: 1 },
    description: 'A fat-leafed creeper that roots in bare granite.',
  }),
  component('hm-brimstone', 'Brimstone', 'commodities/materials/bowl-powder-yellow.webp', {
    categories: ['Reagents'],
    tags: ['mineral'],
    essences: { fire: 1, earth: 1 },
    description: 'Yellow crust scraped from the vents below the hold.',
  }),
  component('hm-empty-phial', 'Empty Phial', 'consumables/potions/bottle-bulb-empty-glass.webp', {
    categories: ['Vessels'],
    tags: ['vessel'],
    description: 'Blown glass from the Hollowmere kilns, stoppered with wax.',
  }),
  component(
    'hm-draught-mending',
    'Draught of Mending',
    'consumables/potions/potion-bottle-corked-labeled-red.webp',
    {
      categories: ['Draughts'],
      tags: ['potion'],
      description: 'Knits torn flesh by morning, if drunk before nightfall.',
    }
  ),
  component(
    'hm-alchemists-fire',
    'Alchemist’s Fire',
    'consumables/potions/bottle-bulb-corked-glowing-red.webp',
    {
      categories: ['Draughts'],
      tags: ['bomb'],
      description: 'Sealed fire. Throw it far, and throw it first.',
    }
  ),
  component(
    'hm-elixir-stoneskin',
    'Elixir of Stoneskin',
    'consumables/potions/bottle-round-corked-orange.webp',
    {
      categories: ['Draughts'],
      tags: ['elixir'],
      description: 'Turns a blade for an hour and leaves the drinker grey and slow.',
    }
  ),
];

const tool = (id, name, icon, description) => ({
  id,
  name,
  description,
  componentId: null,
  registeredItemUuid: `Item.${id}`,
  originItemUuid: `Item.${id}`,
  img: `${ICON_BASE}/${icon}`,
  aliasItemUuids: [],
  // Unbreakable, so no break roll can surface in a scripted take.
  breakage: { mode: 'limitedUses', maxUses: null },
  onBreak: { mode: 'destroy' },
});

const FORGE_TOOLS = [
  tool(
    'ed-tool-crucible',
    'Crucible',
    'tools/smithing/crucible.webp',
    'Fireclay, cracked once and banded with iron.'
  ),
  tool(
    'ed-tool-hammer',
    'Smith’s Hammer',
    'tools/smithing/hammer-sledge-steel-grey.webp',
    'A cross-pein hammer whose haft has outlived three smiths.'
  ),
  tool(
    'ed-tool-anvil',
    'Anvil',
    'tools/smithing/anvil.webp',
    'Set into living rock at the heart of the forge.'
  ),
];

const ESSENCES = [
  {
    id: 'life',
    name: 'Life',
    description: 'Sap, blood and the will to mend.',
    icon: 'fas fa-seedling',
    colorToken: 'sage',
  },
  {
    id: 'water',
    name: 'Water',
    description: 'Mist, tarn and cold.',
    icon: 'fas fa-droplet',
    colorToken: 'aqua',
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'Ember, vent and forge-heat.',
    icon: 'fas fa-fire',
    colorToken: 'peach',
  },
  {
    id: 'earth',
    name: 'Earth',
    description: 'Granite, ore and root.',
    icon: 'fas fa-mountain',
    colorToken: 'butter',
  },
];

/** The forge's routed check: the roll's tier picks the blade, and a ruined heat yields nothing. */
const FORGE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
  failureResultPolicy: 'never',
  routed: {
    type: 'relative',
    rollFormula: '1d20 + @abilities.str.mod',
    dc: 12,
    thresholdMode: 'meet',
    relativeOutcomes: [
      { id: 'ed-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 6 },
      { id: 'ed-standard', name: 'Sound', success: true, breakTools: false, dc: 0 },
      { id: 'ed-flawed', name: 'Flawed', success: true, breakTools: false, dc: -4 },
      { id: 'ed-ruined', name: 'Ruined', success: false, breakTools: false, dc: -12 },
    ],
  },
});

const STILL_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  failureResultPolicy: 'perRecord',
  simple: { rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 10 } },
});

/** One named ingredient group. */
const group = (id, name, option) => ({ id, name, options: [option] });
const essence = (essenceId, amount) => ({ match: { type: 'essence', essenceId, amount } });
const phial = { componentId: 'hm-empty-phial', quantity: 1 };

/**
 * A brew: two essence demands and its draught. Essence-only, because that is the signature the
 * workbench can recognise before the brew; the phial goes on the bench as a vessel and is spent.
 */
function brew(id, name, icon, description, [first, second], resultId, extra = {}) {
  return recipe(id, name, DEMO_SYSTEM_IDS.STILL, icon, {
    description,
    categories: ['Draughts'],
    ingredientSets: [
      {
        id: `${id}-s1`,
        ingredientGroups: [
          group(`${id}-g1`, `${first[0]} essence`, essence(first[0].toLowerCase(), first[1])),
          group(`${id}-g2`, `${second[0]} essence`, essence(second[0].toLowerCase(), second[1])),
        ],
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ componentId: resultId, quantity: 1 }] },
      ...(extra.failure ?? []),
    ],
    check: {
      enabled: true,
      rollFormula: '1d20 + @abilities.int.mod',
      thresholds: { success: extra.dc ?? 10 },
    },
  });
}

const FORGE_RECIPES = [
  recipe(
    'ed-r-iron-ingot',
    'Smelt Iron Ingot',
    DEMO_SYSTEM_IDS.FORGE,
    'commodities/metal/ingot-worn-iron.webp',
    {
      description: 'Black ore and a hot bed of charcoal, coaxed down into one honest bar.',
      categories: ['Smelting'],
      ingredientSets: [simpleSet('s1', { 'ed-iron-ore': 2, 'ed-charcoal': 1 })],
      resultGroups: [
        { id: 'rg', name: 'Ingot', results: [{ componentId: 'ed-iron-ingot', quantity: 1 }] },
      ],
      toolIds: ['ed-tool-crucible'],
    }
  ),
  recipe('ed-r-steel', 'Fold Steel', DEMO_SYSTEM_IDS.FORGE, 'commodities/metal/ingot-steel.webp', {
    description: 'Fold, draw and quench until the iron forgets it was ever soft.',
    categories: ['Smelting'],
    ingredientSets: [simpleSet('s1', { 'ed-iron-ingot': 2, 'ed-charcoal': 2 })],
    resultGroups: [
      { id: 'rg', name: 'Steel', results: [{ componentId: 'ed-steel-ingot', quantity: 1 }] },
    ],
    toolIds: ['ed-tool-hammer'],
  }),
  recipe(
    'ed-r-longsword',
    'Forge Longsword',
    DEMO_SYSTEM_IDS.FORGE,
    'weapons/swords/sword-guard.webp',
    {
      description: 'One blank, one heat: the roll decides what leaves the anvil.',
      categories: ['Bladesmithing'],
      complex: true,
      ingredientSets: [
        {
          id: 'ed-set-blade',
          name: 'Blade stock',
          ingredientGroups: [
            group('ed-set-blade-g1', 'Steel', { componentId: 'ed-steel-ingot', quantity: 2 }),
            group('ed-set-blade-g2', 'Grip', { componentId: 'ed-oiled-grip', quantity: 1 }),
          ],
        },
      ],
      resultGroups: [
        {
          id: 'ed-grp-masterwork',
          name: 'Masterwork blade',
          checkOutcomeIds: ['ed-masterwork'],
          results: [{ componentId: 'ed-masterwork-longsword', quantity: 1 }],
        },
        {
          id: 'ed-grp-sound',
          name: 'Sound blade',
          checkOutcomeIds: ['ed-standard'],
          results: [{ componentId: 'ed-longsword', quantity: 1 }],
        },
        {
          id: 'ed-grp-flawed',
          name: 'Flawed blade',
          checkOutcomeIds: ['ed-flawed'],
          results: [{ componentId: 'ed-flawed-longsword', quantity: 1 }],
        },
      ],
      toolIds: ['ed-tool-hammer', 'ed-tool-anvil'],
    }
  ),
];

const STILL_RECIPES = [
  brew(
    'hm-r-mending',
    'Draught of Mending',
    'consumables/potions/potion-bottle-corked-labeled-red.webp',
    'Fern for the flesh, moonbell for the fever.',
    [
      ['Life', 2],
      ['Water', 1],
    ],
    'hm-draught-mending'
  ),
  brew(
    'hm-r-fire',
    'Alchemist’s Fire',
    'consumables/potions/bottle-bulb-corked-glowing-red.webp',
    'Embercap and brimstone, sealed before they wake.',
    [
      ['Fire', 2],
      ['Earth', 1],
    ],
    'hm-alchemists-fire'
  ),
  brew(
    'hm-r-stoneskin',
    'Elixir of Stoneskin',
    'consumables/potions/bottle-round-corked-orange.webp',
    'Two measures of stonecrop, and fern to keep the heart beating.',
    [
      ['Earth', 2],
      ['Life', 1],
    ],
    'hm-elixir-stoneskin',
    {
      dc: 14,
      failure: [{ id: 'hm-r-stoneskin-fail', role: 'failure', results: [{ ...phial }] }],
    }
  ),
];

const tagsOf = (components) => [...new Set(components.flatMap((entry) => entry.tags))];

/** The two systems, in the persisted shape `CraftingSystemManager.initialize()` normalizes. */
function buildSystems() {
  return [
    {
      id: DEMO_SYSTEM_IDS.FORGE,
      name: 'Emberdeep Forge',
      description: 'Ore to ingot to blade, under the mountain, graded by how well the heat went.',
      img: `${ICON_BASE}/tools/smithing/anvil.webp`,
      enabled: true,
      visibilityMode: 'global',
      resolutionMode: 'routedByCheck',
      craftingCheck: FORGE_CHECK,
      // No salvage check: a blade broken down returns its stock outright.
      salvageResolutionMode: 'simple',
      features: { essences: false, recipeCategories: true, itemTags: true, gathering: false },
      essenceDefinitions: [],
      categories: ['Smelting', 'Bladesmithing'],
      itemTags: tagsOf(FORGE_COMPONENTS),
      components: FORGE_COMPONENTS,
      componentCategories: componentCategoryVocabulary(FORGE_COMPONENTS),
      recipeItemDefinitions: [],
      tools: FORGE_TOOLS,
      gatheringRealmSettings: { enabled: false },
    },
    {
      id: DEMO_SYSTEM_IDS.STILL,
      name: 'Hollowmere Still',
      description: 'Reagents combined by the essences they carry, not by a list.',
      img: `${ICON_BASE}/consumables/potions/potion-bottle-corked-labeled-red.webp`,
      enabled: true,
      visibilityMode: 'global',
      resolutionMode: 'alchemy',
      craftingCheck: STILL_CHECK,
      alchemy: { checkMode: 'simple' },
      features: {
        essences: true,
        recipeCategories: true,
        itemTags: true,
        gathering: false,
        alchemy: true,
      },
      essenceDefinitions: ESSENCES,
      categories: ['Draughts'],
      itemTags: tagsOf(STILL_COMPONENTS),
      components: STILL_COMPONENTS,
      componentCategories: componentCategoryVocabulary(STILL_COMPONENTS),
      recipeItemDefinitions: [],
      tools: [],
      gatheringRealmSettings: { enabled: false },
    },
  ];
}

/** The smith who crafts and brews, and the still-keeper whose pack holds the one missing grip. */
export const DEMO_ACTORS = Object.freeze({
  definitions: [
    {
      id: 'demo-actor-hilde',
      name: 'Hilde Ashanvil',
      img: `${ICON_BASE}/skills/trades/smithing-anvil-silver-red.webp`,
    },
    {
      id: 'demo-actor-maren',
      name: 'Maren of the Still',
      img: `${ICON_BASE}/tools/laboratory/alembic-glass-ball-blue.webp`,
    },
  ],
  inventories: {
    'demo-actor-hilde': {
      'ed-iron-ore': 6,
      'ed-charcoal': 5,
      'ed-iron-ingot': 2,
      'ed-steel-ingot': 4,
      'ed-longsword': 2,
      'ed-tool-crucible': 1,
      'ed-tool-hammer': 1,
      'ed-tool-anvil': 1,
      'hm-bitterfern': 3,
      'hm-moonbell': 2,
      'hm-embercap': 2,
      'hm-stonecrop': 3,
      'hm-brimstone': 2,
      'hm-empty-phial': 4,
    },
    'demo-actor-maren': {
      'ed-oiled-grip': 2,
    },
  },
});

/** The persisted demo content, shaped as `buildLabContent()` returns the lab's. */
export function buildDemoContent() {
  return {
    systems: buildSystems(),
    recipes: [...FORGE_RECIPES, ...STILL_RECIPES],
    components: [...FORGE_COMPONENTS, ...STILL_COMPONENTS],
    tools: FORGE_TOOLS,
    recipeItems: [],
  };
}
