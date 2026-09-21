/**
 * The View Lab's fixture content. Imagery uses real Foundry core icon paths, served from the
 * harvested cache.
 */

import { seedJournalPrototype } from './labJournalPrototype.js';

/** Foundry serves `public/` at the web root; the lab mounts the harvested cache here. */
export const ICON_BASE = '/@foundry-chrome/icons';

/** The origin item both Air Shard participations point at. */
export const SHARED_AIR_SHARD_UUID = 'Item.lab-air-shard';

export const LAB_SYSTEM_IDS = Object.freeze({
  SMITHING: 'lab-smithing',
  HERBALISM: 'lab-herbalism',
  ALCHEMY: 'lab-alchemy',
  JEWELRY: 'lab-jewelry',
  RUNEWORK: 'lab-runework',
  // A SECOND alchemy-mode system, and the only reason it exists is that the player's discipline
  // chooser cannot render without one: `alchemyStore`'s `needsChooser` is `systems.length > 1 &&
  // !activeSystemId`, so with a single discipline the chooser is not a state the app can be driven
  // into — it is a screen that does not exist.
  TIDEWRACK: 'lab-tidewrack',
  // The world's SECOND `routedByIngredients` system, and the only one whose multi-step feature is
  // on: Jewellery's is deliberately off so its collapsed-editor frame keeps its subject, so the
  // legal empty non-terminal step (issue 1907) has nowhere else to be photographed.
  GLASSWORK: 'lab-glasswork',
});

/** One component definition plus the world item it originates from. */
function component(id, name, icon, { categories = [], ...extra } = {}) {
  return {
    id,
    name,
    originItemUuid: `Item.${id}`,
    img: `${ICON_BASE}/${icon}`,
    // SINGULAR, and translated from the authored list here rather than at every call site.
    category: categories[0] ?? '',
    tags: [],
    difficulty: 1,
    essences: {},
    aliasItemUuids: [],
    ...extra,
  };
}

/**
 * The system-owned component category vocabulary. A sibling of the recipe `categories` vocabulary
 * and deliberately not an alias of it (see `CraftingSystemManager._normalizeSystem`): a component
 * category is never offered as a recipe category.
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
    // Carriers of the DISABLED `aether` essence (issue 1036).
    essences: { aether: 1 },
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
    essences: { aether: 2 },
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
  // carries one.
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
  // The required-tool disclosure (issue 777).
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
  // Source-description resolution (issue 800), as three END STATES ─────────────────────────────
  // The smoke reaches these three frames by RUNNING the two operations — `repairItemData` for the
  // second and `addItemFromUuid` for the third — against a locked world compendium.
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
  // Half of the multi-system stack (issue 766). ONE physical item, registered as a component in TWO
  // systems, must collapse to a single inventory card carrying a system selector.
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

/** The PROGRESSIVE COMPONENT COMPLICATIONS the lab authors (issue 1286). */
const GROUND_REAGENT_COMPLICATIONS = [
  {
    id: 'hb-comp-dust-cloud',
    name: 'Choking dust',
    description:
      'The reagent goes up in a fine bitter cloud. Everyone at the bench coughs through the next exchange.',
    // SEVERE, and the severity is chosen rather than picked: the parity spec measures this row's
    // severity tile and pill against the prototype's first summary row, whose seed record is
    // `severe`, and a severity token is what selects the whole colour family.
    severity: 'severe',
    // VISIBLE, so the Player pill is on screen. It is the exception rather than the rule — see the
    // header note on why the set is mixed.
    visibility: 'visible',
    activities: { crafting: true, salvage: true, gathering: false },
    match: 'any',
    when: { stageAwarded: true, stagePartial: false, stageMissed: true, checkTrigger: null },
    // BOTH effect rows enabled, which is what makes the expanded authoring frame show the
    // revealed input strips at all: `ComplicationEffectRow` renders its `children` only when
    // the row is on, so a fixture with everything off photographs six collapsed heads.
    rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value: '1' },
    effectRoll: { enabled: true, expr: '1d4', label: 'Choking dust' },
  },
  {
    id: 'hb-comp-dust-spoiled',
    name: 'Spoiled batch',
    description:
      'What comes off the pestle is grey and inert. It measures as the real thing and behaves as chalk.',
    severity: 'minor',
    visibility: 'gmOnly',
    // The gathering axis is on, and no lab system resolves gathering progressively, so this
    // is the one row that draws the dimmed activity glyph and the "· not progressive" chip.
    activities: { crafting: true, salvage: true, gathering: true },
    match: 'all',
    when: { stageAwarded: true, stagePartial: false, stageMissed: false, checkTrigger: null },
    rollCondition: { enabled: false, expr: '1d20', cmp: 'eq', value: '1' },
    effectRoll: { enabled: false, expr: '1d6', label: '' },
  },
];

const FROSTCAP_COMPLICATIONS = [
  {
    id: 'hb-comp-frostcap-shatter',
    name: 'The cap shatters',
    description:
      'The fungus is more ice than flesh by now. Handled short of its stage it bursts across the bench.',
    // The THIRD severity token, so all three of `ComplicationSummaryRow`'s severity families —
    // info, warning and danger — are on one screen: this band and Ground Reagent's two rows
    // sit in the same salvage list, and a fixture that authored one token would leave two of
    // the three tile treatments depicted nowhere.
    severity: 'major',
    // Visible, because it is the complication that fires on the HALTED stage of the resolved
    // run `labRunStates.js` seeds, and `firedComplications` is written with
    // `publicComplications` — a `gmOnly` one could not appear there at all.
    visibility: 'visible',
    activities: { crafting: true, salvage: true, gathering: false },
    match: 'any',
    when: { stageAwarded: false, stagePartial: false, stageMissed: true, checkTrigger: null },
    rollCondition: { enabled: false, expr: '1d20', cmp: 'eq', value: '1' },
    effectRoll: { enabled: true, expr: '2d6', label: 'Freezing shards' },
  },
];

/** The ordered stages of `hb-cracked-alembic`'s progressive salvage, with EXPLICIT result ids. */
export const CRACKED_ALEMBIC_STAGE_IDS = Object.freeze({
  vial: 'hb-salv-alembic-r1',
  reagent: 'hb-salv-alembic-r2',
  frostcap: 'hb-salv-alembic-r3',
});

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
    {
      categories: ['Herbs'],
      tags: ['fungus'],
      difficulty: 4,
      essences: { water: 2 },
      // The LAST stage of both progressive lists, and the one a mid-range roll cannot
      // afford — so it is the missed stage the seeded run in `labRunStates.js` halts on.
      complications: FROSTCAP_COMPLICATIONS,
    }
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
  // DELIBERATELY carries no `complications`, and that absence is load-bearing twice over.
  component('hb-empty-vial', 'Empty Vial', 'consumables/potions/bottle-bulb-empty-glass.webp', {
    categories: ['Bases'],
    tags: ['vessel'],
    difficulty: 1,
  }),
  component('hb-mortar-dust', 'Ground Reagent', 'commodities/materials/bowl-powder-grey.webp', {
    categories: ['Bases'],
    tags: ['prepared'],
    difficulty: 2,
    // TWO complications on one component, because a strip with a single row cannot show the
    // band's own stacking gap and because the collapsed authoring list needs a second row to
    // be a list at all.
    complications: GROUND_REAGENT_COMPLICATIONS,
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
  // PROGRESSIVE salvage, which is a different player body from Simple's: an ORDERED stage list the
  // player may reorder before spending the roll. ONE result group holding THREE ordered results,
  // not three groups.
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
            // IDs are AUTHORED rather than minted — see CRACKED_ALEMBIC_STAGE_IDS for why a
            // run record that names a stage cannot survive a per-boot random id.
            results: [
              {
                id: CRACKED_ALEMBIC_STAGE_IDS.vial,
                componentId: 'hb-empty-vial',
                quantity: 2,
              },
              {
                id: CRACKED_ALEMBIC_STAGE_IDS.reagent,
                componentId: 'hb-mortar-dust',
                quantity: 1,
              },
              {
                id: CRACKED_ALEMBIC_STAGE_IDS.frostcap,
                componentId: 'hb-frostcap',
                quantity: 1,
              },
            ],
          },
        ],
      },
    }
  ),
  // The other half of the multi-system stack.
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

/** The second alchemy discipline's components. */
const TIDEWRACK_COMPONENTS = [
  component('tw-kelp-ash', 'Kelp Ash', 'commodities/materials/bowl-powder-grey.webp', {
    categories: ['Reagents'],
    tags: ['mineral'],
    difficulty: 3,
    essences: { water: 2 },
  }),
  component('tw-brine-salt', 'Brine Salt', 'commodities/materials/bowl-powder-blue.webp', {
    categories: ['Reagents'],
    tags: ['mineral'],
    difficulty: 2,
    essences: { water: 1, air: 1 },
  }),
  component('tw-pearl-dust', 'Pearl Dust', 'commodities/gems/pearl-water.webp', {
    categories: ['Reagents'],
    tags: ['exotic'],
    difficulty: 7,
    essences: { water: 3 },
  }),
  component(
    'tw-tidewater',
    'Bottled Tidewater',
    'consumables/potions/bottle-round-corked-blue.webp',
    { categories: ['Products'], tags: ['elixir'], difficulty: 5 }
  ),
  component(
    'tw-fogdraught',
    'Fogdraught',
    'consumables/potions/bottle-conical-bubbling-blue.webp',
    { categories: ['Products'], tags: ['elixir'], difficulty: 6 }
  ),
];

// The two routed resolution modes.
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
  // The MISCONFIGURED salvage cue.
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
    // The world's one named `checkTrigger` (issue 1510): `ROUTED_CHECK.checkBreakage.triggers`
    // authors two ids, and this is the only complication that names one, so the trigger picker
    // has a photographable frame instead of always rendering unavailable.
    complications: [
      {
        id: 'rw-comp-cross-thread',
        name: 'Cross-threaded rune',
        description: 'The etching catches wrong and the bar hums a half-tone flat.',
        severity: 'minor',
        visibility: 'gmOnly',
        activities: { crafting: true, salvage: false, gathering: false },
        match: 'any',
        when: {
          stageAwarded: false,
          stagePartial: true,
          stageMissed: false,
          checkTrigger: 'rw-trig-step-target',
        },
        rollCondition: { enabled: false, expr: '1d20', cmp: 'eq', value: '1' },
        effectRoll: { enabled: false, expr: '1d4', label: '' },
      },
    ],
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
  // ROUTED salvage, and the world's only POPULATED outcome-routing table.
  component('rw-slag', 'Ruined Slag', 'commodities/metal/fragments-steel-barbed.webp', {
    categories: ['Waste'],
    tags: ['scrap'],
    difficulty: 1,
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      toolIds: ['rw-tool-mallet'],
      dcOverride: 11,
      resultGroups: [
        {
          id: 'rw-salv-clean',
          name: 'Clean reclaim',
          results: [
            { componentId: 'rw-bar', quantity: 1 },
            { componentId: 'rw-chalk', quantity: 1 },
          ],
        },
        {
          id: 'rw-salv-partial',
          name: 'Partial reclaim',
          results: [{ componentId: 'rw-chalk', quantity: 1 }],
        },
      ],
      // Keyed by outcome tier NAME, valued by result-group id — the shape
      // `_normalizeSalvage` preserves and the routing selects read back.
      outcomeRouting: {
        Masterwork: 'rw-salv-clean',
        Standard: 'rw-salv-partial',
      },
    },
  }),
];

/**
 * The shared essence vocabulary. Every one of the six lab systems declares THIS array, so an edit
 * here moves every essence surface in the corpus at once (issue 1036).
 */
const ESSENCES = [
  {
    id: 'earth',
    name: 'Earth',
    description: 'Stone, ore, and root.',
    icon: 'fas fa-mountain',
    colorToken: 'sage',
    sourceComponentId: 'sm-iron-ore',
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'Forge-heat and ember.',
    icon: 'fas fa-fire',
    colorToken: 'peach',
    sourceComponentId: 'sm-coal',
  },
  {
    id: 'water',
    name: 'Water',
    description: 'Spring, tide, and frost.',
    icon: 'fas fa-droplet',
    colorToken: 'aqua',
    sourceComponentId: 'hb-spring-water',
  },
  {
    // No `colorToken`, on purpose. See the header: the unset-colour row is a state the
    // design has to handle and a fully-coloured fixture would never show it.
    id: 'air',
    name: 'Air',
    description: 'Breath and vapour.',
    icon: 'fas fa-wind',
    sourceComponentId: 'al-saltpetre',
  },
  {
    id: 'aether',
    name: 'Aether',
    // Deliberately long enough to exercise the row's one-line description clamp.
    description: 'The binding between things, drawn thin. Rare, and quiet about what it does.',
    icon: 'fas fa-atom',
    colorToken: 'lavender',
    enabled: false,
    sourceComponentId: 'sm-ruby',
    propertyMacroUuid: 'Macro.lab-aether-binding',
  },
  {
    // The ZERO-CARRIER essence (issue 1036). It is required by `sm-r-runeplate-draft`, so
    // `recipeRewrites` is 1 rather than 0 and the third impact number is not trivially satisfied.
    id: 'mote',
    name: 'Mote',
    description: 'Loose motive dust. Useful, and nobody has found a use.',
    icon: 'fas fa-hand-sparkles',
    colorToken: 'butter',
  },
];

const GLASSWORK_COMPONENTS = [
  component('gl-silica', 'Silica Sand', 'commodities/stone/stone-pile-grey.webp', {
    categories: ['Batch'],
    tags: ['batch'],
    difficulty: 2,
    essences: { earth: 1 },
  }),
  component('gl-soda', 'Soda Ash', 'commodities/materials/bowl-powder-grey.webp', {
    categories: ['Batch'],
    tags: ['batch'],
    difficulty: 3,
    essences: { fire: 1 },
  }),
  component('gl-lens', 'Ground Lens', 'commodities/gems/gem-faceted-radiant-blue.webp', {
    categories: ['Finished Goods'],
    tags: ['glass'],
    difficulty: 7,
  }),
];

function recipe(id, name, systemId, icon, { categories = [], ...config } = {}) {
  return {
    id,
    name,
    craftingSystemId: systemId,
    img: `${ICON_BASE}/${icon}`,
    enabled: true,
    ingredientSets: [],
    resultGroups: [],
    toolIds: [],
    // SINGULAR, translated from the authored list here — exactly as `component()` does, and for
    // exactly the same reason.
    category: categories[0] ?? '',
    ...config,
  };
}

/**
 * One ingredient set in which every listed component is required.
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
      // An UNMATCHED TAG requirement, deliberately added to a recipe no other case selects and one
      // that is already uncraftable (Brenna holds no silver ore), so the browser's craftable-first
      // ordering — and therefore every other case's row position — is unmoved.
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
              // `runic` is declared on the system and carried by NO component, which is the point:
              // `expandToComponentIds` finds nothing to expand to, so the tile has no item image to
              // borrow.
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
      // The world's only LEGACY-basis membership, and the bulk panel's book axis is why it exists
      // (issue 1010).
      recipeItemId: 'sm-almanac',
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
      // No LEGACY set-level `essences` map here, and none anywhere in this fixture, though the live
      // smoke's world has one.
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
      // Fire against 60 needed).
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

  // Essence requirements ─────────────────────────────────────────────────────────────────────── An
  // essence requirement is `match: { type: 'essence', essenceId, amount }` — a demand on the
  // essence POOL rather than on a named component, funded by whatever the crafter consumes.
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

  // Multi-step ─────────────────────────────────────────────────────────────────────────────────
  // Explicit `steps[]`, each with its own ingredient sets, results, tools and time requirement.
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

  // Requirement-rail states ────────────────────────────────────────────────────────────────────
  // BOTH recipes below are named to sort AFTER "Inscribe a Runeblade", and that is load-bearing
  // rather than flavour.

  recipe(
    'sm-r-tidebound',
    'Temper a Tidebound Edge',
    LAB_SYSTEM_IDS.SMITHING,
    'weapons/swords/sword-guard-blue.webp',
    {
      description: 'Sea-quenched work: the stock is easy, the choice is yours, the water is not.',
      categories: ['Weaponsmithing'],
      // The requirement rail's THREE states in one set, which is the whole reason this recipe
      // exists — the counterpart frame asserts exactly `['choice:partial', 'essence:short',
      // 'fixed:met']` with exactly one chooser open.
      complex: true,
      ingredientSets: [
        {
          id: 'sm-set-tidebound',
          name: 'Tidebound stock',
          ingredientGroups: [
            { id: 'sm-set-tidebound-g1', options: [{ componentId: 'sm-coal', quantity: 2 }] },
            {
              id: 'sm-set-tidebound-g2',
              name: 'Bright stock',
              options: [
                { componentId: 'sm-silver-ore', quantity: 2 },
                { componentId: 'sm-sapphire', quantity: 1 },
              ],
            },
            {
              id: 'sm-set-tidebound-g3',
              name: 'Water essence',
              options: [{ match: { type: 'essence', essenceId: 'water', amount: 4 } }],
            },
          ],
        },
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-dagger', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + @prof', thresholds: { success: 15 } },
      toolIds: ['sm-tool-hammer'],
    }
  ),
  recipe(
    'sm-r-quenchoil',
    'Quench in Fire-Bearing Stock',
    LAB_SYSTEM_IDS.SMITHING,
    'consumables/potions/bottle-conical-corked-yellow.webp',
    {
      description: 'Either burn the coal or spend the fire you are already carrying.',
      categories: ['Weaponsmithing'],
      // ONE group offering a COMPONENT or an ESSENCE, which is the only arrangement that draws an
      // alternatives radiogroup carrying an essence tile: `IngredientOptionSelector` branches on
      // the OPTION's `isEssence`, so an essence requirement in its own group renders a rail tile
      // instead and never reaches the chooser.
      ingredientSets: [
        {
          id: 'sm-set-quench',
          name: 'Quenching stock',
          ingredientGroups: [
            {
              id: 'sm-set-quench-g1',
              name: 'Fire source',
              options: [
                { componentId: 'sm-coal', quantity: 2 },
                { match: { type: 'essence', essenceId: 'fire', amount: 4 } },
              ],
            },
          ],
        },
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-whetstone', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20 + 2', thresholds: { success: 12 } },
    }
  ),

  // Activation-blocked rows (issue 1010) ───────────────────────────────────────────────────────
  // The two rows the re-pointed authoring-state pill exists for.
  recipe(
    'sm-r-runeplate-draft',
    'Draft: Runeplate Harness',
    LAB_SYSTEM_IDS.SMITHING,
    'equipment/chest/breastplate-scale-grey.webp',
    {
      description: 'Begun and not finished: the plan exists, the ingredients and outputs do not.',
      categories: ['Armoursmithing'],
      // OFF and un-enableable — the `Can't enable` (danger) row. An INCOMPLETE SHELL, not a broken
      // one: no result groups, which is the completeness contract failing while structural
      // integrity holds (issue 1036).
      ingredientSets: [
        {
          id: 'sm-runeplate-s1',
          ingredientGroups: [
            {
              id: 'sm-runeplate-s1-g1',
              name: 'Aether binding',
              // The FIRST-CLASS essence option shape — `match: { type: 'essence', … }` — which is
              // what `recipeReferencesEssence` walks.
              options: [{ match: { type: 'essence', essenceId: 'aether', amount: 2 } }],
            },
            {
              // `mote` rides along on this SAME recipe, for the reason `aether` is here: it is the
              // corpus's only DELETABLE essence, and without a recipe requiring it the bulk-delete
              // impact statement's "recipes will be rewritten" number would be 0 for every
              // selection that can reach a live Delete button.
              id: 'sm-runeplate-s1-g2',
              name: 'Mote dusting',
              options: [{ match: { type: 'essence', essenceId: 'mote', amount: 1 } }],
            },
          ],
        },
      ],
      enabled: false,
    }
  ),
  recipe(
    'sm-r-blade-offcuts',
    'Reclaim Blade Offcuts',
    LAB_SYSTEM_IDS.SMITHING,
    'commodities/metal/fragments-steel-barbed.webp',
    {
      description: 'Sweep the day’s trimmings back into the crucible — if the tally were right.',
      categories: ['Refining'],
      // ON and STRUCTURALLY BROKEN — the `Incomplete` (warning) row, and the case that proves the
      // widened predicate. The break is a NEGATIVE ingredient quantity.
      ingredientSets: [
        {
          id: 'sm-set-offcuts',
          ingredientGroups: [
            {
              id: 'sm-set-offcuts-g1',
              name: 'Trimmings',
              options: [{ componentId: 'sm-steel-ingot', quantity: -1 }],
            },
            {
              id: 'sm-set-offcuts-g2',
              name: 'Bright stock',
              options: [{ componentId: 'sm-silver-ore', quantity: 3 }],
            },
          ],
        },
      ],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'sm-iron-ingot', quantity: 1 }] }],
      check: { enabled: true, rollFormula: '1d20', thresholds: { success: 12 } },
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
      description: 'Moonleaf and frostcap, held just below a simmer — and a fee for the still.',
      categories: ['Potions'],
      // The world's SHOWCASE requirement set: one row of every kind the ingredients editor can
      // author, which is what the live smoke photographs its own "Showcase Requirements" recipe
      // for.
      complex: true,
      ingredientSets: [
        {
          id: 'hb-set-tincture',
          name: 'Bench requirements',
          ingredientGroups: [
            {
              id: 'hb-set-tincture-g1',
              options: [{ componentId: 'hb-moonleaf', quantity: 3 }],
            },
            {
              id: 'hb-set-tincture-g2',
              name: 'Either cap',
              options: [
                { componentId: 'hb-frostcap', quantity: 2 },
                { componentId: 'hb-emberbloom', quantity: 2 },
              ],
            },
            {
              id: 'hb-set-tincture-g3',
              name: 'Any solvent',
              options: [
                { match: { type: 'tags', tags: ['solvent'], tagMatch: 'any' }, quantity: 1 },
              ],
            },
            {
              id: 'hb-set-tincture-g4',
              name: 'Water essence',
              options: [{ match: { type: 'essence', essenceId: 'water', amount: 4 } }],
            },
            {
              id: 'hb-set-tincture-g5',
              name: 'Still fee',
              options: [{ match: { type: 'currency', unit: 'gp', amount: 25 } }],
            },
          ],
        },
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
      description:
        'Any dry reagent, reduced to a workable powder — and whatever else the pass yields.',
      categories: ['Preparation'],
      ingredientSets: [
        eitherSet('s1', [
          ['hb-bitterbark', 1],
          ['hb-sunroot', 1],
          ['hb-frostcap', 1],
        ]),
      ],
      // THREE ordered results in ONE group, which is what a progressive recipe's Results tab
      // renders as its ordered stage list: the roll budget flows down the list and each stage
      // consumes its own difficulty before the next is produced.
      resultGroups: [
        {
          id: 'rg',
          results: [
            { componentId: 'hb-empty-vial', quantity: 1 },
            { componentId: 'hb-mortar-dust', quantity: 2 },
            { componentId: 'hb-frostcap', quantity: 1 },
          ],
        },
      ],
      toolIds: ['hb-tool-mortar'],
    }
  ),

  // The player-VISIBLE progressive pair ────────────────────────────────────────────────────────
  // Progressive is a per-SYSTEM resolution mode (`CraftingListingBuilder._buildRecipeModel` reads
  // `system.resolutionMode`), so a progressive player body can only be photographed on a
  // progressive system the player can see.
  recipe(
    'hb-r-stillroom',
    'Reduce a Stillroom Batch',
    LAB_SYSTEM_IDS.HERBALISM,
    'consumables/potions/bottle-conical-corked-green.webp',
    {
      description: 'One long reduction; how far down the ladder you get is how well it went.',
      categories: ['Preparation'],
      ingredientSets: [simpleSet('s1', { 'hb-moonleaf': 2, 'hb-spring-water': 2 })],
      // THREE ordered stages, REORDERABLE — `allowPlayerResultReorder` defaults true, so this is
      // the recipe the reorder chevrons and the move announcement are photographed on.
      resultGroups: [
        {
          id: 'rg',
          results: [
            { componentId: 'hb-empty-vial', quantity: 2 },
            { componentId: 'hb-mortar-dust', quantity: 1 },
            { componentId: 'hb-frostcap', quantity: 1 },
          ],
        },
      ],
      toolIds: ['hb-tool-mortar'],
      // The world's only per-recipe check-modifier PICK (issue 1055).
      craftingModifier: {
        modifierIds: ['hb-mod-medicine', 'hb-mod-nature', 'hb-mod-tools'],
      },
    }
  ),
  recipe(
    'hb-r-kiln',
    'Set the Drying Kiln',
    LAB_SYSTEM_IDS.HERBALISM,
    'consumables/plants/dried-bundle-stems-sticks-roots-brown.webp',
    {
      description: 'The kiln takes what it takes, in the order the wardens set.',
      categories: ['Preparation'],
      ingredientSets: [simpleSet('s1', { 'hb-sunroot': 2, 'hb-bitterbark': 1 })],
      // The FIXED counterpart: `allowPlayerResultReorder: false` is what removes the grips, the
      // move buttons and the live region while keeping the ordinals and the difficulty chips, and
      // adds the muted "order set by the GM" line.
      allowPlayerResultReorder: false,
      resultGroups: [
        {
          id: 'rg',
          results: [
            { componentId: 'hb-spring-water', quantity: 2 },
            { componentId: 'hb-salve', quantity: 1 },
            { componentId: 'hb-antitoxin', quantity: 1 },
          ],
        },
      ],
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
      // TWO groups: the success set plus the reserved `role: 'failure'` set that alchemy Simple's
      // fixed two-slot Results editor draws.
      resultGroups: [
        { id: 'rg', results: [{ componentId: 'al-elixir', quantity: 1 }] },
        {
          id: 'rg-fail',
          role: 'failure',
          results: [{ componentId: 'al-flask', quantity: 1 }],
        },
      ],
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

/**
 * The world-default `prerequisites` / `bonus` sections, per world Tool record (issue 1373). `@prof`
 * is carried by TWO of that library's entries — herbalism's `Herbalism kit` and runework's
 * `Inscriber's chisel` — and that is left standing rather than tidied away.
 */
const TOOL_WORLD_REQUIREMENT_DEFAULTS = Object.freeze({
  'hb-tool-mortar': {
    prerequisites: { enabled: true, ids: ['hb-prereq-nature'], gateMode: 'bonus' },
    bonus: { enabled: true, expression: '@prof' },
  },
  'sm-tool-hammer': {
    bonus: { enabled: true, expression: '@prof' },
  },
});

/** The world Tool records that belong to NO crafting system, and the world defaults they carry. */
const WORLD_ONLY_TOOL_ENTITIES = [
  {
    id: 'lab-tool-warped-crucible',
    name: 'Warped Crucible',
    // A REAL FOUNDRY PATH, verified against the harvested `icons/` tree rather than inferred from
    // the naming convention — see `lab-tool-unlinked`'s note for what an invented one costs.
    img: `${ICON_BASE}/tools/smithing/crucible-steel.webp`,
    description: 'Slumped out of true in a runaway heat, and the Item behind it is long deleted.',
    // NAMED, AND UNRESOLVABLE. Both halves are the point: `entryHasSourceLink` reads this field,
    // so the record reports itself LINKED, and nothing in the Item index answers the uuid.
    registeredItemUuid: 'Item.lab-tool-warped-crucible',
    originItemUuid: 'Item.lab-tool-warped-crucible',
    aliasItemUuids: [],
  },
];

/** The world defaults for the world-ONLY records, as `Object.fromEntries` pairs. */
const WORLD_ONLY_TOOL_DEFAULT_ENTRIES = [
  [
    'lab-tool-unlinked',
    {
      id: 'lab-tool-unlinked',
      breakage: { mode: 'limitedUses', maxUses: null },
      onBreak: { mode: 'destroy' },
      enabled: false,
    },
  ],
  [
    'lab-tool-warped-crucible',
    {
      id: 'lab-tool-warped-crucible',
      breakage: { mode: 'breakageChance', breakageChance: 0 },
      onBreak: { mode: 'destroy' },
    },
  ],
];

const SMITHING_TOOLS = [
  {
    id: 'sm-tool-hammer',
    name: 'Smith’s Hammer',
    description:
      'A cross-pein sledge with a hickory haft, weighted for drawing hot iron out along the horn.',
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
    description: 'Two hundredweight of cast steel, set on an elm stump and rung true.',
    componentId: 'sm-steel-ingot',
    registeredItemUuid: 'Item.sm-tool-anvil',
    originItemUuid: 'Item.sm-tool-anvil',
    img: `${ICON_BASE}/tools/smithing/anvil.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'limitedUses', maxUses: null },
  },
  // THE MARKED-BROKEN TOOL, AND THE ONE WITH A REPAIR ROUTE (issue 1373, round 2) ──────── `Mark as
  // broken` is the on-break action that takes an ARGUMENT — the ingredient groups that mend a
  // broken copy — and no lab tool selected it, so the world entry's repair picker was a state no
  // capture case could reach.
  {
    id: 'sm-tool-tongs',
    name: 'Forge Tongs',
    description: 'Wolf-jaw tongs, long enough in the rein to keep a hand clear of the fire.',
    componentId: 'sm-iron-ingot',
    registeredItemUuid: 'Item.sm-tool-tongs',
    originItemUuid: 'Item.sm-tool-tongs',
    img: `${ICON_BASE}/tools/smithing/tongs-steel-grey.webp`,
    aliasItemUuids: [],
    breakage: { mode: 'breakageChance', breakageChance: 22 },
    onBreak: { mode: 'flagBroken' },
    // THE OPTIONS CARRY A `match`, WHICH IS NOT THE RECIPE FIXTURES' SHORTHAND.
    repairRequirements: [
      {
        id: 'sm-tool-tongs-repair-g1',
        options: [{ quantity: 1, match: { type: 'component', componentId: 'sm-iron-ingot' } }],
      },
      {
        id: 'sm-tool-tongs-repair-g2',
        options: [
          { quantity: 2, match: { type: 'component', componentId: 'sm-coal' } },
          { quantity: 1, match: { type: 'component', componentId: 'sm-whetstone' } },
        ],
      },
      // A TAG ROW, BECAUSE NO REPAIR FRAME HELD ONE (issue 1373, maintainer round 6).
      {
        id: 'sm-tool-tongs-repair-g3',
        options: [
          { quantity: 2, match: { type: 'tags', tags: ['abrasive', 'hide'], tagMatch: 'any' } },
        ],
      },
    ],
  },
];

const HERBALISM_TOOLS = [
  {
    id: 'hb-tool-mortar',
    name: 'Mortar & Pestle',
    description: 'Unglazed porcelain, deliberately rough inside so a seed head gives up its oils.',
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
      // `total` is the party POOL: the budget is shared across every copy in the world, so deleting
      // a copy before erasing the memory it sourced strands a slot permanently.
      learn: { limitLearning: true, learnsAllowed: 2, learnScope: 'total' },
    },
  },
];

/** The Tool Studio STRESS library, and why it lives on Runework. */
const RUNEWORK_PREREQUISITES = [
  {
    id: 'rw-prereq-arcana',
    name: 'Trained in Arcana',
    icon: 'fas fa-hat-wizard',
    path: 'skills.arc.value',
    op: 'gte',
    value: 1,
  },
  {
    id: 'rw-prereq-int',
    name: 'Intelligence 13 or higher',
    icon: 'fas fa-brain',
    path: 'abilities.int.value',
    op: 'gte',
    value: 13,
  },
  {
    id: 'rw-prereq-attuned',
    name: 'Attuned to the Weave',
    icon: 'fas fa-wand-sparkles',
    path: 'attributes.attuned',
    op: 'isTrue',
  },
];

/** Herbalism's character prerequisites, and why they are not Runework's. */
const HERBALISM_PREREQUISITES = [
  {
    id: 'hb-prereq-nature',
    name: 'Trained in Nature',
    icon: 'fas fa-leaf',
    path: 'skills.nat.value',
    op: 'gte',
    value: 1,
  },
  {
    id: 'hb-prereq-wis',
    name: 'Wisdom 12 or higher',
    icon: 'fas fa-eye',
    path: 'abilities.wis.value',
    op: 'gte',
    value: 12,
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
    dropRows: [
      { id: 'row-1', componentId: 'hb-moonleaf', quantity: 2, dropRate: 40, enabled: true },
      { id: 'row-2', componentId: 'hb-sunroot', quantity: 1, dropRate: 30, enabled: true },
      { id: 'row-3', componentId: 'hb-bitterbark', quantity: 1, dropRate: 20, enabled: true },
      { id: 'row-4', componentId: 'hb-emberbloom', quantity: 1, dropRate: 10, enabled: true },
    ],
  },
  {
    id: 'hb-task-fungi',
    name: 'Hunt Frostcaps',
    description: 'Shaded north faces, after the first frost.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/consumables/mushrooms/campanulate-bell-shiny-blue.webp`,
    dropRows: [
      { id: 'row-1', componentId: 'hb-frostcap', quantity: 2, dropRate: 55, enabled: true },
      { id: 'row-2', componentId: 'hb-moonleaf', quantity: 1, dropRate: 30, enabled: true },
      { id: 'row-3', componentId: 'hb-bitterbark', quantity: 2, dropRate: 15, enabled: true },
    ],
  },
  {
    id: 'hb-task-spring',
    name: 'Draw Spring Water',
    description: 'The clean spring, not the one by the mill.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    img: `${ICON_BASE}/consumables/potions/bottle-round-corked-blue.webp`,
    dropRows: [
      { id: 'row-1', componentId: 'hb-spring-water', quantity: 3, dropRate: 70, enabled: true },
      { id: 'row-2', componentId: 'hb-frostcap', quantity: 1, dropRate: 30, enabled: true },
    ],
  },
  // Attemptable tasks ──────────────────────────────────────────────────────────────────────── The
  // three tasks below carry states the four above do not: a time gate, a required tool, and a realm
  // lock.
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
    // TOOL-BLOCKED for the gathering actor.
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
    // The world's only resource-NODE task, and the pool is declared HERE rather than on the
    // environment: `_runtimeTask` reads `environment.nodeRuntime[taskId]` only when the library
    // task carries a `nodes` config, and treats the library config as authoritative for everything
    // except the live count.
    nodes: { enabled: true, max: 3, depletionTiming: 'onSuccess' },
    dropRows: [
      { id: 'row-1', componentId: 'sm-iron-ore', quantity: 3, dropRate: 50, enabled: true },
      { id: 'row-2', componentId: 'sm-copper-ore', quantity: 2, dropRate: 30, enabled: true },
      { id: 'row-3', componentId: 'sm-silver-ore', quantity: 1, dropRate: 15, enabled: true },
      { id: 'row-4', componentId: 'sm-ruby', quantity: 1, dropRate: 5, enabled: true },
      // COAL, and it is here to close a fixture gap rather than to enrich the seam.
      { id: 'row-5', componentId: 'sm-coal', quantity: 2, dropRate: 35, enabled: true },
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
  // Smithing's event roster, and why it is three rows rather than one ───────────────────────────
  // Smithing is the world's only `full`-event-visibility system (see `systemRules`), so Old Karrun
  // Mine is the only environment whose player Events TAB exists — and therefore the only place the
  // individual event list, its search box and its pagination can be photographed at all.
  {
    id: 'sm-event-collapse',
    name: 'Partial Collapse',
    description: 'The seam gives. Nobody is hurt, this time.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    img: `${ICON_BASE}/environment/wilderness/cave-entrance-mountain.webp`,
    weight: 10,
  },
  {
    id: 'sm-event-firedamp',
    name: 'Firedamp',
    description: 'The lamps gutter blue. Everyone out, and nobody strikes a light.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    img: `${ICON_BASE}/magic/fire/flame-burning-campfire-yellow-blue.webp`,
    weight: 6,
  },
  {
    id: 'sm-event-floodwater',
    name: 'Rising Water',
    description: 'The lower gallery is taking water faster than the pumps can lift it.',
    enabled: true,
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    img: `${ICON_BASE}/magic/water/water-drop-swirl-blue.webp`,
    weight: 14,
  },
];

const REALMS = [
  {
    id: 'hb-realm-verdant',
    name: 'The Verdant Reach',
    description: 'Old forest, older paths.',
    enabled: true,
    sceneMappings: [{ sceneUuid: 'Scene.lab-map', sceneRegionUuid: 'Scene.lab-map.Region.grove' }],
  },
  {
    id: 'hb-realm-frostmark',
    name: 'Frostmark Ridge',
    description: 'Above the treeline, below the snow.',
    enabled: true,
    sceneMappings: [],
  },
];

/** Smithing's realm, and the reason it exists. */
const SMITHING_REALMS = [
  {
    id: 'sm-realm-deep',
    name: 'The Underdeep',
    description: 'Below the lowest worked gallery, where the old seams run.',
    img: `${ICON_BASE}/environment/wilderness/cave-entrance-dwarven-hill.webp`,
    enabled: true,
    sceneMappings: [
      {
        sceneUuid: 'Scene.lab-map',
        sceneRegionUuid: 'Scene.lab-map.Region.deep-gate',
      },
    ],
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
    // NO node runtime, where there used to be `{'hb-task-forage': {remaining: 3, respawnAt:
    // null}}`.
    nodeRuntime: {},
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
    // Manual composition is exactly this list (issue 1315): these two lived in `forcedTaskIds` when
    // manual mode still filtered by match and a force was the only way past it.
    enabledTaskIds: ['hb-task-forage', 'hb-task-fungi'],
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
    // Empty for the same reason as the grove's — see `hb-env-grove`.
    nodeRuntime: {},
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
    enabledEventIds: ['sm-event-collapse', 'sm-event-firedamp', 'sm-event-floodwater'],
    taskOrder: ['sm-task-prospect'],
    conditions: { weather: 'clear', timeOfDay: 'day', visibility: '', notes: '' },
    // The world's only LIVE node pool, and the reason the after-a-successful-gather frame is a
    // different photograph from the ready one at all.
    nodeRuntime: { 'sm-task-prospect': { current: 3 } },
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
    // Realm-gated to a realm nobody is in.
    includedRealmIds: ['sm-realm-deep'],
    // Folded for the same reason as `hb-env-thicket` (issue 1315).
    enabledTaskIds: ['sm-task-prospect'],
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

/**
 * The per-system gathering rules.
 *
 * @param {'dangerLevelOnly'|'encounterChance'|'full'} eventVisibility The player-facing tier.
 * @returns {object} The rules block.
 */
function systemRules(eventVisibility) {
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
    eventVisibility,
    dropModifierMode: 'character',
  };
}

/**
 * Build the persisted world content: exactly the shapes `game.settings` holds in production, so
 * `CraftingSystemManager.initialize()` and `RecipeManager.initialize()` load and normalize them
 * through the real code paths rather than being handed pre-normalized objects.
 */
/** System-level crafting-check configuration. */
const SIMPLE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  // AUTHORED, not left absent (issue 1098).
  failureResultPolicy: 'perRecord',
  simple: { rollFormula: '1d20 + @abilities.int.mod', thresholds: { success: 12 } },
});

/** Karrun Forgecraft's OWN crafting check — the world's only one that authors recipe TIERS. */
const SMITHING_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  // THE NON-DEFAULT SELECTION, and the only system that carries it (issue 1098).
  failureResultPolicy: 'never',
  simple: {
    rollFormula: '1d20 + @abilities.int.mod',
    thresholds: { success: 12 },
    // TWO tiers, not one: a single-entry picker cannot show that the control is a CHOICE, and the
    // bulk panel's select has to render "— Leave unchanged —", "Default DC" and more than one
    // named tier for the three-meaning contract to be visible in one photograph.
    tiers: [
      { id: 'sm-tier-apprentice', name: 'Apprentice work', dc: 10 },
      { id: 'sm-tier-masterwork', name: 'Masterwork', dc: 18 },
    ],
  },
});

/**
 * `routedByIngredients`: an ingredient set names the result group it produces, so the SAME recipe
 * yields a ring or an amulet depending on which billet the crafter had.
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
      // AUTHORED STEPS ON A SYSTEM WHOSE MULTI-STEP FEATURE IS OFF.
      steps: [
        {
          id: 'jw-step-draw',
          name: 'Draw the wire',
          description: 'Pull the billet down through the drawplate until the gauge is right.',
          ingredientSets: [simpleSet('jw-step-draw-s1', { 'jw-wire': 3 })],
          resultGroups: [{ id: 'jw-step-draw-rg', results: [] }],
        },
        {
          id: 'jw-step-chase',
          name: 'Chase the former',
          description: 'Work the figure over the former, then close the band.',
          ingredientSets: [simpleSet('jw-step-chase-s1', { 'jw-ingot-gold': 1 })],
          resultGroups: [
            { id: 'jw-step-chase-rg', results: [{ componentId: 'jw-circlet', quantity: 1 }] },
          ],
        },
      ],
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
        // No group for the `rw-ruined` tier.
      ],
    }
  ),
];

/** The second alchemy discipline's recipes — two, because `_enabledAlchemySystems` only offers a
 * system that owns at least one, and one row makes a chooser card that reads as a stub. */
const TIDEWRACK_RECIPES = [
  recipe(
    'tw-r-tidewater',
    'Bottled Tidewater',
    LAB_SYSTEM_IDS.TIDEWRACK,
    'consumables/potions/bottle-round-corked-blue.webp',
    {
      description: 'Draw the salt back out and what is left keeps its memory of the sea.',
      categories: ['Elixirs'],
      ingredientSets: [simpleSet('tw-set-tidewater', { 'tw-kelp-ash': 2, 'tw-brine-salt': 1 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'tw-tidewater', quantity: 1 }] }],
    }
  ),
  recipe(
    'tw-r-fogdraught',
    'Fogdraught',
    LAB_SYSTEM_IDS.TIDEWRACK,
    'consumables/potions/bottle-conical-bubbling-blue.webp',
    {
      description: 'Pearl dust and a long cold steep.',
      categories: ['Elixirs'],
      ingredientSets: [simpleSet('tw-set-fogdraught', { 'tw-pearl-dust': 1, 'tw-brine-salt': 2 })],
      resultGroups: [{ id: 'rg', results: [{ componentId: 'tw-fogdraught', quantity: 1 }] }],
    }
  ),
];

/** The routed check the Runework system resolves against; each outcome id is claimed by a group. */
const ROUTED_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
  // `always` (issue 1098, decision 7), and this is the world's ONE permitting routed check.
  failureResultPolicy: 'always',
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
    // The ONLY authored trigger list in the fixture world (issue 975).
    checkBreakage: {
      triggers: [
        {
          id: 'rw-trig-step-target',
          condition: { type: 'rollTotal', operator: '<=', value: 5 },
          outcome: 'none',
          breakTools: false,
          tierStep: { mode: 'target', steps: 1, tierId: 'rw-ruined' },
        },
        {
          id: 'rw-trig-step-up',
          condition: {
            type: 'diceGroup',
            groupId: 0,
            aggregate: 'anyDie',
            operator: '==',
            value: 20,
          },
          outcome: 'none',
          breakTools: false,
          tierStep: { mode: 'up', steps: 1, tierId: null },
        },
      ],
    },
  },
  // THE SELECTION THE PARITY SUBJECT IS MEASURED ON.
  defaultModifierPolicy: 'addAll',
  defaultModifierIds: ['rw-mod-rune-lore', 'rw-mod-etching', 'rw-mod-chisel'],
});

/** Runework's SALVAGE check: routed, with named outcome tiers. */
const ROUTED_SALVAGE_CHECK = Object.freeze({
  enabled: true,
  // SALVAGE'S OWN consumption keys, which are NOT crafting's (issue 1098).
  consumption: {
    consumeIngredientsOnFail: true,
    breakToolsOnFail: true,
    consumeComponentOnFail: false,
  },
  failureResultPolicy: 'always',
  routed: {
    type: 'relative',
    rollFormula: '1d20 + @abilities.int.mod',
    dc: 10,
    thresholdMode: 'meet',
    relativeOutcomes: [
      { id: 'rw-salv-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
      { id: 'rw-salv-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
      { id: 'rw-salv-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 },
    ],
  },
  // TWO of the three, on the SAME rule crafting uses, and the omission is the whole point: the
  // eligibility control has two readings and crafting's frame shows only the `Applied` one.
  defaultModifierPolicy: 'addAll',
  defaultModifierIds: ['rw-mod-rune-lore', 'rw-mod-etching'],
});

/** Herbalism's SALVAGE check — a separate block from its crafting check. */
const PROGRESSIVE_SALVAGE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  failureResultPolicy: 'perRecord',
  progressive: {
    rollFormula: '1d20 + @abilities.int.mod',
    thresholds: { success: 10 },
    awardMode: 'equal',
  },
  // SALVAGE'S OWN SELECTION over the shared catalogue (issue 1095), and it is DIFFERENT from
  // crafting's on both axes deliberately.
  defaultModifierPolicy: 'highest',
  // `hb-mod-luck` is here so a CHECK actually selects a ROLLING entry (issue 1118).
  defaultModifierIds: ['hb-mod-medicine', 'hb-mod-tools', 'hb-mod-luck'],
});

/**
 * The currency-unit ladder the World > Currency card is photographed against. WORLD scope since
 * issue 1278: one ladder for the whole world, shared by every system that switches currency on.
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

/** The crafting check-modifier CATALOGUE, and why it lives on Herbalism alone. */
const HERBALISM_CHECK_MODIFIERS = Object.freeze([
  {
    id: 'hb-mod-medicine',
    label: 'Medicine',
    icon: 'fa-solid fa-kit-medical',
    expression: '@skills.med.mod',
    // THE ONLY BOUNDED FLAT ENTRY IN THE WORLD (issue 1095; `hb-mod-luck` below is the bounded
    // ROLLING one).
    min: -1,
    max: 6,
  },
  {
    id: 'hb-mod-nature',
    label: 'Nature',
    icon: 'fa-solid fa-leaf',
    expression: '@skills.nat.mod',
  },
  {
    id: 'hb-mod-tools',
    label: 'Herbalism kit',
    icon: 'fa-solid fa-mortar-pestle',
    expression: '@prof',
  },
  {
    // THE ONE ROLLING ENTRY IN THE WORLD (issue 1118), and it is BOUNDED on purpose.
    id: 'hb-mod-luck',
    label: 'Lucky find',
    icon: 'fa-solid fa-clover',
    expression: '1d4',
    max: 3,
  },
  {
    id: 'hb-mod-weather',
    label: 'Favourable weather',
    icon: 'fa-solid fa-cloud-sun',
    expression: '@abilities.wis.mod',
    // CATALOGUED BUT NOT SELECTED, and that is its whole job (issue 1118).
  },
]);

/** RUNEWORK'S OWN modifier library, and the reason it exists is a gate that could not fail. */
const RUNEWORK_CHECK_MODIFIERS = Object.freeze([
  {
    id: 'rw-mod-rune-lore',
    label: 'Rune lore',
    icon: 'fa-solid fa-book-open',
    expression: '@abilities.int.mod',
    min: -1,
    max: 5,
  },
  {
    // NOT `fa-hand`, which was the first icon here and cost a false finding worth recording.
    id: 'rw-mod-etching',
    label: 'Etching hand',
    icon: 'fa-solid fa-pen-nib',
    expression: '@abilities.dex.mod',
    min: -1,
    max: 5,
  },
  {
    id: 'rw-mod-chisel',
    label: 'Inscriber’s chisel',
    icon: 'fa-solid fa-hammer',
    expression: '@prof',
    min: -1,
    max: 5,
  },
]);

const PROGRESSIVE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  failureResultPolicy: 'perRecord',
  progressive: {
    // The formula carried the retired check-modifier placeholder until issue 1094, because
    // `CraftingEngine._buildInteractiveModifierChoice` used to gate the `playerPicks` prompt on
    // that token being PRESENT.
    rollFormula: '1d20 + @abilities.int.mod',
    thresholds: { success: 12 },
    stageAdvanceOnSuccess: 1,
    // The Checks Studio's PREVIEW SANDBOX (issue 1097), and the ONLY authored one in the world.
    preview: { difficulties: [16, 9, 8, 40] },
  },
  checkModifiers: HERBALISM_CHECK_MODIFIERS,
  // `playerPicks` ON THE SYSTEM (issue 1055), and it has to be here rather than on a recipe.
  defaultModifierPolicy: 'playerPicks',
  // FOUR of the catalogue's FIVE entries (issue 1095 added `hb-mod-weather` precisely to leave one
  // out; issue 1118's review added the rolling `hb-mod-luck` to this set so one frame shows a
  // rolling option's chip).
  defaultModifierIds: ['hb-mod-medicine', 'hb-mod-nature', 'hb-mod-tools', 'hb-mod-luck'],
  // AN AUTHORED cap, equal to the eligible-set size above so it bounds nothing (issue 1055).
  maxModifierPicks: 4,
});

/** Herbalism's GATHERING selection over the shared catalogue (issue 1095). */
const HERBALISM_GATHERING_CHECK = Object.freeze({
  // Authored even though gathering's whole failure-result path ships DORMANT pending issue
  // 683 (decision 8): the gathering On-failure section renders this control beside the
  // dormancy notice, so the frame has to photograph a persisted value.
  failureResultPolicy: 'perRecord',
  defaultModifierPolicy: 'addAll',
  defaultModifierIds: ['hb-mod-nature', 'hb-mod-tools'],
});

/**
 * The multi-step routed recipe whose FIRST step awards nothing (issue 1907). Melting the batch
 * costs sand, ash and time and leaves the crafter with a crucible of metal, not an item; only the
 * terminal step yields the lens, and that is the product the Crafting tab must headline.
 */
const GLASSWORK_RECIPES = [
  recipe(
    'gl-r-lens',
    'Grind a Reading Lens',
    LAB_SYSTEM_IDS.GLASSWORK,
    'commodities/gems/gem-faceted-radiant-blue.webp',
    {
      description: 'Melt the batch, then grind the blank down until it reads true.',
      categories: ['Optics'],
      complex: true,
      steps: [
        {
          id: 'gl-step-melt',
          name: 'Melt the batch',
          description: 'Charge the crucible and hold it at heat until the metal runs clear.',
          timeRequirement: { minutes: 0, hours: 6, days: 0, months: 0, years: 0 },
          ingredientSets: [
            {
              id: 'gl-step-melt-s1',
              name: 'Soda batch',
              resultGroupId: 'gl-step-melt-rg',
              ingredientGroups: [
                {
                  id: 'gl-step-melt-s1-g1',
                  name: 'Batch',
                  options: [
                    { componentId: 'gl-silica', quantity: 4 },
                    { componentId: 'gl-soda', quantity: 1 },
                  ],
                },
              ],
            },
          ],
          // AUTHORED EMPTY, and legal: the step advances the craft and awards nothing.
          resultGroups: [{ id: 'gl-step-melt-rg', name: 'Nothing yet', results: [] }],
        },
        {
          id: 'gl-step-grind',
          name: 'Grind the blank',
          description: 'Work the blank down against the lap until the focus is right.',
          timeRequirement: { minutes: 30, hours: 2, days: 0, months: 0, years: 0 },
          ingredientSets: [
            {
              id: 'gl-step-grind-s1',
              name: 'Lapping',
              resultGroupId: 'gl-step-grind-rg',
              ingredientGroups: [
                {
                  id: 'gl-step-grind-s1-g1',
                  name: 'Abrasive',
                  options: [{ componentId: 'gl-silica', quantity: 2 }],
                },
              ],
            },
          ],
          resultGroups: [
            { id: 'gl-step-grind-rg', name: 'Lens', results: [{ componentId: 'gl-lens', quantity: 1 }] },
          ],
        },
      ],
    }
  ),
];

export function buildLabContent({ journalCaseState = null } = {}) {
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
      craftingCheck: SMITHING_CHECK,
      // BOTH essence-behaviour gates, ON, and only here (issue 1036).
      features: {
        essences: true,
        effectTransfer: true,
        propertyMacros: true,
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
      // TWO books, because the bulk panel's staged book list has to photograph one book at `add`
      // and another at `remove` simultaneously, which a single-book system makes unreachable (issue
      // 1011).
      recipeItemDefinitions: [
        { id: 'sm-book', name: 'Forgecraft Folio' },
        { id: 'sm-almanac', name: 'Deepsmith Almanac' },
      ],
      tools: SMITHING_TOOLS,
      // Participation ONLY (issue 1282): the realm library itself is the world's, seeded into
      // `travelConfig` below.
      gatheringRealmSettings: {
        enabled: true,
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
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: PROGRESSIVE_SALVAGE_CHECK,
      // Gathering's own selection over the SAME catalogue — see its own note for why this block
      // exists at all and why it carries no formula.
      gatheringCraftingCheck: HERBALISM_GATHERING_CHECK,
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
      characterPrerequisites: HERBALISM_PREREQUISITES,
      gatheringRealmSettings: { enabled: false },
      // Currency, switched on with the SAME unit ladder Runework carries (issue 1278).
      requirements: {
        currency: { enabled: true },
      },
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
      // `checkMode: 'simple'` is what draws the alchemy Results tab's FIXED TWO-SLOT editor — a
      // labelled "On success" set plus a reserved, undeletable "On a failed check" set
      // (`recipeAlchemySimple = alchemyCheckMode === 'simple'`).
      alchemy: { checkMode: 'simple' },
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
      gatheringRealmSettings: { enabled: false },
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
      // ROUTED salvage with no `salvageCraftingCheck` at all.
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
      gatheringRealmSettings: { enabled: false },
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
      // ROUTED salvage WITH an authored check, which is the pairing jewelry deliberately does not
      // have.
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: ROUTED_SALVAGE_CHECK,
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
      // The SECOND system carrying a modifier library, and the first whose rows anything
      // measures — see `RUNEWORK_CHECK_MODIFIERS` for why the parity subject needed one.
      modifiers: RUNEWORK_CHECK_MODIFIERS,
      gatheringRealmSettings: { enabled: false },
      // The world's CURRENCY system, and runework carries it because nothing else does.
      requirements: {
        currency: { enabled: true },
      },
    },
    // LAST in the array on purpose. `RecipeManager.getRecipes()` returns recipes in persisted
    // order, and the lab's journal runs are pinned to positional picks over the player-visible
    // slice of that list — so a system inserted mid-array would re-point which recipes the
    // already-captured journal frames describe, for no reason beyond where it was written.
    {
      id: LAB_SYSTEM_IDS.TIDEWRACK,
      name: 'Tidewrack Distillation',
      description: 'The coastal discipline: everything the tide leaves, reduced and re-bottled.',
      img: `${ICON_BASE}/consumables/potions/bottle-round-corked-blue.webp`,
      enabled: true,
      // `restricted`, mirroring `lab-alchemy`.
      visibilityMode: 'restricted',
      resolutionMode: 'alchemy',
      craftingCheck: SIMPLE_CHECK,
      // `none` rather than `simple`, deliberately: `lab-alchemy` carries the Simple two-slot
      // Results editor and its reserved failure group, and a second system repeating that would
      // photograph the same shape twice.
      alchemy: { checkMode: 'none' },
      features: {
        essences: true,
        recipeCategories: true,
        itemTags: true,
        gathering: false,
        alchemy: true,
      },
      essenceDefinitions: ESSENCES,
      categories: ['Elixirs'],
      itemTags: ['mineral', 'exotic', 'elixir'],
      components: TIDEWRACK_COMPONENTS,
      componentCategories: componentCategoryVocabulary(TIDEWRACK_COMPONENTS),
      recipeItemDefinitions: [],
      tools: [],
      gatheringRealmSettings: { enabled: false },
    },
    // APPENDED after Tidewrack rather than inserted, for the positional reason stated above.
    {
      id: LAB_SYSTEM_IDS.GLASSWORK,
      name: 'Emberlight Glassworks',
      description: 'Furnace glass: the melt buys nothing but the blank the lap then reads true.',
      img: `${ICON_BASE}/commodities/gems/gem-faceted-radiant-blue.webp`,
      enabled: true,
      visibilityMode: 'global',
      // The world's second `routedByIngredients` system, and the ONLY one whose multi-step feature
      // is on — see `LAB_SYSTEM_IDS.GLASSWORK`.
      resolutionMode: 'routedByIngredients',
      craftingCheck: SIMPLE_CHECK,
      salvageResolutionMode: 'routed',
      features: {
        essences: true,
        recipeCategories: true,
        itemTags: true,
        gathering: false,
        multiStepRecipes: true,
      },
      essenceDefinitions: ESSENCES,
      categories: ['Optics'],
      itemTags: ['batch', 'glass'],
      components: GLASSWORK_COMPONENTS,
      componentCategories: componentCategoryVocabulary(GLASSWORK_COMPONENTS),
      recipeItemDefinitions: [],
      tools: [],
      gatheringRealmSettings: { enabled: false },
    },
  ];

  const gatheringConfig = {
    vocabularies: GATHERING_VOCABULARIES,
    conditions: { weather: 'clear', timeOfDay: 'day' },
    tasks: GATHERING_TASKS,
    events: GATHERING_EVENTS,
    systems: {
      [LAB_SYSTEM_IDS.HERBALISM]: {
        // `encounterChance`, which is exactly what the previous invalid `'gm'` resolved to — so
        // every already-captured herbalism gathering frame (grove, thicket, ridge, blind, stacked)
        // renders unchanged, and the Events tab stays off here.
        rules: systemRules('encounterChance'),
        tasks: GATHERING_TASKS.filter((task) => task.craftingSystemId === LAB_SYSTEM_IDS.HERBALISM),
        events: GATHERING_EVENTS.filter(
          (event) => event.craftingSystemId === LAB_SYSTEM_IDS.HERBALISM
        ),
        conditions: {
          weather: { enabled: true, current: 'clear', values: GATHERING_VOCABULARIES.weather },
          timeOfDay: { enabled: true, current: 'day', values: GATHERING_VOCABULARIES.timeOfDay },
        },
        // `{id, label, icon, expression}` — the shape `_normalizeGatheringCharacterModifier` reads,
        // and nothing else (issue 1117).
        characterModifiers: [
          {
            id: 'hb-mod-herbalism-training',
            label: 'Herbalism Training',
            icon: 'fa-solid fa-leaf',
            expression: '@skills.nat.total',
          },
          {
            id: 'hb-mod-survival',
            label: 'Field Survival',
            icon: 'fa-solid fa-campground',
            expression: '@skills.sur.total',
          },
        ],
      },
      [LAB_SYSTEM_IDS.SMITHING]: {
        // The world's ONLY `full` event tier, and it is on smithing precisely because no captured
        // frame selects a smithing environment: `full` is what mounts the player's Events tab
        // (`GatheringDetail.showEventsTab`) and lists individual event rows, and switching it on
        // for herbalism would move the five herbalism gathering frames.
        rules: systemRules('full'),
        // The world's only enabled resource economy.
        economy: { nodes: { enabled: true } },
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

  const content = {
    systems,
    recipes: [
      ...SMITHING_RECIPES,
      ...HERBALISM_RECIPES,
      ...ALCHEMY_RECIPES.map((entry) =>
        journalCaseState === 'alchemy' && entry.id === 'al-r-fire'
          ? { ...entry, access: { playerIds: ['user-lab-player'], characterIds: [] } }
          : entry
      ),
      ...JEWELRY_RECIPES,
      ...RUNEWORK_RECIPES,
      ...TIDEWRACK_RECIPES,
      ...GLASSWORK_RECIPES,
    ],
    environments: ENVIRONMENTS,
    gatheringConfig,
    // The WORLD currency config (issue 1278). One ladder for the whole world, which is what
    // World > Currency edits and what every currency-enabled system spends against.
    currencyConfig: {
      spendStrategy: 'actorProperty',
      providerId: '',
      macros: { canAfford: '', increment: '', decrement: '' },
      units: CURRENCY_UNITS,
    },
    realms: [...REALMS, ...SMITHING_REALMS],
    // The WORLD travel config (issue 1282).
    travelConfig: {
      revealMode: 'alwaysVisible',
      modifierVisibility: 'visible',
      realms: [...REALMS, ...SMITHING_REALMS],
    },
    components: [
      ...SMITHING_COMPONENTS,
      ...HERBALISM_COMPONENTS,
      ...ALCHEMY_COMPONENTS,
      ...JEWELRY_COMPONENTS,
      ...RUNEWORK_COMPONENTS,
      ...TIDEWRACK_COMPONENTS,
    ],
    tools: [...SMITHING_TOOLS, ...HERBALISM_TOOLS, ...RUNEWORK_TOOLS],
    // THE WORLD TOOL CORPUS (issue 1373, epic 1357), in the shape `toolScope` persists: an
    // `entities` roster of identity records, `defaults` keyed by entity id, `membership` keyed by
    // `<entityId>|<systemId>`, and the world break mode beside them.
    componentScope: {
      entities: [
        {
          id: 'lab-wildwood-resin',
          name: 'Wildwood Resin',
          // A HARVESTED PATH, and the reason it had to change: the harvest carries no
          // `icons/commodities/tree` family at all, so this seed 404'd.
          img: `${ICON_BASE}/commodities/gems/gem-amber-insect-orange.webp`,
          description: 'Tapped from the reach’s oldest ironwoods. No system has rules for it yet.',
          originItemUuid: 'Item.lab-wildwood-resin',
          registeredItemUuid: 'Item.lab-wildwood-resin',
          aliasItemUuids: [],
        },
        {
          id: 'lab-unbound-salt',
          name: 'Unbound Salt',
          img: '',
          description: 'Catalogued from a merchant’s ledger, with no game-world Item behind it.',
        },
        // THE ONE WORLD-ONLY RECORD THE MIGRATION CANNOT PRODUCE (issue 1392). The lab seeds no
        // `migrationVersion`, so `1.30.0`'s world-scope pass runs on every build and LIFTS a world
        // component record out of each system's own `components[]`, electing each record's
        // `category` from the donor system.
        {
          id: 'lab-world-component-curio',
          name: 'Tidewrack Curio',
          img: `${ICON_BASE}/commodities/stone/ore-chunk-blue.webp`,
          description: 'A world component record no crafting system has adopted yet.',
        },
      ],
      defaults: {
        // (v) AN INHERITED ESSENCE MAP THAT DIFFERS FROM THE SYSTEM'S OWN ROW ──────────── Issue
        // 1371 r20-store3, reviewer round 6 finding 9. The world `essences` section is authored for
        // almost every lab component and inherited by 66 pairs — but the `1.32.0` pass ELECTS each
        // world map from the donor system's own row and only marks a system inheriting when the two
        // are EQUAL, so in a freshly migrated world the resolved map and the persisted row are
        // identical by construction and the r19 overlay changes no pixel.
        'sm-iron-ingot': {
          id: 'sm-iron-ingot',
          category: 'Refined',
          essences: { earth: 2, fire: 1, air: 1 },
        },
        // `moss` IS APPLIED HERE TOO (issue 1371 r17, UX F-N2).
        'sm-coal': { id: 'sm-coal', category: 'Raw Materials', tags: ['fuel', 'bulk', 'moss'] },
        'lab-world-component-curio': {
          id: 'lab-world-component-curio',
          category: 'Curios',
          tags: ['moss'],
        },
      },
      membership: {
        [`sm-iron-ingot|${LAB_SYSTEM_IDS.SMITHING}`]: {
          entityId: 'sm-iron-ingot',
          systemId: LAB_SYSTEM_IDS.SMITHING,
          // `essences: true` is stated rather than left to the `1.32.0` pass — see the default
          // above: the pass decides an undecided record by EQUALITY, and this pair is seeded
          // unequal on purpose.
          inherit: { category: true, essences: true },
        },
        [`sm-coal|${LAB_SYSTEM_IDS.SMITHING}`]: {
          entityId: 'sm-coal',
          systemId: LAB_SYSTEM_IDS.SMITHING,
          inherit: { category: false },
          category: 'Raw Materials',
          mutedTags: ['bulk'],
        },
      },
    },
    toolScope: {
      entities: [
        ...[...SMITHING_TOOLS, ...HERBALISM_TOOLS].map((tool) => ({
          id: tool.id,
          name: tool.name,
          img: tool.img,
          description: tool.description ?? '',
          originItemUuid: tool.originItemUuid,
          registeredItemUuid: tool.registeredItemUuid,
          aliasItemUuids: [],
        })),
        {
          id: 'lab-tool-unlinked',
          // A REAL FOUNDRY PATH, verified against the harvested `icons/` tree rather than guessed
          // from the naming convention.
          name: 'Unclaimed Bellows',
          img: `${ICON_BASE}/tools/smithing/furnace-boiler-steel.webp`,
          description: 'A world record no game-world Item stands behind yet.',
        },
        ...WORLD_ONLY_TOOL_ENTITIES,
      ],
      defaults: Object.fromEntries([
        ...[...SMITHING_TOOLS, ...HERBALISM_TOOLS].map((tool) => [
          tool.id,
          {
            id: tool.id,
            breakage: tool.breakage ?? { mode: 'limitedUses', maxUses: null },
            onBreak: tool.onBreak ?? { mode: 'destroy' },
            // THE SEEDED THIRD SECTION, READ OFF THE TOOL THAT DECLARES ONE (issue 1373, round 2).
            ...(Array.isArray(tool.repairRequirements)
              ? { repairRequirements: tool.repairRequirements }
              : {}),
            // THE TWO SECTIONS THAT JOINED `TOOL_SECTIONS` AT `1.31.0`, AUTHORED ON ONE TOOL (issue
            // 1373).
            ...(TOOL_WORLD_REQUIREMENT_DEFAULTS[tool.id] ?? {}),
          },
        ]),
        // The two world-ONLY records' defaults, appended rather than merged over the top: they
        // name no crafting system tool, so the map above cannot produce them and there is nothing
        // for them to override.
        ...WORLD_ONLY_TOOL_DEFAULT_ENTRIES,
      ]),
      membership: Object.fromEntries(
        [
          ...SMITHING_TOOLS.map((tool) => [tool.id, LAB_SYSTEM_IDS.SMITHING]),
          ...HERBALISM_TOOLS.map((tool) => [tool.id, LAB_SYSTEM_IDS.HERBALISM]),
        ].map(([entityId, systemId]) => [
          `${entityId}|${systemId}`,
          {
            entityId,
            systemId,
            // ONE OVERRIDE among them, so the catalogue's per-section inherit counts are a real
            // number rather than "every system, always" (issue 1373).
            inherit: entityId === 'sm-tool-anvil' ? { breakage: false } : {},
            enabled: true,
            ...(entityId === 'sm-tool-anvil'
              ? { breakage: { mode: 'diceExpression', formula: '1d20', threshold: 3 } }
              : {}),
          },
        ])
      ),
      // AUTHORED, so the World breakage default card draws a SELECTED segment rather than the
      // unauthored state, and the system Tool Rules tri-state has a world token to name.
      toolBreakage: { authority: 'toolSpecific' },
    },
    // THE WORLD VOCABULARY (issue 1392, epic 1357, PR 7a). Authored so the `world-vocabulary` case
    // photographs a POPULATED screen, and authored to put all THREE affordance states in one frame
    // rather than three rows of the same one:
    worldVocabulary: {
      componentCategories: [
        { id: 'raw materials', name: 'Raw Materials' },
        { id: 'reagents', name: 'Reagents' },
        { id: 'refined', name: 'Refined' },
        { id: 'curios', name: 'Curios' },
      ],
      componentTags: [
        { id: 'ore', name: 'ore' },
        { id: 'ingot', name: 'ingot' },
        { id: 'moss', name: 'moss' },
      ],
      recipeCategories: [
        { id: 'weaponsmithing', name: 'Weaponsmithing' },
        { id: 'refining', name: 'Refining' },
        { id: 'curiosities', name: 'Curiosities' },
      ],
    },
    // Exposed so the uuid index can resolve an owned recipe-item copy back to the book it is a copy
    // OF.
    recipeItems: [...HERBALISM_RECIPE_ITEMS],
  };
  return seedJournalPrototype(content, journalCaseState, { component, recipe });
}

/**
 * Author the Journal's ready single-step fixture as a real optional no-check craft.
 *
 * @param {ReturnType<typeof buildLabContent>} content Fresh lab content, mutated in place.
 */
export function seedJournalNoCheckFixture(content) {
  const system = content.systems?.find((entry) => entry?.id === LAB_SYSTEM_IDS.SMITHING);
  const recipeEntry = content.recipes?.find((entry) => entry?.id === 'sm-r-horseshoe');
  if (!system || !recipeEntry) {
    throw new Error('view lab: ready-single no-check fixture requires smithing and Bend Horseshoe');
  }
  system.craftingCheck = {
    ...system.craftingCheck,
    enabled: false,
    simple: { ...system.craftingCheck?.simple, rollFormula: '' },
  };
}
