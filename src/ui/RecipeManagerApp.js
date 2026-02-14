import { RecipeEditorApp } from './RecipeEditorApp.js';

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
    this.selectedSystemId = game.settings.get('fabricate-v2', 'lastManagedCraftingSystem') || '';
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
      deleteSystemItem: this._onDeleteSystemItem,
      saveSystemDetails: this._onSaveSystemDetails,
      addSystemTag: this._onAddSystemTag,
      removeSystemTag: this._onRemoveSystemTag,
      addSystemEssence: this._onAddSystemEssence,
      removeSystemEssence: this._onRemoveSystemEssence,
      addSystemCategory: this._onAddSystemCategory,
      removeSystemCategory: this._onRemoveSystemCategory
    }
  };

  static PARTS = {
    manager: {
      template: 'modules/fabricate-v2/templates/recipe-manager.hbs'
    }
  };

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
      const ingredientCount = recipe.ingredientSets.reduce((sum, set) => sum + set.ingredients.length, 0);
      const catalystCount = recipe.ingredientSets.reduce((sum, set) => sum + (set.catalysts?.length || 0), 0);
      return {
        id: recipe.id,
        name: recipe.name,
        img: recipe.img,
        category: recipe.category,
        enabled: recipe.enabled,
        isSimple: recipe.isSimpleRecipe(),
        ingredients: new Array(ingredientCount),
        catalysts: new Array(catalystCount)
      };
    });

    return {
      search: this.searchTerm,
      selectedCategory: this.selectedCategory,
      categories,
      recipes: prepared
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const systemManager = game.fabricate.getCraftingSystemManager();
    const systems = systemManager.getSystems().map(s => ({
      ...s,
      selected: s.id === this.selectedSystemId
    }));
    const selectedSystem = this._ensureSelectedSystem(systems);

    const itemCards = selectedSystem
      ? systemManager.getItems(selectedSystem.id, this.itemSearchTerm).map(item => ({
        ...item,
        img: item.img || 'icons/svg/item-bag.svg',
        tierLabel: item.tier || 'No tier'
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
      selectedSystem,
      itemSearch: this.itemSearchTerm,
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
  }

  _extractDroppedUuid(event) {
    try {
      const data = TextEditor.getDragEventData(event);
      if (data?.uuid) return data.uuid;
      if (data?.pack && data?.id) return `Compendium.${data.pack}.${data.id}`;
      return null;
    } catch (err) {
      const text = event.dataTransfer?.getData('text/plain') || '';
      if (text.startsWith('Item.') || text.startsWith('Compendium.')) return text.trim();
      return null;
    }
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
    await game.settings.set('fabricate-v2', 'lastManagedCraftingSystem', this.selectedSystemId);
    await this.render();
  }

  static async _onCreateSystem(event, target) {
    if (!this.constructor._requireGM()) return;
    const name = this._nextSystemName();
    const description = 'Configure tags, essences, categories, and global crafting rules for this system.';
    const system = await game.fabricate.getCraftingSystemManager().createSystem({ name, description });
    this.selectedSystemId = system.id;
    this.activeTab = 'systems';
    await game.settings.set('fabricate-v2', 'lastManagedCraftingSystem', system.id);
    await this.render();
  }

  static async _onDeleteSystem(event, target) {
    if (!this.constructor._requireGM()) return;
    const systemId = target.dataset.systemId || this.selectedSystemId;
    if (!systemId) return;
    const system = game.fabricate.getCraftingSystemManager().getSystem(systemId);
    if (!system) return;

    const confirmed = await Dialog.confirm({
      title: `Delete ${system.name}?`,
      content: `<p>Delete crafting system <strong>${system.name}</strong>? Recipes linked to it will be disabled.</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    await game.fabricate.getCraftingSystemManager().deleteSystem(systemId);
    const remaining = game.fabricate.getCraftingSystemManager().getSystems();
    this.selectedSystemId = remaining[0]?.id || '';
    await game.settings.set('fabricate-v2', 'lastManagedCraftingSystem', this.selectedSystemId || '');
    await this.render();
  }

  static async _onCreateRecipe(event, target) {
    if (!this.constructor._requireGM()) return;
    if (!this.selectedSystemId) {
      ui.notifications.warn('Create or select a crafting system first.');
      return;
    }
    RecipeEditorApp.show(null, this, this.selectedSystemId);
  }

  static async _onEditRecipe(event, target) {
    if (!this.constructor._requireGM()) return;
    const recipeId = target.dataset.recipeId;
    const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
    if (!recipe) return;
    RecipeEditorApp.show(recipe, this, recipe.craftingSystemId || this.selectedSystemId);
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
    const confirmed = await Dialog.confirm({
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

    new Dialog({
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
    }).render(true);
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

  static async _onDeleteSystemItem(event, target) {
    if (!this.constructor._requireGM()) return;
    const itemId = target.dataset.itemId;
    if (!itemId || !this.selectedSystemId) return;
    const system = game.fabricate.getCraftingSystemManager().getSystem(this.selectedSystemId);
    const item = system?.items.find(i => i.id === itemId);
    if (!item) return;
    const confirmed = await Dialog.confirm({
      title: `Delete ${item.name}?`,
      content: `<p>Delete managed item <strong>${item.name}</strong> and remove it from recipes in this system?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;
    await game.fabricate.getCraftingSystemManager().deleteItem(this.selectedSystemId, itemId);
    await this.render();
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
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { name, description });
    await this.render();
  }

  static async _onAddSystemTag() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const value = this._readInput('newSystemTag').toLowerCase();
    if (!value) return;
    const tags = Array.from(new Set([...(system.tags || []), value]));
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { tags });
    await this.render();
  }

  static async _onRemoveSystemTag(event, target) {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const tag = target.dataset.tag;
    const tags = (system.tags || []).filter(t => t !== tag);
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { tags });
    await this.render();
  }

  static async _onAddSystemEssence() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const value = this._readInput('newSystemEssence').toLowerCase();
    if (!value) return;
    const essences = Array.from(new Set([...(system.essences || []), value]));
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { essences });
    await this.render();
  }

  static async _onRemoveSystemEssence(event, target) {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
    const essence = target.dataset.essence;
    const essences = (system.essences || []).filter(t => t !== essence);
    await game.fabricate.getCraftingSystemManager().updateSystem(system.id, { essences });
    await this.render();
  }

  static async _onAddSystemCategory() {
    if (!this.constructor._requireGM()) return;
    const system = this._selectedSystem();
    if (!system) return;
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
