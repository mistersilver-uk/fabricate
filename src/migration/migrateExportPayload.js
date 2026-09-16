/**
 * Pure, Foundry-free, idempotent upcast of an export payload to the current schema, so it runs
 * before validation and in tests. `import-export/spec.md` § Migration of older exports owns the
 * ladder and every field-level rule. A payload ALREADY at the current schema is NOT a no-op: each
 * derivation below is written BRANCH-INDEPENDENTLY, and the one that is not says so and says why.
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

/**
 * Upcast legacy componentId-only Tools through the world-side `migrateToolsToFirstClass`. An
 * imported tool matches by raw source references until "Repair item data" stamps it (issue 561).
 */
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

/**
 * Strip the retired placeholder through the world-side `1.21.0` transform. Its counts are discarded:
 * the GM notice reports what a WORLD migration changed unasked, and an import is an act the GM
 * performed (issue 1094).
 */
function retireCraftingModToken(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applyRetireCraftingModToken(system);
}

/**
 * Lift the catalogue and rename the rule through the world-side `1.22.0` transform. It runs AFTER
 * `retireCraftingModToken` for SYMMETRY with the world ladder rather than necessity (issue 1095).
 */
function liftCheckModifierCatalogue(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applySystemCheckModifierCatalogue(system);
}

/**
 * Merge both modifier libraries through the world-side `1.23.0` transform. It runs AFTER
 * `liftCheckModifierCatalogue`, and here the ORDER IS OBSERVABLE: a pre-1.22.0 bundle holds its
 * catalogue at the old key and this reads only the new one, so running it first would merge an
 * empty catalogue and then retire it, dropping every check modifier in the bundle (issue 1117).
 */
function unifyModifierLibraries(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  const slice = migrated?.gatheringConfig?.system;
  const systemConfig = slice && typeof slice === 'object' && !Array.isArray(slice) ? slice : null;
  applyUnifiedModifierLibrary(system, systemConfig);
}

/** Seed the failure-result policy through `1.25.0`; a present key is never overwritten (issue 1098). */
/**
 * Lift a pre-1278 export's currency block to the envelope through the SAME function the world path
 * uses, so the two cannot drift.
 */
function liftCurrencyToWorldScope(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;

  const existing = migrated.currencyConfig;
  // Gate on the envelope carrying ANY world config, not UNITS: a schema-3 export whose world picked
  // the macro spend strategy before authoring a ladder has scalars and an empty `units`, and a
  // units-count guard would rebuild over it, discarding the strategy, provider and macro UUIDs.
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
  // Gate on ANY travel config, not on REALMS, for the currency lift's reason: a v4 export from a
  // world that chose `alwaysVisible` before authoring a realm has scalars and an empty `realms`,
  // and a realm-count guard would discard the reveal mode and modifier visibility the GM set.
  const alreadyLifted =
    existing &&
    typeof existing === 'object' &&
    !Array.isArray(existing) &&
    Object.keys(existing).length > 0;

  if (!alreadyLifted) {
    // `_collisions` is diagnostic output for the WORLD notice, which unions many systems. One
    // system cannot collide with another, so it is dropped rather than persisted.
    const { _collisions: _diagnostics, ...built } = buildWorldTravelConfig([system]);
    migrated.travelConfig = built;
  }
  migrated.system = stripSystemTravelConfig([system])[0];
}

/**
 * Lift a pre-1308 export's character libraries and drop the system's copies. Its guard is a TWO-LIST
 * DISJUNCTION for the world migration's reason: either populated library proves the lift ran.
 */
function liftCharacterLibrariesToWorldScope(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;

  const existing = migrated.characterLibraries;
  // NON-EMPTY, not merely present: `buildExportPayload` always emits the slice with both keys, so a
  // presence check would read every export as already lifted and then strip the system's copy.
  // Keying on the lists is safe only because this slice has NO scalars.
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

/**
 * Fold a pre-1315 bundle's manual force lists through the world-side `1.29.0` function ITSELF rather
 * than a mirror — which `import-export` requires, and which matters because `importReferenceResolver`
 * carries the force lists through import untouched (issue 1315).
 */
function foldManualCompositionForces(migrated, { clearAutomaticForces }) {
  const environments = migrated?.gatheringEnvironments;
  if (!Array.isArray(environments)) return;
  // The manual fold is unconditional: after 1315 a manual environment carrying a force list is
  // pre-1315 by construction. Clearing an AUTOMATIC one is not — the CURRENT-SCHEMA branch runs on
  // every payload forever, so clearing there would destroy a legitimate list on every round trip.
  migrated.gatheringEnvironments = applyManualCompositionForceFold(environments, {
    clearAutomaticForces,
  }).environments;
}

/** The three entity types the world-scope entity slices carry, in the shipped order. */
const SCOPE_ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/**
 * The transient diagnostics key `prepareForImport` reads. NOT PAYLOAD DATA: it carries one-time
 * facts about THIS upcast, so it is the one key on which `migrate(migrate(x))` may differ.
 */
export const WORLD_SCOPE_UPCAST_REPORT_KEY = '_worldScopeEntityReport';

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * STEP 2: re-key ONE envelope slice into the PERSISTED MAP SHAPE the shared transform reads, because
 * the failure it prevents is a SILENT DISCARD — that reader accepts those sub-keys through
 * `isPlainObject` only, which EXCLUDES the array projection the envelope carries.
 * THE KEY IS DERIVED FROM THE RECORD, never carried: nothing validates a map key against the record
 * it addresses, so a doubled separator would leave two records for one pair.
 */
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
 * rather than a second implementation (issue 1364).
 * IT IS NOT A LIFT, and there is no strip half: the in-system record stays AUTHORITATIVE while
 * `## CraftingSystem` requirement 36 holds, so stripping identity off `system.components` would
 * perform, through the import door, the shed the migration deferred — which blanks every screen in
 * the destination on the first save. The invariant is ONE-DIRECTIONAL: no KEY is REMOVED from any
 * in-system record and no value of a present key changes.
 * BRANCH-INDEPENDENT, and LAST on each branch, because the grouping reads a tool's own source
 * references, which a schema-1 payload lacks until `upcastLegacyTools` has run.
 * The shared transform's rewritten `systems`, `recipes` and `gatheringConfig` are DISCARDED, and
 * that discard is LOAD-BEARING: `groupIdentity` folds the source keys into `aliasItemUuids` even for
 * a singleton group, so adopting them would rewrite in-system identity through the import door.
 * STEP 5 assigns a fresh deep copy, because the transform answers the ORIGINAL object for an
 * unchanged key. The WORLD TOOL-BREAKAGE AUTHORITY is dropped HERE rather than by the export
 * assembler, because a HAND-EDITED payload never reaches the assembler.
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

  // STEP 3b — the `1.32.0` essence election over the same corpus, SHARED rather than reimplemented.
  // A bundle exported between the two carries membership records the `1.30.0` per-pair guard leaves
  // untouched, so without this they would arrive with no `inherit.essences` switch (issue 1371).
  migrateComponentEssenceSections({
    systems: [system],
    componentScope: result?.[SCOPE_PAYLOAD_KEYS.components],
  });

  let droppedToolBreakage = null;
  for (const entityType of SCOPE_ENTITY_TYPES) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    const payload = isPlainObject(result?.[key]) ? result[key] : carried[key];
    // STEP 5, first half — the DROP, of the whole extras spread rather than one named key, since
    // the three sub-keys are the entire travelling contract. The authority is recorded so the
    // import can report it rather than losing it silently.
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
 * pass itself. Requirement 12 requires it branch-independently and AFTER
 * {@link deriveWorldScopeEntitySlices}, because the world essences its key compares do not exist
 * until that has run.
 * Unlike a `1.30.0` re-key map, whatever this map says is APPLIED — a destination already at
 * `1.34.0` never re-runs the migration, so refusing would leave the duplicate forever, which is why
 * the re-keyed slices are adopted back. On a one-system corpus it changes nothing today, so the
 * pass is an observer and the refusal report is the payload (issue 1654).
 */
function mergeEquivalentBundleEssences(migrated) {
  const system = migrated?.system;
  if (!isPlainObject(system)) return;

  const systemId = trimmedString(system.id);
  const gatheringSlice = isPlainObject(migrated.gatheringConfig?.system)
    ? migrated.gatheringConfig.system
    : {};

  // The same map/array conversion, for the same reason: the shared pass reads `defaults` and
  // `membership` as maps only and silently ignores an array.
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

  // Adopted, not discarded: the shared pass answers the original object for an unchanged key.
  // Each assignment is gated on the key having been present, because the corpus handed in is
  // synthesized — an ungated write-back would ADD a key the bundle never carried, a shape change.
  const mergedSystem = Array.isArray(result?.systems) ? result.systems[0] : null;
  if (isPlainObject(mergedSystem)) migrated.system = mergedSystem;
  if (Array.isArray(migrated.recipes) && Array.isArray(result?.recipes)) {
    migrated.recipes = result.recipes;
  }
  const mergedSlice = result?.gatheringConfig?.systems?.[systemId];
  if (isPlainObject(migrated.gatheringConfig?.system) && isPlainObject(mergedSlice)) {
    migrated.gatheringConfig.system = mergedSlice;
  }
  // Step 4's helper, reused rather than respelled, and gated the same way — inert on the shipped
  // path, where the derivation above runs first and writes both keys unconditionally.
  for (const entityType of ['essences', 'components']) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    if (!(key in migrated)) continue;
    migrated[key] = scopeSliceToEnvelopeShape(
      isPlainObject(result?.[key]) ? result[key] : migrated[key]
    );
  }

  // Carried rather than dropped, on the derivation's rule: a refused group that produced no change
  // is indistinguishable from a bundle with nothing to merge unless it is reported.
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
 * world-side `1.33.0` transform. ORDERED AFTER `liftCharacterLibrariesToWorldScope`, load-bearing:
 * the transform intersects the seed with the world modifier catalogue, which on a pre-1308 bundle
 * exists only as the system's own copy until that lift has run.
 * LEGACY-BRANCH ONLY — the one divergence from every sibling, and deliberate. Its guard is a DATA
 * SHAPE issue 1608 turned into a legitimate ANSWER, so seeding on the current-schema branch would
 * re-seed a deliberately emptied mark on every round trip, breaking § Round-trip integrity.
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
    // Real schema-1 exports never carried gathering config. Lift a hand-authored
    // `system.gatheringConfig` ONLY when it matches the envelope shape (`{ system, shared }`); a
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
