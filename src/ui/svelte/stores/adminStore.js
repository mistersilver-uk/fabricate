/** adminStore — Svelte store factory for the RecipeManagerApp (T-120). */
import { writable, get } from 'svelte/store';

import {
  getCharacterPrerequisitePresetsForFoundrySystem,
  seedCharacterPrerequisitePresets,
} from '../../../config/characterPrerequisitePresets.js';
import {
  getCurrencyPresetsForFoundrySystem,
  seedCurrencyPresets,
} from '../../../config/currencyPresets.js';
import {
  getDefaultProviderId,
  getProviderCanonicalUnits,
} from '../../../config/currencyProviders.js';
import { getFabricateFlag } from '../../../config/flags.js';
import {
  getCharacterModifierPresetsForFoundrySystem,
  seedCharacterModifierPresets,
} from '../../../config/gatheringCharacterModifierPresets.js';
import {
  normalizeCharacterPrerequisite,
  normalizeCharacterPrerequisiteList,
} from '../../../systems/characterPrerequisites.js';
// THE ONE HOME OF "IS THIS SYSTEM-SCOPE ESSENCE WRITE AN OVERRIDE" (issue 1371 r19-store2).
// Shared with the standalone component editor app, which writes the same rows without this store.
import { componentEssenceOverrideOn } from '../../../systems/componentEssenceOverride.js';
import {
  buildExportPayload,
  validateImportData,
  prepareForImport,
  makeExportFilename,
} from '../../../systems/CraftingSystemExporter.js';
import { isGatheringRealmsEnabled } from '../../../systems/gatheringRealms.js';
import { readLearnedRecipeEntries } from '../../../systems/recipeKeyedFlagEntries.js';
import { recipeReferencesEssence } from '../../../utils/recipeEssenceReferences.js';
import { describeEssenceDeleteImpact } from '../../../utils/essenceBulkEditModel.js';
import { describeComponentDeleteImpact } from '../../../utils/recipeComponentReferences.js';
import {
  buildLearnedRecipeActorIndex,
  describeRecipeDeleteImpact,
} from '../../../utils/recipeDeleteImpact.js';
import {
  isGeneralRecipeCategory,
  normalizeCustomRecipeCategories,
} from '../../../utils/recipeCategories.js';
import {
  isGeneralComponentCategory,
  normalizeCustomComponentCategories,
} from '../../../utils/componentCategories.js';
import { withCategoryIcon } from '../../../utils/categoryIcons.js';
import { plainTextDescription } from '../../../utils/plainTextDescription.js';
import {
  planRecipeCategoryReassignments,
  planComponentCategoryReassignments,
  planTagRemovals,
  planRecipeTagRemovals,
} from '../../../utils/vocabularyCascade.js';
import {
  canAddCurrencySubUnit,
  CURRENCY_MACRO_KEYS,
  normalizeCurrencyUnit,
  normalizeWorldCurrencyConfig,
  validateCurrencyProfile,
} from '../../../systems/currencyProfile.js';
import {
  authoredCheckModifierIds,
  isRollExpression,
  resolveModifierBounds,
} from '../../../systems/checkModifierResolver.js';
import { validateDropRows } from '../../../systems/GatheringEnvironmentStore.js';
import {
  ENVIRONMENT_COMPOSED_COMPOSITION_STATES,
  ENVIRONMENT_INCLUDED_COMPOSITION_STATES,
  conditionSettingsToCurrent,
  environmentComposesRecord,
  resolveGatheringCompositionMode,
} from '../../../systems/gatheringComposition.js';
import { evaluateEnvironmentMatch } from '../../../systems/gatheringMatch.js';
import { normalizeNodeConfig, normalizeNodeRuntime } from '../../../systems/gatheringNodeConfig.js';
import { Tool } from '../../../models/Tool.js';
import { classifyModeChange } from '../../../migration/migrateRecipeForModeChange.js';
import { DEFAULT_GATHERING_EVENT_IMG } from '../../../gatheringImageDefaults.js';
import { DEFAULT_GATHERING_TASK_IMG } from '../../gatheringTaskDefaults.js';
import { evaluateSystemValidation } from '../../../systems/systemValidation.js';
import {
  localizeRecipeActivationError,
  localizeRecipeActivationParts,
  localizeRecipePersistenceError,
} from '../../../utils/recipeActivationMessages.js';
import { resolveRecipeAccessRoster } from '../../../utils/recipeAccessRoster.js';
import { authoredFailureOutcome } from '../../../utils/gatheringFailureOutcome.js';
import {
  activityFailureResultPolicy,
  normalizeFailureResultPolicy,
} from '../../../utils/failureResultPolicy.js';
import { REVISION_SCOPES } from '../../../systems/revisionTokens.js';
// The two authority tokens, imported rather than re-spelled (issue 1374): the write path reads
// any third value as a CLEAR, so tokens, resolver and normalizer must share one set.
import {
  seedToolRepairRequirements as _seedToolRepairRequirements,
  TOOL_BREAKAGE_AUTHORITIES,
  TOOL_SECTIONS,
} from '../../../systems/toolScope.js';
// The read union and the switch deciding what it answers (issue 1373): the Tool Rules editor
// DISPLAYS from `resolvedToolsFor` and SAVES only the sections the membership record marks
// overriding, so a display read cannot convert an inheriting section into an override.
import { componentsWithResolvedEssences } from '../../../systems/resolvedComponentEssences.js';
import { resolvedToolsFor } from '../../../systems/scopedEntityReads.js';
import { findMembership, isSectionInherited } from '../../../systems/scopedDefinitions.js';
import {
  defaultKnowledgeTab,
  projectKnowledgeSnapshot,
} from '../apps/manager/knowledge/knowledgeStudio.js';
import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../util/essenceIcons.js';
import {
  TIME_OF_DAY_ICONS,
  WEATHER_ICONS,
  WEATHER_FALLBACK_ICON,
} from '../util/gatheringConditionIcons.js';
import {
  createRecipeGraphIndex,
  buildBoundedRecipeGraph,
  layoutGraph,
} from '../util/recipeGraphBuilder.js';

// The GM browser projection (issue 1090). Row, card and inspector projection are pure modules;
// this store is the reactive wiring around them. Each is imported back under the module-private
// name it had here, so the call sites below are unchanged.
import {
  buildItemCards as _buildItemCards,
  republishHydratedItemCards as _republishHydratedItemCards,
} from './adminComponentRowProjection.js';
import {
  buildRecipeList as _buildRecipeList,
  withoutDerivedRecipeProjectionFields,
} from './adminRecipeRowProjection.js';
import {
  clonePlain as _clonePlain,
  fallbackRandomID as _fallbackRandomID,
  normalizeGatheringLibraryTool as _normalizeGatheringLibraryTool,
} from './adminStoreInternals.js';
import {
  buildSelectedSystemViewData as _buildSelectedSystemViewData,
  enrichRecipeItemLibrary as _enrichRecipeItemLibrary,
} from './adminSystemInspectorProjection.js';
import { createWorldScopeActions } from './worldScopeActions.js';
import {
  buildWorldScopeState as _buildWorldScopeState,
  emptyWorldScopeState as _emptyWorldScopeState,
} from './worldScopeProjection.js';

// `DERIVED_RECIPE_PROJECTION_FIELDS` and `withoutDerivedRecipeProjectionFields` moved to the row
// projection and are re-exported here so the old import path is unchanged.

// --- Constants ---

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
  refundOnPlayerCancel: 'refundOnPlayerCancel',
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
// The world setting the `1.34.0` equivalent-essence merge writes its map to (issue 1654), spelled
// out because this file does not import `src/config/settings.js`. Guarded by
// `tests/essence-world-scope-screens.test.js`, which drives the store with a double keyed on it.
const WORLD_ESSENCE_MERGE_MAP_SETTING = 'worldEssenceMergeMap';
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
// ENVIRONMENT_INCLUDED_COMPOSITION_STATES is imported from gatheringComposition.js — the
// module that now owns the full composition-state vocabulary — rather than defined here.
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

// --- Module-private helper functions ---

// --- Currency unit mutation helpers, module-level and shallow so the mutate callbacks stay flat ---

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

/** Reorder a list, returning a new array, or `null` for an invalid or no-op move. */
function _reorderListByIndex(list, fromIndex, toIndex) {
  const source = Array.isArray(list) ? list : [];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || from >= source.length) return null;
  if (to < 0 || to >= source.length) return null;
  if (from === to) return null;
  const next = [...source];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
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

function _getManagedItems(system) {
  if (Array.isArray(system?.components)) return system.components;
  if (Array.isArray(system?.items)) return system.items;
  return [];
}

/**
 * The persisted recipe of `recipeId`, only when it belongs to `systemId`; `getRecipe` is keyed on
 * the recipe id alone and spans every system, so another system's recipe answers `null`.
 */
function _recipeOfSystem(recipeManager, recipeId, systemId) {
  const recipe = recipeManager?.getRecipe?.(recipeId);
  if (!recipe) return null;
  return String(recipe.craftingSystemId || '') === String(systemId || '') ? recipe : null;
}

function _buildManagedItemOptions(managedItems = []) {
  return managedItems.map((item) => ({
    id: item.id,
    name: item.name,
    img: item.img || 'icons/svg/item-bag.svg',
    description: _plainTextDescription(item.description),
    // Component category (issue 676) — the PER-COMPONENT field, a different projection from the
    // system-level `componentCategories` vocabulary. Normalization guarantees the key.
    category: item.category || 'general',
    ...(item.originItemUuid && { originItemUuid: item.originItemUuid }),
    ...(item.registeredItemUuid && { registeredItemUuid: item.registeredItemUuid }),
    ...(Object.prototype.hasOwnProperty.call(item, 'difficulty') && {
      difficulty: item.difficulty,
    }),
    // The authored complication list for the two GM read-only strips (issue 1286), not
    // `forecastComplications`: that filters to `visibility: 'visible'`, the player view, while the
    // authored default is `gmOnly`. Absence-preserving: a component with none carries no key.
    ...(Object.prototype.hasOwnProperty.call(item, 'complications') && {
      complications: _clonePlain(item.complications),
    }),
  }));
}

/**
 * Minimal `{ id, tags }` projection of the managed components, for the recipe Validation tab's
 * overlap detection.
 */
function _buildComponentTagOptions(managedItems = []) {
  return managedItems.map((item) => ({
    id: item.id,
    tags: Array.isArray(item.tags)
      ? item.tags.map((tag) => String(tag ?? '').trim()).filter(Boolean)
      : [],
    // Numeric-positive essence quantities, so an essence option's `expandToComponentIds` resolves
    // its carriers during readiness/signature checks; without it, overlap detection no-ops.
    essences: _normalizeComponentEssences(item.essences),
  }));
}

/** Numeric-positive essence quantities of a managed component, keyed by trimmed essence id. */
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
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function _normalizeGatheringTagList(value) {
  const values = Array.isArray(value) ? value : value ? String(value).split(',') : [];
  return [...new Set(values.map(_normalizeGatheringTag).filter(Boolean))];
}

function _normalizeGatheringConditionIdList(value) {
  const values = Array.isArray(value) ? value : value ? String(value).split(',') : [];
  return [...new Set(values.map(_normalizeGatheringConditionId).filter(Boolean))];
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
  // Bare strings get a generated capitalised label; the raw string would render a lowercase chip
  // ("northreach" for "Northreach"). Records keep their explicit label when present.
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
// Mirrors GatheringRichStateService: `dropModifierMode` is one global system setting, never
// overridable per modifier.
const GATHERING_DROP_MODIFIER_MODES = new Set(['additive', 'multiplicative']);

/**
 * Normalize one entry of the system modifier library on the write path (issue 1117); the manager is
 * the authority and re-normalizes anyway.
 */
function _normalizeSystemModifier(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const id = entry.id ? String(entry.id) : '';
  if (!id) return null;
  const expression = String(entry.expression ?? '').trim();
  const normalized = {
    id,
    label: String(entry.label ?? '') || id,
    icon: String(entry.icon || 'fa-solid fa-user'),
    expression,
    isRollExpression: isRollExpression(expression),
  };
  const { min, max } = resolveModifierBounds(entry);
  if (min !== null) normalized.min = min;
  if (max !== null) normalized.max = max;
  return normalized;
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
    // Optional task-default environment: the MIDDLE precedence tier for on-drop canvas env
    // resolution (region auto-detect -> THIS -> GM dialog). A stale id falls through to the dialog.
    defaultEnvironmentId: (() => {
      const id =
        typeof task.defaultEnvironmentId === 'string' ? task.defaultEnvironmentId.trim() : '';
      return id || null;
    })(),
    // Preserve the resource-node config so authoring it on a task survives the save; the runtime
    // reads it back to seed per-env pools and canvas tokens snapshot it for per-token depletion.
    ...(normalizeNodeConfig(task.nodes) && { nodes: normalizeNodeConfig(task.nodes) }),
    // This task's own check-modifier pick (issue 1095), consulted only under the `bySubject` rule
    // and attached ONLY when authored: an authored empty array is a real pick of zero, where an
    // absent one inherits `gatheringCraftingCheck.defaultModifierIds`.
    ...authoredCheckModifierIds(task.checkModifierIds),
    // The task's text/macro failure feedback (issue 1098, CF8), through the shared attach its mirror
    // uses. Emitted by NEITHER library rebuild before that issue, so an authored value was dropped.
    ...authoredFailureOutcome(task.failureOutcome),
    // Optional per-task gathering DC override, replacing the system default at gather time; null
    // means use the default. Guarded explicitly because `Number(null)` is a spurious `0` override.
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
  // Accept the legacy hazard-schema rule keys on read (imported or pre-1.0.0-migration config) so
  // the intended rules survive until the startup migration rewrites them.
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
  // Generalized drop-modifier mode. Read the new key, then the legacy `characterModifierMode`
  // (issue 324 never shipped — read-time compat, not a migration), then the default. Never
  // emit the legacy key.
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
  // Top-level vocabularies are normalised into the per-system `{ id, label, icon, colorToken }`
  // shape, so the fallback path renders capitalised labels rather than bare ids. The normalisers
  // accept bare strings or records, so either persisted shape roundtrips; `danger` stays a bare list.
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
      // `characterModifiers` is deliberately absent (issue 1117): the library moved onto the crafting
      // system and is projected as `selectedSystem.modifiers`. This projection is an allowlist, so
      // omitting the key is what makes the old location invisible rather than merely stale.
      ...(systemConfig?.economy && { economy: _clonePlain(systemConfig.economy) }),
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
  return String(value ?? '').replaceAll(
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

/** The graph projection before anything has been queried (issue 1082). */
function _emptyGraphData() {
  return { nodes: [], edges: [], width: 0, height: 0, bound: null };
}

/**
 * The recipe ids whose name matches a graph search term, read off the retained index's node seeds
 * so the cohort resolves before the bounded query decides what to materialise.
 */
function _graphSearchMatches(index, lowerSearchTerm) {
  const matches = [];
  for (const seed of index.nodeSeedById.values()) {
    if ((seed.name || '').toLowerCase().includes(lowerSearchTerm)) matches.push(seed.id);
  }
  return matches;
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

// The WORLD currency projection (issue 1278). A top-level sibling, never hung off
// `selectedSystem`: the config is world scope, and hanging it there would make the same ladder
// appear to change when the GM merely clicks a different crafting system.
function _emptyWorldCurrencyState() {
  return {
    worldCurrency: {
      spendStrategy: 'actorProperty',
      providerId: '',
      macros: { canAfford: '', increment: '', decrement: '', balance: '' },
      units: [],
    },
    worldCurrencyValidation: _emptyWorldCurrencyValidation(),
  };
}

// The derived `validateCurrencyProfile` report for the world ladder (issue 1493), a top-level
// sibling of `worldCurrency` rather than a fifth key inside it, since `CurrencyConfig` is exactly
// those four keys. Only `valid` and `errors` are published; no surface reads the rest.
function _emptyWorldCurrencyValidation() {
  return { valid: true, errors: [] };
}

function _buildWorldCurrencyValidation(config) {
  const report = validateCurrencyProfile(config?.units, {
    spendStrategy: config?.spendStrategy,
    macros: config?.macros,
  });
  return {
    valid: report?.valid === true,
    errors: Array.isArray(report?.errors) ? [...report.errors] : [],
  };
}

// The WORLD character libraries projection (issue 1308), a top-level sibling for the reason the
// currency projection is one.
function _emptyCharacterLibrariesState() {
  return {
    worldCharacterPrerequisites: [],
    worldModifiers: [],
  };
}

function _emptyTravelState() {
  return {
    travelParties: [],
    selectedPartyId: '',
    travelSaving: false,
    travelError: null,
    travelFieldErrors: {},
    worldRealms: [],
    actorOptions: [],
  };
}

/** Map a thrown party/realm store error to inline field errors plus a summary. */
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
  const escaped = String(path)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', String.raw`\"`);
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
  return String(path || 'field').replaceAll(/[^a-zA-Z0-9_-]+/g, '-');
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
 * The result shape of `CraftingSystemManager.applyBulkEditToRecipes` (issue 1010), split by kind so
 * {@link _normalizeBulkRecipeEditResult} stays a loop rather than eight near-identical coercions.
 */
const BULK_RECIPE_EDIT_RESULT_COUNTS = Object.freeze([
  'updated',
  'blockedEnables',
  'rejected',
  'booksUpdated',
  'bookAdditions',
  'bookRemovals',
]);
const BULK_RECIPE_EDIT_RESULT_ID_LISTS = Object.freeze([
  'recipeIds',
  'blockedRecipeIds',
  'rejectedRecipeIds',
  'bookIds',
]);

/**
 * Coerce the bulk-recipe write result into its full shape so the post-apply notification can read
 * every count unconditionally.
 */
function _normalizeBulkRecipeEditResult(result) {
  const normalized = {};
  for (const key of BULK_RECIPE_EDIT_RESULT_COUNTS) normalized[key] = Number(result?.[key]) || 0;
  for (const key of BULK_RECIPE_EDIT_RESULT_ID_LISTS) {
    normalized[key] = Array.isArray(result?.[key]) ? result[key] : [];
  }
  return normalized;
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

/** Which recipes in the system require the essence, and therefore how many (issue 1036). */
function _essenceRecipeUsage(essenceId, recipes) {
  const ids = (Array.isArray(recipes) ? recipes : [])
    .filter((recipe) => recipeReferencesEssence(recipe, essenceId))
    .map((recipe) => String(recipe?.id ?? ''))
    .filter(Boolean);
  return { count: ids.length, ids };
}

/**
 * The world identity's colour per essence id, for the selected system's rows to draw. A read
 * overlay on the projection, not a change to the union: `ui-integration`
 * `### GM World Essence Screens` requirement 21 (issue 1371).
 */
/** The essence ids the world catalogue holds; the bulk panel withholds its colour axis for them. */
function _worldEssenceIds(worldScopeState) {
  const ids = new Set();
  for (const entry of worldScopeState?.worldScope?.essence?.entries ?? []) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    if (id) ids.add(id);
  }
  return ids;
}

function _worldEssenceColourById(worldScopeState) {
  const byId = new Map();
  for (const entry of worldScopeState?.worldScope?.essence?.entries ?? []) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    const colour = entry?.entity?.colorToken;
    if (id && typeof colour === 'string' && colour.trim()) byId.set(id, colour.trim());
  }
  return byId;
}

function _buildEssenceCards(essenceDefinitions, managedItems, managedItemOptions, recipes = []) {
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
    const recipeUsage = _essenceRecipeUsage(def.id, recipes);
    const recipeUsageCount = recipeUsage.count;
    return {
      ...def,
      icon: normalizeEssenceIcon(def.icon || DEFAULT_ESSENCE_ICON),
      // `enabled` is DEFAULT-TRUE and the spread carries whatever the definition holds, including
      // `undefined` for one predating the field. Folding it explicitly means no consumer has to repeat
      // the `!== false` convention; `if (card.enabled)` would treat every legacy essence as disabled.
      enabled: def.enabled !== false,
      propertyMacroUuid: def.propertyMacroUuid || null,
      sourceComponentId,
      sourceItemUuid,
      associatedSystemItemId: sourceComponentId || null,
      associatedItem,
      associatedItemName: associatedItem?.name || null,
      sourceName:
        associatedItem?.name ||
        (sourceState === 'stale' ? sourceComponentId || sourceItemUuid : ''),
      sourceState,
      // `hasEffectTransfer` is "a source is configured", not "the source resolves": a stale or missing
      // link is still an authored intention, and the source-state marker says whether it works.
      hasEffectTransfer: sourceState !== 'none',
      hasPropertyMacro: String(def.propertyMacroUuid || '').trim() !== '',
      componentUsageCount,
      componentUsageItems,
      recipeUsageCount,
      // The IDENTITIES behind `recipeUsageCount`. `describeEssenceDeleteImpact` unions carriers rather
      // than summing counts and cannot union what it is not given: without this key the sidebar
      // reported "0 recipes will be rewritten" for recipes it was about to rewrite.
      recipeUsageIds: recipeUsage.ids,
      // Deleting an essence is WARNED, never BLOCKED (issue 1036). The cascade strips it from every
      // carrying component and rewrites every referencing recipe, so no `deleteBlocked` state remains.
      deleteRewritesRecipes: recipeUsageCount > 0,
    };
  });
}

// Thin delegator to the shared Foundry-free plain-texter (`src/utils/plainTextDescription.js`),
// kept as a named module function because source-contract tests may pin the name. The shared
// helper flattens Foundry enricher directives (issue 800) before the HTML strip.
function _plainTextDescription(value) {
  return plainTextDescription(value);
}

// --- Public factory ---

/** Create a new adminStore. `services` carries every side effect; this module never touches `game.*`. */
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
  const toolDraft = writable(null);
  const toolDraftBaseline = writable(null);
  const toolDraftSystemId = writable('');
  const toolDraftSourceItemUuid = writable('');
  const toolDraftDirty = writable(false);
  const toolDraftSaving = writable(false);
  const toolDraftSaveError = writable(null);
  const toolDraftValidation = writable({ valid: false, errors: ['missing'] });
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

  // The retained producer/consumer index (issue 1082), keyed on the recipe revision token
  // `RecipeManager` mints. Every graph interaction that is not a definition change re-queries it
  // rather than rebuilding, and it holds exactly one system: switching replaces it.
  let graphIndexCache = null;

  /** The producer/consumer index for one system, built at most once per recipe revision. */
  function _graphIndexFor(selectedSystem, recipeManager) {
    const revision =
      recipeManager?.revision?.(REVISION_SCOPES.recipesOfSystem(selectedSystem.id)) ?? null;
    if (
      graphIndexCache &&
      graphIndexCache.systemId === selectedSystem.id &&
      revision !== null &&
      graphIndexCache.revision === revision
    ) {
      return graphIndexCache.index;
    }
    const index = createRecipeGraphIndex(
      recipeManager.getRecipes({ craftingSystemId: selectedSystem.id })
    );
    graphIndexCache = { systemId: selectedSystem.id, revision, index };
    return index;
  }

  /** The laid-out, bounded graph projection for the selected system (issue 1082). */
  function _buildGraphData(selectedSystem, recipeManager) {
    const index = _graphIndexFor(selectedSystem, recipeManager);
    const searchTerm = (get(graphSearch) || '').toLowerCase().trim();
    const scope = searchTerm
      ? { type: 'cohort', recipeIds: _graphSearchMatches(index, searchTerm) }
      : { type: 'all' };
    return layoutGraph(buildBoundedRecipeGraph(index, { scope }));
  }

  // `refresh()` is invoked by ~40 mutation paths and a whole-world `actors x items` scan has no cheap
  // invalidation signature, so the knowledge projection must not join it (issue 785).
  // `knowledgeActive` makes `refreshKnowledge()` a total no-op while the surface is closed.
  let knowledgeActive = false;
  let knowledgeSnapshot = null;
  let knowledgeSelectedActorId = '';
  let knowledgeRefreshScheduled = false;
  // Resolved ONCE per surface entry from the DEFINITION count, never as a live derivation: a GM
  // authoring the first recipe item elsewhere would flip 0 -> 1 and yank the open tab mid-task.
  let knowledgeDefaultTab = defaultKnowledgeTab(0);
  let knowledgeDefaultTabResolved = false;

  // Per-store item-card memo (store-instance scope, NEVER module-global — avoids cross-app/test
  // bleed). OWNED here and INJECTED into the projection for that reason; see
  // `adminComponentRowProjection.js`. Cleared in `refresh()` on a resolved-system-id change.
  const itemCardCache = new Map();
  let itemCardCacheSystemId = '';
  // Coalesces the per-card `onHydrated` callbacks of one page into ONE republish (issue 1081): a
  // page hydrates 25 cards on 25 microtasks, and 25 republishes would re-run every reader 25 times.
  let itemCardRepublishScheduled = false;
  // The cards that reported a fill since the last republish, held by IDENTITY; only these get a
  // fresh object. Cleared on every republish, so it never outlives one microtask of hydrations.
  const hydratedItemCards = new Set();

  // --- Computed state ---
  const viewState = writable({
    systems: [],
    systemsLoading: false,
    hasSystem: false,
    selectedSystemName: '',
    selectedSystem: null,
    itemCards: [],
    essenceCards: [],
    // WHAT REQUIRES EACH TOOL in the selected system, keyed by tool id (issue 1373), for the Tool
    // rules editor's `Required for` rail. An empty map is what a world with no selection publishes.
    toolRequiredFor: {},
    recipes: [],
    recipeCategories: [],
    // The recipe half of the Tags & Categories reference count, folded by the row projection off the
    // recipe MODELS (issue 1081). Published as data because its reader — the persistent left nav
    // badge — is a sibling of every view, so deriving it walked the DETAIL tier on every render.
    recipeTagPlaceholderCounts: {},
    showVisibilitySummary: false,
    worldUsers: [],
    // EVERY world actor (not the player-character roster), each carrying its control set; the recipe
    // editor's context rail resolves granted character ids over it. See `src/utils/recipeAccessRoster.js`.
    accessCharacters: [],
    // The derived `evaluateSystemValidation` report for the selected system, consumed by the system
    // overview, its rail count badge and the blocker banner. Derived — nothing is persisted.
    systemValidation: {
      issues: [],
      counts: { critical: 0, warning: 0, info: 0, blockers: 0 },
      blocksSystem: false,
    },
    recipeSearchTerm: '',
    itemSearchTerm: '',
    graphData: _emptyGraphData(),
    graphSearchTerm: '',
    experimentalFeaturesEnabled: services.getSetting?.('experimentalFeatures') === true,
    gatheringConfig: _normalizeGatheringConfig(
      services.getSetting?.(GATHERING_CONFIG_SETTING) || {}
    ),
    foundrySystemId:
      typeof services.getFoundrySystemId === 'function'
        ? String(services.getFoundrySystemId() || '')
        : '',
    // The GM Knowledge surface projection (issue 785). A TOP-LEVEL sibling, deliberately NEVER hung
    // off `selectedSystem`: that would force a reference rebuild on every knowledge publish and let
    // a late phase-2 `refresh()` clobber freshly projected rows.
    knowledge: projectKnowledgeSnapshot(null, { active: false }),
    ..._emptyEnvironmentState(false),
    ..._emptyTravelState(),
    ..._emptyWorldCurrencyState(),
    ..._emptyCharacterLibrariesState(),
    // The three world-scope entity corpora (issue 1362). Seeded EMPTY rather than absent so a world
    // screen mounted before the first publish reads a shape, and `seeded` reads all-false — an
    // UNKNOWN corpus, never an empty one.
    ..._emptyWorldScopeState(),
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

  /**
   * Republish `itemCards` after cards filled themselves in place (issue 1081), each swapped for a
   * FRESH object: this store publishes through a non-proxying `writable`, so Svelte compares by
   * `===` and a card whose identity did not move never reaches a render.
   */
  function _scheduleItemCardRepublish(card) {
    if (card) hydratedItemCards.add(card);
    if (itemCardRepublishScheduled) return;
    itemCardRepublishScheduled = true;
    queueMicrotask(() => {
      itemCardRepublishScheduled = false;
      const hydrated = new Set(hydratedItemCards);
      hydratedItemCards.clear();
      viewState.update((state) => ({
        ...state,
        itemCards: _republishHydratedItemCards(state.itemCards || [], hydrated),
      }));
    });
  }

  function _currentToolsDraftViewPatch() {
    const draft = get(toolDraft);
    const baseline = get(toolDraftBaseline);
    const systemId = get(toolDraftSystemId);
      // THE UNION, because this is a display projection and the draft it overlays is one too (issue
      // 1373). A raw-array library beneath a union-seeded draft would be two answers to one question.
    const library = systemId ? _resolvedSystemTools(systemId) : [];
    const overlay = (entries, entry) => {
      if (!entry) return entries.map(_clonePlain);
      const index = entries.findIndex((tool) => String(tool.id) === String(entry.id));
      if (index === -1) return [...entries.map(_clonePlain), _clonePlain(entry)];
      return entries.map((tool, toolIndex) =>
        toolIndex === index ? _clonePlain(entry) : _clonePlain(tool)
      );
    };
    return {
      toolDraft: _clonePlain(draft),
      toolDraftBaseline: _clonePlain(baseline),
      toolDraftSystemId: systemId,
      toolDraftSourceItemUuid: get(toolDraftSourceItemUuid),
      toolDraftDirty: get(toolDraftDirty),
      toolDraftSaving: get(toolDraftSaving),
      toolDraftSaveError: get(toolDraftSaveError),
      toolDraftValidation: _clonePlain(get(toolDraftValidation)),
      // Temporary shell aliases: these are projections, never mutable editor state.
      toolsDraft: systemId ? overlay(library, draft) : null,
      toolsDraftBaseline: systemId ? overlay(library, baseline) : null,
      toolsDraftSystemId: systemId,
      toolsDraftDirty: get(toolDraftDirty),
      toolsDraftDirtyToolIds: get(toolDraftDirty) && draft?.id ? [draft.id] : [],
      toolsDraftSaving: get(toolDraftSaving),
      toolsDraftSaveError: get(toolDraftSaveError),
      toolsDraftSelectedToolId: draft?.id || '',
      toolsDraftExpandedToolId: draft?.id || '',
    };
  }

  function _patchToolsDraftViewState() {
    viewState.update((state) => ({
      ...state,
      ..._currentToolsDraftViewPatch(),
    }));
  }

  function _recomputeToolsDraftDirty() {
    const current = get(toolDraft);
    const baseline = get(toolDraftBaseline);
    toolDraftDirty.set(current !== null && JSON.stringify(current) !== JSON.stringify(baseline));
  }

  function enterToolsDraft(systemId = get(selectedSystemId)) {
    if (!systemId) return false;
    toolDraft.set(null);
    toolDraftBaseline.set(null);
    toolDraftSystemId.set(String(systemId));
    toolDraftSourceItemUuid.set('');
    toolDraftDirty.set(false);
    toolDraftSaveError.set(null);
    toolDraftValidation.set({ valid: false, errors: ['missing'] });
    _patchToolsDraftViewState();
    return true;
  }

  function _setFocusedToolDraft(draft, baseline, systemId) {
    toolDraft.set(_clonePlain(draft));
    toolDraftBaseline.set(_clonePlain(baseline));
    toolDraftSystemId.set(String(systemId || ''));
    toolDraftSourceItemUuid.set('');
    toolDraftSaveError.set(null);
    _recomputeToolsDraftDirty();
    toolDraftValidation.set(validateToolDraft());
    _patchToolsDraftViewState();
    return true;
  }

  /** Open an unpersisted draft for a brand-new system Tool. */
  function createToolDraft(initialPatch = {}, systemId = get(selectedSystemId)) {
    if (!systemId) return null;
    const patch = initialPatch && typeof initialPatch === 'object' ? initialPatch : {};
    const created = _normalizeGatheringLibraryTool({ ...patch, id: _randomID() }, _randomID);
    _setFocusedToolDraft(created, null, systemId);
    return _clonePlain(created);
  }

  /**
   * Open the rules editor on one Tool, seeded from the read union (issue 1373): for an inheriting
   * section the draft must state the value a craft will take.
   */
  function openToolDraft(toolId, systemId = get(selectedSystemId)) {
    const id = String(toolId || '');
    if (!id || !systemId) return false;
    const existing = _resolvedSystemTools(systemId).find((tool) => String(tool.id) === id);
    if (!existing) return false;
    return _setFocusedToolDraft(existing, existing, systemId);
  }

  function patchToolDraft(patch = {}) {
    const current = get(toolDraft);
    if (!current || !patch || typeof patch !== 'object') return false;
    const nested = ['requirement', 'prerequisites', 'bonus', 'breakage', 'onBreak'];
    const merged = { ...current, ...patch };
    for (const key of nested) {
      if (patch[key] && typeof patch[key] === 'object') {
        merged[key] = { ...current[key], ...patch[key] };
      }
    }
    toolDraft.set(_normalizeGatheringLibraryTool(merged, _randomID));
    toolDraftSaveError.set(null);
    _recomputeToolsDraftDirty();
    toolDraftValidation.set(validateToolDraft());
    _patchToolsDraftViewState();
    return true;
  }

  function updateToolsDraft(mutator) {
    if (typeof mutator !== 'function') return false;
    const current = get(toolDraft);
    if (!current) return false;
    const next = mutator([_clonePlain(current)]);
    return Array.isArray(next) && next[0] ? patchToolDraft(next[0]) : false;
  }

  /**
   * Register a first-class item-sourced Tool from a dropped Item uuid (issue 561): `componentId:
   * null`, its own source refs, and the durable `roles[systemId].toolId` stamped on the Item.
   */
  async function addToolFromUuidToDraft(itemUuid) {
    if (!get(toolDraft) && !createToolDraft()) return false;
    return stageToolDraftSource(itemUuid);
  }

  function stageToolDraftSource(itemUuid, snapshot = {}) {
    const uuid = String(itemUuid || '').trim();
    if (!uuid || !get(toolDraft)) return false;
    toolDraftSourceItemUuid.set(uuid);
    return patchToolDraft({
      ...snapshot,
      componentId: null,
      registeredItemUuid: uuid,
      originItemUuid: uuid,
      aliasItemUuids: [],
    });
  }

  function unlinkToolDraftSource() {
    if (!get(toolDraft)) return false;
    toolDraftSourceItemUuid.set('');
    return patchToolDraft({
      componentId: null,
      registeredItemUuid: null,
      originItemUuid: null,
      aliasItemUuids: [],
      name: null,
      img: null,
      description: '',
    });
  }

  function updateToolInDraft(toolId, patch = {}) {
    if (!toolId || typeof patch !== 'object' || patch === null) return false;
    if (String(get(toolDraft)?.id || '') !== String(toolId) && !openToolDraft(toolId)) return false;
    return patchToolDraft(patch);
  }

  async function deleteToolFromDraft(toolId) {
    const id = String(toolId || get(toolDraft)?.id || '');
    if (!id) return false;
    if (String(get(toolDraft)?.id || '') !== id && !openToolDraft(id)) return false;
    return deleteToolDraft();
  }

  function selectDraftTool(toolId) {
    return toolId ? openToolDraft(toolId) : false;
  }

  function setExpandedDraftTool(toolId) {
    return toolId ? openToolDraft(toolId) : false;
  }

  function validateToolsDraft() {
    const result = validateToolDraft();
    return result.valid
      ? { valid: true, errors: [] }
      : { valid: false, errors: [{ id: get(toolDraft)?.id || '', errors: result.errors }] };
  }

  function validateToolDraft(toolId = get(toolDraft)?.id) {
    const id = String(toolId || '');
    const tool = get(toolDraft);
    if (String(tool?.id || '') !== id) return { valid: false, errors: ['missing'] };
    if (!tool) return { valid: false, errors: ['missing'] };
    const result = Tool.fromJSON(tool).validate();
    return { valid: result.valid, errors: result.errors };
  }

  function isToolDraftDirty(toolId = get(toolDraft)?.id) {
    return String(toolId || '') === String(get(toolDraft)?.id || '') && get(toolDraftDirty);
  }

  async function saveToolDraft() {
    const systemId = get(toolDraftSystemId);
    const draft = get(toolDraft);
    if (!systemId || !draft) return false;
    if (!get(toolDraftDirty)) return true;
    const validation = validateToolDraft();
    toolDraftValidation.set(validation);
    if (!validation.valid) {
      toolDraftSaveError.set('invalid');
      _patchToolsDraftViewState();
      return false;
    }
    const systemManager = services.getCraftingSystemManager?.();
    if (typeof systemManager?.upsertTool !== 'function') return false;
    toolDraftSaving.set(true);
    toolDraftSaveError.set(null);
    _patchToolsDraftViewState();
    try {
      const itemUuid = get(toolDraftSourceItemUuid);
      // SECTION-AWARE: `_toolRecordForSave` restores every INHERITING section from the live in-system
      // record, so a draft seeded from the read union cannot write the world's answer as an override.
      const result = await systemManager.upsertTool(
        systemId,
        _toolRecordForSave(systemId, draft),
        itemUuid ? { itemUuid } : {}
      );
      if (!result?.item) throw new Error('Tool save returned no item');
      const persisted = _normalizeGatheringLibraryTool(result.item, _randomID);
      // AND THE EDITOR GOES BACK TO THE UNION, not to the record the manager just wrote: an
      // inheriting section's persisted value is deliberately NOT what this screen shows.
      const saved =
        _resolvedSystemTools(systemId).find((tool) => String(tool.id) === String(persisted.id)) ||
        persisted;
      toolDraft.set(_clonePlain(saved));
      toolDraftBaseline.set(_clonePlain(saved));
      toolDraftSourceItemUuid.set('');
      toolDraftDirty.set(false);
      toolDraftValidation.set(validateToolDraft(saved.id));
      await refresh();
      return true;
    } catch (error) {
      toolDraftSaveError.set(error?.message || 'save');
      services.notify?.error?.(
        services.localize?.('FABRICATE.Admin.Manager.Tools.Editor.SaveFailed') ||
          'The Tool could not be saved. Try again.'
      );
      return false;
    } finally {
      toolDraftSaving.set(false);
      _patchToolsDraftViewState();
    }
  }

  function discardToolDraft() {
    const baseline = get(toolDraftBaseline);
    if (baseline) {
      toolDraft.set(_clonePlain(baseline));
      toolDraftDirty.set(false);
      toolDraftSaveError.set(null);
      toolDraftSourceItemUuid.set('');
      toolDraftValidation.set(validateToolDraft(baseline.id));
      _patchToolsDraftViewState();
      return true;
    }
    return cancelToolsDraft();
  }

  async function deleteToolDraft() {
    const draft = get(toolDraft);
    const systemId = get(toolDraftSystemId);
    if (!draft || !systemId) return false;
    const persisted = get(toolDraftBaseline) !== null;
    toolDraftSaving.set(true);
    _patchToolsDraftViewState();
    try {
      if (persisted) {
        const systemManager = services.getCraftingSystemManager?.();
        if (typeof systemManager?.deleteTool !== 'function') return false;
        const result = await systemManager.deleteTool(systemId, draft.id);
        if (result?.deleted !== true) return false;
      }
      toolDraft.set(null);
      toolDraftBaseline.set(null);
      toolDraftSourceItemUuid.set('');
      toolDraftDirty.set(false);
      toolDraftSaveError.set(null);
      toolDraftValidation.set({ valid: false, errors: ['missing'] });
      await refresh();
      _patchToolsDraftViewState();
      return true;
    } catch (error) {
      toolDraftSaveError.set(error?.message || 'delete');
      services.notify?.error?.(
        services.localize?.('FABRICATE.Admin.Manager.Tools.Editor.DeleteFailed') ||
          'The Tool could not be deleted. Try again.'
      );
      return false;
    } finally {
      toolDraftSaving.set(false);
      _patchToolsDraftViewState();
    }
  }

  /** Write a few fields onto one system's live Tool record without committing the open draft. */
  async function _writeLiveTool(toolId, systemId, patch, failureKey, failureFallback) {
    const systemManager = services.getCraftingSystemManager?.();
    const live = _systemTools(systemId).find((tool) => String(tool.id) === String(toolId));
    if (!live || typeof systemManager?.upsertTool !== 'function') return false;
    try {
      const result = await systemManager.upsertTool(systemId, { ...live, ...patch });
      if (!result?.item) return false;
      const saved = _normalizeGatheringLibraryTool(result.item, _randomID);
      if (String(get(toolDraft)?.id || '') === String(saved.id)) {
        const written = Object.fromEntries(Object.keys(patch).map((key) => [key, saved[key]]));
        if (get(toolDraftDirty)) {
          toolDraft.update((draft) => ({ ...draft, ...written }));
          toolDraftBaseline.update((baseline) => (baseline ? { ...baseline, ...written } : baseline));
        } else {
          // THE UNION, NOT THE RECORD THE MANAGER HANDED BACK (issue 1373). `saved` is the raw in-system
          // record, so re-seeding a clean draft from it would put every inheriting section back onto the
          // value this screen exists not to show.
          const resolved =
            _resolvedSystemTools(systemId).find((tool) => String(tool.id) === String(saved.id)) ||
            saved;
          toolDraft.set(_clonePlain(resolved));
          toolDraftBaseline.set(_clonePlain(resolved));
        }
        _recomputeToolsDraftDirty();
      }
      await refresh();
      _patchToolsDraftViewState();
      return true;
    } catch {
      services.notify?.error?.(services.localize?.(failureKey) || failureFallback);
      return false;
    }
  }

  async function toggleToolEnabled(toolId, enabled, systemId = get(selectedSystemId)) {
    return _writeLiveTool(
      toolId,
      systemId,
      { enabled: enabled === true },
      'FABRICATE.Admin.Manager.Tools.Editor.ToggleFailed',
      'The Tool status could not be changed. Try again.'
    );
  }

  /** Move one world-default section between following the world Tool and this system's own. */
  async function setToolSectionInherited(toolId, section, inherit, systemId = get(selectedSystemId)) {
    const target = String(toolId || '').trim();
    const system = String(systemId || '').trim();
    if (!target || !system || typeof inherit !== 'boolean') return false;
    // READ BEFORE THE WRITE. Once the switch says overriding, the union answers this section from
    // the in-system record, so the world value the GM was looking at is no longer reachable here.
    const shown = inherit
      ? undefined
      : _resolvedSystemTools(system).find((tool) => String(tool.id) === target)?.[section];
    const written = await worldScope.tool.setSectionInherited(target, system, section, inherit);
    if (written !== true) return false;
    if (inherit || shown === undefined) {
      await refresh();
      _syncToolDraftSection(target, system, section);
      return true;
    }
    return _writeLiveTool(
      target,
      system,
      { [section]: _clonePlain(shown) },
      'FABRICATE.Admin.Manager.Tools.Editor.InheritFailed',
      'This section could not be set for this system. Try again.'
    );
  }

  /**
   * Stop using one world Tool in one crafting system (issue 1373), the inverse of {@link
   * adoptWorldTool}.
   */
  async function removeToolFromSystem(toolId, systemId = get(selectedSystemId)) {
    const target = String(toolId || '').trim();
    const system = String(systemId || '').trim();
    if (!target || !system) return false;
    const systemManager = services.getCraftingSystemManager?.();
    if (typeof systemManager?.deleteTool !== 'function') return false;
    try {
      const deleted = await systemManager.deleteTool(system, target);
      if (deleted?.deleted !== true) return false;
    } catch (error) {
      services.notify?.error?.(
        services.localize?.('FABRICATE.Admin.Manager.Tools.Editor.RemoveFromSystemFailed') ||
          `The Tool could not be removed from this system. ${error?.message || ''}`.trim()
      );
      return false;
    }
    await worldScope.tool.removeFromSystem(target, system);
    if (String(get(toolDraft)?.id || '') === target) {
      toolDraft.set(null);
      toolDraftBaseline.set(null);
      toolDraftSourceItemUuid.set('');
      toolDraftDirty.set(false);
      toolDraftSaveError.set(null);
      toolDraftValidation.set({ valid: false, errors: ['missing'] });
    }
    await refresh();
    _patchToolsDraftViewState();
    return true;
  }

  async function saveAllDirtyToolDrafts() {
    return saveToolDraft();
  }

  async function saveToolsDraft() {
    return saveAllDirtyToolDrafts();
  }

  function cancelToolsDraft() {
    toolDraft.set(null);
    toolDraftBaseline.set(null);
    toolDraftSystemId.set('');
    toolDraftSourceItemUuid.set('');
    toolDraftDirty.set(false);
    toolDraftSaveError.set(null);
    toolDraftValidation.set({ valid: false, errors: ['missing'] });
    _patchToolsDraftViewState();
    return true;
  }

  function isToolsDraftDirty() {
    return get(toolDraftDirty) && get(toolDraft) !== null;
  }

  /**
   * The `yes`/`no` pair of a delete confirm, in the shape `DialogV2.confirm` merges (issue 1154):
   * it merges each over a default with `mergeObject`, which iterates `Object.keys(other)` — `[]` for
   * a function — so a bare `yes: () => true` configures nothing.
   */
  function _deleteConfirmButtons() {
    return {
      yes: {
        label: services.localize?.('FABRICATE.Admin.Manager.Delete') || 'Delete',
        callback: () => true,
      },
      no: { callback: () => false },
    };
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
        yes: {
          label:
            services.localize?.('FABRICATE.Admin.Manager.Tools.DiscardDirty.Confirm') ||
            'Discard changes',
          callback: () => true,
        },
        no: {
          label:
            services.localize?.('FABRICATE.Admin.Manager.Tools.DiscardDirty.Cancel') ||
            'Keep editing',
          callback: () => false,
        },
      });
      return result === true;
    })();
    try {
      return await dirtyToolsDraftDiscardConfirmation;
    } finally {
      dirtyToolsDraftDiscardConfirmation = null;
    }
  }

  /**
   * The one route-exit prompt shape, shared by every Svelte-layer draft kind; returns `'save' |
   * 'discard' | 'cancel'` by construction.
   */
  async function _confirmDiscardDirtyDraft(contentKey, contentFallback, replacements = {}) {
    const localizeFn = services.localize;
    const _content = () =>
      Object.entries(replacements).reduce(
        (text, [token, value]) => text.replaceAll(`{${token}}`, value),
        localizeFn?.(contentKey) || contentFallback
      );
    if (typeof services.choiceDialog !== 'function') {
      // Fall back to the two-way confirm when no three-way dialog is available.
      const confirmed = await services.confirmDialog?.({
        title:
          localizeFn?.('FABRICATE.Admin.Manager.DiscardDirtyTitle') || 'Discard unsaved changes?',
        content: `<p>${_content()}</p>`,
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
      content: `<p>${_content()}</p>`,
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

  /**
   * Route-exit prompt for the world Tool entry editor (issue 1373), a third prompt rather than a
   * reuse of `confirmDiscardDirtyToolsDraft`, which answers a boolean with no Save at all.
   */
  function confirmDiscardDirtyToolEntryDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.Tools.DiscardDirtyEntryContent',
      'The current Tool has unsaved changes. Save them and continue, or discard them?'
    );
  }

  /**
   * Route-exit prompt for the System Overview settings identity sub-form (Name + Description only;
   * the toggles and cards on that tab live-apply and stage no draft).
   */
  function confirmDiscardDirtySystemDetailsDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.SystemEdit.DiscardDirtyContent',
      'The system details have unsaved changes. Save them and continue, or discard them?'
    );
  }

  /** Route-exit prompt for the GM Checks Studio (issue 1096). */
  function confirmDiscardDirtyChecksDraft(activities = []) {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.Checks.DiscardDirtyContent',
      'These checks have unsaved changes: {activities}. Save them and continue, or discard them?',
      { activities: activities.join(', ') }
    );
  }

  function confirmDiscardDirtyRecipeDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.Recipe.DiscardDirtyContent',
      'The current recipe has unsaved changes. Discard them and continue?'
    );
  }

  // Thin yes/no confirm for the recipe editor's destructive in-draft actions; the editor stages the
  // result into its root-held draft. `confirmLabel` is required of every caller in practice (issue
  // 1154): the routed actions are not all the same verb, and the dialog default is a generic Yes.
  async function confirmRecipeAction({ title, content, confirmLabel } = {}) {
    // `label` is OMITTED, never set to `undefined`, when a caller supplies none: `mergeObject`
    // iterates the keys it is handed, so `label: undefined` OVERWRITES the default with nothing and
    // the button renders the literal word "undefined" — worse than the generic default it replaced.
    const yes = { callback: () => true };
    if (confirmLabel) yes.label = confirmLabel;
    const confirmed = await services.confirmDialog?.({
      title,
      content,
      yes,
      no: { callback: () => false },
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

  // --- Travel section (world-level parties + per-system current-realm overrides) ---
  // Kept thin: uniqueness/invariant validation lives in GatheringPartyStore and GatheringRealmStore;
  // this section surfaces their errors inline and refreshes derived view state.
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
      return _actorOptions();
    }

    // Reads the shared gate helper off the system, not `enabled` through the realm store: the world
    // travel config carries no `enabled`, so a predicate reading it through `getRealmSettings()` would
    // be permanently false and party overrides unreachable (issue 1282).
    function canUsePartyRealmOverrides(systemId = get(selectedSystemId)) {
      const id = String(systemId || '');
      if (!id || id !== String(get(selectedSystemId) || '')) return false;
      const system = services.getCraftingSystemManager?.()?.getSystem?.(id) || null;
      return system?.features?.gathering === true && isGatheringRealmsEnabled(system);
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
      if (selectedId && parties.every((party) => !(party.id === selectedId))) selectedId = '';
      if (!selectedId && parties.length > 0) selectedId = parties[0].id;
      if (selectedId !== get(travelSelectedPartyId)) travelSelectedPartyId.set(selectedId);

      // The WORLD's realm library (issue 1282). No system id: realms are geography, and World > Travel
      // has to render them before any system opts in.
      const realms = realmStore?.list ? _clonePlain(realmStore.list() || []) : [];
      const realmById = new Map(realms.map((realm) => [realm.id, realm]));
      const locationService = getLocationService();
      const partyRealmOverridesAvailable = canUsePartyRealmOverrides(systemId);

      // Resolve each party's current realms ONCE (manual override OR live travel-marker sensing) and
      // bucket by realm id, so every realm-to-party list below reflects auto mode.
      const partyEvidence = new Map();
      const partyResolvedRealmIds = new Map();
      for (const party of parties) {
        const evidence =
          partyRealmOverridesAvailable && locationService?.resolveCurrentRealms
            ? locationService.resolveCurrentRealms({ partyId: party.id })
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
        // One override per party since issue 1282 — realms are world geography, so a party is
        // in one place rather than one place per crafting system.
        const override = partyRealmOverridesAvailable ? (party.currentRealmOverride ?? null) : null;
        const overrideRealmIds = override?.mode === 'manual' ? (override.realmIds ?? []) : [];
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

      // Per-realm counts for the Realms tab header chips. EVERY environment in the world, not one
      // system's (issue 1282) — the same rule `GatheringRealmStore._collectReferences` applies.
      const realmEnvList = (() => {
        if (realms.length === 0) return [];
        const environmentStore = _getEnvironmentStore();
        const all = typeof environmentStore?.list === 'function' ? environmentStore.list() : [];
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

      // Map Region Links tab: the current scene's regions, each annotated with the Fabricate realm
      // whose sceneMappings claim it on this scene. Single-valued per scene region (first wins).
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
          const insideUuids =
            markerUuids.length > 0
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
        worldRealms: realms.map((realm) => {
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
        // Two sources, deliberately: `enabled` is the SELECTED SYSTEM's participation flag and the
        // reveal/visibility pair is the WORLD's behaviour — the trap `canUsePartyRealmOverrides` names.
        gatheringRealmSettings: {
          ...(realmStore?.getRealmSettings
            ? realmStore.getRealmSettings()
            : { revealMode: 'manual', modifierVisibility: 'visible' }),
          // `enabled` is spread LAST on purpose: the world config carries none today, but one coming back
          // would land here as a permanently false flag, silently. Ordering makes the system's answer win.
          enabled: isGatheringRealmsEnabled(
            services.getCraftingSystemManager?.()?.getSystem?.(String(systemId || '')) || null
          ),
        },
        partyRealmOverridesAvailable,
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
      } catch (error) {
        applyError(error, fieldContext);
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
      renameParty: async (partyId, name) =>
        withSave((partyStore) => partyStore.update(partyId, { name: String(name ?? '') })),
      setPartyEnabled: async (partyId, enabled) =>
        withSave((partyStore) => partyStore.setEnabled(partyId, enabled === true)),
      async deleteParty(partyId) {
        const partyStore = getPartyStore();
        if (!partyStore) return false;
        const party = partyStore.get?.(partyId);
        // The name is raw in the TITLE (ApplicationV2 assigns it through `innerText`, so escaping would
        // surface a literal `&#39;`) and escaped in the CONTENT, which is HTML.
        const name = String(party?.name || partyId);
        const escapedName = _escapeHtml(name);
        const confirmed = await services.confirmDialog?.({
          title:
            services.localize?.('FABRICATE.Admin.Manager.Travel.DeletePartyTitle', { name }) ||
            `Delete ${name}?`,
          content: `<p>${
            services.localize?.('FABRICATE.Admin.Manager.Travel.DeletePartyContent', {
              name: escapedName,
            }) || `Delete Fabricate party <strong>${escapedName}</strong>?`
          }</p>`,
          ..._deleteConfirmButtons(),
        });
        if (!confirmed) return false;
        return withSave(async (store) => {
          await store.delete(partyId);
          if (get(travelSelectedPartyId) === partyId) travelSelectedPartyId.set('');
        });
      },
      addPartyMember: async (partyId, actorUuid) =>
        withSave((partyStore) => partyStore.addMember(partyId, actorUuid), 'members'),
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
          // The actor name is raw in the TITLE (`innerText`, so escaping would surface `&#39;`) and escaped
          // in the CONTENT, which is HTML.
          const actorName = String(
            getActorOptions().find((actor) => actor.uuid === uuid)?.name || uuid
          );
          const escapedActorName = _escapeHtml(actorName);
          const sourceName = _escapeHtml(source.name || source.id);
          const targetName = _escapeHtml(partyStore.get?.(targetPartyId)?.name || targetPartyId);
          const confirmed = await services.confirmDialog?.({
            title:
              services.localize?.('FABRICATE.Admin.Manager.Travel.MoveMemberTitle', {
                actor: actorName,
              }) || `Move ${actorName}?`,
            content: `<p>${
              services.localize?.('FABRICATE.Admin.Manager.Travel.MoveMemberContent', {
                actor: escapedActorName,
                from: sourceName,
                to: targetName,
              }) ||
              `Move <strong>${escapedActorName}</strong> from <strong>${sourceName}</strong> to <strong>${targetName}</strong>?`
            }</p>`,
            // Not a delete: moving a member is reversible, and the affirmative names the
            // move rather than borrowing the destructive verb.
            yes: {
              label:
                services.localize?.('FABRICATE.Admin.Manager.Travel.MoveMemberConfirm') || 'Move',
              callback: () => true,
            },
            no: { callback: () => false },
          });
          if (!confirmed) return false;
          return withSave((store) => store.moveMember(source.id, targetPartyId, uuid), 'members');
        }
        return withSave((store) => store.addMember(targetPartyId, uuid), 'members');
      },
      removePartyMember: async (partyId, actorUuid) =>
        withSave((partyStore) => partyStore.removeMember(partyId, actorUuid), 'members'),
      movePartyMember: async (fromPartyId, toPartyId, actorUuid) =>
        withSave(
          (partyStore) => partyStore.moveMember(fromPartyId, toPartyId, actorUuid),
          'members'
        ),
      setPartyTravelActor: async (partyId, actorUuid) =>
        withSave((partyStore) => partyStore.setTravelActor(partyId, actorUuid), 'travelActor'),
      clearPartyTravelActor: async (partyId) =>
        withSave((partyStore) => partyStore.setTravelActor(partyId, null)),
      async setPartyRealmOverride(partyId, systemId, realmIds) {
        if (!canUsePartyRealmOverrides(systemId)) return false;
        return withSave((partyStore) =>
          partyStore.setCurrentRealmOverride(partyId, realmIds || [])
        );
      },
      async clearPartyRealmOverride(partyId, systemId) {
        if (!canUsePartyRealmOverrides(systemId)) return false;
        return withSave((partyStore) => partyStore.clearCurrentRealmOverride(partyId));
      },
      removeStaleMember: async (partyId, actorUuid) =>
        withSave((partyStore) => partyStore.removeMember(partyId, actorUuid)),
      clearStaleTravelActor: async (partyId) =>
        withSave((partyStore) => partyStore.setTravelActor(partyId, null)),
      async dropStaleOverrideRealm(partyId, systemId, realmId) {
        if (!canUsePartyRealmOverrides(systemId)) return false;
        const partyStore = getPartyStore();
        if (!partyStore) return false;
        const party = partyStore.get?.(partyId);
        const override = party?.currentRealmOverride;
        const overrideIds = override?.realmIds;
        const nextIds = Array.isArray(overrideIds)
          ? overrideIds.filter((id) => id !== realmId)
          : [];
        return withSave((store) => store.setCurrentRealmOverride(partyId, nextIds));
      },
      // --- Realm quick list (name/enabled only). None of these takes a crafting system id (issue
      // 1282): the realm library is world scope, and a system-gated write would refuse the first realm.
      async createRealmQuick(name) {
        const realmStore = getRealmStore();
        if (!realmStore) return false;
        clearErrors();
        travelSaving.set(true);
        patch();
        try {
          const created = await realmStore.create({ name: String(name ?? '').trim() });
          // Return the new realm id so callers can select it; fall back to true.
          return created?.id || true;
        } catch (error) {
          applyError(error);
          return false;
        } finally {
          travelSaving.set(false);
          patch();
        }
      },
      renameRealm: async (realmId, name) => _realmPatch(realmId, { name: String(name ?? '') }),
      toggleRealmEnabled: async (realmId, enabled) =>
        _realmPatch(realmId, { enabled: enabled === true }),
      // Merge-patch a single realm; the store merges over the existing record so omitted fields
      // round-trip untouched. Backs the full Travel realm authoring surface.
      updateRealm: async (realmId, patch = {}) =>
        _realmPatch(realmId, patch && typeof patch === 'object' ? patch : {}),
      // Link or unlink a Foundry Scene Region to a Fabricate realm.
      async setMapRegionLink(sceneRegionUuid, fabricateRealmId) {
        const realmStore = getRealmStore();
        const targetSceneRegionUuid = String(sceneRegionUuid || '');
        if (!realmStore?.setSceneRegionLink || !targetSceneRegionUuid) return false;
        const sceneData = services.getCurrentSceneRegions?.() || { sceneUuid: '', regions: [] };
        const sceneUuid = String(sceneData.sceneUuid || '');
        const nextRealmId = fabricateRealmId ? String(fabricateRealmId) : '';
        clearErrors();
        travelSaving.set(true);
        patch();
        try {
          await realmStore.setSceneRegionLink(targetSceneRegionUuid, nextRealmId, { sceneUuid });
          // No current-realm writes here: a party's current realm is derived LIVE from its travel marker's
          // position, so inside markers resolve to the new link automatically.
          return true;
        } catch (error) {
          applyError(error);
          return false;
        } finally {
          travelSaving.set(false);
          patch();
        }
      },
      async deleteRealm(realmId) {
        const realmStore = getRealmStore();
        if (!realmStore) return false;
        const realm = realmStore.getRealm?.(realmId);
        // The name is raw in the TITLE (`innerText`, so escaping would surface `&#39;`) and escaped in
        // the CONTENT, which is HTML.
        const name = String(realm?.name || realmId);
        const escapedName = _escapeHtml(name);
        // Collect referenced-by evidence WITHOUT deleting first: the store returns it post-delete, but
        // the confirm copy needs it beforehand, so the collaborators it uses are probed directly.
        const references = _collectRealmReferences(realmId);
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
            services.localize?.('FABRICATE.Admin.Manager.Travel.Realms.DeleteContent', {
              name: escapedName,
            }) || `Delete realm <strong>${escapedName}</strong>?`
          }</p>${refLine}`,
          ..._deleteConfirmButtons(),
        });
        if (!confirmed) return false;
        clearErrors();
        travelSaving.set(true);
        patch();
        try {
          await realmStore.delete(realmId, {
            environmentStore: _getEnvironmentStore(),
            partyStore: getPartyStore(),
          });
          return true;
        } catch (error) {
          applyError(error);
          return false;
        } finally {
          travelSaving.set(false);
          patch();
        }
      },
    };

    function _collectRealmReferences(realmId) {
      const environments = [];
      const parties = [];
      const environmentStore = _getEnvironmentStore();
      // EVERY environment in the world (issue 1282), not the selected system's: the GM has to
      // see each one that names the place they are about to delete.
      const envList = typeof environmentStore?.list === 'function' ? environmentStore.list() : [];
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
        const override = party?.currentRealmOverride;
        const overrideIds = override?.realmIds;
        if (override && Array.isArray(overrideIds) && overrideIds.includes(realmId)) {
          parties.push({ id: party.id, name: party.name });
        }
      }
      return { environments, parties };
    }

    async function _realmPatch(realmId, patchData) {
      const realmStore = getRealmStore();
      if (!realmStore) return false;
      clearErrors();
      travelSaving.set(true);
      patch();
      try {
        await realmStore.update(realmId, patchData);
        return true;
      } catch (error) {
        applyError(error);
        return false;
      } finally {
        travelSaving.set(false);
        patch();
      }
    }
  }

  /**
   * Re-read the persisted gathering config into viewState, for when an external surface changes it
   * and dependent derivations must update without reopening the app.
   */
  function refreshGatheringConfig() {
    viewState.update((state) => ({
      ...state,
      gatheringConfig: _clonePlain(_currentGatheringConfig()),
    }));
  }

  // Re-project BOTH access rosters (non-GM users + every world actor with its control set). The
  // owning app wires this to user AND actor CRUD, because `controlledBy`/`sharedWithAllPlayers`
  // derive from `actor.ownership` as well as `user.character`. Cheap and surgical: no `refresh()`.
  function refreshAccessRosters() {
    viewState.update((state) => ({
      ...state,
      worldUsers: services.getWorldUsers?.() || [],
      accessCharacters: services.getAccessCharacterActors?.() || [],
    }));
  }

  /**
   * Resolve a recipe's `access` grant into displayable player/character rows.
   *
   * @param {{players?: object[], characters?: object[]}} [rosters] Defaults to the projected ones;
   * callers inside a `$derived` pass them so the reactive dependency is visible.
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
   * The canonical, system-owned library Tools for a crafting system, normalized to the editor Tool
   * shape.
   */
  function _systemTools(systemId) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return [];
    const system = services.getCraftingSystemManager?.()?.getSystem?.(id) || null;
    return (Array.isArray(system?.tools) ? system.tools : []).map((tool) =>
      _normalizeGatheringLibraryTool(tool, _randomID)
    );
  }

  /** The same library through the read union — what a craft will actually do. */
  function _resolvedSystemTools(systemId) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return [];
    const system = services.getCraftingSystemManager?.()?.getSystem?.(id) || null;
    if (!system) return [];
    return resolvedToolsFor(system, _worldToolCorpus()).map((tool) =>
      _normalizeGatheringLibraryTool(tool, _randomID)
    );
  }

  /**
   * One `(tool, system)` pair's world membership record, the only carrier of the per-section
   * inherit switch.
   */
  function _toolMembership(toolId, systemId) {
    return findMembership(_worldToolCorpus()?.membership, toolId, systemId);
  }

  /**
   * The record a save actually persists: the draft, with every inheriting section restored from the
   * live in-system record.
   */
  function _toolRecordForSave(systemId, draft) {
    const record = _clonePlain(draft);
    const id = String(record?.id ?? '');
    const membership = _toolMembership(id, systemId);
    if (!membership) return record;
    const live = _systemTools(systemId).find((tool) => String(tool.id) === id) || null;
    if (!live) return record;
    for (const section of TOOL_SECTIONS) {
      if (!isSectionInherited(membership, section)) continue;
      if (section in live) record[section] = _clonePlain(live[section]);
      else delete record[section];
    }
    return record;
  }

  /**
   * Re-read one section of the open draft from the read union, after a membership write moved it.
   */
  function _syncToolDraftSection(toolId, systemId, section) {
    if (String(get(toolDraft)?.id || '') !== String(toolId)) return;
    const resolved = _resolvedSystemTools(systemId).find(
      (tool) => String(tool.id) === String(toolId)
    );
    if (!resolved) return;
    const written = { [section]: _clonePlain(resolved[section]) };
    toolDraft.update((draft) => (draft ? { ...draft, ...written } : draft));
    toolDraftBaseline.update((baseline) => (baseline ? { ...baseline, ...written } : baseline));
    _recomputeToolsDraftDirty();
    toolDraftValidation.set(validateToolDraft());
    _patchToolsDraftViewState();
  }

  /**
   * Persist the given library Tools onto the crafting system via the system manager (the
   * `craftingSystems` setting).
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

  /** The world character-libraries store (issue 1308). */
  function _characterLibrariesStore() {
    return services.getCharacterLibrariesStore?.() ?? null;
  }

  /**
   * Confirm the removal of one world character-library entry (issue 1308): the only destructive
   * edits on a page framed as settings for the selected system whose reach is the whole world.
   */
  async function _confirmLibraryEntryDelete(library, entryId, titleKey, contentKey) {
    const entry = (Array.isArray(library) ? library : []).find((item) => item?.id === entryId);
    const name = String(entry?.name || entry?.label || entryId);
    const escapedName = _escapeHtml(name);
    const confirmed = await services.confirmDialog?.({
      title: services.localize?.(titleKey, { name }) || `Delete ${name}?`,
      content: `<p>${
        services.localize?.(contentKey, { name: escapedName }) ||
        `Delete <strong>${escapedName}</strong> from every crafting system?`
      }</p>`,
      ..._deleteConfirmButtons(),
    });
    return confirmed === true;
  }

  function _characterPrerequisites() {
    const store = _characterLibrariesStore();
    return normalizeCharacterPrerequisiteList(store?.listCharacterPrerequisites?.(), _randomID);
  }

  async function _persistCharacterPrerequisites(prerequisites) {
    const store = _characterLibrariesStore();
    if (!store?.saveCharacterPrerequisites) return null;
    const normalized = normalizeCharacterPrerequisiteList(prerequisites, _randomID);
    const saved = await store.saveCharacterPrerequisites(normalized);
    return Array.isArray(saved?.characterPrerequisites) ? saved.characterPrerequisites : normalized;
  }

  async function addCharacterPrerequisite(partial = {}) {
    const entry = normalizeCharacterPrerequisite({ id: _randomID(), ...partial }, _randomID);
    if (!entry) return null;
    const persisted = await _persistCharacterPrerequisites([..._characterPrerequisites(), entry]);
    if (persisted === null) return null;
    await refresh();
    return entry;
  }

  async function updateCharacterPrerequisite(prerequisiteId, updates = {}) {
    if (!prerequisiteId) return false;
    let changed = false;
    const next = _characterPrerequisites().map((entry) => {
      if (entry.id !== prerequisiteId) return entry;
      changed = true;
      return normalizeCharacterPrerequisite({ ...entry, ...updates, id: entry.id }, _randomID);
    });
    if (!changed) return false;
    const persisted = await _persistCharacterPrerequisites(next);
    if (persisted === null) return false;
    await refresh();
    return true;
  }

  async function deleteCharacterPrerequisite(prerequisiteId) {
    if (!prerequisiteId) return false;
    const current = _characterPrerequisites();
    const next = current.filter((entry) => entry.id !== prerequisiteId);
    if (next.length === current.length) return false; // unknown id — nothing removed
    const confirmedPrerequisite = await _confirmLibraryEntryDelete(
      current,
      prerequisiteId,
      'FABRICATE.Admin.Manager.CharacterPrerequisites.DeleteTitle',
      'FABRICATE.Admin.Manager.CharacterPrerequisites.DeleteContent'
    );
    if (!confirmedPrerequisite) return false;
    const persisted = await _persistCharacterPrerequisites(next);
    if (persisted === null) return false;
    await refresh();
    return true;
  }

  /** Move one character prerequisite from `fromIndex` to `toIndex` (issue 768). */
  async function reorderCharacterPrerequisite(fromIndex, toIndex) {
    const next = _reorderListByIndex(_characterPrerequisites(), fromIndex, toIndex);
    if (!next) return false;
    const persisted = await _persistCharacterPrerequisites(next);
    if (persisted === null) return false;
    await refresh();
    return true;
  }

  async function seedPrerequisitePresets() {
    const foundrySystemId = String(services.getFoundrySystemId?.() || '');
    const presets = getCharacterPrerequisitePresetsForFoundrySystem(foundrySystemId);
    if (presets.length === 0) {
      return { added: 0, skipped: 0, unsupported: true, foundrySystemId };
    }
    const { added, skipped, next } = seedCharacterPrerequisitePresets({
      presets,
      currentLibrary: _characterPrerequisites(),
    });
    if (added.length > 0) {
      const persisted = await _persistCharacterPrerequisites(next);
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

  /**
   * Classify every library task/event for the environment into a `CompositionState` +
   * `RuntimeState` plus match evidence, honoring `compositionMode`.
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
    const conditions = conditionSettingsToCurrent(conditionSettings);
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
   * Build the derived `evaluateSystemValidation` report for the selected system, assembling the
   * collaborators the pure aggregator needs. Pure and synchronous.
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
   * The cross-recipe ingredient-signature conflicts touching one recipe (issue 549) — the same
   * question the enable path asks, one keystroke earlier, against the draft.
   */
  function getRecipeSignatureConflicts(recipeId, draftRecipe = null) {
    const systemManager = services.getCraftingSystemManager?.();
    const recipeManager = services.getRecipeManager?.();
    const sysId = get(selectedSystemId);
    if (!systemManager || !recipeManager || !sysId || !recipeId) return [];

    const system = systemManager.getSystem(sysId);
    if (system?.resolutionMode !== 'alchemy') return [];

      // A draft stands in for the persisted recipe of the id it was opened on, so it is scanned under
      // that id. `getRecipe` is system-agnostic while the audit it replaces scanned the selected
      // system's cohort, which is why the persisted leg is re-scoped to the selected system here.
    const candidate = draftRecipe
      ? { ...draftRecipe, id: recipeId }
      : _recipeOfSystem(recipeManager, recipeId, sysId);
    if (!candidate) return [];

    return recipeManager.getSignatureConflicts?.(candidate, { systemId: sysId }) || [];
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
      // Exclude and force are automatic-mode overrides of the match filter (maintainer ruling,
      // issue 1315); manual mode has no filter to override, so it has neither.
      const excluded = compositionMode !== 'manual' && disabled.includes(id);
      const explicitlyIncluded = enabled.includes(id);
      const forceIncluded = compositionMode !== 'manual' && forced.includes(id);

      let compositionState;
      if (!libraryEnabled) compositionState = 'libraryDisabled';
      // Exclude is checked before force so the two can collide on the same record without a
      // branch order bug deciding it silently: exclude wins.
      else if (excluded) compositionState = 'excluded';
      else if (forceIncluded) compositionState = 'forceIncluded';
      // Manual mode composes exactly `enabled*Ids` with no match filter (maintainer ruling), so a
      // picked non-matching record still composes as `includedNotMatching` — distinct from
      // `notMatching` so the Included list can flag it.
      else if (!matches)
        compositionState =
          compositionMode === 'manual' && explicitlyIncluded
            ? 'includedNotMatching'
            : 'notMatching';
      else if (compositionMode === 'manual')
        compositionState = explicitlyIncluded ? 'explicitlyIncluded' : 'candidate';
      else compositionState = 'includedByMatch';

      // A record is runtime-available only when its composition state would compose it AND current
      // weather/time satisfy its required conditions. `composed` projects `environmentComposesRecord`
      // onto the shared four-state vocabulary in `gatheringComposition.js`.
      const composed = ENVIRONMENT_COMPOSED_COMPOSITION_STATES.has(compositionState);
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
      includedNotMatchingTasks: 0,
      availableEvents: 0,
      excludedEvents: 0,
      candidateEvents: 0,
      includedNotMatchingEvents: 0,
      diagnosticTasks: 0,
      diagnosticEvents: 0,
      requiredTools: 0,
    };
  }

  /**
   * Distinct tool ids required by the tasks available right now — the same
   * `runtimeState === 'available'` population `availableTasks` counts, so the fact is weather- and
   * time-dependent exactly like its neighbours (issue 1321, a deliberate trade).
   */
  function _requiredToolCount(tasks) {
    const toolIds = new Set();
    for (const row of tasks) {
      if (row.runtimeState !== 'available') continue;
      for (const toolId of Array.isArray(row.record?.toolIds) ? row.record.toolIds : []) {
        // Trim before counting, matching the helper this replaced: an untrimmed pair would count
        // ' pick ' and 'pick' as two distinct required tools.
        const trimmed = String(toolId ?? '').trim();
        if (trimmed) toolIds.add(trimmed);
      }
    }
    return toolIds.size;
  }

  function _compositionCounts(tasks, events) {
    const tally = (records) => {
      const available = records.filter((r) => r.runtimeState === 'available').length;
      const excluded = records.filter((r) => r.compositionState === 'excluded').length;
      const candidate = records.filter((r) => r.compositionState === 'candidate').length;
      // `includedNotMatching` composes (ruling 2), so this counts records that ARE runtime available
      // whenever conditions are met. The field was `unavailable*` behind a fact labelled "Included but
      // unavailable" — inverted against its own label — so producer, consumers and label were renamed.
      const includedNotMatching = records.filter(
        (r) => r.compositionState === 'includedNotMatching'
      ).length;
      const diagnostic = records.filter(
        (r) => r.compositionState === 'notMatching' || r.compositionState === 'libraryDisabled'
      ).length;
      return { available, excluded, candidate, includedNotMatching, diagnostic };
    };
    const t = tally(tasks);
    const h = tally(events);
    return {
      availableTasks: t.available,
      excludedTasks: t.excluded,
      candidateTasks: t.candidate,
      includedNotMatchingTasks: t.includedNotMatching,
      diagnosticTasks: t.diagnostic,
      availableEvents: h.available,
      excludedEvents: h.excluded,
      candidateEvents: h.candidate,
      includedNotMatchingEvents: h.includedNotMatching,
      diagnosticEvents: h.diagnostic,
      requiredTools: _requiredToolCount(tasks),
    };
  }

  /**
   * Whether `environment` currently composes the library task/event `record`, through the shared
   * `environmentComposesRecord` predicate, so it mirrors the runtime chain by construction.
   */
  function _environmentComposesGatheringRecord(environment, record, kind, conditionSettings) {
    if (!record?.id) return false;
    const includeDanger = kind === 'event';
    const matches = _gatheringLibraryRecordMatchesEnvironment(
      record,
      environment,
      {},
      includeDanger,
      conditionSettings
    );
    return environmentComposesRecord(
      environment,
      record,
      kind,
      resolveGatheringCompositionMode(environment),
      matches
    );
  }

  /**
   * Environments in `systemId` that currently compose the task/event `record`, mirroring runtime
   * composition so callers see the environments it actually appears in today.
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
    // `toolIds`, not by environments, so an environment-level usage scan does not apply to them.
    if (kind !== 'task' && kind !== 'event') return [];
    return _gatheringLibraryRecordSurfacingEnvironments(systemId, record, kind);
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
        ..._deleteConfirmButtons(),
      })) === true
    );
  }

  /**
   * Environments in `systemId` that compose `oldRecord` today but would not compose `newRecord`
   * after the edit — where saving would silently remove the record, by any cause the editors allow.
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
   * that composed it.
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
      recipeTagPlaceholderCounts: {},
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

  // The coalescing primitive both external-change schedulers share: collapse a
  // burst of hook callbacks in one turn into a single refresh.
  function _onMicrotask(callback) {
    const schedule =
      typeof queueMicrotask === 'function'
        ? queueMicrotask
        : (task) => Promise.resolve().then(task);
    schedule(callback);
  }

  function _scheduleExternalRefresh() {
    if (destroyed || externalRefreshScheduled) return;
    externalRefreshScheduled = true;
    _onMicrotask(async () => {
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

  // Resolve a dirty environment draft for an action that would leave it: true to proceed, false to
  // abort. On 'save' the draft is persisted (abort if it fails validation); 'discard' proceeds.
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
          requiredToolCount: counts.requiredTools || 0,
        };
      }
      let environmentId = get(selectedEnvironmentId);
      const canKeepNewDraft =
        get(environmentDraftIsNew) &&
        get(environmentDraftDirty) &&
        get(environmentDraft)?.craftingSystemId === selectedSystem.id;

      if (canKeepNewDraft) {
        environmentId = '';
      } else if (environments.every((environment) => !(environment.id === environmentId))) {
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

        if (canPreserveDirtyDraft) {
          persistedEnvironmentDraft.set(_clonePlain(persistedDraft));
        } else {
          _setEnvironmentDraftState(persistedDraft, {
            persistedDraft,
            dirty: false,
            isNew: false,
            saveError: null,
          });
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
    } catch (error) {
      return _clearEnvironmentDraftState({
        canShowEnvironmentsTab: true,
        error: _environmentErrorMessage(error),
      });
    }
  }

  // --- refresh --- /** * Refreshes overlap, and the later one is not necessarily the one that
  // finishes last: `refresh` * reads the selection once then does async work, so two runs can be in
  // flight each holding the * selection as it was when it started.
  let refreshTicket = 0;

  /**
   * The learned-knowledge index, built once per refresh (issue 1132), because
   * `describeRecipeDelete` runs on a render path and must do no actor iteration of its own.
   */
  let learnedRecipeActorIndex = new Map();
  let learnedRecipeIndexStale = false;

  /**
   * Note that some actor's flags changed, so the learned-recipe index must be rebuilt before it is
   * read again. Called from the manager app's actor hooks; deliberately does no work itself.
   */
  function markLearnedRecipeIndexStale() {
    learnedRecipeIndexStale = true;
  }

  function _learnedRecipeIndex() {
    if (learnedRecipeIndexStale) {
      learnedRecipeActorIndex = buildLearnedRecipeActorIndex(services.getWorldActors?.() || []);
      learnedRecipeIndexStale = false;
    }
    return learnedRecipeActorIndex;
  }

  async function refresh() {
    const ticket = ++refreshTicket;
    const isCurrent = () => ticket === refreshTicket;
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    if (!_fabricateReady(systemManager, recipeManager)) {
      _publishSystemsLoading();
      _scheduleReadyRefresh();
      return;
    }

    // ONE world walk per refresh (issue 1132), before the phase-1 publish so the delete
    // describer has it on the very first render rather than after the async phase.
    learnedRecipeActorIndex = buildLearnedRecipeActorIndex(services.getWorldActors?.() || []);
    learnedRecipeIndexStale = false;

    const allSystems = systemManager.getSystems();
    const currentSystemId = get(selectedSystemId);
    const fallbackSystemId = allSystems[0]?.id || '';
    let resolvedSystemId = currentSystemId;
    if (!currentSystemId || !allSystems.find((s) => s.id === currentSystemId)) {
      resolvedSystemId = fallbackSystemId;
      if (resolvedSystemId !== currentSystemId) selectedSystemId.set(resolvedSystemId);
    }

    // Item-card memo invalidation chokepoint: a system-id change drops every cached card.
    // `features.salvage` and essence-catalog toggles are captured IN the per-item signature, so they
    // miss without a clear; item-search changes deliberately do not invalidate.
    if (resolvedSystemId !== itemCardCacheSystemId) {
      itemCardCache.clear();
      itemCardCacheSystemId = resolvedSystemId;
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
      // Whether this system participates in the world currency (issue 1278). A flat boolean because this
      // list is an allowlist carrying no `requirements`: a consumer reaching for
      // `requirements.currency.enabled` reads undefined and silently counts zero.
      currencyEnabled: s?.requirements?.currency?.enabled === true,
      // Whether this system authors its own tool break mode, and what it authored (issue 1373).
      toolBreakage: {
        authority: typeof s?.toolBreakage?.authority === 'string' ? s.toolBreakage.authority : '',
      },
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

    // One read of the world corpus per publish (issue 1374), hoisted so the selected-system
    // projection and the published `worldScope` key come from the same snapshot.
    const worldScopeState = buildWorldScopeState();

    let selectedSystemData = null;
    let essenceCards = [];
    let toolRequiredFor = {};
    let recipeListData = {
      recipes: [],
      rosterRecipes: [],
      recipeCategories: [],
      recipeTagPlaceholderCounts: {},
      showVisibilitySummary: false,
    };

    if (selectedSystem) {
      const managedItems = _getManagedItems(selectedSystem);
      const managedItemOptions = _buildManagedItemOptions(managedItems);
      const componentTagOptions = _buildComponentTagOptions(managedItems);
      const managedItemById = new Map(managedItemOptions.map((item) => [item.id, item]));
      const worldEssenceColourById = _worldEssenceColourById(worldScopeState);
      const worldEssenceIds = _worldEssenceIds(worldScopeState);

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
          // The two persisted fields added in issue 1036, stated explicitly rather than left to the spread:
          // this repo has repeatedly shipped a correct normalizer whose field was invisible because a
          // hand-built projection did not name it (see `adminSystemInspectorProjection.js`).
          enabled: def.enabled !== false,
          propertyMacroUuid: def.propertyMacroUuid || null,
          // THE DRAWN COLOUR FOLLOWS THE WORLD IDENTITY (issue 1371, ruling M29). See
          // `_worldEssenceColourById`: an authored catalogue colour wins, an unauthored one leaves the row's.
          colorToken: worldEssenceColourById.get(def.id) ?? def.colorToken ?? null,
          // WHETHER THE WORLD CATALOGUE HOLDS IT (issue 1371). See `_worldEssenceIds`: what the essence
          // bulk panel withholds its colour axis on, stated here because the panel has no corpus to ask.
          worldDefined: worldEssenceIds.has(def.id),
          sourceComponentId,
          associatedSystemItemId: sourceComponentId || null,
          associatedItem,
          associatedItemName: associatedItem?.name || null,
        };
      });
      // The system-recipe cohort for this refresh, fetched once (issue 1081); three consumers used to
      // fetch it independently. `_buildRecipeList` still derives category counts over this unfiltered
      // array and rows over the search-filtered subset, because the two cohorts genuinely differ.
      const systemRecipes = recipeManager.getRecipes({ craftingSystemId: selectedSystem.id }) || [];

      // The usage counts read what the system resolves (issue 1371).
      essenceCards = _buildEssenceCards(
        essenceDefinitions,
        componentsWithResolvedEssences(systemManager, selectedSystem.id, managedItems),
        managedItemOptions,
        systemRecipes
      );

      // The world tool-breakage block, taken off the corpus this publish already projected and passed
      // explicitly (issue 1374), so surfaces that gate on the authority stop re-defaulting the system's
      // own token. Threaded rather than probed through a lazy global read.
      selectedSystemData = _buildSelectedSystemViewData(
        selectedSystem,
        managedItemOptions,
        componentTagOptions,
        essenceDefinitions,
        availableScriptMacros,
        sceneOptions,
        worldScopeState.worldScope?.tool?.toolBreakage ?? null,
        _worldToolCorpus()
      );
      recipeListData = _buildRecipeList(
        systemManager,
        recipeManager,
        selectedSystem,
        get(recipeSearch),
        { roster: systemRecipes }
      );
      toolRequiredFor = _buildToolRequiredFor(selectedSystem.id, systemRecipes);
    }

    const visibleTab = _resolveVisibleTab(get(activeTab), selectedSystem);
    if (visibleTab !== get(activeTab)) {
      activeTab.set(visibleTab);
    }

    // Phase 1: publish all synchronous selected-system context immediately so the manager can paint
    // its rail, menu and inspector before slower item/environment work finishes.
    if (!isCurrent()) return;
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
      recipeTagPlaceholderCounts: recipeListData.recipeTagPlaceholderCounts,
      showVisibilitySummary: recipeListData.showVisibilitySummary,
      worldUsers,
      accessCharacters,
      recipeSearchTerm: get(recipeSearch),
      itemSearchTerm: get(itemSearch),
      // THE TOOL RULES EDITOR'S RAIL DATA (issue 1373). `actorOptions` is published from the MAIN
      // refresh as well as from `travel.patch()`: the key was top level all along, but only World >
      // Travel ever wrote it, so every other reader saw the empty default until a scene change fired.
      actorOptions: _actorOptions(),
      toolRequiredFor,
    }));
    await Promise.resolve();

    let itemCards = [];
    if (selectedSystem) {
      const showTags = true;
      const showEssences = selectedSystem.features?.essences === true;
      const essenceDefinitionById = new Map(
        (selectedSystemData?.essenceDefinitions || []).map((def) => [def.id, def])
      );

      itemCards = await _buildItemCards(systemManager, selectedSystem, get(itemSearch), {
        showTags,
        showEssences,
        essenceDefinitionById,
        enrichToHtml: services?.enrichToHtml,
        cache: itemCardCache,
        // A card fills itself IN PLACE when a view hydrates it (issue 1081), which Svelte cannot see:
        // array and object are both unchanged by `===`. The scheduled republish hands out a new array
        // AND a fresh object per filled card, which is what actually reaches every reading surface.
        onHydrated: _scheduleItemCardRepublish,
      });
    }

    const environmentState = await _buildEnvironmentState(selectedSystem);

    // Books & Scrolls library (issue 511): batch-resolve each recipe item's linked world item and
    // derive its `recipes[]`/`learnedByCount` now the recipe list is built. Overwrites the phase-1
    // synchronous fallback so the phase-2 publish carries the enriched projection.
    if (selectedSystemData) {
      // A new selectedSystemData for the phase-2 publish rather than mutating phase-1 in place: the two
      // publishes must be different references, because the `selectedSystem` `$derived` re-propagates
      // only when the parent reference changes.
      selectedSystemData = {
        ...selectedSystemData,
        // The basis marker comes from `selectedSystem`, the raw manager system: the hand-built
        // projection does not carry the field, so reading it there fails open to the legacy index
        // (issue 1011).
        recipeItemDefinitions: await _enrichRecipeItemLibrary(
          selectedSystemData.recipeItemDefinitions,
          recipeListData.rosterRecipes,
          selectedSystem?.membershipResolvesByRecipeIds,
          // The SAME index the delete describer reads, so "Learned by 4" on a book and
          // "4 characters will forget them" on the delete card are one derivation.
          learnedRecipeActorIndex
        ),
      };
    }

    // The derived system-validation report, over the system's recipes/components and the environments
    // just listed. Computed once per refresh for the GM overview.
    const systemValidation = _buildSystemValidationReport(
      selectedSystem,
      Array.isArray(environmentState.environments) ? environmentState.environments : []
    );

    // --- Graph data (lazy, computed only when graph tab is active) ---
    let graphData = _emptyGraphData();
    if (get(activeTab) === 'graph' && selectedSystem) {
      graphData = _buildGraphData(selectedSystem, recipeManager);
    }

    // A newer refresh has already taken over; publishing here would put its work back.
    if (!isCurrent()) return;
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
      recipeTagPlaceholderCounts: recipeListData.recipeTagPlaceholderCounts,
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
      ...buildWorldCurrencyState(),
      ...buildCharacterLibrariesState(),
      ...worldScopeState,
    }));
  }

  // Read the world currency config straight from its store on every publish: cheap (one setting
  // read plus a normalize), and honest when another client's GM edits the ladder — there is no
  // per-system cache to invalidate because there is no per-system copy any more.
  function buildWorldCurrencyState() {
    const store = services.getCurrencyConfigStore?.();
    if (!store) return _emptyWorldCurrencyState();
    const worldCurrency = normalizeWorldCurrencyConfig(store.get(), { randomID: _randomID });
    // Validated on every publish, off the SAME normalized config the editor renders, so the
    // report can never describe a ladder the GM is not looking at. Pure in-memory work.
    return { worldCurrency, worldCurrencyValidation: _buildWorldCurrencyValidation(worldCurrency) };
  }

  // The three world-scope entity corpora (issue 1362), read straight from their stores on every
  // publish: cheap, honest when another GM edits the corpus, and with no per-system cache to
  // invalidate.
  function _allComponents() {
    const systemManager = services.getCraftingSystemManager?.();
    const all = [];
    for (const system of _allSystems()) {
      const components = Array.isArray(system?.components) ? system.components : [];
      // RESOLVED PER SYSTEM (issue 1371). The world Essence Catalogue's `used by` figure counts
      // components that CARRY the essence, and after an `essences` world-map edit the persisted row no
      // longer says so. Resolution is per (component, system) pair, so it happens inside this loop.
      for (const component of componentsWithResolvedEssences(systemManager, system?.id, components))
        all.push(component);
    }
    return all;
  }

  /** Every recipe in the world. */
  function _allRecipes() {
    try {
      return services.getRecipeManager?.()?.getRecipes?.({}) || [];
    } catch {
      return [];
    }
  }

  /**
   * How many component rule sets and recipes reference each world essence, across every system;
   * both counters already exist for the selected system's cards.
   *
   * @param {object[]} [recipes] every recipe in the world; read here when the caller has none, so
   *   the publish path can thread one `getRecipes({})` copy through both legs (issue 1392).
   */
  function _worldEssenceUsage(recipes = _allRecipes()) {
    const components = _allComponents();
    const usage = {};
    for (const system of _allSystems()) {
      const definitions = Array.isArray(system?.essenceDefinitions)
        ? system.essenceDefinitions
        : [];
      for (const definition of definitions) {
        const id = String(definition?.id ?? '');
        if (!id || usage[id]) continue;
        usage[id] = {
          componentCount: _essenceUsageCount(id, components),
          recipeCount: _essenceRecipeUsage(id, recipes).count,
        };
      }
    }
    return usage;
  }

  /**
   * Every tool id one recipe requires, from all four places a recipe names them: a top-level
   * `toolIds`, one per ingredient set, and both repeated per step on a multi-step recipe.
   */
  function _recipeToolIds(recipe) {
    const ids = new Set();
    const lists = [recipe?.toolIds];
    const setLists = [
      ...(Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []),
      ...(Array.isArray(recipe?.steps) ? recipe.steps : []).flatMap((step) => [
        step,
        ...(Array.isArray(step?.ingredientSets) ? step.ingredientSets : []),
      ]),
    ];
    for (const set of setLists) lists.push(set?.toolIds);
    for (const list of lists) {
      for (const raw of Array.isArray(list) ? list : []) {
        const trimmed = String(raw ?? '').trim();
        if (trimmed) ids.add(trimmed);
      }
    }
    return ids;
  }

  /**
   * How many recipes require each world Tool, per crafting system — a world-wide total would read
   * as "recipes in this system" and be a wrong number rather than a missing one. It carries the
   * references too (issue 1373); gathering tasks reach `requiredBy`, not `recipeCount`.
   */
    /**
     * One crafting system's recipe cohort, read at most once per refresh (issue 1371), which
     * `adminStore.test.js` bounds. Per call of `buildWorldScopeState`, never a module memo.
     */
  function _recipeCohort(recipeManager, cache, systemId) {
    if (cache.has(systemId)) return cache.get(systemId);
    let recipes = [];
    try {
      recipes = recipeManager?.getRecipes?.({ craftingSystemId: systemId }) || [];
    } catch {
      recipes = [];
    }
    cache.set(systemId, recipes);
    return recipes;
  }

  function _worldToolUsage(recipeCache = new Map()) {
    const usage = {};
    const recipeManager = services.getRecipeManager?.();
    const entryFor = (toolId) =>
      (usage[toolId] ??= { recipeCount: 0, recipeCountBySystem: {}, requiredBy: [] });
    const record = (toolId, systemId) => {
      const entry = entryFor(toolId);
      entry.recipeCount += 1;
      entry.recipeCountBySystem[systemId] = (entry.recipeCountBySystem[systemId] || 0) + 1;
    };
    const reference = (toolId, reference_) => {
      entryFor(toolId).requiredBy.push(reference_);
    };
    const gatheringSystems = _currentGatheringConfig()?.systems ?? {};
    for (const system of _allSystems()) {
      const systemId = String(system?.id ?? '');
      if (!systemId) continue;
      const systemName = String(system?.name ?? systemId);
      const recipes = _recipeCohort(recipeManager, recipeCache, systemId);
      for (const recipe of recipes) {
        for (const toolId of _recipeToolIds(recipe)) {
          record(toolId, systemId);
          reference(toolId, {
            id: String(recipe?.id ?? ''),
            name: String(recipe?.name ?? recipe?.id ?? ''),
            kind: 'recipe',
            systemId,
            systemName,
          });
        }
      }
      const tasks = gatheringSystems?.[systemId]?.tasks;
      for (const task of Array.isArray(tasks) ? tasks : []) {
        for (const raw of Array.isArray(task?.toolIds) ? task.toolIds : []) {
          const toolId = String(raw ?? '').trim();
          if (!toolId) continue;
          reference(toolId, {
            id: String(task?.id ?? ''),
            name: String(task?.name ?? task?.id ?? ''),
            kind: 'gathering',
            systemId,
            systemName,
          });
        }
      }
    }
    return usage;
  }

  /**
   * Every component id one recipe names, split by what the reference does: a recipe consumes a
   * component as an ingredient and produces one as a result, and the world Component entry states
   * the two separately.
   */
  function _recipeComponentIds(recipe) {
    const required = new Set();
    const produced = new Set();
    const add = (into, raw) => {
      const trimmed = String(raw ?? '').trim();
      if (trimmed) into.add(trimmed);
    };
    const addOption = (into, option) => {
      add(into, option?.componentId ?? option?.systemItemId);
      add(into, option?.match?.componentId ?? option?.match?.systemItemId);
    };
    const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
    for (const holder of [recipe, ...steps]) {
      for (const set of Array.isArray(holder?.ingredientSets) ? holder.ingredientSets : []) {
        for (const group of Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : []) {
          for (const option of Array.isArray(group?.options) ? group.options : []) {
            addOption(required, option);
          }
        }
        for (const option of Array.isArray(set?.ingredients) ? set.ingredients : []) {
          addOption(required, option);
        }
      }
      for (const group of Array.isArray(holder?.resultGroups) ? holder.resultGroups : []) {
        for (const result of Array.isArray(group?.results) ? group.results : []) {
          addOption(produced, result);
        }
      }
      for (const result of Array.isArray(holder?.results) ? holder.results : []) {
        addOption(produced, result);
      }
    }
    return { required, produced };
  }

  /**
   * How much of the world references each world component (issue 1371); nothing outside this file
   * can supply it, and without it every world component row answered `0 recipes`.
   */
  function _worldComponentUsage(recipeCache = new Map()) {
    const usage = {};
    const recipeManager = services.getRecipeManager?.();
    const entryFor = (componentId) =>
      (usage[componentId] ??= {
        recipeCount: 0,
        recipeCountBySystem: {},
        requiredBy: [],
        producedBy: [],
      });
    const record = (componentId, systemId) => {
      const entry = entryFor(componentId);
      entry.recipeCount += 1;
      entry.recipeCountBySystem[systemId] = (entry.recipeCountBySystem[systemId] || 0) + 1;
    };
    const reference = (componentId, list, reference_) => {
      entryFor(componentId)[list].push(reference_);
    };
    const gatheringSystems = _currentGatheringConfig()?.systems ?? {};
    for (const system of _allSystems()) {
      const systemId = String(system?.id ?? '');
      if (!systemId) continue;
      const systemName = String(system?.name ?? systemId);
      const recipes = _recipeCohort(recipeManager, recipeCache, systemId);
      for (const recipe of recipes) {
        const { required, produced } = _recipeComponentIds(recipe);
        const named = {
          id: String(recipe?.id ?? ''),
          name: String(recipe?.name ?? recipe?.id ?? ''),
          kind: 'recipe',
          systemId,
          systemName,
        };
        for (const componentId of new Set([...required, ...produced])) {
          record(componentId, systemId);
        }
        for (const componentId of required) reference(componentId, 'requiredBy', named);
        for (const componentId of produced) reference(componentId, 'producedBy', named);
      }
      const componentIdByToolId = new Map();
      for (const tool of Array.isArray(system?.tools) ? system.tools : []) {
        const componentId = String(tool?.componentId ?? '').trim();
        const toolId = String(tool?.id ?? '').trim();
        if (componentId && toolId) componentIdByToolId.set(toolId, componentId);
      }
      const tasks = gatheringSystems?.[systemId]?.tasks;
      for (const task of Array.isArray(tasks) ? tasks : []) {
        const named = {
          id: String(task?.id ?? ''),
          name: String(task?.name ?? task?.id ?? ''),
          kind: 'gathering',
          systemId,
          systemName,
        };
        for (const raw of Array.isArray(task?.toolIds) ? task.toolIds : []) {
          const componentId = componentIdByToolId.get(String(raw ?? '').trim());
          if (componentId) reference(componentId, 'requiredBy', named);
        }
        // `itemDrops` is the legacy alias the normalizer itself accepts, so a corpus written
        // before the rename still answers here rather than reporting nothing.
        const dropRows = task?.dropRows ?? task?.itemDrops;
        for (const row of Array.isArray(dropRows) ? dropRows : []) {
          // `componentId ?? systemItemId` is the pair `normalizeItemDrop` coalesces, so a row
          // authored under either name reaches the same component.
          const componentId = String(row?.componentId ?? row?.systemItemId ?? '').trim();
          if (componentId) reference(componentId, 'producedBy', named);
        }
      }
    }
    return usage;
  }

  function buildWorldScopeState() {
    // One recipe cohort read per system, shared by both legs that walk it: see `_recipeCohort`, where
    // the per-refresh fetch is a bounded budget. A per-call cache, never state — it lives and dies
    // inside one `buildWorldScopeState()` call, so it is a plain Map rather than anything reactive.
    const recipeCache = new Map();
    // And one world-wide read, shared the same way (issue 1371): `_allRecipes()` is `getRecipes({})`,
    // the one read here that is not cohort-indexed, and both legs want the same snapshot. The
    // per-system cohorts stay separate reads, answered from `RecipeManager`'s own cohort index.
    const worldRecipes = _allRecipes();
    return _buildWorldScopeState({
      stores: _worldScopeStores(),
      systems: _allSystems(),
      // Issue 1392: `### GM World Scoped Entity Routes` requirement 7 enumerates a projection's
      // registration but not its inputs, and nothing in `{stores, systems, usage}` answers a world-wide
      // recipe question. `_allRecipes()` is already invoked every publish, so this adds no corpus read.
      recipes: worldRecipes,
      // Issue 1654: nothing in `{stores, systems, usage}` can answer which essence ids `1.34.0` retired,
      // because the merge map is a world setting of its own. Without it `mintEssenceId` resolves against
      // the live roster alone and reissues a retired id; the reading lives in `worldScopeProjection.js`.
      essenceMergeMap: _worldEssenceMergeMap(),
      usage: {
        component: _worldComponentUsage(recipeCache),
        essence: _worldEssenceUsage(worldRecipes),
        tool: _worldToolUsage(recipeCache),
      },
    });
  }

  /** The published world tool corpus, or `null` when there is no store to read (issue 1373). */
  function _worldToolCorpus() {
    try {
      return services.getToolScopeStore?.()?.corpus?.() ?? null;
    } catch {
      return null;
    }
  }

  // Four legs, and the fourth is deliberately optional: the World Vocabulary's corpus arrives with
  // PR 7 of epic 1357, and the same `services.getXScopeStore?.() ?? null` idiom answers `null` until
  // the service is registered. `projectWorldVocabulary` then publishes `{available: false, total: 0}`.
  function _worldScopeStores() {
    return {
      component: services.getComponentScopeStore?.() ?? null,
      essence: services.getEssenceScopeStore?.() ?? null,
      tool: services.getToolScopeStore?.() ?? null,
      vocabulary: services.getVocabularyScopeStore?.() ?? null,
    };
  }

  /** The raw `fabricate.worldEssenceMergeMap` world setting, or `null` when it cannot be read. */
  function _worldEssenceMergeMap() {
    try {
      return services.getSetting?.(WORLD_ESSENCE_MERGE_MAP_SETTING) ?? null;
    } catch {
      return null;
    }
  }

  function _allSystems() {
    try {
      return services.getCraftingSystemManager?.()?.getSystems?.() || [];
    } catch {
      return [];
    }
  }

  /** Every world actor, name-sorted, as the records the app service projects. */
  function _actorOptions() {
    const options = services.getActorOptions?.() || [];
    return Array.isArray(options) ? _clonePlain(options) : [];
  }

  /**
   * One actor's prepared roll data, for the Tool rules editor's `Preview as` evaluation — the only
   * thing on that path touching a live Foundry document, hence a service call.
   */
  async function getActorRollData(actorUuid) {
    const uuid = String(actorUuid || '').trim();
    if (!uuid) return null;
    try {
      return (await services.getActorRollData?.(uuid)) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * What in one crafting system requires each Tool, by tool id (issue 1373), for the rules editor's
   * rail: `_worldToolUsage` counts recipe references and carries no names, and gathering tasks were
   * not counted at all. Both corpora are walked once per publish, for the selected system only.
   */
  function _buildToolRequiredFor(systemId, recipes) {
    const byTool = {};
    const record = (toolId, entry) => {
      const key = String(toolId || '').trim();
      if (!key) return;
      (byTool[key] ??= []).push(entry);
    };
    for (const recipe of Array.isArray(recipes) ? recipes : []) {
      const id = String(recipe?.id ?? '');
      const name = String(recipe?.name ?? '').trim() || id;
      for (const toolId of _recipeToolIds(recipe)) record(toolId, { id, kind: 'recipe', name });
    }
    const tasks = _currentGatheringConfig()?.systems?.[String(systemId || '')]?.tasks;
    for (const task of Array.isArray(tasks) ? tasks : []) {
      const id = String(task?.id ?? '');
      const name = String(task?.name ?? '').trim() || id;
      for (const toolId of Array.isArray(task?.toolIds) ? task.toolIds : []) {
        record(toolId, { id, kind: 'gathering', name });
      }
    }
    return byTool;
  }

  // The world-scope write path (issue 1362), exposed on the store API and reachable by nothing in
  // `src/` yet — a deliberate, stated state rather than dead code.
  const worldScopeFamilies = createWorldScopeActions({
    getStores: {
      component: () => services.getComponentScopeStore?.() ?? null,
      essence: () => services.getEssenceScopeStore?.() ?? null,
      tool: () => services.getToolScopeStore?.() ?? null,
      vocabulary: () => services.getVocabularyScopeStore?.() ?? null,
    },
  });

  /** The world essence roster, keyed by id, straight off the published corpus. */
  function _worldEssenceEntities() {
    const entities = services.getEssenceScopeStore?.()?.corpus?.()?.entities;
    const byId = new Map();
    for (const entity of Array.isArray(entities) ? entities : []) {
      const id = typeof entity?.id === 'string' ? entity.id.trim() : '';
      if (id) byId.set(id, entity);
    }
    return byId;
  }

  /**
   * Join a world essence to one crafting system — the membership record AND the in-system record.
   * Membership alone writes a record the read union cannot draw, because it iterates the in-system
   * array; it seeds identity only, and only when the row is absent (issue 1372).
   */
  async function joinEssenceToSystem(entityId, systemId) {
    const target = typeof entityId === 'string' ? entityId.trim() : '';
    const system = typeof systemId === 'string' ? systemId.trim() : '';
    if (!target || !system) return false;
    const joined = await worldScopeFamilies.essence.addToSystem(target, system);
    const seeded = await _seedInSystemEssence(target, system);
    // NO `refresh()` HERE. `_republishingFamily` wraps this verb with every other one, so a
    // second call would re-project twice per click and would leave the wrapper looking optional.
    return joined || seeded;
  }

  /** Write the in-system `essenceDefinitions` row a joined world essence needs, when it is absent. */
  async function _seedInSystemEssence(entityId, systemId) {
    const entity = _worldEssenceEntities().get(entityId);
    if (!entity) return false;
    const systemManager = services.getCraftingSystemManager();
    const system = systemManager?.getSystem?.(systemId);
    if (!system) return false;
    const existing = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    if (existing.some((def) => String(def?.id ?? '').trim() === entityId)) return false;
    const essenceDefinitions = [
      ...existing,
      {
        id: entityId,
        name: String(entity.name || entityId),
        description: String(entity.description || ''),
        icon: normalizeEssenceIcon(entity.icon || DEFAULT_ESSENCE_ICON),
        colorToken: entity.colorToken || null,
      },
    ];
    await systemManager.updateSystem(systemId, { essenceDefinitions });
    return true;
  }

  /**
   * Remove a world essence from one crafting system — the membership record AND this system's
   * in-system rules record; the mirror of {@link joinEssenceToSystem}. The world entity and every
   * other system are untouched, and a component's stored quantities survive, because `_scopeBasis`
   * unions the world roster with the in-system array.
   */
  async function partEssenceFromSystem(entityId, systemId) {
    const target = typeof entityId === 'string' ? entityId.trim() : '';
    const system = typeof systemId === 'string' ? systemId.trim() : '';
    if (!target || !system) return false;
    const parted = await worldScopeFamilies.essence.removeFromSystem(target, system);
    const dropped = await _dropInSystemEssence(target, system);
    return parted || dropped;
  }

  /** Drop the in-system `essenceDefinitions` row for one essence, when it is present. */
  async function _dropInSystemEssence(entityId, systemId) {
    const systemManager = services.getCraftingSystemManager();
    const system = systemManager?.getSystem?.(systemId);
    if (!system) return false;
    const existing = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const essenceDefinitions = existing.filter(
      (def) => String(def?.id ?? '').trim() !== entityId
    );
    if (essenceDefinitions.length === existing.length) return false;
    await systemManager.updateSystem(systemId, { essenceDefinitions });
    return true;
  }

  /** The world component roster, keyed by id, straight off the published corpus. */
  function _worldComponentEntities() {
    const entities = services.getComponentScopeStore?.()?.corpus?.()?.entities;
    const byId = new Map();
    for (const entity of Array.isArray(entities) ? entities : []) {
      const id = typeof entity?.id === 'string' ? entity.id.trim() : '';
      if (id) byId.set(id, entity);
    }
    return byId;
  }

  // A system-scope essence write is an override (issue 1371).
  const _componentEssenceOverride = componentEssenceOverrideOn({
    getComponentScopeStore: () => services.getComponentScopeStore?.() ?? null,
    getCraftingSystemManager: () => services.getCraftingSystemManager?.() ?? null,
    setEssenceInheritance: (componentId, systemId, inherit) =>
      worldScopeFamilies.component.setSectionInherited(componentId, systemId, 'essences', inherit),
    clearEssenceOverride: (componentId, systemId) =>
      worldScopeFamilies.component.updateMembershipSection(
        componentId,
        systemId,
        'essences',
        undefined
      ),
  });

  /**
   * The in-system component record adoption creates: the world entity's identity and its three
   * source-link fields, and nothing else.
   */
  function _worldComponentAdoptionSeed(entity) {
    const originItemUuid = entity?.originItemUuid ?? entity?.registeredItemUuid ?? null;
    return {
      id: String(entity?.id ?? ''),
      name: entity?.name ?? null,
      img: entity?.img ?? null,
      description: entity?.description ?? '',
      originItemUuid,
      registeredItemUuid: entity?.registeredItemUuid ?? originItemUuid,
      aliasItemUuids: Array.isArray(entity?.aliasItemUuids) ? [...entity.aliasItemUuids] : [],
    };
  }

  /**
   * Join a world component to one crafting system — the membership record AND the in-system one,
   * for the reason the essence join states. An existing row is never rewritten, and a refused seed
   * rolls back only the membership record THIS call wrote (issue 1371).
   */
  async function joinComponentToSystem(entityId, systemId) {
    const target = typeof entityId === 'string' ? entityId.trim() : '';
    const system = typeof systemId === 'string' ? systemId.trim() : '';
    if (!target || !system) return false;
    const joined = await worldScopeFamilies.component.addToSystem(target, system);
    try {
      const seeded = await _seedInSystemComponent(target, system);
      // NO `refresh()` HERE. `_republishingFamily` wraps this verb with every other one, so a
      // second call would re-project twice per click and would leave the wrapper looking optional.
      return joined || seeded;
    } catch (error) {
      if (joined === true) await worldScopeFamilies.component.removeFromSystem(target, system);
      services.notify?.error?.(_componentJoinFailureMessage(error));
      return false;
    }
  }

  /** Write one bulk edit to a set of components' rules in one crafting system (issue 1371). */
  async function bulkEditComponentRules(systemId, componentIds, edit = {}) {
    const systemManager = services.getCraftingSystemManager?.();
    const system = typeof systemId === 'string' ? systemId.trim() : '';
    const ids = Array.from(componentIds || [], String).filter(Boolean);
    if (!systemManager || !system || ids.length === 0) return false;
    if (!edit || typeof edit !== 'object' || Object.keys(edit).length === 0) return false;
    // THE SAME OVERRIDE RULE AS THE STUDIO'S OWN BULK EDIT (issue 1371 r19-store2). This verb
    // writes the same rows through the same primitive with the system named by the caller, so it
    // cannot take a different view of what an essence write on an inheriting pair means.
    const { writable, refused, flipped } = await _componentEssenceOverride.cohortFor(
      system,
      ids,
      edit
    );
    try {
      const result = await _writeComponentCohorts(systemManager, system, {
        writable,
        refused,
        edit,
      });
      if (!result) return false;
      return { ...result, refused: refused.length };
    } catch (error) {
      // The flip is rolled back (issue 1371): it is a durable, replicated world-setting write that
      // landed ahead of the values, so leaving it standing over a failed write would opt those pairs out
      // of every later world edit while the GM is told the write failed.
      await _componentEssenceOverride.rollback(system, flipped);
      console.error('Fabricate | Failed to apply component rules bulk edit:', error);
      services.notify?.error?.(
        _componentBulkEditFailureMessage(error, systemManager.getSystem?.(system)?.name || system)
      );
      return false;
    }
  }

  /**
   * Write one staged edit to a cohort the override rule has split in two (issue 1371). The refused
   * pass runs FIRST, and that order is the invariant: the caller compensates a throw by rolling
   * every flipped switch back, which is correct only while the values have not landed.
   *
   * @returns {Promise<{updated: number, componentIds: string[]}|null>} `null` when there was
   * nothing to write at all.
   */
  async function _writeComponentCohorts(systemManager, systemId, { writable, refused, edit }) {
    const withoutEssences = { ...edit };
    delete withoutEssences.essences;
    const passes = [
      { ids: refused, axes: withoutEssences },
      { ids: writable, axes: edit },
    ].filter((pass) => pass.ids.length > 0 && Object.keys(pass.axes).length > 0);
    if (passes.length === 0) return null;

    let updated = 0;
    const componentIds = [];
    for (const pass of passes) {
      const result = await systemManager.applyBulkEditToComponents(systemId, pass.ids, pass.axes);
      updated += Number(result?.updated) || 0;
      if (Array.isArray(result?.componentIds)) componentIds.push(...result.componentIds);
    }
    return { updated, componentIds };
  }

  /** Republish after a component write that has already landed (issue 1371). */
  async function _republishAfterWrite(what) {
    try {
      await refresh();
    } catch (error) {
      console.error(`Fabricate | Failed to republish after ${what}:`, error);
    }
  }

  /** The essence delete's component cascade is an override too (issue 1371). */
  function _essenceDeleteCascade(systemId) {
    let flipped = [];
    return {
      seam: {
        overrideInheritedEssences: async (system, componentIds) => {
          // `{essences: {}}` names the axis so the cohort unit engages; the VALUES are the
          // manager's, written onto the rows it is about to strip.
          const cohort = await _componentEssenceOverride.cohortFor(system, componentIds, {
            essences: {},
          });
          flipped = cohort.flipped;
          return cohort.writable;
        },
      },
      rollback: () => _componentEssenceOverride.rollback(systemId, flipped),
    };
  }

  /** The message a failed per-system rules bulk edit puts in front of the GM (issue 1371). */
  function _componentBulkEditFailureMessage(error, systemName) {
    return _componentMembershipFailureMessage(
      'FABRICATE.Admin.Manager.Component.BulkEditRulesFailed',
      'Writing the staged rules to {system} did not complete.',
      error,
      { system: systemName }
    );
  }

  /** The message a refused component seed puts in front of the GM. */
  function _componentJoinFailureMessage(error) {
    return _componentMembershipFailureMessage(
      'FABRICATE.Admin.Manager.Component.AddToSystemFailed',
      'The component could not be added to this system.',
      error
    );
  }

  /**
   * One membership-failure sentence, localized, with an English floor that cannot be a raw key:
   * `localize` answers a missing key with the key itself, so `localize(k) || fallback` never
   * reaches its fallback.
   */
  function _componentMembershipFailureMessage(key, fallback, error, data = {}) {
    const detail = error?.message ? String(error.message) : '';
    const localized = services.localize?.(key, { ...data, error: detail });
    if (localized && localized !== key) return localized.trim();
    let floor = fallback;
    for (const [token, value] of Object.entries(data)) {
      floor = floor.replaceAll(`{${token}}`, String(value ?? ''));
    }
    return `${floor} ${detail}`.trim();
  }

  /** Write the in-system `components` row a joined world component needs, when it is absent. */
  async function _seedInSystemComponent(entityId, systemId) {
    const entity = _worldComponentEntities().get(entityId);
    if (!entity) return false;
    const systemManager = services.getCraftingSystemManager();
    const system = systemManager?.getSystem?.(systemId);
    if (!system) return false;
    const existing = Array.isArray(system.components) ? system.components : [];
    if (existing.some((record) => String(record?.id ?? '').trim() === entityId)) return false;
    await systemManager.updateSystem(systemId, {
      components: [...existing, _worldComponentAdoptionSeed(entity)],
    });
    return true;
  }

  /**
   * Remove a world component from one crafting system — the membership record AND this system's
   * in-system record (issue 1371). The in-system half is a DELETE, so it takes the delete cascade
   * rather than a filtering `updateSystem`, and it goes FIRST: ordering is the compensation,
   * because membership-gone-row-left is the ghost while row-gone-membership-left is inert.
   *
   * @returns {Promise<boolean>} whether anything changed, which is what `_republishingFamily` gates
   * the re-projection on — not whether it succeeded.
   */
  async function partComponentFromSystem(entityId, systemId) {
    const target = typeof entityId === 'string' ? entityId.trim() : '';
    const system = typeof systemId === 'string' ? systemId.trim() : '';
    if (!target || !system) return false;
    const systemManager = services.getCraftingSystemManager?.();
    const holdsRecord = _systemHoldsComponentRow(systemManager, system, target);
    if (holdsRecord && typeof systemManager?.deleteComponents !== 'function') return false;
    try {
      const dropped = holdsRecord ? await _dropInSystemComponent(target, system) : false;
      const parted = await worldScopeFamilies.component.removeFromSystem(target, system);
      return parted || dropped;
    } catch (error) {
      services.notify?.error?.(_componentPartFailureMessage(error));
      return holdsRecord && !_systemHoldsComponentRow(systemManager, system, target);
    }
  }

  /** The message a failed component removal puts in front of the GM. */
  function _componentPartFailureMessage(error) {
    return _componentMembershipFailureMessage(
      'FABRICATE.Admin.Manager.Component.RemoveFromSystemFailed',
      'Removing the component from this system did not complete.',
      error
    );
  }

  /** One system's in-system `components` array, or `[]` when there is no such system. */
  function _inSystemComponents(systemManager, systemId) {
    const system = systemManager?.getSystem?.(systemId);
    return Array.isArray(system?.components) ? system.components : [];
  }

  /** Whether one system's in-system `components` array holds a row for this id. */
  function _systemHoldsComponentRow(systemManager, systemId, entityId) {
    return _inSystemComponents(systemManager, systemId).some(
      (record) => String(record?.id ?? '').trim() === entityId
    );
  }

  /** Delete the in-system `components` row through the sanctioned cascade. */
  async function _dropInSystemComponent(entityId, systemId) {
    const systemManager = services.getCraftingSystemManager?.();
    if (typeof systemManager?.deleteComponents !== 'function') return false;
    const outcome = await systemManager.deleteComponents(systemId, [entityId]);
    return Number(outcome?.deleted ?? 0) > 0;
  }

  /**
   * Re-publish after a world-scope write that reported it wrote something: `buildWorldScopeState()`
   * is read once per publish and nothing else republishes, so a flipped switch left the inherit row
   * beside it rendering the state before the click.
   */
  function _republishingFamily(family) {
    const wrapped = {};
    for (const [name, verb] of Object.entries(family)) {
      if (typeof verb !== 'function') {
        wrapped[name] = verb;
        continue;
      }
      wrapped[name] = async (...args) => {
        const answer = await verb(...args);
        if (answer !== false) await refresh();
        return answer;
      };
    }
    return wrapped;
  }

  // The published write path.
  const worldScope = Object.fromEntries(
    Object.entries({
      ...worldScopeFamilies,
      component: {
        ...worldScopeFamilies.component,
        addToSystem: joinComponentToSystem,
        removeFromSystem: partComponentFromSystem,
        // The per-system rules write (issue 1371), composed here beside the join/part verbs because it is
        // the same kind of verb: a world-scope instruction whose second half lives in
        // `CraftingSystemManager`. Wrapped like the rest, so one `refresh()` follows each landed batch.
        bulkEditRules: bulkEditComponentRules,
      },
      essence: {
        ...worldScopeFamilies.essence,
        addToSystem: joinEssenceToSystem,
        removeFromSystem: partEssenceFromSystem,
      },
    }).map(([entityType, family]) => [entityType, _republishingFamily(family)])
  );

  /**
   * The in-system Tool record adoption creates: the world entity's identity, and the one seeded
   * section with no live parent (issue 1373). It copies no inherited section, because clause 1a
   * resolves those from the world default; `repairRequirements` is seeded because the resolver does
   * not read it through, and `enabled` is a veto over the merged rows rather than a value to copy.
   */
  function _worldToolAdoptionSeed(entity, worldDefault) {
    const originItemUuid = entity?.originItemUuid ?? entity?.registeredItemUuid ?? null;
    const repairRequirements = _seedToolRepairRequirements(worldDefault);
    return {
      id: String(entity?.id ?? ''),
      name: entity?.name ?? null,
      img: entity?.img ?? null,
      description: entity?.description ?? '',
      originItemUuid,
      registeredItemUuid: entity?.registeredItemUuid ?? originItemUuid,
      aliasItemUuids: Array.isArray(entity?.aliasItemUuids) ? [...entity.aliasItemUuids] : [],
      ...(repairRequirements.length > 0 ? { repairRequirements } : {}),
    };
  }

  /**
   * Adopt a world Tool into a crafting system — both writes, because while `## CraftingSystem`
   * requirement 36 holds the read union's row set is the in-system array's, so a membership-only
   * adoption writes a record nothing can read. The membership write goes first, owning the
   * already-a-member rule, and is removed again if the Tool record is refused (issue 1373).
   */
  async function adoptWorldTool(entityId, systemId = get(selectedSystemId)) {
    const target = String(entityId ?? '').trim();
    const system = String(systemId ?? '').trim();
    if (!target || !system) return false;
    // ONE READ OF THE CORPUS for both halves of the seed, so the identity and the defaults
    // cannot come from two different snapshots.
    const corpus = _worldToolCorpus();
    const byId = (records) =>
      (Array.isArray(records) ? records : []).find(
        (record) => String(record?.id ?? '').trim() === target
      ) ?? null;
    const entity = byId(corpus?.entities);
    if (!entity) return false;

    const systemManager = services.getCraftingSystemManager?.();
    const needsRecord = !_systemTools(system).some((tool) => String(tool?.id ?? '') === target);
    if (needsRecord && typeof systemManager?.upsertTool !== 'function') return false;
    if ((await worldScope.tool.addToSystem(target, system)) !== true) return false;

    if (needsRecord) {
      try {
        await systemManager.upsertTool(
          system,
          _worldToolAdoptionSeed(entity, byId(corpus?.defaults))
        );
      } catch (error) {
        await worldScope.tool.removeFromSystem(target, system);
        services.notify?.error?.(
          services.localize?.('FABRICATE.Admin.Manager.Tools.AddToSystemFailed') ||
            `The Tool could not be added to this system. ${error?.message || ''}`.trim()
        );
        await refresh();
        return false;
      }
    }
    await refresh();
    return true;
  }

  // The exposed family, with tool adoption composed over it (issue 1373).
  const worldScopeApi = {
    ...worldScope,
    tool: { ...worldScope.tool, addToSystem: adoptWorldTool },
  };

  // Read the world character libraries straight from their store on every publish, for the same
  // reasons: cheap, and honest when another GM edits a library, with no per-system cache to
  // invalidate because there is no per-system copy any more.
  function buildCharacterLibrariesState() {
    const store = _characterLibrariesStore();
    if (!store) return _emptyCharacterLibrariesState();
    return {
      worldCharacterPrerequisites: store.listCharacterPrerequisites?.() ?? [],
      worldModifiers: store.listModifiers?.() ?? [],
    };
  }

  // GM Knowledge surface (issue 785).

  function _knowledgeRawCharacter(actorId) {
    const characters = Array.isArray(knowledgeSnapshot?.characters)
      ? knowledgeSnapshot.characters
      : [];
    return characters.find((character) => String(character?.id) === String(actorId)) || null;
  }

  function _knowledgeRawOwnedCopy(actorId, itemId) {
    const copies = _knowledgeRawCharacter(actorId)?.ownedCopies || [];
    return copies.find((copy) => String(copy?.itemId) === String(itemId)) || null;
  }

  // Localized copy for the Knowledge surface's two heavyweight confirms. Every key is a STATIC
  // literal at its call site, because an interpolated key is invisible to both
  // `ui-lang-keys-resolve` and `lang-keys-no-orphans` and a missing message would ship silently.
  function _knowledgeText(key, fallback, data = null) {
    const localized = data ? services.localize?.(key, data) : services.localize?.(key);
    if (localized) return localized;
    if (!data) return fallback;
    return Object.entries(data).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  function _notifyKnowledgeResult(result) {
    const message = result?.message;
    if (!message) return;
    const text = services.localize?.(message, result?.messageData) || message;
    if (result?.success === true) services.notify?.info?.(text);
    else services.notify?.error?.(text);
  }

  function _publishKnowledge() {
    viewState.update((prev) => ({
      ...prev,
      knowledge: projectKnowledgeSnapshot(knowledgeSnapshot, {
        active: knowledgeActive,
        selectedActorId: knowledgeSelectedActorId,
        defaultTab: knowledgeDefaultTab,
      }),
    }));
  }

  function _clearKnowledgeCache() {
    knowledgeSnapshot = null;
    knowledgeDefaultTabResolved = false;
    knowledgeSelectedActorId = '';
  }

  /**
   * Re-read the Knowledge snapshot.
   *
   * @param {{force?: boolean}} [options] `force` re-reads the seam; otherwise a cached snapshot is
   * simply re-published.
   */
  async function refreshKnowledge({ force = false } = {}) {
    if (!knowledgeActive) return false;
    if (force || !knowledgeSnapshot) {
      const systemId = get(selectedSystemId);
      knowledgeSnapshot = (await services.getKnowledgeSnapshot?.(systemId)) || null;
      if (!knowledgeDefaultTabResolved) {
        knowledgeDefaultTab = defaultKnowledgeTab(knowledgeSnapshot?.definitionCount || 0);
        knowledgeDefaultTabResolved = true;
      }
    }
    _publishKnowledge();
    return true;
  }

  /** Hook entry point. */
  function scheduleKnowledgeRefresh() {
    if (destroyed || !knowledgeActive || knowledgeRefreshScheduled) return;
    knowledgeRefreshScheduled = true;
    _onMicrotask(async () => {
      knowledgeRefreshScheduled = false;
      if (destroyed) return;
      await refreshKnowledge({ force: true });
    });
  }

  /** Enter or leave the Knowledge surface. */
  async function setKnowledgeActive(active) {
    const next = active === true;
    knowledgeActive = next;
    if (!next) {
      _clearKnowledgeCache();
      _publishKnowledge();
      return false;
    }
    await refreshKnowledge({ force: true });
    return true;
  }

  /** Select a roster character. Pure re-publication — no seam read. */
  function selectKnowledgeActor(actorId) {
    knowledgeSelectedActorId = String(actorId || '');
    if (!knowledgeActive) return false;
    _publishKnowledge();
    return true;
  }

  async function _runKnowledgeMutation(call) {
    const result = (await call()) || {
      success: false,
      message: 'FABRICATE.Knowledge.Manage.Failed',
    };
    _notifyKnowledgeResult(result);
    await refreshKnowledge({ force: true });
    return result;
  }

  /** Spend one charge of an owned recipe-item copy. */
  async function expendRecipeItemUse(actorId, itemId) {
    const copy = _knowledgeRawOwnedCopy(actorId, itemId);
    return _runKnowledgeMutation(() =>
      services.expendRecipeItemUse?.({
        actorId,
        itemId,
        definitionId: copy?.definitionId || '',
        systemId: get(selectedSystemId),
      })
    );
  }

  /** Delete one owned copy. */
  async function deleteOwnedRecipeItem(actorId, itemId) {
    const copy = _knowledgeRawOwnedCopy(actorId, itemId);
    const quantity = Number(copy?.quantity) || 1;
    if (quantity > 1) {
      const confirmed = await services.confirmDialog?.({
        title: _knowledgeText(
          'FABRICATE.Admin.Manager.Knowledge.DeleteStackTitle',
          'Delete the whole stack?'
        ),
        content: `<p>${_knowledgeText(
          'FABRICATE.Admin.Manager.Knowledge.DeleteStackContent',
          'This copy is a stack of {quantity}. Deleting removes every unit, because uses and learns are tracked per document.',
          { quantity }
        )}</p>`,
        ..._deleteConfirmButtons(),
      });
      if (!confirmed) return { success: false, cancelled: true };
    }
    return _runKnowledgeMutation(() => services.deleteOwnedRecipeItem?.({ actorId, itemId }));
  }

  /**
   * Erase one learned recipe. Frees the learn budget but deliberately leaves discovery progress
   * intact — an erase is an un-learn, a reset is an amnesia.
   */
  async function eraseLearnedRecipe(actorId, recipeId) {
    return _runKnowledgeMutation(() => services.eraseLearnedRecipe?.({ actorId, recipeId }));
  }

  async function _confirmKnowledgeReset(titleKey, titleFallback, contentKey, contentFallback) {
    const note = _knowledgeText(
      'FABRICATE.Admin.Manager.Knowledge.ResetDiscoveryNote',
      'Erasing a single memory leaves discovery progress intact; a reset also clears it.'
    );
    return services.confirmDialog?.({
      title: _knowledgeText(titleKey, titleFallback),
      content: `<p>${_knowledgeText(contentKey, contentFallback)}</p><p>${note}</p>`,
      // A reset erases learned knowledge but deletes no definition, so it names its own
      // verb rather than reusing the delete pair.
      yes: {
        label: _knowledgeText('FABRICATE.Admin.Manager.Knowledge.ResetConfirm', 'Reset'),
        callback: () => true,
      },
      no: { callback: () => false },
    });
  }

  /** Reset this character's learned knowledge for the SELECTED system. */
  async function resetActorSystemKnowledge(actorId) {
    const confirmed = await _confirmKnowledgeReset(
      'FABRICATE.Admin.Manager.Knowledge.ResetSystemTitle',
      'Reset this system?',
      'FABRICATE.Admin.Manager.Knowledge.ResetSystemContent',
      'Clear every recipe this character has learned in the selected crafting system.'
    );
    if (!confirmed) return { success: false, cancelled: true };
    const systemId = get(selectedSystemId);
    return _runKnowledgeMutation(() => services.resetActorKnowledge?.({ actorId, systemId }));
  }

  /** Reset this character's learned knowledge across every system. */
  async function resetActorAllKnowledge(actorId) {
    const confirmed = await _confirmKnowledgeReset(
      'FABRICATE.Admin.Manager.Knowledge.ResetAllTitle',
      'Reset every system?',
      'FABRICATE.Admin.Manager.Knowledge.ResetAllContent',
      'Clear every recipe this character has learned across all crafting systems, including entries whose recipe no longer exists.'
    );
    if (!confirmed) return { success: false, cancelled: true };
    return _runKnowledgeMutation(() => services.resetActorKnowledge?.({ actorId, systemId: null }));
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  // --- System selection ---

  // Every search term is scoped to one system's vocabulary, so carrying a term across a system
  // change filters the new browser down to nothing and reads as an empty library. Cleared at the
  // store rather than in each view, because every consumer reads these terms back out at once.
  function _clearSystemScopedSearches() {
    recipeSearch.set('');
    itemSearch.set('');
    graphSearch.set('');
  }

  // Leaving a library's route clears that library's search (issue 1462): a term typed into the
  // recipe or component library keeps filtering `viewState.recipes` / `viewState.itemCards` on
  // every screen that reads them, including ones rendering no search box for it.
  async function clearLibrarySearches() {
    if (!get(recipeSearch) && !get(itemSearch)) return false;
    recipeSearch.set('');
    itemSearch.set('');
    await refresh();
    return true;
  }

  async function selectSystem(systemId) {
    if (systemId === get(selectedSystemId)) {
      await refresh();
      return true;
    }
    if (!(await _proceedAfterDirtyEnvironmentConfirm())) return false;

    selectedSystemId.set(systemId);
    _clearSystemScopedSearches();
    // The Knowledge snapshot is scoped to ONE system's recipe-item definitions
    // (identity is system-scoped), so it can never survive a system change.
    _clearKnowledgeCache();
    selectedEnvironmentId.set('');
    selectedEnvironmentSystemId.set(systemId || '');
    _setEnvironmentDraftState(null, { persistedDraft: null });
    await services.setSetting('lastManagedCraftingSystem', systemId);
    await refresh();
    return true;
  }

  /** Create a crafting system, select it, and report it back so the caller can navigate. */
  async function createSystem() {
    if (!(await _proceedAfterDirtyEnvironmentConfirm())) return false;

    const systemManager = services.getCraftingSystemManager();
    const name = _nextSystemName(systemManager);
    const description =
      'Configure categories, item tags, essences, and crafting behaviour for this system.';
    // No `craftingCheck` seed (issue 1055): the combination rule that replaced the old authority level
    // already has a shared default (`addAll`), so a UI-only seed could only disagree with the manager
    // and the importer about what a new system starts as.
    const system = await systemManager.createSystem({ name, description });
    selectedSystemId.set(system.id);
    _clearSystemScopedSearches();
    activeTab.set('systems');
    await services.setSetting('lastManagedCraftingSystem', system.id);
    await refresh();
    return system;
  }

  async function deleteSystem(systemId) {
    const systemManager = services.getCraftingSystemManager();
    const system = systemManager.getSystem(systemId);
    if (!system) return;

    // The name is raw in the TITLE (ApplicationV2 assigns it through `innerText`, so escaping would
    // surface a literal `&amp;`) and escaped in the CONTENT, which is HTML.
    const name = String(system.name || '');
    const escapedName = _escapeHtml(name);
    const consequences =
      services.localize?.('FABRICATE.Admin.Manager.DeleteSystemConfirm.Consequences') ||
      'Linked recipes, gathering environments, gathering tools and tasks, and any in-progress or historical crafting, salvage, and gathering runs for this system will be removed.';
    const confirmed = await services.confirmDialog({
      title:
        services.localize?.('FABRICATE.Admin.Manager.DeleteSystemConfirm.Title', { name }) ||
        `Delete ${name}?`,
      content: `<p>${
        services.localize?.('FABRICATE.Admin.Manager.DeleteSystemConfirm.Content', {
          name: escapedName,
        }) || `Delete crafting system <strong>${escapedName}</strong>?`
      }</p><p>${consequences}</p>`,
      ..._deleteConfirmButtons(),
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

  /**
   * Persist the crafting system's name and description, then refresh so the `selectedSystem`
   * projection republishes the saved values, which is what clears the editor's `Unsaved` chip.
   *
   * @returns {Promise<boolean>} `false` when there is no selected system to write to. A navigation
   *   contract, not decoration: the `system-details` route-exit guard proceeds only on non-`false`,
   *   so the no-op must keep the GM on the form.
   */
  async function saveSystemDetails(name, description) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;
    await systemManager.updateSystem(sysId, { name, description });
    await refresh();
    return true;
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
      yes: {
        label:
          localizeFn?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeConfirm') ||
          'Change mode',
        callback: () => true,
      },
      no: { callback: () => false },
    });
    if (!confirmed) return false;

    await systemManager.updateSystem(sysId, { resolutionMode: nextMode });
    await refresh();
    return true;
  }

  // Flat system-level visibility strategy (issue 511). Non-destructive: unlike `setResolutionMode`,
  // switching `visibilityMode` migrates no recipes and needs no confirm — it only re-gates the
  // Crafting authoring surface.
  async function setVisibilityMode(mode) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { visibilityMode: mode });
    await refresh();
  }

  // Salvage resolution mode is non-destructive: `updateSystem` runs only the inline salvage-cleanup
  // block, which reversibly disables salvage on incompatible components and deletes no recipes or
  // runs, so the confirm is salvage-accurate rather than the recipe-deletion warning.
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
      yes: {
        label:
          localizeFn?.('FABRICATE.Admin.SystemSettings.SalvageResolutionModeChangeConfirm') ||
          'Change mode',
        callback: () => true,
      },
      no: { callback: () => false },
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
    if (
      get(activeTab) === ENVIRONMENTS_TAB &&
      nextTab !== ENVIRONMENTS_TAB &&
      !(await _discardDirtyEnvironmentDraftForNavigation())
    )
      return false;
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
      switch (field) {
        case 'enabled': {
          next.enabled = value === true;

          break;
        }
        case 'compositionMode': {
          next.compositionMode = value === 'manual' ? 'manual' : 'automatic';

          break;
        }
        case 'sceneUuid': {
          const normalized = String(value ?? '').trim();
          next.sceneUuid = normalized || null;

          break;
        }
        case 'img': {
          const normalized = String(value ?? '').trim();
          next.img = normalized || null;

          break;
        }
        default: {
          if (['biomes', 'dangerTags'].includes(field)) {
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
            next[field] = [
              ...new Set(
                (Array.isArray(value) ? value : [])
                  .map((entry) => String(entry || '').trim())
                  .filter(Boolean)
              ),
            ];
          } else
            switch (field) {
              case 'eventDropRateAdjustments': {
                next.eventDropRateAdjustments = _normalizeDraftDropRateAdjustmentMap(value);

                break;
              }
              case 'eventDropRateAdjustmentsEnabled': {
                next.eventDropRateAdjustmentsEnabled =
                  _normalizeDraftEventDropRateAdjustmentsEnabled(value);

                break;
              }
              case 'taskDropRateAdjustments': {
                next.taskDropRateAdjustments = _normalizeDraftTaskDropRateAdjustments(value);

                break;
              }
              case 'taskDropRateAdjustmentsEnabled': {
                next.taskDropRateAdjustmentsEnabled =
                  _normalizeDraftTaskDropRateAdjustmentsEnabled(value);

                break;
              }
              case 'blindSelection': {
                next.blindSelection = _normalizeDraftBlindSelection(value);

                break;
              }
              case 'nodeRuntime': {
                next.nodeRuntime = normalizeNodeRuntime(value);

                break;
              }
              default: {
                next[field] = String(value ?? '');
              }
            }
        }
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
    // Both kinds filter on the shared four-state included set, not `runtimeState`, which requires
    // `conditionsMet`: an included record whose current weather/time did not match would drop out
    // of `ids`, and this function writes `ids` as the entire new order array, so an ambient runtime
    // condition would silently discard that record's saved rank.
    const ids = records
      .filter((entry) => ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has(entry.compositionState))
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
    } catch (error) {
      const message = _environmentErrorMessage(error);
      const validationState = _buildEnvironmentValidationState(
        error,
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
    } catch (error) {
      environmentSaveError.set(_environmentErrorMessage(error));
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
    // The name is raw in the TITLE (ApplicationV2 assigns it through `innerText`, so
    // escaping there would surface a literal `&#39;`) and escaped in the CONTENT, which is
    // HTML.
    const environmentName = String(targetEnvironment?.name || targetId);
    const escapedEnvironmentName = _escapeHtml(environmentName);
    const confirmed = await services.confirmDialog?.({
      title:
        services.localize?.('FABRICATE.Admin.Environments.DeleteTitle', {
          name: environmentName,
        }) || `Delete ${environmentName}?`,
      content: `<p>${
        services.localize?.('FABRICATE.Admin.Environments.DeleteContent', {
          name: escapedEnvironmentName,
        }) ||
        `Delete gathering environment <strong>${escapedEnvironmentName}</strong>? This also cleans active and historical gathering runs that reference it.`
      }</p>`,
      ..._deleteConfirmButtons(),
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
    } catch (error) {
      environmentSaveError.set(_environmentErrorMessage(error));
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
      if (selectedId && environments.every((environment) => !(environment.id === selectedId))) {
        selectedEnvironmentId.set(environments[0]?.id || '');
        environmentDraftDirty.set(false);
        environmentDraftIsNew.set(false);
      }
      environmentSaveError.set(null);
      environmentValidationState.set(null);
      await refresh();
      return _clonePlain(get(viewState).environments || []);
    } catch (error) {
      environmentSaveError.set(_environmentErrorMessage(error));
      environmentValidationState.set(null);
      _patchEnvironmentViewState();
      return [];
    }
  }

  async function moveEnvironmentDraft(environmentId, direction) {
    const environments = get(viewState).environments || [];
    const index = environments.findIndex((environment) => environment.id === environmentId);
    if (index === -1) return [];

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
    } catch (error) {
      environmentSaveError.set(_environmentErrorMessage(error));
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
    } catch (error) {
      environmentSaveError.set(_environmentErrorMessage(error));
      environmentValidationState.set(null);
      _patchEnvironmentViewState();
      return false;
    }
  }

  // --- Feature toggles ---

  // Count a system's recipes carrying authored `steps[]` — those that collapse to a single atomic
  // action when the multi-step feature is turned off (issue 710). Fails safe to 0, so a headless
  // caller never blocks on a missing recipe manager.
  function _countMultiStepRecipes(sysId) {
    const recipeManager = services.getRecipeManager?.();
    if (!recipeManager?.getRecipes) return 0;
    const recipes = recipeManager.getRecipes({ craftingSystemId: sysId }) || [];
    return recipes.filter((recipe) => Array.isArray(recipe?.steps) && recipe.steps.length > 1)
      .length;
  }

  // Warning/confirm gate for turning the multi-step feature OFF while multi-step recipes exist
  // (issue 710).
  async function _confirmDisableMultiStep(sysId) {
    const count = _countMultiStepRecipes(sysId);
    if (count === 0) return true;
    const confirmed = await services.confirmDialog?.({
      title:
        services.localize?.('FABRICATE.Admin.Manager.DisableMultiStep.Title') ||
        'Disable multi-step recipes?',
      content: `<p>${
        services.localize?.('FABRICATE.Admin.Manager.DisableMultiStep.Body') ||
        'Existing multi-step recipes will run as one combined action and show only their final results for editing. Their steps are kept and restored if you turn multi-step recipes back on. No recipe data is deleted.'
      }</p>`,
      yes: {
        label: services.localize?.('FABRICATE.Admin.Manager.DisableMultiStep.Confirm') || 'Disable',
        callback: () => true,
      },
      no: { callback: () => false },
    });
    return confirmed === true;
  }

  async function toggleFeature(feature, enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const key = FEATURE_MAP[feature];
    if (!key) return;
    if (key === 'gathering' && enabled !== true && !(await _proceedAfterDirtyEnvironmentConfirm()))
      return false;
    if (key === 'multiStepRecipes' && enabled !== true && !(await _confirmDisableMultiStep(sysId)))
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

  // Tool-breakage authority (issue 419), persisted as a system-level field: `toolSpecific` or
  // `checkDriven`.
  async function setToolBreakageAuthority(authority) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;
    const toolBreakage = TOOL_BREAKAGE_AUTHORITIES.includes(authority) ? { authority } : {};
    await systemManager.updateSystem(sysId, { toolBreakage });
    await refresh();
    return true;
  }

  /** Whether this crafting system participates in Travel & Realms. */
  async function setGatheringRealmsEnabled(systemId, enabled) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = systemId || get(selectedSystemId);
    if (!sysId || !systemManager?.updateSystem) return false;
    await systemManager.updateSystem(sysId, {
      gatheringRealmSettings: { enabled: enabled === true },
    });
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
          time: { enabled: true },
          currency: { enabled: false },
        }
      )
    );
    requirements[requirement] = requirements[requirement] || {};
    requirements[requirement].enabled = enabled;
    // Currency is NOT re-normalized here any more (issue 1278): the system owns only the
    // participation flag, and the ladder this used to normalize lives in the world config,
    // which this write must not touch.

    await systemManager.updateSystem(sysId, { requirements });
    await refresh();
  }

  // --- Category management ---

  async function addCategory(value, icon) {
    if (!value || !value.trim()) return;
    if (isGeneralRecipeCategory(value)) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const name = value.trim();
    const categories = normalizeCustomRecipeCategories([...(system.categories || []), name]);
    const categoryIcons = withCategoryIcon(system.categoryIcons, name, icon);
    await systemManager.updateSystem(sysId, { categories, categoryIcons });
    await refresh();
  }

  // Deleting a referenced recipe category is a DESTRUCTIVE record rewrite (issue
  // 689): every recipe carrying it is reassigned to `general` before the category
  // (and its icon) is dropped from the vocabulary. Nothing is left dangling.
  async function removeCategory(category) {
    if (isGeneralRecipeCategory(category)) return;
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const recipes = recipeManager?.getRecipes?.({ craftingSystemId: sysId }) || [];
    for (const { id, category: reassigned } of planRecipeCategoryReassignments(recipes, category)) {
      await recipeManager.updateRecipe(
        id,
        { category: reassigned },
        { allowIncomplete: true, notify: false }
      );
    }
    const categories = normalizeCustomRecipeCategories(
      (system.categories || []).filter((c) => c !== category)
    );
    const categoryIcons = withCategoryIcon(system.categoryIcons, category, '');
    await systemManager.updateSystem(sysId, { categories, categoryIcons });
    await refresh();
  }

  async function setCategoryIcon(name, icon) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const categoryIcons = withCategoryIcon(system.categoryIcons, name, icon);
    await systemManager.updateSystem(sysId, { categoryIcons });
    await refresh();
  }

  // Component category management (issue 676).

  async function addComponentCategory(value, icon) {
    if (!value || !value.trim()) return;
    if (isGeneralComponentCategory(value)) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const name = value.trim();
    const componentCategories = normalizeCustomComponentCategories([
      ...(system.componentCategories || []),
      name,
    ]);
    const componentCategoryIcons = withCategoryIcon(system.componentCategoryIcons, name, icon);
    await systemManager.updateSystem(sysId, { componentCategories, componentCategoryIcons });
    await refresh();
  }

  // Cascade sibling of removeCategory (issue 689): reassign every component carrying
  // the deleted component category to `general`, then drop the category and its icon.
  async function removeComponentCategory(category) {
    if (isGeneralComponentCategory(category)) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    for (const { id, category: reassigned } of planComponentCategoryReassignments(
      _getManagedItems(system),
      category
    )) {
      await systemManager.updateItem(sysId, id, { category: reassigned });
    }
    const componentCategories = normalizeCustomComponentCategories(
      (system.componentCategories || []).filter((c) => c !== category)
    );
    const componentCategoryIcons = withCategoryIcon(system.componentCategoryIcons, category, '');
    await systemManager.updateSystem(sysId, { componentCategories, componentCategoryIcons });
    await refresh();
  }

  async function setComponentCategoryIcon(name, icon) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const componentCategoryIcons = withCategoryIcon(system.componentCategoryIcons, name, icon);
    await systemManager.updateSystem(sysId, { componentCategoryIcons });
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
    const tags = [...new Set([...(system.itemTags || system.tags || []), lower])];
    await systemManager.updateSystem(sysId, { itemTags: tags });
    await refresh();
  }

  // Cascade delete (issue 689): strip the deleted tag from every component carrying it AND from
  // every recipe tag-placeholder ingredient naming it before dropping it from the vocabulary.
  async function removeTag(tag) {
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    for (const { id, tags: nextTags } of planTagRemovals(_getManagedItems(system), tag)) {
      await systemManager.updateItem(sysId, id, { tags: nextTags });
    }
    const recipes = (recipeManager?.getRecipes?.({ craftingSystemId: sysId }) || []).map(
      (recipe) => (typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe)
    );
    for (const { id, updates } of planRecipeTagRemovals(recipes, tag)) {
      await recipeManager.updateRecipe(id, updates, { allowIncomplete: true, notify: false });
    }
    const tags = (system.itemTags || system.tags || []).filter((t) => t !== tag);
    await systemManager.updateSystem(sysId, { itemTags: tags });
    await refresh();
  }

  // --- Essence management ---

  /** The comparison key for an essence name. */
  function _essenceNameKey(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }

  /**
   * Whether any other essence already carries this name, case-insensitively.
   *
   * @param {string} [ignoreId] the essence being renamed, which cannot collide with itself.
   */
  function _essenceNameTaken(existing, name, ignoreId = '') {
    const key = _essenceNameKey(name);
    return existing.some((def) => def.id !== ignoreId && _essenceNameKey(def.name) === key);
  }

  /**
   * The selected system plus its essence definitions, or `null` when either is missing. Every
   * essence write below opens with the same three reads.
   */
  function _selectedSystemEssences() {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return null;
    const system = systemManager.getSystem(sysId);
    if (!system) return null;
    return {
      systemManager,
      sysId,
      system,
      existing: Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [],
    };
  }

  // `colorToken` is the optional GM-authored per-essence colour (issue 917), a bare `--fab-tag-*`
  // key or null, with palette validation owned by `CraftingSystemManager`.
  async function addEssence(name, description, icon, sourceComponentId, colorToken, extra = {}) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return false;
    const context = _selectedSystemEssences();
    if (!context) return false;
    const { systemManager, sysId, system, existing } = context;

    if (_essenceNameTaken(existing, normalizedName)) {
      services.notify.warn(`Essence "${normalizedName}" already exists in this system.`);
      return false;
    }

    const sourceFields = _sourceFieldsForEssenceSelection(system, sourceComponentId || null);
    const options = extra && typeof extra === 'object' ? extra : {};
    const has = (key) => Object.prototype.hasOwnProperty.call(options, key);
    const essenceDefinitions = [
      ...existing,
      {
        id: crypto.randomUUID(),
        name: normalizedName,
        description: String(description || ''),
        icon: normalizeEssenceIcon(icon || DEFAULT_ESSENCE_ICON),
        colorToken: colorToken || null,
        ...(has('enabled') && { enabled: options.enabled !== false }),
        ...(has('propertyMacroUuid') && { propertyMacroUuid: options.propertyMacroUuid || null }),
        ...sourceFields,
      },
    ];
    await systemManager.updateSystem(sysId, { essenceDefinitions });
    await refresh();
    return true;
  }

  /** The patched definition one `updateEssence` call produces. */
  function _patchedEssenceDefinition(current, updates, system, resolved) {
    const has = (key) => Object.prototype.hasOwnProperty.call(updates, key);
    const next = {
      ...current,
      name: resolved.name,
      description: resolved.description,
      icon: resolved.icon,
    };

    // The authored colour (issue 917) is nullable BY DESIGN, so absence and null are
    // different instructions. Palette validation belongs to `CraftingSystemManager`.
    if (has('colorToken')) next.colorToken = updates.colorToken || null;
    // The enabled state (issue 1036). Written from the editor's Enabled row; the library
    // row toggle and the bulk Status axis go through `setEssenceEnabled` and
    // `applyEssenceBulkEdit` instead, which are ONE manager write each.
    if (has('enabled')) next.enabled = updates.enabled !== false;
    // The essence-scoped property macro (issue 1036). Shape validation belongs to
    // `_normalizeEssenceDefinition`; whether the uuid resolves to a SCRIPT macro is
    // decided at the drop and reported by the editor's Validation tab.
    if (has('propertyMacroUuid')) next.propertyMacroUuid = updates.propertyMacroUuid || null;

    if (!has('sourceComponentId') && !has('sourceItemUuid')) return next;
    return {
      ...next,
      ..._sourceFieldsForEssenceSelection(
        system,
        has('sourceComponentId') ? updates.sourceComponentId || null : null,
        has('sourceItemUuid') ? updates.sourceItemUuid || null : null
      ),
    };
  }

  async function updateEssence(essenceId, updates = {}) {
    if (!essenceId || !updates || typeof updates !== 'object') return false;
    const context = _selectedSystemEssences();
    if (!context) return false;
    const { systemManager, sysId, system, existing } = context;

    const current = existing.find((def) => def.id === essenceId);
    if (!current) return false;

    const hasName = Object.prototype.hasOwnProperty.call(updates, 'name');
    const nextName = String((hasName ? updates.name : current.name) || '').trim();
    if (!nextName) return false;

    if (_essenceNameTaken(existing, nextName, essenceId)) {
      services.notify.warn(`Essence "${nextName}" already exists in this system.`);
      return false;
    }

    const hasDescription = Object.prototype.hasOwnProperty.call(updates, 'description');
    const hasIcon = Object.prototype.hasOwnProperty.call(updates, 'icon');
    const resolved = {
      name: nextName,
      description: String((hasDescription ? updates.description : current.description) || ''),
      icon: normalizeEssenceIcon(hasIcon ? updates.icon : current.icon),
    };

    const essenceDefinitions = existing.map((def) =>
      def.id === essenceId ? _patchedEssenceDefinition(def, updates, system, resolved) : def
    );

    await systemManager.updateSystem(sysId, { essenceDefinitions });
    await refresh();
    return true;
  }

  /**
   * Enable or disable one essence (issue 1036), routed through the manager's set-apply primitive so
   * the row toggle and the bulk Status axis share one path and one
   * `_assertNoAlchemySignatureCollisions` check.
   */
  async function setEssenceEnabled(essenceId, enabled) {
    const idle = { updated: false, invalidatedRecipes: 0 };
    if (!essenceId) return idle;
    const context = _selectedSystemEssences();
    if (!context) return idle;
    const { systemManager, sysId } = context;

    // Counted BEFORE the write, over recipes that are enabled TODAY. Reading it first
    // states that this is a fact about the state the GM is leaving rather than one the
    // write produced — the write does not touch a recipe.
    const invalidatedRecipes =
      enabled === true ? 0 : _enabledRecipesRequiringEssence(sysId, essenceId);

    try {
      const result = await systemManager.applyBulkEditToEssences(sysId, [essenceId], {
        enabled: enabled === true,
      });
      await refresh();
      const updated = Number(result?.updated) > 0;
      if (updated && invalidatedRecipes > 0) {
        services.notify?.warn?.(
          services.localize?.('FABRICATE.Admin.Manager.Essence.DisabledInvalidatesRecipes', {
            count: invalidatedRecipes,
          }) ||
            `${invalidatedRecipes} enabled recipe(s) require this essence and can no longer be re-enabled while it is disabled.`
        );
      }
      return { updated, invalidatedRecipes };
    } catch (error) {
      console.error('Fabricate | Failed to change essence enabled state:', error);
      services.notify?.error?.(error?.message || 'Failed to change essence enabled state');
      return idle;
    }
  }

  /** How many CURRENTLY-ENABLED recipes in the system require the essence. */
  function _enabledRecipesRequiringEssence(sysId, essenceId) {
    const recipes = services.getRecipeManager?.()?.getRecipes({ craftingSystemId: sysId }) || [];
    return recipes.filter(
      (recipe) => recipe?.enabled !== false && recipeReferencesEssence(recipe, essenceId)
    ).length;
  }

  /**
   * Apply one staged bulk edit to a set of essences (issue 1036) through the manager's set-apply
   * primitive: one `craftingSystems` write and one refresh for the whole selection.
   */
  async function applyEssenceBulkEdit(essenceIds, edit = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    const ids = Array.from(essenceIds || [], String).filter(Boolean);
    if (ids.length === 0 || !sysId) return null;
    if (!edit || typeof edit !== 'object') return null;
    if (Object.keys(edit).length === 0) return null;

    try {
      const result = await systemManager.applyBulkEditToEssences(sysId, ids, edit);
      await refresh();
      return {
        updated: Number(result?.updated) || 0,
        essenceIds: Array.isArray(result?.essenceIds) ? result.essenceIds : [],
      };
    } catch (error) {
      console.error('Fabricate | Failed to apply essence bulk edit:', error);
      services.notify?.error?.(error?.message || 'Failed to apply essence bulk edit');
      return null;
    }
  }

  /** The localized copy the singular essence delete dialog reads (issue 1156). */
  function _essenceDeleteDialogContent(name, impact) {
    const components = Number(impact?.componentsAffected) || 0;
    const recipes = Number(impact?.recipeRewrites) || 0;
    const data = { name, components, recipes };
    const [key, fallback] = _essenceDeleteDialogBranch(name, components, recipes);
    const localized = services.localize?.(key, data);
    if (localized && localized !== key) return localized;
    return fallback;
  }

  /** The `[key, englishFallback]` pair for one of the four essence dialog branches. @private */
  function _essenceDeleteDialogBranch(name, components, recipes) {
    const permanence = 'Deleting is permanent — an essence you recreate is a new essence';
    if (components > 0 && recipes > 0) {
      if (recipes === 1) {
        return [
          'FABRICATE.Admin.Manager.Essence.DeleteConfirm.ContentOne',
          `Delete essence ${name}? It will be removed from ${components} component(s), and 1 recipe that requires it will be rewritten. ${permanence}.`,
        ];
      }
      return [
        'FABRICATE.Admin.Manager.Essence.DeleteConfirm.Content',
        `Delete essence ${name}? It will be removed from ${components} component(s), and ${recipes} recipe(s) that require it will be rewritten. ${permanence}.`,
      ];
    }
    if (components > 0) {
      return [
        'FABRICATE.Admin.Manager.Essence.DeleteConfirm.ContentComponents',
        `Delete essence ${name}? It will be removed from ${components} component(s). ${permanence}.`,
      ];
    }
    if (recipes > 0) {
      if (recipes === 1) {
        return [
          'FABRICATE.Admin.Manager.Essence.DeleteConfirm.ContentRecipesOne',
          `Delete essence ${name}? 1 recipe that requires it will be rewritten. ${permanence}.`,
        ];
      }
      return [
        'FABRICATE.Admin.Manager.Essence.DeleteConfirm.ContentRecipes',
        `Delete essence ${name}? ${recipes} recipe(s) that require it will be rewritten. ${permanence}.`,
      ];
    }
    return [
      'FABRICATE.Admin.Manager.Essence.DeleteConfirm.ContentPlain',
      `Delete essence ${name}? ${permanence}.`,
    ];
  }

  /** Delete one essence definition, after asking (issue 1036). */
  async function deleteEssence(essenceId) {
    const context = _selectedSystemEssences();
    if (!context) return false;
    const { systemManager, sysId, system, existing } = context;

    const essence = existing.find((def) => def.id === essenceId);
    if (!essence) return false;

    // The refusal is computed off what the system RESOLVES (issue 1371): this is the statement the GM
    // decides on, and `deleteEssence` strips the essence from every carrying component, so one that
    // carries it only through the world map must be named or the dialog understates the cascade.
    const managedItems = componentsWithResolvedEssences(
      systemManager,
      sysId,
      _getManagedItems(system)
    );
    const recipes = services.getRecipeManager?.()?.getRecipes?.({ craftingSystemId: sysId }) || [];
    const impact = describeEssenceDeleteImpact([
      {
        id: essenceId,
        componentUsageItems: _essenceUsageItems(essenceId, managedItems),
        recipeUsageIds: _essenceRecipeUsage(essenceId, recipes).ids,
      },
    ]);

    const name = String(essence.name || '');
    const confirmed = await services.confirmDialog({
      title:
        services.localize?.('FABRICATE.Admin.Manager.Essence.DeleteConfirm.Title', { name }) ||
        `Delete ${name}?`,
      // Content is issue 1156's builder, which omits zero-count consequences; the buttons are issue
      // 1154's, so the affirmative names the action. The two are orthogonal.
      content: `<p>${_essenceDeleteDialogContent(name, impact)}</p>`,
      ..._deleteConfirmButtons(),
    });
    if (!confirmed) return false;

    const cascade = _essenceDeleteCascade(sysId);
    try {
      await systemManager.deleteEssence(sysId, essenceId, cascade.seam);
    } catch (error) {
      await cascade.rollback();
      throw error;
    }
    await _republishAfterWrite('an essence delete');
    return true;
  }

  /**
   * Delete a set of essence definitions (issue 1036) through the manager's batched primitive: one
   * `craftingSystems` write and one `recipes` write for the whole set.
   */
  async function deleteEssences(essenceIds) {
    const empty = { deleted: 0, recipesUpdated: 0, recipesDisabled: 0 };
    const context = _selectedSystemEssences();
    if (!context) return empty;
    const { systemManager, sysId, existing } = context;

    const requested = new Set(Array.from(essenceIds || [], String).filter(Boolean));
    if (requested.size === 0) return empty;

    const resolved = existing.filter((def) => requested.has(String(def?.id ?? '')));
    if (resolved.length === 0) return empty;

    const cascade = _essenceDeleteCascade(sysId);
    let result;
    try {
      result = await systemManager.deleteEssences(
        sysId,
        resolved.map((def) => String(def.id)),
        cascade.seam
      );
    } catch (error) {
      await cascade.rollback();
      console.error('Fabricate | Failed to delete essences:', error);
      services.notify?.error?.(error?.message || 'Failed to delete essences');
      return empty;
    }
    await _republishAfterWrite('an essence bulk delete');
    return {
      deleted: Number(result?.deleted) || 0,
      recipesUpdated: Number(result?.recipesUpdated) || 0,
      recipesDisabled: Number(result?.recipesDisabled) || 0,
    };
  }

  /** Abandon the essence draft the editor is holding (issue 1036). */
  async function cancelEssenceDraft() {
    await refresh();
    return true;
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
    config.conditions = conditionSettingsToCurrent(nextConditions);
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
    if (setting.values.every((existing) => !(existing.id === option.id)))
      setting.values = [...setting.values, option];
    if (!setting.current) setting.current = option.id;
    config.conditions = conditionSettingsToCurrent(systemConfig.conditions);
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
          updates.label === undefined
            ? option.label
            : String(updates.label || '').trim() || option.label,
        icon: updates.icon === undefined ? option.icon : normalizeEssenceIcon(updates.icon),
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
    if (setting.values.every((option) => !(option.id === setting.current))) {
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
    config.conditions = conditionSettingsToCurrent(systemConfig.conditions);
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
    if (vocabulary.values.every((existing) => !(existing.id === option.id))) {
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
          updates.label === undefined
            ? option.label
            : String(updates.label || '').trim() || option.label,
      };
      if (kind === 'biomes') {
        next.icon = updates.icon === undefined ? option.icon : normalizeEssenceIcon(updates.icon);
        next.colorToken =
          updates.colorToken === undefined
            ? option.colorToken
            : _normalizeBiomeColorToken(updates.colorToken);
        next.customColor =
          updates.customColor === undefined
            ? option.customColor
            : _normalizeCustomHex(updates.customColor);
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
   * Read the selected system's one modifier library (issue 1117), or `null` when the system cannot
   * be resolved. Every write below goes through `updateSystem`, which shallow-merges the top level,
   * so a `modifiers` write replaces the whole array and removing an entry persists with no `-=`
   * key. That is why these ops no longer touch the gathering config: the library is not there.
   */
    /**
     * The world modifier library and the store that owns it (issue 1308). No crafting system is
     * consulted and none needs to be selected: the library is authored once for the world.
     */
  function _modifierContext() {
    const store = _characterLibrariesStore();
    if (!store) return null;
    return { store, library: store.listModifiers?.() ?? [] };
  }

  /** Persist a whole replacement world modifier library and re-project. */
  async function _saveModifierLibrary(store, next) {
    await store.saveModifiers(next);
    await refresh();
  }

  /** Append a new modifier entry to the selected system's library. */
  async function addModifier(partial = {}) {
    const context = _modifierContext();
    if (!context) return null;
    const id = String(partial?.id || _randomID());
    if (context.library.some((entry) => entry.id === id)) return null;
    const entry = _normalizeSystemModifier({
      ...partial,
      id,
      label:
        partial?.label ||
        services.localize?.('FABRICATE.Admin.Manager.Modifiers.NewLabel') ||
        'Modifier',
      icon: partial?.icon || 'fa-solid fa-user',
      expression: partial?.expression || '',
    });
    if (!entry) return null;
    await _saveModifierLibrary(context.store, [...context.library, entry]);
    return entry;
  }

  /**
   * Update one modifier entry by id; updates that fail normalization preserve the prior entry.
   * Returns true when the library changed.
   */
  async function updateModifier(modifierId, updates = {}) {
    const context = _modifierContext();
    if (!context || !modifierId) return false;
    const next = context.library.map((entry) =>
      entry.id === modifierId ? _normalizeSystemModifier({ ...entry, ...updates }) || entry : entry
    );
    if (next.every((entry, index) => entry === context.library[index])) return false;
    await _saveModifierLibrary(context.store, next);
    return true;
  }

  /** Remove one modifier entry by id. */
  async function deleteModifier(modifierId) {
    const context = _modifierContext();
    if (!context || !modifierId) return false;
    const next = context.library.filter((entry) => entry.id !== modifierId);
    if (next.length === context.library.length) return false;
    const confirmedModifier = await _confirmLibraryEntryDelete(
      context.library,
      modifierId,
      'FABRICATE.Admin.Manager.Modifiers.DeleteTitle',
      'FABRICATE.Admin.Manager.Modifiers.DeleteContent'
    );
    if (!confirmedModifier) return false;
    await _saveModifierLibrary(context.store, next);
    return true;
  }

  /**
   * Move one modifier from `fromIndex` to `toIndex` (issue 768); array order is the persisted order.
   */
  async function reorderModifier(fromIndex, toIndex) {
    const context = _modifierContext();
    if (!context) return false;
    const next = _reorderListByIndex(context.library, fromIndex, toIndex);
    if (!next) return false;
    await _saveModifierLibrary(context.store, next);
    return true;
  }

  /**
   * Idempotently seed the active Foundry game system's preset bundle into the world modifier
   * library.
   */
  async function seedModifierPresets() {
    const context = _modifierContext();
    if (!context) return { added: [], skipped: [], unsupported: true };
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
      currentLibrary: context.library,
    });
    await _saveModifierLibrary(
      context.store,
      result.next.map((entry) => _normalizeSystemModifier(entry)).filter(Boolean)
    );
    return { added: result.added, skipped: result.skipped, unsupported: false, foundrySystemId };
  }

  // The default a freshly added reference points at. It reads the ONE library (issue 1117),
  // which since issue 1308 is world scope, so it consults neither the gathering config nor a
  // crafting system.
  function _firstCharacterModifierId() {
    return _modifierContext()?.library?.[0]?.id || '';
  }

  function _updateDropRowOnTask(systemConfig, taskId, rowId, mutate) {
    const taskIndex = systemConfig.tasks.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) return false;
    const task = systemConfig.tasks[taskIndex];
    const rows = Array.isArray(task.dropRows) ? task.dropRows : [];
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    if (rowIndex === -1) return false;
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
   * Add a character modifier reference to one drop row on one library task, defaulting
   * `modifierId` to the system's first library entry so the editor can append a usable row without
   * forcing a picker choice. Returns the normalized reference, or `null` on lookup failure.
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
    const modifierId = String(partial?.modifierId || _firstCharacterModifierId() || '').trim();
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
   * Patch one drop-row character modifier reference in place; patches that fail normalization are
   * rejected and the existing reference is preserved.
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
      if (index === -1) return null;
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

  /** Remove one drop-row character modifier reference by id. */
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
   * Add a character modifier reference to one library event, mirroring the drop-row equivalent.
   * Returns the normalized reference, or `null` on failure.
   */
  async function addGatheringEventCharacterModifier(
    systemId = get(selectedSystemId),
    eventId,
    partial = {}
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !eventId) return null;
    const modifierId = String(partial?.modifierId || _firstCharacterModifierId() || '').trim();
    if (!modifierId) return null;
    const eventIndex = systemConfig.events.findIndex((event) => event.id === eventId);
    if (eventIndex === -1) return null;
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

  /** Patch one event character modifier reference in place. */
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
    if (eventIndex === -1) return false;
    const event = systemConfig.events[eventIndex];
    const refs = Array.isArray(event.characterModifiers) ? event.characterModifiers : [];
    const index = refs.findIndex((ref) => ref.id === refId);
    if (index === -1) return false;
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

  /** Remove one event character modifier reference by id. */
  async function deleteGatheringEventCharacterModifier(
    systemId = get(selectedSystemId),
    eventId,
    refId
  ) {
    const config = _currentGatheringConfig();
    const systemConfig = _gatheringSystemConfig(config, systemId);
    if (!systemConfig || !eventId || !refId) return false;
    const eventIndex = systemConfig.events.findIndex((event) => event.id === eventId);
    if (eventIndex === -1) return false;
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

  // Persist the structured routed crafting check, preserving the rest of the craftingCheck config;
  // the manager normalizes the routed payload on write.
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
      } catch (error) {
        console.error('Fabricate | Failed to strip deleted routed tier ids from recipe:', error);
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

  // Persist the progressive crafting check (roll formula + crit table), preserving the rest of the
  // craftingCheck config. The progressive payload also carries the award settings.
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

  // Live-persist a single failure-consumption policy flag (issue 712). Must spread BOTH the existing
  // craftingCheck block AND its nested `consumption` sub-object, because `updateSystem`
  // shallow-merges only the top level and the normalizer then re-defaults whatever was dropped.
  async function saveCraftingCheckConsumption(patch = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const existing = system.craftingCheck || {};
    await systemManager.updateSystem(sysId, {
      craftingCheck: {
        ...existing,
        consumption: { ...existing.consumption, ...patch },
      },
    });
    await refresh();
  }

  // Live-persist salvage's failure-consumption policy (issue 1098), the twin of
  // `saveCraftingCheckConsumption` and spreading both blocks for the reason it states. One of the
  // normalizer's defaults here is TRUE, so the loss would present as a silent inversion.
  async function saveSalvageCheckConsumption(patch = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const existing = system.salvageCraftingCheck || {};
    await systemManager.updateSystem(sysId, {
      salvageCraftingCheck: {
        ...existing,
        // No `|| {}` fallback: spreading `undefined` in an object literal is already a
        // no-op, and the lint rule that flags the redundant form is one this file is
        // slowly working out of rather than into.
        consumption: { ...existing.consumption, ...patch },
      },
    });
    await refresh();
  }

  // Which system key each activity's check block is persisted under. The modifier LIBRARY is not in
  // here: it is top-level and shared (issues 1095, 1117). Named for the block rather than one of its
  // fields because two savers key on it — the modifier selection and the failure-result policy.
  const CHECK_ACTIVITY_SYSTEM_KEYS = {
    crafting: 'craftingCheck',
    salvage: 'salvageCraftingCheck',
    gathering: 'gatheringCraftingCheck',
  };

  /** Live-persist one activity's failure-result policy (issue 1098). */
  async function saveCheckFailureResultPolicy(activity, policy) {
    const activityKey = CHECK_ACTIVITY_SYSTEM_KEYS[activity];
    if (!activityKey) return;
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    await systemManager.updateSystem(sysId, {
      [activityKey]: {
        ...system[activityKey],
        failureResultPolicy: normalizeFailureResultPolicy(policy),
      },
    });
    await refresh();
  }

  const saveCraftingCheckFailureResultPolicy = (policy) =>
    saveCheckFailureResultPolicy('crafting', policy);
  const saveSalvageCheckFailureResultPolicy = (policy) =>
    saveCheckFailureResultPolicy('salvage', policy);
  const saveGatheringCheckFailureResultPolicy = (policy) =>
    saveCheckFailureResultPolicy('gathering', policy);

  // Persist one activity's check-modifier SELECTION (issues 770, 1055, 1095, 1117).
  async function saveCheckModifiers(activity, patch = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const activityKey = CHECK_ACTIVITY_SYSTEM_KEYS[activity];
    if (!activityKey || Object.keys(patch).length === 0) return;
    await systemManager.updateSystem(sysId, {
      [activityKey]: { ...system[activityKey], ...patch },
    });
    await refresh();
  }

  const saveCraftingCheckModifiers = (patch) => saveCheckModifiers('crafting', patch);
  const saveSalvageCheckModifiers = (patch) => saveCheckModifiers('salvage', patch);
  const saveGatheringCheckModifiers = (patch) => saveCheckModifiers('gathering', patch);

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

  // Shallow-merge a patch into the selected system's gatheringCraftingCheck and persist; the manager
  // normalizes the whole check on write. Shared by every gathering check saver below. The gathering
  // check is system-level, not per task, and d100 mode has no editable config.
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

  const saveGatheringCheckActive = (enabled) =>
    _saveGatheringCheckPatch({ enabled: enabled === true });
  const saveGatheringCheckProgressive = (progressive) => _saveGatheringCheckPatch({ progressive });
  const saveGatheringCheckRouted = (routed) => _saveGatheringCheckPatch({ routed });

  // Currency is WORLD scope (issue 1278): a world runs exactly one Foundry game system and so has
  // exactly one way actors store coins.

  async function _updateCurrencyConfig(mutate) {
    const store = services.getCurrencyConfigStore?.();
    if (!store) return false;

    const currency = normalizeWorldCurrencyConfig(store.get(), { randomID: _randomID });
    const result = await mutate(currency);
    if (result === false) return false;

    await store.save(currency);
    await refresh();
    return result ?? true;
  }

  async function addCurrencyUnit(partial = {}) {
    return await _updateCurrencyConfig((currency) => {
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

  async function updateCurrencyUnit(unitId, updates = {}) {
    return await _updateCurrencyConfig((currency) => {
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

  async function deleteCurrencyUnit(unitId) {
    return await _updateCurrencyConfig((currency) => {
      const nextUnits = _deleteCurrencyUnitFromList(currency.units, unitId);
      if (!nextUnits) return false;
      currency.units = nextUnits;
      return true;
    });
  }

  /**
   * Move one currency unit from `fromIndex` to `toIndex` (issue 768); array order is the persisted
   * order. Takes no system id, because the ladder is world scope.
   */
  async function reorderCurrencyUnit(fromIndex, toIndex) {
    return await _updateCurrencyConfig((currency) => {
      const next = _reorderListByIndex(currency.units, fromIndex, toIndex);
      if (!next) return false;
      currency.units = next;
      return true;
    });
  }

  async function addCurrencySubUnit(parentUnitId, subUnitId, amount = 1) {
    return await _updateCurrencyConfig((currency) => {
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

  async function updateCurrencySubUnit(parentUnitId, subUnitId, amount) {
    return await _updateCurrencyConfig((currency) => {
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

  async function deleteCurrencySubUnit(parentUnitId, subUnitId) {
    return await _updateCurrencyConfig((currency) => {
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

  // Provider inventory mode means "use the system's coins": the provider owns the denomination
  // ladder, so `config.units` is overwritten with its canonical units and re-normalized, keeping
  // the engine's affordability math aligned.
  function _applyProviderCanonicalUnits(currency) {
    const normalizedCanonical = getProviderCanonicalUnits(currency.providerId)
      .map((unit) => normalizeCurrencyUnit(unit, _randomID))
      .filter(Boolean);
    if (normalizedCanonical.length === 0) return;
    currency.units = normalizedCanonical;
  }

  async function setCurrencySpendStrategy(spendStrategy) {
    const nextStrategy = ['actorInventory', 'macro'].includes(spendStrategy)
      ? spendStrategy
      : 'actorProperty';
    return await _updateCurrencyConfig((currency) => {
      currency.spendStrategy = nextStrategy;
      // Switching to actorInventory seeds a default providerId and syncs the provider's canonical units,
      // guarded so a no-provider system never wipes the GM's. Switching to macro leaves them in place,
      // because macros own conversion by abbreviation.
      if (nextStrategy === 'actorInventory') {
        if (!currency.providerId) {
          currency.providerId = getDefaultProviderId(_foundrySystemId());
        }
        _applyProviderCanonicalUnits(currency);
      }
      return true;
    });
  }

  async function setCurrencyProvider(providerId) {
    return await _updateCurrencyConfig((currency) => {
      currency.providerId = String(providerId || '').trim();
      // Selecting a provider adopts its canonical units under the actorInventory strategy; under
      // other strategies the providerId is inert and user-managed units stay untouched.
      if (currency.spendStrategy === 'actorInventory') {
        _applyProviderCanonicalUnits(currency);
      }
      return true;
    });
  }

  async function setCurrencyMacro(key, uuid) {
    if (!CURRENCY_MACRO_KEYS.includes(key)) return false;
    return await _updateCurrencyConfig((currency) => {
      currency.macros = { ...currency.macros, [key]: String(uuid || '').trim() };
      return true;
    });
  }

  async function clearCurrencyMacro(key) {
    return await setCurrencyMacro(key, '');
  }

  async function seedCurrencyUnitPresets() {
    const foundrySystemId =
      typeof services.getFoundrySystemId === 'function'
        ? String(services.getFoundrySystemId() || '')
        : '';
    const presets = getCurrencyPresetsForFoundrySystem(foundrySystemId);
    if (!presets || presets.length === 0) {
      return { added: [], skipped: [], unsupported: true, foundrySystemId };
    }
    return await _updateCurrencyConfig((currency) => {
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

  // Live-set only the system-level alchemy check mode from the Recipe Resolution sub-section. Must
  // spread the nested alchemy block: `updateSystem` shallow-merges the top level, so a naive
  // `{ alchemy: { checkMode } }` would silently re-default its three siblings.
  async function setAlchemyCheckMode(checkMode) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    const system = systemManager.getSystem(sysId);
    if (!system) return;
    const next = ['none', 'simple', 'tiered'].includes(checkMode) ? checkMode : 'none';
    await systemManager.updateSystem(sysId, {
      alchemy: { ...system.alchemy, checkMode: next },
    });
    await refresh();
  }

  // Live-apply a per-recipe-item caps patch (issue 511). The Books & Scrolls per-item page calls
  // this with single-field patches and the manager merges the rest from the persisted definition,
  // so the surface stages no dirty draft.
  async function updateRecipeItemCaps(recipeItemId, capsPatch = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId || !recipeItemId) return;
    await systemManager.updateRecipeItemDefinition(sysId, recipeItemId, { caps: capsPatch });
    await refresh();
  }

  // Set which books/scrolls a recipe belongs to from the recipe side (issue 511, many-to-many),
  // reconciling each definition's `recipeIds` so the recipe is a member of exactly `bookIds`. Writes
  // only the definitions that actually change, then refreshes.
  async function setRecipeBookMembership(recipeId, bookIds = []) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId || !recipeId) return;
    const rid = String(recipeId);
    const wanted = new Set((Array.isArray(bookIds) ? bookIds : []).map(String));
    const system = systemManager.getSystem?.(sysId);
    const definitions = Array.isArray(system?.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    let changed = false;
    for (const def of definitions) {
      const currentIds = (Array.isArray(def.recipeIds) ? def.recipeIds : []).map(String);
      const has = currentIds.includes(rid);
      const want = wanted.has(String(def.id));
      if (has === want) continue;
      const next = want
        ? [...new Set([...currentIds, rid])]
        : currentIds.filter((id) => id !== rid);
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
    await systemManager.updateRecipeItemDefinition(sysId, recipeItemId, {
      enabled: enabled !== false,
    });
    await refresh();
  }

  // Persist the full recipe-item editor draft in one call (issue 511). The router owns the draft and
  // passes the complete snapshot; refreshes projections on success.
  async function saveRecipeItem(recipeItemId, patch = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId || !recipeItemId) return false;
    try {
      await systemManager.updateRecipeItemDefinition(sysId, recipeItemId, patch);
      await refresh();
      return true;
    } catch (error) {
      console.error('Fabricate | Failed to save recipe item:', error);
      services.notify?.error?.(error?.message || 'Failed to save recipe item');
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
      title:
        services.localize?.('FABRICATE.Admin.Manager.RecipeItem.DeleteTitle') ||
        'Delete recipe item?',
      content: `<p>${services.localize?.('FABRICATE.Admin.Manager.RecipeItem.DeleteContent') || 'Delete this recipe item? Recipes linked to it will be unlinked.'}</p>`,
      ..._deleteConfirmButtons(),
    });
    if (!confirmed) return false;
    try {
      await systemManager.deleteRecipeItemDefinition(sysId, recipeItemId);
      await refresh();
      return true;
    } catch (error) {
      console.error('Fabricate | Failed to delete recipe item:', error);
      services.notify?.error?.(error?.message || 'Failed to delete recipe item');
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
    } catch (error) {
      console.error('Fabricate | Failed to create recipe:', error);
      services.notify?.error?.(
        localizeRecipePersistenceError(error, services.localize) ||
          error?.message ||
          'Failed to create recipe'
      );
      return null;
    }
  }

  /**
   * What deleting this set of recipes would do (issue 1132) — the impact statement the bulk panel
   * renders before the GM arms the control, counted through `describeRecipeDeleteImpact`, the same
   * leaf the write executes through, so the stated numbers cannot drift from the performed ones.
   */
  function describeRecipeDelete(recipeIds) {
    return _describeRecipeDeleteIn(get(selectedSystemId), recipeIds);
  }

  /**
   * The body of {@link describeRecipeDelete}, against a named system rather than the selected one:
   * the singular delete prunes against the recipe's own `craftingSystemId`, so it must state the
   * impact against that system or report zero consequences for a real cascade. @private
   */
  function _describeRecipeDeleteIn(sysId, recipeIds) {
    const empty = {
      deletable: 0,
      deletableIds: [],
      recipeItemsAffected: 0,
      recipeItemIds: [],
      learnersAffected: 0,
      learnerIds: [],
    };
    if (!sysId) return empty;

    const system = services.getCraftingSystemManager?.()?.getSystem?.(sysId);
    if (!system) return empty;

    return describeRecipeDeleteImpact(recipeIds, {
      recipes: _selectedSystemRecipes(sysId),
      recipeItemDefinitions: system.recipeItemDefinitions,
      membershipResolvesByRecipeIds: system.membershipResolvesByRecipeIds,
      // The CACHED index, rebuilt only when an actor write has marked it stale. The panel
      // re-derives on every tick of a checkbox, and a world walk per tick is the thing this
      // cache exists to prevent.
      learnerIndex: _learnedRecipeIndex(),
    });
  }

  /**
   * The localized copy the singular delete dialog reads, from the same describer the bulk card
   * reads (issue 1132).
   */
  function _recipeDeleteDialogContent(name, impact) {
    const items = Number(impact?.recipeItemsAffected) || 0;
    const learners = Number(impact?.learnersAffected) || 0;
    const data = { name, items, learners };
    const [key, fallback] = _recipeDeleteDialogBranch(name, items, learners);
    const localized = services.localize?.(key, data);
    if (localized && localized !== key) return localized;
    return fallback;
  }

  /** The `[key, englishFallback]` pair for one of the four dialog branches. @private */
  function _recipeDeleteDialogBranch(name, items, learners) {
    const permanence = 'Deleting is permanent — a recipe you recreate is a new recipe';
    if (items > 0 && learners > 0) {
      return [
        'FABRICATE.Admin.Manager.Recipe.DeleteConfirm.Content',
        `Delete recipe ${name}? It will be removed from ${items} of your books & scrolls and forgotten by ${learners} character(s). ${permanence}, and a character does not get their learn slot back.`,
      ];
    }
    if (items > 0) {
      return [
        'FABRICATE.Admin.Manager.Recipe.DeleteConfirm.ContentItems',
        `Delete recipe ${name}? It will be removed from ${items} of your books & scrolls. ${permanence}.`,
      ];
    }
    if (learners > 0) {
      return [
        'FABRICATE.Admin.Manager.Recipe.DeleteConfirm.ContentLearners',
        `Delete recipe ${name}? It will be forgotten by ${learners} character(s). ${permanence}, and a character does not get their learn slot back.`,
      ];
    }
    return [
      'FABRICATE.Admin.Manager.Recipe.DeleteConfirm.ContentPlain',
      `Delete recipe ${name}? ${permanence}.`,
    ];
  }

  /** The studio's singular recipe delete. */
  async function deleteRecipe(recipeId) {
    const recipeManager = services.getRecipeManager();
    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) return false;

    const name = String(recipe.name || '');
    // The recipe is the authority on which system it belongs to; the selection is only the
    // fallback.
    const sysId = String(recipe.craftingSystemId || '') || get(selectedSystemId) || '';
    const impact = _describeRecipeDeleteIn(sysId, [recipeId]);
    const confirmed = await services.confirmDialog({
      window: {
        title:
          services.localize?.('FABRICATE.Admin.Manager.Recipe.DeleteConfirm.Title', { name }) ||
          `Delete ${name}?`,
      },
      content: `<p>${_recipeDeleteDialogContent(name, impact)}</p>`,
      yes: {
        label:
          services.localize?.('FABRICATE.Admin.Manager.Recipe.DeleteConfirm.Confirm') || 'Delete',
        callback: () => true,
      },
      no: { callback: () => false },
    });
    if (!confirmed) return false;

    await services.getCraftingSystemManager().deleteRecipes(sysId, [recipeId]);
    await refresh();
    return true;
  }

  /** Tell the GM that a delete they authorised reached nothing. */
  function _notifyRecipeDeleteReachedNothing() {
    services.notify?.warn?.(
      services.localize?.('FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteNothing') ||
        'Nothing was deleted — the selected recipes are no longer in this system.'
    );
  }

  /**
   * Delete a set of recipes (issue 1132) through the manager's batched primitive: at most one
   * `recipes` write, at most one `craftingSystems` write and one actor-flag clean-up for the set.
   *
   * @returns {Promise<object>} the zero result on every no-write path, INCLUDING a failed write —
   * the caller distinguishes them by `deleted`, never by truthiness.
   */
  async function deleteRecipes(recipeIds) {
    const empty = {
      deleted: 0,
      recipeIds: [],
      recipeItemsAffected: 0,
      recipeItemsRewritten: 0,
      learnersAffected: 0,
    };
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return empty;

    // Resolved against the recipe map first, exactly as the describer resolves them, so a
    // stale selected id cannot reach the write and cannot inflate what is reported.
    const impact = describeRecipeDelete(recipeIds);
    if (impact.deletable === 0) {
      _notifyRecipeDeleteReachedNothing();
      return empty;
    }

    try {
      const result = await systemManager.deleteRecipes(sysId, impact.deletableIds, {
        notify: false,
      });
      await refresh();
      const deleted = Number(result?.deleted) || 0;
      if (deleted === 0) _notifyRecipeDeleteReachedNothing();
      return {
        deleted,
        recipeIds: Array.isArray(result?.recipeIds) ? result.recipeIds : [],
        recipeItemsAffected: Number(result?.recipeItemsAffected) || 0,
        recipeItemsRewritten: Number(result?.recipeItemsRewritten) || 0,
        learnersAffected: Number(result?.learnersAffected) || 0,
      };
    } catch (error) {
      // The write genuinely throws for a caller whose `SETTINGS_MODIFY` has been revoked, so this path is
      // reachable and must not be silent: the GM sees the error and the card returns to idle.
      console.error('Fabricate | Failed to delete recipes:', error);
      services.notify?.error?.(
        services.localize?.('FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteFailed') ||
          error?.message ||
          'Failed to delete recipes'
      );
      return empty;
    }
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
    } catch (error) {
      console.error('Fabricate | Failed to duplicate recipe:', error);
      services.notify?.error?.(
        localizeRecipePersistenceError(error, services.localize) ||
          error?.message ||
          'Failed to duplicate recipe'
      );
      return false;
    }
  }

  /** Enable / disable a recipe. */
  async function toggleRecipeEnabled(recipeId, enabled, options = {}) {
    const recipeManager = services.getRecipeManager();

    try {
      // notify:false — the toggle is the GM's own explicit editor action with immediate
      // visual feedback, so the "Recipe updated" toast is noise.
      await recipeManager.updateRecipe(
        recipeId,
        { enabled },
        { allowIncomplete: true, notify: false }
      );
      await refresh();
      return true;
    } catch (error) {
      console.error('Fabricate | Failed to toggle recipe enabled state:', error);
      // An enable/save failure is surfaced as a localized, id-free message:
      // RecipeActivationError (enable, issue 550) or RecipePersistenceError (save,
      // issue 595) each carry coded issues the localizer maps to lang copy.
      const message =
        localizeRecipeActivationError(error, services.localize) ||
        localizeRecipePersistenceError(error, services.localize) ||
        error?.message ||
        'Failed to update recipe';

      // The sink is handed the one-line message and, for an activation error, the same refusal as a
      // `{ title, detail }` pair (issue 1515), which the recipe library draws in a `<Notice>`. Every
      // other caller keeps taking the single string, so this is additive rather than a swap.
      if (typeof options?.onBlocked === 'function') {
        options.onBlocked(message, localizeRecipeActivationParts(error, services.localize));
      } else services.notify?.error?.(message);
      return false;
    }
  }

  /**
   * Lock / unlock a recipe: it stays visible to players but only a GM can craft it
   * (`CraftingEngine.guardCraftStart`).
   */
  async function toggleRecipeLocked(recipeId, locked) {
    const recipeManager = services.getRecipeManager();

    try {
      // notify:false — same as the enabled toggle: an explicit editor action with
      // immediate visual feedback needs no "Recipe updated" toast.
      await recipeManager.updateRecipe(
        recipeId,
        { locked: locked === true },
        { allowIncomplete: true, notify: false }
      );
      await refresh();
      return true;
    } catch (error) {
      console.error('Fabricate | Failed to toggle recipe locked state:', error);
      services.notify?.error?.(
        localizeRecipePersistenceError(error, services.localize) ||
          error?.message ||
          'Failed to update recipe'
      );
      return false;
    }
  }

  /**
   * The player-character roster for the Access tab, through the injected service so the store never
   * touches `game.*`.
   */
  function getPcRoster() {
    return services.getPlayerCharacterActors?.() || [];
  }

  /** Persist a recipe's full access grant. */
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
    } catch (error) {
      console.error('Fabricate | Failed to save recipe access:', error);
      services.notify?.error?.(
        localizeRecipePersistenceError(error, services.localize) ||
          error?.message ||
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

    // This store derives the recipe-item fields onto every projected row and the editor saves a whole
    // row, so this store also strips them on the way back out (issue 978): the projection's producer
    // owns its write boundary. Stripping here rather than in the editor keeps the draft displaying them.
    const modelUpdates = withoutDerivedRecipeProjectionFields(updates);
    // A payload that was ONLY derived fields has nothing left to author.
    if (Object.keys(modelUpdates).length === 0) return true;

    try {
      // The recipe editor only edits identity and the linked recipe item, so `allowIncomplete` keeps a
      // shell's identity-only saves from being blocked by completeness validation. `notify` defaults on;
      // step authoring passes `notify: false` to avoid a toast per committed edit.
      await recipeManager.updateRecipe(recipeId, modelUpdates, {
        allowIncomplete: true,
        notify: options.notify !== false,
      });
      await refresh();
      return true;
    } catch (error) {
      console.error('Fabricate | Failed to update recipe:', error);
      // A save that flips a recipe to enabled can fail activation (issue 550); an
      // ordinary save can fail structural/reference validation (issue 595). Localize
      // either rather than surfacing the raw, id-leaking aggregate.
      services.notify?.error?.(
        localizeRecipeActivationError(error, services.localize) ||
          localizeRecipePersistenceError(error, services.localize) ||
          error?.message ||
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
    } catch (error) {
      console.error('Fabricate | Failed to add recipe item:', error);
      services.notify?.error?.(error?.message || 'Failed to add recipe item');
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
    // The world currency ladder rides along too (issue 1278). It is world scope, so unlike the
    // gathering slice there is nothing on the system to fall back on: omit it and every currency cost
    // lands in the destination world as an unresolvable unit id.
    const currencyConfig = services.getCurrencyConfigStore?.()?.get?.() || {};
    // And the world realm library (issue 1282), for the same reason.
    const travelConfig = services.getGatheringRealmStore?.()?.get?.() || {};
    // And the world character libraries (issue 1308), for the same reason and with the same
    // consequence.
    const characterLibraries = services.getCharacterLibrariesStore?.()?.get?.() || {};
    // And the three WORLD-SCOPE ENTITY settings (issue 1364), membership-filtered by the exporter
    // to this system. Omitting one exports an empty world roster, empty world defaults and no
    // membership records, so the destination's world corpus learns nothing about the system.
    const componentScope = services.getComponentScopeStore?.()?.get?.() || {};
    const essenceScope = services.getEssenceScopeStore?.()?.get?.() || {};
    const toolScope = services.getToolScopeStore?.()?.get?.() || {};
    const payload = buildExportPayload(
      system,
      recipes,
      version,
      gatheringEnvironments,
      gatheringConfig,
      currencyConfig,
      travelConfig,
      characterLibraries,
      componentScope,
      essenceScope,
      toolScope
    );
    const filename = makeExportFilename(system.name);
    const json = JSON.stringify(payload, null, 2);
    await services.downloadFile(json, filename);
    services.notify.info(`Exported "${system.name}" (${recipes.length} recipes).`);
  }

  // Resolves to the post-import report content when an import ran to completion, and to `null`
  // otherwise (cancelled, failed, or an existing system skipped). The manager root renders it in
  // `ImportReportModal` (issue 877).
  async function importSystem() {
    return (await services.renderSystemImportDialog()) ?? null;
  }

  // --- Item/Component management ---

  /** The selected system's recipes, for the component delete-impact arithmetic (issue 1129). */
  function _selectedSystemRecipes(sysId) {
    return services.getRecipeManager?.()?.getRecipes?.({ craftingSystemId: sysId }) || [];
  }

  /**
   * What deleting this set of components would do, over the selected system's recipes (issue 1129).
   */
  function describeComponentDelete(componentIds) {
    const sysId = get(selectedSystemId);
    const empty = { deletable: 0, deletableIds: [], recipesRewritten: 0, recipesDisabled: 0 };
    if (!sysId) return empty;

    const system = services.getCraftingSystemManager().getSystem(sysId);
    if (!system) return empty;

    const known = new Set(_getManagedItems(system).map((item) => String(item?.id ?? '')));
    const resolved = Array.from(componentIds || [], String).filter((id) => known.has(id));
    if (resolved.length === 0) return empty;

    return describeComponentDeleteImpact(resolved, _selectedSystemRecipes(sysId));
  }

  /** The localized copy the singular component delete dialog reads (issue 1156). */
  function _componentDeleteDialogContent(name, impact) {
    const recipes = Number(impact?.recipesRewritten) || 0;
    const disabled = Number(impact?.recipesDisabled) || 0;
    const data = { name, recipes, disabled };
    const [key, fallback] = _componentDeleteDialogBranch(name, recipes, disabled);
    const localized = services.localize?.(key, data);
    if (localized && localized !== key) return localized;
    return fallback;
  }

  /** The `[key, englishFallback]` pair for one of the three component dialog branches. @private */
  function _componentDeleteDialogBranch(name, recipes, disabled) {
    const permanence = 'Deleting is permanent — a component you recreate is a new component';
    if (recipes > 0 && disabled > 0) {
      if (disabled === 1) {
        return [
          'FABRICATE.Admin.Manager.Component.DeleteConfirm.ContentDisabledOne',
          `Delete component ${name}? ${recipes} recipe(s) will be rewritten, and 1 of those recipes is enabled today and will be disabled. ${permanence}.`,
        ];
      }
      return [
        'FABRICATE.Admin.Manager.Component.DeleteConfirm.Content',
        `Delete component ${name}? ${recipes} recipe(s) will be rewritten, and ${disabled} of those recipes are enabled today and will be disabled. ${permanence}.`,
      ];
    }
    if (recipes > 0) {
      return [
        'FABRICATE.Admin.Manager.Component.DeleteConfirm.ContentRecipes',
        `Delete component ${name}? ${recipes} recipe(s) will be rewritten. ${permanence}.`,
      ];
    }
    return [
      'FABRICATE.Admin.Manager.Component.DeleteConfirm.ContentPlain',
      `Delete component ${name}? ${permanence}.`,
    ];
  }

  async function deleteComponent(itemId) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!itemId || !sysId) return;
    const system = systemManager.getSystem(sysId);
    const item = _getManagedItems(system).find((i) => i.id === itemId);
    if (!item) return;

    // The singular dialog states the same arithmetic the bulk panel states, from the same
    // describer — before issue 1129 it was hardcoded English that named no numbers at all
    // and simply said "and remove it from recipes".
    const name = String(item.name || '');
    const impact = describeComponentDelete([itemId]);
    const confirmed = await services.confirmDialog({
      title:
        services.localize?.('FABRICATE.Admin.Manager.Component.DeleteConfirm.Title', { name }) ||
        `Delete ${name}?`,
      // As above: issue 1156's zero-omitting content, issue 1154's named affirmative
      // button.
      content: `<p>${_componentDeleteDialogContent(name, impact)}</p>`,
      ..._deleteConfirmButtons(),
    });
    if (!confirmed) return;

    await systemManager.deleteItem(sysId, itemId);
    await refresh();
  }

  /**
   * Delete a set of components (issue 1129) through the manager's batched primitive: one
   * `craftingSystems` write and one `recipes` write for the whole set.
   */
  async function deleteComponents(componentIds) {
    const empty = { deleted: 0, recipesUpdated: 0, recipesDisabled: 0 };
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return empty;

    const system = systemManager.getSystem(sysId);
    if (!system) return empty;

    const requested = new Set(Array.from(componentIds || [], String).filter(Boolean));
    if (requested.size === 0) return empty;

    const resolved = _getManagedItems(system)
      .map((item) => String(item?.id ?? ''))
      .filter((id) => requested.has(id));
    if (resolved.length === 0) return empty;

    try {
      const result = await systemManager.deleteComponents(sysId, resolved);
      await refresh();
      return {
        deleted: Number(result?.deleted) || 0,
        recipesUpdated: Number(result?.recipesUpdated) || 0,
        recipesDisabled: Number(result?.recipesDisabled) || 0,
      };
    } catch (error) {
      console.error('Fabricate | Failed to delete components:', error);
      services.notify?.error?.(error?.message || 'Failed to delete components');
      return empty;
    }
  }

  /** Write one component's authored fields in the selected system. */
  async function updateComponent(itemId, updates = {}, { baseline } = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!itemId || !sysId) return false;
    if (!updates || typeof updates !== 'object') return false;
    if (Object.keys(updates).length === 0) return true;

    // A SYSTEM-SCOPE ESSENCE WRITE IS AN OVERRIDE (issue 1371 r19-store2). See
    // `componentEssenceOverride`'s `updatesFor`: the flag moves first, an untouched restatement of
    // the editor's own baseline writes nothing, and a refused flag write refuses the save.
    const { staged, flipped } = await _componentEssenceOverride.updatesFor(
      sysId,
      String(itemId),
      updates,
      { baseline }
    );
    if (staged === null) return false;
    if (Object.keys(staged).length === 0) return true;

    try {
      await systemManager.updateItem(sysId, itemId, staged);
    } catch (error) {
      // The switch this call flipped goes back (round 6, finding 5): the values did not land, so
      // leaving the pair overriding with its dormant map would silently take it out of every later
      // world edit's reach.
      await _componentEssenceOverride.rollback(sysId, flipped);
      console.error('Fabricate | Failed to update component:', error);
      services.notify?.error?.(error?.message || 'Failed to update component');
      return false;
    }
    // And the republish is outside the catch (issue 1371), which compensates on the precondition "the
    // values did not land": `refresh()` is a large projection walk that runs after they landed, so a
    // throw there used to roll the switch back over an override that is durably on disk.
    await _republishAfterWrite('a component update');
    return true;
  }

  /**
   * Apply one staged bulk edit to a set of components in the selected system (issue 772) through
   * the manager's set-apply primitive: one persist and one refresh for the whole selection.
   */
  async function applyComponentBulkEdit(componentIds, edit = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    const ids = Array.from(componentIds || [], String).filter(Boolean);
    if (ids.length === 0 || !sysId) return null;
    if (!edit || typeof edit !== 'object') return null;
    if (Object.keys(edit).length === 0) return null;

    // A system-scope essence write is an override (issue 1371): every shadowed pair in the cohort has
    // its switch flipped first, and a pair whose flag write is refused loses its essence axis and
    // keeps every other one rather than dropping out of the edit entirely.
    const { writable, refused, flipped } = await _componentEssenceOverride.cohortFor(
      sysId,
      ids,
      edit
    );

    let result;
    try {
      result = await _writeComponentCohorts(systemManager, sysId, { writable, refused, edit });
    } catch (error) {
      await _componentEssenceOverride.rollback(sysId, flipped);
      console.error('Fabricate | Failed to apply component bulk edit:', error);
      services.notify?.error?.(error?.message || 'Failed to apply component bulk edit');
      return null;
    }
    if (!result) return null;
    // The republish is outside the compensated region, for `updateComponent`'s reason.
    await _republishAfterWrite('a component bulk edit');
    return { ...result, refused: refused.length };
  }

  /**
   * Apply one staged bulk edit to a set of recipes in the selected system (issue 1010): at most one
   * `recipes` write, at most one `craftingSystems` write, and one refresh.
   */
  async function applyRecipeBulkEdit(recipeIds, edit = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    const ids = Array.from(recipeIds || [], String).filter(Boolean);
    if (ids.length === 0 || !sysId) return null;
    if (!edit || typeof edit !== 'object') return null;
    if (Object.keys(edit).length === 0) return null;

    try {
      const result = await systemManager.applyBulkEditToRecipes(sysId, ids, edit);
      await refresh();
      return _normalizeBulkRecipeEditResult(result);
    } catch (error) {
      console.error('Fabricate | Failed to apply recipe bulk edit:', error);
      // The batch fails as a whole through the same two coded error classes the
      // single-recipe writes raise, so reuse their localizers: the GM gets the coded,
      // id-free copy rather than a raw English aggregate naming internal ids.
      services.notify?.error?.(
        localizeRecipeActivationError(error, services.localize) ||
          localizeRecipePersistenceError(error, services.localize) ||
          error?.message ||
          'Failed to apply recipe bulk edit'
      );
      return null;
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
    knowledgeRefreshScheduled = false;
    knowledgeActive = false;
    _clearKnowledgeCache();
    // The graph index retains the whole recipe corpus's component sets (issue 1082); a closed
    // manager must not keep them alive alongside the knowledge snapshot.
    graphIndexCache = null;
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
    confirmDiscardDirtyToolEntryDraft,
    confirmDiscardDirtySystemDetailsDraft,
    confirmDiscardDirtyChecksDraft,
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
    setCategoryIcon,
    addComponentCategory,
    removeComponentCategory,
    setComponentCategoryIcon,
    addTag,
    removeTag,
    addEssence,
    updateEssence,
    setEssenceEnabled,
    applyEssenceBulkEdit,
    // Singular and plural share one verb (issue 1036): `removeEssence` is gone, not
    // aliased. An alias would leave two names for one write in a file this size, and the
    // rename is the point — `deleteEssence`/`deleteEssences` read as a pair.
    deleteEssence,
    deleteEssences,
    cancelEssenceDraft,
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
    createToolDraft,
    // The id minter, exposed (issue 1373): a world-scope create needs an id and `worldScopeActions`
    // refuses to mint one, reading no Foundry global by design. A fourth hand-rolled copy of this
    // ladder in the root would reach the `Math.random()` rung SonarCloud fails as S2245.
    randomID: _randomID,
    openToolDraft,
    getActorRollData,
    setToolSectionInherited,
    removeToolFromSystem,
    patchToolDraft,
    stageToolDraftSource,
    unlinkToolDraftSource,
    discardToolDraft,
    deleteToolDraft,
    toggleToolEnabled,
    enterToolsDraft,
    updateToolsDraft,
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
    addModifier,
    updateModifier,
    deleteModifier,
    reorderModifier,
    seedModifierPresets,
    addCharacterPrerequisite,
    updateCharacterPrerequisite,
    deleteCharacterPrerequisite,
    reorderCharacterPrerequisite,
    seedPrerequisitePresets,
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
    saveCraftingCheckConsumption,
    saveSalvageCheckConsumption,
    saveCraftingCheckFailureResultPolicy,
    saveSalvageCheckFailureResultPolicy,
    saveGatheringCheckFailureResultPolicy,
    saveCraftingCheckModifiers,
    saveSalvageCheckModifiers,
    saveGatheringCheckModifiers,
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
    reorderCurrencyUnit,
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
    deleteRecipes,
    describeRecipeDelete,
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
    deleteComponents,
    describeComponentDelete,
    updateComponent,
    applyComponentBulkEdit,
    applyRecipeBulkEdit,
    setRecipeSearch,
    setItemSearch,
    clearLibrarySearches,
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
    setGatheringRealmsEnabled,
    // --- GM Knowledge surface (issue 785) ---
    setKnowledgeActive,
    refreshKnowledge,
    scheduleKnowledgeRefresh,
    markLearnedRecipeIndexStale,
    selectKnowledgeActor,
    expendRecipeItemUse,
    deleteOwnedRecipeItem,
    eraseLearnedRecipe,
    resetActorSystemKnowledge,
    resetActorAllKnowledge,
    // World scope: components, essences and tools (issue 1362). The key set is part of the contract —
    // `setEnabled` is absent on `worldScope.component`, and `setWorldTags` / `setMutedTags` exist only
    // there. `tool.addToSystem` is `adoptWorldTool` rather than the raw world-scope write; see there.
    worldScope: worldScopeApi,
    refresh,
    refreshGatheringConfig,
    refreshAccessRosters,
    resolveRecipeAccess,
    destroy,
  };
}

export {
  withoutDerivedRecipeProjectionFields,
  DERIVED_RECIPE_PROJECTION_FIELDS,
} from './adminRecipeRowProjection.js';
