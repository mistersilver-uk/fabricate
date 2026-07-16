/**
 * adminStore — Svelte store factory for the RecipeManagerApp (T-120)
 *
 * All side-effects are injected via `services` so this module never touches
 * `game.*` directly.  Each call to createAdminStore() produces a fresh,
 * isolated set of writable() instances. Gathering environment admin state is
 * read from an injected environment store, cloned before exposure, gated by the
 * selected system's `features.gathering` flag, and edited through explicit
 * environment draft actions. Selected-task result, committed
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
  TIME_OF_DAY_ICONS,
  WEATHER_ICONS,
  WEATHER_FALLBACK_ICON,
} from '../util/gatheringConditionIcons.js';
import {
  buildExportPayload,
  validateImportData,
  prepareForImport,
  makeExportFilename,
} from '../../../systems/CraftingSystemExporter.js';
import {
  isGeneralRecipeCategory,
  normalizeCustomRecipeCategories,
  normalizeRecipeCategory,
} from '../../../utils/recipeCategories.js';
import {
  getCharacterModifierPresetsForFoundrySystem,
  seedCharacterModifierPresets,
} from '../../../config/gatheringCharacterModifierPresets.js';
import {
  getCharacterPrerequisitePresetsForFoundrySystem,
  seedCharacterPrerequisitePresets,
} from '../../../config/characterPrerequisitePresets.js';
import {
  normalizeCharacterPrerequisite,
  normalizeCharacterPrerequisiteList,
} from '../../../systems/characterPrerequisites.js';
import {
  getCurrencyPresetsForFoundrySystem,
  seedCurrencyPresets,
} from '../../../config/currencyPresets.js';
import {
  getDefaultProviderId,
  getProviderCanonicalUnits,
} from '../../../config/currencyProviders.js';
import {
  canAddCurrencySubUnit,
  CURRENCY_MACRO_KEYS,
  normalizeCurrencyConfig,
  normalizeCurrencyUnit,
} from '../../../systems/currencyProfile.js';
import { validateDropRows } from '../../../systems/GatheringEnvironmentStore.js';
import { evaluateEnvironmentMatch } from '../../../systems/gatheringMatch.js';
import { normalizeNodeConfig, normalizeNodeRuntime } from '../../../systems/gatheringNodeConfig.js';
import { Tool } from '../../../models/Tool.js';
import { classifyModeChange } from '../../../migration/migrateRecipeForModeChange.js';
import { DEFAULT_GATHERING_EVENT_IMG } from '../../../gatheringImageDefaults.js';
import { DEFAULT_GATHERING_TASK_IMG } from '../../gatheringTaskDefaults.js';
import { evaluateSystemValidation } from '../../../systems/systemValidation.js';
import { SignatureValidator } from '../../../systems/SignatureValidator.js';
import {
  localizeRecipeActivationError,
  localizeRecipePersistenceError,
} from '../../../utils/recipeActivationMessages.js';
import { craftingEffect } from '../apps/manager/crafting/craftingVisibility.js';
import { resolveRecipeAccessRoster } from '../../../utils/recipeAccessRoster.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEATURE_MAP = {
  categories: 'recipeCategories',
  itemTags: 'itemTags',
  essences: 'essences',
  multiStepRecipes: 'multiStepRecipes',
  propertyMacros: 'propertyMacros',
  craftingChecks: 'craftingChecks',
  outcomeRouting: 'outcomeRouting',
  effectTransfer: 'effectTransfer',
  gathering: 'gathering',
  chatOutput: 'chatOutput',
  salvage: 'salvage',
};

const RESOLUTION_MODE_LABEL_KEYS = {
  simple: 'FABRICATE.Admin.SystemSettings.ResolutionSimple',
  routedByIngredients: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByIngredients',
  routedByCheck: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByCheck',
  progressive: 'FABRICATE.Admin.SystemSettings.ResolutionProgressive',
  alchemy: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemy',
};

const BASE_TABS = new Set(['systems', 'items', 'recipes', 'rules', 'graph']);
const ENVIRONMENTS_TAB = 'environments';
const TASK_RESOLUTION_MODES = new Set(['routed', 'progressive']);
const TASK_PROGRESSIVE_AWARD_MODES = new Set(['equal', 'partial', 'exceed']);
const TASK_TIME_UNITS = ['minutes', 'hours', 'days', 'months', 'years'];
const TASK_FAILURE_OUTCOME_MODES = new Set(['text', 'macro']);
const GATHERING_CONFIG_SETTING = 'gatheringConfig';
const DEFAULT_GATHERING_CONDITIONS = Object.freeze({ weather: 'clear', timeOfDay: 'day' });
const DEFAULT_GATHERING_VOCABULARIES = Object.freeze({
  biomes: [
    'forest',
    'grassland',
    'mountain',
    'cave',
    'coastal',
    'swamp',
    'desert',
    'urban',
    'ruins',
    'wasteland',
  ],
  danger: ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'],
  weather: ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'wind'],
  timeOfDay: ['dawn', 'day', 'dusk', 'night'],
});
const GATHERING_CONDITION_DIMENSIONS = new Set(['weather', 'timeOfDay']);
const GATHERING_VOCABULARY_DIMENSIONS = new Set(['biomes']);
const GATHERING_BIOME_COLOR_TOKENS = new Set([
  'sage',
  'mist',
  'lavender',
  'rose',
  'peach',
  'butter',
  'aqua',
  'mauve',
]);
const DEFAULT_GATHERING_BIOME_COLOR_TOKEN = 'sage';
const DEFAULT_GATHERING_BIOME_METADATA = Object.freeze({
  forest: Object.freeze({ label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage' }),
  grassland: Object.freeze({ label: 'Grassland', icon: 'fas fa-wheat-awn', colorToken: 'butter' }),
  mountain: Object.freeze({ label: 'Mountain', icon: 'fas fa-mountain', colorToken: 'mist' }),
  cave: Object.freeze({ label: 'Cave', icon: 'fas fa-dungeon', colorToken: 'lavender' }),
  coastal: Object.freeze({ label: 'Coastal', icon: 'fas fa-water', colorToken: 'aqua' }),
  swamp: Object.freeze({ label: 'Swamp', icon: 'fas fa-frog', colorToken: 'mauve' }),
  desert: Object.freeze({ label: 'Desert', icon: 'fas fa-sun', colorToken: 'peach' }),
  urban: Object.freeze({ label: 'Urban', icon: 'fas fa-city', colorToken: 'mist' }),
  ruins: Object.freeze({ label: 'Ruins', icon: 'fas fa-archway', colorToken: 'rose' }),
  wasteland: Object.freeze({ label: 'Wasteland', icon: 'fas fa-skull', colorToken: 'mauve' }),
});
const DEFAULT_GATHERING_CONDITION_ICONS = Object.freeze({
  weather: WEATHER_ICONS,
  timeOfDay: TIME_OF_DAY_ICONS,
});
const FALLBACK_GATHERING_CONDITION_ICONS = Object.freeze({
  weather: WEATHER_FALLBACK_ICON,
  timeOfDay: 'fas fa-clock',
});
const GATHERING_DROP_SELECTION_MODES = new Set(['highestRankedDrop', 'allDrops', 'limitedDrops']);
const GATHERING_EVENT_POLICIES = new Set(['successWithEvent', 'failureWithEvent']);
const GATHERING_TOOL_BREAKAGE_POLICIES = new Set(['failureOnBreak', 'successDespiteBreak']);
const GATHERING_BIOME_MODIFIER_AGGREGATIONS = new Set([
  'cumulative',
  'strongestOfEach',
  'dominant',
]);
const GATHERING_BLIND_CANDIDATE_GATES = new Set(['attemptableOnly', 'allMatching']);
const GATHERING_REVEAL_POLICIES = new Set(['never', 'onSuccess', 'onAttempt']);
const GATHERING_REVEAL_SCOPES = new Set(['actor', 'user', 'party', 'global']);
const GATHERING_EVENT_VISIBILITIES = new Set(['dangerLevelOnly', 'encounterChance', 'full']);
const ENVIRONMENT_INCLUDED_COMPOSITION_STATES = new Set([
  'includedByMatch',
  'explicitlyIncluded',
  'forceIncluded',
  'includedButUnavailable',
]);
const DEFAULT_GATHERING_RULES = Object.freeze({
  rewardSelectionMode: 'highestRankedDrop',
  rewardLimit: 1,
  eventSelectionMode: 'allDrops',
  eventLimit: 1,
  eventPolicy: 'successWithEvent',
  toolBreakagePolicy: 'failureOnBreak',
  biomeModifierAggregation: 'strongestOfEach',
  blindCandidateGate: 'attemptableOnly',
  revealPolicy: 'never',
  revealScope: 'actor',
  eventVisibility: 'encounterChance',
  dropModifierMode: 'additive',
});

// ---------------------------------------------------------------------------
// Module-private helper functions
// ---------------------------------------------------------------------------

/**
 * Generate a unique system name that does not collide with any existing system.
 * Mirrors RecipeManagerApp._nextSystemName().
 */
// --- Currency unit mutation helpers (kept module-level and shallow so the
// adminStore mutate callbacks stay readable and avoid deep callback nesting) ---

function _stripSubUnit(unit, subUnitId) {
  return {
    ...unit,
    contains: (unit.contains || []).filter((entry) => entry.unitId !== subUnitId),
  };
}

function _deleteCurrencyUnitFromList(units, unitId) {
  if (!unitId) return null;
  const nextUnits = units
    .filter((unit) => unit.id !== unitId)
    .map((unit) => _stripSubUnit(unit, unitId));
  return nextUnits.length === units.length ? null : nextUnits;
}

function _setSubUnitAmount(entry, subUnitId, numericAmount) {
  if (entry.unitId !== subUnitId) return entry;
  return { ...entry, amount: numericAmount };
}

function _updateSubUnitAmountInList(units, parentUnitId, subUnitId, numericAmount) {
  let changed = false;
  const nextUnits = units.map((unit) => {
    if (unit.id !== parentUnitId) return unit;
    const contains = (unit.contains || []).map((entry) => {
      const updated = _setSubUnitAmount(entry, subUnitId, numericAmount);
      if (updated !== entry) changed = true;
      return updated;
    });
    return { ...unit, contains };
  });
  return { nextUnits, changed };
}

function _deleteSubUnitFromList(units, parentUnitId, subUnitId) {
  let changed = false;
  const nextUnits = units.map((unit) => {
    if (unit.id !== parentUnitId) return unit;
    const contains = (unit.contains || []).filter((entry) => entry.unitId !== subUnitId);
    if (contains.length !== (unit.contains || []).length) changed = true;
    return { ...unit, contains };
  });
  return { nextUnits, changed };
}

function _nextSystemName(systemManager) {
  const base = 'New Crafting System';
  const names = new Set(systemManager.getSystems().map((s) => s.name));
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
  const groups =
    Array.isArray(ingredientSet?.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
      ? ingredientSet.ingredientGroups
      : (ingredientSet?.ingredients || []).map((ingredient) => ({ options: [ingredient] }));
  return groups.reduce((sum, group) => sum + ((group.options || []).length || 0), 0);
}

function _getRecipeExecutionSteps(recipe) {
  const methodSteps =
    typeof recipe?.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : null;
  if (Array.isArray(methodSteps) && methodSteps.length > 0) return methodSteps;
  if (Array.isArray(recipe?.steps) && recipe.steps.length > 0) return recipe.steps;

  return [
    {
      id: 'implicit-step',
      name: 'Step 1',
      ingredientSets: Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [],
      resultGroups: Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [],
      toolIds: Array.isArray(recipe?.toolIds) ? recipe.toolIds : [],
    },
  ];
}

function _usesExplicitRecipeSteps(recipe, executionSteps) {
  return (Array.isArray(recipe?.steps) && recipe.steps.length > 0) || executionSteps.length > 1;
}

function _buildRequirementPreviewStep(step, index, sharedRecipeToolIds = []) {
  const ingredientSets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
  const ingredientSetSummaries = ingredientSets.map((set, setIndex) => ({
    id: set?.id || `set-${setIndex + 1}`,
    name: set?.name || `Set ${setIndex + 1}`,
    ingredientCount: _ingredientCountForSet(set),
    toolCount: Array.isArray(set?.toolIds) ? set.toolIds.length : 0,
  }));
  const stepToolCount = Array.isArray(step?.toolIds) ? step.toolIds.length : 0;
  const previewIngredientCount =
    ingredientSetSummaries.length > 0
      ? Math.max(...ingredientSetSummaries.map((set) => set.ingredientCount))
      : 0;
  const previewSetToolCount =
    ingredientSetSummaries.length > 0
      ? Math.max(...ingredientSetSummaries.map((set) => set.toolCount))
      : 0;

  const resultGroups = Array.isArray(step?.resultGroups) ? step.resultGroups : [];

  return {
    id: step?.id || `step-${index + 1}`,
    name: step?.name || `Step ${index + 1}`,
    ingredientSetCount: ingredientSets.length,
    ingredientCount: previewIngredientCount,
    toolCount: sharedRecipeToolIds.length + stepToolCount + previewSetToolCount,
    resultGroupCount: resultGroups.length,
    // The number of result ITEMS across the step's groups. Distinct from
    // `resultGroupCount`: the browser row's "N out" half is only meaningful in
    // `simple` / `progressive` (issue 643 §9); tier- and set-keyed modes render
    // the GROUP count instead, so both numbers have to be projected.
    resultItemCount: resultGroups.reduce(
      (sum, group) => sum + (Array.isArray(group?.results) ? group.results.length : 0),
      0
    ),
    hasAlternatives: ingredientSetSummaries.length > 1,
    ingredientSetSummaries,
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

/**
 * Coarse fallback for {@link _isRecipeIncomplete} when a recipe model instance
 * (with `validate()` / `validateStructure()`) is unavailable. Detects the common
 * shell shapes — missing ingredient sets / result groups — but not the deeper
 * completeness cases the validators reject.
 * @param {object} recipe
 * @returns {boolean}
 */
function _isRecipeIncompleteByCounts(recipe) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  if (steps.length > 0) {
    return steps.some(
      (step) =>
        !Array.isArray(step?.ingredientSets) ||
        step.ingredientSets.length === 0 ||
        !Array.isArray(step?.resultGroups) ||
        step.resultGroups.length === 0
    );
  }
  const ingredientSets = Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [];
  const resultGroups = Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [];
  return ingredientSets.length === 0 || resultGroups.length === 0;
}

/**
 * Derive whether a recipe is an incomplete authoring shell — persistable but not craftable.
 * Source of truth: a recipe is incomplete iff it is structurally sound but fails the
 * full completeness contract, i.e. `validateStructure().valid === true` while
 * `validate().valid === false`. This exactly matches the craftability/completeness
 * notion (the engine gates craft on `Recipe.validate()`), so the chip never falsely
 * reads "complete" for a recipe whose ingredient set has no groups/essences, whose
 * result group is empty, whose resolution-mode cardinality is unmet, or — for explicit
 * multi-step recipes — whose step is missing either side. The two validators are pure.
 * Falls back to a coarse count-only check when a model instance is unavailable.
 * @param {Recipe} recipe
 * @returns {boolean}
 */
function _isRecipeIncomplete(recipe) {
  if (typeof recipe?.validate === 'function' && typeof recipe?.validateStructure === 'function') {
    return recipe.validate().valid === false && recipe.validateStructure().valid === true;
  }
  return _isRecipeIncompleteByCounts(recipe);
}

function _buildRecipeBrowserDisplay(recipe) {
  const executionSteps = _getRecipeExecutionSteps(recipe);
  const isSimple = typeof recipe.isSimpleRecipe === 'function' ? recipe.isSimpleRecipe() : true;
  const sharedRecipeToolIds =
    _usesExplicitRecipeSteps(recipe, executionSteps) && Array.isArray(recipe?.toolIds)
      ? recipe.toolIds
      : [];
  const requirementsPreview = executionSteps.map((step, index) =>
    _buildRequirementPreviewStep(step, index, sharedRecipeToolIds)
  );
  const structure = _recipeStructure(isSimple, requirementsPreview.length);

  return {
    description: String(recipe.description || '').trim(),
    stepCount: requirementsPreview.length,
    resultGroupCount: requirementsPreview.reduce((sum, step) => sum + step.resultGroupCount, 0),
    resultItemCount: requirementsPreview.reduce((sum, step) => sum + step.resultItemCount, 0),
    ingredientCount: requirementsPreview.reduce((sum, step) => sum + step.ingredientCount, 0),
    toolCount: requirementsPreview.reduce((sum, step) => sum + step.toolCount, 0),
    ...structure,
    requirementsPreview,
    isSimple,
  };
}

/**
 * The crafting check a recipe row's check pill resolves against, keyed off the
 * SYSTEM's resolution mode. `routedByCheck` authors its check on the `routed`
 * slot; `simple`, `alchemy` and `routedByIngredients` share the `simple`
 * pass/fail slot; `progressive` has its own.
 * @private
 */
function _recipeCheckConfig(system) {
  const mode = system?.resolutionMode || 'simple';
  if (mode === 'routedByCheck') return system?.craftingCheck?.routed || null;
  if (mode === 'progressive') return system?.craftingCheck?.progressive || null;
  return system?.craftingCheck?.simple || null;
}

/**
 * The check pill the recipe row renders (issue 643 §9). The row cannot derive
 * this — the DC lives on the SYSTEM's check, keyed by the recipe's `checkTierId`
 * — so it is projected here.
 *
 * A check is USABLE only when it has an authored `rollFormula`; "checks enabled"
 * is not the same thing. The DC resolution mirrors
 * `CraftingEngine._resolveSimpleCheckDc`: the recipe's selected tier wins, then
 * the check's static default.
 *
 * The two check-less kinds are NOT the same fact, and the row must not tell the GM
 * they are:
 *
 *  - `ingredients` — a `routedByIngredients` system with no usable check. Results
 *    route off the ingredient set that was used, so the recipe resolves perfectly
 *    well with no roll. This is a working configuration, reported neutrally.
 *  - `none` — every other mode with no usable check. The system cannot roll for this
 *    recipe, which is a state the GM should be able to SCAN a library for, so it
 *    carries a warning rather than an em dash that says nothing.
 *
 * @param {object} system the selected crafting system (raw, not projected).
 * @param {object} recipe the Recipe model.
 * @returns {{kind: 'none' | 'ingredients' | 'progressive' | 'dynamic' | 'dc', dc: number | null}}
 * @private
 */
function _buildRecipeCheckSummary(system, recipe) {
  const mode = system?.resolutionMode || 'simple';
  // Alchemy's own check mode is system-level and independent of the crafting
  // check; `none` means the recipe resolves with no check at all.
  if (mode === 'alchemy' && (system?.alchemy?.checkMode || 'none') === 'none') {
    return { kind: 'none', dc: null };
  }

  const config = _recipeCheckConfig(system);
  const hasRollFormula = Boolean(String(config?.rollFormula ?? '').trim());
  if (!config || !hasRollFormula) {
    return mode === 'routedByIngredients'
      ? { kind: 'ingredients', dc: null }
      : { kind: 'none', dc: null };
  }
  if (mode === 'progressive') return { kind: 'progressive', dc: null };
  // A dynamic DC is macro-resolved at craft time; there is no static number to show.
  if (config.dcMode === 'dynamic') return { kind: 'dynamic', dc: null };

  const tiers = Array.isArray(config.tiers) ? config.tiers : [];
  const tier = recipe?.checkTierId ? tiers.find((entry) => entry?.id === recipe.checkTierId) : null;
  const tierDc = Number(tier?.dc);
  if (tier && Number.isFinite(tierDc)) return { kind: 'dc', dc: Math.trunc(tierDc) };

  const defaultDc = Number(config.dc);
  return { kind: 'dc', dc: Number.isFinite(defaultDc) ? Math.trunc(defaultDc) : 15 };
}

function _getManagedItems(system) {
  if (Array.isArray(system?.components)) return system.components;
  if (Array.isArray(system?.items)) return system.items;
  return [];
}

function _buildManagedItemOptions(managedItems = []) {
  return managedItems.map((item) => ({
    id: item.id,
    name: item.name,
    img: item.img || 'icons/svg/item-bag.svg',
    description: _plainTextDescription(item.description),
    ...(item.originItemUuid ? { originItemUuid: item.originItemUuid } : {}),
    ...(item.registeredItemUuid ? { registeredItemUuid: item.registeredItemUuid } : {}),
    ...(Object.prototype.hasOwnProperty.call(item, 'difficulty')
      ? { difficulty: item.difficulty }
      : {}),
  }));
}

/**
 * Minimal `{ id, tags }` projection of the managed components, used only by the
 * recipe Validation tab's overlapping-requirement detection. Kept SEPARATE from
 * `_buildManagedItemOptions` (whose `{ id, name, img, ... }` shape is asserted by
 * the manager contract tests and feeds many pickers). Tags are normalized the
 * same way the tags-match handler stores match tags (trim + drop blanks) so a
 * tag requirement's `match.tags` line up with a component's `tags` during
 * expansion; mismatched normalization would silently miss overlaps.
 *
 * @param {object[]} [managedItems]
 * @returns {{ id: string, tags: string[] }[]}
 */
function _buildComponentTagOptions(managedItems = []) {
  return managedItems.map((item) => ({
    id: item.id,
    tags: Array.isArray(item.tags)
      ? item.tags.map((tag) => String(tag ?? '').trim()).filter(Boolean)
      : [],
    // Numeric-positive essence quantities so an essence option's
    // `expandToComponentIds` resolves the components carrying that essence during
    // readiness/signature checks (without it, essence overlap detection no-ops).
    essences: _normalizeComponentEssences(item.essences),
  }));
}

/**
 * Numeric-positive essence quantities of a managed component, keyed by trimmed
 * essence id. Mirrors `systemValidation.normalizeComponentEssences` so essence
 * expansion agrees across the readiness/signature layers.
 *
 * @param {object} essences
 * @returns {Record<string, number>}
 */
function _normalizeComponentEssences(essences) {
  const out = {};
  if (!essences || typeof essences !== 'object') return out;
  for (const [rawId, rawQty] of Object.entries(essences)) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    const qty = Number(rawQty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    out[id] = qty;
  }
  return out;
}

function _resolutionModeLabel(mode, localizeFn) {
  const key = RESOLUTION_MODE_LABEL_KEYS[mode];
  return key ? localizeFn?.(key) || mode : mode;
}

function _buildSalvageSummary(item, salvageEnabled) {
  if (!salvageEnabled || item?.salvage?.enabled !== true) return null;

  const salvage = item.salvage || {};
  const outcomeRouting =
    salvage.outcomeRouting && typeof salvage.outcomeRouting === 'object'
      ? Object.keys(salvage.outcomeRouting).length
      : 0;

  return {
    quantityRequired: Number(salvage.ingredientQuantity) || 1,
    toolCount: Array.isArray(salvage.toolIds) ? salvage.toolIds.length : 0,
    resultGroupCount: Array.isArray(salvage.resultGroups) ? salvage.resultGroups.length : 0,
    hasTimeRequirement: !!salvage.timeRequirement,
    hasCurrencyRequirement: !!salvage.currencyRequirement,
    outcomeCount: outcomeRouting,
  };
}

function _clonePlain(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function _normalizeGatheringTag(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function _normalizeGatheringVocabularyId(value) {
  if (value && typeof value === 'object') {
    return _normalizeGatheringVocabularyId(value.id ?? value.value ?? value.label);
  }
  return _normalizeGatheringTag(value);
}

function _normalizeGatheringConditionId(value) {
  if (value && typeof value === 'object') {
    return _normalizeGatheringConditionId(value.id ?? value.value ?? value.label);
  }
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function _normalizeGatheringTagList(value) {
  const values = Array.isArray(value) ? value : value ? String(value).split(',') : [];
  return Array.from(new Set(values.map(_normalizeGatheringTag).filter(Boolean)));
}

function _normalizeGatheringConditionIdList(value) {
  const values = Array.isArray(value) ? value : value ? String(value).split(',') : [];
  return Array.from(new Set(values.map(_normalizeGatheringConditionId).filter(Boolean)));
}

function _seedGatheringVocabulary(raw, defaults) {
  const values = _normalizeGatheringTagList(raw);
  return values.length > 0 ? values : [...defaults];
}

function _gatheringVocabularyLabelFromId(id) {
  return String(id || '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((token) =>
      token.length <= 2 ? token.toUpperCase() : `${token.charAt(0).toUpperCase()}${token.slice(1)}`
    )
    .join(' ');
}

function _normalizeBiomeColorToken(value) {
  const token = String(value || '')
    .trim()
    .replace(/^--fab-tag-/, '');
  return GATHERING_BIOME_COLOR_TOKENS.has(token) ? token : DEFAULT_GATHERING_BIOME_COLOR_TOKEN;
}

function _normalizeCustomHex(value) {
  const hex = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : '';
}

function _normalizeGatheringVocabularyOption(kind, value) {
  const isRecord = value && typeof value === 'object';
  const id = _normalizeGatheringVocabularyId(
    isRecord ? (value.id ?? value.value ?? value.label) : value
  );
  if (!id) return null;
  const rawLabel = isRecord ? String(value.label ?? '').trim() : '';
  const defaultBiome = kind === 'biomes' ? DEFAULT_GATHERING_BIOME_METADATA[id] : null;
  // Bare strings get a generated capitalised label — using the raw string as
  // the label would render an unwanted lowercase chip (e.g. "northreach"
  // instead of "Northreach"). Records keep their explicit label when present.
  const label = isRecord
    ? rawLabel || defaultBiome?.label || _gatheringVocabularyLabelFromId(id)
    : defaultBiome?.label || _gatheringVocabularyLabelFromId(id);
  if (kind === 'biomes') {
    return {
      id,
      label,
      icon: normalizeEssenceIcon(
        isRecord
          ? value.icon || defaultBiome?.icon || 'fas fa-tree'
          : defaultBiome?.icon || 'fas fa-tree'
      ),
      colorToken: _normalizeBiomeColorToken(
        isRecord
          ? value.colorToken || defaultBiome?.colorToken || DEFAULT_GATHERING_BIOME_COLOR_TOKEN
          : defaultBiome?.colorToken || DEFAULT_GATHERING_BIOME_COLOR_TOKEN
      ),
      customColor: _normalizeCustomHex(isRecord ? value.customColor : ''),
    };
  }
  return { id, label };
}

function _normalizeGatheringVocabularyOptions(kind, value) {
  const values = Array.isArray(value) ? value : value ? String(value).split(',') : [];
  const options = [];
  const seen = new Set();
  for (const raw of values) {
    const option = _normalizeGatheringVocabularyOption(kind, raw);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options;
}

function _seedGatheringVocabularyOptions(kind, raw, defaults) {
  const options = _normalizeGatheringVocabularyOptions(kind, raw);
  if (options.length > 0) return options;
  return _normalizeGatheringVocabularyOptions(kind, defaults);
}

function _normalizeGatheringSystemVocabularies(raw = {}, fallbackVocabularies = {}) {
  const normalized = {};
  for (const kind of GATHERING_VOCABULARY_DIMENSIONS) {
    const rawValues = Array.isArray(raw?.[kind]?.values)
      ? raw[kind].values
      : Array.isArray(raw?.[kind])
        ? raw[kind]
        : fallbackVocabularies?.[kind];
    normalized[kind] = {
      values: _normalizeGatheringVocabularyOptions(kind, rawValues),
    };
  }
  return normalized;
}

function _conditionLabelFromId(id) {
  return String(id || '')
    .split('-')
    .filter(Boolean)
    .map((token) =>
      token.length <= 2 ? token.toUpperCase() : `${token.charAt(0).toUpperCase()}${token.slice(1)}`
    )
    .join(' ');
}

function _defaultGatheringConditionIcon(kind, id) {
  return (
    DEFAULT_GATHERING_CONDITION_ICONS[kind]?.[id] ||
    FALLBACK_GATHERING_CONDITION_ICONS[kind] ||
    DEFAULT_ESSENCE_ICON
  );
}

function _normalizeGatheringConditionOption(kind, value) {
  const isRecord = value && typeof value === 'object';
  const id = _normalizeGatheringConditionId(
    isRecord ? (value.id ?? value.value ?? value.label) : value
  );
  if (!id) return null;
  const rawLabel = isRecord ? String(value.label ?? '').trim() : String(value ?? '').trim();
  const label = isRecord
    ? rawLabel || _conditionLabelFromId(id)
    : /[A-Z]/.test(rawLabel)
      ? rawLabel
      : _conditionLabelFromId(id);
  const icon = normalizeEssenceIcon(
    isRecord ? value.icon : _defaultGatheringConditionIcon(kind, id)
  );
  return { id, label, icon };
}

function _normalizeGatheringConditionOptions(kind, value) {
  const values = Array.isArray(value) ? value : value ? String(value).split(',') : [];
  const options = [];
  const seen = new Set();
  for (const raw of values) {
    const option = _normalizeGatheringConditionOption(kind, raw);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options;
}

function _seedGatheringConditionOptions(kind, raw, defaults) {
  const values = _normalizeGatheringConditionOptions(kind, raw);
  if (values.length > 0) return values;
  return _normalizeGatheringConditionOptions(kind, defaults);
}

// Module-scope id fallback for the normalizer helpers (which run before the store
// closure's services-aware _randomID exists). Prefers Foundry's randomID, then the
// Web Crypto UUID; the last resort is a time + counter id (no PRNG) so we never
// rely on Math.random for identity.
let _fallbackIdCounter = 0;
function _fallbackRandomID() {
  if (typeof globalThis.foundry?.utils?.randomID === 'function') {
    return globalThis.foundry.utils.randomID();
  }
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  _fallbackIdCounter += 1;
  return `id-${Date.now().toString(36)}-${_fallbackIdCounter.toString(36)}`;
}

function _normalizeGatheringDropRow(row = {}, randomID = _fallbackRandomID) {
  return {
    id: row.id ? String(row.id) : randomID(),
    name: String(row.name || ''),
    componentId: String(row.componentId || row.systemItemId || ''),
    itemUuid: String(row.itemUuid || ''),
    quantity:
      Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0 ? Number(row.quantity) : 1,
    dropRate: Number.isFinite(Number(row.dropRate))
      ? Math.min(100, Math.max(0, Math.floor(Number(row.dropRate))))
      : 1,
    conditionModifiers: _normalizeGatheringDropConditionModifiers(row.conditionModifiers),
    characterModifiers: _normalizeGatheringCharacterModifierReferences(
      row.characterModifiers,
      randomID
    ),
    enabled: row.enabled !== false,
  };
}

const GATHERING_CHARACTER_MODIFIER_OPERATORS = new Set(['+', '-']);
// Mirrors GatheringRichStateService: the drop-modifier application mode is a
// single global system setting (`dropModifierMode`) and is not overridable per
// modifier.
const GATHERING_DROP_MODIFIER_MODES = new Set(['additive', 'multiplicative']);

function _normalizeGatheringCharacterModifier(entry = {}, randomID = _fallbackRandomID) {
  if (!entry || typeof entry !== 'object') return null;
  const id = entry.id ? String(entry.id) : '';
  if (!id) return null;
  const expression = String(entry.expression ?? '').trim();
  return {
    id,
    label: String(entry.label || id),
    icon: String(entry.icon || 'fa-solid fa-user'),
    expression,
  };
}

function _normalizeGatheringCharacterModifierReferences(refs, randomID = _fallbackRandomID) {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((ref, index) => _normalizeGatheringCharacterModifierReference(ref, index, randomID))
    .filter(Boolean);
}

function _normalizeGatheringCharacterModifierReference(ref, index, randomID = _fallbackRandomID) {
  if (!ref || typeof ref !== 'object') return null;
  const modifierId = String(ref.modifierId || '').trim();
  if (!modifierId) return null;
  const min =
    Number.isFinite(Number(ref.min)) && ref.min !== null && ref.min !== '' ? Number(ref.min) : null;
  const max =
    Number.isFinite(Number(ref.max)) && ref.max !== null && ref.max !== '' ? Number(ref.max) : null;
  return {
    id: ref.id ? String(ref.id) : `char-mod-${modifierId}-${index + 1}`,
    modifierId,
    operator: GATHERING_CHARACTER_MODIFIER_OPERATORS.has(ref.operator) ? ref.operator : '+',
    min,
    max,
    expressionOverride: String(ref.expressionOverride || ''),
  };
}

function _normalizeGatheringDropConditionModifiers(modifiers = {}) {
  return {
    timeOfDay: _normalizeGatheringDropConditionModifierList(modifiers?.timeOfDay),
    weather: _normalizeGatheringDropConditionModifierList(modifiers?.weather),
    biome: _normalizeGatheringDropConditionModifierList(modifiers?.biome, _normalizeGatheringTag),
  };
}

function _normalizeGatheringDropConditionModifierList(
  values = [],
  normalizeId = _normalizeGatheringConditionId
) {
  return (Array.isArray(values) ? values : [])
    .map((modifier, index) => {
      const conditionId = normalizeId(modifier?.conditionId ?? modifier?.id);
      const rawValue = Number(modifier?.value);
      if (!conditionId || !Number.isFinite(rawValue)) return null;
      const truncated = Math.trunc(rawValue);
      const explicitOperator =
        modifier?.operator === '-' || modifier?.operator === '+' ? modifier.operator : null;
      const operator = explicitOperator ?? (truncated < 0 ? '-' : '+');
      return {
        id: String(modifier?.id || `${conditionId}-${index + 1}`),
        conditionId,
        operator,
        value: Math.abs(truncated),
      };
    })
    .filter(Boolean);
}

const GATHERING_TOOL_BREAKAGE_MODES = new Set([
  'limitedUses',
  'breakageChance',
  'diceExpression',
  'immune',
]);
const GATHERING_TOOL_ON_BREAK_MODES = new Set(['destroy', 'flagBroken', 'replaceWith']);
function _normalizeToolRequirement(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  return {
    formula: typeof input.formula === 'string' ? input.formula : '',
  };
}

function _normalizeToolBreakage(input) {
  const mode = GATHERING_TOOL_BREAKAGE_MODES.has(input?.mode) ? input.mode : 'limitedUses';
  if (mode === 'limitedUses') {
    return { mode, maxUses: _normalizeNullablePositiveInteger(input?.maxUses) };
  }
  if (mode === 'breakageChance') {
    const raw = Number(input?.breakageChance);
    return { mode, breakageChance: Number.isFinite(raw) ? raw : 0 };
  }
  if (mode === 'immune') {
    // An immune tool carries no breakage fields and never breaks (issue 419).
    return { mode };
  }
  const threshold = Number(input?.threshold);
  return {
    mode,
    formula: typeof input?.formula === 'string' ? input.formula : '',
    threshold: Number.isFinite(threshold) ? threshold : 0,
  };
}

function _normalizeToolOnBreak(input) {
  const mode = GATHERING_TOOL_ON_BREAK_MODES.has(input?.mode) ? input.mode : 'destroy';
  if (mode === 'replaceWith') {
    return {
      mode,
      replacementComponentId:
        typeof input?.replacementComponentId === 'string' ? input.replacementComponentId : null,
    };
  }
  return { mode };
}

function _normalizeGatheringLibraryTool(tool = {}, randomID = _fallbackRandomID) {
  const id = String(tool.id || randomID());
  // `label` is the user-authored display override — distinct from the `name`/`img` display
  // snapshot and never written by snapshot capture/migration (issue 561, R2-2).
  const rawLabel = typeof tool.label === 'string' ? tool.label.trim() : '';
  const componentId =
    typeof tool.componentId === 'string' && tool.componentId.trim()
      ? tool.componentId.trim()
      : null;
  // First-class tool source references + display snapshot (issue 561). This is the DRAFT-PATH
  // twin of `CraftingSystemManager._normalizeTool`; the fields MUST be retained here or the
  // draft strips them (the normalizer-strips-unknown-fields trap).
  // New-name-first, legacy-name-tolerant (issue 560): accept the renamed
  // `registeredItemUuid`/`originItemUuid`/`aliasItemUuids` and the pre-rename (issue 560)
  // `sourceUuid`/`sourceItemUuid`/`fallbackItemIds`, emitting the new names.
  const originItemUuid =
    tool.originItemUuid || tool.registeredItemUuid || tool.sourceItemUuid || tool.sourceUuid || null;
  const registeredItemUuid =
    tool.registeredItemUuid || tool.originItemUuid || tool.sourceUuid || tool.sourceItemUuid || null;
  const primaryRefs = new Set(
    [registeredItemUuid, originItemUuid].filter((ref) => typeof ref === 'string' && ref.trim())
  );
  const rawAliasItemUuids = Array.isArray(tool.aliasItemUuids)
    ? tool.aliasItemUuids
    : Array.isArray(tool.fallbackItemIds)
      ? tool.fallbackItemIds
      : null;
  const aliasItemUuids = Array.isArray(rawAliasItemUuids)
    ? [
        ...new Set(
          rawAliasItemUuids
            .filter((ref) => typeof ref === 'string')
            .map((ref) => ref.trim())
            .filter((ref) => ref && !primaryRefs.has(ref))
        ),
      ]
    : [];
  return {
    id,
    label: rawLabel,
    enabled: tool.enabled !== false,
    componentId,
    name: typeof tool.name === 'string' && tool.name ? tool.name : null,
    img: typeof tool.img === 'string' && tool.img ? tool.img : null,
    registeredItemUuid,
    originItemUuid,
    aliasItemUuids,
    requirement: _normalizeToolRequirement(tool.requirement),
    breakage: _normalizeToolBreakage(tool.breakage),
    onBreak: _normalizeToolOnBreak(tool.onBreak),
  };
}

function _normalizeGatheringTask(task = {}, randomID = _fallbackRandomID) {
  const id = String(task.id || randomID());
  return {
    id,
    name: String(task.name || 'Gather'),
    description: String(task.description || ''),
    img: String(task.img || DEFAULT_GATHERING_TASK_IMG),
    enabled: task.enabled !== false,
    biomes: _normalizeGatheringTagList(task.biomes),
    weather: _normalizeGatheringConditionIdList(task.weather),
    timeOfDay: _normalizeGatheringConditionIdList(task.timeOfDay),
    itemSelectionMode: task.itemSelectionMode === 'allDrops' ? 'allDrops' : 'highestRankedDrop',
    dropRows: (Array.isArray(task.dropRows ?? task.itemDrops)
      ? (task.dropRows ?? task.itemDrops)
      : []
    ).map((row) => _normalizeGatheringDropRow(row, randomID)),
    staminaCost:
      Number.isFinite(Number(task.staminaCost)) && Number(task.staminaCost) > 0
        ? Number(task.staminaCost)
        : 0,
    staminaCostModifiers: _normalizeGatheringCharacterModifierReferences(
      task.staminaCostModifiers,
      randomID
    ),
    gatheringModifier:
      task.gatheringModifier && typeof task.gatheringModifier === 'object'
        ? _clonePlain(task.gatheringModifier)
        : null,
    timeRequirement:
      task.timeRequirement && typeof task.timeRequirement === 'object'
        ? _clonePlain(task.timeRequirement)
        : null,
    toolIds: Array.isArray(task.toolIds)
      ? task.toolIds.map((id) => String(id ?? '').trim()).filter(Boolean)
      : [],
    // Optional task-default environment (new): the precedence MIDDLE tier for
    // on-drop canvas env resolution (region auto-detect → THIS → GM dialog).
    // Coerced to a trimmed string or null (empties dropped); a stale id falls
    // through to the GM dialog at drop time rather than throwing.
    defaultEnvironmentId: (() => {
      const id =
        typeof task.defaultEnvironmentId === 'string' ? task.defaultEnvironmentId.trim() : '';
      return id || null;
    })(),
    // Preserve the resource-node config (count/depletion/respawn/depletedBehavior)
    // so authoring it on a task survives the save (the runtime reads it back to
    // seed per-env pools; canvas tokens snapshot it for per-token depletion).
    ...(normalizeNodeConfig(task.nodes) ? { nodes: normalizeNodeConfig(task.nodes) } : {}),
    // Optional per-task gathering DC override: when set it replaces the
    // system-level gathering check default DC at gather time. null = use default.
    // Guard null/''/undefined explicitly so re-normalizing a null stays null
    // (Number(null) is 0, which would otherwise become a spurious 0 override).
    dcOverride: (() => {
      const raw = task.dcOverride;
      if ([null, undefined, ''].includes(raw)) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    })(),
  };
}

function _normalizeGatheringEvent(event = {}, randomID = _fallbackRandomID) {
  return {
    id: event.id ? String(event.id) : randomID(),
    name: String(event.name || 'Event'),
    description: String(event.description || ''),
    img: String(event.img || DEFAULT_GATHERING_EVENT_IMG),
    enabled: event.enabled !== false,
    dangerTags: _normalizeGatheringTagList(event.dangerTags),
    biomes: _normalizeGatheringTagList(event.biomes),
    weather: _normalizeGatheringConditionIdList(event.weather),
    timeOfDay: _normalizeGatheringConditionIdList(event.timeOfDay),
    dropRate: Number.isFinite(Number(event.dropRate))
      ? Math.min(100, Math.max(1, Math.floor(Number(event.dropRate))))
      : 1,
    linkedSceneUuid: String(event.linkedSceneUuid || ''),
    // Accept the legacy `hazardModifier` field on read (imported or pre-1.0.0 data).
    eventModifier: (() => {
      const modifier = event.eventModifier ?? event.hazardModifier;
      return modifier && typeof modifier === 'object' ? _clonePlain(modifier) : null;
    })(),
    conditionModifiers: _normalizeGatheringDropConditionModifiers(event.conditionModifiers),
    characterModifiers: _normalizeGatheringCharacterModifierReferences(
      event.characterModifiers,
      randomID
    ),
  };
}

function _normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.max(1, Math.floor(number));
}

function _normalizeGatheringRules(rules = {}) {
  const rewardSelectionMode = GATHERING_DROP_SELECTION_MODES.has(rules?.rewardSelectionMode)
    ? rules.rewardSelectionMode
    : DEFAULT_GATHERING_RULES.rewardSelectionMode;
  // Accept the legacy hazard-schema rule keys/values on read (imported or
  // pre-1.0.0-migration gathering config) so the intended rules survive until the
  // startup migration rewrites them.
  const rawEventSelectionMode = rules?.eventSelectionMode ?? rules?.hazardSelectionMode;
  const eventSelectionMode = GATHERING_DROP_SELECTION_MODES.has(rawEventSelectionMode)
    ? rawEventSelectionMode
    : DEFAULT_GATHERING_RULES.eventSelectionMode;
  const rawEventPolicy = (() => {
    const value = rules?.eventPolicy ?? rules?.hazardPolicy;
    if (value === 'successWithHazard') return 'successWithEvent';
    if (value === 'failureWithHazard') return 'failureWithEvent';
    return value;
  })();
  const eventPolicy = GATHERING_EVENT_POLICIES.has(rawEventPolicy)
    ? rawEventPolicy
    : DEFAULT_GATHERING_RULES.eventPolicy;
  const toolBreakagePolicy = GATHERING_TOOL_BREAKAGE_POLICIES.has(rules?.toolBreakagePolicy)
    ? rules.toolBreakagePolicy
    : DEFAULT_GATHERING_RULES.toolBreakagePolicy;
  const biomeModifierAggregation = GATHERING_BIOME_MODIFIER_AGGREGATIONS.has(
    rules?.biomeModifierAggregation
  )
    ? rules.biomeModifierAggregation
    : DEFAULT_GATHERING_RULES.biomeModifierAggregation;
  const blindCandidateGate = GATHERING_BLIND_CANDIDATE_GATES.has(rules?.blindCandidateGate)
    ? rules.blindCandidateGate
    : DEFAULT_GATHERING_RULES.blindCandidateGate;
  const revealPolicy = GATHERING_REVEAL_POLICIES.has(rules?.revealPolicy)
    ? rules.revealPolicy
    : DEFAULT_GATHERING_RULES.revealPolicy;
  const revealScope = GATHERING_REVEAL_SCOPES.has(rules?.revealScope)
    ? rules.revealScope
    : DEFAULT_GATHERING_RULES.revealScope;
  const rawEventVisibility = rules?.eventVisibility ?? rules?.hazardVisibility;
  const eventVisibility = GATHERING_EVENT_VISIBILITIES.has(rawEventVisibility)
    ? rawEventVisibility
    : DEFAULT_GATHERING_RULES.eventVisibility;
  // Generalized drop-modifier mode (character + condition modifiers). Read the
  // new key first, then fall back to the legacy `characterModifierMode`
  // (issue 324 was never released — read-time compat, not a migration), then the
  // default. Never emit the legacy key.
  const dropModifierMode = GATHERING_DROP_MODIFIER_MODES.has(rules?.dropModifierMode)
    ? rules.dropModifierMode
    : GATHERING_DROP_MODIFIER_MODES.has(rules?.characterModifierMode)
      ? rules.characterModifierMode
      : DEFAULT_GATHERING_RULES.dropModifierMode;
  return {
    rewardSelectionMode,
    rewardLimit: _normalizePositiveInteger(rules?.rewardLimit, DEFAULT_GATHERING_RULES.rewardLimit),
    eventSelectionMode,
    eventLimit: _normalizePositiveInteger(
      rules?.eventLimit ?? rules?.hazardLimit,
      DEFAULT_GATHERING_RULES.eventLimit
    ),
    eventPolicy,
    toolBreakagePolicy,
    biomeModifierAggregation,
    blindCandidateGate,
    revealPolicy,
    revealScope,
    eventVisibility,
    dropModifierMode,
  };
}

function _normalizeGatheringConfig(raw = {}, randomID = _fallbackRandomID) {
  // Top-level vocabularies are normalised into the same { id, label, icon, colorToken }
  // shape that per-system vocabularies use, so the Svelte fallback path (which
  // reads top-level when a system has no per-system override) renders capitalised
  // labels and per-biome colour tokens instead of bare lowercase ids. The
  // normalisers below accept either bare strings or already-normalised records,
  // so persisted data of either shape (and re-normalisation on save) roundtrips
  // safely. `danger` stays as a bare string list because no UI surface renders
  // it directly today.
  const vocabularies = {
    biomes: _seedGatheringVocabularyOptions(
      'biomes',
      raw?.vocabularies?.biomes,
      DEFAULT_GATHERING_VOCABULARIES.biomes
    ),
    danger: _seedGatheringVocabulary(
      raw?.vocabularies?.danger,
      DEFAULT_GATHERING_VOCABULARIES.danger
    ),
    weather: _seedGatheringConditionOptions(
      'weather',
      raw?.vocabularies?.weather,
      DEFAULT_GATHERING_VOCABULARIES.weather
    ),
    timeOfDay: _seedGatheringConditionOptions(
      'timeOfDay',
      raw?.vocabularies?.timeOfDay,
      DEFAULT_GATHERING_VOCABULARIES.timeOfDay
    ),
  };
  const weather =
    _normalizeGatheringConditionId(raw?.conditions?.weather) ||
    DEFAULT_GATHERING_CONDITIONS.weather;
  const timeOfDay =
    _normalizeGatheringConditionId(raw?.conditions?.timeOfDay) ||
    DEFAULT_GATHERING_CONDITIONS.timeOfDay;
  const systems = {};
  for (const [systemId, systemConfig] of Object.entries(raw?.systems || {})) {
    systems[String(systemId)] = {
      rules: _normalizeGatheringRules(systemConfig?.rules),
      conditions: _normalizeGatheringSystemConditions(systemConfig?.conditions, {
        vocabularies,
        conditions: { weather, timeOfDay },
      }),
      vocabularies: _normalizeGatheringSystemVocabularies(systemConfig?.vocabularies, vocabularies),
      tasks: (Array.isArray(systemConfig?.tasks) ? systemConfig.tasks : []).map((task) =>
        _normalizeGatheringTask(task, randomID)
      ),
      tools: (Array.isArray(systemConfig?.tools) ? systemConfig.tools : []).map((tool) =>
        _normalizeGatheringLibraryTool(tool, randomID)
      ),
      // Accept the legacy `hazards` collection on read (imported or pre-1.0.0 config).
      events: (Array.isArray(systemConfig?.events)
        ? systemConfig.events
        : Array.isArray(systemConfig?.hazards)
          ? systemConfig.hazards
          : []
      ).map((event) => _normalizeGatheringEvent(event, randomID)),
      characterModifiers: (Array.isArray(systemConfig?.characterModifiers)
        ? systemConfig.characterModifiers
        : []
      )
        .map((entry) => _normalizeGatheringCharacterModifier(entry, randomID))
        .filter(Boolean),
      // Preserve the economy block (stamina/nodes limitation flags + stamina
      // config) so views can read the active flags reactively. Owned/normalized
      // by the service.
      ...(systemConfig?.economy ? { economy: _clonePlain(systemConfig.economy) } : {}),
    };
  }
  return {
    vocabularies,
    conditions: {
      weather: weather || DEFAULT_GATHERING_CONDITIONS.weather,
      timeOfDay: timeOfDay || DEFAULT_GATHERING_CONDITIONS.timeOfDay,
    },
    systems,
  };
}

function _normalizeGatheringConditionSetting(kind, raw = {}, fallback = {}) {
  const fallbackValues =
    fallback?.vocabularies?.[kind] || DEFAULT_GATHERING_VOCABULARIES[kind] || [];
  const enabled = raw?.enabled !== false;
  const explicitValues = Array.isArray(raw?.values);
  const normalizedValues = explicitValues
    ? _normalizeGatheringConditionOptions(kind, raw.values)
    : _seedGatheringConditionOptions(kind, raw?.values, fallbackValues);
  const values =
    normalizedValues.length > 0 || !enabled
      ? normalizedValues
      : _normalizeGatheringConditionOptions(kind, fallbackValues);
  const fallbackCurrent =
    _normalizeGatheringConditionId(fallback?.conditions?.[kind]) ||
    DEFAULT_GATHERING_CONDITIONS[kind];
  const requestedCurrent = _normalizeGatheringConditionId(raw?.current) || fallbackCurrent;
  const valueIds = values.map((option) => option.id);
  return {
    enabled,
    current: valueIds.includes(requestedCurrent)
      ? requestedCurrent
      : values[0]?.id || DEFAULT_GATHERING_CONDITIONS[kind],
    values,
  };
}

function _normalizeGatheringSystemConditions(raw = {}, fallback = {}) {
  return {
    weather: _normalizeGatheringConditionSetting('weather', raw?.weather, fallback),
    timeOfDay: _normalizeGatheringConditionSetting('timeOfDay', raw?.timeOfDay, fallback),
  };
}

function _escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]
  );
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
    environmentValidationState: null,
  };
}

function _emptyTravelState() {
  return {
    travelParties: [],
    selectedPartyId: '',
    travelSaving: false,
    travelError: null,
    travelFieldErrors: {},
    selectedSystemRealms: [],
    actorOptions: [],
  };
}

/**
 * Map a thrown party/realm store error to inline field errors plus a summary.
 *
 * The party store emits a single COMPOSITE uniqueness message
 * (`Actor "<uuid>" is associated with more than one enabled party`) for both
 * member and travel-actor conflicts, so the field a duplicate-actor error
 * belongs to cannot be inferred from the message text. Instead the caller
 * passes the operation's `fieldContext` (the control whose mutator was invoked)
 * and the uniqueness violation is routed there. Errors raised outside an
 * actor-association context fall through to the summary only.
 *
 * @param {*} err
 * @param {(key: string, data?: object) => string} [localizeFn]
 * @param {('travelActor'|'members'|null)} [fieldContext] control that triggered the operation
 * @returns {{ travelError: string|null, travelFieldErrors: Record<string, string> }}
 */
function _travelErrorState(err, localizeFn = null, fieldContext = null) {
  if (!err) return { travelError: null, travelFieldErrors: {} };
  const errors = Array.isArray(err?.errors) ? err.errors : [];
  const fieldErrors = {};
  if (fieldContext === 'travelActor' || fieldContext === 'members') {
    const hasUniquenessViolation = errors.some((message) =>
      String(message).toLowerCase().includes('more than one enabled party')
    );
    if (hasUniquenessViolation) {
      if (fieldContext === 'travelActor') {
        fieldErrors.travelActor =
          localizeFn?.('FABRICATE.Admin.Manager.Travel.DuplicateTravelActor') ||
          'This travel actor is already used by another enabled party.';
      } else {
        fieldErrors.members =
          localizeFn?.('FABRICATE.Admin.Manager.Travel.DuplicateMember') ||
          'This actor already belongs to another enabled party.';
      }
    }
  }
  const summary =
    errors.length > 0
      ? errors.join('; ')
      : err?.message ||
        localizeFn?.('FABRICATE.Admin.Manager.Travel.Error') ||
        'Travel update failed.';
  return { travelError: summary, travelFieldErrors: fieldErrors };
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
    return err.errors
      .map((error) => (typeof error === 'string' ? error : error?.message))
      .filter(Boolean);
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
  const key =
    count === 1
      ? 'FABRICATE.Admin.Environments.ValidationSummaryOne'
      : 'FABRICATE.Admin.Environments.ValidationSummary';
  return (
    localizeFn?.(key, { count }) ||
    (count === 1
      ? 'Resolve 1 validation issue before saving.'
      : `Resolve ${count} validation issues before saving.`)
  );
}

function _buildEnvironmentValidationState(err, draft, localizeFn, attempt) {
  const messages = _environmentValidationMessages(err);
  if (messages.length === 0) return null;

  const structuredErrors = Array.isArray(err?.fieldErrors) ? err.fieldErrors : [];
  const inferenceContext = _createEnvironmentValidationInferenceContext();
  const errors = messages.map((message, index) => {
    const structured = structuredErrors[index] || {};
    const inferred = _inferEnvironmentValidationTarget(message, draft, inferenceContext);
    const path =
      structured.path || structured.fieldPath || structured.field || inferred?.path || null;
    const taskId = structured.taskId || inferred?.taskId || null;
    const fieldSelector = structured.fieldSelector || _fieldSelectorForPath(path);
    return {
      message,
      path,
      taskId,
      fieldSelector,
      id: path
        ? `environment-validation-${_domIdFromPath(path)}-${index}`
        : `environment-validation-${index}`,
    };
  });

  return {
    summary: _validationSummary(errors.length, localizeFn),
    errors,
    firstInvalidField: errors.find((error) => error.fieldSelector) || errors[0] || null,
    attempt,
  };
}

function _createEnvironmentValidationInferenceContext() {
  return {
    groupNameOccurrences: new Map(),
  };
}

function _inferEnvironmentValidationTarget(
  message,
  draft,
  context = _createEnvironmentValidationInferenceContext()
) {
  const task = _findTaskForValidationMessage(message, draft);
  const lower = String(message || '').toLowerCase();

  if (/at least one task before it can be enabled/.test(lower)) return { path: 'enabled' };
  if (/selection requires|selectionmode/.test(lower)) return { path: 'environment.selectionMode' };
  if (/craftingsystemid/.test(lower)) return { path: 'environment.craftingSystemId' };

  if (!task) return null;
  const prefix = `task.${task.id}`;

  if (/routed resolution requires resultselection|resultselection\.provider/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.resultSelection.provider` };
  }

  if (/visibility gate requires formula and threshold/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.visibility.formula` };
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

  const resultGroupName = message.match(/result group "([^"]+)"/)?.[1];
  if (resultGroupName) {
    const group = _resolveResultGroupValidationTarget({
      task,
      groupName: resultGroupName,
      duplicate: / duplicates "/i.test(message),
      context,
    });
    return {
      taskId: task.id,
      path: group ? `${prefix}.resultGroups.${group.id}.name` : `${prefix}.resultGroups`,
    };
  }
  if (/result groups require names/.test(lower)) {
    const group = _resolveResultGroupValidationTarget({
      task,
      groupName: '',
      context,
    });
    return {
      taskId: task.id,
      path: group ? `${prefix}.resultGroups.${group.id}.name` : `${prefix}.resultGroups`,
    };
  }
  if (/requires at least one result group|exactly one result group/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.resultGroups` };
  }
  if (/progressive result group requires at least one result/.test(lower)) {
    const group = Array.isArray(task.resultGroups) ? task.resultGroups[0] : null;
    return {
      taskId: task.id,
      path: group ? `${prefix}.resultGroups.${group.id}.results` : `${prefix}.resultGroups`,
    };
  }

  const resultId = message.match(/progressive result "([^"]+)"/)?.[1];
  if (resultId) return { taskId: task.id, path: `${prefix}.result.${resultId}.componentId` };

  return { taskId: task.id, path: `${prefix}.name` };
}

function _resolveResultGroupValidationTarget({ task, groupName, duplicate = false, context }) {
  const groups = Array.isArray(task?.resultGroups) ? task.resultGroups : [];
  const normalizedName = _normalizeValidationGroupName(groupName);
  const matches = groups.filter(
    (group) => _normalizeValidationGroupName(group?.name) === normalizedName
  );
  if (matches.length === 0) return null;

  const occurrenceKey = `${task?.id || 'task'}:${duplicate ? 'duplicate' : 'named'}:${normalizedName}`;
  const previous = context.groupNameOccurrences.get(occurrenceKey);
  const defaultIndex = duplicate && matches.length > 1 ? 1 : 0;
  const index = previous === undefined ? defaultIndex : previous + 1;
  context.groupNameOccurrences.set(occurrenceKey, index);
  return matches[Math.min(index, matches.length - 1)] || matches[0];
}

function _normalizeValidationGroupName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function _findTaskForValidationMessage(message, draft) {
  const tasks = Array.isArray(draft?.tasks) ? draft.tasks : [];
  const taskName = String(message || '').match(/Task "([^"]+)"/)?.[1];
  if (taskName) {
    return tasks.find((task) => task?.name === taskName) || tasks[0] || null;
  }
  return tasks[0] || null;
}

function _domIdFromPath(path) {
  return String(path || 'field').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function _taskCopyName(name, localizeFn) {
  const sourceName = String(name || '').trim() || 'Gather';
  return (
    localizeFn?.('FABRICATE.Admin.Environments.TaskCopySuffix', { name: sourceName }) ||
    `${sourceName} Copy`
  );
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
    recipes = recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) || (r.description || '').toLowerCase().includes(lower)
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

  const prepared = recipes.map((recipe) => {
    const display = _buildRecipeBrowserDisplay(recipe);
    // Book membership (many-to-many): the books that contain this recipe. The
    // legacy scalar `recipeItemId`/name/img reflect the FIRST containing book.
    const containingDefinitions = _recipeItemDefinitionsContaining(
      selectedSystem.recipeItemDefinitions,
      recipe
    );
    const recipeItemIds = containingDefinitions.map((def) => String(def.id));
    const recipeItemDefinition = containingDefinitions[0] || null;
    const recipeItemId = recipeItemDefinition ? String(recipeItemDefinition.id) : '';
    // Plain authoring data for the recipe editor's step-mode UI. Sourced from
    // toJSON() so step / top-level shapes match Recipe._normalizeStep exactly.
    // The multi-step editor reads `steps` (and migrates the top-level fields into
    // the seeded first step); without these the editor cannot detect or author steps.
    const raw = recipe.toJSON();
    return {
      id: recipe.id,
      name: recipe.name,
      img: recipe.img,
      description: display.description,
      category: normalizeRecipeCategory(recipe.category),
      steps: Array.isArray(raw.steps) ? raw.steps : [],
      ingredientSets: Array.isArray(raw.ingredientSets) ? raw.ingredientSets : [],
      resultGroups: Array.isArray(raw.resultGroups) ? raw.resultGroups : [],
      // Result routing: the per-recipe routing mode (provider) and check-tier
      // reference live at the top level and MUST be projected, or the editor
      // seeds them empty and they revert on reload (the routing-mode persistence
      // bug). The resultGroups/ingredientSets arrays above already carry their
      // own routing fields (checkOutcomeIds / resultGroupId).
      resultSelection: raw.resultSelection || null,
      outcomeRouting: raw.outcomeRouting || null,
      checkTierId: raw.checkTierId ?? null,
      minSuccessOutcomeId: raw.minSuccessOutcomeId ?? null,
      complex: raw.complex === true,
      toolIds: Array.isArray(raw.toolIds) ? raw.toolIds : [],
      visibilitySummary: _visibilitySummary(recipe),
      // The raw `{ restricted, allowedUserIds }` object (display string aside) so
      // the per-recipe restriction editor can seed, stage, and save an edit. Without
      // it `recipeDraft.visibility` is undefined and edits cannot be persisted.
      visibility: raw.visibility || null,
      // Per-recipe access grants (restricted visibility mode): the normalized
      // `{ characterIds, playerIds }` snapshot the Access tab seeds and saves, plus
      // a `{ characterCount, playerCount }` summary the recipe rows render as the
      // "N char · N player" grant chip (or "No access" when both are 0).
      access: {
        characterIds: Array.isArray(raw.access?.characterIds) ? raw.access.characterIds : [],
        playerIds: Array.isArray(raw.access?.playerIds) ? raw.access.playerIds : [],
      },
      accessSummary: {
        characterCount: Array.isArray(raw.access?.characterIds) ? raw.access.characterIds.length : 0,
        playerCount: Array.isArray(raw.access?.playerIds) ? raw.access.playerIds.length : 0,
      },
      locked: recipe.locked === true,
      enabled: recipe.enabled !== false,
      // Derived (no stored flag): a shell missing ingredient sets / result groups is
      // persistable but not craftable. Surfaced as an "Incomplete" chip in the browser.
      incomplete: _isRecipeIncomplete(recipe),
      // Book membership: all books containing this recipe (many-to-many), plus the
      // first book's id/name/img/source for legacy single-link consumers.
      recipeItemIds,
      recipeItemId,
      recipeItemName: recipeItemDefinition?.name || '',
      recipeItemImg: recipeItemDefinition?.img || '',
      recipeItemSourceUuid: recipeItemDefinition?.originItemUuid || '',
      // The row's check pill: the system check's DC resolved through this recipe's
      // `checkTierId`, or `{ kind: 'none' }` when the system has no USABLE check
      // (usable iff an authored rollFormula exists — "checks enabled" is not the
      // same thing). The row cannot derive this (issue 643 §9).
      checkSummary: _buildRecipeCheckSummary(selectedSystem, recipe),
      isSimple: display.isSimple,
      stepCount: display.stepCount,
      resultGroupCount: display.resultGroupCount,
      resultItemCount: display.resultItemCount,
      ingredientCount: display.ingredientCount,
      toolCount: display.toolCount,
      structureKey: display.structureKey,
      structureLabel: display.structureLabel,
      requirementsPreview: display.requirementsPreview,
      ingredients: new Array(display.ingredientCount),
      tools: new Array(display.toolCount),
    };
  });

  return { recipes: prepared, recipeCategories, showVisibilitySummary };
}

/**
 * Build the item cards list for the items tab.
 * Mirrors _prepareContext item logic from RecipeManagerApp.
 */
function _sourceUuidForItemCard(item) {
  return item?.originItemUuid || item?.registeredItemUuid || '';
}

function _sourceOriginForUuid(uuid, sourceMissing = false) {
  if (sourceMissing) {
    return {
      sourceOrigin: 'missing',
      sourceOriginLabel: 'Missing',
    };
  }
  if (!uuid) {
    return {
      sourceOrigin: 'unknown',
      sourceOriginLabel: 'Unknown',
    };
  }
  if (uuid.startsWith('Compendium.')) {
    return {
      sourceOrigin: 'compendium',
      sourceOriginLabel: 'Compendium',
    };
  }
  if (uuid.startsWith('Item.')) {
    return {
      sourceOrigin: 'world',
      sourceOriginLabel: 'Items Directory',
    };
  }
  return {
    sourceOrigin: 'unknown',
    sourceOriginLabel: 'Unknown',
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

// ---------------------------------------------------------------------------
// Books & Scrolls recipe-item projection (issue 511)
//
// The library surface reads each recipe item enriched with its resolved
// game-world item (name/img/type), its linked recipes (reverse ref via
// `recipe.recipeItemId`), and how many world actors have learned any of those
// recipes. Resolution touches `fromUuid`, so it is done ONCE per refresh and
// batched with `Promise.all` (never inside a Svelte `$derived`/`$effect`).
// ---------------------------------------------------------------------------

// Human label for a recipe item whose linked game-world item has not resolved
// yet (or was deleted) — the trailing UUID segment, matching the manager's own
// `_labelFromUuid`.
function _recipeItemLabelFromUuid(uuid) {
  if (!uuid) return '';
  const parts = String(uuid).split('.');
  return parts.at(-1) || '';
}

// Best-effort Book / Scroll / Tome label inferred from the linked item's type
// and name. Defaults to 'Book' when nothing more specific is detectable.
// Recipe-item "type" is derived purely from how many recipes it grants, so the
// Books & Scrolls Type pill/filter is diagnostic: a multi-recipe tome is a "Book",
// a single-recipe item is a "Scroll", and an item with no recipes linked yet is
// "Incomplete" (distinct from the `linkMissing` broken-link state). Display strings
// mirror the existing un-localised `derivedType`.
function _recipeItemTypeFromRecipeCount(count) {
  const n = Number(count) || 0;
  if (n >= 2) return 'Book';
  if (n === 1) return 'Scroll';
  return 'Incomplete';
}

// The recipe-item definitions of a system that CONTAIN a recipe (issue 511
// many-to-many). Canonical read is each definition's `recipeIds[]`; only a system
// with no membership authored yet falls back to the recipe's book-only `recipeItemId`.
function _recipeItemDefinitionsContaining(definitions, recipe) {
  const defs = Array.isArray(definitions) ? definitions : [];
  const rid = String(recipe?.id || '');
  const byMembership = defs.filter((def) =>
    (Array.isArray(def.recipeIds) ? def.recipeIds : []).some((id) => String(id) === rid)
  );
  if (byMembership.length > 0) return byMembership;
  const anyMigrated = defs.some((def) => Array.isArray(def.recipeIds) && def.recipeIds.length > 0);
  if (anyMigrated) return [];
  const recipeItemId = String(recipe?.recipeItemId || '').trim();
  return recipeItemId ? defs.filter((def) => String(def.id) === recipeItemId) : [];
}

// Synchronous fallback projection painted immediately in refresh phase 1. The
// resolved name/img/type, linked `recipes[]`, and `learnedByCount` are filled in
// asynchronously by `_enrichRecipeItemLibrary` before the phase-2 publish.
function _projectRecipeItemDefinitionSync(def) {
  const originItemUuid = def?.originItemUuid || '';
  return {
    id: def?.id || '',
    originItemUuid,
    img: def?.img || '',
    description: def?.description || '',
    enabled: def?.enabled !== false,
    // Book membership (issue 511 many-to-many) — the recipe ids this book contains.
    recipeIds: Array.isArray(def?.recipeIds) ? def.recipeIds.map((id) => String(id)) : [],
    caps: _clonePlain(def?.caps || {}),
    resolvedName: def?.name || _recipeItemLabelFromUuid(originItemUuid) || 'Recipe item',
    resolvedImg: def?.img || 'icons/svg/item-bag.svg',
    derivedType: _recipeItemTypeFromRecipeCount(0),
    linkMissing: false,
    recipes: [],
    learnedByCount: 0,
  };
}

// Resolve one linked game-world item. Returns `{ doc, missing }`; `missing` is
// true only when a uuid is present but cannot be resolved (deleted/broken link).
async function _resolveRecipeItemSource(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== 'function') return { doc: null, missing: false };
  try {
    const doc = await globalThis.fromUuid(uuid);
    return { doc: doc || null, missing: !doc };
  } catch (_) {
    return { doc: null, missing: true };
  }
}

// Build a `recipeId -> Set(actorId)` index of learned recipes across every world
// actor (best-effort; `game.*` may be unavailable in headless contexts → empty).
function _buildLearnedRecipeActorIndex() {
  const index = new Map();
  const raw = globalThis.game?.actors;
  const actors = Array.isArray(raw?.contents)
    ? raw.contents
    : Array.isArray(raw)
      ? raw
      : typeof raw?.[Symbol.iterator] === 'function'
        ? [...raw]
        : [];
  for (const actor of actors) {
    const learned = actor?.flags?.fabricate?.learnedRecipes;
    if (!learned || typeof learned !== 'object') continue;
    const actorId = actor.id || actor._id || '';
    for (const recipeId of Object.keys(learned)) {
      if (!index.has(recipeId)) index.set(recipeId, new Set());
      index.get(recipeId).add(actorId);
    }
  }
  return index;
}

// Enrich the synchronously-projected recipe items with async-resolved
// name/img/type plus their derived `recipes[]` and `learnedByCount`. Called once
// per refresh from the async phase; `fromUuid` resolution is batched.
async function _enrichRecipeItemLibrary(projectedItems, recipes) {
  const items = Array.isArray(projectedItems) ? projectedItems : [];
  if (items.length === 0) return [];

  const recipeList = Array.isArray(recipes) ? recipes : [];
  const recipeById = new Map();
  // Legacy reverse-ref index — fallback for definitions with no `recipeIds` yet.
  const recipesByItemId = new Map();
  for (const recipe of recipeList) {
    recipeById.set(String(recipe?.id), recipe);
    const key = String(recipe?.recipeItemId || '');
    if (!key) continue;
    if (!recipesByItemId.has(key)) recipesByItemId.set(key, []);
    recipesByItemId.get(key).push(recipe);
  }
  const toRecipeRef = (recipe) => ({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category || '',
  });

  const actorIndex = _buildLearnedRecipeActorIndex();
  const resolved = await Promise.all(
    items.map((item) => _resolveRecipeItemSource(item.originItemUuid))
  );

  return items.map((item, index) => {
    const { doc, missing } = resolved[index];
    // Canonical membership: the book's `recipeIds`. Fall back to the legacy reverse
    // ref only for a definition that carries none yet (un-migrated).
    const memberIds = Array.isArray(item.recipeIds) ? item.recipeIds : [];
    const linkedRecipes =
      memberIds.length > 0
        ? memberIds.map((id) => recipeById.get(String(id))).filter(Boolean).map(toRecipeRef)
        : (recipesByItemId.get(String(item.id)) || []).map(toRecipeRef);
    const learnedActors = new Set();
    for (const recipe of linkedRecipes) {
      const actorsForRecipe = actorIndex.get(recipe.id);
      if (actorsForRecipe) for (const actorId of actorsForRecipe) learnedActors.add(actorId);
    }
    return {
      ...item,
      resolvedName: doc?.name || item.resolvedName,
      resolvedImg: doc?.img || item.resolvedImg,
      derivedType: _recipeItemTypeFromRecipeCount(linkedRecipes.length),
      linkMissing: missing,
      recipes: linkedRecipes,
      learnedByCount: learnedActors.size,
    };
  });
}

async function _buildItemCards(
  systemManager,
  selectedSystem,
  itemSearchTerm,
  showTags,
  showEssences,
  essenceDefinitionById
) {
  if (!selectedSystem) return [];
  const showSalvage = selectedSystem.features?.salvage === true;
  const items = systemManager.getItems(selectedSystem.id, itemSearchTerm);
  return Promise.all(
    items.map(async (item) => {
      const description = _plainTextDescription(item.description);
      const registeredItemUuidDisplay = _sourceUuidForItemCard(item);
      const sourceMissing = await _sourceMissingForUuid(registeredItemUuidDisplay);
      const sourceOrigin = _sourceOriginForUuid(registeredItemUuidDisplay, sourceMissing);
      return {
        ...item,
        img: item.img || 'icons/svg/item-bag.svg',
        description,
        hasDescription: description.length > 0,
        tags: showTags ? item.tags || [] : [],
        essences: showEssences
          ? Object.entries(item.essences || {}).map(([id, quantity]) => ({
              id,
              name: essenceDefinitionById.get(id)?.name || id,
              icon: essenceDefinitionById.get(id)?.icon || 'fas fa-mortar-pestle',
              quantity,
            }))
          : [],
        registeredItemUuidDisplay,
        hasRegisteredItemUuid: Boolean(registeredItemUuidDisplay),
        sourceMissing,
        ...sourceOrigin,
        salvageSummary: _buildSalvageSummary(item, showSalvage),
        showTags,
        showEssences,
      };
    })
  );
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
    return essences.some((entry) => entry?.id === essenceId && Number(entry.quantity) > 0);
  }
  return Number(essences?.[essenceId]) > 0;
}

function _essenceUsageItems(essenceId, managedItems) {
  return managedItems
    .filter((item) => _itemUsesEssence(item, essenceId))
    .map((item) => ({
      id: item.id,
      name: item.name || item.id,
      img: item.img || 'icons/svg/item-bag.svg',
    }));
}

function _essenceSourceState({ sourceComponentId, sourceItemUuid, associatedItem }) {
  if (!sourceComponentId && !sourceItemUuid) return 'none';
  if (!associatedItem) return 'stale';
  if (associatedItem.originItemUuid || associatedItem.registeredItemUuid || sourceItemUuid)
    return 'linked';
  return 'missing';
}

function _sourceFieldsForEssenceSelection(system, sourceComponentId, sourceItemUuid = null) {
  const managedItemOptions = _buildManagedItemOptions(_getManagedItems(system));
  const managedItemById = new Map(managedItemOptions.map((item) => [item.id, item]));
  if (sourceComponentId) {
    const associatedItem = managedItemById.get(sourceComponentId) || null;
    return {
      sourceComponentId,
      sourceItemUuid: associatedItem?.originItemUuid || associatedItem?.registeredItemUuid || null,
      associatedSystemItemId: sourceComponentId,
    };
  }
  if (sourceItemUuid) {
    const associatedItem = managedItemOptions.find(
      (item) => item.originItemUuid === sourceItemUuid || item.registeredItemUuid === sourceItemUuid
    );
    return {
      sourceComponentId: associatedItem?.id || null,
      sourceItemUuid,
      associatedSystemItemId: associatedItem?.id || null,
    };
  }
  return {
    sourceComponentId: null,
    sourceItemUuid: null,
    associatedSystemItemId: null,
  };
}

function _buildEssenceCards(essenceDefinitions, managedItems, managedItemOptions) {
  const managedItemById = new Map(managedItemOptions.map((item) => [item.id, item]));
  return essenceDefinitions.map((def) => {
    const sourceComponentId = _sourceComponentIdForEssence(def, managedItemById);
    const sourceItem = managedItemById.get(sourceComponentId) || null;
    const associatedItem = sourceItem
      ? { id: sourceItem.id, name: sourceItem.name, img: sourceItem.img }
      : null;
    const sourceItemUuid =
      def.sourceItemUuid || sourceItem?.originItemUuid || sourceItem?.registeredItemUuid || null;
    const componentUsageCount = _essenceUsageCount(def.id, managedItems);
    const componentUsageItems = _essenceUsageItems(def.id, managedItems);
    const sourceState = _essenceSourceState({
      sourceComponentId,
      sourceItemUuid,
      associatedItem: sourceItem,
    });
    return {
      ...def,
      icon: normalizeEssenceIcon(def.icon || DEFAULT_ESSENCE_ICON),
      sourceComponentId,
      sourceItemUuid,
      associatedSystemItemId: sourceComponentId || null,
      associatedItem,
      associatedItemName: associatedItem?.name || null,
      sourceName:
        associatedItem?.name ||
        (sourceState === 'stale' ? sourceComponentId || sourceItemUuid : ''),
      sourceState,
      componentUsageCount,
      componentUsageItems,
      deleteBlocked: componentUsageCount > 0,
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
    .replace(/&#39;|&apos;/gi, "'")
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
      .map((entry) => _descriptionTextCandidate(entry, seen))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (valueType !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);

  for (const key of [
    'value',
    'enriched',
    'html',
    'text',
    'content',
    'short',
    'long',
    'unidentified',
    'chat',
  ]) {
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
  componentTagOptions,
  essenceDefinitions,
  availableScriptMacros,
  sceneOptions
) {
  if (!selectedSystem) return null;

  const showTags = true;
  const showEssences = selectedSystem.features?.essences === true;

  const listMode = selectedSystem.recipeVisibility?.listMode || 'global';
  const showRecipeVisibilityKnowledgeOptions = listMode === 'knowledge';
  const showRecipeVisibilityPlayerNote = listMode === 'player';

  // Flat system-level visibility strategy (issue 511, PR-B). `visibilityMode`
  // gates the whole Crafting surface; `craftingEffect` is the matrix contract
  // consumed by the Settings effect panel and nav gating alike.
  const visibilityMode = selectedSystem.visibilityMode || 'knowledge';

  return {
    id: selectedSystem.id,
    name: selectedSystem.name,
    description: selectedSystem.description,
    enabled: selectedSystem.enabled !== false,
    resolutionMode: selectedSystem.resolutionMode || 'simple',
    visibilityMode,
    craftingEffect: craftingEffect(visibilityMode),

    features: {
      recipeCategories: true,
      itemTags: true,
      essences: selectedSystem.features?.essences === true,
      multiStepRecipes: selectedSystem.features?.multiStepRecipes === true,
      propertyMacros: selectedSystem.features?.propertyMacros === true,
      craftingChecks: selectedSystem.features?.craftingChecks === true,
      outcomeRouting: selectedSystem.features?.outcomeRouting === true,
      effectTransfer: selectedSystem.features?.effectTransfer === true,
      gathering: selectedSystem.features?.gathering === true,
      salvage: selectedSystem.features?.salvage === true,
    },

    categories: selectedSystem.categories || [],
    itemTags: selectedSystem.itemTags || selectedSystem.tags || [],
    essenceDefinitions,
    managedItemOptions,
    // `{ id, tags }` projection consumed only by the recipe Validation tab's
    // overlapping-requirement detection. Empty when no component carries tags →
    // the overlap check no-ops.
    componentTagOptions,
    // System-owned library Tools (canonical source). Surfaced here so the Tools
    // browser and the gathering task editor's tool picker read the system's
    // tools rather than the gathering-config copy.
    tools: Array.isArray(selectedSystem.tools)
      ? selectedSystem.tools.map((tool) => _normalizeGatheringLibraryTool(tool))
      : [],

    // System-owned character prerequisite library (issue 544). Surfaced through
    // the allowlist projection (like `tools`) so the System Settings accordion
    // and the recipe-item learning-gate picker read them.
    characterPrerequisites: normalizeCharacterPrerequisiteList(selectedSystem.characterPrerequisites),

    requirements: selectedSystem.requirements || {
      time: { enabled: false },
      currency: { enabled: false, units: [] },
    },

    craftingCheck: {
      enabled: selectedSystem.craftingCheck?.enabled === true,
      mode: selectedSystem.craftingCheck?.mode || 'passFail',
      outcomesText: Array.isArray(selectedSystem.craftingCheck?.outcomes)
        ? selectedSystem.craftingCheck.outcomes.join(', ')
        : '',
      // The structured routed config edited in the Checks editor must be surfaced
      // so the editor can read back what was persisted (otherwise it always seeds
      // empty and edits look like they never saved).
      routed: selectedSystem.craftingCheck?.routed
        ? _clonePlain(selectedSystem.craftingCheck.routed)
        : null,
      // Same rationale as `routed`: surface the simple pass/fail config so the
      // simple-mode editor (and the recipe tier dropdown) can read it back.
      simple: selectedSystem.craftingCheck?.simple
        ? _clonePlain(selectedSystem.craftingCheck.simple)
        : null,
      // Surface the progressive config too (issue 419) so the progressive editor
      // reads back its persisted checkBreakage (the deep _clonePlain preserves the
      // nested block). Previously unsurfaced, so a progressive edit seeded empty.
      progressive: selectedSystem.craftingCheck?.progressive
        ? _clonePlain(selectedSystem.craftingCheck.progressive)
        : null,
    },
    // Tool-breakage authority (issue 419): surfaced so the Tools page and the
    // check editors can read it back (NOT projected before → invisible to the UI).
    // The engine normalizer defaults unknown/missing to "toolSpecific".
    toolBreakage: {
      authority:
        selectedSystem.toolBreakage?.authority === 'checkDriven' ? 'checkDriven' : 'toolSpecific',
    },
    salvageResolutionMode: selectedSystem.salvageResolutionMode || 'simple',
    salvageCraftingCheck: {
      enabled: selectedSystem.salvageCraftingCheck?.enabled === true,
      // Surface the structured per-mode configs so the salvage Checks editors and
      // the per-component outcome-routing names can read back what was persisted
      // (otherwise they seed empty and edits look like they never saved).
      simple: selectedSystem.salvageCraftingCheck?.simple
        ? _clonePlain(selectedSystem.salvageCraftingCheck.simple)
        : null,
      routed: selectedSystem.salvageCraftingCheck?.routed
        ? _clonePlain(selectedSystem.salvageCraftingCheck.routed)
        : null,
      progressive: selectedSystem.salvageCraftingCheck?.progressive
        ? _clonePlain(selectedSystem.salvageCraftingCheck.progressive)
        : null,
    },
    // System-level gathering check. The gathering editor reads these back per
    // resolution mode (d100 has no editable config, so only progressive/routed
    // are surfaced alongside the active flag).
    gatheringCraftingCheck: {
      enabled: selectedSystem.gatheringCraftingCheck?.enabled === true,
      progressive: selectedSystem.gatheringCraftingCheck?.progressive
        ? _clonePlain(selectedSystem.gatheringCraftingCheck.progressive)
        : null,
      routed: selectedSystem.gatheringCraftingCheck?.routed
        ? _clonePlain(selectedSystem.gatheringCraftingCheck.routed)
        : null,
    },

    alchemy:
      selectedSystem.resolutionMode === 'alchemy'
        ? {
            checkMode: ['none', 'simple', 'tiered'].includes(selectedSystem.alchemy?.checkMode)
              ? selectedSystem.alchemy.checkMode
              : 'none',
            learnOnCraft: selectedSystem.alchemy?.learnOnCraft === true,
            consumeOnFail: selectedSystem.alchemy?.consumeOnFail !== false,
            showAttemptHistoryToPlayers:
              selectedSystem.alchemy?.showAttemptHistoryToPlayers !== false,
          }
        : null,

    recipeVisibility: selectedSystem.recipeVisibility || {},
    // Books & Scrolls library projection (issue 511). Painted synchronously with
    // stored name/img fallbacks; refresh() overwrites this with the async-enriched
    // shape (resolved name/img/type, derived recipes[], learnedByCount) before the
    // phase-2 publish. Never resolve `fromUuid` here — this runs synchronously.
    recipeItemDefinitions: Array.isArray(selectedSystem.recipeItemDefinitions)
      ? selectedSystem.recipeItemDefinitions.map(_projectRecipeItemDefinitionSync)
      : [],
    teaserConfig: selectedSystem.teaserConfig || {
      enabled: false,
      discoveryMode: 'threshold',
      fragments: [],
    },
    showRecipeVisibilityKnowledgeOptions,
    showRecipeVisibilityPlayerNote,

    showTags,
    showEssences,
    availableScriptMacros,
    sceneOptions,
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
  const environmentDraft = writable(null);
  const persistedEnvironmentDraft = writable(null);
  const environmentDraftDirty = writable(false);
  const environmentDraftIsNew = writable(false);
  const environmentSaving = writable(false);
  const environmentSaveError = writable(null);
  const environmentValidationState = writable(null);
  let environmentValidationAttempt = 0;
  let dirtyEnvironmentDiscardConfirmation = null;
  const toolsDraft = writable(null);
  const toolsDraftBaseline = writable(null);
  const toolsDraftSystemId = writable('');
  const toolsDraftDirty = writable(false);
  const toolsDraftDirtyToolIds = writable([]);
  const toolsDraftSaving = writable(false);
  const toolsDraftSaveError = writable(null);
  const toolsDraftSelectedToolId = writable('');
  const toolsDraftExpandedToolId = writable('');
  let dirtyToolsDraftDiscardConfirmation = null;
  const travelSelectedPartyId = writable('');
  const travelSaving = writable(false);
  const travelError = writable(null);
  const travelFieldErrors = writable({});
  let unsubscribeFabricateReady = null;
  let unsubscribeFabricateDataChanged = null;
  let unsubscribeSceneChange = null;
  let unsubscribeTravelMarkerMove = null;
  let readyRefreshScheduled = false;
  let externalRefreshScheduled = false;
  let destroyed = false;

  // --- Computed state ---
  const viewState = writable({
    systems: [],
    systemsLoading: false,
    hasSystem: false,
    selectedSystemName: '',
    selectedSystem: null,
    itemCards: [],
    essenceCards: [],
    recipes: [],
    recipeCategories: [],
    showVisibilitySummary: false,
    worldUsers: [],
    // EVERY world actor (not the player-character roster), each carrying its
    // control set. The recipe editor's context rail resolves granted character
    // ids over this list; see `src/utils/recipeAccessRoster.js`.
    accessCharacters: [],
    // The derived `evaluateSystemValidation` report for the selected system,
    // consumed by the GM system-overview view, its rail count badge, and the
    // system-blocker banner. A derived/computed view — nothing is persisted on
    // the CraftingSystem.
    systemValidation: {
      issues: [],
      counts: { critical: 0, warning: 0, info: 0, blockers: 0 },
      blocksSystem: false,
    },
    recipeSearchTerm: '',
    itemSearchTerm: '',
    graphData: { nodes: [], edges: [], width: 0, height: 0 },
    graphSearchTerm: '',
    experimentalFeaturesEnabled: services.getSetting?.('experimentalFeatures') === true,
    gatheringConfig: _normalizeGatheringConfig(
      services.getSetting?.(GATHERING_CONFIG_SETTING) || {}
    ),
    foundrySystemId:
      typeof services.getFoundrySystemId === 'function'
        ? String(services.getFoundrySystemId() || '')
        : '',
    ..._emptyEnvironmentState(false),
    ..._emptyTravelState(),
  });

  function _setEnvironmentDraftState(
    draft,
    { persistedDraft = draft, dirty = false, isNew = false, saveError = null } = {}
  ) {
    const draftClone = _clonePlain(draft);
    environmentDraft.set(draftClone);
    persistedEnvironmentDraft.set(_clonePlain(persistedDraft));
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
      saveError: null,
    });
    return _emptyEnvironmentState(canShowEnvironmentsTab, error);
  }

  function _currentEnvironmentViewPatch() {
    return {
      selectedEnvironmentId: get(selectedEnvironmentId),
      environmentDraft: _clonePlain(get(environmentDraft)),
      environmentDraftDirty: get(environmentDraftDirty),
      environmentDraftIsNew: get(environmentDraftIsNew),
      environmentSaving: get(environmentSaving),
      environmentSaveError: get(environmentSaveError),
      environmentValidationState: _clonePlain(get(environmentValidationState)),
      environmentComposition: _clonePlain(
        _buildEnvironmentCompositionViewModel(get(environmentDraft))
      ),
    };
  }

  function _patchEnvironmentViewState() {
    viewState.update((state) => ({
      ...state,
      ..._currentEnvironmentViewPatch(),
    }));
  }

  function _currentToolsDraftViewPatch() {
    return {
      toolsDraft: _clonePlain(get(toolsDraft)),
      toolsDraftBaseline: _clonePlain(get(toolsDraftBaseline)),
      toolsDraftSystemId: get(toolsDraftSystemId),
      toolsDraftDirty: get(toolsDraftDirty),
      toolsDraftDirtyToolIds: _clonePlain(get(toolsDraftDirtyToolIds)),
      toolsDraftSaving: get(toolsDraftSaving),
      toolsDraftSaveError: get(toolsDraftSaveError),
      toolsDraftSelectedToolId: get(toolsDraftSelectedToolId),
      toolsDraftExpandedToolId: get(toolsDraftExpandedToolId),
    };
  }

  function _patchToolsDraftViewState() {
    viewState.update((state) => ({
      ...state,
      ..._currentToolsDraftViewPatch(),
    }));
  }

  function _recomputeToolsDraftDirty() {
    const current = get(toolsDraft) || [];
    const baseline = get(toolsDraftBaseline) || [];
    const baselineById = new Map(baseline.map((tool) => [String(tool.id), tool]));
    const dirtyIds = [];
    for (const tool of current) {
      const id = String(tool?.id || '');
      if (!id) continue;
      const baselineTool = baselineById.get(id);
      if (!baselineTool || JSON.stringify(tool) !== JSON.stringify(baselineTool)) dirtyIds.push(id);
    }
    toolsDraftDirtyToolIds.set(dirtyIds);
    toolsDraftDirty.set(dirtyIds.length > 0);
  }

  function enterToolsDraft(systemId = get(selectedSystemId)) {
    if (!systemId) return false;
    const snapshot = _systemTools(systemId);
    toolsDraft.set(_clonePlain(snapshot));
    toolsDraftBaseline.set(_clonePlain(snapshot));
    toolsDraftSystemId.set(String(systemId));
    toolsDraftDirty.set(false);
    toolsDraftDirtyToolIds.set([]);
    toolsDraftSaveError.set(null);
    toolsDraftSelectedToolId.set(snapshot[0]?.id || '');
    toolsDraftExpandedToolId.set('');
    _patchToolsDraftViewState();
    return true;
  }

  function updateToolsDraft(mutator) {
    if (typeof mutator !== 'function') return false;
    const current = get(toolsDraft);
    if (!Array.isArray(current)) return false;
    const next = mutator(current.map((tool) => _clonePlain(tool)));
    if (!Array.isArray(next)) return false;
    toolsDraft.set(next);
    _recomputeToolsDraftDirty();
    _patchToolsDraftViewState();
    return true;
  }

  function addToolToDraft(initialPatch = {}) {
    const patch = initialPatch && typeof initialPatch === 'object' ? initialPatch : {};
    const created = _normalizeGatheringLibraryTool({ ...patch, id: _randomID() }, _randomID);
    const success = updateToolsDraft((list) => [...list, created]);
    if (success) {
      toolsDraftSelectedToolId.set(created.id);
      toolsDraftExpandedToolId.set(created.id);
      _patchToolsDraftViewState();
    }
    return success ? created : null;
  }

  /**
   * Register a first-class item-sourced Tool from a dropped Item uuid (issue 561, B1). Unlike
   * `addToolToDraft({ componentId })` (which links a managed component), this creates a tool
   * with `componentId: null` carrying its OWN source refs + `name`/`img` snapshot and stamps
   * the durable `roles[systemId].toolId` on the source Item — no component import required.
   * Persists directly through the manager (mirroring the persisted-tool delete path), then
   * seeds the new tool into the draft + baseline so it renders immediately and is not dirty.
   *
   * @param {string} itemUuid
   * @returns {Promise<boolean>}
   */
  async function addToolFromUuidToDraft(itemUuid) {
    const uuid = String(itemUuid || '');
    if (!uuid) return false;
    const systemId = String(get(toolsDraftSystemId) || get(selectedSystemId) || '');
    if (!systemId) return false;
    const systemManager = services.getCraftingSystemManager?.();
    if (typeof systemManager?.addToolFromUuid !== 'function') return false;
    try {
      const result = await systemManager.addToolFromUuid(systemId, uuid);
      const created = result?.item
        ? _normalizeGatheringLibraryTool(result.item, _randomID)
        : null;
      if (!created) return false;
      const current = Array.isArray(get(toolsDraft)) ? get(toolsDraft) : [];
      const baseline = Array.isArray(get(toolsDraftBaseline)) ? get(toolsDraftBaseline) : [];
      toolsDraft.set([...current, _clonePlain(created)]);
      toolsDraftBaseline.set([...baseline, _clonePlain(created)]);
      toolsDraftSelectedToolId.set(created.id);
      toolsDraftExpandedToolId.set(created.id);
      _recomputeToolsDraftDirty();
      _patchToolsDraftViewState();
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to add tool from item:', err);
      services.notify?.error?.(err?.message || 'Failed to add tool from item');
      return false;
    }
  }

  function updateToolInDraft(toolId, patch = {}) {
    if (!toolId || typeof patch !== 'object' || patch === null) return false;
    return updateToolsDraft((list) =>
      list.map((tool) =>
        tool.id === toolId ? _normalizeGatheringLibraryTool({ ...tool, ...patch }, _randomID) : tool
      )
    );
  }

  async function deleteToolFromDraft(toolId) {
    if (!toolId) return false;
    const id = String(toolId);
    const current = get(toolsDraft);
    if (!Array.isArray(current)) return false;
    const baseline = get(toolsDraftBaseline) || [];
    const wasPersisted = baseline.some((tool) => String(tool.id) === id);
    if (wasPersisted) {
      const systemId = get(toolsDraftSystemId);
      if (!systemId) return false;
      toolsDraftSaving.set(true);
      _patchToolsDraftViewState();
      try {
        // Prefer the manager's `deleteTool` so a first-class tool's durable
        // `roles[systemId].toolId` leaf is cleared from its source Item (issue 561, D7) —
        // a whetstone's sibling `componentId` leaf survives. Fall back to a whole-list
        // persist for a manager that predates it (e.g. legacy test fixtures).
        const systemManager = services.getCraftingSystemManager?.();
        if (typeof systemManager?.deleteTool === 'function') {
          await systemManager.deleteTool(systemId, id);
        } else {
          const live = _systemTools(systemId);
          const next = live.filter((tool) => String(tool.id) !== id);
          const persisted = await _persistSystemTools(systemId, next);
          if (persisted === null) return false;
        }
        toolsDraftBaseline.set(baseline.filter((tool) => String(tool.id) !== id));
      } finally {
        toolsDraftSaving.set(false);
      }
    }
    toolsDraft.set(current.filter((tool) => String(tool.id) !== id));
    _recomputeToolsDraftDirty();
    if (String(get(toolsDraftSelectedToolId)) === id) {
      const remaining = get(toolsDraft) || [];
      toolsDraftSelectedToolId.set(remaining[0]?.id || '');
    }
    if (String(get(toolsDraftExpandedToolId)) === id) {
      toolsDraftExpandedToolId.set('');
    }
    _patchToolsDraftViewState();
    return true;
  }

  function selectDraftTool(toolId) {
    toolsDraftSelectedToolId.set(toolId || '');
    if (toolId) toolsDraftExpandedToolId.set(toolId);
    _patchToolsDraftViewState();
  }

  function setExpandedDraftTool(toolId) {
    toolsDraftExpandedToolId.set(toolId || '');
    _patchToolsDraftViewState();
  }

  function validateToolsDraft() {
    const tools = get(toolsDraft) || [];
    const errors = [];
    for (const raw of tools) {
      const result = Tool.fromJSON(raw).validate();
      if (!result.valid) errors.push({ id: raw.id, errors: result.errors });
    }
    return { valid: errors.length === 0, errors };
  }

  function validateToolDraft(toolId) {
    const id = String(toolId || '');
    const tool = (get(toolsDraft) || []).find((entry) => String(entry.id) === id);
    if (!tool) return { valid: false, errors: ['missing'] };
    const result = Tool.fromJSON(tool).validate();
    return { valid: result.valid, errors: result.errors };
  }

  function isToolDraftDirty(toolId) {
    const id = String(toolId || '');
    return id !== '' && get(toolsDraftDirtyToolIds).includes(id);
  }

  async function saveToolDraft(toolId) {
    const systemId = get(toolsDraftSystemId);
    if (!systemId) return false;
    const id = String(toolId || '');
    if (!id) return false;
    if (!isToolDraftDirty(id)) return true;
    const draft = get(toolsDraft) || [];
    const tool = draft.find((entry) => String(entry.id) === id);
    if (!tool) return false;
    const validation = validateToolDraft(id);
    if (!validation.valid) {
      toolsDraftSaveError.set('invalid');
      _patchToolsDraftViewState();
      return false;
    }
    toolsDraftSaving.set(true);
    _patchToolsDraftViewState();
    try {
      const baseline = get(toolsDraftBaseline) || [];
      const baselineTool = baseline.find((entry) => String(entry.id) === id) || null;
      const live = _systemTools(systemId);
      const liveIndex = live.findIndex((entry) => String(entry.id) === id);
      const liveTool =
        liveIndex >= 0 ? _normalizeGatheringLibraryTool(live[liveIndex], _randomID) : null;
      const hasConflict = baselineTool
        ? JSON.stringify(baselineTool) !== JSON.stringify(liveTool)
        : liveTool !== null;
      if (hasConflict) {
        const overwrite = await services.confirmDialog?.({
          title:
            services.localize?.('FABRICATE.Admin.Manager.Tools.ConcurrentEdit.Title') ||
            'Tools were modified elsewhere',
          content:
            services.localize?.('FABRICATE.Admin.Manager.Tools.ConcurrentEdit.Content') ||
            'The library has been modified outside this editor. Overwrite with your changes?',
          yes: {
            label:
              services.localize?.('FABRICATE.Admin.Manager.Tools.ConcurrentEdit.Confirm') ||
              'Overwrite',
            callback: () => true,
          },
          no: {
            label:
              services.localize?.('FABRICATE.Admin.Manager.Tools.ConcurrentEdit.Cancel') ||
              'Cancel',
            callback: () => false,
          },
        });
        if (overwrite !== true) {
          toolsDraftSaving.set(false);
          _patchToolsDraftViewState();
          return false;
        }
      }
      const normalizedTool = _normalizeGatheringLibraryTool(tool, _randomID);
      const next = live.map((entry) => _normalizeGatheringLibraryTool(entry, _randomID));
      if (liveIndex >= 0) {
        next[liveIndex] = normalizedTool;
      } else {
        const draftIndex = draft.findIndex((entry) => String(entry.id) === id);
        next.splice(Math.max(0, Math.min(draftIndex, next.length)), 0, normalizedTool);
      }
      const persisted = await _persistSystemTools(systemId, next);
      if (persisted === null) return false;
      toolsDraft.set(
        draft.map((entry) => (String(entry.id) === id ? _clonePlain(normalizedTool) : entry))
      );
      const baselineById = new Map(baseline.map((entry) => [String(entry.id), entry]));
      baselineById.set(id, normalizedTool);
      toolsDraftBaseline.set(
        draft
          .filter((entry) => String(entry.id) === id || baselineById.has(String(entry.id)))
          .map((entry) =>
            String(entry.id) === id
              ? _clonePlain(normalizedTool)
              : _clonePlain(baselineById.get(String(entry.id)))
          )
      );
      _recomputeToolsDraftDirty();
      toolsDraftSaveError.set(null);
      _patchToolsDraftViewState();
      await refresh();
      return true;
    } finally {
      toolsDraftSaving.set(false);
      _patchToolsDraftViewState();
    }
  }

  // A brand-new tool draft (id absent from the persisted baseline) that the user
  // added but never filled in matches the canonical empty-tool shape for its id.
  // Such a draft has nothing to save and must not block a "Save all".
  function _isBlankNewToolDraft(tool, baselineIds) {
    if (!tool || baselineIds.has(String(tool.id))) return false;
    const normalized = _normalizeGatheringLibraryTool({ ...tool }, _randomID);
    const blank = _normalizeGatheringLibraryTool({ id: tool.id }, _randomID);
    return JSON.stringify(normalized) === JSON.stringify(blank);
  }

  // Drop blank, unmodified, brand-new tool drafts (e.g. the user clicked "Add
  // tool" then tried to save/navigate away without assigning a component).
  // Discarding them lets a "Save all" complete cleanly instead of silently
  // blocking on an empty, invalid row (issue 297). Repairs selection/expansion
  // when they pointed at a discarded draft.
  function _discardBlankNewToolDrafts() {
    const current = get(toolsDraft);
    if (!Array.isArray(current)) return;
    const baselineIds = new Set((get(toolsDraftBaseline) || []).map((entry) => String(entry.id)));
    const kept = current.filter((tool) => !_isBlankNewToolDraft(tool, baselineIds));
    if (kept.length === current.length) return;
    toolsDraft.set(kept);
    const keptIds = new Set(kept.map((entry) => String(entry.id)));
    if (!keptIds.has(String(get(toolsDraftSelectedToolId)))) {
      toolsDraftSelectedToolId.set(kept[0]?.id || '');
    }
    if (!keptIds.has(String(get(toolsDraftExpandedToolId)))) {
      toolsDraftExpandedToolId.set('');
    }
    _recomputeToolsDraftDirty();
    _patchToolsDraftViewState();
  }

  async function saveAllDirtyToolDrafts() {
    // A "Save all" should not be blocked by an empty new-tool row the user never
    // filled in: discard blank, unmodified, brand-new drafts first so they don't
    // fail validation and silently abort the save (issue 297). A partially-edited
    // invalid tool (e.g. a named tool with no component) still returns false so
    // the caller can surface why.
    _discardBlankNewToolDrafts();
    const dirtyIds = [...get(toolsDraftDirtyToolIds)];
    for (const toolId of dirtyIds) {
      if (!isToolDraftDirty(toolId)) continue;
      const saved = await saveToolDraft(toolId);
      if (saved !== true) return false;
    }
    return true;
  }

  async function saveToolsDraft() {
    return saveAllDirtyToolDrafts();
  }

  function cancelToolsDraft() {
    toolsDraft.set(null);
    toolsDraftBaseline.set(null);
    toolsDraftSystemId.set('');
    toolsDraftDirty.set(false);
    toolsDraftDirtyToolIds.set([]);
    toolsDraftSaveError.set(null);
    toolsDraftSelectedToolId.set('');
    toolsDraftExpandedToolId.set('');
    _patchToolsDraftViewState();
    return true;
  }

  function isToolsDraftDirty() {
    return get(toolsDraftDirtyToolIds).length > 0 && Array.isArray(get(toolsDraft));
  }

  async function confirmDiscardDirtyToolsDraft() {
    if (!isToolsDraftDirty()) return true;
    if (dirtyToolsDraftDiscardConfirmation) return dirtyToolsDraftDiscardConfirmation;
    dirtyToolsDraftDiscardConfirmation = (async () => {
      const result = await services.confirmDialog?.({
        title:
          services.localize?.('FABRICATE.Admin.Manager.Tools.DiscardDirty.Title') ||
          'Discard unsaved tool changes?',
        content:
          services.localize?.('FABRICATE.Admin.Manager.Tools.DiscardDirty.Content') ||
          'The tools library has unsaved changes. Discard them and continue?',
        yes: () => true,
        no: () => false,
      });
      return result === true;
    })();
    try {
      return await dirtyToolsDraftDiscardConfirmation;
    } finally {
      dirtyToolsDraftDiscardConfirmation = null;
    }
  }

  async function _confirmDiscardDirtyDraft(contentKey, contentFallback) {
    const localizeFn = services.localize;
    if (typeof services.choiceDialog !== 'function') {
      // Fall back to the two-way confirm when no three-way dialog is available.
      const confirmed = await services.confirmDialog?.({
        title:
          localizeFn?.('FABRICATE.Admin.Manager.DiscardDirtyTitle') || 'Discard unsaved changes?',
        content: `<p>${localizeFn?.(contentKey) || contentFallback}</p>`,
        yes: {
          label: localizeFn?.('FABRICATE.Admin.Manager.DiscardDirtyConfirm') || 'Discard Changes',
          callback: () => true,
        },
        no: {
          label: localizeFn?.('FABRICATE.Admin.Manager.DiscardDirtyCancel') || 'Keep Editing',
          callback: () => false,
        },
      });
      return confirmed === true ? 'discard' : 'cancel';
    }
    const action = await services.choiceDialog({
      title:
        localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Title') || 'Save unsaved changes?',
      content: `<p>${localizeFn?.(contentKey) || contentFallback}</p>`,
      choices: [
        {
          action: 'save',
          label: localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Save') || 'Save',
          icon: 'fas fa-save',
        },
        {
          action: 'discard',
          label:
            localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Discard') || 'Discard Changes',
          icon: 'fas fa-trash',
        },
        {
          action: 'cancel',
          label: localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Cancel') || 'Keep Editing',
          icon: 'fas fa-times',
        },
      ],
      defaultAction: 'save',
    });
    return action === 'save' || action === 'discard' ? action : 'cancel';
  }

  function confirmDiscardDirtyComponentDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.Component.DiscardDirtyContent',
      'The current component has unsaved changes. Discard them and continue?'
    );
  }

  function confirmDiscardDirtyEssenceDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.Essence.DiscardDirtyContent',
      'The current essence has unsaved changes. Discard them and continue?'
    );
  }

  function confirmDiscardDirtyRecipeDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.Recipe.DiscardDirtyContent',
      'The current recipe has unsaved changes. Discard them and continue?'
    );
  }

  // Thin yes/no confirm used by the recipe editor's destructive in-draft actions
  // (delete step, revert multi→single, Complex→Simple trim). The editor stages the
  // result into its root-held draft after the user confirms; this helper only owns
  // the dialog wiring (the root has no direct services.confirmDialog seam).
  async function confirmRecipeAction({ title, content } = {}) {
    const confirmed = await services.confirmDialog?.({
      title,
      content,
      yes: () => true,
      no: () => false,
    });
    return confirmed === true;
  }

  function confirmDiscardDirtyGatheringTaskDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.Environment.Tasks.DiscardChangesPrompt',
      'The current gathering task has unsaved changes. Discard them and continue?'
    );
  }

  function confirmDiscardDirtyGatheringEventDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.Environment.Events.DiscardChangesPrompt',
      'The current event has unsaved changes. Discard them and continue?'
    );
  }

  function _getEnvironmentStore() {
    return services.getGatheringEnvironmentStore?.() || null;
  }

  function _randomID() {
    if (typeof services.randomID === 'function') return services.randomID();
    if (typeof globalThis.foundry?.utils?.randomID === 'function')
      return globalThis.foundry.utils.randomID();
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return Math.random().toString(36).slice(2, 14);
  }

  function _currentGatheringConfig() {
    return _normalizeGatheringConfig(
      services.getSetting?.(GATHERING_CONFIG_SETTING) || {},
      _randomID
    );
  }

  // ---------------------------------------------------------------------------
  // Travel section (world-level parties + per-system current-realm overrides).
  // Kept thin: uniqueness/invariant validation lives in GatheringPartyStore and
  // GatheringRealmStore; this section surfaces their errors inline and refreshes
  // derived view state. Confirmations always route through services.confirmDialog.
  // ---------------------------------------------------------------------------
  const travel = _createTravelSection();

  function _createTravelSection() {
    function getPartyStore() {
      return services.getGatheringPartyStore?.() || null;
    }
    function getRealmStore() {
      return services.getGatheringRealmStore?.() || null;
    }
    function getLocationService() {
      return services.getGatheringLocationService?.() || null;
    }
    function getActorOptions() {
      const options = services.getActorOptions?.() || [];
      return Array.isArray(options) ? _clonePlain(options) : [];
    }

    function clearErrors() {
      travelError.set(null);
      travelFieldErrors.set({});
    }

    function applyError(err, fieldContext = null) {
      const { travelError: summary, travelFieldErrors: fieldErrors } = _travelErrorState(
        err,
        services.localize,
        fieldContext
      );
      travelError.set(summary);
      travelFieldErrors.set(fieldErrors);
    }

    function buildState() {
      const partyStore = getPartyStore();
      const realmStore = getRealmStore();
      const systemId = get(selectedSystemId);
      const parties = partyStore?.list ? _clonePlain(partyStore.list() || []) : [];
      const actorOptions = getActorOptions();
      const actorByUuid = new Map(actorOptions.map((actor) => [actor.uuid, actor]));

      let selectedId = get(travelSelectedPartyId);
      if (selectedId && !parties.some((party) => party.id === selectedId)) selectedId = '';
      if (!selectedId && parties.length > 0) selectedId = parties[0].id;
      if (selectedId !== get(travelSelectedPartyId)) travelSelectedPartyId.set(selectedId);

      const realms =
        systemId && realmStore?.listBySystem
          ? _clonePlain(realmStore.listBySystem(systemId) || [])
          : [];
      const realmById = new Map(realms.map((realm) => [realm.id, realm]));
      const locationService = getLocationService();

      // Resolve each party's current realms ONCE (manual override OR live travel-
      // marker sensing) and bucket by realm id, so every realm-to-party list below
      // reflects auto mode — not just stored overrides.
      const partyEvidence = new Map();
      const partyResolvedRealmIds = new Map();
      for (const party of parties) {
        const evidence =
          systemId && locationService?.resolveCurrentRealms
            ? locationService.resolveCurrentRealms({ partyId: party.id, systemId })
            : {
                resolved: false,
                source: 'unresolved',
                realms: [],
                realmIds: [],
                staleRealmIds: [],
              };
        partyEvidence.set(party.id, evidence);
        partyResolvedRealmIds.set(
          party.id,
          new Set(Array.isArray(evidence.realmIds) ? evidence.realmIds : [])
        );
      }

      const travelParties = parties.map((party) => {
        const staleMembers = party.memberActorUuids.filter((uuid) => !actorByUuid.has(uuid));
        const staleTravelActor =
          party.travelActorUuid && !actorByUuid.has(party.travelActorUuid)
            ? party.travelActorUuid
            : null;
        const evidence = partyEvidence.get(party.id) || {
          resolved: false,
          source: 'unresolved',
          realms: [],
          realmIds: [],
          staleRealmIds: [],
        };
        const override =
          party.currentRealmOverrides?.[systemId] ??
          party.currentRegionOverrides?.[systemId] ??
          null;
        const overrideRealmIds =
          override?.mode === 'manual' ? (override.realmIds ?? override.regionIds ?? []) : [];
        const memberCards = party.memberActorUuids.map((uuid) => ({
          uuid,
          name: actorByUuid.get(uuid)?.name || '',
          img: actorByUuid.get(uuid)?.img || '',
          stale: !actorByUuid.has(uuid),
        }));
        return {
          ...party,
          memberCards,
          memberCount: party.memberActorUuids.length,
          travelActor: party.travelActorUuid
            ? actorByUuid.get(party.travelActorUuid) || null
            : null,
          staleMembers,
          staleTravelActor,
          staleRealmIds: Array.isArray(evidence.staleRealmIds) ? evidence.staleRealmIds : [],
          hasStaleReference:
            staleMembers.length > 0 ||
            !!staleTravelActor ||
            (Array.isArray(evidence.staleRealmIds) && evidence.staleRealmIds.length > 0),
          overrideMode: override?.mode || 'none',
          overrideRealmIds,
          currentRealmEvidence: {
            source: evidence.source,
            resolved: evidence.resolved === true,
            realms: (evidence.realms || []).map((realm) => ({
              id: realm.id,
              name: realmById.get(realm.id)?.name ?? realm.name ?? '',
              enabled: realm.enabled !== false,
            })),
            staleRealmIds: Array.isArray(evidence.staleRealmIds) ? evidence.staleRealmIds : [],
          },
        };
      });

      // Per-realm counts for the Realms tab header chips. Environments are
      // fetched once (sync arrays only — listBySystem may be async); parties
      // reuse the raw list already built above.
      const realmEnvList = (() => {
        if (realms.length === 0) return [];
        const environmentStore = _getEnvironmentStore();
        if (!environmentStore) return [];
        // listBySystem may be async; prefer its synchronous array, else fall
        // back to a synchronous list() (realm ids are unique per system).
        const bySystem =
          typeof environmentStore.listBySystem === 'function'
            ? environmentStore.listBySystem(systemId)
            : null;
        if (Array.isArray(bySystem)) return bySystem;
        const all = typeof environmentStore.list === 'function' ? environmentStore.list() : [];
        return Array.isArray(all) ? all : [];
      })();
      const realmEnvironments = (realmId) =>
        realmEnvList
          .filter(
            (env) => Array.isArray(env?.includedRealmIds) && env.includedRealmIds.includes(realmId)
          )
          .map((env) => ({ id: env.id, name: env.name, img: env.img || '' }));
      // Parties whose RESOLVED current realm (manual or live auto) includes the
      // realm — reuses the precomputed buckets so auto-mode parties are included.
      const realmParties = (realmId) =>
        parties
          .filter((party) => partyResolvedRealmIds.get(party.id)?.has(realmId))
          .map((party) => ({
            id: party.id,
            name: party.name,
            img: actorByUuid.get(party.travelActorUuid)?.img || '',
          }));

      // Map Region Links tab: the current scene's regions, each annotated with the
      // Fabricate realm (if any) whose sceneMappings already claim it on this
      // scene. The link is single-valued per scene region (first mapping wins).
      const sceneData = services.getCurrentSceneRegions?.() || { sceneUuid: '', regions: [] };
      const currentSceneUuid = String(sceneData.sceneUuid || '');
      const linkBySceneRegionUuid = new Map();
      for (const realm of realms) {
        const mappings = Array.isArray(realm.sceneMappings) ? realm.sceneMappings : [];
        for (const mapping of mappings) {
          if (!mapping?.sceneRegionUuid) continue;
          if (currentSceneUuid && mapping.sceneUuid && mapping.sceneUuid !== currentSceneUuid)
            continue;
          if (!linkBySceneRegionUuid.has(mapping.sceneRegionUuid)) {
            linkBySceneRegionUuid.set(mapping.sceneRegionUuid, realm.id);
          }
        }
      }
      // Parties whose travel-marker token can be tested for containment (those
      // that have a marker actor). Reused across scene regions below.
      const partiesWithMarker = parties.filter((party) => party?.travelActorUuid);
      const markerUuids = partiesWithMarker.map((party) => String(party.travelActorUuid));
      const currentSceneRegions = (Array.isArray(sceneData.regions) ? sceneData.regions : []).map(
        (sceneRegion) => {
          const linkedRegionId = linkBySceneRegionUuid.get(sceneRegion.sceneRegionUuid) || '';
          // Parties whose travel marker currently sits inside this Scene Region.
          const insideUuids = markerUuids.length
            ? new Set(
                services.getActorUuidsInSceneRegion?.(sceneRegion.sceneRegionUuid, markerUuids) ||
                  []
              )
            : new Set();
          const partiesInMapRegion = partiesWithMarker
            .filter((party) => insideUuids.has(String(party.travelActorUuid)))
            .map((party) => ({
              id: party.id,
              name: party.name,
              img: actorByUuid.get(party.travelActorUuid)?.img || '',
            }));
          // Parties whose current realm includes the linked Fabricate realm.
          const partiesInFabricateRealm = linkedRegionId ? realmParties(linkedRegionId) : [];
          return { ...sceneRegion, linkedRegionId, partiesInMapRegion, partiesInFabricateRealm };
        }
      );

      return {
        currentSceneUuid,
        currentSceneRegions,
        travelParties,
        selectedPartyId: selectedId,
        travelSaving: get(travelSaving),
        travelError: get(travelError),
        travelFieldErrors: _clonePlain(get(travelFieldErrors)),
        selectedSystemRealms: realms.map((realm) => {
          const environments = realmEnvironments(realm.id);
          const partiesInRealm = realmParties(realm.id);
          return {
            id: realm.id,
            name: realm.name,
            description: String(realm.description || ''),
            img: realm.img || null,
            enabled: realm.enabled !== false,
            secret: realm.secret === true,
            biomes: Array.isArray(realm.biomes) ? realm.biomes : [],
            environmentCount: environments.length,
            partyCount: partiesInRealm.length,
            environments,
            parties: partiesInRealm,
          };
        }),
        gatheringRealmSettings:
          systemId && realmStore?.getRealmSettings
            ? realmStore.getRealmSettings(systemId)
            : { enabled: false, revealMode: 'manual', modifierVisibility: 'visible' },
        actorOptions,
      };
    }

    function patch() {
      viewState.update((state) => ({ ...state, ...buildState() }));
    }

    async function withSave(operation, fieldContext = null) {
      const partyStore = getPartyStore();
      if (!partyStore) return false;
      clearErrors();
      travelSaving.set(true);
      patch();
      try {
        await operation(partyStore);
        return true;
      } catch (err) {
        applyError(err, fieldContext);
        return false;
      } finally {
        travelSaving.set(false);
        patch();
      }
    }

    return {
      buildState,
      patch,
      refreshTravelParties() {
        clearErrors();
        patch();
      },
      selectParty(partyId) {
        travelSelectedPartyId.set(partyId || '');
        clearErrors();
        patch();
      },
      async createParty() {
        const created = await withSave(async (partyStore) => {
          const party = await partyStore.create({
            name:
              services.localize?.('FABRICATE.Admin.Manager.Travel.DefaultPartyName') || 'New party',
          });
          if (party?.id) travelSelectedPartyId.set(party.id);
        });
        return created;
      },
      async renameParty(partyId, name) {
        return withSave((partyStore) => partyStore.update(partyId, { name: String(name ?? '') }));
      },
      async setPartyEnabled(partyId, enabled) {
        return withSave((partyStore) => partyStore.setEnabled(partyId, enabled === true));
      },
      async deleteParty(partyId) {
        const partyStore = getPartyStore();
        if (!partyStore) return false;
        const party = partyStore.get?.(partyId);
        const name = _escapeHtml(party?.name || partyId);
        const confirmed = await services.confirmDialog?.({
          title:
            services.localize?.('FABRICATE.Admin.Manager.Travel.DeletePartyTitle', { name }) ||
            `Delete ${name}?`,
          content: `<p>${
            services.localize?.('FABRICATE.Admin.Manager.Travel.DeletePartyContent', { name }) ||
            `Delete Fabricate party <strong>${name}</strong>?`
          }</p>`,
          yes: () => true,
          no: () => false,
        });
        if (!confirmed) return false;
        return withSave(async (store) => {
          await store.delete(partyId);
          if (get(travelSelectedPartyId) === partyId) travelSelectedPartyId.set('');
        });
      },
      async addPartyMember(partyId, actorUuid) {
        return withSave((partyStore) => partyStore.addMember(partyId, actorUuid), 'members');
      },
      async addOrMovePartyMember(targetPartyId, actorUuid) {
        const partyStore = getPartyStore();
        if (!partyStore) return false;
        const uuid = String(actorUuid ?? '');
        const source = (partyStore.list?.() || []).find(
          (party) =>
            party.id !== targetPartyId &&
            Array.isArray(party.memberActorUuids) &&
            party.memberActorUuids.includes(uuid)
        );
        if (source) {
          const actorName = _escapeHtml(
            getActorOptions().find((actor) => actor.uuid === uuid)?.name || uuid
          );
          const sourceName = _escapeHtml(source.name || source.id);
          const targetName = _escapeHtml(partyStore.get?.(targetPartyId)?.name || targetPartyId);
          const confirmed = await services.confirmDialog?.({
            title:
              services.localize?.('FABRICATE.Admin.Manager.Travel.MoveMemberTitle', {
                actor: actorName,
              }) || `Move ${actorName}?`,
            content: `<p>${
              services.localize?.('FABRICATE.Admin.Manager.Travel.MoveMemberContent', {
                actor: actorName,
                from: sourceName,
                to: targetName,
              }) ||
              `Move <strong>${actorName}</strong> from <strong>${sourceName}</strong> to <strong>${targetName}</strong>?`
            }</p>`,
            yes: () => true,
            no: () => false,
          });
          if (!confirmed) return false;
          return withSave((store) => store.moveMember(source.id, targetPartyId, uuid), 'members');
        }
        return withSave((store) => store.addMember(targetPartyId, uuid), 'members');
      },
      async removePartyMember(partyId, actorUuid) {
        return withSave((partyStore) => partyStore.removeMember(partyId, actorUuid), 'members');
      },
      async movePartyMember(fromPartyId, toPartyId, actorUuid) {
        return withSave(
          (partyStore) => partyStore.moveMember(fromPartyId, toPartyId, actorUuid),
          'members'
        );
      },
      async setPartyTravelActor(partyId, actorUuid) {
        return withSave(
          (partyStore) => partyStore.setTravelActor(partyId, actorUuid),
          'travelActor'
        );
      },
      async clearPartyTravelActor(partyId) {
        return withSave((partyStore) => partyStore.setTravelActor(partyId, null));
      },
      async setPartyRealmOverride(partyId, systemId, realmIds) {
        return withSave((partyStore) =>
          partyStore.setCurrentRealmOverride(partyId, systemId, realmIds || [])
        );
      },
      async clearPartyRealmOverride(partyId, systemId) {
        return withSave((partyStore) => partyStore.clearCurrentRealmOverride(partyId, systemId));
      },
      async removeStaleMember(partyId, actorUuid) {
        return withSave((partyStore) => partyStore.removeMember(partyId, actorUuid));
      },
      async clearStaleTravelActor(partyId) {
        return withSave((partyStore) => partyStore.setTravelActor(partyId, null));
      },
      async dropStaleOverrideRealm(partyId, systemId, realmId) {
        const partyStore = getPartyStore();
        if (!partyStore) return false;
        const party = partyStore.get?.(partyId);
        const override =
          party?.currentRealmOverrides?.[systemId] ?? party?.currentRegionOverrides?.[systemId];
        const overrideIds = override?.realmIds ?? override?.regionIds;
        const nextIds = Array.isArray(overrideIds)
          ? overrideIds.filter((id) => id !== realmId)
          : [];
        return withSave((store) => store.setCurrentRealmOverride(partyId, systemId, nextIds));
      },
      // --- Realm quick list (name/enabled only; never touches other fields). ---
      async createRealmQuick(systemId, name) {
        const realmStore = getRealmStore();
        if (!realmStore || !systemId) return false;
        clearErrors();
        travelSaving.set(true);
        patch();
        try {
          const created = await realmStore.create(systemId, { name: String(name ?? '').trim() });
          // Return the new realm id so callers can select it; fall back to true.
          return created?.id || true;
        } catch (err) {
          applyError(err);
          return false;
        } finally {
          travelSaving.set(false);
          patch();
        }
      },
      async renameRealm(systemId, realmId, name) {
        return _realmPatch(systemId, realmId, { name: String(name ?? '') });
      },
      async toggleRealmEnabled(systemId, realmId, enabled) {
        return _realmPatch(systemId, realmId, { enabled: enabled === true });
      },
      // Merge-patch a single realm; the store merges over the existing record so
      // fields the caller omits round-trip untouched. Backs the full Travel
      // realm authoring surface (description/img/secret/biomes).
      async updateRealm(systemId, realmId, patch = {}) {
        return _realmPatch(systemId, realmId, patch && typeof patch === 'object' ? patch : {});
      },
      // Link (or unlink) a Foundry Scene Region on the current scene to a Fabricate
      // realm. Single-valued: the scene region is stripped from every realm's
      // sceneMappings (on this scene) before being attached to the chosen realm;
      // a falsy realmId just clears the link. Only realms that actually change
      // are persisted, so this is a no-op write when nothing moved.
      async setMapRegionLink(sceneRegionUuid, fabricateRealmId) {
        const realmStore = getRealmStore();
        const systemId = get(selectedSystemId);
        const targetSceneRegionUuid = String(sceneRegionUuid || '');
        if (!realmStore || !systemId || !targetSceneRegionUuid) return false;
        const sceneData = services.getCurrentSceneRegions?.() || { sceneUuid: '', regions: [] };
        const sceneUuid = String(sceneData.sceneUuid || '');
        const nextRealmId = fabricateRealmId ? String(fabricateRealmId) : '';
        const matchesTarget = (mapping) =>
          mapping?.sceneRegionUuid === targetSceneRegionUuid &&
          (!sceneUuid || !mapping?.sceneUuid || mapping.sceneUuid === sceneUuid);
        clearErrors();
        travelSaving.set(true);
        patch();
        try {
          const realms = realmStore.listBySystem?.(systemId) || [];
          const realmList = Array.isArray(realms) ? realms : [];

          for (const realm of realmList) {
            const mappings = Array.isArray(realm.sceneMappings) ? realm.sceneMappings : [];
            const filtered = mappings.filter((mapping) => !matchesTarget(mapping));
            if (nextRealmId && realm.id === nextRealmId) {
              await realmStore.update(systemId, realm.id, {
                sceneMappings: [...filtered, { sceneUuid, sceneRegionUuid: targetSceneRegionUuid }],
              });
            } else if (filtered.length !== mappings.length) {
              await realmStore.update(systemId, realm.id, { sceneMappings: filtered });
            }
          }

          // No current-realm writes here: a party's current realm is derived
          // LIVE from its travel marker's position (GatheringLocationService auto
          // sensing), so inside markers resolve to the new link automatically.
          return true;
        } catch (err) {
          applyError(err);
          return false;
        } finally {
          travelSaving.set(false);
          patch();
        }
      },
      async setGatheringRealmsEnabled(systemId, enabled) {
        const realmStore = getRealmStore();
        if (!realmStore?.updateRealmSettings || !systemId) return false;
        clearErrors();
        travelSaving.set(true);
        patch();
        try {
          await realmStore.updateRealmSettings(systemId, { enabled: enabled === true });
          return true;
        } catch (err) {
          applyError(err);
          return false;
        } finally {
          travelSaving.set(false);
          patch();
        }
      },
      async deleteRealm(systemId, realmId) {
        const realmStore = getRealmStore();
        if (!realmStore || !systemId) return false;
        const realm = realmStore.get?.(systemId, realmId);
        const name = _escapeHtml(realm?.name || realmId);
        // Collect referenced-by evidence WITHOUT deleting first: GatheringRealmStore.delete
        // returns it post-delete, but we surface it in the confirm copy beforehand by
        // probing the collaborators the store uses.
        const references = _collectRealmReferences(systemId, realmId);
        const refLine =
          references.environments.length > 0 || references.parties.length > 0
            ? `<p>${
                services.localize?.('FABRICATE.Admin.Manager.Travel.Realms.DeleteReferenced', {
                  environments: references.environments.length,
                  parties: references.parties.length,
                }) ||
                `It is still referenced by ${references.environments.length} environment(s) and ${references.parties.length} party override(s).`
              }</p>`
            : '';
        const confirmed = await services.confirmDialog?.({
          title:
            services.localize?.('FABRICATE.Admin.Manager.Travel.Realms.DeleteTitle', { name }) ||
            `Delete ${name}?`,
          content: `<p>${
            services.localize?.('FABRICATE.Admin.Manager.Travel.Realms.DeleteContent', { name }) ||
            `Delete realm <strong>${name}</strong>?`
          }</p>${refLine}`,
          yes: () => true,
          no: () => false,
        });
        if (!confirmed) return false;
        clearErrors();
        travelSaving.set(true);
        patch();
        try {
          await realmStore.delete(systemId, realmId, {
            environmentStore: _getEnvironmentStore(),
            partyStore: getPartyStore(),
          });
          return true;
        } catch (err) {
          applyError(err);
          return false;
        } finally {
          travelSaving.set(false);
          patch();
        }
      },
    };

    function _collectRealmReferences(systemId, realmId) {
      const environments = [];
      const parties = [];
      const environmentStore = _getEnvironmentStore();
      const envList =
        typeof environmentStore?.listBySystem === 'function'
          ? environmentStore.listBySystem(systemId)
          : typeof environmentStore?.list === 'function'
            ? environmentStore.list()
            : [];
      // listBySystem may be async (environment store); only use synchronous arrays here.
      if (Array.isArray(envList)) {
        for (const env of envList) {
          const included =
            Array.isArray(env?.includedRealmIds) && env.includedRealmIds.includes(realmId);
          const excluded =
            Array.isArray(env?.excludedRealmIds) && env.excludedRealmIds.includes(realmId);
          if (included || excluded) environments.push({ id: env.id, name: env.name });
        }
      }
      const partyStore = getPartyStore();
      const partyList = typeof partyStore?.list === 'function' ? partyStore.list() : [];
      for (const party of Array.isArray(partyList) ? partyList : []) {
        const override =
          party?.currentRealmOverrides?.[systemId] ?? party?.currentRegionOverrides?.[systemId];
        const overrideIds = override?.realmIds ?? override?.regionIds;
        if (override && Array.isArray(overrideIds) && overrideIds.includes(realmId)) {
          parties.push({ id: party.id, name: party.name });
        }
      }
      return { environments, parties };
    }

    async function _realmPatch(systemId, realmId, patchData) {
      const realmStore = getRealmStore();
      if (!realmStore || !systemId) return false;
      clearErrors();
      travelSaving.set(true);
      patch();
      try {
        await realmStore.update(systemId, realmId, patchData);
        return true;
      } catch (err) {
        applyError(err);
        return false;
      } finally {
        travelSaving.set(false);
        patch();
      }
    }
  }

  /**
   * Re-read the persisted gathering config into viewState. Used when an external
   * surface (the economy Settings panel persists via the game service, not the
   * store) changes the config and dependent reactive derivations — e.g. the task
   * editor's economy mode — must update without reopening the app.
   */
  function refreshGatheringConfig() {
    viewState.update((state) => ({
      ...state,
      gatheringConfig: _clonePlain(_currentGatheringConfig()),
    }));
  }

  // Re-project BOTH access rosters (non-GM users + every world actor with its
  // control set). The owning app wires this to user AND actor CRUD, because
  // `controlledBy` / `sharedWithAllPlayers` derive from `actor.ownership` as well as
  // from `user.character`. Cheap and surgical: no full `refresh()`.
  //
  // This REPLACED a users-only `refreshWorldUsers`, which had no production caller left
  // once the hooks moved here: the two rosters move together, because the same user and
  // actor CRUD changes both.
  function refreshAccessRosters() {
    viewState.update((state) => ({
      ...state,
      worldUsers: services.getWorldUsers?.() || [],
      accessCharacters: services.getAccessCharacterActors?.() || [],
    }));
  }

  /**
   * Resolve a recipe's `access` grant into displayable player / character rows.
   * Resolution lives HERE (not in the rail): the rail receives resolved rows and
   * never touches ids. Unresolvable ids are dropped from display and never persisted
   * away — the rail is read-only.
   *
   * @param {{characterIds?: string[], playerIds?: string[]}|null} access
   * @param {{players?: object[], characters?: object[]}} [rosters] Defaults to the
   *   currently projected rosters; callers inside a Svelte `$derived` pass them
   *   explicitly so the reactive dependency is visible.
   */
  function resolveRecipeAccess(access, rosters = null) {
    const state = rosters || get(viewState);
    return resolveRecipeAccessRoster(access, {
      players: state.players || state.worldUsers || [],
      characters: state.characters || state.accessCharacters || [],
    });
  }

  async function _saveGatheringConfig(config) {
    const normalized = _normalizeGatheringConfig(config, _randomID);
    await services.setSetting?.(GATHERING_CONFIG_SETTING, normalized);
    viewState.update((state) => ({ ...state, gatheringConfig: _clonePlain(normalized) }));
    return normalized;
  }

  function _gatheringSystemConfig(config, systemId) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return null;
    config.systems = config.systems || {};
    config.systems[id] = config.systems[id] || {
      rules: _normalizeGatheringRules(),
      conditions: _normalizeGatheringSystemConditions(null, config),
      vocabularies: _normalizeGatheringSystemVocabularies(null, config.vocabularies),
      tasks: [],
      events: [],
    };
    config.systems[id].rules = _normalizeGatheringRules(config.systems[id].rules);
    config.systems[id].conditions = _normalizeGatheringSystemConditions(
      config.systems[id].conditions,
      config
    );
    config.systems[id].vocabularies = _normalizeGatheringSystemVocabularies(
      config.systems[id].vocabularies,
      config.vocabularies
    );
    config.systems[id].tasks = Array.isArray(config.systems[id].tasks)
      ? config.systems[id].tasks
      : [];
    config.systems[id].events = Array.isArray(config.systems[id].events)
      ? config.systems[id].events
      : [];
    return config.systems[id];
  }

  /**
   * Read the canonical, system-owned library Tools for a crafting system,
   * normalized to the editor Tool shape. Tools live on the crafting system
   * (`system.tools`), not the gathering config — this is the single source the
   * Tools browser, recipe gate, salvage, and canvas browser all read.
   *
   * @param {string} systemId
   * @returns {Array<object>}
   */
  function _systemTools(systemId) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return [];
    const system = services.getCraftingSystemManager?.()?.getSystem?.(id) || null;
    return (Array.isArray(system?.tools) ? system.tools : []).map((tool) =>
      _normalizeGatheringLibraryTool(tool, _randomID)
    );
  }

  /**
   * Persist the given library Tools onto the crafting system via the system
   * manager (the `craftingSystems` setting), the canonical target. Returns the
   * normalized tools as round-tripped by the manager, or null when the system
   * manager / system is unavailable.
   *
   * @param {string} systemId
   * @param {Array<object>} tools
   * @returns {Promise<Array<object>|null>}
   */
  async function _persistSystemTools(systemId, tools) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return null;
    const systemManager = services.getCraftingSystemManager?.();
    if (!systemManager?.updateSystem) return null;
    const normalized = (Array.isArray(tools) ? tools : []).map((tool) =>
      _normalizeGatheringLibraryTool(tool, _randomID)
    );
    const updated = await systemManager.updateSystem(id, { tools: normalized });
    return Array.isArray(updated?.tools) ? updated.tools : normalized;
  }

  // --- Character prerequisites (issue 544) — system-owned pass/fail gates ------

  function _systemCharacterPrerequisites(systemId) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return [];
    const system = services.getCraftingSystemManager?.()?.getSystem?.(id) || null;
    return normalizeCharacterPrerequisiteList(system?.characterPrerequisites, _randomID);
  }

  async function _persistSystemCharacterPrerequisites(systemId, prerequisites) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return null;
    const systemManager = services.getCraftingSystemManager?.();
    if (!systemManager?.updateSystem) return null;
    const normalized = normalizeCharacterPrerequisiteList(prerequisites, _randomID);
    const updated = await systemManager.updateSystem(id, { characterPrerequisites: normalized });
    return Array.isArray(updated?.characterPrerequisites)
      ? updated.characterPrerequisites
      : normalized;
  }

  async function addCharacterPrerequisite(systemId = get(selectedSystemId), partial = {}) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return null;
    const entry = normalizeCharacterPrerequisite({ id: _randomID(), ...partial }, _randomID);
    if (!entry) return null;
    const persisted = await _persistSystemCharacterPrerequisites(id, [
      ..._systemCharacterPrerequisites(id),
      entry,
    ]);
    if (persisted === null) return null;
    await refresh();
    return entry;
  }

  async function updateCharacterPrerequisite(
    systemId = get(selectedSystemId),
    prerequisiteId,
    updates = {}
  ) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id || !prerequisiteId) return false;
    let changed = false;
    const next = _systemCharacterPrerequisites(id).map((entry) => {
      if (entry.id !== prerequisiteId) return entry;
      changed = true;
      return normalizeCharacterPrerequisite({ ...entry, ...updates, id: entry.id }, _randomID);
    });
    if (!changed) return false;
    const persisted = await _persistSystemCharacterPrerequisites(id, next);
    if (persisted === null) return false;
    await refresh();
    return true;
  }

  async function deleteCharacterPrerequisite(systemId = get(selectedSystemId), prerequisiteId) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id || !prerequisiteId) return false;
    const current = _systemCharacterPrerequisites(id);
    const next = current.filter((entry) => entry.id !== prerequisiteId);
    if (next.length === current.length) return false; // unknown id — nothing removed
    const persisted = await _persistSystemCharacterPrerequisites(id, next);
    if (persisted === null) return false;
    await refresh();
    return true;
  }

  async function seedCharacterPrerequisitePresetsForSystem(systemId = get(selectedSystemId)) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return { added: 0, skipped: 0, unsupported: true, foundrySystemId: '' };
    const foundrySystemId = String(services.getFoundrySystemId?.() || '');
    const presets = getCharacterPrerequisitePresetsForFoundrySystem(foundrySystemId);
    if (!presets.length) {
      return { added: 0, skipped: 0, unsupported: true, foundrySystemId };
    }
    const { added, skipped, next } = seedCharacterPrerequisitePresets({
      presets,
      currentLibrary: _systemCharacterPrerequisites(id),
    });
    if (added.length > 0) {
      const persisted = await _persistSystemCharacterPrerequisites(id, next);
      if (persisted === null) {
        return { added: 0, skipped: skipped.length, unsupported: false, foundrySystemId };
      }
      await refresh();
    }
    return { added: added.length, skipped: skipped.length, unsupported: false, foundrySystemId };
  }

  function _environmentList() {
    const store = _getEnvironmentStore();
    const values = typeof store?.list === 'function' ? store.list() : [];
    return Array.isArray(values) ? values.filter(Boolean) : [];
  }

  function _gatheringLibraryRecordMatchesEnvironment(
    record,
    environment,
    conditions,
    includeDanger = false,
    conditionSettings = null
  ) {
    return evaluateEnvironmentMatch(record, environment, conditions, {
      includeDanger,
      conditionSettings,
    }).matches;
  }

  function _environmentAllowsGatheringLibraryRecord(environment, recordId, kind) {
    const enabledKey = kind === 'event' ? 'enabledEventIds' : 'enabledTaskIds';
    const disabledKey = kind === 'event' ? 'disabledEventIds' : 'disabledTaskIds';
    const enabled = Array.isArray(environment?.[enabledKey])
      ? environment[enabledKey].map(String)
      : [];
    const disabled = Array.isArray(environment?.[disabledKey])
      ? environment[disabledKey].map(String)
      : [];
    if (disabled.includes(String(recordId))) return false;
    return enabled.length === 0 || enabled.includes(String(recordId));
  }

  /**
   * Classify every library task/event for the given environment into a
   * `CompositionState` + `RuntimeState` plus match evidence, honoring
   * `compositionMode`. This is the single view-model the environment editor
   * (Overview / Tasks / Events / Validation / inspector) renders from.
   */
  function _buildEnvironmentCompositionViewModel(environment) {
    const empty = {
      compositionMode: 'automatic',
      conditions: { ...DEFAULT_GATHERING_CONDITIONS },
      tasks: [],
      events: [],
      counts: _emptyCompositionCounts(),
    };
    if (!environment || typeof environment !== 'object') return empty;
    const systemId = String(environment.craftingSystemId || get(selectedSystemId) || '');
    if (!systemId) return empty;

    const config = _currentGatheringConfig();
    const system = config.systems?.[systemId] || {};
    const craftingSystem = services.getCraftingSystemManager?.()?.getSystem?.(systemId) || null;
    const managedItemById = new Map(
      _buildManagedItemOptions(_getManagedItems(craftingSystem)).map((item) => [
        String(item.id || ''),
        item,
      ])
    );
    const conditionSettings = system.conditions || null;
    const conditions = _gatheringCurrentConditions(conditionSettings);
    const compositionMode = environment.compositionMode === 'manual' ? 'manual' : 'automatic';

    const tasks = _classifyCompositionRecords({
      records: Array.isArray(system.tasks) ? system.tasks : [],
      environment,
      conditions,
      conditionSettings,
      compositionMode,
      kind: 'task',
      includeDanger: false,
      order: environment.taskOrder,
      managedItemById,
    });
    const events = _classifyCompositionRecords({
      records: Array.isArray(system.events) ? system.events : [],
      environment,
      conditions,
      conditionSettings,
      compositionMode,
      kind: 'event',
      includeDanger: true,
      order: environment.eventOrder,
    });

    return {
      compositionMode,
      conditions,
      tasks,
      events,
      counts: _compositionCounts(tasks, events),
    };
  }

  /**
   * Build the derived `evaluateSystemValidation` report for the selected system.
   * Assembles exactly the collaborators the pure aggregator needs:
   *
   *  - `recipes`: the system's Recipe models (the aggregator projects them);
   *  - `components`: the system's managed components (drive salvage + alchemy
   *    signature + progressive-difficulty checks);
   *  - `environments`: each gathering environment carrying the precomputed
   *    `composition` view-model the environment readiness evaluator consumes.
   *
   * The aggregator itself derives the per-recipe `routingProvider` and the
   * system's `routedOutcomeTierOptions`, so nothing extra is built here. Pure and
   * synchronous; environments are passed in (already listed by the caller).
   *
   * @param {object|null} selectedSystem The selected crafting system model.
   * @param {object[]} [environments] Gathering environments for the system.
   * @returns {{ issues: object[], counts: object, blocksSystem: boolean }}
   */
  function _buildSystemValidationReport(selectedSystem, environments = []) {
    const emptyReport = {
      issues: [],
      counts: { critical: 0, warning: 0, info: 0, blockers: 0 },
      blocksSystem: false,
    };
    if (!selectedSystem) return emptyReport;

    const recipeManager = services.getRecipeManager?.();
    const recipes = recipeManager?.getRecipes
      ? recipeManager.getRecipes({ craftingSystemId: selectedSystem.id })
      : [];
    const components = _getManagedItems(selectedSystem);
    const environmentsWithComposition = (Array.isArray(environments) ? environments : []).map(
      (environment) => ({
        ...environment,
        composition: _buildEnvironmentCompositionViewModel(environment),
      })
    );

    return evaluateSystemValidation(selectedSystem, {
      recipes,
      components,
      environments: environmentsWithComposition,
    });
  }

  /**
   * The cross-recipe ingredient-signature conflicts touching one recipe, for the
   * recipe editor's Validation tab (issue 549). Runs the SAME `SignatureValidator`
   * the enable path (`RecipeManager._validateSignatures`) and the system overview
   * (`systemValidation`) use — no duplicated overlap logic — but scoped to the one
   * recipe, and (when a live draft is supplied) against the DRAFT's ingredient sets
   * so the tab predicts the collision before the GM saves. Returns coded, id-free
   * `{ code, params, message }` conflicts (issue 550) the tab localizes.
   *
   * Only alchemy systems infer the recipe from submitted ingredients, so signature
   * uniqueness is enforced there alone (mirrors `_validateSignatures`); every other
   * mode returns `[]`.
   *
   * @param {string} recipeId The edited recipe's id.
   * @param {object|null} [draftRecipe] The live recipe draft JSON, substituted for
   *   the persisted recipe of the same id when present.
   * @returns {{ code: string|null, params: object, message: string }[]}
   */
  function getRecipeSignatureConflicts(recipeId, draftRecipe = null) {
    const systemManager = services.getCraftingSystemManager?.();
    const recipeManager = services.getRecipeManager?.();
    const sysId = get(selectedSystemId);
    if (!systemManager || !recipeManager || !sysId || !recipeId) return [];

    const system = systemManager.getSystem(sysId);
    if (system?.resolutionMode !== 'alchemy') return [];

    const persisted = recipeManager.getRecipes({ craftingSystemId: sysId }) || [];
    const recipesJson = persisted.map((recipe) => {
      if (draftRecipe && String(recipe?.id) === String(recipeId)) return draftRecipe;
      return typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
    });
    const components = _getManagedItems(system);

    const validator = new SignatureValidator({
      getSystem: (id) => (id === sysId ? system : null),
      getRecipesForSystem: (id) => (id === sysId ? recipesJson : []),
      getComponentsForSystem: (id) => (id === sysId ? components : []),
    });
    const { conflicts } = validator.validateSystem(sysId);
    return conflicts
      .filter(
        (conflict) =>
          String(conflict.recipeA?.id) === String(recipeId) ||
          String(conflict.recipeB?.id) === String(recipeId)
      )
      .map((conflict) => ({
        code: conflict.code,
        params: conflict.params,
        message: conflict.message,
      }));
  }

  function _classifyCompositionRecords({
    records,
    environment,
    conditions,
    conditionSettings,
    compositionMode,
    kind,
    includeDanger,
    order,
    managedItemById = new Map(),
  }) {
    const enabledKey = kind === 'event' ? 'enabledEventIds' : 'enabledTaskIds';
    const disabledKey = kind === 'event' ? 'disabledEventIds' : 'disabledTaskIds';
    const forcedKey = kind === 'event' ? 'forcedEventIds' : 'forcedTaskIds';
    const enabled = Array.isArray(environment?.[enabledKey])
      ? environment[enabledKey].map(String)
      : [];
    const disabled = Array.isArray(environment?.[disabledKey])
      ? environment[disabledKey].map(String)
      : [];
    const forced = Array.isArray(environment?.[forcedKey])
      ? environment[forcedKey].map(String)
      : [];
    const orderIndex = new Map(
      (Array.isArray(order) ? order : []).map((id, index) => [String(id), index])
    );

    const classified = (Array.isArray(records) ? records : []).map((record, index) => {
      const id = String(record?.id || '');
      const libraryEnabled = record?.enabled !== false;
      const { matches, conditionsMet, evidence } = evaluateEnvironmentMatch(
        record,
        environment,
        conditions,
        { includeDanger, conditionSettings }
      );
      const excluded = compositionMode !== 'manual' && disabled.includes(id);
      const explicitlyIncluded = enabled.includes(id);
      // Forces are honored only in manual mode (automatic ignores them, like the enabled allow-list).
      const forceIncluded = compositionMode === 'manual' && forced.includes(id);

      let compositionState;
      if (!libraryEnabled) compositionState = 'libraryDisabled';
      else if (excluded) compositionState = 'excluded';
      else if (forceIncluded) compositionState = 'forceIncluded';
      // In automatic mode the enabled allow-list is ignored (matching the runtime composition
      // service), so a non-matching record is always "not matching" — never a stale
      // "included but unavailable". Only manual mode honors the explicit inclusion.
      else if (!matches)
        compositionState =
          compositionMode === 'manual' && explicitlyIncluded
            ? 'includedButUnavailable'
            : 'notMatching';
      else if (compositionMode === 'manual')
        compositionState = explicitlyIncluded ? 'explicitlyIncluded' : 'candidate';
      else compositionState = 'includedByMatch';

      // A record is runtime-available only when its composition state would compose it AND
      // the current weather/time satisfy the record's required conditions.
      const composed =
        compositionState === 'includedByMatch' ||
        compositionState === 'explicitlyIncluded' ||
        compositionState === 'forceIncluded';
      const runtimeState = composed && conditionsMet ? 'available' : 'unavailable';
      const orderRank = orderIndex.has(id) ? orderIndex.get(id) : Number.MAX_SAFE_INTEGER;
      const dropRateAdjustment = _dropRateAdjustmentSummary({
        kind,
        record,
        environment,
        managedItemById,
      });
      return {
        id,
        record,
        kind,
        libraryEnabled,
        matches,
        conditionsMet,
        evidence,
        excluded,
        explicitlyIncluded,
        compositionState,
        runtimeState,
        orderRank,
        _index: index,
        ...dropRateAdjustment,
      };
    });

    return classified.sort((a, b) =>
      a.orderRank === b.orderRank ? a._index - b._index : a.orderRank - b.orderRank
    );
  }

  function _effectiveDropRate(baseDropRate, adjustment) {
    const base = Number.isFinite(Number(baseDropRate)) ? Math.floor(Number(baseDropRate)) : 0;
    const delta = Number.isFinite(Number(adjustment)) ? Math.floor(Number(adjustment)) : 0;
    return Math.min(100, Math.max(0, base + delta));
  }

  function _dropRowDisplay(row, managedItemById = new Map()) {
    const componentId = String(row?.componentId || row?.systemItemId || '');
    const item = componentId ? managedItemById.get(componentId) : null;
    const itemUuid = String(row?.itemUuid || '');
    const unresolvedKey = 'FABRICATE.Admin.Manager.Environment.Tasks.UnresolvedDrop';
    const unresolved = services.localize?.(unresolvedKey);
    const fallbackName =
      unresolved && unresolved !== unresolvedKey ? unresolved : 'Unresolved drop';
    return {
      name: String(row?.name || item?.name || itemUuid || fallbackName),
      img: String(row?.img || item?.img || 'icons/svg/item-bag.svg'),
    };
  }

  function _dropRateAdjustmentSummary({ kind, record, environment, managedItemById = new Map() }) {
    const id = String(record?.id || '');
    if (!id)
      return {
        hasDropRateAdjustment: false,
        dropRateAdjustment: 0,
        dropRateAdjustmentsEnabled: true,
        dropRateAdjustmentRows: [],
      };
    if (kind === 'event') {
      const adjustments = _normalizeDraftDropRateAdjustmentMap(
        environment?.eventDropRateAdjustments
      );
      const adjustment = adjustments[id] || 0;
      const eventEnabledMap = _normalizeDraftEventDropRateAdjustmentsEnabled(
        environment?.eventDropRateAdjustmentsEnabled
      );
      const dropRateAdjustmentsEnabled = eventEnabledMap[id] !== false;
      const appliedAdjustment = dropRateAdjustmentsEnabled ? adjustment : 0;
      const baseDropRate = Number.isFinite(Number(record?.dropRate))
        ? Math.floor(Number(record.dropRate))
        : 1;
      return {
        hasDropRateAdjustment: dropRateAdjustmentsEnabled && adjustment !== 0,
        hasStoredDropRateAdjustment: adjustment !== 0,
        dropRateAdjustment: adjustment,
        dropRateAdjustmentsEnabled,
        baseDropRate,
        effectiveDropRate: _effectiveDropRate(baseDropRate, appliedAdjustment),
        dropRateAdjustmentRows: [],
      };
    }

    const taskAdjustments = _normalizeDraftTaskDropRateAdjustments(
      environment?.taskDropRateAdjustments
    );
    const taskAdjustmentEnabledMap = _normalizeDraftTaskDropRateAdjustmentsEnabled(
      environment?.taskDropRateAdjustmentsEnabled
    );
    const dropRateAdjustmentsEnabled = taskAdjustmentEnabledMap[id] !== false;
    const rowAdjustments = taskAdjustments[id] || {};
    const rows = (
      Array.isArray(record?.dropRows ?? record?.itemDrops)
        ? (record.dropRows ?? record.itemDrops)
        : []
    ).map((row) => {
      const rowId = String(row?.id || '');
      const adjustment = rowAdjustments[rowId] || 0;
      const appliedAdjustment = dropRateAdjustmentsEnabled ? adjustment : 0;
      const baseDropRate = Number.isFinite(Number(row?.dropRate))
        ? Math.floor(Number(row.dropRate))
        : 1;
      const display = _dropRowDisplay(row, managedItemById);
      return {
        id: rowId,
        name: display.name,
        img: display.img,
        componentId: String(row?.componentId || row?.systemItemId || ''),
        itemUuid: String(row?.itemUuid || ''),
        quantity:
          Number.isFinite(Number(row?.quantity)) && Number(row.quantity) > 0
            ? Number(row.quantity)
            : 1,
        baseDropRate,
        adjustment,
        effectiveDropRate: _effectiveDropRate(baseDropRate, appliedAdjustment),
        hasDropRateAdjustment: dropRateAdjustmentsEnabled && adjustment !== 0,
        hasStoredDropRateAdjustment: adjustment !== 0,
      };
    });
    const hasStoredDropRateAdjustment = rows.some((row) => row.hasStoredDropRateAdjustment);
    return {
      hasDropRateAdjustment: dropRateAdjustmentsEnabled && hasStoredDropRateAdjustment,
      hasStoredDropRateAdjustment,
      dropRateAdjustmentsEnabled,
      dropRateAdjustment: dropRateAdjustmentsEnabled
        ? rows.reduce((sum, row) => sum + row.adjustment, 0)
        : 0,
      dropRateAdjustmentRows: rows,
    };
  }

  function _emptyCompositionCounts() {
    return {
      availableTasks: 0,
      excludedTasks: 0,
      candidateTasks: 0,
      unavailableTasks: 0,
      availableEvents: 0,
      excludedEvents: 0,
      candidateEvents: 0,
      unavailableEvents: 0,
      diagnosticTasks: 0,
      diagnosticEvents: 0,
    };
  }

  function _compositionCounts(tasks, events) {
    const tally = (records) => {
      const available = records.filter((r) => r.runtimeState === 'available').length;
      const excluded = records.filter((r) => r.compositionState === 'excluded').length;
      const candidate = records.filter((r) => r.compositionState === 'candidate').length;
      const unavailable = records.filter(
        (r) => r.compositionState === 'includedButUnavailable'
      ).length;
      const diagnostic = records.filter(
        (r) => r.compositionState === 'notMatching' || r.compositionState === 'libraryDisabled'
      ).length;
      return { available, excluded, candidate, unavailable, diagnostic };
    };
    const t = tally(tasks);
    const h = tally(events);
    return {
      availableTasks: t.available,
      excludedTasks: t.excluded,
      candidateTasks: t.candidate,
      unavailableTasks: t.unavailable,
      diagnosticTasks: t.diagnostic,
      availableEvents: h.available,
      excludedEvents: h.excluded,
      candidateEvents: h.candidate,
      unavailableEvents: h.unavailable,
      diagnosticEvents: h.diagnostic,
    };
  }

  /**
   * Whether `environment` currently composes the library task/event `record`, mirroring the
   * runtime `GatheringRichStateService.composeEnvironment` filter chain exactly:
   *   library-enabled  AND  (matches OR force-included)  AND  the composition-mode include gate.
   * In manual mode a record is composed only when force-added, or when it both matches and is on
   * the enabled allow-list; a stale enabled entry for a non-matching record is NOT composed.
   */
  function _environmentComposesGatheringRecord(environment, record, kind, conditionSettings) {
    if (!record?.id || record.enabled === false) return false;
    const recordId = String(record.id);
    const includeDanger = kind === 'event';
    const mode = environment?.compositionMode === 'manual' ? 'manual' : 'automatic';
    const enabledKey = kind === 'event' ? 'enabledEventIds' : 'enabledTaskIds';
    const disabledKey = kind === 'event' ? 'disabledEventIds' : 'disabledTaskIds';
    const forcedKey = kind === 'event' ? 'forcedEventIds' : 'forcedTaskIds';
    const enabled = Array.isArray(environment?.[enabledKey])
      ? environment[enabledKey].map(String)
      : [];
    const disabled = Array.isArray(environment?.[disabledKey])
      ? environment[disabledKey].map(String)
      : [];
    const forced = Array.isArray(environment?.[forcedKey])
      ? environment[forcedKey].map(String)
      : [];
    if (mode === 'manual') {
      if (forced.includes(recordId)) return true;
      return (
        enabled.includes(recordId) &&
        _gatheringLibraryRecordMatchesEnvironment(
          record,
          environment,
          {},
          includeDanger,
          conditionSettings
        )
      );
    }
    return (
      !disabled.includes(recordId) &&
      _gatheringLibraryRecordMatchesEnvironment(
        record,
        environment,
        {},
        includeDanger,
        conditionSettings
      )
    );
  }

  /**
   * Environments in `systemId` that currently compose (surface) the task/event `record`. Mirrors
   * runtime composition so callers see exactly the environments a record actually appears in today.
   */
  function _gatheringLibraryRecordSurfacingEnvironments(systemId, record, kind) {
    if (!record?.id) return [];
    const conditionSettings =
      _currentGatheringConfig().systems?.[String(systemId || '')]?.conditions || null;
    const usages = [];
    for (const environment of _environmentList()) {
      if (String(environment?.craftingSystemId || '') !== String(systemId || '')) continue;
      if (!_environmentComposesGatheringRecord(environment, record, kind, conditionSettings))
        continue;
      usages.push({
        id: String(environment.id || ''),
        name: String(environment.name || environment.id || 'Unnamed environment'),
      });
    }
    return usages;
  }

  function _gatheringLibraryRecordUsages(systemId, record, kind) {
    if (!record?.id) return [];
    // Only tasks and events are surfaced into environments. Tools are referenced by tasks via
    // their `toolIds`, not by environments, so an environment-level usage scan does not apply to
    // them (the previous `enabledTaskIds` lookup could only ever match on an id collision).
    if (kind !== 'task' && kind !== 'event') return [];
    return _gatheringLibraryRecordSurfacingEnvironments(systemId, record, kind);
  }

  function _gatheringCurrentConditions(conditionSettings) {
    return {
      weather: conditionSettings?.weather?.current || DEFAULT_GATHERING_CONDITIONS.weather,
      timeOfDay: conditionSettings?.timeOfDay?.current || DEFAULT_GATHERING_CONDITIONS.timeOfDay,
    };
  }

  async function _confirmGatheringLibraryRecordDelete({ systemId, record, kind }) {
    const usages = _gatheringLibraryRecordUsages(systemId, record, kind);
    const label = kind === 'event' ? 'event' : kind === 'tool' ? 'tool' : 'task';
    const recordLabel = record?.label || record?.name || record?.id || label;
    const name = _escapeHtml(recordLabel);
    let content = `<p>Delete ${label} <strong>${name}</strong>? This cannot be undone.</p>`;
    if (usages.length > 0) {
      const names = usages.slice(0, 6).map((usage) => _escapeHtml(usage.name));
      if (usages.length > 6) names.push(_escapeHtml(`and ${usages.length - 6} more`));
      const plural = usages.length === 1 ? 'environment' : 'environments';
      content += `<p>Used by ${usages.length} ${plural}: ${names.join(', ')}.</p>`;
    }
    return (
      (await services.confirmDialog?.({
        title: `Delete ${label}?`,
        content,
        yes: () => true,
        no: () => false,
      })) === true
    );
  }

  /**
   * Enumerate the environments in `systemId` that compose `oldRecord` today but would no longer
   * compose `newRecord` after the edit — i.e. where saving would silently remove the record. This
   * covers any cause of removal the editors allow: losing a region/biome/danger match, or
   * disabling the record outright (which drops it from every environment, including force-included
   * rows). Records that remain composed after the edit are excluded.
   */
  function _gatheringLibraryRecordCompositionLossEnvironments(
    systemId,
    oldRecord,
    newRecord,
    kind
  ) {
    // A library-disabled record is not composed anywhere, so there is nothing to lose by editing it.
    if (!oldRecord?.id || oldRecord.enabled === false) return [];
    const conditionSettings =
      _currentGatheringConfig().systems?.[String(systemId || '')]?.conditions || null;
    const affected = [];
    for (const environment of _environmentList()) {
      if (String(environment?.craftingSystemId || '') !== String(systemId || '')) continue;
      const composedBefore = _environmentComposesGatheringRecord(
        environment,
        oldRecord,
        kind,
        conditionSettings
      );
      const composedAfter = _environmentComposesGatheringRecord(
        environment,
        newRecord,
        kind,
        conditionSettings
      );
      if (!(composedBefore && !composedAfter)) continue;
      affected.push({
        id: String(environment.id || ''),
        name: String(environment.name || environment.id || 'Unnamed environment'),
        mode: environment?.compositionMode === 'manual' ? 'manual' : 'automatic',
      });
    }
    return affected;
  }

  async function _confirmGatheringLibraryRecordCompositionLoss({
    systemId,
    oldRecord,
    newRecord,
    kind,
  }) {
    const affected = _gatheringLibraryRecordCompositionLossEnvironments(
      systemId,
      oldRecord,
      newRecord,
      kind
    );
    if (affected.length === 0) return true;
    const localizeFn = services.localize;
    const base =
      kind === 'event'
        ? 'FABRICATE.Admin.Manager.Environment.Events.CompositionLossWarning'
        : 'FABRICATE.Admin.Manager.Environment.Tasks.CompositionLossWarning';
    const recordWord = kind === 'event' ? 'event' : 'task';
    const title =
      localizeFn?.(`${base}.Title`) || `This ${recordWord} will leave some environments`;
    const body =
      localizeFn?.(`${base}.Body`) || `Saving removes this ${recordWord} from these environments:`;
    const names = affected.slice(0, 6).map((usage) => _escapeHtml(usage.name));
    if (affected.length > 6) names.push(_escapeHtml(`and ${affected.length - 6} more`));
    const content = `<p>${_escapeHtml(body)} ${names.join(', ')}.</p>`;
    return (
      (await services.confirmDialog?.({
        title,
        content,
        yes: {
          label: localizeFn?.(`${base}.Confirm`) || 'Save Anyway',
          callback: () => true,
        },
        no: {
          label: localizeFn?.(`${base}.Cancel`) || 'Keep Editing',
          callback: () => false,
        },
      })) === true
    );
  }

  /**
   * Announce (non-blocking) that disabling a library task/event removed it from the environments
   * that composed it. Fires only on a true enable→disable transition with at least one affected
   * environment; covers both the library-list toggle and the editor save, since both flow through
   * the `updateGatheringLibrary*` store methods.
   */
  function _notifyGatheringLibraryRecordDisabled({ systemId, oldRecord, nextRecord, kind }) {
    if (!(oldRecord?.enabled !== false && nextRecord?.enabled === false)) return;
    const affected = _gatheringLibraryRecordSurfacingEnvironments(systemId, oldRecord, kind);
    if (affected.length === 0) return;
    const names = affected.slice(0, 6).map((usage) => usage.name);
    if (affected.length > 6) names.push(`and ${affected.length - 6} more`);
    const name =
      oldRecord?.label || oldRecord?.name || oldRecord?.id || (kind === 'event' ? 'event' : 'task');
    const key =
      kind === 'event'
        ? 'FABRICATE.Admin.Manager.Environment.Events.DisabledNotice'
        : 'FABRICATE.Admin.Manager.Environment.Tasks.DisabledNotice';
    const data = { name, count: affected.length, environments: names.join(', ') };
    const fallback = `Disabled ${kind === 'event' ? 'event' : 'task'} “${name}” — no longer available in ${affected.length} environment(s): ${data.environments}.`;
    const message = services.localize?.(key, data) || fallback;
    services.notify?.warn?.(message);
  }

  async function confirmGatheringLibraryTaskCompositionLoss(
    systemId = get(selectedSystemId),
    taskId,
    draft = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    const existing = systemConfig?.tasks?.find((task) => task.id === taskId);
    if (!existing) return true;
    const newRecord = _normalizeGatheringTask({ ...existing, ...draft }, _randomID);
    if (newRecord.enabled === false) return true; // disabling is announced via notification, not a dialog
    return _confirmGatheringLibraryRecordCompositionLoss({
      systemId,
      oldRecord: existing,
      newRecord,
      kind: 'task',
    });
  }

  async function confirmGatheringLibraryEventCompositionLoss(
    systemId = get(selectedSystemId),
    eventId,
    draft = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    const existing = systemConfig?.events?.find((event) => event.id === eventId);
    if (!existing) return true;
    const newRecord = _normalizeGatheringEvent({ ...existing, ...draft }, _randomID);
    if (newRecord.enabled === false) return true; // disabling is announced via notification, not a dialog
    return _confirmGatheringLibraryRecordCompositionLoss({
      systemId,
      oldRecord: existing,
      newRecord,
      kind: 'event',
    });
  }

  function _selectedManagedItemOptions() {
    const systemManager = services.getCraftingSystemManager();
    const selectedSystem = systemManager?.getSystem?.(get(selectedSystemId)) || null;
    return _buildManagedItemOptions(_getManagedItems(selectedSystem));
  }

  function _managerReady(manager) {
    return !!manager && (manager.initialized === true || manager.initialized === undefined);
  }

  function _fabricateReady(systemManager, recipeManager) {
    if (typeof services.isFabricateReady === 'function') {
      return services.isFabricateReady() === true;
    }
    return _managerReady(systemManager) && _managerReady(recipeManager);
  }

  function _publishSystemsLoading() {
    viewState.update((prev) => ({
      ...prev,
      systemsLoading: true,
      hasSystem: prev.systems.length > 0 ? prev.hasSystem : false,
      selectedSystemName: prev.systems.length > 0 ? prev.selectedSystemName : '',
      selectedSystem: prev.systems.length > 0 ? prev.selectedSystem : null,
      itemCards: [],
      essenceCards: prev.systems.length > 0 ? prev.essenceCards : [],
      recipes: [],
      recipeCategories: [],
      showVisibilitySummary: false,
      recipeSearchTerm: get(recipeSearch),
      itemSearchTerm: get(itemSearch),
    }));
  }

  function _scheduleReadyRefresh() {
    if (readyRefreshScheduled) return;
    if (typeof services.onFabricateReady !== 'function') return;
    readyRefreshScheduled = true;
    unsubscribeFabricateReady = services.onFabricateReady(async () => {
      readyRefreshScheduled = false;
      unsubscribeFabricateReady = null;
      await refresh();
    });
  }

  function _scheduleExternalRefresh() {
    if (destroyed || externalRefreshScheduled) return;
    externalRefreshScheduled = true;
    const schedule =
      typeof queueMicrotask === 'function'
        ? queueMicrotask
        : (callback) => Promise.resolve().then(callback);
    schedule(async () => {
      externalRefreshScheduled = false;
      if (destroyed) return;
      await refresh();
    });
  }

  function _subscribeExternalDataChanges() {
    if (typeof services.onFabricateDataChanged !== 'function') return null;
    return services.onFabricateDataChanged(() => {
      _scheduleExternalRefresh();
    });
  }

  function _newEnvironmentResultGroup(existingGroups = []) {
    const baseName =
      services.localize?.('FABRICATE.Admin.Environments.NewResultGroupName') || 'Results';
    const existingNames = new Set(
      (Array.isArray(existingGroups) ? existingGroups : [])
        .map((group) =>
          String(group?.name || '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    );
    let name = baseName;
    let suffix = 2;
    while (existingNames.has(name.trim().toLowerCase())) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }
    return {
      id: _randomID(),
      name,
      results: [],
    };
  }

  function _newEnvironmentResult() {
    const firstComponent = _selectedManagedItemOptions()[0];
    return {
      id: _randomID(),
      componentId: firstComponent?.id || null,
      quantity: 1,
      propertyMacroUuid: null,
    };
  }

  function _newEnvironmentDraft(systemId) {
    return {
      craftingSystemId: systemId,
      name:
        services.localize?.('FABRICATE.Admin.Environments.NewEnvironmentName') ||
        'New Gathering Environment',
      description: '',
      enabled: false,
      selectionMode: 'targeted',
      dangerLevel: 'safe',
      sceneUuid: null,
    };
  }

  function _hasDirtyEnvironmentDraft() {
    return get(environmentDraftDirty) === true && !!get(environmentDraft);
  }

  async function confirmDiscardDirtyEnvironmentDraft() {
    if (!_hasDirtyEnvironmentDraft()) return 'discard';
    if (dirtyEnvironmentDiscardConfirmation) return dirtyEnvironmentDiscardConfirmation;

    const localizeFn = services.localize;
    dirtyEnvironmentDiscardConfirmation = (async () => {
      try {
        const content = `<p>${
          localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyContent') ||
          'The current gathering environment has unsaved changes. Save them and continue?'
        }</p>`;
        if (typeof services.choiceDialog !== 'function') {
          // Fall back to the two-way confirm when no three-way dialog is available.
          const confirmed = await services.confirmDialog?.({
            title:
              localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyTitle') ||
              'Discard unsaved environment changes?',
            content,
            yes: {
              label:
                localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyConfirm') ||
                'Discard Changes',
              callback: () => true,
            },
            no: {
              label:
                localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyCancel') || 'Keep Editing',
              callback: () => false,
            },
          });
          return confirmed === true ? 'discard' : 'cancel';
        }
        const action = await services.choiceDialog({
          title:
            localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Title') ||
            'Save unsaved changes?',
          content,
          choices: [
            {
              action: 'save',
              label: localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Save') || 'Save',
              icon: 'fas fa-save',
            },
            {
              action: 'discard',
              label:
                localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Discard') ||
                'Discard Changes',
              icon: 'fas fa-trash',
            },
            {
              action: 'cancel',
              label:
                localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Cancel') || 'Keep Editing',
              icon: 'fas fa-times',
            },
          ],
          defaultAction: 'save',
        });
        return action === 'save' || action === 'discard' ? action : 'cancel';
      } finally {
        dirtyEnvironmentDiscardConfirmation = null;
      }
    })();

    return dirtyEnvironmentDiscardConfirmation;
  }

  // Resolve a dirty environment draft for an action that would leave it: returns
  // true to proceed, false to abort. On 'save' the draft is persisted (abort if
  // it fails validation); on 'discard' we proceed (callers replace draft state).
  async function _proceedAfterDirtyEnvironmentConfirm() {
    const action = await confirmDiscardDirtyEnvironmentDraft();
    if (action === 'cancel') return false;
    if (action === 'save') {
      const result = await saveEnvironmentDraft();
      return result?.ok !== false;
    }
    return true;
  }

  async function _discardDirtyEnvironmentDraftForNavigation() {
    if (!_hasDirtyEnvironmentDraft()) return true;
    const action = await confirmDiscardDirtyEnvironmentDraft();
    if (action === 'cancel') return false;
    if (action === 'save') {
      const result = await saveEnvironmentDraft();
      return result?.ok !== false;
    }
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
          services.localize?.('FABRICATE.Admin.Environments.StoreUnavailable') ||
          'Gathering environment store is not available.',
      });
    }

    try {
      const rawEnvironments = await environmentStore.listBySystem(selectedSystem.id);
      const environments = _clonePlain(Array.isArray(rawEnvironments) ? rawEnvironments : []);
      const environmentTaskCounts = {};
      for (const environment of environments) {
        const counts = _buildEnvironmentCompositionViewModel(environment)?.counts || {};
        environmentTaskCounts[String(environment.id)] = {
          availableTaskCount: counts.availableTasks || 0,
          availableEventCount: counts.availableEvents || 0,
        };
      }
      let environmentId = get(selectedEnvironmentId);
      const canKeepNewDraft =
        get(environmentDraftIsNew) &&
        get(environmentDraftDirty) &&
        get(environmentDraft)?.craftingSystemId === selectedSystem.id;

      if (canKeepNewDraft) {
        environmentId = '';
      } else if (!environments.some((environment) => environment.id === environmentId)) {
        environmentId = environments[0]?.id || '';
        selectedEnvironmentId.set(environmentId);
      }

      if (!canKeepNewDraft) {
        const persistedDraft = environmentId
          ? _clonePlain(
              environments.find((environment) => environment.id === environmentId) || null
            )
          : null;
        const canPreserveDirtyDraft =
          get(environmentDraftDirty) &&
          get(environmentDraft)?.id === environmentId &&
          get(environmentDraft)?.craftingSystemId === selectedSystem.id;

        if (!canPreserveDirtyDraft) {
          _setEnvironmentDraftState(persistedDraft, {
            persistedDraft,
            dirty: false,
            isNew: false,
            saveError: null,
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
        environmentTaskCounts,
        ..._currentEnvironmentViewPatch(),
      };
    } catch (err) {
      return _clearEnvironmentDraftState({
        canShowEnvironmentsTab: true,
        error: _environmentErrorMessage(err),
      });
    }
  }

  // --- refresh ---
  async function refresh() {
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    if (!_fabricateReady(systemManager, recipeManager)) {
      _publishSystemsLoading();
      _scheduleReadyRefresh();
      return;
    }

    const allSystems = systemManager.getSystems();
    const currentSystemId = get(selectedSystemId);
    const fallbackSystemId = allSystems[0]?.id || '';
    let resolvedSystemId = currentSystemId;
    if (!currentSystemId || !allSystems.find((s) => s.id === currentSystemId)) {
      resolvedSystemId = fallbackSystemId;
      if (resolvedSystemId !== currentSystemId) selectedSystemId.set(resolvedSystemId);
    }

    // Build system list after resolving selection so the library row highlight matches view state.
    const systemList = allSystems.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      enabled: s.enabled !== false,
      resolutionMode: s.resolutionMode || 'simple',
      featureCount: Object.values(s.features || {}).filter((value) => value === true).length,
      componentCount: _getManagedItems(s).length,
      recipeCount: recipeManager.getRecipes({ craftingSystemId: s.id }).length,
      selected: s.id === resolvedSystemId,
    }));

    const selectedSystem = resolvedSystemId
      ? allSystems.find((s) => s.id === resolvedSystemId) || null
      : null;

    const availableScriptMacros = services.getScriptMacros?.() || [];
    const sceneOptions = services.getSceneOptions?.() || [];
    // Non-GM world users, for the per-recipe "restrict to specific users" editor.
    // Sourced through the injected service so the store never touches `game.*`.
    const worldUsers = services.getWorldUsers?.() || [];
    // Every world actor with its control set (see getAccessCharacterActors): the
    // rail resolves granted character ids over this, NOT the PC-filtered roster.
    const accessCharacters = services.getAccessCharacterActors?.() || [];

    let selectedSystemData = null;
    let essenceCards = [];
    let recipeListData = { recipes: [], recipeCategories: [], showVisibilitySummary: false };

    if (selectedSystem) {
      const managedItems = _getManagedItems(selectedSystem);
      const managedItemOptions = _buildManagedItemOptions(managedItems);
      const componentTagOptions = _buildComponentTagOptions(managedItems);
      const managedItemById = new Map(managedItemOptions.map((item) => [item.id, item]));

      const rawEssenceDefinitions = Array.isArray(selectedSystem.essenceDefinitions)
        ? selectedSystem.essenceDefinitions
        : [];
      const essenceDefinitions = rawEssenceDefinitions.map((def) => {
        const sourceComponentId = _sourceComponentIdForEssence(def, managedItemById);
        const sourceItem = managedItemById.get(sourceComponentId) || null;
        const associatedItem = sourceItem
          ? { id: sourceItem.id, name: sourceItem.name, img: sourceItem.img }
          : null;
        return {
          ...def,
          sourceComponentId,
          associatedSystemItemId: sourceComponentId || null,
          associatedItem,
          associatedItemName: associatedItem?.name || null,
        };
      });
      essenceCards = _buildEssenceCards(essenceDefinitions, managedItems, managedItemOptions);

      selectedSystemData = _buildSelectedSystemViewData(
        selectedSystem,
        managedItemOptions,
        componentTagOptions,
        essenceDefinitions,
        availableScriptMacros,
        sceneOptions
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
    // manager can paint its selected rail, menu, and inspector before slower
    // item/environment work finishes.
    viewState.update((prev) => ({
      ...prev,
      systems: systemList,
      systemsLoading: false,
      hasSystem: !!selectedSystem,
      selectedSystemName: selectedSystem?.name || '',
      selectedSystem: selectedSystemData,
      essenceCards,
      experimentalFeaturesEnabled: services.getSetting?.('experimentalFeatures') === true,
      gatheringConfig: _clonePlain(_currentGatheringConfig()),
      recipes: recipeListData.recipes,
      recipeCategories: recipeListData.recipeCategories,
      showVisibilitySummary: recipeListData.showVisibilitySummary,
      worldUsers,
      accessCharacters,
      recipeSearchTerm: get(recipeSearch),
      itemSearchTerm: get(itemSearch),
    }));
    await Promise.resolve();

    let itemCards = [];
    if (selectedSystem) {
      const showTags = true;
      const showEssences = selectedSystem.features?.essences === true;
      const essenceDefinitionById = new Map(
        (selectedSystemData?.essenceDefinitions || []).map((def) => [def.id, def])
      );

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

    // Books & Scrolls library (issue 511): batch-resolve each recipe item's linked
    // game-world item and derive its recipes[]/learnedByCount now that the recipe
    // list is built. Overwrites the phase-1 synchronous fallback in place so the
    // phase-2 publish carries the fully enriched projection.
    if (selectedSystemData) {
      // Build a NEW selectedSystemData for the phase-2 publish rather than mutating
      // the phase-1 object in place. The two publishes must be DIFFERENT references:
      // Svelte's `selectedSystem` `$derived` only re-propagates the enriched
      // recipeItemDefinitions to the UI when the parent object's reference changes,
      // so an in-place mutation left the Books & Scrolls counts stuck on the phase-1
      // empty projection after any refresh (e.g. switching visibility mode).
      selectedSystemData = {
        ...selectedSystemData,
        recipeItemDefinitions: await _enrichRecipeItemLibrary(
          selectedSystemData.recipeItemDefinitions,
          recipeListData.recipes
        ),
      };
    }

    // The derived system-validation report. Reads the system's recipes /
    // components and the environments just listed (each annotated with its
    // composition view-model). Computed once per refresh for the GM overview.
    const systemValidation = _buildSystemValidationReport(
      selectedSystem,
      Array.isArray(environmentState.environments) ? environmentState.environments : []
    );

    // --- Graph data (lazy, computed only when graph tab is active) ---
    let graphData = { nodes: [], edges: [], width: 0, height: 0 };
    if (get(activeTab) === 'graph' && selectedSystem) {
      const allRecipes = recipeManager.getRecipes({ craftingSystemId: selectedSystem.id });
      const components = _getManagedItems(selectedSystem);
      const rawGraph = buildRecipeGraph(allRecipes, components);
      const layoutResult = layoutGraph(rawGraph);
      graphData = filterGraph(layoutResult, { searchTerm: get(graphSearch) });
    }

    viewState.update((prev) => ({
      ...prev,
      systems: systemList,
      systemsLoading: false,
      hasSystem: !!selectedSystem,
      selectedSystemName: selectedSystem?.name || '',
      selectedSystem: selectedSystemData,
      itemCards,
      essenceCards,
      experimentalFeaturesEnabled: services.getSetting?.('experimentalFeatures') === true,
      gatheringConfig: _clonePlain(_currentGatheringConfig()),
      recipes: recipeListData.recipes,
      recipeCategories: recipeListData.recipeCategories,
      showVisibilitySummary: recipeListData.showVisibilitySummary,
      worldUsers,
      accessCharacters,
      systemValidation,
      recipeSearchTerm: get(recipeSearch),
      itemSearchTerm: get(itemSearch),
      graphData,
      graphSearchTerm: get(graphSearch),
      ...environmentState,
      ...travel.buildState(),
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
    if (!(await _proceedAfterDirtyEnvironmentConfirm())) return false;

    selectedSystemId.set(systemId);
    selectedEnvironmentId.set('');
    selectedEnvironmentSystemId.set(systemId || '');
    _setEnvironmentDraftState(null, { persistedDraft: null });
    await services.setSetting('lastManagedCraftingSystem', systemId);
    await refresh();
    return true;
  }

  async function createSystem() {
    if (!(await _proceedAfterDirtyEnvironmentConfirm())) return null;

    const systemManager = services.getCraftingSystemManager();
    const name = _nextSystemName(systemManager);
    const description =
      'Configure categories, item tags, essences, and crafting behaviour for this system.';
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
      content: `<p>Delete crafting system <strong>${system.name}</strong>?</p><p>Linked recipes, gathering environments, gathering tools and tasks, and any in-progress or historical crafting, salvage, and gathering runs for this system will be removed.</p>`,
      yes: () => true,
      no: () => false,
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

  async function saveSystemDetails(name, description) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { name, description });
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

    // Dry-run the migration so the GM sees accurate migrate/delete counts before
    // committing. Migration-first: recipes are migrated to the new mode wherever
    // possible and only the structurally un-migratable ones are deleted.
    const affectedRecipes = recipeManager?.getRecipes?.({ craftingSystemId: sysId }) || [];
    const deletedNames = [];
    let migrateCount = 0;
    for (const recipe of affectedRecipes) {
      const recipeJSON = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
      const { outcome } = classifyModeChange(recipeJSON, currentMode, nextMode, system);
      if (outcome === 'delete') {
        deletedNames.push(recipe.name || recipe.id);
      } else {
        migrateCount += 1;
      }
    }

    const localizeFn = services.localize;
    const modeLabel = _resolutionModeLabel(nextMode, localizeFn);
    const content =
      deletedNames.length > 0
        ? localizeFn?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeContentDelete', {
            count: migrateCount,
            deleteCount: deletedNames.length,
            names: deletedNames.join(', '),
            mode: modeLabel,
          }) ||
          `${migrateCount} recipe(s) will be migrated to ${modeLabel}; ${deletedNames.length} cannot be migrated and will be deleted: ${deletedNames.join(', ')}.`
        : localizeFn?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeContent', {
            count: migrateCount,
            mode: modeLabel,
          }) || `${migrateCount} recipe(s) will be migrated to ${modeLabel}.`;
    const confirmed = await services.confirmDialog({
      title:
        localizeFn?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeTitle') ||
        'Change Resolution Mode?',
      content: `<p>${content}</p>`,
      yes: () => true,
      no: () => false,
    });
    if (!confirmed) return false;

    await systemManager.updateSystem(sysId, { resolutionMode: nextMode });
    await refresh();
    return true;
  }

  // Flat system-level visibility strategy (issue 511, PR-B). Non-destructive:
  // unlike setResolutionMode, switching visibilityMode migrates no recipes and
  // needs no confirm — it only re-gates the Crafting authoring surface. Just
  // persist the new enum and refresh so the projection's craftingEffect updates.
  async function setVisibilityMode(mode) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { visibilityMode: mode });
    await refresh();
  }

  // Salvage resolution mode is non-destructive: updateSystem runs only the inline
  // salvage-cleanup block (_disableInvalidSalvageConfigs), which reversibly disables
  // salvage on components incompatible with the new mode. It deletes no recipes or
  // runs, so the confirm is salvage-accurate, not the recipe-deletion warning.
  async function setSalvageResolutionMode(salvageResolutionMode) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;

    const system = systemManager.getSystem(sysId);
    if (!system) return false;

    const nextMode = String(salvageResolutionMode || '').trim() || 'progressive';
    const currentMode = system.salvageResolutionMode || 'simple';
    if (nextMode === currentMode) return true;

    const localizeFn = services.localize;
    const confirmed = await services.confirmDialog({
      title:
        localizeFn?.('FABRICATE.Admin.SystemSettings.SalvageResolutionModeChangeTitle') ||
        'Change Salvage Resolution Mode?',
      content: `<p>${
        localizeFn?.('FABRICATE.Admin.SystemSettings.SalvageResolutionModeChangeContent', {
          name: system.name,
          mode: nextMode,
        }) ||
        `Changing the salvage resolution mode for ${system.name}: components incompatible with the new salvage mode will have salvage disabled.`
      }</p>`,
      yes: () => true,
      no: () => false,
    });
    if (!confirmed) return false;

    await systemManager.updateSystem(sysId, { salvageResolutionMode: nextMode });
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
      if (!(await _discardDirtyEnvironmentDraftForNavigation())) return false;
    }
    activeTab.set(nextTab);
    await refresh();
    return true;
  }

  async function selectEnvironment(environmentId) {
    const nextEnvironmentId = environmentId || '';
    if (nextEnvironmentId === get(selectedEnvironmentId)) return true;
    if (!(await _proceedAfterDirtyEnvironmentConfirm())) return false;

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
    if (!(await _proceedAfterDirtyEnvironmentConfirm())) return null;

    selectedEnvironmentId.set('');
    _setEnvironmentDraftState(_newEnvironmentDraft(system.id), {
      persistedDraft: null,
      dirty: true,
      isNew: true,
      saveError: null,
    });
    _patchEnvironmentViewState();
    return _clonePlain(get(environmentDraft));
  }

  function _normalizeDraftBlindSelection(value) {
    if (!value || typeof value !== 'object') return null;
    const weights =
      value.weights && typeof value.weights === 'object'
        ? Object.fromEntries(
            Object.entries(value.weights)
              .map(([key, weight]) => [String(key), Number(weight)])
              .filter(([, weight]) => Number.isFinite(weight))
          )
        : {};
    if (Object.keys(weights).length === 0) return null;
    return { weights };
  }

  function _normalizeDraftDropRateAdjustmentValue(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < -100 || number > 100 || number === 0) return null;
    return number;
  }

  function _normalizeDraftDropRateAdjustmentMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([id, adjustment]) => [
          String(id || '').trim(),
          _normalizeDraftDropRateAdjustmentValue(adjustment),
        ])
        .filter(([id, adjustment]) => id && adjustment !== null)
    );
  }

  function _normalizeDraftTaskDropRateAdjustments(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([taskId, rowAdjustments]) => [
          String(taskId || '').trim(),
          _normalizeDraftDropRateAdjustmentMap(rowAdjustments),
        ])
        .filter(([taskId, rowAdjustments]) => taskId && Object.keys(rowAdjustments).length > 0)
    );
  }

  function _normalizeDraftTaskDropRateAdjustmentsEnabled(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([taskId, enabled]) => [String(taskId || '').trim(), enabled])
        .filter(([taskId, enabled]) => taskId && enabled === false)
    );
  }

  function _normalizeDraftEventDropRateAdjustmentsEnabled(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([eventId, enabled]) => [String(eventId || '').trim(), enabled])
        .filter(([eventId, enabled]) => eventId && enabled === false)
    );
  }

  function updateEnvironmentDraft(updates = {}) {
    const current = get(environmentDraft);
    if (!current || typeof updates !== 'object' || updates === null) return false;

    const allowed = new Set([
      'name',
      'description',
      'img',
      'enabled',
      'selectionMode',
      'compositionMode',
      'sceneUuid',
      'includedRealmIds',
      'biomes',
      'dangerTags',
      'dangerLevel',
      'eventSelectionMode',
      'eventPolicy',
      'enabledTaskIds',
      'disabledTaskIds',
      'enabledEventIds',
      'disabledEventIds',
      'forcedTaskIds',
      'forcedEventIds',
      'taskOrder',
      'eventOrder',
      'taskDropRateAdjustments',
      'taskDropRateAdjustmentsEnabled',
      'eventDropRateAdjustments',
      'eventDropRateAdjustmentsEnabled',
      'blindSelection',
      'nodeRuntime',
    ]);
    const next = _clonePlain(current);
    for (const [field, value] of Object.entries(updates)) {
      if (!allowed.has(field)) continue;
      if (field === 'enabled') {
        next.enabled = value === true;
      } else if (field === 'compositionMode') {
        next.compositionMode = value === 'manual' ? 'manual' : 'automatic';
      } else if (field === 'sceneUuid') {
        const normalized = String(value ?? '').trim();
        next.sceneUuid = normalized || null;
      } else if (field === 'img') {
        const normalized = String(value ?? '').trim();
        next.img = normalized || null;
      } else if (['biomes', 'dangerTags'].includes(field)) {
        next[field] = _normalizeGatheringTagList(value);
      } else if (
        [
          'includedRealmIds',
          'enabledTaskIds',
          'disabledTaskIds',
          'enabledEventIds',
          'disabledEventIds',
          'forcedTaskIds',
          'forcedEventIds',
          'taskOrder',
          'eventOrder',
        ].includes(field)
      ) {
        next[field] = Array.from(
          new Set(
            (Array.isArray(value) ? value : [])
              .map((entry) => String(entry || '').trim())
              .filter(Boolean)
          )
        );
      } else if (field === 'eventDropRateAdjustments') {
        next.eventDropRateAdjustments = _normalizeDraftDropRateAdjustmentMap(value);
      } else if (field === 'eventDropRateAdjustmentsEnabled') {
        next.eventDropRateAdjustmentsEnabled =
          _normalizeDraftEventDropRateAdjustmentsEnabled(value);
      } else if (field === 'taskDropRateAdjustments') {
        next.taskDropRateAdjustments = _normalizeDraftTaskDropRateAdjustments(value);
      } else if (field === 'taskDropRateAdjustmentsEnabled') {
        next.taskDropRateAdjustmentsEnabled = _normalizeDraftTaskDropRateAdjustmentsEnabled(value);
      } else if (field === 'blindSelection') {
        next.blindSelection = _normalizeDraftBlindSelection(value);
      } else if (field === 'nodeRuntime') {
        next.nodeRuntime = normalizeNodeRuntime(value);
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

  function _compositionFieldKeys(kind) {
    return kind === 'event'
      ? {
          enabledKey: 'enabledEventIds',
          disabledKey: 'disabledEventIds',
          orderKey: 'eventOrder',
          forcedKey: 'forcedEventIds',
        }
      : {
          enabledKey: 'enabledTaskIds',
          disabledKey: 'disabledTaskIds',
          orderKey: 'taskOrder',
          forcedKey: 'forcedTaskIds',
        };
  }

  function _compositionIdArray(value) {
    return Array.isArray(value)
      ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
  }

  function setEnvironmentCompositionMode(mode) {
    return updateEnvironmentDraft({ compositionMode: mode === 'manual' ? 'manual' : 'automatic' });
  }

  function includeEnvironmentRecord(kind, recordId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const id = String(recordId || '').trim();
    if (!id) return false;
    const { enabledKey, disabledKey, orderKey } = _compositionFieldKeys(kind);
    const enabled = _compositionIdArray(current[enabledKey]);
    const disabled = _compositionIdArray(current[disabledKey]).filter((entry) => entry !== id);
    const order = _compositionIdArray(current[orderKey]);
    if (!enabled.includes(id)) enabled.push(id);
    if (!order.includes(id)) order.push(id);
    return updateEnvironmentDraft({
      [enabledKey]: enabled,
      [disabledKey]: disabled,
      [orderKey]: order,
    });
  }

  function forceIncludeEnvironmentRecord(kind, recordId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const id = String(recordId || '').trim();
    if (!id) return false;
    const { disabledKey, orderKey, forcedKey } = _compositionFieldKeys(kind);
    const disabled = _compositionIdArray(current[disabledKey]).filter((entry) => entry !== id);
    const order = _compositionIdArray(current[orderKey]);
    const forced = _compositionIdArray(current[forcedKey]);
    if (!forced.includes(id)) forced.push(id);
    if (!order.includes(id)) order.push(id);
    return updateEnvironmentDraft({
      [forcedKey]: forced,
      [disabledKey]: disabled,
      [orderKey]: order,
    });
  }

  function excludeEnvironmentRecord(kind, recordId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const id = String(recordId || '').trim();
    if (!id) return false;
    const { enabledKey, disabledKey, forcedKey } = _compositionFieldKeys(kind);
    const enabled = _compositionIdArray(current[enabledKey]).filter((entry) => entry !== id);
    const forced = _compositionIdArray(current[forcedKey]).filter((entry) => entry !== id);
    const disabled = _compositionIdArray(current[disabledKey]).filter((entry) => entry !== id);
    if (current.compositionMode !== 'manual') disabled.push(id);
    return updateEnvironmentDraft({
      [enabledKey]: enabled,
      [disabledKey]: disabled,
      [forcedKey]: forced,
    });
  }

  function restoreEnvironmentRecord(kind, recordId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const id = String(recordId || '').trim();
    if (!id) return false;
    const { disabledKey } = _compositionFieldKeys(kind);
    const disabled = _compositionIdArray(current[disabledKey]).filter((entry) => entry !== id);
    return updateEnvironmentDraft({ [disabledKey]: disabled });
  }

  function reorderEnvironmentRecord(kind, fromIndex, toIndex) {
    const current = get(environmentDraft);
    if (!current) return false;
    const viewModel = _buildEnvironmentCompositionViewModel(current);
    const records = kind === 'event' ? viewModel.events : viewModel.tasks;
    const ids = records
      .filter((entry) =>
        kind === 'event'
          ? ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has(entry.compositionState)
          : entry.runtimeState === 'available' ||
            entry.compositionState === 'includedButUnavailable'
      )
      .map((entry) => entry.id);
    const from = Number(fromIndex);
    const to = Number(toIndex);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
    if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return false;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    const { orderKey } = _compositionFieldKeys(kind);
    return updateEnvironmentDraft({ [orderKey]: ids });
  }

  async function cancelEnvironmentDraft() {
    const persistedDraft = get(persistedEnvironmentDraft);
    if (persistedDraft) {
      selectedEnvironmentId.set(persistedDraft.id || '');
      _setEnvironmentDraftState(persistedDraft, {
        persistedDraft,
        dirty: false,
        isNew: false,
        saveError: null,
      });
    } else {
      const environments = get(viewState).environments || [];
      const fallback = environments[0] || null;
      selectedEnvironmentId.set(fallback?.id || '');
      _setEnvironmentDraftState(fallback, {
        persistedDraft: fallback,
        dirty: false,
        isNew: false,
        saveError: null,
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
      const message =
        services.localize?.('FABRICATE.Admin.Environments.StoreUnavailable') ||
        'Gathering environment data is not available.';
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
        saveError: null,
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
    if (!(await _proceedAfterDirtyEnvironmentConfirm())) return null;

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
        saveError: null,
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
      if (!(await _proceedAfterDirtyEnvironmentConfirm())) return false;
      await cancelEnvironmentDraft();
      return false;
    }

    const environmentStore = _getEnvironmentStore();
    if (!environmentStore?.delete) return false;

    const currentEnvironments = get(viewState).environments || [];
    const selectedIdBeforeDelete = get(selectedEnvironmentId);
    const deletingSelectedDraft =
      targetId === selectedIdBeforeDelete || targetId === get(environmentDraft)?.id;
    const targetIndex = currentEnvironments.findIndex((environment) => environment.id === targetId);
    const targetEnvironment =
      currentEnvironments.find((environment) => environment.id === targetId) ||
      get(environmentDraft);
    const environmentName = targetEnvironment?.name || targetId;
    const escapedEnvironmentName = _escapeHtml(environmentName);
    const confirmed = await services.confirmDialog?.({
      title:
        services.localize?.('FABRICATE.Admin.Environments.DeleteTitle', {
          name: escapedEnvironmentName,
        }) || `Delete ${escapedEnvironmentName}?`,
      content: `<p>${
        services.localize?.('FABRICATE.Admin.Environments.DeleteContent', {
          name: escapedEnvironmentName,
        }) ||
        `Delete gathering environment <strong>${escapedEnvironmentName}</strong>? This also cleans active and historical gathering runs that reference it.`
      }</p>`,
      yes: () => true,
      no: () => false,
    });
    if (!confirmed) return false;

    try {
      const deleted = await environmentStore.delete(targetId);
      if (!deleted) return false;
      const remaining = currentEnvironments.filter((environment) => environment.id !== targetId);
      if (deletingSelectedDraft) {
        const next =
          remaining[Math.min(Math.max(targetIndex, 0), Math.max(remaining.length - 1, 0))] || null;
        selectedEnvironmentId.set(next?.id || '');
        _setEnvironmentDraftState(next, {
          persistedDraft: next,
          dirty: false,
          isNew: false,
          saveError: null,
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
      if (selectedId && !environments.some((environment) => environment.id === selectedId)) {
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
    const index = environments.findIndex((environment) => environment.id === environmentId);
    if (index < 0) return [];

    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= environments.length) return environments;

    const ordered = environments.map((environment) => environment.id);
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
    const target = environments.find((environment) => environment.id === targetId);
    if (!target) return false;

    const nextEnabled = typeof enabled === 'boolean' ? enabled : target.enabled !== true;
    const payload = {
      ..._clonePlain(target),
      enabled: nextEnabled,
    };

    try {
      const saved = _clonePlain((await environmentStore.update(targetId, payload)) || payload);
      if (get(selectedEnvironmentId) === targetId || get(environmentDraft)?.id === targetId) {
        if (get(environmentDraftDirty)) {
          const currentDraft = _clonePlain(get(environmentDraft));
          if (currentDraft?.id === targetId) {
            environmentDraft.set({
              ...currentDraft,
              enabled: saved.enabled === true,
            });
            persistedEnvironmentDraft.set(saved);
          }
        } else {
          _setEnvironmentDraftState(saved, {
            persistedDraft: saved,
            dirty: false,
            isNew: false,
            saveError: null,
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

  // Add or remove a realm "tag" on a specific environment's includedRealmIds,
  // persisting immediately. Driven from the Realms tab membership editor; the
  // inverse of the environment editor's own realm selector.
  async function setEnvironmentRealmMembership(environmentId, realmId, included) {
    const targetId = environmentId || '';
    const realm = String(realmId ?? '');
    if (!targetId || !realm) return false;

    const environmentStore = _getEnvironmentStore();
    if (!environmentStore?.update) return false;

    const environments = get(viewState).environments || [];
    const target = environments.find((environment) => environment.id === targetId);
    if (!target) return false;

    const current = Array.isArray(target.includedRealmIds) ? target.includedRealmIds : [];
    const has = current.includes(realm);
    if (included === has) return true; // already in the desired state
    const nextIds = included ? [...current, realm] : current.filter((id) => id !== realm);
    const payload = {
      ..._clonePlain(target),
      includedRealmIds: nextIds,
    };

    try {
      const saved = _clonePlain((await environmentStore.update(targetId, payload)) || payload);
      if (get(selectedEnvironmentId) === targetId || get(environmentDraft)?.id === targetId) {
        if (get(environmentDraftDirty)) {
          const currentDraft = _clonePlain(get(environmentDraft));
          if (currentDraft?.id === targetId) {
            environmentDraft.set({
              ...currentDraft,
              includedRealmIds: Array.isArray(saved.includedRealmIds)
                ? saved.includedRealmIds
                : nextIds,
            });
            persistedEnvironmentDraft.set(saved);
          }
        } else {
          _setEnvironmentDraftState(saved, {
            persistedDraft: saved,
            dirty: false,
            isNew: false,
            saveError: null,
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
    if (key === 'gathering' && enabled !== true && !(await _proceedAfterDirtyEnvironmentConfirm()))
      return false;
    await systemManager.updateSystem(sysId, { features: { [key]: enabled } });
    await refresh();
    return true;
  }

  async function toggleSystemEnabled(systemId, enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = systemId || get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { enabled: enabled === true });
    await refresh();
    return true;
  }

  // Tool-breakage authority (issue 419): "toolSpecific" (each tool's own mode +
  // legacy breakTools) | "checkDriven" (the active check's checkBreakage decides
  // breakage for all required tools). Persisted as a system-level field; the engine
  // normalizer coerces unknown/missing to "toolSpecific".
  async function setToolBreakageAuthority(authority) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;
    const nextAuthority = authority === 'checkDriven' ? 'checkDriven' : 'toolSpecific';
    await systemManager.updateSystem(sysId, { toolBreakage: { authority: nextAuthority } });
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

    const requirements = JSON.parse(
      JSON.stringify(
        system.requirements || {
          time: { enabled: false },
          currency: { enabled: false, units: [] },
        }
      )
    );
    requirements[requirement] = requirements[requirement] || {};
    requirements[requirement].enabled = enabled;
    if (requirement === 'currency') {
      requirements.currency = normalizeCurrencyConfig(requirements.currency, {
        randomID: _randomID,
      });
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
    const categories = normalizeCustomRecipeCategories([
      ...(system.categories || []),
      value.trim(),
    ]);
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
    const categories = normalizeCustomRecipeCategories(
      (system.categories || []).filter((c) => c !== category)
    );
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
    const tags = (system.itemTags || system.tags || []).filter((t) => t !== tag);
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
      (def) => String(def.name || '').toLowerCase() === normalizedName.toLowerCase()
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
        ...sourceFields,
      },
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
    const current = existing.find((def) => def.id === essenceId);
    if (!current) return false;

    const nextName = Object.prototype.hasOwnProperty.call(updates, 'name')
      ? String(updates.name || '').trim()
      : String(current.name || '').trim();
    if (!nextName) return false;

    const duplicate = existing.some(
      (def) =>
        def.id !== essenceId &&
        String(def.name || '')
          .trim()
          .toLowerCase() === nextName.toLowerCase()
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
    const hasSourceUpdate =
      Object.prototype.hasOwnProperty.call(updates, 'sourceComponentId') ||
      Object.prototype.hasOwnProperty.call(updates, 'sourceItemUuid');
    const nextSourceFields = hasSourceUpdate
      ? _sourceFieldsForEssenceSelection(
          system,
          Object.prototype.hasOwnProperty.call(updates, 'sourceComponentId')
            ? updates.sourceComponentId || null
            : null,
          Object.prototype.hasOwnProperty.call(updates, 'sourceItemUuid')
            ? updates.sourceItemUuid || null
            : null
        )
      : null;

    const essenceDefinitions = existing.map((def) => {
      if (def.id !== essenceId) return def;
      const nextDefinition = {
        ...def,
        name: nextName,
        description: nextDescription,
        icon: nextIcon,
      };
      if (!hasSourceUpdate) return nextDefinition;
      return {
        ...nextDefinition,
        ...nextSourceFields,
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
    const essence = (system.essenceDefinitions || []).find((def) => def.id === essenceId);
    if (!essence) return;

    const confirmed = await services.confirmDialog({
      title: `Delete ${essence.name}?`,
      content: `<p>Delete essence <strong>${essence.name}</strong> and remove it from recipes in this system?</p>`,
      yes: () => true,
      no: () => false,
    });
    if (!confirmed) return;

    await systemManager.deleteEssence(sysId, essenceId);
    await refresh();
  }

  async function updateGatheringConditions(updates = {}) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, updates.systemId || get(selectedSystemId));
    if (!systemConfig) return false;
    const nextConditions = systemConfig.conditions;
    if (updates.weather !== undefined) {
      const weather = _normalizeGatheringConditionId(updates.weather);
      if (nextConditions.weather.values.some((option) => option.id === weather))
        nextConditions.weather.current = weather;
    }
    if (updates.timeOfDay !== undefined) {
      const timeOfDay = _normalizeGatheringConditionId(updates.timeOfDay);
      if (nextConditions.timeOfDay.values.some((option) => option.id === timeOfDay))
        nextConditions.timeOfDay.current = timeOfDay;
    }
    config.conditions = _gatheringCurrentConditions(nextConditions);
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function updateGatheringVocabulary(kind, values) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_GATHERING_VOCABULARIES, kind)) return false;
    const config = _currentGatheringConfig();
    const nextValues = _normalizeGatheringTagList(values);
    config.vocabularies[kind] =
      nextValues.length > 0 ? nextValues : [...DEFAULT_GATHERING_VOCABULARIES[kind]];
    if (kind === 'weather' && !config.vocabularies.weather.includes(config.conditions.weather)) {
      config.conditions.weather =
        config.vocabularies.weather[0] || DEFAULT_GATHERING_CONDITIONS.weather;
    }
    if (
      kind === 'timeOfDay' &&
      !config.vocabularies.timeOfDay.includes(config.conditions.timeOfDay)
    ) {
      config.conditions.timeOfDay =
        config.vocabularies.timeOfDay[0] || DEFAULT_GATHERING_CONDITIONS.timeOfDay;
    }
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function toggleGatheringConditionEnabled(kind, enabled, systemId = get(selectedSystemId)) {
    if (!GATHERING_CONDITION_DIMENSIONS.has(kind)) return false;
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return false;
    systemConfig.conditions[kind].enabled = enabled === true;
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function addGatheringConditionValue(kind, value, systemId = get(selectedSystemId)) {
    if (!GATHERING_CONDITION_DIMENSIONS.has(kind)) return false;
    const option = _normalizeGatheringConditionOption(kind, value);
    if (!option) return false;
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return false;
    const setting = systemConfig.conditions[kind];
    if (!setting.values.some((existing) => existing.id === option.id))
      setting.values = [...setting.values, option];
    if (!setting.current) setting.current = option.id;
    config.conditions = _gatheringCurrentConditions(systemConfig.conditions);
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function updateGatheringConditionValue(
    kind,
    valueId,
    updates = {},
    systemId = get(selectedSystemId)
  ) {
    if (!GATHERING_CONDITION_DIMENSIONS.has(kind)) return false;
    const id = _normalizeGatheringConditionId(valueId);
    if (!id || !updates || typeof updates !== 'object') return false;
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return false;
    const setting = systemConfig.conditions[kind];
    let changed = false;
    setting.values = setting.values.map((option) => {
      if (option.id !== id) return option;
      changed = true;
      return {
        ...option,
        label:
          updates.label !== undefined
            ? String(updates.label || '').trim() || option.label
            : option.label,
        icon: updates.icon !== undefined ? normalizeEssenceIcon(updates.icon) : option.icon,
      };
    });
    if (!changed) return false;
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function deleteGatheringConditionValue(kind, value, systemId = get(selectedSystemId)) {
    if (!GATHERING_CONDITION_DIMENSIONS.has(kind)) return false;
    const tag = _normalizeGatheringConditionId(value);
    if (!tag) return false;
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return false;
    const setting = systemConfig.conditions[kind];
    if (
      setting.enabled !== false &&
      setting.values.length <= 1 &&
      setting.values.some((option) => option.id === tag)
    )
      return false;
    const nextValues = setting.values.filter((existing) => existing.id !== tag);
    if (nextValues.length === setting.values.length) return true;
    setting.values = nextValues;
    if (!setting.values.some((option) => option.id === setting.current)) {
      setting.current = setting.values[0]?.id || DEFAULT_GATHERING_CONDITIONS[kind];
    }
    systemConfig.tasks = systemConfig.tasks.map((task) => ({
      ...task,
      [kind]: _normalizeGatheringConditionIdList(task?.[kind]).filter(
        (existing) => existing !== tag
      ),
    }));
    systemConfig.events = systemConfig.events.map((event) => ({
      ...event,
      [kind]: _normalizeGatheringConditionIdList(event?.[kind]).filter(
        (existing) => existing !== tag
      ),
    }));
    config.conditions = _gatheringCurrentConditions(systemConfig.conditions);
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function addGatheringVocabularyValue(kind, value, systemId = get(selectedSystemId)) {
    if (!GATHERING_VOCABULARY_DIMENSIONS.has(kind)) return false;
    const option = _normalizeGatheringVocabularyOption(kind, value);
    if (!option) return false;
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return false;
    const vocabulary = systemConfig.vocabularies[kind] || { values: [] };
    if (!vocabulary.values.some((existing) => existing.id === option.id)) {
      vocabulary.values = [...vocabulary.values, option];
    }
    systemConfig.vocabularies[kind] = vocabulary;
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function updateGatheringVocabularyValue(
    kind,
    valueId,
    updates = {},
    systemId = get(selectedSystemId)
  ) {
    if (!GATHERING_VOCABULARY_DIMENSIONS.has(kind)) return false;
    const id = _normalizeGatheringVocabularyId(valueId);
    if (!id || !updates || typeof updates !== 'object') return false;
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return false;
    const vocabulary = systemConfig.vocabularies[kind] || { values: [] };
    let changed = false;
    vocabulary.values = vocabulary.values.map((option) => {
      if (option.id !== id) return option;
      changed = true;
      const next = {
        ...option,
        label:
          updates.label !== undefined
            ? String(updates.label || '').trim() || option.label
            : option.label,
      };
      if (kind === 'biomes') {
        next.icon = updates.icon !== undefined ? normalizeEssenceIcon(updates.icon) : option.icon;
        next.colorToken =
          updates.colorToken !== undefined
            ? _normalizeBiomeColorToken(updates.colorToken)
            : option.colorToken;
        next.customColor =
          updates.customColor !== undefined
            ? _normalizeCustomHex(updates.customColor)
            : option.customColor;
      }
      return next;
    });
    if (!changed) return false;
    systemConfig.vocabularies[kind] = vocabulary;
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function _pruneGatheringVocabularyFromEnvironments(systemId, kind, id) {
    const environmentStore = _getEnvironmentStore();
    if (!environmentStore?.update) return;
    const environments = _environmentList();
    for (const environment of environments) {
      if (String(environment?.craftingSystemId || '') !== String(systemId || '')) continue;
      let payload = null;
      if (kind === 'biomes') {
        const nextBiomes = _normalizeGatheringTagList(
          environment.biomes ?? environment.biome
        ).filter((existing) => _normalizeGatheringVocabularyId(existing) !== id);
        if (
          nextBiomes.length !==
          _normalizeGatheringTagList(environment.biomes ?? environment.biome).length
        ) {
          payload = { ..._clonePlain(environment), biomes: nextBiomes, biome: nextBiomes[0] || '' };
        }
      }
      if (payload) await environmentStore.update(environment.id, payload);
    }
  }

  async function deleteGatheringVocabularyValue(kind, valueId, systemId = get(selectedSystemId)) {
    if (!GATHERING_VOCABULARY_DIMENSIONS.has(kind)) return false;
    const id = _normalizeGatheringVocabularyId(valueId);
    if (!id) return false;
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return false;
    const vocabulary = systemConfig.vocabularies[kind] || { values: [] };
    const nextValues = vocabulary.values.filter((option) => option.id !== id);
    if (nextValues.length === vocabulary.values.length) return true;
    systemConfig.vocabularies[kind] = { values: nextValues };
    if (kind === 'biomes') {
      systemConfig.tasks = systemConfig.tasks.map((task) => ({
        ...task,
        biomes: _normalizeGatheringTagList(task.biomes).filter(
          (existing) => _normalizeGatheringVocabularyId(existing) !== id
        ),
      }));
      systemConfig.events = systemConfig.events.map((event) => ({
        ...event,
        biomes: _normalizeGatheringTagList(event.biomes).filter(
          (existing) => _normalizeGatheringVocabularyId(existing) !== id
        ),
      }));
    }
    await _pruneGatheringVocabularyFromEnvironments(systemId, kind, id);
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function updateGatheringRules(systemId = get(selectedSystemId), updates = {}) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !updates || typeof updates !== 'object') return false;
    systemConfig.rules = _normalizeGatheringRules({
      ...systemConfig.rules,
      ...updates,
    });
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function addGatheringLibraryTask(systemId = get(selectedSystemId)) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return null;
    const task = _normalizeGatheringTask(
      {
        id: _randomID(),
        name:
          services.localize?.('FABRICATE.Admin.Manager.Environment.NewLibraryTask') ||
          'New Gathering Task',
        dropRows: [],
      },
      _randomID
    );
    systemConfig.tasks = [...systemConfig.tasks, task];
    await _saveGatheringConfig(config);
    await refresh();
    return task;
  }

  function _selectedGatheringSystem(systemId = get(selectedSystemId)) {
    return services.getCraftingSystemManager?.()?.getSystem?.(systemId) || null;
  }

  function _validateGatheringLibraryTaskForSystem(task, systemId = get(selectedSystemId)) {
    const errors = [];
    if (!task || typeof task !== 'object') {
      errors.push('Task is required');
      return { valid: false, errors };
    }
    const name = String(task.name || '').trim();
    if (!name) {
      errors.push('Task name is required');
    }
    const label = `Task "${name || task.id || 'unnamed'}"`;
    const system = _selectedGatheringSystem(systemId);
    errors.push(
      ...validateDropRows(task.dropRows, label, {
        system,
        systemId,
        validateDisabledRows: true,
      })
    );
    if (Array.isArray(task.dropRows)) {
      for (const row of task.dropRows) {
        if (row?.enabled === false && !row?.componentId && !row?.itemUuid) {
          errors.push(`${label} drop row "${row?.id || 'row'}" requires componentId or itemUuid`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function validateGatheringLibraryTask(task) {
    return _validateGatheringLibraryTaskForSystem(task);
  }

  function _gatheringTaskIsAtDefaults(task) {
    if (!task) return false;
    const localizedDefault = services.localize?.(
      'FABRICATE.Admin.Manager.Environment.NewLibraryTask'
    );
    const isDefaultName =
      task.name === localizedDefault ||
      task.name === 'New Gathering Task' ||
      task.name === 'Gather';
    const isDefaultImg = task.img === DEFAULT_GATHERING_TASK_IMG;
    return isDefaultName && isDefaultImg;
  }

  function _firstDropAutopopulatePatch(existingTask, nextDropRows, managedItemById) {
    if (!_gatheringTaskIsAtDefaults(existingTask)) return null;
    const hadComponentBefore = (existingTask?.dropRows || []).some((row) => row?.componentId);
    if (hadComponentBefore) return null;
    const firstRowWithComponent = (nextDropRows || []).find((row) => row?.componentId);
    if (!firstRowWithComponent) return null;
    const component = managedItemById?.get?.(String(firstRowWithComponent.componentId));
    const componentName = String(component?.name || '').trim();
    if (!componentName) return null;
    const template =
      services.localize?.('FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate') ||
      'Gather {component}';
    return {
      name: template.replace('{component}', componentName),
      img: component.img || DEFAULT_GATHERING_TASK_IMG,
    };
  }

  function gatheringTaskAutopopulateFromComponent(systemId, existingTask, nextDropRows) {
    const system = services.getCraftingSystemManager?.()?.getSystem?.(systemId);
    const options = _buildManagedItemOptions(_getManagedItems(system));
    const managedItemById = new Map(options.map((item) => [String(item.id), item]));
    return _firstDropAutopopulatePatch(existingTask, nextDropRows, managedItemById) || {};
  }

  async function updateGatheringLibraryTask(
    systemId = get(selectedSystemId),
    taskId,
    updates = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !taskId) return false;
    const existing = systemConfig.tasks.find((task) => task.id === taskId);
    let mergedUpdates = updates;
    if (existing && Array.isArray(updates.dropRows)) {
      const patch = gatheringTaskAutopopulateFromComponent(systemId, existing, updates.dropRows);
      if (patch.name || patch.img) {
        mergedUpdates = { ...patch, ...updates };
      }
    }
    systemConfig.tasks = systemConfig.tasks.map((task) =>
      task.id === taskId ? _normalizeGatheringTask({ ...task, ...mergedUpdates }, _randomID) : task
    );
    if (Array.isArray(updates.dropRows)) {
      const nextTask = systemConfig.tasks.find((task) => task.id === taskId);
      const validation = _validateGatheringLibraryTaskForSystem(nextTask, systemId);
      if (!validation.valid) {
        services.notify?.error?.(validation.errors[0] || 'Gathering task validation failed.');
        return false;
      }
    }
    await _saveGatheringConfig(config);
    _notifyGatheringLibraryRecordDisabled({
      systemId,
      oldRecord: existing,
      nextRecord: systemConfig.tasks.find((task) => task.id === taskId),
      kind: 'task',
    });
    await refresh();
    return true;
  }

  async function deleteGatheringLibraryTask(systemId = get(selectedSystemId), taskId) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !taskId) return false;
    const task = systemConfig.tasks.find((task) => task.id === taskId);
    if (
      task &&
      !(await _confirmGatheringLibraryRecordDelete({ systemId, record: task, kind: 'task' }))
    )
      return false;
    systemConfig.tasks = systemConfig.tasks.filter((task) => task.id !== taskId);
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function addGatheringLibraryTool(systemId = get(selectedSystemId)) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return null;
    const tool = _normalizeGatheringLibraryTool({ id: _randomID() }, _randomID);
    const persisted = await _persistSystemTools(id, [..._systemTools(id), tool]);
    if (persisted === null) return null;
    await refresh();
    return tool;
  }

  async function updateGatheringLibraryTool(
    systemId = get(selectedSystemId),
    toolId,
    updates = {}
  ) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id || !toolId) return false;
    const next = _systemTools(id).map((tool) =>
      tool.id === toolId ? _normalizeGatheringLibraryTool({ ...tool, ...updates }, _randomID) : tool
    );
    const persisted = await _persistSystemTools(id, next);
    if (persisted === null) return false;
    await refresh();
    return true;
  }

  async function deleteGatheringLibraryTool(systemId = get(selectedSystemId), toolId) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id || !toolId) return false;
    const tools = _systemTools(id);
    const tool = tools.find((t) => t.id === toolId);
    if (
      tool &&
      !(await _confirmGatheringLibraryRecordDelete({ systemId: id, record: tool, kind: 'tool' }))
    )
      return false;
    const persisted = await _persistSystemTools(
      id,
      tools.filter((t) => t.id !== toolId)
    );
    if (persisted === null) return false;
    await refresh();
    return true;
  }

  function validateGatheringLibraryTool(tool) {
    if (!tool || typeof tool !== 'object') return { valid: false, errors: ['Tool is required'] };
    return Tool.fromJSON(tool).validate();
  }

  async function duplicateGatheringLibraryTask(systemId = get(selectedSystemId), taskId) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !taskId) return null;
    const task = systemConfig.tasks.find((task) => task.id === taskId);
    if (!task) return null;
    const copySuffix =
      services.localize?.('FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix') || 'Copy';
    const duplicate = _normalizeGatheringTask(
      {
        ..._clonePlain(task),
        id: _randomID(),
        name: `${task.name || 'Gather'} (${copySuffix})`,
        dropRows: (Array.isArray(task.dropRows) ? task.dropRows : []).map((row) => ({
          ..._clonePlain(row),
          id: _randomID(),
        })),
      },
      _randomID
    );
    systemConfig.tasks = [...systemConfig.tasks, duplicate];
    await _saveGatheringConfig(config);
    await refresh();
    return duplicate;
  }

  async function addGatheringLibraryEvent(systemId = get(selectedSystemId)) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return null;
    const event = _normalizeGatheringEvent(
      {
        id: _randomID(),
        name:
          services.localize?.('FABRICATE.Admin.Manager.Environment.NewLibraryEvent') ||
          'Reusable event',
        dangerTags: ['hazardous'],
        dropRate: 25,
      },
      _randomID
    );
    systemConfig.events = [...systemConfig.events, event];
    await _saveGatheringConfig(config);
    await refresh();
    return event;
  }

  async function updateGatheringLibraryEvent(
    systemId = get(selectedSystemId),
    eventId,
    updates = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !eventId) return false;
    const existing = systemConfig.events.find((event) => event.id === eventId);
    systemConfig.events = systemConfig.events.map((event) =>
      event.id === eventId ? _normalizeGatheringEvent({ ...event, ...updates }, _randomID) : event
    );
    await _saveGatheringConfig(config);
    _notifyGatheringLibraryRecordDisabled({
      systemId,
      oldRecord: existing,
      nextRecord: systemConfig.events.find((event) => event.id === eventId),
      kind: 'event',
    });
    await refresh();
    return true;
  }

  async function deleteGatheringLibraryEvent(systemId = get(selectedSystemId), eventId) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !eventId) return false;
    const event = systemConfig.events.find((event) => event.id === eventId);
    if (
      event &&
      !(await _confirmGatheringLibraryRecordDelete({ systemId, record: event, kind: 'event' }))
    )
      return false;
    systemConfig.events = systemConfig.events.filter((event) => event.id !== eventId);
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  async function duplicateGatheringLibraryEvent(systemId = get(selectedSystemId), eventId) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !eventId) return null;
    const event = systemConfig.events.find((event) => event.id === eventId);
    if (!event) return null;
    const copySuffix =
      services.localize?.('FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix') || 'Copy';
    const duplicate = _normalizeGatheringEvent(
      {
        ..._clonePlain(event),
        id: _randomID(),
        name: `${event.name || 'Event'} (${copySuffix})`,
      },
      _randomID
    );
    systemConfig.events = [...systemConfig.events, duplicate];
    await _saveGatheringConfig(config);
    await refresh();
    return duplicate;
  }

  /**
   * Append a new character modifier entry to the selected system's library.
   * Returns the normalized entry, or null when the system has no gathering
   * shell or the proposed id already exists.
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {object} [partial] Partial entry (id, label, icon, expression).
   * @returns {Promise<object|null>}
   */
  async function addGatheringCharacterModifier(systemId = get(selectedSystemId), partial = {}) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return null;
    const id = String(partial?.id || _randomID());
    if ((systemConfig.characterModifiers || []).some((entry) => entry.id === id)) return null;
    const entry = _normalizeGatheringCharacterModifier(
      {
        id,
        label:
          partial?.label ||
          services.localize?.('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.NewLabel') ||
          'Character modifier',
        icon: partial?.icon || 'fa-solid fa-user',
        expression: partial?.expression || '',
      },
      _randomID
    );
    if (!entry) return null;
    systemConfig.characterModifiers = [...(systemConfig.characterModifiers || []), entry];
    await _saveGatheringConfig(config);
    await refresh();
    return entry;
  }

  /**
   * Update one library character modifier entry by id. Updates that fail
   * normalization (e.g. no id) preserve the prior entry. Returns true when the
   * library changed.
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {string} modifierId Library entry id.
   * @param {object} [updates] Partial replacement fields.
   * @returns {Promise<boolean>}
   */
  async function updateGatheringCharacterModifier(
    systemId = get(selectedSystemId),
    modifierId,
    updates = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !modifierId) return false;
    const list = systemConfig.characterModifiers || [];
    const next = list.map((entry) =>
      entry.id === modifierId
        ? _normalizeGatheringCharacterModifier({ ...entry, ...updates }, _randomID) || entry
        : entry
    );
    if (next.length === list.length && next.every((entry, index) => entry === list[index]))
      return false;
    systemConfig.characterModifiers = next;
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  /**
   * Remove one library character modifier entry by id. Row references to the
   * deleted id are intentionally left intact so the GM can repoint or remove
   * them at authoring time (the runtime treats unresolved references as
   * misconfiguration).
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {string} modifierId Library entry id to remove.
   * @returns {Promise<boolean>}
   */
  async function deleteGatheringCharacterModifier(systemId = get(selectedSystemId), modifierId) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !modifierId) return false;
    const next = (systemConfig.characterModifiers || []).filter((entry) => entry.id !== modifierId);
    if (next.length === (systemConfig.characterModifiers || []).length) return false;
    systemConfig.characterModifiers = next;
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  /**
   * Idempotently seed the active Foundry game system's preset bundle into the
   * selected crafting system's character modifier library. Existing ids are
   * preserved; the return value identifies added vs. skipped presets and
   * flags unsupported Foundry systems for the caller to surface to the GM.
   *
   * @param {string} [systemId] Target crafting system id.
   * @returns {Promise<{added: Array, skipped: Array, unsupported: boolean, foundrySystemId?: string}>}
   */
  async function seedGatheringCharacterModifierPresets(systemId = get(selectedSystemId)) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig) return { added: [], skipped: [], unsupported: true };
    const foundrySystemId =
      typeof services.getFoundrySystemId === 'function'
        ? String(services.getFoundrySystemId() || '')
        : '';
    const presets = getCharacterModifierPresetsForFoundrySystem(foundrySystemId);
    if (!presets || presets.length === 0) {
      return { added: [], skipped: [], unsupported: true, foundrySystemId };
    }
    const result = seedCharacterModifierPresets({
      presets,
      currentLibrary: systemConfig.characterModifiers || [],
    });
    systemConfig.characterModifiers = result.next
      .map((entry) => _normalizeGatheringCharacterModifier(entry, _randomID))
      .filter(Boolean);
    await _saveGatheringConfig(config);
    await refresh();
    return { added: result.added, skipped: result.skipped, unsupported: false, foundrySystemId };
  }

  function _firstCharacterModifierId(systemConfig) {
    const list = Array.isArray(systemConfig?.characterModifiers)
      ? systemConfig.characterModifiers
      : [];
    return list[0]?.id || '';
  }

  function _updateDropRowOnTask(systemConfig, taskId, rowId, mutate) {
    const taskIndex = systemConfig.tasks.findIndex((task) => task.id === taskId);
    if (taskIndex < 0) return false;
    const task = systemConfig.tasks[taskIndex];
    const rows = Array.isArray(task.dropRows) ? task.dropRows : [];
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    if (rowIndex < 0) return false;
    const nextRow = mutate({ ...rows[rowIndex] });
    if (!nextRow) return false;
    const nextRows = [...rows];
    nextRows[rowIndex] = nextRow;
    systemConfig.tasks = systemConfig.tasks.map((existing, index) =>
      index === taskIndex
        ? _normalizeGatheringTask({ ...existing, dropRows: nextRows }, _randomID)
        : existing
    );
    return true;
  }

  /**
   * Add a character modifier reference to one drop row on one library task.
   * Defaults `modifierId` to the system's first library entry when not
   * supplied so the editor can append a usable row without forcing a picker
   * choice up-front. Returns the normalized reference or null when the
   * system/task/row cannot be resolved.
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {string} taskId Library task id.
   * @param {string} rowId Drop row id on the task.
   * @param {object} [partial] Reference fields (modifierId, operator, min, max, overrides).
   * @returns {Promise<object|null>}
   */
  async function addGatheringDropRowCharacterModifier(
    systemId = get(selectedSystemId),
    taskId,
    rowId,
    partial = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !taskId || !rowId) return null;
    const modifierId = String(
      partial?.modifierId || _firstCharacterModifierId(systemConfig) || ''
    ).trim();
    if (!modifierId) return null;
    let created = null;
    const changed = _updateDropRowOnTask(systemConfig, taskId, rowId, (row) => {
      const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
      const id = String(partial?.id || _randomID());
      const ref = _normalizeGatheringCharacterModifierReference(
        {
          id,
          modifierId,
          operator: partial?.operator || '+',
          min: partial?.min ?? null,
          max: partial?.max ?? null,
          expressionOverride: partial?.expressionOverride || '',
        },
        refs.length,
        _randomID
      );
      if (!ref) return null;
      created = ref;
      row.characterModifiers = [...refs, ref];
      return row;
    });
    if (!changed) return null;
    await _saveGatheringConfig(config);
    await refresh();
    return created;
  }

  /**
   * Patch one drop-row character modifier reference in place. Patches that
   * fail normalization are rejected (the existing reference is preserved).
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {string} taskId Library task id.
   * @param {string} rowId Drop row id on the task.
   * @param {string} refId Reference id on the row.
   * @param {object} [patch] Partial replacement fields.
   * @returns {Promise<boolean>}
   */
  async function updateGatheringDropRowCharacterModifier(
    systemId = get(selectedSystemId),
    taskId,
    rowId,
    refId,
    patch = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !taskId || !rowId || !refId) return false;
    const changed = _updateDropRowOnTask(systemConfig, taskId, rowId, (row) => {
      const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
      const index = refs.findIndex((ref) => ref.id === refId);
      if (index < 0) return null;
      const merged = { ...refs[index], ...patch };
      const normalized = _normalizeGatheringCharacterModifierReference(merged, index, _randomID);
      if (!normalized) return null;
      row.characterModifiers = refs.map((ref, refIndex) => (refIndex === index ? normalized : ref));
      return row;
    });
    if (!changed) return false;
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  /**
   * Remove one drop-row character modifier reference by id.
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {string} taskId Library task id.
   * @param {string} rowId Drop row id on the task.
   * @param {string} refId Reference id to remove.
   * @returns {Promise<boolean>}
   */
  async function deleteGatheringDropRowCharacterModifier(
    systemId = get(selectedSystemId),
    taskId,
    rowId,
    refId
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !taskId || !rowId || !refId) return false;
    const changed = _updateDropRowOnTask(systemConfig, taskId, rowId, (row) => {
      const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
      const next = refs.filter((ref) => ref.id !== refId);
      if (next.length === refs.length) return null;
      row.characterModifiers = next;
      return row;
    });
    if (!changed) return false;
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  /**
   * Add a character modifier reference to one library event. Mirrors the
   * drop-row equivalent: defaults `modifierId` to the system's first library
   * entry when not supplied. Returns the normalized reference or null on
   * lookup failure.
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {string} eventId Library event id.
   * @param {object} [partial] Reference fields.
   * @returns {Promise<object|null>}
   */
  async function addGatheringEventCharacterModifier(
    systemId = get(selectedSystemId),
    eventId,
    partial = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !eventId) return null;
    const modifierId = String(
      partial?.modifierId || _firstCharacterModifierId(systemConfig) || ''
    ).trim();
    if (!modifierId) return null;
    const eventIndex = systemConfig.events.findIndex((event) => event.id === eventId);
    if (eventIndex < 0) return null;
    const event = systemConfig.events[eventIndex];
    const refs = Array.isArray(event.characterModifiers) ? event.characterModifiers : [];
    const id = String(partial?.id || _randomID());
    const ref = _normalizeGatheringCharacterModifierReference(
      {
        id,
        modifierId,
        operator: partial?.operator || '+',
        min: partial?.min ?? null,
        max: partial?.max ?? null,
        expressionOverride: partial?.expressionOverride || '',
      },
      refs.length,
      _randomID
    );
    if (!ref) return null;
    const nextEvent = _normalizeGatheringEvent(
      { ...event, characterModifiers: [...refs, ref] },
      _randomID
    );
    systemConfig.events = systemConfig.events.map((existing, index) =>
      index === eventIndex ? nextEvent : existing
    );
    await _saveGatheringConfig(config);
    await refresh();
    return ref;
  }

  /**
   * Patch one event character modifier reference in place.
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {string} eventId Library event id.
   * @param {string} refId Reference id on the event.
   * @param {object} [patch] Partial replacement fields.
   * @returns {Promise<boolean>}
   */
  async function updateGatheringEventCharacterModifier(
    systemId = get(selectedSystemId),
    eventId,
    refId,
    patch = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !eventId || !refId) return false;
    const eventIndex = systemConfig.events.findIndex((event) => event.id === eventId);
    if (eventIndex < 0) return false;
    const event = systemConfig.events[eventIndex];
    const refs = Array.isArray(event.characterModifiers) ? event.characterModifiers : [];
    const index = refs.findIndex((ref) => ref.id === refId);
    if (index < 0) return false;
    const merged = { ...refs[index], ...patch };
    const normalized = _normalizeGatheringCharacterModifierReference(merged, index, _randomID);
    if (!normalized) return false;
    const nextRefs = refs.map((ref, refIndex) => (refIndex === index ? normalized : ref));
    const nextEvent = _normalizeGatheringEvent(
      { ...event, characterModifiers: nextRefs },
      _randomID
    );
    systemConfig.events = systemConfig.events.map((existing, hIndex) =>
      hIndex === eventIndex ? nextEvent : existing
    );
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  /**
   * Remove one event character modifier reference by id.
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {string} eventId Library event id.
   * @param {string} refId Reference id to remove.
   * @returns {Promise<boolean>}
   */
  async function deleteGatheringEventCharacterModifier(
    systemId = get(selectedSystemId),
    eventId,
    refId
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !eventId || !refId) return false;
    const eventIndex = systemConfig.events.findIndex((event) => event.id === eventId);
    if (eventIndex < 0) return false;
    const event = systemConfig.events[eventIndex];
    const refs = Array.isArray(event.characterModifiers) ? event.characterModifiers : [];
    const nextRefs = refs.filter((ref) => ref.id !== refId);
    if (nextRefs.length === refs.length) return false;
    const nextEvent = _normalizeGatheringEvent(
      { ...event, characterModifiers: nextRefs },
      _randomID
    );
    systemConfig.events = systemConfig.events.map((existing, hIndex) =>
      hIndex === eventIndex ? nextEvent : existing
    );
    await _saveGatheringConfig(config);
    await refresh();
    return true;
  }

  // --- Config save actions ---

  // Persist the structured routed crafting check (type + roll expression +
  // outcome tiers) authored in the Checks editor, preserving the rest of the
  // craftingCheck config. The manager normalizes the routed payload on write.
  // Deleting an outcome tier here leaves dangling tier ids in recipes'
  // `ResultGroup.checkOutcomeIds`; strip them on save so they don't silently rot
  // (the engine name-fallback keeps them inert at craft time, but a stale id
  // renders as an "unknown" routing chip and a readiness warning).
  async function saveCraftingCheckRouted(routed) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const existing = system.craftingCheck || {};
    await systemManager.updateSystem(sysId, {
      craftingCheck: { ...existing, routed },
    });
    await _stripDeletedRoutedTierIds(sysId, routed);
    await refresh();
  }

  // Build the set of outcome-tier ids that still exist in the saved routed config
  // (the active type's tier list).
  function _validRoutedTierIds(routed) {
    const tiers = routed?.type === 'fixed' ? routed?.fixedOutcomes : routed?.relativeOutcomes;
    const ids = new Set();
    for (const tier of Array.isArray(tiers) ? tiers : []) {
      if (tier?.id) ids.add(tier.id);
    }
    return ids;
  }

  // Drop any `checkOutcomeIds` entry that references a tier id no longer present
  // in the saved routed config, across every recipe in the system (recipe-level
  // result groups and per-step groups). Returns the count of result groups changed.
  function _filterGroupOutcomeIds(group, validIds) {
    const ids = Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : [];
    const kept = ids.filter((id) => validIds.has(id));
    if (kept.length === ids.length) return { group, changed: false };
    return { group: { ...group, checkOutcomeIds: kept }, changed: true };
  }

  async function _stripDeletedRoutedTierIds(sysId, routed) {
    const recipeManager = services.getRecipeManager();
    const validIds = _validRoutedTierIds(routed);
    const recipes = recipeManager.getRecipes({ craftingSystemId: sysId }) || [];
    let strippedGroupCount = 0;

    for (const recipe of recipes) {
      const data = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
      let recipeChanged = false;

      const nextResultGroups = (Array.isArray(data.resultGroups) ? data.resultGroups : []).map(
        (group) => {
          const { group: next, changed } = _filterGroupOutcomeIds(group, validIds);
          if (changed) {
            recipeChanged = true;
            strippedGroupCount += 1;
          }
          return next;
        }
      );

      const nextSteps = (Array.isArray(data.steps) ? data.steps : []).map((step) => ({
        ...step,
        resultGroups: (Array.isArray(step?.resultGroups) ? step.resultGroups : []).map((group) => {
          const { group: next, changed } = _filterGroupOutcomeIds(group, validIds);
          if (changed) {
            recipeChanged = true;
            strippedGroupCount += 1;
          }
          return next;
        }),
      }));

      if (!recipeChanged) continue;

      try {
        await recipeManager.updateRecipe(
          data.id,
          { resultGroups: nextResultGroups, steps: nextSteps },
          { allowIncomplete: true, notify: false }
        );
      } catch (err) {
        console.error('Fabricate | Failed to strip deleted routed tier ids from recipe:', err);
      }
    }

    if (strippedGroupCount > 0) {
      services.notify?.info?.(
        `Removed deleted tier from ${strippedGroupCount} recipe result group(s).`
      );
    }
  }

  // Persist the simple pass/fail crafting check (roll formula + static/dynamic DC)
  // authored for simple and alchemy resolution modes, preserving the rest of the
  // craftingCheck config. The manager normalizes the simple payload on write.
  async function saveCraftingCheckSimple(simple) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const existing = system.craftingCheck || {};
    await systemManager.updateSystem(sysId, {
      craftingCheck: { ...existing, simple },
    });
    await refresh();
  }

  // Persist the progressive crafting check (roll formula + crit table) authored for
  // progressive resolution mode, preserving the rest of the craftingCheck config.
  // The progressive payload also carries the award settings; the manager normalizes
  // it on write.
  async function saveCraftingCheckProgressive(progressive) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const existing = system.craftingCheck || {};
    await systemManager.updateSystem(sysId, {
      craftingCheck: { ...existing, progressive },
    });
    await refresh();
  }

  // Enable/disable a system-level check (the right-menu "Active" toggle, shown
  // only when the resolution mode makes the check optional).
  async function saveCraftingCheckActive(enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const existing = system.craftingCheck || {};
    await systemManager.updateSystem(sysId, {
      craftingCheck: { ...existing, enabled: enabled === true },
    });
    await refresh();
  }

  // Shallow-merge a patch into the selected system's salvageCraftingCheck and
  // persist (the manager normalizes the whole check on write). Shared by every
  // salvage check saver below so the boilerplate lives in one place.
  async function _saveSalvageCheckPatch(patch) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const existing = system.salvageCraftingCheck || {};
    await systemManager.updateSystem(sysId, {
      salvageCraftingCheck: { ...existing, ...patch },
    });
    await refresh();
  }

  const saveSalvageCheckActive = (enabled) => _saveSalvageCheckPatch({ enabled: enabled === true });
  const saveSalvageCheckProgressive = (progressive) => _saveSalvageCheckPatch({ progressive });
  const saveSalvageCheckSimple = (simple) => _saveSalvageCheckPatch({ simple });
  const saveSalvageCheckRouted = (routed) => _saveSalvageCheckPatch({ routed });

  // Shallow-merge a patch into the selected system's gatheringCraftingCheck and
  // persist (the manager normalizes the whole check on write). Shared by every
  // gathering check saver below so the boilerplate lives in one place. The
  // gathering check is system-level (not per task); d100 mode has no editable
  // config, so only enabled/progressive/routed are surfaced here.
  async function _saveGatheringCheckPatch(patch) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const existing = system.gatheringCraftingCheck || {};
    await systemManager.updateSystem(sysId, {
      gatheringCraftingCheck: { ...existing, ...patch },
    });
    await refresh();
  }

  const saveGatheringCheckActive = (enabled) => _saveGatheringCheckPatch({ enabled: enabled === true });
  const saveGatheringCheckProgressive = (progressive) => _saveGatheringCheckPatch({ progressive });
  const saveGatheringCheckRouted = (routed) => _saveGatheringCheckPatch({ routed });

  async function _updateCurrencyConfig(systemId, mutate) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = systemId || get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const requirements = JSON.parse(
      JSON.stringify(
        system.requirements || {
          time: { enabled: false },
          currency: { enabled: false, units: [] },
        }
      )
    );
    requirements.currency = normalizeCurrencyConfig(requirements.currency, { randomID: _randomID });
    const result = await mutate(requirements.currency, system);
    if (result === false) return false;

    await systemManager.updateSystem(sysId, { requirements });
    await refresh();
    return result ?? true;
  }

  async function addCurrencyUnit(systemId, partial = {}) {
    return await _updateCurrencyConfig(systemId, (currency) => {
      const id = String(partial?.id || _randomID()).trim();
      if (!id || currency.units.some((unit) => unit.id === id)) return null;
      const unit = normalizeCurrencyUnit(
        {
          id,
          label:
            partial?.label ||
            services.localize?.('FABRICATE.Admin.Manager.CurrencyUnits.NewLabel') ||
            'Currency unit',
          abbreviation: partial?.abbreviation || '',
          icon: partial?.icon || 'fa-solid fa-coins',
          actorPath: partial?.actorPath || '',
          contains: partial?.contains || [],
        },
        _randomID
      );
      if (!unit) return null;
      currency.units = [...currency.units, unit];
      return unit;
    });
  }

  async function updateCurrencyUnit(systemId, unitId, updates = {}) {
    return await _updateCurrencyConfig(systemId, (currency) => {
      if (!unitId) return false;
      let changed = false;
      currency.units = currency.units.map((unit) => {
        if (unit.id !== unitId) return unit;
        changed = true;
        return normalizeCurrencyUnit({ ...unit, ...updates, id: unit.id }, _randomID) || unit;
      });
      return changed;
    });
  }

  async function deleteCurrencyUnit(systemId, unitId) {
    return await _updateCurrencyConfig(systemId, (currency) => {
      const nextUnits = _deleteCurrencyUnitFromList(currency.units, unitId);
      if (!nextUnits) return false;
      currency.units = nextUnits;
      return true;
    });
  }

  async function addCurrencySubUnit(systemId, parentUnitId, subUnitId, amount = 1) {
    return await _updateCurrencyConfig(systemId, (currency) => {
      if (!canAddCurrencySubUnit(currency.units, parentUnitId, subUnitId)) return false;
      const numericAmount = Math.max(1, Math.trunc(Number(amount) || 1));
      currency.units = currency.units.map((unit) =>
        unit.id === parentUnitId
          ? {
              ...unit,
              contains: [...(unit.contains || []), { unitId: subUnitId, amount: numericAmount }],
            }
          : unit
      );
      return true;
    });
  }

  async function updateCurrencySubUnit(systemId, parentUnitId, subUnitId, amount) {
    return await _updateCurrencyConfig(systemId, (currency) => {
      const numericAmount = Math.max(1, Math.trunc(Number(amount) || 1));
      const { nextUnits, changed } = _updateSubUnitAmountInList(
        currency.units,
        parentUnitId,
        subUnitId,
        numericAmount
      );
      currency.units = nextUnits;
      return changed;
    });
  }

  async function deleteCurrencySubUnit(systemId, parentUnitId, subUnitId) {
    return await _updateCurrencyConfig(systemId, (currency) => {
      const { nextUnits, changed } = _deleteSubUnitFromList(
        currency.units,
        parentUnitId,
        subUnitId
      );
      currency.units = nextUnits;
      return changed;
    });
  }

  function _foundrySystemId() {
    return typeof services.getFoundrySystemId === 'function'
      ? String(services.getFoundrySystemId() || '')
      : '';
  }

  // Provider inventory mode means "use the system's coins": the selected provider owns the
  // denomination ladder, so overwrite config.units with the provider's canonical (frozen) units
  // and re-normalize. This keeps the engine's affordability/baseValue math aligned with the
  // system's real coin values regardless of any prior GM edits. When the resolved provider has no
  // canonical ladder (e.g. a system with no registered provider, where getDefaultProviderId returns
  // '' and getProviderCanonicalUnits('') is empty), leave the GM-entered units untouched rather than
  // silently wiping them — a no-provider system should never enter provider mode (the editor steers
  // it to macro), but guard here so any legacy/stale provider-mode state cannot destroy units.
  function _applyProviderCanonicalUnits(currency) {
    const normalizedCanonical = getProviderCanonicalUnits(currency.providerId)
      .map((unit) => normalizeCurrencyUnit(unit, _randomID))
      .filter(Boolean);
    if (normalizedCanonical.length === 0) return;
    currency.units = normalizedCanonical;
  }

  async function setCurrencySpendStrategy(systemId, spendStrategy) {
    const nextStrategy = ['actorInventory', 'macro'].includes(spendStrategy)
      ? spendStrategy
      : 'actorProperty';
    return await _updateCurrencyConfig(systemId, (currency) => {
      currency.spendStrategy = nextStrategy;
      // Switching to actorInventory seeds a sensible default providerId (when the system ships a
      // provider) and syncs the provider's canonical, provider-owned units. The sync is guarded
      // so a no-provider system never wipes the GM's units. Switching to macro leaves the user's
      // units in place — macros own conversion by abbreviation. The normalizer preserves macros
      // and providerId across strategy switches either way.
      if (nextStrategy === 'actorInventory') {
        if (!currency.providerId) {
          currency.providerId = getDefaultProviderId(_foundrySystemId());
        }
        _applyProviderCanonicalUnits(currency);
      }
      return true;
    });
  }

  async function setCurrencyProvider(systemId, providerId) {
    return await _updateCurrencyConfig(systemId, (currency) => {
      currency.providerId = String(providerId || '').trim();
      // Selecting a provider adopts its canonical units under the actorInventory strategy; under
      // other strategies the providerId is inert and user-managed units stay untouched.
      if (currency.spendStrategy === 'actorInventory') {
        _applyProviderCanonicalUnits(currency);
      }
      return true;
    });
  }

  async function setCurrencyMacro(systemId, key, uuid) {
    if (!CURRENCY_MACRO_KEYS.includes(key)) return false;
    return await _updateCurrencyConfig(systemId, (currency) => {
      currency.macros = { ...currency.macros, [key]: String(uuid || '').trim() };
      return true;
    });
  }

  async function clearCurrencyMacro(systemId, key) {
    return await setCurrencyMacro(systemId, key, '');
  }

  async function seedCurrencyUnitPresets(systemId = get(selectedSystemId)) {
    const foundrySystemId =
      typeof services.getFoundrySystemId === 'function'
        ? String(services.getFoundrySystemId() || '')
        : '';
    const presets = getCurrencyPresetsForFoundrySystem(foundrySystemId);
    if (!presets || presets.length === 0) {
      return { added: [], skipped: [], unsupported: true, foundrySystemId };
    }
    return await _updateCurrencyConfig(systemId, (currency) => {
      const result = seedCurrencyPresets({
        presets,
        currentUnits: currency.units || [],
      });
      currency.units = result.next
        .map((unit) => normalizeCurrencyUnit(unit, _randomID))
        .filter(Boolean);
      // pf2e coins live in the actor inventory (read/spent via actor.inventory.removeCoins),
      // not at a flat actor property, so the pf2e preset selects the actorInventory spend
      // strategy. dnd5e (and every other system) stays on the default actorProperty strategy.
      currency.spendStrategy = foundrySystemId === 'pf2e' ? 'actorInventory' : 'actorProperty';
      // pf2e seeds the system's default provider; dnd5e stays on actorProperty where providerId is
      // inert (but still normalized/persisted).
      if (foundrySystemId === 'pf2e') {
        currency.providerId = getDefaultProviderId(foundrySystemId);
        // The actorInventory strategy is provider-owned, so overwrite the seeded units with the
        // provider's canonical ladder (a clean overwrite of the same pf2e preset list) rather than
        // the merge above, keeping the engine on canonical denominations.
        _applyProviderCanonicalUnits(currency);
      }
      return { added: result.added, skipped: result.skipped, unsupported: false, foundrySystemId };
    });
  }

  async function saveAlchemyConfig(config = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;

    const existing = system.alchemy || {};
    const checkMode = ['none', 'simple', 'tiered'].includes(config.checkMode)
      ? config.checkMode
      : ['none', 'simple', 'tiered'].includes(existing.checkMode)
        ? existing.checkMode
        : 'none';
    await systemManager.updateSystem(sysId, {
      alchemy: {
        ...existing,
        checkMode,
        learnOnCraft: config.learnOnCraft === true,
        consumeOnFail: config.consumeOnFail !== false,
        showAttemptHistoryToPlayers: config.showAttemptHistoryToPlayers !== false,
      },
    });
    await refresh();
  }

  // Live-set ONLY the system-level alchemy check mode (none/simple/tiered) from the
  // Recipe Resolution settings sub-section. MUST spread the nested alchemy block:
  // updateSystem shallow-merges the top level, so a naive `{ alchemy: { checkMode } }`
  // would drop learnOnCraft/consumeOnFail/showAttemptHistoryToPlayers and silently
  // re-default them.
  async function setAlchemyCheckMode(checkMode) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const next = ['none', 'simple', 'tiered'].includes(checkMode) ? checkMode : 'none';
    await systemManager.updateSystem(sysId, {
      alchemy: { ...(system.alchemy || {}), checkMode: next },
    });
    await refresh();
  }

  // Live-apply a per-recipe-item caps patch (issue 511). The Books & Scrolls
  // per-item page calls this with single-field patches (e.g. `{ item: { limitUses } }`
  // or `{ learn: { maxRecipes } }`); the manager merges the rest from the persisted
  // definition, so the surface stages no dirty draft.
  async function updateRecipeItemCaps(recipeItemId, capsPatch = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId || !recipeItemId) return;
    await systemManager.updateRecipeItemDefinition(sysId, recipeItemId, { caps: capsPatch });
    await refresh();
  }

  // Set which books/scrolls a recipe belongs to from the recipe side (issue 511
  // many-to-many). Reconciles each definition's `recipeIds` so the recipe is a member
  // of exactly `bookIds`. Writes only the definitions that actually change (via
  // updateRecipeItemDefinition — no "Recipe updated" toast), then refreshes.
  async function setRecipeBookMembership(recipeId, bookIds = []) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId || !recipeId) return;
    const rid = String(recipeId);
    const wanted = new Set((Array.isArray(bookIds) ? bookIds : []).map((id) => String(id)));
    const system = systemManager.getSystem?.(sysId);
    const definitions = Array.isArray(system?.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    let changed = false;
    for (const def of definitions) {
      const currentIds = (Array.isArray(def.recipeIds) ? def.recipeIds : []).map((id) => String(id));
      const has = currentIds.includes(rid);
      const want = wanted.has(String(def.id));
      if (has === want) continue;
      const next = want ? [...new Set([...currentIds, rid])] : currentIds.filter((id) => id !== rid);
      await systemManager.updateRecipeItemDefinition(sysId, def.id, { recipeIds: next });
      changed = true;
    }
    if (changed) await refresh();
  }

  // Enable / disable a single recipe item from the Books & Scrolls library row or
  // item-page toggle (issue 511). Persists only the `enabled` flag and refreshes;
  // navigation to the per-item editor is the router's concern, not the store's.
  async function setRecipeItemEnabled(recipeItemId, enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId || !recipeItemId) return;
    await systemManager.updateRecipeItemDefinition(sysId, recipeItemId, { enabled: enabled !== false });
    await refresh();
  }

  // Persist the full recipe-item editor draft in a single call (issue 511, PR-B).
  // The router owns the draft and passes the complete `{ enabled, originItemUuid,
  // caps }` snapshot; the manager patch accepts these fields. Refreshes projections
  // (resolved name/img/type + derived recipes[]) on success.
  async function saveRecipeItem(recipeItemId, patch = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId || !recipeItemId) return false;
    try {
      await systemManager.updateRecipeItemDefinition(sysId, recipeItemId, patch);
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to save recipe item:', err);
      services.notify?.error?.(err?.message || 'Failed to save recipe item');
      return false;
    }
  }

  // Delete a recipe-item definition after a confirm (issue 511, PR-B). Returns
  // false when cancelled or on error so the editor route can stay open.
  async function deleteRecipeItemDefinition(recipeItemId) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId || !recipeItemId) return false;
    const confirmed = await services.confirmDialog?.({
      title: services.localize?.('FABRICATE.Admin.Manager.RecipeItem.DeleteTitle') || 'Delete recipe item?',
      content: `<p>${services.localize?.('FABRICATE.Admin.Manager.RecipeItem.DeleteContent') || 'Delete this recipe item? Recipes linked to it will be unlinked.'}</p>`,
      yes: () => true,
      no: () => false,
    });
    if (!confirmed) return false;
    try {
      await systemManager.deleteRecipeItemDefinition(sysId, recipeItemId);
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to delete recipe item:', err);
      services.notify?.error?.(err?.message || 'Failed to delete recipe item');
      return false;
    }
  }

  function confirmDiscardDirtyRecipeItemDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.RecipeItem.DiscardDirtyContent',
      'The current recipe item has unsaved changes. Discard them and continue?'
    );
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
    const recipeManager = services.getRecipeManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return null;

    try {
      // New recipes are incomplete drafts, so they are born disabled and the GM enables them once
      // complete (an invalid recipe can never be activated).
      const created = await recipeManager.createRecipe(
        { craftingSystemId: sysId, enabled: false },
        { allowIncomplete: true }
      );
      await refresh();
      return created?.id ? { id: created.id } : null;
    } catch (err) {
      console.error('Fabricate | Failed to create recipe:', err);
      services.notify?.error?.(
        localizeRecipePersistenceError(err, services.localize) ||
          err?.message ||
          'Failed to create recipe'
      );
      return null;
    }
  }

  async function deleteRecipe(recipeId) {
    const recipeManager = services.getRecipeManager();
    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) return false;

    const confirmed = await services.confirmDialog({
      title: `Delete ${recipe.name}?`,
      content: `<p>Delete recipe <strong>${recipe.name}</strong>?</p>`,
      yes: () => true,
      no: () => false,
    });
    if (!confirmed) return false;

    await recipeManager.deleteRecipe(recipeId);
    await refresh();
    return true;
  }

  async function duplicateRecipe(recipeId) {
    const recipeManager = services.getRecipeManager();
    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) return false;
    const data = recipe.toJSON();
    delete data.id;
    data.name = `${data.name} (Copy)`;
    // A copy is born disabled: it starts as an editable draft and, in alchemy systems, would
    // otherwise immediately conflict with the original's signature.
    data.enabled = false;

    try {
      // A persisted shell (no ingredient sets / result groups) must duplicate into
      // another authoring shell, so allowIncomplete waives completeness here. A
      // complete recipe still duplicates and persists unchanged under this flag.
      await recipeManager.createRecipe(data, { allowIncomplete: true });
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to duplicate recipe:', err);
      services.notify?.error?.(
        localizeRecipePersistenceError(err, services.localize) ||
          err?.message ||
          'Failed to duplicate recipe'
      );
      return false;
    }
  }

  /**
   * Enable / disable a recipe. Disabling is always allowed; ENABLING an incomplete
   * recipe (or one with a conflicting signature) is rejected by `updateRecipe` — so
   * this is a GATED write, in explicit contrast to `toggleRecipeLocked` below.
   *
   * The refusal reason is localized once here and then surfaced ONCE. When the
   * caller supplies `onBlocked` (the recipe library's in-window flash, issue 643),
   * the flash OWNS the message and the Foundry notification is SUPPRESSED — the GM
   * must not be told the same thing twice, in two places, one of which is easy to
   * miss behind a maximised manager window. With no `onBlocked`, the notification
   * remains the only channel and still fires.
   *
   * @param {string} recipeId
   * @param {boolean} enabled
   * @param {{onBlocked?: (message: string) => void}} [options]
   * @returns {Promise<boolean>} whether the write landed.
   */
  async function toggleRecipeEnabled(recipeId, enabled, options = {}) {
    const recipeManager = services.getRecipeManager();

    try {
      // notify:false — the toggle is the GM's own explicit editor action with immediate
      // visual feedback, so the "Recipe updated" toast is noise.
      await recipeManager.updateRecipe(recipeId, { enabled }, { allowIncomplete: true, notify: false });
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to toggle recipe enabled state:', err);
      // An enable/save failure is surfaced as a localized, id-free message:
      // RecipeActivationError (enable, issue 550) or RecipePersistenceError (save,
      // issue 595) each carry coded issues the localizer maps to lang copy.
      const message =
        localizeRecipeActivationError(err, services.localize) ||
        localizeRecipePersistenceError(err, services.localize) ||
        err?.message ||
        'Failed to update recipe';

      if (typeof options?.onBlocked === 'function') options.onBlocked(message);
      else services.notify?.error?.(message);
      return false;
    }
  }

  /**
   * Lock / unlock a recipe. A locked recipe stays VISIBLE to players but only a GM
   * can craft it (`CraftingEngine.guardCraftStart` → 'Recipe is locked').
   *
   * This write is NEVER gated, which is the whole point of it existing separately
   * from `toggleRecipeEnabled`: locking is an authoring affordance a GM reaches for
   * precisely while a recipe is unfinished, so refusing it on incompleteness would
   * make it useless exactly when it is wanted. `allowIncomplete: true` therefore
   * applies in BOTH directions, and there is no activation gate to catch.
   *
   * @param {string} recipeId
   * @param {boolean} locked
   * @returns {Promise<boolean>} whether the write landed.
   */
  async function toggleRecipeLocked(recipeId, locked) {
    const recipeManager = services.getRecipeManager();

    try {
      // notify:false — same as the enabled toggle: an explicit editor action with
      // immediate visual feedback needs no "Recipe updated" toast.
      await recipeManager.updateRecipe(recipeId, { locked: locked === true }, { allowIncomplete: true, notify: false });
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to toggle recipe locked state:', err);
      services.notify?.error?.(
        localizeRecipePersistenceError(err, services.localize) ||
          err?.message ||
          'Failed to update recipe'
      );
      return false;
    }
  }

  /**
   * The player-character roster for the Access tab's Characters list. Sourced
   * through the injected service so the store never touches `game.*`. Returns
   * `[{ id, name, img }]` (name-sorted) or `[]` when the service is absent.
   * The Players roster reuses the existing `worldUsers` projection.
   * @returns {Array<{id: string, name: string, img: string}>}
   */
  function getPcRoster() {
    return services.getPlayerCharacterActors?.() || [];
  }

  /**
   * Persist a recipe's full access grant. The whole `access` object is replaced
   * (updateRecipe does a shallow top-level merge), so callers must always pass the
   * complete `{ characterIds, playerIds }` snapshot — never a partial patch.
   * Mirrors toggleRecipeEnabled: allowIncomplete so an authoring shell's grant can
   * be edited before it is craftable, then refreshes projections.
   * @param {string} recipeId
   * @param {{characterIds?: string[], playerIds?: string[]}} access
   * @returns {Promise<boolean>}
   */
  async function saveRecipeAccess(recipeId, access = {}) {
    const recipeManager = services.getRecipeManager();
    const characterIds = Array.isArray(access.characterIds) ? access.characterIds : [];
    const playerIds = Array.isArray(access.playerIds) ? access.playerIds : [];

    try {
      await recipeManager.updateRecipe(
        recipeId,
        { access: { characterIds, playerIds } },
        { allowIncomplete: true }
      );
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to save recipe access:', err);
      services.notify?.error?.(
        localizeRecipePersistenceError(err, services.localize) ||
          err?.message ||
          'Failed to update recipe access'
      );
      return false;
    }
  }

  async function updateRecipe(recipeId, updates = {}, options = {}) {
    const recipeManager = services.getRecipeManager();
    const sysId = get(selectedSystemId);
    if (!recipeId || !sysId) return false;
    if (!updates || typeof updates !== 'object') return false;
    if (Object.keys(updates).length === 0) return true;

    try {
      // The recipe editor only edits identity + the linked recipe item; a shell's
      // ingredients/results may still be empty. allowIncomplete keeps those
      // identity-only saves from being blocked by completeness validation.
      // notify defaults on; step authoring passes notify:false to avoid a toast
      // per keystroke-committed edit / reorder.
      await recipeManager.updateRecipe(recipeId, updates, {
        allowIncomplete: true,
        notify: options.notify !== false,
      });
      await refresh();
      return true;
    } catch (err) {
      console.error('Fabricate | Failed to update recipe:', err);
      // A save that flips a recipe to enabled can fail activation (issue 550); an
      // ordinary save can fail structural/reference validation (issue 595). Localize
      // either rather than surfacing the raw, id-leaking aggregate.
      services.notify?.error?.(
        localizeRecipeActivationError(err, services.localize) ||
          localizeRecipePersistenceError(err, services.localize) ||
          err?.message ||
          'Failed to update recipe'
      );
      return false;
    }
  }

  async function addRecipeItemFromUuid(systemId, itemUuid) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = systemId || get(selectedSystemId);
    if (!sysId || !itemUuid) return false;

    try {
      const result = await systemManager.addRecipeItemFromUuid(sysId, itemUuid);
      await refresh();
      return result;
    } catch (err) {
      console.error('Fabricate | Failed to add recipe item:', err);
      services.notify?.error?.(err?.message || 'Failed to add recipe item');
      return false;
    }
  }

  async function importRecipes() {
    await services.renderImportDialog(get(selectedSystemId));
  }

  async function exportRecipes() {
    const recipeManager = services.getRecipeManager();
    const sysId = get(selectedSystemId);
    const recipes = sysId
      ? recipeManager.getRecipes({ craftingSystemId: sysId }).map((r) => r.toJSON())
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
    const recipes = recipeManager.getRecipes({ craftingSystemId: targetId }).map((r) => r.toJSON());
    const version = services.getModuleVersion ? services.getModuleVersion() : '0.0.0';
    // Gathering authoring rides along: the FULL global environment array (the
    // exporter filters to this system) plus the whole gatheringConfig setting
    // (the exporter slices this system's block + shared vocabularies).
    const environmentStore = _getEnvironmentStore();
    const gatheringEnvironments =
      typeof environmentStore?.list === 'function' ? environmentStore.list() : [];
    const gatheringConfig = services.getSetting?.(GATHERING_CONFIG_SETTING) || {};
    const payload = buildExportPayload(
      system,
      recipes,
      version,
      gatheringEnvironments,
      gatheringConfig
    );
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
    const item = _getManagedItems(system).find((i) => i.id === itemId);
    if (!item) return;

    const confirmed = await services.confirmDialog({
      title: `Delete ${item.name}?`,
      content: `<p>Delete component <strong>${item.name}</strong> and remove it from recipes in this system?</p>`,
      yes: () => true,
      no: () => false,
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
    destroyed = true;
    unsubscribeFabricateReady?.();
    unsubscribeFabricateReady = null;
    unsubscribeFabricateDataChanged?.();
    unsubscribeFabricateDataChanged = null;
    unsubscribeSceneChange?.();
    unsubscribeSceneChange = null;
    unsubscribeTravelMarkerMove?.();
    unsubscribeTravelMarkerMove = null;
    readyRefreshScheduled = false;
    externalRefreshScheduled = false;
  }

  unsubscribeFabricateDataChanged = _subscribeExternalDataChanges();

  // Refresh the Map Region Links list when the GM activates a different scene.
  unsubscribeSceneChange =
    services.subscribeSceneChange?.(() => {
      if (destroyed) return;
      travel.patch();
    }) || null;

  // Refresh the live current-realm view when a party's travel marker token moves
  // (or is added/removed). Only re-patch for tokens that are actually a party's
  // travel marker, so unrelated token moves don't churn the Travel view.
  unsubscribeTravelMarkerMove =
    services.subscribeTravelMarkerMove?.((actorUuid) => {
      if (destroyed) return;
      if (!actorUuid) {
        travel.patch();
        return;
      }
      const parties = services.getGatheringPartyStore?.()?.list?.() || [];
      const isMarker = (Array.isArray(parties) ? parties : []).some(
        (party) => party?.travelActorUuid && String(party.travelActorUuid) === String(actorUuid)
      );
      if (isMarker) travel.patch();
    }) || null;

  // Trigger initial computation
  refresh();

  return {
    // Writable stores (inputs)
    selectedSystemId,
    activeTab,
    recipeSearch,
    itemSearch,
    selectedEnvironmentId,
    // Computed state
    viewState,
    // Actions
    selectSystem,
    createSystem,
    deleteSystem,
    saveSystemDetails,
    setResolutionMode,
    setVisibilityMode,
    setSalvageResolutionMode,
    setTab,
    selectEnvironment,
    createEnvironmentDraft,
    updateEnvironmentDraft,
    setEnvironmentCompositionMode,
    includeEnvironmentRecord,
    forceIncludeEnvironmentRecord,
    excludeEnvironmentRecord,
    restoreEnvironmentRecord,
    reorderEnvironmentRecord,
    confirmDiscardDirtyEnvironmentDraft,
    confirmDiscardDirtyComponentDraft,
    confirmDiscardDirtyEssenceDraft,
    confirmDiscardDirtyRecipeDraft,
    confirmRecipeAction,
    confirmDiscardDirtyGatheringTaskDraft,
    confirmDiscardDirtyGatheringEventDraft,
    confirmGatheringLibraryTaskCompositionLoss,
    confirmGatheringLibraryEventCompositionLoss,
    cancelEnvironmentDraft,
    saveEnvironmentDraft,
    duplicateEnvironmentDraft,
    deleteEnvironmentDraft,
    reorderEnvironments,
    moveEnvironmentDraft,
    toggleEnvironmentEnabled,
    setEnvironmentRealmMembership,
    toggleSystemEnabled,
    setToolBreakageAuthority,
    toggleFeature,
    toggleRequirement,
    addCategory,
    removeCategory,
    addTag,
    removeTag,
    addEssence,
    updateEssence,
    removeEssence,
    updateGatheringConditions,
    updateGatheringVocabulary,
    toggleGatheringConditionEnabled,
    addGatheringConditionValue,
    updateGatheringConditionValue,
    deleteGatheringConditionValue,
    addGatheringVocabularyValue,
    updateGatheringVocabularyValue,
    deleteGatheringVocabularyValue,
    updateGatheringRules,
    addGatheringLibraryTask,
    updateGatheringLibraryTask,
    validateGatheringLibraryTask,
    deleteGatheringLibraryTask,
    duplicateGatheringLibraryTask,
    addGatheringLibraryTool,
    updateGatheringLibraryTool,
    deleteGatheringLibraryTool,
    validateGatheringLibraryTool,
    enterToolsDraft,
    updateToolsDraft,
    addToolToDraft,
    addToolFromUuidToDraft,
    updateToolInDraft,
    deleteToolFromDraft,
    selectDraftTool,
    setExpandedDraftTool,
    validateToolsDraft,
    validateToolDraft,
    isToolDraftDirty,
    saveToolDraft,
    saveAllDirtyToolDrafts,
    saveToolsDraft,
    cancelToolsDraft,
    isToolsDraftDirty,
    confirmDiscardDirtyToolsDraft,
    gatheringTaskAutopopulateFromComponent,
    addGatheringLibraryEvent,
    updateGatheringLibraryEvent,
    deleteGatheringLibraryEvent,
    duplicateGatheringLibraryEvent,
    addGatheringCharacterModifier,
    updateGatheringCharacterModifier,
    deleteGatheringCharacterModifier,
    seedGatheringCharacterModifierPresets,
    addCharacterPrerequisite,
    updateCharacterPrerequisite,
    deleteCharacterPrerequisite,
    seedCharacterPrerequisitePresetsForSystem,
    addGatheringDropRowCharacterModifier,
    updateGatheringDropRowCharacterModifier,
    deleteGatheringDropRowCharacterModifier,
    addGatheringEventCharacterModifier,
    updateGatheringEventCharacterModifier,
    deleteGatheringEventCharacterModifier,
    saveCraftingCheckRouted,
    saveCraftingCheckSimple,
    saveCraftingCheckProgressive,
    saveCraftingCheckActive,
    saveSalvageCheckActive,
    saveSalvageCheckProgressive,
    saveSalvageCheckSimple,
    saveSalvageCheckRouted,
    saveGatheringCheckActive,
    saveGatheringCheckProgressive,
    saveGatheringCheckRouted,
    addCurrencyUnit,
    updateCurrencyUnit,
    deleteCurrencyUnit,
    addCurrencySubUnit,
    updateCurrencySubUnit,
    deleteCurrencySubUnit,
    setCurrencySpendStrategy,
    setCurrencyProvider,
    setCurrencyMacro,
    clearCurrencyMacro,
    seedCurrencyUnitPresets,
    saveAlchemyConfig,
    setAlchemyCheckMode,
    saveTeaserConfig,
    createRecipe,
    deleteRecipe,
    duplicateRecipe,
    toggleRecipeEnabled,
    toggleRecipeLocked,
    updateRecipe,
    getRecipeSignatureConflicts,
    getPcRoster,
    saveRecipeAccess,
    addRecipeItemFromUuid,
    updateRecipeItemCaps,
    setRecipeBookMembership,
    setRecipeItemEnabled,
    saveRecipeItem,
    deleteRecipeItemDefinition,
    confirmDiscardDirtyRecipeItemDraft,
    importRecipes,
    exportRecipes,
    exportSystem,
    importSystem,
    deleteComponent,
    updateComponent,
    setRecipeSearch,
    setItemSearch,
    setGraphSearch,
    // --- Travel (parties + per-system current-realm overrides) ---
    refreshTravelParties: travel.refreshTravelParties,
    selectParty: travel.selectParty,
    createParty: travel.createParty,
    renameParty: travel.renameParty,
    setPartyEnabled: travel.setPartyEnabled,
    deleteParty: travel.deleteParty,
    addPartyMember: travel.addPartyMember,
    addOrMovePartyMember: travel.addOrMovePartyMember,
    removePartyMember: travel.removePartyMember,
    movePartyMember: travel.movePartyMember,
    setPartyTravelActor: travel.setPartyTravelActor,
    clearPartyTravelActor: travel.clearPartyTravelActor,
    setPartyRealmOverride: travel.setPartyRealmOverride,
    clearPartyRealmOverride: travel.clearPartyRealmOverride,
    removeStaleMember: travel.removeStaleMember,
    clearStaleTravelActor: travel.clearStaleTravelActor,
    dropStaleOverrideRealm: travel.dropStaleOverrideRealm,
    createRealmQuick: travel.createRealmQuick,
    renameRealm: travel.renameRealm,
    toggleRealmEnabled: travel.toggleRealmEnabled,
    updateRealm: travel.updateRealm,
    setMapRegionLink: travel.setMapRegionLink,
    deleteRealm: travel.deleteRealm,
    setGatheringRealmsEnabled: travel.setGatheringRealmsEnabled,
    refresh,
    refreshGatheringConfig,
    refreshAccessRosters,
    resolveRecipeAccess,
    destroy,
  };
}
