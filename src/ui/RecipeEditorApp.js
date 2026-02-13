import { Recipe } from '../models/Recipe.js';

/**
 * GM recipe editor with drag/drop and set carousels
 */
export class RecipeEditorApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(recipe = null, options = {}) {
    super(options);
    this.recipe = recipe;
    this.activeIngredientSetIndex = 0;
    this.activeResultIndex = 0;
    this.draft = this._buildDraft(recipe);
  }

  static DEFAULT_OPTIONS = {
    id: 'fabricate-recipe-editor-v2',
    classes: ['fabricate', 'recipe-editor-app'],
    tag: 'div',
    window: {
      title: 'Recipe Editor',
      icon: 'fa-solid fa-flask',
      resizable: true
    },
    position: {
      width: 900,
      height: 760
    },
    actions: {
      saveRecipe: this._onSaveRecipe,
      cancel: this._onCancel,
      prevIngredientSet: this._onPrevIngredientSet,
      nextIngredientSet: this._onNextIngredientSet,
      addIngredientSet: this._onAddIngredientSet,
      removeIngredientSet: this._onRemoveIngredientSet,
      addIngredientRow: this._onAddIngredientRow,
      removeIngredientRow: this._onRemoveIngredientRow,
      prevResultSet: this._onPrevResultSet,
      nextResultSet: this._onNextResultSet,
      addResultSet: this._onAddResultSet,
      removeResultSet: this._onRemoveResultSet
    }
  };

  static PARTS = {
    editor: {
      template: 'modules/fabricate-v2/templates/recipe-editor-v2.hbs'
    }
  };

  _buildDraft(recipe) {
    const data = recipe?.toJSON() || {};

    const ingredientSets = (data.ingredientSets || []).length > 0
      ? data.ingredientSets
      : [{
        id: foundry.utils.randomID(),
        name: 'Set 1',
        ingredients: [{ itemUuid: '', tag: '', quantity: 1, tier: '' }],
        essences: {},
        resultMapping: []
      }];

    const results = (data.results || []).length > 0
      ? data.results
      : [{
        id: foundry.utils.randomID(),
        itemUuid: '',
        quantity: 1,
        propertyFormulas: {}
      }];

    return {
      id: data.id || null,
      name: data.name || '',
      description: data.description || '',
      img: data.img || 'icons/svg/item-bag.svg',
      category: data.category || 'general',
      system: data.system || 'all',
      enabled: data.enabled !== false,
      isVariable: data.isVariable === true,
      transferEffects: data.transferEffects === true,
      requiresAllSets: data.requiresAllSets === true,
      tagsText: Array.isArray(data.tags) ? data.tags.join(', ') : '',
      ingredientSets: ingredientSets.map((set, idx) => ({
        id: set.id || foundry.utils.randomID(),
        name: set.name || `Set ${idx + 1}`,
        ingredients: (set.ingredients || []).length > 0
          ? set.ingredients.map(ing => ({
            itemUuid: ing.itemUuid || '',
            tag: ing.tag || '',
            quantity: Number(ing.quantity || 1),
            tier: ing.tier || '',
            extractEffects: ing.extractEffects === true,
            effectFilter: ing.effectFilter || ''
          }))
          : [{ itemUuid: '', tag: '', quantity: 1, tier: '', extractEffects: false, effectFilter: '' }],
        essences: set.essences || {},
        resultMapping: Array.isArray(set.resultMapping) ? set.resultMapping : []
      })),
      results: results.map(res => ({
        id: res.id || foundry.utils.randomID(),
        itemUuid: res.itemUuid || '',
        quantity: Number(res.quantity || 1),
        propertyFormulas: res.propertyFormulas || {}
      })),
      catalysts: Array.isArray(data.catalysts) ? data.catalysts : [],
      metadata: data.metadata || undefined
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const categories = [...new Set(
      game.fabricate.getRecipeManager().getRecipes().map(r => r.category).filter(Boolean)
    )].sort();

    const ingredientSet = this.draft.ingredientSets[this.activeIngredientSetIndex] || this.draft.ingredientSets[0];
    const resultSet = this.draft.results[this.activeResultIndex] || this.draft.results[0];

    return {
      ...context,
      recipe: this.draft,
      isEdit: !!this.recipe,
      availableCategories: categories,
      ingredientSet,
      resultSet,
      ingredientSetIndex: this.activeIngredientSetIndex + 1,
      resultIndex: this.activeResultIndex + 1,
      ingredientSetCount: this.draft.ingredientSets.length,
      resultCount: this.draft.results.length
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._bindFormSync();
    this._bindDropZones();
  }

  _bindFormSync() {
    const form = this.element.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.constructor._onSaveRecipe.call(this, event, { dataset: {} });
    });

    form.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', () => this._syncDraftFromForm());
      el.addEventListener('change', () => this._syncDraftFromForm());
    });
  }

  _bindDropZones() {
    const zones = this.element.querySelectorAll('[data-drop-zone]');
    for (const zone of zones) {
      zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        zone.classList.add('drop-active');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drop-active');
      });
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('drop-active');
        this._syncDraftFromForm();
        const uuid = this._extractDroppedUuid(event);
        if (!uuid) {
          ui.notifications.warn('Drop an Item document from sidebar or compendium.');
          return;
        }
        if (zone.dataset.dropZone === 'ingredient') {
          this._addIngredientFromDrop(uuid);
        } else if (zone.dataset.dropZone === 'result') {
          this._setResultFromDrop(uuid);
        }
      });
    }
  }

  _extractDroppedUuid(event) {
    try {
      const text = event.dataTransfer?.getData('text/plain') || '';
      const data = TextEditor.getDragEventData
        ? TextEditor.getDragEventData(event)
        : (text ? JSON.parse(text) : {});

      if (data?.uuid) return data.uuid;
      if (data?.pack && data?.id) return `Compendium.${data.pack}.${data.id}`;
      if (typeof text === 'string' && (text.startsWith('Item.') || text.startsWith('Compendium.'))) {
        return text.trim();
      }
      return null;
    } catch (err) {
      const text = event.dataTransfer?.getData('text/plain') || '';
      if (typeof text === 'string' && (text.startsWith('Item.') || text.startsWith('Compendium.'))) {
        return text.trim();
      }
      return null;
    }
  }

  _addIngredientFromDrop(uuid) {
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.ingredients.push({
      itemUuid: uuid,
      tag: '',
      quantity: 1,
      tier: '',
      extractEffects: false,
      effectFilter: ''
    });
    this.render();
  }

  _setResultFromDrop(uuid) {
    const result = this.draft.results[this.activeResultIndex];
    result.itemUuid = uuid;
    this.render();
  }

  _syncDraftFromForm() {
    const form = this.element.querySelector('form');
    if (!form) return;
    const fd = new FormData(form);
    const get = (key, fallback = '') => (fd.get(key) ?? fallback).toString().trim();
    const getNum = (key, fallback = 1) => {
      const n = Number(get(key, fallback));
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };

    this.draft.name = get('name');
    this.draft.description = get('description');
    this.draft.img = get('img', 'icons/svg/item-bag.svg');
    this.draft.category = get('category', 'general');
    this.draft.system = get('system', 'all');
    this.draft.enabled = fd.get('enabled') === 'on';
    this.draft.isVariable = fd.get('isVariable') === 'on';
    this.draft.transferEffects = fd.get('transferEffects') === 'on';
    this.draft.requiresAllSets = fd.get('requiresAllSets') === 'on';
    this.draft.tagsText = get('tags');

    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.name = get('ingredientSet.name', set.name);
    for (let i = 0; i < set.ingredients.length; i++) {
      set.ingredients[i].itemUuid = get(`ingredients.${i}.itemUuid`);
      set.ingredients[i].tag = get(`ingredients.${i}.tag`);
      set.ingredients[i].quantity = getNum(`ingredients.${i}.quantity`, 1);
      set.ingredients[i].tier = get(`ingredients.${i}.tier`);
      set.ingredients[i].extractEffects = fd.get(`ingredients.${i}.extractEffects`) === 'on';
      set.ingredients[i].effectFilter = get(`ingredients.${i}.effectFilter`);
    }

    const result = this.draft.results[this.activeResultIndex];
    result.itemUuid = get('result.itemUuid');
    result.quantity = getNum('result.quantity', 1);
    const formulas = get('result.propertyFormulas');
    if (formulas) {
      try {
        result.propertyFormulas = JSON.parse(formulas);
      } catch (err) {
        // Keep previous formulas if current input is invalid JSON.
      }
    } else {
      result.propertyFormulas = {};
    }
  }

  _buildRecipePayload() {
    const base = this.recipe ? this.recipe.toJSON() : {};
    const tags = this.draft.tagsText.split(',').map(t => t.trim()).filter(Boolean);

    const ingredientSets = this.draft.ingredientSets.map((set, idx) => ({
      id: set.id || foundry.utils.randomID(),
      name: set.name || `Set ${idx + 1}`,
      ingredients: set.ingredients
        .filter(ing => ing.itemUuid || ing.tag)
        .map(ing => ({
          itemUuid: ing.itemUuid || null,
          tag: ing.tag || null,
          quantity: Number(ing.quantity || 1),
          tier: ing.tier || null,
          extractEffects: ing.extractEffects === true,
          effectFilter: ing.effectFilter || null
        })),
      essences: set.essences || {},
      resultMapping: this.draft.isVariable ? (set.resultMapping || []) : []
    }));

    const results = this.draft.results.map(res => ({
      id: res.id || foundry.utils.randomID(),
      itemUuid: res.itemUuid || null,
      quantity: Number(res.quantity || 1),
      propertyFormulas: res.propertyFormulas || {}
    }));

    return {
      ...base,
      name: this.draft.name,
      description: this.draft.description,
      img: this.draft.img,
      category: this.draft.category || 'general',
      system: this.draft.system || 'all',
      enabled: this.draft.enabled,
      tags,
      ingredientSets,
      catalysts: Array.isArray(base.catalysts) ? base.catalysts : [],
      results,
      isVariable: this.draft.isVariable,
      transferEffects: this.draft.transferEffects,
      requiresAllSets: this.draft.requiresAllSets,
      metadata: base.metadata || this.draft.metadata
    };
  }

  static async _onPrevIngredientSet(event, target) {
    this._syncDraftFromForm();
    this.activeIngredientSetIndex =
      (this.activeIngredientSetIndex - 1 + this.draft.ingredientSets.length) % this.draft.ingredientSets.length;
    await this.render();
  }

  static async _onNextIngredientSet(event, target) {
    this._syncDraftFromForm();
    this.activeIngredientSetIndex = (this.activeIngredientSetIndex + 1) % this.draft.ingredientSets.length;
    await this.render();
  }

  static async _onAddIngredientSet(event, target) {
    this._syncDraftFromForm();
    this.draft.ingredientSets.push({
      id: foundry.utils.randomID(),
      name: `Set ${this.draft.ingredientSets.length + 1}`,
      ingredients: [{ itemUuid: '', tag: '', quantity: 1, tier: '', extractEffects: false, effectFilter: '' }],
      essences: {},
      resultMapping: []
    });
    this.activeIngredientSetIndex = this.draft.ingredientSets.length - 1;
    await this.render();
  }

  static async _onRemoveIngredientSet(event, target) {
    this._syncDraftFromForm();
    if (this.draft.ingredientSets.length <= 1) {
      ui.notifications.warn('A recipe needs at least one ingredient set.');
      return;
    }
    this.draft.ingredientSets.splice(this.activeIngredientSetIndex, 1);
    this.activeIngredientSetIndex = Math.max(0, this.activeIngredientSetIndex - 1);
    await this.render();
  }

  static async _onAddIngredientRow(event, target) {
    this._syncDraftFromForm();
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.ingredients.push({ itemUuid: '', tag: '', quantity: 1, tier: '', extractEffects: false, effectFilter: '' });
    await this.render();
  }

  static async _onRemoveIngredientRow(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.index);
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    if (set.ingredients.length <= 1) {
      ui.notifications.warn('Keep at least one ingredient row in this set.');
      return;
    }
    set.ingredients.splice(idx, 1);
    await this.render();
  }

  static async _onPrevResultSet(event, target) {
    this._syncDraftFromForm();
    this.activeResultIndex = (this.activeResultIndex - 1 + this.draft.results.length) % this.draft.results.length;
    await this.render();
  }

  static async _onNextResultSet(event, target) {
    this._syncDraftFromForm();
    this.activeResultIndex = (this.activeResultIndex + 1) % this.draft.results.length;
    await this.render();
  }

  static async _onAddResultSet(event, target) {
    this._syncDraftFromForm();
    this.draft.results.push({
      id: foundry.utils.randomID(),
      itemUuid: '',
      quantity: 1,
      propertyFormulas: {}
    });
    this.activeResultIndex = this.draft.results.length - 1;
    await this.render();
  }

  static async _onRemoveResultSet(event, target) {
    this._syncDraftFromForm();
    if (this.draft.results.length <= 1) {
      ui.notifications.warn('A recipe needs at least one result.');
      return;
    }
    this.draft.results.splice(this.activeResultIndex, 1);
    this.activeResultIndex = Math.max(0, this.activeResultIndex - 1);
    await this.render();
  }

  static async _onSaveRecipe(event, target) {
    if (!game.user.isGM) {
      ui.notifications.error('Only GMs can manage recipes.');
      return;
    }

    try {
      this._syncDraftFromForm();
      const payload = this._buildRecipePayload();
      const validation = new Recipe(payload).validate();
      if (!validation.valid) {
        ui.notifications.error(`Cannot save recipe: ${validation.errors.join('; ')}`);
        return;
      }

      const manager = game.fabricate.getRecipeManager();
      if (this.recipe) {
        await manager.updateRecipe(this.recipe.id, payload);
      } else {
        await manager.createRecipe(payload);
      }

      this.close();
      if (this.options.parentApp) {
        await this.options.parentApp.render();
      }
    } catch (err) {
      console.error('Fabricate v2 | Recipe save failed', err);
      ui.notifications.error(err.message || 'Failed to save recipe.');
    }
  }

  static async _onCancel(event, target) {
    this.close();
  }

  static show(recipe = null, parentApp = null) {
    const app = new RecipeEditorApp(recipe, { parentApp });
    app.render(true);
    return app;
  }
}
