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
    this.activeResultGroupIndex = 0;
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
      addCatalystRow: this._onAddCatalystRow,
      removeCatalystRow: this._onRemoveCatalystRow,
      clearCatalystSystemItem: this._onClearCatalystSystemItem,
      prevResultSet: this._onPrevResultSet,
      nextResultSet: this._onNextResultSet,
      addResultSet: this._onAddResultSet,
      removeResultSet: this._onRemoveResultSet,
      addResultRow: this._onAddResultRow,
      removeResultRow: this._onRemoveResultRow,
      clearIngredientSystemItem: this._onClearIngredientSystemItem,
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

    const sourceGroups = (data.resultGroups || []).length > 0
      ? data.resultGroups
      : ((data.results || []).map((res, idx) => ({
        id: res.id || foundry.utils.randomID(),
        name: `Result Group ${idx + 1}`,
        results: [res]
      })));
    if (sourceGroups.length === 0) {
      sourceGroups.push({
        id: foundry.utils.randomID(),
        name: 'Result Group 1',
        results: [this._newResultRow()]
      });
    }

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
      outcomeRouting: data.outcomeRouting && typeof data.outcomeRouting === 'object'
        ? { ...data.outcomeRouting }
        : {},
      ingredientSets: ingredientSets.map((set, idx) => ({
        id: set.id || foundry.utils.randomID(),
        name: set.name || `Set ${idx + 1}`,
        itemIngredients: (set.ingredients || [])
          .filter(ing => ing.systemItemId)
          .map(ing => ({
            systemItemId: ing.systemItemId || null,
            quantity: Number(ing.quantity || 1)
          })),
        catalysts: (set.catalysts || []).map(cat => ({
          systemItemId: cat.systemItemId || null,
          degradesOnUse: cat.degradesOnUse === true,
          maxUses: Number.isFinite(Number(cat.maxUses)) ? Number(cat.maxUses) : null
        })),
        essences: set.essences || {},
        resultMapping: Array.isArray(set.resultMapping) ? set.resultMapping : []
      })),
      results: sourceGroups.map((group, idx) => ({
        id: group.id || foundry.utils.randomID(),
        name: group.name || `Result Group ${idx + 1}`,
        results: Array.isArray(group.results) && group.results.length > 0
          ? group.results.map((res, resIdx) => ({
            id: res.id || foundry.utils.randomID(),
            name: res.name || `Result ${resIdx + 1}`,
            systemItemId: res.systemItemId || null,
            quantity: Number(res.quantity || 1),
            propertyMacroUuid: res.propertyMacroUuid || null
          }))
          : [this._newResultRow()]
      })),
      metadata: data.metadata || undefined
    };
  }

  _newResultRow() {
    return {
      id: foundry.utils.randomID(),
      name: '',
      systemItemId: null,
      quantity: 1,
      propertyMacroUuid: null
    };
  }

  _systemItems() {
    if (!this.draft.craftingSystemId) return [];
    return game.fabricate.getCraftingSystemManager().getItems(this.draft.craftingSystemId, this.itemPickerSearch);
  }

  _getSystemFeatureState() {
    const system = this.draft.craftingSystemId
      ? game.fabricate.getCraftingSystemManager().getSystem(this.draft.craftingSystemId)
      : null;
    const advancedEnabled = system?.advancedOptionsEnabled !== false;
    const features = system?.features || {};
    return {
      system,
      showCategories: advancedEnabled && (features.categories === true || system?.enableCategories === true),
      showEssences: advancedEnabled && (features.essences === true || system?.enableEssences === true),
      showComplexRecipes: advancedEnabled && features.complexRecipes === true,
      showPropertyMacros: advancedEnabled && features.propertyMacros === true,
      showCraftingChecks: advancedEnabled && features.craftingChecks === true,
      showOutcomeRouting: advancedEnabled && features.outcomeRouting === true,
      craftingCheckOutcomes: Array.isArray(system?.craftingCheck?.outcomes) ? system.craftingCheck.outcomes : []
    };
  }

  _enforceFeatureConstraints() {
    const featureState = this._getSystemFeatureState();
    if (!featureState.showComplexRecipes) {
      this.draft.ingredientSets = [this.draft.ingredientSets[0] || {
        id: foundry.utils.randomID(),
        name: 'Set 1',
        itemIngredients: [],
        catalysts: [],
        essences: {},
        resultMapping: []
      }];
      const firstGroup = this.draft.results[0] || {
        id: foundry.utils.randomID(),
        name: 'Result Group 1',
        results: [this._newResultRow()]
      };
      firstGroup.results = [firstGroup.results?.[0] || this._newResultRow()];
      this.draft.results = [firstGroup];
      this.activeIngredientSetIndex = 0;
      this.activeResultGroupIndex = 0;
      this.draft.isVariable = false;
      this.draft.requiresAllSets = false;
      for (const set of this.draft.ingredientSets) {
        set.resultMapping = [];
      }
      this.draft.outcomeRouting = {};
    }
    if (!featureState.showEssences) {
      for (const set of this.draft.ingredientSets) {
        set.essences = {};
      }
    }
    return featureState;
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

  _decorateResultRows(group, itemMap) {
    return (group?.results || []).map((result, idx) => {
      const item = result.systemItemId ? itemMap.get(result.systemItemId) : null;
      return {
        ...result,
        rowIndex: idx,
        itemName: item?.name || 'No item selected',
        itemImg: item?.img || 'icons/svg/item-bag.svg',
        hasItem: !!item
      };
    });
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
    const featureState = this._enforceFeatureConstraints();
    const categories = featureState.showCategories && Array.isArray(featureState.system?.categories)
      ? featureState.system.categories
      : [];
    const essences = featureState.showEssences && Array.isArray(featureState.system?.essenceDefinitions)
      ? featureState.system.essenceDefinitions
      : [];

    const systemManager = game.fabricate.getCraftingSystemManager();
    const allItems = this.draft.craftingSystemId ? systemManager.getItems(this.draft.craftingSystemId) : [];
    const pickerItems = this._systemItems();
    const itemMap = new Map(allItems.map(i => [i.id, i]));
    const ingredientSet = this.draft.ingredientSets[this.activeIngredientSetIndex] || this.draft.ingredientSets[0];
    const resultGroup = this.draft.results[this.activeResultGroupIndex] || this.draft.results[0] || null;

    const resultOptions = this.draft.results.map(group => {
      const firstResult = group?.results?.[0] || null;
      const item = firstResult?.systemItemId ? itemMap.get(firstResult.systemItemId) : null;
      return {
        id: group.id,
        name: group.name || item?.name || 'Unassigned result group',
        img: item?.img || 'icons/svg/item-bag.svg',
        selected: ingredientSet?.resultMapping?.includes(group.id)
      };
    });
    const outcomeRoutingRows = (featureState.craftingCheckOutcomes || []).map(outcome => {
      const selectedResultId = this.draft.outcomeRouting?.[outcome] || '';
      return {
        outcome,
        selectedResultId,
        options: resultOptions.map(opt => ({
          id: opt.id,
          name: opt.name,
          selected: selectedResultId === opt.id
        }))
      };
    });

    const availablePropertyMacros = Array.from(game.macros?.contents || [])
      .filter(m => (m.type || '').toLowerCase() === 'script')
      .map(m => ({
        uuid: m.uuid,
        name: m.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

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
      availableEssences: essences,
      showCategories: featureState.showCategories,
      showEssences: featureState.showEssences,
      showComplexRecipes: featureState.showComplexRecipes,
      showPropertyMacros: featureState.showPropertyMacros,
      showCraftingChecks: featureState.showCraftingChecks,
      showOutcomeRouting: featureState.showOutcomeRouting,
      craftingCheckOutcomes: featureState.craftingCheckOutcomes,
      ingredientSet: {
        ...ingredientSet,
        itemIngredients: this._decorateIngredientRows(ingredientSet, itemMap),
        catalysts: this._decorateCatalystRows(ingredientSet, itemMap)
      },
      resultGroup: resultGroup
        ? {
          ...resultGroup,
          results: this._decorateResultRows(resultGroup, itemMap)
        }
        : null,
      ingredientSetIndex: this.activeIngredientSetIndex + 1,
      resultGroupIndex: this.draft.results.length ? this.activeResultGroupIndex + 1 : 0,
      ingredientSetCount: this.draft.ingredientSets.length,
      resultGroupCount: this.draft.results.length,
      resultOptions,
      outcomeRoutingRows,
      pickerItems: pickerItems.map(i => ({
        id: i.id,
        name: i.name,
        img: i.img || 'icons/svg/item-bag.svg',
        sourceUuid: i.sourceUuid || ''
      })),
      availablePropertyMacros,
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
      const group = this.draft.results[this.activeResultGroupIndex];
      const result = group?.results?.[0];
      if (result) {
        const existing = this.draft.results.findIndex(g =>
          (g.results || []).some(r => r.systemItemId === itemId)
        );
        if (existing >= 0 && existing !== this.activeResultGroupIndex) {
          this.activeResultGroupIndex = existing;
          return;
        }
        result.systemItemId = itemId;
      }
      return;
    }

    if (type === 'result-row') {
      const group = this.draft.results[this.activeResultGroupIndex];
      const row = group?.results?.[index];
      if (!row) return;
      row.systemItemId = itemId;
      return;
    }

    if (type === 'result-new') {
      const features = this._getSystemFeatureState();
      const existing = this.draft.results.findIndex(g =>
        (g.results || []).some(r => r.systemItemId === itemId)
      );
      if (existing >= 0) {
        this.activeResultGroupIndex = existing;
        return;
      }
      const currentGroup = this.draft.results[this.activeResultGroupIndex];
      if (!features.showComplexRecipes) {
        if (!this.draft.results[0]) {
          this.draft.results[0] = {
            id: foundry.utils.randomID(),
            name: 'Result Group 1',
            results: [{ ...this._newResultRow(), systemItemId: itemId }]
          };
        } else {
          this.draft.results[0].results = [this.draft.results[0].results?.[0] || this._newResultRow()];
          this.draft.results[0].results[0].systemItemId = itemId;
        }
        this.activeResultGroupIndex = 0;
        return;
      }
      if (!currentGroup) return;
      currentGroup.results = Array.isArray(currentGroup.results) ? currentGroup.results : [];
      currentGroup.results.push({
        ...this._newResultRow(),
        systemItemId: itemId
      });
      return;
    }

    if (type === 'result-row-new') {
      const features = this._getSystemFeatureState();
      const group = this.draft.results[this.activeResultGroupIndex];
      if (!group) return;
      if (!features.showComplexRecipes) {
        group.results = [group.results?.[0] || this._newResultRow()];
        group.results[0].systemItemId = itemId;
        return;
      }
      group.results = Array.isArray(group.results) ? group.results : [];
      group.results.push({
        ...this._newResultRow(),
        systemItemId: itemId
      });
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

    const set = this.draft.ingredientSets[this.activeIngredientSetIndex];
    set.name = get('ingredientSet.name', set.name);
    set.itemIngredients = Array.isArray(set.itemIngredients) ? set.itemIngredients : [];
    for (let i = 0; i < set.itemIngredients.length; i++) {
      set.itemIngredients[i].quantity = getNum(`itemIngredients.${i}.quantity`, 1);
    }
    for (let i = 0; i < (set.catalysts || []).length; i++) {
      set.catalysts[i].degradesOnUse = fd.get(`catalysts.${i}.degradesOnUse`) === 'on';
      set.catalysts[i].maxUses = getOptionalNum(`catalysts.${i}.maxUses`);
    }

    const features = this._enforceFeatureConstraints();
    if (features.showComplexRecipes && this.draft.isVariable) {
      set.resultMapping = this.draft.results
        .filter(res => fd.get(`resultMapping.${res.id}`) === 'on')
        .map(res => res.id);
    } else {
      this.draft.isVariable = false;
      this.draft.requiresAllSets = false;
      for (const setEntry of this.draft.ingredientSets) {
        setEntry.resultMapping = [];
      }
    }

    if (features.showComplexRecipes && features.showCraftingChecks && features.showOutcomeRouting) {
      const routing = {};
      for (const outcome of features.craftingCheckOutcomes || []) {
        const value = get(`outcomeRouting.${outcome}`);
        if (value) routing[outcome] = value;
      }
      this.draft.outcomeRouting = routing;
    } else {
      this.draft.outcomeRouting = {};
    }

    const resultGroup = this.draft.results[this.activeResultGroupIndex];
    if (resultGroup) {
      resultGroup.name = get('resultGroup.name', resultGroup.name || `Result Group ${this.activeResultGroupIndex + 1}`);
      resultGroup.results = Array.isArray(resultGroup.results) ? resultGroup.results : [];
      for (let i = 0; i < resultGroup.results.length; i++) {
        resultGroup.results[i].quantity = getNum(`resultRows.${i}.quantity`, 1);
        resultGroup.results[i].propertyMacroUuid = get(`resultRows.${i}.propertyMacroUuid`) || null;
      }
    }
  }

  _buildRecipePayload() {
    const features = this._enforceFeatureConstraints();
    const enableEssences = features.showEssences;
    const enableCategories = features.showCategories;
    const enableComplexRecipes = features.showComplexRecipes;
    const enablePropertyMacros = features.showPropertyMacros;
    const base = this.recipe ? this.recipe.toJSON() : {};

    const sourceSets = enableComplexRecipes ? this.draft.ingredientSets : [this.draft.ingredientSets[0]];
    const ingredientSets = sourceSets.map((set, idx) => {
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

      return {
        id: set.id || foundry.utils.randomID(),
        name: set.name || `Set ${idx + 1}`,
        ingredients: items,
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
        resultMapping: (enableComplexRecipes && this.draft.isVariable) ? (set.resultMapping || []) : []
      };
    });

    const sourceGroups = enableComplexRecipes ? this.draft.results : [this.draft.results[0]];
    const resultGroups = sourceGroups.filter(Boolean).map((group, groupIdx) => ({
      id: group.id || foundry.utils.randomID(),
      name: group.name || `Result Group ${groupIdx + 1}`,
      results: (group.results || []).map((res, resIdx) => ({
        id: res.id || `${group.id || foundry.utils.randomID()}-result-${resIdx + 1}`,
        systemItemId: res.systemItemId || null,
        quantity: Number(res.quantity || 1),
        propertyMacroUuid: enablePropertyMacros ? (res.propertyMacroUuid || null) : null
      }))
    }));
    const flatResults = resultGroups.flatMap(group => group.results);

    return {
      ...base,
      name: this.draft.name,
      description: this.draft.description,
      img: this.draft.img,
      category: enableCategories ? (this.draft.category || 'general') : 'general',
      craftingSystemId: this.draft.craftingSystemId || this.craftingSystemId || null,
      system: 'all',
      enabled: this.draft.enabled,
      tags: [],
      ingredientSets,
      resultGroups,
      // Legacy alias retained while downstream UI migrates.
      results: flatResults,
      isVariable: enableComplexRecipes ? this.draft.isVariable : false,
      transferEffects: this.draft.transferEffects,
      requiresAllSets: enableComplexRecipes ? this.draft.requiresAllSets : false,
      outcomeRouting: (enableComplexRecipes && features.showCraftingChecks && features.showOutcomeRouting)
        ? (this.draft.outcomeRouting || {})
        : null,
      metadata: base.metadata || this.draft.metadata
    };
  }

  static async _onPrevIngredientSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    this.activeIngredientSetIndex =
      (this.activeIngredientSetIndex - 1 + this.draft.ingredientSets.length) % this.draft.ingredientSets.length;
    await this.render();
  }

  static async _onNextIngredientSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    this.activeIngredientSetIndex = (this.activeIngredientSetIndex + 1) % this.draft.ingredientSets.length;
    await this.render();
  }

  static async _onAddIngredientSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    this.draft.ingredientSets.push({
      id: foundry.utils.randomID(),
      name: `Set ${this.draft.ingredientSets.length + 1}`,
      itemIngredients: [],
      catalysts: [],
      essences: {},
      resultMapping: []
    });
    this.activeIngredientSetIndex = this.draft.ingredientSets.length - 1;
    await this.render();
  }

  static async _onRemoveIngredientSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
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

  static async _onPrevResultSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    if (this.draft.results.length === 0) return;
    this.activeResultGroupIndex = (this.activeResultGroupIndex - 1 + this.draft.results.length) % this.draft.results.length;
    await this.render();
  }

  static async _onNextResultSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    if (this.draft.results.length === 0) return;
    this.activeResultGroupIndex = (this.activeResultGroupIndex + 1) % this.draft.results.length;
    await this.render();
  }

  static async _onAddResultSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    this.draft.results.push({
      id: foundry.utils.randomID(),
      name: `Result Group ${this.draft.results.length + 1}`,
      results: [this._newResultRow()]
    });
    this.activeResultGroupIndex = this.draft.results.length - 1;
    await this.render();
  }

  static async _onRemoveResultSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    if (this.draft.results.length <= 1) {
      ui.notifications.warn('A recipe needs at least one result group.');
      return;
    }
    this.draft.results.splice(this.activeResultGroupIndex, 1);
    this.activeResultGroupIndex = Math.max(0, this.activeResultGroupIndex - 1);
    await this.render();
  }

  static async _onAddResultRow() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const group = this.draft.results[this.activeResultGroupIndex];
    if (!group) return;
    group.results = Array.isArray(group.results) ? group.results : [];
    group.results.push(this._newResultRow());
    await this.render();
  }

  static async _onRemoveResultRow(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const idx = Number(target.dataset.index || 0);
    const group = this.draft.results[this.activeResultGroupIndex];
    if (!group) return;
    group.results = Array.isArray(group.results) ? group.results : [];
    if (group.results.length <= 1) {
      ui.notifications.warn('A result group needs at least one result.');
      return;
    }
    if (!group.results[idx]) return;
    group.results.splice(idx, 1);
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
