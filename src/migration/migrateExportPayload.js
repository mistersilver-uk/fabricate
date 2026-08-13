/**
 * Pure, idempotent upcast of a Fabricate export payload to the current schema.
 *
 * A legacy export carries no `schemaVersion` and only `{ fabricateVersion,
 * system, recipes }`; it is treated as schema 1 and upcast to schema 2 by adding
 * the gathering-authoring fields and the envelope markers. The migrator is
 * idempotent: `migrate(migrate(v1))` deep-equals `migrate(v1)`, and `migrate(v2)`
 * is a no-op.
 *
 * Foundry-free (no globals) so it runs before validation/import and in tests.
 */

import { FABRICATE_EXPORT_SCHEMA_VERSION } from '../systems/authoringExport.js';

import { applyMaxModifierPicks } from './migrateMaxModifierPicks.js';
import { applyRetireCraftingModToken } from './migrateRetireCraftingModToken.js';
import { applySeededFailureResultPolicy } from './migrateSeedFailureResultPolicy.js';
import { applySystemCheckModifierCatalogue } from './migrateSystemCheckModifierCatalogue.js';
import { deriveToolSourceFromComponents } from './migrateToolsToFirstClass.js';
import { applyUnifiedModifierLibrary } from './migrateUnifyModifierLibraries.js';

/**
 * Upcast every legacy componentId-only Tool in an export payload's system to a first-class
 * tool carrying derived source refs + snapshot (issue 561, D10), mirroring the world-side
 * `migrateToolsToFirstClass`. The `ready`-body tool-flag stamp is version-gated per world so
 * it does not re-fire for a system imported AFTER it ran; an imported tool therefore matches
 * by raw source references (resolver tier 3) until a manual "Repair item data" stamps it,
 * exactly like imported components. Idempotent — a tool already carrying refs is untouched.
 * @private
 */
function upcastLegacyTools(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || !Array.isArray(system.tools)) return;
  const components = Array.isArray(system.components) ? system.components : [];
  for (const tool of system.tools) deriveToolSourceFromComponents(tool, components);
}

/**
 * Stamp `craftingCheck.maxModifierPicks = 1` onto an imported bundle whose system is on
 * the `playerPicks` combination rule and carries no cap (issue 1055), mirroring the
 * world-side 1.20.0 migration so an imported system behaves exactly like a migrated one
 * rather than silently arriving unbounded. An export bundle carries exactly one system, so
 * the shared per-system transform is applied directly with no grouping.
 *
 * THIS MUST STAY BRANCH-INDEPENDENT, exactly like `upcastLegacyTools` above and for the
 * same reason: `migrateExportPayload` returns early once `payload.schemaVersion` is already
 * current, and every bundle written by the shipping build carries the current schema. A
 * derivation reachable only from the legacy branch would therefore never run on a real
 * bundle. The cap is a NEW field on an OLD schema version, so its absence is orthogonal to
 * the envelope version and both branches must apply it.
 *
 * A bundle's `byRecipe` rule is left exactly as authored at both levels — it is a
 * first-class combination rule, not a legacy token — and so is an authored cap, which
 * makes this idempotent.
 * @private
 */
function deriveMaxModifierPicks(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applyMaxModifierPicks(system);
}

/**
 * Strip the retired check-modifier placeholder from an imported bundle's stored roll
 * formulas (issue 1094), mirroring the world-side 1.21.0 migration so an imported system
 * behaves exactly like a migrated one rather than arriving with a token that does nothing
 * and misleads the GM reading the field. An export bundle carries exactly one system, so
 * the shared per-system transform is applied directly with no grouping.
 *
 * BRANCH-INDEPENDENT for the same reason as its two siblings above: `migrateExportPayload`
 * returns early once `payload.schemaVersion` is already current, and every bundle written
 * by the shipping build carries the current schema, so a derivation reachable only from
 * the legacy branch would never run on a real bundle. The placeholder is an OLD field on
 * a CURRENT schema version, so its presence is orthogonal to the envelope version.
 *
 * The per-system counts are discarded here on purpose: the GM notice reports what a WORLD
 * migration changed under the GM's feet, whereas an import is an act the GM just performed
 * against a bundle they chose. Idempotent — a second pass finds no token.
 * @private
 */
function retireCraftingModToken(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applyRetireCraftingModToken(system);
}

/**
 * Lift an imported bundle's check-modifier catalogue out of `craftingCheck` up to the
 * system and rewrite its `byRecipe` rule to `bySubject` (issue 1095), mirroring the
 * world-side 1.22.0 migration so an imported system behaves exactly like a migrated one.
 * An export bundle carries exactly one system, so the shared per-system transform is
 * applied directly with no grouping.
 *
 * BRANCH-INDEPENDENT for the same reason as its three siblings above: `migrateExportPayload`
 * returns early once `payload.schemaVersion` is already current, and every bundle written
 * by the shipping build carries the current schema, so a derivation reachable only from
 * the legacy branch would never run on a real bundle. The catalogue's LOCATION is
 * orthogonal to the envelope version.
 *
 * THIS RUNS AFTER `retireCraftingModToken` FOR SYMMETRY WITH THE WORLD LADDER, not because
 * swapping the two would change this function's output. It is worth being exact about,
 * because the ordering claim is easy to over-state: `retireCraftingModToken` does read the
 * catalogue, but only to COUNT how many crafting formulas were inert for want of the
 * retired token — and those counts are discarded here on purpose (see its own note above),
 * so nothing observable depends on them. `countInertActiveCraftingCheck` additionally falls
 * back to the system-level key, so it reads the same catalogue either way. What the order
 * does buy is that these two transforms compose in the SAME sequence as `1.21.0` then
 * `1.22.0` on the world side, so a bundle and a world reach one state by one route.
 *
 * Idempotent — a bundle already carrying a system-level catalogue keeps it (the move is
 * guarded) and a second pass finds no legacy key.
 * @private
 */
function liftCheckModifierCatalogue(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applySystemCheckModifierCatalogue(system);
}

/**
 * Merge an imported bundle's two modifier libraries — the check-modifier catalogue on the
 * system and the gathering character-modifier library in the bundle's gathering slice —
 * into one `system.modifiers` (issue 1117), mirroring the world-side 1.23.0 migration so
 * an imported system behaves exactly like a migrated one. An export bundle carries exactly
 * one system and exactly one gathering-config slice, so the shared per-system transform is
 * applied directly with no grouping.
 *
 * BRANCH-INDEPENDENT for the reason all four siblings above are: `migrateExportPayload`
 * returns early once `payload.schemaVersion` is already current, and every bundle written
 * by the shipping build carries the current schema, so a derivation reachable only from
 * the legacy branch would never run on a real bundle. The libraries' LOCATION is orthogonal
 * to the envelope version.
 *
 * IT RUNS AFTER `liftCheckModifierCatalogue`, and here the ordering IS observable rather
 * than merely symmetrical: a pre-1.22.0 bundle carries its catalogue at
 * `craftingCheck.checkModifiers`, and this transform reads only the system-level key — so
 * running it first would merge an empty catalogue and then retire it, silently dropping
 * every check modifier in the bundle.
 *
 * The collision count is discarded here on purpose, for the reason
 * `retireCraftingModToken` discards its counts: the GM notice reports what a WORLD
 * migration changed under the GM's feet, whereas an import is an act the GM just performed
 * against a bundle they chose. Idempotent — a bundle already carrying `system.modifiers`
 * keeps it (the merge is guarded) and a second pass finds no legacy key.
 * @private
 */
function unifyModifierLibraries(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  const slice = migrated?.gatheringConfig?.system;
  const systemConfig = slice && typeof slice === 'object' && !Array.isArray(slice) ? slice : null;
  applyUnifiedModifierLibrary(system, systemConfig);
}

/**
 * Seed `failureResultPolicy: 'never'` onto an imported bundle's existing check blocks
 * (issue 1098), mirroring the world-side 1.25.0 migration so an imported system behaves
 * exactly like a migrated one rather than silently arriving on the permitting `perRecord`
 * default. An export bundle carries exactly one system, so the shared per-system transform
 * is applied directly with no grouping.
 *
 * BRANCH-INDEPENDENT for the reason all five siblings above are: `migrateExportPayload`
 * returns early once `payload.schemaVersion` is already current, and every bundle written
 * by the shipping build carries the current schema, so a derivation reachable only from
 * the legacy branch would never run on a real bundle. The policy is a NEW field on an OLD
 * schema version, so its absence is orthogonal to the envelope version.
 *
 * A bundle written by a post-1098 build already carries an authored policy on each check,
 * and the transform never overwrites a present key — which is exactly what stops an
 * export/import round trip from resetting a GM's `always` back to `never`.
 * @private
 */
function seedFailureResultPolicy(migrated) {
  const system = migrated?.system;
  if (!system || typeof system !== 'object' || Array.isArray(system)) return;
  applySeededFailureResultPolicy(system);
}

/**
 * @param {*} payload - Parsed export JSON of any prior schema
 * @returns {object} Upcast payload at the current schema version
 */
export function migrateExportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  // Already current — no-op for the schema envelope, but still run every field-level
  // upcast, because a schema-2 export can predate #561's first-class tool fields or
  // #1055's modifier pick cap. Clone so callers never alias the input.
  if (payload.schemaVersion === FABRICATE_EXPORT_SCHEMA_VERSION) {
    const current = structuredClone(payload);
    upcastLegacyTools(current);
    deriveMaxModifierPicks(current);
    retireCraftingModToken(current);
    liftCheckModifierCatalogue(current);
    unifyModifierLibraries(current);
    seedFailureResultPolicy(current);
    return current;
  }

  const migrated = structuredClone(payload);

  // Schema 1 → 2: introduce the explicit version marker + runtime boundary flag,
  // and default the gathering-authoring fields when absent. A hand-authored
  // `system.gatheringConfig` is read defensively as the source of truth.
  migrated.schemaVersion = FABRICATE_EXPORT_SCHEMA_VERSION;
  if (typeof migrated.runtimeStateIncluded !== 'boolean') {
    migrated.runtimeStateIncluded = false;
  }

  if (!Array.isArray(migrated.gatheringEnvironments)) {
    migrated.gatheringEnvironments = [];
  }

  if (!migrated.gatheringConfig || typeof migrated.gatheringConfig !== 'object') {
    // Real schema-1 exports never carried gathering config. Defensively lift a
    // hand-authored `system.gatheringConfig` ONLY when it already matches the
    // export envelope shape (`{ system, shared }`) that the importer expects; a
    // world-setting-shaped object (`{ systems, vocabularies, ... }`) would persist
    // as an empty slice, so it is ignored in favour of the empty default.
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

  return migrated;
}
