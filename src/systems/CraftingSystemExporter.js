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
 * @param {object} [characterLibraries={}] - FULL `characterLibraries` world setting
 * @param {object} [componentScope={}] - FULL `componentScope` world setting
 * @param {object} [essenceScope={}] - FULL `essenceScope` world setting
 * @param {object} [toolScope={}] - FULL `toolScope` world setting
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
  travelConfig = {},
  // The world character libraries (issue 1308): the character-prerequisite library and the
  // modifier library. Defaulted for the same reason as the two above, with the same consequence —
  // an export produced without it carries empty libraries, so every learning gate, tool
  // requirement and check modifier in the bundle lands unresolvable.
  characterLibraries = {},
  // The three WORLD-SCOPE ENTITY settings (issue 1364): the world entity roster, the world
  // defaults and the per-(entity, system) membership records. Defaulted for the reason the three
  // slices above are, but with a DIFFERENT consequence, because unlike them these are FILTERED BY
  // MEMBERSHIP to the exported system: an export produced without them carries three empty slices,
  // so the destination's world corpus learns nothing about the system it just imported.
  componentScope = {},
  essenceScope = {},
  toolScope = {}
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
    characterLibraries: assembleCharacterLibrariesAuthoringBundle(characterLibraries),
    componentScope: assembleScopedEntityBundle(componentScope, systemId),
    essenceScope: assembleScopedEntityBundle(essenceScope, systemId),
    toolScope: assembleScopedEntityBundle(toolScope, systemId),
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

  // The three WORLD-SCOPE ENTITY slices (issue 1364), checked against the RAW payload rather
  // than the migrated one — and that is not a stylistic choice. The 5→6 upcast REPLACES a slice
  // it cannot read with a freshly derived one, so by the time we look at `data` a malformed slice
  // has already become a well-formed one and this check would never fire. A dropped slice is an
  // import that quietly creates no memberships, which is indistinguishable from success until the
  // consumer sweep makes the read union visible.
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
      // EITHER SHAPE IS VALID. `## Scoped Entity Definitions` requirement 13 makes the map and the
      // array both normative for `defaults` and `membership`, and `entities` is an array on both
      // sides; a scalar is the only thing that cannot be one.
      if (typeof value !== 'object' || value === null) {
        errors.push(`"${key}.${subKey}" field must be an object or an array`);
      }
    }
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
 *   - 'copy': bind an incoming entity to the destination's existing world entity where their
 *     source references match, and mint a fresh id only where they do not
 * @param {object} [options]
 * @param {{components?: object[], essences?: object[], tools?: object[]}} [options.worldEntityIndex]
 *   The DESTINATION world's entity roster, read from the three world-scope entity stores. REQUIRED
 *   under copy mode and never defaulted: falling back to minting a fresh id for every entity is
 *   precisely the duplication epic 1357 exists to end, and a silent default is the defect class
 *   this repository has already documented against itself. In keep mode it is optional and is used
 *   only to REPORT an id collision, which keep mode must not repair.
 * @returns {object} Pack data shaped for CompendiumImporter
 */
export function prepareForImport(rawData, mode = 'keep', options = null) {
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

  // The WORLD character libraries (issue 1308), carried for exactly the reason the two slices
  // above are: they ride the envelope rather than the system, so there is nothing on `system` to
  // fall back on. Drop them here and `CompendiumImporter._persistCharacterLibraries` receives
  // `undefined` and returns immediately, landing every learning gate, tool requirement and check
  // modifier in the destination world citing entry ids that name nothing. Deliberately NOT
  // rebound under `copy` mode, for the reason realm and unit ids are not: these ids are world
  // scope, shared by every crafting system, and the merge already lets the destination win a
  // collision — rebinding would fork the world's own rules per copy.
  const characterLibraries =
    data.characterLibraries && typeof data.characterLibraries === 'object'
      ? structuredClone(data.characterLibraries)
      : {};

  // The three WORLD-SCOPE ENTITY slices (issue 1364). Unlike the three world slices above, these
  // are always present after the upcast — it DERIVES them from the bundle's own system rather
  // than defaulting them empty — so there is no "dropped here" failure mode to guard. They are
  // cloned because the copy-mode rewrite below edits them in place.
  const scopeSlices = {};
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    const key = WORLD_SCOPE_SLICE_KEYS[entityType];
    scopeSlices[key] =
      data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])
        ? structuredClone(data[key])
        : { entities: [], defaults: [], membership: [] };
  }

  const upcastReport = data[WORLD_SCOPE_UPCAST_REPORT_KEY];
  // Every `(system, entityType)` pair the shared transform REFUSED. A refused pair yields an
  // EMPTY slice, so carrying the refusal is what stops a refusal presenting as a system that
  // simply has no world members.
  const worldScopeRefusals = Array.isArray(upcastReport?.refusals)
    ? structuredClone(upcastReport.refusals)
    : [];
  const worldScopeReferences = [];
  if (upcastReport?.droppedToolBreakage) {
    // KIND 4, and it is a separate kind because the authority is NOT a world default: it is the
    // FOURTH sub-key of `toolScope`, world scope rather than entity scope. It is the one entry
    // with no record owner, and every entry must carry an owner, so it takes the shipped `unknown`
    // owner type — which already reads "Record" — naming the SETTING rather than inventing a
    // scope-level owner type for one entry.
    worldScopeReferences.push({
      kind: REFERENCE_KINDS.WORLD_TOOL_BREAKAGE_DROPPED,
      ownerType: 'unknown',
      ownerId: 'toolScope',
      ownerName: 'World tool scope',
      referenceValue: String(upcastReport.droppedToolBreakage.authority ?? ''),
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

  // ORDERING IS LOAD-BEARING. `migrateExportPayload` has already DERIVED the three slices above,
  // keyed to the bundle's OWN ids, so the copy-mode map below rewrites them along with every other
  // reference. Deriving after rebinding would strand every membership and defaults record at a
  // pre-rebind id.
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

    // Bind every incoming component to the destination's existing world entity where their
    // source references say they are the same Item, mint where they do not, and atomically remap
    // every within-payload component reference — including the ones inside the three world-scope
    // slices (issue 1364, retracting issue 570's mint-everything rule).
    rebindCopyComponentIds(prepared, { worldEntityIndex, report: worldScopeReferences });
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
