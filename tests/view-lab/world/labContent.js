/**
 * The View Lab's fixture content.
 *
 * `tests/helpers/fullAuthoringFixture.js` is a feature-BREADTH fixture — one system, two
 * components, one recipe — built to prove every authoring surface round-trips. That is exactly
 * right for an import/export test and exactly wrong for a screenshot: every list renders with one
 * row, which reads as broken rather than as evidence. This module supplies the volume layer.
 *
 * Three systems, because the surfaces need them:
 * - `lab-smithing` (simple resolution) is the default populated system.
 * - `lab-herbalism` (progressive) carries gathering, realms, and multi-step recipes.
 * - `lab-alchemy` (alchemy mode) exists from the start because `isAlchemyTabAvailable` decides
 *   whether the player nav rail has four entries or five. Adding it later would change the rail
 *   width and reflow every previously captured player frame.
 *
 * Imagery uses real Foundry core icon paths, served from the harvested cache. `AGENTS.md` already
 * requires fixture data to use real Foundry or dnd5e raster paths rather than invented preview art;
 * a placeholder would also collapse the intrinsic dimensions of anything sized by its image.
 */

/** Foundry serves `public/` at the web root; the lab mounts the harvested cache here. */
export const ICON_BASE = '/@foundry-chrome/icons';

export const LAB_SYSTEM_IDS = Object.freeze({
  SMITHING: 'lab-smithing',
  HERBALISM: 'lab-herbalism',
  ALCHEMY: 'lab-alchemy',
});

/**
 * One component definition plus the world item it originates from. The lab needs both: the crafting
 * system stores the component, and `fromUuid` has to resolve the origin or every thumbnail and
 * source name renders unresolved.
 */
function component(id, name, icon, extra = {}) {
  return {
    id,
    name,
    originItemUuid: `Item.${id}`,
    img: `${ICON_BASE}/${icon}`,
    categories: [],
    tags: [],
    difficulty: 1,
    essences: {},
    aliasItemUuids: [],
    ...extra,
  };
}

const SMITHING_COMPONENTS = [
  component('sm-iron-ore', 'Iron Ore', 'commodities/stone/ore-chunk-brown.webp', { categories: ['Raw Materials'], tags: ['ore'], difficulty: 2, essences: { earth: 2 } }),
  component('sm-copper-ore', 'Copper Ore', 'commodities/stone/ore-chunk-copper-orange.webp', { categories: ['Raw Materials'], tags: ['ore'], difficulty: 2, essences: { earth: 1 } }),
  component('sm-silver-ore', 'Silver Ore', 'commodities/stone/ore-chunk-blue.webp', { categories: ['Raw Materials'], tags: ['ore'], difficulty: 4, essences: { earth: 1, water: 1 } }),
  component('sm-iron-ingot', 'Iron Ingot', 'commodities/metal/ingot-worn-iron.webp', { categories: ['Refined'], tags: ['ingot'], difficulty: 3, essences: { earth: 2, fire: 1 } }),
  component('sm-steel-ingot', 'Steel Ingot', 'commodities/metal/ingot-stack-steel.webp', { categories: ['Refined'], tags: ['ingot'], difficulty: 5, essences: { earth: 2, fire: 2 } }),
  component('sm-silver-ingot', 'Silver Ingot', 'commodities/metal/ingot-engraved-silver.webp', { categories: ['Refined'], tags: ['ingot'], difficulty: 5, essences: { water: 2 } }),
  component('sm-coal', 'Coal', 'commodities/stone/ore-chunk-black.webp', { categories: ['Raw Materials'], tags: ['fuel'], difficulty: 1, essences: { fire: 2 } }),
  component('sm-leather', 'Tanned Leather', 'commodities/leather/fur-brown-gold.webp', { categories: ['Raw Materials'], tags: ['hide'], difficulty: 2 }),
  component('sm-oak-haft', 'Oak Haft', 'commodities/wood/kindling-stick-brown.webp', { categories: ['Raw Materials'], tags: ['wood'], difficulty: 1, essences: { earth: 1 } }),
  component('sm-whetstone', 'Whetstone', 'commodities/stone/stone-pile-grey.webp', { categories: ['Raw Materials'], tags: ['abrasive'], difficulty: 1 }),
  component('sm-ruby', 'Flawless Ruby', 'commodities/gems/gem-faceted-radiant-red.webp', { categories: ['Reagents'], tags: ['gem'], difficulty: 8, essences: { fire: 3 } }),
  component('sm-sapphire', 'Deep Sapphire', 'commodities/gems/gem-faceted-radiant-blue.webp', { categories: ['Reagents'], tags: ['gem'], difficulty: 8, essences: { water: 3 } }),
  component('sm-longsword', 'Longsword', 'weapons/swords/sword-guard-worn.webp', { categories: ['Finished Goods'], tags: ['weapon'], difficulty: 6 }),
  component('sm-greatsword', 'Greatsword', 'weapons/swords/greatsword-crossguard-blue.webp', { categories: ['Finished Goods'], tags: ['weapon'], difficulty: 9 }),
  component('sm-dagger', 'Fine Dagger', 'weapons/daggers/dagger-jeweled-purple.webp', { categories: ['Finished Goods'], tags: ['weapon'], difficulty: 4 }),
  component('sm-shield', 'Kite Shield', 'equipment/shield/heater-crystal-blue.webp', { categories: ['Finished Goods'], tags: ['armour'], difficulty: 7 }),
  component('sm-chainmail', 'Chainmail Shirt', 'equipment/chest/breastplate-scale-grey.webp', { categories: ['Finished Goods'], tags: ['armour'], difficulty: 8 }),
  component('sm-horseshoe', 'Horseshoe', 'sundries/misc/horseshoe-iron.webp', { categories: ['Finished Goods'], tags: ['sundry'], difficulty: 2 }),
];

const HERBALISM_COMPONENTS = [
  component('hb-moonleaf', 'Moonleaf', 'commodities/flowers/blooms-purple.webp', { categories: ['Herbs'], tags: ['reagent'], difficulty: 2, essences: { water: 1 } }),
  component('hb-sunroot', 'Sunroot', 'consumables/plants/dried-bundle-stems-sticks-roots-brown.webp', { categories: ['Herbs'], tags: ['reagent'], difficulty: 2, essences: { fire: 1 } }),
  component('hb-bitterbark', 'Bitterbark', 'commodities/wood/bark-tan.webp', { categories: ['Herbs'], tags: ['reagent'], difficulty: 3, essences: { earth: 1 } }),
  component('hb-frostcap', 'Frostcap Mushroom', 'consumables/mushrooms/campanulate-bell-shiny-blue.webp', { categories: ['Herbs'], tags: ['fungus'], difficulty: 4, essences: { water: 2 } }),
  component('hb-emberbloom', 'Emberbloom', 'commodities/flowers/blooms-pink.webp', { categories: ['Herbs'], tags: ['reagent'], difficulty: 5, essences: { fire: 2 } }),
  component('hb-spring-water', 'Spring Water', 'consumables/potions/bottle-round-corked-blue.webp', { categories: ['Bases'], tags: ['solvent'], difficulty: 1, essences: { water: 1 } }),
  component('hb-empty-vial', 'Empty Vial', 'consumables/potions/bottle-bulb-empty-glass.webp', { categories: ['Bases'], tags: ['vessel'], difficulty: 1 }),
  component('hb-mortar-dust', 'Ground Reagent', 'commodities/materials/bowl-powder-grey.webp', { categories: ['Bases'], tags: ['prepared'], difficulty: 2 }),
  component('hb-healing-potion', 'Potion of Healing', 'consumables/potions/bottle-bulb-corked-labeled-blue.webp', { categories: ['Potions'], tags: ['potion'], difficulty: 4 }),
  component('hb-greater-healing', 'Potion of Greater Healing', 'consumables/potions/bottle-bulb-corked-glowing-red.webp', { categories: ['Potions'], tags: ['potion'], difficulty: 7 }),
  component('hb-antitoxin', 'Antitoxin', 'consumables/potions/bottle-conical-corked-green.webp', { categories: ['Potions'], tags: ['potion'], difficulty: 5 }),
  component('hb-oil-sharpness', 'Oil of Sharpness', 'consumables/potions/bottle-conical-corked-yellow.webp', { categories: ['Potions'], tags: ['oil'], difficulty: 8 }),
  component('hb-salve', 'Woundmend Salve', 'consumables/potions/potion-jar-corked-green.webp', { categories: ['Potions'], tags: ['salve'], difficulty: 3 }),
  component('hb-tincture', 'Clarity Tincture', 'consumables/potions/bottle-round-corked-blue.webp', { categories: ['Potions'], tags: ['potion'], difficulty: 6 }),
];

const ALCHEMY_COMPONENTS = [
  component('al-quicksilver', 'Quicksilver', 'commodities/stone/ore-chunk-blue.webp', { categories: ['Reagents'], tags: ['metal'], difficulty: 6, essences: { water: 2, air: 1 } }),
  component('al-sulphur', 'Yellow Sulphur', 'commodities/materials/bowl-powder-yellow.webp', { categories: ['Reagents'], tags: ['mineral'], difficulty: 4, essences: { fire: 2 } }),
  component('al-saltpetre', 'Saltpetre', 'commodities/materials/bowl-powder-blue.webp', { categories: ['Reagents'], tags: ['mineral'], difficulty: 4, essences: { air: 2 } }),
  component('al-dragon-scale', 'Dragon Scale', 'commodities/materials/bowl-liquid-red.webp', { categories: ['Reagents'], tags: ['exotic'], difficulty: 9, essences: { fire: 3, earth: 1 } }),
  component('al-phoenix-ash', 'Phoenix Ash', 'commodities/materials/bowl-powder-grey.webp', { categories: ['Reagents'], tags: ['exotic'], difficulty: 10, essences: { fire: 4 } }),
  component('al-flask', 'Alchemist Flask', 'consumables/potions/bottle-conical-bubbling-blue.webp', { categories: ['Vessels'], tags: ['vessel'], difficulty: 1 }),
  component('al-firebomb', 'Alchemist Fire', 'consumables/potions/bottle-bulb-corked-glowing-red.webp', { categories: ['Products'], tags: ['bomb'], difficulty: 7 }),
  component('al-smokestick', 'Smokestick', 'sundries/misc/admission-ticket-white.webp', { categories: ['Products'], tags: ['utility'], difficulty: 5 }),
  component('al-acid-vial', 'Vial of Acid', 'consumables/potions/bottle-conical-corked-labeled-skull-poison-green.webp', { categories: ['Products'], tags: ['bomb'], difficulty: 6 }),
  component('al-elixir', 'Elixir of Vigour', 'consumables/potions/bottle-bulb-corked-labeled-blue.webp', { categories: ['Products'], tags: ['elixir'], difficulty: 8 }),
];

const ESSENCES = [
  { id: 'earth', name: 'Earth', description: 'Stone, ore, and root.', icon: 'fas fa-mountain', sourceComponentId: 'sm-iron-ore' },
  { id: 'fire', name: 'Fire', description: 'Forge-heat and ember.', icon: 'fas fa-fire', sourceComponentId: 'sm-coal' },
  { id: 'water', name: 'Water', description: 'Spring, tide, and frost.', icon: 'fas fa-droplet', sourceComponentId: 'hb-spring-water' },
  { id: 'air', name: 'Air', description: 'Breath and vapour.', icon: 'fas fa-wind', sourceComponentId: 'al-saltpetre' },
];

function recipe(id, name, systemId, icon, config) {
  return {
    id,
    name,
    craftingSystemId: systemId,
    img: `${ICON_BASE}/${icon}`,
    enabled: true,
    ingredientSets: [],
    resultGroups: [],
    toolIds: [],
    categories: [],
    ...config,
  };
}

const simpleSet = (setId, ingredients) => ({
  id: setId,
  ingredientOptions: [{ id: `${setId}-opt`, ingredients }],
});

const SMITHING_RECIPES = [
  recipe('sm-r-iron-ingot', 'Smelt Iron Ingot', LAB_SYSTEM_IDS.SMITHING, 'commodities/metal/ingot-worn-iron.webp', {
    description: 'Reduce iron ore over a coal fire into a workable ingot.',
    categories: ['Refining'],
    ingredientSets: [simpleSet('s1', { 'sm-iron-ore': 2, 'sm-coal': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-iron-ingot', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @abilities.str.mod', thresholds: { success: 10 } },
    toolIds: ['sm-tool-hammer'],
  }),
  recipe('sm-r-steel-ingot', 'Fold Steel Ingot', LAB_SYSTEM_IDS.SMITHING, 'commodities/metal/ingot-stack-steel.webp', {
    description: 'Fold carbon through hot iron until the billet rings true.',
    categories: ['Refining'],
    ingredientSets: [simpleSet('s1', { 'sm-iron-ingot': 2, 'sm-coal': 2 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-steel-ingot', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + 3', thresholds: { success: 14 } },
    toolIds: ['sm-tool-hammer', 'sm-tool-tongs'],
  }),
  recipe('sm-r-silver-ingot', 'Refine Silver Ingot', LAB_SYSTEM_IDS.SMITHING, 'commodities/metal/ingot-engraved-silver.webp', {
    description: 'Cupel the ore until only bright metal remains.',
    categories: ['Refining'],
    ingredientSets: [simpleSet('s1', { 'sm-silver-ore': 3, 'sm-coal': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-silver-ingot', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20', thresholds: { success: 12 } },
  }),
  recipe('sm-r-longsword', 'Forge Longsword', LAB_SYSTEM_IDS.SMITHING, 'weapons/swords/sword-guard-worn.webp', {
    description: 'A soldier’s blade: two ingots, a leather grip, and patience.',
    categories: ['Weaponsmithing'],
    ingredientSets: [
      {
        id: 's1',
        ingredientOptions: [
          { id: 'opt-steel', ingredients: { 'sm-steel-ingot': 2, 'sm-leather': 1 } },
          { id: 'opt-iron', ingredients: { 'sm-iron-ingot': 3, 'sm-leather': 1 } },
        ],
      },
    ],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-longsword', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 15 } },
    toolIds: ['sm-tool-hammer', 'sm-tool-anvil'],
  }),
  recipe('sm-r-greatsword', 'Forge Greatsword', LAB_SYSTEM_IDS.SMITHING, 'weapons/swords/greatsword-crossguard-blue.webp', {
    description: 'Twice the steel, twice the heat, and no room for error.',
    categories: ['Weaponsmithing'],
    ingredientSets: [simpleSet('s1', { 'sm-steel-ingot': 4, 'sm-leather': 1, 'sm-oak-haft': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-greatsword', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 18 } },
    toolIds: ['sm-tool-hammer', 'sm-tool-anvil'],
  }),
  recipe('sm-r-dagger', 'Forge Fine Dagger', LAB_SYSTEM_IDS.SMITHING, 'weapons/daggers/dagger-jeweled-purple.webp', {
    description: 'Small work, exacting work.',
    categories: ['Weaponsmithing'],
    ingredientSets: [simpleSet('s1', { 'sm-steel-ingot': 1, 'sm-ruby': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-dagger', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + 2', thresholds: { success: 13 } },
    toolIds: ['sm-tool-hammer'],
  }),
  recipe('sm-r-shield', 'Assemble Kite Shield', LAB_SYSTEM_IDS.SMITHING, 'equipment/shield/heater-crystal-blue.webp', {
    description: 'Banded oak faced with beaten steel.',
    categories: ['Armoursmithing'],
    ingredientSets: [simpleSet('s1', { 'sm-oak-haft': 2, 'sm-iron-ingot': 2, 'sm-leather': 2 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-shield', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20', thresholds: { success: 14 } },
    toolIds: ['sm-tool-anvil'],
  }),
  recipe('sm-r-chainmail', 'Rivet Chainmail Shirt', LAB_SYSTEM_IDS.SMITHING, 'equipment/chest/breastplate-scale-grey.webp', {
    description: 'Ten thousand rings, each closed by hand.',
    categories: ['Armoursmithing'],
    ingredientSets: [simpleSet('s1', { 'sm-iron-ingot': 6, 'sm-leather': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-chainmail', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 16 } },
    toolIds: ['sm-tool-hammer', 'sm-tool-tongs'],
  }),
  recipe('sm-r-horseshoe', 'Bend Horseshoe', LAB_SYSTEM_IDS.SMITHING, 'sundries/misc/horseshoe-iron.webp', {
    description: 'The apprentice’s first honest day.',
    categories: ['Sundries'],
    ingredientSets: [simpleSet('s1', { 'sm-iron-ingot': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-horseshoe', quantity: 4 }] }],
    toolIds: ['sm-tool-hammer'],
  }),
];

const HERBALISM_RECIPES = [
  recipe('hb-r-healing', 'Brew Potion of Healing', LAB_SYSTEM_IDS.HERBALISM, 'consumables/potions/bottle-bulb-corked-labeled-blue.webp', {
    description: 'Steep moonleaf in spring water until the colour turns.',
    categories: ['Potions'],
    ingredientSets: [simpleSet('s1', { 'hb-moonleaf': 2, 'hb-spring-water': 1, 'hb-empty-vial': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-healing-potion', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 12 } },
    toolIds: ['hb-tool-mortar'],
  }),
  recipe('hb-r-greater-healing', 'Brew Greater Healing', LAB_SYSTEM_IDS.HERBALISM, 'consumables/potions/bottle-bulb-corked-glowing-red.webp', {
    description: 'A three-stage reduction; the second stage cannot be rushed.',
    categories: ['Potions'],
    ingredientSets: [simpleSet('s1', { 'hb-healing-potion': 2, 'hb-emberbloom': 1, 'hb-mortar-dust': 2 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-greater-healing', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 16 } },
    toolIds: ['hb-tool-mortar', 'hb-tool-alembic'],
  }),
  recipe('hb-r-antitoxin', 'Distil Antitoxin', LAB_SYSTEM_IDS.HERBALISM, 'consumables/potions/bottle-conical-corked-green.webp', {
    description: 'Bitterbark draws the venom; frostcap holds it.',
    categories: ['Potions'],
    ingredientSets: [simpleSet('s1', { 'hb-bitterbark': 3, 'hb-frostcap': 1, 'hb-empty-vial': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-antitoxin', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + 4', thresholds: { success: 14 } },
    toolIds: ['hb-tool-alembic'],
  }),
  recipe('hb-r-salve', 'Grind Woundmend Salve', LAB_SYSTEM_IDS.HERBALISM, 'consumables/potions/potion-jar-corked-green.webp', {
    description: 'Coarse work, but it keeps.',
    categories: ['Salves'],
    ingredientSets: [simpleSet('s1', { 'hb-sunroot': 2, 'hb-mortar-dust': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-salve', quantity: 2 }] }],
    toolIds: ['hb-tool-mortar'],
  }),
  recipe('hb-r-tincture', 'Steep Clarity Tincture', LAB_SYSTEM_IDS.HERBALISM, 'consumables/potions/bottle-round-corked-blue.webp', {
    description: 'Moonleaf and frostcap, held just below a simmer.',
    categories: ['Potions'],
    ingredientSets: [simpleSet('s1', { 'hb-moonleaf': 3, 'hb-frostcap': 2, 'hb-spring-water': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-tincture', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + 2', thresholds: { success: 15 } },
  }),
  recipe('hb-r-oil', 'Render Oil of Sharpness', LAB_SYSTEM_IDS.HERBALISM, 'consumables/potions/bottle-conical-corked-yellow.webp', {
    description: 'The long reduction. Weeks, not hours.',
    categories: ['Oils'],
    ingredientSets: [simpleSet('s1', { 'hb-emberbloom': 3, 'hb-tincture': 1, 'hb-empty-vial': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-oil-sharpness', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 19 } },
    toolIds: ['hb-tool-alembic'],
  }),
  recipe('hb-r-grind', 'Grind Reagent', LAB_SYSTEM_IDS.HERBALISM, 'commodities/materials/bowl-powder-grey.webp', {
    description: 'Any dry reagent, reduced to a workable powder.',
    categories: ['Preparation'],
    ingredientSets: [
      {
        id: 's1',
        ingredientOptions: [
          { id: 'opt-bark', ingredients: { 'hb-bitterbark': 1 } },
          { id: 'opt-root', ingredients: { 'hb-sunroot': 1 } },
          { id: 'opt-cap', ingredients: { 'hb-frostcap': 1 } },
        ],
      },
    ],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-mortar-dust', quantity: 2 }] }],
    toolIds: ['hb-tool-mortar'],
  }),
];

const ALCHEMY_RECIPES = [
  recipe('al-r-fire', 'Alchemist Fire', LAB_SYSTEM_IDS.ALCHEMY, 'consumables/potions/bottle-bulb-corked-glowing-red.webp', {
    description: 'Sulphur and quicksilver, sealed before it wakes.',
    categories: ['Bombs'],
    ingredientSets: [simpleSet('s1', { 'al-sulphur': 2, 'al-quicksilver': 1, 'al-flask': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'al-firebomb', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 15 } },
  }),
  recipe('al-r-acid', 'Vial of Acid', LAB_SYSTEM_IDS.ALCHEMY, 'consumables/potions/bottle-conical-corked-labeled-skull-poison-green.webp', {
    description: 'Keep it in glass. Keep it away from the bench.',
    categories: ['Bombs'],
    ingredientSets: [simpleSet('s1', { 'al-saltpetre': 2, 'al-quicksilver': 1, 'al-flask': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'al-acid-vial', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + 3', thresholds: { success: 14 } },
  }),
  recipe('al-r-smokestick', 'Smokestick', LAB_SYSTEM_IDS.ALCHEMY, 'sundries/misc/admission-ticket-white.webp', {
    description: 'Cheap, filthy, and reliably effective.',
    categories: ['Utility'],
    ingredientSets: [simpleSet('s1', { 'al-saltpetre': 1, 'al-sulphur': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'al-smokestick', quantity: 2 }] }],
  }),
  recipe('al-r-elixir', 'Elixir of Vigour', LAB_SYSTEM_IDS.ALCHEMY, 'consumables/potions/bottle-bulb-corked-labeled-blue.webp', {
    description: 'The masterwork. Dragon scale is not optional.',
    categories: ['Elixirs'],
    ingredientSets: [simpleSet('s1', { 'al-dragon-scale': 1, 'al-quicksilver': 2, 'al-flask': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'al-elixir', quantity: 1 }] }],
    check: { enabled: true, rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 20 } },
  }),
  recipe('al-r-phoenix', 'Rekindling Draught', LAB_SYSTEM_IDS.ALCHEMY, 'consumables/potions/bottle-bulb-corked-glowing-red.webp', {
    description: 'Requires phoenix ash. Nobody has phoenix ash.',
    categories: ['Elixirs'],
    ingredientSets: [simpleSet('s1', { 'al-phoenix-ash': 1, 'al-elixir': 1 })],
    resultGroups: [{ id: 'rg', results: [{ componentId: 'al-elixir', quantity: 2 }] }],
    check: { enabled: true, rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 22 } },
  }),
];

const SMITHING_TOOLS = [
  { id: 'sm-tool-hammer', name: 'Smith’s Hammer', componentId: 'sm-iron-ingot', registeredItemUuid: 'Item.sm-tool-hammer', originItemUuid: 'Item.sm-tool-hammer', img: `${ICON_BASE}/tools/smithing/hammer-sledge-steel-grey.webp`, aliasItemUuids: [], breakage: { enabled: true, chance: 5 }, onBreak: { action: 'consume', replacementComponentId: null } },
  { id: 'sm-tool-anvil', name: 'Anvil', componentId: 'sm-steel-ingot', registeredItemUuid: 'Item.sm-tool-anvil', originItemUuid: 'Item.sm-tool-anvil', img: `${ICON_BASE}/tools/smithing/anvil.webp`, aliasItemUuids: [], breakage: { enabled: false, chance: 0 } },
  { id: 'sm-tool-tongs', name: 'Forge Tongs', componentId: 'sm-iron-ingot', registeredItemUuid: 'Item.sm-tool-tongs', originItemUuid: 'Item.sm-tool-tongs', img: `${ICON_BASE}/tools/smithing/tongs-steel-grey.webp`, aliasItemUuids: [], breakage: { enabled: true, chance: 2 } },
];

const HERBALISM_TOOLS = [
  { id: 'hb-tool-mortar', name: 'Mortar & Pestle', componentId: 'hb-mortar-dust', registeredItemUuid: 'Item.hb-tool-mortar', originItemUuid: 'Item.hb-tool-mortar', img: `${ICON_BASE}/tools/cooking/mortar-stone-yellow.webp`, aliasItemUuids: [], breakage: { enabled: false, chance: 0 } },
  { id: 'hb-tool-alembic', name: 'Glass Alembic', componentId: 'hb-empty-vial', registeredItemUuid: 'Item.hb-tool-alembic', originItemUuid: 'Item.hb-tool-alembic', img: `${ICON_BASE}/tools/laboratory/alembic-glass-ball-blue.webp`, aliasItemUuids: [], breakage: { enabled: true, chance: 8 }, onBreak: { action: 'consume', replacementComponentId: 'hb-empty-vial' } },
];

const GATHERING_TASKS = [
  { id: 'hb-task-forage', name: 'Forage for Herbs', description: 'Comb the undergrowth for anything still in season.', enabled: true, craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, img: `${ICON_BASE}/commodities/flowers/blooms-purple.webp`, dropTable: [
    { id: 'row-1', componentId: 'hb-moonleaf', quantity: 2, weight: 40 },
    { id: 'row-2', componentId: 'hb-sunroot', quantity: 1, weight: 30 },
    { id: 'row-3', componentId: 'hb-bitterbark', quantity: 1, weight: 20 },
    { id: 'row-4', componentId: 'hb-emberbloom', quantity: 1, weight: 10 },
  ] },
  { id: 'hb-task-fungi', name: 'Hunt Frostcaps', description: 'Shaded north faces, after the first frost.', enabled: true, craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, img: `${ICON_BASE}/consumables/mushrooms/campanulate-bell-shiny-blue.webp`, dropTable: [
    { id: 'row-1', componentId: 'hb-frostcap', quantity: 2, weight: 55 },
    { id: 'row-2', componentId: 'hb-moonleaf', quantity: 1, weight: 30 },
    { id: 'row-3', componentId: 'hb-bitterbark', quantity: 2, weight: 15 },
  ] },
  { id: 'hb-task-spring', name: 'Draw Spring Water', description: 'The clean spring, not the one by the mill.', enabled: true, craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, img: `${ICON_BASE}/consumables/potions/bottle-round-corked-blue.webp`, dropTable: [
    { id: 'row-1', componentId: 'hb-spring-water', quantity: 3, weight: 70 },
    { id: 'row-2', componentId: 'hb-frostcap', quantity: 1, weight: 30 },
  ] },
  { id: 'sm-task-prospect', name: 'Prospect the Seam', description: 'Follow the ore-bearing rock until it thins out.', enabled: true, craftingSystemId: LAB_SYSTEM_IDS.SMITHING, img: `${ICON_BASE}/commodities/stone/ore-chunk-brown.webp`, dropTable: [
    { id: 'row-1', componentId: 'sm-iron-ore', quantity: 3, weight: 50 },
    { id: 'row-2', componentId: 'sm-copper-ore', quantity: 2, weight: 30 },
    { id: 'row-3', componentId: 'sm-silver-ore', quantity: 1, weight: 15 },
    { id: 'row-4', componentId: 'sm-ruby', quantity: 1, weight: 5 },
  ] },
];

const GATHERING_EVENTS = [
  { id: 'hb-event-wolves', name: 'Wolf Pack', description: 'You are not the only thing foraging here.', enabled: true, craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, img: `${ICON_BASE}/creatures/mammals/wolf-howl-moon-black.webp`, weight: 15 },
  { id: 'hb-event-storm', name: 'Sudden Squall', description: 'The weather turns and the light goes.', enabled: true, craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, img: `${ICON_BASE}/magic/air/wind-tornado-funnel-blue.webp`, weight: 20 },
  { id: 'sm-event-collapse', name: 'Partial Collapse', description: 'The seam gives. Nobody is hurt, this time.', enabled: true, craftingSystemId: LAB_SYSTEM_IDS.SMITHING, img: `${ICON_BASE}/environment/wilderness/cave-entrance-mountain.webp`, weight: 10 },
];

const REALMS = [
  { id: 'hb-realm-verdant', craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, name: 'The Verdant Reach', description: 'Old forest, older paths.', enabled: true, sceneMappings: [{ sceneUuid: 'Scene.lab-map', sceneRegionUuid: 'Scene.lab-map.Region.grove' }] },
  { id: 'hb-realm-frostmark', craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, name: 'Frostmark Ridge', description: 'Above the treeline, below the snow.', enabled: true, sceneMappings: [] },
];

const ENVIRONMENTS = [
  { id: 'hb-env-grove', craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, name: 'Sunlit Grove', description: 'Open canopy, thick undergrowth, and a reliable spring.', enabled: true, selectionMode: 'targeted', compositionMode: 'automatic', sceneUuid: 'Scene.lab-map', img: `${ICON_BASE}/environment/wilderness/tree-oak.webp`, biomes: ['forest'], dangerTags: ['safe'], includedRealmIds: ['hb-realm-verdant'], enabledTaskIds: ['hb-task-forage', 'hb-task-spring'], enabledEventIds: ['hb-event-storm'], taskOrder: ['hb-task-forage', 'hb-task-spring'], taskDropRateAdjustments: {}, conditions: { weather: 'clear', timeOfDay: 'day', visibility: '', notes: '' }, nodeRuntime: { 'hb-task-forage': { remaining: 3, respawnAt: null } } },
  { id: 'hb-env-thicket', craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, name: 'Shadow Thicket', description: 'Dense, dark, and not entirely empty.', enabled: true, selectionMode: 'blind', compositionMode: 'manual', img: `${ICON_BASE}/environment/wilderness/tree-spruce-green.webp`, biomes: ['forest'], dangerTags: ['hazardous'], includedRealmIds: ['hb-realm-verdant'], forcedTaskIds: ['hb-task-forage', 'hb-task-fungi'], enabledEventIds: ['hb-event-wolves', 'hb-event-storm'], blindSelection: { weights: { 'hb-task-forage': 3, 'hb-task-fungi': 2 } }, conditions: { weather: 'rain', timeOfDay: 'night', visibility: '', notes: '' }, nodeRuntime: {} },
  { id: 'hb-env-ridge', craftingSystemId: LAB_SYSTEM_IDS.HERBALISM, name: 'Frostmark Ridge', description: 'Exposed, cold, and rich in frostcaps.', enabled: true, selectionMode: 'targeted', compositionMode: 'automatic', img: `${ICON_BASE}/environment/wilderness/cave-entrance-mountain-blue.webp`, biomes: ['mountain'], dangerTags: ['unsafe'], includedRealmIds: ['hb-realm-frostmark'], enabledTaskIds: ['hb-task-fungi'], enabledEventIds: ['hb-event-storm'], taskOrder: ['hb-task-fungi'], conditions: { weather: 'snow', timeOfDay: 'day', visibility: '', notes: '' }, nodeRuntime: { 'hb-task-fungi': { remaining: 0, respawnAt: 1_209_600 } } },
  { id: 'sm-env-mine', craftingSystemId: LAB_SYSTEM_IDS.SMITHING, name: 'Old Karrun Mine', description: 'Worked for six generations and not yet finished.', enabled: true, selectionMode: 'targeted', compositionMode: 'automatic', img: `${ICON_BASE}/environment/wilderness/cave-entrance-mountain.webp`, biomes: ['underground'], dangerTags: ['hazardous'], includedRealmIds: [], enabledTaskIds: ['sm-task-prospect'], enabledEventIds: ['sm-event-collapse'], taskOrder: ['sm-task-prospect'], conditions: { weather: 'clear', timeOfDay: 'day', visibility: '', notes: '' }, nodeRuntime: {} },
];

const GATHERING_VOCABULARIES = {
  biomes: [
    { id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: '' },
    { id: 'mountain', label: 'Mountain', icon: 'fas fa-mountain', colorToken: '' },
    { id: 'underground', label: 'Underground', icon: 'fas fa-dungeon', colorToken: '' },
    { id: 'coast', label: 'Coast', icon: 'fas fa-water', colorToken: '' },
  ],
  danger: ['safe', 'hazardous', 'unsafe', 'extreme'],
  weather: [
    { id: 'clear', label: 'Clear', icon: 'fas fa-sun', colorToken: '' },
    { id: 'rain', label: 'Rain', icon: 'fas fa-cloud-rain', colorToken: '' },
    { id: 'snow', label: 'Snow', icon: 'fas fa-snowflake', colorToken: '' },
  ],
  timeOfDay: [
    { id: 'day', label: 'Day', icon: 'fas fa-sun', colorToken: '' },
    { id: 'night', label: 'Night', icon: 'fas fa-moon', colorToken: '' },
  ],
};

function systemRules() {
  return {
    rewardSelectionMode: 'highestRankedDrop',
    rewardLimit: 1,
    eventSelectionMode: 'allDrops',
    eventLimit: 1,
    eventPolicy: 'successWithEvent',
    toolBreakagePolicy: 'perUse',
    biomeModifierAggregation: 'sum',
    blindCandidateGate: 'discovered',
    revealPolicy: 'onSuccess',
    revealScope: 'party',
    eventVisibility: 'gm',
    dropModifierMode: 'character',
  };
}

/**
 * Build the persisted world content: exactly the shapes `game.settings` holds in production, so
 * `CraftingSystemManager.initialize()` and `RecipeManager.initialize()` load and normalize them
 * through the real code paths rather than being handed pre-normalized objects.
 *
 * @returns {{systems: object[], recipes: object[], environments: object[], gatheringConfig: object, realms: object[]}}
 */
export function buildLabContent() {
  const systems = [
    {
      id: LAB_SYSTEM_IDS.SMITHING,
      name: 'Karrun Forgecraft',
      description: 'The dwarven smithing tradition of the Karrun deeps: ore to ingot to blade.',
      img: `${ICON_BASE}/tools/smithing/anvil.webp`,
      enabled: true,
      visibilityMode: 'global',
      resolutionMode: 'simple',
      features: { essences: true, recipeCategories: true, itemTags: true, gathering: true },
      essenceDefinitions: ESSENCES,
      categories: ['Refining', 'Weaponsmithing', 'Armoursmithing', 'Sundries'],
      itemTags: ['ore', 'ingot', 'fuel', 'hide', 'wood', 'gem', 'weapon', 'armour', 'sundry', 'abrasive'],
      components: SMITHING_COMPONENTS,
      recipeItemDefinitions: [{ id: 'sm-book', name: 'Forgecraft Folio' }],
      tools: SMITHING_TOOLS,
      gatheringRealms: [],
      gatheringRealmSettings: { revealMode: 'alwaysVisible', modifierVisibility: 'visible' },
    },
    {
      id: LAB_SYSTEM_IDS.HERBALISM,
      name: 'Greenwarden Herbalism',
      description: 'Field herbalism as the Greenwardens teach it, from foraging to the long distillation.',
      img: `${ICON_BASE}/tools/cooking/mortar-stone-yellow.webp`,
      enabled: true,
      visibilityMode: 'global',
      resolutionMode: 'progressive',
      features: { essences: true, recipeCategories: true, itemTags: true, gathering: true },
      essenceDefinitions: ESSENCES,
      categories: ['Potions', 'Salves', 'Oils', 'Preparation'],
      itemTags: ['reagent', 'fungus', 'solvent', 'vessel', 'prepared', 'potion', 'oil', 'salve'],
      components: HERBALISM_COMPONENTS,
      recipeItemDefinitions: [{ id: 'hb-book', name: 'Greenwarden Field Notes' }],
      tools: HERBALISM_TOOLS,
      gatheringRealms: REALMS,
      gatheringRealmSettings: { revealMode: 'onDiscovery', modifierVisibility: 'visible' },
    },
    {
      id: LAB_SYSTEM_IDS.ALCHEMY,
      name: 'Verrin Alchemy',
      description: 'Transmutative alchemy: reagents combined by essence rather than by recipe.',
      img: `${ICON_BASE}/consumables/potions/bottle-conical-bubbling-blue.webp`,
      enabled: true,
      visibilityMode: 'global',
      resolutionMode: 'simple',
      alchemyMode: true,
      features: { essences: true, recipeCategories: true, itemTags: true, gathering: false, alchemy: true },
      essenceDefinitions: ESSENCES,
      categories: ['Bombs', 'Utility', 'Elixirs'],
      itemTags: ['metal', 'mineral', 'exotic', 'vessel', 'bomb', 'utility', 'elixir'],
      components: ALCHEMY_COMPONENTS,
      recipeItemDefinitions: [],
      tools: [],
      gatheringRealms: [],
      gatheringRealmSettings: { revealMode: 'alwaysVisible', modifierVisibility: 'visible' },
    },
  ];

  const gatheringConfig = {
    vocabularies: GATHERING_VOCABULARIES,
    conditions: { weather: 'clear', timeOfDay: 'day' },
    tasks: GATHERING_TASKS,
    events: GATHERING_EVENTS,
    systems: {
      [LAB_SYSTEM_IDS.HERBALISM]: {
        rules: systemRules(),
        tasks: GATHERING_TASKS.filter((task) => task.craftingSystemId === LAB_SYSTEM_IDS.HERBALISM),
        events: GATHERING_EVENTS.filter((event) => event.craftingSystemId === LAB_SYSTEM_IDS.HERBALISM),
        conditions: {
          weather: { enabled: true, current: 'clear', values: GATHERING_VOCABULARIES.weather },
          timeOfDay: { enabled: true, current: 'day', values: GATHERING_VOCABULARIES.timeOfDay },
        },
        characterModifiers: [
          { id: 'hb-mod-skilled', name: 'Skilled Forager', description: 'Trained in the field.', value: 10, enabled: true },
          { id: 'hb-mod-tired', name: 'Exhausted', description: 'A long day already.', value: -15, enabled: true },
        ],
      },
      [LAB_SYSTEM_IDS.SMITHING]: {
        rules: systemRules(),
        tasks: GATHERING_TASKS.filter((task) => task.craftingSystemId === LAB_SYSTEM_IDS.SMITHING),
        events: GATHERING_EVENTS.filter((event) => event.craftingSystemId === LAB_SYSTEM_IDS.SMITHING),
        conditions: {
          weather: { enabled: false, current: 'clear', values: GATHERING_VOCABULARIES.weather },
          timeOfDay: { enabled: true, current: 'day', values: GATHERING_VOCABULARIES.timeOfDay },
        },
        characterModifiers: [],
      },
    },
  };

  return {
    systems,
    recipes: [...SMITHING_RECIPES, ...HERBALISM_RECIPES, ...ALCHEMY_RECIPES],
    environments: ENVIRONMENTS,
    gatheringConfig,
    realms: REALMS,
    components: [...SMITHING_COMPONENTS, ...HERBALISM_COMPONENTS, ...ALCHEMY_COMPONENTS],
    tools: [...SMITHING_TOOLS, ...HERBALISM_TOOLS],
  };
}
