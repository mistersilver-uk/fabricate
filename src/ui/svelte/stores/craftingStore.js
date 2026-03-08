/**
 * craftingStore — Svelte store factory for the CraftingApp (T-110)
 *
 * All side-effects are injected via `services` so this module never touches
 * `game.*` directly.  Each call to createCraftingStore() produces a fresh,
 * isolated set of writable() instances.
 */
import { writable, get } from 'svelte/store';

const RECENTLY_CRAFTED_MAX = 10;

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
  showOnlyAvailable
) {
  const recipeManager = services.getRecipeManager();
  const visibilityService = services.getRecipeVisibilityService();
  const runManager = services.getCraftingRunManager();
  const worldTime = services.getWorldTime();
  const gameUser = services.getGameUser();

  // --- Actor lists ---
  const availableActors = services.getAvailableActors().map(actor => ({
    id: actor.id,
    name: actor.name,
    selected: craftingActor?.id === actor.id,
    isAssignedCharacter: gameUser?.character?.id === actor.id
  }));

  const ownedActors = services.getOwnedActors().map(actor => ({
    id: actor.id,
    name: actor.name,
    selected: componentSourceActors.some(a => a.id === actor.id),
    itemCount: actor.items?.size ?? 0
  }));

  // --- Active runs ---
  const activeRunsRaw = (runManager && craftingActor)
    ? runManager.getActiveRuns(craftingActor)
    : [];
  const activeRunsAllSorted = activeRunsRaw
    .filter(run => ['inProgress', 'waitingTime'].includes(run.status))
    .map(run => _buildRunDisplay(run, recipeManager, worldTime, 'active'))
    .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
  // Guard against duplicate run IDs (e.g. data corruption, race conditions) to prevent
  // Svelte each_key_duplicate errors in RunSummary.svelte.
  const seenActiveIds = new Set();
  const activeRuns = activeRunsAllSorted.filter(run => {
    if (seenActiveIds.has(run.id)) return false;
    seenActiveIds.add(run.id);
    return true;
  });
  const activeRunsByRecipeId = new Map();
  for (const run of activeRuns) {
    const list = activeRunsByRecipeId.get(run.recipeId) || [];
    list.push(run);
    activeRunsByRecipeId.set(run.recipeId, list);
  }

  // --- Run history ---
  const historyRaw = (runManager && craftingActor)
    ? runManager.getRunHistory(craftingActor, 10)
    : [];
  const runHistoryMapped = historyRaw
    .map(run => _buildRunDisplay(run, recipeManager, worldTime, 'history'));
  // Guard against duplicate run IDs in history (e.g. completeRun called twice) to prevent
  // Svelte each_key_duplicate errors in RunSummary.svelte.
  const seenHistoryIds = new Set();
  const runHistory = runHistoryMapped.filter(run => {
    if (seenHistoryIds.has(run.id)) return false;
    seenHistoryIds.add(run.id);
    return true;
  });

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
    recipes = recipes.filter(r => r.category === selectedCategory);
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
      if (!access.craftable) return false;
      return evaluations.get(r.id)?.canCraft === true;
    });
  }

  // --- Favourites & recents ---
  const favouriteIds = services.getSetting('favouriteRecipes') || [];
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
      name: recipe.name,
      description: recipe.description,
      img: recipe.img,
      category: recipe.category,
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
      resultDescription: recipe.getResultDescription(),
      ingredients: evaluation?.ingredientStates ?? [],
      essences: evaluation?.essenceStates ?? [],
      catalysts: evaluation?.catalystStates ?? [],
      isFavourite: favouriteIds.includes(recipe.id)
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
  const categories = [...new Set(visibleRecipes.map(r => r.category))].sort();

  return {
    recipes: preparedRecipes,
    activeRuns,
    runHistory,
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
    _resolveDefaultComponentSources(services, get(craftingActor))
  );
  const searchTerm = writable('');
  const selectedCategory = writable('');
  const showOnlyAvailable = writable(true);

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
    hasCraftingActor: false,
    hasComponentSources: false,
    totalRecipes: 0,
    showPagination: false
  });

  // --- refresh ---
  async function refresh() {
    const recipeManager = services.getRecipeManager();
    if (!recipeManager) {
      // Services not yet initialised — leave viewState as empty shell
      return;
    }

    const computed = _buildPreparedRecipes(
      services,
      get(craftingActor),
      get(componentSourceActors),
      get(searchTerm),
      get(selectedCategory),
      get(showOnlyAvailable)
    );

    viewState.set({
      ...computed,
      selectedCategory: get(selectedCategory),
      showOnlyAvailable: get(showOnlyAvailable),
      search: get(searchTerm)
    });
  }

  // --- Actions ---

  async function selectActor(actorId) {
    const actor = services.getAvailableActors().find(a => a.id === actorId) || null;
    craftingActor.set(actor);
    await services.setSetting('lastCraftingActor', actorId);
    await refresh();
  }

  async function toggleSourceActor(actorId, checked) {
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
      updated = current.filter(a => a.id !== actorId);
    }
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

  async function toggleFavourite(recipeId) {
    if (!recipeId) return;
    const current = services.getSetting('favouriteRecipes') || [];
    const updated = current.includes(recipeId)
      ? current.filter(id => id !== recipeId)
      : [...current, recipeId];
    await services.setSetting('favouriteRecipes', updated);
    await refresh();
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

    if (result.success) {
      services.notify.info(result.message);
    } else {
      services.notify.warn(result.message || 'Could not learn recipe');
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

  function destroy() {
    // No-op for now — hook cleanup would go here
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
    // Computed state
    viewState,
    // Actions
    selectActor,
    toggleSourceActor,
    setSearch,
    setCategory,
    toggleAvailable,
    toggleFavourite,
    craft,
    learnRecipe,
    cancelRun,
    restartRun,
    refresh,
    destroy
  };
}
