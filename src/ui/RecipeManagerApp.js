import { RecipeEditorApp } from './RecipeEditorApp.js';
import { getRecipeEditorAppClass } from './appFactory.js';
import { confirmDialog, getDragEventData, renderDialog } from './foundryCompat.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';

/**
 * GM crafting administration UI
 */
export class RecipeManagerApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(options = {}) {
    super(options);
    this.activeTab = 'systems';
    this.searchTerm = '';
    this.itemSearchTerm = '';
    this.selectedCategory = '';
    this.selectedSystemId = getSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM) || '';
  }

  static DEFAULT_OPTIONS = {
    id: 'fabricate-recipe-manager',
    classes: ['fabricate', 'recipe-manager-app'],
    tag: 'div',
    window: {
      title: 'Crafting Admin',
      icon: 'fa-solid fa-book',
      resizable: true
    },
    position: {
      width: 980,
      height: 760
    },
    actions: {
      setTab: this._onSetTab,
      search: this._onSearch,
      itemSearch: this._onItemSearch,
      selectSystem: this._onSelectSystem,
      createSystem: this._onCreateSystem,
      deleteSystem: this._onDeleteSystem,
      createRecipe: this._onCreateRecipe,
      editRecipe: this._onEditRecipe,
      duplicateRecipe: this._onDuplicateRecipe,
      deleteRecipe: this._onDeleteRecipe,
      toggleEnabled: this._onToggleEnabled,
      importRecipes: this._onImportRecipes,
      exportRecipes: this._onExportRecipes,
      deleteComponent: this._onDeleteComponent,
      saveSystemDetails: this._onSaveSystemDetails,
      toggleAdvancedOptions: this._onToggleAdvancedOptions,
      toggleFeature: this._onToggleFeature,
      addSystemTag: this._onAddSystemTag,
      removeSystemTag: this._onRemoveSystemTag,
      addSystemEssenceDefinition: this._onAddSystemEssenceDefinition,
      removeSystemEssenceDefinition: this._onRemoveSystemEssenceDefinition,
      addSystemCategory: this._onAddSystemCategory,
      removeSystemCategory: this._onRemoveSystemCategory,
      saveCraftingCheckConfig: this._onSaveCraftingCheckConfig,
      toggleRequirement: this._onToggleRequirement,
      saveCurrencyRequirementConfig: this._onSaveCurrencyRequirementConfig,
      editComponent: this._onEditComponent,
      saveRecipeVisibilityConfig: this._onSaveRecipeVisibilityConfig
    }
  };

  static get PARTS() {
    return {
      manager: {
        template: 'modules/fabricate/templates/recipe-manager.hbs'
      }
    };
  }

  static _requireGM() {
    if (!game.user.isGM) {
      ui.notifications.error('Only GMs can manage crafting systems.');
      return false;
    }
    return true;
  }

  _ensureSelectedSystem(systems) {
    if (systems.length === 0) {
      this.selectedSystemId = '';
      return null;
    }
    const selected = systems.find(s => s.id === this.selectedSystemId);
    if (selected) return selected;
    this.selectedSystemId = systems[0].id;
    return systems[0];
  }

  _prepareRecipeContext(selectedSystem) {
    const manager = game.fabricate.getRecipeManager();
    const listMode = selectedSystem?.recipeVisibility?.listMode || 'global';
    const showVisibilitySummary = listMode === 'player';
    let recipes = selectedSystem
      ? manager.getRecipes({ craftingSystemId: selectedSystem.id })
      : [];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      recipes = recipes.filter(r =>
        r.name.toLowerCase().includes(search) ||
        r.description.toLowerCase().includes(search)
      );
    }

    if (this.selectedCategory) {
      recipes = recipes.filter(r => r.category === this.selectedCategory);
    }

    const categoriesMap = new Map();
    for (const recipe of selectedSystem ? manager.getRecipes({ craftingSystemId: selectedSystem.id }) : []) {
      const key = recipe.category || 'general';
      categoriesMap.set(key, (categoriesMap.get(key) || 0) + 1);
    }
    const categories = Array.from(categoriesMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const prepared = recipes.map(recipe => {
      const ingredientCount = recipe.ingredientSets.reduce((sum, set) => {
        const groupCount = Array.isArray(set.ingredientGroups) && set.ingredientGroups.length > 0
          ? set.ingredientGroups.reduce((groupSum, group) => groupSum + ((group.options || []).length || 0), 0)
          : (set.ingredients || []).length;
        return sum + groupCount;
      }, 0);
      const catalystCount = recipe.ingredientSets.reduce((sum, set) => sum + (set.catalysts?.length || 0), 0);
      return {
        id: recipe.id,
        name: recipe.name,
        img: recipe.img,
        category: recipe.category,
        visibilitySummary: (() => {
          const visibility = recipe.visibility || {};
          if (visibility.restricted !== true) return 'All players';
          const allowed = Array.isArray(visibility.allowedUserIds) ? visibility.allowedUserIds : [];
          if (allowed.length === 0) return 'Restricted (none selected)';
          return `Restricted (${allowed.length})`;
        })(),
        locked: recipe.locked === true,
        enabled: recipe.enabled,
        isSimple: recipe.isSimpleRecipe(),
        ingredients: new Array(ingredientCount),
        catalysts: new Array(catalystCount)
      };
    });

    return {
      search: this.searchTerm,
      selectedCategory: this.selectedCategory,
      showVisibilitySummary,
      categories,
      recipes: prepared
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const systemManager = game.fabricate.getCraftingSystemManager();
    const systems = systemManager.getSystems().map(s => ({
      ...s,
      requirements: s.requirements || { time: { enabled: false }, currency: { enabled: false, provider: 'macro' } },
      features: s.features || {},
      advancedOptionsEnabled: s.advancedOptionsEnabled !== false,
      enableTags: s.features?.itemTags === true,
      enableEssences: s.features?.essences === true,
      enableCategories: s.features?.recipeCategories === true,
      enableComplexRecipes: s.features?.complexRecipes === true,
      enableMultiStepRecipes: s.features?.multiStepRecipes === true,
      enablePropertyMacros: s.features?.propertyMacros === true,
      enableCraftingChecks: s.features?.craftingChecks === true,
      enableOutcomeRouting: s.features?.outcomeRouting === true,
      enableEffectTransfer: s.features?.effectTransfer === true,
      selected: s.id === this.selectedSystemId
    }));
    const selectedSystem = this._ensureSelectedSystem(systems);
    const availableScriptMacros = Array.from(game.macros?.contents || [])
      .filter(m => (m.type || '').toLowerCase() === 'script')
      .map(m => ({ uuid: m.uuid, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const advancedEnabled = selectedSystem?.advancedOptionsEnabled !== false;
    const showTags = advancedEnabled && selectedSystem?.enableTags === true;
    const showEssences = advancedEnabled && selectedSystem?.enableEssences === true;
    const managedItemOptions = (selectedSystem?.items || []).map(item => ({
      id: item.id,
      name: item.name
    }));
    const essenceDefinitions = Array.isArray(selectedSystem?.essenceDefinitions)
      ? selectedSystem.essenceDefinitions.map(def => ({
        ...def,
        // sourceItemUuid is authoritative; fall back to associatedSystemItemId for legacy data
        associatedItemName: managedItemOptions.find(opt => opt.id === (def.sourceItemUuid || def.associatedSystemItemId))?.name || null
      }))
      : [];
    const essenceNameById = new Map(essenceDefinitions.map(def => [def.id, def.name]));

    const itemCards = selectedSystem
      ? systemManager.getItems(selectedSystem.id, this.itemSearchTerm).map(item => ({
        ...item,
        img: item.img || 'icons/svg/item-bag.svg',
        tags: showTags ? (item.tags || []) : [],
        essences: showEssences ? Object.entries(item.essences || {}).map(([id, quantity]) => ({
          id,
          name: essenceNameById.get(id) || id,
          quantity
        })) : [],
        showTags,
        showEssences
      }))
      : [];

    const recipeContext = this._prepareRecipeContext(selectedSystem);

    return {
      ...context,
      activeTab: this.activeTab,
      hasSystem: !!selectedSystem,
      systems,
      selectedSystemId: this.selectedSystemId,
      selectedSystemName: selectedSystem?.name || '',
      selectedSystem: selectedSystem
        ? {
          ...selectedSystem,
          features: selectedSystem.features || {},
          requirements: selectedSystem.requirements || { time: { enabled: false }, currency: { enabled: false, provider: 'macro' } },
          advancedOptionsEnabled: selectedSystem.advancedOptionsEnabled !== false,
          enableTags: selectedSystem.features?.itemTags === true,
          enableEssences: selectedSystem.features?.essences === true,
          enableCategories: selectedSystem.features?.recipeCategories === true,
          enableComplexRecipes: selectedSystem.features?.complexRecipes === true,
          enableMultiStepRecipes: selectedSystem.features?.multiStepRecipes === true,
          enablePropertyMacros: selectedSystem.features?.propertyMacros === true,
          enableCraftingChecks: selectedSystem.features?.craftingChecks === true,
          enableOutcomeRouting: selectedSystem.features?.outcomeRouting === true,
          enableEffectTransfer: selectedSystem.features?.effectTransfer === true,
          essenceDefinitions,
          managedItemOptions,
          craftingCheckMode: selectedSystem.craftingCheck?.mode || 'passFail',
          craftingCheckMacroUuid: selectedSystem.craftingCheck?.macroUuid || '',
          craftingCheckOutcomesText: Array.isArray(selectedSystem.craftingCheck?.outcomes)
            ? selectedSystem.craftingCheck.outcomes.join(', ')
            : '',
          requirementsTimeEnabled: selectedSystem.requirements?.time?.enabled === true,
          requirementsCurrencyEnabled: selectedSystem.requirements?.currency?.enabled === true,
          currencyProvider: selectedSystem.requirements?.currency?.provider || 'macro',
          currencySystemAdapter: selectedSystem.requirements?.currency?.systemAdapter || '',
          checkCurrencyMacroUuid: selectedSystem.requirements?.currency?.checkCurrencyMacroUuid || '',
          decrementCurrencyMacroUuid: selectedSystem.requirements?.currency?.decrementCurrencyMacroUuid || '',
          formatCurrencyMacroUuid: selectedSystem.requirements?.currency?.formatCurrencyMacroUuid || '',
          availableScriptMacros,
          showTags,
          showEssences,
          recipeVisibilityListMode: selectedSystem.recipeVisibility?.listMode || 'global',
          recipeVisibilityKnowledgeMode: selectedSystem.recipeVisibility?.knowledge?.mode || 'itemOrLearned',
          recipeVisibilityConsumeOnLearn: selectedSystem.recipeVisibility?.knowledge?.learn?.consumeOnLearn !== false,
          showRecipeVisibilityKnowledgeOptions: (selectedSystem.recipeVisibility?.listMode || 'global') === 'knowledge',
          showRecipeVisibilityPlayerNote: (selectedSystem.recipeVisibility?.listMode || 'global') === 'player'
        }
        : null,
      itemSearch: this.itemSearchTerm,
      components: itemCards,
      systemItems: itemCards,
      ...recipeContext
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const recipeSearch = this.element.querySelector('input[name="search"]');
    if (recipeSearch) {
      recipeSearch.addEventListener('input', async (event) => {
        this.searchTerm = event.target.value || '';
        await this.render();
      });
    }

    const itemSearch = this.element.querySelector('input[name="itemSearch"]');
    if (itemSearch) {
      itemSearch.addEventListener('input', async (event) => {
        this.itemSearchTerm = event.target.value || '';
        await this.render();
      });
    }

    const itemDropZone = this.element.querySelector('[data-drop-zone="system-item"]');
    if (itemDropZone) {
      itemDropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        itemDropZone.classList.add('drop-active');
      });
      itemDropZone.addEventListener('dragleave', () => itemDropZone.classList.remove('drop-active'));
      itemDropZone.addEventListener('drop', async (event) => {
        event.preventDefault();
        itemDropZone.classList.remove('drop-active');
        if (!this.selectedSystemId) return;
        const uuid = this._extractDroppedUuid(event);
        if (!uuid) {
          ui.notifications.warn('Drop an Item document from sidebar or compendium.');
          return;
        }
        await game.fabricate.getCraftingSystemManager().addItemFromUuid(this.selectedSystemId, uuid);
        await this.render();
      });
    }

    const replaceZones = this.element.querySelectorAll('[data-drop-zone="system-item-replace"]');
    for (const zone of replaceZones) {
      zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        zone.classList.add('drop-active');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drop-active'));
      zone.addEventListener('drop', async (event) => {
        event.preventDefault();
        zone.classList.remove('drop-active');
        if (!this.selectedSystemId) return;
        const itemId = zone.dataset.itemId;
        if (!itemId) return;
        const uuid = this._extractDroppedUuid(event);
        if (!uuid) {
          ui.notifications.warn('Drop an Item document from sidebar or compendium.');
          return;
        }
        let source = null;
        try {
          source = await fromUuid(uuid);
        } catch (err) {
          source = null;
        }
        const updates = {
          sourceUuid: uuid,
          name: source?.name || zone.dataset.itemName || 'Managed Item',
          img: source?.img || 'icons/svg/item-bag.svg'
        };
        await game.fabricate.getCraftingSystemManager().updateItem(this.selectedSystemId, itemId, updates);
        await this.render();
      });
    }
  }

  _extractDroppedUuid(event) {
    const data = (() => {
      try {
        return getDragEventData(event);
      } catch (err) {
        return null;
      }
    })();
    if (data?.uuid) return data.uuid;
    if (data?.pack && data?.id) return `Compendium.${data.pack}.${data.id}`;
    const text = event.dataTransfer?.getData('text/plain') || '';
    if (text.startsWith('Item.') || text.startsWith('Compendium.')) return text.trim();
    return null;
  }

  static async _onSetTab(event, target) {
    this.activeTab = target.dataset.tab || 'systems';
    await this.render();
  }

  static async _onSearch(event, target) {
    this.searchTerm = target.value || '';
    await this.render();
  }

  static async _onItemSearch(event, target) {
    this.itemSearchTerm = target.value || '';
    await this.render();
  }

  static async _onSelectSystem(event, target) {
    event.preventDefault();
    this.selectedSystemId = target.dataset.systemId || '';
    await setSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM, this.selectedSystemId);
    await this.render();
  }

  static async _onCreateSystem(event, target) {
    if (!this.constructor._requireGM()) return;
    const name = this._nextSystemName();
    const description = 'Configure categories, item tags, essences, and crafting behaviour for this system.';
    const system = await game.fabricate.getCraftingSystemManager().createSystem({ name, description });
    this.selectedSystemId = system.id;
    this.activeTab = 'systems';
    await setSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM, system.id);
    await this.render();
  }

  static async _onDeleteSystem(event, target) {
    if (!this.constructor._requireGM()) return;
    const systemId = target.dataset.systemId || this.selectedSystemId;
    if (!systemId) return;
    const system = game.fabricate.getCraftingSystemManager().getSystem(systemId);
    if (!system) return;

    const confirmed = await confirmDialog({
      title: `Delete ${system.name}?`,
      content: `<p>Delete crafting system <strong>${system.name}</strong>? Recipes linked to it will be deleted.</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    await game.fabricate.getCraftingSystemManager().deleteSystem(systemId);
    const remaining = game.fabricate.getCraftingSystemManager().getSystems();
    this.selectedSystemId = remaining[0]?.id || '';
    await setSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM, this.selectedSystemId || '');
    await this.render();
  }

  static async _onCreateRecipe(event, target) {
    if (!this.constructor._requireGM()) return;
    if (!this.selectedSystemId) {
      ui.notifications.warn('Create or select a crafting system first.');
      return;
    }
    getRecipeEditorAppClass().show(null, this, this.selectedSystemId);
  }

  static async _onEditRecipe(event, target) {
    if (!this.constructor._requireGM()) return;
    const recipeId = target.dataset.recipeId;
    const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
    if (!recipe) return;
    getRecipeEditorAppClass().show(recipe, this, recipe.craftingSystemId || this.selectedSystemId);
  }

  static async _onDuplicateRecipe(event, target) {
    if (!this.constructor._requireGM()) return;
    const recipeId = target.dataset.recipeId;
    const manager = game.fabricate.getRecipeManager();
    const recipe = manager.getRecipe(recipeId);
    if (!recipe) return;
    const data = recipe.toJSON();
    delete data.id;
    data.name = `${data.name} (Copy)`;
    await manager.createRecipe(data);
    await this.render();
  }

  static async _onDeleteRecipe(event, target) {
    if (!this.constructor._requireGM()) return;
    const recipeId = target.dataset.recipeId;
    const manager = game.fabricate.getRecipeManager();
    const recipe = manager.getRecipe(recipeId);
    if (!recipe) return;
    const confirmed = await confirmDialog({
      title: `Delete ${recipe.name}?`,
      content: `<p>Delete recipe <strong>${recipe.name}</strong>?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;
    await manager.deleteRecipe(recipeId);
    await this.render();
  }

  static async _onToggleEnabled(event, target) {
    if (!this.constructor._requireGM()) return;
    const recipeId = target.dataset.recipeId;
    const enabled = target.checked;
    await game.fabricate.getRecipeManager().updateRecipe(recipeId, { enabled });
    await this.render();
  }

  static async _onImportRecipes(event, target) {
    if (!this.constructor._requireGM()) return;
    if (!this.selectedSystemId) {
      ui.notifications.warn('Create or select a crafting system first.');
      return;
    }
    const content = `
      <p>Paste recipe JSON array. Imported recipes will be assigned to the selected system.</p>
      <textarea id="fabricate-import-json" rows="12" style="width:100%;"></textarea>
      <p><label><input id="fabricate-import-overwrite" type="checkbox" /> Overwrite existing IDs</label></p>
    `;

    renderDialog({
      title: 'Import Recipes',
      content,
      buttons: {
        import: {
          label: 'Import',
          callback: async (html) => {
            try {
              const raw = html.find('#fabricate-import-json').val();
              const overwrite = html.find('#fabricate-import-overwrite').is(':checked');
              const data = JSON.parse(raw).map(r => ({ ...r, craftingSystemId: this.selectedSystemId }));
              await game.fabricate.getRecipeManager().importRecipes(data, overwrite);
              await this.render();
            } catch (err) {
              ui.notifications.error(`Import failed: ${err.message}`);
            }
          }
        },
        cancel: { label: 'Cancel' }
      }
    });
  }

  static async _onExportRecipes(event, target) {
    if (!this.constructor._requireGM()) return;
    try {
      const data = this.selectedSystemId
        ? game.fabricate.getRecipeManager().getRecipes({ craftingSystemId: this.selectedSystemId }).map(r => r.toJSON())
        : game.fabricate.getRecipeManager().exportRecipes();
      const json = JSON.stringify(data, null, 2);
      await foundry.utils.copyPlainText(json);
      ui.notifications.info(`Exported ${data.length} recipes to clipboard.`);
    } catch (err) {
      ui.notifications.error(`Export failed: ${err.message}`);
    }
  }

  static async _onDeleteComponent(event, target) {
    if (!this.constructor._requireGM()) return;
    const itemId = target.dataset.itemId;
    if (!itemId || !this.selectedSystemId) return;
    const system = game.fabricate.getCraftingSystemManager().getSystem(this.selectedSystemId);
    const item = system?.items.find(i => i.id === itemId);
    if (!item) return;
    const confirmed = await confirmDialog({
      title: `Delete ${item.name}?`,
      content: `<p>Delete managed item <strong>${item.name}</strong> and remove it from recipes in this system?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;
    await game.fabricate.getCraftingSystemManager().deleteItem(this.selectedSystemId, itemId);
    await this.render();
  }

  static async _onEditComponent(event, target) {
    if (!this.constructor._requireGM()) return;
    const itemId = target.dataset.itemId;
    const system = this._selectedSystem();
    if (!system || !itemId) return;
    const item = system.items.find(i => i.id === itemId);
    if (!item) return;

    const advancedEnabled = system.advancedOptionsEnabled !== false;
    const showTags = advancedEnabled && (system.features?.itemTags === true);
    const showEssences = advancedEnabled && (system.features?.essences === true);

    const tagOptions = (system.itemTags || system.tags || []).map(tag => ({
      tag,
      checked: (item.tags || []).includes(tag)
    }));

    const essenceOptions = (system.essenceDefinitions || []).map(def => ({
      id: def.id,
      name: def.name,
      quantity: Number(item.essences?.[def.id] || 0)
    }));

    let content = '<form class="fabricate-item-editor">';
    content += `<h3>${item.name}</h3>`;
    content += '<p class="hint">Edit tags and essences for this managed item.</p>';

    if (showTags) {
      content += '<div class="form-group"><label>Tags</label>';
      if (tagOptions.length) {
        for (const opt of tagOptions) {
          content += `<label class="checkbox-row"><input type="checkbox" name="itemTag" value="${opt.tag}" ${opt.checked ? 'checked' : ''} /> ${opt.tag}</label>`;
        }
      } else {
        content += '<p class="hint">No tags defined in this system.</p>';
      }
      content += '</div>';
    }

    if (showEssences) {
      content += '<div class="form-group"><label>Essences</label>';
      if (essenceOptions.length) {
        for (const opt of essenceOptions) {
          content += `<label class="essence-row">${opt.name} <input type="number" name="essence.${opt.id}" min="0" value="${opt.quantity || ''}" /></label>`;
        }
      } else {
        content += '<p class="hint">No essences defined in this system.</p>';
      }
      content += '</div>';
    }

    if (!showTags && !showEssences) {
      content += '<p class="hint">Advanced options are disabled for this system.</p>';
    }

    content += '</form>';

    renderDialog({
      title: `Edit ${item.name}`,
      content,
      buttons: {
        save: {
          label: 'Save',
          callback: async (html) => {
            const updates = {};
            if (showTags) {
              updates.tags = html.find('input[name="itemTag"]:checked')
                .map((_, el) => el.value)
                .get();
            }
            if (showEssences) {
              const essences = {};
              for (const opt of essenceOptions) {
                const value = Number(html.find(`input[name="essence.${opt.id}"]`).val() || 0);
                if (value > 0) essences[opt.id] = value;
              }
              updates.essences = essences;
            }
            await game.fabricate.getCraftingSystemManager().updateItem(system.id, itemId, updates);
            await this.render();
          }
        },
        cancel: { label: 'Cancel' }
      }
    });
  }

  _nextSystemName() {
    const base = 'New Crafting System';
    const names = new Set(game.fabricate.getCraftingSystemManager().getSystems().map(s => s.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  _selectedSystem() {
    if (!this.selectedSystemId) return null;
    return game.fabricate.getCraftingSystemManager().getSystem(this.selectedSystemId);
  }

  _readInput(name) {
    const el = this.element?.querySelector(`[name="${name}"]`);
    return el?.value?.trim() || '';
  }

  static async _onSaveSystemDetails() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const name = this._readInput('systemName') || system.name;
    const description = this._readInput('systemDescription');
    const advancedOptionsEnabled = this.element?.querySelector('input[name="systemAdvancedEnabled"]')?.checked !== false;
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { name, description, advancedOptionsEnabled });
    await this.render();
  }

  static async _onToggleAdvancedOptions(event, target) {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, {
      advancedOptionsEnabled: target.checked
    });
    await this.render();
  }

  static async _onToggleFeature(event, target) {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    if (system.advancedOptionsEnabled === false) return;
    const feature = target.dataset.feature;
    const mapping = {
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
    const key = mapping[feature];
    if (!key) return;
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, {
      features: { [key]: target.checked }
    });
    await this.render();
  }

  static async _onToggleRequirement(event, target) {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    if (system.advancedOptionsEnabled === false) return;
    const requirement = String(target.dataset.requirement || '').trim();
    if (!['time', 'currency'].includes(requirement)) return;

    const requirements = foundry.utils.deepClone(system.requirements || {
      time: { enabled: false },
      currency: { enabled: false, provider: 'macro', systemAdapter: undefined }
    });
    requirements[requirement] = requirements[requirement] || {};
    requirements[requirement].enabled = target.checked === true;
    if (requirement === 'currency') {
      requirements.currency.provider = requirements.currency.provider || 'macro';
    }

    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { requirements });
    await this.render();
  }

  static async _onSaveCurrencyRequirementConfig() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    if (system.advancedOptionsEnabled === false) return;

    const provider = this._readInput('currencyProvider') === 'system' ? 'system' : 'macro';
    const systemAdapter = this._readInput('currencySystemAdapter');
    const checkCurrencyMacroUuid = this._readInput('checkCurrencyMacroUuid') || null;
    const decrementCurrencyMacroUuid = this._readInput('decrementCurrencyMacroUuid') || null;
    const formatCurrencyMacroUuid = this._readInput('formatCurrencyMacroUuid') || null;

    const requirements = foundry.utils.deepClone(system.requirements || {
      time: { enabled: false },
      currency: { enabled: false, provider: 'macro', systemAdapter: undefined }
    });
    requirements.currency = {
      ...(requirements.currency || {}),
      enabled: requirements.currency?.enabled === true,
      provider,
      systemAdapter: provider === 'system' ? (['dnd5e', 'pf2e'].includes(systemAdapter) ? systemAdapter : undefined) : undefined,
      checkCurrencyMacroUuid: provider === 'macro' ? checkCurrencyMacroUuid : null,
      decrementCurrencyMacroUuid: provider === 'macro' ? decrementCurrencyMacroUuid : null,
      formatCurrencyMacroUuid: provider === 'macro' ? formatCurrencyMacroUuid : null
    };

    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { requirements });
    await this.render();
  }

  static async _onAddSystemTag() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const tagsEnabled = system.features?.itemTags === true;
    if (system.advancedOptionsEnabled === false || !tagsEnabled) return;
    const value = this._readInput('newSystemTag').toLowerCase();
    if (!value) return;
    const tags = Array.from(new Set([...(system.itemTags || system.tags || []), value]));
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { itemTags: tags });
    await this.render();
  }

  static async _onRemoveSystemTag(event, target) {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const tag = target.dataset.tag;
    const tags = (system.itemTags || system.tags || []).filter(t => t !== tag);
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { itemTags: tags });
    await this.render();
  }

  static async _onAddSystemEssenceDefinition() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const essencesEnabled = (system.features?.essences === true) || system.enableEssences === true;
    if (system.advancedOptionsEnabled === false || !essencesEnabled) return;

    const name = this._readInput('newSystemEssenceName');
    const description = this._readInput('newSystemEssenceDescription');
    const icon = this._readInput('newSystemEssenceIcon') || 'fas fa-mortar-pestle';
    const sourceItemUuid = this.element?.querySelector('[name="newSystemEssenceAssociatedItem"]')?.value || null;
    if (!name) return;

    const existing = Array.isArray(system.essenceDefinitions)
      ? system.essenceDefinitions
      : (Array.isArray(system.essences) ? system.essences.map(e => ({ id: e, name: e, description: '', icon: 'fas fa-mortar-pestle', sourceItemUuid: null, associatedSystemItemId: null })) : []);

    const duplicate = existing.some(def => String(def.name || '').toLowerCase() === name.toLowerCase());
    if (duplicate) {
      ui.notifications.warn(`Essence "${name}" already exists in this system.`);
      return;
    }

    const essenceDefinitions = [
      ...existing,
      { name, description, icon, sourceItemUuid: sourceItemUuid || null, associatedSystemItemId: sourceItemUuid || null }
    ];
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { essenceDefinitions });
    await this.render();
  }

  static async _onRemoveSystemEssenceDefinition(event, target) {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const essenceId = target.dataset.essenceId;
    if (!essenceId) return;
    const essenceDefinitions = (system.essenceDefinitions || []).filter(def => def.id !== essenceId);
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { essenceDefinitions });
    await this.render();
  }

  static async _onAddSystemCategory() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const categoriesEnabled =
      system.features?.recipeCategories === true;
    if (system.advancedOptionsEnabled === false || !categoriesEnabled) return;
    const value = this._readInput('newSystemCategory');
    if (!value) return;
    const categories = Array.from(new Set([...(system.categories || []), value]));
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { categories });
    await this.render();
  }

  static async _onRemoveSystemCategory(event, target) {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const category = target.dataset.category;
    const categories = (system.categories || []).filter(t => t !== category);
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { categories });
    await this.render();
  }

  static async _onSaveCraftingCheckConfig() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;

    const checksEnabled = (system.features?.craftingChecks === true) || system.enableCraftingChecks === true;
    if (!checksEnabled) return;

    const mode = this._readInput('craftingCheckMode') === 'tiered' ? 'tiered' : 'passFail';
    const macroUuid = this._readInput('craftingCheckMacroUuid') || null;
    const rawOutcomes = this._readInput('craftingCheckOutcomes');
    const outcomes = rawOutcomes
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, {
      craftingCheck: {
        mode,
        macroUuid,
        outcomes
      }
    });
    await this.render();
  }

  static async _onSaveRecipeVisibilityConfig() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;

    const listModeEl = this.element?.querySelector('[name="recipeVisibilityListMode"]');
    const listMode = ['global', 'player', 'knowledge'].includes(listModeEl?.value)
      ? listModeEl.value
      : 'global';

    const knowledgeModeEl = this.element?.querySelector('[name="recipeVisibilityKnowledgeMode"]');
    const knowledgeMode = ['item', 'learned', 'itemOrLearned'].includes(knowledgeModeEl?.value)
      ? knowledgeModeEl.value
      : 'itemOrLearned';

    const consumeOnLearnEl = this.element?.querySelector('[name="recipeVisibilityConsumeOnLearn"]');
    const consumeOnLearn = consumeOnLearnEl ? consumeOnLearnEl.checked !== false : true;

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

    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { recipeVisibility });
    await this.render();
  }

  // Callers outside this class should use getRecipeManagerAppClass().show() from appFactory.js
  // to get the correct class for the active UI engine.
  // TODO T-129: once the Svelte variant exists, this method must not hardcode new RecipeManagerApp().
  static show() {
    if (!game.user.isGM) {
      ui.notifications.error('Only GMs can manage crafting systems.');
      return null;
    }
    const app = new RecipeManagerApp();
    app.render(true);
    return app;
  }
}
