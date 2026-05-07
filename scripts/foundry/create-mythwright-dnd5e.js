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
  const APPROVED_MYTHWRIGHT_ICON_PATHS = Object.freeze([
    DEFAULT_ITEM_ICON
  ]);
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
  const RELIC_QUALITY = ['Flawed', 'Standard', 'Fine', 'Masterwork', 'Mythic'];
  const ESSENCES = [
    { id: 'ember', name: 'Ember Essence', icon: 'fas fa-fire' },
    { id: 'frost', name: 'Frost Essence', icon: 'fas fa-snowflake' },
    { id: 'storm', name: 'Storm Essence', icon: 'fas fa-bolt' },
    { id: 'radiance', name: 'Radiance Essence', icon: 'fas fa-sun' },
    { id: 'shadow', name: 'Shadow Essence', icon: 'fas fa-moon' },
    { id: 'dragon', name: 'Dragon Essence', icon: 'fas fa-dragon' }
  ];

  const ELEMENTAL_VARIANTS = [
    { id: 'weapon-ember-shortsword', name: 'Ember Shortsword', baseName: 'Shortsword', type: 'weapon', essenceId: 'ember', damageType: 'fire' },
    { id: 'weapon-frost-longsword', name: 'Frost Longsword', baseName: 'Longsword', type: 'weapon', essenceId: 'frost', damageType: 'cold' },
    { id: 'weapon-storm-shortbow', name: 'Storm Shortbow', baseName: 'Shortbow', type: 'weapon', essenceId: 'storm', damageType: 'lightning' },
    { id: 'weapon-radiant-mace', name: 'Radiant Mace', baseName: 'Mace', type: 'weapon', essenceId: 'radiance', damageType: 'radiant' },
    { id: 'weapon-shadow-dagger', name: 'Shadow Dagger', baseName: 'Dagger', type: 'weapon', essenceId: 'shadow', damageType: 'necrotic' },
    { id: 'weapon-dragon-greatsword', name: 'Dragon Greatsword', baseName: 'Greatsword', type: 'weapon', essenceId: 'dragon', damageType: 'fire' },
    { id: 'armor-ember-scale-mail', name: 'Ember Scale Mail', baseName: 'Scale Mail', type: 'armor', essenceId: 'ember', resistanceType: 'fire' },
    { id: 'armor-frost-chain-mail', name: 'Frost Chain Mail', baseName: 'Chain Mail', type: 'armor', essenceId: 'frost', resistanceType: 'cold' },
    { id: 'armor-storm-shield', name: 'Storm Shield', baseName: 'Shield', type: 'armor', essenceId: 'storm', resistanceType: 'lightning' },
    { id: 'armor-radiant-shield', name: 'Radiant Shield', baseName: 'Shield', type: 'armor', essenceId: 'radiance', resistanceType: 'radiant' },
    { id: 'armor-shadow-leather-armor', name: 'Shadow Leather Armor', baseName: 'Leather Armor', type: 'armor', essenceId: 'shadow', resistanceType: 'necrotic' },
    { id: 'armor-dragon-scale-mail', name: 'Dragon Scale Mail', baseName: 'Scale Mail', type: 'armor', essenceId: 'dragon', resistanceType: 'fire' }
  ];

  const BASE_ITEMS = [
    ['raw-ore', 'Raw Ore', 'Mythwright > Ingredients > Mundane', DEFAULT_ITEM_ICON],
    ['hardwood', 'Hardwood', 'Mythwright > Ingredients > Mundane', DEFAULT_ITEM_ICON],
    ['cured-hide', 'Cured Hide', 'Mythwright > Ingredients > Mundane', DEFAULT_ITEM_ICON],
    ['iron-ingot', 'Iron Ingot', 'Mythwright > Ingredients > Mundane', DEFAULT_ITEM_ICON],
    ['weapon-core', 'Weapon Core', 'Mythwright > Components > Weapon Parts', DEFAULT_ITEM_ICON],
    ['balanced-hilt', 'Balanced Hilt', 'Mythwright > Components > Weapon Parts', DEFAULT_ITEM_ICON],
    ['bow-stave', 'Bow Stave', 'Mythwright > Components > Weapon Parts', DEFAULT_ITEM_ICON],
    ['armour-plates', 'Armour Plates', 'Mythwright > Components > Armour Parts', DEFAULT_ITEM_ICON],
    ['reinforced-straps', 'Reinforced Straps', 'Mythwright > Components > Armour Parts', DEFAULT_ITEM_ICON],
    ['monster-trophy', 'Monster Trophy', 'Mythwright > Gathered components', DEFAULT_ITEM_ICON],
    ['ancient-fragment', 'Ancient Fragment', 'Mythwright > Gathered components', DEFAULT_ITEM_ICON],
    ['dragon-scale', 'Dragon Scale', 'Mythwright > Gathered components', DEFAULT_ITEM_ICON],
    ['artisan-catalyst', 'Artisan Catalyst', 'Mythwright > Tools & Catalysts', DEFAULT_ITEM_ICON],
    ['mythic-catalyst', 'Mythic Catalyst', 'Mythwright > Tools & Catalysts', DEFAULT_ITEM_ICON]
  ];

  const RELICS = [
    ['relic-mythic-longsword', 'Mythwright Mythic Longsword', 'Mythwright > Relics', DEFAULT_ITEM_ICON],
    ['relic-draconic-scale-mail', 'Draconic Scale Mail', 'Mythwright > Relics', DEFAULT_ITEM_ICON],
    ['relic-storm-bow', 'Storm-Forged Bow', 'Mythwright > Relics', DEFAULT_ITEM_ICON],
    ['relic-radiant-shield', 'Radiant Shield', 'Mythwright > Relics', DEFAULT_ITEM_ICON],
    ['relic-shadow-dagger', 'Shadow Dagger', 'Mythwright > Relics', DEFAULT_ITEM_ICON]
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

  function addElementalDamage(system = {}, damageType) {
    const damage = system.damage && typeof system.damage === 'object'
      ? { ...system.damage }
      : null;
    if (!damage || !Array.isArray(damage.parts)) {
      return {
        system: appendDescription(system, `This weapon deals an extra 1d4 ${damageType} damage on a hit.`),
        applied: false
      };
    }

    damage.parts = [...damage.parts, ['1d4', damageType]];
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
    const payload = itemPayload({
      id: definition.id,
      name: definition.name,
      folder,
      img: source?.img || DEFAULT_ITEM_ICON,
      type: itemTypeForName(definition.baseName, definition.type === 'weapon' ? 'weapon' : 'equipment'),
      source,
      preserveSourceIdentity: false,
      baseSourceId
    });

    payload.flags.fabricate = {
      ...(payload.flags.fabricate || {}),
      elemental: {
        essenceId: definition.essenceId,
        baseItemName: definition.baseName,
        ...(definition.damageType ? { damageType: definition.damageType } : {}),
        ...(definition.resistanceType ? { resistanceType: definition.resistanceType } : {})
      }
    };

    if (definition.damageType) {
      const damageResult = addElementalDamage(payload.system || {}, definition.damageType);
      payload.system = appendDescription(
        damageResult.system,
        `Mythwright elemental variant infused with ${definition.essenceId} essence.`
      );
      payload.flags.fabricate.elemental.damageApplied = damageResult.applied;
      return payload;
    }

    if (definition.resistanceType) {
      payload.system = appendDescription(
        payload.system || {},
        `While equipped, this item grants resistance to ${definition.resistanceType} damage.`
      );
      payload.effects = [
        ...(Array.isArray(payload.effects) ? payload.effects : []),
        resistanceEffect(definition.name, payload.img, definition.resistanceType)
      ];
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
      img: DEFAULT_ITEM_ICON,
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
    return {
      id: recipeId,
      name: `Infuse ${definition.name}`,
      description: `A focused elemental finishing recipe for ${definition.name}.`,
      img: DEFAULT_ITEM_ICON,
      category: definition.type === 'weapon' ? 'Weapons' : 'Armour',
      craftingSystemId: SYSTEM_ID,
      system: 'dnd5e',
      tags: [],
      enabled: true,
      transferEffects: true,
      resultSelection: { provider: 'ingredientSet' },
      steps: [{
        id: `${recipeId}-finish`,
        name: 'Elemental Finish',
        ingredientSets: [
          ingredientSet(`${recipeId}-finish-set`, [baseComponentId, 'artisan-catalyst'], 'standard', { [definition.essenceId]: 1 })
        ],
        resultSelection: { provider: 'ingredientSet' },
        resultGroups: [resultGroup('standard', 'Standard', definition.id)]
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
    const payload = { name: MACRO_NAME, type: 'script', command: macroCommand(), img: DEFAULT_ITEM_ICON };
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
        [essence.id, essence.name, 'Mythwright > Essences', DEFAULT_ITEM_ICON],
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
      const item = await ensureElementalVariant(definition, srdByName, foldersByPath, summary);
      if (item) worldItems.set(definition.id, item);
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
    const elementalBaseSourceById = new Map(ELEMENTAL_VARIANTS.map(definition => [
      definition.id,
      srdByName.get(normalizeName(definition.baseName))?.item?.uuid || null
    ]));
    const elementalDefinitions = new Map(ELEMENTAL_VARIANTS.map(definition => [definition.id, definition]));

    const components = Array.from(worldItems.entries()).map(([id, item]) => componentFromItem(id, item, {
      preserveSourceIdentity: !srdQualityComponentIds.has(id),
      mythwrightBaseSourceId: qualityBaseSourceById.get(id) || elementalBaseSourceById.get(id) || null,
      tags: tagsForComponent(),
      difficulty: MUNDANE_QUALITY.some(quality => item.name?.startsWith(`${quality} `)) ? 5 : (elementalDefinitions.has(id) ? 7 : 1),
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
      if (componentMap.has(definition.id)) {
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
