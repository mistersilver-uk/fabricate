// Import global stylesheet so Vite includes it in the module graph for HMR.
// In production builds, a Vite plugin resolves this to a no-op since Foundry
// loads the stylesheet via module.json's "styles" field instead.
import '../styles/fabricate.css';

import { RecipeManager } from './systems/RecipeManager.js';
import { CompendiumImporter } from './systems/CompendiumImporter.js';
import { CraftingEngine } from './systems/CraftingEngine.js';
import { CraftingSystemManager } from './systems/CraftingSystemManager.js';
import { CraftingRunManager } from './systems/CraftingRunManager.js';
import { SalvageRunManager } from './systems/SalvageRunManager.js';
import { RecipeVisibilityService } from './systems/RecipeVisibilityService.js';
import { ResolutionModeService } from './systems/ResolutionModeService.js';
import { SignatureValidator } from './systems/SignatureValidator.js';
import { Recipe } from './models/Recipe.js';
import { Ingredient } from './models/Ingredient.js';
import { IngredientGroup } from './models/IngredientGroup.js';
import { Catalyst } from './models/Catalyst.js';
import { getCraftingAppClass, getRecipeManagerAppClass, getRecipeEditorAppClass } from './ui/appFactory.js';
import { registerFabricateSettings, getSetting, setSetting } from './config/settings.js';
import { MigrationRunner } from './migration/MigrationRunner.js';
import { ItemPilesIntegration } from './integrations/ItemPilesIntegration.js';
import { cleanupStalePreferences } from './config/preferencesCleanup.js';
import { importStarterPack } from './starter/importStarterPack.js';
import { registerFragmentDiscoveryHook } from './systems/FragmentDiscoveryHook.js';
import { registerRecipeItemLearningHook } from './systems/RecipeItemLearningHook.js';
import { registerItemSheetRecipeLearnControl } from './ui/ItemSheetRecipeLearnControl.js';
import * as CraftingSystemExporter from './systems/CraftingSystemExporter.js';
import './ui/SvelteCraftingApp.svelte.js';
import './ui/SvelteRecipeManagerApp.svelte.js';
import './ui/SvelteRecipeEditorApp.svelte.js';

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
    this.salvageRunManager = null;
    this.recipeVisibilityService = null;
    this.resolutionModeService = null;
    this.itemPilesIntegration = null;
    this.compendiumImporter = null;
    this.ready = false;
  }

  /**
   * Initialize the module
   */
  async initialize() {
    console.log('Fabricate | Initializing...');

    // Register settings
    this.registerSettings();
    // Run data migrations before managers load persisted data
    await this._runMigrations();
    // Create managers
    this.recipeManager = new RecipeManager();
    this.craftingSystemManager = new CraftingSystemManager(this.recipeManager);
    this.craftingRunManager = new CraftingRunManager();
    this.salvageRunManager = new SalvageRunManager();
    this.recipeVisibilityService = new RecipeVisibilityService(this.recipeManager, this.craftingSystemManager);
    this.resolutionModeService = new ResolutionModeService(this.craftingSystemManager);
    this.itemPilesIntegration = new ItemPilesIntegration();
    this.itemPilesIntegration.detect();
    this.compendiumImporter = new CompendiumImporter(this.craftingSystemManager, this.recipeManager);
    this.craftingEngine = new CraftingEngine(
      this.recipeManager,
      this.craftingRunManager,
      this.resolutionModeService,
      this.itemPilesIntegration,
      this.salvageRunManager
    );

    // Initialize recipe manager
    await this.recipeManager.initialize();
    await this.craftingSystemManager.initialize();
    const validRecipes = new Set(this.recipeManager.getRecipes({}).map(r => r.id));
    const validSystems = new Set(this.craftingSystemManager.getSystems().map(s => s.id));
    const validSalvageComponentsBySystem = new Map(
      this.craftingSystemManager.getSystems().map(system => [
        system.id,
        new Set((system.components || []).map(component => component.id))
      ])
    );
    await this.craftingRunManager.cleanupInvalidRuns(validRecipes, validSystems);
    await this.salvageRunManager.cleanupInvalidRuns(validSystems, validSalvageComponentsBySystem);
    await this.recipeVisibilityService.cleanupLearnedRecipes(validRecipes);
    await cleanupStalePreferences(validSystems, validRecipes, getSetting, setSetting);

    registerFragmentDiscoveryHook(this.craftingSystemManager, this.recipeVisibilityService);
    registerRecipeItemLearningHook(this.recipeVisibilityService);
    registerItemSheetRecipeLearnControl(this.recipeVisibilityService);

    this.ready = true;
    console.log('Fabricate | Ready');
  }

  /**
   * Run versioned startup data migrations via MigrationRunner.
   */
  async _runMigrations() {
    const runner = new MigrationRunner({ getSetting, setSetting });
    await runner.run();
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

  getSalvageRunManager() {
    return this.salvageRunManager;
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

  getItemPilesIntegration() {
    return this.itemPilesIntegration;
  }

  getCompendiumImporter() {
    return this.compendiumImporter;
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

  /**
   * Delete a recipe by ID.
   * @param {string} recipeId - The recipe ID to delete
   */
  async deleteRecipe(recipeId) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    return await this.recipeManager.deleteRecipe(recipeId);
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
    getCraftingAppClass,
    getRecipeManagerAppClass,
    getRecipeEditorAppClass,
    CraftingSystemManager,
    CraftingRunManager,
    SalvageRunManager,
    RecipeVisibilityService,
    ResolutionModeService,
    SignatureValidator,
    ItemPilesIntegration,
    importStarterPack,
    CompendiumImporter,
    CraftingSystemExporter
  };

  game.fabricate.importFromPack = (packData, options) =>
    fabricate.compendiumImporter?.importFromPackData(packData, options);
  game.fabricate.getCompendiumImporter = () => fabricate.compendiumImporter;

  game.fabricate.exportSystem = (systemId) => {
    const systemManager = fabricate.craftingSystemManager;
    const recipeManager = fabricate.recipeManager;
    if (!systemManager || !recipeManager) throw new Error('Fabricate not initialized');
    const system = systemManager.getSystem(systemId);
    if (!system) throw new Error(`System "${systemId}" not found`);
    const recipes = recipeManager.getRecipes({ craftingSystemId: systemId }).map(r => r.toJSON());
    const version = game.modules?.get('fabricate')?.version || '0.0.0';
    return CraftingSystemExporter.buildExportPayload(system, recipes, version);
  };

  game.fabricate.importSystemFromFile = async (file, options = {}) => {
    const text = typeof file === 'string' ? file : await file.text();
    const data = JSON.parse(text);
    const validation = CraftingSystemExporter.validateImportData(data);
    if (!validation.valid) throw new Error(`Invalid import data: ${validation.errors.join('; ')}`);
    const mode = options.copyMode ? 'copy' : 'keep';
    const packData = CraftingSystemExporter.prepareForImport(data, mode);
    return fabricate.compendiumImporter.importFromPackData(packData, {
      overwriteExisting: options.overwriteExisting || false
    });
  };

});

// Hook into Foundry's ready event
Hooks.once('ready', async () => {
  await fabricate.initialize();
  await fabricate.getCraftingRunManager()?.processWorldTime?.();
  await fabricate.getCraftingEngine()?.processPendingSalvageRuns?.();

  addModuleButtonsToItemsDirectory();

  Hooks.callAll('fabricate.ready');
});

Hooks.on('updateWorldTime', (worldTime) => {
  const craftingManager = game.fabricate?.getCraftingRunManager?.();
  if (craftingManager) {
    craftingManager.processWorldTime(worldTime);
  }
  const craftingEngine = game.fabricate?.getCraftingEngine?.();
  if (craftingEngine) {
    craftingEngine.processPendingSalvageRuns(worldTime);
  }
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
    const craftButton = createHeaderButton('Craft Item', 'fas fa-hammer', 'craft', () => getCraftingAppClass().show());
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
        () => getRecipeManagerAppClass().show()
      );
      actionsContainer.insertBefore(managerButton, actionsContainer.firstChild);
    }
  }
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
        ui.notifications.info(result.message);
      } else {
        ui.notifications.error(result.message);
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
   * Delete a recipe by ID
   */
  deleteRecipe: async (recipeId) => {
    return await game.fabricate.deleteRecipe(recipeId);
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
    return getRecipeManagerAppClass().show();
  },

  /**
   * List crafting systems
   */
  listCraftingSystems: () => {
    return game.fabricate.getCraftingSystemManager().getSystems();
  },

  importStarterPack: async (packId) => {
    return importStarterPack(packId);
  },

  exportSystem: (systemId) => {
    return game.fabricate.exportSystem(systemId);
  },

  importSystemFromFile: async (file, options) => {
    return game.fabricate.importSystemFromFile(file, options);
  }
};

export default fabricate;
