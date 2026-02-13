import { RecipeEditorApp } from './RecipeEditorApp.js';

/**
 * GM recipe manager interface
 */
export class RecipeManagerApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(options = {}) {
    super(options);
    this.searchTerm = '';
    this.selectedCategory = '';
  }

  static DEFAULT_OPTIONS = {
    id: 'fabricate-recipe-manager',
    classes: ['fabricate', 'recipe-manager-app'],
    tag: 'div',
    window: {
      title: 'Recipe Manager',
      icon: 'fa-solid fa-book',
      resizable: true
    },
    position: {
      width: 920,
      height: 700
    },
    actions: {
      search: this._onSearch,
      filterCategory: this._onFilterCategory,
      createRecipe: this._onCreateRecipe,
      editRecipe: this._onEditRecipe,
      duplicateRecipe: this._onDuplicateRecipe,
      deleteRecipe: this._onDeleteRecipe,
      toggleEnabled: this._onToggleEnabled,
      importRecipes: this._onImportRecipes,
      exportRecipes: this._onExportRecipes
    }
  };

  static PARTS = {
    manager: {
      template: 'modules/fabricate-v2/templates/recipe-manager.hbs'
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const manager = game.fabricate.getRecipeManager();
    let recipes = manager.getRecipes();

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

    const allRecipes = manager.getRecipes();
    const categoriesMap = new Map();
    for (const recipe of allRecipes) {
      const key = recipe.category || 'general';
      categoriesMap.set(key, (categoriesMap.get(key) || 0) + 1);
    }

    const categories = Array.from(categoriesMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const preparedRecipes = recipes.map(recipe => {
      const ingredientCount = recipe.ingredientSets.reduce((sum, set) => sum + set.ingredients.length, 0);
      return {
        id: recipe.id,
        name: recipe.name,
        img: recipe.img,
        category: recipe.category,
        enabled: recipe.enabled,
        isSimple: recipe.isSimpleRecipe(),
        ingredients: new Array(ingredientCount),
        catalysts: recipe.catalysts
      };
    });

    return {
      ...context,
      search: this.searchTerm,
      selectedCategory: this.selectedCategory,
      totalRecipes: allRecipes.length,
      categories,
      recipes: preparedRecipes
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const searchInput = this.element.querySelector('input[name="search"]');
    if (searchInput) {
      searchInput.addEventListener('input', async (event) => {
        this.searchTerm = event.target.value;
        await this.render();
      });
    }
  }

  static _requireGM(instance) {
    if (!game.user.isGM) {
      ui.notifications.error('Only GMs can manage recipes.');
      return false;
    }
    return true;
  }

  static async _onSearch(event, target) {
    this.searchTerm = target.value || '';
    await this.render();
  }

  static async _onFilterCategory(event, target) {
    event.preventDefault();
    this.selectedCategory = target.dataset.category || '';
    await this.render();
  }

  static async _onCreateRecipe(event, target) {
    if (!this.constructor._requireGM(this)) return;
    RecipeEditorApp.show(null, this);
  }

  static async _onEditRecipe(event, target) {
    if (!this.constructor._requireGM(this)) return;
    const recipeId = target.dataset.recipeId;
    const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
    if (!recipe) return;
    RecipeEditorApp.show(recipe, this);
  }

  static async _onDuplicateRecipe(event, target) {
    if (!this.constructor._requireGM(this)) return;
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
    if (!this.constructor._requireGM(this)) return;
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
    if (!this.constructor._requireGM(this)) return;
    const recipeId = target.dataset.recipeId;
    const enabled = target.checked;
    await game.fabricate.getRecipeManager().updateRecipe(recipeId, { enabled });
    await this.render();
  }

  static async _onImportRecipes(event, target) {
    if (!this.constructor._requireGM(this)) return;

    const content = `
      <p>Paste recipe JSON array:</p>
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
              const data = JSON.parse(raw);
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
    if (!this.constructor._requireGM(this)) return;
    try {
      const data = game.fabricate.getRecipeManager().exportRecipes();
      const json = JSON.stringify(data, null, 2);
      await foundry.utils.copyPlainText(json);
      ui.notifications.info(`Exported ${data.length} recipes to clipboard.`);
    } catch (err) {
      ui.notifications.error(`Export failed: ${err.message}`);
    }
  }

  static show() {
    if (!game.user.isGM) {
      ui.notifications.error('Only GMs can manage recipes.');
      return null;
    }

    const app = new RecipeManagerApp();
    app.render(true);
    return app;
  }
}

