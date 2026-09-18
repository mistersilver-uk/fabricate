/**
 * The crafting-system corpus fixture the Scoped Entity Definitions equivalence guard runs over
 * (issue 1359, part of epic 1357). WHY A SHARED FIXTURE RATHER THAN A LITERAL PER CASE.
 */

/** The non-vacuousness floors the equivalence suite asserts before it compares anything. */
export const SCOPED_CORPUS_FLOORS = Object.freeze({
  components: 6,
  essences: 4,
  tools: 3,
  componentCategories: 3,
  recipeCategories: 2,
  componentCategoryIcons: 3,
  categoryIcons: 2,
});

const ESSENCES = [
  { id: 'ess-fire', name: 'Fire', description: 'Heat', iconCode: 'fas fa-fire' },
  { id: 'ess-earth', name: 'Earth', description: 'Stone', iconCode: 'fas fa-mountain' },
  {
    id: 'ess-water',
    name: 'Water',
    description: 'Flow',
    iconCode: 'fas fa-droplet',
    // An essence whose behaviour is sourced from a MANAGED COMPONENT, carrying BOTH the component
    // id and an authored uuid.
    sourceComponentId: 'cmp-ash-salt',
    sourceItemUuid: 'Compendium.world.materials.Item.ashsalt00000001',
  },
  { id: 'ess-air', name: 'Air', description: 'Breath', iconCode: 'fas fa-wind', enabled: false },
];

const COMPONENTS = [
  {
    id: 'cmp-ash-salt',
    name: 'Ash Salt',
    img: 'icons/commodities/materials/bowl-powder-grey.webp',
    description: 'A grey crystalline residue.',
    originItemUuid: 'Compendium.world.materials.Item.ashsalt00000001',
    category: 'reagent',
    tags: ['alchemical'],
    essences: { 'ess-fire': 2, 'ess-earth': 1 },
    difficulty: 2,
  },
  {
    id: 'cmp-iron-ore',
    name: 'Iron Ore',
    img: 'icons/commodities/metal/ore-chunk-iron.webp',
    description: 'Raw ore.',
    originItemUuid: 'Compendium.world.materials.Item.ironore000000001',
    category: 'ore',
    tags: ['metal'],
    essences: { 'ess-earth': 3 },
    difficulty: 1,
  },
  {
    id: 'cmp-iron-ingot',
    name: 'Iron Ingot',
    img: 'icons/commodities/metal/ingot-stack-steel.webp',
    description: 'A smelted bar.',
    originItemUuid: 'Compendium.world.materials.Item.ironingot0000001',
    category: 'ingot',
    tags: ['metal', 'refined'],
    essences: { 'ess-earth': 2, 'ess-fire': 1 },
  },
  {
    id: 'cmp-spring-water',
    name: 'Spring Water',
    img: 'icons/consumables/potions/potion-flask-corked-blue.webp',
    description: 'Clean water.',
    originItemUuid: 'Compendium.world.materials.Item.springwater00001',
    category: 'reagent',
    essences: { 'ess-water': 4 },
  },
  {
    id: 'cmp-charcoal',
    name: 'Charcoal',
    img: 'icons/commodities/materials/lump-coal-black.webp',
    description: 'Burnt wood.',
    originItemUuid: 'Compendium.world.materials.Item.charcoal00000001',
    category: 'reagent',
    essences: { 'ess-fire': 3 },
  },
  {
    id: 'cmp-whetstone',
    name: 'Whetstone',
    img: 'icons/tools/smithing/whetstone-block-grey.webp',
    description: 'A honing block.',
    originItemUuid: 'Compendium.world.tools.Item.whetstone00000001',
    category: 'general',
    essences: { 'ess-earth': 1 },
  },
];

const TOOLS = [
  {
    id: 'tool-hammer',
    label: "Smith's Hammer",
    name: "Smith's Hammer",
    img: 'icons/tools/smithing/hammer-sledge-steel-grey.webp',
    enabled: true,
    // Item-sourced, so `deriveToolSourceFromComponents` leaves it alone.
    originItemUuid: 'Compendium.world.tools.Item.hammer0000000001',
    registeredItemUuid: 'Compendium.world.tools.Item.hammer0000000001',
    prerequisites: { enabled: true, ids: ['prq-smiths-tools'], gateMode: 'usability' },
    breakage: { mode: 'breakageChance', breakageChance: 10 },
  },
  {
    id: 'tool-crucible',
    label: 'Crucible',
    name: 'Crucible',
    img: 'icons/tools/smithing/crucible-steel-grey.webp',
    enabled: true,
    // COMPONENT-LINKED and carrying no source refs of its own, so its refs are derived from
    // `cmp-whetstone` during normalization. That derivation is the component-basis reader on the
    // tool path.
    componentId: 'cmp-whetstone',
    prerequisites: { enabled: true, ids: ['prq-smiths-tools'], gateMode: 'usability' },
    breakage: { mode: 'limitedUses', maxUses: 5 },
  },
  {
    id: 'tool-mortar',
    label: 'Mortar and Pestle',
    name: 'Mortar and Pestle',
    img: 'icons/tools/laboratory/mortar-pestle-yellow.webp',
    enabled: false,
    originItemUuid: 'Compendium.world.tools.Item.mortar0000000001',
    registeredItemUuid: 'Compendium.world.tools.Item.mortar0000000001',
    breakage: { mode: 'none' },
  },
];

/**
 * The corpus, freshly built on every call so a case may mutate its own copy.
 *
 * @param {object} [overrides] Shallow overrides applied to the system record.
 * @returns {object} A raw (un-normalized) crafting system record.
 */
export function scopedDefinitionCorpus(overrides = {}) {
  return {
    id: 'sys-scoped',
    name: 'Scoped Smithing',
    description: 'A corpus that exercises every reference the Valid Id Basis gates.',
    enabled: true,
    resolutionMode: 'simple',
    features: { essences: true, salvage: true, multiStepRecipes: true },
    essenceDefinitions: structuredClone(ESSENCES),
    components: structuredClone(COMPONENTS),
    tools: structuredClone(TOOLS),
    // The two INDEPENDENT vocabularies, each with its own icon map. They are gated by DIFFERENT
    // bases, so both are populated and both are emptied separately by the adversarial variants.
    componentCategories: ['ore', 'ingot', 'reagent'],
    componentCategoryIcons: {
      ore: 'fas fa-gem',
      ingot: 'fas fa-bars',
      reagent: 'fas fa-flask',
    },
    categories: ['smithing', 'alchemy'],
    categoryIcons: { smithing: 'fas fa-hammer', alchemy: 'fas fa-flask' },
    itemTags: ['metal', 'alchemical', 'refined'],
    // The legacy in-system character libraries, still carried until the 1.28.0 migration strips
    // them.
    characterPrerequisites: [
      {
        id: 'prq-smiths-tools',
        name: "Smith's Tools",
        path: 'tools.smith.value',
        op: 'gte',
        value: 1,
      },
    ],
    modifiers: [{ id: 'mod-medicine', label: 'Medicine', expression: '@abilities.med.mod' }],
    craftingCheck: {
      enabled: true,
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['mod-medicine'],
    },
    salvageCraftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['mod-medicine'] },
    gatheringCraftingCheck: {
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['mod-medicine'],
    },
    toolBreakage: { authority: 'toolSpecific' },
    ...overrides,
  };
}

/** The corpus with ONE in-system array emptied, leaving every reference to it in place. */
export function corpusWithEmptied(key) {
  return scopedDefinitionCorpus({ [key]: [] });
}
