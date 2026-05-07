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
  const MACRO_NAME = 'Mythwright Crafting Check';
  const ROOT_FOLDER = 'Mythwright';
  const DEFAULT_ITEM_ICON = 'icons/svg/item-bag.svg';
  const MYTHWRIGHT_ICONS = Object.freeze({
    defaultItem: DEFAULT_ITEM_ICON,
    macro: 'icons/tools/smithing/anvil.webp',
    rawOre: 'icons/commodities/stone/ore-pile-grey.webp',
    hardwood: 'icons/commodities/wood/lumber-stack-brown.webp',
    curedHide: 'icons/commodities/leather/leather-bolt-tan.webp',
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

  const SRD_WEAPONS = [
    'Club', 'Dagger', 'Greatclub', 'Handaxe', 'Javelin', 'Light Hammer', 'Mace',
    'Quarterstaff', 'Sickle', 'Spear', 'Crossbow, Light', 'Dart', 'Shortbow',
    'Sling', 'Battleaxe', 'Flail', 'Glaive', 'Greataxe', 'Greatsword', 'Halberd',
    'Lance', 'Longsword', 'Maul', 'Morningstar', 'Pike', 'Rapier', 'Scimitar',
    'Shortsword', 'Trident', 'War Pick', 'Warhammer', 'Whip', 'Blowgun',
    'Crossbow, Hand', 'Crossbow, Heavy', 'Longbow', 'Net'
  ];

  const SRD_ARMOUR = [
    'Padded Armor', 'Leather Armor', 'Studded Leather Armor', 'Hide Armor',
    'Chain Shirt', 'Scale Mail', 'Breastplate', 'Half Plate Armor', 'Ring Mail',
    'Chain Mail', 'Splint Armor', 'Plate Armor', 'Shield'
  ];

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
    const payload = {
      ...sourceObject,
      name: name || source?.name || 'Unnamed Item',
      type: source?.type || type,
      img: sanitizeIconPath(source?.img || img || DEFAULT_ITEM_ICON, { allowExternal: !!source?.img }),
      folder: folder?.id || null,
      system: {
        ...(sourceObject.system || {}),
        quantity: Number(sourceObject.system?.quantity || 1)
      },
      flags: {
        ...(sourceObject.flags || {}),
        core: {
          ...(sourceObject.flags?.core || {}),
          sourceId: preserveSourceIdentity
            ? (source?.uuid || sourceObject.flags?.core?.sourceId || null)
            : null
        },
        fabricate: {
          ...(sourceObject.flags?.fabricate || {}),
          mythwrightId: id,
          ...(baseSourceId && !preserveSourceIdentity ? { mythwrightBaseSourceId: baseSourceId } : {})
        }
      }
    };
    if (!payload.flags.core.sourceId) delete payload.flags.core.sourceId;
    if (!preserveSourceIdentity) stripSourceIdentity(payload);
    return payload;
  }

  function elementalVariantPayload(definition, source, folder) {
    const baseSourceId = source?.uuid || source?.flags?.core?.sourceId || null;
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
        `${quality.name} Mythwright elemental variant infused with ${definition.essenceId} essence.`
      );
      payload.flags.fabricate.elemental.damageApplied = damageResult.applied;
      payload.flags.fabricate.elemental.damageFormula = quality.damage;
      return payload;
    }

    if (definition.resistanceType) {
      const defensiveText = quality.resistance
        ? `While equipped, this item grants resistance to ${definition.resistanceType} damage${quality.acBonus ? ` and a +${quality.acBonus} bonus to AC` : ''}.`
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
      ...SRD_WEAPONS.map(name => [normalizeName(name), { name, type: 'weapon', item: null }]),
      ...SRD_ARMOUR.map(name => [normalizeName(name), { name, type: 'armor', item: null }])
    ]);

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
    const sourceUuid = extra.preserveSourceIdentity === false ? null : (item.uuid || null);
    const sourceItemUuid = extra.preserveSourceIdentity === false
      ? null
      : (item.flags?.core?.sourceId || item.uuid || null);
    return {
      id,
      name: item.name,
      description: '',
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

  function buildRecipeForSrd(target, components) {
    const baseId = components.get(idFromName(target.type === 'weapon' ? 'weapon' : 'armor', target.name))?.id;
    const intermediate = target.type === 'weapon' ? 'weapon-core' : 'armour-plates';
    const finishInput = target.type === 'weapon' ? 'balanced-hilt' : 'reinforced-straps';
    const material = target.type === 'weapon' ? 'iron-ingot' : 'cured-hide';
    const recipeId = idFromName('mythwright-craft', target.name);
    return {
      id: recipeId,
      name: `Craft ${target.name}`,
      description: `Mythwright multi-step recipe for ${target.name}.`,
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
      description: `A signature Mythwright relic recipe for ${name}.`,
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
      description: `A focused elemental finishing recipe for ${definition.name}.`,
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

  function buildEnvironment(id, name, risk, tasks) {
    return {
      id,
      craftingSystemId: SYSTEM_ID,
      name,
      description: `${name} Mythwright gathering site.`,
      risk,
      economyMode: 'time',
      selectionMode: 'targeted',
      enabled: true,
      tasks: tasks.map(task => ({
        id: task.id,
        name: task.name,
        enabled: true,
        resolutionMode: 'routed',
        resultSelection: { provider: 'macroOutcome', macroUuid: task.macroUuid || '' },
        resultGroups: task.groups
      }))
    };
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

  async function upsertRecipe(recipeManager, data, summary) {
    const existing = recipeManager.getRecipe?.(data.id) || recipeManager.getRecipes?.({})?.find(recipe => recipe.id === data.id);
    if (existing) {
      await recipeManager.updateRecipe(data.id, data);
      summary.recipes.updated++;
      return;
    }
    await recipeManager.createRecipe(data);
    summary.recipes.created++;
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
      recipes: { created: 0, updated: 0 },
      environments: { created: 0, updated: 0 },
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
      const folderPathName = target.type === 'weapon' ? 'Mythwright > Weapons > Mundane' : 'Mythwright > Armour > Mundane';
      const componentId = idFromName(target.type, target.name);
      const item = await ensureWorldItem(
        [componentId, target.name, folderPathName, target.item?.img, itemTypeForName(target.name), target.item],
        foldersByPath,
        summary,
        { preserveSourceIdentity: true }
      );
      worldItems.set(componentId, item);

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
    const systemManager = globalThis.game.fabricate.getCraftingSystemManager();
    const recipeManager = globalThis.game.fabricate.getRecipeManager();
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

    const systemPayload = {
      id: SYSTEM_ID,
      name: SYSTEM_NAME,
      description: 'DnD5e-first Mythwright crafting seeded from SRD weapons and armour.',
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
        macroUuid: macro.uuid,
        mode: 'namedOutcomes',
        outcomes: ['flawed', 'standard', 'fine', 'masterwork', 'mythic'],
        consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false }
      },
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: {
        enabled: true,
        macroUuid: macro.uuid,
        outcomes: ['pass', 'fail'],
        consumption: { consumeComponentOnFail: true, consumeCatalystsOnFail: false }
      },
      essenceDefinitions: ESSENCES.map(essence => ({
        id: essence.id,
        name: essence.name,
        icon: essence.icon,
        sourceComponentId: essence.id,
        sourceItemUuid: worldItems.get(essence.id)?.uuid || null
      })),
      itemTags: itemTagsForSystem(),
      categories: ['Weapons', 'Armour', 'Relics'],
      components
    };

    if (systemManager.getSystem(SYSTEM_ID)) {
      await systemManager.updateSystem(SYSTEM_ID, systemPayload);
      summary.system = 'updated';
    } else {
      await systemManager.createSystem(systemPayload);
      summary.system = 'created';
    }

    const componentMap = new Map(components.map(component => [component.id, component]));
    for (const target of srd.resolved) {
      await upsertRecipe(recipeManager, buildRecipeForSrd(target, componentMap), summary);
    }
    for (const definition of ELEMENTAL_VARIANTS) {
      if (elementalQualityVariantDefinitions(definition).every(variant => componentMap.has(variant.id))) {
        await upsertRecipe(recipeManager, buildElementalRecipe(definition), summary);
      }
    }
    await upsertRecipe(recipeManager, buildRelicRecipe('relic-mythic-longsword', 'Mythwright Mythic Longsword', 'ember'), summary);
    await upsertRecipe(recipeManager, buildRelicRecipe('relic-draconic-scale-mail', 'Draconic Scale Mail', 'dragon'), summary);
    await upsertRecipe(recipeManager, buildRelicRecipe('relic-storm-bow', 'Storm-Forged Bow', 'storm'), summary);
    await upsertRecipe(recipeManager, buildRelicRecipe('relic-radiant-shield', 'Radiant Shield', 'radiance'), summary);
    await upsertRecipe(recipeManager, buildRelicRecipe('relic-shadow-dagger', 'Shadow Dagger', 'shadow'), summary);

    if (environmentStore) {
      const standardTask = (id, name, componentId) => ({
        id,
        name,
        macroUuid: macro.uuid,
        groups: [
          resultGroup('flawed', 'Flawed', componentId),
          resultGroup('standard', 'Standard', componentId),
          resultGroup('fine', 'Fine', componentId)
        ]
      });
      const environments = [
        buildEnvironment('mythwright-mines', 'Mythwright Mines', 'hazardous', [standardTask('mine-ore', 'Extract Ore', 'raw-ore')]),
        buildEnvironment('mythwright-wilds', 'Mythwright Wilds', 'safe', [standardTask('wild-hardwood', 'Harvest Hardwood', 'hardwood')]),
        buildEnvironment('mythwright-ruins', 'Mythwright Ruins', 'unsafe', [standardTask('ruin-fragment', 'Recover Ancient Fragments', 'ancient-fragment')]),
        buildEnvironment('mythwright-battlefields', 'Mythwright Battlefields', 'hazardous', [standardTask('battle-trophy', 'Scavenge Trophies', 'monster-trophy')]),
        buildEnvironment('mythwright-planar-sites', 'Mythwright Planar Sites', 'extreme', [standardTask('planar-essence', 'Bind Planar Essence', 'storm')]),
        buildEnvironment('mythwright-dragon-lairs', 'Mythwright Dragon Lairs', 'extreme', [standardTask('dragon-scale', 'Harvest Dragon Scale', 'dragon-scale')])
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
    SRD_WEAPONS,
    SRD_ARMOUR,
    ELEMENTAL_VARIANTS,
    ELEMENTAL_QUALITY,
    APPROVED_MYTHWRIGHT_ICON_PATHS,
    normalizeName,
    idFromName,
    folderPath,
    findFolderByPath,
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
    elementalQualityById,
    elementalVariantQualityId,
    elementalVariantQualityName,
    elementalQualityVariantDefinitions,
    elementalVariantPayload,
    tagsForComponent,
    itemTagsForSystem,
    run
  };
})();

globalThis.MythwrightDnd5eBootstrap = MythwrightDnd5eBootstrap;

if (globalThis.game?.ready && globalThis.game?.user?.isGM && globalThis.game?.fabricate?.ready) {
  await MythwrightDnd5eBootstrap.run();
}
