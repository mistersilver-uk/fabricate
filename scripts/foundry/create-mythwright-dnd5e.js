/*
 * Mythwright DnD5e bootstrap for Fabricate.
 *
 * Run this as a GM world script in Foundry VTT with DnD5e and Fabricate active.
 * The script is idempotent: it updates existing Mythwright folders, items, macro,
 * crafting system, recipes, and gathering environments by deterministic identity.
 */

const MythwrightDnd5eBootstrap = (() => {
  const SYSTEM_ID = 'mythwright-dnd5e';
  const SYSTEM_NAME = 'Mythwright';
  const SYSTEM_DESCRIPTION = 'Mythwright lets you turn harvested components, rare essences, and hard-won materials into weapons, armour, tools, and relics worthy of legend. Build multi-step recipes, forge mundane gear or world-shaping artefacts, and make crafting feel like part of the story rather than a shopping list.';
  const MACRO_NAME = 'Mythwright Crafting Check';
  const ROOT_FOLDER = 'Mythwright';
  const DEFAULT_ITEM_ICON = 'icons/svg/item-bag.svg';
  const MYTHWRIGHT_ICONS = Object.freeze({
    defaultItem: DEFAULT_ITEM_ICON,
    macro: 'icons/tools/smithing/anvil.webp',
    miningPick: 'icons/tools/hand/pickaxe-steel-white.webp',
    woodAxe: 'icons/tools/hand/hatchet-steel-grey.webp',
    skinningKnife: 'icons/tools/cooking/knife-cleaver-steel-grey.webp',
    delverKit: 'icons/containers/bags/pack-leather-brown.webp',
    planarBindingRod: 'icons/weapons/staves/staff-ornate-gold-jeweled.webp',
    dragonTongs: 'icons/tools/smithing/tongs-steel-grey.webp',
    brokenMiningPick: 'icons/tools/hand/pickaxe-steel-grey.webp',
    brokenWoodAxe: 'icons/tools/hand/hatchet-steel-grey.webp',
    brokenSkinningKnife: 'icons/tools/cooking/knife-cleaver-steel-grey.webp',
    brokenDelverKit: 'icons/containers/bags/pack-leather-tan.webp',
    brokenPlanarBindingRod: 'icons/weapons/staves/staff-mended.webp',
    brokenDragonTongs: 'icons/tools/smithing/tongs-steel-grey.webp',
    gemstone: 'icons/commodities/gems/gem-faceted-rough-blue.webp',
    rawOre: 'icons/commodities/stone/ore-pile-grey.webp',
    hardwood: 'icons/commodities/wood/lumber-stack-brown.webp',
    curedHide: 'icons/commodities/leather/leather-bolt-tan.webp',
    gatheringMineOre: 'icons/commodities/stone/ore-pile-grey.webp',
    gatheringWildHardwood: 'icons/commodities/wood/lumber-stack-brown.webp',
    gatheringWildHide: 'icons/commodities/leather/leather-bolt-tan.webp',
    gatheringRuinRelics: 'icons/commodities/treasure/token-runed-spiral-grey.webp',
    gatheringBattlefieldSalvage: 'icons/equipment/chest/breastplate-layered-steel.webp',
    gatheringPlanarEssence: 'icons/svg/lightning.svg',
    gatheringDragonScale: 'icons/commodities/leather/scales-brown.webp',
    ironIngot: 'icons/commodities/metal/ingot-iron.webp',
    weaponCore: 'icons/commodities/metal/ingot-steel.webp',
    balancedHilt: 'icons/weapons/swords/sword-hilt-steel-green.webp',
    bowStave: 'icons/weapons/bows/shortbow-recurve.webp',
    armourPlates: 'icons/equipment/chest/breastplate-layered-steel.webp',
    reinforcedStraps: 'icons/sundries/survival/leather-strap-brown.webp',
    monsterTrophy: 'icons/commodities/bones/horn-simple-grey.webp',
    ancientFragment: 'icons/commodities/treasure/token-runed-spiral-grey.webp',
    dragonScale: 'icons/commodities/leather/scales-brown.webp',
    artisanCatalyst: 'icons/tools/smithing/anvil.webp',
    mythicCatalyst: 'icons/commodities/treasure/token-runed-fehu-gold.webp',
    emberEssence: 'icons/svg/fire.svg',
    frostEssence: 'icons/magic/air/weather-clouds-snow.webp',
    stormEssence: 'icons/svg/lightning.svg',
    radianceEssence: 'icons/svg/sun.svg',
    shadowEssence: 'icons/commodities/currency/coin-engraved-moon-silver.webp',
    dragonEssence: 'icons/commodities/bones/bones-dragon-grey.webp',
    relicMythicLongsword: 'icons/weapons/swords/greatsword-blue.webp',
    relicDraconicScaleMail: 'icons/equipment/chest/breastplate-scale-grey.webp',
    relicStormBow: 'icons/weapons/bows/longbow-recurve.webp',
    relicRadiantShield: 'icons/equipment/shield/heater-steel-gold.webp',
    relicShadowDagger: 'icons/weapons/daggers/dagger-curved-black.webp',
    emberShortsword: 'icons/weapons/swords/shortsword-guard-gold-red.webp',
    frostLongsword: 'icons/weapons/swords/sword-guard-blue.webp',
    stormShortbow: 'icons/weapons/bows/shortbow-recurve-blue.webp',
    stormWarhammer: 'icons/weapons/hammers/hammer-double-glowing-yellow.webp',
    radiantMace: 'icons/weapons/maces/mace-flanged-steel.webp',
    radiantLongbow: 'icons/weapons/bows/longbow-gold-pink.webp',
    shadowDagger: 'icons/weapons/daggers/dagger-curved-black.webp',
    shadowRapier: 'icons/weapons/swords/sword-guard-purple.webp',
    dragonGreatsword: 'icons/weapons/swords/greatsword-blue.webp',
    dragonGreataxe: 'icons/weapons/axes/axe-double-engraved-runes.webp',
    emberBattleaxe: 'icons/weapons/axes/axe-battle-elemental-lava.webp',
    frostSpear: 'icons/weapons/polearms/spear-ice-crystal-blue.webp',
    emberScaleMail: 'icons/equipment/chest/breastplate-scale-grey.webp',
    emberShield: 'icons/equipment/shield/heater-steel-crystal-red.webp',
    frostChainMail: 'icons/equipment/chest/breastplate-layered-steel-blue-gold.webp',
    frostHalfPlate: 'icons/equipment/chest/breastplate-cuirass-steel-blue.webp',
    stormShield: 'icons/equipment/shield/kite-wooden-sigil-purple.webp',
    stormStuddedLeatherArmor: 'icons/equipment/chest/breastplate-layered-leather-studded.webp',
    radiantShield: 'icons/equipment/shield/heater-steel-gold.webp',
    radiantPlateArmor: 'icons/equipment/chest/breastplate-layered-gold.webp',
    shadowLeatherArmor: 'icons/equipment/chest/breastplate-layered-leather-black.webp',
    shadowBreastplate: 'icons/equipment/chest/breastplate-gorget-steel-purple.webp',
    dragonScaleMail: 'icons/equipment/chest/breastplate-scale-grey.webp',
    dragonPlateArmor: 'icons/equipment/chest/breastplate-sculpted-green.webp'
  });
  const APPROVED_MYTHWRIGHT_ICON_PATHS = Object.freeze(Array.from(new Set(Object.values(MYTHWRIGHT_ICONS))));
  const APPROVED_MYTHWRIGHT_ICON_SET = new Set(APPROVED_MYTHWRIGHT_ICON_PATHS);

  const DND5E_EQUIPMENT24_SRD_ITEMS = Object.freeze([
    ['weapon', 'Club', 'Compendium.dnd5e.equipment24.Item.phbwepClub000000'],
    ['weapon', 'Dagger', 'Compendium.dnd5e.equipment24.Item.phbwepDagger0000'],
    ['weapon', 'Greatclub', 'Compendium.dnd5e.equipment24.Item.phbwepGreatclub0'],
    ['weapon', 'Handaxe', 'Compendium.dnd5e.equipment24.Item.phbwepHandaxe000'],
    ['weapon', 'Javelin', 'Compendium.dnd5e.equipment24.Item.phbwepJavelin000'],
    ['weapon', 'Light Hammer', 'Compendium.dnd5e.equipment24.Item.phbwepLightHamme'],
    ['weapon', 'Mace', 'Compendium.dnd5e.equipment24.Item.phbwepMace000000'],
    ['weapon', 'Quarterstaff', 'Compendium.dnd5e.equipment24.Item.phbwepQuartersta'],
    ['weapon', 'Sickle', 'Compendium.dnd5e.equipment24.Item.phbwepSickle0000'],
    ['weapon', 'Spear', 'Compendium.dnd5e.equipment24.Item.phbwepSpear00000'],
    ['weapon', 'Light Crossbow', 'Compendium.dnd5e.equipment24.Item.phbwepLightCross'],
    ['weapon', 'Dart', 'Compendium.dnd5e.equipment24.Item.phbwepDart000000'],
    ['weapon', 'Shortbow', 'Compendium.dnd5e.equipment24.Item.phbwepShortbow00'],
    ['weapon', 'Sling', 'Compendium.dnd5e.equipment24.Item.phbwepSling00000'],
    ['weapon', 'Battleaxe', 'Compendium.dnd5e.equipment24.Item.phbwepBattleaxe0'],
    ['weapon', 'Flail', 'Compendium.dnd5e.equipment24.Item.phbwepFlail00000'],
    ['weapon', 'Glaive', 'Compendium.dnd5e.equipment24.Item.phbwepGlaive0000'],
    ['weapon', 'Greataxe', 'Compendium.dnd5e.equipment24.Item.phbwepGreataxe00'],
    ['weapon', 'Greatsword', 'Compendium.dnd5e.equipment24.Item.phbwepGreatsword'],
    ['weapon', 'Halberd', 'Compendium.dnd5e.equipment24.Item.phbwepHalberd000'],
    ['weapon', 'Lance', 'Compendium.dnd5e.equipment24.Item.phbwepLance00000'],
    ['weapon', 'Longsword', 'Compendium.dnd5e.equipment24.Item.phbwepLongsword0'],
    ['weapon', 'Maul', 'Compendium.dnd5e.equipment24.Item.phbwepMaul000000'],
    ['weapon', 'Morningstar', 'Compendium.dnd5e.equipment24.Item.phbwepMorningsta'],
    ['weapon', 'Pike', 'Compendium.dnd5e.equipment24.Item.phbwepPike000000'],
    ['weapon', 'Rapier', 'Compendium.dnd5e.equipment24.Item.phbwepRapier0000'],
    ['weapon', 'Scimitar', 'Compendium.dnd5e.equipment24.Item.phbwepScimitar00'],
    ['weapon', 'Shortsword', 'Compendium.dnd5e.equipment24.Item.phbwepShortsword'],
    ['weapon', 'Trident', 'Compendium.dnd5e.equipment24.Item.phbwepTrident000'],
    ['weapon', 'War Pick', 'Compendium.dnd5e.equipment24.Item.phbwepWarPick000'],
    ['weapon', 'Warhammer', 'Compendium.dnd5e.equipment24.Item.phbwepWarhammer0'],
    ['weapon', 'Whip', 'Compendium.dnd5e.equipment24.Item.phbwepWhip000000'],
    ['weapon', 'Blowgun', 'Compendium.dnd5e.equipment24.Item.phbwepBlowgun000'],
    ['weapon', 'Hand Crossbow', 'Compendium.dnd5e.equipment24.Item.phbwepHandCrossb'],
    ['weapon', 'Heavy Crossbow', 'Compendium.dnd5e.equipment24.Item.phbwepHeavyCross'],
    ['weapon', 'Longbow', 'Compendium.dnd5e.equipment24.Item.phbwepLongbow000'],
    ['weapon', 'Net', 'Compendium.dnd5e.equipment24.Item.phbagNet00000000'],
    ['armor', 'Padded Armor', 'Compendium.dnd5e.equipment24.Item.phbarmPaddedArmo'],
    ['armor', 'Leather Armor', 'Compendium.dnd5e.equipment24.Item.phbarmLeatherArm'],
    ['armor', 'Studded Leather Armor', 'Compendium.dnd5e.equipment24.Item.phbarmStuddedLea'],
    ['armor', 'Hide Armor', 'Compendium.dnd5e.equipment24.Item.phbarmHideArmor0'],
    ['armor', 'Chain Shirt', 'Compendium.dnd5e.equipment24.Item.phbarmChainShirt'],
    ['armor', 'Scale Mail', 'Compendium.dnd5e.equipment24.Item.phbarmScaleMail0'],
    ['armor', 'Breastplate', 'Compendium.dnd5e.equipment24.Item.phbarmBreastplat'],
    ['armor', 'Half Plate Armor', 'Compendium.dnd5e.equipment24.Item.phbarmHalfPlateA'],
    ['armor', 'Ring Mail', 'Compendium.dnd5e.equipment24.Item.phbarmRingMail00'],
    ['armor', 'Chain Mail', 'Compendium.dnd5e.equipment24.Item.phbarmChainMail0'],
    ['armor', 'Splint Armor', 'Compendium.dnd5e.equipment24.Item.phbarmSplintArmo'],
    ['armor', 'Plate Armor', 'Compendium.dnd5e.equipment24.Item.phbarmPlateArmor'],
    ['armor', 'Shield', 'Compendium.dnd5e.equipment24.Item.phbarmShield0000']
  ]);

  const SRD_WEAPONS = DND5E_EQUIPMENT24_SRD_ITEMS
    .filter(([type]) => type === 'weapon')
    .map(([, name]) => name);

  const SRD_ARMOUR = DND5E_EQUIPMENT24_SRD_ITEMS
    .filter(([type]) => type === 'armor')
    .map(([, name]) => name);

  const FOLDER_PATHS = [
    'Mythwright > Gathered components',
    'Mythwright > Essences',
    'Mythwright > Ingredients > Mundane',
    'Mythwright > Components > Weapon Parts',
    'Mythwright > Components > Armour Parts',
    'Mythwright > Weapons > Mundane',
    'Mythwright > Weapons > Quality',
    'Mythwright > Weapons > Elemental',
    'Mythwright > Armour > Mundane',
    'Mythwright > Armour > Quality',
    'Mythwright > Armour > Elemental',
    'Mythwright > Relics',
    'Mythwright > Tools & Catalysts'
  ];

  const MUNDANE_QUALITY = ['Flawed', 'Standard', 'Fine', 'Masterwork'];
  const ELEMENTAL_QUALITY = Object.freeze([
    { id: 'flawed', name: 'Flawed', damage: '1', resistance: false, acBonus: 0 },
    { id: 'standard', name: 'Standard', damage: '1d4', resistance: true, acBonus: 0 },
    { id: 'fine', name: 'Fine', damage: '1d6', resistance: true, acBonus: 1 },
    { id: 'masterwork', name: 'Masterwork', damage: '1d8', resistance: true, acBonus: 2 },
    { id: 'mythic', name: 'Mythic', damage: '1d10', resistance: true, acBonus: 3 }
  ]);
  const RELIC_QUALITY = ['Flawed', 'Standard', 'Fine', 'Masterwork', 'Mythic'];
  const ESSENCES = [
    { id: 'ember', name: 'Ember Essence', icon: 'fas fa-fire', img: MYTHWRIGHT_ICONS.emberEssence },
    { id: 'frost', name: 'Frost Essence', icon: 'fas fa-snowflake', img: MYTHWRIGHT_ICONS.frostEssence },
    { id: 'storm', name: 'Storm Essence', icon: 'fas fa-bolt', img: MYTHWRIGHT_ICONS.stormEssence },
    { id: 'radiance', name: 'Radiance Essence', icon: 'fas fa-sun', img: MYTHWRIGHT_ICONS.radianceEssence },
    { id: 'shadow', name: 'Shadow Essence', icon: 'fas fa-moon', img: MYTHWRIGHT_ICONS.shadowEssence },
    { id: 'dragon', name: 'Dragon Essence', icon: 'fas fa-dragon', img: MYTHWRIGHT_ICONS.dragonEssence }
  ];

  const ELEMENTAL_VARIANTS = [
    { id: 'weapon-ember-shortsword', name: 'Ember Shortsword', baseName: 'Shortsword', type: 'weapon', essenceId: 'ember', damageType: 'fire', img: MYTHWRIGHT_ICONS.emberShortsword },
    { id: 'weapon-ember-battleaxe', name: 'Ember Battleaxe', baseName: 'Battleaxe', type: 'weapon', essenceId: 'ember', damageType: 'fire', img: MYTHWRIGHT_ICONS.emberBattleaxe },
    { id: 'weapon-frost-longsword', name: 'Frost Longsword', baseName: 'Longsword', type: 'weapon', essenceId: 'frost', damageType: 'cold', img: MYTHWRIGHT_ICONS.frostLongsword },
    { id: 'weapon-frost-spear', name: 'Frost Spear', baseName: 'Spear', type: 'weapon', essenceId: 'frost', damageType: 'cold', img: MYTHWRIGHT_ICONS.frostSpear },
    { id: 'weapon-storm-shortbow', name: 'Storm Shortbow', baseName: 'Shortbow', type: 'weapon', essenceId: 'storm', damageType: 'lightning', img: MYTHWRIGHT_ICONS.stormShortbow },
    { id: 'weapon-storm-warhammer', name: 'Storm Warhammer', baseName: 'Warhammer', type: 'weapon', essenceId: 'storm', damageType: 'lightning', img: MYTHWRIGHT_ICONS.stormWarhammer },
    { id: 'weapon-radiant-mace', name: 'Radiant Mace', baseName: 'Mace', type: 'weapon', essenceId: 'radiance', damageType: 'radiant', img: MYTHWRIGHT_ICONS.radiantMace },
    { id: 'weapon-radiant-longbow', name: 'Radiant Longbow', baseName: 'Longbow', type: 'weapon', essenceId: 'radiance', damageType: 'radiant', img: MYTHWRIGHT_ICONS.radiantLongbow },
    { id: 'weapon-shadow-dagger', name: 'Shadow Dagger', baseName: 'Dagger', type: 'weapon', essenceId: 'shadow', damageType: 'necrotic', img: MYTHWRIGHT_ICONS.shadowDagger },
    { id: 'weapon-shadow-rapier', name: 'Shadow Rapier', baseName: 'Rapier', type: 'weapon', essenceId: 'shadow', damageType: 'necrotic', img: MYTHWRIGHT_ICONS.shadowRapier },
    { id: 'weapon-dragon-greatsword', name: 'Dragon Greatsword', baseName: 'Greatsword', type: 'weapon', essenceId: 'dragon', damageType: 'fire', img: MYTHWRIGHT_ICONS.dragonGreatsword },
    { id: 'weapon-dragon-greataxe', name: 'Dragon Greataxe', baseName: 'Greataxe', type: 'weapon', essenceId: 'dragon', damageType: 'fire', img: MYTHWRIGHT_ICONS.dragonGreataxe },
    { id: 'armor-ember-scale-mail', name: 'Ember Scale Mail', baseName: 'Scale Mail', type: 'armor', essenceId: 'ember', resistanceType: 'fire', img: MYTHWRIGHT_ICONS.emberScaleMail },
    { id: 'armor-ember-shield', name: 'Ember Shield', baseName: 'Shield', type: 'armor', essenceId: 'ember', resistanceType: 'fire', img: MYTHWRIGHT_ICONS.emberShield },
    { id: 'armor-frost-chain-mail', name: 'Frost Chain Mail', baseName: 'Chain Mail', type: 'armor', essenceId: 'frost', resistanceType: 'cold', img: MYTHWRIGHT_ICONS.frostChainMail },
    { id: 'armor-frost-half-plate', name: 'Frost Half Plate', baseName: 'Half Plate Armor', type: 'armor', essenceId: 'frost', resistanceType: 'cold', img: MYTHWRIGHT_ICONS.frostHalfPlate },
    { id: 'armor-storm-shield', name: 'Storm Shield', baseName: 'Shield', type: 'armor', essenceId: 'storm', resistanceType: 'lightning', img: MYTHWRIGHT_ICONS.stormShield },
    { id: 'armor-storm-studded-leather-armor', name: 'Storm Studded Leather Armor', baseName: 'Studded Leather Armor', type: 'armor', essenceId: 'storm', resistanceType: 'lightning', img: MYTHWRIGHT_ICONS.stormStuddedLeatherArmor },
    { id: 'armor-radiant-shield', name: 'Radiant Shield', baseName: 'Shield', type: 'armor', essenceId: 'radiance', resistanceType: 'radiant', img: MYTHWRIGHT_ICONS.radiantShield },
    { id: 'armor-radiant-plate-armor', name: 'Radiant Plate Armor', baseName: 'Plate Armor', type: 'armor', essenceId: 'radiance', resistanceType: 'radiant', img: MYTHWRIGHT_ICONS.radiantPlateArmor },
    { id: 'armor-shadow-leather-armor', name: 'Shadow Leather Armor', baseName: 'Leather Armor', type: 'armor', essenceId: 'shadow', resistanceType: 'necrotic', img: MYTHWRIGHT_ICONS.shadowLeatherArmor },
    { id: 'armor-shadow-breastplate', name: 'Shadow Breastplate', baseName: 'Breastplate', type: 'armor', essenceId: 'shadow', resistanceType: 'necrotic', img: MYTHWRIGHT_ICONS.shadowBreastplate },
    { id: 'armor-dragon-scale-mail', name: 'Dragon Scale Mail', baseName: 'Scale Mail', type: 'armor', essenceId: 'dragon', resistanceType: 'fire', img: MYTHWRIGHT_ICONS.dragonScaleMail },
    { id: 'armor-dragon-plate-armor', name: 'Dragon Plate Armor', baseName: 'Plate Armor', type: 'armor', essenceId: 'dragon', resistanceType: 'fire', img: MYTHWRIGHT_ICONS.dragonPlateArmor }
  ];

  const BASE_ITEMS = [
    ['tool-mining-pick', 'Mythwright Mining Pick', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.miningPick],
    ['tool-wood-axe', 'Mythwright Wood Axe', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.woodAxe],
    ['tool-skinning-knife', 'Mythwright Skinning Knife', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.skinningKnife],
    ['tool-delver-kit', 'Mythwright Delver Kit', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.delverKit],
    ['tool-planar-binding-rod', 'Mythwright Planar Binding Rod', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.planarBindingRod],
    ['tool-dragon-tongs', 'Mythwright Dragon Tongs', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.dragonTongs],
    ['broken-tool-mining-pick', 'Broken Mythwright Mining Pick', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.brokenMiningPick],
    ['broken-tool-wood-axe', 'Broken Mythwright Wood Axe', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.brokenWoodAxe],
    ['broken-tool-skinning-knife', 'Broken Mythwright Skinning Knife', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.brokenSkinningKnife],
    ['broken-tool-delver-kit', 'Broken Mythwright Delver Kit', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.brokenDelverKit],
    ['broken-tool-planar-binding-rod', 'Broken Mythwright Planar Binding Rod', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.brokenPlanarBindingRod],
    ['broken-tool-dragon-tongs', 'Broken Mythwright Dragon Tongs', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.brokenDragonTongs],
    ['gemstone', 'Gemstone', 'Mythwright > Gathered components', MYTHWRIGHT_ICONS.gemstone],
    ['raw-ore', 'Raw Ore', 'Mythwright > Ingredients > Mundane', MYTHWRIGHT_ICONS.rawOre],
    ['hardwood', 'Hardwood', 'Mythwright > Ingredients > Mundane', MYTHWRIGHT_ICONS.hardwood],
    ['cured-hide', 'Cured Hide', 'Mythwright > Ingredients > Mundane', MYTHWRIGHT_ICONS.curedHide],
    ['iron-ingot', 'Iron Ingot', 'Mythwright > Ingredients > Mundane', MYTHWRIGHT_ICONS.ironIngot],
    ['weapon-core', 'Weapon Core', 'Mythwright > Components > Weapon Parts', MYTHWRIGHT_ICONS.weaponCore],
    ['balanced-hilt', 'Balanced Hilt', 'Mythwright > Components > Weapon Parts', MYTHWRIGHT_ICONS.balancedHilt],
    ['bow-stave', 'Bow Stave', 'Mythwright > Components > Weapon Parts', MYTHWRIGHT_ICONS.bowStave],
    ['armour-plates', 'Armour Plates', 'Mythwright > Components > Armour Parts', MYTHWRIGHT_ICONS.armourPlates],
    ['reinforced-straps', 'Reinforced Straps', 'Mythwright > Components > Armour Parts', MYTHWRIGHT_ICONS.reinforcedStraps],
    ['monster-trophy', 'Monster Trophy', 'Mythwright > Gathered components', MYTHWRIGHT_ICONS.monsterTrophy],
    ['ancient-fragment', 'Ancient Fragment', 'Mythwright > Gathered components', MYTHWRIGHT_ICONS.ancientFragment],
    ['dragon-scale', 'Dragon Scale', 'Mythwright > Gathered components', MYTHWRIGHT_ICONS.dragonScale],
    ['artisan-catalyst', 'Artisan Catalyst', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.artisanCatalyst],
    ['mythic-catalyst', 'Mythic Catalyst', 'Mythwright > Tools & Catalysts', MYTHWRIGHT_ICONS.mythicCatalyst]
  ];

  const RELICS = [
    ['relic-mythic-longsword', 'Mythwright Mythic Longsword', 'Mythwright > Relics', MYTHWRIGHT_ICONS.relicMythicLongsword],
    ['relic-draconic-scale-mail', 'Draconic Scale Mail', 'Mythwright > Relics', MYTHWRIGHT_ICONS.relicDraconicScaleMail],
    ['relic-storm-bow', 'Storm-Forged Bow', 'Mythwright > Relics', MYTHWRIGHT_ICONS.relicStormBow],
    ['relic-radiant-shield', 'Radiant Shield', 'Mythwright > Relics', MYTHWRIGHT_ICONS.relicRadiantShield],
    ['relic-shadow-dagger', 'Shadow Dagger', 'Mythwright > Relics', MYTHWRIGHT_ICONS.relicShadowDagger]
  ];
  const BASE_ITEM_DESCRIPTIONS = Object.freeze({
    'tool-mining-pick': 'A sturdy pick balanced for splitting ore seams without shattering useful stone.',
    'tool-wood-axe': 'A sharp camp axe for felling branches, trimming hardwood, and shaping rough hafts.',
    'tool-skinning-knife': 'A narrow field knife made for clean cuts through hide, sinew, and trophy work.',
    'tool-delver-kit': 'A compact kit of brushes, wedges, cord, chalk, and probes for careful ruin work.',
    'tool-planar-binding-rod': 'An etched rod that steadies volatile planar matter long enough to bind it safely.',
    'tool-dragon-tongs': 'Long heat-scarred tongs built to grip scale, slag, and hoard-metal without bending.',
    'broken-tool-mining-pick': 'A cracked mining pick head and split haft, useful only as repair stock.',
    'broken-tool-wood-axe': 'A dulled axe with a damaged eye and loose haft, waiting for careful repair.',
    'broken-tool-skinning-knife': 'A chipped skinning knife whose edge can no longer hold a clean field cut.',
    'broken-tool-delver-kit': 'A scattered delver kit with snapped probes, torn straps, and missing wedges.',
    'broken-tool-planar-binding-rod': 'A binding rod with broken inlay and unstable resonance.',
    'broken-tool-dragon-tongs': 'Heat-warped tongs that no longer close true around dangerous material.',
    gemstone: 'A bright cut or rough gemstone worth saving for trade, inlay, or precision crafting.',
    'raw-ore': 'Unrefined ore split from stubborn stone, ready to be smelted into honest crafting metal.',
    hardwood: 'Seasoned hardwood with a tight grain, prized for handles, hafts, bows, and reinforced frames.',
    'cured-hide': 'Supple cured hide prepared for straps, grips, padding, and layered armour work.',
    'iron-ingot': 'A clean iron ingot poured for Mythwright patterns, reliable enough for blades, buckles, and fittings.',
    'weapon-core': 'A shaped weapon core that gives a blade, haft, or striking head its durable heart.',
    'balanced-hilt': 'A fitted grip and guard assembly balanced for control once the weapon is finished.',
    'bow-stave': 'A carefully cut stave with enough spring to become a dependable bow.',
    'armour-plates': 'Overlapping plates hammered into shape for breastplates, mail reinforcement, and shields.',
    'reinforced-straps': 'Riveted straps and bindings that keep armour secure through hard use.',
    'monster-trophy': 'A trophy taken from a dangerous creature, carrying the proof and power of the hunt.',
    'ancient-fragment': 'A rune-scarred fragment from a fallen age, still holding a memory of forgotten craft.',
    'dragon-scale': 'A heat-scarred dragon scale, light in the hand and stubborn against steel.',
    'artisan-catalyst': 'A reliable shop catalyst used to steady finishing work and draw out finer results.',
    'mythic-catalyst': 'A rare catalyst bright with old enchantment, fit for awakening relic-grade work.'
  });
  const ESSENCE_DESCRIPTIONS = Object.freeze({
    ember: 'A cinder-bright essence that warms the air around it and hungers for the shape of flame.',
    frost: 'A pale essence rimed with hoarfrost, quieting heat and hardening the work beneath the hammer.',
    storm: 'A restless essence that snaps with distant thunder and pulls metal toward sudden motion.',
    radiance: 'A golden essence that answers oath, polish, and prayer with a clear steady light.',
    shadow: 'A dim essence gathered where light fails, useful for subtle edges and silent protections.',
    dragon: 'A fierce essence carrying the pride of scaled tyrants and the memory of ancient fire.'
  });
  const RELIC_DESCRIPTIONS = Object.freeze({
    'relic-mythic-longsword': 'A legendary longsword pattern awaiting final awakening, built to hold ember-bright power without breaking.',
    'relic-draconic-scale-mail': 'Scale mail wrought around draconic trophies, meant to turn aside flame and fang alike.',
    'relic-storm-bow': 'A storm-forged bow whose limbs seem to remember thunder even before the string is drawn.',
    'relic-radiant-shield': 'A radiant shield prepared for vows, battlefield light, and the defence of companions.',
    'relic-shadow-dagger': 'A narrow relic dagger shaped for moonless work, silent cuts, and secrets carried in steel.'
  });
  const ENVIRONMENT_DESCRIPTIONS = Object.freeze({
    'mythwright-mines': 'Old mineworks and fresh cuts where raw ore waits in cramped seams and echoing galleries.',
    'mythwright-wilds': 'Trackless woodland where hardwood, hides, and useful wild finds reward patient hands.',
    'mythwright-ruins': 'Broken halls and buried foundations where ancient fragments still remember lost makers.',
    'mythwright-battlefields': 'Scarred fields where trophies, broken gear, and hard lessons lie beneath the churned earth.',
    'mythwright-planar-sites': 'Thin places where the world shivers and volatile essences can be bound by steady craft.',
    'mythwright-dragon-lairs': 'Ash-marked lairs and hoard-scraped stone where dragon scale can be won by the brave.'
  });

  function normalizeName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\b(armor|armour)\b/g, 'armor')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function idFromName(prefix, name) {
    const slug = normalizeName(name).replace(/\s+/g, '-');
    return `${prefix}-${slug}`;
  }

  function itemTypeForName(name, fallback = 'loot') {
    if (SRD_WEAPONS.some(entry => normalizeName(entry) === normalizeName(name))) return 'weapon';
    if (SRD_ARMOUR.some(entry => normalizeName(entry) === normalizeName(name))) return 'equipment';
    return fallback;
  }

  function collectionValues(collection) {
    if (!collection) return [];
    if (typeof collection.values === 'function') return Array.from(collection.values());
    if (Array.isArray(collection)) return collection;
    return Array.from(collection);
  }

  function compendiumPackIdFromUuid(uuid) {
    const parts = String(uuid || '').split('.');
    if (parts[0] !== 'Compendium' || parts.length < 4) return null;
    return `${parts[1]}.${parts[2]}`;
  }

  function compendiumDocumentIdFromUuid(uuid) {
    const parts = String(uuid || '').split('.');
    if (parts[0] !== 'Compendium') return null;
    return parts.at(-1) || null;
  }

  function compendiumPackForUuid(uuid) {
    const packId = compendiumPackIdFromUuid(uuid);
    if (!packId) return null;
    return globalThis.game?.packs?.get?.(packId)
      || collectionValues(globalThis.game?.packs).find(pack => pack.collection === packId)
      || null;
  }

  async function resolveCompendiumDocument(uuid) {
    if (!uuid) return null;
    if (typeof globalThis.fromUuid === 'function') {
      const doc = await globalThis.fromUuid(uuid);
      if (doc) return doc;
    }

    const pack = compendiumPackForUuid(uuid);
    const id = compendiumDocumentIdFromUuid(uuid);
    if (!pack || !id) return null;
    if (typeof pack.getDocument === 'function') return await pack.getDocument(id);
    const indexEntry = collectionValues(pack.index).find(entry => entry?._id === id || entry?.id === id);
    return indexEntry || null;
  }

  function folderSegments(path) {
    return String(path || '').split('>').map(part => part.trim()).filter(Boolean);
  }

  function folderPath(folder, folders = globalThis.game?.folders) {
    const byId = new Map(collectionValues(folders).map(entry => [entry.id, entry]));
    const parts = [];
    let cursor = folder;
    while (cursor) {
      parts.unshift(cursor.name);
      cursor = byId.get(cursor.folder?.id || cursor.folder || null);
    }
    return parts.join(' > ');
  }

  function findFolderByPath(path, { type = 'Item', folders = globalThis.game?.folders } = {}) {
    const wanted = folderSegments(path);
    return collectionValues(folders).find(folder =>
      folder.type === type && folderPath(folder, folders) === wanted.join(' > ')
    ) || null;
  }

  async function ensureFolderPath(path, { type = 'Item', summary = null } = {}) {
    const segments = folderSegments(path);
    let parent = null;
    let currentPath = '';
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath} > ${segment}` : segment;
      let folder = findFolderByPath(currentPath, { type });
      if (!folder) {
        folder = await Folder.create({ name: segment, type, folder: parent?.id || null });
        summary && summary.folders.created++;
      } else {
        summary && summary.folders.updated++;
      }
      parent = folder;
    }
    return parent;
  }

  function findWorldItem(name, folder) {
    return collectionValues(globalThis.game?.items).find(item =>
      item.name === name && (item.folder?.id || item.folder || null) === (folder?.id || null)
    ) || null;
  }

  function itemSourceId(item) {
    return item?._stats?.compendiumSource || item?.flags?.core?.sourceId || null;
  }

  function sourceIdentityFromDocument(source, sourceObject = {}) {
    return source?.uuid
      || sourceObject?._stats?.compendiumSource
      || sourceObject?.flags?.core?.sourceId
      || null;
  }

  function itemMythwrightId(item) {
    return item?.flags?.fabricate?.mythwrightId || null;
  }

  function sanitizeIconPath(path, { allowExternal = false } = {}) {
    const value = String(path || '').trim();
    if (!value) return DEFAULT_ITEM_ICON;
    if (allowExternal && /^(icons\/|systems\/|modules\/|worlds\/|https?:\/\/)/.test(value)) return value;
    return APPROVED_MYTHWRIGHT_ICON_SET.has(value) ? value : DEFAULT_ITEM_ICON;
  }

  function stripSourceIdentity(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (payload.flags?.core) {
      delete payload.flags.core.sourceId;
      if (Object.keys(payload.flags.core).length === 0) delete payload.flags.core;
    }
    if (payload._stats) {
      delete payload._stats.compendiumSource;
      if (Object.keys(payload._stats).length === 0) delete payload._stats;
    }
    delete payload.sourceUuid;
    delete payload.sourceItemUuid;
    delete payload.fallbackItemIds;
    return payload;
  }

  function htmlToText(value) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function descriptionToSystem(text, system = {}) {
    const value = String(text || '').trim();
    if (!value) return system;
    return {
      ...system,
      description: {
        ...(system.description || {}),
        value: `<p>${value}</p>`
      }
    };
  }

  function mythwrightItemDescription(id, name, { source = null, preserveSourceIdentity = false, quality = null, baseName = null } = {}) {
    if (preserveSourceIdentity) {
      const sourceDescription = htmlToText(source?.system?.description?.value || source?.toObject?.()?.system?.description?.value || '');
      return sourceDescription;
    }
    if (BASE_ITEM_DESCRIPTIONS[id]) return BASE_ITEM_DESCRIPTIONS[id];
    if (ESSENCE_DESCRIPTIONS[id]) return ESSENCE_DESCRIPTIONS[id];
    if (RELIC_DESCRIPTIONS[id]) return RELIC_DESCRIPTIONS[id];
    if (quality && baseName) {
      return `${quality} Mythwright ${baseName.toLowerCase()} finished with distinctive workshop marks and ready for the table.`;
    }
    return `${name} created for Mythwright crafting, ready to serve as a story-rich component or finished item.`;
  }

  function srdRecipeDescription(target) {
    const itemName = String(target?.name || 'item').toLowerCase();
    if (target?.type === 'weapon') {
      return `A simple Mythwright recipe for crafting a sturdy ${itemName}, guiding the crafter from raw material selection through shaping, balancing, and finishing the weapon.`;
    }
    if (normalizeName(target?.name) === 'shield') {
      return 'A simple Mythwright recipe for crafting a sturdy shield, guiding the crafter from raw material selection through shaping, reinforcing, and finishing the shield.';
    }
    return `A simple Mythwright recipe for crafting sturdy ${itemName.toLowerCase()}, guiding the crafter from raw material selection through shaping, fitting, and finishing the armour.`;
  }

  function relicRecipeDescription(name) {
    return `A signature Mythwright relic recipe for awakening ${name}, drawing trophies, ancient fragments, dragon scale, and rare essence into an artefact worthy of legend.`;
  }

  function elementalRecipeDescription(definition) {
    const essence = ESSENCES.find(entry => entry.id === definition?.essenceId)?.name || `${definition?.essenceId || 'elemental'} essence`;
    const base = definition?.baseName || definition?.name || 'the base item';
    return `A focused Mythwright infusion recipe for binding ${essence.toLowerCase()} into ${base.toLowerCase()}, finishing each quality tier with controlled elemental power.`;
  }

  function appendDescription(system = {}, text) {
    const existing = String(system.description?.value || '').trim();
    const addition = `<p>${text}</p>`;
    return {
      ...system,
      description: {
        ...(system.description || {}),
        value: existing ? `${existing}\n${addition}` : addition
      }
    };
  }

  function addElementalDamage(system = {}, damageType, formula = '1d4') {
    const damage = system.damage && typeof system.damage === 'object'
      ? { ...system.damage }
      : null;
    if (!damage || !Array.isArray(damage.parts)) {
      return {
        system: appendDescription(system, `This weapon deals an extra ${formula} ${damageType} damage on a hit.`),
        applied: false
      };
    }

    damage.parts = [...damage.parts, [formula, damageType]];
    return {
      system: {
        ...system,
        damage
      },
      applied: true
    };
  }

  function resistanceEffect(name, img, resistanceType) {
    return {
      name: `${name} Resistance`,
      img,
      transfer: true,
      disabled: false,
      changes: [{
        key: 'system.traits.dr.value',
        mode: 2,
        value: resistanceType,
        priority: 20
      }],
      flags: {
        fabricate: {
          mythwrightResistance: resistanceType
        }
      }
    };
  }

  function acBonusEffect(name, img, acBonus) {
    return {
      name: `${name} Armour Bonus`,
      img,
      transfer: true,
      disabled: false,
      changes: [{
        key: 'system.attributes.ac.bonus',
        mode: 2,
        value: String(acBonus),
        priority: 20
      }],
      flags: {
        fabricate: {
          mythwrightAcBonus: acBonus
        }
      }
    };
  }

  function elementalQualityById(id = 'standard') {
    return ELEMENTAL_QUALITY.find(quality => quality.id === id) || ELEMENTAL_QUALITY.find(quality => quality.id === 'standard');
  }

  function elementalVariantQualityId(definition, quality = elementalQualityById()) {
    if (quality.id === 'standard') return definition.id;
    const prefix = definition.type === 'weapon' ? 'weapon' : 'armor';
    const essencePrefix = `${prefix}-${definition.essenceId}-`;
    const baseSlug = definition.id.startsWith(essencePrefix)
      ? definition.id.slice(essencePrefix.length)
      : normalizeName(definition.baseName).replace(/\s+/g, '-');
    return `${prefix}-${definition.essenceId}-${quality.id}-${baseSlug}`;
  }

  function elementalVariantQualityName(definition, quality = elementalQualityById()) {
    return quality.id === 'standard' ? definition.name : `${quality.name} ${definition.name}`;
  }

  function elementalQualityVariantDefinitions(definition) {
    return ELEMENTAL_QUALITY.map(quality => ({
      ...definition,
      id: elementalVariantQualityId(definition, quality),
      name: elementalVariantQualityName(definition, quality),
      quality
    }));
  }

  function itemPayload({
    id,
    name,
    folder,
    img,
    type = 'loot',
    source = null,
    preserveSourceIdentity = false,
    baseSourceId = null
  }) {
    const sourceObject = source?.toObject?.() || {};
    const sourceIdentity = sourceIdentityFromDocument(source, sourceObject);
    const qualityMatch = String(name || '').match(/^(Flawed|Fine|Masterwork|Mythic)\s+(.+)$/);
    const description = mythwrightItemDescription(id, name || source?.name, {
      source,
      preserveSourceIdentity,
      quality: qualityMatch?.[1] || null,
      baseName: qualityMatch?.[2] || null
    });
    const payload = {
      ...sourceObject,
      name: name || source?.name || 'Unnamed Item',
      type: source?.type || type,
      img: sanitizeIconPath(source?.img || img || DEFAULT_ITEM_ICON, { allowExternal: !!source?.img }),
      folder: folder?.id || null,
      system: descriptionToSystem(description, {
        ...(sourceObject.system || {}),
        quantity: Number(sourceObject.system?.quantity || 1)
      }),
      flags: {
        ...(sourceObject.flags || {}),
        core: {
          ...(sourceObject.flags?.core || {}),
          sourceId: preserveSourceIdentity
            ? sourceIdentity
            : null
        },
        fabricate: {
          ...(sourceObject.flags?.fabricate || {}),
          mythwrightId: id,
          ...(baseSourceId && !preserveSourceIdentity ? { mythwrightBaseSourceId: baseSourceId } : {})
        }
      }
    };
    if (preserveSourceIdentity && sourceIdentity) {
      payload._stats = {
        ...(sourceObject._stats || {}),
        compendiumSource: sourceIdentity
      };
    }
    if (!payload.flags.core.sourceId) delete payload.flags.core.sourceId;
    if (!preserveSourceIdentity) stripSourceIdentity(payload);
    return payload;
  }

  function elementalVariantPayload(definition, source, folder) {
    const baseSourceId = sourceIdentityFromDocument(source, source?.toObject?.() || {});
    const quality = elementalQualityById(definition.quality?.id);
    const payload = itemPayload({
      id: definition.id,
      name: definition.name,
      folder,
      img: definition.img || source?.img || DEFAULT_ITEM_ICON,
      type: itemTypeForName(definition.baseName, definition.type === 'weapon' ? 'weapon' : 'equipment'),
      source,
      preserveSourceIdentity: false,
      baseSourceId
    });
    if (definition.img) payload.img = sanitizeIconPath(definition.img);

    payload.flags.fabricate = {
      ...(payload.flags.fabricate || {}),
      elemental: {
        essenceId: definition.essenceId,
        baseItemName: definition.baseName,
        quality: quality.id,
        ...(definition.damageType ? { damageType: definition.damageType } : {}),
        ...(definition.resistanceType ? { resistanceType: definition.resistanceType } : {}),
        ...(quality.acBonus ? { acBonus: quality.acBonus } : {})
      }
    };

    if (definition.damageType) {
      const damageResult = addElementalDamage(payload.system || {}, definition.damageType, quality.damage);
      payload.system = appendDescription(
        damageResult.system,
        `${quality.name} Mythwright elemental work infused with ${definition.essenceId} essence, its edge carrying controlled ${definition.damageType} power.`
      );
      payload.flags.fabricate.elemental.damageApplied = damageResult.applied;
      payload.flags.fabricate.elemental.damageFormula = quality.damage;
      return payload;
    }

    if (definition.resistanceType) {
      const defensiveText = quality.resistance
        ? `While equipped, this Mythwright armour carries ${definition.essenceId} essence and grants resistance to ${definition.resistanceType} damage${quality.acBonus ? ` and a +${quality.acBonus} bonus to AC` : ''}.`
        : `This flawed elemental item carries unstable ${definition.essenceId} essence but grants no reliable resistance.`;
      payload.system = appendDescription(
        payload.system || {},
        defensiveText
      );
      const effects = Array.isArray(payload.effects) ? [...payload.effects] : [];
      if (quality.resistance) effects.push(resistanceEffect(definition.name, payload.img, definition.resistanceType));
      if (quality.acBonus) effects.push(acBonusEffect(definition.name, payload.img, quality.acBonus));
      payload.effects = effects;
    }

    return payload;
  }

  async function ensureWorldItem(definition, foldersByPath, summary, options = {}) {
    const [id, name, path, img, type = 'loot', source = null] = definition;
    const folder = foldersByPath.get(path) || await ensureFolderPath(path, { summary });
    foldersByPath.set(path, folder);
    const payload = itemPayload({ id, name, folder, img, type, source, ...options });
    const existing = findWorldItem(payload.name, folder);
    if (existing) {
      await existing.update(payload);
      summary.items.updated++;
      return existing;
    }
    const created = await Item.create(payload);
    summary.items.created++;
    return created;
  }

  async function ensureElementalVariant(definition, srdByName, foldersByPath, summary) {
    const target = srdByName.get(normalizeName(definition.baseName));
    if (!target?.item) return null;

    const folderPathName = definition.type === 'weapon'
      ? 'Mythwright > Weapons > Elemental'
      : 'Mythwright > Armour > Elemental';
    const folder = foldersByPath.get(folderPathName) || await ensureFolderPath(folderPathName, { summary });
    foldersByPath.set(folderPathName, folder);
    const payload = elementalVariantPayload(definition, target.item, folder);
    const existing = findWorldItem(payload.name, folder);
    if (existing) {
      await existing.update(payload);
      summary.items.updated++;
      return existing;
    }
    const created = await Item.create(payload);
    summary.items.created++;
    return created;
  }

  function qualityVariantIdsForTarget(target) {
    return MUNDANE_QUALITY
      .filter(entry => entry !== 'Standard')
      .map(quality => idFromName(`${target.type}-${quality.toLowerCase()}`, target.name));
  }

  function obsoleteQualityVariantIdsForTarget(target) {
    return [idFromName(`${target.type}-mythic`, target.name)];
  }

  async function cleanupQualityVariantDuplicates(target, foldersByPath, keptItems = [], summary = null) {
    const baseSourceId = target?.item?.uuid || null;
    if (!baseSourceId) return [];

    const qualityFolderPath = target.type === 'weapon'
      ? 'Mythwright > Weapons > Quality'
      : 'Mythwright > Armour > Quality';
    const qualityFolder = foldersByPath?.get?.(qualityFolderPath) || findFolderByPath(qualityFolderPath);
    const qualityFolderId = qualityFolder?.id || null;
    const kept = new Set(keptItems.map(item => item?.id || item?.uuid).filter(Boolean));
    const qualityIds = new Set(qualityVariantIdsForTarget(target));
    const deleted = [];

    for (const item of collectionValues(globalThis.game?.items)) {
      const itemId = item?.id || item?.uuid;
      const folderId = item?.folder?.id || item?.folder || null;
      if (!itemId || kept.has(itemId)) continue;
      if (qualityFolderId && folderId !== qualityFolderId) continue;
      if (!qualityIds.has(itemMythwrightId(item))) continue;
      if (itemSourceId(item) !== baseSourceId) continue;

      if (typeof item.delete === 'function') {
        await item.delete();
        deleted.push(item);
        if (summary?.items) summary.items.deleted = (summary.items.deleted || 0) + 1;
      } else if (typeof item.update === 'function') {
        const payload = stripSourceIdentity({
          flags: {
            ...(item.flags || {}),
            core: { ...(item.flags?.core || {}) },
            fabricate: { ...(item.flags?.fabricate || {}), mythwrightBaseSourceId: baseSourceId }
          },
          _stats: { ...(item._stats || {}) },
          img: sanitizeIconPath(item.img || DEFAULT_ITEM_ICON, { allowExternal: true })
        });
        await item.update(payload);
        if (summary?.items) summary.items.updated++;
      }
    }

    return deleted;
  }

  async function cleanupObsoleteQualityVariants(target, foldersByPath, summary = null) {
    const qualityFolderPath = target.type === 'weapon'
      ? 'Mythwright > Weapons > Quality'
      : 'Mythwright > Armour > Quality';
    const qualityFolder = foldersByPath?.get?.(qualityFolderPath) || findFolderByPath(qualityFolderPath);
    const qualityFolderId = qualityFolder?.id || null;
    const obsoleteIds = new Set(obsoleteQualityVariantIdsForTarget(target));
    const deleted = [];

    for (const item of collectionValues(globalThis.game?.items)) {
      const folderId = item?.folder?.id || item?.folder || null;
      if (qualityFolderId && folderId !== qualityFolderId) continue;
      if (!obsoleteIds.has(itemMythwrightId(item))) continue;

      if (typeof item.delete === 'function') {
        await item.delete();
        deleted.push(item);
        if (summary?.items) summary.items.deleted = (summary.items.deleted || 0) + 1;
      }
    }

    return deleted;
  }

  function classifySrdItem(item) {
    const type = String(item?.type || '').toLowerCase();
    const armour = SRD_ARMOUR.some(name => normalizeName(name) === normalizeName(item?.name));
    const weapon = SRD_WEAPONS.some(name => normalizeName(name) === normalizeName(item?.name));
    if (weapon || type === 'weapon') return 'weapon';
    if (armour || type === 'equipment' || type === 'armor' || type === 'armour') return 'armor';
    return null;
  }

  async function discoverSrdItems(packs = globalThis.game?.packs) {
    const targets = new Map([
      ...DND5E_EQUIPMENT24_SRD_ITEMS.map(([type, name, uuid]) => [
        normalizeName(name),
        { name, type, uuid, item: null }
      ])
    ]);

    for (const target of targets.values()) {
      const doc = await resolveCompendiumDocument(target.uuid);
      if (doc) target.item = doc;
    }

    for (const pack of collectionValues(packs)) {
      const metadata = pack.metadata || {};
      const packageName = metadata.packageName || metadata.package || pack.collection || '';
      const documentName = pack.documentName || metadata.type || '';
      if (!String(packageName).includes('dnd5e')) continue;
      if (documentName && documentName !== 'Item') continue;

      const docs = typeof pack.getDocuments === 'function'
        ? await pack.getDocuments()
        : collectionValues(pack.index);
      for (const doc of docs) {
        const key = normalizeName(doc?.name);
        const target = targets.get(key);
        if (!target) continue;
        if (target.item) continue;
        const kind = classifySrdItem(doc);
        if (kind && kind !== target.type) continue;
        if (!target.item) target.item = doc;
      }
    }

    const resolved = [];
    const unresolved = [];
    for (const target of targets.values()) {
      if (target.item) resolved.push(target);
      else unresolved.push(target.name);
    }
    return { resolved, unresolved };
  }

  function componentFromItem(id, item, extra = {}) {
    const itemUuid = item.uuid || null;
    const sourceUuid = extra.preserveSourceIdentity === false
      ? (itemUuid?.startsWith('Compendium.') ? null : itemUuid)
      : itemUuid;
    const sourceItemUuid = extra.preserveSourceIdentity === false
      ? (itemUuid?.startsWith('Compendium.') ? null : itemUuid)
      : (itemSourceId(item) || itemUuid);
    const itemDescription = htmlToText(item.system?.description?.value || item.toObject?.()?.system?.description?.value || '');
    return {
      id,
      name: item.name,
      description: itemDescription,
      img: sanitizeIconPath(item.img || DEFAULT_ITEM_ICON, { allowExternal: true }),
      sourceUuid,
      sourceItemUuid,
      fallbackItemIds: [],
      tags: extra.tags || [],
      difficulty: extra.difficulty || 1,
      salvage: extra.salvage || { enabled: false },
      ...(extra.mythwrightBaseSourceId ? { mythwrightBaseSourceId: extra.mythwrightBaseSourceId } : {})
    };
  }

  function ingredientSet(id, componentIds, resultGroupId = null, essences = {}) {
    return {
      id,
      name: id,
      ingredientGroups: componentIds.map((componentId, index) => ({
        id: `${id}-group-${index + 1}`,
        name: componentId,
        options: [{ match: { type: 'component', componentId }, componentId, quantity: 1 }]
      })),
      essences,
      catalysts: [],
      resultGroupId
    };
  }

  function resultGroup(id, name, componentId, quantity = 1) {
    return {
      id,
      name,
      results: [{ id: `${id}-result`, componentId, quantity }]
    };
  }

  const MYTHWRIGHT_GATHERING_TOOL_DEFINITIONS = Object.freeze([
    ['mythwright-tool-mining-pick', 'Mining Pick', 'tool-mining-pick', 'broken-tool-mining-pick', 8],
    ['mythwright-tool-wood-axe', 'Wood Axe', 'tool-wood-axe', 'broken-tool-wood-axe', 6],
    ['mythwright-tool-skinning-knife', 'Skinning Knife', 'tool-skinning-knife', 'broken-tool-skinning-knife', 5],
    ['mythwright-tool-delver-kit', 'Delver Kit', 'tool-delver-kit', 'broken-tool-delver-kit', 10],
    ['mythwright-tool-planar-binding-rod', 'Planar Binding Rod', 'tool-planar-binding-rod', 'broken-tool-planar-binding-rod', 12],
    ['mythwright-tool-dragon-tongs', 'Dragon Tongs', 'tool-dragon-tongs', 'broken-tool-dragon-tongs', 15]
  ]);

  const MYTHWRIGHT_TOOL_REPAIR_MATERIALS = Object.freeze({
    'tool-mining-pick': ['broken-tool-mining-pick', 'iron-ingot', 'hardwood'],
    'tool-wood-axe': ['broken-tool-wood-axe', 'iron-ingot', 'hardwood'],
    'tool-skinning-knife': ['broken-tool-skinning-knife', 'iron-ingot', 'cured-hide'],
    'tool-delver-kit': ['broken-tool-delver-kit', 'hardwood', 'cured-hide'],
    'tool-planar-binding-rod': ['broken-tool-planar-binding-rod', 'ancient-fragment', 'storm'],
    'tool-dragon-tongs': ['broken-tool-dragon-tongs', 'iron-ingot', 'dragon-scale']
  });

  function buildGatheringTools() {
    return MYTHWRIGHT_GATHERING_TOOL_DEFINITIONS.map(([id, label, componentId, replacementComponentId, breakageChance]) => ({
      id,
      label,
      enabled: true,
      componentId,
      requirement: null,
      breakage: { mode: 'breakageChance', breakageChance },
      onBreak: { mode: 'replaceWith', replacementComponentId }
    }));
  }

  function buildRepairRecipeForTool(toolDefinition) {
    const [, label, componentId] = toolDefinition;
    const materials = MYTHWRIGHT_TOOL_REPAIR_MATERIALS[componentId] || [];
    const recipeId = `mythwright-repair-${componentId.replace(/^tool-/, '')}`;
    return {
      id: recipeId,
      name: `Repair ${label}`,
      description: `Repair a broken ${label.toLowerCase()} with matching Mythwright materials so it can return to the field.`,
      img: MYTHWRIGHT_ICONS[componentIdToIconKey(componentId)] || DEFAULT_ITEM_ICON,
      category: 'Tools',
      craftingSystemId: SYSTEM_ID,
      system: 'dnd5e',
      tags: [],
      enabled: true,
      resultSelection: { provider: 'ingredientSet' },
      steps: [{
        id: `${recipeId}-restore`,
        name: 'Restore Tool',
        ingredientSets: [ingredientSet(`${recipeId}-restore-set`, materials, 'standard')],
        resultSelection: { provider: 'ingredientSet' },
        resultGroups: [resultGroup('standard', 'Standard', componentId)]
      }]
    };
  }

  function componentIdToIconKey(componentId) {
    return {
      'tool-mining-pick': 'miningPick',
      'tool-wood-axe': 'woodAxe',
      'tool-skinning-knife': 'skinningKnife',
      'tool-delver-kit': 'delverKit',
      'tool-planar-binding-rod': 'planarBindingRod',
      'tool-dragon-tongs': 'dragonTongs'
    }[componentId];
  }

  function buildToolRepairRecipes() {
    return MYTHWRIGHT_GATHERING_TOOL_DEFINITIONS.map(buildRepairRecipeForTool);
  }

  function gatheringDrop({
    id,
    name,
    componentId = null,
    itemName = null,
    srdByName = new Map(),
    componentIds = null,
    unresolvedDrops = null,
    quantity = 1,
    dropRate = 50
  }) {
    const row = {
      id,
      name,
      quantity,
      dropRate,
      enabled: true
    };
    if (componentId) row.componentId = componentId;
    const target = itemName ? srdByName.get(normalizeName(itemName)) : null;
    if (!componentId && target) {
      const targetComponentId = idFromName(target.type === 'weapon' ? 'weapon' : 'armor', target.name);
      if (!componentIds || componentIds.has(targetComponentId)) {
        row.componentId = targetComponentId;
      }
    }
    if (!row.componentId && !row.itemUuid) {
      if (itemName && Array.isArray(unresolvedDrops)) {
        unresolvedDrops.push({ id, name, itemName });
      }
      return null;
    }
    return row;
  }

  function srdComponentIdsFromMap(srdByName = new Map()) {
    return new Set(Array.from(srdByName.values())
      .filter(Boolean)
      .map(target => idFromName(target.type === 'weapon' ? 'weapon' : 'armor', target.name))
      .filter(Boolean));
  }

  function buildGatheringTasks({ srdByName = new Map(), componentIds = null, unresolvedDrops = null } = {}) {
    const resolvedComponentIds = componentIds || srdComponentIdsFromMap(srdByName);
    const drop = options => gatheringDrop({ ...options, srdByName, componentIds: resolvedComponentIds, unresolvedDrops });
    return [
      {
        id: 'mine-ore',
        name: 'Extract Ore',
        img: MYTHWRIGHT_ICONS.gatheringMineOre,
        enabled: true,
        biomes: ['cave', 'mountain'],
        toolIds: ['mythwright-tool-mining-pick'],
        itemSelectionMode: 'allDrops',
        dropRows: [
          drop({ id: 'mine-ore-raw', name: 'Raw Ore', componentId: 'raw-ore', quantity: 2, dropRate: 90 }),
          drop({ id: 'mine-ore-ingot', name: 'Iron Ingot', componentId: 'iron-ingot', dropRate: 45 }),
          drop({ id: 'mine-ore-gemstone', name: 'Gemstone', componentId: 'gemstone', dropRate: 25 }),
          drop({ id: 'mine-ore-war-pick', name: 'War Pick', itemName: 'War Pick', dropRate: 8 })
        ].filter(Boolean)
      },
      {
        id: 'wild-hardwood',
        name: 'Cut Hardwood',
        img: MYTHWRIGHT_ICONS.gatheringWildHardwood,
        enabled: true,
        biomes: ['forest', 'grassland'],
        toolIds: ['mythwright-tool-wood-axe'],
        itemSelectionMode: 'allDrops',
        dropRows: [
          drop({ id: 'wild-hardwood-stock', name: 'Hardwood', componentId: 'hardwood', quantity: 2, dropRate: 85 }),
          drop({ id: 'wild-hardwood-bow-stave', name: 'Bow Stave', componentId: 'bow-stave', dropRate: 25 }),
          drop({ id: 'wild-hardwood-handaxe', name: 'Handaxe', itemName: 'Handaxe', dropRate: 10 })
        ].filter(Boolean)
      },
      {
        id: 'wild-hide',
        name: 'Dress Hides and Trophies',
        img: MYTHWRIGHT_ICONS.gatheringWildHide,
        enabled: true,
        biomes: ['forest', 'grassland'],
        toolIds: ['mythwright-tool-skinning-knife'],
        itemSelectionMode: 'allDrops',
        dropRows: [
          drop({ id: 'wild-hide-cured', name: 'Cured Hide', componentId: 'cured-hide', quantity: 2, dropRate: 80 }),
          drop({ id: 'wild-hide-trophy', name: 'Monster Trophy', componentId: 'monster-trophy', dropRate: 35 }),
          drop({ id: 'wild-hide-leather', name: 'Leather Armor', itemName: 'Leather Armor', dropRate: 8 })
        ].filter(Boolean)
      },
      {
        id: 'ruin-relics',
        name: 'Excavate Ruin Relics',
        img: MYTHWRIGHT_ICONS.gatheringRuinRelics,
        enabled: true,
        biomes: ['ruins', 'urban'],
        toolIds: ['mythwright-tool-delver-kit'],
        itemSelectionMode: 'allDrops',
        dropRows: [
          drop({ id: 'ruin-relics-fragment', name: 'Ancient Fragment', componentId: 'ancient-fragment', quantity: 2, dropRate: 80 }),
          drop({ id: 'ruin-relics-gemstone', name: 'Gemstone', componentId: 'gemstone', dropRate: 30 }),
          drop({ id: 'ruin-relics-shield', name: 'Shield', itemName: 'Shield', dropRate: 12 }),
          drop({ id: 'ruin-relics-rapier', name: 'Rapier', itemName: 'Rapier', dropRate: 7 })
        ].filter(Boolean)
      },
      {
        id: 'battlefield-salvage',
        name: 'Salvage Battlefield Gear',
        img: MYTHWRIGHT_ICONS.gatheringBattlefieldSalvage,
        enabled: true,
        biomes: ['wasteland', 'grassland'],
        toolIds: ['mythwright-tool-delver-kit', 'mythwright-tool-skinning-knife'],
        itemSelectionMode: 'allDrops',
        dropRows: [
          drop({ id: 'battlefield-salvage-trophy', name: 'Monster Trophy', componentId: 'monster-trophy', dropRate: 45 }),
          drop({ id: 'battlefield-salvage-plates', name: 'Armour Plates', componentId: 'armour-plates', dropRate: 35 }),
          drop({ id: 'battlefield-salvage-shield', name: 'Shield', itemName: 'Shield', dropRate: 15 }),
          drop({ id: 'battlefield-salvage-longsword', name: 'Longsword', itemName: 'Longsword', dropRate: 8 }),
          drop({ id: 'battlefield-salvage-chain-mail', name: 'Chain Mail', itemName: 'Chain Mail', dropRate: 4 })
        ].filter(Boolean)
      },
      {
        id: 'planar-essence',
        name: 'Bind Planar Essence',
        img: MYTHWRIGHT_ICONS.gatheringPlanarEssence,
        enabled: true,
        toolIds: ['mythwright-tool-planar-binding-rod'],
        itemSelectionMode: 'allDrops',
        dropRows: [
          drop({ id: 'planar-essence-ember', name: 'Ember Essence', componentId: 'ember', dropRate: 35 }),
          drop({ id: 'planar-essence-frost', name: 'Frost Essence', componentId: 'frost', dropRate: 35 }),
          drop({ id: 'planar-essence-storm', name: 'Storm Essence', componentId: 'storm', dropRate: 35 }),
          drop({ id: 'planar-essence-radiance', name: 'Radiance Essence', componentId: 'radiance', dropRate: 20 }),
          drop({ id: 'planar-essence-shadow', name: 'Shadow Essence', componentId: 'shadow', dropRate: 20 })
        ].filter(Boolean)
      },
      {
        id: 'dragon-scale',
        name: 'Harvest Dragon Scale',
        img: MYTHWRIGHT_ICONS.gatheringDragonScale,
        enabled: true,
        toolIds: ['mythwright-tool-dragon-tongs'],
        itemSelectionMode: 'allDrops',
        dropRows: [
          drop({ id: 'dragon-scale-scale', name: 'Dragon Scale', componentId: 'dragon-scale', quantity: 2, dropRate: 70 }),
          drop({ id: 'dragon-scale-essence', name: 'Dragon Essence', componentId: 'dragon', dropRate: 35 }),
          drop({ id: 'dragon-scale-catalyst', name: 'Mythic Catalyst', componentId: 'mythic-catalyst', dropRate: 18 }),
          drop({ id: 'dragon-scale-gemstone', name: 'Gemstone', componentId: 'gemstone', dropRate: 30 })
        ].filter(Boolean)
      }
    ];
  }

  function buildRecipeForSrd(target, components) {
    const baseId = components.get(idFromName(target.type === 'weapon' ? 'weapon' : 'armor', target.name))?.id;
    const intermediate = target.type === 'weapon' ? 'weapon-core' : 'armour-plates';
    const finishInput = target.type === 'weapon' ? 'balanced-hilt' : 'reinforced-straps';
    const material = target.type === 'weapon' ? 'iron-ingot' : 'cured-hide';
    const recipeId = idFromName('mythwright-craft', target.name);
    return {
      id: recipeId,
      name: `Craft ${target.name}`,
      description: srdRecipeDescription(target),
      img: sanitizeIconPath(target.item?.img || DEFAULT_ITEM_ICON, { allowExternal: true }),
      category: target.type === 'weapon' ? 'Weapons' : 'Armour',
      craftingSystemId: SYSTEM_ID,
      system: 'dnd5e',
      tags: [],
      enabled: true,
      resultSelection: { provider: 'macroOutcome' },
      steps: [
        {
          id: `${recipeId}-refine`,
          name: 'Refine Materials',
          ingredientSets: [ingredientSet(`${recipeId}-refine-set`, ['raw-ore'], 'standard')],
          resultSelection: { provider: 'ingredientSet' },
          resultGroups: [resultGroup('standard', 'Standard', material)]
        },
        {
          id: `${recipeId}-shape`,
          name: target.type === 'weapon' ? 'Forge Weapon Parts' : 'Shape Armour Parts',
          ingredientSets: [ingredientSet(`${recipeId}-shape-set`, [material], 'standard')],
          resultSelection: { provider: 'ingredientSet' },
          resultGroups: [resultGroup('standard', 'Standard', intermediate)]
        },
        {
          id: `${recipeId}-assemble`,
          name: 'Assemble Base',
          ingredientSets: [ingredientSet(`${recipeId}-assemble-set`, [intermediate, finishInput], 'standard')],
          resultSelection: { provider: 'ingredientSet' },
          resultGroups: [resultGroup('standard', 'Standard', baseId)]
        },
        {
          id: `${recipeId}-finish`,
          name: 'Finish Quality',
          ingredientSets: [ingredientSet(`${recipeId}-finish-set`, [baseId, 'artisan-catalyst'])],
          resultSelection: { provider: 'macroOutcome' },
          resultGroups: MUNDANE_QUALITY.map(quality => resultGroup(
            quality.toLowerCase(),
            quality,
            quality === 'Standard' ? baseId : idFromName(`${target.type}-${quality.toLowerCase()}`, target.name)
          ))
        }
      ]
    };
  }

  function buildRelicRecipe(relicId, name, essenceId) {
    return {
      id: `mythwright-${relicId}`,
      name: `Craft ${name}`,
      description: relicRecipeDescription(name),
      img: RELICS.find(definition => definition[0] === relicId)?.[3] || DEFAULT_ITEM_ICON,
      category: 'Relics',
      craftingSystemId: SYSTEM_ID,
      system: 'dnd5e',
      tags: [],
      enabled: true,
      resultSelection: { provider: 'macroOutcome' },
      steps: [
        {
          id: `${relicId}-gather`,
          name: 'Gather Relic Materials',
          ingredientSets: [ingredientSet(`${relicId}-gather-set`, ['ancient-fragment', 'monster-trophy'], 'standard')],
          resultSelection: { provider: 'ingredientSet' },
          resultGroups: [resultGroup('standard', 'Standard', 'mythic-catalyst')]
        },
        {
          id: `${relicId}-finish`,
          name: 'Awaken Relic',
          ingredientSets: [ingredientSet(`${relicId}-finish-set`, ['mythic-catalyst', 'dragon-scale'], null, { [essenceId]: 2 })],
          resultSelection: { provider: 'macroOutcome' },
          resultGroups: RELIC_QUALITY.map(quality => resultGroup(quality.toLowerCase(), quality, relicId))
        }
      ]
    };
  }

  function buildElementalRecipe(definition) {
    const recipeId = `mythwright-infuse-${definition.id}`;
    const baseComponentId = idFromName(definition.type === 'weapon' ? 'weapon' : 'armor', definition.baseName);
    const qualityDefinitions = elementalQualityVariantDefinitions(definition);
    return {
      id: recipeId,
      name: `Infuse ${definition.name}`,
      description: elementalRecipeDescription(definition),
      img: definition.img || DEFAULT_ITEM_ICON,
      category: definition.type === 'weapon' ? 'Weapons' : 'Armour',
      craftingSystemId: SYSTEM_ID,
      system: 'dnd5e',
      tags: [],
      enabled: true,
      transferEffects: true,
      resultSelection: { provider: 'macroOutcome' },
      steps: [{
        id: `${recipeId}-finish`,
        name: 'Elemental Finish',
        ingredientSets: [
          ingredientSet(`${recipeId}-finish-set`, [baseComponentId, 'artisan-catalyst'], null, { [definition.essenceId]: 1 })
        ],
        resultSelection: { provider: 'macroOutcome' },
        resultGroups: qualityDefinitions.map(variant => resultGroup(variant.quality.id, variant.quality.name, variant.id))
      }]
    };
  }

  function tagsForComponent() {
    return [];
  }

  function itemTagsForSystem() {
    return [];
  }

  function buildSystemPayload({ macroUuid, worldItems = new Map(), components = [] } = {}) {
    return {
      id: SYSTEM_ID,
      name: SYSTEM_NAME,
      description: SYSTEM_DESCRIPTION,
      enabled: true,
      resolutionMode: 'routed',
      features: {
        multiStepRecipes: true,
        essences: true,
        gathering: true,
        salvage: true,
        craftingChecks: true,
        chatOutput: true,
        effectTransfer: true,
        outcomeRouting: true
      },
      craftingCheck: {
        enabled: true,
        macroUuid: macroUuid || '',
        mode: 'namedOutcomes',
        outcomes: ['flawed', 'standard', 'fine', 'masterwork', 'mythic'],
        consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false }
      },
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: {
        enabled: true,
        macroUuid: macroUuid || '',
        outcomes: ['pass', 'fail'],
        consumption: { consumeComponentOnFail: true, consumeCatalystsOnFail: false }
      },
      essenceDefinitions: ESSENCES.map(essence => ({
        id: essence.id,
        name: essence.name,
        description: ESSENCE_DESCRIPTIONS[essence.id] || '',
        icon: essence.icon,
        sourceComponentId: essence.id,
        sourceItemUuid: worldItems.get(essence.id)?.uuid || null
      })),
      itemTags: itemTagsForSystem(),
      categories: ['Weapons', 'Armour', 'Relics', 'Tools'],
      components
    };
  }

  function buildRecipePayloads({ srd = { resolved: [] }, componentMap = new Map() } = {}) {
    const recipes = [];

    for (const target of srd.resolved || []) {
      recipes.push(buildRecipeForSrd(target, componentMap));
    }
    for (const definition of ELEMENTAL_VARIANTS) {
      if (elementalQualityVariantDefinitions(definition).every(variant => componentMap.has(variant.id))) {
        recipes.push(buildElementalRecipe(definition));
      }
    }
    recipes.push(
      buildRelicRecipe('relic-mythic-longsword', 'Mythwright Mythic Longsword', 'ember'),
      buildRelicRecipe('relic-draconic-scale-mail', 'Draconic Scale Mail', 'dragon'),
      buildRelicRecipe('relic-storm-bow', 'Storm-Forged Bow', 'storm'),
      buildRelicRecipe('relic-radiant-shield', 'Radiant Shield', 'radiance'),
      buildRelicRecipe('relic-shadow-dagger', 'Shadow Dagger', 'shadow'),
      ...buildToolRepairRecipes()
    );
    return recipes;
  }

  function buildImportPayload({ systemPayload, recipes = [] } = {}) {
    return {
      fabricateVersion: globalThis.game?.modules?.get?.('fabricate')?.version || '0.0.0',
      exportedAt: new Date().toISOString(),
      system: clonePlain(systemPayload),
      recipes: clonePlain(recipes)
    };
  }

  async function importMythwrightPayload(payload, summary) {
    const importFromPack = globalThis.game?.fabricate?.importFromPack;
    if (typeof importFromPack !== 'function') {
      throw new Error('Fabricate import API is not available.');
    }

    const importSummary = await importFromPack(payload, { overwriteExisting: true });
    const overwrittenRecipes = (importSummary?.collisions || [])
      .filter(collision => collision.type === 'recipe' && collision.resolution === 'overwritten')
      .length;
    const importedRecipes = Number(importSummary?.recipes?.imported) || 0;
    const recipeErrors = Array.isArray(importSummary?.recipes?.errors)
      ? importSummary.recipes.errors.length
      : 0;

    summary.system = (importSummary?.collisions || []).some(collision =>
      collision.type === 'system' && collision.resolution === 'overwritten'
    )
      ? 'updated'
      : (importSummary?.system?.created ? 'created' : 'skipped');
    summary.recipes.updated = overwrittenRecipes;
    summary.recipes.created = Math.max(0, importedRecipes - overwrittenRecipes);
    summary.recipes.skipped = Number(importSummary?.recipes?.skipped) || 0;
    summary.recipes.errors = recipeErrors;

    return importSummary;
  }

  function buildEnvironment(id, name, risk, tasks) {
    return {
      id,
      craftingSystemId: SYSTEM_ID,
      name,
      description: ENVIRONMENT_DESCRIPTIONS[id] || `${name} holds useful materials for careful gatherers.`,
      risk,
      economyMode: 'time',
      selectionMode: 'targeted',
      enabled: true,
      tasks: [],
      enabledTaskIds: tasks.map(task => task.id),
      disabledTaskIds: []
    };
  }

  function upsertById(existing, nextEntries) {
    const byId = new Map(collectionValues(existing).filter(entry => entry?.id).map(entry => [String(entry.id), entry]));
    for (const entry of nextEntries) {
      byId.set(String(entry.id), entry);
    }
    return Array.from(byId.values());
  }

  async function validateGatheringTaskDrops(tasks = [], components = []) {
    if (!Array.isArray(components) || components.length === 0) return [];
    const componentIds = new Set(components.map(component => String(component?.id || '')).filter(Boolean));
    const errors = [];
    for (const task of Array.isArray(tasks) ? tasks : []) {
      const taskLabel = String(task?.name || task?.id || 'unnamed');
      const rows = Array.isArray(task?.dropRows) ? task.dropRows : [];
      for (const row of rows) {
        const rowLabel = String(row?.name || row?.id || 'row');
        const componentId = String(row?.componentId || '').trim();
        const itemUuid = String(row?.itemUuid || '').trim();
        if (componentId) {
          if (!componentIds.has(componentId)) {
            errors.push(`Task "${taskLabel}" drop row "${rowLabel}" references unknown componentId "${componentId}"`);
          }
          continue;
        }
        if (itemUuid) {
          if (!await resolveCompendiumDocument(itemUuid)) {
            errors.push(`Task "${taskLabel}" drop row "${rowLabel}" itemUuid "${itemUuid}" does not resolve to an Item`);
          }
          continue;
        }
        errors.push(`Task "${taskLabel}" drop row "${rowLabel}" requires componentId or itemUuid`);
      }
    }
    return errors;
  }

  async function seedGatheringConfig({ tools = [], tasks = [], components = [], unresolvedDrops = [] } = {}, summary = null) {
    const settings = globalThis.game?.settings;
    if (typeof settings?.get !== 'function' || typeof settings?.set !== 'function') {
      return { updated: false, tools: 0, tasks: 0 };
    }
    const validationErrors = await validateGatheringTaskDrops(tasks, components);
    if (validationErrors.length > 0) {
      throw new Error(`Mythwright gatheringConfig validation failed: ${validationErrors.join('; ')}`);
    }
    const current = clonePlain(settings.get('fabricate', 'gatheringConfig') || {});
    current.systems = current.systems && typeof current.systems === 'object' ? current.systems : {};
    const systemConfig = current.systems[SYSTEM_ID] && typeof current.systems[SYSTEM_ID] === 'object'
      ? current.systems[SYSTEM_ID]
      : {};
    systemConfig.tools = upsertById(systemConfig.tools || [], tools);
    systemConfig.tasks = upsertById(systemConfig.tasks || [], tasks);
    systemConfig.rules = {
      ...(systemConfig.rules || {}),
      toolBreakagePolicy: systemConfig.rules?.toolBreakagePolicy || 'failureOnBreak'
    };
    current.systems[SYSTEM_ID] = systemConfig;
    await settings.set('fabricate', 'gatheringConfig', current);
    if (summary) summary.gatheringConfig = { tools: tools.length, tasks: tasks.length, unresolvedDrops: clonePlain(unresolvedDrops) };
    return { updated: true, tools: tools.length, tasks: tasks.length };
  }

  function clonePlain(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function macroCommand() {
    return `const groups = args?.[0]?.step?.resultGroups || [];
const finalStep = /finish|awaken/i.test(args?.[0]?.step?.name || '');
const hasMythic = groups.some(group => String(group?.name || group?.id || '').toLowerCase() === 'mythic');
let total = 10;
try {
  const roll = await new Roll('1d20').evaluate();
  total = roll.total;
  await roll.toMessage({ flavor: 'Mythwright Crafting Check' });
} catch (err) {
  console.warn('Mythwright | Falling back to Standard outcome', err);
}
if (!finalStep) return { success: true, outcome: 'standard', value: total, data: { provider: 'macroOutcome' } };
if (total <= 1) return { success: false, outcome: 'fail', value: total, message: 'Catastrophic failure', data: {} };
if (total < 8) return { success: true, outcome: 'flawed', value: total, data: {} };
if (total < 14) return { success: true, outcome: 'standard', value: total, data: {} };
if (total < 18) return { success: true, outcome: 'fine', value: total, data: {} };
if (total < 20) return { success: true, outcome: 'masterwork', value: total, data: {} };
return { success: true, outcome: hasMythic ? 'mythic' : 'masterwork', value: total, data: {} };`;
  }

  async function ensureMacro(summary) {
    const existing = collectionValues(globalThis.game?.macros).find(macro => macro.name === MACRO_NAME);
    const payload = { name: MACRO_NAME, type: 'script', command: macroCommand(), img: MYTHWRIGHT_ICONS.macro };
    if (existing) {
      await existing.update(payload);
      summary.macro = existing.uuid;
      return existing;
    }
    const created = await Macro.create(payload);
    summary.macro = created.uuid;
    return created;
  }

  async function upsertEnvironment(store, environment, summary) {
    const all = store.list ? store.list() : (store.getAll ? store.getAll() : []);
    const existing = collectionValues(all).find(entry => entry.id === environment.id);
    if (existing && store.update) {
      await store.update(environment.id, environment);
      summary.environments.updated++;
      return;
    }
    if (store.create) {
      await store.create(environment);
      summary.environments.created++;
    }
  }

  async function run() {
    if (!globalThis.game?.user?.isGM) throw new Error('Mythwright bootstrap requires GM permission.');
    if (globalThis.game?.system?.id !== 'dnd5e') throw new Error('Mythwright bootstrap requires the DnD5e system.');
    if (!globalThis.game?.fabricate?.ready) throw new Error('Fabricate is not ready.');

    const summary = {
      folders: { created: 0, updated: 0 },
      items: { created: 0, updated: 0, deleted: 0 },
      srd: { resolved: 0, unresolved: [] },
      system: 'skipped',
      recipes: { created: 0, updated: 0, skipped: 0, errors: 0 },
      environments: { created: 0, updated: 0 },
      gatheringConfig: { tools: 0, tasks: 0 },
      macro: null
    };

    const foldersByPath = new Map();
    for (const path of FOLDER_PATHS) {
      foldersByPath.set(path, await ensureFolderPath(path, { summary }));
    }

    const srd = await discoverSrdItems();
    summary.srd.resolved = srd.resolved.length;
    summary.srd.unresolved = srd.unresolved;
    const srdByName = new Map(srd.resolved.map(target => [normalizeName(target.name), target]));

    const worldItems = new Map();
    for (const def of BASE_ITEMS) {
      const item = await ensureWorldItem(def, foldersByPath, summary);
      worldItems.set(def[0], item);
    }
    for (const essence of ESSENCES) {
      const item = await ensureWorldItem(
        [essence.id, essence.name, 'Mythwright > Essences', essence.img || DEFAULT_ITEM_ICON],
        foldersByPath,
        summary
      );
      worldItems.set(essence.id, item);
    }
    for (const def of RELICS) {
      const item = await ensureWorldItem([...def, 'equipment'], foldersByPath, summary);
      worldItems.set(def[0], item);
    }

    for (const target of srd.resolved) {
      const componentId = idFromName(target.type, target.name);
      worldItems.set(componentId, target.item);

      const keptQualityItems = [];
      for (const quality of MUNDANE_QUALITY.filter(entry => entry !== 'Standard')) {
        const qualityId = idFromName(`${target.type}-${quality.toLowerCase()}`, target.name);
        const qualityFolder = target.type === 'weapon' ? 'Mythwright > Weapons > Quality' : 'Mythwright > Armour > Quality';
        const qualityItem = await ensureWorldItem(
          [qualityId, `${quality} ${target.name}`, qualityFolder, target.item?.img, itemTypeForName(target.name), target.item],
          foldersByPath,
          summary,
          { preserveSourceIdentity: false, baseSourceId: target.item?.uuid || null }
        );
        worldItems.set(qualityId, qualityItem);
        keptQualityItems.push(qualityItem);
      }
      await cleanupQualityVariantDuplicates(target, foldersByPath, keptQualityItems, summary);
      await cleanupObsoleteQualityVariants(target, foldersByPath, summary);
    }

    for (const definition of ELEMENTAL_VARIANTS) {
      for (const variant of elementalQualityVariantDefinitions(definition)) {
        const item = await ensureElementalVariant(variant, srdByName, foldersByPath, summary);
        if (item) worldItems.set(variant.id, item);
      }
    }

    const macro = await ensureMacro(summary);
    const gatheringTools = buildGatheringTools();
    const environmentStore = globalThis.game.fabricate.getGatheringEnvironmentStore?.();

    const srdQualityComponentIds = new Set(srd.resolved.flatMap(target =>
      MUNDANE_QUALITY
        .filter(entry => entry !== 'Standard')
        .map(quality => idFromName(`${target.type}-${quality.toLowerCase()}`, target.name))
    ));
    const qualityBaseSourceById = new Map(srd.resolved.flatMap(target =>
      MUNDANE_QUALITY
        .filter(entry => entry !== 'Standard')
        .map(quality => [
          idFromName(`${target.type}-${quality.toLowerCase()}`, target.name),
          target.item?.uuid || null
        ])
    ));
    const elementalTierDefinitions = ELEMENTAL_VARIANTS.flatMap(definition => elementalQualityVariantDefinitions(definition));
    const elementalBaseSourceById = new Map(elementalTierDefinitions.map(definition => [
      definition.id,
      srdByName.get(normalizeName(definition.baseName))?.item?.uuid || null
    ]));
    const elementalDefinitions = new Map(elementalTierDefinitions.map(definition => [definition.id, definition]));

    const components = Array.from(worldItems.entries()).map(([id, item]) => componentFromItem(id, item, {
      preserveSourceIdentity: !srdQualityComponentIds.has(id) && !elementalDefinitions.has(id),
      mythwrightBaseSourceId: qualityBaseSourceById.get(id) || elementalBaseSourceById.get(id) || null,
      tags: tagsForComponent(),
      difficulty: MUNDANE_QUALITY.some(quality => item.name?.startsWith(`${quality} `)) ? 5 : (elementalDefinitions.has(id) ? 7 + (elementalDefinitions.get(id)?.quality?.acBonus || 0) : 1),
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [resultGroup('scrap', 'Scrap', id === 'dragon-scale' ? 'dragon' : 'raw-ore')],
        outcomeRouting: { pass: 'scrap', fail: 'scrap' }
      }
    }));

    const unresolvedGatheringDrops = [];
    const componentIds = new Set(components.map(component => component.id));
    const gatheringTasks = buildGatheringTasks({
      srdByName,
      componentIds,
      unresolvedDrops: unresolvedGatheringDrops
    });
    await seedGatheringConfig({
      tools: gatheringTools,
      tasks: gatheringTasks,
      components,
      unresolvedDrops: unresolvedGatheringDrops
    }, summary);

    const systemPayload = buildSystemPayload({
      macroUuid: macro.uuid,
      worldItems,
      components
    });

    const componentMap = new Map(components.map(component => [component.id, component]));
    const recipes = buildRecipePayloads({ srd, componentMap });
    const importPayload = buildImportPayload({ systemPayload, recipes });
    await importMythwrightPayload(importPayload, summary);

    if (environmentStore) {
      const taskById = new Map(gatheringTasks.map(task => [task.id, task]));
      const environments = [
        buildEnvironment('mythwright-mines', 'Mines', 'hazardous', [taskById.get('mine-ore')].filter(Boolean)),
        buildEnvironment('mythwright-wilds', 'Wilds', 'safe', ['wild-hardwood', 'wild-hide'].map(id => taskById.get(id)).filter(Boolean)),
        buildEnvironment('mythwright-ruins', 'Ruins', 'unsafe', [taskById.get('ruin-relics')].filter(Boolean)),
        buildEnvironment('mythwright-battlefields', 'Battlefields', 'hazardous', [taskById.get('battlefield-salvage')].filter(Boolean)),
        buildEnvironment('mythwright-planar-sites', 'Planar Sites', 'extreme', [taskById.get('planar-essence')].filter(Boolean)),
        buildEnvironment('mythwright-dragon-lairs', 'Dragon Lairs', 'extreme', [taskById.get('dragon-scale')].filter(Boolean))
      ];
      for (const environment of environments) {
        await upsertEnvironment(environmentStore, environment, summary);
      }
    }

    console.log('Mythwright bootstrap summary', summary);
    globalThis.ui?.notifications?.info?.(
      `Mythwright seeded: ${summary.items.created} items created, ${summary.items.updated} updated, ${summary.recipes.created + summary.recipes.updated} recipes processed.`
    );
    return summary;
  }

  return {
    SYSTEM_ID,
    DND5E_EQUIPMENT24_SRD_ITEMS,
    SRD_WEAPONS,
    SRD_ARMOUR,
    MYTHWRIGHT_GATHERING_TOOL_DEFINITIONS,
    MYTHWRIGHT_TOOL_REPAIR_MATERIALS,
    ELEMENTAL_VARIANTS,
    ELEMENTAL_QUALITY,
    APPROVED_MYTHWRIGHT_ICON_PATHS,
    normalizeName,
    idFromName,
    folderPath,
    findFolderByPath,
    compendiumPackIdFromUuid,
    compendiumDocumentIdFromUuid,
    resolveCompendiumDocument,
    sanitizeIconPath,
    stripSourceIdentity,
    itemPayload,
    componentFromItem,
    qualityVariantIdsForTarget,
    cleanupQualityVariantDuplicates,
    obsoleteQualityVariantIdsForTarget,
    cleanupObsoleteQualityVariants,
    classifySrdItem,
    discoverSrdItems,
    buildRecipeForSrd,
    buildRelicRecipe,
    buildElementalRecipe,
    buildGatheringTools,
    buildGatheringTasks,
    srdComponentIdsFromMap,
    validateGatheringTaskDrops,
    buildToolRepairRecipes,
    seedGatheringConfig,
    buildRecipePayloads,
    buildImportPayload,
    importMythwrightPayload,
    elementalQualityById,
    elementalVariantQualityId,
    elementalVariantQualityName,
    elementalQualityVariantDefinitions,
    elementalVariantPayload,
    srdRecipeDescription,
    relicRecipeDescription,
    elementalRecipeDescription,
    mythwrightItemDescription,
    tagsForComponent,
    itemTagsForSystem,
    buildSystemPayload,
    buildEnvironment,
    run
  };
})();

globalThis.MythwrightDnd5eBootstrap = MythwrightDnd5eBootstrap;

if (globalThis.game?.ready && globalThis.game?.user?.isGM && globalThis.game?.fabricate?.ready) {
  await MythwrightDnd5eBootstrap.run();
}
