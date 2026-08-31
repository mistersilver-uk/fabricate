/**
 * The crafting-system corpus fixture the Scoped Entity Definitions equivalence guard runs over
 * (issue 1359, part of epic 1357).
 *
 * WHY A SHARED FIXTURE RATHER THAN A LITERAL PER CASE. The acceptance bar for this change is the
 * ABSENCE of change: with every world setting unwritten, `_normalizeSystem` must emit byte-for-byte
 * what the pre-#1359 tree emitted. That claim is only worth anything if the corpus it is made over
 * actually EXERCISES the pruning paths the union basis now gates — component essence quantities,
 * essence source components, tool prerequisites, and the two category icon maps. So the fixture is
 * built once, here, and every case in `tests/scoped-definition-read-and-basis.test.js` derives from
 * it.
 *
 * EVERY ID IS EXPLICIT AND EVERY VALUE IS DETERMINISTIC. `_normalizeSystem` mints an id through
 * `foundry.utils.randomID()` for any entry that lacks one, so a fixture with an implicit id could
 * never be compared against a checked-in golden. The floors below are asserted by the suite for the
 * same reason `craftingDefinitionWriteShape.golden.json` carries a non-vacuousness floor: a fixture
 * that silently shrank to one component would still be "deep-equal to the golden" and would prove
 * nothing at all.
 *
 * THE ADVERSARIAL VARIANTS ARE DERIVED, NOT RE-AUTHORED. Each one empties exactly ONE in-system
 * array while leaving a record elsewhere still referencing an id of that type, which is the state
 * the epic's migration produces on a client whose world setting has not replicated yet. On the
 * pre-#1359 tree each of those prunes; under the Valid Id Basis each is retained, because an empty
 * array plus an unseeded world store is an UNKNOWN basis rather than an empty one.
 */

/**
 * The non-vacuousness floors the equivalence suite asserts before it compares anything.
 *
 * @type {Readonly<{components: number, essences: number, tools: number,
 *   componentCategories: number, recipeCategories: number, componentCategoryIcons: number,
 *   categoryIcons: number}>}
 */
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
    // id and an authored uuid. This is the reference the component basis gates: with `components`
    // empty and the basis unknown, the authored `sourceItemUuid` must SURVIVE rather than being
    // resolved away to `null`. It carries its own uuid because the retention has nothing to retain
    // otherwise — an essence with only a component id is not an adversarial fixture, it is an
    // empty one.
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
    // them. They give `_characterLibraryBasis` a non-empty legacy half, so the character-library
    // pruning stays live and cannot be confused with the scope basis this change adds.
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

/**
 * The corpus with ONE in-system array emptied, leaving every reference to it in place.
 *
 * This is the shape the epic's migration produces on a client that has not yet received the world
 * setting: the legacy half is gone and the world half is unwritten, so the basis is UNKNOWN. The
 * pre-#1359 tree prunes against it; this change must retain.
 *
 * @param {'components'|'essenceDefinitions'|'componentCategories'|'categories'} key
 * @returns {object}
 */
export function corpusWithEmptied(key) {
  return scopedDefinitionCorpus({ [key]: [] });
}
