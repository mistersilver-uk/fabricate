/**
 * adminStore — Svelte store factory for the RecipeManagerApp (T-120)
 *
 * All side-effects are injected via `services` so this module never touches
 * `game.*` directly.  Each call to createAdminStore() produces a fresh,
 * isolated set of writable() instances.
 */
import { writable, get } from 'svelte/store';
import { buildRecipeGraph, layoutGraph, filterGraph } from '../util/recipeGraphBuilder.js';
import {
  buildExportPayload,
  validateImportData,
  prepareForImport,
  makeExportFilename
} from '../../../systems/CraftingSystemExporter.js';

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
    const key = recipe.category || 'general';
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
      category: recipe.category,
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
function _buildItemCards(systemManager, selectedSystem, itemSearchTerm, showTags, showEssences, essenceNameById) {
  if (!selectedSystem) return [];
  return systemManager.getItems(selectedSystem.id, itemSearchTerm).map(item => ({
    ...item,
    img: item.img || 'icons/svg/item-bag.svg',
    tags: showTags ? (item.tags || []) : [],
    essences: showEssences
      ? Object.entries(item.essences || {}).map(([id, quantity]) => ({
        id,
        name: essenceNameById.get(id) || id,
        quantity
      }))
      : [],
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
      mode: selectedSystem.craftingCheck?.mode || 'passFail',
      macroUuid: selectedSystem.craftingCheck?.macroUuid || '',
      outcomesText: Array.isArray(selectedSystem.craftingCheck?.outcomes)
        ? selectedSystem.craftingCheck.outcomes.join(', ')
        : ''
    },

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
      const managedItemOptions = (selectedSystem.items || []).map(item => ({
        id: item.id,
        name: item.name
      }));

      const essenceDefinitions = Array.isArray(selectedSystem.essenceDefinitions)
        ? selectedSystem.essenceDefinitions.map(def => ({
          ...def,
          associatedItemName: managedItemOptions.find(
            opt => opt.id === (def.sourceItemUuid || def.associatedSystemItemId)
          )?.name || null
        }))
        : [];

      const essenceNameById = new Map(essenceDefinitions.map(def => [def.id, def.name]));
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
        essenceNameById
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
      const components = selectedSystem.items || [];
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
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const categories = Array.from(new Set([...(system.categories || []), value.trim()]));
    await systemManager.updateSystem(sysId, { categories });
    await refresh();
  }

  async function removeCategory(category) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const categories = (system.categories || []).filter(c => c !== category);
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
    if (!name || !name.trim()) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const existing = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const duplicate = existing.some(
      def => String(def.name || '').toLowerCase() === name.trim().toLowerCase()
    );
    if (duplicate) {
      services.notify.warn(`Essence "${name}" already exists in this system.`);
      return;
    }

    const essenceDefinitions = [
      ...existing,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        description: description || '',
        icon: icon || 'fas fa-mortar-pestle',
        sourceItemUuid: sourceItemUuid || null,
        associatedSystemItemId: sourceItemUuid || null
      }
    ];
    await systemManager.updateSystem(sysId, { essenceDefinitions });
    await refresh();
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

  async function saveCraftingCheckConfig(mode, macroUuid, outcomesText) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const outcomes = (outcomesText || '').split(',').map(s => s.trim()).filter(Boolean);
    await systemManager.updateSystem(sysId, {
      craftingCheck: { mode, macroUuid: macroUuid || null, outcomes }
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

  async function saveVisibilityConfig(listMode, knowledgeMode, consumeOnLearn) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const existing = system.recipeVisibility || {};
    const recipeVisibility = {
      ...existing,
      listMode,
      knowledge: {
        ...(existing.knowledge || {}),
        mode: knowledgeMode,
        learn: {
          ...(existing.knowledge?.learn || {}),
          consumeOnLearn
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
    const item = system?.items?.find(i => i.id === itemId);
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

  // --- Search ---

  async function setRecipeSearch(term) {
    recipeSearch.set(term);
    await refresh();
  }

  async function setItemSearch(term) {
    itemSearch.set(term);
    await refresh();
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
    setTab,
    toggleFeature,
    toggleAdvancedOptions,
    toggleRequirement,
    addCategory,
    removeCategory,
    addTag,
    removeTag,
    addEssence,
    removeEssence,
    saveCraftingCheckConfig,
    saveCurrencyConfig,
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
