/**
 * The View Lab's fixture content.
 *
 * `tests/helpers/fullAuthoringFixture.js` is a feature-BREADTH fixture — one system, two
 * components, one recipe — built to prove every authoring surface round-trips. That is exactly
 * right for an import/export test and exactly wrong for a screenshot: every list renders with one
 * row, which reads as broken rather than as evidence. This module supplies the volume layer.
 *
 * Five systems, one per canonical resolution mode, because each mode draws a different recipe
 * detail body and a different manager Results tab — a mode with no system is a rendering path with
 * no photograph:
 * - `lab-smithing` (simple, global visibility) is the default populated system.
 * - `lab-herbalism` (progressive, knowledge-gated) carries gathering, realms, and multi-step
 *   recipes, and is what makes the Books & Scrolls and Knowledge rail entries exist.
 * - `lab-alchemy` (alchemy, restricted) exists from the start because `isAlchemyTabAvailable`
 *   decides whether the player nav rail has four entries or five. Adding it later would change the
 *   rail width and reflow every previously captured player frame. Restricted visibility is what
 *   makes the Access rail entry exist.
 * - `lab-jewelry` (routedByIngredients) routes on the chosen ingredient set's `resultGroupId`.
 * - `lab-runework` (routedByCheck) routes on the system check's outcome tier.
 *
 * Imagery uses real Foundry core icon paths, served from the harvested cache. `AGENTS.md` already
 * requires fixture data to use real Foundry or dnd5e raster paths rather than invented preview art;
 * a placeholder would also collapse the intrinsic dimensions of anything sized by its image.
 */

/** Foundry serves `public/` at the web root; the lab mounts the harvested cache here. */
export const ICON_BASE = '/@foundry-chrome/icons';

/**
 * The origin item both Air Shard participations point at.
 *
 * `InventoryListingBuilder` collapses owned rows on `item.uuid` ALONE, so a stack that backs a
 * component in two systems has to be ONE document with ONE uuid claimed by both component
 * definitions. Naming it here keeps the two halves from drifting apart into two cards.
 */
export const SHARED_AIR_SHARD_UUID = 'Item.lab-air-shard';

export const LAB_SYSTEM_IDS = Object.freeze({
  SMITHING: 'lab-smithing',
  HERBALISM: 'lab-herbalism',
  ALCHEMY: 'lab-alchemy',
  JEWELRY: 'lab-jewelry',
  RUNEWORK: 'lab-runework',
});

/**
 * One component definition plus the world item it originates from. The lab needs both: the crafting
 * system stores the component, and `fromUuid` has to resolve the origin or every thumbnail and
 * source name renders unresolved.
 */
function component(id, name, icon, { categories = [], ...extra } = {}) {
  return {
    id,
    name,
    originItemUuid: `Item.${id}`,
    img: `${ICON_BASE}/${icon}`,
    // SINGULAR, and translated from the authored list here rather than at every call site.
    // `CraftingSystemManager._normalizeComponent` reads `item.category`; a `categories` ARRAY is
    // simply dropped, which is what this fixture used to hand it — so every component landed in
    // the reserved `general` bucket and the browser's "Group by category" toggle grouped a single
    // undifferentiated pile while claiming otherwise. The authored list stays the input because
    // it reads as intent; only the first entry can survive, because a component HAS one category.
    category: categories[0] ?? '',
    tags: [],
    difficulty: 1,
    essences: {},
    aliasItemUuids: [],
    ...extra,
  };
}

/**
 * The system-owned component category vocabulary.
 *
 * A sibling of the recipe `categories` vocabulary and deliberately not an alias of it (see
 * `CraftingSystemManager._normalizeSystem`): a component category is never offered as a recipe
 * category. Derived from what the components themselves carry so the two cannot drift, in first-
 * appearance order — the manager renders the vocabulary as an ASSIGNMENT target (the bulk-edit
 * category picker offers every entry with no count), so an entry no component currently holds is
 * still meaningful.
 *
 * @param {object[]} components Component definitions built by {@link component}.
 * @returns {string[]} The de-duplicated category vocabulary.
 */
function componentCategoryVocabulary(components) {
  return [...new Set(components.map((entry) => entry.category).filter(Boolean))];
}

const SMITHING_COMPONENTS = [
  component('sm-iron-ore', 'Iron Ore', 'commodities/stone/ore-chunk-brown.webp', {
    categories: ['Raw Materials'],
    tags: ['ore'],
    difficulty: 2,
    essences: { earth: 2 },
  }),
  component('sm-copper-ore', 'Copper Ore', 'commodities/stone/ore-chunk-copper-orange.webp', {
    categories: ['Raw Materials'],
    tags: ['ore'],
    difficulty: 2,
    essences: { earth: 1 },
  }),
  component('sm-silver-ore', 'Silver Ore', 'commodities/stone/ore-chunk-blue.webp', {
    categories: ['Raw Materials'],
    tags: ['ore'],
    difficulty: 4,
    essences: { earth: 1, water: 1 },
  }),
  component('sm-iron-ingot', 'Iron Ingot', 'commodities/metal/ingot-worn-iron.webp', {
    categories: ['Refined'],
    tags: ['ingot'],
    difficulty: 3,
    essences: { earth: 2, fire: 1 },
  }),
  component('sm-steel-ingot', 'Steel Ingot', 'commodities/metal/ingot-stack-steel.webp', {
    categories: ['Refined'],
    tags: ['ingot'],
    difficulty: 5,
    essences: { earth: 2, fire: 2 },
  }),
  component('sm-silver-ingot', 'Silver Ingot', 'commodities/metal/ingot-engraved-silver.webp', {
    categories: ['Refined'],
    tags: ['ingot'],
    difficulty: 5,
    essences: { water: 2 },
  }),
  component('sm-coal', 'Coal', 'commodities/stone/ore-chunk-black.webp', {
    categories: ['Raw Materials'],
    tags: ['fuel'],
    difficulty: 1,
    essences: { fire: 2 },
  }),
  component('sm-leather', 'Tanned Leather', 'commodities/leather/fur-brown-gold.webp', {
    categories: ['Raw Materials'],
    tags: ['hide'],
    difficulty: 2,
  }),
  component('sm-oak-haft', 'Oak Haft', 'commodities/wood/kindling-stick-brown.webp', {
    categories: ['Raw Materials'],
    tags: ['wood'],
    difficulty: 1,
    essences: { earth: 1 },
  }),
  component('sm-whetstone', 'Whetstone', 'commodities/stone/stone-pile-grey.webp', {
    categories: ['Raw Materials'],
    tags: ['abrasive'],
    difficulty: 1,
  }),
  component('sm-ruby', 'Flawless Ruby', 'commodities/gems/gem-faceted-radiant-red.webp', {
    categories: ['Reagents'],
    tags: ['gem'],
    difficulty: 8,
    essences: { fire: 3 },
  }),
  component('sm-sapphire', 'Deep Sapphire', 'commodities/gems/gem-faceted-radiant-blue.webp', {
    categories: ['Reagents'],
    tags: ['gem'],
    difficulty: 8,
    essences: { water: 3 },
  }),
  // Salvage authored on purpose. `_normalizeSalvage` clamps `enabled` off when a component has no
  // result group, so a component with `salvage.enabled` and nothing else renders the editor's
  // salvage section in its DISABLED state — the salvage frames need a component that actually
  // carries one. Smithing runs Simple salvage mode, where the clamp keeps exactly the first success
  // group, so one group is the whole authored config.
  component('sm-longsword', 'Longsword', 'weapons/swords/sword-guard-worn.webp', {
    categories: ['Finished Goods'],
    tags: ['weapon'],
    difficulty: 6,
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      toolIds: ['sm-tool-hammer'],
      dcOverride: 13,
      resultGroups: [
        {
          id: 'sm-salv-longsword',
          name: 'Reclaimed stock',
          results: [
            { componentId: 'sm-steel-ingot', quantity: 1 },
            { componentId: 'sm-leather', quantity: 1 },
          ],
        },
      ],
    },
  }),
  component('sm-greatsword', 'Greatsword', 'weapons/swords/greatsword-crossguard-blue.webp', {
    categories: ['Finished Goods'],
    tags: ['weapon'],
    difficulty: 9,
  }),
  component('sm-dagger', 'Fine Dagger', 'weapons/daggers/dagger-jeweled-purple.webp', {
    categories: ['Finished Goods'],
    tags: ['weapon'],
    difficulty: 4,
  }),
  component('sm-shield', 'Kite Shield', 'equipment/shield/heater-crystal-blue.webp', {
    categories: ['Finished Goods'],
    tags: ['armour'],
    difficulty: 7,
  }),
  // The counterpart: salvage configured but switched OFF, which is a different editor state from
  // "never configured" — the groups are still authored and still shown, greyed.
  component('sm-chainmail', 'Chainmail Shirt', 'equipment/chest/breastplate-scale-grey.webp', {
    categories: ['Finished Goods'],
    tags: ['armour'],
    difficulty: 8,
    salvage: {
      enabled: false,
      ingredientQuantity: 1,
      toolIds: [],
      resultGroups: [
        {
          id: 'sm-salv-chainmail',
          name: 'Rings and rivets',
          results: [{ componentId: 'sm-iron-ingot', quantity: 2 }],
        },
      ],
    },
  }),
  component('sm-horseshoe', 'Horseshoe', 'sundries/misc/horseshoe-iron.webp', {
    categories: ['Finished Goods'],
    tags: ['sundry'],
    difficulty: 2,
  }),
  // The required-tool disclosure (issue 777). One tool the salvaging actor HOLDS and one it
  // does not is the whole point: a config where every tool is available renders the section in
  // one state and implies the other does not exist. Availability is scoped to the TARGET actor
  // — `rowSources[0]`, crafting-actor-first — so this component is stocked on Vosk alone (who
  // carries the tongs and no anvil) rather than on Brenna, who owns the entire smithy.
  component('sm-toolchest', 'Field Toolchest', 'containers/chest/chest-worn-oak-tan.webp', {
    categories: ['Finished Goods'],
    tags: ['sundry'],
    difficulty: 3,
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      toolIds: ['sm-tool-tongs', 'sm-tool-anvil'],
      resultGroups: [
        {
          id: 'sm-salv-toolchest',
          name: 'Stripped fittings',
          results: [
            { componentId: 'sm-iron-ingot', quantity: 1 },
            { componentId: 'sm-oak-haft', quantity: 2 },
          ],
        },
      ],
    },
  }),
  // ── Source-description resolution (issue 800), as three END STATES ─────────────────────────────
  // The smoke reaches these three frames by RUNNING the two operations — `repairItemData` for the
  // second and `addItemFromUuid` for the third — against a locked world compendium. Neither is
  // reachable here: both live on `game.fabricate`, which the lab pins to `null` on purpose so that
  // every player seam proves it never reaches around the service layer. What IS fixture-able is
  // each operation's RESULT, so this is three components carrying the three stored descriptions,
  // rather than one component driven through two writes.
  //
  // The strings are the whole point of the frames, so they are authored to the same contract the
  // smoke asserts: the un-repaired one still carries raw `@UUID[...]` / `[[...]]` directives; the
  // repaired one carries resolved document NAMES and rendered roll text, has dropped the broken
  // reference WITH its separator (a stranded ", ." is the reported defect), and carries no
  // GM-gated span at all — a `data-visibility="gm"` fragment must never survive into a stored,
  // player-visible description.
  component(
    'sm-desc-raw',
    'Ember Quenching Oil',
    'consumables/potions/bottle-conical-corked-yellow.webp',
    {
      categories: ['Reagents'],
      tags: ['reagent'],
      difficulty: 5,
      description:
        'Quench with: @UUID[Compendium.dnd5e.items.Item.6BgAoYuMzpUuGaFB], ' +
        '@UUID[Compendium.dnd5e.items.Item.SFI4b4wJhg5aSJqL]{Flask of Oil}, ' +
        '@UUID[Compendium.dnd5e.items.Item.doesnotexist0000]. ' +
        'Burns for [[/r 1d4]]{1d4 rounds} dealing [[2d6]] fire damage.',
    }
  ),
  component(
    'sm-desc-repaired',
    'Rimefrost Quenching Oil',
    'consumables/potions/bottle-conical-corked-green.webp',
    {
      categories: ['Reagents'],
      tags: ['reagent'],
      difficulty: 5,
      description: 'Quench with: Acid, Flask of Oil. Burns for 1d4 rounds dealing 2d6 fire damage.',
    }
  ),
  component(
    'sm-desc-ingested',
    'Ashfall Reagent Case',
    'containers/chest/chest-worn-oak-tan.webp',
    {
      categories: ['Reagents'],
      tags: ['reagent'],
      difficulty: 3,
      description:
        'Contains: Acid, Flask of Oil. Each vial keeps for [[/r 2d6]]{2d6 days} once the seal is broken.',
    }
  ),
  // Half of the multi-system stack (issue 766). ONE physical item, registered as a component in
  // TWO systems, must collapse to a single inventory card carrying a system selector. The
  // collapse key is `item.uuid` ALONE, so both halves declare the SAME `originItemUuid` and the
  // actor holds exactly one stack of it — a second stack would count the quantity twice, which
  // is the defect the smoke's counterpart frame exists to disprove.
  component('sm-air-shard', 'Air Shard', 'commodities/gems/gem-faceted-radiant-blue.webp', {
    originItemUuid: SHARED_AIR_SHARD_UUID,
    categories: ['Reagents'],
    tags: ['gem'],
    difficulty: 6,
    essences: { air: 2 },
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        {
          id: 'sm-salv-air-shard',
          name: 'Shattered dust',
          results: [{ componentId: 'sm-whetstone', quantity: 1 }],
        },
      ],
    },
  }),
];

const HERBALISM_COMPONENTS = [
  component('hb-moonleaf', 'Moonleaf', 'commodities/flowers/blooms-purple.webp', {
    categories: ['Herbs'],
    tags: ['reagent'],
    difficulty: 2,
    essences: { water: 1 },
  }),
  component(
    'hb-sunroot',
    'Sunroot',
    'consumables/plants/dried-bundle-stems-sticks-roots-brown.webp',
    { categories: ['Herbs'], tags: ['reagent'], difficulty: 2, essences: { fire: 1 } }
  ),
  component('hb-bitterbark', 'Bitterbark', 'commodities/wood/bark-tan.webp', {
    categories: ['Herbs'],
    tags: ['reagent'],
    difficulty: 3,
    essences: { earth: 1 },
  }),
  component(
    'hb-frostcap',
    'Frostcap Mushroom',
    'consumables/mushrooms/campanulate-bell-shiny-blue.webp',
    { categories: ['Herbs'], tags: ['fungus'], difficulty: 4, essences: { water: 2 } }
  ),
  component('hb-emberbloom', 'Emberbloom', 'commodities/flowers/blooms-pink.webp', {
    categories: ['Herbs'],
    tags: ['reagent'],
    difficulty: 5,
    essences: { fire: 2 },
  }),
  component(
    'hb-spring-water',
    'Spring Water',
    'consumables/potions/bottle-round-corked-blue.webp',
    { categories: ['Bases'], tags: ['solvent'], difficulty: 1, essences: { water: 1 } }
  ),
  component('hb-empty-vial', 'Empty Vial', 'consumables/potions/bottle-bulb-empty-glass.webp', {
    categories: ['Bases'],
    tags: ['vessel'],
    difficulty: 1,
  }),
  component('hb-mortar-dust', 'Ground Reagent', 'commodities/materials/bowl-powder-grey.webp', {
    categories: ['Bases'],
    tags: ['prepared'],
    difficulty: 2,
  }),
  component(
    'hb-healing-potion',
    'Potion of Healing',
    'consumables/potions/bottle-bulb-corked-labeled-blue.webp',
    { categories: ['Potions'], tags: ['potion'], difficulty: 4 }
  ),
  component(
    'hb-greater-healing',
    'Potion of Greater Healing',
    'consumables/potions/bottle-bulb-corked-glowing-red.webp',
    { categories: ['Potions'], tags: ['potion'], difficulty: 7 }
  ),
  component('hb-antitoxin', 'Antitoxin', 'consumables/potions/bottle-conical-corked-green.webp', {
    categories: ['Potions'],
    tags: ['potion'],
    difficulty: 5,
  }),
  component(
    'hb-oil-sharpness',
    'Oil of Sharpness',
    'consumables/potions/bottle-conical-corked-yellow.webp',
    { categories: ['Potions'], tags: ['oil'], difficulty: 8 }
  ),
  component('hb-salve', 'Woundmend Salve', 'consumables/potions/potion-jar-corked-green.webp', {
    categories: ['Potions'],
    tags: ['salve'],
    difficulty: 3,
  }),
  component(
    'hb-tincture',
    'Clarity Tincture',
    'consumables/potions/bottle-round-corked-blue.webp',
    { categories: ['Potions'], tags: ['potion'], difficulty: 6 }
  ),
  // PROGRESSIVE salvage, which is a different player body from Simple's: an ORDERED stage list
  // the player may reorder before spending the roll. Herbalism carries it because salvage has
  // its own resolution mode, authored per system — so a world with only a Simple-mode system
  // leaves the whole progressive body, and its reorder affordance, unphotographed.
  //
  // ONE result group holding THREE ordered results, not three groups. Progressive salvage's
  // stages ARE the single group's results, and `ResolutionModeService.validateSalvage` faults a
  // multi-group progressive config as `blocks: 'visibility'` — which a non-GM viewer never sees
  // as an error, only as a component with no salvage panel at all. Each result's component needs
  // a difficulty ≥ 1 for the same reason (that is what ranks the stages).
  component(
    'hb-cracked-alembic',
    'Cracked Alembic',
    'tools/laboratory/alembic-glass-ball-blue.webp',
    {
      categories: ['Bases'],
      tags: ['vessel'],
      difficulty: 4,
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [
          {
            id: 'hb-salv-alembic',
            name: 'Stripped glassware',
            results: [
              { componentId: 'hb-empty-vial', quantity: 2 },
              { componentId: 'hb-mortar-dust', quantity: 1 },
              { componentId: 'hb-frostcap', quantity: 1 },
            ],
          },
        ],
      },
    }
  ),
  // The other half of the multi-system stack. Salvageable in BOTH systems, so the selector's
  // per-option affordance suffix ("<system> — Salvageable") is exercised on every option rather
  // than on one, and switching participation re-parameterises the whole detail body — including
  // swapping a Simple salvage panel for a progressive one.
  component('hb-air-shard', 'Air Shard', 'commodities/gems/gem-faceted-radiant-blue.webp', {
    originItemUuid: SHARED_AIR_SHARD_UUID,
    categories: ['Herbs'],
    tags: ['reagent'],
    difficulty: 6,
    essences: { air: 2 },
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        {
          id: 'hb-salv-air-shard',
          name: 'Condensed vapour',
          results: [
            { componentId: 'hb-spring-water', quantity: 2 },
            { componentId: 'hb-mortar-dust', quantity: 1 },
          ],
        },
      ],
    },
  }),
];

const ALCHEMY_COMPONENTS = [
  component('al-quicksilver', 'Quicksilver', 'commodities/stone/ore-chunk-blue.webp', {
    categories: ['Reagents'],
    tags: ['metal'],
    difficulty: 6,
    essences: { water: 2, air: 1 },
  }),
  component('al-sulphur', 'Yellow Sulphur', 'commodities/materials/bowl-powder-yellow.webp', {
    categories: ['Reagents'],
    tags: ['mineral'],
    difficulty: 4,
    essences: { fire: 2 },
  }),
  component('al-saltpetre', 'Saltpetre', 'commodities/materials/bowl-powder-blue.webp', {
    categories: ['Reagents'],
    tags: ['mineral'],
    difficulty: 4,
    essences: { air: 2 },
  }),
  component('al-dragon-scale', 'Dragon Scale', 'commodities/materials/bowl-liquid-red.webp', {
    categories: ['Reagents'],
    tags: ['exotic'],
    difficulty: 9,
    essences: { fire: 3, earth: 1 },
  }),
  component('al-phoenix-ash', 'Phoenix Ash', 'commodities/materials/bowl-powder-grey.webp', {
    categories: ['Reagents'],
    tags: ['exotic'],
    difficulty: 10,
    essences: { fire: 4 },
  }),
  component(
    'al-flask',
    'Alchemist Flask',
    'consumables/potions/bottle-conical-bubbling-blue.webp',
    { categories: ['Vessels'], tags: ['vessel'], difficulty: 1 }
  ),
  component(
    'al-firebomb',
    'Alchemist Fire',
    'consumables/potions/bottle-bulb-corked-glowing-red.webp',
    { categories: ['Products'], tags: ['bomb'], difficulty: 7 }
  ),
  component('al-smokestick', 'Smokestick', 'sundries/misc/admission-ticket-white.webp', {
    categories: ['Products'],
    tags: ['utility'],
    difficulty: 5,
  }),
  component(
    'al-acid-vial',
    'Vial of Acid',
    'consumables/potions/bottle-conical-corked-labeled-skull-poison-green.webp',
    { categories: ['Products'], tags: ['bomb'], difficulty: 6 }
  ),
  component(
    'al-elixir',
    'Elixir of Vigour',
    'consumables/potions/bottle-bulb-corked-labeled-blue.webp',
    { categories: ['Products'], tags: ['elixir'], difficulty: 8 }
  ),
];

// The two routed resolution modes. Five canonical modes exist — `simple`, `routedByIngredients`,
// `routedByCheck`, `progressive`, `alchemy` — and each draws a DIFFERENT recipe detail body
// (`IngredientRoutedBody.svelte` for one, the outcome-tier rail for the other) plus a different
// Results tab in the manager. Covering three of five left two whole rendering paths unphotographed.
const JEWELRY_COMPONENTS = [
  component('jw-ingot-silver', 'Silver Billet', 'commodities/metal/ingot-engraved-silver.webp', {
    categories: ['Stock'],
    tags: ['ingot'],
    difficulty: 4,
    essences: { water: 2 },
  }),
  component('jw-ingot-gold', 'Gold Billet', 'commodities/metal/ingot-gold.webp', {
    categories: ['Stock'],
    tags: ['ingot'],
    difficulty: 6,
    essences: { fire: 1, earth: 1 },
  }),
  component('jw-wire', 'Drawn Wire', 'commodities/metal/chain-silver.webp', {
    categories: ['Stock'],
    tags: ['wire'],
    difficulty: 3,
  }),
  component('jw-ring', 'Engraved Ring', 'equipment/finger/ring-band-engraved-lines-gold.webp', {
    categories: ['Finished Goods'],
    tags: ['jewellery'],
    difficulty: 5,
  }),
  component('jw-amulet', 'Chased Amulet', 'equipment/neck/amulet-round-engraved-gold.webp', {
    categories: ['Finished Goods'],
    tags: ['jewellery'],
    difficulty: 7,
  }),
  component('jw-circlet', 'Filigree Circlet', 'equipment/head/crown-gold-blue.webp', {
    categories: ['Finished Goods'],
    tags: ['jewellery'],
    difficulty: 9,
  }),
  // The MISCONFIGURED salvage cue. Jewelry resolves salvage by ROUTED outcome and authors no
  // routed salvage roll formula, which is the state the engine aborts on: `_buildSalvage` sets
  // `misconfigured` with `misconfiguredReason: 'routedNoFormula'` and the panel replaces its
  // whole body with the GM-config cue, banner suppressed.
  //
  // NOT the Simple multi-group misconfig the live smoke photographs. That one is UNREACHABLE
  // from persisted data: `_normalizeSalvage`'s Simple success-first retain-one clamp runs on
  // every save AND on `initialize()`, so a planted multi-group Simple config self-heals before
  // anything can render it. The smoke reproduces it with an in-memory post-init push, which the
  // lab's fixture layer has no equivalent of — see the case's `reaches` note.
  component('jw-bent-clasp', 'Bent Clasp', 'commodities/metal/chain-silver.webp', {
    categories: ['Stock'],
    tags: ['wire'],
    difficulty: 2,
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        {
          id: 'jw-salv-clasp',
          name: 'Reclaimed wire',
          results: [{ componentId: 'jw-wire', quantity: 1 }],
        },
      ],
    },
  }),
];

const RUNEWORK_COMPONENTS = [
  component('rw-bar', 'Rune Bar', 'commodities/metal/ingot-plain-steel.webp', {
    categories: ['Stock'],
    tags: ['ingot'],
    difficulty: 3,
    essences: { earth: 2 },
  }),
  component('rw-chalk', 'Binding Chalk', 'commodities/materials/bowl-powder-grey.webp', {
    categories: ['Stock'],
    tags: ['reagent'],
    difficulty: 1,
  }),
  component('rw-blade-master', 'Masterwork Runeblade', 'weapons/swords/sword-guard-blue.webp', {
    categories: ['Finished Goods'],
    tags: ['weapon'],
    difficulty: 10,
  }),
  component('rw-blade-standard', 'Runeblade', 'weapons/swords/sword-guard-worn.webp', {
    categories: ['Finished Goods'],
    tags: ['weapon'],
    difficulty: 6,
  }),
  component('rw-slag', 'Ruined Slag', 'commodities/metal/fragments-steel-barbed.webp', {
    categories: ['Waste'],
    tags: ['scrap'],
    difficulty: 1,
  }),
];

const ESSENCES = [
  {
    id: 'earth',
    name: 'Earth',
    description: 'Stone, ore, and root.',
    icon: 'fas fa-mountain',
    sourceComponentId: 'sm-iron-ore',
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'Forge-heat and ember.',
    icon: 'fas fa-fire',
    sourceComponentId: 'sm-coal',
  },
  {
    id: 'water',
    name: 'Water',
    description: 'Spring, tide, and frost.',
    icon: 'fas fa-droplet',
    sourceComponentId: 'hb-spring-water',
  },
  {
    id: 'air',
    name: 'Air',
    description: 'Breath and vapour.',
    icon: 'fas fa-wind',
    sourceComponentId: 'al-saltpetre',
  },
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

/**
 * One ingredient set in which every listed component is required.
 *
 * `IngredientSet` models "all groups required, one option satisfies each group", so a plain
 * requirement list becomes one single-option group per component — NOT one group with many options,
 * which would mean "any one of these will do".
 *
 * @param {string} setId Stable set id.
 * @param {Record<string, number>} ingredients componentId -> quantity.
 * @returns {object} A persisted-shape ingredient set.
 */
const simpleSet = (setId, ingredients) => ({
  id: setId,
  ingredientGroups: Object.entries(ingredients).map(([componentId, quantity], index) => ({
    id: `${setId}-g${index + 1}`,
    options: [{ componentId, quantity }],
  })),
});

/**
 * One set whose single group accepts any of several components — an interchangeable slot.
 *
 * @param {string} setId Stable set id.
 * @param {Array<[string, number]>} options componentId/quantity pairs.
 * @returns {object} A persisted-shape ingredient set.
 */
const eitherSet = (setId, options) => ({
  id: setId,
  ingredientGroups: [
    {
      id: `${setId}-g1`,
      options: options.map(([componentId, quantity]) => ({ componentId, quantity })),
    },
  ],
});

const SMITHING_RECIPES = [
  recipe(
    'sm-r-iron-ingot',
    'Smelt Iron Ingot',
    LAB_SYSTEM_IDS.SMITHING,
    'commodities/metal/ingot-worn-iron.webp',
    {
      description: 'Reduce iron ore over a coal fire into a workable ingot.',
      categories: ['Refining'],
      ingredientSets: [simpleSet('s1', { 'sm-iron-ore': 2, 'sm-coal': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-iron-ingot', quantity: 1 }] }],
      check: {
        enabled: true,
        rollFormula: '1d20 + @abilities.str.mod',
        thresholds: { success: 10 },
      },
      toolIds: ['sm-tool-hammer'],
    }
  ),
  recipe(
    'sm-r-steel-ingot',
    'Fold Steel Ingot',
    LAB_SYSTEM_IDS.SMITHING,
    'commodities/metal/ingot-stack-steel.webp',
    {
      description: 'Fold carbon through hot iron until the billet rings true.',
      categories: ['Refining'],
      ingredientSets: [simpleSet('s1', { 'sm-iron-ingot': 2, 'sm-coal': 2 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-steel-ingot', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + 3', thresholds: { success: 14 } },
      toolIds: ['sm-tool-hammer', 'sm-tool-tongs'],
    }
  ),
  recipe(
    'sm-r-silver-ingot',
    'Refine Silver Ingot',
    LAB_SYSTEM_IDS.SMITHING,
    'commodities/metal/ingot-engraved-silver.webp',
    {
      description: 'Cupel the ore until only bright metal remains.',
      categories: ['Refining'],
      // An UNMATCHED TAG requirement, deliberately added to a recipe no other case selects and
      // one that is already uncraftable (Brenna holds no silver ore), so the browser's
      // craftable-first ordering — and therefore every other case's row position — is unmoved.
      //
      // Nothing in the world carries item tags as FLAGS, which is what `tags` matching reads, so
      // this slot can never borrow an item image and must fall back to its own glyph. That is
      // the acceptance criterion the smoke's counterpart frame proves: never Foundry's
      // `item-bag.svg`. Every group here has exactly one option, so the rail is all-fixed and
      // opens no chooser — the world's only rail in that state.
      ingredientSets: [
        {
          id: 's1',
          ingredientGroups: [
            {
              id: 's1-g1',
              options: [{ componentId: 'sm-silver-ore', quantity: 3 }],
            },
            { id: 's1-g2', options: [{ componentId: 'sm-coal', quantity: 1 }] },
            {
              id: 's1-g3',
              name: 'Rune-etched stock',
              // `runic` is declared on the system and carried by NO component, which is the
              // point: `expandToComponentIds` finds nothing to expand to, so the tile has no
              // item image to borrow. A tag whose carriers merely happen to be unowned would
              // still expand (verified: `abrasive` expands to the whetstone Brenna holds and
              // the slot reads `met`), and the glyph fallback would never be exercised.
              options: [{ match: { type: 'tags', tags: ['runic'], tagMatch: 'any' }, quantity: 1 }],
            },
          ],
        },
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-silver-ingot', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20', thresholds: { success: 12 } },
    }
  ),
  recipe(
    'sm-r-longsword',
    'Forge Longsword',
    LAB_SYSTEM_IDS.SMITHING,
    'weapons/swords/sword-guard-worn.webp',
    {
      description: 'A soldier’s blade: two ingots, a leather grip, and patience.',
      categories: ['Weaponsmithing'],
      // Two genuine alternatives: steel is the good way, iron is the affordable way.
      ingredientSets: [
        simpleSet('s-steel', { 'sm-steel-ingot': 2, 'sm-leather': 1 }),
        simpleSet('s-iron', { 'sm-iron-ingot': 3, 'sm-leather': 1 }),
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-longsword', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 15 } },
      toolIds: ['sm-tool-hammer', 'sm-tool-anvil'],
    }
  ),
  recipe(
    'sm-r-greatsword',
    'Forge Greatsword',
    LAB_SYSTEM_IDS.SMITHING,
    'weapons/swords/greatsword-crossguard-blue.webp',
    {
      description: 'Twice the steel, twice the heat, and no room for error.',
      categories: ['Weaponsmithing'],
      ingredientSets: [simpleSet('s1', { 'sm-steel-ingot': 4, 'sm-leather': 1, 'sm-oak-haft': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-greatsword', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 18 } },
      toolIds: ['sm-tool-hammer', 'sm-tool-anvil'],
    }
  ),
  recipe(
    'sm-r-dagger',
    'Forge Fine Dagger',
    LAB_SYSTEM_IDS.SMITHING,
    'weapons/daggers/dagger-jeweled-purple.webp',
    {
      description: 'Small work, exacting work.',
      categories: ['Weaponsmithing'],
      // No LEGACY set-level `essences` map here, and none anywhere in this fixture, though the
      // live smoke's world has one. It cannot survive in a lab fixture: the lab seeds raw
      // recipes into `game.settings` and `RecipeManager.initialize()` migrates a stored
      // set-level essence map into a first-class essence GROUP (verified — the set comes back
      // with `essences: {}` and a uuid-named essence group). The smoke's counterpart escapes
      // that only because it is authored through `createRecipe` AFTER initialize.
      ingredientSets: [simpleSet('s1', { 'sm-steel-ingot': 1, 'sm-ruby': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-dagger', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + 2', thresholds: { success: 13 } },
      toolIds: ['sm-tool-hammer'],
    }
  ),
  recipe(
    'sm-r-shield',
    'Assemble Kite Shield',
    LAB_SYSTEM_IDS.SMITHING,
    'equipment/shield/heater-crystal-blue.webp',
    {
      description: 'Banded oak faced with beaten steel.',
      categories: ['Armoursmithing'],
      ingredientSets: [simpleSet('s1', { 'sm-oak-haft': 2, 'sm-iron-ingot': 2, 'sm-leather': 2 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-shield', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20', thresholds: { success: 14 } },
      toolIds: ['sm-tool-anvil'],
    }
  ),
  recipe(
    'sm-r-chainmail',
    'Rivet Chainmail Shirt',
    LAB_SYSTEM_IDS.SMITHING,
    'equipment/chest/breastplate-scale-grey.webp',
    {
      description: 'Ten thousand rings, each closed by hand.',
      categories: ['Armoursmithing'],
      // An essence requirement NO inventory can fully fund (Brenna's smithing carriers total 46
      // Fire against 60 needed). That is the only arrangement in which "Pick for me" is
      // photographable at all: the wand renders while a requirement is short, so a fundable
      // requirement makes the control vanish the moment it is pressed. Placed on an
      // already-uncraftable recipe no other case selects, so nothing reorders.
      complex: true,
      ingredientSets: [
        {
          id: 's1',
          ingredientGroups: [
            { id: 's1-g1', options: [{ componentId: 'sm-iron-ingot', quantity: 6 }] },
            { id: 's1-g2', options: [{ componentId: 'sm-leather', quantity: 1 }] },
            {
              id: 's1-g3',
              name: 'Fire essence',
              options: [{ match: { type: 'essence', essenceId: 'fire', amount: 60 } }],
            },
          ],
        },
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-chainmail', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 16 } },
      toolIds: ['sm-tool-hammer', 'sm-tool-tongs'],
    }
  ),
  recipe(
    'sm-r-horseshoe',
    'Bend Horseshoe',
    LAB_SYSTEM_IDS.SMITHING,
    'sundries/misc/horseshoe-iron.webp',
    {
      description: 'The apprentice’s first honest day.',
      categories: ['Sundries'],
      ingredientSets: [simpleSet('s1', { 'sm-iron-ingot': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-horseshoe', quantity: 4 }] }],
      toolIds: ['sm-tool-hammer'],
    }
  ),

  // ── Essence requirements ───────────────────────────────────────────────────────────────────────
  // An essence requirement is `match: { type: 'essence', essenceId, amount }` — a demand on the
  // essence POOL rather than on a named component, funded by whatever the crafter consumes. These
  // draw the essence pool rail, the carrier picker and the shopping-list essence rows, none of which
  // any component-only recipe reaches. They sit on the SMITHING system because it is the globally
  // visible one; on the knowledge-gated herbalism system a player who has learned nothing sees none
  // of it.
  recipe(
    'sm-r-emberbrand',
    'Emberbrand a Blade',
    LAB_SYSTEM_IDS.SMITHING,
    'weapons/swords/sword-guard-blue.webp',
    {
      description: 'Quench the blade in fire-bearing stock, whatever stock you happen to have.',
      categories: ['Weaponsmithing'],
      complex: true,
      ingredientSets: [
        {
          id: 'sm-set-ember',
          name: 'Fire-bearing stock',
          ingredientGroups: [
            { id: 'sm-set-ember-g1', options: [{ componentId: 'sm-longsword', quantity: 1 }] },
            {
              id: 'sm-set-ember-g2',
              name: 'Fire essence',
              options: [{ match: { type: 'essence', essenceId: 'fire', amount: 4 } }],
            },
          ],
        },
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-dagger', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 14 } },
      toolIds: ['sm-tool-hammer'],
    }
  ),
  recipe(
    'sm-r-deepbind',
    'Deepbind an Ingot',
    LAB_SYSTEM_IDS.SMITHING,
    'commodities/metal/ingot-stack-steel.webp',
    {
      description: 'Two essences at once, which one dual-bearing carrier can fund on its own.',
      categories: ['Refining'],
      complex: true,
      ingredientSets: [
        {
          id: 'sm-set-deepbind',
          name: 'Bound stock',
          ingredientGroups: [
            {
              id: 'sm-set-deepbind-g1',
              name: 'Earth essence',
              options: [{ match: { type: 'essence', essenceId: 'earth', amount: 6 } }],
            },
            {
              id: 'sm-set-deepbind-g2',
              name: 'Fire essence',
              options: [{ match: { type: 'essence', essenceId: 'fire', amount: 3 } }],
            },
          ],
        },
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-steel-ingot', quantity: 2 }] }],
      check: { enabled: true, rollFormula: '1d20 + 4', thresholds: { success: 16 } },
    }
  ),

  // ── Multi-step ─────────────────────────────────────────────────────────────────────────────────
  // Explicit `steps[]`, each with its own ingredient sets, results, tools and time requirement. The
  // step rail only renders for a recipe that has them, so without one the whole multi-step player
  // path — the rail, the per-step consumption panel, the advance affordance — is unphotographed.
  recipe(
    'sm-r-pattern-blade',
    'Forge a Pattern-Welded Blade',
    LAB_SYSTEM_IDS.SMITHING,
    'weapons/swords/greatsword-crossguard-blue.webp',
    {
      description: 'Three sittings: draw the billet, fold the pattern, hang the furniture.',
      categories: ['Weaponsmithing'],
      complex: true,
      steps: [
        {
          id: 'sm-step-draw',
          name: 'Draw the billet',
          description: 'Bring the stock to heat and draw it long.',
          ingredientSets: [simpleSet('sm-step-draw-s1', { 'sm-steel-ingot': 2, 'sm-coal': 2 })],
          resultGroups: [{ id: 'sm-step-draw-rg', results: [] }],
          toolIds: ['sm-tool-hammer', 'sm-tool-tongs'],
          timeRequirement: { hours: 4 },
        },
        {
          id: 'sm-step-fold',
          name: 'Fold the pattern',
          description: 'Fold and re-weld until the figure shows.',
          ingredientSets: [simpleSet('sm-step-fold-s1', { 'sm-coal': 3 })],
          resultGroups: [{ id: 'sm-step-fold-rg', results: [] }],
          toolIds: ['sm-tool-hammer', 'sm-tool-anvil'],
          timeRequirement: { hours: 8 },
        },
        {
          id: 'sm-step-furniture',
          name: 'Hang the furniture',
          description: 'Grip, guard and pommel, then the final edge.',
          ingredientSets: [
            simpleSet('sm-step-furniture-s1', { 'sm-leather': 1, 'sm-whetstone': 1 }),
          ],
          resultGroups: [
            {
              id: 'sm-step-furniture-rg',
              results: [{ componentId: 'sm-greatsword', quantity: 1 }],
            },
          ],
          timeRequirement: { hours: 2 },
        },
      ],
      check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 15 } },
    }
  ),
];

const HERBALISM_RECIPES = [
  recipe(
    'hb-r-healing',
    'Brew Potion of Healing',
    LAB_SYSTEM_IDS.HERBALISM,
    'consumables/potions/bottle-bulb-corked-labeled-blue.webp',
    {
      description: 'Steep moonleaf in spring water until the colour turns.',
      categories: ['Potions'],
      ingredientSets: [
        simpleSet('s1', { 'hb-moonleaf': 2, 'hb-spring-water': 1, 'hb-empty-vial': 1 }),
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-healing-potion', quantity: 1 }] }],
      check: {
        enabled: true,
        rollFormula: '1d20 + @abilities.int.mod',
        thresholds: { success: 12 },
      },
      toolIds: ['hb-tool-mortar'],
    }
  ),
  recipe(
    'hb-r-greater-healing',
    'Brew Greater Healing',
    LAB_SYSTEM_IDS.HERBALISM,
    'consumables/potions/bottle-bulb-corked-glowing-red.webp',
    {
      description: 'A three-stage reduction; the second stage cannot be rushed.',
      categories: ['Potions'],
      ingredientSets: [
        simpleSet('s1', { 'hb-healing-potion': 2, 'hb-emberbloom': 1, 'hb-mortar-dust': 2 }),
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-greater-healing', quantity: 1 }] }],
      check: {
        enabled: true,
        rollFormula: '1d20 + @abilities.int.mod',
        thresholds: { success: 16 },
      },
      toolIds: ['hb-tool-mortar', 'hb-tool-alembic'],
    }
  ),
  recipe(
    'hb-r-antitoxin',
    'Distil Antitoxin',
    LAB_SYSTEM_IDS.HERBALISM,
    'consumables/potions/bottle-conical-corked-green.webp',
    {
      description: 'Bitterbark draws the venom; frostcap holds it.',
      categories: ['Potions'],
      ingredientSets: [
        simpleSet('s1', { 'hb-bitterbark': 3, 'hb-frostcap': 1, 'hb-empty-vial': 1 }),
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-antitoxin', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + 4', thresholds: { success: 14 } },
      toolIds: ['hb-tool-alembic'],
    }
  ),
  recipe(
    'hb-r-salve',
    'Grind Woundmend Salve',
    LAB_SYSTEM_IDS.HERBALISM,
    'consumables/potions/potion-jar-corked-green.webp',
    {
      description: 'Coarse work, but it keeps.',
      categories: ['Salves'],
      ingredientSets: [simpleSet('s1', { 'hb-sunroot': 2, 'hb-mortar-dust': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-salve', quantity: 2 }] }],
      toolIds: ['hb-tool-mortar'],
    }
  ),
  recipe(
    'hb-r-tincture',
    'Steep Clarity Tincture',
    LAB_SYSTEM_IDS.HERBALISM,
    'consumables/potions/bottle-round-corked-blue.webp',
    {
      description: 'Moonleaf and frostcap, held just below a simmer.',
      categories: ['Potions'],
      ingredientSets: [
        simpleSet('s1', { 'hb-moonleaf': 3, 'hb-frostcap': 2, 'hb-spring-water': 1 }),
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-tincture', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + 2', thresholds: { success: 15 } },
    }
  ),
  recipe(
    'hb-r-oil',
    'Render Oil of Sharpness',
    LAB_SYSTEM_IDS.HERBALISM,
    'consumables/potions/bottle-conical-corked-yellow.webp',
    {
      description: 'The long reduction. Weeks, not hours.',
      categories: ['Oils'],
      ingredientSets: [
        simpleSet('s1', { 'hb-emberbloom': 3, 'hb-tincture': 1, 'hb-empty-vial': 1 }),
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-oil-sharpness', quantity: 1 }] }],
      check: {
        enabled: true,
        rollFormula: '1d20 + @abilities.int.mod',
        thresholds: { success: 19 },
      },
      toolIds: ['hb-tool-alembic'],
    }
  ),
  recipe(
    'hb-r-grind',
    'Grind Reagent',
    LAB_SYSTEM_IDS.HERBALISM,
    'commodities/materials/bowl-powder-grey.webp',
    {
      description: 'Any dry reagent, reduced to a workable powder.',
      categories: ['Preparation'],
      ingredientSets: [
        eitherSet('s1', [
          ['hb-bitterbark', 1],
          ['hb-sunroot', 1],
          ['hb-frostcap', 1],
        ]),
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'hb-mortar-dust', quantity: 2 }] }],
      toolIds: ['hb-tool-mortar'],
    }
  ),
];

const ALCHEMY_RECIPES = [
  recipe(
    'al-r-fire',
    'Alchemist Fire',
    LAB_SYSTEM_IDS.ALCHEMY,
    'consumables/potions/bottle-bulb-corked-glowing-red.webp',
    {
      description: 'Sulphur and quicksilver, sealed before it wakes.',
      categories: ['Bombs'],
      ingredientSets: [simpleSet('s1', { 'al-sulphur': 2, 'al-quicksilver': 1, 'al-flask': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'al-firebomb', quantity: 1 }] }],
      check: {
        enabled: true,
        rollFormula: '1d20 + @abilities.int.mod',
        thresholds: { success: 15 },
      },
    }
  ),
  recipe(
    'al-r-acid',
    'Vial of Acid',
    LAB_SYSTEM_IDS.ALCHEMY,
    'consumables/potions/bottle-conical-corked-labeled-skull-poison-green.webp',
    {
      description: 'Keep it in glass. Keep it away from the bench.',
      categories: ['Bombs'],
      ingredientSets: [simpleSet('s1', { 'al-saltpetre': 2, 'al-quicksilver': 1, 'al-flask': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'al-acid-vial', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + 3', thresholds: { success: 14 } },
    }
  ),
  recipe(
    'al-r-smokestick',
    'Smokestick',
    LAB_SYSTEM_IDS.ALCHEMY,
    'sundries/misc/admission-ticket-white.webp',
    {
      description: 'Cheap, filthy, and reliably effective.',
      categories: ['Utility'],
      ingredientSets: [simpleSet('s1', { 'al-saltpetre': 1, 'al-sulphur': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'al-smokestick', quantity: 2 }] }],
    }
  ),
  recipe(
    'al-r-elixir',
    'Elixir of Vigour',
    LAB_SYSTEM_IDS.ALCHEMY,
    'consumables/potions/bottle-bulb-corked-labeled-blue.webp',
    {
      description: 'The masterwork. Dragon scale is not optional.',
      categories: ['Elixirs'],
      ingredientSets: [
        simpleSet('s1', { 'al-dragon-scale': 1, 'al-quicksilver': 2, 'al-flask': 1 }),
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'al-elixir', quantity: 1 }] }],
      check: {
        enabled: true,
        rollFormula: '1d20 + @abilities.int.mod',
        thresholds: { success: 20 },
      },
    }
  ),
  recipe(
    'al-r-phoenix',
    'Rekindling Draught',
    LAB_SYSTEM_IDS.ALCHEMY,
    'consumables/potions/bottle-bulb-corked-glowing-red.webp',
    {
      description: 'Requires phoenix ash. Nobody has phoenix ash.',
      categories: ['Elixirs'],
      ingredientSets: [simpleSet('s1', { 'al-phoenix-ash': 1, 'al-elixir': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'al-elixir', quantity: 2 }] }],
      check: {
        enabled: true,
        rollFormula: '1d20 + @abilities.int.mod',
        thresholds: { success: 22 },
      },
    }
  ),
];

const SMITHING_TOOLS = [
  {
    id: 'sm-tool-hammer',
    name: 'Smith’s Hammer',
    componentId: 'sm-iron-ingot',
    registeredItemUuid: 'Item.sm-tool-hammer',
    originItemUuid: 'Item.sm-tool-hammer',
    img: `${ICON_BASE}/tools/smithing/hammer-sledge-steel-grey.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'breakageChance', breakageChance: 5 },
    onBreak: { mode: 'destroy' },
  },
  {
    id: 'sm-tool-anvil',
    name: 'Anvil',
    componentId: 'sm-steel-ingot',
    registeredItemUuid: 'Item.sm-tool-anvil',
    originItemUuid: 'Item.sm-tool-anvil',
    img: `${ICON_BASE}/tools/smithing/anvil.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'limitedUses', maxUses: null },
  },
  {
    id: 'sm-tool-tongs',
    name: 'Forge Tongs',
    componentId: 'sm-iron-ingot',
    registeredItemUuid: 'Item.sm-tool-tongs',
    originItemUuid: 'Item.sm-tool-tongs',
    img: `${ICON_BASE}/tools/smithing/tongs-steel-grey.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'breakageChance', breakageChance: 2 },
  },
];

const HERBALISM_TOOLS = [
  {
    id: 'hb-tool-mortar',
    name: 'Mortar & Pestle',
    componentId: 'hb-mortar-dust',
    registeredItemUuid: 'Item.hb-tool-mortar',
    originItemUuid: 'Item.hb-tool-mortar',
    img: `${ICON_BASE}/tools/cooking/mortar-stone-yellow.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'limitedUses', maxUses: 25 },
  },
  {
    id: 'hb-tool-alembic',
    name: 'Glass Alembic',
    componentId: 'hb-empty-vial',
    registeredItemUuid: 'Item.hb-tool-alembic',
    originItemUuid: 'Item.hb-tool-alembic',
    img: `${ICON_BASE}/tools/laboratory/alembic-glass-ball-blue.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'breakageChance', breakageChance: 8 },
    onBreak: {
      mode: 'replaceWith',
      replacementTarget: { type: 'component', componentId: 'hb-empty-vial' },
    },
  },
];

/**
 * Herbalism's recipe-item library, and the caps the GM Knowledge surface is photographed against.
 *
 * Four definitions rather than one, because the Knowledge frames need four DIFFERENT shapes in one
 * roster: a capped book (so a copy can read "1 of 3 uses spent", "Spent", or "Inert"), an uncapped
 * scroll (whose Expend control must be disabled — writing nothing is not a silent no-op), a
 * `total`-scope party codex, which is the only shape that raises the Recipe-items tab's
 * ordering-hazard band, and a book with authored MEMBERSHIP.
 *
 * `registeredItemUuid` is what makes an owned copy resolve at all: `matchRecipeItemDefinition`
 * tests an owned item's uuid against the definition's union of source refs, and a definition with
 * no refs and no `roles` claim matches nothing — which is why the lab's single previous definition
 * produced an empty Knowledge roster while claiming to cover it.
 *
 * **Membership is confined to the ONE book nobody holds, and that is not tidiness — it is the only
 * arrangement that leaves the player frames alone.** `RecipeVisibilityService.evaluateRecipeAccess`
 * resolves a knowledge-gated recipe as `visible = granted || hasMatchedItem`, and `hasMatchedItem`
 * is computed over the crafting actor PLUS every component-source actor. The lab's
 * `lastComponentSources` is every actor in the world, so a held book with membership reveals its
 * member recipes in the player's crafting listing — six extra rows, which pushes the recipes the
 * player cases select onto page 2 and fails them. `hb-book` therefore carries the membership and
 * is deliberately unheld; it is the book Idrin's learned entries name, which is exactly the
 * `lostCopy` rung (the definition NAME is what survives when the copy is gone). The three HELD
 * definitions carry none, so each owned copy reads as the Type column's third face, `Incomplete` —
 * a book registered but not yet wired to its recipes, which is a real GM state and precisely what
 * this surface exists to audit.
 */
const HERBALISM_RECIPE_ITEMS = [
  {
    id: 'hb-book',
    name: 'Greenwarden Field Notes',
    registeredItemUuid: 'Item.hb-book',
    originItemUuid: 'Item.hb-book',
    img: `${ICON_BASE}/sundries/books/book-embossed-bound-brown.webp`,
    // The world's only authored membership. See the note above for why no HELD book has one.
    recipeIds: ['hb-r-healing', 'hb-r-salve', 'hb-r-grind'],
    caps: {
      item: { limitUses: true, maxUses: 3, whenSpent: 'inert' },
      learn: { limitLearning: true, learnsAllowed: 2, learnScope: 'perInstance' },
    },
  },
  {
    id: 'hb-primer',
    name: "Warden's Primer",
    registeredItemUuid: 'Item.hb-primer',
    originItemUuid: 'Item.hb-primer',
    img: `${ICON_BASE}/sundries/books/book-embossed-steel-green.webp`,
    recipeIds: [],
    caps: {
      // `inert` rather than `destroyed`: a spent copy that deletes itself cannot be photographed.
      item: { limitUses: true, maxUses: 3, whenSpent: 'inert' },
      learn: { limitLearning: true, learnsAllowed: 2, learnScope: 'perInstance' },
    },
  },
  {
    id: 'hb-scroll',
    name: 'Frostcap Scroll',
    registeredItemUuid: 'Item.hb-scroll',
    originItemUuid: 'Item.hb-scroll',
    img: `${ICON_BASE}/sundries/scrolls/scroll-bound-leather-tan.webp`,
    recipeIds: [],
    caps: { item: { limitUses: false }, learn: { limitLearning: false } },
  },
  {
    id: 'hb-codex',
    name: 'Warden Party Codex',
    registeredItemUuid: 'Item.hb-codex',
    originItemUuid: 'Item.hb-codex',
    img: `${ICON_BASE}/sundries/books/book-embossed-gold-red.webp`,
    recipeIds: [],
    caps: {
      item: { limitUses: true, maxUses: 2, whenSpent: 'inert' },
      // `total` is the party POOL: the budget is shared across every copy in the world, so
      // deleting a copy before erasing the memory it sourced strands a slot permanently. That is
      // the hazard the Recipe-items tab raises its warning band for.
      learn: { limitLearning: true, learnsAllowed: 2, learnScope: 'total' },
    },
  },
];

/**
 * The Tool Studio STRESS library, and why it lives on Runework.
 *
 * Five tools, one per state the smoke drives the Tool Studio into by hand: a long display label,
 * a flag-broken tool with populated repair requirements, a replace-with tool with its replacement
 * chosen, a check-immune tool, and a tool whose only prerequisite can be un-picked to reach the
 * blocking Validation state. Each is selected by `data-manager-tool-id`, so the frames do not
 * depend on library order.
 *
 * They are NOT added to Smithing, whose three tools the six `manager-tool-parity-*` frames already
 * photograph: five more rows would move the tools library frames, and the rail's "Tools" count
 * rides in every one of the ~60 default-system manager frames. Runework has no tools at all and is
 * rendered by two `beyond` coverage frames that never open the Tool Studio.
 */
const RUNEWORK_PREREQUISITES = [
  {
    id: 'rw-prereq-arcana',
    name: 'Trained in Arcana',
    icon: 'fas fa-hat-wizard',
    path: 'system.skills.arc.value',
    op: 'gte',
    value: 1,
  },
  {
    id: 'rw-prereq-int',
    name: 'Intelligence 13 or higher',
    icon: 'fas fa-brain',
    path: 'system.abilities.int.value',
    op: 'gte',
    value: 13,
  },
  {
    id: 'rw-prereq-attuned',
    name: 'Attuned to the Weave',
    icon: 'fas fa-wand-sparkles',
    path: 'system.attributes.attuned',
    op: 'isTrue',
  },
];

const RUNEWORK_TOOLS = [
  {
    id: 'rw-tool-stylus',
    name: 'Rune Stylus',
    // `label` is the user-authored DISPLAY override, and it is what the smoke types a long value
    // into. Authoring it here reaches the same overflow state without a keystroke.
    label: 'Masterwork Ashfall Rune Stylus of the Fifth Circle, Conclave Issue',
    componentId: null,
    registeredItemUuid: 'Item.rw-tool-stylus',
    originItemUuid: 'Item.rw-tool-stylus',
    img: `${ICON_BASE}/tools/scribal/pen-stylus-pencil.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'breakageChance', breakageChance: 12 },
    onBreak: { mode: 'destroy' },
    bonus: { enabled: true, expression: '+2' },
  },
  {
    id: 'rw-tool-mallet',
    name: 'Chasing Mallet',
    componentId: null,
    registeredItemUuid: 'Item.rw-tool-mallet',
    originItemUuid: 'Item.rw-tool-mallet',
    img: `${ICON_BASE}/tools/smithing/hammer-sledge-steel-grey.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'limitedUses', maxUses: 6 },
    // `flagBroken` is the ONLY on-break action that leaves a copy to repair, so it is what makes
    // the repair-requirements editor render its populated state rather than its empty one.
    onBreak: { mode: 'flagBroken' },
    repairRequirements: [
      {
        id: 'rw-repair-stock',
        name: 'Replacement head',
        options: [
          { componentId: 'rw-bar', quantity: 1 },
          { componentId: 'rw-slag', quantity: 2 },
        ],
      },
      {
        id: 'rw-repair-binding',
        name: 'Binding',
        options: [{ componentId: 'rw-chalk', quantity: 3 }],
      },
    ],
  },
  {
    id: 'rw-tool-punch',
    name: 'Rune Punch',
    componentId: null,
    registeredItemUuid: 'Item.rw-tool-punch',
    originItemUuid: 'Item.rw-tool-punch',
    img: `${ICON_BASE}/tools/smithing/tongs-steel-grey.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'diceExpression', formula: '1d20', threshold: 3 },
    // A CHOSEN replacement target: an unchosen one renders the picker in its empty state and
    // fails the editor's own `onBreak` validity check, which is a different frame entirely.
    onBreak: {
      mode: 'replaceWith',
      replacementTarget: { type: 'component', componentId: 'rw-slag' },
    },
  },
  {
    id: 'rw-tool-anvilstone',
    name: 'Ashfall Anvilstone',
    componentId: null,
    registeredItemUuid: 'Item.rw-tool-anvilstone',
    originItemUuid: 'Item.rw-tool-anvilstone',
    img: `${ICON_BASE}/tools/smithing/anvil.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'limitedUses', maxUses: null },
    onBreak: { mode: 'destroy' },
    // Read only while the SYSTEM's breakage authority is `checkDriven`, which is a per-system
    // setting the tools browser exposes as a radio pair — so the immune frame's case clicks that
    // segment before opening this tool rather than the fixture pinning the whole system to it.
    checkBreakable: false,
  },
  {
    id: 'rw-tool-caliper',
    name: 'Conclave Caliper',
    componentId: null,
    registeredItemUuid: 'Item.rw-tool-caliper',
    originItemUuid: 'Item.rw-tool-caliper',
    img: `${ICON_BASE}/tools/scribal/spectacles-glasses.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'limitedUses', maxUses: 3 },
    onBreak: { mode: 'destroy' },
    // ONE selected prerequisite, which is what makes the blocking Validation state reachable by a
    // click: `_normalizeToolPrerequisites` clamps `enabled` off whenever `ids` is empty, so a
    // persisted "enabled with nothing chosen" config self-heals and can never be photographed.
    // Un-checking the single row in the editor DRAFT is the only route to it — the same route the
    // smoke takes.
    prerequisites: { enabled: true, ids: ['rw-prereq-arcana'], gateMode: 'usability' },
  },
];

const GATHERING_TASKS = [
  {
    id: 'hb-task-forage',
    name: 'Forage for Herbs',
    description: 'Comb the undergrowth for anything still in season.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/commodities/flowers/blooms-purple.webp`,
    dropTable: [
      { id: 'row-1', componentId: 'hb-moonleaf', quantity: 2, weight: 40 },
      { id: 'row-2', componentId: 'hb-sunroot', quantity: 1, weight: 30 },
      { id: 'row-3', componentId: 'hb-bitterbark', quantity: 1, weight: 20 },
      { id: 'row-4', componentId: 'hb-emberbloom', quantity: 1, weight: 10 },
    ],
  },
  {
    id: 'hb-task-fungi',
    name: 'Hunt Frostcaps',
    description: 'Shaded north faces, after the first frost.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/consumables/mushrooms/campanulate-bell-shiny-blue.webp`,
    dropTable: [
      { id: 'row-1', componentId: 'hb-frostcap', quantity: 2, weight: 55 },
      { id: 'row-2', componentId: 'hb-moonleaf', quantity: 1, weight: 30 },
      { id: 'row-3', componentId: 'hb-bitterbark', quantity: 2, weight: 15 },
    ],
  },
  {
    id: 'hb-task-spring',
    name: 'Draw Spring Water',
    description: 'The clean spring, not the one by the mill.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/consumables/potions/bottle-round-corked-blue.webp`,
    dropTable: [
      { id: 'row-1', componentId: 'hb-spring-water', quantity: 3, weight: 70 },
      { id: 'row-2', componentId: 'hb-frostcap', quantity: 1, weight: 30 },
    ],
  },
  // ── Attemptable tasks ────────────────────────────────────────────────────────────────────────
  // The four tasks above browse correctly but cannot be ATTEMPTED: they carry the legacy
  // `dropTable`/`weight` shape, and `validateTaskConfiguration` rejects a d100 task with no
  // `dropRows` (verified live — the attempt returns `TASK_MISCONFIGURED`). Rather than restate
  // them (which would change every already-captured task row), the attemptable states are three
  // NEW tasks in the canonical `dropRows` shape the live smoke's library uses.
  //
  // `biomes: ['mountain']` is what keeps them contained. Composition is automatic and biome-
  // matched, and the four legacy tasks declare no biome at all, so they compose into every
  // environment; a biome-less new task would appear in Sunlit Grove and reflow the already-
  // captured gathering frames. Frostmark Ridge is the world's only mountain environment.
  {
    id: 'hb-task-slowbloom',
    name: 'Tend the Slow Bloom',
    description: 'Bank the frost off the crown and come back when it has opened.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/commodities/flowers/blooms-pink.webp`,
    biomes: ['mountain'],
    itemSelectionMode: 'highestRankedDrop',
    // TIMED. An attempt on this creates a waiting run instead of resolving, which is what makes
    // the "timed, ready" and "timed, already running" pair two different screens rather than one.
    timeRequirement: { hours: 6 },
    dropRows: [
      {
        id: 'hb-slowbloom-drop',
        componentId: 'hb-emberbloom',
        quantity: 1,
        dropRate: 85,
        enabled: true,
      },
    ],
  },
  {
    id: 'hb-task-icecap',
    name: 'Cut Icecap Fronds',
    description: 'The fronds shatter unless they are drawn off cold, through glass.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/consumables/mushrooms/campanulate-bell-shiny-blue.webp`,
    biomes: ['mountain'],
    itemSelectionMode: 'highestRankedDrop',
    // TOOL-BLOCKED for the gathering actor. Brenna is the smith: she carries the whole smithy
    // and none of Idrin's glassware, so this task's required alembic is missing and the attempt
    // is refused with TOOL_BLOCKED before any roll.
    toolIds: ['hb-tool-alembic'],
    dropRows: [
      {
        id: 'hb-icecap-drop',
        componentId: 'hb-frostcap',
        quantity: 2,
        dropRate: 75,
        enabled: true,
      },
    ],
  },
  {
    id: 'hb-task-ridgemoss',
    name: 'Scrape Ridge Moss',
    description: 'Slow, cold, certain work — the ridge always gives up its moss.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/commodities/wood/bark-tan.webp`,
    biomes: ['mountain'],
    itemSelectionMode: 'highestRankedDrop',
    // dropRate 100: the "after a successful gather" frame has to be reached by actually
    // gathering, and a probabilistic drop would make the frame depend on the seeded PRNG's mood.
    dropRows: [
      {
        id: 'hb-ridgemoss-drop',
        componentId: 'hb-bitterbark',
        quantity: 2,
        dropRate: 100,
        enabled: true,
      },
    ],
  },
  {
    id: 'sm-task-prospect',
    name: 'Prospect the Seam',
    description: 'Follow the ore-bearing rock until it thins out.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    img: `${ICON_BASE}/commodities/stone/ore-chunk-brown.webp`,
    dropTable: [
      { id: 'row-1', componentId: 'sm-iron-ore', quantity: 3, weight: 50 },
      { id: 'row-2', componentId: 'sm-copper-ore', quantity: 2, weight: 30 },
      { id: 'row-3', componentId: 'sm-silver-ore', quantity: 1, weight: 15 },
      { id: 'row-4', componentId: 'sm-ruby', quantity: 1, weight: 5 },
    ],
  },
];

const GATHERING_EVENTS = [
  {
    id: 'hb-event-wolves',
    name: 'Wolf Pack',
    description: 'You are not the only thing foraging here.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/creatures/mammals/wolf-howl-moon-black.webp`,
    weight: 15,
  },
  {
    id: 'hb-event-storm',
    name: 'Sudden Squall',
    description: 'The weather turns and the light goes.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/magic/air/wind-tornado-funnel-blue.webp`,
    weight: 20,
  },
  {
    id: 'sm-event-collapse',
    name: 'Partial Collapse',
    description: 'The seam gives. Nobody is hurt, this time.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    img: `${ICON_BASE}/environment/wilderness/cave-entrance-mountain.webp`,
    weight: 10,
  },
];

const REALMS = [
  {
    id: 'hb-realm-verdant',
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    name: 'The Verdant Reach',
    description: 'Old forest, older paths.',
    enabled: true,
    sceneMappings: [{ sceneUuid: 'Scene.lab-map', sceneRegionUuid: 'Scene.lab-map.Region.grove' }],
  },
  {
    id: 'hb-realm-frostmark',
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    name: 'Frostmark Ridge',
    description: 'Above the treeline, below the snow.',
    enabled: true,
    sceneMappings: [],
  },
];

/**
 * Smithing's realm, and the reason it exists.
 *
 * A realm-LOCKED environment card is the only environment state the player list cannot reach by
 * selection, and it needs three things at once: the Travel/Realms subsystem switched on for the
 * owning system (`gatheringRealmSettings.enabled`), an environment that REQUIRES a realm, and no
 * current realm resolving for the viewer. Turning realms on for herbalism would satisfy the first
 * but lock all three herbalism environments — every one of them names an included realm — and
 * take the already-captured environments, blind, and stacked frames with it. Smithing's only
 * existing environment is realm-ungated, so switching realms on there locks the new environment
 * below and nothing else.
 */
const SMITHING_REALMS = [
  {
    id: 'sm-realm-deep',
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    name: 'The Underdeep',
    description: 'Below the lowest worked gallery, where the old seams run.',
    enabled: true,
    sceneMappings: [],
  },
];

const ENVIRONMENTS = [
  {
    id: 'hb-env-grove',
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    name: 'Sunlit Grove',
    description: 'Open canopy, thick undergrowth, and a reliable spring.',
    enabled: true,
    selectionMode: 'targeted',
    compositionMode: 'automatic',
    sceneUuid: 'Scene.lab-map',
    img: `${ICON_BASE}/environment/wilderness/tree-oak.webp`,
    biomes: ['forest'],
    dangerTags: ['safe'],
    includedRealmIds: ['hb-realm-verdant'],
    enabledTaskIds: ['hb-task-forage', 'hb-task-spring'],
    enabledEventIds: ['hb-event-storm'],
    taskOrder: ['hb-task-forage', 'hb-task-spring'],
    taskDropRateAdjustments: {},
    conditions: { weather: 'clear', timeOfDay: 'day', visibility: '', notes: '' },
    nodeRuntime: { 'hb-task-forage': { remaining: 3, respawnAt: null } },
  },
  {
    id: 'hb-env-thicket',
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    name: 'Shadow Thicket',
    description: 'Dense, dark, and not entirely empty.',
    enabled: true,
    selectionMode: 'blind',
    compositionMode: 'manual',
    img: `${ICON_BASE}/environment/wilderness/tree-spruce-green.webp`,
    biomes: ['forest'],
    dangerTags: ['hazardous'],
    includedRealmIds: ['hb-realm-verdant'],
    forcedTaskIds: ['hb-task-forage', 'hb-task-fungi'],
    enabledEventIds: ['hb-event-wolves', 'hb-event-storm'],
    blindSelection: { weights: { 'hb-task-forage': 3, 'hb-task-fungi': 2 } },
    conditions: { weather: 'rain', timeOfDay: 'night', visibility: '', notes: '' },
    nodeRuntime: {},
  },
  {
    id: 'hb-env-ridge',
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    name: 'Frostmark Ridge',
    description: 'Exposed, cold, and rich in frostcaps.',
    enabled: true,
    selectionMode: 'targeted',
    compositionMode: 'automatic',
    img: `${ICON_BASE}/environment/wilderness/cave-entrance-mountain-blue.webp`,
    biomes: ['mountain'],
    dangerTags: ['unsafe'],
    includedRealmIds: ['hb-realm-frostmark'],
    enabledTaskIds: ['hb-task-fungi'],
    enabledEventIds: ['hb-event-storm'],
    taskOrder: ['hb-task-fungi'],
    conditions: { weather: 'snow', timeOfDay: 'day', visibility: '', notes: '' },
    nodeRuntime: { 'hb-task-fungi': { remaining: 0, respawnAt: 1_209_600 } },
  },
  {
    id: 'sm-env-mine',
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    name: 'Old Karrun Mine',
    description: 'Worked for six generations and not yet finished.',
    enabled: true,
    selectionMode: 'targeted',
    compositionMode: 'automatic',
    img: `${ICON_BASE}/environment/wilderness/cave-entrance-mountain.webp`,
    biomes: ['underground'],
    dangerTags: ['hazardous'],
    includedRealmIds: [],
    enabledTaskIds: ['sm-task-prospect'],
    enabledEventIds: ['sm-event-collapse'],
    taskOrder: ['sm-task-prospect'],
    conditions: { weather: 'clear', timeOfDay: 'day', visibility: '', notes: '' },
    nodeRuntime: {},
  },
  {
    id: 'sm-env-deepvault',
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    name: 'The Deepvault',
    description: 'Named on the old charts and reached by nobody currently above ground.',
    enabled: true,
    selectionMode: 'targeted',
    compositionMode: 'manual',
    img: `${ICON_BASE}/environment/wilderness/cave-entrance-mountain-blue.webp`,
    biomes: ['underground'],
    dangerTags: ['extreme'],
    // Realm-gated to a realm nobody is in. `evaluateLocationAvailability` answers
    // NO_CURRENT_REALM (no party sets a current realm for this system), so the listing surfaces
    // this as a LOCKED teaser — identity only, unselectable, with the "not in current realm"
    // header alert and the travel guidance in its tooltip. That is the one environment card
    // state selection cannot reach, and it sorts last, exactly as its smoke counterpart does.
    includedRealmIds: ['sm-realm-deep'],
    forcedTaskIds: ['sm-task-prospect'],
    enabledEventIds: ['sm-event-collapse'],
    conditions: { weather: 'clear', timeOfDay: 'day', visibility: '', notes: '' },
    nodeRuntime: {},
  },
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
/**
 * System-level crafting-check configuration.
 *
 * Not decoration: `evaluateSystemValidation` treats a progressive system with no progressive roll
 * formula as `blocks: 'system'`, which hides EVERY recipe in that system from a non-GM viewer.
 * The symptom is an empty player listing with no error anywhere — so this is load-bearing for the
 * herbalism frames specifically.
 */
const SIMPLE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  simple: { rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 12 } },
});

/**
 * `routedByIngredients`: an ingredient set names the result group it produces, so the SAME recipe
 * yields a ring or an amulet depending on which billet the crafter had. The set/group shapes here
 * are the ones the live smoke seeds (`smokeSeed.js`, "Smoke Cast Jewelry") — `resultGroupId` on the
 * set, a `name` on both halves, because the routed detail body renders the names, not the ids.
 */
const JEWELRY_RECIPES = [
  recipe(
    'jw-r-cast',
    'Cast Jewellery',
    LAB_SYSTEM_IDS.JEWELRY,
    'equipment/finger/ring-band-engraved-lines-gold.webp',
    {
      description: 'One mould, two routes: what comes out depends on what went in.',
      categories: ['Casting'],
      complex: true,
      ingredientSets: [
        {
          id: 'jw-set-silver',
          name: 'Silver route',
          resultGroupId: 'jw-grp-ring',
          ingredientGroups: [
            {
              id: 'jw-set-silver-g1',
              name: 'Billet',
              options: [{ componentId: 'jw-ingot-silver', quantity: 1 }],
            },
          ],
        },
        {
          id: 'jw-set-gold',
          name: 'Gold route',
          resultGroupId: 'jw-grp-amulet',
          ingredientGroups: [
            {
              id: 'jw-set-gold-g1',
              name: 'Billet',
              options: [{ componentId: 'jw-ingot-gold', quantity: 1 }],
            },
          ],
        },
      ],
      resultGroups: [
        { id: 'jw-grp-ring', name: 'Ring', results: [{ componentId: 'jw-ring', quantity: 1 }] },
        {
          id: 'jw-grp-amulet',
          name: 'Amulet',
          results: [{ componentId: 'jw-amulet', quantity: 1 }],
        },
      ],
    }
  ),
  recipe(
    'jw-r-circlet',
    'Draw and Chase a Circlet',
    LAB_SYSTEM_IDS.JEWELRY,
    'equipment/head/crown-gold-blue.webp',
    {
      description: 'Gold wire drawn thin, then chased over a former.',
      categories: ['Chasing'],
      complex: true,
      ingredientSets: [
        {
          id: 'jw-set-circlet',
          name: 'Wirework',
          resultGroupId: 'jw-grp-circlet',
          ingredientGroups: [
            {
              id: 'jw-set-circlet-g1',
              name: 'Wire',
              options: [{ componentId: 'jw-wire', quantity: 3 }],
            },
            {
              id: 'jw-set-circlet-g2',
              name: 'Billet',
              options: [{ componentId: 'jw-ingot-gold', quantity: 1 }],
            },
          ],
        },
      ],
      resultGroups: [
        {
          id: 'jw-grp-circlet',
          name: 'Circlet',
          results: [{ componentId: 'jw-circlet', quantity: 1 }],
        },
      ],
    }
  ),
];

/**
 * `routedByCheck`: the SYSTEM's routed check produces an outcome tier, and each result group claims
 * the tiers it answers to via `checkOutcomeIds`. A group with no tier is the fall-through.
 */
const RUNEWORK_RECIPES = [
  recipe(
    'rw-r-blade',
    'Inscribe a Runeblade',
    LAB_SYSTEM_IDS.RUNEWORK,
    'weapons/swords/sword-guard-blue.webp',
    {
      description: 'The same work every time; the roll decides what you are left holding.',
      categories: ['Inscription'],
      complex: true,
      ingredientSets: [
        {
          id: 'rw-set-stock',
          name: 'Stock',
          ingredientGroups: [
            {
              id: 'rw-set-stock-g1',
              name: 'Bar',
              options: [{ componentId: 'rw-bar', quantity: 1 }],
            },
            {
              id: 'rw-set-stock-g2',
              name: 'Chalk',
              options: [{ componentId: 'rw-chalk', quantity: 2 }],
            },
          ],
        },
      ],
      resultGroups: [
        {
          id: 'rw-grp-master',
          name: 'Masterwork Blade',
          checkOutcomeIds: ['rw-masterwork'],
          results: [{ componentId: 'rw-blade-master', quantity: 1 }],
        },
        {
          id: 'rw-grp-standard',
          name: 'Standard Blade',
          checkOutcomeIds: ['rw-standard'],
          results: [{ componentId: 'rw-blade-standard', quantity: 1 }],
        },
        // No group for the `rw-ruined` tier. `RecipeResultGroupCard`'s `outcomeTierOptions` is
        // success-filtered by design — a failed check produces the recipe's failure output, not a
        // routed result set — so a group claiming a failure tier renders its raw outcome ID and
        // raises a validation issue. That is the UI being right, and the fixture being wrong.
      ],
    }
  ),
];

/** The routed check the Runework system resolves against; each outcome id is claimed by a group. */
const ROUTED_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
  routed: {
    type: 'relative',
    rollFormula: '1d20 + @abilities.int.mod',
    dc: 12,
    thresholdMode: 'meet',
    relativeOutcomes: [
      { id: 'rw-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
      { id: 'rw-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
      { id: 'rw-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 },
    ],
  },
});

/**
 * Herbalism's SALVAGE check — a separate block from its crafting check.
 *
 * Progressive salvage REQUIRES an authored roll formula: without one `_buildSalvage` reports
 * `misconfigured` and replaces the stage list with the GM-config cue, so the roll formula here is
 * what makes the progressive body render at all.
 */
const PROGRESSIVE_SALVAGE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  progressive: {
    rollFormula: '1d20 + @abilities.int.mod',
    thresholds: { success: 10 },
    awardMode: 'equal',
  },
});

/**
 * The currency-unit ladder the Currency Units card is photographed against.
 *
 * Authored rather than seeded. `_normalizeCurrencyConfig` only falls back to a preset bundle for a
 * LEGACY `provider: 'system'` config, so a system that merely switches the feature on comes back
 * with an empty `units` array and an empty card — and the smoke reaches its own populated card by
 * clicking "Seed presets", which writes. Values mirror `DND5E_CURRENCY_PRESETS` because the lab's
 * `game.system.id` is `dnd5e`: the coins break down into their PARENT denomination rather than
 * flattening to copper, which is what draws the card's nested sub-unit rows.
 *
 * Electrum is included for the same reason the real preset has it — it is the ladder's only
 * side-branch, and a straight chain hides how a branch renders.
 */
const CURRENCY_UNITS = Object.freeze([
  { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
  {
    id: 'sp',
    label: 'Silver',
    abbreviation: 'sp',
    actorPath: 'system.currency.sp',
    contains: [{ unitId: 'cp', amount: 10 }],
  },
  {
    id: 'ep',
    label: 'Electrum',
    abbreviation: 'ep',
    actorPath: 'system.currency.ep',
    contains: [{ unitId: 'sp', amount: 5 }],
  },
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'sp', amount: 10 }],
  },
  {
    id: 'pp',
    label: 'Platinum',
    abbreviation: 'pp',
    actorPath: 'system.currency.pp',
    contains: [{ unitId: 'gp', amount: 10 }],
  },
]);

const PROGRESSIVE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  progressive: {
    rollFormula: '1d20 + @abilities.int.mod',
    thresholds: { success: 12 },
    stageAdvanceOnSuccess: 1,
  },
});

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
      // Salvage has its OWN resolution mode, authored independently of the crafting one. Simple
      // keeps exactly the first success group; the `routed`/`progressive` modes keep every group.
      salvageResolutionMode: 'simple',
      craftingCheck: SIMPLE_CHECK,
      features: {
        essences: true,
        recipeCategories: true,
        itemTags: true,
        gathering: true,
        multiStepRecipes: true,
      },
      essenceDefinitions: ESSENCES,
      categories: ['Refining', 'Weaponsmithing', 'Armoursmithing', 'Sundries'],
      itemTags: [
        'ore',
        'ingot',
        'fuel',
        'hide',
        'wood',
        'gem',
        'weapon',
        'armour',
        'sundry',
        'abrasive',
        // Declared but deliberately carried by nothing — the unmatched-tag requirement's tag.
        'runic',
      ],
      components: SMITHING_COMPONENTS,
      componentCategories: componentCategoryVocabulary(SMITHING_COMPONENTS),
      recipeItemDefinitions: [{ id: 'sm-book', name: 'Forgecraft Folio' }],
      tools: SMITHING_TOOLS,
      gatheringRealms: SMITHING_REALMS,
      // `enabled` is what switches the Travel/Realms subsystem on, and it is what makes an
      // environment's `includedRealmIds` bind at all: with it off, `_locationBlockedReasons`
      // short-circuits and NO environment can be realm-locked. See SMITHING_REALMS for why this
      // is smithing's flag and not herbalism's.
      gatheringRealmSettings: {
        enabled: true,
        revealMode: 'alwaysVisible',
        modifierVisibility: 'visible',
      },
    },
    {
      id: LAB_SYSTEM_IDS.HERBALISM,
      name: 'Greenwarden Herbalism',
      description:
        'Field herbalism as the Greenwardens teach it, from foraging to the long distillation.',
      img: `${ICON_BASE}/tools/cooking/mortar-stone-yellow.webp`,
      enabled: true,
      visibilityMode: 'knowledge',
      // Knowledge-gated on purpose: this is what makes the Books & Scrolls and Knowledge rail
      // entries exist at all (see buildCraftingNavItems).
      resolutionMode: 'progressive',
      craftingCheck: PROGRESSIVE_CHECK,
      // Salvage resolves on its OWN mode and its OWN check block, authored independently of the
      // crafting ones — `_buildSalvage` reads `salvageCraftingCheck`, never `craftingCheck`.
      // Progressive here so the player's ordered, reorderable stage body exists somewhere in the
      // world; smithing stays Simple-with-no-formula, which is the other body.
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: PROGRESSIVE_SALVAGE_CHECK,
      features: {
        essences: true,
        recipeCategories: true,
        itemTags: true,
        gathering: true,
        multiStepRecipes: true,
      },
      essenceDefinitions: ESSENCES,
      categories: ['Potions', 'Salves', 'Oils', 'Preparation'],
      itemTags: ['reagent', 'fungus', 'solvent', 'vessel', 'prepared', 'potion', 'oil', 'salve'],
      components: HERBALISM_COMPONENTS,
      componentCategories: componentCategoryVocabulary(HERBALISM_COMPONENTS),
      recipeItemDefinitions: HERBALISM_RECIPE_ITEMS,
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
      visibilityMode: 'restricted',
      // Restricted on purpose: this is what makes the Access rail entry exist.
      resolutionMode: 'alchemy',
      craftingCheck: SIMPLE_CHECK,
      features: {
        essences: true,
        recipeCategories: true,
        itemTags: true,
        gathering: false,
        alchemy: true,
      },
      essenceDefinitions: ESSENCES,
      categories: ['Bombs', 'Utility', 'Elixirs'],
      itemTags: ['metal', 'mineral', 'exotic', 'vessel', 'bomb', 'utility', 'elixir'],
      components: ALCHEMY_COMPONENTS,
      componentCategories: componentCategoryVocabulary(ALCHEMY_COMPONENTS),
      recipeItemDefinitions: [],
      tools: [],
      gatheringRealms: [],
      gatheringRealmSettings: { revealMode: 'alwaysVisible', modifierVisibility: 'visible' },
    },
    {
      id: LAB_SYSTEM_IDS.JEWELRY,
      name: 'Sablewright Jewellers',
      description:
        'Casting and chasing, where the ingredients you bring decide what you leave with.',
      img: `${ICON_BASE}/equipment/finger/ring-band-engraved-lines-gold.webp`,
      enabled: true,
      visibilityMode: 'global',
      resolutionMode: 'routedByIngredients',
      craftingCheck: SIMPLE_CHECK,
      // ROUTED salvage with no `salvageCraftingCheck` at all. Routed and progressive salvage both
      // require an authored formula to produce an outcome, so this is the misconfigured state —
      // deliberately, and it is the only misconfigured salvage reachable from persisted data.
      salvageResolutionMode: 'routed',
      features: {
        essences: true,
        recipeCategories: true,
        itemTags: true,
        gathering: false,
        multiStepRecipes: false,
      },
      essenceDefinitions: ESSENCES,
      categories: ['Casting', 'Chasing'],
      itemTags: ['ingot', 'wire', 'jewellery'],
      components: JEWELRY_COMPONENTS,
      componentCategories: componentCategoryVocabulary(JEWELRY_COMPONENTS),
      recipeItemDefinitions: [],
      tools: [],
      gatheringRealms: [],
      gatheringRealmSettings: { revealMode: 'alwaysVisible', modifierVisibility: 'visible' },
    },
    {
      id: LAB_SYSTEM_IDS.RUNEWORK,
      name: 'Ashfall Runework',
      description: 'Rune inscription resolved by tier: the same work, graded by how well it went.',
      img: `${ICON_BASE}/weapons/swords/sword-guard-blue.webp`,
      enabled: true,
      visibilityMode: 'global',
      resolutionMode: 'routedByCheck',
      craftingCheck: ROUTED_CHECK,
      features: {
        essences: true,
        recipeCategories: true,
        itemTags: true,
        gathering: false,
        multiStepRecipes: false,
      },
      essenceDefinitions: ESSENCES,
      categories: ['Inscription'],
      itemTags: ['ingot', 'reagent', 'weapon', 'scrap'],
      components: RUNEWORK_COMPONENTS,
      componentCategories: componentCategoryVocabulary(RUNEWORK_COMPONENTS),
      recipeItemDefinitions: [],
      tools: RUNEWORK_TOOLS,
      characterPrerequisites: RUNEWORK_PREREQUISITES,
      gatheringRealms: [],
      gatheringRealmSettings: { revealMode: 'alwaysVisible', modifierVisibility: 'visible' },
      // The world's CURRENCY system, and runework carries it because nothing else does.
      // `requirements.currency.enabled` is not confined to the Currency Units card: it also
      // un-disables the recipe editor's "Add cost" control and the Tool Studio's repair-cost
      // rows, so switching it on for the default system would move the already-captured recipe
      // and tool frames. Runework has no tools, and the two cases that render it are a recipe
      // editor's Results tab and the Checks view, neither of which reads the flag.
      requirements: {
        currency: { enabled: true, spendStrategy: 'actorProperty', units: CURRENCY_UNITS },
      },
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
        events: GATHERING_EVENTS.filter(
          (event) => event.craftingSystemId === LAB_SYSTEM_IDS.HERBALISM
        ),
        conditions: {
          weather: { enabled: true, current: 'clear', values: GATHERING_VOCABULARIES.weather },
          timeOfDay: { enabled: true, current: 'day', values: GATHERING_VOCABULARIES.timeOfDay },
        },
        characterModifiers: [
          {
            id: 'hb-mod-skilled',
            name: 'Skilled Forager',
            description: 'Trained in the field.',
            value: 10,
            enabled: true,
          },
          {
            id: 'hb-mod-tired',
            name: 'Exhausted',
            description: 'A long day already.',
            value: -15,
            enabled: true,
          },
        ],
      },
      [LAB_SYSTEM_IDS.SMITHING]: {
        rules: systemRules(),
        tasks: GATHERING_TASKS.filter((task) => task.craftingSystemId === LAB_SYSTEM_IDS.SMITHING),
        events: GATHERING_EVENTS.filter(
          (event) => event.craftingSystemId === LAB_SYSTEM_IDS.SMITHING
        ),
        conditions: {
          weather: { enabled: true, current: 'rain', values: GATHERING_VOCABULARIES.weather },
          timeOfDay: { enabled: true, current: 'day', values: GATHERING_VOCABULARIES.timeOfDay },
        },
        characterModifiers: [],
      },
    },
  };

  return {
    systems,
    recipes: [
      ...SMITHING_RECIPES,
      ...HERBALISM_RECIPES,
      ...ALCHEMY_RECIPES,
      ...JEWELRY_RECIPES,
      ...RUNEWORK_RECIPES,
    ],
    environments: ENVIRONMENTS,
    gatheringConfig,
    realms: [...REALMS, ...SMITHING_REALMS],
    components: [
      ...SMITHING_COMPONENTS,
      ...HERBALISM_COMPONENTS,
      ...ALCHEMY_COMPONENTS,
      ...JEWELRY_COMPONENTS,
      ...RUNEWORK_COMPONENTS,
    ],
    tools: [...SMITHING_TOOLS, ...HERBALISM_TOOLS, ...RUNEWORK_TOOLS],
    // Exposed so the uuid index can resolve an owned recipe-item copy back to the book it is a
    // copy OF. Without an index entry the copy still matches its definition (matching is by uuid,
    // not by document) but every surface that resolves the source through `fromUuid` renders it
    // unresolved — the same "looks unpopulated" failure the component index exists to prevent.
    recipeItems: [...HERBALISM_RECIPE_ITEMS],
  };
}
