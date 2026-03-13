/**
 * Manages crafting systems and their item libraries
 */
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';
import { getSourceUuid, getComponentSourceReferences, getItemSourceReferences } from '../utils/sourceUuid.js';
import { normalizeCustomRecipeCategories } from '../utils/recipeCategories.js';

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
      // Resolve against the actual component IDs so stale UUIDs are cleared.
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
      resolutionMode: (function _normalizeResolutionMode(raw) {
        if (raw === 'cauldron') return 'alchemy'; // T-189: legacy alias
        return ['simple', 'mapped', 'tiered', 'progressive', 'alchemy'].includes(raw) ? raw : 'simple';
      })(system.resolutionMode),
      // New spec-first shape
      features,
      itemTags: this._normalizeStringList(system.itemTags ?? system.tags),
      recipeVisibility: this._normalizeRecipeVisibility(system.recipeVisibility),
      requirements: this._normalizeRequirements(system.requirements),
      essenceDefinitions: resolvedEssenceDefinitions,
      craftingCheck: this._normalizeCraftingCheck(system.craftingCheck),
      salvageResolutionMode: (function _normalizeSalvageResolutionMode(raw) {
        if (raw === 'tiered') return 'routed'; // legacy alias
        return ['simple', 'routed', 'progressive'].includes(raw) ? raw : 'simple';
      })(system.salvageResolutionMode),
      salvageCraftingCheck: this._normalizeSalvageCraftingCheck(system.salvageCraftingCheck),
      alchemy: this._normalizeAlchemyConfig(system.alchemy ?? system.cauldron, system.resolutionMode),
      teaserConfig: this._normalizeTeaserConfig(system.teaserConfig),

      // Transitional aliases for existing UI code paths
      categories: normalizeCustomRecipeCategories(system.categories),
      tags: this._normalizeStringList(system.tags ?? system.itemTags),
      essences: resolvedEssenceDefinitions.map(def => def.id),
      advancedOptionsEnabled: system.advancedOptionsEnabled !== false,
      enableTags: features.itemTags === true,
      enableEssences: features.essences === true,
      enableCategories: features.recipeCategories === true,
      enableMultiStepRecipes: features.multiStepRecipes === true,
      enableTiers: false,
      tiers: [],
      components: items
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
      chatOutput: has('chatOutput') ? features.chatOutput === true : true,
      itemPiles: has('itemPiles') ? features.itemPiles === true : false
    };
  }

  _normalizeCraftingCheck(check = {}) {
    const mode = check?.mode === 'tiered' || check?.mode === 'namedOutcomes' ? 'namedOutcomes' : 'passFail';
    const outcomes = Array.isArray(check?.outcomes) ? check.outcomes : [];
    const normalizedOutcomes = outcomes
      .map(o => String(o || '').trim().toLowerCase())
      .filter(Boolean);

    const checkSource = check?.checkSource === 'builtIn' ? 'builtIn' : 'macro';
    const builtIn = this._normalizeBuiltInCheck(check?.builtIn);

    return {
      enabled: check?.enabled === true || !!check?.macroUuid || checkSource === 'builtIn',
      mode,
      macroUuid: check?.macroUuid || null,
      successMacroUuid: check?.successMacroUuid || null,
      failureMacroUuid: check?.failureMacroUuid || null,
      checkSource,
      builtIn,
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
        : (mode === 'namedOutcomes' ? ['low', 'high'] : ['fail', 'pass'])
    };
  }

  _normalizeBuiltInCheck(config = {}) {
    const dc = Number(config?.dc);
    return {
      ability: String(config?.ability || '').trim().toLowerCase(),
      skill: String(config?.skill || '').trim().toLowerCase(),
      dc: Number.isFinite(dc) && dc >= 1 ? Math.floor(dc) : 15,
      advantage: ['advantage', 'disadvantage', 'normal'].includes(config?.advantage)
        ? config.advantage
        : 'normal'
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
    const listMode = ['global', 'player', 'knowledge', 'teaser'].includes(recipeVisibility?.listMode)
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

  _normalizeTeaserConfig(config = {}) {
    if (!config || typeof config !== 'object') {
      return { enabled: false, discoveryMode: 'threshold', fragments: [] };
    }
    return {
      enabled: config.enabled === true,
      discoveryMode: ['threshold', 'fragments', 'both'].includes(config.discoveryMode)
        ? config.discoveryMode
        : 'threshold',
      fragments: Array.isArray(config.fragments)
        ? config.fragments.map(f => this._normalizeTeaserFragment(f)).filter(Boolean)
        : []
    };
  }

  _normalizeTeaserFragment(fragment = {}) {
    if (!fragment || typeof fragment !== 'object') return null;
    const id = String(fragment.id || '').trim();
    if (!id) return null;
    return {
      id,
      name: String(fragment.name || '').trim() || 'Fragment',
      linkedItemUuid: fragment.linkedItemUuid || null,
      recipeIds: Array.isArray(fragment.recipeIds) ? fragment.recipeIds.filter(id => typeof id === 'string') : [],
      progressValue: Math.min(100, Math.max(0, Number(fragment.progressValue) || 0))
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

  _normalizeComponentDescription(description) {
    return this._plainTextDescription(description);
  }

  _plainTextDescription(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (globalThis.document?.createElement) {
      const template = globalThis.document.createElement('template');
      template.innerHTML = raw;
      return String(template.content?.textContent || '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();
    }

    return raw
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, '\'')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();
  }

  _extractSourceDescription(source = null) {
    if (!source || typeof source !== 'object') return '';

    const candidates = [
      source?.system?.description?.value,
      source?.system?.description,
      source?.description?.value,
      source?.description
    ];

    for (const candidate of candidates) {
      const plainText = this._plainTextDescription(candidate);
      if (plainText) return plainText;
    }

    return '';
  }

  _buildComponentSourceSnapshot(itemUuid, source = null, fallbackItem = null) {
    const sourceData = this._resolveImportedSourceData(itemUuid, source);
    const sourceResolved = !!source;
    const fallbackName = fallbackItem?.name || itemUuid?.split('.')?.pop() || 'Imported Item';
    const fallbackImg = fallbackItem?.img || 'icons/svg/item-bag.svg';

    return {
      name: sourceResolved ? (source?.name || fallbackName) : fallbackName,
      img: sourceResolved ? (source?.img || fallbackImg) : fallbackImg,
      description: sourceResolved
        ? this._extractSourceDescription(source)
        : this._normalizeComponentDescription(fallbackItem?.description),
      sourceUuid: sourceData.currentUuid,
      sourceItemUuid: sourceData.canonicalUuid,
      references: sourceData.references
    };
  }

  _buildFallbackSourceReferences(item, nextSourceUuid, nextSourceItemUuid) {
    const fallbackSet = new Set(Array.isArray(item?.fallbackItemIds) ? item.fallbackItemIds : []);
    for (const ref of [item?.sourceUuid, item?.sourceItemUuid]) {
      if (ref) fallbackSet.add(ref);
    }
    fallbackSet.delete(nextSourceUuid);
    fallbackSet.delete(nextSourceItemUuid);
    return Array.from(fallbackSet);
  }

  _normalizeComponent(item = {}, validEssenceIds = null, salvageEnabled = false) {
    const difficulty = Number(item.difficulty);
    const sourceItemUuid = item.sourceItemUuid || item.sourceUuid || null;
    const sourceUuid = item.sourceUuid || item.sourceItemUuid || null;
    const primaryRefs = new Set([sourceUuid, sourceItemUuid].filter(ref => typeof ref === 'string' && ref.trim()));
    const fallbackItemIds = Array.isArray(item.fallbackItemIds)
      ? Array.from(new Set(
        item.fallbackItemIds
          .filter(id => typeof id === 'string')
          .map(id => id.trim())
          .filter(id => id && !primaryRefs.has(id))
      ))
      : [];
    return {
      id: item.id || foundry.utils.randomID(),
      name: item.name || 'Unnamed Item',
      img: item.img || 'icons/svg/item-bag.svg',
      description: this._normalizeComponentDescription(item.description),
      sourceItemUuid,
      // Transitional alias for current UI/engine references.
      sourceUuid,
      fallbackItemIds,
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

  // Normalise the alchemy sub-config for alchemy-mode systems.
  // Accepts both 'alchemy' (canonical) and 'cauldron' (T-189 legacy alias) so that persisted
  // data written before the rename continues to produce a valid config object on load.
  _normalizeAlchemyConfig(config, resolutionMode) {
    if (resolutionMode !== 'alchemy' && resolutionMode !== 'cauldron') return null; // T-189: accept both
    const c = config && typeof config === 'object' ? config : {};
    return {
      learnOnCraft: c.learnOnCraft === true,
      consumeOnFail: c.consumeOnFail !== false,
      showAttemptHistoryToPlayers: c.showAttemptHistoryToPlayers !== false
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
    const managedItems = system.components || [];
    if (!search) return [...managedItems];
    const q = search.toLowerCase();
    return managedItems.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.sourceUuid || '').toLowerCase().includes(q) ||
      (item.sourceItemUuid || '').toLowerCase().includes(q)
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
    this._assertGM('create component');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const validEssenceIds = new Set((system.essenceDefinitions || []).map(def => def.id));
    const item = this._normalizeComponent(data, validEssenceIds, system.features?.salvage === true);
    this._assertUniqueComponentSources(system, item);
    system.components.push(item);
    await this.save();
    return item;
  }

  /**
   * Resolve the live and canonical source references for an imported item UUID.
   *
   * @param {string} itemUuid
   * @param {Item|object|null} source
   * @returns {{ currentUuid: string|null, canonicalUuid: string|null, references: string[] }}
   */
  _resolveImportedSourceData(itemUuid, source = null) {
    const references = [];
    if (typeof itemUuid === 'string' && itemUuid.trim()) {
      references.push(itemUuid.trim());
    }
    for (const ref of getItemSourceReferences(source)) {
      if (!references.includes(ref)) references.push(ref);
    }
    const currentUuid = references[0] || null;
    const canonicalUuid = getSourceUuid(source) || currentUuid;
    return { currentUuid, canonicalUuid, references };
  }

  /**
   * Find an existing component in the system that already claims any of the given source references.
   *
   * @param {object} system - Normalized system object
   * @param {string[]} references - Candidate source references
   * @param {string|null} [excludeItemId=null] - Optional component to ignore
   * @returns {object|null}
   */
  _findComponentBySourceReferences(system, references, excludeItemId = null) {
    const claimedRefs = new Set((references || []).filter(Boolean));
    if (claimedRefs.size === 0) return null;
    return (system.components || []).find(item => {
      if (excludeItemId && item.id === excludeItemId) return false;
      return getComponentSourceReferences(item).some(ref => claimedRefs.has(ref));
    }) || null;
  }

  _assertUniqueComponentSources(system, item, excludeItemId = null) {
    const claimedRefs = getComponentSourceReferences(item);
    if (claimedRefs.length === 0) return;
    const conflict = this._findComponentBySourceReferences(system, claimedRefs, excludeItemId);
    if (!conflict) return;
    throw new Error(
      `Component source reference already belongs to "${conflict.name || conflict.id}" (${conflict.id})`
    );
  }

  _sameSourceReferenceSet(left, right) {
    const leftRefs = getComponentSourceReferences(left);
    const rightRefs = getComponentSourceReferences(right);
    return leftRefs.length === rightRefs.length
      && leftRefs.every(ref => rightRefs.includes(ref));
  }

  /**
   * Add a crafting-system component from a Foundry item UUID.
   * Returns { item, action } where action is 'added', 'updated', or 'skipped'.
   *
   * Imports preserve both the live document UUID (`sourceUuid`) and the canonical
   * compendium/source UUID (`sourceItemUuid`) when Foundry exposes both.
   *
   * - 'skipped': an existing component already claims the incoming live UUID or canonical
   *              source UUID, and its metadata/source references are already current.
   * - 'updated': an existing component claims that source chain, but its metadata or
   *              stored live/canonical UUIDs need to be refreshed.
   * - 'added':   no component currently claims the incoming source references.
   *
   * @param {string} systemId
   * @param {string} itemUuid
   * @returns {Promise<{ item: object, action: 'added'|'updated'|'skipped' }>}
   */
  async addItemFromUuid(systemId, itemUuid) {
    this._assertGM('add component from uuid');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    // Resolve the source document (needed for type guard and name/img refresh in all paths)
    let source = null;
    try {
      source = await fromUuid(itemUuid);
    } catch (err) {
      source = null;
    }

    // Document type guard: reject non-Item documents
    if (source && source.documentName && source.documentName !== 'Item') {
      throw new Error(
        `Cannot add non-Item document (${source.documentName}) as a crafting component`
      );
    }

    const nextSourceData = this._resolveImportedSourceData(itemUuid, source);
    const existing = this._findComponentBySourceReferences(system, nextSourceData.references);
    const nextSnapshot = this._buildComponentSourceSnapshot(itemUuid, source, existing);
    if (existing) {
      const nextFallbacks = this._buildFallbackSourceReferences(
        existing,
        nextSnapshot.sourceUuid,
        nextSnapshot.sourceItemUuid
      );
      const unchanged = existing.sourceUuid === nextSnapshot.sourceUuid
        && existing.sourceItemUuid === nextSnapshot.sourceItemUuid
        && existing.name === nextSnapshot.name
        && existing.img === nextSnapshot.img
        && existing.description === nextSnapshot.description
        && nextFallbacks.length === (existing.fallbackItemIds || []).length
        && nextFallbacks.every(ref => (existing.fallbackItemIds || []).includes(ref));

      if (unchanged) {
        return { item: existing, action: 'skipped' };
      }

      existing.name = nextSnapshot.name;
      existing.img = nextSnapshot.img;
      existing.description = nextSnapshot.description;
      existing.sourceUuid = nextSnapshot.sourceUuid;
      existing.sourceItemUuid = nextSnapshot.sourceItemUuid;
      existing.fallbackItemIds = nextFallbacks;

      await this.save();
      return { item: existing, action: 'updated' };
    }

    // No match: create new component
    const validEssenceIds = new Set((system.essenceDefinitions || []).map(def => def.id));
    const item = this._normalizeComponent({
      ...nextSnapshot
    }, validEssenceIds, system.features?.salvage === true);

    this._assertUniqueComponentSources(system, item);
    system.components.push(item);
    await this.save();
    return { item, action: 'added' };
  }

  async replaceItemSource(systemId, itemId, itemUuid) {
    this._assertGM('replace component source');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const idx = system.components.findIndex(i => i.id === itemId);
    if (idx < 0) throw new Error(`Component not found: ${itemId}`);

    let source = null;
    try {
      source = await fromUuid(itemUuid);
    } catch (err) {
      source = null;
    }

    if (source && source.documentName && source.documentName !== 'Item') {
      throw new Error(
        `Cannot use non-Item document (${source.documentName}) as a component source`
      );
    }

    const existing = system.components[idx];
    const nextSnapshot = this._buildComponentSourceSnapshot(itemUuid, source, existing);
    const conflict = this._findComponentBySourceReferences(system, nextSnapshot.references, itemId);
    if (conflict) {
      throw new Error(
        `Component source reference already belongs to "${conflict.name || conflict.id}" (${conflict.id})`
      );
    }

    const validEssenceIds = new Set((system.essenceDefinitions || []).map(def => def.id));
    const updatedItem = this._normalizeComponent(
      {
        ...existing,
        ...nextSnapshot,
        fallbackItemIds: this._buildFallbackSourceReferences(
          existing,
          nextSnapshot.sourceUuid,
          nextSnapshot.sourceItemUuid
        ),
        id: itemId
      },
      validEssenceIds,
      system.features?.salvage === true
    );

    system.components[idx] = updatedItem;
    await this.save();
    return updatedItem;
  }

  /**
   * Bulk-import all Item documents from a Foundry compendium pack into a crafting system.
   * Delegates to addItemFromUuid which now returns { item, action }.
   *
   * @param {string} systemId  - The crafting system to add items to
   * @param {string} packId    - The compendium pack identifier (e.g. "dnd5e.items")
   * @returns {Promise<{added: number, updated: number, skipped: number, total: number}>}
   */
  async addItemsFromPack(systemId, packId) {
    this._assertGM('bulk import from compendium');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const pack = game.packs.get(packId);
    if (!pack) throw new Error(`Compendium pack not found: ${packId}`);

    const documents = await pack.getDocuments();
    const items = documents.filter(d => d.documentName === 'Item');

    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of items) {
      const uuid = `Compendium.${packId}.${item.id}`;
      const result = await this.addItemFromUuid(systemId, uuid);
      if (result.action === 'added') added++;
      else if (result.action === 'updated') updated++;
      else skipped++;
    }

    return { added, updated, skipped, total: items.length };
  }

  async updateItem(systemId, itemId, updates = {}) {
    this._assertGM('update component');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const idx = system.components.findIndex(i => i.id === itemId);
    if (idx < 0) throw new Error(`Component not found: ${itemId}`);
    const validEssenceIds = new Set((system.essenceDefinitions || []).map(def => def.id));
    const updatedItem = this._normalizeComponent(
      { ...system.components[idx], ...updates, id: itemId },
      validEssenceIds,
      system.features?.salvage === true
    );
    if (!this._sameSourceReferenceSet(system.components[idx], updatedItem)) {
      this._assertUniqueComponentSources(system, updatedItem, itemId);
    }
    system.components[idx] = updatedItem;
    await this.save();
    return system.components[idx];
  }

  async deleteItem(systemId, itemId) {
    this._assertGM('delete component');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const before = system.components.length;
    const filteredItems = system.components.filter(i => i.id !== itemId);
    if (filteredItems.length === before) return false;
    system.components = filteredItems;

    // Clear essence source-item links that pointed to the deleted component.
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
    await this._cleanupSalvageRunsForComponent(itemId, systemId);

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

  _getSalvageRunManager() {
    return game.fabricate?.getSalvageRunManager?.() || null;
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
    const salvageRunManager = this._getSalvageRunManager();
    if (salvageRunManager) {
      await salvageRunManager.removeRunsForSystem(systemId, {
        cancelActive: true,
        removeHistory: true,
        cancellationReason: 'Salvage system disabled'
      });
      return;
    }

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
  async _cleanupSalvageRunsForComponent(componentId, systemId = null) {
    const salvageRunManager = this._getSalvageRunManager();
    if (salvageRunManager) {
      await salvageRunManager.removeRunsForComponent(componentId, {
        systemId,
        cancelActive: true,
        removeHistory: true,
        cancellationReason: 'Salvage component removed'
      });
      return;
    }

    for (const actor of game.actors || []) {
      const existing = getFabricateFlag(actor, 'salvageRuns', null);
      if (!existing) continue;
      const history = Array.isArray(existing.history) ? existing.history : [];
      const filtered = history.filter(r =>
        r.componentId !== componentId || (systemId && r.craftingSystemId !== systemId)
      );
      if (filtered.length !== history.length) {
        await setFabricateFlag(actor, 'salvageRuns', { ...existing, history: filtered });
      }
    }
  }
}
