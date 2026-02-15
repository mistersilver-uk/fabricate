import { confirmDialog, renderDialog } from './foundryCompat.js';

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
      showDetails: this._onShowDetails
    }
  };

  static PARTS = {
    recipes: {
      template: 'modules/fabricate-v2/templates/crafting-app.hbs'
    }
  };

  /**
   * Get default crafting actor with smart fallbacks
   * @private
   */
  _getDefaultCraftingActor() {
    // 1. Try saved setting
    const savedId = game.settings.get('fabricate-v2', 'lastCraftingActor');
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
    const savedIds = game.settings.get('fabricate-v2', 'lastComponentSources') || [];
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
      const itemEssences = item.getFlag('fabricate-v2', 'essences') || {};
      for (const [essenceType, quantity] of Object.entries(itemEssences)) {
        accumulated[essenceType] = (accumulated[essenceType] || 0) + quantity;
      }
    }

    return accumulated;
  }

  /**
   * Prepare context data for the template
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const recipeManager = game.fabricate.getRecipeManager();

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

    // Get all recipes
    let recipes = recipeManager.getRecipes({
      enabled: true
    });
    const showSimpleRecipesOnly = game.settings.get('fabricate-v2', 'showSimpleRecipesOnly');

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
        recipeManager.canCraft(this.componentSourceActors, r).canCraft
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
        canCraft: canCraft,
        hasMultipleSets: recipe.ingredientSets.length > 1,
        resultDescription: recipe.getResultDescription(),
        ingredients: displaySet.ingredients.map(ing => {
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
        }),
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
    await game.settings.set('fabricate-v2', 'lastCraftingActor', actorId);

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
    await game.settings.set('fabricate-v2', 'lastComponentSources',
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
    const recipeManager = game.fabricate.getRecipeManager();
    const recipe = recipeManager.getRecipe(recipeId);

    if (!recipe) {
      ui.notifications.error('Recipe not found');
      return;
    }

    // Validation
    if (!this.craftingActor) {
      ui.notifications.error('Please select a crafting actor');
      return;
    }

    if (this.componentSourceActors.length === 0) {
      ui.notifications.error('Please select at least one component source actor');
      return;
    }

    const autoCraft = game.settings.get('fabricate-v2', 'autoCraft');
    if (!autoCraft) {
      const confirmed = await confirmDialog({
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
    const craftingEngine = game.fabricate.getCraftingEngine();
    const result = await craftingEngine.craft(
      this.craftingActor,
      this.componentSourceActors,
      recipe
    );

    if (result.success) {
      ui.notifications.info(result.message);

      // Create chat message
      ChatMessage.create({
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
      ui.notifications.error(result.message);
    }
  }

  /**
   * Show recipe details
   */
  static async _onShowDetails(event, target) {
    const recipeId = target.dataset.recipeId;
    const recipeManager = game.fabricate.getRecipeManager();
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
      for (const ing of ingredientSet.ingredients) {
        const availableItems = this.componentSourceActors.flatMap(actor =>
          Array.from(actor.items)
        );
        const matchingItems = availableItems.filter(item =>
          recipeManager.ingredientMatchesItem(recipe, ing, item)
        );
        const totalQty = matchingItems.reduce((sum, item) =>
          sum + (item.system.quantity || 1), 0
        );
        const satisfied = totalQty >= ing.quantity;
        const icon = satisfied ? 'OK' : 'X';
        content += `<li>${icon} ${ing.getDescription()} (have ${totalQty})</li>`;
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

    renderDialog({
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
