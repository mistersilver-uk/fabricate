import { Recipe } from '../models/Recipe.js';
import { IngredientSet } from '../models/IngredientSet.js';
import { Result } from '../models/Result.js';

/**
 * Handles migration of recipes from old format to new format
 */
export class RecipeMigration {
  /**
   * Migrate a single recipe from old format to new format
   * @param {Object} oldRecipeData - Recipe data in old format
   * @returns {Object} Recipe data in new format
   */
  static migrateRecipe(oldRecipeData) {
    // Check if recipe is already in new format
    if (oldRecipeData.ingredientSets && oldRecipeData.results) {
      return oldRecipeData; // Already migrated
    }

    console.log(`Fabricate v2 | Migrating recipe: ${oldRecipeData.name || oldRecipeData.id}`);

    const migratedData = {
      id: oldRecipeData.id,
      name: oldRecipeData.name,
      description: oldRecipeData.description,
      img: oldRecipeData.img,
      category: oldRecipeData.category || 'Uncategorized',
      system: oldRecipeData.system || 'all',
      enabled: oldRecipeData.enabled !== undefined ? oldRecipeData.enabled : true,
      tags: oldRecipeData.tags || [],

      // Convert old ingredients array to new ingredientSets array
      ingredientSets: this._migrateIngredients(oldRecipeData),

      // Convert old result object to new results array
      results: this._migrateResults(oldRecipeData),

      // Legacy catalysts are moved into the first ingredient set
      catalysts: [],

      // Migrate behavior properties
      isVariable: oldRecipeData.isVariable || false,
      transferEffects: oldRecipeData.transferEffects || false,
      requiresAllSets: false, // Old format didn't support this

      // Create metadata
      metadata: {
        created: oldRecipeData.created || Date.now(),
        modified: Date.now(),
        author: oldRecipeData.author || 'System',
        version: '2.0.0',
        notes: 'Migrated from v1 format'
      }
    };

    return migratedData;
  }

  /**
   * Convert old ingredients array to new ingredientSets array
   * @private
   */
  static _migrateIngredients(oldRecipeData) {
    const ingredients = oldRecipeData.ingredients || [];

    if (ingredients.length === 0) {
      return [];
    }

    // Migrate each ingredient
    const migratedIngredients = ingredients.map(ing => {
      const migratedIng = { ...ing };

      // Remove deprecated itemId field if present
      if (migratedIng.itemId) {
        delete migratedIng.itemId;
      }

      return migratedIng;
    });

    // Create a single ingredient set from old ingredients array
    const migratedSet = {
      id: foundry.utils.randomID(),
      name: 'Default',
      ingredients: migratedIngredients,
      essences: oldRecipeData.essences || {},
      catalysts: oldRecipeData.catalysts || [],
      resultMapping: [] // Will be populated based on results
    };

    return [
      {
        ...migratedSet
      }
    ];
  }

  /**
   * Convert old result object to new results array
   * @private
   */
  static _migrateResults(oldRecipeData) {
    const result = oldRecipeData.result;

    if (!result) {
      return [];
    }

    // Old format had single result, new format has array of results
    const migratedResult = {
      id: foundry.utils.randomID(),
      itemUuid: result.itemUuid || null,
      quantity: result.quantity || 1,
      propertyFormulas: result.propertyFormulas || {}
    };

    // Remove deprecated itemId if present
    if (result.itemId) {
      delete migratedResult.itemId;
    }

    return [migratedResult];
  }

  /**
   * Migrate all recipes in the system
   * @param {Array} recipesData - Array of recipe data to migrate
   * @returns {Array} Array of migrated recipe data
   */
  static migrateAll(recipesData) {
    if (!Array.isArray(recipesData)) {
      console.warn('Fabricate v2 | Invalid recipes data for migration');
      return [];
    }

    let migrated = 0;
    let skipped = 0;

    const migratedRecipes = recipesData.map(recipeData => {
      try {
        // Check if already migrated
        if (recipeData.ingredientSets && recipeData.results) {
          // Second-pass normalization: move legacy recipe-level catalysts into first ingredient set.
          if ((recipeData.catalysts || []).length > 0 && (recipeData.ingredientSets || []).length > 0) {
            const normalized = foundry.utils.deepClone(recipeData);
            normalized.ingredientSets[0].catalysts = [
              ...(normalized.ingredientSets[0].catalysts || []),
              ...normalized.catalysts
            ];
            normalized.catalysts = [];
            migrated++;
            return normalized;
          }
          skipped++;
          return recipeData;
        }

        const migratedData = this.migrateRecipe(recipeData);
        migrated++;
        return migratedData;
      } catch (error) {
        console.error(`Fabricate v2 | Failed to migrate recipe ${recipeData.id || 'unknown'}:`, error);
        skipped++;
        return recipeData; // Return original on error
      }
    });

    if (migrated > 0) {
      console.log(`Fabricate v2 | Migration complete: ${migrated} recipes migrated, ${skipped} skipped`);
      ui.notifications.info(`Fabricate v2: Migrated ${migrated} recipes to new format`);
    }

    return migratedRecipes;
  }

  /**
   * Check if migration is needed
   * @param {Array} recipesData - Array of recipe data to check
   * @returns {boolean} True if any recipes need migration
   */
  static needsMigration(recipesData) {
    if (!Array.isArray(recipesData) || recipesData.length === 0) {
      return false;
    }

    return recipesData.some(recipe =>
      !recipe.ingredientSets || !recipe.results || (recipe.catalysts || []).length > 0
    );
  }
}
