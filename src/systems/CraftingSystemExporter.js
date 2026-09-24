/**
 * Exports and validates crafting systems for JSON file import/export.
 * Pure functions — no Foundry globals required (testable in isolation).
 */

import {
  migrateExportPayload,
  WORLD_SCOPE_UPCAST_REPORT_KEY,
} from '../migration/migrateExportPayload.js';

import {
  FABRICATE_EXPORT_SCHEMA_VERSION,
  assembleCharacterLibrariesAuthoringBundle,
  assembleCurrencyAuthoringBundle,
  assembleGatheringAuthoringBundle,
  assembleScopedEntityBundle,
  assembleTravelAuthoringBundle,
} from './authoringExport.js';
import {
  rebindCopyContainerIds,
  rebindCopyComponentIds,
  rebindCopyRecipeIds,
  reportWorldEntityCollisions,
  REFERENCE_KINDS,
  WORLD_SCOPE_ENTITY_TYPES,
  WORLD_SCOPE_SLICE_KEYS,
} from './importReferenceResolver.js';

const SYSTEM_ID_PLACEHOLDER = '__SYSTEM_ID__';

/**
 * The export envelope for a crafting system: its recipes, its gathering authoring model and the
 * world slices (currency, travel, character libraries and the three membership-filtered world-scope
 * entity slices), with an integer `schemaVersion` and `runtimeStateIncluded: false`.
 */
export function buildExportPayload(
  system,
  recipes,
  fabricateVersion,
  gatheringEnvironments = [],
  gatheringConfig = {},
  // The world slices default empty so older call sites keep working; an export without one carries
  // an empty slice, leaving every reference into it unresolvable in the destination.
  currencyConfig = {},
  travelConfig = {},
  characterLibraries = {},
  componentScope = {},
  essenceScope = {},
  toolScope = {}
) {
  if (!system || !system.id) {
    throw new Error('Cannot export: system is missing or has no id');
  }

  const systemId = system.id;

  // Strip the transitional aliases and the Checks Studio's progressive preview sandbox (scratch).
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
    characterLibraries: assembleCharacterLibrariesAuthoringBundle(characterLibraries),
    componentScope: assembleScopedEntityBundle(componentScope, systemId),
    essenceScope: assembleScopedEntityBundle(essenceScope, systemId),
    toolScope: assembleScopedEntityBundle(toolScope, systemId),
  };
}

/** Validate import data before `CompendiumImporter`, upcasting a legacy payload first. */
export function validateImportData(rawData) {
  const errors = [];
  const warnings = [];

  if (!rawData || typeof rawData !== 'object') {
    errors.push('Import data is not a valid object');
    return { valid: false, errors, warnings };
  }

  const data = migrateExportPayload(rawData);

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

  // The world-scope slices (issue 1364) are checked against the RAW payload: the 5 to 6 upcast
  // replaces an unreadable slice with a derived one, so a malformed slice would pass unseen and
  // quietly create no memberships.
  for (const key of Object.values(WORLD_SCOPE_SLICE_KEYS)) {
    const slice = rawData[key];
    if (slice === undefined) continue;
    if (typeof slice !== 'object' || slice === null || Array.isArray(slice)) {
      errors.push(`"${key}" field must be an object`);
      continue;
    }
    for (const subKey of ['entities', 'defaults', 'membership']) {
      const value = slice[subKey];
      if (value === undefined) continue;
      // Either shape is valid (Scoped Entity Definitions requirement 13); a scalar is neither.
      if (typeof value !== 'object' || value === null) {
        errors.push(`"${key}.${subKey}" field must be an object or an array`);
      }
    }
  }

  if (!data.system || typeof data.system !== 'object') {
    errors.push('Missing required "system" field');
  } else if (!data.system.name || typeof data.system.name !== 'string') {
    errors.push('System is missing a "name" field');
  }

  // Legacy system realms (and the pre-1.1.0 `gatheringRegions` key) are checked RAW, since the
  // upcast hoists and discards them; realms ride the envelope since issue 1282.
  const legacySystemRealms = rawData.system?.gatheringRealms ?? rawData.system?.gatheringRegions;
  if (legacySystemRealms !== undefined && !Array.isArray(legacySystemRealms)) {
    errors.push('System "gatheringRealms" field must be an array');
  }

  // A nameless realm only warns, so a hand-trimmed export still imports.
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
 * Shape validated import data for `CompendiumImporter.importFromPackData()`. `keep` retains ids;
 * `copy` binds each incoming entity to the destination world entity its source references match
 * and mints only otherwise. `options.worldEntityIndex` is the destination roster, REQUIRED in copy
 * mode and never defaulted, since minting everything is the duplication epic 1357 ends; keep mode
 * uses it only to report id collisions.
 */
export function prepareForImport(rawData, mode = 'keep', options = null) {
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

  // The world slices ride the envelope, with no `system` fallback: dropped here, the matching
  // `CompendiumImporter._persist*` returns early and strands every reference into it. None is
  // rebound in copy mode, since their ids are world scope and the merge lets the destination win.
  const currencyConfig =
    data.currencyConfig && typeof data.currencyConfig === 'object'
      ? structuredClone(data.currencyConfig)
      : {};

  const travelConfig =
    data.travelConfig && typeof data.travelConfig === 'object'
      ? structuredClone(data.travelConfig)
      : {};

  const characterLibraries =
    data.characterLibraries && typeof data.characterLibraries === 'object'
      ? structuredClone(data.characterLibraries)
      : {};

  // Always present after the upcast, which derives them; cloned because the copy rewrite edits
  // them in place.
  const scopeSlices = {};
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    const key = WORLD_SCOPE_SLICE_KEYS[entityType];
    scopeSlices[key] =
      data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])
        ? structuredClone(data[key])
        : { entities: [], defaults: [], membership: [] };
  }

  const upcastReport = data[WORLD_SCOPE_UPCAST_REPORT_KEY];
  // Each refused `(system, entityType)` pair, carried so a refusal's empty slice does not read as a
  // system without world members.
  const worldScopeRefusals = Array.isArray(upcastReport?.refusals)
    ? structuredClone(upcastReport.refusals)
    : [];
  const worldScopeReferences = [];
  if (upcastReport?.droppedToolBreakage) {
    // A separate kind: the authority is `toolScope`'s fourth, world-scope sub-key rather than a
    // default, so it takes the `unknown` owner type and names the setting.
    worldScopeReferences.push({
      kind: REFERENCE_KINDS.WORLD_TOOL_BREAKAGE_DROPPED,
      ownerType: 'unknown',
      ownerId: 'toolScope',
      ownerName: 'World tool scope',
      referenceValue: String(upcastReport.droppedToolBreakage.authority ?? ''),
      disposition: 'reported',
    });
  }

  // A `1.34.0` refusal changes no slice, so it is reported here, owned by the refused group's
  // survivor (the id a GM can find); the losers ride the reference value.
  for (const refusal of Array.isArray(upcastReport?.essenceMergeRefusals)
    ? upcastReport.essenceMergeRefusals
    : []) {
    worldScopeReferences.push({
      kind: REFERENCE_KINDS.WORLD_ESSENCE_MERGE_REFUSED,
      ownerType: 'essence',
      ownerId: String(refusal?.survivorId ?? ''),
      // `name`, not `survivorName`: `displayNameOf` emits a bare `name`, omitted when it has none.
      ownerName: String(refusal?.name ?? refusal?.survivorId ?? ''),
      referenceValue: `${(Array.isArray(refusal?.loserIds) ? refusal.loserIds : []).join(', ')} (${refusal?.reason ?? 'unknown'})`,
      disposition: 'reported',
    });
  }

  const prepared = {
    system,
    recipes,
    gatheringEnvironments,
    gatheringConfig,
    currencyConfig,
    travelConfig,
    characterLibraries,
    ...scopeSlices,
    worldScopeRefusals,
    worldScopeReferences,
  };

  // ORDERING: the upcast already derived the slices under the bundle's own ids, so the copy map
  // below rewrites them too; deriving after rebinding would strand them at pre-rebind ids.
  const worldEntityIndex = options?.worldEntityIndex ?? null;
  worldScopeReferences.push(...reportWorldEntityCollisions(prepared, worldEntityIndex, mode));

  if (mode === 'copy') {
    if (!worldEntityIndex || typeof worldEntityIndex !== 'object') {
      throw new Error(
        'prepareForImport: copy mode requires a `worldEntityIndex` naming the destination ' +
          "world's entities. Defaulting it would silently mint a fresh id for every component, " +
          'creating a second world record for every item the destination already holds.'
      );
    }
    delete system.id;
    // Append "(Copy)" to the name so the user can distinguish it
    system.name = `${system.name || 'Crafting System'} (Copy)`;

    // Eagerly, so reference resolution sees the regenerated recipe ids (issue 701).
    rebindCopyRecipeIds(prepared);

    rebindCopyContainerIds(prepared);

    // Match-or-mint over components, rewriting the world-scope slices too (issue 1364).
    rebindCopyComponentIds(prepared, { worldEntityIndex, report: worldScopeReferences });
  }

  return prepared;
}

/** `fabricate-<slug>-<yyyy-mm-dd>.json`. */
export function makeExportFilename(systemName) {
  const slug = (systemName || 'system')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `fabricate-${slug}-${date}.json`;
}

/** Strip the aliases `_normalizeSystem` adds, keeping the canonical fields. */
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
  // No longer emitted by `_normalizeSystem`, but older stored data may carry them.
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
 * Delete the Checks Studio's progressive PREVIEW SANDBOX, an authoring-screen experiment no
 * runtime reads that a recipient would misread as configuration. Deleted rather than emptied, so
 * an import cannot tell an exported experiment from one never run.
 */
function stripPreviewSandbox(system) {
  for (const key of PROGRESSIVE_CHECK_KEYS) {
    const progressive = system?.[key]?.progressive;
    if (progressive && typeof progressive === 'object') delete progressive.preview;
  }
  return system;
}
