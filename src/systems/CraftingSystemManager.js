/**
 * Manages crafting systems and their item libraries
 */
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

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
    const rawManagedItems = Array.isArray(system.components) ? system.components : (Array.isArray(system.managedItems) ? system.managedItems : system.items);
    const items = Array.isArray(rawManagedItems)
      ? rawManagedItems.map(i => this._normalizeComponent(i, essenceIds, features.salvage))
      : [];
    const itemIds = new Set(items.map(i => i.id));

    const resolvedEssenceDefinitions = essenceDefinitions.map(def => {
      // sourceItemUuid is authoritative; associatedSystemItemId is the transitional alias.
      // Resolve against the actual managed item IDs so stale UUIDs are cleared.
      const resolvedItemId = itemIds.has(def.sourceItemUuid) ? def.sourceItemUuid : null;
      return {
        ...def,
        sourceItemUuid: resolvedItemId,
        associatedSystemItemId: resolvedItemId  // transitional alias kept in sync
      };
    });

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
      salvageResolutionMode: ['simple', 'tiered', 'progressive'].includes(system.salvageResolutionMode)
        ? system.salvageResolutionMode
        : 'simple',
      salvageCraftingCheck: this._normalizeSalvageCraftingCheck(system.salvageCraftingCheck),

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
      components: items,
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
      outcomeRouting: has('outcomeRouting') ? features.outcomeRouting === true : false,
      effectTransfer: has('effectTransfer') ? features.effectTransfer === true : false,
      salvage: has('salvage') ? features.salvage === true : false,
      chatOutput: has('chatOutput') ? features.chatOutput === true : true
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

  _normalizeSalvageCraftingCheck(check = {}) {
    if (!check || typeof check !== 'object') check = {};
    const outcomes = Array.isArray(check.outcomes) ? check.outcomes : [];
    const normalizedOutcomes = outcomes
      .map(o => String(o || '').trim().toLowerCase())
      .filter(Boolean);

    return {
      enabled: check.enabled === true || !!check.macroUuid,
      macroUuid: check.macroUuid || null,
      successMacroUuid: check.successMacroUuid || null,
      failureMacroUuid: check.failureMacroUuid || null,
      consumption: {
        consumeComponentOnFail: check.consumption?.consumeComponentOnFail !== false,
        consumeCatalystsOnFail: check.consumption?.consumeCatalystsOnFail === true
      },
      progressive: {
        awardMode: ['partial', 'equal', 'exceed'].includes(check.progressive?.awardMode)
          ? check.progressive.awardMode
          : 'equal',
        allowPlayerReorder: check.progressive?.allowPlayerReorder === true
      },
      outcomes: normalizedOutcomes.length > 0
        ? Array.from(new Set(normalizedOutcomes))
        : ['fail', 'pass']
    };
  }

  _normalizeRecipeVisibility(recipeVisibility = {}) {
    const listMode = ['global', 'player', 'knowledge'].includes(recipeVisibility?.listMode)
      ? recipeVisibility.listMode
      : 'global';
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
        icon: 'fas fa-mortar-pestle',
        sourceItemUuid: null,
        associatedSystemItemId: null  // transitional alias
      };
    }

    if (!entry || typeof entry !== 'object') return null;

    const rawName = String(entry.name || '').trim();
    const rawId = String(entry.id || '').trim().toLowerCase();
    const seed = rawId || rawName;
    if (!seed) return null;

    const id = this._uniqueKey(seed, usedIds);
    // sourceItemUuid is authoritative; fall back to associatedSystemItemId for legacy data.
    const resolvedSourceItemUuid = entry.sourceItemUuid || entry.associatedSystemItemId || null;
    return {
      id,
      name: rawName || id,
      description: String(entry.description || '').trim(),
      icon: String(entry.icon || '').trim() || 'fas fa-mortar-pestle',
      sourceItemUuid: resolvedSourceItemUuid,
      associatedSystemItemId: resolvedSourceItemUuid  // transitional alias
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

  _normalizeComponent(item = {}, validEssenceIds = null, salvageEnabled = false) {
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
      difficulty: Number.isFinite(difficulty) && difficulty >= 1 ? Math.floor(difficulty) : undefined,
      ...(salvageEnabled ? { salvage: this._normalizeSalvage(item.salvage) } : {})
    };
  }

  _normalizeSalvage(salvage = {}) {
    if (!salvage || typeof salvage !== 'object') {
      return {
        enabled: false,
        ingredientQuantity: 1,
        catalysts: [],
        resultGroups: []
      };
    }

    const rawQty = Number(salvage.ingredientQuantity);
    const ingredientQuantity = Number.isFinite(rawQty) && rawQty >= 1
      ? Math.floor(rawQty)
      : 1;

    return {
      enabled: salvage.enabled === true,
      ingredientQuantity,
      catalysts: Array.isArray(salvage.catalysts)
        ? salvage.catalysts.map(c => this._normalizeSalvageCatalyst(c)).filter(Boolean)
        : [],
      resultGroups: Array.isArray(salvage.resultGroups)
        ? salvage.resultGroups.map(g => this._normalizeSalvageResultGroup(g)).filter(Boolean)
        : [],
      ...(salvage.outcomeRouting && typeof salvage.outcomeRouting === 'object'
        ? { outcomeRouting: { ...salvage.outcomeRouting } }
        : {}),
      ...(salvage.timeRequirement && typeof salvage.timeRequirement === 'object'
        ? { timeRequirement: this._normalizeTimeRequirement(salvage.timeRequirement) }
        : {}),
      ...(salvage.currencyRequirement && typeof salvage.currencyRequirement === 'object'
        ? { currencyRequirement: this._normalizeCurrencyRequirement(salvage.currencyRequirement) }
        : {})
    };
  }

  _normalizeSalvageCatalyst(catalyst) {
    if (!catalyst || typeof catalyst !== 'object') return null;
    const compId = catalyst.componentId || catalyst.systemItemId;
    if (!compId) return null;
    return {
      componentId: compId,
      systemItemId: compId, // transitional alias
      degradesOnUse: catalyst.degradesOnUse === true,
      destroyWhenExhausted: catalyst.destroyWhenExhausted === true,
      maxUses: Number.isFinite(Number(catalyst.maxUses)) && catalyst.maxUses !== null
        ? Number(catalyst.maxUses)
        : null
    };
  }

  _normalizeSalvageResult(result) {
    if (!result || typeof result !== 'object') return null;
    const compId = result.componentId || result.systemItemId;
    return {
      id: result.id || foundry.utils.randomID(),
      componentId: compId || null,
      systemItemId: compId || null, // transitional alias
      quantity: (Number.isFinite(Number(result.quantity)) && Number(result.quantity) >= 1)
        ? Number(result.quantity)
        : 1,
      propertyMacroUuid: result.propertyMacroUuid || null
    };
  }

  _normalizeSalvageResultGroup(group) {
    if (!group || typeof group !== 'object') return null;
    const results = Array.isArray(group.results)
      ? group.results.map(r => this._normalizeSalvageResult(r)).filter(Boolean)
      : [];
    return {
      id: group.id || foundry.utils.randomID(),
      name: String(group.name || '').trim() || 'Result Group',
      results
    };
  }

  _normalizeTimeRequirement(time) {
    if (!time || typeof time !== 'object') return {};
    const result = {};
    for (const key of ['minutes', 'hours', 'days', 'months', 'years']) {
      const val = Number(time[key]);
      if (Number.isFinite(val) && val > 0) {
        result[key] = val;
      }
    }
    return result;
  }

  _normalizeCurrencyRequirement(currency) {
    if (!currency || typeof currency !== 'object') return {};
    const amount = Number(currency.amount);
    return {
      unit: String(currency.unit || '').trim() || 'gp',
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0
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
    const managedItems = Array.isArray(system.components) ? system.components : (Array.isArray(system.managedItems) ? system.managedItems : (system.items || []));
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

    // Path 1: Mode change -- disable invalid salvage configs
    const oldMode = current.salvageResolutionMode || 'simple';
    const disabledComponents = this._disableInvalidSalvageConfigs(merged, oldMode);
    if (disabledComponents.length > 0) {
      const names = disabledComponents.join(', ');
      ui?.notifications?.warn?.(
        `Fabricate | Salvage disabled for ${disabledComponents.length} component(s) incompatible with new mode: ${names}`
      );
    }

    // Path 2: Feature disable -- clean up salvage run history
    const oldSalvageEnabled = current.features?.salvage === true;
    const newSalvageEnabled = merged.features?.salvage === true;
    if (oldSalvageEnabled && !newSalvageEnabled) {
      await this._cleanupSalvageRunsForSystem(systemId);
    }

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
    const item = this._normalizeComponent(data, validEssenceIds, system.features?.salvage === true);
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
    const item = this._normalizeComponent({
      name: source?.name || itemUuid.split('.').pop() || 'Imported Item',
      img: source?.img || 'icons/svg/item-bag.svg',
      sourceUuid: itemUuid
    }, validEssenceIds, system.features?.salvage === true);

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
    system.items[idx] = this._normalizeComponent(
      { ...system.items[idx], ...updates, id: itemId },
      validEssenceIds,
      system.features?.salvage === true
    );
    await this.save();
    return system.items[idx];
  }

  async deleteItem(systemId, itemId) {
    this._assertGM('delete system item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const managedItems = Array.isArray(system.components) ? system.components : (Array.isArray(system.managedItems) ? system.managedItems : (system.items || []));
    const before = managedItems.length;
    const filteredItems = managedItems.filter(i => i.id !== itemId);
    if (filteredItems.length === before) return false;
    system.items = filteredItems;
    system.components = filteredItems;
    system.managedItems = filteredItems;

    // Clear essence source-item links that pointed to the deleted managed item.
    const essenceDefinitions = (system.essenceDefinitions || []).map(def => ({
      ...def,
      sourceItemUuid: def.sourceItemUuid === itemId ? null : def.sourceItemUuid,
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
              ((ing.match?.type === 'component' || ing.match?.type === 'systemItem') ? (ing.match.componentId || ing.match.systemItemId) : (ing.componentId || ing.systemItemId)) !== itemId
            )
          })).filter(group => (group.options || []).length > 0),
          ingredients: (set.ingredients || []).filter(ing => (ing.componentId || ing.systemItemId) !== itemId),
          catalysts: (set.catalysts || []).filter(cat => (cat.componentId || cat.systemItemId) !== itemId)
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

      updated.catalysts = (updated.catalysts || []).filter(cat => (cat.componentId || cat.systemItemId) !== itemId);
      updated.resultGroups = (updated.resultGroups || [])
        .map(group => ({
          ...group,
          results: (group.results || []).filter(res => (res.componentId || res.systemItemId) !== itemId)
        }))
        .filter(group => (group.results || []).length > 0);
      updated.results = (updated.results || []).filter(res => (res.componentId || res.systemItemId) !== itemId);

      const hasResults = (updated.resultGroups?.length || 0) > 0 || (updated.results?.length || 0) > 0;
      if (updated.ingredientSets.length === 0 || !hasResults) {
        updated.enabled = false;
      }

      await this.recipeManager.updateRecipe(recipe.id, updated);
    }

    // Clean up salvage runs referencing the deleted component
    await this._cleanupSalvageRunsForComponent(itemId);

    await this.save();
    return true;
  }

  /**
   * Returns the ResolutionModeService instance from game.fabricate, or null.
   * @returns {object|null}
   */
  _getResolutionModeService() {
    return game.fabricate?.getResolutionModeService?.() || null;
  }

  /**
   * For each component with salvage.enabled=true, validate it against the new mode
   * using ResolutionModeService. Disable any that are invalid and return their names.
   * Mutates system.components in-place.
   * @param {object} system - Normalised system object (post-update)
   * @param {string} oldMode - The previous salvageResolutionMode
   * @returns {string[]} Names of disabled components
   */
  _disableInvalidSalvageConfigs(system, oldMode) {
    if (!system.features?.salvage) return [];
    if (system.salvageResolutionMode === oldMode) return [];

    const resolutionService = this._getResolutionModeService();
    if (!resolutionService) return [];

    const disabled = [];
    const items = Array.isArray(system.components) ? system.components : [];
    for (const item of items) {
      if (!item.salvage?.enabled) continue;
      const validation = resolutionService.validateSalvage(item, system);
      if (!validation.valid) {
        item.salvage.enabled = false;
        disabled.push(item.name || item.id);
      }
    }
    return disabled;
  }

  /**
   * Remove salvage run history entries for a given system from all actors' flags.
   * Called when features.salvage is set to false.
   * @param {string} systemId
   */
  async _cleanupSalvageRunsForSystem(systemId) {
    for (const actor of game.actors || []) {
      const existing = getFabricateFlag(actor, 'salvageRuns', null);
      if (!existing) continue;
      const history = Array.isArray(existing.history) ? existing.history : [];
      const filtered = history.filter(r => r.craftingSystemId !== systemId);
      if (filtered.length !== history.length) {
        await setFabricateFlag(actor, 'salvageRuns', { ...existing, history: filtered });
      }
    }
  }

  /**
   * Remove salvage run history entries referencing a deleted component from all actors' flags.
   * Called when a component is deleted.
   * @param {string} componentId
   */
  async _cleanupSalvageRunsForComponent(componentId) {
    for (const actor of game.actors || []) {
      const existing = getFabricateFlag(actor, 'salvageRuns', null);
      if (!existing) continue;
      const history = Array.isArray(existing.history) ? existing.history : [];
      const filtered = history.filter(r => r.componentId !== componentId);
      if (filtered.length !== history.length) {
        await setFabricateFlag(actor, 'salvageRuns', { ...existing, history: filtered });
      }
    }
  }
}
