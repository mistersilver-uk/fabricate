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
  // A SECOND alchemy-mode system, and the only reason it exists is that the player's discipline
  // chooser cannot render without one: `alchemyStore`'s `needsChooser` is
  // `systems.length > 1 && !activeSystemId`, so with a single discipline the chooser is not a
  // state the app can be driven into — it is a screen that does not exist. Its cost is disclosed
  // rather than hidden: a sixth system adds a row to the manager's system library and moves the
  // rail's system count, and `canSwitch` flips true, which adds a "Switch discipline" control to
  // the two already-shipped alchemy workbench frames.
  TIDEWRACK: 'lab-tidewrack',
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
    // Carriers of the DISABLED `aether` essence (issue 1036). Two of them, so the essence
    // library's usage readout, the inspector's stat card and the bulk delete's blocked-
    // member notice all have a non-zero, non-one number to report. A disabled essence still
    // counts and is still consumed, which is exactly what these carriers demonstrate.
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

/**
 * The second alchemy discipline's components.
 *
 * Deliberately owned by NOBODY. A component only reaches the player's Inventory when an actor
 * holds a stack whose uuid matches its `originItemUuid`, and pointing these at items the roster
 * already carries would re-parameterise those cards with a second system claim — the multi-system
 * selector the Air Shard frames exist to prove. The chooser card this system exists for reads
 * system identity and recipe counts only, so an unstocked discipline photographs it exactly.
 */
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
  // ROUTED salvage, and the world's only POPULATED outcome-routing table.
  //
  // The routing selects are drawn from `salvageCraftingCheck.routed`'s outcome tier NAMES
  // (`salvageOutcomeNames`), and each row's chosen value is a RESULT GROUP ID — so a routed
  // config needs three things at once: the system in routed salvage mode, an authored routed
  // salvage check with tiers, and more than one result group to route between. Jewelry has the
  // first and deliberately not the second (it is the misconfigured-salvage fixture), so the
  // routing table there renders its "no outcome tiers to route yet" empty state.
  //
  // On `rw-slag` specifically because no lab actor holds any: a component with a salvage config
  // grows a whole salvage panel in the player's inventory detail, and every other Runework
  // component is stocked on Brenna or Vosk.
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
 * The shared essence vocabulary. Every one of the six lab systems declares THIS array, so
 * an edit here moves every essence surface in the corpus at once.
 *
 * SIX entries. Deletion is WARNED, not blocked (issue 1036, maintainer round), so every
 * essence is deletable; the sixth (`mote`) is still special because it is the only essence
 * NO component carries and the only one with no source, which gives the browser a clean
 * zero-carrier subject for both. See its own note.
 *
 * COLOURS (issue 1036). Four of the five carry a distinct `--fab-tag-*` token and `air` is
 * deliberately left UNSET: an essence with no authored colour renders in the theme accent
 * by design, and it is a first-class state the redesign has to photograph — the frame
 * proves both that the colour vocabulary appears and that its absence is handled, which a
 * fully-coloured fixture cannot.
 *
 * `aether` is NEW, and it is the feature's HEADLINE STATE: DISABLED while components carry
 * it and a recipe requires it. Its quantities still match, accumulate and are consumed;
 * only the behaviour it carries onto a crafted result is suppressed. A new essence rather
 * than a flipped existing one, deliberately — flipping one would disable it in all six
 * systems and, through the new recipe-activation blocker, could disable lab recipes and
 * break unrelated cases.
 *
 * Its `propertyMacroUuid` does NOT resolve: the lab world declares no `Macro` documents at
 * all, so the editor's macro card photographs in its MISSING state. That state has no
 * shipped precedent and is worth having; the RESOLVED state routes to smoke or maintainer
 * evidence rather than being implied here.
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
    // The ZERO-CARRIER essence (issue 1036). NO component anywhere carries it, so
    // `componentUsageCount` is 0. Deletion is warned rather than blocked, so every lab
    // essence is deletable; `mote` is the one whose bulk-delete impact statement reports
    // zero carrying components, which is the clean subject the impact copy is written for.
    //
    // It is required by `sm-r-runeplate-draft`, so `recipeRewrites` is 1 rather than 0 and
    // the third impact number is not trivially satisfied. That recipe SPECIFICALLY, for the
    // reason recorded there: it is already `enabled: false` and already un-enableable, so a
    // new requirement on it moves no status pill on any recipe-library frame.
    //
    // NO `sourceComponentId` on purpose: it is the corpus's only essence with no source at
    // all, so the browser's `Source: none` filter and the row's absent Effects pill both
    // have a subject.
    id: 'mote',
    name: 'Mote',
    description: 'Loose motive dust. Useful, and nobody has found a use.',
    icon: 'fas fa-circle-dot',
    colorToken: 'butter',
  },
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
    // exactly the same reason. `Recipe` (src/models/Recipe.js:28) reads `data.category` and runs it
    // through `normalizeRecipeCategory`; a `categories` ARRAY is not read by anything in `src/`, so
    // every recipe in this fixture normalized to the reserved `general` bucket while the system's
    // own category vocabulary sat unused beside it. The recipe library therefore rendered ONE
    // undifferentiated group and claimed, via its lit "Group by category" toggle, to be showing
    // the grouping feature working. The authored list stays the input because it reads as intent;
    // only the first entry can survive, because a recipe HAS one category.
    category: categories[0] ?? '',
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
      // The world's only LEGACY-basis membership, and the bulk panel's book axis is why it
      // exists (issue 1010). That axis's `Remove` is dead for a book holding none of the
      // selected recipes, so the staged frame cannot photograph a removal without one — and
      // reaching it through this SCALAR rather than through `sm-almanac.recipeIds` is the
      // point: `_normalizeSystem` backfills `membershipResolvesByRecipeIds` from the
      // definition ARRAYS, so smithing stays on the legacy basis (see the recipe-item note
      // below) and the frame proves the panel's counts resolve through it. A count read off
      // `definition.recipeIds` would report "holds none selected" here and disable the very
      // control the frame is taken to show.
      //
      // Free of player-facing consequence: smithing is `visibilityMode: 'global'`, so book
      // membership gates nothing a player sees.
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

  // ── Requirement-rail states ────────────────────────────────────────────────────────────────────
  // BOTH recipes below are named to sort AFTER "Inscribe a Runeblade", and that is load-bearing
  // rather than flavour. The player recipe browser sorts A→Z by display name and pages at twelve, so
  // page one currently ends exactly there. A new recipe named earlier in the alphabet would push a
  // row onto page two — and eight already-captured crafting cases select their row by
  // `data-recipe-id` with no search filter, so each of them would fail outright. Anything sorting
  // after "Inscribe" lands on page two, leaves page one byte-identical, and is reached by its own
  // case's search step exactly as `sm-r-silver-ingot` and `sm-r-chainmail` already are.

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
      // 'fixed:met']` with exactly one chooser open. Each group is engineered for its state:
      //
      // - `fixed:met`    — a single-option group Brenna covers outright (9 coal against 2).
      // - `choice:partial` — a two-option group she has NOT picked from AND cannot currently
      //   satisfy. Both halves are required: `choiceState` short-circuits to `met` the moment the
      //   resolver's default pick is satisfiable, whatever the player has or has not chosen, so a
      //   choice between two components she holds renders `met` and the to-do state is
      //   unreachable. She owns no silver ore and no sapphire, so the group stays unsatisfied, and
      //   because she has not picked either it reads `partial` — a to-do, never an error, which is
      //   the state a two-state rail could not express and this frame exists to show.
      // - `essence:short` — WATER, and water specifically: `essenceState` reads `delivered`, and a
      //   short slot only reads `short` rather than `partial` when the resolver can allocate
      //   NOTHING. No smithing component any of the three source actors holds carries water
      //   (silver ore and sapphire do, and nobody owns either), so the pool delivers zero. Fire or
      //   earth would auto-allocate and render `partial`.
      //
      // The rail auto-advances to the first unsatisfied OPENABLE slot, which is the choice — so the
      // alternatives chooser is the one open chooser and the essence pool stays closed.
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
      // alternatives radiogroup carrying a `CraftingEssenceThumb`: `IngredientOptionSelector`
      // branches on the OPTION's `isEssence`, so an essence requirement in its own group renders a
      // rail tile instead and never reaches the chooser. Both options are affordable, so the
      // radiogroup shows two selectable rows rather than one flagged as short.
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

  // ── Activation-blocked rows (issue 1010) ───────────────────────────────────────────────────────
  // The two rows the re-pointed authoring-state pill exists for. Before these, no lab recipe could
  // wear EITHER branch: `recipe()` hardcodes `enabled: true` and the file's only `enabled: false`
  // was a component's salvage config, so the `Can't enable` frame was unreachable and the widened
  // `Incomplete` branch had no visual evidence at all.
  //
  // They are a PAIR because the branch split is the contract: `deriveRecipeStatuses` reads ONE
  // predicate (`enableBlocked`) and differs only on whether the recipe is currently off. One
  // fixture can only ever photograph one side of that.
  //
  // Both sit on smithing so the bulk-edit frames select them out of the same flagship library every
  // other recipe frame photographs, rather than out of a throwaway system whose rows look nothing
  // like the ones a GM sees.
  recipe(
    'sm-r-runeplate-draft',
    'Draft: Runeplate Harness',
    LAB_SYSTEM_IDS.SMITHING,
    'equipment/chest/breastplate-scale-grey.webp',
    {
      description: 'Begun and not finished: the plan exists, the ingredients and outputs do not.',
      categories: ['Armoursmithing'],
      // OFF and un-enableable — the `Can't enable` (danger) row.
      //
      // `enabled: false` overrides the builder's hardcoded `true` because `recipe()` spreads
      // `...config` AFTER it; that ordering is what makes this fixture expressible at all.
      //
      // An INCOMPLETE SHELL, not a broken one: no result groups, which is the completeness
      // contract failing while structural integrity holds. So `validateStructure()` passes,
      // `validate()` fails, and the activation gate refuses it — `incomplete: true` AND
      // `enableBlocked: true`, with the pill reading `blocked` because the recipe is off.
      //
      // Safe on every player surface by construction: `InventoryListingBuilder` and the crafting
      // listing drop `enabled === false` outright, so this row exists only for the GM.
      //
      // It is ALSO the lab's one recipe that requires the DISABLED `aether` essence (issue
      // 1036), which is what gives that essence a non-zero recipe-usage count for the
      // library readout, the inspector stat card and the bulk-delete impact statement. This
      // recipe specifically, because the new activation blocker refuses a recipe requiring a
      // disabled essence, and this one is ALREADY off and already un-enableable — so the
      // blocker changes nothing about it, where adding the requirement to a live recipe
      // would have moved a row on the recipe library's status pills.
      ingredientSets: [
        {
          id: 'sm-runeplate-s1',
          ingredientGroups: [
            {
              id: 'sm-runeplate-s1-g1',
              name: 'Aether binding',
              // The FIRST-CLASS essence option shape — `match: { type: 'essence', … }` —
              // which is what `recipeReferencesEssence` walks. A bare `{ essenceId }` is
              // not a reference at all and would leave the count at zero.
              options: [{ match: { type: 'essence', essenceId: 'aether', amount: 2 } }],
            },
            {
              // `mote` rides along on this SAME recipe, for the reason `aether` is here: it
              // is the corpus's only DELETABLE essence, and without a recipe requiring it
              // the bulk-delete impact statement's "recipes will be rewritten" number would
              // be 0 for every selection that can reach a live Delete button.
              //
              // A SECOND GROUP rather than a second option in the group above. Options
              // inside one group are ALTERNATIVES, so adding `mote` there would have made
              // the disabled `aether` merely one way to satisfy the group — which could
              // lift the activation blocker and move this recipe's status pill, the exact
              // outcome the note above chose this recipe to avoid. Groups are required
              // independently, so the blocker still sees a required disabled essence.
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
      // widened predicate. Under the retired derivation this recipe wore NO pill at all:
      // `incomplete` is `validate().valid === false && validateStructure().valid === true`, and a
      // structurally broken recipe fails BOTH validators, so it read `incomplete: false` while the
      // activation gate would still have refused it.
      //
      // The break is a NEGATIVE ingredient quantity. `Ingredient.validate` documents that the
      // positive-quantity check "always fires" — it is not waived under `requireComplete: false` —
      // so `validateStructure()` fails, which is precisely what `incomplete` cannot see. It also
      // survives the model round-trip, which most candidate breaks do not: `Ingredient`'s
      // constructor is `data.quantity || 1`, so `-1` is preserved where `0` would be coerced to 1,
      // and `Recipe._normalizeTimeRequirement` clamps a negative duration to 0 (making the
      // otherwise-obvious `timeRequirement` break unreachable from persisted data).
      //
      // Chosen over the other unconditional structural failures — a duplicate result-group id, a
      // duplicate result id — because those collide with Svelte KEYED `{#each}` blocks over the
      // same ids, which throws at render rather than rendering a broken recipe.
      //
      // This one IS enabled, so unlike its sibling above it reaches the player crafting listing:
      // `InventoryListingBuilder` and the crafting listing filter `enabled === false` only. The
      // second group is what keeps that contained. A negative need does NOT read as a shortfall:
      // resolving the broken group on its own returns `success: true` with no missing groups
      // (measured directly against this fixture), so the break alone would have put this row in
      // the player listing's CRAFTABLE band — reordering a frame it has no business reordering,
      // and advertising a craft that `CraftingEngine.craft` then refuses on `recipe.validate()`.
      // The second group demands silver ore, which no lab actor's inventory contains, so the set
      // is genuinely unsatisfiable and the row lands beside the other uncraftable smithing ones.
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
      // for. The component / OR-group / tag rows sit above the fold and the essence and
      // currency-cost rows below it, so the two captures split there.
      //
      // The currency row is `match: { type: 'currency', unit, amount }` — the shape
      // `matchTypes.js`'s `currencyHandler.normalize` reads. `{ currency: 'gp' }` or a bare
      // `cost` field would normalize through the COMPONENT fallback to
      // `{ type: 'component', componentId: null }` and render as an unset component row.
      //
      // It lives on herbalism because herbalism is the only system that is both currency-enabled
      // and invisible to the player, so no player frame's requirement rail moves.
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
      // consumes its own difficulty before the next is produced. A single-result group draws the
      // same tab with one row and two disabled chevrons, which shows the ORDERING affordance
      // without showing an order — the emptiest possible version of the one frame that exists to
      // photograph this shape. The stage DCs are the RESULT COMPONENTS' own difficulties (1, 2, 4),
      // so they rank low → high without anything here restating them.
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

  // ── The player-VISIBLE progressive pair ────────────────────────────────────────────────────────
  // Progressive is a per-SYSTEM resolution mode (`CraftingListingBuilder._buildRecipeModel` reads
  // `system.resolutionMode`), so a progressive player body can only be photographed on a
  // progressive system the player can see. Herbalism is the world's progressive system and it is
  // knowledge-gated, which is what made the four progressive frames unreachable: a player who has
  // learned nothing sees none of it.
  //
  // The alternative was a SIXTH crafting system in progressive mode with global visibility. That
  // was rejected: a new system row moves the manager's system library and its rail count across
  // every manager frame, where two learned entries on the crafting actor move one badge on three.
  // Brenna learns exactly these two (see `LEARNED_RECIPES` in `labActors.js`) and nothing else, so
  // no other herbalism recipe reaches the player's listing.
  //
  // Both are named to sort after "Inscribe a Runeblade" for the page-one reason documented on the
  // smithing pair above.
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
      // the recipe the reorder chevrons and the move announcement are photographed on. Stage DCs
      // are the result components' own difficulties (1, 2, 4), so they rank low → high and a
      // downward move genuinely re-derives the thresholds rather than merely swapping two labels.
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
      // The world's only per-recipe check-modifier PICK (issue 1055). It carries ids ALONE: a
      // recipe chooses WHICH modifiers apply, never HOW they combine, so no `policy` is persisted
      // here and the SYSTEM's rule decides whether this pick is honoured at all. Under the
      // system's authored `playerPicks` it is not — the player selects at roll time — which is why
      // every frame of this picker clicks the rule group over to `byRecipe` first.
      //
      // All three catalogue entries, so the picker draws three pills with three DIFFERENT values
      // (Medicine +4, Herbalism kit +3, Nature +2) rather than a row of identical chips — a
      // pick control photographed against equal options shows nothing about picking. Three is also
      // what makes the pick-cap frames legible: a cap of 3 typed on the Checks tab puts this
      // recipe's picker AT its bound, and a cap of 5 leaves it below one.
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
      // adds the muted "order set by the GM" line. It has to be authored explicitly — the flag
      // defaults to TRUE, so the fixed state is unreachable from an unauthored recipe. Different
      // result components from its sibling (difficulties 1, 3, 5) so the two frames are not the
      // same list photographed twice.
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
      // fixed two-slot Results editor draws. Its absence is tolerated by validation (a settings-only
      // None -> Simple flip runs no recipe migration), which is exactly why it has to be authored
      // here — an unauthored failure slot renders as "Nothing produced on this outcome" and the
      // one frame covering this shape shows half of it.
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
 *
 * PATHS ARE ROLL-DATA PATHS, NOT DOCUMENT PATHS. `characterPrerequisites` resolves each one against
 * `actor.getRollData()`, which Foundry has ALREADY flattened — dnd5e's roll data exposes
 * `skills.arc.value`, not `system.skills.arc.value`. `characterPrerequisitePresets.js` ships
 * `skills.arc.value` for exactly this reason, and the canonical data-models spec states it as a
 * requirement.
 *
 * These were authored `system.`-prefixed. Every one resolved to `undefined`, so `coerceNumber` gave
 * 0 and `coerceBoolean` gave false and each gate read permanently unmet — and, worse, the manager
 * RENDERS the raw path, so a published frame documented the exact convention the spec exists to
 * prevent. A screenshot that shows an authoring convention IS documentation.
 *
 * It failed silently because the resolver logs a `console.warn`, and the capture driver's gate
 * collects `console.error` only. Note the neighbouring gathering-modifier presets use the OTHER
 * convention (`@actor.system.…`) — two conventions in one codebase is what makes this easy to get
 * wrong.
 */
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

/**
 * Herbalism's character prerequisites, and why they are not Runework's.
 *
 * The System Overview settings page renders Character modifiers, Character prerequisites and
 * Currency Units as three sibling list cards, and the live smoke photographs all three together
 * with one modifier open and its icon picker down. That frame needs ONE system carrying all three
 * — and the modifiers card is gated on `gathering`, which Runework does not have, while Runework's
 * own prerequisites are read by the Tool Studio frames and must stay where they are.
 *
 * PATHS ARE ROLL-DATA PATHS, NOT DOCUMENT PATHS — see RUNEWORK_PREREQUISITES for the full note and
 * for what a `system.`-prefixed path silently does here.
 */
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
  // ── Attemptable tasks ────────────────────────────────────────────────────────────────────────
  // The three tasks below carry states the four above do not: a time gate, a required tool, and a
  // realm lock. They were authored separately because those states need their own configuration,
  // not because the earlier four were malformed.
  //
  // They WERE malformed, though, and the note that used to sit here misdiagnosed it. It blamed
  // `validateTaskConfiguration`'s d100 rule for the attempt failing, when the real cause was that
  // the four tasks authored `dropTable`/`weight` — a shape NOTHING in `src/` reads.
  // `_normalizeGatheringTask` takes `task.dropRows ?? task.itemDrops` and normalises each row's
  // `dropRate`. So all four normalised to `dropRows: []` and browsed with no drops at all, while
  // several frames declared they were showing a populated yield library. Both tasks composing
  // `hb-env-grove` were among them, and that is the environment every player gathering frame opens
  // on. Now authored in the shape the normalizer reads.
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
    // The world's only resource-NODE task, and the pool is declared HERE rather than on the
    // environment: `_runtimeTask` reads `environment.nodeRuntime[taskId]` only when the library
    // task carries a `nodes` config, and treats the library config as authoritative for
    // everything except the live count. Without this the environment entry is never consulted.
    //
    // `onSuccess`, not the `onStart` default, and that is the whole point: with `onStart` the
    // pool falls whether the gather succeeded or not, so a post-attempt count would evidence an
    // ATTEMPT rather than a SUCCESS — and the frame it feeds is named for the success.
    //
    // No `respawn` block, which `normalizeRespawn` resolves to `{policy: 'manual'}` — a
    // GM-restocked pool. Deliberate over `overTime`: an interval-driven pool would re-anchor and
    // regrow on a world-time pass, and the count is only evidence of the gather if nothing else
    // can move it between the attempt and the shutter.
    nodes: { enabled: true, max: 3, depletionTiming: 'onSuccess' },
    dropRows: [
      { id: 'row-1', componentId: 'sm-iron-ore', quantity: 3, dropRate: 50, enabled: true },
      { id: 'row-2', componentId: 'sm-copper-ore', quantity: 2, dropRate: 30, enabled: true },
      { id: 'row-3', componentId: 'sm-silver-ore', quantity: 1, dropRate: 15, enabled: true },
      { id: 'row-4', componentId: 'sm-ruby', quantity: 1, dropRate: 5, enabled: true },
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
  // ── Smithing's event roster, and why it is three rows rather than one ───────────────────────────
  // Smithing is the world's only `full`-event-visibility system (see `systemRules`), so Old Karrun
  // Mine is the only environment whose player Events TAB exists — and therefore the only place the
  // individual event list, its search box and its pagination can be photographed at all. A
  // one-row list renders that surface in its emptiest legible state: no ordering, nothing for the
  // search box to filter, and a pagination bar summarising a single item.
  //
  // Three is what the environment composes: `enabledEventIds` on `sm-env-mine` names all three, and
  // the weights differ so the per-row chance column shows three distinct values rather than one
  // repeated. Herbalism keeps its own two events untouched — every already-captured herbalism
  // gathering frame and both manager event frames read those.
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
    // NO node runtime, where there used to be `{'hb-task-forage': {remaining: 3, respawnAt: null}}`.
    // That entry configured nothing, twice over: `normalizeNodeConfig` reads `max ?? maxCount` and
    // `current ?? availableCount`, so neither key resolved and `normalizeNodeRuntime` dropped it —
    // and even in the right shape a per-environment entry is only READ when the library TASK
    // carries a `nodes` config, which no herbalism task does. Removed rather than re-shaped:
    // herbalism's `economy.nodes` is off, so a pool here could never render, and the world's live
    // pool belongs where a frame can photograph it (`sm-env-mine`).
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
    //
    // A resolved, non-timed gather changes nothing on the gathering surface unless the system runs
    // a resource economy: no node pool and no stamina means the same environment, the same task
    // rows and the same inspector before and after, so the two frames would differ only by
    // accident. A pool makes the outcome legible — "Nodes available 2/3" where the ready frame
    // reads 3/3.
    //
    // On SMITHING because smithing is the one gathering system no captured task frame reads: the
    // five herbalism gathering frames all select herbalism environments, and enabling the economy
    // there would put a node line into every one of them.
    //
    // The POOL ITSELF is declared on the library task (`sm-task-prospect.nodes`), because
    // `_runtimeTask` only consults `environment.nodeRuntime[taskId]` when the library task carries
    // a `nodes` config — "library config is authoritative; the per-environment entry contributes
    // only runtime state". This entry is that runtime state: a full pool, stated rather than
    // implied, so the ready and post-gather frames are 3/3 and 2/3 rather than seeded-on-first-read.
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

/**
 * The per-system gathering rules.
 *
 * `eventVisibility` is the one field a caller varies, and it is a THREE-value enum —
 * `dangerLevelOnly` | `encounterChance` | `full` (`GATHERING_EVENT_VISIBILITIES`). Only `full`
 * mounts the player's Events tab and lists individual events; the other two collapse to a band in
 * the Tasks panel.
 *
 * It was authored `'gm'`, which is not one of the three. `_resolveEventVisibility` answers an
 * unrecognised value with the RESTRICTIVE default (`encounterChance`) rather than throwing — the
 * tenth instance on this branch of a fixture shape `src/` does not read, degrading to a default
 * that renders cleanly. The Events tab was therefore unreachable for every environment in the
 * world while the fixture claimed to be configuring event visibility at all.
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
 * Karrun Forgecraft's OWN crafting check — the world's only one that authors recipe TIERS.
 *
 * Not a variant of `SIMPLE_CHECK`, and deliberately not an edit to it: that object is frozen and
 * shared by five systems, so authoring tiers on it would put the same two tiers on alchemy,
 * runework and both simple-mode systems at once and move every frame that reads a DC.
 *
 * Tiers are what `resolveRecipeCheckTierOptions` returns for a simple-mode system whose `dcMode`
 * is static (`routedOutcomeKeywords.js:206-213`), and they are the ONLY route to a populated
 * "Check tier" picker anywhere in the lab world — no lab system authored `tiers` before, so the
 * recipe editor's tier dropdown and the bulk panel's tier select both rendered their
 * "this system authors no tiers" Callout instead of the control the frames are meant to show.
 *
 * Everything else is `SIMPLE_CHECK`'s values verbatim, including the omitted `dc` (which
 * `_normalizeSimpleCraftingCheck` defaults to 15), so no recipe's DC pill moves: nothing in this
 * world carries a `checkTierId`, and a tier only applies to a recipe that names it.
 */
const SMITHING_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
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
      // AUTHORED STEPS ON A SYSTEM WHOSE MULTI-STEP FEATURE IS OFF. That pairing is the whole
      // point: `RecipeEditView`'s `collapsed = !multiStepEnabled && steps.length > 1`, so this is
      // the only arrangement in the world that draws the editor's read-only collapsed-steps card
      // and its explanatory note in place of the editable steps accordion. Jewelry declares
      // `multiStepRecipes: false`, so no feature toggle has to be driven to reach it.
      //
      // The two steps' combined requirements are EXACTLY the single set they replace (3 wire +
      // 1 gold billet), so the collapsed one-combined-action reading of this recipe demands the
      // same stock it demanded before and its craftability — and therefore its row status in the
      // already-captured player crafting list — is unmoved.
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
        // No group for the `rw-ruined` tier. `RecipeResultGroupCard`'s `outcomeTierOptions` is
        // success-filtered by design — a failed check produces the recipe's failure output, not a
        // routed result set — so a group claiming a failure tier renders its raw outcome ID and
        // raises a validation issue. That is the UI being right, and the fixture being wrong.
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
    // The ONLY authored trigger list in the fixture world (issue 975). Every other check
    // leaves `checkBreakage` unset, so before this every frame of the trigger card drew
    // `[data-triggers-empty]` and the tier-step row existed in no captured frame at all.
    //
    // Runework earns them because it is the only crafting check with NAMED tiers, which is
    // what makes a `target` step renderable — the tier `<select>` has something to offer.
    // The salvage and herbalism checks are deliberately left alone: seeding those would
    // rewrite already-captured frames for no extra evidence.
    //
    // Shaped to survive `_normalizeUnifiedTrigger` verbatim: an explicit `outcome` and
    // `breakTools` (absent BOTH, the normalizer reads the trigger as a pre-recombine
    // break-only one and migrates it to `breakTools: true`), a condition carrying every
    // operand its type requires, and a literal `id` so the lab renders the same
    // `[data-trigger="…"]` on every run — the case's scroll anchor names one.
    //
    // ORDER IS LOAD-BEARING for the capture, not for the runtime (steps compose
    // commutatively). `scrollIntoViewIfNeeded` lands its anchor near the BOTTOM edge, so
    // anchoring the case on the LAST tier-step row is what puts both populated cards —
    // and therefore both operand shapes, the tier select and the step count — in one
    // frame. The target trigger is authored first for that reason.
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
});

/**
 * Runework's SALVAGE check: routed, with named outcome tiers.
 *
 * The tier NAMES are what the per-component outcome-routing rows are keyed by, so they are the
 * load-bearing part — `rw-slag`'s `outcomeRouting` map names `Masterwork` and `Standard` and would
 * route nothing if either drifted. Its own block, not a reference to `ROUTED_CHECK`: salvage
 * resolves on `salvageCraftingCheck` and never on `craftingCheck`, and a shared object would imply
 * a coupling the code does not have.
 */
const ROUTED_SALVAGE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
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
  // SALVAGE'S OWN SELECTION over the shared catalogue (issue 1095), and it is DIFFERENT from
  // crafting's on both axes deliberately. The catalogue is shared; the selection is not, and a
  // world where all three activities picked the same rule over the same ids is a world in which
  // an activity reading another's selection looks identical on screen.
  //
  // It is also what gives the read-only entry row a frame: the salvage card renders the entries
  // read-only with a bounds chip, and with no eligible set every row would be in the
  // not-selected state and the chip's companion state would be depicted nowhere.
  defaultModifierPolicy: 'highest',
  defaultModifierIds: ['hb-mod-medicine', 'hb-mod-tools'],
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

/**
 * The crafting check-modifier CATALOGUE, and why it lives on Herbalism alone.
 *
 * `checkModifiers` / `defaultModifierPolicy` / `defaultModifierIds` are siblings of the per-mode
 * check block, normalized by `CraftingSystemManager._normalizeCheckModifierConfig` — NOT the
 * gathering `characterModifiers`, which are a different aggregate on a different setting. Each
 * entry is `{id, label, icon?, expression}` and the expression is a roll-data expression, so it
 * carries the `@` sigil the editor's `RollDataExpressionInput` renders.
 *
 * A populated catalogue also un-hides the recipe editor's per-recipe "Crafting modifier" override
 * (`RecipeOverviewTab`'s `craftingModifierOptions`), so putting it on the default system would add
 * a control to every already-captured smithing recipe Overview frame. Herbalism's recipe Overview
 * is captured by nothing, and its Checks route by nothing else — so this is the one system where a
 * catalogue is free.
 *
 * `highest` rather than `addAll` because it is the policy whose meaning is least obvious from the
 * rows alone, and it is what the live smoke's counterpart frame is captured with.
 */
const HERBALISM_CHECK_MODIFIERS = Object.freeze([
  {
    id: 'hb-mod-medicine',
    label: 'Medicine',
    icon: 'fa-solid fa-kit-medical',
    expression: '@skills.med.mod',
    // THE ONLY BOUNDED ENTRY IN THE WORLD (issue 1095). Per-entry `min`/`max` clamp the
    // RESOLVED value, and three surfaces render them: the authoring pair of Steppers on the
    // crafting card, the read-only `-1 to +6` chip on the salvage and gathering cards, and
    // nothing at all on an unbounded entry. Without one bounded entry anywhere, every frame
    // of all three shows the same unbounded reading and the chip is depicted nowhere.
    //
    // `-1`/`+6` is deliberately a SIGNED pair spanning zero, because the chip signs both ends
    // and a `0 to 6` reading could not show that. Neither bound binds Bramble's `+4`, so the
    // player roll-prompt frame's Medicine value is unchanged.
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
    id: 'hb-mod-weather',
    label: 'Favourable weather',
    icon: 'fa-solid fa-cloud-sun',
    expression: '@abilities.wis.mod',
    // CATALOGUED BUT NOT SELECTED, and that is its whole job. The per-entry eligibility control
    // has two readings — the rule's own word (`Applied` / `Considered` / `Selectable` /
    // `Picked per subject`) and the not-selected one — and with every lab entry inside
    // `defaultModifierIds` the second was depicted on no screen anywhere.
    //
    // It is a FOURTH entry rather than one of the three demoted, because the eligible set is
    // load-bearing elsewhere: `player-crafting-roll-prompt` needs three eligible modifiers with
    // three different values to show a choice rather than a row of interchangeable chips, and
    // `maxModifierPicks: 3` below is sized to that set.
  },
]);

const PROGRESSIVE_CHECK = Object.freeze({
  enabled: true,
  consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
  progressive: {
    // The formula carried the retired check-modifier placeholder until issue 1094, because
    // `CraftingEngine._buildInteractiveModifierChoice` used to gate the `playerPicks` prompt on
    // that token being PRESENT. The gate now asks whether the check has an authored formula at
    // all, and the resolved scalar APPENDS, so the plain formula below reaches the same fieldset
    // and rolls the same total.
    rollFormula: '1d20 + @abilities.int.mod',
    thresholds: { success: 12 },
    stageAdvanceOnSuccess: 1,
  },
  checkModifiers: HERBALISM_CHECK_MODIFIERS,
  // `playerPicks` ON THE SYSTEM (issue 1055), and it has to be here rather than on a recipe.
  // `player-crafting-roll-prompt` is the only frame of the interactive modifier fieldset, and
  // `CraftingEngine._buildInteractiveModifierChoice` reaches it only when the EFFECTIVE rule is
  // `playerPicks`. That rule used to be reachable as a per-recipe override on `hb-r-stillroom`;
  // this change removes that capability outright — a recipe chooses WHICH modifiers apply, never
  // HOW they combine, and `Recipe._normalizeCraftingModifier` now drops a stored `policy` on the
  // way in — so the system is the only place left to author it. Left at `highest`, the prompt
  // would never open and that frame would publish a crafting tab with no dialog over it.
  //
  // It is also a NON-`byRecipe` rule, which is what keeps this the world in which the recipe
  // Overview's modifier surface is absent entirely: see
  // `manager-recipe-edit-crafting-modifier-absent` in `scripts/lib/viewLabCases.js`. `byRecipe` is
  // reached by CLICKING the rule group, exactly as the pick cap is reached by typing into its
  // Stepper. Authoring it onto a second system would cost a permanent rewrite of every frame that
  // system already has, because a non-empty catalogue is what un-hides the recipe editor's
  // modifier row at all.
  defaultModifierPolicy: 'playerPicks',
  // THREE of the catalogue's FOUR entries (issue 1095 added `hb-mod-weather` precisely to leave
  // one out; see its own note). The eligible set under `playerPicks` is this list,
  // and the prompt needs at least TWO to render at all (the engine suppresses a one-option choice)
  // — but three with three DIFFERENT values (Medicine +4, Herbalism kit +3, Nature +2) is what
  // makes the frame show a choice rather than a row of interchangeable chips.
  defaultModifierIds: ['hb-mod-medicine', 'hb-mod-nature', 'hb-mod-tools'],
  // AN AUTHORED cap, equal to the eligible-set size above so it bounds nothing (issue 1055).
  // ABSENCE was authored here first — absence is the UNLIMITED reading — and it does not survive
  // the boot. `labWorld.js` seeds no `migrationVersion`, so `lastRunVersion` is `'0.0.0'` and
  // `fabricate.initialize()` runs EVERY migration over this world on every lab build. One of them
  // is 1.20.0's `migrateMaxModifierPicks`, whose whole job is to stamp `maxModifierPicks = 1` onto
  // exactly this shape — a `playerPicks` system carrying no cap — so that worlds upgrading from
  // the pre-1055 build keep the single pick that rule used to mean. The lab world declares itself
  // to be such a world, so it was getting the stamp: the Checks card read `1` where
  // `manager-checks-crafting-modifiers` asserts `unlimited`, the recipe editor rendered a standing
  // cap sentence where `manager-recipe-edit-crafting-modifier-custom-set` asserts none, and
  // `player-crafting-roll-prompt` silently published the historical pick-one RADIO group under a
  // case whose whole subject is the multi-pick one.
  //
  // That migration is conditional PRECISELY so a fixture can opt out by authoring a cap (read its
  // header: it names this harness as the reason). This is that opt-out.
  //
  // 3 is the option count, so it is unlimited in every observable way:
  // `buildCheckModifierChoice` computes `Math.min(cap, modifiers.length)` and lands on the same
  // `maxPicks: 3` an unbounded cap produces, so the roll prompt still renders the checkbox group
  // legended "Pick up to 3", and the non-interactive best-legal-selection still sums all three.
  //
  // What it does cost is the resting state of the Checks field: the UNLIMITED READING is now
  // reached by CLEARING the Stepper rather than by leaving it alone, exactly as the bounded
  // reading is reached by typing into it. `manager-checks-crafting-modifiers` does that, and
  // `tests/view-lab-world-migration.test.js` fails if a migration ever silently rewrites a lab
  // system's check block again.
  maxModifierPicks: 3,
});

/**
 * Herbalism's GATHERING selection over the shared catalogue (issue 1095).
 *
 * IT EXISTS TO GIVE THE INHERIT NOTE SOMETHING TO NAME. `manager-gathering-task-edit-modifier-pick`
 * opens `SubjectModifierPicker` in its INHERIT state, and that state has TWO readings: it names the
 * activity's `defaultModifierIds`, or — with an empty set — it states that nothing applies. With no
 * `gatheringCraftingCheck` on this system at all, `_normalizeGatheringCraftingCheck` normalized an
 * absent block to an EMPTY default set, so that frame photographed the empty-set sentence and named
 * nothing, while the registry's own note beside both picker cases claims the inherited set is
 * NAMED. The fixture is the fix rather than the note, because naming is the reading worth a frame:
 * "inheriting" with no names is precisely what this picker was built not to say.
 *
 * It is also the only place gathering's own selection is authored anywhere in the lab, which is
 * what makes `manager-checks-gathering-modifiers` show an eligible set rather than four
 * not-selected rows.
 *
 * DISTINCT FROM THE OTHER TWO ON BOTH AXES, deliberately, exactly as the salvage block is. Crafting
 * is `playerPicks` over three ids, salvage is `highest` over two, gathering is `addAll` over two
 * DIFFERENT ones — so three of the four combination rules are depicted on a real screen, and an
 * activity that read another activity's selection would be visible rather than coincidentally
 * identical.
 *
 * `hb-mod-weather` stays out of this set as it stays out of the other two: its whole job is to be
 * the catalogued-but-not-selected entry, and it can only do that if NO activity selects it.
 *
 * No `enabled` and no formula slots: gathering resolves `d100` here, so the check-modifier seam is
 * inert with cause `noCheck` and dormant pending issue 683 either way. Authoring a formula would
 * claim a rolled gathering check this world does not have, and both notices are what
 * `manager-checks-gathering-modifiers` exists to photograph.
 */
const HERBALISM_GATHERING_CHECK = Object.freeze({
  defaultModifierPolicy: 'addAll',
  defaultModifierIds: ['hb-mod-nature', 'hb-mod-tools'],
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
      craftingCheck: SMITHING_CHECK,
      // BOTH essence-behaviour gates, ON, and only here (issue 1036). No lab system declared
      // either, and both normalize to FALSE when absent — so every essence frame would
      // otherwise have shown `showSourceUi` false, no source or capability pills, and the
      // On-craft tab in its both-off empty state. Smithing is the system the essence cases
      // navigate to (they carry no `query.system`, so they land on the default), which is
      // why it is the one that declares them.
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
      // and another at `remove` simultaneously, which a single-book system makes unreachable.
      //
      // Both keep an ABSENT `recipeIds`, exactly as the single book did. That is load-bearing for
      // the membership marker (issue 1011): `_normalizeSystem` backfills
      // `membershipResolvesByRecipeIds` from "any definition has a non-empty `recipeIds`", so
      // seeding membership here would flip smithing onto the array basis and change what every
      // player-facing book reader resolves. `sm-almanac`'s one member is therefore carried by
      // `sm-r-greatsword`'s LEGACY scalar instead — see the note there.
      recipeItemDefinitions: [
        { id: 'sm-book', name: 'Forgecraft Folio' },
        { id: 'sm-almanac', name: 'Deepsmith Almanac' },
      ],
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
      gatheringRealms: REALMS,
      gatheringRealmSettings: { revealMode: 'onDiscovery', modifierVisibility: 'visible' },
      // Currency, switched on with the SAME unit ladder Runework carries. It is here for the
      // System Overview settings frame, which needs Character modifiers, Character prerequisites
      // and Currency Units on one page — and for the recipe editor's currency-cost requirement
      // row, which `canAddCost` gates on `currencyEnabled && units.length > 0`.
      //
      // Safe on this system specifically: herbalism is knowledge-gated and no lab actor has been
      // granted it, so no herbalism recipe reaches the player crafting listing at all, and the
      // Tool Studio's currency-bearing repair rows are captured on smithing and runework.
      requirements: {
        currency: { enabled: true, spendStrategy: 'actorProperty', units: CURRENCY_UNITS },
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
      // (`recipeAlchemySimple = alchemyCheckMode === 'simple'`). The default `none` draws the
      // ordinary single-group editor instead, which is the SAME shape three other modes already
      // photograph: an alchemy Results frame captured under `none` is a picture of the generic
      // editor with an alchemy system name on it.
      //
      // It obliges the roll formula that `SIMPLE_CHECK` already carries: `systemValidation` raises
      // `alchemyCheckNoFormula` with `blocks: 'system'` for a Simple/Tiered alchemy system with no
      // formula, which hides every alchemy recipe from a non-GM viewer and would empty the
      // player's workbench frames.
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
      // ROUTED salvage WITH an authored check, which is the pairing jewelry deliberately does not
      // have. `salvageOutcomeNames` is read off `salvageCraftingCheck.routed`'s tier names, and
      // those names are what the per-component outcome-routing rows are keyed by — so the routing
      // table is populated here and empty on jewelry, and the two component frames say different
      // things rather than the same thing twice.
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
      // `restricted`, mirroring `lab-alchemy`. Alchemy visibility is decided by the alchemy reveal
      // path rather than by `visibilityMode`, so a restricted system still reaches the discipline
      // chooser and the workbench — while its recipes stay out of the CRAFTING browser, whose
      // twelve-row page boundary every player crafting case depends on.
      visibilityMode: 'restricted',
      resolutionMode: 'alchemy',
      craftingCheck: SIMPLE_CHECK,
      // `none` rather than `simple`, deliberately: `lab-alchemy` carries the Simple two-slot
      // Results editor and its reserved failure group, and a second system repeating that would
      // photograph the same shape twice. `none` is the default check mode and the ordinary
      // single-group editor, so the pair covers both.
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
        // `encounterChance`, which is exactly what the previous invalid `'gm'` resolved to — so
        // every already-captured herbalism gathering frame (grove, thicket, ridge, blind,
        // stacked) renders unchanged, and the Events tab stays off here. The `full` tier lives
        // on smithing alone; see below.
        rules: systemRules('encounterChance'),
        tasks: GATHERING_TASKS.filter((task) => task.craftingSystemId === LAB_SYSTEM_IDS.HERBALISM),
        events: GATHERING_EVENTS.filter(
          (event) => event.craftingSystemId === LAB_SYSTEM_IDS.HERBALISM
        ),
        conditions: {
          weather: { enabled: true, current: 'clear', values: GATHERING_VOCABULARIES.weather },
          timeOfDay: { enabled: true, current: 'day', values: GATHERING_VOCABULARIES.timeOfDay },
        },
        // `{id, label, icon, expression}` — the shape `_normalizeGatheringCharacterModifier`
        // reads, and nothing else. These were authored `{name, description, value, enabled}`:
        // every one of those four keys is dropped, and `label` falls back to `String(entry.id)`,
        // so the System Overview's modifier list rendered two rows reading "hb-mod-skilled" and
        // "hb-mod-tired" under a default user glyph with no expression at all — a raw fixture id
        // presented as a GM-authored label.
        //
        // A modifier is a ROLL EXPRESSION, not a flat bonus: `@skills.<key>.total` /
        // `@abilities.<key>.mod` for a dnd5e world, which is what
        // `DND5E_CHARACTER_MODIFIER_PRESETS` seeds and what the editor's
        // `RollDataExpressionInput` renders. Note the `@` sigil, which this convention keeps and
        // the sibling `characterPrerequisites` paths deliberately do not.
        // ISSUE 1117: a DISTINCT id from the check library's `hb-mod-nature`. The two were the
        // same id with different expressions, which was the duplication the unified library
        // exists to remove — and after the merge it is a real collision, so the lab world would
        // model the defect and fire the one-time rename notice on every lab build. The
        // collision RULE is exercised by `tests/migrate-unify-modifier-libraries.test.js`
        // against a world whose drop rows actually name the colliding id, which is where the
        // reference rewrite can be proven too.
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
        // for herbalism would move the five herbalism gathering frames. Old Karrun Mine enables
        // three events — collapse, firedamp and floodwater — which is what the events frame lists.
        rules: systemRules('full'),
        // The world's only enabled resource economy. `nodesEnabled` is read off
        // `systems[<id>].economy.nodes.enabled`, and with it off a per-environment `nodeRuntime`
        // is inert however it is authored — which is why Old Karrun Mine's pool is the one that
        // renders. See that environment for why smithing carries it and herbalism does not.
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

  return {
    systems,
    recipes: [
      ...SMITHING_RECIPES,
      ...HERBALISM_RECIPES,
      ...ALCHEMY_RECIPES,
      ...JEWELRY_RECIPES,
      ...RUNEWORK_RECIPES,
      ...TIDEWRACK_RECIPES,
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
      ...TIDEWRACK_COMPONENTS,
    ],
    tools: [...SMITHING_TOOLS, ...HERBALISM_TOOLS, ...RUNEWORK_TOOLS],
    // Exposed so the uuid index can resolve an owned recipe-item copy back to the book it is a
    // copy OF. Without an index entry the copy still matches its definition (matching is by uuid,
    // not by document) but every surface that resolves the source through `fromUuid` renders it
    // unresolved — the same "looks unpopulated" failure the component index exists to prevent.
    recipeItems: [...HERBALISM_RECIPE_ITEMS],
  };
}
