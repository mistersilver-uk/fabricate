/**
 * editorStore — Svelte store factory for the RecipeEditorApp (T-140)
 *
 * All side-effects are injected via `services` so this module never touches
 * `game.*` directly.  Each call to createEditorStore() produces a fresh,
 * isolated set of writable() instances.
 */
import { writable, derived, get } from 'svelte/store';
import {
  GENERAL_RECIPE_CATEGORY,
  getEffectiveRecipeCategories,
  normalizeRecipeCategory
} from '../../../utils/recipeCategories.js';
import {
  applyRecipeAvailabilityState,
  getRecipeAvailabilityFlags,
  getRecipeAvailabilityState
} from '../../recipeAvailability.js';
import { clampComponentEssenceQuantity } from '../util/componentEditor.js';
import {
  draftIngredientGroupHasRequirement,
  draftIngredientSetHasRequirement,
  serializeDraftIngredientGroups
} from '../../recipeIngredientGroups.js';

// ---------------------------------------------------------------------------
// ID generation helper (injectable for tests)
// ---------------------------------------------------------------------------

function _randomID(services) {
  return services?.randomID?.() ?? Math.random().toString(36).slice(2, 14);
}

function _cloneDraftState(value) {
  if (Array.isArray(value)) {
    return value.map(entry => _cloneDraftState(entry));
  }

  if (value && typeof value === 'object') {
    const clone = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = _cloneDraftState(entry);
    }
    return clone;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Draft builder helpers (ported from RecipeEditorApp.js)
// ---------------------------------------------------------------------------

function _newIngredientOption(data = {}, services) {
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
    id: data.id || _randomID(services),
    matchType,
    componentId: (rawMatch.componentId || rawMatch.systemItemId || data.componentId || data.systemItemId || null),
    quantity: Number(data.quantity || 1),
    tagMatch: (data.tagMatch || rawMatch.tagMatch) === 'all' ? 'all' : 'any',
    tagsText
  };
}

function _newIngredientGroup(data = {}, index = 0, services) {
  const rawOptions = Array.isArray(data.options) && data.options.length > 0
    ? data.options
    : (data.match || data.systemItemId || data.tag || Array.isArray(data.tags) ? [data] : []);
  const options = rawOptions.map(option => _newIngredientOption(option, services));
  if (options.length === 0) {
    options.push(_newIngredientOption({}, services));
  }
  return {
    id: data.id || _randomID(services),
    name: data.name || `Group ${index + 1}`,
    options
  };
}

function _normalizeIngredientGroups(set = {}, setIndex = 0, services) {
  const fromGroups = Array.isArray(set.ingredientGroups) ? set.ingredientGroups : [];
  const fromLegacy = Array.isArray(set.ingredients)
    ? set.ingredients.map((ingredient, idx) => ({
      id: _randomID(services),
      name: `Group ${idx + 1}`,
      options: [ingredient]
    }))
    : [];
  const source = fromGroups.length > 0 ? fromGroups : fromLegacy;
  const normalized = source.map((group, idx) => _newIngredientGroup(group, idx, services));
  if (normalized.length > 0) return normalized;
  return [_newIngredientGroup({}, setIndex, services)];
}

function _newResultRow(services) {
  return {
    id: _randomID(services),
    name: '',
    componentId: null,
    quantity: 1,
    propertyMacroUuid: null
  };
}

function _normalizeDraftIngredientSet(set = {}, idx = 0, services) {
  return {
    id: set.id || _randomID(services),
    name: set.name || `Set ${idx + 1}`,
    ingredientGroups: _normalizeIngredientGroups(set, idx, services),
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

function _normalizeDraftResultGroup(group = {}, idx = 0, services) {
  return {
    id: group.id || _randomID(services),
    name: group.name || `Result Group ${idx + 1}`,
    results: Array.isArray(group.results) && group.results.length > 0
      ? group.results.map((res, resIdx) => ({
        id: res.id || _randomID(services),
        name: res.name || `Result ${resIdx + 1}`,
        componentId: res.componentId || res.systemItemId || null,
        quantity: Number(res.quantity || 1),
        propertyMacroUuid: res.propertyMacroUuid || null
      }))
      : [_newResultRow(services)]
  };
}

function _newDraftStep(stepIndex = 0, data = null, services) {
  const source = data && typeof data === 'object' ? data : {};
  const ingredientSets = (source.ingredientSets || []).length > 0
    ? source.ingredientSets.map((set, idx) => _normalizeDraftIngredientSet(set, idx, services))
    : [_normalizeDraftIngredientSet({}, 0, services)];
  const resultGroups = (source.resultGroups || source.results || []).length > 0
    ? (source.resultGroups || source.results).map((group, idx) => _normalizeDraftResultGroup(group, idx, services))
    : [_normalizeDraftResultGroup({}, 0, services)];
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
    id: source.id || _randomID(services),
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

function _buildDraft(recipe, craftingSystemId, services) {
  const data = recipe?.toJSON ? recipe.toJSON() : (recipe || {});
  const ingredientSets = (data.ingredientSets || []).length > 0
    ? data.ingredientSets
    : [{
      id: _randomID(services),
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
      id: res.id || _randomID(services),
      name: `Result Group ${idx + 1}`,
      results: [res]
    })));
  if (sourceGroups.length === 0) {
    sourceGroups.push({
      id: _randomID(services),
      name: 'Result Group 1',
      results: [_newResultRow(services)]
    });
  }

  const draftIngredientSets = ingredientSets.map((set, idx) => _normalizeDraftIngredientSet(set, idx, services));
  const draftResults = sourceGroups.map((group, idx) => _normalizeDraftResultGroup(group, idx, services));
  const draftSteps = Array.isArray(data.steps)
    ? data.steps.map((step, idx) => _newDraftStep(idx, step, services))
    : [];

  return {
    id: data.id || null,
    craftingSystemId: data.craftingSystemId || craftingSystemId || null,
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
    resultSelection: data.resultSelection && typeof data.resultSelection === 'object'
      ? { ...data.resultSelection }
      : null,
    ingredientSets: draftIngredientSets,
    results: draftResults,
    steps: draftSteps,
    metadata: data.metadata || undefined
  };
}

// ---------------------------------------------------------------------------
// Feature state helper (ported from RecipeEditorApp._getSystemFeatureState)
// ---------------------------------------------------------------------------

function _getSystemFeatureState(draft, services) {
  const system = draft.craftingSystemId
    ? services.getSystem?.(draft.craftingSystemId)
    : null;
  const advancedEnabled = system?.advancedOptionsEnabled !== false;
  const features = system?.features || {};
  const resolutionMode = system?.resolutionMode || 'simple';
  const listMode = system?.recipeVisibility?.listMode || 'global';
  const knowledgeMode = system?.recipeVisibility?.knowledge?.mode || 'itemOrLearned';
  const routedByIngredientSet = resolutionMode === 'mapped';
  const routedByOutcome = resolutionMode === 'tiered';
  const supportsAdvancedRouting = ['mapped', 'tiered', 'alchemy', 'routed'].includes(resolutionMode);
  const hasConfiguredCraftingCheck = system?.craftingCheck?.enabled === true || !!system?.craftingCheck?.macroUuid;

  return {
    system,
    resolutionMode,
    isMappedMode: routedByIngredientSet,
    isAlchemyMode: resolutionMode === 'alchemy',
    isProgressiveMode: resolutionMode === 'progressive',
    showRecipeVisibilityGlobal: listMode === 'global',
    showRecipeVisibilityPlayer: listMode === 'player',
    showRecipeVisibilityKnowledge: listMode === 'knowledge',
    requiresLinkedRecipeItem: listMode === 'knowledge' && ['item', 'learned', 'itemOrLearned'].includes(knowledgeMode),
    knowledgeMode,
    showCategories: advancedEnabled && features.recipeCategories === true,
    showItemTags: advancedEnabled && features.itemTags === true,
    showEssences: advancedEnabled && (features.essences === true),
    showComplexRecipes: advancedEnabled && (features.complexRecipes === true || supportsAdvancedRouting),
    showMultiStepRecipes: advancedEnabled && features.multiStepRecipes === true,
    showTimeRequirements: system?.requirements?.time?.enabled === true,
    showCurrencyRequirements: system?.requirements?.currency?.enabled === true,
    showPropertyMacros: advancedEnabled && features.propertyMacros === true,
    showCraftingChecks: advancedEnabled && (features.craftingChecks === true || hasConfiguredCraftingCheck),
    showOutcomeRouting: advancedEnabled && (features.outcomeRouting === true || routedByOutcome),
    craftingCheckOutcomes: Array.isArray(system?.craftingCheck?.outcomes) ? system.craftingCheck.outcomes : []
  };
}

// ---------------------------------------------------------------------------
// Active containers helper
// ---------------------------------------------------------------------------

function _getActiveDraftContainers(draft, featureState, activeStepIndex, services) {
  const useSteps = featureState.showMultiStepRecipes === true;
  if (!useSteps) {
    if (!Array.isArray(draft.ingredientSets) || draft.ingredientSets.length === 0) {
      draft.ingredientSets = [_normalizeDraftIngredientSet({}, 0, services)];
    }
    if (!Array.isArray(draft.results) || draft.results.length === 0) {
      draft.results = [_normalizeDraftResultGroup({}, 0, services)];
    }
    return {
      useSteps: false,
      step: null,
      ingredientSets: draft.ingredientSets,
      results: draft.results,
      outcomeRouting: draft.outcomeRouting || {}
    };
  }

  if (!Array.isArray(draft.steps)) draft.steps = [];
  if (draft.steps.length === 0) {
    draft.steps.push(_newDraftStep(0, {
      ingredientSets: draft.ingredientSets,
      resultGroups: draft.results,
      outcomeRouting: draft.outcomeRouting
    }, services));
  }
  let stepIdx = activeStepIndex;
  if (stepIdx >= draft.steps.length) stepIdx = draft.steps.length - 1;
  if (stepIdx < 0) stepIdx = 0;

  const step = draft.steps[stepIdx];
  if (!Array.isArray(step.ingredientSets) || step.ingredientSets.length === 0) {
    step.ingredientSets = [_normalizeDraftIngredientSet({}, 0, services)];
  }
  if (!Array.isArray(step.results) || step.results.length === 0) {
    step.results = [_normalizeDraftResultGroup({}, 0, services)];
  }
  if (!step.outcomeRouting || typeof step.outcomeRouting !== 'object') {
    step.outcomeRouting = {};
  }
  if (!step.timeRequirement || typeof step.timeRequirement !== 'object') {
    step.timeRequirement = { minutes: 0, hours: 0, days: 0, months: 0, years: 0 };
  }

  return {
    useSteps: true,
    step,
    stepIndex: stepIdx,
    ingredientSets: step.ingredientSets,
    results: step.results,
    outcomeRouting: step.outcomeRouting
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function _validateDraft(draft, featureState, services) {
  const errors = [];

  if (!draft.name || !draft.name.trim()) {
    errors.push({ message: 'Recipe must have a name', fieldSelector: '[name="recipeName"]' });
  }

  if (featureState.requiresLinkedRecipeItem && !draft.linkedRecipeItemUuid) {
    errors.push({
      message: 'Linked recipe item UUID is required for this crafting system visibility mode',
      fieldSelector: '[name="linkedRecipeItemUuid"]'
    });
  }

  // Validate ingredient sets
  const ingredientSets = featureState.showMultiStepRecipes
    ? (draft.steps || []).flatMap(s => s.ingredientSets || [])
    : (draft.ingredientSets || []);

  for (const set of ingredientSets) {
    const groups = set.ingredientGroups || [];
    const setHasRequirements = draftIngredientSetHasRequirement(set, {
      showItemTags: featureState.showItemTags
    });
    for (const group of groups) {
      const hasContent = draftIngredientGroupHasRequirement(group, {
        showItemTags: featureState.showItemTags
      });
      if (!hasContent && !setHasRequirements) {
        errors.push({
          message: `Ingredient group "${group.name}" has no items or tags assigned`,
          panelId: set.id,
          fieldSelector: `[data-group-id="${group.id}"]`
        });
      }
    }
  }

  // Validate result groups
  const resultGroups = featureState.showMultiStepRecipes
    ? (draft.steps || []).flatMap(s => s.results || [])
    : (draft.results || []);

  for (const group of resultGroups) {
    const results = group.results || [];
    const hasContent = results.some(r => r.componentId);
    if (!hasContent) {
      errors.push({
        message: `Result group "${group.name}" has no items assigned`,
        panelId: group.id,
        fieldSelector: `[data-group-id="${group.id}"]`
      });
    }
  }

  // Validate rollTableOutcome resultSelection
  if (draft.resultSelection?.provider === 'rollTableOutcome') {
    if (!draft.resultSelection.rollTableUuid) {
      errors.push({
        message: 'Roll table UUID is required when using the Roll Table outcome provider',
        fieldSelector: '[name="rollTableUuid"]'
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Payload builder (ported from RecipeEditorApp._buildRecipePayload)
// ---------------------------------------------------------------------------

function _buildRecipePayload(draft, featureState, services) {
  const enableEssences = featureState.showEssences;
  const enableCategories = featureState.showCategories;
  const enableComplexRecipes = featureState.showComplexRecipes;
  const enablePropertyMacros = featureState.showPropertyMacros;
  const availability = getRecipeAvailabilityFlags(getRecipeAvailabilityState(draft));

  const serializeIngredientSets = (sourceSets = []) => {
    const sets = enableComplexRecipes ? sourceSets : [sourceSets[0]];
    return sets.filter(Boolean).map((set, idx) => {
      const ingredientGroups = serializeDraftIngredientGroups(
        _normalizeIngredientGroups(set, idx, services),
        {
          showItemTags: featureState.showItemTags,
          randomID: () => _randomID(services)
        }
      );
      const legacyIngredients = ingredientGroups
        .map(group => group.options?.[0] || null)
        .filter(Boolean);

      return {
        id: set.id || _randomID(services),
        name: set.name || `Set ${idx + 1}`,
        ingredientGroups,
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
        resultGroupId: featureState.isMappedMode ? (set.resultGroupId || null) : null,
        resultMapping: (enableComplexRecipes && draft.isVariable && !featureState.isMappedMode)
          ? (set.resultMapping || []) : []
      };
    });
  };

  const serializeResultGroups = (sourceGroups = []) => {
    const groups = enableComplexRecipes ? sourceGroups : [sourceGroups[0]];
    return groups.filter(Boolean).map((group, groupIdx) => ({
      id: group.id || _randomID(services),
      name: group.name || `Result Group ${groupIdx + 1}`,
      results: (group.results || []).map((res, resIdx) => ({
        id: res.id || `${group.id || _randomID(services)}-result-${resIdx + 1}`,
        componentId: res.componentId || res.systemItemId || null,
        quantity: Number(res.quantity || 1),
        propertyMacroUuid: enablePropertyMacros ? (res.propertyMacroUuid || null) : null
      }))
    }));
  };

  const serializeTimeRequirement = (timeRequirement = null) => {
    if (!featureState.showTimeRequirements || !timeRequirement || typeof timeRequirement !== 'object') return null;
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
    if (!featureState.showCurrencyRequirements || !currencyRequirement || typeof currencyRequirement !== 'object') return null;
    const unit = String(currencyRequirement.unit || '').trim();
    const amount = Math.max(0, Number(currencyRequirement.amount || 0) || 0);
    if (!unit || amount <= 0) return null;
    return { unit, amount };
  };

  const stepPayloads = featureState.showMultiStepRecipes
    ? (draft.steps || []).map((step, stepIndex) => ({
      id: step.id || _randomID(services),
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
      outcomeRouting: (enableComplexRecipes && featureState.showCraftingChecks && featureState.showOutcomeRouting)
        ? (step.outcomeRouting || {})
        : null
    }))
    : [];

  const topLevelIngredientSets = featureState.showMultiStepRecipes
    ? (stepPayloads[0]?.ingredientSets || [])
    : serializeIngredientSets(draft.ingredientSets || []);
  const topLevelResultGroups = featureState.showMultiStepRecipes
    ? (stepPayloads[0]?.resultGroups || [])
    : serializeResultGroups(draft.results || []);
  const topLevelOutcomeRouting = featureState.showMultiStepRecipes
    ? (stepPayloads[0]?.outcomeRouting || null)
    : ((enableComplexRecipes && featureState.showCraftingChecks && featureState.showOutcomeRouting)
      ? (draft.outcomeRouting || {})
      : null);
  const flatResults = topLevelResultGroups.flatMap(group => group.results);

  return {
    name: draft.name,
    description: draft.description,
    img: draft.img,
    category: enableCategories ? normalizeRecipeCategory(draft.category) : GENERAL_RECIPE_CATEGORY,
    craftingSystemId: draft.craftingSystemId || null,
    system: 'all',
    enabled: availability.enabled,
    locked: availability.locked,
    linkedRecipeItemUuid: draft.linkedRecipeItemUuid || null,
    visibility: featureState.showRecipeVisibilityPlayer
      ? {
        restricted: draft.visibility?.restricted === true,
        allowedUserIds: draft.visibility?.restricted === true
          ? (draft.visibility?.allowedUserIds || [])
          : []
      }
      : null,
    tags: [],
    ingredientSets: topLevelIngredientSets,
    resultGroups: topLevelResultGroups,
    steps: featureState.showMultiStepRecipes ? stepPayloads : [],
    results: flatResults,
    isVariable: enableComplexRecipes ? draft.isVariable : false,
    transferEffects: draft.transferEffects,
    outcomeRouting: topLevelOutcomeRouting,
    resultSelection: draft.resultSelection || null,
    metadata: draft.metadata
  };
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

/**
 * Create an isolated editor store for one recipe editor instance.
 *
 * @param {Object} services - Injected dependencies
 * @param {Function} services.randomID - Generate unique IDs
 * @param {Function} services.getSystem - Get a crafting system by ID
 * @param {Function} services.getItems - Get components for picker
 * @param {Function} services.saveRecipe - Persist recipe (create or update)
 * @param {Function} services.onClose - Callback when editor closes
 * @param {Function} [services.notify] - Show notifications
 * @param {Object} [options] - Editor options
 * @param {Object} [options.recipe] - Existing recipe to edit (null for new)
 * @param {string} [options.craftingSystemId] - Crafting system ID
 */
export function createEditorStore(services, options = {}) {
  const recipe = options.recipe || null;
  const craftingSystemId = options.craftingSystemId || recipe?.craftingSystemId || null;
  const initialDraft = _buildDraft(recipe, craftingSystemId, services);

  // Core state
  const draft = writable(initialDraft);
  const activeStepIndex = writable(0);
  const collapsedPanels = writable(new Set());
  const pickerSearch = writable('');

  // Derived: feature state from system config
  const featureState = derived(draft, ($draft) => {
    return _getSystemFeatureState($draft, services);
  });

  // Derived: active containers (ingredient sets + results for current step or top-level)
  // Shallow-copy the top-level arrays on every re-evaluation so that downstream
  // Svelte $derived expressions and {#each} blocks detect in-place mutations
  // applied by updateDraft() callbacks.
  const activeContainers = derived([draft, featureState, activeStepIndex], ([$draft, $features, $stepIdx]) => {
    const containers = _getActiveDraftContainers($draft, $features, $stepIdx, services);
    return {
      ...containers,
      ingredientSets: [...(containers.ingredientSets || [])],
      results: [...(containers.results || [])]
    };
  });

  // Derived: validation errors
  const validationErrors = derived([draft, featureState], ([$draft, $features]) => {
    return _validateDraft($draft, $features, services);
  });

  // Derived: picker items
  const pickerItems = derived([draft, pickerSearch], ([$draft, $search]) => {
    if (!$draft.craftingSystemId || !services.getItems) return [];
    return services.getItems($draft.craftingSystemId, $search);
  });

  // Derived: whether the editor is for a new recipe
  const isNewRecipe = derived(draft, ($draft) => !$draft.id);

  // Derived: system categories for category select
  const systemCategories = derived(draft, ($draft) => {
    if (!$draft.craftingSystemId || !services.getSystem) return [];
    const system = services.getSystem($draft.craftingSystemId);
    return getEffectiveRecipeCategories(system?.categories || []);
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function updateDraft(updater) {
    draft.update(d => {
      updater(d);
      // Publish a fresh draft graph so runes-mode child components receive
      // updated nested prop identities after in-place mutations.
      return _cloneDraftState(d);
    });
  }

  function setField(field, value) {
    updateDraft(d => { d[field] = value; });
  }

  function setAvailabilityState(state) {
    updateDraft(d => {
      applyRecipeAvailabilityState(d, state);
    });
  }

  // --- Step navigation ---

  function prevStep() {
    const $features = get(featureState);
    if (!$features.showMultiStepRecipes) return;
    const $draft = get(draft);
    if (!Array.isArray($draft.steps) || $draft.steps.length === 0) return;
    activeStepIndex.update(idx => (idx - 1 + $draft.steps.length) % $draft.steps.length);
  }

  function nextStep() {
    const $features = get(featureState);
    if (!$features.showMultiStepRecipes) return;
    const $draft = get(draft);
    if (!Array.isArray($draft.steps) || $draft.steps.length === 0) return;
    activeStepIndex.update(idx => (idx + 1) % $draft.steps.length);
  }

  function addStep() {
    const $features = get(featureState);
    if (!$features.showMultiStepRecipes) return;
    updateDraft(d => {
      if (!Array.isArray(d.steps)) d.steps = [];
      d.steps.push(_newDraftStep(d.steps.length, {}, services));
    });
    const $draft = get(draft);
    activeStepIndex.set($draft.steps.length - 1);
  }

  function removeStep() {
    const $features = get(featureState);
    if (!$features.showMultiStepRecipes) return;
    const $draft = get(draft);
    if (!Array.isArray($draft.steps) || $draft.steps.length <= 1) {
      services.notify?.('warn', 'A recipe needs at least one step.');
      return;
    }
    const $stepIdx = get(activeStepIndex);
    updateDraft(d => { d.steps.splice($stepIdx, 1); });
    activeStepIndex.update(idx => Math.max(0, idx - 1));
  }

  // --- Panel collapse ---

  function togglePanel(panelId) {
    collapsedPanels.update(panels => {
      const next = new Set(panels);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  }

  // --- Ingredient set management ---

  function _getContainerSets() {
    const $draft = get(draft);
    const $features = get(featureState);
    const $stepIdx = get(activeStepIndex);
    return _getActiveDraftContainers($draft, $features, $stepIdx, services);
  }

  function addIngredientSet() {
    const $features = get(featureState);
    if (!$features.showComplexRecipes) return;
    updateDraft(d => {
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      containers.ingredientSets.push({
        id: _randomID(services),
        name: `Set ${containers.ingredientSets.length + 1}`,
        ingredientGroups: [_newIngredientGroup({}, 0, services)],
        catalysts: [],
        essences: {},
        resultGroupId: null,
        resultMapping: []
      });
    });
  }

  function removeIngredientSet(setIndex) {
    const $features = get(featureState);
    if (!$features.showComplexRecipes) return;
    updateDraft(d => {
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const sets = containers.ingredientSets;
      if (sets.length <= 1) {
        services.notify?.('warn', 'A recipe needs at least one ingredient set.');
        return;
      }
      const idx = Number(setIndex);
      if (!Number.isFinite(idx) || !sets[idx]) return;
      const removedId = sets[idx].id;
      sets.splice(idx, 1);
      collapsedPanels.update(panels => {
        const next = new Set(panels);
        next.delete(removedId);
        return next;
      });
    });
  }

  function moveIngredientSetUp(setIndex) {
    const $features = get(featureState);
    if (!$features.showComplexRecipes) return;
    updateDraft(d => {
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const sets = containers.ingredientSets;
      const idx = Number(setIndex);
      if (!Number.isFinite(idx) || idx <= 0 || idx >= sets.length) return;
      [sets[idx - 1], sets[idx]] = [sets[idx], sets[idx - 1]];
    });
  }

  function moveIngredientSetDown(setIndex) {
    const $features = get(featureState);
    if (!$features.showComplexRecipes) return;
    updateDraft(d => {
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const sets = containers.ingredientSets;
      const idx = Number(setIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= sets.length - 1) return;
      [sets[idx], sets[idx + 1]] = [sets[idx + 1], sets[idx]];
    });
  }

  // --- Ingredient group management ---

  function addIngredientGroup(setIndex = 0) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set) return;
      set.ingredientGroups = _normalizeIngredientGroups(set, 0, services);
      set.ingredientGroups.push(_newIngredientGroup({}, set.ingredientGroups.length, services));
    });
  }

  function removeIngredientGroup(setIndex, groupIndex) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set) return;
      set.ingredientGroups = _normalizeIngredientGroups(set, 0, services);
      if (set.ingredientGroups.length <= 1) {
        services.notify?.('warn', 'An ingredient set needs at least one ingredient group.');
        return;
      }
      const idx = Number(groupIndex);
      if (!set.ingredientGroups[idx]) return;
      set.ingredientGroups.splice(idx, 1);
    });
  }

  // --- Ingredient option management ---

  function addIngredientOption(setIndex, groupIndex) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set) return;
      set.ingredientGroups = _normalizeIngredientGroups(set, 0, services);
      const group = set.ingredientGroups[Number(groupIndex)];
      if (!group) return;
      if (!Array.isArray(group.options)) group.options = [];
      group.options.push(_newIngredientOption({}, services));
    });
  }

  function removeIngredientOption(setIndex, groupIndex, optionIndex) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set) return;
      set.ingredientGroups = _normalizeIngredientGroups(set, 0, services);
      const group = set.ingredientGroups[Number(groupIndex)];
      if (!group) return;
      if (!Array.isArray(group.options)) group.options = [];
      if (group.options.length <= 1) {
        services.notify?.('warn', 'An ingredient group needs at least one option.');
        return;
      }
      const idx = Number(optionIndex);
      if (!group.options[idx]) return;
      group.options.splice(idx, 1);
    });
  }

  function clearIngredientComponent(setIndex, groupIndex, optionIndex) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set) return;
      const option = set.ingredientGroups?.[Number(groupIndex)]?.options?.[Number(optionIndex)];
      if (option) option.componentId = null;
    });
  }

  // --- Catalyst management ---

  function addCatalystRow(setIndex = 0) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set) return;
      if (!Array.isArray(set.catalysts)) set.catalysts = [];
      set.catalysts.push({ componentId: null, degradesOnUse: false, maxUses: null });
    });
  }

  function removeCatalystRow(setIndex, catalystIndex) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set || !Array.isArray(set.catalysts)) return;
      const idx = Number(catalystIndex);
      if (!set.catalysts[idx]) return;
      set.catalysts.splice(idx, 1);
    });
  }

  function clearCatalystComponent(setIndex, catalystIndex) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set?.catalysts?.[Number(catalystIndex)]) return;
      set.catalysts[Number(catalystIndex)].componentId = null;
    });
  }

  // --- Essence requirement management ---

  function addEssence(setIndex, essenceId, quantity = 1) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set || !essenceId) return;
      const nextQuantity = Math.max(1, clampComponentEssenceQuantity(quantity) || 1);
      if (typeof set.essences !== 'object' || set.essences === null) set.essences = {};
      if (!Object.hasOwn(set.essences, essenceId)) {
        set.essences = { ...set.essences, [essenceId]: nextQuantity };
      }
    });
  }

  function updateEssence(setIndex, essenceId, quantity) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set || !essenceId) return;
      const currentEssences = set.essences && typeof set.essences === 'object' ? set.essences : {};
      const nextQuantity = clampComponentEssenceQuantity(quantity);

      if (nextQuantity <= 0) {
        if (!Object.hasOwn(currentEssences, essenceId)) return;
        const { [essenceId]: _, ...rest } = currentEssences;
        set.essences = rest;
        return;
      }

      set.essences = { ...currentEssences, [essenceId]: nextQuantity };
    });
  }

  function removeEssence(setIndex, essenceId) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set?.essences) return;
      const { [essenceId]: _, ...rest } = set.essences;
      set.essences = rest;
    });
  }

  // --- Result group management ---

  function addResultGroup() {
    const $features = get(featureState);
    if (!$features.showComplexRecipes) return;
    updateDraft(d => {
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      containers.results.push({
        id: _randomID(services),
        name: `Result Group ${containers.results.length + 1}`,
        results: [_newResultRow(services)]
      });
    });
  }

  function removeResultGroup(groupIndex) {
    const $features = get(featureState);
    if (!$features.showComplexRecipes) return;
    updateDraft(d => {
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const groups = containers.results;
      if (groups.length <= 1) {
        services.notify?.('warn', 'A recipe needs at least one result group.');
        return;
      }
      const idx = Number(groupIndex);
      if (!Number.isFinite(idx) || !groups[idx]) return;
      const removedId = groups[idx].id;
      groups.splice(idx, 1);
      collapsedPanels.update(panels => {
        const next = new Set(panels);
        next.delete(removedId);
        return next;
      });
    });
  }

  function moveResultGroupUp(groupIndex) {
    const $features = get(featureState);
    if (!$features.showComplexRecipes) return;
    updateDraft(d => {
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const groups = containers.results;
      const idx = Number(groupIndex);
      if (!Number.isFinite(idx) || idx <= 0 || idx >= groups.length) return;
      [groups[idx - 1], groups[idx]] = [groups[idx], groups[idx - 1]];
    });
  }

  function moveResultGroupDown(groupIndex) {
    const $features = get(featureState);
    if (!$features.showComplexRecipes) return;
    updateDraft(d => {
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const groups = containers.results;
      const idx = Number(groupIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= groups.length - 1) return;
      [groups[idx], groups[idx + 1]] = [groups[idx + 1], groups[idx]];
    });
  }

  function addResultRow(groupIndex = 0) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const group = containers.results[Number(groupIndex)] || containers.results[0];
      if (!group) return;
      if (!Array.isArray(group.results)) group.results = [];
      group.results.push(_newResultRow(services));
    });
  }

  function removeResultRow(groupIndex, resultIndex) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const group = containers.results[Number(groupIndex)] || containers.results[0];
      if (!group || !Array.isArray(group.results)) return;
      if (group.results.length <= 1) {
        services.notify?.('warn', 'A result group needs at least one result.');
        return;
      }
      const idx = Number(resultIndex);
      if (!group.results[idx]) return;
      group.results.splice(idx, 1);
    });
  }

  // --- Item assignment (from drag-and-drop) ---

  function assignIngredientItem(setIndex, groupIndex, optionIndex, componentId) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set) return;
      const option = set.ingredientGroups?.[Number(groupIndex)]?.options?.[Number(optionIndex)];
      if (option) {
        option.componentId = componentId;
        option.matchType = 'component';
      }
    });
  }

  function assignCatalystItem(setIndex, catalystIndex, componentId) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const set = containers.ingredientSets[Number(setIndex)] || containers.ingredientSets[0];
      if (!set?.catalysts?.[Number(catalystIndex)]) return;
      set.catalysts[Number(catalystIndex)].componentId = componentId;
    });
  }

  function assignResultItem(groupIndex, resultIndex, componentId) {
    updateDraft(d => {
      const $features = _getSystemFeatureState(d, services);
      const containers = _getActiveDraftContainers(d, $features, get(activeStepIndex), services);
      const group = containers.results[Number(groupIndex)] || containers.results[0];
      if (!group?.results?.[Number(resultIndex)]) return;
      group.results[Number(resultIndex)].componentId = componentId;
    });
  }

  // --- Picker search ---

  function setPickerSearch(term) {
    pickerSearch.set(term || '');
  }

  // --- Linked recipe item ---

  function clearLinkedRecipeItem() {
    updateDraft(d => { d.linkedRecipeItemUuid = ''; });
  }

  function setLinkedRecipeItemUuid(uuid) {
    updateDraft(d => { d.linkedRecipeItemUuid = uuid || ''; });
  }

  // --- Result selection (rollTableOutcome provider) ---

  function setResultSelection(provider, config = {}) {
    updateDraft(d => {
      if (!provider) {
        d.resultSelection = null;
        return;
      }
      d.resultSelection = {
        provider: String(provider),
        rollTableUuid: config?.rollTableUuid || null,
        macroUuid: config?.macroUuid || null
      };
    });
  }

  // --- Save / Cancel ---

  async function saveRecipe() {
    const $draft = get(draft);
    const $features = get(featureState);
    const errors = _validateDraft($draft, $features, services);
    if (errors.length > 0) {
      const msg = errors.map(e => e.message).join('; ');
      services.notify?.('error', `Cannot save recipe: ${msg}`);
      return { success: false, errors };
    }

    const payload = _buildRecipePayload($draft, $features, services);
    try {
      await services.saveRecipe(payload, $draft.id);
      return { success: true };
    } catch (err) {
      services.notify?.('error', err.message || 'Failed to save recipe.');
      return { success: false, errors: [{ message: err.message }] };
    }
  }

  function cancel() {
    services.onClose?.();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    // Stores (subscribable)
    draft,
    activeStepIndex,
    collapsedPanels,
    pickerSearch,

    // Derived stores
    featureState,
    activeContainers,
    validationErrors,
    pickerItems,
    isNewRecipe,
    systemCategories,

    // Actions
    setField,
    setAvailabilityState,
    updateDraft,

    // Step navigation
    prevStep,
    nextStep,
    addStep,
    removeStep,

    // Panel collapse
    togglePanel,

    // Ingredient set CRUD
    addIngredientSet,
    removeIngredientSet,
    moveIngredientSetUp,
    moveIngredientSetDown,

    // Ingredient group CRUD
    addIngredientGroup,
    removeIngredientGroup,

    // Ingredient option CRUD
    addIngredientOption,
    removeIngredientOption,
    clearIngredientComponent,

    // Catalyst CRUD
    addCatalystRow,
    removeCatalystRow,
    clearCatalystComponent,

    // Essence CRUD
    addEssence,
    updateEssence,
    removeEssence,

    // Result group CRUD
    addResultGroup,
    removeResultGroup,
    moveResultGroupUp,
    moveResultGroupDown,
    addResultRow,
    removeResultRow,

    // Item assignment (drag-and-drop)
    assignIngredientItem,
    assignCatalystItem,
    assignResultItem,

    // Picker
    setPickerSearch,

    // Linked recipe item
    clearLinkedRecipeItem,
    setLinkedRecipeItemUuid,

    // Result selection
    setResultSelection,

    // Save / Cancel
    saveRecipe,
    cancel
  };
}
