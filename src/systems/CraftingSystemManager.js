/**
 * Manages crafting systems and their item libraries
 */
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';

export class CraftingSystemManager {
  constructor(recipeManager) {
    this.recipeManager = recipeManager;
    this.systems = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const saved = getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) || [];
    for (const system of saved) {
      const normalized = this._normalizeSystem(system);
      this.systems.set(normalized.id, normalized);
    }
    this.initialized = true;
  }

  _assertGM(action) {
    if (!game.user?.isGM) {
      throw new Error(`GM permissions required: ${action}`);
    }
  }

  _normalizeSystem(system = {}) {
    const features = this._normalizeFeatures(system);
    const essenceDefinitions = this._normalizeEssenceDefinitions(
      system.essenceDefinitions ?? system.essences
    );
    const essenceIds = new Set(essenceDefinitions.map(def => def.id));
    const rawManagedItems = Array.isArray(system.managedItems) ? system.managedItems : system.items;
    const items = Array.isArray(rawManagedItems)
      ? rawManagedItems.map(i => this._normalizeItem(i, essenceIds))
      : [];
    const itemIds = new Set(items.map(i => i.id));

    const resolvedEssenceDefinitions = essenceDefinitions.map(def => ({
      ...def,
      associatedSystemItemId: itemIds.has(def.associatedSystemItemId) ? def.associatedSystemItemId : null
    }));

    return {
      id: system.id || foundry.utils.randomID(),
      name: system.name || 'New Crafting System',
      description: system.description || '',
      enabled: system.enabled !== false,
      resolutionMode: ['simple', 'mapped', 'tiered', 'progressive'].includes(system.resolutionMode)
        ? system.resolutionMode
        : 'simple',
      difficulty: system.difficulty || {
        base: 10,
        tierWeight: 0,
        tagWeights: {},
        essenceWeights: {}
      },

      // New spec-first shape
      features,
      itemTags: this._normalizeStringList(system.itemTags ?? system.tags),
      recipeVisibility: this._normalizeRecipeVisibility(system.recipeVisibility),
      requirements: this._normalizeRequirements(system.requirements),
      essenceDefinitions: resolvedEssenceDefinitions,
      craftingCheck: this._normalizeCraftingCheck(system.craftingCheck),

      // Transitional aliases for existing UI code paths
      categories: this._normalizeStringList(system.categories),
      tags: this._normalizeStringList(system.tags ?? system.itemTags),
      essences: resolvedEssenceDefinitions.map(def => def.id),
      advancedOptionsEnabled: system.advancedOptionsEnabled !== false,
      enableTags: features.itemTags === true,
      enableEssences: features.essences === true,
      enableCategories: features.recipeCategories === true,
      enableMultiStepRecipes: features.multiStepRecipes === true,
      enableTiers: false,
      tiers: [],
      items,
      managedItems: items
    };
  }

  _normalizeFeatures(system = {}) {
    const features = system.features || {};
    const has = (k) => Object.prototype.hasOwnProperty.call(features, k);
    const categoryEnabled = has('recipeCategories')
      ? features.recipeCategories === true
      : (has('categories') ? features.categories === true : system.enableCategories === true);
    const multiStepEnabled = has('multiStepRecipes')
      ? features.multiStepRecipes === true
      : (has('complexRecipes') ? features.complexRecipes === true : false);
    return {
      recipeCategories: categoryEnabled,
      // Transitional alias
      categories: categoryEnabled,
      itemTags: has('itemTags') ? features.itemTags === true : system.enableTags === true,
      essences: has('essences') ? features.essences === true : system.enableEssences === true,
      complexRecipes: has('complexRecipes') ? features.complexRecipes === true : false,
      multiStepRecipes: multiStepEnabled,
      propertyMacros: has('propertyMacros') ? features.propertyMacros === true : false,
      craftingChecks: has('craftingChecks') ? features.craftingChecks === true : false,
      outcomeRouting: has('outcomeRouting') ? features.outcomeRouting === true : false
    };
  }

  _normalizeCraftingCheck(check = {}) {
    const mode = check?.mode === 'tiered' ? 'tiered' : 'passFail';
    const outcomes = Array.isArray(check?.outcomes) ? check.outcomes : [];
    const normalizedOutcomes = outcomes
      .map(o => String(o || '').trim().toLowerCase())
      .filter(Boolean);

    return {
      enabled: check?.enabled === true || !!check?.macroUuid,
      mode,
      macroUuid: check?.macroUuid || null,
      successMacroUuid: check?.successMacroUuid || null,
      failureMacroUuid: check?.failureMacroUuid || null,
      consumption: {
        consumeIngredientsOnFail: check?.consumption?.consumeIngredientsOnFail !== false,
        consumeCatalystsOnFail: check?.consumption?.consumeCatalystsOnFail === true
      },
      progressive: {
        awardMode: ['partial', 'equal', 'exceed'].includes(check?.progressive?.awardMode)
          ? check.progressive.awardMode
          : 'equal',
        allowPlayerReorder: check?.progressive?.allowPlayerReorder === true
      },
      outcomes: normalizedOutcomes.length > 0
        ? Array.from(new Set(normalizedOutcomes))
        : (mode === 'tiered' ? ['low', 'high'] : ['fail', 'pass'])
    };
  }

  _normalizeRecipeVisibility(recipeVisibility = {}) {
    const listMode = recipeVisibility?.listMode === 'knowledge' ? 'knowledge' : 'player';
    const knowledge = recipeVisibility?.knowledge || {};
    return {
      listMode,
      knowledge: {
        mode: ['item', 'learned', 'itemOrLearned'].includes(knowledge?.mode)
          ? knowledge.mode
          : 'itemOrLearned',
        item: {
          limitUses: knowledge?.item?.limitUses === true,
          maxUses: Number.isFinite(Number(knowledge?.item?.maxUses))
            ? Number(knowledge.item.maxUses)
            : undefined,
          destroyWhenExhausted: knowledge?.item?.destroyWhenExhausted === true
        },
        learn: {
          consumeOnLearn: knowledge?.learn?.consumeOnLearn !== false
        }
      }
    };
  }

  _normalizeRequirements(requirements = {}) {
    const time = requirements?.time || {};
    const currency = requirements?.currency || {};
    return {
      time: {
        enabled: time.enabled === true
      },
      currency: {
        enabled: currency.enabled === true,
        provider: currency.provider === 'system' ? 'system' : 'macro',
        systemAdapter: ['dnd5e', 'pf2e'].includes(currency.systemAdapter)
          ? currency.systemAdapter
          : undefined,
        checkCurrencyMacroUuid: currency.checkCurrencyMacroUuid || null,
        decrementCurrencyMacroUuid: currency.decrementCurrencyMacroUuid || null,
        formatCurrencyMacroUuid: currency.formatCurrencyMacroUuid || null
      }
    };
  }

  _normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value
      .map(v => String(v || '').trim())
      .filter(Boolean)));
  }

  _normalizeEssenceDefinitions(value) {
    if (!Array.isArray(value)) return [];

    const used = new Set();
    const normalized = [];
    for (const entry of value) {
      const def = this._normalizeEssenceDefinition(entry, used);
      if (!def) continue;
      used.add(def.id);
      normalized.push(def);
    }
    return normalized;
  }

  _normalizeEssenceDefinition(entry, usedIds = new Set()) {
    if (typeof entry === 'string') {
      const base = entry.trim();
      if (!base) return null;
      return {
        id: this._uniqueKey(base, usedIds),
        name: base,
        description: '',
        associatedSystemItemId: null
      };
    }

    if (!entry || typeof entry !== 'object') return null;

    const rawName = String(entry.name || '').trim();
    const rawId = String(entry.id || '').trim().toLowerCase();
    const seed = rawId || rawName;
    if (!seed) return null;

    const id = this._uniqueKey(seed, usedIds);
    return {
      id,
      name: rawName || id,
      description: String(entry.description || '').trim(),
      associatedSystemItemId: entry.associatedSystemItemId || null
    };
  }

  _uniqueKey(seed, usedIds) {
    const cleaned = this._toKey(seed);
    let key = cleaned || 'essence';
    let i = 2;
    while (usedIds.has(key)) {
      key = `${cleaned || 'essence'}-${i++}`;
    }
    return key;
  }

  _toKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  _normalizeItem(item = {}, validEssenceIds = null) {
    const difficulty = Number(item.difficulty);
    return {
      id: item.id || foundry.utils.randomID(),
      name: item.name || 'Unnamed Item',
      img: item.img || 'icons/svg/item-bag.svg',
      sourceItemUuid: item.sourceItemUuid || item.sourceUuid || null,
      // Transitional alias for current UI/engine references.
      sourceUuid: item.sourceUuid || item.sourceItemUuid || null,
      tier: item.tier || null,
      tags: Array.isArray(item.tags) ? item.tags : [],
      essences: this._normalizeEssenceQuantities(item.essences, validEssenceIds),
      difficulty: Number.isFinite(difficulty) && difficulty >= 1 ? Math.floor(difficulty) : undefined
    };
  }

  _normalizeEssenceQuantities(essences = {}, validEssenceIds = null) {
    const output = {};
    if (!essences || typeof essences !== 'object') return output;
    const validIds = validEssenceIds instanceof Set ? validEssenceIds : null;

    for (const [rawKey, rawValue] of Object.entries(essences)) {
      const key = String(rawKey || '').trim();
      if (!key) continue;
      if (validIds && !validIds.has(key)) continue;

      const qty = Number(rawValue);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      output[key] = qty;
    }
    return output;
  }

  async save() {
    const payload = Array.from(this.systems.values());
    await setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, payload);
  }

  getSystems() {
    return Array.from(this.systems.values());
  }

  getSystem(systemId) {
    return this.systems.get(systemId) || null;
  }

  getEssenceDefinitions(systemId) {
    const system = this.getSystem(systemId);
    if (!system) return [];
    return Array.isArray(system.essenceDefinitions) ? [...system.essenceDefinitions] : [];
  }

  getEssenceDefinition(systemId, essenceId) {
    const system = this.getSystem(systemId);
    if (!system || !essenceId) return null;
    return (system.essenceDefinitions || []).find(def => def.id === essenceId) || null;
  }

  getItems(systemId, search = '') {
    const system = this.getSystem(systemId);
    if (!system) return [];
    const managedItems = Array.isArray(system.managedItems) ? system.managedItems : (system.items || []);
    if (!search) return [...managedItems];
    const q = search.toLowerCase();
    return managedItems.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.sourceUuid || '').toLowerCase().includes(q)
    );
  }

  async createSystem(data = {}) {
    this._assertGM('create crafting system');
    const system = this._normalizeSystem(data);
    this.systems.set(system.id, system);
    await this.save();
    return system;
  }

  async updateSystem(systemId, updates = {}) {
    this._assertGM('update crafting system');
    const current = this.getSystem(systemId);
    if (!current) throw new Error(`Crafting system not found: ${systemId}`);

    const mergedFeatures = { ...(current.features || {}), ...(updates.features || {}) };
    if (Object.prototype.hasOwnProperty.call(updates, 'enableCategories')) {
      mergedFeatures.recipeCategories = updates.enableCategories === true;
      mergedFeatures.categories = updates.enableCategories === true;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'enableTags')) {
      mergedFeatures.itemTags = updates.enableTags === true;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'enableEssences')) {
      mergedFeatures.essences = updates.enableEssences === true;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'enableMultiStepRecipes')) {
      mergedFeatures.multiStepRecipes = updates.enableMultiStepRecipes === true;
    }

    const mergedInput = {
      ...current,
      ...updates,
      id: systemId,
      features: mergedFeatures,
      itemTags: Object.prototype.hasOwnProperty.call(updates, 'itemTags')
        ? updates.itemTags
        : (Object.prototype.hasOwnProperty.call(updates, 'tags') ? updates.tags : current.itemTags),
      essenceDefinitions: Object.prototype.hasOwnProperty.call(updates, 'essenceDefinitions')
        ? updates.essenceDefinitions
        : (Object.prototype.hasOwnProperty.call(updates, 'essences') ? updates.essences : current.essenceDefinitions)
    };

    const merged = this._normalizeSystem(mergedInput);
    this.systems.set(systemId, merged);
    await this.save();
    return merged;
  }

  async deleteSystem(systemId) {
    this._assertGM('delete crafting system');
    if (!this.systems.has(systemId)) {
      throw new Error(`Crafting system not found: ${systemId}`);
    }

    // Delete recipes that belong to this crafting system.
    const affected = this.recipeManager.getRecipes({ craftingSystemId: systemId });
    for (const recipe of affected) {
      await this.recipeManager.deleteRecipe(recipe.id);
    }

    this.systems.delete(systemId);
    await this.save();
  }

  async createItem(systemId, data = {}) {
    this._assertGM('create system item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const validEssenceIds = new Set((system.essenceDefinitions || []).map(def => def.id));
    const item = this._normalizeItem(data, validEssenceIds);
    system.items.push(item);
    await this.save();
    return item;
  }

  async addItemFromUuid(systemId, itemUuid) {
    this._assertGM('add system item from uuid');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const existing = system.items.find(i => i.sourceUuid === itemUuid);
    if (existing) return existing;

    let source = null;
    try {
      source = await fromUuid(itemUuid);
    } catch (err) {
      source = null;
    }

    const validEssenceIds = new Set((system.essenceDefinitions || []).map(def => def.id));
    const item = this._normalizeItem({
      name: source?.name || itemUuid.split('.').pop() || 'Imported Item',
      img: source?.img || 'icons/svg/item-bag.svg',
      sourceUuid: itemUuid
    }, validEssenceIds);

    system.items.push(item);
    await this.save();
    return item;
  }

  async updateItem(systemId, itemId, updates = {}) {
    this._assertGM('update system item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const idx = system.items.findIndex(i => i.id === itemId);
    if (idx < 0) throw new Error(`System item not found: ${itemId}`);
    const validEssenceIds = new Set((system.essenceDefinitions || []).map(def => def.id));
    system.items[idx] = this._normalizeItem({ ...system.items[idx], ...updates, id: itemId }, validEssenceIds);
    await this.save();
    return system.items[idx];
  }

  async deleteItem(systemId, itemId) {
    this._assertGM('delete system item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const managedItems = Array.isArray(system.managedItems) ? system.managedItems : (system.items || []);
    const before = managedItems.length;
    const filteredItems = managedItems.filter(i => i.id !== itemId);
    if (filteredItems.length === before) return false;
    system.items = filteredItems;
    system.managedItems = filteredItems;

    // Clear essence associated-item links that pointed to the deleted managed item.
    const essenceDefinitions = (system.essenceDefinitions || []).map(def => ({
      ...def,
      associatedSystemItemId: def.associatedSystemItemId === itemId ? null : def.associatedSystemItemId
    }));
    system.essenceDefinitions = essenceDefinitions;
    system.essences = essenceDefinitions.map(def => def.id);

    // Remove item references from recipes in this system and clean up empty groups.
    const recipes = this.recipeManager.getRecipes({}).filter(r => r.craftingSystemId === systemId);
    for (const recipe of recipes) {
      const updated = recipe.toJSON();
      updated.ingredientSets = (updated.ingredientSets || [])
        .map(set => ({
          ...set,
          ingredientGroups: (set.ingredientGroups || []).map(group => ({
            ...group,
            options: (group.options || []).filter(ing =>
              (ing.match?.type === 'systemItem' ? ing.match.systemItemId : ing.systemItemId) !== itemId
            )
          })).filter(group => (group.options || []).length > 0),
          ingredients: (set.ingredients || []).filter(ing => ing.systemItemId !== itemId),
          catalysts: (set.catalysts || []).filter(cat => cat.systemItemId !== itemId)
        }))
        .map(set => ({
          ...set,
          ingredients: (set.ingredientGroups || [])
            .map(group => group.options?.[0] || null)
            .filter(Boolean)
        }))
        .filter(set =>
          (set.ingredientGroups?.length || set.ingredients?.length || 0) > 0 ||
          Object.keys(set.essences || {}).length > 0
        );

      updated.catalysts = (updated.catalysts || []).filter(cat => cat.systemItemId !== itemId);
      updated.resultGroups = (updated.resultGroups || [])
        .map(group => ({
          ...group,
          results: (group.results || []).filter(res => res.systemItemId !== itemId)
        }))
        .filter(group => (group.results || []).length > 0);
      updated.results = (updated.results || []).filter(res => res.systemItemId !== itemId);

      const hasResults = (updated.resultGroups?.length || 0) > 0 || (updated.results?.length || 0) > 0;
      if (updated.ingredientSets.length === 0 || !hasResults) {
        updated.enabled = false;
      }

      await this.recipeManager.updateRecipe(recipe.id, updated);
    }

    await this.save();
    return true;
  }
}
