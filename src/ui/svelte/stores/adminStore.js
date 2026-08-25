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
} from '../../../systems/currencyProfile.js';
import {
  authoredCheckModifierIds,
  isRollExpression,
  resolveModifierBounds,
} from '../../../systems/checkModifierResolver.js';
import { validateDropRows } from '../../../systems/GatheringEnvironmentStore.js';
import { evaluateEnvironmentMatch } from '../../../systems/gatheringMatch.js';
import { normalizeNodeConfig, normalizeNodeRuntime } from '../../../systems/gatheringNodeConfig.js';
import { Tool } from '../../../models/Tool.js';
import { classifyModeChange } from '../../../migration/migrateRecipeForModeChange.js';
import { DEFAULT_GATHERING_EVENT_IMG } from '../../../gatheringImageDefaults.js';
import { DEFAULT_GATHERING_TASK_IMG } from '../../gatheringTaskDefaults.js';
import { evaluateSystemValidation } from '../../../systems/systemValidation.js';
import {
  localizeRecipeActivationError,
  localizeRecipePersistenceError,
} from '../../../utils/recipeActivationMessages.js';
import { resolveRecipeAccessRoster } from '../../../utils/recipeAccessRoster.js';
import { authoredFailureOutcome } from '../../../utils/gatheringFailureOutcome.js';
import {
  activityFailureResultPolicy,
  normalizeFailureResultPolicy,
} from '../../../utils/failureResultPolicy.js';
import { REVISION_SCOPES } from '../../../systems/revisionTokens.js';
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

// The GM browser projection (issue 1090). Row, card and inspector projection are pure
// modules now; this store is the reactive wiring and service orchestration around them.
// Each is imported back under the module-private name it had while it lived here, so the
// call sites below are unchanged — the same shape the knowledge projection uses above
// after issue 785 extracted it.
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

// `DERIVED_RECIPE_PROJECTION_FIELDS` and `withoutDerivedRecipeProjectionFields` moved to
// the row projection alongside the derivation they describe, and are re-exported here so
// this module's public surface is unchanged for any importer of the old path.


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

/**
 * Reorder a list by moving the element at `fromIndex` to `toIndex`, returning a
 * new array. Returns null for an invalid or no-op move so callers can skip the
 * save. Array order is the persisted order for the System Overview settings lists
 * (issue 768) — a reorder just rewrites the array through each list's existing
 * whole-payload save path, no new persisted field.
 */
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
 * The persisted recipe of `recipeId`, but only when it belongs to `systemId`.
 *
 * `RecipeManager.getRecipe` is keyed on the recipe id alone and spans every system, so a
 * caller that means "this system's record" has to say so. Returns `null` for a recipe of
 * another system, which is the answer a scan scoped to `systemId` gives for one it never
 * held.
 *
 * @param {object} recipeManager
 * @param {string} recipeId
 * @param {string} systemId
 * @returns {object|null}
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
    // Component category (issue 676). This is the PER-COMPONENT field, and is a
    // different projection from the system-level `componentCategories` vocabulary
    // in the `selectedSystem` viewState projection — both are required, for
    // different things. Normalization guarantees the key, so it is projected
    // unconditionally rather than through a hasOwnProperty guard.
    category: item.category || 'general',
    ...(item.originItemUuid && { originItemUuid: item.originItemUuid }),
    ...(item.registeredItemUuid && { registeredItemUuid: item.registeredItemUuid }),
    ...(Object.prototype.hasOwnProperty.call(item, 'difficulty') && { difficulty: item.difficulty }),
    // The AUTHORED complication list (issue 1286), for the two GM read-only strips: the
    // Component Studio's progressive salvage rows and the Recipe Studio's progressive stage
    // rows. Both draw the complications of the component the row REFERENCES, which is never
    // the component the editor is editing, so this option list is the only feed either strip
    // has — the same reason `difficulty` is projected here.
    //
    // It is the UNREDACTED authored list, and deliberately NOT `forecastComplications`:
    // that projection filters to `visibility: 'visible'`, which is the PLAYER's view, while
    // the authored default is `gmOnly`. A GM screen fed from it would show nothing at all
    // for exactly the complications a GM authors by default.
    //
    // Absence-preserving on `difficulty`'s idiom above, not `|| []`:
    // `authoredComplications` keys the persisted field on a NON-EMPTY array, so a component
    // with none carries no key and this projection must not invent an empty one.
    ...(Object.prototype.hasOwnProperty.call(item, 'complications') && {
      complications: _clonePlain(item.complications),
    }),
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

/**
 * Normalize ONE entry of the unified system modifier library (issue 1117) on the WRITE
 * path, before it is handed to `updateSystem`.
 *
 * This is the store's mirror of `CraftingSystemManager._normalizeModifierLibrary`, which
 * re-normalizes every write anyway. It exists so an entry the store has just constructed
 * (an added row, a preset, a patched row) is already the right shape when the projection
 * re-reads it, not to be the authority — the manager is.
 *
 * `min` and `max` are ABSENCE-PRESERVING and are the reason this cannot be written with
 * `||` or a bare `Number()`: `Number(null)`, `Number('')` and `Number([])` are all `0`,
 * and `0` is a REAL bound, so a loose coercion would MINT a bound of 0 every time the
 * editor cleared one. `isRollExpression` is derived rather than read, so a patch cannot
 * contradict the expression beside it.
 *
 * @param {object} entry Raw entry.
 * @returns {object|null} Normalized entry, or null when it has no usable id.
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
    ...(normalizeNodeConfig(task.nodes) && { nodes: normalizeNodeConfig(task.nodes) }),
    // This task's own check-modifier pick (issue 1095), consulted only under the
    // `bySubject` combination rule. Attached ONLY when authored: an authored EMPTY array
    // is a real pick of zero, distinct from an absent one which inherits
    // `gatheringCraftingCheck.defaultModifierIds`.
    //
    // THE MIRROR OF `normalizeLibraryTask` (src/systems/GatheringRichStateService.js).
    // Both are whitelist rebuilds, so a key emitted there and not here is silently
    // dropped the moment a task is saved through THIS draft path. The shared
    // `authoredCheckModifierIds` attach is the same call on both sides.
    ...authoredCheckModifierIds(task.checkModifierIds),
    // The task's text/macro failure feedback (issue 1098, CF8), through the same shared
    // attach its mirror uses. Emitted by NEITHER library rebuild before that issue, so a
    // value authored anywhere was dropped the moment a task was saved through this path.
    ...authoredFailureOutcome(task.failureOutcome),
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
      // `characterModifiers` is DELIBERATELY absent (issue 1117): the library moved onto
      // the crafting system and is projected as `selectedSystem.modifiers` above. This
      // projection is an allowlist, so omitting the key is what makes the old location
      // invisible rather than merely stale.
      // Preserve the economy block (stamina/nodes limitation flags + stamina
      // config) so views can read the active flags reactively. Owned/normalized
      // by the service.
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

/**
 * The graph projection before anything has been queried (issue 1082).
 *
 * `bound` is `null` rather than absent so a consumer's disclosure check is one shape in every
 * state: `null` means "no graph was asked for", and a descriptor with `complete: false` means
 * "this is a fragment of the system, say so".
 */
function _emptyGraphData() {
  return { nodes: [], edges: [], width: 0, height: 0, bound: null };
}

/**
 * The recipe ids whose name matches a graph search term.
 *
 * Reads the retained index's node seeds rather than a built graph, so the search cohort can
 * be resolved BEFORE the bounded query decides what to materialise. Filtering after the fact
 * would let the bound discard the very recipes the GM searched for.
 *
 * @param {object} index
 * @param {string} lowerSearchTerm Already lower-cased and trimmed.
 * @returns {string[]}
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

// The WORLD currency projection (issue 1278). A top-level sibling key, never hung off
// `selectedSystem`, because the config is world scope: hanging it off the selection would make
// the same ladder appear to change when the GM merely clicks a different crafting system.
function _emptyWorldCurrencyState() {
  return {
    worldCurrency: {
      spendStrategy: 'actorProperty',
      providerId: '',
      macros: { canAfford: '', increment: '', decrement: '' },
      units: [],
    },
  };
}

// The WORLD character libraries projection (issue 1308), a top-level sibling for the reason the
// currency projection is one: hanging a world library off `selectedSystem` would make the same
// library appear to change when the GM merely clicks a different crafting system.
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
  const escaped = String(path).replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`);
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
 * The result shape of `CraftingSystemManager.applyBulkEditToRecipes` (issue 1010), split
 * by kind so {@link _normalizeBulkRecipeEditResult} stays a two-line loop rather than an
 * eight-way object literal of near-identical coercions.
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
 * Coerce the bulk-recipe write result into its full shape so the bulk panel's post-apply
 * notification can read every count unconditionally.
 *
 * All six counts are distinct and none is derivable from another: `updated` counts
 * recipes that genuinely changed, `blockedEnables` those activation refused (still off,
 * other axes applied), `rejected` those a persistence failure excluded from the batch
 * entirely, `booksUpdated` the recipe-book DEFINITIONS whose membership changed, and
 * `bookAdditions` / `bookRemovals` the membership EDGES it created and destroyed. The last
 * pair is what the post-apply notification reports: one book over twelve recipes is one
 * definition and twelve edges, and the GM asked for the twelve.
 *
 * @param {object} result
 * @returns {object} every count as a number and every id list as an array.
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

/**
 * WHICH recipes in the system require the essence, and therefore how many (issue 1036).
 *
 * The predicate is the shared `recipeReferencesEssence` leaf, not a second walk: the count
 * this returns is the number the bulk-delete impact statement reports, and the cascade
 * `CraftingSystemManager.deleteEssence` actually performs is driven by the SAME function.
 * Two implementations of "does this recipe require that essence?" would let the row's count
 * disagree with what the delete does. The store deliberately calls no underscore-private
 * manager method, which is why the predicate was extracted rather than reached into.
 *
 * The COUNT and the IDS come out of ONE walk, deliberately.
 * `describeEssenceDeleteImpact` unions carrier IDENTITIES across the selection, because the
 * cascade rewrites a shared recipe once for the whole set — so a sum of per-essence counts
 * would tell the GM "4 recipes will be rewritten" before an operation that rewrites 2. A
 * union cannot be derived from counts, so the row has to carry the ids; deriving the count
 * from a second walk would let the number and the identities disagree about the same
 * recipe.
 *
 * @param {string} essenceId
 * @param {object[]} recipes the selected system's recipes.
 * @returns {{count: number, ids: string[]}}
 */
function _essenceRecipeUsage(essenceId, recipes) {
  const ids = (Array.isArray(recipes) ? recipes : [])
    .filter((recipe) => recipeReferencesEssence(recipe, essenceId))
    .map((recipe) => String(recipe?.id ?? ''))
    .filter(Boolean);
  return { count: ids.length, ids };
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
      // `enabled` is DEFAULT-TRUE and the spread above carries whatever the definition
      // holds, including `undefined` for a definition that predates the field. Folding it
      // explicitly here means every consumer reads a real boolean and none has to repeat
      // the `!== false` convention — a consumer that wrote `if (card.enabled)` against an
      // absent key would treat every legacy essence as disabled.
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
      // The two capability facts the library row, the inspector and the On-craft tab all
      // read. `hasEffectTransfer` is "a source is CONFIGURED", not "the source resolves":
      // a `stale` or `missing` link is still an authored intention, and the source-state
      // marker beside the pill is what says whether it currently works. Deriving it from
      // resolution instead would make a broken link look like no link at all, which is
      // exactly the state the browser's needs-attention filter exists to surface.
      hasEffectTransfer: sourceState !== 'none',
      hasPropertyMacro: String(def.propertyMacroUuid || '').trim() !== '',
      componentUsageCount,
      componentUsageItems,
      recipeUsageCount,
      // The IDENTITIES behind `recipeUsageCount`, and the missing producer the bulk
      // delete-impact statement reads. `describeEssenceDeleteImpact` unions carriers rather
      // than summing counts, and it cannot union what it is not given: without this key the
      // sidebar reported "0 recipes will be rewritten" for a selection whose recipes it was
      // about to rewrite. `componentUsageItems` is the component-side twin (the union reads
      // `{id}` off it), so neither axis is a sum.
      recipeUsageIds: recipeUsage.ids,
      // Deleting an essence is WARNED, never BLOCKED (issue 1036, maintainer round). The
      // cascade strips it from every carrying component and rewrites every referencing
      // recipe, so there is no `deleteBlocked` state left to carry: `deleteRewritesRecipes`
      // is the recipe-side explanatory flag, and `componentUsageCount` above is what the
      // component-side impact note reads.
      deleteRewritesRecipes: recipeUsageCount > 0,
    };
  });
}

// Thin delegator to the shared Foundry-free plain-texter (src/utils/
// plainTextDescription.js). Kept as a named module function because
// `_buildManagedItemOptions` calls it and source-contract tests may pin the name.
// The shared helper flattens Foundry enricher directives (issue 800) before the
// HTML strip, so every description surface renders human-readable labels.
//
// Its `_descriptionTextCandidate` twin left with the component-card projection
// (issue 1090), which was its only caller; that module imports the shared helper
// directly rather than carrying a second copy of the delegator.
function _plainTextDescription(value) {
  return plainTextDescription(value);
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

  // --- Recipe dependency graph state (issue 1082) ---
  //
  // The retained producer/consumer index, keyed on the recipe revision token `RecipeManager`
  // mints (issue 1076). Every graph interaction that is not a definition change — a search
  // keystroke, a re-render, a `refresh()` triggered by something unrelated — re-queries this
  // index instead of rebuilding it, which is the difference between one pass over the corpus
  // per edit and one per keystroke. It holds exactly one system: switching systems replaces
  // it rather than accumulating, because a GM works in one system at a time and the graph is
  // the largest projection in the store.
  let graphIndexCache = null;

  /**
   * The producer/consumer index for one system, built at most once per recipe revision.
   *
   * A manager with no `revision()` (an older injected double) yields a `null` token, which
   * never compares equal and therefore always rebuilds. Failing that way round is deliberate:
   * a rebuilt index is slow, a wrongly-reused one is wrong.
   */
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

  /**
   * The laid-out, BOUNDED graph projection for the selected system (issue 1082).
   *
   * A search term becomes the query's `cohort` scope rather than a post-hoc filter, so the
   * node budget is spent on what the GM asked for. With no search term the query is `all`,
   * which over the bound returns no nodes and `bound.requiresScope`: there is no honest
   * 500-recipe answer to "show me a 10,000-recipe system", and a rendered slice of one would
   * read as the whole thing. The published `graphData.bound` is what a consuming view must
   * disclose.
   */
  function _buildGraphData(selectedSystem, recipeManager) {
    const index = _graphIndexFor(selectedSystem, recipeManager);
    const searchTerm = (get(graphSearch) || '').toLowerCase().trim();
    const scope = searchTerm
      ? { type: 'cohort', recipeIds: _graphSearchMatches(index, searchTerm) }
      : { type: 'all' };
    return layoutGraph(buildBoundedRecipeGraph(index, { scope }));
  }

  // --- GM Knowledge surface state (issue 785) ---
  //
  // `refresh()` is invoked by ~40 mutation paths and a whole-world `actors × items`
  // scan has no cheap invalidation signature, so the knowledge projection MUST NOT
  // join it. `knowledgeActive` makes `refreshKnowledge()` a total no-op while the
  // surface is closed, and the cached raw snapshot is dropped on a system change.
  //
  // This shape is UNPRECEDENTED in this store, not borrowed: the graph tab is
  // computed inside `refresh()` gated on `activeTab === 'graph'`, with no separate
  // flag and no separate refresh function.
  let knowledgeActive = false;
  let knowledgeSnapshot = null;
  let knowledgeSelectedActorId = '';
  let knowledgeRefreshScheduled = false;
  // Resolved ONCE per surface entry from the DEFINITION count, never as a live
  // derivation — a GM authoring the system's first recipe item elsewhere would
  // otherwise flip 0 → 1, yank the open tab mid-task and disarm an armed row.
  let knowledgeDefaultTab = defaultKnowledgeTab(0);
  let knowledgeDefaultTabResolved = false;

  // Per-store item-card memo (store-instance scope, NEVER module-global — avoids
  // cross-app/test bleed). The cache is OWNED here and INJECTED into the projection
  // for exactly that reason; see `adminComponentRowProjection.js` for the signature
  // shape and the disclosed source-document freshness trade. Cleared in `refresh()`
  // on a resolved-system-id change (the single invalidation chokepoint); item-search
  // changes deliberately do NOT invalidate.
  const itemCardCache = new Map();
  let itemCardCacheSystemId = '';
  // Coalesces the per-card `onHydrated` callbacks of one page into ONE republish
  // (issue 1081). A page hydrates 25 cards, each resolving on its own microtask, and 25
  // republishes would re-run every `$derived` reading `itemCards` 25 times per page turn.
  let itemCardRepublishScheduled = false;
  // The cards that reported a fill since the last republish, held by IDENTITY. Only these
  // get a fresh object; see `_scheduleItemCardRepublish`. Cleared on every republish, so it
  // never outlives one microtask's worth of hydrations.
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
    recipes: [],
    recipeCategories: [],
    // The recipe half of the Tags & Categories reference count, folded by the row
    // projection off the recipe MODELS (issue 1081). Published as data because its reader —
    // the manager's persistent left nav badge — is a sibling of every view, so deriving it
    // from the projected rows walked their DETAIL tier on every render, in every view.
    recipeTagPlaceholderCounts: {},
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
    // The GM Knowledge surface projection (issue 785). A TOP-LEVEL sibling key,
    // deliberately NEVER hung off `selectedSystem`: that would force a
    // `selectedSystem` reference rebuild on every knowledge publish and let a
    // late phase-2 `refresh()` publish clobber freshly projected rows.
    knowledge: projectKnowledgeSnapshot(null, { active: false }),
    ..._emptyEnvironmentState(false),
    ..._emptyTravelState(),
    ..._emptyWorldCurrencyState(),
    ..._emptyCharacterLibrariesState(),
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
   * Republish `itemCards` after one or more cards have filled themselves in place
   * (issue 1081), with each filled card swapped for a FRESH object.
   *
   * A new array holding the same card objects is not enough. This store publishes through a
   * `writable`, which does not proxy, so Svelte compares by `===` at every hop between the
   * published array and a rendered string — `selectedComponent`, `componentForEdit`, the
   * browser model's filter/sort/paginate chain, and the keyed `{#each}` reconciling a row.
   * A card whose identity did not move stops at the first of them, so re-wrapping the same
   * objects left every surface on the pre-hydration reading permanently rather than for a
   * beat. Preserving card identity looked like it kept the three surfaces from diverging; it
   * kept all three wrong together.
   *
   * Which cards to swap comes from the `onHydrated` callbacks themselves, by identity: a
   * refresh that landed between the fill and this microtask has published different card
   * objects, and those have their own fills still to come.
   *
   * Coalesced onto a microtask because a page hydrates 25 cards independently and 25
   * republishes would re-run every reader 25 times per page turn.
   *
   * @param {object} [card] the card that just hydrated.
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
    const library = systemId ? _systemTools(systemId) : [];
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

  function createToolDraft(initialPatch = {}, systemId = get(selectedSystemId)) {
    if (!systemId) return null;
    const patch = initialPatch && typeof initialPatch === 'object' ? initialPatch : {};
    const created = _normalizeGatheringLibraryTool({ ...patch, id: _randomID() }, _randomID);
    _setFocusedToolDraft(created, null, systemId);
    return _clonePlain(created);
  }

  function openToolDraft(toolId, systemId = get(selectedSystemId)) {
    const id = String(toolId || '');
    if (!id || !systemId) return false;
    const existing = _systemTools(systemId).find((tool) => String(tool.id) === id);
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
   * Register a first-class item-sourced Tool from a dropped Item uuid (issue 561, B1). This
   * creates a tool with `componentId: null` carrying its OWN source refs + `name`/`img`
   * snapshot and stamps
   * the durable `roles[systemId].toolId` on the source Item — no component import required.
   * Persists directly through the manager (mirroring the persisted-tool delete path), then
   * seeds the new tool into the draft + baseline so it renders immediately and is not dirty.
   *
   * @param {string} itemUuid
   * @returns {Promise<boolean>}
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
      const result = await systemManager.upsertTool(
        systemId,
        _clonePlain(draft),
        itemUuid ? { itemUuid } : {}
      );
      if (!result?.item) throw new Error('Tool save returned no item');
      const saved = _normalizeGatheringLibraryTool(result.item, _randomID);
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

  async function toggleToolEnabled(toolId, enabled, systemId = get(selectedSystemId)) {
    const systemManager = services.getCraftingSystemManager?.();
    const live = _systemTools(systemId).find((tool) => String(tool.id) === String(toolId));
    if (!live || typeof systemManager?.upsertTool !== 'function') return false;
    try {
      const result = await systemManager.upsertTool(systemId, {
        ...live,
        enabled: enabled === true,
      });
      if (!result?.item) return false;
      const saved = _normalizeGatheringLibraryTool(result.item, _randomID);
      if (String(get(toolDraft)?.id || '') === String(saved.id)) {
        const draftWasDirty = get(toolDraftDirty);
        if (draftWasDirty) {
          toolDraft.update((draft) => ({ ...draft, enabled: saved.enabled }));
          toolDraftBaseline.update((baseline) =>
            baseline ? { ...baseline, enabled: saved.enabled } : baseline
          );
        } else {
          toolDraft.set(_clonePlain(saved));
          toolDraftBaseline.set(_clonePlain(saved));
        }
        _recomputeToolsDraftDirty();
      }
      await refresh();
      _patchToolsDraftViewState();
      return true;
    } catch {
      services.notify?.error?.(
        services.localize?.('FABRICATE.Admin.Manager.Tools.Editor.ToggleFailed') ||
          'The Tool status could not be changed. Try again.'
      );
      return false;
    }
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
   * The `yes`/`no` pair of a DELETE confirm, in the shape `DialogV2.confirm` merges
   * (issue 1154).
   *
   * Two things it exists to stop coming back. `DialogV2.confirm` merges each button over
   * a default with `mergeObject`, which iterates `Object.keys(other)` — `[]` for a
   * function — so the bare `yes: () => true` this replaced across the file configured
   * NOTHING and left every destructive confirm here asking the generic *Yes*. And the
   * affirmative is COPY: it is localized, never a literal, and never left to the core
   * default (which is `"Yes"` on V13.351 and `"COMMON.Yes"` on V14.365).
   *
   * `no` carries only its callback on purpose — core's own default label is a correct
   * answer to the question-form title these dialogs ask, and its default callback already
   * returns false.
   *
   * One shared verb for every delete rather than a per-surface key: the button says what
   * the action is, and the dialog's own title and body say what is being deleted.
   *
   * @private
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
   * The ONE route-exit prompt shape, shared by every Svelte-layer draft kind.
   *
   * It returns `'save' | 'discard' | 'cancel'` BY CONSTRUCTION — including on the
   * no-`choiceDialog` fallback path, which returns `'discard' | 'cancel'` — so a caller
   * built on it gets the three-way "save and continue / discard / cancel" prompt without
   * choosing to. The boolean `confirmDiscardDirtyToolsDraft` above is the one prompt that
   * does NOT use this helper, and it must not be copied.
   *
   * `replacements` (issue 1096) substitutes `{name}` placeholders into the resolved
   * content. It exists because a prompt that says "the checks have unsaved changes" cannot
   * tell a GM standing on Gathering that the unsaved edit is on Crafting — and this prompt
   * is the last thing they see before that edit is discarded. Substitution happens after
   * localization, so a translated string carries the same slots.
   *
   * @param {string} contentKey
   * @param {string} contentFallback
   * @param {Record<string, string>} [replacements]
   * @returns {Promise<'save'|'discard'|'cancel'>}
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
   * Route-exit prompt for the System Overview → Settings identity sub-form (Name +
   * Description only — the optional-feature toggles and the modifier/prerequisite/currency
   * cards on the same tab live-apply and stage no draft, so they never reach this prompt).
   * Like the other Svelte-layer-dirty kinds it does NOT check dirtiness itself: the root
   * gates on its lifted `systemDetailsDirty` before calling.
   *
   * @returns {Promise<'save'|'discard'|'cancel'>} the chosen action, never a boolean
   */
  function confirmDiscardDirtySystemDetailsDraft() {
    return _confirmDiscardDirtyDraft(
      'FABRICATE.Admin.Manager.SystemEdit.DiscardDirtyContent',
      'The system details have unsaved changes. Save them and continue, or discard them?'
    );
  }

  /**
   * Route-exit prompt for the GM Checks Studio (issue 1096).
   *
   * The four activity drafts live ABOVE the four routes, so leaving the studio while any of
   * them is dirty is one decision about all of them — which is why there is one prompt
   * rather than three, and why it NAMES the dirty activities: the GM may be standing on
   * Gathering while the unsaved edit is on Crafting, and a prompt that only said "the
   * checks" would discard work on a route they never opened.
   *
   * Built on the shared helper, so it is the three-way variant by construction.
   *
   * @param {string[]} [activities] Localized names of the dirty activities.
   * @returns {Promise<'save'|'discard'|'cancel'>}
   */
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

  // Thin yes/no confirm used by the recipe editor's destructive in-draft actions
  // (delete step, revert multi→single, Complex→Simple trim). The editor stages the
  // result into its root-held draft after the user confirms; this helper only owns
  // the dialog wiring (the root has no direct services.confirmDialog seam).
  //
  // `confirmLabel` is REQUIRED of every caller in practice (issue 1154): the actions
  // routed here are not all the same verb — one deletes a step, another switches a
  // recipe back to single-step — so the store cannot name the affirmative for them, and
  // `DialogV2.confirm`'s default label is the generic *Yes*.
  async function confirmRecipeAction({ title, content, confirmLabel } = {}) {
    // `label` is OMITTED, never set to undefined, when a caller supplies none:
    // `mergeObject` iterates the keys it is handed, so `label: undefined` OVERWRITES
    // the default with nothing, and `_renderButtons` sets `span.innerText = _loc(label)`;
    // `localize` returns its `stringId` argument unchanged when no translation is found, so
    // the button renders the literal word "undefined" — strictly worse than the generic
    // default it was meant to replace. (Executed against both builds' `mergeObject`.)
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

    // Reads the SHARED gate helper off the system, not `enabled` through the realm store.
    //
    // That indirection was a real trap (issue 1282): the world travel config carries no
    // `enabled` — participation is a crafting system's answer, not the world's — so a
    // predicate reading it through `getRealmSettings()` would be permanently false, party
    // overrides would become unreachable, and the UI would show a hint about a prerequisite
    // the GM had already met.
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

      // The WORLD's realm library (issue 1282). No system id: realms are geography, so the
      // library is the same whichever crafting system is selected — and World > Travel has to
      // render it before any system opts in.
      const realms = realmStore?.list ? _clonePlain(realmStore.list() || []) : [];
      const realmById = new Map(realms.map((realm) => [realm.id, realm]));
      const locationService = getLocationService();
      const partyRealmOverridesAvailable = canUsePartyRealmOverrides(systemId);

      // Resolve each party's current realms ONCE (manual override OR live travel-
      // marker sensing) and bucket by realm id, so every realm-to-party list below
      // reflects auto mode — not just stored overrides.
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

      // Per-realm counts for the Realms tab header chips. EVERY environment in the world,
      // not one system's (issue 1282): a world realm can be cited by an environment belonging
      // to any crafting system that opted in, and World > Travel reports all of them — the
      // same rule `GatheringRealmStore._collectReferences` applies to delete evidence.
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
          const insideUuids = markerUuids.length > 0
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
        // Two sources, deliberately: `enabled` is the SELECTED SYSTEM's participation flag and
        // the reveal/visibility pair is the WORLD's behaviour. The world travel config carries
        // no `enabled` at all since issue 1282, so reading one out of it would be permanently
        // false — the trap `canUsePartyRealmOverrides` above already names.
        gatheringRealmSettings: {
          ...(realmStore?.getRealmSettings
            ? realmStore.getRealmSettings()
            : { revealMode: 'manual', modifierVisibility: 'visible' }),
          // `enabled` is spread LAST on purpose. The world config carries none today and a store
          // test pins that, but if one ever came back it would land here as a permanently false
          // participation flag — silently, since the symptom is an unreachable control rather
          // than an error. Ordering it last makes the system's answer win by construction.
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
      renameParty: async (partyId, name) => withSave((partyStore) => partyStore.update(partyId, { name: String(name ?? '') })),
      setPartyEnabled: async (partyId, enabled) => withSave((partyStore) => partyStore.setEnabled(partyId, enabled === true)),
      async deleteParty(partyId) {
        const partyStore = getPartyStore();
        if (!partyStore) return false;
        const party = partyStore.get?.(partyId);
        // The name is raw in the TITLE (ApplicationV2 assigns it through `innerText`, so
        // escaping there would surface a literal `&#39;`) and escaped in the CONTENT, which
        // is HTML.
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
      addPartyMember: async (partyId, actorUuid) => withSave((partyStore) => partyStore.addMember(partyId, actorUuid), 'members'),
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
          // The actor name is raw in the TITLE (ApplicationV2 assigns it through `innerText`,
          // so escaping there would surface a literal `&#39;`) and escaped in the CONTENT,
          // which is HTML.
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
      removePartyMember: async (partyId, actorUuid) => withSave((partyStore) => partyStore.removeMember(partyId, actorUuid), 'members'),
      movePartyMember: async (fromPartyId, toPartyId, actorUuid) => withSave(
          (partyStore) => partyStore.moveMember(fromPartyId, toPartyId, actorUuid),
          'members'
        ),
      setPartyTravelActor: async (partyId, actorUuid) => withSave(
          (partyStore) => partyStore.setTravelActor(partyId, actorUuid),
          'travelActor'
        ),
      clearPartyTravelActor: async (partyId) => withSave((partyStore) => partyStore.setTravelActor(partyId, null)),
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
      removeStaleMember: async (partyId, actorUuid) => withSave((partyStore) => partyStore.removeMember(partyId, actorUuid)),
      clearStaleTravelActor: async (partyId) => withSave((partyStore) => partyStore.setTravelActor(partyId, null)),
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
      // --- Realm quick list (name/enabled only; never touches other fields). ---
      //
      // None of these takes a crafting system id any more (issue 1282). The realm library is
      // world scope, so World > Travel authors it whether or not a system is selected — and a
      // system-gated write here would refuse the very first realm a GM creates.
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
      toggleRealmEnabled: async (realmId, enabled) => _realmPatch(realmId, { enabled: enabled === true }),
      // Merge-patch a single realm; the store merges over the existing record so
      // fields the caller omits round-trip untouched. Backs the full Travel
      // realm authoring surface (description/img/secret/biomes).
      updateRealm: async (realmId, patch = {}) => _realmPatch(realmId, patch && typeof patch === 'object' ? patch : {}),
      // Link (or unlink) a Foundry Scene Region on the current scene to a Fabricate
      // realm. Single-valued: the scene region is stripped from every realm's
      // sceneMappings before being attached to the chosen one; a falsy realmId just
      // clears the link.
      //
      // ONE store call, not one `update()` per realm (issue 1282). Against a
      // setting-backed store the old loop was a guaranteed lost update — iteration N+1
      // read the cache as it stood before N — so the strip-and-attach is expressed as a
      // single `setSceneRegionLink` write. It takes no crafting system id either: a
      // Scene Region points at a place, not at a ruleset.
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
          // No current-realm writes here: a party's current realm is derived
          // LIVE from its travel marker's position (GatheringLocationService auto
          // sensing), so inside markers resolve to the new link automatically.
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
        // The name is raw in the TITLE (ApplicationV2 assigns it through `innerText`, so
        // escaping there would surface a literal `&#39;`) and escaped in the CONTENT, which
        // is HTML.
        const name = String(realm?.name || realmId);
        const escapedName = _escapeHtml(name);
        // Collect referenced-by evidence WITHOUT deleting first: GatheringRealmStore.delete
        // returns it post-delete, but we surface it in the confirm copy beforehand by
        // probing the collaborators the store uses.
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

  /**
   * The world character-libraries store (issue 1308). Both libraries are world scope now, so
   * none of the list actions below takes a crafting system id and none of them requires a system
   * to be selected — a GM authors these from a world surface, exactly as they do the coin ladder.
   *
   * @returns {object|null}
   */
  function _characterLibrariesStore() {
    return services.getCharacterLibrariesStore?.() ?? null;
  }

  /**
   * Confirm the removal of one world character-library entry (issue 1308).
   *
   * These two lists are the only DESTRUCTIVE edits on a page framed as "settings for the selected
   * crafting system" whose reach is actually the whole world, and until this they were a single
   * unconfirmed click on a bare icon button. Removing a modifier does not merely delete the
   * entry: every check that named it loses it from `defaultModifierIds` on that system's next
   * save, in every system, and a prerequisite removal ungates every book that cited it. The copy
   * names that reach outright, on the pattern the party-delete confirmation already sets.
   *
   * The two key literals are passed in WHOLE rather than composed from a scope token. A
   * template-literal key would read to the lang-key scanner as the bare Manager namespace base,
   * which would then count every key beneath it as referenced and silently disarm the
   * orphaned-key gate for the whole namespace.
   *
   * @param {Array<object>} library The list the entry is being removed from.
   * @param {string} entryId
   * @param {string} titleKey Full lang key for the dialog title.
   * @param {string} contentKey Full lang key for the dialog body.
   * @returns {Promise<boolean>}
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
    const persisted = await _persistCharacterPrerequisites([
      ..._characterPrerequisites(),
      entry,
    ]);
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

  /**
   * Move one character prerequisite from `fromIndex` to `toIndex` (issue 768).
   * Array order IS the persisted order, so the reorder rewrites the system's
   * characterPrerequisites array and persists through updateSystem. Returns false
   * on an invalid/no-op move.
   *
   * @param {number} fromIndex Source position.
   * @param {number} toIndex Destination position.
   * @returns {Promise<boolean>}
   */
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
   * recipe editor's Validation tab (issue 549). Asks the SAME question the enable
   * path asks — `RecipeManager.getSignatureConflicts`, which the enable gate's own
   * `_validateSignatures` is a projection of — but one keystroke earlier, against the
   * DRAFT's ingredient sets, so the tab predicts the collision before the GM saves.
   * Returns coded, id-free `{ code, params, message }` conflicts (issue 550) the tab
   * localizes.
   *
   * The manager answers from its retained signature report (issue 1074) rather than
   * auditing the system. This used to build a fresh `SignatureValidator` over a
   * `toJSON` copy of the whole corpus and run a full `n(n-1)/2` audit — on EVERY
   * draft mutation, because the caller is a `$derived` keyed on the live draft, and
   * 2,000 recipes cost 1,999,000 comparisons and ~233 ms of it (issue 1201). The
   * draft is one candidate, so it is now priced like one.
   *
   * Only alchemy systems infer the recipe from submitted ingredients, so signature
   * uniqueness is enforced there alone (the manager re-checks this itself); every
   * other mode returns `[]`.
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

    // A draft stands in for the persisted recipe of the id it was opened on, so it is
    // scanned under THAT id — the parameter contract, and what the substituting audit
    // this replaced did with it. With no draft the persisted record is its own
    // candidate, which is the answer an audit filtered to `recipeId` gave.
    //
    // `getRecipe` is system-agnostic while the audit it replaces was not: it scanned the
    // SELECTED system's cohort and filtered to `recipeId`, so a record belonging to some
    // OTHER system was never in the scan and could name no conflict. The candidate seam
    // would instead scan it against this system's report and append it as a newcomer, so
    // the persisted leg is re-scoped to the selected system here.
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
        ..._deleteConfirmButtons(),
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

  // --- refresh ---
  /**
   * Refreshes overlap, and the later one is not necessarily the one that finishes last.
   *
   * `refresh` reads the selected system ONCE at the top and then does async work — item
   * enrichment, environment state, the graph — before publishing. Two runs can therefore be
   * in flight together, each holding the selection as it was when IT started, and whichever
   * finishes last wins. `createSystem` produces exactly that overlap on its own: the manager
   * fires `fabricate.craftingSystemsChanged` from inside the write, the store answers it by
   * scheduling a refresh, and only then does `createSystem` select the new system and
   * refresh again. The older run is holding the PREVIOUS selection, so when it published
   * last the new system appeared briefly and then flicked back to the one the GM started on.
   *
   * Each run takes a ticket and publishes only while it is still the newest. A superseded
   * run finishes its work and drops its result, which is correct: a newer run is already
   * producing the state that replaces it.
   */
  let refreshTicket = 0;

  /**
   * The learned-knowledge index, built ONCE per refresh (issue 1132).
   *
   * `describeRecipeDelete` runs on a render path — the bulk panel re-derives its impact
   * statement on every selection change — so it must perform no actor iteration of its
   * own. The world walk happens here instead, at the same cadence as every other
   * projection, and both readers (this describer and the Books & Scrolls `learnedByCount`)
   * consume the one build.
   *
   * It is deliberately NOT invalidated by a delete: `deleteRecipes` calls `refresh()`
   * afterwards, which rebuilds it, and a stale index between the two would only be read by
   * a describer whose selection has just been cleared.
   *
   * It IS invalidated by an external actor-flag write, through the marker below rather than
   * through a rebuild at the hook (issue 1132, review round). `updateActor` fires for every
   * module's flags, not just Fabricate's, and the only listener that used to route a `flags`
   * diff anywhere — `scheduleKnowledgeRefresh` — is a total no-op unless the Knowledge
   * surface is open. So with the Recipe Studio open, a player learning from a scroll left
   * the card understating "Will be forgotten by N characters" until the next `refresh()`.
   *
   * Rebuilding AT the hook would be a world walk per foreign flag write, and republishing
   * the projection to make it visible would re-run every `$derived` in the manager on the
   * same cadence. Marking is free: the walk happens on the next read that needs it, which
   * is at most once per selection change, and `describeRecipeDelete` stays free of an
   * unconditional actor iteration on the render path. What it does NOT buy is freshness for
   * a card sitting untouched on screen while a player learns — see the `ui-integration`
   * clause, which states the cadence rather than promising more than this.
   */
  let learnedRecipeActorIndex = new Map();
  let learnedRecipeIndexStale = false;

  /**
   * Note that some actor's flags changed, so the learned-recipe index must be rebuilt
   * before it is read again. Called from the manager app's actor hooks; deliberately does
   * no work of its own.
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

    // Item-card memo invalidation chokepoint: a system-id change (selectSystem,
    // fallback resolution, createSystem) drops every cached card. `features.salvage`
    // and essence-catalog toggles are captured IN the per-item signature, so they
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
      // Whether this system PARTICIPATES in the world currency (issue 1278). Projected as a
      // flat boolean because this list is a deliberate allowlist that does not carry
      // `requirements` — a consumer reaching for `requirements.currency.enabled` here reads
      // undefined and silently counts zero, which is how the World > Currency subtitle came to
      // report every ladder as unadopted.
      currencyEnabled: s?.requirements?.currency?.enabled === true,
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
    let recipeListData = {
      recipes: [],
      recipeCategories: [],
      recipeTagPlaceholderCounts: {},
      showVisibilitySummary: false,
    };

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
          // The two persisted fields added in issue 1036, stated EXPLICITLY rather than
          // left to the spread. This object and `buildSelectedSystemViewData`'s
          // `selectedSystem` (`adminSystemInspectorProjection.js`) are hand-built
          // projections, and this repo has repeatedly
          // shipped a correct normalizer and write path whose field was invisible to the
          // UI because a projection like this one did not name it (see the
          // `componentCategories` and `categoryIcons` notes there). Naming them makes the
          // allowlist say what it carries, and folds `enabled` onto its default-true
          // convention once, at the boundary.
          enabled: def.enabled !== false,
          propertyMacroUuid: def.propertyMacroUuid || null,
          sourceComponentId,
          associatedSystemItemId: sourceComponentId || null,
          associatedItem,
          associatedItemName: associatedItem?.name || null,
        };
      });
      // THE system-recipe cohort for this refresh, fetched ONCE (issue 1081). Three
      // consumers used to fetch it independently — the essence cards here, and the row
      // projection's rows and category counts — so a 10,000-recipe library was copied three
      // times per GM refresh. It is threaded into `_buildRecipeList` as its roster; that
      // function still derives its category counts over this UNFILTERED array and its rows
      // over the search-filtered subset, because the two cohorts are genuinely different
      // and collapsing them would be a correctness regression rather than a cleanup.
      const systemRecipes = recipeManager.getRecipes({ craftingSystemId: selectedSystem.id }) || [];

      essenceCards = _buildEssenceCards(
        essenceDefinitions,
        managedItems,
        managedItemOptions,
        systemRecipes
      );

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
        get(recipeSearch),
        { roster: systemRecipes }
      );
    }

    const visibleTab = _resolveVisibleTab(get(activeTab), selectedSystem);
    if (visibleTab !== get(activeTab)) {
      activeTab.set(visibleTab);
    }

    // Phase 1: publish all synchronous selected-system context immediately so
    // manager can paint its selected rail, menu, and inspector before slower
    // item/environment work finishes.
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
        // A card fills itself IN PLACE when a view hydrates it (issue 1081), which Svelte
        // cannot see: the array and the object are both unchanged by `===`. The republish
        // this schedules hands out a new array AND a fresh object for each filled card, which
        // is what actually reaches the browser rows, the browser inspector, the component
        // editor and the gathering picker.
        onHydrated: _scheduleItemCardRepublish,
      });
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
        // The basis marker comes from `selectedSystem` — the RAW manager system — and
        // NOT from `selectedSystemData`, which is the hand-built viewState projection
        // and does not carry the field. Reading it from the projection would yield a
        // silently `undefined` marker that fails open to the legacy index, which is
        // exactly the failure the parameter exists to prevent (issue 1011).
        recipeItemDefinitions: await _enrichRecipeItemLibrary(
          selectedSystemData.recipeItemDefinitions,
          recipeListData.recipes,
          selectedSystem?.membershipResolvesByRecipeIds,
          // The SAME index the delete describer reads, so "Learned by 4" on a book and
          // "4 characters will forget them" on the delete card are one derivation.
          learnedRecipeActorIndex
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
    }));
  }

  // Read the world currency config straight from its store on every publish. It is cheap (one
  // setting read plus a normalize) and it keeps the projection honest when another client's GM
  // edits the ladder — there is no per-system cache to invalidate because there is no per-system
  // copy any more.
  function buildWorldCurrencyState() {
    const store = services.getCurrencyConfigStore?.();
    if (!store) return _emptyWorldCurrencyState();
    return { worldCurrency: normalizeWorldCurrencyConfig(store.get(), { randomID: _randomID }) };
  }

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

  // ---------------------------------------------------------------------------
  // GM Knowledge surface (issue 785)
  //
  // Read path: the seam enumerates actors/items and resolves definitions; this
  // store caches the RAW snapshot and publishes the PURE projection as top-level
  // `viewState.knowledge` — always a new object, never on `selectedSystem`.
  //
  // Write path: every action awaits its seam call, notifies, then calls
  // `refreshKnowledge({ force: true })` and NEVER `refresh()`. GM gating lives at
  // the top of each seam method; this store never touches `game.*`.
  // ---------------------------------------------------------------------------

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

  // Localized copy for the Knowledge surface's two heavyweight confirms. Every key
  // is a STATIC literal at its call site (an interpolated key is invisible to both
  // `ui-lang-keys-resolve` and `lang-keys-no-orphans`, so a missing message would
  // ship silently); `data` is passed to the localizer and interpolated into the
  // English fallback only when no localizer is present.
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
   * Re-read the Knowledge snapshot. A TOTAL no-op while the surface is closed —
   * that gate is what keeps the noisy item hooks free and keeps the whole-world
   * scan off every one of `refresh()`'s ~40 callers.
   *
   * @param {{force?: boolean}} [options] `force` re-reads the seam; otherwise a
   *   cached snapshot is simply re-published.
   * @returns {Promise<boolean>} whether a projection was published.
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

  /**
   * Hook entry point. Coalesces a burst of externally-driven actor/item writes
   * into ONE `refreshKnowledge` through the same microtask pattern
   * `_scheduleExternalRefresh` uses, which also collapses the echo a store
   * action's own write produces into its explicit refresh.
   */
  function scheduleKnowledgeRefresh() {
    if (destroyed || !knowledgeActive || knowledgeRefreshScheduled) return;
    knowledgeRefreshScheduled = true;
    _onMicrotask(async () => {
      knowledgeRefreshScheduled = false;
      if (destroyed) return;
      await refreshKnowledge({ force: true });
    });
  }

  /**
   * Enter or leave the Knowledge surface. Entering resolves the default inner tab
   * once from the definition count; leaving drops the cache so a later entry
   * re-resolves both.
   *
   * @param {boolean} active
   * @returns {Promise<boolean>} the resolved active state.
   */
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

  /**
   * Select a roster character. Pure re-publication — no seam read.
   *
   * @param {string} actorId
   * @returns {boolean}
   */
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

  /**
   * Spend one charge of an owned recipe-item copy. The seam anchors the write to
   * the definition the projected row already resolved, so the GM's click acts on
   * exactly the book the row displayed.
   *
   * @param {string} actorId
   * @param {string} itemId
   */
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

  /**
   * Delete one owned copy. A stacked copy (`quantity > 1`) deletes the WHOLE
   * document behind a confirm naming the quantity: `recipeItemUsage.timesUsed`
   * and `recipeItemLearning.learnedCount` are per-DOCUMENT counters shared by
   * every unit, so decrementing a stack would leave one set of counters attached
   * to fewer units and falsify every derived `remaining`.
   *
   * @param {string} actorId
   * @param {string} itemId
   */
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
   * Erase one learned recipe. Frees the learn budget but deliberately LEAVES
   * discovery progress intact — an erase is an un-learn, a reset is an amnesia.
   *
   * @param {string} actorId
   * @param {string} recipeId
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

  /**
   * Reset this character's learned knowledge for the SELECTED system.
   *
   * @param {string} actorId
   */
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

  /**
   * Reset this character's learned knowledge across EVERY system. The only grain
   * that can clear orphan learned keys, which `forgetSystemLearnedRecipes`
   * deliberately leaves in place because they cannot be attributed to a system.
   *
   * @param {string} actorId
   */
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

  // Every search term is scoped to ONE system's vocabulary: "iron" names a real
  // component in the system it was typed into and nothing in the next one. Carrying a
  // term across a system change filters the new system's browser down to nothing and
  // reads as an empty library rather than an active filter.
  //
  // This clears at the STORE, not in each view, because all three terms are read back
  // out of these stores by every consumer at once (`itemSearch` → `getItems(systemId,
  // search)` → `itemCards` → the component browser; `recipeSearch` → the recipe
  // browser; `graphSearch` → the graph). Clearing here covers each of them and holds
  // for a system change triggered from anywhere.
  function _clearSystemScopedSearches() {
    recipeSearch.set('');
    itemSearch.set('');
    graphSearch.set('');
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

  /**
   * Create a crafting system, select it, and report it back so the caller can navigate.
   *
   * Returns the created system on success and `false` when the GM backed out of the
   * dirty-environment confirm — `false` specifically, because the manager root routes
   * this through the same "did it happen?" helper as `selectSystem`, and that helper
   * treats only `false` as "no". Returning `null` here would read as success and
   * navigate away from an edit the GM just chose to keep.
   *
   * @returns {Promise<object|false>}
   */
  async function createSystem() {
    if (!(await _proceedAfterDirtyEnvironmentConfirm())) return false;

    const systemManager = services.getCraftingSystemManager();
    const name = _nextSystemName(systemManager);
    const description =
      'Configure categories, item tags, essences, and crafting behaviour for this system.';
    // No `craftingCheck` seed (issue 1055). The authority level this used to stamp is
    // gone, and its replacement — the combination rule — already has a defined default
    // (`addAll`) that every caller shares, so a UI-only seed here would only be able to
    // disagree with the manager and the importer about what a new system starts as.
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

    // The single most destructive action in the app, and until issue 1154 it asked for
    // that in an untitled window with a generic *Yes* and hardcoded English copy. The
    // name is raw in the TITLE (ApplicationV2 assigns it through `innerText`, so escaping
    // there would surface a literal `&amp;`) and escaped in the CONTENT, which is HTML.
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
   * projection republishes the saved values (which is what clears the editor's `Unsaved` chip,
   * since the chip compares the typed inputs against that projection rather than a baseline).
   *
   * The boolean return is a navigation contract, not decoration: the manager's `system-details`
   * route-exit guard runs this on Save-and-navigate and proceeds only on a non-`false` result,
   * so the no-selected-system no-op MUST report `false` and keep the GM on the form rather than
   * letting navigation continue as if the edit had been stored.
   *
   * @param {string} name
   * @param {string} description
   * @returns {Promise<boolean>} `false` when there is no selected system to write to
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
    if (get(activeTab) === ENVIRONMENTS_TAB && nextTab !== ENVIRONMENTS_TAB && !(await _discardDirtyEnvironmentDraftForNavigation())) return false;
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
      default: { if (['biomes', 'dangerTags'].includes(field)) {
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
        next[field] = [...new Set(
            (Array.isArray(value) ? value : [])
              .map((entry) => String(entry || '').trim())
              .filter(Boolean)
          )];
      } else switch (field) {
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
        next.taskDropRateAdjustmentsEnabled = _normalizeDraftTaskDropRateAdjustmentsEnabled(value);
      
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

  // Count a system's recipes that carry authored steps[] — the recipes that
  // COLLAPSE to a single atomic action when the multi-step feature is turned off
  // (issue 710). Used to decide whether disabling the feature needs the collapse
  // warning and to report the count in it. Fails safe to 0 (no recipe manager → no
  // warning) so a headless/store-only caller never blocks on a missing collaborator.
  function _countMultiStepRecipes(sysId) {
    const recipeManager = services.getRecipeManager?.();
    if (!recipeManager?.getRecipes) return 0;
    const recipes = recipeManager.getRecipes({ craftingSystemId: sysId }) || [];
    return recipes.filter((recipe) => Array.isArray(recipe?.steps) && recipe.steps.length > 1)
      .length;
  }

  // Warning/confirm gate for turning the multi-step feature OFF while multi-step
  // recipes exist (issue 710). Disabling is NON-destructive — the steps are kept and
  // restored on re-enable — but it changes behaviour: each multi-step recipe then
  // runs as one combined atomic action and the GM edits only its final-step results.
  // Mirror the house confirm pattern (services.confirmDialog → DialogV2.confirm); a
  // system with no multi-step recipes skips the dialog. Returns true when the toggle
  // may proceed. Enabling the feature never prompts.
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

  /**
   * Whether this crafting system PARTICIPATES in Travel & Realms.
   *
   * It sits beside `toggleRequirement` rather than in the travel section (issue 1282) because
   * it writes a CRAFTING SYSTEM, not the world travel config. The realm library, the reveal
   * mode and the modifier visibility are world scope; what a system still owns is this one
   * boolean, with exactly three jobs — whether the party's location gates its environment
   * access in the engine, what its UI shows, and whether its environments offer the realm
   * controls. Its home in the Manager is the System Settings feature tile beside Currency.
   *
   * @param {string} systemId
   * @param {boolean} enabled
   */
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

  // --- Component category management (issue 676) ---
  //
  // Mirrors addCategory/removeCategory above, writing the SIBLING vocabulary
  // `componentCategories` top-level via updateSystem. Deliberately does not touch
  // `categories`: the two vocabularies are independent and must never cross-populate.
  // Note updateSystem's whole-array replace semantics make removal persist without
  // any `-=` deletion (unlike setFlag's deep merge).

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

  // Cascade delete (issue 689): strip the deleted tag from every component carrying
  // it AND from every recipe tag-placeholder ingredient naming it before dropping it
  // from the vocabulary. The recipe strip is what keeps the tag reference count (which
  // credits those placeholders) honest — nothing is left referencing a tag that no
  // longer exists. Placeholders emptied by the strip persist via allowIncomplete.
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

  /**
   * The comparison key for an essence NAME.
   *
   * One function, because `addEssence`, `updateEssence` and `duplicateEssence` must agree
   * exactly on what "already exists" means. `addEssence` and `updateEssence` both REFUSE a
   * case-insensitive collision while `_uniqueKey` de-duplicates only the ID, so a
   * duplicate that landed a second same-named definition would leave NEITHER of the two
   * ever savable again — silently and permanently.
   */
  function _essenceNameKey(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }

  /**
   * Whether any OTHER essence already carries this name, case-insensitively.
   *
   * @param {object[]} existing the system's essence definitions.
   * @param {string} name
   * @param {string} [ignoreId] the essence being renamed, which cannot collide with itself.
   */
  function _essenceNameTaken(existing, name, ignoreId = '') {
    const key = _essenceNameKey(name);
    return existing.some((def) => def.id !== ignoreId && _essenceNameKey(def.name) === key);
  }

  /**
   * A name derived from `baseName` that {@link _essenceNameTaken} rejects for no existing
   * essence — what `duplicateEssence` must produce for its copy to be savable.
   *
   * Counts upwards rather than appending repeatedly, so duplicating three times yields
   * three DISTINCT names rather than "(copy)", "(copy) (copy)", "(copy) (copy) (copy)".
   * The loop is bounded by the definition count plus one, which is the most collisions
   * that can exist.
   */
  function _uniqueEssenceName(existing, baseName) {
    const first =
      services.localize?.('FABRICATE.Admin.Manager.Essence.DuplicateName', { name: baseName }) ||
      `${baseName} (copy)`;
    if (!_essenceNameTaken(existing, first)) return first;
    for (let index = 2; index <= existing.length + 2; index += 1) {
      const candidate =
        services.localize?.('FABRICATE.Admin.Manager.Essence.DuplicateNameIndexed', {
          name: baseName,
          index,
        }) || `${baseName} (copy ${index})`;
      if (!_essenceNameTaken(existing, candidate)) return candidate;
    }
    return `${baseName} ${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * The selected system plus its essence definitions, or `null` when either is missing.
   * Every essence write below opens with the same three reads; hoisting them keeps the
   * write functions about their own subject.
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

  // `colorToken` is the optional GM-authored per-essence colour (issue 917). It is a
  // bare `--fab-tag-*` key or null; `CraftingSystemManager` owns the palette
  // validation, so the store only has to carry the authored value through.
  //
  // `extra` carries the two fields issue 1036 added. It is an options bag rather than two
  // more positional parameters because the editor can now author BOTH before an essence has
  // ever been saved: a GM who creates an essence with the Enabled switch off, or with a
  // property macro already dropped, would otherwise have both silently discarded on the
  // first save and would have to re-author them through `updateEssence`. Both are
  // presence-gated on `Object.hasOwn` for the reason they always are — `enabled: false` and
  // `propertyMacroUuid: null` are falsy but REAL.
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

  /**
   * The patched definition one `updateEssence` call produces, given the current one.
   *
   * Extracted so `updateEssence` stays a guard-and-write function while the per-field
   * partial semantics live in one readable place. Every field follows the SAME rule, which
   * is the whole contract of this method: an ABSENT key leaves the stored value alone, and
   * a PRESENT key writes — including when the value it writes is falsy. Four of the fields
   * have a meaningful falsy value (`colorToken: null` clears the colour, `enabled: false`
   * disables, `propertyMacroUuid: null` unlinks the macro, `sourceComponentId: null`
   * unlinks the source), so a truthiness test here would silently drop four ordinary
   * operations.
   *
   * @param {object} current the stored definition.
   * @param {object} updates the caller's partial patch.
   * @param {object} system the selected system, for source resolution.
   * @param {{name: string, description: string, icon: string}} resolved the three fields
   *   `updateEssence` has already validated.
   * @returns {object} a NEW definition; `current` is not mutated.
   */
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
   * Copy an essence into a NEW definition the GM can then edit (issue 1036).
   *
   * The copy takes a name `updateEssence` will still accept. Both `addEssence` and
   * `updateEssence` refuse a case-insensitive name collision and `_uniqueKey` de-duplicates
   * the ID only, so a naive duplicate would land two same-named definitions after which
   * NEITHER could ever be saved again.
   *
   * Everything else is carried verbatim, including a `false` `enabled` and the property
   * macro: a duplicate is a starting point for the GM's next essence, and silently
   * re-enabling a copy of a disabled essence would give it behaviour its original does not
   * have. The SOURCE link is carried too — it names an in-system component, so the copy
   * points at the same component the original does.
   *
   * @param {string} essenceId
   * @returns {Promise<?string>} the new essence id, or `null` when nothing was written.
   */
  async function duplicateEssence(essenceId) {
    if (!essenceId) return null;
    const context = _selectedSystemEssences();
    if (!context) return null;
    const { systemManager, sysId, existing } = context;

    const current = existing.find((def) => def.id === essenceId);
    if (!current) return null;

    const id = crypto.randomUUID();
    const essenceDefinitions = [
      ...existing,
      {
        ...current,
        id,
        name: _uniqueEssenceName(existing, String(current.name || '').trim() || essenceId),
      },
    ];

    await systemManager.updateSystem(sysId, { essenceDefinitions });
    await refresh();
    return id;
  }

  /**
   * Enable or disable ONE essence (issue 1036) — the library row's toggle.
   *
   * Routed through the manager's set-apply primitive rather than a bespoke write, so the
   * single toggle and the bulk Status axis share one code path and one
   * `_assertNoAlchemySignatureCollisions` check. `applyBulkEditToEssences` is
   * presence-gated on `Object.hasOwn`, so `{ enabled: false }` is a real staged edit rather
   * than an empty one.
   *
   * Disabling does NOT retro-disable an already-enabled recipe: the disabled-essence
   * blocker lives in `_validateRecipeForActivation`, so an enabled recipe requiring this
   * essence stays enabled until someone tries to re-activate it. That is deliberate — a
   * mid-session toggle must not silently switch off a table's recipes — but it is also
   * invisible, so the count of enabled recipes the toggle just invalidated is REPORTED.
   * Re-enabling clears the issue without touching recipe state.
   *
   * @param {string} essenceId
   * @param {boolean} enabled
   * @returns {Promise<{updated: boolean, invalidatedRecipes: number}>}
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
   * Apply one staged bulk edit to a SET of essences (issue 1036) through the manager's
   * set-apply primitive: ONE `craftingSystems` write and ONE refresh for the whole
   * selection.
   *
   * `edit` is forwarded VERBATIM. Two of its three keys are falsy but REAL —
   * `colorToken: null` (Clear colour) and `enabled: false` (Disable) — so pruning "empty"
   * keys would collapse a present `colorToken: null` into an absent one, and those are
   * different instructions. Everything downstream tests key presence, never truthiness.
   *
   * `null` means nothing was written, for any reason: a bad or empty argument, no selected
   * system, or a throw that has already been reported to the GM. The manager routes the
   * write through `updateSystem`, which runs `_assertNoAlchemySignatureCollisions` and
   * THROWS on a collision, so the alchemy block reaches the GM here rather than shipping a
   * system it would refuse to load.
   *
   * @param {Iterable<string>} essenceIds
   * @param {object} [edit]
   * @returns {Promise<{updated: number, essenceIds: string[]}|null>}
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

  /**
   * The localized copy the singular essence delete dialog reads (issue 1156, the essence
   * sibling of `_recipeDeleteDialogContent`). Before it, the dialog stated both consequence
   * counts unconditionally, so the commonest single delete of all — an essence carried by
   * nothing and required by no recipe — read "This removes it from 0 component(s) and
   * rewrites 0 recipe(s) that require it." The `ui-integration` clause issue 1152 added says
   * a zero consequence is omitted, not stated; this obeys it.
   *
   * FOUR KEYS, because `componentsAffected` and `recipeRewrites` are independent
   * (`describeEssenceDeleteImpact`): an essence can carry no component yet be required by
   * recipes, or the reverse. The plain branch is the one where BOTH are zero.
   *
   * The count-carrying branches are FUTURE ("It will be removed…", "…will be rewritten"):
   * the essence still exists while the GM reads the sentence.
   *
   * @param {string} name
   * @param {{componentsAffected: number, recipeRewrites: number}} impact
   *   `describeEssenceDeleteImpact` output.
   * @returns {string}
   * @private
   */
  function _essenceDeleteDialogContent(name, impact) {
    const components = Number(impact?.componentsAffected) || 0;
    const recipes = Number(impact?.recipeRewrites) || 0;
    const data = { name, components, recipes };
    const [key, fallback] = _essenceDeleteDialogBranch(name, components, recipes);
    const localized = services.localize?.(key, data);
    if (localized && localized !== key) return localized;
    return fallback;
  }

  /**
   * The `[key, englishFallback]` pair for one of the four essence dialog branches.
   *
   * @param {string} name
   * @param {number} components
   * @param {number} recipes
   * @returns {[string, string]}
   * @private
   */
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

  /**
   * Delete ONE essence definition, after asking (issue 1036).
   *
   * Renamed from `removeEssence` so the singular and the plural share one verb, localized,
   * and it RETURNS a boolean: the old `undefined` could not tell a caller whether the GM
   * had cancelled, whether the essence existed, or whether the write happened.
   *
   * The delete is WARNED, not BLOCKED (maintainer round). `CraftingSystemManager.deleteEssence`
   * strips the essence from every carrying component and rewrites every referencing recipe,
   * so component usage no longer refuses the delete — it is stated in the confirm dialog as
   * impact the GM is agreeing to. The counts come from `describeEssenceDeleteImpact` so the
   * dialog and the bulk panel report the same distinct-carrier arithmetic.
   *
   * @param {string} essenceId
   * @returns {Promise<boolean>} whether the definition was deleted.
   */
  async function deleteEssence(essenceId) {
    const context = _selectedSystemEssences();
    if (!context) return false;
    const { systemManager, sysId, system, existing } = context;

    const essence = existing.find((def) => def.id === essenceId);
    if (!essence) return false;

    const managedItems = _getManagedItems(system);
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
      // Content is issue 1156's builder, which omits consequences whose count is zero
      // rather than stating "0 component(s)"; the buttons are issue 1154's, so the
      // affirmative names the action instead of reading "Yes". The two are orthogonal —
      // one is what the dialog says, the other is what its controls are called.
      content: `<p>${_essenceDeleteDialogContent(name, impact)}</p>`,
      ..._deleteConfirmButtons(),
    });
    if (!confirmed) return false;

    await systemManager.deleteEssence(sysId, essenceId);
    await refresh();
    return true;
  }

  /**
   * Delete a SET of essence definitions (issue 1036) through the manager's batched
   * primitive: ONE `craftingSystems` write and ONE `recipes` write for the whole set.
   *
   * The delete is WARNED, not BLOCKED (maintainer round): every requested essence is deleted
   * regardless of component usage, because the manager primitive strips it from every
   * carrying component and rewrites every referencing recipe. There is no blocked partition
   * to compute or report.
   *
   * Confirmation is the CALLER's, not this function's: the bulk delete is armed in the
   * panel (`ArmedDangerButton`) beside an impact statement naming the counts, which is
   * strictly more information than a modal can carry.
   *
   * @param {Iterable<string>} essenceIds
   * @returns {Promise<{deleted: number, recipesUpdated: number, recipesDisabled: number}>}
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

    try {
      const result = await systemManager.deleteEssences(
        sysId,
        resolved.map((def) => String(def.id))
      );
      await refresh();
      return {
        deleted: Number(result?.deleted) || 0,
        recipesUpdated: Number(result?.recipesUpdated) || 0,
        recipesDisabled: Number(result?.recipesDisabled) || 0,
      };
    } catch (error) {
      console.error('Fabricate | Failed to delete essences:', error);
      services.notify?.error?.(error?.message || 'Failed to delete essences');
      return empty;
    }
  }

  /**
   * Abandon the essence draft the editor is holding (issue 1036).
   *
   * The draft itself is lifted into `CraftingSystemManagerRoot`, not held here, so the
   * STORE's half of Cancel is exactly this: write NOTHING, and republish the persisted
   * projections so the browser and the inspector show what is actually stored rather than
   * whatever the abandoned draft last rendered. "Writes nothing" is the half worth having a
   * name for — a cancel that reached `updateSystem` would persist the edit it exists to
   * discard.
   *
   * It is a store export for the same reason `cancelEnvironmentDraft` and
   * `cancelToolsDraft` are: the route guard's discard branch and the editor's Cancel button
   * must reach ONE function, and the alternative is each caller re-deriving what cancelling
   * means.
   *
   * @returns {Promise<boolean>} always `true`; cancelling cannot fail.
   */
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
    if (setting.values.every((existing) => !(existing.id === option.id)))
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
   * Read the selected system's ONE modifier library (issue 1117), or `null` when the
   * system cannot be resolved.
   *
   * Every write below goes through `updateSystem`, which SHALLOW-MERGES the top level, so
   * a `modifiers` write replaces the whole array wholesale — removing an entry persists
   * with no `-=` deletion key — while every sibling top-level field is left alone. That is
   * why these five ops no longer touch the gathering config at all: the library is not
   * there any more, and a write through `_saveGatheringConfig` would target a key the
   * gathering normalizer no longer emits.
   *
   * @param {string} systemId Target crafting system id.
   * @returns {{ manager: object, system: object, library: Array<object> }|null}
   */
  /**
   * The world modifier library and the store that owns it (issue 1308). No crafting system is
   * consulted and none needs to be selected: the library is authored once for the world.
   *
   * @returns {{ store: object, library: Array<object> }|null}
   */
  function _modifierContext() {
    const store = _characterLibrariesStore();
    if (!store) return null;
    return { store, library: store.listModifiers?.() ?? [] };
  }

  /**
   * Persist a whole replacement world modifier library and re-project.
   *
   * @param {object} store The world character-libraries store.
   * @param {Array<object>} next The replacement library.
   * @returns {Promise<void>}
   */
  async function _saveModifierLibrary(store, next) {
    await store.saveModifiers(next);
    await refresh();
  }

  /**
   * Append a new modifier entry to the selected system's library.
   * Returns the normalized entry, or null when the system cannot be resolved
   * or the proposed id already exists.
   *
   * @param {string} [systemId] Target crafting system id.
   * @param {object} [partial] Partial entry (id, label, icon, expression, min, max).
   * @returns {Promise<object|null>}
   */
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
   * Update one modifier entry by id. Updates that fail normalization (e.g. no id)
   * preserve the prior entry. Returns true when the library changed.
   *
   * @param {string} modifierId Library entry id.
   * @param {object} [updates] Partial replacement fields.
   * @returns {Promise<boolean>}
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

  /**
   * Remove one modifier entry by id. References to the deleted id are intentionally left
   * intact so the GM can repoint or remove them at authoring time (the gathering runtime
   * treats an unresolved reference as misconfiguration, and the check normalizer drops a
   * dangling `defaultModifierIds` entry on the next save).
   *
   * @param {string} modifierId Library entry id to remove.
   * @returns {Promise<boolean>}
   */
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
   * Move one modifier from `fromIndex` to `toIndex` (issue 768). The array order IS the
   * persisted order. Returns false on an invalid/no-op move.
   *
   * @param {number} fromIndex Source position.
   * @param {number} toIndex Destination position.
   * @returns {Promise<boolean>}
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
   * Idempotently seed the active Foundry game system's preset bundle into the WORLD modifier
   * library. Existing ids are preserved; the return value identifies added vs. skipped presets
   * and flags unsupported Foundry systems for the caller to surface to the GM.
   *
   * @returns {Promise<{added: Array, skipped: Array, unsupported: boolean, foundrySystemId?: string}>}
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
      partial?.modifierId || _firstCharacterModifierId() || ''
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
      partial?.modifierId || _firstCharacterModifierId() || ''
    ).trim();
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

  // Live-persist a single failure-consumption policy flag (issue 712). MUST spread
  // BOTH the existing craftingCheck block AND its nested `consumption` sub-object:
  // updateSystem shallow-merges the top level, so a naive
  // `{ craftingCheck: { consumption: { …patch } } }` would drop every sibling of
  // craftingCheck AND the untouched consumption flag, which the normalizer then
  // re-defaults (silent data loss). Callers pass a single-field patch.
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

  // Live-persist salvage's failure-consumption policy (issue 1098) — the twin of
  // `saveCraftingCheckConsumption` above, for the two keys that have been persisted since
  // 1.7.0 and reachable from no editor until the Salvage On-failure section shipped. It
  // spreads BOTH the existing salvageCraftingCheck block AND its nested `consumption`
  // sub-object for the reason its crafting twin states: `updateSystem` shallow-merges the
  // top level only, so a naive patch would drop every sibling AND the untouched flag, which
  // the normalizer then re-defaults — and one of those defaults is TRUE, so the loss would
  // present as a silent inversion rather than an obvious blank.
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

  // Which system key each activity's check block is persisted under. The modifier LIBRARY
  // is not in here: it is top-level and shared (issues 1095, 1117). Named for the block
  // rather than for one of its fields because two savers now key on it — the
  // check-modifier selection and the failure-result policy (issue 1098).
  const CHECK_ACTIVITY_SYSTEM_KEYS = {
    crafting: 'craftingCheck',
    salvage: 'salvageCraftingCheck',
    gathering: 'gatheringCraftingCheck',
  };

  /**
   * Live-persist ONE activity's failure-result policy (issue 1098).
   *
   * A SIBLING of `consumption`, not a member of it, so `saveCraftingCheckConsumption`
   * structurally cannot carry it — and gathering has no consumption block at all, so there
   * was no saver to extend. One parameterised writer rather than three near-identical ones:
   * the three differ only in which key they write, and three copies is how one activity
   * comes to forget to spread `existing`.
   *
   * It spreads `existing` under `updateSystem`'s shallow top-level merge, so every sibling
   * of the policy — the per-mode sub-objects, the modifier selection, the consumption block
   * — survives rather than being re-defaulted by the normalizer on the next read. The value
   * goes through the shared normalizer so a junk argument writes the default rather than
   * persisting something the engine would have to re-interpret.
   */
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
  //
  // IT NO LONGER CARRIES THE LIBRARY. Until issue 1117 this also accepted a system-level
  // `checkModifiers` array, because the Checks card authored the entries; the library now
  // has ONE authoring surface (System settings > Modifiers, through
  // `_saveModifierLibrary` above) and the Checks card is selection-only. Keeping a
  // second write path for the same array is exactly how two screens come to disagree about
  // which wrote last, so the half was removed rather than left dormant.
  //
  // MUST spread the existing activity check block: `updateSystem` shallow-merges only the
  // top level, so a naive `{ craftingCheck: { defaultModifierIds } }` would drop every
  // sibling check field (simple/routed/progressive/consumption) which the normalizer then
  // re-defaults (silent data loss).
  //
  // `Object.keys(selection).length > 0` is what carries a `maxModifierPicks: null` through:
  // absence means UNLIMITED, so clearing the cap has to be able to overwrite a stored
  // bound, and a `null` value with its key present is exactly the patch that does it. It is
  // also what makes an empty patch a no-op rather than a write: without it,
  // `updateSystem(sysId, {})` re-normalizes and re-persists the whole system — and
  // `refresh()` re-projects it — for a patch that asked for nothing.
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

  const saveGatheringCheckActive = (enabled) =>
    _saveGatheringCheckPatch({ enabled: enabled === true });
  const saveGatheringCheckProgressive = (progressive) => _saveGatheringCheckPatch({ progressive });
  const saveGatheringCheckRouted = (routed) => _saveGatheringCheckPatch({ routed });

  // ---------------------------------------------------------------------------
  // Currency (WORLD scope, issue 1278)
  //
  // The ladder, spend strategy, provider and macro set describe the WORLD, not a crafting
  // system: a world runs exactly one Foundry game system and so has exactly one way actors
  // store coins. Every action below therefore takes no `systemId` — what a crafting system
  // still owns is only `requirements.currency.enabled`, written by `toggleRequirement`.
  //
  // Persistence goes through `CurrencyConfigStore`, which normalizes and always saves. The
  // mutate-callback shape is kept from the per-system era on purpose: the provider and
  // strategy rules below are unchanged by the move, so they are carried across verbatim
  // rather than re-derived.
  // ---------------------------------------------------------------------------

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
   * Move one currency unit from `fromIndex` to `toIndex` (issue 768). Array order
   * IS the persisted order, so the reorder rewrites the world currency units array and
   * persists through `CurrencyConfigStore`. Takes no system id: the ladder is world scope
   * (issue 1278). Returns false on an invalid/no-op move.
   *
   * @param {number} fromIndex Source position.
   * @param {number} toIndex Destination position.
   * @returns {Promise<boolean>}
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

  async function setCurrencySpendStrategy(spendStrategy) {
    const nextStrategy = ['actorInventory', 'macro'].includes(spendStrategy)
      ? spendStrategy
      : 'actorProperty';
    return await _updateCurrencyConfig((currency) => {
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
      alchemy: { ...system.alchemy, checkMode: next },
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
    const wanted = new Set((Array.isArray(bookIds) ? bookIds : []).map(String));
    const system = systemManager.getSystem?.(sysId);
    const definitions = Array.isArray(system?.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    let changed = false;
    for (const def of definitions) {
      const currentIds = (Array.isArray(def.recipeIds) ? def.recipeIds : []).map(String
      );
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
   * What deleting this set of recipes would do (issue 1132) — the impact statement the
   * bulk panel renders BEFORE the GM arms the control, and the same arithmetic the
   * singular dialog reports.
   *
   * It counts through `describeRecipeDeleteImpact`, which is the same leaf
   * `CraftingSystemManager.deleteRecipes` executes the write through, so the stated
   * numbers cannot drift from the performed ones. See `utils/recipeDeleteImpact.js` for
   * the one place they legitimately differ (a legacy-basis system's recipe-item figure)
   * and why that is a definition rather than a drift.
   *
   * It returns the zero impact rather than throwing for an absent or stale system: this
   * runs on a render path, on every selection change, before any click.
   *
   * @param {Iterable<string>} recipeIds The SELECTED recipe ids.
   * @returns {{deletable: number, deletableIds: string[], recipeItemsAffected: number,
   *   recipeItemIds: string[], learnersAffected: number, learnerIds: string[]}}
   */
  function describeRecipeDelete(recipeIds) {
    return _describeRecipeDeleteIn(get(selectedSystemId), recipeIds);
  }

  /**
   * The body of {@link describeRecipeDelete}, against a NAMED system rather than the
   * selected one.
   *
   * The singular delete needs this: it prunes against the recipe's OWN
   * `craftingSystemId`, so it must state the impact against that system too, or the dialog
   * would report zero consequences for a recipe the write then cascades over.
   *
   * @param {string} sysId
   * @param {Iterable<string>} recipeIds
   * @returns {{deletable: number, deletableIds: string[], recipeItemsAffected: number,
   *   recipeItemIds: string[], learnersAffected: number, learnerIds: string[]}}
   * @private
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
   * The localized copy the singular delete dialog reads, from the SAME describer the bulk
   * card reads (issue 1132). Before it, the dialog was hardcoded English naming no
   * consequence at all — it said "Delete recipe X?" while silently forgetting the recipe
   * off every character who had learned it.
   *
   * FOUR KEYS, BECAUSE THE TWO CONSEQUENCES ARE INDEPENDENT (review round). Gating them as
   * a PAIR made the commonest single delete of all — in one book, learned by nobody — read
   * "… and forgotten by 0 character(s)", and its mirror read "removed from 0 recipe
   * item(s)". The bulk card omits a zero consequence rather than stating it, and the
   * `ui-integration` clause this change added says so; the dialog for the same action has to
   * obey the same rule. The plain branch stays the one where BOTH are zero.
   *
   * The count-carrying branches are FUTURE ("It will be removed from…"): the recipe still
   * exists while the GM reads the sentence, so the present tense described a completed state
   * of a thing that had not been touched.
   *
   * @param {string} name
   * @param {object} impact `describeRecipeDelete` output.
   * @returns {string}
   * @private
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

  /**
   * The `[key, englishFallback]` pair for one of the four dialog branches.
   *
   * @param {string} name
   * @param {number} items
   * @param {number} learners
   * @returns {[string, string]}
   * @private
   */
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

  /**
   * The studio's SINGULAR recipe delete.
   *
   * Two things about the options object below are not stylistic (issue 1132), and the
   * shape it replaced had both wrong:
   *
   *  - the title lands at `window.title`, NOT top level. `ApplicationV2` reads
   *    `this.options.window.title`, so an unmapped top-level `title` is read by nothing and
   *    the dialog rendered with an empty title bar. This site states the canonical shape
   *    directly; since issue 1154 `normalizeConfirmOptions` also maps the top-level form
   *    for every other call site in this file, so both spellings arrive correct;
   *  - `yes` and `no` are OBJECTS carrying a label and a callback, not bare functions.
   *    `DialogV2.confirm` merges each over `{action, label: "COMMON.Yes"|"COMMON.No", icon,
   *    callback}`, and a function contributes no own enumerable keys — so the confirm button
   *    on a destructive dialog read the generic *Yes*. `no` was harmless in the bare form
   *    (the default `no.callback` already returns `false`, executed and verified on V13.351
   *    and V14.365) but it is the identical shape, and leaving one of the pair in the form
   *    the paragraph above calls broken is how the pattern comes back.
   *
   * The affirmative LABEL is still the caller's, here and everywhere: no central mapping can
   * name a destructive action for you. `_deleteConfirmButtons()` is the shared pair for the
   * plain deletes; this one keeps its own key because the recipe delete's copy is authored
   * as a set with its impact-stating body.
   *
   * It routes the write through `CraftingSystemManager.deleteRecipes`, not
   * `RecipeManager.deleteRecipe`, so the studio singular cascades the recipe-item
   * membership prune exactly as the set form does. `RecipeManager.deleteRecipe` is the
   * leaf and deliberately does not cascade; its docblock names the entry points that do.
   *
   * @param {string} recipeId
   * @returns {Promise<boolean>}
   */
  async function deleteRecipe(recipeId) {
    const recipeManager = services.getRecipeManager();
    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) return false;

    const name = String(recipe.name || '');
    // THE RECIPE IS THE AUTHORITY ON WHICH SYSTEM IT BELONGS TO; the selection is only the
    // fallback (review round). `deleteRecipes` prunes against `getSystem(systemId)`'s
    // definitions, so for a recipe whose `craftingSystemId` is not the selected system the
    // old order deleted the recipe, ran the prune over the WRONG system's definitions,
    // found no containing definition, and left the recipe's real book holding a dangling id
    // — precisely the invariant this change exists to restore. `game.fabricate.deleteRecipe`
    // has always read it off the recipe. The impact is described against the SAME id, or the
    // dialog would state zero consequences for a delete that then cascades.
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

  /**
   * Tell the GM that a delete they authorised reached nothing.
   *
   * A WARNING rather than an error: nothing failed, the world simply no longer holds what
   * the card was describing — the commonest cause is another client having deleted the same
   * recipes between the describe and the click.
   *
   * @private
   */
  function _notifyRecipeDeleteReachedNothing() {
    services.notify?.warn?.(
      services.localize?.('FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteNothing') ||
        'Nothing was deleted — the selected recipes are no longer in this system.'
    );
  }

  /**
   * Delete a SET of recipes (issue 1132) through the manager's batched primitive: at most
   * ONE `recipes` write, at most ONE `craftingSystems` write and one actor-flag clean-up
   * for the whole set.
   *
   * `notify: false` is load-bearing rather than defensive. `RecipeManager.deleteRecipe`
   * raises its own singular info notification by default, so leaving it on would give the
   * GM N toasts AND the root's own summary for one action; the summary is the one that
   * names what the delete reached.
   *
   * Confirmation is the CALLER's, not this function's: the bulk delete is armed in the
   * panel beside an impact statement naming the counts, which is strictly more information
   * than a modal can carry.
   *
   * EVERY NO-WRITE PATH REPORTS (review round). The zero result used to be returned silently
   * when no selected id resolved, and the caller then returned `false` with nothing said —
   * a GM who clicks delete and sees nothing happen has been told nothing. It is reachable
   * without any failure at all: a concurrent client deleting the same recipes between the
   * describe and the click empties the resolvable set. Only the `catch` used to surface
   * anything.
   *
   * @param {Iterable<string>} recipeIds
   * @returns {Promise<{deleted: number, recipeIds: string[], recipeItemsAffected: number,
   *   recipeItemsRewritten: number, learnersAffected: number}>} The zero result on every
   *   no-write path, INCLUDING a failed write — the caller distinguishes them by `deleted`,
   *   never by truthiness.
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
      // The write genuinely throws for a caller whose `SETTINGS_MODIFY` has been revoked —
      // the server refuses and the socket dispatch rejects — so this path is reachable and
      // must not be silent. The GM sees the error; the caller returns the card to idle
      // with the selection intact.
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

    // This store DERIVES the recipe-item fields onto every projected row, and the editor
    // saves a whole row, so this store also strips them on the way back out (issue 978).
    // Symmetric by design: the projection's producer owns its write boundary. Stripping
    // here rather than in the editor keeps the draft carrying them for display.
    const modelUpdates = withoutDerivedRecipeProjectionFields(updates);
    // A payload that was ONLY derived fields has nothing left to author.
    if (Object.keys(modelUpdates).length === 0) return true;

    try {
      // The recipe editor only edits identity + the linked recipe item; a shell's
      // ingredients/results may still be empty. allowIncomplete keeps those
      // identity-only saves from being blocked by completeness validation.
      // notify defaults on; step authoring passes notify:false to avoid a toast
      // per keystroke-committed edit / reorder.
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
    // The world currency ladder rides along too (issue 1278). It is WORLD scope, so unlike the
    // gathering slice there is nothing on the system to fall back on: omit it and the export
    // carries an empty ladder, and every currency cost in it lands in the destination world as
    // an unresolvable unit id.
    const currencyConfig = services.getCurrencyConfigStore?.()?.get?.() || {};
    // And the world realm library (issue 1282), for the same reason and with the same
    // consequence: realms are WORLD scope, so omitting this exports an empty library and every
    // realm-gated environment in the payload lands in the destination world citing realm ids
    // that name nothing.
    //
    // THIS CALL AND `game.fabricate.exportSystem` ARE TWO PATHS TO ONE PAYLOAD. Every parameter
    // of `buildExportPayload` is defaulted, so a forgotten argument here produces a silently
    // empty slice rather than an error — which is precisely how the Manager's Export button
    // came to disagree with the API's (issue 642). `tests/export-system-gathering-bundle.test.js`
    // pins both call sites against the exporter's own signature so they cannot drift again.
    const travelConfig = services.getGatheringRealmStore?.()?.get?.() || {};
    // And the world character libraries (issue 1308), for the same reason and with the same
    // consequence.
    const characterLibraries = services.getCharacterLibrariesStore?.()?.get?.() || {};
    const payload = buildExportPayload(
      system,
      recipes,
      version,
      gatheringEnvironments,
      gatheringConfig,
      currencyConfig,
      travelConfig,
      characterLibraries
    );
    const filename = makeExportFilename(system.name);
    const json = JSON.stringify(payload, null, 2);
    await services.downloadFile(json, filename);
    services.notify.info(`Exported "${system.name}" (${recipes.length} recipes).`);
  }

  // Resolves to the post-import report content when an import ran to completion, and
  // to null otherwise (cancelled, failed, or an existing system that was skipped). The
  // manager root renders that content in `ImportReportModal`; before issue 877 the app
  // shell rendered a raw-HTML DialogV2 itself and this returned nothing.
  async function importSystem() {
    return (await services.renderSystemImportDialog()) ?? null;
  }

  // --- Item/Component management ---

  /**
   * The selected system's recipes, for the component delete-impact arithmetic (issue 1129).
   *
   * Both delete forms read this so the singular dialog and the bulk panel cannot report
   * different numbers for the same component.
   *
   * @param {string} sysId
   * @returns {object[]}
   * @private
   */
  function _selectedSystemRecipes(sysId) {
    return services.getRecipeManager?.()?.getRecipes?.({ craftingSystemId: sysId }) || [];
  }

  /**
   * What deleting this set of components would do, over the selected system's recipes
   * (issue 1129).
   *
   * Exposed as a store function rather than projected onto `itemCards`, deliberately. The
   * "recipes disabled" number cannot be computed per row — whether a recipe survives depends
   * on the WHOLE selection, since two selected components may be the only two options of one
   * ingredient group — so it needs recipe bodies. Computing it here keeps recipe JSON out of
   * Svelte props entirely and keeps `_itemCardSignature` free of a recipes input it would
   * otherwise need in order not to serve a stale count.
   *
   * Ids are resolved against the system first, so an id naming no component cannot inflate
   * the count the GM is shown.
   *
   * @param {Iterable<string>} componentIds
   * @returns {{deletable: number, deletableIds: string[], recipesRewritten: number,
   *   recipesDisabled: number}}
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

  /**
   * The localized copy the singular component delete dialog reads (issue 1156, the
   * component sibling of `_recipeDeleteDialogContent`). Before it, the dialog stated the
   * rewrite count unconditionally, so the commonest single delete of all — a component that
   * no recipe references — read "This rewrites 0 recipe(s) and disables 0 of them." The
   * `ui-integration` clause issue 1152 added says a zero consequence is omitted, not stated;
   * this obeys it.
   *
   * THREE KEYS, not four: `describeComponentDeleteImpact` only ever increments
   * `recipesDisabled` for a recipe already counted in `recipesRewritten` (a recipe cannot be
   * disabled by a delete without also being rewritten by it), so `disabled > 0` implies
   * `recipes > 0` — there is no independent fourth branch to reach.
   *
   * The count-carrying branches are FUTURE ("…will be rewritten…", "…will be disabled"): the
   * component still exists while the GM reads the sentence. The disable clause names the
   * TRANSITION rather than the resulting state ("enabled today and will be disabled"), the
   * same phrasing the bulk panel's `ImpactDisabled` row already settled on — the state
   * phrasing ("left uncraftable and disabled") this dialog used to carry reads an
   * already-disabled recipe as part of the count, which it is not.
   *
   * @param {string} name
   * @param {{recipesRewritten: number, recipesDisabled: number}} impact
   *   `describeComponentDeleteImpact` output.
   * @returns {string}
   * @private
   */
  function _componentDeleteDialogContent(name, impact) {
    const recipes = Number(impact?.recipesRewritten) || 0;
    const disabled = Number(impact?.recipesDisabled) || 0;
    const data = { name, recipes, disabled };
    const [key, fallback] = _componentDeleteDialogBranch(name, recipes, disabled);
    const localized = services.localize?.(key, data);
    if (localized && localized !== key) return localized;
    return fallback;
  }

  /**
   * The `[key, englishFallback]` pair for one of the three component dialog branches.
   *
   * @param {string} name
   * @param {number} recipes
   * @param {number} disabled
   * @returns {[string, string]}
   * @private
   */
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
   * Delete a SET of components (issue 1129) through the manager's batched primitive: ONE
   * `craftingSystems` write and ONE `recipes` write for the whole set.
   *
   * The delete is WARNED, not BLOCKED: every requested component is deleted regardless of
   * recipe usage, because the cascade rewrites every referencing recipe. There is no blocked
   * partition to compute or report.
   *
   * Confirmation is the CALLER's, not this function's: the bulk delete is armed in the panel
   * (`ArmedDangerButton`) beside an impact statement naming the counts, which is strictly
   * more information than a modal can carry.
   *
   * @param {Iterable<string>} componentIds
   * @returns {Promise<{deleted: number, recipesUpdated: number, recipesDisabled: number}>}
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
    } catch (error) {
      console.error('Fabricate | Failed to update component:', error);
      services.notify?.error?.(error?.message || 'Failed to update component');
      return false;
    }
  }

  /**
   * Apply one staged bulk edit to a SET of components in the selected system (issue 772)
   * through the manager's set-apply primitive: ONE persist and ONE refresh for the whole
   * selection, rather than N `updateComponent` round trips.
   *
   * `edit` carries only the STAGED axes — `category`, `addTags`, `removeTags`, `essences`,
   * `difficulty`. Presence is meaningful for the last two: an empty `essences` map and a
   * zero `difficulty` are instructions to CLEAR, so this passes the caller's object through
   * untouched rather than pruning "empty" keys.
   *
   * `refresh()` republishes `itemCards` and the `selectedSystem` projection, so the browser
   * rows re-render with no bespoke invalidation.
   *
   * Returns the write RESULT rather than a boolean, for two reasons. A boolean cannot
   * distinguish "wrote nothing" from "wrote", so an empty edit had to report `true` — a
   * success for a write that never happened. And the primitive already counts honestly:
   * it compares each component before and after and only counts the ones that genuinely
   * changed, so selecting five components and adding a tag three already carry is an
   * `updated` of two. Discarding that left the caller able to name only the SELECTION
   * size, which overstates what happened.
   *
   * `null` means nothing was written, for any reason — a bad or empty argument, no
   * selected system, or a throw that has already been reported to the GM.
   *
   * @param {Iterable<string>} componentIds
   * @param {object} [edit]
   * @returns {Promise<{updated: number, componentIds: string[]}|null>} the write result, or
   *   `null` when no write happened.
   */
  async function applyComponentBulkEdit(componentIds, edit = {}) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    const ids = Array.from(componentIds || [], String).filter(Boolean);
    if (ids.length === 0 || !sysId) return null;
    if (!edit || typeof edit !== 'object') return null;
    if (Object.keys(edit).length === 0) return null;

    try {
      const result = await systemManager.applyBulkEditToComponents(sysId, ids, edit);
      await refresh();
      return {
        updated: Number(result?.updated) || 0,
        componentIds: Array.isArray(result?.componentIds) ? result.componentIds : [],
      };
    } catch (error) {
      console.error('Fabricate | Failed to apply component bulk edit:', error);
      services.notify?.error?.(error?.message || 'Failed to apply component bulk edit');
      return null;
    }
  }

  /**
   * Apply one staged bulk edit to a SET of recipes in the selected system (issue 1010)
   * through the manager's set-apply primitive: at most ONE `recipes` world write, at most
   * ONE `craftingSystems` world write, and ONE refresh for the whole selection.
   *
   * Those are TWO settings, not a redundant pair: recipe-book membership is persisted on
   * the system and the recipe fields are persisted with the recipes, so a book axis and a
   * recipe axis staged together genuinely cost one write each.
   *
   * `edit` carries only the STAGED axes — `category`, `enabled`, `locked`, `checkTierId`,
   * `addBookIds`, `removeBookIds` — and is forwarded VERBATIM. Three of the six keys are
   * falsy but REAL: `enabled: false` (disable), `locked: false` (unlock) and
   * `checkTierId: null` (clear to the system default). Pruning "empty" keys would collapse
   * a present `checkTierId: null` into an absent one, and those are different instructions
   * — "clear the tier" versus "leave the tier alone". Everything downstream tests key
   * presence, never truthiness.
   *
   * Deliberately NOT routed through {@link withoutDerivedRecipeProjectionFields}. That
   * strip guards payloads built from a WHOLE projected recipe row, which carries
   * `recipeItemId` and its derived siblings; this edit is a hand-built six-key allowlist
   * emitted by `toBulkRecipeEdit` that can never carry one. A strip here would only
   * suggest otherwise.
   *
   * Returns the write RESULT rather than a boolean: a blocked enable is a PARTIAL success
   * — the recipe stays off while its other staged axes still land — which a boolean cannot
   * express, and the panel's post-apply notification is the authority on both counts.
   * `null` means nothing was written, for any reason: a bad or empty argument, no selected
   * system, or a throw that has already been reported to the GM.
   *
   * @param {Iterable<string>} recipeIds
   * @param {object} [edit]
   * @returns {Promise<object|null>} the normalized write result, or `null` when no write
   *   happened.
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
    duplicateEssence,
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
    openToolDraft,
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
    refresh,
    refreshGatheringConfig,
    refreshAccessRosters,
    resolveRecipeAccess,
    destroy,
  };
}

export {withoutDerivedRecipeProjectionFields, DERIVED_RECIPE_PROJECTION_FIELDS} from './adminRecipeRowProjection.js';