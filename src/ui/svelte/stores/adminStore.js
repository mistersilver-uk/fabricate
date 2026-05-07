/**
 * adminStore — Svelte store factory for the RecipeManagerApp (T-120)
 *
 * All side-effects are injected via `services` so this module never touches
 * `game.*` directly.  Each call to createAdminStore() produces a fresh,
 * isolated set of writable() instances. Gathering environment admin state is
 * read from an injected environment store, cloned before exposure, gated by the
 * selected system's `features.gathering` flag, and edited through explicit
 * environment draft actions. Selected-task result, catalyst, committed
 * visibility, routed result-selection, progressive award-mode, check, time
 * requirement, and failure-outcome edits stay store-owned so Svelte components
 * only render state and call injected callbacks. Failed environment saves keep
 * the dirty draft in place and expose a validation summary, field-addressable
 * inline errors, collection anchors for result groups/results, and a
 * first-invalid focus target. Provider and mode switches strip stale fields for
 * the inactive branch before the draft is saved; unresolved scene and macro
 * UUIDs stay visible and are preserved until the GM changes them. Assisted
 * environment picker options are injected as plain edge-owned records shaped
 * like `{ uuid, name, img?, stale? }`; this store never resolves Foundry
 * documents directly. Dirty environment drafts ask for discard confirmation before tab navigation, system
 * selection, environment selection, draft replacement, gathering disablement,
 * and app close. Declining keeps the draft dirty, accepting proceeds, and
 * concurrent callers share the same in-flight confirmation promise.
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
  effectTransfer: 'effectTransfer',
  gathering: 'gathering'
};

const RESOLUTION_MODE_LABEL_KEYS = {
  simple: 'FABRICATE.Admin.SystemSettings.ResolutionSimple',
  mapped: 'FABRICATE.Admin.SystemSettings.ResolutionMapped',
  tiered: 'FABRICATE.Admin.SystemSettings.ResolutionTiered',
  progressive: 'FABRICATE.Admin.SystemSettings.ResolutionProgressive',
  alchemy: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemy'
};

const BASE_TABS = new Set(['systems', 'items', 'recipes', 'rules', 'graph']);
const ENVIRONMENTS_TAB = 'environments';
const TASK_RESOLUTION_MODES = new Set(['routed', 'progressive']);
const TASK_VISIBILITY_PROVIDERS = new Set(['macro', 'dnd5e', 'pf2e']);
const TASK_RESULT_SELECTION_PROVIDERS = new Set(['macroOutcome', 'rollTableOutcome']);
const TASK_CHECK_PROVIDERS = new Set(['macro', 'dnd5e', 'pf2e']);
const TASK_PROGRESSIVE_AWARD_MODES = new Set(['equal', 'partial', 'exceed']);
const TASK_TIME_UNITS = ['minutes', 'hours', 'days', 'months', 'years'];
const TASK_FAILURE_OUTCOME_MODES = new Set(['text', 'macro']);
const DEFAULT_GATHERING_TASK_IMG = 'icons/svg/item-bag.svg';

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

function _ingredientCountForSet(ingredientSet) {
  const groups = Array.isArray(ingredientSet?.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
    ? ingredientSet.ingredientGroups
    : (ingredientSet?.ingredients || []).map(ingredient => ({ options: [ingredient] }));
  return groups.reduce((sum, group) => sum + ((group.options || []).length || 0), 0);
}

function _getRecipeExecutionSteps(recipe) {
  const methodSteps = typeof recipe?.getExecutionSteps === 'function'
    ? recipe.getExecutionSteps()
    : null;
  if (Array.isArray(methodSteps) && methodSteps.length > 0) return methodSteps;
  if (Array.isArray(recipe?.steps) && recipe.steps.length > 0) return recipe.steps;

  return [{
    id: 'implicit-step',
    name: 'Step 1',
    ingredientSets: Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [],
    resultGroups: Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [],
    catalysts: Array.isArray(recipe?.catalysts) ? recipe.catalysts : []
  }];
}

function _usesExplicitRecipeSteps(recipe, executionSteps) {
  return (Array.isArray(recipe?.steps) && recipe.steps.length > 0) || executionSteps.length > 1;
}

function _buildRequirementPreviewStep(step, index, sharedRecipeCatalysts = []) {
  const ingredientSets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
  const ingredientSetSummaries = ingredientSets.map((set, setIndex) => ({
    id: set?.id || `set-${setIndex + 1}`,
    name: set?.name || `Set ${setIndex + 1}`,
    ingredientCount: _ingredientCountForSet(set),
    catalystCount: Array.isArray(set?.catalysts) ? set.catalysts.length : 0
  }));
  const stepCatalystCount = Array.isArray(step?.catalysts) ? step.catalysts.length : 0;
  const previewIngredientCount = ingredientSetSummaries.length > 0
    ? Math.max(...ingredientSetSummaries.map(set => set.ingredientCount))
    : 0;
  const previewSetCatalystCount = ingredientSetSummaries.length > 0
    ? Math.max(...ingredientSetSummaries.map(set => set.catalystCount))
    : 0;

  return {
    id: step?.id || `step-${index + 1}`,
    name: step?.name || `Step ${index + 1}`,
    ingredientSetCount: ingredientSets.length,
    ingredientCount: previewIngredientCount,
    catalystCount: sharedRecipeCatalysts.length + stepCatalystCount + previewSetCatalystCount,
    resultGroupCount: Array.isArray(step?.resultGroups) ? step.resultGroups.length : 0,
    hasAlternatives: ingredientSetSummaries.length > 1,
    ingredientSetSummaries
  };
}

function _recipeStructure(isSimple, stepCount) {
  if (stepCount > 1) {
    return { structureKey: 'multiStep', structureLabel: 'Multi-step' };
  }
  if (isSimple) {
    return { structureKey: 'simple', structureLabel: 'Simple' };
  }
  return { structureKey: 'singleStep', structureLabel: 'Single step' };
}

function _buildRecipeBrowserDisplay(recipe) {
  const executionSteps = _getRecipeExecutionSteps(recipe);
  const isSimple = typeof recipe.isSimpleRecipe === 'function' ? recipe.isSimpleRecipe() : true;
  const sharedRecipeCatalysts = _usesExplicitRecipeSteps(recipe, executionSteps) && Array.isArray(recipe?.catalysts)
    ? recipe.catalysts
    : [];
  const requirementsPreview = executionSteps.map((step, index) =>
    _buildRequirementPreviewStep(step, index, sharedRecipeCatalysts)
  );
  const structure = _recipeStructure(isSimple, requirementsPreview.length);

  return {
    description: String(recipe.description || '').trim(),
    stepCount: requirementsPreview.length,
    resultGroupCount: requirementsPreview.reduce((sum, step) => sum + step.resultGroupCount, 0),
    ingredientCount: requirementsPreview.reduce((sum, step) => sum + step.ingredientCount, 0),
    catalystCount: requirementsPreview.reduce((sum, step) => sum + step.catalystCount, 0),
    ...structure,
    requirementsPreview,
    isSimple
  };
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
    img: item.img || 'icons/svg/item-bag.svg',
    ...(item.sourceItemUuid ? { sourceItemUuid: item.sourceItemUuid } : {}),
    ...(item.sourceUuid ? { sourceUuid: item.sourceUuid } : {}),
    ...(Object.prototype.hasOwnProperty.call(item, 'difficulty') ? { difficulty: item.difficulty } : {})
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

function _clonePlain(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function _escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function _canShowEnvironmentsTab(selectedSystem) {
  return selectedSystem?.features?.gathering === true;
}

function _resolveVisibleTab(tabName, selectedSystem) {
  if (BASE_TABS.has(tabName)) return tabName;
  if (tabName === ENVIRONMENTS_TAB && _canShowEnvironmentsTab(selectedSystem)) {
    return ENVIRONMENTS_TAB;
  }
  return 'systems';
}

function _emptyEnvironmentState(canShowEnvironmentsTab = false, error = null) {
  return {
    canShowEnvironmentsTab,
    environmentsLoading: false,
    environmentsError: error,
    environments: [],
    selectedEnvironmentId: '',
    environmentDraft: null,
    environmentDraftDirty: false,
    environmentDraftIsNew: false,
    environmentSaving: false,
    environmentSaveError: null,
    environmentValidationState: null
  };
}

function _environmentErrorMessage(err) {
  if (!err) return null;
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors.join('\n');
  }
  return err.message || String(err);
}

function _environmentValidationMessages(err) {
  if (!err) return [];
  if (Array.isArray(err.errors)) {
    return err.errors.map(error => typeof error === 'string' ? error : error?.message).filter(Boolean);
  }
  const message = _environmentErrorMessage(err);
  return message ? [message] : [];
}

function _fieldSelectorForPath(path) {
  if (!path) return null;
  const escaped = String(path).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[data-environment-field="${escaped}"]`;
}

function _validationSummary(count, localizeFn) {
  const key = count === 1
    ? 'FABRICATE.Admin.Environments.ValidationSummaryOne'
    : 'FABRICATE.Admin.Environments.ValidationSummary';
  return localizeFn?.(key, { count })
    || (count === 1 ? 'Resolve 1 validation issue before saving.' : `Resolve ${count} validation issues before saving.`);
}

function _buildEnvironmentValidationState(err, draft, localizeFn, attempt) {
  const messages = _environmentValidationMessages(err);
  if (messages.length === 0) return null;

  const structuredErrors = Array.isArray(err?.fieldErrors) ? err.fieldErrors : [];
  const inferenceContext = _createEnvironmentValidationInferenceContext();
  const errors = messages.map((message, index) => {
    const structured = structuredErrors[index] || {};
    const inferred = _inferEnvironmentValidationTarget(message, draft, inferenceContext);
    const path = structured.path || structured.fieldPath || structured.field || inferred?.path || null;
    const taskId = structured.taskId || inferred?.taskId || null;
    const fieldSelector = structured.fieldSelector || _fieldSelectorForPath(path);
    return {
      message,
      path,
      taskId,
      fieldSelector,
      id: path ? `environment-validation-${_domIdFromPath(path)}-${index}` : `environment-validation-${index}`
    };
  });

  return {
    summary: _validationSummary(errors.length, localizeFn),
    errors,
    firstInvalidField: errors.find(error => error.fieldSelector) || errors[0] || null,
    attempt
  };
}

function _createEnvironmentValidationInferenceContext() {
  return {
    groupNameOccurrences: new Map()
  };
}

function _inferEnvironmentValidationTarget(message, draft, context = _createEnvironmentValidationInferenceContext()) {
  const task = _findTaskForValidationMessage(message, draft);
  const lower = String(message || '').toLowerCase();

  if (/selection requires|selectionmode/.test(lower)) return { path: 'environment.selectionMode' };
  if (/craftingsystemid/.test(lower)) return { path: 'environment.craftingSystemId' };

  if (!task) return null;
  const prefix = `task.${task.id}`;

  if (/routed resolution requires resultselection|resultselection\.provider/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.resultSelection.provider` };
  }
  if (/macrooutcome provider requires macrouuid/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.resultSelection.macroUuid` };
  }
  if (/rolltableoutcome provider requires rolltableuuid/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.resultSelection.rollTableUuid` };
  }

  if (/progressive\.awardmode/.test(lower) || /progressive resolution requires progressive config/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.progressive.awardMode` };
  }
  if (/progressive resolution requires check|check provider must/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.check.provider` };
  }
  if (/check macro provider requires macrouuid/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.check.macroUuid` };
  }
  if (/check (dnd5e|pf2e) provider requires formula/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.check.formula` };
  }

  if (/visibility macro provider requires macrouuid/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.visibility.macroUuid` };
  }
  if (/visibility (dnd5e|pf2e) provider requires formula/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.visibility.formula` };
  }
  if (/visibility (dnd5e|pf2e) provider requires threshold/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.visibility.threshold` };
  }

  const timeUnit = lower.match(/timerequirement\.(minutes|hours|days|months|years)/)?.[1];
  if (timeUnit) return { taskId: task.id, path: `${prefix}.timeRequirement.${timeUnit}` };
  if (/timerequirement must include a positive duration/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.timeRequirement.minutes` };
  }

  if (/failureoutcome\.mode/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.failureOutcome.mode` };
  }
  if (/failureoutcome text mode requires text/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.failureOutcome.text` };
  }
  if (/failureoutcome macro mode requires macrouuid/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.failureOutcome.macroUuid` };
  }

  const catalystIndex = lower.match(/catalyst (\d+)/)?.[1];
  if (catalystIndex) {
    const index = Math.max(0, Number(catalystIndex) - 1);
    const field = /maxuses/.test(lower) ? 'maxUses' : 'componentId';
    return { taskId: task.id, path: `${prefix}.catalysts.${index}.${field}` };
  }

  const resultGroupName = message.match(/result group "([^"]+)"/)?.[1];
  if (resultGroupName) {
    const group = _resolveResultGroupValidationTarget({
      task,
      groupName: resultGroupName,
      duplicate: / duplicates "/i.test(message),
      context
    });
    return { taskId: task.id, path: group ? `${prefix}.resultGroups.${group.id}.name` : `${prefix}.resultGroups` };
  }
  if (/result groups require names/.test(lower)) {
    const group = _resolveResultGroupValidationTarget({
      task,
      groupName: '',
      context
    });
    return { taskId: task.id, path: group ? `${prefix}.resultGroups.${group.id}.name` : `${prefix}.resultGroups` };
  }
  if (/requires at least one result group|exactly one result group/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.resultGroups` };
  }
  if (/progressive result group requires at least one result/.test(lower)) {
    const group = Array.isArray(task.resultGroups) ? task.resultGroups[0] : null;
    return { taskId: task.id, path: group ? `${prefix}.resultGroups.${group.id}.results` : `${prefix}.resultGroups` };
  }

  const resultId = message.match(/progressive result "([^"]+)"/)?.[1];
  if (resultId) return { taskId: task.id, path: `${prefix}.result.${resultId}.componentId` };

  return { taskId: task.id, path: `${prefix}.name` };
}

function _resolveResultGroupValidationTarget({ task, groupName, duplicate = false, context }) {
  const groups = Array.isArray(task?.resultGroups) ? task.resultGroups : [];
  const normalizedName = _normalizeValidationGroupName(groupName);
  const matches = groups.filter(group => _normalizeValidationGroupName(group?.name) === normalizedName);
  if (matches.length === 0) return null;

  const occurrenceKey = `${task?.id || 'task'}:${duplicate ? 'duplicate' : 'named'}:${normalizedName}`;
  const previous = context.groupNameOccurrences.get(occurrenceKey);
  const defaultIndex = duplicate && matches.length > 1 ? 1 : 0;
  const index = previous === undefined ? defaultIndex : previous + 1;
  context.groupNameOccurrences.set(occurrenceKey, index);
  return matches[Math.min(index, matches.length - 1)] || matches[0];
}

function _normalizeValidationGroupName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function _findTaskForValidationMessage(message, draft) {
  const tasks = Array.isArray(draft?.tasks) ? draft.tasks : [];
  const taskName = String(message || '').match(/Task "([^"]+)"/)?.[1];
  if (taskName) {
    return tasks.find(task => task?.name === taskName) || tasks[0] || null;
  }
  return tasks[0] || null;
}

function _domIdFromPath(path) {
  return String(path || 'field').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function _taskCopyName(name, localizeFn) {
  const sourceName = String(name || '').trim() || 'Gather';
  return localizeFn?.('FABRICATE.Admin.Environments.TaskCopySuffix', { name: sourceName })
    || `${sourceName} Copy`;
}

function _normalizePositiveQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.floor(numeric));
}

function _normalizeNullablePositiveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(1, Math.floor(numeric));
}

function _normalizeTimeUnitValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value ?? '').trim();
}

/**
 * Normalize a selected task visibility gate for the admin draft.
 *
 * Provider switches intentionally keep only the fields needed by the selected
 * provider: macro gates store `macroUuid`, while dnd5e/pf2e gates store
 * `formula` and `threshold`.
 */
function _normalizeEnvironmentTaskVisibility(currentVisibility = null, updates = {}) {
  const currentProvider = TASK_VISIBILITY_PROVIDERS.has(currentVisibility?.provider)
    ? currentVisibility.provider
    : 'macro';
  const provider = TASK_VISIBILITY_PROVIDERS.has(updates?.provider) ? updates.provider : currentProvider;

  if (provider === 'macro') {
    const macroUuid = Object.prototype.hasOwnProperty.call(updates, 'macroUuid')
      ? updates.macroUuid
      : currentVisibility?.macroUuid;
    return {
      provider,
      macroUuid: String(macroUuid ?? '').trim()
    };
  }

  const formula = Object.prototype.hasOwnProperty.call(updates, 'formula')
    ? updates.formula
    : currentVisibility?.formula;
  const threshold = Object.prototype.hasOwnProperty.call(updates, 'threshold')
    ? updates.threshold
    : currentVisibility?.threshold;

  return {
    provider,
    formula: String(formula ?? '').trim(),
    threshold: String(threshold ?? '').trim()
  };
}

function _normalizeEnvironmentTaskResultSelection(currentResultSelection = null, updates = {}) {
  const currentProvider = TASK_RESULT_SELECTION_PROVIDERS.has(currentResultSelection?.provider)
    ? currentResultSelection.provider
    : 'macroOutcome';
  const provider = TASK_RESULT_SELECTION_PROVIDERS.has(updates?.provider) ? updates.provider : currentProvider;

  if (provider === 'rollTableOutcome') {
    const rollTableUuid = Object.prototype.hasOwnProperty.call(updates, 'rollTableUuid')
      ? updates.rollTableUuid
      : currentResultSelection?.rollTableUuid;
    const normalized = String(rollTableUuid ?? '').trim();
    return normalized
      ? { provider, rollTableUuid: normalized }
      : { provider, rollTableUuid: '' };
  }

  const macroUuid = Object.prototype.hasOwnProperty.call(updates, 'macroUuid')
    ? updates.macroUuid
    : currentResultSelection?.macroUuid;
  const normalized = String(macroUuid ?? '').trim();
  return normalized
    ? { provider: 'macroOutcome', macroUuid: normalized }
    : { provider: 'macroOutcome', macroUuid: '' };
}

function _normalizeEnvironmentTaskProgressive(currentProgressive = null, updates = {}) {
  const awardMode = TASK_PROGRESSIVE_AWARD_MODES.has(updates?.awardMode)
    ? updates.awardMode
    : (TASK_PROGRESSIVE_AWARD_MODES.has(currentProgressive?.awardMode) ? currentProgressive.awardMode : 'equal');
  return { awardMode };
}

function _normalizeEnvironmentTaskCheck(currentCheck = null, updates = {}) {
  const currentProvider = TASK_CHECK_PROVIDERS.has(currentCheck?.provider) ? currentCheck.provider : 'macro';
  const provider = TASK_CHECK_PROVIDERS.has(updates?.provider) ? updates.provider : currentProvider;

  if (provider === 'macro') {
    const macroUuid = Object.prototype.hasOwnProperty.call(updates, 'macroUuid')
      ? updates.macroUuid
      : currentCheck?.macroUuid;
    return {
      provider,
      macroUuid: String(macroUuid ?? '').trim()
    };
  }

  const formula = Object.prototype.hasOwnProperty.call(updates, 'formula')
    ? updates.formula
    : currentCheck?.formula;
  const threshold = Object.prototype.hasOwnProperty.call(updates, 'threshold')
    ? updates.threshold
    : currentCheck?.threshold;
  const normalized = {
    provider,
    formula: String(formula ?? '').trim()
  };
  const normalizedThreshold = String(threshold ?? '').trim();
  if (normalizedThreshold) {
    normalized.threshold = normalizedThreshold;
  }
  return normalized;
}

function _normalizeEnvironmentTaskTimeRequirement(currentTimeRequirement = null, updates = {}) {
  const normalized = TASK_TIME_UNITS.reduce((timeRequirement, unit) => {
    const sourceValue = Object.prototype.hasOwnProperty.call(updates, unit)
      ? updates[unit]
      : currentTimeRequirement?.[unit];
    timeRequirement[unit] = _normalizeTimeUnitValue(sourceValue);
    return timeRequirement;
  }, {});
  return normalized;
}

function _normalizeEnvironmentTaskFailureOutcome(currentFailureOutcome = null, updates = {}) {
  const currentMode = TASK_FAILURE_OUTCOME_MODES.has(currentFailureOutcome?.mode)
    ? currentFailureOutcome.mode
    : 'text';
  const mode = TASK_FAILURE_OUTCOME_MODES.has(updates?.mode) ? updates.mode : currentMode;

  if (mode === 'macro') {
    const macroUuid = Object.prototype.hasOwnProperty.call(updates, 'macroUuid')
      ? updates.macroUuid
      : currentFailureOutcome?.macroUuid;
    return {
      mode,
      macroUuid: String(macroUuid ?? '').trim()
    };
  }

  const text = Object.prototype.hasOwnProperty.call(updates, 'text')
    ? updates.text
    : currentFailureOutcome?.text;
  return {
    mode: 'text',
    text: String(text ?? '').trim()
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
    const display = _buildRecipeBrowserDisplay(recipe);
    return {
      id: recipe.id,
      name: recipe.name,
      img: recipe.img,
      description: display.description,
      category: normalizeRecipeCategory(recipe.category),
      visibilitySummary: _visibilitySummary(recipe),
      locked: recipe.locked === true,
      enabled: recipe.enabled !== false,
      isSimple: display.isSimple,
      stepCount: display.stepCount,
      resultGroupCount: display.resultGroupCount,
      ingredientCount: display.ingredientCount,
      catalystCount: display.catalystCount,
      structureKey: display.structureKey,
      structureLabel: display.structureLabel,
      requirementsPreview: display.requirementsPreview,
      ingredients: new Array(display.ingredientCount),
      catalysts: new Array(display.catalystCount)
    };
  });

  return { recipes: prepared, recipeCategories, showVisibilitySummary };
}

/**
 * Build the item cards list for the items tab.
 * Mirrors _prepareContext item logic from RecipeManagerApp.
 */
function _sourceUuidForItemCard(item) {
  return item?.sourceItemUuid || item?.sourceUuid || '';
}

function _sourceOriginForUuid(uuid, sourceMissing = false) {
  if (sourceMissing) {
    return {
      sourceOrigin: 'missing',
      sourceOriginLabel: 'Missing'
    };
  }
  if (!uuid) {
    return {
      sourceOrigin: 'unknown',
      sourceOriginLabel: 'Unknown'
    };
  }
  if (uuid.startsWith('Compendium.')) {
    return {
      sourceOrigin: 'compendium',
      sourceOriginLabel: 'Compendium'
    };
  }
  if (uuid.startsWith('Item.')) {
    return {
      sourceOrigin: 'world',
      sourceOriginLabel: 'Items Directory'
    };
  }
  return {
    sourceOrigin: 'unknown',
    sourceOriginLabel: 'Unknown'
  };
}

async function _sourceMissingForUuid(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== 'function') return false;
  try {
    return !(await globalThis.fromUuid(uuid));
  } catch (_) {
    return true;
  }
}

async function _buildItemCards(systemManager, selectedSystem, itemSearchTerm, showTags, showEssences, essenceDefinitionById) {
  if (!selectedSystem) return [];
  const showSalvage = selectedSystem.features?.salvage === true;
  const items = systemManager.getItems(selectedSystem.id, itemSearchTerm);
  return Promise.all(items.map(async item => {
    const description = _plainTextDescription(item.description);
    const sourceUuidDisplay = _sourceUuidForItemCard(item);
    const sourceMissing = await _sourceMissingForUuid(sourceUuidDisplay);
    const sourceOrigin = _sourceOriginForUuid(sourceUuidDisplay, sourceMissing);
    return {
      ...item,
      img: item.img || 'icons/svg/item-bag.svg',
      description,
      hasDescription: description.length > 0,
      tags: showTags ? (item.tags || []) : [],
      essences: showEssences
        ? Object.entries(item.essences || {}).map(([id, quantity]) => ({
          id,
          name: essenceDefinitionById.get(id)?.name || id,
          icon: essenceDefinitionById.get(id)?.icon || 'fas fa-mortar-pestle',
          quantity
        }))
        : [],
      sourceUuidDisplay,
      hasSourceUuid: Boolean(sourceUuidDisplay),
      sourceMissing,
      ...sourceOrigin,
      salvageSummary: _buildSalvageSummary(item, showSalvage),
      showTags,
      showEssences
    };
  }));
}

function _sourceComponentIdForEssence(def, managedItemById) {
  const explicitComponentId = def?.sourceComponentId || def?.associatedSystemItemId || '';
  if (explicitComponentId) return explicitComponentId;
  return managedItemById.has(def?.sourceItemUuid) ? def.sourceItemUuid : '';
}

function _essenceUsageCount(essenceId, managedItems) {
  return managedItems.reduce((count, item) => {
    return count + (_itemUsesEssence(item, essenceId) ? 1 : 0);
  }, 0);
}

function _itemUsesEssence(item, essenceId) {
  const essences = item?.essences;
  if (Array.isArray(essences)) {
    return essences.some(entry => entry?.id === essenceId && Number(entry.quantity) > 0);
  }
  return Number(essences?.[essenceId]) > 0;
}

function _essenceUsageItems(essenceId, managedItems) {
  return managedItems
    .filter(item => _itemUsesEssence(item, essenceId))
    .map(item => ({
      id: item.id,
      name: item.name || item.id,
      img: item.img || 'icons/svg/item-bag.svg'
    }));
}

function _essenceSourceState({ sourceComponentId, sourceItemUuid, associatedItem }) {
  if (!sourceComponentId && !sourceItemUuid) return 'none';
  if (!associatedItem) return 'stale';
  if (associatedItem.sourceItemUuid || associatedItem.sourceUuid || sourceItemUuid) return 'linked';
  return 'missing';
}

function _sourceFieldsForEssenceSelection(system, sourceComponentId, sourceItemUuid = null) {
  const managedItemOptions = _buildManagedItemOptions(_getManagedItems(system));
  const managedItemById = new Map(managedItemOptions.map(item => [item.id, item]));
  if (sourceComponentId) {
    const associatedItem = managedItemById.get(sourceComponentId) || null;
    return {
      sourceComponentId,
      sourceItemUuid: associatedItem?.sourceItemUuid || associatedItem?.sourceUuid || null,
      associatedSystemItemId: sourceComponentId
    };
  }
  if (sourceItemUuid) {
    const associatedItem = managedItemOptions.find(item =>
      item.sourceItemUuid === sourceItemUuid || item.sourceUuid === sourceItemUuid
    );
    return {
      sourceComponentId: associatedItem?.id || null,
      sourceItemUuid,
      associatedSystemItemId: associatedItem?.id || null
    };
  }
  return {
    sourceComponentId: null,
    sourceItemUuid: null,
    associatedSystemItemId: null
  };
}

function _buildEssenceCards(essenceDefinitions, managedItems, managedItemOptions) {
  const managedItemById = new Map(managedItemOptions.map(item => [item.id, item]));
  return essenceDefinitions.map(def => {
    const sourceComponentId = _sourceComponentIdForEssence(def, managedItemById);
    const associatedItem = managedItemById.get(sourceComponentId) || null;
    const sourceItemUuid = def.sourceItemUuid || associatedItem?.sourceItemUuid || associatedItem?.sourceUuid || null;
    const componentUsageCount = _essenceUsageCount(def.id, managedItems);
    const componentUsageItems = _essenceUsageItems(def.id, managedItems);
    const sourceState = _essenceSourceState({ sourceComponentId, sourceItemUuid, associatedItem });
    return {
      ...def,
      icon: normalizeEssenceIcon(def.icon || DEFAULT_ESSENCE_ICON),
      sourceComponentId,
      sourceItemUuid,
      associatedSystemItemId: sourceComponentId || null,
      associatedItem,
      associatedItemName: associatedItem?.name || null,
      sourceName: associatedItem?.name || (sourceState === 'stale' ? (sourceComponentId || sourceItemUuid) : ''),
      sourceState,
      componentUsageCount,
      componentUsageItems,
      deleteBlocked: componentUsageCount > 0
    };
  });
}

function _plainTextDescription(value) {
  const raw = _descriptionTextCandidate(value);
  if (!raw) return '';

  if (globalThis.document?.createElement) {
    const template = globalThis.document.createElement('template');
    template.innerHTML = raw;
    return String(template.content?.textContent || '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();
  }

  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, '\'')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function _descriptionTextCandidate(value, seen = new Set()) {
  if (value == null) return '';

  const valueType = typeof value;
  if (valueType === 'string') return value.trim();
  if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value
      .map(entry => _descriptionTextCandidate(entry, seen))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (valueType !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);

  for (const key of ['value', 'enriched', 'html', 'text', 'content', 'short', 'long', 'unidentified', 'chat']) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const candidate = _descriptionTextCandidate(value[key], seen);
    if (candidate) return candidate;
  }

  return '';
}

/**
 * Build the full selectedSystem view data object.
 * Mirrors RecipeManagerApp._prepareContext() selectedSystem section.
 */
function _buildSelectedSystemViewData(
  selectedSystem,
  managedItemOptions,
  essenceDefinitions,
  availableScriptMacros,
  sceneOptions,
  rollTableOptions
) {
  if (!selectedSystem) return null;

  const advancedEnabled = selectedSystem.advancedOptionsEnabled !== false;
  const showTags = true;
  const showEssences = advancedEnabled && selectedSystem.features?.essences === true;

  const listMode = selectedSystem.recipeVisibility?.listMode || 'global';
  const showRecipeVisibilityKnowledgeOptions = listMode === 'knowledge';
  const showRecipeVisibilityPlayerNote = listMode === 'player';

  return {
    id: selectedSystem.id,
    name: selectedSystem.name,
    description: selectedSystem.description,
    enabled: selectedSystem.enabled !== false,
    resolutionMode: selectedSystem.resolutionMode || 'simple',
    advancedOptionsEnabled: advancedEnabled,

    features: {
      recipeCategories: true,
      itemTags: true,
      essences: selectedSystem.features?.essences === true,
      complexRecipes: selectedSystem.features?.complexRecipes === true,
      multiStepRecipes: selectedSystem.features?.multiStepRecipes === true,
      propertyMacros: selectedSystem.features?.propertyMacros === true,
      craftingChecks: selectedSystem.features?.craftingChecks === true,
      outcomeRouting: selectedSystem.features?.outcomeRouting === true,
      effectTransfer: selectedSystem.features?.effectTransfer === true,
      gathering: selectedSystem.features?.gathering === true
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
    availableScriptMacros,
    sceneOptions,
    rollTableOptions
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a new adminStore.
 *
 * @param {object} services - Injected service accessors (never game.* directly).
 * @param {Function} [services.getGatheringEnvironmentStore] - Returns the gathering environment store used by the Environments tab draft editor.
 * @returns {object} Store API — writable stores, derived admin view state, and action functions.
 */
export function createAdminStore(services) {
  // --- Input writables ---
  const selectedSystemId = writable(services.getSetting('lastManagedCraftingSystem') || '');
  const activeTab = writable('systems');
  const recipeSearch = writable('');
  const itemSearch = writable('');
  const graphSearch = writable('');
  const selectedEnvironmentId = writable('');
  const selectedEnvironmentSystemId = writable('');
  const selectedEnvironmentTaskId = writable('');
  const environmentDraft = writable(null);
  const persistedEnvironmentDraft = writable(null);
  const environmentDraftDirty = writable(false);
  const environmentDraftIsNew = writable(false);
  const environmentSaving = writable(false);
  const environmentSaveError = writable(null);
  const environmentValidationState = writable(null);
  let environmentValidationAttempt = 0;
  let dirtyEnvironmentDiscardConfirmation = null;

  // --- Computed state ---
  const viewState = writable({
    systems: [],
    hasSystem: false,
    selectedSystemName: '',
    selectedSystem: null,
    itemCards: [],
    essenceCards: [],
    recipes: [],
    recipeCategories: [],
    showVisibilitySummary: false,
    recipeSearchTerm: '',
    itemSearchTerm: '',
    graphData: { nodes: [], edges: [], width: 0, height: 0 },
    graphSearchTerm: '',
    ..._emptyEnvironmentState(false)
  });

  function _setEnvironmentDraftState(draft, {
    persistedDraft = draft,
    dirty = false,
    isNew = false,
    saveError = null,
    selectedTaskId = null
  } = {}) {
    const draftClone = _clonePlain(draft);
    environmentDraft.set(draftClone);
    persistedEnvironmentDraft.set(_clonePlain(persistedDraft));
    selectedEnvironmentTaskId.set(_resolveEnvironmentTaskSelection(
      draftClone,
      selectedTaskId ?? get(selectedEnvironmentTaskId)
    ));
    environmentDraftDirty.set(dirty);
    environmentDraftIsNew.set(isNew);
    environmentSaveError.set(saveError);
    environmentValidationState.set(null);
  }

  function _clearEnvironmentDraftState({ canShowEnvironmentsTab = false, error = null } = {}) {
    selectedEnvironmentId.set('');
    _setEnvironmentDraftState(null, {
      persistedDraft: null,
      dirty: false,
      isNew: false,
      saveError: null
    });
    return _emptyEnvironmentState(canShowEnvironmentsTab, error);
  }

  function _currentEnvironmentViewPatch() {
    return {
      selectedEnvironmentId: get(selectedEnvironmentId),
      selectedEnvironmentTaskId: get(selectedEnvironmentTaskId),
      environmentDraft: _clonePlain(get(environmentDraft)),
      environmentDraftDirty: get(environmentDraftDirty),
      environmentDraftIsNew: get(environmentDraftIsNew),
      environmentSaving: get(environmentSaving),
      environmentSaveError: get(environmentSaveError),
      environmentValidationState: _clonePlain(get(environmentValidationState))
    };
  }

  function _patchEnvironmentViewState() {
    viewState.update(state => ({
      ...state,
      ..._currentEnvironmentViewPatch()
    }));
  }

  function _getEnvironmentStore() {
    return services.getGatheringEnvironmentStore?.() || null;
  }

  function _randomID() {
    if (typeof services.randomID === 'function') return services.randomID();
    if (typeof globalThis.foundry?.utils?.randomID === 'function') return globalThis.foundry.utils.randomID();
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return Math.random().toString(36).slice(2, 14);
  }

  function _resolveEnvironmentTaskSelection(draft, preferredTaskId = '') {
    const tasks = Array.isArray(draft?.tasks) ? draft.tasks : [];
    if (preferredTaskId && tasks.some(task => task.id === preferredTaskId)) {
      return preferredTaskId;
    }
    return tasks[0]?.id || '';
  }

  function _newEnvironmentPlaceholderTask() {
    return {
      id: _randomID(),
      name: services.localize?.('FABRICATE.Admin.Environments.NewTaskName') || 'Configure gathering task',
      description: '',
      img: DEFAULT_GATHERING_TASK_IMG,
      enabled: false,
      resolutionMode: 'routed',
      catalysts: [],
      resultSelection: {
        provider: 'macroOutcome',
        macroUuid: ''
      },
      resultGroups: [
        {
          id: _randomID(),
          name: services.localize?.('FABRICATE.Admin.Environments.NewResultGroupName') || 'Results',
          results: []
        }
      ]
    };
  }

  function _selectedManagedItemOptions() {
    const systemManager = services.getCraftingSystemManager();
    const selectedSystem = systemManager?.getSystem?.(get(selectedSystemId)) || null;
    return _buildManagedItemOptions(_getManagedItems(selectedSystem));
  }

  function _newEnvironmentResultGroup(existingGroups = []) {
    const baseName = services.localize?.('FABRICATE.Admin.Environments.NewResultGroupName') || 'Results';
    const existingNames = new Set((Array.isArray(existingGroups) ? existingGroups : [])
      .map(group => String(group?.name || '').trim().toLowerCase())
      .filter(Boolean));
    let name = baseName;
    let suffix = 2;
    while (existingNames.has(name.trim().toLowerCase())) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }
    return {
      id: _randomID(),
      name,
      results: []
    };
  }

  function _newEnvironmentResult() {
    const firstComponent = _selectedManagedItemOptions()[0];
    return {
      id: _randomID(),
      componentId: firstComponent?.id || null,
      quantity: 1,
      propertyMacroUuid: null
    };
  }

  function _newEnvironmentCatalyst() {
    const firstComponent = _selectedManagedItemOptions()[0];
    return {
      componentId: firstComponent?.id || null,
      degradesOnUse: false,
      destroyWhenExhausted: false,
      maxUses: null
    };
  }

  function _newEnvironmentDraft(systemId) {
    return {
      craftingSystemId: systemId,
      name: services.localize?.('FABRICATE.Admin.Environments.NewEnvironmentName') || 'New Gathering Environment',
      description: '',
      enabled: false,
      selectionMode: 'targeted',
      sceneUuid: null,
      tasks: [_newEnvironmentPlaceholderTask()]
    };
  }

  function _hasDirtyEnvironmentDraft() {
    return get(environmentDraftDirty) === true && !!get(environmentDraft);
  }

  async function confirmDiscardDirtyEnvironmentDraft() {
    if (!_hasDirtyEnvironmentDraft()) return true;
    if (dirtyEnvironmentDiscardConfirmation) return dirtyEnvironmentDiscardConfirmation;

    const localizeFn = services.localize;
    dirtyEnvironmentDiscardConfirmation = (async () => {
      try {
        const confirmed = await services.confirmDialog?.({
          title: localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyTitle')
            || 'Discard unsaved environment changes?',
          content: `<p>${
            localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyContent')
              || 'The current gathering environment has unsaved changes. Discard them and continue?'
          }</p>`,
          yes: {
            label: localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyConfirm') || 'Discard Changes',
            callback: () => true
          },
          no: {
            label: localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyCancel') || 'Keep Editing',
            callback: () => false
          }
        });
        return confirmed === true;
      } finally {
        dirtyEnvironmentDiscardConfirmation = null;
      }
    })();

    return dirtyEnvironmentDiscardConfirmation;
  }

  async function _discardDirtyEnvironmentDraftForNavigation() {
    if (!_hasDirtyEnvironmentDraft()) return true;
    const confirmed = await confirmDiscardDirtyEnvironmentDraft();
    if (!confirmed) return false;
    await cancelEnvironmentDraft();
    return true;
  }

  async function _buildEnvironmentState(selectedSystem) {
    if (!_canShowEnvironmentsTab(selectedSystem)) {
      selectedEnvironmentId.set('');
      selectedEnvironmentSystemId.set(selectedSystem?.id || '');
      return _clearEnvironmentDraftState();
    }

    if (get(selectedEnvironmentSystemId) !== selectedSystem.id) {
      selectedEnvironmentId.set('');
      selectedEnvironmentSystemId.set(selectedSystem.id);
      _setEnvironmentDraftState(null, { persistedDraft: null });
    }

    const environmentStore = _getEnvironmentStore();
    if (!environmentStore?.listBySystem) {
      return _clearEnvironmentDraftState({
        canShowEnvironmentsTab: true,
        error:
        services.localize?.('FABRICATE.Admin.Environments.StoreUnavailable')
          || 'Gathering environment store is not available.'
      });
    }

    try {
      const rawEnvironments = await environmentStore.listBySystem(selectedSystem.id);
      const environments = _clonePlain(Array.isArray(rawEnvironments) ? rawEnvironments : []);
      let environmentId = get(selectedEnvironmentId);
      const canKeepNewDraft = get(environmentDraftIsNew)
        && get(environmentDraftDirty)
        && get(environmentDraft)?.craftingSystemId === selectedSystem.id;

      if (canKeepNewDraft) {
        environmentId = '';
      } else if (!environments.some(environment => environment.id === environmentId)) {
        environmentId = environments[0]?.id || '';
        selectedEnvironmentId.set(environmentId);
      }

      if (!canKeepNewDraft) {
        const persistedDraft = environmentId
          ? _clonePlain(environments.find(environment => environment.id === environmentId) || null)
          : null;
        const canPreserveDirtyDraft = get(environmentDraftDirty)
          && get(environmentDraft)?.id === environmentId
          && get(environmentDraft)?.craftingSystemId === selectedSystem.id;

        if (!canPreserveDirtyDraft) {
          _setEnvironmentDraftState(persistedDraft, {
            persistedDraft,
            dirty: false,
            isNew: false,
            saveError: null
          });
        } else {
          persistedEnvironmentDraft.set(_clonePlain(persistedDraft));
        }
      }

      return {
        canShowEnvironmentsTab: true,
        environmentsLoading: false,
        environmentsError: null,
        environments,
        ..._currentEnvironmentViewPatch()
      };
    } catch (err) {
      return _clearEnvironmentDraftState({
        canShowEnvironmentsTab: true,
        error: _environmentErrorMessage(err)
      });
    }
  }

  // --- refresh ---
  async function refresh() {
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    if (!systemManager || !recipeManager) return;

    const allSystems = systemManager.getSystems();
    const currentSystemId = get(selectedSystemId);
    const fallbackSystemId = allSystems[0]?.id || '';
    let resolvedSystemId = currentSystemId;
    if (!currentSystemId || !allSystems.find(s => s.id === currentSystemId)) {
      resolvedSystemId = fallbackSystemId;
      if (resolvedSystemId !== currentSystemId) selectedSystemId.set(resolvedSystemId);
    }

    // Build system list after resolving selection so the library row highlight matches view state.
    const systemList = allSystems.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      enabled: s.enabled !== false,
      resolutionMode: s.resolutionMode || 'simple',
      featureCount: Object.values(s.features || {}).filter(value => value === true).length,
      componentCount: _getManagedItems(s).length,
      recipeCount: recipeManager.getRecipes({ craftingSystemId: s.id }).length,
      selected: s.id === resolvedSystemId
    }));

    const selectedSystem = resolvedSystemId
      ? allSystems.find(s => s.id === resolvedSystemId) || null
      : null;

    const availableScriptMacros = services.getScriptMacros?.() || [];
    const sceneOptions = services.getSceneOptions?.() || [];
    const rollTableOptions = services.getRollTableOptions?.() || [];

    let selectedSystemData = null;
    let essenceCards = [];
    let recipeListData = { recipes: [], recipeCategories: [], showVisibilitySummary: false };

    if (selectedSystem) {
      const managedItems = _getManagedItems(selectedSystem);
      const managedItemOptions = _buildManagedItemOptions(managedItems);
      const managedItemById = new Map(managedItemOptions.map(item => [item.id, item]));

      const rawEssenceDefinitions = Array.isArray(selectedSystem.essenceDefinitions)
        ? selectedSystem.essenceDefinitions
        : [];
      const essenceDefinitions = rawEssenceDefinitions.map(def => {
        const sourceComponentId = _sourceComponentIdForEssence(def, managedItemById);
        const associatedItem = managedItemById.get(sourceComponentId) || null;
        return {
          ...def,
          sourceComponentId,
          associatedSystemItemId: sourceComponentId || null,
          associatedItem,
          associatedItemName: associatedItem?.name || null
        };
      });
      essenceCards = _buildEssenceCards(essenceDefinitions, managedItems, managedItemOptions);

      selectedSystemData = _buildSelectedSystemViewData(
        selectedSystem,
        managedItemOptions,
        essenceDefinitions,
        availableScriptMacros,
        sceneOptions,
        rollTableOptions
      );

      recipeListData = _buildRecipeList(
        systemManager,
        recipeManager,
        selectedSystem,
        get(recipeSearch)
      );
    }

    const visibleTab = _resolveVisibleTab(get(activeTab), selectedSystem);
    if (visibleTab !== get(activeTab)) {
      activeTab.set(visibleTab);
    }

    // Phase 1: publish all synchronous selected-system context immediately so
    // manager v2 can paint its selected rail, menu, and inspector before slower
    // item/environment work finishes.
    viewState.update(prev => ({
      ...prev,
      systems: systemList,
      hasSystem: !!selectedSystem,
      selectedSystemName: selectedSystem?.name || '',
      selectedSystem: selectedSystemData,
      essenceCards,
      recipes: recipeListData.recipes,
      recipeCategories: recipeListData.recipeCategories,
      showVisibilitySummary: recipeListData.showVisibilitySummary,
      recipeSearchTerm: get(recipeSearch),
      itemSearchTerm: get(itemSearch)
    }));
    await Promise.resolve();

    let itemCards = [];
    if (selectedSystem) {
      const advancedEnabled = selectedSystem.advancedOptionsEnabled !== false;
      const showTags = true;
      const showEssences = advancedEnabled && selectedSystem.features?.essences === true;
      const essenceDefinitionById = new Map((selectedSystemData?.essenceDefinitions || []).map(def => [def.id, def]));

      itemCards = await _buildItemCards(
        systemManager,
        selectedSystem,
        get(itemSearch),
        showTags,
        showEssences,
        essenceDefinitionById
      );
    }

    const environmentState = await _buildEnvironmentState(selectedSystem);

    // --- Graph data (lazy, computed only when graph tab is active) ---
    let graphData = { nodes: [], edges: [], width: 0, height: 0 };
    if (get(activeTab) === 'graph' && selectedSystem) {
      const allRecipes = recipeManager.getRecipes({ craftingSystemId: selectedSystem.id });
      const components = _getManagedItems(selectedSystem);
      const rawGraph = buildRecipeGraph(allRecipes, components);
      const layoutResult = layoutGraph(rawGraph);
      graphData = filterGraph(layoutResult, { searchTerm: get(graphSearch) });
    }

    viewState.update(prev => ({
      ...prev,
      systems: systemList,
      hasSystem: !!selectedSystem,
      selectedSystemName: selectedSystem?.name || '',
      selectedSystem: selectedSystemData,
      itemCards,
      essenceCards,
      recipes: recipeListData.recipes,
      recipeCategories: recipeListData.recipeCategories,
      showVisibilitySummary: recipeListData.showVisibilitySummary,
      recipeSearchTerm: get(recipeSearch),
      itemSearchTerm: get(itemSearch),
      graphData,
      graphSearchTerm: get(graphSearch),
      ...environmentState
    }));
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  // --- System selection ---

  async function selectSystem(systemId) {
    if (systemId === get(selectedSystemId)) {
      await refresh();
      return true;
    }
    if (!await confirmDiscardDirtyEnvironmentDraft()) return false;

    selectedSystemId.set(systemId);
    selectedEnvironmentId.set('');
    selectedEnvironmentSystemId.set(systemId || '');
    _setEnvironmentDraftState(null, { persistedDraft: null });
    await services.setSetting('lastManagedCraftingSystem', systemId);
    await refresh();
    return true;
  }

  async function createSystem() {
    if (!await confirmDiscardDirtyEnvironmentDraft()) return null;

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
    selectedEnvironmentId.set('');
    selectedEnvironmentSystemId.set(nextId);
    _setEnvironmentDraftState(null, { persistedDraft: null });
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
    const systemManager = services.getCraftingSystemManager();
    const selectedSystem = systemManager?.getSystem?.(get(selectedSystemId)) || null;
    const nextTab = _resolveVisibleTab(tabName, selectedSystem);
    if (nextTab === get(activeTab)) return true;
    if (get(activeTab) === ENVIRONMENTS_TAB && nextTab !== ENVIRONMENTS_TAB) {
      if (!await _discardDirtyEnvironmentDraftForNavigation()) return false;
    }
    activeTab.set(nextTab);
    await refresh();
    return true;
  }

  async function selectEnvironment(environmentId) {
    const nextEnvironmentId = environmentId || '';
    if (nextEnvironmentId === get(selectedEnvironmentId)) return true;
    if (!await confirmDiscardDirtyEnvironmentDraft()) return false;

    selectedEnvironmentId.set(nextEnvironmentId);
    environmentDraftDirty.set(false);
    environmentDraftIsNew.set(false);
    environmentSaveError.set(null);
    environmentValidationState.set(null);
    await refresh();
    return true;
  }

  async function createEnvironmentDraft() {
    const systemManager = services.getCraftingSystemManager();
    const system = systemManager?.getSystem?.(get(selectedSystemId)) || null;
    if (!_canShowEnvironmentsTab(system)) return null;
    if (!await confirmDiscardDirtyEnvironmentDraft()) return null;

    selectedEnvironmentId.set('');
    _setEnvironmentDraftState(_newEnvironmentDraft(system.id), {
      persistedDraft: null,
      dirty: true,
      isNew: true,
      saveError: null
    });
    _patchEnvironmentViewState();
    return _clonePlain(get(environmentDraft));
  }

  function updateEnvironmentDraft(updates = {}) {
    const current = get(environmentDraft);
    if (!current || typeof updates !== 'object' || updates === null) return false;

    const allowed = new Set(['name', 'description', 'enabled', 'selectionMode', 'sceneUuid', 'tasks']);
    const next = _clonePlain(current);
    for (const [field, value] of Object.entries(updates)) {
      if (!allowed.has(field)) continue;
      if (field === 'enabled') {
        next.enabled = value === true;
      } else if (field === 'sceneUuid') {
        const normalized = String(value ?? '').trim();
        next.sceneUuid = normalized || null;
      } else if (field === 'tasks') {
        next.tasks = Array.isArray(value) ? _clonePlain(value) : [];
        selectedEnvironmentTaskId.set(_resolveEnvironmentTaskSelection(next, get(selectedEnvironmentTaskId)));
      } else {
        next[field] = String(value ?? '');
      }
    }

    environmentDraft.set(next);
    environmentDraftDirty.set(true);
    environmentSaveError.set(null);
    environmentValidationState.set(null);
    _patchEnvironmentViewState();
    return true;
  }

  function _setEnvironmentTasks(nextTasks, selectedTaskId = get(selectedEnvironmentTaskId)) {
    const current = get(environmentDraft);
    if (!current) return false;

    const next = {
      ..._clonePlain(current),
      tasks: Array.isArray(nextTasks) ? _clonePlain(nextTasks) : []
    };
    environmentDraft.set(next);
    selectedEnvironmentTaskId.set(_resolveEnvironmentTaskSelection(next, selectedTaskId));
    environmentDraftDirty.set(true);
    environmentSaveError.set(null);
    environmentValidationState.set(null);
    _patchEnvironmentViewState();
    return true;
  }

  function selectEnvironmentTask(taskId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const nextTaskId = _resolveEnvironmentTaskSelection(current, taskId);
    if (!nextTaskId) return false;
    selectedEnvironmentTaskId.set(nextTaskId);
    _patchEnvironmentViewState();
    return true;
  }

  function addEnvironmentTask() {
    const current = get(environmentDraft);
    if (!current) return null;
    const tasks = Array.isArray(current.tasks) ? _clonePlain(current.tasks) : [];
    const task = _newEnvironmentPlaceholderTask();
    _setEnvironmentTasks([...tasks, task], task.id);
    return _clonePlain(task);
  }

  function updateEnvironmentTask(taskId = get(selectedEnvironmentTaskId), updates = {}) {
    const current = get(environmentDraft);
    if (!current || !taskId || typeof updates !== 'object' || updates === null) return false;

    const tasks = Array.isArray(current.tasks) ? _clonePlain(current.tasks) : [];
    const index = tasks.findIndex(task => task.id === taskId);
    if (index < 0) return false;

    const nextTask = { ...tasks[index] };
    for (const [field, value] of Object.entries(updates)) {
      if (field === 'name' || field === 'description') {
        nextTask[field] = String(value ?? '');
      } else if (field === 'img') {
        const normalized = String(value ?? '').trim();
        nextTask.img = normalized || DEFAULT_GATHERING_TASK_IMG;
      } else if (field === 'enabled') {
        nextTask.enabled = value === true;
      } else if (field === 'resolutionMode' && TASK_RESOLUTION_MODES.has(value)) {
        nextTask.resolutionMode = value;
      }
    }

    tasks[index] = nextTask;
    return _setEnvironmentTasks(tasks, taskId);
  }

  function _updateEnvironmentTaskDraft(taskId = get(selectedEnvironmentTaskId), updater) {
    const current = get(environmentDraft);
    if (!current || !taskId || typeof updater !== 'function') return null;

    const tasks = Array.isArray(current.tasks) ? _clonePlain(current.tasks) : [];
    const index = tasks.findIndex(task => task.id === taskId);
    if (index < 0) return null;

    const nextTask = updater(_clonePlain(tasks[index]));
    if (!nextTask) return null;

    tasks[index] = nextTask;
    _setEnvironmentTasks(tasks, taskId);
    return _clonePlain(nextTask);
  }

  function addEnvironmentTaskResultGroup(taskId = get(selectedEnvironmentTaskId)) {
    let added = null;
    _updateEnvironmentTaskDraft(taskId, task => {
      const resultGroups = Array.isArray(task.resultGroups) ? task.resultGroups : [];
      added = _newEnvironmentResultGroup(resultGroups);
      return {
        ...task,
        resultGroups: [...resultGroups, added]
      };
    });
    return _clonePlain(added);
  }

  function updateEnvironmentTaskResultGroup(taskId = get(selectedEnvironmentTaskId), groupId, updates = {}) {
    if (!groupId || typeof updates !== 'object' || updates === null) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      const resultGroups = Array.isArray(task.resultGroups) ? _clonePlain(task.resultGroups) : [];
      const index = resultGroups.findIndex(group => group.id === groupId);
      if (index < 0) return null;

      const nextGroup = { ...resultGroups[index] };
      if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
        nextGroup.name = String(updates.name ?? '');
      }
      resultGroups[index] = nextGroup;
      return { ...task, resultGroups };
    });
    return !!updated;
  }

  function deleteEnvironmentTaskResultGroup(taskId = get(selectedEnvironmentTaskId), groupId) {
    if (!groupId) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      const resultGroups = Array.isArray(task.resultGroups) ? _clonePlain(task.resultGroups) : [];
      if (!resultGroups.some(group => group.id === groupId)) return null;
      return {
        ...task,
        resultGroups: resultGroups.filter(group => group.id !== groupId)
      };
    });
    return !!updated;
  }

  function reorderEnvironmentTaskResultGroups(taskId = get(selectedEnvironmentTaskId), orderedGroupIds = []) {
    let reordered = [];
    _updateEnvironmentTaskDraft(taskId, task => {
      const resultGroups = Array.isArray(task.resultGroups) ? _clonePlain(task.resultGroups) : [];
      const byId = new Map(resultGroups.map(group => [group.id, group]));
      const emitted = new Set();
      reordered = [];

      for (const id of Array.isArray(orderedGroupIds) ? orderedGroupIds : []) {
        if (!byId.has(id) || emitted.has(id)) continue;
        reordered.push(byId.get(id));
        emitted.add(id);
      }

      for (const group of resultGroups) {
        if (emitted.has(group.id)) continue;
        reordered.push(group);
      }

      return { ...task, resultGroups: reordered };
    });
    return _clonePlain(reordered);
  }

  function moveEnvironmentTaskResultGroup(taskId = get(selectedEnvironmentTaskId), groupId, direction = 'down') {
    const current = get(environmentDraft);
    const task = (Array.isArray(current?.tasks) ? current.tasks : []).find(candidate => candidate.id === taskId);
    const resultGroups = Array.isArray(task?.resultGroups) ? task.resultGroups : [];
    const index = resultGroups.findIndex(group => group.id === groupId);
    if (index < 0) return _clonePlain(resultGroups);

    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= resultGroups.length) return _clonePlain(resultGroups);

    const ordered = resultGroups.map(group => group.id);
    const [moved] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moved);
    return reorderEnvironmentTaskResultGroups(taskId, ordered);
  }

  function addEnvironmentTaskResult(taskId = get(selectedEnvironmentTaskId), groupId) {
    if (!groupId) return null;

    let added = null;
    _updateEnvironmentTaskDraft(taskId, task => {
      const resultGroups = Array.isArray(task.resultGroups) ? _clonePlain(task.resultGroups) : [];
      const groupIndex = resultGroups.findIndex(group => group.id === groupId);
      if (groupIndex < 0) return null;

      added = _newEnvironmentResult();
      const group = resultGroups[groupIndex];
      resultGroups[groupIndex] = {
        ...group,
        results: [...(Array.isArray(group.results) ? group.results : []), added]
      };
      return { ...task, resultGroups };
    });
    return _clonePlain(added);
  }

  function updateEnvironmentTaskResult(taskId = get(selectedEnvironmentTaskId), groupId, resultId, updates = {}) {
    if (!groupId || !resultId || typeof updates !== 'object' || updates === null) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      const resultGroups = Array.isArray(task.resultGroups) ? _clonePlain(task.resultGroups) : [];
      const groupIndex = resultGroups.findIndex(group => group.id === groupId);
      if (groupIndex < 0) return null;

      const group = resultGroups[groupIndex];
      const results = Array.isArray(group.results) ? _clonePlain(group.results) : [];
      const resultIndex = results.findIndex(result => result.id === resultId);
      if (resultIndex < 0) return null;

      const nextResult = { ...results[resultIndex] };
      if (Object.prototype.hasOwnProperty.call(updates, 'componentId')) {
        const componentId = String(updates.componentId ?? '').trim();
        nextResult.componentId = componentId || null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'quantity')) {
        nextResult.quantity = _normalizePositiveQuantity(updates.quantity);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'propertyMacroUuid')) {
        const propertyMacroUuid = String(updates.propertyMacroUuid ?? '').trim();
        nextResult.propertyMacroUuid = propertyMacroUuid || null;
      } else if (!Object.prototype.hasOwnProperty.call(nextResult, 'propertyMacroUuid')) {
        nextResult.propertyMacroUuid = null;
      }

      results[resultIndex] = nextResult;
      resultGroups[groupIndex] = { ...group, results };
      return { ...task, resultGroups };
    });
    return !!updated;
  }

  function deleteEnvironmentTaskResult(taskId = get(selectedEnvironmentTaskId), groupId, resultId) {
    if (!groupId || !resultId) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      const resultGroups = Array.isArray(task.resultGroups) ? _clonePlain(task.resultGroups) : [];
      const groupIndex = resultGroups.findIndex(group => group.id === groupId);
      if (groupIndex < 0) return null;

      const group = resultGroups[groupIndex];
      const results = Array.isArray(group.results) ? _clonePlain(group.results) : [];
      if (!results.some(result => result.id === resultId)) return null;

      resultGroups[groupIndex] = {
        ...group,
        results: results.filter(result => result.id !== resultId)
      };
      return { ...task, resultGroups };
    });
    return !!updated;
  }

  function reorderEnvironmentTaskResults(taskId = get(selectedEnvironmentTaskId), groupId, orderedResultIds = []) {
    if (!groupId) return [];

    let reordered = [];
    _updateEnvironmentTaskDraft(taskId, task => {
      const resultGroups = Array.isArray(task.resultGroups) ? _clonePlain(task.resultGroups) : [];
      const groupIndex = resultGroups.findIndex(group => group.id === groupId);
      if (groupIndex < 0) return null;

      const group = resultGroups[groupIndex];
      const results = Array.isArray(group.results) ? _clonePlain(group.results) : [];
      const byId = new Map(results.map(result => [result.id, result]));
      const emitted = new Set();
      reordered = [];

      for (const id of Array.isArray(orderedResultIds) ? orderedResultIds : []) {
        if (!byId.has(id) || emitted.has(id)) continue;
        reordered.push(byId.get(id));
        emitted.add(id);
      }

      for (const result of results) {
        if (emitted.has(result.id)) continue;
        reordered.push(result);
      }

      resultGroups[groupIndex] = { ...group, results: reordered };
      return { ...task, resultGroups };
    });
    return _clonePlain(reordered);
  }

  function moveEnvironmentTaskResult(taskId = get(selectedEnvironmentTaskId), groupId, resultId, direction = 'down') {
    const current = get(environmentDraft);
    const task = (Array.isArray(current?.tasks) ? current.tasks : []).find(candidate => candidate.id === taskId);
    const group = (Array.isArray(task?.resultGroups) ? task.resultGroups : []).find(candidate => candidate.id === groupId);
    const results = Array.isArray(group?.results) ? group.results : [];
    const index = results.findIndex(result => result.id === resultId);
    if (index < 0) return _clonePlain(results);

    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= results.length) return _clonePlain(results);

    const ordered = results.map(result => result.id);
    const [moved] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moved);
    return reorderEnvironmentTaskResults(taskId, groupId, ordered);
  }

  function addEnvironmentTaskCatalyst(taskId = get(selectedEnvironmentTaskId)) {
    let added = null;
    _updateEnvironmentTaskDraft(taskId, task => {
      const catalysts = Array.isArray(task.catalysts) ? _clonePlain(task.catalysts) : [];
      added = _newEnvironmentCatalyst();
      return {
        ...task,
        catalysts: [...catalysts, added]
      };
    });
    return _clonePlain(added);
  }

  function updateEnvironmentTaskCatalyst(taskId = get(selectedEnvironmentTaskId), catalystIndex, updates = {}) {
    const index = Number(catalystIndex);
    if (!Number.isInteger(index) || index < 0 || typeof updates !== 'object' || updates === null) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      const catalysts = Array.isArray(task.catalysts) ? _clonePlain(task.catalysts) : [];
      if (index >= catalysts.length) return null;

      const nextCatalyst = {
        componentId: catalysts[index]?.componentId || null,
        degradesOnUse: catalysts[index]?.degradesOnUse === true,
        destroyWhenExhausted: catalysts[index]?.destroyWhenExhausted === true,
        maxUses: _normalizeNullablePositiveInteger(catalysts[index]?.maxUses)
      };

      if (Object.prototype.hasOwnProperty.call(updates, 'componentId')) {
        const componentId = String(updates.componentId ?? '').trim();
        nextCatalyst.componentId = componentId || null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'degradesOnUse')) {
        nextCatalyst.degradesOnUse = updates.degradesOnUse === true;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'destroyWhenExhausted')) {
        nextCatalyst.destroyWhenExhausted = updates.destroyWhenExhausted === true;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'maxUses')) {
        nextCatalyst.maxUses = _normalizeNullablePositiveInteger(updates.maxUses);
      }

      catalysts[index] = nextCatalyst;
      return { ...task, catalysts };
    });
    return !!updated;
  }

  function deleteEnvironmentTaskCatalyst(taskId = get(selectedEnvironmentTaskId), catalystIndex) {
    const index = Number(catalystIndex);
    if (!Number.isInteger(index) || index < 0) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      const catalysts = Array.isArray(task.catalysts) ? _clonePlain(task.catalysts) : [];
      if (index >= catalysts.length) return null;
      return {
        ...task,
        catalysts: catalysts.filter((_, candidateIndex) => candidateIndex !== index)
      };
    });
    return !!updated;
  }

  function updateEnvironmentTaskVisibility(taskId = get(selectedEnvironmentTaskId), updatesOrNull = {}) {
    if (!taskId) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      if (updatesOrNull === null) {
        const { visibility, ...rest } = task;
        return rest;
      }
      if (typeof updatesOrNull !== 'object') return null;
      return {
        ...task,
        visibility: _normalizeEnvironmentTaskVisibility(task.visibility, updatesOrNull)
      };
    });
    return !!updated;
  }

  function updateEnvironmentTaskResultSelection(taskId = get(selectedEnvironmentTaskId), updates = {}) {
    if (!taskId || typeof updates !== 'object' || updates === null) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => ({
      ...task,
      resultSelection: _normalizeEnvironmentTaskResultSelection(task.resultSelection, updates)
    }));
    return !!updated;
  }

  function updateEnvironmentTaskProgressive(taskId = get(selectedEnvironmentTaskId), updates = {}) {
    if (!taskId || typeof updates !== 'object' || updates === null) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => ({
      ...task,
      progressive: _normalizeEnvironmentTaskProgressive(task.progressive, updates)
    }));
    return !!updated;
  }

  function updateEnvironmentTaskCheck(taskId = get(selectedEnvironmentTaskId), updatesOrNull = {}) {
    if (!taskId) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      if (updatesOrNull === null) {
        const { check, ...rest } = task;
        return rest;
      }
      if (typeof updatesOrNull !== 'object') return null;
      return {
        ...task,
        check: _normalizeEnvironmentTaskCheck(task.check, updatesOrNull)
      };
    });
    return !!updated;
  }

  function updateEnvironmentTaskTimeRequirement(taskId = get(selectedEnvironmentTaskId), updatesOrNull = {}) {
    if (!taskId) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      if (updatesOrNull === null) {
        const { timeRequirement, ...rest } = task;
        return rest;
      }
      if (typeof updatesOrNull !== 'object') return null;
      return {
        ...task,
        timeRequirement: _normalizeEnvironmentTaskTimeRequirement(task.timeRequirement, updatesOrNull)
      };
    });
    return !!updated;
  }

  function updateEnvironmentTaskFailureOutcome(taskId = get(selectedEnvironmentTaskId), updatesOrNull = {}) {
    if (!taskId) return false;

    const updated = _updateEnvironmentTaskDraft(taskId, task => {
      if (updatesOrNull === null) {
        const { failureOutcome, ...rest } = task;
        return rest;
      }
      if (typeof updatesOrNull !== 'object') return null;
      return {
        ...task,
        failureOutcome: _normalizeEnvironmentTaskFailureOutcome(task.failureOutcome, updatesOrNull)
      };
    });
    return !!updated;
  }

  function duplicateEnvironmentTask(taskId = get(selectedEnvironmentTaskId)) {
    const current = get(environmentDraft);
    if (!current || !taskId) return null;

    const tasks = Array.isArray(current.tasks) ? _clonePlain(current.tasks) : [];
    const index = tasks.findIndex(task => task.id === taskId);
    if (index < 0) return null;

    const duplicate = {
      ..._clonePlain(tasks[index]),
      id: _randomID(),
      name: _taskCopyName(tasks[index].name, services.localize)
    };
    tasks.splice(index + 1, 0, duplicate);
    _setEnvironmentTasks(tasks, duplicate.id);
    return _clonePlain(duplicate);
  }

  function deleteEnvironmentTask(taskId = get(selectedEnvironmentTaskId)) {
    const current = get(environmentDraft);
    if (!current || !taskId) return false;

    const tasks = Array.isArray(current.tasks) ? _clonePlain(current.tasks) : [];
    const index = tasks.findIndex(task => task.id === taskId);
    if (index < 0) return false;

    const nextTasks = tasks.filter(task => task.id !== taskId);
    const nextSelected = nextTasks[Math.min(index, nextTasks.length - 1)]?.id || '';
    return _setEnvironmentTasks(nextTasks, nextSelected);
  }

  function reorderEnvironmentTasks(orderedTaskIds = []) {
    const current = get(environmentDraft);
    if (!current) return [];

    const tasks = Array.isArray(current.tasks) ? _clonePlain(current.tasks) : [];
    const byId = new Map(tasks.map(task => [task.id, task]));
    const emitted = new Set();
    const reordered = [];

    for (const id of Array.isArray(orderedTaskIds) ? orderedTaskIds : []) {
      if (!byId.has(id) || emitted.has(id)) continue;
      reordered.push(byId.get(id));
      emitted.add(id);
    }

    for (const task of tasks) {
      if (emitted.has(task.id)) continue;
      reordered.push(task);
    }

    _setEnvironmentTasks(reordered, get(selectedEnvironmentTaskId));
    return _clonePlain(reordered);
  }

  function moveEnvironmentTask(taskId = get(selectedEnvironmentTaskId), direction = 'down') {
    const current = get(environmentDraft);
    if (!current || !taskId) return [];

    const tasks = Array.isArray(current.tasks) ? _clonePlain(current.tasks) : [];
    const index = tasks.findIndex(task => task.id === taskId);
    if (index < 0) return tasks;

    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= tasks.length) return tasks;

    const [moved] = tasks.splice(index, 1);
    tasks.splice(nextIndex, 0, moved);
    _setEnvironmentTasks(tasks, taskId);
    return _clonePlain(tasks);
  }

  async function cancelEnvironmentDraft() {
    const persistedDraft = get(persistedEnvironmentDraft);
    if (persistedDraft) {
      selectedEnvironmentId.set(persistedDraft.id || '');
      _setEnvironmentDraftState(persistedDraft, {
        persistedDraft,
        dirty: false,
        isNew: false,
        saveError: null
      });
    } else {
      const environments = get(viewState).environments || [];
      const fallback = environments[0] || null;
      selectedEnvironmentId.set(fallback?.id || '');
      _setEnvironmentDraftState(fallback, {
        persistedDraft: fallback,
        dirty: false,
        isNew: false,
        saveError: null
      });
    }
    _patchEnvironmentViewState();
    return _clonePlain(get(environmentDraft));
  }

  async function saveEnvironmentDraft() {
    const current = get(environmentDraft);
    if (!current) return { ok: false, error: 'No environment draft is selected.' };

    const environmentStore = _getEnvironmentStore();
    if (!environmentStore) {
      const message = services.localize?.('FABRICATE.Admin.Environments.StoreUnavailable')
        || 'Gathering environment data is not available.';
      environmentSaveError.set(message);
      environmentValidationState.set(null);
      _patchEnvironmentViewState();
      return { ok: false, error: message };
    }

    environmentSaving.set(true);
    environmentSaveError.set(null);
    environmentValidationState.set(null);
    _patchEnvironmentViewState();

    try {
      const payload = _clonePlain(current);
      let saved;
      if (get(environmentDraftIsNew) || !payload.id) {
        if (!environmentStore.create) {
          throw new Error('Gathering environment store cannot create environments.');
        }
        if (!payload.id) delete payload.id;
        saved = await environmentStore.create(payload);
      } else {
        if (!environmentStore.update) {
          throw new Error('Gathering environment store cannot update environments.');
        }
        saved = await environmentStore.update(payload.id, payload);
      }

      const savedDraft = _clonePlain(saved || payload);
      selectedEnvironmentId.set(savedDraft?.id || payload.id || '');
      _setEnvironmentDraftState(savedDraft, {
        persistedDraft: savedDraft,
        dirty: false,
        isNew: false,
        saveError: null
      });
      environmentSaving.set(false);
      await refresh();
      return { ok: true, environment: _clonePlain(get(environmentDraft)) };
    } catch (err) {
      const message = _environmentErrorMessage(err);
      const validationState = _buildEnvironmentValidationState(
        err,
        get(environmentDraft),
        services.localize,
        ++environmentValidationAttempt
      );
      environmentSaving.set(false);
      environmentSaveError.set(message);
      environmentValidationState.set(validationState);
      _patchEnvironmentViewState();
      return { ok: false, error: message, validation: _clonePlain(validationState) };
    }
  }

  async function duplicateEnvironmentDraft(environmentId = get(selectedEnvironmentId)) {
    const sourceId = environmentId || get(environmentDraft)?.id || '';
    if (!sourceId) return null;
    if (!await confirmDiscardDirtyEnvironmentDraft()) return null;

    const environmentStore = _getEnvironmentStore();
    if (!environmentStore?.duplicate) return null;

    try {
      const duplicate = await environmentStore.duplicate(sourceId);
      if (!duplicate) return null;
      selectedEnvironmentId.set(duplicate.id || '');
      _setEnvironmentDraftState(duplicate, {
        persistedDraft: duplicate,
        dirty: false,
        isNew: false,
        saveError: null
      });
      await refresh();
      return _clonePlain(get(environmentDraft));
    } catch (err) {
      environmentSaveError.set(_environmentErrorMessage(err));
      environmentValidationState.set(null);
      _patchEnvironmentViewState();
      return null;
    }
  }

  async function deleteEnvironmentDraft(environmentId = get(selectedEnvironmentId)) {
    const targetId = environmentId || get(environmentDraft)?.id || '';
    if (!targetId) {
      if (!await confirmDiscardDirtyEnvironmentDraft()) return false;
      await cancelEnvironmentDraft();
      return false;
    }

    const environmentStore = _getEnvironmentStore();
    if (!environmentStore?.delete) return false;

    const currentEnvironments = get(viewState).environments || [];
    const selectedIdBeforeDelete = get(selectedEnvironmentId);
    const deletingSelectedDraft = targetId === selectedIdBeforeDelete || targetId === get(environmentDraft)?.id;
    const targetIndex = currentEnvironments.findIndex(environment => environment.id === targetId);
    const targetEnvironment = currentEnvironments.find(environment => environment.id === targetId)
      || get(environmentDraft);
    const environmentName = targetEnvironment?.name || targetId;
    const escapedEnvironmentName = _escapeHtml(environmentName);
    const confirmed = await services.confirmDialog?.({
      title: services.localize?.('FABRICATE.Admin.Environments.DeleteTitle', { name: escapedEnvironmentName })
        || `Delete ${escapedEnvironmentName}?`,
      content: `<p>${
        services.localize?.('FABRICATE.Admin.Environments.DeleteContent', { name: escapedEnvironmentName })
          || `Delete gathering environment <strong>${escapedEnvironmentName}</strong>? This also cleans active and historical gathering runs that reference it.`
      }</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return false;

    try {
      const deleted = await environmentStore.delete(targetId);
      if (!deleted) return false;
      const remaining = currentEnvironments.filter(environment => environment.id !== targetId);
      if (deletingSelectedDraft) {
        const next = remaining[Math.min(Math.max(targetIndex, 0), Math.max(remaining.length - 1, 0))] || null;
        selectedEnvironmentId.set(next?.id || '');
        _setEnvironmentDraftState(next, {
          persistedDraft: next,
          dirty: false,
          isNew: false,
          saveError: null
        });
      } else {
        selectedEnvironmentId.set(selectedIdBeforeDelete);
        environmentSaveError.set(null);
        environmentValidationState.set(null);
      }
      await refresh();
      return true;
    } catch (err) {
      environmentSaveError.set(_environmentErrorMessage(err));
      environmentValidationState.set(null);
      _patchEnvironmentViewState();
      return false;
    }
  }

  async function reorderEnvironments(orderedEnvironmentIds = []) {
    const systemId = get(selectedSystemId);
    const environmentStore = _getEnvironmentStore();
    if (!systemId || !environmentStore?.reorder) return [];

    try {
      const reordered = await environmentStore.reorder(systemId, orderedEnvironmentIds);
      const environments = Array.isArray(reordered) ? reordered : [];
      const selectedId = get(selectedEnvironmentId);
      if (selectedId && !environments.some(environment => environment.id === selectedId)) {
        selectedEnvironmentId.set(environments[0]?.id || '');
        environmentDraftDirty.set(false);
        environmentDraftIsNew.set(false);
      }
      environmentSaveError.set(null);
      environmentValidationState.set(null);
      await refresh();
      return _clonePlain(get(viewState).environments || []);
    } catch (err) {
      environmentSaveError.set(_environmentErrorMessage(err));
      environmentValidationState.set(null);
      _patchEnvironmentViewState();
      return [];
    }
  }

  async function moveEnvironmentDraft(environmentId, direction) {
    const environments = get(viewState).environments || [];
    const index = environments.findIndex(environment => environment.id === environmentId);
    if (index < 0) return [];

    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= environments.length) return environments;

    const ordered = environments.map(environment => environment.id);
    const [moved] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moved);
    return reorderEnvironments(ordered);
  }

  async function toggleEnvironmentEnabled(environmentId, enabled) {
    const targetId = environmentId || '';
    if (!targetId) return false;

    const environmentStore = _getEnvironmentStore();
    if (!environmentStore?.update) return false;

    const environments = get(viewState).environments || [];
    const target = environments.find(environment => environment.id === targetId);
    if (!target) return false;

    const nextEnabled = typeof enabled === 'boolean' ? enabled : target.enabled !== true;
    const payload = {
      ..._clonePlain(target),
      enabled: nextEnabled
    };

    try {
      const saved = _clonePlain(await environmentStore.update(targetId, payload) || payload);
      if (get(selectedEnvironmentId) === targetId || get(environmentDraft)?.id === targetId) {
        if (get(environmentDraftDirty)) {
          const currentDraft = _clonePlain(get(environmentDraft));
          if (currentDraft?.id === targetId) {
            environmentDraft.set({
              ...currentDraft,
              enabled: saved.enabled === true
            });
            persistedEnvironmentDraft.set(saved);
          }
        } else {
          _setEnvironmentDraftState(saved, {
            persistedDraft: saved,
            dirty: false,
            isNew: false,
            saveError: null
          });
        }
      }
      environmentSaveError.set(null);
      environmentValidationState.set(null);
      await refresh();
      return true;
    } catch (err) {
      environmentSaveError.set(_environmentErrorMessage(err));
      environmentValidationState.set(null);
      _patchEnvironmentViewState();
      return false;
    }
  }

  // --- Feature toggles ---

  async function toggleFeature(feature, enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const key = FEATURE_MAP[feature];
    if (!key) return;
    if (key === 'gathering' && enabled !== true && !await confirmDiscardDirtyEnvironmentDraft()) return false;
    await systemManager.updateSystem(sysId, { features: { [key]: enabled } });
    await refresh();
    return true;
  }

  async function toggleAdvancedOptions(enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { advancedOptionsEnabled: enabled });
    await refresh();
  }

  async function toggleSystemEnabled(systemId, enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = systemId || get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { enabled: enabled === true });
    await refresh();
    return true;
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

  async function addEssence(name, description, icon, sourceComponentId) {
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

    const sourceFields = _sourceFieldsForEssenceSelection(system, sourceComponentId || null);
    const essenceDefinitions = [
      ...existing,
      {
        id: crypto.randomUUID(),
        name: normalizedName,
        description: String(description || ''),
        icon: normalizeEssenceIcon(icon || DEFAULT_ESSENCE_ICON),
        ...sourceFields
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
    const hasSourceUpdate = Object.prototype.hasOwnProperty.call(updates, 'sourceComponentId')
      || Object.prototype.hasOwnProperty.call(updates, 'sourceItemUuid');
    const nextSourceFields = hasSourceUpdate
      ? _sourceFieldsForEssenceSelection(
        system,
        Object.prototype.hasOwnProperty.call(updates, 'sourceComponentId') ? updates.sourceComponentId || null : null,
        Object.prototype.hasOwnProperty.call(updates, 'sourceItemUuid') ? updates.sourceItemUuid || null : null
      )
      : null;

    const essenceDefinitions = existing.map(def => {
      if (def.id !== essenceId) return def;
      const nextDefinition = {
        ...def,
        name: nextName,
        description: nextDescription,
        icon: nextIcon
      };
      if (!hasSourceUpdate) return nextDefinition;
      return {
        ...nextDefinition,
        ...nextSourceFields
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

  async function updateComponent(itemId, updates = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!itemId || !sysId) return false;
    if (!updates || typeof updates !== 'object') return false;
    if (Object.keys(updates).length === 0) return true;

    try {
      await systemManager.updateItem(sysId, itemId, updates);
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to update component:', err);
      services.notify?.error?.(err?.message || 'Failed to update component');
      return false;
    }
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
    selectedEnvironmentId,
    selectedEnvironmentTaskId,
    // Computed state
    viewState,
    // Actions
    selectSystem,
    createSystem,
    deleteSystem,
    saveSystemDetails,
    setResolutionMode,
    setTab,
    selectEnvironment,
    createEnvironmentDraft,
    updateEnvironmentDraft,
    selectEnvironmentTask,
    addEnvironmentTask,
    updateEnvironmentTask,
    duplicateEnvironmentTask,
    deleteEnvironmentTask,
    reorderEnvironmentTasks,
    moveEnvironmentTask,
    addEnvironmentTaskResultGroup,
    updateEnvironmentTaskResultGroup,
    deleteEnvironmentTaskResultGroup,
    reorderEnvironmentTaskResultGroups,
    moveEnvironmentTaskResultGroup,
    addEnvironmentTaskResult,
    updateEnvironmentTaskResult,
    deleteEnvironmentTaskResult,
    reorderEnvironmentTaskResults,
    moveEnvironmentTaskResult,
    addEnvironmentTaskCatalyst,
    updateEnvironmentTaskCatalyst,
    deleteEnvironmentTaskCatalyst,
    updateEnvironmentTaskVisibility,
    updateEnvironmentTaskResultSelection,
    updateEnvironmentTaskProgressive,
    updateEnvironmentTaskCheck,
    updateEnvironmentTaskTimeRequirement,
    updateEnvironmentTaskFailureOutcome,
    confirmDiscardDirtyEnvironmentDraft,
    cancelEnvironmentDraft,
    saveEnvironmentDraft,
    duplicateEnvironmentDraft,
    deleteEnvironmentDraft,
    reorderEnvironments,
    moveEnvironmentDraft,
    toggleEnvironmentEnabled,
    toggleSystemEnabled,
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
    updateComponent,
    setRecipeSearch,
    setItemSearch,
    setGraphSearch,
    refresh,
    destroy
  };
}
