/**
 * Pure, Foundry-free, idempotent upcast of an export payload to the current schema, so it runs
 * before validation and in tests. `import-export/spec.md` § Migration of older exports owns the
 * ladder and every field-level rule, including why each derivation is BRANCH-INDEPENDENT.
 */

import { FABRICATE_EXPORT_SCHEMA_VERSION } from '../systems/authoringExport.js';
import { membershipKey } from '../systems/scopedDefinitions.js';
import { subKeyEntries } from '../systems/scopedDefinitionStore.js';
import { cloneJson, isPlainObject } from '../utils/scalars.js';

import { mergeEquivalentWorldEssences } from './mergeEquivalentWorldEssences.js';
import {
  buildWorldCharacterLibraries,
  stripSystemCharacterLibraries,
} from './migrateCharacterLibrariesToWorldScope.js';
import { migrateComponentEssenceSections } from './migrateComponentEssenceSections.js';
import {
  buildWorldCurrencyConfig,
  stripSystemCurrencyConfig,
} from './migrateCurrencyToWorldScope.js';
import { applyManualCompositionForceFold } from './migrateManualCompositionForces.js';
import { applyMaxModifierPicks } from './migrateMaxModifierPicks.js';
import { applyRetireCraftingModToken } from './migrateRetireCraftingModToken.js';
import { applySeededFailureResultPolicy } from './migrateSeedFailureResultPolicy.js';
import { applySubjectModifierMarks } from './migrateSubjectModifierMarks.js';
import { applySystemCheckModifierCatalogue } from './migrateSystemCheckModifierCatalogue.js';
import { deriveToolSourceFromComponents } from './migrateToolsToFirstClass.js';
import { buildWorldTravelConfig, stripSystemTravelConfig } from './migrateTravelToWorldScope.js';
import { applyUnifiedModifierLibrary } from './migrateUnifyModifierLibraries.js';
import { migrateWorldScopeEntities, SCOPE_PAYLOAD_KEYS } from './migrateWorldScopeEntities.js';

/** Upcast legacy componentId-only Tools through the world-side `1.15.0` transform (issue 561). */
function upcastLegacyTools(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || !Array.isArray(system.tools)) return;
  const components = Array.isArray(system.components) ? system.components : [];
  for (const tool of system.tools) deriveToolSourceFromComponents(tool, components);
}

/** Stamp the `playerPicks` cap through the world-side `1.20.0` transform; an authored cap wins. */
function deriveMaxModifierPicks(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applyMaxModifierPicks(system);
}

/** Strip the retired placeholder through `1.21.0`; its counts are discarded (issue 1094). */
function retireCraftingModToken(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applyRetireCraftingModToken(system);
}

/** Lift the catalogue through `1.22.0`; its order is SYMMETRY, not necessity (issue 1095). */
function liftCheckModifierCatalogue(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applySystemCheckModifierCatalogue(system);
}

/** Merge both libraries through `1.23.0`, AFTER the lift — order is observable (issue 1117). */
function unifyModifierLibraries(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  const slice = migrated?.gatheringConfig?.system;
  const systemConfig = slice && typeof slice === 'object' && !Array.isArray(slice) ? slice : null;
  applyUnifiedModifierLibrary(system, systemConfig);
}

/** Seed the failure-result policy through `1.25.0`; a present key is never overwritten (issue 1098). */
/** Lift a pre-1278 export's currency block through the SAME function the world path uses. */
function liftCurrencyToWorldScope(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;

  const existing = migrated.currencyConfig;
  // Gate on ANY world config, not UNITS: § Migration of older exports, already-lifted guard rule.
  const alreadyLifted =
    existing && typeof existing === 'object' && Object.keys(existing).length > 0;

  if (!alreadyLifted) {
    migrated.currencyConfig = buildWorldCurrencyConfig([system]);
  }
  migrated.system = stripSystemCurrencyConfig([system])[0];
}

/** Lift a pre-1282 export's realm library through the same shared function, so neither can drift. */
function liftTravelToWorldScope(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;

  const existing = migrated.travelConfig;
  // Gate on ANY travel config, not on REALMS, for the currency lift's reason.
  const alreadyLifted =
    existing &&
    typeof existing === 'object' &&
    !Array.isArray(existing) &&
    Object.keys(existing).length > 0;

  if (!alreadyLifted) {
    // `_collisions` is the WORLD notice's diagnostic; one system cannot collide with itself.
    const { _collisions: _diagnostics, ...built } = buildWorldTravelConfig([system]);
    migrated.travelConfig = built;
  }
  migrated.system = stripSystemTravelConfig([system])[0];
}

/** Lift a pre-1308 export's character libraries and drop the system's copies. */
function liftCharacterLibrariesToWorldScope(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;

  const existing = migrated.characterLibraries;
  // NON-EMPTY, not merely present, and a TWO-LIST DISJUNCTION: § Migration of older exports.
  const alreadyLifted =
    existing &&
    typeof existing === 'object' &&
    !Array.isArray(existing) &&
    ((Array.isArray(existing.characterPrerequisites) &&
      existing.characterPrerequisites.length > 0) ||
      (Array.isArray(existing.modifiers) && existing.modifiers.length > 0));

  if (!alreadyLifted) {
    // `_collisions` is the WORLD notice's diagnostic; one system cannot collide with itself.
    const { _collisions: _diagnostics, ...built } = buildWorldCharacterLibraries([system]);
    migrated.characterLibraries = built;
  }
  migrated.system = stripSystemCharacterLibraries([system])[0];
}

/** Fold manual force lists through `1.29.0` itself; the AUTOMATIC clear is legacy-only (1315). */
function foldManualCompositionForces(migrated, { clearAutomaticForces }) {
  const environments = migrated?.gatheringEnvironments;
  if (!Array.isArray(environments)) return;
  migrated.gatheringEnvironments = applyManualCompositionForceFold(environments, {
    clearAutomaticForces,
  }).environments;
}

/** The three entity types the world-scope entity slices carry, in the shipped order. */
const SCOPE_ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/** Transient diagnostics `prepareForImport` reads: the one key on which a re-migrate may differ. */
export const WORLD_SCOPE_UPCAST_REPORT_KEY = '_worldScopeEntityReport';

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** STEP 2: re-key one envelope slice to the PERSISTED MAP SHAPE (§ map-shape rule). */
function scopeSliceToPersistedShape(slice) {
  const source = isPlainObject(slice) ? slice : {};
  const { entities, defaults, membership, ...extras } = source;

  const keyedDefaults = {};
  for (const record of subKeyEntries(defaults)) {
    if (!isPlainObject(record)) continue;
    const id = trimmedString(record.id);
    if (!id) continue;
    keyedDefaults[id] = record;
  }

  const keyedMembership = {};
  for (const record of subKeyEntries(membership)) {
    if (!isPlainObject(record)) continue;
    const entityId = trimmedString(record.entityId);
    const systemId = trimmedString(record.systemId);
    if (!entityId || !systemId) continue;
    keyedMembership[membershipKey(entityId, systemId)] = record;
  }

  return {
    entities: subKeyEntries(entities).filter((entry) => isPlainObject(entry)),
    defaults: keyedDefaults,
    membership: keyedMembership,
    ...extras,
  };
}

/** STEP 4: project a scope payload back to the envelope ARRAY form; `subKeyEntries` makes it TOTAL. */
function scopeSliceToEnvelopeShape(payload) {
  const source = isPlainObject(payload) ? payload : {};
  return {
    entities: cloneJson(subKeyEntries(source.entities).filter((entry) => isPlainObject(entry))),
    defaults: cloneJson(subKeyEntries(source.defaults).filter((entry) => isPlainObject(entry))),
    membership: cloneJson(subKeyEntries(source.membership).filter((entry) => isPlainObject(entry))),
  };
}

/**
 * Schema 5 to 6: DERIVE the three world-scope entity slices through the `1.30.0` migration itself
 * (issue 1364). NOT a lift, branch-independent, LAST on each branch, and the transform's
 * `systems`/`recipes`/`gatheringConfig` are DISCARDED — § Migration of older exports owns all four.
 * The WORLD TOOL-BREAKAGE AUTHORITY is dropped here because a HAND-EDITED payload never reaches
 * the export assembler.
 */
function deriveWorldScopeEntitySlices(migrated) {
  const system = migrated?.system;
  if (!isPlainObject(system)) return;

  // STEP 1 — default each absent slice FIRST: the shared transform answers the ORIGINAL object for
  // an unchanged key, so an unsynthesized slice would come back `undefined`.
  const input = {};
  const carried = {};
  for (const entityType of SCOPE_ENTITY_TYPES) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    const slice = isPlainObject(migrated[key]) ? migrated[key] : {};
    carried[key] = slice;
    // STEP 2 - the map/array conversion. See `scopeSliceToPersistedShape`.
    input[key] = scopeSliceToPersistedShape(slice);
  }

  const systemId = trimmedString(system.id);
  const gatheringSlice = isPlainObject(migrated.gatheringConfig?.system)
    ? migrated.gatheringConfig.system
    : {};

  // STEP 3 — the shipped `1.30.0` transform over a synthesized ONE-SYSTEM corpus.
  const result = migrateWorldScopeEntities({
    systems: [system],
    recipes: Array.isArray(migrated.recipes) ? migrated.recipes : [],
    gatheringConfig: systemId ? { systems: { [systemId]: gatheringSlice } } : { systems: {} },
    ...input,
  });

  // STEP 3b — the `1.32.0` essence election over the same corpus, SHARED rather than
  // reimplemented: without it a bundle exported between the two arrives unswitched (issue 1371).
  migrateComponentEssenceSections({
    systems: [system],
    componentScope: result?.[SCOPE_PAYLOAD_KEYS.components],
  });

  let droppedToolBreakage = null;
  for (const entityType of SCOPE_ENTITY_TYPES) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    const payload = isPlainObject(result?.[key]) ? result[key] : carried[key];
    // STEP 5, first half — the DROP, of the whole extras spread rather than one named key. The
    // authority is recorded so the import can report it rather than losing it silently.
    if (entityType === 'tools' && isPlainObject(payload?.toolBreakage)) {
      droppedToolBreakage = cloneJson(payload.toolBreakage);
    }
    // STEP 4, plus STEP 5's second half - array projection through a fresh deep copy.
    migrated[key] = scopeSliceToEnvelopeShape(payload);
  }

  migrated[WORLD_SCOPE_UPCAST_REPORT_KEY] = {
    refusals: cloneJson(
      Array.isArray(result?._worldScopeEntityReport?.refusals)
        ? result._worldScopeEntityReport.refusals
        : []
    ),
    droppedToolBreakage,
  };
}

/**
 * Schema 6, field level: merge the bundle's equivalent world essences through the shipped `1.34.0`
 * pass itself, branch-independently and AFTER {@link deriveWorldScopeEntitySlices}. Unlike a
 * `1.30.0` re-key map, whatever this map says is APPLIED — see § Migration of older exports,
 * requirement 12 (issue 1654).
 */
function mergeEquivalentBundleEssences(migrated) {
  const system = migrated?.system;
  if (!isPlainObject(system)) return;

  const systemId = trimmedString(system.id);
  const gatheringSlice = isPlainObject(migrated.gatheringConfig?.system)
    ? migrated.gatheringConfig.system
    : {};

  // The same map/array conversion, for the same reason.
  const result = mergeEquivalentWorldEssences({
    systems: [system],
    recipes: Array.isArray(migrated.recipes) ? migrated.recipes : [],
    gatheringConfig: systemId ? { systems: { [systemId]: gatheringSlice } } : { systems: {} },
    [SCOPE_PAYLOAD_KEYS.essences]: scopeSliceToPersistedShape(
      migrated[SCOPE_PAYLOAD_KEYS.essences]
    ),
    [SCOPE_PAYLOAD_KEYS.components]: scopeSliceToPersistedShape(
      migrated[SCOPE_PAYLOAD_KEYS.components]
    ),
  });

  // Adopted, not discarded, and each assignment is gated on the key having been present: the
  // corpus is synthesized, so an ungated write-back would ADD a key the bundle never carried.
  const mergedSystem = Array.isArray(result?.systems) ? result.systems[0] : null;
  if (isPlainObject(mergedSystem)) migrated.system = mergedSystem;
  if (Array.isArray(migrated.recipes) && Array.isArray(result?.recipes)) {
    migrated.recipes = result.recipes;
  }
  const mergedSlice = result?.gatheringConfig?.systems?.[systemId];
  if (isPlainObject(migrated.gatheringConfig?.system) && isPlainObject(mergedSlice)) {
    migrated.gatheringConfig.system = mergedSlice;
  }
  // Step 4's helper, reused rather than respelled, and gated the same way.
  for (const entityType of ['essences', 'components']) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    if (!(key in migrated)) continue;
    migrated[key] = scopeSliceToEnvelopeShape(
      isPlainObject(result?.[key]) ? result[key] : migrated[key]
    );
  }

  // Carried rather than dropped, on the derivation's rule: a refusal must be REPORTED.
  const report = isPlainObject(migrated[WORLD_SCOPE_UPCAST_REPORT_KEY])
    ? migrated[WORLD_SCOPE_UPCAST_REPORT_KEY]
    : {};
  report.essenceMergeRefusals = cloneJson(
    Array.isArray(result?._worldEssenceMergeReport?.refusals)
      ? result._worldEssenceMergeReport.refusals
      : []
  );
  migrated[WORLD_SCOPE_UPCAST_REPORT_KEY] = report;
}

function seedFailureResultPolicy(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applySeededFailureResultPolicy(system);
}

/**
 * Record the mark that keeps an imported bundle's subject modifier picks rolling, through the
 * `1.33.0` transform. ORDERED AFTER `liftCharacterLibrariesToWorldScope`, and LEGACY-BRANCH ONLY —
 * the one divergence from every sibling, and deliberate; § Migration of older exports owns both
 * rules and why seeding on the current-schema branch would break § Round-trip integrity (1608).
 */
function seedSubjectModifierMarks(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applySubjectModifierMarks(system, {
    recipes: migrated.recipes,
    tasks: migrated.gatheringConfig?.system?.tasks,
    worldLibraries: migrated.characterLibraries,
  });
}

export function migrateExportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  // Already current — a no-op for the envelope, but every field-level upcast still runs, because
  // a bundle stamped current can predate any of them. Clone so callers never alias the input.
  if (payload.schemaVersion === FABRICATE_EXPORT_SCHEMA_VERSION) {
    const current = structuredClone(payload);
    upcastLegacyTools(current);
    deriveMaxModifierPicks(current);
    retireCraftingModToken(current);
    liftCheckModifierCatalogue(current);
    unifyModifierLibraries(current);
    seedFailureResultPolicy(current);
    liftCurrencyToWorldScope(current);
    liftTravelToWorldScope(current);
    liftCharacterLibrariesToWorldScope(current);
    foldManualCompositionForces(current, { clearAutomaticForces: false });
    deriveWorldScopeEntitySlices(current);
    mergeEquivalentBundleEssences(current);
    return current;
  }

  const migrated = structuredClone(payload);

  // Schema 1 → 2: the explicit version marker, the runtime boundary flag, and the
  // gathering-authoring defaults.
  migrated.schemaVersion = FABRICATE_EXPORT_SCHEMA_VERSION;
  if (typeof migrated.runtimeStateIncluded !== 'boolean') {
    migrated.runtimeStateIncluded = false;
  }

  if (!Array.isArray(migrated.gatheringEnvironments)) {
    migrated.gatheringEnvironments = [];
  }

  if (!migrated.gatheringConfig || typeof migrated.gatheringConfig !== 'object') {
    // Lift a hand-authored `system.gatheringConfig` ONLY when it matches the envelope shape; a
    // world-setting-shaped object would persist as an empty slice, so it is ignored.
    const legacy = migrated.system?.gatheringConfig;
    const looksLikeExportShape =
      legacy && typeof legacy === 'object' && ('system' in legacy || 'shared' in legacy);
    migrated.gatheringConfig = looksLikeExportShape ? legacy : { system: {}, shared: {} };
  }

  upcastLegacyTools(migrated);
  deriveMaxModifierPicks(migrated);
  retireCraftingModToken(migrated);
  liftCheckModifierCatalogue(migrated);
  unifyModifierLibraries(migrated);
  seedFailureResultPolicy(migrated);
  liftCurrencyToWorldScope(migrated);
  liftTravelToWorldScope(migrated);
  liftCharacterLibrariesToWorldScope(migrated);
  seedSubjectModifierMarks(migrated);
  foldManualCompositionForces(migrated, { clearAutomaticForces: true });
  deriveWorldScopeEntitySlices(migrated);
  mergeEquivalentBundleEssences(migrated);

  return migrated;
}
