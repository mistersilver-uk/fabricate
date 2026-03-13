import { Recipe } from '../models/Recipe.js';
import { getDragEventData } from './foundryCompat.js';
import {
  GENERAL_RECIPE_CATEGORY,
  getEffectiveRecipeCategories,
  normalizeRecipeCategory
} from '../utils/recipeCategories.js';
import { serializeDraftIngredientGroups } from './recipeIngredientGroups.js';

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
    this.activeStepIndex = 0;
    this.collapsedPanels = new Set();
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
      prevStep: this._onPrevStep,
      nextStep: this._onNextStep,
      addStep: this._onAddStep,
      removeStep: this._onRemoveStep,
      // Carousel no-ops retained for backward compat (e.g. existing macros)
      prevIngredientSet: async function () {},
      nextIngredientSet: async function () {},
      prevResultSet: async function () {},
      nextResultSet: async function () {},
      // Accordion actions
      toggleIngredientSetPanel: this._onToggleIngredientSetPanel,
      toggleResultGroupPanel: this._onToggleResultGroupPanel,
      moveIngredientSetUp: this._onMoveIngredientSetUp,
      moveIngredientSetDown: this._onMoveIngredientSetDown,
      moveResultGroupUp: this._onMoveResultGroupUp,
      moveResultGroupDown: this._onMoveResultGroupDown,
      // Set/group management (now driven by data-set-index / data-group-index)
      addIngredientSet: this._onAddIngredientSet,
      removeIngredientSet: this._onRemoveIngredientSet,
      addIngredientGroup: this._onAddIngredientGroup,
      removeIngredientGroup: this._onRemoveIngredientGroup,
      addIngredientOption: this._onAddIngredientOption,
      removeIngredientOption: this._onRemoveIngredientOption,
      addCatalystRow: this._onAddCatalystRow,
      removeCatalystRow: this._onRemoveCatalystRow,
      clearCatalystComponent: this._onClearCatalystComponent,
      addResultSet: this._onAddResultSet,
      removeResultSet: this._onRemoveResultSet,
      addResultRow: this._onAddResultRow,
      removeResultRow: this._onRemoveResultRow,
      clearIngredientComponent: this._onClearIngredientComponent,
      pickerSearch: this._onPickerSearch,
      clearLinkedRecipeItem: this._onClearLinkedRecipeItem,
      browseLinkedRecipeItem: this._onBrowseLinkedRecipeItem,
      createLinkedRecipeItem: this._onCreateLinkedRecipeItem,
      scrollToError: this._onScrollToError
    }
  };

  static get PARTS() {
    return {
      editor: {
        template: 'modules/fabricate/templates/recipe-editor-v2.hbs'
      }
    };
  }

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
        resultGroupId: null,
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
    const draftIngredientSets = ingredientSets.map((set, idx) => this._normalizeDraftIngredientSet(set, idx));
    const draftResults = sourceGroups.map((group, idx) => this._normalizeDraftResultGroup(group, idx));
    const draftSteps = Array.isArray(data.steps)
      ? data.steps.map((step, idx) => this._newDraftStep(idx, step))
      : [];

    return {
      id: data.id || null,
      craftingSystemId: data.craftingSystemId || this.craftingSystemId || null,
      name: data.name || '',
      description: data.description || '',
      img: data.img || 'icons/svg/item-bag.svg',
      category: normalizeRecipeCategory(data.category),
      system: data.system || 'all',
      enabled: data.enabled !== false,
      locked: data.locked === true,
      linkedRecipeItemUuid: data.linkedRecipeItemUuid || '',
      visibility: data.visibility && typeof data.visibility === 'object'
        ? {
          restricted: data.visibility.restricted === true,
          allowedUserIds: Array.isArray(data.visibility.allowedUserIds)
            ? [...data.visibility.allowedUserIds]
            : []
        }
        : { restricted: false, allowedUserIds: [] },
      isVariable: data.isVariable === true,
      transferEffects: data.transferEffects === true,
      outcomeRouting: data.outcomeRouting && typeof data.outcomeRouting === 'object'
        ? { ...data.outcomeRouting }
        : {},
      ingredientSets: draftIngredientSets,
      results: draftResults,
      steps: draftSteps,
      metadata: data.metadata || undefined
    };
  }

  _normalizeDraftIngredientSet(set = {}, idx = 0) {
    return {
      id: set.id || foundry.utils.randomID(),
      name: set.name || `Set ${idx + 1}`,
      ingredientGroups: this._normalizeIngredientGroups(set, idx),
      catalysts: (set.catalysts || []).map(cat => ({
        componentId: cat.componentId || cat.systemItemId || null,
        degradesOnUse: cat.degradesOnUse === true,
        maxUses: Number.isFinite(Number(cat.maxUses)) ? Number(cat.maxUses) : null
      })),
      essences: set.essences || {},
      resultGroupId: set.resultGroupId || (Array.isArray(set.resultMapping) ? (set.resultMapping[0] || null) : null),
      resultMapping: Array.isArray(set.resultMapping) ? set.resultMapping : []
    };
  }

  _normalizeDraftResultGroup(group = {}, idx = 0) {
    return {
      id: group.id || foundry.utils.randomID(),
      name: group.name || `Result Group ${idx + 1}`,
      results: Array.isArray(group.results) && group.results.length > 0
        ? group.results.map((res, resIdx) => ({
          id: res.id || foundry.utils.randomID(),
          name: res.name || `Result ${resIdx + 1}`,
          componentId: res.componentId || res.systemItemId || null,
          quantity: Number(res.quantity || 1),
          propertyMacroUuid: res.propertyMacroUuid || null
        }))
        : [this._newResultRow()]
    };
  }

  _newDraftStep(stepIndex = 0, data = null) {
    const source = data && typeof data === 'object' ? data : {};
    const ingredientSets = (source.ingredientSets || []).length > 0
      ? source.ingredientSets.map((set, idx) => this._normalizeDraftIngredientSet(set, idx))
      : [this._normalizeDraftIngredientSet({}, 0)];
    const resultGroups = (source.resultGroups || source.results || []).length > 0
      ? (source.resultGroups || source.results).map((group, idx) => this._normalizeDraftResultGroup(group, idx))
      : [this._normalizeDraftResultGroup({}, 0)];
    const timeRequirement = source.timeRequirement && typeof source.timeRequirement === 'object'
      ? {
        minutes: Number(source.timeRequirement.minutes || 0) || 0,
        hours: Number(source.timeRequirement.hours || 0) || 0,
        days: Number(source.timeRequirement.days || 0) || 0,
        months: Number(source.timeRequirement.months || 0) || 0,
        years: Number(source.timeRequirement.years || 0) || 0
      }
      : { minutes: 0, hours: 0, days: 0, months: 0, years: 0 };
    const currencyRequirement = source.currencyRequirement && typeof source.currencyRequirement === 'object'
      ? (() => {
        const unit = String(source.currencyRequirement.unit || '').trim();
        const amount = Math.max(0, Number(source.currencyRequirement.amount || 0) || 0);
        return (unit && amount > 0) ? { unit, amount } : null;
      })()
      : null;

    return {
      id: source.id || foundry.utils.randomID(),
      name: source.name || `Step ${stepIndex + 1}`,
      description: source.description || '',
      ingredientSets,
      results: resultGroups,
      catalysts: (source.catalysts || []).map(cat => ({
        componentId: cat.componentId || cat.systemItemId || null,
        degradesOnUse: cat.degradesOnUse === true,
        maxUses: Number.isFinite(Number(cat.maxUses)) ? Number(cat.maxUses) : null
      })),
      timeRequirement,
      currencyRequirement,
      outcomeRouting: source.outcomeRouting && typeof source.outcomeRouting === 'object'
        ? { ...source.outcomeRouting }
        : {}
    };
  }

  _newIngredientOption(data = {}) {
    const rawMatch = data.match && typeof data.match === 'object' ? data.match : {};
    const matchType = (data.matchType || rawMatch.type || (data.tag ? 'tags' : 'component')) === 'tags'
      ? 'tags'
      : 'component';
    const rawTags = Array.isArray(data.tags)
      ? data.tags
      : (Array.isArray(rawMatch.tags) ? rawMatch.tags : (data.tag ? [data.tag] : []));
    const tagsText = typeof data.tagsText === 'string'
      ? data.tagsText
      : rawTags
        .map(tag => String(tag || '').trim())
        .filter(Boolean)
        .join(', ');

    return {
      id: data.id || foundry.utils.randomID(),
      matchType,
      componentId: (rawMatch.componentId || rawMatch.systemItemId || data.componentId || data.systemItemId || null),
      quantity: Number(data.quantity || 1),
      tagMatch: (data.tagMatch || rawMatch.tagMatch) === 'all' ? 'all' : 'any',
      tagsText
    };
  }

  _newIngredientGroup(data = {}, index = 0) {
    const rawOptions = Array.isArray(data.options) && data.options.length > 0
      ? data.options
      : (data.match || data.systemItemId || data.tag || Array.isArray(data.tags) ? [data] : []);
    const options = rawOptions.map(option => this._newIngredientOption(option));
    if (options.length === 0) {
      options.push(this._newIngredientOption({}));
    }

    return {
      id: data.id || foundry.utils.randomID(),
      name: data.name || `Group ${index + 1}`,
      options
    };
  }

  _normalizeIngredientGroups(set = {}, setIndex = 0) {
    const fromGroups = Array.isArray(set.ingredientGroups) ? set.ingredientGroups : [];
    const fromLegacyIngredients = Array.isArray(set.ingredients)
      ? set.ingredients.map((ingredient, idx) => ({
        id: foundry.utils.randomID(),
        name: `Group ${idx + 1}`,
        options: [ingredient]
      }))
      : [];
    const source = fromGroups.length > 0 ? fromGroups : fromLegacyIngredients;
    const normalized = source.map((group, idx) => this._newIngredientGroup(group, idx));
    if (normalized.length > 0) return normalized;
    return [this._newIngredientGroup({}, setIndex)];
  }

  _newResultRow() {
    return {
      id: foundry.utils.randomID(),
      name: '',
      componentId: null,
      quantity: 1,
      propertyMacroUuid: null
    };
  }

  _getActiveDraftContainers(featureState = this._getSystemFeatureState()) {
    const useSteps = featureState.showMultiStepRecipes === true;
    if (!useSteps) {
      this.draft.ingredientSets = Array.isArray(this.draft.ingredientSets) && this.draft.ingredientSets.length > 0
        ? this.draft.ingredientSets
        : [this._normalizeDraftIngredientSet({}, 0)];
      this.draft.results = Array.isArray(this.draft.results) && this.draft.results.length > 0
        ? this.draft.results
        : [this._normalizeDraftResultGroup({}, 0)];
      return {
        useSteps: false,
        step: null,
        ingredientSets: this.draft.ingredientSets,
        results: this.draft.results,
        outcomeRouting: this.draft.outcomeRouting || {}
      };
    }

    this.draft.steps = Array.isArray(this.draft.steps) ? this.draft.steps : [];
    if (this.draft.steps.length === 0) {
      this.draft.steps.push(this._newDraftStep(0, {
        ingredientSets: this.draft.ingredientSets,
        resultGroups: this.draft.results,
        outcomeRouting: this.draft.outcomeRouting
      }));
    }
    if (this.activeStepIndex >= this.draft.steps.length) {
      this.activeStepIndex = this.draft.steps.length - 1;
    }
    if (this.activeStepIndex < 0) {
      this.activeStepIndex = 0;
    }
    const step = this.draft.steps[this.activeStepIndex];
    step.ingredientSets = Array.isArray(step.ingredientSets) && step.ingredientSets.length > 0
      ? step.ingredientSets
      : [this._normalizeDraftIngredientSet({}, 0)];
    step.results = Array.isArray(step.results) && step.results.length > 0
      ? step.results
      : [this._normalizeDraftResultGroup({}, 0)];
    step.outcomeRouting = step.outcomeRouting && typeof step.outcomeRouting === 'object'
      ? step.outcomeRouting
      : {};
    step.timeRequirement = step.timeRequirement && typeof step.timeRequirement === 'object'
      ? step.timeRequirement
      : { minutes: 0, hours: 0, days: 0, months: 0, years: 0 };
    step.currencyRequirement = step.currencyRequirement && typeof step.currencyRequirement === 'object'
      ? {
        unit: String(step.currencyRequirement.unit || '').trim(),
        amount: Math.max(0, Number(step.currencyRequirement.amount || 0) || 0)
      }
      : null;
    if (!step.currencyRequirement?.unit || !step.currencyRequirement?.amount) {
      step.currencyRequirement = null;
    }

    return {
      useSteps: true,
      step,
      ingredientSets: step.ingredientSets,
      results: step.results,
      outcomeRouting: step.outcomeRouting
    };
  }

  /**
   * Guarantees at least one ingredient set and one result group exist.
   * Replaces the old _clampActiveContainerIndices (carousel-specific).
   */
  _ensureMinimumContainers(featureState = this._getSystemFeatureState()) {
    const containers = this._getActiveDraftContainers(featureState);
    if (!containers.ingredientSets.length) {
      containers.ingredientSets.push(this._normalizeDraftIngredientSet({}, 0));
    }
    if (!containers.results.length) {
      containers.results.push(this._normalizeDraftResultGroup({}, 0));
    }
    return containers;
  }

  _getComponents() {
    if (!this.draft.craftingSystemId) return [];
    return game.fabricate.getCraftingSystemManager().getItems(this.draft.craftingSystemId, this.itemPickerSearch);
  }

  _getSystemFeatureState() {
    const system = this.draft.craftingSystemId
      ? game.fabricate.getCraftingSystemManager().getSystem(this.draft.craftingSystemId)
      : null;
    const advancedEnabled = system?.advancedOptionsEnabled !== false;
    const features = system?.features || {};
    const resolutionMode = system?.resolutionMode || 'simple';
    const listMode = system?.recipeVisibility?.listMode || 'global';
    const knowledgeMode = system?.recipeVisibility?.knowledge?.mode || 'itemOrLearned';

    return {
      system,
      resolutionMode,
      isMappedMode: resolutionMode === 'mapped',
      isProgressiveMode: resolutionMode === 'progressive',
      showRecipeVisibilityGlobal: listMode === 'global',
      showRecipeVisibilityPlayer: listMode === 'player',
      showRecipeVisibilityKnowledge: listMode === 'knowledge',
      requiresLinkedRecipeItem: listMode === 'knowledge' && ['item', 'learned', 'itemOrLearned'].includes(knowledgeMode),
      knowledgeMode,
      showCategories: advancedEnabled && (
        features.recipeCategories === true
      ),
      showItemTags: advancedEnabled && (
        features.itemTags === true
      ),
      showEssences: advancedEnabled && (features.essences === true || system?.enableEssences === true),
      showComplexRecipes: advancedEnabled && features.complexRecipes === true,
      showMultiStepRecipes: advancedEnabled && features.multiStepRecipes === true,
      showTimeRequirements: system?.requirements?.time?.enabled === true,
      showCurrencyRequirements: system?.requirements?.currency?.enabled === true,
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
        ingredientGroups: [this._newIngredientGroup()],
        catalysts: [],
        essences: {},
        resultGroupId: null,
        resultMapping: []
      }];
      const firstGroup = this.draft.results[0] || {
        id: foundry.utils.randomID(),
        name: 'Result Group 1',
        results: [this._newResultRow()]
      };
      firstGroup.results = [firstGroup.results?.[0] || this._newResultRow()];
      this.draft.results = [firstGroup];
      this.draft.isVariable = false;
      for (const set of this.draft.ingredientSets) {
        set.resultMapping = [];
        set.resultGroupId = null;
      }
      this.draft.outcomeRouting = {};
    }
    if (!featureState.showEssences) {
      for (const set of this.draft.ingredientSets) {
        set.essences = {};
      }
    }
    if (!featureState.showMultiStepRecipes) {
      this.draft.steps = [];
      this.activeStepIndex = 0;
    } else {
      const containers = this._getActiveDraftContainers(featureState);
      if (containers.step && !featureState.showTimeRequirements) {
        containers.step.timeRequirement = { minutes: 0, hours: 0, days: 0, months: 0, years: 0 };
      }
      if (containers.step && !featureState.showCurrencyRequirements) {
        containers.step.currencyRequirement = null;
      }
    }
    if (featureState.isMappedMode) {
      this.draft.isVariable = false;
    }
    const containers = this._getActiveDraftContainers(featureState);
    for (const set of containers.ingredientSets) {
      set.ingredientGroups = this._normalizeIngredientGroups(set);
      if (!Object.prototype.hasOwnProperty.call(set, 'resultGroupId')) {
        set.resultGroupId = Array.isArray(set.resultMapping) ? (set.resultMapping[0] || null) : null;
      }
      if (!featureState.showItemTags) {
        for (const group of set.ingredientGroups) {
          for (const option of group.options || []) {
            if (option.matchType === 'tags') {
              option.matchType = 'component';
              option.tagsText = '';
              option.tagMatch = 'any';
            }
          }
        }
      }
    }
    return featureState;
  }

  _decorateIngredientGroups(set, itemMap, featureState) {
    return (set.ingredientGroups || []).map((group, groupIndex) => ({
      ...group,
      groupIndex,
      options: (group.options || []).map((option, optionIndex) => {
        const isTagMatch = featureState.showItemTags && option.matchType === 'tags';
        const item = (option.componentId || option.systemItemId) ? itemMap.get(option.componentId || option.systemItemId) : null;
        return {
          ...option,
          optionIndex,
          isTagMatch,
          isSystemItem: !isTagMatch,
          tagsText: option.tagsText || '',
          tagMatch: option.tagMatch === 'all' ? 'all' : 'any',
          itemName: item?.name || 'No item selected',
          itemImg: item?.img || 'icons/svg/item-bag.svg',
          hasItem: !!item
        };
      })
    }));
  }

  _decorateResultRows(group, itemMap) {
    return (group?.results || []).map((result, idx) => {
      const item = (result.componentId || result.systemItemId) ? itemMap.get(result.componentId || result.systemItemId) : null;
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
      const item = (cat.componentId || cat.systemItemId) ? itemMap.get(cat.componentId || cat.systemItemId) : null;
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
      ? getEffectiveRecipeCategories(featureState.system.categories)
      : [];
    const itemTags = featureState.showItemTags
      ? Array.from(new Set([
        ...((featureState.system?.itemTags || []).map(tag => String(tag || '').trim())),
        ...((featureState.system?.tags || []).map(tag => String(tag || '').trim()))
      ].filter(Boolean)))
      : [];
    const essences = featureState.showEssences && Array.isArray(featureState.system?.essenceDefinitions)
      ? featureState.system.essenceDefinitions
      : [];

    const systemManager = game.fabricate.getCraftingSystemManager();
    const allItems = this.draft.craftingSystemId ? systemManager.getItems(this.draft.craftingSystemId) : [];
    const pickerItems = this._getComponents();
    const itemMap = new Map(allItems.map(i => [i.id, i]));
    const containers = this._getActiveDraftContainers(featureState);
    const ingredientSets = containers.ingredientSets;
    const resultGroups = containers.results;

    // Decorate all ingredient sets with accordion metadata
    const decoratedIngredientSets = ingredientSets.map((set, panelIndex) => ({
      ...set,
      panelId: set.id,
      panelIndex,
      isCollapsed: this.collapsedPanels?.has(set.id) ?? false,
      ingredientGroups: this._decorateIngredientGroups(set, itemMap, featureState),
      catalysts: this._decorateCatalystRows(set, itemMap)
    }));

    // Decorate all result groups with accordion metadata
    const decoratedResultGroups = resultGroups.map((group, panelIndex) => ({
      ...group,
      panelId: group.id,
      panelIndex,
      isCollapsed: this.collapsedPanels?.has(group.id) ?? false,
      results: this._decorateResultRows(group, itemMap)
    }));

    const resultOptions = resultGroups.map(group => {
      const firstResult = group?.results?.[0] || null;
      const item = (firstResult?.componentId || firstResult?.systemItemId) ? itemMap.get(firstResult.componentId || firstResult.systemItemId) : null;
      // Use the first ingredient set for mapping context (accordion shows all, so use draft-level mapping)
      const firstSet = ingredientSets[0];
      return {
        id: group.id,
        name: group.name || item?.name || 'Unassigned result group',
        img: item?.img || 'icons/svg/item-bag.svg',
        selected: firstSet?.resultMapping?.includes(group.id),
        mappedSelected: firstSet?.resultGroupId === group.id
      };
    });

    const outcomeRoutingRows = (featureState.craftingCheckOutcomes || []).map(outcome => {
      const selectedResultId = containers.outcomeRouting?.[outcome] || '';
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
    const availableUsers = Array.from(game.users?.contents || [])
      .filter(user => !user.isGM)
      .map(user => ({
        id: user.id,
        name: user.name,
        selected: this.draft.visibility?.allowedUserIds?.includes(user.id)
      }));

    // Resolve linked recipe item for display
    let linkedRecipeItemResolved = false;
    let linkedRecipeItemName = '';
    let linkedRecipeItemImg = '';
    let linkedRecipeItemMissing = false;

    if (featureState.requiresLinkedRecipeItem) {
      const uuid = this.draft.linkedRecipeItemUuid;
      if (uuid) {
        try {
          const item = await fromUuid(uuid);
          if (item) {
            linkedRecipeItemResolved = true;
            linkedRecipeItemName = item.name;
            linkedRecipeItemImg = item.img || 'icons/svg/item-bag.svg';
          }
        } catch (e) {
          // UUID doesn't resolve -- leave resolved=false
        }
      }
      linkedRecipeItemMissing = !uuid;
    }

    const validation = (() => {
      try {
        const payload = this._buildRecipePayload();
        return this._validatePayload(payload, featureState);
      } catch (err) {
        return { valid: false, errors: ['Recipe data is incomplete.'] };
      }
    })();

    // Expand collapsed panels that contain errors so errors are visible
    if (!validation.valid && Array.isArray(validation.errors)) {
      for (const err of validation.errors) {
        if (err && typeof err === 'object' && err.panelId) {
          this.collapsedPanels?.delete(err.panelId);
        }
      }
    }

    return {
      ...context,
      recipe: this.draft,
      isEdit: !!this.recipe,
      availableCategories: categories,
      availableEssences: essences,
      availableUsers,
      showCategories: featureState.showCategories,
      showItemTags: featureState.showItemTags,
      showEssences: featureState.showEssences,
      showComplexRecipes: featureState.showComplexRecipes,
      showMultiStepRecipes: featureState.showMultiStepRecipes,
      showTimeRequirements: featureState.showTimeRequirements,
      showCurrencyRequirements: featureState.showCurrencyRequirements,
      showVariableOutputToggle: featureState.showComplexRecipes && !featureState.isMappedMode,
      isMappedMode: featureState.isMappedMode,
      isProgressiveMode: featureState.isProgressiveMode,
      showPropertyMacros: featureState.showPropertyMacros,
      showCraftingChecks: featureState.showCraftingChecks,
      showOutcomeRouting: featureState.showOutcomeRouting,
      showRecipeVisibilityGlobal: featureState.showRecipeVisibilityGlobal,
      showRecipeVisibilityPlayer: featureState.showRecipeVisibilityPlayer,
      showRecipeVisibilityKnowledge: featureState.showRecipeVisibilityKnowledge,
      requiresLinkedRecipeItem: featureState.requiresLinkedRecipeItem,
      linkedRecipeItemResolved,
      linkedRecipeItemName,
      linkedRecipeItemImg,
      linkedRecipeItemMissing,
      knowledgeMode: featureState.knowledgeMode,
      craftingCheckOutcomes: featureState.craftingCheckOutcomes,
      // Accordion: all sets and groups (replaces single ingredientSet / resultGroup)
      ingredientSets: decoratedIngredientSets,
      resultGroups: decoratedResultGroups,
      // Legacy count fields still available for step display
      ingredientSetCount: ingredientSets.length,
      resultGroupCount: resultGroups.length,
      activeStep: containers.step,
      activeStepIndex: featureState.showMultiStepRecipes ? (this.activeStepIndex + 1) : 0,
      stepCount: featureState.showMultiStepRecipes ? (this.draft.steps?.length || 0) : 0,
      resultOptions,
      outcomeRoutingRows,
      availableItemTags: itemTags,
      pickerItems: pickerItems.map(i => ({
        id: i.id,
        name: i.name,
        img: i.img || 'icons/svg/item-bag.svg',
        sourceUuid: i.sourceUuid || ''
      })),
      availablePropertyMacros,
      pickerSearch: this.itemPickerSearch,
      validationErrors: validation.valid ? [] : validation.errors.map(err => {
        if (typeof err === 'string') return { message: err, panelId: null, fieldSelector: null };
        return { message: err.message || String(err), panelId: err.panelId || null, fieldSelector: err.fieldName || null };
      })
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._ensureScrollableLayout();
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

  _ensureScrollableLayout() {
    const host = this.element;
    if (!host) return;

    host.style.minHeight = '0';
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.overflow = 'hidden';

    const form = host.querySelector('form.fabricate-recipe-editor-v2');
    if (!form) return;

    form.style.minHeight = '0';
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.overflow = 'hidden';

    const header = form.querySelector('.editor-header');
    if (header) header.style.flex = '0 0 auto';

    const validationBanner = form.querySelector('.validation-banner');
    if (validationBanner) validationBanner.style.flex = '0 0 auto';

    const footer = form.querySelector('.editor-footer');
    if (footer) footer.style.flex = '0 0 auto';

    const scrollRegion = form.querySelector('.editor-scroll');
    if (scrollRegion) {
      scrollRegion.style.minHeight = '0';
      scrollRegion.style.flex = '1 1 0';
      scrollRegion.style.overflowX = 'hidden';
      scrollRegion.style.overflowY = 'auto';
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
        const itemId = await this._resolveComponentIdFromDrop(event);
        if (!itemId) return;

        this._syncDraftFromForm();
        const dropType = target.dataset.dropTarget;
        const index = Number(target.dataset.index || 0);
        const setIndex = target.dataset.setIndex !== undefined ? Number(target.dataset.setIndex) : null;
        const groupIndex = Number(target.dataset.groupIndex);
        const optionIndex = Number(target.dataset.optionIndex);
        this._assignComponent(dropType, itemId, {
          index,
          setIndex: Number.isFinite(setIndex) ? setIndex : null,
          groupIndex: Number.isFinite(groupIndex) ? groupIndex : null,
          optionIndex: Number.isFinite(optionIndex) ? optionIndex : null
        });
        await this.render();
      });
    }
  }

  async _resolveComponentIdFromDrop(event) {
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
    try {
      const result = await game.fabricate.getCraftingSystemManager().addItemFromUuid(this.draft.craftingSystemId, uuid);
      return result?.item?.id || null;
    } catch (err) {
      ui.notifications.warn(err.message || 'Failed to add item.');
      return null;
    }
  }

  _assignComponent(type, itemId, meta = {}) {
    const index = Number(meta.index || 0);
    const groupIndex = Number.isFinite(Number(meta.groupIndex)) ? Number(meta.groupIndex) : null;
    const optionIndex = Number.isFinite(Number(meta.optionIndex)) ? Number(meta.optionIndex) : null;
    const features = this._enforceFeatureConstraints();
    const containers = this._getActiveDraftContainers(features);
    const ingredientSets = containers.ingredientSets;
    const results = containers.results;

    // Use explicit setIndex from drop target if provided, else default to 0
    const setIndex = (meta.setIndex !== null && meta.setIndex !== undefined && Number.isFinite(Number(meta.setIndex)))
      ? Number(meta.setIndex)
      : 0;

    if (type === 'ingredient-new') {
      const set = ingredientSets[setIndex] || ingredientSets[0];
      if (!set) return;
      set.ingredientGroups = this._normalizeIngredientGroups(set);
      set.ingredientGroups.push(this._newIngredientGroup({
        options: [{ matchType: 'component', componentId: itemId, quantity: 1 }]
      }, set.ingredientGroups.length));
      return;
    }

    if (type === 'ingredient-option-new') {
      const set = ingredientSets[setIndex] || ingredientSets[0];
      if (!set) return;
      set.ingredientGroups = this._normalizeIngredientGroups(set);
      const group = set.ingredientGroups[groupIndex ?? 0];
      if (!group) return;
      group.options = Array.isArray(group.options) ? group.options : [];
      group.options.push(this._newIngredientOption({}));
      const newOptionIndex = group.options.length - 1;
      this._assignComponent('ingredient-option', itemId, {
        setIndex,
        groupIndex: groupIndex ?? 0,
        optionIndex: newOptionIndex
      });
      return;
    }

    if (type === 'ingredient-option') {
      const set = ingredientSets[setIndex] || ingredientSets[0];
      if (!set) return;
      set.ingredientGroups = this._normalizeIngredientGroups(set);
      const group = set.ingredientGroups[groupIndex ?? 0];
      if (!group) return;
      group.options = Array.isArray(group.options) ? group.options : [];
      const option = group.options[optionIndex ?? index];
      if (!option) return;
      option.matchType = 'component';
      option.componentId = itemId;
      option.tagsText = '';
      option.tagMatch = 'any';
      return;
    }

    // Legacy drop target compatibility.
    if (type === 'ingredient') {
      this._assignComponent('ingredient-option', itemId, {
        setIndex,
        groupIndex: 0,
        optionIndex: index
      });
      return;
    }

    if (type === 'catalyst-new') {
      const set = ingredientSets[setIndex] || ingredientSets[0];
      if (!set) return;
      set.catalysts = Array.isArray(set.catalysts) ? set.catalysts : [];
      set.catalysts.push({ componentId: null, degradesOnUse: false, maxUses: null });
      const rowIndex = set.catalysts.length - 1;
      this._assignComponent('catalyst', itemId, { setIndex, index: rowIndex });
      return;
    }

    if (type === 'result') {
      const groupIdx = (meta.groupIndex !== null && meta.groupIndex !== undefined) ? meta.groupIndex : 0;
      const group = results[groupIdx] || results[0];
      if (!group) return;
      const result = group?.results?.[0];
      if (result) {
        const existing = results.findIndex(g =>
          (g.results || []).some(r => (r.componentId || r.systemItemId) === itemId)
        );
        if (existing >= 0 && existing !== groupIdx) return;
        result.componentId = itemId;
      }
      return;
    }

    if (type === 'result-row') {
      const groupIdx = (meta.groupIndex !== null && meta.groupIndex !== undefined) ? meta.groupIndex : 0;
      const group = results[groupIdx] || results[0];
      const row = group?.results?.[index];
      if (!row) return;
      row.componentId = itemId;
      return;
    }

    if (type === 'result-new') {
      const existing = results.findIndex(g =>
        (g.results || []).some(r => (r.componentId || r.systemItemId) === itemId)
      );
      if (existing >= 0) return;
      const groupIdx = (meta.groupIndex !== null && meta.groupIndex !== undefined) ? meta.groupIndex : 0;
      const currentGroup = results[groupIdx] || results[0];
      if (!features.showComplexRecipes) {
        if (!results[0]) {
          results[0] = {
            id: foundry.utils.randomID(),
            name: 'Result Group 1',
            results: [{ ...this._newResultRow(), componentId: itemId }]
          };
        } else {
          results[0].results = [results[0].results?.[0] || this._newResultRow()];
          results[0].results[0].componentId = itemId;
        }
        return;
      }
      if (!currentGroup) return;
      currentGroup.results = Array.isArray(currentGroup.results) ? currentGroup.results : [];
      currentGroup.results.push({
        ...this._newResultRow(),
        componentId: itemId
      });
      return;
    }

    if (type === 'result-row-new') {
      const groupIdx = (meta.groupIndex !== null && meta.groupIndex !== undefined) ? meta.groupIndex : 0;
      const group = results[groupIdx] || results[0];
      if (!group) return;
      if (!features.showComplexRecipes) {
        group.results = [group.results?.[0] || this._newResultRow()];
        group.results[0].componentId = itemId;
        return;
      }
      group.results = Array.isArray(group.results) ? group.results : [];
      group.results.push({
        ...this._newResultRow(),
        componentId: itemId
      });
      return;
    }

    if (type === 'catalyst') {
      const set = ingredientSets[setIndex] || ingredientSets[0];
      if (!set) return;
      const row = set?.catalysts?.[index];
      if (row) {
        const existing = set.catalysts.findIndex(cat => (cat.componentId || cat.systemItemId) === itemId);
        if (existing >= 0 && existing !== index) {
          set.catalysts.splice(index, 1);
          return;
        }
        row.componentId = itemId;
      }
    }
  }

  _syncDraftFromForm() {
    const form = this.element?.querySelector('form');
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
    this.draft.category = normalizeRecipeCategory(get('category', GENERAL_RECIPE_CATEGORY));
    this.draft.enabled = fd.get('enabled') === 'on';
    this.draft.locked = fd.get('locked') === 'on';
    this.draft.linkedRecipeItemUuid = get('linkedRecipeItemUuid', this.draft.linkedRecipeItemUuid || '');
    this.draft.isVariable = fd.get('isVariable') === 'on';
    this.draft.transferEffects = fd.get('transferEffects') === 'on';

    const features = this._enforceFeatureConstraints();
    if (features.showRecipeVisibilityPlayer) {
      const allowed = fd.getAll('visibility.allowedUserIds').map(id => String(id || '').trim()).filter(Boolean);
      this.draft.visibility = {
        restricted: fd.get('visibility.restricted') === 'on',
        allowedUserIds: allowed
      };
    } else {
      this.draft.visibility = {
        restricted: false,
        allowedUserIds: []
      };
    }

    const containers = this._getActiveDraftContainers(features);
    if (containers.step) {
      containers.step.name = get('step.name', containers.step.name || `Step ${this.activeStepIndex + 1}`);
      containers.step.description = get('step.description', containers.step.description || '');
      if (features.showTimeRequirements) {
        containers.step.timeRequirement = {
          minutes: Math.max(0, Number(get('step.timeRequirement.minutes', containers.step.timeRequirement?.minutes || 0)) || 0),
          hours: Math.max(0, Number(get('step.timeRequirement.hours', containers.step.timeRequirement?.hours || 0)) || 0),
          days: Math.max(0, Number(get('step.timeRequirement.days', containers.step.timeRequirement?.days || 0)) || 0),
          months: Math.max(0, Number(get('step.timeRequirement.months', containers.step.timeRequirement?.months || 0)) || 0),
          years: Math.max(0, Number(get('step.timeRequirement.years', containers.step.timeRequirement?.years || 0)) || 0)
        };
      } else {
        containers.step.timeRequirement = { minutes: 0, hours: 0, days: 0, months: 0, years: 0 };
      }
      if (features.showCurrencyRequirements) {
        const unit = get('step.currencyRequirement.unit', containers.step.currencyRequirement?.unit || '');
        const amount = Math.max(0, Number(get('step.currencyRequirement.amount', containers.step.currencyRequirement?.amount || 0)) || 0);
        containers.step.currencyRequirement = unit && amount > 0
          ? { unit, amount }
          : null;
      } else {
        containers.step.currencyRequirement = null;
      }
    }

    // Accordion: iterate all ingredient sets by data-set-index on panel elements
    const setElements = this.element.querySelectorAll('.ingredient-set-panel[data-set-index]');
    if (setElements.length > 0) {
      for (const panelEl of setElements) {
        const setIndex = Number(panelEl.dataset.setIndex);
        const set = containers.ingredientSets[setIndex];
        if (!set) continue;
        set.name = get(`ingredientSet.${setIndex}.name`, set.name);
        set.ingredientGroups = this._normalizeIngredientGroups(set);
        for (let groupIndex = 0; groupIndex < set.ingredientGroups.length; groupIndex++) {
          const group = set.ingredientGroups[groupIndex];
          group.name = get(`ingredientGroups.${setIndex}.${groupIndex}.name`, group.name || `Group ${groupIndex + 1}`);
          group.options = Array.isArray(group.options) ? group.options : [];
          for (let optionIndex = 0; optionIndex < group.options.length; optionIndex++) {
            const option = group.options[optionIndex];
            option.quantity = getNum(`ingredientGroups.${setIndex}.${groupIndex}.options.${optionIndex}.quantity`, 1);
            const matchType = get(`ingredientGroups.${setIndex}.${groupIndex}.options.${optionIndex}.matchType`, option.matchType || 'component');
            option.matchType = (matchType === 'tags' && features.showItemTags) ? 'tags' : 'component';
            option.componentId = get(`ingredientGroups.${setIndex}.${groupIndex}.options.${optionIndex}.componentId`, option.componentId || option.systemItemId || '') || null;
            option.tagMatch = get(`ingredientGroups.${setIndex}.${groupIndex}.options.${optionIndex}.tagMatch`, option.tagMatch || 'any') === 'all'
              ? 'all'
              : 'any';
            option.tagsText = get(`ingredientGroups.${setIndex}.${groupIndex}.options.${optionIndex}.tags`, option.tagsText || '');
            if (option.matchType !== 'tags') {
              option.tagsText = '';
              option.tagMatch = 'any';
            }
          }
        }
        for (let i = 0; i < (set.catalysts || []).length; i++) {
          set.catalysts[i].degradesOnUse = fd.get(`catalysts.${setIndex}.${i}.degradesOnUse`) === 'on';
          set.catalysts[i].maxUses = getOptionalNum(`catalysts.${setIndex}.${i}.maxUses`);
        }
        if (features.isMappedMode) {
          const mappedId = get(`ingredientSet.${setIndex}.resultGroupId`);
          set.resultGroupId = mappedId || null;
          set.resultMapping = set.resultGroupId ? [set.resultGroupId] : [];
          this.draft.isVariable = false;
        }
        if (features.showComplexRecipes && this.draft.isVariable) {
          set.resultMapping = containers.results
            .filter(res => fd.get(`resultMapping.${setIndex}.${res.id}`) === 'on')
            .map(res => res.id);
          set.resultGroupId = set.resultMapping[0] || null;
        } else if (!features.isMappedMode) {
          this.draft.isVariable = false;
          set.resultMapping = [];
          set.resultGroupId = null;
        }
      }
    } else {
      // Fallback for single-set (non-complex) mode: use legacy flat field names
      const set = containers.ingredientSets[0];
      if (set) {
        set.name = get('ingredientSet.name', set.name);
        set.ingredientGroups = this._normalizeIngredientGroups(set);
        for (let groupIndex = 0; groupIndex < set.ingredientGroups.length; groupIndex++) {
          const group = set.ingredientGroups[groupIndex];
          group.name = get(`ingredientGroups.${groupIndex}.name`, group.name || `Group ${groupIndex + 1}`);
          group.options = Array.isArray(group.options) ? group.options : [];
          for (let optionIndex = 0; optionIndex < group.options.length; optionIndex++) {
            const option = group.options[optionIndex];
            option.quantity = getNum(`ingredientGroups.${groupIndex}.options.${optionIndex}.quantity`, 1);
            const matchType = get(`ingredientGroups.${groupIndex}.options.${optionIndex}.matchType`, option.matchType || 'component');
            option.matchType = (matchType === 'tags' && features.showItemTags) ? 'tags' : 'component';
            option.componentId = get(`ingredientGroups.${groupIndex}.options.${optionIndex}.componentId`, option.componentId || option.systemItemId || '') || null;
            option.tagMatch = get(`ingredientGroups.${groupIndex}.options.${optionIndex}.tagMatch`, option.tagMatch || 'any') === 'all'
              ? 'all'
              : 'any';
            option.tagsText = get(`ingredientGroups.${groupIndex}.options.${optionIndex}.tags`, option.tagsText || '');
            if (option.matchType !== 'tags') {
              option.tagsText = '';
              option.tagMatch = 'any';
            }
          }
        }
        for (let i = 0; i < (set.catalysts || []).length; i++) {
          set.catalysts[i].degradesOnUse = fd.get(`catalysts.${i}.degradesOnUse`) === 'on';
          set.catalysts[i].maxUses = getOptionalNum(`catalysts.${i}.maxUses`);
        }
        if (features.isMappedMode) {
          const mappedId = get('ingredientSet.resultGroupId');
          set.resultGroupId = mappedId || null;
          set.resultMapping = set.resultGroupId ? [set.resultGroupId] : [];
          this.draft.isVariable = false;
        }
        if (features.showComplexRecipes && this.draft.isVariable) {
          set.resultMapping = containers.results
            .filter(res => fd.get(`resultMapping.${res.id}`) === 'on')
            .map(res => res.id);
          set.resultGroupId = set.resultMapping[0] || null;
        } else {
          if (!features.isMappedMode) {
            this.draft.isVariable = false;
            for (const setEntry of containers.ingredientSets) {
              setEntry.resultMapping = [];
              setEntry.resultGroupId = null;
            }
          }
        }
      }
    }

    if (features.showComplexRecipes && features.showCraftingChecks && features.showOutcomeRouting) {
      const routing = {};
      for (const outcome of features.craftingCheckOutcomes || []) {
        const value = get(`outcomeRouting.${outcome}`);
        if (value) routing[outcome] = value;
      }
      if (containers.step) {
        containers.step.outcomeRouting = routing;
      } else {
        this.draft.outcomeRouting = routing;
      }
    } else {
      if (containers.step) {
        containers.step.outcomeRouting = {};
      } else {
        this.draft.outcomeRouting = {};
      }
    }

    // Accordion: iterate all result groups by data-group-index on panel elements
    const groupElements = this.element.querySelectorAll('.result-group-panel[data-group-index]');
    if (groupElements.length > 0) {
      for (const panelEl of groupElements) {
        const groupIndex = Number(panelEl.dataset.groupIndex);
        const resultGroup = containers.results[groupIndex];
        if (!resultGroup) continue;
        resultGroup.name = get(`resultGroup.${groupIndex}.name`, resultGroup.name || `Result Group ${groupIndex + 1}`);
        resultGroup.results = Array.isArray(resultGroup.results) ? resultGroup.results : [];
        for (let i = 0; i < resultGroup.results.length; i++) {
          resultGroup.results[i].quantity = getNum(`resultRows.${groupIndex}.${i}.quantity`, 1);
          resultGroup.results[i].propertyMacroUuid = get(`resultRows.${groupIndex}.${i}.propertyMacroUuid`) || null;
        }
      }
    } else {
      // Fallback for single result group
      const resultGroup = containers.results[0];
      if (resultGroup) {
        resultGroup.name = get('resultGroup.name', resultGroup.name || 'Result Group 1');
        resultGroup.results = Array.isArray(resultGroup.results) ? resultGroup.results : [];
        for (let i = 0; i < resultGroup.results.length; i++) {
          resultGroup.results[i].quantity = getNum(`resultRows.${i}.quantity`, 1);
          resultGroup.results[i].propertyMacroUuid = get(`resultRows.${i}.propertyMacroUuid`) || null;
        }
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
    const serializeIngredientSets = (sourceSets = []) => {
      const sets = enableComplexRecipes ? sourceSets : [sourceSets[0]];
      return sets.filter(Boolean).map((set, idx) => {
        const ingredientGroups = serializeDraftIngredientGroups(
          this._normalizeIngredientGroups(set),
          {
            showItemTags: features.showItemTags,
            randomID: () => foundry.utils.randomID()
          }
        );
        const legacyIngredients = ingredientGroups
          .map(group => group.options?.[0] || null)
          .filter(Boolean);

        return {
          id: set.id || foundry.utils.randomID(),
          name: set.name || `Set ${idx + 1}`,
          ingredientGroups,
          // Legacy alias retained for compatibility with older consumers.
          ingredients: legacyIngredients,
          catalysts: (set.catalysts || [])
            .filter(cat => cat.componentId || cat.systemItemId)
            .map(cat => ({
              componentId: cat.componentId || null,
              systemItemId: cat.componentId || null,
              itemUuid: null,
              tag: null,
              name: 'Catalyst',
              required: true,
              degradesOnUse: cat.degradesOnUse === true,
              maxUses: Number.isFinite(Number(cat.maxUses)) ? Number(cat.maxUses) : null
            })),
          essences: enableEssences ? (set.essences || {}) : {},
          resultGroupId: features.isMappedMode ? (set.resultGroupId || null) : null,
          resultMapping: (enableComplexRecipes && this.draft.isVariable && !features.isMappedMode) ? (set.resultMapping || []) : []
        };
      });
    };

    const serializeResultGroups = (sourceGroups = []) => {
      const groups = enableComplexRecipes ? sourceGroups : [sourceGroups[0]];
      return groups.filter(Boolean).map((group, groupIdx) => ({
        id: group.id || foundry.utils.randomID(),
        name: group.name || `Result Group ${groupIdx + 1}`,
        results: (group.results || []).map((res, resIdx) => ({
          id: res.id || `${group.id || foundry.utils.randomID()}-result-${resIdx + 1}`,
          componentId: res.componentId || res.systemItemId || null,
          quantity: Number(res.quantity || 1),
          propertyMacroUuid: enablePropertyMacros ? (res.propertyMacroUuid || null) : null
        }))
      }));
    };

    const serializeTimeRequirement = (timeRequirement = null) => {
      if (!features.showTimeRequirements || !timeRequirement || typeof timeRequirement !== 'object') return null;
      const normalized = {
        minutes: Math.max(0, Number(timeRequirement.minutes || 0) || 0),
        hours: Math.max(0, Number(timeRequirement.hours || 0) || 0),
        days: Math.max(0, Number(timeRequirement.days || 0) || 0),
        months: Math.max(0, Number(timeRequirement.months || 0) || 0),
        years: Math.max(0, Number(timeRequirement.years || 0) || 0)
      };
      const total = normalized.minutes + normalized.hours + normalized.days + normalized.months + normalized.years;
      return total > 0 ? normalized : null;
    };
    const serializeCurrencyRequirement = (currencyRequirement = null) => {
      if (!features.showCurrencyRequirements || !currencyRequirement || typeof currencyRequirement !== 'object') return null;
      const unit = String(currencyRequirement.unit || '').trim();
      const amount = Math.max(0, Number(currencyRequirement.amount || 0) || 0);
      if (!unit || amount <= 0) return null;
      return { unit, amount };
    };

    const stepPayloads = features.showMultiStepRecipes
      ? (this.draft.steps || []).map((step, stepIndex) => ({
        id: step.id || foundry.utils.randomID(),
        name: step.name || `Step ${stepIndex + 1}`,
        description: step.description || '',
        ingredientSets: serializeIngredientSets(step.ingredientSets || []),
        resultGroups: serializeResultGroups(step.results || []),
        catalysts: (step.catalysts || [])
          .filter(cat => cat.componentId || cat.systemItemId)
          .map(cat => ({
            componentId: cat.componentId || null,
            systemItemId: cat.componentId || null,
            itemUuid: null,
            tag: null,
            name: 'Catalyst',
            required: true,
            degradesOnUse: cat.degradesOnUse === true,
            maxUses: Number.isFinite(Number(cat.maxUses)) ? Number(cat.maxUses) : null
        })),
        timeRequirement: serializeTimeRequirement(step.timeRequirement),
        currencyRequirement: serializeCurrencyRequirement(step.currencyRequirement),
        outcomeRouting: (enableComplexRecipes && features.showCraftingChecks && features.showOutcomeRouting)
          ? (step.outcomeRouting || {})
          : null
      }))
      : [];

    const topLevelIngredientSets = features.showMultiStepRecipes
      ? (stepPayloads[0]?.ingredientSets || [])
      : serializeIngredientSets(this.draft.ingredientSets || []);
    const topLevelResultGroups = features.showMultiStepRecipes
      ? (stepPayloads[0]?.resultGroups || [])
      : serializeResultGroups(this.draft.results || []);
    const topLevelOutcomeRouting = features.showMultiStepRecipes
      ? (stepPayloads[0]?.outcomeRouting || null)
      : ((enableComplexRecipes && features.showCraftingChecks && features.showOutcomeRouting)
        ? (this.draft.outcomeRouting || {})
        : null);
    const flatResults = topLevelResultGroups.flatMap(group => group.results);

    return {
      ...base,
      name: this.draft.name,
      description: this.draft.description,
      img: this.draft.img,
      category: enableCategories ? normalizeRecipeCategory(this.draft.category) : GENERAL_RECIPE_CATEGORY,
      craftingSystemId: this.draft.craftingSystemId || this.craftingSystemId || null,
      system: 'all',
      enabled: this.draft.enabled,
      locked: this.draft.locked === true,
      linkedRecipeItemUuid: this.draft.linkedRecipeItemUuid || null,
      visibility: features.showRecipeVisibilityPlayer
        ? {
          restricted: this.draft.visibility?.restricted === true,
          allowedUserIds: this.draft.visibility?.restricted === true
            ? (this.draft.visibility?.allowedUserIds || [])
            : []
        }
        : null,
      tags: [],
      ingredientSets: topLevelIngredientSets,
      resultGroups: topLevelResultGroups,
      steps: features.showMultiStepRecipes ? stepPayloads : [],
      // Legacy alias retained while downstream UI migrates.
      results: flatResults,
      isVariable: enableComplexRecipes ? this.draft.isVariable : false,
      transferEffects: this.draft.transferEffects,
      outcomeRouting: topLevelOutcomeRouting,
      metadata: base.metadata || this.draft.metadata
    };
  }

  _validatePayload(payload, featureState = this._getSystemFeatureState()) {
    const modelValidation = new Recipe(payload).validate();
    const errors = [...(modelValidation.errors || [])];

    if (featureState.requiresLinkedRecipeItem && !payload.linkedRecipeItemUuid) {
      errors.push('Linked recipe item UUID is required for this crafting system visibility mode');
    }

    // Note: restricted=true with empty allowedUserIds is permitted.
    // It means 'hidden from all players' — a valid GM use-case to hide a recipe
    // before assigning specific users. The field is saved as-is without blocking.

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ---------------------------------------------------------------------------
  // Accordion actions
  // ---------------------------------------------------------------------------

  static async _onToggleIngredientSetPanel(event, target) {
    const panelId = target.dataset.panelId;
    if (!panelId) return;
    if (this.collapsedPanels.has(panelId)) {
      this.collapsedPanels.delete(panelId);
    } else {
      this.collapsedPanels.add(panelId);
    }
    await this.render();
  }

  static async _onToggleResultGroupPanel(event, target) {
    const panelId = target.dataset.panelId;
    if (!panelId) return;
    if (this.collapsedPanels.has(panelId)) {
      this.collapsedPanels.delete(panelId);
    } else {
      this.collapsedPanels.add(panelId);
    }
    await this.render();
  }

  static async _onMoveIngredientSetUp(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const sets = containers.ingredientSets;
    const idx = Number(target.dataset.setIndex);
    if (!Number.isFinite(idx) || idx <= 0 || idx >= sets.length) return;
    [sets[idx - 1], sets[idx]] = [sets[idx], sets[idx - 1]];
    await this.render();
  }

  static async _onMoveIngredientSetDown(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const sets = containers.ingredientSets;
    const idx = Number(target.dataset.setIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= sets.length - 1) return;
    [sets[idx], sets[idx + 1]] = [sets[idx + 1], sets[idx]];
    await this.render();
  }

  static async _onMoveResultGroupUp(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const groups = containers.results;
    const idx = Number(target.dataset.groupIndex);
    if (!Number.isFinite(idx) || idx <= 0 || idx >= groups.length) return;
    [groups[idx - 1], groups[idx]] = [groups[idx], groups[idx - 1]];
    await this.render();
  }

  static async _onMoveResultGroupDown(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const groups = containers.results;
    const idx = Number(target.dataset.groupIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= groups.length - 1) return;
    [groups[idx], groups[idx + 1]] = [groups[idx + 1], groups[idx]];
    await this.render();
  }

  static async _onScrollToError(event, target) {
    event.preventDefault();
    const panelId = target.dataset.panelId;
    if (panelId) {
      this.collapsedPanels.delete(panelId);
      await this.render();
      const panel = this.element?.querySelector(`[data-panel-id="${panelId}"]`);
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---------------------------------------------------------------------------
  // Step navigation actions
  // ---------------------------------------------------------------------------

  static async _onPrevStep() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showMultiStepRecipes) return;
    if (!Array.isArray(this.draft.steps) || this.draft.steps.length === 0) return;
    this.activeStepIndex = (this.activeStepIndex - 1 + this.draft.steps.length) % this.draft.steps.length;
    this._ensureMinimumContainers(features);
    await this.render();
  }

  static async _onNextStep() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showMultiStepRecipes) return;
    if (!Array.isArray(this.draft.steps) || this.draft.steps.length === 0) return;
    this.activeStepIndex = (this.activeStepIndex + 1) % this.draft.steps.length;
    this._ensureMinimumContainers(features);
    await this.render();
  }

  static async _onAddStep() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showMultiStepRecipes) return;
    this.draft.steps = Array.isArray(this.draft.steps) ? this.draft.steps : [];
    this.draft.steps.push(this._newDraftStep(this.draft.steps.length, {}));
    this.activeStepIndex = this.draft.steps.length - 1;
    this._ensureMinimumContainers(features);
    await this.render();
  }

  static async _onRemoveStep() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showMultiStepRecipes) return;
    this.draft.steps = Array.isArray(this.draft.steps) ? this.draft.steps : [];
    if (this.draft.steps.length <= 1) {
      ui.notifications.warn('A recipe needs at least one step.');
      return;
    }
    this.draft.steps.splice(this.activeStepIndex, 1);
    this.activeStepIndex = Math.max(0, this.activeStepIndex - 1);
    this._ensureMinimumContainers(features);
    await this.render();
  }

  // ---------------------------------------------------------------------------
  // Ingredient set management
  // ---------------------------------------------------------------------------

  static async _onAddIngredientSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const sets = containers.ingredientSets;
    sets.push({
      id: foundry.utils.randomID(),
      name: `Set ${sets.length + 1}`,
      ingredientGroups: [this._newIngredientGroup()],
      catalysts: [],
      essences: {},
      resultGroupId: null,
      resultMapping: []
    });
    await this.render();
  }

  static async _onRemoveIngredientSet(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const sets = containers.ingredientSets;
    if (sets.length <= 1) {
      ui.notifications.warn('A recipe needs at least one ingredient set.');
      return;
    }
    const idx = Number(target.dataset.setIndex ?? target.dataset.index ?? 0);
    if (!Number.isFinite(idx) || !sets[idx]) return;
    const removedId = sets[idx].id;
    sets.splice(idx, 1);
    this.collapsedPanels.delete(removedId);
    await this.render();
  }

  static async _onAddIngredientGroup(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    const containers = this._ensureMinimumContainers(features);
    const setIndex = Number(target.dataset.setIndex ?? 0);
    const set = containers.ingredientSets[Number.isFinite(setIndex) ? setIndex : 0] || containers.ingredientSets[0];
    if (!set) return;
    set.ingredientGroups = this._normalizeIngredientGroups(set);
    set.ingredientGroups.push(this._newIngredientGroup({}, set.ingredientGroups.length));
    await this.render();
  }

  static async _onRemoveIngredientGroup(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.groupIndex || 0);
    const features = this._getSystemFeatureState();
    const containers = this._ensureMinimumContainers(features);
    const setIndex = Number(target.dataset.setIndex ?? 0);
    const set = containers.ingredientSets[Number.isFinite(setIndex) ? setIndex : 0] || containers.ingredientSets[0];
    if (!set) return;
    set.ingredientGroups = this._normalizeIngredientGroups(set);
    if (set.ingredientGroups.length <= 1) {
      ui.notifications.warn('An ingredient set needs at least one ingredient group.');
      return;
    }
    if (!set.ingredientGroups[idx]) return;
    set.ingredientGroups.splice(idx, 1);
    await this.render();
  }

  static async _onAddIngredientOption(event, target) {
    this._syncDraftFromForm();
    const groupIndex = Number(target.dataset.groupIndex || 0);
    const features = this._getSystemFeatureState();
    const containers = this._ensureMinimumContainers(features);
    const setIndex = Number(target.dataset.setIndex ?? 0);
    const set = containers.ingredientSets[Number.isFinite(setIndex) ? setIndex : 0] || containers.ingredientSets[0];
    if (!set) return;
    set.ingredientGroups = this._normalizeIngredientGroups(set);
    const group = set.ingredientGroups[groupIndex];
    if (!group) return;
    group.options = Array.isArray(group.options) ? group.options : [];
    group.options.push(this._newIngredientOption({}));
    await this.render();
  }

  static async _onRemoveIngredientOption(event, target) {
    this._syncDraftFromForm();
    const groupIndex = Number(target.dataset.groupIndex || 0);
    const optionIndex = Number(target.dataset.optionIndex || 0);
    const features = this._getSystemFeatureState();
    const containers = this._ensureMinimumContainers(features);
    const setIndex = Number(target.dataset.setIndex ?? 0);
    const set = containers.ingredientSets[Number.isFinite(setIndex) ? setIndex : 0] || containers.ingredientSets[0];
    if (!set) return;
    set.ingredientGroups = this._normalizeIngredientGroups(set);
    const group = set.ingredientGroups[groupIndex];
    if (!group) return;
    group.options = Array.isArray(group.options) ? group.options : [];
    if (group.options.length <= 1) {
      ui.notifications.warn('An ingredient group needs at least one option.');
      return;
    }
    if (!group.options[optionIndex]) return;
    group.options.splice(optionIndex, 1);
    await this.render();
  }

  static async _onAddCatalystRow(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    const containers = this._ensureMinimumContainers(features);
    const setIndex = Number(target?.dataset?.setIndex ?? 0);
    const set = containers.ingredientSets[Number.isFinite(setIndex) ? setIndex : 0] || containers.ingredientSets[0];
    if (!set) return;
    set.catalysts = Array.isArray(set.catalysts) ? set.catalysts : [];
    set.catalysts.push({ componentId: null, degradesOnUse: false, maxUses: null });
    await this.render();
  }

  static async _onRemoveCatalystRow(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.index);
    const features = this._getSystemFeatureState();
    const containers = this._ensureMinimumContainers(features);
    const setIndex = Number(target.dataset.setIndex ?? 0);
    const set = containers.ingredientSets[Number.isFinite(setIndex) ? setIndex : 0] || containers.ingredientSets[0];
    if (!set) return;
    if (!Array.isArray(set.catalysts) || !set.catalysts[idx]) return;
    set.catalysts.splice(idx, 1);
    await this.render();
  }

  // ---------------------------------------------------------------------------
  // Result group management
  // ---------------------------------------------------------------------------

  static async _onAddResultSet() {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const groups = containers.results;
    groups.push({
      id: foundry.utils.randomID(),
      name: `Result Group ${groups.length + 1}`,
      results: [this._newResultRow()]
    });
    await this.render();
  }

  static async _onRemoveResultSet(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const groups = containers.results;
    if (groups.length <= 1) {
      ui.notifications.warn('A recipe needs at least one result group.');
      return;
    }
    const idx = Number(target.dataset.groupIndex ?? target.dataset.index ?? 0);
    if (!Number.isFinite(idx) || !groups[idx]) return;
    const removedId = groups[idx].id;
    groups.splice(idx, 1);
    this.collapsedPanels.delete(removedId);
    await this.render();
  }

  static async _onAddResultRow(event, target) {
    this._syncDraftFromForm();
    const features = this._getSystemFeatureState();
    if (!features.showComplexRecipes) return;
    const containers = this._ensureMinimumContainers(features);
    const groupIndex = Number(target?.dataset?.groupIndex ?? 0);
    const group = containers.results[Number.isFinite(groupIndex) ? groupIndex : 0] || containers.results[0];
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
    const containers = this._ensureMinimumContainers(features);
    const groupIndex = Number(target.dataset.groupIndex ?? 0);
    const group = containers.results[Number.isFinite(groupIndex) ? groupIndex : 0] || containers.results[0];
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

  // ---------------------------------------------------------------------------
  // Ingredient / catalyst clear actions
  // ---------------------------------------------------------------------------

  static async _onClearIngredientComponent(event, target) {
    this._syncDraftFromForm();
    const groupIndex = Number(target.dataset.groupIndex || 0);
    const optionIndex = Number(target.dataset.optionIndex || 0);
    const features = this._getSystemFeatureState();
    const containers = this._ensureMinimumContainers(features);
    const setIndex = Number(target.dataset.setIndex ?? 0);
    const set = containers.ingredientSets[Number.isFinite(setIndex) ? setIndex : 0] || containers.ingredientSets[0];
    if (!set) return;
    set.ingredientGroups = this._normalizeIngredientGroups(set);
    const option = set.ingredientGroups?.[groupIndex]?.options?.[optionIndex];
    if (!option) return;
    option.componentId = null;
    await this.render();
  }

  static async _onClearCatalystComponent(event, target) {
    this._syncDraftFromForm();
    const idx = Number(target.dataset.index || 0);
    const features = this._getSystemFeatureState();
    const containers = this._ensureMinimumContainers(features);
    const setIndex = Number(target.dataset.setIndex ?? 0);
    const set = containers.ingredientSets[Number.isFinite(setIndex) ? setIndex : 0] || containers.ingredientSets[0];
    if (!set?.catalysts?.[idx]) return;
    set.catalysts[idx].componentId = null;
    await this.render();
  }

  // ---------------------------------------------------------------------------
  // Picker and linked item actions
  // ---------------------------------------------------------------------------

  static async _onPickerSearch(event, target) {
    this.itemPickerSearch = target.value || '';
    await this.render();
  }

  static async _onClearLinkedRecipeItem() {
    this._syncDraftFromForm();
    this.draft.linkedRecipeItemUuid = '';
    await this.render();
  }

  static async _onBrowseLinkedRecipeItem() {
    this._syncDraftFromForm();
    const uuid = await new Promise((resolve) => {
      new Dialog({
        title: 'Select Linked Recipe Item',
        content: '<div class="form-group"><label>Item UUID</label><input type="text" name="uuid" placeholder="Paste or type item UUID" /></div>',
        buttons: {
          ok: {
            label: 'Confirm',
            callback: (html) => resolve(html.find('[name=uuid]').val()?.trim() || '')
          },
          cancel: { label: 'Cancel', callback: () => resolve('') }
        },
        default: 'ok'
      }).render(true);
    });
    if (uuid) {
      this.draft.linkedRecipeItemUuid = uuid;
      await this.render();
    }
  }

  static async _onCreateLinkedRecipeItem() {
    this._syncDraftFromForm();
    if (this.draft.linkedRecipeItemUuid) {
      ui.notifications.warn('A linked recipe item UUID is already set. Clear it first to create a new one.');
      return;
    }
    const recipeName = this.draft.name || 'Unnamed Recipe';
    const itemData = {
      name: `Recipe: ${recipeName}`,
      type: 'loot',
      img: this.draft.img || 'icons/svg/item-bag.svg'
    };
    try {
      const item = await Item.create(itemData, { parent: null });
      this.draft.linkedRecipeItemUuid = item.uuid;
      ui.notifications.info(`Created world item "${item.name}" and linked it to this recipe.`);
      await this.render();
    } catch (err) {
      console.error('Fabricate | Failed to create linked recipe item:', err);
      ui.notifications.error('Failed to create recipe item. Check console for details.');
    }
  }

  // ---------------------------------------------------------------------------
  // Save / cancel
  // ---------------------------------------------------------------------------

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
      const validation = this._validatePayload(payload, this._getSystemFeatureState());
      if (!validation.valid) {
        ui.notifications.error(`Cannot save recipe: ${validation.errors.map(e => typeof e === 'string' ? e : e.message).join('; ')}`);
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
      console.error('Fabricate | Recipe save failed', err);
      ui.notifications.error(err.message || 'Failed to save recipe.');
    }
  }

  static async _onCancel() {
    this.close();
  }

  // Callers outside this class should use getRecipeEditorAppClass().show() from appFactory.js
  // to get the correct class for the active UI engine.
  // TODO T-150: once the Svelte variant exists, this method must not hardcode new RecipeEditorApp().
  static show(recipe = null, parentApp = null, craftingSystemId = null) {
    const app = new RecipeEditorApp(recipe, { parentApp, craftingSystemId });
    app.render(true);
    return app;
  }
}
