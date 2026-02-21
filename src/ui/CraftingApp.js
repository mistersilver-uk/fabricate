import { confirmDialog, renderDialog } from './foundryCompat.js';
import { getTemplatePath } from './templatePaths.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { getFabricateFlag } from '../config/flags.js';

/**
 * Player Crafting Interface
 * Shows available recipes and allows players to craft items
 */
export class CraftingApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(options = {}) {
    super(options);

    // Actor selection state
    this.craftingActor = this._getDefaultCraftingActor();
    this.componentSourceActors = this._getDefaultComponentSources();

    // UI state
    this.searchTerm = '';
    this.selectedCategory = '';
    this.showOnlyAvailable = true;
  }

  _getSetting(key) {
    return getSetting(key);
  }

  async _setSetting(key, value) {
    return setSetting(key, value);
  }

  _getRecipeManager() {
    return game?.fabricate?.getRecipeManager?.() || null;
  }

  _getRecipeVisibilityService() {
    return game?.fabricate?.getRecipeVisibilityService?.() || null;
  }

  _getRunManager() {
    return game?.fabricate?.getCraftingRunManager?.() || null;
  }

  _getCraftingEngine() {
    return game?.fabricate?.getCraftingEngine?.() || null;
  }

  async _confirmDialog(options) {
    return confirmDialog(options);
  }

  _renderDialog(options) {
    return renderDialog(options);
  }

  _notifyInfo(message) {
    ui.notifications.info(message);
  }

  _notifyWarn(message) {
    ui.notifications.warn(message);
  }

  _notifyError(message) {
    ui.notifications.error(message);
  }

  _createChatMessage(data) {
    return ChatMessage.create(data);
  }

  static DEFAULT_OPTIONS = {
    id: 'fabricate-crafting',
    classes: ['fabricate', 'crafting-app'],
    tag: 'div',
    window: {
      title: 'Crafting',
      icon: 'fa-solid fa-hammer',
      resizable: true
    },
    position: {
      width: 700,
      height: 800
    },
    actions: {
      toggleSourceActor: this._onToggleSourceActor,
      search: this._onSearch,
      toggleAvailable: this._onToggleAvailable,
      craft: this._onCraft,
      showDetails: this._onShowDetails,
      learnRecipe: this._onLearnRecipe,
      showRunDetails: this._onShowRunDetails,
      cancelRun: this._onCancelRun,
      restartRun: this._onRestartRun
    }
  };

  static get PARTS() {
    return {
      recipes: {
        template: getTemplatePath('crafting-app.hbs')
      }
    };
  }

  /**
   * Get default crafting actor with smart fallbacks
   * @private
   */
  _getDefaultCraftingActor() {
    // 1. Try saved setting
    const savedId = this._getSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR);
    if (savedId) {
      const saved = game.actors.get(savedId);
      if (saved) return saved;
    }

    // 2. Try user's assigned character
    if (game.user.character) return game.user.character;

    // 3. Fall back to first observable actor
    const availableActors = this._getAvailableActors();
    return availableActors[0] || null;
  }

  /**
   * Get default component source actors with smart fallbacks
   * @private
   */
  _getDefaultComponentSources() {
    // 1. Try saved setting
    const savedIds = this._getSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES) || [];
    if (savedIds.length > 0) {
      const actors = savedIds.map(id => game.actors.get(id)).filter(a => a);
      if (actors.length > 0) return actors;
    }

    // 2. Default to crafting actor if owned
    if (this.craftingActor && this.craftingActor.isOwner) {
      return [this.craftingActor];
    }

    // 3. Empty array
    return [];
  }

  /**
   * Get all actors player can select as crafting actor (result destination)
   * Excludes NPCs - only player characters
   * @private
   */
  _getAvailableActors() {
    return game.actors.filter(a =>
      a.type !== 'group' &&
      a.type !== 'npc' &&
      a.testUserPermission(game.user, "OBSERVER")
    );
  }

  /**
   * Get all actors player can use as component sources
   * Excludes NPCs - only player characters
   * @private
   */
  _getOwnedActors() {
    return game.actors.filter(a =>
      a.type !== 'group' &&
      a.type !== 'npc' &&
      a.isOwner
    );
  }

  /**
   * Accumulate essences from available items
   * @private
   */
  _accumulateEssences(items) {
    const accumulated = {};

    for (const item of items) {
      const itemEssences = getFabricateFlag(item, 'essences', {});
      for (const [essenceType, quantity] of Object.entries(itemEssences)) {
        accumulated[essenceType] = (accumulated[essenceType] || 0) + quantity;
      }
    }

    return accumulated;
  }

  _formatRemainingSeconds(seconds) {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (value < 60) return `${value}s`;
    const minutes = Math.floor(value / 60);
    const remainder = value % 60;
    if (minutes < 60) return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const min = minutes % 60;
    return min > 0 ? `${hours}h ${min}m` : `${hours}h`;
  }

  _buildRunDisplay(run, recipeManager, worldTime = Number(game.time?.worldTime || 0), scope = 'active') {
    const recipe = recipeManager.getRecipe(run.recipeId);
    const recipeName = recipe?.name || 'Unknown Recipe';
    const totalSteps = Array.isArray(run.steps) ? run.steps.length : 0;
    const currentIndex = Number.isFinite(Number(run.currentStepIndex)) ? Number(run.currentStepIndex) : null;
    const currentStep = currentIndex != null ? run.steps?.[currentIndex] : null;
    const stepName = currentStep?.stepName || (currentIndex != null ? `Step ${currentIndex + 1}` : null);
    const remainingSeconds = currentStep?.timeGate?.availableAt
      ? Math.max(0, Math.ceil(Number(currentStep.timeGate.availableAt) - Number(worldTime)))
      : 0;
    const statusLabel = run.status === 'waitingTime'
      ? (remainingSeconds > 0 ? `Waiting (${this._formatRemainingSeconds(remainingSeconds)})` : 'Ready to Continue')
      : (run.status === 'inProgress'
        ? 'In Progress'
        : (run.status === 'succeeded' ? 'Succeeded' : (run.status === 'failed' ? 'Failed' : 'Cancelled')));

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

  _resolveRunEntry(runId, scope = 'active') {
    if (!this.craftingActor || !runId) return null;
    const runManager = this._getRunManager();
    if (!runManager) return null;
    if (scope === 'active') {
      return runManager.getActiveRun(this.craftingActor, runId);
    }
    if (scope === 'history') {
      return runManager.getRunHistory(this.craftingActor).find(run => run?.id === runId) || null;
    }
    return runManager.getRun(this.craftingActor, runId);
  }

  async _resolveRunEntityName(uuid, fallback = 'Unknown') {
    if (!uuid) return fallback;
    try {
      const doc = await fromUuid(uuid);
      return doc?.name || fallback;
    } catch (err) {
      return fallback;
    }
  }

  async _formatRunIoEntries(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) return 'none';
    const maxEntries = 20;
    const shown = entries.slice(0, maxEntries);
    const lines = await Promise.all(shown.map(async (entry) => {
      const qty = Number(entry?.quantity || 1) || 1;
      const itemName = await this._resolveRunEntityName(entry?.itemUuid, entry?.itemUuid || 'Unknown item');
      const actorName = await this._resolveRunEntityName(entry?.actorUuid, null);
      return actorName
        ? `${qty}x ${itemName} (${actorName})`
        : `${qty}x ${itemName}`;
    }));
    if (entries.length > maxEntries) {
      lines.push(`... +${entries.length - maxEntries} more`);
    }
    return lines.join('<br />');
  }

  /**
   * Prepare context data for the template
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const recipeManager = this._getRecipeManager();
    const visibilityService = this._getRecipeVisibilityService();
    const runManager = this._getRunManager();
    const worldTime = Number(game.time?.worldTime || 0);

    if (!recipeManager) {
      console.error('Fabricate | CraftingApp rendered before Fabricate API was available.');
      return {
        ...context,
        recipes: [],
        activeRuns: [],
        runHistory: [],
        categories: [],
        selectedCategory: this.selectedCategory,
        showOnlyAvailable: this.showOnlyAvailable,
        search: this.searchTerm,
        totalRecipes: 0,
        showPagination: false,
        hasCraftingActor: !!this.craftingActor,
        hasComponentSources: this.componentSourceActors.length > 0,
        availableActors: [],
        ownedActors: []
      };
    }

    // Prepare actor selection data
    const availableActors = this._getAvailableActors();
    const ownedActors = this._getOwnedActors();

    context.availableActors = availableActors.map(actor => ({
      id: actor.id,
      name: actor.name,
      selected: this.craftingActor?.id === actor.id,
      isAssignedCharacter: game.user.character?.id === actor.id
    }));

    context.ownedActors = ownedActors.map(actor => ({
      id: actor.id,
      name: actor.name,
      selected: this.componentSourceActors.some(a => a.id === actor.id),
      itemCount: actor.items.size
    }));

    context.hasCraftingActor = !!this.craftingActor;
    context.hasComponentSources = this.componentSourceActors.length > 0;

    const activeRunsRaw = (runManager && this.craftingActor)
      ? runManager.getActiveRuns(this.craftingActor)
      : [];
    const activeRuns = activeRunsRaw
      .map(run => this._buildRunDisplay(run, recipeManager, worldTime, 'active'))
      .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
    const activeRunsByRecipeId = new Map();
    for (const run of activeRuns) {
      const list = activeRunsByRecipeId.get(run.recipeId) || [];
      list.push(run);
      activeRunsByRecipeId.set(run.recipeId, list);
    }
    const historyRaw = (runManager && this.craftingActor)
      ? runManager.getRunHistory(this.craftingActor, 10)
      : [];
    const runHistory = historyRaw
      .map(run => this._buildRunDisplay(run, recipeManager, worldTime, 'history'));

    // Get all recipes
    let recipes = recipeManager.getRecipes({
      enabled: true
    });

    if (visibilityService && this.craftingActor) {
      recipes = recipes.filter(recipe =>
        visibilityService.evaluateRecipeAccess({
          recipe,
          viewer: game.user,
          craftingActor: this.craftingActor,
          componentSourceActors: this.componentSourceActors
        }).visible
      );
    }
    const showSimpleRecipesOnly = this._getSetting(SETTING_KEYS.SHOW_SIMPLE_RECIPES_ONLY);

    if (showSimpleRecipesOnly) {
      recipes = recipes.filter(r => r.isSimpleRecipe());
    }

    // Apply search filter
    if (this.searchTerm) {
      const searchLower = this.searchTerm.toLowerCase();
      recipes = recipes.filter(r =>
        r.name.toLowerCase().includes(searchLower) ||
        r.description.toLowerCase().includes(searchLower)
      );
    }

    // Apply category filter
    if (this.selectedCategory) {
      recipes = recipes.filter(r => r.category === this.selectedCategory);
    }

    // Filter by availability if enabled and we have component sources
    if (this.showOnlyAvailable && this.componentSourceActors.length > 0) {
      recipes = recipes.filter(r =>
        (() => {
          const access = visibilityService
            ? visibilityService.evaluateRecipeAccess({
              recipe: r,
              viewer: game.user,
              craftingActor: this.craftingActor,
              componentSourceActors: this.componentSourceActors
            })
            : { craftable: true };
          if (!access.craftable) return false;
          return recipeManager.canCraft(this.componentSourceActors, r).canCraft;
        })()
      );
    }

    // Prepare recipe data for display
    const preparedRecipes = recipes.map(recipe => {
      let canCraft = false;
      let satisfiableSet = null;

      if (this.componentSourceActors.length > 0) {
        const canCraftCheck = recipeManager.canCraft(this.componentSourceActors, recipe);
        canCraft = canCraftCheck.canCraft;
        satisfiableSet = canCraftCheck.satisfiableSet;
      }
      const access = visibilityService
        ? visibilityService.evaluateRecipeAccess({
          recipe,
          viewer: game.user,
          craftingActor: this.craftingActor,
          componentSourceActors: this.componentSourceActors
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

      // Prepare ingredient set display (show first set or satisfiable set)
      const displaySet = satisfiableSet || recipe.ingredientSets[0];
      const availableItems = this.componentSourceActors.flatMap(actor =>
        Array.from(actor.items)
      );
      const availableEssences = this._accumulateEssences(availableItems);

      const displayCatalysts = recipeManager.getCatalystsForSet(recipe, displaySet);

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
        ingredients: (() => {
          const groups = Array.isArray(displaySet.ingredientGroups) && displaySet.ingredientGroups.length > 0
            ? displaySet.ingredientGroups
            : (displaySet.ingredients || []).map(ingredient => ({ options: [ingredient] }));

          return groups.map(group => {
            const optionStates = (group.options || []).map(ing => {
              const matchingItems = availableItems.filter(item =>
                recipeManager.ingredientMatchesItem(recipe, ing, item)
              );
              const totalQty = matchingItems.reduce((sum, item) =>
                sum + (item.system.quantity || 1), 0
              );
              return {
                description: ing.getDescription(),
                need: ing.quantity,
                have: totalQty,
                satisfied: totalQty >= ing.quantity
              };
            });

            const satisfiedOption = optionStates.find(state => state.satisfied) || null;
            const bestOption = satisfiedOption || [...optionStates]
              .sort((a, b) => (b.have / Math.max(1, b.need)) - (a.have / Math.max(1, a.need)))[0];
            return {
              description: optionStates.map(state => state.description).join(' OR '),
              need: bestOption?.need || 1,
              have: bestOption?.have || 0,
              satisfied: optionStates.some(state => state.satisfied)
            };
          });
        })(),
        essences: Object.entries(displaySet.essences || {}).map(([type, qty]) => ({
          type,
          need: qty,
          have: availableEssences[type] || 0,
          satisfied: (availableEssences[type] || 0) >= qty
        })),
        catalysts: displayCatalysts.map(cat => {
          let available = false;
          for (const actor of this.componentSourceActors) {
            const matchingItems = actor.items.filter(item =>
              recipeManager.catalystMatchesItem(recipe, cat, item)
            );
            if (matchingItems.length > 0) {
              available = true;
              break;
            }
          }
          return {
            name: cat.name,
            available
          };
        })
      };
    });

    // Get unique categories
    const allRecipes = recipeManager.getRecipes({ enabled: true });
    const visibleRecipes = showSimpleRecipesOnly ? allRecipes.filter(r => r.isSimpleRecipe()) : allRecipes;
    const categories = [...new Set(visibleRecipes.map(r => r.category))].sort();

    return {
      ...context,
      recipes: preparedRecipes,
      activeRuns,
      runHistory,
      categories,
      selectedCategory: this.selectedCategory,
      showOnlyAvailable: this.showOnlyAvailable,
      search: this.searchTerm,
      totalRecipes: preparedRecipes.length,
      showPagination: false
    };
  }

  /**
   * Attach event listeners after rendering
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Manually attach change listeners to select elements
    const craftingActorSelect = this.element.querySelector('#crafting-actor');
    if (craftingActorSelect) {
      craftingActorSelect.addEventListener('change', this._onSelectCraftingActor.bind(this));
    }

    const categorySelect = this.element.querySelector('select[name="category"]');
    if (categorySelect) {
      categorySelect.addEventListener('change', this._onFilterCategory.bind(this));
    }
  }

  /**
   * Handle selecting crafting actor
   */
  async _onSelectCraftingActor(event) {
    const actorId = event.target.value;
    this.craftingActor = game.actors.get(actorId);

    // Save selection
    await this._setSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR, actorId);

    // Re-render
    await this.render();
  }

  /**
   * Handle toggling component source actor
   */
  static async _onToggleSourceActor(event, target) {
    const actorId = target.value;
    const actor = game.actors.get(actorId);

    if (!actor) return;

    if (target.checked) {
      if (!this.componentSourceActors.find(a => a.id === actorId)) {
        this.componentSourceActors.push(actor);
      }
    } else {
      this.componentSourceActors = this.componentSourceActors.filter(a => a.id !== actorId);
    }

    // Save selections
    await this._setSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES,
      this.componentSourceActors.map(a => a.id)
    );

    // Re-render
    await this.render();
  }

  /**
   * Handle search input
   */
  static async _onSearch(event, target) {
    this.searchTerm = target.value;
    await this.render();
  }

  /**
   * Toggle showing only available recipes
   */
  static async _onToggleAvailable(event, target) {
    this.showOnlyAvailable = !this.showOnlyAvailable;
    await this.render();
  }

  /**
   * Filter by category
   */
  async _onFilterCategory(event) {
    this.selectedCategory = event.target.value;

    // Re-render
    await this.render();
  }

  /**
   * Craft an item
   */
  static async _onCraft(event, target) {
    const recipeId = target.dataset.recipeId;
    const runId = String(target.dataset.runId || '').trim() || null;
    const skipConfirm = String(target.dataset.skipConfirm || '').trim().toLowerCase() === 'true';
    const recipeManager = this._getRecipeManager();
    if (!recipeManager) {
      this._notifyError('Fabricate is still initializing. Please try again.');
      return;
    }
    const recipe = recipeManager.getRecipe(recipeId);

    if (!recipe) {
      this._notifyError('Recipe not found');
      return;
    }

    // Validation
    if (!this.craftingActor) {
      this._notifyError('Please select a crafting actor');
      return;
    }

    if (this.componentSourceActors.length === 0) {
      this._notifyError('Please select at least one component source actor');
      return;
    }

    const autoCraft = this._getSetting(SETTING_KEYS.AUTO_CRAFT);
    if (!autoCraft && !skipConfirm) {
      const confirmed = await this._confirmDialog({
        title: `Craft ${recipe.name}?`,
        content: `
          <p>Are you sure you want to craft <strong>${recipe.name}</strong>?</p>
          <p>This will consume the required ingredients from your selected source actors.</p>
          <p>Results will be added to <strong>${this.craftingActor.name}</strong>.</p>
        `,
        yes: () => true,
        no: () => false
      });

      if (!confirmed) return;
    }

    // Attempt to craft
    const craftingEngine = this._getCraftingEngine();
    if (!craftingEngine) {
      this._notifyError('Crafting engine is unavailable. Check module initialization.');
      return;
    }
    const result = await craftingEngine.craft(
      this.craftingActor,
      this.componentSourceActors,
      recipe,
      null,
      { runId }
    );

    if (result.success) {
      this._notifyInfo(result.message);

      // Create chat message
      this._createChatMessage({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.craftingActor }),
        content: `
          <div class="fabricate-craft-success">
            <h3><i class="fas fa-hammer"></i> Crafting Success!</h3>
            <p><strong>${recipe.name}</strong> has been crafted.</p>
            <p>Results added to ${this.craftingActor.name}'s inventory.</p>
          </div>
        `
      });

      // Re-render to update available recipes
      await this.render();
    } else {
      this._notifyError(result.message);
    }
  }

  static async _onLearnRecipe(event, target) {
    const recipeId = target.dataset.recipeId;
    const recipeManager = this._getRecipeManager();
    if (!recipeManager) {
      this._notifyError('Fabricate is still initializing. Please try again.');
      return;
    }
    const visibilityService = this._getRecipeVisibilityService();
    const recipe = recipeManager.getRecipe(recipeId);
    if (!recipe || !visibilityService) return;

    if (!this.craftingActor) {
      this._notifyError('Please select a crafting actor');
      return;
    }

    const result = await visibilityService.learnRecipe({
      viewer: game.user,
      recipe,
      craftingActor: this.craftingActor,
      componentSourceActors: this.componentSourceActors
    });

    if (result.success) {
      this._notifyInfo(result.message);
      await this.render();
      return;
    }
    this._notifyWarn(result.message || 'Could not learn recipe');
  }

  static async _onShowRunDetails(event, target) {
    const runId = String(target.dataset.runId || '').trim();
    const runScope = String(target.dataset.runScope || 'active').trim();
    if (!runId) return;
    if (!this.craftingActor) {
      this._notifyWarn('Select a crafting actor first.');
      return;
    }

    const run = this._resolveRunEntry(runId, runScope);
    if (!run) {
      this._notifyWarn('Crafting run not found.');
      return;
    }

    const recipeManager = this._getRecipeManager();
    if (!recipeManager) {
      this._notifyWarn('Fabricate is still initializing. Please try again.');
      return;
    }
    const worldTime = Number(game.time?.worldTime || 0);
    const displayRun = this._buildRunDisplay(run, recipeManager, worldTime, runScope);

    const stepRows = await Promise.all((displayRun.steps || []).map(async (step, idx) => {
      const isCurrent = Number(displayRun.currentStepIndex) === idx;
      const remaining = step?.timeGate?.availableAt
        ? Math.max(0, Math.ceil(Number(step.timeGate.availableAt) - Number(worldTime)))
        : 0;
      const gateText = step?.timeGate
        ? ` | time gate: ${remaining > 0 ? this._formatRemainingSeconds(remaining) : 'ready'}`
        : '';
      const checks = step?.lastCheckResult?.reason ? ` | check: ${step.lastCheckResult.reason}` : '';
      const failure = step?.failureReason ? ` | failure: ${step.failureReason}` : '';
      const consumedText = await this._formatRunIoEntries(step?.consumedIngredients || []);
      const catalystsText = await this._formatRunIoEntries(step?.usedCatalysts || []);
      const createdText = await this._formatRunIoEntries(step?.createdResults || []);
      return `
        <li${isCurrent ? ' class="current"' : ''}>
          <strong>Step ${idx + 1}:</strong> ${step.stepName || `Step ${idx + 1}`} | ${step.status || 'pending'}${gateText}${checks}${failure}
          <div class="hint"><strong>Consumed:</strong><br />${consumedText}</div>
          <div class="hint"><strong>Catalysts:</strong><br />${catalystsText}</div>
          <div class="hint"><strong>Created:</strong><br />${createdText}</div>
        </li>
      `;
    }));
    const stepsHtml = stepRows.join('');

    const content = `
      <div class="fabricate-run-details">
        <h3>${displayRun.recipeName}</h3>
        <p><strong>Status:</strong> ${displayRun.statusLabel}</p>
        ${displayRun.stepLabel ? `<p><strong>Current:</strong> ${displayRun.stepLabel}</p>` : ''}
        <p><strong>Started:</strong> ${displayRun.startedAt ?? '-'}</p>
        <p><strong>Finished:</strong> ${displayRun.finishedAt ?? '-'}</p>
        <h4>Steps</h4>
        <ul>${stepsHtml || '<li>No step data</li>'}</ul>
      </div>
    `;

    this._renderDialog({
      title: `Run Details: ${displayRun.recipeName}`,
      content,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Close'
        }
      },
      default: 'close'
    });
  }

  static async _onCancelRun(event, target) {
    const runId = String(target.dataset.runId || '').trim();
    if (!runId) return;
    if (!this.craftingActor) {
      this._notifyWarn('Select a crafting actor first.');
      return;
    }

    const run = this._resolveRunEntry(runId, 'active');
    if (!run) {
      this._notifyWarn('Active crafting run not found.');
      return;
    }

    const recipeManager = this._getRecipeManager();
    if (!recipeManager) {
      this._notifyWarn('Fabricate is still initializing. Please try again.');
      return;
    }
    const recipe = recipeManager.getRecipe(run.recipeId);
    const confirmed = await this._confirmDialog({
      title: 'Cancel Crafting Run?',
      content: `<p>Cancel in-progress run for <strong>${recipe?.name || 'Unknown Recipe'}</strong>?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    const runManager = this._getRunManager();
    const cancelled = await runManager?.cancelRun?.(this.craftingActor, runId);
    if (!cancelled) {
      this._notifyError('Unable to cancel crafting run.');
      return;
    }
    this._notifyInfo(`Cancelled crafting run for ${recipe?.name || 'recipe'}.`);
    await this.render();
  }

  static async _onRestartRun(event, target) {
    const recipeId = String(target.dataset.recipeId || '').trim();
    const runId = String(target.dataset.runId || '').trim();
    if (!recipeId || !runId) return;
    if (!this.craftingActor) {
      this._notifyWarn('Select a crafting actor first.');
      return;
    }

    const run = this._resolveRunEntry(runId, 'active');
    if (!run) {
      this._notifyWarn('Active crafting run not found.');
      return;
    }
    const recipeManager = this._getRecipeManager();
    if (!recipeManager) {
      this._notifyWarn('Fabricate is still initializing. Please try again.');
      return;
    }
    const recipe = recipeManager.getRecipe(recipeId);

    const confirmed = await this._confirmDialog({
      title: 'Restart Crafting Run?',
      content: `<p>Cancel the current run for <strong>${recipe?.name || 'Unknown Recipe'}</strong> and start over from step 1?</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    const runManager = this._getRunManager();
    const cancelled = await runManager?.cancelRun?.(this.craftingActor, runId);
    if (!cancelled) {
      this._notifyError('Unable to restart run because cancellation failed.');
      return;
    }

    await this._onCraft(event, {
      dataset: {
        recipeId,
        runId: '',
        skipConfirm: 'true'
      }
    });
  }

  /**
   * Show recipe details
   */
  static async _onShowDetails(event, target) {
    const recipeId = target.dataset.recipeId;
    const recipeManager = this._getRecipeManager();
    if (!recipeManager) {
      this._notifyWarn('Fabricate is still initializing. Please try again.');
      return;
    }
    const recipe = recipeManager.getRecipe(recipeId);

    if (!recipe) return;

    const canCraftCheck = this.componentSourceActors.length > 0
      ? recipeManager.canCraft(this.componentSourceActors, recipe)
      : { canCraft: false };

    // Build detailed content
    let content = `
      <div class="fabricate-recipe-details">
        <h3>${recipe.name}</h3>
        <p>${recipe.description || '<em>No description</em>'}</p>

        <h4>Ingredient Sets:</h4>
    `;

    // Show all ingredient sets
    for (const [idx, ingredientSet] of recipe.ingredientSets.entries()) {
      const setName = ingredientSet.name || `Option ${idx + 1}`;
      content += `<h5>${setName}</h5><ul>`;

      // Ingredients
      const groups = Array.isArray(ingredientSet.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
        ? ingredientSet.ingredientGroups
        : (ingredientSet.ingredients || []).map(ingredient => ({ options: [ingredient] }));
      for (const [groupIndex, group] of groups.entries()) {
        const availableItems = this.componentSourceActors.flatMap(actor =>
          Array.from(actor.items)
        );
        const optionParts = (group.options || []).map((ing) => {
          const matchingItems = availableItems.filter(item =>
            recipeManager.ingredientMatchesItem(recipe, ing, item)
          );
          const totalQty = matchingItems.reduce((sum, item) =>
            sum + (item.system.quantity || 1), 0
          );
          const satisfied = totalQty >= ing.quantity;
          const icon = satisfied ? 'OK' : 'X';
          return `${icon} ${ing.getDescription()} (have ${totalQty}/${ing.quantity})`;
        });
        content += `<li><strong>Group ${groupIndex + 1}</strong>: ${optionParts.join(' OR ')}</li>`;
      }

      // Essences
      if (Object.keys(ingredientSet.essences || {}).length > 0) {
        content += `<li>Essences:`;
        for (const [type, qty] of Object.entries(ingredientSet.essences)) {
          content += ` ${type}:${qty}`;
        }
        content += `</li>`;
      }

      content += `</ul>`;
    }

    // Catalysts
    const detailSet = canCraftCheck.satisfiableSet || recipe.ingredientSets[0];
    const detailCatalysts = recipeManager.getCatalystsForSet(recipe, detailSet);
    if (detailCatalysts.length > 0) {
      content += `<h4>Catalysts (not consumed):</h4><ul>`;
      for (const cat of detailCatalysts) {
        let available = false;
        for (const actor of this.componentSourceActors) {
          const matchingItems = actor.items.filter(item =>
            recipeManager.catalystMatchesItem(recipe, cat, item)
          );
          if (matchingItems.length > 0) {
            available = true;
            break;
          }
        }
        const icon = available ? 'OK' : 'X';
        content += `<li>${icon} ${cat.name}</li>`;
      }
      content += `</ul>`;
    }

    // Results
    content += `
        <h4>Results:</h4>
        <ul>
    `;
    for (const result of recipe.results) {
      content += `<li>${result.quantity}x item</li>`;
    }
    content += `</ul>`;

    if (recipe.isVariable) {
      content += `<p><em>Variable recipe - results depend on ingredients used</em></p>`;
    }

    content += `</div>`;

    this._renderDialog({
      title: `Recipe: ${recipe.name}`,
      content,
      buttons: canCraftCheck.canCraft ? {
        craft: {
          icon: '<i class="fas fa-hammer"></i>',
          label: 'Craft Now',
          callback: () => this._onCraft(event, { dataset: { recipeId } })
        },
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Close'
        }
      } : {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Close'
        }
      },
      default: 'close'
    });
  }

  /**
   * Static method to show the crafting app
   */
  static async show() {
    const app = new CraftingApp();
    app.render(true);
    return app;
  }
}

