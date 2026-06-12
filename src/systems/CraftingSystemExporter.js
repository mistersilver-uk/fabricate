/**
 * Exports and validates crafting systems for JSON file import/export.
 * Pure functions — no Foundry globals required (testable in isolation).
 */

const SYSTEM_ID_PLACEHOLDER = '__SYSTEM_ID__';

/**
 * Build an export payload for a crafting system and its recipes.
 *
 * @param {object} system - Normalized system object from CraftingSystemManager
 * @param {object[]} recipes - Recipe objects (plain JSON via recipe.toJSON())
 * @param {string} fabricateVersion - Current module version string
 * @returns {object} Export envelope ready for JSON.stringify
 */
export function buildExportPayload(system, recipes, fabricateVersion) {
  if (!system || !system.id) {
    throw new Error('Cannot export: system is missing or has no id');
  }

  const systemId = system.id;

  // Deep-clone system and strip transitional aliases to keep export clean
  const exportSystem = stripTransitionalAliases(structuredClone(system));

  // Replace craftingSystemId with placeholder so imports can rebind
  const exportRecipes = recipes.map(recipe => {
    const r = structuredClone(recipe);
    if (r.craftingSystemId === systemId) {
      r.craftingSystemId = SYSTEM_ID_PLACEHOLDER;
    }
    // Also strip the legacy 'system' alias if present
    delete r.system;
    return r;
  });

  return {
    fabricateVersion,
    exportedAt: new Date().toISOString(),
    system: exportSystem,
    recipes: exportRecipes
  };
}

/**
 * Validate import data before passing to CompendiumImporter.
 *
 * @param {*} data - Parsed JSON to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateImportData(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push('Import data is not a valid object');
    return { valid: false, errors, warnings };
  }

  // Envelope checks
  if (!data.fabricateVersion) {
    warnings.push('Missing fabricateVersion — file may not be a Fabricate export');
  }

  // System checks
  if (!data.system || typeof data.system !== 'object') {
    errors.push('Missing required "system" field');
  } else {
    if (!data.system.name || typeof data.system.name !== 'string') {
      errors.push('System is missing a "name" field');
    }
    // Gathering realms ride along with the system. If present they must be an
    // array; each realm should carry a name (warning, not a hard error, so a
    // hand-trimmed export still imports). Accept the legacy `gatheringRegions`
    // key on read (pre-1.1.0-migration exports) so an old export still validates.
    const gatheringRealms = data.system.gatheringRealms ?? data.system.gatheringRegions;
    if (gatheringRealms !== undefined) {
      if (!Array.isArray(gatheringRealms)) {
        errors.push('System "gatheringRealms" field must be an array');
      } else {
        gatheringRealms.forEach((realm, i) => {
          if (realm && typeof realm === 'object' && !realm.name) {
            warnings.push(`Gathering realm at index ${i} (id: ${realm.id || 'unknown'}) has no name`);
          }
        });
      }
    }
  }

  // Recipes checks
  if (data.recipes !== undefined && !Array.isArray(data.recipes)) {
    errors.push('"recipes" field must be an array');
  } else if (Array.isArray(data.recipes)) {
    for (let i = 0; i < data.recipes.length; i++) {
      const recipe = data.recipes[i];
      if (!recipe || typeof recipe !== 'object') {
        errors.push(`Recipe at index ${i} is not a valid object`);
        continue;
      }
      if (!recipe.name) {
        warnings.push(`Recipe at index ${i} (id: ${recipe.id || 'unknown'}) has no name`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Prepare validated import data for CompendiumImporter.importFromPackData().
 *
 * @param {object} data - Validated export payload
 * @param {'keep'|'copy'} mode
 *   - 'keep': retain original IDs (for overwrite or skip scenarios)
 *   - 'copy': strip IDs so CompendiumImporter creates fresh ones
 * @returns {object} Pack data shaped for CompendiumImporter
 */
export function prepareForImport(data, mode = 'keep') {
  const system = structuredClone(data.system);
  const recipes = Array.isArray(data.recipes) ? structuredClone(data.recipes) : [];

  if (mode === 'copy') {
    delete system.id;
    // Append "(Copy)" to the name so the user can distinguish it
    system.name = `${system.name || 'Crafting System'} (Copy)`;

    for (const recipe of recipes) {
      delete recipe.id;
    }
  }

  return { system, recipes };
}

/**
 * Generate a filename for the export.
 *
 * @param {string} systemName - Human-readable system name
 * @returns {string} Filename like "fabricate-example-system-2026-03-12.json"
 */
export function makeExportFilename(systemName) {
  const slug = (systemName || 'system')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `fabricate-${slug}-${date}.json`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Remove transitional/alias fields from a system object to produce a clean export.
 * The canonical fields are kept; aliases added by _normalizeSystem are stripped.
 */
function stripTransitionalAliases(system) {
  // 'items' and 'managedItems' are aliases for 'components'
  delete system.items;
  delete system.managedItems;
  // 'tags' is alias for 'itemTags'
  delete system.tags;
  // 'essences' (id-only array) is derived from essenceDefinitions
  delete system.essences;
  // Boolean aliases derived from features
  delete system.enableTags;
  delete system.enableEssences;
  delete system.enableCategories;
  delete system.enableMultiStepRecipes;
  // enableTiers/tiers: no longer emitted by _normalizeSystem, but may be present
  // in data exported/stored by older versions — strip defensively
  delete system.enableTiers;
  delete system.tiers;
  delete system.advancedOptionsEnabled;

  // Strip associatedSystemItemId from essence definitions (transitional alias)
  if (Array.isArray(system.essenceDefinitions)) {
    for (const def of system.essenceDefinitions) {
      delete def.associatedSystemItemId;
    }
  }

  return system;
}
