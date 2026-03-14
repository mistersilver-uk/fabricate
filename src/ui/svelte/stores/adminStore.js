/**
 * adminStore — Svelte store factory for the RecipeManagerApp (T-120)
 *
 * All side-effects are injected via `services` so this module never touches
 * `game.*` directly.  Each call to createAdminStore() produces a fresh,
 * isolated set of writable() instances.
 */
import { writable, get } from 'svelte/store';
import { buildRecipeGraph, layoutGraph, filterGraph } from '../util/recipeGraphBuilder.js';
import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../util/essenceIcons.js';
import {
  buildExportPayload,
  validateImportData,
  prepareForImport,
  makeExportFilename
} from '../../../systems/CraftingSystemExporter.js';
import {
  isGeneralRecipeCategory,
  normalizeCustomRecipeCategories,
  normalizeRecipeCategory
} from '../../../utils/recipeCategories.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEATURE_MAP = {
  categories: 'recipeCategories',
  itemTags: 'itemTags',
  essences: 'essences',
  complexRecipes: 'complexRecipes',
  multiStepRecipes: 'multiStepRecipes',
  propertyMacros: 'propertyMacros',
  craftingChecks: 'craftingChecks',
  outcomeRouting: 'outcomeRouting',
  effectTransfer: 'effectTransfer'
};

const RESOLUTION_MODE_LABEL_KEYS = {
  simple: 'FABRICATE.Admin.SystemSettings.ResolutionSimple',
  mapped: 'FABRICATE.Admin.SystemSettings.ResolutionMapped',
  tiered: 'FABRICATE.Admin.SystemSettings.ResolutionTiered',
  progressive: 'FABRICATE.Admin.SystemSettings.ResolutionProgressive',
  alchemy: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemy'
};

// ---------------------------------------------------------------------------
// Module-private helper functions
// ---------------------------------------------------------------------------

/**
 * Generate a unique system name that does not collide with any existing system.
 * Mirrors RecipeManagerApp._nextSystemName().
 */
function _nextSystemName(systemManager) {
  const base = 'New Crafting System';
  const names = new Set(systemManager.getSystems().map(s => s.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/**
 * Build a human-readable visibility summary for a recipe row.
 */
function _visibilitySummary(recipe) {
  const visibility = recipe.visibility || {};
  if (visibility.restricted !== true) return 'All players';
  const allowed = Array.isArray(visibility.allowedUserIds) ? visibility.allowedUserIds : [];
  if (allowed.length === 0) return 'Restricted (none selected)';
  return `Restricted (${allowed.length})`;
}

function _getManagedItems(system) {
  if (Array.isArray(system?.components)) return system.components;
  if (Array.isArray(system?.items)) return system.items;
  return [];
}

function _buildManagedItemOptions(managedItems = []) {
  return managedItems.map(item => ({
    id: item.id,
    name: item.name,
    img: item.img || 'icons/svg/item-bag.svg'
  }));
}

function _resolutionModeLabel(mode, localizeFn) {
  const key = RESOLUTION_MODE_LABEL_KEYS[mode];
  return key ? (localizeFn?.(key) || mode) : mode;
}

function _buildSalvageSummary(item, salvageEnabled) {
  if (!salvageEnabled || item?.salvage?.enabled !== true) return null;

  const salvage = item.salvage || {};
  const outcomeRouting = salvage.outcomeRouting && typeof salvage.outcomeRouting === 'object'
    ? Object.keys(salvage.outcomeRouting).length
    : 0;

  return {
    quantityRequired: Number(salvage.ingredientQuantity) || 1,
    catalystCount: Array.isArray(salvage.catalysts) ? salvage.catalysts.length : 0,
    resultGroupCount: Array.isArray(salvage.resultGroups) ? salvage.resultGroups.length : 0,
    hasTimeRequirement: !!salvage.timeRequirement,
    hasCurrencyRequirement: !!salvage.currencyRequirement,
    outcomeCount: outcomeRouting
  };
}

/**
 * Build the recipe list for the recipes tab.
 * Mirrors RecipeManagerApp._prepareRecipeContext().
 */
function _buildRecipeList(systemManager, recipeManager, selectedSystem, recipeSearchTerm) {
  if (!selectedSystem) return { recipes: [], recipeCategories: [], showVisibilitySummary: false };

  const listMode = selectedSystem.recipeVisibility?.listMode || 'global';
  const showVisibilitySummary = listMode === 'player';

  let recipes = recipeManager.getRecipes({ craftingSystemId: selectedSystem.id });

  if (recipeSearchTerm) {
    const lower = recipeSearchTerm.toLowerCase();
    recipes = recipes.filter(r =>
      r.name.toLowerCase().includes(lower) ||
      (r.description || '').toLowerCase().includes(lower)
    );
  }

  const categoriesMap = new Map();
  for (const recipe of recipeManager.getRecipes({ craftingSystemId: selectedSystem.id })) {
    const key = normalizeRecipeCategory(recipe.category);
    categoriesMap.set(key, (categoriesMap.get(key) || 0) + 1);
  }
  const recipeCategories = Array.from(categoriesMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const prepared = recipes.map(recipe => {
    const ingredientCount = (recipe.ingredientSets || []).reduce((sum, set) => {
      const groupCount = Array.isArray(set.ingredientGroups) && set.ingredientGroups.length > 0
        ? set.ingredientGroups.reduce((gs, group) => gs + ((group.options || []).length || 0), 0)
        : (set.ingredients || []).length;
      return sum + groupCount;
    }, 0);
    const catalystCount = (recipe.ingredientSets || []).reduce((sum, set) => sum + (set.catalysts?.length || 0), 0);
    return {
      id: recipe.id,
      name: recipe.name,
      img: recipe.img,
      category: normalizeRecipeCategory(recipe.category),
      visibilitySummary: _visibilitySummary(recipe),
      locked: recipe.locked === true,
      enabled: recipe.enabled,
      isSimple: typeof recipe.isSimpleRecipe === 'function' ? recipe.isSimpleRecipe() : true,
      ingredients: new Array(ingredientCount),
      catalysts: new Array(catalystCount)
    };
  });

  return { recipes: prepared, recipeCategories, showVisibilitySummary };
}

/**
 * Build the item cards list for the items tab.
 * Mirrors _prepareContext item logic from RecipeManagerApp.
 */
function _buildItemCards(systemManager, selectedSystem, itemSearchTerm, showTags, showEssences, essenceDefinitionById) {
  if (!selectedSystem) return [];
  const showSalvage = selectedSystem.features?.salvage === true;
  return systemManager.getItems(selectedSystem.id, itemSearchTerm).map(item => ({
    ...item,
    img: item.img || 'icons/svg/item-bag.svg',
    description: String(item.description || '').trim(),
    hasDescription: String(item.description || '').trim().length > 0,
    tags: showTags ? (item.tags || []) : [],
    essences: showEssences
      ? Object.entries(item.essences || {}).map(([id, quantity]) => ({
        id,
        name: essenceDefinitionById.get(id)?.name || id,
        icon: essenceDefinitionById.get(id)?.icon || 'fas fa-mortar-pestle',
        quantity
      }))
      : [],
    sourceUuidDisplay: item.sourceItemUuid || item.sourceUuid || '',
    hasSourceUuid: Boolean(item.sourceItemUuid || item.sourceUuid),
    salvageSummary: _buildSalvageSummary(item, showSalvage),
    showTags,
    showEssences
  }));
}

/**
 * Build the full selectedSystem view data object.
 * Mirrors RecipeManagerApp._prepareContext() selectedSystem section.
 */
function _buildSelectedSystemViewData(selectedSystem, managedItemOptions, essenceDefinitions, availableScriptMacros) {
  if (!selectedSystem) return null;

  const advancedEnabled = selectedSystem.advancedOptionsEnabled !== false;
  const showTags = advancedEnabled && selectedSystem.features?.itemTags === true;
  const showEssences = advancedEnabled && selectedSystem.features?.essences === true;

  const listMode = selectedSystem.recipeVisibility?.listMode || 'global';
  const showRecipeVisibilityKnowledgeOptions = listMode === 'knowledge';
  const showRecipeVisibilityPlayerNote = listMode === 'player';

  return {
    id: selectedSystem.id,
    name: selectedSystem.name,
    description: selectedSystem.description,
    resolutionMode: selectedSystem.resolutionMode || 'simple',
    advancedOptionsEnabled: advancedEnabled,

    features: {
      recipeCategories: selectedSystem.features?.recipeCategories === true,
      itemTags: selectedSystem.features?.itemTags === true,
      essences: selectedSystem.features?.essences === true,
      complexRecipes: selectedSystem.features?.complexRecipes === true,
      multiStepRecipes: selectedSystem.features?.multiStepRecipes === true,
      propertyMacros: selectedSystem.features?.propertyMacros === true,
      craftingChecks: selectedSystem.features?.craftingChecks === true,
      outcomeRouting: selectedSystem.features?.outcomeRouting === true,
      effectTransfer: selectedSystem.features?.effectTransfer === true
    },

    categories: selectedSystem.categories || [],
    itemTags: selectedSystem.itemTags || selectedSystem.tags || [],
    essenceDefinitions,
    managedItemOptions,

    requirements: selectedSystem.requirements || {
      time: { enabled: false },
      currency: { enabled: false, provider: 'macro' }
    },

    craftingCheck: {
      enabled: selectedSystem.craftingCheck?.enabled === true,
      mode: selectedSystem.craftingCheck?.mode || 'passFail',
      macroUuid: selectedSystem.craftingCheck?.macroUuid || '',
      outcomesText: Array.isArray(selectedSystem.craftingCheck?.outcomes)
        ? selectedSystem.craftingCheck.outcomes.join(', ')
        : ''
    },

    alchemy: selectedSystem.resolutionMode === 'alchemy'
      ? {
        learnOnCraft: selectedSystem.alchemy?.learnOnCraft === true,
        consumeOnFail: selectedSystem.alchemy?.consumeOnFail !== false,
        showAttemptHistoryToPlayers: selectedSystem.alchemy?.showAttemptHistoryToPlayers !== false
      }
      : null,

    recipeVisibility: selectedSystem.recipeVisibility || {},
    teaserConfig: selectedSystem.teaserConfig || { enabled: false, discoveryMode: 'threshold', fragments: [] },
    showRecipeVisibilityKnowledgeOptions,
    showRecipeVisibilityPlayerNote,

    showTags,
    showEssences,
    availableScriptMacros
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a new adminStore.
 *
 * @param {object} services - Injected service accessors (never game.* directly)
 * @returns {object} Store API — writable stores + action functions
 */
export function createAdminStore(services) {
  // --- Input writables ---
  const selectedSystemId = writable(services.getSetting('lastManagedCraftingSystem') || '');
  const activeTab = writable('systems');
  const recipeSearch = writable('');
  const itemSearch = writable('');
  const graphSearch = writable('');

  // --- Computed state ---
  const viewState = writable({
    systems: [],
    hasSystem: false,
    selectedSystemName: '',
    selectedSystem: null,
    itemCards: [],
    recipes: [],
    recipeCategories: [],
    showVisibilitySummary: false,
    recipeSearchTerm: '',
    itemSearchTerm: '',
    graphData: { nodes: [], edges: [], width: 0, height: 0 },
    graphSearchTerm: ''
  });

  // --- refresh ---
  async function refresh() {
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    if (!systemManager || !recipeManager) return;

    const allSystems = systemManager.getSystems();
    const currentSystemId = get(selectedSystemId);

    // Build system list and ensure selection is valid
    const systemList = allSystems.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      selected: s.id === currentSystemId
    }));

    let resolvedSystemId = currentSystemId;
    if (currentSystemId && !allSystems.find(s => s.id === currentSystemId)) {
      resolvedSystemId = allSystems[0]?.id || '';
      selectedSystemId.set(resolvedSystemId);
    } else if (!currentSystemId && allSystems.length > 0) {
      // Don't auto-select; leave it empty unless something was set
    }

    const selectedSystem = resolvedSystemId
      ? allSystems.find(s => s.id === resolvedSystemId) || null
      : null;

    const availableScriptMacros = services.getScriptMacros();

    let selectedSystemData = null;
    let itemCards = [];
    let recipeListData = { recipes: [], recipeCategories: [], showVisibilitySummary: false };

    if (selectedSystem) {
      const managedItems = _getManagedItems(selectedSystem);
      const managedItemOptions = _buildManagedItemOptions(managedItems);
      const managedItemById = new Map(managedItemOptions.map(item => [item.id, item]));

      const essenceDefinitions = Array.isArray(selectedSystem.essenceDefinitions)
        ? selectedSystem.essenceDefinitions.map(def => ({
          ...def,
          associatedItem: managedItemById.get(def.sourceItemUuid || def.associatedSystemItemId) || null,
          associatedItemName: managedItemById.get(def.sourceItemUuid || def.associatedSystemItemId)?.name || null
        }))
        : [];

      const essenceDefinitionById = new Map(essenceDefinitions.map(def => [def.id, def]));
      const advancedEnabled = selectedSystem.advancedOptionsEnabled !== false;
      const showTags = advancedEnabled && selectedSystem.features?.itemTags === true;
      const showEssences = advancedEnabled && selectedSystem.features?.essences === true;

      selectedSystemData = _buildSelectedSystemViewData(
        selectedSystem,
        managedItemOptions,
        essenceDefinitions,
        availableScriptMacros
      );

      itemCards = _buildItemCards(
        systemManager,
        selectedSystem,
        get(itemSearch),
        showTags,
        showEssences,
        essenceDefinitionById
      );

      recipeListData = _buildRecipeList(
        systemManager,
        recipeManager,
        selectedSystem,
        get(recipeSearch)
      );
    }

    // --- Graph data (lazy, computed only when graph tab is active) ---
    let graphData = { nodes: [], edges: [], width: 0, height: 0 };
    if (get(activeTab) === 'graph' && selectedSystem) {
      const allRecipes = recipeManager.getRecipes({ craftingSystemId: selectedSystem.id });
      const components = _getManagedItems(selectedSystem);
      const rawGraph = buildRecipeGraph(allRecipes, components);
      const layoutResult = layoutGraph(rawGraph);
      graphData = filterGraph(layoutResult, { searchTerm: get(graphSearch) });
    }

    viewState.set({
      systems: systemList,
      hasSystem: !!selectedSystem,
      selectedSystemName: selectedSystem?.name || '',
      selectedSystem: selectedSystemData,
      itemCards,
      recipes: recipeListData.recipes,
      recipeCategories: recipeListData.recipeCategories,
      showVisibilitySummary: recipeListData.showVisibilitySummary,
      recipeSearchTerm: get(recipeSearch),
      itemSearchTerm: get(itemSearch),
      graphData,
      graphSearchTerm: get(graphSearch)
    });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  // --- System selection ---

  async function selectSystem(systemId) {
    selectedSystemId.set(systemId);
    await services.setSetting('lastManagedCraftingSystem', systemId);
    await refresh();
  }

  async function createSystem() {
    const systemManager = services.getCraftingSystemManager();
    const name = _nextSystemName(systemManager);
    const description = 'Configure categories, item tags, essences, and crafting behaviour for this system.';
    const system = await systemManager.createSystem({ name, description });
    selectedSystemId.set(system.id);
    activeTab.set('systems');
    await services.setSetting('lastManagedCraftingSystem', system.id);
    await refresh();
  }

  async function deleteSystem(systemId) {
    const systemManager = services.getCraftingSystemManager();
    const system = systemManager.getSystem(systemId);
    if (!system) return;

    const confirmed = await services.confirmDialog({
      title: `Delete ${system.name}?`,
      content: `<p>Delete crafting system <strong>${system.name}</strong>? Recipes linked to it will be deleted.</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    await systemManager.deleteSystem(systemId);
    const remaining = systemManager.getSystems();
    const nextId = remaining[0]?.id || '';
    selectedSystemId.set(nextId);
    await services.setSetting('lastManagedCraftingSystem', nextId);
    await refresh();
  }

  async function saveSystemDetails(name, description, advancedOptionsEnabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { name, description, advancedOptionsEnabled });
    await refresh();
  }

  async function setResolutionMode(resolutionMode) {
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;

    const system = systemManager.getSystem(sysId);
    if (!system) return false;

    const nextMode = String(resolutionMode || '').trim() || 'simple';
    const currentMode = system.resolutionMode || 'simple';
    if (nextMode === currentMode) return true;

    const recipeCount = recipeManager?.getRecipes?.({ craftingSystemId: sysId })?.length || 0;
    const localizeFn = services.localize;
    const confirmed = await services.confirmDialog({
      title: localizeFn?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeTitle')
        || 'Change Resolution Mode?',
      content: `<p>${
        localizeFn?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeContent', {
          count: recipeCount,
          name: system.name,
          mode: _resolutionModeLabel(nextMode, localizeFn)
        }) || `Changing resolution mode to ${_resolutionModeLabel(nextMode, localizeFn)} will delete ${recipeCount} recipe(s) in this crafting system and clean up related runs and learned recipes.`
      }</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return false;

    await systemManager.updateSystem(sysId, { resolutionMode: nextMode });
    await refresh();
    return true;
  }

  // --- Tab navigation ---

  async function setTab(tabName) {
    activeTab.set(tabName);
    await refresh();
  }

  // --- Feature toggles ---

  async function toggleFeature(feature, enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const key = FEATURE_MAP[feature];
    if (!key) return;
    await systemManager.updateSystem(sysId, { features: { [key]: enabled } });
    await refresh();
  }

  async function toggleAdvancedOptions(enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { advancedOptionsEnabled: enabled });
    await refresh();
  }

  async function toggleRequirement(requirement, enabled) {
    if (!['time', 'currency'].includes(requirement)) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const requirements = JSON.parse(JSON.stringify(system.requirements || {
      time: { enabled: false },
      currency: { enabled: false, provider: 'macro' }
    }));
    requirements[requirement] = requirements[requirement] || {};
    requirements[requirement].enabled = enabled;
    if (requirement === 'currency') {
      requirements.currency.provider = requirements.currency.provider || 'macro';
    }

    await systemManager.updateSystem(sysId, { requirements });
    await refresh();
  }

  // --- Category management ---

  async function addCategory(value) {
    if (!value || !value.trim()) return;
    if (isGeneralRecipeCategory(value)) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const categories = normalizeCustomRecipeCategories([...(system.categories || []), value.trim()]);
    await systemManager.updateSystem(sysId, { categories });
    await refresh();
  }

  async function removeCategory(category) {
    if (isGeneralRecipeCategory(category)) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const categories = normalizeCustomRecipeCategories((system.categories || []).filter(c => c !== category));
    await systemManager.updateSystem(sysId, { categories });
    await refresh();
  }

  // --- Tag management ---

  async function addTag(value) {
    if (!value || !value.trim()) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const lower = value.trim().toLowerCase();
    const tags = Array.from(new Set([...(system.itemTags || system.tags || []), lower]));
    await systemManager.updateSystem(sysId, { itemTags: tags });
    await refresh();
  }

  async function removeTag(tag) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const tags = (system.itemTags || system.tags || []).filter(t => t !== tag);
    await systemManager.updateSystem(sysId, { itemTags: tags });
    await refresh();
  }

  // --- Essence management ---

  async function addEssence(name, description, icon, sourceItemUuid) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return false;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;
    const system = systemManager.getSystem(sysId);
    if (!system) return false;

    const existing = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const duplicate = existing.some(
      def => String(def.name || '').toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      services.notify.warn(`Essence "${normalizedName}" already exists in this system.`);
      return false;
    }

    const essenceDefinitions = [
      ...existing,
      {
        id: crypto.randomUUID(),
        name: normalizedName,
        description: String(description || ''),
        icon: normalizeEssenceIcon(icon || DEFAULT_ESSENCE_ICON),
        sourceItemUuid: sourceItemUuid || null,
        associatedSystemItemId: sourceItemUuid || null
      }
    ];
    await systemManager.updateSystem(sysId, { essenceDefinitions });
    await refresh();
    return true;
  }

  async function updateEssence(essenceId, updates = {}) {
    if (!essenceId || !updates || typeof updates !== 'object') return false;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;
    const system = systemManager.getSystem(sysId);
    if (!system) return false;

    const existing = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const current = existing.find(def => def.id === essenceId);
    if (!current) return false;

    const nextName = Object.prototype.hasOwnProperty.call(updates, 'name')
      ? String(updates.name || '').trim()
      : String(current.name || '').trim();
    if (!nextName) return false;

    const duplicate = existing.some(def =>
      def.id !== essenceId &&
      String(def.name || '').trim().toLowerCase() === nextName.toLowerCase()
    );
    if (duplicate) {
      services.notify.warn(`Essence "${nextName}" already exists in this system.`);
      return false;
    }

    const nextDescription = Object.prototype.hasOwnProperty.call(updates, 'description')
      ? String(updates.description || '')
      : String(current.description || '');
    const nextIcon = Object.prototype.hasOwnProperty.call(updates, 'icon')
      ? normalizeEssenceIcon(updates.icon)
      : normalizeEssenceIcon(current.icon);
    const nextSourceItemUuid = Object.prototype.hasOwnProperty.call(updates, 'sourceItemUuid')
      ? (updates.sourceItemUuid || null)
      : (current.sourceItemUuid || current.associatedSystemItemId || null);

    const essenceDefinitions = existing.map(def => {
      if (def.id !== essenceId) return def;
      return {
        ...def,
        name: nextName,
        description: nextDescription,
        icon: nextIcon,
        sourceItemUuid: nextSourceItemUuid,
        associatedSystemItemId: nextSourceItemUuid
      };
    });

    await systemManager.updateSystem(sysId, { essenceDefinitions });
    await refresh();
    return true;
  }

  async function removeEssence(essenceId) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const essenceDefinitions = (system.essenceDefinitions || []).filter(def => def.id !== essenceId);
    await systemManager.updateSystem(sysId, { essenceDefinitions });
    await refresh();
  }

  // --- Config save actions ---

  async function saveCraftingCheckConfig(configOrMode, macroUuid, outcomesText) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const existing = system.craftingCheck || {};
    const normalizedConfig = typeof configOrMode === 'object' && configOrMode !== null
      ? configOrMode
      : {
        mode: configOrMode,
        macroUuid,
        outcomesText
      };
    const mode = normalizedConfig.mode === 'namedOutcomes' ? 'namedOutcomes' : 'passFail';
    const resolvedMacroUuid = normalizedConfig.macroUuid || null;
    const outcomes = String(normalizedConfig.outcomesText || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    await systemManager.updateSystem(sysId, {
      craftingCheck: {
        ...existing,
        mode,
        macroUuid: resolvedMacroUuid,
        outcomes
      }
    });
    await refresh();
  }

  async function saveCurrencyConfig(provider, systemAdapter, checkMacro, decrementMacro, formatMacro) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const resolvedProvider = provider === 'system' ? 'system' : 'macro';
    const requirements = JSON.parse(JSON.stringify(system.requirements || {
      time: { enabled: false },
      currency: { enabled: false, provider: 'macro' }
    }));
    requirements.currency = {
      ...(requirements.currency || {}),
      enabled: requirements.currency?.enabled === true,
      provider: resolvedProvider,
      systemAdapter: resolvedProvider === 'system' ? systemAdapter || undefined : undefined,
      checkCurrencyMacroUuid: resolvedProvider === 'macro' ? checkMacro || null : null,
      decrementCurrencyMacroUuid: resolvedProvider === 'macro' ? decrementMacro || null : null,
      formatCurrencyMacroUuid: resolvedProvider === 'macro' ? formatMacro || null : null
    };

    await systemManager.updateSystem(sysId, { requirements });
    await refresh();
  }

  async function saveAlchemyConfig(config = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const existing = system.alchemy || {};
    await systemManager.updateSystem(sysId, {
      alchemy: {
        ...existing,
        learnOnCraft: config.learnOnCraft === true,
        consumeOnFail: config.consumeOnFail !== false,
        showAttemptHistoryToPlayers: config.showAttemptHistoryToPlayers !== false
      }
    });
    await refresh();
  }

  async function saveVisibilityConfig(configOrListMode, knowledgeMode, consumeOnLearn, extras = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const existing = system.recipeVisibility || {};
    const currentKnowledge = existing.knowledge || {};
    const currentItem = currentKnowledge.item || {};
    const currentLearn = currentKnowledge.learn || {};
    const normalizedConfig = typeof configOrListMode === 'object' && configOrListMode !== null
      ? configOrListMode
      : {
        listMode: configOrListMode,
        knowledgeMode,
        consumeOnLearn,
        ...extras
      };
    const nextListMode = normalizedConfig.listMode || existing.listMode || 'global';
    const nextKnowledgeMode = normalizedConfig.knowledgeMode || currentKnowledge.mode || 'itemOrLearned';
    const nextLimitUses = normalizedConfig.limitUses !== undefined
      ? normalizedConfig.limitUses === true
      : currentItem.limitUses === true;
    const rawMaxUses = normalizedConfig.maxUses !== undefined
      ? normalizedConfig.maxUses
      : currentItem.maxUses;
    const nextMaxUses = nextLimitUses && Number.isFinite(Number(rawMaxUses)) && Number(rawMaxUses) > 0
      ? Number(rawMaxUses)
      : undefined;
    const nextDestroyWhenExhausted = nextLimitUses
      ? (normalizedConfig.destroyWhenExhausted !== undefined
        ? normalizedConfig.destroyWhenExhausted === true
        : currentItem.destroyWhenExhausted === true)
      : false;
    const nextConsumeOnLearn = normalizedConfig.consumeOnLearn !== undefined
      ? normalizedConfig.consumeOnLearn !== false
      : currentLearn.consumeOnLearn !== false;
    const nextDragDropEnabled = normalizedConfig.dragDropEnabled !== undefined
      ? normalizedConfig.dragDropEnabled !== false
      : currentLearn.dragDropEnabled !== false;
    const recipeVisibility = {
      ...existing,
      listMode: nextListMode,
      knowledge: {
        ...currentKnowledge,
        mode: nextKnowledgeMode,
        item: {
          ...currentItem,
          limitUses: nextLimitUses,
          maxUses: nextMaxUses,
          destroyWhenExhausted: nextDestroyWhenExhausted
        },
        learn: {
          ...currentLearn,
          consumeOnLearn: nextConsumeOnLearn,
          dragDropEnabled: nextDragDropEnabled
        }
      }
    };

    await systemManager.updateSystem(sysId, { recipeVisibility });
    await refresh();
  }

  async function saveTeaserConfig(teaserConfig) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { teaserConfig });
    await refresh();
  }

  // --- Recipe operations ---

  async function createRecipe() {
    const sysId = get(selectedSystemId);
    if (!sysId) {
      services.notify.warn('Create or select a crafting system first.');
      return;
    }
    services.openRecipeEditor(null, null, sysId);
  }

  async function deleteRecipe(recipeId) {
    const recipeManager = services.getRecipeManager();
    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) return;

    const confirmed = await services.confirmDialog({
      title: `Delete ${recipe.name}?`,
      content: `<p>Delete recipe <strong>${recipe.name}</strong>?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    await recipeManager.deleteRecipe(recipeId);
    await refresh();
  }

  async function duplicateRecipe(recipeId) {
    const recipeManager = services.getRecipeManager();
    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) return;
    const data = recipe.toJSON();
    delete data.id;
    data.name = `${data.name} (Copy)`;
    await recipeManager.createRecipe(data);
    await refresh();
  }

  async function toggleRecipeEnabled(recipeId, enabled) {
    const recipeManager = services.getRecipeManager();
    await recipeManager.updateRecipe(recipeId, { enabled });
    await refresh();
  }

  async function importRecipes() {
    await services.renderImportDialog(get(selectedSystemId));
  }

  async function exportRecipes() {
    const recipeManager = services.getRecipeManager();
    const sysId = get(selectedSystemId);
    const recipes = sysId
      ? recipeManager.getRecipes({ craftingSystemId: sysId }).map(r => r.toJSON())
      : recipeManager.exportRecipes();
    const json = JSON.stringify(recipes, null, 2);
    await services.copyToClipboard(json);
    services.notify.info(`Exported ${recipes.length} recipes to clipboard.`);
  }

  // --- System import/export ---

  async function exportSystem(systemId) {
    const targetId = systemId || get(selectedSystemId);
    if (!targetId) {
      services.notify.warn('Select a crafting system to export.');
      return;
    }
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    const system = systemManager.getSystem(targetId);
    if (!system) {
      services.notify.error('Crafting system not found.');
      return;
    }
    const recipes = recipeManager.getRecipes({ craftingSystemId: targetId }).map(r => r.toJSON());
    const version = services.getModuleVersion ? services.getModuleVersion() : '0.0.0';
    const payload = buildExportPayload(system, recipes, version);
    const filename = makeExportFilename(system.name);
    const json = JSON.stringify(payload, null, 2);
    await services.downloadFile(json, filename);
    services.notify.info(`Exported "${system.name}" (${recipes.length} recipes).`);
  }

  async function importSystem() {
    await services.renderSystemImportDialog();
  }

  // --- Item/Component management ---

  async function deleteComponent(itemId) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!itemId || !sysId) return;
    const system = systemManager.getSystem(sysId);
    const item = _getManagedItems(system).find(i => i.id === itemId);
    if (!item) return;

    const confirmed = await services.confirmDialog({
      title: `Delete ${item.name}?`,
      content: `<p>Delete component <strong>${item.name}</strong> and remove it from recipes in this system?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    await systemManager.deleteItem(sysId, itemId);
    await refresh();
  }

  // --- Targeted partial refreshes ---

  /**
   * Recompute only item cards and update viewState.itemCards + itemSearchTerm.
   * Does not rebuild the recipe list or system view data.
   */
  async function _refreshItemCards() {
    const systemManager = services.getCraftingSystemManager();
    if (!systemManager) return;

    const currentSystemId = get(selectedSystemId);
    const allSystems = systemManager.getSystems();
    const selectedSystem = currentSystemId
      ? allSystems.find(s => s.id === currentSystemId) || null
      : null;

    if (!selectedSystem) {
      viewState.update(vs => ({ ...vs, itemCards: [], itemSearchTerm: get(itemSearch) }));
      return;
    }

    const essenceDefinitions = Array.isArray(selectedSystem.essenceDefinitions)
      ? selectedSystem.essenceDefinitions
      : [];
    const essenceDefinitionById = new Map(essenceDefinitions.map(def => [def.id, def]));
    const advancedEnabled = selectedSystem.advancedOptionsEnabled !== false;
    const showTags = advancedEnabled && selectedSystem.features?.itemTags === true;
    const showEssences = advancedEnabled && selectedSystem.features?.essences === true;

    const itemCards = _buildItemCards(
      systemManager,
      selectedSystem,
      get(itemSearch),
      showTags,
      showEssences,
      essenceDefinitionById
    );

    viewState.update(vs => ({ ...vs, itemCards, itemSearchTerm: get(itemSearch) }));
  }

  /**
   * Recompute only the recipe list and update viewState.recipes,
   * recipeCategories, showVisibilitySummary, and recipeSearchTerm.
   * Does not rebuild item cards or system view data.
   */
  async function _refreshRecipeList() {
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    if (!systemManager || !recipeManager) return;

    const currentSystemId = get(selectedSystemId);
    const allSystems = systemManager.getSystems();
    const selectedSystem = currentSystemId
      ? allSystems.find(s => s.id === currentSystemId) || null
      : null;

    if (!selectedSystem) {
      viewState.update(vs => ({
        ...vs,
        recipes: [],
        recipeCategories: [],
        showVisibilitySummary: false,
        recipeSearchTerm: get(recipeSearch)
      }));
      return;
    }

    const recipeListData = _buildRecipeList(
      systemManager,
      recipeManager,
      selectedSystem,
      get(recipeSearch)
    );

    viewState.update(vs => ({
      ...vs,
      recipes: recipeListData.recipes,
      recipeCategories: recipeListData.recipeCategories,
      showVisibilitySummary: recipeListData.showVisibilitySummary,
      recipeSearchTerm: get(recipeSearch)
    }));
  }

  // --- Search ---

  async function setRecipeSearch(term) {
    recipeSearch.set(term);
    await _refreshRecipeList();
  }

  async function setItemSearch(term) {
    itemSearch.set(term);
    await _refreshItemCards();
  }

  async function setGraphSearch(term) {
    graphSearch.set(term);
    await refresh();
  }

  function destroy() {
    // No-op for now — hook cleanup would go here
  }

  // Trigger initial computation
  refresh();

  return {
    // Writable stores (inputs)
    selectedSystemId,
    activeTab,
    recipeSearch,
    itemSearch,
    // Computed state
    viewState,
    // Actions
    selectSystem,
    createSystem,
    deleteSystem,
    saveSystemDetails,
    setResolutionMode,
    setTab,
    toggleFeature,
    toggleAdvancedOptions,
    toggleRequirement,
    addCategory,
    removeCategory,
    addTag,
    removeTag,
    addEssence,
    updateEssence,
    removeEssence,
    saveCraftingCheckConfig,
    saveCurrencyConfig,
    saveAlchemyConfig,
    saveVisibilityConfig,
    saveTeaserConfig,
    createRecipe,
    deleteRecipe,
    duplicateRecipe,
    toggleRecipeEnabled,
    importRecipes,
    exportRecipes,
    exportSystem,
    importSystem,
    deleteComponent,
    setRecipeSearch,
    setItemSearch,
    setGraphSearch,
    refresh,
    destroy
  };
}
