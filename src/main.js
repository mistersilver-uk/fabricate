import { RecipeManager } from './systems/RecipeManager.js';
import { CraftingEngine } from './systems/CraftingEngine.js';
import { CraftingSystemManager } from './systems/CraftingSystemManager.js';
import { CraftingRunManager } from './systems/CraftingRunManager.js';
import { RecipeVisibilityService } from './systems/RecipeVisibilityService.js';
import { ResolutionModeService } from './systems/ResolutionModeService.js';
import { Recipe } from './models/Recipe.js';
import { Ingredient } from './models/Ingredient.js';
import { IngredientGroup } from './models/IngredientGroup.js';
import { Catalyst } from './models/Catalyst.js';
import { CraftingApp } from './ui/CraftingApp.js';
import { RecipeManagerApp } from './ui/RecipeManagerApp.js';
import { RecipeEditorApp } from './ui/RecipeEditorApp.js';
import { getPartialTemplatePath, getTemplatePath } from './ui/templatePaths.js';
import { registerFabricateSettings } from './config/settings.js';

/**
 * Fabricate - Universal Crafting System
 * Main module entry point
 */

class Fabricate {
  constructor() {
    this.recipeManager = null;
    this.craftingEngine = null;
    this.craftingSystemManager = null;
    this.craftingRunManager = null;
    this.recipeVisibilityService = null;
    this.resolutionModeService = null;
    this.ready = false;
  }

  /**
   * Initialize the module
   */
  async initialize() {
    console.log('Fabricate | Initializing...');

    // Register settings
    this.registerSettings();
    // Create managers
    this.recipeManager = new RecipeManager();
    this.craftingSystemManager = new CraftingSystemManager(this.recipeManager);
    this.craftingRunManager = new CraftingRunManager();
    this.recipeVisibilityService = new RecipeVisibilityService(this.recipeManager, this.craftingSystemManager);
    this.resolutionModeService = new ResolutionModeService(this.craftingSystemManager);
    this.craftingEngine = new CraftingEngine(
      this.recipeManager,
      this.craftingRunManager,
      this.resolutionModeService
    );

    // Initialize recipe manager
    await this.recipeManager.initialize();
    await this.craftingSystemManager.initialize();
    const validRecipes = new Set(this.recipeManager.getRecipes({}).map(r => r.id));
    const validSystems = new Set(this.craftingSystemManager.getSystems().map(s => s.id));
    await this.craftingRunManager.cleanupInvalidRuns(validRecipes, validSystems);
    await this.recipeVisibilityService.cleanupLearnedRecipes(validRecipes);

    this.ready = true;
    console.log('Fabricate | Ready');
  }

  /**
   * Register module settings
   */
  registerSettings() {
    registerFabricateSettings();
  }

  /**
   * Get the recipe manager instance
   */
  getRecipeManager() {
    return this.recipeManager;
  }

  /**
   * Get the crafting engine instance
   */
  getCraftingEngine() {
    return this.craftingEngine;
  }

  /**
   * Get the crafting system manager instance
   */
  getCraftingSystemManager() {
    return this.craftingSystemManager;
  }

  /**
   * Get the crafting run manager instance
   */
  getCraftingRunManager() {
    return this.craftingRunManager;
  }

  /**
   * Get the recipe visibility service instance
   */
  getRecipeVisibilityService() {
    return this.recipeVisibilityService;
  }

  getResolutionModeService() {
    return this.resolutionModeService;
  }

  /**
   * Quick craft helper - craft a recipe for an actor
   * @param {Actor} actor - The actor performing the craft
   * @param {string|Recipe} recipe - Recipe ID or Recipe object
   * @param {Object} options - Crafting options
   */
  async craft(actor, recipe, options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Get recipe object if ID was provided
    if (typeof recipe === 'string') {
      recipe = this.recipeManager.getRecipe(recipe);
      if (!recipe) {
        throw new Error(`Recipe ${recipe} not found`);
      }
    }

    const componentSourceActors = Array.isArray(options.componentSourceActors)
      ? options.componentSourceActors.filter(Boolean)
      : [actor];

    const ingredientSetId = options.ingredientSetId || null;

    return await this.craftingEngine.craft(
      actor,
      componentSourceActors,
      recipe,
      ingredientSetId,
      options
    );
  }
}

// Create global instance
const fabricate = new Fabricate();

// Hook into Foundry's initialization
Hooks.once('init', async () => {
  console.log('Fabricate | Init Hook');

  // Make API available globally
  game.fabricate = fabricate;

  // Expose classes for advanced users
  game.fabricate.api = {
    Recipe,
    Ingredient,
    IngredientGroup,
    Catalyst,
    RecipeManager,
    CraftingEngine,
    CraftingApp,
    RecipeManagerApp,
    RecipeEditorApp,
    CraftingSystemManager,
    CraftingRunManager,
    RecipeVisibilityService,
    ResolutionModeService
  };

  try {
    await loadTemplates([
      getPartialTemplatePath('ingredientRow.hbs'),
      getPartialTemplatePath('catalystRow.hbs'),
      getTemplatePath('recipe-editor-v2.hbs')
    ]);
  } catch (err) {
    console.error('Fabricate | Template preload failed', err);
  }

  Handlebars.registerHelper('eq', (a, b) => a === b);
  Handlebars.registerHelper('json', (context) => JSON.stringify(context, null, 2));
});

// Hook into Foundry's ready event
Hooks.once('ready', async () => {
  await fabricate.initialize();
  await fabricate.getCraftingRunManager()?.processWorldTime?.();

  // Notify users
  if (game.user.isGM) {
    ui.notifications.info('Fabricate | Crafting system ready');
  }

  addModuleButtonsToItemsDirectory();

  Hooks.callAll('fabricate.ready');
});

Hooks.on('updateWorldTime', (worldTime) => {
  const manager = game.fabricate?.getCraftingRunManager?.();
  if (!manager) return;
  manager.processWorldTime(worldTime);
});

/**
 * System-agnostic crafting button integration
 * Add Craft button to Items Directory sidebar (works with all game systems)
 */

/**
 * Add the Craft button to Items Directory header
 * Since sidebar is already rendered at module init, we inject directly
 */
function addModuleButtonsToItemsDirectory() {
  const itemsDir = ui.items;
  if (!itemsDir?.element) {
    console.error('Fabricate | Items directory not found or not rendered');
    return;
  }

  const header = itemsDir.element.querySelector('.directory-header, header');
  if (!header) {
    console.error('Fabricate | Items directory header not found');
    return;
  }

  // Find the header actions container (where Create Item button lives)
  let actionsContainer = header.querySelector('.header-actions, .action-buttons');

  if (!actionsContainer) {
    console.log('Fabricate | No header-actions found, looking for alternative containers');
    // Try alternative locations
    actionsContainer = header.querySelector('.directory-controls, .header-controls');
  }

  if (!actionsContainer) {
    console.log('Fabricate | No actions container found, creating one');
    // Create container as last resort
    actionsContainer = document.createElement('div');
    actionsContainer.className = 'header-actions action-buttons flexrow';
    header.appendChild(actionsContainer);
  }

  // Add craft button for all users
  const craftExists = Array.from(actionsContainer.querySelectorAll('button.create-document'))
    .some(btn =>
      btn.dataset.fabricateAction === 'craft' ||
      btn.textContent?.includes('Craft Item')
    );
  if (!craftExists) {
    const craftButton = createHeaderButton('Craft Item', 'fas fa-hammer', 'craft', () => CraftingApp.show());
    actionsContainer.insertBefore(craftButton, actionsContainer.firstChild);
  }

  // Add recipe manager button for GMs only
  if (game.user?.isGM) {
    const managerExists = Array.from(actionsContainer.querySelectorAll('button.create-document'))
      .some(btn =>
        btn.dataset.fabricateAction === 'manage' ||
        btn.textContent?.includes('Manage Crafting Systems')
      );
    if (!managerExists) {
      const managerButton = createHeaderButton(
        'Manage Crafting Systems',
        'fas fa-book',
        'manage',
        () => RecipeManagerApp.show()
      );
      actionsContainer.insertBefore(managerButton, actionsContainer.firstChild);
    }
  }

  console.log('Fabricate | Fabricate buttons updated in', actionsContainer.className);
}

/**
 * Create a sidebar header button that matches Foundry style
 * @private
 */
function createHeaderButton(labelText, iconClass, actionId, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'create-document';
  button.dataset.tooltip = labelText;
  button.dataset.fabricateAction = actionId;
  button.setAttribute('aria-label', labelText);

  const icon = document.createElement('i');
  icon.className = iconClass;
  button.appendChild(icon);

  const label = document.createElement('span');
  label.textContent = labelText;
  button.appendChild(label);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    onClick();
  });

  return button;
}

// Also add button when Items directory is activated
Hooks.on('activateItemDirectory', (app) => {
  console.log('Fabricate | activateItemDirectory hook fired');
  addModuleButtonsToItemsDirectory();
});

// Handle D&D 5e specific hook
Hooks.on('activateItemDirectory5e', (app) => {
  console.log('Fabricate | activateItemDirectory5e hook fired');
  addModuleButtonsToItemsDirectory();
});

// Chat command for quick crafting (for testing)
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  // Check for /craft command
  if (message.startsWith('/craft')) {
    const parts = message.split(' ');
    if (parts.length < 2) {
      ui.notifications.warn('Usage: /craft <recipe-name>');
      return false;
    }

    const recipeName = parts.slice(1).join(' ');
    const actor = game.user.character;

    if (!actor) {
      ui.notifications.error('No character selected');
      return false;
    }

    // Find recipe by name
    const recipes = fabricate.recipeManager.getRecipes({ search: recipeName });
    if (recipes.length === 0) {
      ui.notifications.error(`Recipe "${recipeName}" not found`);
      return false;
    }

    const recipe = recipes[0];

    // Attempt to craft
    fabricate.craft(actor, recipe).then(result => {
      if (result.success) {
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<strong>Crafting Success!</strong><br>${result.message}`
        });
      } else {
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<strong>Crafting Failed!</strong><br>${result.message}`
        });
      }
    }).catch(err => {
      ui.notifications.error(err.message);
      console.error('Fabricate | Crafting error:', err);
    });

    return false; // Prevent the message from being sent to chat
  }
});

// Macro helper
globalThis.fabricate = {
  /**
   * Create a simple recipe
   * @example
   * fabricate.createSimpleRecipe('Iron Sword', [
   *   { itemId: 'ironIngot', quantity: 2 },
   *   { itemId: 'wood', quantity: 1 }
   * ], { itemId: 'ironSword', quantity: 1 });
   */
  createSimpleRecipe: async (name, ingredients, result) => {
    const { Recipe } = game.fabricate.api;
    const recipe = Recipe.createSimple(name, ingredients, result);
    return await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
  },

  /**
   * Craft an item
   * @example
   * fabricate.craft(game.user.character, 'recipeId');
   */
  craft: async (actor, recipeId, options) => {
    return await game.fabricate.craft(actor, recipeId, options);
  },

  /**
   * List all recipes
   */
  listRecipes: (filters = {}) => {
    return game.fabricate.getRecipeManager().getRecipes(filters);
  },

  /**
   * Get recipes available to an actor
   */
  getAvailableRecipes: (actorOrActors) => {
    const actors = Array.isArray(actorOrActors) ? actorOrActors : [actorOrActors];
    return game.fabricate.getRecipeManager().getAvailableRecipes(actors.filter(Boolean));
  },

  /**
   * Open GM recipe manager
   */
  openRecipeManager: () => {
    return RecipeManagerApp.show();
  },

  /**
   * List crafting systems
   */
  listCraftingSystems: () => {
    return game.fabricate.getCraftingSystemManager().getSystems();
  }
};

export default fabricate;

