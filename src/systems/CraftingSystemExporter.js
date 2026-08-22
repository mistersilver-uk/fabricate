/**
 * Exports and validates crafting systems for JSON file import/export.
 * Pure functions — no Foundry globals required (testable in isolation).
 */

import { migrateExportPayload } from '../migration/migrateExportPayload.js';

import {
  FABRICATE_EXPORT_SCHEMA_VERSION,
  assembleCurrencyAuthoringBundle,
  assembleGatheringAuthoringBundle,
  assembleTravelAuthoringBundle,
} from './authoringExport.js';
import {
  rebindCopyContainerIds,
  rebindCopyComponentIds,
  rebindCopyRecipeIds,
} from './importReferenceResolver.js';

const SYSTEM_ID_PLACEHOLDER = '__SYSTEM_ID__';

/**
 * Build an export payload for a crafting system, its recipes, and its gathering
 * authoring model (environments + the per-system `gatheringConfig` slice).
 *
 * The envelope carries an explicit integer `schemaVersion` (distinct from
 * `fabricateVersion`) and a `runtimeStateIncluded: false` marker; runtime/world
 * state (per-environment `nodeRuntime`, current-condition selection) is stripped
 * by {@link assembleGatheringAuthoringBundle}.
 *
 * @param {object} system - Normalized system object from CraftingSystemManager
 * @param {object[]} recipes - Recipe objects (plain JSON via recipe.toJSON())
 * @param {string} fabricateVersion - Current module version string
 * @param {object[]} [gatheringEnvironments=[]] - FULL global environment array (all systems)
 * @param {object} [gatheringConfig={}] - FULL `gatheringConfig` setting object
 * @param {object} [currencyConfig={}] - FULL `currencyConfig` world setting
 * @param {object} [travelConfig={}] - FULL `travelConfig` world setting
 * @returns {object} Export envelope ready for JSON.stringify
 */
export function buildExportPayload(
  system,
  recipes,
  fabricateVersion,
  gatheringEnvironments = [],
  gatheringConfig = {},
  // The world currency configuration (issue 1278). Defaulted so every existing call site keeps
  // working; an export produced without it simply carries an empty ladder.
  currencyConfig = {},
  // The world travel configuration (issue 1282): the realm library plus its two scalars.
  // Defaulted for the same reason, with the same consequence — an export produced without it
  // carries an empty library, and every realm-gated environment in it lands unresolvable.
  travelConfig = {}
) {
  if (!system || !system.id) {
    throw new Error('Cannot export: system is missing or has no id');
  }

  const systemId = system.id;

  // Deep-clone system, strip transitional aliases, and strip the Checks Studio's
  // progressive PREVIEW SANDBOX, which is authoring scratch rather than authoring data.
  const exportSystem = stripPreviewSandbox(stripTransitionalAliases(structuredClone(system)));

  // Replace craftingSystemId with placeholder so imports can rebind
  const exportRecipes = recipes.map((recipe) => {
    const r = structuredClone(recipe);
    if (r.craftingSystemId === systemId) {
      r.craftingSystemId = SYSTEM_ID_PLACEHOLDER;
    }
    // Also strip the legacy 'system' alias if present
    delete r.system;
    return r;
  });

  const bundle = assembleGatheringAuthoringBundle(system, gatheringEnvironments, gatheringConfig);

  return {
    schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
    fabricateVersion,
    exportedAt: new Date().toISOString(),
    runtimeStateIncluded: false,
    system: exportSystem,
    recipes: exportRecipes,
    gatheringEnvironments: bundle.gatheringEnvironments,
    gatheringConfig: bundle.gatheringConfig,
    currencyConfig: assembleCurrencyAuthoringBundle(currencyConfig),
    travelConfig: assembleTravelAuthoringBundle(travelConfig),
  };
}

/**
 * Validate import data before passing to CompendiumImporter.
 *
 * @param {*} data - Parsed JSON to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateImportData(rawData) {
  const errors = [];
  const warnings = [];

  if (!rawData || typeof rawData !== 'object') {
    errors.push('Import data is not a valid object');
    return { valid: false, errors, warnings };
  }

  // Upcast any legacy (schema 1) payload to the current schema before validating
  // the v2 shape, so an older `{ fabricateVersion, system, recipes }` export still
  // validates.
  const data = migrateExportPayload(rawData);

  // Envelope checks
  if (!data.fabricateVersion) {
    warnings.push('Missing fabricateVersion — file may not be a Fabricate export');
  }

  // Gathering authoring bundle shape (present after migration).
  if (data.gatheringEnvironments !== undefined && !Array.isArray(data.gatheringEnvironments)) {
    errors.push('"gatheringEnvironments" field must be an array');
  }
  if (
    data.gatheringConfig !== undefined &&
    (typeof data.gatheringConfig !== 'object' || Array.isArray(data.gatheringConfig))
  ) {
    errors.push('"gatheringConfig" field must be an object');
  }

  // Travel authoring bundle shape (present after migration, issue 1282).
  if (
    data.travelConfig !== undefined &&
    (typeof data.travelConfig !== 'object' || Array.isArray(data.travelConfig))
  ) {
    errors.push('"travelConfig" field must be an object');
  }

  // System checks
  if (!data.system || typeof data.system !== 'object') {
    errors.push('Missing required "system" field');
  } else if (!data.system.name || typeof data.system.name !== 'string') {
    errors.push('System is missing a "name" field');
  }

  // Realms ride the ENVELOPE since issue 1282, not the system. A malformed legacy value is
  // checked against the RAW payload rather than the migrated one, because the upcast has
  // already hoisted (and, for a non-array, discarded) `system.gatheringRealms` by the time we
  // look at `data`. Accept the legacy `gatheringRegions` key on read (pre-1.1.0-migration
  // exports) so an old export still validates under the canonical name.
  const legacySystemRealms = rawData.system?.gatheringRealms ?? rawData.system?.gatheringRegions;
  if (legacySystemRealms !== undefined && !Array.isArray(legacySystemRealms)) {
    errors.push('System "gatheringRealms" field must be an array');
  }

  // Each realm should carry a name (warning, not a hard error, so a hand-trimmed export still
  // imports).
  const realms = data.travelConfig?.realms;
  if (realms !== undefined && !Array.isArray(realms)) {
    errors.push('"travelConfig.realms" field must be an array');
  } else {
    for (const [i, realm] of (realms ?? []).entries()) {
      if (realm && typeof realm === 'object' && !realm.name) {
        warnings.push(`Gathering realm at index ${i} (id: ${realm.id || 'unknown'}) has no name`);
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
export function prepareForImport(rawData, mode = 'keep') {
  // Upcast legacy payloads so downstream import always sees the v2 fields.
  const data = migrateExportPayload(rawData);

  const system = structuredClone(data.system);
  const recipes = Array.isArray(data.recipes) ? structuredClone(data.recipes) : [];
  const gatheringEnvironments = Array.isArray(data.gatheringEnvironments)
    ? structuredClone(data.gatheringEnvironments)
    : [];
  const gatheringConfig =
    data.gatheringConfig && typeof data.gatheringConfig === 'object'
      ? structuredClone(data.gatheringConfig)
      : { system: {}, shared: {} };

  // The WORLD currency ladder (issue 1278). It rides the envelope rather than the system, so
  // unlike every other slice above there is nothing on `system` to fall back on: drop it here
  // and `CompendiumImporter._persistCurrencyConfig` receives `undefined` and returns
  // immediately, which lands every imported currency cost in the destination world as an
  // unresolvable unit id. Deliberately NOT rebound under `copy` mode: unit ids are world scope,
  // shared by every crafting system, and the merge already lets the destination win a collision.
  const currencyConfig =
    data.currencyConfig && typeof data.currencyConfig === 'object'
      ? structuredClone(data.currencyConfig)
      : {};

  // The WORLD realm library (issue 1282), carried for exactly the reason the ladder above is:
  // it rides the envelope rather than the system, so there is nothing on `system` to fall back
  // on. Drop it here and `CompendiumImporter._persistTravelConfig` receives `undefined` and
  // returns immediately, landing every realm-gated environment in the destination world citing
  // realm ids that name nothing. Deliberately NOT rebound under `copy` mode: realm ids are
  // world scope, shared by every crafting system that opts in, and the merge already lets the
  // destination win a collision — rebinding would fork the world's own geography per copy.
  const travelConfig =
    data.travelConfig && typeof data.travelConfig === 'object'
      ? structuredClone(data.travelConfig)
      : {};

  const prepared = {
    system,
    recipes,
    gatheringEnvironments,
    gatheringConfig,
    currencyConfig,
    travelConfig,
  };

  if (mode === 'copy') {
    delete system.id;
    // Append "(Copy)" to the name so the user can distinguish it
    system.name = `${system.name || 'Crafting System'} (Copy)`;

    // Regenerate recipe ids with an old→new map and atomically remap each
    // recipe-book membership array (recipeItemDefinitions[].recipeIds) to the
    // regenerated id, so a copy's books resolve to the copy's recipes instead of
    // dangling at the pre-import ids (issue #701). Done eagerly here rather than
    // leaving id minting to the downstream Recipe constructor so Phase 5 reference
    // resolution sees the regenerated ids.
    rebindCopyRecipeIds(prepared);

    // Regenerate record-CONTAINER ids (realm ids, environment record ids) and
    // rewire their internal cross-references, while PRESERVING task / event /
    // characterModifier ids so environment→library linkages survive (D3). The
    // craftingSystemId + gatheringConfig system-key are rebound by the importer
    // once createSystem has generated the fresh system id.
    rebindCopyContainerIds(prepared);

    // Regenerate every component id and atomically remap every within-payload
    // component reference (issue 570). This closes #556's copy-import id-collision
    // residual: two systems copy-imported from the same origin export no longer
    // share a component id. Possible only after #561 relieved `componentId` of its
    // cross-system Tool-reference duty.
    rebindCopyComponentIds(prepared);
  }

  return prepared;
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
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
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

/** Every check block that can carry a progressive sub-object (issue 1097). */
const PROGRESSIVE_CHECK_KEYS = ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck'];

/**
 * Remove the Checks Studio's progressive PREVIEW SANDBOX from an export.
 *
 * `progressive.preview.difficulties` is the ordered list a GM types into the odds histogram
 * to see what a check would award. It is an experiment on one authoring screen, not a
 * property of the system: no runtime path reads it and no readiness rule validates it. A
 * value shipped inside a distributed system reads to the recipient as configuration they are
 * expected to understand, which is exactly the misreading this strip prevents — and it is
 * the same call the `runtimeStateIncluded: false` boundary already makes about every other
 * piece of non-authoring state.
 *
 * ABSENCE-PRESERVING in the other direction too: it deletes the key rather than emptying it,
 * so an import cannot tell an exported experiment from one that was never run.
 *
 * @param {object} system The cloned export system.
 * @returns {object} The same object, sandbox removed.
 */
function stripPreviewSandbox(system) {
  for (const key of PROGRESSIVE_CHECK_KEYS) {
    const progressive = system?.[key]?.progressive;
    if (progressive && typeof progressive === 'object') delete progressive.preview;
  }
  return system;
}
