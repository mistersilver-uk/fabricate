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

/** Lift a pre-1278 export's currency block through the world path's own function. */
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

/** Lift a pre-1282 export's realm library through the shared function. */
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

/** Through `1.29.0` itself; the automatic clear is legacy-only (issue 1315). */
function foldManualCompositionForces(migrated, { clearAutomaticForces }) {
  const environments = migrated?.gatheringEnvironments;
  if (!Array.isArray(environments)) return;
  migrated.gatheringEnvironments = applyManualCompositionForceFold(environments, {
    clearAutomaticForces,
  }).environments;
}

const SCOPE_ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/** Transient diagnostics `prepareForImport` reads: the one key on which a re-migrate may differ. */
export const WORLD_SCOPE_UPCAST_REPORT_KEY = '_worldScopeEntityReport';

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Step 2: to the persisted map shape (§ map-shape rule). */
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

/** Step 4: back to the envelope array form, total through `subKeyEntries`. */
function scopeSliceToEnvelopeShape(payload) {
  const source = isPlainObject(payload) ? payload : {};
  return {
    entities: cloneJson(subKeyEntries(source.entities).filter((entry) => isPlainObject(entry))),
    defaults: cloneJson(subKeyEntries(source.defaults).filter((entry) => isPlainObject(entry))),
    membership: cloneJson(subKeyEntries(source.membership).filter((entry) => isPlainObject(entry))),
  };
}

/**
 * Schema 5 to 6: derive the world-scope slices through `1.30.0` itself (issue 1364), not a lift,
 * branch-independent and last, discarding its `systems`, `recipes` and `gatheringConfig`. The world
 * tool-breakage authority is dropped: a hand-edited payload never reaches the export assembler.
 */
function deriveWorldScopeEntitySlices(migrated) {
  const system = migrated?.system;
  if (!isPlainObject(system)) return;

  // Step 1: default each absent slice, or an unchanged key comes back `undefined`.
  const input = {};
  const carried = {};
  for (const entityType of SCOPE_ENTITY_TYPES) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    const slice = isPlainObject(migrated[key]) ? migrated[key] : {};
    carried[key] = slice;
    input[key] = scopeSliceToPersistedShape(slice);
  }

  const systemId = trimmedString(system.id);
  const gatheringSlice = isPlainObject(migrated.gatheringConfig?.system)
    ? migrated.gatheringConfig.system
    : {};

  // Step 3: the shipped `1.30.0` transform over a synthesized one-system corpus.
  const result = migrateWorldScopeEntities({
    systems: [system],
    recipes: Array.isArray(migrated.recipes) ? migrated.recipes : [],
    gatheringConfig: systemId ? { systems: { [systemId]: gatheringSlice } } : { systems: {} },
    ...input,
  });

  // Step 3b: the shared `1.32.0` election, or a bundle exported between the two arrives
  // unswitched (issue 1371).
  migrateComponentEssenceSections({
    systems: [system],
    componentScope: result?.[SCOPE_PAYLOAD_KEYS.components],
  });

  let droppedToolBreakage = null;
  for (const entityType of SCOPE_ENTITY_TYPES) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    const payload = isPlainObject(result?.[key]) ? result[key] : carried[key];
    // Step 5: drop the whole extras spread, recording the authority so the import reports it.
    if (entityType === 'tools' && isPlainObject(payload?.toolBreakage)) {
      droppedToolBreakage = cloneJson(payload.toolBreakage);
    }
    // Step 4, through a fresh deep copy.
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
 * Schema 6: the shipped `1.34.0` merge, branch-independent and after
 * {@link deriveWorldScopeEntitySlices}. Unlike a `1.30.0` re-key map, this map is applied
 * (§ Migration of older exports requirement 12, issue 1654).
 */
function mergeEquivalentBundleEssences(migrated) {
  const system = migrated?.system;
  if (!isPlainObject(system)) return;

  const systemId = trimmedString(system.id);
  const gatheringSlice = isPlainObject(migrated.gatheringConfig?.system)
    ? migrated.gatheringConfig.system
    : {};

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

  // Adopted, each gated on the key being present: the corpus is synthesized.
  const mergedSystem = Array.isArray(result?.systems) ? result.systems[0] : null;
  if (isPlainObject(mergedSystem)) migrated.system = mergedSystem;
  if (Array.isArray(migrated.recipes) && Array.isArray(result?.recipes)) {
    migrated.recipes = result.recipes;
  }
  const mergedSlice = result?.gatheringConfig?.systems?.[systemId];
  if (isPlainObject(migrated.gatheringConfig?.system) && isPlainObject(mergedSlice)) {
    migrated.gatheringConfig.system = mergedSlice;
  }
  for (const entityType of ['essences', 'components']) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    if (!(key in migrated)) continue;
    migrated[key] = scopeSliceToEnvelopeShape(
      isPlainObject(result?.[key]) ? result[key] : migrated[key]
    );
  }

  // Carried, since a refusal must be reported.
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

/** Through `1.25.0`; a present key is never overwritten (issue 1098). */
function seedFailureResultPolicy(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applySeededFailureResultPolicy(system);
}

/**
 * Through `1.33.0`, so imported subject picks keep rolling. After
 * `liftCharacterLibrariesToWorldScope` and legacy-branch only, unlike every sibling
 * (§ Migration of older exports, § Round-trip integrity, issue 1608).
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

  // Current, but a bundle stamped current can predate any field-level upcast. Cloned.
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
    // Only the envelope shape; a world-setting-shaped object would persist as an empty slice.
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
