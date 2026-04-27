/**
 * craftingStore — Svelte store factory for the CraftingApp (T-110)
 *
 * All side-effects are injected via `services` so this module never touches
 * `game.*` directly.  Each call to createCraftingStore() produces a fresh,
 * isolated set of writable() instances.
 */
import { writable, get } from 'svelte/store';
import { aggregateShoppingList } from '../util/shoppingListAggregator.js';
import { localize } from '../util/foundryBridge.js';
import { itemMatchesComponentSource } from '../../../utils/sourceUuid.js';
import { normalizeRecipeCategory } from '../../../utils/recipeCategories.js';
import { accumulateItemEssences } from '../../../utils/essenceResolver.js';
import { SignatureValidator } from '../../../systems/SignatureValidator.js';
import { resolveAutoFill } from '../util/autoFillResolver.js';

const RECENTLY_CRAFTED_MAX = 10;
const DEFAULT_ACTOR_IMAGE = 'icons/svg/mystery-man.svg';

// Shared instance — expandGroupToComponentIds / expandIngredientToComponentIds
// do not use this._csm, so null is safe for these operations.
const _signatureValidator = new SignatureValidator(null);

// ---------------------------------------------------------------------------
// Module-private helper functions (ported from CraftingApp.js)
// ---------------------------------------------------------------------------

/**
 * Resolve the default crafting actor using the same priority order as
 * CraftingApp._getDefaultCraftingActor().
 *
 * 1. Saved setting (LAST_CRAFTING_ACTOR)
 * 2. User's assigned character
 * 3. First available actor
 */
function _resolveDefaultCraftingActor(services) {
  const savedId = services.getSetting('lastCraftingActor');
  if (savedId) {
    const saved = services.getAvailableActors().find(a => a.id === savedId);
    if (saved) return saved;
  }

  const user = services.getGameUser();
  if (user?.character) return user.character;

  const available = services.getAvailableActors();
  return available[0] || null;
}

/**
 * Resolve the default component source actors using the same priority order as
 * CraftingApp._getDefaultComponentSources().
 *
 * 1. Saved setting (LAST_COMPONENT_SOURCES)
 * 2. craftingActor if owned
 * 3. Empty array
 */
function _resolveDefaultComponentSources(services, craftingActor) {
  const savedIds = services.getSetting('lastComponentSources') || [];
  if (savedIds.length > 0) {
    const owned = services.getOwnedActors();
    const actors = savedIds.map(id => owned.find(a => a.id === id)).filter(Boolean);
    if (actors.length > 0) return actors;
  }

  if (craftingActor && craftingActor.isOwner) {
    return [craftingActor];
  }

  return [];
}

function _dedupeActors(actors = []) {
  const seen = new Set();
  const deduped = [];
  for (const actor of actors) {
    if (!actor?.id || seen.has(actor.id)) continue;
    seen.add(actor.id);
    deduped.push(actor);
  }
  return deduped;
}

function _sameActorIds(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((actor, index) => actor?.id === right[index]?.id);
}

function _ensureCraftingActorSource(craftingActor, sourceActors = []) {
  if (!craftingActor) return _dedupeActors(sourceActors);
  const sourceActor = sourceActors.find(actor => actor?.id === craftingActor.id) || craftingActor;
  return _dedupeActors([sourceActor, ...sourceActors]);
}

function _replaceRequiredCraftingSource(previousActor, nextActor, sourceActors = []) {
  const remainingSources = previousActor?.id && previousActor.id !== nextActor?.id
    ? sourceActors.filter(actor => actor?.id !== previousActor.id)
    : sourceActors;
  return _ensureCraftingActorSource(nextActor, remainingSources);
}

/**
 * Format a duration in seconds into a human-readable string.
 * Ported from CraftingApp._formatRemainingSeconds().
 */
function _formatRemainingSeconds(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  if (minutes < 60) return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min > 0 ? `${hours}h ${min}m` : `${hours}h`;
}

/**
 * Build the display object for a single crafting run.
 * Ported from CraftingApp._buildRunDisplay().
 */
function _buildRunDisplay(run, recipeManager, worldTime, scope = 'active') {
  const recipe = recipeManager.getRecipe(run.recipeId);
  const recipeName = recipe?.name || 'Unknown Recipe';
  const totalSteps = Array.isArray(run.steps) ? run.steps.length : 0;
  const currentIndex = Number.isFinite(Number(run.currentStepIndex))
    ? Number(run.currentStepIndex)
    : null;
  const currentStep = currentIndex != null ? run.steps?.[currentIndex] : null;
  const stepName = currentStep?.stepName || (currentIndex != null ? `Step ${currentIndex + 1}` : null);
  const remainingSeconds = currentStep?.timeGate?.availableAt
    ? Math.max(0, Math.ceil(Number(currentStep.timeGate.availableAt) - Number(worldTime)))
    : 0;
  const statusLabel = run.status === 'waitingTime'
    ? (remainingSeconds > 0
      ? `Waiting (${_formatRemainingSeconds(remainingSeconds)})`
      : 'Ready to Continue')
    : (run.status === 'inProgress'
      ? 'In Progress'
      : (run.status === 'succeeded'
        ? 'Succeeded'
        : (run.status === 'failed' ? 'Failed' : 'Cancelled')));

  return {
    id: run.id,
    recipeId: run.recipeId,
    recipeName,
    status: run.status,
    scope,
    statusLabel,
    stepLabel: stepName && totalSteps > 0
      ? `${stepName} (${Math.min(totalSteps, (currentIndex ?? 0) + 1)}/${totalSteps})`
      : null,
    remainingSeconds,
    isActive: scope === 'active',
    canContinue: run.status !== 'waitingTime' || remainingSeconds <= 0,
    canCancel: scope === 'active' && ['inProgress', 'waitingTime'].includes(run.status),
    steps: Array.isArray(run.steps) ? run.steps : [],
    currentStepIndex: currentIndex,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt
  };
}

function _findActorComponentItems(actor, component) {
  const items = Array.from(actor?.items || []);
  if (component?.sourceUuid || component?.sourceItemUuid || component?.fallbackItemIds?.length) {
    const byUuid = items.filter(item => itemMatchesComponentSource(item, component));
    if (byUuid.length > 0) return byUuid;
  }

  const name = component?.name;
  if (name) {
    return items.filter(item => item.name === name);
  }

  return [];
}

function _buildSalvageRunDisplay(run, systemManager, worldTime, scope = 'active') {
  const system = systemManager?.getSystem?.(run.craftingSystemId) || null;
  const component = (system?.components || []).find(entry => entry.id === run.componentId) || null;
  const componentName = component?.name || run.componentName || 'Unknown Component';
  const remainingSeconds = run?.timeGate?.availableAt
    ? Math.max(0, Math.ceil(Number(run.timeGate.availableAt) - Number(worldTime)))
    : 0;
  const statusLabel = run.status === 'waitingTime'
    ? (remainingSeconds > 0
      ? `Waiting (${_formatRemainingSeconds(remainingSeconds)})`
      : 'Resuming')
    : (run.status === 'inProgress'
      ? 'In Progress'
      : (run.status === 'succeeded'
        ? 'Succeeded'
        : (run.status === 'failed' ? 'Failed' : 'Cancelled')));

  return {
    id: run.id,
    runType: 'salvage',
    recipeId: null,
    recipeName: componentName,
    status: run.status,
    scope,
    statusLabel,
    stepLabel: system?.name ? `Salvage - ${system.name}` : 'Salvage',
    remainingSeconds,
    isActive: scope === 'active',
    canContinue: false,
    canCancel: scope === 'active' && ['inProgress', 'waitingTime'].includes(run.status),
    steps: [],
    currentStepIndex: null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    componentId: run.componentId,
    craftingSystemId: run.craftingSystemId
  };
}

function _buildSalvageEntries(
  services,
  craftingActor,
  searchTerm,
  showOnlyAvailable,
  salvageRunsByKey = new Map()
) {
  if (!craftingActor) return [];

  const systemManager = services.getCraftingSystemManager?.();
  const systems = systemManager?.getSystems?.() || [];
  const lowerSearch = String(searchTerm || '').trim().toLowerCase();
  const entries = [];

  for (const system of systems) {
    if (system?.features?.salvage !== true) continue;
    const components = Array.isArray(system.components) ? system.components : [];
    for (const component of components) {
      if (!component?.salvage?.enabled) continue;

      const matchingItems = _findActorComponentItems(craftingActor, component);
      const totalAvailable = matchingItems.reduce((sum, item) => sum + (Number(item.system?.quantity) || 1), 0);
      const ingredientQuantity = Number(component.salvage.ingredientQuantity) || 1;
      const activeRun = salvageRunsByKey.get(`${system.id}::${component.id}`) || null;
      const canSalvage = totalAvailable >= ingredientQuantity;
      const allowSalvageAction = !activeRun && canSalvage;
      const statusLabel = activeRun
        ? activeRun.statusLabel
        : (canSalvage ? 'Available' : `Need ${ingredientQuantity}, have ${totalAvailable}`);

      if (lowerSearch) {
        const haystack = `${component.name || ''} ${system.name || ''}`.toLowerCase();
        if (!haystack.includes(lowerSearch)) continue;
      }

      if (showOnlyAvailable && !allowSalvageAction && !activeRun) continue;

      entries.push({
        id: component.id,
        systemId: system.id,
        name: component.name || component.id,
        img: component.img || null,
        systemName: system.name || 'Crafting System',
        quantityAvailable: totalAvailable,
        quantityRequired: ingredientQuantity,
        canSalvage,
        allowSalvageAction,
        activeRunId: activeRun?.id || null,
        activeRunStatusLabel: activeRun?.statusLabel || null,
        statusLabel,
        buttonLabel: activeRun ? 'In Progress' : 'Salvage'
      });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function _resolveActiveCraftingSystem(services, recipes = []) {
  const craftingSystemManager = services.getCraftingSystemManager?.();
  if (!craftingSystemManager) return null;

  const systems = craftingSystemManager.getSystems?.() || [];
  if (systems.length === 0) return null;

  const systemsById = new Map(
    systems
      .filter(system => system?.id)
      .map(system => [system.id, system])
  );
  const recipeSystemIds = [...new Set(
    recipes
      .map(recipe => recipe?.craftingSystemId)
      .filter(systemId => systemId && systemsById.has(systemId))
  )];

  if (recipeSystemIds.length === 1) {
    return systemsById.get(recipeSystemIds[0]) || null;
  }

  if (recipeSystemIds.length > 1) {
    return null;
  }

  return systems.length === 1 ? systems[0] || null : null;
}

/**
 * Track a recently crafted recipe.  Prepends, deduplicates by recipeId, and
 * caps at RECENTLY_CRAFTED_MAX.
 */
async function _trackRecentCraft(services, recipeId) {
  const existing = services.getSetting('recentlyCrafted') || [];
  const newEntry = { recipeId, timestamp: Date.now() };
  const deduped = [newEntry, ...existing.filter(e => e.recipeId !== recipeId)];
  const capped = deduped.slice(0, RECENTLY_CRAFTED_MAX);
  await services.setSetting('recentlyCrafted', capped);
}

/**
 * Core recipe preparation — mirrors _prepareContext logic from CraftingApp.
 *
 * Returns the full set of view data: recipes, activeRuns, runHistory,
 * categories, favouriteRecipes, recentRecipes.
 */
function _buildPreparedRecipes(
  services,
  craftingActor,
  componentSourceActors,
  searchTerm,
  selectedCategory,
  showOnlyAvailable,
  showFavouritesOnly
) {
  const recipeManager = services.getRecipeManager();
  const visibilityService = services.getRecipeVisibilityService();
  const runManager = services.getCraftingRunManager();
  const salvageRunManager = services.getSalvageRunManager?.();
  const craftingSystemManager = services.getCraftingSystemManager?.();
  const worldTime = services.getWorldTime();
  const gameUser = services.getGameUser();

  // --- Actor lists ---
  const availableActors = services.getAvailableActors().map(actor => ({
    id: actor.id,
    name: actor.name,
    img: actor.img || DEFAULT_ACTOR_IMAGE,
    selected: craftingActor?.id === actor.id,
    isAssignedCharacter: gameUser?.character?.id === actor.id
  }));

  const selectableSourceActors = _dedupeActors([
    ...services.getOwnedActors(),
    ...componentSourceActors
  ]);
  const ownedActors = selectableSourceActors.map(actor => ({
    id: actor.id,
    name: actor.name,
    img: actor.img || DEFAULT_ACTOR_IMAGE,
    selected: componentSourceActors.some(a => a.id === actor.id),
    locked: craftingActor?.id === actor.id,
    itemCount: actor.items?.size ?? 0
  }));

  // --- Active runs ---
  const activeRunsRaw = (runManager && craftingActor)
    ? runManager.getActiveRuns(craftingActor)
    : [];
  const craftingActiveRunsAllSorted = activeRunsRaw
    .filter(run => ['inProgress', 'waitingTime'].includes(run.status))
    .map(run => _buildRunDisplay(run, recipeManager, worldTime, 'active'))
    .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
  // Guard against duplicate run IDs (e.g. data corruption, race conditions) to prevent
  // Svelte each_key_duplicate errors in RunSummary.svelte.
  const seenActiveIds = new Set();
  const craftingActiveRuns = craftingActiveRunsAllSorted.filter(run => {
    if (seenActiveIds.has(run.id)) return false;
    seenActiveIds.add(run.id);
    return true;
  });
  const activeRunsByRecipeId = new Map();
  for (const run of craftingActiveRuns) {
    const list = activeRunsByRecipeId.get(run.recipeId) || [];
    list.push(run);
    activeRunsByRecipeId.set(run.recipeId, list);
  }

  const salvageActiveRunsRaw = (salvageRunManager && craftingActor)
    ? salvageRunManager.getActiveRuns(craftingActor)
    : [];
  const salvageActiveRuns = salvageActiveRunsRaw
    .filter(run => ['inProgress', 'waitingTime'].includes(run.status))
    .map(run => _buildSalvageRunDisplay(run, craftingSystemManager, worldTime, 'active'))
    .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
  const salvageRunsByKey = new Map(
    salvageActiveRuns.map(run => [`${run.craftingSystemId}::${run.componentId}`, run])
  );

  // --- Run history ---
  const historyRaw = (runManager && craftingActor)
    ? runManager.getRunHistory(craftingActor, 10)
    : [];
  const craftingRunHistoryMapped = historyRaw
    .map(run => _buildRunDisplay(run, recipeManager, worldTime, 'history'));
  // Guard against duplicate run IDs in history (e.g. completeRun called twice) to prevent
  // Svelte each_key_duplicate errors in RunSummary.svelte.
  const seenHistoryIds = new Set();
  const craftingRunHistory = craftingRunHistoryMapped.filter(run => {
    if (seenHistoryIds.has(run.id)) return false;
    seenHistoryIds.add(run.id);
    return true;
  });

  const salvageHistoryRaw = (salvageRunManager && craftingActor)
    ? salvageRunManager.getRunHistory(craftingActor, 10)
    : [];
  const salvageRunHistory = salvageHistoryRaw
    .map(run => _buildSalvageRunDisplay(run, craftingSystemManager, worldTime, 'history'))
    .sort((a, b) => Number(b.finishedAt || b.startedAt || 0) - Number(a.finishedAt || a.startedAt || 0));

  const activeRuns = [...craftingActiveRuns, ...salvageActiveRuns]
    .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
  const runHistory = [...craftingRunHistory, ...salvageRunHistory]
    .sort((a, b) => Number(b.finishedAt || b.startedAt || 0) - Number(a.finishedAt || a.startedAt || 0));

  // --- Recipes ---
  let recipes = recipeManager.getRecipes({ enabled: true });

  if (visibilityService && craftingActor) {
    recipes = recipes.filter(recipe =>
      visibilityService.evaluateRecipeAccess({
        recipe,
        viewer: gameUser,
        craftingActor,
        componentSourceActors
      }).visible
    );
  }

  const showSimpleRecipesOnly = services.getSetting('showSimpleRecipesOnly');
  if (showSimpleRecipesOnly) {
    recipes = recipes.filter(r => r.isSimpleRecipe());
  }

  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    recipes = recipes.filter(r =>
      r.name.toLowerCase().includes(lower) ||
      r.description.toLowerCase().includes(lower)
    );
  }

  if (selectedCategory) {
    recipes = recipes.filter(r => normalizeRecipeCategory(r.category) === selectedCategory);
  }

  // --- Craftability evaluation ---
  const evaluations = new Map();
  for (const recipe of recipes) {
    if (componentSourceActors.length > 0) {
      evaluations.set(recipe.id, recipeManager.evaluateCraftability(componentSourceActors, recipe));
    } else {
      evaluations.set(recipe.id, {
        canCraft: false,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], catalysts: [] },
        ingredientStates: [],
        essenceStates: [],
        catalystStates: []
      });
    }
  }

  // --- Availability filter ---
  if (showOnlyAvailable && componentSourceActors.length > 0) {
    recipes = recipes.filter(r => {
      const access = visibilityService
        ? visibilityService.evaluateRecipeAccess({
          recipe: r,
          viewer: gameUser,
          craftingActor,
          componentSourceActors
        })
        : { craftable: true };
      if (access.reason === 'teaser') return true;
      if (!access.craftable) return false;
      return evaluations.get(r.id)?.canCraft === true;
    });
  }

  // --- Favourites-only filter ---
  const favouriteIds = services.getSetting('favouriteRecipes') || [];
  if (showFavouritesOnly) {
    recipes = recipes.filter(r => favouriteIds.includes(r.id));
  }

  // --- Recents ---
  const recentEntries = services.getSetting('recentlyCrafted') || [];

  // --- Prepare display data ---
  const preparedRecipes = recipes.map(recipe => {
    const evaluation = evaluations.get(recipe.id);
    const canCraft = evaluation?.canCraft ?? false;

    const access = visibilityService
      ? visibilityService.evaluateRecipeAccess({
        recipe,
        viewer: gameUser,
        craftingActor,
        componentSourceActors
      })
      : { craftable: true, reason: 'ok' };
    const teaserState = access.teaserState || null;
    const isTeaser = teaserState?.isTeaser === true;
    const teaserHiddenFields = teaserState?.hiddenFields ?? [];
    const craftable = access.craftable && canCraft;
    const recipeRuns = activeRunsByRecipeId.get(recipe.id) || [];
    const activeRun = recipeRuns[0] || null;
    const allowCraftAction = activeRun ? activeRun.canContinue : craftable;
    const statusLabel = !access.craftable
      ? (access.reason === 'locked'
        ? 'Locked'
        : (access.reason === 'knowledge' ? 'Unknown' : 'Restricted'))
      : (activeRun
        ? activeRun.statusLabel
        : (craftable ? 'Available' : 'Missing materials'));
    const canLearn = access.reason === 'knowledge' &&
      !!access.knowledge &&
      access.knowledge.hasLearned !== true &&
      Array.isArray(access.knowledge.matchedItems) &&
      access.knowledge.matchedItems.length > 0;

    return {
      id: recipe.id,
      craftingSystemId: recipe.craftingSystemId,
      name: recipe.name,
      description: isTeaser && teaserHiddenFields.includes('description') ? (teaserState.teaserDescription || 'FABRICATE.Teaser.HiddenDescription') : recipe.description,
      img: recipe.img,
      category: normalizeRecipeCategory(recipe.category),
      canCraft: craftable,
      allowCraftAction,
      accessReason: access.reason,
      statusLabel,
      activeRunId: activeRun?.id || '',
      activeRunCount: recipeRuns.length,
      hasMultipleActiveRuns: recipeRuns.length > 1,
      activeRunStatusLabel: activeRun?.statusLabel || null,
      activeRunStepLabel: activeRun?.stepLabel || null,
      activeRunRemainingSeconds: activeRun?.remainingSeconds || 0,
      craftButtonLabel: activeRun
        ? (activeRun.canContinue ? 'Continue' : 'Waiting')
        : 'Craft',
      canLearn,
      hasMultipleSets: recipe.ingredientSets.length > 1,
      resultDescription: isTeaser && teaserHiddenFields.includes('results') ? 'FABRICATE.Teaser.HiddenResults' : recipe.getResultDescription(),
      ingredients: isTeaser && teaserHiddenFields.includes('ingredients') ? [] : (evaluation?.ingredientStates ?? []),
      essences: isTeaser && teaserHiddenFields.includes('essences') ? [] : (evaluation?.essenceStates ?? []),
      catalysts: isTeaser && teaserHiddenFields.includes('catalysts') ? [] : (evaluation?.catalystStates ?? []),
      isFavourite: favouriteIds.includes(recipe.id),
      isTeaser,
      teaserProgress: teaserState?.progress ?? 0,
      teaserHiddenFields,
      teaserDescription: teaserState?.teaserDescription ?? ''
    };
  });

  const preparedById = new Map(preparedRecipes.map(r => [r.id, r]));

  const favouriteRecipes = favouriteIds
    .map(id => preparedById.get(id))
    .filter(Boolean);

  const recentRecipes = recentEntries
    .map(entry => {
      const recipe = preparedById.get(entry.recipeId);
      if (!recipe) return null;
      return { ...recipe, craftedAt: entry.timestamp };
    })
    .filter(Boolean);

  // --- Categories ---
  const allRecipes = recipeManager.getRecipes({ enabled: true });
  const visibleRecipes = showSimpleRecipesOnly
    ? allRecipes.filter(r => r.isSimpleRecipe())
    : allRecipes;
  const categories = [...new Set(visibleRecipes.map(r => normalizeRecipeCategory(r.category)))].sort();
  const salvageEntries = _buildSalvageEntries(
    services,
    craftingActor,
    searchTerm,
    showOnlyAvailable,
    salvageRunsByKey
  );

  return {
    recipes: preparedRecipes,
    activeRuns,
    runHistory,
    salvageEntries,
    categories,
    favouriteRecipes,
    recentRecipes,
    availableActors,
    ownedActors,
    hasCraftingActor: !!craftingActor,
    hasComponentSources: componentSourceActors.length > 0,
    totalRecipes: preparedRecipes.length,
    showPagination: false
  };
}

// ---------------------------------------------------------------------------
// Alchemy helpers
// ---------------------------------------------------------------------------

/**
 * Resolve which alchemy system should be selected, given the available
 * alchemy systems and persisted setting.
 *
 * Auto-select logic:
 * - If exactly 1 alchemy system: always select it
 * - If multiple: use persisted value (if valid), fall back to first
 * - If 0: return null
 */
function _resolveSelectedAlchemySystem(alchemySystems, persistedId) {
  if (alchemySystems.length === 0) return null;
  if (alchemySystems.length === 1) return alchemySystems[0];

  if (persistedId) {
    const persisted = alchemySystems.find(s => s.id === persistedId);
    if (persisted) return persisted;
  }

  return alchemySystems[0];
}

/**
 * Build the component palette for a given alchemy system and source actors.
 *
 * @param {object|null} system - The selected alchemy system
 * @param {object[]} sourceActors - Component source actors
 * @param {object[]} workbenchEntries - Current workbench entries [{ componentId, quantity }]
 * @returns {object[]} Palette entries [{ componentId, name, img, inventoryQuantity, workbenchQuantity, availableQuantity }]
 */
function _buildPalette(system, sourceActors, workbenchEntries) {
  if (!system) return [];

  const components = Array.isArray(system.components) ? system.components : [];
  const workbenchMap = new Map(workbenchEntries.map(e => [e.componentId, e.quantity]));

  const entries = components.map(component => {
    let inventoryQuantity = 0;
    for (const actor of sourceActors) {
      const items = _findActorComponentItems(actor, component);
      for (const item of items) {
        inventoryQuantity += Number(item.system?.quantity) || 1;
      }
    }

    const workbenchQuantity = workbenchMap.get(component.id) || 0;
    const availableQuantity = Math.max(0, inventoryQuantity - workbenchQuantity);

    return {
      componentId: component.id,
      name: component.name || component.id,
      img: component.img || null,
      inventoryQuantity,
      workbenchQuantity,
      availableQuantity
    };
  });
  entries.sort((a, b) => {
    const aAvail = a.availableQuantity > 0 ? 0 : 1;
    const bAvail = b.availableQuantity > 0 ? 0 : 1;
    if (aAvail !== bAvail) return aAvail - bAvail;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/**
 * Evaluate craftability of a recipe against the full palette inventory
 * (not inventory minus workbench — per spec, discovered recipe craftability
 * is based on full inventory).
 *
 * @param {object} recipe - Recipe with ingredientSets
 * @param {object[]} systemComponents - All components in system
 * @param {object[]} palette - Full palette entries (inventoryQuantity is full inventory)
 * @param {object[]} sourceActors - Component source actors
 * @returns {boolean} True if any ingredient set is fully satisfiable
 */
function _evaluateDiscoveredCraftability(recipe, systemComponents, palette, sourceActors = []) {
  const sets = Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [];
  if (sets.length === 0) return true; // No ingredients required

  const paletteMap = new Map(palette.map(e => [e.componentId, e.inventoryQuantity]));
  const sourceItems = sourceActors.flatMap(actor => Array.from(actor?.items || []));
  const availableEssences = accumulateItemEssences(sourceItems, {
    components: systemComponents,
    multiplyByQuantity: true
  });

  for (const set of sets) {
    const groups = Array.isArray(set.ingredientGroups) ? set.ingredientGroups : [];
    const committed = new Map();
    let fulfilled = true;

    for (const group of groups) {
      const quantity = Number(group.quantity) || 1;
      const candidateIds = _signatureValidator.expandGroupToComponentIds(group, systemComponents);
      let satisfied = false;

      for (const componentId of candidateIds) {
        const available = (paletteMap.get(componentId) || 0) - (committed.get(componentId) || 0);
        if (available >= quantity) {
          committed.set(componentId, (committed.get(componentId) || 0) + quantity);
          satisfied = true;
          break;
        }
      }

      if (!satisfied) {
        fulfilled = false;
        break;
      }
    }

    if (!fulfilled) continue;

    const essenceRequirements = set.essences || {};
    for (const [essenceId, requiredQty] of Object.entries(essenceRequirements)) {
      const need = Number(requiredQty);
      if (!Number.isFinite(need) || need <= 0) continue;

      const have = availableEssences[essenceId] || 0;

      if (have < need) {
        fulfilled = false;
        break;
      }
    }

    if (fulfilled) return true;
  }

  return false;
}

/**
 * Build the discovered recipes list for the alchemy panel.
 *
 * @param {object|null} system - Selected alchemy system
 * @param {object[]} systemComponents - Components in the system
 * @param {object[]} paletteEntries - Current palette (using inventoryQuantity for craftability)
 * @param {object[]} sourceActors - Component source actors
 * @param {object|null} craftingActor - Current crafting actor (has learnedRecipes flag)
 * @param {boolean} isGM - Whether the user is a GM
 * @param {string} searchTerm - Search filter
 * @param {boolean} craftableOnly - If true, only show craftable recipes
 * @param {Function} getRecipesForSystem - Gets recipes for a system id
 * @returns {object[]} Discovered recipe display entries
 */
function _buildDiscoveredRecipes(
  system,
  systemComponents,
  paletteEntries,
  sourceActors,
  craftingActor,
  isGM,
  searchTerm,
  craftableOnly,
  getRecipesForSystem
) {
  if (!system) return [];

  const allRecipes = getRecipesForSystem(system.id) || [];

  // Filter to visible (learned) recipes
  let visible = allRecipes.filter(recipe => {
    if (isGM) return true;
    // Non-GM: only show if actor has learned this recipe
    const learnedRecipes = craftingActor?.flags?.fabricate?.learnedRecipes || {};
    return learnedRecipes[recipe.id] === true;
  });

  // Search filter
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    visible = visible.filter(r => r.name?.toLowerCase().includes(lower));
  }

  // Build display entries with craftability
  const entries = visible.map(recipe => {
    const canCraft = _evaluateDiscoveredCraftability(recipe, systemComponents, paletteEntries, sourceActors);
    return {
      id: recipe.id,
      name: recipe.name,
      img: recipe.img || null,
      craftingSystemId: recipe.craftingSystemId,
      ingredientSets: recipe.ingredientSets,
      canCraft
    };
  });

  // Craftable-only filter
  if (craftableOnly) {
    return entries.filter(e => e.canCraft);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a new craftingStore.
 *
 * @param {object} services - Injected service accessors (never game.* directly)
 * @returns {object} Store API — writable stores + action functions
 */
export function createCraftingStore(services) {
  // --- Input writables ---
  const craftingActor = writable(_resolveDefaultCraftingActor(services));
  const componentSourceActors = writable(
    _ensureCraftingActorSource(
      get(craftingActor),
      _resolveDefaultComponentSources(services, get(craftingActor))
    )
  );
  const searchTerm = writable('');
  const selectedCategory = writable('');
  const showOnlyAvailable = writable(true);
  const showFavouritesOnly = writable(false);

  // --- Alchemy state ---
  const isAlchemyMode = writable(false);

  // --- Alchemy system selection (Task 2) ---
  const alchemySystems = writable([]);
  const selectedAlchemySystem = writable(null);

  // --- Tab visibility (Task 6) ---
  const hasAlchemyTab = writable(false);
  const hasCraftingTab = writable(false);
  const showTabBar = writable(false);
  const activeTab = writable('crafting');

  // --- Workbench (Task 3) ---
  // Array of { componentId, name, img, quantity }
  const workbench = writable([]);

  // --- Palette (Task 4) ---
  // Array of { componentId, name, img, inventoryQuantity, workbenchQuantity, availableQuantity }
  const palette = writable([]);

  // --- Discovered recipes (Task 5) ---
  const discoveredRecipes = writable([]);
  const discoveredRecipeSearch = writable('');
  const discoveredCraftableOnly = writable(false);

  // --- Filtered run views (Task 16) ---
  // Runs filtered to alchemy systems only (for AlchemyTab RunSummary)
  const alchemyRuns = writable([]);
  const alchemyRunHistory = writable([]);
  // Runs filtered to non-alchemy systems only (for CraftingTab RunSummary)
  const craftingRuns = writable([]);
  const craftingRunHistory = writable([]);

  // --- Shopping list state ---
  const shoppingList = writable([]);  // [{ recipeId, quantity }]
  const shoppingListExpanded = writable(false);
  const hookRegistrations = [];

  // --- Computed state ---
  const viewState = writable({
    recipes: [],
    activeRuns: [],
    runHistory: [],
    categories: [],
    favouriteRecipes: [],
    recentRecipes: [],
    availableActors: [],
    ownedActors: [],
    salvageEntries: [],
    hasCraftingActor: false,
    hasComponentSources: false,
    totalRecipes: 0,
    showPagination: false
  });

  // --- Internal: handle inventory changes from Foundry hooks ---
  function _handleInventoryChange(item) {
    const affectedActorId = item?.parent?.id;
    if (!affectedActorId) return;

    const actor = get(craftingActor);
    const sources = get(componentSourceActors);
    const isRelevant = actor?.id === affectedActorId ||
      sources.some(a => a.id === affectedActorId);
    if (!isRelevant) return;

    _recomputePalette();
    _clampWorkbench();
    _recomputeDiscoveredRecipes();
  }

  // --- Internal: clamp workbench quantities to current inventory ---
  function _clampWorkbench() {
    const currentPalette = get(palette);
    const invMap = new Map(currentPalette.map(e => [e.componentId, e.inventoryQuantity]));

    let changed = false;
    workbench.update(wb => {
      const clamped = wb.map(entry => {
        const maxQty = invMap.get(entry.componentId) ?? 0;
        if (entry.quantity > maxQty) {
          changed = true;
          return { ...entry, quantity: maxQty };
        }
        return entry;
      }).filter(entry => entry.quantity > 0);
      return clamped;
    });

    if (changed) _recomputePalette();
  }

  // --- Internal: recompute palette from current state ---
  function _recomputePalette() {
    const system = get(selectedAlchemySystem);
    const sources = get(componentSourceActors);
    const wb = get(workbench);
    palette.set(_buildPalette(system, sources, wb));
  }

  // --- Internal: recompute discovered recipes from current state ---
  function _recomputeDiscoveredRecipes() {
    const system = get(selectedAlchemySystem);
    if (!system) {
      discoveredRecipes.set([]);
      return;
    }

    const systemComponents = Array.isArray(system.components) ? system.components : [];
    const paletteEntries = get(palette);
    const sources = get(componentSourceActors);
    const actor = get(craftingActor);
    const gameUser = services.getGameUser();
    const isGM = gameUser?.isGM === true;
    const search = get(discoveredRecipeSearch);
    const craftableOnly = get(discoveredCraftableOnly);

    const craftingSystemManager = services.getCraftingSystemManager?.();
    const getRecipesForSystem = (id) =>
      craftingSystemManager?.getRecipesForSystem?.(id) || [];

    const entries = _buildDiscoveredRecipes(
      system,
      systemComponents,
      paletteEntries,
      sources,
      actor,
      isGM,
      search,
      craftableOnly,
      getRecipesForSystem
    );

    discoveredRecipes.set(entries);
  }

  // --- refresh ---
  async function refresh() {
    const recipeManager = services.getRecipeManager();
    if (!recipeManager) {
      // Services not yet initialised — leave viewState as empty shell
      return;
    }

    const normalizedSources = _ensureCraftingActorSource(
      get(craftingActor),
      get(componentSourceActors)
    );
    if (!_sameActorIds(normalizedSources, get(componentSourceActors))) {
      componentSourceActors.set(normalizedSources);
    }

    const computed = _buildPreparedRecipes(
      services,
      get(craftingActor),
      normalizedSources,
      get(searchTerm),
      get(selectedCategory),
      get(showOnlyAvailable),
      get(showFavouritesOnly)
    );
    const activeSystem = _resolveActiveCraftingSystem(services, computed.recipes);
    isAlchemyMode.set(activeSystem?.resolutionMode === 'alchemy');

    // --- Task 2: Compute alchemy system list and selection ---
    const craftingSystemManager = services.getCraftingSystemManager?.();
    const allSystems = craftingSystemManager?.getSystems?.() || [];
    const alchemySystemList = allSystems.filter(s => s?.resolutionMode === 'alchemy');
    const nonAlchemySystemList = allSystems.filter(s => s?.resolutionMode !== 'alchemy');

    alchemySystems.set(alchemySystemList);

    const persistedAlchemySystemId = services.getSetting('lastAlchemySystem') || '';
    const resolvedAlchemySystem = _resolveSelectedAlchemySystem(alchemySystemList, persistedAlchemySystemId);
    const previousSystem = get(selectedAlchemySystem);
    selectedAlchemySystem.set(resolvedAlchemySystem);

    // Clear workbench if the resolved system changed (e.g. stale persisted ID fallback)
    if (previousSystem?.id && resolvedAlchemySystem?.id !== previousSystem.id) {
      workbench.set([]);
    }

    // --- Task 6: Tab visibility ---
    const hasAlchemy = alchemySystemList.length > 0;
    const hasCrafting = nonAlchemySystemList.length > 0;
    hasAlchemyTab.set(hasAlchemy);
    hasCraftingTab.set(hasCrafting);
    showTabBar.set(hasAlchemy && hasCrafting);

    // --- Task 4: Palette ---
    _recomputePalette();

    // --- Task 5: Discovered recipes ---
    _recomputeDiscoveredRecipes();

    const currentShoppingList = get(shoppingList);
    let shoppingListData = null;
    if (currentShoppingList.length > 0) {
      shoppingListData = aggregateShoppingList(
        currentShoppingList,
        recipeManager,
        get(componentSourceActors)
      );
    }

    viewState.set({
      ...computed,
      selectedCategory: get(selectedCategory),
      showOnlyAvailable: get(showOnlyAvailable),
      search: get(searchTerm),
      shoppingListData
    });

    // --- Task 16: Filter runs by tab context ---
    // Build a set of recipe IDs that belong to alchemy systems
    const alchemySystemIds = new Set(alchemySystemList.map(s => s.id));
    const allKnownRecipes = recipeManager.getRecipes({ enabled: true });
    const alchemyRecipeIds = new Set(
      allKnownRecipes
        .filter(r => alchemySystemIds.has(r.craftingSystemId))
        .map(r => r.id)
    );

    const activeRunsAll = computed.activeRuns || [];
    const runHistoryAll = computed.runHistory || [];

    alchemyRuns.set(activeRunsAll.filter(r => r.recipeId && alchemyRecipeIds.has(r.recipeId)));
    alchemyRunHistory.set(runHistoryAll.filter(r => r.recipeId && alchemyRecipeIds.has(r.recipeId)));
    craftingRuns.set(activeRunsAll.filter(r => !r.recipeId || !alchemyRecipeIds.has(r.recipeId)));
    craftingRunHistory.set(runHistoryAll.filter(r => !r.recipeId || !alchemyRecipeIds.has(r.recipeId)));
  }

  if (globalThis.Hooks?.on && globalThis.Hooks?.off) {
    hookRegistrations.push(['updateWorldTime', Hooks.on('updateWorldTime', () => {
      void refresh();
    })]);
    hookRegistrations.push(['fabricate.ready', Hooks.on('fabricate.ready', () => {
      void refresh();
    })]);
    hookRegistrations.push(['updateItem', Hooks.on('updateItem', (item) => {
      _handleInventoryChange(item);
    })]);
    hookRegistrations.push(['createItem', Hooks.on('createItem', (item) => {
      _handleInventoryChange(item);
    })]);
    hookRegistrations.push(['deleteItem', Hooks.on('deleteItem', (item) => {
      _handleInventoryChange(item);
    })]);
  }

  // --- Actions ---

  async function selectActor(actorId) {
    const previousActor = get(craftingActor);
    const actor = services.getAvailableActors().find(a => a.id === actorId) || null;
    craftingActor.set(actor);
    const updatedSources = _replaceRequiredCraftingSource(
      previousActor,
      actor,
      get(componentSourceActors)
    );
    componentSourceActors.set(updatedSources);
    await services.setSetting('lastCraftingActor', actorId);
    await services.setSetting('lastComponentSources', updatedSources.map(a => a.id));
    await refresh();
  }

  async function toggleSourceActor(actorId, checked) {
    const currentCraftingActor = get(craftingActor);
    const current = get(componentSourceActors);
    let updated;
    if (checked) {
      if (!current.find(a => a.id === actorId)) {
        const actor = services.getOwnedActors().find(a => a.id === actorId);
        if (actor) {
          updated = [...current, actor];
        } else {
          updated = current;
        }
      } else {
        updated = current;
      }
    } else {
      updated = currentCraftingActor?.id === actorId
        ? current
        : current.filter(a => a.id !== actorId);
    }
    updated = _ensureCraftingActorSource(currentCraftingActor, updated);
    componentSourceActors.set(updated);
    await services.setSetting('lastComponentSources', updated.map(a => a.id));
    await refresh();
  }

  async function setSearch(term) {
    searchTerm.set(term);
    await refresh();
  }

  async function setCategory(category) {
    selectedCategory.set(category);
    await refresh();
  }

  async function toggleAvailable() {
    showOnlyAvailable.update(v => !v);
    await refresh();
  }

  async function toggleFavouritesOnly() {
    showFavouritesOnly.update(v => !v);
    await refresh();
  }

  async function toggleFavourite(recipeId) {
    if (!recipeId) return;
    const current = services.getSetting('favouriteRecipes') || [];
    const updated = current.includes(recipeId)
      ? current.filter(id => id !== recipeId)
      : [...current, recipeId];
    await services.setSetting('favouriteRecipes', updated);
    await refresh();
  }

  // --- Task 2: Alchemy system selection action ---

  async function selectAlchemySystem(systemId) {
    await services.setSetting('lastAlchemySystem', systemId);
    const systems = get(alchemySystems);
    const system = systems.find(s => s.id === systemId) || null;
    selectedAlchemySystem.set(system);
    // Clear workbench when switching systems
    workbench.set([]);
    _recomputePalette();
    _recomputeDiscoveredRecipes();
  }

  // --- Task 6: Tab action ---

  function setActiveTab(tab) {
    activeTab.set(tab);
  }

  // --- Task 3: Workbench actions ---

  function addToWorkbench(componentId) {
    const currentPalette = get(palette);
    const paletteEntry = currentPalette.find(e => e.componentId === componentId);

    // Enforce max = availableQuantity (inventory minus current workbench)
    // If no palette entry, we still allow adding (graceful degradation)
    // but if palette says available = 0, do not add
    if (paletteEntry && paletteEntry.availableQuantity <= 0) return;

    const currentWb = get(workbench);
    const existing = currentWb.find(e => e.componentId === componentId);

    if (existing) {
      workbench.update(wb =>
        wb.map(e =>
          e.componentId === componentId
            ? { ...e, quantity: e.quantity + 1 }
            : e
        )
      );
    } else {
      const name = paletteEntry?.name || componentId;
      const img = paletteEntry?.img || null;
      workbench.update(wb => [...wb, { componentId, name, img, quantity: 1 }]);
    }

    // Recompute palette to reflect updated workbenchQuantity / availableQuantity
    _recomputePalette();
  }

  function removeFromWorkbench(componentId) {
    workbench.update(wb => {
      const entry = wb.find(e => e.componentId === componentId);
      if (!entry) return wb;
      if (entry.quantity <= 1) {
        return wb.filter(e => e.componentId !== componentId);
      }
      return wb.map(e =>
        e.componentId === componentId
          ? { ...e, quantity: e.quantity - 1 }
          : e
      );
    });
    _recomputePalette();
  }

  function clearWorkbench() {
    workbench.set([]);
    _recomputePalette();
  }

  async function submitWorkbench() {
    const craftingEngine = services.getCraftingEngine();
    if (!craftingEngine) {
      services.notify.error('Crafting engine is unavailable. Check module initialization.');
      return;
    }

    const actor = get(craftingActor);
    if (!actor) {
      services.notify.error('Please select a crafting actor');
      return;
    }

    const sources = get(componentSourceActors);
    if (sources.length === 0) {
      services.notify.error('Please select at least one component source actor');
      return;
    }

    const wb = get(workbench);
    if (wb.length === 0) {
      services.notify.warn('Add some alchemy ingredients first');
      return;
    }

    const system = get(selectedAlchemySystem);

    // Convert workbench entries to item refs for craftAlchemy
    // For each workbench entry { componentId, quantity }, find matching
    // actor items and include `quantity` items.
    const craftingSystemManager = services.getCraftingSystemManager?.();
    const allSystems = craftingSystemManager?.getSystems?.() || [];
    const systemObj = system
      ? (allSystems.find(s => s.id === system.id) || system)
      : null;
    const systemComponents = Array.isArray(systemObj?.components) ? systemObj.components : [];

    const items = [];
    const missingComponents = [];
    for (const entry of wb) {
      const component = systemComponents.find(c => c.id === entry.componentId);
      let found = [];
      for (const source of sources) {
        if (component) {
          found = _findActorComponentItems(source, component);
        }
        if (found.length > 0) break;
      }

      // Add `quantity` refs — use the found items, cycling if needed
      let remaining = entry.quantity;
      for (const item of found) {
        if (remaining <= 0) break;
        const itemQty = Number(item.system?.quantity) || 1;
        const take = Math.min(remaining, itemQty);
        for (let i = 0; i < take; i++) {
          items.push(item);
          remaining--;
        }
      }

      if (remaining > 0) {
        missingComponents.push(entry.name || entry.componentId);
      }
    }

    if (items.length === 0) {
      services.notify.error(localize('FABRICATE.Alchemy.ComponentsNotFound'));
      return;
    }

    if (missingComponents.length > 0) {
      services.notify.warn(localize('FABRICATE.Alchemy.ComponentsMissing').replace('{names}', missingComponents.join(', ')));
    }

    const result = await craftingEngine.craftAlchemy(actor, sources, items, {
      craftingSystemId: system?.id
    });

    if (result.success) {
      services.notify.info(result.message);
    } else if (result.disposition === 'no-match') {
      services.notify.warn(localize('FABRICATE.Alchemy.NoMatch'));
    } else {
      services.notify.error(result.message);
    }

    clearWorkbench();
    await refresh();
  }

  // Backward-compat thin wrapper (Task 15): delegates to submitWorkbench
  async function submitAlchemyAttempt() {
    return submitWorkbench();
  }

  // --- Task 5: Discovered recipes + auto-fill actions ---

  function setDiscoveredRecipeSearch(term) {
    discoveredRecipeSearch.set(term);
    _recomputeDiscoveredRecipes();
  }

  function toggleDiscoveredCraftableOnly() {
    discoveredCraftableOnly.update(v => !v);
    _recomputeDiscoveredRecipes();
  }

  async function autoFill(recipeId) {
    const system = get(selectedAlchemySystem);
    if (!system) return;

    const craftingSystemManager = services.getCraftingSystemManager?.();
    const getRecipesForSystem = (id) =>
      craftingSystemManager?.getRecipesForSystem?.(id) || [];

    const systemRecipes = getRecipesForSystem(system.id);
    const recipe = systemRecipes.find(r => r.id === recipeId);
    if (!recipe) return;

    const systemComponents = Array.isArray(system.components) ? system.components : [];

    // resolveAutoFill reads palette[].inventoryQuantity (full inventory,
    // not availableQuantity) which is correct per spec — craftability is
    // evaluated against full inventory, not inventory minus workbench.
    const currentPalette = get(palette);

    const expandGroupFn = (group, comps) =>
      _signatureValidator.expandGroupToComponentIds(group, comps);

    const { entries, unfulfilled } = resolveAutoFill(recipe, systemComponents, currentPalette, expandGroupFn);

    // Clear workbench first, then populate with resolved entries
    workbench.set([]);
    _recomputePalette();

    for (const entry of entries) {
      // Add the resolved quantity by calling addToWorkbench multiple times
      // (to respect the palette's max enforcement)
      for (let i = 0; i < entry.quantity; i++) {
        addToWorkbench(entry.componentId);
      }
    }

    if (unfulfilled.length > 0) {
      services.notify.warn(
        localize('FABRICATE.Alchemy.AutoFillPartial').replace('{count}', String(unfulfilled.length))
      );
    } else if (entries.length > 0) {
      services.notify.info(localize('FABRICATE.Alchemy.AutoFillComplete'));
    }
  }

  async function craft(recipeId, opts = {}) {
    const { skipConfirm = false, runId = null } = opts;
    const recipeManager = services.getRecipeManager();
    if (!recipeManager) {
      services.notify.error('Fabricate is still initializing. Please try again.');
      return;
    }

    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe) {
      services.notify.error('Recipe not found');
      return;
    }

    const actor = get(craftingActor);
    if (!actor) {
      services.notify.error('Please select a crafting actor');
      return;
    }

    const sources = get(componentSourceActors);
    if (sources.length === 0) {
      services.notify.error('Please select at least one component source actor');
      return;
    }

    const autoCraft = services.getSetting('autoCraft');
    if (!autoCraft && !skipConfirm) {
      const confirmed = await services.confirmDialog({
        title: `Craft ${recipe.name}?`,
        content: `
          <p>Are you sure you want to craft <strong>${recipe.name}</strong>?</p>
          <p>This will consume the required ingredients from your selected source actors.</p>
          <p>Results will be added to <strong>${actor.name}</strong>.</p>
        `,
        yes: () => true,
        no: () => false
      });
      if (!confirmed) return;
    }

    const craftingEngine = services.getCraftingEngine();
    if (!craftingEngine) {
      services.notify.error('Crafting engine is unavailable. Check module initialization.');
      return;
    }

    const result = await craftingEngine.craft(actor, sources, recipe, null, { runId });

    if (result.success) {
      services.notify.info(result.message);
      await _trackRecentCraft(services, recipeId);
    } else {
      services.notify.error(result.message);
    }

    await refresh();
  }

  async function learnRecipe(recipeId) {
    const recipeManager = services.getRecipeManager();
    if (!recipeManager) {
      services.notify.error('Fabricate is still initializing. Please try again.');
      return;
    }

    const visibilityService = services.getRecipeVisibilityService();
    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe || !visibilityService) return;

    const actor = get(craftingActor);
    if (!actor) {
      services.notify.error('Please select a crafting actor');
      return;
    }

    const result = await visibilityService.learnRecipe({
      viewer: services.getGameUser(),
      recipe,
      craftingActor: actor,
      componentSourceActors: get(componentSourceActors)
    });
    const localizedMessage = result.message
      ? localize(result.message, result.messageData)
      : localize('FABRICATE.Knowledge.CouldNotLearnRecipe');

    if (result.success) {
      services.notify.info(localizedMessage);
    } else {
      services.notify.warn(localizedMessage);
    }

    await refresh();
  }

  async function salvage(systemId, componentId, opts = {}) {
    const { skipConfirm = false, runId = null } = opts;
    const actor = get(craftingActor);
    if (!actor) {
      services.notify.error('Please select a crafting actor');
      return;
    }

    const craftingSystemManager = services.getCraftingSystemManager?.();
    const system = craftingSystemManager?.getSystem?.(systemId);
    const component = (system?.components || []).find(entry => entry.id === componentId) || null;
    if (!system || !component) {
      services.notify.error('Salvage component not found');
      return;
    }

    const autoCraft = services.getSetting('autoCraft');
    if (!autoCraft && !skipConfirm) {
      const confirmed = await services.confirmDialog({
        title: `Salvage ${component.name}?`,
        content: `
          <p>Are you sure you want to salvage <strong>${component.name}</strong>?</p>
          <p>Results will be added to <strong>${actor.name}</strong>.</p>
        `,
        yes: () => true,
        no: () => false
      });
      if (!confirmed) return;
    }

    const craftingEngine = services.getCraftingEngine?.();
    if (!craftingEngine?.salvage) {
      services.notify.error('Crafting engine is unavailable. Check module initialization.');
      return;
    }

    const result = await craftingEngine.salvage(actor.uuid, systemId, componentId, { runId });
    if (result.success) {
      services.notify.info(result.message);
    } else {
      services.notify.error(result.message);
    }

    await refresh();
  }

  async function cancelRun(runId) {
    const actor = get(craftingActor);
    if (!actor) {
      services.notify.warn('Select a crafting actor first.');
      return;
    }

    const runManager = services.getCraftingRunManager();
    if (!runManager) return;

    const run = runManager.getActiveRun(actor, runId);
    if (!run) {
      services.notify.warn('Active crafting run not found.');
      return;
    }

    const recipeManager = services.getRecipeManager();
    const recipe = recipeManager?.getRecipe(run.recipeId);

    const confirmed = await services.confirmDialog({
      title: 'Cancel Crafting Run?',
      content: `<p>Cancel in-progress run for <strong>${recipe?.name || 'Unknown Recipe'}</strong>?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    const cancelled = await runManager.cancelRun(actor, runId);
    if (!cancelled) {
      services.notify.error('Unable to cancel crafting run.');
      return;
    }
    services.notify.info(`Cancelled crafting run for ${recipe?.name || 'recipe'}.`);
    await refresh();
  }

  async function cancelSalvageRun(runId) {
    const actor = get(craftingActor);
    if (!actor) {
      services.notify.warn('Select a crafting actor first.');
      return;
    }

    const salvageRunManager = services.getSalvageRunManager?.();
    if (!salvageRunManager) return;

    const run = salvageRunManager.getActiveRun(actor, runId);
    if (!run) {
      services.notify.warn('Active salvage run not found.');
      return;
    }

    const craftingSystemManager = services.getCraftingSystemManager?.();
    const system = craftingSystemManager?.getSystem?.(run.craftingSystemId);
    const component = (system?.components || []).find(entry => entry.id === run.componentId) || null;

    const confirmed = await services.confirmDialog({
      title: 'Cancel Salvage Run?',
      content: `<p>Cancel in-progress salvage for <strong>${component?.name || 'Unknown Component'}</strong>?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    const cancelled = await salvageRunManager.cancelRun(actor, runId);
    if (!cancelled) {
      services.notify.error('Unable to cancel salvage run.');
      return;
    }

    services.notify.info(`Cancelled salvage run for ${component?.name || 'component'}.`);
    await refresh();
  }

  async function restartRun(recipeId, runId) {
    const actor = get(craftingActor);
    if (!actor) {
      services.notify.warn('Select a crafting actor first.');
      return;
    }

    const runManager = services.getCraftingRunManager();
    if (!runManager) return;

    const run = runManager.getActiveRun(actor, runId);
    if (!run) {
      services.notify.warn('Active crafting run not found.');
      return;
    }

    const recipeManager = services.getRecipeManager();
    const recipe = recipeManager?.getRecipe(recipeId);

    const confirmed = await services.confirmDialog({
      title: 'Restart Crafting Run?',
      content: `<p>Cancel the current run for <strong>${recipe?.name || 'Unknown Recipe'}</strong> and start over from step 1?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    const cancelled = await runManager.cancelRun(actor, runId);
    if (!cancelled) {
      services.notify.error('Unable to restart run because cancellation failed.');
      return;
    }

    await craft(recipeId, { skipConfirm: true, runId: null });
  }

  async function addToShoppingList(recipeId) {
    shoppingList.update(list => {
      const existing = list.find(e => e.recipeId === recipeId);
      if (existing) {
        return list.map(e =>
          e.recipeId === recipeId ? { ...e, quantity: e.quantity + 1 } : e
        );
      }
      return [...list, { recipeId, quantity: 1 }];
    });
    shoppingListExpanded.set(true);
    await refresh();
  }

  async function removeFromShoppingList(recipeId) {
    shoppingList.update(list => list.filter(e => e.recipeId !== recipeId));
    await refresh();
  }

  async function setShoppingListQuantity(recipeId, quantity) {
    if (quantity <= 0) {
      await removeFromShoppingList(recipeId);
      return;
    }
    shoppingList.update(list =>
      list.map(e =>
        e.recipeId === recipeId ? { ...e, quantity } : e
      )
    );
    await refresh();
  }

  async function clearShoppingList() {
    shoppingList.set([]);
    await refresh();
  }

  function toggleShoppingListExpanded() {
    shoppingListExpanded.update(v => !v);
  }

  function destroy() {
    if (globalThis.Hooks?.off) {
      for (const [eventName, hookId] of hookRegistrations) {
        Hooks.off(eventName, hookId);
      }
    }
  }

  // Trigger initial computation
  refresh();

  return {
    // Writable stores (inputs)
    craftingActor,
    componentSourceActors,
    searchTerm,
    selectedCategory,
    showOnlyAvailable,
    showFavouritesOnly,
    // Computed state
    viewState,
    // Alchemy state
    isAlchemyMode,
    // Task 2: Alchemy system selection
    alchemySystems,
    selectedAlchemySystem,
    selectAlchemySystem,
    // Task 6: Tab visibility
    hasAlchemyTab,
    hasCraftingTab,
    showTabBar,
    activeTab,
    setActiveTab,
    // Task 3: Workbench
    workbench,
    addToWorkbench,
    removeFromWorkbench,
    clearWorkbench,
    submitWorkbench,
    // Task 4: Palette
    palette,
    // Task 5: Discovered recipes
    discoveredRecipes,
    discoveredRecipeSearch,
    discoveredCraftableOnly,
    setDiscoveredRecipeSearch,
    toggleDiscoveredCraftableOnly,
    autoFill,
    // Task 16: Filtered run views
    alchemyRuns,
    alchemyRunHistory,
    craftingRuns,
    craftingRunHistory,
    // Actions
    selectActor,
    toggleSourceActor,
    setSearch,
    setCategory,
    toggleAvailable,
    toggleFavouritesOnly,
    toggleFavourite,
    craft,
    salvage,
    learnRecipe,
    cancelRun,
    cancelSalvageRun,
    restartRun,
    refresh,
    destroy,
    // Backward compat
    submitAlchemyAttempt,
    // Shopping list stores
    shoppingList,
    shoppingListExpanded,
    // Shopping list actions
    addToShoppingList,
    removeFromShoppingList,
    setShoppingListQuantity,
    clearShoppingList,
    toggleShoppingListExpanded
  };
}
