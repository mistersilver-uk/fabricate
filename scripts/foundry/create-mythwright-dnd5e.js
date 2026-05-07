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
    'Mythwright > Armour > Mundane',
    'Mythwright > Armour > Quality',
    'Mythwright > Relics',
    'Mythwright > Tools & Catalysts'
  ];

  const QUALITY = ['Flawed', 'Standard', 'Fine', 'Masterwork', 'Mythic'];
  const ESSENCES = [
    { id: 'ember', name: 'Ember Essence', icon: 'fas fa-fire' },
    { id: 'frost', name: 'Frost Essence', icon: 'fas fa-snowflake' },
    { id: 'storm', name: 'Storm Essence', icon: 'fas fa-bolt' },
    { id: 'radiance', name: 'Radiance Essence', icon: 'fas fa-sun' },
    { id: 'shadow', name: 'Shadow Essence', icon: 'fas fa-moon' },
    { id: 'dragon', name: 'Dragon Essence', icon: 'fas fa-dragon' }
  ];

  const BASE_ITEMS = [
    ['raw-ore', 'Raw Ore', 'Mythwright > Ingredients > Mundane', 'icons/commodities/stone/ore-pile-grey.webp'],
    ['hardwood', 'Hardwood', 'Mythwright > Ingredients > Mundane', 'icons/commodities/wood/wood-pile.webp'],
    ['cured-hide', 'Cured Hide', 'Mythwright > Ingredients > Mundane', 'icons/commodities/leather/leather-bolt-tan.webp'],
    ['iron-ingot', 'Iron Ingot', 'Mythwright > Ingredients > Mundane', 'icons/commodities/metal/ingot-stamped-silver.webp'],
    ['weapon-core', 'Weapon Core', 'Mythwright > Components > Weapon Parts', 'icons/commodities/metal/ingot-steel.webp'],
    ['balanced-hilt', 'Balanced Hilt', 'Mythwright > Components > Weapon Parts', 'icons/weapons/swords/sword-hilt-steel.webp'],
    ['bow-stave', 'Bow Stave', 'Mythwright > Components > Weapon Parts', 'icons/weapons/bows/shortbow-recurve.webp'],
    ['armour-plates', 'Armour Plates', 'Mythwright > Components > Armour Parts', 'icons/equipment/chest/breastplate-layered-steel.webp'],
    ['reinforced-straps', 'Reinforced Straps', 'Mythwright > Components > Armour Parts', 'icons/equipment/waist/belt-buckle-square.webp'],
    ['monster-trophy', 'Monster Trophy', 'Mythwright > Gathered components', 'icons/commodities/bones/horn-simple-grey.webp'],
    ['ancient-fragment', 'Ancient Fragment', 'Mythwright > Gathered components', 'icons/commodities/stone/stone-pieces-grey.webp'],
    ['dragon-scale', 'Dragon Scale', 'Mythwright > Gathered components', 'icons/commodities/materials/scales-red.webp'],
    ['artisan-catalyst', 'Artisan Catalyst', 'Mythwright > Tools & Catalysts', 'icons/tools/smithing/anvil.webp'],
    ['mythic-catalyst', 'Mythic Catalyst', 'Mythwright > Tools & Catalysts', 'icons/magic/symbols/rune-sigil-gold.webp']
  ];

  const RELICS = [
    ['relic-mythic-longsword', 'Mythwright Mythic Longsword', 'Mythwright > Relics', 'icons/weapons/swords/greatsword-blue.webp'],
    ['relic-draconic-scale-mail', 'Draconic Scale Mail', 'Mythwright > Relics', 'icons/equipment/chest/breastplate-scale-red.webp'],
    ['relic-storm-bow', 'Storm-Forged Bow', 'Mythwright > Relics', 'icons/weapons/bows/longbow-recurve-blue.webp'],
    ['relic-radiant-shield', 'Radiant Shield', 'Mythwright > Relics', 'icons/equipment/shield/heater-steel-gold.webp'],
    ['relic-shadow-dagger', 'Shadow Dagger', 'Mythwright > Relics', 'icons/weapons/daggers/dagger-guard-black.webp']
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

  function itemPayload({ id, name, folder, img, type = 'loot', source = null }) {
    const sourceObject = source?.toObject?.() || {};
    const payload = {
      ...sourceObject,
      name: source?.name || name,
      type: source?.type || type,
      img: source?.img || img || 'icons/svg/item-bag.svg',
      folder: folder?.id || null,
      system: {
        ...(sourceObject.system || {}),
        quantity: Number(sourceObject.system?.quantity || 1)
      },
      flags: {
        ...(sourceObject.flags || {}),
        core: {
          ...(sourceObject.flags?.core || {}),
          sourceId: source?.uuid || sourceObject.flags?.core?.sourceId || null
        },
        fabricate: {
          ...(sourceObject.flags?.fabricate || {}),
          mythwrightId: id
        }
      }
    };
    if (!payload.flags.core.sourceId) delete payload.flags.core.sourceId;
    return payload;
  }

  async function ensureWorldItem(definition, foldersByPath, summary) {
    const [id, name, path, img, type = 'loot', source = null] = definition;
    const folder = foldersByPath.get(path) || await ensureFolderPath(path, { summary });
    foldersByPath.set(path, folder);
    const payload = itemPayload({ id, name, folder, img, type, source });
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
    return {
      id,
      name: item.name,
      description: '',
      img: item.img || 'icons/svg/item-bag.svg',
      sourceUuid: item.uuid || null,
      sourceItemUuid: item.flags?.core?.sourceId || item.uuid || null,
      fallbackItemIds: [],
      tags: extra.tags || [],
      difficulty: extra.difficulty || 1,
      salvage: extra.salvage || { enabled: false }
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
      img: target.item?.img || 'icons/svg/item-bag.svg',
      category: target.type === 'weapon' ? 'Weapons' : 'Armour',
      craftingSystemId: SYSTEM_ID,
      system: 'dnd5e',
      tags: ['mythwright', target.type, 'srd'],
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
          resultGroups: QUALITY.map(quality => resultGroup(
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
      img: 'icons/svg/mystery-man.svg',
      category: 'Relics',
      craftingSystemId: SYSTEM_ID,
      system: 'dnd5e',
      tags: ['mythwright', 'relic'],
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
          resultGroups: [
            resultGroup('flawed', 'Flawed', relicId),
            resultGroup('standard', 'Standard', relicId),
            resultGroup('fine', 'Fine', relicId),
            resultGroup('masterwork', 'Masterwork', relicId),
            resultGroup('mythic', 'Mythic', relicId)
          ]
        }
      ]
    };
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
return { success: true, outcome: 'mythic', value: total, data: {} };`;
  }

  async function ensureMacro(summary) {
    const existing = collectionValues(globalThis.game?.macros).find(macro => macro.name === MACRO_NAME);
    const payload = { name: MACRO_NAME, type: 'script', command: macroCommand(), img: 'icons/tools/smithing/anvil.webp' };
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
      items: { created: 0, updated: 0 },
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

    const worldItems = new Map();
    for (const def of BASE_ITEMS) {
      const item = await ensureWorldItem(def, foldersByPath, summary);
      worldItems.set(def[0], item);
    }
    for (const essence of ESSENCES) {
      const item = await ensureWorldItem(
        [essence.id, essence.name, 'Mythwright > Essences', 'icons/magic/symbols/rune-sigil-blue.webp'],
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
        summary
      );
      worldItems.set(componentId, item);

      for (const quality of QUALITY.filter(entry => entry !== 'Standard')) {
        const qualityId = idFromName(`${target.type}-${quality.toLowerCase()}`, target.name);
        const qualityFolder = target.type === 'weapon' ? 'Mythwright > Weapons > Quality' : 'Mythwright > Armour > Quality';
        const qualityItem = await ensureWorldItem(
          [qualityId, `${quality} ${target.name}`, qualityFolder, target.item?.img, itemTypeForName(target.name), target.item],
          foldersByPath,
          summary
        );
        worldItems.set(qualityId, qualityItem);
      }
    }

    const macro = await ensureMacro(summary);
    const systemManager = globalThis.game.fabricate.getCraftingSystemManager();
    const recipeManager = globalThis.game.fabricate.getRecipeManager();
    const environmentStore = globalThis.game.fabricate.getGatheringEnvironmentStore?.();

    const components = Array.from(worldItems.entries()).map(([id, item]) => componentFromItem(id, item, {
      tags: ['mythwright'],
      difficulty: QUALITY.some(quality => item.name?.startsWith(`${quality} `)) ? 5 : 1,
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
      itemTags: ['mythwright', 'weapon', 'armor', 'relic', 'component', 'essence', 'srd'],
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
    normalizeName,
    idFromName,
    folderPath,
    findFolderByPath,
    itemPayload,
    classifySrdItem,
    discoverSrdItems,
    buildRecipeForSrd,
    buildRelicRecipe,
    run
  };
})();

globalThis.MythwrightDnd5eBootstrap = MythwrightDnd5eBootstrap;

if (globalThis.game?.ready && globalThis.game?.user?.isGM && globalThis.game?.fabricate?.ready) {
  await MythwrightDnd5eBootstrap.run();
}
