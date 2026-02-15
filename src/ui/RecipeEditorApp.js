import { Recipe } from '../models/Recipe.js';
import { getDragEventData } from './foundryCompat.js';

/**
 * GM recipe editor with system-item picker grid
 */
export class RecipeEditorApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(recipe = null, options = {}) {
    super(options);
    this.recipe = recipe;
    this.craftingSystemId = options.craftingSystemId || recipe?.craftingSystemId || null;
    this.activeIngredientSetIndex = 0;
    this.activeResultIndex = 0;
    this.itemPickerSearch = '';
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
      width: 1080,
      height: 780
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
      addTagIngredientRow: this._onAddTagIngredientRow,
      removeTagIngredientRow: this._onRemoveTagIngredientRow,
      addCatalystRow: this._onAddCatalystRow,
      removeCatalystRow: this._onRemoveCatalystRow,
      clearCatalystSystemItem: this._onClearCatalystSystemItem,
      prevResultSet: this._onPrevResultSet,
      nextResultSet: this._onNextResultSet,
      addResultSet: this._onAddResultSet,
      removeResultSet: this._onRemoveResultSet,
      clearIngredientSystemItem: this._onClearIngredientSystemItem,
      clearResultSystemItem: this._onClearResultSystemItem,
      pickerSearch: this._onPickerSearch
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
        ingredients: [],
        catalysts: [],
        essences: {},
        resultMapping: []
      }];

    const legacyCatalysts = Array.isArray(data.catalysts) ? data.catalysts : [];

    const results = (data.results || []).length > 0 ? data.results : [];

    return {
      id: data.id || null,
      craftingSystemId: data.craftingSystemId || this.craftingSystemId || null,
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
        itemIngredients: (set.ingredients || [])
          .filter(ing => ing.systemItemId && !ing.tag)
          .map(ing => ({
            systemItemId: ing.systemItemId || null,
            quantity: Number(ing.quantity || 1)
          })),
        tagIngredients: (set.ingredients || [])
          .filter(ing => !ing.systemItemId && (ing.tag || ing.tier))
          .map(ing => ({
            tag: ing.tag || '',
            quantity: Number(ing.quantity || 1),
            tier: ing.tier || ''
          })),
        catalysts: ((set.catalysts || []).length > 0 ? set.catalysts : (idx === 0 ? legacyCatalysts : [])).map(cat => ({
          systemItemId: cat.systemItemId || null,
          degradesOnUse: cat.degradesOnUse === true,
          maxUses: Number.isFinite(Number(cat.maxUses)) ? Number(cat.maxUses) : null
        })),
        essences: set.essences || {},
        resultMapping: Array.isArray(set.resultMapping) ? set.resultMapping : []
      })),
      results: results.map(res => ({
        id: res.id || foundry.utils.randomID(),
        systemItemId: res.systemItemId || null,
        quantity: Number(res.quantity || 1),
        propertyFormulas: res.propertyFormulas || {}
      })),
      catalysts: [],
      metadata: data.metadata || undefined
    };
  }

  _systemItems() {
    if (!this.draft.craftingSystemId) return [];
    return game.fabricate.getCraftingSystemManager().getItems(this.draft.craftingSystemId, this.itemPickerSearch);
  }

  _decorateIngredientRows(set, itemMap) {
    return (set.itemIngredients || []).map((ing, idx) => {
      const item = ing.systemItemId ? itemMap.get(ing.systemItemId) : null;
      return {
        ...ing,
        rowIndex: idx,
        itemName: item?.name || 'No item selected',
        itemImg: item?.img || 'icons/svg/item-bag.svg',
        hasItem: !!item
      };
    });
  }

  _decorateResult(result, itemMap) {
    const item = result.systemItemId ? itemMap.get(result.systemItemId) : null;
    return {
      ...result,
      itemName: item?.name || 'No item selected',
      itemImg: item?.img || 'icons/svg/item-bag.svg',
      hasItem: !!item
    };
  }

  _decorateCatalystRows(set, itemMap) {
    return (set.catalysts || []).map((cat, idx) => {
      const item = cat.systemItemId ? itemMap.get(cat.systemItemId) : null;
      return {
        ...cat,
        rowIndex: idx,
        itemName: item?.name || 'No item selected',
        itemImg: item?.img || 'icons/svg/item-bag.svg',
        hasItem: !!item
      };
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.draft.craftingSystemId
      ? game.fabricate.getCraftingSystemManager().getSystem(this.draft.craftingSystemId)
      : null;
    const advancedEnabled = system?.advancedOptionsEnabled !== false;
    const showCategories = advancedEnabled && system?.enableCategories === true;
    const showTags = advancedEnabled && system?.enableTags === true;
    const showEssences = advancedEnabled && system?.enableEssences === true;
    const showTiers = advancedEnabled && system?.enableTiers === true;
    const categories = showCategories && Array.isArray(system?.categories) ? system.categories : [];
    const tags = showTags && Array.isArray(system?.tags) ? system.tags : [];
    const essences = showEssences && Array.isArray(system?.essences) ? system.essences : [];
    const tiers = showTiers && Array.isArray(system?.tiers) ? system.tiers : [];

    const systemManager = game.fabricate.getCraftingSystemManager();
    const allItems = this.draft.craftingSystemId ? systemManager.getItems(this.draft.craftingSystemId) : [];
    const pickerItems = this._systemItems();
    const itemMap = new Map(allItems.map(i => [i.id, i]));
    const ingredientSet = this.draft.ingredientSets[this.activeIngredientSetIndex] || this.draft.ingredientSets[0];
    const resultSet = this.draft.results[this.activeResultIndex] || null;

    const resultOptions = this.draft.results.map(res => {
      const item = res.systemItemId ? itemMap.get(res.systemItemId) : null;
      return {
        id: res.id,
        name: item?.name || 'Unassigned result',
        img: item?.img || 'icons/svg/item-bag.svg',
        selected: ingredientSet?.resultMapping?.includes(res.id)
      };
    });

    const validation = (() => {
      try {
        const payload = this._buildRecipePayload();
        return new Recipe(payload).validate();
      } catch (err) {
        return { valid: false, errors: ['Recipe data is incomplete.'] };
      }
    })();

    return {
      ...context,
      recipe: this.draft,
      isEdit: !!this.recipe,
      availableCategories: categories,
      availableTags: tags,
      availableEssences: essences,
      availableTiers: tiers,
      showCategories,
      showTags,
      showEssences,
      showTiers,
      ingredientSet: {
        ...ingredientSet,
        itemIngredients: this._decorateIngredientRows(ingredientSet, itemMap),
        tagIngredients: showTags ? (ingredientSet.tagIngredients || []).map((ing, idx) => ({
          ...ing,
          rowIndex: idx
        })) : [],
        catalysts: this._decorateCatalystRows(ingredientSet, itemMap)
      },
      resultSet: resultSet ? this._decorateResult(resultSet, itemMap) : null,
      ingredientSetIndex: this.activeIngredientSetIndex + 1,
      resultIndex: this.draft.results.length ? this.activeResultIndex + 1 : 0,
      resultIndexMinusOne: Math.max(0, this.activeResultIndex),
      ingredientSetCount: this.draft.ingredientSets.length,
      resultCount: this.draft.results.length,
      resultOptions,
      pickerItems: pickerItems.map(i => ({
        id: i.id,
        name: i.name,
        img: i.img || 'icons/svg/item-bag.svg',
        sourceUuid: i.sourceUuid || ''
      })),
      pickerSearch: this.itemPickerSearch,
      validationErrors: validation.valid ? [] : validation.errors
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._bindFormSync();
    this._bindPickerDragDrop();

    const pickerSearch = this.element.querySelector('input[name="pickerSearch"]');
    if (pickerSearch) {
      pickerSearch.addEventListener('input', async (event) => {
        this.itemPickerSearch = event.target.value || '';
        await this.render();
      });
    }
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

  _bindPickerDragDrop() {
    const cards = this.element.querySelectorAll('.picker-card[data-item-id]');
    for (const card of cards) {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (event) => {
        const itemId = card.dataset.itemId;
        if (!itemId || !event.dataTransfer) return;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', JSON.stringify({ fabricateSystemItemId: itemId }));
      });
    }

    const targets = this.element.querySelectorAll('[data-drop-target]');
    for (const target of targets) {
      target.addEventListener('dragover', (event) => {
        event.preventDefault();
        target.classList.add('drop-active');
      });
      target.addEventListener('dragleave', () => target.classList.remove('drop-active'));
      target.addEventListener('drop', async (event) => {
        event.preventDefault();
        target.classList.remove('drop-active');
        const itemId = await this._resolveSystemItemIdFromDrop(event);
        if (!itemId) return;

        this._syncDraftFromForm();
        const dropType = target.dataset.dropTarget;
        const rowIndex = Number(target.dataset.index || 0);
        this._assignSystemItem(dropType, rowIndex, itemId);
        await this.render();
      });
    }
  }

  async _resolveSystemItemIdFromDrop(event) {
    const raw = event.dataTransfer?.getData('text/plain');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.fabricateSystemItemId) return parsed.fabricateSystemItemId;
    } catch (err) {
      // ignore, try Foundry drag data next
    }

    const data = (() => {
      try {
        return getDragEventData(event);
      } catch (err) {
        return null;
      }
    })();
    const uuid = data?.uuid
      || (data?.pack && data?.id ? `Compendium.${data.pack}.${data.id}` : null)
      || (() => {
        const text = event.dataTransfer?.getData('text/plain') || '';
        if (text.startsWith('Item.') || text.startsWith('Compendium.')) return text.trim();
        return null;
      })();
    if (!uuid || !this.draft.craftingSystemId) return null;
    const systemItem = await game.fabricate.getCraftingSystemManager().addItemFromUuid(this.draft.craftingSystemId, uuid);
    return systemItem?.id || null;
  }

  _assignSystemItem(type, index, itemId) {
    if (type === 'ingredient-new') {
      const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
      set.itemIngredients = Array.isArray(set.itemIngredients) ? set.itemIngredients : [];
      const emptyIndex = set.itemIngredients.findIndex(ing => !ing.systemItemId);
      if (emptyIndex >= 0) {
        this._assignSystemItem('ingredient', emptyIndex, itemId);
        return;
      }
      const existing = set.itemIngredients.findIndex(ing => ing.systemItemId === itemId);
      if (existing >= 0) {
        set.itemIngredients[existing].quantity += 1;
        return;
      }
      set.itemIngredients.push({ systemItemId: null, quantity: 1 });
      const rowIndex = set.itemIngredients.length - 1;
      this._assignSystemItem('ingredient', rowIndex, itemId);
      return;
    }

    if (type === 'catalyst-new') {
      const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
      set.catalysts = Array.isArray(set.catalysts) ? set.catalysts : [];
      set.catalysts.push({ systemItemId: null, degradesOnUse: false, maxUses: null });
      const rowIndex = set.catalysts.length - 1;
      this._assignSystemItem('catalyst', rowIndex, itemId);
      return;
    }

    if (type === 'result') {
      const result = this.draft.results[this.activeResultIndex];
      if (result) {
        const existing = this.draft.results.findIndex(r => r.systemItemId === itemId);
        if (existing >= 0 && existing !== this.activeResultIndex) {
          this.activeResultIndex = existing;
          return;
        }
        result.systemItemId = itemId;
      }
      return;
    }

    if (type === 'result-new') {
      const existing = this.draft.results.findIndex(r => r.systemItemId === itemId);
      if (existing >= 0) {
        this.activeResultIndex = existing;
        return;
      }
      this.draft.results.push({
        id: foundry.utils.randomID(),
        systemItemId: itemId,
        quantity: 1,
        propertyFormulas: {}
      });
      this.activeResultIndex = this.draft.results.length - 1;
      return;
    }

    if (type === 'catalyst') {
      const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
      const row = set?.catalysts?.[index];
      if (row) {
        const existing = set.catalysts.findIndex(cat => cat.systemItemId === itemId);
        if (existing >= 0 && existing !== index) {
          set.catalysts.splice(index, 1);
          return;
        }
        row.systemItemId = itemId;
      }
      return;
    }

    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    const row = set?.itemIngredients?.[index];
    if (row) {
      const existing = set.itemIngredients.findIndex(ing => ing.systemItemId === itemId);
      if (existing >= 0 && existing !== index) {
        set.itemIngredients.splice(index, 1);
        return;
      }
      row.systemItemId = itemId;
    }
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
    const getOptionalNum = (key) => {
      const raw = get(key, '');
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    this.draft.name = get('name');
    this.draft.description = get('description');
    this.draft.img = get('img', 'icons/svg/item-bag.svg');
    this.draft.category = get('category', 'general');
    this.draft.enabled = fd.get('enabled') === 'on';
    this.draft.isVariable = fd.get('isVariable') === 'on';
    this.draft.transferEffects = fd.get('transferEffects') === 'on';
    this.draft.requiresAllSets = fd.get('requiresAllSets') === 'on';
    this.draft.tagsText = get('tags');

    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.name = get('ingredientSet.name', set.name);
    set.itemIngredients = Array.isArray(set.itemIngredients) ? set.itemIngredients : [];
    for (let i = 0; i < set.itemIngredients.length; i++) {
      set.itemIngredients[i].quantity = getNum(`itemIngredients.${i}.quantity`, 1);
    }
    set.tagIngredients = Array.isArray(set.tagIngredients) ? set.tagIngredients : [];
    for (let i = 0; i < set.tagIngredients.length; i++) {
      set.tagIngredients[i].tag = get(`tagIngredients.${i}.tag`);
      set.tagIngredients[i].quantity = getNum(`tagIngredients.${i}.quantity`, 1);
      set.tagIngredients[i].tier = get(`tagIngredients.${i}.tier`);
    }
    for (let i = 0; i < (set.catalysts || []).length; i++) {
      set.catalysts[i].degradesOnUse = fd.get(`catalysts.${i}.degradesOnUse`) === 'on';
      set.catalysts[i].maxUses = getOptionalNum(`catalysts.${i}.maxUses`);
    }

    if (this.draft.isVariable) {
      set.resultMapping = this.draft.results
        .filter(res => fd.get(`resultMapping.${res.id}`) === 'on')
        .map(res => res.id);
    } else {
      for (const setEntry of this.draft.ingredientSets) {
        setEntry.resultMapping = [];
      }
    }

    const result = this.draft.results[this.activeResultIndex];
    if (result) {
      result.quantity = getNum(`results.${this.activeResultIndex}.quantity`, 1);
      const formulas = get(`results.${this.activeResultIndex}.propertyFormulas`);
      if (formulas) {
        try {
          result.propertyFormulas = JSON.parse(formulas);
        } catch (err) {
          // Preserve last good value while user types.
        }
      } else {
        result.propertyFormulas = {};
      }
    }
  }

  _buildRecipePayload() {
    const system = this.draft.craftingSystemId
      ? game.fabricate.getCraftingSystemManager().getSystem(this.draft.craftingSystemId)
      : null;
    const advancedEnabled = system?.advancedOptionsEnabled !== false;
    const enableTags = advancedEnabled && system?.enableTags === true;
    const enableEssences = advancedEnabled && system?.enableEssences === true;
    const enableCategories = advancedEnabled && system?.enableCategories === true;
    const enableTiers = advancedEnabled && system?.enableTiers === true;
    const base = this.recipe ? this.recipe.toJSON() : {};
    const tags = enableTags
      ? this.draft.tagsText.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const ingredientSets = this.draft.ingredientSets.map((set, idx) => {
      const items = (set.itemIngredients || [])
        .filter(ing => ing.systemItemId)
        .map(ing => ({
          systemItemId: ing.systemItemId || null,
          tag: null,
          quantity: Number(ing.quantity || 1),
          tier: null,
          extractEffects: false,
          effectFilter: null
        }));

      const tags = enableTags
        ? (set.tagIngredients || [])
          .filter(ing => ing.tag || (enableTiers && ing.tier))
          .map(ing => ({
            systemItemId: null,
            tag: ing.tag || null,
            quantity: Number(ing.quantity || 1),
            tier: enableTiers ? (ing.tier || null) : null,
            extractEffects: false,
            effectFilter: null
          }))
        : [];

      return {
        id: set.id || foundry.utils.randomID(),
        name: set.name || `Set ${idx + 1}`,
        ingredients: [...items, ...tags],
        catalysts: (set.catalysts || [])
          .filter(cat => cat.systemItemId)
          .map(cat => ({
            systemItemId: cat.systemItemId || null,
            itemUuid: null,
            tag: null,
            name: 'Catalyst',
            required: true,
            degradesOnUse: cat.degradesOnUse === true,
            maxUses: Number.isFinite(Number(cat.maxUses)) ? Number(cat.maxUses) : null
          })),
        essences: enableEssences ? (set.essences || {}) : {},
        resultMapping: this.draft.isVariable ? (set.resultMapping || []) : []
      };
    });

    const results = this.draft.results.map(res => ({
      id: res.id || foundry.utils.randomID(),
      systemItemId: res.systemItemId || null,
      quantity: Number(res.quantity || 1),
      propertyFormulas: res.propertyFormulas || {}
    }));

    return {
      ...base,
      name: this.draft.name,
      description: this.draft.description,
      img: this.draft.img,
      category: enableCategories ? (this.draft.category || 'general') : 'general',
      craftingSystemId: this.draft.craftingSystemId || this.craftingSystemId || null,
      system: 'all',
      enabled: this.draft.enabled,
      tags,
      ingredientSets,
      catalysts: [],
      results,
      isVariable: this.draft.isVariable,
      transferEffects: this.draft.transferEffects,
      requiresAllSets: this.draft.requiresAllSets,
      metadata: base.metadata || this.draft.metadata
    };
  }

  static async _onPrevIngredientSet() {
    this._syncDraftFromForm();
    this.activeIngredientSetIndex =
      (this.activeIngredientSetIndex - 1 + this.draft.ingredientSets.length) % this.draft.ingredientSets.length;
    await this.render();
  }

  static async _onNextIngredientSet() {
    this._syncDraftFromForm();
    this.activeIngredientSetIndex = (this.activeIngredientSetIndex + 1) % this.draft.ingredientSets.length;
    await this.render();
  }

  static async _onAddIngredientSet() {
    this._syncDraftFromForm();
    this.draft.ingredientSets.push({
      id: foundry.utils.randomID(),
      name: `Set ${this.draft.ingredientSets.length + 1}`,
      itemIngredients: [],
      tagIngredients: [],
      catalysts: [],
      essences: {},
      resultMapping: []
    });
    this.activeIngredientSetIndex = this.draft.ingredientSets.length - 1;
    await this.render();
  }

  static async _onRemoveIngredientSet() {
    this._syncDraftFromForm();
    if (this.draft.ingredientSets.length <= 1) {
      ui.notifications.warn('A recipe needs at least one ingredient set.');
      return;
    }
    this.draft.ingredientSets.splice(this.activeIngredientSetIndex, 1);
    this.activeIngredientSetIndex = Math.max(0, this.activeIngredientSetIndex - 1);
    await this.render();
  }

  static async _onAddIngredientRow() {
    this._syncDraftFromForm();
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.itemIngredients = Array.isArray(set.itemIngredients) ? set.itemIngredients : [];
    set.itemIngredients.push({ systemItemId: null, quantity: 1 });
    await this.render();
  }

  static async _onAddTagIngredientRow() {
    this._syncDraftFromForm();
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.tagIngredients = Array.isArray(set.tagIngredients) ? set.tagIngredients : [];
    set.tagIngredients.push({ tag: '', quantity: 1, tier: '' });
    await this.render();
  }

  static async _onAddCatalystRow() {
    this._syncDraftFromForm();
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.catalysts = Array.isArray(set.catalysts) ? set.catalysts : [];
    set.catalysts.push({ systemItemId: null, degradesOnUse: false, maxUses: null });
    await this.render();
  }

  static async _onRemoveCatalystRow(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.index);
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    if (!Array.isArray(set.catalysts) || !set.catalysts[idx]) return;
    set.catalysts.splice(idx, 1);
    await this.render();
  }

  static async _onRemoveIngredientRow(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.index);
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.itemIngredients = Array.isArray(set.itemIngredients) ? set.itemIngredients : [];
    set.itemIngredients.splice(idx, 1);
    await this.render();
  }

  static async _onRemoveTagIngredientRow(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.index);
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.tagIngredients = Array.isArray(set.tagIngredients) ? set.tagIngredients : [];
    set.tagIngredients.splice(idx, 1);
    await this.render();
  }

  static async _onPrevResultSet() {
    this._syncDraftFromForm();
    if (this.draft.results.length === 0) return;
    this.activeResultIndex = (this.activeResultIndex - 1 + this.draft.results.length) % this.draft.results.length;
    await this.render();
  }

  static async _onNextResultSet() {
    this._syncDraftFromForm();
    if (this.draft.results.length === 0) return;
    this.activeResultIndex = (this.activeResultIndex + 1) % this.draft.results.length;
    await this.render();
  }

  static async _onAddResultSet() {
    this._syncDraftFromForm();
    this.draft.results.push({
      id: foundry.utils.randomID(),
      systemItemId: null,
      quantity: 1,
      propertyFormulas: {}
    });
    this.activeResultIndex = this.draft.results.length - 1;
    await this.render();
  }

  static async _onRemoveResultSet() {
    this._syncDraftFromForm();
    if (this.draft.results.length <= 1) {
      ui.notifications.warn('A recipe needs at least one result.');
      return;
    }
    this.draft.results.splice(this.activeResultIndex, 1);
    this.activeResultIndex = Math.max(0, this.activeResultIndex - 1);
    await this.render();
  }

  static async _onClearIngredientSystemItem(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.index || 0);
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    if (!set.itemIngredients?.[idx]) return;
    set.itemIngredients[idx].systemItemId = null;
    await this.render();
  }

  static async _onClearResultSystemItem() {
    this._syncDraftFromForm();
    const result = this.draft.results[this.activeResultIndex];
    if (!result) return;
    result.systemItemId = null;
    await this.render();
  }

  static async _onClearCatalystSystemItem(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.index || 0);
    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    if (!set?.catalysts?.[idx]) return;
    set.catalysts[idx].systemItemId = null;
    await this.render();
  }

  static async _onPickerSearch(event, target) {
    this.itemPickerSearch = target.value || '';
    await this.render();
  }

  static async _onSaveRecipe() {
    if (!game.user.isGM) {
      ui.notifications.error('Only GMs can manage recipes.');
      return;
    }
    if (!this.draft.craftingSystemId && !this.craftingSystemId) {
      ui.notifications.error('Recipe must belong to a crafting system.');
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

  static async _onCancel() {
    this.close();
  }

  static show(recipe = null, parentApp = null, craftingSystemId = null) {
    const app = new RecipeEditorApp(recipe, { parentApp, craftingSystemId });
    app.render(true);
    return app;
  }
}
